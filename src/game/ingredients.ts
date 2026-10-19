/**
 * Ingredient catalogue — the merge-tier fighters of Umbrella (GDD §3.2):
 * 1-11 authored below, 12-20 reusing the top look, 21-50 the ELEMENTALS.
 * The merge ladder climbs through the elements: molten fire, ice, living stone,
 * water, the cosmic void, and finally the reborn phoenix. Each tier has an
 * anthropomorphic face. Colours are keyed to the shipped bitmap art
 * (`public/images/units/fighter-<tier>.webp`); when that art is absent the same
 * descriptors drive the inline SVG fallback in `IngredientUnit.vue`, and `glow`
 * tints the on-hit / splash particles.
 *
 * Display names come from i18n (`battle.codex.names.t<tier>`); the `name` /
 * `property` fields here are internal descriptors only.
 */

export type FaceMood = 'furious' | 'burning' | 'puffy' | 'sprout' | 'blaze' | 'boil' | 'spark' | 'frost' | 'shiny' | 'cosmic'

/** Combat element — drives which projectile sprite + impact VFX a ranged unit
 *  fires (see `useArtOverrides` `proj-*` / `impact-*` keys). Reused across tiers
 *  so one dropped-in projectile bitmap serves every unit of that element. */
export type ElementKind = 'fire' | 'ice' | 'wind' | 'stone' | 'water' | 'cosmic' | 'shadow' | 'gold'

export interface Ingredient {
  /** 1-based tier; also the merge ladder rung. */
  tier: number
  /** Display name (proper noun). */
  name: string
  /** Underlying chemical property descriptor (proper noun). */
  property: string
  /** Main body fill. */
  body: string
  /** Lighter top-highlight used for the radial body gradient. */
  bodyLight: string
  /** Accent colour for crowns / sparks / helmets / boils. */
  accent: string
  /** Eye-glow / aura tint used by VFX (bubbles, splash) when this tier enters
   *  the cauldron. */
  glow: string
  /** Face/decoration archetype the SVG renderer switches on. */
  mood: FaceMood
  /** Thermal weight 0..1 — drives cauldron bubble multiplier (GDD §4.1.3). */
  thermal: number
  /** Combat element — picks the projectile/impact art for ranged tiers. */
  element: ElementKind
}

export const INGREDIENTS: Ingredient[] = [
  { tier: 1, name: 'Magma Mote', property: 'Molten Fire', body: '#ff6a1f', bodyLight: '#ffb15a', accent: '#ffe23a', glow: '#ff7a3c', mood: 'burning', thermal: 0.9, element: 'fire' },
  { tier: 2, name: 'Frost Whirl', property: 'Glacial Cyclone', body: '#bcd9ec', bodyLight: '#eef8ff', accent: '#8fd3ff', glow: '#bfe6ff', mood: 'frost', thermal: 0.0, element: 'wind' },
  { tier: 3, name: 'Boulder Brute', property: 'Living Stone', body: '#8a7358', bodyLight: '#b8a184', accent: '#5c4a38', glow: '#c8a97e', mood: 'furious', thermal: 0.1, element: 'stone' },
  { tier: 4, name: 'Glacier Guard', property: 'Ice Bulwark', body: '#bfe6ff', bodyLight: '#ffffff', accent: '#5ea8d8', glow: '#9fd8ff', mood: 'frost', thermal: 0.0, element: 'ice' },
  { tier: 5, name: 'Tide Drop', property: 'Living Water', body: '#2f9fe0', bodyLight: '#7fd6ff', accent: '#bff0ff', glow: '#7fd6ff', mood: 'furious', thermal: 0.05, element: 'water' },
  { tier: 6, name: 'Crag Colossus', property: 'Mountain Golem', body: '#6e5c48', bodyLight: '#9a8468', accent: '#ff8a2e', glow: '#ff9a3c', mood: 'furious', thermal: 0.3, element: 'stone' },
  { tier: 7, name: 'Nebula Eye', property: 'Astral Rift', body: '#5b3fb0', bodyLight: '#a07bff', accent: '#59f0d6', glow: '#8a6cff', mood: 'cosmic', thermal: 0.4, element: 'cosmic' },
  { tier: 8, name: 'Void Wraith', property: 'Shadow Umbra', body: '#2a1c3a', bodyLight: '#5a3f7a', accent: '#c05cff', glow: '#b45cff', mood: 'cosmic', thermal: 0.2, element: 'shadow' },
  { tier: 9, name: 'Golden Talon', property: 'Gilded Fledgling', body: '#ffcf2e', bodyLight: '#fff0a0', accent: '#e69a17', glow: '#ffe27a', mood: 'shiny', thermal: 0.25, element: 'gold' },
  { tier: 10, name: 'Phoenix Sovereign', property: 'Eternal Flame', body: '#ff5a1f', bodyLight: '#ffb15a', accent: '#ffd23a', glow: '#ff8a3c', mood: 'blaze', thermal: 1.0, element: 'fire' },
  { tier: 11, name: 'Obsidian Warlord', property: 'Volcanic Demon', body: '#3a4250', bodyLight: '#5c6675', accent: '#ff7a2e', glow: '#ff7a3c', mood: 'blaze', thermal: 1.0, element: 'fire' }
]

