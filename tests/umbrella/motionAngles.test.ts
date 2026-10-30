import { describe, expect, it } from 'vitest'
import { createWorld, poseMovers } from '@/umbrella/engine'
import { KITE_LEVELS } from '@/umbrella/kiteLevels'
import { LEVELS, type LevelDef, type Motion } from '@/umbrella/levels'
import { decodeLevel, encodeLevel } from '@/umbrella/levelCode'

type Circle = Extract<Motion, { kind: 'circle' }>
type Swing = Extract<Motion, { kind: 'swing' }>

/** One mine riding `motion`; its centre at time t. */
const centreAt = (motion: Motion, t: number) => {
  const level: LevelDef = {
    id: 0, world: { w: 1280, h: 720 }, spawn: { x: 100, y: 400 },
    platforms: [{ x: 60, y: 440, w: 200, h: 20 }], winds: [],
    hazards: [{ kind: 'mine', x: 0, y: 0, w: 52, h: 52, motion }]
  }
  const w = createWorld(level)
  poseMovers(w, t)
  const h = w.hazards[0]!
  return { x: h.x + h.w / 2, y: h.y + h.h / 2 }
}
// The formulas before swing angles and circle phases existed.
const oldCircle = (m: Circle, t: number) => {
  const a = (t / m.period) * Math.PI * 2
  return { x: m.center.x + Math.cos(a) * m.radius, y: m.center.y + Math.sin(a) * m.radius }
}
const oldSwing = (m: Swing, t: number) => {
  const a = Math.sin((t / m.period) * Math.PI * 2) * m.amplitude
  return { x: m.pivot.x + Math.sin(a) * m.radius, y: m.pivot.y + Math.cos(a) * m.radius }
}
const expectAt = (got: { x: number; y: number }, want: { x: number; y: number }) => {
  expect(got.x).toBeCloseTo(want.x, 6)
  expect(got.y).toBeCloseTo(want.y, 6)
}
const TIMES = [0, 0.37, 1, 1.8, 2.5, 4.2]

describe('swing arc angle', () => {
  const swing: Swing = { kind: 'swing', pivot: { x: 640, y: 160 }, radius: 300, amplitude: 0.8, period: 4 }
  it('unset or 0 swings exactly as before (hanging straight down)', () => {
    for (const t of TIMES) {
      expectAt(centreAt(swing, t), oldSwing(swing, t))
      expectAt(centreAt({ ...swing, angle: 0 }, t), oldSwing(swing, t))
    }
    expectAt(centreAt(swing, 0), { x: 640, y: 460 })
  })
  it('turns the whole arc clockwise around the pivot: 90° hangs left, 180° stands up', () => {
    expectAt(centreAt({ ...swing, angle: 90 }, 0), { x: 340, y: 160 })
    expectAt(centreAt({ ...swing, angle: 180 }, 0), { x: 640, y: -140 })
    expectAt(centreAt({ ...swing, angle: -90 }, 0), { x: 940, y: 160 })
    // Every pose is the unrotated one turned 90° clockwise about the pivot: (dx, dy) → (-dy, dx).
    for (const t of TIMES) {
      const o = oldSwing(swing, t)
      expectAt(centreAt({ ...swing, angle: 90 }, t), { x: 640 - (o.y - 160), y: 160 + (o.x - 640) })
    }
  })
  it('a bad angle from untrusted JSON counts as 0', () => {
    expectAt(centreAt({ ...swing, angle: 'x' as unknown as number }, 1), oldSwing(swing, 1))
  })
})

describe('circle start phase', () => {
  const circle: Circle = { kind: 'circle', center: { x: 900, y: 360 }, radius: 120, period: 3 }
  it('unset or 0 starts at the right (3 o\'clock) and orbits exactly as before', () => {
    for (const t of TIMES) {
      expectAt(centreAt(circle, t), oldCircle(circle, t))
      expectAt(centreAt({ ...circle, phase: 0 }, t), oldCircle(circle, t))
    }
    expectAt(centreAt(circle, 0), { x: 1020, y: 360 })
  })
  it('moves the start clockwise: 90° at the bottom, 180° at the left, 270° at the top', () => {
    expectAt(centreAt({ ...circle, phase: 90 }, 0), { x: 900, y: 480 })
    expectAt(centreAt({ ...circle, phase: 180 }, 0), { x: 780, y: 360 })
    expectAt(centreAt({ ...circle, phase: 270 }, 0), { x: 900, y: 240 })
  })
  it('is the same orbit, just ahead in time by phase/360 of a period', () => {
    for (const t of TIMES) expectAt(centreAt({ ...circle, phase: 90 }, t), oldCircle(circle, t + circle.period / 4))
  })
})

