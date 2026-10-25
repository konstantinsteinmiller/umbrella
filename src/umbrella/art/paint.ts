// ─── Kite art: drawing the painted sheets ───────────────────────────────────
//
// KITE ONLY (loaded by art/install.ts behind `isKite`). Fills the `kiteArt`
// slots the vector painters ask first. Every function returns false when it
// cannot draw the painted version right now — the sheet was never painted,
// has not decoded yet, the art is switched off — and the vector drawing then
// draws itself, exactly as in every other build.
//
// REGISTRATION: a frame is blitted through the same `box` (manifest.ts) the
// art bench drew the vector reference through, so the painting stands where
// the drawing stood. Animation is the sheets' frames; what must stay
// IDENTICAL across motion (a pillar's body, a fan's rotor, a pupil that
// follows Pweeg) is one painted part moved by code (ANIMATE.md).
import { contactOf, type Hazard, type World } from '../engine'
import { channelColor } from '../renderer'
import type { ButtonDef, CheckpointDef, PlatformDef, WindDef } from '../levels'
import { drawPrickbaitPupils, walldorfEyes, type PweegLook, type UmbrellaLook } from '../characters'
import { boxOf, BUTTON_W, FAN_SIZE, PRICKBAIT_R, sheetById, SPIKE, type AnimDef, type SheetDef } from './manifest'
import { hasSheet, setReady, sheetImage } from './sheets'
import type { KiteArt } from './hooks'
import { drawFinishDressing } from './kiteFinish'

// ─── The switch ─────────────────────────────────────────────────────────────

/** Dev-only `?art=off` — read once per load. */
const urlOff = (): boolean => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  try { return new URL(window.location.href).searchParams.get('art') === 'off' } catch { return false }
}
let paintedOn = !urlOff()
/** Painted art on or off, live (the playground's A/B, the bench's references). */
export const setPaintedArt = (on: boolean): void => { paintedOn = on }
export const paintedArt = (): boolean => paintedOn

// ─── Frames ─────────────────────────────────────────────────────────────────

const PWEEG_W = 24
const PWEEG_H = 36

/** Frame `i` of an animation at time `t` (s), looped or held on its last frame. */
export const animFrame = (a: AnimDef, t: number): number => {
  const n = a.frames.length
  const k = Math.floor(Math.max(0, t) * a.fps)
  return a.frames[a.loop === false ? Math.min(n - 1, k) : ((k % n) + n) % n]!
}
/** Frame of a cycle at phase `p` (0..1). */
const phaseFrame = (a: AnimDef, p: number): number => {
  const n = a.frames.length
  return a.frames[((Math.floor((((p % 1) + 1) % 1) * n) % n) + n) % n]!
}

const sheet = (id: string): SheetDef => sheetById(id)!

/** Blit frame `frame` of sheet `s` with its anchor on (x, y), scaled (sx, sy)
 *  from the reference size, mirrored when `flipX`. */
export const blit = (ctx: CanvasRenderingContext2D, s: SheetDef, img: CanvasImageSource & { width: number; height: number }, frame: number, x: number, y: number, sx = 1, sy = 1, flipX = false, flipY = false): void => {
  const box = boxOf(s, frame)
  const fw = img.width / s.cols
  const fh = img.height / s.rows
  const c = frame % s.cols
  const r = Math.floor(frame / s.cols)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(flipX ? -sx : sx, flipY ? -sy : sy)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, c * fw, r * fh, fw, fh, -box.ax * box.size, -box.ay * box.size, box.size, box.size)
  ctx.restore()
}

/** A cell of the sheet drawn into a world rectangle (tiles, pillars). */
const cell = (ctx: CanvasRenderingContext2D, s: SheetDef, img: HTMLImageElement | HTMLCanvasElement, col: number, row: number, x: number, y: number, w: number, h: number, inset = 0): void => {
  if (w <= 0 || h <= 0) return
  const fw = img.width / s.cols
  const fh = img.height / s.rows
  ctx.drawImage(img, col * fw + inset, row * fh + inset, fw - inset * 2, fh - inset * 2, x, y, w, h)
}

