// Intent previews (render/intents.ts, playtest run 5): while its rule badge is
// up and the player aims, a behaviour kind shows its NEXT move so a still frame
// reads it — the goblin's hop target, the dryad's heal targets, the centaur's
// sludge cell, the treant's rest turn. Every prediction is checked against the
// real engine's resolve + advance, and reading them never touches the RNG.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  HOP_LEFT, HOP_RIGHT, healTargets, hopSides, restsNext, spitCell, spitsAt
} from '@/barrage/render/intents'
import { nextMarchTurn } from '@/barrage/render/danger'
import { BoardRenderer } from '@/barrage/render/BoardRenderer'
import type { BarrageEngine } from '@/barrage/engine/engine'
import type { BoardState, EngineEvent, Monster } from '@/barrage/engine/types'
import { board, mon, pick } from '../engine/helpers'

beforeAll(() => {
  const noop: unknown = new Proxy(function () {}, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => 8 : noop),
    apply: () => noop,
    set: () => true
  })
  HTMLCanvasElement.prototype.getContext = (() => noop) as unknown as HTMLCanvasElement['getContext']
})

/** The advance the coming turn runs — resolve (dryad heals) then advance
 *  (hops, march, sludge) — with no volley in between: a volley can kill a
 *  monster or collect a pickup and change the answer, while an intent is a
 *  reading of the board as the player aims. `fire()` bumps `turn` first. */
const advance = (e: BarrageEngine): EngineEvent[] => {
  const events: EngineEvent[] = []
  const off = e.on((ev) => events.push(ev))
  const x = e as unknown as { enterResolve(): void; enterAdvance(): void }
  e.state.turn++
  x.enterResolve()
  x.enterAdvance()
  off()
  return events
}

const out = { col: -1, row: -1 }
/** Odd / even ids: the parity rules (centaur spit, treant rest) read `turn + id`. */
let oddId = 90001
let evenId = 90002
const odd = (): number => (oddId += 2)
const even = (): number => (evenId += 2)

describe('goblin: the cell it hops to', () => {
  it('one side free: that side exactly; both free: both candidates; boxed in / frozen / above the board: none', () => {
    const g = mon('goblin', 3, 4)
    const b = { monsters: [g, mon('slime', 4, 4)], pickups: [] }
    expect(hopSides(g, b)).toBe(HOP_LEFT)
    expect(hopSides(g, { monsters: [g], pickups: [] })).toBe(HOP_LEFT | HOP_RIGHT)
    // Walls.
    const edge = mon('goblin', 0, 4)
    expect(hopSides(edge, { monsters: [edge], pickups: [] })).toBe(HOP_RIGHT)
    // A pickup blocks a hop; boxed in → no hop.
    expect(hopSides(g, { monsters: [g, mon('slime', 4, 4)], pickups: [pick('ball', 2, 4)] })).toBe(0)
    // A wide neighbour (caterpillar 1..2) blocks its right-hand cell too.
    expect(hopSides(g, { monsters: [g, mon('caterpillar', 1, 4)], pickups: [] })).toBe(HOP_RIGHT)
    expect(hopSides(mon('goblin', 3, 4, 9, { frozen: 1 }), { monsters: [], pickups: [] })).toBe(0)
    expect(hopSides(mon('goblin', 3, -1), { monsters: [], pickups: [] })).toBe(0)
    expect(hopSides(mon('slime', 3, 4), { monsters: [], pickups: [] })).toBe(0)
  })

  it('agrees with the engine: the boxed-in side is never taken, sludge on the board does not block (it expires first)', () => {
    for (let seed = 0; seed < 6; seed++) {
      const g = mon('goblin', 3, 4)
      const e = board({ monsters: [g, mon('slime', 4, 4)], hazards: [{ id: 80000 + seed, col: 2, row: 4, turns: 1 }], config: { seed } })
      expect(hopSides(g, e.state)).toBe(HOP_LEFT)
      advance(e)
      expect(g.col).toBe(2)
    }
    // Both free: it lands on one of the two shown.
    for (let i = 0; i < 4; i++) {
      const g = mon('goblin', 3, 4)
      const e = board({ monsters: [g] })
      expect(hopSides(g, e.state)).toBe(HOP_LEFT | HOP_RIGHT)
      advance(e)
      expect([2, 4]).toContain(g.col)
    }
    // Boxed in: it stays.
    const g = mon('goblin', 3, 4)
    const e = board({ monsters: [g, mon('slime', 2, 4), mon('slime', 4, 4)] })
    expect(hopSides(g, e.state)).toBe(0)
    advance(e)
    expect(g.col).toBe(3)
  })
})

