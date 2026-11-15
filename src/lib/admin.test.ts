import { describe, expect, it } from 'vitest'
import { runJob } from '../workers/unlock.worker.ts'
import { applyChanges, changeCount, deleteMessage, type Drafts, messageFlags, newCategoryId, newMessage, upsertMessage } from './admin.ts'
import { type Content, type Message, normalizeContent } from './content.ts'
import { decryptContent, encryptContent, generateCk, seal, toB64, unlock, unwrapCk } from './crypto.ts'
import { getFile, GhError, putFile } from './github.ts'

const ITER = 1000

function msg(id: string, text = `text ${id}`, categoryId = 'work'): Message {
  return { id, categoryId, rarity: 'common', text, photo: null, createdAt: '2026-11-15T12:00:00.000Z' }
}

const base: Content = normalizeContent({
  settings: { cooldownMinutes: 60, dailyLimit: 3, weights: { common: 6, rare: 3, secret: 1 }, nicknames: ['frufru'] },
  categories: [
    { id: 'work', label: 'At work' },
    { id: 'thinking', label: 'Thinking of you' },
  ],
  messages: [msg('a'), msg('b'), msg('c', 'text c', 'thinking')],
})

function drafts(draft: Content, slots: Drafts['slots'] = {}): Drafts {
  return { base, draft, slots }
}

