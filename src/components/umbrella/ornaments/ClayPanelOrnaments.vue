<script setup lang="ts">
/**
 * The clay build's panel dressing ("Rainy Day Post"), modelled in plasticine like the game's clay art:
 *  · a thick rolled-clay coil round the slab's edge — postal-blue, a satin sheen along its ridge, a
 *    soft shadow under it, and a slight hand-modelled wobble (a displacement filter) so it never
 *    reads as a ruled line;
 *  · four little clay pieces from the rainy town pressed onto the corners: a raindrop, a letter, a
 *    pair of slate roof tiles and an autumn leaf;
 *  · on the top edge (`crest`) the game's own collectible — a wavy-edged mustard clay stamp with the
 *    umbrella pressed into it;
 *  · drops of rain gathering on the bottom coil and dripping off (`drops`).
 * All vector, sized in px, crisp at every size. No textile motifs (rope, thread, stitches).
 */
import { useId } from 'vue'

withDefaults(defineProps<{ crest?: boolean; drops?: boolean }>(), { crest: true, drops: true })

const uid = `cpo${useId().replace(/[^\w-]/g, '')}`
/** A wavy clay edge round a 56 × 44 stamp: soft bumps, like the collectible's. */
const STAMP = (() => {
  const W = 56
  const H = 44
  const b = 2.6
  const edge = (x0: number, y0: number, x1: number, y1: number, n: number, nx: number, ny: number) => {
    let d = ''
    for (let i = 0; i < n; i++) {
      const ax = x0 + ((x1 - x0) * (i + 0.5)) / n
      const ay = y0 + ((y1 - y0) * (i + 0.5)) / n
      const ex = x0 + ((x1 - x0) * (i + 1)) / n
      const ey = y0 + ((y1 - y0) * (i + 1)) / n
      d += `Q${(ax + nx * b * 2).toFixed(2)} ${(ay + ny * b * 2).toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`
    }
    return d
  }
  return `M0 0${edge(0, 0, W, 0, 8, 0, -1)}${edge(W, 0, W, H, 6, 1, 0)}${edge(W, H, 0, H, 8, 0, 1)}${edge(0, H, 0, 0, 6, -1, 0)}Z`
})()
const DROP = 'M7 1C7 1 1.2 9.6 1.2 14.2a5.8 5.8 0 0 0 11.6 0C12.8 9.6 7 1 7 1Z'
const LEAF = 'M4 30C3 20 8 9 19 4c4 -2 9 -2 13 -1c-1 4 -3 8 -6 12c-5 7 -12 12 -22 15Z'
</script>

