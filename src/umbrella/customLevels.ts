// ─── Level editor storage ───────────────────────────────────────────────
//
// What the /editor page (src/views/UmbrellaEditor.vue) writes, and what the
// game reads back:
//   • a named library of saved custom levels (the editor's load dropdown);
//   • campaign overrides — an edited level replacing built-in slot N. On a
//     dev server they are also written to data/campaign-overrides.json (the
//     vite plugin's /__maw/save-override endpoint), which every build bakes
//     in through `virtual:campaign-overrides` — commit that file to ship the
//     levels. Disk wins; localStorage keeps edits made where there is no dev
//     server. They are patched into LEVELS in place on import, so every reader of LEVELS (the
//     scene, the tuning panel) sees them without knowing about the editor;
//   • the campaign order — which level plays at which position, including saved
//     library levels added to the campaign (each carried as a snapshot with its
//     own id ≥ CUSTOM_ID_BASE, so a build plays it without the library). Written
//     to data/campaign-order.json on a dev server (`virtual:campaign-order`) and
//     synced through the bucket as the campaign entry "order";
//   • the test level — a non-persisted level the editor hands to the scene
//     for one playtest before navigating there.
// Everything persists through the one-blob state layer (useEpicState).
//
// The kite build (kite.ts) plays its own 100 levels: the repo's campaign overrides and
// order (they belong to the server campaign) are not read, nothing is written to the
// repo, and there is no levels bucket. Edits stay in this browser, in the kite build's
// own save (useEpicState keeps a separate key for it).

import { ref } from 'vue'
import { getState, setState } from '@/use/useEpicState'
import overridesFromDisk from 'virtual:campaign-overrides'
import orderFromDisk from 'virtual:campaign-order'
import { isKite } from './kite'
import { COLLECT_SHAPES, LEVELS, type LevelDef } from './levels'
import { parseTimeLimit } from './timeStars'

const LIBRARY_KEY = 'umb_custom_levels_v1'
const OVERRIDES_KEY = 'umb_level_overrides_v1'
const EDITOR_UNLOCKED_KEY = 'umb_editor_unlocked'
const DRAFT_KEY = 'umb_editor_draft'
const ORDER_KEY = 'umb_campaign_order_v1'

export const cloneLevel = (l: LevelDef): LevelDef => JSON.parse(JSON.stringify(l)) as LevelDef

/** The authored levels, kept so "Revert" can restore an overridden slot. */
const BUILT_IN: LevelDef[] = LEVELS.map(cloneLevel)
export const builtInLevel = (id: number): LevelDef | undefined => {
  const l = BUILT_IN.find((x) => x.id === id)
  return l && cloneLevel(l)
}

// ── Validation: anything imported from a file goes through here ──
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isRect = (r: unknown): boolean => {
  const o = r as Record<string, unknown> | null
  return !!o && num(o.x) && num(o.y) && num(o.w) && num(o.h)
}

/** A level from untrusted JSON, or null when it is not one. */
export const parseLevel = (data: unknown): LevelDef | null => {
  const l = data as Partial<LevelDef> | null
  if (!l || typeof l !== 'object') return null
  if (!l.world || !num(l.world.w) || !num(l.world.h) || l.world.w < 100 || l.world.h < 100) return null
  if (!l.spawn || !num(l.spawn.x) || !num(l.spawn.y)) return null
  if (!Array.isArray(l.platforms) || !l.platforms.every(isRect)) return null
  if (!Array.isArray(l.winds) || !l.winds.every((w) => isRect(w) && num(w.speed) && ['up', 'down', 'left', 'right'].includes(w.dir))) return null
  if (l.hazards && (!Array.isArray(l.hazards) || !l.hazards.every((h) => isRect(h) && ['pillar', 'mine', 'spikes', 'fan'].includes(h.kind) &&
    (h.contact === undefined || ['deadly', 'solid', 'bounce'].includes(h.contact)) &&
    (h.bounce === undefined || (num(h.bounce) && h.bounce > 0))))) return null
  if (l.buttons && (!Array.isArray(l.buttons) || !l.buttons.every((b) => isRect(b) && num(b.channel) && (b.duration === undefined || (num(b.duration) && b.duration > 0))))) return null
  if (l.checkpoints && (!Array.isArray(l.checkpoints) || !l.checkpoints.every((c) => !!c && num(c.x) && num(c.y)))) return null
  if (l.stars && (!Array.isArray(l.stars) || !l.stars.every((s) => !!s && num(s.x) && num(s.y) && (s.shape === undefined || COLLECT_SHAPES.includes(s.shape))))) return null
  if (l.gates && (!Array.isArray(l.gates) || !l.gates.every((g) => isRect(g) && num(g.to)))) return null
  if (l.platforms.some((p) => p.channel !== undefined && !num(p.channel))) return null
  if (l.winds.some((w) => w.switched !== undefined && (typeof w.switched !== 'object' || !w.switched ||
    (w.switched.speed !== undefined && (!num(w.switched.speed) || w.switched.speed < 0)) ||
    (w.switched.dir !== undefined && !['up', 'down', 'left', 'right'].includes(w.switched.dir))))) return null
  const out = cloneLevel({ ...l, id: num(l.id) ? l.id : 0, hazards: l.hazards ?? [] } as LevelDef)
  // A bad screen size falls back to showing the whole world, like a level without one.
  for (const h of out.hazards ?? []) {
    const m = h.motion
    if (m?.kind !== 'lunge') continue
    if (m.speed !== undefined && (!num(m.speed) || m.speed <= 0)) delete m.speed
    if (m.radius !== undefined && (!num(m.radius) || m.radius < 0)) delete m.radius
  }
  if (out.view && (!num(out.view.w) || !num(out.view.h) || out.view.w < 100 || out.view.h < 100)) delete out.view
  // A time limit is whole seconds in 1…999 (timeStars.ts); anything else means none.
  const limit = parseTimeLimit(out.timeLimit)
  if (limit) out.timeLimit = limit
  else delete out.timeLimit
  if (!limit || out.timeLimitJamOnly !== true) delete out.timeLimitJamOnly
  return out
}

