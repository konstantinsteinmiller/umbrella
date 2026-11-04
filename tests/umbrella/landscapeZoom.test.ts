import { describe, expect, it } from 'vitest'
import { createWorld } from '@/umbrella/engine'
import { cameraFor } from '@/umbrella/renderer'
import { FOCUS_ZOOM_MAX, frameFocus, levelFocus } from '@/umbrella/cameraFocus'
import { LEVELS, type LevelDef } from '@/umbrella/levels'

// Screens a landscape player may have: a wide phone with the controls' band, 16:9, 4:3, and an ultrawide.
const SCREENS: { name: string; cw: number; ch: number; band: number }[] = [
  { name: 'wide phone + band', cw: 2532, ch: 1170, band: 1170 * 0.2 },
  { name: '16:9', cw: 1920, ch: 1080, band: 0 },
  { name: '4:3', cw: 1024, ch: 768, band: 0 },
  { name: 'ultrawide', cw: 2560, ch: 1080, band: 0 }
]

/** The world rectangle the camera shows, in world units. */
const seen = (l: LevelDef, cw: number, ch: number, band: number) => {
  const cam = cameraFor(createWorld(l), cw, ch, 0, band)
  const fh = Math.max(ch * 0.5, ch - band)
  return { cam, left: -cam.ox / cam.s, top: -cam.oy / cam.s, vw: cw / cam.s, vh: fh / cam.s }
}

describe('landscape framing', () => {
  for (const sc of SCREENS) {
    it(`${sc.name}: holds the start and the finish from the first frame, never shows below the out-of-bounds line`, () => {
      for (const l of LEVELS) {
        if (l.fixedScreen || l.verticalCamera || (l.view && (l.view.w < l.world.w || l.view.h < l.world.h))) continue
        const v = seen(l, sc.cw, sc.ch, sc.band)
        const f = levelFocus(l)
        const fin = l.platforms.find((p) => p.finish)
        const eps = 1e-6
        // The start and the finish are in view.
        expect(l.spawn.x, `level ${l.id} start x`).toBeGreaterThanOrEqual(v.left - eps)
        expect(l.spawn.x).toBeLessThanOrEqual(v.left + v.vw + eps)
        if (fin) {
          expect(fin.x, `level ${l.id} finish`).toBeGreaterThanOrEqual(v.left - eps)
          expect(fin.x + fin.w).toBeLessThanOrEqual(v.left + v.vw + eps)
        }
        // The whole focus fits (it is the box around every main item).
        expect(f.x0).toBeGreaterThanOrEqual(v.left - eps)
        expect(f.x1).toBeLessThanOrEqual(v.left + v.vw + eps)
        expect(f.y1).toBeLessThanOrEqual(v.top + v.vh + eps)
        // Nothing below the world's bottom (where the out-of-bounds death waits).
        expect(v.top + v.vh, `level ${l.id} bottom`).toBeLessThanOrEqual(l.world.h + eps)
        // Never smaller than the whole-world fit, never closer than FOCUS_ZOOM_MAX of it.
        const fit = Math.min(sc.cw / l.world.w, Math.max(sc.ch * 0.5, sc.ch - sc.band) / l.world.h)
        expect(v.cam.s).toBeGreaterThanOrEqual(fit - eps)
        expect(v.cam.s).toBeLessThanOrEqual(Math.max(fit * FOCUS_ZOOM_MAX, Math.max(sc.cw / l.world.w, Math.max(sc.ch * 0.5, sc.ch - sc.band) / l.world.h)) + eps)
      }
    })
  }

  it('leaves no empty strip at the sides or below when the level fills the world', () => {
    const l = LEVELS[0]!
    const v = seen(l, 1920, 1080, 0)
    // The view is inside the world on every side whenever the world is large enough to fill it.
    expect(v.left).toBeGreaterThanOrEqual(-1e-6)
    expect(v.left + v.vw).toBeLessThanOrEqual(l.world.w + 1e-6)
    expect(v.top).toBeGreaterThanOrEqual(-1e-6)
  })

  it('a world that holds little zooms on its items instead of showing the empty rest', () => {
    // Everything sits in the top-left of a big world: the view closes in on it and the empty rest is left out.
    const l: LevelDef = {
      id: 9001, world: { w: 1280, h: 720 }, spawn: { x: 200, y: 200 },
      platforms: [{ x: 100, y: 240, w: 200, h: 20 }, { x: 560, y: 160, w: 200, h: 20, finish: true }], winds: []
    }
    const f = frameFocus(l, 1280, 720)
    expect(f.s).toBeGreaterThan(1.2)
    // The bottom edge of the view stays inside the world.
    expect(f.top + 720 / f.s).toBeLessThanOrEqual(l.world.h + 1e-6)
  })

  it('a screen taller than the world sits on its bottom: the empty space goes above, not below', () => {
    const l = LEVELS[0]!
    const f = frameFocus(l, 1000, 1000)
    expect(f.top + 1000 / f.s).toBeCloseTo(l.world.h)
  })
})
