// ─── Time freeze: the scripted "open it NOW" lesson of levels 1 and 2 ───────────────────────────────
//
// A new player who falls into an updraft with the umbrella shut would die below it, and has not yet learned that
// opening it inside the current carries him up. At the last moment that still saves him, the game freezes and a
// lightbox lights the umbrella control (components/umbrella/TimeFreeze.vue); the click that opens it is the lesson.
//
// It only fires when it would genuinely help — the world is simulated forward from the live state, headless, with the
// engine's own `step`, three times with a neutral stick:
//   1. nothing pressed       → he dies (splat or out of bounds): there is a life to save;
//   2. open right now        → he is carried upward inside a current: opening is the rescue;
//   3. open FREEZE_MARGIN later → that no longer works (too late, or the canopy would break): this is the last moment,
//                             so a player who reacts in time is never interrupted.
// Anything else (he lands anyway, no current under him, opening now is already too late) never freezes.

import { liveWinds, step, windInfluence, type Input, type World } from './engine'
import type { Tuning } from './tuning'

/** The engine's fixed tick (UmbrellaScene.vue DT). */
const DT = 1 / 120
/** How far ahead the simulations look (s). */
const HORIZON = 6
/** The slack left to the player when the freeze fires (s): roughly a reaction time. */
export const FREEZE_MARGIN = 0.3
/** Rising faster than this (px/s, upward) under an open canopy inside a current counts as "flying up". */
const RISE = 40
/** The freeze is taught this many times in all (each time the player takes the click), then never again. */
export const FREEZE_LESSONS = 2

const NO_INPUT: Input = { left: false, right: false, toggle: false }

/** A copy `step` can mutate freely: the level (read only) is shared, everything the engine writes is copied. */
const fork = (w: World): World => ({
  ...w,
  channels: { ...w.channels },
  buttonsDown: [...w.buttonsDown],
  buttonsUsed: w.buttonsUsed && [...w.buttonsUsed],
  starsGot: [...w.starsGot],
  gateInside: [...w.gateInside],
  platforms: w.platforms.map((p) => ({ ...p })),
  hazards: w.hazards.map((h) => ({ ...h })),
  player: { ...w.player }
})

const insideCurrent = (w: World, t: Tuning): boolean => liveWinds(w).some((wind) => windInfluence(w.player, wind, t.windEdge) > 0)

/** Where `step` ends up if the umbrella is toggled after `delay` seconds (Infinity: never). */
const outcome = (w: World, t: Tuning, delay: number): 'died' | 'rose' | 'neither' => {
  const s = fork(w)
  const toggleAt = Math.round(delay / DT)
  for (let i = 0; i < HORIZON / DT; i++) {
    const events = step(s, { ...NO_INPUT, toggle: i === toggleAt }, DT, t)
    if (events.includes('break')) return 'neither'
    if (s.phase === 'splat' || s.phase === 'out') return 'died'
    if (s.phase !== 'play') return 'neither'
    if (s.player.open && s.player.vy < -RISE && insideCurrent(s, t)) return 'rose'
  }
  return 'neither'
}

/**
 * Is this the last moment an opening umbrella inside a current still saves a player who would otherwise die?
 * Cheap when it cannot be: only a falling player with a shut umbrella inside a live current is simulated at all.
 */
export const isLastChanceInCurrent = (w: World, t: Tuning): boolean => {
  const pl = w.player
  if (w.phase !== 'play' || pl.open || pl.broken || pl.grounded || pl.vy <= 0) return false
  if (!insideCurrent(w, t)) return false
  return outcome(w, t, Infinity) === 'died' && outcome(w, t, 0) === 'rose' && outcome(w, t, FREEZE_MARGIN) !== 'rose'
}