// ── Edit times ──
// Every saved level carries `editedAt`; a deletion (a deleted saved level, a reverted
// slot) is remembered as a tombstone so it can beat an older copy elsewhere.
const TOMBSTONES_KEY = 'umb_level_tombstones_v1'
const tombstones: Record<string, number> = { ...getState<Record<string, number>>(TOMBSTONES_KEY, {}) }
const setTombstone = (key: string, at: number | null) => {
  if (at === null) delete tombstones[key]
  else tombstones[key] = at
  setState(TOMBSTONES_KEY, { ...tombstones })
}
const stamp = (level: LevelDef, at: number): LevelDef => ({ ...cloneLevel(level), editedAt: at })

// ── Named library ──
export const customLevels = ref<Record<string, LevelDef>>(getState<Record<string, LevelDef>>(LIBRARY_KEY, {}))
const putLibrary = (name: string, level: LevelDef | null) => {
  const next = { ...customLevels.value }
  if (level) next[name] = cloneLevel(level)
  else delete next[name]
  customLevels.value = next
  setState(LIBRARY_KEY, next)
}
export const saveCustomLevel = (name: string, level: LevelDef, editedAt = Date.now()) => {
  const l = stamp(level, editedAt)
  putLibrary(name, l)
  setTombstone(`l:${name}`, null)
  pushEntry('library', name, l, editedAt)
}
export const deleteCustomLevel = (name: string) => {
  const at = Date.now()
  putLibrary(name, null)
  setTombstone(`l:${name}`, at)
  pushEntry('library', name, null, at)
}

// ── Campaign overrides (patched into LEVELS) ──
const loadOverrides = (): Record<number, LevelDef> => {
  const out: Record<number, LevelDef> = {}
  for (const [k, v] of Object.entries(getState<Record<string, unknown>>(OVERRIDES_KEY, {}))) {
    const l = parseLevel(v)
    if (l) out[Number(k)] = l
  }
  // The repo copy wins unless this browser holds a newer edit of the slot.
  // (The repo's file is the server campaign's: the kite levels never take it.)
  for (const [k, v] of Object.entries(isKite ? {} : overridesFromDisk)) {
    const l = parseLevel(v)
    if (l && (l.editedAt ?? 0) >= (out[Number(k)]?.editedAt ?? 0)) out[Number(k)] = l
  }
  return out
}
export const campaignOverrides = ref<Record<number, LevelDef>>(loadOverrides())

/** Dev server only (the endpoint does not exist in a build): mirror into the repo file. */
const postToDisk = (path: string, body: object) => {
  if (!import.meta.env.DEV || isKite) return
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .catch(() => { /* no dev server: localStorage stays the copy */ })
}

// ── Campaign order ──
/** A position in the campaign: a built-in level by id, or a saved library level
 *  added to the campaign (its name and a snapshot, under an id of its own). */
export interface OrderEntry {
  id: number
  custom?: string
  level?: LevelDef
  /** The designer's name for the slot (its mechanic or theme), shown instead of "level-9". */
  name?: string
}
/** A slot name from untrusted JSON: trimmed, at most 40 characters, absent when empty. */
const slotName = (v: unknown) => (typeof v === 'string' && v.trim() ? { name: v.trim().slice(0, 40) } : {})
/** A chapter card's subtitle from untrusted JSON: trimmed, at most 60 characters, absent when empty. */
const subtitleOf = (v: unknown) => (typeof v === 'string' && v.trim() ? { subtitle: v.trim().slice(0, 60) } : {})
/** A chapter: a named run of campaign levels (slot ids, in play order). An unnamed one shows "Chapter N". */
export interface Chapter { id: string; name?: string; levels: number[]; subtitle?: string }
/**
 * `removed`: authored levels the designer deleted from the campaign (they stay out of `campaignEntries`).
 * `chapters`: the campaign split into chapters, in play order (absent: one chapter holding everything);
 * `order` stays the flat play order, so a client from before chapters still plays it right.
 * `start`: the chapter a new player begins with. `jam`: the game-jam chapter — campaign levels (by id)
 * and saved levels (snapshots under ids of their own), played ONLY by the itch.io build (`jamPlay`).
 */
