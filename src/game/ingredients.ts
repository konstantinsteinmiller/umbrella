/**
 * Ingredient catalogue — the 10 living elemental units of Merge Alchemy Lab
 * (GDD §3.2). Each tier is a fundamental chemical state with an anthropomorphic
 * face. Colours follow the GDD's "Vibrant Stylized Vector Cartoon" direction:
 * saturated bodies with bold black linework, drawn as inline SVG in
 * `IngredientUnit.vue` from these descriptors.
 *
 * Names are game proper-nouns and live here as display content; UI chrome is
 * routed through i18n. (Full localisation of entity names is a roadmap item.)
 */

export type FaceMood = 'furious' | 'burning' | 'puffy' | 'sprout' | 'blaze' | 'boil' | 'spark' | 'frost' | 'shiny' | 'cosmic'

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
}

export const INGREDIENTS: Ingredient[] = [
  { tier: 1, name: 'Living Droplet', property: 'Water / Base Fluid', body: '#e8453c', bodyLight: '#ff7a6e', accent: '#7fd6ff', glow: '#ff6b5e', mood: 'furious', thermal: 0.05 },
  { tier: 2, name: 'Ember Squirt', property: 'Minor Thermal', body: '#ff7a18', bodyLight: '#ffb15a', accent: '#ffe23a', glow: '#ff9a3c', mood: 'burning', thermal: 0.35 },
  { tier: 3, name: 'Vapor Chunk', property: 'Pressure / Gas', body: '#8fd3ff', bodyLight: '#cdeeff', accent: '#ffffff', glow: '#bfe6ff', mood: 'puffy', thermal: 0.1 },
  { tier: 4, name: 'Bio-Sprout', property: 'Organic / Flora', body: '#3fbf4f', bodyLight: '#86e88f', accent: '#1d7a2a', glow: '#5fe06f', mood: 'sprout', thermal: 0.15 },
  { tier: 5, name: 'Pyro-Core', property: 'High Thermal / Fire', body: '#ffd21f', bodyLight: '#fff07a', accent: '#ff4d1f', glow: '#ff8a1f', mood: 'blaze', thermal: 1.0 },
  { tier: 6, name: 'Acid Gland', property: 'Corrosive', body: '#9cff2e', bodyLight: '#caff7a', accent: '#3d8a00', glow: '#aaff3c', mood: 'boil', thermal: 0.3 },
  { tier: 7, name: 'Spark Spark', property: 'Electrical Volatility', body: '#22e0ff', bodyLight: '#a6f4ff', accent: '#fff64a', glow: '#5cf0ff', mood: 'spark', thermal: 0.4 },
  { tier: 8, name: 'Cryo-Shard', property: 'Sub-Zero Thermal', body: '#dff4ff', bodyLight: '#ffffff', accent: '#5ea8d8', glow: '#bfe6ff', mood: 'frost', thermal: 0.0 },
  { tier: 9, name: 'Aurum Paste', property: 'Catalyst', body: '#ffcd33', bodyLight: '#fff3b0', accent: '#b8860b', glow: '#ffe27a', mood: 'shiny', thermal: 0.25 },
  { tier: 10, name: 'Cosmic Mass', property: 'Dark Matter', body: '#7b2ff7', bodyLight: '#b07bff', accent: '#c0c0d8', glow: '#a05cff', mood: 'cosmic', thermal: 0.5 }
]

/** Top tier on the merge ladder. */
export const MAX_INGREDIENT_TIER = INGREDIENTS.length

export const getIngredient = (tier: number): Ingredient =>
  INGREDIENTS[Math.max(0, Math.min(INGREDIENTS.length - 1, tier - 1))]!
