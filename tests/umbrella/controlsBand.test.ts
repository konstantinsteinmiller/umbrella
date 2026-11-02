import { describe, expect, it } from 'vitest'
import { createWorld } from '@/umbrella/engine'
import { LEVELS } from '@/umbrella/levels'
import { cameraFor } from '@/umbrella/renderer'

// #play-1-7: in landscape the touch controls' band at the bottom is kept clear of the level.
const CW = 844 * 3
const CH = 390 * 3
const BAND = 0.2 * CH

describe('landscape controls band', () => {
  it('every level\'s visible world ends above the band', () => {
    for (const lv of LEVELS) {
      const w = createWorld(lv)
      const cam = cameraFor(w, CW, CH, 0, BAND)
      const seenH = Math.min(lv.world.h, (lv.view && lv.view.h < lv.world.h ? CH - BAND : Infinity) / cam.s)
      const bottom = cam.oy + Math.min(lv.world.h * cam.s, CH - BAND)
      expect(bottom, lv.name ?? '').toBeLessThanOrEqual(CH - BAND + 1)
      expect(seenH).toBeGreaterThan(0)
    }
  })
  it('no band: the camera is unchanged; portrait ignores it', () => {
    const w = createWorld(LEVELS[0]!)
    expect(cameraFor(w, CW, CH, 0, 0)).toEqual(cameraFor(createWorld(LEVELS[0]!), CW, CH, 0))
    expect(cameraFor(createWorld(LEVELS[0]!), 390, 844, 0, 200)).toEqual(cameraFor(createWorld(LEVELS[0]!), 390, 844, 0))
  })
})
