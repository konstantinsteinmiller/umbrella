/**
 * usePrismGame — the core state machine for Merge Alchemy Lab.
 *
 * Owns the merge grid, the cauldron, the brewing resolution, the Cosmic Gold
 * economy, the four lab upgrades (heat / pressure / containment / automation),
 * the discovery index, and the collection-page milestones. Everything that must
 * survive a reload is mirrored into the single `prism_state` blob via
 * `useEpicState`; transient combat buffs live in memory only.
 *
 * Module-level singleton (same pattern as `useEpicConfig`) so every component
 * shares one authoritative game instance. The view drives the simulation by
 * calling `startEngine()` / `stopEngine()` around its lifecycle; pointer
 * components call `merge()`, `addToCauldron()`, `spawnIngredient()`, etc. and
 * read the reactive event refs (`brewOutcome`, `pageComplete`) to fire VFX/SFX.
 */

import { ref, computed, watch, type Ref } from 'vue'
import { saveDataVersion } from '@/use/useSaveStatus'
import { getState, setState, prismState, flushPersist } from '@/use/useEpicState'
import useEpicConfig from '@/use/useEpicConfig'
import {
  GRID_KEY, PRISM_UPGRADES_KEY, PRISM_INDEX_KEY, PRISM_STATS_KEY,
  PRISM_PAGE_REWARDS_KEY, PRISM_MAX_TIER_KEY, PRISM_DISCOUNT_KEY, PRISM_ONBOARDED_KEY
} from '@/keys'
import { MAX_INGREDIENT_TIER } from '@/game/ingredients'
import {
  RECIPES, PAGES, matchRecipe, recipesForPage, type Recipe, type RecipeEffect
} from '@/game/recipes'

// ─── Tunables ────────────────────────────────────────────────────────────────
export const GRID_COLS = 4
export const GRID_ROWS = 4
export const GRID_SIZE = GRID_COLS * GRID_ROWS
export const CAULDRON_CAPACITY = 3
const SPAWN_MAX = 5
const SPAWN_REGEN_MS = 4200
const SPAWN_GOLD_COST = 12
const UPGRADE_MAX_LEVEL = 25

export type UpgradeId = 'heat' | 'pressure' | 'containment' | 'automation'

interface UpgradeDef {
  id: UpgradeId
  base: number
  growth: number
}
export const UPGRADE_DEFS: Record<UpgradeId, UpgradeDef> = {
  heat: { id: 'heat', base: 45, growth: 1.5 },
  pressure: { id: 'pressure', base: 80, growth: 1.58 },
  containment: { id: 'containment', base: 70, growth: 1.56 },
  automation: { id: 'automation', base: 130, growth: 1.72 }
}

export type Upgrades = Record<UpgradeId, number>

export type BrewKind = 'standard' | 'legendary' | 'sub' | 'sludge'
export interface BrewOutcome {
  nonce: number
  kind: BrewKind
  recipe: Recipe | null
  gold: number
  crit: boolean
  isNew: boolean
  tiers: number[]
}

interface TimedBuff { mult: number; until: number }

// ─── Persisted reactive state (mirrors of prism_state fields) ────────────────
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

const sanitizeUpgrades = (u: unknown): Upgrades => {
  const o = (u && typeof u === 'object') ? u as Record<string, unknown> : {}
  const clamp = (n: unknown) => {
    const v = Math.floor(Number(n))
    return Number.isFinite(v) ? Math.max(0, Math.min(UPGRADE_MAX_LEVEL, v)) : 0
  }
  return {
    heat: clamp(o.heat), pressure: clamp(o.pressure),
    containment: clamp(o.containment), automation: clamp(o.automation)
  }
}

const grid: Ref<number[]> = ref(sanitizeGrid(readJSON(GRID_KEY, [])))
const upgrades: Ref<Upgrades> = ref(sanitizeUpgrades(readJSON(PRISM_UPGRADES_KEY, {})))
const discovered: Ref<string[]> = ref(readJSON<string[]>(PRISM_INDEX_KEY, []))
const claimedPages: Ref<string[]> = ref(readJSON<string[]>(PRISM_PAGE_REWARDS_KEY, []))
const maxTier: Ref<number> = ref(Number(readJSON(PRISM_MAX_TIER_KEY, 1)) || 1)
const upgradeDiscountPct: Ref<number> = ref(Number(readJSON(PRISM_DISCOUNT_KEY, 0)) || 0)
const onboarded: Ref<boolean> = ref(readJSON<boolean>(PRISM_ONBOARDED_KEY, false))

