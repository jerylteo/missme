// Shared by the app (browser) and scripts/seal.mjs (Node, via globalThis.crypto).
// Keep this file dependency-free and free of non-erasable TypeScript syntax.

export const KDF_ITERATIONS = 600_000

export type Role = 'viewer' | 'admin'

export interface Slot {
  salt: string
  iv: string
  wrapped: string
}

export interface Envelope {
  v: 1
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number }
  slots: { viewer: Slot; admin: Slot }
  iv: string
  data: string
}

const subtle = globalThis.crypto.subtle
const enc = new TextEncoder()
const dec = new TextDecoder()

export function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

export function isPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function generateCk(): Uint8Array<ArrayBuffer> {
  return randomBytes(32)
}

export async function wrapCk(ck: Uint8Array<ArrayBuffer>, pin: string, iterations = KDF_ITERATIONS): Promise<Slot> {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveKey(pin, salt, iterations)
  const wrapped = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, ck))
  return { salt: toB64(salt), iv: toB64(iv), wrapped: toB64(wrapped) }
}

/** Returns the raw content key, or null when the PIN does not open this slot. */
export async function unwrapCk(slot: Slot, pin: string, iterations: number): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const key = await deriveKey(pin, fromB64(slot.salt), iterations)
    const raw = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(slot.iv) }, key, fromB64(slot.wrapped))
    return new Uint8Array(raw)
  } catch {
    return null
  }
}

/** Tries the viewer slot, then the admin slot. */
export async function unlock(
  envelope: Envelope,
  pin: string,
): Promise<{ ck: Uint8Array<ArrayBuffer>; role: Role } | null> {
  if (!isPin(pin)) return null
  const iterations = envelope.kdf.iterations
  const viewer = await unwrapCk(envelope.slots.viewer, pin, iterations)
  if (viewer) return { ck: viewer, role: 'viewer' }
  const admin = await unwrapCk(envelope.slots.admin, pin, iterations)
  if (admin) return { ck: admin, role: 'admin' }
  return null
}

async function importCk(ck: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return subtle.importKey('raw', ck, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** Decrypts the envelope payload. Throws when the key is wrong or the data was altered. */
export async function decryptContent<T = unknown>(envelope: Pick<Envelope, 'iv' | 'data'>, ck: Uint8Array<ArrayBuffer>): Promise<T> {
  const key = await importCk(ck)
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(envelope.iv) }, key, fromB64(envelope.data))
  return JSON.parse(dec.decode(plain)) as T
}

/** Encrypts the payload with an existing content key (fresh IV each time). */
export async function encryptContent(content: unknown, ck: Uint8Array<ArrayBuffer>): Promise<{ iv: string; data: string }> {
  const key = await importCk(ck)
  const iv = randomBytes(12)
  const data = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(content))))
  return { iv: toB64(iv), data: toB64(data) }
}

export async function seal(
  content: unknown,
  pins: { viewer: string; admin: string },
  opts: { ck?: Uint8Array<ArrayBuffer>; iterations?: number } = {},
): Promise<Envelope> {
  if (!isPin(pins.viewer) || !isPin(pins.admin)) throw new Error('Both PINs must be exactly 6 digits.')
  if (pins.viewer === pins.admin) throw new Error('The two PINs must differ.')
  const iterations = opts.iterations ?? KDF_ITERATIONS
  const ck = opts.ck ?? generateCk()
  const { iv, data } = await encryptContent(content, ck)
  const [viewer, admin] = await Promise.all([wrapCk(ck, pins.viewer, iterations), wrapCk(ck, pins.admin, iterations)])
  return { v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations }, slots: { viewer, admin }, iv, data }
}

export function isEnvelope(x: unknown): x is Envelope {
  const e = x as Envelope | null
  return !!e && e.v === 1 && !!e.kdf && !!e.slots?.viewer && !!e.slots?.admin && typeof e.iv === 'string' && typeof e.data === 'string'
}
