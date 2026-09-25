// The unit (render/unit.ts + BoardRenderer), playtest run 4 — four blind
// first-timers saw only still screenshots, so what lived in motion or sound
// was lost:
//   • DANGER: while any monster wears the `1` pip the unit itself shows it —
//     its flame shrinks and sputters pale, it trembles (a static pale, shrunk
//     flame under prefers-reduced-motion);
//   • PAYOFF: a Ball Damage purchase (spotted from `config.damageMult` rising
//     on the live engine) flares the unit at once, and the NEXT volley's hit
//     numbers burn gold — never for an engine swap (reload, restart) or a
//     cloud hydrate.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { BoardRenderer } from '@/barrage/render/BoardRenderer'
import { breachComing, marchesToBreach, nextMarchTurn } from '@/barrage/render/danger'
import { DamageWatch, GoldVolley, newUnitPose, unitPose } from '@/barrage/render/unit'
import type { BarrageEngine } from '@/barrage/engine/engine'
import type { BoardState, Monster } from '@/barrage/engine/types'
import { ROWS } from '@/barrage/engine/types'
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
  unitFear: number
  unitFlare: number
  skullLit: number
  goldVolley: GoldVolley
}

const DT = 1 / 60

const rig = (monsters: Monster[], damageMult = 1) => {
  const e: BarrageEngine = board({ monsters, tray: [1, 1], config: { damageMult } })
  const r = new BoardRenderer({ shake: () => {}, coins: () => true, confetti: () => {} })
  const sounds = vi.spyOn(r.sounds, 'request')
  r.resize(390, 700, 1)
  r.setEngine(e)
  e.on((ev) => r.onEvent(ev))
  const x = r as unknown as Internals
  const step = (dt = DT): void => {
    e.update(dt)
    x.time += dt
    x.update(dt, e.state)
  }
  const soundCount = (id: string): number => sounds.mock.calls.filter((c) => c[0] === id).length
  const hit = (m: Monster, crit = false): void => {
    r.onEvent({ type: 'hit', monsterId: m.id, ballId: 1, tier: 1, dmg: 5, dealt: 5, x: m.col + 0.5, y: m.row + 0.5, ability: null, crit })
  }
  const nums = () => r.vfx.nums.filter((n) => n.on)
  const clearNums = (): void => { for (const n of r.vfx.nums) n.on = false }
  return { e, r, x, step, soundCount, hit, nums, clearNums }
}

describe('breachComing — the danger cue\'s predicate', () => {
  it('is true exactly while some monster wears the `1` pip', () => {
    const s = (monsters: Monster[], phase: BoardState['phase'] = 'aim') => ({ phase, turn: 4, monsters })
    expect(breachComing(s([mon('slime', 0, ROWS - 1)]))).toBe(true)
    expect(breachComing(s([mon('slime', 0, ROWS - 2)]))).toBe(false)
    expect(breachComing(s([mon('slime', 0, 2), mon('ogre', 5, ROWS - 1)]))).toBe(true)
    expect(breachComing(s([]))).toBe(false)
    // A frozen monster sits its next march out: `2`, not `1`.
    expect(breachComing(s([mon('slime', 0, ROWS - 1, 9, { frozen: 1 })]))).toBe(false)
    // An enraged boss strides two rows.
    expect(breachComing(s([mon('boss', 2, ROWS - 4, 9, { enraged: true })]))).toBe(true)
    // In a breach no march is coming.
    expect(breachComing(s([mon('slime', 0, ROWS - 1)], 'breach'))).toBe(false)
  })

  it('agrees with the pips for every monster and phase', () => {
    const ms = [mon('slime', 0, ROWS - 1), mon('cyclops', 1, ROWS - 2), mon('treant', 2, ROWS - 1), mon('slime', 3, ROWS - 3)]
    for (const phase of ['aim', 'volley', 'resolve', 'advance', 'breach'] as const) {
      for (let turn = 0; turn < 4; turn++) {
        for (const m of ms) {
          const st = { phase, turn, monsters: [m] }
          const next = nextMarchTurn(st)
          expect(breachComing(st)).toBe(next >= 0 && marchesToBreach(m, next) === 1)
        }
      }
    }
  })
})

