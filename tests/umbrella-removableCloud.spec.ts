import { describe, expect, it } from 'vitest'
import { createWorld, platformActive, step, type World } from '@/umbrella/engine'
import { LEVELS, type LevelDef } from '@/umbrella/levels'
import { puffLayout } from '@/umbrella/puffs'
import { DEFAULT_TUNING as T } from '@/umbrella/tuning'

const DT = 1 / 120
const base = LEVELS[0]!
const none = { left: false, right: false, toggle: false }
const level = (extra: Partial<LevelDef> = {}): LevelDef => ({
  ...base,
  platforms: [
    { x: 40, y: 600, w: 700, h: 20 },
    { x: 300, y: 540, w: 120, h: 60, cloud: true, vanish: true }
  ],
  winds: [], hazards: [], stars: [], buttons: [], checkpoints: [], gates: [],
  spawn: { x: 100, y: 600 },
  ...extra
})
const run = (w: World, s: number, input = none) => { for (let i = 0; i < s / DT; i++) step(w, input, DT, T) }
const gone = (w: World) => w.puffs[1]!.filter((t) => t !== Infinity).length

describe('a removable cloud', () => {
  it('blocks nothing: the player walks straight through it and stays on the ground', () => {
    const w = createWorld(level())
    expect(platformActive(w, w.platforms[1]!)).toBe(false)
    run(w, 2.5, { ...none, right: true })
    expect(w.player.x).toBeGreaterThan(420)
    expect(w.player.grounded).toBe(true)
    expect(w.phase).toBe('play')
  })

  it('wipes away only the puffs that were touched, for good', () => {
    const w = createWorld(level())
    const total = puffLayout(120, 60).length
    expect(total).toBeGreaterThan(6)
    expect(gone(w)).toBe(0)
    run(w, 3, { ...none, right: true })
    const wiped = gone(w)
    expect(wiped).toBeGreaterThan(0)
    expect(wiped).toBeLessThan(total) // the cloud above his head is still there (canopy shut on the ground)
    const clocks = [...w.puffs[1]!]
    run(w, 1, { ...none, left: true })
    expect(w.puffs[1]!.filter((t, k) => t !== clocks[k])).toEqual([]) // nothing comes back, nothing changes
  })

  it('keeps wiped puffs wiped in a world built after it (a restart of the same level)', () => {
    const w = createWorld(level())
    run(w, 3, { ...none, right: true })
    const next = createWorld(level(), undefined, -1, { puffs: w.puffs })
    expect(gone(next)).toBe(gone(w))
    expect(next.puffs[1]!.every((t) => t === Infinity || t === -Infinity)).toBe(true)
  })

  it('a plain cloud still blocks', () => {
    const w = createWorld(level({ platforms: [{ x: 40, y: 600, w: 700, h: 20 }, { x: 300, y: 540, w: 120, h: 60, cloud: true }] }))
    expect(platformActive(w, w.platforms[1]!)).toBe(true)
  })
})

describe('the level medallion', () => {
  it('is collected by touching it, once', () => {
    const w = createWorld(level({ medallion: { x: 200, y: 570, color: 'purple' } }))
    expect(w.medallionGot).toBe(false)
    const events: string[] = []
    for (let i = 0; i < 3 / DT; i++) events.push(...step(w, { ...none, right: true }, DT, T))
    expect(w.medallionGot).toBe(true)
    expect(events.filter((e) => e === 'medallion')).toHaveLength(1)
  })

  it('stays collected through a revive', () => {
    const w = createWorld(level({ medallion: { x: 200, y: 570, color: 'red' } }))
    run(w, 3, { ...none, right: true })
    expect(createWorld(w.level, undefined, -1, { medallionGot: w.medallionGot }).medallionGot).toBe(true)
  })
})
