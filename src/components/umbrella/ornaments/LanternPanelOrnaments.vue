<script setup lang="ts">
/**
 * The lantern build's panel dressing ("Paper Moon"), laid over a `u-panel` sheet:
 *  · four folded corners — a lacquer-red paper fold in two facets over a washi under-layer, a gold
 *    shippo rivet on the crease and gold-leaf kumo (cloud) scrolls running out along both edges;
 *  · the Paper Moon crest on the top edge — a crescent in a lacquer roundel ringed with gold beads,
 *    cloud-scroll wings, a breathing glow behind it (`crest`);
 *  · two gold-capped vermilion tassels hanging under the bottom corners (`tassels`), swaying;
 *  · a double gold rule inset along the sheet.
 * All vector, sized in px so it stays crisp from a 320 px phone to a desktop.
 */
import { useId } from 'vue'

withDefaults(defineProps<{ crest?: boolean; tassels?: boolean }>(), { crest: true, tassels: true })

const uid = `lpo${useId().replace(/[^\w-]/g, '')}`
/** A semicircle spiral of gold leaf curling up off the top edge, its tail running out along it. */
const KUMO = 'M50 3.5C54 3.5 55.5 9.5 61.2 9.5a1.2 1.2 0 0 1 2.4 0a2 2 0 0 1 -4 0a2.8 2.8 0 0 1 5.6 0a3.6 3.6 0 0 1 -7.2 0a4.4 4.4 0 0 1 8.8 0C66.8 12.5 70 6.5 80 6.2'
const KUMO2 = 'M64 18.5a1 1 0 0 1 2 0a1.8 1.8 0 0 1 -3.6 0a2.6 2.6 0 0 1 5.2 0C67.6 21 71 16.6 76 16.8'
/** The crest's right wing (the left one is its mirror). */
const WING = 'M127 31H137a7 7 0 0 1 14 0a5.6 5.6 0 0 1 -11.2 0a4.2 4.2 0 0 1 8.4 0a2.8 2.8 0 0 1 -5.6 0a1.4 1.4 0 0 1 2.8 0'
const WING_TAIL = 'M151 31C154 38.5 165 40 171 34.5a3 3 0 0 1 6 0a2 2 0 0 1 -4 0M177 34.5C181 34.6 185 32.8 191 33'
const SPARK = 'M0 -2.6L.6 -.6 2.6 0 .6 .6 0 2.6 -.6 .6 -2.6 0 -.6 -.6Z'
const BEADS = Array.from({ length: 16 }, (_, k) => {
  const a = (k / 16) * Math.PI * 2
  return { x: +(100 + Math.cos(a) * 23.6).toFixed(2), y: +(31 + Math.sin(a) * 23.6).toFixed(2) }
})
const CORNERS = ['tl', 'tr', 'bl', 'br'] as const
</script>

