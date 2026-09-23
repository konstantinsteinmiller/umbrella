/**
 * Deterministic ball physics: circle vs axis-aligned boxes on a fixed step,
 * sub-stepped so no ball ever moves more than BALL_R per sub-step (no
 * tunnelling at any speed multiplier). Nothing in here allocates per step —
 * the engine calls `stepBall` for up to ~40 balls, 120× a second, and the bot
 * sim does that for thousands of cloned volleys.
 */
import type { Ball, FlyingChest, Monster, Pickup } from './types'
import { BALL_R, COLS, FLOOR_Y, ROWS } from './types'

/** Fixed simulation step (seconds of real time at speedMul 1). */
export const STEP = 1 / 120
/** Pickups are circles at their cell centre. R + PICKUP_R > 0.5 so a ball on
 *  any vertical line always reaches the pickup of the column it runs along,
 *  even from a launcher sitting exactly on a column seam. */
export const PICKUP_R = 0.36
/** CONTRACT §1: after every bounce |vy| ≥ 0.18 × speed. */
export const ANTI_STALL = 0.18
/** Grid rows stored: −3 (boss body above the board) … ROWS+2 (breach overhang). */
export const GRID_TOP = -3
export const GRID_ROWS = ROWS + 6

/** Engine-side ball: the public Ball plus pierce bookkeeping. */
export interface SimBall extends Ball {
  /** Monster the ball is currently piercing through (ignored until it exits). */
  passing: Monster | null
}

/** Cell occupancy — O(1) broadphase for balls and O(1) "is this cell free". */
export class Grid {
  readonly monsters: (Monster | null)[]
  readonly pickups: (Pickup | null)[]
  readonly hazards: Uint8Array

  constructor() {
    const n = COLS * GRID_ROWS
    this.monsters = new Array<Monster | null>(n).fill(null)
    this.pickups = new Array<Pickup | null>(n).fill(null)
    this.hazards = new Uint8Array(n)
  }

  index(col: number, row: number): number {
    if (col < 0 || col >= COLS) return -1
    const r = row - GRID_TOP
    if (r < 0 || r >= GRID_ROWS) return -1
    return r * COLS + col
  }

  clear(): void {
    this.monsters.fill(null)
    this.pickups.fill(null)
    this.hazards.fill(0)
  }

  monsterAt(col: number, row: number): Monster | null {
    const i = this.index(col, row)
    return i < 0 ? null : this.monsters[i]!
  }

  pickupAt(col: number, row: number): Pickup | null {
    const i = this.index(col, row)
    return i < 0 ? null : this.pickups[i]!
  }

  hazardAt(col: number, row: number): boolean {
    const i = this.index(col, row)
    return i >= 0 && this.hazards[i] === 1
  }

  putMonster(m: Monster): void {
    for (let r = m.row; r < m.row + m.h; r++) {
      for (let c = m.col; c < m.col + m.w; c++) {
        const i = this.index(c, r)
        if (i >= 0) this.monsters[i] = m
      }
    }
  }

  removeMonster(m: Monster): void {
    for (let r = m.row; r < m.row + m.h; r++) {
      for (let c = m.col; c < m.col + m.w; c++) {
        const i = this.index(c, r)
        if (i >= 0 && this.monsters[i] === m) this.monsters[i] = null
      }
    }
  }

  putPickup(p: Pickup): void {
    const i = this.index(p.col, p.row)
    if (i >= 0) this.pickups[i] = p
  }

  removePickup(p: Pickup): void {
    const i = this.index(p.col, p.row)
    if (i >= 0 && this.pickups[i] === p) this.pickups[i] = null
  }

  setHazard(col: number, row: number, on: boolean): void {
    const i = this.index(col, row)
    if (i >= 0) this.hazards[i] = on ? 1 : 0
  }

  /** No monster, pickup or hazard (off-grid counts as blocked). */
  isFree(col: number, row: number, ignore?: Monster | null): boolean {
    const i = this.index(col, row)
    if (i < 0) return false
    const m = this.monsters[i]!
    return (m === null || m === ignore) && this.pickups[i] === null && this.hazards[i] === 0
  }
}

export interface Contact {
  nx: number
  ny: number
  /** Centre position that just touches the face. */
  x: number
  y: number
  /** Ball centre minus the closest box point (both non-zero ⇒ corner contact). */
  dx: number
  dy: number
}

/**
 * Circle vs AABB with the reflection normal of the NEAREST FACE (axis-aligned).
 * Axis normals keep a seam between two neighbouring blocks behaving like one
 * flat wall, where a true corner normal would kick balls off diagonally.
 */
