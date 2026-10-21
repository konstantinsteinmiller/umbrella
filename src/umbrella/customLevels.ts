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
//   • the test level — a non-persisted level the editor hands to the scene
//     for one playtest before navigating there.
// Everything persists through the one-blob state layer (useEpicState).

import { ref } from 'vue'
import { getState, setState } from '@/use/useEpicState'
import overridesFromDisk from 'virtual:campaign-overrides'
import { LEVELS, type LevelDef } from './levels'

const LIBRARY_KEY = 'umb_custom_levels_v1'
const OVERRIDES_KEY = 'umb_level_overrides_v1'
const EDITOR_UNLOCKED_KEY = 'umb_editor_unlocked'
const DRAFT_KEY = 'umb_editor_draft'

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
  if (l.hazards && (!Array.isArray(l.hazards) || !l.hazards.every((h) => isRect(h) && ['pillar', 'mine', 'spikes'].includes(h.kind)))) return null
  return cloneLevel({ ...l, id: num(l.id) ? l.id : 0, hazards: l.hazards ?? [] } as LevelDef)
}

// ── Named library ──
export const customLevels = ref<Record<string, LevelDef>>(getState<Record<string, LevelDef>>(LIBRARY_KEY, {}))
export const saveCustomLevel = (name: string, level: LevelDef) => {
  customLevels.value = { ...customLevels.value, [name]: cloneLevel(level) }
  setState(LIBRARY_KEY, customLevels.value)
}
export const deleteCustomLevel = (name: string) => {
  const next = { ...customLevels.value }
  delete next[name]
  customLevels.value = next
  setState(LIBRARY_KEY, next)
}

// ── Campaign overrides (patched into LEVELS) ──
const loadOverrides = (): Record<number, LevelDef> => {
  const out: Record<number, LevelDef> = {}
  for (const [k, v] of Object.entries(getState<Record<string, unknown>>(OVERRIDES_KEY, {}))) {
    const l = parseLevel(v)
    if (l) out[Number(k)] = l
  }
  for (const [k, v] of Object.entries(overridesFromDisk)) {
    const l = parseLevel(v)
    if (l) out[Number(k)] = l
  }
  return out
}
export const campaignOverrides = ref<Record<number, LevelDef>>(loadOverrides())

/** Dev server only (the endpoint does not exist in a build): mirror into the repo file. */
const postToDisk = (path: string, body: object) => {
  if (!import.meta.env.DEV) return
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .catch(() => { /* no dev server: localStorage stays the copy */ })
}

const patchSlot = (id: number, level: LevelDef) => {
  const i = LEVELS.findIndex((l) => l.id === id)
  if (i >= 0) LEVELS[i] = { ...cloneLevel(level), id }
}
for (const [id, level] of Object.entries(campaignOverrides.value)) patchSlot(Number(id), level)

/** The tuning panel stores per-level knob edits (wind speeds, periods) by id;
 *  an edited slot drops them, or they would overwrite the editor's values. */
const TUNING_LEVELS_KEY = 'umb_levels_r2'
const dropPanelEdits = (id: number) =>
  setState(TUNING_LEVELS_KEY, getState<{ id: number }[]>(TUNING_LEVELS_KEY, []).filter((l) => l?.id !== id))

export const saveCampaignOverride = (id: number, level: LevelDef) => {
  dropPanelEdits(id)
  campaignOverrides.value = { ...campaignOverrides.value, [id]: { ...cloneLevel(level), id } }
  setState(OVERRIDES_KEY, campaignOverrides.value)
  postToDisk('/__maw/save-override', { id, stage: campaignOverrides.value[id] })
  patchSlot(id, level)
}
export const clearCampaignOverride = (id: number) => {
  const next = { ...campaignOverrides.value }
  delete next[id]
  campaignOverrides.value = next
  setState(OVERRIDES_KEY, next)
  postToDisk('/__maw/clear-override', { id })
  dropPanelEdits(id)
  const original = builtInLevel(id)
  if (original) patchSlot(id, original)
}

// ── Playtest hand-off ──
/** Set by the editor right before it navigates to the game; the scene plays it. */
export const testLevel = ref<LevelDef | null>(null)
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
export interface LevelFile {
  game: 'umbrella'
  kind: 'level'
  version: 1
  name: string
  level: LevelDef
}

export const levelToFile = (name: string, level: LevelDef): LevelFile =>
  ({ game: 'umbrella', kind: 'level', version: 1, name, level: cloneLevel(level) })

/** Several levels in one file: the editor's "Export library". */
export interface LevelLibraryFile {
  game: 'umbrella'
  kind: 'levels'
  version: 1
  levels: { name: string; level: LevelDef }[]
}

export const libraryToFile = (library: Record<string, LevelDef>): LevelLibraryFile => ({
  game: 'umbrella',
  kind: 'levels',
  version: 1,
  levels: Object.keys(library).sort().map((name) => ({ name, level: cloneLevel(library[name]!) }))
})

/** Every level in a file: a library file, a single-level file, or a bare level. */
export const levelsFromFile = (data: unknown): { name: string; level: LevelDef }[] => {
  const f = data as Partial<LevelLibraryFile> | null
  if (f && typeof f === 'object' && Array.isArray(f.levels)) {
    return f.levels.flatMap((entry) => {
      const one = levelFromFile(entry)
      return one ? [one] : []
    })
  }
  const one = levelFromFile(data)
  return one ? [one] : []
}

/** Accepts the editor's own file shape or a bare level object. */
export const levelFromFile = (data: unknown): { name: string; level: LevelDef } | null => {
  const f = data as Partial<LevelFile> | null
  if (f && typeof f === 'object' && 'level' in f) {
    const level = parseLevel(f.level)
    return level && { name: typeof f.name === 'string' && f.name ? f.name : 'imported', level }
  }
  const level = parseLevel(data)
  return level && { name: 'imported', level }
}