<template>
  <div class="lpo" aria-hidden="true">
    <svg class="lpo-defs" width="0" height="0">
      <defs>
        <linearGradient :id="`${uid}g`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff3c8" />
          <stop offset="0.28" stop-color="#f2c461" />
          <stop offset="0.6" stop-color="#b47a24" />
          <stop offset="0.8" stop-color="#f7d886" />
          <stop offset="1" stop-color="#a86d1d" />
        </linearGradient>
        <radialGradient :id="`${uid}gr`" cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stop-color="#fff6d4" />
          <stop offset="0.45" stop-color="#ecbd58" />
          <stop offset="1" stop-color="#9a641b" />
        </radialGradient>
        <linearGradient :id="`${uid}v`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f4805a" />
          <stop offset="1" stop-color="#b52e1d" />
        </linearGradient>
        <radialGradient :id="`${uid}n`" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stop-color="#3a3180" />
          <stop offset="1" stop-color="#15112e" />
        </radialGradient>
        <radialGradient :id="`${uid}glow`">
          <stop offset="0" stop-color="#ffcf7a" stop-opacity="0.85" />
          <stop offset="1" stop-color="#ff9a3c" stop-opacity="0" />
        </radialGradient>
        <mask :id="`${uid}moon`">
          <rect x="70" y="0" width="60" height="62" fill="#fff" />
          <circle cx="104.6" cy="27.4" r="8.4" fill="#000" />
        </mask>
      </defs>
    </svg>

    <i class="lpo-rule" />

    <svg v-for="c in CORNERS" :key="c" class="lpo-corner" :class="c" viewBox="0 0 80 80">
      <path d="M0 0H52L0 52Z" fill="#1a1030" opacity="0.3" transform="translate(2.5 3.5)" />
      <path d="M46 0H54L0 54V46Z" fill="#f3e4c4" />
      <path d="M54 0 0 54" stroke="#2a1d3a" stroke-width="1" fill="none" />
      <path d="M0 0H46L23 23Z" :fill="`url(#${uid}v)`" />
      <path d="M0 0 23 23 0 46Z" fill="#9b2318" />
      <path d="M3 0 23 20M0 3 20 23" stroke="#ffd0b0" stroke-width="0.6" opacity="0.35" fill="none" />
      <path d="M0 0 23 23" stroke="#4e0e0d" stroke-width="0.9" opacity="0.7" fill="none" />
      <path d="M46 0 0 46" :stroke="`url(#${uid}g)`" stroke-width="2.2" fill="none" />
      <g v-for="m in ['', 'matrix(0 1 1 0 0 0)']" :key="m" :transform="m || undefined" fill="none" stroke-linecap="round">
        <path :d="KUMO" stroke="#2a1d3a" stroke-opacity="0.5" stroke-width="3.6" transform="translate(.5 .9)" />
        <path :d="KUMO" :stroke="`url(#${uid}g)`" stroke-width="2.1" />
        <path :d="KUMO2" stroke="#2a1d3a" stroke-opacity="0.45" stroke-width="2.8" transform="translate(.4 .8)" />
        <path :d="KUMO2" :stroke="`url(#${uid}g)`" stroke-width="1.6" />
        <circle cx="78" cy="11" r="1.5" :fill="`url(#${uid}g)`" stroke="none" />
        <circle cx="72.5" cy="22.5" r="1.1" :fill="`url(#${uid}g)`" stroke="none" />
      </g>
      <g transform="translate(13 13)">
        <circle r="8.4" fill="#2a1d3a" opacity="0.45" transform="translate(.6 1)" />
        <circle r="8" :fill="`url(#${uid}gr)`" stroke="#2a1d3a" stroke-width="0.9" />
        <circle r="5.7" fill="none" stroke="#7e1a17" stroke-width="0.9" />
        <path d="M0 -5.7A8 8 0 0 0 0 5.7A8 8 0 0 0 0 -5.7ZM-5.7 0A8 8 0 0 0 5.7 0A8 8 0 0 0 -5.7 0Z" fill="none" stroke="#7e1a17" stroke-width="0.9" />
        <circle r="1.4" fill="#7e1a17" />
        <ellipse cx="-3" cy="-3.6" rx="2.6" ry="1.3" fill="#fff" opacity="0.55" transform="rotate(-35 -3 -3.6)" />
      </g>
    </svg>

    <svg v-if="crest" class="lpo-crest" viewBox="0 0 200 64">
      <circle class="lpo-glow u-loop" cx="100" cy="31" r="36" :fill="`url(#${uid}glow)`" />
      <g v-for="m in ['', 'matrix(-1 0 0 1 200 0)']" :key="m" :transform="m || undefined" fill="none" stroke-linecap="round">
        <path :d="WING" stroke="#2a1d3a" stroke-opacity="0.55" stroke-width="3.8" transform="translate(.5 1)" />
        <path :d="WING" :stroke="`url(#${uid}g)`" stroke-width="2.2" />
        <path :d="WING_TAIL" stroke="#2a1d3a" stroke-opacity="0.5" stroke-width="3.2" transform="translate(.5 1)" />
        <path :d="WING_TAIL" :stroke="`url(#${uid}g)`" stroke-width="1.8" />
        <path d="M127 36H134" :stroke="`url(#${uid}g)`" stroke-width="1.2" />
        <circle cx="195" cy="33" r="1.7" :fill="`url(#${uid}g)`" stroke="none" />
        <circle cx="163" cy="24.5" r="1.2" :fill="`url(#${uid}g)`" stroke="none" />
        <circle cx="157" cy="20.5" r="0.8" :fill="`url(#${uid}g)`" stroke="none" />
      </g>
      <circle cx="100" cy="32.4" r="28" fill="#1a1030" opacity="0.4" />
      <circle cx="100" cy="31" r="27.6" fill="#2a1d3a" />
      <circle cx="100" cy="31" r="26.2" :fill="`url(#${uid}gr)`" />
      <circle cx="100" cy="31" r="21.4" fill="#7e1a17" stroke="#2a1d3a" stroke-width="0.9" />
      <circle v-for="(b, k) in BEADS" :key="k" :cx="b.x" :cy="b.y" r="0.95" fill="#ffe7a6" />
      <circle cx="100" cy="31" r="18.6" :fill="`url(#${uid}n)`" stroke="#e8b450" stroke-width="1.1" />
      <circle cx="100" cy="31" r="10" fill="#fbeec9" :mask="`url(#${uid}moon)`" />
      <path d="M93 25.5a8.6 8.6 0 0 0 3.6 13.2" stroke="#fff" stroke-opacity="0.5" stroke-width="1" fill="none" stroke-linecap="round" :mask="`url(#${uid}moon)`" />
      <path :d="SPARK" fill="#ffe7a6" transform="translate(110.5 39.5)" />
      <path :d="SPARK" fill="#ffe7a6" transform="translate(89 22) scale(.7)" />
      <path :d="SPARK" fill="#ffe7a6" transform="translate(113 22) scale(.55)" />
      <ellipse cx="90" cy="16" rx="6" ry="2.2" fill="#fff" opacity="0.45" transform="rotate(-30 90 16)" />
    </svg>

    <template v-if="tassels">
      <svg v-for="s in ['l', 'r']" :key="s" class="lpo-tassel u-loop" :class="s" viewBox="0 0 20 66">
        <path d="M10 0V12" stroke="#e8b450" stroke-width="1.8" />
        <path d="M10 0V12" stroke="#2a1d3a" stroke-width="0.6" stroke-dasharray="1.2 1.6" opacity="0.6" />
        <circle cx="10" cy="14.4" r="3.6" :fill="`url(#${uid}gr)`" stroke="#2a1d3a" stroke-width="0.8" />
        <path d="M5.4 19Q10 16.6 14.6 19L13.6 25H6.4Z" :fill="`url(#${uid}g)`" stroke="#2a1d3a" stroke-width="0.7" />
        <path d="M6.4 25H13.6L16.4 58.5Q10 62 3.6 58.5Z" :fill="`url(#${uid}v)`" stroke="#4e0e0d" stroke-width="0.7" />
        <path d="M8 27.5 6.2 58M10 27.5V60M12 27.5 13.8 58" stroke="#7e1a17" stroke-width="0.6" opacity="0.8" fill="none" />
        <path d="M9 27.5 8.4 59M11 27.5 11.6 59" stroke="#ffb69a" stroke-width="0.45" opacity="0.5" fill="none" />
        <rect x="6" y="28" width="8" height="2.6" rx="0.6" :fill="`url(#${uid}g)`" stroke="#2a1d3a" stroke-width="0.5" />
      </svg>
    </template>
  </div>