/** A frame recoloured: the painted neutral (a button cap, a switched block)
 *  multiplied by its channel colour, alpha kept. Cached per (sheet, colour). */
const tinted = new Map<string, { src: HTMLImageElement; canvas: HTMLCanvasElement }>()
const tintOf = (id: string, img: HTMLImageElement, color: string): HTMLCanvasElement | null => {
  const key = `${id}|${color}`
  const have = tinted.get(key)
  if (have && have.src === img) return have.canvas
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const g = c.getContext('2d')
  if (!g) return null
  g.drawImage(img, 0, 0)
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  g.globalCompositeOperation = 'destination-in'
  g.drawImage(img, 0, 0)
  tinted.set(key, { src: img, canvas: c })
  return c
}

// ─── Sets: a thing is painted only when all of it is ────────────────────────

const PWEEG_CORE = ['pweeg-idle', 'pweeg-walk', 'pweeg-hover', 'pweeg-fall', 'pweeg-terminal', 'pweeg-cheer', 'pweeg-flattened']
const CHAD_CORE = ['chad-idle', 'chad-walk', 'chad-hover']
const WALLDORF = ['walldorf-body', 'walldorf-face']
const PLATFORMS = ['platform', 'platform-finish', 'platform-switch']
/** Every shipped sheet decoded, and the core ones shipped at all. */
const ready = (core: string[], extra: string[] = []): boolean => setReady(core) && setReady(extra.filter(hasSheet))

// ─── Pweeg, Chad, the umbrella ──────────────────────────────────────────────

// The kite build's player is a KITE (Pweeg-Kite, Chad-Kite): drawn from the
// kite sheets when they are all in, else from the Pweeg / Chad sheets, else
// the vector drawing. A kite IS the umbrella (closed = furled, deployed =
// open), so the umbrella drawn right after a kite figure is not drawn.
const KITE_CORE = ['pweeg-kite-idle', 'pweeg-kite-walk', 'pweeg-kite-hover', 'pweeg-kite-fall', 'pweeg-kite-terminal', 'pweeg-kite-broken', 'pweeg-kite-cheer', 'pweeg-kite-flattened']
const CHAD_KITE_CORE = ['chad-kite-idle', 'chad-kite-walk', 'chad-kite-hover']

/** Which sheets draw this figure right now, or null for the vector drawing. */
const figureSet = (chad: boolean): { p: string; kite: boolean } | null => {
  if (chad) return ready(CHAD_KITE_CORE) ? { p: 'chad-kite', kite: true } : ready(CHAD_CORE) ? { p: 'chad', kite: false } : null
  if (ready(KITE_CORE, ['pweeg-kite-front', 'pweeg-kite-destroyed'])) return { p: 'pweeg-kite', kite: true }
  return ready(PWEEG_CORE, ['pweeg-front', 'pweeg-destroyed']) ? { p: 'pweeg', kite: false } : null
}

/** The last figure drawn was a kite: every caller draws the umbrella right
 *  after the figure, and for a kite that umbrella is the kite itself. */
let kiteDrawn = false

/** The kite dance: the sheet's arms-up frames, forwards and back. */
const CHEER_LOOP = [5, 6, 7, 8, 9, 8, 7, 6]

