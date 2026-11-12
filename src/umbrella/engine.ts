// ─── Umbrella simulation ────────────────────────────────────────────────────
//
// Pure, renderer-free: `step(world, input, dt)` advances one fixed tick and
// returns the events it produced (for audio / UI). Tests drive it headless.

import { boxHitsSpikes } from './spikeGeometry'
import type { CheckpointDef, GateDef, HazardDef, LevelDef, Motion, PlatformDef, WalldorfContact, WindDef } from './levels'
import { cloudSide } from './cloudShape'
import type { Tuning } from './tuning'
import { boxHitsPlatform, isTurned, pushOutOfTurned } from './turnedBox'

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
  /** A motion-switched platform's own movement clock: it only runs while the platform moves. */
  mt?: number
}

export interface Hazard extends HazardDef {
  dx: number
  dy: number
  /** A mine that blew up against another mine (world time, and where): gone for the rest of the run, only its blast shows. */
  /** A mine a Walldorf shoved: how far it has been moved off its path (kx, ky), and the knock still carrying it (kvx, kvy, px/s). */
  kx?: number
  ky?: number
  kvx?: number
  kvy?: number
  blownAt?: number
  blastX?: number
  blastY?: number
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
/** A rectangular trigger zone's default length, and how far its sides reach outside the enemy's own box. */
export const DEFAULT_TRIGGER_REACH = 300
export const TRIGGER_MARGIN = 20

/** The Thwomp zone of a triggered lunge at its rest point: in front of the enemy, toward `b`. */
export const triggerZone = (m: Extract<Motion, { kind: 'lunge' }>, w: number, h: number) => {
  const horizontal = Math.abs(m.b.x - m.a.x) >= Math.abs(m.b.y - m.a.y)
  const reach = m.reach ?? DEFAULT_TRIGGER_REACH
  const across = m.zoneWidth ?? (horizontal ? h : w) + TRIGGER_MARGIN * 2
  const sign = Math.sign(horizontal ? m.b.x - m.a.x : m.b.y - m.a.y) || -1
  const along = (horizontal ? w : h) / 2
  const near = sign > 0 ? along : -(along + reach)
  return horizontal
    ? { x: m.a.x + near, y: m.a.y - across / 2, w: reach, h: across }
    : { x: m.a.x - across / 2, y: m.a.y + near, w: across, h: reach }
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
  /** Hitbox size (follows Tuning.playerWidth / playerHeight). */
  w: number
  h: number
  /** Platform index the player stands on, or -1. */
  standing: number
  /** Seconds of free fall so far (umbrella closed or broken; floating resets it). */
  fallTime: number
  /** Seconds since the umbrella opened by itself on stepping off a platform, while that is not yet
   *  shown or heard (-1: none). Landing within AUTO_OPEN_SHOW of it — a hop over a small gap —
   *  never draws or sounds the open/close at all; the physics is unchanged. */
  autoShow: number
}
/** How long after an automatic open the umbrella is shown and heard opening (s). */
export const AUTO_OPEN_SHOW = 0.12

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
  /** Per button: a one-time button has been pressed already (later presses do nothing). */
  buttonsUsed?: boolean[]
  /** The last checkpoint touched (index into level.checkpoints), or -1. */
  checkpoint: number
  /** Which of level.stars are collected. */
  starsGot: boolean[]
  /** Per gate: the player is inside it with the umbrella open (the warp fires on becoming true, not while it stays true). */
  gateInside: boolean[]
  /** The gate entered this run (index into level.gates), or -1. */
  gate: number
  /** The player has walked or toggled the umbrella since this world began (the input that starts a
   *  timed level's clock): a following mine waits until then, so a slow start is never blown up. */
  moved: boolean
}

export type GameEvent = 'open' | 'close' | 'break' | 'land' | 'win' | 'splat' | 'hit' | 'out' | 'button' | 'checkpoint' | 'bump' | 'charge-bump' | 'star' | 'gate' | 'mine-clash'

/** Is this button channel on right now? */
export const channelOn = (w: World, channel: number | undefined): boolean =>
  channel !== undefined && (w.channels[channel] ?? 0) > w.time

