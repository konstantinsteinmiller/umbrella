/**
 * Umbrella — shared asset paths (lead-owned seam; additive edits OK).
 *
 * Every sprite the new game draws comes from Merge Idle War's shipped art:
 * the 50 fighter portraits (balls + launchers), the 6 walkers (monster bricks),
 * the 6 bosses, the 8 skill icons (pickup bubbles), the 9-frame impact sheets,
 * coin / chest props, and the 14 ball sprites MIW never shipped (ball skins).
 *
 * Public-folder paths go through `prependBaseUrl` so non-root builds
 * (GitHub Pages, portal zips with `--base=./`) resolve them.
 */
import { prependBaseUrl } from '@/utils/function'
import { getIngredient, type ElementKind } from '@/game/ingredients'
import type { BossKind, MonsterKind, SkillId } from './engine/types'

/** Tiers past 50 reuse tier 50's portrait (the MIW rule). */
export const FIGHTER_ART_MAX = 50

export const fighterSrc = (tier: number): string =>
  prependBaseUrl(`images/units/fighter-${Math.max(1, Math.min(FIGHTER_ART_MAX, Math.floor(tier)))}.webp`)

const MONSTER_FILES: Record<Exclude<MonsterKind, 'boss'>, string> = {
  slime: 'enemies/slime2_256x256.webp',
  caterpillar: 'enemies/caterpillar_256x256.webp',
  goblin: 'enemies/goblin_256x256.webp',
  ogre: 'enemies/ogre_256x256.webp',
  centaur: 'enemies/centaur_256x256.webp',
  dryad: 'enemies/dryad_256x256.webp',
  // The late walkers (rows 36+) — Barrage's own art, not MIW's.
  imp: 'enemies/imp_256x256.webp',
  treant: 'enemies/trent_256x256.webp',
  carbuncle: 'enemies/carfuncle_256x256.webp',
  cyclops: 'enemies/cyclops_256x256.webp'
}
/** The centaur bitmap faces RIGHT; every other walker faces left. */
export const MONSTER_FACES_RIGHT: Partial<Record<MonsterKind, boolean>> = { centaur: true }

export const monsterSrc = (kind: Exclude<MonsterKind, 'boss'>): string => prependBaseUrl(MONSTER_FILES[kind])

const BOSS_FILES: Record<BossKind, string> = {
  'slime-tower': 'enemies/bosses/slime-tower_256x256.webp',
  worm: 'enemies/bosses/worm_256x256.webp',
  'fire-dragon': 'enemies/bosses/fire-dragon_256x256.webp',
  'silver-dragon': 'enemies/bosses/silver-dragon_256x256.webp',
  troll: 'enemies/bosses/troll_256x256.webp',
  orc: 'enemies/bosses/orc_256x256.webp'
}
export const BOSS_ORDER: BossKind[] = ['slime-tower', 'worm', 'fire-dragon', 'silver-dragon', 'troll', 'orc']
export const bossSrc = (kind: BossKind): string => prependBaseUrl(BOSS_FILES[kind])

const SKILL_FILES: Record<SkillId, string> = {
  meteor: 'images/attacks/meteor_256x256.webp',
  warcry: 'images/attacks/warcry_128x128.webp',
  legion: 'images/attacks/legion-call_128x128.webp',
  pact: 'images/attacks/soul-pact_128x128.webp',
  shield: 'images/attacks/shield-crest_256x256.webp',
  execute: 'images/attacks/executioners-mark_128x128.webp',
  heal: 'images/attacks/heal_128x128.webp',
  revive: 'images/attacks/revive_128x128.webp'
}
export const SKILL_IDS = Object.keys(SKILL_FILES) as SkillId[]
export const skillSrc = (skill: SkillId): string => prependBaseUrl(SKILL_FILES[skill])

/** 9-frame (3×3, 128 px cells, ~53 ms/frame) impact sheets. Water and gold have
 *  none — they borrow ice and fire. The sheets carry a 1–2 px grey rim on the
 *  outer edge: inset the source rect by 2 px when drawing. */
const IMPACT_FILES: Record<ElementKind, string> = {
  fire: 'images/attacks/animations/fire-splitter-vfx-9-frames_384x384.webp',
  ice: 'images/attacks/animations/ice-splitter-vfx-9-frames_384x384.webp',
  water: 'images/attacks/animations/ice-splitter-vfx-9-frames_384x384.webp',
  stone: 'images/attacks/animations/stone-splitter-vfx-9-frames_384x384.webp',
  shadow: 'images/attacks/animations/shadow-splitter-vfx-9-frames_384x384.webp',
  cosmic: 'images/attacks/animations/cosmic-splitter-vfx-9-frames_384x384.webp',
  wind: 'images/attacks/animations/wind-impact-vfx-9-frames_384x384.webp',
  gold: 'images/attacks/animations/fire-splitter-vfx-9-frames_384x384.webp'
}
export const impactSrc = (el: ElementKind): string => prependBaseUrl(IMPACT_FILES[el])
export const IMPACT_FRAMES = 9
export const IMPACT_FRAME_MS = 480 / 9

export const ballElement = (tier: number): ElementKind => getIngredient(Math.min(FIGHTER_ART_MAX, tier)).element
/** Signature colours of a tier (body / light / accent / glow) for rims, trails, sparks. */
export const ballColors = (tier: number) => {
  const i = getIngredient(Math.min(FIGHTER_ART_MAX, tier))
  return { body: i.body, light: i.bodyLight, accent: i.accent, glow: i.glow }
}

export const coinSrc = (): string => prependBaseUrl('images/props/coin_128x128.webp')
export const chestSrc = (): string => prependBaseUrl('images/icons/chest_128x128.webp')
export const flyingChestSrc = (): string => prependBaseUrl('images/props/flying-chest_347x347.webp')
export const trophySrc = (): string => prependBaseUrl('images/icons/trophy_128x128.webp')
