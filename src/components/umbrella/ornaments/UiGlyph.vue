<script setup lang="ts">
/**
 * A menu / HUD glyph. The themed builds (lantern, clay) draw it as a crafted SVG icon in the
 * button's colour, with a soft cut-paper / clay-relief shadow; the plain UI keeps its text glyph
 * (`fallback`) exactly as before.
 */
import { useUiTheme } from '@/umbrella/ui/theme'

defineProps<{
  name: 'prev' | 'next' | 'restart' | 'pause' | 'play' | 'globe' | 'sound' | 'mute' | 'close' | 'gear' | 'film' | 'star' | 'edit' | 'grid' | 'list' | 'check' | 'warn' | 'umbrella'
  /** The text glyph of the plain UI. */
  fallback: string
}>()
const theme = useUiTheme()
/** An eight-toothed cog round (12, 12). */
const GEAR = (() => {
  const pt = (deg: number, r: number) => `${(12 + Math.cos((deg * Math.PI) / 180) * r).toFixed(2)} ${(12 + Math.sin((deg * Math.PI) / 180) * r).toFixed(2)}`
  const d: string[] = []
  for (let k = 0; k < 8; k++) {
    const a = k * 45
    d.push(`${k ? 'L' : 'M'}${pt(a - 15, 6.9)}`, `L${pt(a - 8, 9.4)}`, `L${pt(a + 8, 9.4)}`, `L${pt(a + 15, 6.9)}`)
  }
  return `${d.join('')}Z`
})()
</script>

<template>
  <svg v-if="theme" class="ui-glyph" :class="`g-${name}`" viewBox="0 0 24 24" aria-hidden="true">
    <g class="ui-glyph-art">
      <path v-if="name === 'prev'" d="M14.5 5.5 8 12l6.5 6.5" />
      <path v-else-if="name === 'next'" d="M9.5 5.5 16 12l-6.5 6.5" />
      <template v-else-if="name === 'restart'">
        <path d="M18.6 13.4A6.8 6.8 0 1 1 16.4 6.8" />
        <path class="fill" d="M19.6 3.6v6.2h-6.2z" />
      </template>
      <template v-else-if="name === 'pause'">
        <rect class="fill" x="6.2" y="5" width="4.2" height="14" rx="1.6" />
        <rect class="fill" x="13.6" y="5" width="4.2" height="14" rx="1.6" />
      </template>
      <path v-else-if="name === 'play'" class="fill" d="M8 5.2v13.6a1.1 1.1 0 0 0 1.7.92l10.3-6.8a1.1 1.1 0 0 0 0-1.84L9.7 4.28A1.1 1.1 0 0 0 8 5.2z" />
      <template v-else-if="name === 'globe'">
        <circle cx="12" cy="12" r="8.6" />
        <ellipse cx="12" cy="12" rx="3.7" ry="8.6" />
        <path d="M3.6 12h16.8M5.2 7.6h13.6M5.2 16.4h13.6" class="thin" />
      </template>
      <template v-else-if="name === 'sound' || name === 'mute'">
        <path class="fill" d="M3.6 9.4h3.6l4.9-4.1c.6-.5 1.5-.1 1.5.7v12c0 .8-.9 1.2-1.5.7l-4.9-4.1H3.6a.8.8 0 0 1-.8-.8V10.2c0-.4.4-.8.8-.8z" />
        <template v-if="name === 'sound'">
          <path d="M16.4 9.2a4 4 0 0 1 0 5.6" />
          <path d="M18.9 6.6a7.6 7.6 0 0 1 0 10.8" />
        </template>
        <path v-else d="M16.4 9.4l4.8 5.2M21.2 9.4l-4.8 5.2" />
      </template>
      <path v-else-if="name === 'close'" d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
      <template v-else-if="name === 'gear'">
        <path :d="GEAR" class="cog" />
        <circle cx="12" cy="12" r="2.9" />
      </template>
      <template v-else-if="name === 'film'">
        <rect x="3.8" y="9.4" width="16.4" height="10.4" rx="1.6" />
        <path d="M3.6 9.2 19 5.4l.8 3.1" />
        <path class="thin" d="M7.6 8.3l2.2 2.6M11.6 7.3l2.2 2.6M15.6 6.3l2.2 2.6" />
        <path class="fill" d="M10.4 12.4v4.6l3.9-2.3z" />
      </template>
      <path v-else-if="name === 'star'" class="fill" d="M12 2.9l2.7 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.6l-5.5 3 1.2-6.1-4.5-4.2 6.1-.8z" />
      <template v-else-if="name === 'edit'">
        <path d="M5 19l1.1-4.2 9.6-9.6a2 2 0 0 1 2.9 2.9l-9.6 9.6z" />
        <path class="thin" d="M14.2 6.8l2.9 2.9" />
      </template>
      <template v-else-if="name === 'grid'">
        <rect class="fill" x="4" y="4" width="7" height="7" rx="1.8" />
        <rect class="fill" x="13" y="4" width="7" height="7" rx="1.8" />
        <rect class="fill" x="4" y="13" width="7" height="7" rx="1.8" />
        <rect class="fill" x="13" y="13" width="7" height="7" rx="1.8" />
      </template>
      <template v-else-if="name === 'list'">
        <path d="M9 6.5h11M9 12h11M9 17.5h11" />
        <circle class="fill" cx="4.8" cy="6.5" r="1.6" />
        <circle class="fill" cx="4.8" cy="12" r="1.6" />
        <circle class="fill" cx="4.8" cy="17.5" r="1.6" />
      </template>
      <path v-else-if="name === 'check'" d="M5 12.6l4.4 4.4L19 7.4" />
      <template v-else-if="name === 'warn'">
        <path d="M12 3.8 21 19.4H3z" />
        <path d="M12 9.6v4.6" />
        <circle class="fill" cx="12" cy="16.9" r="1.2" />
      </template>
      <template v-else-if="name === 'umbrella'">
        <path class="fill" d="M2.6 12.4C2.6 7 6.8 3.2 12 3.2s9.4 3.8 9.4 9.2c-1.3-1.1-2.6-1.1-3.9 0-1.3-1.1-2.6-1.1-3.8 0-1.3-1.1-2.5-1.1-3.8 0-1.3-1.1-2.6-1.1-3.9 0z" />
        <path d="M12 12.4v6.2a2 2 0 0 1-4 0" />
      </template>
    </g>
  </svg>
  <template v-else>{{ fallback }}</template>
</template>

<style scoped>
.ui-glyph {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -0.14em;
  overflow: visible;
  /* A relief edge under the stroke: a cut-paper shadow on the lantern, pressed clay on the clay. */
  filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.35));
}
.ui-glyph-art {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ui-glyph .fill { fill: currentColor; stroke: none; }
.ui-glyph .thin { stroke-width: 1.6; }
.ui-glyph .cog { stroke-width: 2.1; }
</style>
