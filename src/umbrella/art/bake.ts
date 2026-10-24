// ─── Kite art: the reference frames, drawn by the game's own painters ──────
//
// For every panel of every sheet, what the vector drawing looks like at that
// moment — the layout reference an image model paints over, and the left half
// of the playground's painted-vs-drawn A/B. Rule 1 of the pipeline: these call
// the game's OWN painters (characters.ts, renderer.ts), never lookalikes, so a
// reference cannot agree with itself and disagree with the game.
//
// `bakePanel` draws in WORLD units with the panel's anchor at the origin (the
// caller sets up the panel transform from the manifest box: the same one the
// kite renderer blits through). `bakeWhole` draws the sheets that are one
// shape across all their panels (nine-slice blocks, pillars) in SHEET pixels.
//
// The painted layer must be OFF while baking (the bench and playground turn
// it off): a reference is never the shipped painting of itself.
import { drawPrickbaitBody, drawPweeg, drawUmbrella, drawWalldorfBody, drawWalldorfFace, type PweegLook, type PweegPose } from '../characters'
import { drawButton, drawCheckpoint, drawSpikes, fanBlades, fanHousing, fanHub } from '../renderer'
import { FAN_SIZE, PANEL, PRICKBAIT_R, type SheetDef } from './manifest'
import { drawKiteCharacter, type KitePose } from './kiteBake'

const W = 24
const H = 36
const TAU = Math.PI * 2

const look = (pose: PweegPose, extra: Partial<PweegLook> = {}): PweegLook => ({ pose, facing: 1, w: W, h: H, time: 0, ...extra })

/** Draw `fn` scaled about the feet (the origin). */
const scaled = (ctx: CanvasRenderingContext2D, sx: number, sy: number, fn: () => void): void => {
  ctx.save()
  ctx.scale(sx, sy)
  fn()
  ctx.restore()
}
/** A breath: the body sinks a hair at mid-loop. */
const breath = (i: number, n: number): number => 1 - 0.03 * (1 - Math.cos((TAU * i) / n)) / 2

const figure = (ctx: CanvasRenderingContext2D, l: PweegLook, sx = 1, sy = 1): void => scaled(ctx, sx, sy, () => drawPweeg(ctx, 0, 0, l))

