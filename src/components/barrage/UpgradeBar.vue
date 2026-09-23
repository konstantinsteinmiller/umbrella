<script setup lang="ts">
/**
 * The five Barrage upgrades as runic plaques (MIW's upgrade panel look):
 * Ball Damage · Tray Capacity · Launch Speed · Pickup Luck · Coin Bounty.
 *
 * Casual contract rule 3 — ONE obvious next upgrade: exactly one chip glows
 * (`UpgradeView.glowing`, the cheapest affordable one). While the FTUE's free
 * "Tray Capacity 3" is on offer, that chip is the only thing glowing and it
 * says FREE instead of a price.
 *
 * Unaffordable chips stay tappable (aria-disabled, not disabled): the tap
 * plays the denied sound and shakes, which is the only feedback a phone
 * player gets for "not yet" — a disabled button swallows the tap silently.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useBarrageUpgrades from '@/barrage/state/useBarrageUpgrades'
import type { UpgradeId, UpgradeView } from '@/barrage/state/contract'
import useSounds from '@/use/useSound'
import { notifyTutorial, tutorialStep } from '@/use/useTutorial'
import { isCompactHud, isRoomyHud, isUltraCompactHud } from '@/use/useUser'
import IconCoin from '@/components/icons/IconCoin.vue'
import RuneFrame from '@/components/atoms/RuneFrame.vue'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import { fmtCoins, upgradeValueKey, upgradeValueNumber } from '@/components/barrage/barrageUi'
import { runeZoneFor } from '@/game/runes'
import { emitSparkle } from '@/use/usePrismParticles'

const props = withDefaults(defineProps<{
  /** Chips per row: 5 in one strip (portrait, wide columns), 3 (+2 below) in a
   *  narrow side column where five across would crush the prices. */
  cols?: number
}>(), { cols: 5 })

const { t, locale } = useI18n()
const upgrades = useBarrageUpgrades()
const { playSound } = useSounds()

const ACCENT: Record<UpgradeId, string> = {
  damage: '#ff6a2a', capacity: '#5fb0ff', speed: '#36d399', luck: '#7ee05a', bounty: '#ffd23c'
}
/** What each chip's rune border spells (ornament, never read). */
const INSCRIPTION: Record<UpgradeId, string> = {
  damage: 'ball damage', capacity: 'tray capacity', speed: 'launch speed', luck: 'pickup luck', bounty: 'coin bounty'
}

const freeOffer = computed(() => upgrades.freeCapacityOffer.value)

interface Chip {
  view: UpgradeView
  id: UpgradeId
  free: boolean
  glow: boolean
  state: 'ready' | 'locked' | 'maxed'
  value: string
  next: string | null
}

const fmtValue = (id: UpgradeId, v: number): string => t(upgradeValueKey(id), { n: upgradeValueNumber(id, v) })

const chips = computed<Chip[]>(() => upgrades.list.value.map((view) => {
  const free = freeOffer.value && view.id === 'capacity'
  return {
    view,
    id: view.id,
    free,
    // The free FTUE offer is THE obvious next thing — nothing else glows beside it.
    glow: free || (!freeOffer.value && view.glowing),
    state: view.maxed ? 'maxed' : (free || view.affordable) ? 'ready' : 'locked',
    value: fmtValue(view.id, view.value),
    next: view.nextValue === null || view.maxed ? null : fmtValue(view.id, view.nextValue)
  }
}))

const name = (id: UpgradeId): string => t(`barrage.upgrades.${id}.short`)
const ariaFor = (c: Chip): string => {
  const base = { name: t(`barrage.upgrades.${c.id}.name`), desc: t(`barrage.upgrades.${c.id}.desc`) }
  if (c.view.maxed) return t('barrage.upgrades.ariaMaxed', base)
  if (c.free) return t('barrage.upgrades.ariaFree', base)
  return t('barrage.upgrades.aria', { ...base, cost: fmtCoins(c.view.cost) })
}
const titleFor = (c: Chip): string => `${t(`barrage.upgrades.${c.id}.name`)} — ${t(`barrage.upgrades.${c.id}.desc`)}`

// ─── Buying ──────────────────────────────────────────────────────────────────
const flareId = ref<UpgradeId | null>(null)
const shakeId = ref<UpgradeId | null>(null)
let flareTimer = 0
let shakeTimer = 0

