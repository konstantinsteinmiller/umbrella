// ─── Umbrella simulation ────────────────────────────────────────────────────
//
// Pure, renderer-free: `step(world, input, dt)` advances one fixed tick and
// returns the events it produced (for audio / UI). Tests drive it headless.

import type { CheckpointDef, HazardDef, LevelDef, Motion, PlatformDef, WalldorfContact, WindDef } from './levels'
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
  /** A bouncy Walldorf touched the player last tick (one bump sound per touch). */
  bumping?: boolean
}

/** What touching an enemy does. Only Walldorfs choose; mines and spikes are deadly. */
export const contactOf = (h: HazardDef): WalldorfContact =>
  h.kind !== 'pillar' ? 'deadly' : h.contact ?? (h.harmless ? 'solid' : 'deadly')

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
  /** Seconds of free fall so far (umbrella closed or broken; floating resets it). */
  fallTime: number
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
  /** Per button channel: world time it stays on until (Infinity: toggled on; 0: off). */
  channels: Record<number, number>
  /** Buttons the player touched last tick: a press is the first touch. */
  buttonsDown: boolean[]
  /** The last checkpoint touched (index into level.checkpoints), or -1. */
  checkpoint: number
}

export type GameEvent = 'open' | 'close' | 'break' | 'land' | 'win' | 'splat' | 'hit' | 'out' | 'button' | 'checkpoint' | 'bump' | 'charge-bump'

/** Is this button channel on right now? */
export const channelOn = (w: World, channel: number | undefined): boolean =>
  channel !== undefined && (w.channels[channel] ?? 0) > w.time

/** A switched platform is solid (and drawn) only while its channel says so. */
export const platformActive = (w: World, p: PlatformDef): boolean =>
  p.channel === undefined || channelOn(w, p.channel) !== !!p.whenOff

/** The current as it blows right now: a switched one takes its other direction / speed. */
export const liveWind = (w: World, wind: WindDef): WindDef =>
  wind.switched && channelOn(w, wind.channel)
    ? { ...wind, dir: wind.switched.dir ?? wind.dir, speed: wind.switched.speed ?? wind.speed }
    : wind

/** Every current that blows right now (a switched-off one, speed 0, is left out). */
export const liveWinds = (w: World): WindDef[] => w.level.winds.map((x) => liveWind(w, x)).filter((x) => x.speed > 0)

/** A checkpoint flag's touch box, standing on its point. */
export const CHECKPOINT_W = 30
export const CHECKPOINT_H = 64
export const checkpointBox = (c: CheckpointDef) => ({ x: c.x - CHECKPOINT_W / 2, y: c.y - CHECKPOINT_H, w: CHECKPOINT_W, h: CHECKPOINT_H })

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
    case 'follow':
      // Steered each tick by step(), from where it is: no position of its own over time.
      return null
    case 'arrive': {
      const f = Math.min(1, Math.max(0, (t - m.delay) / m.duration))
      const k = 1 - (1 - f) * (1 - f) * (1 - f)
      return { x: m.a.x + (m.b.x - m.a.x) * k, y: m.a.y + (m.b.y - m.a.y) * k }
    }
  }
}

/** Moves a follower's centre up to `maxStep` toward the player (or toward the
 *  point of its path nearest the player). */
