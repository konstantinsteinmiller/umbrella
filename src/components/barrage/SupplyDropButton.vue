<script setup lang="ts">
/**
 * The treasure chest (Survivalist's two-stage gift, `useSupplyDrop`).
 *
 *   filling — the chest stands EMPTY and refilling: lid open, dimmed, a dark
 *             mouth where small coins keep trickling in and a gold hoard
 *             rises with the fill, under a veil that drains as the 3 minutes
 *             pass; the countdown hangs under it (play-test run 4: after a
 *             claim the closed chest + "3:00" read as a buff timer — now it
 *             reads "refills in");
 *   small   — the veil is gone, the chest bobs with a SILVER "+N" (the small
 *             gift) and a thin gold bar that fills toward the big gift: take
 *             it now, or keep playing for more — the bar says so without a
 *             word;
 *   big     — gold glow, gold "+N", a bigger bob.
 *
 * A tap opens whatever is waiting: coins fly to the wallet, a skill charge (big
 * gifts only) gets its own line. A tap on a chest still filling names it
 * (HudTip): its name, a clock with the countdown and a coin with the gift it
 * is filling toward — play-test run 3 read the pill as "$60" and the "3:00" as
 * nothing at all. The gift pill wears the wallet's coin, the countdown a clock.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import useSupplyDrop from '@/barrage/state/useSupplyDrop'
import type { SkillId } from '@/barrage/engine/types'
import { chestSrc, coinSrc } from '@/barrage/art'
import HudButton from '@/components/barrage/HudButton.vue'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useSounds from '@/use/useSound'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import { fmtCoins, fmtCountdown, noteCoinRain } from '@/components/barrage/barrageUi'
import { showHudTip } from '@/components/barrage/hudTip'

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
/** Emptied and refilling (lid open, coins trickling in). */
const refilling = computed(() => stage.value === 'cooldown')
/** The gold hoard in the open chest's mouth, 0 → 1 with the fill. */
const hoardStyle = computed(() => {
  const k = Math.max(0, Math.min(1, chest.progress.value))
  return { opacity: String(0.25 + 0.75 * k), transform: `scale(${0.35 + 0.65 * k}, ${0.3 + 0.7 * k})` }
})

const got = ref<{ id: number; coins: number; skill: SkillId | null } | null>(null)
let gotTimer = 0
let seq = 0

/** Still filling: name it — the chest, how long, and what for. */
const nameIt = (el: HTMLElement | null): void => {
  if (!el) return
  showHudTip(el, () => {
    const time = left.value
    const coins = fmtCoins(chest.gifts.value.small)
    return {
      icon: 'chest',
      name: t('barrageMeta.supply.title'),
      facts: [
        { icon: 'clock', text: time },
        { icon: 'coin', text: t('barrageMeta.supply.gift', { n: coins }) }
      ],
      sr: t('barrage.supply.filling', { name: t('barrageMeta.supply.title'), n: coins, time })
    }
  })
}

