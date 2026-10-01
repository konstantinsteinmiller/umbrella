// Playtest run 2 fixes in the engine:
//  • a boss's death blast clears the bottom two rows and its turn skips the
//    march — one tester got the boss chest and OVERRUN in the same turn;
//  • the FIRST boss comes alone: while it lives new rows carry only their "+1"
//    (grunt rows piled ~17 monsters in front of it; no shot reached it);
//  • `config.assist` — the safety net for a player who has not bought upgrades:
//    softer rows (and bosses), read at spawn time only.
// Playtest run 3 ("no cliffs"):
//  • the safety net fades instead of switching — per paid level
//    (`assistForPaidLevels`) and over clock rows (`ASSIST.fadeFrom → fadeTo`);
//  • the HP clock: boss rows, the first boss's fight, the first rows of a later
//    fight and the post-boss plateau hold monster HP (see monsters.ts).
import { describe, expect, it } from 'vitest'
import { createEngine, createEngineAtRow, restoreEngine, type BarrageEngine } from '@/barrage/engine/engine'
import { ASSIST_PAID, DAILY_CONFIG, assistForPaidLevels, defaultConfig, killCoins } from '@/barrage/engine/economy'
import {
  ASSIST, ASSIST_HP_CUT, FTUE_HP_CAP, FTUE_HP_ROWS, HP_CURVE, assistHpMult, bossHp, bossHpFactor, hpClockAt, isFirstBoss, monsterHp, planRow, rowHp, walkerLift
} from '@/barrage/engine/monsters'
import { BOSS_EVERY, ROWS } from '@/barrage/engine/types'
import { board, mon, ofType, pass, pick, record, turn } from './helpers'

const UP = Math.PI / 2

describe('boss death blast', () => {
  it('a boss killed while a grunt sits in the last row: the grunt dies in the blast, nothing marches, no breach', () => {
    // Straight up from x 3.5 hits the worm's underside (cols 2–4); the grunts
    // stand off that line so only the blast can reach them. (A later boss: the
    // FIRST boss's quiet turn brings the next row in — see below.)
    const boss = mon('boss', 2, 1, 3, { bossKind: 'worm', spawnRow: 20 })
    const last = mon('slime', 0, ROWS - 1)
    const second = mon('goblin', 6, ROWS - 2)
    const safe = mon('slime', 5, ROWS - 3)
    const e = board({ monsters: [boss, last, second, safe], tray: [2, 2], row: 11, nextBossRow: 20 })
    const ev = record(e)
    expect(turn(e, UP)).toBe('aim')

    expect(ofType(ev, 'bossDefeated')).toHaveLength(1)
    expect(ofType(ev, 'breach')).toEqual([])
    const blast = ofType(ev, 'bossBlast')
    expect(blast).toHaveLength(1)
    expect(blast[0]!.monsterId).toBe(boss.id)
    expect(blast[0]!.rows).toBe(2)
    expect([...blast[0]!.ids].sort()).toEqual([last.id, second.id].sort())
    // bossDefeated → bossBlast → the blasted kills, each paying normal kill coins.
    const order = ev.map(x => x.type)
    expect(order.indexOf('bossBlast')).toBe(order.indexOf('bossDefeated') + 1)
    const kills = ofType(ev, 'kill').filter(k => k.kind !== 'boss')
    expect(kills.map(k => k.monsterId).sort()).toEqual([last.id, second.id].sort())
    const killCoinEvents = ofType(ev, 'coins').filter(c => c.source === 'kill')
    expect(killCoinEvents.map(c => c.amount)).toEqual([killCoins(5, 'slime', false), killCoins(5, 'goblin', false)])
    // The relief beat: the turn's advance moved nothing and spawned nothing.
    expect(e.state.monsters).toEqual([safe])
    expect(safe.row).toBe(ROWS - 3)
    expect(e.state.row).toBe(11)
    expect(ofType(ev, 'march')).toEqual([])
    expect(ofType(ev, 'rowSpawned')).toEqual([])
    // …and the next turn marches as usual.
    pass(e)
    expect(safe.row).toBe(ROWS - 2)
    expect(e.state.row).toBe(12)
  })

  it('a boss burned to death at the resolve tick also skips that turn\'s march', () => {
    const boss = mon('boss', 2, 4, 1, { bossKind: 'worm', spawnRow: 20, burnDmg: 5, burnTurns: 1 })
    const grunt = mon('slime', 0, ROWS - 1)
    const e = board({ monsters: [boss, grunt], tray: [1], row: 21, nextBossRow: 30 })
    const ev = record(e)
    expect(pass(e)).toBe('aim')
    expect(ofType(ev, 'bossDefeated')).toHaveLength(1)
    expect(ofType(ev, 'breach')).toEqual([])
    expect(ofType(ev, 'rowSpawned')).toEqual([])
    expect(e.state.monsters).toEqual([])
  })

  it('the blast goes through a gem shield and never splits an imp into the cleared rows', () => {
    const boss = mon('boss', 2, 1, 3, { bossKind: 'troll', spawnRow: 50 })
    const gem = mon('carbuncle', 0, ROWS - 1, 1e9, { shield: true })
    const imp = mon('imp', 6, ROWS - 2, 50)
    const e = board({ monsters: [boss, gem, imp], tray: [2, 2], row: 51, nextBossRow: 60 })
    const ev = record(e)
    expect(turn(e, UP)).toBe('aim')
    expect(ofType(ev, 'split')).toEqual([])
    expect(e.state.monsters).toEqual([])
  })

  it('a board with nothing near the line still gets the blast event (for the VFX) and the quiet turn', () => {
    const boss = mon('boss', 2, 1, 3, { bossKind: 'troll', spawnRow: 50 })
    const e = board({ monsters: [boss], tray: [2, 2], row: 51, nextBossRow: 60 })
    const ev = record(e)
    turn(e, UP)
    expect(ofType(ev, 'bossBlast')).toEqual([{ type: 'bossBlast', monsterId: boss.id, rows: 2, ids: [], x: 3.5, y: 2.5 }])
    expect(e.state.row).toBe(51)
    expect(e.snapshot()!.quietSpawn).toBeUndefined()
  })
})

