// Dual-mode aim (render/aim.ts): a finger above the launcher line points the
// shot AT itself, one below it slingshots through the launcher, every release
// fires what the preview shows. A tap on the unit (or a press from the tray)
// fires the repeat shot; the one cancel is a drag that comes back onto the unit.
// The blind playtest this answers: 4/4 first-timers dragged UP at the monsters
// and a slingshot-only board swallowed it.
import { describe, expect, it } from 'vitest'
import { AimController, FINE_MAX_DEV, HOME_R, MODE_BAND, PAD_R, LAUNCHER_MID } from '@/barrage/render/aim'
import { cellX, cellY, computeLayout, makeLayout } from '@/barrage/render/layout'
import { BALL_R, FLOOR_Y, MIN_AIM } from '@/barrage/engine/types'

const UP = Math.PI / 2
const L = computeLayout(makeLayout(), 390, 700, 1)
const LX = 3.5
const px = (x: number): number => cellX(L, x)
const py = (y: number): number => cellY(L, y)
/** Launch point in cells: where the ball leaves, the angle's origin. */
const OY = FLOOR_Y - BALL_R

/** The launcher pad's centre (cells). */
const padMid = (): number => FLOOR_Y - LAUNCHER_MID

const make = (launcherX = LX): AimController => {
  const a = new AimController()
  a.placeLauncher(L, launcherX)
  return a
}
/** The angle that points from the launch point AT board cell (x, y). */
const toward = (x: number, y: number, launcherX = LX): number => Math.atan2(OY - y, x - launcherX)
/** Press at cell (x0,y0), move to (x1,y1) in `steps` moves `ms` apart. */
const drag = (a: AimController, x0: number, y0: number, x1: number, y1: number, steps = 8, ms = 16): void => {
  a.begin(1, px(x0), py(y0), 0)
  for (let i = 1; i <= steps; i++) a.move(px(x0 + ((x1 - x0) * i) / steps), py(y0 + ((y1 - y0) * i) / steps), i * ms)
}

describe('point-at (finger above the launcher line)', () => {
  it('an upward drag from mid-board toward a monster fires AT it — the playtest habit', () => {
    const a = make()
    drag(a, 3.5, 7, 1.5, 1.5)
    expect(a.mode).toBe('point')
    expect(a.armed).toBe(true)
    const shot = a.end()
    expect(shot).not.toBeNull()
    expect(shot!).toBeCloseTo(toward(1.5, 1.5), 5)
  })

  it('the preview is on the finger at every step, even for a slow creep (no fine-aim drift)', () => {
    const a = make()
    a.begin(1, px(3.5), py(6), 0)
    for (let i = 1; i <= 40; i++) {
      const x = 3.5 + i * 0.05
      a.move(px(x), py(6 - i * 0.02), i * 60) // ~5 px/s: deep in fine-aim speed
      expect(a.angle).toBeCloseTo(toward(x, 6 - i * 0.02), 6)
    }
  })

  it('works from any launcher position', () => {
    const a = make(1.2)
    drag(a, 1.2, 8, 6, 2)
    expect(a.end()!).toBeCloseTo(toward(6, 2, 1.2), 5)
  })
})

