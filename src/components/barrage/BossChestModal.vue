<script setup lang="ts">
/**
 * The boss chest — the payoff of a boss fight and the CHECKPOINT moment.
 *
 * Ad-before-result rule (CONTRACT §8): "▶ 3× ●" runs the rewarded ad FIRST and
 * only then shows the tripled payout; "Collect" pays 1× at once. The modal
 * keeps its own copy of the offer so the payout screen can stay up after the
 * state layer has already settled (and cleared) the chest.
 *
 * The rewarded button says what it multiplies — movie icon, "3×", a coin (a
 * bare "2×" did not) — and wears the ad blue: a rewarded button is never
 * green (Google Play; green also sells the ad as "the good choice").
 *
 * Playtest run 9: three of four testers ended with 249–1,156 coins unspent and
 * a 3-ball tray — the bar's glow and arrows did not turn coins into power. So
 * once the chest has paid, the card offers the ONE glowing chip while one is
 * affordable (or the pending free level): the 'shop' step, a single row — one
 * tap buys one level and the row moves on to the next glowing chip — and
 * "Continue". Endless only; no row when nothing is affordable (the card
 * closes with the coins, as before).
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
import { fmtCoins, noteCoinRain, upgradeValueKey, upgradeValueNumber } from '@/components/barrage/barrageUi'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import useBarrageUpgrades from '@/barrage/state/useBarrageUpgrades'
import type { UpgradeId } from '@/barrage/state/contract'
import { notifyTutorial } from '@/use/useTutorial'
import { emitSparkle } from '@/use/usePrismParticles'

const props = defineProps<{ coinTarget: HTMLElement | null }>()

const { t } = useI18n()
const barrage = useBarrage()
const { buffsCostCoins, REWARD_COIN_COST } = useReward()
const { playSound } = useSounds()

const upgrades = useBarrageUpgrades()

const offer = ref<BossChestOffer | null>(null)
const stage = ref<'offer' | 'payout' | 'shop'>('offer')
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

const liveBoost = computed(() => !!offer.value && !!barrage.bossChest.value?.boostAvailable)
const bossName = computed(() => offer.value ? t(`barrage.bosses.${offer.value.bossKind}`) : '')

// ─── The power-up step (run 9) ───────────────────────────────────────────────
const ACCENT: Record<UpgradeId, string> = {
  damage: '#ff6a2a', capacity: '#5fb0ff', speed: '#36d399', luck: '#7ee05a', bounty: '#ffd23c'
}
const fmtValue = (id: UpgradeId, v: number): string => t(upgradeValueKey(id), { n: upgradeValueNumber(id, v) })
/** The one chip the card offers: the pending free level, else the glowing
 *  chip while it is affordable. Null: nothing to offer (daily, or broke). */
const shopChip = computed(() => {
  if (barrage.mode.value === 'daily') return null
  const free = upgrades.freeId.value
  const id = free ?? upgrades.glowingId.value
  if (!id) return null
  const v = upgrades.list.value.find((x) => x.id === id)
  if (!v || v.maxed || (!free && !v.affordable)) return null
  return { id, free: !!free, cost: v.cost, from: fmtValue(id, v.value), to: v.nextValue === null ? null : fmtValue(id, v.nextValue) }
})
const shopAria = computed(() => {
  const c = shopChip.value
  if (!c) return ''
  const base = { name: t(`barrage.upgrades.${c.id}.name`), desc: t(`barrage.upgrades.${c.id}.desc`) }
  return c.free ? t('barrage.upgrades.ariaFree', base) : t('barrage.upgrades.aria', { ...base, cost: fmtCoins(c.cost) })
})
const shopEl = ref<HTMLElement | null>(null)
const onPowerUp = (): void => {
  const c = shopChip.value
  if (!c || busy.value) return
  if (c.free) upgrades.claimFree()
  else if (!upgrades.buy(c.id)) return
  playSound('upgrade-buy', 0.06, 1.1)
  notifyTutorial({ kind: 'upgrade' })
  const r = shopEl.value?.getBoundingClientRect()
  if (r) emitSparkle(r.left + r.width / 2, r.top + r.height / 2, ACCENT[c.id], 14)
}
const close = (): void => { offer.value = null }

