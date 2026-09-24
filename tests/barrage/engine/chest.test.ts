// The flying chest (CONTRACT §5) after the blind playtest: every first-timer
// tried to TAP it, so a tap opens it exactly like a ball hit; the first
// session's chest crosses slower; and it is born whole on the board instead
// of clipped at a wall.
import { describe, expect, it } from 'vitest'
import {
  CHEST_CROSS_TIME, CHEST_FTUE_SPEED, CHEST_HALF_W, CHEST_R, CHEST_TAP_MARGIN, createEngine, restoreEngine, type BarrageEngine
} from '@/barrage/engine/engine'
import { STEP } from '@/barrage/engine/physics'
import { defaultConfig } from '@/barrage/engine/economy'
import { COLS, type EngineConfig, type EngineEvent, type Phase } from '@/barrage/engine/types'
import { mon, ofType, record } from './helpers'

const UP = Math.PI / 2
const CHEST_AT = { x: 3.5, y: 4.5 }

/** An empty board (nothing but the chest can take a hit or draw on the RNG). */
const emptyBoard = (rng = 12345, config: Partial<EngineConfig> = {}): BarrageEngine =>
  restoreEngine({
    v: 1, config: defaultConfig({ seed: 7, ...config }), row: 5, nextBossRow: 10,
    monsters: [], pickups: [], hazards: [], tray: [1], launcherX: 3.5, shields: 0, revives: 0,
    warcryArmed: false, chestTimer: 1e6, turn: 0, rng, nextId: 100
  })

/** A chest parked straight above the launcher (vx 0: a ball fired UP meets it). */
const parkChest = (e: BarrageEngine): void => {
  e.state.chest = { x: CHEST_AT.x, y: CHEST_AT.y, vx: 0, r: CHEST_R }
}

/** Steps the fixed step until the phase is `phase` (or gives up). */
const until = (e: BarrageEngine, phase: Phase, maxSeconds = 30): void => {
  for (let i = 0; i < maxSeconds / STEP && e.state.phase !== phase; i++) e.update(STEP)
}

const chestHits = (ev: EngineEvent[]) => ofType(ev, 'chestHit')
const chestCoinEvents = (ev: EngineEvent[]) => ofType(ev, 'coins').filter(c => c.source === 'chest')

describe('tapChest', () => {
  it('a tap on the chest opens it: chestHit, its coins to the wallet, the chest gone', () => {
    const e = emptyBoard()
    parkChest(e)
    const ev = record(e)
    expect(e.tapChest(CHEST_AT.x + 0.1, CHEST_AT.y - 0.1)).toBe(true)
    expect(e.state.chest).toBeNull()
    const hit = chestHits(ev)
    expect(hit).toHaveLength(1)
    expect(hit[0]!.coins).toBeGreaterThan(0)
    expect(chestCoinEvents(ev).map(c => c.amount)).toEqual([hit[0]!.coins])
  })

  it(`hits within r + ${CHEST_TAP_MARGIN} cell of its centre, misses beyond — a miss changes nothing`, () => {
    const reach = CHEST_R + CHEST_TAP_MARGIN
    const near = emptyBoard()
    parkChest(near)
    expect(near.tapChest(CHEST_AT.x + reach * 0.98, CHEST_AT.y)).toBe(true)

    const far = emptyBoard()
    parkChest(far)
    const ev = record(far)
    expect(far.tapChest(CHEST_AT.x + reach * 1.02, CHEST_AT.y)).toBe(false)
    expect(far.tapChest(CHEST_AT.x, CHEST_AT.y + reach * 1.02)).toBe(false)
    expect(ev).toEqual([])
    expect(far.state.chest).not.toBeNull()
  })

  it('no chest, no open; garbage coordinates are a miss', () => {
    const e = emptyBoard()
    expect(e.tapChest(CHEST_AT.x, CHEST_AT.y)).toBe(false)
    parkChest(e)
    expect(e.tapChest(Number.NaN, CHEST_AT.y)).toBe(false)
    expect(e.state.chest).not.toBeNull()
  })

  it('opens in aim, volley, resolve and advance — never during a breach', () => {
    const phases: Phase[] = []
    for (const target of ['aim', 'volley', 'resolve', 'advance'] as const) {
      const e = emptyBoard()
      if (target !== 'aim') {
        e.fire(0.3) // flat: the ball never reaches the parked chest
        if (target !== 'volley') until(e, target)
      }
      parkChest(e)
      phases.push(e.state.phase)
      expect(e.tapChest(CHEST_AT.x, CHEST_AT.y)).toBe(true)
    }
    expect(phases).toEqual(['aim', 'volley', 'resolve', 'advance'])

    // One march from the line, no shields: the next advance breaches.
    const b = restoreEngine({
      v: 1, config: defaultConfig({ seed: 7 }), row: 5, nextBossRow: 10,
      monsters: [mon('slime', 0, 9, 1e9)], pickups: [], hazards: [], tray: [1], launcherX: 3.5, shields: 0,
      revives: 0, warcryArmed: false, chestTimer: 1e6, turn: 0, rng: 1, nextId: 100
    })
    b.fire(UP)
    b.recall()
    expect(b.settle()).toBe('breach')
    parkChest(b)
    expect(b.tapChest(CHEST_AT.x, CHEST_AT.y)).toBe(false)
    expect(b.state.chest).not.toBeNull()
  })

  it('pays exactly what a ball hit pays: the same coins and the same skill roll', () => {
    let skills = 0
    for (let rng = 1; rng <= 40; rng++) {
      const base = emptyBoard(rng * 7919)
      parkChest(base)
      const ball = base.clone()
      const tap = base.clone()
      const ballEv = record(ball)
      const tapEv = record(tap)
      ball.fire(UP)
      until(ball, 'aim')
      expect(tap.tapChest(CHEST_AT.x, CHEST_AT.y)).toBe(true)
      const a = chestHits(ballEv)
      const b = chestHits(tapEv)
      expect(a).toHaveLength(1)
      expect(b).toHaveLength(1)
      expect(b[0]!.coins).toBe(a[0]!.coins)
      expect(b[0]!.skill).toBe(a[0]!.skill)
      expect(chestCoinEvents(tapEv)).toEqual(chestCoinEvents(ballEv).map(c => ({ ...c })))
      if (b[0]!.skill) {
        skills++
        expect(ofType(tapEv, 'skill').map(s => s.skill)).toEqual([b[0]!.skill])
      }
    }
    // Both branches of the 40 % skill roll were compared.
    expect(skills).toBeGreaterThan(5)
    expect(skills).toBeLessThan(35)
  })

  it('a tap during FEVER pays double, like a ball in FEVER', () => {
    const calm = emptyBoard()
    parkChest(calm)
    const hot = calm.clone()
    hot.state.fever = true
    const c = record(calm)
    const h = record(hot)
    calm.tapChest(CHEST_AT.x, CHEST_AT.y)
    hot.tapChest(CHEST_AT.x, CHEST_AT.y)
    // (Doubled before rounding, as for a ball.)
    expect(Math.abs(chestHits(h)[0]!.coins - chestHits(c)[0]!.coins * 2)).toBeLessThanOrEqual(1)
  })
})

