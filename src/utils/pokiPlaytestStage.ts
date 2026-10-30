// ─── Poki playtest recordings: the stage the recorder films ──────────────────
//
// Poki's Level-2 playtests film the game in the player's browser. Read from
// the shipped SDK core (poki-sdk-core a62e4fd…, 2026-09), not from the docs,
// which say nothing about it:
//
//   • The recorder films CANVASES, via `captureStream`: the ones handed to
//     `PokiSDK.playtestSetCanvas()`, else the LARGEST visible <canvas> on the
//     page (`data-poki-no-playtest="true"` opts one out). Every source is
//     stretched over the whole video frame; the video takes the first
//     source's on-screen size. Taps are drawn on top by the recorder itself.
//   • The DOM is not filmed unless `playtestCaptureHtmlOn()` is called — then
//     the SDK renders `document.body` to an image (html-to-image) about once a
//     second and lays it over the video. NOT used here: on this game's DOM one
//     capture is a 200–460 ms main-thread task on a desktop and 2.1–2.9 s at
//     4× CPU throttle (a mid-range phone) — a recorded player would get a
//     freeze every second, in the very sessions the test measures.
//
// This game is a DOM HUD round one board canvas, plus a full-window particle
// canvas for confetti and sparkles — the largest canvas on the page. So the
// recorder filmed the particle canvas: every playtest video was black but for
// confetti.
//
// Now:
//   • the particle canvas opts out (`data-poki-no-playtest`, ParticleCanvas);
//   • ONE window-sized stage canvas (in the DOM, invisible — the SDK only
//     needs it in the body) is the source. While the recorder films it (its
//     `captureStream` call is the signal) each frame paints, at their places
//     on screen: the scene backdrop, the board canvas, the particle canvas,
//     and a light outline of the HUD — every visible button and dialog as a
//     box with its own (already translated) label, so the recorder's tap
//     marks land on something readable. Recording-only; players never see it.
// Outside a recording the stage costs one idle canvas and nothing per frame.
//
// Playtest video (pt, 2026-09): the outline read as a broken UI. Each label
// was one line ("DANO · ×1 → ×1,25 · 12") that `fillText`'s maxWidth squeezed
// sideways into a 66 px chip, and the tray said "Bandeja de bolas: 2 de 2"
// where the player saw two balls. Now a label keeps the element's own lines,
// each sized down to fit (cut with "…" below MIN_FONT, never squeezed), in the
// game's font; and the tray is drawn from its own sockets, orb portraits, tier
// badges and count.

import { fontStackFor } from '@/i18n/localeDirection'

/** The element whose `background-image` is the scene backdrop (GameScene). */
export const STAGE_BG_ATTR = 'data-poki-stage-bg'
/** The game's own canvas: Umbrella's scene (the stage came from Elemental Barrage, whose board
 *  canvas was the only one it painted — Umbrella's recordings were the HUD outline over black). */
const BOARD_SEL = 'canvas.umbrella-canvas, .barrage-board__canvas'
const PARTICLES_SEL = 'canvas.particle-canvas'
/** What the HUD outline boxes: every button, a modal's panel and title, the
 *  tray, the wallet, and anything tagged `data-poki-hud` (the row badge). */
const HUD_SEL = 'button, .modal-frame, .ribbon-header, [data-tut="tray"], .coin-badge, [data-poki-hud]'
/** A panel: a box with no label of its own (its title and buttons have them). */
const PANEL_SEL = '.modal-frame'
/** Labelled by its aria-label first (a group's digits say little on their own). */
const ARIA_FIRST_SEL = '[role="group"]'
/** The page colour under the backdrop art (GameScene's gradient ends on it). */
const BASE_FILL = '#070a14'
/** The recorder encodes at 24 fps; painting faster buys nothing. */
const FRAME_MS = 1000 / 30
/** The HUD outline's boxes are re-read this often (a layout read, not per frame). */
const HUD_MS = 200
/** A label line longer than this is cut (the outline is a guide, not the UI). */
const LABEL_MAX = 34
/** The tray: drawn from its own sockets and orbs, not labelled. */
const TRAY_SEL = '[data-tut="tray"]'
/** HUD art the stage paints as itself (the boss preview): a round frame, its
 *  first image blacked out at its on-screen box and clipped to the frame, its
 *  `data-poki-stage-glow` children as embers. Read even when aria-hidden —
 *  decorative to a screen reader, not to someone watching. */
