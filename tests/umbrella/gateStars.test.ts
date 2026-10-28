import { describe, expect, it } from 'vitest'
import { createWorld, gateExit, step } from '@/umbrella/engine'
import { type LevelDef } from '@/umbrella/levels'
import { DEFAULT_TUNING } from '@/umbrella/tuning'
import { parseLevel } from '@/umbrella/customLevels'
import { startWarp, warpFlash, warpPosition, warpProgress, warpTime } from '@/umbrella/warp'

const none = { left: false, right: false, toggle: false }
const size = { w: DEFAULT_TUNING.playerWidth, h: DEFAULT_TUNING.playerHeight }
const base: LevelDef = { id: 1, world: { w: 1280, h: 720 }, spawn: { x: 300, y: 500 }, winds: [], hazards: [], platforms: [{ x: 100, y: 500, w: 500, h: 20 }] }
const gate = { x: 270, y: 420, w: 60, h: 80, to: 7 }
const run = (w: ReturnType<typeof createWorld>, ticks: number, toggleAt = -1) => {
  const heard: string[] = []
  for (let i = 0; i < ticks; i++) heard.push(...step(w, { ...none, toggle: i === toggleAt }, 1 / 60, DEFAULT_TUNING))
  return heard
}

describe('stars', () => {
  it('are collected once on touch and kept across a checkpoint revive', () => {
    const level = { ...base, stars: [{ x: 300, y: 480 }, { x: 560, y: 300 }] }
    const w = createWorld(level, size)
    const heard = run(w, 30)
    expect(heard.filter((e) => e === 'star')).toHaveLength(1)
    expect(w.starsGot).toEqual([true, false])
    const again = createWorld(level, size, -1, { starsGot: w.starsGot })
    expect(again.starsGot).toEqual([true, false])
  })
})

describe('gates', () => {
  it('only a player who opens the umbrella inside one is taken through', () => {
    const level = { ...base, gates: [gate] }
    const walking = createWorld(level, size)
    expect(run(walking, 90)).not.toContain('gate')
    const opening = createWorld(level, size)
    run(opening, 10)
    const heard = run(opening, 5, 0)
    expect(heard).toContain('gate')
    expect(opening.gate).toBe(0)
  })
  it('does not fire again for an umbrella that stays open, nor on coming back out of the gate', () => {
    const level = { ...base, gates: [gate] }
    const w = createWorld(level, size)
    run(w, 10)
    run(w, 5, 0)
    w.gate = -1
    expect(run(w, 60)).not.toContain('gate')
    const back = createWorld(level, size, -1, { at: gateExit(gate) })
    expect(run(back, 90)).not.toContain('gate')
    expect(run(back, 5, 0)).toContain('gate')
  })
  it('survive the share-link / library round trip, and bad ones are refused', () => {
    const level = { ...base, gates: [gate], stars: [{ x: 10, y: 20 }] }
    const out = parseLevel(JSON.parse(JSON.stringify(level)))!
    expect(out.gates?.[0]?.to).toBe(7)
    expect(out.stars).toEqual([{ x: 10, y: 20 }])
    expect(parseLevel({ ...level, gates: [{ x: 1, y: 2, w: 3, h: 4 }] })).toBeNull()
  })
})

describe('the hyper current', () => {
  it('lifts Pweeg up the column and ends in a whiteout', () => {
    const w = startWarp('in', { ...gate }, { x: 300, y: 500 })
    const y0 = warpPosition(w).y
    w.t = warpTime('in') * 0.6
    expect(warpPosition(w).y).toBeLessThan(y0)
    expect(warpFlash(w)).toBe(0)
    w.t = warpTime('in')
    expect(warpProgress(w)).toBe(1)
    expect(warpFlash(w)).toBe(1)
    expect(warpPosition(w).y).toBeLessThan(500 - 600)
  })
})
