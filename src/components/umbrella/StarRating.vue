<script setup lang="ts">
// The 1–3 star rating of a timed level (umbrella/timeStars.ts): three rounded, chunky stars, the
// middle one bigger and raised, gold with a dark outline and a shine when earned, a dark slot with
// a light rim when not. `pop` plays them in one by one (the scene times a sound to each: its
// RATING_FIRST_MS / RATING_STAR_GAP_MS match the delays below), each earned star with a burst.
import { computed } from 'vue'

const props = withDefaults(defineProps<{ stars: number; pop?: boolean; label?: string }>(), { pop: false, label: '' })

/** A five-point star in a 40 × 40 box, a touch fat so the round joins read as soft and cute. */
const STAR = (() => {
  const pts: string[] = []
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5
    const r = k % 2 ? 8.6 : 17
    pts.push(`${(20 + Math.cos(a) * r).toFixed(2)},${(21.5 + Math.sin(a) * r).toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
})()
let n = 0
const uid = `umbstar${(n = (n + 1) % 1e6)}${Math.random().toString(36).slice(2, 7)}`
const items = computed(() => [0, 1, 2].map((i) => ({ i, on: i < props.stars })))
</script>

<template>
  <span class="star-rating" :class="{ pop }" role="img" :aria-label="label">
    <span v-for="s in items" :key="s.i" class="star" :class="[`s${s.i}`, { on: s.on }]" :style="pop ? { animationDelay: `${260 + s.i * 280}ms` } : undefined">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <linearGradient :id="`${uid}g`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff4a3" />
            <stop offset="0.45" stop-color="#ffd23f" />
            <stop offset="1" stop-color="#f29a0c" />
          </linearGradient>
        </defs>
        <template v-if="s.on">
          <path :d="STAR" fill="#7a4300" stroke="#7a4300" stroke-width="6" stroke-linejoin="round" transform="translate(0 1.6)" />
          <path :d="STAR" :fill="`url(#${uid}g)`" stroke="#7a4300" stroke-width="3.2" stroke-linejoin="round" />
          <ellipse cx="14.5" cy="15" rx="4.2" ry="2.6" fill="#fff" opacity="0.85" transform="rotate(-28 14.5 15)" />
          <circle cx="24.5" cy="25.5" r="1.4" fill="#fff" opacity="0.5" />
        </template>
        <path v-else :d="STAR" fill="rgba(20, 24, 44, 0.72)" stroke="rgba(214, 224, 255, 0.55)" stroke-width="2.6" stroke-linejoin="round" />
      </svg>
      <span v-if="pop && s.on" class="burst" :style="{ animationDelay: `${260 + s.i * 280 + 120}ms` }">
        <i v-for="k in 8" :key="k" :style="{ '--a': `${k * 45}deg` }" />
      </span>
    </span>
  </span>
</template>

<style scoped>
.star-rating {
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  gap: 0.06em;
  line-height: 0;
}
.star { position: relative; display: inline-block; width: 1em; height: 1em; }
.star svg { width: 100%; height: 100%; overflow: visible; }
/* The middle star bigger and raised, the outer ones leaning out: an arc like a game's result screen. */
.star.s0 { transform: rotate(-14deg) translateY(0.08em); }
.star.s1 { width: 1.3em; height: 1.3em; transform: translateY(-0.12em); }
.star.s2 { transform: rotate(14deg) translateY(0.08em); }
.star.on svg { filter: drop-shadow(0 0.06em 0.08em rgba(0, 0, 0, 0.45)); }

/* ── pop: one by one, an overshooting bounce with a wobble; the earned ones burst ── */
.pop .star { animation: star-in 0.62s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
.pop .star:not(.on) { animation-name: star-slot; animation-duration: 0.4s; }
.pop .star.s1.on::after {
  content: '';
  position: absolute;
  inset: -45%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 236, 140, 0.85) 0%, rgba(255, 210, 60, 0.35) 35%, rgba(255, 200, 40, 0) 70%);
  animation: star-glow 0.9s ease-out both;
  animation-delay: inherit;
  z-index: -1;
}
@keyframes star-in {
  0% { opacity: 0; scale: 0.1; rotate: -50deg; }
  45% { opacity: 1; scale: 1.5; rotate: 10deg; }
  65% { scale: 0.86; rotate: -6deg; }
  82% { scale: 1.08; rotate: 2deg; }
  100% { opacity: 1; scale: 1; rotate: 0deg; }
}
@keyframes star-slot {
  0% { opacity: 0; scale: 0.6; }
  60% { opacity: 1; scale: 1.06; }
  100% { opacity: 1; scale: 1; }
}
@keyframes star-glow {
  0% { opacity: 0; transform: scale(0.3); }
  30% { opacity: 1; }
  100% { opacity: 0; transform: scale(1.4); }
}
.burst { position: absolute; inset: 0; pointer-events: none; }
.burst i {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.16em;
  height: 0.16em;
  margin: -0.08em;
  border-radius: 50%;
  background: #fff6b8;
  box-shadow: 0 0 0.12em #ffd23f;
  opacity: 0;
  animation: spark 0.6s ease-out both;
  animation-delay: inherit;
}
.burst i:nth-child(even) { width: 0.1em; height: 0.1em; background: #ffe066; }
@keyframes spark {
  0% { opacity: 1; transform: rotate(var(--a)) translateY(0) scale(1); }
  100% { opacity: 0; transform: rotate(var(--a)) translateY(-1.1em) scale(0.3); }
}
@media (prefers-reduced-motion: reduce) {
  .pop .star, .pop .star.s1.on::after, .burst i { animation-duration: 0.01s; }
}
</style>
