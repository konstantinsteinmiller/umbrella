import { describe, expect, it } from 'vitest'
import { createWorld, step } from '@/umbrella/engine'
import { DEFAULT_TUNING as T } from '@/umbrella/tuning'
import { P } from '@/umbrella/levelKit'
import { pushOutOfTurned, turnedCorners } from '@/umbrella/turnedBox'

const world = (angle: number, extra: object = {}) =>
  createWorld({
    id: 9003, world: { w: 1280, h: 720 }, spawn: { x: 300, y: 300 },
    platforms: [P(150, 500, 400, 20, { angle, ...extra })],
    winds: []
  } as never)
const run = (w: ReturnType<typeof world>, ticks: number, input: Partial<{ left: boolean; right: boolean; toggle: boolean }> = {}) => {
  for (let i = 0; i < ticks; i++) step(w, { left: false, right: false, toggle: false, ...input }, 1 / 120, T)
}

describe('turned boxes', () => {
  it('push an upright box out along the nearest face', () => {
    // A 30° slab: a box sunk into its top is pushed up and a little left (the face's normal).
    const push = pushOutOfTurned({ x: 190, y: 440, w: 24, h: 36 }, { x: 0, y: 0, w: 400, h: 20, angle: 30 })
    expect(push === null || push.ny < 0).toBe(true)
    expect(turnedCorners({ x: 0, y: 0, w: 100, h: 20, angle: 90 })[0]!.x).toBeCloseTo(60, 5)
  })
})

describe('a turned platform in play', () => {
  it('a flat one (angle 0) still lands and holds him', () => {
    const w = world(0)
    run(w, 240)
    expect(w.player.grounded).toBe(true)
  })

  it('a slope can be stood on: he lands, stays put and is not pushed through', () => {
    const w = world(20)
    run(w, 400)
    expect(w.player.grounded).toBe(true)
    const y = w.player.y
    run(w, 240)
    expect(w.player.grounded).toBe(true)
    expect(Math.abs(w.player.y - y)).toBeLessThan(0.5)
  })

  it('walking up and down a slope keeps him on it', () => {
    const w = world(25)
    run(w, 400)
    for (const dir of ['right', 'left'] as const) {
      for (let i = 0; i < 90; i++) {
        step(w, { left: dir === 'left', right: dir === 'right', toggle: false }, 1 / 120, T)
        expect(w.player.grounded).toBe(true)
      }
    }
  })

  it('a steep slab is a wall: he walks into it and is stopped', () => {
    const w = createWorld({
      id: 9004, world: { w: 1280, h: 720 }, spawn: { x: 150, y: 600 },
      platforms: [P(0, 600, 1280, 60), P(300, 397, 400, 20, { angle: 75 })],
      winds: []
    } as never)
    run(w, 60)
    run(w, 600, { right: true })
    // The slab's lower end is around x 500: he never gets past its face.
    expect(w.player.x).toBeLessThan(520)
    expect(w.player.grounded).toBe(true)
  })
})
