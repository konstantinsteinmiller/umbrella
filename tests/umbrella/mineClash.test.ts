import { describe, expect, it } from 'vitest'
import { createWorld, step, type Input } from '@/umbrella/engine'
import { DEFAULT_TUNING } from '@/umbrella/tuning'
import { LEVELS, type HazardDef, type LevelDef } from '@/umbrella/levels'

const IDLE: Input = { left: false, right: false, toggle: false }
const DT = 1 / 120
const base = (hazards: HazardDef[]): LevelDef => ({
  id: 0,
  world: { w: 1280, h: 720 },
  spawn: { x: 100, y: 120 },
  platforms: [{ x: 40, y: 140, w: 200, h: 20 }, { x: 1000, y: 650, w: 200, h: 20, finish: true }],
  winds: [],
  hazards
})
const mine = (cx: number, cy: number, motion?: HazardDef['motion']): HazardDef => ({ kind: 'mine', x: cx - 26, y: cy - 26, w: 52, h: 52, motion })
const run = (w: ReturnType<typeof createWorld>, seconds: number) => {
  const events: string[] = []
  for (let i = 0; i < seconds / DT; i++) events.push(...step(w, IDLE, DT, DEFAULT_TUNING))
  return events
}

describe('mines against mines', () => {
  it('a moving mine that runs into a hidden one sets both off, and they stop being deadly', () => {
    const w = createWorld(base([
      mine(600, 400),
      mine(300, 400, { kind: 'line', a: { x: 300, y: 400 }, b: { x: 900, y: 400 }, period: 4 })
    ]))
    const events = run(w, 3)
    expect(events).toContain('mine-clash')
    expect(w.hazards.every((h) => h.blownAt !== undefined)).toBe(true)
  })
  it('two still mines never touch each other', () => {
    const w = createWorld(base([mine(600, 400), mine(620, 400)]))
    expect(run(w, 1)).not.toContain('mine-clash')
  })
  it('a blown mine no longer kills', () => {
    const w = createWorld(base([mine(100, 80), mine(100, 80, { kind: 'line', a: { x: 100, y: 80 }, b: { x: 140, y: 80 }, period: 2 })]))
    run(w, 0.05)
    expect(w.hazards.every((h) => h.blownAt !== undefined)).toBe(true)
    expect(w.phase).toBe('play')
  })
})

describe('Walldorfs push mines off', () => {
  const wall: HazardDef = { kind: 'pillar', x: 500, y: 300, w: 40, h: 200, contact: 'bounce' }
  it('a mine driving into a Walldorf does not pass through it and is thrown back', () => {
    const w = createWorld(base([wall, mine(300, 400, { kind: 'line', a: { x: 300, y: 400 }, b: { x: 800, y: 400 }, period: 4 })]))
    let maxRight = -Infinity
    for (let i = 0; i < 4 / DT; i++) { step(w, IDLE, DT, DEFAULT_TUNING); const m = w.hazards[1]!; maxRight = Math.max(maxRight, m.x + m.w) }
    expect(maxRight).toBeLessThanOrEqual(500 + 1)
  })
  it('a still mine that a Walldorf sweeps into is shoved along', () => {
    const sweeper: HazardDef = { kind: 'pillar', x: 200, y: 360, w: 40, h: 80, contact: 'solid', motion: { kind: 'line', a: { x: 200, y: 400 }, b: { x: 600, y: 400 }, period: 3 } }
    const w = createWorld(base([sweeper, mine(400, 400)]))
    run(w, 1.4)
    expect(w.hazards[1]!.x + 26).toBeGreaterThan(400 + 5)
  })
  it('a Walldorf can shove a mine into another mine', () => {
    const sweeper: HazardDef = { kind: 'pillar', x: 200, y: 360, w: 40, h: 80, contact: 'solid', motion: { kind: 'line', a: { x: 200, y: 400 }, b: { x: 700, y: 400 }, period: 3 } }
    const w = createWorld(base([sweeper, mine(400, 400), mine(520, 400)]))
    expect(run(w, 2.5)).toContain('mine-clash')
  })
})

describe('the campaign', () => {
  it('no level\'s own mines blow up each other (or get shoved) with nobody playing', () => {
    const hits: string[] = []
    for (const lv of LEVELS) {
      const w = createWorld(lv)
      const mines = w.hazards.filter((h) => h.kind === 'mine')
      if (!mines.length) continue
      const ev = run(w, 20)
      if (ev.includes('mine-clash')) hits.push(`clash: ${lv.name ?? lv.id}`)
      if (mines.some((h) => (h.kx ?? 0) || (h.ky ?? 0))) hits.push(`shoved: ${lv.name ?? lv.id}`)
    }
    expect(hits).toEqual([])
  })
})
