// ─── Canvas renderer (prototype look: white blocks on a dark field) ─────────
//
// The kite and lantern builds (/umbrella/kite/, /umbrella/lantern/) can draw
// painted sheets instead of these shapes: each drawable first offers itself to
// `kiteArt` (art/hooks.ts), and draws its vector self when the slot is empty
// or declines. `artLayer` is a build-time constant, so outside those builds
// every such line folds away
// (tests/umbrella/vectorGolden.test.ts pins the vector path call for call).

import { channelOn, checkpointBox, contactOf, liveWind, STAR_R, platformActive, platformMoving, type Hazard, type Platform, type World } from './engine'
import { drawPrickbait, drawPweeg, drawUmbrella, drawWalldorf, heldAt, type PweegLook, type PweegPose } from './characters'
import type { Tuning } from './tuning'
import { spikeAngle } from './spikeGeometry'
import { DEFAULT_COLLECT_SHAPE, type ButtonDef, type CheckpointDef, type CollectShape, type WindDef } from './levels'
import { artLayer, isLantern, paintedGame } from './kite'
import { kiteArt } from './art/hooks'
import { drawSignVector } from './signArt'
import { drawArrow, drawPicture } from './pictureArt'
import { drawLesson } from './lessonArt'
import { frameFocus } from './cameraFocus'
import { cloudPath } from './cloudShape'

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
/** Each world's look-ahead lean (world px, + = right), eased toward the player's motion. */
const leans = new WeakMap<World, number>()
/** Landscape: the camera's own state (Super Mario World style): where it is and how fast it moves,
 *  where it is heading (`goal`), and which way it leads (+1 right, -1 left). */
const sideCam = new WeakMap<World, { x: number; v: number; goal: number; side: 1 | -1 }>()
/** At this sideways speed (px/s, a little under walking and floating) the camera leans fully… */
const LEAN_SPEED = 190
/** …this share of the view's width ahead of the player (portrait: little of the level is on screen,
 *  so it looks far ahead): walking right he stays in the screen's left quarter. */
const LOOK_AHEAD = 0.32
/** Landscape, Super Mario World style: the camera leads this share of the view ahead of the player
 *  (he sits a little behind the middle, facing the way he goes); it turns only when he walks back
 *  past a trigger line this share of the view behind his lead spot; and it glides with a critically
 *  damped spring of this stiffness (1/s): no overshoot, no lurch. */
const CAM_LEAD = 0.14
const CAM_TRIGGER = 0.05
const CAM_SPRING = 6
/** The camera's top speed while it turns (world px/s), or a little over the player's own speed. */
const CAM_TURN_SPEED = 320

/** Portrait: a world entered from another level first shows its finish (if the start view does not),
 *  then swings to the player. Seconds since it began, and whether the start view was checked. */
const finishPreviews = new WeakMap<World, { t: number; checked: boolean }>()
/** How long the camera rests on the finish, and how long it then swings to the player (s). */
const PREVIEW_HOLD = 2
const PREVIEW_SWING = 0.75
/** Show this world's finish first (portrait only, and only where the start view does not show it). */
export const previewFinish = (w: World): void => { finishPreviews.set(w, { t: 0, checked: false }) }

/** The camera's current look-ahead lean for a world (world px, + = right): for the tests. */
export const leanOf = (w: World): number => leans.get(w) ?? 0

/** A portrait screen zooms in at least this much past "the whole width fits", so Pweeg and the level read at phone size.
 *  (1.69 until 2026-10-30, then zoomed out by 1.3, 1.2 and 1.4 to see what comes next: about 2.2x the
 *  level on screen of at first. Below 1 a level narrower than the screen's width stays centred.) */
export const PORTRAIT_ZOOM = 0.774
/** …and far enough that the level's height fills this share of the screen's height: the band between
 *  the HUD at the top and the touch controls at the bottom, instead of a strip with empty sky above
 *  and below. The camera follows the player sideways through the width this leaves off screen. */
export const PORTRAIT_FILL = 0.33

/** Taller than wide: the levels are laid out for landscape, so this screen gets the portrait camera and backdrop. */
export const isPortrait = (cw: number, ch: number): boolean => ch > cw

/**
 * The camera. A level without `view` shows its whole world, letterboxed.
 * With `view` (one screen, in world units) it fits that screen into the
 * canvas and scrolls with the player, clamped to the world's edges; an axis
 * where the world is smaller than what the canvas shows stays centred.
 * A portrait screen zooms in (PORTRAIT_ZOOM / PORTRAIT_FILL) on either kind and follows the
 * player sideways through the part of the width it no longer shows.
 * `padBottom` (canvas px, landscape only): a band at the bottom kept for the touch controls; the
 * level is fitted into the height above it, so the stick and the umbrella button cover sky, not play.
 */
/** How much closer than fitting the whole level a wide landscape phone looks (the width fills first). */
export const LANDSCAPE_ZOOM_MAX = 1.6
/** Open-top levels with a following camera: the world slides down once the player climbs within this many world units of its top. */
const OPEN_TOP_MARGIN = 170
const topFollow = new WeakMap<World, number>()
/** How far above the level's top edge the camera looks (world units): follows the player's height smoothly. */
const verticalLift = (w: World, dt: number): number => {
  if (!w.level.verticalCamera || w.level.fixedScreen) return 0
  const target = w.player.y + w.player.h / 2
  let y = topFollow.get(w)
  if (y === undefined) y = target
  else if (dt > 0) y += (target - y) * (1 - Math.exp(-dt * 7))
  topFollow.set(w, y)
  return Math.max(0, OPEN_TOP_MARGIN - y)
}

