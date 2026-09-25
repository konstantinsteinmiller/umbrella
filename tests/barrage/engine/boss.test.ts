import { describe, expect, it } from 'vitest'
import { createEngine, createEngineAtRow, restoreEngine } from '@/barrage/engine/engine'
import { DAILY_CONFIG, bossBounty, bossHpMultForDeaths, defaultConfig, killCoins } from '@/barrage/engine/economy'
import { BOSS_ADAPT, HP_CURVE, adaptiveBossHp, bossAimHpb, bossForRow, bossHp, monsterHp, THIRD_BOSS_ROAR, roarShare, roarVictims, roarsOnArrival, rowHp } from '@/barrage/engine/monsters'
import { trayPower } from '@/barrage/engine/balls'
import { Rng } from '@/barrage/engine/rng'
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
    // A later Slime Tower (the corrupted one of the second lap): the run's
    // first boss holds its minions until enraged (see below).
    const boss = mon('boss', 2, 2, 1e9, { bossKind: 'slime-tower', spawnRow: 70, corrupted: true })
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
    const boss = mon('boss', 2, 5, 1e9, { bossKind: 'slime-tower', spawnRow: 70, corrupted: true })
    const e = board({ monsters: [boss], tray: [1] })
    pass(e)
    expect(pass(e)).toBe('aim') // turn 2 → a spawn turn, tower now at rows 7–9
    expect(boss.row).toBe(7)
    expect(e.state.monsters.filter(m => m.kind === 'slime' && m.row >= 2)).toHaveLength(0)
  })

  it('the row-20 boss takes HP_CURVE.bossSecond × the clock row after its walkers', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 8 }), 19, [1])
    const clock = e.hpClock.hpRow
    turn(e, 0.3)
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    expect(boss.spawnRow).toBe(20)
    expect(boss.maxHp).toBe(bossHp(clock + 1, 20, false))
    expect(boss.maxHp).toBe(Math.round(HP_CURVE.bossSecond * rowHp(clock + 1)))
  })

  it('the row-30 boss takes HP_CURVE.bossThird, the row-40 one HP_CURVE.bossLater', () => {
    for (const [start, mult] of [[29, HP_CURVE.bossThird], [39, HP_CURVE.bossLater]] as const) {
      const e = createEngineAtRow(defaultConfig({ seed: 8 }), start, [1])
      const clock = e.hpClock.hpRow
      turn(e, 0.3)
      const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
      expect(boss.spawnRow).toBe(start + 1)
      expect(boss.maxHp).toBe(bossHp(clock + 1, start + 1, false))
      expect(boss.maxHp).toBe(Math.round(mult * rowHp(clock + 1)))
    }
  })

  it('boss mercy (config.bossHpMult) spawns it with that share of its HP; walkers untouched', () => {
    const full = createEngineAtRow(defaultConfig({ seed: 8 }), 19, [1])
    const soft = createEngineAtRow(defaultConfig({ seed: 8, bossHpMult: 0.75 }), 19, [1])
    const clock = soft.hpClock.hpRow
    turn(full, 0.3)
    turn(soft, 0.3)
    const bossOf = (e: typeof full) => e.state.monsters.find(m => m.id === e.state.bossId)!
    expect(bossOf(soft).maxHp).toBe(Math.round(bossHp(clock + 1, 20, false) * 0.75))
    expect(bossOf(soft).hp).toBe(bossOf(soft).maxHp)
    expect(bossOf(full).maxHp).toBe(bossHp(clock + 1, 20, false))
    // Marked for the HUD (the cracked-off chunk), and it rides the snapshot.
    expect(bossOf(soft).mercy).toBe(0.75)
    expect(bossOf(full).mercy).toBeUndefined()
    const walkerHp = (e: typeof full) => e.state.monsters.filter(m => m.kind !== 'boss').map(m => m.maxHp)
    expect(walkerHp(soft)).toEqual(walkerHp(full))
  })

  it('bossHpMultForDeaths: 1, 0.75, then 0.5 for good', () => {
    expect([0, 1, 2, 3, 9].map(bossHpMultForDeaths)).toEqual([1, 0.75, 0.5, 0.5, 0.5])
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

// Playtest run 4: a tester's first two volleys at the first boss went into the
// minion the Slime Tower had dropped beside itself (10 → 3 HP) while the boss
// bar sat at 57. The run's FIRST boss holds its minions until it is enraged.
describe('the first boss holds its minions until enraged', () => {
  const minions = (e: ReturnType<typeof board>) => e.state.monsters.filter(m => m.kind === 'slime')

  it('a first Slime Tower (spawn row < 20) that is not enraged drops no minion', () => {
    const boss = mon('boss', 2, 0, 1e9, { bossKind: 'slime-tower', spawnRow: 10 })
    const e = board({ monsters: [boss], tray: [1], row: 10, nextBossRow: 20 })
    const ev = record(e)
    for (let k = 0; k < 4; k++) expect(pass(e)).toBe('aim') // turns 2 and 4 are spawn turns
    expect(ofType(ev, 'monsterSpawn').filter(s => s.kind === 'slime')).toEqual([])
    expect(minions(e)).toEqual([])
  })

  it('once enraged it drops them like any Slime Tower', () => {
    const boss = mon('boss', 2, 0, 1000, { bossKind: 'slime-tower', spawnRow: 10, hp: 250, enraged: true })
    const e = board({ monsters: [boss], tray: [1], row: 10, nextBossRow: 20 })
    pass(e) // turn 1
    pass(e) // turn 2 → spawn
    const beside = minions(e).filter(m => (m.col === 1 || m.col === 5) && m.row === boss.row)
    expect(beside).toHaveLength(1)
  })

  it('the hit that enrages it starts the minions', () => {
    const boss = mon('boss', 2, 0, 1000, { bossKind: 'slime-tower', spawnRow: 10, hp: 301 })
    const e = board({ monsters: [boss], tray: [2, 2, 2, 2], row: 10, nextBossRow: 20 })
    pass(e) // turn 1: no spawn turn
    expect(boss.enraged).toBe(false)
    turn(e, Math.PI / 2) // turn 2: the hits enrage it before the advance
    expect(boss.enraged).toBe(true)
    expect(minions(e).length).toBe(1)
  })

  it('a real row-10 Slime Tower fight shows only the boss (calm rows, no minions) until enraged', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 5 }), 9, [1])
    expect(pass(e)).toBe('aim') // row 10: the Slime Tower roars the stage clear
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    expect(boss.bossKind).toBe('slime-tower')
    for (let k = 0; k < 5; k++) {
      expect(pass(e)).toBe('aim')
      expect(e.state.monsters).toEqual([boss])
    }
  })

  it('still makes the side draw of every spawn turn — the RNG stream is the pre-hold one', () => {
    // Daily fairness: the hold must not shift the seed's stream (crits, rolls).
    // Calm rows, no hits, no chest: the only draws are the two side draws.
    const e = board({ monsters: [mon('boss', 2, 0, 1e9, { bossKind: 'slime-tower', spawnRow: 10 })], row: 10, nextBossRow: 20 })
    const start = e.snapshot()!.rng
    for (let k = 0; k < 4; k++) pass(e)
    expect(minions(e)).toEqual([])
    const expected = new Rng(start)
    expected.chance(0.5)
    expected.chance(0.5)
    expect(e.snapshot()!.rng).toBe(expected.state)
  })

  it('same seed + same angles ⇒ the same first-boss fight', () => {
    const play = () => {
      const e = createEngineAtRow(defaultConfig({ seed: 11, trayCapacity: 6, damageMult: 3 }), 9, [3, 2, 2, 1])
      const ev = record(e)
      for (const a of [1.3, 2.0, 0.8, 1.6, 2.4, 1.1, 1.9, 0.6]) {
        if (e.state.phase === 'breach') break
        turn(e, a)
      }
      return JSON.stringify(ev)
    }
    expect(play()).toBe(play())
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

  it('run 7: the endless run\'s SECOND boss (rows 20–29) roars the board clear too — a checkpoint restart included', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 8 }), 19, [1])
    const walkers = e.state.monsters.map(m => m.id)
    expect(walkers.length).toBeGreaterThan(0)
    const ev = record(e)
    pass(e)
    expect(ofType(ev, 'bossSpawn')).toHaveLength(1)
    expect(ofType(ev, 'bossRoar')[0]!.ids).toEqual(walkers)
    // The swarm is gone; only the boss row's light escort stands, in the top row.
    for (const id of walkers) expect(e.state.monsters.some(m => m.id === id)).toBe(false)
    expect(e.state.monsters.filter(m => m.kind !== 'boss').every(m => m.row === 0)).toBe(true)
  })

  it('after run 11: the endless THIRD boss roars away a third of the walkers — lanes beside it, bottom first', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 8 }), 29, [1])
    const walkers = e.state.monsters.map(m => ({ id: m.id, col: m.col, row: m.row, w: m.w, h: m.h }))
    expect(walkers.length).toBeGreaterThanOrEqual(3)
    const ev = record(e)
    pass(e)
    expect(ofType(ev, 'bossSpawn')).toHaveLength(1)
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    const roar = ofType(ev, 'bossRoar')
    expect(roar).toHaveLength(1)
    // Exactly the lane pick on the board the boss met (the march comes after the roar).
    expect(roar[0]!.ids).toEqual(roarVictims(walkers, boss, THIRD_BOSS_ROAR).map(m => m.id))
    expect(roar[0]!.ids).toHaveLength(Math.round(walkers.length / 3))
    for (const id of roar[0]!.ids) expect(e.state.monsters.some(m => m.id === id)).toBe(false)
    // The other two thirds stand.
    const kept = walkers.filter(w => !roar[0]!.ids.includes(w.id))
    for (const w of kept) expect(e.state.monsters.some(m => m.id === w.id)).toBe(true)
  })

  it('the fourth boss and later never roar, nor any Daily boss past the first', () => {
    for (const cfg of [defaultConfig({ seed: 8 }), defaultConfig({ seed: 8, mode: 'daily' })]) {
      const at = cfg.mode === 'daily' ? 19 : 39
      const e = createEngineAtRow(cfg, at, [1])
      const walkers = e.state.monsters.map(m => m.id)
      expect(walkers.length).toBeGreaterThan(0)
      const ev = record(e)
      pass(e)
      expect(ofType(ev, 'bossSpawn')).toHaveLength(1)
      expect(ofType(ev, 'bossRoar')).toEqual([])
      for (const id of walkers) expect(e.state.monsters.some(m => m.id === id)).toBe(true)
    }
  })

  it('roarShare: all of it for rows 10–29, a third for 30–39 (endless), nothing later; the first boss only on the Daily board', () => {
    expect(roarShare(10, false)).toBe(1)
    expect(roarShare(23, false)).toBe(1)
    expect(roarShare(30, false)).toBe(THIRD_BOSS_ROAR)
    expect(roarShare(39, false)).toBe(THIRD_BOSS_ROAR)
    expect(roarShare(40, false)).toBe(0)
    expect(roarShare(10, true)).toBe(1)
    expect(roarShare(20, true)).toBe(0)
    expect(roarShare(30, true)).toBe(0)
    expect(roarsOnArrival(30, false)).toBe(true)
    expect(roarsOnArrival(40, false)).toBe(false)
  })

  it('roarVictims: lane by lane beside the boss (left, right, further out, its own columns last), each from the bottom up', () => {
    const w = (id: number, col: number, row: number, cw = 1) => ({ id, col, row, w: cw, h: 1 })
    // Boss on columns 2–4: lanes 1, 5, 0, 6, then 2, 3, 4.
    const board = [
      w(1, 1, 2), w(2, 1, 5), w(3, 5, 4), w(4, 0, 6), w(5, 3, 7), w(6, 6, 1),
      w(7, 2, 3), w(8, 4, 6), w(9, 0, 1)
    ]
    const boss = { col: 2, w: 3 }
    // 9 walkers → 3: lane 1 bottom-up (ids 2, 1), then lane 5 (id 3). Board order kept.
    expect(roarVictims(board, boss, 1 / 3).map(m => m.id)).toEqual([1, 2, 3])
    expect(roarVictims(board, boss, 1).map(m => m.id)).toEqual(board.map(m => m.id))
    expect(roarVictims(board, boss, 0)).toEqual([])
    // A two-wide monster counts for its best lane.
    const wide = [w(1, 0, 8, 2), w(2, 6, 9), w(3, 3, 9)]
    expect(roarVictims(wide, boss, 1 / 3).map(m => m.id)).toEqual([1])
  })
})

