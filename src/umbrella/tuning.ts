// ─── Feel parameters ────────────────────────────────────────────────────────
//
// Every number the GDD asks the designers to "find what feels right and send
// the decimal" for lives here. The tuning panel ("cmonc") edits this object live
// and persists it under `umb_tuning`; "Copy values" puts the current set on the
// clipboard for Discord.
//
// Units: world pixels (a 1280×720 screen at zoom 1) and seconds.

export interface Tuning {
  /** Player hitbox size (px). */
  playerWidth: number
  playerHeight: number
  /** Forgiveness on enemy/spike contact: the hitbox shrinks by this on every side (px). */
  hitboxInset: number
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
  /** Time for an open umbrella to settle back to float speed from a slower
   *  fall or a rise (s) — longer = softer bob at the top of an updraft. */
  floatEaseTime: number
  /** Time for a wind current to turn the player into its direction (s). */
  windTurnTime: number
  /** Depth of a current's soft leading edge where its push fades in (px). */
  windEdge: number
  /** How fast the bob at the top of an updraft dies out (1/s). Lower = longer bob. */
  bobDamping: number
  /** Multiplier on every level's wind speeds. */
  windScale: number
  /** Multiplier on Super Stream speeds (on top of windScale). */
  superStreamScale: number
  /** Time for a Super Stream to build an open umbrella up to its speed (s). */
  superStreamBuildTime: number
  /** Fraction of gravity an updraft takes off a closed umbrella's fall. */
  closedWindResistance: number
  /** Same, inside a Super Stream. */
  superClosedResistance: number
  /** Hitting a ceiling or wall at this speed or faster is a splat (px/s). */
  wallSplatSpeed: number
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
  /** How long the win dance plays before the next level (s). */
  winHold: number
  /** How far past the side edges counts as out of bounds (px). */
  outOfBoundsMargin: number
  /** Time multiplier for every enemy's movement (2 = twice as fast). */
  enemySpeedScale: number
  /** Time multiplier for every moving platform. */
  platformSpeedScale: number
  /** Attacking pillar cycle, as fractions of its period: rest, strike, hold (the rest is pull-back). */
  lungeRest: number
  lungeStrike: number
  lungeHold: number
  /** Fall speed (fraction of terminal velocity) where he turns sideways. */
  fallPoseSideways: number
  /** How quickly the fall pose rotates (1/s). */
  fallPoseEase: number
  /** Mix levels (1 = as designed): everything, the score, the one-shots, the wind bed. */
  masterVolume: number
  musicVolume: number
  sfxVolume: number
  windVolume: number
}

// GDD Revision 1 ("a weighted feather"): slower walk + walk-up, softer gravity,
// a gentler umbrella catch, a bob at the top of updrafts, floatier air turns.
export const DEFAULT_TUNING: Tuning = {
  playerWidth: 24,
  playerHeight: 36,
  hitboxInset: 3,
  gravity: 1550,
  terminalVelocity: 1900,
  breakFraction: 0.95,
  splatFraction: 0.8,
  floatSpeed: 85,
  brakingSnap: 0.1,
  floatEaseTime: 0.11,
  windTurnTime: 0.5,
  windEdge: 15,
  bobDamping: 0.2,
  windScale: 1.7,
  superStreamScale: 2.5,
  superStreamBuildTime: 1.2,
  closedWindResistance: 0.4,
  superClosedResistance: 0.6,
  wallSplatSpeed: 950,
  walkSpeed: 240,
  walkAccelTime: 0.09,
  airSpeed: 200,
  airTurnTime: 0.7,
  airDrag: 230,
  whistleFade: 1.2,
  splatReset: 0.5,
  winHold: 1.6,
  outOfBoundsMargin: 60,
  enemySpeedScale: 1,
  platformSpeedScale: 1,
  lungeRest: 0.45,
  lungeStrike: 0.15,
  lungeHold: 0.12,
  fallPoseSideways: 0.6,
  fallPoseEase: 3,
  masterVolume: 1,
  musicVolume: 0,
  sfxVolume: 1,
  windVolume: 1
}

/** Slider ranges for the tuning panel. */
export const TUNING_RANGES: Record<keyof Tuning, [min: number, max: number, step: number]> = {
  playerWidth: [8, 80, 1],
  playerHeight: [8, 120, 1],
  hitboxInset: [0, 12, 0.5],
  gravity: [300, 5000, 50],
  terminalVelocity: [300, 4000, 50],
  breakFraction: [0.5, 1, 0.01],
  splatFraction: [0.3, 1, 0.01],
  floatSpeed: [20, 500, 5],
  brakingSnap: [0.02, 1, 0.01],
  floatEaseTime: [0.05, 2, 0.01],
  windTurnTime: [0.1, 2, 0.05],
  windEdge: [1, 200, 1],
  bobDamping: [0, 10, 0.1],
  windScale: [0.2, 3, 0.05],
  superStreamScale: [0.2, 3, 0.05],
  superStreamBuildTime: [0.2, 5, 0.05],
  closedWindResistance: [0, 1, 0.01],
  superClosedResistance: [0, 1, 0.01],
  wallSplatSpeed: [100, 2000, 10],
  walkSpeed: [50, 800, 10],
  walkAccelTime: [0.01, 1, 0.01],
  airSpeed: [50, 800, 10],
  airTurnTime: [0.05, 2, 0.05],
  airDrag: [0, 2000, 10],
  whistleFade: [0, 5, 0.1],
  splatReset: [0, 2, 0.05],
  winHold: [0, 5, 0.1],
  outOfBoundsMargin: [0, 400, 5],
  enemySpeedScale: [0, 3, 0.05],
  platformSpeedScale: [0, 3, 0.05],
  lungeRest: [0, 0.9, 0.01],
  lungeStrike: [0.02, 0.5, 0.01],
  lungeHold: [0, 0.5, 0.01],
  fallPoseSideways: [0.1, 1, 0.01],
  fallPoseEase: [1, 40, 0.5],
  masterVolume: [0, 2, 0.05],
  musicVolume: [0, 2, 0.05],
  sfxVolume: [0, 2, 0.05],
  windVolume: [0, 2, 0.05]
}

/** Panel folders, in display order. */
export const TUNING_GROUPS: Record<string, (keyof Tuning)[]> = {
  Player: ['playerWidth', 'playerHeight'],
  Ground: ['walkSpeed', 'walkAccelTime'],
  'Falling (closed)': ['gravity', 'terminalVelocity', 'breakFraction', 'splatFraction'],
  Umbrella: ['floatSpeed', 'brakingSnap', 'floatEaseTime'],
  'Mid-air': ['airSpeed', 'airTurnTime', 'airDrag'],
  Wind: ['windTurnTime', 'windEdge', 'bobDamping', 'windScale', 'closedWindResistance'],
  'Super Stream': ['superStreamScale', 'superStreamBuildTime', 'superClosedResistance', 'wallSplatSpeed'],
  Enemies: ['enemySpeedScale', 'hitboxInset', 'lungeRest', 'lungeStrike', 'lungeHold'],
  'Moving platforms': ['platformSpeedScale'],
  'Fall pose': ['fallPoseSideways', 'fallPoseEase'],
  'Reset / audio': ['splatReset', 'winHold', 'outOfBoundsMargin', 'whistleFade'],
  Audio: ['masterVolume', 'musicVolume', 'sfxVolume', 'windVolume']
}
