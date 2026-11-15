import { describe, expect, it } from 'vitest'
import { type Content, type Message, type Rarity, normalizeContent, SURPRISE, validateContent } from './content.ts'
import { decryptContent, generateCk, isEnvelope, seal, unlock } from './crypto.ts'
import { draw, pool } from './draw.ts'
import { dayLabel, formatCountdown, gate, shortCountdown, spokenCountdown } from './limits.ts'
import { EMPTY_STATE, parseState, recordOpen, toggleFavourite } from './storage.ts'

const ITER = 1000 // fast KDF for tests; production uses 600,000

function msg(id: string, rarity: Rarity, categoryId = 'work'): Message {
  return { id, categoryId, rarity, text: `text ${id}`, photo: null, createdAt: '2026-11-15T12:00:00.000Z' }
}

const content: Content = normalizeContent({
  settings: { cooldownMinutes: 60, dailyLimit: 3, weights: { common: 6, rare: 3, secret: 1 }, nicknames: ['frufru'] },
  categories: [
    { id: 'work', label: 'At work' },
    { id: 'thinking', label: 'Thinking of you' },
  ],
  messages: [msg('a', 'common'), msg('b', 'rare'), msg('c', 'secret', 'thinking'), msg('d', 'common', 'thinking')],
})

describe('crypto', () => {
  const pins = { viewer: '123456', admin: '654321' }

  it('round-trips content and maps each PIN to its role', async () => {
    const env = await seal(content, pins, { iterations: ITER })
    expect(isEnvelope(env)).toBe(true)
    const v = await unlock(env, pins.viewer)
    const a = await unlock(env, pins.admin)
    expect(v?.role).toBe('viewer')
    expect(a?.role).toBe('admin')
    expect(await decryptContent(env, v!.ck)).toEqual(content)
    expect(await decryptContent(env, a!.ck)).toEqual(content)
  })

  it('rejects a wrong PIN and malformed PINs', async () => {
    const env = await seal(content, pins, { iterations: ITER })
    expect(await unlock(env, '000000')).toBeNull()
    expect(await unlock(env, '12345')).toBeNull()
    expect(await unlock(env, 'abcdef')).toBeNull()
  })

  it('refuses equal or non-6-digit PINs when sealing', async () => {
    await expect(seal(content, { viewer: '111111', admin: '111111' }, { iterations: ITER })).rejects.toThrow()
    await expect(seal(content, { viewer: '1234', admin: '654321' }, { iterations: ITER })).rejects.toThrow()
  })

  it('leaves no readable message text in the envelope', async () => {
    const env = await seal(content, pins, { iterations: ITER })
    const file = JSON.stringify(env)
    expect(file).not.toContain('text a')
    expect(file).not.toContain('At work')
    expect(file).not.toContain('frufru')
  })

  it('fails to decrypt with a different content key', async () => {
    const env = await seal(content, pins, { iterations: ITER })
    await expect(decryptContent(env, generateCk())).rejects.toThrow()
  })

  it('reuses a supplied content key', async () => {
    const ck = generateCk()
    const env = await seal(content, pins, { iterations: ITER, ck })
    const v = await unlock(env, pins.viewer)
    expect(Array.from(v!.ck)).toEqual(Array.from(ck))
  })
})

describe('draw', () => {
  it('respects rarity weights over 10,000 draws', () => {
    const candidates = [msg('c1', 'common'), msg('c2', 'common'), msg('r1', 'rare'), msg('s1', 'secret')]
    const counts: Record<Rarity, number> = { common: 0, rare: 0, secret: 0 }
    const N = 10_000
    for (let i = 0; i < N; i++) counts[draw(candidates, content.settings.weights)!.rarity]++
    // Expected 60 / 30 / 10 percent. Bounds are > 6 standard deviations wide.
    expect(counts.common / N).toBeGreaterThan(0.56)
    expect(counts.common / N).toBeLessThan(0.64)
    expect(counts.rare / N).toBeGreaterThan(0.26)
    expect(counts.rare / N).toBeLessThan(0.34)
    expect(counts.secret / N).toBeGreaterThan(0.075)
    expect(counts.secret / N).toBeLessThan(0.125)
  })

  it('never repeats a message and empties the pool exactly', () => {
    const opened = new Set<string>()
    for (let i = 0; i < content.messages.length; i++) {
      const m = draw(pool(content, opened, SURPRISE), content.settings.weights)!
      expect(opened.has(m.id)).toBe(false)
      opened.add(m.id)
    }
    expect(opened.size).toBe(content.messages.length)
    expect(draw(pool(content, opened, SURPRISE), content.settings.weights)).toBeNull()
  })

  it('filters the pool by category', () => {
    expect(pool(content, new Set(), 'thinking').map((m) => m.id)).toEqual(['c', 'd'])
    expect(pool(content, new Set(['c']), 'thinking').map((m) => m.id)).toEqual(['d'])
    expect(pool(content, new Set(), SURPRISE)).toHaveLength(4)
  })

  it('only draws tiers that still have messages, even at weight 0', () => {
    expect(draw([msg('s', 'secret')], content.settings.weights)!.id).toBe('s')
    expect(draw([msg('s', 'secret')], { common: 6, rare: 3, secret: 0 })!.id).toBe('s')
  })

  it('maps the random roll onto tiers in order', () => {
    const c = [msg('c1', 'common'), msg('r1', 'rare'), msg('s1', 'secret')]
    const w = content.settings.weights
    const fixed = (v: number) => () => v
    expect(draw(c, w, fixed(0))!.rarity).toBe('common')
    expect(draw(c, w, fixed(0.59))!.rarity).toBe('common')
    expect(draw(c, w, fixed(0.61))!.rarity).toBe('rare')
    expect(draw(c, w, fixed(0.91))!.rarity).toBe('secret')
    expect(draw(c, w, fixed(0.999999))!.rarity).toBe('secret')
  })
})