export interface CampaignOrder {
  editedAt: number
  order: OrderEntry[]
  removed?: number[]
  chapters?: Chapter[]
  start?: string
  jam?: OrderEntry[]
  /** The jam chapter's title (default: "Game Jam"). */
  jamName?: string
  /** The jam chapter card's subtitle. */
  jamSubtitle?: string
}
/** The extra fields a saved order carries beside the flat order. */
export type OrderExtras = Pick<CampaignOrder, 'chapters' | 'start' | 'jam' | 'jamName' | 'jamSubtitle'>
/** Ids of library levels added to the campaign start here, clear of the authored ones. */
export const CUSTOM_ID_BASE = 1000

/** Ids of the authored levels, ascending. */
export const AUTHORED_LEVEL_IDS: number[] = BUILT_IN.map((l) => l.id).sort((a, b) => a - b)
const isBuiltIn = (id: number) => BUILT_IN.some((l) => l.id === id)
/** The game-jam chapter's id (it is not one of `chapters`: it holds references, not a share of the campaign). */
export const JAM_CHAPTER = 'jam'
const chapterIdOf = (v: unknown): string | null => (typeof v === 'string' && /^[a-z0-9-]{1,24}$/i.test(v) && v !== JAM_CHAPTER ? v : null)

/** An order entry from untrusted JSON: a built-in level, or a saved level's snapshot (id ≥ CUSTOM_ID_BASE). */
const parseEntry = (raw: unknown, removed: number[]): OrderEntry | null => {
  const e = raw as Partial<OrderEntry> | null
  if (!e || !num(e.id) || removed.includes(e.id)) return null
  if (isBuiltIn(e.id)) return { id: e.id, ...slotName(e.name) }
  const level = e.id >= CUSTOM_ID_BASE ? parseLevel(e.level) : null
  if (!level) return null
  return { id: e.id, custom: typeof e.custom === 'string' && e.custom ? e.custom : `level-${e.id}`, level: { ...level, id: e.id }, ...slotName(e.name) }
}

/** An order from untrusted JSON, or null. Unknown ids and repeats are dropped. */
export const parseOrder = (data: unknown): CampaignOrder | null => {
  const o = data as { editedAt?: unknown; order?: unknown; removed?: unknown; chapters?: unknown; start?: unknown; jam?: unknown; jamName?: unknown; jamSubtitle?: unknown } | null
  if (!o || typeof o !== 'object' || !num(o.editedAt) || o.editedAt <= 0 || !Array.isArray(o.order)) return null
  const removed = Array.isArray(o.removed) ? [...new Set(o.removed.filter((x): x is number => num(x) && isBuiltIn(x)))] : []
  const order: OrderEntry[] = []
  const seen = new Set<number>()
  for (const raw of o.order) {
    const e = parseEntry(raw, removed)
    if (!e || seen.has(e.id)) continue
    order.push(e)
    seen.add(e.id)
  }
  // Chapters hold the campaign's slots (the order's, and the authored levels it leaves out), each once.
  const inCampaign = new Set([...seen, ...BUILT_IN.map((l) => l.id).filter((id) => !removed.includes(id))])
  let chapters: Chapter[] | undefined
  if (Array.isArray(o.chapters)) {
    chapters = []
    const placed = new Set<number>()
    for (const raw of o.chapters) {
      const c = raw as Partial<Chapter> | null
      const id = chapterIdOf(c?.id)
      if (!c || !id || chapters.some((x) => x.id === id) || !Array.isArray(c.levels)) continue
      const levels = c.levels.filter((x): x is number => num(x) && inCampaign.has(x) && !placed.has(x))
      for (const x of levels) placed.add(x)
      chapters.push({ id, ...slotName(c.name), levels, ...subtitleOf(c.subtitle) })
    }
    if (!chapters.length) chapters = undefined
  }
  const start = chapters && typeof o.start === 'string' && chapters.some((c) => c.id === o.start) ? o.start : undefined
  // The jam chapter: campaign slots by id, saved levels by snapshot; each once.
  let jam: OrderEntry[] | undefined
  if (Array.isArray(o.jam)) {
    jam = []
    for (const raw of o.jam) {
      const r = raw as Partial<OrderEntry> | null
      if (!r || !num(r.id) || jam.some((x) => x.id === r.id)) continue
      if (inCampaign.has(r.id) && !r.level) { jam.push({ id: r.id }); continue }
      const e = r.id >= CUSTOM_ID_BASE && !inCampaign.has(r.id) ? parseEntry(r, removed) : null
      if (e) jam.push(e)
    }
  }
  return {
    editedAt: o.editedAt,
    order,
    ...(removed.length ? { removed } : {}),
    ...(chapters ? { chapters } : {}),
    ...(start ? { start } : {}),
    ...(jam?.length ? { jam } : {}),
    ...(slotName(o.jamName).name ? { jamName: slotName(o.jamName).name } : {}),
    ...(subtitleOf(o.jamSubtitle).subtitle ? { jamSubtitle: subtitleOf(o.jamSubtitle).subtitle } : {})
  }
}
const loadOrder = (): CampaignOrder | null => {
  const local = parseOrder(getState<unknown>(ORDER_KEY, null))
  const disk = isKite ? null : parseOrder(orderFromDisk)
  // The repo copy wins unless this browser holds a newer order.
  return disk && disk.editedAt >= (local?.editedAt ?? 0) ? disk : local
}
export const campaignOrder = ref<CampaignOrder | null>(loadOrder())