describe('dryad: the neighbours it heals', () => {
  it('orthogonal neighbours of its footprint, never diagonal, never a boss, never itself', () => {
    const d = mon('dryad', 3, 4)
    const left = mon('slime', 2, 4)
    const below = mon('slime', 3, 5)
    const wide = mon('caterpillar', 2, 3) // covers (2,3) and (3,3): above it
    const diag = mon('slime', 4, 5)
    const boss = mon('boss', 4, 2) // 4..6 × 2..4: right next to it
    const ids = healTargets(d, [d, left, below, wide, diag, boss]).map((m) => m.id).sort()
    expect(ids).toEqual([left.id, below.id, wide.id].sort())
    expect(healTargets(mon('slime', 0, 0), [left])).toEqual([])
  })

  it('agrees with the engine: every wounded neighbour is healed at the resolve, nobody else', () => {
    const d = mon('dryad', 3, 4)
    const hurt = (m: Monster): Monster => Object.assign(m, { hp: m.maxHp - 1000 })
    const left = hurt(mon('slime', 2, 4))
    const above = hurt(mon('ogre', 3, 3))
    const diag = hurt(mon('slime', 4, 5))
    const far = hurt(mon('slime', 0, 1))
    const e = board({ monsters: [d, left, above, diag, far] })
    const marked = new Set(healTargets(d, e.state.monsters).map((m) => m.id))
    expect(marked).toEqual(new Set([left.id, above.id]))
    const healed = advance(e).filter((ev) => ev.type === 'heal').map((ev) => (ev as { monsterId: number }).monsterId)
    expect(new Set(healed)).toEqual(marked)
  })
})

describe('centaur: the cell its sludge lands in', () => {
  it('only on its spit turns — `(turn + id) % 2 === 0`, the turn the coming advance runs under', () => {
    const c = mon('centaur', 3, 2, 1e9, { id: odd() })
    expect(spitsAt(c, 1)).toBe(true)
    expect(spitsAt(c, 2)).toBe(false)
    expect(spitCell(c, { monsters: [c], pickups: [] }, 2, out)).toBe(false)
    expect(spitCell(c, { monsters: [c], pickups: [] }, 1, out)).toBe(true)
    // It spits after it marched, into the cell below it: two below it now.
    expect(out).toEqual({ col: 3, row: 4 })
  })

  it('whatever stands right below comes along (no spit); a frozen centaur spits right below itself; never past the line', () => {
    const c = mon('centaur', 3, 2, 1e9, { id: odd() })
    expect(spitCell(c, { monsters: [c, mon('slime', 3, 3)], pickups: [] }, 1, out)).toBe(false)
    expect(spitCell(c, { monsters: [c], pickups: [pick('coin', 3, 3)] }, 1, out)).toBe(false)
    // Two below: a walker moves on (free), a frozen one stays (blocked).
    expect(spitCell(c, { monsters: [c, mon('slime', 3, 4)], pickups: [] }, 1, out)).toBe(true)
    expect(spitCell(c, { monsters: [c, mon('slime', 3, 4, 9, { frozen: 2 })], pickups: [] }, 1, out)).toBe(false)
    const frozen = mon('centaur', 3, 2, 1e9, { id: odd(), frozen: 1 })
    expect(spitCell(frozen, { monsters: [frozen], pickups: [] }, 1, out)).toBe(true)
    expect(out).toEqual({ col: 3, row: 3 })
    const low = mon('centaur', 3, 8, 1e9, { id: odd() })
    expect(spitCell(low, { monsters: [low], pickups: [] }, 1, out)).toBe(false)
  })

  it('agrees with the engine on a sweep of boards', () => {
    let rnd = 12345
    const next = (n: number): number => {
      rnd = (rnd * 1103515245 + 12345) & 0x7fffffff
      return rnd % n
    }
    let spat = 0
    let quiet = 0
    for (let k = 0; k < 60; k++) {
      const c = mon('centaur', next(7), 1 + next(4), 1e9, { id: k % 2 === 0 ? odd() : even(), frozen: next(4) === 0 ? 1 : 0 })
      const monsters: Monster[] = [c]
      const pickups = []
      // Slimes and pickups scattered over rows 0..6 (no treant, nothing else frozen).
      for (let i = 0; i < 12; i++) {
        const col = next(7)
        const row = next(7)
        if (monsters.some((m) => col >= m.col && col < m.col + m.w && row >= m.row && row < m.row + m.h)) continue
        if (pickups.some((p) => p.col === col && p.row === row)) continue
        if (next(3) === 0) pickups.push(pick('coin', col, row))
        else monsters.push(mon('slime', col, row))
      }
      const e = board({ monsters, pickups })
      const predicted = spitCell(c, e.state, nextMarchTurn(e.state), out) ? { ...out } : null
      const sludge = advance(e).filter((ev) => ev.type === 'sludge' && (ev as { byId: number }).byId === c.id)
      if (predicted) {
        spat++
        expect(sludge).toHaveLength(1)
        expect(sludge[0]).toMatchObject({ col: predicted.col, row: predicted.row })
      } else {
        quiet++
        expect(sludge).toHaveLength(0)
      }
    }
    expect(spat).toBeGreaterThan(5)
    expect(quiet).toBeGreaterThan(5)
  })
})