// Tiers 12-20 have authored art (fighter-12..20.webp) but reuse the top tier's
// look/colours; only the combat ELEMENT is overridden so the ranged ones fire
// the right projectile/impact VFX (13 → shadow like t8, 15/19 → cosmic like t7,
// 16 → wind like t2, 17 → shadow like t8). Melee tiers (12,14,18,20) never fire
// a projectile, so their element is irrelevant.
const HIGH_TIER_ELEMENTS: Record<number, ElementKind> = {
  13: 'shadow', 15: 'cosmic', 16: 'wind', 17: 'shadow', 19: 'cosmic'
}

/**
 * Tiers 21-50 — the elemental tiers. Thirty elements the ladder had never used
 * (steel, mercury, magnetism, amber … dark matter, a singularity), every one a
 * FLOATING elemental with no legs or feet, so the idle bob and merge squash
 * read as the creature itself hovering rather than a walk cycle nobody drew.
 *
 * Their look lives in `elementalArt.ts` (the procedural drawing that is both the
 * in-game fallback and the art pipeline's reference); these entries carry the
 * colours the VFX tint with, and the ELEMENT that picks an EXISTING projectile
 * and impact sheet for the ranged ones — no new projectile art: steel and seeds
 * throw `stone`, glass and ice throw `ice`, gusts and sound throw `wind`,
 * energy and spirit throw `cosmic`, heat throws `fire`, the void throws `shadow`.
 * Melee tiers never fire, so theirs only names the material.
 */