const flyAndClose = (amount: number): void => {
  const src = coinsEl.value
  if (src && props.coinTarget && amount > 0) {
    spawnCoinExplosion({ sourceEl: src, targetEl: props.coinTarget, count: Math.min(40, 14 + Math.round(Math.log10(amount + 1) * 6)) })
    // The upgrade funnel waits the rain out (it outlives the modal).
    noteCoinRain()
  }
  // Run 9: coins that buy power stay on the card one step longer.
  if (shopChip.value) {
    stage.value = 'shop'
    return
  }
  // Let the burst leave the chest before the modal pops away.
  window.setTimeout(close, 260)
}

const onCollect = async (): Promise<void> => {
  if (busy.value || !offer.value) return
  if (stage.value === 'shop') { close(); return }
  if (stage.value === 'payout') { flyAndClose(granted.value); return }
  busy.value = true
  try {
    const coins = await barrage.claimBossChest(false)
    flyAndClose(coins || (offer.value?.bounty ?? 0))
  } finally {
    busy.value = false
  }
}

const onBoost = async (): Promise<void> => {
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

const boostMult = computed(() => offer.value?.boostMult ?? 3)
const boostAria = computed(() => buffsCostCoins
  ? t('barrage.chest.boostCoinAria', { n: boostMult.value, cost: formatCost(REWARD_COIN_COST) })
  : t('barrage.chest.boostAdAria', { n: boostMult.value }))
</script>

<template lang="pug">
  FModal(
    :model-value="!!offer"
    :title="offer && offer.first ? t('barrage.chest.titleFirst') : t('barrage.chest.title')"
    :is-closable="false"
  )
    div.chest.hud-digits.flex.flex-col.items-center.gap-2.px-2.pb-2(v-if="offer")
      //- Boss portrait over its chest.
      div.chest-art.relative
        img.chest-art__boss(:src="bossSrc(offer.bossKind)" alt="" draggable="false")
        img.chest-art__chest(:src="chestSrc()" alt="" draggable="false")
      p.game-text.font-black.text-white.text-center(class="text-base sm:text-lg") {{ t('barrage.chest.defeated', { name: bossName }) }}

      //- The bounty (or the boosted payout, after the ad).
      div.chest-coins.flex.items-center.gap-2.rounded-2xl.px-4.py-2(ref="coinsEl" :class="{ 'is-boosted': stage === 'payout' }")
        IconCoin.w-8.h-8
        span.game-text.font-black.tabular-nums(class="text-2xl sm:text-3xl") {{ t('barrage.chest.amount', { n: fmtCoins(stage === 'offer' ? offer.bounty : granted || offer.bounty) }) }}
      span.chest-boosted.game-text.font-black.uppercase(v-if="stage === 'payout' || (stage === 'shop' && granted > offer.bounty)") {{ t('barrage.chest.boosted', { n: boostMult }) }}

      p.chest-checkpoint.game-text.text-center(v-if="barrage.mode.value !== 'daily'" class="text-xs sm:text-sm") {{ t('barrage.chest.checkpoint', { n: offer.row }) }}

      //- Run 9: the coins just paid, and what they buy — one glowing chip.
      div.chest-shop.flex.flex-col.items-center.gap-1.w-full(v-if="stage === 'shop' && shopChip" ref="shopEl")
        span.chest-shop__title.game-text.font-black.uppercase {{ t('barrage.chest.powerUp') }}
        button.chest-shop__buy(
          type="button"
          :aria-label="shopAria"
          :style="{ '--accent': ACCENT[shopChip.id] }"
          @click="onPowerUp"
        )
          span.chest-shop__glyph(:style="{ color: ACCENT[shopChip.id] }")
            BarrageGlyph.w-full.h-full(:name="shopChip.id")
          span.flex.flex-col.items-start.flex-1.min-w-0
            span.chest-shop__name.game-text.font-black.uppercase.truncate {{ t(`barrage.upgrades.${shopChip.id}.short`) }}
            span.chest-shop__value.game-text.font-black.whitespace-nowrap
              template(v-if="shopChip.to") {{ t('barrage.upgrades.arrow', { from: shopChip.from, to: shopChip.to }) }}
              template(v-else) {{ shopChip.from }}
          span.chest-shop__price.flex.items-center.gap-1.shrink-0
            template(v-if="shopChip.free")
              span.chest-shop__free.game-text.font-black.uppercase {{ t('barrage.upgrades.free') }}
            template(v-else)
              IconCoin.w-5.h-5
              span.game-text.font-black.tabular-nums {{ fmtCoins(shopChip.cost) }}

      div.flex.flex-wrap.justify-center.gap-2.mt-1.w-full
        //- "▶ 3× ●" — the ad (or its coin price), the multiplier, and what it
        //- multiplies: the coins.
        button.chest-btn.chest-btn--boost(
          v-if="stage === 'offer' && liveBoost"
          type="button"
          :disabled="busy"
          :aria-label="boostAria"
          @click="onBoost"
        )
          span.chest-btn__price.flex.items-center.gap-1(v-if="buffsCostCoins")
            IconCoin.w-5.h-5
            span.game-text.font-black(class="text-sm") {{ formatCost(REWARD_COIN_COST) }}
          IconMovie.w-8.h-8.shrink-0(v-else)
          span.chest-btn__mult.game-text.font-black.tabular-nums {{ t('barrage.chest.boost', { n: boostMult }) }}
          IconCoin.w-8.h-8.shrink-0
        button.chest-btn.chest-btn--collect(
          type="button"
          :disabled="busy"
          @click="onCollect"
        )
          span.game-text.font-black.uppercase {{ stage === 'shop' ? t('continue') : t('barrage.chest.collect') }}
</template>

<style scoped lang="sass">
// Run 9: the power-up step — one chip, the bar's look (gold rim, its accent).
.chest-shop__title
  color: #ffe27a
  font-size: 13px
  letter-spacing: 0.06em
  text-shadow: 1px 1px 0 #000
.chest-shop__buy
  display: flex
  align-items: center
  gap: 10px
  width: 100%
  max-width: 300px
  min-height: 56px
  padding: 6px 12px 6px 8px
  border-radius: 14px
  color: #fff
  background: linear-gradient(#2a2030, #140e1c)
  border: 2px solid #ffd23c
  box-shadow: 0 0 14px rgba(255, 210, 60, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.08)
  cursor: pointer
  animation: chest-shop-glow 1.4s ease-in-out infinite alternate
  &:active
    transform: scale(0.97)
.chest-shop__glyph
  flex: none
  width: 34px
  height: 34px
.chest-shop__name
  font-size: 15px
  line-height: 1.1
  text-shadow: 1px 1px 0 #000
.chest-shop__value
  font-size: 13px
  color: #ffe9b0
  text-shadow: 1px 1px 0 #000
.chest-shop__price
  font-size: 16px
  color: #ffe27a
  text-shadow: 1px 1px 0 #000
.chest-shop__free
  color: #8dffa6
@keyframes chest-shop-glow
  from
    box-shadow: 0 0 8px rgba(255, 210, 60, 0.4), inset 0 0 0 1px rgba(255, 255, 255, 0.08)
  to
    box-shadow: 0 0 18px rgba(255, 210, 60, 0.8), inset 0 0 0 1px rgba(255, 255, 255, 0.08)
@media (prefers-reduced-motion: reduce)
  .chest-shop__buy
    animation: none
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
  &.is-boosted
    animation: boosted-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)
    box-shadow: inset 0 0 0 2px rgba(120, 255, 160, 0.9), 0 0 18px rgba(120, 255, 160, 0.5)
@keyframes boosted-pop
  from
    transform: scale(0.6)
  to
    transform: scale(1)
.chest-boosted
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
// The ad blue (components.sass `--ad-*`): a rewarded button is never green.
.chest-btn--boost
  --plate: var(--ad-plate)
  background: linear-gradient(180deg, var(--ad-top), var(--ad-bottom))
  animation: boost-glow 1.1s ease-in-out infinite alternate
.chest-btn__mult
  font-size: 22px
  line-height: 1
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6)
.chest-btn__price
  padding-right: 4px
  margin-right: 2px
  border-right: 1px solid rgba(255, 255, 255, 0.35)
.chest-btn--collect
  --plate: #7a5a12
  background: linear-gradient(180deg, #ffcd00, #f7a000)
@keyframes boost-glow
  from
    filter: drop-shadow(0 0 0 transparent)
  to
    filter: drop-shadow(0 0 10px var(--ad-glow))
@media (prefers-reduced-motion: reduce)
  .chest-art__chest, .chest-btn--boost, .chest-coins.is-boosted
    animation: none
</style>
