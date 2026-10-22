// ─── Umbrella simulation ────────────────────────────────────────────────────
//
// Pure, renderer-free: `step(world, input, dt)` advances one fixed tick and
// returns the events it produced (for audio / UI). Tests drive it headless.

import type { HazardDef, LevelDef, Motion, PlatformDef, WindDef } from './levels'
import type { Tuning } from './tuning'

/** Default hitbox; the live size comes from Tuning (player.w / player.h). */
export const PLAYER_W = 24
export const PLAYER_H = 36

export interface Input {
  left: boolean
  right: boolean
  /** Space pressed this tick (edge, not held). */
  toggle: boolean
}

export type Phase = 'play' | 'win' | 'splat' | 'out'

export interface Platform extends PlatformDef {
  /** Movement this tick, carried onto a player standing on it. */
  dx: number
  dy: number
}

export interface Hazard extends HazardDef {
  dx: number
  dy: number
  /** Proximity-triggered lunge: enemy time of the current attack. */
  lungeAt?: number
}

/** A triggered lunge's default reach when the level gives none. */
export const DEFAULT_TRIGGER_RADIUS = 300

export interface Player {
  x: number
  y: number
  vx: number
  vy: number
  grounded: boolean
  open: boolean
  broken: boolean
  facing: 1 | -1
  /** Hitbox size (follows Tuning.playerWidth / playerHeight). */
  w: number
  h: number
  /** Platform index the player stands on, or -1. */
  standing: number
}

export interface World {
  level: LevelDef
  time: number
  /** Movement clocks, advanced at Tuning.platformSpeedScale / enemySpeedScale. */
  platformTime: number
  enemyTime: number
  platforms: Platform[]
  hazards: Hazard[]
  player: Player
  phase: Phase
  /** Seconds spent in the current phase. */
  phaseTime: number
}

export type GameEvent = 'open' | 'close' | 'break' | 'land' | 'win' | 'splat' | 'hit' | 'out'

/** Attacking-pillar cycle fractions (Tuning.lungeRest/Strike/Hold). */
export interface LungeShape { rest: number; strike: number; hold: number }
const DEFAULT_LUNGE: LungeShape = { rest: 0.45, strike: 0.15, hold: 0.12 }

const platformCenter = (m: Motion, t: number, lunge: LungeShape) => {
  switch (m.kind) {
    case 'static':
      return null
    case 'line': {
      const k = 0.5 - 0.5 * Math.cos((t / m.period) * Math.PI * 2)
      return { x: m.a.x + (m.b.x - m.a.x) * k, y: m.a.y + (m.b.y - m.a.y) * k }
    }
    case 'circle': {
      const a = (t / m.period) * Math.PI * 2
      return { x: m.center.x + Math.cos(a) * m.radius, y: m.center.y + Math.sin(a) * m.radius }
    }
    case 'swing': {
      const a = Math.sin((t / m.period) * Math.PI * 2) * m.amplitude
      return { x: m.pivot.x + Math.sin(a) * m.radius, y: m.pivot.y + Math.cos(a) * m.radius }
    }
    case 'lunge': {
      // Rest, strike, hold, then pull back for the rest of the period.
      const f = ((t / m.period) % 1 + 1) % 1
      const ease = (x: number) => x * x * (3 - 2 * x)
      const a = lunge.rest
      const b = Math.min(1, a + lunge.strike / Math.max(0.05, m.speed ?? 1))
      const c = Math.min(1, b + lunge.hold)
      const k = f < a ? 0 : f < b ? ease((f - a) / (b - a)) : f < c ? 1 : 1 - ease((f - c) / Math.max(1e-6, 1 - c))
      return { x: m.a.x + (m.b.x - m.a.x) * k, y: m.a.y + (m.b.y - m.a.y) * k }
    }
    case 'arrive': {
      const f = Math.min(1, Math.max(0, (t - m.delay) / m.duration))
      const k = 1 - (1 - f) * (1 - f) * (1 - f)
      return { x: m.a.x + (m.b.x - m.a.x) * k, y: m.a.y + (m.b.y - m.a.y) * k }
    }
  }
}

const placeMover = (p: { x: number; y: number; w: number; h: number; motion?: Motion }, t: number, lunge = DEFAULT_LUNGE): void => {
  if (!p.motion) return
  const c = platformCenter(p.motion, t, lunge)
  if (!c) return
  p.x = c.x - p.w / 2
  p.y = c.y - p.h / 2
}

