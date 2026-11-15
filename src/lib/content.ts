export type Rarity = 'common' | 'rare' | 'secret'

export const RARITIES: Rarity[] = ['common', 'rare', 'secret']

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  secret: 'Secret',
}

export interface Settings {
  cooldownMinutes: number
  dailyLimit: number
  weights: Record<Rarity, number>
  nicknames: string[]
}

export interface Category {
  id: string
  label: string
}

export interface Message {
  id: string
  categoryId: string
  rarity: Rarity
  text: string
  photo: null
  createdAt: string
}

export interface Content {
  settings: Settings
  categories: Category[]
  messages: Message[]
}

export const DEFAULT_SETTINGS: Settings = {
  cooldownMinutes: 60,
  dailyLimit: 3,
  weights: { common: 6, rare: 3, secret: 1 },
  nicknames: ['my love'],
}

/** The "Surprise me" pseudo-category: every category. */
export const SURPRISE = 'surprise'

function posInt(x: unknown, fallback: number, min: number): number {
  return typeof x === 'number' && Number.isFinite(x) && x >= min ? Math.floor(x) : fallback
}

/** Tolerant parse: fills defaults and drops malformed rows instead of crashing her screen. */
export function normalizeContent(raw: unknown): Content {
  const r = (raw ?? {}) as Partial<Content>
  const s = (r.settings ?? {}) as Partial<Settings>
  const w = (s.weights ?? {}) as Partial<Record<Rarity, number>>
  const nicknames = Array.isArray(s.nicknames) ? s.nicknames.filter((n) => typeof n === 'string' && n.trim()) : []
  const settings: Settings = {
    cooldownMinutes: posInt(s.cooldownMinutes, DEFAULT_SETTINGS.cooldownMinutes, 0),
    dailyLimit: posInt(s.dailyLimit, DEFAULT_SETTINGS.dailyLimit, 1),
    weights: {
      common: posInt(w.common, DEFAULT_SETTINGS.weights.common, 0),
      rare: posInt(w.rare, DEFAULT_SETTINGS.weights.rare, 0),
      secret: posInt(w.secret, DEFAULT_SETTINGS.weights.secret, 0),
    },
    nicknames: nicknames.length ? nicknames : DEFAULT_SETTINGS.nicknames,
  }
  const categories = (Array.isArray(r.categories) ? r.categories : []).filter(
    (c): c is Category => !!c && typeof c.id === 'string' && typeof c.label === 'string',
  )
  const catIds = new Set(categories.map((c) => c.id))
  const seen = new Set<string>()
  const messages: Message[] = []
  for (const m of Array.isArray(r.messages) ? r.messages : []) {
    if (!m || typeof m.id !== 'string' || typeof m.text !== 'string' || !m.text.trim()) continue
    if (seen.has(m.id) || !catIds.has(m.categoryId)) continue
    seen.add(m.id)
    messages.push({
      id: m.id,
      categoryId: m.categoryId,
      rarity: RARITIES.includes(m.rarity) ? m.rarity : 'common',
      text: m.text,
      photo: null,
      createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date(0).toISOString(),
    })
  }
  return { settings, categories, messages }
}

/** Problems that should stop a seal (stricter than the tolerant runtime parse). */
export function validateContent(raw: unknown): string[] {
  const errs: string[] = []
  const r = (raw ?? {}) as Partial<Content>
  if (!Array.isArray(r.categories) || r.categories.length === 0) errs.push('No categories.')
  if (!Array.isArray(r.messages)) errs.push('No messages array.')
  const catIds = new Set((r.categories ?? []).map((c) => c?.id))
  const ids = new Set<string>()
  ;(r.messages ?? []).forEach((m, i) => {
    const at = `messages[${i}]`
    if (!m || typeof m.id !== 'string' || !m.id) return errs.push(`${at}: missing id.`)
    if (ids.has(m.id)) errs.push(`${at}: duplicate id ${m.id}.`)
    ids.add(m.id)
    if (typeof m.text !== 'string' || !m.text.trim()) errs.push(`${at}: empty text.`)
    if (!catIds.has(m.categoryId)) errs.push(`${at}: unknown categoryId "${m.categoryId}".`)
    if (!RARITIES.includes(m.rarity)) errs.push(`${at}: rarity must be common, rare or secret.`)
  })
  return errs
}
