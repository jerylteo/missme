import type { Envelope, Slot } from '../lib/crypto.ts'
import type { UnlockResult, WorkerRequest, WrapResult } from './unlock.worker.ts'

/** Runs a PBKDF2 job in a Worker; falls back to the main thread if the worker cannot start. */
function run(req: WorkerRequest): Promise<UnlockResult | WrapResult> {
  const onMain = async () => {
    await new Promise((r) => setTimeout(r, 50)) // let the tap feedback paint first
    const { runJob } = await import('./unlock.worker.ts')
    return runJob(req)
  }
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./unlock.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      onMain().then(resolve, reject)
      return
    }
    worker.onmessage = (e: MessageEvent<{ ok: true; value: UnlockResult | WrapResult } | { ok: false }>) => {
      worker.terminate()
      if (e.data.ok) resolve(e.data.value)
      else reject(new Error('worker job failed'))
    }
    worker.onerror = () => {
      worker.terminate()
      onMain().then(resolve, reject)
    }
    worker.postMessage(req)
  })
}

export function unlockInWorker(envelope: Envelope, pin: string): Promise<UnlockResult> {
  return run({ type: 'unlock', envelope, pin }) as Promise<UnlockResult>
}

export function wrapInWorker(ck: string, pin: string, iterations: number, other: Slot): Promise<WrapResult> {
  return run({ type: 'wrap', ck, pin, iterations, other }) as Promise<WrapResult>
}
