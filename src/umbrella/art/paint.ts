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
import { isClay, isLantern, paintedGame } from '../kite'
import { windStyle } from '../windStyle'
import { liteMode, stillSkyCanvas } from '../liteMode'
import { DEFAULT_COLLECT_SHAPE, type ButtonDef, type CheckpointDef, type GateDef, type PlatformDef, type StarDef, type WindDef } from '../levels'
import { drawPrickbaitPupils, walldorfEyes, type PweegLook, type UmbrellaLook } from '../characters'
import { boxOf, BUTTON_W, FAN_SIZE, PRICKBAIT_R, sheetById, SPIKE, type AnimDef, type SheetDef } from './manifest'
import { hasSheet, setReady, sharpImage, sheetImage } from './sheets'
import type { KiteArt } from './hooks'
import { drawFinishDressing } from './kiteFinish'
import walldorfFaceEyes from './walldorfFaceEyes.json'
import walldorfFaceEyesClay from './walldorfFaceEyes-clay.json'

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

/** The lantern Pweeg's walk: one step, its frames picked and ordered by their measured stride (the
 *  width across his feet: 68, 100, 117, 124, 121, 116, 109, 72 px of a 256 px panel), all with the
 *  same arm pose. The painter numbered its panels out of order, so playing them as painted jumps
 *  from feet-together to a wide stride and back. Measured on the current sheet: re-measure the
 *  feet span per panel after a repaint. */
const LANTERN_STEP = [0, 1, 2, 3, 6, 5, 15, 8]

/** The raised front hand of each cheer frame (lantern), measured once from the sheet: the topmost
 *  paint in the right fifth of the figure, i.e. the fist above his head. In box units from the
 *  sprite's anchor; null where nothing sits there. */
/** One frame's pixels of a decoded sheet, read back from a CPU-side copy of it made once per sheet.
 *  The hand and fuse lookups read only the frame they are asked about, the first time it is drawn:
 *  reading every frame of a sheet at once was a 150-300 ms stall on a phone, the moment a pose first
 *  showed (Pweeg's first step, his first fall). */
/** The measurers need a figure's silhouette, not its paint: a frame is read at most this wide. */
const MEASURE_PX = 96
/** Each sheet read back ONCE, whole, at the small size: every getImageData waits for the GPU to
 *  finish what it was given, so it is the number of reads that costs, not their size. */
const sheetCopies = new WeakMap<HTMLImageElement, { data: Uint8ClampedArray; width: number } | null>()
/** One frame of a sheet, scaled down to MEASURE_PX wide at most: its pixels and its size there.
 *  (Read at full size, frame by frame, every walk, idle, fall and cheer frame cost a weak phone
 *  ~0.5 s of pixel reads in its first seconds of play.) */
const framePixels = (img: HTMLImageElement, s: SheetDef, frame: number): { d: Uint8ClampedArray; fw: number; fh: number } | null => {
  const q = Math.min(1, MEASURE_PX / Math.max(1, img.width / s.cols))
  const fw = Math.max(1, Math.round((img.width * q) / s.cols))
  const fh = Math.max(1, Math.round((img.height * q) / s.rows))
  let sheetPx = sheetCopies.get(img)
  if (sheetPx === undefined) {
    sheetPx = null
    try {
      const c = document.createElement('canvas')
      c.width = fw * s.cols
      c.height = fh * s.rows
      const g = c.getContext('2d', { willReadFrequently: true })
      if (g) {
        g.drawImage(img, 0, 0, c.width, c.height)
        sheetPx = { data: g.getImageData(0, 0, c.width, c.height).data, width: c.width }
      }
    } catch { sheetPx = null }
    sheetCopies.set(img, sheetPx)
  }
  if (!sheetPx) return null
  // The frame's rows, copied out of the sheet's pixels.
  const d = new Uint8ClampedArray(fw * fh * 4)
  const x0 = (frame % s.cols) * fw
  const y0 = Math.floor(frame / s.cols) * fh
  for (let y = 0; y < fh; y++) {
    const from = ((y0 + y) * sheetPx.width + x0) * 4
    d.set(sheetPx.data.subarray(from, from + fw * 4), y * fw * 4)
  }
  return { d, fw, fh }
}
/** Per sheet, per frame: a measured point, or null where there is none (undefined: not measured yet). */
type FramePoints = Map<number, { x: number; y: number } | null>
const measured = (cache: WeakMap<HTMLImageElement, FramePoints>, img: HTMLImageElement, frame: number, measure: () => { x: number; y: number } | null): { x: number; y: number } | null => {
  let points = cache.get(img)
  if (!points) cache.set(img, points = new Map())
  if (!points.has(frame)) {
    let at: { x: number; y: number } | null = null
    try { at = measure() } catch { at = null }
    points.set(frame, at)
  }
  return points.get(frame) ?? null
}

/** The raised front hand of each cheer frame (lantern), measured from the sheet: the topmost paint
 *  in the right fifth of the figure, i.e. the fist above his head. In box units from the sprite's
 *  anchor; null where nothing sits there. */
const cheerHands = new WeakMap<HTMLImageElement, FramePoints>()
const cheerHandOf = (img: HTMLImageElement, s: SheetDef, frame: number): { x: number; y: number } | null =>
  measured(cheerHands, img, frame, () => {
    const px = framePixels(img, s, frame)
    if (!px) return null
    const { d, fw, fh } = px
    const solid = (x: number, y: number) => d[(y * fw + x) * 4 + 3]! > 120
    let l = fw, r = -1
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (solid(x, y)) { if (x < l) l = x; if (x > r) r = x }
    if (r < l) return null
    const x0 = Math.floor(l + (r - l) * 0.78)
    let top = -1
    for (let y = 0; y < fh && top < 0; y++) for (let x = x0; x <= r; x++) if (solid(x, y)) { top = y; break }
    if (top < 0) return null
    let sx = 0, n = 0
    for (let y = top; y < Math.min(fh, top + fh * 0.05); y++) for (let x = x0; x <= r; x++) if (solid(x, y)) { sx += x; n++ }
    const box = boxOf(s, frame)
    return { x: sx / n / fw - box.ax, y: (top + fh * 0.02) / fh - box.ay }
  })
/** The front hand of each standing / walking frame, measured from the sheet a frame at a time: the outermost
 *  paint on the side he faces (the right), in the band of his body where his hands hang. In box
 *  units from the sprite's anchor. A carried umbrella's grip goes there instead of at a fixed
 *  offset, which left it floating beside a painted figure whose arms sit elsewhere. */
const sideHands = new WeakMap<HTMLImageElement, FramePoints>()
const raisedHands = new WeakMap<HTMLImageElement, FramePoints>()
/** `raised`: the falling poses fling the arms up and out, so look for the hand in the upper part of
 *  the figure instead of where hands hang. */
const sideHandOf = (img: HTMLImageElement, s: SheetDef, frame: number, raised = false): { x: number; y: number } | null =>
  measured(raised ? raisedHands : sideHands, img, frame, () => {
    const px = framePixels(img, s, frame)
    if (!px) return null
    const { d, fw, fh } = px
    const solid = (x: number, y: number) => d[(y * fw + x) * 4 + 3]! > 120
    let t = fh, b = -1
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (solid(x, y)) { if (y < t) t = y; if (y > b) b = y }
    if (b < t) return null
    // His hands hang between about half and three quarters of the way down him.
    let hx = -1, hy = 0
    const [b0, b1] = raised ? [0.12, 0.55] : [0.48, 0.75]
    for (let y = Math.floor(t + (b - t) * b0); y <= Math.floor(t + (b - t) * b1); y++) {
      for (let x = fw - 1; x > hx; x--) if (solid(x, y)) { hx = x; hy = y; break }
    }
    if (hx < 0) return null
    const box = boxOf(s, frame)
    return { x: (hx - fw * 0.015) / fw - box.ax, y: hy / fh - box.ay }
  })

/** Where the last painted figure drawn holds the umbrella (its raised fist in the cheer, its front
 *  hand standing or walking), in the caller's space; null when it was not a painted-game figure. */
let cheerHandAt: { x: number; y: number } | null = null

