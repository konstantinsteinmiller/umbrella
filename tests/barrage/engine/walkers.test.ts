import { describe, expect, it } from 'vitest'
import { createEngineAtRow, restoreEngine } from '@/barrage/engine/engine'
import { defaultConfig } from '@/barrage/engine/economy'
import { IMP_MINI_HP, KIND_UNLOCK_ROW, chargesAt, planRow, restsAt } from '@/barrage/engine/monsters'
import type { EngineEvent } from '@/barrage/engine/types'
import { board, mon, ofType, pass, record, turn } from './helpers'

const UP = Math.PI / 2

/** The four late walkers — one rule each (CONTRACT §2). */
describe('imp: splits into two little imps', () => {
  it('a defeated imp leaves two minis — its own cell, then the left one — at 35% of its max HP', () => {
    const imp = mon('imp', 3, 2, 0.5, { maxHp: 20 })
    const e = board({ monsters: [imp], launcherX: 3.5, tray: [1] })
    const ev = record(e)
    turn(e, UP)
    const split = ofType(ev, 'split')
    expect(split).toHaveLength(1)
    expect(split[0]!.monsterId).toBe(imp.id)
    expect(split[0]!.childIds).toHaveLength(2)
    const minis = e.state.monsters.filter(m => m.kind === 'imp' && m.mini)
    expect(minis).toHaveLength(2)
    for (const m of minis) expect(m.maxHp).toBe(Math.round(20 * IMP_MINI_HP))
    // They were born in row 2 and marched one row with everything else.
    expect(minis.map(m => `${m.col},${m.row}`).sort()).toEqual(['2,3', '3,3'])
  })

  it('a little imp never splits again, and pays a share of an imp', () => {
    const big = board({ monsters: [mon('imp', 3, 2, 0.5)], launcherX: 3.5, tray: [1] })
    const small = board({ monsters: [mon('imp', 3, 2, 0.5, { mini: true })], launcherX: 3.5, tray: [1] })
    const evBig = record(big)
    const evSmall = record(small)
    turn(big, UP)
    turn(small, UP)
    expect(ofType(evSmall, 'split')).toHaveLength(0)
    const coins = (ev: EngineEvent[]): number => ofType(ev, 'kill').find(k => k.kind === 'imp')!.coins
    expect(coins(evSmall)).toBeLessThan(coins(evBig))
  })

  it('never splits into cells taken by a monster, and never downward', () => {
    const imp = mon('imp', 3, 2, 0.5)
    const e = board({
      // Left and right walled in, the row above taken: only its own cell is left.
      monsters: [imp, mon('slime', 2, 2), mon('slime', 4, 2), mon('slime', 3, 1)],
      launcherX: 3.5, tray: [1]
    })
    const ev = record(e)
    turn(e, UP)
    expect(ofType(ev, 'split')[0]!.childIds).toHaveLength(1)
  })

  it('an imp cleared by a meteor continue does not split into the cleared rows', () => {
    const e = board({ monsters: [mon('imp', 3, 9, 1e9)], tray: [1] })
    const ev = record(e)
    pass(e)
    expect(e.state.phase).toBe('breach')
    expect(e.continueAfterBreach('meteor')).toBe(true)
    expect(ofType(ev, 'split')).toHaveLength(0)
    expect(e.state.monsters.some(m => m.kind === 'imp')).toBe(false)
  })
})

describe('treant: slow — marches every other turn', () => {
  it('rests exactly on the turns restsAt names, and holds up what is behind it', () => {
    const tree = mon('treant', 0, 3, 1e9)
    const behind = mon('slime', 0, 2, 1e9)
    const e = board({ monsters: [tree, behind], tray: [1] })
    let rests = 0
    for (let i = 0; i < 4; i++) {
      const before = tree.row
      const resting = restsAt(tree, e.state.turn + 1)
      pass(e)
      if (resting) rests++
      expect(tree.row - before).toBe(resting ? 0 : 1)
      // The slime right behind it can only follow when the treant moved.
      expect(behind.row).toBe(tree.row - 1)
    }
    expect(rests).toBe(2)
  })
})

