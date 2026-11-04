// ─── Level images: the pictures on a level's picture boards ─────────────────────
//
// A picture board (levels.ts PictureDef) carries the id of its image, never the pixels. The designer drops a
// file into the editor; it is shrunk to a small WebP here, named after a hash of its bytes (the same name the
// levels bucket Worker gives it, so an image uploaded twice is stored once), and
//   · uploaded to the bucket (POST /images, with the editor password) when it can be, else
//   · kept in this browser and uploaded on the next sync (`uploadPending`).
// The game shows an image from, in order: this browser's own copy, the copy baked into the build
// (public/level-images/<id>.webp, written by scripts/levels-pull.mjs: portals forbid runtime requests), then the
// bucket (fetched and decoded, never an <img>: see "Showing an image"). The picture board draws an empty holder until an image has loaded.

import { ref } from 'vue'
import { BUCKET_URL, bucketPassword } from './customLevels'
import { isImageId } from './levels'
import { setPictureImageSource } from './pictureArt'
import { publicAssetExists } from '@/use/usePublicManifest'

export { isImageId }

/** The longest side of a stored image, in pixels (a board is at most ~600 world units wide). */
export const IMAGE_MAX_SIDE = 960
const IMAGE_QUALITY = 0.86
export const IMAGE_MAX_BYTES = 400_000

/** The name of an image: the first 24 hex digits of the SHA-256 of its bytes (the Worker computes the same). */
export const imageIdOf = async (bytes: ArrayBuffer): Promise<string> => {
  const d = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(d).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── This browser's own copies (the ones not on the bucket yet, and a warm cache of the rest) ──
const PENDING_KEY = 'umb_level_images_pending_v1'
const blobs = new Map<string, Blob>()
const readPending = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '{}') as Record<string, string> } catch { return {} }
}
const writePending = (m: Record<string, string>) => {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(m)) } catch { /* full or private mode: kept in memory this session */ }
}
const blobToDataUrl = (b: Blob): Promise<string> => new Promise((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result))
  r.onerror = () => rej(r.error)
  r.readAsDataURL(b)
})
/** A data: URL as a Blob, decoded by hand (a fetch of a data: URL is a connect-src request, which a CSP may refuse). */
const dataUrlToBlob = (u: string): Blob => {
  const i = u.indexOf(',')
  const bin = atob(u.slice(i + 1))
  const bytes = new Uint8Array(bin.length)
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k)
  return new Blob([bytes], { type: /^data:([^;,]+)/.exec(u)?.[1] ?? 'image/webp' })
}
/** Bumped whenever an image's availability changes, so a view can redraw. */
export const imagesVersion = ref(0)

