import { type Envelope, toB64, unlock } from '../lib/crypto.ts'

export interface UnlockRequest {
  envelope: Envelope
  pin: string
}

export type UnlockResponse = { ck: string; role: 'viewer' | 'admin' } | null

self.onmessage = async (e: MessageEvent<UnlockRequest>) => {
  let out: UnlockResponse = null
  try {
    const r = await unlock(e.data.envelope, e.data.pin)
    if (r) out = { ck: toB64(r.ck), role: r.role }
  } catch {
    out = null
  }
  self.postMessage(out)
}