export interface PrismStats {
  brews: number; merges: number; legendaries: number
  sludge: number; spawns: number
}
const defaultStats = (): PrismStats => ({ brews: 0, merges: 0, legendaries: 0, sludge: 0, spawns: 0 })
const stats: Ref<PrismStats> = ref({ ...defaultStats(), ...readJSON<Partial<PrismStats>>(PRISM_STATS_KEY, {}) })

// ─── Transient (in-memory) state ─────────────────────────────────────────────
const cauldron: Ref<number[]> = ref([])
const brewing = ref(false)
const brewProgress = ref(0)
const spawnCharges = ref(SPAWN_MAX)
export const buffs = ref<{ goldMult: TimedBuff | null; spawnSpeed: TimedBuff | null; autoBoost: TimedBuff | null }>({
  goldMult: null, spawnSpeed: null, autoBoost: null
})
export const brewOutcome = ref<BrewOutcome | null>(null)
export const pageComplete = ref<{ nonce: number; pageId: string } | null>(null)
let outcomeNonce = 0
let pageNonce = 0

let brewStartAt = 0
let brewDuration = 0
let lastSpawnRegenAt = Date.now()
let lastAutoAt = Date.now()

// Re-hydrate the persisted refs when the cloud sync writes back into the blob.
const refreshFromBlob = (): void => {
  grid.value = sanitizeGrid(readJSON(GRID_KEY, grid.value))
  upgrades.value = sanitizeUpgrades(readJSON(PRISM_UPGRADES_KEY, upgrades.value))
  discovered.value = readJSON<string[]>(PRISM_INDEX_KEY, discovered.value)
  claimedPages.value = readJSON<string[]>(PRISM_PAGE_REWARDS_KEY, claimedPages.value)
  maxTier.value = Number(readJSON(PRISM_MAX_TIER_KEY, maxTier.value)) || 1
  upgradeDiscountPct.value = Number(readJSON(PRISM_DISCOUNT_KEY, upgradeDiscountPct.value)) || 0
  onboarded.value = readJSON<boolean>(PRISM_ONBOARDED_KEY, onboarded.value)
  stats.value = { ...defaultStats(), ...readJSON<Partial<PrismStats>>(PRISM_STATS_KEY, stats.value) }
}
watch(saveDataVersion, refreshFromBlob)
watch(prismState, refreshFromBlob, { deep: false })

// ─── Derived values ──────────────────────────────────────────────────────────
/** GDD §6.1: synthesis time = 1.2s / (1 + heatLevel × 0.15). */
export const synthesisMs = computed(() => 1200 / (1 + upgrades.value.heat * 0.15))
/** GDD §6.2: pressure raises the double-yield chance. */
export const doubleYieldChance = computed(() => Math.min(0.6, upgrades.value.pressure * 0.05))
/** GDD §6.3: containment turns failed combos into semi-stable sub-potions. */
export const subPotionChance = computed(() => Math.min(0.92, upgrades.value.containment * 0.11))
/** Automation imp cadence in ms (0 ⇒ disabled). */
export const automationMs = computed(() => {
  const lvl = upgrades.value.automation
  if (lvl <= 0) return 0
  const boost = activeBuffMult('autoBoost')
  return Math.max(700, 4200 / (1 + lvl * 0.22) / boost)
})

/** Permanent gold multiplier from completed collection pages. */
export const pageGoldMult = computed(() => {
  let m = 1
  for (const id of claimedPages.value) {
    const p = PAGES.find((x) => x.id === id)
    if (p && p.reward.type === 'goldMult') m *= p.reward.value
  }
  return m
})
/** Base spawn tier — rises with completed cosmic-style pages (GDD §5.1). */
export const baseSpawnTier = computed(() => {
  let t = 1
  for (const id of claimedPages.value) {
    const p = PAGES.find((x) => x.id === id)
    if (p && p.reward.type === 'baseTier') t += p.reward.value
  }
  return Math.min(t, 4)
})
export const goldMultTotal = computed(() => pageGoldMult.value * activeBuffMult('goldMult'))

