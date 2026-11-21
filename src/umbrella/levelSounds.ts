// ─── Level sounds: the sound effects a designer uploads for a level ─────────────────────────────
//
// A level (levels.ts LevelDef.sounds) maps a game event (open, land, win, ...) to the id of an .ogg file, never the audio
// itself. The designer picks a file in the editor; it is checked (Ogg only, short, small), named after a hash of its bytes
// (the same name the levels bucket Worker gives it, so a file uploaded twice is stored once), and
//   · uploaded to the bucket (POST /sounds, with the editor password) when it can be, else
//   · kept in this browser and uploaded on the next sync (`uploadPendingSounds`).
// The game plays a sound from, in order: this browser's own copy, the copy baked into the build
// (public/level-sounds/<id>.ogg, written by scripts/levels-pull.mjs: portals forbid runtime requests), then the bucket.
// The bytes are fetched and decoded once (`levelSoundBuffer`), then every play is a plain buffer one-shot.

import { BUCKET_URL, bucketPassword } from './customLevels'
import { isSoundId, LEVEL_SOUND_SLOTS, type LevelSoundSlot } from './levels'
import { getAudioContext } from '@/use/useAssets'
import { publicAssetExists } from '@/use/usePublicManifest'

export { isSoundId, LEVEL_SOUND_SLOTS }
export type { LevelSoundSlot }

/** Biggest file taken (bytes) and longest sound (seconds): a one-shot effect, not a song. */
export const SOUND_MAX_BYTES = 250_000
export const SOUND_MAX_SECONDS = 12
/** What a file picker is told to offer: Ogg only. */
export const SOUND_ACCEPT = 'audio/ogg,.ogg'

/** The name of a sound: the first 24 hex digits of the SHA-256 of its bytes (the Worker computes the same). */
export const soundIdOf = async (bytes: ArrayBuffer): Promise<string> => {
  const d = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(d).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** An Ogg container starts with "OggS". */
export const isOggBytes = (b: Uint8Array): boolean => b.length > 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53
/** Looks like an .ogg file by name or type (the bytes are checked too). */
export const looksLikeOgg = (f: { name: string; type: string }): boolean => /\.ogg$/i.test(f.name) || f.type === 'audio/ogg'

// ── This browser's own copies ──
const PENDING_KEY = 'umb_level_sounds_pending_v1'
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
const dataUrlToBlob = (u: string): Blob => {
  const i = u.indexOf(',')
  const bin = atob(u.slice(i + 1))
  const bytes = new Uint8Array(bin.length)
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k)
  return new Blob([bytes], { type: 'audio/ogg' })
}

const within = (ms: number): AbortSignal | undefined => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined)
const bakedUrl = (id: string) => `${import.meta.env.BASE_URL}level-sounds/${id}.ogg`
const bucketUrl = (id: string) => `${BUCKET_URL}/sounds/${id}`
const fetchBytes = async (url: string): Promise<ArrayBuffer> => {
  const res = await fetch(url, { signal: within(15_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.arrayBuffer()
}

// ── Playing ──
const buffers = new Map<string, AudioBuffer | 'failed'>()
const loading = new Map<string, Promise<void>>()
const decode = (bytes: ArrayBuffer): Promise<AudioBuffer> => {
  const ctx = getAudioContext()
  if (!ctx) return Promise.reject(new Error('no audio'))
  return ctx.decodeAudioData(bytes.slice(0))
}
/** Starts loading a sound (once); resolves when it is decoded or has failed. */
export const preloadLevelSound = (id: string | undefined): Promise<void> => {
  if (!id || !isSoundId(id) || buffers.has(id)) return Promise.resolve()
  let p = loading.get(id)
  if (p) return p
  p = (async () => {
    const sources: (() => Promise<ArrayBuffer>)[] = [
      async () => { const b = blobs.get(id); if (!b) throw new Error('none'); return b.arrayBuffer() },
      async () => { const d = readPending()[id]; if (!d) throw new Error('none'); return dataUrlToBlob(d).arrayBuffer() }
    ]
    if (publicAssetExists(`level-sounds/${id}.ogg`)) sources.push(() => fetchBytes(bakedUrl(id)))
    if (BUCKET_URL) sources.push(() => fetchBytes(bucketUrl(id)))
    for (const get of sources) {
      try { buffers.set(id, await decode(await get())); break } catch { /* next source */ }
    }
    if (!buffers.has(id)) buffers.set(id, 'failed')
    loading.delete(id)
  })()
  loading.set(id, p)
  return p
}
/** The decoded sound, or null while it loads (this starts the load) or when it cannot be had. */
export const levelSoundBuffer = (id: string | undefined): AudioBuffer | null => {
  if (!id || !isSoundId(id)) return null
  const have = buffers.get(id)
  if (have) return have === 'failed' ? null : have
  void preloadLevelSound(id)
  return null
}
/** The sound ids a level uses. */
export const soundIdsOf = (l: { sounds?: Partial<Record<string, string>> }): string[] =>
  [...new Set(Object.values(l.sounds ?? {}).filter((v): v is string => isSoundId(v)))]
/** Loads every sound a level has, so the first play is instant. */
export const preloadLevelSounds = (l: { sounds?: Partial<Record<string, string>> }): void => {
  for (const id of soundIdsOf(l)) void preloadLevelSound(id)
}

// ── Taking a file ──
const upload = async (id: string, blob: Blob): Promise<boolean> => {
  if (!BUCKET_URL || !bucketPassword.value) return false
  try {
    const res = await fetch(`${BUCKET_URL}/sounds`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/ogg', Authorization: `Bearer ${bucketPassword.value}` },
      body: blob,
      signal: within(30_000)
    })
    if (!res.ok) return false
    const out = (await res.json().catch(() => null)) as { id?: string } | null
    return out?.id === id
  } catch { return false }
}

export interface AddedSound { id: string; seconds: number; uploaded: boolean }
/** Takes a chosen file: checks it is a short Ogg, names it, keeps it here and uploads it when it can.
 *  Throws 'type' (not an .ogg), 'size' (too big), 'long' (too long) or 'decode' (the browser cannot play it). */
export const addSound = async (file: Blob & { name?: string }): Promise<AddedSound> => {
  if (!looksLikeOgg({ name: file.name ?? '', type: file.type })) throw new Error('type')
  const bytes = await file.arrayBuffer()
  if (!isOggBytes(new Uint8Array(bytes))) throw new Error('type')
  if (bytes.byteLength > SOUND_MAX_BYTES) throw new Error('size')
  let seconds = 0
  try { seconds = (await decode(bytes)).duration } catch { throw new Error('decode') }
  if (seconds > SOUND_MAX_SECONDS) throw new Error('long')
  const id = await soundIdOf(bytes)
  const blob = new Blob([bytes], { type: 'audio/ogg' })
  blobs.set(id, blob)
  buffers.delete(id)
  const uploaded = await upload(id, blob)
  if (!uploaded) {
    const m = readPending()
    m[id] = await blobToDataUrl(blob)
    writePending(m)
  }
  return { id, seconds, uploaded }
}

/** Uploads the sounds still waiting (a sync, or opening the editor). */
export const uploadPendingSounds = async (): Promise<{ sent: number; left: number }> => {
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
