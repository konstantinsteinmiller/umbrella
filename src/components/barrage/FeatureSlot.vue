<script setup lang="ts">
/**
 * One earned HUD feature (`useFeatureUnlocks`). Renders nothing while the
 * feature is locked — no pulse, no red dot, nothing to be buried under. While
 * its unlock clone flies in (FeatureUnlockFx) it holds its slot invisibly; once
 * it has landed it breathes, with a gold ring and a sparkle in its corner,
 * until the player taps it. Everything stays INSIDE the button's own box: the
 * portrait control deck clips its overflow (no sideways scroll in a portal
 * iframe), so a hint hung above the button would simply not be there.
 */
import { computed, ref, watch, onUnmounted } from 'vue'
import { featureStates, markFeatureSeen, type FeatureId } from '@/use/useFeatureUnlocks'

const props = defineProps<{ id: FeatureId }>()

const state = computed(() => featureStates.value[props.id])

// The landing pop plays once, on the arriving → new edge — not on every mount
// of a button that is still unopened after a reload.
const landing = ref(false)
let landTimer = 0
watch(state, (now, was) => {
  if (was === 'arriving' && now === 'new') {
    landing.value = true
    window.clearTimeout(landTimer)
    landTimer = window.setTimeout(() => { landing.value = false }, 700)
  }
})
onUnmounted(() => window.clearTimeout(landTimer))

const onTap = (): void => {
  if (state.value === 'new') markFeatureSeen(props.id)
}
</script>

<template lang="pug">
  div.feature-slot.relative(
    v-if="state !== 'locked'"
    :data-feature="id"
    :class="['is-' + state, { 'is-landing': landing }]"
    @click.capture="onTap"
  )
    div.feature-slot__body
      slot
    template(v-if="state === 'new'")
      span.feature-slot__ring.absolute.pointer-events-none(aria-hidden="true")
      svg.feature-slot__glint.absolute.pointer-events-none(viewBox="0 0 24 24" aria-hidden="true")
        path(d="M12 1.5 L14.2 9.8 L22.5 12 L14.2 14.2 L12 22.5 L9.8 14.2 L1.5 12 L9.8 9.8 Z" fill="#fff4a8" stroke="#0f1a30" stroke-width="1.6" stroke-linejoin="round")
</template>

<style scoped lang="sass">
.feature-slot
  display: flex
  align-items: center
  justify-content: center
.feature-slot__body
  display: flex
  align-items: center
  justify-content: center
.is-new .feature-slot__body
  animation: fs-breathe 1.4s ease-in-out infinite
@keyframes fs-breathe
  0%, 100%
    scale: 1
  50%
    scale: 1.07
.is-arriving
  visibility: hidden
.is-landing
  animation: fs-land 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)
@keyframes fs-land
  0%
    transform: scale(0.4)
  60%
    transform: scale(1.18)
  100%
    transform: scale(1)

.feature-slot__ring
  inset: -3px
  border-radius: 14px
  box-shadow: 0 0 0 2px rgba(255, 226, 90, 0.95), 0 0 14px 3px rgba(255, 200, 60, 0.75)
  animation: fs-ring 1.1s ease-in-out infinite alternate
  z-index: 3
@keyframes fs-ring
  from
    opacity: 0.45
  to
    opacity: 1

// Top-LEFT: the top-right corner belongs to the buttons' own badges (the
// codex's next-unit silhouette, the red ready / claim dots).
.feature-slot__glint
  width: 16px
  height: 16px
  top: -1px
  left: -1px
  z-index: 4
  filter: drop-shadow(0 0 3px rgba(255, 220, 90, 0.95))
  animation: fs-glint 1.4s ease-in-out infinite
@keyframes fs-glint
  0%, 100%
    rotate: 0deg
    scale: 0.8
  50%
    rotate: 45deg
    scale: 1.15

@media (prefers-reduced-motion: reduce)
  .is-landing, .feature-slot__ring, .is-new .feature-slot__body, .feature-slot__glint
    animation: none
</style>
