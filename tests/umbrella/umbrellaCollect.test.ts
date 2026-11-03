import { describe, expect, it } from 'vitest'
import { createWorld, step, type Input } from '@/umbrella/engine'
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
})
