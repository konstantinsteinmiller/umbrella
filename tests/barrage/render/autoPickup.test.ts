import { describe, expect, it } from 'vitest'
import { BoardVfx, FLIER_DUR, FLIER_GAP } from '@/barrage/render/vfx'

const STEP = 1 / 120

/** Advance the pool in small steps, logging launch / arrive times. */
const run = (v: BoardVfx, seconds: number, log: { launches: number[]; arrivals: number[] }, t0 = 0): number => {
  let t = t0
  v.onFlierLaunch = () => { log.launches.push(t) }
  v.onFlierArrive = () => { log.arrivals.push(t) }
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    t += STEP
    v.update(STEP)
  }
  return t
}

describe('auto-collected "+1" fliers', () => {
  it('two autos in the same frame launch FLIER_GAP apart and both arrive', () => {
    const v = new BoardVfx()
    expect(v.flyToLauncher(1.5, 9.5)).toBe(true)
    expect(v.flyToLauncher(4.5, 3.5)).toBe(true)
    const log = { launches: [] as number[], arrivals: [] as number[] }
    run(v, 1.5, log)
    expect(log.launches).toHaveLength(2)
    expect(log.arrivals).toHaveLength(2)
    expect(log.launches[1]! - log.launches[0]!).toBeCloseTo(FLIER_GAP, 1)
    expect(log.arrivals[0]! - log.launches[0]!).toBeCloseTo(FLIER_DUR, 1)
    expect(v.fliers.every((f) => !f.on)).toBe(true)
  })

  it('an auto long after the last one is not delayed', () => {
    const v = new BoardVfx()
    v.flyToLauncher(2.5, 9.5)
    const log = { launches: [] as number[], arrivals: [] as number[] }
    const t = run(v, 1, log)
    v.flyToLauncher(3.5, 9.5)
    const log2 = { launches: [] as number[], arrivals: [] as number[] }
    run(v, 0.2, log2, t)
    expect(log2.launches).toHaveLength(1)
    expect(log2.launches[0]! - t).toBeLessThan(STEP * 1.5)
  })

  it('starts at the pickup and ends on the (moving) launcher target', () => {
    const v = new BoardVfx()
    v.flyToLauncher(1.5, 9.5)
    v.flyTargetX = 5
    v.flyTargetY = 10.7
    const f = v.fliers.find((x) => x.on)!
    const out = { x: 0, y: 0 }
    v.flierPos(f, 0, out)
    expect(out).toEqual({ x: 1.5, y: 9.5 })
    v.flierPos(f, 0.5, out)
    expect(out.y).toBeLessThan(9.5) // lifts off: the arc rises above both ends
    v.flyTargetX = 2 // launcher glides mid-flight — the flier homes on it
    v.flierPos(f, 1, out)
    expect(out.x).toBeCloseTo(2)
    expect(out.y).toBeCloseTo(10.7)
  })

  it('a full pool drops the show, never throws', () => {
    const v = new BoardVfx()
    let ok = 0
    for (let i = 0; i < 40; i++) if (v.flyToLauncher(3, 9)) ok++
    expect(ok).toBe(v.fliers.length)
  })
})