// Playtest run 8: an 8-ball tray one-shot the 73-HP Slime Tower ("completely
// anticlimactic"). A boss is floored at a few volleys of the tray it meets.
describe('adaptive boss HP', () => {
  it('the floor: volleys × hits per ball × the tray\'s power — never below the curve', () => {
    expect(adaptiveBossHp(500, 1)).toBe(500)
    expect(adaptiveBossHp(10, 10)).toBe(Math.round(BOSS_ADAPT.volleys * BOSS_ADAPT.hitsPerBall * 10))
    expect(adaptiveBossHp(10, 10, 1.5, 5)).toBe(75)
    expect(adaptiveBossHp(80, Number.NaN)).toBe(80)
    expect(adaptiveBossHp(80, 0)).toBe(80)
    expect(adaptiveBossHp(80, 10, 0)).toBe(80)
  })

  it('run 9: the hits per ball the floor assumes come from the player\'s own aim, clamped', () => {
    // Nothing measured: the old assumption.
    expect(bossAimHpb(-1, -1)).toBe(BOSS_ADAPT.hitsPerBall)
    // Walkers only (before the first boss): scaled to a boss's bigger target.
    expect(bossAimHpb(2, -1)).toBeCloseTo(2 * BOSS_ADAPT.walkerToBoss)
    // A boss fought: its own measure wins.
    expect(bossAimHpb(3, 1.4)).toBeCloseTo(1.4)
    // Clamped both ways — a tapper's 0.2 and a lucky 9.
    expect(bossAimHpb(-1, 0.2)).toBe(BOSS_ADAPT.minHpb)
    expect(bossAimHpb(-1, 9)).toBe(BOSS_ADAPT.maxHpb)
  })

  it('the engine measures aim: damage per volley in units of the tray\'s power, walkers and bosses apart', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 8 }), 3, [2, 1])
    expect(e.aimView).toEqual({ walker: -1, boss: -1 })
    turn(e, 0.3)
    turn(e, 0.3)
    expect(e.aimView.walker).toBeGreaterThan(0)
    expect(e.aimView.boss).toBe(-1)
    // It rides the snapshot (a reload keeps the boss the player has earned).
    const back = restoreEngine(e.snapshot()!)
    expect(back.aimView).toEqual(e.aimView)
  })

  it('a stacked tray meets a first boss sized to its tray and its aim; a lone ball meets the curve', () => {
    const tray = [3, 3, 2, 2, 2, 1, 1, 1]
    // A player whose balls land ~2.5 balls' worth of damage per volley.
    const strong = restoreEngine({ ...createEngineAtRow(defaultConfig({ seed: 8, damageMult: 1.95, trayCapacity: 8 }), 9, tray).snapshot()!, aim: { walker: 2.5, boss: -1 } })
    // The floor as the engine sees it the moment the boss spawns.
    let floor = 0
    strong.on(ev => {
      if (ev.type !== 'bossSpawn') return
      const aim = strong.aimView
      floor = Math.round(BOSS_ADAPT.firstVolleys * bossAimHpb(aim.walker, aim.boss) * trayPower(strong.state.tray, 1.95))
    })
    pass(strong)
    const big = strong.state.monsters.find(m => m.id === strong.state.bossId)!
    expect(floor).toBeGreaterThan(0)
    expect(big.maxHp).toBeGreaterThanOrEqual(floor)
    expect(big.maxHp).toBeGreaterThan(bossHp(10, 10, false))
    const weak = createEngineAtRow(defaultConfig({ seed: 8 }), 9, [1])
    const clock = weak.hpClock.hpRow
    pass(weak)
    const small = weak.state.monsters.find(m => m.id === weak.state.bossId)!
    expect(small.maxHp).toBe(bossHp(clock + 1, 10, false))
    expect(small.maxHp).toBeLessThan(big.maxHp)
  })

  it('a weak aim meets a smaller boss than a strong one with the same tray (run 9: the tapper)', () => {
    const tray = [3, 3, 2, 2, 2, 1, 1, 1]
    const base = createEngineAtRow(defaultConfig({ seed: 8, damageMult: 1.95, trayCapacity: 8 }), 9, tray)
    const snap = base.snapshot()!
    const bossHpWith = (walker: number): number => {
      const e = restoreEngine({ ...snap, aim: { walker, boss: -1 } })
      turn(e, 0.3)
      return e.state.monsters.find(m => m.id === e.state.bossId)!.maxHp
    }
    expect(bossHpWith(0.6)).toBeLessThan(bossHpWith(3))
  })

  it('run 9: a retry never meets a stronger boss than the one that won (config.bossHpCap, mercy on top)', () => {
    const tray = [3, 3, 2, 2, 2, 1, 1, 1]
    const cfg = { seed: 8, damageMult: 1.95, trayCapacity: 8 }
    const free = createEngineAtRow(defaultConfig(cfg), 9, tray)
    pass(free)
    const uncapped = free.state.monsters.find(m => m.id === free.state.bossId)!.maxHp
    const cap = Math.round(uncapped * 0.6)
    const capped = createEngineAtRow(defaultConfig({ ...cfg, bossHpCap: cap }), 9, tray)
    pass(capped)
    expect(capped.state.monsters.find(m => m.id === capped.state.bossId)!.maxHp).toBe(cap)
    const soft = createEngineAtRow(defaultConfig({ ...cfg, bossHpCap: cap, bossHpMult: 0.75 }), 9, tray)
    pass(soft)
    expect(soft.state.monsters.find(m => m.id === soft.state.bossId)!.maxHp).toBe(Math.round(cap * 0.75))
    // A cap above the boss changes nothing.
    const loose = createEngineAtRow(defaultConfig({ ...cfg, bossHpCap: uncapped * 10 }), 9, tray)
    pass(loose)
    expect(loose.state.monsters.find(m => m.id === loose.state.bossId)!.maxHp).toBe(uncapped)
  })

  it('the Daily board keeps the curve (its kit is fixed)', () => {
    const e = createEngineAtRow(defaultConfig({ ...DAILY_CONFIG, mode: 'daily', seed: 8, ftue: false }), 9, [3, 3, 2, 2, 2, 1, 1, 1])
    pass(e)
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    expect(boss.maxHp).toBe(bossHp(10, 10, false, false, 0, true))
  })
})