export const discoveredCount = computed(() => discovered.value.length)
export const isDiscovered = (id: string): boolean => discovered.value.includes(id)
export const pageProgress = (pageId: string): { done: number; total: number } => {
  const list = recipesForPage(pageId)
  const done = list.filter((r) => discovered.value.includes(r.id)).length
  return { done, total: list.length }
}

const gridFull = computed(() => grid.value.every((t) => t !== 0))
export const emptySlots = computed(() => grid.value.reduce((n, t) => n + (t === 0 ? 1 : 0), 0))

// ─── Buff helpers ────────────────────────────────────────────────────────────
function activeBuffMult(kind: 'goldMult' | 'spawnSpeed' | 'autoBoost'): number {
  const b = buffs.value[kind]
  if (b && b.until > Date.now()) return b.mult
  return 1
}
export const activeBuffs = computed(() => {
  const now = Date.now()
  const out: { kind: string; mult: number; remaining: number }[] = []
  for (const k of ['goldMult', 'spawnSpeed', 'autoBoost'] as const) {
    const b = buffs.value[k]
    if (b && b.until > now) out.push({ kind: k, mult: b.mult, remaining: b.until - now })
  }
  return out
})

// ─── Persistence helpers ─────────────────────────────────────────────────────
const persistGrid = () => setState(GRID_KEY, grid.value)
const persistStats = () => setState(PRISM_STATS_KEY, stats.value)

// ─── Gold ────────────────────────────────────────────────────────────────────
const { coins: gold, addCoins, spendCoins } = useEpicConfig()
export { gold }
/** Award gold AFTER the active/permanent multipliers — single choke point. */
const earnGold = (base: number): number => {
  const total = Math.round(base * goldMultTotal.value)
  if (total > 0) addCoins(total)
  return total
}

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
export const spawnCostGold = computed(() => spawnCharges.value > 0 ? 0 : SPAWN_GOLD_COST)

/** Spawn a base-tier ingredient into a random empty slot. Uses a free charge
 *  when available, otherwise costs gold. Returns the slot index or -1. */