const flare = (id: UpgradeId, el: HTMLElement | null): void => {
  flareId.value = null
  requestAnimationFrame(() => { flareId.value = id })
  window.clearTimeout(flareTimer)
  flareTimer = window.setTimeout(() => { flareId.value = null }, 520)
  const r = el?.getBoundingClientRect()
  if (r) emitSparkle(r.left + r.width / 2, r.top + r.height / 2, ACCENT[id], 12)
}

const onChip = (c: Chip, ev: MouseEvent): void => {
  const el = ev.currentTarget as HTMLElement | null
  if (c.free) {
    upgrades.claimFreeCapacity()
    playSound('upgrade-buy', 0.06, 1.1)
    flare(c.id, el)
    notifyTutorial({ kind: 'upgrade' })
    return
  }
  if (!c.view.maxed && upgrades.buy(c.id)) {
    playSound('upgrade-buy', 0.05, 1.05)
    flare(c.id, el)
    notifyTutorial({ kind: 'upgrade' })
    return
  }
  playSound('upgrade-denied', 0.015)
  shakeId.value = null
  requestAnimationFrame(() => { shakeId.value = c.id })
  window.clearTimeout(shakeTimer)
  shakeTimer = window.setTimeout(() => { shakeId.value = null }, 400)
}

// ─── Sizing ──────────────────────────────────────────────────────────────────
// The rune bands scale off the chip's real height (see `runeZoneFor`); on
// compact phones the frame goes entirely — a 50px chip needs every pixel for
// glyph, name, value and price.
const rootEl = ref<HTMLElement | null>(null)
const barH = ref(0)
let ro: ResizeObserver | null = null
onMounted(() => {
  const el = rootEl.value
  if (!el) return
  const measure = (): void => { barH.value = el.clientHeight }
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(measure)
    ro.observe(el)
  }
})
onUnmounted(() => {
  ro?.disconnect()
  window.clearTimeout(flareTimer)
  window.clearTimeout(shakeTimer)
})

const rowsOf = computed(() => Math.max(1, Math.ceil(5 / Math.max(1, props.cols))))
/** One chip's height: the bar splits into `rowsOf` rows. */
const chipH = computed(() => (barH.value - 3 - 4 * (rowsOf.value - 1)) / rowsOf.value)
const runes = computed(() => !isCompactHud.value && chipH.value >= 58)
const runeZone = computed(() => runes.value ? `${runeZoneFor(Math.max(0, chipH.value - 3)).toFixed(1)}px` : '3px')
const chipBasis = computed(() => props.cols >= 5
  ? undefined
  : `calc((100% - ${4 * (props.cols - 1)}px) / ${props.cols})`)

const nameClass = computed(() => isCompactHud.value ? 'text-[10px]' : isRoomyHud.value ? 'text-[13px]' : 'text-[11px]')
const valueClass = computed(() => isCompactHud.value ? 'text-[10px]' : isRoomyHud.value ? 'text-[13px]' : 'text-[11px]')
const costClass = computed(() => isCompactHud.value ? 'text-[11px]' : isRoomyHud.value ? 'text-sm' : 'text-xs')
const glyphClass = computed(() => isCompactHud.value ? 'w-3.5 h-3.5' : isRoomyHud.value ? 'w-5 h-5' : 'w-4 h-4')
const coinClass = computed(() => isCompactHud.value ? 'w-3 h-3' : isRoomyHud.value ? 'w-4 h-4' : 'w-3.5 h-3.5')

// The FTUE hand presses whichever chip the tutorial names.
const tutTarget = computed(() => tutorialStep.value === 'upgrade')

