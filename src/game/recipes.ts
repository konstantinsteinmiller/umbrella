/**
 * The 50 potion recipes of Merge Alchemy Lab (GDD §5.2).
 *
 * A recipe matches when the three cauldron ingredients form the same MULTISET
 * of tiers as the formula (order-insensitive — the cauldron sorts before
 * lookup). The three GDD example recipes (#1 Volcanic Brew, #2 Stellar Draft,
 * #3 Ancient Remedy) are included verbatim with their stated effects.
 *
 * Recipes are grouped into collection "pages" (the sticker album). Completing a
 * page grants a permanent reward (GDD §5.1 "Completion Milestones").
 *
 * Effects: every recipe pays `gold` on brew. A subset carry a special `effect`
 * that is wired to a real modifier in `usePrismGame`; the rest are pure
 * collection payouts. Names are game proper-nouns kept here as display content.
 */

export type Rarity = 'standard' | 'legendary'

export type BottleShape =
  | 'flask' | 'sphere' | 'triangle' | 'heart' | 'tube'
  | 'orb' | 'vial' | 'gourd' | 'chalice' | 'teardrop'

export type RecipeEffect =
  /** One-off instant gold on brew (on top of `gold`). */
  | { kind: 'goldBurst'; gold: number }
  /** Temporary multiplier on all gold earned. */
  | { kind: 'goldMult'; mult: number; durationMs: number }
  /** Temporary faster free-spawn recharge + automation cadence. */
  | { kind: 'spawnSpeed'; mult: number; durationMs: number }
  /** Temporary automation (Helper Imp) speed boost. */
  | { kind: 'autoBoost'; mult: number; durationMs: number }
  /** Permanent percentage discount on all lab upgrades. */
  | { kind: 'cheaperUpgrades'; pct: number }

export interface Recipe {
  id: string
  name: string
  /** Authored formula; matching is order-insensitive. */
  formula: [number, number, number]
  rarity: Rarity
  bottle: BottleShape
  /** Potion liquid colour. */
  liquid: string
  /** Collection page id. */
  page: string
  /** Base gold paid when this recipe is brewed. */
  gold: number
  /** Discovery hint shown on the silhouette in the Index book. */
  hint: string
  effect?: RecipeEffect
}

export interface CollectionPage {
  id: string
  title: string
  /** Permanent reward for completing every recipe on the page. */
  reward:
    | { type: 'goldMult'; value: number }
    | { type: 'baseTier'; value: number }
}

export const PAGES: CollectionPage[] = [
  { id: 'garden', title: 'Verdant Garden', reward: { type: 'goldMult', value: 1.06 } },
  { id: 'volcanic', title: 'The Volcanic Collection', reward: { type: 'goldMult', value: 1.12 } },
  { id: 'storm', title: 'Storm Cellar', reward: { type: 'goldMult', value: 1.12 } },
  { id: 'ice', title: 'The Ice Age Brews', reward: { type: 'goldMult', value: 1.12 } },
  { id: 'toxic', title: 'Toxic Works', reward: { type: 'goldMult', value: 1.14 } },
  { id: 'forge', title: "Alchemist's Forge", reward: { type: 'goldMult', value: 1.15 } },
  { id: 'golden', title: 'The Golden Reserve', reward: { type: 'goldMult', value: 1.2 } },
  { id: 'cosmic', title: 'The Cosmic Vault', reward: { type: 'baseTier', value: 1 } },
  { id: 'folio', title: "Master's Folio", reward: { type: 'goldMult', value: 1.25 } }
]

const min10 = 10 * 60_000
const min8 = 8 * 60_000
const min5 = 5 * 60_000
const min3 = 3 * 60_000

