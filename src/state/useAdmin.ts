import { useCallback, useEffect, useRef, useState } from 'react'
import { applyChanges, changeCount, type Drafts } from '../lib/admin.ts'
import { type Content, normalizeContent } from '../lib/content.ts'
import {
  decryptContent,
  encryptContent,
  type Envelope,
  fromB64,
  isEnvelope,
  KDF_ITERATIONS,
  type Role,
  type Slot,
} from '../lib/crypto.ts'
import { getFile, GhError, putFile } from '../lib/github.ts'

/** Drafts survive a reload (spec 11.4), encrypted with the content key so a locked device shows nothing. */
const DRAFTS_KEY = 'missme:drafts'

function isSlot(x: unknown): x is Slot {
  const s = x as Slot | null
  return !!s && typeof s.salt === 'string' && typeof s.iv === 'string' && typeof s.wrapped === 'string'
}

async function readDrafts(ck: Uint8Array<ArrayBuffer>): Promise<Drafts | null> {
  try {
    const blob = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? 'null') as { iv?: unknown; data?: unknown } | null
    if (!blob || typeof blob.iv !== 'string' || typeof blob.data !== 'string') return null
    const raw = await decryptContent<{ base?: unknown; draft?: unknown; slots?: Record<string, unknown> }>(
      { iv: blob.iv, data: blob.data },
      ck,
    )
    const slots: Drafts['slots'] = {}
    for (const role of ['viewer', 'admin'] as const) if (isSlot(raw.slots?.[role])) slots[role] = raw.slots[role] as Slot
    return { base: normalizeContent(raw.base), draft: normalizeContent(raw.draft), slots }
  } catch {
    return null
  }
}

function fresh(live: Content): Drafts {
  return { base: live, draft: live, slots: {} }
}

export class PublishError extends Error {}

export function useAdmin({
  live,
  ck,
  applyPublished,
}: {
  live: Content
  ck: string
  applyPublished: (env: Envelope, content: Content) => void
}) {
  const [drafts, setDraftsState] = useState<Drafts | null>(null)
  const draftsRef = useRef<Drafts | null>(null)
  const writeSeq = useRef(0)
  const key = useRef(fromB64(ck))

  const persist = useCallback((d: Drafts) => {
    const seq = ++writeSeq.current
    if (changeCount(d) === 0) {
      try {
        localStorage.removeItem(DRAFTS_KEY)
      } catch {
        // optional
      }
      return
    }
    void encryptContent(d, key.current).then((blob) => {
      if (seq !== writeSeq.current) return // a newer write is on its way
      try {
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(blob))
      } catch {
        // full or private mode: drafts stay in memory only
      }
    })
  }, [])

  const setDrafts = useCallback(
    (d: Drafts) => {
      draftsRef.current = d
      setDraftsState(d)
      persist(d)
    },
    [persist],
  )

  // Restore saved drafts once.
  useEffect(() => {
    let alive = true
    void readDrafts(key.current).then((saved) => {
      if (!alive) return
      const d = saved ?? fresh(live)
      draftsRef.current = d
      setDraftsState(d)
    })
    return () => {
      alive = false
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs once; later `live` changes are handled below
  }, [])

  // With nothing pending, follow the live file.
  useEffect(() => {
    const d = draftsRef.current
    if (d && changeCount(d) === 0 && d.base !== live) {
      const next = fresh(live)
      draftsRef.current = next
      // oxlint-disable-next-line react-hooks/set-state-in-effect -- mirrors an external value
      setDraftsState(next)
    }
  }, [live])

  const edit = useCallback(
    (fn: (draft: Content) => Content) => {
      const d = draftsRef.current
      if (d) setDrafts({ ...d, draft: fn(d.draft) })
    },
    [setDrafts],
  )

  const setSlot = useCallback(
    (role: Role, slot: Slot) => {
      const d = draftsRef.current
      if (d) setDrafts({ ...d, slots: { ...d.slots, [role]: slot } })
    },
    [setDrafts],
  )

  const discard = useCallback(() => setDrafts(fresh(live)), [live, setDrafts])

  /** Lays the drafts onto the file that is live on GitHub right now and commits it. */
  const publish = useCallback(
    async (token: string): Promise<void> => {
      const d = draftsRef.current
      if (!d) return
      const n = changeCount(d)
      for (let attempt = 0; ; attempt++) {
        const { sha, text } = await getFile(token)
        let remoteEnv: unknown
        try {
          remoteEnv = JSON.parse(text)
        } catch {
          remoteEnv = null
        }
        if (!isEnvelope(remoteEnv)) throw new PublishError('The live file is damaged. Re-seal it from the laptop.')
        let remote: Content
        try {
          remote = normalizeContent(await decryptContent(remoteEnv, key.current))
        } catch {
          throw new PublishError('The live file was re-sealed with a new key. Lock this device, unlock again, then publish.')
        }
        if ((d.slots.viewer || d.slots.admin) && remoteEnv.kdf.iterations !== KDF_ITERATIONS) {
          throw new PublishError('The live file uses different PIN settings. Change the PIN from the laptop instead.')
        }
        const merged = applyChanges(remote, d)
        const { iv, data } = await encryptContent(merged, key.current)
        const env: Envelope = {
          v: 1,
          kdf: remoteEnv.kdf,
          slots: { viewer: d.slots.viewer ?? remoteEnv.slots.viewer, admin: d.slots.admin ?? remoteEnv.slots.admin },
          iv,
          data,
        }
        // Self-check before upload: it opens with the key and hides the text.
        const back = await decryptContent(env, key.current)
        if (JSON.stringify(back) !== JSON.stringify(merged)) throw new PublishError('Self-check failed. Nothing was published.')
        const file = JSON.stringify(env)
        for (const m of merged.messages) {
          const probe = m.text.slice(0, 12)
          if (probe.length >= 6 && file.includes(probe)) throw new PublishError('Self-check failed. Nothing was published.')
        }
        try {
          await putFile(token, file + '\n', sha, `Publish ${n} ${n === 1 ? 'change' : 'changes'}`)
        } catch (e) {
          if (e instanceof GhError && e.kind === 'conflict' && attempt === 0) continue
          throw e
        }
        applyPublished(env, merged)
        setDrafts(fresh(merged))
        return
      }
    },
    [applyPublished, setDrafts],
  )

  return { drafts, edit, setSlot, discard, publish }
}
