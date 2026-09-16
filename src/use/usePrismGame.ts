/**
 * usePrismGame — the merge-grid state machine.
 *
 * Owns the 4×4 merge grid, the tap-to-spawn economy and the automation imp.
 * Everything battle-side (fighters, waves, upgrades, combo, gold from kills)
 * lives in `useBattle`; this module stays the single authority for what sits
 * in the grid. Grid contents and the max-tier watermark survive reloads via
 * the single `merge-idle-war_state` blob (`useEpicState`).
 *
 * Spawning is clicker-style pacing (no gold cost): 3 taps of the Spawn button
 * produce one tier-1 recruit. The rewarded "Instant Spawn" buff drops that to
 * 1 tap for 2 minutes — the tap friction is what gives the player recovery
 * time after a wave wipes the army, while the buff sells the power fantasy.
 *
 * Module-level singleton so every component shares one authoritative grid.
 * The view drives the simulation by calling `startEngine()` / `stopEngine()`
 * around its lifecycle; pointer components call `merge()`, `moveSlot()`,
 * `tapSpawn()`, `takeFromGrid()` and watch `autoAction` for imp VFX.
 */

import { ref, computed, watch, type Ref } from 'vue'
import { saveDataVersion } from '@/use/useSaveStatus'
import { getState, setState, prismState } from '@/use/useEpicState'
import useEpicConfig from '@/use/useEpicConfig'
import { GRID_KEY, PRISM_MAX_TIER_KEY, PRISM_INSTANT_SPAWN_KEY } from '@/keys'
import { impCadenceMs, bumpStat, recruitTier } from '@/use/useBattle'
import { notifyTutorial, isTutorialOneTap } from '@/use/useTutorial'
import { isGamePaused } from '@/use/useGamePause'
import { announceNewTier, endReveal, retargetReveal, revealTargets } from '@/use/useTierReveal'

// ─── Tunables ────────────────────────────────────────────────────────────────
export const GRID_COLS = 4
export const GRID_ROWS = 4
export const GRID_SIZE = GRID_COLS * GRID_ROWS
/** Spawn-button taps required per recruit without the buff. Was 4: play-testers
 *  read a 4-tap meter as a cooldown and waited between taps, which starved the
 *  army before the wave-5 boss. The button now counts the taps left out loud. */
export const CLICKS_PER_SPAWN = 3
/** Instant-spawn buff duration (rewarded ad): 1 tap per recruit. */
const INSTANT_SPAWN_MS = 120_000

// ─── Persisted reactive state (mirrors of merge-idle-war_state fields) ────────────────
const readJSON = <T>(key: string, fallback: T): T => {
  const v = getState<unknown>(key)
  if (v === undefined || v === null) return fallback
  return v as T
}

const sanitizeGrid = (g: unknown): number[] => {
  const arr = Array.isArray(g) ? g.slice(0, GRID_SIZE).map((n) => {
    const t = Math.floor(Number(n))
    // Allow tiers past the authored art (merging is uncapped); just reject junk.
    return Number.isFinite(t) && t >= 1 && t <= 999 ? t : 0
  }) : []
  while (arr.length < GRID_SIZE) arr.push(0)
  return arr
}

const grid: Ref<number[]> = ref(sanitizeGrid(readJSON(GRID_KEY, [])))
/** Highest tier ever created — the discovery watermark (codex, achievements). */
export const maxTier: Ref<number> = ref(Number(readJSON(PRISM_MAX_TIER_KEY, 1)) || 1)

/** Raise the discovery watermark to `tier` if it's a new high and persist it —
 *  the single "unlock the codex entry" entry point. Every tier-producing path
 *  (grid spawn/merge here, plus arena deploy/field-merge via the battle event
 *  sink) funnels through this so a newly reached tier ALWAYS lights up the Unit
 *  Codex. Idempotent and safe to call on every merge. */
export const bumpMaxTier = (tier: number): void => {
  if (Number.isFinite(tier) && tier > maxTier.value) {
    maxTier.value = tier
    setState(PRISM_MAX_TIER_KEY, maxTier.value)
  }
}

