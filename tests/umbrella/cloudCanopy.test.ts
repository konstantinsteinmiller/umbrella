import { describe, expect, it } from 'vitest'
import { createWorld, step, umbrellaBox, umbrellaStrips } from '@/umbrella/engine'
import { DEFAULT_TUNING as T } from '@/umbrella/tuning'
import { P } from '@/umbrella/levelKit'

const level = (cloud: boolean) =>
  createWorld({
    id: 9002, world: { w: 1280, h: 720 }, spawn: { x: 300, y: 640 },
    platforms: [P(0, 660, 1280, 60), P(200, 300, 220, 40, cloud ? { cloud: true } : {})],
    winds: [{ x: 0, y: 0, w: 1280, h: 700, dir: 'up', speed: 300 }]
  } as never)

describe('the open canopy and cloud platforms', () => {
  it('stops under a cloud instead of clipping into it', () => {
    const w = level(true)
    for (let i = 0; i < 600; i++) {
      step(w, { left: false, right: false, toggle: i === 90 }, 1 / 120, T)
      if (w.player.open && i > 100) for (const s of umbrellaStrips(w.player)) expect(s.y).toBeGreaterThanOrEqual(340 - 0.01)
    }
    expect(w.player.open).toBe(true)
    expect(w.player.y).toBeGreaterThan(340)
  })

  it('a plain platform still ignores the canopy', () => {
    const w = level(false)
    for (let i = 0; i < 400; i++) step(w, { left: false, right: false, toggle: i === 90 }, 1 / 120, T)
    // The body is blocked by the platform's underside; the canopy went through it.
    expect(umbrellaBox(w.player).y).toBeLessThan(340)
  })

  it('the strips follow the dome: round in the middle, low at the rim, inside the old box', () => {
    const w = level(true)
    const strips = umbrellaStrips(w.player)
    const box = umbrellaBox(w.player)
    expect(strips.length).toBe(10)
    for (const s of strips) {
      expect(s.y).toBeGreaterThanOrEqual(box.y - 0.01)
      expect(s.y + s.h).toBeCloseTo(box.y + box.h, 5)
    }
    expect(strips[4]!.h).toBeGreaterThan(strips[0]!.h * 2)
    expect(strips[0]!.h).toBeCloseTo(strips[9]!.h, 5)
  })
})
