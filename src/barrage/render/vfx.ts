/**
 * Board VFX — fixed-size pools, board-cell coordinates, zero allocations after
 * warm-up. Every `spawn*` drops the request when its pool is full (cheap
 * back-pressure: a 40-ball volley can never blow the frame budget).
 *
 *   sparks   additive glow dots (hit sparks, embers, shards, combo bursts)
 *   impacts  per-element 9-frame sheets, max IMPACT_LIVE at once
 *   rings    expanding stroked rings (splash, pops, shockwaves)
 *   bolts    chain-lightning polylines
 *   corpses  death poof: the monster's own bake swelling + fading
 *   blasts   eruption / meteor glow bursts
 *   meteors  falling meteor sprites (Meteor skill, meteor continue)
 *   nums     damage / DoT / heal / "+1" numbers (MIW rise + pop, 0.75 s)
 *   floaters an image that pops and drifts up (skill icons, frost stars)
 *   rollers  landed balls rolling to the next launcher spot
 *   fliers   auto-collected "+1" bubbles lifting off and arcing into the launcher
 */
import { IMPACT_FRAME_MS, IMPACT_FRAMES } from '../art'
import type { BoardLayout } from './layout'
import { glyphGen, glyphs, type NumStyle } from './glyphs'
import { createCanvas, ctx2d, glowDot, type SpriteImage } from './sprites'

const IMPACT_LIVE = 6
const TAU = Math.PI * 2

interface Spark { on: boolean; x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; img: HTMLCanvasElement | null; grav: number; drag: number }
interface Impact { on: boolean; x: number; y: number; size: number; t: number; sheet: SpriteImage | null }
interface Ring { on: boolean; x: number; y: number; r0: number; r1: number; t: number; life: number; color: string; width: number }
interface Bolt { on: boolean; pts: Float32Array; n: number; t: number; life: number; color: string }
interface Corpse { on: boolean; x: number; y: number; w: number; h: number; img: HTMLCanvasElement | null; white: HTMLCanvasElement | null; t: number; life: number }
interface Blast { on: boolean; x: number; y: number; r: number; t: number; life: number; img: HTMLCanvasElement | null }
interface Meteor { on: boolean; x: number; y: number; t: number; delay: number; dur: number; landed: boolean; big: boolean }
export interface DmgNum {
  on: boolean; text: string; style: NumStyle; x: number; y: number; t: number; life: number; size: number; value: number; key: number
  /** Baked label (re-baked only when the text changes) — one drawImage per number per frame. */
  cv: HTMLCanvasElement | null; cvText: string; cvGen: number; cvW: number; cvH: number; cvSize: number
}
interface Floater { on: boolean; img: HTMLCanvasElement | HTMLImageElement | null; sx: number; sy: number; sw: number; sh: number; x: number; y: number; t: number; life: number; size: number; rise: number; spin: number }
interface Roller { on: boolean; x: number; tx: number; y: number; t: number; dur: number; img: HTMLCanvasElement | null }
/** An auto-collected "+1": waits `delay` (bubble still in place), then flies a lifted arc to the launcher. */
export interface Flier { on: boolean; x0: number; y0: number; t: number; delay: number; dur: number; launched: boolean }

/** Auto "+1" timing: consecutive fliers launch at least this far apart (s). */
export const FLIER_GAP = 0.08
/** Flight time (s). */
export const FLIER_DUR = 0.55
const FLIER_TRAIL = 4

const mk = <T>(n: number, f: () => T): T[] => Array.from({ length: n }, f)

const easeOutCubic = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t)

