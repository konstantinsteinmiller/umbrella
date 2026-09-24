<script setup lang="ts">
/**
 * Runic gold arrows that point at one element (an upgrade chip) — the upgrade
 * funnel's "buy THIS" (useCoach `upgradeFunnel`).
 *
 * Each arrow is a gold shaft engraved with the chip's own inscription in the
 * game's Elder Futhark (`game/runes.ts`, the same runes the chip's RuneFrame
 * carries), the runes glowing; it thrusts toward the chip in a loop with
 * sparkles twinkling along it, and a gold halo breathes round the chip.
 *
 * Placement is measured, never over `avoid` (the board — its aim area must
 * stay clear) and never off screen: up to two arrows from the sides of the
 * chip that have room (above / below first, then beside), each shortened to
 * the room it has. Pointer-events none, aria-hidden: the sentence lives in the
 * coach's live region.
 */
import { computed } from 'vue'
import { layoutBand, transliterate } from '@/game/runes'

interface Box { left: number; top: number; width: number; height: number }

const props = defineProps<{
  target: Box
  avoid: Box | null
  /** Latin text the shafts carry, in runes (ornament, never read). */
  inscription: string
  vw: number
  vh: number
}>()

type Side = 'above' | 'below' | 'right' | 'left'
interface Arrow {
  side: Side
  /** Screen box of the arrow's SVG. */
  box: Box
  /** Arrow length along its axis and thickness across it. */
  len: number
  thick: number
  /** SVG transform mapping the local arrow (pointing +x) into the box. */
  xf: string
}

const MARGIN = 2
const GAP = 3
const MIN_LEN = 26

const intersects = (a: Box, b: Box | null): boolean =>
  !!b && a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top

const arrows = computed<Arrow[]>(() => {
  const t = props.target
  const maxLen = Math.max(MIN_LEN, Math.min(58, t.height * 0.95))
  const thick = Math.max(16, Math.min(26, maxLen * 0.46))
  const cx = t.left + t.width / 2
  const cy = t.top + t.height / 2
  const out: Arrow[] = []
  const tryAdd = (side: Side): void => {
    // The room on that side (to the screen edge), then the arrow shortened to it.
    const room = side === 'above' ? t.top - GAP - MARGIN
      : side === 'below' ? props.vh - (t.top + t.height) - GAP - MARGIN
        : side === 'right' ? props.vw - (t.left + t.width) - GAP - MARGIN
          : t.left - GAP - MARGIN
    let len = Math.min(maxLen, room)
    if (len < MIN_LEN) return
    const make = (l: number): Box => side === 'above' ? { left: cx - thick / 2, top: t.top - GAP - l, width: thick, height: l }
      : side === 'below' ? { left: cx - thick / 2, top: t.top + t.height + GAP, width: thick, height: l }
        : side === 'right' ? { left: t.left + t.width + GAP, top: cy - thick / 2, width: l, height: thick }
          : { left: t.left - GAP - l, top: cy - thick / 2, width: l, height: thick }
    let box = make(len)
    // Shorten away from the board until it clears it (or give the side up).
    while (intersects(box, props.avoid) && len > MIN_LEN) {
      len -= 2
      box = make(len)
    }
    if (intersects(box, props.avoid)) return
    if (box.left < MARGIN || box.left + box.width > props.vw - MARGIN) return
    const xf = side === 'above' ? `translate(${thick} 0) rotate(90)`
      : side === 'below' ? `translate(0 ${len}) rotate(-90)`
        : side === 'right' ? `translate(${len} ${thick}) rotate(180)`
          : ''
    out.push({ side, box, len, thick, xf })
  }
  for (const s of ['above', 'below', 'right', 'left'] as const) {
    if (out.length >= 2) break
    tryAdd(s)
  }
  return out
})

const keys = computed(() => transliterate(props.inscription))

/** The arrow outline (local coords, pointing +x): fletched tail, rune shaft, head. */
const shape = (L: number, W: number) => {
  const head = Math.min(L * 0.42, W * 0.95)
  const shaft = W * 0.44
  const fl = Math.min(L * 0.22, W * 0.55)
  const top = W / 2 - shaft / 2
  const bot = W / 2 + shaft / 2
  const d = [
    `M0 ${top - W * 0.2}`, `L${fl} ${top}`, `L${L - head} ${top}`, `L${L - head} 0`, `L${L} ${W / 2}`,
    `L${L - head} ${W}`, `L${L - head} ${bot}`, `L${fl} ${bot}`, `L0 ${bot + W * 0.2}`, `L${fl * 0.55} ${W / 2}`, 'Z'
  ].join(' ')
  const band = layoutBand(keys.value, fl + 1.5, L - head - 1.5, W / 2, shaft * 0.74)
  // Twinkles: along the shaft and just off the head.
  const stars = [
    { x: fl + (L - head - fl) * 0.3, y: -W * 0.12, s: W * 0.28, d: 0 },
    { x: L - head * 0.3, y: W * 1.08, s: W * 0.24, d: 0.45 },
    { x: fl * 0.5, y: W * 1.05, s: W * 0.2, d: 0.9 }
  ]
  return { d, runes: band.d, runeW: Math.max(0.8, shaft * 0.12), stars }
}

