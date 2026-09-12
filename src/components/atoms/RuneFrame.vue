<script setup lang="ts">
/**
 * ─── The inset rune border of an upgrade chip ───────────────────────────────
 *
 * A thin frame line inset from the chip's edge, broken on the top and bottom
 * edges by an inscription — the upgrade's own name in Elder Futhark, so every
 * chip carries a different band — with small rivets where the line meets the
 * runes and a stud half-way down each side.
 *
 * Measured, not tiled: the SVG takes the chip's real pixel size and lays out
 * only WHOLE runes, centred, however wide the chip is (a 66px phone chip gets
 * fewer runes than an 86px desktop one; neither ever shows half a glyph). It is
 * `overflow: hidden` inside a chip that clips too, so nothing it draws can
 * reach a neighbouring chip.
 *
 * The rune height scales with the chip (≈8.5 % of its height, 3.4–6.2px) and
 * everything else — frame inset, stroke widths, the padding the chip must keep
 * clear for it — follows from that one number (see `RUNE_ZONE`).
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { layoutBand, runeHeightFor, runeInsetFor, transliterate } from '@/game/runes'

const props = defineProps<{
  /** Latin text to inscribe (transliterated to runes, cycled). */
  inscription: string
  /** ready = affordable (lit, glowing) · locked = can't buy (dim) · maxed = gold. */
  state: 'ready' | 'locked' | 'maxed'
}>()

const svgEl = ref<SVGSVGElement | null>(null)
const w = ref(0)
const h = ref(0)
let ro: ResizeObserver | null = null

onMounted(() => {
  const el = svgEl.value
  if (!el) return
  const measure = (): void => {
    const r = el.getBoundingClientRect()
    w.value = Math.round(r.width * 2) / 2
    h.value = Math.round(r.height * 2) / 2
  }
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(measure)
    ro.observe(el)
  }
})
onUnmounted(() => { ro?.disconnect(); ro = null })

const keys = computed(() => transliterate(props.inscription))

const geometry = computed(() => {
  const W = w.value
  const H = h.value
  if (W < 20 || H < 20) return null
  const runeH = runeHeightFor(H)
  // The frame line runs through the runes' middle on the top and bottom edges
  // (`i`), but hugs the chip's sides much closer (`s`): the chips are narrow,
  // and every pixel of side inset is a pixel of truncated upgrade name.
  const i = runeInsetFor(H)
  const s = 2.4
  const rx = Math.max(2.5, Math.min(7, 9.5 - i))
  const ry = Math.max(2, Math.min(7, 9.5 - i))
  const pad = runeH * 0.45 // gap between the line's rivet and the first rune
  const x0 = s + rx + pad + 1.5
  const x1 = W - s - rx - pad - 1.5
  const top = layoutBand(keys.value, x0, x1, i, runeH, 0)
  const bottom = layoutBand(keys.value, x0, x1, H - i, runeH, top.next)

  // The frame: two open subpaths that stop short of each inscription, so the
  // line reads as broken BY the runes rather than struck through them.
  const tFrom = top.count ? top.from - pad : W / 2
  const tTo = top.count ? top.to + pad : W / 2
  const bFrom = bottom.count ? bottom.from - pad : W / 2
  const bTo = bottom.count ? bottom.to + pad : W / 2
  const R = W - s
  const B = H - i
  const line =
    `M${tTo} ${i}L${R - rx} ${i}A${rx} ${ry} 0 0 1 ${R} ${i + ry}L${R} ${B - ry}` +
    `A${rx} ${ry} 0 0 1 ${R - rx} ${B}L${bTo} ${B}` +
    `M${bFrom} ${B}L${s + rx} ${B}A${rx} ${ry} 0 0 1 ${s} ${B - ry}L${s} ${i + ry}` +
    `A${rx} ${ry} 0 0 1 ${s + rx} ${i}L${tFrom} ${i}`

  // Rivets where the line meets an inscription, and a stud on each side.
  const dia = (x: number, y: number, sz: number): string =>
    `M${x} ${y - sz}L${x + sz} ${y}L${x} ${y + sz}L${x - sz} ${y}Z`
  const rs = Math.max(0.9, runeH * 0.26)
  let studs = dia(s, H / 2, rs * 1.15) + dia(R, H / 2, rs * 1.15)
  if (top.count) studs += dia(tFrom, i, rs) + dia(tTo, i, rs)
  if (bottom.count) studs += dia(bFrom, B, rs) + dia(bTo, B, rs)

  return {
    runes: top.d + bottom.d,
    line,
    studs,
    runeStroke: Math.max(0.7, runeH * 0.2),
    lineStroke: Math.max(0.6, runeH * 0.15)
  }
})
</script>

<template lang="pug">
  svg.rune-frame(
    ref="svgEl"
    :class="'rune-frame--' + state"
    :viewBox="`0 0 ${w || 1} ${h || 1}`"
    aria-hidden="true"
    focusable="false"
  )
    template(v-if="geometry")
      path.rf-line(:d="geometry.line" :stroke-width="geometry.lineStroke")
      path.rf-studs(:d="geometry.studs")
      path.rf-runes(:d="geometry.runes" :stroke-width="geometry.runeStroke")
</template>

<style scoped lang="sass">
.rune-frame
  position: absolute
  inset: 0
  width: 100%
  height: 100%
  overflow: hidden
  pointer-events: none
  color: var(--accent)
  fill: none
  stroke-linecap: round
  stroke-linejoin: round
  transition: filter 0.3s ease, opacity 0.3s ease

.rf-line
  stroke: currentColor
  opacity: 0.6
.rf-studs
  fill: currentColor
  stroke: none
.rf-runes
  // Lighter than the accent itself, so a rune reads against the accent-tinted
  // body the chip sits on — the accent alone vanishes into its own tint.
  stroke: color-mix(in srgb, currentColor 58%, #ffffff)

// Affordable: lit and glowing — the chip is asking to be pressed.
.rune-frame--ready
  filter: drop-shadow(0 0 1.4px var(--accent))

// Can't buy yet: engraved, not lit.
.rune-frame--locked
  opacity: 0.5
  .rf-line
    opacity: 0.45
  .rf-runes
    stroke: color-mix(in srgb, currentColor 60%, #8a93a8)

// Maxed: the whole frame turns to gold.
.rune-frame--maxed
  color: #ffd76a
  filter: drop-shadow(0 0 1.6px rgba(255, 200, 80, 0.9))
</style>
