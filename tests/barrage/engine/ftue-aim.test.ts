import { describe, expect, it } from 'vitest'
import { createEngine } from '@/barrage/engine/engine'
import { aimPreview, AIM_CONTINUATION } from '@/barrage/engine/aim'
import {
  CAPACITY_TABLE, DAILY_CONFIG, ECONOMY, UPGRADE_IDS, ballSpeedAt, configFromUpgrades, dailySeed, defaultConfig, killCoins,
  upgradeCost, upgradeMaxLevel, upgradeValue
} from '@/barrage/engine/economy'
import { BALL_R, COLS, FLOOR_Y, MIN_AIM } from '@/barrage/engine/types'
import { board, mon, ofType, record, turn } from './helpers'

const UP = Math.PI / 2

describe('FTUE script (CONTRACT §7)', () => {
  it('row 1 is three HP-1 slimes in columns 2,3,4 with tray [1], capacity 2', () => {
    const e = createEngine(defaultConfig({ seed: 77, ftue: true }))
    const s = e.state
    expect(s.monsters.map(m => [m.kind, m.col, m.row, m.hp]).sort()).toEqual([
      ['slime', 2, 0, 1], ['slime', 3, 0, 1], ['slime', 4, 0, 1]
    ])
    expect(s.tray).toEqual([1])
    expect(s.config.trayCapacity).toBe(2)
  })

  it('firing straight up three times merges T1+T1 into T2 on turn 3', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const e = createEngine(defaultConfig({ seed, ftue: true }))
      const ev = record(e)
      turn(e, UP) // kills the middle slime
      expect(ofType(ev, 'kill')).toHaveLength(1)
      turn(e, UP) // collects the scripted "+1"
      expect(e.state.tray).toEqual([1, 1])
      expect(ofType(ev, 'trayMerge')).toHaveLength(0)
      turn(e, UP) // third ball overflows → merge
      expect(ofType(ev, 'trayMerge')).toEqual([{ type: 'trayMerge', fromTier: 1, toTier: 2 }])
      expect(e.state.tray).toEqual([2, 1])
    }
  })

  it('the scripted "+1" follows the launcher when the first shot went elsewhere', () => {
    const e = createEngine(defaultConfig({ seed: 5, ftue: true }))
    turn(e, 0.35)
    const col = Math.floor(e.state.launcherX)
    const plus = e.state.pickups.filter(p => p.kind === 'ball')
    expect(plus).toHaveLength(1)
    expect(plus[0]!.col).toBe(Math.min(COLS - 1, col))
    turn(e, UP)
    expect(e.state.tray).toEqual([1, 1])
  })

  it('guarantees the turn-3 merge however the player aims (missed "+1"s auto-collect)', () => {
    for (const angle of [0.2, 0.5, 2.6, 2.9]) {
      const e = createEngine(defaultConfig({ seed: 31, ftue: true }))
      const ev = record(e)
      for (let t = 0; t < 3; t++) {
        e.fire(angle)
        e.recall() // not a single ball reaches anything
        e.settle()
      }
      expect(ofType(ev, 'trayMerge')[0]).toEqual({ type: 'trayMerge', fromTier: 1, toTier: 2 })
      expect(e.state.tray).toEqual([2, 1])
      expect(ofType(ev, 'pickup').every(p => p.auto === true)).toBe(true)
    }
  })

  it('the guarantee stops after row 4 (no auto-collect later in the FTUE)', () => {
    const e = createEngine(defaultConfig({ seed: 31, ftue: true }))
    for (let t = 0; t < 4; t++) { e.fire(0.3); e.recall(); e.settle() }
    const ev = record(e)
    e.fire(0.3); e.recall(); e.settle() // volley of row 5
    expect(ofType(ev, 'pickup').filter(p => p.auto)).toHaveLength(0)
    expect(e.state.pickups.some(p => p.kind === 'ball')).toBe(true)
  })

  it('FTUE rows 1–5 stay at HP ≤ 3 with no goblins', () => {
    const e = createEngine(defaultConfig({ seed: 17, ftue: true, damageMult: 0.001 }))
    for (let i = 0; i < 4; i++) turn(e, 0.2)
    for (const m of e.state.monsters) {
      expect(m.kind).not.toBe('goblin')
      expect(m.maxHp).toBeLessThanOrEqual(3)
    }
  })
})

