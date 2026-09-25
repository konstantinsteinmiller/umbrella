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

/** The element whose `background-image` is the scene backdrop (GameScene). */
export const STAGE_BG_ATTR = 'data-poki-stage-bg'
const BOARD_SEL = '.barrage-board__canvas'
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
/** A label longer than this is cut (the outline is a guide, not the UI). */
const LABEL_MAX = 34

interface PlaytestSdk {
  playtestSetCanvas?: (canvas: HTMLCanvasElement | HTMLCanvasElement[] | null) => void
}

interface HudBox { x: number; y: number; w: number; h: number; label: string; dialog: boolean }

let stage: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let raf = 0
let last = 0
let hudAt = -Infinity
let hud: HudBox[] = []
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

/** The HUD outline: every visible button and dialog, with its label. */
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
    const aria = (el.getAttribute('aria-label') ?? '').replace(/\s+/g, ' ').trim()
    // `innerText` keeps the lines apart ("SCHADEN · ×1 → ×1.25 · 12"); read
    // at HUD_MS, not per frame.
    const lines = (el.innerText || el.textContent || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
    const shownText = lines.join(' · ')
    // What the player reads on it (an icon-only button: its aria-label).
    const text = dialog ? '' : el.matches(ARIA_FIRST_SEL) ? aria || shownText : shownText || aria
    const label = text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text
    out.push({ x: r.left, y: r.top, w: r.width, h: r.height, label, dialog })
  }
  return out
}

const drawHud = (g: CanvasRenderingContext2D, boxes: readonly HudBox[]): void => {
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (const b of boxes) {
    g.globalAlpha = b.dialog ? 0.8 : 0.7
    g.fillStyle = b.dialog ? '#0e1630' : '#1d2a4d'
    g.beginPath()
    g.roundRect?.(b.x, b.y, b.w, b.h, Math.min(12, b.h / 3))
    if (!g.roundRect) g.rect(b.x, b.y, b.w, b.h)
    g.fill()
    g.globalAlpha = 1
    g.lineWidth = 1.5
    g.strokeStyle = b.dialog ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 210, 90, 0.85)'
    g.stroke()
    if (!b.label) continue
    const size = Math.max(9, Math.min(13, b.h * 0.34))
    g.font = `700 ${size}px sans-serif`
    g.fillStyle = '#ffffff'
    const y = b.dialog ? b.y + size : b.y + b.h / 2
    g.fillText(b.label, b.x + b.w / 2, y, Math.max(8, b.w - 4))
  }
  g.globalAlpha = 1
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
  }
  drawHud(g, hud)
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
export const installPokiPlaytestStage = (sdk: PlaytestSdk): HTMLCanvasElement | null => {
  if (stage || typeof document === 'undefined' || !document.body) return stage
  if (typeof sdk.playtestSetCanvas !== 'function') return null
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
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  last = 0
  hudAt = -Infinity
  hud = []
  tracks.length = 0
  stage?.remove()
  stage = null
  ctx = null
  bgArt.url = ''
  bgArt.img = null
}