describe('determinism with chest taps', () => {
  /** A scripted session: the chest appears while aiming; `tap` is where the
   *  player touches then (null: never). Returns the whole event stream. */
  const play = (tap: { x: number; y: number } | 'chest' | null): string => {
    const e = createEngine(defaultConfig({ seed: 4242 }))
    const ev = record(e)
    e.state.chestTimer = 0.5
    e.update(0.1)
    for (let i = 0; i < 60; i++) e.update(0.02)
    expect(e.state.chest).not.toBeNull()
    if (tap === 'chest') expect(e.tapChest(e.state.chest!.x, e.state.chest!.y)).toBe(true)
    else if (tap) expect(e.tapChest(tap.x, tap.y)).toBe(false)
    for (const a of [1.1, 2.2, 0.7, 1.9]) {
      e.fire(a)
      e.settle()
    }
    return JSON.stringify(ev)
  }

  it('a missed tap leaves the run identical to one with no tap at all', () => {
    expect(play({ x: 0.2, y: 0.2 })).toBe(play(null))
  })

  it('the same tap at the same moment replays identically', () => {
    const a = play('chest')
    expect(play('chest')).toBe(a)
    expect(a).not.toBe(play(null))
  })
})

describe('chest flight', () => {
  /** Makes the chest appear now; returns the engine with it in the air. */
  const launch = (seed: number, ftue: boolean): BarrageEngine => {
    const e = createEngine(defaultConfig({ seed, ftue }))
    e.state.chestTimer = STEP / 2
    e.update(STEP)
    expect(e.state.chest).not.toBeNull()
    return e
  }

  it('is born fully on the board, never clipped at a wall (both directions)', () => {
    // The drawn sprite is ~2.1 × r wide each side of its centre.
    expect(CHEST_R * 2.1).toBeLessThanOrEqual(CHEST_HALF_W)
    const dirs = new Set<number>()
    for (let seed = 1; seed <= 24; seed++) {
      const ch = launch(seed, false).state.chest!
      dirs.add(Math.sign(ch.vx))
      expect(ch.x - CHEST_HALF_W).toBeGreaterThanOrEqual(-1e-9)
      expect(ch.x + CHEST_HALF_W).toBeLessThanOrEqual(COLS + 1e-9)
    }
    expect([...dirs].sort()).toEqual([-1, 1])
  })

  it(`the first session's chest crosses at ${CHEST_FTUE_SPEED}× the speed`, () => {
    for (let seed = 1; seed <= 6; seed++) {
      const normal = launch(seed, false).state.chest!
      const first = launch(seed, true).state.chest!
      expect(Math.abs(normal.vx)).toBeCloseTo(COLS / CHEST_CROSS_TIME, 9)
      expect(Math.abs(first.vx)).toBeCloseTo((COLS / CHEST_CROSS_TIME) * CHEST_FTUE_SPEED, 9)
    }
  })

  it('stays hittable for CHEST_CROSS_TIME (first session: ÷ the slow-down), then leaves fully off the board', () => {
    for (const ftue of [false, true]) {
      const e = launch(3, ftue)
      const ev = record(e)
      let t = 0
      let lastX = e.state.chest!.x
      while (e.state.chest && t < 60) {
        lastX = e.state.chest.x
        e.update(STEP)
        t += STEP
      }
      expect(ofType(ev, 'chestGone')).toHaveLength(1)
      expect(t).toBeCloseTo(CHEST_CROSS_TIME / (ftue ? CHEST_FTUE_SPEED : 1), 1)
      // Its last position was (nearly) past the edge by its whole half-width.
      expect(lastX < -CHEST_HALF_W + 0.05 || lastX > COLS + CHEST_HALF_W - 0.05).toBe(true)
    }
  })
})
