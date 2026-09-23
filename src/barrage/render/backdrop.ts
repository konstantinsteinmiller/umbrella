/**
 * Arena backdrop — baked once per canvas size (and per painted floor): the
 * floor, a faint row grid, the breach line, side-wall frame and a vignette.
 * The floor is the painted one for the current depth band once it has decoded
 * (`FieldArt`), else the procedural stone field, column lanes and launcher
 * ledge. Outside the letterboxed board the bake is TRANSPARENT, so the scene
 * painting behind the canvas shows through. Also the static overlay sprites
 * the frame loop fades in and out (danger tint, FEVER edge, flashes).
 */
import { COLS, FLOOR_Y, ROWS } from '../engine/types'
import { BOARD_BOTTOM, BOARD_TOP, BOARD_W, type BoardLayout } from './layout'
import { createCanvas, ctx2d } from './sprites'
import anchorsJson from './backdropAnchors.json'

// ─── Painted floors ──────────────────────────────────────────────────────────

/** Depth bands by the player-facing row: each band's floor from `from` on, so
 *  beating the boss at row 40 / 80 walks the player into the next zone. A band
 *  whose painting is missing keeps the previous band's floor. */
export const FIELD_BANDS = [
  { from: 1, key: 'board-field' },
  { from: 41, key: 'board-field-corrupted' },
  { from: 81, key: 'board-field-void' }
] as const
export type FieldKey = (typeof FIELD_BANDS)[number]['key']

/** Rows measured on a painting by `pnpm art:backdrops` (source px). A painter
 *  never puts the zones exactly where the prompt asks, so they are mapped from
 *  what it painted: `threshold` is where the battlefield ends, `edge` the
 *  rampart's lit front edge, `runeL..runeR` the glow of the two rune channels. */
export interface FieldAnchors {
  w: number
  h: number
  threshold: number
  edge: number
  runeL: number
  runeR: number
}
export const fieldAnchors = (key: FieldKey): FieldAnchors | null =>
  (anchorsJson as Partial<Record<string, FieldAnchors>>)[key] ?? null

/** A painted floor, decoded, with its anchors. */
export interface FieldArt {
  img: CanvasImageSource
  a: FieldAnchors
}

/** Most the threshold strip may be squashed against the battlefield's scale. */
const MAX_SQUASH = 1.5
/** The rune channels sit this far (cells) inside the board rect's edge — just
 *  clear of the 0.1-cell wall rail drawn over it. */
const RUNE_INSET = 0.15
/** Most the crop may stretch or squeeze the battlefield's own aspect. */
const MAX_ASPECT = 0.05

/**
 * Where each board band is cut from in the painting (source px). Three bands,
 * each mapped onto its own board rows: painting top → end of the battlefield
 * onto board top → breach line, then the threshold strip onto breach line →
 * FLOOR_Y, then one cell of walkway onto FLOOR_Y → board bottom. So the
 * rampart edge lands exactly on the launcher line wherever it was painted.
 * The breach anchor gives way (downwards) when honouring it would squash the
 * threshold strip past MAX_SQUASH. The crop is centred on the rune channels
 * and sized to the battlefield's scale, within MAX_ASPECT.
 */
export const fieldWindow = (a: FieldAnchors): { x: number; w: number; breach: number; edge: number; bottom: number } => {
  const fieldCells = BOARD_TOP + ROWS
  const stripCells = FLOOR_Y - ROWS
  const breach = Math.max(a.threshold, a.edge / (1 + (stripCells * MAX_SQUASH) / fieldCells))
  const natural = BOARD_W * (breach / fieldCells)
  const want = a.runeR - a.runeL + 2 * RUNE_INSET * (breach / fieldCells)
  const w = Math.min(a.w, Math.max(natural * (1 - MAX_ASPECT), Math.min(natural * (1 + MAX_ASPECT), want)))
  const x = Math.max(0, Math.min(a.w - w, (a.runeL + a.runeR) / 2 - w / 2))
  const bottom = Math.min(a.h, a.edge + BOARD_BOTTOM * (w / BOARD_W))
  return { x, w, breach, edge: a.edge, bottom }
}

/** Paint the floor into the board rect band by band, on whole device rows so
 *  the bands butt without a hairline. Leaves the context in device px. */
