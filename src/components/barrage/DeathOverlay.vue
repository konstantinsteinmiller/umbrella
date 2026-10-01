<script setup lang="ts">
/**
 * WASTED — the death sequence's title (playtest run 7: the lose rule, taught
 * by the loss itself). The moment a breach lands, the board plays the
 * monsters tearing the unit apart (render/death.ts) and this holds over it:
 * the screen drained of colour and darkened at the edges, a black band across
 * the middle, the word in blood red, slowly swelling (GTA's "wasted", Elden
 * Ring's "YOU DIED"). The state layer opens the death screen DEATH_SCENE_MS
 * after the breach (useBarrage `deathScene`); this only shows while `open`.
 *
 * Display only — pointer-events none. Reduced motion: no swell, a plain fade.
 * The word is the live region's sentence too (`data-coach-live`: the
 * playtest harness takes a moment frame of it).
 *
 * Playtest run 9: in German, "GEFALLEN" over the greyed-out boss read as the
 * BOSS dying ("I never saw … which enemy crossed the line"). The culprit — the
 * striker, render/death.ts `pickStriker` — keeps its colour: the grey spares a
 * clear pool round it (`boardApi.deathFocusClient`, read once the renderer has
 * started the sequence), and the board draws it with a red outline. The
 * German word is now "ÜBERRANNT", the rule's own name.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { boardApi } from '@/components/barrage/barrageUi'

const props = defineProps<{ open: boolean }>()
const { t } = useI18n()

const focus = ref<{ x: number; y: number; r: number } | null>(null)
watch(() => props.open, async (open) => {
  focus.value = null
  if (!open) return
  // The renderer starts the sequence on the same breach event: a frame later
  // its culprit is known.
  await nextTick()
  requestAnimationFrame(() => { if (props.open) focus.value = boardApi.value?.deathFocusClient?.() ?? null })
}, { immediate: true })

const drainStyle = computed(() => {
  const f = focus.value
  if (!f) return undefined
  const mask = `radial-gradient(circle at ${Math.round(f.x)}px ${Math.round(f.y)}px, transparent ${Math.round(f.r)}px, #000 ${Math.round(f.r * 1.45)}px)`
  return { maskImage: mask, WebkitMaskImage: mask }
})
</script>

<template lang="pug">
  Teleport(to="body")
    Transition(name="death-fx")
      div.death-fx.fixed.inset-0.pointer-events-none(v-if="open" role="alert" data-coach-live="death")
        div.death-fx__drain(:style="drainStyle")
        div.death-fx__band
          span.death-fx__word {{ t('barrage.breach.wasted') }}
</template>

<style scoped lang="sass">
// Over the board, the HUD and the teleported top bar (z-55), so all of it
// drains of colour; the death screen opens as this leaves.
.death-fx
  z-index: 56
  display: flex
  align-items: center
  justify-content: center
// The grey, with a clear pool round the culprit (its mask).
.death-fx__drain
  position: absolute
  inset: 0
  backdrop-filter: grayscale(0.8) brightness(0.86) contrast(1.08)
  -webkit-backdrop-filter: grayscale(0.8) brightness(0.86) contrast(1.08)
  background: radial-gradient(ellipse at 50% 50%, rgba(30, 0, 6, 0) 40%, rgba(30, 0, 6, 0.5) 100%)
  // In with the strike (render/death.ts DEATH_HIT ≈ 0.26 s).
  animation: death-fade 0.45s ease-out 0.24s both
.death-fx__band
  position: relative
  width: 100%
  padding: 0.9rem 0
  display: flex
  justify-content: center
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.78) 22%, rgba(0, 0, 0, 0.78) 78%, rgba(0, 0, 0, 0))
  animation: death-band 0.3s ease-out 0.26s both
.death-fx__word
  font-family: Georgia, 'Times New Roman', 'Noto Serif', serif
  font-weight: 700
  font-size: clamp(2.2rem, 11vw, 5.5rem)
  line-height: 1.1
  letter-spacing: 0.08em
  // The trailing letter-space, balanced: the word sits dead centre.
  padding-left: 0.08em
  text-transform: uppercase
  white-space: nowrap
  color: #c8101c
  -webkit-text-stroke: 2px rgba(18, 0, 4, 0.95)
  paint-order: stroke fill
  text-shadow: 0 0 22px rgba(255, 24, 40, 0.55), 0 3px 0 rgba(0, 0, 0, 0.7)
  animation: death-fade 0.35s ease-out 0.3s both, death-swell 0.9s cubic-bezier(0.2, 0.6, 0.3, 1) 0.3s both
.death-fx-leave-active
  transition: opacity 0.25s ease
.death-fx-leave-to
  opacity: 0
@keyframes death-fade
  from
    opacity: 0
@keyframes death-band
  from
    opacity: 0
    scale: 1 0.2
@keyframes death-swell
  from
    scale: 0.92
  to
    scale: 1.06

@media (prefers-reduced-motion: reduce)
  .death-fx__band
    animation: death-fade 0.3s ease-out 0.3s both
  .death-fx__word
    animation: death-fade 0.4s ease-out 0.3s both
</style>
