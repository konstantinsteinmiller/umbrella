<script setup lang="ts">
/**
 * The three injection lanes above the cauldron (GDD §3.3). Decorative chutes
 * that visually funnel a dragged unit toward the cauldron mouth. They light up
 * while a drag is in progress and pulse the lane the pointer is nearest, so the
 * "drop here to brew" affordance is obvious. The actual drop hit-test and the
 * gravity-slide are owned by the scene/grid; this is the affordance layer.
 */
import { dragActive, dragOverDrop } from '@/use/useDropZones'
import { getIngredient } from '@/game/ingredients'
import { computed } from 'vue'
import { dragTier } from '@/use/useDropZones'

const tintColor = computed(() => dragTier.value ? getIngredient(dragTier.value).glow : '#5fd0ff')
</script>

<template lang="pug">
  div.lanes.flex.items-end.justify-center.gap-2.w-full.h-full.pointer-events-none(
    :class="{ 'is-active': dragActive, 'is-over': dragOverDrop }"
  )
    div.lane(v-for="i in 3" :key="i" :style="{ '--tint': tintColor }")
      div.lane-glow
      svg(viewBox="0 0 40 100" class="w-full h-full" preserveAspectRatio="none")
        path(d="M4 6 L36 6 L26 100 L14 100 Z" fill="rgba(20,28,48,0.55)" stroke="#0b1020" stroke-width="2")
        path.lane-stripe(d="M14 100 L20 10 L26 100" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 6")
</template>

<style scoped lang="sass">
.lanes
  transition: opacity 0.25s ease
  opacity: 0.55

.is-active
  opacity: 1

.lane
  position: relative
  width: 18%
  max-width: 3.2rem
  height: 100%
  color: var(--tint, #5fd0ff)

.lane-stripe
  opacity: 0.35
  transition: opacity 0.2s ease
  animation: lane-flow 1.1s linear infinite
  stroke-dashoffset: 0

.is-active .lane-stripe
  opacity: 0.9

.lane-glow
  position: absolute
  inset: 0
  border-radius: 0.4rem
  background: radial-gradient(ellipse at 50% 0%, var(--tint, #5fd0ff) 0%, transparent 70%)
  opacity: 0
  transition: opacity 0.2s ease

.is-over .lane-glow
  opacity: 0.4

@keyframes lane-flow
  to
    stroke-dashoffset: -24
</style>
