/**
 * Aim preview: an exact swept-circle raycast (ball radius included) to the
 * first bounce, plus a short continuation after the reflection. It mirrors the
 * physics — rounded boxes, nearest-face normals, the anti-stall rule — so the
 * dotted line never promises a bounce the volley won't take.
 */
import type { AimPath, BoardState, Monster } from './types'
import { BALL_R, COLS, FLOOR_Y, MIN_AIM } from './types'
import { ANTI_STALL } from './physics'

/** Length (cells) of the dotted continuation after the first bounce. */
export const AIM_CONTINUATION = 1.5

export const clampAim = (angle: number): number =>
  Math.min(Math.PI - MIN_AIM, Math.max(MIN_AIM, angle))

/** Where every volley starts: the ball resting on the launcher line. */
export const launchY = (): number => FLOOR_Y - BALL_R

type HitKind = AimPath['hit']

interface Ray {
  t: number
  nx: number
  ny: number
  kind: HitKind
  monster: Monster | null
}

const EPS = 1e-7

/** Entry time of a ray into an axis-aligned rect (origin outside), or −1. */
const rayRect = (
  ox: number, oy: number, dx: number, dy: number,
  l: number, t: number, r: number, b: number, out: Ray
): number => {
  let tmin = -Infinity
  let tmax = Infinity
  let nx = 0
  let ny = 0
  if (Math.abs(dx) < 1e-12) {
    if (ox <= l || ox >= r) return -1
  } else {
    const inv = 1 / dx
    let t1 = (l - ox) * inv
    let t2 = (r - ox) * inv
    let n = -1
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; n = 1 }
    if (t1 > tmin) { tmin = t1; nx = n; ny = 0 }
    if (t2 < tmax) tmax = t2
  }
  if (Math.abs(dy) < 1e-12) {
    if (oy <= t || oy >= b) return -1
  } else {
    const inv = 1 / dy
    let t1 = (t - oy) * inv
    let t2 = (b - oy) * inv
    let n = -1
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; n = 1 }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = n }
    if (t2 < tmax) tmax = t2
  }
  if (tmax < tmin || tmin < EPS) return -1
  out.nx = nx
  out.ny = ny
  return tmin
}

/** First entry time of a ray into a circle, or −1. */
const rayCircle = (ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, r: number): number => {
  const fx = ox - cx
  const fy = oy - cy
  const b = fx * dx + fy * dy
  const c = fx * fx + fy * fy - r * r
  const disc = b * b - c
  if (disc < 0) return -1
  const t = -b - Math.sqrt(disc)
  return t < EPS ? -1 : t
}

const scratch: Ray = { t: 0, nx: 0, ny: 0, kind: 'wall', monster: null }

/**
 * Ray vs the Minkowski sum of a box and the ball: two stretched rects plus
 * four corner circles. Writes the nearer hit into `best` if it beats best.t.
 */
const rayRoundedBox = (
  ox: number, oy: number, dx: number, dy: number,
  l: number, t: number, r: number, b: number,
  kind: HitKind, monster: Monster | null, best: Ray
): void => {
  const R = BALL_R
  let tt = rayRect(ox, oy, dx, dy, l - R, t, r + R, b, scratch)
  if (tt > 0 && tt < best.t) {
    best.t = tt; best.nx = scratch.nx; best.ny = scratch.ny; best.kind = kind; best.monster = monster
  }
  tt = rayRect(ox, oy, dx, dy, l, t - R, r, b + R, scratch)
  if (tt > 0 && tt < best.t) {
    best.t = tt; best.nx = scratch.nx; best.ny = scratch.ny; best.kind = kind; best.monster = monster
  }
  for (let k = 0; k < 4; k++) {
    const cx = k & 1 ? r : l
    const cy = k & 2 ? b : t
    tt = rayCircle(ox, oy, dx, dy, cx, cy, R)
    if (tt > 0 && tt < best.t) {
      // Same nearest-face rule as the physics' corner contact.
      const hx = ox + dx * tt - cx
      const hy = oy + dy * tt - cy
      best.t = tt
      if (Math.abs(hx) > Math.abs(hy)) { best.nx = hx > 0 ? 1 : -1; best.ny = 0 } else { best.nx = 0; best.ny = hy > 0 ? 1 : -1 }
      best.kind = kind
      best.monster = monster
    }
  }
}

