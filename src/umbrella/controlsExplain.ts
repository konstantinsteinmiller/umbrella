// ─── The touch-controls lesson (components/umbrella/ControlsExplain.vue) ─────────────────────────────
//
// A short, wordless screen before a new touch player's first level: the left half of the screen steers (a finger
// sliding along an infinity line), the right half works the umbrella (a tap switches it open and shut). It shows once
// per player, on touch devices held in landscape, behind a feature flag: VITE_APP_MOBILE_CONTROLS_EXPLAIN=true
// (root .env, and the Pages workflow); anything else leaves it out.

export const MOBILE_CONTROLS_EXPLAIN = import.meta.env.VITE_APP_MOBILE_CONTROLS_EXPLAIN === 'true'
/** Saved once the player has tapped past it. */
export const CONTROLS_EXPLAINED_KEY = 'umb_controls_explained'
