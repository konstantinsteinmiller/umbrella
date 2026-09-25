/**
 * The death sequence (playtest run 7 — the lose rule, taught by the loss
 * itself). It retired the first-danger overrun demo: in still frames the
 * demo read as "an unexplained red overlay", and on a boss as a sprite glitch.
 * On a real breach:
 *
 *   • the monsters past the line go for the unit: the one nearest it (the
 *     striker) winds up (DEATH_WIND), lunges into it (DEATH_LUNGE) and
 *     recoils (DEATH_RECOIL) to loom over the wreck; the others surge a step
 *     at it, staggered;
 *   • at the strike (DEATH_HIT) the unit TEARS APART: SHARD_N × SHARD_N
 *     pieces of its own sprite fly, bounce and come to rest on the floor,
 *     going ash grey, and the board dims red-black round the wreck;
 *   • the DOM's "WASTED" (DeathOverlay) holds over it until the state layer
 *     opens the death screen, DEATH_SCENE_MS after the breach (useBarrage
 *     `deathScene`).
 *
 * Reduced motion: no lunge and no flight — the striker flashes white and the
 * pieces lie on the floor from the strike. Display only: the engine waits in
 * 'breach' the whole time. Pure rules here (tested on their own);
 * BoardRenderer draws.
 *
 * Playtest run 9 ("I never saw … which enemy crossed the line"; in German
 * "GEFALLEN" over the greyed boss read as the BOSS dying): the striker is the
 * culprit — it keeps its colour with a red outline while the rest drains to
 * grey (DeathOverlay leaves a clear pool round `deathFocus`), and the loss
 * screen names it (`pickStriker` picks the same monster for both).
 */
import { ROWS, type Monster } from '../engine/types'

/**
 * The striker: of the monsters standing past the line, the one nearest the
 * unit at `ux` (cells). Null: none past it. One rule for the death sequence
 * and the loss screen's culprit, so the monster named is the one seen.
 */
export const pickStriker = <M extends Pick<Monster, 'row' | 'h' | 'col' | 'w'>>(monsters: readonly M[], ux: number): M | null => {
  let best = Infinity
  let pick: M | null = null
  for (const m of monsters) {
    if (m.row + m.h <= ROWS) continue
    const dist = Math.abs(m.col + m.w / 2 - ux)
    if (dist < best) {
      best = dist
      pick = m
    }
  }
  return pick
}

/** Wind-up, lunge and recoil of the striker (s); the strike lands at DEATH_HIT. */
export const DEATH_WIND = 0.14
export const DEATH_LUNGE = 0.12
export const DEATH_HIT = DEATH_WIND + DEATH_LUNGE
export const DEATH_RECOIL = 0.34
/** The lunge curve's wind-up depth (a share of it; `deathLunge`) and how far
 *  the striker rears back then (cells — it stands on the unit already, as
 *  often as not); after the recoil it looms at DEATH_LOOM of the way, over
 *  the wreck. */
export const DEATH_BACK = 0.14
export const DEATH_BACK_CELLS = 0.4
export const DEATH_LOOM = 0.4
/** The other breachers' surge at the unit (cells down / sideways) and the
 *  stagger between them (s). */
export const DEATH_SURGE = 0.35
export const DEATH_SURGE_SIDE = 0.2
export const DEATH_STAGGER = 0.05
/** The torn unit's pieces per side, and the time they take to go ash grey (s). */
export const SHARD_N = 4
export const SHARD_ASH = 0.9
/**
 * Breach → death screen (ms): the strike, then "WASTED" holds ~2 s over the
 * wreck (the brief: "the game stays in this state for 2 seconds").
 */
export const DEATH_SCENE_MS = 2400

const SHARD_G = 26
const SHARD_BOUNCE = 0.32
const SHARD_REST_V = 1.6
/** The pieces keep this far (cells) inside the side walls. */
const SHARD_WALL = 0.08

const easeOut = (u: number): number => 1 - (1 - u) * (1 - u)

/**
 * The striker's lunge at death time `t` (s) as a share of the way from where
 * it stands to the unit: back to −DEATH_BACK over the wind-up, 1 at the strike
 * (accelerating in), eased back to DEATH_LOOM over the recoil, then held.
 * The other breachers run the same curve, later by their stagger.
 */
