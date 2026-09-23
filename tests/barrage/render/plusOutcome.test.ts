// A collected "+1" pops what it actually became (BoardRenderer.flushPlus):
// "+1" only when it added a shot, never when the full tray merged it or paid
// it out as coins — the "why do my shots duplicate only sometimes" fix.
import { beforeAll, describe, expect, it } from 'vitest'
import { BoardRenderer } from '@/barrage/render/BoardRenderer'
import type { EngineEvent } from '@/barrage/engine/types'

// jsdom has no 2D canvas; the pickup VFX bake glow dots. A context where every
// call and property is a no-op is all this suite needs — it asserts on the
// VFX pool, not on pixels.
beforeAll(() => {
  const noop: unknown = new Proxy(function () {}, {
    get: () => noop,
    apply: () => noop,
    set: () => true
  })
  HTMLCanvasElement.prototype.getContext = (() => noop) as unknown as HTMLCanvasElement['getContext']
})

const make = (): BoardRenderer => new BoardRenderer({ shake: () => {}, coins: () => true, confetti: () => {} })
const plusOnes = (r: BoardRenderer): number => r.vfx.nums.filter((n) => n.on && n.text === '+1').length
/** What the renderer's frame does first: settle a pending "+1". */
const flush = (r: BoardRenderer): void => {
  const x = r as unknown as { plusPending: boolean; flushPlus(): void }
  if (x.plusPending) x.flushPlus()
}

const PICK: EngineEvent = { type: 'pickup', pickupId: 1, kind: 'ball', x: 3.5, y: 5.5 }
const ADD: EngineEvent = { type: 'trayAdd', tier: 1 }

describe('"+1" outcome pops', () => {
  it('a +1 that found a free slot says +1', () => {
    const r = make()
    r.onEvent(PICK)
    r.onEvent(ADD)
    flush(r)
    expect(plusOnes(r)).toBe(1)
  })

  it('a +1 the full tray merged does not claim a new shot', () => {
    const r = make()
    r.onEvent(PICK)
    r.onEvent(ADD)
    r.onEvent({ type: 'trayMerge', fromTier: 1, toTier: 2 })
    flush(r)
    expect(plusOnes(r)).toBe(0)
  })

  it('a +1 the full tray paid out as coins does not claim a new shot', () => {
    const r = make()
    r.onEvent(PICK)
    r.onEvent(ADD)
    r.onEvent({ type: 'trayOverflow', tier: 1, coins: 6 })
    flush(r)
    expect(plusOnes(r)).toBe(0)
  })

  it('two pickups in one step each get their own outcome', () => {
    const r = make()
    r.onEvent(PICK)
    r.onEvent(ADD)
    r.onEvent({ ...PICK, pickupId: 2, x: 1.5 }) // flushes the first (+1)
    r.onEvent(ADD)
    r.onEvent({ type: 'trayOverflow', tier: 1, coins: 6 })
    flush(r)
    expect(plusOnes(r)).toBe(1)
  })

  it('a pact merge with no pickup in flight leaves nothing pending', () => {
    const r = make()
    r.onEvent({ type: 'trayMerge', fromTier: 3, toTier: 4 })
    flush(r)
    expect(plusOnes(r)).toBe(0)
  })
})