const drawn = computed(() => arrows.value.map((a, i) => ({ ...a, i, ...shape(a.len, a.thick) })))

/** A gold halo just outside the chip. */
const haloStyle = computed(() => {
  const t = props.target
  const pad = 3
  return { left: `${t.left - pad}px`, top: `${t.top - pad}px`, width: `${t.width + pad * 2}px`, height: `${t.height + pad * 2}px` }
})

const star = (x: number, y: number, s: number): string =>
  `M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28} Z`

const gradId = `ra-gold-${Math.random().toString(36).slice(2, 8)}`
</script>

<template lang="pug">
  div.rune-arrows.fixed.inset-0.pointer-events-none(aria-hidden="true")
    div.ra-halo.absolute(:style="haloStyle")
    svg.ra-arrow.absolute(
      v-for="a in drawn"
      :key="a.side"
      :class="'ra-arrow--' + a.side"
      :style="{ left: a.box.left + 'px', top: a.box.top + 'px', width: a.box.width + 'px', height: a.box.height + 'px', animationDelay: (a.i * 0.12) + 's' }"
      :width="a.box.width"
      :height="a.box.height"
      :viewBox="'0 0 ' + a.box.width + ' ' + a.box.height"
      overflow="visible"
    )
      defs
        linearGradient(:id="gradId + a.i" x1="0" y1="0" x2="0" y2="1")
          stop(offset="0" stop-color="#fff7c8")
          stop(offset="0.42" stop-color="#ffd54a")
          stop(offset="1" stop-color="#b87708")
      g(:transform="a.xf")
        //- The thrust runs in the arrow's own frame, so every arrow moves toward the chip.
        g.ra-thrust(:style="{ animationDelay: (a.i * 0.12) + 's' }")
          path.ra-body(:d="a.d" :fill="'url(#' + gradId + a.i + ')'")
          path.ra-runes-glow(:d="a.runes" :stroke-width="a.runeW * 3")
          path.ra-runes(:d="a.runes" :stroke-width="a.runeW")
          path.ra-star(
            v-for="(s, k) in a.stars"
            :key="k"
            :d="star(s.x, s.y, s.s)"
            :style="{ animationDelay: s.d + 's' }"
          )
</template>

<style scoped lang="sass">
.rune-arrows
  z-index: 71

.ra-halo
  border-radius: 14px
  box-shadow: 0 0 0 2px rgba(255, 222, 110, 0.95), 0 0 16px 4px rgba(255, 196, 50, 0.7)
  animation: ra-halo 1s ease-in-out infinite alternate
@keyframes ra-halo
  from
    opacity: 0.55
  to
    opacity: 1

.ra-arrow
  filter: drop-shadow(0 0 4px rgba(255, 205, 60, 0.85)) drop-shadow(0 2px 2px rgba(0, 0, 0, 0.6))

.ra-thrust
  animation: ra-thrust 0.95s cubic-bezier(0.5, 0, 0.75, 0) infinite
@keyframes ra-thrust
  0%
    transform: translateX(-7px)
    opacity: 0.75
  70%
    transform: translateX(2px)
    opacity: 1
  100%
    transform: translateX(-7px)
    opacity: 0.75

.ra-body
  stroke: #3a2400
  stroke-width: 1.3
  stroke-linejoin: round

// The engraved runes glow: a blurred gold under-stroke that breathes, a
// near-white core over it.
.ra-runes-glow
  fill: none
  stroke: #ffc21a
  stroke-linecap: round
  stroke-linejoin: round
  opacity: 0.55
  filter: blur(1.2px)
  animation: ra-rune-glow 0.9s ease-in-out infinite alternate
@keyframes ra-rune-glow
  from
    opacity: 0.25
  to
    opacity: 0.85
.ra-runes
  fill: none
  stroke: #fffbe6
  stroke-linecap: round
  stroke-linejoin: round

.ra-star
  fill: #fffbe0
  transform-box: fill-box
  transform-origin: center
  animation: ra-twinkle 1.3s ease-in-out infinite
@keyframes ra-twinkle
  0%, 100%
    transform: scale(0.2) rotate(0deg)
    opacity: 0
  45%
    transform: scale(1) rotate(45deg)
    opacity: 1

@media (prefers-reduced-motion: reduce)
  .ra-thrust, .ra-star, .ra-runes-glow, .ra-halo
    animation: none
  .ra-star
    opacity: 0.8
</style>