/** Places every mover where it is at time `t` (the level editor's preview). */
export const poseMovers = (w: World, t: number, tuning?: Tuning): void => {
  const lunge = tuning ? { rest: tuning.lungeRest, strike: tuning.lungeStrike, hold: tuning.lungeHold } : DEFAULT_LUNGE
  for (const p of w.platforms) placeMover(p, t * (tuning?.platformSpeedScale ?? 1))
  for (const h of w.hazards) placeMover(h, t * (tuning?.enemySpeedScale ?? 1), lunge)
}

export const createWorld = (level: LevelDef, size = { w: PLAYER_W, h: PLAYER_H }): World => {
  const platforms = level.platforms.map((p) => ({ ...p, dx: 0, dy: 0 }))
  for (const p of platforms) placeMover(p, 0)
  const hazards = (level.hazards ?? []).map((h) => ({ ...h, dx: 0, dy: 0 }))
  for (const h of hazards) placeMover(h, 0)
  return {
    level,
    time: 0,
    platformTime: 0,
    enemyTime: 0,
    platforms,
    hazards,
    player: {
      x: level.spawn.x - size.w / 2,
      y: level.spawn.y - size.h,
      vx: 0,
      vy: 0,
      grounded: false,
      open: false,
      broken: false,
      facing: 1,
      w: size.w,
      h: size.h,
      standing: -1
    },
    phase: 'play',
    phaseTime: 0
  }
}

const approach = (v: number, target: number, maxDelta: number): number =>
  v < target ? Math.min(target, v + maxDelta) : Math.max(target, v - maxDelta)

const overlaps = (ax: number, ay: number, aw: number, ah: number, b: { x: number; y: number; w: number; h: number }) =>
  ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y

/** Wind strength 0..1 at the player: fades in over the top `edge` px of an
 *  updraft (and the matching leading edge of the others), so an open umbrella
 *  settles and bobs gently at the boundary instead of snapping. */
export const windInfluence = (pl: Player, w: WindDef, edge: number): number => {
  const cx = pl.x + pl.w / 2
  const cy = pl.y + pl.h / 2
  if (cx < w.x || cx > w.x + w.w || cy < w.y || cy > w.y + w.h) return 0
  switch (w.dir) {
    case 'up': return Math.min(1, (cy - w.y) / edge)
    case 'down': return Math.min(1, (w.y + w.h - cy) / edge)
    case 'left': return Math.min(1, (cx - w.x) / edge)
    case 'right': return Math.min(1, (w.x + w.w - cx) / edge)
  }
}

/** Player box touches a hazard (slightly forgiving: 3 px inset). */
const touches = (pl: Player, h: Hazard, inset: number): boolean => {
  const px = pl.x + inset
  const py = pl.y + inset
  const pw = Math.max(1, pl.w - inset * 2)
  const ph = Math.max(1, pl.h - inset * 2)
  if (h.kind === 'mine') {
    const r = h.w / 2
    const cx = h.x + r
    const cy = h.y + r
    const nx = Math.max(px, Math.min(cx, px + pw))
    const ny = Math.max(py, Math.min(cy, py + ph))
    return (nx - cx) ** 2 + (ny - cy) ** 2 < r * r
  }
  return overlaps(px, py, pw, ph, h)
}

const setPhase = (w: World, phase: Phase) => {
  w.phase = phase
  w.phaseTime = 0
}

