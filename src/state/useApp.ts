import { useCallback, useEffect, useRef, useState } from 'react'
import { type Content, normalizeContent } from '../lib/content.ts'
import { decryptContent, type Envelope, fromB64, isEnvelope, type Role, toB64, unlock } from '../lib/crypto.ts'
import { EMPTY_STATE, loadState, type LocalState, saveState } from '../lib/storage.ts'
import type { UnlockRequest, UnlockResponse } from '../workers/unlock.worker.ts'

export type Status = 'boot' | 'error' | 'lock' | 'ready'

const CONTENT_URL = `${import.meta.env.BASE_URL}data/content.enc.json`

/** PBKDF2 off the main thread; falls back to the main thread if the worker cannot start. */
function unlockInWorker(envelope: Envelope, pin: string): Promise<UnlockResponse> {
  const onMain = async (): Promise<UnlockResponse> => {
    await new Promise((r) => setTimeout(r, 50)) // let the tap feedback paint first
    const r = await unlock(envelope, pin)
    return r ? { ck: toB64(r.ck), role: r.role } : null
  }
  return new Promise((resolve) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('../workers/unlock.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      resolve(onMain())
      return
    }
    worker.onmessage = (e: MessageEvent<UnlockResponse>) => {
      worker.terminate()
      resolve(e.data)
    }
    worker.onerror = () => {
      worker.terminate()
      resolve(onMain())
    }
    worker.postMessage({ envelope, pin } satisfies UnlockRequest)
  })
}

export function useApp() {
  const [local, setLocalState] = useState<LocalState>(loadState)
  const [status, setStatus] = useState<Status>('boot')
  const [content, setContent] = useState<Content | null>(null)
  const [checking, setChecking] = useState(false)
  const [wrongCount, setWrongCount] = useState(0)

  const localRef = useRef(local)
  const envelopeRef = useRef<Envelope | null>(null)
  const loadingRef = useRef(false)

  const setLocal = useCallback((next: LocalState) => {
    localRef.current = next
    saveState(next)
    setLocalState(next)
  }, [])

  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      let env: unknown
      try {
        const res = await fetch(CONTENT_URL, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        env = await res.json()
        if (!isEnvelope(env)) throw new Error('bad envelope')
      } catch {
        // A failed refresh keeps whatever is already on screen.
        if (!envelopeRef.current) setStatus('error')
        return
      }
      envelopeRef.current = env
      const session = localRef.current.session
      if (!session) {
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
    } finally {
      loadingRef.current = false
    }
  }, [setLocal])

  useEffect(() => {
    // Fetch-on-mount: state is only set after the network round trip resolves.
    // oxlint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

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
    setLocal({ ...localRef.current, session: undefined })
    setContent(null)
    setStatus('lock')
  }, [setLocal])

  const resetProgress = useCallback(() => {
    setLocal({ ...EMPTY_STATE, session: localRef.current.session })
  }, [setLocal])

  const role: Role | undefined = local.session?.role

  return { status, content, local, localRef, setLocal, role, checking, wrongCount, submitPin, retry, lock, resetProgress }
}
