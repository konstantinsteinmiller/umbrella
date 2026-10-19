// ─── Umbrella simulation ────────────────────────────────────────────────────
//
// Pure, renderer-free: `step(world, input, dt)` advances one fixed tick and
// returns the events it produced (for audio / UI). Tests drive it headless.

import type { LevelDef, Motion, PlatformDef, WindDef } from './levels'
import type { Tuning } from './tuning'

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

export interface Player {
  x: number
  y: number
  vx: number
  vy: number
  grounded: boolean
  open: boolean
  broken: boolean
  facing: 1 | -1
  /** Platform index the player stands on, or -1. */
  standing: number
}

export interface World {
  level: LevelDef
  time: number
  platforms: Platform[]
  player: Player
  phase: Phase
  /** Seconds spent in the current phase. */
  phaseTime: number
}

export type GameEvent = 'open' | 'close' | 'break' | 'land' | 'win' | 'splat' | 'out'

const platformCenter = (m: Motion, t: number) => {
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
  }
}

const placePlatform = (p: Platform, t: number): void => {
  if (!p.motion) return
  const c = platformCenter(p.motion, t)
  if (!c) return
  p.x = c.x - p.w / 2
  p.y = c.y - p.h / 2
}

export const createWorld = (level: LevelDef): World => {
  const platforms = level.platforms.map((p) => ({ ...p, dx: 0, dy: 0 }))
  for (const p of platforms) placePlatform(p, 0)
  return {
    level,
    time: 0,
    platforms,
    player: {
      x: level.spawn.x - PLAYER_W / 2,
      y: level.spawn.y - PLAYER_H,
      vx: 0,
      vy: 0,
      grounded: false,
      open: false,
      broken: false,
      facing: 1,
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
const windInfluence = (pl: Player, w: WindDef): number => {
  const cx = pl.x + PLAYER_W / 2
  const cy = pl.y + PLAYER_H / 2
  if (cx < w.x || cx > w.x + w.w || cy < w.y || cy > w.y + w.h) return 0
  const edge = 40
  switch (w.dir) {
    case 'up': return Math.min(1, (cy - w.y) / edge)
    case 'down': return Math.min(1, (w.y + w.h - cy) / edge)
    case 'left': return Math.min(1, (cx - w.x) / edge)
    case 'right': return Math.min(1, (w.x + w.w - cx) / edge)
  }
}

const setPhase = (w: World, phase: Phase) => {
  w.phase = phase
  w.phaseTime = 0
}

export const step = (w: World, input: Input, dt: number, t: Tuning): GameEvent[] => {
  const events: GameEvent[] = []
  w.time += dt
  w.phaseTime += dt

  for (const p of w.platforms) {
    const ox = p.x
    const oy = p.y
    placePlatform(p, w.time)
    p.dx = p.x - ox
    p.dy = p.y - oy
  }

  const pl = w.player
  if (w.phase !== 'play') {
    // The dancer rides their moving finish.
    if (w.phase === 'win' && pl.standing >= 0) {
      pl.x += w.platforms[pl.standing]!.dx
      pl.y += w.platforms[pl.standing]!.dy
    }
    return events
  }

  // Ride the platform we stood on last tick.
  if (pl.grounded && pl.standing >= 0) {
    const p = w.platforms[pl.standing]!
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
    pl.vx = approach(pl.vx, dir * t.walkSpeed, (t.walkSpeed / t.walkAccelTime) * dt)
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
        pl.vy = approach(pl.vy, t.floatSpeed, (t.floatSpeed / 0.25) * dt)
      }
    } else {
      pl.vy = Math.min(t.terminalVelocity, pl.vy + t.gravity * dt)
    }
  }

  // ── Wind (open umbrella only; closed drops straight through) ──
  if (pl.open && !pl.grounded) {
    const k = Math.min(1, dt / (t.windTurnTime / 3))
    for (const wind of w.level.winds) {
      const s = windInfluence(pl, wind)
      if (!s) continue
      const target = wind.speed * s
      if (wind.dir === 'up') pl.vy += (-target - pl.vy) * k
      else if (wind.dir === 'down') pl.vy += (target - pl.vy) * k
      else pl.vx += ((wind.dir === 'right' ? target : -target) - pl.vx) * k
    }
  }

  // ── Move + collide (axis-separated AABB) ──
  const wasGrounded = pl.grounded
  const impactSpeed = pl.vy
  pl.x += pl.vx * dt
  for (const p of w.platforms) {
    if (!overlaps(pl.x, pl.y, PLAYER_W, PLAYER_H, p)) continue
    if (pl.vx > 0 || p.dx < 0) pl.x = p.x - PLAYER_W
    else pl.x = p.x + p.w
    pl.vx = 0
  }

  pl.y += pl.vy * dt
  pl.grounded = false
  let standing = -1
  for (let i = 0; i < w.platforms.length; i++) {
    const p = w.platforms[i]!
    if (!overlaps(pl.x, pl.y, PLAYER_W, PLAYER_H, p)) continue
    const fromAbove = pl.y + PLAYER_H - p.y <= Math.max(8, pl.vy * dt + Math.abs(p.dy) + 2)
    if (fromAbove) {
      pl.y = p.y - PLAYER_H
      pl.vy = 0
      pl.grounded = true
      standing = i
    } else {
      pl.y = p.y + p.h
      if (pl.vy < 0) pl.vy = 0
    }
  }
  // Still standing on a platform that moved down/away this tick? Snap onto it.
  if (!pl.grounded && wasGrounded && pl.standing >= 0) {
    const p = w.platforms[pl.standing]!
    const onTop = pl.x + PLAYER_W > p.x && pl.x < p.x + p.w && Math.abs(pl.y + PLAYER_H - p.y) <= Math.abs(p.dy) + 4
    if (onTop) {
      pl.y = p.y - PLAYER_H
      pl.vy = 0
      pl.grounded = true
      standing = pl.standing
    }
  }
  pl.standing = standing

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
    if (w.platforms[standing]!.finish) {
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
  if (pl.y > wh + 40 || pl.x + PLAYER_W < -60 || pl.x > ww + 60) {
    setPhase(w, 'out')
    events.push('out')
  }
  return events
}
