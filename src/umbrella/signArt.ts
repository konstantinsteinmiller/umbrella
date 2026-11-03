// ─── The hint board ("press SPACE to drop") ────────────────────────────────
//
// A paper board held up by two lanterns. Two boards: 'drop' (the SPACE key, or on touch the umbrella
// button, and a big arrow pointing down: open / close the umbrella to drop) and 'float' (Pweeg under
// his open umbrella in a wavy current, a small arrow down: hold it open to float down).
// Both looks are plain canvas drawing (no sheets, nothing to load): `drawSignVector` is the
// skinless game's flat marker-on-paper look, `drawSignLantern` the lantern build's festival
// version (lit washi lanterns with gold caps, washi board, vermilion arrow).
//
// Everything is laid out once in a 120 x 170 design box and scaled uniformly into the sign's
// rectangle, centred on its width and anchored to its top.

import { drawPweeg, drawUmbrella } from './characters'
import type { SignKind } from './levels'

export interface SignBox { x: number; y: number; w: number; h: number }

const DW = 120
const DH = 170

/** Design-box geometry shared by both looks. */
const DROP = {
  lanternX: [22, 98] as readonly number[],
  lanternW: 26,
  lanternTop: 2,
  lanternH: 34,
  board: { x: 6, y: 54, w: 108, h: 58 },
  key: { x: 18, y: 66, w: 84, h: 34 },
  arrow: { cx: 60, top: 116, w: 44, h: 54 }
}
/** The tall board: Pweeg floating under his umbrella, a small arrow at the foot. */
const FLOAT: typeof DROP = {
  ...DROP,
  lanternX: [34, 86],
  board: { x: 24, y: 52, w: 72, h: 116 },
  arrow: { cx: 60, top: 142, w: 19, h: 23 }
}
/** The geometry of the board being drawn (set by `enter`). */
let L = DROP

