// Playtest run 3 on the board (BoardRenderer):
//   • the first boss's `bossRoar` blows the grunts away — flung, never the
//     first-session kill hold (≈10 kills at once must not stack or stall);
//   • the first hit on a boss pops an extra-big number, boss numbers are never
//     dropped and draw over every other number;
//   • damage numbers show `dealt` (the HP removed), not the overkill;
//   • the line's skull lights while a monster wears a '1' pip;
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { BoardRenderer } from '@/barrage/render/BoardRenderer'
import type { BarrageEngine } from '@/barrage/engine/engine'
import type { BoardState, Monster } from '@/barrage/engine/types'
import { ROWS } from '@/barrage/engine/types'
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

interface ViewProbe { id: number; holdAt: number; roarAt: number; dieAt: number }
interface Internals {
  time: number
  update(dt: number, s: BoardState): void
  viewList: ViewProbe[]
  skullLit: number
  lineFlash: number
  skullFlash: number
}

const DT = 1 / 60

const rig = (monsters: Monster[], ftue = false, launcherX = 3.5) => {
  const e: BarrageEngine = board({ monsters, tray: [1], config: { ftue }, launcherX })
  const shakes: string[] = []
  const flights: number[] = []
  const r = new BoardRenderer({ shake: (i) => { shakes.push(i) }, coins: (_x, _y, n) => { flights.push(n); return true }, confetti: () => {} })
  const sounds = vi.spyOn(r.sounds, 'request')
  // A sized board, so bakes exist.
  r.resize(390, 700, 1)
  r.setEngine(e)
  e.on((ev) => r.onEvent(ev))
  const x = r as unknown as Internals
  const step = (dt = DT): void => {
    e.update(dt)
    x.time += dt
    x.update(dt, e.state)
  }
  const views = (): ViewProbe[] => x.viewList
  const view = (id: number): ViewProbe | undefined => x.viewList.find((v) => v.id === id)
  const soundCount = (id: string): number => sounds.mock.calls.filter((c) => c[0] === id).length
  /** jsdom never decodes a sprite: give a monster's view a stand-in bake (it is drawn, so the demo can play). */
  const fakeBake = (id: number): void => {
    const v = (r as unknown as { views: Map<number, { bake: unknown }> }).views.get(id)!
    const cv = document.createElement('canvas')
    v.bake = { base: cv, white: cv, frozen: cv, enraged: null, dw: 0.88, dh: 0.88 }
  }
  return { e, r, x, shakes, flights, step, views, view, soundCount, fakeBake }
}

/** Plays a first-boss arrival the way the engine sends it: `bossRoar`, then
 *  each walker's `kill` + `coins` — with the walkers already gone from the state. */
const roarBurst = (g: ReturnType<typeof rig>, boss: Monster, walkers: Monster[]): void => {
  const s = g.e.state
  s.monsters.splice(0, s.monsters.length, ...s.monsters.filter((m) => !walkers.includes(m)))
  g.r.onEvent({ type: 'bossRoar', monsterId: boss.id, ids: walkers.map((w) => w.id), x: boss.col + 1.5, y: boss.row + 1.5 })
  for (const w of walkers) {
    g.r.onEvent({ type: 'kill', monsterId: w.id, kind: w.kind, corrupted: false, x: w.col + 0.5, y: w.row + 0.5, coins: 3, row: 9 })
    g.r.onEvent({ type: 'coins', amount: 3, x: w.col + 0.5, y: w.row + 0.5, source: 'kill' })
  }
}

const grunts = (): Monster[] => {
  const out: Monster[] = []
  for (let i = 0; i < 10; i++) out.push(mon('slime', i % 7, 3 + Math.floor(i / 7) * 3, 5))
  return out
}

describe('the first boss roars the grunts away', () => {
  it('flings every walker (no first-session kill hold), their coins leave within 0.4 s, all gone by ~1 s', () => {
    const boss = mon('boss', 2, -2, 50, { bossKind: 'slime-tower' })
    const walkers = grunts()
    const g = rig([boss, ...walkers], true)
    g.step()
    roarBurst(g, boss, walkers)
    for (const w of walkers) {
      const v = g.view(w.id)!
      expect(v.holdAt).toBe(-1) // never the kill hold
      expect(v.roarAt).toBeGreaterThanOrEqual(g.x.time)
      expect(v.roarAt - g.x.time).toBeLessThanOrEqual(0.4 + 1e-9)
    }
    expect(g.flights).toEqual([]) // coins wait for the shockwave
    let t = 0
    while (t < 0.42) { g.step(); t += DT }
    expect(g.flights).toHaveLength(walkers.length)
    while (t < 1.1) { g.step(); t += DT }
    for (const w of walkers) expect(g.view(w.id)).toBeUndefined()
    expect(g.view(boss.id)).toBeDefined()
    expect(g.shakes).toContain('strong')
    expect(g.soundCount('enrage-roar')).toBe(1)
  })

  it('under reduced motion: no screen shake (the roar still sounds)', () => {
    const boss = mon('boss', 2, -2, 50, { bossKind: 'slime-tower' })
    const walkers = grunts().slice(0, 3)
    const g = rig([boss, ...walkers], true)
    g.r.reducedMotion = true
    g.step()
    roarBurst(g, boss, walkers)
    for (let i = 0; i < 60; i++) g.step()
    expect(g.shakes).toEqual([])
    expect(g.soundCount('enrage-roar')).toBe(1)
  })

  it('an ordinary first-session kill is still held', () => {
    const w = mon('slime', 3, 5, 5)
    const g = rig([w], true)
    g.step()
    g.e.state.monsters.length = 0
    g.r.onEvent({ type: 'kill', monsterId: w.id, kind: 'slime', corrupted: false, x: 3.5, y: 5.5, coins: 3, row: 5 })
    expect(g.view(w.id)!.holdAt).toBeGreaterThanOrEqual(0)
  })
})

