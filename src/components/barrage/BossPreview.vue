<script setup lang="ts">
/**
 * The next boss, before it comes: its head looming out of drifting smoke
 * beside "Boss in N" — the slot its HP bar takes once it arrives. A wordless
 * reason to play a few more rows: first-time players decide around the 30 s
 * mark, long before the first boss at row 10, and nothing on screen said one
 * was coming.
 *
 *   • The shape is the real boss art, blacked out and rim-lit — never revealed
 *     before it spawns (the boss bar's portrait is the reveal). Framed CLOSE on
 *     the face (`ZOOM`): a whole blacked-out body centred in a ring read as a
 *     blank profile picture, the slime tower above all.
 *   • Its eyes glow through the smoke, slanted, at their places in the art.
 *   • The smoke is thick far out and thins over the last rows (`--fog`), so
 *     the head sharpens as the fight nears.
 *   • The aura breathes slowly — a low, dangerous red; a little stronger and
 *     quicker for the last three rows. A corrupted (second lap) boss glows
 *     violet.
 *
 * Only transform / opacity animate (compositor work, no per-frame paint).
 * Decorative: the line beside it already says "Boss in N". Poki's playtest
 * recorder films canvases only, so `data-poki-stage-art` has the stage
 * (utils/pokiPlaytestStage.ts) paint it as a silhouette.
 */
import { computed } from 'vue'
import { bossSrc } from '@/barrage/art'
import { bossForRow } from '@/barrage/engine/monsters'
import type { BossKind } from '@/barrage/engine/types'

const props = defineProps<{
  /** The row the next boss spawns at (`nextBossRow`). */
  nextRow: number
  /** Rows until it comes (the "Boss in N" number, ≥ 1). */
  rowsLeft: number
  /** Edge of the (square) preview, px. */
  size: number
}>()

/** Each boss's eyes in its square art (fractions, measured off the art) and
 *  their slant in degrees — inner corners down, a scowl. The worm's third eye
 *  sits on its brow; the silver dragon shows one eye in profile. */
const EYES: Record<BossKind, readonly (readonly [x: number, y: number, tilt: number])[]> = {
  'slime-tower': [[0.397, 0.217, 14], [0.57, 0.217, -14]],
  worm: [[0.483, 0.208, 14], [0.63, 0.208, -14], [0.553, 0.108, 0]],
  'fire-dragon': [[0.343, 0.31, 14], [0.543, 0.31, -14]],
  'silver-dragon': [[0.45, 0.303, 10]],
  troll: [[0.423, 0.223, 14], [0.583, 0.223, -14]],
  orc: [[0.393, 0.378, 14], [0.603, 0.378, -14]]
}
/** The art is drawn at this multiple of the preview… */
const ZOOM = 1.5
/** …its face centre (a little below the eyes) placed here in the preview. */
const FACE_AT = { x: 0.5, y: 0.42 }
const FACE_BELOW_EYES = 0.06

const next = computed(() => bossForRow(props.nextRow))
/** Smoke density: 0.9 nine rows out, down to 0.4 on the last row. */
const fog = computed(() => Math.max(0.4, Math.min(0.9, 0.35 + props.rowsLeft * 0.06)))
const near = computed(() => props.rowsLeft <= 3)

/** Where the art and each eye go, in % of the preview. */
const frame = computed(() => {
  const eyes = EYES[next.value.bossKind]
  const fx = eyes.reduce((s, e) => s + e[0], 0) / eyes.length
  const fy = eyes.reduce((s, e) => s + e[1], 0) / eyes.length + FACE_BELOW_EYES
  const at = (v: number, face: number, to: number): string => `${((to + (v - face) * ZOOM) * 100).toFixed(2)}%`
  return {
    shape: { left: at(0, fx, FACE_AT.x), top: at(0, fy, FACE_AT.y), width: `${ZOOM * 100}%`, height: `${ZOOM * 100}%` },
    eyes: eyes.map(([x, y, tilt]) => ({ left: at(x, fx, FACE_AT.x), top: at(y, fy, FACE_AT.y), '--tilt': `${tilt}deg` }))
  }
})
</script>

<template lang="pug">
  div.boss-preview(
    :class="{ 'is-near': near, 'is-corrupted': next.corrupted }"
    :style="{ width: size + 'px', height: size + 'px', '--fog': fog }"
    aria-hidden="true"
    data-poki-stage-art="silhouette"
  )
    span.boss-preview__aura
    span.boss-preview__glass
      span.boss-preview__body
        img.boss-preview__shape(:key="next.bossKind" :src="bossSrc(next.bossKind)" :style="frame.shape" alt="" draggable="false")
      span.boss-preview__smoke.boss-preview__smoke--low
      span.boss-preview__smoke.boss-preview__smoke--mid
      span.boss-preview__smoke.boss-preview__smoke--high
      //- Over the smoke, breathing in step with the body beneath.
      span.boss-preview__body
        span.boss-preview__eye(v-for="(e, i) in frame.eyes" :key="next.bossKind + i" :style="e" data-poki-stage-glow)
</template>

