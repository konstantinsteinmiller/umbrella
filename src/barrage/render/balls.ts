/**
 * Ball looks — one baked canvas per (tier, skin, fever) at the current size.
 *
 *   • 'orb'   procedural glass orb, the tier's fighter portrait inside,
 *             element-coloured rim.
 *   • skins   a SHELL around a smaller window of the same glass: the tier's
 *             face, body colour and halo all stay, and the material (a painted
 *             ball's outer band, or a drawn one) owns the band outside it. A
 *             thin accent lip in the tier's element colour separates the two,
 *             so a tier reads the same under every cosmetic (casual rule 1).
 *   • FEVER   the rainbow ball (`feverSrc`), never a skin.
 *
 * Every bake is the same square size (`bakePx`) so the draw path is a single
 * `drawImage` with a fixed offset.
 */
import { BALL_R } from '../engine/types'
import { ballColors, fighterSrc, FIGHTER_ART_MAX } from '../art'
import { BALL_SKINS, ballSkinSrc, feverSrc, skinDef, type BallSkinId } from '../ballSkins'
import { createCanvas, ctx2d, glowDot, rgba, sprite, spriteLoadVersion, type SpriteImage } from './sprites'

/** Visual radius / physics radius — a touch bigger for readability on phones. */
export const BALL_VIS_K = 1.38
/** Bakes are this many visual radii across (room for the biggest halo). */
const BAKE_SPAN = 2 * 1.95

const SKIN_INDEX = new Map<BallSkinId, number>(BALL_SKINS.map((s, i) => [s.id, i]))
const TAU = Math.PI * 2
/** A skin's face window, as a fraction of the visual radius: the portrait keeps
 *  the middle, the shell material the band outside it. */
export const SHELL_IN = 0.72

type BallCol = ReturnType<typeof ballColors>

/** 0 at T1 → 1 at T24+: halo size / strength. */
export const tierGlow = (tier: number): number => Math.max(0, Math.min(1, (tier - 1) / 23))

const fitDraw = (g: CanvasRenderingContext2D, s: SpriteImage, cx: number, cy: number, side: number): void => {
  const b = s.box
  const k = side / Math.max(b.w, b.h)
  const w = b.w * k
  const h = b.h * k
  g.drawImage(s.img, b.x, b.y, b.w, b.h, cx - w / 2, cy - h / 2, w, h)
}

const drawHalo = (g: CanvasRenderingContext2D, c: number, r: number, tier: number, color: string, boost = 0): void => {
  const t = Math.min(1, tierGlow(tier) + boost)
  const outer = r * (1.12 + 0.8 * t)
  const grad = g.createRadialGradient(c, c, r * 0.7, c, c, outer)
  grad.addColorStop(0, rgba(color, 0.35 + 0.45 * t))
  grad.addColorStop(1, rgba(color, 0))
  g.fillStyle = grad
  g.beginPath()
  g.arc(c, c, outer, 0, Math.PI * 2)
  g.fill()
}

/** Clip to the ring between `ri` and `r` (the shell's band). */
const clipRing = (g: CanvasRenderingContext2D, c: number, r: number, ri: number): void => {
  g.beginPath()
  g.arc(c, c, r, 0, TAU)
  g.arc(c, c, ri, 0, TAU, true)
  g.clip()
}

/** A band of `r` → `ri` filled with a radial gradient (inner colour first). */
const fillRing = (g: CanvasRenderingContext2D, c: number, r: number, ri: number, stops: [number, string][]): void => {
  const grad = g.createRadialGradient(c, c, ri, c, c, r)
  for (const [at, color] of stops) grad.addColorStop(at, color)
  g.fillStyle = grad
  g.fillRect(c - r, c - r, r * 2, r * 2)
}

/** A conic sweep where the browser has one (metal), else a diagonal. */
const sweep = (g: CanvasRenderingContext2D, c: number, r: number, stops: [number, string][]): CanvasGradient => {
  const grad = typeof g.createConicGradient === 'function'
    ? g.createConicGradient(-Math.PI / 3, c, c)
    : g.createLinearGradient(c - r, c - r, c + r, c + r)
  for (const [at, color] of stops) grad.addColorStop(at, color)
  return grad
}

