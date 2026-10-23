// ─── Canvas renderer (prototype look: white blocks on a dark field) ─────────

import { channelOn, checkpointBox, contactOf, liveWind, platformActive, type Hazard, type World } from './engine'
import { drawPrickbait, drawPweeg, drawUmbrella, drawWalldorf, type PweegLook, type PweegPose } from './characters'
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

/** The doc's sketch of a current: wavy lines drifting along the flow. */
const drawSquiggles = (ctx: CanvasRenderingContext2D, wind: WindDef, time: number) => {
  ctx.fillStyle = wind.super ? SUPER_WIND : WIND
  ctx.fillRect(wind.x, wind.y, wind.w, wind.h)
  const vertical = wind.dir === 'up' || wind.dir === 'down'
  const sign = wind.dir === 'up' || wind.dir === 'left' ? -1 : 1
  const along = vertical ? wind.h : wind.w
  const across = vertical ? wind.w : wind.h
  const gap = 46
  const len = 70
  const period = along + len
  ctx.save()
  ctx.beginPath()
  ctx.rect(wind.x, wind.y, wind.w, wind.h)
  ctx.clip()
  ctx.strokeStyle = wind.super ? SUPER_ARROW : WIND_ARROW
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  for (let c = gap / 2, col = 0; c < across; c += gap, col++) {
    // Each line drifts at its own pace and wiggles as it goes.
    const speed = wind.speed * (0.35 + ((col * 37) % 10) / 30)
    const head = (((time * speed + col * 97) % period) + period) % period
    ctx.beginPath()
    for (let a = 0; a <= len; a += 4) {
      const p = sign < 0 ? along - (head - a) : head - a
      const wob = Math.sin((head - a) * 0.09 + col) * 6
      const x = vertical ? wind.x + c + wob : wind.x + p
      const y = vertical ? wind.y + p : wind.y + c + wob
      if (a === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.restore()
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

const drawSpikes = (ctx: CanvasRenderingContext2D, h: Hazard) => {
  ctx.fillStyle = HAZARD
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
}

const drawHazard = (ctx: CanvasRenderingContext2D, h: Hazard, w: World) => {
  const pl = w.player
  const px = pl.x + pl.w / 2
  const py = pl.y + pl.h / 2
  if (h.kind === 'spikes') drawSpikes(ctx, h)
  else if (h.kind === 'mine') drawPrickbait(ctx, h.x + h.w / 2, h.y + h.h / 2, h.w / 2, px, py, w.time)
  else {
    // A charging Walldorf faces its charge and looks angry; a calm one watches Pweeg.
    const m = h.motion
    const charge = m?.kind === 'lunge' ? Math.sign(m.b.x - m.a.x) : 0
    const facing = (charge || Math.sign(px - (h.x + h.w / 2)) || 1) as 1 | -1
    drawWalldorf(ctx, h, { contact: contactOf(h), facing, angry: m?.kind === 'lunge' })
  }
}

/** Free-fall pose (GDD "Fall States"): upright when safe, sideways when the
 *  umbrella can still save you, upside-down at break speed. Eased, not snapped. */
let poseAngle = 0
/** Walk cycle, advanced by distance walked. */
let stepPhase = 0
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
  const fx = pl.x + pl.w / 2
  const fy = pl.y + pl.h
  const look = (pose: PweegPose): PweegLook => ({ pose, facing: pl.facing, w: pl.w, h: pl.h, time: w.time, step: stepPhase })
  const umbrellaState = pl.broken ? 'broken' : pl.open ? 'open' : 'furled'
  ctx.save()
  if (w.phase === 'splat') {
    // Cartoony splat: squashed flat and wide.
    const k = Math.min(1, w.phaseTime / 0.08)
    ctx.translate(fx, fy)
    ctx.scale(1 + 1.6 * k, 1 - 0.8 * k)
    drawPweeg(ctx, 0, 0, look('stand'))
    ctx.restore()
    return
  }
  if (w.phase === 'win') {
    // Dance: hop and wiggle, arms up.
    const hop = Math.abs(Math.sin(w.phaseTime * 9)) * 14
    ctx.translate(fx, fy - hop)
    ctx.rotate(Math.sin(w.phaseTime * 9) * 0.25)
    drawPweeg(ctx, 0, 0, look('cheer'))
    drawUmbrella(ctx, pl.facing * pl.w * 0.95, -pl.h - 2, { state: umbrellaState === 'open' ? 'furled' : umbrellaState, tilt: pl.facing * 0.3, time: w.time })
    ctx.restore()
    return
  }
  if (pl.grounded && Math.abs(pl.vx) > 20) stepPhase += Math.abs(pl.vx) * dt * 0.09
  poseAngle += (fallPoseTarget(w, t) - poseAngle) * Math.min(1, dt * t.fallPoseEase)
  if (Math.abs(poseAngle) > 0.01) {
    // Rotate around the body centre; sideways leans the way he faces.
    ctx.translate(fx, pl.y + pl.h / 2)
    ctx.rotate(poseAngle * -pl.facing)
    ctx.translate(-fx, -(pl.y + pl.h / 2))
  }
  const pose: PweegPose = pl.grounded ? (Math.abs(pl.vx) > 20 ? 'walk' : 'stand') : pl.open ? 'hold' : poseAngle > 2.4 ? 'terminal' : 'flail'
  drawPweeg(ctx, fx, fy, look(pose))
  // Open: held overhead (the canopy is the wind hitbox, engine umbrellaBox), leaning
  // into the drift. Otherwise carried furled (or broken) in one hand.
  if (pose === 'hold') {
    drawUmbrella(ctx, fx, pl.y - 4, { state: umbrellaState, tilt: Math.max(-1, Math.min(1, pl.vx / t.airSpeed)) * 0.28, time: w.time })
  } else if (pose === 'flail') {
    drawUmbrella(ctx, fx + pl.facing * pl.w * 0.98, pl.y + pl.w * 0.15, { state: umbrellaState, tilt: pl.facing * 0.35, time: w.time })
  } else if (pose === 'terminal') {
    drawUmbrella(ctx, fx, pl.y - 4, { state: umbrellaState, tilt: 0, time: w.time })
  } else {
    drawUmbrella(ctx, fx + pl.facing * pl.w * 0.8, fy - pl.h * 0.35, { state: umbrellaState, tilt: pl.facing * 0.22, time: w.time })
  }
  ctx.restore()
}

/** `cam` overrides the game camera (the editor's own zoom and pan). */
/** Extra drawing choices (the intro cutscene uses them). */
export interface RenderOptions {
  /** Leave the player out (cutscene actors are drawn by their owner). */
  hidePlayer?: boolean
  /** The design doc's wavy rising lines instead of the gameplay arrows. */
  windStyle?: 'arrows' | 'squiggles'
}

/** Draws a frame and returns the camera it used (to draw more on top in world space). */
export const render = (ctx: CanvasRenderingContext2D, w: World, labels: Labels, t: Tuning, dt: number, cam?: Camera, opts: RenderOptions = {}): Camera => {
  const { width: cw, height: ch } = ctx.canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#0d1018'
  ctx.fillRect(0, 0, cw, ch)
  const camera = cam ?? cameraFor(w, cw, ch, dt)
  const { s, ox, oy } = camera
  ctx.setTransform(s, 0, 0, s, ox, oy)
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, w.level.world.w, w.level.world.h)

  for (const def of w.level.winds) {
    const wind = liveWind(w, def)
    if (wind.speed > 0) (opts.windStyle === 'squiggles' ? drawSquiggles : drawWind)(ctx, wind, w.time)
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
  for (const h of w.hazards) drawHazard(ctx, h, w)

  if (!opts.hidePlayer) drawPlayer(ctx, w, t, dt)
  return camera
}
