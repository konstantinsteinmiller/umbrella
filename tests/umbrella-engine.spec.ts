import { describe, expect, it } from 'vitest'
import { createWorld, step, type GameEvent, type Input, type World } from '@/umbrella/engine'
import { LEVELS } from '@/umbrella/levels'
import { DEFAULT_TUNING as T } from '@/umbrella/tuning'

const DT = 1 / 120
const run = (w: World, seconds: number, input: (w: World) => Partial<Input> = () => ({})) => {
  const events: GameEvent[] = []
  for (let i = 0; i < seconds / DT && w.phase === 'play'; i++) {
    events.push(...step(w, { left: false, right: false, toggle: false, ...input(w) }, DT, T))
  }
  return events
}
const level = (n: number) => createWorld(LEVELS[n - 1]!)

describe('umbrella engine', () => {
  it('auto-opens the umbrella on stepping off a platform', () => {
    const w = level(7)
    run(w, 0.3)
    expect(w.player.grounded).toBe(true)
    const ev = run(w, 1, () => ({ right: true }))
    expect(ev).toContain('open')
    expect(w.player.open).toBe(true)
  })

  it('floats down onto the level 7 finish and wins', () => {
    const w = level(7)
    run(w, 0.3)
    // Walk right off the edge, then steer back over the finish.
    const ev = run(w, 20, (s) => {
      const cx = s.player.x + 12
      if (!s.player.grounded) return { left: cx > 640, right: cx < 630 }
      return { right: true }
    })
    expect(ev).toContain('win')
  })

  it('an open umbrella brakes a fall to float speed within the braking snap', () => {
    const w = level(12)
    w.player.y += 200
    w.player.vy = 900
    step(w, { left: false, right: false, toggle: true }, DT, T)
    run(w, T.brakingSnap + 0.02)
    expect(w.player.vy).toBeLessThanOrEqual(T.floatSpeed + 1)
  })

  it('reopening at terminal velocity breaks the umbrella', () => {
    const w = level(12)
    w.player.y += 300
    w.player.vy = T.terminalVelocity
    const ev = step(w, { left: false, right: false, toggle: true }, DT, T)
    expect(ev).toContain('break')
    expect(w.player.open).toBe(false)
    expect(w.player.broken).toBe(true)
  })

  it('a long closed fall splats on landing (level 12)', () => {
    const w = level(12)
    w.player.y += 60
    w.player.open = false
    const ev = run(w, 10)
    expect(ev).toContain('splat')
  })

  it('an updraft lifts an open umbrella and holds it near the top edge', () => {
    const w = level(1)
    const wind = LEVELS[0].winds[0]
    w.player.x = wind.x + 150
    w.player.y = wind.y + 250
    w.player.open = true
    run(w, 3)
    const cy = w.player.y + 18
    expect(cy).toBeGreaterThan(wind.y - 30)
    expect(cy).toBeLessThan(wind.y + 60)
  })

  it('a closed umbrella drops through a wind current', () => {
    const w = level(3)
    w.player.x = 900
    w.player.y = 240
    w.player.open = false
    run(w, 0.4)
    expect(w.player.y).toBeGreaterThan(300)
  })

  it('falling off the bottom is out of bounds', () => {
    const w = level(1)
    w.player.x = 300
    w.player.y = 700
    w.player.open = false
    expect(run(w, 2)).toContain('out')
  })
})