/** A tiny four-point sparkle. */
const sparkle = (g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void => {
  g.fillStyle = color
  g.beginPath()
  g.moveTo(x, y - s)
  g.quadraticCurveTo(x, y, x + s, y)
  g.quadraticCurveTo(x, y, x, y + s)
  g.quadraticCurveTo(x, y, x - s, y)
  g.quadraticCurveTo(x, y, x, y - s)
  g.fill()
}

/**
 * The drawn shells — materials the elements have no painting for. Each is
 * drawn inside the ring clip, so it only has to fill the band.
 */
const DRAWN: Partial<Record<BallSkinId, (g: CanvasRenderingContext2D, c: number, r: number, ri: number) => void>> = {
  // Water: deep blue with two rolling foam lines and a few bubbles.
  tide: (g, c, r, ri) => {
    fillRing(g, c, r, ri, [[0, '#4cc0ff'], [0.55, '#1a6fd6'], [1, '#0a2c78']])
    const band = r - ri
    g.lineCap = 'round'
    for (const [k, amp, ph, a] of [[0.34, 0.1, 0, 0.9], [0.7, 0.09, 1.9, 0.55]] as const) {
      g.strokeStyle = `rgba(200,244,255,${a})`
      g.lineWidth = Math.max(1, r * 0.055)
      g.beginPath()
      for (let i = 0; i <= 72; i++) {
        const th = (i / 72) * TAU
        const rr = ri + band * k + band * amp * Math.sin(th * 9 + ph)
        if (i === 0) g.moveTo(c + rr * Math.cos(th), c + rr * Math.sin(th))
        else g.lineTo(c + rr * Math.cos(th), c + rr * Math.sin(th))
      }
      g.stroke()
    }
    g.fillStyle = 'rgba(235,252,255,0.9)'
    for (const th of [0.4, 2.3, 4.1, 5.3]) {
      const rr = ri + band * 0.55
      g.beginPath()
      g.arc(c + rr * Math.cos(th), c + rr * Math.sin(th), Math.max(0.8, r * 0.035), 0, TAU)
      g.fill()
    }
  },
  // Wind: pale mint with streaks chasing each other round the ball.
  gale: (g, c, r, ri) => {
    fillRing(g, c, r, ri, [[0, '#f2fffb'], [0.5, '#a8ecd9'], [1, '#3f9f8e']])
    const band = r - ri
    g.lineCap = 'round'
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * TAU
      const rr = ri + band * (i % 2 ? 0.66 : 0.38)
      g.strokeStyle = 'rgba(255,255,255,0.95)'
      g.lineWidth = Math.max(1, r * 0.06)
      g.beginPath()
      g.arc(c, c, rr, a0, a0 + 0.95)
      g.stroke()
      g.strokeStyle = 'rgba(34,120,108,0.55)'
      g.lineWidth = Math.max(0.8, r * 0.03)
      g.beginPath()
      g.arc(c, c, rr + band * 0.18, a0 + 0.35, a0 + 1.05)
      g.stroke()
    }
  },
  // Ice: faceted shards, light and shade alternating, two glints.
  frost: (g, c, r, ri) => {
    fillRing(g, c, r, ri, [[0, '#f5fdff'], [0.45, '#b2e9ff'], [1, '#3f93d6']])
    const N = 14
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU
      const b = ((i + 1) / N) * TAU
      const m = (a + b) / 2
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.42)' : 'rgba(30,100,170,0.28)'
      g.beginPath()
      g.moveTo(c + ri * Math.cos(a), c + ri * Math.sin(a))
      g.lineTo(c + r * 1.02 * Math.cos(m), c + r * 1.02 * Math.sin(m))
      g.lineTo(c + ri * Math.cos(b), c + ri * Math.sin(b))
      g.closePath()
      g.fill()
    }
    const rr = (r + ri) / 2
    sparkle(g, c + rr * Math.cos(-2.2), c + rr * Math.sin(-2.2), r * 0.13, '#ffffff')
    sparkle(g, c + rr * Math.cos(0.9), c + rr * Math.sin(0.9), r * 0.08, '#ffffff')
  },
  // Gold: a polished band with a bevel, an engraved line and eight studs.
  gilded: (g, c, r, ri) => {
    g.fillStyle = sweep(g, c, r, [
      [0, '#fff4b8'], [0.14, '#ffc62e'], [0.3, '#9a5f00'], [0.45, '#ffdf6b'],
      [0.62, '#b67600'], [0.8, '#ffe98f'], [1, '#fff4b8']
    ])
    g.fillRect(c - r, c - r, r * 2, r * 2)
    fillRing(g, c, r, ri, [[0, 'rgba(255,255,255,0.35)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(60,30,0,0.45)']])
    const band = r - ri
    g.strokeStyle = 'rgba(90,50,0,0.6)'
    g.lineWidth = Math.max(0.8, r * 0.025)
    g.beginPath()
    g.arc(c, c, ri + band * 0.5, 0, TAU)
    g.stroke()
    for (let i = 0; i < 8; i++) {
      const th = (i / 8) * TAU + Math.PI / 8
      const x = c + (ri + band * 0.5) * Math.cos(th)
      const y = c + (ri + band * 0.5) * Math.sin(th)
      const sr = Math.max(1, band * 0.2)
      const stud = g.createRadialGradient(x - sr * 0.35, y - sr * 0.4, 0, x, y, sr)
      stud.addColorStop(0, '#fffbe0')
      stud.addColorStop(0.5, '#e7a91a')
      stud.addColorStop(1, '#7a4a00')
      g.fillStyle = stud
      g.beginPath()
      g.arc(x, y, sr, 0, TAU)
      g.fill()
    }
  },
  // Cosmic / shadow: a starfield band, a violet corona and the bright crescent
  // of an eclipse at the rim.
  eclipse: (g, c, r, ri) => {
    fillRing(g, c, r, ri, [[0, '#2a1250'], [0.6, '#12072a'], [1, '#05020c']])
    const band = r - ri
    g.fillStyle = '#ffffff'
    for (let i = 0; i < 16; i++) {
      const th = i * 2.399963 // golden angle: even, never regular
      const rr = ri + band * (0.2 + 0.6 * ((i * 0.618) % 1))
      g.globalAlpha = 0.45 + 0.5 * ((i * 0.37) % 1)
      g.beginPath()
      g.arc(c + rr * Math.cos(th), c + rr * Math.sin(th), Math.max(0.6, r * (i % 4 ? 0.02 : 0.035)), 0, TAU)
      g.fill()
    }
    g.globalAlpha = 1
    fillRing(g, c, r, ri, [[0, 'rgba(180,110,255,0)'], [0.7, 'rgba(180,110,255,0)'], [1, 'rgba(200,140,255,0.85)']])
    g.lineCap = 'round'
    g.strokeStyle = 'rgba(255,236,190,0.35)'
    g.lineWidth = Math.max(2, band * 0.5)
    g.beginPath()
    g.arc(c, c, r - band * 0.3, -1.45, -0.15)
    g.stroke()
    g.strokeStyle = '#fff3d0'
    g.lineWidth = Math.max(1, band * 0.2)
    g.beginPath()
    g.arc(c, c, r - band * 0.3, -1.35, -0.25)
    g.stroke()
    const x = c + (r - band * 0.3) * Math.cos(-0.25)
    const y = c + (r - band * 0.3) * Math.sin(-0.25)
    sparkle(g, x, y, band * 0.55, '#ffffff')
  }
}

