// ─── Canvas renderer (prototype look: white blocks on a dark field) ─────────

import { channelOn, checkpointBox, liveWind, platformActive, type Hazard, type World } from './engine'
import type { Tuning } from './tuning'
import type { ButtonDef, CheckpointDef, WindDef } from './levels'

/** One colour per button channel: a button and everything it switches share it. */
export const CHANNEL_COLORS = ['#f59e0b', '#22d3ee', '#a78bfa', '#4ade80', '#f472b6', '#f87171']
export const channelColor = (c: number) => CHANNEL_COLORS[((c % CHANNEL_COLORS.length) + CHANNEL_COLORS.length) % CHANNEL_COLORS.length]!

const BG = '#1b2130'
const FG = '#ffffff'
const WIND = 'rgba(140, 200, 255, 0.10)'
const WIND_ARROW = 'rgba(170, 215, 255, 0.55)'
const SUPER_WIND = 'rgba(255, 170, 90, 0.13)'
const SUPER_ARROW = 'rgba(255, 190, 120, 0.75)'
const HAZARD = '#ff5a5f'

export interface Labels {
  finish: string
}

export interface Camera {
  /** Device px per world unit. */
  s: number
  ox: number
  oy: number
}

/** Where each world's camera looks (smoothed); a new world (restart) snaps. */
const followed = new WeakMap<World, { x: number; y: number }>()

/**
 * The camera. A level without `view` shows its whole world, letterboxed.
 * With `view` (one screen, in world units) it fits that screen into the
 * canvas — a portrait phone sees the full screen width and more height —
 * and scrolls with the player, clamped to the world's edges; an axis where
 * the world is smaller than what the canvas shows stays centred.
 */
export const cameraFor = (w: World, cw: number, ch: number, dt = 0): Camera => {
  const { w: ww, h: wh } = w.level.world
  const view = w.level.view
  if (!view || (view.w >= ww && view.h >= wh)) {
    const s = Math.min(cw / ww, ch / wh)
    return { s, ox: (cw - ww * s) / 2, oy: (ch - wh * s) / 2 }
  }
  const s = Math.min(cw / view.w, ch / view.h)
  const vw = cw / s
  const vh = ch / s
  const pl = w.player
  const target = { x: pl.x + pl.w / 2, y: pl.y + pl.h / 2 }
  let c = followed.get(w)
  if (!c) followed.set(w, (c = { ...target }))
  else if (dt > 0) {
    const k = 1 - Math.exp(-dt * 7)
    c.x += (target.x - c.x) * k
    c.y += (target.y - c.y) * k
  }
  const axis = (centre: number, seen: number, size: number) =>
    seen >= size ? (seen - size) / 2 : -Math.min(size - seen, Math.max(0, centre - seen / 2))
  return { s, ox: axis(c.x, vw, ww) * s, oy: axis(c.y, vh, wh) * s }
}

