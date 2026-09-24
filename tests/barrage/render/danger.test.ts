// The always-on overrun countdown (render/danger.ts + BoardRenderer) and the
// boss feedback from playtest run 2: pips '2' / '1' on every monster about to
// cross the line, one shake + one warning sound on the aim before a breaching
// march (no shake under prefers-reduced-motion), boss damage numbers 1.5× in
// every session, and the boss death blast drawn from the pooled VFX.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { BoardRenderer } from '@/barrage/render/BoardRenderer'
import { DANGER_PIP_MARCHES, marchesToBreach, nextMarchTurn } from '@/barrage/render/danger'
import type { BarrageEngine } from '@/barrage/engine/engine'
import type { BoardState, Monster } from '@/barrage/engine/types'
import { COLS, ROWS } from '@/barrage/engine/types'
import { board, mon, pass } from '../engine/helpers'

// jsdom has no 2D canvas: a context where every call is a no-op (see plusOutcome.test.ts).
beforeAll(() => {
  const noop: unknown = new Proxy(function () {}, {
    get: () => noop,
    apply: () => noop,
    set: () => true
  })
  HTMLCanvasElement.prototype.getContext = (() => noop) as unknown as HTMLCanvasElement['getContext']
})

interface Internals {
  time: number
  update(dt: number, s: BoardState): void
  viewList: { id: number; marches: number }[]
}

const DT = 1 / 60

const rig = (monsters: Monster[], ftue = false) => {
  const e: BarrageEngine = board({ monsters, tray: [1], config: { ftue } })
  const shakes: string[] = []
  const r = new BoardRenderer({ shake: (i) => { shakes.push(i) }, coins: () => true, confetti: () => {} })
  const sounds = vi.spyOn(r.sounds, 'request')
  r.setEngine(e)
  e.on((ev) => r.onEvent(ev))
  const x = r as unknown as Internals
  const step = (dt = DT): void => {
    e.update(dt)
    x.time += dt
    x.update(dt, e.state)
  }
  const warnings = (): number => sounds.mock.calls.filter((c) => c[0] === 'grid-full').length
  const marches = (id: number): number | undefined => x.viewList.find((v) => v.id === id)?.marches
  return { e, r, shakes, warnings, marches, step }
}

describe('marchesToBreach', () => {
  it('counts the marches to the line: last row 1, the row above 2, further out cap + 1', () => {
    expect(DANGER_PIP_MARCHES).toBe(2)
    expect(marchesToBreach(mon('slime', 0, ROWS - 1), 1)).toBe(1)
    expect(marchesToBreach(mon('slime', 0, ROWS - 2), 1)).toBe(2)
    expect(marchesToBreach(mon('slime', 0, ROWS - 3), 1)).toBe(3)
    expect(marchesToBreach(mon('slime', 0, ROWS), 1)).toBe(0)
  })

  it('walks each monster\'s own pace', () => {
    // An enraged boss strides two rows a march.
    expect(marchesToBreach(mon('boss', 2, ROWS - 4, 9, { enraged: true }), 1)).toBe(1)
    expect(marchesToBreach(mon('boss', 2, ROWS - 5, 9, { enraged: true }), 1)).toBe(2)
    expect(marchesToBreach(mon('boss', 2, ROWS - 4, 9), 1)).toBe(2)
    // Frozen: it sits out its next march.
    expect(marchesToBreach(mon('slime', 0, ROWS - 1, 9, { frozen: 1 }), 1)).toBe(2)
    // A cyclops charges two rows on (turn + id) even turns.
    const cy = mon('cyclops', 0, ROWS - 2)
    const charge = (cy.id % 2 === 0) ? 2 : 1
    expect(marchesToBreach(cy, charge)).toBe(1)
    expect(marchesToBreach(cy, charge + 1)).toBe(2)
    // A treant rests on (turn + id) odd turns.
    const tr = mon('treant', 0, ROWS - 1)
    const rest = (tr.id % 2 === 0) ? 1 : 2
    expect(marchesToBreach(tr, rest)).toBe(2)
    expect(marchesToBreach(tr, rest + 1)).toBe(1)
  })

  it('reads the next march\'s turn number from the phase', () => {
    expect(nextMarchTurn({ phase: 'aim', turn: 4 })).toBe(5)
    expect(nextMarchTurn({ phase: 'volley', turn: 5 })).toBe(5)
    expect(nextMarchTurn({ phase: 'resolve', turn: 5 })).toBe(5)
    expect(nextMarchTurn({ phase: 'advance', turn: 5 })).toBe(6)
    expect(nextMarchTurn({ phase: 'breach', turn: 5 })).toBe(-1)
  })
})