const pweegPanel = (ctx: CanvasRenderingContext2D, id: string, i: number, shades: boolean, puffOnly = false): boolean => {
  const sh = shades ? { shades: true } : {}
  switch (id.replace(/^(pweeg|chad)-/, '')) {
    case 'model': {
      const poses: (() => void)[] = shades
        ? [
            () => figure(ctx, look('stand', sh)),
            () => figure(ctx, look('stand', { ...sh, front: true })),
            ...[0, 1, 2, 3].map((k) => () => figure(ctx, look('walk', { ...sh, step: (k * Math.PI) / 2 + Math.PI / 4 }))),
            () => figure(ctx, look('hold', sh)),
            () => figure(ctx, look('hold', { ...sh, time: 0.5 })),
            () => figure(ctx, look('stand', sh), 1.12, 0.88)
          ]
        : [
            () => figure(ctx, look('stand')),
            () => figure(ctx, look('stand', { front: true })),
            () => figure(ctx, look('walk', { step: Math.PI / 2 })),
            () => figure(ctx, look('walk', { step: (3 * Math.PI) / 2 })),
            () => figure(ctx, look('hold')),
            () => figure(ctx, look('flail')),
            () => figure(ctx, look('terminal')),
            () => figure(ctx, look('cheer')),
            () => figure(ctx, look('stand'), 1.8, 0.55)
          ]
      poses[i]?.()
      return true
    }
    case 'idle': figure(ctx, look('stand', { ...sh, blink: !shades && (i === 12 || i === 13) }), 1, breath(i, 16)); return true
    case 'front': figure(ctx, look('stand', { front: true, blink: i === 12 || i === 13 }), 1, breath(i, 16)); return true
    case 'walk': figure(ctx, look('walk', { ...sh, step: (i / 16) * TAU })); return true
    case 'hover': figure(ctx, look('hold', { ...sh, time: (i / 16) * (TAU / 3) })); return true
    case 'fall': figure(ctx, look('flail', { time: (i / 16) * (TAU / 16) })); return true
    case 'terminal': figure(ctx, look('terminal', { time: (i / 16) * (TAU / 20) })); return true
    case 'cheer': {
      const s = -Math.cos((TAU * i) / 16)
      figure(ctx, look('cheer'), 1 - 0.05 * s, 1 + 0.07 * s)
      return true
    }
    case 'flattened': {
      if (i <= 5) {
        const k = i / 5
        figure(ctx, look('stand'), 1 + 1.6 * k, 1 - 0.8 * k)
      } else {
        figure(ctx, look('stand'), 2.6 * (1 + 0.05 * Math.sin((TAU * (i - 6)) / 10)), 0.2)
      }
      return true
    }
    case 'destroyed': {
      // Notation for a new look: a jolt, a growing puff of balls, stars, the
      // puff breaking into fewer, smaller balls.
      if (i <= 2) {
        figure(ctx, look('stand', { blink: true }), 1.05 + 0.05 * i, 0.95 - 0.05 * i)
        return true
      }
      if (i <= 5 && !puffOnly) figure(ctx, look('stand', { blink: true }), 0.9 - 0.25 * (i - 3), 0.9 - 0.25 * (i - 3))
      const grow = i <= 5 ? (i - 2) / 4 : i <= 10 ? 1 : Math.max(0.15, 1 - (i - 10) / 6)
      const count = i <= 10 ? 7 : Math.max(2, 7 - (i - 10))
      ctx.save()
      ctx.fillStyle = '#f4efe6'
      ctx.strokeStyle = '#2a1f2e'
      ctx.lineWidth = 2.5
      for (let k = 0; k < count; k++) {
        const a = (k / 7) * TAU + 0.4
        const d = 16 * grow + (i > 10 ? (i - 10) * 3 : 0)
        ctx.beginPath()
        ctx.arc(Math.cos(a) * d, -18 + Math.sin(a) * d * 0.8, (8 + (k % 3) * 2) * grow, 0, TAU)
        ctx.fill()
        ctx.stroke()
      }
      if (i >= 6 && i <= 11) {
        ctx.fillStyle = '#f2c14e'
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + i * 0.5
          const sx = Math.cos(a) * 34
          const sy = -18 + Math.sin(a) * 26
          ctx.beginPath()
          for (let p = 0; p < 10; p++) {
            const rr = p % 2 ? 2.2 : 5
            const pa = (p / 10) * TAU - Math.PI / 2
            if (p === 0) ctx.moveTo(sx + Math.cos(pa) * rr, sy + Math.sin(pa) * rr)
            else ctx.lineTo(sx + Math.cos(pa) * rr, sy + Math.sin(pa) * rr)
          }
          ctx.closePath()
          ctx.fill()
        }
      }
      ctx.restore()
      return true
    }
  }
  return false
}

