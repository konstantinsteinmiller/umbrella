/**
 * Umbrella — the persisted meta-progress every retention system reads.
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
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { getState, setState } from '@/use/useEpicState'
import { saveDataVersion } from '@/use/useSaveStatus'
import type { GameMode, PerkCounts, SkillId } from '../engine/types'
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

/**
 * Play clock, lifetime half (`playClock.ts` owns the ticking): whole seconds of
 * ACTIVE gameplay across every session, stored beside the stats in the same
 * blob (`umb_stats.playSeconds`) and hydrated the same forward-only way.
 *
 * A save from before the clock has no such field. It is credited with
 * LEGACY_SECONDS_PER_VOLLEY per volley it ever fired, so a veteran who long
 * since played past the rewarded gate is not locked out of every rewarded
 * offer for three minutes after the update. The rate is the bot sim's quickest
 * turn (`scripts/barrage-sim.mjs`: 7 s; the human bot takes 9.5 s), so the
 * credit under-counts: it can delay an offer, never open one early.
 */
export const LEGACY_SECONDS_PER_VOLLEY = 7

const readStats = (): { stats: BarrageStats; maxBallTier: number; playSeconds: number } => {
  const raw = getState<Record<string, unknown> | null>(EB_STATS_KEY, null) ?? {}
  const stats = defaultStats()
  for (const k of STAT_KEYS) stats[k] = toCount(raw[k])
  return {
    stats,
    maxBallTier: Math.max(1, toCount(raw.maxBallTier, 1)),
    playSeconds: toCount(raw.playSeconds, stats.volleys * LEGACY_SECONDS_PER_VOLLEY)
  }
}

// ─── Checkpoint / FTUE / segment one-shots ───────────────────────────────────
export interface Checkpoint {
  /** Last defeated boss row; 0 before the first boss. */
  row: number
  /** The tray at that kill (descending). */
  tray: number[]
  /** Checkpoint restarts after a breach with the NEXT boss on the board —
   *  the boss mercy count (`bossHpMultForDeaths`). A kill resets it. */
  deaths: number
  /** Playtest run 9: the full HP (before mercy) of the weakest meeting with
   *  that boss the player lost — the retry's cap (`config.bossHpCap`), so the
   *  boss never comes back stronger than the one that won. 0 = none. A kill
   *  resets it. */
  bossHp: number
  /** Shoot-to-Choose (retention-roadmap #5): the run's picked perks. They ride
   *  the checkpoint — a restart keeps them; only a fresh row-1 run (no
   *  checkpoint) starts without. Absent = none. */
  perks?: PerkCounts
}

/** Perk ids, literal here so this module stays engine-free (types.ts `PERK_IDS`). */
const PERK_KEYS = ['power', 'splash', 'bounty', 'volley'] as const
const PERK_CAP = 3
export const sanitizePerks = (v: unknown): PerkCounts | undefined => {
  if (!v || typeof v !== 'object') return undefined
  const out: PerkCounts = {}
  let any = false
  for (const k of PERK_KEYS) {
    const n = (v as Record<string, unknown>)[k]
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1) { out[k] = Math.min(PERK_CAP, Math.floor(n)); any = true }
  }
  return any ? out : undefined
}
const perkTotal = (p: PerkCounts | undefined): number => PERK_KEYS.reduce((a, k) => a + (p?.[k] ?? 0), 0)

export interface FtueState {
  /** First boss killed — the scripted first-session config is over for good. */
  done: boolean
  /** The first tray merge happened (arms the free "Tray Capacity 3"). */
  firstMerge: boolean
  /** The free capacity level was taken. */
  freeCapacity: boolean
  /** Playtest run 8: the Damage arrows were ignored three times, so the first
   *  Ball Damage level is offered FREE (like the Capacity gift)… */
  freeDamageOffer: boolean
  /** …and was taken. */
  freeDamage: boolean
  /** Instant Barrage (retention-roadmap #1): capacity levels the FTUE granted
   *  as sockets (engine `traySocket`) — free levels, never counted as paid. */
  sockets: number
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
  const perks = sanitizePerks(raw?.perks)
  return { row: toCount(raw?.row), tray: sanitizeTray(raw?.tray), deaths: toCount(raw?.deaths), bossHp: toCount(raw?.bossHp), ...(perks ? { perks } : {}) }
}

