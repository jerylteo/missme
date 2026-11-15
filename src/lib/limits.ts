import type { Settings } from './content.ts'

export interface OpenedEntry {
  id: string
  at: string
}

export type Gate =
  | { kind: 'ready'; leftToday: number }
  | { kind: 'cooldown'; until: number; leftToday: number }
  | { kind: 'daily'; until: number; leftToday: 0 }

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function openedToday(opened: OpenedEntry[], now: Date): number {
  return opened.filter((o) => sameLocalDay(new Date(o.at), now)).length
}

export function nextLocalMidnight(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
}

/** Whether a box may be opened now. The daily cap outranks the cooldown (spec 6.3). */
export function gate(
  opened: OpenedEntry[],
  lastOpenAt: string | undefined,
  settings: Pick<Settings, 'cooldownMinutes' | 'dailyLimit'>,
  now: Date,
): Gate {
  const leftToday = Math.max(0, settings.dailyLimit - openedToday(opened, now))
  if (leftToday === 0) return { kind: 'daily', until: nextLocalMidnight(now), leftToday: 0 }
  if (lastOpenAt) {
    const last = new Date(lastOpenAt).getTime()
    const until = last + settings.cooldownMinutes * 60_000
    // A clock set backwards must not lock her out for longer than one cooldown.
    if (Number.isFinite(last) && last <= now.getTime() && until > now.getTime()) {
      return { kind: 'cooldown', until, leftToday }
    }
  }
  return { kind: 'ready', leftToday }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** mm:ss under an hour, h:mm:ss above. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** Spoken form, minute precision: "about 42 minutes", "about 3 hours 5 minutes". */
export function spokenCountdown(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60_000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const parts: string[] = []
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`)
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`)
  return `about ${parts.join(' ')}`
}

/** Short form for the reveal footer: "59 min", "3 h 5 min". */
export function shortCountdown(ms: number): string {
  // Rounds down so a fresh 60-minute wait reads "59 min", never "1 h".
  const mins = Math.max(1, Math.floor(ms / 60_000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

/** Shelf date label: Today, Yesterday, weekday within a week, else "3 Nov". */
export function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