const onClick = (ev: MouseEvent): void => {
  const src = ev.currentTarget as HTMLElement | null
  const res = chest.claim()
  if (!res) {
    nameIt(src)
    playSound('anchor-swap', 0.03, 1.15)
    return
  }
  if (src && props.coinTarget && res.coins > 0) {
    spawnCoinExplosion({ sourceEl: src, targetEl: props.coinTarget, count: res.stage === 'big' ? 24 : 12 })
  }
  // Run 4: a chest's coin rain landed on top of the upgrade funnel — the
  // funnel now waits for the next calm aim phase.
  if (res.coins > 0) noteCoinRain()
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
      span.chest__art.relative.block.w-full.h-full(:class="{ 'chest__art--refill': refilling }")
        //- Emptied, refilling: the lid stands open over a dark mouth, coins
        //- trickle in and a gold hoard rises inside while the veil drains.
        template(v-if="refilling")
          span.chest__mouth
            span.chest__hoard(:style="hoardStyle")
          img.chest__img.chest__body(:src="chestSrc()" alt="" draggable="false")
          img.chest__img.chest__lid(:src="chestSrc()" alt="" draggable="false")
          img.chest__drip(v-for="i in 3" :key="i" :class="'chest__drip--' + i" :src="coinSrc()" alt="" draggable="false")
        img.chest__img(v-else :src="chestSrc()" alt="" draggable="false")
        span.chest__veil.absolute.inset-x-0.bottom-0(v-if="veil > 0" :style="{ height: (veil * 100) + '%' }")
      template(#corner)
        span.chest__pill.chest__pill--time.game-text.tabular-nums(v-if="stage === 'cooldown'" aria-hidden="true")
          BarrageGlyph.chest__pill-icon(name="clock")
          | {{ left }}
        span.chest__pill.chest__pill--gift.game-text(v-else :class="'chest__pill--' + stage" aria-hidden="true")
          //- A coin, then "+N": coins, not a price (run 3 read "+60" as "$60").
          span.chest__gift
            IconCoin.chest__pill-coin
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

// ── Emptied and refilling ──
// The art box lets the falling coins in from above the chest (the face has
// room); the veil keeps its own corners.
.chest__art--refill
  overflow: visible
  .chest__veil
    background: rgba(4, 8, 18, 0.4)
    border-radius: 0 0 6px 6px
    z-index: 4
// The chest itself: dimmed — it is empty.
.chest__body, .chest__lid
  position: absolute
  inset: 0
  filter: saturate(0.5) brightness(0.72) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5))
.chest__body
  clip-path: inset(41% 0 0 0)
  z-index: 2
// The lid, lifted and swung open on its right hinge.
.chest__lid
  clip-path: inset(0 0 59% 0)
  transform-origin: 92% 41%
  rotate: 24deg
  translate: 0 -14%
  z-index: 3
// The open mouth, just over the body's front rim: dark inside, the hoard
// rising in it.
.chest__mouth
  position: absolute
  left: 8%
  right: 8%
  top: 26%
  height: 20%
  border-radius: 50%
  background: radial-gradient(ellipse at 50% 60%, #2a1406 0%, #0c0503 75%)
  box-shadow: inset 0 2px 3px rgba(0, 0, 0, 0.9)
  overflow: hidden
  z-index: 1
.chest__hoard
  position: absolute
  inset: 18% 12% -10%
  border-radius: 50% 50% 40% 40%
  background: radial-gradient(ellipse at 50% 35%, #fff3b0 0%, #ffd23c 40%, #c98a0c 100%)
  box-shadow: 0 0 6px rgba(255, 210, 60, 0.9)
  transform-origin: 50% 100%
  transition: transform 0.9s linear, opacity 0.9s linear
// Small coins trickling into the mouth, one after another.
.chest__drip
  position: absolute
  left: 44%
  top: -34%
  width: 24%
  height: 24%
  object-fit: contain
  // Over the veil: the coins going in are the point.
  z-index: 5
  opacity: 0
  filter: drop-shadow(0 0 2px rgba(255, 210, 60, 0.9))
  animation: chest-drip 1.8s ease-in infinite
.chest__drip--2
  left: 22%
  animation-delay: 0.6s
.chest__drip--3
  left: 58%
  animation-delay: 1.2s
@keyframes chest-drip
  0%
    translate: 0 0
    opacity: 0
  15%
    opacity: 1
  70%
    opacity: 1
  90%, 100%
    translate: 0 150%
    opacity: 0
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
.chest__pill--time
  display: flex
  align-items: center
  gap: 1px
.chest__pill-icon
  width: 9px
  height: 9px
  flex: 0 0 auto
.chest__pill--gift
  display: flex
  flex-direction: column
  align-items: stretch
  font-weight: 900
.chest__gift
  display: flex
  align-items: center
  justify-content: center
  gap: 1px
.chest__pill-coin
  width: 10px
  height: 10px
  flex: 0 0 auto
  filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.8))
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
  // One coin held over the mouth instead of the trickle.
  .chest__drip
    animation: none
    opacity: 1
    translate: 0 70%
  .chest__drip--2, .chest__drip--3
    display: none
</style>