describe('slingshot (finger below the launcher line)', () => {
  it('pulling straight down from the launcher shoots straight up', () => {
    const a = make()
    drag(a, LX, OY, LX, FLOOR_Y + 2)
    expect(a.mode).toBe('sling')
    expect(a.end()!).toBeCloseTo(UP, 5)
  })

  it('a pull down-left shoots up-right through the launcher, down-right shoots up-left', () => {
    const left = make()
    drag(left, 3.5, 7, 2.5, FLOOR_Y + 2)
    expect(left.mode).toBe('sling')
    expect(left.end()!).toBeCloseTo(Math.atan2(FLOOR_Y + 2 - OY, LX - 2.5), 1)
    const right = make()
    drag(right, 3.5, 7, 4.5, FLOOR_Y + 2)
    expect(right.end()!).toBeGreaterThan(UP)
  })

  it('keeps tracking far below the board (pointer capture over the bottom panel)', () => {
    const a = make()
    drag(a, 3.5, 5, 2.9, FLOOR_Y + 6, 10, 16)
    expect(a.mode).toBe('sling')
    expect(a.end()!).toBeCloseTo(Math.atan2(FLOOR_Y + 6 - OY, LX - 2.9), 1)
  })

  it('a slow nudge turns the aim less than the finger does (fine aim, slingshot only)', () => {
    const a = make()
    drag(a, LX, OY, LX, FLOOR_Y + 2) // fast pull → armed at ~90°
    const before = a.angle
    for (let i = 1; i <= 15; i++) a.move(px(LX) + i, py(FLOOR_Y + 2), 8 * 16 + i * 50) // 20 px/s
    const raw = AimController.slingAngle(15, py(FLOOR_Y + 2) - py(OY))
    const aimTurn = Math.abs(a.angle - before)
    expect(aimTurn).toBeGreaterThan(0)
    expect(aimTurn).toBeLessThan(Math.abs(raw - before) * 0.6)
  })

  it(`fine aim never holds the line more than ${Math.round((FINE_MAX_DEV * 180) / Math.PI)}° off the finger`, () => {
    const a = make()
    drag(a, LX, OY, LX, FLOOR_Y + 2)
    for (let i = 1; i <= 80; i++) {
      a.move(px(LX) + i, py(FLOOR_Y + 2), 8 * 16 + i * 50) // a long slow creep
      const raw = AimController.slingAngle(i, py(FLOOR_Y + 2) - py(OY))
      expect(Math.abs(a.angle - raw)).toBeLessThanOrEqual(FINE_MAX_DEV + 1e-9)
    }
  })

  it('a fast sweep follows the finger', () => {
    const a = make()
    drag(a, LX, OY, LX, FLOOR_Y + 2)
    for (let i = 1; i <= 6; i++) a.move(px(LX) + i * 15, py(FLOOR_Y + 2), 8 * 16 + i * 8) // ~1900 px/s
    const raw = AimController.slingAngle(90, py(FLOOR_Y + 2) - py(OY))
    expect(Math.abs(a.angle - raw)).toBeLessThan(0.12)
  })

  it('an ordinary pull-back past the launcher lands on the finger (moves ~70 ms apart, ~380 px/s)', () => {
    // The browser run that found the old 520 px/s threshold lagging ~4°.
    const a = make()
    drag(a, 3.5, 6, LX + 0.9, FLOOR_Y + 2.6, 14, 70)
    expect(a.mode).toBe('sling')
    expect(a.end()!).toBeCloseTo(Math.atan2(FLOOR_Y + 2.6 - OY, -0.9), 2)
  })
})

describe('every release fires — nothing is refused', () => {
  it('a tap (press + release, no movement) fires at the tapped point', () => {
    const a = make()
    a.begin(1, px(5.5), py(2.5), 0)
    expect(a.armed).toBe(true) // the preview is up from the press
    expect(a.end()!).toBeCloseTo(toward(5.5, 2.5), 6)
  })

  it('a horizontal aim is clamped to the edge of the fan and fired', () => {
    const right = make()
    drag(right, 3.5, 6, 6.9, OY - 0.02)
    expect(right.end()).toBeCloseTo(MIN_AIM, 6)
    const left = make()
    drag(left, 3.5, 6, 0.1, OY - 0.02)
    expect(left.end()).toBeCloseTo(Math.PI - MIN_AIM, 6)
  })

  it('a pull-back that points below the fan is clamped and fired too', () => {
    const a = make()
    drag(a, LX, OY, 0.2, FLOOR_Y + 0.25) // finger far left, barely under the line
    const shot = a.end()
    expect(shot).not.toBeNull()
    expect(shot!).toBeCloseTo(MIN_AIM, 6)
  })

  it('the old wrong-way drag (straight up at the monsters) fires straight up', () => {
    const a = make()
    drag(a, 3.5, 8, 3.5, 1)
    expect(a.end()!).toBeCloseTo(UP, 6)
  })

  it('never leaves the valid fan', () => {
    const a = make()
    a.begin(1, px(3), py(5), 0)
    for (let i = 1; i <= 60; i++) {
      a.move(px(3 + Math.sin(i) * 6), py(OY + Math.cos(i * 1.7) * 4), i * 10)
      if (!a.armed) continue
      expect(a.angle).toBeGreaterThanOrEqual(MIN_AIM - 1e-9)
      expect(a.angle).toBeLessThanOrEqual(Math.PI - MIN_AIM + 1e-9)
    }
  })
})