export const deathLunge = (t: number): number => {
  if (t <= 0) return 0
  if (t < DEATH_WIND) return -DEATH_BACK * easeOut(t / DEATH_WIND)
  if (t < DEATH_HIT) {
    const u = (t - DEATH_WIND) / DEATH_LUNGE
    return -DEATH_BACK + (1 + DEATH_BACK) * u * u
  }
  if (t < DEATH_HIT + DEATH_RECOIL) return 1 - (1 - DEATH_LOOM) * easeOut((t - DEATH_HIT) / DEATH_RECOIL)
  return DEATH_LOOM
}

/**
 * The striker's offset (cells) at death time `t`, lunging (dx, dy) into the
 * unit (`out`, no allocation): it rears DEATH_BACK_CELLS away from the unit
 * over the wind-up — straight up when it stands on the unit already — then
 * the lunge, the recoil and the loom follow `deathLunge`.
 */
export const strikeOffset = (t: number, dx: number, dy: number, out: { x: number; y: number }): void => {
  const k = deathLunge(t)
  if (k >= 0) {
    out.x = dx * k
    out.y = dy * k
    return
  }
  const back = (k / DEATH_BACK) * DEATH_BACK_CELLS
  const len = Math.hypot(dx, dy)
  if (len < 0.3) {
    out.x = 0
    out.y = back
    return
  }
  out.x = (dx / len) * back
  out.y = (dy / len) * back
}

/** A piece of the torn unit: cell (i, j) of its sprite's content box, its
 *  centre and velocity (cells, cells/s), spin (rad, rad/s), the floor line
 *  it lands on, and whether it has come to rest. */
export interface Shard {
  i: number
  j: number
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  floor: number
  rest: boolean
}

const newShard = (): Shard => ({ i: 0, j: 0, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, floor: 0, rest: false })

/**
 * Tear the unit apart: fills `out` with SHARD_N² pieces of a w × h (cells)
 * unit centred on `ux` with its feet on `feetY`, landing on `floorY` (plus a
 * little depth scatter). They fly out from its middle, the top ones higher,
 * all pushed a little toward `push` (−1..1: away from the striker). Reduced
 * motion: they lie on the floor at once, in a heap round `ux`. `rnd` in [0, 1).
 */
export const tearUnit = (
  out: Shard[], ux: number, feetY: number, w: number, h: number, floorY: number,
  push: number, reduced: boolean, cols: number, rnd: () => number
): void => {
  const n = SHARD_N
  out.length = Math.min(out.length, n * n)
  let k = 0
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const p = out[k] ?? (out[k] = newShard())
      k++
      const fx = (i + 0.5) / n - 0.5
      const fy = (j + 0.5) / n
      p.i = i
      p.j = j
      p.floor = floorY - rnd() * 0.12
      if (reduced) {
        p.x = clampX(ux + fx * w * 1.9 + (rnd() - 0.5) * 0.2, cols)
        p.y = p.floor
        p.vx = p.vy = p.vr = 0
        p.rot = (rnd() - 0.5) * 2.4
        p.rest = true
        continue
      }
      p.x = ux + fx * w
      p.y = feetY - h + fy * h
      p.vx = fx * 7 + push * 1.8 + (rnd() - 0.5) * 2
      p.vy = -3 - (1 - fy) * 3.5 - rnd() * 1.8
      p.rot = 0
      p.vr = (rnd() - 0.5) * 18
      p.rest = false
    }
  }
}

const clampX = (x: number, cols: number): number =>
  x < SHARD_WALL ? SHARD_WALL : x > cols - SHARD_WALL ? cols - SHARD_WALL : x

/** Advance the pieces by `dt` (s): gravity, a soft bounce off the floor and
 *  the side walls; a slow landing comes to rest where it lies. */
export const stepShards = (shards: Shard[], dt: number, cols: number): void => {
  if (dt <= 0) return
  for (let k = 0; k < shards.length; k++) {
    const p = shards[k]!
    if (p.rest) continue
    p.vy += SHARD_G * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.rot += p.vr * dt
    if (p.x < SHARD_WALL || p.x > cols - SHARD_WALL) {
      p.x = clampX(p.x, cols)
      p.vx = -p.vx * 0.5
    }
    if (p.y >= p.floor && p.vy > 0) {
      p.y = p.floor
      if (p.vy < SHARD_REST_V) {
        p.vx = p.vy = p.vr = 0
        p.rest = true
        continue
      }
      p.vy = -p.vy * SHARD_BOUNCE
      p.vx *= 0.55
      p.vr *= 0.5
    }
  }
}