describe('treant: the turns it rests', () => {
  it('rests when `(turn + id) % 2 === 1`, never while frozen (the ice holds it) — and the engine agrees', () => {
    for (let i = 0; i < 6; i++) {
      const t = mon('treant', 2, 3, 1e9, { id: i % 2 === 0 ? even() : odd() })
      const e = board({ monsters: [t] })
      const rests = restsNext(t, nextMarchTurn(e.state))
      advance(e)
      expect(t.row).toBe(rests ? 3 : 4)
    }
    expect(restsNext(mon('treant', 2, 3, 1e9, { id: even(), frozen: 1 }), 1)).toBe(false)
    expect(restsNext(mon('slime', 2, 3, 1e9, { id: even() }), 1)).toBe(false)
  })
})

describe('on the board (BoardRenderer)', () => {
  interface Internals {
    time: number
    intentK: number
    update(dt: number, s: BoardState): void
    views: Map<number, { bake: unknown }>
  }
  const DT = 1 / 60
  const rig = (monsters: Monster[]) => {
    const e = board({ monsters })
    const r = new BoardRenderer({ shake: () => {}, coins: () => true, confetti: () => {} })
    r.attach(document.createElement('canvas'))
    r.resize(390, 700, 1)
    r.setEngine(e)
    const x = r as unknown as Internals
    x.update(DT, e.state)
    // Well into the aim phase (the display reads phaseTime; the sim is held).
    e.state.phaseTime = 1
    const cv = document.createElement('canvas')
    for (const m of monsters) x.views.get(m.id)!.bake = { base: cv, white: cv, frozen: cv, enraged: null, dw: 0.88, dh: 0.88 }
    const hop = vi.spyOn(r as unknown as { drawHopIntent(...a: unknown[]): void }, 'drawHopIntent')
    const spit = vi.spyOn(r as unknown as { drawSpitIntent(...a: unknown[]): void }, 'drawSpitIntent')
    const frames = (n: number): void => { for (let i = 0; i < n; i++) r.frame(DT) }
    return { e, r, x, hop, spit, frames }
  }

  it('the goblin shows its one hop target and the centaur its sludge cell while the player aims', () => {
    const g = mon('goblin', 1, 2)
    const c = mon('centaur', 5, 2, 1e9, { id: odd() })
    const t = rig([g, mon('slime', 2, 2), c])
    t.frames(40)
    expect(t.x.intentK).toBe(1)
    expect(t.hop).toHaveBeenCalled()
    // (ctx, view, dir, alpha): always to the left — the right-hand cell is taken.
    expect(t.hop.mock.calls.every((call) => call[2] === -1)).toBe(true)
    expect(t.spit).toHaveBeenCalled()
    expect(t.spit.mock.lastCall!.slice(2, 4)).toEqual([5, 4])
  })

  it('hidden the moment a finger is down (even back on the launcher pad), back once it lifts; never outside the aim phase', () => {
    const t = rig([mon('goblin', 1, 2)])
    t.frames(40)
    t.r.setAim(false, Math.PI / 2, true)
    expect(t.x.intentK).toBe(0)
    t.hop.mockClear()
    t.frames(20)
    expect(t.hop).not.toHaveBeenCalled()
    t.r.setAim(false, Math.PI / 2, false)
    t.frames(30)
    expect(t.x.intentK).toBe(1)
    expect(t.hop).toHaveBeenCalled()
    t.e.fire(Math.PI / 2)
    t.frames(2)
    t.hop.mockClear()
    t.frames(10)
    expect(t.x.intentK).toBe(0)
    expect(t.hop).not.toHaveBeenCalled()
  })

  it('only while the badge is up: a retired kind shows no intent', () => {
    const t = rig([mon('goblin', 1, 2)])
    t.r.coachRetired = new Set(['goblin'])
    t.frames(40)
    expect(t.hop).not.toHaveBeenCalled()
  })

  it('drawing them never consumes the engine RNG or touches the board', () => {
    const d = mon('dryad', 3, 4)
    const t = rig([mon('goblin', 1, 2), mon('centaur', 5, 2, 1e9, { id: odd() }), d, mon('slime', 2, 4), mon('treant', 0, 6, 1e9, { id: even() })])
    const before = JSON.stringify(t.e.snapshot())
    t.frames(120)
    expect(JSON.stringify(t.e.snapshot())).toBe(before)
  })
})
