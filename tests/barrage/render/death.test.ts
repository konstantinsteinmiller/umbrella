// Playtest run 7 — the lose rule, taught by the loss itself: on a real breach
// the monsters past the line bump the unit, the unit tears apart and its
// pieces lie on the floor while "WASTED" holds (DeathOverlay), then the death
// screen. It retired the first-danger overrun demo.
//   • render/death.ts: the lunge curve and the pieces' flight (pure);
//   • BoardRenderer: the striker (the breacher nearest the unit) lunges into
//     it, the others surge, the strike tears the unit (one shake, one sound),
//     a continue stands it up again — display only; reduced motion: no lunge,
//     no flight, the pieces lie on the floor from the strike.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { pickStriker } from '@/barrage/render/death'
import { BoardRenderer } from '@/barrage/render/BoardRenderer'
import {
  DEATH_BACK, DEATH_BACK_CELLS, DEATH_HIT, DEATH_LOOM, DEATH_RECOIL, DEATH_SCENE_MS, DEATH_WIND, SHARD_N,
  deathLunge, stepShards, strikeOffset, tearUnit, type Shard
} from '@/barrage/render/death'
import type { BarrageEngine } from '@/barrage/engine/engine'
import { COLS, FLOOR_Y, ROWS, type BoardState, type Monster } from '@/barrage/engine/types'
import { board, mon } from '../engine/helpers'

beforeAll(() => {
  const noop: unknown = new Proxy(function () {}, {
    get: () => noop,
    apply: () => noop,
    set: () => true
  })
  HTMLCanvasElement.prototype.getContext = (() => noop) as unknown as HTMLCanvasElement['getContext']
})

const DT = 1 / 60