/** The campaign's slots in the stored flat order (built-ins missing from the order go last). */
const flatEntries = (): OrderEntry[] => {
  const out = (campaignOrder.value?.order ?? []).map((e) => ({ ...e }))
  const gone = campaignOrder.value?.removed ?? []
  for (const l of BUILT_IN) if (!gone.includes(l.id) && !out.some((e) => e.id === l.id)) out.push({ id: l.id })
  return out
}
/** The default chapter when none were made: everything. */
const FIRST_CHAPTER = 'c1'
/** The campaign's chapters, covering every slot once: a slot no chapter names joins the last one. */
export const campaignChapters = (): Chapter[] => {
  const all = flatEntries().map((e) => e.id)
  const stored = campaignOrder.value?.chapters
  if (!stored?.length) return [{ id: FIRST_CHAPTER, levels: all }]
  const chapters = stored.map((c) => ({ ...c, levels: c.levels.filter((id) => all.includes(id)) }))
  const placed = new Set(chapters.flatMap((c) => c.levels))
  chapters[chapters.length - 1]!.levels.push(...all.filter((id) => !placed.has(id)))
  return chapters
}
/** The campaign as it plays now: chapter by chapter, each in its own order. */
export const campaignEntries = (): OrderEntry[] => {
  const byId = new Map(flatEntries().map((e) => [e.id, e]))
  return campaignChapters().flatMap((c) => c.levels.map((id) => byId.get(id)!))
}
/** The chapter a new player begins with (the first one unless the designer picked another). */
export const startChapterId = (): string => {
  const chapters = campaignChapters()
  return chapters.find((c) => c.id === campaignOrder.value?.start)?.id ?? chapters[0]!.id
}
/** The game-jam chapter's entries (campaign slots by id, saved levels as snapshots). */
export const jamEntries = (): OrderEntry[] => (campaignOrder.value?.jam ?? []).map((e) => ({ ...e }))

// ── Which levels play: the campaign, or the jam chapter ──
// The itch.io build is the game-jam submission: it plays the jam chapter alone (the campaign when
// that is still empty). Anywhere else the designer can playtest it from the editor (`setJamTest`),
// kept for this tab only so a reload stays in it.
const IS_ITCH = import.meta.env.VITE_APP_ITCH === 'true'
const JAM_TEST_KEY = 'umb_jam_test'
const readJamTest = (): boolean => {
  try { return sessionStorage.getItem(JAM_TEST_KEY) === '1' } catch { return false }
}
/** The jam chapter is what plays (itch.io build, or the designer's jam playtest). */
export const jamPlay = ref(IS_ITCH || readJamTest())
/** Itch.io build only: the jam chapter is the game. */
export const isJamBuild = IS_ITCH
const playsJam = (): boolean => jamPlay.value && !!campaignOrder.value?.jam?.length
/** The designer's jam playtest on any build (the itch.io build always plays the jam chapter). */
export const setJamTest = (on: boolean) => {
  try { if (on) sessionStorage.setItem(JAM_TEST_KEY, '1'); else sessionStorage.removeItem(JAM_TEST_KEY) } catch { /* private mode: this page only */ }
  jamPlay.value = IS_ITCH || on
  rebuildLevels()
}

/** The time limit a level plays with here: none when it is set for the game-jam build only and the
 *  jam chapter is not what plays (the editor's single-level test still runs it, to tune it). */
export const activeTimeLimit = (l: LevelDef, opts: { test?: boolean } = {}): number =>
  l.timeLimit && (!l.timeLimitJamOnly || jamPlay.value || opts.test) ? l.timeLimit : 0

