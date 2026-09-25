<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import IconCoin from '@/components/icons/IconCoin.vue'
import useEpicConfig from '@/use/useEpicConfig'
import { saveDataVersion } from '@/use/useSaveStatus'
import { isCompactHud } from '@/use/useUser'
import { formatBig } from '@/utils/bigNumber'
import { walletDenied } from '@/components/barrage/barrageUi'
import { registerAdChordTap } from '@/use/useAdDebugChord'

const props = withDefaults(defineProps<{
  /** Ms between the wallet counting a gain and its coin reaching the badge
   *  (the scene knows the board's kill hold + coin-flight time). */
  landMs?: number
}>(), { landMs: 650 })

const { t } = useI18n()
const { coins } = useEpicConfig()

// ─── "+N" at the wallet ──────────────────────────────────────────────────────
// Play-test: nobody noticed coins arriving — the counter ticking up in a
// corner is not an event. Every increase floats a small "+N" off the counter;
// increases within MERGE_MS of each other (a volley's kills, a coin shower)
// add into the pop already up instead of stacking a column of them.
const MERGE_MS = 250
// The wallet counts a kill's coins the moment it dies, but the coin still has
// to fly up from the board (`landMs`): the pop waits for it, so the "+N" reads
// as the coin landing. Every gain waits the same, so merging is unchanged.
/** How long a pop stays after its last increase. */
const POP_MS = 900
/** A cloud / local hydrate rewrites the wallet: that is not income. */
const HYDRATE_QUIET_MS = 600
const pop = ref<{ id: number; amount: number } | null>(null)
let popSeq = 0
let lastGainAt = -Infinity
let hydratedAt = -Infinity
let popTimer = 0
const landing = new Set<number>()
const showGain = (gain: number): void => {
  const at = performance.now()
  // A merged gain keeps the pop (same id: no re-entrance, only a bump of the
  // number); a gain after a pause starts a fresh pop.
  pop.value = pop.value && at - lastGainAt < MERGE_MS
    ? { id: pop.value.id, amount: pop.value.amount + gain }
    : { id: ++popSeq, amount: gain }
  lastGainAt = at
  window.clearTimeout(popTimer)
  popTimer = window.setTimeout(() => { pop.value = null }, POP_MS)
}
watch(saveDataVersion, () => { hydratedAt = performance.now() }, { flush: 'sync' })
watch(coins, (now, was) => {
  if (!(now > was) || performance.now() - hydratedAt < HYDRATE_QUIET_MS) return
  const gain = now - was
  const id = window.setTimeout(() => { landing.delete(id); showGain(gain) }, Math.max(0, props.landMs))
  landing.add(id)
})
// ─── "Not enough" ────────────────────────────────────────────────────────────
// A refused purchase pulses the wallet red: play-test run 2's denied chip
// flashed only its own price, and nothing pointed at what was short.
const DENIED_MS = 700
const denied = ref(false)
let deniedTimer = 0
watch(walletDenied, () => {
  // Off for a frame, then on: a second refusal restarts the pulse.
  denied.value = false
  requestAnimationFrame(() => { denied.value = true })
  window.clearTimeout(deniedTimer)
  deniedTimer = window.setTimeout(() => { denied.value = false }, DENIED_MS)
})

onUnmounted(() => {
  window.clearTimeout(popTimer)
  window.clearTimeout(deniedTimer)
  for (const id of landing) window.clearTimeout(id)
})
const popText = computed(() => pop.value
  ? t('barrage.hud.coinGain', { n: formatBig(pop.value.amount, { decimals: 1, floor: true, trim: true, lower: true }) })
  : '')

// Abbreviate big wallets: 1435 → "1.4k", 4.5m, 1.2b, 1.3t, 2.5qa … One
// decimal, FLOORED so the badge never shows more than the player actually has;
// trailing ".0" dropped (2000 → "2k"). Under 1000 shows the exact count.
const display = computed(() => formatBig(coins.value, { decimals: 1, floor: true, trim: true, lower: true }))

// Exposed so siblings (e.g. TreasureChest) can target the badge for fly-to VFX.
// Stays on `.coin-badge` itself, NOT on the positioning wrapper — the coin-fly
// animations aim at this rect.
const rootEl = ref<HTMLElement | null>(null)
defineExpose({ rootEl })

// Hidden debug chord: 20 taps here inside 30 s force a midgame interstitial.
// See `useAdDebugChord.ts` for why it ships in every build. It leaves no trace
// on the HUD: a QA feature, never shown to a player (its tap count lived under
// the badge as "N/20" until run 12).
</script>