export const RECIPES: Recipe[] = [
  // ── Verdant Garden ────────────────────────────────────────────────────────
  { id: 'dewbud', name: 'Dewbud Tonic', formula: [1, 1, 3], rarity: 'standard', bottle: 'vial', liquid: '#7fd6a8', page: 'garden', gold: 60, hint: 'Two restless droplets and a wisp of gas.' },
  { id: 'mossmilk', name: 'Mossmilk Draught', formula: [1, 1, 4], rarity: 'standard', bottle: 'flask', liquid: '#8fe06a', page: 'garden', gold: 80, hint: 'Plenty of water nursing a tiny sprout.' },
  { id: 'sapcider', name: 'Sap Cider', formula: [1, 4, 4], rarity: 'standard', bottle: 'gourd', liquid: '#5fbf3a', page: 'garden', gold: 120, hint: 'Twin sprouts steeped in clear water.' },
  { id: 'fogfern', name: 'Fogfern Elixir', formula: [1, 3, 4], rarity: 'standard', bottle: 'teardrop', liquid: '#9fe0c0', page: 'garden', gold: 140, hint: 'Water, vapour and a single green sprout.' },
  { id: 'bloomroot', name: 'Bloomroot Serum', formula: [3, 4, 4], rarity: 'standard', bottle: 'flask', liquid: '#3fbf5f', page: 'garden', gold: 200, hint: 'A dense thicket fed on rising vapour.' },

  // ── The Volcanic Collection ───────────────────────────────────────────────
  { id: 'cinderpop', name: 'Cinderpop Fizz', formula: [2, 2, 5], rarity: 'standard', bottle: 'tube', liquid: '#ff8a2a', page: 'volcanic', gold: 180, hint: 'Two embers circling a fire core.' },
  {
    id: 'volcanic-brew', name: 'Volcanic Brew', formula: [5, 5, 2], rarity: 'standard', bottle: 'flask', liquid: '#ff4d1f', page: 'volcanic', gold: 260,
    hint: 'Twin fire cores stoked by a minor ember.',
    effect: { kind: 'spawnSpeed', mult: 1.25, durationMs: min10 }
  },
  { id: 'magmaheart', name: 'Magma Heart', formula: [1, 2, 5], rarity: 'standard', bottle: 'heart', liquid: '#ff6a1f', page: 'volcanic', gold: 160, hint: 'A droplet caught between ember and fire.' },
  {
    id: 'inferno-heart', name: 'Inferno Heart', formula: [5, 5, 5], rarity: 'legendary', bottle: 'heart', liquid: '#ff2a00', page: 'volcanic', gold: 900,
    hint: 'Three blazing cores and nothing to cool them.',
    effect: { kind: 'goldMult', mult: 2, durationMs: min5 }
  },
  { id: 'ashwhistle', name: 'Ashwhistle Vial', formula: [2, 2, 2], rarity: 'standard', bottle: 'vial', liquid: '#ffae5c', page: 'volcanic', gold: 120, hint: 'A trio of squabbling embers.' },

  // ── Storm Cellar ──────────────────────────────────────────────────────────
  { id: 'staticfizz', name: 'Static Fizz', formula: [1, 7, 7], rarity: 'standard', bottle: 'tube', liquid: '#5cf0ff', page: 'storm', gold: 300, hint: 'A droplet caught in a crackling double charge.' },
  { id: 'galecharge', name: 'Galecharge Draught', formula: [3, 3, 7], rarity: 'standard', bottle: 'flask', liquid: '#7fe8ff', page: 'storm', gold: 320, hint: 'Pressurised gas split by a single spark.' },
  { id: 'thunderjam', name: 'Thunderjam', formula: [3, 7, 7], rarity: 'standard', bottle: 'orb', liquid: '#3fdcff', page: 'storm', gold: 360, hint: 'Twin sparks compressed inside vapour.' },
  { id: 'emberstorm', name: 'Emberstorm Mix', formula: [2, 7, 7], rarity: 'standard', bottle: 'flask', liquid: '#a0e8ff', page: 'storm', gold: 340, hint: 'Lightning licking at a lonely ember.' },
  {
    id: 'tempest-crown', name: 'Tempest Crown', formula: [7, 7, 7], rarity: 'legendary', bottle: 'chalice', liquid: '#22e0ff', page: 'storm', gold: 1000,
    hint: 'Three volatile sparks crowned together.',
    effect: { kind: 'autoBoost', mult: 2, durationMs: min5 }
  },

  // ── The Ice Age Brews ─────────────────────────────────────────────────────
  { id: 'frostsip', name: 'Frostsip', formula: [1, 8, 8], rarity: 'standard', bottle: 'teardrop', liquid: '#cdeeff', page: 'ice', gold: 360, hint: 'A droplet flanked by two frozen shards.' },
  { id: 'rimevapor', name: 'Rimevapor Tonic', formula: [3, 8, 8], rarity: 'standard', bottle: 'vial', liquid: '#bfe6ff', page: 'ice', gold: 400, hint: 'Cold vapour locked between cryo-shards.' },
  { id: 'permafrost', name: 'Permafrost Serum', formula: [1, 3, 8], rarity: 'standard', bottle: 'flask', liquid: '#aee0ff', page: 'ice', gold: 320, hint: 'Water and vapour kissed by sub-zero frost.' },
  {
    id: 'ancient-remedy', name: 'Ancient Remedy', formula: [4, 4, 8], rarity: 'standard', bottle: 'gourd', liquid: '#bfe8d8', page: 'ice', gold: 420,
    hint: 'Twin flora preserved deep in the cold.',
    effect: { kind: 'cheaperUpgrades', pct: 5 }
  },
  {
    id: 'glacier-soul', name: 'Glacier Soul', formula: [8, 8, 8], rarity: 'legendary', bottle: 'orb', liquid: '#dff4ff', page: 'ice', gold: 1100,
    hint: 'A heart of pure, ancient ice.',
    effect: { kind: 'cheaperUpgrades', pct: 3 }
  },

  // ── Toxic Works ───────────────────────────────────────────────────────────
  { id: 'spitvial', name: 'Spitvial', formula: [1, 6, 6], rarity: 'standard', bottle: 'vial', liquid: '#aaff3c', page: 'toxic', gold: 320, hint: 'A droplet dissolving between two acid glands.' },
  { id: 'fumebrew', name: 'Fumebrew', formula: [2, 6, 6], rarity: 'standard', bottle: 'flask', liquid: '#caff7a', page: 'toxic', gold: 360, hint: 'Acid heated by a restless ember.' },
  { id: 'rotbloom', name: 'Rotbloom Draught', formula: [4, 6, 6], rarity: 'standard', bottle: 'gourd', liquid: '#9cff2e', page: 'toxic', gold: 400, hint: 'Flora drowned in corrosive bile.' },
  { id: 'venomjolt', name: 'Venomjolt', formula: [6, 6, 7], rarity: 'standard', bottle: 'tube', liquid: '#c6ff5a', page: 'toxic', gold: 460, hint: 'Twin acids supercharged by a spark.' },
  { id: 'meltdown', name: 'Meltdown Mixture', formula: [6, 6, 6], rarity: 'legendary', bottle: 'orb', liquid: '#7aff00', page: 'toxic', gold: 1050, hint: 'Three acid glands and zero restraint.' },

  // ── Alchemist's Forge (mixed mid tiers) ───────────────────────────────────
  { id: 'glasswork', name: 'Glasswork Brew', formula: [2, 4, 6], rarity: 'standard', bottle: 'flask', liquid: '#cfe06a', page: 'forge', gold: 380, hint: 'Ember, flora and acid in uneasy balance.' },
  { id: 'prismafuel', name: 'Prismafuel', formula: [4, 5, 6], rarity: 'standard', bottle: 'tube', liquid: '#bfe04a', page: 'forge', gold: 460, hint: 'Flora and acid lit by a fire core.' },
  { id: 'stormglass', name: 'Stormglass Serum', formula: [3, 5, 8], rarity: 'standard', bottle: 'vial', liquid: '#9fd0e0', page: 'forge', gold: 520, hint: 'Vapour pulled between fire and frost.' },
  { id: 'voltflora', name: 'Voltflora Tonic', formula: [5, 6, 7], rarity: 'standard', bottle: 'gourd', liquid: '#aef05a', page: 'forge', gold: 560, hint: 'Fire, acid and a live wire.' },
  { id: 'cryospark', name: 'Cryospark Elixir', formula: [5, 7, 8], rarity: 'standard', bottle: 'flask', liquid: '#9fe6ff', page: 'forge', gold: 600, hint: 'Fire, lightning and ice — all at once.' },

  // ── The Golden Reserve ────────────────────────────────────────────────────
  {
    id: 'midas-mote', name: 'Midas Mote', formula: [1, 9, 9], rarity: 'standard', bottle: 'sphere', liquid: '#ffe27a', page: 'golden', gold: 700,
    hint: 'A droplet gilded by twin catalysts.',
    effect: { kind: 'autoBoost', mult: 1.5, durationMs: min10 }
  },
  {
    id: 'catalyst-cordial', name: 'Catalyst Cordial', formula: [7, 9, 9], rarity: 'standard', bottle: 'chalice', liquid: '#ffd23c', page: 'golden', gold: 760,
    hint: 'Lightning quickened by golden catalysts.',
    effect: { kind: 'spawnSpeed', mult: 1.4, durationMs: min8 }
  },
  { id: 'gildedfrost', name: 'Gilded Frost', formula: [8, 9, 9], rarity: 'standard', bottle: 'orb', liquid: '#ffeab0', page: 'golden', gold: 740, hint: 'Cryo-shards plated in living gold.' },
  { id: 'sunbrand', name: 'Sunbrand Brew', formula: [5, 9, 9], rarity: 'standard', bottle: 'flask', liquid: '#ffcf33', page: 'golden', gold: 780, hint: 'A fire core fused with twin catalysts.' },
  {
    id: 'midas-bloom', name: 'Midas Bloom', formula: [9, 9, 9], rarity: 'legendary', bottle: 'chalice', liquid: '#ffd700', page: 'golden', gold: 1500,
    hint: 'Three pure catalysts and a fortune.',
    effect: { kind: 'goldBurst', gold: 8000 }
  },

  // ── The Cosmic Vault ──────────────────────────────────────────────────────
  {
    id: 'stellar-draft', name: 'Stellar Draft', formula: [10, 3, 1], rarity: 'legendary', bottle: 'sphere', liquid: '#7b2ff7', page: 'cosmic', gold: 0,
    hint: 'Dark matter, gas and water spun into stars.',
    effect: { kind: 'goldBurst', gold: 5000 }
  },
  { id: 'voidfizz', name: 'Voidfizz', formula: [5, 10, 10], rarity: 'standard', bottle: 'orb', liquid: '#9a4dff', page: 'cosmic', gold: 1200, hint: 'A fire core swallowed by twin voids.' },
  { id: 'nebulanectar', name: 'Nebula Nectar', formula: [9, 10, 10], rarity: 'standard', bottle: 'teardrop', liquid: '#b07bff', page: 'cosmic', gold: 1300, hint: 'Catalyst dissolved into pure dark matter.' },
  { id: 'eventhorizon', name: 'Event Horizon', formula: [7, 8, 10], rarity: 'standard', bottle: 'orb', liquid: '#6a3cff', page: 'cosmic', gold: 1250, hint: 'Spark and frost falling past the void.' },
  {
    id: 'singularity', name: 'Singularity', formula: [10, 10, 10], rarity: 'legendary', bottle: 'sphere', liquid: '#4b0fb0', page: 'cosmic', gold: 3000,
    hint: 'Three masses of dark matter. Do not drop it.',
    effect: { kind: 'goldMult', mult: 3, durationMs: min3 }
  },

  // ── Master's Folio (advanced spread) ──────────────────────────────────────
  { id: 'firstwater', name: 'First Water', formula: [1, 1, 1], rarity: 'standard', bottle: 'teardrop', liquid: '#ff7a6e', page: 'folio', gold: 40, hint: 'The most basic brew of all — three droplets.' },
  { id: 'primer', name: "Apprentice's Primer", formula: [1, 2, 3], rarity: 'standard', bottle: 'vial', liquid: '#ffd0a0', page: 'folio', gold: 100, hint: 'Water, ember and vapour — the first lesson.' },
  { id: 'spectrum', name: 'Spectrum Serum', formula: [2, 3, 4], rarity: 'standard', bottle: 'tube', liquid: '#9fd06a', page: 'folio', gold: 150, hint: 'Ember, gas and sprout in a tidy row.' },
  { id: 'tritone', name: 'Tritone Brew', formula: [5, 6, 8], rarity: 'standard', bottle: 'flask', liquid: '#aee0c0', page: 'folio', gold: 540, hint: 'Fire, acid and frost forced to agree.' },
  { id: 'goldspark', name: 'Goldspark Tonic', formula: [2, 8, 9], rarity: 'standard', bottle: 'chalice', liquid: '#ffe2a0', page: 'folio', gold: 720, hint: 'Ember and frost bound by a catalyst.' },
  { id: 'wildcurrent', name: 'Wild Current', formula: [4, 7, 10], rarity: 'standard', bottle: 'gourd', liquid: '#8f7bff', page: 'folio', gold: 1100, hint: 'Flora and spark adrift in dark matter.' },
  { id: 'cometwater', name: 'Cometwater', formula: [1, 5, 10], rarity: 'standard', bottle: 'sphere', liquid: '#a05cff', page: 'folio', gold: 1000, hint: 'A droplet and a fire core lost in the void.' },
  { id: 'trinitycore', name: 'Trinity Core', formula: [3, 6, 9], rarity: 'standard', bottle: 'orb', liquid: '#c6e05a', page: 'folio', gold: 820, hint: 'Gas, acid and catalyst, perfectly spaced.' },
  { id: 'darkcomet', name: 'Dark Comet', formula: [2, 5, 10], rarity: 'standard', bottle: 'teardrop', liquid: '#8a4dff', page: 'folio', gold: 1150, hint: 'Ember and fire pulled into the dark.' },
  { id: 'omnibrew', name: 'Omnibrew', formula: [6, 8, 10], rarity: 'legendary', bottle: 'chalice', liquid: '#7a3cff', page: 'folio', gold: 2000, hint: 'Acid, frost and void — a master’s flourish.' }
]

/** Sort a tier triple ascending and join — the canonical key for matching. */
export const formulaKey = (a: number, b: number, c: number): string =>
  [a, b, c].sort((x, y) => x - y).join('-')

const RECIPE_BY_KEY: Map<string, Recipe> = (() => {
  const m = new Map<string, Recipe>()
  for (const r of RECIPES) m.set(formulaKey(r.formula[0], r.formula[1], r.formula[2]), r)
  return m
})()

export const RECIPE_BY_ID: Map<string, Recipe> = (() => {
  const m = new Map<string, Recipe>()
  for (const r of RECIPES) m.set(r.id, r)
  return m
})()

/** Look up the recipe for a set of three cauldron tiers (order-insensitive). */
export const matchRecipe = (tiers: number[]): Recipe | undefined => {
  if (tiers.length !== 3) return undefined
  return RECIPE_BY_KEY.get(formulaKey(tiers[0]!, tiers[1]!, tiers[2]!))
}

export const recipesForPage = (pageId: string): Recipe[] =>
  RECIPES.filter((r) => r.page === pageId)

export const TOTAL_RECIPES = RECIPES.length
