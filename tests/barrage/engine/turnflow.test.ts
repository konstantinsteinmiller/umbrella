import { describe, expect, it } from 'vitest'
import { createEngine, createEngineAtRow } from '@/barrage/engine/engine'
import { defaultConfig } from '@/barrage/engine/economy'
import { rowHp } from '@/barrage/engine/monsters'
import { LAUNCH_MARGIN, ROWS } from '@/barrage/engine/types'
import { board, mon, ofType, pass, pick, record, turn } from './helpers'

describe('turn flow', () => {
  it('runs aim → volley → resolve → advance → aim and marches everything one row', () => {
    const m = mon('slime', 0, 3)
    const e = board({ monsters: [m], tray: [1] })
    const ev = record(e)
    expect(turn(e, Math.PI / 2)).toBe('aim')
    const phases = ofType(ev, 'phase').map(p => p.phase)
    expect(phases).toEqual(['volley', 'resolve', 'advance', 'aim'])
    expect(m.row).toBe(4)
    expect(e.state.row).toBe(6)
    expect(ofType(ev, 'rowSpawned')).toEqual([{ type: 'rowSpawned', row: 6, boss: false }])
    expect(ofType(ev, 'march')).toEqual([{ type: 'march', rows: 1 }])
  })

  it('every spawned row carries exactly one "+1" ball pickup', () => {
    const e = createEngine(defaultConfig({ seed: 21 }))
    const counts: number[] = []
    for (let i = 0; i < 12; i++) {
      const before = new Set(e.state.pickups.filter(p => p.kind === 'ball').map(p => p.id))
      turn(e, 0.3) // shallow: rarely collects anything
      if (e.state.phase === 'breach') break
      counts.push(e.state.pickups.filter(p => p.kind === 'ball' && p.row === 0 && !before.has(p.id)).length)
    }
    expect(counts.every(c => c === 1)).toBe(true)
  })

  it('a "+1" reaching the launcher line flies into the tray; coins and skills are lost', () => {
    const ball = pick('ball', 0, ROWS - 1)
    const coin = pick('coin', 1, ROWS - 1, { amount: 5 })
    const skill = pick('skill', 2, ROWS - 1, { skill: 'meteor' })
    const e = board({ pickups: [ball, coin, skill], tray: [1], config: { trayCapacity: 4 } })
    const ev = record(e)
    pass(e)
    expect(ofType(ev, 'pickup')).toEqual([{ type: 'pickup', pickupId: ball.id, kind: 'ball', x: 0.5, y: ROWS - 0.5, auto: true }])
    expect(e.state.tray).toEqual([1, 1])
    expect(e.state.pickups.some(p => p.id === coin.id || p.id === skill.id)).toBe(false)
    expect(ofType(ev, 'coins')).toHaveLength(0)
    expect(ofType(ev, 'skill')).toHaveLength(0)
  })

  it('moves the launcher to the first landing, clamped to the margin', () => {
    const e = board({ tray: [1] })
    turn(e, 0.2) // shallow right: bounces off the right wall area
    expect(e.state.launcherX).toBeGreaterThanOrEqual(LAUNCH_MARGIN)
    expect(e.state.launcherX).toBeLessThanOrEqual(7 - LAUNCH_MARGIN)
    expect(e.state.launcherX).not.toBeCloseTo(3.5)
  })

  it('fast-forwards long volleys and recall() ends them at once', () => {
    // A pocket: the ball ping-pongs between ceiling and a full row for ages.
    const row = [0, 1, 2, 3, 4, 5, 6].map(c => mon('slime', c, 6))
    const e = board({ monsters: row, tray: [1, 1, 1] })
    const ev = record(e)
    e.fire(Math.PI / 2 - 0.02)
    for (let i = 0; i < 12 * 120 && e.state.phase === 'volley'; i++) e.update(1 / 120)
    // Straight up hits row 6 and falls back: short volley, no fast-forward yet.
    expect(e.state.phase).not.toBe('volley')
    expect(ofType(ev, 'speedUp')).toHaveLength(0)

    const pocket = board({ monsters: [0, 1, 2, 3, 4, 5, 6].map(c => mon('slime', c, 2)), pickups: [], tray: [1] })
    const ev2 = record(pocket)
    // Get a ball above the row via a skill-free trick: start it there.
    pocket.fire(Math.PI / 2)
    const b = pocket.state.balls[0]!
    b.x = 3.5; b.y = 1; b.vx = 0.4; b.vy = -15
    for (let i = 0; i < 6 * 120; i++) pocket.update(1 / 120)
    expect(ofType(ev2, 'speedUp').map(s => s.speedMul)).toEqual([2, 3])
    expect(pocket.state.speedMul).toBe(3)
    pocket.recall()
    expect(pocket.state.phase).toBe('resolve')
    expect(pocket.state.balls.every(x => !x.active)).toBe(true)
    expect(pocket.state.speedMul).toBe(1)
  })

  it('emits combo marks and FEVER at FEVER_HITS', () => {
    const pocketRow = [0, 1, 2, 3, 4, 5, 6].map(c => mon('slime', c, 2))
    const e = board({ monsters: pocketRow, tray: [1] })
    const ev = record(e)
    e.fire(Math.PI / 2)
    const b = e.state.balls[0]!
    b.x = 3.3; b.y = 1; b.vx = 3; b.vy = -15
    e.settle(8)
    expect(ofType(ev, 'combo').map(c => c.hits)).toEqual([10, 20, 30, 40])
    expect(ofType(ev, 'fever')).toHaveLength(1)
  })

  it('checkpoint restart builds a fresh board at the given row with the given tray', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 5 }), 11, [4, 2, 2])
    expect(e.state.row).toBe(11)
    expect(e.state.nextBossRow).toBe(20)
    expect(e.state.tray).toEqual([4, 2, 2])
    expect(e.state.phase).toBe('aim')
    for (const m of e.state.monsters) expect(m.maxHp).toBeGreaterThanOrEqual(rowHp(11))
  })

  it('emits danger when the lowest monster is ≤ 2 rows from breaching', () => {
    const e = board({ monsters: [mon('slime', 0, ROWS - 4)], tray: [1] })
    const ev = record(e)
    turn(e, Math.PI / 2)
    expect(ofType(ev, 'danger')).toEqual([{ type: 'danger', rowsLeft: 2 }])
  })
})

