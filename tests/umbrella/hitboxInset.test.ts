import { describe, expect, it } from 'vitest'
import { createWorld, step, type World } from '@/umbrella/engine'
import { DEFAULT_TUNING as T } from '@/umbrella/tuning'
import { P } from '@/umbrella/levelKit'

const run = (w: World, ticks: number, input: Partial<{ left: boolean; right: boolean; toggle: boolean }> = {}) => {
  for (let i = 0; i < ticks; i++) step(w, { left: false, right: false, toggle: false, ...input }, 1 / 120, T)
}
const world = (extra: object) =>
  createWorld({ id: 9005, world: { w: 1280, h: 720 }, spawn: { x: 300, y: 300 }, winds: [], ...extra } as never)

describe('collision inset', () => {
  it('a positive inset sinks him into the drawing, a negative one stops him above it', () => {
    const rest = (inset?: number) => {
      const w = world({ platforms: [P(150, 500, 400, 20, inset ? { inset } : {})] })
      run(w, 400)
      expect(w.player.grounded).toBe(true)
      return w.player.y + w.player.h
    }
    expect(rest()).toBeCloseTo(500, 3)
    expect(rest(8)).toBeCloseTo(508, 3)
    expect(rest(-8)).toBeCloseTo(492, 3)
  })

  it('a cloud hitbox can be pulled in too (and the drawn box is untouched)', () => {
    const w = world({ platforms: [P(150, 500, 400, 40, { cloud: true, inset: 10 })] })
    run(w, 400)
    expect(w.player.y + w.player.h).toBeCloseTo(510, 3)
    expect(w.platforms[0]!.y).toBe(500)
    expect(w.platforms[0]!.h).toBe(40)
  })

  it('a deadly hazard only kills inside its inset hitbox', () => {
    const at = (inset: number) => {
      // Spawn beside a floor-level pillar so that he overlaps its drawn edge by 6 px only.
      const w = world({
        spawn: { x: 120, y: 600 },
        platforms: [P(0, 600, 1280, 60)],
        hazards: [{ kind: 'pillar', x: 120 + 12 - 6, y: 520, w: 60, h: 80, contact: 'deadly', ...(inset ? { inset } : {}) }]
      })
      run(w, 30)
      return w.phase
    }
    expect(at(0)).toBe('splat')
    expect(at(12)).toBe('play')
  })

  it('a current reaches as far as its inset hitbox, not its drawn box', () => {
    const rise = (inset: number) => {
      // The column is drawn 60 px away from his open canopy (which spans x 270-330).
      const w = world({
        spawn: { x: 300, y: 600 },
        platforms: [P(0, 600, 1280, 60)],
        winds: [{ x: 390, y: 100, w: 60, h: 500, dir: 'up', speed: 300, ...(inset ? { inset } : {}) }]
      })
      run(w, 60)
      step(w, { left: false, right: false, toggle: true }, 1 / 120, T)
      run(w, 240)
      return w.player.y
    }
    // As drawn it never reaches him; grown by 80 px on every side it does, and he rises.
    expect(rise(0)).toBeGreaterThan(560)
    expect(rise(-80)).toBeLessThan(400)
  })
})
