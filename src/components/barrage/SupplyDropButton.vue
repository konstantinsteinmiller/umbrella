<script setup lang="ts">
/**
 * The treasure chest (Survivalist's two-stage gift, `useSupplyDrop`).
 *
 *   filling — the chest sits under a dark veil that drains as the 3 minutes
 *             pass; the countdown hangs under it;
 *   small   — the veil is gone, the chest bobs with a SILVER "+N" (the small
 *             gift) and a thin gold bar that fills toward the big gift: take
 *             it now, or keep playing for more — the bar says so without a
 *             word;
 *   big     — gold glow, gold "+N", a bigger bob.
 *
 * A tap opens whatever is waiting: coins fly to the wallet, a skill charge (big
 * gifts only) gets its own line.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import useSupplyDrop from '@/barrage/state/useSupplyDrop'
import type { SkillId } from '@/barrage/engine/types'
import { chestSrc } from '@/barrage/art'
import HudButton from '@/components/barrage/HudButton.vue'
import useSounds from '@/use/useSound'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import { fmtCoins, fmtCountdown } from '@/components/barrage/barrageUi'

const props = defineProps<{ coinTarget: HTMLElement | null }>()

const { t } = useI18n()
const chest = useSupplyDrop()
const { playSound } = useSounds()

// The chest is only mounted once it has been earned: its first sight fills it
// to the small gift, so the unlock itself can be opened at once.
onMounted(() => chest.arm())

const stage = computed(() => chest.stage.value)
const left = computed(() => fmtCountdown(chest.msLeft.value))
const gift = computed(() => (stage.value === 'big' ? chest.gifts.value.big : chest.gifts.value.small))
const aria = computed(() => {
  if (stage.value === 'cooldown') return t('barrageMeta.supply.readyIn', { time: left.value })
  const open = t('barrage.supply.ready')
  return stage.value === 'small'
    ? `${open} ${t('barrageMeta.supply.biggerIn', { time: left.value, n: fmtCoins(chest.gifts.value.big) })}`
    : open
})
/** The veil over a filling chest (1 → 0 as the first 3 minutes pass). */
const veil = computed(() => (stage.value === 'cooldown' ? 1 - chest.progress.value : 0))

const got = ref<{ id: number; coins: number; skill: SkillId | null } | null>(null)
let gotTimer = 0
let seq = 0

const onClick = (ev: MouseEvent): void => {
  const res = chest.claim()
  if (!res) {
    playSound('upgrade-denied', 0.012)
    return
  }
  const src = ev.currentTarget as HTMLElement | null
  if (src && props.coinTarget && res.coins > 0) {
    spawnCoinExplosion({ sourceEl: src, targetEl: props.coinTarget, count: res.stage === 'big' ? 24 : 12 })
  }
  playSound('chest-open', res.stage === 'big' ? 0.07 : 0.05)
  got.value = { id: ++seq, coins: res.coins, skill: res.skill }
  window.clearTimeout(gotTimer)
  gotTimer = window.setTimeout(() => { got.value = null }, 2200)
}
</script>

<template lang="pug">
  div.chest.relative(:class="'chest--' + stage")
    HudButton(
      :tone="stage === 'big' ? 'gold' : 'teal'"
      :aria-label="aria"
      :pulse="stage === 'big'"
      data-tut="supply"
      @click="onClick"
    )
      span.chest__art.relative.block.w-full.h-full
        img.chest__img(:src="chestSrc()" alt="" draggable="false")
        span.chest__veil.absolute.inset-x-0.bottom-0(v-if="veil > 0" :style="{ height: (veil * 100) + '%' }")
      template(#corner)
        span.chest__pill.game-text.tabular-nums(v-if="stage === 'cooldown'" aria-hidden="true") {{ left }}
        span.chest__pill.chest__pill--gift.game-text(v-else :class="'chest__pill--' + stage" aria-hidden="true")
          | {{ t('barrageMeta.supply.gift', { n: fmtCoins(gift) }) }}
          //- Small gift waiting: how far the big one has come.
          span.chest__bar(v-if="stage === 'small'")
            span.chest__bar-fill(:style="{ width: (chest.progress.value * 100) + '%' }")
    Transition(name="supply-got")
      div.supply__got.absolute.game-text.font-black.pointer-events-none(v-if="got" :key="got.id" aria-live="polite")
        span {{ t('barrageMeta.supply.coins', { n: fmtCoins(got.coins) }) }}
        span.supply__skill(v-if="got.skill") {{ t('barrageMeta.supply.bonusCharge', { skill: t('barrage.skills.' + got.skill + '.name') }) }}
</template>

<style scoped lang="sass">
.chest__art
  overflow: hidden
  border-radius: 8px
.chest__img
  width: 100%
  height: 100%
  object-fit: contain
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5))
// The veil drains from the top down as the chest fills.
.chest__veil
  background: rgba(4, 8, 18, 0.62)
  transition: height 0.9s linear
.chest--small .chest__img
  animation: chest-bob 1s ease-in-out infinite alternate
.chest--big .chest__img
  animation: chest-bob-big 0.7s ease-in-out infinite alternate
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5)) drop-shadow(0 0 6px rgba(255, 190, 40, 0.95))
@keyframes chest-bob
  from
    translate: 0 1px
  to
    translate: 0 -2px
@keyframes chest-bob-big
  from
    translate: 0 1px
    scale: 1
  to
    translate: 0 -3px
    scale: 1.06

.chest__pill
  position: absolute
  left: 50%
  bottom: -7px
  translate: -50% 0
  padding: 0 3px
  border-radius: 6px
  background: rgba(4, 8, 18, 0.9)
  box-shadow: 0 0 0 1px rgba(63, 224, 208, 0.6)
  color: #bff7f0
  font-size: 9px
  line-height: 13px
  white-space: nowrap
  pointer-events: none
.chest__pill--gift
  display: flex
  flex-direction: column
  align-items: stretch
  font-weight: 900
// White outlined type on both (the game font's outline): dark text on a light
// pill smeared into its own outline at 9 px.
.chest__pill--small
  background: linear-gradient(180deg, #b9c6d8, #6f7f97)
  box-shadow: 0 0 0 1px #0f1a30, 0 0 8px rgba(200, 215, 235, 0.8)
  color: #fff
.chest__pill--big
  background: linear-gradient(180deg, #ffcf3a, #d98a00)
  box-shadow: 0 0 0 1px #0f1a30, 0 0 10px rgba(255, 180, 40, 0.95)
  color: #fff
.chest__bar
  display: block
  height: 2px
  margin: 0 0 1px
  border-radius: 2px
  background: rgba(15, 26, 48, 0.55)
  overflow: hidden
.chest__bar-fill
  display: block
  height: 100%
  background: #ffd23a
  transition: width 0.9s linear

.supply__got
  bottom: calc(100% + 6px)
  left: 50%
  translate: -50% 0
  display: flex
  flex-direction: column
  align-items: center
  white-space: nowrap
  padding: 3px 8px
  border-radius: 10px
  background: linear-gradient(180deg, #ffcd00, #f7a000)
  border: 2px solid #0f1a30
  color: #fff
  font-size: 13px
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.55)
  z-index: 40
.supply__skill
  font-size: 10px
.supply-got-enter-active, .supply-got-leave-active
  transition: opacity 0.25s ease, transform 0.25s ease
.supply-got-enter-from, .supply-got-leave-to
  opacity: 0
  transform: translateY(8px)

@media (prefers-reduced-motion: reduce)
  .chest--small .chest__img, .chest--big .chest__img
    animation: none
</style>