// Playtest run 5: the first boss's fight is calm (its rows carry only "+1"s),
// its roar cleared the walkers, and the kill's quiet turn spawned nothing — the
// board sat EMPTY for the next aim ("I kept firing balls into nothing"). Its
// quiet turn now brings the next row in place: nothing marches, so no breach.
describe('the first boss kill never leaves an empty board', () => {
  const firstBossBoard = (): { e: BarrageEngine; boss: ReturnType<typeof mon>; minion: ReturnType<typeof mon>; low: ReturnType<typeof mon> } => {
    const boss = mon('boss', 2, 1, 3, { bossKind: 'slime-tower', spawnRow: 10 })
    // An enraged tower's minion up top, and one in the last row (the blast's).
    const minion = mon('slime', 0, 4, 1e9, { spawnRow: 12 })
    const low = mon('slime', 6, ROWS - 1, 1e9, { spawnRow: 11 })
    const plus = pick('ball', 6, 0)
    const e = board({ monsters: [boss, minion, low], pickups: [plus], tray: [2, 2], row: 13, nextBossRow: 20, config: { seed: 9 } })
    return { e, boss, minion, low }
  }

  it('the quiet turn spawns the next row at row 0 — nothing marches, no breach', () => {
    const { e, minion } = firstBossBoard()
    const ev = record(e)
    expect(turn(e, UP)).toBe('aim')
    expect(ofType(ev, 'bossDefeated')).toHaveLength(1)
    expect(ofType(ev, 'breach')).toEqual([])
    expect(ofType(ev, 'march')).toEqual([])
    expect(ofType(ev, 'rowSpawned')).toEqual([{ type: 'rowSpawned', row: 14, boss: false }])
    expect(e.state.row).toBe(14)
    // Nothing moved: the minion and the last calm row's "+1" stay put.
    expect(minion.row).toBe(4)
    expect(e.state.pickups.some(p => p.kind === 'ball' && p.col === 6 && p.row === 0)).toBe(true)
    // The new walkers stand in row 0 (never in the "+1"'s cell), at the post-boss
    // plateau's clock (the boss's own: the typical clock of this board).
    const fresh = e.state.monsters.filter(m => m.spawnRow === 14)
    expect(fresh.length).toBeGreaterThanOrEqual(2)
    for (const m of fresh) {
      expect(m.row).toBe(0)
      expect(m.col === 6).toBe(false)
      expect(m.maxHp).toBe(monsterHp(e.hpClock.hpRow, m.kind, m.corrupted))
    }
    expect(e.hpClock.hpHold).toBe(HP_CURVE.plateau - 1)
    // …and the next turn marches as usual and brings the row after it.
    const before = fresh.map(m => m.row)
    pass(e)
    expect(fresh.map(m => m.row)).toEqual(before.map(r => r + 1))
    expect(e.state.row).toBe(15)
  })

  it('a first boss finished by a breach clear (revive continue, shield) brings the row in as the aim begins', () => {
    // Enraged at 10/100 HP with its feet on the line: the coming march breaches,
    // and the clear's 25% bite kills it.
    const onLine = (): ReturnType<typeof mon> =>
      mon('boss', 2, 7, 10, { maxHp: 100, enraged: true, bossKind: 'slime-tower', spawnRow: 10 })

    const r = board({ monsters: [onLine()], tray: [1], row: 14, nextBossRow: 20, revives: 1, config: { seed: 9 } })
    const evR = record(r)
    expect(pass(r)).toBe('breach')
    expect(r.state.row).toBe(15) // the fight's calm row: only its "+1"
    expect(r.continueAfterBreach('revive')).toBe(true)
    expect(r.state.phase).toBe('aim')
    expect(ofType(evR, 'bossDefeated')).toHaveLength(1)
    const order = evR.map(x => x.type)
    expect(order.lastIndexOf('rowSpawned')).toBeGreaterThan(order.indexOf('continued'))
    expect(ofType(evR, 'march')).toHaveLength(1) // the breaching march only
    expect(r.state.row).toBe(16)
    expect(r.state.monsters.filter(m => m.spawnRow === 16 && m.row === 0).length).toBeGreaterThanOrEqual(2)
    expect(r.snapshot()!.quietSpawn).toBeUndefined()

    const s = board({ monsters: [onLine()], tray: [1], row: 14, nextBossRow: 20, shields: 1, config: { seed: 9 } })
    const evS = record(s)
    expect(pass(s)).toBe('aim')
    expect(ofType(evS, 'shieldBlock')).toHaveLength(1)
    expect(ofType(evS, 'bossDefeated')).toHaveLength(1)
    expect(ofType(evS, 'rowSpawned').map(x => x.row)).toEqual([15, 16])
    expect(s.state.monsters.filter(m => m.spawnRow === 16 && m.row === 0).length).toBeGreaterThanOrEqual(2)
    // …and later turns are ordinary: one march, one row.
    const evN = record(s)
    pass(s)
    expect(ofType(evN, 'march')).toHaveLength(1)
    expect(ofType(evN, 'rowSpawned').map(x => x.row)).toEqual([17])
  })

  it('only after the FIRST boss: a later boss keeps the empty quiet turn', () => {
    const boss = mon('boss', 2, 1, 3, { bossKind: 'worm', spawnRow: 20 })
    const e = board({ monsters: [boss], tray: [2, 2], row: 23, nextBossRow: 30, config: { seed: 9 } })
    const ev = record(e)
    turn(e, UP)
    expect(ofType(ev, 'bossDefeated')).toHaveLength(1)
    expect(ofType(ev, 'rowSpawned')).toEqual([])
    expect(e.state.row).toBe(23)
  })

  it('snapshot-safe: a quiet turn armed while aiming survives a save, and never draws from the engine RNG', () => {
    const { e } = firstBossBoard()
    const snap = e.snapshot()!
    // A boss that died in the aim phase (a tapped chest's skill) arms the quiet
    // turn before the save: the restored run plays it the same way.
    const armed = restoreEngine(JSON.parse(JSON.stringify({ ...snap, skipMarch: true, quietSpawn: true })))
    expect(armed.snapshot()!.quietSpawn).toBe(true)
    const plain = restoreEngine(JSON.parse(JSON.stringify({ ...snap, skipMarch: true })))
    const evA = record(armed)
    const evP = record(plain)
    pass(armed)
    pass(plain)
    expect(ofType(evA, 'march')).toEqual([])
    expect(ofType(evA, 'rowSpawned')).toEqual([{ type: 'rowSpawned', row: 14, boss: false }])
    expect(ofType(evP, 'rowSpawned')).toEqual([])
    expect(armed.snapshot()!.rng).toBe(plain.snapshot()!.rng)
    expect(armed.snapshot()!.quietSpawn).toBeUndefined()
    // quietSpawn without skipMarch means nothing.
    const stray = restoreEngine(JSON.parse(JSON.stringify({ ...snap, quietSpawn: true })))
    expect(stray.snapshot()!.quietSpawn).toBeUndefined()
  })
})