export const circleBox = (
  x: number, y: number, vx: number, vy: number, rad: number,
  l: number, t: number, r: number, b: number, out: Contact
): boolean => {
  const cx = x < l ? l : x > r ? r : x
  const cy = y < t ? t : y > b ? b : y
  const dx = x - cx
  const dy = y - cy
  if (dx * dx + dy * dy >= rad * rad) return false
  let nx = 0
  let ny = 0
  if (dx === 0 && dy === 0) {
    // Centre inside (a box moved onto the ball): leave through the closest face.
    const pl = x - l
    const pr = r - x
    const pt = y - t
    const pb = b - y
    const m = Math.min(pl, pr, pt, pb)
    if (m === pb) ny = 1
    else if (m === pt) ny = -1
    else if (m === pl) nx = -1
    else nx = 1
  } else if (Math.abs(dx) > Math.abs(dy)) {
    nx = dx > 0 ? 1 : -1
    // Corner graze: already leaving along x but still driving into the corner
    // along y — the y face is the one actually being hit.
    if (vx * nx >= 0 && dy !== 0 && vy * dy < 0) { nx = 0; ny = dy > 0 ? 1 : -1 }
  } else {
    ny = dy > 0 ? 1 : -1
    if (vy * ny >= 0 && dx !== 0 && vx * dx < 0) { ny = 0; nx = dx > 0 ? 1 : -1 }
  }
  out.nx = nx
  out.ny = ny
  out.x = nx > 0 ? r + rad : nx < 0 ? l - rad : x
  out.y = ny > 0 ? b + rad : ny < 0 ? t - rad : y
  out.dx = dx
  out.dy = dy
  return true
}

/** Keeps a ball from skimming horizontally forever (CONTRACT §1). Zero vy
 *  resolves DOWNWARD so a stalled ball heads for the floor and the volley ends. */
export const antiStall = (b: { vx: number; vy: number }, speed: number): void => {
  const min = ANTI_STALL * speed
  if (Math.abs(b.vy) >= min) return
  b.vy = b.vy < 0 ? -min : min
  b.vx = (b.vx < 0 ? -1 : 1) * Math.sqrt(Math.max(0, speed * speed - min * min))
}

/** Sub-steps needed so a ball at `speed` moves < BALL_R per sub-step. */
export const substepsFor = (speed: number, dt: number): number =>
  Math.max(1, Math.ceil((speed * dt) / (BALL_R * 0.95)))

/** What the engine does when the physics reports something. */
export interface BallWorld {
  readonly grid: Grid
  /** Ball speed of the current volley (cells/s). */
  readonly speed: number
  readonly chest: FlyingChest | null
  onWall(ball: SimBall): void
  /** A ball drove into a monster face. Return false to pierce through it. */
  onMonster(ball: SimBall, m: Monster, nx: number, ny: number): boolean
  onPickup(ball: SimBall, p: Pickup): void
  onChest(ball: SimBall): void
  /** Must clear `ball.active`. */
  onLand(ball: SimBall): void
}

const contact: Contact = { nx: 0, ny: 0, x: 0, y: 0, dx: 0, dy: 0 }

const solidAt = (grid: Grid, c: number, r: number): boolean => grid.monsterAt(c, r) !== null || grid.hazardAt(c, r)

/**
 * A corner contact whose chosen face is glued to a neighbouring solid is a hit
 * on the flat face the two share — without this a ball skimming up into the
 * seam of a row gets a sideways kick (and a second hit) off an internal face.
 */
const unseam = (grid: Grid, bx: number, by: number, l: number, t: number, r: number, b: number): void => {
  const dx = contact.dx
  const dy = contact.dy
  if (dx === 0 || dy === 0) return
  if (contact.nx !== 0) {
    if (!solidAt(grid, contact.nx > 0 ? r : l - 1, dy > 0 ? b - 1 : t)) return
    contact.nx = 0
    contact.ny = dy > 0 ? 1 : -1
    contact.x = bx
    contact.y = dy > 0 ? b + BALL_R : t - BALL_R
  } else {
    if (!solidAt(grid, dx > 0 ? r - 1 : l, contact.ny > 0 ? b : t - 1)) return
    contact.ny = 0
    contact.nx = dx > 0 ? 1 : -1
    contact.x = dx > 0 ? r + BALL_R : l - BALL_R
    contact.y = by
  }
}

const bounce = (b: SimBall, speed: number): void => {
  if (contact.nx !== 0) b.vx = -b.vx
  if (contact.ny !== 0) b.vy = -b.vy
  antiStall(b, speed)
}