/** The orb's glass (element body, portrait, rim shade) inside radius `rw`. */
const drawWindow = (g: CanvasRenderingContext2D, portrait: SpriteImage, col: BallCol, c: number, rw: number): void => {
  const body = g.createRadialGradient(c - rw * 0.35, c - rw * 0.4, rw * 0.1, c, c, rw)
  body.addColorStop(0, col.light)
  body.addColorStop(0.55, col.body)
  body.addColorStop(1, rgba(col.body, 1))
  g.fillStyle = body
  g.beginPath()
  g.arc(c, c, rw, 0, TAU)
  g.fill()
  g.save()
  g.beginPath()
  g.arc(c, c, rw, 0, TAU)
  g.clip()
  fitDraw(g, portrait, c, c + rw * 0.066, rw * 2.17)
  const shade = g.createRadialGradient(c - rw * 0.2, c - rw * 0.25, rw * 0.3, c, c, rw)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(0,0,20,0.45)')
  g.fillStyle = shade
  g.fillRect(c - rw, c - rw, rw * 2, rw * 2)
  g.restore()
}

export class BallLooks {
  private readonly cache = new Map<number, HTMLCanvasElement>()
  private readonly dots = new Map<number, HTMLCanvasElement>()
  /** Device px radius (visual) the cache was baked for. */
  private rDev = 0
  /** key → sprite load version at which its bake last failed (art not decoded yet). */
  private readonly failed = new Map<number, number>()
  /** Square bake side in device px. */
  bakePx = 1

  /** Call on resize: `cellCss × dpr`. Drops the cache if the size changed. */
  setCell(cellDev: number): void {
    this.setRadius(BALL_R * BALL_VIS_K * cellDev)
  }

