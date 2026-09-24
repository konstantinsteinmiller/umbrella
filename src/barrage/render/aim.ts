/**
 * Dual-mode aim — pointer maths only (no DOM), so it is unit-testable.
 *
 * A blind playtest put four first-timers on a slingshot-only board: all four
 * first dragged UP toward the monsters (the Ballz / bubble-shooter habit), the
 * board swallowed it, and two never fired a shot in three minutes. So the
 * angle now comes from where the finger is relative to the LAUNCHER, and both
 * habits shoot:
 *   • finger above the launcher line → point-at: the ball flies AT the finger;
 *   • finger below it (pulled back — pointer capture keeps tracking it over
 *     the bottom panel) → slingshot: from the finger through the launcher.
 *   • The preview is live from the press; a release ALWAYS fires what it
 *     shows. An angle outside the fan is clamped to its edge and fired —
 *     nothing is refused. A tap (no movement) fires at the tapped point.
 *   • The unit (playtest run 3: the most natural first tap — on the unit —
 *     was the one gesture that did nothing): a press on the launcher pad
 *     (`PAD_R` round its centre) holds the REPEAT shot — the run's last fired
 *     angle, straight up before the first — for as long as the finger stays
 *     on the pad, and a release there fires it. Once the finger has left the
 *     pad it is an ordinary aim; coming back onto the pad hides the preview
 *     and a release there fires nothing: the one cancel.
 *   • A press from OUTSIDE the board (`beginFrom`: the tray's ball orbs in
 *     the bottom panel) behaves like a press on the unit: the repeat shot
 *     until the finger has moved `HOME_R` from its press point, then the
 *     ordinary dual-mode aim.
 *   • The mode line has a thin hysteresis band, so a flat shot does not
 *     jump to the other wall when a thumb wobbles across the line.
 *   • Fine aim, slingshot only: a pull-back sits close to the launcher, where
 *     one pixel is a big angle, so a slow finger turns the aim at a fraction
 *     of its motion, a sweep re-syncs, and the aim is never held more than
 *     FINE_MAX_DEV off the finger. Point-at never uses it — the line must
 *     stay on the finger.
 *
 * Coordinates are canvas CSS px (y down). Angles follow the engine contract:
 * radians from +x, pointing UP, clamped to [MIN_AIM, π − MIN_AIM].
 */
import { BALL_R, FLOOR_Y, MIN_AIM } from '../engine/types'
import { cellX, cellY, type BoardLayout } from './layout'

const clampAim = (a: number): number => Math.max(MIN_AIM, Math.min(Math.PI - MIN_AIM, a))

/** Finger speed (CSS px/s) below which fine aim is fully engaged / above which
 *  it is off. A deliberate nudge is well under 90; an ordinary pull-back
 *  sweep (~300+) must track the finger exactly — at 520 it lagged ~4°. */
const SLOW = 90
const FAST = 300
/** Angle gain at full fine aim. */
const FINE_GAIN = 0.3
/** Fine aim is precision in a small window: it never holds the line further
 *  than this (radians) off where the finger points. */
export const FINE_MAX_DEV = (6 * Math.PI) / 180
/** The launcher pad round the unit's centre (cells): a press that stays on it
 *  fires the repeat shot; a drag that comes back onto it cancels. */
export const PAD_R = 0.6
/** The launcher figure's centre above the floor line (cells) — the pad's centre. */
export const LAUNCHER_MID = 0.45
/** Half-width of the mode line's hysteresis band (cells). */
export const MODE_BAND = 0.2
/** A press from outside the board holds the repeat shot until the finger has
 *  moved this far (cells) from where it went down. */
export const HOME_R = 0.3
/** The repeat shot before the run's first shot: straight up. */
export const REPEAT_DEFAULT = Math.PI / 2

export type AimMode = 'point' | 'sling'

export class AimController {
  pointerId = -1
  /** A finger is down (on the board, or begun outside it via `beginFrom`). */
  active = false
  /** The preview is up: a release fires `angle`. */
  armed = false
  mode: AimMode = 'point'
  /** Current launch angle (the one the preview shows). */
  angle = Math.PI / 2
  /** The finger has not left where it pressed yet (the launcher pad, or the
   *  outside press point): the preview shows `repeat` and a release fires it. */
  home = false
  /** The repeat shot for this press (the board passes the run's last fired angle). */
  repeat = REPEAT_DEFAULT
  /** Where the ball leaves the launcher (CSS px) — the angle's origin; its y is the mode line. */
  ox = 0
  oy = 0
  /** The launcher pad (CSS px). */
  padX = 0
  padY = 0
  padR = 20
  /** Hysteresis half-band round the mode line (CSS px). */
  band = 6
  /** HOME_R in CSS px. */
  homeR = 10
  /** Last finger position fed (CSS px). */
  x = 0
  y = 0
  private lt = 0
  private speed = 0
  private lastRaw = Math.PI / 2
  /** Home is the launcher pad (a board press) or a circle round the press point (`beginFrom`). */
  private homeOnPad = true
  private hx = 0
  private hy = 0

  /** Point-at: the angle from the origin toward a finger at (dx, dy) from it.
   *  A finger under the line (inside the hysteresis band) pins the nearer edge. */
  static pointAngle(dx: number, dy: number): number {
    const a = Math.atan2(-dy, dx)
    if (a < 0) return a < -Math.PI / 2 ? Math.PI - MIN_AIM : MIN_AIM
    return clampAim(a)
  }

