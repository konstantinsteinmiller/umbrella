// ─── Kite art: drawing the painted sheets ───────────────────────────────────
//
// KITE AND LANTERN ONLY (loaded by art/install.ts behind `artLayer`). Fills the `kiteArt`
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
import { contactOf, STAR_R, type Hazard, type World } from '../engine'
import { channelColor, type Camera } from '../renderer'
import { isLantern } from '../kite'
import { DEFAULT_COLLECT_SHAPE, type ButtonDef, type CheckpointDef, type GateDef, type PlatformDef, type StarDef, type WindDef } from '../levels'
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
  const size = box.drawSize ?? box.size
  ctx.drawImage(img, c * fw, r * fh, fw, fh, -box.ax * size, -box.ay * size, size, size)
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
  // An umbrella opened on a platform deploys the kite where he stands.
  const pose = set.kite && look.open && (look.pose === 'stand' || look.pose === 'walk') ? 'hold' : look.pose
  switch (pose) {
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
      // The lantern's painted cheer, like the kite's, is played as its arms-up frames on a bounce.
      if (set.kite || isLantern) {
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
        kiteDrawn = set.kite
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

/** Multiplied over the Walldorf body to make the charging one read as angry at a glance. */
const ANGRY_TINT = '#ff8a78'

/** When each bouncy Walldorf was last bumped (the squash and the surprised face). */
const bumpedAt = new WeakMap<Hazard, number>()
const wasBumping = new WeakMap<Hazard, boolean>()
const BUMP_TIME = 0.28

const walldorf = (ctx: CanvasRenderingContext2D, h: Hazard, w: World): boolean => {
  if (!ready(WALLDORF)) return false
  const body = sheet('walldorf-body')
  const face = sheet('walldorf-face')
  const bodyRaw = sheetImage(body.id)!
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
  // The angry Walldorf (one that charges) is a warm red-brown; the calm bouncy pusher keeps the sheet's colours.
  const bodyImg = lunge ? tintOf(body.id, bodyRaw as HTMLImageElement, ANGRY_TINT) ?? bodyRaw : bodyRaw
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

/** Which way each Prickbait last clearly moved. */
const prickHeading = new WeakMap<Hazard, 1 | -1>()
const prickMoving = new WeakMap<Hazard, boolean>()

// ─── The lantern mine's blast ───────────────────────────────────────────────
//
// A paper firecracker going off: a white-gold flash, a folded-paper starburst that punches out and
// folds away, a cream shock ring, the mine's own red paper shards and spike cones flung out under
// gravity, gold sparks, and cream smoke puffs drifting up. Every piece is placed from the mine's
// seed, so the same mine always blows up the same way. About 0.8 s long (MINE_DEATH_HOLD).
const BLAST_INK = '#2a1d3a'
const mineBlast = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, seed: number): void => {
  const ease = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3)
  ctx.save()
  ctx.translate(x, y)
  ctx.lineJoin = 'round'
  // Smoke first, so everything else bursts out in front of it.
  for (let i = 0; i < 6; i++) {
    const u = (t - 0.12 - i * 0.02) / 0.7
    if (u <= 0 || u >= 1) continue
    const a = (i / 6) * Math.PI * 2 + rnd(seed + i) * 0.8
    const d = r * (0.6 + 0.9 * ease(u))
    const pr = r * (0.35 + 0.25 * rnd(seed + i + 9)) * (0.7 + 0.8 * ease(u))
    ctx.globalAlpha = 0.85 * (1 - u)
    ctx.fillStyle = '#efe2c8'
    ctx.strokeStyle = BLAST_INK
    ctx.lineWidth = Math.max(1, r * 0.05)
    ctx.beginPath()
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d - r * 0.9 * u, pr, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  // The flash.
  if (t < 0.1) {
    ctx.globalAlpha = 1 - t / 0.1
    ctx.fillStyle = '#fff6d8'
    ctx.beginPath()
    ctx.arc(0, 0, r * (1.2 + 3 * t), 0, Math.PI * 2)
    ctx.fill()
  }
  // The starburst: three folded-paper stars, red under orange under gold, out then folding away.
  const grow = ease(t / 0.16)
  const fold = Math.max(0, 1 - Math.max(0, t - 0.22) / 0.26)
  if (fold > 0) {
    ;[['#d03a2c', 1.9], ['#ff8a2a', 1.45], ['#ffd36a', 0.95]].forEach(([col, k], layer) => {
      const R = r * (k as number) * grow * fold
      const n = 10
      ctx.globalAlpha = 1
      ctx.fillStyle = col as string
      ctx.strokeStyle = BLAST_INK
      ctx.lineWidth = Math.max(1, r * 0.06)
      ctx.beginPath()
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2 + layer * 0.31 + seed
        const rr = i % 2 ? R * 0.5 : R * (0.85 + 0.3 * rnd(seed + i + layer * 20))
        if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
        else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })
  }
  // The shock ring.
  if (t < 0.36) {
    const u = t / 0.36
    ctx.globalAlpha = 0.8 * (1 - u)
    ctx.strokeStyle = '#fff2d0'
    ctx.lineWidth = Math.max(1.5, r * 0.18 * (1 - u))
    ctx.beginPath()
    ctx.arc(0, 0, r * (1 + 2.4 * ease(u)), 0, Math.PI * 2)
    ctx.stroke()
  }
  // Shards: red body facets and the six spike cones, flung out, spinning, falling.
  for (let i = 0; i < 12; i++) {
    const u = t / 0.8
    if (u >= 1) break
    const cone = i < 6
    const a = cone ? (i / 6) * Math.PI * 2 - Math.PI / 2 : rnd(seed + i * 3) * Math.PI * 2
    const v = r * (cone ? 4.2 : 3 + 2 * rnd(seed + i * 5))
    const px = Math.cos(a) * v * t
    const py = Math.sin(a) * v * t + r * 5 * t * t
    const size = r * (cone ? 0.42 : 0.24 + 0.16 * rnd(seed + i * 7))
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(a + Math.PI / 2 + t * (cone ? 4 : 9) * (rnd(seed + i) < 0.5 ? -1 : 1))
    ctx.globalAlpha = Math.min(1, (1 - u) * 1.8)
    ctx.fillStyle = cone ? '#8e2a22' : i % 2 ? '#d03a2c' : '#b33326'
    ctx.strokeStyle = BLAST_INK
    ctx.lineWidth = Math.max(1, r * 0.05)
    ctx.beginPath()
    if (cone) {
      ctx.moveTo(0, -size)
      ctx.lineTo(size * 0.45, size * 0.4)
      ctx.lineTo(-size * 0.45, size * 0.4)
    } else {
      ctx.moveTo(-size, -size * 0.5)
      ctx.lineTo(size * 0.8, -size * 0.7)
      ctx.lineTo(size * 0.3, size * 0.8)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
  // Sparks: short gold streaks racing out.
  if (t < 0.34) {
    const u = t / 0.34
    ctx.globalAlpha = 1 - u
    ctx.strokeStyle = '#ffd36a'
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(1, r * 0.08)
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rnd(seed + i * 11) * 0.4
      const d0 = r * (1 + 3 * ease(u))
      const d1 = d0 + r * 0.5 * (1 - u)
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * d0, Math.sin(a) * d0)
      ctx.lineTo(Math.cos(a) * d1, Math.sin(a) * d1)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** The painted fuse's tip, in mine radii from its centre: where the sheet's own gold spark sits,
 *  measured once per frame from the decoded sheet (the moving frames are squashed, so their tip sits
 *  elsewhere than the idle ones'). FUSE_TIP is the fallback when a frame cannot be read. */
const FUSE_TIP = { x: 0.78, y: -1.13 }
const fuseTips = new WeakMap<HTMLImageElement, Array<{ x: number; y: number }>>()
const fuseTipOf = (img: HTMLImageElement, s: SheetDef, frame: number): { x: number; y: number } => {
  let tips = fuseTips.get(img)
  if (!tips) {
    tips = []
    try {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const g = c.getContext('2d', { willReadFrequently: true })
      if (g) {
        g.drawImage(img, 0, 0)
        const fw = img.width / s.cols
        const fh = img.height / s.rows
        const unit = (boxOf(s, 0).drawSize ?? boxOf(s, 0).size) / PRICKBAIT_R
        for (let i = 0; i < s.cols * s.rows; i++) {
          const d = g.getImageData((i % s.cols) * fw, Math.floor(i / s.cols) * fh, fw, fh / 2).data
          // The spark: gold pixels in the top half, the topmost cluster of them.
          const pts: Array<[number, number]> = []
          for (let k = 0; k < d.length; k += 4) {
            if (d[k + 3]! > 120 && d[k]! > 200 && d[k + 1]! > 150 && d[k + 2]! < 130) pts.push([(k / 4) % fw, Math.floor(k / 4 / fw)])
          }
          if (!pts.length) { tips.push(FUSE_TIP); continue }
          const top = Math.min(...pts.map((q) => q[1]))
          const near = pts.filter((q) => q[1] < top + fh * 0.12)
          const mx = near.reduce((t, q) => t + q[0], 0) / near.length
          const my = near.reduce((t, q) => t + q[1], 0) / near.length
          tips.push({ x: (mx / fw - 0.5) * unit, y: (my / fh - 0.5) * unit })
        }
      }
    } catch { /* the fallback tip */ }
    fuseTips.set(img, tips)
  }
  return tips[frame] ?? FUSE_TIP
}
/** The lit fuse: a warm glow, a spark star whose rays flicker, and tiny embers popping off the tip.
 *  It burns IN PLACE at the tip — nothing creeps down the fuse — so it loops for ever. */
const fuseSpark = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void => {
  const R = r * 0.17
  const flick = 0.75 + 0.25 * Math.sin(t * 31) * Math.sin(t * 17 + 1.3)
  ctx.save()
  ctx.translate(x, y)
  // Glow.
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 2.4)
  glow.addColorStop(0, `rgba(255, 214, 120, ${0.55 * flick})`)
  glow.addColorStop(1, 'rgba(255, 140, 40, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(0, 0, R * 2.4, 0, Math.PI * 2)
  ctx.fill()
  // The spark star: eight rays, each flickering on its own.
  ctx.fillStyle = '#ffd36a'
  ctx.strokeStyle = '#ff8a2a'
  ctx.lineWidth = Math.max(1, r * 0.03)
  ctx.beginPath()
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + t * 2.2
    const ray = R * (0.75 + 0.45 * Math.abs(Math.sin(t * (13 + i) + i * 2.1)))
    const rr = i % 2 ? R * 0.38 : ray
    if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#fff6d8'
  ctx.beginPath()
  ctx.arc(0, 0, R * 0.3 * flick, 0, Math.PI * 2)
  ctx.fill()
  // Embers: each pops off the tip on its own short cycle, flies a little way out and fades.
  ctx.lineCap = 'round'
  for (let i = 0; i < 5; i++) {
    const cycle = 0.32 + 0.1 * rnd(i + 3)
    const phase = (t / cycle + rnd(i + 7)) % 1
    const slot = Math.floor(t / cycle + rnd(i + 7))
    const a = -Math.PI / 2 + (rnd(slot * 5 + i) - 0.5) * 2.4
    const d = R * (0.8 + 2.2 * phase)
    ctx.globalAlpha = 1 - phase
    ctx.strokeStyle = phase < 0.4 ? '#fff2c0' : '#ffb24a'
    ctx.lineWidth = Math.max(1, r * 0.035 * (1 - phase * 0.6))
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d)
    ctx.lineTo(Math.cos(a) * (d + R * 0.35), Math.sin(a) * (d + R * 0.35))
    ctx.stroke()
  }
  ctx.restore()
}

/** Where each mine Pweeg ran into went off: pinned there for the rest of the death, even if the
 *  hazard keeps drifting. A restart builds new hazards, so nothing has to be cleared by hand. */
const blasts = new WeakMap<Hazard, { x: number; y: number }>()
const blastOf = (h: Hazard, w: World): { x: number; y: number } | undefined => {
  if (w.phase !== 'splat') {
    blasts.delete(h)
    return undefined
  }
  const pl = w.player
  if (!blasts.has(h) && pl.x < h.x + h.w + 2 && pl.x + pl.w > h.x - 2 && pl.y < h.y + h.h + 2 && pl.y + pl.h > h.y - 2) {
    blasts.set(h, { x: h.x + h.w / 2, y: h.y + h.h / 2 })
  }
  return blasts.get(h)
}

const prickbait = (ctx: CanvasRenderingContext2D, h: Hazard, w: World): boolean => {
  const img = sheetImage('prickbait')
  if (!img) return false
  const s = sheet('prickbait')
  const x = h.x + h.w / 2
  const y = h.y + h.h / 2
  const r = h.w / 2
  // The lantern mine is a firecracker: touched, it goes off — the mine is gone, only its blast is left.
  const blast = isLantern ? blastOf(h, w) : undefined
  if (blast) {
    mineBlast(ctx, blast.x, blast.y, r, w.phaseTime, (blast.x * 0.013 + blast.y * 0.007) % 1)
    return true
  }
  // Moving / idle with a margin each way, so a slow mine does not flip between the two looks every frame.
  const speed = Math.abs(h.dx) + Math.abs(h.dy)
  const moving = speed > (prickMoving.get(h) ? 0.15 : 0.5)
  prickMoving.set(h, moving)
  const lunging = h.motion?.kind === 'lunge' && moving
  const frame = lunging ? animFrame(s.anims.lunge!, w.time) : moving ? animFrame(s.anims.move!, w.time) : animFrame(s.anims.idle!, w.time + h.x * 0.01)
  // The move frames drift LEFT; flip for a Prickbait heading right. The
  // pupils are drawn live so they keep following Pweeg.
  // The move frames drift LEFT. Which way it heads is remembered and changes only after a clear
  // push the other way, so a mine turning round (dx crossing zero every few frames) never flickers.
  if (Math.abs(h.dx) > 0.5) prickHeading.set(h, h.dx > 0 ? 1 : -1)
  const flip = moving && prickHeading.get(h) === 1
  blit(ctx, s, img, frame, x, y, r / PRICKBAIT_R, r / PRICKBAIT_R, flip)
  if (isLantern) {
    const tip = fuseTipOf(img as HTMLImageElement, s, frame)
    fuseSpark(ctx, x + (flip ? -1 : 1) * r * tip.x, y + r * tip.y, r, w.time + h.x * 0.013)
  }
  const pl = w.player
  drawPrickbaitPupils(ctx, x, y, r, pl.x + pl.w / 2, pl.y + pl.h / 2)
  // The lantern mine's angry brows are drawn live like its pupils: one painting never kept them the
  // same across sixteen panels. They slant down toward the middle, harder while it lunges.
  if (isLantern) {
    const slant = lunging ? 0.17 : 0.11
    ctx.save()
    ctx.strokeStyle = BLAST_INK
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(1.5, r * 0.11)
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(x + side * r * 0.45, y - r * (0.22 + slant))
      ctx.lineTo(x + side * r * 0.1, y - r * 0.2)
      ctx.stroke()
    }
    ctx.restore()
  }
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

const platform = (ctx: CanvasRenderingContext2D, p: PlatformDef, on: boolean, color: string | null): boolean | 'dressed' => {
  if (!paintedOn || !ready(['platform'], PLATFORMS)) return false
  // A switched-off platform stays the dashed ghost the vector path draws.
  if (color !== null && !on) return false
  // The lantern finish is the concept's festival dais, dressed as the goal it is (no FINISH word).
  if (p.finish && isLantern && finishDais(ctx, p, performance.now() / 1000)) return 'dressed'
  const id = p.finish ? 'platform-finish' : color !== null ? 'platform-switch' : 'platform'
  if (!hasSheet(id)) return false
  const s = sheet(id)
  const raw = sheetImage(id)!
  const img = color !== null && !p.finish ? tintOf(id, raw, color) : null
  nine(ctx, s, img ?? raw, p.x, p.y, p.w, p.h)
  // The kite build's flags and bunting; the lantern pad is its own goal (and keeps its label).
  if (p.finish && !isLantern) drawFinishDressing(ctx, p, performance.now() / 1000)
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
// The designer's Super Stream is a deeper swirling blue wave; the lantern
// build's is a fierce orange firework ribbon (the vector game's orange arrows).
const SUPER_RGB = isLantern ? '255,138,42' : '70,150,215'
const hexRgb = (hex: string): string => {
  const v = Number.parseInt(hex.slice(1), 16)
  return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`
}

/** A cheap deterministic hash of a lane, so each wisp keeps its own pace. */
const rnd = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// ─── Lantern wind: gust streaks ─────────────────────────────────────────────
//
// The designer's gusts: long thin strokes running WITH the current, each a gentle fixed bow that
// swells in the middle and thins to a point, led by a small curl at its downstream end. A streak never
// changes shape and never moves across its lane: it only travels downstream, and every streak in a
// current travels at the same pace — the current's own speed, the one it pushes the umbrella with.
// Many streaks of different lengths share a box, and they fade in and out near the box's ends —
// never cut off at an edge.
interface Streak { pts: Array<[number, number]>; widths: number[] }
/** A streak's centreline in its own frame, from x = 0 (its downstream end) back along -x: a curl of
 *  radius `r` leading, then the body with a bow of `bow`, thinning to its tail. Built once per
 *  shape and cached. */
const streakShapes = new Map<string, Streak>()
const streakOf = (len: number, bow: number, r: number, side: 1 | -1, width: number): Streak => {
  const key = `${Math.round(len)}|${bow.toFixed(1)}|${r.toFixed(1)}|${side}|${width.toFixed(2)}`
  const have = streakShapes.get(key)
  if (have) return have
  const pts: Array<[number, number]> = []
  const widths: number[] = []
  const body = Math.max(8, len - r * 1.6)
  const n = Math.max(8, Math.round(body / 6))
  for (let i = 0; i <= n; i++) {
    const u = i / n
    pts.push([-u * body, side * bow * Math.sin(Math.PI * u)])
    // Thin at the head, fullest a third of the way back, thinning into the curl.
    widths.push(0.5 + width * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.4 + 0.02)), 0.7) * (1 - 0.55 * u))
  }
  // The curl: the line keeps going back, then turns round towards its side and in.
  const [tx, ty] = pts[pts.length - 1]!
  const cx = tx
  const cy = ty + side * r
  const turns = 0.78
  const m = 14
  for (let i = 1; i <= m; i++) {
    const a = (i / m) * turns * Math.PI * 2
    const rr = r * (1 - 0.25 * (i / m))
    pts.push([cx - Math.sin(a) * rr, cy - side * Math.cos(a) * rr])
    widths.push(0.5 + width * 0.4 * (1 - i / m))
  }
  // Turned half round in place: the curl LEADS at the downstream end and the line trails behind
  // it, so the gust rises curl-first. x stays within [minX, 0], so the head is still at x = 0.
  const minX = Math.min(...pts.map((p) => p[0]))
  const out = { pts: pts.map(([x, y]): [number, number] => [minX - x, -y]), widths }
  if (streakShapes.size > 400) streakShapes.clear()
  streakShapes.set(key, out)
  return out
}

/** The streaks are drawn opaque into this layer and faded onto the scene in one go: semi-transparent
 *  strokes drawn straight onto the scene would double up where two overlap (and at every joint). */
let windLayer: HTMLCanvasElement | null = null
const windLayerFor = (main: HTMLCanvasElement): CanvasRenderingContext2D | null => {
  if (typeof document === 'undefined') return null
  windLayer ??= document.createElement('canvas')
  if (windLayer.width !== main.width || windLayer.height !== main.height) {
    windLayer.width = main.width
    windLayer.height = main.height
  }
  return windLayer.getContext('2d')
}

/** How far each current's streaks have travelled (world px), summed frame by frame from the wind's
 *  live speed. Position = speed x time would run streaks BACKWARDS whenever the speed eased (the
 *  product shrinks), and jump when a switched current ramps; a running sum only ever moves forward. */
const windTravel = new WeakMap<WindDef, { t: number; d: number }>()
/** The streaks' pace, as a share of the current's speed (the speed it pushes the umbrella with). */
const STREAK_PACE = 0.55
const travelOf = (def: WindDef, live: WindDef, t: number): number => {
  const tr = windTravel.get(def) ?? { t, d: 0 }
  const dt = t - tr.t
  // A restart winds the clock back; a long pause or a hidden tab is not a leap forward.
  if (dt > 0) tr.d += live.speed * STREAK_PACE * Math.min(dt, 0.1)
  tr.t = t
  windTravel.set(def, tr)
  return tr.d
}

const windGusts = (ctx: CanvasRenderingContext2D, live: WindDef, def: WindDef, w: World): void => {
  const sup = !!live.super
  const vertical = live.dir === 'up' || live.dir === 'down'
  const along = vertical ? live.h : live.w
  const across = vertical ? live.w : live.h
  const angle = live.dir === 'right' ? 0 : live.dir === 'left' ? Math.PI : live.dir === 'down' ? Math.PI / 2 : -Math.PI / 2
  // Lanes about 36 px apart; every lane holds a few streaks of different lengths, a little off its centre.
  const lanes = Math.max(1, Math.round(across / 36))
  const gap = across / lanes
  const margin = Math.min(8, across * 0.08)
  const fadeLen = Math.min(along * 0.22, 70)
  const per = Math.max(1, Math.round(along / 260))
  const travel = travelOf(def, live, w.time)
  const g = windLayerFor(ctx.canvas)
  if (!g) return
  // The box on the screen (device px), a little wider for the strokes' antialiased rims.
  const m = ctx.getTransform()
  const corners = [[live.x, live.y], [live.x + live.w, live.y], [live.x, live.y + live.h], [live.x + live.w, live.y + live.h]].map(([x, y]) => m.transformPoint({ x, y }))
  const bx = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))) - 2)
  const by = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))) - 2)
  const bw = Math.min(g.canvas.width, Math.ceil(Math.max(...corners.map((p) => p.x))) + 2) - bx
  const bh = Math.min(g.canvas.height, Math.ceil(Math.max(...corners.map((p) => p.y))) + 2) - by
  if (bw <= 0 || bh <= 0) return
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(bx, by, bw, bh)
  g.setTransform(m)
  g.save()
  g.translate(live.x + live.w / 2, live.y + live.h / 2)
  g.rotate(angle)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const ink = sup ? 'rgb(255, 196, 120)' : 'rgb(236, 242, 255)'
  g.strokeStyle = ink
  for (let l = 0; l < lanes; l++) {
    const seedL = l * 3.7 + live.x * 0.011 + live.y * 0.017
    for (let k = 0; k < per; k++) {
      const seed = seedL * 5 + k * 13
      const len = Math.min(240, along * (0.32 + rnd(seed + 3) * 0.38))
      const r = Math.max(2, Math.min(across / 4, 5 + rnd(seed + 4) * 5))
      const bow = Math.max(0, Math.min(across / 4, len * (0.04 + rnd(seed + 5) * 0.05)))
      const side: 1 | -1 = rnd(seed + 6) < 0.5 ? 1 : -1
      const width = (sup ? 3.4 : 2.8) * (0.7 + rnd(seed + 7) * 0.6)
      // Off the lane's centre a little, but the bow and the curl always inside the box.
      const reach = Math.max(bow, 2 * r)
      const c = Math.min(across / 2 - margin - reach, Math.max(-across / 2 + margin + reach, -across / 2 + gap * (l + 0.5) + (rnd(seed + 8) - 0.5) * gap * 0.3))
      // Every streak in a current travels together, at the current's own pace: only where it starts differs.
      const period = along + len
      const head = ((((travel + rnd(seed + 1) * period + (k * period) / per) % period) + period) % period)
      const { pts, widths } = streakOf(len, bow, r, side, width)
      g.save()
      g.translate(head - along / 2, c)
      for (let i = 1; i < pts.length; i++) {
        g.lineWidth = widths[i]!
        g.beginPath()
        g.moveTo(pts[i - 1]![0], pts[i - 1]![1])
        g.lineTo(pts[i]![0], pts[i]![1])
        g.stroke()
      }
      g.restore()
    }
  }
  // The ends of the box fade the streaks in and out: a gradient cut out of the layer, so a
  // streak dissolves smoothly as it enters and leaves (per-segment alpha would stripe it).
  g.globalCompositeOperation = 'destination-out'
  const inFade = g.createLinearGradient(-along / 2, 0, -along / 2 + fadeLen, 0)
  inFade.addColorStop(0, 'rgba(0, 0, 0, 1)')
  inFade.addColorStop(1, 'rgba(0, 0, 0, 0)')
  g.fillStyle = inFade
  g.fillRect(-along / 2 - 8, -across / 2 - 8, fadeLen + 8, across + 16)
  const outFade = g.createLinearGradient(along / 2 - fadeLen, 0, along / 2, 0)
  outFade.addColorStop(0, 'rgba(0, 0, 0, 0)')
  outFade.addColorStop(1, 'rgba(0, 0, 0, 1)')
  g.fillStyle = outFade
  g.fillRect(along / 2 - fadeLen, -across / 2 - 8, fadeLen + 8, across + 16)
  g.globalCompositeOperation = 'source-over'
  g.restore()
  // The whole current at once, at the wind's own strength.
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = sup ? 0.85 : 0.62
  ctx.drawImage(g.canvas, bx, by, bw, bh, bx, by, bw, bh)
  ctx.restore()
}

const wind = (ctx: CanvasRenderingContext2D, live: WindDef, def: WindDef, w: World): boolean => {
  // The soft field rides with the painted wisps: no wisps sheet, the vector current.
  const img = paintedOn ? sheetImage('wind-wisps') : null
  if (!img) return false
  const sup = !!live.super
  const f = Math.max(10, Math.min(56, live.w / 2, live.h / 2))
  if (live.speed > 0 && isLantern) {
    const tex = feather(sup ? SUPER_RGB : NORMAL_RGB, false)
    if (!tex) return false
    ctx.save()
    ctx.globalAlpha = sup ? 0.17 : 0.11
    softRect(ctx, tex, live.x, live.y, live.w, live.h, f)
    ctx.restore()
    windGusts(ctx, live, def, w)
  } else if (live.speed > 0) {
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


// ─── Collectibles and the warp gate (lantern build) ─────────────────────────

/** The concept's ring round a lantern collectible: a glowing gold hoop that breathes, and three
 *  four-pointed sparkles round it, each twinkling on its own beat. */
const sparkle = (ctx: CanvasRenderingContext2D, x: number, y: number, R: number): void => {
  ctx.beginPath()
  ctx.moveTo(x, y - R)
  ctx.quadraticCurveTo(x, y, x + R, y)
  ctx.quadraticCurveTo(x, y, x, y + R)
  ctx.quadraticCurveTo(x, y, x - R, y)
  ctx.quadraticCurveTo(x, y, x, y - R)
  ctx.fill()
}
const collectRing = (ctx: CanvasRenderingContext2D, x: number, y: number, time: number, phase: number): void => {
  const R = STAR_R * 1.4
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.6 + phase)
  ctx.save()
  ctx.lineWidth = STAR_R * 0.42
  ctx.strokeStyle = `rgba(255, 196, 70, ${0.16 + 0.1 * pulse})`
  ctx.beginPath()
  ctx.arc(x, y, R, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = Math.max(1.5, STAR_R * 0.14)
  ctx.strokeStyle = `rgba(255, 214, 110, ${0.75 + 0.2 * pulse})`
  ctx.beginPath()
  ctx.arc(x, y, R, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#fff3c4'
  for (let i = 0; i < 3; i++) {
    const tw = Math.max(0, Math.sin(time * 2.2 + phase * 1.7 + i * 2.1))
    if (tw <= 0.05) continue
    const a = -0.6 + i * 2.2 + phase
    ctx.globalAlpha = tw
    sparkle(ctx, x + Math.cos(a) * R * 1.32, y + Math.sin(a) * R * 1.32, STAR_R * (0.18 + 0.16 * tw))
  }
  ctx.restore()
}

const collect = (ctx: CanvasRenderingContext2D, st: Pick<StarDef, 'x' | 'y' | 'shape'>, got: boolean, time: number, phase: number): boolean => {
  if (!paintedOn) return false
  const img = sheetImage('collect')
  if (!img) return false
  const s = sheet('collect')
  const shape = st.shape ?? DEFAULT_COLLECT_SHAPE
  const frame = s.anims[shape]!.frames[0]!
  const cy = st.y + (got ? 0 : Math.sin(time * 3 + phase) * 3)
  ctx.save()
  if (got) {
    // Collected: a faint paper ghost where it hung.
    ctx.globalAlpha = 0.28
    blit(ctx, s, img, frame, st.x, cy)
  } else {
    // A soft warm halo behind it, then the gold paper, then a sparkle now and then.
    ctx.fillStyle = `rgba(250, 204, 21, ${0.14 + 0.08 * Math.sin(time * 4 + phase)})`
    ctx.beginPath()
    ctx.arc(st.x, cy, STAR_R * 1.55, 0, Math.PI * 2)
    ctx.fill()
    if (isLantern) collectRing(ctx, st.x, cy, time, phase)
    blit(ctx, s, img, frame, st.x, cy)
    const sweep = (time * 0.6 + phase) % 3
    if (sweep < 1) {
      ctx.globalAlpha = Math.sin(sweep * Math.PI)
      const k = 0.35 + 0.25 * Math.sin(sweep * Math.PI)
      blit(ctx, s, img, s.anims.glint!.frames[0]!, st.x - STAR_R * 0.55 + sweep * STAR_R * 1.1, cy - STAR_R * 0.35, k, k)
    }
  }
  ctx.restore()
  return true
}

// ─── Panel outlines ─────────────────────────────────────────────────────────

/** Where the painting in each panel actually lies (sheet pixels), measured once from the decoded
 *  sheet's alpha — a painter never fills a panel exactly, and a part drawn to the panel's edges
 *  would float in its own margin. A tainted or unreadable sheet falls back to whole panels. */
interface Rect { x0: number; y0: number; x1: number; y1: number }
const panelBoxes = new WeakMap<HTMLImageElement, Rect[]>()
const boxesOf = (img: HTMLImageElement, s: SheetDef): Rect[] => {
  const have = panelBoxes.get(img)
  if (have) return have
  const fw = img.width / s.cols
  const fh = img.height / s.rows
  const out: Rect[] = Array.from({ length: s.cols * s.rows }, (_, i) => ({ x0: (i % s.cols) * fw, y0: Math.floor(i / s.cols) * fh, x1: (i % s.cols + 1) * fw, y1: (Math.floor(i / s.cols) + 1) * fh }))
  try {
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d', { willReadFrequently: true })
    if (g) {
      g.drawImage(img, 0, 0)
      const data = g.getImageData(0, 0, c.width, c.height).data
      out.forEach((r, i) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
        for (let y = Math.floor(r.y0); y < r.y1; y++) {
          for (let x = Math.floor(r.x0); x < r.x1; x++) {
            if (data[(y * c.width + x) * 4 + 3]! > 40) {
              if (x < x0) x0 = x
              if (x > x1) x1 = x
              if (y < y0) y0 = y
              if (y > y1) y1 = y
            }
          }
        }
        if (x1 > x0 && y1 > y0) out[i] = { x0, y0, x1: x1 + 1, y1: y1 + 1 }
      })
    }
  } catch { /* whole panels */ }
  panelBoxes.set(img, out)
  return out
}

// ─── The warp gate: a vermilion torii with a portal between its posts ──────

/** Where the opening between the torii's posts lies, as shares of the gate's width, read once from
 *  the middle band of the shipped gate (the posts are the only paint there). */
const gateOpenings = new WeakMap<HTMLImageElement, [number, number]>()
const gateOpening = (img: HTMLImageElement): [number, number] => {
  const have = gateOpenings.get(img)
  if (have) return have
  let out: [number, number] = [0.3, 0.7]
  try {
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = 1
    const g = c.getContext('2d', { willReadFrequently: true })
    if (g) {
      g.drawImage(img, 0, Math.floor(img.height / 2), img.width, 1, 0, 0, img.width, 1)
      const a = g.getImageData(0, 0, img.width, 1).data
      const solid = (x: number) => a[x * 4 + 3]! > 100
      let l = Math.floor(img.width / 2)
      let r = l
      while (l > 0 && !solid(l - 1)) l--
      while (r < img.width - 1 && !solid(r + 1)) r++
      if (r - l > img.width * 0.15) out = [l / img.width, (r + 1) / img.width]
    }
  } catch { /* the default opening */ }
  gateOpenings.set(img, out)
  return out
}

/** The portal: a deep teal well with a bright heart and three pale arms wound round it, turning. */
const portal = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, time: number): void => {
  const cx = x + w / 2
  // A tall gate keeps a roundish swirl in the middle of its well, never one long stretched oval.
  const rx = w / 2
  const ry = Math.min(h * 0.55, rx * 1.5)
  const cy = y + h * 0.55
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  const well = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry) * 1.1)
  well.addColorStop(0, 'rgba(236, 255, 240, 0.95)')
  well.addColorStop(0.25, 'rgba(140, 236, 196, 0.85)')
  well.addColorStop(0.7, 'rgba(32, 120, 104, 0.85)')
  well.addColorStop(1, 'rgba(12, 52, 56, 0.9)')
  ctx.fillStyle = well
  ctx.fillRect(x, y, w, h)
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(214, 255, 232, 0.55)'
  ctx.lineWidth = Math.max(1.5, w * 0.05)
  for (let arm = 0; arm < 3; arm++) {
    const off = (arm / 3) * Math.PI * 2 - time * 2.2
    ctx.beginPath()
    for (let k = 0; k <= 28; k++) {
      const u = k / 28
      const a = off + u * Math.PI * 2.4
      const px = cx + Math.cos(a) * rx * (0.08 + 0.9 * u)
      const py = cy + Math.sin(a) * ry * (0.08 + 0.9 * u)
      if (k) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    }
    ctx.stroke()
  }
  // A few motes riding the swirl inward.
  ctx.fillStyle = 'rgba(255, 255, 240, 0.9)'
  for (let i = 0; i < 5; i++) {
    const u = (time * 0.35 + i / 5) % 1
    const a = -time * 2.2 + i * 2.3 + u * Math.PI * 2.4
    ctx.globalAlpha = Math.sin(u * Math.PI)
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * rx * (1 - u) * 0.9, cy + Math.sin(a) * ry * (1 - u) * 0.9, Math.max(1, w * 0.025), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

const gate = (ctx: CanvasRenderingContext2D, g: Pick<GateDef, 'x' | 'y' | 'w' | 'h'>, time: number): boolean => {
  if (!paintedOn) return false
  const img = sheetImage('gate')
  if (!img) return false
  const s = sheet('gate')
  // Beams / posts / feet: the beams keep their shape, the posts stretch, the feet stay short.
  const rimH = Math.min(g.w / 3, g.h * 0.45)
  const baseH = Math.min(rimH * 0.6, Math.max(0, g.h - rimH))
  // The portal first, between the posts and under the lower beam, so the gate frames it.
  const [l, r] = gateOpening(img as HTMLImageElement)
  portal(ctx, g.x + g.w * l, g.y + rimH * 0.8, g.w * (r - l), g.h - rimH * 0.8 - baseH * 0.4, time)
  cell(ctx, s, img, 0, 0, g.x, g.y, g.w, rimH)
  cell(ctx, s, img, 0, 1, g.x, g.y + rimH - 0.5, g.w, g.h - rimH - baseH + 1, 1)
  if (baseH > 0) cell(ctx, s, img, 0, 2, g.x, g.y + g.h - baseH, g.w, baseH)
  return true
}

// ─── The finish: a festival dais with tassels and pennants hanging from it ──

/** The dais's painted top: the middle of its top ellipse sits this far down the dais (shares of its
 *  height), and that is where the platform's surface is. The rim's lower edge runs from RIM_END
 *  down at its two ends to RIM_MID in the middle. */
const DAIS_TOP = 0.3
const RIM_END = 0.72
const RIM_MID = 0.97
const HANGERS = ['tassel', 'pennantRed', 'tassel', 'pennantBlue'] as const

const finishDais = (ctx: CanvasRenderingContext2D, p: PlatformDef, time: number): boolean => {
  if (!hasSheet('finish-dais')) return false
  const img = sheetImage('finish-dais') as HTMLImageElement | null
  if (!img) return false
  const s = sheet('finish-dais')
  const boxes = boxesOf(img, s)
  const d = boxes[s.anims.dais!.frames[0]!]!
  const x = p.x - 6
  const w = p.w + 12
  const dh = Math.max(30, Math.min(80, (w * (d.y1 - d.y0)) / (d.x1 - d.x0)))
  const y = p.y - dh * DAIS_TOP
  // The hangers first: the rim covers where they are tied on. Each sways a little on its own.
  const n = Math.max(3, Math.round(w / 30))
  const hh = Math.max(14, Math.min(34, dh * 0.6))
  for (let i = 0; i < n; i++) {
    const u = -0.86 + (1.72 * i) / (n - 1)
    const b = boxes[s.anims[HANGERS[i % HANGERS.length]!]!.frames[0]!]!
    const hw = (hh * (b.x1 - b.x0)) / (b.y1 - b.y0)
    const ax = x + w / 2 + (u * w) / 2
    const ay = y + dh * (RIM_END + (RIM_MID - RIM_END) * Math.sqrt(1 - u * u)) - hh * 0.12
    ctx.save()
    ctx.translate(ax, ay)
    ctx.rotate(Math.sin(time * 1.6 + i * 0.9) * 0.08)
    ctx.drawImage(img, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, -hw / 2, 0, hw, hh)
    ctx.restore()
  }
  ctx.drawImage(img, d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0, x, y, w, dh)
  return true
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

// The parallax layers (scripts/art/lantern-parallax.py cuts them out of the painted night sky):
// the far plate (sky, moon, string lights, mountains), the big clouds drifting, sky lanterns
// rising, and the near band (the town) with the small clouds on its plane. Positions are fractions
// of the 1376 x 768 painting they were cut from.
const PLATE = { w: 1376, h: 768 }
/** The big clouds drift on a middle plane; the two small ones ride with the town. */
const FAR_CLOUDS = [
  { id: 'backdrop-cloud-1', x: 239, y: 19, depth: 0.35, drift: 6 },
  { id: 'backdrop-cloud-3', x: 1234, y: 164, depth: 0.25, drift: 4.5 },
  { id: 'backdrop-cloud-5', x: 1107, y: 303, depth: 0.45, drift: 7.5 }
]
const NEAR_CLOUDS = [
  { id: 'backdrop-cloud-2', x: 120, y: 470, scale: 0.85, drift: 11 },
  { id: 'backdrop-cloud-4', x: 840, y: 505, scale: 0.75, drift: 9 }
]
const LANTERN_IDS = Array.from({ length: 8 }, (_, i) => `backdrop-lantern-${i + 1}`)
const SKY_LANTERNS = 30
/** The town band starts this far down the painting. */
const NEAR_TOP = 557
/** The furthest a layer slides sideways, as a share of the screen width. A portrait screen scales the plate to
 *  its height, which leaves it about four screens wide: sliding through all of that spare width swung the sky by a
 *  third of the screen per step. Landscape never has this much spare width, so it is unchanged. */
const SLIDE_MAX = 0.25

/** One layer of the sky: a plate-sized picture slid by `depth` of the camera's travel. */
interface Frame { x: number; y: number; k: number; dw: number; dh: number }

const layeredBackdrop = (ctx: CanvasRenderingContext2D, cw: number, ch: number, u: number, v: number, t: number, far: HTMLImageElement): void => {
  // The far plate covers the screen with a little room to spare and slides by where the camera
  // looks inside the level (u, v ∈ −½..½).
  const k = Math.max(cw / PLATE.w, ch / PLATE.h) * 1.08
  const plate = (depth: number): Frame => {
    const dw = PLATE.w * k
    const dh = PLATE.h * k
    return { x: (cw - dw) / 2 - u * Math.min(dw - cw, cw * SLIDE_MAX) * depth, y: (ch - dh) / 2 - v * (dh - ch) * depth, k, dw, dh }
  }
  const f = plate(1)
  ctx.drawImage(far, f.x, f.y, f.dw, f.dh)

  // The big clouds: their own slow drift (wrapping round the plate), a little more parallax than the plate.
  for (const c of FAR_CLOUDS) {
    const img = sheetImage(c.id)
    if (!img) continue
    const p = plate(1 + c.depth)
    const span = PLATE.w + img.width
    const px = ((((c.x + t * c.drift + img.width) % span) + span) % span) - img.width
    ctx.drawImage(img, p.x + px * k, p.y + c.y * k, img.width * k, img.height * k)
  }

  // Sky lanterns: each rises from above the mountains to the top and fades in and out, swaying;
  // the far ones smaller, dimmer, slower and with less parallax.
  const imgs = LANTERN_IDS.map((id) => sheetImage(id)).filter((x): x is HTMLImageElement => !!x)
  if (imgs.length) {
    for (let i = 0; i < SKY_LANTERNS; i++) {
      const depth = 0.15 + rnd(i * 7.3) * 0.85 // 0 far … 1 near
      const img = imgs[Math.floor(rnd(i * 3.1 + 1) * imgs.length)]!
      const rise = 6 + depth * 10 // plate px per second
      const top = 20
      const bottom = 470 - rnd(i * 1.7) * 60
      const span = bottom - top
      const q = (((rnd(i * 5.9) * span + t * rise) % span) + span) % span // 0 … span, rising
      const py = bottom - q
      const life = Math.min(1, q / (span * 0.18), (span - q) / (span * 0.22))
      if (life <= 0.02) continue
      const px = rnd(i * 2.3 + 4) * PLATE.w + Math.sin(t * (0.25 + rnd(i) * 0.3) + i) * 10 * depth
      const scale = 0.35 + depth * 0.6
      const p = plate(1 + depth * 0.5)
      ctx.globalAlpha = life * (0.55 + depth * 0.45)
      const lw = img.width * scale * k
      const lh = img.height * scale * k
      ctx.drawImage(img, p.x + px * k - lw / 2, p.y + py * k - lh / 2, lw, lh)
    }
    ctx.globalAlpha = 1
  }

  // The town: the near band, wider than the screen so it can slide the most; its small clouds
  // on the same plane. It sits on the screen's bottom edge and rises a little when the camera looks low.
  const near = sheetImage('backdrop-near')
  if (near) {
    const kn = k * 1.12
    const dw = PLATE.w * kn
    const dh = near.height * (dw / near.width)
    const x = (cw - dw) / 2 - u * Math.min(dw - cw, cw * SLIDE_MAX) * 1.8
    const yTop = ch - dh * 0.92 - v * ch * 0.06
    for (const c of NEAR_CLOUDS) {
      const img = sheetImage(c.id)
      if (!img) continue
      const span = PLATE.w + img.width
      const px = ((((c.x + t * c.drift) % span) + span) % span) - img.width * 0.5
      const s = kn * c.scale
      ctx.drawImage(img, x + px * kn, yTop + (c.y - NEAR_TOP) * kn, img.width * s, img.height * s)
    }
    ctx.drawImage(near, x, yTop, dw, dh)
    // Below the band (when the town rises) the town's own ground carries on to the screen's edge.
    if (yTop + dh < ch) ctx.drawImage(near, 0, near.height - 2, near.width, 2, x, yTop + dh - 1, dw, ch - yTop - dh + 1)
  }
}

/** The painted sky behind the level, in screen space: the parallax layers when they shipped,
 *  else the single painting slid by where the camera looks — never showing an edge. */
const backdrop = (ctx: CanvasRenderingContext2D, cw: number, ch: number, cam: Camera, w: World): boolean => {
  if (!paintedOn) return false
  const far = sheetImage('backdrop-far')
  const img = far ?? sheetImage('backdrop')
  if (!img) return false
  const u = clamp01((cw / 2 - cam.ox) / cam.s / w.level.world.w) - 0.5
  const v = clamp01((ch / 2 - cam.oy) / cam.s / w.level.world.h) - 0.5
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (far) {
    layeredBackdrop(ctx, cw, ch, u, v, w.time, far)
    return true
  }
  const k = Math.max(cw / img.width, ch / img.height) * 1.08
  const dw = img.width * k
  const dh = img.height * k
  ctx.drawImage(img, (cw - dw) / 2 - u * Math.min(dw - cw, cw * SLIDE_MAX), (ch - dh) / 2 - v * (dh - ch), dw, dh)
  return true
}

// ─── The slots ──────────────────────────────────────────────────────────────

export const KITE_PAINTERS: Required<KiteArt> = {
  backdrop,
  collect,
  gate,
  pweeg,
  umbrella,
  splat,
  hazard,
  wind: (ctx, live, def, w) => wind(ctx, live, def, w),
  platform,
  button,
  checkpoint
}
