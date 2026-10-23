import { describe, expect, it } from 'vitest'
import { LEVELS } from '@/umbrella/levels'
import { DEFAULT_TUNING } from '@/umbrella/tuning'
import { createIntro, simulateChad, startPlatform, type IntroSfx } from '@/umbrella/intro'

const L1 = LEVELS[0]!

describe('intro cutscene', () => {
  it('finds the start platform under the spawn', () => {
    const p = startPlatform(L1)!
    expect(L1.spawn.x).toBeGreaterThanOrEqual(p.x)
    expect(L1.spawn.x).toBeLessThanOrEqual(p.x + p.w)
  })
  it("Chad's float, simulated with the real engine, gets across Level 1", () => {
    const p = startPlatform(L1)!
    const frames = simulateChad(L1, { x: p.x + p.w - 40, y: p.y }, DEFAULT_TUNING)
    expect(frames).not.toBeNull()
    expect(frames!.some((f) => f.airborne)).toBe(true)
    expect(frames!.at(-1)!.x).toBeGreaterThan(p.x + p.w + 150)
  })
  it('plays its beats in order, ends by itself, and can be skipped', () => {
    const heard: IntroSfx[] = []
    const intro = createIntro(L1, DEFAULT_TUNING, (n) => heard.push(n))
    let t = 0
    while (!intro.done && t < 30) { intro.update(1 / 60); t += 1 / 60 }
    expect(intro.done).toBe(true)
    expect(t).toBeGreaterThan(6)
    expect(t).toBeLessThan(20)
    expect(heard.slice(0, 4)).toEqual(['whoosh', 'land', 'cool', 'open'])
    expect(heard).toContain('step')
    const skipped = createIntro(L1, DEFAULT_TUNING, () => {})
    skipped.update(0.5)
    skipped.skip()
    expect(skipped.done).toBe(true)
  })
  it('falls back to a scripted glide when the float cannot cross', () => {
    // No current at all: Chad would just drop. The intro still completes.
    const flat = { ...L1, winds: [] }
    expect(simulateChad(flat, { x: 240, y: 440 }, DEFAULT_TUNING)).toBeNull()
    const intro = createIntro(flat, DEFAULT_TUNING, () => {})
    for (let i = 0; i < 60 * 30 && !intro.done; i++) intro.update(1 / 60)
    expect(intro.done).toBe(true)
  })
})