export const step = (w: World, input: Input, dt: number, t: Tuning): GameEvent[] => {
  const events: GameEvent[] = []
  w.time += dt
  w.phaseTime += dt
  w.platformTime += dt * t.platformSpeedScale
  w.enemyTime += dt * t.enemySpeedScale
  const lunge = { rest: t.lungeRest, strike: t.lungeStrike, hold: t.lungeHold }

  for (const p of w.platforms) {
    const ox = p.x
    const oy = p.y
    placeMover(p, w.platformTime)
    p.dx = p.x - ox
    p.dy = p.y - oy
  }
  for (const h of w.hazards) {
    const ox = h.x
    const oy = h.y
    const m = h.motion
    if (m?.kind === 'lunge' && m.trigger) {
      // Thwomp: wait at rest; an airborne player in range sets off one attack.
      const attack = m.period * (1 - lunge.rest)
      if (h.lungeAt !== undefined && w.enemyTime - h.lungeAt >= attack) h.lungeAt = undefined
      const pl = w.player
      if (h.lungeAt === undefined && w.phase === 'play' && !pl.grounded &&
          Math.hypot(pl.x + pl.w / 2 - m.a.x, pl.y + pl.h / 2 - m.a.y) <= (m.radius ?? DEFAULT_TRIGGER_RADIUS)) h.lungeAt = w.enemyTime
      placeMover(h, h.lungeAt === undefined ? 0 : m.period * lunge.rest + (w.enemyTime - h.lungeAt), lunge)
    } else placeMover(h, w.enemyTime, lunge)
    h.dx = h.x - ox
    h.dy = h.y - oy
  }
  // Harmless enemies are solid: you bump into and stand on them like platforms.
  const solids: (Platform | Hazard)[] = [...w.platforms, ...w.hazards.filter((h) => h.harmless)]

  const pl = w.player
  // Live hitbox resize from the tuning panel: keep the feet and centre in place.
  if (pl.w !== t.playerWidth || pl.h !== t.playerHeight) {
    pl.x += (pl.w - t.playerWidth) / 2
    pl.y += pl.h - t.playerHeight
    pl.w = t.playerWidth
    pl.h = t.playerHeight
  }
  if (w.phase !== 'play') {
    // The dancer rides their moving finish.
    if (w.phase === 'win' && pl.standing >= 0) {
      pl.x += solids[pl.standing]!.dx
      pl.y += solids[pl.standing]!.dy
    }
    return events
  }

  // Ride the platform we stood on last tick.
  if (pl.grounded && pl.standing >= 0) {
    const p = solids[pl.standing]!
    pl.x += p.dx
    pl.y += p.dy
  }

  // ── Umbrella toggle ──
  if (input.toggle) {
    if (pl.open) {
      pl.open = false
      events.push('close')
    } else if (!pl.broken) {
      if (!pl.grounded && pl.vy >= t.terminalVelocity * t.breakFraction) {
        pl.broken = true
        events.push('break')
      } else {
        pl.open = true
        events.push('open')
      }
    }
  }

  // ── Horizontal ──
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  if (dir) pl.facing = dir as 1 | -1
  if (pl.grounded) {
    // Letting go or reversing brakes at the deceleration time, speeding up at the acceleration time.
    const braking = !dir || dir * pl.vx < 0
    pl.vx = approach(pl.vx, dir * t.walkSpeed, (t.walkSpeed / (braking ? t.walkDecelTime : t.walkAccelTime)) * dt)
  } else if (dir) {
    // Water-like: reversing from full speed one way to full the other takes airTurnTime.
    const accel = (2 * t.airSpeed) / t.airTurnTime
    const cap = Math.max(t.airSpeed, Math.abs(pl.vx))
    pl.vx = approach(pl.vx, dir * cap, accel * dt)
    // Ground momentum carries over, then bleeds back down to air speed.
    if (Math.abs(pl.vx) > t.airSpeed) pl.vx = approach(pl.vx, dir * t.airSpeed, t.airDrag * dt)
  } else {
    pl.vx = approach(pl.vx, 0, t.airDrag * dt)
  }

  // ── Vertical ──
  if (!pl.grounded) {
    if (pl.open) {
      // Braking snap: any fall faster than float speed is caught within brakingSnap.
      if (pl.vy > t.floatSpeed) {
        pl.vy = approach(pl.vy, t.floatSpeed, (t.terminalVelocity / t.brakingSnap) * dt)
      } else {
        pl.vy = approach(pl.vy, t.floatSpeed, (t.floatSpeed / t.floatEaseTime) * dt)
      }
    } else {
      pl.vy = Math.min(t.terminalVelocity, pl.vy + t.gravity * dt)
    }
  }

  // ── Wind: an open umbrella rides it; a closed one drops through with a
  //    little resistance from updrafts. ──
  if (!pl.grounded) {
    const k = Math.min(1, dt / (t.windTurnTime / 3))
    for (const wind of w.level.winds) {
      const s = windInfluence(pl, wind, t.windEdge)
      if (!s) continue
      const speed = wind.speed * t.windScale * (wind.super ? t.superStreamScale : 1)
      if (!pl.open) {
        if (wind.dir === 'up') pl.vy -= t.gravity * (wind.super ? t.superClosedResistance : t.closedWindResistance) * s * dt
        continue
      }
      const target = speed * s
      // Updrafts are a buoyant force, not a velocity snap: the rider carries
      // momentum past the top edge, the umbrella's pull draws them back in, and
      // they bob (like holding jump on Minecraft water) until bobDamping settles it.
      // A Super Stream builds up slowly so there is time to close the umbrella.
      if (wind.dir === 'up') {
        const lift = wind.super ? speed / t.superStreamBuildTime : speed / (t.windTurnTime / 2)
        pl.vy = Math.max(-target / s, pl.vy - lift * s * dt)
        if (s < 1) pl.vy *= Math.max(0, 1 - t.bobDamping * dt)
      } else if (wind.dir === 'down') pl.vy += (target - pl.vy) * k
      else pl.vx += ((wind.dir === 'right' ? target : -target) - pl.vx) * k
    }
  }

  // ── Move + collide (axis-separated AABB) ──
  const wasGrounded = pl.grounded
  const impactSpeed = pl.vy
  let slam = false
  const prevX = pl.x
  pl.x += pl.vx * dt
  for (const p of solids) {
    if (!overlaps(pl.x, pl.y, pl.w, pl.h, p)) continue
    // Already in the platform's columns last tick: it met us from above or
    // below (a rising finish under a lander) — the vertical pass resolves it.
    if (prevX + pl.w > p.x - p.dx && prevX < p.x - p.dx + p.w) continue
    if (Math.abs(pl.vx - p.dx / dt) >= t.wallSplatSpeed) slam = true
    if (pl.vx > 0 || p.dx < 0) pl.x = p.x - pl.w
    else pl.x = p.x + p.w
    pl.vx = 0
  }

  pl.y += pl.vy * dt
  pl.grounded = false
  let standing = -1
  for (let i = 0; i < solids.length; i++) {
    const p = solids[i]!
    if (!overlaps(pl.x, pl.y, pl.w, pl.h, p)) continue
    const fromAbove = pl.y + pl.h - p.y <= Math.max(8, pl.vy * dt + Math.abs(p.dy) + 2)
    if (fromAbove) {
      pl.y = p.y - pl.h
      pl.vy = 0
      pl.grounded = true
      standing = i
    } else {
      pl.y = p.y + p.h
      if (-pl.vy >= t.wallSplatSpeed) slam = true
      if (pl.vy < 0) pl.vy = 0
    }
  }
  // Still standing on a platform that moved down/away this tick? Snap onto it.
  if (!pl.grounded && wasGrounded && pl.standing >= 0) {
    const p = solids[pl.standing]!
    const onTop = pl.x + pl.w > p.x && pl.x < p.x + p.w && Math.abs(pl.y + pl.h - p.y) <= Math.abs(p.dy) + 4
    if (onTop) {
      pl.y = p.y - pl.h
      pl.vy = 0
      pl.grounded = true
      standing = pl.standing
    }
  }
  pl.standing = standing

  // Blown into a ceiling or wall too fast (Super Stream): splat.
  if (slam) {
    setPhase(w, 'splat')
    events.push('splat')
    return events
  }
  for (const h of w.hazards) {
    if (h.harmless || !touches(pl, h, t.hitboxInset)) continue
    setPhase(w, 'splat')
    events.push('hit')
    return events
  }

  if (pl.grounded && !wasGrounded) {
    if (impactSpeed >= t.terminalVelocity * t.splatFraction) {
      setPhase(w, 'splat')
      events.push('splat')
      return events
    }
    events.push('land')
    if (pl.open) {
      pl.open = false
      events.push('close')
    }
    if (standing < w.platforms.length && w.platforms[standing]!.finish) {
      setPhase(w, 'win')
      events.push('win')
      return events
    }
  }

  // Stepping off a platform opens the umbrella automatically.
  if (wasGrounded && !pl.grounded && !pl.open && !pl.broken) {
    pl.open = true
    events.push('open')
  }

  // Out of bounds: past the bottom (or far off a side) of the play field.
  const { w: ww, h: wh } = w.level.world
  if (pl.y > wh + 40 || pl.x + pl.w < -t.outOfBoundsMargin || pl.x > ww + t.outOfBoundsMargin) {
    setPhase(w, 'out')
    events.push('out')
  }
  return events
}
