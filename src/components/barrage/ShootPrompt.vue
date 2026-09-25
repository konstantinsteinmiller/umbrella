<script setup lang="ts">
/**
 * "Tap to Shoot" / "Click to Shoot" — the one visible call to action on a
 * first-time player's board, pulsing until their first shot.
 *
 * It is also the invitation the gameplay bracket waits for: no portal hears
 * `gameplayStart()` until the player's first interaction with the live game
 * (`usePortalGameplay`), and a tap on the board IS a shot — the press places
 * the aim and the release fires at the tapped point.
 *
 *   • Who: a player who has never fired (`stats.volleys === 0`, lifetime and
 *     saved — a cloud hydrate that brings a veteran's stats hides it at once).
 *   • When: the aim phase with nothing over the board — no menu, ad, breach /
 *     chest / result screen. Hidden while a finger or the mouse button is down
 *     (the player is aiming; the label would sit under the hand), and gone for
 *     good with the first shot.
 *   • Tap or Click: the primary pointer (`pointer: coarse`) decides at first,
 *     then whatever the player actually uses — a touch laptop moved with a
 *     mouse says "Click".
 *
 * Lives in the board overlay (pointer-events none), so it never eats a press.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useBarrage from '@/barrage/state/useBarrage'
import { stats } from '@/barrage/state/progress'
import { isAdShowing } from '@/use/useGamePause'
import { isAnyModalOpen } from '@/use/useModalState'

const { t } = useI18n()
const barrage = useBarrage()

const firstTimer = computed(() => stats.value.volleys === 0)

const primaryCoarse = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
const touch = ref(primaryCoarse())
const pressing = ref(false)

const show = computed(() =>
  firstTimer.value
  && !pressing.value
  && barrage.phase.value === 'aim'
  && !barrage.holdSim.value
  && !isAnyModalOpen.value
  && !isAdShowing.value
)

const label = computed(() => touch.value ? t('barrage.prompt.tapToShoot') : t('barrage.prompt.clickToShoot'))

// ─── Input watch (only while the prompt can still matter) ───────────────────
const onDown = (e: PointerEvent): void => {
  touch.value = e.pointerType !== 'mouse'
  pressing.value = true
}
const onUp = (): void => { pressing.value = false }
const onMove = (e: PointerEvent): void => {
  if (e.pointerType === 'mouse' && touch.value) touch.value = false
}

let listening = false
const listen = (on: boolean): void => {
  if (typeof window === 'undefined' || on === listening) return
  listening = on
  const opts = { capture: true, passive: true }
  if (on) {
    window.addEventListener('pointerdown', onDown, opts)
    window.addEventListener('pointerup', onUp, opts)
    window.addEventListener('pointercancel', onUp, opts)
    window.addEventListener('pointermove', onMove, opts)
  } else {
    window.removeEventListener('pointerdown', onDown, true)
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointercancel', onUp, true)
    window.removeEventListener('pointermove', onMove, true)
    pressing.value = false
  }
}

watch(firstTimer, (first) => listen(first), { immediate: true })
onUnmounted(() => listen(false))
</script>

<template lang="pug">
  Transition(name="shoot-prompt")
    div.shoot-prompt.absolute.left-0.right-0.flex.justify-center(v-if="show")
      span.shoot-prompt__label.game-text.font-black.uppercase.text-center {{ label }}
</template>

<style scoped lang="sass">
// Right above the unit. The tutorial's ghost hand sweeps the shot line from
// ~2.5 cells above the launcher up to the monsters, so this is the one band
// on that line it never covers (only its thin ghost line passes through).
.shoot-prompt
  bottom: 15%
  z-index: 24
.shoot-prompt__label
  display: inline-block
  max-width: 88%
  padding: 0.35em 0.9em 0.4em
  border-radius: 999px
  font-size: clamp(15px, 4.4vw, 24px)
  line-height: 1.1
  color: #fff6d6
  background: linear-gradient(180deg, rgba(40, 22, 70, 0.78), rgba(18, 10, 36, 0.78))
  border: 2px solid rgba(255, 214, 120, 0.9)
  box-shadow: 0 0 0 1.5px rgba(15, 26, 48, 0.9), 0 0 14px rgba(255, 196, 80, 0.45), 0 4px 10px rgba(0, 0, 0, 0.45)
  text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000
  animation: shoot-pulse 1.1s ease-in-out infinite
@keyframes shoot-pulse
  0%, 100%
    transform: scale(1)
    box-shadow: 0 0 0 1.5px rgba(15, 26, 48, 0.9), 0 0 10px rgba(255, 196, 80, 0.35), 0 4px 10px rgba(0, 0, 0, 0.45)
  50%
    transform: scale(1.09)
    box-shadow: 0 0 0 1.5px rgba(15, 26, 48, 0.9), 0 0 22px rgba(255, 196, 80, 0.8), 0 4px 10px rgba(0, 0, 0, 0.45)

.shoot-prompt-enter-active, .shoot-prompt-leave-active
  transition: opacity 0.2s ease
.shoot-prompt-enter-from, .shoot-prompt-leave-to
  opacity: 0

@media (prefers-reduced-motion: reduce)
  .shoot-prompt__label
    animation: none
</style>