/** Index in LEVELS where a new player begins: the start chapter's first level (0 in the jam chapter). */
export const startLevelIndex = (): number => {
  if (playsJam()) return 0
  const chapters = campaignChapters()
  const from = chapters.findIndex((c) => c.id === startChapterId())
  for (const c of [...chapters.slice(from), ...chapters.slice(0, from)]) {
    const i = c.levels.length ? LEVELS.findIndex((l) => l.id === c.levels[0]) : -1
    if (i >= 0) return i
  }
  return 0
}
/** The chapters as LEVELS index ranges, for the level selector (the jam chapter when it plays). */
export const chapterRanges = (): { id: string; name?: string; subtitle?: string; n: number; from: number; to: number }[] => {
  const o = campaignOrder.value
  if (playsJam()) return [{ id: JAM_CHAPTER, name: o?.jamName, subtitle: o?.jamSubtitle, n: 1, from: 0, to: LEVELS.length }]
  let at = 0
  return campaignChapters().map((c, i) => {
    const r = { id: c.id, name: c.name, subtitle: c.subtitle, n: i + 1, from: at, to: at + c.levels.length }
    at = r.to
    return r
  })
}
/** Authored levels the designer has deleted from the campaign. */
export const campaignRemoved = (): number[] => [...(campaignOrder.value?.removed ?? [])]
/** The designer's name for a campaign slot, if it has one. */
export const slotTitle = (id: number): string | undefined => campaignOrder.value?.order.find((e) => e.id === id)?.name

/** The level a slot plays when it has no override: the authored one or the added snapshot. */
const baseLevel = (id: number): LevelDef | undefined => {
  const added = campaignOrder.value?.order.find((e) => e.id === id)?.level
  return builtInLevel(id) ?? (added && cloneLevel(added))
}

/** Rebuilds LEVELS in place from the order (or the jam chapter) and the overrides: every reader keeps its array. */
const rebuildLevels = () => {
  const next: LevelDef[] = []
  for (const e of playsJam() ? jamEntries() : campaignEntries()) {
    // A jam snapshot carries its own level; a campaign slot is the authored / added one.
    const l = campaignOverrides.value[e.id] ?? (e.level ? cloneLevel(e.level) : baseLevel(e.id))
    if (l) next.push({ ...cloneLevel(l), id: e.id })
  }
  LEVELS.splice(0, LEVELS.length, ...next)
}
rebuildLevels()

/** The order's body as it rides in the bucket / the repo file (everything but `editedAt`). */
const orderBody = (o: CampaignOrder) => ({
  order: o.order,
  ...(o.removed ? { removed: o.removed } : {}),
  ...(o.chapters ? { chapters: o.chapters } : {}),
  ...(o.start ? { start: o.start } : {}),
  ...(o.jam ? { jam: o.jam } : {}),
  ...(o.jamName ? { jamName: o.jamName } : {}),
  ...(o.jamSubtitle ? { jamSubtitle: o.jamSubtitle } : {})
})

/** Saves a new campaign order (the editor's Reorder dialog). Chapters, the start chapter and the
 *  jam chapter are kept as they are unless `extras` says otherwise. */
export const saveCampaignOrder = (order: OrderEntry[], editedAt = Date.now(), removed: number[] = [], extras?: OrderExtras) => {
  const keep = campaignOrder.value
  const x = extras ?? { chapters: keep?.chapters, start: keep?.start, jam: keep?.jam, jamName: keep?.jamName, jamSubtitle: keep?.jamSubtitle }
  const parsed = parseOrder({ editedAt, order, removed, ...x })
  if (!parsed) return
  putOrder(parsed)
  pushEntry('campaign', ORDER_ENTRY, orderBody(parsed) as unknown as LevelDef, editedAt)
}
const putOrder = (o: CampaignOrder) => {
  campaignOrder.value = o
  setState(ORDER_KEY, o)
  postToDisk('/__maw/save-order', { editedAt: o.editedAt, ...orderBody(o) })
  rebuildLevels()
}
/** The bucket key of the order inside the campaign section (slot keys are numbers). */
const ORDER_ENTRY = 'order'
/** A fresh id for a library level joining the campaign. */
export const nextCustomId = (taken: number[]): number =>
  Math.max(CUSTOM_ID_BASE - 1, ...taken, ...campaignEntries().map((e) => e.id), ...jamEntries().map((e) => e.id), ...Object.keys(campaignOverrides.value).map(Number)) + 1

/** The tuning panel stores per-level knob edits (wind speeds, periods) by id;
 *  an edited slot drops them, or they would overwrite the editor's values. */
const TUNING_LEVELS_KEY = 'umb_levels_r3'
const dropPanelEdits = (id: number) =>
  setState(TUNING_LEVELS_KEY, getState<{ id: number }[]>(TUNING_LEVELS_KEY, []).filter((l) => l?.id !== id))

