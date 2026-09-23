import { describe, expect, it } from 'vitest'
import { aimFan, medianOf, pickBest, trialShot, canTrial, type ShotTrial } from '@/barrage/engine/shotFinder'
import { createEngine } from '@/barrage/engine/engine'
import { defaultConfig } from '@/barrage/engine/economy'
import { BALL_R, COLS, FLOOR_Y, MIN_AIM } from '@/barrage/engine/types'
import { board, mon, pick, record } from './helpers'

const UP = Math.PI / 2
const snap = (e: ReturnType<typeof board>): string =>
  JSON.stringify({ ...e.state, phaseTime: 0, balls: e.state.balls.map(b => ({ ...b, passing: null })) })

describe('trialShot', () => {
  it('never touches the source engine — state, stats and listeners', () => {
    const e = board({ monsters: [mon('slime', 3, 2, 3), mon('slime', 4, 5, 3)], pickups: [pick('ball', 3, 6)], tray: [2, 1] })
    const before = snap(e)
    const stats = JSON.stringify(e.stats)
    const events = record(e)
    const t = trialShot(e, 1.3)
    expect(t.hits).toBeGreaterThan(0)
    expect(snap(e)).toBe(before)
    expect(JSON.stringify(e.stats)).toBe(stats)
    expect(events).toHaveLength(0)
    expect(e.state.phase).toBe('aim')
  })

  it('predicts the real volley exactly (same board, same angle ⇒ same result)', () => {
    const e = createEngine(defaultConfig({ seed: 41, trayCapacity: 6 }))
    e.addBalls(4)
    for (const a of [1.1, 2.0]) { e.fire(a); e.settle() }
    const t = trialShot(e, 1.37)
    const h0 = e.stats.hits
    const k0 = e.stats.kills
    e.fire(1.37)
    e.settle()
    expect(e.stats.hits - h0).toBe(t.hits)
    expect(e.stats.kills - k0).toBe(t.kills)
  })

  it('records the first ball as a polyline: launcher → bounces → floor', () => {
    // Top launch speed: a ball covers ~0.22 cells a step, so a vertex taken
    // at the END of the bouncing step (not where it turned) would be visibly off.
    const e = board({ monsters: [mon('slime', 3, 2)], launcherX: 3.5, config: { ballSpeed: 26 } })
    const t = trialShot(e, UP)
    const p = t.path
    expect(p.length).toBeGreaterThanOrEqual(6) // launcher, the slime's face, the landing
    expect(p[0]).toBeCloseTo(3.5, 5)
    // First vertex: straight up into the slime's bottom face (row 2 → y = 3);
    // the path is the ball's CENTRE, which turns one radius short of the face.
    expect(p[2]).toBeCloseTo(3.5, 1)
    expect(Math.abs(p[3]! - (3 + BALL_R))).toBeLessThan(0.06)
    // It comes back down to the floor line.
    expect(p[p.length - 1]!).toBeGreaterThan(FLOOR_Y - 0.3)
    for (let i = 0; i < p.length; i += 2) {
      expect(p[i]!).toBeGreaterThanOrEqual(0)
      expect(p[i]!).toBeLessThanOrEqual(COLS)
    }
    // …and it logged the contact where it hit the slime.
    expect(t.contacts.length).toBeGreaterThanOrEqual(2)
    expect(t.contacts[1]!).toBeGreaterThan(2.7)
  })

  it('puts wall bounces ON the wall, not wherever the ball got to that step', () => {
    const e = board({ launcherX: 3.5, config: { ballSpeed: 26 } })
    const t = trialShot(e, 0.5) // shallow, to the right wall first
    // The physics CLAMPS an overshooting ball to the wall (it does not reflect
    // the remainder), so the crossing sits a hair past it — ~1 px on a phone,
    // where the old end-of-step point was up to a third of a cell off.
    expect(Math.abs(t.path[2]! - (COLS - BALL_R))).toBeLessThan(0.05)
    // …and ON the flight line: the height it had when it met the wall.
    const onLine = t.path[1]! - (t.path[2]! - t.path[0]!) * Math.tan(0.5)
    expect(Math.abs(t.path[3]! - onLine)).toBeLessThan(0.03)
  })

  it('tallies damage and kills on the named threats only', () => {
    const low = mon('slime', 3, 8, 2)
    const high = mon('slime', 0, 1, 1e9)
    const e = board({ monsters: [low, high], launcherX: 3.5, tray: [1, 1, 1] })
    const t = trialShot(e, UP, { threats: new Set([low.id]) })
    expect(t.threatDamage).toBeGreaterThan(0)
    expect(t.threatKills).toBe(1)
    const miss = trialShot(e, UP, { threats: new Set([high.id]) })
    expect(miss.threatDamage).toBe(0)
  })

  it('knows when the turn ends in a breach, and how close it came', () => {
    const e = board({ monsters: [mon('slime', 0, 9, 1e9)], launcherX: 6 })
    const t = trialShot(e, UP)
    expect(t.breach).toBe(true)
    expect(t.rowsLeftAfter).toBeLessThan(0)
    const safe = board({ monsters: [mon('slime', 0, 2, 1e9)] })
    expect(trialShot(safe, UP).breach).toBe(false)
  })

  it('reports the skill bubbles a shot would trigger', () => {
    const e = board({ pickups: [pick('skill', 3, 5, { skill: 'meteor' })], launcherX: 3.5 })
    expect(trialShot(e, UP).skills).toContain('meteor')
  })

  it('refuses outside the aim phase and on engines without clone()', () => {
    const e = board({ monsters: [mon('slime', 3, 2)] })
    e.fire(UP)
    expect(trialShot(e, UP).path).toHaveLength(0)
    expect(canTrial(e)).toBe(true)
    expect(canTrial({})).toBe(false)
  })
})

describe('fan + picking', () => {
  const fake = (hits: number[]): ShotTrial[] => hits.map((h, i) => ({
    angle: i, hits: h, kills: 0, damage: 0, balls: 0, skills: [], breach: false,
    threatDamage: 0, threatKills: 0, rowsLeftAfter: 5, path: [], contacts: []
  }))

  it('aimFan spans exactly the legal fan', () => {
    const f = aimFan(9)
    expect(f).toHaveLength(9)
    expect(f[0]).toBeCloseTo(MIN_AIM)
    expect(f[8]).toBeCloseTo(Math.PI - MIN_AIM)
    expect(f[4]).toBeCloseTo(UP)
  })

  it('pickBest prefers a broad plateau over a lone spike', () => {
    //            spike ↓           plateau ↓↓↓
    const t = fake([0, 20, 0, 0, 0, 14, 15, 14, 0])
    expect(pickBest(t, x => x.hits)).toBe(6)
  })

  it('medianOf is the typical shot', () => {
    expect(medianOf(fake([1, 9, 3, 2, 40]), x => x.hits)).toBe(3)
    expect(pickBest([], x => x.hits)).toBe(-1)
  })
})