describe('unitPose — what a still frame shows', () => {
  it('at rest: untouched', () => {
    const p = unitPose(newUnitPose(), 0, 1.23, false)
    expect(p).toEqual({ dx: 0, sx: 1, sy: 1, pale: 0, glow: 1 })
  })

  it('in danger: shrunk (≥ 14 %), pale, a guttering glow, trembling', () => {
    let tremble = 0
    for (let i = 0; i < 60; i++) {
      const p = unitPose(newUnitPose(), 1, i / 60, false)
      expect(p.sx).toBeLessThanOrEqual(0.86 + 1e-9)
      expect(p.sy).toBeLessThan(p.sx)
      expect(p.pale).toBeGreaterThanOrEqual(0.4 - 1e-9)
      expect(p.glow).toBeLessThanOrEqual(0.55 + 1e-9)
      tremble = Math.max(tremble, Math.abs(p.dx))
    }
    expect(tremble).toBeGreaterThan(0.02)
  })

  it('reduced motion: the same pale, shrunk flame — static (no tremble, no flicker)', () => {
    const a = unitPose(newUnitPose(), 1, 0.1, true)
    const b = unitPose(newUnitPose(), 1, 2.7, true)
    expect(a).toEqual(b)
    expect(a.dx).toBe(0)
    expect(a.sx).toBeLessThan(0.9)
    expect(a.pale).toBeGreaterThan(0.4)
  })

})

describe('the unit shows the danger on the board', () => {
  it('cowers while a monster wears the `1` pip (with the lit skull), and recovers when none does', () => {
    const g = rig([mon('slime', 3, ROWS - 1)])
    for (let i = 0; i < 60; i++) g.step()
    expect(g.x.unitFear).toBeGreaterThan(0.95)
    expect(g.x.skullLit).toBeGreaterThan(0.95)
    g.e.state.monsters.length = 0
    for (let i = 0; i < 90; i++) g.step()
    expect(g.x.unitFear).toBeLessThan(0.05)
  })

  it('stays calm for a `2` pip', () => {
    const g = rig([mon('slime', 3, ROWS - 2)])
    for (let i = 0; i < 60; i++) g.step()
    expect(g.x.unitFear).toBeLessThan(0.01)
  })

  it('smokes while it sputters — never under reduced motion', () => {
    const smoke = (reduced: boolean): number => {
      const g = rig([mon('slime', 3, ROWS - 1)])
      g.r.reducedMotion = reduced
      const spy = vi.spyOn(g.r.vfx, 'floater')
      for (let i = 0; i < 120; i++) g.step()
      return spy.mock.calls.length
    }
    expect(smoke(false)).toBeGreaterThan(2)
    expect(smoke(true)).toBe(0)
  })
})

describe('DamageWatch / GoldVolley', () => {
  it('a rise on the same engine is a purchase; the first look after a reset or a resync only adopts', () => {
    const w = new DamageWatch()
    expect(w.rose(1)).toBe(false)
    expect(w.rose(1)).toBe(false)
    expect(w.rose(1.25)).toBe(true)
    expect(w.rose(1.25)).toBe(false)
    expect(w.rose(1)).toBe(false) // a fall is never a purchase
    expect(w.rose(1.25)).toBe(true)
    w.reset()
    expect(w.rose(3)).toBe(false)
    w.resync()
    expect(w.rose(4)).toBe(false)
    expect(w.rose(5)).toBe(true)
    expect(w.rose(Number.NaN)).toBe(false)
  })

  it('arms on the purchase, burns from the next fire to that volley\'s end, then is spent', () => {
    const v = new GoldVolley()
    v.onFire()
    expect(v.active).toBe(false)
    v.arm()
    expect(v.active).toBe(false)
    v.onFire()
    expect(v.active).toBe(true)
    v.onVolleyEnd()
    expect(v.active).toBe(false)
    v.onFire()
    expect(v.active).toBe(false)
  })
})

