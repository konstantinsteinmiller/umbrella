// ─── Kite art: which sheets shipped, and loading them in stages ────────────
//
// KITE AND LANTERN ONLY. Imported lazily (art/install.ts) behind `artLayer`,
// so no other build bundles this module or a single painted byte: the sheets
// live in src/assets/umbrella-art/ (kite) or src/assets/umbrella-art-lantern/
// (lantern), not public/, and only the `shipped` glob pulls them in.
// The glob is also the build-time manifest — a sheet that was never painted
// has no entry, so it is never requested (no 404 for a portal's QA console)
// and its drawable keeps its vector self.
//
// Staged loading (art-generation-pipeline LOADING.md): tier 0 is what the
// first screen needs — Pweeg, the umbrella, the world tiles, the wind, and the
// enemies of the level the player RESUMES on (plus Chad when the intro has not
// been seen) — and is awaited behind the splash; tier 1 follows one sheet at a
// time; tier 2 goes out in one low-priority batch when the page is idle.
import { files } from '@/umbrella/art/shipped'
import { GAME_SHEETS, SHEETS_FOR_HAZARD, sheetById, type SheetDef } from './manifest'

const URLS: Record<string, string> = {}
for (const [path, url] of Object.entries(files)) URLS[path.slice(path.lastIndexOf('/') + 1).replace(/\.webp$/, '')] = url

/** A sharper twin (`<id>@2x`): never a sheet of its own, only ever fetched through sharpImage. */
const isTwin = (id: string): boolean => id.endsWith('@2x')
/** Sheet ids that shipped with this build (the @2x twins are not sheets). */
export const shippedSheets = (): string[] => Object.keys(URLS).filter((id) => !isTwin(id))
export const hasSheet = (id: string): boolean => id in URLS && !isTwin(id)

interface Entry { img: HTMLImageElement; ready: boolean; failed: boolean; done: Promise<void> }
const entries = new Map<string, Entry>()
let generation = 0
const listeners = new Set<(id: string | null) => void>()

/** Called with the sheet id that just decoded (null: everything may have changed). */
export const onSheetsChanged = (fn: (id: string | null) => void): (() => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const request = (id: string, priority: 'high' | 'low' | 'auto' = 'auto'): Entry | null => {
  const url = URLS[id]
  if (!url || typeof Image === 'undefined') return null
  const have = entries.get(id)
  if (have) return have
  const img = new Image()
  ;(img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = priority
  img.decoding = 'async'
  const entry: Entry = { img, ready: false, failed: false, done: Promise.resolve() }
  entry.done = new Promise<void>((resolve) => {
    img.onload = () => {
      entry.ready = img.naturalWidth > 0
      entry.failed = !entry.ready
      if (entry.ready) for (const fn of listeners) fn(id)
      resolve()
    }
    img.onerror = () => { entry.failed = true; resolve() }
  })
  img.src = generation > 0 ? `${url}?v=${generation}` : url
  entries.set(id, entry)
  return entry
}

/** The decoded sheet, or null (not shipped, not loaded yet, or broken). A sheet
 *  nobody staged is requested on first use — it draws from the next frame on. */
export const sheetImage = (id: string): HTMLImageElement | null => {
  const e = entries.get(id) ?? request(id, 'low')
  return e?.ready ? e.img : null
}

/** The sharper twin of a sheet (`<id>@2x`, the sky layers) on a screen of 2x or more, once the
 *  normal one has loaded: fetched then at low priority, so the first screen never waits for it and a
 *  1x screen never downloads it. Null until it has decoded (draw the normal one meanwhile). It
 *  is drawn in the normal one's place at the same on-screen size, so read sizes from the normal one. */
export const sharpImage = (id: string): HTMLImageElement | null => {
  const twin = `${id}@2x`
  if (!(twin in URLS) || typeof window === 'undefined' || (window.devicePixelRatio || 1) < 2) return null
  if (!entries.get(id)?.ready) return null
  const e = entries.get(twin) ?? request(twin, 'low')
  return e?.ready ? e.img : null
}

export const loadSheets = (ids: string[], priority: 'high' | 'low' | 'auto' = 'auto'): Promise<void> =>
  Promise.all(ids.map((id) => request(id, priority)?.done)).then(() => undefined)

/** Forget every decode and fetch again, cache-busted (DEV: a re-slice under the same name). */
export const refreshSheets = (): void => {
  generation++
  const ids = [...entries.keys()]
  entries.clear()
  void loadSheets(ids).then(() => { for (const fn of listeners) fn(null) })
}

export const sheetStatus = () => ({
  shipped: shippedSheets().length,
  of: GAME_SHEETS.length,
  ready: [...entries].filter(([, e]) => e.ready).map(([id]) => id),
  missing: GAME_SHEETS.map((s) => s.id).filter((id) => !hasSheet(id))
})

// ─── Tiers ──────────────────────────────────────────────────────────────────

interface LevelLike { hazards?: { kind: string }[]; buttons?: unknown[]; checkpoints?: unknown[] }

/** The sheets a level's own things need (enemies, fans, spikes, buttons, flags). */
export const sheetsForLevel = (level: LevelLike | undefined): string[] => {
  const out = new Set<string>()
  for (const h of level?.hazards ?? []) for (const id of SHEETS_FOR_HAZARD[h.kind] ?? []) out.add(id)
  if (level?.buttons?.length) out.add('props')
  if (level?.checkpoints?.length) out.add('checkpoint')
  return [...out]
}

const LEVEL_THINGS = new Set(['walldorf-body', 'walldorf-face', 'prickbait', 'fan', 'props', 'checkpoint'])

/**
 * The three tiers for a player resuming on `levels[resume]`. Everything every
 * level draws (Pweeg, the umbrella, platforms, wind) is tier 0 by the
 * manifest; the level things are tier 0 only when the resume level has them,
 * tier 1 when one of the next three levels does, else tier 2. Chad is tier 0
 * for a player who has not seen the intro (it plays first).
 */
export const tiersFor = (levels: LevelLike[], resume: number, introSeen: boolean, has: (id: string) => boolean = hasSheet): [string[], string[], string[]] => {
  const here = new Set(sheetsForLevel(levels[resume]))
  const soon = new Set(levels.slice(resume + 1, resume + 4).flatMap(sheetsForLevel))
  const tiers: [string[], string[], string[]] = [[], [], []]
  // The kite characters replace Pweeg and Chad when they shipped: the old
  // look is only a fallback then, fetched last.
  const kites = has('pweeg-kite-idle')
  for (const s of GAME_SHEETS) {
    if (!has(s.id)) continue
    let tier: 0 | 1 | 2 = s.tier
    if (kites && (s.group === 'pweeg' || s.group === 'chad')) tier = 2
    if (LEVEL_THINGS.has(s.id)) tier = here.has(s.id) ? 0 : soon.has(s.id) ? 1 : 2
    if (s.group === 'chad-kite' || (s.group === 'chad' && !kites)) tier = introSeen ? 2 : 0
    tiers[tier].push(s.id)
  }
  return tiers
}

/** Every sheet of a set, decoded — a character is drawn painted only when all
 *  of its sheets are, so he never switches between drawing and painting
 *  mid-move. */
export const setReady = (ids: readonly string[]): boolean => ids.every((id) => hasSheet(id) && sheetImage(id) !== null)

export const sheetsOf = (pred: (s: SheetDef) => boolean): string[] => GAME_SHEETS.filter(pred).map((s) => s.id)
export const isShipped = (id: string): boolean => !!sheetById(id) && hasSheet(id)