/** A switched platform is solid (and drawn) only while its channel says so. */
export const platformActive = (w: World, p: PlatformDef): boolean =>
  p.channel === undefined || !!p.switchMotion || channelOn(w, p.channel) !== !!p.whenOff

/** Is this platform moving right now? Only a motion-switched one ever stands still (its channel decides). */
export const platformMoving = (w: World, p: PlatformDef): boolean =>
  p.channel === undefined || !p.switchMotion || channelOn(w, p.channel) !== !!p.whenOff

/** The current as it blows right now: a switched one takes its other direction / speed. */
export const liveWind = (w: World, wind: WindDef): WindDef =>
  wind.switched && channelOn(w, wind.channel)
    ? { ...wind, dir: wind.switched.dir ?? wind.dir, speed: wind.switched.speed ?? wind.speed }
    : wind

/** Every current that blows right now (a switched-off one, speed 0, is left out). */
export const liveWinds = (w: World): WindDef[] => w.level.winds.map((x) => colOf(liveWind(w, x))).filter((x) => x.speed > 0)

/** A checkpoint flag's touch box, standing on its point. */
export const CHECKPOINT_W = 30
export const CHECKPOINT_H = 64
export const checkpointBox = (c: CheckpointDef) => ({ x: c.x - CHECKPOINT_W / 2, y: c.y - CHECKPOINT_H, w: CHECKPOINT_W, h: CHECKPOINT_H })

/** A star's touch box, centred on its point. */
export const STAR_R = 16
export const starBox = (s: { x: number; y: number }) => ({ x: s.x - STAR_R, y: s.y - STAR_R, w: STAR_R * 2, h: STAR_R * 2 })
/** Where the player stands when returned out of a gate: its bottom middle. */
export const gateExit = (g: GateDef) => ({ x: g.x + g.w / 2, y: g.y + g.h })

/** Attacking-pillar cycle fractions (Tuning.lungeRest/Strike/Hold). */
export interface LungeShape { rest: number; strike: number; hold: number }
const DEFAULT_LUNGE: LungeShape = { rest: 0.45, strike: 0.15, hold: 0.12 }

/** An optional degrees field of a motion (a swing's `angle`, any cycle's `phase`) in
 *  radians; missing or not a number counts as 0, so older levels move as they did. */
export const motionRad = (deg: unknown): number => (typeof deg === 'number' && Number.isFinite(deg) ? (deg * Math.PI) / 180 : 0)

