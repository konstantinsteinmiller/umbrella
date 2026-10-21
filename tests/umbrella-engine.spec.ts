import { describe, expect, it } from 'vitest'
import { createWorld, step, type GameEvent, type Input, type World } from '@/umbrella/engine'
import { LEVELS } from '@/umbrella/levels'
import { cameraFor } from '@/umbrella/renderer'
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

  it('an open umbrella bobs at the top of an updraft, then settles (Revision 1)', () => {
    const w = level(1)
    const wind = LEVELS[0].winds[0]
    w.player.x = wind.x + 150
    w.player.y = wind.y + 250
    w.player.open = true
    const ys: number[] = []
    for (let i = 0; i < 8 * 120; i++) {
      step(w, { left: false, right: false, toggle: false }, 1 / 120, T)
      ys.push(w.player.y + 18 - wind.y)
    }
    // Overshoots above the current, sinks back in, rises again: a bob.
    expect(Math.min(...ys)).toBeLessThan(-20)
    let turns = 0
    for (let i = 2; i < ys.length; i++) if (Math.sign(ys[i]! - ys[i - 1]!) !== Math.sign(ys[i - 1]! - ys[i - 2]!)) turns++
    expect(turns).toBeGreaterThanOrEqual(3)
    // …and it dies out rather than bouncing forever.
    const tail = ys.slice(-120)
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(12)
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

  it('ships all 27 levels (24 GDD + 2 from the editor + 1 scrolling), and every spawn is safe', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1))
    for (const lv of LEVELS) {
      const w = createWorld(lv)
      const ev = run(w, 1)
      expect(ev, `level ${lv.id}`).not.toContain('hit')
      expect(w.phase, `level ${lv.id}`).toBe('play')
      expect(w.player.grounded, `level ${lv.id}`).toBe(true)
    }
  })

  it('a closed umbrella still feels a little updraft resistance', () => {
    const fall = (lv: number, x: number, y: number) => {
      const w = level(lv)
      w.player.x = x
      w.player.y = y
      w.player.open = false
      run(w, 0.3)
      return w.player.vy
    }
    // Same drop inside level 3's updraft vs. in level 7's still air.
    expect(fall(3, 600, 260)).toBeLessThan(fall(7, 200, 260))
  })

  it('riding a Super Stream open into the ceiling is a splat; fluttering avoids it', () => {
    const ride = (flutter: boolean) => {
      const w = level(21)
      w.player.x = 600
      w.player.y = 560
      w.player.open = true
      return run(w, 4, (w) => ({ toggle: flutter && w.player.vy < -380 ? w.player.open : !w.player.open && w.player.vy > 0 }))
    }
    expect(ride(false)).toContain('splat')
    expect(ride(true)).not.toContain('splat')
  })

  it('touching an enemy resets the level', () => {
    const w = level(18)
    const mine = w.hazards[0]!
    w.player.x = mine.x
    w.player.y = mine.y
    expect(run(w, 0.1)).toContain('hit')
    expect(w.phase).toBe('splat')
  })

  it('an attacking pillar lunges and returns; an arriving mine glides in and stays', () => {
    const w15 = level(15)
    const xs: number[] = []
    run(w15, 3.2, (w) => { xs.push(w.hazards[0]!.x); return {} })
    expect(Math.min(...xs)).toBeLessThan(xs[0]! - 200)
    expect(Math.abs(xs[xs.length - 1]! - xs[0]!)).toBeLessThan(5)
    const w22 = level(22)
    w22.player.x = 100
    const startX = w22.hazards[0]!.x
    run(w22, 5)
    expect(w22.hazards[0]!.x).toBeLessThan(startX - 500)
  })

  it('enemy speed scale speeds up every enemy; player size follows tuning', () => {
    const at = (scale: number) => {
      const w = level(20)
      for (let i = 0; i < 60; i++) step(w, { left: false, right: false, toggle: false }, DT, { ...T, enemySpeedScale: scale })
      return w.enemyTime
    }
    expect(at(2)).toBeCloseTo(at(1) * 2, 5)
    const w = level(1)
    run(w, 0.5)
    const feet = w.player.y + w.player.h
    step(w, { left: false, right: false, toggle: false }, DT, { ...T, playerWidth: 40, playerHeight: 50 })
    expect(w.player.w).toBe(40)
    expect(w.player.y + w.player.h).toBeCloseTo(feet, 0)
  })

  it('the tuning export round-trips every level knob, enemies included', async () => {
    const { exportTuning, applyTuning } = await import('@/umbrella/tuningGui')
    const data = exportTuning(T, LEVELS)
    const l15 = data.levels.find((l) => l.id === 15)!
    expect(Object.keys(l15.values)).toContain('hazards.0.motion.period')
    const before = l15.values['hazards.0.motion.period']!
    const tuning = { ...T }
    applyTuning({ tuning: { ...T, gravity: 999 }, levels: [{ id: 15, values: { 'hazards.0.motion.period': 9 } }] }, tuning, LEVELS)
    expect(tuning.gravity).toBe(999)
    expect((LEVELS[14]!.hazards![0]!.motion as { period: number }).period).toBe(9)
    applyTuning({ levels: [{ id: 15, values: { 'hazards.0.motion.period': before } }] }, tuning, LEVELS)
  })

  it('the scrolling level 27 is winnable walking right and dropping onto each platform, and its camera follows inside the world', () => {
    const w = level(27)
    const seen: number[] = []
    const ev = run(w, 40, (s) => {
      seen.push(-cameraFor(s, 1280, 720, DT).ox)
      const cx = s.player.x + s.player.w / 2
      const over = s.platforms.some((p) => cx > p.x + 30 && cx < p.x + p.w - 30)
      return { right: s.player.grounded || !over }
    })
    expect(ev).toContain('win')
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...seen)).toBeLessThanOrEqual(2780 - 1280 + 1e-6)
    expect(Math.max(...seen)).toBeGreaterThan(1200)
    // A portrait phone keeps the screen's full width and is centred vertically.
    const tall = cameraFor(w, 390, 844)
    expect(tall.s).toBeCloseTo(390 / 1280)
    expect(tall.oy).toBeGreaterThan(0)
  })
})