const readFtue = (): FtueState => {
  const raw = getState<Partial<FtueState> | null>(EB_FTUE_KEY, null)
  return {
    done: raw?.done === true,
    firstMerge: raw?.firstMerge === true,
    freeCapacity: raw?.freeCapacity === true,
    freeDamageOffer: raw?.freeDamageOffer === true,
    freeDamage: raw?.freeDamage === true,
    sockets: toCount(raw?.sockets)
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
/** Lifetime seconds of active gameplay (see LEGACY_SECONDS_PER_VOLLEY). Raised
 *  by `playClock.ts` through `addPlaySeconds`; persisted with the stats. */
export const lifetimePlaySeconds: Ref<number> = ref(boot.playSeconds)
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
  setState(EB_STATS_KEY, { ...stats.value, maxBallTier: maxBallTier.value, playSeconds: lifetimePlaySeconds.value })
}

/** Add whole seconds of active play. Reactive immediately; persisted by the
 *  play clock's throttle and at every turn boundary (`persistStats`). */
export const addPlaySeconds = (seconds: number): void => {
  const s = Math.floor(seconds)
  if (!Number.isFinite(s) || s <= 0) return
  lifetimePlaySeconds.value += s
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
  // The run's perks carry over to the new checkpoint (Shoot-to-Choose).
  const perks = checkpoint.value.perks
  checkpoint.value = { row: toCount(row), tray: sanitizeTray([...tray]), deaths: 0, bossHp: 0, ...(perks ? { perks: { ...perks } } : {}) }
  setState(EB_CHECKPOINT_KEY, checkpoint.value)
}

/** Shoot-to-Choose: the run's perks after a pick, kept with the checkpoint. */
export const setRunPerks = (perks: PerkCounts | undefined): void => {
  const clean = sanitizePerks(perks)
  const { perks: _old, ...rest } = checkpoint.value
  checkpoint.value = clean ? { ...rest, perks: clean } : rest
  setState(EB_CHECKPOINT_KEY, checkpoint.value)
}

/** The run lost to the boss past the checkpoint and restarts before it;
 *  `fullHp`: that boss's full HP (before mercy) — the retry's cap. */
export const noteBossDeath = (fullHp = 0): void => {
  const cp = checkpoint.value
  const hp = toCount(fullHp)
  const bossHp = hp > 0 && (cp.bossHp <= 0 || hp < cp.bossHp) ? hp : cp.bossHp
  checkpoint.value = { ...cp, deaths: cp.deaths + 1, bossHp }
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

// ─── The rewarded gate ───────────────────────────────────────────────────────
/** Boss kills a player needs before any rewarded offer appears. */
export const REWARDED_MIN_BOSS_KILLS = 1
/** Lifetime seconds of active play a player needs before any rewarded offer
 *  appears (3:00). */
export const REWARDED_MIN_PLAY_SECONDS = 180

/**
 * THE rewarded gate, one predicate for every rewarded placement (the Meteor
 * continue, the ▶ 3× boss chest, the +5 balls, the skin ads, and any added
 * later): the first boss kill AND 3:00 of lifetime active play (user decision
 * 2026-09-27). Poki's playtests opened with a "Rewarded Break" because the
 * rewarded ad is ready from the first frame there, so no rewarded CTA may show
 * in a player's opening minutes.
 *
 * A locked offer is HIDDEN, never shown disabled. Each placement still applies
 * its own conditions on top (ad readiness, once per segment, "only where it
 * helps"). Both inputs are lifetime values, so a returning player who already
 * qualifies sees offers from the first frame.
 */
export const rewardedOffersUnlocked: ComputedRef<boolean> = computed(() =>
  stats.value.bossKills >= REWARDED_MIN_BOSS_KILLS && lifetimePlaySeconds.value >= REWARDED_MIN_PLAY_SECONDS)

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
  if (saved.playSeconds > lifetimePlaySeconds.value) lifetimePlaySeconds.value = saved.playSeconds

  const savedBest = toCount(getState(EB_BEST_ROW_KEY, 0))
  if (savedBest > bestRow.value) bestRow.value = savedBest

  // The checkpoint only ever moves forward (a boss kill sets it to a row above
  // the one the run started from), so the deeper one is the newer one.
  const savedCp = readCheckpoint()
  if (savedCp.row > checkpoint.value.row) checkpoint.value = savedCp
  // At the same checkpoint the death count only grows (a kill resets it by
  // moving the checkpoint), so the higher one is the newer one.
  // Same checkpoint, more picks on the other device: those are the newer ones.
  if (savedCp.row === checkpoint.value.row && perkTotal(savedCp.perks) > perkTotal(checkpoint.value.perks)) {
    checkpoint.value = { ...checkpoint.value, perks: savedCp.perks }
  }
  if (savedCp.row === checkpoint.value.row && savedCp.deaths > checkpoint.value.deaths) {
    checkpoint.value = { ...checkpoint.value, deaths: savedCp.deaths, bossHp: savedCp.bossHp || checkpoint.value.bossHp }
  }

  const savedFtue = readFtue()
  ftue.value = {
    done: ftue.value.done || savedFtue.done,
    firstMerge: ftue.value.firstMerge || savedFtue.firstMerge,
    freeCapacity: ftue.value.freeCapacity || savedFtue.freeCapacity,
    freeDamageOffer: ftue.value.freeDamageOffer || savedFtue.freeDamageOffer,
    freeDamage: ftue.value.freeDamage || savedFtue.freeDamage,
    sockets: Math.max(ftue.value.sockets, savedFtue.sockets)
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
