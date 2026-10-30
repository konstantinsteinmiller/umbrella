import { describe, expect, it } from 'vitest'
import { createWorld, step, type GameEvent, type Input, type World } from '@/umbrella/engine'
import { LEVELS } from '@/umbrella/levels'
import { cameraFor, PORTRAIT_FILL, PORTRAIT_ZOOM } from '@/umbrella/renderer'
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
    // A portrait phone zooms in past the screen's full width and is centred vertically.
    const tall = cameraFor(w, 390, 844)
    const screenH = w.level.view?.h ?? w.level.world.h
    expect(tall.s).toBeCloseTo(Math.max((390 / 1280) * PORTRAIT_ZOOM, (844 * PORTRAIT_FILL) / screenH))
    expect(tall.oy).toBeGreaterThan(0)
  })

  it('portrait screens zoom a one-screen level in until it fills PORTRAIT_FILL of the height and follow the player sideways inside the world; landscape keeps the whole level', () => {
    const w = level(1)
    const { w: ww, h: wh } = w.level.world
    const wide = cameraFor(w, 1280, 720)
    expect(wide.s).toBeCloseTo(Math.min(1280 / ww, 720 / wh))
    const phone = cameraFor(w, 390, 844)
    expect(phone.s).toBeCloseTo(Math.max(Math.min(390 / ww, 844 / wh) * PORTRAIT_ZOOM, (844 * PORTRAIT_FILL) / wh))
    // The level's height fills most of the screen's.
    expect((wh * phone.s) / 844).toBeGreaterThanOrEqual(PORTRAIT_FILL - 1e-9)
    // The screen shows less than the world's width: the view stays inside the world …
    expect(phone.ox).toBeLessThanOrEqual(0)
    expect(phone.ox).toBeGreaterThanOrEqual(390 - ww * phone.s - 1e-6)
    // … and is centred vertically, the level's height fitting with room to spare.
    expect(phone.oy).toBeCloseTo((844 - wh * phone.s) / 2)
    // A player at the right end of the level brings the camera there.
    const far = level(1)
    far.player.x = ww - far.player.w - 10
    expect(cameraFor(far, 390, 844).ox).toBeCloseTo(390 - ww * phone.s)
  })

  it('a proximity-triggered Walldorf waits, strikes once at an airborne player in range, faster with speed; non-hostile never hurts', () => {
    const lungeAt = (extra: object, harmless = false) => createWorld({
      id: 99, world: { w: 1280, h: 720 }, spawn: { x: 160, y: 400 },
      platforms: [{ x: 60, y: 440, w: 200, h: 20 }], winds: [],
      hazards: [{ kind: 'pillar', x: 0, y: 0, w: 40, h: 110, harmless,
        motion: { kind: 'lunge', a: { x: 700, y: 300 }, b: { x: 300, y: 300 }, period: 3.2, trigger: true, radius: 250, ...extra } }]
    })
    const cx = (w: World) => w.hazards[0]!.x + 20
    // Standing on the start platform, far away: no attack.
    const idle = lungeAt({})
    run(idle, 3)
    expect(cx(idle)).toBeCloseTo(700)
    // In the air within the radius: it strikes, then comes back to rest.
    const hit = lungeAt({})
    hit.player.x = 520; hit.player.y = 280; hit.player.grounded = false
    const ev = run(hit, 3, (s) => { s.player.vy = 0; s.player.y = 280; return {} })
    expect(ev).toContain('hit')
    // Speed 3 reaches the far end sooner than speed 1.
    const reach = (speed: number) => {
      const w = lungeAt({ speed }, true)
      w.player.x = 600; w.player.y = 100; w.player.grounded = false
      let n = 0
      while (cx(w) > 310 && n < 1000) { step(w, { left: false, right: false, toggle: false }, DT, T); w.player.y = 100; w.player.vy = 0; n++ }
      return n
    }
    expect(reach(3)).toBeLessThan(reach(1))
    // Non-hostile: the same strike through the player is no hit.
    const safe = lungeAt({}, true)
    safe.player.x = 520; safe.player.y = 280; safe.player.grounded = false
    expect(run(safe, 3, (s) => { s.player.vy = 0; return {} })).not.toContain('hit')
  })
})

describe('portrait camera look-ahead', () => {
  const centreSeen = (cam: { s: number; ox: number }) => (-cam.ox + 390 / 2) / cam.s
  it('leans the way the player moves, so what lies ahead is on screen', () => {
    for (const dir of [1, -1]) {
      const w = level(1)
      const pl = w.player
      pl.x = w.level.world.w / 2 - pl.w / 2
      pl.vx = 0
      cameraFor(w, 390, 844, 0)
      pl.vx = dir * 220
      let cam = cameraFor(w, 390, 844, 1 / 60)
      for (let i = 0; i < 240; i++) cam = cameraFor(w, 390, 844, 1 / 60)
      const ahead = (centreSeen(cam) - (pl.x + pl.w / 2)) * dir
      // He stays in the quarter of the screen behind the way he moves.
      expect(ahead).toBeGreaterThan((390 / cam.s) * 0.25)
    }
  })
})

describe('a bouncy Walldorf against a platform', () => {
  it('crushes Pweeg (splat) instead of pushing him into or through the platform', () => {
    const lvl = {
      id: 0, world: { w: 1280, h: 720 }, spawn: { x: 400, y: 380 },
      platforms: [{ x: 300, y: 400, w: 400, h: 40 }], winds: [],
      // A bouncy Walldorf right on top of him: the shallowest way out is down, into the ledge.
      hazards: [{ kind: 'pillar' as const, x: 380, y: 300, w: 120, h: 90, contact: 'bounce' as const }]
    }
    const w = createWorld(lvl)
    const pl = w.player
    pl.x = 420; pl.y = 400 - pl.h; pl.vx = 0; pl.vy = 0
    const ev = step(w, { left: false, right: false, toggle: false } as Input, 1 / 60, T)
    expect(w.phase).toBe('splat')
    expect(ev).toContain('splat')
  })

  it('still bounces him off when there is room', () => {
    const lvl = {
      id: 0, world: { w: 1280, h: 720 }, spawn: { x: 100, y: 380 },
      platforms: [{ x: 0, y: 400, w: 200, h: 40 }], winds: [],
      hazards: [{ kind: 'pillar' as const, x: 600, y: 200, w: 60, h: 200, contact: 'bounce' as const }]
    }
    const w = createWorld(lvl)
    const pl = w.player
    pl.x = 600 - pl.w + 6; pl.y = 260; pl.vx = 0; pl.vy = 0
    step(w, { left: false, right: false, toggle: false } as Input, 1 / 60, T)
    expect(w.phase).toBe('play')
    expect(pl.vx).toBeLessThan(0)
  })
})

describe('a Walldorf pressing down on Pweeg as he stands on a platform', () => {
  it('crushes him even when it overlaps him by only a pixel', () => {
    const lvl = {
      id: 0, world: { w: 1280, h: 720 }, spawn: { x: 400, y: 380 },
      platforms: [{ x: 300, y: 400, w: 400, h: 40 }], winds: [],
      hazards: [{ kind: 'pillar' as const, x: 380, y: 300, w: 140, h: 60, contact: 'bounce' as const }]
    }
    const w = createWorld(lvl)
    const pl = w.player
    pl.x = 420; pl.y = 400 - pl.h; pl.vx = 0; pl.vy = 0
    // The Walldorf's bottom just 1 px into his head.
    w.hazards[0]!.y = pl.y - 60 + 1
    step(w, { left: false, right: false, toggle: false } as Input, 1 / 60, T)
    expect(w.phase).toBe('splat')
  })
})
