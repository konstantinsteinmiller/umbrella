import { ref, computed, watch, type Ref } from 'vue'
import useEpicConfig from '@/use/useEpicConfig'
import { saveDataVersion, flushSaveNow } from '@/use/useSaveStatus'
import { getState, setState } from '@/use/useEpicState'
import { BATTLE_BEST_WAVE_KEY } from '@/keys'

/**
 * "War Campaign" — the free-track battle pass (retention-roadmap #18).
 * 30 reward tiers, 100 XP per tier. Campaign XP ticks off the battler's
 * existing `bumpStat` calls in `useBattle` (kills / merges / field merges /
 * wave clears / boss kills — see `CAMPAIGN_XP_SOURCES`), so every subsystem
 * feeds the pass without extra instrumentation.
 *
 * Tier rewards: gold on a ramp that also scales with the player's best wave
 * (so late claims never feel stale), an Instant Spawn buff every 5th tier,
 * and a free high-tier unit every 10th. Unclaimed tiers stay claimable until
 * tapped. The 30-day season resets from its first XP tick (no server needed).
 * State persists inside the consolidated `merge-idle-war_state` blob.
 */

export const BP_TOTAL_STAGES = 30
export const BP_XP_PER_STAGE = 100
export const BP_SEASON_DAYS = 30

// Campaign XP per battler event — single source of truth; `useBattle.bumpStat`
// applies these and the modal's "how to earn" explainer displays them.
// BALANCE (2026-07-04): halved from the launch values (kill 1 / merge 2 /
// fieldMerge 4 / wave 15 / boss 30) — the pass was paying out gold too fast,
// with the wave/boss ticks doing most of the inflating. Kill stays at the
// 1-XP floor (fractions would render as "37.5 / 100 XP").
export const CAMPAIGN_XP_SOURCES = {
  kill: 1, merge: 1, fieldMerge: 2, wave: 7, boss: 15
} as const

// Legacy epicrolla-scene XP grants (still referenced by useEpicGame/useMissions).
export const BP_XP_CAMPAIGN_WIN = 50
export const BP_XP_ATTEMPT = 12

const STORAGE_KEY = 'spinner_battle_pass'

interface BattlePassState {
  xp: number
  unlockedStages: number
  claimedStages: number[]
  seasonStartedAt: string | null
}

const defaultState = (): BattlePassState => ({
  xp: 0,
  unlockedStages: 0,
  claimedStages: [],
  seasonStartedAt: null
})

const daysUntilSeasonReset = (startedAt: string | null): number | null => {
  if (!startedAt) return null
  const start = new Date(startedAt).getTime()
  const now = Date.now()
  const elapsed = Math.floor((now - start) / (1000 * 60 * 60 * 24))
  return Math.max(0, BP_SEASON_DAYS - elapsed)
}

const isSeasonExpired = (startedAt: string | null): boolean => {
  if (!startedAt) return false
  return daysUntilSeasonReset(startedAt) === 0
}

const loadState = (): BattlePassState => {
  const parsed = getState<Partial<BattlePassState> | null>(STORAGE_KEY, null)
  if (
    parsed
    && typeof parsed.xp === 'number'
    && typeof parsed.unlockedStages === 'number'
    && Array.isArray(parsed.claimedStages)
  ) {
    const loaded: BattlePassState = {
      xp: parsed.xp,
      unlockedStages: Math.max(0, Math.min(BP_TOTAL_STAGES, parsed.unlockedStages)),
      claimedStages: parsed.claimedStages.filter(
        (n): n is number => typeof n === 'number' && n >= 1 && n <= BP_TOTAL_STAGES
      ),
      seasonStartedAt: parsed.seasonStartedAt ?? null
    }
    if (isSeasonExpired(loaded.seasonStartedAt)) return defaultState()
    return loaded
  }
  return defaultState()
}

const state: Ref<BattlePassState> = ref(loadState())

watch(saveDataVersion, () => {
  state.value = loadState()
})

const saveState = () => {
  setState(STORAGE_KEY, state.value)
}

export interface CampaignReward {
  coins: number
  /** Tier grants a free 2-minute Instant Spawn buff. */
  instantSpawn?: boolean
  /** Tier grants a free unit of this merge tier (dropped onto the grid). */
  unitTier?: number
}

