<script setup lang="ts">
/**
 * The boss chest — the payoff of a boss fight and the CHECKPOINT moment.
 *
 * Ad-before-result rule (CONTRACT §8): "2×" runs the rewarded ad FIRST and only
 * then shows the doubled payout; "Collect" pays 1× at once. The modal keeps its
 * own copy of the offer so the doubled-payout screen can stay up after the
 * state layer has already settled (and cleared) the chest.
 */
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconMovie from '@/components/icons/IconMovie.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useBarrage from '@/barrage/state/useBarrage'
import type { BossChestOffer } from '@/barrage/state/contract'
import useReward, { formatCost } from '@/use/useReward'
import useSounds from '@/use/useSound'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import { emitConfetti } from '@/use/usePrismParticles'
import { bossSrc, chestSrc } from '@/barrage/art'
import { fmtCoins } from '@/components/barrage/barrageUi'

const props = defineProps<{ coinTarget: HTMLElement | null }>()

const { t } = useI18n()
const barrage = useBarrage()
const { buffsCostCoins, REWARD_COIN_COST } = useReward()
const { playSound } = useSounds()

const offer = ref<BossChestOffer | null>(null)
const stage = ref<'offer' | 'payout'>('offer')
const granted = ref(0)
const busy = ref(false)
const coinsEl = ref<HTMLElement | null>(null)

watch(() => barrage.bossChest.value, (next) => {
  if (!next) return
  offer.value = { ...next }
  stage.value = 'offer'
  granted.value = 0
  void nextTick(() => {
    playSound(next.first ? 'celebration-3' : 'celebration-2', 0.06)
    const r = coinsEl.value?.getBoundingClientRect()
    if (r) emitConfetti(r.left + r.width / 2, r.top + r.height / 2, next.first ? 60 : 30, next.first ? 1.6 : 1.2)
  })
}, { immediate: true })

const liveDouble = computed(() => !!offer.value && !!barrage.bossChest.value?.doubleAvailable)
const bossName = computed(() => offer.value ? t(`barrage.bosses.${offer.value.bossKind}`) : '')

const flyAndClose = (amount: number): void => {
  const src = coinsEl.value
  if (src && props.coinTarget && amount > 0) {
    spawnCoinExplosion({ sourceEl: src, targetEl: props.coinTarget, count: Math.min(40, 14 + Math.round(Math.log10(amount + 1) * 6)) })
  }
  // Let the burst leave the chest before the modal pops away.
  window.setTimeout(() => { offer.value = null }, 260)
}

const onCollect = async (): Promise<void> => {
  if (busy.value || !offer.value) return
  if (stage.value === 'payout') { flyAndClose(granted.value); return }
  busy.value = true
  try {
    const coins = await barrage.claimBossChest(false)
    flyAndClose(coins || (offer.value?.bounty ?? 0))
  } finally {
    busy.value = false
  }
}

const onDouble = async (): Promise<void> => {
  if (busy.value || !offer.value) return
  busy.value = true
  try {
    const coins = await barrage.claimBossChest(true)
    if (coins > 0) {
      granted.value = coins
      stage.value = 'payout'
      playSound('reward-continue', 0.07)
      await nextTick()
      const r = coinsEl.value?.getBoundingClientRect()
      if (r) emitConfetti(r.left + r.width / 2, r.top + r.height / 2, 40, 1.4)
    } else if (!barrage.bossChest.value) {
      // Settled without a payout — nothing left to show.
      offer.value = null
    }
    // Otherwise the ad did not fill and the offer still stands: stay put.
  } finally {
    busy.value = false
  }
}

const doubleAria = computed(() => buffsCostCoins
  ? t('barrage.chest.doubleCoinAria', { cost: formatCost(REWARD_COIN_COST) })
  : t('barrage.chest.doubleAdAria'))
</script>

