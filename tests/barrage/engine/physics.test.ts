import { describe, expect, it } from 'vitest'
import { Grid, STEP, antiStall, stepBall, type BallWorld, type SimBall } from '@/barrage/engine/physics'
import { MOMENTUM, ballDamage, momentumMult } from '@/barrage/engine/balls'
import { BALL_R, COLS, FLOOR_Y, type Monster, type Pickup } from '@/barrage/engine/types'
import { board, mon, ofType, pick, record } from './helpers'

const ball = (x: number, y: number, vx: number, vy: number): SimBall => ({
  id: 1, tier: 1, x, y, vx, vy, active: true, landed: false, ghost: false, pierceLeft: 0, hits: 0, boost: 0, passing: null
})

const world = (monsters: Monster[], pickups: Pickup[] = [], speed = 26 * 3) => {
  const grid = new Grid()
  for (const m of monsters) grid.putMonster(m)
  for (const p of pickups) grid.putPickup(p)
  const hits: { id: number; nx: number; ny: number }[] = []
  const got: number[] = []
  const w: BallWorld = {
    grid,
    speed,
    chest: null,
    onWall: () => {},
    onMonster: (_b, m, nx, ny) => { hits.push({ id: m.id, nx, ny }); return true },
    onPickup: (_b, p) => { got.push(p.id); grid.removePickup(p) },
    onChest: () => {},
    onLand: b => { b.active = false; b.landed = true }
  }
  return { w, hits, got }
}

