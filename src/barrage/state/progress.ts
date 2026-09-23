/**
 * Elemental Barrage — the persisted meta-progress every retention system reads.
 *
 * Deliberately ENGINE-FREE: the battle pass, achievements, leaderboard, GamePix
 * plugin and cheats all need "best row / lifetime stats / max ball tier", and
 * several of them sit on the boot path (App, main.ts's GamePix plugin). Importing
 * `useBarrage` there would drag the whole engine into the entry chunk; importing
 * this file costs a few refs. `useBarrage` is the only WRITER of the run-driven
 * fields; everything else only reads.
 *
 * Hydration: every ref re-reads the blob on `saveDataVersion`, forward-only —
 * a counter or watermark only ever takes the higher of local vs hydrated, so a
 * late cloud read can never regress a session that already played past it.
 */
import { ref, watch, type Ref } from 'vue'
import { getState, setState } from '@/use/useEpicState'
import { saveDataVersion } from '@/use/useSaveStatus'
import type { GameMode, SkillId } from '../engine/types'
import {
  EB_BEST_ROW_KEY, EB_CHECKPOINT_KEY, EB_FTUE_KEY, EB_MERGE_SCORE_KEY, EB_PENDING_KEY,
  EB_SEGMENT_KEY, EB_STATS_KEY
} from '../keys'

// ─── Lifetime stats ──────────────────────────────────────────────────────────
export interface BarrageStats {
  kills: number
  bossKills: number
  merges: number
  volleys: number
  hits: number
  /** Most hits in one volley. */
  bestCombo: number
  fevers: number
  pickups: number
  /** Rows spawned across every run (endless + daily). */
  rowsTotal: number
}

export const STAT_KEYS: readonly (keyof BarrageStats)[] = [
  'kills', 'bossKills', 'merges', 'volleys', 'hits', 'bestCombo', 'fevers', 'pickups', 'rowsTotal'
]

/** Watermark stats take the max on bump; the rest accumulate. */
const WATERMARKS: ReadonlySet<keyof BarrageStats> = new Set(['bestCombo'])

export const defaultStats = (): BarrageStats => ({
  kills: 0, bossKills: 0, merges: 0, volleys: 0, hits: 0, bestCombo: 0, fevers: 0, pickups: 0, rowsTotal: 0
})

/** A non-negative integer out of anything a cloud restore can hand back. */
export const toCount = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback
}

const readStats = (): { stats: BarrageStats; maxBallTier: number } => {
  const raw = getState<Record<string, unknown> | null>(EB_STATS_KEY, null) ?? {}
  const stats = defaultStats()
  for (const k of STAT_KEYS) stats[k] = toCount(raw[k])
  return { stats, maxBallTier: Math.max(1, toCount(raw.maxBallTier, 1)) }
}

// ─── Checkpoint / FTUE / segment one-shots ───────────────────────────────────
export interface Checkpoint {
  /** Last defeated boss row; 0 before the first boss. */
  row: number
  /** The tray at that kill (descending). */
  tray: number[]
}

export interface FtueState {
  /** First boss killed — the scripted first-session config is over for good. */
  done: boolean
  /** The first tray merge happened (arms the free "Tray Capacity 3"). */
  firstMerge: boolean
  /** The free capacity level was taken. */
  freeCapacity: boolean
}

export interface SegmentState {
  /** The rewarded Meteor continue was used in this checkpoint segment. */
  meteor: boolean
  /** The rewarded +5 balls was used in this checkpoint segment. */
  bonusBalls: boolean
}

export interface PendingGrants {
  balls: number[]
  skills: SkillId[]
}

export const sanitizeTray = (v: unknown): number[] =>
  Array.isArray(v)
    ? v.map((t) => toCount(t)).filter((t) => t >= 1).sort((a, b) => b - a)
    : []

const readCheckpoint = (): Checkpoint => {
  const raw = getState<Partial<Checkpoint> | null>(EB_CHECKPOINT_KEY, null)
  return { row: toCount(raw?.row), tray: sanitizeTray(raw?.tray) }
}

const readFtue = (): FtueState => {
  const raw = getState<Partial<FtueState> | null>(EB_FTUE_KEY, null)
  return {
    done: raw?.done === true,
    firstMerge: raw?.firstMerge === true,
    freeCapacity: raw?.freeCapacity === true
  }
}

const readSegment = (): SegmentState => {
  const raw = getState<Partial<SegmentState> | null>(EB_SEGMENT_KEY, null)
  return { meteor: raw?.meteor === true, bonusBalls: raw?.bonusBalls === true }
}

const SKILLS: ReadonlySet<string> = new Set(['meteor', 'warcry', 'legion', 'pact', 'shield', 'execute', 'heal', 'revive'])

const readPending = (): PendingGrants => {
  const raw = getState<Partial<PendingGrants> | null>(EB_PENDING_KEY, null)
  return {
    balls: sanitizeTray(raw?.balls),
    skills: Array.isArray(raw?.skills) ? raw.skills.filter((s): s is SkillId => typeof s === 'string' && SKILLS.has(s)) : []
  }
}

// ─── The shared refs ─────────────────────────────────────────────────────────
const boot = readStats()
export const stats: Ref<BarrageStats> = ref(boot.stats)
/** Highest ball tier ever created (codex / launcher unlocks / leaderboard flair). */
export const maxBallTier: Ref<number> = ref(boot.maxBallTier)
/** Deepest endless row ever reached (the leaderboard score). */
export const bestRow: Ref<number> = ref(toCount(getState(EB_BEST_ROW_KEY, 0)))
export const checkpoint: Ref<Checkpoint> = ref(readCheckpoint())
export const ftue: Ref<FtueState> = ref(readFtue())
export const segment: Ref<SegmentState> = ref(readSegment())
export const pending: Ref<PendingGrants> = ref(readPending())
/** Which run is live. Lives here (not in useBarrage) so `useDailyBarrage` can
 *  read it without importing the engine owner. Never persisted: a reload always
 *  comes back to the endless run. */
