/**
 * Elemental Barrage — the ball-skin catalogue (lead-owned seam; additive edits OK).
 *
 * A skin is a SHELL, never a replacement. The first catalogue swapped the
 * whole ball for one of the 14 round sprites Merge Idle War never shipped —
 * baseball, clay pot, eye, bullseye… — and with it went the only thing that
 * tells tiers apart: the element fighter's face inside the glass. Merges are
 * the core loop, and a tier-1 and a tier-5 "Stone" looked the same.
 *
 * Now every skin keeps the face and the tier's element halo and changes the
 * material AROUND it — a ring of stone, lava, amber, frost, gold… (see
 * `render/balls.ts`). Every one belongs to this game's elements; the off-theme
 * props are retired. `rainbow` is not for sale any more: it is the FEVER look,
 * and selling it made FEVER invisible to its owner while giving everybody else
 * the top prize for free every 50 hits.
 *
 * Two kinds of material:
 *   • sprite — the painted ball's outer band becomes the shell (stone, amber,
 *     lava, diamond, obsidian, the glow rune);
 *   • drawn  — procedural shells for the elements without a painting (tide,
 *     gale, frost, gilded, eclipse).
 *
 * Skins are pure cosmetics (casual contract rule 1).
 */
// Only the paintings a shell (or FEVER) uses are bundled; the retired props and
// the flat `*-texture` sheets stay out of every build.
const SPRITES = import.meta.glob<string>([
  '@/assets/art/props/ball/ball-stone.webp',
  '@/assets/art/props/ball/ball-amber.webp',
  '@/assets/art/props/ball/ball-lava.webp',
  '@/assets/art/props/ball/ball-diamond.webp',
  '@/assets/art/props/ball/ball-obsidian.webp',
  '@/assets/art/props/ball/ball-glow.webp',
  '@/assets/art/props/ball/ball-rainbow.webp'
], {
  eager: true,
  query: '?url',
  import: 'default'
})

export type BallSkinId =
  | 'orb' | 'stone' | 'tide' | 'gale' | 'frost' | 'amber'
  | 'lava' | 'diamond' | 'obsidian' | 'glow' | 'gilded' | 'eclipse'
export type BallSkinRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type BallSkinMaterial = 'glass' | 'sprite' | 'drawn'

export interface BallSkinDef {
  id: BallSkinId
  rarity: BallSkinRarity
  /** Coin price (0 = owned from the start). */
  price: number
  material: BallSkinMaterial
}

/**
 * Prices follow the measured income curve of the compounding economy (bot sim:
 * a strong player banks ~3 k coins by minute 10, ~45 k by 30, ~150 k by 60,
 * millions past two hours): commons are a first savings goal once the
 * collection unlocks (row 16), rares a half-hour one, epics an evening, the
 * legendaries the long tail.
 */
export const BALL_SKINS: BallSkinDef[] = [
  { id: 'orb', rarity: 'common', price: 0, material: 'glass' },
  { id: 'stone', rarity: 'common', price: 2_000, material: 'sprite' },
  { id: 'tide', rarity: 'common', price: 5_000, material: 'drawn' },
  { id: 'gale', rarity: 'rare', price: 15_000, material: 'drawn' },
  { id: 'frost', rarity: 'rare', price: 35_000, material: 'drawn' },
  { id: 'amber', rarity: 'rare', price: 75_000, material: 'sprite' },
  { id: 'lava', rarity: 'epic', price: 250_000, material: 'sprite' },
  { id: 'diamond', rarity: 'epic', price: 600_000, material: 'sprite' },
  { id: 'obsidian', rarity: 'epic', price: 1_500_000, material: 'sprite' },
  { id: 'glow', rarity: 'legendary', price: 10_000_000, material: 'sprite' },
  { id: 'gilded', rarity: 'legendary', price: 40_000_000, material: 'drawn' },
  { id: 'eclipse', rarity: 'legendary', price: 150_000_000, material: 'drawn' }
]

export const DEFAULT_BALL_SKIN: BallSkinId = 'orb'

/**
 * Rewarded ads that unlock a skin — the alternative to its coin price, on every
 * build with real rewarded ads (never on coin-mode builds, which have none).
 * Scaled by rarity so a legendary stays a goal rather than one 30 s video;
 * progress is kept per skin, so the ads can be watched across sessions.
 */
export const SKIN_ADS_BY_RARITY: Readonly<Record<BallSkinRarity, number>> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 5
}

/** Rewarded ads needed to unlock `def` (0 for a skin owned from the start). */
export const skinAdsNeeded = (def: BallSkinDef): number =>
  def.price > 0 ? SKIN_ADS_BY_RARITY[def.rarity] : 0

/**
 * Skins of the first catalogue that no longer exist, with what they cost. A
 * save that owns one is refunded that price once (`useCollections`) — a
 * cosmetic being retired must never cost a player what they paid for it.
 */
export const RETIRED_SKIN_PRICES: Readonly<Record<string, number>> = {
  baseball: 4_000,
  pot: 6_000,
  cactus: 15_000,
  eye: 25_000,
  gear: 40_000,
  luck: 150_000,
  aim: 20_000_000,
  rainbow: 100_000_000
}

export const skinDef = (id: BallSkinId): BallSkinDef =>
  BALL_SKINS.find((s) => s.id === id) ?? BALL_SKINS[0]!

const spriteUrl = (name: string): string | null => {
  const hit = Object.entries(SPRITES).find(([path]) => path.endsWith(`/ball-${name}.webp`))
  return hit ? hit[1] : null
}

/** The painting a `sprite` shell is cut from (null for glass / drawn shells). */
export const ballSkinSrc = (id: BallSkinId): string | null =>
  skinDef(id).material === 'sprite' ? spriteUrl(id) : null

/** The FEVER look (the rainbow ball) — never a skin. */
export const feverSrc = (): string | null => spriteUrl('rainbow')
