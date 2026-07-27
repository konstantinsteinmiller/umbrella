<script setup lang="ts">
/**
 * The visible half of the CrazyGames pre-interstitial warning (see
 * `useAdCountdown.ts` for the why and the lifecycle).
 *
 * Two jobs, both load-bearing:
 *
 *   1. BE IMPOSSIBLE TO MISS — a near-opaque scrim, a big pulsing digit and an
 *      explicit "stop tapping" line. The player has ~3s to lift their thumb.
 *   2. SWALLOW INPUT — the root is a full-viewport fixed layer with pointer
 *      events ENABLED and every pointer/touch event stopped on it. That is the
 *      actual anti-accidental-click safeguard: while it's up, taps cannot reach
 *      the SPAWN button underneath, so a tap burst can't carry into the ad.
 *
 * Teleported to <body> at z-[200] so it sits above every other layer (modals
 * z-50, top bar z-55, particles z-60) and outside the scene root's screenshake
 * transform, which would otherwise trap it in its own stacking context.
 */
import { useI18n } from 'vue-i18n'
import { isAdCountdownVisible, adCountdownRemaining } from '@/use/useAdCountdown'
import { isCompactHud } from '@/use/useUser'

const { t } = useI18n()

/** Absorb every pointer interaction while the warning is up. `touchstart` is
 *  listened to passively-false via the template's `.prevent` so a tap-and-hold
 *  can't scroll or synthesise a click either. */
const swallow = (e: Event): void => {
  e.stopPropagation()
}
</script>

<template lang="pug">
  Teleport(to="body")
    Transition(
      appear
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    )
      div.ad-countdown.fixed.inset-0.flex.flex-col.items-center.justify-center(
        v-if="isAdCountdownVisible"
        class="z-[200]"
        role="alertdialog"
        aria-live="assertive"
        :aria-label="t('ads.stopTapping')"
        @pointerdown.capture.prevent.stop="swallow"
        @pointerup.capture.prevent.stop="swallow"
        @click.capture.prevent.stop="swallow"
        @touchstart.capture.prevent.stop="swallow"
        @touchend.capture.prevent.stop="swallow"
      )
        //- The digit — or, once the count hits 0, a "starting now" pip while we
        //- drain audio and wait on the SDK.
        div.ad-countdown__ring.relative.flex.items-center.justify-center(
          :class="isCompactHud ? 'w-20 h-20' : 'w-28 h-28'"
        )
          span.ad-countdown__digit.game-text.font-black.text-white(
            v-if="adCountdownRemaining > 0"
            :key="adCountdownRemaining"
            :class="isCompactHud ? 'text-5xl' : 'text-7xl'"
          ) {{ adCountdownRemaining }}
          span.ad-countdown__dots.game-text.font-black.text-white(
            v-else
            :class="isCompactHud ? 'text-3xl' : 'text-5xl'"
          ) …

        span.ad-countdown__title.game-text.font-black.uppercase.text-center.text-white(
          :class="isCompactHud ? 'text-base mt-2 px-3' : 'text-2xl mt-4 px-6'"
        ) {{ t('ads.startingIn', { n: adCountdownRemaining > 0 ? adCountdownRemaining : 1 }) }}

        span.ad-countdown__hint.game-text.font-black.text-center.text-yellow-200(
          :class="isCompactHud ? 'text-[11px] mt-1 px-4' : 'text-base mt-2 px-8'"
        ) {{ t('ads.stopTapping') }}
</template>

<style scoped lang="sass">
.ad-countdown
  // Near-opaque: the point is that the player CANNOT keep playing through it,
  // and that the ad handover isn't a visual surprise.
  background: radial-gradient(circle at 50% 45%, rgba(12, 22, 38, 0.94) 0%, rgba(4, 8, 16, 0.97) 70%)
  backdrop-filter: blur(3px)
  // Belt-and-braces with the JS handlers above: no text selection, no
  // double-tap zoom, no touch scrolling behind the warning.
  user-select: none
  -webkit-user-select: none
  touch-action: none

.ad-countdown__ring
  border-radius: 9999px
  border: 4px solid #ffcd00
  background: radial-gradient(circle at 30% 30%, rgba(255, 205, 0, 0.25) 0%, rgba(0, 0, 0, 0.55) 70%)
  box-shadow: 0 0 0 6px rgba(0, 0, 0, 0.55), 0 0 26px rgba(255, 205, 0, 0.55)
  animation: ad-ring-pulse 1s ease-in-out infinite

.ad-countdown__digit
  text-shadow: 0 3px 0 #000, 0 0 14px rgba(255, 205, 0, 0.85)
  // Re-keyed each second, so this replays per tick and the number visibly
  // "lands" — motion is what pulls the eye away from the tap target.
  animation: ad-digit-pop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)

.ad-countdown__dots
  text-shadow: 0 3px 0 #000, 0 0 14px rgba(255, 205, 0, 0.85)
  animation: ad-ring-pulse 0.7s ease-in-out infinite

.ad-countdown__title
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000
  letter-spacing: 0.03em

.ad-countdown__hint
  text-shadow: 2px 2px 0 #000

@keyframes ad-digit-pop
  0%
    transform: scale(1.7)
    opacity: 0.15
  100%
    transform: scale(1)
    opacity: 1

@keyframes ad-ring-pulse
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.06)

// Respect a reduced-motion preference: keep the warning (it's functional, not
// decorative) but drop the pulsing/popping.
@media (prefers-reduced-motion: reduce)
  .ad-countdown__ring,
  .ad-countdown__digit,
  .ad-countdown__dots
    animation: none
</style>
