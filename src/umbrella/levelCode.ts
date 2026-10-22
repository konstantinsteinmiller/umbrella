// ─── Share codes: a whole level in a URL ────────────────────────────────────
//
// `?level=<code>` opens a player's level on any build and saves it to the
// player's library. The code is the level's JSON (canonical: id and edit time
// dropped), raw-deflated and base64url'd behind a version prefix, so the same
// code always rebuilds the same level. Decoding goes through parseLevel: a
// code is untrusted input.

import type { LevelDef } from './levels'
import { parseLevel } from './customLevels'

const PREFIX = 'u1'
/** Codes longer than this are refused before inflating (a level is a few KB). */
const MAX_CODE = 60_000
const MAX_JSON = 400_000

export interface SharedLevel { name: string; level: LevelDef }

const toBase64Url = (bytes: Uint8Array): string => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromBase64Url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
const pipe = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> => {
  const writer = stream.writable.getWriter()
  void writer.write(bytes as BufferSource).then(() => writer.close()).catch(() => { /* the read below reports it */ })
  const reader = stream.readable.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) { void reader.cancel(); throw new Error('too large') }
    parts.push(value)
  }
  const out = new Uint8Array(size)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

/** The level without what only this browser cares about (its slot id, its edit time). */
const canonical = (level: LevelDef): Omit<LevelDef, 'id' | 'editedAt'> => {
  const { id: _id, editedAt: _at, ...rest } = level
  return rest
}

export const encodeLevel = async (level: LevelDef, name: string): Promise<string> => {
  const json = JSON.stringify({ n: name.slice(0, 40), l: canonical(level) })
  return PREFIX + toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')))
}

/** The level in a share code, or null when the code is not a valid one. */
export const decodeLevel = async (code: string): Promise<SharedLevel | null> => {
  try {
    const c = code.trim()
    if (!c.startsWith(PREFIX) || c.length > MAX_CODE || !/^[A-Za-z0-9_-]+$/.test(c)) return null
    const json = new TextDecoder().decode(await pipe(fromBase64Url(c.slice(PREFIX.length)), new DecompressionStream('deflate-raw'), MAX_JSON))
    const data = JSON.parse(json) as { n?: unknown; l?: unknown }
    const level = parseLevel(data.l)
    if (!level) return null
    const name = typeof data.n === 'string' && data.n.trim() ? data.n.trim().slice(0, 40) : 'shared level'
    return { name, level: { ...level, id: 0 } }
  } catch {
    return null
  }
}

/** Where share links point: the public web build (portals cannot open outside links). */
export const SHARE_BASE: string = (import.meta.env.VITE_APP_SHARE_URL ?? 'https://konstantinsteinmiller.github.io/umbrella/').trim()
export const shareLink = (code: string): string => `${SHARE_BASE}${SHARE_BASE.includes('?') ? '&' : '?'}level=${code}`

/** The `level` code this page was opened with, if any. */
export const levelParam = (): string | null => {
  try {
    return new URLSearchParams(window.location.search).get('level')
  } catch {
    return null
  }
}
/** Drops `?level=` from the address bar once it has been read, so a reload does not re-import. */
export const clearLevelParam = () => {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('level')) return
    url.searchParams.delete('level')
    window.history.replaceState(window.history.state, '', url.toString())
  } catch { /* a sandboxed frame: leave the URL alone */ }
}
