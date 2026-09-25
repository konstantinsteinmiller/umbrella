/**
 * Number glyph atlases — HP plates, damage numbers, "+1", the launcher count.
 *
 * `fillText` + `strokeText` for ~100 labels a frame is one of the slowest
 * things a mobile canvas can do, so each style's digits (and the formatBig
 * suffix letters) are baked once, outlined MIW-style, and a label is drawn as
 * a handful of `drawImage` blits. Numbers only — the canvas never shows words.
 */
import { createCanvas, ctx2d } from './sprites'

export type NumStyle = 'dmg' | 'crit' | 'burn' | 'poison' | 'gold' | 'heal' | 'hp' | 'plus' | 'count' | 'power' | 'combo'

interface StyleDef {
  fill: string
  /** Optional bottom colour: the fill is a vertical gradient fill → fill2. */
  fill2?: string
  stroke: string
  /** Outline width as a fraction of the font size. */
  strokeK: number
  glow: string | null
}

// MIW BattleArena damage-number colours (black outline, soft dark glow).
const STYLES: Record<NumStyle, StyleDef> = {
  dmg: { fill: '#ffffff', stroke: '#000000', strokeK: 0.16, glow: 'rgba(0,0,0,0.6)' },
  crit: { fill: '#ffe23a', stroke: '#000000', strokeK: 0.16, glow: 'rgba(255,120,0,0.55)' },
  burn: { fill: '#ff9a3c', stroke: '#000000', strokeK: 0.16, glow: 'rgba(0,0,0,0.6)' },
  poison: { fill: '#aaff3c', stroke: '#000000', strokeK: 0.16, glow: 'rgba(0,0,0,0.6)' },
  gold: { fill: '#ffd23c', stroke: '#000000', strokeK: 0.16, glow: 'rgba(0,0,0,0.6)' },
  heal: { fill: '#6fe08a', stroke: '#000000', strokeK: 0.16, glow: 'rgba(0,0,0,0.6)' },
  hp: { fill: '#ffffff', stroke: '#0b0e18', strokeK: 0.12, glow: null },
  plus: { fill: '#eaffd0', stroke: '#1f5a12', strokeK: 0.14, glow: null },
  count: { fill: '#ffffff', stroke: '#0b0e18', strokeK: 0.14, glow: null },
  // Run-4 pass: the volley right after a Ball Damage purchase — molten gold
  // (pale gold → deep orange, a burnt outline, a hot glow), never mistaken
  // for a crit's flat yellow.
  power: { fill: '#fff6b8', fill2: '#ffb02a', stroke: '#3a1200', strokeK: 0.17, glow: 'rgba(255,140,0,0.95)' },
  // Fun pass: the combo counter / tally — hot pink over violet, never a crit's
  // yellow or a purchase's molten gold.
  combo: { fill: '#fff0fa', fill2: '#ff4fb0', stroke: '#2a0620', strokeK: 0.17, glow: 'rgba(255,60,170,0.9)' }
}

const CHARSET = '0123456789.+-×KMBTQaiSxpOcNoDdutgVe∞'
// Digits come from 'EB Digits' (fonts.sass: Lilita One limited to 0–9 — the
// HUD's face since run 5, whose "2" can't read as "Z"); every other character
// in CHARSET falls through to 'Angry'.
const FONT_STACK = "'EB Digits', 'Angry', 'Arial Black', 'Arial Rounded MT Bold', Arial, sans-serif"
/** Font size (device px) the atlas is baked at; labels are drawn scaled down from it. */
const BASE_PX = 44

export class GlyphAtlas {
  readonly canvas: HTMLCanvasElement
  private readonly sx = new Float32Array(CHARSET.length)
  private readonly sw = new Float32Array(CHARSET.length)
  private readonly adv = new Float32Array(CHARSET.length)
  private readonly cellH: number
  private readonly pad: number
  private readonly lookup = new Int16Array(128).fill(-1)
  private readonly infIndex: number
  private readonly timesIndex: number

