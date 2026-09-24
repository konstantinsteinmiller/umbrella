// First-session kill feedback (BoardRenderer): blind first-timers never saw a
// kill register — a 1–3 HP monster vanished in the frame the ball touched it.
// While `config.ftue` is on, a kill holds on screen ~0.4 s (flash, HP plate
// to 0, squash) before its poof and coin flight; damage numbers are 1.5×.
// Display only: the engine's run is untouched.
import { beforeAll, describe, expect, it } from 'vitest'
import { BoardRenderer } from '@/barrage/render/BoardRenderer'
import type { BarrageEngine } from '@/barrage/engine/engine'
import type { BoardState } from '@/barrage/engine/types'
import { board, mon } from '../engine/helpers'

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
  viewList: { id: number; holdAt: number; hpText: string }[]
}

const UP = Math.PI / 2
const DT = 1 / 60

/** A renderer wired to `e` the way BarrageBoard wires it, counting wallet coin flights. */
const rig = (ftue: boolean): { e: BarrageEngine; r: BoardRenderer; flights: number[]; step(dt?: number): void } => {
  const e = board({ monsters: [mon('slime', 3, 3, 3)], tray: [1], config: { ftue, damageMult: 1 } })
  const flights: number[] = []
  const r = new BoardRenderer({ shake: () => {}, coins: (_x, _y, n) => { flights.push(n); return true }, confetti: () => {} })
  r.setEngine(e)
  e.on((ev) => r.onEvent(ev))
  const x = r as unknown as Internals
  const step = (dt = DT): void => {
    e.update(dt)
    x.time += dt
    x.update(dt, e.state)
  }
  step()
  return { e, r, flights, step }
}

const views = (r: BoardRenderer): Internals['viewList'] => (r as unknown as Internals).viewList
/** The view of a held (dying) kill, if one is on screen. New rows may spawn around it. */
const held = (r: BoardRenderer): Internals['viewList'][number] | undefined => views(r).find((v) => v.holdAt >= 0)
const alive = (r: BoardRenderer, id: number): boolean => views(r).some((v) => v.id === id)

/** Fires straight up at the slime until it dies; stops on the frame of the kill. */
const untilKill = (e: BarrageEngine, step: () => void): void => {
  let killed = false
  const off = e.on((ev) => { if (ev.type === 'kill') killed = true })
  for (let v = 0; v < 8 && !killed; v++) {
    if (e.state.phase === 'aim') e.fire(UP)
    for (let i = 0; i < 900 && !killed && e.state.phase !== 'aim'; i++) step()
  }
  off()
  expect(killed).toBe(true)
}
const killSlime = (g: ReturnType<typeof rig>): void => untilKill(g.e, () => g.step())

describe('first-session kill hold', () => {
  it('keeps the dead monster on screen and holds its coins until the poof (~0.4 s)', () => {
    const g = rig(true)
    const id = g.e.state.monsters[0]!.id
    killSlime(g)
    // The engine is done with it; the renderer is not.
    expect(held(g.r)?.id).toBe(id)
    expect(g.flights).toEqual([])
    let t = 0
    while (g.flights.length === 0 && t < 2) {
      g.step()
      t += DT
    }
    expect(t).toBeGreaterThan(0.33)
    expect(t).toBeLessThan(0.47)
    expect(g.flights).toHaveLength(1)
    expect(alive(g.r, id)).toBe(false)
  })

  it('counts the HP plate down to 0 during the hold', () => {
    const g = rig(true)
    killSlime(g)
    expect(held(g.r)!.hpText).not.toBe('')
    for (let i = 0; i < 14; i++) g.step() // past the ~0.18 s tick
    expect(held(g.r)!.hpText).toBe('0')
  })

  it('after the first session a kill poofs at once and its coins fly straight away', () => {
    const g = rig(false)
    const id = g.e.state.monsters[0]!.id
    killSlime(g)
    expect(g.flights).toHaveLength(1)
    expect(held(g.r)).toBeUndefined()
    g.step()
    expect(alive(g.r, id)).toBe(false)
  })

  it('never changes the run: a held session ends in the same engine state', () => {
    const held = rig(true)
    const plain = held.e.clone() // same run, no renderer listening
    killSlime(held)
    untilKill(plain, () => plain.update(DT))
    for (let i = 0; i < 30; i++) held.step() // the whole hold plays out
    plain.update(30 * DT)
    held.e.settle()
    plain.settle()
    expect(held.e.snapshot()).toEqual(plain.snapshot())
  })
})

describe('first-session damage numbers', () => {
  const firstNumberSize = (ftue: boolean): number => {
    const g = rig(ftue)
    g.e.fire(UP)
    for (let i = 0; i < 600 && !g.r.vfx.nums.some((n) => n.on); i++) g.step()
    const n = g.r.vfx.nums.find((n) => n.on)
    expect(n).toBeDefined()
    return n!.size
  }

  it('are 1.5× bigger until the first boss falls', () => {
    expect(firstNumberSize(true)).toBeCloseTo(firstNumberSize(false) * 1.5, 5)
  })
})