export const mode: Ref<GameMode> = ref('endless')
/** Bumps every time a run ENDS — an endless breach or a daily run over. The
 *  leaderboard's "report now, whatever the throttle says" edge, readable
 *  without importing the engine. */
export const runEndSeq: Ref<number> = ref(0)

// ─── Writers ─────────────────────────────────────────────────────────────────
export const persistStats = (): void => {
  setState(EB_STATS_KEY, { ...stats.value, maxBallTier: maxBallTier.value })
}

/** Add to counters / raise watermarks. Reactive immediately; persisted by the
 *  caller at a turn boundary (`persistStats`) — per-hit blob writes would
 *  re-spread the whole save object hundreds of times a volley. */
export const bumpStats = (delta: Partial<BarrageStats>): void => {
  const next = { ...stats.value }
  let changed = false
  for (const k of STAT_KEYS) {
    const d = delta[k]
    if (d === undefined || !Number.isFinite(d)) continue
    const v = WATERMARKS.has(k) ? Math.max(next[k], Math.floor(d)) : next[k] + Math.max(0, Math.floor(d))
    if (v !== next[k]) { next[k] = v; changed = true }
  }
  if (changed) stats.value = next
}

/** Raise the max-tier watermark. Returns true when `tier` is a first. */
export const noteBallTier = (tier: number): boolean => {
  if (!Number.isFinite(tier) || tier <= maxBallTier.value) return false
  maxBallTier.value = Math.floor(tier)
  return true
}

export const noteBestRow = (row: number): boolean => {
  if (!Number.isFinite(row) || row <= bestRow.value) return false
  bestRow.value = Math.floor(row)
  setState(EB_BEST_ROW_KEY, bestRow.value)
  setState(EB_MERGE_SCORE_KEY, Math.max(1, bestRow.value))
  return true
}

export const setCheckpoint = (row: number, tray: readonly number[]): void => {
  checkpoint.value = { row: toCount(row), tray: sanitizeTray([...tray]) }
  setState(EB_CHECKPOINT_KEY, checkpoint.value)
}

export const patchFtue = (patch: Partial<FtueState>): void => {
  ftue.value = { ...ftue.value, ...patch }
  setState(EB_FTUE_KEY, ftue.value)
}

export const patchSegment = (patch: Partial<SegmentState>): void => {
  segment.value = { ...segment.value, ...patch }
  setState(EB_SEGMENT_KEY, segment.value)
}

export const setPending = (next: PendingGrants): void => {
  pending.value = { balls: [...next.balls], skills: [...next.skills] }
  setState(EB_PENDING_KEY, pending.value)
}

/** Owe the endless run a ball / a skill charge. `useBarrage` delivers it the
 *  moment the endless run can take it (and a reload before that loses nothing,
 *  because the debt itself is saved). This is how the battle pass and the
 *  supply drop pay out without importing the engine owner. */
export const oweBall = (tier: number): void => {
  const t = Math.max(1, Math.floor(tier) || 1)
  setPending({ balls: [...pending.value.balls, t], skills: pending.value.skills })
}

export const oweSkill = (skill: SkillId): void => {
  setPending({ balls: pending.value.balls, skills: [...pending.value.skills, skill] })
}

/** The first-session script still applies: no boss has ever died. The lifetime
 *  boss counter is checked too — a save whose FTUE flag was lost (or predates
 *  it) must never replay the tutorial board to a player who has beaten bosses. */
export const isFtueActive = (): boolean => !ftue.value.done && stats.value.bossKills === 0

// ─── Hydration (forward-only) ────────────────────────────────────────────────
export const refreshProgressFromBlob = (): void => {
  const saved = readStats()
  const merged = { ...stats.value }
  let changed = false
  for (const k of STAT_KEYS) {
    if (saved.stats[k] > merged[k]) { merged[k] = saved.stats[k]; changed = true }
  }
  if (changed) stats.value = merged
  if (saved.maxBallTier > maxBallTier.value) maxBallTier.value = saved.maxBallTier

  const savedBest = toCount(getState(EB_BEST_ROW_KEY, 0))
  if (savedBest > bestRow.value) bestRow.value = savedBest

  // The checkpoint only ever moves forward (a boss kill sets it to a row above
  // the one the run started from), so the deeper one is the newer one.
  const savedCp = readCheckpoint()
  if (savedCp.row > checkpoint.value.row) checkpoint.value = savedCp

  const savedFtue = readFtue()
  ftue.value = {
    done: ftue.value.done || savedFtue.done,
    firstMerge: ftue.value.firstMerge || savedFtue.firstMerge,
    freeCapacity: ftue.value.freeCapacity || savedFtue.freeCapacity
  }
  // A used one-shot stays used: taking the OR means switching devices can
  // never mint a second Meteor continue in the same segment.
  const savedSeg = readSegment()
  segment.value = {
    meteor: segment.value.meteor || savedSeg.meteor,
    bonusBalls: segment.value.bonusBalls || savedSeg.bonusBalls
  }
  const savedPending = readPending()
  if (savedPending.balls.length + savedPending.skills.length > pending.value.balls.length + pending.value.skills.length) {
    pending.value = savedPending
  }
}
// Sync flush so every watcher downstream (achievement toasts re-seeding on a
// hydrate, the leaderboard) sees the hydrated numbers in the same tick as the
// version bump, never a half-refreshed mix.
watch(saveDataVersion, refreshProgressFromBlob, { flush: 'sync' })