/**
 * An arena field merge landed on fighter `fighterId`, which is now `tier`.
 * Raises the watermark like `bumpMaxTier`, and — only when `tier` is one the
 * player never had — starts the new-tier reveal on that fighter. Returns
 * whether it was a discovery, so the arena plays the reveal sting instead of
 * the ordinary field-merge sound.
 *
 * The discovery test has to run BEFORE the bump: afterwards every tier is
 * "already known". It lives here rather than in a watcher on `maxTier` because
 * the watermark also moves on spawns, deploys, chest rewards and the
 * restored-army reconcile, and none of those may trigger the moment.
 */
export const noteFieldMerge = (tier: number, fighterId: number | null): boolean => {
  const discovered = Number.isFinite(tier) && tier > maxTier.value
  bumpMaxTier(tier)
  if (discovered && fighterId !== null) announceNewTier(tier, { kind: 'fighter', fighterId })
  return discovered
}
/** Epoch-ms the instant-spawn buff expires at (persisted; survives reloads). */
const instantSpawnUntil: Ref<number> = ref(Number(readJSON(PRISM_INSTANT_SPAWN_KEY, 0)) || 0)

// ─── Transient (in-memory) state ─────────────────────────────────────────────
/** Taps accumulated toward the next spawn (0..CLICKS_PER_SPAWN-1). */
const spawnClicks = ref(0)
/** Buff countdown for the UI, ms. Ticked by the engine; >0 ⇔ buff active. */
const instantSpawnRemainingMs = ref(Math.max(0, instantSpawnUntil.value - Date.now()))
let lastAutoAt = Date.now()

// Re-hydrate the persisted refs when the cloud sync writes back into the blob.
const refreshFromBlob = (): void => {
  grid.value = sanitizeGrid(readJSON(GRID_KEY, grid.value))
  maxTier.value = Number(readJSON(PRISM_MAX_TIER_KEY, maxTier.value)) || 1
  instantSpawnUntil.value = Number(readJSON(PRISM_INSTANT_SPAWN_KEY, instantSpawnUntil.value)) || 0
  instantSpawnRemainingMs.value = Math.max(0, instantSpawnUntil.value - Date.now())
}
watch(saveDataVersion, refreshFromBlob)
watch(prismState, refreshFromBlob, { deep: false })

// ─── Derived values ──────────────────────────────────────────────────────────
const gridFull = computed(() => grid.value.every((t) => t !== 0))
export const emptySlots = computed(() => grid.value.reduce((n, t) => n + (t === 0 ? 1 : 0), 0))

// ─── Persistence helpers ─────────────────────────────────────────────────────
const persistGrid = () => setState(GRID_KEY, grid.value)

// ─── Gold ────────────────────────────────────────────────────────────────────
const { coins: gold } = useEpicConfig()
export { gold }

// ─── Grid ops ────────────────────────────────────────────────────────────────
const randomEmptyIndex = (): number => {
  const empties: number[] = []
  for (let i = 0; i < grid.value.length; i++) if (grid.value[i] === 0) empties.push(i)
  if (empties.length === 0) return -1
  return empties[Math.floor(Math.random() * empties.length)]!
}

const setSlot = (idx: number, tier: number): void => {
  const next = grid.value.slice()
  next[idx] = tier
  grid.value = next
}

export const canSpawn = computed(() => !gridFull.value)
/** True while the rewarded instant-spawn buff is running (1 tap = 1 spawn). */
export const instantSpawnActive = computed(() => instantSpawnRemainingMs.value > 0)
/** Taps needed per recruit right now (1 during the FTUE — the tap-meter
 *  friction only starts once the player has internalised the loop). */
export const clicksRequired = computed(() =>
  instantSpawnActive.value || isTutorialOneTap.value ? 1 : CLICKS_PER_SPAWN)

/** The last recruit that stepped out of a tunnel: the slot it landed in plus a
 *  nonce, so two spawns into the same slot each re-trigger the walk. The grid
 *  view watches this to play the emerge animation (the unit crawls out of the
 *  tile's crystal tunnel, tiny, and grows as it reaches the entrance). Purely
 *  cosmetic — the unit is in `grid` the instant it spawns, so it is draggable
 *  and mergeable from frame one. */