// ─── Shrink-to-fit labels ────────────────────────────────────────────────────
// "Kapazität", "Вместимость", "Сыйымдылық": a label that fits in English is
// clipped in half the locales at phone width. Truncating it (MIW's first answer)
// earned a portal QA ticket; instead each name / value line steps its own font
// down, half a pixel at a time, until it fits — never below 8 px, where the
// ellipsis takes over again. Re-run only when the TEXT or the box changes, not on
// every coin tick (affordability flips don't change a single glyph).
const MIN_FONT = 8
const fitLabels = (): void => {
  const root = rootEl.value
  if (!root) return
  for (const el of root.querySelectorAll<HTMLElement>('.chip-name, .chip-value')) {
    el.style.fontSize = ''
    let size = parseFloat(getComputedStyle(el).fontSize)
    while (el.scrollWidth > el.clientWidth + 0.5 && size > MIN_FONT) {
      size -= 0.5
      el.style.fontSize = `${size}px`
    }
  }
}
const labelKey = computed(() => `${locale.value}|${barH.value}|${props.cols}|${chips.value.map((c) => `${c.value}${c.next ?? ''}${c.view.maxed}`).join()}`)
watch(labelKey, () => { void nextTick(fitLabels) })
onMounted(() => { void nextTick(fitLabels) })
</script>

<template lang="pug">
  div.upgrade-bar.flex.items-stretch.justify-center.w-full.h-full.gap-1(
    ref="rootEl"
    class="pb-[3px]"
    :class="cols < 5 ? 'flex-wrap content-stretch' : ''"
    role="group"
    :aria-label="t('barrage.upgrades.title')"
  )
    button.chip.flex.flex-col.items-center.justify-center.min-w-0(
      v-for="c in chips"
      :key="c.id"
      type="button"
      :class="['chip--' + c.state, { 'chip--glow': c.glow, 'chip--free': c.free, 'chip--compact': isCompactHud, 'chip--flare': flareId === c.id, 'chip--shake': shakeId === c.id, 'chip--tut': tutTarget && c.glow, 'flex-1': cols >= 5 }]"
      :style="{ '--accent': ACCENT[c.id], '--rune-zone': runeZone, flexBasis: chipBasis, height: cols < 5 ? chipH + 'px' : undefined }"
      :aria-disabled="c.state === 'locked' || c.view.maxed ? 'true' : undefined"
      :aria-label="ariaFor(c)"
      :title="titleFor(c)"
      :data-tut="'upgrade-' + c.id"
      :data-upgrade-id="c.id"
      @click="onChip(c, $event)"
    )
      RuneFrame(v-if="runes" :inscription="INSCRIPTION[c.id]" :state="c.state")
      //- Glyph + short name.
      span.flex.items-center.justify-center.w-full.min-w-0(class="gap-[3px]")
        span.chip-glyph.shrink-0(:class="glyphClass" :style="{ color: ACCENT[c.id] }")
          BarrageGlyph.w-full.h-full(:name="c.id")
        span.chip-name.game-text.font-black.uppercase.leading-none.truncate(v-if="!isUltraCompactHud" :class="nameClass") {{ name(c.id) }}
      //- Value → next value.
      span.chip-value.game-text.font-black.leading-tight.whitespace-nowrap.max-w-full.truncate(:class="valueClass")
        template(v-if="c.next") {{ t('barrage.upgrades.arrow', { from: c.value, to: c.next }) }}
        template(v-else) {{ c.value }}
      //- Price (or FREE / MAX).
      span.flex.items-center.justify-center(class="gap-0.5 mt-px")
        template(v-if="c.view.maxed")
          span.chip-maxed.game-text.font-black.leading-none(:class="costClass") {{ t('barrage.upgrades.max') }}
        template(v-else-if="c.free")
          span.chip-free.game-text.font-black.leading-none.uppercase(:class="costClass") {{ t('barrage.upgrades.free') }}
        template(v-else)
          IconCoin.chip-coin.shrink-0(:class="coinClass")
          span.chip-cost.game-text.font-black.leading-none.tabular-nums(
            :class="[c.view.affordable ? 'chip-cost--ok' : 'chip-cost--short', costClass]"
          ) {{ fmtCoins(c.view.cost) }}
</template>

