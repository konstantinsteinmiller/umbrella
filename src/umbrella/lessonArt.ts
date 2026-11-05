// ─── Controls boards: the how-to-play lessons a level designer hangs in the first levels ────────────────
//
// Three animated boards, each in a touch and a keyboard version (which one shows follows the device: signArt's `signTouch`):
//   · move   — steering. Touch: a finger slides along an infinity line while Pweeg below walks left and right with it.
//              Keyboard: the arrow keys and the letter keys (in the player's own letters) press in turn as he walks.
//   · auto   — walking off a ledge opens the umbrella by itself: he steps off, drops a beat, the umbrella pops open on its
//              own (a burst), and he floats. No key or finger is involved, which is the point.
//   · toggle — the umbrella button (touch: it shows what a tap does next, so the open umbrella while it is shut) or the SPACE
//              key opens and shuts the umbrella: Pweeg floats under it open and drops like a stone with it shut.
// Everything is plain canvas drawing on the same clock as the world (no assets), in the build's look (flat marker black on the
// drawn game, lit washi and gold on the painted builds), hung from two swaying ropes like the picture boards (pictureArt.ts).

import { drawPweeg, drawUmbrella } from './characters'
import { paintedGame } from './kite'
import { drawHung, drawPaper } from './pictureArt'
import { signTouch } from './signArt'
import type { LessonDef } from './levels'

/** The keys the keyboard boards show, in the player's own letters (set by the scene from the key bindings and the keyboard layout). */
export interface LessonKeys { left: string[]; right: string[]; umbrella: string }
let keys: LessonKeys = { left: ['←', 'A'], right: ['→', 'D'], umbrella: 'SPACE' }
export const setLessonKeys = (k: LessonKeys): void => { keys = k }

const HAND = 'M13.2 1.5c-1.9 0-3.4 1.5-3.4 3.4v17.6l-2.2-2.1c-1.2-1.1-3.1-1.1-4.2.1-1 1.1-1 2.8 0 3.9l7.4 8.4c1.6 1.9 3.8 3 6.3 3h8.1c3.7 0 6.7-3 6.7-6.7v-9.2c0-1.5-1.2-2.7-2.7-2.7-.5 0-.9.1-1.3.3-.4-1.2-1.5-2.1-2.8-2.1-.6 0-1.2.2-1.7.5-.5-1.1-1.5-1.8-2.7-1.8-.4 0-.8.1-1.1.2V4.9c0-1.9-1.5-3.4-3.4-3.4z'
const UMB_OPEN = 'M3 30 A21 21 0 0 1 45 30 Q39.5 25 34.5 30 Q29.2 25 24 30 Q18.8 25 13.5 30 Q8.5 25 3 30Z'
const UMB_OPEN_POLE = 'M24 30 V52 a4.2 4.2 0 0 1 -8.4 0'
const UMB_FURLED = 'M24 3 C28 11 29 24 26.5 40 L21.5 40 C19 24 20 11 24 3Z'
const UMB_FURLED_POLE = 'M24 40 V56 a4.2 4.2 0 0 1 -8.4 0'
const path2d = (d: string): Path2D | null => (typeof Path2D !== 'undefined' ? new Path2D(d) : null)

interface Look { lit: boolean; accent: string; ink: string; line: string; panelTop: string; panelBottom: string; hand: string; handLine: string; key: string; keyEdge: string; keyInk: string; umb: string; umbLine: string; ledge: string }
const look = (lit: boolean): Look => lit
  ? { lit, accent: '#ffc66e', ink: '#fbf1dc', line: 'rgba(255, 231, 166, 0.75)', panelTop: '#3a2a5e', panelBottom: '#1b1740', hand: '#fbf1dc', handLine: '#7e1a17', key: '#fbf0d6', keyEdge: '#a06a1e', keyInk: '#7e1a17', umb: '#f6ecd6', umbLine: '#7e1a17', ledge: '#e8b450' }
  : { lit, accent: '#4f8cff', ink: '#fff', line: 'rgba(255, 255, 255, 0.55)', panelTop: '#1b2336', panelBottom: '#0f1522', hand: '#f4efe2', handLine: '#111', key: '#f4efe2', keyEdge: '#111', keyInk: '#111', umb: '#ff5d5d', umbLine: '#fff', ledge: '#f4efe2' }

const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
const smooth = (x: number): number => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c) }