export const ELEMENTALS: Ingredient[] = [
  { tier: 21, name: 'Steel Sentinel', property: 'Living Steel', body: '#8d99a8', bodyLight: '#eef3f8', accent: '#7ff6ff', glow: '#9fe8ff', mood: 'furious', thermal: 0.2, element: 'stone' },
  { tier: 22, name: 'Mercury Trickster', property: 'Quicksilver', body: '#9aa7b8', bodyLight: '#ffffff', accent: '#5c6778', glow: '#dfe8f5', mood: 'shiny', thermal: 0.1, element: 'water' },
  { tier: 23, name: 'Lodestone Tyrant', property: 'Magnetism', body: '#d8323a', bodyLight: '#ff8a7a', accent: '#c9d2dc', glow: '#7fe8ff', mood: 'furious', thermal: 0.3, element: 'stone' },
  { tier: 24, name: 'Amber Warden', property: 'Fossil Amber', body: '#e08a14', bodyLight: '#ffe08a', accent: '#7a3d0a', glow: '#ffc24a', mood: 'shiny', thermal: 0.4, element: 'gold' },
  { tier: 25, name: 'Dune Djinn', property: 'Living Sand', body: '#d9ac62', bodyLight: '#f6dca0', accent: '#2fc6b8', glow: '#f0cf8a', mood: 'furious', thermal: 0.6, element: 'wind' },
  { tier: 26, name: 'Caustic Flask', property: 'Bottled Acid', body: '#4fd62a', bodyLight: '#c8ff7a', accent: '#c28a52', glow: '#9dff4a', mood: 'boil', thermal: 0.5, element: 'water' },
  { tier: 27, name: 'Bramble Heart', property: 'Thornwood', body: '#3f8a34', bodyLight: '#8fd66a', accent: '#ffe66b', glow: '#b8f070', mood: 'sprout', thermal: 0.3, element: 'stone' },
  { tier: 28, name: 'Coral Monarch', property: 'Living Coral', body: '#f5907c', bodyLight: '#ffd8c8', accent: '#ff7a45', glow: '#ffb09a', mood: 'furious', thermal: 0.2, element: 'water' },
  { tier: 29, name: 'Glowcap Sage', property: 'Moon Fungus', body: '#6655d6', bodyLight: '#a99bff', accent: '#7ff6ff', glow: '#8ff0ff', mood: 'shiny', thermal: 0.2, element: 'cosmic' },
  { tier: 30, name: 'Stormcloud Fury', property: 'Thunderhead', body: '#4a5675', bodyLight: '#9aa7c4', accent: '#ffe24a', glow: '#ffe86b', mood: 'spark', thermal: 0.3, element: 'wind' },
  { tier: 31, name: 'Jade Oracle', property: 'Carved Jade', body: '#23a46e', bodyLight: '#8ff0c4', accent: '#ffd35a', glow: '#7fffc4', mood: 'shiny', thermal: 0.2, element: 'stone' },
  { tier: 32, name: 'Rune Monolith', property: 'Runestone', body: '#737d91', bodyLight: '#b8c1d2', accent: '#5ff0ff', glow: '#7ff6ff', mood: 'furious', thermal: 0.1, element: 'stone' },
  { tier: 33, name: 'Chrono Engine', property: 'Clockwork', body: '#c48a2e', bodyLight: '#ffe08a', accent: '#fff4d8', glow: '#ffd27a', mood: 'furious', thermal: 0.4, element: 'cosmic' },
  { tier: 34, name: 'Origami Spirit', property: 'Folded Paper', body: '#ece5d6', bodyLight: '#ffffff', accent: '#e8453c', glow: '#fff3e0', mood: 'furious', thermal: 0.1, element: 'wind' },
  { tier: 35, name: 'Bubble Sprite', property: 'Soap Film', body: '#9fd8ff', bodyLight: '#ffffff', accent: '#ff9ad5', glow: '#c8f0ff', mood: 'puffy', thermal: 0.0, element: 'water' },
  { tier: 36, name: 'Glitch Cube', property: 'Corrupt Data', body: '#1ab8e6', bodyLight: '#8ffaff', accent: '#ffe23a', glow: '#4ff6ff', mood: 'spark', thermal: 0.5, element: 'cosmic' },
  { tier: 37, name: 'Echo Bell', property: 'Resonance', body: '#c98a2e', bodyLight: '#ffd27a', accent: '#ffe9a8', glow: '#ffe0a0', mood: 'furious', thermal: 0.3, element: 'wind' },
  { tier: 38, name: 'Spirit Lantern', property: 'Soulfire', body: '#3a3f4f', bodyLight: '#6a7288', accent: '#7ff0ff', glow: '#7ff0ff', mood: 'burning', thermal: 0.7, element: 'cosmic' },
  { tier: 39, name: 'Mirror Specter', property: 'Living Glass', body: '#b3a3ec', bodyLight: '#f1eaff', accent: '#3fd8c0', glow: '#e0d4ff', mood: 'shiny', thermal: 0.1, element: 'ice' },
  { tier: 40, name: 'Ruby Heart', property: 'Heartfire Ruby', body: '#d4173d', bodyLight: '#ff8aa0', accent: '#ffd23a', glow: '#ff5a78', mood: 'furious', thermal: 0.8, element: 'fire' },
  { tier: 41, name: 'Frostfire Wisp', property: 'Cold Flame', body: '#3f8fe8', bodyLight: '#e8fbff', accent: '#bff4ff', glow: '#8fdcff', mood: 'frost', thermal: 0.0, element: 'ice' },
  { tier: 42, name: 'Diamond Paragon', property: 'Flawless Diamond', body: '#8fd4f5', bodyLight: '#ffffff', accent: '#ffc27a', glow: '#e6f8ff', mood: 'shiny', thermal: 0.0, element: 'ice' },
  { tier: 43, name: 'Plasma Dynamo', property: 'Contained Plasma', body: '#9a4dff', bodyLight: '#dcc4ff', accent: '#ffd65a', glow: '#c9a6ff', mood: 'spark', thermal: 0.9, element: 'cosmic' },
  { tier: 44, name: 'Comet Herald', property: 'Comet Ice', body: '#6fb8f0', bodyLight: '#ffffff', accent: '#bfe6ff', glow: '#aee0ff', mood: 'frost', thermal: 0.1, element: 'ice' },
  { tier: 45, name: 'Aurora Seraph', property: 'Polar Light', body: '#44d6b0', bodyLight: '#b8ffd8', accent: '#b06bff', glow: '#8affc8', mood: 'puffy', thermal: 0.2, element: 'wind' },
  { tier: 46, name: 'Solar Emperor', property: 'Stellar Fire', body: '#ff9a1a', bodyLight: '#fff6b0', accent: '#ff5a1a', glow: '#ffc24a', mood: 'blaze', thermal: 1.0, element: 'fire' },
  { tier: 47, name: 'Wishing Star', property: 'Starlight', body: '#ffc81a', bodyLight: '#fffbe0', accent: '#c7b6ff', glow: '#ffe98a', mood: 'shiny', thermal: 0.5, element: 'cosmic' },
  { tier: 48, name: 'Pulsar Beacon', property: 'Neutron Star', body: '#5ab8f5', bodyLight: '#ffffff', accent: '#a78bff', glow: '#bfe9ff', mood: 'spark', thermal: 0.6, element: 'cosmic' },
  { tier: 49, name: 'Dark Matter', property: 'Unseen Mass', body: '#2a1850', bodyLight: '#5a3a96', accent: '#b07bff', glow: '#b07bff', mood: 'cosmic', thermal: 0.3, element: 'shadow' },
  { tier: 50, name: 'Singularity Prime', property: 'Event Horizon', body: '#0c0814', bodyLight: '#3a2a4a', accent: '#ffb13b', glow: '#ffcf8a', mood: 'blaze', thermal: 1.0, element: 'shadow' }
]

/** First and last elemental tier. */
export const ELEMENTAL_FIRST_TIER = 21
export const ELEMENTAL_LAST_TIER = ELEMENTAL_FIRST_TIER + ELEMENTALS.length - 1

export const getIngredient = (tier: number): Ingredient => {
  if (tier <= INGREDIENTS.length) return INGREDIENTS[Math.max(0, tier - 1)]!
  if (tier >= ELEMENTAL_FIRST_TIER) {
    // Past the last elemental, merges keep climbing in the capstone's colours.
    const e = ELEMENTALS[Math.min(ELEMENTALS.length - 1, tier - ELEMENTAL_FIRST_TIER)]!
    return tier === e.tier ? e : { ...e, tier }
  }
  const top = INGREDIENTS[INGREDIENTS.length - 1]!
  return { ...top, tier, element: HIGH_TIER_ELEMENTS[tier] ?? top.element }
}
