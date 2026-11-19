import { describe, expect, it } from 'vitest'
import { channelOn, createWorld, hudTimer, platformActive, step, type World } from '@/umbrella/engine'
import { LEVELS } from '@/umbrella/levels'
import type { LevelDef, TimerDef } from '@/umbrella/levels'
import { parseLevel } from '@/umbrella/customLevels'
import { DEFAULT_TUNING as T } from '@/umbrella/tuning'

const DT = 1 / 120
const level = (timer: Partial<TimerDef>): LevelDef => ({
  ...LEVELS[0]!,
  platforms: [{ x: 0, y: 600, w: 900, h: 20 }, { x: 600, y: 400, w: 30, h: 200, channel: 2, closing: true }],
  winds: [], hazards: [], stars: [], checkpoints: [], gates: [],
  buttons: [{ x: 200, y: 586, w: 40, h: 14, channel: 1, duration: 0.01 }],
  timers: [{ x: 700, y: 500, w: 60, h: 60, channel: 2, duration: 2, trigger: 1, ...timer }],
  spawn: { x: 100, y: 600 }
})
const run = (w: World, s: number) => { for (let i = 0; i < s / DT; i++) step(w, { left: false, right: false, toggle: false }, DT, T) }
const door = (w: World) => w.platforms[1]!

describe('timer element', () => {
  it('holds the channel (door open, full time shown) while the button is stood on, counts down after stepping off, door shuts at 0', () => {
    const w = createWorld(level({ onRelease: true }))
    expect(door(w).h).toBe(200)
    w.player.x = 205; w.player.y = 586 - w.player.h; run(w, 0.5)
    expect(channelOn(w, 2)).toBe(true)
    expect(door(w).h).toBeLessThan(1) // open
    expect(hudTimer(w)).toMatchObject({ held: true, left: 2 })
    w.player.x = 400; run(w, 0.05) // stepped off: the countdown begins
    expect(hudTimer(w)?.held).toBe(false)
    run(w, 1)
    expect(door(w).h).toBeGreaterThan(60)
    expect(door(w).h).toBeLessThan(140) // roughly half way down
    run(w, 1.2)
    expect(channelOn(w, 2)).toBe(false)
    expect(door(w).h).toBe(200)
    expect(platformActive(w, door(w))).toBe(true)
  })

  it('without onRelease the countdown starts at the press', () => {
    const w = createWorld(level({}))
    w.player.x = 205; w.player.y = 586 - w.player.h; run(w, 0.5)
    expect(hudTimer(w)?.held).toBe(false)
    expect(hudTimer(w)!.left).toBeLessThan(1.7)
  })

  it('onCollision: touching the timer box starts it', () => {
    const w = createWorld(level({ trigger: undefined, onCollision: true }))
    w.player.x = 705; w.player.y = 520; run(w, 0.1)
    expect(channelOn(w, 2)).toBe(true)
  })

  it('a timer with no trigger and no collision never starts', () => {
    const w = createWorld(level({ trigger: undefined }))
    run(w, 1)
    expect(channelOn(w, 2)).toBe(false)
  })

  it('the level validator keeps a good timer and refuses a bad one', () => {
    expect(parseLevel(JSON.parse(JSON.stringify(level({ onRelease: true, onCollision: true }))))?.timers?.[0]?.onRelease).toBe(true)
    expect(parseLevel(JSON.parse(JSON.stringify(level({ duration: 0 }))))).toBeNull()
  })
})
