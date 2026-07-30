<script setup lang="ts">
/**
 * Flying chest reward (retention-roadmap #1B). Every 2 minutes a winged
 * chest drifts across the arena left → right (~7 s). Tapping it opens it:
 * 50/50 it pays gold (150 + 75·wave, scaling with progress) or drops a copy of
 * the SECOND-best fighter on the field into the merge grid (fallback: a tier-2
 * unit when fewer than two fighters stand; fallback gold when the grid is full).
 * Untapped chests fly
 * off and the timer restarts — a soft "watch the battlefield" pull.
 *
 * Mounted inside the BattleArena root (absolute overlay). The countdown only
 * ticks while the game is unpaused, so ads/modals never eat a chest.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import usePrismGame from '@/use/usePrismGame'
import useBattle from '@/use/useBattle'
import useEpicConfig from '@/use/useEpicConfig'
import useSounds from '@/use/useSound'
import { isGamePaused } from '@/use/useGamePause'
import { artSrc } from '@/use/useArtOverrides'
import { prependBaseUrl } from '@/utils/function'
import { emitConfetti, emitSparkle } from '@/use/usePrismParticles'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import { getState, setState } from '@/use/useEpicState'
import { BATTLE_CHEST_OPENS_KEY } from '@/keys'
import useReward, { REWARD_COIN_COST } from '@/use/useReward'
import CoinBuffOffer from '@/components/atoms/CoinBuffOffer.vue'
import { flyingChestRequests } from '@/use/useFlyingChestCue'

const props = defineProps<{
  /** Wallet badge element — gold payouts fly coins into it. */
  coinTarget?: HTMLElement | null
}>()

const CHEST_INTERVAL_MS = 110_000
const CHEST_FLIGHT_MS = 7_000
// Gold payout scales with progress so the chest stays relevant late-game:
// 150 base + 75 per wave reached.
const CHEST_GOLD_BASE = 150
const CHEST_GOLD_PER_WAVE = 75
const chestGold = (): number => CHEST_GOLD_BASE + battle.wave.value * CHEST_GOLD_PER_WAVE

const game = usePrismGame()
const battle = useBattle()
const { addCoins } = useEpicConfig()
const { rewardAvailable, redeem } = useReward()
const { playSound } = useSounds()

const active = ref(false)
/** Vertical flight lane, % of arena height (kept in the upper air band). */
const laneY = ref(20)
const chestRef = ref<HTMLElement | null>(null)

const chestArt = computed(() =>
  artSrc('flying-chest') ?? prependBaseUrl('images/icons/chest_128x128.webp'))

let remainingMs = CHEST_INTERVAL_MS
let ticker = 0
let flightTimer = 0

const launch = (): void => {
  laneY.value = 12 + Math.random() * 30
  active.value = true
  playSound('chest-flyby', 0.03)
  // Missed → it flies off; either way the cycle restarts.
  window.clearTimeout(flightTimer)
  flightTimer = window.setTimeout(() => { active.value = false }, CHEST_FLIGHT_MS)
}

const tick = (): void => {
  if (isGamePaused.value || active.value) return
  remainingMs -= 1000
  if (remainingMs <= 0) {
    remainingMs = CHEST_INTERVAL_MS
    launch()
  }
}

/** Tier of the chest's unit reward: the Recruits-scaled tier (so it keeps up in
 *  late game — T11 at maxed Recruits), but never below the field's 2nd-best so a
 *  strong army still gets a strong drop. Tier 2 floor when the field is empty. */
const rewardTier = (): number => {
  const tiers = battle.fighters.value.map((f) => f.tier).sort((a, b) => b - a)
  const secondBest = tiers.length >= 2 ? tiers[1]! : 2
  return Math.max(battle.chestUnitTier.value, secondBest)
}

// ─── 3× Coin-income offer (every 2nd chest) ─────────────────────────────────
//
// Cadence: every COIN_OFFER_EVERY_NTH chest opened rolls COIN_OFFER_CHANCE for
// a rewarded "3× coin income" offer INSTEAD of the normal gold/unit payout.
// Three gates, all deliberate:
//
//   • Only while NO coin buff is running — stacking the same buff on itself
//     would just overwrite the timer and waste the player's video.
//   • Only when a rewarded ad can actually fill (`rewardAvailable`, which is
//     always true in coin-purchase mode) — never a dead button.
//   • The open counter is PERSISTED, so a reload can't reset the parity and
//     turn "every 2nd" into "every chest".
//
// A failed roll (or any closed gate) falls through to the normal chest reward,
// so a chest is never a dud.
const COIN_OFFER_EVERY_NTH = 2
const COIN_OFFER_CHANCE = 0.75

const chestOpens = ref(Number(getState(BATTLE_CHEST_OPENS_KEY, 0)) || 0)
/** True while the rainbow offer is on screen. */
const coinOfferShown = ref(false)
/** True while the rewarded ad / coin spend is in flight (disables the button). */
const coinOfferBusy = ref(false)
/** Pointer position of the chest tap, so a declined offer can still pay out
 *  its coin explosion from where the chest was. */
let openAt = { x: 0, y: 0 }

const coinOfferEligible = (): boolean =>
  !battle.isCoinBuffActive.value
  && rewardAvailable.value
  && chestOpens.value % COIN_OFFER_EVERY_NTH === 0
  && Math.random() < COIN_OFFER_CHANCE