const putOverride = (id: number, level: LevelDef | null) => {
  dropPanelEdits(id)
  const next = { ...campaignOverrides.value }
  if (level) next[id] = { ...cloneLevel(level), id }
  else delete next[id]
  campaignOverrides.value = next
  setState(OVERRIDES_KEY, next)
  if (level) postToDisk('/__maw/save-override', { id, stage: next[id] })
  else postToDisk('/__maw/clear-override', { id })
  rebuildLevels()
}
export const saveCampaignOverride = (id: number, level: LevelDef, editedAt = Date.now()) => {
  const l = { ...stamp(level, editedAt), id }
  putOverride(id, l)
  setTombstone(`c:${id}`, null)
  pushEntry('campaign', String(id), l, editedAt)
}
export const clearCampaignOverride = (id: number) => {
  const at = Date.now()
  putOverride(id, null)
  setTombstone(`c:${id}`, at)
  pushEntry('campaign', String(id), null, at)
}

/** When this browser's copy of a slot / saved level was last edited (0: never). */
export const localEditedAt = (section: 'campaign' | 'library', key: string): number => {
  const live = section === 'campaign' ? campaignOverrides.value[Number(key)] : customLevels.value[key]
  return live ? (live.editedAt ?? 0) : (tombstones[`${section === 'campaign' ? 'c' : 'l'}:${key}`] ?? 0)
}

// ── Levels bucket (workers/levels-bucket) ──
// A Cloudflare Worker holding the newest edit of every slot and saved level, so the
// designer edits on GitHub Pages and everyone else pulls. Reading is public; writing
// needs the editor password, kept in this browser only (never in the cloud save).
// Unreachable bucket: everything keeps working from this browser, and Export library
// carries the edits out by hand.
export interface BucketEntry { editedAt: number; level: LevelDef | null }
export interface Bucket { campaign: Record<string, BucketEntry>; library: Record<string, BucketEntry> }

/** Empty on the kite build: no pull, no push, no sync (cutsceneStore.ts shares it). */
export const BUCKET_URL: string = isKite ? '' : (import.meta.env.VITE_APP_LEVELS_BUCKET_URL ?? '').trim().replace(/\/+$/, '')
const PASSWORD_KEY = 'umb_levels_bucket_password'
const readPassword = (): string => {
  try { return localStorage.getItem(PASSWORD_KEY) ?? '' } catch { return '' }
}
export const bucketPassword = ref(readPassword())
export const setBucketPassword = (pw: string) => {
  bucketPassword.value = pw.trim()
  try { localStorage.setItem(PASSWORD_KEY, bucketPassword.value) } catch { /* private mode: this session only */ }
}
/** Last sync outcome, for the editor's status line. */
export const bucketStatus = ref<{ ok: boolean; text: string } | null>(null)
const report = (ok: boolean, text: string) => { bucketStatus.value = { ok, text } }

const toBucketEntry = (e: unknown): BucketEntry | null => {
  const o = e as { editedAt?: unknown; level?: unknown } | null
  // A clock far in the future would pin the entry forever: refuse it.
  if (!o || typeof o !== 'object' || !num(o.editedAt) || o.editedAt <= 0 || o.editedAt > Date.now() + 86_400_000) return null
  if (o.level === null) return { editedAt: o.editedAt, level: null }
  const level = parseLevel(o.level)
  return level && { editedAt: o.editedAt, level: { ...level, editedAt: o.editedAt } }
}

/** Takes every entry newer than this browser's copy (a bucket, or a library file in
 *  bucket shape). Returns how many changed. The bucket's library is the designer's
 *  own saved levels: only the designer ("cmonc") takes it, players get the campaign. */
export const applyBucket = (data: unknown, opts: { library?: boolean } = {}): number => {
  const withLibrary = opts.library ?? editorUnlocked.value
  if (!isBucket(data)) return 0
  const b = data
  let changed = 0
  // The order first: it decides which slots exist for the entries below.
  const rawOrder = b.campaign?.[ORDER_ENTRY] as { editedAt?: unknown; level?: Record<string, unknown> | null } | undefined
  const order = rawOrder && num(rawOrder.editedAt) && rawOrder.editedAt <= Date.now() + 86_400_000
    ? parseOrder({ ...(rawOrder.level ?? {}), editedAt: rawOrder.editedAt })
    : null
  if (order && order.editedAt > (campaignOrder.value?.editedAt ?? 0)) { putOrder(order); changed++ }
  for (const [key, raw] of Object.entries(b?.campaign ?? {})) {
    if (key === ORDER_ENTRY) continue
    const id = Number(key)
    let e: BucketEntry | null = null
    try { e = toBucketEntry(raw) } catch { /* one bad entry never stops the rest */ }
    if (!e || !LEVELS.some((l) => l.id === id) || e.editedAt <= localEditedAt('campaign', key)) continue
    putOverride(id, e.level)
    setTombstone(`c:${id}`, e.level ? null : e.editedAt)
    changed++
  }
  for (const [name, raw] of Object.entries(withLibrary ? b?.library ?? {} : {})) {
    let e: BucketEntry | null = null
    try { e = toBucketEntry(raw) } catch { /* one bad entry never stops the rest */ }
    if (!e || e.editedAt <= localEditedAt('library', name)) continue
    putLibrary(name, e.level)
    setTombstone(`l:${name}`, e.level ? null : e.editedAt)
    changed++
  }
  return changed
}

