import type { Role } from './crypto.ts'
import type { OpenedEntry } from './limits.ts'

export const STORAGE_KEY = 'missme:v1'

export interface Session {
  ck: string
  role: Role
}

export interface LocalState {
  session?: Session
  opened: OpenedEntry[]
  favourites: string[]
  lastOpenAt?: string
}

export const EMPTY_STATE: LocalState = { opened: [], favourites: [] }

export function parseState(raw: string | null): LocalState {
  if (!raw) return { ...EMPTY_STATE }
  try {
    const x = JSON.parse(raw) as Partial<LocalState>
    const opened = Array.isArray(x.opened)
      ? x.opened.filter((o): o is OpenedEntry => !!o && typeof o.id === 'string' && typeof o.at === 'string')
      : []
    const favourites = Array.isArray(x.favourites) ? x.favourites.filter((f) => typeof f === 'string') : []
    const s = x.session
    const session =
      s && typeof s.ck === 'string' && (s.role === 'viewer' || s.role === 'admin') ? { ck: s.ck, role: s.role } : undefined
    return {
      session,
      opened,
      favourites,
      lastOpenAt: typeof x.lastOpenAt === 'string' ? x.lastOpenAt : undefined,
    }
  } catch {
    return { ...EMPTY_STATE }
  }
}

export function loadState(): LocalState {
  try {
    return parseState(localStorage.getItem(STORAGE_KEY))
  } catch {
    return { ...EMPTY_STATE }
  }
}

/** Returns false when the write failed (private mode, quota). */
export function saveState(state: LocalState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

/** Pure transition: mark a message opened at `now`. No-op when already opened. */
export function recordOpen(state: LocalState, id: string, now: Date): LocalState {
  if (state.opened.some((o) => o.id === id)) return state
  const at = now.toISOString()
  return { ...state, opened: [...state.opened, { id, at }], lastOpenAt: at }
}

export function toggleFavourite(state: LocalState, id: string): LocalState {
  const has = state.favourites.includes(id)
  return { ...state, favourites: has ? state.favourites.filter((f) => f !== id) : [...state.favourites, id] }
}