const ART_SEL = '[data-poki-stage-art="silhouette"]'
const GLOW_SEL = '[data-poki-stage-glow]'
/** Label type: the largest size (the real chips' names are 10–13 px), the
 *  smallest (a line still too wide there is cut), line height in sizes, and
 *  the room kept clear inside a box's outline (px). */
const MAX_FONT = 13
const MIN_FONT = 7
const LINE_H = 1.15
const PAD_X = 3
const PAD_Y = 2

interface PlaytestSdk {
  playtestSetCanvas?: (canvas: HTMLCanvasElement | HTMLCanvasElement[] | null) => void
}

/** One laid-out line: its (maybe cut) text, size, and centre from the box's top. */
export interface FitRow { text: string; size: number; y: number }
/** A bit of text in a box CSS sized to it (the tray count, an orb's badges):
 *  drawn at its own font size, with its own colours. */
interface HudPill { x: number; y: number; w: number; h: number; text: string; size: number; color: string; fill?: string; line?: string }
interface HudOrb {
  x: number
  y: number
  w: number
  h: number
  img: HTMLImageElement | null
  rim: string
  /** Its holder's opacity (a launched ball is dimmed). */
  alpha: number
  tier: HudPill | null
  count: HudPill | null
}
interface HudArt {
  x: number
  y: number
  w: number
  h: number
  img: HTMLImageElement | null
  /** The image's on-screen box (it may overhang the frame, which clips it). */
  shape: DOMRect | null
  glows: DOMRect[]
  /** "r, g, b" of its aura and its embers (the element's `--aura` / `--eye`). */
  aura: string
  eye: string
  alpha: number
}
interface HudBox {
  x: number
  y: number
  w: number
  h: number
  dialog: boolean
  /** What the player reads on it, a line per entry ("DANO", "×1 → ×1,25", "12"). */
  lines: string[]
  /** `lines` fitted to the box (`fitHud`, once per HUD read). */
  rows: FitRow[]
  /** The tray's parts, at their places (empty for every other box). */
  sockets: DOMRect[]
  orbs: HudOrb[]
  texts: HudPill[]
}

let stage: HTMLCanvasElement | null = null
/** T0.3 step 1: told once, the first time the recorder films the stage. */
let onRecordOnce: (() => void) | null = null
let ctx: CanvasRenderingContext2D | null = null
let raf = 0
let last = 0
let hudAt = -Infinity
let hud: HudBox[] = []
let hudArt: HudArt[] = []
const tracks: MediaStreamTrack[] = []
const bgArt = { url: '', img: null as HTMLImageElement | null }

const live = (): boolean => tracks.some((t) => t.readyState === 'live')

/** The backdrop element's art (its computed `background-image`), cached. */
const backdrop = (el: Element): HTMLImageElement | null => {
  const m = /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(el).backgroundImage || '')
  const url = m?.[1] ?? ''
  if (url !== bgArt.url) {
    bgArt.url = url
    bgArt.img = null
    if (url) {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => { if (bgArt.url === url) bgArt.img = img }
      img.src = url
    }
  }
  return bgArt.img
}

/** `img` over `r`, cover-fitted and centred (the CSS `background-size: cover`). */
const drawCover = (g: CanvasRenderingContext2D, img: HTMLImageElement, r: DOMRect): void => {
  const k = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight)
  const w = img.naturalWidth * k
  const h = img.naturalHeight * k
  g.drawImage(img, r.left + (r.width - w) / 2, r.top + (r.height - h) / 2, w, h)
}

/** A canvas at its place on screen (its backing store scaled to its box). */
const drawCanvasAt = (g: CanvasRenderingContext2D, c: HTMLCanvasElement | null): void => {
  if (!c || !c.isConnected || c.width === 0 || c.height === 0) return
  const r = c.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return
  g.drawImage(c, r.left, r.top, r.width, r.height)
}

const shown = (el: Element): boolean => {
  const check = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility
  return typeof check === 'function' ? check.call(el, { opacityProperty: true, visibilityProperty: true }) : true
}

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim()
const capLine = (s: string): string => s.length > LABEL_MAX ? `${s.slice(0, LABEL_MAX - 1)}…` : s

