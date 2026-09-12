<script setup lang="ts">
/**
 * A bobbing "look here" arrow in the game's runic style: a gold triangle with a
 * dark outline like every button, an engraved inner edge, and — when it is big
 * enough to read — a carved Tiwaz rune (ᛏ, itself an arrow). No shaft, just the
 * head. Points DOWN by default (hovering over its target); `direction="up"`
 * flips it for a target above. Purely decorative: aria-hidden, no pointer events.
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** Width in px; the height follows the triangle (≈ 0.86×). */
  size?: number
  direction?: 'down' | 'up'
}>(), { size: 16, direction: 'down' })

// Unique gradient id per instance so several arrows never share <defs>.
const uid = `rha${(Math.random() * 1e9) | 0}`
const showRune = computed(() => props.size >= 22)
</script>

<template lang="pug">
  span.rune-hint-arrow.inline-block.pointer-events-none(
    aria-hidden="true"
    :class="{ 'rune-hint-arrow--up': direction === 'up' }"
    :style="{ width: size + 'px', height: size * 0.86 + 'px' }"
  )
    svg(viewBox="0 0 24 21" width="100%" height="100%" class="overflow-visible")
      defs
        linearGradient(:id="uid" x1="0" y1="0" x2="0" y2="1")
          stop(offset="0%" stop-color="#fff3a8")
          stop(offset="45%" stop-color="#ffd23c")
          stop(offset="100%" stop-color="#f09a00")
      path(d="M2 2.2 H22 L12 19 Z" :fill="'url(#' + uid + ')'" stroke="#0f1a30" stroke-width="2" stroke-linejoin="round")
      //- Engraved inner edge
      path(d="M6.4 4.6 H17.6 L12 13.9 Z" fill="none" stroke="#a15c00" stroke-width="0.9" stroke-linejoin="round" opacity="0.85")
      //- Carved ᛏ (Tiwaz)
      path(
        v-if="showRune"
        d="M12 6.2 V11.6 M10 8 L12 6.2 L14 8"
        fill="none" stroke="#7a4300" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"
      )
</template>

<style scoped lang="sass">
.rune-hint-arrow
  filter: drop-shadow(0 0 4px rgba(255, 210, 60, 0.9)) drop-shadow(0 2px 1px rgba(0, 0, 0, 0.5))
  animation: rune-hint-bob 0.75s ease-in-out infinite alternate
.rune-hint-arrow--up
  rotate: 180deg
@keyframes rune-hint-bob
  from
    transform: translateY(-3px)
  to
    transform: translateY(2px)
@media (prefers-reduced-motion: reduce)
  .rune-hint-arrow
    animation: none
</style>
