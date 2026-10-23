// ─── Cutscene scripts: stored here, kept on the server too ───────────────────
//
// An edited cutscene (see cutscene.ts) is saved in this browser and uploaded to
// the same levels bucket as the levels, in its own `cutscenes` section — the
// newest `editedAt` wins, reading is public (everyone plays the designer's
// version), writing needs the editor password. Without an edit the game plays
// the built-in script (intro.ts builds it from the level).
//
// Unreachable bucket: the edit stays in this browser and the next sync uploads it.

import { ref } from 'vue'
import { getState, setState } from '@/use/useEpicState'
import { BUCKET_URL, bucketPassword } from './customLevels'
import type { CutsceneDef } from './cutscene'

const KEY = 'umb_cutscenes'

const isDef = (d: unknown): d is CutsceneDef => {
  const o = d as Partial<CutsceneDef> | null
  return !!o && typeof o === 'object' && typeof o.id === 'string' && typeof o.level === 'number' &&
    typeof o.duration === 'number' && o.duration > 0 && Array.isArray(o.actors) && Array.isArray(o.clouds) && Array.isArray(o.cues)
}
const validAt = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= Date.now() + 86_400_000

const stored = getState<Record<string, unknown>>(KEY, {})
/** The edited scripts of this browser, by cutscene id. */
export const cutsceneEdits = ref<Record<string, CutsceneDef>>(
  Object.fromEntries(Object.entries(stored).filter(([, v]) => isDef(v)) as [string, CutsceneDef][])
)
const persist = () => setState(KEY, cutsceneEdits.value)

/** The edited script for an id, if there is one. */
export const editedCutscene = (id: string): CutsceneDef | null => cutsceneEdits.value[id] ?? null

const fetchWithin = async (url: string, init: RequestInit, ms = 8000): Promise<Response> => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...init, signal: ctrl.signal }) } finally { clearTimeout(timer) }
}

interface Entry { editedAt: number; level: CutsceneDef | null }

/** Takes every cutscene in a bucket section that is newer than this browser's copy. Returns how many changed. */
export const applyCutscenes = (section: unknown): number => {
  if (!section || typeof section !== 'object' || Array.isArray(section)) return 0
  let changed = 0
  for (const [id, raw] of Object.entries(section as Record<string, Partial<Entry>>)) {
    if (!raw || !validAt(raw.editedAt) || raw.editedAt <= (cutsceneEdits.value[id]?.editedAt ?? 0)) continue
    if (raw.level === null) {
      // Reverted on the server: back to the built-in script.
      const { [id]: _gone, ...rest } = cutsceneEdits.value
      cutsceneEdits.value = rest
    } else if (isDef(raw.level)) cutsceneEdits.value = { ...cutsceneEdits.value, [id]: { ...raw.level, editedAt: raw.editedAt } }
    else continue
    changed++
  }
  if (changed) persist()
  return changed
}

const push = async (body: Record<string, Entry>): Promise<boolean> => {
  if (!BUCKET_URL || !bucketPassword.value) return false
  try {
    const res = await fetchWithin(`${BUCKET_URL}/levels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bucketPassword.value}` },
      body: JSON.stringify({ cutscenes: body })
    })
    return res.ok
  } catch {
    return false
  }
}

/** Saves an edited script: here at once, to the server when it can be reached. */
export const saveCutscene = (def: CutsceneDef): Promise<boolean> => {
  const editedAt = Date.now()
  const next = { ...def, editedAt }
  cutsceneEdits.value = { ...cutsceneEdits.value, [def.id]: next }
  persist()
  return push({ [def.id]: { editedAt, level: next } })
}

/** Back to the built-in script (the revert reaches the server as a deletion). */
export const revertCutscene = (id: string): Promise<boolean> => {
  const { [id]: _gone, ...rest } = cutsceneEdits.value
  cutsceneEdits.value = rest
  persist()
  return push({ [id]: { editedAt: Date.now(), level: null } })
}

/** Pulls the server's newest scripts, then uploads local ones the server lacks or has older. */
export const syncCutscenes = async (): Promise<boolean> => {
  if (!BUCKET_URL) return false
  try {
    const res = await fetchWithin(`${BUCKET_URL}/levels`, { cache: 'no-store' })
    if (!res.ok) return false
    const remote = ((await res.json()) as { cutscenes?: Record<string, Entry> }).cutscenes ?? {}
    applyCutscenes(remote)
    const newer: Record<string, Entry> = {}
    for (const [id, def] of Object.entries(cutsceneEdits.value)) {
      const at = def.editedAt ?? 1
      if (at > (remote[id]?.editedAt ?? 0)) newer[id] = { editedAt: at, level: def }
    }
    return Object.keys(newer).length ? await push(newer) : true
  } catch {
    return false
  }
}

/** The game plays the server's newest script; portal builds (no bucket) keep the built-in one. */
if (BUCKET_URL && !import.meta.env.VITEST) void syncCutscenes()