/** The element's text, a line per entry: `innerText` keeps a chip's name,
 *  value and price apart (flex items are blocks). */
const linesOf = (el: HTMLElement): string[] =>
  (el.innerText || el.textContent || '').split('\n').map(clean).filter(Boolean).map(capLine)

/** The game's (script-aware) font stack — `applyLocaleDirection` keeps it on
 *  <html> — behind the digits-only 'EB Digits', as `.hud-digits` has it:
 *  'Angry''s "2" reads as a "Z" ("1Z" coins, fonts.sass). */
const hudFont = (): string =>
  `'EB Digits', ${document.documentElement.style.getPropertyValue('--app-font-stack').trim() || fontStackFor('en')}`

const pill = (el: HTMLElement | null, fill?: string, line?: string): HudPill | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  const text = clean(el.textContent ?? '')
  if (r.width <= 0 || r.height <= 0 || !text) return null
  const cs = getComputedStyle(el)
  const size = parseFloat(cs.fontSize)
  return {
    x: r.left, y: r.top, w: r.width, h: r.height, text,
    size: Number.isFinite(size) && size > 0 ? size : Math.max(MIN_FONT, r.height * 0.8),
    color: cs.color || '#ffffff', fill, line
  }
}

/** The tray as the player sees it: its sockets, the balls in them, the count.
 *  False when there is nothing of it to draw (then its aria-label stands in). */
const readTray = (el: HTMLElement, box: HudBox): boolean => {
  for (const s of el.querySelectorAll<HTMLElement>('.tray-socket')) {
    const r = s.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) box.sockets.push(r)
  }
  for (const orb of el.querySelectorAll<HTMLElement>('.orb')) {
    const r = orb.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue
    const holder = orb.closest<HTMLElement>('.unit-holder')
    const opacity = holder ? parseFloat(getComputedStyle(holder).opacity) : 1
    const alpha = Number.isFinite(opacity) ? opacity : 1
    // Hidden while the merge lightbox draws it.
    if (alpha < 0.05) continue
    box.orbs.push({
      x: r.left, y: r.top, w: r.width, h: r.height,
      img: orb.querySelector<HTMLImageElement>('img.orb__portrait'),
      rim: orb.style.getPropertyValue('--rim').trim() || '#ffd25a',
      alpha,
      tier: pill(orb.querySelector<HTMLElement>('.orb__tier'), '#0e1426', '#ffffff'),
      count: pill(holder?.querySelector<HTMLElement>('.orb__count') ?? null, '#f7a000', '#0f1a30')
    })
  }
  const count = pill(el.querySelector<HTMLElement>('.tray-count'))
  if (count) box.texts.push(count)
  return box.sockets.length + box.orbs.length + box.texts.length > 0
}

/** The HUD outline: every visible button and dialog, with its label — and the
 *  tray with its balls. */
export const readHud = (): HudBox[] => {
  const out: HudBox[] = []
  const vw = window.innerWidth
  const vh = window.innerHeight
  for (const el of document.querySelectorAll<HTMLElement>(HUD_SEL)) {
    if (el.closest('[aria-hidden="true"]')) continue
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue
    if (!shown(el)) continue
    const dialog = el.matches(PANEL_SEL)
    const box: HudBox = { x: r.left, y: r.top, w: r.width, h: r.height, dialog, lines: [], rows: [], sockets: [], orbs: [], texts: [] }
    if (!dialog && !(el.matches(TRAY_SEL) && readTray(el, box))) {
      const aria = capLine(clean(el.getAttribute('aria-label') ?? ''))
      const lines = linesOf(el)
      // What the player reads on it (an icon-only button: its aria-label; a
      // group: its aria-label first, its digits say little on their own).
      box.lines = el.matches(ARIA_FIRST_SEL)
        ? (aria ? [aria] : lines)
        : (lines.length ? lines : aria ? [aria] : [])
    }
    out.push(box)
  }
  return out
}

