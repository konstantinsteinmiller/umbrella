<script setup lang="ts">
/**
 * The umbrella button's picture: an umbrella, open or furled, in the button's colour. The button shows what a tap WILL do,
 * so it is given the NEXT state (`open`): a shut umbrella gets the open picture, an open one the furled picture. It pops in
 * whenever it changes.
 */
defineProps<{ open: boolean }>()
</script>

<template>
  <svg :key="String(open)" class="umb-icon" viewBox="0 0 48 64" aria-hidden="true" focusable="false">
    <!-- Each picture is nudged so the middle of its outline (the hook included) sits on the middle of the box. -->
    <g v-if="open" transform="translate(0 -0.6)">
      <path class="fill" d="M3 30 A21 21 0 0 1 45 30 Q39.5 25 34.5 30 Q29.2 25 24 30 Q18.8 25 13.5 30 Q8.5 25 3 30Z" />
      <path d="M24 30 V52 a4.2 4.2 0 0 1 -8.4 0" />
      <path class="rib" d="M24 10 V29 M13 17 L18 29 M35 17 L30 29" />
    </g>
    <g v-else transform="translate(1.95 0.4)">
      <path class="fill" d="M24 3 C28 11 29 24 26.5 40 L21.5 40 C19 24 20 11 24 3Z" />
      <path d="M24 40 V56 a4.2 4.2 0 0 1 -8.4 0" />
      <path class="rib" d="M24 6 C25.5 16 25.5 28 24.4 38" />
    </g>
  </svg>
</template>

<style scoped>
.umb-icon {
  display: block;
  width: 1em;
  height: 1em;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  animation: umb-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.umb-icon .fill { fill: currentColor; }
.umb-icon .rib { stroke-width: 1.6; opacity: 0.55; stroke: #000; }
@keyframes umb-pop { from { opacity: 0; transform: scale(0.6); } }
@media (prefers-reduced-motion: reduce) { .umb-icon { animation: none; } }
</style>
