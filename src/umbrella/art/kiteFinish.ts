// ─── The goal platform's dressing (kite build only) ─────────────────────────
//
// The painted finish block is drawn first; this adds what makes it read as THE
// place to land without a word on it: a pulsing gold landing ring on the top
// face, a bobbing pair of chevrons pointing down at it, a flag kite on a pole
// at each end and a string of bunting between them (kite colours, paper-crayon
// outlines). Pure shapes — nothing to load, nothing to paint — and no label.

const INK = '#5a2e22'
const GOLD = '#ffc83a'
const RED = '#c8472e'
const BLUE = '#5f87b0'
const MUSTARD = '#e8aa3a'

interface Box { x: number; y: number; w: number; h: number }

const outline = (ctx: CanvasRenderingContext2D, fill: string, w = 2): void => {
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = w
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.stroke()
}

/** A little diamond kite (the flag and the bunting): four paper panels. */
const diamond = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void => {
  const pts: [number, number][] = [[cx, cy - r * 1.25], [cx + r * 0.85, cy], [cx, cy + r * 1.25], [cx - r * 0.85, cy]]
  const panels: [number, string][] = [[0, MUSTARD], [1, RED], [2, MUSTARD], [3, BLUE]]
  for (const [i, c] of panels) {
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(pts[i]![0], pts[i]![1])
    ctx.lineTo(pts[(i + 1) % 4]![0], pts[(i + 1) % 4]![1])
    ctx.closePath()
    ctx.fillStyle = c
    ctx.fill()
  }
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.lineWidth = 1.6
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.stroke()
}

const flag = (ctx: CanvasRenderingContext2D, x: number, top: number, bottom: number, t: number, side: number): void => {
  // The pole.
  ctx.lineCap = 'round'
  ctx.lineWidth = 5
  ctx.strokeStyle = INK
  ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, top); ctx.stroke()
  ctx.lineWidth = 2.6
  ctx.strokeStyle = '#b57b4a'
  ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, top); ctx.stroke()
  // Ball on top.
  ctx.beginPath(); ctx.arc(x, top - 2, 4, 0, Math.PI * 2); outline(ctx, GOLD, 1.6)
  // The flag kite flutters to the side, its tail waving.
  const sway = Math.sin(t * 3 + x * 0.05) * 0.18
  ctx.save()
  ctx.translate(x + side * 15, top + 17)
  ctx.rotate(sway * side)
  diamond(ctx, 0, 0, 11)
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(0, 14)
  for (let i = 1; i <= 4; i++) ctx.lineTo(Math.sin(t * 4 + i) * 4, 14 + i * 5)
  ctx.stroke()
  ctx.restore()
  ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.moveTo(x, top + 12); ctx.lineTo(x + side * 6, top + 17); ctx.stroke()
}

/** The dressing for a finish platform, with `t` in seconds (visual only). */
export const drawFinishDressing = (ctx: CanvasRenderingContext2D, p: Box, t: number): void => {
  const top = p.y
  const cx = p.x + p.w / 2
  ctx.save()
  // Landing ring on the top face: a glow, a gold ring, a white heart.
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.2)
  const rw = Math.max(40, Math.min(p.w * 0.46, 200))
  const glow = ctx.createRadialGradient(cx, top, 2, cx, top, rw * 1.1)
  glow.addColorStop(0, `rgba(255, 224, 120, ${0.5 + 0.25 * pulse})`)
  glow.addColorStop(1, 'rgba(255, 224, 120, 0)')
  ctx.fillStyle = glow
  ctx.beginPath(); ctx.ellipse(cx, top, rw * 1.1, 22, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(cx, top - 1, rw, 8 + pulse * 1.5, 0, 0, Math.PI * 2)
  outline(ctx, `rgba(255, 200, 58, ${0.55 + 0.3 * pulse})`, 2.2)
  ctx.beginPath(); ctx.ellipse(cx, top - 1, rw * 0.5, 4.5, 0, 0, Math.PI * 2)
  outline(ctx, 'rgba(255, 252, 235, 0.9)', 1.6)

  // Two chevrons bobbing over the ring: "down here".
  const bob = Math.sin(t * 3.2) * 5
  for (const k of [0, 1]) {
    const y = top - 58 - k * 15 + bob
    ctx.beginPath()
    ctx.moveTo(cx - 17, y); ctx.lineTo(cx, y + 15); ctx.lineTo(cx + 17, y); ctx.lineTo(cx + 17, y + 7); ctx.lineTo(cx, y + 22); ctx.lineTo(cx - 17, y + 7)
    ctx.closePath()
    outline(ctx, k ? '#ffe08a' : GOLD, 2)
  }

  // A flag kite at each end, bunting between them when there is room.
  const inset = Math.min(16, p.w / 4)
  const lx = p.x + inset
  const rx = p.x + p.w - inset
  flag(ctx, lx, top - 66, top + 2, t, 1)
  flag(ctx, rx, top - 66, top + 2, t, -1)
  const span = rx - lx
  if (span > 170) {
    const n = Math.max(4, Math.floor(span / 34))
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i <= 24; i++) {
      const u = i / 24
      const y = top - 56 + Math.sin(u * Math.PI) * 14
      i ? ctx.lineTo(lx + span * u, y) : ctx.moveTo(lx, y)
    }
    ctx.stroke()
    for (let i = 1; i < n; i++) {
      const u = i / n
      const y = top - 56 + Math.sin(u * Math.PI) * 14
      ctx.beginPath()
      ctx.moveTo(lx + span * u - 6, y); ctx.lineTo(lx + span * u + 6, y); ctx.lineTo(lx + span * u, y + 12 + Math.sin(t * 5 + i) * 1.5)
      ctx.closePath()
      outline(ctx, [RED, MUSTARD, BLUE][i % 3]!, 1.4)
    }
  }
  ctx.restore()
}