/**
 * `lines` laid out in a w×h box: each line at the largest size that fits its
 * own width — MAX_FONT at most, no more than the box's height shares out,
 * never below MIN_FONT, where a line still too wide is cut with "…". Never
 * squeezed (`fillText`'s maxWidth narrows the glyphs). Lines that don't fit
 * the height even at MIN_FONT are dropped from the end. `measure(text, size)`
 * is the text's width at that size.
 */
export const fitLines = (
  lines: readonly string[], w: number, h: number,
  measure: (text: string, size: number) => number
): FitRow[] => {
  if (!lines.length) return []
  const room = Math.max(1, w - 2 * PAD_X)
  const tall = Math.max(1, h - 2 * PAD_Y)
  const n = Math.max(1, Math.min(lines.length, Math.floor(tall / (MIN_FONT * LINE_H))))
  const top = Math.max(MIN_FONT, Math.min(MAX_FONT, h * 0.5, tall / (n * LINE_H)))
  const rows: FitRow[] = []
  let used = 0
  for (const line of lines.slice(0, n)) {
    let text = line
    let size = top
    const wide = measure(line, top)
    if (wide > room) {
      // Widths scale with the size, near enough: one measure places the line,
      // half-pixel steps settle the rest.
      size = Math.max(MIN_FONT, Math.floor(((top * room) / wide) * 2) / 2)
      while (size > MIN_FONT && measure(line, size) > room) size = Math.max(MIN_FONT, size - 0.5)
      if (measure(line, size) > room) {
        const chars = Array.from(line)
        while (chars.length > 1 && measure(`${chars.join('')}…`, size) > room) chars.pop()
        text = `${chars.join('').trimEnd()}…`
      }
    }
    rows.push({ text, size, y: used + (size * LINE_H) / 2 })
    used += size * LINE_H
  }
  const off = (h - used) / 2
  for (const row of rows) row.y += off
  return rows
}

let font = ''
/** Lay every box's lines out once per HUD read, not per frame. */
const fitHud = (g: CanvasRenderingContext2D, boxes: HudBox[]): void => {
  font = hudFont()
  const measure = (text: string, size: number): number => {
    g.font = `700 ${size}px ${font}`
    return g.measureText(text).width
  }
  for (const b of boxes) b.rows = fitLines(b.lines, b.w, b.h, measure)
}

const boxPath = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  g.beginPath()
  if (g.roundRect) g.roundRect(x, y, w, h, r)
  else g.rect(x, y, w, h)
}

const drawPill = (g: CanvasRenderingContext2D, p: HudPill): void => {
  if (p.fill) {
    boxPath(g, p.x, p.y, p.w, p.h, p.h / 2)
    g.fillStyle = p.fill
    g.fill()
    if (p.line) {
      g.lineWidth = 1.5
      g.strokeStyle = p.line
      g.stroke()
    }
  }
  g.font = `700 ${p.size}px ${font}`
  g.fillStyle = p.color
  g.fillText(p.text, p.x + p.w / 2, p.y + p.h / 2)
}

/** A tray ball: dark glass, its portrait (`object-fit: contain` in the middle
 *  84 %), its element's rim, and its tier / stack badges. */
const drawOrb = (g: CanvasRenderingContext2D, o: HudOrb): void => {
  const cx = o.x + o.w / 2
  const cy = o.y + o.h / 2
  g.globalAlpha = o.alpha
  g.beginPath()
  g.ellipse(cx, cy, o.w / 2, o.h / 2, 0, 0, Math.PI * 2)
  g.fillStyle = '#0b1224'
  g.fill()
  const img = o.img
  if (img?.complete && img.naturalWidth > 0) {
    const k = Math.min((o.w * 0.84) / img.naturalWidth, (o.h * 0.84) / img.naturalHeight)
    const w = img.naturalWidth * k
    const h = img.naturalHeight * k
    g.save()
    g.clip()
    g.drawImage(img, cx - w / 2, cy - h / 2, w, h)
    g.restore()
  }
  // The path survives save/restore: the rim strokes the same glass.
  g.lineWidth = 2
  g.strokeStyle = o.rim
  g.stroke()
  if (o.tier) drawPill(g, o.tier)
  if (o.count) drawPill(g, o.count)
  g.globalAlpha = 1
}