  /** Bake for a visual radius in device px (the shop's previews set it directly). */
  setRadius(rDev: number): void {
    const r = Math.max(4, rDev)
    if (Math.abs(r - this.rDev) < 0.25) return
    this.rDev = r
    this.bakePx = Math.ceil(r * BAKE_SPAN)
    this.cache.clear()
    this.dots.clear()
    this.failed.clear()
  }

  clear(): void {
    this.failed.clear()
    this.cache.clear()
    this.dots.clear()
  }

  /** The bake for a ball, or null while its art is still loading (draw a fallback). */
  get(tier: number, skin: BallSkinId, fever: boolean): HTMLCanvasElement | null {
    const t = Math.max(1, Math.min(FIGHTER_ART_MAX + 10, tier | 0))
    const key = fever ? -t : t * 32 + (SKIN_INDEX.get(skin) ?? 0)
    const hit = this.cache.get(key)
    if (hit) return hit
    // A failed bake (art not loaded) is retried only after another image lands.
    const v = spriteLoadVersion()
    if (this.failed.get(key) === v) return null
    const baked = fever ? this.bakeFever(t) : skinDef(skin).material === 'glass' ? this.bakeOrb(t) : this.bakeShell(t, skin)
    if (baked) {
      this.cache.set(key, baked)
      this.failed.delete(key)
    } else {
      this.failed.set(key, v)
    }
    return baked
  }

  /** Soft glow dot in the tier's glow colour (trails, aim dots, sparks). */
  dot(tier: number): HTMLCanvasElement {
    const t = Math.max(1, Math.min(FIGHTER_ART_MAX, tier | 0))
    let d = this.dots.get(t)
    if (!d) {
      d = glowDot(Math.max(8, Math.ceil(this.rDev * 2.2)), ballColors(t).glow, 0.2)
      this.dots.set(t, d)
    }
    return d
  }