/** Everything this browser has edited, in bucket shape: the push side of a sync and
 *  the body of Export library. Edits from before timestamps count as time 1. */
export const localBucket = (): Bucket => {
  const out: Bucket = { campaign: {}, library: {} }
  for (const [id, l] of Object.entries(campaignOverrides.value)) out.campaign[id] = { editedAt: l.editedAt ?? 1, level: l }
  for (const [name, l] of Object.entries(customLevels.value)) out.library[name] = { editedAt: l.editedAt ?? 1, level: l }
  for (const [k, at] of Object.entries(tombstones)) {
    const section = k.startsWith('c:') ? out.campaign : out.library
    section[k.slice(2)] ??= { editedAt: at, level: null }
  }
  const o = campaignOrder.value
  if (o) out.campaign[ORDER_ENTRY] = { editedAt: o.editedAt, level: orderBody(o) as unknown as LevelDef }
  return out
}

/** fetch with a deadline: a hung connection must never stall the editor or the game. */
const fetchWithin = async (url: string, init: RequestInit, ms = 8000): Promise<Response> => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}
const isBucket = (d: unknown): d is Partial<Bucket> =>
  !!d && typeof d === 'object' && !Array.isArray(d) &&
  ['campaign', 'library'].every((k) => {
    const v = (d as Record<string, unknown>)[k]
    return v === undefined || (!!v && typeof v === 'object' && !Array.isArray(v))
  })

const send = async (body: Partial<Bucket>): Promise<boolean> => {
  if (!BUCKET_URL || !bucketPassword.value) return false
  try {
    const res = await fetchWithin(`${BUCKET_URL}/levels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bucketPassword.value}` },
      body: JSON.stringify(body)
    })
    if (res.status === 401) { report(false, 'Wrong editor password — nothing uploaded (your edits are kept in this browser)'); return false }
    if (!res.ok) { report(false, `Levels bucket: upload failed (${res.status})`); return false }
    const merged: unknown = await res.json().catch(() => null)
    if (isBucket(merged)) applyBucket(merged)
    return true
  } catch {
    report(false, 'Levels bucket unreachable — kept in this browser; Export library saves a copy')
    scheduleRetry()
    return false
  }
}

function pushEntry(section: 'campaign' | 'library', key: string, level: LevelDef | null, editedAt: number) {
  if (!BUCKET_URL) return
  if (!bucketPassword.value) { report(false, 'Not uploaded — enter the editor password to sync'); return }
  void send({ [section]: { [key]: { editedAt, level } } }).then((ok) => { if (ok) report(true, `Uploaded to every player · ${new Date().toLocaleTimeString()}`) })
}

// Unreachable: retry with backoff (5 s → 5 min) and as soon as the browser is back online.
// Nothing is lost meanwhile — every edit is in localStorage and the next sync uploads it.
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryDelay = 5000
function scheduleRetry() {
  if (retryTimer || typeof window === 'undefined') return
  retryTimer = setTimeout(() => { retryTimer = null; void syncBucket() }, retryDelay)
  retryDelay = Math.min(retryDelay * 2, 300_000)
}
if (BUCKET_URL && typeof window !== 'undefined') {
  window.addEventListener('online', () => { void syncBucket() })
}

/** Pulls the bucket (newest wins), then uploads whatever this browser has that is newer.
 *  One sync at a time: a second call waits for the running one. */
