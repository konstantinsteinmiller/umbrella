<script setup lang="ts">
import { ref, computed } from 'vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useEpicConfig from '@/use/useEpicConfig'
import { isCompactHud } from '@/use/useUser'
import { formatBig } from '@/utils/bigNumber'
import {
  registerAdChordTap, adChordTapCount,
  AD_CHORD_TAP_THRESHOLD, AD_CHORD_HINT_AT
} from '@/use/useAdDebugChord'

const { coins } = useEpicConfig()

// Abbreviate big wallets: 1435 → "1.4k", 4.5m, 1.2b, 1.3t, 2.5qa … One
// decimal, FLOORED so the badge never shows more than the player actually has;
// trailing ".0" dropped (2000 → "2k"). Under 1000 shows the exact count.
const display = computed(() => formatBig(coins.value, { decimals: 1, floor: true, trim: true, lower: true }))

// Exposed so siblings (e.g. TreasureChest) can target the badge for fly-to VFX.
// Stays on `.coin-badge` itself, NOT on the positioning wrapper added for the
// chord readout — the coin-fly animations aim at this rect.
const rootEl = ref<HTMLElement | null>(null)
defineExpose({ rootEl })

// Hidden debug chord: 20 taps here inside 30 s force a midgame interstitial.
// See `useAdDebugChord.ts` for why it ships in every build. The readout only
// appears once a chord is clearly under way, so it is invisible to a player who
// happens to poke their gold counter.
const showChordCount = computed(() => adChordTapCount.value >= AD_CHORD_HINT_AT)
</script>

<template lang="pug">
  //- Compact mode shrinks the REAL box (padding, icon size, font), never a
  //- transform: a scaled badge keeps its original footprint in the top bar and
  //- the merge grid gets none of the room back. See `isCompactHud`.
  //- The wrapper exists only to anchor the chord readout: `.coin-badge` itself
  //- is `overflow: hidden` (the shine sweep), so an absolutely-positioned child
  //- of it would be clipped.
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
      :class="isCompactHud\
        ? 'gap-1 pl-0.5 pr-1.5 py-0 text-[11px] coin-badge--compact'\
        : 'gap-2 pl-1 pr-3 py-1 text-sm sm:text-base'"
    )
      div.coin-badge__icon.flex.items-center.justify-center.rounded-full(
        :class="isCompactHud ? 'w-5 h-5' : 'w-7 h-7 sm:w-8 sm:h-8'"
      )
        IconCoin(
          class="text-yellow-100 drop-shadow"
          :class="isCompactHud ? 'w-3.5 h-3.5' : 'w-5 h-5 sm:w-6 sm:h-6'"
        )
      span.game-text.coin-badge__value {{ display }}

    //- Debug readout — exempt from i18n (a debug overlay, not player copy).
    div.coin-badge__chord.absolute.pointer-events-none(
      v-if="showChordCount"
    ) {{ adChordTapCount }}/{{ AD_CHORD_TAP_THRESHOLD }}
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

// Hidden-chord progress readout. Sits UNDER the badge (outside its
// `overflow: hidden`), right-aligned so it can't push the top bar wider.
.coin-badge__chord
  top: 100%
  right: 0
  margin-top: 2px
  padding: 0 4px
  border-radius: 4px
  background: rgba(4, 8, 18, 0.82)
  color: #9fd8ff
  font-size: 9px
  font-weight: 700
  line-height: 13px
  letter-spacing: 0.5px
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace

@keyframes coin-shine
  0%
    background-position: 200% 0
  100%
    background-position: -100% 0
</style>