  private bakeOrb(tier: number): HTMLCanvasElement | null {
    const portrait = sprite(fighterSrc(tier))
    if (!portrait.ready) return null
    const col = ballColors(tier)
    const S = this.bakePx
    const c = S / 2
    const r = this.rDev
    const cv = createCanvas(S, S)
    const g = ctx2d(cv)
    drawHalo(g, c, r, tier, col.glow)
    // Body: element-coloured glass.
    const body = g.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r)
    body.addColorStop(0, col.light)
    body.addColorStop(0.55, col.body)
    body.addColorStop(1, rgba(col.body, 1))
    g.fillStyle = body
    g.beginPath()
    g.arc(c, c, r, 0, Math.PI * 2)
    g.fill()
    // Portrait inside the glass.
    g.save()
    g.beginPath()
    g.arc(c, c, r * 0.9, 0, Math.PI * 2)
    g.clip()
    fitDraw(g, portrait, c, c + r * 0.06, r * 1.95)
    // Depth: darken toward the rim.
    const shade = g.createRadialGradient(c - r * 0.2, c - r * 0.25, r * 0.3, c, c, r)
    shade.addColorStop(0, 'rgba(0,0,0,0)')
    shade.addColorStop(1, 'rgba(0,0,20,0.45)')
    g.fillStyle = shade
    g.fillRect(0, 0, S, S)
    g.restore()
    // Glass highlight + specular spot.
    const hl = g.createRadialGradient(c - r * 0.32, c - r * 0.42, 0, c - r * 0.32, c - r * 0.42, r * 0.62)
    hl.addColorStop(0, 'rgba(255,255,255,0.75)')
    hl.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = hl
    g.beginPath()
    g.arc(c, c, r, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.9)'
    g.beginPath()
    g.ellipse(c - r * 0.38, c - r * 0.5, r * 0.16, r * 0.1, -0.6, 0, Math.PI * 2)
    g.fill()
    // Rims: element accent + a thin dark outline for contrast on any backdrop.
    const lw = Math.max(1.5, r * 0.16)
    g.lineWidth = lw
    g.strokeStyle = col.accent
    g.beginPath()
    g.arc(c, c, r - lw / 2, 0, Math.PI * 2)
    g.stroke()
    g.lineWidth = Math.max(1, r * 0.06)
    g.strokeStyle = 'rgba(8,10,24,0.75)'
    g.beginPath()
    g.arc(c, c, r + g.lineWidth / 2, 0, Math.PI * 2)
    g.stroke()
    return cv
  }

  /**
   * A skin: the orb's glass shrunk to a window (`SHELL_IN`), the material in the
   * band around it, an accent lip in the tier's colour between the two, and one
   * glass highlight over the lot so it reads as a single ball.
   */
  private bakeShell(tier: number, skin: BallSkinId): HTMLCanvasElement | null {
    const portrait = sprite(fighterSrc(tier))
    if (!portrait.ready) return null
    const src = ballSkinSrc(skin)
    const paint = src ? sprite(src) : null
    if (paint && !paint.ready && !paint.failed) return null
    const col = ballColors(tier)
    const S = this.bakePx
    const c = S / 2
    const r = this.rDev
    const ri = r * SHELL_IN
    const cv = createCanvas(S, S)
    const g = ctx2d(cv)
    drawHalo(g, c, r, tier, col.glow)
    drawWindow(g, portrait, col, c, ri)
    // The shell.
    g.save()
    clipRing(g, c, r, ri)
    if (paint?.ready) {
      // A touch larger than the ball: the painting's own black sticker outline
      // falls outside the clip, so the band is all material (ours is drawn below).
      fitDraw(g, paint, c, c, r * 2.14)
    } else {
      const drawn = DRAWN[skin]
      if (drawn) drawn(g, c, r, ri)
      else fillRing(g, c, r, ri, [[0, '#9aa6bd'], [1, '#3b4458']]) // a painting that failed to load
    }
    g.restore()
    // The lip: a dark seam, and the tier's element accent just inside it.
    const lip = Math.max(1, r * 0.075)
    g.lineWidth = lip
    g.strokeStyle = 'rgba(8,10,24,0.8)'
    g.beginPath()
    g.arc(c, c, ri + lip * 0.3, 0, TAU)
    g.stroke()
    g.strokeStyle = col.accent
    g.beginPath()
    g.arc(c, c, ri - lip * 0.55, 0, TAU)
    g.stroke()
    // One glass highlight over shell and window, and the specular spot.
    const hl = g.createRadialGradient(c - r * 0.34, c - r * 0.44, 0, c - r * 0.34, c - r * 0.44, r * 0.66)
    hl.addColorStop(0, 'rgba(255,255,255,0.55)')
    hl.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = hl
    g.beginPath()
    g.arc(c, c, r, 0, TAU)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.85)'
    g.beginPath()
    g.ellipse(c - ri * 0.36, c - ri * 0.5, ri * 0.15, ri * 0.09, -0.6, 0, TAU)
    g.fill()
    g.lineWidth = Math.max(1, r * 0.06)
    g.strokeStyle = 'rgba(8,10,24,0.75)'
    g.beginPath()
    g.arc(c, c, r + g.lineWidth / 2, 0, TAU)
    g.stroke()
    return cv
  }

  /** FEVER: the rainbow ball with a white rim and a gold halo, for every tier. */
  private bakeFever(tier: number): HTMLCanvasElement | null {
    const src = feverSrc()
    if (!src) return this.bakeOrb(tier)
    const s = sprite(src)
    if (!s.ready) return s.failed ? this.bakeOrb(tier) : null
    const S = this.bakePx
    const c = S / 2
    const r = this.rDev
    const cv = createCanvas(S, S)
    const g = ctx2d(cv)
    drawHalo(g, c, r, 24, '#fff4a8', 0)
    fitDraw(g, s, c, c, r * 2)
    const lw = Math.max(1.5, r * (0.1 + 0.12 * tierGlow(tier)))
    g.lineWidth = lw
    g.strokeStyle = '#ffffff'
    g.beginPath()
    g.arc(c, c, r + lw * 0.35, 0, TAU)
    g.stroke()
    return cv
  }
}

// ─── Shop previews ──────────────────────────────────────────────────────────
const previewLooks = new BallLooks()

/**
 * A skin as it will fly, around `tier`'s face, as a data URL `px` square (the
 * ball fills ~3/4 of it, the rest is halo) — or null while its art is still
 * loading (ask again).
 */
export const ballPreview = (tier: number, skin: BallSkinId, px: number): string | null => {
  const side = Math.max(8, Math.round(px))
  previewLooks.setRadius(side / 2.7)
  const bake = previewLooks.get(tier, skin, false)
  if (!bake) return null
  const cv = createCanvas(side, side)
  const g = ctx2d(cv)
  const off = (bake.width - side) / 2
  g.drawImage(bake, off, off, side, side, 0, 0, side, side)
  // The crop cuts a deep tier's halo: fade it out round, never at a square edge.
  const h = side / 2
  const fade = g.createRadialGradient(h, h, h * 0.8, h, h, h)
  fade.addColorStop(0, '#000')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  g.globalCompositeOperation = 'destination-in'
  g.fillStyle = fade
  g.fillRect(0, 0, side, side)
  return cv.toDataURL('image/png')
}