/** A seeded [0, 1) source, so the pieces fly the same way every run. */
const lcg = (seed = 7) => {
  let s = seed >>> 0
  return (): number => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('the lunge curve', () => {
  it('winds back, strikes at DEATH_HIT, recoils to loom over the wreck', () => {
    expect(deathLunge(0)).toBe(0)
    expect(deathLunge(-1)).toBe(0)
    expect(deathLunge(DEATH_WIND * 0.99)).toBeLessThan(0)
    expect(deathLunge(DEATH_WIND * 0.99)).toBeGreaterThanOrEqual(-DEATH_BACK - 1e-9)
    expect(deathLunge(DEATH_HIT - 1e-6)).toBeCloseTo(1, 3)
    expect(deathLunge(DEATH_HIT + DEATH_RECOIL + 0.01)).toBe(DEATH_LOOM)
    expect(deathLunge(5)).toBe(DEATH_LOOM)
    // It accelerates into the unit: the last third of the lunge covers more ground than the first.
    const lunge = (u: number) => deathLunge(DEATH_WIND + (DEATH_HIT - DEATH_WIND) * u)
    expect(lunge(1) - lunge(2 / 3)).toBeGreaterThan(lunge(1 / 3) - lunge(0))
  })
})

describe('the striker', () => {
  it('rears back a fixed distance, then lunges the whole way — straight up and down when it stands on the unit', () => {
    const p = { x: 0, y: 0 }
    strikeOffset(DEATH_WIND, 3, 4, p)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(DEATH_BACK_CELLS, 5)
    expect(p.x).toBeLessThan(0)
    expect(p.y).toBeLessThan(0)
    strikeOffset(DEATH_HIT - 1e-6, 3, 4, p)
    expect(p.x).toBeCloseTo(3, 3)
    expect(p.y).toBeCloseTo(4, 3)
    strikeOffset(DEATH_WIND, 0, 0.2, p)
    expect(p.x).toBe(0)
    expect(p.y).toBeCloseTo(-DEATH_BACK_CELLS, 5)
    strikeOffset(3, 3, 4, p)
    expect(p.x).toBeCloseTo(3 * DEATH_LOOM, 9)
  })
})

describe('the torn unit\'s pieces', () => {
  const tear = (reduced: boolean): Shard[] => {
    const out: Shard[] = []
    tearUnit(out, 3.5, FLOOR_Y + 0.06, 0.9, 0.98, FLOOR_Y - 0.02, 0.6, reduced, COLS, lcg())
    return out
  }

  it('SHARD_N² pieces, flung out from the middle and up, the top ones higher', () => {
    const p = tear(false)
    expect(p).toHaveLength(SHARD_N * SHARD_N)
    for (const s of p) {
      expect(s.rest).toBe(false)
      expect(s.vy).toBeLessThan(0)
    }
    const left = p.filter((s) => s.i === 0)
    const right = p.filter((s) => s.i === SHARD_N - 1)
    const avg = (a: Shard[], f: (s: Shard) => number) => a.reduce((n, s) => n + f(s), 0) / a.length
    expect(avg(left, (s) => s.vx)).toBeLessThan(avg(right, (s) => s.vx))
    expect(avg(p.filter((s) => s.j === 0), (s) => s.vy)).toBeLessThan(avg(p.filter((s) => s.j === SHARD_N - 1), (s) => s.vy))
    // They start where the unit stood: its box, feet on the floor.
    for (const s of p) {
      expect(Math.abs(s.x - 3.5)).toBeLessThan(0.5)
      expect(s.y).toBeLessThan(FLOOR_Y + 0.06)
      expect(s.y).toBeGreaterThan(FLOOR_Y + 0.06 - 0.98)
    }
  })

  it('fly, bounce and come to rest on the floor inside the walls within ~1.5 s', () => {
    const p = tear(false)
    let t = 0
    while (t < 1.5) {
      stepShards(p, DT, COLS)
      t += DT
    }
    for (const s of p) {
      expect(s.rest).toBe(true)
      expect(s.y).toBe(s.floor)
      expect(s.floor).toBeLessThanOrEqual(FLOOR_Y - 0.02)
      expect(s.floor).toBeGreaterThan(FLOOR_Y - 0.2)
      expect(s.x).toBeGreaterThan(0)
      expect(s.x).toBeLessThan(COLS)
    }
    // Scattered, not stacked in one spot.
    const xs = p.map((s) => s.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1)
  })

  it('reduced motion: a heap on the floor from the start — nothing flies', () => {
    const p = tear(true)
    expect(p).toHaveLength(SHARD_N * SHARD_N)
    for (const s of p) {
      expect(s.rest).toBe(true)
      expect(s.y).toBe(s.floor)
      expect(Math.abs(s.x - 3.5)).toBeLessThan(1.1)
    }
    const before = JSON.stringify(p)
    stepShards(p, 0.5, COLS)
    expect(JSON.stringify(p)).toBe(before)
  })

  it('reuses the pool it is handed', () => {
    const out: Shard[] = []
    tearUnit(out, 1, FLOOR_Y, 1, 1, FLOOR_Y, 0, false, COLS, lcg())
    const first = out[0]
    tearUnit(out, 5, FLOOR_Y, 1, 1, FLOOR_Y, 0, false, COLS, lcg(3))
    expect(out).toHaveLength(SHARD_N * SHARD_N)
    expect(out[0]).toBe(first)
  })
})

describe('the death sequence on the board', () => {
  interface ViewProbe { id: number; lungeX: number; lungeY: number; flash: number }
  interface Internals {
    time: number
    update(dt: number, s: BoardState): void
    stepDeath(dt: number): void
    viewList: ViewProbe[]
    lineFlash: number
    death: { t: number; ux: number; striker: number; dx: number; dy: number }
    shards: Shard[]
  }

  const rig = (monsters: Monster[], reduced = false, launcherX = 3.5) => {
    const e: BarrageEngine = board({ monsters, tray: [1], launcherX })
    const shakes: string[] = []
    const r = new BoardRenderer({ shake: (i) => { shakes.push(i) }, coins: () => true, confetti: () => {} })
    r.reducedMotion = reduced
    const sounds = vi.spyOn(r.sounds, 'request')
    r.resize(390, 700, 1)
    r.setEngine(e)
    e.on((ev) => r.onEvent(ev))
    const x = r as unknown as Internals
    /** The board's frame loop, the sim held (the engine waits in 'breach'). */
    const tick = (dt = DT): void => {
      x.time += dt
      x.stepDeath(dt)
      x.update(dt, e.state)
    }
    tick()
    const view = (id: number): ViewProbe => x.viewList.find((v) => v.id === id)!
    const soundCount = (id: string): number => sounds.mock.calls.filter((c) => c[0] === id).length
    const breach = (): void => {
      e.state.phase = 'breach'
      r.onEvent({ type: 'breach' })
    }
    return { e, r, x, shakes, tick, view, soundCount, breach }
  }

  it('the breacher nearest the unit lunges into it; the strike tears the unit apart — one shake, one sound; the pieces come to rest', () => {
    // Two past the line (the slime right over the unit strikes), one still above it.
    const striker = mon('slime', 3, ROWS, 50)
    const other = mon('ogre', 6, ROWS, 50)
    const safe = mon('slime', 0, 4, 50)
    const g = rig([other, striker, safe])
    g.breach()
    expect(g.r.deathPlaying).toBe(true)
    expect(g.r.unitTorn).toBe(false)
    expect(g.x.death.striker).toBe(striker.id)
    // The rule, as it is broken: the line flashes.
    expect(g.x.lineFlash).toBeGreaterThan(0.9)
    let t = 0
    let peakY = 0
    let rearY = 0
    let tornAt = -1
    let otherPeak = 0
    while (t < DEATH_SCENE_MS / 1000) {
      g.tick()
      t += DT
      peakY = Math.max(peakY, g.view(striker.id).lungeY)
      rearY = Math.min(rearY, g.view(striker.id).lungeY)
      otherPeak = Math.max(otherPeak, g.view(other.id).lungeY)
      if (tornAt < 0 && g.r.unitTorn) tornAt = t
      expect(g.view(safe.id).lungeY).toBe(0)
    }
    // Standing on the unit already, it rears up and slams down onto it…
    expect(rearY).toBeCloseTo(-DEATH_BACK_CELLS, 1)
    expect(peakY).toBeCloseTo(g.x.death.dy, 1)
    expect(peakY - rearY).toBeGreaterThan(0.55)
    expect(peakY + striker.row + striker.h).toBeLessThan(FLOOR_Y + 0.1)
    // …and looms over the wreck afterwards; the other one surged a step.
    expect(g.view(striker.id).lungeY).toBeCloseTo(g.x.death.dy * DEATH_LOOM, 5)
    expect(otherPeak).toBeGreaterThan(0.2)
    expect(otherPeak).toBeLessThan(0.5)
    expect(tornAt).toBeGreaterThanOrEqual(DEATH_HIT - 1e-9)
    expect(tornAt).toBeLessThan(DEATH_HIT + 2 * DT)
    expect(g.shakes).toEqual(['big'])
    expect(g.soundCount('fighter-death')).toBe(1)
    expect(g.soundCount('overrun')).toBe(1)
    expect(g.x.shards).toHaveLength(SHARD_N * SHARD_N)
    for (const s of g.x.shards) expect(s.rest).toBe(true)
    // Display only: the monsters stand where they stood.
    expect(g.e.state.monsters.map((m) => m.row)).toEqual([ROWS, ROWS, 4])
  })

  it('a continue stands the unit up again and the monsters back in place', () => {
    const striker = mon('slime', 2, ROWS, 50)
    const g = rig([striker])
    g.breach()
    for (let i = 0; i < 90; i++) g.tick()
    expect(g.r.unitTorn).toBe(true)
    g.r.onEvent({ type: 'continued', how: 'revive' })
    expect(g.r.deathPlaying).toBe(false)
    expect(g.r.unitTorn).toBe(false)
    expect(g.view(striker.id).lungeX).toBe(0)
    expect(g.view(striker.id).lungeY).toBe(0)
  })

  it('a new board (a restart) ends it', () => {
    const g = rig([mon('slime', 4, ROWS, 50)])
    g.breach()
    for (let i = 0; i < 30; i++) g.tick()
    g.r.setEngine(board({ monsters: [mon('slime', 1, 1, 5)], tray: [1] }))
    expect(g.r.deathPlaying).toBe(false)
    expect(g.r.unitTorn).toBe(false)
  })

  it('the striker comes at the unit from its own side, never through it', () => {
    const g = rig([mon('ogre', 6, ROWS, 50)], false, 1.5)
    g.breach()
    const d = g.x.death
    // Centre at 6.5, unit at 1.5: it closes most of the gap, stopping just off the unit's centre.
    expect(d.dx).toBeLessThan(-4)
    expect(6.5 + d.dx).toBeGreaterThan(1.5)
  })

  it('reduced motion: no lunge and no shake — the striker flashes, the pieces lie on the floor from the strike', () => {
    const striker = mon('slime', 3, ROWS, 50)
    const g = rig([striker], true)
    g.breach()
    let t = 0
    while (!g.r.unitTorn && t < 1) {
      g.tick()
      t += DT
      expect(g.view(striker.id).lungeX).toBe(0)
      expect(g.view(striker.id).lungeY).toBe(0)
    }
    expect(t).toBeCloseTo(DEATH_HIT, 1)
    expect(g.view(striker.id).flash).toBeGreaterThan(0.5)
    for (const s of g.x.shards) expect(s.rest).toBe(true)
    for (let i = 0; i < 30; i++) g.tick()
    expect(g.view(striker.id).lungeY).toBe(0)
    expect(g.shakes).toEqual([])
  })
})

// Playtest run 9: the loss screen names the monster the player saw strike —
// one rule for both.
describe('pickStriker', () => {
  const m = (col: number, row: number, w = 1, h = 1) => ({ col, row, w, h })
  it('of the monsters past the line, the one nearest the unit; none past it: null', () => {
    expect(pickStriker([m(0, 5), m(3, 8)], 3.5)).toBeNull()
    const near = m(3, 9.5)
    const far = m(0, 9.5)
    expect(pickStriker([far, near], 3.5)).toBe(near)
    // A big boss past the line counts by its centre.
    const boss = m(1, 8, 3, 3)
    expect(pickStriker([far, boss], 2.4)).toBe(boss)
  })
})