describe('limits', () => {
  const settings = { cooldownMinutes: 60, dailyLimit: 3 }
  const at = (h: number, m = 0, day = 15) => new Date(2026, 10, day, h, m)

  it('is ready with nothing opened', () => {
    expect(gate([], undefined, settings, at(9))).toEqual({ kind: 'ready', leftToday: 3 })
  })

  it('counts down after one open, then frees up', () => {
    const opened = [{ id: 'a', at: at(9).toISOString() }]
    const g = gate(opened, opened[0].at, settings, at(9, 18))
    expect(g).toEqual({ kind: 'cooldown', until: at(10).getTime(), leftToday: 2 })
    expect(gate(opened, opened[0].at, settings, at(10))).toEqual({ kind: 'ready', leftToday: 2 })
  })

  it('counts to local midnight after the daily cap, and resets the next day', () => {
    const opened = ['a', 'b', 'c'].map((id, i) => ({ id, at: at(9 + i * 2).toISOString() }))
    const last = opened[2].at
    expect(gate(opened, last, settings, at(13, 30))).toEqual({
      kind: 'daily',
      until: new Date(2026, 10, 16).getTime(),
      leftToday: 0,
    })
    // 14:30 is past the cooldown but the cap still holds.
    expect(gate(opened, last, settings, at(14, 30)).kind).toBe('daily')
    expect(gate(opened, last, settings, at(0, 1, 16))).toEqual({ kind: 'ready', leftToday: 3 })
  })

  it('still applies the cooldown across midnight', () => {
    const opened = [{ id: 'a', at: at(23, 40).toISOString() }]
    const g = gate(opened, opened[0].at, settings, at(0, 10, 16))
    expect(g.kind).toBe('cooldown')
    expect(g.leftToday).toBe(3)
  })

  it('ignores a last-open time in the future (clock moved back)', () => {
    expect(gate([], at(12).toISOString(), settings, at(9)).kind).toBe('ready')
  })

  it('formats countdowns', () => {
    expect(formatCountdown(42 * 60_000 + 18_000)).toBe('42:18')
    expect(formatCountdown(0)).toBe('00:00')
    expect(formatCountdown(-5)).toBe('00:00')
    expect(formatCountdown(3 * 3_600_000 + 5 * 60_000 + 9_000)).toBe('3:05:09')
    expect(formatCountdown(999)).toBe('00:01')
    expect(shortCountdown(59 * 60_000)).toBe('59 min')
    expect(shortCountdown(60 * 60_000 - 300)).toBe('59 min')
    expect(shortCountdown(60 * 60_000)).toBe('1 h')
    expect(shortCountdown(185 * 60_000)).toBe('3 h 5 min')
    expect(spokenCountdown(42 * 60_000)).toBe('about 42 minutes')
    expect(spokenCountdown(61 * 60_000)).toBe('about 1 hour 1 minute')
  })

  it('labels shelf days', () => {
    const now = at(9)
    expect(dayLabel(at(8).toISOString(), now)).toBe('Today')
    expect(dayLabel(at(23, 0, 14).toISOString(), now)).toBe('Yesterday')
    expect(dayLabel(at(9, 0, 12).toISOString(), now)).toBe('Thu')
    expect(dayLabel(at(9, 0, 3).toISOString(), now)).toBe('3 Nov')
  })
})

describe('storage', () => {
  it('records an open once and sets lastOpenAt', () => {
    const now = new Date(2026, 10, 15, 9)
    const s1 = recordOpen(EMPTY_STATE, 'a', now)
    expect(s1.opened).toEqual([{ id: 'a', at: now.toISOString() }])
    expect(s1.lastOpenAt).toBe(now.toISOString())
    expect(recordOpen(s1, 'a', new Date(2026, 10, 15, 10))).toBe(s1)
  })

  it('toggles favourites', () => {
    const s1 = toggleFavourite(EMPTY_STATE, 'a')
    expect(s1.favourites).toEqual(['a'])
    expect(toggleFavourite(s1, 'a').favourites).toEqual([])
  })

  it('survives a JSON round trip and tolerates junk', () => {
    const s = toggleFavourite(recordOpen({ ...EMPTY_STATE, session: { ck: 'x', role: 'viewer' } }, 'a', new Date()), 'a')
    expect(parseState(JSON.stringify(s))).toEqual(s)
    expect(parseState('not json')).toEqual(EMPTY_STATE)
    expect(parseState(null)).toEqual(EMPTY_STATE)
    expect(parseState('{"opened":[{"id":1}],"favourites":"x","session":{"ck":"k","role":"root"}}')).toEqual({
      ...EMPTY_STATE,
      session: undefined,
      lastOpenAt: undefined,
    })
  })
})

describe('content', () => {
  it('drops malformed rows and fills defaults', () => {
    const c = normalizeContent({
      categories: [{ id: 'work', label: 'At work' }],
      messages: [msg('a', 'common'), msg('a', 'rare'), msg('z', 'common', 'nope'), { id: 'e', text: '' }],
    })
    expect(c.messages.map((m) => m.id)).toEqual(['a'])
    expect(c.settings.dailyLimit).toBe(3)
    expect(c.settings.weights).toEqual({ common: 6, rare: 3, secret: 1 })
  })

  it('reports seal-blocking problems', () => {
    expect(validateContent(content)).toEqual([])
    const errs = validateContent({
      categories: [{ id: 'work', label: 'At work' }],
      messages: [msg('a', 'common'), msg('a', 'common'), msg('b', 'common', 'nope')],
    })
    expect(errs).toHaveLength(2)
  })
})
