import { type Envelope, type Role, type Slot, fromB64, toB64, unlock, unwrapCk, wrapCk } from '../lib/crypto.ts'

/** PBKDF2 jobs (about a second each on a phone), kept off the main thread. */
export type WorkerRequest =
  | { type: 'unlock'; envelope: Envelope; pin: string }
  /** Wraps the content key for a new PIN, refusing a PIN that already opens `other`. */
  | { type: 'wrap'; ck: string; pin: string; iterations: number; other: Slot }

export type UnlockResult = { ck: string; role: Role } | null
export type WrapResult = { slot: Slot } | { error: 'same' }

export async function runJob(req: WorkerRequest): Promise<UnlockResult | WrapResult> {
  if (req.type === 'unlock') {
    const r = await unlock(req.envelope, req.pin)
    return r ? { ck: toB64(r.ck), role: r.role } : null
  }
  if (await unwrapCk(req.other, req.pin, req.iterations)) return { error: 'same' }
  const slot = await wrapCk(fromB64(req.ck), req.pin, req.iterations)
  // Round trip before handing it back: a slot that does not open would lock her out.
  const back = await unwrapCk(slot, req.pin, req.iterations)
  if (!back || toB64(back) !== req.ck) throw new Error('wrap self-check failed')
  return { slot }
}

// Only wire up message handling inside an actual worker.
if (typeof window === 'undefined' && typeof self !== 'undefined' && 'postMessage' in self) {
  self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    let out: { ok: true; value: UnlockResult | WrapResult } | { ok: false }
    try {
      out = { ok: true, value: await runJob(e.data) }
    } catch {
      out = { ok: false }
    }
    self.postMessage(out)
  }
}
