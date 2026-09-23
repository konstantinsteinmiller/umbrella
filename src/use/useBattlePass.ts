import { ref, computed, watch, type Ref } from 'vue'
import useEpicConfig from '@/use/useEpicConfig'
import { saveDataVersion, flushSaveNow } from '@/use/useSaveStatus'
import { getState, setState } from '@/use/useEpicState'
import { killCoins } from '@/barrage/engine/economy'
import { bestRow, maxBallTier, oweBall } from '@/barrage/state/progress'

/**
 * The free-track battle pass (retention-roadmap #18), re-pointed at Elemental
 * Barrage. 30 reward tiers, 100 XP per tier. XP ticks off the barrage run —
 * `useBarrage` awards `BARRAGE_XP_SOURCES` per kill / merge / row reached /
 * boss — so the pass moves on every turn without extra instrumentation.
 *
 * Tier rewards: coins on a ramp priced in "kills at the player's best row" (so a
 * late claim is never pocket change), and a free BALL every 5th tier drawn from
 * the player's own ball ladder (see `bpBallTier`), dropped into the endless
 * run's tray. Unclaimed tiers stay claimable until tapped. The 30-day season
 * resets from its first XP tick (no server needed). State persists inside the
 * consolidated `elemental-barrage_state` blob.
 */

export const BP_TOTAL_STAGES = 30
export const BP_XP_PER_STAGE = 100
export const BP_SEASON_DAYS = 30

/** XP per barrage event — single source of truth: `useBarrage` applies these
 *  and the pass modal's "how to earn" explainer displays them. A row is a turn
 *  survived; a boss is a checkpoint. */
export const BARRAGE_XP_SOURCES = {
  kill: 1, merge: 2, row: 1, boss: 15
} as const

/** @deprecated Merge Idle War's battler XP table — still read by the legacy
 *  `useBattle` module until it is deleted. Barrage code uses `BARRAGE_XP_SOURCES`. */
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
  /** Tier grants a free ball of this tier (added to the endless run's tray). */
  ballTier?: number
}

/**
 * Coins for a tier: a ramp from 14 to 130 "kills" of the player's best row.
 * Priced in kills rather than flat coins because barrage income grows ~7% a
 * row — a flat ramp would be a windfall at row 5 and pocket change at row 80.
 */
export const bpCoinReward = (stage: number): number => {
  const clamped = Math.max(1, Math.min(BP_TOTAL_STAGES, stage))
  const best = Math.max(1, Math.floor(Number(bestRow.value)) || 1)
  const raw = (10 + clamped * 4) * killCoins(best, 'slime', false)
  return Math.max(5, Math.round(raw / 5) * 5)
}

/** How far below the ball watermark a ball-bearing stage pays out: the player's
 *  outright highest tier at the final tier of the pass, second-highest at the
 *  other 10s, third-best on the 5s. */
const bpBallRank = (stage: number): number =>
  (stage >= BP_TOTAL_STAGES ? 0 : stage % 10 === 0 ? 1 : 2)

/**
 * The free ball a ball-bearing tier hands over — tracked off the player's OWN
 * highest ball tier (`maxBallTier`), so it is never a relic, and never ABOVE it:
 * a gifted ball past the watermark would skip the tier-reveal moment the player
 * is merging towards. Read live, so an open modal re-prices as the tray climbs.
 */
export const bpBallTier = (stage: number): number => {
  const best = Math.max(1, Math.floor(Number(maxBallTier.value)) || 1)
  return Math.max(1, best - bpBallRank(stage))
}

/** Full reward descriptor for a tier: coins always, plus a free ball every 5th
 *  tier. The claim delivers both. */
export const bpReward = (stage: number): CampaignReward => {
  const coins = bpCoinReward(stage)
  if (stage % 5 === 0) return { coins, ballTier: bpBallTier(stage) }
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
/** Grant an arbitrary XP amount (barrage events, a daily-mission claim). Guards NaN. */
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
  // The ball is OWED to the endless run rather than pushed into it here: the
  // pass can be claimed mid-volley or from the daily board, and the debt is
  // saved, so it lands on the next endless turn even across a reload.
  if (reward.ballTier) oweBall(reward.ballTier)
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
