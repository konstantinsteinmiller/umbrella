import { describe, expect, it } from 'vitest'
import { AimController } from '@/barrage/render/aim'
import { MIN_AIM } from '@/barrage/engine/types'

const UP = Math.PI / 2

/** Drag from (x0,y0) to (x1,y1) in `steps` moves spaced `ms` apart. */
const drag = (a: AimController, x0: number, y0: number, x1: number, y1: number, steps: number, ms: number): void => {
  a.begin(1, x0, y0, 0)
  for (let i = 1; i <= steps; i++) a.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, i * ms)
}

describe('slingshot aim', () => {
  it('pulling straight down shoots straight up', () => {
    expect(AimController.pullAngle(0, 100)).toBeCloseTo(UP)
  })

  it('pulling down-left shoots up-right (angle < 90°), down-right shoots up-left', () => {
    expect(AimController.pullAngle(-50, 100)).toBeLessThan(UP)
    expect(AimController.pullAngle(50, 100)).toBeGreaterThan(UP)
  })

  it('pulling upward pins the aim to the nearer edge of the fan', () => {
    expect(AimController.pullAngle(-80, -10)).toBeCloseTo(MIN_AIM)
    expect(AimController.pullAngle(80, -10)).toBeCloseTo(Math.PI - MIN_AIM)
  })

  it('a tiny drag is a cancel, not a shot', () => {
    const a = new AimController()
    a.minPull = 16
    drag(a, 100, 100, 104, 108, 4, 16)
    expect(a.armed).toBe(false)
    expect(a.end()).toBeNull()
  })

  it('a real pull arms and fires the pull angle', () => {
    const a = new AimController()
    drag(a, 100, 100, 100, 220, 8, 16)
    expect(a.armed).toBe(true)
    const shot = a.end()
    expect(shot).not.toBeNull()
    expect(shot!).toBeCloseTo(UP, 1)
    expect(a.active).toBe(false)
  })

  it('a slow creep turns the aim less than the finger does (fine aim)', () => {
    const a = new AimController()
    drag(a, 100, 100, 100, 220, 8, 16) // fast pull → armed at ~90°
    const before = a.angle
    // Creep 30 px sideways over 1.5 s (20 px/s — well under the fine-aim threshold).
    for (let i = 1; i <= 30; i++) a.move(100 + i, 220, 8 * 16 + i * 50)
    const raw = AimController.pullAngle(30, 120)
    const fingerTurn = Math.abs(raw - before)
    const aimTurn = Math.abs(a.angle - before)
    expect(aimTurn).toBeGreaterThan(0)
    expect(aimTurn).toBeLessThan(fingerTurn * 0.6)
  })

  it('a fast sweep follows the finger', () => {
    const a = new AimController()
    drag(a, 100, 100, 100, 220, 8, 16)
    for (let i = 1; i <= 6; i++) a.move(100 + i * 15, 220, 8 * 16 + i * 8) // ~1900 px/s
    const raw = AimController.pullAngle(90, 120)
    expect(Math.abs(a.angle - raw)).toBeLessThan(0.12)
  })

  it('never leaves the valid fan', () => {
    const a = new AimController()
    drag(a, 200, 100, 200, 200, 5, 16)
    for (let i = 1; i <= 40; i++) a.move(200 - i * 30, 100 - i * 5, 80 + i * 10)
    expect(a.angle).toBeGreaterThanOrEqual(MIN_AIM - 1e-9)
    expect(a.angle).toBeLessThanOrEqual(Math.PI - MIN_AIM + 1e-9)
  })
})

describe('wrong-way pulls (pointing AT the monsters)', () => {
  it('a clearly upward pull arms nothing, flags wrongWay, and releases as a no-shot', () => {
    const a = new AimController()
    drag(a, 200, 400, 230, 150, 8, 16) // finger slides up toward the monsters
    expect(a.wrongWay).toBe(true)
    expect(a.armed).toBe(false)
    expect(a.end()).toBeNull()
    expect(a.endedWrongWay).toBe(true)
  })

  it('a pull a little above the horizontal still pins a flat shot (sloppy thumbs)', () => {
    const a = new AimController()
    drag(a, 200, 300, 60, 270, 8, 16) // left and ~12° up
    expect(a.wrongWay).toBe(false)
    expect(a.armed).toBe(true)
    expect(a.end()!).toBeCloseTo(MIN_AIM, 5)
    expect(a.endedWrongWay).toBe(false)
  })

  it('swinging back into a real pull re-arms at the pull angle', () => {
    const a = new AimController()
    drag(a, 200, 300, 200, 150, 6, 16)
    expect(a.wrongWay).toBe(true)
    for (let i = 1; i <= 8; i++) a.move(200, 150 + i * 40, 6 * 16 + i * 16)
    expect(a.wrongWay).toBe(false)
    expect(a.armed).toBe(true)
    expect(a.end()!).toBeCloseTo(UP, 1)
    expect(a.endedWrongWay).toBe(false)
  })

  it('the boundary sits at 35° above the horizontal', () => {
    const t = Math.tan((35 * Math.PI) / 180)
    expect(AimController.isWrongWay(100, -100 * t * 1.05)).toBe(true)
    expect(AimController.isWrongWay(100, -100 * t * 0.95)).toBe(false)
    expect(AimController.isWrongWay(0, 100)).toBe(false)
  })

  it('a tiny drag is neither armed nor wrong-way', () => {
    const a = new AimController()
    a.minPull = 16
    drag(a, 100, 100, 101, 92, 4, 16)
    expect(a.wrongWay).toBe(false)
    expect(a.end()).toBeNull()
    expect(a.endedWrongWay).toBe(false)
  })
})