  constructor(style: NumStyle) {
    const def = STYLES[style]
    const font = `900 ${BASE_PX}px ${FONT_STACK}`
    const probe = ctx2d(createCanvas(8, 8))
    probe.font = font
    this.pad = Math.ceil(BASE_PX * def.strokeK + (def.glow ? 5 : 1))
    let total = 0
    for (let i = 0; i < CHARSET.length; i++) {
      const w = probe.measureText(CHARSET[i]!).width
      this.adv[i] = w
      this.sw[i] = Math.ceil(w + this.pad * 2)
      this.sx[i] = total
      total += this.sw[i]! + 1
      const code = CHARSET.charCodeAt(i)
      if (code < 128) this.lookup[code] = i
    }
    this.infIndex = CHARSET.indexOf('∞')
    this.timesIndex = CHARSET.indexOf('×')
    this.cellH = Math.ceil(BASE_PX * 1.25 + this.pad * 2)
    this.canvas = createCanvas(total, this.cellH)
    const g = ctx2d(this.canvas)
    g.font = font
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    g.miterLimit = 2
    const cy = this.cellH / 2 + BASE_PX * 0.04
    let fill: string | CanvasGradient = def.fill
    if (def.fill2) {
      const grad = g.createLinearGradient(0, cy - BASE_PX * 0.42, 0, cy + BASE_PX * 0.42)
      grad.addColorStop(0, def.fill)
      grad.addColorStop(1, def.fill2)
      fill = grad
    }
    for (let i = 0; i < CHARSET.length; i++) {
      const ch = CHARSET[i]!
      const x = this.sx[i]! + this.pad
      if (def.glow) {
        g.shadowColor = def.glow
        g.shadowBlur = 6
      }
      g.lineWidth = BASE_PX * def.strokeK * 2
      g.strokeStyle = def.stroke
      g.strokeText(ch, x, cy)
      g.shadowBlur = 0
      g.shadowColor = 'transparent'
      g.fillStyle = fill
      g.fillText(ch, x, cy)
    }
  }

  private idx(code: number): number {
    if (code < 128) return this.lookup[code]!
    if (code === 0x221e) return this.infIndex
    if (code === 0xd7) return this.timesIndex
    return -1
  }

  /** Width in CSS px of `str` drawn at font size `size` (CSS px). */
  measure(str: string, size: number): number {
    const k = size / BASE_PX
    let w = 0
    for (let i = 0; i < str.length; i++) {
      const g = this.idx(str.charCodeAt(i))
      if (g >= 0) w += this.adv[g]! * k
    }
    return w
  }

  /** Full box (incl. outline padding) of `str` at font size `size`: for label bakes. */
  boxW(str: string, size: number): number {
    return this.measure(str, size) + (this.pad * 2 * size) / BASE_PX
  }

  boxH(size: number): number {
    return (this.cellH * size) / BASE_PX
  }

  /** Draw `str` centred on (x, y) at font size `size` CSS px (ctx carries the DPR transform). */
  draw(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, size: number, alignX = 0.5): void {
    const k = size / BASE_PX
    let cx = x - this.measure(str, size) * alignX
    const top = y - (this.cellH * k) / 2
    const h = this.cellH * k
    const pad = this.pad * k
    for (let i = 0; i < str.length; i++) {
      const g = this.idx(str.charCodeAt(i))
      if (g < 0) continue
      const sw = this.sw[g]!
      ctx.drawImage(this.canvas, this.sx[g]!, 0, sw, this.cellH, cx - pad, top, sw * k, h)
      cx += this.adv[g]! * k
    }
  }
}

const atlases = new Map<NumStyle, GlyphAtlas>()
let fontWatchStarted = false
let gen = 0
/** Bumps when the atlases are re-baked (the game font arrived): cached labels re-bake. */
export const glyphGen = (): number => gen

/** The atlas for a style (baked lazily; re-baked once the game font arrives). */
export const glyphs = (style: NumStyle): GlyphAtlas => {
  let a = atlases.get(style)
  if (!a) {
    a = new GlyphAtlas(style)
    atlases.set(style, a)
  }
  if (!fontWatchStarted) {
    fontWatchStarted = true
    // Re-bake as each face arrives (the digits face and the display face load
    // independently; whichever lands second triggers the final bake).
    const rebake = (faces: FontFace[]): void => {
      if (faces.length) {
        atlases.clear()
        gen++
      }
    }
    try {
      void document.fonts?.load(`900 ${BASE_PX}px Angry`).then(rebake).catch(() => undefined)
      void document.fonts?.load(`900 ${BASE_PX}px 'EB Digits'`, '0123456789').then(rebake).catch(() => undefined)
    } catch { /* FontFaceSet unavailable */ }
  }
  return a
}

/** Precomputed "0".."999" so the common case never allocates. */
export const SMALL_INT_STR: string[] = Array.from({ length: 1000 }, (_, i) => String(i))
