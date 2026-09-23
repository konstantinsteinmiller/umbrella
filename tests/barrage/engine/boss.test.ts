import { describe, expect, it } from 'vitest'
import { createEngine, createEngineAtRow, restoreEngine } from '@/barrage/engine/engine'
import { bossBounty, defaultConfig, killCoins } from '@/barrage/engine/economy'
import { HP_CURVE, bossForRow, monsterHp, rowHp } from '@/barrage/engine/monsters'
import { board, mon, ofType, pass, record, turn } from './helpers'

describe('bosses', () => {
  it('row 10 spawns a 3×3 slime tower above the board (rows −2..0)', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 8 }), 9, [1])
    const ev = record(e)
    turn(e, 0.3)
    const spawn = ofType(ev, 'bossSpawn')
    expect(spawn).toHaveLength(1)
    expect(spawn[0]!.bossKind).toBe('slime-tower')
    expect(spawn[0]!.row).toBe(10)
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    expect([boss.w, boss.h, boss.row]).toEqual([3, 3, -2])
    expect(boss.maxHp).toBe(monsterHp(10, 'boss', false))
    expect(boss.maxHp).toBe(Math.round(HP_CURVE.boss * rowHp(10)))
    expect(e.state.nextBossRow).toBe(20)
    expect(ofType(ev, 'rowSpawned')).toEqual([{ type: 'rowSpawned', row: 10, boss: true }])
    // 1–3 light walkers beside it, plus the row's "+1".
    const walkers = e.state.monsters.filter(m => m.kind !== 'boss' && m.row === 0)
    expect(walkers.length).toBeGreaterThanOrEqual(1)
    expect(walkers.length).toBeLessThanOrEqual(3)
    expect(walkers.every(m => m.kind === 'slime' || m.kind === 'goblin')).toBe(true)
  })

  it('boss roster order, then the corrupted lap', () => {
    expect([10, 20, 30, 40, 50, 60].map(r => bossForRow(r).bossKind))
      .toEqual(['slime-tower', 'worm', 'fire-dragon', 'silver-dragon', 'troll', 'orc'])
    expect(bossForRow(70)).toEqual({ bossKind: 'slime-tower', corrupted: true })
    expect(bossForRow(60).corrupted).toBe(false)
  })

  it('enrages below 30% HP and then marches two rows per turn', () => {
    const boss = mon('boss', 2, 1, 1000, { bossKind: 'fire-dragon', hp: 301 })
    const e = board({ monsters: [boss], tray: [2, 2, 2, 2] })
    const ev = record(e)
    pass(e)
    expect(boss.enraged).toBe(false)
    expect(boss.row).toBe(2)
    turn(e, Math.PI / 2)
    expect(boss.enraged).toBe(true)
    expect(ofType(ev, 'bossEnrage')).toEqual([{ type: 'bossEnrage', monsterId: boss.id }])
    expect(boss.row).toBe(4) // marched 2
    pass(e)
    expect(boss.row).toBe(6)
  })

  it('killing the boss emits bossDefeated with its row and bounty (not paid as coins)', () => {
    const boss = mon('boss', 2, 1, 3, { bossKind: 'worm', spawnRow: 20 })
    const e = board({ monsters: [boss], tray: [2, 2], config: { coinMult: 2 } })
    const ev = record(e)
    turn(e, Math.PI / 2)
    const d = ofType(ev, 'bossDefeated')
    expect(d).toEqual([{ type: 'bossDefeated', monsterId: boss.id, bossKind: 'worm', row: 20, bounty: bossBounty(20) * 2 }])
    expect(bossBounty(20)).toBe(25 * killCoins(20, 'slime', false))
    expect(ofType(ev, 'coins').some(c => c.source === 'boss')).toBe(false)
    expect(e.state.bossId).toBeNull()
  })

  it('slime tower spawns a slime beside itself every 2nd turn', () => {
    const boss = mon('boss', 2, 2, 1e9, { bossKind: 'slime-tower' })
    const e = board({ monsters: [boss], tray: [1] })
    const ev = record(e)
    pass(e) // turn 1
    pass(e) // turn 2 → spawn
    const spawns = ofType(ev, 'monsterSpawn').filter(s => s.kind === 'slime')
    const beside = e.state.monsters.filter(m => m.kind === 'slime' && (m.col === 1 || m.col === 5) && m.row >= boss.row && m.row < boss.row + 3)
    expect(beside.length).toBeGreaterThanOrEqual(1)
    expect(spawns.length).toBeGreaterThanOrEqual(1)
    // Minions appear beside the tower's TOP row, so they don't breach at once.
    expect(beside.every(m => m.row === boss.row)).toBe(true)
  })

  it('a slime tower near the line spawns no minion within 3 marches of it', () => {
    const boss = mon('boss', 2, 5, 1e9, { bossKind: 'slime-tower' })
    const e = board({ monsters: [boss], tray: [1] })
    pass(e)
    expect(pass(e)).toBe('aim') // turn 2 → a spawn turn, tower now at rows 7–9
    expect(boss.row).toBe(7)
    expect(e.state.monsters.filter(m => m.kind === 'slime' && m.row >= 2)).toHaveLength(0)
  })

  it('first boss ends the FTUE script', () => {
    const e = createEngine(defaultConfig({ seed: 1, ftue: true }))
    expect(e.state.config.ftue).toBe(true)
    // Rebuild via a snapshot so the grid knows about the boss.
    const snap = e.snapshot()!
    snap.monsters = [mon('boss', 2, 1, 1, { bossKind: 'slime-tower', spawnRow: 10 })]
    const r = restoreEngine(snap)
    turn(r, Math.PI / 2)
    expect(r.state.config.ftue).toBe(false)
  })
})
