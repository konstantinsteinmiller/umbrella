<script setup lang="ts">
/**
 * "3× COIN INCOME" rewarded offer — the payload of every 2nd flying chest
 * (see `FlyingChest.vue` for the cadence and the eligibility roll).
 *
 * Modelled on the RALLY! revive offer in `BattleArena.vue`: a short-fuse
 * rewarded prompt the player can take or ignore, auto-declining when the timer
 * runs out. Differences that were asked for:
 *
 *   • ~6s fuse (Rally's is 5) — long enough to read, short enough to stay a
 *     "grab it now" impulse.
 *   • RAINBOW button instead of Rally's emerald, animated so it pulls the eye
 *     to the middle of the arena.
 *   • A label that states the deal in plain terms — the multiplier, what it
 *     applies to, and how long it lasts — rather than a bare "Watch ad".
 *
 * Readiness-gated by the caller (`rewardAvailable`), so this never renders a
 * button that can't fill. Emits `claim` on tap and `decline` on skip/timeout;
 * the parent owns the ad call and the buff grant.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import useReward, { formatCost } from '@/use/useReward'
import { COIN_BUFF_MULT, COIN_BUFF_MS } from '@/use/useBattle'
import { isCompactHud } from '@/use/useUser'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconMovie from '@/components/icons/IconMovie.vue'

const props = defineProps<{
  /** Disable the button while the ad request is in flight. */
  busy?: boolean
}>()

const emit = defineEmits<{
  (e: 'claim'): void
  (e: 'decline'): void
}>()

const { t } = useI18n()
const { buffsCostCoins, REWARD_COIN_COST } = useReward()

/** Fuse length. The requirement asks for ~6 seconds. */
const OFFER_SECS = 6

const secondsLeft = ref(OFFER_SECS)
let ticker = 0

/** Buff length in whole minutes, for the label — derived from the single
 *  source of truth in `useBattle` so the copy can't drift from the mechanic. */
const buffMinutes = computed(() => Math.round(COIN_BUFF_MS / 60_000))

onMounted(() => {
  ticker = window.setInterval(() => {
    secondsLeft.value -= 1
    // Auto-decline on expiry: an un-taken offer must not linger over the arena.
    if (secondsLeft.value <= 0) emit('decline')
  }, 1000)
})
onUnmounted(() => window.clearInterval(ticker))
</script>

<template lang="pug">
  div.coin-offer.absolute.inset-0.flex.flex-col.items-center.justify-center.pointer-events-none(
    class="z-[1235]"
    :class="isCompactHud ? 'gap-0.5' : 'gap-1'"
  )
    //- Headline — states the reward before the button does.
    span.coin-offer__title.game-text.font-black.uppercase.text-center(
      :class="isCompactHud ? 'text-lg' : 'text-2xl sm:text-3xl'"
    ) {{ t('battle.coinBuff.offerTitle', { mult: COIN_BUFF_MULT }) }}

    //- The rainbow CTA.
    button.coin-offer__btn.pointer-events-auto.cursor-pointer.relative.rounded-xl.flex.items-center(
      class="active:scale-95 transition-transform disabled:opacity-50"
      :class="isCompactHud ? 'gap-1.5 px-3 py-1.5' : 'gap-2 px-5 py-2.5'"
      :disabled="props.busy"
      @click="emit('claim')"
    )
      //- Coin mode shows the price; ad mode the movie glyph.
      template(v-if="buffsCostCoins")
        IconCoin(class="shrink-0 text-yellow-100" :class="isCompactHud ? 'w-5 h-5' : 'w-7 h-7'")
        span.coin-offer__price.game-text.font-black.text-white.tabular-nums(
          :class="isCompactHud ? 'text-xs' : 'text-base'"
        ) {{ formatCost(REWARD_COIN_COST) }}
      IconMovie(v-else class="shrink-0 text-white" :class="isCompactHud ? 'w-5 h-5' : 'w-7 h-7'")

      div.flex.flex-col.items-start.leading-none
        span.coin-offer__label.game-text.font-black.uppercase.text-white(
          :class="isCompactHud ? 'text-sm' : 'text-lg sm:text-xl'"
        ) {{ t('battle.coinBuff.label', { mult: COIN_BUFF_MULT }) }}
        span.coin-offer__sub.game-text.font-black.text-white(
          :class="isCompactHud ? 'text-[9px]' : 'text-xs sm:text-sm'"
        ) {{ t('battle.coinBuff.duration', { m: buffMinutes }) }}

    //- Fuse + skip.
    div.flex.items-center(:class="isCompactHud ? 'gap-2' : 'gap-3'")
      span.coin-offer__fuse.game-text.font-black.text-white.tabular-nums(
        :class="isCompactHud ? 'text-[10px]' : 'text-sm'"
      ) {{ t('battle.coinBuff.expiresIn', { n: Math.max(0, secondsLeft) }) }}
      button.pointer-events-auto.cursor-pointer.game-text(
        class="text-white/60"
        :class="isCompactHud ? 'text-[10px]' : 'text-xs'"
        @click="emit('decline')"
      ) {{ t('secondChance.skip') }}
</template>

<style scoped lang="sass">
.coin-offer
  // Light scrim so the arena reads as "on hold" without hiding the fight.
  background: radial-gradient(circle at 50% 50%, rgba(6, 10, 20, 0.72) 0%, rgba(6, 10, 20, 0.35) 70%, transparent 100%)

.coin-offer__title
  color: #fff7d6
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 0 16px rgba(255, 205, 0, 0.8)
  animation: coin-offer-bob 1.1s ease-in-out infinite

// ─── The rainbow button ──────────────────────────────────────────────────────
// A sweeping conic-gradient border with a dark inner face, so the label stays
// legible while the frame itself cycles through the spectrum. The `::before`
// carries the animated gradient and is clipped by the button's radius; the
// `::after` is the inner face the content sits on.
.coin-offer__btn
  border: none
  background: transparent
  isolation: isolate
  filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.45))

  &::before
    content: ''
    position: absolute
    inset: 0
    border-radius: inherit
    background: conic-gradient(from 0deg, #ff3b3b, #ff9f1c, #ffe600, #38f56b, #2ad4ff, #7b5cff, #ff4bd8, #ff3b3b)
    animation: coin-offer-spin 2.4s linear infinite
    z-index: -2

  &::after
    content: ''
    position: absolute
    inset: 3px
    border-radius: inherit
    background: linear-gradient(180deg, rgba(18, 12, 40, 0.94) 0%, rgba(8, 6, 20, 0.96) 100%)
    z-index: -1

.coin-offer__label
  text-shadow: 2px 2px 0 #000, 0 0 10px rgba(255, 255, 255, 0.5)
  letter-spacing: 0.02em

.coin-offer__sub
  color: #ffe600
  text-shadow: 1px 1px 0 #000

.coin-offer__price
  text-shadow: 1px 1px 0 #000

.coin-offer__fuse
  text-shadow: 1px 1px 0 #000

@keyframes coin-offer-spin
  0%
    transform: rotate(0deg)
  100%
    transform: rotate(360deg)

@keyframes coin-offer-bob
  0%, 100%
    transform: translateY(0) scale(1)
  50%
    transform: translateY(-2px) scale(1.03)

// The spinning frame is decorative; the offer still reads without it.
@media (prefers-reduced-motion: reduce)
  .coin-offer__title,
  .coin-offer__btn::before
    animation: none
  .coin-offer__btn::before
    background: linear-gradient(90deg, #ff3b3b, #ffe600, #38f56b, #2ad4ff, #7b5cff, #ff4bd8)
</style>
