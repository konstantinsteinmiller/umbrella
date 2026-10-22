import { describe, expect, it } from 'vitest'
import { channelOn, createWorld, liveWinds, platformActive, step, umbrellaBox, windInfluence, type Input } from '@/umbrella/engine'
import type { LevelDef } from '@/umbrella/levels'
import { DEFAULT_TUNING } from '@/umbrella/tuning'

const T = DEFAULT_TUNING
const DT = 1 / 120
const idle: Input = { left: false, right: false, toggle: false }
const base = (extra: Partial<LevelDef> = {}): LevelDef => ({
  id: 0, world: { w: 1280, h: 720 }, spawn: { x: 200, y: 400 },
  platforms: [{ x: 100, y: 400, w: 300, h: 20 }], winds: [], ...extra
})
const run = (w: ReturnType<typeof createWorld>, s: number, input = idle) => {
  for (let i = 0; i < s / DT; i++) step(w, input, DT, T)
}

describe('the open umbrella catches the wind', () => {
  it('counts a current that only the canopy is in', () => {
    const w = createWorld(base())
    const pl = w.player
    pl.open = true
    // A current whose bottom edge sits just above the head: the body is out, the canopy in.
    const wind = { x: 0, y: 0, w: 1280, h: pl.y - 20, dir: 'up' as const, speed: 200 }
    expect(windInfluence({ ...pl, open: false }, wind, T.windEdge)).toBe(0)
    expect(windInfluence(pl, wind, T.windEdge)).toBeGreaterThan(0)
  })
  it('uses the whole canopy box, edge included, and only while open', () => {
    const w = createWorld(base())
    const pl = w.player
    const box = umbrellaBox(pl)
    // A current ending 2 px into the canopy's left edge: between the old sample points.
    const wind = { x: 0, y: 0, w: box.x + 2, h: 720, dir: 'right' as const, speed: 200 }
    expect(windInfluence(pl, wind, 1)).toBe(0)
    pl.open = true
    expect(windInfluence(pl, wind, 1)).toBeGreaterThan(0)
  })
  it('counts a side current the canopy tip reaches', () => {
    const w = createWorld(base())
    const pl = w.player
    pl.open = true
    const wind = { x: pl.x + pl.w / 2 + 20, y: 0, w: 300, h: 720, dir: 'right' as const, speed: 200 }
    expect(windInfluence(pl, wind, 1)).toBeGreaterThan(0)
  })
})

describe('buttons', () => {
  const level = () => base({
    buttons: [{ x: 180, y: 384, w: 40, h: 16, channel: 1 }],
    platforms: [{ x: 100, y: 400, w: 300, h: 20 }, { x: 600, y: 400, w: 100, h: 20, channel: 1 }],
    winds: [{ x: 800, y: 0, w: 200, h: 720, dir: 'up', speed: 200, channel: 1, switched: { dir: 'left', speed: 0 } }]
  })
  it('a toggle button switches its platform on and its current off; a second press flips back', () => {
    const w = createWorld(level())
    expect(platformActive(w, w.level.platforms[1]!)).toBe(false)
    expect(liveWinds(w)).toHaveLength(1)
    run(w, 0.3) // land on the button
    expect(channelOn(w, 1)).toBe(true)
    expect(platformActive(w, w.level.platforms[1]!)).toBe(true)
    expect(liveWinds(w)).toHaveLength(0)
    run(w, 0.4, { left: false, right: true, toggle: false }) // walk off
    run(w, 0.4, { left: true, right: false, toggle: false }) // and back on
    expect(channelOn(w, 1)).toBe(false)
  })
  it('a timed button keeps its channel on for its duration', () => {
    const l = level()
    l.buttons![0]!.duration = 2
    const w = createWorld(l)
    run(w, 0.3)
    expect(channelOn(w, 1)).toBe(true)
    run(w, 2)
    expect(channelOn(w, 1)).toBe(false)
  })
  it('changes a current direction and strength', () => {
    const l = level()
    l.winds[0]!.switched = { dir: 'down', speed: 500 }
    const w = createWorld(l)
    run(w, 0.3)
    expect(liveWinds(w)[0]).toMatchObject({ dir: 'down', speed: 500 })
  })
})

describe('checkpoints', () => {
  it('touching one marks it; a world made for it starts there', () => {
    const l = base({ checkpoints: [{ x: 260, y: 400 }] })
    const w = createWorld(l)
    run(w, 1, { left: false, right: true, toggle: false })
    expect(w.checkpoint).toBe(0)
    const again = createWorld(l, undefined, 0)
    expect(again.player.x + again.player.w / 2).toBe(260)
    expect(again.checkpoint).toBe(0)
  })
})