describe('breach', () => {
  const lastRow = () => mon('slime', 0, ROWS - 1)

  it('a monster marching past the last row is a breach; meteor continue clears the bottom rows', () => {
    const doomed = lastRow()
    const safe = mon('slime', 6, 2)
    const e = board({ monsters: [doomed, safe, mon('ogre', 5, ROWS - 2)], tray: [1] })
    const ev = record(e)
    expect(turn(e, Math.PI / 2)).toBe('breach')
    expect(ofType(ev, 'breach')).toHaveLength(1)
    expect(e.canFire()).toBe(false)
    expect(e.continueAfterBreach('revive')).toBe(false) // no revive charge
    expect(e.continueAfterBreach('meteor')).toBe(true)
    expect(e.state.phase).toBe('aim')
    expect(e.state.monsters.some(m => m.row + m.h > ROWS - 2)).toBe(false)
    expect(e.state.monsters).toContain(safe)
    expect(ofType(ev, 'continued')).toEqual([{ type: 'continued', how: 'meteor' }])
    expect(e.continueAfterBreach('meteor')).toBe(false) // not in breach any more
  })

  it('a shield absorbs the breach automatically', () => {
    const e = board({ monsters: [lastRow()], tray: [1], shields: 1 })
    const ev = record(e)
    expect(turn(e, Math.PI / 2)).toBe('aim')
    expect(e.state.shields).toBe(0)
    expect(ofType(ev, 'shieldBlock')).toHaveLength(1)
    expect(ofType(ev, 'continued')).toEqual([{ type: 'continued', how: 'shield' }])
    expect(ofType(ev, 'breach')).toHaveLength(0)
  })

  it('revive consumes a charge', () => {
    const e = board({ monsters: [lastRow()], tray: [1], revives: 1 })
    expect(turn(e, Math.PI / 2)).toBe('breach')
    expect(e.continueAfterBreach('revive')).toBe(true)
    expect(e.state.revives).toBe(0)
    expect(e.state.phase).toBe('aim')
  })

  it('a breaching boss loses 25% max HP and is pushed up three rows instead', () => {
    const boss = mon('boss', 2, ROWS - 3, 1000, { bossKind: 'worm' })
    const e = board({ monsters: [boss], tray: [1] })
    expect(turn(e, 0.15)).toBe('breach')
    const hp = boss.hp
    expect(e.continueAfterBreach('meteor')).toBe(true)
    expect(boss.hp).toBeCloseTo(hp - 250)
    expect(boss.row).toBe(ROWS - 2 - 3)
  })
})