describe('a Ball Damage purchase pays off where the player looks', () => {
  it('flares the unit at once with the power-up sound; the next volley\'s hit numbers burn gold and bigger, the one after is plain', () => {
    const grunt = mon('slime', 3, 4, 1e9)
    const g = rig([grunt])
    g.step()
    // A plain number first, for scale.
    g.hit(grunt)
    const plain = g.nums()[0]!
    expect(plain.style).toBe('dmg')
    const plainSize = plain.size
    g.clearNums()
    // The purchase: the state layer's setConfig on the live engine, in the aim phase.
    g.e.setConfig({ damageMult: g.e.state.config.damageMult * 1.25 })
    g.step()
    expect(g.x.unitFlare).toBeGreaterThan(0.95)
    expect(g.soundCount('ult-ready')).toBe(1)
    // Still aiming: nothing burns yet.
    g.hit(grunt)
    expect(g.nums()[0]!.style).toBe('dmg')
    g.clearNums()
    // The next volley burns gold, a little bigger; a crit stays a crit (bigger too).
    g.e.fire(Math.PI / 2)
    g.step()
    g.hit(grunt)
    const gold = g.nums()[0]!
    expect(gold.style).toBe('power')
    expect(gold.size).toBeCloseTo(plainSize * 1.2, 6)
    g.clearNums()
    g.hit(grunt, true)
    expect(g.nums()[0]!.style).toBe('crit')
    g.clearNums()
    // That volley ends: spent.
    g.e.recall()
    g.e.settle()
    g.step()
    expect(g.x.goldVolley.active).toBe(false)
    g.e.fire(Math.PI / 2)
    g.step()
    g.hit(grunt)
    expect(g.nums()[0]!.style).toBe('dmg')
    // One purchase, one flare.
    for (let i = 0; i < 30; i++) g.step()
    expect(g.soundCount('ult-ready')).toBe(1)
  })

  it('a purchase mid-volley burns the NEXT volley', () => {
    const grunt = mon('slime', 3, 4, 1e9)
    const g = rig([grunt])
    g.step()
    g.e.fire(Math.PI / 2)
    g.step()
    g.e.setConfig({ damageMult: 1.25 })
    g.step()
    expect(g.x.unitFlare).toBeGreaterThan(0.95)
    g.hit(grunt)
    expect(g.nums()[0]!.style).toBe('dmg')
    g.clearNums()
    g.e.recall()
    g.e.settle()
    g.step()
    g.e.fire(Math.PI / 2)
    g.step()
    g.hit(grunt)
    expect(g.nums()[0]!.style).toBe('power')
  })

  it('an engine swap (reload / restart) never flares, whatever its damage', () => {
    const g = rig([mon('slime', 3, 4, 1e9)])
    g.step()
    const stronger = board({ monsters: [mon('slime', 2, 3, 1e9)], config: { damageMult: 3.05 } })
    g.r.setEngine(stronger)
    stronger.on((ev) => g.r.onEvent(ev))
    // The state layer re-applies its tuning to a restored run right after the swap.
    stronger.setConfig({ damageMult: 3.05 })
    for (let i = 0; i < 10; i++) {
      stronger.update(DT)
      g.x.time += DT
      g.x.update(DT, stronger.state)
    }
    expect(g.x.unitFlare).toBe(0)
    expect(g.soundCount('ult-ready')).toBe(0)
    // …but a purchase on it afterwards does.
    stronger.setConfig({ damageMult: 3.05 * 1.25 })
    g.x.update(DT, stronger.state)
    expect(g.x.unitFlare).toBeGreaterThan(0.95)
  })

  it('a cloud hydrate that raised the levels (resyncPower) is adopted silently', () => {
    const g = rig([mon('slime', 3, 4, 1e9)])
    g.step()
    g.r.resyncPower()
    g.e.setConfig({ damageMult: 2.44 })
    g.step()
    expect(g.x.unitFlare).toBe(0)
    expect(g.soundCount('ult-ready')).toBe(0)
  })

  it('a capacity purchase (damage unchanged) does nothing here', () => {
    const g = rig([mon('slime', 3, 4, 1e9)])
    g.step()
    g.e.setConfig({ trayCapacity: 4 })
    g.step()
    expect(g.x.unitFlare).toBe(0)
    pass(g.e)
    g.step()
    expect(g.x.goldVolley.active).toBe(false)
  })
})