const drawHud = (g: CanvasRenderingContext2D, boxes: readonly HudBox[]): void => {
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (const b of boxes) {
    g.globalAlpha = b.dialog ? 0.8 : 0.7
    g.fillStyle = b.dialog ? '#0e1630' : '#1d2a4d'
    boxPath(g, b.x, b.y, b.w, b.h, Math.min(12, b.h / 3))
    g.fill()
    g.globalAlpha = 1
    g.lineWidth = 1.5
    g.strokeStyle = b.dialog ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 210, 90, 0.85)'
    g.stroke()
    for (const s of b.sockets) {
      g.beginPath()
      g.ellipse(s.left + s.width / 2, s.top + s.height / 2, s.width / 2, s.height / 2, 0, 0, Math.PI * 2)
      g.fillStyle = 'rgba(0, 0, 0, 0.45)'
      g.fill()
      g.lineWidth = 1.5
      g.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      g.stroke()
    }
    for (const o of b.orbs) drawOrb(g, o)
    for (const p of b.texts) drawPill(g, p)
    g.fillStyle = '#ffffff'
    for (const row of b.rows) {
      g.font = `700 ${row.size}px ${font}`
      g.fillText(row.text, b.x + b.w / 2, b.y + row.y)
    }
  }
  g.globalAlpha = 1
}

/** The HUD art the stage paints as itself (`ART_SEL`), as on screen now. */
export const readArt = (): HudArt[] => {
  const out: HudArt[] = []
  const vw = window.innerWidth
  const vh = window.innerHeight
  for (const el of document.querySelectorAll<HTMLElement>(ART_SEL)) {
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue
    if (!shown(el)) continue
    const img = el.querySelector('img')
    const cs = getComputedStyle(el)
    const alpha = parseFloat(cs.opacity)
    out.push({
      x: r.left, y: r.top, w: r.width, h: r.height,
      img,
      shape: img ? img.getBoundingClientRect() : null,
      glows: [...el.querySelectorAll(GLOW_SEL)].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0),
      aura: cs.getPropertyValue('--aura').trim() || '255, 52, 40',
      eye: cs.getPropertyValue('--eye').trim() || '255, 72, 40',
      alpha: Number.isFinite(alpha) ? alpha : 1
    })
  }
  return out
}

/** Blacked-out copies of art images, one per source at its natural size
 *  (`source-in`, not `ctx.filter`, which Safari lacks). */
const silhouettes = new Map<string, HTMLCanvasElement>()
const silhouette = (img: HTMLImageElement): HTMLCanvasElement | null => {
  if (!img.complete || img.naturalWidth === 0) return null
  const key = img.currentSrc || img.src
  let c = silhouettes.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const o = c.getContext('2d')
    if (!o) return null
    o.drawImage(img, 0, 0)
    o.globalCompositeOperation = 'source-in'
    o.fillStyle = '#000'
    o.fillRect(0, 0, c.width, c.height)
    silhouettes.set(key, c)
  }
  return c
}

/** Each art frame: aura, murky glass, the rim-lit black shape, smoke over its
 *  lower half, the embers, the ring. */
const drawArt = (g: CanvasRenderingContext2D, items: readonly HudArt[]): void => {
  for (const a of items) {
    const cx = a.x + a.w / 2
    const cy = a.y + a.h / 2
    const r = Math.min(a.w, a.h) / 2
    g.save()
    g.globalAlpha = a.alpha
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.shadowColor = `rgba(${a.aura}, 0.9)`
    g.shadowBlur = r * 0.6
    g.fillStyle = '#3a1628'
    g.fill()
    g.clip()
    const s = a.img ? silhouette(a.img) : null
    if (s && a.shape) {
      g.shadowBlur = 2
      g.drawImage(s, a.shape.left, a.shape.top, a.shape.width, a.shape.height)
    }
    g.shadowBlur = 0
    const fog = g.createLinearGradient(0, cy - r * 0.2, 0, cy + r)
    fog.addColorStop(0, 'rgba(150, 140, 175, 0)')
    fog.addColorStop(1, 'rgba(150, 140, 175, 0.55)')
    g.fillStyle = fog
    g.fillRect(a.x, a.y, a.w, a.h)
    g.shadowColor = `rgba(${a.eye}, 1)`
    g.shadowBlur = 4
    g.fillStyle = `rgb(${a.eye})`
    for (const e of a.glows) {
      g.beginPath()
      g.ellipse(e.left + e.width / 2, e.top + e.height / 2, e.width / 2, e.height / 2, 0, 0, Math.PI * 2)
      g.fill()
    }
    g.restore()
    g.globalAlpha = a.alpha
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.lineWidth = 1.5
    g.strokeStyle = `rgba(${a.aura}, 0.85)`
    g.stroke()
    g.globalAlpha = 1
  }
}

