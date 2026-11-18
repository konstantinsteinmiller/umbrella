// ─── Level history ──────────────────────────────────────────────────────
// One version per level per day: the LATEST edit of a day replaces the earlier ones of that day
// (an edit at 9 am is dropped for the one at 11 pm), earlier days stay. The levels bucket keeps the
// same history on the server (workers/levels-bucket); this file is the copy in this browser, so the
// History dialog also works where the bucket is unreachable or absent.
//
// A level is addressed by its history key: `c:<slot id>` (a campaign slot) or `l:<name>` (a saved level).
// The browser copy lives in its own localStorage key (not the cloud save: it is large and this browser's).

import type { LevelDef } from './levels'

export interface HistoryVersion {
  /** Local calendar day of the edit, YYYY-MM-DD. */
  day: string
  editedAt: number
  /** Where the full level comes from: this browser, or the server (fetched when chosen). */
  source: 'local' | 'server'
}

const STORE_KEY = 'umb_level_history_v1'
/** Days kept per level in this browser (the server keeps them all): bounds localStorage. */
export const LOCAL_DAYS = 60

const pad = (n: number) => String(n).padStart(2, '0')
/** The calendar day of an edit in the viewer's own time zone (what "the same day" means to the designer). */
export const dayOf = (editedAt: number): string => {
  const d = new Date(editedAt)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const historyKey = (section: 'campaign' | 'library', key: string | number): string => `${section === 'campaign' ? 'c' : 'l'}:${key}`

type Store = Record<string, Record<string, { editedAt: number; level: LevelDef }>>

const readStore = (): Store => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Store : {}
  } catch { return {} }
}
const writeStore = (s: Store): boolean => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); return true } catch { return false }
}

/** Keeps `level` as the version of its day, unless that day already holds a later edit. Returns whether it was kept. */
export const recordVersion = (hKey: string, level: LevelDef, editedAt: number): boolean => {
  const store = readStore()
  const days = (store[hKey] ??= {})
  const day = dayOf(editedAt)
  if ((days[day]?.editedAt ?? 0) >= editedAt) return false
  days[day] = { editedAt, level: JSON.parse(JSON.stringify(level)) as LevelDef }
  // Oldest days go first: past the day limit, and when the browser's storage is full.
  const trim = (): boolean => {
    const names = Object.keys(days).sort()
    if (names.length > LOCAL_DAYS) { delete days[names[0]!]; return true }
    return false
  }
  while (trim()) { /* trimmed */ }
  while (!writeStore(store)) {
    const names = Object.keys(days).sort()
    if (names.length <= 1) return false // not even one version fits: the server copy has it
    delete days[names[0]!]
  }
  return true
}

/** Versions kept in this browser, newest day first. */
export const localVersions = (hKey: string): HistoryVersion[] =>
  Object.entries(readStore()[hKey] ?? {})
    .map(([day, v]): HistoryVersion => ({ day, editedAt: v.editedAt, source: 'local' }))
    .sort((a, b) => (a.day < b.day ? 1 : -1))

export const localVersion = (hKey: string, day: string): LevelDef | null => {
  const v = readStore()[hKey]?.[day]
  return v ? JSON.parse(JSON.stringify(v.level)) as LevelDef : null
}

/** The server's and this browser's lists as one, a day appearing once (the later edit's copy), newest day first. */
export const mergeVersions = (...lists: HistoryVersion[][]): HistoryVersion[] => {
  const byDay = new Map<string, HistoryVersion>()
  for (const v of lists.flat()) {
    const have = byDay.get(v.day)
    // On a tie the server's copy stands: it is the one every browser sees.
    if (!have || v.editedAt > have.editedAt || (v.editedAt === have.editedAt && v.source === 'server')) byDay.set(v.day, v)
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1))
}

// ── The last SAVE_LIMIT saves (every save, newest first; the days above keep only one per day) ──
export interface SaveVersion { editedAt: number; source: 'local' | 'server' }
export const SAVE_LIMIT = 50
const SAVES_KEY = 'umb_level_saves_v1'
type SaveStore = Record<string, { editedAt: number; level: LevelDef }[]>
const readSaves = (): SaveStore => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SAVES_KEY) ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v as SaveStore : {}
  } catch { return {} }
}

/** Adds one save to the level's last 50 (a save already there, by its edit time, is not added twice). */
export const recordSave = (hKey: string, level: LevelDef, editedAt: number): boolean => {
  const store = readSaves()
  const list = store[hKey] ?? []
  if (list.some((s) => s.editedAt === editedAt)) return false
  if (list.length >= SAVE_LIMIT && editedAt < list[list.length - 1]!.editedAt) return false
  list.push({ editedAt, level: JSON.parse(JSON.stringify(level)) as LevelDef })
  list.sort((a, b) => b.editedAt - a.editedAt)
  list.length = Math.min(list.length, SAVE_LIMIT)
  store[hKey] = list
  // A full browser storage costs the oldest saves first (the server keeps all 50).
  for (;;) {
    try { localStorage.setItem(SAVES_KEY, JSON.stringify(store)); return true } catch { /* full */ }
    if (list.length <= 1) { delete store[hKey]; return false }
    list.length = Math.ceil(list.length / 2)
  }
}
export const localSaves = (hKey: string): SaveVersion[] =>
  (readSaves()[hKey] ?? []).map((s): SaveVersion => ({ editedAt: s.editedAt, source: 'local' }))
export const localSave = (hKey: string, editedAt: number): LevelDef | null => {
  const s = readSaves()[hKey]?.find((x) => x.editedAt === editedAt)
  return s ? JSON.parse(JSON.stringify(s.level)) as LevelDef : null
}
export const mergeSaves = (...lists: SaveVersion[][]): SaveVersion[] => {
  const by = new Map<number, SaveVersion>()
  for (const v of lists.flat()) if (!by.has(v.editedAt) || v.source === 'server') by.set(v.editedAt, v)
  return [...by.values()].sort((a, b) => b.editedAt - a.editedAt).slice(0, SAVE_LIMIT)
}
