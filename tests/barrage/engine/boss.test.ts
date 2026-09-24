import { describe, expect, it } from 'vitest'
import { createEngine, createEngineAtRow, restoreEngine } from '@/barrage/engine/engine'
import { bossBounty, defaultConfig, killCoins } from '@/barrage/engine/economy'
import { HP_CURVE, bossForRow, bossHp, monsterHp, rowHp } from '@/barrage/engine/monsters'
import { ROWS } from '@/barrage/engine/types'
import { board, mon, ofType, pass, pick, record, turn } from './helpers'

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
    // The FIRST boss comes alone (playtest run 2): no walkers beside it, only
    // the row's "+1".
    expect(e.state.monsters.filter(m => m.kind !== 'boss' && m.row === 0)).toEqual([])
    expect(e.state.pickups.filter(p => p.kind === 'ball' && p.row === 0)).toHaveLength(1)
  })

  it('a later boss (row 20) still brings 1–3 light walkers beside it', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 8 }), 19, [1])
    turn(e, 0.3)
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    expect(boss.bossKind).toBe('worm')
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

  it('a later boss takes HP_CURVE.bossLater × the clock row after its walkers', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 8 }), 19, [1])
    const clock = e.hpClock.hpRow
    turn(e, 0.3)
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    expect(boss.spawnRow).toBe(20)
    expect(boss.maxHp).toBe(bossHp(clock + 1, 20, false))
    expect(boss.maxHp).toBe(Math.round(HP_CURVE.bossLater * rowHp(clock + 1)))
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

// Playtest run 3 ("boss-shield"): the 8–13 grunts already on the board when the
// FIRST boss arrived shielded it for several turns ("HP bar stayed pinned at 57").
describe('the first boss roars the stage clear', () => {
  it('right after its bossSpawn: every walker dies (normal kill coins); pickups stay', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 5 }), 9, [1])
    const walkers = e.state.monsters.map(m => ({ id: m.id, kind: m.kind, corrupted: m.corrupted, spawnRow: m.spawnRow! }))
    expect(walkers.length).toBeGreaterThan(0)
    const pickupsBefore = e.state.pickups.map(p => p.id)
    expect(pickupsBefore.length).toBeGreaterThan(0)
    const ev = record(e)
    expect(pass(e)).toBe('aim') // row 10: the Slime Tower
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    expect(ofType(ev, 'bossRoar')).toEqual([
      { type: 'bossRoar', monsterId: boss.id, ids: walkers.map(w => w.id), x: boss.col + 1.5, y: boss.row + 1.5 }
    ])
    const order = ev.map(x => x.type)
    expect(order.indexOf('bossRoar')).toBe(order.indexOf('bossSpawn') + 1)
    expect(ofType(ev, 'kill').map(k => k.monsterId)).toEqual(walkers.map(w => w.id))
    expect(ofType(ev, 'coins').filter(c => c.source === 'kill').map(c => c.amount))
      .toEqual(walkers.map(w => killCoins(w.spawnRow, w.kind, w.corrupted)))
    expect(e.state.monsters.filter(m => m.kind !== 'boss')).toEqual([])
    for (const id of pickupsBefore) expect(e.state.pickups.some(p => p.id === id)).toBe(true)
  })

  it('goes through a gem shield, never splits an imp, and leaves sludge alone', () => {
    const gem = mon('carbuncle', 0, 5, 1e9, { shield: true })
    const imp = mon('imp', 6, 6, 50)
    const plusOne = pick('ball', 5, 3)
    const sludge = { id: 90001, col: 3, row: 7, turns: 3 }
    const e = board({ monsters: [gem, imp], pickups: [plusOne], hazards: [sludge], row: 9, nextBossRow: 10 })
    const ev = record(e)
    expect(pass(e)).toBe('aim')
    expect(ofType(ev, 'bossSpawn')).toHaveLength(1)
    expect(ofType(ev, 'bossRoar')[0]!.ids).toEqual([gem.id, imp.id])
    expect(ofType(ev, 'split')).toEqual([])
    expect(e.state.monsters.map(m => m.kind)).toEqual(['boss'])
    expect(e.state.pickups.some(p => p.id === plusOne.id)).toBe(true)
    expect(e.state.hazards.map(h => h.id)).toEqual([sludge.id])
    // The walkers were dead before the march check: nothing breaches this turn.
    expect(ofType(ev, 'breach')).toEqual([])
  })

  it('a walker that marched past the line as the boss arrived dies in the roar — no breach', () => {
    const last = mon('slime', 0, ROWS - 1)
    const e = board({ monsters: [last], row: 9, nextBossRow: 10 })
    const ev = record(e)
    expect(pass(e)).toBe('aim')
    expect(ofType(ev, 'bossRoar')[0]!.ids).toEqual([last.id])
    expect(ofType(ev, 'breach')).toEqual([])
  })

  it('the FTUE’s scripted Slime Tower roars too', () => {
    const e = createEngine(defaultConfig({ seed: 1, ftue: true }))
    for (let k = 0; k < 8; k++) expect(pass(e)).toBe('aim')
    expect(e.state.row).toBe(9)
    const walkers = e.state.monsters.map(m => m.id)
    expect(walkers.length).toBeGreaterThan(0)
    const ev = record(e)
    expect(pass(e)).toBe('aim')
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    expect(boss.maxHp).toBe(bossHp(10, 10, false, true))
    expect(ofType(ev, 'bossRoar')[0]!.ids).toEqual(walkers)
    expect(e.state.monsters).toEqual([boss])
  })

  it('later bosses never roar — nor the row-20 boss of a checkpoint restart past row 10', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 8 }), 19, [1])
    const walkers = e.state.monsters.map(m => m.id)
    expect(walkers.length).toBeGreaterThan(0)
    const ev = record(e)
    pass(e)
    expect(ofType(ev, 'bossSpawn')).toHaveLength(1)
    expect(ofType(ev, 'bossRoar')).toEqual([])
    for (const id of walkers) expect(e.state.monsters.some(m => m.id === id)).toBe(true)
    // A walker still near the line after a later boss spawns is not cleared.
    expect(e.state.monsters.every(m => m.row + m.h <= ROWS)).toBe(true)
  })
})