const follow = (h: Hazard, m: Extract<Motion, { kind: 'follow' }>, pl: Player, maxStep: number) => {
  const cx = h.x + h.w / 2
  const cy = h.y + h.h / 2
  let tx = pl.x + pl.w / 2
  let ty = pl.y + pl.h / 2
  if (m.a && m.b) {
    const vx = m.b.x - m.a.x
    const vy = m.b.y - m.a.y
    const len2 = vx * vx + vy * vy || 1
    const k = Math.max(0, Math.min(1, ((tx - m.a.x) * vx + (ty - m.a.y) * vy) / len2))
    tx = m.a.x + vx * k
    ty = m.a.y + vy * k
  } else if (m.axis === 'x') ty = cy
  else if (m.axis === 'y') tx = cx
  const d = Math.hypot(tx - cx, ty - cy)
  if (d < 1e-6) return
  const k = Math.min(1, maxStep / d)
  h.x += (tx - cx) * k
  h.y += (ty - cy) * k
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

/** `checkpoint`: respawn at that checkpoint instead of the spawn (a checkpoint revive). */
export const createWorld = (level: LevelDef, size = { w: PLAYER_W, h: PLAYER_H }, checkpoint = -1): World => {
  const platforms = level.platforms.map((p) => ({ ...p, dx: 0, dy: 0 }))
  for (const p of platforms) placeMover(p, 0)
  const hazards = (level.hazards ?? []).map((h) => ({ ...h, dx: 0, dy: 0 }))
  for (const h of hazards) placeMover(h, 0)
  const cp = level.checkpoints?.[checkpoint]
  const start = cp ?? level.spawn
  return {
    channels: {},
    buttonsDown: (level.buttons ?? []).map(() => false),
    checkpoint: cp ? checkpoint : -1,
    level,
    time: 0,
    platformTime: 0,
    enemyTime: 0,
    platforms,
    hazards,
    player: {
      x: start.x - size.w / 2,
      y: start.y - size.h,
      vx: 0,
      vy: 0,
      grounded: false,
      open: false,
      broken: false,
      facing: 1,
      w: size.w,
      h: size.h,
      standing: -1,
      fallTime: 0
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
  const body = pointInfluence(pl.x + pl.w / 2, pl.y + pl.h / 2, w, edge)
  if (!pl.open) return body
  // An open umbrella catches the wind with its own hitbox: any part of the
  // canopy inside the current counts, measured at its deepest point.
  return Math.max(body, boxInfluence(umbrellaBox(pl), w, edge))
}

/** The open canopy as drawn (renderer drawUmbrella): 60 px wide, 26–66 px above the
 *  head. Used for air currents only — platforms and hazards still hit the body. */
export const UMBRELLA_W = 60
export const UMBRELLA_TOP = 66
export const UMBRELLA_BOTTOM = 26
export const umbrellaBox = (pl: Player) => ({
  x: pl.x + pl.w / 2 - UMBRELLA_W / 2,
  y: pl.y - UMBRELLA_TOP,
  w: UMBRELLA_W,
  h: UMBRELLA_TOP - UMBRELLA_BOTTOM
})
/** Like pointInfluence for a box: the part of the box furthest into the current
 *  past its leading edge sets the strength. */
const boxInfluence = (b: { x: number; y: number; w: number; h: number }, w: WindDef, edge: number): number => {
  const x1 = Math.max(b.x, w.x)
  const x2 = Math.min(b.x + b.w, w.x + w.w)
  const y1 = Math.max(b.y, w.y)
  const y2 = Math.min(b.y + b.h, w.y + w.h)
  if (x1 > x2 || y1 > y2) return 0
  switch (w.dir) {
    case 'up': return Math.min(1, (y2 - w.y) / edge)
    case 'down': return Math.min(1, (w.y + w.h - y1) / edge)
    case 'left': return Math.min(1, (x2 - w.x) / edge)
    case 'right': return Math.min(1, (w.x + w.w - x1) / edge)
  }
}
const pointInfluence = (cx: number, cy: number, w: WindDef, edge: number): number => {
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
    } else if (m?.kind === 'follow') {
      if (w.phase === 'play') follow(h, m, w.player, m.speed * t.enemySpeedScale * dt)
    } else placeMover(h, w.enemyTime, lunge)
    h.dx = h.x - ox
    h.dy = h.y - oy
  }
  // Timed channels run out.
  for (const [c, until] of Object.entries(w.channels)) if (until <= w.time && until > 0) w.channels[Number(c)] = 0
  // Harmless enemies are solid: you bump into and stand on them like platforms.
  // A switched-off platform stays in the list (indices stay stable) but is skipped.
  const solids: (Platform | Hazard)[] = [...w.platforms, ...w.hazards.filter((h) => contactOf(h) === 'solid')]
  const solid = (i: number) => i >= w.platforms.length || platformActive(w, w.platforms[i]!)

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

  // A platform switched off under your feet drops you.
  if (pl.grounded && pl.standing >= 0 && !solid(pl.standing)) {
    pl.grounded = false
    pl.standing = -1
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
    for (const wind of liveWinds(w)) {
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
  for (let i = 0; i < solids.length; i++) {
    const p = solids[i]!
    if (!solid(i) || !overlaps(pl.x, pl.y, pl.w, pl.h, p)) continue
    // Already in the platform's columns last tick: it met us from above or
    // below (a rising finish under a lander) — the vertical pass resolves it.
    if (prevX + pl.w > p.x - p.dx && prevX < p.x - p.dx + p.w) continue
    // A mover's own rush (a lunging Walldorf, a fast platform) is not a slam: only the player's speed is.
    if (Math.abs(pl.vx) >= t.wallSplatSpeed) slam = true
    if (pl.vx > 0 || p.dx < 0) pl.x = p.x - pl.w
    else pl.x = p.x + p.w
    pl.vx = 0
  }
  // A mover faster than its width per tick (a lunge or its reset) never overlaps the player in
  // either frame and would pass straight through: sweep it, and carry the player ahead of it.
  for (let i = 0; i < solids.length; i++) {
    const p = solids[i]!
    if (!solid(i) || Math.abs(p.dx) < 1) continue
    if (pl.y + pl.h <= p.y || pl.y >= p.y + p.h) continue
    const from = p.x - p.dx
    const lo = Math.min(p.x, from)
    const hi = Math.max(p.x, from) + p.w
    if (pl.x + pl.w <= lo || pl.x >= hi || overlaps(pl.x, pl.y, pl.w, pl.h, p)) continue
    // The player was inside the path: shove them out along the direction it travelled.
    if (p.dx > 0) pl.x = p.x + p.w
    else pl.x = p.x - pl.w
    if (Math.sign(pl.vx) !== Math.sign(p.dx)) pl.vx = 0
  }

  pl.y += pl.vy * dt
  pl.grounded = false
  let standing = -1
  for (let i = 0; i < solids.length; i++) {
    const p = solids[i]!
    if (!solid(i) || !overlaps(pl.x, pl.y, pl.w, pl.h, p)) continue
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
  if (!pl.grounded && wasGrounded && pl.standing >= 0 && solid(pl.standing)) {
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
  // Bouncy Walldorfs: a pinball bumper. Touching one throws Pweeg off it along the
  // side he touched; a charging one hits harder (its own speed toward him adds in).
  for (let i = 0; i < w.hazards.length; i++) {
    const h = w.hazards[i]!
    if (contactOf(h) !== 'bounce' || !overlaps(pl.x, pl.y, pl.w, pl.h, h)) { h.bumping = false; continue }
    // Shallowest way out: that side is the one he touched.
    const outL = pl.x + pl.w - h.x
    const outR = h.x + h.w - pl.x
    const outU = pl.y + pl.h - h.y
    const outD = h.y + h.h - pl.y
    const m = Math.min(outL, outR, outU, outD)
    const [nx, ny] = m === outU ? [0, -1] : m === outD ? [0, 1] : m === outL ? [-1, 0] : [1, 0]
    pl.x += nx * (nx < 0 ? outL : outR) * Math.abs(nx)
    pl.y += ny * (ny < 0 ? outU : outD) * Math.abs(ny)
    const charge = Math.max(0, ((h.dx * nx + h.dy * ny) / dt) * t.walldorfChargeKnock)
    const speed = (h.bounce ?? t.walldorfBounce) + charge
    if (nx) pl.vx = nx * speed
    else pl.vy = ny * speed
    pl.grounded = false
    pl.standing = -1
    if (!h.bumping) events.push(charge > 0 ? 'charge-bump' : 'bump')
    h.bumping = true
  }
  for (const h of w.hazards) {
    if (contactOf(h) !== 'deadly' || !touches(pl, h, t.hitboxInset)) continue
    setPhase(w, 'splat')
    events.push('hit')
    return events
  }

  // Buttons: the first touch presses. Toggle flips the channel; timed turns it on.
  const buttons = w.level.buttons ?? []
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i]!
    const down = overlaps(pl.x, pl.y, pl.w, pl.h, b)
    if (down && !w.buttonsDown[i]) {
      if (b.duration) w.channels[b.channel] = w.time + b.duration
      else w.channels[b.channel] = channelOn(w, b.channel) ? 0 : Infinity
      events.push('button')
    }
    w.buttonsDown[i] = down
  }
  // Checkpoints: the last one touched is where a death brings you back.
  const cps = w.level.checkpoints ?? []
  for (let i = 0; i < cps.length; i++) {
    if (i === w.checkpoint || !overlaps(pl.x, pl.y, pl.w, pl.h, checkpointBox(cps[i]!))) continue
    w.checkpoint = i
    events.push('checkpoint')
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

  // Falling for too long in the play field (design doc) counts as out of bounds too.
  pl.fallTime = !pl.grounded && !pl.open && pl.vy > 0 ? pl.fallTime + dt : 0
  const fellTooLong = t.maxFallTime > 0 && pl.fallTime >= t.maxFallTime

  // Out of bounds: past the bottom (or far off a side) of the play field.
  const { w: ww, h: wh } = w.level.world
  if (fellTooLong || pl.y > wh + 40 || pl.x + pl.w < -t.outOfBoundsMargin || pl.x > ww + t.outOfBoundsMargin) {
    setPhase(w, 'out')
    events.push('out')
  }
  return events
}