describe('aim preview', () => {
  it('straight up on an empty board hits the ceiling', () => {
    const e = board()
    const p = e.aimPreview(UP)
    expect(p.hit).toBe('ceiling')
    expect(p.points[1]!.x).toBeCloseTo(3.5)
    expect(p.points[1]!.y).toBeCloseTo(BALL_R)
    expect(p.points[2]!.y).toBeCloseTo(BALL_R + AIM_CONTINUATION)
  })

  it('stops at the bottom face of the first monster in line', () => {
    const m = mon('slime', 3, 5)
    const e = board({ monsters: [m, mon('slime', 3, 2)] })
    const p = e.aimPreview(UP)
    expect(p.hit).toBe('monster')
    expect(p.monsterId).toBe(m.id)
    expect(p.points[1]!.y).toBeCloseTo(6 + BALL_R)
    expect(p.points[2]!.y).toBeCloseTo(6 + BALL_R + AIM_CONTINUATION)
  })

  it('wall bounce point matches the geometry and the real volley', () => {
    const a = Math.PI / 4
    const e = board({ tray: [1] })
    const p = e.aimPreview(a)
    expect(p.hit).toBe('wall')
    const t = (COLS - BALL_R - 3.5) / Math.cos(a)
    expect(p.points[1]!.x).toBeCloseTo(COLS - BALL_R)
    expect(p.points[1]!.y).toBeCloseTo(FLOOR_Y - BALL_R - t * Math.sin(a))
    const cont = p.points[2]!
    expect(cont.x).toBeLessThan(p.points[1]!.x)
    expect(cont.y).toBeLessThan(p.points[1]!.y)
    const ev = record(e)
    e.fire(a)
    for (let i = 0; i < 200 && e.state.phase === 'volley'; i++) e.update(1 / 120)
    const bounce = ofType(ev, 'wallBounce')[0]!
    expect(bounce.x).toBeCloseTo(p.points[1]!.x, 5)
    expect(Math.abs(bounce.y - p.points[1]!.y)).toBeLessThan(0.2)
  })

  it('grazes past a corner the ball clears and hits a side face it does not', () => {
    const m = mon('slime', 4, 7)
    const e = board({ monsters: [m] })
    // Aim at the left face of the monster from the launcher.
    const target = { x: 4 - BALL_R, y: 7.5 }
    const a = Math.atan2(FLOOR_Y - BALL_R - target.y, target.x - 3.5)
    const p = aimPreview(e.state, a)
    expect(p.hit).toBe('monster')
    expect(p.points[1]!.x).toBeCloseTo(4 - BALL_R, 5)
  })

  it('clamps the angle to [MIN_AIM, π − MIN_AIM]', () => {
    const e = board()
    expect(e.aimPreview(-2)).toEqual(e.aimPreview(MIN_AIM))
    expect(e.aimPreview(4)).toEqual(e.aimPreview(Math.PI - MIN_AIM))
  })
})

describe('economy', () => {
  it('capacity table, caps and values', () => {
    expect(CAPACITY_TABLE).toEqual([2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40])
    expect(upgradeMaxLevel('capacity')).toBe(15)
    expect(upgradeMaxLevel('luck')).toBe(10)
    expect(upgradeMaxLevel('damage')).toBeNull()
    expect(upgradeMaxLevel('bounty')).toBeNull()
    expect(upgradeMaxLevel('speed')).toBeNull()
    expect(upgradeValue('luck', 10)).toBeCloseTo(0.5)
    expect(upgradeValue('damage', 2)).toBeCloseTo(1.5625)
    expect(upgradeValue('bounty', 1)).toBeCloseTo(1.2)
    const cfg = configFromUpgrades({ damage: 0, capacity: 0, speed: 10, luck: 0, bounty: 0 })
    expect(cfg.launchInterval).toBeCloseTo(0.045)
    expect(configFromUpgrades({ damage: 0, capacity: 0, speed: 0, luck: 0, bounty: 0 }).launchInterval).toBeCloseTo(0.085)
  })

  it('Tempo (speed): 15 → 26 cells/s over 10 levels, then flat; its damage keeps compounding', () => {
    expect(ballSpeedAt(0)).toBe(15)
    expect(ballSpeedAt(10)).toBe(26)
    expect(ballSpeedAt(25)).toBe(26)
    expect(configFromUpgrades({ damage: 0, capacity: 0, speed: 25, luck: 0, bounty: 0 }).launchInterval).toBeCloseTo(0.045)
    expect(upgradeValue('speed', 0)).toBe(1)
    expect(upgradeValue('speed', 1)).toBeCloseTo(ECONOMY.tempoDamage)
    expect(upgradeValue('speed', 25)).toBeCloseTo(Math.pow(ECONOMY.tempoDamage, 25))
    expect(ECONOMY.tempoDamage).toBeGreaterThan(1)
    // Every ball's damage = Ball Damage × Tempo.
    const cfg = configFromUpgrades({ damage: 3, capacity: 0, speed: 4, luck: 0, bounty: 0 })
    expect(cfg.damageMult).toBeCloseTo(upgradeValue('damage', 3) * upgradeValue('speed', 4))
    expect(cfg.ballSpeed).toBe(ballSpeedAt(4))
    // The Daily's fixed kit: Ball Damage 4 alone, Tempo 5's speed.
    expect(DAILY_CONFIG.damageMult).toBeCloseTo(upgradeValue('damage', 4))
    expect(DAILY_CONFIG.ballSpeed).toBe(ballSpeedAt(5))
  })

  it('kill coins grow 1.05 a row to coinLateRow, then coinLateGrowth a row', () => {
    const r0 = ECONOMY.coinLateRow
    const at = (row: number) => ECONOMY.coinBase * Math.pow(ECONOMY.coinGrowth, Math.min(row, r0) - 1) * Math.pow(ECONOMY.coinLateGrowth, Math.max(0, row - r0))
    for (const row of [1, 10, 20, r0, r0 + 1, r0 + 10, r0 + 60]) {
      expect(killCoins(row, 'slime', false)).toBe(Math.max(1, Math.round(at(row))))
    }
    expect(ECONOMY.coinLateGrowth).toBeGreaterThan(ECONOMY.coinGrowth)
  })

  it('costs are positive, rising, and Infinity once maxed', () => {
    for (const id of UPGRADE_IDS) {
      let prev = 0
      const max = upgradeMaxLevel(id) ?? 30
      for (let l = 0; l < max; l++) {
        const c = upgradeCost(id, l)
        expect(c).toBeGreaterThan(prev)
        prev = c
      }
      if (upgradeMaxLevel(id) !== null) expect(upgradeCost(id, max)).toBe(Number.POSITIVE_INFINITY)
    }
  })

  it('daily config is fixed and the daily seed is stable per date', () => {
    expect(dailySeed('2026-09-23')).toBe(dailySeed('2026-09-23'))
    expect(dailySeed('2026-09-23')).not.toBe(dailySeed('2026-09-24'))
    expect(Object.isFrozen(DAILY_CONFIG)).toBe(true)
    expect(killCoins(40, 'slime', true) / killCoins(40, 'slime', false)).toBeCloseTo(3, 0)
  })
})
