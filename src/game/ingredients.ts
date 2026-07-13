/**
 * Ingredient catalogue — the 10 elemental fighters of Merge Idle War (GDD §3.2).
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

/** Top tier on the merge ladder. */
export const MAX_INGREDIENT_TIER = INGREDIENTS.length

// Tiers 12-20 have authored art (fighter-12..20.webp) but reuse the top tier's
// look/colours; only the combat ELEMENT is overridden so the ranged ones fire
// the right projectile/impact VFX (13 → shadow like t8, 15/19 → cosmic like t7,
// 16 → wind like t2, 17 → shadow like t8). Melee tiers (12,14,18,20) never fire
// a projectile, so their element is irrelevant.
const HIGH_TIER_ELEMENTS: Record<number, ElementKind> = {
  13: 'shadow', 15: 'cosmic', 16: 'wind', 17: 'shadow', 19: 'cosmic'
}

export const getIngredient = (tier: number): Ingredient => {
  if (tier <= INGREDIENTS.length) return INGREDIENTS[Math.max(0, tier - 1)]!
  const top = INGREDIENTS[INGREDIENTS.length - 1]!
  return { ...top, tier, element: HIGH_TIER_ELEMENTS[tier] ?? top.element }
}
