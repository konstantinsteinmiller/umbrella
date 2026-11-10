import { describe, expect, it } from 'vitest'
import { createWorld, step } from '@/umbrella/engine'
import { DEFAULT_TUNING as T } from '@/umbrella/tuning'
import { P } from '@/umbrella/levelKit'

describe('a gentle updraft (speed 80, the whole screen)', () => {
  it('lifts a player who opens the umbrella on the ground instead of letting it shut on landing', () => {
    const w = createWorld({
      id: 9001, world: { w: 1280, h: 720 }, spawn: { x: 130, y: 570 },
      platforms: [P(0, 590, 1280, 130)],
      winds: [{ x: 0, y: 0, w: 1280, h: 710, dir: 'up', speed: 80 }]
    } as never)
    for (let i = 0; i < 60; i++) step(w, { left: false, right: false, toggle: false }, 1 / 120, T)
    const y0 = w.player.y
    let closed = false
    for (let i = 0; i < 240; i++) {
      if (step(w, { left: false, right: false, toggle: i === 0 }, 1 / 120, T).includes('close')) closed = true
    }
    expect(closed).toBe(false)
    expect(w.player.open).toBe(true)
    expect(w.player.y).toBeLessThan(y0 - 100)
  })
})