describe('the first boss comes alone', () => {
  it('isFirstBoss: the row-10 boss (or a postponed one), never a later or second-lap one', () => {
    expect(isFirstBoss({ kind: 'boss', spawnRow: 10 }, 99)).toBe(true)
    expect(isFirstBoss({ kind: 'boss', spawnRow: 12 }, 99)).toBe(true)
    expect(isFirstBoss({ kind: 'boss', spawnRow: 20 }, 1)).toBe(false)
    expect(isFirstBoss({ kind: 'boss', spawnRow: 70 }, 1)).toBe(false)
    expect(isFirstBoss({ kind: 'slime', spawnRow: 10 }, 10)).toBe(false)
  })

  it('a calm row plan has its "+1" and nothing else, even at full pickup luck', () => {
    const blocked = (): boolean => false
    for (let row = 11; row < 20; row++) {
      const plan = planRow(4, row, { bossAlive: true, pickupLuck: 1, ftue: false, blocked, calm: true })
      expect(plan.monsters).toEqual([])
      expect(plan.ballCol).not.toBeNull()
      expect(plan.coinCol).toBeNull()
      expect(plan.skillCol).toBeNull()
    }
  })

  it('while the row-10 boss lives, every new row brings no walker — only its "+1"', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 5, pickupLuck: 1 }), 9, [1])
    expect(pass(e)).toBe('aim')
    expect(e.state.bossId).not.toBeNull()
    for (let k = 0; k < 5; k++) {
      pass(e)
      const row = e.state.row
      // Slime Tower minions (its one rule) carry the previous row number.
      expect(e.state.monsters.filter(m => m.kind !== 'boss' && m.spawnRow === row)).toEqual([])
      expect(e.state.pickups.filter(p => p.row === 0).map(p => p.kind)).toEqual(['ball'])
    }
  })

  it('once it dies, rows fill up again; a later boss keeps the sparse (1–3) rows', () => {
    const boss = mon('boss', 2, 1, 3, { bossKind: 'slime-tower', spawnRow: 10 })
    const e = board({ monsters: [boss], tray: [2, 2], row: 11, nextBossRow: 20, config: { seed: 9 } })
    pass(e)
    expect(e.state.monsters.filter(m => m.spawnRow === 12)).toEqual([])
    turn(e, UP) // kills it (quiet turn)
    expect(e.state.bossId).toBeNull()
    pass(e)
    expect(e.state.monsters.filter(m => m.spawnRow === 13).length).toBeGreaterThanOrEqual(2)

    const worm = mon('boss', 2, 1, 1e9, { bossKind: 'worm', spawnRow: 20 })
    const w = board({ monsters: [worm], tray: [1], row: 21, nextBossRow: 30, config: { seed: 9 } })
    for (let k = 0; k < 4; k++) {
      pass(w)
      const n = w.state.monsters.filter(m => m.spawnRow === w.state.row).length
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(3)
    }
  })
})

