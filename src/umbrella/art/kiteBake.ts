// ─── Kite art: the KITE characters' layout references (bench only) ──────────
//
// Pweeg-Kite and Chad-Kite have no vector drawing in the game (the vector
// fallback is Pweeg himself), so the bench draws a flat PLACEHOLDER for each
// pose — notation for where the diamond body, the face, the stubby limbs, the
// wings and the bow-tail go and how big they are. The designer's model sheet
// (docs/design/reference/kite-character-model-sheet.png, attached first to
// every kite prompt) carries the actual design and finish.
//
// World units, feet at the origin, facing RIGHT (the caller mirrors).

export type KiteMode = 'closed' | 'deployed' | 'retract' | 'terminal' | 'broken'

export interface KitePose {
  mode: KiteMode
  /** Walk phase (radians), 0 = standing. */
  step?: number
  /** Seconds, for the tail's wave and small wiggles. */
  time?: number
  arms?: 'down' | 'up' | 'flail'
  shades?: boolean
  front?: boolean
  blink?: boolean
  /** Body squash about the feet (breathing, the dance, the splat). */
  sx?: number
  sy?: number
}

const INK = '#3b2a20'
const MUSTARD = '#e8b04a'
const GOLD = '#f4cd6e'
const BRICK = '#c4553f'
const BLUE = '#5d86b8'
const LEG = '#d89a3c'
const TAU = Math.PI * 2

/** The diamond: top, right, bottom, left (body centre y = -26). */
const TOP = -44
const MID = -29
const BOT = -10
const HALF = 13

const bow = (ctx: CanvasRenderingContext2D, x: number, y: number, c: string, s = 1) => {
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - 4 * s, y - 2.6 * s)
  ctx.lineTo(x - 4 * s, y + 2.6 * s)
  ctx.closePath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + 4 * s, y - 2.6 * s)
  ctx.lineTo(x + 4 * s, y + 2.6 * s)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

