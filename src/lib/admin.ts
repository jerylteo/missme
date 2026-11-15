// Pure admin logic: what changed between the published base and the drafts, and
// how to lay those changes onto whatever is live on GitHub at publish time.
import type { Category, Content, Message, Settings } from './content.ts'
import type { Role, Slot } from './crypto.ts'

export const MAX_TEXT = 400

export interface Drafts {
  /** The content the drafts started from (what was live when editing began). */
  base: Content
  draft: Content
  /** New PIN slots, wrapped with the same content key. Applied on publish. */
  slots: Partial<Record<Role, Slot>>
}

export type Flag = 'new' | 'edited'

function sameMessage(a: Message, b: Message): boolean {
  return a.text === b.text && a.categoryId === b.categoryId && a.rarity === b.rarity
}

function sameSettings(a: Settings, b: Settings): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function messageFlags(d: Pick<Drafts, 'base' | 'draft'>): Map<string, Flag> {
  const base = new Map(d.base.messages.map((m) => [m.id, m]))
  const out = new Map<string, Flag>()
  for (const m of d.draft.messages) {
    const b = base.get(m.id)
    if (!b) out.set(m.id, 'new')
    else if (!sameMessage(b, m)) out.set(m.id, 'edited')
  }
  return out
}

/** Every unpublished change: each message added, edited or deleted, each category touched, settings, PINs. */
export function changeCount(d: Drafts): number {
  const draftIds = new Set(d.draft.messages.map((m) => m.id))
  const deleted = d.base.messages.filter((m) => !draftIds.has(m.id)).length
  const baseCats = new Map(d.base.categories.map((c) => [c.id, c.label]))
  const draftCats = new Map(d.draft.categories.map((c) => [c.id, c.label]))
  let cats = 0
  for (const [id, label] of draftCats) if (baseCats.get(id) !== label) cats++
  for (const id of baseCats.keys()) if (!draftCats.has(id)) cats++
  const settings = sameSettings(d.base.settings, d.draft.settings) ? 0 : 1
  const slots = Object.keys(d.slots).length
  return messageFlags(d).size + deleted + cats + settings + slots
}

/** Applies base -> draft edits by id onto `remote`, keeping anything changed elsewhere. */
function mergeById<T extends { id: string }>(remote: T[], base: T[], draft: T[], same: (a: T, b: T) => boolean): T[] {
  const baseById = new Map(base.map((x) => [x.id, x]))
  const draftIds = new Set(draft.map((x) => x.id))
  const removed = new Set(base.filter((x) => !draftIds.has(x.id)).map((x) => x.id))
  const changed = new Map(draft.filter((x) => !baseById.has(x.id) || !same(baseById.get(x.id)!, x)).map((x) => [x.id, x]))
  const out: T[] = []
  for (const x of remote) {
    if (removed.has(x.id)) continue
    out.push(changed.get(x.id) ?? x)
    changed.delete(x.id)
  }
  return [...out, ...changed.values()]
}

export function applyChanges(remote: Content, d: Pick<Drafts, 'base' | 'draft'>): Content {
  const messages = mergeById(remote.messages, d.base.messages, d.draft.messages, sameMessage)
  let categories = mergeById(remote.categories, d.base.categories, d.draft.categories, (a, b) => a.label === b.label)
  // Never drop a category a message still uses (one may have been added elsewhere).
  const used = new Set(messages.map((m) => m.categoryId))
  const kept = new Set(categories.map((c) => c.id))
  // Remote first; the draft covers one that was deleted elsewhere while a drafted message still uses it.
  for (const c of [...remote.categories, ...d.draft.categories]) {
    if (used.has(c.id) && !kept.has(c.id)) {
      categories = [...categories, c]
      kept.add(c.id)
    }
  }
  const s = d.draft.settings
  const b = d.base.settings
  const r = remote.settings
  const pick = <K extends keyof Settings>(k: K): Settings[K] =>
    JSON.stringify(s[k]) !== JSON.stringify(b[k]) ? s[k] : r[k]
  return {
    settings: {
      cooldownMinutes: pick('cooldownMinutes'),
      dailyLimit: pick('dailyLimit'),
      weights: pick('weights'),
      nicknames: pick('nicknames'),
    },
    categories,
    messages,
  }
}

export function categoryInUse(content: Content, id: string): boolean {
  return content.messages.some((m) => m.categoryId === id)
}

/** A stable id for a new category: a slug of the label plus a short random tail. */
export function newCategoryId(label: string, taken: ReadonlySet<string>): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'category'
  for (;;) {
    const id = `${slug}-${Math.random().toString(36).slice(2, 6)}`
    if (!taken.has(id)) return id
  }
}

export function newMessage(fields: Pick<Message, 'text' | 'categoryId' | 'rarity'>, now: Date): Message {
  return { id: globalThis.crypto.randomUUID(), ...fields, photo: null, createdAt: now.toISOString() }
}

export function upsertMessage(content: Content, m: Message): Content {
  const exists = content.messages.some((x) => x.id === m.id)
  return { ...content, messages: exists ? content.messages.map((x) => (x.id === m.id ? m : x)) : [...content.messages, m] }
}

export function deleteMessage(content: Content, id: string): Content {
  return { ...content, messages: content.messages.filter((m) => m.id !== id) }
}

export function setCategories(content: Content, categories: Category[]): Content {
  return { ...content, categories }
}