describe('assist (safety net for non-upgraders)', () => {
  it('cuts HP by ASSIST_HP_CUT at full assist, bosses included, fading out over clock rows', () => {
    expect(ASSIST_HP_CUT).toBe(0.2)
    expect(assistHpMult(15, 1)).toBeCloseTo(0.8)
    expect(assistHpMult(15, 0)).toBe(1)
    expect(assistHpMult(15, undefined)).toBe(1)
    expect(assistHpMult(15, 0.5)).toBeCloseTo(0.9)
    expect(assistHpMult(ASSIST.fadeFrom, 1)).toBeCloseTo(0.8)
    expect(assistHpMult((ASSIST.fadeFrom + ASSIST.fadeTo) / 2, 1)).toBeCloseTo(0.9)
    expect(assistHpMult(ASSIST.fadeTo, 1)).toBe(1)
    expect(assistHpMult(ASSIST.fadeTo + 20, 1)).toBe(1)
    // Endless walkers carry the early-challenge lift on top (walkerLift).
    expect(monsterHp(15, 'slime', false, false, 1)).toBe(Math.round(rowHp(15) * 0.8 * walkerLift(15)))
    expect(monsterHp(15, 'ogre', false, false, 1)).toBe(Math.round(rowHp(15) * 2 * 0.8 * walkerLift(15)))
    expect(monsterHp(ASSIST.fadeTo, 'slime', false, false, 1)).toBe(monsterHp(ASSIST.fadeTo, 'slime', false))
    // The first boss, scripted (FTUE) or not.
    expect(monsterHp(10, 'boss', false, false, 1)).toBe(Math.round(rowHp(10) * HP_CURVE.boss * 0.8))
    expect(monsterHp(10, 'boss', false, true, 1)).toBe(Math.round(rowHp(10) * HP_CURVE.boss * HP_CURVE.ftueBoss * 0.8))
  })

  it('no dead stop: over the rows the cut changes by at most cut / fade span per row', () => {
    const step = ASSIST.cut / (ASSIST.fadeTo - ASSIST.fadeFrom) + 1e-9
    for (let r = 1; r < ASSIST.fadeTo + 5; r++) {
      const d = assistHpMult(r + 1, 1) - assistHpMult(r, 1)
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(step)
    }
  })

  it('assistForPaidLevels: full below ASSIST_PAID.fullBelow paid levels, then a small step down per level to 0', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 40].map(assistForPaidLevels)).toEqual([1, 1, 0.75, 0.5, 0.25, 0, 0, 0])
    expect(ASSIST_PAID.fullBelow).toBe(2)
    for (let p = 0; p < 10; p++) {
      const d = assistForPaidLevels(p) - assistForPaidLevels(p + 1)
      expect(d).toBeGreaterThanOrEqual(0)
      // One purchase moves monster HP by at most a quarter of the cut (5%).
      expect(d * ASSIST_HP_CUT).toBeLessThanOrEqual(0.05 + 1e-9)
    }
    expect(assistForPaidLevels(Number.NaN)).toBe(1)
    expect(assistForPaidLevels(-3)).toBe(1)
  })

  it('softens rows only while flagged: switching it off leaves the monsters on the board as they spawned', () => {
    const cfg = defaultConfig({ seed: 3, assist: 1 })
    const e = createEngineAtRow(cfg, 14, [1])
    const clock = e.hpClock.hpRow
    expect(clock).toBe(hpClockAt(14).clock)
    const soft = e.state.monsters.map(m => ({ id: m.id, hp: m.maxHp }))
    expect(soft.length).toBeGreaterThan(0)
    for (const m of e.state.monsters) expect(m.maxHp).toBe(monsterHp(clock, m.kind, m.corrupted, false, 1))
    e.setConfig({ assist: 0 })
    pass(e)
    for (const s of soft) expect(e.state.monsters.find(m => m.id === s.id)?.maxHp).toBe(s.hp)
    const fresh = e.state.monsters.filter(m => m.spawnRow === 15)
    expect(fresh.length).toBeGreaterThan(0)
    for (const m of fresh) expect(m.maxHp).toBe(monsterHp(e.hpClock.hpRow, m.kind, m.corrupted))
  })

  it('the first boss spawns softer under assist', () => {
    const on = createEngineAtRow(defaultConfig({ seed: 8, assist: 1 }), 9, [1])
    const off = createEngineAtRow(defaultConfig({ seed: 8 }), 9, [1])
    pass(on)
    pass(off)
    const hp = (e: typeof on): number => e.state.monsters.find(m => m.id === e.state.bossId)!.maxHp
    expect(hp(on)).toBe(monsterHp(10, 'boss', false, false, 1))
    expect(hp(off)).toBe(monsterHp(10, 'boss', false))
    expect(hp(on)).toBeLessThan(hp(off))
  })

  it('never touches the RNG: the same seed lays out the same board, only HP differs', () => {
    const a = createEngineAtRow(defaultConfig({ seed: 11, assist: 1 }), 12, [1])
    const b = createEngineAtRow(defaultConfig({ seed: 11 }), 12, [1])
    for (let k = 0; k < 4; k++) { pass(a); pass(b) }
    const layout = (e: typeof a): string[] => e.state.monsters.map(m => `${m.kind}@${m.col},${m.row}`)
    expect(layout(a)).toEqual(layout(b))
    expect(a.state.pickups).toEqual(b.state.pickups)
    expect(a.snapshot()!.rng).toBe(b.snapshot()!.rng)
  })
})