<style scoped lang="sass">
.boss-preview
  // The aura's and the eyes' colours, as "r, g, b" (rgba() needs the channels).
  --aura: 255, 52, 40
  --eye: 255, 72, 40
  position: relative
  flex-shrink: 0
  pointer-events: none
  &.is-corrupted
    --aura: 178, 77, 255
    --eye: 214, 130, 255

// A soft glow behind the glass that breathes: opacity + scale only.
// `closest-side`: 100 % is the layer's edge; the glass's rim sits at ~64 %.
.boss-preview__aura
  position: absolute
  inset: -28%
  border-radius: 50%
  background: radial-gradient(circle closest-side, rgba(var(--aura), 0.8) 0%, rgba(var(--aura), 0.62) 62%, rgba(var(--aura), 0.3) 78%, rgba(var(--aura), 0) 100%)
  animation: boss-preview-aura 3.6s ease-in-out infinite alternate
.is-near .boss-preview__aura
  animation-duration: 2.4s
  background: radial-gradient(circle closest-side, rgba(var(--aura), 0.95) 0%, rgba(var(--aura), 0.78) 62%, rgba(var(--aura), 0.4) 80%, rgba(var(--aura), 0) 100%)

.boss-preview__glass
  position: absolute
  inset: 0
  overflow: hidden
  border-radius: 50%
  // Murky and lit from below, so a black shape reads against it.
  background: radial-gradient(circle at 50% 66%, #7a3446 0%, #3a1628 46%, #12070f 100%)
  border: 1.5px solid #0f1a30
  box-shadow: 0 0 0 1.5px rgba(var(--aura), 0.75), inset 0 -3px 7px rgba(0, 0, 0, 0.55)

// The body and the eyes' layer breathe with one animation, from one origin.
.boss-preview__body
  position: absolute
  inset: 0
  transform-origin: 50% 100%
  animation: boss-preview-breathe 4.2s ease-in-out infinite alternate

.boss-preview__shape
  position: absolute
  max-width: none
  // Blacked out, rim-lit by the aura.
  filter: brightness(0) drop-shadow(0 0 1.5px rgba(var(--aura), 0.95))
  user-select: none

// Slanted embers, glowing through the smoke.
.boss-preview__eye
  position: absolute
  width: 13%
  height: 7%
  translate: -50% -50%
  rotate: var(--tilt)
  border-radius: 50%
  background: radial-gradient(ellipse closest-side, #fff1d0 0%, rgb(var(--eye)) 50%, rgba(var(--eye), 0.35) 85%, rgba(var(--eye), 0) 100%)
  box-shadow: 0 0 3px 1px rgba(var(--eye), 0.75)
  animation: boss-preview-eyes 3.6s ease-in-out infinite alternate
.is-near .boss-preview__eye
  animation-duration: 2.4s

// Three banks of smoke drifting across at different speeds.
.boss-preview__smoke
  position: absolute
  border-radius: 50%
  background: radial-gradient(ellipse at center, rgba(168, 156, 186, 0.95) 0%, rgba(120, 108, 142, 0.55) 42%, rgba(96, 86, 118, 0) 70%)
  opacity: var(--fog)
  will-change: transform
.boss-preview__smoke--low
  left: -55%
  bottom: -22%
  width: 170%
  height: 72%
  animation: boss-preview-drift-low 7s ease-in-out infinite alternate
.boss-preview__smoke--mid
  left: -40%
  top: 26%
  width: 120%
  height: 52%
  animation: boss-preview-drift-mid 9.5s ease-in-out infinite alternate
.boss-preview__smoke--high
  left: -10%
  top: -18%
  width: 130%
  height: 55%
  opacity: calc(var(--fog) * 0.75)
  animation: boss-preview-drift-high 12s ease-in-out infinite alternate

@keyframes boss-preview-aura
  from
    opacity: 0.35
    transform: scale(0.92)
  to
    opacity: 1
    transform: scale(1.08)
@keyframes boss-preview-eyes
  from
    opacity: 0.55
  to
    opacity: 1
@keyframes boss-preview-breathe
  from
    transform: scale(1)
  to
    transform: scale(1.04)
@keyframes boss-preview-drift-low
  from
    transform: translateX(0)
  to
    transform: translateX(30%)
@keyframes boss-preview-drift-mid
  from
    transform: translateX(45%)
  to
    transform: translateX(-5%)
@keyframes boss-preview-drift-high
  from
    transform: translateX(-12%)
  to
    transform: translateX(18%)

// A new next boss (the last one fell) rises out of nothing; the one that just
// spawned bursts into smoke where it stood (GameScene pins it there) while its
// bar takes the line.
.boss-preview-enter-active
  transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.45s ease-out
.boss-preview-enter-from
  transform: scale(0.4)
  opacity: 0
.boss-preview-leave-active
  z-index: 1
  transition: transform 0.5s ease-out, opacity 0.5s ease-in
.boss-preview-leave-to
  transform: scale(1.7)
  opacity: 0

@media (prefers-reduced-motion: reduce)
  .boss-preview__aura, .boss-preview__body, .boss-preview__eye, .boss-preview__smoke
    animation: none
  .boss-preview__aura
    opacity: 0.8
  .boss-preview-enter-active, .boss-preview-leave-active
    transition: opacity 0.3s ease
  .boss-preview-enter-from, .boss-preview-leave-to
    transform: none
</style>