const platformCenter = (m: Motion, t: number, lunge: LungeShape) => {
  switch (m.kind) {
    case 'static':
      return null
    case 'line': {
      const k = 0.5 - 0.5 * Math.cos((t / m.period) * Math.PI * 2 + motionRad(m.phase))
      return { x: m.a.x + (m.b.x - m.a.x) * k, y: m.a.y + (m.b.y - m.a.y) * k }
    }
    case 'circle': {
      const a = (t / m.period) * Math.PI * 2 + motionRad(m.phase)
      return { x: m.center.x + Math.cos(a) * m.radius, y: m.center.y + Math.sin(a) * m.radius }
    }
    case 'swing': {
      // Turning the arc clockwise by `angle` is the same as swinging back by it.
      const a = Math.sin((t / m.period) * Math.PI * 2 + motionRad(m.phase)) * m.amplitude - motionRad(m.angle)
      return { x: m.pivot.x + Math.sin(a) * m.radius, y: m.pivot.y + Math.cos(a) * m.radius }
    }
    case 'lunge': {
      // Rest, strike, hold, then pull back for the rest of the period.
      // `phase` starts the cycle part-way through (a triggered lunge waits at rest and has none).
      const f = ((t / m.period + (m.trigger ? 0 : motionRad(m.phase) / (Math.PI * 2))) % 1 + 1) % 1
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
export interface WorldOptions {
  /** Stars already collected (kept across a checkpoint revive). */
  starsGot?: boolean[]
  /** Start with the feet here instead of the spawn (coming back out of a gate). */
  at?: { x: number; y: number }
}
/** The highest the player's top can go (world px): below the top bar, which covers the first ~50 px of the view. */
export const CEILING_Y = 56
/** Where the top of the player stops against the ceiling: the level's own `ceiling`, else the default. */
export const ceilingOf = (level: { ceiling?: number; fixedScreen?: boolean; verticalCamera?: boolean }): number =>
  (level.fixedScreen || level.verticalCamera ? -Infinity : level.ceiling ?? CEILING_Y)
export const createWorld = (level: LevelDef, size = { w: PLAYER_W, h: PLAYER_H }, checkpoint = -1, opts: WorldOptions = {}): World => {
  const platforms = level.platforms.map((p) => ({ ...p, dx: 0, dy: 0 }))
  for (const p of platforms) placeMover(p, 0)
  const hazards = (level.hazards ?? []).map((h) => ({ ...h, dx: 0, dy: 0 }))
  for (const h of hazards) placeMover(h, 0)
  const cp = level.checkpoints?.[checkpoint]
  const start = opts.at ?? cp ?? level.spawn
  // Starting open on a platform: begin standing on it, or the first landing would close the umbrella.
  const open = !cp && !opts.at && !!level.spawnOpen
  const standing = open
    ? platforms.findIndex((p) => start.x + size.w / 2 > p.x && start.x - size.w / 2 < p.x + p.w && Math.abs(p.y - start.y) <= 2)
    : -1
  return {
    channels: {},
    buttonsDown: (level.buttons ?? []).map(() => false),
    buttonsUsed: (level.buttons ?? []).map(() => false),
    checkpoint: cp ? checkpoint : -1,
    starsGot: (level.stars ?? []).map((_, i) => !!opts.starsGot?.[i]),
    gateInside: (level.gates ?? []).map(() => open),
    gate: -1,
    moved: false,
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
      grounded: standing >= 0,
      open,
      broken: false,
      facing: 1,
      w: size.w,
      h: size.h,
      standing,
      fallTime: 0,
      autoShow: -1
    },
    phase: 'play',
    phaseTime: 0
  }
}

const approach = (v: number, target: number, maxDelta: number): number =>
  v < target ? Math.min(target, v + maxDelta) : Math.max(target, v - maxDelta)

/** An item's collision box: its drawn box pulled in by its `inset` on every side (negative: pushed out).
 *  An item without an inset is its own box, so nothing is copied for it. */
const colOf = <T extends { x: number; y: number; w: number; h: number; inset?: number }>(e: T): T => {
  const k = e.inset
  return k ? { ...e, x: e.x + k, y: e.y + k, w: Math.max(2, e.w - 2 * k), h: Math.max(2, e.h - 2 * k) } : e
}

/** The steepest floor he can stand on: its normal's up-component (cos 60°). */
const SLOPE_WALKABLE = 0.5
/** How far down he follows a slope's surface when it falls away under his feet (px). */
const SLOPE_SNAP = 10

const overlaps = (ax: number, ay: number, aw: number, ah: number, b: { x: number; y: number; w: number; h: number }) =>
  ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y

/** Wind strength 0..1 at the player: fades in over the top `edge` px of an
 *  updraft (and the matching leading edge of the others), so an open umbrella
 *  settles and bobs gently at the boundary instead of snapping. */
/** An updraft whose lift is slower than the float pull (a designer's gentle current): the pull
 *  must not fight it, or the opened umbrella never leaves the ground and shuts on "landing". */
const inWeakUpdraft = (w: World, pl: Player, t: Tuning): boolean =>
  liveWinds(w).some(
    (x) =>
      x.dir === 'up' &&
      !x.super &&
      (x.speed * t.windScale) / (t.windTurnTime / 2) < t.floatSpeed / t.floatEaseTime &&
      windInfluence(pl, x, t.windEdge) > 0
  )

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
/** The canopy as a row of narrow boxes that follow the dome (round in the middle, low at the rim),
 *  so it fills the drawn canopy far better than the one rectangle does. Used where the exact shape
 *  matters (clouds); air currents and pickups keep the generous `umbrellaBox`. */
export const UMBRELLA_STRIPS = 10
export const umbrellaStrips = (pl: Player): { x: number; y: number; w: number; h: number }[] => {
  const half = UMBRELLA_W / 2
  const sw = UMBRELLA_W / UMBRELLA_STRIPS
  const dome = UMBRELLA_TOP - UMBRELLA_BOTTOM
  const out: { x: number; y: number; w: number; h: number }[] = []
  for (let i = 0; i < UMBRELLA_STRIPS; i++) {
    const dx = -half + sw * (i + 0.5)
    // An ellipse dome: full height on the centre line, none at the rim's very edge.
    const rise = dome * Math.sqrt(Math.max(0, 1 - (dx / half) ** 2))
    const h = Math.max(3, rise)
    out.push({ x: pl.x + pl.w / 2 + dx - sw / 2, y: pl.y - UMBRELLA_BOTTOM - h, w: sw, h })
  }
  return out
}
/** What picks up a collectible: the body, and with the umbrella open the whole column from the canopy's
 *  rim down to his feet (the shaft and grip too), a little wider than his body. */
export const ITEM_W = 46
export const itemBox = (pl: Player) => {
  if (!pl.open) return { x: pl.x, y: pl.y, w: pl.w, h: pl.h }
  const w = Math.max(ITEM_W, pl.w)
  return { x: pl.x + pl.w / 2 - w / 2, y: pl.y - UMBRELLA_BOTTOM, w, h: pl.h + UMBRELLA_BOTTOM }
}
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

/** Does this mine move (or lunge) on its own, or is a shove still carrying it? */
const mineMoves = (h: Hazard) => (!!h.motion && h.motion.kind !== 'static') || Math.abs(h.kvx ?? 0) + Math.abs(h.kvy ?? 0) > 1
/** A shoved mine's knock fades at this rate (1/s), and a Walldorf's shove starts at this speed (px/s) before its own charge adds in. */
const MINE_KNOCK_DECAY = 3.2
const MINE_KNOCK_SPEED = 170
/** Walldorfs push mines out of themselves, whatever they do to Pweeg: the mine leaves by the side it hit and is thrown off it
 *  (harder when the Walldorf or the mine was coming at the other), so a mine cannot sit inside or drive through one. */
export const bumpMines = (w: World, dt: number): void => {
  for (const m of w.hazards) {
    if (m.kind !== 'mine' || m.blownAt !== undefined) continue
    const r = m.w / 2
    const cx = m.x + r, cy = m.y + r
    for (const p of w.hazards) {
      if (p.kind !== 'pillar') continue
      const nx0 = Math.max(p.x, Math.min(cx, p.x + p.w))
      const ny0 = Math.max(p.y, Math.min(cy, p.y + p.h))
      let dx = cx - nx0, dy = cy - ny0
      let d = Math.hypot(dx, dy)
      if (d >= r) continue
      let depth = r - d
      if (d < 1e-6) {
        // The centre is inside the box: leave by the nearest side.
        const l = cx - p.x, rt = p.x + p.w - cx, u = cy - p.y, dn = p.y + p.h - cy
        const min = Math.min(l, rt, u, dn)
        ;[dx, dy] = min === l ? [-1, 0] : min === rt ? [1, 0] : min === u ? [0, -1] : [0, 1]
        d = 1
        depth = min + r
      }
      const nx = dx / d, ny = dy / d
      const own = m.motion?.kind !== 'follow'
      if (own) { m.kx = (m.kx ?? 0) + nx * depth; m.ky = (m.ky ?? 0) + ny * depth }
      m.x += nx * depth
      m.y += ny * depth
      // Closing speed: how fast the Walldorf and the mine were coming together along that line.
      const closing = (((p.dx - m.dx) * nx + (p.dy - m.dy) * ny) / Math.max(dt, 1e-4))
      const speed = MINE_KNOCK_SPEED + Math.max(0, closing) * 0.8
      if ((m.kvx ?? 0) * nx + (m.kvy ?? 0) * ny < speed) { m.kvx = nx * speed; m.kvy = ny * speed }
    }
  }
}
/** Pairs of live mines that overlap with at least one of them moving blow up together. True when any did. */
export const clashMines = (w: World): boolean => {
  let any = false
  const hz = w.hazards
  for (let i = 0; i < hz.length; i++) {
    const a = hz[i]!
    if (a.kind !== 'mine' || a.blownAt !== undefined) continue
    for (let j = i + 1; j < hz.length; j++) {
      const b = hz[j]!
      if (b.kind !== 'mine' || b.blownAt !== undefined || (!mineMoves(a) && !mineMoves(b))) continue
      const ra = a.w / 2, rb = b.w / 2
      const dx = a.x + ra - (b.x + rb), dy = a.y + ra - (b.y + rb)
      if (dx * dx + dy * dy >= (ra + rb) ** 2) continue
      for (const m of [a, b]) { m.blownAt = w.time; m.blastX = m.x + m.w / 2; m.blastY = m.y + m.h / 2 }
      any = true
      break
    }
  }
  return any
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
  if (h.kind === 'spikes') return boxHitsSpikes(px, py, pw, ph, h)
  return overlaps(px, py, pw, ph, h)
}

const setPhase = (w: World, phase: Phase) => {
  w.phase = phase
  w.phaseTime = 0
}

const inTrigger = (m: Extract<Motion, { kind: 'lunge' }>, h: { w: number; h: number }, pl: { x: number; y: number; w: number; h: number }): boolean => {
  if (m.reach === undefined) return Math.hypot(pl.x + pl.w / 2 - m.a.x, pl.y + pl.h / 2 - m.a.y) <= (m.radius ?? DEFAULT_TRIGGER_RADIUS)
  const z = triggerZone(m, h.w, h.h)
  return pl.x < z.x + z.w && pl.x + pl.w > z.x && pl.y < z.y + z.h && pl.y + pl.h > z.y
}

export const step = (w: World, input: Input, dt: number, t: Tuning): GameEvent[] => {
  const events: GameEvent[] = []
  if (input.left || input.right || input.toggle) w.moved = true
  w.time += dt
  w.phaseTime += dt
  w.platformTime += dt * t.platformSpeedScale
  w.enemyTime += dt * t.enemySpeedScale
  const lunge = { rest: t.lungeRest, strike: t.lungeStrike, hold: t.lungeHold }

  for (const p of w.platforms) {
    const ox = p.x
    const oy = p.y
    if (p.switchMotion && p.channel !== undefined) {
      // Its own clock, stopped while the switch says stand still: it holds its place and carries on from there.
      if (platformMoving(w, p)) p.mt = (p.mt ?? 0) + dt * t.platformSpeedScale
      placeMover(p, p.mt ?? 0)
    } else placeMover(p, w.platformTime)
    p.dx = p.x - ox
    p.dy = p.y - oy
  }
  for (const h of w.hazards) {
    const ox = h.x
    const oy = h.y
    const m = h.motion
    // A mine that blew up stays where it went off.
    if (h.blownAt !== undefined) { h.dx = h.dy = 0; continue }
    if (m?.kind === 'lunge' && m.trigger) {
      // Thwomp: wait at rest; an airborne player in range sets off one attack.
      const attack = m.period * (1 - lunge.rest)
      if (h.lungeAt !== undefined && w.enemyTime - h.lungeAt >= attack) h.lungeAt = undefined
      const pl = w.player
      if (h.lungeAt === undefined && w.phase === 'play' && !pl.grounded && inTrigger(m, h, pl)) h.lungeAt = w.enemyTime
      placeMover(h, h.lungeAt === undefined ? 0 : m.period * lunge.rest + (w.enemyTime - h.lungeAt), lunge)
    } else if (m?.kind === 'follow') {
      // It waits for the player's first move (the clock's start), then gives chase.
      if (w.phase === 'play' && w.moved) follow(h, m, w.player, m.speed * t.enemySpeedScale * dt)
    } else placeMover(h, w.enemyTime, lunge)
    if (h.kind === 'mine') {
      // A knocked mine slides on the shove it got and keeps the ground it was pushed over. A scripted path is placed
      // from the clock every tick, so its shift is carried as an offset; a chasing mine just moves from where it is.
      const own = m?.kind !== 'follow'
      const sx = (h.kvx ?? 0) * dt, sy = (h.kvy ?? 0) * dt
      if (sx || sy) {
        if (own) { h.kx = (h.kx ?? 0) + sx; h.ky = (h.ky ?? 0) + sy } else { h.x += sx; h.y += sy }
        const f = Math.exp(-MINE_KNOCK_DECAY * dt)
        h.kvx = (h.kvx ?? 0) * f
        h.kvy = (h.kvy ?? 0) * f
        if (Math.hypot(h.kvx, h.kvy) < 4) h.kvx = h.kvy = 0
      }
      if (own) { h.x += h.kx ?? 0; h.y += h.ky ?? 0 }
    }
    h.dx = h.x - ox
    h.dy = h.y - oy
  }
  // Mines are not safe from each other: a moving one that runs into another mine sets both off, so a mine
  // hidden for a jump scare can be taken out by one that sweeps past it.
  if (w.phase === 'play') bumpMines(w, dt)
  if (w.phase === 'play' && clashMines(w)) events.push('mine-clash')
  // Timed channels run out.
  for (const [c, until] of Object.entries(w.channels)) if (until <= w.time && until > 0) w.channels[Number(c)] = 0
  // Harmless enemies are solid: you bump into and stand on them like platforms.
  // A switched-off platform stays in the list (indices stay stable) but is skipped.
  const solids: (Platform | Hazard)[] = [...w.platforms, ...w.hazards.filter((h) => contactOf(h) === 'solid')].map(colOf)
  const solid = (i: number) => i >= w.platforms.length || platformActive(w, w.platforms[i]!)
  // Turned platforms collide by their slanted faces (below), not as the upright box the loops use.
  const flat = (i: number) => solid(i) && !(i < w.platforms.length && isTurned(w.platforms[i]!))

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
    pl.autoShow = -1
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
      } else if (!inWeakUpdraft(w, pl, t)) {
        pl.vy = approach(pl.vy, t.floatSpeed, (t.floatSpeed / t.floatEaseTime) * dt)
      }
    } else {
      pl.vy = Math.min(t.terminalVelocity, pl.vy + t.gravity * dt)
    }
  }

  // ── Wind: an open umbrella rides it (even standing on a platform, so a current
  //    behind a platform can lift it off); a closed one drops through with a
  //    little resistance from updrafts. ──
  if (!pl.grounded || pl.open) {
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
    if (!flat(i) || !overlaps(pl.x, pl.y, pl.w, pl.h, p)) continue
    // Already in the platform's columns last tick: it met us from above or
    // below (a rising finish under a lander) — the vertical pass resolves it.
    if (prevX + pl.w > p.x - p.dx && prevX < p.x - p.dx + p.w) continue
    // A mover's own rush (a lunging Walldorf, a fast platform) is not a slam: only the player's speed is.
    if (Math.abs(pl.vx) >= t.wallSplatSpeed) slam = true
    // Out on the side he is on (the shallower way out), never across the platform to its far side.
    if (pl.x + pl.w / 2 < p.x + p.w / 2) pl.x = p.x - pl.w
    else pl.x = p.x + p.w
    pl.vx = 0
  }
  // A mover faster than its width per tick (a lunge or its reset) never overlaps the player in
  // either frame and would pass straight through: sweep it, and carry the player ahead of it.
  for (let i = 0; i < solids.length; i++) {
    const p = solids[i]!
    if (!flat(i) || Math.abs(p.dx) < 1) continue
    if (pl.y + pl.h <= p.y || pl.y >= p.y + p.h) continue
    const from = p.x - p.dx
    const lo = Math.min(p.x, from)
    const hi = Math.max(p.x, from) + p.w
    if (pl.x + pl.w <= lo || pl.x >= hi || overlaps(pl.x, pl.y, pl.w, pl.h, p)) continue
    // Only a player AHEAD of it last tick was in its path: one behind it (where it just left, e.g.
    // falling past its trailing edge) is not carried across to its front.
    const ahead = p.dx > 0 ? prevX + pl.w / 2 > from + p.w / 2 : prevX + pl.w / 2 < from + p.w / 2
    if (!ahead) continue
    // The player was inside the path: shove them out along the direction it travelled.
    if (p.dx > 0) pl.x = p.x + p.w
    else pl.x = p.x - pl.w
    if (Math.sign(pl.vx) !== Math.sign(p.dx)) pl.vx = 0
  }

  pl.y += pl.vy * dt
  // A current cannot carry him above the top of the level, up under the top bar: he stops at the
  // ceiling and the column's lift is spent there (he floats against it until he leaves the column).
  const ceiling = ceilingOf(w.level)
  if (pl.y < ceiling) {
    pl.y = ceiling
    if (pl.vy < 0) pl.vy = 0
  }
  pl.grounded = false
  let standing = -1
  for (let i = 0; i < solids.length; i++) {
    const p = solids[i]!
    if (!flat(i) || !overlaps(pl.x, pl.y, pl.w, pl.h, p)) continue
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
  if (!pl.grounded && wasGrounded && pl.vy >= 0 && pl.standing >= 0 && flat(pl.standing)) {
    const p = solids[pl.standing]!
    const onTop = pl.x + pl.w > p.x && pl.x < p.x + p.w && Math.abs(pl.y + pl.h - p.y) <= Math.abs(p.dy) + 4
    if (onTop) {
      pl.y = p.y - pl.h
      pl.vy = 0
      pl.grounded = true
      standing = pl.standing
    }
  }
    // ── Turned platforms: pushed out along their slanted faces; a walkable slope is stood on ──
  for (let i = 0; i < w.platforms.length; i++) {
    const p = solids[i] as Platform
    if (!isTurned(p) || !solid(i) || p.finish) continue
    let push = pushOutOfTurned(pl, p)
    // Walking down a slope (or resting on one): the surface fell away from his feet this tick, so follow it.
    if (!push && wasGrounded && pl.standing === i && pl.vy >= 0) {
      const probe = pushOutOfTurned({ x: pl.x, y: pl.y + SLOPE_SNAP, w: pl.w, h: pl.h }, p)
      if (probe && probe.ny < -SLOPE_WALKABLE) {
        pl.y += SLOPE_SNAP
        push = probe
      }
    }
    if (!push) continue
    if (push.ny < -SLOPE_WALKABLE) {
      // A floor he can stand on: lift him straight up out of it (not along the face), so standing still never creeps downhill.
      pl.y -= push.depth / -push.ny
      if (pl.vy > 0) pl.vy = 0
      pl.grounded = true
      standing = i
    } else {
      // A steep face, a wall or a ceiling: out along its normal, and the speed into it is lost.
      pl.x += push.nx * push.depth
      pl.y += push.ny * push.depth
      const into = pl.vx * push.nx + pl.vy * push.ny
      if (into < 0) {
        if (-into >= t.wallSplatSpeed) slam = true
        pl.vx -= into * push.nx
        pl.vy -= into * push.ny
      }
    }
  }
pl.standing = standing

  // A cloud platform is soft to the eye, so the open canopy never clips into it: the canopy stops
  // against a cloud's underside (or side) like the body does. Airborne only, and clouds only —
  // every other platform still ignores the canopy.
  if (pl.open && !pl.grounded) {
    for (let i = 0; i < w.platforms.length; i++) {
      const p = solids[i] as Platform
      if (!p.cloud || p.finish || !solid(i)) continue
      if (isTurned(p)) {
        // A turned cloud: each canopy strip is pushed out along the cloud's own faces.
        for (let k = 0; k < UMBRELLA_STRIPS; k++) {
          const push = pushOutOfTurned(umbrellaStrips(pl)[k]!, p)
          if (!push) continue
          pl.x += push.nx * push.depth
          pl.y += push.ny * push.depth
          const into = pl.vx * push.nx + pl.vy * push.ny
          if (into < 0) { pl.vx -= into * push.nx; pl.vy -= into * push.ny }
        }
        continue
      }
      // The drawn cloud's ends overhang its box and curve in: the canopy is held at half that overhang,
      // so it touches the drawn cloud instead of stopping short of its rounded ends.
      const side = cloudSide(p.h) * 0.5
      const cx = p.x - side
      const cw = p.w + 2 * side
      const cloud = { x: cx, y: p.y, w: cw, h: p.h }
      for (let k = 0; k < UMBRELLA_STRIPS; k++) {
        // Each strip is measured from where the player is NOW (an earlier strip may have pushed him).
        const ub = umbrellaStrips(pl)[k]!
        if (!overlaps(ub.x, ub.y, ub.w, ub.h, cloud)) continue
        const down = p.y + p.h - ub.y
        const left = ub.x + ub.w - cx
        const right = cx + cw - ub.x
        if (down <= Math.min(left, right)) {
          pl.y += down
          if (pl.vy < 0) pl.vy = 0
        } else if (left < right) {
          pl.x -= left
          if (pl.vx > 0) pl.vx = 0
        } else {
          pl.x += right
          if (pl.vx < 0) pl.vx = 0
        }
      }
    }
  }

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
    const hb = colOf(h)
    if (contactOf(h) !== 'bounce' || !overlaps(pl.x, pl.y, pl.w, pl.h, hb)) { h.bumping = false; continue }
    // Shallowest way out: that side is the one he touched.
    const outL = pl.x + pl.w - hb.x
    const outR = hb.x + hb.w - pl.x
    const outU = pl.y + pl.h - hb.y
    const outD = hb.y + hb.h - pl.y
    const m = Math.min(outL, outR, outU, outD)
    const [nx, ny] = m === outU ? [0, -1] : m === outD ? [0, 1] : m === outL ? [-1, 0] : [1, 0]
    pl.x += nx * (nx < 0 ? outL : outR) * Math.abs(nx)
    pl.y += ny * (ny < 0 ? outU : outD) * Math.abs(ny)
    // Pushed into a solid platform: there is nowhere to go, so he is crushed between the two (never
    // shoved through it). Probe a little further the way he is pushed — any push into a platform he
    // is standing on or against counts, however small — with the box trimmed on the other axis so a
    // platform he only grazes along that side does not.
    const probe = 2
    const [px, py, pw, ph] = nx
      ? [pl.x + nx * probe, pl.y + probe, pl.w, pl.h - probe * 2]
      : [pl.x + probe, pl.y + ny * probe, pl.w - probe * 2, pl.h]
    if (w.platforms.some((p) => platformActive(w, p) && boxHitsPlatform({ x: px, y: py, w: pw, h: ph }, colOf(p)))) {
      setPhase(w, 'splat')
      events.push('splat')
      return events
    }
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
    if (contactOf(h) !== 'deadly' || h.blownAt !== undefined || !touches(pl, colOf(h), t.hitboxInset)) continue
    setPhase(w, 'splat')
    events.push('hit')
    return events
  }

  // Buttons: the first touch presses. Toggle flips the channel; timed turns it on.
  const buttons = w.level.buttons ?? []
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i]!
    const down = overlaps(pl.x, pl.y, pl.w, pl.h, colOf(b))
    if (down && !w.buttonsDown[i] && !(b.once && w.buttonsUsed?.[i])) {
      ;(w.buttonsUsed ??= [])[i] = true
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

  // Stars: touch to collect. Gates: open the umbrella at one and a hyper current takes you through.
  const stars = w.level.stars ?? []
  for (let i = 0; i < stars.length; i++) {
    if (w.starsGot[i]) continue
    // The item box (body, and with the umbrella open the column up to its rim) picks one up, and so does the open canopy above it.
    const box = starBox(stars[i]!)
    const ib = itemBox(pl)
    const ub = pl.open ? umbrellaBox(pl) : null
    if (!overlaps(ib.x, ib.y, ib.w, ib.h, box) && !(ub && overlaps(ub.x, ub.y, ub.w, ub.h, box))) continue
    w.starsGot[i] = true
    events.push('star')
  }
  const gates = w.level.gates ?? []
  for (let i = 0; i < gates.length; i++) {
    const inside = pl.open && overlaps(pl.x, pl.y, pl.w, pl.h, colOf(gates[i]!))
    if (inside && !w.gateInside[i] && w.gate < 0) {
      w.gate = i
      events.push('gate')
    }
    w.gateInside[i] = inside
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
      // An umbrella that opened and shut again inside AUTO_OPEN_SHOW was never shown: no close either.
      if (pl.autoShow < 0) events.push('close')
    }
    pl.autoShow = -1
    if (standing < w.platforms.length && w.platforms[standing]!.finish) {
      setPhase(w, 'win')
      events.push('win')
      return events
    }
  }

  // Stepping off a platform opens the umbrella automatically.
  if (wasGrounded && !pl.grounded && !pl.open && !pl.broken) {
    pl.open = true
    pl.autoShow = 0
  } else if (pl.autoShow >= 0) {
    pl.autoShow += dt
    if (pl.autoShow >= AUTO_OPEN_SHOW) {
      pl.autoShow = -1
      if (pl.open) events.push('open')
    }
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