/** Take the offer: play the rewarded ad (or spend coins) and grant the buff.
 *  A no-fill / cancelled ad falls back to the normal chest reward, so the tap
 *  is never wasted. */
const onCoinOfferClaim = async (): Promise<void> => {
  if (coinOfferBusy.value) return
  coinOfferBusy.value = true
  try {
    const granted = await redeem(REWARD_COIN_COST)
    coinOfferShown.value = false
    if (granted) {
      battle.activateCoinBuff()
      playSound('milestone-chest', 0.06)
      emitConfetti(openAt.x, openAt.y, 26, 1.6)
    } else {
      // Ad didn't play / coins missing — pay the ordinary chest instead.
      payNormalReward(openAt.x, openAt.y)
    }
  } finally {
    coinOfferBusy.value = false
  }
}

/** Skip or let the 6s fuse burn out — the chest still pays its normal reward. */
const onCoinOfferDecline = (): void => {
  if (coinOfferBusy.value || !coinOfferShown.value) return
  coinOfferShown.value = false
  payNormalReward(openAt.x, openAt.y)
}

const onOpen = (e: PointerEvent): void => {
  if (!active.value) return
  active.value = false
  window.clearTimeout(flightTimer)
  playSound('chest-open', 0.05)

  openAt = { x: e.clientX, y: e.clientY }
  chestOpens.value += 1
  setState(BATTLE_CHEST_OPENS_KEY, chestOpens.value)
  if (coinOfferEligible()) {
    coinOfferShown.value = true
    return
  }
  payNormalReward(e.clientX, e.clientY)
}

/** The ordinary chest payout: 50/50 a free unit or a pile of gold. Extracted
 *  from `onOpen` so the coin-offer decline / no-fill paths can reuse it. */
const payNormalReward = (clientX: number, clientY: number): void => {
  // The two outcomes must be visually DISTINCT — a generic gold-tinted
  // particle shower on the unit branch reads as a coin burst that never
  // paid out. Unit drop: white sparkle at the chest + spawn-pop feedback at
  // the landing grid slot. Gold: the coin explosion into the wallet.
  const wantsUnit = Math.random() < 0.5
  if (wantsUnit) {
    const idx = game.spawnUnitAt(rewardTier())
    if (idx >= 0) {
      playSound('unit-spawn', 0.04, 1.1)
      emitSparkle(clientX, clientY, '#ffffff', 10)
      const slot = document.querySelector<HTMLElement>(`[data-slot="${idx}"]`)
      const r = slot?.getBoundingClientRect()
      if (r) emitSparkle(r.left + r.width / 2, r.top + r.height / 2, '#ffffff', 12)
      return
    }
  }
  // Gold branch (also the fallback when the grid is full).
  emitConfetti(clientX, clientY, 18, 1.2)
  addCoins(chestGold())
  if (props.coinTarget && chestRef.value) {
    spawnCoinExplosion({ sourceEl: chestRef.value, targetEl: props.coinTarget, count: 12 })
  }
}

// Cheat / QA cue (`ctrl+shift+alt+c`): launch immediately and restart the cycle,
// ignoring the request if a chest is already in flight.
watch(flyingChestRequests, () => {
  if (active.value) return
  remainingMs = CHEST_INTERVAL_MS
  launch()
})

onMounted(() => { ticker = window.setInterval(tick, 1000) })
onUnmounted(() => {
  window.clearInterval(ticker)
  window.clearTimeout(flightTimer)
})
</script>

<template lang="pug">
  div.absolute.inset-0.pointer-events-none.overflow-hidden(class="z-[1155]")
    button.chest-fly.absolute.pointer-events-auto.cursor-pointer(
      v-if="active"
      ref="chestRef"
      :style="{ top: laneY + '%', animationDuration: CHEST_FLIGHT_MS + 'ms' }"
      @pointerdown.stop.prevent="onOpen"
    )
      div.chest-bob
        img.chest-img(:src="chestArt" alt="" draggable="false")

    //- The rainbow 3× coin-income offer this chest rolled (every 2nd chest,
    //- 75%). Auto-declines after its 6s fuse; declining still pays the ordinary
    //- chest reward, so opening a chest is never a dud.
    CoinBuffOffer(
      v-if="coinOfferShown"
      :busy="coinOfferBusy"
      @claim="onCoinOfferClaim"
      @decline="onCoinOfferDecline"
    )
</template>

<style scoped lang="sass">
.chest-fly
  left: -12%
  width: clamp(68px, 24cqmin, 112px)
  height: clamp(68px, 24cqmin, 112px)
  animation-name: chest-cross
  animation-timing-function: linear
  animation-fill-mode: forwards

@keyframes chest-cross
  from
    transform: translateX(0)
  to
    transform: translateX(115cqw)

.chest-bob
  width: 100%
  height: 100%
  animation: chest-bob 0.9s ease-in-out infinite alternate

@keyframes chest-bob
  from
    transform: translateY(-8%) rotate(-4deg)
  to
    transform: translateY(8%) rotate(4deg)

.chest-img
  width: 100%
  height: 100%
  object-fit: contain
  filter: drop-shadow(0 0 8px rgba(255, 205, 0, 0.75)) drop-shadow(0 3px 4px rgba(0, 0, 0, 0.4))
</style>