describe('admin changes', () => {
  it('counts nothing for untouched drafts', () => {
    expect(changeCount(drafts(base))).toBe(0)
  })

  it('flags new and edited messages and counts deletes, categories, settings and PINs', () => {
    let d = upsertMessage(base, msg('a', 'changed'))
    d = upsertMessage(d, msg('n', 'brand new'))
    d = deleteMessage(d, 'b')
    d = { ...d, categories: d.categories.map((c) => (c.id === 'work' ? { ...c, label: 'Work' } : c)) }
    d = { ...d, settings: { ...d.settings, dailyLimit: 5 } }
    const dr = drafts(d, { viewer: { salt: 's', iv: 'i', wrapped: 'w' } })
    expect([...messageFlags(dr)]).toEqual([
      ['a', 'edited'],
      ['n', 'new'],
    ])
    expect(changeCount(dr)).toBe(2 + 1 + 1 + 1 + 1)
  })

  it('lays the drafts onto a remote that changed elsewhere', () => {
    // Elsewhere (laptop seal): c edited, r added, cooldown changed.
    const remote: Content = {
      ...base,
      settings: { ...base.settings, cooldownMinutes: 30 },
      messages: [msg('a'), msg('b'), msg('c', 'laptop edit', 'thinking'), msg('r', 'from laptop')],
    }
    // Here: a edited, b deleted, n added, daily limit changed.
    let d = upsertMessage(base, msg('a', 'phone edit'))
    d = deleteMessage(d, 'b')
    d = upsertMessage(d, msg('n', 'phone new'))
    d = { ...d, settings: { ...d.settings, dailyLimit: 5 } }
    const out = applyChanges(remote, drafts(d))
    expect(out.messages.map((m) => [m.id, m.text])).toEqual([
      ['a', 'phone edit'],
      ['c', 'laptop edit'],
      ['r', 'from laptop'],
      ['n', 'phone new'],
    ])
    expect(out.settings.cooldownMinutes).toBe(30)
    expect(out.settings.dailyLimit).toBe(5)
  })

  it('keeps a deleted category that a message elsewhere still uses', () => {
    const d = { ...base, categories: base.categories.filter((c) => c.id !== 'thinking'), messages: base.messages.filter((m) => m.id !== 'c') }
    const remote = { ...base, messages: [...base.messages, msg('x', 'new elsewhere', 'thinking')] }
    const out = applyChanges(remote, drafts(d))
    expect(out.categories.map((c) => c.id)).toEqual(['work', 'thinking'])
    expect(normalizeContent(out).messages.map((m) => m.id)).toEqual(['a', 'b', 'x'])
  })

  it('makes unique ids', () => {
    const id = newCategoryId('Late nights!', new Set())
    expect(id).toMatch(/^late-nights-[a-z0-9]{1,4}$/)
    const m = newMessage({ text: 'hi', categoryId: 'work', rarity: 'rare' }, new Date('2026-11-16T00:00:00Z'))
    expect(m.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(m.photo).toBeNull()
  })

  it('keeps a category that was deleted remotely while a drafted message still uses it', () => {
    const d = upsertMessage(base, msg('n', 'brand new', 'thinking'))
    const remote: Content = { ...base, categories: base.categories.filter((c) => c.id !== 'thinking'), messages: base.messages.filter((m) => m.id !== 'c') }
    const out = applyChanges(remote, drafts(d))
    expect(out.categories.map((c) => c.id)).toEqual(['work', 'thinking'])
    expect(normalizeContent(out).messages.map((m) => m.id)).toContain('n')
  })

  it('rebases edits made during a publish onto what went out', () => {
    const sent = upsertMessage(base, msg('n', 'brand new'))
    const merged = applyChanges(base, drafts(sent))
    const later = deleteMessage(upsertMessage(sent, msg('z', 'typed while publishing')), 'a')
    const next = applyChanges(merged, { base: sent, draft: later })
    expect(next.messages.map((m) => m.id)).toEqual(['b', 'c', 'n', 'z'])
    expect(changeCount({ base: merged, draft: next, slots: {} })).toBe(2)
  })
})

describe('crypto for publishing', () => {
  it('re-encrypts with the same key so unlocked devices stay unlocked', async () => {
    const env = await seal(base, { viewer: '123456', admin: '654321' }, { iterations: ITER })
    const ck = (await unlock(env, '123456'))!.ck
    const next = upsertMessage(base, msg('n'))
    const blob = await encryptContent(next, ck)
    expect(blob.iv).not.toBe(env.iv)
    expect(await decryptContent({ ...env, ...blob }, ck)).toEqual(next)
  })

  it('wraps a new PIN that opens the same key, and refuses the other PIN', async () => {
    const env = await seal(base, { viewer: '123456', admin: '654321' }, { iterations: ITER })
    const ck = toB64((await unlock(env, '654321'))!.ck)
    const same = await runJob({ type: 'wrap', ck, pin: '654321', iterations: ITER, other: env.slots.admin })
    expect(same).toEqual({ error: 'same' })
    const r = await runJob({ type: 'wrap', ck, pin: '777777', iterations: ITER, other: env.slots.admin })
    if (!r || !('slot' in r)) throw new Error('no slot')
    expect(toB64((await unwrapCk(r.slot, '777777', ITER))!)).toBe(ck)
    expect(await unwrapCk(r.slot, '123456', ITER)).toBeNull()
  })

  it('fails to open drafts with another key', async () => {
    const blob = await encryptContent({ base, draft: base, slots: {} }, generateCk())
    await expect(decryptContent(blob, generateCk())).rejects.toThrow()
  })
})

describe('github client', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

  it('reads and writes the file as base64 with the sha', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return init.method === 'PUT' ? ok({}) : ok({ sha: 'abc', encoding: 'base64', content: btoa('{"v":1}').replace(/(.{4})/g, '$1\n') })
    }) as unknown as typeof fetch
    const f = await getFile('tok', fake)
    expect(f).toEqual({ sha: 'abc', text: '{"v":1}' })
    await putFile('tok', 'hello ✓', 'abc', 'Publish 1 change', fake)
    const put = JSON.parse(String(calls[1].init.body))
    expect(put.sha).toBe('abc')
    expect(new TextDecoder().decode(Uint8Array.from(atob(put.content), (c) => c.charCodeAt(0)))).toBe('hello ✓')
    expect(calls[0].url).toContain('https://api.github.com/repos/jerylteo/missme/contents/public/data/content.enc.json?ref=main')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('maps errors to plain messages', async () => {
    const status = (n: number) => (async () => new Response('{}', { status: n })) as unknown as typeof fetch
    await expect(getFile('t', status(401))).rejects.toMatchObject({ kind: 'token', message: 'Token rejected. Check it in Settings.' })
    await expect(getFile('t', status(404))).rejects.toMatchObject({ kind: 'missing' })
    await expect(putFile('t', 'x', 's', 'm', status(409))).rejects.toMatchObject({ kind: 'conflict' })
    const down = (async () => {
      throw new TypeError('offline')
    }) as unknown as typeof fetch
    await expect(getFile('t', down)).rejects.toBeInstanceOf(GhError)
  })
})
