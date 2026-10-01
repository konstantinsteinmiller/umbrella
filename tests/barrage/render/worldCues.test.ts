// Silent Flow's in-world cues (`render/worldCues.ts` + BoardRenderer): the
// lessons that used to pause the game and dim the screen are drawn on the
// board while play goes on — the FTUE's "+1" pulses, and the first danger
// flashes the danger rows with the threatening monster's pip beside the unit's.
import { beforeAll, describe, expect, it } from 'vitest'
import { BoardRenderer } from '@/barrage/render/BoardRenderer'
import {
  DANGER_FLASH_BLINKS, DANGER_FLASH_S, dangerFlashK, flashDanger, setPlusPulse, worldCues
} from '@/barrage/render/worldCues'
import type { BoardState } from '@/barrage/engine/types'
import { board, mon } from '../engine/helpers'

// jsdom has no 2D canvas: a context where every call is a no-op (see killHold.test.ts).
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
  dangerFlashNow: number
  dangerFlashId: number
}

describe('the danger flash', () => {
  it('DANGER_FLASH_BLINKS bright peaks in DANGER_FLASH_S, dark between them and outside', () => {
    expect(dangerFlashK(-0.1)).toBe(0)
    expect(dangerFlashK(1)).toBe(0)
    let peaks = 0
    let prev = 0
    let rising = false
    for (let i = 0; i <= 1000; i++) {
      const k = dangerFlashK(i / 1000)
      if (k < prev && rising && prev > 0.95) peaks++
      rising = k > prev
      prev = k
    }
    expect(peaks).toBe(DANGER_FLASH_BLINKS)
    expect(DANGER_FLASH_S).toBeLessThanOrEqual(1.5)
  })

  it('reduced motion: one steady glow that fades, no blinking', () => {
    expect(dangerFlashK(0, true)).toBe(1)
    expect(dangerFlashK(0.5, true)).toBeCloseTo(0.5)
    expect(dangerFlashK(0.99, true)).toBeLessThan(0.05)
  })

  it('a renderer flashes once per cue, on board time, and a new board never replays an old one', () => {
    const threat = mon('slime', 3, 8, 3)
    const e = board({ monsters: [threat], launcherX: 3.5 })
    const r = new BoardRenderer({ shake: () => {}, coins: () => true, confetti: () => {} })
    r.setEngine(e)
    const x = r as unknown as Internals
    const step = (dt: number): void => { x.time += dt; x.update(dt, e.state) }
    step(0.016)
    expect(x.dangerFlashNow).toBe(0)
    flashDanger(threat.id)
    step(0.016)
    expect(x.dangerFlashId).toBe(threat.id)
    step(DANGER_FLASH_S / (2 * DANGER_FLASH_BLINKS) - 0.016) // the first peak
    expect(x.dangerFlashNow).toBeGreaterThan(0.9)
    step(DANGER_FLASH_S)
    expect(x.dangerFlashNow).toBe(0)
    // Paused (no board time): nothing moves on.
    flashDanger(threat.id)
    step(0.016)
    step(0.1)
    const k = x.dangerFlashNow
    expect(k).toBeGreaterThan(0)
    step(0)
    expect(x.dangerFlashNow).toBe(k)
    // A new board (restart) drops it.
    r.setEngine(board({ monsters: [mon('slime', 3, 8, 3)] }))
    step(0.016)
    expect(x.dangerFlashNow).toBe(0)
  })
})

describe('the "+1" pulse', () => {
  it('is a flag the FTUE sets and clears (the board draws it while it is on)', () => {
    setPlusPulse(true)
    expect(worldCues.plusPulse).toBe(true)
    setPlusPulse(false)
    expect(worldCues.plusPulse).toBe(false)
  })
})
