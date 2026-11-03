import { describe, expect, it } from 'vitest'
import { createWorld } from '@/umbrella/engine'
import { cameraFor, LANDSCAPE_ZOOM_MAX } from '@/umbrella/renderer'
import { LEVELS } from '@/umbrella/levels'

// A wide landscape phone with the controls' band at the bottom: the level used to letterbox small.
const CW = 2532, CH = 1170, BAND = CH * 0.2

describe('landscape phone camera', () => {
  it('zooms in on a wide phone, but never past LANDSCAPE_ZOOM_MAX, and keeps the player in view', () => {
    for (const l of LEVELS.slice(0, 12)) {
      const w = createWorld(l)
      const fit = Math.min(CW / (l.view?.w ?? l.world.w), (CH - BAND) / (l.view?.h ?? l.world.h))
      let cam = cameraFor(w, CW, CH, 0, BAND)
      for (let i = 0; i < 90; i++) cam = cameraFor(w, CW, CH, 1 / 60, BAND)
      expect(cam.s, `level ${l.id}`).toBeGreaterThan(fit * 1.05)
      expect(cam.s).toBeLessThanOrEqual(fit * LANDSCAPE_ZOOM_MAX + 1e-6)
      const pl = w.player
      const sx = cam.ox + (pl.x + pl.w / 2) * cam.s, sy = cam.oy + (pl.y + pl.h) * cam.s
      expect(sx).toBeGreaterThan(0); expect(sx).toBeLessThan(CW)
      expect(sy).toBeGreaterThan(0); expect(sy).toBeLessThan(CH - BAND + 1)
    }
  })
  it('leaves a screen that already fits the level alone', () => {
    const l = LEVELS[0]!
    const w = createWorld(l)
    const cam = cameraFor(w, 1920, 1080, 0, 0)
    expect(cam.s).toBeCloseTo(1920 / l.world.w)
  })
})
