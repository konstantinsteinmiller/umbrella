// ─── Canvas renderer (prototype look: white blocks on a dark field) ─────────

import { PLAYER_H, PLAYER_W, type World } from './engine'
import type { WindDef } from './levels'

const BG = '#1b2130'
const FG = '#ffffff'
const WIND = 'rgba(140, 200, 255, 0.10)'
const WIND_ARROW = 'rgba(170, 215, 255, 0.55)'

export interface Labels {
  finish: string
}

/** Fit the world into the canvas (letterboxed), returning scale + offset in device px. */
const camera = (w: World, cw: number, ch: number) => {
  const { w: ww, h: wh } = w.level.world
  const s = Math.min(cw / ww, ch / wh)
  return { s, ox: (cw - ww * s) / 2, oy: (ch - wh * s) / 2 }
}

const drawWind = (ctx: CanvasRenderingContext2D, wind: WindDef, time: number) => {
  ctx.fillStyle = WIND
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
  ctx.strokeStyle = WIND_ARROW
  ctx.lineWidth = 3
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

const drawUmbrella = (ctx: CanvasRenderingContext2D, w: World) => {
  const pl = w.player
  const cx = pl.x + PLAYER_W / 2
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

const drawPlayer = (ctx: CanvasRenderingContext2D, w: World) => {
  const pl = w.player
  ctx.save()
  if (w.phase === 'splat') {
    // Cartoony splat: squashed flat and wide.
    const k = Math.min(1, w.phaseTime / 0.08)
    const sw = PLAYER_W * (1 + 1.6 * k)
    const sh = PLAYER_H * (1 - 0.8 * k)
    ctx.fillStyle = FG
    ctx.fillRect(pl.x + PLAYER_W / 2 - sw / 2, pl.y + PLAYER_H - sh, sw, sh)
    ctx.restore()
    return
  }
  if (w.phase === 'win') {
    // Dance: hop and wiggle.
    const t = w.phaseTime
    const hop = Math.abs(Math.sin(t * 9)) * 14
    const tilt = Math.sin(t * 9) * 0.25
    ctx.translate(pl.x + PLAYER_W / 2, pl.y + PLAYER_H - hop)
    ctx.rotate(tilt)
    ctx.fillStyle = FG
    ctx.fillRect(-PLAYER_W / 2, -PLAYER_H, PLAYER_W, PLAYER_H)
    ctx.restore()
    return
  }
  ctx.fillStyle = FG
  ctx.fillRect(pl.x, pl.y, PLAYER_W, PLAYER_H)
  // Eye shows facing.
  ctx.fillStyle = BG
  ctx.fillRect(pl.x + PLAYER_W / 2 + pl.facing * 5 - 2, pl.y + 9, 4, 6)
  drawUmbrella(ctx, w)
  ctx.restore()
}

export const render = (ctx: CanvasRenderingContext2D, w: World, labels: Labels): void => {
  const { width: cw, height: ch } = ctx.canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#0d1018'
  ctx.fillRect(0, 0, cw, ch)
  const { s, ox, oy } = camera(w, cw, ch)
  ctx.setTransform(s, 0, 0, s, ox, oy)
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, w.level.world.w, w.level.world.h)

  for (const wind of w.level.winds) drawWind(ctx, wind, w.time)

  // Zoomed-out levels scale the labels back up so they stay readable.
  const zoomOut = w.level.world.w / 1280
  for (const p of w.platforms) {
    ctx.fillStyle = FG
    ctx.fillRect(p.x, p.y, p.w, p.h)
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

  drawPlayer(ctx, w)
}