/** The kite characters: placeholder notation, pose by pose (kiteBake.ts). */
const kitePanel = (ctx: CanvasRenderingContext2D, id: string, i: number, shades: boolean): boolean => {
  const k = (p: KitePose) => drawKiteCharacter(ctx, { shades, ...p })
  switch (id.replace(/^(pweeg|chad)-kite-/, '')) {
    case 'model': {
      const poses: KitePose[] = shades
        ? [
            { mode: 'closed' }, { mode: 'closed', front: true },
            ...[0, 1, 2, 3].map((n): KitePose => ({ mode: 'closed', step: (n * Math.PI) / 2 + Math.PI / 4 })),
            { mode: 'deployed' }, { mode: 'deployed', time: 0.5 }, { mode: 'closed', sx: 1.12, sy: 0.88 }
          ]
        : [
            { mode: 'closed' }, { mode: 'closed', front: true }, { mode: 'closed', step: Math.PI / 2 }, { mode: 'closed', step: (3 * Math.PI) / 2 },
            { mode: 'deployed' }, { mode: 'retract' }, { mode: 'terminal' }, { mode: 'broken' }, { mode: 'closed', arms: 'up' }
          ]
      const p = poses[i]
      if (p) k(p)
      return true
    }
    case 'idle': k({ mode: 'closed', blink: !shades && (i === 12 || i === 13), sy: breath(i, 16), time: i / 8 }); return true
    case 'front': k({ mode: 'closed', front: true, blink: i === 12 || i === 13, sy: breath(i, 16), time: i / 8 }); return true
    case 'walk': k({ mode: 'closed', step: (i / 16) * TAU, time: i / 16 }); return true
    case 'hover': k({ mode: 'deployed', time: (i / 16) * (TAU / 3) }); return true
    case 'fall': k({ mode: 'retract', time: (i / 16) * (TAU / 16) }); return true
    case 'terminal': k({ mode: 'terminal', time: (i / 16) * (TAU / 20) }); return true
    case 'broken': k({ mode: 'broken', time: (i / 16) * (TAU / 22) * 2 }); return true
    case 'cheer': {
      const sq = -Math.cos((TAU * i) / 16)
      k({ mode: 'closed', arms: 'up', sx: 1 - 0.05 * sq, sy: 1 + 0.07 * sq })
      return true
    }
    case 'flattened': {
      if (i <= 5) {
        const f = i / 5
        k({ mode: 'closed', sx: 1 + 1.6 * f, sy: 1 - 0.8 * f })
      } else k({ mode: 'closed', sx: 2.6 * (1 + 0.05 * Math.sin((TAU * (i - 6)) / 10)), sy: 0.2 })
      return true
    }
    case 'destroyed': {
      if (i <= 2) {
        k({ mode: 'closed', blink: true, sx: 1.05 + 0.05 * i, sy: 0.95 - 0.05 * i })
        return true
      }
      if (i <= 5) k({ mode: 'closed', blink: true, sx: 0.9 - 0.25 * (i - 3), sy: 0.9 - 0.25 * (i - 3) })
      // The puff: the same notation as Pweeg's, plus a few paper scraps.
      pweegPanel(ctx, 'pweeg-destroyed', Math.max(3, i), false, true)
      return true
    }
  }
  return false
}

