<script setup lang="ts">
/**
 * A medallion coin as a small icon (levels.ts MEDALLION_PAINT): a lit rim, an enamel face and an embossed star.
 * `got` false draws the greyed-out empty facet it will be set into (the level grid, the HUD badge).
 */
import { computed } from 'vue'
import { MEDALLION_PAINT, type MedallionColor } from '@/umbrella/levels'

const props = withDefaults(defineProps<{ color?: MedallionColor; got?: boolean; size?: number }>(), { color: 'orange', got: true, size: 16 })
const pal = computed(() => MEDALLION_PAINT[props.color] ?? MEDALLION_PAINT.orange)
const id = computed(() => `md-${props.color}-${props.got ? 1 : 0}`)
</script>

<template>
  <svg class="medallion-icon" :class="{ got }" viewBox="0 0 24 24" :width="size" :height="size" aria-hidden="true">
    <defs>
      <linearGradient :id="id + 'r'" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="pal.lit" />
        <stop offset="1" :stop-color="pal.deep" />
      </linearGradient>
      <radialGradient :id="id + 'f'" cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" :stop-color="pal.lit" />
        <stop offset="0.45" :stop-color="pal.face" />
        <stop offset="1" :stop-color="pal.deep" />
      </radialGradient>
    </defs>
    <template v-if="got">
      <circle cx="12" cy="12" r="11" :fill="`url(#${id}r)`" stroke="#1c1228" stroke-width="1.2" />
      <circle cx="12" cy="12" r="8.4" :fill="`url(#${id}f)`" />
      <path d="M12 6.6l1.5 3.2 3.4.4-2.5 2.3.7 3.4-3.1-1.7-3.1 1.7.7-3.4-2.5-2.3 3.4-.4z" fill="rgba(255,255,255,.88)" />
    </template>
    <template v-else>
      <!-- The empty facet: a dark inset socket with a faint ghost of the star. -->
      <circle cx="12" cy="12" r="11" fill="#3b3a44" stroke="#15131c" stroke-width="1.2" />
      <circle cx="12" cy="12" r="8.4" fill="#262530" stroke="rgba(255,255,255,.12)" stroke-width=".8" />
      <path d="M12 6.6l1.5 3.2 3.4.4-2.5 2.3.7 3.4-3.1-1.7-3.1 1.7.7-3.4-2.5-2.3 3.4-.4z" fill="rgba(255,255,255,.12)" />
    </template>
  </svg>
</template>

<style scoped>
.medallion-icon { display: block; flex: none; }
</style>
