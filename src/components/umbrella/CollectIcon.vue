<script setup lang="ts">
/**
 * A level's collectible as a small icon: the golden umbrella, star or cloud the level actually uses
 * (levels.ts CollectShape). The HUD's collectible badge and the level grid's counter draw the same one.
 */
withDefaults(defineProps<{ shape?: string; size?: number }>(), { shape: 'umbrella', size: 20 })
</script>

<template>
  <svg class="collect-icon" viewBox="0 0 24 24" :width="size" :height="size" aria-hidden="true">
    <path v-if="shape === 'star'" d="M12 2.5l2.9 6.2 6.7.8-5 4.6 1.4 6.7L12 17.4l-6 3.4 1.4-6.7-5-4.6 6.7-.8z" />
    <template v-else-if="shape === 'cloud'">
      <path d="M6.5 19a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.5 9a5 5 0 0 1 .5 10z" />
    </template>
    <template v-else>
      <path d="M2.5 12.5C2.5 7 6.7 3 12 3s9.5 4 9.5 9.5c-1.3-1.2-2.6-1.2-3.9 0-1.3-1.2-2.6-1.2-3.8 0-1.3-1.2-2.5-1.2-3.8 0-1.3-1.2-2.6-1.2-3.9 0z" />
      <path d="M11 12.5h2V19a2.6 2.6 0 0 1-5.2 0h1.8a.8.8 0 0 0 1.6 0z" />
    </template>
  </svg>
</template>
