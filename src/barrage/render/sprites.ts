/**
 * Sprite loading + offscreen bakes for the Barrage renderer.
 *
 * Every bitmap is decoded once, trimmed to its opaque content box (the MIW art
 * ships as stickers with generous transparent margins), and then BAKED per
 * (key, device-pixel size) into an offscreen canvas. The per-frame path only
 * ever does `drawImage(bake, …)` — no `filter`, no shadows, no gradients.
 *
 * CSS filters (the MIW enrage look) are reproduced as colour matrices applied
 * to the bake's pixels once, so they look identical on Safari, which has no
 * `CanvasRenderingContext2D.filter`.
 */

export interface ContentBox {
  x: number
  y: number
  w: number
  h: number
}

export interface SpriteImage {
  src: string
  img: HTMLImageElement
  ready: boolean
  failed: boolean
  /** Opaque bounds in source px (computed once on load). */
  box: ContentBox
}

const images = new Map<string, SpriteImage>()
/** Bumps whenever any image finishes loading — bake caches keyed on "not ready yet" retry then. */
let loadVersion = 0
export const spriteLoadVersion = (): number => loadVersion

/** Offscreen canvases created so far (every bake makes at least one) — a perf probe. */
export let canvasesCreated = 0

export const createCanvas = (w: number, h: number): HTMLCanvasElement => {
  canvasesCreated++
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

export const ctx2d = (c: HTMLCanvasElement): CanvasRenderingContext2D => {
  const g = c.getContext('2d')
  if (!g) throw new Error('2d context unavailable')
  return g
}

const measureBox = (img: HTMLImageElement): ContentBox => {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const full: ContentBox = { x: 0, y: 0, w, h }
  // Measure on a downscaled copy — plenty for a fit box, and cheap.
  const s = Math.min(1, 96 / Math.max(w, h))
  const mw = Math.max(1, Math.round(w * s))
  const mh = Math.max(1, Math.round(h * s))
  try {
    const c = createCanvas(mw, mh)
    const g = ctx2d(c)
    g.drawImage(img, 0, 0, mw, mh)
    const data = g.getImageData(0, 0, mw, mh).data
    let x0 = mw, y0 = mh, x1 = -1, y1 = -1
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        if (data[(y * mw + x) * 4 + 3]! > 24) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    }
    if (x1 < x0 || y1 < y0) return full
    return {
      x: Math.max(0, (x0 - 0.5) / s),
      y: Math.max(0, (y0 - 0.5) / s),
      w: Math.min(w, (x1 - x0 + 2) / s),
      h: Math.min(h, (y1 - y0 + 2) / s)
    }
  } catch {
    return full // tainted canvas (never for same-origin art) — use the whole image
  }
}

/** Get (and start loading) a sprite. Safe to call every frame — it is a Map hit. */
export const sprite = (src: string): SpriteImage => {
  let s = images.get(src)
  if (s) return s
  const img = new Image()
  img.decoding = 'async'
  const entry: SpriteImage = { src, img, ready: false, failed: false, box: { x: 0, y: 0, w: 1, h: 1 } }
  img.onload = () => {
    const done = (): void => {
      entry.box = measureBox(img)
      entry.ready = true
      loadVersion++
    }
    // Decode off the frame path so the first drawImage never pays for it.
    if (typeof img.decode === 'function') img.decode().then(done, done)
    else done()
  }
  img.onerror = () => {
    entry.failed = true
    loadVersion++
  }
  img.src = src
  images.set(src, entry)
  s = entry
  return s
}

/** Resolves once every listed sprite has loaded (or failed). */
export const preloadSprites = (srcs: string[]): Promise<void> =>
  Promise.all(srcs.map((src) => {
    const s = sprite(src)
    if (s.ready || s.failed) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const done = (): void => resolve()
      s.img.addEventListener('load', done, { once: true })
      s.img.addEventListener('error', done, { once: true })
    })
  })).then(() => undefined)

// ─── Colour matrices (W3C Filter Effects, applied sequentially with clamping) ─
export type FilterOp =
  | { op: 'sepia'; v: number }
  | { op: 'saturate'; v: number }
  | { op: 'hue'; deg: number }
  | { op: 'brightness'; v: number }
  | { op: 'contrast'; v: number }

type M3 = [number, number, number, number, number, number, number, number, number]

