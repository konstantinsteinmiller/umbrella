// ─── Standalone arrows and picture boards (decoration the level editor places) ──────────────────
//
// `drawArrow`: the hint board's big black marker arrow on its own, turned to any angle, in the look of
// the build (flat marker black on the skinless game, ink lacquer with a lit gold rim on the painted builds).
// `drawPicture`: an image holder, hung from two ropes above the screen's top edge and swaying a little in the wind,
// in the look of the hint board's paper: the picture fitted inside a flat
// paper board with a black outline, or a washi board in a gold-brown frame; `frame: false` draws the
// picture alone. An empty holder (no image yet, or one still loading) shows a faint picture glyph.
//
// The pictures come from levelImages.ts, which registers itself here (`setPictureImageSource`) so this file
// (and the renderer that calls it) stay free of the editor's storage layer.

import { drawDropArrow } from './signArt'
import { paintedGame } from './kite'
import { ARROW_DEFAULT_ANGLE, type ArrowDef, type PictureDef } from './levels'

let imageSource: (id: string | undefined) => CanvasImageSource | null = () => null
/** Hands over the image lookup (levelImages.ts). */
export const setPictureImageSource = (fn: (id: string | undefined) => CanvasImageSource | null): void => { imageSource = fn }

/** The arrow's width against its height (the board's own arrow is 44 x 54). */
const ARROW_ASPECT = 44 / 54

/** The box a turned arrow fills: a square of its size around its centre (it is what the editor selects). */
export const arrowBox = (a: ArrowDef): { x: number; y: number; w: number; h: number } =>
  ({ x: a.x - a.size / 2, y: a.y - a.size / 2, w: a.size, h: a.size })