  /** Slingshot: the angle from a finger at (dx, dy) from the origin THROUGH
   *  it. A finger over the line (inside the band) pins the nearer edge. */
  static slingAngle(dx: number, dy: number): number {
    const a = Math.atan2(dy, -dx)
    if (a < 0) return a < -Math.PI / 2 ? Math.PI - MIN_AIM : MIN_AIM
    return clampAim(a)
  }

  /** Launcher geometry from the board layout: the ball's launch point and the pad. */
  placeLauncher(l: BoardLayout, launcherX: number): void {
    const x = cellX(l, launcherX)
    this.ox = x
    this.oy = cellY(l, FLOOR_Y - BALL_R)
    this.padX = x
    this.padY = cellY(l, FLOOR_Y - LAUNCHER_MID)
    this.padR = l.cell * PAD_R
    this.band = l.cell * MODE_BAND
    this.homeR = l.cell * HOME_R
  }

  /** The finger is on the launcher pad. */
  onPad(x: number, y: number): boolean {
    const dx = x - this.padX
    const dy = y - this.padY
    return dx * dx + dy * dy <= this.padR * this.padR
  }

  /** A press on the board. On the launcher pad it holds the repeat shot
   *  (`repeat`, the run's last fired angle); anywhere else the preview is on
   *  the finger at once (a tap fires at the tapped point). */
  begin(id: number, x: number, y: number, t: number, repeat = REPEAT_DEFAULT): void {
    this.start(id, y, t, repeat)
    this.homeOnPad = true
    this.home = this.onPad(x, y)
    this.track(x, y)
  }

  /** A press that went down OUTSIDE the board (the tray's ball orbs): like a
   *  press on the unit — the repeat shot until the finger has moved `HOME_R`
   *  from here, then the ordinary dual-mode aim. */
  beginFrom(id: number, x: number, y: number, t: number, repeat = REPEAT_DEFAULT): void {
    this.start(id, y, t, repeat)
    this.homeOnPad = false
    this.hx = x
    this.hy = y
    this.home = true
    this.track(x, y)
  }

  /** Feed a pointer move. Returns true when the preview changed. */
  move(x: number, y: number, t: number): boolean {
    if (!this.active) return false
    const dt = Math.max(1, t - this.lt) / 1000
    const inst = Math.hypot(x - this.x, y - this.y) / dt
    this.speed += (inst - this.speed) * Math.min(1, dt * 14)
    this.lt = t
    return this.track(x, y)
  }

  /** Finger up: the angle to fire, or null when a drag let go back on the launcher pad. */
  end(): number | null {
    const shot = this.active && this.armed ? this.angle : null
    this.cancel()
    return shot
  }

  cancel(): void {
    this.active = false
    this.armed = false
    this.home = false
    this.pointerId = -1
  }

  private start(id: number, y: number, t: number, repeat: number): void {
    this.pointerId = id
    this.active = true
    this.armed = false
    this.repeat = clampAim(Number.isFinite(repeat) ? repeat : REPEAT_DEFAULT)
    this.mode = y > this.oy ? 'sling' : 'point'
    this.lt = t
    this.speed = 0
  }

  private inHome(x: number, y: number): boolean {
    if (this.homeOnPad) return this.onPad(x, y)
    const dx = x - this.hx
    const dy = y - this.hy
    return dx * dx + dy * dy <= this.homeR * this.homeR
  }

  private track(x: number, y: number): boolean {
    this.x = x
    this.y = y
    if (this.home) {
      if (this.inHome(x, y)) {
        const changed = !this.armed || Math.abs(this.angle - this.repeat) > 1e-5
        this.armed = true
        this.angle = this.repeat
        return changed
      }
      // Left home: an ordinary aim from here on, its mode decided by this
      // side of the line (no band), exactly like a fresh press.
      this.home = false
      this.armed = false
      this.mode = y > this.oy ? 'sling' : 'point'
    }
    if (this.onPad(x, y)) {
      const was = this.armed
      this.armed = false
      return was
    }
    const below = y - this.oy
    const mode: AimMode = this.mode === 'point' ? (below > this.band ? 'sling' : 'point') : (below < -this.band ? 'point' : 'sling')
    const dx = x - this.ox
    const raw = mode === 'point' ? AimController.pointAngle(dx, below) : AimController.slingAngle(dx, below)
    if (!this.armed || mode !== this.mode || mode === 'point') {
      const changed = !this.armed || mode !== this.mode || Math.abs(raw - this.angle) > 1e-5
      this.mode = mode
      this.armed = true
      this.angle = raw
      this.lastRaw = raw
      return changed
    }
    const fast = Math.max(0, Math.min(1, (this.speed - SLOW) / (FAST - SLOW)))
    const gain = FINE_GAIN + (1 - FINE_GAIN) * fast
    let next = this.angle + (raw - this.lastRaw) * gain
    // A quick sweep pulls the aim back onto the finger.
    next += (raw - next) * fast * 0.35
    this.lastRaw = raw
    next = clampAim(Math.max(raw - FINE_MAX_DEV, Math.min(raw + FINE_MAX_DEV, next)))
    const changed = Math.abs(next - this.angle) > 1e-5
    this.angle = next
    return changed
  }
}