const pweeg = (ctx: CanvasRenderingContext2D, x: number, y: number, look: PweegLook): boolean => {
  kiteDrawn = false
  cheerHandAt = null
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
      // walk's cadence twitches the hands and feet. A kite, and the lantern's paper
      // Pweeg and Chad, walk on every other frame at half the pace: a steadier stride.
      // The lantern Pweeg plays one measured step per vector stride cycle (about 2.6 steps a second).
      frame = isLantern && !chad && !set.kite
        ? phaseFrame({ ...s('walk').anims.walk!, frames: LANTERN_STEP }, (look.step ?? 0) / (Math.PI * 2))
        : set.kite || paintedGame
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
      if (set.kite || paintedGame) {
        // Arms up on a steady bounce (the sheet's arms-up frames, slowly ping-ponged)
        // with a gentle rock, instead of racing through 16 different poses.
        const img = sheetImage(id)
        if (!img) return false
        const k = Math.floor(look.time * 5) % CHEER_LOOP.length
        const hop = Math.abs(Math.sin(look.time * Math.PI * 1.6))
        const rock = Math.sin(look.time * Math.PI * 1.6) * 0.07
        const sx = look.w / PWEEG_W
        const sy = look.h / PWEEG_H
        ctx.save()
        ctx.translate(x, y - hop * look.h * 0.16)
        ctx.rotate(rock)
        blit(ctx, sheet(id), img, CHEER_LOOP[k]!, 0, 0, sx, sy, false)
        ctx.restore()
        // The raised fist, carried through the same hop and rock, for the umbrella's grip (lantern).
        const hand = paintedGame ? cheerHandOf(img as HTMLImageElement, sheet(id), CHEER_LOOP[k]!) : null
        if (hand) {
          const size = boxOf(sheet(id), CHEER_LOOP[k]!).drawSize ?? boxOf(sheet(id), CHEER_LOOP[k]!).size
          const lx = hand.x * size * sx
          const ly = hand.y * size * sy
          cheerHandAt = { x: x + Math.cos(rock) * lx - Math.sin(rock) * ly, y: y - hop * look.h * 0.16 + Math.sin(rock) * lx + Math.cos(rock) * ly }
        }
        kiteDrawn = set.kite
        return true
      }
      frame = phaseFrame(s('cheer').anims.cheer!, (look.time * 9) / Math.PI)
      break
    default: return false
  }
  const img = sheetImage(id)
  if (!img) return false
  const flip = look.facing < 0 && !look.front
  blit(ctx, sheet(id), img, frame, x, y, look.w / PWEEG_W, look.h / PWEEG_H, flip)
  kiteDrawn = set.kite
  if (paintedGame && !look.front && (pose === 'stand' || pose === 'walk' || pose === 'flail')) {
    const hand = sideHandOf(img as HTMLImageElement, sheet(id), frame, pose === 'flail')
    if (hand) {
      const box = boxOf(sheet(id), frame)
      const size = box.drawSize ?? box.size
      cheerHandAt = { x: x + (flip ? -1 : 1) * hand.x * size * (look.w / PWEEG_W), y: y + hand.y * size * (look.h / PWEEG_H) }
    }
  }
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