/** Puts the context into the design box of `b` and returns the scale. */
const enter = (ctx: CanvasRenderingContext2D, b: SignBox, kind: SignKind | undefined): number => {
  L = kind === 'float' ? FLOAT : DROP
  const s = Math.min(b.w / DW, b.h / DH)
  ctx.save()
  ctx.translate(b.x + (b.w - DW * s) / 2, b.y)
  ctx.scale(s, s)
  return s
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** The arrow's outline in a unit box (0..1 each way), traced from the hand-drawn marker arrow of the
 *  sketch: a tall fat shaft nearly as wide as the head and leaning left, a short broad head whose left
 *  wing sticks out a little further than the right, a rounded tip, slightly bowed edges. */
const arrowOutline = (ctx: CanvasRenderingContext2D, r: SignBox): void => {
  const X = (u: number): number => r.x + u * r.w
  const Y = (v: number): number => r.y + v * r.h
  ctx.beginPath()
  ctx.moveTo(X(0.03), Y(0.07))
  ctx.quadraticCurveTo(X(0.4), Y(0.0), X(0.85), Y(0.01))
  ctx.quadraticCurveTo(X(0.84), Y(0.3), X(0.8), Y(0.6))
  ctx.quadraticCurveTo(X(0.92), Y(0.62), X(1.0), Y(0.67))
  ctx.quadraticCurveTo(X(0.78), Y(0.85), X(0.5), Y(0.995))
  ctx.quadraticCurveTo(X(0.47), Y(1.02), X(0.44), Y(0.99))
  ctx.quadraticCurveTo(X(0.18), Y(0.82), X(0.0), Y(0.62))
  ctx.quadraticCurveTo(X(0.03), Y(0.6), X(0.07), Y(0.6))
  ctx.quadraticCurveTo(X(0.01), Y(0.35), X(0.03), Y(0.07))
  ctx.closePath()
}

/** The marker's unfilled "7" in the shaft (the sketch's pen lifted and left a pale crack). */
const arrowCrack = (ctx: CanvasRenderingContext2D, r: SignBox, color: string): void => {
  const X = (u: number): number => r.x + u * r.w
  const Y = (v: number): number => r.y + v * r.h
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(0.8, r.w * 0.04)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(X(0.55), Y(0.14))
  ctx.lineTo(X(0.69), Y(0.1))
  ctx.lineTo(X(0.64), Y(0.54))
  ctx.stroke()
  ctx.restore()
}

/** The lantern build's PAINTED arrow (art-sheets/hint-arrow, painted at the Art Desk), set by art/paint.ts once
 *  it has loaded. Absent: the lantern look draws the traced outline below. */
let paintedArrow: { img: CanvasImageSource; w: number; h: number } | null = null
export const setPaintedDropArrow = (img: CanvasImageSource | null, w = 0, h = 0): void => { paintedArrow = img ? { img, w, h } : null }

/** The drop arrow on its own, filling `r`: the sketch's marker arrow. `lit`: the lantern build's version
 *  (ink-lacquer black with a dry-brush grain and a lit gold rim) instead of the flat skinless one
 *  (marker black with a paper-white rim that keeps it readable on the dark sky). */
export const drawDropArrow = (ctx: CanvasRenderingContext2D, r: SignBox, lit: boolean): void => {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const rim = Math.max(1.2, r.w * 0.09)
  if (lit && paintedArrow) {
    // The painting, fitted into the box by its own aspect, its glow soft on the sky.
    const k = Math.min(r.w / paintedArrow.w, r.h / paintedArrow.h)
    const w = paintedArrow.w * k
    const h = paintedArrow.h * k
    ctx.shadowColor = 'rgba(255, 170, 70, 0.55)'
    ctx.shadowBlur = r.w * 0.25
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(paintedArrow.img, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h)
    ctx.restore()
    return
  }
  if (lit) {
    ctx.save()
    ctx.shadowColor = 'rgba(255, 170, 70, 0.7)'
    ctx.shadowBlur = r.w * 0.25
    arrowOutline(ctx, r)
    ctx.strokeStyle = '#e8b84a'
    ctx.lineWidth = rim
    ctx.stroke()
    ctx.restore()
    arrowOutline(ctx, r)
    const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h)
    g.addColorStop(0, '#2a1208')
    g.addColorStop(1, '#120503')
    ctx.fillStyle = g
    ctx.strokeStyle = '#1c0b05'
    ctx.lineWidth = Math.max(0.8, r.w * 0.04)
    ctx.fill()
    ctx.stroke()
    // Dry-brush streaks running down the stroke.
    ctx.save()
    arrowOutline(ctx, r)
    ctx.clip()
    ctx.strokeStyle = 'rgba(255, 200, 140, 0.13)'
    ctx.lineWidth = Math.max(0.5, r.w * 0.012)
    for (let k = 0; k < 7; k++) {
      const x = r.x + (0.14 + k * 0.1) * r.w
      ctx.beginPath()
      ctx.moveTo(x, r.y + r.h * (0.05 + (k % 3) * 0.04))
      ctx.lineTo(x + r.w * 0.02, r.y + r.h * (0.55 + (k % 2) * 0.2))
      ctx.stroke()
    }
    ctx.restore()
    arrowCrack(ctx, r, '#f3e2b4')
  } else {
    arrowOutline(ctx, r)
    ctx.strokeStyle = '#f4efe2'
    ctx.lineWidth = rim
    ctx.stroke()
    ctx.fillStyle = '#111'
    ctx.strokeStyle = '#111'
    ctx.lineWidth = Math.max(0.8, r.w * 0.04)
    ctx.fill()
    ctx.stroke()
    arrowCrack(ctx, r, '#f4efe2')
  }
  ctx.restore()
}

/** The board's arrow, bobbing at the foot of the design box. */
const boardArrow = (ctx: CanvasRenderingContext2D, time: number, lit: boolean): void => {
  const a = L.arrow
  drawDropArrow(ctx, { x: a.cx - a.w / 2, y: a.top + Math.sin(time * 4) * 3, w: a.w, h: a.h }, lit)
}

