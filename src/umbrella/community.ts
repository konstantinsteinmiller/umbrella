// Community levels — client for the /community routes of the levels-bucket
// Worker (workers/levels-bucket/src/index.js). Off on Poki and Playgama builds
// (YouTube Playables ships from the Playgama build).
import { isPlaygama, isPoki } from '@/use/useUser'

export const COMMUNITY_URL: string = (import.meta.env.VITE_APP_LEVELS_BUCKET_URL ?? '').trim().replace(/\/+$/, '')
export const communityEnabled: boolean = COMMUNITY_URL !== '' && !isPoki && !isPlaygama

export const TIMEOUT_MS = 8000
export const WEEKLY_LIMIT = 5

export type CommunitySort = 'rating' | 'newest' | 'plays'

export interface CommunityLevelMeta {
  id: string
  name: string
  author: string
  createdAt: number
  plays: number
  ratingAvg: number
  ratingCount: number
  /** The share code, sent with list items so the list can draw a preview. */
  code?: string
}
export interface CommunityLevel extends CommunityLevelMeta {
  code: string
}
export interface CommunityPage {
  items: CommunityLevelMeta[]
  total: number
  page: number
  pageSize: number
}
export interface CommunityQuota {
  limit: number
  used: number
  resetAt: number | null
}
export interface CommunityRating {
  ratingAvg: number
  ratingCount: number
}
export type SubmitResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'weekly-limit'; resetAt: number; used: number }
  | { ok: false; reason: 'network' | 'invalid' }

const PLAYER_KEY = 'umb_player_id'
let memoryPlayer: string | null = null

const randomId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* fall through */
  }
  let s = ''
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16)
  return s
}

/** Stable anonymous player id (localStorage, else per-session memory). */
export function playerId(): string {
  try {
    const v = localStorage.getItem(PLAYER_KEY)
    if (v && /^[A-Za-z0-9-]{8,64}$/.test(v)) return v
    const id = randomId()
    localStorage.setItem(PLAYER_KEY, id)
    return id
  } catch {
    memoryPlayer ??= randomId()
    return memoryPlayer
  }
}

interface Reply {
  status: number
  body: unknown
}

async function call(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<Reply | null> {
  if (!COMMUNITY_URL) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${COMMUNITY_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal
    })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* non-JSON reply */
    }
    return { status: res.status, body }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const ok = (r: Reply | null): Record<string, unknown> | null =>
  r && r.status >= 200 && r.status < 300 && r.body && typeof r.body === 'object' ? (r.body as Record<string, unknown>) : null

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

const toMeta = (v: unknown): CommunityLevelMeta | null => {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  return {
    id: o.id,
    name: o.name,
    author: typeof o.author === 'string' ? o.author : '',
    createdAt: num(o.createdAt),
    plays: num(o.plays),
    ratingAvg: num(o.ratingAvg),
    ratingCount: num(o.ratingCount),
    ...(typeof o.code === 'string' ? { code: o.code } : {})
  }
}

const enc = encodeURIComponent

/** One page of community levels; null on network/server failure. */
export async function listLevels(sort: CommunitySort = 'rating', page = 1, size = 12): Promise<CommunityPage | null> {
  const b = ok(await call(`/community/levels?sort=${enc(sort)}&page=${page}&size=${size}`))
  if (!b || !Array.isArray(b.items)) return null
  return {
    items: b.items.map(toMeta).filter((m): m is CommunityLevelMeta => m !== null),
    total: num(b.total),
    page: num(b.page) || page,
    pageSize: num(b.pageSize) || size
  }
}

/** A level with its share code; null when unknown or unreachable. */
export async function getLevel(id: string): Promise<CommunityLevel | null> {
  const b = ok(await call(`/community/levels/${enc(id)}`))
  const m = toMeta(b)
  if (!m || typeof b?.code !== 'string') return null
  return { ...m, code: b.code }
}

export async function submitLevel(level: { name: string; author: string; code: string }): Promise<SubmitResult> {
  const r = await call('/community/levels', { method: 'POST', body: { ...level, player: playerId() } })
  if (!r) return { ok: false, reason: 'network' }
  const b = (r.body && typeof r.body === 'object' ? r.body : {}) as Record<string, unknown>
  if (r.status === 201 && typeof b.id === 'string') return { ok: true, id: b.id }
  if (r.status === 429 && b.error === 'weekly-limit') return { ok: false, reason: 'weekly-limit', resetAt: num(b.resetAt), used: num(b.used) }
  if (r.status === 400) return { ok: false, reason: 'invalid' }
  return { ok: false, reason: 'network' }
}

export async function getQuota(): Promise<CommunityQuota | null> {
  const b = ok(await call(`/community/quota?player=${enc(playerId())}`))
  if (!b) return null
  return { limit: num(b.limit) || WEEKLY_LIMIT, used: num(b.used), resetAt: typeof b.resetAt === 'number' ? b.resetAt : null }
}

/** Counts a play (server dedupes per player/level/day); returns the new play count. */
export async function countPlay(id: string): Promise<number | null> {
  const b = ok(await call(`/community/levels/${enc(id)}/play`, { method: 'POST', body: { player: playerId() } }))
  return b && typeof b.plays === 'number' ? b.plays : null
}

/** Rates 0–5 stars (one rating per player, re-rating replaces it). */
export async function rateLevel(id: string, stars: number): Promise<CommunityRating | null> {
  const s = Math.max(0, Math.min(5, Math.round(stars)))
  const b = ok(await call(`/community/levels/${enc(id)}/rate`, { method: 'POST', body: { player: playerId(), stars: s } }))
  return b && typeof b.ratingAvg === 'number' ? { ratingAvg: b.ratingAvg, ratingCount: num(b.ratingCount) } : null
}
