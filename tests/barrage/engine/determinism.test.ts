import { describe, expect, it } from 'vitest'
import { createEngine, restoreEngine, type BarrageEngine } from '@/barrage/engine/engine'
import { defaultConfig, dailySeed, DAILY_CONFIG } from '@/barrage/engine/economy'
import { Rng } from '@/barrage/engine/rng'
import type { EngineEvent } from '@/barrage/engine/types'
import { MIN_AIM } from '@/barrage/engine/types'

const ANGLES = [1.2, 2.1, Math.PI / 2, 0.4, 2.7, 1.0, 1.9, 1.45, 2.4, 0.9, 1.7, 2.2, 1.1, 0.6, 2.9, 1.3]

const play = (e: BarrageEngine, angles: number[]): EngineEvent[] => {
  const ev: EngineEvent[] = []
  e.on(x => ev.push(x))
  for (const a of angles) {
    if (e.state.phase === 'breach') e.continueAfterBreach('meteor')
    e.fire(a)
    e.settle()
  }
  return ev
}

/** Board state without the pool-owned ball objects' pierce refs (and the
 *  wall-clock phaseTime, which differs by however long a human idles). */
const board = (e: BarrageEngine) =>
  JSON.stringify({ ...e.state, phaseTime: 0, balls: e.state.balls.map(b => ({ ...b, passing: null })) })

describe('determinism', () => {
  it('same seed + same angles ⇒ identical state and event stream', () => {
    const cfg = defaultConfig({ seed: 99, trayCapacity: 8, damageMult: 2 })
    const a = createEngine(cfg)
    const b = createEngine(cfg)
    a.addBalls(6)
    b.addBalls(6)
    const ea = play(a, ANGLES)
    const eb = play(b, ANGLES)
    expect(ea.length).toBeGreaterThan(100)
    expect(JSON.stringify(eb)).toBe(JSON.stringify(ea))
    expect(board(b)).toBe(board(a))
  })

  it('different seeds give different boards', () => {
    const a = createEngine(defaultConfig({ seed: 1 }))
    const b = createEngine(defaultConfig({ seed: 2 }))
    play(a, ANGLES.slice(0, 6))
    play(b, ANGLES.slice(0, 6))
    expect(board(b)).not.toBe(board(a))
  })

  it('daily mode replays identically from the angles alone, however long each aim took', () => {
    const cfg = defaultConfig({ mode: 'daily', seed: dailySeed('2026-09-23'), ...DAILY_CONFIG })
    const a = createEngine(cfg)
    const b = createEngine(cfg)
    const ea = play(a, ANGLES)
    const eb: EngineEvent[] = []
    b.on(x => eb.push(x))
    const jitter = new Rng(5)
    for (const angle of ANGLES) {
      if (b.state.phase === 'breach') b.continueAfterBreach('meteor')
      // A human dawdles in aim for a random while, and frames arrive unevenly.
      for (let i = 0, n = jitter.int(200); i < n; i++) b.update(0.001 + jitter.next() * 0.05)
      b.fire(angle)
      let guard = 0
      while (b.state.phase !== 'aim' && b.state.phase !== 'breach' && guard++ < 100000) b.update(0.001 + jitter.next() * 0.05)
    }
    const strip = (xs: EngineEvent[]) => JSON.stringify(xs)
    expect(strip(eb)).toBe(strip(ea))
    expect(board(b)).toBe(board(a))
  })

  it('snapshot → restore continues exactly like the original', () => {
    const cfg = defaultConfig({ seed: 314, trayCapacity: 6, damageMult: 1.5 })
    const a = createEngine(cfg)
    a.addBalls(4)
    play(a, ANGLES.slice(0, 7))
    if (a.state.phase === 'breach') a.continueAfterBreach('meteor')
    const snap = a.snapshot()
    expect(snap).not.toBeNull()
    const b = restoreEngine(JSON.parse(JSON.stringify(snap)))
    expect(b.snapshot()).toEqual(snap)
    const rest = ANGLES.slice(7)
    const ea = play(a, rest)
    const eb = play(b, rest)
    expect(JSON.stringify(eb)).toBe(JSON.stringify(ea))
    expect(board(b)).toBe(board(a))
  })

  it('snapshot is only available while aiming', () => {
    const e = createEngine(defaultConfig({ seed: 3 }))
    expect(e.snapshot()).not.toBeNull()
    e.fire(Math.PI / 2)
    expect(e.state.phase).toBe('volley')
    expect(e.snapshot()).toBeNull()
  })

  it('a throwing listener never breaks the sim', () => {
    const cfg = defaultConfig({ seed: 11 })
    const a = createEngine(cfg)
    const b = createEngine(cfg)
    const err = console.error
    console.error = () => {}
    try {
      a.on(() => { throw new Error('boom') })
      play(a, ANGLES.slice(0, 5))
    } finally {
      console.error = err
    }
    play(b, ANGLES.slice(0, 5))
    expect(board(a)).toBe(board(b))
  })

  it('clamps the aim and rejects NaN / firing outside aim', () => {
    const e = createEngine(defaultConfig({ seed: 4 }))
    expect(e.fire(Number.NaN)).toBe(false)
    const ev: EngineEvent[] = []
    e.on(x => ev.push(x))
    expect(e.fire(-1)).toBe(true)
    const fire = ev.find(x => x.type === 'fire')
    expect(fire && fire.type === 'fire' && fire.angle).toBeCloseTo(MIN_AIM)
    expect(e.fire(1)).toBe(false)
  })
})
