<script setup lang="ts">
/**
 * A menu button's inset ornaments in the lantern theme: gold-leaf kumo curls at both ends, unrolling
 * toward the label (they open a little on hover). The clay buttons need none: a smooth squashy pill with its gloss is the detail there. Nothing in the
 * plain UI. The button must be `position: relative` (`.u-btn` is).
 */
import { useId } from 'vue'
import { useUiTheme } from '@/umbrella/ui/theme'

const theme = useUiTheme()
const uid = `bo${useId().replace(/[^\w-]/g, '')}`
const CURL = 'M1.5 11H5a5.2 5.2 0 0 1 10.4 0a4 4 0 0 1 -8 0a2.9 2.9 0 0 1 5.8 0a1.8 1.8 0 0 1 -3.6 0a.8.8 0 0 1 1.6 0'
</script>

<template>
  <span v-if="theme === 'lantern'" class="bo bo-l" aria-hidden="true">
    <svg v-for="s in ['a', 'b']" :key="s" class="bo-curl" :class="s" viewBox="0 0 24 22">
      <defs v-if="s === 'a'">
        <linearGradient :id="`${uid}g`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff3c8" />
          <stop offset="0.45" stop-color="#e8b450" />
          <stop offset="1" stop-color="#a86d1d" />
        </linearGradient>
      </defs>
      <path :d="CURL" fill="none" stroke="#120d2a" stroke-opacity="0.55" stroke-width="2.6" stroke-linecap="round" transform="translate(.3 .7)" />
      <path :d="CURL" fill="none" :stroke="`url(#${uid}g)`" stroke-width="1.5" stroke-linecap="round" />
      <path d="M15.4 11C17.4 11 18.6 8.4 22.4 8.6M16 14.2c2 .8 4 .6 5.6 -.4" fill="none" :stroke="`url(#${uid}g)`" stroke-width="1.1" stroke-linecap="round" />
      <circle cx="21.6" cy="16.4" r="1" :fill="`url(#${uid}g)`" />
    </svg>
  </span>
</template>

<style scoped>
.bo { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.bo-curl {
  position: absolute;
  top: 50%;
  width: 22px;
  height: 20px;
  margin-top: -10px;
  overflow: visible;
  opacity: 0.95;
  transition: transform 0.45s var(--u-ease-spring, ease);
}
.bo-curl.a { left: 7px; }
.bo-curl.b { right: 7px; transform: scaleX(-1); }
:global(.u-btn:hover) > .bo .bo-curl.a { transform: translateX(-2px) rotate(-8deg); }
:global(.u-btn:hover) > .bo .bo-curl.b { transform: scaleX(-1) translateX(-2px) rotate(-8deg); }
</style>