<style scoped lang="sass">
// Same runic plaque as MIW's UpgradePanel: accent-tinted crown over deep navy,
// a near-black outline, accent rim and a solid base plate the chip presses onto.
.chip
  --tint: color-mix(in srgb, var(--accent) 26%, #19233f)
  --plate: color-mix(in srgb, var(--accent) 42%, #03050c)
  position: relative
  overflow: hidden
  cursor: pointer
  gap: 1px
  border-radius: 0.75rem
  border: 2px solid #060a16
  padding: var(--rune-zone) 4px
  background: radial-gradient(130% 85% at 50% -14%, color-mix(in srgb, var(--accent) 34%, transparent) 0%, transparent 62%), linear-gradient(180deg, var(--tint) 0%, #0f1631 56%, #080c1d 100%)
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent), inset 0 -2px 0 rgba(0, 0, 0, 0.45), 0 3px 0 var(--plate)
  transition: transform 0.08s ease, box-shadow 0.08s ease, filter 0.2s ease
  -webkit-tap-highlight-color: transparent
  touch-action: manipulation
  min-height: 44px

  > :not(.rune-frame)
    position: relative
    z-index: 1

  &:active
    transform: translateY(2px)
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent), inset 0 -2px 0 rgba(0, 0, 0, 0.45), 0 1px 0 var(--plate)

  @media (hover: hover)
    &:hover
      filter: brightness(1.1)

.chip--ready
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), inset 0 0 0 1px color-mix(in srgb, var(--accent) 70%, transparent), inset 0 -2px 0 rgba(0, 0, 0, 0.45), 0 3px 0 var(--plate), 0 0 9px -4px var(--accent)

// "Not yet": cooler body + a light grey veil, type stays at full contrast.
.chip--locked
  --tint: color-mix(in srgb, var(--accent) 10%, #161c30)
  --plate: color-mix(in srgb, var(--accent) 16%, #03050c)
.chip::before
  content: ''
  position: absolute
  inset: 0
  z-index: 3
  pointer-events: none
  border-radius: inherit
  background: rgb(128, 134, 148)
  opacity: 0
  transition: opacity 0.2s ease
.chip--locked::before
  opacity: 0.2

.chip--maxed
  --tint: color-mix(in srgb, #ffd76a 20%, #1b2034)
  --plate: color-mix(in srgb, #ffd76a 38%, #03050c)

// THE one obvious upgrade: a gold ring that breathes + a slow bob. The ring is
// an inset shadow (the chip clips its overflow), so it cannot reach a neighbour.
.chip--glow
  animation: chip-glow 1.1s ease-in-out infinite alternate
@keyframes chip-glow
  from
    box-shadow: inset 0 0 0 2px rgba(255, 214, 74, 0.55), inset 0 0 10px rgba(255, 214, 74, 0.25), 0 3px 0 var(--plate)
    transform: translateY(0)
  to
    box-shadow: inset 0 0 0 2px rgba(255, 230, 120, 1), inset 0 0 16px rgba(255, 214, 74, 0.55), 0 3px 0 var(--plate)
    transform: translateY(-1px)

.chip--free
  --accent: #4fd16a

.chip--flare
  filter: brightness(1.6)
  transition: filter 0.5s ease-out
.chip--shake
  animation: chip-shake 0.36s ease-in-out
@keyframes chip-shake
  0%, 100%
    translate: 0 0
  20%, 60%
    translate: -3px 0
  40%, 80%
    translate: 3px 0

// The coach hand presses this chip in the FTUE's upgrade beat — in step with
// UpgradeDemo's 3.8 s loop (its hand is down from 13 % to 20 %).
.chip--tut
  animation: chip-glow 1.1s ease-in-out infinite alternate, chip-tut-press 3.8s ease-in-out infinite
@keyframes chip-tut-press
  0%, 12%, 21%, 100%
    translate: 0 0
  14%, 19%
    translate: 0 2px

.chip--compact
  border-width: 1.5px
  border-radius: 0.6rem
  padding-left: 3px
  padding-right: 3px

.chip-name, .chip-value, .chip-cost, .chip-maxed, .chip-free
  text-shadow: 0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000
.chip-name
  color: #fff
.chip-value
  color: #cfe2ff
.chip-glyph
  filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.95)) drop-shadow(0 0 1px rgba(0, 0, 0, 0.95))
.chip-cost--ok
  color: #ffe98a
.chip-cost--short
  color: #ff9a9a
.chip-coin
  filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.9))
.chip-maxed
  color: #ffd76a
.chip-free
  color: #8dffa6
  letter-spacing: 0.04em

@media (prefers-reduced-motion: reduce)
  .chip--glow, .chip--tut, .chip--shake
    animation: none
  .chip--glow
    box-shadow: inset 0 0 0 2px rgba(255, 230, 120, 1), 0 3px 0 var(--plate)
</style>
