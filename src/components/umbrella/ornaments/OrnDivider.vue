<script setup lang="ts">
/**
 * A title divider in the scene's theme: a gold-leaf rule with two kumo curls meeting at a lacquer
 * lozenge (lantern), or a rolled clay snake with a mustard ball and tomato beads (clay).
 * Nothing in the plain UI.
 */
import { useId } from 'vue'
import { useUiTheme } from '@/umbrella/ui/theme'

const theme = useUiTheme()
const uid = `od${useId().replace(/[^\w-]/g, '')}`
const CURL = 'M86 10H101a6 6 0 0 1 12 0a4.6 4.6 0 0 1 -9.2 0a3.2 3.2 0 0 1 6.4 0a1.8 1.8 0 0 1 -3.6 0'
const SNAKE = 'M22 10C48 4 72 15 100 10S152 4 178 10'
</script>

<template>
  <svg v-if="theme === 'lantern'" class="od" viewBox="0 0 240 20" aria-hidden="true">
    <defs>
      <linearGradient :id="`${uid}r`" x1="0" x2="1">
        <stop offset="0" stop-color="#e8b450" stop-opacity="0" />
        <stop offset="0.3" stop-color="#e8b450" />
        <stop offset="0.7" stop-color="#e8b450" />
        <stop offset="1" stop-color="#e8b450" stop-opacity="0" />
      </linearGradient>
      <linearGradient :id="`${uid}g`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff3c8" />
        <stop offset="0.5" stop-color="#e8b450" />
        <stop offset="1" stop-color="#9a641b" />
      </linearGradient>
    </defs>
    <path d="M4 10H88M152 10H236" :stroke="`url(#${uid}r)`" stroke-width="1.6" />
    <path d="M30 14H86M154 14H210" :stroke="`url(#${uid}r)`" stroke-width="0.8" />
    <g v-for="m in ['', 'matrix(-1 0 0 1 240 0)']" :key="m" :transform="m || undefined" fill="none" stroke-linecap="round">
      <path :d="CURL" stroke="#1a1030" stroke-opacity="0.45" stroke-width="3" transform="translate(.4 .8)" />
      <path :d="CURL" :stroke="`url(#${uid}g)`" stroke-width="1.7" />
    </g>
    <path d="M120 3.6 126.4 10 120 16.4 113.6 10Z" fill="#d6452c" stroke="#2a1d3a" stroke-width="0.9" />
    <path d="M120 6.4 123.6 10 120 13.6 116.4 10Z" fill="none" :stroke="`url(#${uid}g)`" stroke-width="1" />
    <circle cx="120" cy="10" r="1" fill="#ffe7a6" />
  </svg>
  <svg v-else-if="theme === 'clay'" class="od" viewBox="0 0 200 20" aria-hidden="true">
    <path :d="SNAKE" fill="none" stroke="#13284d" stroke-opacity="0.4" stroke-width="7" stroke-linecap="round" transform="translate(0 1.6)" />
    <path :d="SNAKE" fill="none" stroke="#2f5fa8" stroke-width="6" stroke-linecap="round" />
    <path :d="SNAKE" fill="none" stroke="#b9d0f4" stroke-opacity="0.75" stroke-width="1.5" stroke-linecap="round" transform="translate(-.4 -1.5)" />
    <circle v-for="x in [22, 178]" :key="x" :cx="x" cy="10" r="4.4" fill="#e0533d" stroke="#7a2014" stroke-opacity="0.5" stroke-width="0.8" />
    <circle v-for="x in [21, 177]" :key="'h' + x" :cx="x" cy="8.6" r="1.4" fill="#fff" opacity="0.6" />
    <circle cx="100" cy="11" r="7.2" fill="#13284d" opacity="0.3" />
    <circle cx="100" cy="10" r="7" fill="#f1b72f" stroke="#a9760a" stroke-width="0.9" />
    <path d="M96.6 12.4a4 4.4 0 0 1 6.8 -1.2M98.2 12.6a2 2.4 0 0 1 3.4 -.6" fill="none" stroke="#7d5806" stroke-opacity="0.45" stroke-width="0.7" stroke-linecap="round" />
    <ellipse cx="97.4" cy="7.2" rx="2.4" ry="1.3" fill="#fff" opacity="0.7" transform="rotate(-25 97.4 7.2)" />
  </svg>
</template>

<style scoped>
.od { display: block; width: min(240px, 80%); height: auto; margin: 0 auto; overflow: visible; }
</style>
