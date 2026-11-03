import { describe, expect, it } from 'vitest'
import { createWorld, itemBox, step, type Input } from '@/umbrella/engine'
import { cameraFor } from '@/umbrella/renderer'
import { DEFAULT_TUNING } from '@/umbrella/tuning'
import type { LevelDef } from '@/umbrella/levels'

const none: Input = { left: false, right: false, toggle: false }
const level = (starY: number): LevelDef => ({
  id: 1, world: { w: 1280, h: 720 }, spawn: { x: 300, y: 400 },
  platforms: [{ x: 0, y: 700, w: 1280, h: 20 }], winds: [],
  // Above the player's head, inside an open canopy's reach but out of the body's.
  stars: [{ x: 300, y: starY }]
} as LevelDef)

describe('collectibles', () => {
  it('an open umbrella collects one above the head; the body alone does not reach it', () => {
    const probe = createWorld(level(0), undefined, -1)
    // The middle of the open canopy: 46 px above the head, well clear of the body.
    const starY = probe.player.y - 46
    const closed = createWorld(level(starY), undefined, -1)
    closed.player.open = false
    closed.player.grounded = false
    step(closed, none, 1 / 60, DEFAULT_TUNING)
    const open = createWorld(level(starY), undefined, -1)
    open.player.open = true
    open.player.grounded = false
    open.player.autoShow = -1
    step(open, none, 1 / 60, DEFAULT_TUNING)
    expect(open.starsGot[0]).toBe(true)
    expect(closed.starsGot[0]).toBe(false)
  })

  it('with the umbrella open the item box runs from the canopy rim down to the feet, a little wider than the body', () => {
    const w = createWorld(level(0), undefined, -1)
    const pl = w.player
    pl.open = true
    expect(itemBox(pl)).toEqual({ x: pl.x + pl.w / 2 - 23, y: pl.y - 26, w: 46, h: pl.h + 26 })
    pl.open = false
    expect(itemBox(pl)).toEqual({ x: pl.x, y: pl.y, w: pl.w, h: pl.h })
  })

  it('a level can raise its ceiling', () => {
    const lv = { ...level(0), ceiling: 10, winds: [{ x: 0, y: 0, w: 1280, h: 720, dir: 'up', speed: 600 }] } as LevelDef
    const w = createWorld(lv, undefined, -1)
    w.player.open = true
    w.player.grounded = false
    w.player.autoShow = -1
    for (let i = 0; i < 240; i++) step(w, none, 1 / 60, DEFAULT_TUNING)
    expect(w.player.y).toBeLessThan(56)
    expect(w.player.y).toBeGreaterThanOrEqual(10)
  })

  it('a vertical-camera level has no ceiling and the camera follows the player above its top edge; a fixed screen never moves', () => {
    const lv = { ...level(0), verticalCamera: true, winds: [{ x: 0, y: -2000, w: 1280, h: 2720, dir: 'up', speed: 900 }] } as LevelDef
    const w = createWorld(lv, undefined, -1)
    w.player.open = true
    w.player.grounded = false
    w.player.autoShow = -1
    for (let i = 0; i < 240; i++) step(w, none, 1 / 60, DEFAULT_TUNING)
    expect(w.player.y).toBeLessThan(0)
    const cam = cameraFor(w, 1280, 720, 1 / 60)
    expect(cam.oy).toBeGreaterThan(0)
    // Fixed screen wins: the camera never moves, in landscape or on a portrait phone, wherever he is.
    const fixed = createWorld({ ...lv, fixedScreen: true } as LevelDef, undefined, -1)
    for (const [cw, ch] of [[1280, 720], [400, 800]] as const) {
      fixed.player.y = 300
      const a = cameraFor(fixed, cw, ch, 1 / 60)
      fixed.player.y = -300
      fixed.player.x = 900
      const b = cameraFor(fixed, cw, ch, 1 / 60)
      expect(b).toEqual(a)
    }
    const closed = createWorld({ ...lv, verticalCamera: false } as LevelDef, undefined, -1)
    expect(cameraFor(closed, 1280, 720, 1 / 60).oy).toBeLessThanOrEqual(0.001 + (720 - 720 * Math.min(1280 / 1280, 720 / 720)) / 2)
  })
})