export const drawArrow = (ctx: CanvasRenderingContext2D, a: ArrowDef, time: number): void => {
  ctx.save()
  ctx.translate(a.x, a.y)
  // The drawing points down; the angle is clockwise from up.
  ctx.rotate((((a.angle ?? ARROW_DEFAULT_ANGLE) - 180) * Math.PI) / 180)
  // The same slow bob as the board's arrow, along the way it points.
  const bob = Math.sin(time * 4) * a.size * 0.04
  const h = a.size
  const w = h * ARROW_ASPECT
  drawDropArrow(ctx, { x: -w / 2, y: -h / 2 + bob, w, h }, paintedGame)
  ctx.restore()
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** The paper of a board. */
export const drawPaper = (ctx: CanvasRenderingContext2D, p: { x: number; y: number; w: number; h: number }, lit: boolean): void => {
  const r = Math.min(10, Math.min(p.w, p.h) * 0.08)
  if (!lit) {
    ctx.fillStyle = '#f4efe2'
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 3
    roundRect(ctx, p.x, p.y, p.w, p.h, r)
    ctx.fill()
    ctx.stroke()
    return
  }
  ctx.save()
  ctx.shadowColor = 'rgba(40, 14, 4, 0.5)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 3
  const paper = ctx.createLinearGradient(0, p.y, 0, p.y + p.h)
  paper.addColorStop(0, '#fbf0d6')
  paper.addColorStop(1, '#ecd9ab')
  ctx.fillStyle = paper
  roundRect(ctx, p.x, p.y, p.w, p.h, r)
  ctx.fill()
  ctx.restore()
  ctx.save()
  roundRect(ctx, p.x, p.y, p.w, p.h, r)
  ctx.clip()
  ctx.strokeStyle = 'rgba(150, 110, 50, 0.22)'
  ctx.lineWidth = 0.9
  for (let i = 0; i < 40; i++) {
    const fx = p.x + (((i * 53) % 100) / 100) * p.w
    const fy = p.y + (((i * 37) % 100) / 100) * p.h
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.lineTo(fx + 8 + (i % 5) * 3, fy + ((i % 3) - 1) * 2)
    ctx.stroke()
  }
  ctx.restore()
  ctx.strokeStyle = '#8a5a1c'
  ctx.lineWidth = 2.6
  roundRect(ctx, p.x, p.y, p.w, p.h, r)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(232, 184, 74, 0.8)'
  ctx.lineWidth = 1.1
  roundRect(ctx, p.x + 4, p.y + 4, p.w - 8, p.h - 8, Math.max(2, r - 3))
  ctx.stroke()
}

/** A faint picture glyph: a frame with a sun and two hills. */
const drawGlyph = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: boolean): void => {
  const s = Math.min(w, h) * 0.5
  const cx = x + w / 2
  const cy = y + h / 2
  ctx.save()
  ctx.globalAlpha = 0.4
  ctx.strokeStyle = lit ? '#8a5a1c' : '#111'
  ctx.fillStyle = ctx.strokeStyle
  ctx.lineWidth = Math.max(2, s * 0.06)
  ctx.lineJoin = 'round'
  ctx.setLineDash([s * 0.12, s * 0.09])
  roundRect(ctx, cx - s * 0.8, cy - s * 0.6, s * 1.6, s * 1.2, s * 0.12)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.arc(cx - s * 0.38, cy - s * 0.2, s * 0.16, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - s * 0.7, cy + s * 0.5)
  ctx.lineTo(cx - s * 0.2, cy + s * 0.02)
  ctx.lineTo(cx + s * 0.12, cy + s * 0.32)
  ctx.lineTo(cx + s * 0.38, cy + s * 0.1)
  ctx.lineTo(cx + s * 0.7, cy + s * 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** The space between the board's edge and its image, in world units: 0 without the paper board or with "no padding", else
 *  the board's own setting, else the default (14, less on a small board). */
export const pictureInset = (p: PictureDef): number => {
  if (p.frame === false) return 0
  const cap = Math.min(p.w, p.h) * 0.4
  return p.pad !== undefined ? Math.max(0, Math.min(p.pad, cap)) : Math.min(14, Math.min(p.w, p.h) * 0.1)
}

/** The board and its picture, drawn where they are (the caller has already moved the board). */
const drawBoard = (ctx: CanvasRenderingContext2D, p: PictureDef): void => {
  const lit = paintedGame
  const framed = p.frame !== false
  if (framed) drawPaper(ctx, p, lit)
  const pad = pictureInset(p)
  const bx = p.x + pad
  const by = p.y + pad
  const bw = p.w - pad * 2
  const bh = p.h - pad * 2
  const img = imageSource(p.image)
  const iw = img ? ((img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width) : 0
  const ih = img ? ((img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height) : 0
  if (img && iw > 0 && ih > 0) {
    // Fitted whole, by its own aspect, centred in the holder.
    const k = Math.min(bw / iw, bh / ih)
    const w = iw * k
    const h = ih * k
    ctx.save()
    // With no padding the image runs to the board's edge: clipped to its rounded corners, its outline drawn over it.
    const edge = framed && pad === 0
    if (edge) {
      roundRect(ctx, p.x, p.y, p.w, p.h, Math.min(10, Math.min(p.w, p.h) * 0.08))
      ctx.clip()
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, bx + (bw - w) / 2, by + (bh - h) / 2, w, h)
    ctx.restore()
    if (edge) {
      ctx.save()
      ctx.strokeStyle = lit ? '#8a5a1c' : '#111'
      ctx.lineWidth = lit ? 2.6 : 3
      roundRect(ctx, p.x, p.y, p.w, p.h, Math.min(10, Math.min(p.w, p.h) * 0.08))
      ctx.stroke()
      ctx.restore()
    }
  } else {
    drawGlyph(ctx, bx, by, bw, bh, lit)
  }
}

// ── Hanging: two ropes from above the top edge of the screen, a board that sways in the wind ──
/** The rope points, as shares of the board's width: the knots on its top corners, the anchors above the screen
 *  a little closer together (a bridle). */
const KNOT_X = [0.13, 0.87] as const
const ANCHOR_X = [0.27, 0.73] as const
/** How far the board swings at most (world units), how far it turns at most (radians). */
const SWAY = 5
const TWIST = 0.012
const reducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** The wind on this board at `time`, -1..1: slow gusts of different periods; each board on its own phase. */
const wind = (seed: number, time: number): number =>
  (Math.sin(time * 0.55 + seed) + 0.7 * Math.sin(time * 0.93 + seed * 2.3 + 1) + 0.4 * Math.sin(time * 1.47 + seed * 0.7 + 2.2) + 0.15 * Math.sin(time * 2.3 + seed * 1.9)) / 2.25

/** The world y of the screen's top edge under the current transform (null where the context cannot say). */
const screenTop = (ctx: CanvasRenderingContext2D): number | null => {
  const m = ctx.getTransform?.()
  return m && m.d ? -m.f / m.d : null
}

const drawRope = (ctx: CanvasRenderingContext2D, ax: number, ay: number, kx: number, ky: number, lit: boolean): void => {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(kx, ky)
  if (lit) {
    ctx.strokeStyle = '#e8b450'
    ctx.lineWidth = 3.2
    ctx.stroke()
    ctx.strokeStyle = '#7e1a17'
    ctx.setLineDash([3, 4.2])
    ctx.stroke()
  } else {
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 4.4
    ctx.stroke()
    ctx.strokeStyle = '#e9e1cf'
    ctx.lineWidth = 2.4
    ctx.stroke()
  }
  ctx.restore()
}

export const drawPicture = (ctx: CanvasRenderingContext2D, p: PictureDef, time: number): void => drawHung(ctx, p, time, () => drawBoard(ctx, p))

/** Any board hung from two ropes above the screen's top edge, swaying a little in the wind: `body` draws the board itself where
 *  it is (it is moved and turned for the sway; the ropes and knots are drawn here). */
export const drawHung = (ctx: CanvasRenderingContext2D, p: { x: number; y: number; w: number; h: number }, time: number, body: () => void): void => {
  const lit = paintedGame
  const seed = p.x * 0.013 + p.y * 0.007
  const g = reducedMotion() ? 0 : wind(seed, time)
  const dx = g * SWAY
  const phi = g * TWIST + (reducedMotion() ? 0 : 0.004 * Math.sin(time * 1.7 + seed))
  const hx = p.x + p.w / 2
  // The board turns about the middle of its top edge and moves with the swing.
  ctx.save()
  ctx.translate(hx + dx, p.y)
  ctx.rotate(phi)
  ctx.translate(-hx, -p.y)
  body()
  ctx.restore()
  // The ropes: fixed anchors above the screen's top edge, ends at the knots where the board has swung to.
  const top = screenTop(ctx)
  const ay = Math.min(top === null ? p.y - 400 : top - 40, p.y - 60)
  const c = Math.cos(phi), s = Math.sin(phi)
  const KY = Math.min(9, p.h * 0.2)
  KNOT_X.forEach((kx, i) => {
    const lx = kx * p.w - p.w / 2
    const x = hx + dx + lx * c - KY * s
    const y = p.y + lx * s + KY * c
    drawRope(ctx, p.x + ANCHOR_X[i]! * p.w, ay, x, y, lit)
  })
  // The knots, over the board.
  ctx.save()
  ctx.lineWidth = 1.6
  ctx.fillStyle = lit ? '#d6452c' : '#f4efe2'
  ctx.strokeStyle = lit ? '#ffe7a6' : '#111'
  for (const kx of KNOT_X) {
    const lx = kx * p.w - p.w / 2
    ctx.beginPath()
    ctx.arc(hx + dx + lx * c - KY * s, p.y + lx * s + KY * c, 4.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}
