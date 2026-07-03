/**
 * usePrismGame — the merge-grid state machine.
 *
 * Owns the 4×4 merge grid, the tap-to-spawn economy and the automation imp.
 * Everything battle-side (fighters, waves, upgrades, combo, gold from kills)
 * lives in `useBattle`; this module stays the single authority for what sits
 * in the grid. Grid contents and the max-tier watermark survive reloads via
 * the single `merge-idle-war_state` blob (`useEpicState`).
 *
 * Spawning is clicker-style pacing (no gold cost): 4 taps of the Spawn button
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
import { MAX_INGREDIENT_TIER } from '@/game/ingredients'
import { deployFighter, impCadenceMs, armyFull, bumpStat } from '@/use/useBattle'

// ─── Tunables ────────────────────────────────────────────────────────────────
export const GRID_COLS = 4
export const GRID_ROWS = 4
export const GRID_SIZE = GRID_COLS * GRID_ROWS
/** Spawn-button taps required per recruit without the buff. */
const CLICKS_PER_SPAWN = 4
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
    return Number.isFinite(t) && t >= 1 && t <= MAX_INGREDIENT_TIER ? t : 0
  }) : []
  while (arr.length < GRID_SIZE) arr.push(0)
  return arr
}

const grid: Ref<number[]> = ref(sanitizeGrid(readJSON(GRID_KEY, [])))
const maxTier: Ref<number> = ref(Number(readJSON(PRISM_MAX_TIER_KEY, 1)) || 1)
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
/** Taps needed per recruit right now. */
export const clicksRequired = computed(() => instantSpawnActive.value ? 1 : CLICKS_PER_SPAWN)

/** Spawn a tier-1 recruit into a random empty slot (free — the cost is the
 *  tap metering in `tapSpawn`). Returns the slot index or -1. */
export const spawnIngredient = (): number => {
  if (gridFull.value) return -1
  const idx = randomEmptyIndex()
  if (idx < 0) return -1
  setSlot(idx, 1)
  bumpStat('spawns')
  persistGrid()
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
  if (a >= MAX_INGREDIENT_TIER) return 0
  const next = grid.value.slice()
  next[to] = a + 1
  next[from] = 0
  grid.value = next
  if (a + 1 > maxTier.value) { maxTier.value = a + 1; setState(PRISM_MAX_TIER_KEY, maxTier.value) }
  bumpStat('merges')
  persistGrid()
  return a + 1
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
    if (t === undefined || t === 0 || t >= MAX_INGREDIENT_TIER) continue
    if (byTier.has(t)) {
      if (t > bestTier) { best = [byTier.get(t)!, i]; bestTier = t }
    } else {
      byTier.set(t, i)
    }
  }
  return best
}

/** One imp step: merge the best pair, else march the highest-tier unit into
 *  the arena. Returns a hint of what it did so the view can mirror VFX/SFX. */
export type AutoAction =
  | { type: 'merge'; from: number; to: number; tier: number }
  | { type: 'deploy'; idx: number; tier: number }
  | null
const autoStep = (): AutoAction => {
  const pair = findMergePair()
  if (pair) {
    const tier = merge(pair[0], pair[1])
    if (tier) return { type: 'merge', from: pair[0], to: pair[1], tier }
  }
  // Army has room → send the highest-tier unit to the front.
  if (!armyFull.value) {
    let pick = -1, pickTier = 0
    for (let i = 0; i < grid.value.length; i++) {
      const gt = grid.value[i] ?? 0
      if (gt > pickTier) { pickTier = gt; pick = i }
    }
    if (pick >= 0 && pickTier > 0 && deployFighter(pickTier)) {
      setSlot(pick, 0)
      persistGrid()
      return { type: 'deploy', idx: pick, tier: pickTier }
    }
  }
  return null
}
/** The view subscribes to this to animate imp actions. */
export const autoAction = ref<{ nonce: number; action: AutoAction } | null>(null)
let autoNonce = 0

// ─── Engine loop ─────────────────────────────────────────────────────────────
let engineTimer: ReturnType<typeof setInterval> | null = null
let engineRefs = 0

const tick = (): void => {
  const now = Date.now()

  // Instant-spawn buff countdown (UI reads the ref; 0 ⇔ expired).
  const remaining = Math.max(0, instantSpawnUntil.value - now)
  if (remaining !== instantSpawnRemainingMs.value) instantSpawnRemainingMs.value = remaining

  // Automation imp (cadence owned by the battle upgrade).
  const cadence = impCadenceMs.value
  if (cadence > 0 && now - lastAutoAt >= cadence) {
    lastAutoAt = now
    const action = autoStep()
    if (action) autoAction.value = { nonce: ++autoNonce, action }
  }
}

export const startEngine = (): void => {
  engineRefs++
  if (engineTimer == null) {
    lastAutoAt = Date.now()
    engineTimer = setInterval(tick, 120)
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
  grid, maxTier, gold, spawnClicks,
  // derived
  canSpawn, clicksRequired, instantSpawnActive, instantSpawnRemainingMs, emptySlots,
  // actions
  tapSpawn, activateInstantSpawn, spawnIngredient, merge, moveSlot, takeFromGrid,
  // events
  autoAction,
  // lifecycle
  startEngine, stopEngine
})

export default usePrismGame