describe('built-in levels', () => {
  it('every circle and swing mover is where it was before the new fields', () => {
    let seen = 0
    for (const level of [...LEVELS, ...KITE_LEVELS]) {
      const movers = [...level.platforms, ...(level.hazards ?? [])]
      for (const t of TIMES) {
        const w = createWorld(level)
        poseMovers(w, t)
        const posed = [...w.platforms, ...w.hazards]
        movers.forEach((p, i) => {
          const m = p.motion
          if (m?.kind !== 'circle' && m?.kind !== 'swing') return
          expect(m.kind === 'circle' ? m.phase : m.angle).toBeUndefined()
          const q = posed[i]!
          expectAt({ x: q.x + q.w / 2, y: q.y + q.h / 2 }, m.kind === 'circle' ? oldCircle(m, t) : oldSwing(m, t))
          seen++
        })
      }
    }
    expect(seen).toBeGreaterThan(0)
  })
})

describe('share codes carry the new fields', () => {
  it('round-trips a swing angle and a circle phase', async () => {
    const level: LevelDef = {
      id: 0, world: { w: 1280, h: 720 }, spawn: { x: 160, y: 400 },
      platforms: [{ x: 0, y: 0, w: 160, h: 20, finish: true, motion: { kind: 'swing', pivot: { x: 640, y: 160 }, radius: 300, amplitude: 0.8, period: 4, angle: -45 } }],
      winds: [],
      hazards: [{ kind: 'mine', x: 0, y: 0, w: 52, h: 52, motion: { kind: 'circle', center: { x: 900, y: 360 }, radius: 120, period: 3, phase: 215 } }]
    }
    const back = await decodeLevel(await encodeLevel(level, 'Angles'))
    expect(back!.level.platforms[0]!.motion).toEqual({ kind: 'swing', pivot: { x: 640, y: 160 }, radius: 300, amplitude: 0.8, period: 4, angle: -45 })
    expect(back!.level.hazards![0]!.motion).toEqual({ kind: 'circle', center: { x: 900, y: 360 }, radius: 120, period: 3, phase: 215 })
  })
  it('still opens a code made before the fields existed, and plays it as before', async () => {
    // A swing platform and an orbiting mine, neither with an angle or a phase.
    const OLD = 'u1ZY9LTsQwEESvgmptIedDGPoSHABlYcUepoVjR44zAUa-O7KdWQCrbumpq17f4EB4tfrBmquxELCgG3YfrC4LqGlPUuACem5lElgXtbuMPkHNIAW-QL3MZLEqnn2YV9BbwXfaS5GDWllzckzhFVdYogoUOLPj9QKKYTMCs4_sS-MHOw3CurN7h8DCVx8Pk6GvYc2QTYLSvK2gLjeqebEcN21A8vEksJjAXoP6lEaBnZ3OwqPARX2roKv9UTWzMxB_XZ_aoprHP7mJw2TzzWRcNOHQe5H1vvul1-Rn7zpdSmNKPw'
    const back = await decodeLevel(OLD)
    expect(back!.name).toBe('Old level')
    const swing = back!.level.platforms[1]!.motion as Swing
    const circle = back!.level.hazards![0]!.motion as Circle
    expect(swing).toEqual({ kind: 'swing', pivot: { x: 640, y: 160 }, radius: 300, amplitude: 0.8, period: 4 })
    expect(circle).toEqual({ kind: 'circle', center: { x: 900, y: 360 }, radius: 120, period: 3 })
    for (const t of TIMES) {
      expectAt(centreAt(circle, t), oldCircle(circle, t))
      expectAt(centreAt(swing, t), oldSwing(swing, t))
    }
  })
})

describe('start phase on every repeating motion', () => {
  it('back and forth: 0 starts at a, 180 starts at b, and a phase is the same ping-pong shifted in time', () => {
    const line = { kind: 'line' as const, a: { x: 300, y: 300 }, b: { x: 700, y: 300 }, period: 4 }
    expectAt(centreAt(line, 0), line.a)
    expectAt(centreAt({ ...line, phase: 180 }, 0), line.b)
    expectAt(centreAt({ ...line, phase: 90 }, 0.5), centreAt(line, 1.5))
  })

  it('swing: 90 starts at the end of its swing, and a phase is the same swing shifted in time', () => {
    const swing: Swing = { kind: 'swing', pivot: { x: 640, y: 160 }, radius: 300, amplitude: 0.8, period: 4 }
    expectAt(centreAt({ ...swing, phase: 90 }, 0), centreAt(swing, 1))
    expectAt(centreAt({ ...swing, phase: 45 }, 1.3), centreAt(swing, 1.8))
  })

  it('lunge: a phase starts the cycle part-way through; a triggered lunge ignores it and waits at rest', () => {
    const lunge = { kind: 'lunge' as const, a: { x: 300, y: 300 }, b: { x: 700, y: 300 }, period: 4 }
    expectAt(centreAt({ ...lunge, phase: 90 }, 0.4), centreAt(lunge, 1.4))
    expectAt(centreAt({ ...lunge, trigger: true, phase: 180 }, 0), centreAt({ ...lunge, trigger: true }, 0))
  })
})