describe('the HP clock (playtest run 3: no cliffs)', () => {
  const clockOf = (e: BarrageEngine): number => e.hpClock.hpRow

  it('flat past the first boss: ×HP_CURVE.mid a clock row after the knee, never the old ×10 from row 10 to 20', () => {
    expect(rowHp(10)).toBe(17)
    for (let h = HP_CURVE.knee + 1; h <= HP_CURVE.lateRow; h++) {
      expect(rowHp(h) / rowHp(h - 1)).toBeLessThan(HP_CURVE.mid + 0.1)
    }
    // Challenge pass after run 8: the mid game carries more (×1.22 a clock
    // row) — still no cliff (the old curve went ×10 from row 10 to 20)…
    expect(rowHp(20) / rowHp(10)).toBeLessThan(7)
    // …and it meets the pre-pass curve (the Daily's) again at deepRow, so the
    // late game is unchanged.
    expect(Math.abs(rowHp(HP_CURVE.deepRow) / rowHp(HP_CURVE.deepRow, true) - 1)).toBeLessThan(0.01)
    // The late game keeps growing.
    expect(rowHp(40) / rowHp(30)).toBeGreaterThan(5)
  })

  it('late-game pass: past clock deepRow (a typical row ~40) HP grows ×HP_CURVE.deep, not ×dailyLate; the Daily keeps ×dailyLate', () => {
    expect(HP_CURVE.deep).toBeLessThan(HP_CURVE.dailyLate)
    for (let h = HP_CURVE.lateRow + 1; h <= HP_CURVE.deepRow; h++) {
      expect(rowHp(h) / rowHp(h - 1)).toBeCloseTo(HP_CURVE.late, 1)
    }
    for (const h of [HP_CURVE.deepRow + 1, HP_CURVE.deepRow + 10, HP_CURVE.deepRow + 60]) {
      expect(rowHp(h) / rowHp(h - 1)).toBeCloseTo(HP_CURVE.deep, 2)
      expect(rowHp(h, true) / rowHp(h - 1, true)).toBeCloseTo(HP_CURVE.dailyLate, 2)
    }
    // Up to the knee the two curves are one; past it the Daily keeps the
    // pre-challenge-pass growth (dailyMid / dailyLate).
    for (let h = 1; h <= HP_CURVE.knee; h++) expect(rowHp(h, true)).toBe(rowHp(h))
    for (let h = HP_CURVE.knee + 1; h <= HP_CURVE.lateRow; h++) {
      expect(rowHp(h, true) / rowHp(h - 1, true)).toBeCloseTo(HP_CURVE.dailyMid, 1)
    }
    // The Daily's walkers and bosses read the Daily curve.
    const h = HP_CURVE.deepRow + 6
    expect(monsterHp(h, 'slime', false, false, 0, undefined, true)).toBe(rowHp(h, true))
    expect(bossHp(h, 40, false, false, 0, true)).toBe(Math.round(rowHp(h, true) * HP_CURVE.bossLater))
    expect(bossHp(h, 40, false)).toBe(Math.round(rowHp(h) * HP_CURVE.bossLater))
  })

  it('before the first boss the clock is the row counter; the boss row holds it and the boss takes the next row', () => {
    const e = createEngine(defaultConfig({ seed: 5 }))
    for (let k = 0; k < 8; k++) {
      expect(clockOf(e)).toBe(e.state.row)
      pass(e)
    }
    expect(e.state.row).toBe(9)
    expect(pass(e)).toBe('aim') // row 10: the boss
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    expect(boss.spawnRow).toBe(10)
    expect(clockOf(e)).toBe(9)
    expect(boss.maxHp).toBe(bossHp(10, 10, false))
  })

  it('the first boss fight holds the clock, the plateau holds it after the kill, then it runs on from the same value', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 5 }), 9, [1])
    pass(e) // row 10 — the boss
    expect(e.state.bossId).not.toBeNull()
    for (let k = 0; k < 3; k++) pass(e) // rows 11–13 while it lives
    expect(e.state.row).toBe(13)
    expect(clockOf(e)).toBe(9)
    // Put the boss at 1 HP straight above the launcher (restore rebuilds the grid).
    const snap = e.snapshot()!
    snap.monsters = snap.monsters.filter(m => m.kind === 'boss').map(m => ({ ...m, hp: 1, row: 1, col: 2 }))
    snap.pickups = []
    snap.launcherX = 3.5
    const r = restoreEngine(snap)
    expect(r.hpClock).toEqual({ hpRow: 9, hpHold: 0 })
    const ev = record(r)
    turn(r, Math.PI / 2)
    expect(ofType(ev, 'bossDefeated')).toHaveLength(1)
    // The kill's quiet turn already brought row 14 in (the first boss only):
    // the plateau's first row.
    expect(r.state.row).toBe(14)
    expect(r.hpClock).toEqual({ hpRow: 9, hpHold: HP_CURVE.plateau - 1 })
    const clocks: number[] = [clockOf(r)]
    for (let k = 0; k < HP_CURVE.plateau + 1; k++) {
      pass(r)
      clocks.push(clockOf(r))
    }
    // Plateau rows at the pre-boss clock, then one clock row per row again.
    expect(clocks).toEqual([...Array<number>(HP_CURVE.plateau).fill(9), 10, 11])
    // The walkers after the boss come back at the strength of the ones before it.
    const post = r.state.monsters.filter(m => m.spawnRow === 14)
    expect(post.length).toBeGreaterThan(0)
    for (const m of post) expect(m.maxHp).toBe(monsterHp(9, m.kind, m.corrupted))
  })

  it('a later boss fight holds the clock for HP_CURVE.fightHold rows only', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 8 }), 19, [1])
    const before = clockOf(e)
    pass(e) // row 20 — the worm
    expect(e.state.bossId).not.toBeNull()
    expect(clockOf(e)).toBe(before)
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    expect(boss.maxHp).toBe(bossHp(before + 1, 20, false))
    expect(boss.maxHp).toBe(Math.round(rowHp(before + 1) * HP_CURVE.bossSecond))
    for (let k = 0; k < HP_CURVE.fightHold; k++) pass(e)
    expect(clockOf(e)).toBe(before)
    pass(e)
    expect(clockOf(e)).toBe(before + 1)
  })

  it('hpClockAt: the typical run (bossHold rows held per boss) — continuous, and a restart after a boss starts on its plateau', () => {
    for (let r = 1; r < BOSS_EVERY; r++) expect(hpClockAt(r)).toEqual({ clock: r, hold: 0 })
    for (let r = 2; r < 80; r++) {
      const d = hpClockAt(r).clock - hpClockAt(r - 1).clock
      expect(d === 0 || d === 1).toBe(true)
    }
    expect(hpClockAt(10).clock).toBe(9)
    expect(hpClockAt(11)).toEqual({ clock: 9, hold: HP_CURVE.bossHold - 2 })
    expect(hpClockAt(20).clock).toBe(20 - HP_CURVE.bossHold - 1)
    // A checkpoint restart right after the row-10 boss: the typical plateau, then on.
    const e = createEngineAtRow(defaultConfig({ seed: 2 }), 11, [2, 1])
    expect(e.hpClock).toEqual({ hpRow: 9, hpHold: HP_CURVE.bossHold - 2 })
    expect(e.state.monsters.length).toBeGreaterThan(0)
    for (const m of e.state.monsters) expect(m.maxHp).toBe(monsterHp(9, m.kind, m.corrupted))
    // An explicit clock (optional 4th argument) wins over the typical one.
    const x = createEngineAtRow(defaultConfig({ seed: 2 }), 11, [2, 1], 12)
    expect(x.hpClock.hpRow).toBe(12)
  })

  it('snapshots carry the clock; a save from before it restores the typical clock for its row', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 4 }), 23, [2, 1])
    pass(e)
    const snap = e.snapshot()!
    expect(snap.hpRow).toBe(e.hpClock.hpRow)
    expect(snap.hpHold).toBe(e.hpClock.hpHold)
    expect(restoreEngine(JSON.parse(JSON.stringify(snap))).hpClock).toEqual(e.hpClock)
    const old = { ...snap }
    delete old.hpRow
    delete old.hpHold
    expect(restoreEngine(old).hpClock).toEqual({ hpRow: hpClockAt(snap.row).clock, hpHold: hpClockAt(snap.row).hold })
  })

  it('never touches the RNG: a held clock and a running one lay out the same board from the same seed', () => {
    const a = createEngineAtRow(defaultConfig({ seed: 11 }), 12, [1])
    const b = createEngineAtRow(defaultConfig({ seed: 11 }), 12, [1], 3)
    for (let k = 0; k < 4; k++) { pass(a); pass(b) }
    const layout = (e: BarrageEngine): string[] => e.state.monsters.map(m => `${m.kind}@${m.col},${m.row}`)
    expect(layout(a)).toEqual(layout(b))
    expect(a.snapshot()!.rng).toBe(b.snapshot()!.rng)
    expect(a.state.monsters.map(m => m.maxHp)).not.toEqual(b.state.monsters.map(m => m.maxHp))
  })

  it('the boss ladder: first HP_CURVE.boss, then bossSecond, bossThird, bossLater (the Daily: bossLater past its first)', () => {
    expect([10, 12, 19].map(r => bossHpFactor(r))).toEqual([HP_CURVE.boss, HP_CURVE.boss, HP_CURVE.boss])
    expect([20, 29].map(r => bossHpFactor(r))).toEqual([HP_CURVE.bossSecond, HP_CURVE.bossSecond])
    expect([30, 39].map(r => bossHpFactor(r))).toEqual([HP_CURVE.bossThird, HP_CURVE.bossThird])
    expect([40, 50, 70].map(r => bossHpFactor(r))).toEqual([HP_CURVE.bossLater, HP_CURVE.bossLater, HP_CURVE.bossLater])
    expect([10, 20, 30, 40].map(r => bossHpFactor(r, true))).toEqual([HP_CURVE.boss, HP_CURVE.bossLater, HP_CURVE.bossLater, HP_CURVE.bossLater])
    // A ladder, not a cliff: each step up, none past the late multiplier.
    expect(HP_CURVE.bossSecond).toBeLessThanOrEqual(HP_CURVE.bossThird)
    expect(HP_CURVE.bossThird).toBeLessThanOrEqual(HP_CURVE.bossLater)
    expect(bossHp(10, 10, false)).toBe(Math.round(rowHp(10) * HP_CURVE.boss))
    expect(bossHp(15, 20, false)).toBe(Math.round(rowHp(15) * HP_CURVE.bossSecond))
    expect(bossHp(19, 30, false)).toBe(Math.round(rowHp(19) * HP_CURVE.bossThird))
    expect(bossHp(24, 40, false)).toBe(Math.round(rowHp(24) * HP_CURVE.bossLater))
    expect(bossHp(20, 20, false, false, 0, true)).toBe(Math.round(rowHp(20, true) * HP_CURVE.bossLater))
    expect(bossHp(10, 10, false, true)).toBe(Math.round(rowHp(10) * HP_CURVE.boss * HP_CURVE.ftueBoss))
  })

  // Playtest run 5: 57 HP, then 792–1,100 ("a 20x jump in one step").
  it('the first-session step is a step: ≤ ~7.5× on the curve from the scripted first boss to the row-20 boss, and no cliff after', () => {
    const first = bossHp(10, 10, false, true, 1) // what a first-timer sees (safety net on)
    for (const clock of [14, 15]) { // where the sim's first-timers meet the row-20 boss
      const second = bossHp(clock, 20, false, false, 1)
      // On the curve alone; the adaptive floor (BOSS_ADAPT) lifts the first
      // boss for any real tray, so the step a player sees is ~2–3.5× (sim).
      expect(second / first).toBeLessThan(7.5)
      expect(second / first).toBeGreaterThan(4) // still a real step
    }
    // The ladder climbs on from there at the typical boss clocks (19, 24).
    expect(bossHp(19, 30, false) / bossHp(15, 20, false)).toBeLessThan(6.5)
    expect(bossHp(24, 40, false) / bossHp(19, 30, false)).toBeLessThan(6.5)
  })
})