export class BoardVfx {
  readonly sparks: Spark[] = mk(360, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 0.1, img: null, grav: 0, drag: 1 }))
  readonly impacts: Impact[] = mk(IMPACT_LIVE, () => ({ on: false, x: 0, y: 0, size: 1, t: 0, sheet: null }))
  readonly rings: Ring[] = mk(40, () => ({ on: false, x: 0, y: 0, r0: 0, r1: 1, t: 0, life: 0.4, color: '#fff', width: 0.06 }))
  readonly bolts: Bolt[] = mk(16, () => ({ on: false, pts: new Float32Array(24), n: 0, t: 0, life: 0.2, color: '#9ff' }))
  readonly corpses: Corpse[] = mk(28, () => ({ on: false, x: 0, y: 0, w: 1, h: 1, img: null, white: null, t: 0, life: 0.3 }))
  readonly blasts: Blast[] = mk(16, () => ({ on: false, x: 0, y: 0, r: 1, t: 0, life: 0.4, img: null }))
  readonly meteors: Meteor[] = mk(60, () => ({ on: false, x: 0, y: 0, t: 0, delay: 0, dur: 0.45, landed: false, big: false }))
  readonly nums: DmgNum[] = mk(56, () => ({
    on: false, text: '', style: 'dmg', x: 0, y: 0, t: 0, life: 0.75, size: 14, value: 0, key: -1,
    cv: null, cvText: '', cvGen: -1, cvW: 0, cvH: 0, cvSize: 0
  }))
  /** Live spark count — emitters thin out when the board is already busy. */
  liveSparks = 0
  readonly floaters: Floater[] = mk(20, () => ({ on: false, img: null, sx: 0, sy: 0, sw: 1, sh: 1, x: 0, y: 0, t: 0, life: 0.6, size: 1, rise: 0, spin: 0 }))
  readonly rollers: Roller[] = mk(48, () => ({ on: false, x: 0, tx: 0, y: 0, t: 0, dur: 0.3, img: null }))
  readonly fliers: Flier[] = mk(12, () => ({ on: false, x0: 0, y0: 0, t: 0, delay: 0, dur: FLIER_DUR, launched: false }))
  /** Where fliers home to (the launcher, cells) — the renderer updates it every frame. */
  flyTargetX = 3.5
  flyTargetY = 10.7
  /** Flier leaves its cell (sound) / arrives at the launcher (pop). */
  onFlierLaunch: ((x: number, y: number) => void) | null = null
  onFlierArrive: ((x: number, y: number) => void) | null = null
  /** vfx-local clock (s) — schedules the flier stagger. */
  private clock = 0
  private nextFlierAt = 0

  /** Called when a meteor lands (renderer adds blast/sfx/shake). */
  onMeteorLand: ((x: number, y: number, big: boolean) => void) | null = null
  meteorSprite: SpriteImage | null = null

  private readonly dotCache = new Map<string, HTMLCanvasElement>()
  private sparkCursor = 0

  /** Glow dot of a colour, cached forever (a small fixed palette in practice). */
  dot(color: string): HTMLCanvasElement {
    let d = this.dotCache.get(color)
    if (!d) {
      d = glowDot(48, color, 0.22)
      this.dotCache.set(color, d)
    }
    return d
  }

  clear(): void {
    for (const p of this.sparks) p.on = false
    this.liveSparks = 0
    for (const p of this.impacts) p.on = false
    for (const p of this.rings) p.on = false
    for (const p of this.bolts) p.on = false
    for (const p of this.corpses) p.on = false
    for (const p of this.blasts) p.on = false
    for (const p of this.meteors) p.on = false
    for (const p of this.nums) p.on = false
    for (const p of this.floaters) p.on = false
    for (const p of this.rollers) p.on = false
    for (const p of this.fliers) p.on = false
    this.nextFlierAt = 0
  }

  // ─── spawners ──────────────────────────────────────────────────────────────
  spark(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, grav = 0, drag = 0.9): void {
    const pool = this.sparks
    const n = pool.length
    for (let i = 0; i < n; i++) {
      const idx = (this.sparkCursor + i) % n
      const p = pool[idx]!
      if (p.on) continue
      this.sparkCursor = (idx + 1) % n
      this.liveSparks++
      p.on = true
      p.x = x; p.y = y; p.vx = vx; p.vy = vy
      p.life = p.max = life
      p.size = size
      p.img = this.dot(color)
      p.grav = grav
      p.drag = drag
      return
    }
  }

  /** Radial burst of `n` sparks (thinned when many are alive; `force` for set pieces). */
  burst(x: number, y: number, n: number, speed: number, color: string, size = 0.12, life = 0.45, grav = 0, force = false): void {
    if (!force) {
      if (this.liveSparks > 260) return
      if (this.liveSparks > 160) n = Math.min(n, 1 + (n >> 2))
    }
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU
      const v = speed * (0.35 + Math.random() * 0.65)
      this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.5), size * (0.7 + Math.random() * 0.6), color, grav)
    }
  }

  liveImpacts(): number {
    let n = 0
    for (const p of this.impacts) if (p.on) n++
    return n
  }

  impact(x: number, y: number, size: number, sheet: SpriteImage): boolean {
    for (const p of this.impacts) {
      if (p.on) continue
      p.on = true; p.x = x; p.y = y; p.size = size; p.t = 0; p.sheet = sheet
      return true
    }
    return false
  }

  ring(x: number, y: number, r0: number, r1: number, life: number, color: string, width = 0.06): void {
    for (const p of this.rings) {
      if (p.on) continue
      p.on = true; p.x = x; p.y = y; p.r0 = r0; p.r1 = r1; p.t = 0; p.life = life; p.color = color; p.width = width
      return
    }
  }

  bolt(x0: number, y0: number, x1: number, y1: number, color: string, life = 0.22): void {
    for (const p of this.bolts) {
      if (p.on) continue
      const segs = 10
      const dx = x1 - x0
      const dy = y1 - y0
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len
      const ny = dx / len
      for (let i = 0; i <= segs; i++) {
        const t = i / segs
        const j = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * Math.min(0.5, len * 0.25)
        p.pts[i * 2] = x0 + dx * t + nx * j
        p.pts[i * 2 + 1] = y0 + dy * t + ny * j
      }
      p.n = segs + 1
      p.on = true; p.t = 0; p.life = life; p.color = color
      return
    }
  }

  corpse(x: number, y: number, w: number, h: number, img: HTMLCanvasElement | null, white: HTMLCanvasElement | null, life = 0.32): void {
    for (const p of this.corpses) {
      if (p.on) continue
      p.on = true; p.x = x; p.y = y; p.w = w; p.h = h; p.img = img; p.white = white; p.t = 0; p.life = life
      return
    }
  }

  blast(x: number, y: number, r: number, color: string, life = 0.42): void {
    for (const p of this.blasts) {
      if (p.on) continue
      p.on = true; p.x = x; p.y = y; p.r = r; p.t = 0; p.life = life; p.img = this.dot(color)
      return
    }
  }

  meteor(x: number, y: number, delay: number, big = false): void {
    for (const p of this.meteors) {
      if (p.on) continue
      p.on = true; p.x = x; p.y = y; p.t = 0; p.delay = delay; p.dur = 0.42; p.landed = false; p.big = big
      return
    }
  }

  /** New number, or null when the pool is full (dropped). */
  num(text: string, style: NumStyle, x: number, y: number, size: number, value: number, key = -1): DmgNum | null {
    for (const p of this.nums) {
      if (p.on) continue
      p.on = true; p.text = text; p.style = style; p.x = x; p.y = y; p.t = 0
      p.life = 0.75; p.size = size; p.value = value; p.key = key
      return p
    }
    return null
  }

  floater(img: HTMLCanvasElement | HTMLImageElement, sx: number, sy: number, sw: number, sh: number, x: number, y: number, size: number, life = 0.7, rise = 0.6, spin = 0): void {
    for (const p of this.floaters) {
      if (p.on) continue
      p.on = true; p.img = img; p.sx = sx; p.sy = sy; p.sw = sw; p.sh = sh
      p.x = x; p.y = y; p.size = size; p.t = 0; p.life = life; p.rise = rise; p.spin = spin
      return
    }
  }

  roller(x: number, tx: number, y: number, img: HTMLCanvasElement | null): void {
    for (const p of this.rollers) {
      if (p.on) continue
      p.on = true; p.x = x; p.tx = tx; p.y = y; p.t = 0
      p.dur = Math.min(0.45, 0.12 + Math.abs(tx - x) * 0.06)
      p.img = img
      return
    }
  }

  /**
   * An auto-collected "+1" at (x, y): stays put until its slot in the stagger
   * (≥ FLIER_GAP after the previous one), then arcs into the launcher.
   * Returns false when the pool is full (the collect still counts; only the show is dropped).
   */
  flyToLauncher(x: number, y: number): boolean {
    for (const p of this.fliers) {
      if (p.on) continue
      const at = Math.max(this.clock, this.nextFlierAt)
      this.nextFlierAt = at + FLIER_GAP
      p.on = true; p.x0 = x; p.y0 = y; p.t = 0; p.delay = at - this.clock; p.dur = FLIER_DUR; p.launched = false
      return true
    }
    return false
  }

  /** Flier position at flight progress u ∈ [0,1] (quadratic Bézier, lifted apex). Writes into `out`. */
  flierPos(p: Flier, u: number, out: { x: number; y: number }): void {
    const tx = this.flyTargetX
    const ty = this.flyTargetY
    const cx = (p.x0 + tx) / 2
    const cy = Math.min(p.y0, ty) - 1.4
    const a = 1 - u
    out.x = a * a * p.x0 + 2 * a * u * cx + u * u * tx
    out.y = a * a * p.y0 + 2 * a * u * cy + u * u * ty
  }

  retargetRollers(tx: number): void {
    for (const p of this.rollers) if (p.on) p.tx = tx
  }

  // ─── update ────────────────────────────────────────────────────────────────
  update(dt: number): void {
    for (const p of this.sparks) {
      if (!p.on) continue
      p.life -= dt
      if (p.life <= 0) { p.on = false; this.liveSparks--; continue }
      const k = Math.pow(p.drag, dt * 60)
      p.vx *= k
      p.vy = p.vy * k + p.grav * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
    for (const p of this.impacts) {
      if (!p.on) continue
      p.t += dt
      if (p.t * 1000 >= IMPACT_FRAMES * IMPACT_FRAME_MS) p.on = false
    }
    for (const p of this.rings) if (p.on && (p.t += dt) >= p.life) p.on = false
    for (const p of this.bolts) if (p.on && (p.t += dt) >= p.life) p.on = false
    for (const p of this.corpses) if (p.on && (p.t += dt) >= p.life) p.on = false
    for (const p of this.blasts) if (p.on && (p.t += dt) >= p.life) p.on = false
    for (const p of this.nums) if (p.on && (p.t += dt) >= p.life) p.on = false
    for (const p of this.floaters) if (p.on && (p.t += dt) >= p.life) p.on = false
    for (const p of this.rollers) if (p.on && (p.t += dt) >= p.dur + 0.12) p.on = false
    this.clock += dt
    for (const p of this.fliers) {
      if (!p.on) continue
      p.t += dt
      if (!p.launched && p.t >= p.delay) {
        p.launched = true
        this.onFlierLaunch?.(p.x0, p.y0)
      }
      if (p.t >= p.delay + p.dur) {
        p.on = false
        this.onFlierArrive?.(this.flyTargetX, this.flyTargetY)
      }
    }
    for (const p of this.meteors) {
      if (!p.on) continue
      p.t += dt
      if (!p.landed && p.t >= p.delay + p.dur) {
        p.landed = true
        this.onMeteorLand?.(p.x, p.y, p.big)
      }
      if (p.t >= p.delay + p.dur + 0.05) p.on = false
    }
  }

  // ─── draw (ctx carries the DPR transform; coordinates in CSS px) ───────────
  /** Layer 1 — under the monsters: rollers, rings, blasts. */
  drawUnder(ctx: CanvasRenderingContext2D, l: BoardLayout, ballPx: number): void {
    const c = l.cell
    for (const p of this.rollers) {
      if (!p.on || !p.img) continue
      const k = Math.min(1, p.t / p.dur)
      const e = easeOutCubic(k)
      const x = p.x + (p.tx - p.x) * e
      const fade = p.t > p.dur ? 1 - (p.t - p.dur) / 0.12 : 1
      ctx.globalAlpha = Math.max(0, fade)
      const s = ballPx
      ctx.drawImage(p.img, l.ox + x * c - s / 2, l.oy + p.y * c - s / 2, s, s)
    }
    ctx.globalAlpha = 1
  }

  /** Layer 2 — over the monsters. */
  drawOver(ctx: CanvasRenderingContext2D, l: BoardLayout): void {
    const c = l.cell
    const ox = l.ox
    const oy = l.oy
    // Corpses: white-hot swell then fade.
    for (const p of this.corpses) {
      if (!p.on || !p.img) continue
      const k = p.t / p.life
      const s = 1 + 0.35 * easeOutCubic(k)
      const w = p.w * c * s
      const h = p.h * c * s * (1 - 0.25 * k)
      const x = ox + p.x * c - w / 2
      const y = oy + p.y * c - h
      ctx.globalAlpha = Math.max(0, 1 - k)
      ctx.drawImage(p.img, x, y, w, h)
      if (p.white) {
        ctx.globalAlpha = Math.max(0, 1 - k * 1.6)
        ctx.drawImage(p.white, x, y, w, h)
      }
    }
    ctx.globalAlpha = 1
    // Impact sheets.
    for (const p of this.impacts) {
      if (!p.on || !p.sheet || !p.sheet.ready) continue
      const f = Math.min(IMPACT_FRAMES - 1, Math.floor((p.t * 1000) / IMPACT_FRAME_MS))
      const img = p.sheet.img
      const cw = img.naturalWidth / 3
      const ch = img.naturalHeight / 3
      const sx = (f % 3) * cw + 2
      const sy = ((f / 3) | 0) * ch + 2
      const s = p.size * c
      ctx.drawImage(img, sx, sy, cw - 4, ch - 4, ox + p.x * c - s / 2, oy + p.y * c - s / 2, s, s)
    }
    // Meteors (falling from the top-right, sprite rotated by its baked direction).
    const ms = this.meteorSprite
    if (ms && ms.ready) {
      const b = ms.box
      for (const p of this.meteors) {
        if (!p.on || p.landed || p.t < p.delay) continue
        const k = (p.t - p.delay) / p.dur
        const fall = 1 - k
        const x = p.x + fall * 2.2
        const y = p.y - fall * 7
        const s = (p.big ? 1.6 : 1.0) * c
        ctx.drawImage(ms.img, b.x, b.y, b.w, b.h, ox + x * c - s / 2, oy + y * c - s / 2, s, s)
      }
    }
    // Bolts.
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const p of this.bolts) {
      if (!p.on) continue
      const k = 1 - p.t / p.life
      ctx.globalAlpha = k
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? p.color : '#ffffff'
        ctx.lineWidth = pass === 0 ? Math.max(2, c * 0.1) : Math.max(1, c * 0.035)
        ctx.beginPath()
        ctx.moveTo(ox + p.pts[0]! * c, oy + p.pts[1]! * c)
        for (let i = 1; i < p.n; i++) ctx.lineTo(ox + p.pts[i * 2]! * c, oy + p.pts[i * 2 + 1]! * c)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    // Rings.
    for (const p of this.rings) {
      if (!p.on) continue
      const k = p.t / p.life
      const r = p.r0 + (p.r1 - p.r0) * easeOutCubic(k)
      ctx.globalAlpha = Math.max(0, 1 - k)
      ctx.strokeStyle = p.color
      ctx.lineWidth = Math.max(1, p.width * c * (1 - k * 0.6))
      ctx.beginPath()
      ctx.arc(ox + p.x * c, oy + p.y * c, Math.max(0.1, r * c), 0, TAU)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    // Additive layer: blasts + sparks.
    ctx.globalCompositeOperation = 'lighter'
    for (const p of this.blasts) {
      if (!p.on || !p.img) continue
      const k = p.t / p.life
      const s = p.r * 2 * c * (0.5 + 0.7 * easeOutCubic(k))
      ctx.globalAlpha = Math.max(0, 1 - k) * 0.9
      ctx.drawImage(p.img, ox + p.x * c - s / 2, oy + p.y * c - s / 2, s, s)
    }
    for (const p of this.sparks) {
      if (!p.on || !p.img) continue
      const k = p.life / p.max
      const s = p.size * c * (0.4 + 0.6 * k) * 2
      ctx.globalAlpha = k > 0.3 ? 1 : k / 0.3
      ctx.drawImage(p.img, ox + p.x * c - s / 2, oy + p.y * c - s / 2, s, s)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    // Floaters (skill icons, frost stars).
    for (const p of this.floaters) {
      if (!p.on || !p.img) continue
      const k = p.t / p.life
      const pop = k < 0.2 ? 0.6 + 2 * k : 1 + 0.15 * (k - 0.2)
      const s = p.size * c * pop
      ctx.globalAlpha = k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4)
      const x = ox + p.x * c
      const y = oy + (p.y - p.rise * easeOutCubic(k)) * c
      if (p.spin !== 0) {
        const a = p.spin * p.t
        const d = l.dpr
        const cs = Math.cos(a) * d
        const sn = Math.sin(a) * d
        ctx.setTransform(cs, sn, -sn, cs, x * d, y * d)
        ctx.drawImage(p.img, p.sx, p.sy, p.sw, p.sh, -s / 2, -s / 2, s, s)
        ctx.setTransform(d, 0, 0, d, 0, 0)
      } else {
        ctx.drawImage(p.img, p.sx, p.sy, p.sw, p.sh, x - s / 2, y - s / 2, s, s)
      }
    }
    ctx.globalAlpha = 1
  }

  private readonly fp = { x: 0, y: 0 }

  /** Auto "+1" fliers: green glow trail + the bubble + its "+1" (over monsters, under numbers). */
  drawFliers(ctx: CanvasRenderingContext2D, l: BoardLayout, bubble: HTMLCanvasElement, t: number): void {
    const c = l.cell
    const glow = this.dot('#7dff9a')
    const out = this.fp
    for (const p of this.fliers) {
      if (!p.on) continue
      const waiting = p.t < p.delay
      const k = waiting ? 0 : Math.min(1, (p.t - p.delay) / p.dur)
      const u = k * k * (3 - 2 * k) // ease in-out along the arc
      // Lift-off pop, then shrink into the launcher.
      const scale = waiting ? 1 + 0.06 * Math.sin(t * 18) : k < 0.2 ? 1 + 0.9 * k : 1.18 - 0.55 * ((k - 0.2) / 0.8)
      const r = c * 0.36 * scale
      if (!waiting) {
        ctx.globalCompositeOperation = 'lighter'
        for (let j = FLIER_TRAIL; j >= 1; j--) {
          const uj = u - j * 0.07
          if (uj <= 0) continue
          this.flierPos(p, uj, out)
          const rr = r * (1 - j / (FLIER_TRAIL + 1)) * 1.3
          ctx.globalAlpha = 0.5 * (1 - j / (FLIER_TRAIL + 1))
          ctx.drawImage(glow, l.ox + out.x * c - rr, l.oy + out.y * c - rr, rr * 2, rr * 2)
        }
        ctx.globalCompositeOperation = 'source-over'
      }
      this.flierPos(p, u, out)
      const x = l.ox + out.x * c
      const y = l.oy + out.y * c
      ctx.globalAlpha = 0.55
      ctx.drawImage(glow, x - r * 1.5, y - r * 1.5, r * 3, r * 3)
      ctx.globalAlpha = k > 0.85 ? Math.max(0, 1 - (k - 0.85) / 0.15) : 1
      ctx.drawImage(bubble, x - r, y - r, r * 2, r * 2)
      glyphs('plus').draw(ctx, '+1', x, y, r * 0.95)
    }
    ctx.globalAlpha = 1
  }

  /** Layer 3 — numbers on top of everything (each a baked label: one blit per number). */
  drawNums(ctx: CanvasRenderingContext2D, l: BoardLayout): void {
    const c = l.cell
    const d = l.dpr
    const gg = glyphGen()
    for (const p of this.nums) {
      if (!p.on) continue
      if (p.cv === null || p.cvText !== p.text || p.cvGen !== gg || p.cvSize !== p.size) this.bakeNum(p, d, gg)
      const cv = p.cv
      if (!cv) continue
      const k = p.t / p.life
      let scale: number
      let alpha: number
      let rise: number
      if (k < 0.15) {
        const q = k / 0.15
        scale = 0.5 + 0.65 * q
        alpha = q
        rise = 0.2 * q
      } else {
        const q = (k - 0.15) / 0.85
        scale = 1.15 - 0.25 * q
        alpha = 1 - q * q
        rise = 0.2 + q
      }
      ctx.globalAlpha = Math.max(0, alpha)
      // The bake is made at the 1.15x pop size; scale down from it.
      const sc = scale / 1.15
      const w = (p.cvW / d) * sc
      const h = (p.cvH / d) * sc
      const x = l.ox + p.x * c
      const y = l.oy + p.y * c - rise * p.size * 1.1
      ctx.drawImage(cv, 0, 0, p.cvW, p.cvH, x - w / 2, y - h / 2, w, h)
    }
    ctx.globalAlpha = 1
  }

  private bakeNum(p: DmgNum, d: number, gg: number): void {
    const atlas = glyphs(p.style)
    const size = p.size * 1.15 * d
    const w = Math.ceil(atlas.boxW(p.text, size))
    const h = Math.ceil(atlas.boxH(size))
    let cv = p.cv
    if (!cv || cv.width < w || cv.height < h) {
      cv = createCanvas(Math.max(w, cv?.width ?? 0, 8), Math.max(h, cv?.height ?? 0, 8))
      p.cv = cv
    }
    const g = ctx2d(cv)
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, cv.width, cv.height)
    atlas.draw(g, p.text, w / 2, h / 2, size)
    p.cvW = w
    p.cvH = h
    p.cvText = p.text
    p.cvGen = gg
    p.cvSize = p.size
  }
}