const drawWind = (ctx: CanvasRenderingContext2D, wind: WindDef, time: number) => {
  ctx.fillStyle = wind.super ? SUPER_WIND : WIND
  ctx.fillRect(wind.x, wind.y, wind.w, wind.h)
  const vertical = wind.dir === 'up' || wind.dir === 'down'
  const sign = wind.dir === 'up' || wind.dir === 'left' ? -1 : 1
  const gap = 60
  const along = vertical ? wind.h : wind.w
  const across = vertical ? wind.w : wind.h
  const flow = ((time * wind.speed * 0.5) % gap + gap) % gap
  ctx.save()
  ctx.beginPath()
  ctx.rect(wind.x, wind.y, wind.w, wind.h)
  ctx.clip()
  ctx.strokeStyle = wind.super ? SUPER_ARROW : WIND_ARROW
  ctx.lineWidth = wind.super ? 4 : 3
  ctx.lineCap = 'round'
  for (let c = gap / 2, col = 0; c < across; c += gap, col++) {
    const stagger = col % 2 ? gap / 2 : 0
    for (let a = -gap; a < along + gap; a += gap) {
      // Position along the flow, moving in the wind's direction.
      const p = sign < 0 ? along - (a + flow + stagger) : a + flow + stagger
      const x = vertical ? wind.x + c : wind.x + p
      const y = vertical ? wind.y + p : wind.y + c
      const dx = vertical ? 0 : sign * 9
      const dy = vertical ? sign * 9 : 0
      ctx.beginPath()
      ctx.moveTo(x - dx, y - dy)
      ctx.lineTo(x + dx, y + dy)
      ctx.moveTo(x + dx, y + dy)
      ctx.lineTo(x + dx * 0.2 - dy * 0.6, y + dy * 0.2 - dx * 0.6)
      ctx.moveTo(x + dx, y + dy)
      ctx.lineTo(x + dx * 0.2 + dy * 0.6, y + dy * 0.2 + dx * 0.6)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** A floor button in its channel's colour: raised when off, pressed flat when on.
 *  A timed one shows the seconds left above it. */
const drawButton = (ctx: CanvasRenderingContext2D, b: ButtonDef, on: boolean, left: number) => {
  const col = channelColor(b.channel)
  const capH = on ? b.h * 0.35 : b.h
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
  ctx.fillRect(b.x - 4, b.y + b.h - 4, b.w + 8, 4)
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.roundRect(b.x, b.y + b.h - capH - 2, b.w, capH, 4)
  ctx.fill()
  if (on && b.duration && Number.isFinite(left)) {
    ctx.fillStyle = col
    ctx.font = '700 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(Math.ceil(left).toString(), b.x + b.w / 2, b.y - 4)
  } else if (!b.duration) {
    // A toggle shows its state as a small dot.
    ctx.fillStyle = on ? FG : BG
    ctx.beginPath()
    ctx.arc(b.x + b.w / 2, b.y + b.h - capH / 2 - 2, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** A checkpoint flag: grey until touched, green and waving once it is yours. */
const drawCheckpoint = (ctx: CanvasRenderingContext2D, c: CheckpointDef, reached: boolean, time: number) => {
  const box = checkpointBox(c)
  const poleX = box.x + 6
  ctx.fillStyle = FG
  ctx.fillRect(poleX - 2, box.y, 4, box.h)
  const wave = reached ? Math.sin(time * 6) * 3 : 0
  ctx.fillStyle = reached ? '#4ade80' : 'rgba(255, 255, 255, 0.45)'
  ctx.beginPath()
  ctx.moveTo(poleX + 2, box.y + 2)
  ctx.lineTo(poleX + 30, box.y + 12 + wave)
  ctx.lineTo(poleX + 2, box.y + 24)
  ctx.closePath()
  ctx.fill()
}

const drawEyes =(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  for (const dy of [-r * 1.1, r * 1.1]) {
    ctx.fillStyle = FG
    ctx.beginPath()
    ctx.arc(x, y + dy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = BG
    ctx.beginPath()
    ctx.arc(x - r * 0.3, y + dy, r * 0.45, 0, Math.PI * 2)
    ctx.fill()
  }
}

const drawHazard = (ctx: CanvasRenderingContext2D, h: Hazard, time: number) => {
  ctx.fillStyle = HAZARD
  if (h.kind === 'spikes') {
    const n = Math.max(1, Math.round(h.w / 26))
    const sw = h.w / n
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const x = h.x + i * sw
      if (h.facing === 'down') {
        ctx.moveTo(x, h.y)
        ctx.lineTo(x + sw / 2, h.y + h.h)
        ctx.lineTo(x + sw, h.y)
      } else {
        ctx.moveTo(x, h.y + h.h)
        ctx.lineTo(x + sw / 2, h.y)
        ctx.lineTo(x + sw, h.y + h.h)
      }
    }
    ctx.fill()
  } else if (h.kind === 'mine') {
    const r = h.w / 2
    const cx = h.x + r
    const cy = h.y + r
    const spin = time * 1.5
    ctx.beginPath()
    for (let i = 0; i < 16; i++) {
      const a = spin + (i / 16) * Math.PI * 2
      const rr = i % 2 ? r * 0.72 : r * 1.12
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
    }
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = FG
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = BG
    ctx.beginPath()
    ctx.arc(cx - r * 0.1, cy, r * 0.18, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.roundRect(h.x, h.y, h.w, h.h, 8)
    ctx.fill()
    drawEyes(ctx, h.x + h.w / 2, h.y + h.h * 0.32, h.w * 0.2)
  }
}

const drawUmbrella = (ctx: CanvasRenderingContext2D, w: World) => {
  const pl = w.player
  const pw = pl.w
  const ph = pl.h
  const cx = pl.x + pw / 2
  const top = pl.y
  ctx.strokeStyle = FG
  ctx.fillStyle = FG
  ctx.lineWidth = 3
  // Handle
  ctx.beginPath()
  ctx.moveTo(cx, top + 6)
  ctx.lineTo(cx, top - 26)
  ctx.stroke()
  if (pl.broken) {
    // Turned inside-out, ribs splayed upward.
    ctx.beginPath()
    for (const dx of [-22, -10, 10, 22]) {
      ctx.moveTo(cx, top - 26)
      ctx.lineTo(cx + dx, top - 44 + Math.abs(dx) * 0.2)
    }
    ctx.stroke()
  } else if (pl.open) {
    ctx.beginPath()
    ctx.moveTo(cx - 30, top - 26)
    ctx.quadraticCurveTo(cx, top - 66, cx + 30, top - 26)
    ctx.closePath()
    ctx.fill()
  } else {
    // Furled: a slim spike.
    ctx.beginPath()
    ctx.moveTo(cx - 4, top - 26)
    ctx.lineTo(cx, top - 44)
    ctx.lineTo(cx + 4, top - 26)
    ctx.closePath()
    ctx.fill()
  }
}

/** Free-fall pose (GDD "Fall States"): upright when safe, sideways when the
 *  umbrella can still save you, upside-down at break speed. Eased, not snapped. */
let poseAngle = 0
const fallPoseTarget = (w: World, t: Tuning): number => {
  const pl = w.player
  if (pl.open || pl.grounded || w.phase !== 'play') return 0
  const f = pl.vy / t.terminalVelocity
  if (f >= t.breakFraction) return Math.PI
  if (f >= t.fallPoseSideways) return Math.PI / 2
  return 0
}

const drawPlayer = (ctx: CanvasRenderingContext2D, w: World, t: Tuning, dt: number) => {
  const pl = w.player
  const pw = pl.w
  const ph = pl.h
  ctx.save()
  if (w.phase === 'splat') {
    // Cartoony splat: squashed flat and wide.
    const k = Math.min(1, w.phaseTime / 0.08)
    const sw = pw * (1 + 1.6 * k)
    const sh = ph * (1 - 0.8 * k)
    ctx.fillStyle = FG
    ctx.fillRect(pl.x + pw / 2 - sw / 2, pl.y + ph - sh, sw, sh)
    ctx.restore()
    return
  }
  if (w.phase === 'win') {
    // Dance: hop and wiggle.
    const t = w.phaseTime
    const hop = Math.abs(Math.sin(t * 9)) * 14
    const tilt = Math.sin(t * 9) * 0.25
    ctx.translate(pl.x + pw / 2, pl.y + ph - hop)
    ctx.rotate(tilt)
    ctx.fillStyle = FG
    ctx.fillRect(-pw / 2, -ph, pw, ph)
    ctx.restore()
    return
  }
  poseAngle += (fallPoseTarget(w, t) - poseAngle) * Math.min(1, dt * t.fallPoseEase)
  if (Math.abs(poseAngle) > 0.01) {
    // Rotate around the body centre; sideways leans the way he faces.
    ctx.translate(pl.x + pw / 2, pl.y + ph / 2)
    ctx.rotate(poseAngle * -pl.facing)
    ctx.translate(-(pl.x + pw / 2), -(pl.y + ph / 2))
  }
  ctx.fillStyle = FG
  ctx.fillRect(pl.x, pl.y, pw, ph)
  // Eye shows facing.
  ctx.fillStyle = BG
  ctx.fillRect(pl.x + pw / 2 + pl.facing * 5 - 2, pl.y + 9, 4, 6)
  drawUmbrella(ctx, w)
  ctx.restore()
}

/** `cam` overrides the game camera (the editor's own zoom and pan). */
export const render = (ctx: CanvasRenderingContext2D, w: World, labels: Labels, t: Tuning, dt: number, cam?: Camera): void => {
  const { width: cw, height: ch } = ctx.canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#0d1018'
  ctx.fillRect(0, 0, cw, ch)
  const { s, ox, oy } = cam ?? cameraFor(w, cw, ch, dt)
  ctx.setTransform(s, 0, 0, s, ox, oy)
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, w.level.world.w, w.level.world.h)

  for (const def of w.level.winds) {
    const wind = liveWind(w, def)
    if (wind.speed > 0) drawWind(ctx, wind, w.time)
    if (def.channel !== undefined && def.switched) {
      // A switchable current wears its channel's colour as a dashed frame.
      ctx.save()
      ctx.strokeStyle = channelColor(def.channel)
      ctx.globalAlpha = wind.speed > 0 ? 0.7 : 0.35
      ctx.lineWidth = 3
      ctx.setLineDash([12, 8])
      ctx.strokeRect(def.x + 1.5, def.y + 1.5, def.w - 3, def.h - 3)
      ctx.restore()
    }
  }
  for (const c of w.level.checkpoints ?? []) drawCheckpoint(ctx, c, (w.level.checkpoints ?? []).indexOf(c) === w.checkpoint, w.time)

  // Zoomed-out levels scale the labels back up so they stay readable.
  const zoomOut = (w.level.view?.w ?? w.level.world.w) / 1280
  for (const p of w.platforms) {
    if (p.channel !== undefined) {
      const on = platformActive(w, p)
      ctx.save()
      ctx.strokeStyle = channelColor(p.channel)
      ctx.fillStyle = channelColor(p.channel)
      if (on) {
        ctx.fillRect(p.x, p.y, p.w, p.h)
      } else {
        // Switched off: a dashed ghost of where it will appear.
        ctx.globalAlpha = 0.55
        ctx.lineWidth = 2
        ctx.setLineDash([8, 6])
        ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2)
      }
      ctx.restore()
      if (!on || !p.finish) continue
    } else {
      ctx.fillStyle = FG
      ctx.fillRect(p.x, p.y, p.w, p.h)
    }
    if (p.finish) {
      ctx.textAlign = 'center'
      if (zoomOut <= 1) {
        ctx.fillStyle = BG
        ctx.font = `700 ${Math.round(Math.min(p.h - 4, 14))}px system-ui, sans-serif`
        ctx.textBaseline = 'middle'
        ctx.fillText(labels.finish, p.x + p.w / 2, p.y + p.h / 2 + 1)
      } else {
        ctx.fillStyle = FG
        ctx.font = `700 ${Math.round(16 * zoomOut)}px system-ui, sans-serif`
        ctx.textBaseline = 'bottom'
        ctx.fillText(labels.finish, p.x + p.w / 2, p.y - 8)
      }
    }
  }

  for (const b of w.level.buttons ?? []) drawButton(ctx, b, channelOn(w, b.channel), (w.channels[b.channel] ?? 0) - w.time)
  for (const h of w.hazards) drawHazard(ctx, h, w.time)

  drawPlayer(ctx, w, t, dt)
}