<template lang="pug">
  FModal(
    :model-value="!!offer"
    :title="offer && offer.first ? t('barrage.chest.titleFirst') : t('barrage.chest.title')"
    :is-closable="false"
  )
    div.chest.flex.flex-col.items-center.gap-2.px-2.pb-2(v-if="offer")
      //- Boss portrait over its chest.
      div.chest-art.relative
        img.chest-art__boss(:src="bossSrc(offer.bossKind)" alt="" draggable="false")
        img.chest-art__chest(:src="chestSrc()" alt="" draggable="false")
      p.game-text.font-black.text-white.text-center(class="text-base sm:text-lg") {{ t('barrage.chest.defeated', { name: bossName }) }}

      //- The bounty (or the doubled payout, after the ad).
      div.chest-coins.flex.items-center.gap-2.rounded-2xl.px-4.py-2(ref="coinsEl" :class="{ 'is-doubled': stage === 'payout' }")
        IconCoin.w-8.h-8
        span.game-text.font-black.tabular-nums(class="text-2xl sm:text-3xl") {{ t('barrage.chest.amount', { n: fmtCoins(stage === 'payout' ? granted : offer.bounty) }) }}
      span.chest-doubled.game-text.font-black.uppercase(v-if="stage === 'payout'") {{ t('barrage.chest.doubled') }}

      p.chest-checkpoint.game-text.text-center(v-if="barrage.mode.value !== 'daily'" class="text-xs sm:text-sm") {{ t('barrage.chest.checkpoint', { n: offer.row }) }}

      div.flex.flex-wrap.justify-center.gap-2.mt-1.w-full
        button.chest-btn.chest-btn--double(
          v-if="stage === 'offer' && liveDouble"
          type="button"
          :disabled="busy"
          :aria-label="doubleAria"
          @click="onDouble"
        )
          template(v-if="buffsCostCoins")
            IconCoin.w-5.h-5
            span.game-text.font-black(class="text-sm") {{ formatCost(REWARD_COIN_COST) }}
          IconMovie.w-7.h-7(v-else)
          span.game-text.font-black.uppercase {{ t('barrage.chest.double') }}
        button.chest-btn.chest-btn--collect(
          type="button"
          :disabled="busy"
          @click="onCollect"
        )
          span.game-text.font-black.uppercase {{ t('barrage.chest.collect') }}
</template>

<style scoped lang="sass">
.chest-art
  width: 132px
  height: 112px
.chest-art__boss
  position: absolute
  left: 50%
  top: 0
  width: 96px
  height: 96px
  translate: -50% 0
  object-fit: contain
  filter: grayscale(0.5) brightness(0.8) drop-shadow(0 4px 4px rgba(0, 0, 0, 0.6))
.chest-art__chest
  position: absolute
  left: 50%
  bottom: 0
  width: 70px
  height: 70px
  translate: -50% 0
  object-fit: contain
  animation: chest-bob 1s ease-in-out infinite alternate
  filter: drop-shadow(0 0 12px rgba(255, 210, 60, 0.8))
@keyframes chest-bob
  from
    transform: translateY(0) rotate(-3deg)
  to
    transform: translateY(-5px) rotate(3deg)
.chest-coins
  color: #ffe27a
  background: rgba(0, 0, 0, 0.35)
  box-shadow: inset 0 0 0 2px rgba(255, 210, 58, 0.6)
  text-shadow: 2px 2px 0 #000
  &.is-doubled
    animation: doubled-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)
    box-shadow: inset 0 0 0 2px rgba(120, 255, 160, 0.9), 0 0 18px rgba(120, 255, 160, 0.5)
@keyframes doubled-pop
  from
    transform: scale(0.6)
  to
    transform: scale(1)
.chest-doubled
  color: #8dffa6
  font-size: 14px
  text-shadow: 1px 1px 0 #000
.chest-checkpoint
  color: #8dffa6
  text-shadow: 1px 1px 0 #000
.chest-btn
  display: flex
  align-items: center
  justify-content: center
  gap: 6px
  min-width: 128px
  min-height: 48px
  padding: 6px 16px
  border-radius: 14px
  border: 2px solid #0f1a30
  color: #fff
  font-size: 16px
  cursor: pointer
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.55)
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.3), 0 4px 0 var(--plate)
  touch-action: manipulation
  transition: transform 0.08s ease
  &:active
    transform: translateY(2px)
  &:disabled
    filter: grayscale(0.6) brightness(0.8)
    cursor: wait
.chest-btn--double
  --plate: #1c6b2a
  background: linear-gradient(180deg, #4fd16a, #27a03f)
  animation: double-glow 1.1s ease-in-out infinite alternate
.chest-btn--collect
  --plate: #7a5a12
  background: linear-gradient(180deg, #ffcd00, #f7a000)
@keyframes double-glow
  from
    filter: drop-shadow(0 0 0 rgba(120, 255, 150, 0))
  to
    filter: drop-shadow(0 0 10px rgba(120, 255, 150, 0.85))
@media (prefers-reduced-motion: reduce)
  .chest-art__chest, .chest-btn--double, .chest-coins.is-doubled
    animation: none
</style>