const pweeg = (ctx: CanvasRenderingContext2D, x: number, y: number, look: PweegLook): boolean => {
  kiteDrawn = false
  if (!paintedOn) return false
  const chad = !!look.shades
  const set = figureSet(chad)
  if (!set) return false
  const { p } = set
  let id: string
  let frame: number
  const s = (n: string) => sheet(`${p}-${n}`)
  switch (look.pose) {
    case 'stand': {
      if (look.front && !chad && hasSheet(`${p}-front`)) {
        const f = s('front')
        id = f.id
        frame = look.blink ? f.anims.blink!.frames[0]! : animFrame(f.anims.front!, look.time)
      } else {
        const f = s('idle')
        id = f.id
        frame = look.blink && !chad ? 12 : animFrame(f.anims.idle!, look.time)
      }
      break
    }
    case 'walk':
      id = s('walk').id
      // The painted frames are each drawn fresh, so cycling all 16 at the vector
      // walk's cadence twitches the hands and feet. A kite walks on every other
      // frame at half the pace: a slower, steadier waddle.
      frame = set.kite
        ? phaseFrame({ ...s('walk').anims.walk!, frames: s('walk').anims.walk!.frames.filter((_, i) => i % 2 === 0) }, (look.step ?? 0) / (Math.PI * 4))
        : phaseFrame(s('walk').anims.walk!, (look.step ?? 0) / (Math.PI * 2))
      break
    case 'hold': id = s('hover').id; frame = animFrame(s('hover').anims.hover!, look.time); break
    case 'flail':
      if (chad) return false
      // A kite broken by opening it at speed flaps torn; a closed one flutters.
      if (set.kite && look.broken) { id = s('broken').id; frame = animFrame(s('broken').anims.broken!, look.time) } else { id = s('fall').id; frame = animFrame(s('fall').anims.fall!, look.time) }
      break
    case 'terminal': if (chad) return false; id = s('terminal').id; frame = animFrame(s('terminal').anims.terminal!, look.time); break
    case 'cheer':
      if (chad) return false
      id = s('cheer').id
      if (set.kite) {
        // Arms up on a steady bounce (the sheet's arms-up frames, slowly ping-ponged)
        // with a gentle rock, instead of racing through 16 different poses.
        const img = sheetImage(id)
        if (!img) return false
        const k = Math.floor(look.time * 5) % CHEER_LOOP.length
        const hop = Math.abs(Math.sin(look.time * Math.PI * 1.6))
        ctx.save()
        ctx.translate(x, y - hop * look.h * 0.16)
        ctx.rotate(Math.sin(look.time * Math.PI * 1.6) * 0.07)
        blit(ctx, sheet(id), img, CHEER_LOOP[k]!, 0, 0, look.w / PWEEG_W, look.h / PWEEG_H, false)
        ctx.restore()
        kiteDrawn = true
        return true
      }
      frame = phaseFrame(s('cheer').anims.cheer!, (look.time * 9) / Math.PI)
      break
    default: return false
  }
  const img = sheetImage(id)
  if (!img) return false
  blit(ctx, sheet(id), img, frame, x, y, look.w / PWEEG_W, look.h / PWEEG_H, look.facing < 0 && !look.front)
  kiteDrawn = set.kite
  return true
}

const splat = (ctx: CanvasRenderingContext2D, fx: number, fy: number, look: PweegLook, t: number, hit: boolean): boolean => {
  if (!paintedOn) return false
  const set = figureSet(false)
  if (!set) return false
  const sx = look.w / PWEEG_W
  const sy = look.h / PWEEG_H
  if (hit && hasSheet(`${set.p}-destroyed`)) {
    const s = sheet(`${set.p}-destroyed`)
    blit(ctx, s, sheetImage(s.id)!, animFrame(s.anims.poof!, t), fx, fy, sx, sy, look.facing < 0)
    return true
  }
  const s = sheet(`${set.p}-flattened`)
  const squash = s.anims.squash!
  const intro = squash.frames.length / squash.fps
  const frame = t < intro ? animFrame(squash, t) : animFrame(s.anims.flat!, t - intro)
  blit(ctx, s, sheetImage(s.id)!, frame, fx, fy, sx, sy, look.facing < 0)
  return true
}

const umbrella = (ctx: CanvasRenderingContext2D, x: number, y: number, look: UmbrellaLook): boolean => {
  // The kite just drawn is the umbrella: nothing more to draw.
  if (kiteDrawn) {
    kiteDrawn = false
    return true
  }
  if (!paintedOn) return false
  const img = sheetImage('umbrella')
  if (!img) return false
  const s = sheet('umbrella')
  const frame = look.state === 'open' ? animFrame(s.anims.open!, look.time) : look.state === 'furled' ? s.anims.furled!.frames[0]! : animFrame(s.anims.broken!, look.time)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(look.tilt)
  blit(ctx, s, img, frame, 0, 0)
  ctx.restore()
  return true
}

