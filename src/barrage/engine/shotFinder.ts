/**
 * Trial shots — play a volley on a CLONE of the live board and report what it
 * would do, without touching the real run.
 *
 * The coach (`use/useCoach.ts`) uses it to demonstrate shots that actually
 * work on the board the player is looking at — a bank shot through a gap that
 * racks up a combo, a rescue shot at the monster about to breach — instead of
 * a canned animation that may be nonsense on this board. The bot sim plays
 * clones the same way (`engine.clone()` + `settle()`).
 *
 * Deterministic: the clone carries the RNG state, so a player who matches the
 * angle exactly gets exactly this volley. Nobody matches it exactly — ball
 * paths diverge after a few bounces — which is why callers pick angles whose
 * neighbours score well too (`pickBest`).
 *
 * Cost: one volley + resolve + advance — under a millisecond to a few ms on a
 * desktop, ~8 ms median at 4× CPU throttle and up to ~75 ms for a 20-ball
 * late-game volley. So trials are RESUMABLE (`startTrial` → `step`): the coach
 * runs them in idle slices with a hard time budget, stopping mid-volley.
 */
import { STEP } from './physics'
import {
  BALL_R, FLOOR_Y, MIN_AIM, ROWS,
  type Ball, type BoardState, type EngineListener, type Phase, type SkillId
} from './types'

/** The slice of `BarrageEngine` a trial needs (structural, so tests and the
 *  state layer's `IBarrageEngine` both fit once they expose `clone`). */
export interface TrialEngine {
  readonly state: BoardState
  readonly stats: { hits: number; kills: number; damage: number; ballsCollected: number }
  clone(): TrialEngine
  fire(angle: number): boolean
  update(dt: number): void
  settle(maxSeconds?: number): Phase
  on(listener: EngineListener): () => void
}

export const canTrial = (e: unknown): e is TrialEngine =>
  !!e && typeof (e as { clone?: unknown }).clone === 'function'

export interface ShotTrial {
  angle: number
  /** Hits scored by the whole volley (the combo counter). */
  hits: number
  kills: number
  damage: number
  /** "+1" balls collected. */
  balls: number
  /** Skill bubbles the volley triggered, in order. */
  skills: SkillId[]
  /** The turn ends in a breach (after the march). */
  breach: boolean
  /** Damage / kills dealt to the monsters named in `threats`. */
  threatDamage: number
  threatKills: number
  /** Rows between the lowest monster and the breach line after the march
   *  (negative = breached). */
  rowsLeftAfter: number
  /** The FIRST ball's flight in cells, flat [x, y, x, y, …]: the launcher,
   *  every bounce, and where it came down. Balls fly straight between
   *  contacts, so this polyline is the exact path. */
  path: number[]
  /** The first ball's monster contacts, in order (flat x, y). */
  contacts: number[]
}

export interface TrialOptions {
  /** Monster ids whose damage / kills are tallied separately. */
  threats?: ReadonlySet<number>
  /** Cap on recorded path vertices (the demo draws the first few legs). */
  maxVertices?: number
  /** Cap on recorded contacts. */
  maxContacts?: number
}

const cross = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx

const lowestRowsLeft = (s: BoardState): number => {
  let bottom = -Infinity
  for (const m of s.monsters) if (m.row + m.h > bottom) bottom = m.row + m.h
  return bottom === -Infinity ? ROWS : ROWS - bottom
}

/** A trial in progress: `step` plays it forward until `outOfTime()` says
 *  stop (checked every few fixed steps) and returns true once it is done;
 *  `result` is final from then on. */
export interface TrialRun {
  readonly result: ShotTrial
  step(outOfTime: () => boolean): boolean
}

/** Fixed steps between two deadline checks inside `step`. */
const CHECK_EVERY = 12

/**
 * Fire `angle` on a clone of `engine` (which must be waiting in 'aim') and
 * play the turn out — RESUMABLY. One late-game volley (20+ balls) costs tens
 * of ms on a phone; the coach runs trials between frames, so a trial must be
 * able to stop mid-volley at its time budget and carry on next slice.
 *
 * The source engine is never touched: no state change, no events on its
 * listeners. `trialShot` below is the run-to-completion form.
 */