export const spawnEvent = ref<{ idx: number; nonce: number } | null>(null)
let spawnNonce = 0
const noteSpawn = (idx: number): void => {
  if (idx >= 0) spawnEvent.value = { idx, nonce: ++spawnNonce }
}

/** Spawn a recruit into a random empty slot (free — the cost is the tap
 *  metering in `tapSpawn`). The tier comes from the Recruits battle upgrade
 *  (T1 baseline, up to T16 maxed). Returns the slot index or -1. */
export const spawnIngredient = (): number => {
  if (gridFull.value) return -1
  const idx = randomEmptyIndex()
  if (idx < 0) return -1
  const t = recruitTier.value
  setSlot(idx, t)
  bumpMaxTier(t)
  bumpStat('spawns')
  persistGrid()
  noteSpawn(idx)
  notifyTutorial('spawn')
  return idx
}

/** Drop a unit of an arbitrary tier into a random empty slot — reward path
 *  for milestone chests / flying chest / campaign tiers (not the tap economy).
 *  Returns the slot index or -1 when the grid is full. */
export const spawnUnitAt = (tier: number): number => {
  // No gameplay cap (the callers decide the tier — see `chestUnitTier`); 999 is
  // the same junk bound the army restore uses.
  const t = Math.max(1, Math.min(999, Math.floor(tier)))
  const idx = randomEmptyIndex()
  if (idx < 0) return -1
  setSlot(idx, t)
  bumpMaxTier(t)
  persistGrid()
  noteSpawn(idx)
  return idx
}

export interface TapSpawnResult {
  /** Slot the recruit landed in, or -1 when this tap only advanced the meter. */
  idx: number
  /** Taps accumulated toward the next spawn after this one. */
  progress: number
  required: number
  /** Grid was full — nothing advanced. */
  full: boolean
}

/** One press of the Spawn button. Advances the tap meter and spawns when it
 *  fills (`clicksRequired` taps — 1 while the instant-spawn buff runs). */
export const tapSpawn = (): TapSpawnResult => {
  const required = clicksRequired.value
  if (gridFull.value) return { idx: -1, progress: spawnClicks.value, required, full: true }
  if (spawnClicks.value + 1 >= required) {
    spawnClicks.value = 0
    const idx = spawnIngredient()
    return { idx, progress: 0, required, full: idx < 0 }
  }
  spawnClicks.value += 1
  return { idx: -1, progress: spawnClicks.value, required, full: false }
}

/** Grant the rewarded instant-spawn buff: 1-tap spawns for the next 2 minutes.
 *  Persisted so a reload mid-buff keeps the remaining time. */
export const activateInstantSpawn = (): void => {
  instantSpawnUntil.value = Date.now() + INSTANT_SPAWN_MS
  instantSpawnRemainingMs.value = INSTANT_SPAWN_MS
  spawnClicks.value = 0
  setState(PRISM_INSTANT_SPAWN_KEY, instantSpawnUntil.value)
}

/** Merge `from` onto `to` if both hold the same tier. Returns the resulting
 *  tier (`from` is emptied, `to` is promoted) or 0 if the merge is illegal. */
export const merge = (from: number, to: number): number => {
  if (from === to) return 0
  const a = grid.value[from]
  const b = grid.value[to]
  if (!a || !b || a !== b) return 0
  // No tier cap — merging always climbs a level (art/stats clamp/extrapolate
  // past the authored tiers until more are added).
  const tier = a + 1
  // Decided before the watermark moves — see `noteFieldMerge`.
  const discovered = tier > maxTier.value
  const next = grid.value.slice()
  next[to] = tier
  next[from] = 0
  grid.value = next
  bumpMaxTier(tier)
  bumpStat('merges')
  persistGrid()
  if (discovered) {
    // A tier the player has never had: the new unit gets its moment.
    announceNewTier(tier, { kind: 'grid', idx: to })
  } else if (revealTargets({ kind: 'grid', idx: from }) || revealTargets({ kind: 'grid', idx: to })) {
    // The revealed unit was merged into something else: it no longer exists.
    endReveal()
  }
  notifyTutorial('merge')
  return tier
}