describe('carbuncle: its gem shield blocks the first hit every turn', () => {
  it('the first hit breaks the shield without damage; the shield grows back at the next aim', () => {
    const gem = mon('carbuncle', 3, 2, 5, { shield: true })
    const e = board({ monsters: [gem], launcherX: 3.5, tray: [1] })
    const ev = record(e)
    turn(e, UP)
    expect(ofType(ev, 'shieldPop')).toHaveLength(1)
    expect(ofType(ev, 'hit')).toHaveLength(0)
    expect(gem.hp).toBe(5)
    expect(gem.shield).toBe(true)
    expect(ofType(ev, 'shieldUp')).toHaveLength(1)
  })

  it('a second ball in the same volley does hurt', () => {
    const gem = mon('carbuncle', 3, 2, 50, { shield: true })
    const e = board({ monsters: [gem], launcherX: 3.5, tray: [1, 1], config: { trayCapacity: 2 } })
    turn(e, UP)
    expect(gem.hp).toBeLessThan(50)
  })

  it('blocks any damage — a burn tick too', () => {
    const gem = mon('carbuncle', 3, 2, 50, { shield: true, burnDmg: 4, burnTurns: 2 })
    const e = board({ monsters: [gem], tray: [1] })
    const ev = record(e)
    pass(e)
    expect(gem.hp).toBe(50)
    expect(ofType(ev, 'shieldPop')).toHaveLength(1)
  })

  it('a meteor continue clears a shielded carbuncle all the same', () => {
    const e = board({ monsters: [mon('carbuncle', 3, 9, 1e9, { shield: true })], tray: [1] })
    pass(e)
    expect(e.continueAfterBreach('meteor')).toBe(true)
    expect(e.state.monsters.some(m => m.kind === 'carbuncle')).toBe(false)
  })

  it('a fresh carbuncle spawns shielded', () => {
    const e = createEngineAtRow(defaultConfig({ seed: 3 }), KIND_UNLOCK_ROW.carbuncle - 1, [1])
    pass(e)
    const gem = e.state.monsters.find(m => m.kind === 'carbuncle')
    expect(gem).toBeDefined()
    expect(gem!.shield).toBe(true)
  })
})

describe('cyclops: charges two rows every other turn', () => {
  it('marches two rows on the turns chargesAt names (with a charge event), one on the others', () => {
    const cy = mon('cyclops', 5, 0, 1e9)
    const e = board({ monsters: [cy], tray: [1] })
    const ev = record(e)
    let charges = 0
    for (let i = 0; i < 4; i++) {
      const before = cy.row
      const charging = chargesAt(cy, e.state.turn + 1)
      pass(e)
      if (charging) charges++
      expect(cy.row - before).toBe(charging ? 2 : 1)
    }
    expect(charges).toBe(2)
    expect(ofType(ev, 'charge')).toHaveLength(2)
  })

  it('a charge stops at whatever is below it', () => {
    const cy = mon('cyclops', 5, 0, 1e9)
    const wall = mon('slime', 5, 2, 1e9, { frozen: 9 })
    const e = board({ monsters: [cy, wall], tray: [1] })
    // Play until a charge turn comes up, then check it only took the one free row.
    if (!chargesAt(cy, e.state.turn + 1)) pass(e)
    const ev = record(e)
    const before = cy.row
    pass(e)
    expect(cy.row).toBe(Math.min(before + 2, wall.row - 1))
    if (cy.row - before < 2) expect(ofType(ev, 'charge')).toHaveLength(0)
  })
})

describe('the roster', () => {
  it('each late walker first appears on its unlock row, never before', () => {
    const opts = { bossAlive: false, pickupLuck: 0, ftue: false, blocked: () => false }
    for (const kind of ['imp', 'treant', 'carbuncle', 'cyclops'] as const) {
      const at = KIND_UNLOCK_ROW[kind]
      for (let seed = 1; seed <= 12; seed++) {
        expect(planRow(seed, at - 1, opts).monsters.some(m => m.kind === kind), `${kind} before row ${at}`).toBe(false)
      }
      expect(planRow(1, at, opts).monsters[0]?.kind).toBe(kind)
    }
  })

  it('a snapshot keeps the shield and the little imps', () => {
    const e = board({ monsters: [mon('carbuncle', 1, 1, 9, { shield: true }), mon('imp', 4, 1, 9, { mini: true })], tray: [1] })
    const snap = e.snapshot()!
    const back = restoreEngine(JSON.parse(JSON.stringify(snap)))
    expect(back.state.monsters.find(m => m.kind === 'carbuncle')!.shield).toBe(true)
    expect(back.state.monsters.find(m => m.kind === 'imp')!.mini).toBe(true)
  })

  it('deep runs with every late walker stay deterministic', () => {
    const angles = [1.2, 2.1, UP, 0.4, 2.7, 1.0, 1.9, 1.45, 2.4, 0.9, 1.7, 2.2]
    const run = (): string => {
      const e = createEngineAtRow(defaultConfig({ seed: 3, trayCapacity: 8, damageMult: 40 }), 60, [6, 5, 5, 4, 3, 3, 2, 1])
      const ev = record(e)
      // 32 turns: since Shoot-to-Choose the row-70 boss's pick (a Volley
      // here) reshapes the board, and the centaur's charge comes at turn 27.
      for (let i = 0; i < 32; i++) {
        if (e.state.phase === 'breach') e.continueAfterBreach('meteor')
        turn(e, angles[i % angles.length]!)
      }
      return JSON.stringify(ev)
    }
    const first = run()
    expect(first).toBe(run())
    // The run really did meet the new rules.
    for (const type of ['split', 'charge', 'shieldPop']) expect(first, type).toContain(`"type":"${type}"`)
  })
})
