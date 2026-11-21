import { describe, expect, it } from 'vitest'
import { createWorld, step, type World } from '@/umbrella/engine'
import { LEVELS, type LevelDef } from '@/umbrella/levels'
import { DEFAULT_TUNING as T } from '@/umbrella/tuning'

const DT = 1 / 120
const base = LEVELS[0]!
const none = { left: false, right: false, toggle: false }
const level = (platforms: LevelDef['platforms'], spawn = { x: 100, y: 600 }): LevelDef => ({
  ...base, platforms, winds: [], hazards: [], stars: [], buttons: [], checkpoints: [], gates: [], spawn
})
const run = (w: World, s: number, input = none) => { for (let i = 0; i < s / DT; i++) step(w, input, DT, T) }
const floor = { x: 0, y: 700, w: 1000, h: 20 }

describe('one-way ledges', () => {
  it('lets the player rise through from below and stands him on top after', () => {
    const w = createWorld(level([floor, { x: 60, y: 560, w: 200, h: 20, oneWay: true }], { x: 160, y: 640 }))
    w.player.vy = -900 // thrown upward from below the ledge
    run(w, 0.15)
    expect(w.player.y + w.player.h).toBeLessThan(560) // he is above the ledge's top: he went through
    run(w, 3)
    expect(w.player.grounded).toBe(true)
    expect(w.player.y + w.player.h).toBeCloseTo(560, 0)
  })

  it('has no sides: walking into it from the side passes through', () => {
    const w = createWorld(level([floor, { x: 300, y: 650, w: 60, h: 50, oneWay: true }], { x: 100, y: 700 }))
    run(w, 3, { ...none, right: true })
    expect(w.player.x).toBeGreaterThan(380)
  })
})

describe('drop-through ledges', () => {
  it('sinks the player through when the umbrella is opened on it', () => {
    const w = createWorld(level([floor, { x: 60, y: 560, w: 300, h: 20, dropThrough: true }], { x: 160, y: 560 }))
    run(w, 0.3)
    expect(w.player.grounded).toBe(true)
    step(w, { ...none, toggle: true }, DT, T)
    run(w, 4)
    expect(w.player.y + w.player.h).toBeCloseTo(700, 0) // landed on the floor below
  })

  it('a plain ledge keeps him standing when the umbrella opens', () => {
    const w = createWorld(level([floor, { x: 60, y: 560, w: 300, h: 20 }], { x: 160, y: 560 }))
    run(w, 0.3)
    step(w, { ...none, toggle: true }, DT, T)
    run(w, 1)
    expect(w.player.y + w.player.h).toBeCloseTo(560, 0)
  })
})

describe('a removable cloud that returns', () => {
  const cloud = (extra: object) => level([floor, { x: 300, y: 640, w: 120, h: 60, cloud: true, vanish: true, ...extra }], { x: 100, y: 700 })
  const melted = (w: World) => w.puffs[1]!.filter((t) => t !== Infinity && t >= (w.puffBack[1] ?? -Infinity)).length

  it('comes back after the player has been away for returnAfter seconds', () => {
    const w = createWorld(cloud({ returnAfter: 3 }))
    run(w, 3, { ...none, right: true })
    expect(melted(w)).toBeGreaterThan(0)
    run(w, 1.5, { ...none, right: true }) // out the far side, but not away long enough
    run(w, 4)
    expect(melted(w)).toBe(0)
    expect(w.puffBack[1]).toBeDefined()
  })

  it('never returns without returnAfter', () => {
    const w = createWorld(cloud({}))
    run(w, 3, { ...none, right: true })
    const n = melted(w)
    run(w, 20)
    expect(melted(w)).toBe(n)
  })

  it('a turned cloud melts where the player passes through it', () => {
    const w = createWorld(cloud({ angle: 90 }))
    run(w, 4, { ...none, right: true })
    expect(w.puffs[1]!.some((t) => t !== Infinity)).toBe(true)
  })
})
