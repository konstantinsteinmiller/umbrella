// ─── The hyper current: the cutscene that carries Pweeg through a gate ─────────
//
// Opening the umbrella at a gate (a green warp pipe) lets a hyper current catch it:
// streaks rise out of the pipe's mouth, rings spiral up the column, Pweeg is lifted
// up it faster and faster, and the screen whites out. The scene then swaps the level
// and the white fades away. `Warp` is pure state; `drawWarp` paints it over the world.

import type { GateDef } from './levels'
import type { Camera } from './renderer'

export type WarpKind = 'in' | 'out'

export interface Warp {
  kind: WarpKind
  gate: GateDef
  /** Seconds since it began. */
  t: number
  /** Where Pweeg's feet were when it began (he is lifted from here). */
  from: { x: number; y: number }
}

/** Going in is the full show; coming back out is the same current, shorter. */
export const WARP_IN_TIME = 1.8
export const WARP_OUT_TIME = 1.1
/** How long the white takes to fade once the new level is up (s). */
export const ARRIVE_TIME = 0.7

export const warpTime = (kind: WarpKind) => (kind === 'in' ? WARP_IN_TIME : WARP_OUT_TIME)
const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

export const startWarp = (kind: WarpKind, gate: GateDef, from: { x: number; y: number }): Warp => ({ kind, gate, t: 0, from })

/** 0..1 through the cutscene. */
export const warpProgress = (w: Warp) => Math.min(1, w.t / warpTime(w.kind))

/** The lift: a slow catch, then faster and faster up the column (px above where he stood). */
export const warpLift = (w: Warp): number => {
  const p = warpProgress(w)
  return 900 * Math.pow(smooth(0.18, 0.88, p), 2)
}

/** Pweeg's feet while the current carries him: up the column with a spiral sway. */
export const warpPosition = (w: Warp): { x: number; y: number } => {
  const p = warpProgress(w)
  const lift = warpLift(w)
  const sway = Math.sin(w.t * 9) * 14 * smooth(0.15, 0.45, p) * (1 - smooth(0.7, 1, p))
  return { x: w.gate.x + w.gate.w / 2 + sway, y: w.from.y - lift }
}

/** White over the whole screen: building to a whiteout at the end of the ride. */
export const warpFlash = (w: Warp): number => smooth(0.78, 1, warpProgress(w))

// A fixed bunch of streaks so the column looks the same every frame.
const STREAKS = Array.from({ length: 34 }, (_, i) => {
  const r = (n: number) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x) }
  return { off: r(1) * 2 - 1, speed: 500 + r(2) * 900, len: 50 + r(3) * 110, phase: r(4) * 1000, width: 1.5 + r(5) * 2.5 }
})

/** Paints the hyper current over the world (call after the frame, with the camera it used). */
export const drawWarp = (ctx: CanvasRenderingContext2D, cam: Camera, w: Warp): void => {
  const p = warpProgress(w)
  const g = w.gate
  const mouthX = g.x + g.w / 2
  const mouthY = g.y + 8
  const colW = g.w * 1.5
  const grow = smooth(0, 0.3, p)
  const top = w.from.y - 1400
  ctx.save()
  ctx.setTransform(cam.s, 0, 0, cam.s, cam.ox, cam.oy)
  ctx.globalCompositeOperation = 'lighter'

  // The glow at the mouth and the column of light above it.
  const glow = ctx.createRadialGradient(mouthX, mouthY, 4, mouthX, mouthY, g.w * (1.2 + 1.6 * grow))
  glow.addColorStop(0, `rgba(190, 255, 245, ${0.85 * grow})`)
  glow.addColorStop(1, 'rgba(60, 200, 255, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(mouthX - g.w * 3, mouthY - g.w * 3, g.w * 6, g.w * 6)
  const col = ctx.createLinearGradient(0, mouthY, 0, top)
  col.addColorStop(0, `rgba(120, 230, 255, ${0.34 * grow})`)
  col.addColorStop(1, 'rgba(120, 230, 255, 0)')
  ctx.fillStyle = col
  ctx.fillRect(mouthX - colW / 2 * grow, top, colW * grow, mouthY - top)

  // Streaks racing up the column, faster as the ride goes on.
  ctx.lineCap = 'round'
  const rush = 0.35 + 1.4 * smooth(0.1, 0.9, p)
  for (const s of STREAKS) {
    const travel = ((w.t * s.speed * rush + s.phase) % 1400)
    const y = mouthY - travel
    const x = mouthX + s.off * colW * 0.5 * grow
    const fade = Math.max(0, 1 - travel / 1400)
    ctx.strokeStyle = `rgba(210, 250, 255, ${0.8 * fade * grow})`
    ctx.lineWidth = s.width
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, y + s.len * (0.6 + rush * 0.6))
    ctx.stroke()
  }

  // Rings spiralling up the column.
  for (let k = 0; k < 7; k++) {
    const u = (w.t * 0.9 + k / 7) % 1
    const y = mouthY - u * 900
    const rx = colW * 0.5 * (0.7 + 0.3 * Math.sin(u * 6 + w.t * 5))
    ctx.strokeStyle = `rgba(150, 240, 255, ${0.55 * (1 - u) * grow})`
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.ellipse(mouthX, y, rx, rx * 0.22, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()

  // The whiteout.
  const flash = warpFlash(w)
  if (flash > 0) {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = `rgba(255, 255, 255, ${flash})`
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.restore()
  }
}
