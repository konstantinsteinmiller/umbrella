// Fun pass after playtest run 6 (fun 4/4/4/3): the renderer side.
//   • the resting aim line — where a tap on the unit fires, traced to the
//     second bounce, in every calm aim phase ("am I even aiming?");
//   • a volley that never touches the live boss is a visible whiff
//     ("the 65 never moved");
//   • the combo tally ("×hits" + "+coins") after a volley whose rattles paid;
//   • the red floor lights at the pips' threshold (3 marches), not at rows.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { BoardRenderer } from '@/barrage/render/BoardRenderer'
import type { AimPath } from '@/barrage/engine/types'
import { ROWS } from '@/barrage/engine/types'
import { board, mon } from '../engine/helpers'

beforeAll(() => {
  const noop: unknown = new Proxy(function () {}, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => 8 : noop),
    apply: () => noop,
    set: () => true
  })
  HTMLCanvasElement.prototype.getContext = (() => noop) as unknown as HTMLCanvasElement['getContext']
})

const DT = 1 / 60
const UP = Math.PI / 2

type Peek = {
  drawAimPath(ctx: unknown, p: AimPath, t: number, k: number): void
  plateShake: number
  comboTallyT: number
  comboStr: string
  comboPaidStr: string
  danger: number
}

const rig = (monsters = [mon('slime', 1, 2), mon('slime', 5, 4)], launcherX = 3.5) => {
  const e = board({ monsters, launcherX })
  const r = new BoardRenderer({ shake: () => {}, coins: () => true, confetti: () => {} })
  r.attach(document.createElement('canvas'))
  r.resize(390, 700, 1)
  r.setEngine(e)
  e.on((ev) => r.onEvent(ev))
  const peek = r as unknown as Peek
  const draw = vi.spyOn(peek, 'drawAimPath')
  const frame = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      e.update(DT)
      r.frame(DT)
    }
  }
  return { e, r, peek, draw, frame }
}

describe('the resting aim line', () => {
  it('shows the repeat angle\'s path to the second bounce, faint, once the aim phase settles', () => {
    const g = rig()
    g.r.setRestAngle(1.2)
    g.frame(40)
    const call = g.draw.mock.lastCall
    expect(call).toBeDefined()
    expect(call![1].points).toEqual(g.e.aimPreview(1.2, 2).points)
    expect(call![3]).toBeGreaterThan(0.2)
    expect(call![3]).toBeLessThanOrEqual(0.42 + 1e-9)
  })

  it('stands aside while a finger aims, and while the coach demonstrates a shot', () => {
    const g = rig()
    g.frame(40)
    g.r.setAim(true, 1.0, true)
    g.draw.mockClear()
    g.frame(20)
    // Only the live preview (k = 1) is drawn while the finger is down.
    for (const c of g.draw.mock.calls) expect(c[3]).toBe(1)
    g.r.setAim(false, 1.0, false)
    g.r.restHidden = true
    g.frame(30)
    g.draw.mockClear()
    g.frame(5)
    expect(g.draw).not.toHaveBeenCalled()
  })
})

describe('boss whiff feedback', () => {
  const bossBoard = (launcherX: number) =>
    rig([mon('boss', 0, 0, 1e9, { bossKind: 'worm', spawnRow: 20 })], launcherX)

  it('a volley that never touches the boss wobbles its plate', () => {
    const g = bossBoard(5.5)
    g.frame(2)
    expect(g.peek.plateShake).toBe(0)
    g.e.fire(UP)
    for (let i = 0; i < 600 && g.e.state.phase === 'volley'; i++) g.frame()
    expect(g.e.state.phase).not.toBe('volley')
    g.frame()
    expect(g.peek.plateShake).toBeGreaterThan(0.5)
  })

  it('a volley that hits it does not', () => {
    const g = bossBoard(1.5)
    g.e.fire(UP)
    for (let i = 0; i < 240 && g.e.state.phase === 'volley'; i++) g.frame()
    expect(g.peek.plateShake).toBe(0)
  })
})

describe('combo tally', () => {
  it('pops "×hits" and "+coins" for a volley whose rattles paid, then fades', () => {
    const g = rig()
    g.r.onEvent({ type: 'comboBonus', hits: 64, balls: 3, coins: 12 })
    expect(g.peek.comboTallyT).toBeGreaterThan(1)
    expect(g.peek.comboStr).toBe('×64')
    expect(g.peek.comboPaidStr).toBe('+12')
    g.frame(120)
    expect(g.peek.comboTallyT).toBe(0)
  })

  it('a volley that paid nothing shows no tally', () => {
    const g = rig()
    g.r.onEvent({ type: 'comboBonus', hits: 9, balls: 3, coins: 0 })
    expect(g.peek.comboTallyT).toBe(0)
  })
})

describe('one danger threshold', () => {
  it('the red floor lights with the `3` pip (2 rows of space) and stays dark one row further out', () => {
    const lit = rig([mon('slime', 3, ROWS - 3, 1e9)])
    lit.frame(60)
    expect(lit.peek.danger).toBeGreaterThan(0.3)
    const dark = rig([mon('slime', 3, ROWS - 4, 1e9)])
    dark.frame(60)
    expect(dark.peek.danger).toBeLessThan(0.05)
  })
})
