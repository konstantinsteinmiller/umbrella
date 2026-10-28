import { describe, expect, it } from 'vitest'
import { createWorld, step } from '@/umbrella/engine'
import { LEVELS, type LevelDef } from '@/umbrella/levels'
import { DEFAULT_TUNING } from '@/umbrella/tuning'

const none = { left: false, right: false, toggle: false }
const size = { w: DEFAULT_TUNING.playerWidth, h: DEFAULT_TUNING.playerHeight }
const base: LevelDef = {
  ...LEVELS[0]!, spawn: { x: 300, y: 500 }, winds: [], hazards: [],
  platforms: [{ x: 100, y: 500, w: 400, h: 20 }]
}

describe('open umbrella on a platform', () => {
  it('starts open and stays open on the platform when the level asks for it', () => {
    const w = createWorld({ ...base, spawnOpen: true }, size)
    for (let i = 0; i < 60; i++) step(w, none, 1 / 60, DEFAULT_TUNING)
    expect(w.player.open).toBe(true)
    expect(w.player.grounded).toBe(true)
  })
  it('starts closed by default', () => {
    const w = createWorld(base, size)
    for (let i = 0; i < 60; i++) step(w, none, 1 / 60, DEFAULT_TUNING)
    expect(w.player.open).toBe(false)
  })
  it('an umbrella opened on the platform catches a current above it and lifts off', () => {
    const level = { ...base, winds: [{ x: 250, y: 300, w: 120, h: 200, dir: 'up' as const, speed: 120 }] }
    const w = createWorld(level, size)
    for (let i = 0; i < 10; i++) step(w, none, 1 / 60, DEFAULT_TUNING)
    expect(w.player.grounded).toBe(true)
    for (let i = 0; i < 60; i++) step(w, { ...none, toggle: i === 0 }, 1 / 60, DEFAULT_TUNING)
    expect(w.player.grounded).toBe(false)
    expect(w.player.y).toBeLessThan(500 - DEFAULT_TUNING.playerHeight - 20)
  })
  it('stays put on the platform with the umbrella closed', () => {
    const level = { ...base, winds: [{ x: 250, y: 300, w: 120, h: 200, dir: 'up' as const, speed: 120 }] }
    const w = createWorld(level, size)
    for (let i = 0; i < 60; i++) step(w, none, 1 / 60, DEFAULT_TUNING)
    expect(w.player.grounded).toBe(true)
  })
})