const finger = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, L: Look, tilt = 0): void => {
  const p = path2d(HAND)
  if (!p) return
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  ctx.scale(s, s)
  ctx.translate(-13.2, -2) // the fingertip on the point
  ctx.lineJoin = 'round'
  ctx.lineWidth = 1.8
  ctx.strokeStyle = L.handLine
  ctx.fillStyle = L.hand
  ctx.stroke(p)
  ctx.fill(p)
  ctx.restore()
}

const umbrellaIcon = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, open: boolean, L: Look): void => {
  const d = open ? UMB_OPEN : UMB_FURLED
  const pole = open ? UMB_OPEN_POLE : UMB_FURLED_POLE
  const a = path2d(d), b = path2d(pole)
  if (!a || !b) return
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(size / 64, size / 64)
  ctx.translate(open ? -24 : -22.05, open ? -31.4 : -31.6) // centred on its own outline
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.fillStyle = L.umb
  ctx.strokeStyle = L.umbLine
  ctx.fill(a)
  ctx.stroke(a)
  ctx.stroke(b)
  ctx.restore()
}

const keycap = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, pressed: boolean, L: Look): void => {
  const depth = pressed ? 1.5 : 5
  const top = y + (pressed ? 4 : 0)
  ctx.save()
  ctx.fillStyle = L.keyEdge
  rr(ctx, x, top + depth, w, h - 4, 6)
  ctx.fill()
  ctx.fillStyle = pressed ? L.accent : L.key
  rr(ctx, x, top, w, h - 4, 6)
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = L.keyEdge
  ctx.stroke()
  ctx.fillStyle = pressed && !L.lit ? '#fff' : L.keyInk
  ctx.font = `800 ${Math.min(h * 0.42, w / Math.max(1.6, label.length * 0.62))}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + w / 2, top + (h - 4) / 2 + 1)
  ctx.restore()
}

const panel = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, L: Look): void => {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, L.panelTop)
  g.addColorStop(1, L.panelBottom)
  ctx.fillStyle = g
  rr(ctx, x, y, w, h, 8)
  ctx.fill()
}

const pweeg = (ctx: CanvasRenderingContext2D, x: number, feetY: number, k: number, pose: 'walk' | 'stand' | 'flail' | 'hold', open: boolean, facing: 1 | -1, time: number, step = 0): void => {
  ctx.save()
  ctx.translate(x, feetY)
  ctx.scale(k, k)
  drawPweeg(ctx, 0, 0, { pose, facing, w: 24, h: 36, time, open, step })
  if (pose === 'hold') drawUmbrella(ctx, 0, -40, { state: 'open', tilt: 0, time })
  else if (pose === 'flail') drawUmbrella(ctx, facing * 23.5, -32.4, { state: 'furled', tilt: facing * 0.35, time })
  else drawUmbrella(ctx, facing * 19, -12, { state: 'furled', tilt: facing * 0.22, time })
  ctx.restore()
}

const ledge = (ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, L: Look): void => {
  ctx.fillStyle = L.ledge
  ctx.fillRect(x0, y, x1 - x0, 5)
}

// ── move ────────────────────────────────────────────────────────────────────────────────────────────
const drawMove = (ctx: CanvasRenderingContext2D, ix: number, iy: number, iw: number, ih: number, time: number, L: Look): void => {
  const PERIOD = 4.4
  const th = ((time % PERIOD) / PERIOD) * Math.PI * 2
  const topH = ih * 0.6
  const cx = ix + iw / 2
  const A = iw * 0.36
  if (signTouch()) {
    // The infinity line (a figure eight on its side), dotted, with the finger sliding along it and a glowing tail.
    const cy = iy + topH / 2
    const B = topH * 0.36
    const at = (a: number) => ({ x: cx + A * Math.sin(a), y: cy + B * Math.sin(a) * Math.cos(a) * 1.15 })
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = L.line
    ctx.lineWidth = 2.4
    ctx.setLineDash([1, 7])
    ctx.beginPath()
    for (let i = 0; i <= 80; i++) {
      const p = at((i / 80) * Math.PI * 2)
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.strokeStyle = L.accent
    ctx.shadowColor = L.accent
    ctx.shadowBlur = 8
    for (let i = 0; i < 24; i++) {
      const a0 = th - (i / 24) * 1.7, a1 = th - ((i + 1) / 24) * 1.7
      const p0 = at(a0), p1 = at(a1)
      ctx.globalAlpha = 1 - i / 24
      ctx.lineWidth = 5.5 * (1 - i / 36)
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
    }
    ctx.restore()
    const f = at(th)
    ctx.save()
    ctx.fillStyle = L.accent
    ctx.globalAlpha = 0.3
    ctx.beginPath()
    ctx.arc(f.x, f.y, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    finger(ctx, f.x, f.y, 0.62, L)
  } else {
    // The keys: the arrow keys over the letter keys, the one for the way he walks pressed.
    const right = Math.cos(th) > 0
    const kw = Math.min(54, iw * 0.17), kh = Math.min(46, topH * 0.44)
    const rows = [[keys.left[0] ?? '←', keys.right[0] ?? '→'], [keys.left[1], keys.right[1]]].filter((r): r is [string, string] => !!r[0] && !!r[1])
    const total = rows.length * kh + (rows.length - 1) * 6
    rows.forEach((r, i) => {
      const y = iy + (topH - total) / 2 + i * (kh + 6)
      keycap(ctx, cx - kw - 6, y, kw, kh, r[0], !right, L)
      keycap(ctx, cx + 6, y, kw, kh, r[1], right, L)
    })
  }
  // Pweeg below, walking left and right with the finger / the keys.
  const gy = iy + ih * 0.9
  ledge(ctx, ix + iw * 0.06, ix + iw * 0.94, gy, L)
  pweeg(ctx, cx + A * Math.sin(th), gy, Math.min(1.1, ih / 150), 'walk', false, Math.cos(th) > 0 ? 1 : -1, time, time * 9)
}

// ── auto ────────────────────────────────────────────────────────────────────────────────────────────
const drawAuto = (ctx: CanvasRenderingContext2D, ix: number, iy: number, iw: number, ih: number, time: number, L: Look): void => {
  const PERIOD = 5
  const u = (time % PERIOD) / PERIOD
  const edgeX = ix + iw * 0.5
  const ly = iy + ih * 0.45
  ledge(ctx, ix + iw * 0.04, edgeX, ly, L)
  const k = Math.min(1.1, ih / 150)
  const alpha = Math.min(1, u / 0.06, (1 - u) / 0.08)
  ctx.save()
  ctx.globalAlpha = Math.max(0, alpha)
  let x: number, y: number
  if (u < 0.42) { // walking to the edge
    x = ix + iw * 0.12 + (edgeX - 8 - (ix + iw * 0.12)) * (u / 0.42)
    y = ly
    pweeg(ctx, x, y, k, 'walk', false, 1, time, time * 9)
  } else if (u < 0.6) { // off the edge: dropping, speeding up, umbrella still furled
    const f = (u - 0.42) / 0.18
    x = edgeX - 8 + f * iw * 0.06
    y = ly + ih * 0.3 * f * f
    pweeg(ctx, x, y, k, 'flail', false, 1, time)
  } else { // the umbrella has opened by itself: he floats down slowly
    const f = (u - 0.6) / 0.4
    x = edgeX - 8 + iw * 0.06 + f * iw * 0.12
    y = ly + ih * 0.3 + ih * 0.1 * f
    pweeg(ctx, x, y, k, 'hold', true, 1, time)
    // The pop: rings and sparks round the canopy as it opens.
    const pop = (u - 0.6) / 0.12
    if (pop < 1) {
      ctx.strokeStyle = L.accent
      ctx.lineWidth = 3 * (1 - pop)
      ctx.globalAlpha = Math.max(0, alpha * (1 - pop))
      ctx.beginPath()
      ctx.arc(x, y - 50 * k, 12 + 34 * pop, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(x + Math.cos(a) * (22 + 30 * pop), y - 50 * k + Math.sin(a) * (22 + 30 * pop))
        ctx.lineTo(x + Math.cos(a) * (30 + 38 * pop), y - 50 * k + Math.sin(a) * (30 + 38 * pop))
        ctx.stroke()
      }
    }
  }
  ctx.restore()
}

// ── toggle ──────────────────────────────────────────────────────────────────────────────────────────
const drawToggle = (ctx: CanvasRenderingContext2D, ix: number, iy: number, iw: number, ih: number, time: number, L: Look): void => {
  const PERIOD = 3.6
  const u = (time % PERIOD) / PERIOD
  const openFrom = 0.33, openTo = 0.73
  const open = u >= openFrom && u < openTo
  // Pweeg on the left: shut he drops fast (speeding up), open he drifts down slowly.
  const y01 = u < openFrom ? 0.2 + 0.4 * Math.pow(u / openFrom, 1.7) : u < openTo ? 0.6 + 0.06 * ((u - openFrom) / (openTo - openFrom)) : 0.66 + 0.34 * Math.pow((u - openTo) / (1 - openTo), 1.7)
  const alpha = Math.min(1, u / 0.05, (1 - u) / 0.07)
  const k = Math.min(1.1, ih / 150)
  const px = ix + iw * 0.27
  ctx.save()
  ctx.globalAlpha = Math.max(0, alpha)
  if (open) pweeg(ctx, px, iy + y01 * ih, k, 'hold', true, 1, time)
  else {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 2
    for (let i = 0; i < 4; i++) {
      const lx = px + (i - 1.5) * 13 * k
      const run = (((time * 5 + i * 0.37) % 1) + 1) % 1
      const ly = iy + (0.95 - run * 0.85) * ih
      ctx.beginPath()
      ctx.moveTo(lx, ly)
      ctx.lineTo(lx, ly + 24 * k)
      ctx.stroke()
    }
    pweeg(ctx, px, iy + y01 * ih, k, 'flail', false, 1, time)
  }
  ctx.restore()
  // The control on the right, pressed twice per loop (at 24 % and 72 %).
  const tap = (v: number) => Math.max(0, 1 - Math.abs(u - v) / 0.07)
  const press = Math.max(tap(0.24), tap(0.72))
  const cx = ix + iw * 0.66
  const cy = iy + ih * 0.5
  // Chevrons from the control towards Pweeg, flashing after each press.
  ctx.save()
  ctx.strokeStyle = L.accent
  ctx.lineWidth = 3.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const flash = Math.max(smooth(1 - Math.abs(u - 0.31) / 0.1), smooth(1 - Math.abs(u - 0.79) / 0.1))
  for (let i = 0; i < 3; i++) {
    const x = ix + iw * (0.5 - i * 0.045)
    ctx.globalAlpha = 0.2 + 0.8 * flash
    ctx.beginPath()
    ctx.moveTo(x + 5, cy - 8)
    ctx.lineTo(x - 2, cy)
    ctx.lineTo(x + 5, cy + 8)
    ctx.stroke()
  }
  ctx.restore()
  if (signTouch()) {
    const r = Math.min(ih * 0.3, iw * 0.15)
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.strokeStyle = open ? '#ffe7a6' : 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 3
    if (open) { ctx.shadowColor = '#ffe7a6'; ctx.shadowBlur = 14 }
    ctx.beginPath()
    ctx.arc(cx, cy, r * (1 - 0.06 * press), 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    // The picture is what the next press does: the open umbrella while it is shut, the furled one while it is open.
    umbrellaIcon(ctx, cx, cy, r * 1.15, !open, L)
    finger(ctx, cx + r * (0.35 - 0.1 * press) + 5 * (1 - press), cy + r * (0.6 - 0.1 * press) + 7 * (1 - press), 0.7, L)
  } else {
    const w = Math.min(iw * 0.36, 120), h = Math.min(ih * 0.26, 42)
    keycap(ctx, cx - w / 2, cy - h / 2, w, h, keys.umbrella, press > 0.3, L)
  }
}

/** A lesson's window (night panel and animation) in the box `x, y, w, h`, clipped to its rounded corners. */
export const drawLessonWindow = (ctx: CanvasRenderingContext2D, kind: LessonDef['kind'], ix: number, iy: number, iw: number, ih: number, time: number): void => {
  const L = look(paintedGame)
  ctx.save()
  rr(ctx, ix, iy, iw, ih, 6)
  ctx.clip()
  panel(ctx, ix, iy, iw, ih, L)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (kind === 'move') drawMove(ctx, ix, iy, iw, ih, time, L)
  else if (kind === 'auto') drawAuto(ctx, ix, iy, iw, ih, time, L)
  else drawToggle(ctx, ix, iy, iw, ih, time, L)
  ctx.restore()
}

/** A paper card with a lesson in it, where it is (no ropes: the controls page lays three of them in a row). */
export const drawLessonCard = (ctx: CanvasRenderingContext2D, p: LessonDef, time: number): void => {
  drawPaper(ctx, p, paintedGame)
  const pad = Math.min(12, Math.min(p.w, p.h) * 0.08)
  drawLessonWindow(ctx, p.kind, p.x + pad, p.y + pad, p.w - pad * 2, p.h - pad * 2, time)
}

/** A controls board: the card, hung from two ropes that sway in the wind. */
export const drawLesson = (ctx: CanvasRenderingContext2D, p: LessonDef, time: number): void => {
  drawHung(ctx, p, time, () => drawLessonCard(ctx, p, time))
}