/** One stage frame: backdrop, board, particles, HUD outline — as on screen. */
export const paintStage = (now = performance.now()): void => {
  const c = stage
  if (!c) return
  const w = Math.max(2, Math.round(window.innerWidth))
  const h = Math.max(2, Math.round(window.innerHeight))
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  const g = ctx ?? (ctx = c.getContext('2d'))
  if (!g) return
  g.fillStyle = BASE_FILL
  g.fillRect(0, 0, w, h)
  const bg = document.querySelector(`[${STAGE_BG_ATTR}]`)
  const art = bg ? backdrop(bg) : null
  if (bg && art) drawCover(g, art, bg.getBoundingClientRect())
  drawCanvasAt(g, document.querySelector<HTMLCanvasElement>(BOARD_SEL))
  if (now - hudAt >= HUD_MS) {
    hudAt = now
    hud = readHud()
    fitHud(g, hud)
    hudArt = readArt()
  }
  drawHud(g, hud)
  drawArt(g, hudArt)
  drawCanvasAt(g, document.querySelector<HTMLCanvasElement>(PARTICLES_SEL))
}

const loop = (now: number): void => {
  if (!live()) {
    raf = 0
    tracks.length = 0
    return
  }
  raf = requestAnimationFrame(loop)
  if (now - last < FRAME_MS) return
  last = now
  paintStage(now)
}

const startPainting = (): void => {
  if (raf) return
  paintStage()
  raf = requestAnimationFrame(loop)
}

/**
 * Hand Poki's playtest recorder its stage (once, after `PokiSDK.init()`).
 * Safe on an SDK without the playtest API, and a no-op the second time.
 */
export const installPokiPlaytestStage = (sdk: PlaytestSdk, onRecord?: () => void): HTMLCanvasElement | null => {
  if (stage || typeof document === 'undefined' || !document.body) return stage
  if (typeof sdk.playtestSetCanvas !== 'function') return null
  onRecordOnce = onRecord ?? null
  const c = document.createElement('canvas')
  c.width = Math.max(2, Math.round(window.innerWidth))
  c.height = Math.max(2, Math.round(window.innerHeight))
  c.setAttribute('aria-hidden', 'true')
  c.setAttribute('data-poki-playtest-stage', 'true')
  // Laid out full-window (the SDK sizes the video from the source's box), but
  // never seen and never in the way.
  Object.assign(c.style, {
    position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh',
    opacity: '0', pointerEvents: 'none', zIndex: '-1'
  })
  document.body.appendChild(c)
  stage = c
  // The recorder's `captureStream` call is the "recording started" signal.
  const native = typeof c.captureStream === 'function' ? c.captureStream.bind(c) : null
  if (native) {
    Object.defineProperty(c, 'captureStream', {
      configurable: true,
      writable: true,
      value: (frameRequestRate?: number): MediaStream => {
        const stream = frameRequestRate === undefined ? native() : native(frameRequestRate)
        tracks.push(...stream.getVideoTracks())
        startPainting()
        // T0.3: did the recording stage run during this play? (a `diag` measure)
        const told = onRecordOnce
        onRecordOnce = null
        try { told?.() } catch { /* diagnostics never break the recorder */ }
        return stream
      }
    })
  }
  try {
    sdk.playtestSetCanvas(c)
  } catch (e) {
    console.warn('[poki] playtestSetCanvas failed', e)
  }
  return c
}

/** Specs only: forget the stage. */
export const __resetPokiPlaytestStage = (): void => {
  onRecordOnce = null
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  last = 0
  hudAt = -Infinity
  hud = []
  hudArt = []
  silhouettes.clear()
  tracks.length = 0
  stage?.remove()
  stage = null
  ctx = null
  bgArt.url = ''
  bgArt.img = null
}