export const bpCoinReward = (stage: number): number => {
  // Gold ramp across the 30 tiers, scaled by best wave so a claim always
  // feels relevant to the player's current economy.
  const clamped = Math.max(1, Math.min(BP_TOTAL_STAGES, stage))
  const bestWave = Math.max(1, Math.floor(Number(getState(BATTLE_BEST_WAVE_KEY, 1))) || 1)
  const raw = (30 + (clamped - 1) * 18) * (1 + (bestWave - 1) * 0.08)
  return Math.round(raw / 5) * 5
}

/** Full reward descriptor for a tier: gold always; a buff every 5th tier; a
 *  free high-tier unit every 10th. The claim UI executes the extras. */
export const bpReward = (stage: number): CampaignReward => {
  const coins = bpCoinReward(stage)
  if (stage % 10 === 0) return { coins, unitTier: Math.min(9, 3 + stage / 10) }
  if (stage % 5 === 0) return { coins, instantSpawn: true }
  return { coins }
}

const { addCoins } = useEpicConfig()

const addXp = (amount: number) => {
  if (amount <= 0) return
  if (isSeasonExpired(state.value.seasonStartedAt)) {
    state.value = defaultState()
    saveState()
  }
  if (state.value.unlockedStages >= BP_TOTAL_STAGES) return
  if (!state.value.seasonStartedAt) {
    state.value.seasonStartedAt = new Date().toISOString().slice(0, 10)
  }
  state.value.xp += amount
  while (
    state.value.xp >= BP_XP_PER_STAGE
    && state.value.unlockedStages < BP_TOTAL_STAGES
    ) {
    state.value.xp -= BP_XP_PER_STAGE
    state.value.unlockedStages += 1
  }
  if (state.value.unlockedStages >= BP_TOTAL_STAGES) state.value.xp = 0
  saveState()
}

const awardCampaignWin = () => addXp(BP_XP_CAMPAIGN_WIN)
const awardAttempt = () => addXp(BP_XP_ATTEMPT)
/** Grant an arbitrary XP amount (e.g. a daily-mission claim). Guards NaN. */
const awardXp = (amount: number) => addXp(Number(amount) || 0)

export interface ClaimResult extends CampaignReward {
  stage: number
}

const claimStage = (stage: number): ClaimResult | null => {
  if (stage < 1 || stage > BP_TOTAL_STAGES) return null
  if (stage > state.value.unlockedStages) return null
  if (state.value.claimedStages.includes(stage)) return null
  const reward = bpReward(stage)
  const coins = reward.coins
  addCoins(coins)
  state.value.claimedStages = [...state.value.claimedStages, stage]
  saveState()
  // Discrete reward claim — flush immediately so the claim (and its coins)
  // survive an instant reload instead of riding the coin throttle.
  void flushSaveNow()
  return { ...reward, stage, coins }
}

const currentXp = computed(() => state.value.xp)
const unlockedStages = computed(() => state.value.unlockedStages)
const claimedStages = computed(() => state.value.claimedStages)
const isMaxed = computed(() => state.value.unlockedStages >= BP_TOTAL_STAGES)

const pendingClaimCount = computed(() => {
  let n = 0
  for (let i = 1; i <= state.value.unlockedStages; i++) {
    if (!state.value.claimedStages.includes(i)) n++
  }
  return n
})

const hasUnclaimedReward = computed(() => pendingClaimCount.value > 0)

const daysUntilReset = computed(() => daysUntilSeasonReset(state.value.seasonStartedAt))

const isStageClaimed = (stage: number): boolean => state.value.claimedStages.includes(stage)
const isStageUnlocked = (stage: number): boolean => stage <= state.value.unlockedStages

export default function useBattlePass() {
  return {
    state,
    currentXp,
    unlockedStages,
    claimedStages,
    isMaxed,
    hasUnclaimedReward,
    pendingClaimCount,
    daysUntilReset,
    isStageClaimed,
    isStageUnlocked,
    bpCoinReward,
    awardCampaignWin,
    awardAttempt,
    awardXp,
    claimStage
  }
}
