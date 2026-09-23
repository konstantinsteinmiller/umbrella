/**
 * Slingshot aim — pointer maths only (no DOM), so it is unit-testable.
 *
 *   • Drag anywhere on the board; the ball flies OPPOSITE the pull.
 *   • Pull shorter than `minPull` = no shot (preview hidden, release cancels).
 *   • A pull pointing clearly UP (more than `WRONG_WAY` above the horizontal)
 *     is a first-timer pointing AT the monsters. It used to pin to the edge
 *     of the fan — a slow wall-to-wall zig-zag nobody meant — so it now arms
 *     nothing and flags `wrongWay`; the coach answers with the pull-back hint.
 *     A pull a little above the horizontal still pins, so flat shots stay
 *     easy to reach with a sloppy thumb.
 *   • Fine aim: a slow finger turns the angle at a fraction of its motion; a
 *     fast sweep re-syncs to the absolute pull direction, so precision mode
 *     never leaves the aim stranded away from where the finger points.
 *
 * Coordinates are canvas CSS px (y down). Angles follow the engine contract:
 * radians from +x, pointing UP, clamped to [MIN_AIM, π − MIN_AIM].
 */
import { MIN_AIM } from '../engine/types'

const clampAim = (a: number): number => Math.max(MIN_AIM, Math.min(Math.PI - MIN_AIM, a))

/** Finger speed (CSS px/s) below which fine aim is fully engaged / above which it is off. */
const SLOW = 90
const FAST = 520
/** Angle gain at full fine aim. */
const FINE_GAIN = 0.3
/** Pull direction this far above the horizontal (radians) is "pointing at the
 *  target", not a slingshot pull. */
export const WRONG_WAY = (35 * Math.PI) / 180
const WRONG_WAY_SLOPE = Math.tan(WRONG_WAY)

export class AimController {
  pointerId = -1
  /** A finger is down on the board. */
  active = false
  /** Pulled far enough to shoot (preview visible). */
  armed = false
  /** The current pull points clearly upward — toward the monsters. */
  wrongWay = false
  /** The last `end()` let go of a wrong-way pull (nothing fired). */
  endedWrongWay = false
  /** Current (fine-aimed) launch angle. */
  angle = Math.PI / 2
  private sx = 0
  private sy = 0
  private lx = 0
  private ly = 0
  private lt = 0
  private speed = 0
  private lastRaw = Math.PI / 2
  /** Minimum pull in CSS px (set from the cell size). */
  minPull = 16

  /** Current drag vector (finger − start, CSS px, y down). */
  get dragX(): number { return this.lx - this.sx }
  get dragY(): number { return this.ly - this.sy }

  /** The pull (current − start, CSS px, y down) points clearly upward. */
  static isWrongWay(dx: number, dy: number): boolean {
    return dy < 0 && -dy > Math.abs(dx) * WRONG_WAY_SLOPE
  }

  /** Raw angle of the pull (start − current), clamped to the valid fan. */
  static pullAngle(dx: number, dy: number): number {
    // Shoot vector s = start − current = (−dx, −dy); angle = atan2(−s.y, s.x).
    const a = Math.atan2(dy, -dx)
    if (a < 0) return a < -Math.PI / 2 ? Math.PI - MIN_AIM : MIN_AIM // pulled upward: pin to the nearer edge
    return clampAim(a)
  }

  begin(id: number, x: number, y: number, t: number): void {
    this.pointerId = id
    this.active = true
    this.armed = false
    this.wrongWay = false
    this.endedWrongWay = false
    this.sx = x
    this.sy = y
    this.lx = x
    this.ly = y
    this.lt = t
    this.speed = 0
  }

  /** Feed a pointer move. Returns true when the preview should change. */
  move(x: number, y: number, t: number): boolean {
    if (!this.active) return false
    const dt = Math.max(1, t - this.lt) / 1000
    const inst = Math.hypot(x - this.lx, y - this.ly) / dt
    this.speed += (inst - this.speed) * Math.min(1, dt * 14)
    this.lx = x
    this.ly = y
    this.lt = t
    const dx = x - this.sx
    const dy = y - this.sy
    const pull = Math.hypot(dx, dy)
    if (pull < this.minPull) {
      const was = this.armed
      this.armed = false
      this.wrongWay = false
      return was
    }
    if (AimController.isWrongWay(dx, dy)) {
      const was = this.armed || !this.wrongWay
      this.armed = false
      this.wrongWay = true
      return was
    }
    this.wrongWay = false
    const raw = AimController.pullAngle(dx, dy)
    if (!this.armed) {
      this.armed = true
      this.angle = raw
      this.lastRaw = raw
      return true
    }
    const fast = Math.max(0, Math.min(1, (this.speed - SLOW) / (FAST - SLOW)))
    const gain = FINE_GAIN + (1 - FINE_GAIN) * fast
    let next = this.angle + (raw - this.lastRaw) * gain
    // A quick sweep pulls the aim back onto the finger.
    next += (raw - next) * fast * 0.35
    this.lastRaw = raw
    next = clampAim(next)
    const changed = Math.abs(next - this.angle) > 1e-5
    this.angle = next
    return changed
  }

  /** Finger up: returns the angle to fire, or null for a cancelled (too short) drag. */
  end(): number | null {
    const shot = this.active && this.armed ? this.angle : null
    const wrong = this.active && this.wrongWay
    this.cancel()
    this.endedWrongWay = wrong
    return shot
  }

  cancel(): void {
    this.active = false
    this.armed = false
    this.wrongWay = false
    this.endedWrongWay = false
    this.pointerId = -1
  }
}