/** Move a unit to an empty slot (drag rearrange QoL). Returns true if moved. */
export const moveSlot = (from: number, to: number): boolean => {
  if (from === to) return false
  if (!grid.value[from] || grid.value[to]) return false
  const next = grid.value.slice()
  next[to] = next[from]!
  next[from] = 0
  grid.value = next
  persistGrid()
  // A freshly revealed unit dragged to another slot keeps its spotlight.
  retargetReveal({ kind: 'grid', idx: from }, { kind: 'grid', idx: to })
  return true
}

/** Pull a unit out of the grid (when it's deployed into the arena). */
export const takeFromGrid = (idx: number): number => {
  const t = grid.value[idx]
  if (!t) return 0
  setSlot(idx, 0)
  persistGrid()
  return t
}

// ─── Automation imp ──────────────────────────────────────────────────────────
const findMergePair = (): [number, number] | null => {
  const byTier = new Map<number, number>()
  // Prefer merging the HIGHEST tier pair available (fastest ladder climb).
  let best: [number, number] | null = null
  let bestTier = -1
  for (let i = 0; i < grid.value.length; i++) {
    const t = grid.value[i]
    if (t === undefined || t === 0) continue
    if (byTier.has(t)) {
      if (t > bestTier) { best = [byTier.get(t)!, i]; bestTier = t }
    } else {
      byTier.set(t, i)
    }
  }
  return best
}

/** One imp step: merge the best pair on the board. Returns a hint of what it
 *  did so the view can mirror VFX/SFX (`null` ⇒ no pair, imp idles).
 *
 *  The imp MERGES ONLY — it deliberately never deploys. It used to march the
 *  highest-tier unit into the arena whenever the army had room, which fought
 *  the player for control of the board: anyone saving up to merge toward a
 *  bigger unit had their best tile shipped off to the front before they could
 *  pair it. Deploying is the player's call now; the imp just does the tedious
 *  half of the loop. */
export type AutoAction =
  | { type: 'merge'; from: number; to: number; tier: number }
  | null
const autoStep = (): AutoAction => {
  const pair = findMergePair()
  if (pair) {
    const tier = merge(pair[0], pair[1])
    if (tier) return { type: 'merge', from: pair[0], to: pair[1], tier }
  }
  return null
}
/** The view subscribes to this to animate imp actions. */
export const autoAction = ref<{ nonce: number; action: AutoAction } | null>(null)
let autoNonce = 0

// ─── Engine loop ─────────────────────────────────────────────────────────────
/** Engine loop interval. A deep-level imp can outpace it (several merges per tick). */
const ENGINE_TICK_MS = 120
let engineTimer: ReturnType<typeof setInterval> | null = null
let engineRefs = 0

const tick = (): void => {
  const now = Date.now()

  // Instant-spawn buff countdown (UI reads the ref; 0 ⇔ expired). Wall-clock
  // by design, like the 2× damage buff — it keeps draining across a pause, so
  // this stays OUTSIDE the gate to keep the UI chip honest.
  const remaining = Math.max(0, instantSpawnUntil.value - now)
  if (remaining !== instantSpawnRemainingMs.value) instantSpawnRemainingMs.value = remaining

  // Automation imp (cadence owned by the battle upgrade). This is real
  // gameplay — it merges and deploys units on the board — so it must halt
  // behind the universal pause gate exactly like the battle RAF driver does.
  // Without this the imp kept playing the game underneath ads and menus, which
  // also made CrazyGames' `gameplayStop()` a lie. `lastAutoAt` is left stale
  // while paused, so the imp takes its next action right after the resume.
  if (isGamePaused.value) return
  const cadence = impCadenceMs.value
  if (cadence <= 0) return
  // Beats are counted from the last beat, not from the tick that ran it: deep
  // Imp levels (see `impCadenceMs`) run cadences at and under ENGINE_TICK_MS,
  // and stamping `now` would round a 130 ms cadence up to 240 ms. A backlog
  // (a pause, a hitch) is never banked, though — at most one beat is owed, so
  // the imp still acts right after a resume and then keeps its normal pace.
  if (now - lastAutoAt > cadence + ENGINE_TICK_MS) lastAutoAt = now - cadence
  for (let beats = 0; now - lastAutoAt >= cadence && beats < GRID_SIZE; beats++) {
    lastAutoAt += cadence
    const action = autoStep()
    if (!action) {
      // Nothing to merge: idle one full cadence from here.
      lastAutoAt = now
      break
    }
    autoAction.value = { nonce: ++autoNonce, action }
  }
}

