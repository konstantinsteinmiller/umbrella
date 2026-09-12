import { ref, computed, watch, type Ref } from 'vue'
import useEpicConfig from '@/use/useEpicConfig'
import { saveDataVersion, flushSaveNow } from '@/use/useSaveStatus'
import { getState, setState } from '@/use/useEpicState'
import { BATTLE_BEST_WAVE_KEY, PRISM_MAX_TIER_KEY } from '@/keys'

/**
 * "War Campaign" — the free-track battle pass (retention-roadmap #18).
 * 30 reward tiers, 100 XP per tier. Campaign XP ticks off the battler's
 * existing `bumpStat` calls in `useBattle` (kills / merges / field merges /
 * wave clears / boss kills — see `CAMPAIGN_XP_SOURCES`), so every subsystem
 * feeds the pass without extra instrumentation.
 *
 * Tier rewards: gold on a ramp that also scales with the player's best wave
 * (so late claims never feel stale), and a free unit every 5th tier drawn from
 * the player's own codex (see `bpUnitTier`), so it is never a relic. The 5s
 * used to hand out an Instant Spawn buff instead — two minutes of faster
 * tapping reads as nothing next to the tier that follows it, so those slots now
 * pay in units too, one rank below the 10s. Unclaimed tiers stay claimable
 * until tapped. The 30-day season resets from its first XP tick (no server
 * needed). State persists inside the consolidated `merge-idle-war_state` blob.
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

/** The authored unit ladder — tiers 4 / 5 / 6 at stages 10 / 20 / 30. Still the
 *  floor for a young player, for whom a T4 gift is a real leg up. The 5s never
 *  had an authored unit (they paid a buff), so they carry no floor: their
 *  reward is purely "one rank below the 10s". */
const bpAuthoredUnitTier = (stage: number): number =>
  stage % 10 === 0 ? Math.min(9, 3 + stage / 10) : 1

/** How far below the codex watermark a unit-bearing stage pays out: the
 *  player's outright highest unit at the final tier of the pass, his
 *  second-highest at the other 10s, his third-best on the 5s. */
const bpUnitRank = (stage: number): number =>
  (stage >= BP_TOTAL_STAGES ? 0 : stage % 10 === 0 ? 1 : 2)

/** The free unit a unit-bearing tier hands over.
 *
 *  The authored ladder alone made this reward a relic: a player deep enough to
 *  be finishing the pass merges past T6 long before stage 10, so the "free
 *  high-tier unit" arrived as junk they would have to merge four times over to
 *  even use. It tracks the player's OWN codex high-water mark
 *  (`prism_max_tier`, the same number the Unit Codex reads) instead — see
 *  `bpUnitRank` for which rank each stage pays. The authored ladder stays as a
 *  floor on the 10s, so an early player still gets the leg up it was written
 *  for.
 *
 *  Read out of the save blob rather than imported from `usePrismGame`: that
 *  module pulls in `useBattle`, which imports THIS one — the import would
 *  close a cycle. `getState` reads the reactive blob, so a card rendered from
 *  this is live and re-renders the moment the watermark moves (which is what
 *  makes an open modal show the right unit). */
export const bpUnitTier = (stage: number): number => {
  const best = Math.max(1, Math.floor(Number(getState(PRISM_MAX_TIER_KEY, 1))) || 1)
  return Math.max(1, bpAuthoredUnitTier(stage), best - bpUnitRank(stage))
}

/** Full reward descriptor for a tier: gold always, plus a free unit from the
 *  player's own codex every 5th tier. The claim UI lands the unit. */
export const bpReward = (stage: number): CampaignReward => {
  const coins = bpCoinReward(stage)
  if (stage % 5 === 0) return { coins, unitTier: bpUnitTier(stage) }
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