/** The bow-tail from the bottom point, trailing back (−x) and down. */
const tail = (ctx: CanvasRenderingContext2D, t: number, length: number, up = false) => {
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.4
  ctx.beginPath()
  const pts: [number, number][] = []
  for (let u = 0; u <= 1.0001; u += 0.1) {
    const x = -u * length * 0.55 + Math.sin(u * 7 + t * 5) * 3
    const y = BOT + (up ? -1 : 1) * u * length * 0.8
    pts.push([x, y])
    if (u === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.lineWidth = 1
  const colours = [BRICK, MUSTARD, BLUE]
  for (let k = 0; k < 3; k++) {
    const [x, y] = pts[3 + k * 3] ?? pts[pts.length - 1]!
    bow(ctx, x, y, colours[k]!)
  }
}

const diamond = (ctx: CanvasRenderingContext2D, half: number, torn: boolean) => {
  // Four paper panels, the crossed spars, the outline.
  const panels: [number, number, number, number, string][] = [
    [0, TOP, -half, MID, MUSTARD], [0, TOP, half, MID, GOLD], [0, BOT, -half, MID, BRICK], [0, BOT, half, MID, BLUE]
  ]
  for (const [x1, y1, x2, y2, c] of panels) {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.moveTo(0, MID)
    ctx.lineTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.beginPath()
  if (torn) {
    // Two ragged corners.
    ctx.moveTo(0, TOP)
    ctx.lineTo(half * 0.7, MID - 5)
    ctx.lineTo(half * 0.55, MID - 1)
    ctx.lineTo(half, MID + 1)
    ctx.lineTo(0, BOT)
    ctx.lineTo(-half * 0.8, MID + 6)
    ctx.lineTo(-half * 0.55, MID + 2)
    ctx.lineTo(-half, MID)
    ctx.closePath()
  } else {
    ctx.moveTo(0, TOP)
    ctx.lineTo(half, MID)
    ctx.lineTo(0, BOT)
    ctx.lineTo(-half, MID)
    ctx.closePath()
  }
  ctx.stroke()
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(0, TOP)
  ctx.lineTo(0, BOT)
  ctx.moveTo(-half, MID)
  ctx.lineTo(half, MID)
  ctx.stroke()
}

const face = (ctx: CanvasRenderingContext2D, p: KitePose) => {
  const look = p.front ? 0 : 2.2
  const ey = MID - 4
  if (p.shades) {
    ctx.fillStyle = '#1a1414'
    ctx.beginPath()
    ctx.roundRect(-7 + look, ey - 2.6, 14, 5, 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(-4 + look, ey - 1.6, 2.2, 1)
  } else if (p.mode === 'terminal') {
    for (const dx of [-3.6, 3.6]) {
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(dx + look * 0.5, ey, 3.2, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = INK
      ctx.beginPath()
      ctx.arc(dx + look * 0.7, ey + 0.6, 1.2, 0, TAU)
      ctx.fill()
    }
  } else {
    ctx.fillStyle = INK
    ctx.strokeStyle = INK
    for (const dx of [-3.2, 3.2]) {
      if (p.blink || p.mode === 'retract') {
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(dx + look - 1.6, ey + (p.mode === 'retract' ? (dx < 0 ? -1 : 1) * 0.8 : 0))
        ctx.lineTo(dx + look + 1.6, ey - (p.mode === 'retract' ? (dx < 0 ? -1 : 1) * 0.8 : 0))
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.arc(dx + look, ey, 1.3, 0, TAU)
        ctx.fill()
      }
    }
  }
  // Mouth: a smile, a frown when retracted or broken, an "o" at terminal speed.
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.2
  ctx.beginPath()
  if (p.mode === 'terminal') ctx.arc(look, MID + 4, 1.6, 0, TAU)
  else if (p.mode === 'retract' || p.mode === 'broken') ctx.arc(look, MID + 6, 2.6, Math.PI * 1.15, Math.PI * 1.85)
  else ctx.arc(look, MID + 1.5, 2.8, Math.PI * 0.15, Math.PI * 0.85)
  ctx.stroke()
}

const limbs = (ctx: CanvasRenderingContext2D, p: KitePose) => {
  ctx.strokeStyle = LEG
  ctx.lineCap = 'round'
  // Legs from the bottom point to the feet.
  const sw = p.step ? Math.sin(p.step) : 0
  ctx.lineWidth = 3.2
  for (const s of [-1, 1]) {
    const phase = sw * s
    const lift = Math.max(0, phase) * 4
    ctx.beginPath()
    ctx.moveTo(s * 2.5, BOT - 1)
    if (p.mode === 'deployed') ctx.lineTo(s * 4 + Math.sin((p.time ?? 0) * 3) * 2 * s, 4)
    else if (p.mode === 'terminal') ctx.lineTo(s * 4, 10)
    else if (p.mode === 'retract' || p.mode === 'broken') ctx.lineTo(s * 9, -4 + Math.sin((p.time ?? 0) * 16) * 1.5)
    else ctx.lineTo(s * 4 + phase * 5, -lift)
    ctx.stroke()
  }
  if (p.mode === 'deployed' || p.mode === 'terminal') return
  // Stubby arms from the side points.
  ctx.lineWidth = 2.6
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * HALF * 0.8, MID + 1)
    if (p.arms === 'up') ctx.lineTo(s * 19, MID - 13)
    else if (p.arms === 'flail' || p.mode === 'retract' || p.mode === 'broken') ctx.lineTo(s * 19, MID - 8 + Math.sin((p.time ?? 0) * 16 + s) * 2)
    else ctx.lineTo(s * 18 - sw * s * 2, MID + 9)
    ctx.stroke()
  }
}

/** The deployed wings and sail: spread over the canopy's wind box. */
const wings = (ctx: CanvasRenderingContext2D, t: number) => {
  const ripple = Math.sin(t * 3) * 2
  const stripes = [BRICK, MUSTARD, BLUE, BRICK, MUSTARD, BLUE]
  for (const s of [-1, 1]) {
    const tip: [number, number] = [s * 62, -78 + ripple * s]
    for (let k = 0; k < 6; k++) {
      const a = k / 6
      const b = (k + 1) / 6
      const top = (u: number): [number, number] => [s * 6 + (tip[0] - s * 6) * u, TOP - 50 + (tip[1] - (TOP - 50)) * u]
      const bot = (u: number): [number, number] => [s * HALF + (tip[0] - s * HALF) * u, MID + (tip[1] - MID) * u]
      ctx.fillStyle = stripes[k]!
      ctx.beginPath()
      ctx.moveTo(...top(a))
      ctx.lineTo(...top(b))
      ctx.lineTo(...bot(b))
      ctx.lineTo(...bot(a))
      ctx.closePath()
      ctx.fill()
    }
    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(s * 6, TOP - 50)
    ctx.lineTo(...tip)
    ctx.lineTo(s * HALF, MID)
    ctx.stroke()
  }
  // The sail between the wing roots, over the head.
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.moveTo(-6, TOP - 50)
  ctx.quadraticCurveTo(0, TOP - 66, 6, TOP - 50)
  ctx.lineTo(0, TOP)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

/** One Pweeg-Kite / Chad-Kite pose. */
export const drawKiteCharacter = (ctx: CanvasRenderingContext2D, p: KitePose): void => {
  const t = p.time ?? 0
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.scale(p.sx ?? 1, p.sy ?? 1)
  if (p.mode === 'deployed') {
    tail(ctx, t, 30)
    wings(ctx, t)
  } else {
    tail(ctx, t, p.mode === 'retract' || p.mode === 'terminal' || p.mode === 'broken' ? 20 : 22, p.mode === 'retract' || p.mode === 'terminal')
  }
  limbs(ctx, p)
  diamond(ctx, p.mode === 'retract' ? HALF * 0.75 : HALF, p.mode === 'terminal' || p.mode === 'broken')
  if (p.mode === 'broken') {
    // A cracked spar poking out, a scrap flapping.
    ctx.strokeStyle = '#7a5130'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(2, MID - 2)
    ctx.lineTo(16, MID - 14 + Math.sin(t * 20) * 2)
    ctx.stroke()
    ctx.fillStyle = BLUE
    ctx.beginPath()
    ctx.moveTo(-HALF, MID)
    ctx.lineTo(-HALF - 7, MID + 4 + Math.sin(t * 20) * 3)
    ctx.lineTo(-HALF + 2, MID + 6)
    ctx.closePath()
    ctx.fill()
  }
  face(ctx, p)
  ctx.restore()
}
