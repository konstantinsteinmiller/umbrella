<script setup lang="ts">
/**
 * A hanging paper lantern (chōchin) of the lantern theme: the painted lantern (lit vermilion washi,
 * tomoe crest, gold caps, cord and tassel — bundled, no external request) swaying on its cord, a warm
 * glow breathing behind it. Its width comes from the caller; the height follows the painting
 * (181 × 384), so keep it under ~190 CSS px tall to stay crisp. Decorative only.
 */
import lanternUrl from '@/assets/umbrella-ui/hanging-lantern.webp'
</script>

<template>
  <span class="hl u-loop" aria-hidden="true">
    <i class="hl-glow u-loop" />
    <img class="hl-img" :src="lanternUrl" alt="" width="181" height="384" draggable="false" />
  </span>
</template>

<style scoped>
.hl {
  position: relative;
  display: block;
  aspect-ratio: 181 / 384;
  transform-origin: 50% 0;
  animation: u-swing 3.8s ease-in-out infinite;
}
/* The light through the washi, breathing behind the painted body. */
.hl-glow {
  position: absolute;
  left: -70%;
  right: -70%;
  top: 8%;
  bottom: 8%;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 198, 110, 0.75) 0%, rgba(255, 150, 60, 0.32) 45%, rgba(255, 138, 60, 0) 100%);
  animation: u-breathe 2.8s ease-in-out infinite;
  pointer-events: none;
}
.hl-img { position: relative; display: block; width: 100%; height: auto; user-select: none; -webkit-user-drag: none; }
</style>