const sepiaM = (a: number): M3 => {
  const i = 1 - Math.max(0, Math.min(1, a))
  return [
    0.393 + 0.607 * i, 0.769 - 0.769 * i, 0.189 - 0.189 * i,
    0.349 - 0.349 * i, 0.686 + 0.314 * i, 0.168 - 0.168 * i,
    0.272 - 0.272 * i, 0.534 - 0.534 * i, 0.131 + 0.869 * i
  ]
}
const saturateM = (s: number): M3 => [
  0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s
]
const hueM = (deg: number): M3 => {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072
  ]
}

/** Apply CSS-filter-equivalent colour ops to a canvas' pixels, in place. */
export const applyFilterOps = (c: HTMLCanvasElement, ops: FilterOp[]): void => {
  const g = ctx2d(c)
  let img: ImageData
  try {
    img = g.getImageData(0, 0, c.width, c.height)
  } catch {
    return
  }
  const d = img.data
  const mats: (M3 | null)[] = ops.map((o) =>
    o.op === 'sepia' ? sepiaM(o.v) : o.op === 'saturate' ? saturateM(o.v) : o.op === 'hue' ? hueM(o.deg) : null)
  for (let p = 0; p < d.length; p += 4) {
    if (d[p + 3] === 0) continue
    let r = d[p]! / 255
    let gg = d[p + 1]! / 255
    let b = d[p + 2]! / 255
    for (let k = 0; k < ops.length; k++) {
      const o = ops[k]!
      const m = mats[k]
      if (m) {
        const nr = m[0] * r + m[1] * gg + m[2] * b
        const ng = m[3] * r + m[4] * gg + m[5] * b
        const nb = m[6] * r + m[7] * gg + m[8] * b
        r = nr; gg = ng; b = nb
      } else if (o.op === 'brightness') {
        r *= o.v; gg *= o.v; b *= o.v
      } else if (o.op === 'contrast') {
        r = (r - 0.5) * o.v + 0.5; gg = (gg - 0.5) * o.v + 0.5; b = (b - 0.5) * o.v + 0.5
      }
      r = r < 0 ? 0 : r > 1 ? 1 : r
      gg = gg < 0 ? 0 : gg > 1 ? 1 : gg
      b = b < 0 ? 0 : b > 1 ? 1 : b
    }
    d[p] = r * 255
    d[p + 1] = gg * 255
    d[p + 2] = b * 255
  }
  g.putImageData(img, 0, 0)
}

/** MIW's enrage filter: `sepia(0.5) saturate(3) hue-rotate(-28deg) brightness(1.1)`. */
export const ENRAGE_OPS: FilterOp[] = [
  { op: 'sepia', v: 0.5 }, { op: 'saturate', v: 3 }, { op: 'hue', deg: -28 }, { op: 'brightness', v: 1.1 }
]
/** Corrupted elites: pulled toward a sickly violet, darker. */
export const CORRUPT_OPS: FilterOp[] = [
  { op: 'sepia', v: 0.55 }, { op: 'hue', deg: 225 }, { op: 'saturate', v: 1.6 },
  { op: 'brightness', v: 0.66 }, { op: 'contrast', v: 1.15 }
]

/** A same-size copy of `src` flood-filled with `color` inside its alpha. */
export const silhouette = (src: HTMLCanvasElement, color: string): HTMLCanvasElement => {
  const c = createCanvas(src.width, src.height)
  const g = ctx2d(c)
  g.drawImage(src, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  return c
}

/** A copy of `src` with `color` laid over its opaque pixels at `alpha`. */
export const overlayTint = (src: HTMLCanvasElement, color: string, alpha: number): HTMLCanvasElement => {
  const c = createCanvas(src.width, src.height)
  const g = ctx2d(c)
  g.drawImage(src, 0, 0)
  g.globalCompositeOperation = 'source-atop'
  g.globalAlpha = alpha
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  return c
}

/** Soft radial glow dot (bake once per colour/size). */
export const glowDot = (sizePx: number, color: string, core = 0.25): HTMLCanvasElement => {
  const c = createCanvas(sizePx, sizePx)
  const g = ctx2d(c)
  const r = sizePx / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(core, color)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, sizePx, sizePx)
  return c
}

/** Parse '#rgb' / '#rrggbb' to [r,g,b]. */
export const hexRgb = (hex: string): [number, number, number] => {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  const n = parseInt(h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const rgba = (hex: string, a: number): string => {
  const [r, g, b] = hexRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}