// ─── The lantern Walldorf's watching eyes ───────────────────────────────────
//
// The painted face has its pupils taken out (scripts/art/walldorf-pupils.py), and the eyes stay in one
// place on the pillar. The game draws the pupils: they turn to the player, re-aimed every third frame,
// so the eyes hold still and only the gaze follows — the feeling of being watched.
interface FaceEye { x: number; y: number; rx: number; ry: number; pupil: number }
const FACE_EYES = ((isClay ? walldorfFaceEyesClay : walldorfFaceEyes) as { frames: FaceEye[][] }).frames
/** Re-aim the pupils every this many frames. */
const GAZE_EVERY = 3
const gazes = new WeakMap<Hazard, { n: number; ux: number; uy: number }>()
const gazeOf = (h: Hazard, ex: number, ey: number, px: number, py: number): { ux: number; uy: number } => {
  const g = gazes.get(h) ?? { n: 0, ux: 0, uy: 0 }
  if (g.n++ % GAZE_EVERY === 0) {
    const d = Math.hypot(px - ex, py - ey) || 1
    g.ux = (px - ex) / d
    g.uy = (py - ey) / d
  }
  gazes.set(h, g)
  return g
}
const watchingPupils = (ctx: CanvasRenderingContext2D, frame: number, x: number, y: number, k: number, gaze: { ux: number; uy: number }): void => {
  ctx.save()
  for (const e of FACE_EYES[frame] ?? []) {
    const cx = x + e.x * k
    const cy = y + e.y * k
    const rx = e.rx * k * 0.86
    const ry = e.ry * k * 0.86
    const r = Math.min(e.pupil * k, ry * 0.95)
    // The pupil rides toward the player, as far as the eye lets it; the lids clip it.
    const px = cx + gaze.ux * Math.max(0, rx - r) * 0.8
    const py = cy + gaze.uy * Math.max(0, ry - r) * 0.8
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = '#1c1620'
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.beginPath()
    ctx.arc(px + r * 0.35, py - r * 0.35, r * 0.28, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

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
  // The pillar is painted standing. A Walldorf wider than tall lies it on its side (turned a quarter
  // clockwise, so its lit facet faces up) instead of squashing a tall pillar flat.
  const lying = h.w > h.h
  const [bx, by0, bw, bh] = lying ? [-h.h / 2, -h.w / 2, h.h, h.w] : [h.x, h.y, h.w, h.h]
  if (lying) {
    ctx.save()
    ctx.translate(cx, h.y + h.h / 2)
    ctx.rotate(Math.PI / 2)
  }
  const cap = Math.min(bw, bh / 2)
  cell(ctx, body, bodyImg, col, 0, bx, by0, bw, cap)
  cell(ctx, body, bodyImg, col, 1, bx, by0 + cap - 0.5, bw, bh - cap * 2 + 1, 1)
  cell(ctx, body, bodyImg, col, 2, bx, by0 + bh - cap, bw, cap)
  if (lying) ctx.restore()

  // Face: the bench's eye geometry, so the painted eyes sit where the drawn ones did. It stays upright
  // on a lying Walldorf, its two stacked eyes sized to his height and centred on it.
  const eyes = lying ? (() => {
    const er = Math.min(h.h * 0.2, 9)
    return { er, ex: cx + facing * h.w * 0.18, top: h.y + h.h / 2 }
  })() : walldorfEyes(h, facing)
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
  if (paintedGame && FACE_EYES.some((f) => f.length)) {
    // The eyes stay put in the middle of the pillar and never flip; only the pupils follow the player.
    const sc = eyes.er / 9
    const ex = cx
    blit(ctx, face, faceImg, frame, ex, eyes.top, sc, sc, false)
    const box = boxOf(face, frame)
    const k = (box.drawSize ?? box.size) * sc
    watchingPupils(ctx, frame, ex, eyes.top, k, gazeOf(h, ex, eyes.top, pl.x + pl.w / 2, pl.y + pl.h / 2))
  } else {
    blit(ctx, face, faceImg, frame, eyes.ex, eyes.top, eyes.er / 9, eyes.er / 9, facing < 0)
  }
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
/** The clay mine's blast: no flash of paper, a squashy claymation POOF — a puff of soft clay balls
 *  swelling out and shrinking away, the mine's crimson clay lumps and rounded spike cones flung out
 *  under gravity, and little clay dust balls drifting up. Every ball has the clay look's soft light
 *  side, shadow side and dark outline. Same timing as the paper blast (MINE_DEATH_HOLD). */
const CLAY_INK = '#2a2630'
const clayBall = (ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, base: string, shade: string, light: string): void => {
  ctx.fillStyle = base
  ctx.strokeStyle = CLAY_INK
  ctx.lineWidth = Math.max(1, rad * 0.12)
  ctx.beginPath()
  ctx.arc(x, y, rad, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = shade
  ctx.beginPath()
  ctx.arc(x + rad * 0.35, y + rad * 0.45, rad * 0.95, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = base
  ctx.beginPath()
  ctx.arc(x - rad * 0.12, y - rad * 0.12, rad * 0.82, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = light
  ctx.beginPath()
  ctx.ellipse(x - rad * 0.38, y - rad * 0.42, rad * 0.26, rad * 0.16, -0.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.beginPath()
  ctx.arc(x, y, rad, 0, Math.PI * 2)
  ctx.stroke()
}

const clayBlast = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, seed: number): void => {
  const ease = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3)
  ctx.save()
  ctx.translate(x, y)
  // A soft warm glow for the first instant (clay does not flash white).
  if (t < 0.12) {
    ctx.globalAlpha = 0.6 * (1 - t / 0.12)
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2)
    glow.addColorStop(0, 'rgba(255, 214, 160, 1)')
    glow.addColorStop(1, 'rgba(255, 170, 110, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  // The puff: a ring of clay balls round a big middle one, swelling out (squash-and-stretch) then
  // shrinking away.
  const grow = ease(t / 0.18)
  const fade = Math.max(0, 1 - Math.max(0, t - 0.3) / 0.45)
  if (fade > 0) {
    ctx.globalAlpha = Math.min(1, fade * 1.4)
    const k = grow * fade
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + seed * 3
      const d = r * (0.75 + 0.35 * rnd(seed + i)) * (0.6 + 0.6 * grow)
      const rad = r * (0.42 + 0.18 * rnd(seed + i + 9)) * k
      if (rad > 0.5) clayBall(ctx, Math.cos(a) * d, Math.sin(a) * d - r * 0.3 * t, rad, '#efe9df', '#c6bcae', '#ffffff')
    }
    const mid = r * 0.75 * k
    if (mid > 0.5) clayBall(ctx, 0, -r * 0.3 * t, mid, '#f4efe6', '#cdc3b4', '#ffffff')
  }
  // The mine's own clay: rounded crimson lumps and spike cones, flung out, tumbling, falling.
  for (let i = 0; i < 10; i++) {
    const u = t / 0.8
    if (u >= 1) break
    const cone = i < 6
    const a = cone ? (i / 6) * Math.PI * 2 - Math.PI / 2 : rnd(seed + i * 3) * Math.PI * 2
    const v = r * (cone ? 3.8 : 2.8 + 1.8 * rnd(seed + i * 5))
    const px = Math.cos(a) * v * t
    const py = Math.sin(a) * v * t + r * 5 * t * t
    const size = r * (cone ? 0.36 : 0.22 + 0.12 * rnd(seed + i * 7))
    ctx.globalAlpha = Math.min(1, (1 - u) * 1.8)
    if (cone) {
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(a + Math.PI / 2 + t * 4 * (rnd(seed + i) < 0.5 ? -1 : 1))
      ctx.fillStyle = '#8e2234'
      ctx.strokeStyle = CLAY_INK
      ctx.lineWidth = Math.max(1, size * 0.14)
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(0, -size)
      ctx.quadraticCurveTo(size * 0.5, size * 0.1, size * 0.42, size * 0.45)
      ctx.quadraticCurveTo(0, size * 0.62, -size * 0.42, size * 0.45)
      ctx.quadraticCurveTo(-size * 0.5, size * 0.1, 0, -size)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = 'rgba(255, 190, 196, 0.55)'
      ctx.beginPath()
      ctx.ellipse(-size * 0.14, -size * 0.2, size * 0.08, size * 0.28, 0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    } else {
      clayBall(ctx, px, py, size, '#a92b3e', '#76202e', '#e07a86')
    }
  }
  // Dust: little clay balls drifting up and fading.
  for (let i = 0; i < 6; i++) {
    const u = (t - 0.15 - i * 0.03) / 0.6
    if (u <= 0 || u >= 1) continue
    const a = -Math.PI / 2 + (rnd(seed + i * 13) - 0.5) * 2.2
    const d = r * (1 + 1.6 * ease(u))
    ctx.globalAlpha = 1 - u
    clayBall(ctx, Math.cos(a) * d, Math.sin(a) * d - r * u, r * 0.12 * (1 - u * 0.5), '#e2dbcf', '#b8ad9e', '#ffffff')
  }
  ctx.restore()
}

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
const fuseTips = new WeakMap<HTMLImageElement, Array<{ x: number; y: number } | null>>()
const fuseTipOf = (img: HTMLImageElement, s: SheetDef, frame: number): { x: number; y: number } | null => {
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
          // Too few gold pixels: no painted fuse in this frame (the clay mine has none at all).
          if (pts.length < 12) { tips.push(null); continue }
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
  return tips.length ? tips[frame] ?? null : FUSE_TIP
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
  const blast = paintedGame ? blastOf(h, w) : undefined
  if (blast) {
    ;(isClay ? clayBlast : mineBlast)(ctx, blast.x, blast.y, r, w.phaseTime, (blast.x * 0.013 + blast.y * 0.007) % 1)
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
  // A painted fuse burns (the lantern firecracker); the clay mine has none.
  const tip = paintedGame ? fuseTipOf(img as HTMLImageElement, s, frame) : null
  if (tip) fuseSpark(ctx, x + (flip ? -1 : 1) * r * tip.x, y + r * tip.y, r, w.time + h.x * 0.013)
  const pl = w.player
  drawPrickbaitPupils(ctx, x, y, r, pl.x + pl.w / 2, pl.y + pl.h / 2)
  // The painted mine's angry brows are drawn live like its pupils: one painting never kept them the
  // same across sixteen panels. They slant down toward the middle, harder while it lunges.
  if (paintedGame) {
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

// ─── Clay ledges: brickwork at one scale, never stretched ───────────────────
//
// A nine-slice stretches its middle to any size, which smears the clay sheet's bricks into streaks on
// long or thin ledges. The clay ledge instead fills its rectangle with the painted brickwork as a
// repeating texture at ONE fixed size (anchored to the world, so neighbouring ledges line up), lays
// the painted coping stones along its top at their own size, and finishes it with a soft rounded
// clay edge: a dark outline, a light top lip and a shadow along the bottom.
const CLAY_BRICK_TILE = 60
const CLAY_SHEET = { coping: [8, 108] as const, bricks: [140, 600] as const }
const clayPatterns = new WeakMap<HTMLImageElement | HTMLCanvasElement, { bricks: CanvasPattern; coping: HTMLCanvasElement } | null>()
const clayLedgeArt = (ctx: CanvasRenderingContext2D, img: HTMLImageElement | HTMLCanvasElement) => {
  if (clayPatterns.has(img)) return clayPatterns.get(img)!
  let out: { bricks: CanvasPattern; coping: HTMLCanvasElement } | null = null
  try {
    const k = img.width / 768
    // A square of brickwork from the middle of the sheet, scaled to the tile.
    const b = document.createElement('canvas')
    b.width = b.height = 128
    const bg = b.getContext('2d')!
    const [b0, b1] = CLAY_SHEET.bricks
    bg.drawImage(img, 256 * k, b0 * k, (b1 - b0) * k, (b1 - b0) * k, 0, 0, 128, 128)
    const pat = ctx.createPattern(b, 'repeat')
    // A strip of coping stones from the middle of the top edge.
    const c = document.createElement('canvas')
    const [c0, c1] = CLAY_SHEET.coping
    c.width = Math.round(256 * k)
    c.height = Math.round((c1 - c0) * k)
    c.getContext('2d')!.drawImage(img, 256 * k, c0 * k, 256 * k, (c1 - c0) * k, 0, 0, c.width, c.height)
    if (pat) out = { bricks: pat, coping: c }
  } catch { /* the nine-slice instead */ }
  clayPatterns.set(img, out)
  return out
}

const clayLedge = (ctx: CanvasRenderingContext2D, img: HTMLImageElement | HTMLCanvasElement, x: number, y: number, w: number, h: number): boolean => {
  const art = clayLedgeArt(ctx, img)
  if (!art) return false
  const r = Math.min(7, h / 2.5, w / 2.5)
  const round = () => {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
  }
  ctx.save()
  // A soft shadow under the ledge, onto the scene.
  ctx.fillStyle = 'rgba(20, 24, 36, 0.22)'
  ctx.beginPath()
  ctx.roundRect(x + 2, y + 3, w, h, r)
  ctx.fill()
  round()
  ctx.clip()
  // Brickwork, one fixed size, anchored to the world.
  const m = new DOMMatrix().translateSelf(0, 0).scaleSelf(CLAY_BRICK_TILE / 128, CLAY_BRICK_TILE / 128)
  art.bricks.setTransform(m)
  ctx.fillStyle = art.bricks
  ctx.fillRect(x, y, w, h)
  // Coping stones along the top, at their own proportions, tiled.
  const ch = Math.max(5, Math.min(13, h * 0.42))
  const cw = (art.coping.width * ch) / art.coping.height
  const start = Math.floor(x / cw) * cw
  for (let cx = start; cx < x + w; cx += cw) ctx.drawImage(art.coping, cx, y, cw, ch)
  // Clay shading: a light lip along the top, darker toward the bottom.
  const shade = ctx.createLinearGradient(0, y, 0, y + h)
  shade.addColorStop(0, 'rgba(255, 255, 255, 0.22)')
  shade.addColorStop(Math.min(0.5, 3 / h), 'rgba(255, 255, 255, 0)')
  shade.addColorStop(0.7, 'rgba(20, 22, 34, 0)')
  shade.addColorStop(1, 'rgba(20, 22, 34, 0.3)')
  ctx.fillStyle = shade
  ctx.fillRect(x, y, w, h)
  ctx.restore()
  // The soft dark clay outline.
  ctx.save()
  ctx.strokeStyle = 'rgba(42, 38, 48, 0.9)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, Math.max(0, r - 0.75))
  ctx.stroke()
  ctx.restore()
  return true
}

const platform = (ctx: CanvasRenderingContext2D, p: PlatformDef, on: boolean, color: string | null): boolean | 'dressed' => {
  if (!paintedOn || !ready(['platform'], PLATFORMS)) return false
  // A switched-off platform stays the dashed ghost the vector path draws.
  if (color !== null && !on) return false
  // The lantern finish is the concept's festival dais, dressed as the goal it is (no FINISH word).
  if (p.finish && paintedGame && (isClay ? finishPost : finishDais)(ctx, p, performance.now() / 1000)) return 'dressed'
  const id = p.finish ? 'platform-finish' : color !== null ? 'platform-switch' : 'platform'
  if (!hasSheet(id)) return false
  const s = sheet(id)
  const raw = sheetImage(id)!
  const img = color !== null && !p.finish ? tintOf(id, raw, color) : null
  // Clay ledges keep their brickwork at one size (a stretched nine-slice smears it); the rest nine-slice.
  if (!(isClay && id === 'platform' && clayLedge(ctx, raw, p.x, p.y, p.w, p.h))) nine(ctx, s, img ?? raw, p.x, p.y, p.w, p.h)
  // The kite build's flags and bunting; the lantern pad is its own goal (and keeps its label).
  if (p.finish && !paintedGame) drawFinishDressing(ctx, p, performance.now() / 1000)
  return true
}

const button = (ctx: CanvasRenderingContext2D, b: ButtonDef, on: boolean, color: string): boolean => {
  if (!paintedOn) return false
  const raw = sheetImage('props')
  if (!raw) return false
  const s = sheet('props')
  const img = tintOf('props', raw, color) ?? raw
  const frame = on ? s.anims.buttonDown!.frames[0]! : s.anims.buttonUp!.frames[0]!
  if (paintedGame) {
    // The painted button is fitted by its own outline into the area the drawn one covers — its box
    // plus a 4 px base on each side — so it is exactly as big as what you press (the panel's
    // registration box let a tall painted cap stand nearly three times the button's height).
    const r = boxesOf(raw as HTMLImageElement, s)[frame]!
    const top = on ? b.y + b.h * 0.65 : b.y
    ctx.drawImage(img as HTMLCanvasElement, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, b.x - 4, top, b.w + 8, b.y + b.h + 4 - top)
    return true
  }
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
const SUPER_RGB = isLantern ? '255,138,42' : isClay ? '232,128,58' : '70,150,215'
/** The clay field is a paler, milkier blue than the drawn one. */
const CLAY_RGB = '170,200,228'
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
  // Lanes about 42 px apart (a seventh fewer streaks than at 36); every lane holds a few streaks of
  // different lengths, each kept inside its own lane so neighbours never cross.
  const lanes = Math.max(1, Math.round(across / 42))
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
  // Lantern: pale paper streamers and fiery gold; clay: soft rolled ribbons of pale blue clay and
  // autumn orange, a little thicker.
  const ink = isClay ? (sup ? 'rgb(240, 150, 72)' : 'rgb(214, 228, 242)') : sup ? 'rgb(255, 196, 120)' : 'rgb(236, 242, 255)'
  g.strokeStyle = ink
  for (let l = 0; l < lanes; l++) {
    const seedL = l * 3.7 + live.x * 0.011 + live.y * 0.017
    // This lane's band across the current, a little gap kept free on each side of it (and the box's
    // margin at the outer lanes).
    const pad = Math.max(2, Math.min(5, gap * 0.1))
    const laneLo = -across / 2 + gap * l + (l === 0 ? margin : pad)
    const laneHi = -across / 2 + gap * (l + 1) - (l === lanes - 1 ? margin : pad)
    const inner = Math.max(2, laneHi - laneLo)
    // The lane's streaks share one loop, evenly spaced along it, so they never run into each other
    // (the spacing, (along + longest) / per, is always longer than the longest streak).
    const longest = Math.min(240, along * 0.7)
    const period = along + longest
    const start = rnd(seedL + 1) * period
    for (let k = 0; k < per; k++) {
      const seed = seedL * 5 + k * 13
      const len = Math.min(240, along * (0.32 + rnd(seed + 3) * 0.38))
      const width = (sup ? 3.4 : 2.8) * (isClay ? 1.35 : 1) * (0.7 + rnd(seed + 7) * 0.6)
      // The bow and the curl stay inside the lane: they fit its width, minus the stroke.
      const room = Math.max(1, inner - width)
      const r = Math.max(1.5, Math.min(room / 2, 5 + rnd(seed + 4) * 5))
      const bow = Math.max(0, Math.min(room, len * (0.04 + rnd(seed + 5) * 0.05)))
      const side: 1 | -1 = rnd(seed + 6) < 0.5 ? 1 : -1
      const reach = Math.min(room, Math.max(bow, 2 * r))
      // The drawn shape is mirrored (streakOf), so a streak of \`side\` swings toward -side: place its
      // centreline so that swing stays in the band, anywhere the band leaves room for it.
      const lo = laneLo + width / 2 + (side > 0 ? reach : 0)
      const hi = laneHi - width / 2 - (side < 0 ? reach : 0)
      const c = hi > lo ? lo + rnd(seed + 8) * (hi - lo) : (laneLo + laneHi) / 2
      // Every streak in a current travels together, at the current's own pace.
      const head = ((((travel + start + (k * period) / per) % period) + period) % period)
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

// ─── Lantern wind, the other look: folded paper strips with arrows ─────────
//
// The concept art's currents: wide strips of washi paper laid along the flow, each folded into
// facets that step a little sideways (one lit, one in shadow, by turns), printed with arrows that
// travel downstream at the current's own pace. A regular current is all blue paper with double
// chevrons; a Super Stream is golden paper with bold solid arrowheads and speed dashes. Drawn into the
// shared wind layer and faded out at the box's two ends, like the gust streaks.
/** One folded strip's facets: one segment long each, shifted sideways by its fold, shaded by turns,
 *  each a piece of the painted washi (else flat colour), with its crease and cut edges. */
const drawStripFacets = (
  g: CanvasRenderingContext2D, i: number, c: number, sw: number, along: number, seg: number, sup: boolean,
  col: number[], alpha: number, wp: HTMLImageElement | null, swatch: Rect | null
): void => {
  const fold = sw * 0.09
  const n = Math.ceil(along / seg) + 1
  for (let k = 0; k < n; k++) {
    const x0 = -along / 2 + k * seg
    const off = (k % 2 ? 1 : -1) * fold
    const shade = k % 2 ? 0.84 : 1
    g.beginPath()
    g.moveTo(x0, c - sw / 2 + off)
    g.lineTo(x0 + seg, c - sw / 2 - off)
    g.lineTo(x0 + seg, c + sw / 2 - off)
    g.lineTo(x0, c + sw / 2 + off)
    g.closePath()
    if (wp && swatch) {
      // A piece of the painted washi, from a different place of the swatch for every facet.
      g.save()
      g.clip()
      g.globalAlpha = alpha
      const sw0 = swatch.x1 - swatch.x0
      const sh0 = swatch.y1 - swatch.y0
      const cwid = Math.min(sw0, sh0) * 0.5
      // Clear of the swatch's painted rim.
      const inset = Math.min(sw0, sh0) * 0.06
      const sx = swatch.x0 + inset + rnd(i * 31 + k * 7) * (sw0 - cwid - 2 * inset)
      const sy = swatch.y0 + inset + rnd(i * 17 + k * 13 + 5) * (sh0 - cwid - 2 * inset)
      g.drawImage(wp, sx, sy, cwid, cwid * ((sw + 2 * fold) / seg), x0, c - sw / 2 - fold, seg, sw + 2 * fold)
      if (shade < 1) {
        g.globalAlpha = alpha * 0.22
        g.fillStyle = '#1a1638'
        g.fillRect(x0, c - sw / 2 - fold, seg, sw + 2 * fold)
      }
      g.restore()
    } else {
      g.fillStyle = `rgba(${Math.round(col[0]! * shade)}, ${Math.round(col[1]! * shade)}, ${Math.round(col[2]! * shade)}, ${alpha})`
      g.fill()
    }
    // The crease, and the strip's cut edges.
    g.strokeStyle = `rgba(42, 29, 58, ${sup ? 0.4 : 0.3})`
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(x0 + seg, c - sw / 2 - off)
    g.lineTo(x0 + seg, c + sw / 2 - off)
    g.moveTo(x0, c - sw / 2 + off)
    g.lineTo(x0 + seg, c - sw / 2 - off)
    g.moveTo(x0, c + sw / 2 + off)
    g.lineTo(x0 + seg, c + sw / 2 - off)
    g.stroke()
  }
}

/** Room round the cached strips for their folds and antialiased rims (world px). */
const PAPER_PAD = 8
/** A cache bigger than this (device px) is not made: the strips are drawn facet by facet instead. */
const PAPER_CACHE_MAX_PX = 8_000_000
const paperBodies = new WeakMap<WindDef, { key: string; canvas: HTMLCanvasElement }>()
/** A current's folded strips, drawn once into a canvas in the current's own frame (along x, across
 *  y), at the screen's device-px scale rounded UP to an eighth, so the copy is never softer than
 *  drawing it live. Redrawn only when the zoom moves to another eighth or the washi arrives. */
const foldedStrips = (
  def: WindDef, along: number, across: number, strips: number, gap: number, seg: number, scale: number,
  sup: boolean, col: number[], alpha: number, wp: HTMLImageElement | null, swatch: Rect | null, fadeLen: number,
  field: PaperField, layerAlpha: number
): HTMLCanvasElement | null => {
  if (typeof document === 'undefined' || !(scale > 0)) return null
  const k = Math.ceil(scale * 8) / 8
  const key = `${along}|${across}|${strips}|${seg}|${sup}|${k}|${fadeLen}|${field.alpha}|${field.f}|${wp && swatch ? 1 : 0}`
  const have = paperBodies.get(def)
  if (have?.key === key) return have.canvas
  const cw = Math.ceil((along + 2 * PAPER_PAD) * k)
  const chh = Math.ceil((across + 2 * PAPER_PAD) * k)
  if (cw * chh > PAPER_CACHE_MAX_PX) return null
  const canvas = have?.canvas ?? document.createElement('canvas')
  canvas.width = cw
  canvas.height = chh
  const g = canvas.getContext('2d')
  if (!g) return null
  g.setTransform(cw / (along + 2 * PAPER_PAD), 0, 0, chh / (across + 2 * PAPER_PAD), 0, 0)
  g.translate(along / 2 + PAPER_PAD, across / 2 + PAPER_PAD)
  for (let i = 0; i < strips; i++) drawStripFacets(g, i, -across / 2 + gap * (i + 0.5), Math.min(gap * 0.56, 58), along, seg, sup, col, alpha, wp, swatch)
  // Faded in at the upstream end and out at the downstream end, and nothing outside the box.
  g.globalCompositeOperation = 'destination-out'
  const inFade = g.createLinearGradient(-along / 2, 0, -along / 2 + fadeLen, 0)
  inFade.addColorStop(0, 'rgba(0, 0, 0, 1)')
  inFade.addColorStop(1, 'rgba(0, 0, 0, 0)')
  g.fillStyle = inFade
  g.fillRect(-along / 2 - PAPER_PAD, -across / 2 - PAPER_PAD, fadeLen + PAPER_PAD, across + 2 * PAPER_PAD)
  const outFade = g.createLinearGradient(along / 2 - fadeLen, 0, along / 2, 0)
  outFade.addColorStop(0, 'rgba(0, 0, 0, 0)')
  outFade.addColorStop(1, 'rgba(0, 0, 0, 1)')
  g.fillStyle = outFade
  g.fillRect(along / 2 - fadeLen, -across / 2 - PAPER_PAD, fadeLen + PAPER_PAD, across + 2 * PAPER_PAD)
  g.fillStyle = '#000'
  g.fillRect(-along / 2 - PAPER_PAD, -across / 2 - PAPER_PAD, along + 2 * PAPER_PAD, PAPER_PAD)
  g.fillRect(-along / 2 - PAPER_PAD, across / 2, along + 2 * PAPER_PAD, PAPER_PAD)
  // The current's faint field, under the strips (it was a second fill of the whole current every
  // frame), at its own strength once the cache is laid down at layerAlpha.
  g.globalCompositeOperation = 'destination-over'
  g.globalAlpha = Math.min(1, field.alpha / layerAlpha)
  softRect(g, field.tex, -along / 2, -across / 2, along, across, field.f)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  paperBodies.set(def, { key, canvas })
  return canvas
}

/** The faint field under the strips: its feathered texture, alpha and feather width. */
interface PaperField { tex: HTMLCanvasElement; alpha: number; f: number }
const paperStrips = (ctx: CanvasRenderingContext2D, live: WindDef, def: WindDef, w: World, field: PaperField): void => {
  const sup = !!live.super
  const vertical = live.dir === 'up' || live.dir === 'down'
  const along = vertical ? live.h : live.w
  const across = vertical ? live.w : live.h
  const angle = live.dir === 'right' ? 0 : live.dir === 'left' ? Math.PI : live.dir === 'down' ? Math.PI / 2 : -Math.PI / 2
  const travel = travelOf(def, live, w.time)
  const m = ctx.getTransform()
  // Strips about 70 px apart, all alike: blue paper for a regular current, golden paper for a
  // Super Stream — the two read apart at a glance.
  const strips = Math.max(1, Math.round(across / 70))
  const gap = across / strips
  const seg = Math.max(34, Math.min(64, gap * 0.9))
  const col = sup ? [246, 196, 72] : [132, 168, 222]
  const alpha = sup ? 0.92 : 0.62
  const ink = sup ? '#5a2c0c' : '#1f2a4a'
  const layerAlpha = sup ? 0.95 : 0.88
  const fadeLen = Math.min(along * 0.18, 56)
  // The painted washi and marks (wind-paper sheet), when they shipped; else flat colour and drawn marks.
  const wp = sheetImage('wind-paper') as HTMLImageElement | null
  const wps = wp ? sheet('wind-paper') : null
  const wpBoxes = wp && wps ? boxesOf(wp, wps) : null
  const swatch = wpBoxes && wps ? wpBoxes[wps.anims[sup ? 'paperGold' : 'paperBlue']!.frames[0]!]! : null
  const mark = wpBoxes && wps ? wpBoxes[wps.anims[sup ? 'arrow' : 'chevron']!.frames[0]!]! : null
  // The folded strips never change (only the marks travel): drawn once per current and zoom into a
  // cache with their end fades, then laid straight onto the scene each frame, the marks over them,
  // each faded by where it is. Re-drawing every facet each frame (a clip, a scaled cut of the washi
  // sheet, a shade and a crease, dozens per current) and compositing a wind layer the size of the
  // current held a weak phone to ~5 fps.
  const body = foldedStrips(def, along, across, strips, gap, seg, Math.hypot(m.a, m.b), sup, col, alpha, wp, swatch, fadeLen, field, layerAlpha)
  if (!body) {
    ctx.save()
    ctx.globalAlpha = field.alpha
    softRect(ctx, field.tex, live.x, live.y, live.w, live.h, field.f)
    ctx.restore()
  }
  let g: CanvasRenderingContext2D
  let bx = 0, by = 0, bw = 0, bh = 0
  if (body) {
    g = ctx
    g.save()
    g.translate(live.x + live.w / 2, live.y + live.h / 2)
    g.rotate(angle)
    g.globalAlpha = layerAlpha
    g.drawImage(body, -along / 2 - PAPER_PAD, -across / 2 - PAPER_PAD, along + 2 * PAPER_PAD, across + 2 * PAPER_PAD)
  } else {
    const layer = windLayerFor(ctx.canvas)
    if (!layer) return
    g = layer
    const corners = [[live.x, live.y], [live.x + live.w, live.y], [live.x, live.y + live.h], [live.x + live.w, live.y + live.h]].map(([x, y]) => m.transformPoint({ x, y }))
    bx = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))) - 2)
    by = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))) - 2)
    bw = Math.min(g.canvas.width, Math.ceil(Math.max(...corners.map((p) => p.x))) + 2) - bx
    bh = Math.min(g.canvas.height, Math.ceil(Math.max(...corners.map((p) => p.y))) + 2) - by
    if (bw <= 0 || bh <= 0) return
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(bx, by, bw, bh)
    g.setTransform(m)
    g.save()
    g.translate(live.x + live.w / 2, live.y + live.h / 2)
    g.rotate(angle)
  }
  /** A mark's share of its own alpha: faded in and out over the box's two ends, like the strips. */
  const markFade = (x: number): number => {
    if (!body) return 1
    const u = Math.min(x + along / 2, along / 2 - x) / Math.max(1, fadeLen)
    return u <= 0 ? 0 : Math.min(1, u) * layerAlpha
  }
  for (let i = 0; i < strips; i++) {
    const c = -across / 2 + gap * (i + 0.5)
    const sw = Math.min(gap * 0.56, 58)
    if (!body) drawStripFacets(g, i, c, sw, along, seg, sup, col, alpha, wp, swatch)
    // The marks, travelling with the current.
    const step = seg * (sup ? 1.25 : 1.6)
    const head = sw * (sup ? 0.36 : 0.26)
    g.strokeStyle = ink
    g.fillStyle = ink
    g.lineCap = 'round'
    g.lineJoin = 'round'
    const shift = (((travel + i * step * 0.37) % step) + step) % step
    for (let x = -along / 2 - step + shift; x < along / 2 + step; x += step) {
      const fade = markFade(x)
      if (fade <= 0) continue
      if (wp && mark) {
        // The painted mark, printed on the strip and travelling with it.
        const mh = head * 2.1
        const mw = (mh * (mark.x1 - mark.x0)) / Math.max(1, mark.y1 - mark.y0)
        g.globalAlpha = (sup ? 0.9 : 0.7) * fade
        g.drawImage(wp, mark.x0, mark.y0, mark.x1 - mark.x0, mark.y1 - mark.y0, x - mw / 2, c - mh / 2, mw, mh)
        continue
      }
      if (sup) {
        // A Super Stream: a bold solid arrowhead with two speed dashes trailing it.
        g.globalAlpha = 0.85 * fade
        g.beginPath()
        g.moveTo(x + head * 0.9, c)
        g.lineTo(x - head * 0.35, c - head)
        g.lineTo(x - head * 0.05, c)
        g.lineTo(x - head * 0.35, c + head)
        g.closePath()
        g.fill()
        g.globalAlpha = 0.6 * fade
        g.lineWidth = Math.max(2, sw * 0.07)
        g.beginPath()
        g.moveTo(x - head * 0.75, c - head * 0.42)
        g.lineTo(x - head * 1.55, c - head * 0.42)
        g.moveTo(x - head * 0.75, c + head * 0.42)
        g.lineTo(x - head * 1.55, c + head * 0.42)
        g.stroke()
      } else {
        // A regular current: a double chevron.
        g.globalAlpha = 0.6 * fade
        g.lineWidth = Math.max(2, sw * 0.08)
        g.beginPath()
        for (const d of [0, head * 0.85]) {
          g.moveTo(x + d - head * 0.5, c - head)
          g.lineTo(x + d + head * 0.4, c)
          g.lineTo(x + d - head * 0.5, c + head)
        }
        g.stroke()
      }
    }
    g.globalAlpha = 1
  }
  if (body) {
    g.restore()
    return
  }
  // Fade in at the upstream end and out at the downstream end, like the streaks.
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
  // Nothing outside the box.
  g.fillStyle = '#000'
  g.fillRect(-along / 2 - 200, -across / 2 - 200, along + 400, 200)
  g.fillRect(-along / 2 - 200, across / 2, along + 400, 200)
  g.globalCompositeOperation = 'source-over'
  g.restore()
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = layerAlpha
  ctx.drawImage(g.canvas, bx, by, bw, bh, bx, by, bw, bh)
  ctx.restore()
}

// ─── Clay wind: rolled-clay arrows, ribbons and leaves ──────────────────────
//
// The concept art's currents, made consistent: a soft pale-blue clay field; rows of small rolled-clay
// arrows on an even grid, all one size; a few painted rolled-clay swooshes (tapered, curling at their
// head) gliding along; and a few autumn leaves tumbling with the flow.
// Everything travels downstream at the current's own pace (travelOf) and fades in and out at the
// box's two ends. A Super Stream is the same in warm orange clay.
const clayArrow = (g: CanvasRenderingContext2D, x: number, y: number, size: number, cols: [string, string]): void => {
  // A short rolled shaft and a chunky head, the clay's light side on top.
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (const [dy, col, wk] of [[size * 0.08, cols[0], 1], [0, cols[1], 1]] as const) {
    g.strokeStyle = col
    g.fillStyle = col
    g.lineWidth = size * 0.26 * wk
    g.beginPath()
    g.moveTo(x - size * 0.55, y + dy)
    g.lineTo(x + size * 0.05, y + dy)
    g.stroke()
    g.lineWidth = size * 0.12
    g.beginPath()
    g.moveTo(x + size * 0.55, y + dy)
    g.lineTo(x - size * 0.02, y - size * 0.4 + dy)
    g.lineTo(x - size * 0.02, y + size * 0.4 + dy)
    g.closePath()
    g.fill()
    g.stroke()
  }
}

const clayLeaf = (g: CanvasRenderingContext2D, x: number, y: number, size: number, turn: number, col: string): void => {
  g.save()
  g.translate(x, y)
  g.rotate(turn)
  g.fillStyle = col
  g.beginPath()
  g.moveTo(-size, 0)
  g.quadraticCurveTo(0, -size * 0.75, size, 0)
  g.quadraticCurveTo(0, size * 0.75, -size, 0)
  g.fill()
  g.strokeStyle = 'rgba(90, 40, 12, 0.6)'
  g.lineWidth = Math.max(1, size * 0.12)
  g.beginPath()
  g.moveTo(-size * 0.8, 0)
  g.lineTo(size * 0.8, 0)
  g.stroke()
  g.restore()
}

/** One tile of the clay arrow grid: `step` wide and two rows tall, an arrow at the start of the first
 *  row (and again at its end, so the tile wraps without a seam) and one half a step on in the second.
 *  Drawn at the screen's device-px scale rounded UP to an eighth, so the pattern is never softer
 *  than drawing the arrows live. */
const arrowTiles = new Map<string, HTMLCanvasElement>()
const clayArrowTile = (size: number, rowGap: number, step: number, scale: number, sup: boolean, cols: [string, string]): HTMLCanvasElement | null => {
  if (typeof document === 'undefined' || !(scale > 0)) return null
  const k = Math.ceil(scale * 8) / 8
  const key = `${size.toFixed(2)}|${rowGap.toFixed(2)}|${step}|${k}|${sup}`
  const have = arrowTiles.get(key)
  if (have) return have
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(step * k))
  c.height = Math.max(1, Math.round(2 * rowGap * k))
  const g = c.getContext('2d')
  if (!g) return null
  g.scale(c.width / step, c.height / (2 * rowGap))
  for (const x of [0, step]) clayArrow(g, x, rowGap * 0.5, size, cols)
  clayArrow(g, step / 2, rowGap * 1.5, size, cols)
  if (arrowTiles.size > 32) arrowTiles.clear()
  arrowTiles.set(key, c)
  return c
}

const clayWind = (ctx: CanvasRenderingContext2D, live: WindDef, def: WindDef, w: World): void => {
  const sup = !!live.super
  const vertical = live.dir === 'up' || live.dir === 'down'
  const along = vertical ? live.h : live.w
  const across = vertical ? live.w : live.h
  const angle = live.dir === 'right' ? 0 : live.dir === 'left' ? Math.PI : live.dir === 'down' ? Math.PI / 2 : -Math.PI / 2
  const travel = travelOf(def, live, w.time)
  const m = ctx.getTransform()
  const layerAlpha = sup ? 0.95 : 0.9
  const fadeLen = Math.min(along * 0.18, 56)
  // Weak phones (liteMode.ts): everything goes straight onto the scene, each piece faded by where it
  // is, instead of through a wind layer the size of the current (cleared, filled, faded and laid
  // down again every frame: two more fills of the whole current).
  const direct = liteMode.value
  /** A piece's share of its alpha at x along the current: faded in and out over the two ends. */
  const endFade = (x: number): number => {
    if (!direct) return 1
    const u = Math.min(x + along / 2, along / 2 - x) / Math.max(1, fadeLen)
    return u <= 0 ? 0 : Math.min(1, u) * layerAlpha
  }
  if (direct) {
    ctx.save()
    ctx.translate(live.x + live.w / 2, live.y + live.h / 2)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.rect(-along / 2, -across / 2, along, across)
    ctx.clip()
    clayWindPieces(ctx, live, def, w, along, across, travel, m, endFade, direct)
    ctx.restore()
    return
  }
  const g = windLayerFor(ctx.canvas)
  if (!g) return
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
  g.beginPath()
  g.rect(-along / 2, -across / 2, along, across)
  g.clip()
  clayWindPieces(g, live, def, w, along, across, travel, m, endFade, direct)
  // Fade in at the upstream end and out at the downstream end.
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
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = layerAlpha
  ctx.drawImage(g.canvas, bx, by, bw, bh, bx, by, bw, bh)
  ctx.restore()
}

/** The clay current's moving pieces, in its own frame (along x, across y): the arrow grid, the
 *  painted gusts and the leaves. `direct`: drawn onto the scene with `endFade` per piece (the arrow
 *  grid in a few bands at each end); else into the wind layer, which the caller fades and lays down. */
const clayWindPieces = (
  g: CanvasRenderingContext2D, live: WindDef, def: WindDef, w: World, along: number, across: number,
  travel: number, m: DOMMatrix, endFade: (x: number) => number, direct: boolean
): void => {
  const sup = !!live.super
  const fadeLen = Math.min(along * 0.18, 56)
  const ribbonCols: [string, string, string] = sup ? ['#b4561e', '#e8803a', '#ffc28a'] : ['#7e9fbe', '#bcd4e8', '#eef5fb']
  const arrowCols: [string, string] = sup ? ['#7a3510', '#c45a1c'] : ['#3c5a78', '#5f86ab']
  // The arrow grid: rows 44 px apart, an arrow every 58 px, every other row half a step on.
  const rows = Math.max(1, Math.round(across / 44))
  const rowGap = across / rows
  const step = 58
  const size = Math.min(16, rowGap * 0.42)
  const shift = ((travel % step) + step) % step
  const tile = clayArrowTile(size, rowGap, step, Math.hypot(m.a, m.b), sup, arrowCols)
  const pat = tile ? g.createPattern(tile, 'repeat') : null
  g.globalAlpha = 0.8
  if (tile && pat) {
    // The grid is one tile (two rows, the second half a step on) repeated and slid along: drawing a
    // hundred-odd arrows one by one in every current, every frame, cost a phone most of its frame.
    pat.setTransform(new DOMMatrix().translateSelf(-along / 2 + shift, -across / 2).scaleSelf(step / tile.width, (2 * rowGap) / tile.height))
    g.fillStyle = pat
    if (!direct) {
      g.fillRect(-along / 2, -across / 2, along, across)
    } else {
      // The middle at full strength, each end in FADE_BANDS steps (the arrows are small and far
      // apart: the steps do not show).
      const FADE_BANDS = 5
      const band = fadeLen / FADE_BANDS
      g.globalAlpha = 0.8 * endFade(0)
      g.fillRect(-along / 2 + fadeLen, -across / 2, along - 2 * fadeLen, across)
      for (let k = 0; k < FADE_BANDS; k++) {
        g.globalAlpha = 0.8 * endFade(-along / 2 + band * (k + 0.5))
        g.fillRect(-along / 2 + band * k, -across / 2, band, across)
        g.fillRect(along / 2 - band * (k + 1), -across / 2, band, across)
      }
    }
  } else {
    for (let r = 0; r < rows; r++) {
      const c = -across / 2 + rowGap * (r + 0.5)
      const rs = (((travel + (r % 2) * step * 0.5) % step) + step) % step
      for (let x = -along / 2 - step + rs; x < along / 2 + step; x += step) clayArrow(g, x, c, size, arrowCols)
    }
  }
  g.globalAlpha = 1
  // The gusts: the painted clay gusts (clay-wind sheet: a twisted rope and three curls), one per
  // ~120 px across, gliding along at the current's pace, the two by turns. No sheet yet: arrows and
  // leaves alone.
  const cw = sheetImage('clay-wind') as HTMLImageElement | null
  if (cw) {
    const cs = sheet('clay-wind')
    const boxes = boxesOf(cw, cs)
    const ribbons = Math.max(1, Math.round(across / 120))
    const lane = across / ribbons
    for (let i = 0; i < ribbons; i++) {
      const r = boxes[cs.anims[(sup ? 'orange' : 'blue') + (i % 2 ? 'B' : 'A')]!.frames[0]!]!
      // Drawn at the painting's own proportions, never stretched along the flow: as tall as most
      // of its lane allows (64 at most), its length following from that, and both shrunk together
      // when that would run past three fifths of the current.
      const aspect = (r.x1 - r.x0) / Math.max(1, r.y1 - r.y0)
      let h = Math.min(lane * 0.8, 64)
      let len = h * aspect
      if (len > along * 0.6) {
        len = along * 0.6
        h = len / aspect
      }
      const period = along + len + 40
      const head = ((((travel + rnd(i * 7.3 + def.x * 0.01) * period) % period) + period) % period) - along / 2
      const c = -across / 2 + lane * (i + 0.5)
      const fade = endFade(head - len / 2)
      if (fade <= 0) continue
      g.globalAlpha = fade
      g.drawImage(cw, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, head - len, c - h / 2, len, h)
    }
  }
  // Leaves: one per ~90 px of the current's length, tumbling a little as they go.
  const leaves = Math.max(1, Math.round(along / 90))
  for (let i = 0; i < leaves; i++) {
    const period = along + 40
    const x = ((((travel * 1.05 + (i * period) / leaves) % period) + period) % period) - along / 2 - 20
    const c = -across / 2 + across * (0.15 + 0.7 * rnd(i * 3.1 + def.y * 0.01))
    const bob = Math.sin(w.time * 2.4 + i * 1.7) * 4
    const fade = endFade(x)
    if (fade <= 0) continue
    g.globalAlpha = fade
    clayLeaf(g, x, c + bob, sup ? 11 : 10, Math.sin(w.time * 1.8 + i) * 0.9 + i, sup ? '#f2a03a' : '#d9822b')
  }
  g.globalAlpha = 1
}

const wind = (ctx: CanvasRenderingContext2D, live: WindDef, def: WindDef, w: World): boolean => {
  // The soft field rides with the painted wisps: no wisps sheet, the vector current. The painted game
  // (lantern, clay) draws its own gust streaks and needs no sheet.
  const img = paintedOn ? sheetImage('wind-wisps') : null
  if (!img && !(paintedOn && paintedGame)) return false
  const sup = !!live.super
  const f = Math.max(10, Math.min(56, live.w / 2, live.h / 2))
  if (live.speed > 0 && paintedGame) {
    const tex = feather(sup ? SUPER_RGB : isClay ? CLAY_RGB : NORMAL_RGB, false)
    if (!tex) return false
    // A clearly readable current: a denser fill with a short feather, so its edge (where the push
    // ends) reads at a glance without a drawn border.
    // The paper strips carry their own colour: under them the field stays faint.
    // The folded strips: lantern's washi, and clay's default wind once its clay slabs have shipped
    // (the clay gusts and arrow grid are the other look, and the fallback until then).
    const paper = windStyle.value === 'paper' && (isLantern || (isClay && hasSheet('wind-paper')))
    ctx.save()
    // The clay current is a soft pale-blue (or orange) clay field of its own; the paper strips carry
    // their own colour, so under them the field stays faint.
    ctx.globalAlpha = isClay ? (sup ? 0.34 : 0.3) : paper ? (sup ? 0.14 : 0.1) : sup ? 0.3 : 0.22
    // The paper strips carry their field in their cache (one fill of the current a frame, not two).
    if (!paper) softRect(ctx, tex, live.x, live.y, live.w, live.h, Math.min(f, 10))
    ctx.restore()
    if (paper) paperStrips(ctx, live, def, w, { tex, alpha: sup ? 0.14 : 0.1, f: Math.min(f, 10) })
    else if (isClay) clayWind(ctx, live, def, w)
    else windGusts(ctx, live, def, w)
  } else if (live.speed > 0 && img) {
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
const collectRing = (ctx: CanvasRenderingContext2D, x: number, y: number, time: number, phase: number, hoop = true): void => {
  const R = STAR_R * 1.4
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.6 + phase)
  ctx.save()
  if (hoop) {
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
  }
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
    if (paintedGame) collectRing(ctx, st.x, cy, time, phase, !isClay)
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
  if (isClay) {
    // The clay warp pipe: rim, stretched tube, base; a slow swirl of light turning in its mouth.
    cell(ctx, s, img, 0, 1, g.x, g.y + rimH - 0.5, g.w, g.h - rimH - baseH + 1, 1)
    if (baseH > 0) cell(ctx, s, img, 0, 2, g.x, g.y + g.h - baseH, g.w, baseH)
    cell(ctx, s, img, 0, 0, g.x, g.y, g.w, rimH)
    ctx.save()
    ctx.lineCap = 'round'
    for (let k = 0; k < 2; k++) {
      ctx.strokeStyle = `rgba(200, 255, 220, ${0.35 + 0.2 * Math.sin(time * 3 + k * 2)})`
      ctx.lineWidth = Math.max(1.5, g.w * 0.03)
      ctx.beginPath()
      ctx.ellipse(g.x + g.w / 2, g.y + rimH * 0.42, Math.max(2, g.w * (0.28 - k * 0.1)), Math.max(1.5, rimH * (0.2 - k * 0.07)), 0, time * 3 + k * Math.PI, time * 3 + k * Math.PI + Math.PI * 1.3)
      ctx.stroke()
    }
    ctx.restore()
    return true
  }
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

/** The clay finish: the post office's doorstep laid across the platform, a red postbox standing on
 *  its right end, a little flag on its left, and a row of bunting swaying under its front edge. */
const finishPost = (ctx: CanvasRenderingContext2D, p: PlatformDef, time: number): boolean => {
  if (!hasSheet('finish-dais')) return false
  const img = sheetImage('finish-dais') as HTMLImageElement | null
  if (!img) return false
  const s = sheet('finish-dais')
  const boxes = boxesOf(img, s)
  // By panel: the game reads the lantern manifest's names for this sheet, the clay set paints its
  // own pieces in the same four panels (doorstep, postbox, flag, bunting).
  const PANEL_OF: Record<string, number> = { dais: 0, postbox: 1, flag: 2, bunting: 3 }
  const at = (k: string) => boxes[PANEL_OF[k]!]!
  const d = at('dais')
  const x = p.x - 6
  const w = p.w + 12
  const dh = Math.max(24, Math.min(64, (w * (d.y1 - d.y0)) / (d.x1 - d.x0)))
  const y = p.y - dh * DAIS_TOP
  ctx.drawImage(img, d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0, x, y, w, dh)
  // The bunting wraps round the oval's front rim, in front of the slab: each pennant hangs from a
  // point on the slab's own edge (evenly round the lower half of the ellipse), so the strip follows
  // the curve up toward the round ends; a string sagging a little between the points ties them.
  const b = at('bunting')
  const n = Math.max(4, Math.round(w / 24))
  const bh = Math.max(10, Math.min(20, dh * 0.45))
  const bw = (bh * (b.x1 - b.x0)) / (b.y1 - b.y0)
  const ex = x + w / 2
  const ey = y + dh / 2
  const tie = (i: number): [number, number] => {
    const th = Math.PI * (0.1 + (0.8 * i) / (n - 1))
    return [ex + Math.cos(th) * (w / 2) * 0.97, ey + Math.sin(th) * (dh / 2) * 0.93]
  }
  ctx.save()
  ctx.strokeStyle = '#8a6a3a'
  ctx.lineWidth = Math.max(1, bh * 0.08)
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const [tx, ty] = tie(i)
    if (i === 0) { ctx.moveTo(tx, ty); continue }
    const [px, py] = tie(i - 1)
    ctx.quadraticCurveTo((px + tx) / 2, (py + ty) / 2 + bh * 0.22, tx, ty)
  }
  ctx.stroke()
  ctx.restore()
  // The painted pennant without its own bit of string: its top fifth is cut off.
  const top = b.y0 + (b.y1 - b.y0) * 0.18
  for (let i = 0; i < n; i++) {
    const [tx, ty] = tie(i)
    ctx.save()
    ctx.translate(tx, ty)
    ctx.rotate(Math.sin(time * 1.8 + i * 0.8) * 0.1)
    const pw = bw * 0.7
    ctx.drawImage(img, b.x0 + (b.x1 - b.x0) * 0.15, top, (b.x1 - b.x0) * 0.7, b.y1 - top, -pw / 2, 0, pw, bh * 0.82)
    ctx.restore()
  }
  // The postbox and the flag stand on the doorstep's top, at its two ends.
  // The doorstep is an oval slab seen from above: the postbox and the flag stand ON it, set in from its
  // round ends to where the slab is deep enough (u = ±0.7 of its half-width), each with a soft contact
  // shadow, at the same depth — not perched on the curved rim.
  const cxs = x + w / 2
  const cys = y + dh / 2
  const stand = (k: string, h: number, u: number, sway = 0) => {
    const r = at(k)
    const ww = (h * (r.x1 - r.x0)) / (r.y1 - r.y0)
    const sx = cxs + (u * w) / 2
    const sy = cys - dh * 0.06
    ctx.save()
    ctx.fillStyle = 'rgba(40, 30, 20, 0.28)'
    ctx.beginPath()
    ctx.ellipse(sx + ww * 0.08, sy, ww * 0.55, Math.max(1.5, dh * 0.07), 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.translate(sx, sy)
    ctx.rotate(sway)
    ctx.drawImage(img, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, -ww / 2, -h, ww, h)
    ctx.restore()
  }
  stand('flag', Math.min(40, dh * 1.1), -0.7, Math.sin(time * 1.3) * 0.03)
  stand('postbox', Math.min(46, dh * 1.25), 0.7)
  return true
}

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

/** High-DPR phones (not the weak phones' light look): the sky layer's 2x twin once it has loaded,
 *  drawn in the 1x one's place — sizes still come from the 1x image. */
const sharp = (id: string, img: HTMLImageElement): HTMLImageElement => (liteMode.value ? null : sharpImage(id)) ?? img

/** `lanterns`: the rising sky lanterns (left out of the weak phones' merged still sky). */
const layeredBackdrop = (ctx: CanvasRenderingContext2D, cw: number, ch: number, u: number, v: number, t: number, far: HTMLImageElement, lanterns = true): void => {
  // The far plate covers the screen with a little room to spare and slides by where the camera
  // looks inside the level (u, v ∈ −½..½).
  const k = Math.max(cw / PLATE.w, ch / PLATE.h) * 1.08
  const plate = (depth: number): Frame => {
    const dw = PLATE.w * k
    const dh = PLATE.h * k
    return { x: (cw - dw) / 2 - u * Math.min(dw - cw, cw * SLIDE_MAX) * depth, y: (ch - dh) / 2 - v * (dh - ch) * depth, k, dw, dh }
  }
  const f = plate(1)
  ctx.drawImage(sharp('backdrop-far', far), f.x, f.y, f.dw, f.dh)

  // The big clouds: their own slow drift (wrapping round the plate), a little more parallax than the plate.
  for (const c of FAR_CLOUDS) {
    const img = sheetImage(c.id)
    if (!img) continue
    const p = plate(1 + c.depth)
    const span = PLATE.w + img.width
    const px = ((((c.x + t * c.drift + img.width) % span) + span) % span) - img.width
    ctx.drawImage(sharp(c.id, img), p.x + px * k, p.y + c.y * k, img.width * k, img.height * k)
  }

  // Sky lanterns: each rises from above the mountains to the top and fades in and out, swaying;
  // the far ones smaller, dimmer, slower and with less parallax.
  const imgs = LANTERN_IDS.map((id) => sheetImage(id)).filter((x): x is HTMLImageElement => !!x)
  if (imgs.length && lanterns) {
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
      ctx.drawImage(sharp(c.id, img), x + px * kn, yTop + (c.y - NEAR_TOP) * kn, img.width * s, img.height * s)
    }
    ctx.drawImage(sharp('backdrop-near', near), x, yTop, dw, dh)
    // Below the band (when the town rises) the town's own ground carries on to the screen's edge.
    if (yTop + dh < ch) ctx.drawImage(near, 0, near.height - 2, near.width, 2, x, yTop + dh - 1, dw, ch - yTop - dh + 1)
  }
}

/** Weak phones (liteMode.ts): the sky's layers merged once into one still picture of the screen's
 *  size, the camera centred and no lanterns, then laid down as a single unscaled copy a frame —
 *  instead of five or six stretched, high-quality draws and thirty lanterns. Remade when the screen
 *  changes size or another layer finishes loading. */
let skyStill: { key: string; canvas: HTMLCanvasElement } | null = null

let stillKey = ''
/** Weak phones: keep the background canvas painted (the base colour and the merged sky),
 *  repainting only when the screen size or a layer changes. */
const stillBackdrop = (canvas: HTMLCanvasElement, fullBleed: boolean): boolean => {
  const t = stillSkyCanvas
  // Lantern: the parallax layers merged; clay: its one painting, centred.
  const far = sheetImage('backdrop-far')
  const single = far ? null : sheetImage('backdrop')
  const on = !!t && t.main === canvas && liteMode.value && paintedOn && !!(far || single)
  if (t) t.bg.hidden = !on
  if (!on || !t) return false
  const cw = canvas.width
  const ch = canvas.height
  const sky = far ? mergedSky(cw, ch, far) : single
  if (!sky) return false
  const key = `${far ? skyStill?.key : `${cw}x${ch}|single`}|${fullBleed}`
  if (key !== stillKey || t.bg.width !== cw || t.bg.height !== ch) {
    if (t.bg.width !== cw || t.bg.height !== ch) {
      t.bg.width = cw
      t.bg.height = ch
    }
    const g = t.bg.getContext('2d')
    if (!g) return false
    g.fillStyle = '#0d1018'
    g.fillRect(0, 0, cw, ch)
    if (far) {
      g.drawImage(sky, 0, 0)
    } else {
      const k = Math.max(cw / sky.width, ch / sky.height) * 1.08
      g.imageSmoothingQuality = 'high'
      g.drawImage(sky, (cw - sky.width * k) / 2, (ch - sky.height * k) / 2, sky.width * k, sky.height * k)
    }
    stillKey = key
  }
  return true
}
const mergedSky = (cw: number, ch: number, far: HTMLImageElement): HTMLCanvasElement | null => {
  if (typeof document === 'undefined') return null
  const layers = [...FAR_CLOUDS, ...NEAR_CLOUDS].filter((c) => sheetImage(c.id)).length + (sheetImage('backdrop-near') ? 1 : 0)
  const key = `${cw}x${ch}|${layers}`
  if (skyStill?.key === key) return skyStill.canvas
  const canvas = skyStill?.canvas ?? document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const g = canvas.getContext('2d')
  if (!g) return null
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  layeredBackdrop(g, cw, ch, 0, 0, 0, far, false)
  skyStill = { key, canvas }
  return canvas
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
    const still = liteMode.value ? mergedSky(cw, ch, far) : null
    if (still) ctx.drawImage(still, 0, 0)
    else layeredBackdrop(ctx, cw, ch, u, v, w.time, far)
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
  cheerHand: () => cheerHandAt,
  backdrop,
  stillBackdrop,
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