// ─── Enemies and hazards ────────────────────────────────────────────────────

/** When each bouncy Walldorf was last bumped (the squash and the surprised face). */
const bumpedAt = new WeakMap<Hazard, number>()
const wasBumping = new WeakMap<Hazard, boolean>()
const BUMP_TIME = 0.28

const walldorf = (ctx: CanvasRenderingContext2D, h: Hazard, w: World): boolean => {
  if (!ready(WALLDORF)) return false
  const body = sheet('walldorf-body')
  const face = sheet('walldorf-face')
  const bodyImg = sheetImage(body.id)!
  const faceImg = sheetImage(face.id)!
  const pl = w.player
  const m = h.motion
  const lunge = m?.kind === 'lunge'
  const charge = lunge ? Math.sign(m.b.x - m.a.x) : 0
  const facing = (charge || Math.sign(pl.x + pl.w / 2 - (h.x + h.w / 2)) || 1) as 1 | -1
  if (h.bumping && !wasBumping.get(h)) bumpedAt.set(h, w.time)
  wasBumping.set(h, !!h.bumping)
  const sinceBump = w.time - (bumpedAt.get(h) ?? -99)
  const moving = Math.abs(h.dx) + Math.abs(h.dy) > 0.6
  const charging = lunge && moving && Math.sign(h.dx || 0) === Math.sign(m.b.x - m.a.x)

  // Body: one painted pillar per touch kind, its caps kept square and its
  // middle stretched — so it is the same Walldorf at any height. Motion is a
  // squash in code (a charge leans into it, a bump wobbles).
  const col = { deadly: 0, solid: 1, bounce: 2 }[contactOf(h)]
  let kx = 1
  let ky = 1
  if (sinceBump < BUMP_TIME) {
    const k = Math.sin((sinceBump / BUMP_TIME) * Math.PI) * (1 - sinceBump / BUMP_TIME)
    kx = 1 + 0.12 * k
    ky = 1 - 0.08 * k
  } else if (charging) {
    kx = 1.06
    ky = 0.97
  } else if (moving) {
    ky = 1 + 0.015 * Math.sin(w.time * 9)
  }
  const cx = h.x + h.w / 2
  const by = h.y + h.h
  ctx.save()
  ctx.translate(cx, by)
  ctx.scale(kx, ky)
  ctx.translate(-cx, -by)
  const cap = Math.min(h.w, h.h / 2)
  cell(ctx, body, bodyImg, col, 0, h.x, h.y, h.w, cap)
  cell(ctx, body, bodyImg, col, 1, h.x, h.y + cap - 0.5, h.w, h.h - cap * 2 + 1, 1)
  cell(ctx, body, bodyImg, col, 2, h.x, h.y + h.h - cap, h.w, cap)

  // Face: the bench's eye geometry, so the painted eyes sit where the drawn ones did.
  const eyes = walldorfEyes(h, facing)
  let frame: number
  if (sinceBump < BUMP_TIME) frame = animFrame(face.anims.bump!, sinceBump)
  else if (charging) frame = animFrame(face.anims.charge!, w.time)
  else if (lunge) frame = animFrame(face.anims.angry!, w.time)
  else {
    // Calm: breathes between its two open frames and blinks now and then
    // (each Walldorf on its own beat).
    const beat = (w.time + h.x * 0.013) % 3.4
    frame = beat < 0.17 ? animFrame(face.anims.blink!, beat) : animFrame(face.anims.calm!, w.time)
  }
  blit(ctx, face, faceImg, frame, eyes.ex, eyes.top, eyes.er / 9, eyes.er / 9, facing < 0)
  ctx.restore()
  return true
}