// Daily Barrage is a fixed-kit sprint with no checkpoints: the endless clock's
// holds stretched a daily run to 50–60 rows (6–9 min); its clock is the row.
describe('the Daily HP clock is the row counter', () => {
  const daily = (): Partial<Parameters<typeof defaultConfig>[0]> => ({ ...DAILY_CONFIG, mode: 'daily', seed: 77, ftue: false })

  it('no hold on the boss row, during the fight or after the kill; bosses take their own row', () => {
    const e = createEngineAtRow(defaultConfig(daily()), 19, [1])
    expect(e.hpClock.hpRow).toBe(19)
    pass(e) // row 20 — the worm
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    // The Daily's fixed kit keeps its row-20 boss at bossLater (the endless
    // run's softer second boss is a first-session rule).
    expect(boss.maxHp).toBe(bossHp(20, 20, false, false, 0, true))
    expect(boss.maxHp).toBe(Math.round(rowHp(20, true) * HP_CURVE.bossLater))
    for (const m of e.state.monsters.filter(x => x.kind !== 'boss' && x.spawnRow === 20)) {
      expect(m.maxHp).toBe(monsterHp(20, m.kind, m.corrupted, false, 0, undefined, true))
    }
    for (let k = 0; k < 4; k++) {
      pass(e)
      expect(e.hpClock).toEqual({ hpRow: e.state.row, hpHold: 0 })
    }
  })

  it('the first boss fight does not hold it either, and a boss kill starts no plateau', () => {
    const e = createEngineAtRow(defaultConfig(daily()), 9, [1])
    pass(e) // row 10 — the Slime Tower
    const boss = e.state.monsters.find(m => m.id === e.state.bossId)!
    expect(boss.maxHp).toBe(bossHp(10, 10, false))
    pass(e)
    pass(e)
    expect(e.hpClock).toEqual({ hpRow: 12, hpHold: 0 })
    const snap = e.snapshot()!
    snap.monsters = snap.monsters.filter(m => m.kind === 'boss').map(m => ({ ...m, hp: 1, row: 1, col: 2 }))
    snap.pickups = []
    snap.launcherX = 3.5
    const r = restoreEngine(snap)
    const ev = record(r)
    turn(r, Math.PI / 2)
    expect(ofType(ev, 'bossDefeated')).toHaveLength(1)
    expect(r.hpClock.hpHold).toBe(0)
    pass(r)
    expect(r.hpClock).toEqual({ hpRow: r.state.row, hpHold: 0 })
  })

  it('an endless board on the same seed still holds (the clocks differ, the layouts do not — past the roaring bosses)', () => {
    // Row 40's boss roars on neither board (the endless third, rows 30–39, roars
    // a third of it away since run 11).
    const d = createEngineAtRow(defaultConfig(daily()), 39, [1])
    const e = createEngineAtRow(defaultConfig({ ...daily(), mode: 'endless' }), 39, [1])
    for (let k = 0; k < 3; k++) { pass(d); pass(e) }
    expect(d.hpClock.hpRow).toBe(42)
    expect(e.hpClock.hpRow).toBeLessThan(42)
    const layout = (x: BarrageEngine): string[] => x.state.monsters.map(m => `${m.kind}@${m.col},${m.row}`)
    expect(layout(d)).toEqual(layout(e))
    expect(d.snapshot()!.rng).toBe(e.snapshot()!.rng)
  })
})