describe('boss numbers', () => {
  const hit = (id: number, dmg: number, dealt: number) =>
    ({ type: 'hit' as const, monsterId: id, ballId: 1, tier: 1, dmg, dealt, x: 3.5, y: 1, ability: null, crit: false })

  it('the first hit on a boss pops a 2× number, over every other number; the next ones are ordinary', () => {
    const boss = mon('boss', 2, 0, 1e9, { bossKind: 'worm' })
    const g = rig([boss])
    g.step()
    const c = g.r.layout.cell
    const bossNum = 1.5 * Math.max(13, Math.min(22, c * 0.4))
    g.r.onEvent(hit(boss.id, 4, 4))
    g.r.onEvent(hit(boss.id, 4, 4))
    const on = g.r.vfx.nums.filter((n) => n.on)
    expect(on.map((n) => n.size)).toEqual([bossNum * 2, bossNum])
    expect(on.every((n) => n.layer === 1)).toBe(true)
    expect(on[0]!.life).toBeGreaterThan(on[1]!.life)
  })

  it('on a boss still entering, the big number stands beside its HP plate, never on it', () => {
    const boss = mon('boss', 4, -2, 71, { bossKind: 'slime-tower' })
    const g = rig([boss])
    g.step()
    g.r.onEvent(hit(boss.id, 1, 1))
    const n = g.r.vfx.nums.find((x) => x.on)!
    const mid = boss.col + boss.w / 2
    // Boss on the right half: it moves toward the board's middle.
    expect(n.x).toBeLessThan(mid - 0.5)
    expect(n.x).toBeGreaterThan(boss.col - 1.5)
  })

  it('a boss number is never dropped for a full pool', () => {
    const boss = mon('boss', 2, 0, 1e9, { bossKind: 'worm' })
    const walkers: Monster[] = []
    for (let i = 0; i < 7; i++) walkers.push(mon('slime', i, 6, 1e9))
    const g = rig([boss, ...walkers])
    g.step()
    // Crits never fold: fill the whole pool with grunt numbers.
    for (let i = 0; i < g.r.vfx.nums.length; i++) {
      g.r.onEvent({ ...hit(walkers[i % 7]!.id, 2, 2), crit: true })
    }
    expect(g.r.vfx.nums.every((n) => n.on)).toBe(true)
    g.r.onEvent(hit(boss.id, 7, 7))
    expect(g.r.vfx.nums.filter((n) => n.on && n.layer === 1)).toHaveLength(1)
  })
})

describe('damage numbers show the HP removed (dealt), not the overkill', () => {
  it('a 9-damage hit on a 1-HP monster pops "1"; a DoT tick too', () => {
    const w = mon('slime', 3, 5, 1e9)
    const g = rig([w])
    g.step()
    g.r.onEvent({ type: 'hit', monsterId: w.id, ballId: 1, tier: 1, dmg: 9, dealt: 1, x: 3.5, y: 5.5, ability: null, crit: false })
    g.r.onEvent({ type: 'dot', monsterId: w.id, dmg: 6, dealt: 2, kind: 'burn', x: 3.5, y: 5.5 })
    const texts = g.r.vfx.nums.filter((n) => n.on).map((n) => n.text)
    expect(texts).toEqual(['1', '2'])
  })

  it('nothing removed (dealt 0): no number', () => {
    const w = mon('slime', 3, 5, 1e9)
    const g = rig([w])
    g.step()
    g.r.onEvent({ type: 'hit', monsterId: w.id, ballId: 1, tier: 1, dmg: 3, dealt: 0, x: 3.5, y: 5.5, ability: null, crit: false })
    expect(g.r.vfx.nums.some((n) => n.on)).toBe(false)
  })
})

describe('the line\'s skull', () => {
  it('lights while a monster wears the \'1\' pip, and dims again when none does', () => {
    const near = mon('slime', 3, ROWS - 1, 1e9)
    const g = rig([near])
    for (let i = 0; i < 60; i++) g.step()
    expect(g.x.skullLit).toBeGreaterThan(0.95)
    g.e.state.monsters.length = 0
    for (let i = 0; i < 90; i++) g.step()
    expect(g.x.skullLit).toBeLessThan(0.05)
  })

  it('stays dim for a monster two marches out', () => {
    const g = rig([mon('slime', 3, ROWS - 2, 1e9)])
    for (let i = 0; i < 60; i++) g.step()
    expect(g.x.skullLit).toBeLessThan(0.01)
  })
})