<template lang="pug">
  //- Compact mode shrinks the REAL box (padding, icon size, font), never a
  //- transform: a scaled badge keeps its original footprint in the top bar and
  //- the merge grid gets none of the room back. See `isCompactHud`.
  //- The wrapper anchors the "+N" pop: `.coin-badge` itself is
  //- `overflow: hidden` (the shine sweep), so an absolutely-positioned child of
  //- it would be clipped.
  div.coin-badge-wrap.relative.flex.items-center
    //- Chord taps are read on pointerdown AND touchstart AND click — one of the
    //- three is missing or unreliable depending on the WebView (the CG mobile
    //- app, the GD iframe, …), and `useAdDebugChord` coalesces the duplicates a
    //- single physical tap produces. No `cursor-pointer`: the badge must not
    //- advertise itself as interactive.
    div.coin-badge.relative.flex.items-center.rounded-full.font-bold(
      ref="rootEl"
      @pointerdown="registerAdChordTap"
      @touchstart="registerAdChordTap"
      @click="registerAdChordTap"
      style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
      :class="[isCompactHud\
        ? 'gap-1 pl-0.5 pr-1.5 py-0 text-[11px] coin-badge--compact'\
        : 'gap-2 pl-1 pr-3 py-1 text-sm sm:text-base', { 'coin-badge--denied': denied }]"
    )
      div.coin-badge__icon.flex.items-center.justify-center.rounded-full(
        :class="isCompactHud ? 'w-5 h-5' : 'w-7 h-7 sm:w-8 sm:h-8'"
      )
        IconCoin(
          class="text-yellow-100 drop-shadow"
          :class="isCompactHud ? 'w-3.5 h-3.5' : 'w-5 h-5 sm:w-6 sm:h-6'"
        )
      span.game-text.coin-badge__value {{ display }}

    //- "+N" income pop, under the counter (the wallet itself is read aloud, so
    //- the pop is decoration only).
    Transition(name="coin-gain")
      span.coin-badge__gain.absolute.pointer-events-none.game-text.font-black(
        v-if="pop"
        :key="pop.id"
        :class="isCompactHud ? 'text-[11px]' : 'text-sm'"
        aria-hidden="true"
      )
        //- Re-keyed on every merge: the number bumps, the pop stays put.
        span.coin-badge__gain-n(:key="pop.amount") {{ popText }}

</template>

<style scoped lang="sass">
.coin-badge
  background: linear-gradient(135deg, #50aaff 0%, #2266ff 50%, #1b3e95 100%)
  border: 2px solid #fcd34d

  // Thinner frame + tighter tracking on tiny viewports — 2px of border on all
  // four sides is a visible slice of a 20px-tall badge.
  &--compact
    border-width: 1px
    letter-spacing: 0

    .coin-badge__value
      letter-spacing: 0
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 4px 10px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 0 -2px 4px rgba(0, 0, 0, 0.4)
  overflow: hidden

  &::before
    content: ''
    position: absolute
    inset: 0
    background: linear-gradient(115deg, transparent 35%, rgba(255, 255, 255, 0.35) 50%, transparent 65%)
    background-size: 250% 100%
    animation: coin-shine 3.5s linear infinite
    pointer-events: none

  &__icon
    background: radial-gradient(circle at 30% 30%, #fff7b0 0%, #fcd34d 35%, #b8860b 100%)
    box-shadow: 0 0 8px rgba(252, 211, 77, 0.7), inset 0 -2px 3px rgba(0, 0, 0, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.6)
    border: 1px solid #78350f

  &__value
    color: #fff7d6
    text-shadow: 0 1px 0 #000, 0 0 6px rgba(252, 211, 77, 0.7)
    letter-spacing: 0.5px
    position: relative

// Pops just below the counter and rises onto the badge's bottom edge — the
// top bar has no room above it (the safe area / the screen edge).
.coin-badge__gain
  top: 100%
  right: 0.6rem
  margin-top: -2px
  color: #ffe27a
  white-space: nowrap
  text-shadow: 0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 0 6px rgba(252, 211, 77, 0.8)
.coin-badge__gain-n
  display: inline-block
  animation: coin-gain-bump 0.22s ease-out
@keyframes coin-gain-bump
  from
    scale: 1.35
  to
    scale: 1
.coin-gain-enter-active
  transition: opacity 0.16s ease-out, translate 0.16s ease-out
.coin-gain-leave-active
  transition: opacity 0.28s ease-in, translate 0.28s ease-in
.coin-gain-enter-from
  opacity: 0
  translate: 0 8px
.coin-gain-leave-to
  opacity: 0
  translate: 0 -6px
@media (prefers-reduced-motion: reduce)
  .coin-badge__gain-n
    animation: none
  .coin-gain-enter-from, .coin-gain-leave-to
    translate: 0 0

// "Not enough coins": a red ring that pulses out twice and a short head-shake.
.coin-badge--denied
  animation: coin-denied 0.7s ease-out
@keyframes coin-denied
  0%
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 0 0 0 rgba(255, 59, 59, 0.95)
    translate: 0 0
  15%, 45%
    translate: -3px 0
  30%, 60%
    translate: 3px 0
  35%
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 0 0 5px rgba(255, 59, 59, 0.9)
  75%
    translate: 0 0
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 0 0 2px rgba(255, 59, 59, 0.8)
  100%
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 0 0 9px rgba(255, 59, 59, 0)
@media (prefers-reduced-motion: reduce)
  .coin-badge--denied
    animation: none
    border-color: #ff3b3b

@keyframes coin-shine
  0%
    background-position: 200% 0
  100%
    background-position: -100% 0
</style>