/** One panel in world units, anchor at the origin. False: this sheet is drawn whole. */
export const bakePanel = (ctx: CanvasRenderingContext2D, s: SheetDef, i: number): boolean => {
  if (s.group === 'pweeg') return pweegPanel(ctx, s.id, i, false)
  if (s.group === 'chad') return pweegPanel(ctx, s.id, i, true)
  if (s.group === 'kite' || s.group === 'chad-kite') return kitePanel(ctx, s.id, i, s.group === 'chad-kite')
  switch (s.id) {
    case 'umbrella': {
      if (i <= 2) {
        // The canopy breathes a little flatter, about the grip.
        scaled(ctx, 1 + 0.02 * i, 1 - 0.035 * i, () => drawUmbrella(ctx, 0, 0, { state: 'open', tilt: 0, time: 0 }))
      } else if (i <= 5) {
        drawUmbrella(ctx, 0, 0, { state: 'furled', tilt: 0, time: 0 })
      } else {
        // sin(22 t) = -1, 0, +1: the torn panels flap down, level, up.
        const t = [(3 * Math.PI) / 2 / 22, 0, Math.PI / 2 / 22][i - 6]!
        drawUmbrella(ctx, 0, 0, { state: 'broken', tilt: 0, time: t })
      }
      return true
    }
    case 'walldorf-face': {
      // A 50-wide Walldorf facing right, placed so the middle of its eye pair
      // is the origin (er = 9).
      const b = { x: -34, y: -60, w: 50, h: 200 }
      const row = Math.floor(i / 4)
      const k = i % 4
      if (row === 0) drawWalldorfFace(ctx, b, { contact: 'solid', facing: 1, angry: false, lid: [0, 0, 0.5, 1][k], stretch: [1, 1.04, 1, 1][k] })
      else if (row === 1) drawWalldorfFace(ctx, b, { contact: 'solid', facing: 1, angry: true, stretch: [1, 1.03, 1, 0.97][k] })
      else if (row === 2) drawWalldorfFace(ctx, b, { contact: 'solid', facing: 1, angry: true, lid: [0.4, 0.45, 0.4, 0.35][k], stretch: [1, 1.02, 1, 1.02][k] })
      else drawWalldorfFace(ctx, b, { contact: 'solid', facing: 1, angry: false, stretch: [1.3, 1.2, 1.1, 1][k] })
      // The designer's Walldorf smiles when calm and frowns when angry: a
      // mouth beside the lower eye (notation; the vector Walldorf has none).
      ctx.save()
      ctx.strokeStyle = '#0d1018'
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      if (row === 3) ctx.arc(10, 17, 3.4, 0, Math.PI * 2)
      else if (row === 0) ctx.arc(9, 15, 5, Math.PI * 0.1, Math.PI * 0.75)
      else ctx.arc(9, 22, 5, Math.PI * 1.2, Math.PI * 1.75)
      ctx.stroke()
      ctx.restore()
      return true
    }
    case 'prickbait': {
      const r = PRICKBAIT_R
      if (i < 8) drawPrickbaitBody(ctx, 0, 0, r, 0, 1 + 0.07 * (1 - Math.cos((TAU * i) / 8)) / 2)
      else if (i < 12) {
        scaled(ctx, 1.05, 0.96, () => drawPrickbaitBody(ctx, 0, 0, r, Math.PI / 2 / 1.3 + (i - 9.5) * 0.12, 1.02))
      } else {
        drawPrickbaitBody(ctx, 0, 0, r, 0, [1.28, 1.22, 1.17, 1.12][i - 12])
        // Aggressive: a biting mouth under the eyes (notation for the designer's sheet).
        const open = [1, 0.8, 0.55, 0.8][i - 12]!
        ctx.save()
        ctx.fillStyle = '#3b1530'
        ctx.beginPath()
        ctx.ellipse(0, r * 0.38, r * 0.34, r * 0.22 * open, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        for (let t = -2; t <= 2; t++) {
          ctx.beginPath()
          ctx.moveTo(t * r * 0.12 - r * 0.05, r * 0.38 - r * 0.2 * open)
          ctx.lineTo(t * r * 0.12 + r * 0.05, r * 0.38 - r * 0.2 * open)
          ctx.lineTo(t * r * 0.12, r * 0.38 - r * 0.08 * open)
          ctx.closePath()
          ctx.fill()
        }
        ctx.restore()
      }
      return true
    }
    case 'fan': {
      const h = { x: -FAN_SIZE / 2, y: -FAN_SIZE / 2, w: FAN_SIZE, h: FAN_SIZE }
      if (i === 0) fanHousing(ctx, h)
      else if (i === 1) fanBlades(ctx, h, 0, false)
      else if (i === 3) fanBlades(ctx, h, Math.PI / 4, false)
      else {
        // The guard is a new part: notation — rings and spokes, the drawn hub.
        const r = FAN_SIZE / 2
        ctx.save()
        ctx.strokeStyle = '#efe6d2'
        ctx.lineWidth = 2
        for (const k of [0.35, 0.58, 0.8]) {
          ctx.beginPath()
          ctx.arc(0, 0, r * k, 0, TAU)
          ctx.stroke()
        }
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU
          ctx.beginPath()
          ctx.moveTo(Math.cos(a) * r * 0.14, Math.sin(a) * r * 0.14)
          ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8)
          ctx.stroke()
        }
        ctx.restore()
        fanHub(ctx, h)
      }
      return true
    }
    case 'checkpoint':
      // Opaque stand-ins for the drawing's see-through greys: a translucent
      // shape over magenta reads as pink to the painter.
      drawCheckpoint(ctx, { x: 0, y: 0 }, i >= 4, i >= 4 ? ((i - 4) / 12) * (TAU / 6) : 0, '#b9b3c9')
      return true
    case 'props': {
      if (i <= 1) drawButton(ctx, { x: -30, y: -14, w: 60, h: 14, channel: 0, duration: 5 }, i === 1, Infinity, '#f4efe6', '#3a4256')
      else if (i === 2) drawSpikes(ctx, { x: -13, y: -26, w: 26, h: 26, facing: 'up' })
      else drawSpikes(ctx, { x: -12, y: -28, w: 24, h: 28, facing: 'up' })
      return true
    }
    case 'wind-wisps': {
      // Notation: one flowing stroke per panel, ending in a curl.
      const sup = i >= 8
      const k = i % 8
      const len = 44 + (k % 4) * 6 + (sup ? 8 : 0)
      const amp = 3 + (k % 3) * 1.5
      ctx.save()
      ctx.strokeStyle = sup ? '#5aa9d6' : '#bfe0f7'
      ctx.lineWidth = sup ? 4.5 : 3.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      for (let u = 0; u <= len; u += 2) {
        const x = -len / 2 + u
        const y = Math.sin(u * 0.12 + k) * amp
        if (u === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      const ex = len / 2
      const ey = Math.sin(len * 0.12 + k) * amp
      ctx.arc(ex - 5, ey - 5, 5, Math.PI / 2, Math.PI * 1.9, true)
      ctx.stroke()
      if (k % 2 || sup) {
        ctx.beginPath()
        ctx.moveTo(-len / 2 + 8, 9)
        ctx.quadraticCurveTo(0, 12 + amp, len / 2 - 14, 8)
        ctx.stroke()
      }
      ctx.restore()
      return true
    }
  }
  return false
}

/** The sheets drawn as ONE shape across all their panels, in sheet pixels. */
export const bakeWhole = (ctx: CanvasRenderingContext2D, s: SheetDef): void => {
  const N = s.cols * PANEL
  if (s.id === 'walldorf-body') {
    // Three 64-wide, 192-tall pillars, one per touch kind, at 4 px per unit.
    ctx.save()
    ctx.scale(PANEL / 64, PANEL / 64)
    ;(['deadly', 'solid', 'bounce'] as const).forEach((contact, c) => drawWalldorfBody(ctx, { x: c * 64, y: 0, w: 64, h: 192 }, contact))
    ctx.restore()
    return
  }
  // Nine-slice blocks: notation for a new look — the rounding inside the
  // corner ninths, a top band, plain middles.
  const fill = s.id === 'platform-finish' ? '#e2b25a' : s.id === 'platform-switch' ? '#e8ecf2' : '#a87a52'
  const band = s.id === 'platform-finish' ? '#7fbf5a' : s.id === 'platform-switch' ? '#ffffff' : '#7fbf5a'
  const m = 10
  const rad = PANEL * 0.55
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(m, m, N - 2 * m, N - 2 * m, rad)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = band
  ctx.fillRect(0, 0, N, PANEL * 0.42)
  ctx.fillStyle = 'rgba(42, 31, 46, 0.18)'
  ctx.fillRect(0, N - PANEL * 0.4, N, PANEL * 0.4)
  ctx.restore()
  ctx.lineWidth = 14
  ctx.strokeStyle = '#2a1f2e'
  ctx.stroke()
  ctx.fillStyle = '#2a1f2e'
  if (s.id === 'platform-switch') {
    for (const [x, y] of [[0.45, 0.45], [2.55, 0.45], [0.45, 2.55], [2.55, 2.55]] as const) {
      ctx.beginPath()
      ctx.arc(x * PANEL, y * PANEL, 18, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  if (s.id === 'platform-finish') {
    // Bunting under the grass lip.
    const colours = ['#c4553f', '#e8b04a', '#5d86b8', '#6aa84f']
    for (let k = 0; k < 12; k++) {
      const x = 40 + k * ((N - 80) / 12)
      ctx.fillStyle = colours[k % 4]!
      ctx.beginPath()
      ctx.moveTo(x, PANEL * 0.46)
      ctx.lineTo(x + (N - 80) / 12, PANEL * 0.46)
      ctx.lineTo(x + (N - 80) / 24, PANEL * 0.66)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()
}

/** Set up the panel transform for `bakePanel`: panel (col, row) of the sheet,
 *  anchor at the manifest box's (ax, ay), `box.size` world units across. */
export const panelTransform = (ctx: CanvasRenderingContext2D, s: SheetDef, i: number, box: { size: number; ax: number; ay: number }, scale = 1): void => {
  const c = i % s.cols
  const r = Math.floor(i / s.cols)
  const k = (PANEL / box.size) * scale
  ctx.setTransform(k, 0, 0, k, (c * PANEL + box.ax * PANEL) * scale, (r * PANEL + box.ay * PANEL) * scale)
}