describe('the unit: a tap fires the repeat shot, a drag back onto it cancels', () => {
  const padY = FLOOR_Y - LAUNCHER_MID

  it('a tap on the launcher fires straight up before the first shot (playtest run 3)', () => {
    const a = make()
    a.begin(1, px(LX + 0.2), py(padY - 0.2), 0)
    expect(a.home).toBe(true)
    expect(a.armed).toBe(true) // the preview shows the shot while the finger rests there
    expect(a.angle).toBeCloseTo(UP, 9)
    expect(a.end()).toBeCloseTo(UP, 9)
  })

  it('a tap on the launcher repeats the last fired angle; a wobble on the pad keeps it', () => {
    const a = make()
    a.begin(1, px(LX), py(padY), 0, 1.2)
    expect(a.angle).toBeCloseTo(1.2, 9)
    for (let i = 1; i <= 5; i++) a.move(px(LX + (i % 2 ? 0.3 : -0.3)), py(padY + (i % 2 ? -0.25 : 0.25)), i * 30)
    expect(a.home).toBe(true)
    expect(a.armed).toBe(true)
    expect(a.end()).toBeCloseTo(1.2, 9)
  })

  it('the repeat angle is clamped into the fan', () => {
    const a = make()
    a.begin(1, px(LX), py(padY), 0, 0.01)
    expect(a.end()).toBeCloseTo(MIN_AIM, 9)
  })

  it('a press on the unit that drags up aims AT the finger once it leaves the pad', () => {
    const a = make()
    drag(a, LX, padY, 1.5, 2, 10)
    expect(a.home).toBe(false)
    expect(a.mode).toBe('point')
    expect(a.end()!).toBeCloseTo(toward(1.5, 2), 5)
  })

  it('a press on the unit that pulls down is a slingshot once it leaves the pad', () => {
    const a = make(3.5)
    drag(a, LX, padY, LX - 0.6, FLOOR_Y + 2.2, 10)
    expect(a.mode).toBe('sling')
    expect(a.end()!).toBeLessThan(UP) // pulled down-left → shoots up-right
  })

  it('leaving the pad and coming back onto it cancels, and hides the preview while there', () => {
    const a = make()
    a.begin(1, px(LX), py(padY), 0, 1.2)
    for (let i = 1; i <= 6; i++) a.move(px(LX), py(padY - i * 0.3), i * 16) // up and off the pad
    expect(a.home).toBe(false)
    expect(a.armed).toBe(true)
    for (let i = 1; i <= 6; i++) a.move(px(LX), py(padY - 1.8 + i * 0.3), 100 + i * 16) // back onto it
    expect(a.armed).toBe(false)
    expect(a.end()).toBeNull()
  })

  it('a drag from elsewhere that lets go on the launcher fires nothing', () => {
    const a = make()
    drag(a, 3.5, 4, LX, padY)
    expect(a.armed).toBe(false)
    expect(a.end()).toBeNull()
  })

  it(`the pad is ${PAD_R} cell round the launcher's centre: just outside it fires`, () => {
    const inside = make()
    drag(inside, 3.5, 4, LX + PAD_R * 0.95, padY)
    expect(inside.end()).toBeNull()
    const outside = make()
    drag(outside, 3.5, 4, LX + PAD_R * 1.05, padY)
    expect(outside.end()).not.toBeNull()
  })

  it('passing over the launcher and off again re-arms at the new finger', () => {
    const a = make()
    drag(a, 3.5, 4, LX, padY)
    expect(a.armed).toBe(false)
    for (let i = 1; i <= 6; i++) a.move(px(LX), py(padY + i * 0.4), 200 + i * 16)
    expect(a.armed).toBe(true)
    expect(a.mode).toBe('sling')
    expect(a.end()!).toBeCloseTo(UP, 5)
  })
})