export const startEngine = (): void => {
  engineRefs++
  if (engineTimer == null) {
    lastAutoAt = Date.now()
    engineTimer = setInterval(tick, ENGINE_TICK_MS)
  }
}
export const stopEngine = (): void => {
  engineRefs = Math.max(0, engineRefs - 1)
  if (engineRefs === 0 && engineTimer != null) {
    clearInterval(engineTimer)
    engineTimer = null
  }
}

// ─── Public composable surface ───────────────────────────────────────────────
const usePrismGame = () => ({
  // state
  grid, maxTier, gold, spawnClicks, recruitTier,
  // derived
  canSpawn, clicksRequired, instantSpawnActive, instantSpawnRemainingMs, emptySlots,
  // actions
  tapSpawn, activateInstantSpawn, spawnIngredient, spawnUnitAt, merge, moveSlot, takeFromGrid, bumpMaxTier, noteFieldMerge,
  // events
  autoAction, spawnEvent,
  // lifecycle
  startEngine, stopEngine
})

export default usePrismGame

// ⚠️ DEV-ONLY: fill the merge board for promo capture (window.__fillGrid()).
// Dead-code-eliminated from platform builds (`import.meta.env.DEV` false).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>
  w.__fillGrid = (): void => {
    // A rich, "mid-run" spread — varied tiers with adjacent mergeable pairs so
    // the board reads full and colourful (not a fresh empty grid).
    const spread = [4, 6, 6, 3, 8, 5, 2, 7, 5, 9, 4, 4, 7, 3, 6, 8]
    const next = grid.value.slice()
    for (let i = 0; i < next.length; i++) next[i] = spread[i % spread.length]!
    grid.value = next
    const top = Math.max(...next)
    if (top > maxTier.value) maxTier.value = top
    persistGrid()
  }
  // One pulse of merge activity: merge every available pair (pop VFX + tiles
  // upgrade), then refill the freed slots with fresh low-tier pairs so the board
  // keeps churning — this is the "merging process" shown live in the trailer.
  w.__mergePulse = (): void => {
    // Gentle churn: one merge + a couple of fresh units per beat, so the board
    // reads as steady "merging in progress" rather than flickering wildly.
    const p = findMergePair(); if (p) merge(p[0], p[1])
    for (let k = 0; k < 2; k++) spawnUnitAt(2 + Math.floor(Math.random() * 5))
  }
  // Self-running promo driver: merges churn, ultimates fire, waves top up — all
  // on page timers — so a plain rapid screenshot loop captures continuous
  // motion (real gameplay), no per-frame poking needed. `__autoShow(false)` stops.
  w.__autoShow = (on = true): void => {
    const g = w as Record<string, ReturnType<typeof setInterval> | undefined> & Record<string, unknown>
    for (const key of ['__miMerge', '__miUlt', '__miSwarm']) {
      if (g[key]) clearInterval(g[key] as ReturnType<typeof setInterval>)
      g[key] = undefined
    }
    if (!on) return
    g.__miMerge = setInterval(() => (g.__mergePulse as (() => void) | undefined)?.(), 620)
    g.__miUlt = setInterval(() => (g.__ult as (() => void) | undefined)?.(), 3200)
    g.__miSwarm = setInterval(() => (g.__swarm as (() => void) | undefined)?.(), 1600)
  }
}