<template>
  <div class="cpo" aria-hidden="true">
    <svg class="cpo-defs" width="0" height="0">
      <defs>
        <filter :id="`${uid}wob`" x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <radialGradient :id="`${uid}sheen`" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#fff" stop-opacity="0.75" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
        <radialGradient :id="`${uid}drop`" cx="0.4" cy="0.42" r="0.7">
          <stop offset="0" stop-color="#eef5ff" />
          <stop offset="0.5" stop-color="#9fc0ee" />
          <stop offset="1" stop-color="#4672b8" />
        </radialGradient>
        <radialGradient :id="`${uid}cream`" cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stop-color="#fffdf5" />
          <stop offset="0.6" stop-color="#f1e6cf" />
          <stop offset="1" stop-color="#d6c5a2" />
        </radialGradient>
        <radialGradient :id="`${uid}tomato`" cx="0.36" cy="0.3" r="0.75">
          <stop offset="0" stop-color="#ffa48e" />
          <stop offset="0.55" stop-color="#e0533d" />
          <stop offset="1" stop-color="#a3301f" />
        </radialGradient>
        <radialGradient :id="`${uid}slate`" cx="0.4" cy="0.25" r="0.85">
          <stop offset="0" stop-color="#8e99aa" />
          <stop offset="0.55" stop-color="#5f6a7b" />
          <stop offset="1" stop-color="#3f4857" />
        </radialGradient>
        <radialGradient :id="`${uid}leaf`" cx="0.35" cy="0.35" r="0.8">
          <stop offset="0" stop-color="#ffc277" />
          <stop offset="0.55" stop-color="#e8862e" />
          <stop offset="1" stop-color="#b0561a" />
        </radialGradient>
        <radialGradient :id="`${uid}must`" cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stop-color="#ffe9a8" />
          <stop offset="0.55" stop-color="#f1b72f" />
          <stop offset="1" stop-color="#b98510" />
        </radialGradient>
        <linearGradient :id="`${uid}rain`" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="#eaf3ff" stop-opacity="0.95" />
          <stop offset="1" stop-color="#7fa8e6" stop-opacity="0.85" />
        </linearGradient>
      </defs>
    </svg>

    <!-- The rolled coil: its shadow, a darker underside, the body, a satin band, a sheen on the ridge. -->
    <svg class="cpo-coil">
      <g :filter="`url(#${uid}wob)`">
        <rect class="c-shadow" width="100%" height="100%" rx="26" />
        <rect class="c-under" width="100%" height="100%" rx="26" />
        <rect class="c-body" width="100%" height="100%" rx="26" />
        <rect class="c-satin" width="100%" height="100%" rx="26" />
        <rect class="c-sheen" width="100%" height="100%" rx="26" />
      </g>
    </svg>

    <!-- A raindrop of glassy blue clay. -->
    <svg class="cpo-piece tl" viewBox="0 0 30 40">
      <path d="M15 3C15 3 4 18 4 26a11 11 0 0 0 22 0C26 18 15 3 15 3Z" fill="#0f2346" opacity="0.3" transform="translate(1 2.5)" />
      <path d="M15 3C15 3 4 18 4 26a11 11 0 0 0 22 0C26 18 15 3 15 3Z" :fill="`url(#${uid}drop)`" stroke="#24467f" stroke-width="1.1" />
      <ellipse cx="10.6" cy="24" rx="3" ry="6" :fill="`url(#${uid}sheen)`" transform="rotate(18 10.6 24)" />
      <ellipse cx="19" cy="32" rx="3.4" ry="1.6" fill="#1d3f78" opacity="0.18" />
    </svg>
    <!-- A letter: a cream clay envelope with its flap pressed in and a tomato seal. -->
    <svg class="cpo-piece tr" viewBox="0 0 42 32">
      <rect x="3" y="5.5" width="36" height="24" rx="5" fill="#2a2418" opacity="0.28" transform="translate(1 2.4)" />
      <rect x="3" y="5.5" width="36" height="24" rx="5" :fill="`url(#${uid}cream)`" stroke="#8d7653" stroke-width="1" />
      <path d="M5.5 8.5Q21 22 36.5 8.5" fill="none" stroke="#a88f68" stroke-width="1.6" stroke-linecap="round" opacity="0.7" />
      <path d="M5.5 9.6Q21 23 36.5 9.6" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity="0.7" />
      <path d="M5.5 27.5 16 19M36.5 27.5 26 19" fill="none" stroke="#b9a37c" stroke-width="1.1" stroke-linecap="round" opacity="0.6" />
      <circle cx="21" cy="18.2" r="5.2" :fill="`url(#${uid}tomato)`" stroke="#7a2014" stroke-width="0.8" />
      <path d="M18.6 18.6a2.6 2.6 0 0 1 4.8 -1.2" fill="none" stroke="#7a2014" stroke-width="0.8" stroke-linecap="round" opacity="0.55" />
      <ellipse cx="19.4" cy="16.4" rx="1.8" ry="1" :fill="`url(#${uid}sheen)`" />
      <ellipse cx="12" cy="10.5" rx="6" ry="2" :fill="`url(#${uid}sheen)`" opacity="0.8" />
    </svg>
    <!-- Two slate roof tiles, overlapping, rounded at the foot. -->
    <svg class="cpo-piece bl" viewBox="0 0 40 36">
      <path d="M4 8h15v18a7.5 7.5 0 0 1 -15 0Z" fill="#141a26" opacity="0.3" transform="translate(1 2.5)" />
      <path d="M17 6h16v20a8 8 0 0 1 -16 0Z" fill="#141a26" opacity="0.3" transform="translate(1 2.5)" />
      <path d="M17 6h16v20a8 8 0 0 1 -16 0Z" :fill="`url(#${uid}slate)`" stroke="#2c3340" stroke-width="1" />
      <path d="M4 8h15v18a7.5 7.5 0 0 1 -15 0Z" :fill="`url(#${uid}slate)`" stroke="#2c3340" stroke-width="1" />
      <path d="M8 12v12M23 10v14" stroke="#2c3340" stroke-width="1" stroke-linecap="round" opacity="0.35" />
      <ellipse cx="9" cy="13" rx="2.6" ry="5" :fill="`url(#${uid}sheen)`" opacity="0.6" />
      <ellipse cx="22.4" cy="11" rx="2.6" ry="5" :fill="`url(#${uid}sheen)`" opacity="0.6" />
      <ellipse cx="14" cy="28" rx="1.4" ry="1" fill="#cfe0ff" opacity="0.8" />
    </svg>
    <!-- An autumn leaf blown onto the corner, its veins pressed in with a tool. -->
    <svg class="cpo-piece br" viewBox="0 0 36 34">
      <path :d="LEAF" fill="#2a1406" opacity="0.28" transform="translate(1 2.5)" />
      <path :d="LEAF" :fill="`url(#${uid}leaf)`" stroke="#7a3a10" stroke-width="1" />
      <path d="M4 30C12 22 20 14 30 5" fill="none" stroke="#8c4512" stroke-width="1.2" stroke-linecap="round" opacity="0.6" />
      <path d="M11 22l-1 -7M16 17l-1 -7M21 12l0 -5M12 21l6 1M17 16l6 0M22 11l5 -1" fill="none" stroke="#8c4512" stroke-width="0.8" stroke-linecap="round" opacity="0.45" />
      <path d="M5 30C13 22.4 21 14.6 30.6 5.8" fill="none" stroke="#ffd9a4" stroke-width="0.6" stroke-linecap="round" opacity="0.6" transform="translate(-.4 -.8)" />
      <ellipse cx="16" cy="11" rx="5" ry="2.2" :fill="`url(#${uid}sheen)`" opacity="0.7" transform="rotate(-38 16 11)" />
    </svg>

    <!-- The collectible: a wavy-edged mustard clay stamp with the umbrella pressed into it. -->
    <svg v-if="crest" class="cpo-stamp" viewBox="-8 -8 72 60">
      <path :d="STAMP" fill="#3a2a06" opacity="0.32" transform="translate(1.2 3)" />
      <path :d="STAMP" :fill="`url(#${uid}must)`" stroke="#8a5f08" stroke-width="1.2" stroke-linejoin="round" />
      <rect x="7" y="7" width="42" height="30" rx="4" fill="none" stroke="#a87708" stroke-width="1.6" opacity="0.6" />
      <rect x="7" y="8.2" width="42" height="30" rx="4" fill="none" stroke="#fff3c4" stroke-width="1" opacity="0.6" />
      <g transform="translate(16 9.6)">
        <path d="M2.6 12.4C2.6 7 6.8 3.2 12 3.2s9.4 3.8 9.4 9.2c-1.3-1.1-2.6-1.1-3.9 0-1.3-1.1-2.6-1.1-3.8 0-1.3-1.1-2.5-1.1-3.8 0-1.3-1.1-2.6-1.1-3.9 0z" fill="#fff3c4" opacity="0.7" transform="translate(.5 1)" />
        <path d="M2.6 12.4C2.6 7 6.8 3.2 12 3.2s9.4 3.8 9.4 9.2c-1.3-1.1-2.6-1.1-3.9 0-1.3-1.1-2.6-1.1-3.8 0-1.3-1.1-2.5-1.1-3.8 0-1.3-1.1-2.6-1.1-3.9 0z" fill="#b07d0c" />
        <path d="M12 12.4v6.4a2.1 2.1 0 0 1-4.2 0" fill="none" stroke="#fff3c4" stroke-width="1.8" stroke-linecap="round" opacity="0.7" transform="translate(.4 .9)" />
        <path d="M12 12.4v6.4a2.1 2.1 0 0 1-4.2 0" fill="none" stroke="#9a6b08" stroke-width="1.6" stroke-linecap="round" />
      </g>
      <ellipse cx="14" cy="5" rx="12" ry="3.2" :fill="`url(#${uid}sheen)`" opacity="0.7" />
    </svg>

    <template v-if="drops">
      <svg v-for="d in ['a', 'b', 'c']" :key="d" class="cpo-drop u-loop" :class="d" viewBox="0 0 14 21">
        <path :d="DROP" :fill="`url(#${uid}rain)`" stroke="#24467f" stroke-opacity="0.55" stroke-width="0.8" />
        <ellipse cx="5" cy="13" rx="1.4" ry="2.6" fill="#fff" opacity="0.85" transform="rotate(18 5 13)" />
      </svg>
    </template>
  </div>
