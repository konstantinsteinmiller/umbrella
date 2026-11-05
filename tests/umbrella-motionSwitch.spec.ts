import { describe, expect, it } from 'vitest'
import { createWorld, platformActive, step, type World } from '@/umbrella/engine'
import { LEVELS } from '@/umbrella/levels'
import type { LevelDef } from '@/umbrella/levels'
import { DEFAULT_TUNING as T } from '@/umbrella/tuning'

const DT = 1 / 120
const base = LEVELS[0]!
/** A level with one gliding platform on channel 1, switching its motion, and a toggle button on the ground. */
const level = (whenOff = false): LevelDef => ({
  ...base,
  platforms: [
    { x: 40, y: 600, w: 300, h: 20 },
    { x: 400, y: 300, w: 80, h: 16, motion: { kind: 'line', a: { x: 440, y: 300 }, b: { x: 840, y: 300 }, period: 4 }, channel: 1, switchMotion: true, ...(whenOff ? { whenOff: true } : {}) }
  ],
  winds: [],
  hazards: [],
  stars: [],
  buttons: [],
  checkpoints: [],
  gates: [],
  spawn: { x: 100, y: 600 }
})
const advance = (w: World, s: number) => { for (let i = 0; i < s / DT; i++) step(w, { left: false, right: false, toggle: false }, DT, T) }
const px = (w: World) => w.platforms[1]!.x

describe('a button switching a platform\'s motion', () => {
  it('stands still while the channel is off, glides while it is on, and carries on where it stopped', () => {
    const w = createWorld(level())
    const start = px(w)
    advance(w, 1)
    expect(px(w)).toBe(start)
    w.channels[1] = Infinity
    advance(w, 1)
    const moved = px(w)
    expect(moved).toBeGreaterThan(start + 1)
    w.channels[1] = 0
    advance(w, 2)
    expect(px(w)).toBe(moved) // held, no jump to where the clock would be
    w.channels[1] = Infinity
    advance(w, 0.5)
    expect(px(w)).toBeGreaterThan(moved)
  })

  it('whenOff inverts it', () => {
    const w = createWorld(level(true))
    advance(w, 1)
    const a = px(w)
    expect(a).toBeGreaterThan(440 - 40 - 1)
    w.channels[1] = Infinity
    advance(w, 1)
    expect(px(w)).toBe(a)
  })

  it('is always solid and drawn, switched or not', () => {
    const w = createWorld(level())
    expect(platformActive(w, w.platforms[1]!)).toBe(true)
    w.channels[1] = Infinity
    expect(platformActive(w, w.platforms[1]!)).toBe(true)
  })

  it('leaves presence-switched platforms and plain movers as they were', () => {
    const l = level()
    delete l.platforms[1]!.switchMotion
    const w = createWorld(l)
    expect(platformActive(w, w.platforms[1]!)).toBe(false)
    const m = createWorld({ ...level(), platforms: [level().platforms[0]!, { ...level().platforms[1]!, channel: undefined, switchMotion: undefined }] })
    const x0 = px(m)
    advance(m, 1)
    expect(px(m)).not.toBe(x0)
  })
})
