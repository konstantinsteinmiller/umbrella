import { computed, ref } from 'vue'
import { buffsCostCoins } from '@/use/useUser'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import useEpicConfig from '@/use/useEpicConfig'
import { getState, setState } from '@/use/useEpicState'
import { FIRST_INSTANT_SPAWN_KEY } from '@/keys'

// ─── Rewarded-placement redemption: rewarded ad OR coin purchase ─────────────
// The whole game is balanced around the rewarded buffs (Instant Spawn, 2×
// Damage) and rewards (Rally, double-boss-bounty, …). On builds with no real
// rewarded ads — the basic launch and the pre-full-release CrazyGames build
// (`buffsCostCoins`) — the same placements are BOUGHT WITH COINS instead, so
// the game stays playable/balanced without an ad network.
//
// Standard reward price; the very first Instant Spawn is discounted so a new
// player can try the buff cheaply before it settles at the full price.
export const REWARD_COIN_COST = 1000
export const FIRST_INSTANT_SPAWN_COIN_COST = 200

// Reactive mirror of the sticky "first Instant Spawn already bought" flag so
// `instantSpawnCost` recomputes the moment it flips (getState alone isn't
// reactive). Seeded from persistence at module load.
const firstInstantSpawnUsed = ref<boolean>(!!getState<boolean>(FIRST_INSTANT_SPAWN_KEY))

export const useReward = () => {
  const { coins, spendCoins } = useEpicConfig()

  /** Coin price of the NEXT Instant Spawn purchase (200 first, then 1000).
   *  Only meaningful in coin mode; in ad mode the buff is ad-gated, not priced. */
  const instantSpawnCost = computed(() =>
    firstInstantSpawnUsed.value ? REWARD_COIN_COST : FIRST_INSTANT_SPAWN_COIN_COST
  )

  /** Whether a placement's button should be shown AT ALL. Coin mode always
   *  shows it (with the price, dimmed when unaffordable); ad mode hides it
   *  unless a rewarded ad can actually fill (readiness gating — never a dead
   *  button). Reactive: reads `isRewardedReady` in the ad branch. */
  const rewardAvailable = computed(() => buffsCostCoins || isRewardedReady.value)

  /** Can the player redeem a reward costing `cost` coins right now? In ad mode
   *  cost is irrelevant — it's just "can a rewarded ad fill". */
  const canRedeem = (cost: number): boolean =>
    buffsCostCoins ? coins.value >= cost : isRewardedReady.value

  /** Redeem a reward: spend `cost` coins (coin mode) or play the rewarded ad
   *  (ad mode). Resolves to whether the reward was actually granted, matching
   *  the `await showRewardedAd()` contract every call site already handles —
   *  an unaffordable coin spend resolves `false`, exactly like an ad no-fill. */
  const redeem = async (cost: number): Promise<boolean> =>
    buffsCostCoins ? spendCoins(cost) : showRewardedAd()

  /** Mark the first-Instant-Spawn discount as consumed (coin mode only). */
  const markInstantSpawnBought = (): void => {
    if (firstInstantSpawnUsed.value) return
    firstInstantSpawnUsed.value = true
    setState(FIRST_INSTANT_SPAWN_KEY, true)
  }

  return {
    buffsCostCoins,
    coins,
    REWARD_COIN_COST,
    instantSpawnCost,
    rewardAvailable,
    canRedeem,
    redeem,
    markInstantSpawnBought
  }
}

export default useReward