describe('a press from outside the board (the tray ball orbs)', () => {
  /** A tray orb well under the board, left of the unit. */
  const ORB_X = 2.6
  const ORB_Y = FLOOR_Y + 2.4

  it('a tap (release before moving) fires the repeat shot', () => {
    const a = make()
    a.beginFrom(7, px(ORB_X), py(ORB_Y), 0, 1.9)
    expect(a.active).toBe(true)
    expect(a.home).toBe(true)
    expect(a.armed).toBe(true)
    expect(a.angle).toBeCloseTo(1.9, 9)
    expect(a.end()).toBeCloseTo(1.9, 9)
  })

  it('straight up before the first shot', () => {
    const a = make()
    a.beginFrom(7, px(ORB_X), py(ORB_Y), 0)
    expect(a.end()).toBeCloseTo(UP, 9)
  })

  it(`a jitter under ${HOME_R} cell keeps the repeat shot`, () => {
    const a = make()
    a.beginFrom(7, px(ORB_X), py(ORB_Y), 0, 1.9)
    a.move(px(ORB_X + HOME_R * 0.6), py(ORB_Y - HOME_R * 0.6), 30)
    expect(a.home).toBe(true)
    expect(a.end()).toBeCloseTo(1.9, 9)
  })

  it('moving off its press point starts the ordinary aim: below the line a slingshot through the unit', () => {
    const a = make()
    a.beginFrom(7, px(ORB_X), py(ORB_Y), 0, 1.9)
    a.move(px(ORB_X - 0.5), py(ORB_Y + 0.2), 40)
    expect(a.home).toBe(false)
    expect(a.mode).toBe('sling')
    expect(a.end()!).toBeCloseTo(Math.atan2(ORB_Y + 0.2 - OY, LX - (ORB_X - 0.5)), 5)
  })

  it('dragged up onto the board it points at the finger', () => {
    const a = make()
    a.beginFrom(7, px(ORB_X), py(ORB_Y), 0)
    for (let i = 1; i <= 10; i++) a.move(px(ORB_X + (5.5 - ORB_X) * (i / 10)), py(ORB_Y + (2 - ORB_Y) * (i / 10)), i * 16)
    expect(a.mode).toBe('point')
    expect(a.end()!).toBeCloseTo(toward(5.5, 2), 5)
  })

  it('dragged onto the unit and let go there: the cancel', () => {
    const a = make()
    a.beginFrom(7, px(ORB_X), py(ORB_Y), 0)
    for (let i = 1; i <= 8; i++) a.move(px(ORB_X + (LX - ORB_X) * (i / 8)), py(ORB_Y + (padMid() - ORB_Y) * (i / 8)), i * 16)
    expect(a.armed).toBe(false)
    expect(a.end()).toBeNull()
  })
})

describe('mode line hysteresis', () => {
  it(`a flat shot does not jump walls while the thumb wobbles inside ±${MODE_BAND} cell`, () => {
    const a = make()
    drag(a, 3.5, 6, 6.5, OY - 0.05)
    expect(a.mode).toBe('point')
    expect(a.angle).toBeCloseTo(MIN_AIM, 6)
    a.move(px(6.5), py(OY + MODE_BAND * 0.8), 500)
    expect(a.mode).toBe('point')
    expect(a.angle).toBeCloseTo(MIN_AIM, 6) // pinned, still aiming right
    a.move(px(6.5), py(OY + MODE_BAND * 2.5), 520)
    expect(a.mode).toBe('sling')
    expect(a.angle).toBeGreaterThan(UP) // a real pull-back now: up-left
  })

  it('a press decides by its own side of the line, with no band', () => {
    const a = make()
    a.begin(1, px(6), py(OY + 0.05), 0)
    expect(a.mode).toBe('sling')
    a.cancel()
    a.begin(1, px(6), py(OY - 0.05), 0)
    expect(a.mode).toBe('point')
  })
})
