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
  ASSIST, ASSIST_HP_CUT, HP_CURVE, assistHpMult, bossHp, hpClockAt, isFirstBoss, monsterHp, planRow, rowHp
} from '@/barrage/engine/monsters'
import { BOSS_EVERY, ROWS } from '@/barrage/engine/types'
import { board, mon, ofType, pass, record, turn } from './helpers'

const UP = Math.PI / 2

describe('boss death blast', () => {
  it('a boss killed while a grunt sits in the last row: the grunt dies in the blast, nothing marches, no breach', () => {
    // Straight up from x 3.5 hits the tower's underside (cols 2–4); the grunts
    // stand off that line so only the blast can reach them.
    const boss = mon('boss', 2, 1, 3, { bossKind: 'slime-tower', spawnRow: 10 })
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
    const boss = mon('boss', 2, 1, 3, { bossKind: 'slime-tower', spawnRow: 10 })
    const e = board({ monsters: [boss], tray: [2, 2], row: 11, nextBossRow: 20 })
    const ev = record(e)
    turn(e, UP)
    expect(ofType(ev, 'bossBlast')).toEqual([{ type: 'bossBlast', monsterId: boss.id, rows: 2, ids: [], x: 3.5, y: 2.5 }])
    expect(e.state.row).toBe(11)
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
    expect(monsterHp(15, 'slime', false, false, 1)).toBe(Math.round(rowHp(15) * 0.8))
    expect(monsterHp(15, 'ogre', false, false, 1)).toBe(Math.round(rowHp(15) * 2 * 0.8))
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
    expect(rowHp(20) / rowHp(10)).toBeLessThan(5)
    // The late game keeps growing.
    expect(rowHp(40) / rowHp(30)).toBeGreaterThan(5)
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
    expect(r.hpClock).toEqual({ hpRow: 9, hpHold: HP_CURVE.plateau })
    const clocks: number[] = []
    for (let k = 0; k < HP_CURVE.plateau + 2; k++) {
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
    expect(boss.maxHp).toBe(Math.round(rowHp(before + 1) * HP_CURVE.bossLater))
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

  it('the first boss takes HP_CURVE.boss, later ones HP_CURVE.bossLater', () => {
    expect(bossHp(10, 10, false)).toBe(Math.round(rowHp(10) * HP_CURVE.boss))
    expect(bossHp(15, 20, false)).toBe(Math.round(rowHp(15) * HP_CURVE.bossLater))
    expect(bossHp(10, 10, false, true)).toBe(Math.round(rowHp(10) * HP_CURVE.boss * HP_CURVE.ftueBoss))
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
    expect(boss.maxHp).toBe(bossHp(20, 20, false))
    for (const m of e.state.monsters.filter(x => x.kind !== 'boss' && x.spawnRow === 20)) {
      expect(m.maxHp).toBe(monsterHp(20, m.kind, m.corrupted))
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

  it('an endless board on the same seed still holds (the clocks differ, the layouts do not)', () => {
    const d = createEngineAtRow(defaultConfig(daily()), 19, [1])
    const e = createEngineAtRow(defaultConfig({ ...daily(), mode: 'endless' }), 19, [1])
    for (let k = 0; k < 3; k++) { pass(d); pass(e) }
    expect(d.hpClock.hpRow).toBe(22)
    expect(e.hpClock.hpRow).toBeLessThan(22)
    const layout = (x: BarrageEngine): string[] => x.state.monsters.map(m => `${m.kind}@${m.col},${m.row}`)
    expect(layout(d)).toEqual(layout(e))
    expect(d.snapshot()!.rng).toBe(e.snapshot()!.rng)
  })
})
