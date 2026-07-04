<script setup lang="ts">
/**
 * "Watch ad" movie icon — the single glyph every rewarded-ad affordance
 * shares (Instant Spawn, War Chest, 2× boss bounty, RALLY!). Renders the
 * shipped bitmap `public/images/icons/movie_128x96.webp` (4:3, so
 * `object-contain` letterboxes it inside the caller's square `w-N h-N`
 * utility box — same sizing convention as the other icon components).
 */
import { prependBaseUrl } from '@/utils/function'

const src = prependBaseUrl('images/icons/movie_128x96.webp')
</script>

<template lang="pug">
  img.object-contain.select-none(:src="src" alt="" draggable="false")
</template>