const castRay = (state: BoardState, ox: number, oy: number, dx: number, dy: number, maxT: number, out: Ray): void => {
  out.t = maxT
  out.nx = 0
  out.ny = 0
  out.kind = 'wall'
  out.monster = null
  // Board edges (centre-space: shrunk by the radius).
  if (dx < 0) {
    const t = (BALL_R - ox) / dx
    if (t > EPS && t < out.t) { out.t = t; out.nx = 1; out.ny = 0; out.kind = 'wall' }
  } else if (dx > 0) {
    const t = (COLS - BALL_R - ox) / dx
    if (t > EPS && t < out.t) { out.t = t; out.nx = -1; out.ny = 0; out.kind = 'wall' }
  }
  if (dy < 0) {
    const t = (BALL_R - oy) / dy
    if (t > EPS && t < out.t) { out.t = t; out.nx = 0; out.ny = 1; out.kind = 'ceiling' }
  } else if (dy > 0) {
    const t = (FLOOR_Y - BALL_R - oy) / dy
    if (t > EPS && t < out.t) { out.t = t; out.nx = 0; out.ny = -1; out.kind = 'floor' }
  }
  for (const m of state.monsters) {
    rayRoundedBox(ox, oy, dx, dy, m.col, m.row, m.col + m.w, m.row + m.h, 'monster', m, out)
  }
  for (const h of state.hazards) {
    rayRoundedBox(ox, oy, dx, dy, h.col, h.row, h.col + 1, h.row + 1, 'hazard', null, out)
  }
}

/**
 * Pure: reads the board, never mutates it. `bounces` (fun pass, run 6: "am I
 * even aiming?") traces that many contacts in full before the short fading
 * continuation — the board draws 2, so a bank shot can be planned; `hit` and
 * `monsterId` always describe the FIRST contact. `solid` is the length of
 * the fully drawn part (up to the last traced contact).
 */
export const aimPreview = (state: BoardState, angle: number, bounces = 1): AimPath => {
  const a = clampAim(Number.isFinite(angle) ? angle : Math.PI / 2)
  let x = state.launcherX
  let y = launchY()
  let dx = Math.cos(a)
  let dy = -Math.sin(a)
  const hit: Ray = { t: 0, nx: 0, ny: 0, kind: 'wall', monster: null }
  const points = [{ x, y }]
  let kind: HitKind = 'floor'
  let monsterId: number | undefined
  let solid = 0
  const n = Math.max(1, Math.floor(bounces))
  for (let k = 0; k < n; k++) {
    castRay(state, x, y, dx, dy, 1e3, hit)
    x += dx * hit.t
    y += dy * hit.t
    solid += hit.t
    points.push({ x, y })
    if (k === 0) {
      kind = hit.kind
      monsterId = hit.monster?.id
    }
    if (hit.kind === 'floor') break
    // Reflect exactly as the physics does, then the anti-stall floor on |vy|.
    if (hit.nx !== 0) dx = -dx
    if (hit.ny !== 0) dy = -dy
    const min = ANTI_STALL
    if (Math.abs(dy) < min) {
      dy = dy < 0 ? -min : min
      dx = (dx < 0 ? -1 : 1) * Math.sqrt(1 - min * min)
    }
  }
  if (hit.kind !== 'floor') {
    castRay(state, x, y, dx, dy, AIM_CONTINUATION, hit)
    points.push({ x: x + dx * hit.t, y: y + dy * hit.t })
  }
  const path: AimPath = { points, hit: kind, solid }
  if (monsterId !== undefined) path.monsterId = monsterId
  return path
}