const prickbait = (ctx: CanvasRenderingContext2D, h: Hazard, w: World): boolean => {
  const img = sheetImage('prickbait')
  if (!img) return false
  const s = sheet('prickbait')
  const x = h.x + h.w / 2
  const y = h.y + h.h / 2
  const r = h.w / 2
  const moving = Math.abs(h.dx) + Math.abs(h.dy) > 0.3
  const lunging = h.motion?.kind === 'lunge' && moving
  const frame = lunging ? animFrame(s.anims.lunge!, w.time) : moving ? animFrame(s.anims.move!, w.time) : animFrame(s.anims.idle!, w.time + h.x * 0.01)
  // The move frames drift LEFT; flip for a Prickbait heading right. The
  // pupils are drawn live so they keep following Pweeg.
  blit(ctx, s, img, frame, x, y, r / PRICKBAIT_R, r / PRICKBAIT_R, moving && h.dx > 0)
  const pl = w.player
  drawPrickbaitPupils(ctx, x, y, r, pl.x + pl.w / 2, pl.y + pl.h / 2)
  return true
}

const fan = (ctx: CanvasRenderingContext2D, h: Hazard, w: World): boolean => {
  const img = sheetImage('fan')
  if (!img) return false
  const s = sheet('fan')
  const cx = h.x + h.w / 2
  const cy = h.y + h.h / 2
  const sx = h.w / FAN_SIZE
  const sy = h.h / FAN_SIZE
  blit(ctx, s, img, s.anims.housing!.frames[0]!, cx, cy, sx, sy)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(w.time * 18)
  blit(ctx, s, img, s.anims.rotor!.frames[0]!, 0, 0, sx, sy)
  ctx.restore()
  blit(ctx, s, img, s.anims.guard!.frames[0]!, cx, cy, sx, sy)
  return true
}

const spikes = (ctx: CanvasRenderingContext2D, h: Hazard): boolean => {
  const img = sheetImage('props')
  if (!img) return false
  const s = sheet('props')
  const n = Math.max(1, Math.round(h.w / SPIKE))
  const sw = h.w / n
  const down = h.facing === 'down'
  for (let i = 0; i < n; i++) {
    const frame = i % 2 ? s.anims.spikeB!.frames[0]! : s.anims.spikeA!.frames[0]!
    blit(ctx, s, img, frame, h.x + (i + 0.5) * sw, down ? h.y : h.y + h.h, sw / SPIKE, h.h / SPIKE, false, down)
  }
  return true
}

const hazard = (ctx: CanvasRenderingContext2D, h: Hazard, w: World): boolean => {
  if (!paintedOn) return false
  if (h.kind === 'pillar') return walldorf(ctx, h, w)
  if (h.kind === 'mine') return prickbait(ctx, h, w)
  if (h.kind === 'fan') return fan(ctx, h, w)
  if (h.kind === 'spikes') return spikes(ctx, h)
  return false
}

// ─── The world ──────────────────────────────────────────────────────────────

/** A nine-slice block on a world rectangle: corners `k` units, edges and
 *  centre stretched. */
const nine = (ctx: CanvasRenderingContext2D, s: SheetDef, img: HTMLImageElement | HTMLCanvasElement, x: number, y: number, w: number, h: number): void => {
  const k = Math.min(18, w / 2, h / 2)
  const xs = [x, x + k, x + w - k, x + w]
  const ys = [y, y + k, y + h - k, y + h]
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      // Stretched cells overlap their neighbours by half a unit (and sample a
      // pixel in from their edge) so no seam of background shows between them.
      const ox = c === 1 ? 0.5 : 0
      const oy = r === 1 ? 0.5 : 0
      cell(ctx, s, img, c, r, xs[c]! - ox, ys[r]! - oy, xs[c + 1]! - xs[c]! + ox * 2, ys[r + 1]! - ys[r]! + oy * 2, c === 1 || r === 1 ? 1 : 0)
    }
  }
}

const platform = (ctx: CanvasRenderingContext2D, p: PlatformDef, on: boolean, color: string | null): boolean => {
  if (!paintedOn || !ready(['platform'], PLATFORMS)) return false
  // A switched-off platform stays the dashed ghost the vector path draws.
  if (color !== null && !on) return false
  const id = p.finish ? 'platform-finish' : color !== null ? 'platform-switch' : 'platform'
  if (!hasSheet(id)) return false
  const s = sheet(id)
  const raw = sheetImage(id)!
  const img = color !== null && !p.finish ? tintOf(id, raw, color) : null
  nine(ctx, s, img ?? raw, p.x, p.y, p.w, p.h)
  if (p.finish) drawFinishDressing(ctx, p, performance.now() / 1000)
  return true
}