describe('danger pips + the breach warning (always on, no coach needed)', () => {
  it('pips every threatening monster; warns once, on the aim before the breaching march', () => {
    const near = mon('slime', 0, ROWS - 2)
    const far = mon('slime', 6, ROWS - 3)
    const g = rig([near, far])
    g.step()
    expect(g.marches(near.id)).toBe(2)
    expect(g.marches(far.id)).toBe(3) // no pip
    expect(g.shakes).toEqual([])
    expect(g.warnings()).toBe(0)

    pass(g.e) // near → last row
    for (let i = 0; i < 20; i++) g.step()
    expect(g.e.state.phase).toBe('aim')
    expect(g.marches(near.id)).toBe(1)
    expect(g.marches(far.id)).toBe(2)
    expect(g.shakes).toEqual(['small'])
    expect(g.warnings()).toBe(1)
  })

  it('under prefers-reduced-motion: the sound, no shake', () => {
    const g = rig([mon('slime', 3, ROWS - 1)])
    g.r.reducedMotion = true
    g.step()
    expect(g.shakes).toEqual([])
    expect(g.warnings()).toBe(1)
  })

  it('a paused redraw (dt 0) never warns', () => {
    const g = rig([mon('slime', 3, ROWS - 1)])
    ;(g.r as unknown as Internals).update(0, g.e.state)
    expect(g.shakes).toEqual([])
    expect(g.warnings()).toBe(0)
  })
})

describe('boss feedback', () => {
  it('boss damage numbers are 1.5× outside the first session too; a grunt\'s are not', () => {
    const boss = mon('boss', 2, 1, 1e9, { bossKind: 'worm' })
    const grunt = mon('slime', 0, 5, 1e9)
    const g = rig([boss, grunt])
    g.step()
    g.r.onEvent({ type: 'hit', monsterId: boss.id, ballId: 1, tier: 1, dmg: 5, dealt: 5, x: 3.5, y: 4, ability: null, crit: false })
    g.r.onEvent({ type: 'hit', monsterId: grunt.id, ballId: 2, tier: 1, dmg: 5, dealt: 5, x: 0.5, y: 6, ability: null, crit: false })
    g.r.onEvent({ type: 'hit', monsterId: boss.id, ballId: 3, tier: 1, dmg: 5, dealt: 5, x: 3.5, y: 4, ability: null, crit: false })
    const sizes = g.r.vfx.nums.filter((n) => n.on).map((n) => n.size)
    // layout.cell is 1 before the first resize: boss base 13, grunt base 11;
    // the boss's FIRST hit pops 2× that (run 3), the next one the usual 1.5×.
    expect(sizes).toEqual([13 * 1.5 * 2, 11, 13 * 1.5])
  })

  it('the death blast draws a blast per column from the pool and flashes the doomed', () => {
    const boss = mon('boss', 2, 1, 1e9, { bossKind: 'worm' })
    const doomed = mon('slime', 0, ROWS - 1, 1e9)
    const g = rig([boss, doomed])
    g.step()
    const pool = g.r.vfx.blasts.length
    g.r.onEvent({ type: 'bossBlast', monsterId: boss.id, rows: 2, ids: [doomed.id], x: 3.5, y: 2.5 })
    expect(g.r.vfx.blasts.length).toBe(pool)
    expect(g.r.vfx.blasts.filter((b) => b.on).length).toBe(COLS)
    const v = (g.r as unknown as { views: Map<number, { flash: number }> }).views.get(doomed.id)
    expect(v?.flash).toBe(1)
  })
})