/** A paper lantern floating at `cx`, no rope above it; the board hangs from its tassel cord. */
const lantern = (ctx: CanvasRenderingContext2D, cx: number, tilt: number, lit: boolean): void => {
  const w = L.lanternW
  const top = L.lanternTop
  const h = L.lanternH
  ctx.save()
  ctx.translate(cx, 0)
  ctx.rotate(tilt)
  ctx.translate(-cx, 0)
  if (lit) {
    // The light through the washi.
    const g = ctx.createRadialGradient(cx, top + h / 2, 2, cx, top + h / 2, w * 1.5)
    g.addColorStop(0, 'rgba(255, 198, 110, 0.7)')
    g.addColorStop(0.5, 'rgba(255, 150, 60, 0.25)')
    g.addColorStop(1, 'rgba(255, 138, 60, 0)')
    ctx.fillStyle = g
    // The whole disc, so the light fades out on every side instead of stopping at a box edge.
    const R = w * 1.5
    ctx.fillRect(cx - R, top + h / 2 - R, R * 2, R * 2)
  }
  // Body.
  const body = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0)
  if (lit) {
    body.addColorStop(0, '#c2331d')
    body.addColorStop(0.45, '#ff6a3a')
    body.addColorStop(1, '#b42a18')
  } else {
    body.addColorStop(0, '#e4572e')
    body.addColorStop(1, '#e4572e')
  }
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(cx, top + h / 2, w / 2, h / 2 - 3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = lit ? '#6b1608' : '#111'
  ctx.lineWidth = lit ? 1.2 : 2
  ctx.stroke()
  if (lit) {
    // The ribs of the bamboo frame.
    ctx.strokeStyle = 'rgba(107, 22, 8, 0.45)'
    ctx.lineWidth = 0.9
    for (let k = 0; k <= 2; k++) {
      ctx.beginPath()
      if (k === 0) { ctx.moveTo(cx, top + 3); ctx.lineTo(cx, top + h - 3) }
      else ctx.ellipse(cx, top + h / 2, k * (w / 5), h / 2 - 3, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    // A glint.
    ctx.fillStyle = 'rgba(255, 236, 200, 0.5)'
    ctx.beginPath()
    ctx.ellipse(cx - w * 0.2, top + h * 0.38, 2.4, 6, -0.2, 0, Math.PI * 2)
    ctx.fill()
  }
  // Caps, top and bottom.
  ctx.fillStyle = lit ? '#e8b84a' : '#f4efe2'
  ctx.strokeStyle = lit ? '#7a5410' : '#111'
  ctx.lineWidth = lit ? 1 : 2
  for (const y of [top - 1, top + h - 5]) {
    roundRect(ctx, cx - w * 0.3, y, w * 0.6, 6, 2)
    ctx.fill()
    ctx.stroke()
  }
  // Tassel, the board's cord hangs from its knot.
  ctx.strokeStyle = lit ? '#e8b84a' : '#111'
  ctx.lineWidth = lit ? 2 : 2
  ctx.beginPath()
  ctx.moveTo(cx, top + h + 4)
  ctx.lineTo(cx, L.board.y)
  ctx.stroke()
  ctx.restore()
}

/** The keycap's legend: it is a key name, the same on every keyboard layout and in every language. */
const KEY_LEGEND = 'SPACE'


/** The SPACE keycap. */
const legendKey = (ctx: CanvasRenderingContext2D, lit: boolean): void => {
  const k = L.key
  if (lit) {
    // Dark lacquer with a lit top face.
    ctx.fillStyle = '#3a1a0e'
    roundRect(ctx, k.x, k.y + 3, k.w, k.h, 6)
    ctx.fill()
    const face = ctx.createLinearGradient(0, k.y, 0, k.y + k.h)
    face.addColorStop(0, '#fff6e0')
    face.addColorStop(1, '#f0dcae')
    ctx.fillStyle = face
    ctx.strokeStyle = '#6b1608'
    ctx.lineWidth = 1.6
  } else {
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2.5
  }
  roundRect(ctx, k.x, k.y, k.w, k.h, 6)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = lit ? '#7a1a0a' : '#111'
  ctx.font = `800 ${lit ? 16 : 17}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(KEY_LEGEND, k.x + k.w / 2, k.y + k.h / 2 + 1)
}

/** Phones and tablets: the board shows the round umbrella button instead of the SPACE key. Set by the scene. */
let touchLegend = false
export const setSignTouch = (on: boolean): void => { touchLegend = on }

/** A small open umbrella (canopy, scalloped rim, hooked handle) centred on (cx, cy), `r` wide each side. */
const umbrellaGlyph = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, ink: string, fill: string): void => {
  ctx.save()
  ctx.strokeStyle = ink
  ctx.fillStyle = fill
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy - r * 0.15, r, Math.PI, 0)
  const y = cy - r * 0.15
  for (let k = 0; k < 3; k++) ctx.arc(cx + r - (k * 2 + 1) * (r / 3), y, r / 3, 0, Math.PI)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, y)
  ctx.lineTo(cx, cy + r * 0.8)
  ctx.arc(cx - r * 0.2, cy + r * 0.8, r * 0.2, 0, Math.PI)
  ctx.stroke()
  ctx.restore()
}

/** The legend on the board: the SPACE keycap (desktop) or the round umbrella button (touch). */
const legend = (ctx: CanvasRenderingContext2D, lit: boolean): void => {
  const k = L.key
  if (!touchLegend) return legendKey(ctx, lit)
  const cx = k.x + k.w / 2
  const cy = k.y + k.h / 2
  const r = k.h / 2 + 2
  ctx.fillStyle = lit ? '#3a1a0e' : '#111'
  ctx.beginPath()
  ctx.arc(cx, cy + (lit ? 3 : 0), r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = lit ? '#fff0cc' : '#ffffff'
  ctx.strokeStyle = lit ? '#6b1608' : '#111'
  ctx.lineWidth = lit ? 1.6 : 2.5
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  umbrellaGlyph(ctx, cx, cy, r * 0.62, lit ? '#7a1a0a' : '#111', lit ? '#ff6a3a' : '#e4572e')
}

/** The float board's picture: a wavy current over Pweeg, who hangs under his open umbrella, in a dark
 *  window so his white body reads on the paper. */
const floatScene = (ctx: CanvasRenderingContext2D, time: number, lit: boolean): void => {
  const bd = L.board
  const px = bd.x + 5, py = bd.y + 5, pw = bd.w - 10, ph = bd.h - 36
  const night = ctx.createLinearGradient(0, py, 0, py + ph)
  night.addColorStop(0, lit ? '#3a2a5e' : '#1b2130')
  night.addColorStop(1, lit ? '#1b2130' : '#1b2130')
  ctx.fillStyle = night
  roundRect(ctx, px, py, pw, ph, 5)
  ctx.fill()
  // The current: a wavy line running down to the umbrella.
  ctx.save()
  ctx.strokeStyle = lit ? '#ffd48a' : '#9fd3ff'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let y = py + 5; y <= py + 27; y += 1.5) {
    const x = 60 + 3.2 * Math.sin(y * 0.55 - time * 5)
    if (y === py + 5) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
  // Pweeg under the open umbrella, scaled to fit the window.
  const k = 0.5
  ctx.save()
  ctx.translate(60, py + ph - 5)
  ctx.scale(k, k)
  drawPweeg(ctx, 0, 0, { pose: 'hold', facing: 1, w: 24, h: 36, time, open: true })
  drawUmbrella(ctx, 0, -40, { state: 'open', tilt: 0, time })
  ctx.restore()
}

/** Skinless: flat shapes, marker ink on paper. */
export const drawSignVector = (ctx: CanvasRenderingContext2D, b: SignBox, time: number, kind?: SignKind): void => {
  enter(ctx, b, kind)
  const sway = 0
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  lantern(ctx, L.lanternX[0]!, sway, false)
  lantern(ctx, L.lanternX[1]!, -sway, false)
  const bd = L.board
  ctx.fillStyle = '#f4efe2'
  ctx.strokeStyle = '#111'
  ctx.lineWidth = 3
  roundRect(ctx, bd.x, bd.y, bd.w, bd.h, 8)
  ctx.fill()
  ctx.stroke()
  if (kind === 'float') floatScene(ctx, time, false)
  else legend(ctx, false)
  boardArrow(ctx, time, false)
  ctx.restore()
}

/** Lantern build: lit washi lanterns, a washi board with fibres, a gold-edged vermilion arrow. */
export const drawSignLantern = (ctx: CanvasRenderingContext2D, b: SignBox, time: number, kind?: SignKind): void => {
  enter(ctx, b, kind)
  const sway = 0
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  lantern(ctx, L.lanternX[0]!, sway, true)
  lantern(ctx, L.lanternX[1]!, 0, true)
  const bd = L.board
  // Soft drop shadow, then the paper.
  ctx.save()
  ctx.shadowColor = 'rgba(40, 14, 4, 0.5)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 3
  const paper = ctx.createLinearGradient(0, bd.y, 0, bd.y + bd.h)
  paper.addColorStop(0, '#fbf0d6')
  paper.addColorStop(1, '#ecd9ab')
  ctx.fillStyle = paper
  roundRect(ctx, bd.x, bd.y, bd.w, bd.h, 5)
  ctx.fill()
  ctx.restore()
  // Fibres in the washi (fixed pseudo-random strokes).
  ctx.save()
  roundRect(ctx, bd.x, bd.y, bd.w, bd.h, 5)
  ctx.clip()
  ctx.strokeStyle = 'rgba(150, 110, 50, 0.22)'
  ctx.lineWidth = 0.7
  for (let i = 0; i < 26; i++) {
    const fx = bd.x + ((i * 53) % 100) / 100 * bd.w
    const fy = bd.y + ((i * 37) % 100) / 100 * bd.h
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.lineTo(fx + 6 + (i % 5) * 2, fy + ((i % 3) - 1) * 2)
    ctx.stroke()
  }
  ctx.restore()
  // A gold-brown brushed frame.
  ctx.strokeStyle = '#8a5a1c'
  ctx.lineWidth = 2.2
  roundRect(ctx, bd.x, bd.y, bd.w, bd.h, 5)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(232, 184, 74, 0.8)'
  ctx.lineWidth = 0.9
  roundRect(ctx, bd.x + 3, bd.y + 3, bd.w - 6, bd.h - 6, 3)
  ctx.stroke()
  if (kind === 'float') floatScene(ctx, time, true)
  else legend(ctx, true)
  boardArrow(ctx, time, true)
  ctx.restore()
}