</template>

<style scoped>
.lpo { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
.lpo-defs { position: absolute; width: 0; height: 0; }
/* The inset double rule of gold leaf. */
.lpo-rule {
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(160, 106, 30, 0.7);
  border-radius: 2px;
  box-shadow: inset 0 0 0 3px rgba(255, 250, 235, 0.35), inset 0 0 0 4px rgba(160, 106, 30, 0.38);
}
.lpo-corner {
  position: absolute;
  width: clamp(52px, 13vw, 80px);
  height: clamp(52px, 13vw, 80px);
  overflow: visible;
  filter: drop-shadow(0 0 6px rgba(255, 180, 90, 0.25));
}
/* Over the lacquer frame's corner (the frame runs 12 px outside the sheet). */
.lpo-corner.tl { left: -12px; top: -12px; }
.lpo-corner.tr { right: -12px; top: -12px; transform: scaleX(-1); }
.lpo-corner.bl { left: -12px; bottom: -12px; transform: scaleY(-1); }
.lpo-corner.br { right: -12px; bottom: -12px; transform: scale(-1, -1); }
.lpo-crest {
  position: absolute;
  left: 50%;
  top: -12px;
  width: clamp(150px, 46vw, 200px);
  aspect-ratio: 200 / 64;
  transform: translate(-50%, -50%);
  overflow: visible;
}
.lpo-glow { animation: u-breathe 3.6s ease-in-out infinite; transform-origin: 100px 31px; }
.lpo-tassel {
  position: absolute;
  bottom: -64px;
  width: 20px;
  height: 66px;
  overflow: visible;
  transform-origin: 50% 0;
  animation: u-swing 3.4s ease-in-out infinite;
  filter: drop-shadow(0 3px 3px rgba(10, 5, 25, 0.45));
}
.lpo-tassel.l { left: 30px; }
.lpo-tassel.r { right: 30px; animation-delay: -1.7s; }
</style>