const overlapsBox = (b: SimBall, m: Monster): boolean => {
  const cx = b.x < m.col ? m.col : b.x > m.col + m.w ? m.col + m.w : b.x
  const cy = b.y < m.row ? m.row : b.y > m.row + m.h ? m.row + m.h : b.y
  const dx = b.x - cx
  const dy = b.y - cy
  return dx * dx + dy * dy < BALL_R * BALL_R
}

const collideSolids = (b: SimBall, w: BallWorld): void => {
  const grid = w.grid
  const c0 = Math.floor(b.x - BALL_R)
  const c1 = Math.floor(b.x + BALL_R)
  const r0 = Math.floor(b.y - BALL_R)
  const r1 = Math.floor(b.y + BALL_R)
  // A ball overlaps at most 2×2 cells; a monster spanning several of them must
  // be resolved once — these remember what this sub-step already handled.
  let seenA: Monster | null = null
  let seenB: Monster | null = null
  let seenC: Monster | null = null
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (c < 0 || c >= COLS) continue
      if (grid.hazardAt(c, r)) {
        if (circleBox(b.x, b.y, b.vx, b.vy, BALL_R, c, r, c + 1, r + 1, contact)) {
          unseam(grid, b.x, b.y, c, r, c + 1, r + 1)
          if (b.vx * contact.nx + b.vy * contact.ny < 0) bounce(b, w.speed)
          b.x = contact.x
          b.y = contact.y
        }
        continue
      }
      const m = grid.monsterAt(c, r)
      if (m === null || m === seenA || m === seenB || m === seenC || m === b.passing) continue
      if (seenA === null) seenA = m
      else if (seenB === null) seenB = m
      else seenC = m
      if (!circleBox(b.x, b.y, b.vx, b.vy, BALL_R, m.col, m.row, m.col + m.w, m.row + m.h, contact)) continue
      unseam(grid, b.x, b.y, m.col, m.row, m.col + m.w, m.row + m.h)
      if (b.vx * contact.nx + b.vy * contact.ny < 0) {
        // Driving into the face: this is the ONE damage event of the contact —
        // after the bounce the ball moves away, so the same face can't re-hit.
        const nx = contact.nx
        const ny = contact.ny
        const px = contact.x
        const py = contact.y
        if (w.onMonster(b, m, nx, ny)) {
          contact.nx = nx
          contact.ny = ny
          bounce(b, w.speed)
          b.x = px
          b.y = py
        } else {
          b.passing = m
        }
      } else {
        b.x = contact.x
        b.y = contact.y
      }
      if (!b.active) return
    }
  }
}

const collectPickups = (b: SimBall, w: BallWorld): void => {
  // The four cell centres nearest the ball are the only ones in reach.
  const c0 = Math.floor(b.x - 0.5)
  const r0 = Math.floor(b.y - 0.5)
  const reach = (BALL_R + PICKUP_R) * (BALL_R + PICKUP_R)
  for (let r = r0; r <= r0 + 1; r++) {
    for (let c = c0; c <= c0 + 1; c++) {
      const p = w.grid.pickupAt(c, r)
      if (p === null) continue
      const dx = b.x - (c + 0.5)
      const dy = b.y - (r + 0.5)
      if (dx * dx + dy * dy < reach) w.onPickup(b, p)
    }
  }
}

/** Advances one in-flight ball by `dt` simulated seconds. */
export const stepBall = (b: SimBall, dt: number, w: BallWorld): void => {
  const speed = w.speed
  const n = substepsFor(speed, dt)
  const h = dt / n
  for (let s = 0; s < n && b.active; s++) {
    b.x += b.vx * h
    b.y += b.vy * h

    if (b.passing !== null && (b.passing.hp <= 0 || !overlapsBox(b, b.passing))) b.passing = null

    if (b.x < BALL_R) {
      b.x = BALL_R
      if (b.vx < 0) { b.vx = -b.vx; antiStall(b, speed); w.onWall(b) }
    } else if (b.x > COLS - BALL_R) {
      b.x = COLS - BALL_R
      if (b.vx > 0) { b.vx = -b.vx; antiStall(b, speed); w.onWall(b) }
    }
    if (b.y < BALL_R) {
      b.y = BALL_R
      if (b.vy < 0) { b.vy = -b.vy; antiStall(b, speed); w.onWall(b) }
    }

    collideSolids(b, w)
    if (!b.active) return
    collectPickups(b, w)

    const chest = w.chest
    if (chest !== null) {
      const dx = b.x - chest.x
      const dy = b.y - chest.y
      const rr = chest.r + BALL_R
      if (dx * dx + dy * dy < rr * rr) w.onChest(b)
    }

    if (b.vy > 0 && b.y >= FLOOR_Y - BALL_R) {
      b.y = FLOOR_Y - BALL_R
      w.onLand(b)
    }
  }
}