let running: Promise<boolean> | null = null
export const syncBucket = (): Promise<boolean> => {
  if (!BUCKET_URL) return Promise.resolve(false)
  running ??= runSync().finally(() => { running = null })
  return running
}
const runSync = async (): Promise<boolean> => {
  try {
    const res = await fetchWithin(`${BUCKET_URL}/levels`, { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    const remote: unknown = await res.json()
    if (!isBucket(remote)) throw new Error('not a levels bucket')
    const pulled = applyBucket(remote)
    const mine = localBucket()
    const newer: Bucket = { campaign: {}, library: {} }
    let n = 0
    for (const s of ['campaign', 'library'] as const) {
      for (const [k, e] of Object.entries(mine[s])) {
        if (e.editedAt > (remote[s]?.[k]?.editedAt ?? 0)) { newer[s][k] = e; n++ }
      }
    }
    const pushed = n > 0 && (await send(newer))
    if (n > 0 && !pushed) {
      if (!bucketPassword.value) report(false, `Levels bucket: pulled ${pulled}; ${n} local edit${n === 1 ? '' : 's'} not uploaded — enter the editor password`)
      return false
    }
    retryDelay = 5000
    report(true, `Synced · ${pulled} received, ${n} uploaded · ${new Date().toLocaleTimeString()}`)
    return true
  } catch {
    report(false, 'Levels bucket unreachable — using the levels in this browser')
    scheduleRetry()
    return false
  }
}

/** The game on GitHub Pages plays the bucket's campaign edits live; portal builds
 *  have no bucket URL and keep the levels baked into the build. */
if (BUCKET_URL && !import.meta.env.VITEST) void syncBucket()

// ── Playtest hand-off ──
/** Set by the editor right before it navigates to the game; the scene plays it. */
export const testLevel = ref<LevelDef | null>(null)

/** A player level the scene plays instead of the campaign: opened from a share
 *  link, or from the community list (then `communityId` is set, for plays and stars). */
export interface CustomPlay { level: LevelDef; name: string; communityId?: string }
export const customPlay = ref<CustomPlay | null>(null)

/** Keeps a shared level in the library under a free name ("name (2)" when the name
 *  holds a different level). Returns the name it is saved under. */
export const keepSharedLevel = (name: string, level: LevelDef): string => {
  const same = (a: LevelDef, b: LevelDef) => {
    const strip = ({ id: _i, editedAt: _e, ...rest }: LevelDef) => JSON.stringify(rest)
    return strip(a) === strip(b)
  }
  let n = name
  for (let k = 2; customLevels.value[n] && !same(customLevels.value[n]!, level); k++) n = `${name} (${k})`
  if (!customLevels.value[n]) saveCustomLevel(n, level)
  return n
}
/** The editor's working copy, so coming back from a playtest resumes the edit. */
/** Persisted, so a reload or a later visit reopens the edit instead of a blank level. */
const storedDraft = getState<{ name?: unknown; level?: unknown } | null>(DRAFT_KEY, null)
const draftLevel = storedDraft && parseLevel(storedDraft.level)
export const editorDraft = ref<{ name: string; level: LevelDef } | null>(
  draftLevel ? { name: typeof storedDraft.name === 'string' ? storedDraft.name : 'untitled', level: draftLevel } : null
)
export const saveEditorDraft = (name: string, level: LevelDef) => {
  editorDraft.value = { name, level: cloneLevel(level) }
  setState(DRAFT_KEY, editorDraft.value)
}

// ── The "cmonc" cheat: tuning panel + editor button, kept across the editor round trip ──
export const editorUnlocked = ref(getState<boolean>(EDITOR_UNLOCKED_KEY, false))
export const setEditorUnlocked = (on: boolean) => {
  editorUnlocked.value = on
  setState(EDITOR_UNLOCKED_KEY, on)
}

// ── JSON files ──
/** One level: what older editors exported, still importable (it opens in the editor). */
export interface LevelFile {
  game: 'umbrella'
  kind: 'level'
  version: 1
  name: string
  level: LevelDef
}

/** The editor's "Export library": every saved level, every edited campaign slot and
 *  every deletion, each with its edit time — the bucket's shape, so importing it merges
 *  the same way a sync does (newest wins). The fallback when the bucket is unreachable. */
export interface LevelLibraryFile extends Bucket {
  game: 'umbrella'
  kind: 'levels'
  version: 2
}

export const libraryToFile = (): LevelLibraryFile => ({ game: 'umbrella', kind: 'levels', version: 2, ...localBucket() })

/** A library file in bucket shape, or null when the file is not one. Version 1 files
 *  (a `levels` list, a `campaign` list, no edit times) count as edited at `importedAt`,
 *  since importing one is a deliberate choice. */
export const bucketFromFile = (data: unknown, importedAt = Date.now()): Partial<Bucket> | null => {
  const f = data as Record<string, unknown> | null
  if (!f || typeof f !== 'object' || f.kind !== 'levels') return null
  if (f.version === 2) return { campaign: (f.campaign ?? {}) as Bucket['campaign'], library: (f.library ?? {}) as Bucket['library'] }
  const out: Bucket = { campaign: {}, library: {} }
  for (const e of Array.isArray(f.levels) ? f.levels : []) {
    const one = levelFromFile(e)
    if (one) out.library[one.name] = { editedAt: importedAt, level: one.level }
  }
  for (const e of Array.isArray(f.campaign) ? f.campaign : []) {
    const o = e as { id?: unknown; level?: unknown } | null
    const level = parseLevel(o?.level)
    if (level && num(o?.id)) out.campaign[String(o.id)] = { editedAt: importedAt, level }
  }
  return out
}

/** Accepts the single-level file shape or a bare level object. */
export const levelFromFile = (data: unknown): { name: string; level: LevelDef } | null => {
  const f = data as Partial<LevelFile> | null
  if (f && typeof f === 'object' && 'level' in f) {
    const level = parseLevel(f.level)
    return level && { name: typeof f.name === 'string' && f.name ? f.name : 'imported', level }
  }
  const level = parseLevel(data)
  return level && { name: 'imported', level }
}
