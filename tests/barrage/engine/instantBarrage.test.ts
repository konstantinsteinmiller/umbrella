// Instant Barrage (retention-roadmap #1): the FTUE tray grows sockets, rows
// 1–5 are denser with an extra "+1", row 4 arrives as a swarm and the 4th
// volley is overcharged into the session's first FEVER. Nothing of it runs
// with `ftue: false`.
import { describe, expect, it } from 'vitest'
import { createEngine } from '@/barrage/engine/engine'
import { FTUE_SWARM_ROW, FTUE_SOCKET_LEVEL } from '@/barrage/engine/engine'
import { CAPACITY_TABLE, defaultConfig } from '@/barrage/engine/economy'
import { COLS, FTUE_OVERCHARGE_COPIES, FTUE_OVERCHARGE_TURN, overchargeArmed } from '@/barrage/engine/types'
import { board, mon, ofType, record, turn } from './helpers'

describe('FTUE sockets', () => {
  it('a "+1" meeting a full tray grows a socket instead of merging, up to capacity 6', () => {
    const e = board({ tray: [1, 1], config: { trayCapacity: 2, ftue: true } })
    const ev = record(e)
    e.addBalls(4)
    expect(ofType(ev, 'traySocket').map(s => s.capacity)).toEqual([3, 4, 6])
    expect(ofType(ev, 'traySocket').map(s => s.level)).toEqual([1, 2, FTUE_SOCKET_LEVEL])
    expect(e.state.config.trayCapacity).toBe(CAPACITY_TABLE[FTUE_SOCKET_LEVEL])
    expect(e.state.tray).toHaveLength(6)
    expect(ofType(ev, 'trayMerge')).toHaveLength(0)
    // Full at 6: the next "+1" merges like always — growth stops at 6.
    e.addBalls(1)
    expect(e.state.config.trayCapacity).toBe(6)
    expect(ofType(ev, 'traySocket')).toHaveLength(3)
    expect(ofType(ev, 'trayMerge')).toHaveLength(1)
  })

  it('never grows a socket outside the FTUE or in the Daily', () => {
    for (const config of [{ trayCapacity: 2, ftue: false }, { trayCapacity: 2, ftue: true, mode: 'daily' as const }]) {
      const e = board({ tray: [1, 1], config })
      const ev = record(e)
      e.addBalls(3)
      expect(ofType(ev, 'traySocket')).toHaveLength(0)
      expect(e.state.config.trayCapacity).toBe(2)
    }
  })
})

describe('overcharged volley', () => {
  it('is armed for the FTUE 4th volley only', () => {
    const cfg = defaultConfig({ seed: 1, ftue: true })
    expect(overchargeArmed({ config: cfg, turn: FTUE_OVERCHARGE_TURN - 1 })).toBe(true)
    expect(overchargeArmed({ config: cfg, turn: FTUE_OVERCHARGE_TURN })).toBe(false)
    expect(overchargeArmed({ config: { ...cfg, ftue: false }, turn: FTUE_OVERCHARGE_TURN - 1 })).toBe(false)
    expect(overchargeArmed({ config: { ...cfg, mode: 'daily' }, turn: FTUE_OVERCHARGE_TURN - 1 })).toBe(false)
  })

  it('fires the tray 1 + copies times over and ignites FEVER on its first hit', () => {
    const e = board({ tray: [2, 1], monsters: [mon('slime', 3, 2)], config: { ftue: true } })
    e.state.turn = FTUE_OVERCHARGE_TURN - 1
    const ev = record(e)
    turn(e, Math.PI / 2)
    expect(ofType(ev, 'fire')[0]!.balls).toBe(2 * (1 + FTUE_OVERCHARGE_COPIES))
    expect(ofType(ev, 'fever')).toHaveLength(1)
    // The copies are ghosts: the tray is unchanged by the volley itself.
    expect(e.state.tray).toEqual([2, 1])
  })

  it('a non-FTUE volley at the same turn is the plain tray, no early FEVER', () => {
    const e = board({ tray: [2, 1], monsters: [mon('slime', 3, 2)], config: { ftue: false } })
    e.state.turn = FTUE_OVERCHARGE_TURN - 1
    const ev = record(e)
    turn(e, Math.PI / 2)
    expect(ofType(ev, 'fire')[0]!.balls).toBe(2)
    expect(ofType(ev, 'fever')).toHaveLength(0)
  })
})

describe('FTUE rows', () => {
  const cellsUsed = (e: ReturnType<typeof createEngine>, row: number): number => {
    let n = 0
    for (const m of e.state.monsters) if (m.row === row && m.kind !== 'boss') n += m.w
    for (const p of e.state.pickups) if (p.row === row) n++
    return n
  }

  it('rows 1–5 bring an extra "+1"; the swarm row fills the top row', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const e = createEngine(defaultConfig({ seed, ftue: true }))
      expect(e.state.pickups.filter(p => p.kind === 'ball' && p.row === 0).length).toBeGreaterThanOrEqual(1)
      while (e.state.row < FTUE_SWARM_ROW) turn(e, Math.PI / 2 - 0.4)
      expect(e.state.row).toBe(FTUE_SWARM_ROW)
      expect(cellsUsed(e, 0)).toBe(COLS)
    }
  })

  it('a non-FTUE run is untouched: no extra "+1", no swarm', () => {
    let full = 0
    for (const seed of [1, 2, 3, 4, 5]) {
      const e = createEngine(defaultConfig({ seed, ftue: false }))
      while (e.state.row < FTUE_SWARM_ROW) turn(e, Math.PI / 2 - 0.4)
      expect(e.state.pickups.filter(p => p.kind === 'ball' && p.row === 0).length).toBeLessThanOrEqual(1)
      if (cellsUsed(e, 0) === COLS) full++
    }
    expect(full).toBeLessThan(5)
  })
})
