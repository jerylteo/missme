import { useCallback, useEffect, useRef, useState } from 'react'
import { type Content, normalizeContent } from '../lib/content.ts'
import { decryptContent, type Envelope, fromB64, isEnvelope, type Role } from '../lib/crypto.ts'
import { clearToken, EMPTY_STATE, loadState, type LocalState, readStored, saveState, STORAGE_KEY } from '../lib/storage.ts'
import { unlockInWorker } from '../workers/client.ts'

export type Status = 'boot' | 'error' | 'lock' | 'ready'

const CONTENT_URL = `${import.meta.env.BASE_URL}data/content.enc.json`
/** Last envelope that loaded, so the shelf still opens offline. It is ciphertext only. */
const ENVELOPE_CACHE_KEY = 'missme:envelope'
/** After a publish, Pages serves the old file for a minute or two: ignore it meanwhile. */
const PUBLISH_GRACE_MS = 10 * 60_000

function cacheEnvelope(env: Envelope): void {
  try {
    localStorage.setItem(ENVELOPE_CACHE_KEY, JSON.stringify(env))
  } catch {
    // optional
  }
}

function cachedEnvelope(): Envelope | null {
  try {
    const x: unknown = JSON.parse(localStorage.getItem(ENVELOPE_CACHE_KEY) ?? 'null')
    return isEnvelope(x) ? x : null
  } catch {
    return null
  }
}

async function fetchEnvelope(): Promise<Envelope> {
  // The query string gets past the 10-minute CDN cache; no-store gets past the browser's.
  const res = await fetch(`${CONTENT_URL}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(String(res.status))
  const env: unknown = await res.json()
  if (!isEnvelope(env)) throw new Error('bad envelope')
  return env
}

export function useApp() {
  const [local, setLocalState] = useState<LocalState>(loadState)
  const [status, setStatus] = useState<Status>('boot')
  const [content, setContent] = useState<Content | null>(null)
  const [checking, setChecking] = useState(false)
  const [wrongCount, setWrongCount] = useState(0)

  const localRef = useRef(local)
  const statusRef = useRef(status)
  useEffect(() => {
    statusRef.current = status
  }, [status])
  const envelopeRef = useRef<Envelope | null>(null)
  const loadingRef = useRef(false)
  const publishedRef = useRef<{ data: string; until: number } | null>(null)

  const setLocal = useCallback((next: LocalState) => {
    localRef.current = next
    saveState(next)
    setLocalState(next)
  }, [])

  /** Picks up changes written by another tab or window. Returns the freshest state. */
  const sync = useCallback((): LocalState => {
    const stored = readStored()
    if (stored && JSON.stringify(stored) !== JSON.stringify(localRef.current)) {
      localRef.current = stored
      setLocalState(stored)
    }
    return localRef.current
  }, [])

  /** Opens `env` with the stored session, or shows the lock screen. */
  const open = useCallback(
    async (env: Envelope) => {
      envelopeRef.current = env
      const session = localRef.current.session
      if (!session) {
        setContent(null)
        setStatus('lock')
        return
      }
      try {
        setContent(normalizeContent(await decryptContent(env, fromB64(session.ck))))
        setStatus('ready')
      } catch {
        // Key or PINs were rotated: ask again.
        setLocal({ ...localRef.current, session: undefined })
        setContent(null)
        setStatus('lock')
      }
    },
    [setLocal],
  )

  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      let env: Envelope
      try {
        env = await fetchEnvelope()
      } catch {
        if (envelopeRef.current) return // a failed refresh keeps whatever is on screen
        const cached = cachedEnvelope()
        if (!cached) {
          setStatus('error')
          return
        }
        env = cached
      }
      const pub = publishedRef.current
      if (pub) {
        if (env.data === pub.data || Date.now() > pub.until) publishedRef.current = null
        else return // Pages still has the file from before the publish
      }
      cacheEnvelope(env)
      await open(env)
    } finally {
      loadingRef.current = false
    }
  }, [open])

  useEffect(() => {
    // Fetch-on-mount: state is only set after the network round trip resolves.
    // oxlint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      sync()
      void load()
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== STORAGE_KEY) return
      const had = !!localRef.current.session
      const now = sync()
      // Locked or unlocked in another tab: follow it.
      if (had && !now.session && statusRef.current === 'ready') {
        setContent(null)
        setStatus('lock')
      } else if (!had && now.session && statusRef.current === 'lock' && envelopeRef.current) {
        void open(envelopeRef.current)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('storage', onStorage)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', onStorage)
    }
  }, [load, open, sync])

  const retry = useCallback(() => {
    setStatus('boot')
    void load()
  }, [load])

  const submitPin = useCallback(
    async (pin: string) => {
      const env = envelopeRef.current
      if (!env || checking) return
      setChecking(true)
      try {
        const result = await unlockInWorker(env, pin)
        if (!result) {
          setWrongCount((n) => n + 1)
          return
        }
        const next = normalizeContent(await decryptContent(env, fromB64(result.ck)))
        setLocal({ ...localRef.current, session: { ck: result.ck, role: result.role } })
        setContent(next)
        setStatus('ready')
      } catch {
        setWrongCount((n) => n + 1)
      } finally {
        setChecking(false)
      }
    },
    [checking, setLocal],
  )

  const lock = useCallback(() => {
    clearToken() // locking signs this device out of publishing too
    setLocal({ ...localRef.current, session: undefined })
    setContent(null)
    setStatus('lock')
  }, [setLocal])

  const resetProgress = useCallback(() => {
    setLocal({ ...EMPTY_STATE, session: localRef.current.session })
  }, [setLocal])

  /** Shows a just-published file right away instead of waiting for Pages to rebuild. */
  const applyPublished = useCallback((env: Envelope, next: Content) => {
    publishedRef.current = { data: env.data, until: Date.now() + PUBLISH_GRACE_MS }
    envelopeRef.current = env
    cacheEnvelope(env)
    setContent(next)
  }, [])

  const role: Role | undefined = local.session?.role

  return {
    status,
    content,
    local,
    localRef,
    envelopeRef,
    setLocal,
    sync,
    role,
    checking,
    wrongCount,
    submitPin,
    retry,
    lock,
    resetProgress,
    applyPublished,
  }
}
