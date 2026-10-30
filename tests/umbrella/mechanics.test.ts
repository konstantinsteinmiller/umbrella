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

describe('Walldorf touch modes', () => {
  const wall = (extra: object) => base({ hazards: [{ kind: 'pillar', x: 230, y: 200, w: 40, h: 200, ...extra }] })
  it('deadly by default, solid with the old harmless flag', () => {
    const dead = createWorld(wall({}))
    run(dead, 0.4, { left: false, right: true, toggle: false })
    expect(dead.phase).toBe('splat')
    const solid = createWorld(wall({ harmless: true }))
    run(solid, 0.4, { left: false, right: true, toggle: false })
    expect(solid.phase).toBe('play')
    expect(solid.player.x + solid.player.w).toBeLessThanOrEqual(230.01)
  })
  it('a bouncy one throws Pweeg back, harder when it charges', () => {
    const w = createWorld(wall({ contact: 'bounce', bounce: 600 }))
    const events: string[] = []
    for (let i = 0; i < 60 && !events.includes('bump'); i++) events.push(...step(w, { left: false, right: true, toggle: false }, DT, T))
    expect(events).toContain('bump')
    expect(w.phase).toBe('play')
    expect(w.player.vx).toBeLessThan(-500)
    // A charge toward Pweeg adds its own speed.
    const c = createWorld(base({ hazards: [{ kind: 'pillar', x: 0, y: 0, w: 40, h: 200, contact: 'bounce', bounce: 600,
      motion: { kind: 'line', a: { x: 400, y: 300 }, b: { x: 150, y: 300 }, period: 1 } }] }))
    const got: string[] = []
    for (let i = 0; i < 240 && !got.some((e) => e.endsWith('bump')); i++) got.push(...step(c, idle, DT, T))
    expect(got).toContain('charge-bump')
    expect(c.player.vx).toBeLessThan(-600)
  })
})

describe('Walldorf follows the player', () => {
  const lvl = (motion: object) => base({ hazards: [{ kind: 'pillar', x: 900, y: 100, w: 40, h: 120, contact: 'solid', motion } as never] })
  it('moves toward Pweeg at its speed', () => {
    const w = createWorld(lvl({ kind: 'follow', speed: 100 }))
    w.moved = true // past the first move: a follower waits for it
    const x0 = w.hazards[0]!.x
    run(w, 1)
    expect(x0 - w.hazards[0]!.x).toBeGreaterThan(60)
    expect(x0 - w.hazards[0]!.x).toBeLessThan(110)
  })
  it('keeps to one axis when locked', () => {
    const w = createWorld(lvl({ kind: 'follow', speed: 100, axis: 'y' }))
    w.moved = true // past the first move: a follower waits for it
    run(w, 1)
    expect(w.hazards[0]!.x).toBe(900)
    expect(w.hazards[0]!.y).toBeGreaterThan(100)
  })
  it('on a path, slides to the point nearest Pweeg (it blocks his way)', () => {
    const w = createWorld(lvl({ kind: 'follow', speed: 1000, a: { x: 600, y: 100 }, b: { x: 600, y: 700 } }))
    w.moved = true // past the first move: a follower waits for it
    run(w, 2)
    const h = w.hazards[0]!
    expect(h.x + h.w / 2).toBeCloseTo(600, 0)
    expect(Math.abs(h.y + h.h / 2 - (w.player.y + w.player.h / 2))).toBeLessThan(2)
  })
})

describe('falling too long', () => {
  const tall = () => base({ world: { w: 1280, h: 60000 }, spawn: { x: 600, y: 100 }, platforms: [] })
  it('a long closed free fall ends out of bounds after maxFallTime', () => {
    const w = createWorld(tall())
    const tt = { ...T, maxFallTime: 1 }
    const events: string[] = []
    for (let i = 0; i < 2 / DT && w.phase === 'play'; i++) events.push(...step(w, idle, DT, tt))
    expect(w.phase).toBe('out')
    expect(events).toContain('out')
    expect(w.time).toBeGreaterThanOrEqual(1)
    expect(w.time).toBeLessThan(1.1)
  })
  it('floating with the umbrella open never counts, and 0 turns it off', () => {
    const w = createWorld(tall())
    w.player.open = true
    for (let i = 0; i < 3 / DT; i++) step(w, idle, DT, { ...T, maxFallTime: 1 })
    expect(w.phase).toBe('play')
    const off = createWorld(tall())
    for (let i = 0; i < 3 / DT; i++) step(off, idle, DT, { ...T, maxFallTime: 0 })
    expect(off.phase).toBe('play')
  })
})