describe('physics', () => {
  it('never tunnels through a box at max speed × 3 fast-forward', () => {
    const speed = 26 * 3
    for (let i = 0; i < 40; i++) {
      const a = 0.3 + (i / 40) * (Math.PI - 0.6)
      const m = mon('slime', 0, 5)
      const wall = [m, ...[1, 2, 3, 4, 5, 6].map(c => mon('slime', c, 5))]
      const { w, hits } = world(wall, [], speed)
      const b = ball(3.5, FLOOR_Y - BALL_R, Math.cos(a) * speed, -Math.sin(a) * speed)
      for (let s = 0; s < 200 && b.active; s++) {
        stepBall(b, STEP * 3, w)
        expect(b.y).toBeGreaterThan(6 + BALL_R - 1e-9)
        expect(b.x).toBeGreaterThanOrEqual(BALL_R - 1e-9)
        expect(b.x).toBeLessThanOrEqual(COLS - BALL_R + 1e-9)
      }
      expect(hits.length).toBe(1)
      expect(b.landed).toBe(true)
    }
  })

  it('reflects on the nearest face and deals one hit per contact', () => {
    const m = mon('slime', 3, 5)
    const { w, hits } = world([m])
    const b = ball(3.5, 8, 0, -20)
    for (let s = 0; s < 60; s++) stepBall(b, STEP, w)
    expect(hits).toEqual([{ id: m.id, nx: 0, ny: 1 }])
    expect(b.vy).toBeGreaterThan(0)
  })

  it('a flat seam between two neighbours bounces like one wall (one hit)', () => {
    const a = mon('slime', 2, 5)
    const c = mon('slime', 3, 5)
    const { w, hits } = world([a, c])
    const b = ball(3, 8, 0.001, -20) // straight at the seam
    for (let s = 0; s < 60; s++) stepBall(b, STEP, w)
    expect(hits.length).toBe(1)
    expect(hits[0]!.ny).toBe(1)
    expect(b.vy).toBeGreaterThan(0)
  })

  it('passes through pickups, collecting them without deflecting', () => {
    const p = pick('ball', 3, 4)
    const { w, got } = world([], [p])
    const b = ball(3.5, 8, 0, -20)
    for (let s = 0; s < 40; s++) stepBall(b, STEP, w)
    expect(got).toEqual([p.id])
    expect(b.vx).toBe(0)
  })

  it('anti-stall keeps |vy| ≥ 0.18 × speed and the speed unchanged', () => {
    const v = { vx: 20, vy: -0.5 }
    antiStall(v, 20)
    expect(Math.abs(v.vy)).toBeCloseTo(0.18 * 20)
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(20)
    expect(v.vy).toBeLessThan(0)
    const flat = { vx: -20, vy: 0 }
    antiStall(flat, 20)
    expect(flat.vy).toBeGreaterThan(0) // a dead-flat ball heads for the floor
    expect(flat.vx).toBeLessThan(0)
  })

  it('hazards bounce balls but take no damage', () => {
    const e = board({ hazards: [{ id: 1, col: 3, row: 6, turns: 1 }], tray: [1] })
    const ev = record(e)
    e.fire(Math.PI / 2)
    e.settle()
    expect(ofType(ev, 'hit')).toHaveLength(0)
    expect(ofType(ev, 'ballLanded')).toHaveLength(1)
  })

  it('keeps balls in flight within the sprite budget (tray capacity 40)', () => {
    const e = board({ tray: Array.from({ length: 40 }, () => 1), config: { trayCapacity: 40, launchInterval: 0.045, ballSpeed: 26 } })
    e.fire(1.2)
    e.settle()
    expect(e.stats.maxBallsInFlight).toBeLessThanOrEqual(40)
  })

  describe('momentum (wall bounces speed a ball up and make it hit harder)', () => {
    const speedOf = (b: SimBall) => Math.hypot(b.vx, b.vy)

    it('a side-wall bounce adds perBounce of the launch speed, heading reflected', () => {
      const launch = 20
      const { w } = world([], [], launch)
      const b = ball(0.5, 5, -launch * 0.8, -launch * 0.6)
      for (let s = 0; s < 6 && b.boost === 0; s++) stepBall(b, STEP, w)
      expect(b.boost).toBeCloseTo(MOMENTUM.perBounce)
      expect(b.vx).toBeGreaterThan(0)
      expect(b.vy).toBeLessThan(0)
      expect(speedOf(b)).toBeCloseTo(launch * (1 + MOMENTUM.perBounce), 6)
    })

    it('the ceiling counts as a wall', () => {
      const launch = 20
      const { w } = world([], [], launch)
      const b = ball(3.5, 0.4, 0, -launch)
      for (let s = 0; s < 6 && b.boost === 0; s++) stepBall(b, STEP, w)
      expect(b.boost).toBeCloseTo(MOMENTUM.perBounce)
      expect(b.vy).toBeGreaterThan(0)
    })

    it('caps at MOMENTUM.max: a ball trapped above the rows flies at most (1 + max)× its launch speed', () => {
      const launch = 20
      // The lucky combo: a full row below, the ceiling above.
      const { w, hits } = world([0, 1, 2, 3, 4, 5, 6].map(c => mon('slime', c, 2)), [], launch)
      const walls: number[] = []
      w.onWall = (bb) => { walls.push(bb.boost) }
      const b = ball(3.5, 1, launch * 0.3, -launch * Math.sqrt(1 - 0.09))
      let top = 0
      for (let s = 0; s < 6000; s++) {
        stepBall(b, STEP, w)
        top = Math.max(top, speedOf(b))
      }
      expect(walls.length).toBeGreaterThan(MOMENTUM.max / MOMENTUM.perBounce)
      expect(hits.length).toBeGreaterThan(10)
      expect(Math.max(...walls)).toBeCloseTo(MOMENTUM.max)
      expect(b.boost).toBeCloseTo(MOMENTUM.max)
      expect(top).toBeLessThanOrEqual(launch * momentumMult(MOMENTUM.max) + 1e-6)
    })

    it('anti-stall keeps the boosted speed (it does not snap back to the launch speed)', () => {
      const launch = 20
      const { w } = world([], [], launch)
      const b = ball(0.4, 5, -launch * 1.5, 0)
      b.boost = 0.5
      for (let s = 0; s < 4 && b.boost === 0.5; s++) stepBall(b, STEP, w)
      expect(b.boost).toBeCloseTo(0.55)
      expect(speedOf(b)).toBeCloseTo(launch * 1.55, 6)
    })

    it('never tunnels through a box at max momentum × max speed × 3 fast-forward', () => {
      const speed = 26 * 3
      for (let i = 0; i < 40; i++) {
        const a = 0.3 + (i / 40) * (Math.PI - 0.6)
        const wall = [0, 1, 2, 3, 4, 5, 6].map(c => mon('slime', c, 5))
        const { w, hits } = world(wall, [], speed)
        const k = momentumMult(MOMENTUM.max)
        const b = ball(3.5, FLOOR_Y - BALL_R, Math.cos(a) * speed * k, -Math.sin(a) * speed * k)
        b.boost = MOMENTUM.max
        for (let s = 0; s < 200 && b.active; s++) {
          stepBall(b, STEP * 3, w)
          expect(b.y).toBeGreaterThan(6 + BALL_R - 1e-9)
        }
        expect(hits.length).toBe(1)
      }
    })

    it('engine: a banked ball hits for ballDamage × (1 + boost); a straight one for ballDamage', () => {
      const m = mon('slime', 3, 3)
      const e = board({ monsters: [m], launcherX: 3.5 })
      const ev = record(e)
      e.fire(Math.PI / 2)
      e.settle()
      const straight = ofType(ev, 'hit')[0]!
      expect(straight.boost).toBe(0)
      expect(straight.crit ? straight.dmg / 2 : straight.dmg).toBeCloseTo(ballDamage(1, 1))

      // Shallow to the left: off the left wall, then the right one, then up
      // into a full row of slimes.
      const e2 = board({ monsters: [0, 1, 2, 3, 4, 5, 6].map(c => mon('slime', c, 1)), launcherX: 3.5 })
      const ev2 = record(e2)
      e2.fire((5 * Math.PI) / 6)
      e2.settle()
      const hits = ofType(ev2, 'hit')
      const walls = ofType(ev2, 'wallBounce')
      expect(walls.length).toBeGreaterThan(0)
      const h = hits[0]!
      expect(h.boost).toBeGreaterThan(0)
      expect(h.crit ? h.dmg / 2 : h.dmg).toBeCloseTo(ballDamage(1, 1) * momentumMult(h.boost!))
    })
  })
})