// ── Showing an image ──
// Never through an <img>: the Pages build's CSP has no blob: or bucket host in img-src, so an <img> would be refused.
// The bytes come by fetch (connect-src covers this origin and the bucket) and are decoded with createImageBitmap,
// which img-src does not govern.
const loaded = new Map<string, ImageBitmap | 'failed'>()
const loading = new Set<string>()
const bakedUrl = (id: string, ext: string) => `${import.meta.env.BASE_URL}level-images/${id}.${ext}`
const bucketUrl = (id: string) => `${BUCKET_URL}/images/${id}`
const fetchBlob = async (url: string): Promise<Blob> => {
  const res = await fetch(url, { signal: within(15_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}
/** The loaded image, or null while it loads (this starts the load) or when it cannot be had. */
export const levelImage = (id: string | undefined): ImageBitmap | null => {
  if (!id || !isImageId(id)) return null
  const have = loaded.get(id)
  if (have) return have === 'failed' ? null : have
  if (loading.has(id)) return null
  loading.add(id)
  void (async () => {
    const sources: (() => Promise<Blob>)[] = [
      async () => { const b = blobs.get(id); if (!b) throw new Error('none'); return b },
      async () => { const p = readPending()[id]; if (!p) throw new Error('none'); return dataUrlToBlob(p) }
    ]
    // The copy baked into this build first, and only when the build shipped it (no 404s, and no request outside the
    // game: Poki and the YouTube Playables archive allow none). The bucket only for an image that is not baked yet.
    for (const ext of Object.values(IMAGE_TYPES)) {
      if (publicAssetExists(`level-images/${id}.${ext}`)) sources.push(() => fetchBlob(bakedUrl(id, ext)))
    }
    if (BUCKET_URL) sources.push(() => fetchBlob(bucketUrl(id)))
    for (const get of sources) {
      // A source that answers with something that is not an image (a dev server's index.html) falls through too.
      try { loaded.set(id, await createImageBitmap(await get())); break } catch { /* next source */ }
    }
    if (!loaded.has(id)) loaded.set(id, 'failed')
    loading.delete(id)
    imagesVersion.value++
  })()
  return null
}

setPictureImageSource(levelImage)

// ── Taking a file ──
/** File extensions taken as pictures when the browser gives the file no usable type. */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp'] as const
/** What a file picker is told to offer (`image/*` alone hides .webp on some systems). */
export const IMAGE_ACCEPT = `image/*,${IMAGE_EXTENSIONS.map((e) => `.${e}`).join(',')}`
/** Looks like a picture: an image type, or (empty / generic type) an image extension. */
export const looksLikeImage = (f: { name: string; type: string }): boolean =>
  f.type.startsWith('image/') || ((f.type === '' || f.type === 'application/octet-stream') && (IMAGE_EXTENSIONS as readonly string[]).includes(f.name.split('.').pop()?.toLowerCase() ?? ''))

/** A dropped file, shrunk to at most IMAGE_MAX_SIDE and encoded as a small WebP (PNG / JPEG where the browser cannot: see encodeCanvas). A flat copy: animation is dropped. */
export const prepareImage = async (file: Blob): Promise<{ blob: Blob; w: number; h: number }> => {
  // No gate on file.type: Windows hands over an empty or odd type for some files (.webp, .avif), so the decoder decides.
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(file) } catch { throw new Error('type') }
  const k = Math.min(1, IMAGE_MAX_SIDE / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * k))
  const h = Math.max(1, Math.round(bmp.height * k))
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return { blob: await encodeCanvas(cv), w, h }
}

/** The image types a board's picture is stored as, and the file extension a build bakes each under. */
export const IMAGE_TYPES = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' } as const
export type StoredImageType = keyof typeof IMAGE_TYPES

/**
 * The canvas as a small image: WebP where the browser can encode it. Safari cannot (toBlob answers with a PNG whatever is
 * asked for), so there the PNG is kept when it is small enough (it keeps transparency), else a JPEG on white. Throws
 * 'encode' when nothing could be made and 'size' when it is still too big.
 */
export const encodeCanvas = async (cv: Pick<HTMLCanvasElement, 'toBlob' | 'width' | 'height' | 'getContext'>): Promise<Blob> => {
  const toBlob = (type: string, q?: number) => new Promise<Blob | null>((r) => cv.toBlob(r, type, q))
  let q = IMAGE_QUALITY
  let tooBig = false
  for (let i = 0; i < 4; i++, q -= 0.15) {
    const b = await toBlob('image/webp', q)
    if (b && b.type === 'image/webp') {
      if (b.size <= IMAGE_MAX_BYTES) return b
      tooBig = true
      continue
    }
    // Not a WebP: this browser cannot encode them. Its answer is a PNG (lossless, with alpha): fine when small.
    if (b && b.type === 'image/png' && b.size <= IMAGE_MAX_BYTES) return b
    break
  }
  if (tooBig) throw new Error('size')
  // A JPEG, on white (it has no alpha), at falling quality.
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D | null
  if (ctx) {
    ctx.save()
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, cv.width, cv.height)
    ctx.restore()
  }
  q = 0.88
  for (let i = 0; i < 5; i++, q -= 0.12) {
    const b = await toBlob('image/jpeg', q)
    if (!b || b.type !== 'image/jpeg') throw new Error('encode')
    if (b.size <= IMAGE_MAX_BYTES) return b
  }
  throw new Error('size')
}

/** An abort signal that fires after `ms`; Safari before 16.4 has no AbortSignal.timeout, there the request just has no deadline. */
const within = (ms: number): AbortSignal | undefined => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined)

const upload = async (id: string, blob: Blob): Promise<boolean> => {
  if (!BUCKET_URL || !bucketPassword.value) return false
  try {
    const res = await fetch(`${BUCKET_URL}/images`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'image/webp', Authorization: `Bearer ${bucketPassword.value}` },
      body: blob,
      signal: within(20_000)
    })
    if (!res.ok) return false
    const out = (await res.json().catch(() => null)) as { id?: string } | null
    return out?.id === id
  } catch { return false }
}

export interface AddedImage { id: string; w: number; h: number; uploaded: boolean }
/** Takes a dropped file: shrinks it, names it, keeps it here and uploads it when it can. Throws 'type' / 'encode' / 'size'. */
export const addImage = async (file: Blob): Promise<AddedImage> => {
  const { blob, w, h } = await prepareImage(file)
  const id = await imageIdOf(await blob.arrayBuffer())
  blobs.set(id, blob)
  loaded.delete(id)
  const uploaded = await upload(id, blob)
  if (!uploaded) {
    const m = readPending()
    m[id] = await blobToDataUrl(blob)
    writePending(m)
  }
  imagesVersion.value++
  return { id, w, h, uploaded }
}

/** Uploads the images still waiting (a sync, or opening the editor). Returns how many went up and how many still wait. */
export const uploadPending = async (): Promise<{ sent: number; left: number }> => {
  const m = readPending()
  let sent = 0
  for (const id of Object.keys(m)) {
    try {
      const blob = blobs.get(id) ?? dataUrlToBlob(m[id]!)
      if (await upload(id, blob)) { delete m[id]; sent++ }
    } catch { /* kept for the next sync */ }
  }
  writePending(m)
  return { sent, left: Object.keys(m).length }
}
/** How many images wait for an upload. */
export const pendingImageCount = (): number => Object.keys(readPending()).length

/** The image ids a level uses. */
export const imageIdsOf = (l: { pictures?: { image?: string }[] }): string[] =>
  [...new Set((l.pictures ?? []).map((p) => p.image).filter(isImageId))]