</template>

<style scoped>
.cpo { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
.cpo-defs { position: absolute; width: 0; height: 0; }
.cpo-coil { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.cpo-coil rect { fill: none; }
.c-shadow { stroke: #0e2244; stroke-opacity: 0.45; stroke-width: 18; transform: translate(1px, 3.6px); }
.c-under { stroke: #1b3d75; stroke-width: 16; transform: translateY(0.8px); }
.c-body { stroke: #2f5fa8; stroke-width: 13; }
.c-satin { stroke: #5d88cf; stroke-opacity: 0.85; stroke-width: 6.5; transform: translate(-0.8px, -1.8px); }
.c-sheen { stroke: #dbe8fb; stroke-opacity: 0.55; stroke-width: 2.2; transform: translate(-1.4px, -3.2px); }
.cpo-piece { position: absolute; overflow: visible; }
.cpo-piece.tl { left: -15px; top: -24px; width: 36px; height: 48px; transform: rotate(-14deg); }
.cpo-piece.tr { right: -20px; top: -18px; width: 56px; height: 43px; transform: rotate(12deg); }
.cpo-piece.bl { left: -18px; bottom: -18px; width: 50px; height: 45px; transform: rotate(-8deg); }
.cpo-piece.br { right: -18px; bottom: -18px; width: 48px; height: 45px; transform: rotate(6deg); }
@media (max-width: 560px) {
  .cpo-piece.tl { width: 30px; height: 40px; left: -12px; top: -20px; }
  .cpo-piece.tr { width: 46px; height: 35px; right: -14px; top: -14px; }
  .cpo-piece.bl { width: 42px; height: 38px; left: -14px; bottom: -15px; }
  .cpo-piece.br { width: 40px; height: 38px; right: -14px; bottom: -15px; }
}
.cpo-stamp {
  position: absolute;
  left: 50%;
  top: -34px;
  width: 72px;
  height: 60px;
  transform: translateX(-50%) rotate(-5deg);
  overflow: visible;
}
.cpo-drop {
  position: absolute;
  bottom: -18px;
  width: 12px;
  height: 18px;
  transform-origin: 50% 0;
  animation: cpo-drip 4.6s cubic-bezier(0.5, 0, 0.7, 0.4) infinite;
}
.cpo-drop.a { left: 22%; }
.cpo-drop.b { left: 61%; width: 9px; height: 14px; animation-delay: -1.7s; }
.cpo-drop.c { left: 83%; animation-delay: -3.1s; }
/* A drop swells on the coil, stretches, lets go and falls away. */
@keyframes cpo-drip {
  0% { opacity: 0; transform: translateY(-8px) scale(0.2); }
  25% { opacity: 1; transform: translateY(-4px) scale(0.8); }
  62% { opacity: 1; transform: translateY(0) scale(1, 1.18); }
  70% { opacity: 1; transform: translateY(6px) scale(0.92, 1.1); }
  92% { opacity: 0; transform: translateY(46px) scale(0.85, 1.2); }
  100% { opacity: 0; transform: translateY(46px); }
}
</style>