const drawFieldArt = (g: CanvasRenderingContext2D, l: BoardLayout, art: FieldArt): void => {
  const d = l.dpr
  const win = fieldWindow(art.a)
  const x0 = Math.floor(l.bx * d)
  const x1 = Math.ceil((l.bx + l.bw) * d)
  const yBreach = Math.round((l.oy + ROWS * l.cell) * d)
  const yFloor = Math.round((l.oy + FLOOR_Y * l.cell) * d)
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  const band = (sy0: number, sy1: number, dy0: number, dy1: number): void => {
    if (sy1 > sy0 && dy1 > dy0) g.drawImage(art.img, win.x, sy0, win.w, sy1 - sy0, x0, dy0, x1 - x0, dy1 - dy0)
  }
  band(0, win.breach, Math.floor(l.by * d), yBreach)
  band(win.breach, win.edge, yBreach, yFloor)
  band(win.edge, win.bottom, yFloor, Math.ceil((l.by + l.bh) * d))
}

/** Deterministic hash noise so the speckle pattern never shimmers between bakes. */
const hash = (i: number): number => {
  let x = (i * 374761393) ^ 0x5bd1e995
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

export const bakeBackdrop = (l: BoardLayout, art: FieldArt | null = null): HTMLCanvasElement => {
  const d = l.dpr
  const c = createCanvas(l.cssW * d, l.cssH * d)
  const g = ctx2d(c)
  // Outside the letterbox stays transparent: the scene painting shows there.
  if (art) drawFieldArt(g, l, art)
  g.setTransform(d, 0, 0, d, 0, 0)
  const cell = l.cell
  const x0 = l.ox
  const y0 = l.oy
  const w = COLS * cell
  const top = l.by
  const bottom = l.by + l.bh

  if (!art) {
    // Board field.
    const field = g.createLinearGradient(0, top, 0, bottom)
    field.addColorStop(0, '#1b2044')
    field.addColorStop(0.55, '#141a36')
    field.addColorStop(1, '#0d1124')
    g.fillStyle = field
    g.fillRect(x0, top, w, bottom - top)

    // Column lanes.
    for (let col = 0; col < COLS; col++) {
      if (col % 2 === 0) continue
      g.fillStyle = 'rgba(140,160,255,0.035)'
      g.fillRect(x0 + col * cell, top, cell, (FLOOR_Y + BOARD_TOP) * cell)
    }
    // Stone speckle.
    const n = Math.round((w * (bottom - top)) / 90)
    for (let i = 0; i < n; i++) {
      const px = x0 + hash(i * 3 + 1) * w
      const py = top + hash(i * 3 + 2) * (bottom - top)
      const a = 0.025 + hash(i * 3 + 3) * 0.05
      g.fillStyle = hash(i * 7) > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 2})`
      const s = 0.6 + hash(i * 5) * 1.6
      g.fillRect(px, py, s, s)
    }
  }
  // Row grid (rounded tiles feel): faint horizontal + vertical lines — fainter
  // still over a painted floor, whose own stones must not fight it.
  g.strokeStyle = art ? 'rgba(160,180,255,0.035)' : 'rgba(160,180,255,0.06)'
  g.lineWidth = 1
  g.beginPath()
  for (let r = 0; r <= ROWS; r++) {
    const y = Math.round(y0 + r * cell) + 0.5
    g.moveTo(x0, y)
    g.lineTo(x0 + w, y)
  }
  for (let col = 1; col < COLS; col++) {
    const x = Math.round(x0 + col * cell) + 0.5
    g.moveTo(x, y0)
    g.lineTo(x, y0 + ROWS * cell)
  }
  g.stroke()

  // Entry zone above row 0: fade to dark (the boss peeks in from here).
  const entry = g.createLinearGradient(0, top, 0, y0 + cell * 0.6)
  entry.addColorStop(0, 'rgba(4,6,14,0.9)')
  entry.addColorStop(1, 'rgba(4,6,14,0)')
  g.fillStyle = entry
  g.fillRect(x0, top, w, y0 + cell * 0.6 - top)

  // Breach line (bottom edge of the monster field) — a faint red dash.
  g.strokeStyle = 'rgba(255,80,90,0.22)'
  g.lineWidth = Math.max(1, cell * 0.03)
  g.setLineDash([cell * 0.18, cell * 0.14])
  g.beginPath()
  g.moveTo(x0, y0 + ROWS * cell)
  g.lineTo(x0 + w, y0 + ROWS * cell)
  g.stroke()
  g.setLineDash([])

  // Launcher floor: a lit stone ledge from FLOOR_Y down (a painted floor
  // brings its own rampart walkway, lit edge and all).
  if (!art) {
    const floorY = y0 + FLOOR_Y * cell
    const floor = g.createLinearGradient(0, floorY, 0, bottom)
    floor.addColorStop(0, '#262c55')
    floor.addColorStop(0.15, '#161b38')
    floor.addColorStop(1, '#0a0d1c')
    g.fillStyle = floor
    g.fillRect(x0, floorY, w, bottom - floorY)
    g.fillStyle = 'rgba(150,190,255,0.45)'
    g.fillRect(x0, floorY - 1, w, 2)
    const floorGlow = g.createLinearGradient(0, floorY - cell * 0.5, 0, floorY)
    floorGlow.addColorStop(0, 'rgba(120,160,255,0)')
    floorGlow.addColorStop(1, 'rgba(120,160,255,0.10)')
    g.fillStyle = floorGlow
    g.fillRect(x0, floorY - cell * 0.5, w, cell * 0.5)
  }

  // Side walls (the balls bounce off these).
  const wallW = Math.max(3, l.ox - l.bx)
  for (const side of [0, 1]) {
    const wx = side === 0 ? l.bx : x0 + w
    const wall = g.createLinearGradient(wx, 0, wx + wallW, 0)
    wall.addColorStop(0, side === 0 ? '#2b3366' : '#39428a')
    wall.addColorStop(1, side === 0 ? '#39428a' : '#2b3366')
    g.fillStyle = wall
    g.fillRect(wx, top, wallW, bottom - top)
  }
  g.fillStyle = 'rgba(170,200,255,0.35)'
  g.fillRect(x0 - 1, top, 1, bottom - top)
  g.fillRect(x0 + w, top, 1, bottom - top)

  // Vignette.
  const cx = l.bx + l.bw / 2
  const cy = l.by + l.bh * 0.45
  const vig = g.createRadialGradient(cx, cy, Math.min(l.bw, l.bh) * 0.25, cx, cy, Math.max(l.bw, l.bh) * 0.75)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,0.55)')
  g.fillStyle = vig
  g.fillRect(l.bx, l.by, l.bw, l.bh)
  return c
}

/** Vertical gradient sprite (1 px wide, stretched at draw time). */
export const bakeVGradient = (h: number, stops: [number, string][]): HTMLCanvasElement => {
  const c = createCanvas(1, Math.max(2, h))
  const g = ctx2d(c)
  const grad = g.createLinearGradient(0, 0, 0, c.height)
  for (const [o, col] of stops) grad.addColorStop(o, col)
  g.fillStyle = grad
  g.fillRect(0, 0, 1, c.height)
  return c
}

/** Edge-glow frame (vignette of a colour) at the given device size. */
export const bakeEdgeGlow = (w: number, h: number, color: string, inner = 0.55): HTMLCanvasElement => {
  const c = createCanvas(w, h)
  const g = ctx2d(c)
  const cx = w / 2
  const cy = h / 2
  const grad = g.createRadialGradient(cx, cy, Math.min(w, h) * inner * 0.5, cx, cy, Math.hypot(w, h) * 0.55)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, color)
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  return c
}

/** Rainbow edge frame for FEVER: a soft band of hue around the whole rim. */
export const bakeRainbowFrame = (w: number, h: number): HTMLCanvasElement => {
  const c = createCanvas(w, h)
  const g = ctx2d(c)
  const band = Math.max(6, Math.round(Math.min(w, h) * 0.075))
  // One edge strip: hue gradient along its length, fading out away from the rim.
  const strip = (len: number, a: string, b: string): HTMLCanvasElement => {
    const s = createCanvas(len, band)
    const sg = ctx2d(s)
    const along = sg.createLinearGradient(0, 0, len, 0)
    along.addColorStop(0, a)
    along.addColorStop(1, b)
    sg.fillStyle = along
    sg.fillRect(0, 0, len, band)
    sg.globalCompositeOperation = 'destination-in'
    const fade = sg.createLinearGradient(0, 0, 0, band)
    fade.addColorStop(0, 'rgba(0,0,0,1)')
    fade.addColorStop(1, 'rgba(0,0,0,0)')
    sg.fillStyle = fade
    sg.fillRect(0, 0, len, band)
    return s
  }
  g.drawImage(strip(w, '#ff4d6d', '#ffd23c'), 0, 0)
  g.save(); g.translate(w, 0); g.rotate(Math.PI / 2); g.drawImage(strip(h, '#ffd23c', '#36d399'), 0, 0); g.restore()
  g.save(); g.translate(w, h); g.rotate(Math.PI); g.drawImage(strip(w, '#36d399', '#3c9aff'), 0, 0); g.restore()
  g.save(); g.translate(0, h); g.rotate(-Math.PI / 2); g.drawImage(strip(h, '#b07bff', '#ff4d6d'), 0, 0); g.restore()
  return c
}