export const cameraFor = (w: World, cw: number, ch: number, dt = 0, padBottom = 0): Camera => {
  const { w: ww, h: wh } = w.level.world
  const view = w.level.view
  const whole = !view || (view.w >= ww && view.h >= wh)
  const portrait = isPortrait(cw, ch)
  // The height the level is fitted into: above the controls' band (landscape only).
  const fh = portrait ? ch : Math.max(ch * 0.5, ch - Math.max(0, padBottom))
  // A wide landscape phone (the screen is wider than the level, and its controls' band takes height) would
  // letterbox the level small. It zooms in towards filling the width instead, at most LANDSCAPE_ZOOM_MAX
  // times the fit, and the camera then follows the player up and down.
  // Fixed screen: the camera never moves. The whole level is fitted and centred, on any device.
  if (w.level.fixedScreen) {
    const s = Math.min(cw / ww, fh / wh)
    return { s, ox: (cw - ww * s) / 2, oy: (fh - wh * s) / 2 }
  }
  // A whole-world level on a landscape screen: a static view zoomed on what is in it (cameraFocus.ts), so the start
  // and the finish are in view from the first frame, with little empty space at the sides and none below the
  // out-of-bounds line. (An open-top level keeps its sliding view below.)
  if (whole && !portrait && !w.level.verticalCamera) {
    const f = frameFocus(w.level, cw, fh)
    return { s: f.s, ox: -f.left * f.s, oy: -f.top * f.s }
  }
  const fitWhole = Math.min(cw / (whole ? ww : view!.w), fh / (whole ? wh : view!.h))
  const landscapeZoom = !portrait && Math.min(cw / (whole ? ww : view!.w), fitWhole * LANDSCAPE_ZOOM_MAX) > fitWhole * 1.001
  if (whole && !portrait && !landscapeZoom) {
    const s = fitWhole
    return { s, ox: (cw - ww * s) / 2, oy: (fh - wh * s) / 2 + verticalLift(w, dt) * s }
  }
  const screen = whole ? { w: ww, h: wh } : view!
  const fit = fitWhole
  const s = portrait ? Math.max(fit * PORTRAIT_ZOOM, (ch * PORTRAIT_FILL) / screen.h)
    : landscapeZoom ? Math.min(cw / screen.w, fit * LANDSCAPE_ZOOM_MAX) : fit
  const vw = cw / s
  const vh = fh / s
  const pl = w.player
  // Look ahead: the camera leans the way the player moves (walking, floating or blown), up to
  // LOOK_AHEAD of the view's width, so what lies ahead is on screen. The lean eases in and out more
  // slowly than the follow itself, so a quick turn does not whip the view across.
  let lean = leans.get(w) ?? 0
  const heading = Math.max(-1, Math.min(1, pl.vx / LEAN_SPEED))
  if (portrait) {
    // Portrait: quick, far look-ahead (little of the level is on screen), eased straight to the target.
    const leanTarget = heading * vw * LOOK_AHEAD
    if (dt > 0) lean += (leanTarget - lean) * (1 - Math.exp(-dt * 3.3))
  }
  leans.set(w, lean)
  const target = { x: pl.x + pl.w / 2 + lean, y: pl.y + pl.h / 2 }
  let c = followed.get(w)
  if (!c) followed.set(w, (c = { ...target }))
  else if (dt > 0) {
    const k = 1 - Math.exp(-dt * 7)
    c.x += (target.x - c.x) * k
    c.y += (target.y - c.y) * k
  }
  if (!portrait) {
    // Landscape, Super Mario World style. Two lines either side of the player: walking on in the
    // direction it leads pushes the camera along (he stays at his lead spot); walking back moves
    // nothing until he crosses the line behind that spot, and only then does the camera turn, gliding
    // over to lead the other way. A quick back-and-forth between the lines leaves the view still.
    const px = pl.x + pl.w / 2
    const lead = vw * CAM_LEAD
    const trigger = vw * CAM_TRIGGER
    let sc = sideCam.get(w)
    if (!sc) {
      const side: 1 | -1 = pl.vx < 0 ? -1 : 1
      sc = { x: px + side * lead, v: 0, goal: px + side * lead, side }
      sideCam.set(w, sc)
    }
    if (sc.side > 0) {
      if (px < sc.goal - lead - trigger) { sc.side = -1; sc.goal = px - lead }
      else sc.goal = Math.max(sc.goal, px + lead)
    } else {
      if (px > sc.goal + lead + trigger) { sc.side = 1; sc.goal = px + lead }
      else sc.goal = Math.min(sc.goal, px - lead)
    }
    // In steps of at most 1/60 s, so a slow frame (a weak phone) moves it as far as several quick ones.
    const steps = dt > 0 ? Math.min(12, Math.ceil(dt * 60)) : 0
    for (let i = 0; i < steps; i++) {
      const h = Math.min(dt, 0.2) / steps
      sc.v += (CAM_SPRING * CAM_SPRING * (sc.goal - sc.x) - 2 * CAM_SPRING * sc.v) * h
      // A turn glides across at a capped speed (never much faster than the player), instead of
      // whipping the view over by two leads at once.
      const cap = Math.max(CAM_TURN_SPEED, Math.abs(pl.vx) * 1.15)
      sc.v = Math.max(-cap, Math.min(cap, sc.v))
      sc.x += sc.v * h
    }
    c.x = sc.x
    leans.set(w, sc.x - px)
  }
  const axis = (centre: number, seen: number, size: number) =>
    seen >= size ? (seen - size) / 2 : -Math.min(size - seen, Math.max(0, centre - seen / 2))
  let at = { x: c.x, y: c.y }
  const pv = portrait ? finishPreviews.get(w) : undefined
  if (pv) {
    const fin = w.platforms.find((p) => p.finish)
    if (!pv.checked) {
      pv.checked = true
      // Already on screen from the start (the whole finish in view): no preview.
      const left = -axis(c.x, vw, ww)
      const top = -axis(c.y, vh, wh)
      if (!fin || (fin.x >= left && fin.x + fin.w <= left + vw && fin.y - 40 >= top && fin.y + fin.h <= top + vh)) finishPreviews.delete(w)
    }
    if (fin && finishPreviews.has(w)) {
      // The player's first move cuts the rest short: straight to the swing back.
      if (w.moved && pv.t < PREVIEW_HOLD) pv.t = PREVIEW_HOLD
      pv.t += dt
      const goal = { x: fin.x + fin.w / 2, y: fin.y }
      if (pv.t < PREVIEW_HOLD) at = goal
      else {
        const u = Math.min(1, (pv.t - PREVIEW_HOLD) / PREVIEW_SWING)
        const k = u * u * (3 - 2 * u)
        at = { x: goal.x + (c.x - goal.x) * k, y: goal.y + (c.y - goal.y) * k }
        if (u >= 1) finishPreviews.delete(w)
      }
    }
  }
  // A landscape view taller than the world sits on the world's bottom: nothing below the out-of-bounds line shows.
  let oy = (!portrait && vh >= wh ? vh - wh : axis(at.y, vh, wh)) * s
  // Open to the sky: above the level's top the view keeps following him up instead of stopping at the edge.
  if (w.level.verticalCamera && !w.level.fixedScreen && at.y < vh / 2) oy = Math.max(oy, (vh / 2 - at.y) * s)
  return { s, ox: axis(at.x, vw, ww) * s, oy }
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
export const drawButton = (ctx: CanvasRenderingContext2D, b: ButtonDef, on: boolean, left: number, col = channelColor(b.channel), base = 'rgba(255, 255, 255, 0.25)') => {
  const capH = on ? b.h * 0.35 : b.h
  ctx.fillStyle = base
  ctx.fillRect(b.x - 4, b.y + b.h - 4, b.w + 8, 4)
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.roundRect(b.x, b.y + b.h - capH - 2, b.w, capH, 4)
  ctx.fill()
  if (on && b.duration && Number.isFinite(left) && left > 0) {
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
export const drawCheckpoint = (ctx: CanvasRenderingContext2D, c: CheckpointDef, reached: boolean, time: number, waiting = 'rgba(255, 255, 255, 0.45)') => {
  if (artLayer && kiteArt.checkpoint?.(ctx, c, reached, time)) return
  const box = checkpointBox(c)
  const poleX = box.x + 6
  ctx.fillStyle = FG
  ctx.fillRect(poleX - 2, box.y, 4, box.h)
  const wave = reached ? Math.sin(time * 6) * 3 : 0
  ctx.fillStyle = reached ? '#4ade80' : waiting
  ctx.beginPath()
  ctx.moveTo(poleX + 2, box.y + 2)
  ctx.lineTo(poleX + 30, box.y + 12 + wave)
  ctx.lineTo(poleX + 2, box.y + 24)
  ctx.closePath()
  ctx.fill()
}

/** A collectible in gold: a star, an umbrella or a cloud. It bobs and glints; a collected one leaves a faint outline. */
export const drawStar = (ctx: CanvasRenderingContext2D, s: { x: number; y: number; shape?: CollectShape }, got: boolean, time: number, phase = 0) => {
  if (artLayer && kiteArt.collect?.(ctx, s, got, time, phase)) return
  const bob = got ? 0 : Math.sin(time * 3 + phase) * 3
  const r = STAR_R
  const cx = s.x
  const cy = s.y + bob
  const shape = s.shape ?? DEFAULT_COLLECT_SHAPE
  // The silhouette of each shape, as one path.
  const trace = () => {
    ctx.beginPath()
    if (shape === 'star') {
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5
        const rr = k % 2 ? r * 0.46 : r
        ctx[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
      }
      ctx.closePath()
    } else if (shape === 'umbrella') {
      // A scalloped canopy over a shaft with a J-handle.
      const top = cy - r * 0.95
      const rim = cy + r * 0.05
      ctx.moveTo(cx - r, rim)
      ctx.bezierCurveTo(cx - r, top, cx + r, top, cx + r, rim)
      const scallops = 4
      const w = (r * 2) / scallops
      for (let k = scallops - 1; k >= 0; k--) ctx.quadraticCurveTo(cx - r + (k + 0.5) * w + w / 2 - w / 2, rim + r * 0.32, cx - r + k * w, rim)
      ctx.closePath()
      ctx.moveTo(cx - 1.5, rim)
      ctx.lineTo(cx - 1.5, cy + r * 0.75)
      ctx.arc(cx - r * 0.3, cy + r * 0.75, r * 0.3 - 1.5, 0, Math.PI)
      ctx.lineTo(cx - r * 0.6 + 1.5, cy + r * 0.75)
      ctx.arc(cx - r * 0.3, cy + r * 0.75, r * 0.3 + 1.5, Math.PI, 0, true)
      ctx.lineTo(cx + 1.5, rim)
      ctx.closePath()
    } else {
      // A puffy cloud: three bumps on a flat base.
      const base = cy + r * 0.55
      ctx.moveTo(cx - r * 0.85, base)
      ctx.arc(cx - r * 0.55, base - r * 0.42, r * 0.42, Math.PI * 0.5, Math.PI * 1.5)
      ctx.arc(cx - r * 0.1, base - r * 0.82, r * 0.52, Math.PI * 1.05, Math.PI * 1.95)
      ctx.arc(cx + r * 0.52, base - r * 0.45, r * 0.45, Math.PI * 1.5, Math.PI * 0.5)
      ctx.closePath()
    }
  }
  ctx.save()
  ctx.lineJoin = 'round'
  if (got) {
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)'
    ctx.lineWidth = 2
    trace()
    ctx.stroke()
  } else {
    ctx.fillStyle = `rgba(250, 204, 21, ${0.16 + 0.1 * Math.sin(time * 4 + phase)})`
    ctx.beginPath()
    ctx.arc(cx, cy, r * 1.55, 0, Math.PI * 2)
    ctx.fill()
    const gold = ctx.createLinearGradient(cx, cy - r, cx, cy + r)
    gold.addColorStop(0, '#fff3a8')
    gold.addColorStop(0.5, '#facc15')
    gold.addColorStop(1, '#d99a06')
    ctx.fillStyle = gold
    ctx.strokeStyle = FG
    ctx.lineWidth = 2.5
    trace()
    ctx.fill('nonzero')
    ctx.stroke()
    if (shape === 'umbrella') {
      // Ribs.
      ctx.strokeStyle = 'rgba(120, 70, 0, 0.55)'
      ctx.lineWidth = 1.3
      ctx.beginPath()
      for (const f of [-0.5, 0, 0.5]) {
        ctx.moveTo(cx, cy - r * 0.9)
        ctx.lineTo(cx + f * r * 1.6, cy + r * 0.05)
      }
      ctx.stroke()
    }
    // A glint that sweeps across now and then.
    const sweep = (time * 0.6 + phase) % 3
    if (sweep < 1) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * Math.sin(sweep * Math.PI)})`
      ctx.beginPath()
      ctx.arc(cx - r * 0.55 + sweep * r * 1.1, cy - r * 0.35, r * 0.17, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

/** A warp pipe, as in Super Mario Bros.: a green tube with a rim and a swirling dark mouth. */
export const drawGate = (ctx: CanvasRenderingContext2D, g: { x: number; y: number; w: number; h: number }, time: number, hint = false) => {
  const rimH = Math.min(22, g.h * 0.35)
  if (artLayer && kiteArt.gate?.(ctx, g, time)) {
    if (hint) drawGateHint(ctx, g, time)
    return
  }
  ctx.save()
  ctx.lineWidth = 3
  ctx.strokeStyle = FG
  ctx.lineJoin = 'round'
  // The tube.
  ctx.fillStyle = '#22a35a'
  ctx.fillRect(g.x + 6, g.y + rimH, g.w - 12, g.h - rimH)
  ctx.strokeRect(g.x + 6, g.y + rimH, g.w - 12, g.h - rimH)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.fillRect(g.x + 12, g.y + rimH + 3, 6, g.h - rimH - 6)
  // The rim, a little wider than the tube.
  ctx.fillStyle = '#34d27b'
  ctx.fillRect(g.x, g.y, g.w, rimH)
  ctx.strokeRect(g.x, g.y, g.w, rimH)
  // The mouth: a dark opening with a spinning glint.
  ctx.fillStyle = '#0b3d22'
  ctx.fillRect(g.x + 7, g.y + 4, g.w - 14, rimH - 8)
  ctx.strokeStyle = `rgba(190, 255, 220, ${0.5 + 0.3 * Math.sin(time * 5)})`
  ctx.lineWidth = 2
  const mx = g.x + g.w / 2
  const my = g.y + rimH / 2
  ctx.beginPath()
  ctx.ellipse(mx, my, (g.w - 22) / 2, Math.max(2, rimH / 2 - 6), 0, time * 4, time * 4 + Math.PI * 1.4)
  ctx.stroke()
  // Standing at it with the umbrella shut: a bobbing umbrella says what to do.
  if (hint) {
    ctx.fillStyle = '#e8fff3'
    ctx.font = '700 30px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText('☂', mx, g.y - 8 + Math.sin(time * 6) * 4)
  }
  ctx.restore()
}

/** The hint board: lantern-held paper with the SPACE key and a down arrow (decoration). */
export const drawSign = (ctx: CanvasRenderingContext2D, s: { x: number; y: number; w: number; h: number; kind?: 'drop' | 'float' }, time: number): void => {
  if (artLayer && kiteArt.sign?.(ctx, s, time)) return
  drawSignVector(ctx, s, time, s.kind)
}

/** The bobbing umbrella over a painted gate. */
const drawGateHint = (ctx: CanvasRenderingContext2D, g: { x: number; y: number; w: number }, time: number): void => {
  ctx.save()
  ctx.fillStyle = '#e8fff3'
  ctx.font = '700 30px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('☂', g.x + g.w / 2, g.y - 8 + Math.sin(time * 6) * 4)
  ctx.restore()
}

export const drawSpikes = (ctx: CanvasRenderingContext2D, h: Pick<Hazard, 'x' | 'y' | 'w' | 'h' | 'facing' | 'angle'>) => {
  const a = spikeAngle(h)
  if (a !== 0 && a !== 180) {
    // Turned about the strip's centre, drawn as an upright strip.
    ctx.save()
    ctx.translate(h.x + h.w / 2, h.y + h.h / 2)
    ctx.rotate((a * Math.PI) / 180)
    drawSpikes(ctx, { x: -h.w / 2, y: -h.h / 2, w: h.w, h: h.h, facing: 'up' })
    ctx.restore()
    return
  }
  if (a === 180) h = { ...h, facing: 'down' }
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

/** A ventilator's parts, back to front (the kite art bench bakes each on its
 *  own): the boxed housing, the whirring blades, the hub. */
export const fanHousing = (ctx: CanvasRenderingContext2D, h: Pick<Hazard, 'x' | 'y' | 'w' | 'h'>) => {
  const cx = h.x + h.w / 2
  const cy = h.y + h.h / 2
  const r = Math.min(h.w, h.h) / 2
  ctx.fillStyle = '#3a4256'
  ctx.strokeStyle = '#0d1018'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(h.x, h.y, h.w, h.h, r * 0.25)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#10141f'
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2)
  ctx.fill()
}
export const fanBlades = (ctx: CanvasRenderingContext2D, h: Pick<Hazard, 'x' | 'y' | 'w' | 'h'>, angle: number, blur = true) => {
  const cx = h.x + h.w / 2
  const cy = h.y + h.h / 2
  const r = Math.min(h.w, h.h) / 2
  // Blades: four, spinning fast, with a faint blur disc behind them.
  if (blur) {
    ctx.fillStyle = 'rgba(255, 90, 95, 0.18)'
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.fillStyle = HAZARD
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2)
    ctx.beginPath()
    ctx.ellipse(r * 0.4, 0, r * 0.38, r * 0.13, 0.35, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
export const fanHub = (ctx: CanvasRenderingContext2D, h: Pick<Hazard, 'x' | 'y' | 'w' | 'h'>) => {
  const r = Math.min(h.w, h.h) / 2
  ctx.fillStyle = '#e8ecf5'
  ctx.beginPath()
  ctx.arc(h.x + h.w / 2, h.y + h.h / 2, r * 0.12, 0, Math.PI * 2)
  ctx.fill()
}

/** A ventilator: a boxed grille with blades whirring at a speed that says "do not land here". */
const drawFan = (ctx: CanvasRenderingContext2D, h: Hazard, time: number) => {
  fanHousing(ctx, h)
  fanBlades(ctx, h, time * 18)
  fanHub(ctx, h)
}

/** How long a mine's blast plays (s). */
export const MINE_BLAST_TIME = 0.85
/** Where each mine Pweeg ran into went off (pinned there for the rest of the death, even if the mine keeps drifting). */
const ripBlasts = new WeakMap<Hazard, { x: number; y: number }>()
const ripOf = (h: Hazard, w: World): { x: number; y: number } | undefined => {
  if (w.phase !== 'splat') {
    ripBlasts.delete(h)
    return undefined
  }
  const pl = w.player
  if (!ripBlasts.has(h) && pl.x < h.x + h.w + 2 && pl.x + pl.w > h.x - 2 && pl.y < h.y + h.h + 2 && pl.y + pl.h > h.y - 2) {
    ripBlasts.set(h, { x: h.x + h.w / 2, y: h.y + h.h / 2 })
  }
  return ripBlasts.get(h)
}
/** The skinless mine's blast, on the marker-on-paper look: a flash, a torn-paper starburst with ragged edges and a heavy marker
 *  outline, ripped scraps flung out spinning and falling, comic action lines and a shock ring. `t` is seconds since the hit
 *  (the whole thing is over by MINE_DEATH_HOLD). Flat white and ink only, like everything else in this look. */
const drawMineRip = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, seed: number): void => {
  const rnd = (n: number) => { const s = Math.sin((n + seed * 97) * 12.9898) * 43758.5453; return s - Math.floor(s) }
  const ease = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3)
  const ink = (w: number) => { ctx.strokeStyle = BG; ctx.lineWidth = Math.max(1.5, w); ctx.lineJoin = 'round'; ctx.lineCap = 'round' }
  ctx.save()
  ctx.translate(x, y)
  // The flash.
  if (t < 0.1) {
    ctx.globalAlpha = 1 - t / 0.1
    ctx.fillStyle = FG
    ctx.beginPath()
    ctx.arc(0, 0, r * (1.3 + 3 * t), 0, Math.PI * 2)
    ctx.fill()
  }
  // The torn starburst: a big ragged sheet over a smaller one, bursting out and folding away.
  const grow = ease(t / 0.16)
  const fold = Math.max(0, 1 - Math.max(0, t - 0.2) / 0.3)
  if (fold > 0) {
    ;[[2.0, FG], [1.15, '#d9dde8']].forEach(([k, col], layer) => {
      const R = r * (k as number) * grow * fold
      const n = 11
      ctx.globalAlpha = 1
      ctx.fillStyle = col as string
      ink(r * 0.1)
      ctx.beginPath()
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2 + layer * 0.37 + seed
        const rr = i % 2 ? R * (0.42 + 0.14 * rnd(i + layer * 31)) : R * (0.8 + 0.4 * rnd(i * 3 + layer * 17))
        // A torn edge is never straight: each tip gets a little kink before it.
        const kink = i % 2 ? 0 : (rnd(i + 5) - 0.5) * R * 0.1
        const px = Math.cos(a) * rr + Math.cos(a + Math.PI / 2) * kink
        const py = Math.sin(a) * rr + Math.sin(a + Math.PI / 2) * kink
        if (i) ctx.lineTo(px, py)
        else ctx.moveTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })
  }
  // The shock ring.
  if (t < 0.36) {
    const u = t / 0.36
    ctx.globalAlpha = 0.9 * (1 - u)
    ctx.strokeStyle = FG
    ctx.lineWidth = Math.max(1.5, r * 0.2 * (1 - u))
    ctx.beginPath()
    ctx.arc(0, 0, r * (1 + 2.6 * ease(u)), 0, Math.PI * 2)
    ctx.stroke()
  }
  // Ripped scraps: ragged paper bits flung out, spinning, falling, with a marker outline.
  for (let i = 0; i < 14; i++) {
    const u = t / 0.8
    if (u >= 1) break
    const a = (i / 14) * Math.PI * 2 + rnd(i) * 0.5
    const v = r * (3.2 + 2.4 * rnd(i * 5 + 1))
    const size = r * (0.22 + 0.2 * rnd(i * 7 + 2))
    ctx.save()
    ctx.translate(Math.cos(a) * v * t, Math.sin(a) * v * t + r * 5 * t * t)
    ctx.rotate(a + t * (6 + 6 * rnd(i + 3)) * (rnd(i) < 0.5 ? -1 : 1))
    ctx.globalAlpha = Math.min(1, (1 - u) * 1.8)
    ctx.fillStyle = i % 3 ? FG : '#d9dde8'
    ink(r * 0.07)
    ctx.beginPath()
    const pts = 5 + (i % 2)
    for (let j = 0; j < pts; j++) {
      const b = (j / pts) * Math.PI * 2
      const rr = size * (0.55 + 0.6 * rnd(i * 11 + j))
      if (j) ctx.lineTo(Math.cos(b) * rr, Math.sin(b) * rr)
      else ctx.moveTo(Math.cos(b) * rr, Math.sin(b) * rr)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
  // Action lines: short marker dashes racing out.
  if (t < 0.34) {
    const u = t / 0.34
    ctx.globalAlpha = 1 - u
    ctx.strokeStyle = FG
    ctx.lineWidth = Math.max(1.5, r * 0.09)
    ctx.lineCap = 'round'
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rnd(i + 40) * 0.4
      const d = r * (1.3 + 3.6 * ease(u))
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d)
      ctx.lineTo(Math.cos(a) * (d + r * 0.7 * (1 - u)), Math.sin(a) * (d + r * 0.7 * (1 - u)))
      ctx.stroke()
    }
  }
  ctx.restore()
}

const drawHazard = (ctx: CanvasRenderingContext2D, h: Hazard, w: World) => {
  const pl = w.player
  const px = pl.x + pl.w / 2
  const py = pl.y + pl.h / 2
  if (artLayer && kiteArt.hazard?.(ctx, h, w)) return
  // A mine that blew up against another mine: its blast plays where it was, then nothing is left.
  if (h.kind === 'mine' && h.blownAt !== undefined) {
    const t = w.time - h.blownAt
    const bx = h.blastX ?? h.x + h.w / 2, by = h.blastY ?? h.y + h.h / 2
    if (t < MINE_BLAST_TIME) drawMineRip(ctx, bx, by, h.w / 2, t, (bx * 0.013 + by * 0.007) % 1)
    return
  }
  if (h.kind === 'spikes') drawSpikes(ctx, h)
  else if (h.kind === 'fan') drawFan(ctx, h, w.time)
  else if (h.kind === 'mine') {
    // Touched, the skinless mine goes off: it is gone and only its torn-paper blast is left (the painted looks have their own).
    const rip = ripOf(h, w)
    if (rip) drawMineRip(ctx, rip.x, rip.y, h.w / 2, w.phaseTime, (rip.x * 0.013 + rip.y * 0.007) % 1)
    else drawPrickbait(ctx, h.x + h.w / 2, h.y + h.h / 2, h.w / 2, px, py, w.time)
  }
  else {
    // A charging Walldorf faces its charge and looks angry; a calm one watches Pweeg.
    const m = h.motion
    const charge = m?.kind === 'lunge' ? Math.sign(m.b.x - m.a.x) : 0
    const facing = (charge || Math.sign(px - (h.x + h.w / 2)) || 1) as 1 | -1
    // Skinless: red tells him it is hostile — anything that bumps him, and anything that moves (even a harmless-looking one
    // can push him into a wall). Only a still, harmless one keeps its calm grey.
    const hostile = contactOf(h) === 'bounce' || (!!m && m.kind !== 'static')
    drawWalldorf(ctx, h, { contact: contactOf(h), facing, angry: m?.kind === 'lunge', hostile })
  }
}

/** Free-fall pose (GDD "Fall States"): upright when safe, sideways when the
 *  umbrella can still save you, upside-down at break speed. Eased, not snapped. */
let poseAngle = 0
/** Walk cycle, advanced by distance walked. */
let stepPhase = 0
/** A restart starts the figure from scratch: the fall pose and walk cycle of the run before (a splat
 *  leaves the pose sideways or upside-down) must not ease out on the new start platform. */
export const resetPlayerPose = (): void => {
  poseAngle = 0
  stepPhase = 0
}
const fallPoseTarget = (w: World, t: Tuning): number => {
  const pl = w.player
  if (pl.open || pl.grounded || w.phase !== 'play') return 0
  const f = pl.vy / t.terminalVelocity
  if (f >= t.breakFraction) return Math.PI
  if (f >= t.fallPoseSideways) return Math.PI / 2
  return 0
}

/** Did an enemy (or a fan, or spikes) end this run, rather than the ground?
 *  The kite art pops Pweeg into a puff for the first, flattens him for the second. */
const hitByEnemy = (w: World): boolean => {
  const pl = w.player
  return w.hazards.some((h) => contactOf(h) === 'deadly' && h.blownAt === undefined
    && pl.x < h.x + h.w + 2 && pl.x + pl.w > h.x - 2 && pl.y < h.y + h.h + 2 && pl.y + pl.h > h.y - 2)
}

const drawPlayer = (ctx: CanvasRenderingContext2D, w: World, t: Tuning, dt: number) => {
  const pl = w.player
  const fx = pl.x + pl.w / 2
  const fy = pl.y + pl.h
  // An umbrella that just opened by itself stays furled for a beat (see Player.autoShow).
  const shownOpen = pl.open && pl.autoShow < 0
  const look = (pose: PweegPose): PweegLook => ({ pose, facing: pl.facing, w: pl.w, h: pl.h, time: w.time, step: stepPhase, broken: pl.broken, open: shownOpen })
  const umbrellaState = pl.broken ? 'broken' : shownOpen ? 'open' : 'furled'
  ctx.save()
  if (w.phase === 'splat') {
    if (artLayer && kiteArt.splat?.(ctx, fx, fy, look('stand'), w.phaseTime, hitByEnemy(w))) {
      ctx.restore()
      return
    }
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
    // The lantern cheer raises the furled umbrella in his front fist, wherever the painted frame puts
    // that fist (art/paint.ts measures it per frame); the vector cheer holds it up beside him.
    const hand = paintedGame && artLayer ? kiteArt.cheerHand?.() ?? null : null
    const [ux, uy, ut] = hand ? [hand.x, hand.y, 0.18] : [pl.facing * pl.w * 0.95, -pl.h - 2, pl.facing * 0.3]
    drawUmbrella(ctx, ux, uy, { state: umbrellaState === 'open' ? 'furled' : umbrellaState, tilt: ut, time: w.time })
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
  const pose: PweegPose = pl.grounded ? (Math.abs(pl.vx) > 20 ? 'walk' : 'stand') : shownOpen ? 'hold' : poseAngle > 2.4 ? 'terminal' : 'flail'
  // Open: held overhead (the canopy is the wind hitbox, engine umbrellaBox), leaning
  // into the drift. Otherwise carried furled (or broken) in one hand.
  const drawHeldUmbrella = (): void => {
  if (pose === 'hold') {
    drawUmbrella(ctx, fx, pl.y - 4, { state: umbrellaState, tilt: Math.max(-1, Math.min(1, pl.vx / t.airSpeed)) * 0.28, time: w.time })
  } else if (pose === 'flail') {
    // In the painted fall the grip goes in his flung-out front hand (art/paint.ts finds it per frame).
    const at = heldAt(fx + pl.facing * pl.w * 0.98, pl.y + pl.w * 0.15)
    drawUmbrella(ctx, at.x, at.y, { state: umbrellaState, tilt: pl.facing * 0.35, time: w.time })
  } else if (pose === 'terminal') {
    drawUmbrella(ctx, fx, pl.y - 4, { state: umbrellaState, tilt: 0, time: w.time })
  } else {
    const at = heldAt(fx + pl.facing * pl.w * 0.8, fy - pl.h * 0.35)
    drawUmbrella(ctx, at.x, at.y, { state: umbrellaState, tilt: pl.facing * 0.22, time: w.time })
  }
  }
  // The drawn Pweeg's hands wrap the grip, so the umbrella goes BEHIND him. The painted builds read
  // the fist's spot from the figure just drawn (heldAt), so they draw the figure first.
  if (artLayer) {
    drawPweeg(ctx, fx, fy, look(pose))
    drawHeldUmbrella()
  } else {
    drawHeldUmbrella()
    drawPweeg(ctx, fx, fy, look(pose))
  }
  ctx.restore()
}

/** What a painted button still needs drawn live (kite): a timed one's seconds,
 *  a toggle's state dot. */
const drawButtonMarks = (ctx: CanvasRenderingContext2D, b: ButtonDef, on: boolean, left: number) => {
  const col = channelColor(b.channel)
  const capH = on ? b.h * 0.35 : b.h
  if (on && b.duration && Number.isFinite(left) && left > 0) {
    ctx.fillStyle = col
    ctx.font = '700 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(Math.ceil(left).toString(), b.x + b.w / 2, b.y - 4)
  } else if (!b.duration) {
    ctx.fillStyle = on ? FG : BG
    ctx.beginPath()
    ctx.arc(b.x + b.w / 2, b.y + b.h - capH / 2 - 2, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** `cam` overrides the game camera (the editor's own zoom and pan). */
/** Extra drawing choices (the intro cutscene uses them). */
export interface RenderOptions {
  /** Leave the player out (cutscene actors are drawn by their owner). */
  hidePlayer?: boolean
  /** The design doc's wavy rising lines instead of the gameplay arrows. */
  windStyle?: 'arrows' | 'squiggles'
  /** Canvas px at the bottom kept clear of the level for the touch controls (landscape; see cameraFor). */
  padBottom?: number
}

/** Draws a frame and returns the camera it used (to draw more on top in world space). */
export const render = (ctx: CanvasRenderingContext2D, w: World, labels: Labels, t: Tuning, dt: number, cam?: Camera, opts: RenderOptions = {}): Camera => {
  const { width: cw, height: ch } = ctx.canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const camera = cam ?? cameraFor(w, cw, ch, dt, opts.padBottom ?? 0)
  const { s, ox, oy } = camera
  // Portrait (the levels are landscape): the level's ground runs the whole screen instead of a strip.
  const fullBleed = !cam && isPortrait(cw, ch)
  // Weak phones: the sky sits still on a background canvas behind this one (never repainted per frame).
  const still = artLayer && !cam && !!kiteArt.stillBackdrop?.(ctx.canvas, fullBleed)
  if (still) {
    ctx.clearRect(0, 0, cw, ch)
  } else {
    ctx.fillStyle = '#0d1018'
    ctx.fillRect(0, 0, cw, ch)
  }
  // A painted backdrop (the lantern build's night sky) fills the screen behind the level.
  const backdrop = still || (artLayer && !!kiteArt.backdrop?.(ctx, cw, ch, camera, w))
  if (fullBleed && !backdrop) {
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, cw, ch)
  }
  ctx.setTransform(s, 0, 0, s, ox, oy)
  // A painted sky is shown as painted, untinted inside and outside the level: a veil outside the
  // level's box and a night tint inside it drew a dark rectangle with a lighter strip beside it
  // wherever the box did not fill the screen, which read as a rendering bug.
  if (!backdrop && !fullBleed) {
    ctx.fillStyle = BG
    // An open-top level's sky goes on above the world's top edge.
    const sky = w.level.fixedScreen || w.level.verticalCamera ? 4000 : 0
    ctx.fillRect(0, -sky, w.level.world.w, w.level.world.h + sky)
  }

  for (const def of w.level.winds) {
    const wind = liveWind(w, def)
    if (artLayer && kiteArt.wind?.(ctx, wind, def, w, opts.windStyle === 'squiggles')) continue
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
  for (const sg of w.level.signs ?? []) drawSign(ctx, sg, w.time)
  for (const pc of w.level.pictures ?? []) drawPicture(ctx, pc, w.time)
  for (const ls of w.level.lessons ?? []) drawLesson(ctx, ls, w.time)
  for (const ar of w.level.arrows ?? []) drawArrow(ctx, ar, w.time)
  for (const c of w.level.checkpoints ?? []) drawCheckpoint(ctx, c, (w.level.checkpoints ?? []).indexOf(c) === w.checkpoint, w.time)
  for (const g of w.level.gates ?? []) {
    const pl = w.player
    const at = pl.x < g.x + g.w && pl.x + pl.w > g.x && pl.y < g.y + g.h && pl.y + pl.h > g.y
    drawGate(ctx, g, w.time, at && !pl.open && w.phase === 'play')
  }
  // A picked-up collectible is gone: no greyed-out copy stays behind to distract (the HUD badge counts it).
  ;(w.level.stars ?? []).forEach((st, i) => { if (!w.starsGot[i]) drawStar(ctx, st, false, w.time, i * 1.7) })

  // Zoomed-out levels scale the labels back up so they stay readable.
  const zoomOut = (w.level.view?.w ?? w.level.world.w) / 1280
  /** A cloud: its fill, then a very thin black outline when `outline` is set (the style's stroke colour and width are put back). */
  const fillCloud = (p: Platform): void => {
    cloudPath(ctx, p.x, p.y, p.w, p.h)
    ctx.fill()
    if (!p.outline) return
    ctx.save()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.restore()
  }
  const drawPlatform = (p: Platform): void => {
    const drawn = artLayer ? kiteArt.platform?.(ctx, p, platformActive(w, p), p.channel === undefined ? null : channelColor(p.channel)) : false
    const painted = !!drawn
    // The kite build dresses its painted finish instead of labelling it, and so does the lantern
    // build's festival dais; a plain painted lantern finish pad keeps the word.
    if (painted && (drawn === 'dressed' || !(paintedGame && p.finish))) return
    if (painted) {
      // Painted: only the label below.
    } else if (p.channel !== undefined) {
      const on = platformActive(w, p)
      ctx.save()
      ctx.strokeStyle = channelColor(p.channel)
      ctx.fillStyle = channelColor(p.channel)
      if (on) {
        // A motion-switched platform is always there; it dims while it stands still.
        if (!platformMoving(w, p)) ctx.globalAlpha = 0.6
        if (p.cloud && !p.finish) fillCloud(p); else ctx.fillRect(p.x, p.y, p.w, p.h)
      } else {
        // Switched off: a dashed ghost of where it will appear.
        ctx.globalAlpha = 0.55
        ctx.lineWidth = 2
        ctx.setLineDash([8, 6])
        if (p.cloud && !p.finish) { cloudPath(ctx, p.x + 1, p.y + 1, p.w - 2, p.h - 2); ctx.stroke() } else ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2)
      }
      ctx.restore()
      if (!on || !p.finish) return
    } else {
      ctx.fillStyle = FG
      if (p.cloud && !p.finish) fillCloud(p); else ctx.fillRect(p.x, p.y, p.w, p.h)
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
  // The finish is drawn last of the level, in front of every other platform, enemy and prop — only
  // the player goes over it (the lantern dais is wider than its platform and was overlapped).
  for (const p of w.platforms) if (!p.finish) drawPlatform(p)

  const buttons = w.level.buttons ?? []
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i]!
    // A spent one-time button stays pressed flat and dimmed: it has done its job.
    const spent = !!b.once && !!w.buttonsUsed?.[i]
    const on = channelOn(w, b.channel) || spent
    const left = (w.channels[b.channel] ?? 0) - w.time
    if (spent) ctx.globalAlpha = 0.5
    if (artLayer && kiteArt.button?.(ctx, b, on, channelColor(b.channel))) drawButtonMarks(ctx, b, on, left)
    else drawButton(ctx, b, on, left)
    ctx.globalAlpha = 1
  }
  for (const h of w.hazards) drawHazard(ctx, h, w)
  for (const p of w.platforms) if (p.finish) drawPlatform(p)

  if (!opts.hidePlayer) drawPlayer(ctx, w, t, dt)
  return camera
}