export const startTrial = (engine: TrialEngine, angle: number, opts: TrialOptions = {}): TrialRun => {
  const maxV = opts.maxVertices ?? 24
  const maxC = opts.maxContacts ?? 24
  const threats = opts.threats
  const out: ShotTrial = {
    angle, hits: 0, kills: 0, damage: 0, balls: 0, skills: [], breach: false,
    threatDamage: 0, threatKills: 0, rowsLeftAfter: lowestRowsLeft(engine.state), path: [], contacts: []
  }
  const done: TrialRun = { result: out, step: () => true }
  if (engine.state.phase !== 'aim') return done
  const c = engine.clone()
  const s = c.state
  const hits0 = c.stats.hits
  const kills0 = c.stats.kills
  const dmg0 = c.stats.damage
  const balls0 = c.stats.ballsCollected
  let firstId = -1
  c.on((e) => {
    switch (e.type) {
      case 'hit':
        if (threats?.has(e.monsterId)) out.threatDamage += e.dmg
        if (e.ballId === firstId && out.contacts.length < maxC * 2) out.contacts.push(e.x, e.y)
        break
      case 'dot':
        if (threats?.has(e.monsterId)) out.threatDamage += e.dmg
        break
      case 'kill':
        if (threats?.has(e.monsterId)) out.threatKills++
        break
      case 'skill':
        out.skills.push(e.skill)
        break
      default:
        break
    }
  })
  if (!c.fire(angle)) return done
  const first: Ball | undefined = s.balls[0]
  const path = out.path
  // Record the first ball's polyline: every direction change is a contact.
  // The vertex is where the old and the new flight lines cross — exact for
  // one bounce per step, instead of wherever the ball got to by the end of
  // that step (up to a third of a cell at 3× fast-forward).
  let px = 0
  let py = 0
  let vx = 0
  let vy = 0
  let landed = !first
  if (first) {
    firstId = first.id
    path.push(first.x, first.y)
    px = first.x
    py = first.y
    vx = first.vx
    vy = first.vy
  }
  const guard = Math.ceil(40 / STEP)
  let ticks = 0
  let finished = false

  /** One fixed step of the volley, with the first ball's vertex bookkeeping. */
  const volleyTick = (): void => {
    if (!first) { c.update(STEP); return }
    const ax = first.x
    const ay = first.y
    c.update(STEP)
    if (landed) return
    if (!first.active) {
      landed = true
      if (path.length < maxV * 2) path.push(first.x, Math.min(FLOOR_Y - BALL_R, first.y))
      return
    }
    if (first.vx === vx && first.vy === vy) return
    const d = cross(vx, vy, first.vx, first.vy)
    const dot = vx * first.vx + vy * first.vy
    let hx = first.x
    let hy = first.y
    if (Math.abs(d) > 1e-9) {
      const t = cross(first.x - px, first.y - py, first.vx, first.vy) / d
      const ix = px + vx * t
      const iy = py + vy * t
      // Only trust a crossing that lies near where the ball is now.
      if (t >= 0 && Math.abs(ix - first.x) + Math.abs(iy - first.y) < 1.2) { hx = ix; hy = iy }
    } else if (dot < 0) {
      // Head-on reversal (straight up into a face and straight back down):
      // the lines coincide, so the contact is how far the ball got along
      // its old heading this step — out by k, back by L − k.
      const sp = Math.hypot(vx, vy) || 1
      const ux = vx / sp
      const uy = vy / sp
      const L = sp * STEP * (s.speedMul || 1)
      const k = Math.max(0, ((first.x - ax) * ux + (first.y - ay) * uy + L) / 2)
      hx = ax + ux * k
      hy = ay + uy * k
    }
    vx = first.vx
    vy = first.vy
    // Pierce and knockback leave the heading alone: a same-direction
    // "change" (speed only) is not a vertex.
    if (Math.abs(d) <= 1e-9 && dot >= 0) return
    if (path.length < maxV * 2) path.push(hx, hy)
    px = hx
    py = hy
  }

  const finish = (): void => {
    finished = true
    out.hits = c.stats.hits - hits0
    out.kills = c.stats.kills - kills0
    out.damage = c.stats.damage - dmg0
    out.balls = c.stats.ballsCollected - balls0
    out.breach = s.phase === 'breach'
    out.rowsLeftAfter = lowestRowsLeft(s)
  }

  return {
    result: out,
    step(outOfTime: () => boolean): boolean {
      if (finished) return true
      for (;;) {
        for (let k = 0; k < CHECK_EVERY; k++) {
          if (s.phase === 'volley' && ticks < guard) {
            volleyTick()
            ticks++
          } else {
            // Resolve + march: plays out to the next aim (or the breach).
            const p = c.settle(STEP * CHECK_EVERY)
            if (p === 'aim' || p === 'breach' || ticks++ >= guard * 2) { finish(); return true }
            break
          }
        }
        if (outOfTime()) return false
      }
    }
  }
}

/** Run a trial to completion (tests, the bot sim, anything off the frame loop). */
export const trialShot = (engine: TrialEngine, angle: number, opts: TrialOptions = {}): ShotTrial => {
  const run = startTrial(engine, angle, opts)
  while (!run.step(() => false)) { /* never out of time */ }
  return run.result
}

/** `n` launch angles spread evenly across the valid fan. */
export const aimFan = (n: number): number[] => {
  const k = Math.max(2, Math.floor(n))
  const span = Math.PI - 2 * MIN_AIM
  return Array.from({ length: k }, (_, i) => MIN_AIM + (span * i) / (k - 1))
}

/**
 * Index of the best trial under `score`, preferring angles whose NEIGHBOURS
 * also score well (half its own score, a quarter each neighbour): a spike
 * nobody can hit within a couple of degrees teaches nothing. Trials must be
 * in fan order. Returns −1 for an empty list.
 */
export const pickBest = (trials: readonly ShotTrial[], score: (t: ShotTrial) => number): number => {
  const n = trials.length
  if (n === 0) return -1
  const raw = trials.map(score)
  let best = -1
  let bestV = -Infinity
  for (let i = 0; i < n; i++) {
    const l = raw[i > 0 ? i - 1 : i]!
    const r = raw[i < n - 1 ? i + 1 : i]!
    const v = raw[i]! * 0.5 + (l + r) * 0.25
    if (v > bestV) { bestV = v; best = i }
  }
  return best
}

/** Median of the trials' `score` (the "any old shot" baseline). */
export const medianOf = (trials: readonly ShotTrial[], score: (t: ShotTrial) => number): number => {
  if (trials.length === 0) return 0
  const v = trials.map(score).sort((a, b) => a - b)
  return v[Math.floor(v.length / 2)]!
}
