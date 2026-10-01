// Boss at 75 s (retention-roadmap #3): a fresh run's first boss arrives at
// row 5 sized to 2–3 volleys, replaces the row-10 one (next boss at row 20),
// every boss hit pays coin shards out of the bounty, and the early kill holds
// the HP clock a little longer. Returning players' boards are untouched.
import { describe, expect, it } from 'vitest'
import { createEngine, createEngineAtRow, firstBossRow } from '@/barrage/engine/engine'
import { trayPower } from '@/barrage/engine/balls'
import { bossBounty, defaultConfig } from '@/barrage/engine/economy'
import { BOSS_ADAPT, HP_CURVE, adaptiveBossHp } from '@/barrage/engine/monsters'
import { BOSS_EVERY, BOSS_SHARD_SHARE, FTUE_BOSS_CLOCK_HOLD, FTUE_BOSS_ROW, FTUE_BOSS_VOLLEYS } from '@/barrage/engine/types'
import { board, mon, ofType, record, turn } from './helpers'

describe('the early first boss', () => {
  it('arrives at row 5 on a fresh FTUE run — row 10 otherwise, and never in the Daily', () => {
    expect(createEngine(defaultConfig({ seed: 1, ftue: true })).state.nextBossRow).toBe(FTUE_BOSS_ROW)
    expect(createEngine(defaultConfig({ seed: 1, ftue: false })).state.nextBossRow).toBe(BOSS_EVERY)
    expect(firstBossRow(defaultConfig({ ftue: true, mode: 'daily' }), 1)).toBe(BOSS_EVERY)
    // The entrance restart (row 5, FTUE still on) meets it at once…
    expect(firstBossRow(defaultConfig({ ftue: true }), FTUE_BOSS_ROW)).toBe(FTUE_BOSS_ROW)
    // …a later checkpoint never does.
    expect(firstBossRow(defaultConfig({ ftue: false }), 11)).toBe(20)
  })

  it('is sized to 2–3 volleys of the tray it meets — a stacked tray included', () => {
    for (const tray of [[1, 1, 1], [2, 2, 1, 1, 1, 1], [6, 6, 6, 6, 6, 6]]) {
      const e = createEngineAtRow(defaultConfig({ seed: 3, ftue: true }), FTUE_BOSS_ROW, tray)
      const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
      expect(boss).toBeDefined()
      const power = trayPower(tray, 1)
      const hpb = BOSS_ADAPT.hitsPerBall // a fresh board's aim estimate
      expect(boss.maxHp).toBeGreaterThanOrEqual(adaptiveBossHp(0, power, hpb, FTUE_BOSS_VOLLEYS[0]))
      expect(boss.maxHp).toBeLessThanOrEqual(adaptiveBossHp(0, power, hpb, FTUE_BOSS_VOLLEYS[1]))
    }
  })

  it('replaces the row-10 boss: the next one is at row 20, and the clock holds longer', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 3, ftue: true }), FTUE_BOSS_ROW, [1])
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    boss.hp = 0.5
    const ev = record(e)
    turn(e, Math.PI / 2)
    // Whatever the straight shot hit, finish it off the same way a ball would.
    if (ofType(ev, 'bossDefeated').length === 0) {
      ;(e as unknown as { damage(m: unknown, d: number): boolean }).damage(boss, 1e9)
    }
    expect(ofType(ev, 'bossDefeated')).toHaveLength(1)
    expect(e.state.nextBossRow).toBe(2 * BOSS_EVERY)
    expect(e.state.config.ftue).toBe(false)
    expect(e.hpClock.hpHold).toBeGreaterThanOrEqual(Math.round(HP_CURVE.plateau) + FTUE_BOSS_CLOCK_HOLD - 1)
  })
})

describe('boss coin shards', () => {
  it('every hit pays its share; shards + chest = the whole bounty', () => {
    const boss = mon('boss', 2, 1, 40, { bossKind: 'worm', spawnRow: 20 })
    const e = board({ monsters: [boss], tray: [2, 2, 2] })
    const ev = record(e)
    for (let i = 0; i < 40 && ofType(ev, 'bossDefeated').length === 0; i++) turn(e, Math.PI / 2)
    const shards = ofType(ev, 'coins').filter(c => c.source === 'shard').map(c => c.amount)
    const chest = ofType(ev, 'bossDefeated')[0]!.bounty
    expect(shards.length).toBeGreaterThan(0)
    const paid = shards.reduce((a, b) => a + b, 0)
    expect(paid).toBeLessThanOrEqual(Math.floor(BOSS_SHARD_SHARE * bossBounty(20)))
    expect(paid + chest).toBe(bossBounty(20))
  })

  it('shards are whole coins and never paid twice for the same HP (snapshot carries them)', () => {
    const boss = mon('boss', 2, 1, 1000, { bossKind: 'worm', spawnRow: 20 })
    const e = board({ monsters: [boss], tray: [1] })
    const ev = record(e)
    turn(e, Math.PI / 2)
    const live = e.state.monsters.find(m => m.kind === 'boss')!
    const owed = Math.floor(BOSS_SHARD_SHARE * bossBounty(20) * (1 - live.hp / live.maxHp))
    const paid = ofType(ev, 'coins').filter(c => c.source === 'shard').reduce((a, c) => a + c.amount, 0)
    expect(paid).toBe(owed)
    expect(live.shards ?? 0).toBe(owed)
    expect(e.snapshot()!.monsters.find(m => m.kind === 'boss')!.shards ?? 0).toBe(owed)
  })
})