describe('early-challenge pass: the endless walker lift', () => {
  it('a tent over the early clock: ×walkerLift at liftFull, exactly ×1 from liftTo on (the late game keeps its curve)', () => {
    expect(HP_CURVE.walkerLift).toBe(10)
    expect(walkerLift(HP_CURVE.liftFull)).toBeCloseTo(HP_CURVE.walkerLift, 9)
    for (const h of [HP_CURVE.liftTo, HP_CURVE.liftTo + 1, HP_CURVE.deepRow, 60, 200]) expect(walkerLift(h)).toBe(1)
    for (let h = 1; h < HP_CURVE.liftTo; h++) {
      expect(walkerLift(h)).toBeGreaterThanOrEqual(1)
      // No step: a clock row changes the lift by at most the tent's slope.
      const r = walkerLift(h + 1) / walkerLift(h)
      expect(r).toBeLessThanOrEqual(Math.pow(HP_CURVE.walkerLift, 1 / (HP_CURVE.liftFull - HP_CURVE.liftFrom)) + 1e-9)
      expect(r).toBeGreaterThanOrEqual(Math.pow(HP_CURVE.walkerLift, -1 / (HP_CURVE.liftTo - HP_CURVE.liftFull)) - 1e-9)
    }
    // The lifted walker curve still grows row over row past the peak.
    for (let h = HP_CURVE.liftFull + 1; h <= HP_CURVE.liftTo + 2; h++) {
      expect(monsterHp(h, 'slime', false)).toBeGreaterThanOrEqual(monsterHp(h - 1, 'slime', false))
    }
  })

  it('endless walkers only: FTUE rows, bosses and the Daily keep the curve', () => {
    for (const h of [4, 8, 15, 20]) {
      expect(monsterHp(h, 'slime', false)).toBe(Math.round(rowHp(h) * walkerLift(h)))
      expect(monsterHp(h, 'slime', false)).toBeGreaterThan(rowHp(h))
      expect(monsterHp(h, 'boss', false)).toBe(Math.round(rowHp(h) * HP_CURVE.boss))
      expect(bossHp(h, 25, false)).toBe(Math.round(rowHp(h) * HP_CURVE.bossSecond))
      expect(monsterHp(h, 'slime', false, false, 0, undefined, true)).toBe(rowHp(h, true))
    }
    // The first minute stays one- to three-hit.
    for (let h = 1; h <= FTUE_HP_ROWS; h++) expect(monsterHp(h, 'slime', false, true)).toBeLessThanOrEqual(FTUE_HP_CAP)
    for (let h = 1; h <= FTUE_HP_ROWS; h++) expect(monsterHp(h, 'slime', false, true)).toBe(Math.min(rowHp(h), h === 1 ? 1 : FTUE_HP_CAP))
  })

  it('the engine spawns its endless walkers lifted', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 5 }), 14, [1])
    expect(walkerLift(e.hpClock.hpRow)).toBeGreaterThan(1)
    const walkers = e.state.monsters.filter(m => m.kind !== 'boss')
    expect(walkers.length).toBeGreaterThan(0)
    for (const m of walkers) expect(m.maxHp).toBe(monsterHp(e.hpClock.hpRow, m.kind, m.corrupted))
  })
})