const button = (ctx: CanvasRenderingContext2D, b: ButtonDef, on: boolean, color: string): boolean => {
  if (!paintedOn) return false
  const raw = sheetImage('props')
  if (!raw) return false
  const s = sheet('props')
  const img = tintOf('props', raw, color) ?? raw
  const frame = on ? s.anims.buttonDown!.frames[0]! : s.anims.buttonUp!.frames[0]!
  blit(ctx, s, img as HTMLCanvasElement, frame, b.x + b.w / 2, b.y + b.h, b.w / BUTTON_W, b.h / 14)
  return true
}

const checkpoint = (ctx: CanvasRenderingContext2D, c: CheckpointDef, reached: boolean, time: number): boolean => {
  if (!paintedOn) return false
  const img = sheetImage('checkpoint')
  if (!img) return false
  const s = sheet('checkpoint')
  // The painted waves are separate drawings: stepping between them jerks. Play the
  // cycle forwards and back (no seam at the loop) and dissolve each frame into the
  // next so the flag moves continuously.
  const a = reached ? s.anims.reached! : s.anims.idle!
  const seq = [...a.frames, ...a.frames.slice(1, -1).reverse()]
  const q = Math.max(0, time) * (reached ? 7 : 2.4)
  const k = Math.floor(q)
  const f = q - k
  const cur = seq[k % seq.length]!
  blit(ctx, s, img, cur, c.x, c.y)
  ctx.save()
  ctx.globalAlpha = f
  blit(ctx, s, img, seq[(k + 1) % seq.length]!, c.x, c.y)
  ctx.restore()
  return true
}

// ─── Wind: soft fields, drifting wisps — never a hard rectangle ─────────────

/** A feathered square (alpha 1 in the middle, 0 at the rim) of one colour,
 *  nine-sliced over a current so its edge fades out instead of stopping. */
const feathers = new Map<string, HTMLCanvasElement>()
const feather = (rgb: string, ring: boolean): HTMLCanvasElement | null => {
  const key = `${rgb}|${ring}`
  const have = feathers.get(key)
  if (have) return have
  if (typeof document === 'undefined') return null
  const N = 96
  const c = document.createElement('canvas')
  c.width = c.height = N
  const g = c.getContext('2d')
  if (!g) return null
  const data = g.createImageData(N, N)
  const [r, gg, b] = rgb.split(',').map(Number)
  const third = N / 3
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Distance in from the nearest edge, in thirds: 0 at the rim, 1 a third in.
      const d = Math.min(x + 0.5, y + 0.5, N - x - 0.5, N - y - 0.5) / third
      const t = Math.min(1, d)
      const s = t * t * (3 - 2 * t)
      const a = ring ? Math.sin(Math.min(1, d) * Math.PI) * (d < 1 ? 1 : 0) : s
      const i = (y * N + x) * 4
      data.data[i] = r!
      data.data[i + 1] = gg!
      data.data[i + 2] = b!
      data.data[i + 3] = Math.round(a * 255)
    }
  }
  g.putImageData(data, 0, 0)
  feathers.set(key, c)
  return c
}

const softRect = (ctx: CanvasRenderingContext2D, tex: HTMLCanvasElement, x: number, y: number, w: number, h: number, f: number): void => {
  const t = tex.width / 3
  const xs = [x - f / 2, x + f / 2, x + w - f / 2, x + w + f / 2]
  const ys = [y - f / 2, y + f / 2, y + h - f / 2, y + h + f / 2]
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const dw = xs[c + 1]! - xs[c]!
      const dh = ys[r + 1]! - ys[r]!
      if (dw > 0 && dh > 0) ctx.drawImage(tex, c * t, r * t, t, t, xs[c]!, ys[r]!, dw, dh)
    }
  }
}

