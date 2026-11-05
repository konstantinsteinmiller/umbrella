// ─── The controls page (components/umbrella/ControlsExplain.vue) ────────────────────────────────────
//
// A wordless page before a new player's first level: the three lessons of lessonArt.ts side by side (steering; the umbrella
// opening by itself when he steps off a ledge; the open / close control), in the touch or the keyboard version of the device.
// Once per player, behind a feature flag: VITE_APP_CONTROLS_EXPLAIN=true (root .env, and the Pages workflow); anything else
// leaves it out. (The level editor's Controls boards carry the same lessons into a level.)

export const CONTROLS_EXPLAIN = import.meta.env.VITE_APP_CONTROLS_EXPLAIN === 'true'
/** Touch steering without the drawn thumb stick: VITE_APP_MOBILE_THUMB_DISABLED=true (root .env, and the Pages workflow)
 *  hides the stick and its knob and leaves the whole left side of the screen to steer with (a finger's own start point is
 *  the neutral one); anything else keeps the stick drawn. */
export const MOBILE_THUMB_DISABLED = import.meta.env.VITE_APP_MOBILE_THUMB_DISABLED === 'true'
/** Saved once the player has gone past it. */
export const CONTROLS_EXPLAINED_KEY = 'umb_controls_explained'
