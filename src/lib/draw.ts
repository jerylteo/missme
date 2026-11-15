import { type Content, type Message, type Rarity, RARITIES, SURPRISE } from './content.ts'

/** Uniform float in [0, 1) from the platform CSPRNG. */
export function cryptoRandom(): number {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0] / 0x1_0000_0000
}

/** Messages not opened yet, in the chosen category (all categories for Surprise me). */
export function pool(content: Content, openedIds: ReadonlySet<string>, categoryId: string): Message[] {
  return content.messages.filter(
    (m) => !openedIds.has(m.id) && (categoryId === SURPRISE || m.categoryId === categoryId),
  )
}

/**
 * Picks a rarity tier by weight (among tiers that still have messages), then a
 * message uniformly inside that tier. Returns null when the pool is empty.
 */
export function draw(
  candidates: Message[],
  weights: Record<Rarity, number>,
  rand: () => number = cryptoRandom,
): Message | null {
  if (candidates.length === 0) return null
  const byRarity: Record<Rarity, Message[]> = { common: [], rare: [], secret: [] }
  for (const m of candidates) byRarity[m.rarity].push(m)
  let tiers = RARITIES.filter((r) => byRarity[r].length > 0 && weights[r] > 0)
  // Every remaining tier has weight 0: still hand something out rather than strand messages.
  const flat = tiers.length === 0
  if (flat) tiers = RARITIES.filter((r) => byRarity[r].length > 0)
  const weightOf = (r: Rarity) => (flat ? 1 : weights[r])
  const total = tiers.reduce((sum, r) => sum + weightOf(r), 0)
  let roll = rand() * total
  let tier = tiers[tiers.length - 1]
  for (const r of tiers) {
    roll -= weightOf(r)
    if (roll < 0) {
      tier = r
      break
    }
  }
  const list = byRarity[tier]
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))]
}

export function pickNickname(nicknames: string[], rand: () => number = cryptoRandom): string {
  return nicknames[Math.min(nicknames.length - 1, Math.floor(rand() * nicknames.length))] ?? 'my love'
}
