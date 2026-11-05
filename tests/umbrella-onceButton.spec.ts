import { describe, expect, it } from 'vitest'
import { channelOn, createWorld, step, type World } from '@/umbrella/engine'
import { LEVELS } from '@/umbrella/levels'
import type { ButtonDef, LevelDef } from '@/umbrella/levels'
import { DEFAULT_TUNING as T } from '@/umbrella/tuning'

const DT = 1 / 120
const level = (button: Partial<ButtonDef>): LevelDef => ({
  ...LEVELS[0]!,
  platforms: [{ x: 0, y: 600, w: 600, h: 20 }],
  winds: [], hazards: [], stars: [], checkpoints: [], gates: [],
  buttons: [{ x: 200, y: 586, w: 40, h: 14, channel: 1, ...button }],
  spawn: { x: 100, y: 600 }
})
const run = (w: World, s: number, right: boolean) => { for (let i = 0; i < s / DT; i++) step(w, { left: false, right, toggle: false }, DT, T) }
/** Walk over the button, then off it and back on again (a second press). */
const pressTwice = (w: World) => {
  const pl = w.player
  pl.x = 150; run(w, 0.5, true) // across it
  pl.x = 300; run(w, 0.2, false) // off it
  pl.x = 150; run(w, 0.5, true) // again
}

describe('one-time buttons', () => {
  it('a toggle button flips back on the second press, a one-time one does not', () => {
    const normal = createWorld(level({}))
    pressTwice(normal)
    expect(channelOn(normal, 1)).toBe(false) // on, then off again
    const once = createWorld(level({ once: true }))
    pressTwice(once)
    expect(channelOn(once, 1)).toBe(true) // on and stays on
    expect(once.buttonsUsed?.[0]).toBe(true)
  })

  it('a timed one-time button runs once and a second press does not restart it', () => {
    const w = createWorld(level({ once: true, duration: 0.3 }))
    pressTwice(w)
    expect(channelOn(w, 1)).toBe(false)
    expect(w.buttonsUsed?.[0]).toBe(true)
  })

  it('a regular button keeps working every time', () => {
    const w = createWorld(level({ duration: 0.3 }))
    w.player.x = 150; run(w, 0.3, true)
    expect(channelOn(w, 1)).toBe(true)
  })
})