const NORMAL_RGB = '140,200,255'
// The designer's Super Stream is a deeper swirling blue wave.
const SUPER_RGB = '70,150,215'
const hexRgb = (hex: string): string => {
  const v = Number.parseInt(hex.slice(1), 16)
  return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`
}

/** A cheap deterministic hash of a lane, so each wisp keeps its own pace. */
const rnd = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const wind = (ctx: CanvasRenderingContext2D, live: WindDef, def: WindDef, w: World): boolean => {
  // The soft field rides with the painted wisps: no wisps sheet, the vector current.
  const img = paintedOn ? sheetImage('wind-wisps') : null
  if (!img) return false
  const sup = !!live.super
  const f = Math.max(10, Math.min(56, live.w / 2, live.h / 2))
  if (live.speed > 0) {
    const tex = feather(sup ? SUPER_RGB : NORMAL_RGB, false)
    if (!tex) return false
    ctx.save()
    ctx.globalAlpha = sup ? 0.17 : 0.13
    softRect(ctx, tex, live.x, live.y, live.w, live.h, f)
    ctx.restore()

    // Wisps drift along the flow in lanes; each fades in after it enters and
    // out before it leaves, and lanes near the sides are fainter — so the
    // current has no edge anywhere, only a thinning.
    const vertical = live.dir === 'up' || live.dir === 'down'
    const sign = live.dir === 'up' || live.dir === 'left' ? -1 : 1
    const along = vertical ? live.h : live.w
    const across = vertical ? live.w : live.h
    const angle = live.dir === 'right' ? 0 : live.dir === 'left' ? Math.PI : live.dir === 'down' ? Math.PI / 2 : -Math.PI / 2
    const lanes = Math.max(1, Math.round(across / 52))
    const gap = across / lanes
    const wispLen = Math.min(80, along * 0.6)
    const per = Math.max(1, Math.round(along / 180))
    const s = sheet('wind-wisps')
    const variants = sup ? s.anims.super!.frames : s.anims.normal!.frames
    ctx.save()
    for (let l = 0; l < lanes; l++) {
      const c = gap * (l + 0.5)
      const edgeAcross = Math.min(c, across - c) / Math.max(1, Math.min(across / 2, 60))
      const laneAlpha = Math.min(1, edgeAcross)
      for (let k = 0; k < per; k++) {
        const seed = l * 7 + k * 13 + def.x * 0.01 + def.y * 0.017
        const speed = live.speed * (0.32 + rnd(seed) * 0.3)
        const period = along + wispLen
        const head = ((w.time * speed + rnd(seed + 1) * period + (k * period) / per) % period + period) % period
        const p = head - wispLen / 2
        const life = Math.min(1, Math.max(0, p / (along * 0.25)), Math.max(0, (along - p) / (along * 0.25)))
        const a = life * laneAlpha * (sup ? 0.85 : 0.7)
        if (a <= 0.02) continue
        const pos = sign < 0 ? along - p : p
        const wob = Math.sin(w.time * 2 + seed) * gap * 0.12
        const x = vertical ? live.x + c + wob : live.x + pos
        const y = vertical ? live.y + pos : live.y + c + wob
        ctx.globalAlpha = a
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(angle)
        const k2 = wispLen / 64
        blit(ctx, s, img, variants[Math.floor(rnd(seed + 2) * variants.length)]!, 0, 0, k2, k2)
        ctx.restore()
      }
    }
    ctx.restore()
  }
  // A switchable current wears its channel's colour as a soft glowing rim.
  if (def.channel !== undefined && def.switched) {
    const ring = feather(hexRgb(channelColor(def.channel)), true)
    if (ring) {
      ctx.save()
      ctx.globalAlpha = live.speed > 0 ? 0.55 : 0.3
      softRect(ctx, ring, def.x, def.y, def.w, def.h, Math.max(10, Math.min(28, def.w / 2, def.h / 2)))
      ctx.restore()
    }
  }
  return true
}


// ─── The slots ──────────────────────────────────────────────────────────────

export const KITE_PAINTERS: Required<KiteArt> = {
  pweeg,
  umbrella,
  splat,
  hazard,
  wind: (ctx, live, def, w) => wind(ctx, live, def, w),
  platform,
  button,
  checkpoint
}
