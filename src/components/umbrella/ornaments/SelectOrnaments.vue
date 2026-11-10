<script setup lang="ts">
/**
 * A dropdown's knob in the scene's theme, laid over the right end of a native <select> (which
 * keeps its own accessible popup): a vermilion lacquer medallion ringed in gold with a gold
 * chevron.
 */
import { useId } from 'vue'
import { useUiTheme } from '@/umbrella/ui/theme'

const theme = useUiTheme()
const uid = `so${useId().replace(/[^\w-]/g, '')}`
</script>

<template>
  <svg v-if="theme === 'lantern'" class="so" viewBox="0 0 30 30" aria-hidden="true">
    <defs>
      <radialGradient :id="`${uid}v`" cx="0.38" cy="0.3" r="0.75">
        <stop offset="0" stop-color="#f6866a" />
        <stop offset="0.5" stop-color="#d6452c" />
        <stop offset="1" stop-color="#7e1a17" />
      </radialGradient>
      <linearGradient :id="`${uid}g`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff3c8" />
        <stop offset="0.5" stop-color="#e8b450" />
        <stop offset="1" stop-color="#9a641b" />
      </linearGradient>
    </defs>
    <circle cx="15" cy="16" r="12.6" fill="#120d2a" opacity="0.45" />
    <circle cx="15" cy="15" r="12.6" fill="#2a1d3a" />
    <circle cx="15" cy="15" r="11.6" :fill="`url(#${uid}g)`" />
    <circle cx="15" cy="15" r="9.2" :fill="`url(#${uid}v)`" stroke="#2a1d3a" stroke-width="0.8" />
    <circle v-for="k in 8" :key="k" :cx="15 + Math.cos((k * Math.PI) / 4) * 10.4" :cy="15 + Math.sin((k * Math.PI) / 4) * 10.4" r="0.6" fill="#7e1a17" />
    <path class="so-chev" d="M10.6 13.2 15 17.6l4.4-4.4" fill="none" stroke="#2a1d3a" stroke-opacity="0.6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 .8)" />
    <path class="so-chev" d="M10.6 13.2 15 17.6l4.4-4.4" fill="none" :stroke="`url(#${uid}g)`" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    <ellipse cx="11" cy="10" rx="3" ry="1.4" fill="#fff" opacity="0.45" transform="rotate(-30 11 10)" />
  </svg>
</template>

<style scoped>
.so {
  position: absolute;
  inset-inline-end: 7px;
  top: 50%;
  width: 30px;
  height: 30px;
  margin-top: -15px;
  pointer-events: none;
  overflow: visible;
  transition: transform 0.3s var(--u-ease-spring, ease);
}
</style>
