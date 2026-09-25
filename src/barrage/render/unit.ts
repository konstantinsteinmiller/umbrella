/**
 * The unit — the elemental on the launcher pedestal — and the states a still
 * frame must show (playtest run 4: four blind first-timers saw only still
 * screenshots, and everything that lived in motion or sound was lost):
 *
 *   • DANGER — while any monster wears the `1` pip its flame shrinks and
 *     sputters pale, it trembles and a bead of sweat shows (`unitPose`);
 *     under prefers-reduced-motion a static pale, shrunk flame.
 *   • TORN   — the death sequence (render/death.ts): the unit tears apart,
 *     its pieces going ash grey on the floor (the ash bake below).
 *   • FLARE  — a Ball Damage purchase (`DamageWatch`) flares it at once, and
 *     the next volley's hit numbers burn gold (`GoldVolley`).
 *
 * Pure rules here (tested on their own) plus the unit's baked variants;
 * BoardRenderer draws.
 */
import { applyFilterOps, createCanvas, ctx2d, overlayTint, silhouette, type FilterOp, type SpriteImage } from './sprites'

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

// ─── Pose ────────────────────────────────────────────────────────────────────
export interface UnitPose {
  /** Horizontal tremble (cells). */
  dx: number
  /** Sprite scale, x and y (1 = at rest). */
  sx: number
  sy: number
  /** Alpha of the pale overlay (danger). */
  pale: number
  /** Under-glow multiplier (1 = its normal glow). */
  glow: number
}

export const newUnitPose = (): UnitPose => ({ dx: 0, sx: 1, sy: 1, pale: 0, glow: 1 })

/**
 * The unit's pose for `fear` (0..1 — a monster wears the `1` pip, eased) at
 * renderer time `t`, written into `pose` (no allocation): the flame shrinks
 * (≈ −17 %), hunches, sputters pale and trembles. Reduced motion: no tremble
 * and no flicker — the same pale, shrunk flame, static.
 */
export const unitPose = (pose: UnitPose, fear: number, t: number, reduced: boolean): UnitPose => {
  const f = clamp01(fear)
  // A flame's sputter: two beating sines, never a clean period.
  const sputter = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 19 + 2 * Math.sin(t * 7.3))
  const shrink = 1 - f * (0.14 + 0.06 * sputter)
  pose.dx = reduced || f <= 0 ? 0 : Math.sin(t * 53) * 0.028 * f
  pose.sx = shrink
  pose.sy = shrink * (1 - 0.07 * f)
  pose.pale = f * (0.4 + 0.35 * sputter)
  pose.glow = 1 - f * (0.45 + 0.25 * sputter)
  return pose
}

// ─── A Ball Damage purchase ──────────────────────────────────────────────────
/**
 * Spots a Ball Damage purchase from `config.damageMult` alone: the state layer
 * calls `setConfig` right after a buy, on the live engine. A rise since the
 * last look is a purchase; the first look after `reset()` (an engine swap —
 * a reload, a restart, the daily run) and every look after `resync()` (a
 * cloud hydrate that raised the levels) only adopt the value.
 */
export class DamageWatch {
  private seen = NaN
  private quiet = true

  /** Engine swap: the next look adopts silently. */
  reset(): void {
    this.seen = NaN
    this.quiet = true
  }

  /** A change that is not a purchase is coming (cloud hydrate): the next look adopts silently. */
  resync(): void {
    this.quiet = true
  }

  /** True when `mult` rose since the last look — a purchase. */
  rose(mult: number): boolean {
    if (!Number.isFinite(mult)) return false
    const prev = this.seen
    this.seen = mult
    if (this.quiet) {
      this.quiet = false
      return false
    }
    return mult > prev + 1e-9
  }
}

/**
 * The volley after a Ball Damage purchase burns gold: armed by the purchase,
 * live from the next `fire` to that volley's end, then spent. A purchase
 * mid-volley arms the NEXT volley.
 */
export class GoldVolley {
  armed = false
  active = false

  arm(): void {
    this.armed = true
  }

  onFire(): void {
    this.active = this.armed
    this.armed = false
  }

  onVolleyEnd(): void {
    this.active = false
  }

  reset(): void {
    this.armed = false
    this.active = false
  }
}

// ─── Baked variants ──────────────────────────────────────────────────────────
export interface UnitBake {
  /** Torn apart: ash grey, darkened, with a crack down the body (its pieces fade to it). */
  ash: HTMLCanvasElement
  /** Sputtering: a pale wash. */
  pale: HTMLCanvasElement
  /** Flare: the white silhouette. */
  white: HTMLCanvasElement
}

/** Ash grey: nearly no colour, dark, flat. */
const ASH_OPS: FilterOp[] = [{ op: 'saturate', v: 0.06 }, { op: 'brightness', v: 0.58 }, { op: 'contrast', v: 0.85 }]

/**
 * The fighter sprite's content box baked at `px` device px (its longer side)
 * as ash / pale / white — drawn over the live sprite at the same rect, so a
 * crossfade is one extra blit. Baked lazily (the first frame that needs it)
 * and kept for this tier and size.
 */
export class UnitLooks {
  private tier = -1
  private px = 0
  private bake: UnitBake | null = null

  get(tier: number, s: SpriteImage, px: number): UnitBake | null {
    const p = Math.max(8, Math.round(px))
    if (this.bake && this.tier === tier && this.px === p) return this.bake
    if (!s.ready) return null
    const b = s.box
    const k = p / Math.max(b.w, b.h)
    const w = Math.max(4, Math.round(b.w * k))
    const h = Math.max(4, Math.round(b.h * k))
    const base = createCanvas(w, h)
    const g = ctx2d(base)
    g.imageSmoothingQuality = 'high'
    g.drawImage(s.img, b.x, b.y, b.w, b.h, 0, 0, w, h)
    const ash = createCanvas(w, h)
    const ga = ctx2d(ash)
    ga.drawImage(base, 0, 0)
    applyFilterOps(ash, ASH_OPS)
    // The crack: a dark zigzag down the body with a pale lip, only on the sprite.
    ga.globalCompositeOperation = 'source-atop'
    ga.lineCap = 'round'
    ga.lineJoin = 'round'
    const crack = (dx: number, width: number, color: string): void => {
      ga.strokeStyle = color
      ga.lineWidth = width
      ga.beginPath()
      ga.moveTo(w * (0.55 + dx), h * 0.12)
      ga.lineTo(w * (0.44 + dx), h * 0.36)
      ga.lineTo(w * (0.58 + dx), h * 0.52)
      ga.lineTo(w * (0.46 + dx), h * 0.72)
      ga.lineTo(w * (0.52 + dx), h * 0.9)
      ga.moveTo(w * (0.58 + dx), h * 0.52)
      ga.lineTo(w * (0.72 + dx), h * 0.6)
      ga.stroke()
    }
    crack(0.025, Math.max(1, w * 0.035), 'rgba(235,235,240,0.35)')
    crack(0, Math.max(1.5, w * 0.05), 'rgba(18,14,22,0.92)')
    ga.globalCompositeOperation = 'source-over'
    this.bake = { ash, pale: overlayTint(base, '#e6edf7', 0.6), white: silhouette(base, '#ffffff') }
    this.tier = tier
    this.px = p
    return this.bake
  }

  clear(): void {
    this.bake = null
    this.tier = -1
    this.px = 0
  }
}