/** A 6-point frost star (freeze proc), baked once. */
export const bakeFrostStar = (px: number): HTMLCanvasElement => {
  const cv = createCanvas(px, px)
  const g = ctx2d(cv)
  const c = px / 2
  const grad = g.createRadialGradient(c, c, 0, c, c, c)
  grad.addColorStop(0, 'rgba(230,248,255,0.95)')
  grad.addColorStop(0.35, 'rgba(150,215,255,0.55)')
  grad.addColorStop(1, 'rgba(120,200,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, px, px)
  g.strokeStyle = 'rgba(235,250,255,0.95)'
  g.lineCap = 'round'
  g.lineWidth = Math.max(1.5, px * 0.045)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU
    const ex = c + Math.cos(a) * c * 0.9
    const ey = c + Math.sin(a) * c * 0.9
    g.beginPath()
    g.moveTo(c, c)
    g.lineTo(ex, ey)
    // side barbs
    for (const f of [0.45, 0.68]) {
      const bx = c + Math.cos(a) * c * 0.9 * f
      const by = c + Math.sin(a) * c * 0.9 * f
      for (const sgn of [-1, 1]) {
        g.moveTo(bx, by)
        g.lineTo(bx + Math.cos(a + sgn * 0.7) * c * 0.18, by + Math.sin(a + sgn * 0.7) * c * 0.18)
      }
    }
    g.stroke()
  }
  return cv
}
