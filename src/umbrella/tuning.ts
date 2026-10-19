// ─── Feel parameters ────────────────────────────────────────────────────────
//
// Every number the GDD asks the designers to "find what feels right and send
// the decimal" for lives here. The tuning panel (T key) edits this object live
// and persists it under `umb_tuning`; "Copy values" puts the current set on the
// clipboard for Discord.
//
// Units: world pixels (a 1280×720 screen at zoom 1) and seconds.

export interface Tuning {
  /** Downward acceleration with the umbrella closed (px/s²). */
  gravity: number
  /** Max fall speed with the umbrella closed (px/s). */
  terminalVelocity: number
  /** Reopening at or above this fraction of terminal velocity breaks the umbrella. */
  breakFraction: number
  /** Landing at or above this fraction of terminal velocity is a splat. */
  splatFraction: number
  /** Gentle descent speed with the umbrella open (px/s). */
  floatSpeed: number
  /** Time for an open umbrella to brake a fall down to float speed (s). */
  brakingSnap: number
  /** Time for a wind current to turn the player into its direction (s). */
  windTurnTime: number
  /** Ground walk speed (px/s) and time to reach it (s). */
  walkSpeed: number
  walkAccelTime: number
  /** Top horizontal air speed (px/s) and time to turn around / reach it (s). */
  airSpeed: number
  airTurnTime: number
  /** Air drag when no direction is held — low, so the player drifts (px/s²). */
  airDrag: number
  /** How long the whistling fall fades out after leaving the screen (s). */
  whistleFade: number
  /** Pause on the splat before the level resets (s). 0 = instant. */
  splatReset: number
}

export const DEFAULT_TUNING: Tuning = {
  gravity: 1800,
  terminalVelocity: 1400,
  breakFraction: 0.97,
  splatFraction: 0.95,
  floatSpeed: 120,
  brakingSnap: 0.15,
  windTurnTime: 0.6,
  walkSpeed: 320,
  walkAccelTime: 0.12,
  airSpeed: 280,
  airTurnTime: 0.65,
  airDrag: 260,
  whistleFade: 1.2,
  splatReset: 0.5
}

/** Slider ranges for the tuning panel. */
export const TUNING_RANGES: Record<keyof Tuning, [min: number, max: number, step: number]> = {
  gravity: [300, 5000, 50],
  terminalVelocity: [300, 4000, 50],
  breakFraction: [0.5, 1, 0.01],
  splatFraction: [0.3, 1, 0.01],
  floatSpeed: [20, 500, 5],
  brakingSnap: [0.02, 1, 0.01],
  windTurnTime: [0.1, 2, 0.05],
  walkSpeed: [50, 800, 10],
  walkAccelTime: [0.01, 1, 0.01],
  airSpeed: [50, 800, 10],
  airTurnTime: [0.05, 2, 0.05],
  airDrag: [0, 2000, 10],
  whistleFade: [0, 5, 0.1],
  splatReset: [0, 2, 0.05]
}