export const spawnIngredient = (): number => {
  if (gridFull.value) return -1
  if (spawnCharges.value <= 0) {
    if (!spendCoins(SPAWN_GOLD_COST)) return -1
  } else {
    spawnCharges.value -= 1
    if (spawnCharges.value === SPAWN_MAX - 1) lastSpawnRegenAt = Date.now()
  }
  const idx = randomEmptyIndex()
  if (idx < 0) return -1
  setSlot(idx, baseSpawnTier.value)
  stats.value = { ...stats.value, spawns: stats.value.spawns + 1 }
  persistGrid(); persistStats()
  return idx
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
  stats.value = { ...stats.value, merges: stats.value.merges + 1 }
  persistGrid(); persistStats()
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

/** Pull a unit out of the grid (when it's injected into a lane). */
export const takeFromGrid = (idx: number): number => {
  const t = grid.value[idx]
  if (!t) return 0
  setSlot(idx, 0)
  persistGrid()
  return t
}

/** Atomically move a grid unit into the cauldron (capacity/brew checked up
 *  front so a slot is never emptied if the cauldron can't accept it). The slide
 *  animation that follows in the view is purely cosmetic. Returns the tier
 *  committed, or 0 if rejected. */
export const injectFromGrid = (idx: number): number => {
  const t = grid.value[idx]
  if (!t) return 0
  if (brewing.value || cauldron.value.length >= CAULDRON_CAPACITY) return 0
  setSlot(idx, 0)
  persistGrid()
  cauldron.value = [...cauldron.value, t]
  if (cauldron.value.length >= CAULDRON_CAPACITY) startBrew()
  return t
}

// ─── Cauldron + brewing ──────────────────────────────────────────────────────
export const cauldronTiers = computed(() => cauldron.value)
export const cauldronFull = computed(() => cauldron.value.length >= CAULDRON_CAPACITY)
export const isBrewing = computed(() => brewing.value)
export const brewFraction = computed(() => brewProgress.value)

/** Commit an ingredient into the cauldron (called after the lane slide lands).
 *  Triggers the boil/brew once capacity is reached. Returns false if rejected
 *  (already brewing or full). */
export const addToCauldron = (tier: number): boolean => {
  if (brewing.value || cauldron.value.length >= CAULDRON_CAPACITY || tier < 1) return false
  cauldron.value = [...cauldron.value, tier]
  if (cauldron.value.length >= CAULDRON_CAPACITY) startBrew()
  return true
}

const startBrew = (): void => {
  brewing.value = true
  brewProgress.value = 0
  brewStartAt = Date.now()
  brewDuration = synthesisMs.value
}

const applyEffect = (effect: RecipeEffect): void => {
  const now = Date.now()
  switch (effect.kind) {
    case 'goldBurst':
      addCoins(effect.gold)
      break
    case 'goldMult':
      buffs.value = { ...buffs.value, goldMult: { mult: effect.mult, until: now + effect.durationMs } }
      break
    case 'spawnSpeed':
      buffs.value = { ...buffs.value, spawnSpeed: { mult: effect.mult, until: now + effect.durationMs } }
      break
    case 'autoBoost':
      buffs.value = { ...buffs.value, autoBoost: { mult: effect.mult, until: now + effect.durationMs } }
      break
    case 'cheaperUpgrades':
      upgradeDiscountPct.value = Math.min(60, upgradeDiscountPct.value + effect.pct)
      setState(PRISM_DISCOUNT_KEY, upgradeDiscountPct.value)
      break
  }
}

const discover = (recipe: Recipe): boolean => {
  if (discovered.value.includes(recipe.id)) return false
  discovered.value = [...discovered.value, recipe.id]
  setState(PRISM_INDEX_KEY, discovered.value)
  // Page-completion milestone check.
  const list = recipesForPage(recipe.page)
  if (list.every((r) => discovered.value.includes(r.id)) && !claimedPages.value.includes(recipe.page)) {
    claimedPages.value = [...claimedPages.value, recipe.page]
    setState(PRISM_PAGE_REWARDS_KEY, claimedPages.value)
    pageComplete.value = { nonce: ++pageNonce, pageId: recipe.page }
  }
  return true
}

const resolveBrew = (): void => {
  const tiers = cauldron.value.slice()
  cauldron.value = []
  brewing.value = false
  brewProgress.value = 0

  const recipe = matchRecipe(tiers)
  let kind: BrewKind
  let gainGold = 0
  let crit = false
  let isNew = false

  if (recipe) {
    kind = recipe.rarity === 'legendary' ? 'legendary' : 'standard'
    crit = Math.random() < doubleYieldChance.value
    gainGold = earnGold(recipe.gold * (crit ? 2 : 1))
    if (recipe.effect) applyEffect(recipe.effect)
    isNew = discover(recipe)
    if (kind === 'legendary') stats.value = { ...stats.value, legendaries: stats.value.legendaries + 1 }
  } else {
    const tierSum = tiers.reduce((a, b) => a + b, 0)
    if (Math.random() < subPotionChance.value) {
      kind = 'sub'
      gainGold = earnGold(Math.round(tierSum * 14))
    } else {
      kind = 'sludge'
      gainGold = earnGold(Math.max(5, Math.round(tierSum * 4)))
      stats.value = { ...stats.value, sludge: stats.value.sludge + 1 }
    }
  }

  stats.value = { ...stats.value, brews: stats.value.brews + 1 }
  if (!onboarded.value) { onboarded.value = true; setState(PRISM_ONBOARDED_KEY, true) }
  persistStats()
  flushPersist() // hard checkpoint: a completed brew is real progress

  brewOutcome.value = { nonce: ++outcomeNonce, kind, recipe: recipe ?? null, gold: gainGold, crit, isNew, tiers }
}

// ─── Upgrades ────────────────────────────────────────────────────────────────
export const upgradeLevel = (id: UpgradeId): number => upgrades.value[id]
export const isUpgradeMaxed = (id: UpgradeId): boolean => upgrades.value[id] >= UPGRADE_MAX_LEVEL
export const upgradeCost = (id: UpgradeId): number => {
  const def = UPGRADE_DEFS[id]
  const raw = def.base * Math.pow(def.growth, upgrades.value[id])
  const discounted = raw * (1 - upgradeDiscountPct.value / 100)
  return Math.max(1, Math.round(discounted))
}
export const canBuyUpgrade = (id: UpgradeId): boolean =>
  !isUpgradeMaxed(id) && gold.value >= upgradeCost(id)
export const buyUpgrade = (id: UpgradeId): boolean => {
  if (isUpgradeMaxed(id)) return false
  const cost = upgradeCost(id)
  if (!spendCoins(cost)) return false
  upgrades.value = { ...upgrades.value, [id]: upgrades.value[id] + 1 }
  setState(PRISM_UPGRADES_KEY, upgrades.value)
  flushPersist()
  return true
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

/** One automation step: merge a pair, else fill the vacant cauldron. Returns a
 *  hint of what it did so the view can play the matching SFX/VFX. */
export type AutoAction = { type: 'merge'; from: number; to: number; tier: number } | { type: 'inject'; idx: number; tier: number } | null
const autoStep = (): AutoAction => {
  if (upgrades.value.automation <= 0) return null
  const pair = findMergePair()
  if (pair) {
    const tier = merge(pair[0], pair[1])
    if (tier) return { type: 'merge', from: pair[0], to: pair[1], tier }
  }
  // Cauldron vacant → inject the highest-tier unit available (GDD §6.4).
  if (!brewing.value && cauldron.value.length < CAULDRON_CAPACITY) {
    let pick = -1, pickTier = -1
    for (let i = 0; i < grid.value.length; i++) {
      const gt = grid.value[i] ?? 0
      if (gt > pickTier) { pickTier = gt; pick = i }
    }
    if (pick >= 0 && pickTier > 0) {
      const tier = takeFromGrid(pick)
      if (tier && addToCauldron(tier)) return { type: 'inject', idx: pick, tier }
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

  // Brew progress + resolution.
  if (brewing.value) {
    brewProgress.value = Math.min(1, (now - brewStartAt) / Math.max(1, brewDuration))
    if (brewProgress.value >= 1) resolveBrew()
  }

  // Free-spawn recharge (faster while a spawnSpeed buff is active).
  if (spawnCharges.value < SPAWN_MAX) {
    const interval = SPAWN_REGEN_MS / activeBuffMult('spawnSpeed')
    if (now - lastSpawnRegenAt >= interval) {
      spawnCharges.value = Math.min(SPAWN_MAX, spawnCharges.value + 1)
      lastSpawnRegenAt = now
    }
  } else {
    lastSpawnRegenAt = now
  }

  // Automation imp.
  const cadence = automationMs.value
  if (cadence > 0 && now - lastAutoAt >= cadence) {
    lastAutoAt = now
    const action = autoStep()
    if (action) autoAction.value = { nonce: ++autoNonce, action }
  }
}

export const startEngine = (): void => {
  engineRefs++
  if (engineTimer == null) {
    lastSpawnRegenAt = Date.now()
    lastAutoAt = Date.now()
    engineTimer = setInterval(tick, 80)
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
  grid, cauldron: cauldronTiers, upgrades, discovered, claimedPages, maxTier, stats,
  gold, spawnCharges, spawnMax: SPAWN_MAX, onboarded,
  // derived
  canSpawn, spawnCostGold, emptySlots, cauldronFull, isBrewing, brewFraction,
  synthesisMs, doubleYieldChance, subPotionChance, automationMs,
  pageGoldMult, baseSpawnTier, goldMultTotal, discoveredCount, activeBuffs,
  // actions
  spawnIngredient, merge, moveSlot, takeFromGrid, addToCauldron, injectFromGrid,
  upgradeLevel, upgradeCost, canBuyUpgrade, buyUpgrade, isUpgradeMaxed,
  isDiscovered, pageProgress,
  // events
  brewOutcome, pageComplete, autoAction,
  // lifecycle
  startEngine, stopEngine
})

export default usePrismGame
