import { describe, expect, it } from 'vitest'
import { Grid, STEP, antiStall, stepBall, type BallWorld, type SimBall } from '@/barrage/engine/physics'
import { BALL_R, COLS, FLOOR_Y, type Monster, type Pickup } from '@/barrage/engine/types'
import { board, mon, ofType, pick, record } from './helpers'

const ball = (x: number, y: number, vx: number, vy: number): SimBall => ({
  id: 1, tier: 1, x, y, vx, vy, active: true, landed: false, ghost: false, pierceLeft: 0, hits: 0, passing: null
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
})
