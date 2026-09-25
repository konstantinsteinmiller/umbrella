<script setup lang="ts">
/**
 * A spotlight's dim with see-through windows (LessonSpotlight's acts): soft
 * circles and rounded rectangles, each opening by its `k`.
 */
import type { SpotHole } from '@/components/barrage/lessonSpotlight'

defineProps<{ id: string; holes: SpotHole[]; alpha?: number }>()
</script>

<template lang="pug">
  svg.absolute.inset-0(width="100%" height="100%" aria-hidden="true")
    defs
      //- Soft edge: see-through in the middle, fading out.
      radialGradient(:id="id + '-soft'")
        stop(offset="0%" stop-color="#000")
        stop(offset="64%" stop-color="#000")
        stop(offset="100%" stop-color="#fff")
      mask(:id="id + '-mask'")
        rect(width="100%" height="100%" fill="#fff")
        template(v-for="(h, i) in holes" :key="i")
          circle(
            v-if="h.r !== undefined"
            :cx="h.x" :cy="h.y" :r="Math.max(0.5, h.r)"
            :fill="'url(#' + id + '-soft)'" :fill-opacity="h.k ?? 1"
          )
          rect(
            v-else
            :x="h.x" :y="h.y" :width="Math.max(1, h.w ?? 0)" :height="Math.max(1, h.h ?? 0)"
            rx="12" fill="#000" :fill-opacity="h.k ?? 1"
          )
    rect(width="100%" height="100%" :fill="'rgba(3, 6, 14, ' + (alpha ?? 0.74) + ')'" :mask="'url(#' + id + '-mask)'")
</template>
