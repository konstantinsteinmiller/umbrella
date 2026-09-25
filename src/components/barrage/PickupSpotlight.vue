<script setup lang="ts">
/**
 * The first "+1", on a stage (`pickupSpotlight.ts` decides WHEN; the game is
 * paused for the whole moment).
 *
 *   0 – 0.28 s   everything dims; a soft spotlight opens round the "+1"
 *                where it was collected, and it swells;
 *   – 1.35 s     it lifts off the board and arcs down into the tray socket
 *                it filled — the spotlight glides along with it;
 *   1.35 s       it turns into the ball: the bubble shrinks away in a flash,
 *                the ball's orb pops out of it in the socket;
 *   then         a comet runs from the new ball into the launcher and rings
 *                it — one more ball, one more shot every volley;
 *   end          the dim lifts.
 *
 * Wordless (the "+1" is the same glyph the board pops); the sentence is for
 * screen readers only. A tap skips it. Reduced motion: no flight — the
 * spotlight sits on the socket, the "+1" fades into the ball there.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ballColors, fighterSrc } from '@/barrage/art'
import useSounds from '@/use/useSound'
import { boardApi } from '@/components/barrage/barrageUi'
import { finishPickup, pickupBox, registerPickupBoxView, type PickupBox, type Pt } from '@/components/barrage/pickupSpotlight'

interface Box { left: number; top: number; width: number; height: number }

const { t } = useI18n()
const { playSound } = useSounds()

const box = computed<PickupBox | null>(() => pickupBox.value)

// ─── Geometry (measured once: the game is paused, nothing moves) ─────────────
const geo = ref<{ tray: Box; slot: Box; launcher: Pt | null; cell: number } | null>(null)
const rectOf = (el: Element | null): Box | null => {
  const r = el?.getBoundingClientRect()
  return r && r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
}
const measure = (): void => {
  const b = box.value
  if (!b) { geo.value = null; return }
  const trayEl = document.querySelector('[data-tut="tray"]')
  const tray = rectOf(trayEl)
  // The slot's wrapper, never the ball itself (the ball may be mid-animation).
  const slot = rectOf(trayEl?.querySelector(`[data-slot="${b.idx}"]`) ?? null)
  if (!tray || !slot) { geo.value = null; return }
  const api = boardApi.value
  const o = api?.cellToClient(0, 0)
  const o1 = api?.cellToClient(1, 0)
  geo.value = {
    tray,
    slot,
    launcher: api?.launcherClientPoint() ?? null,
    cell: o && o1 ? Math.max(16, o1.x - o.x) : 40
  }
}

// ─── Clock ───────────────────────────────────────────────────────────────────
const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const now = ref(0)
let t0 = 0
let raf = 0
let landed = false
let comet = false
/** Beat times, ms. */
const T = { appear: 280, lift: 600, land: 1350, morph: 1650, trail0: 1720, trail1: 2200, ring1: 2440, out: 2380, total: 2600 }
const tick = (tm: number): void => {
  if (!t0) t0 = tm
  now.value = tm - t0
  if (!landed && now.value >= T.land) {
    landed = true
    playSound('merge-pop', 0.05, 1.25)
  }
  if (!comet && now.value >= T.trail1) {
    comet = true
    playSound('anchor-swap', 0.04, 1.3)
  }
  raf = requestAnimationFrame(tick)
}
const start = (): void => {
  cancelAnimationFrame(raf)
  t0 = 0
  now.value = 0
  landed = false
  comet = false
  measure()
  raf = requestAnimationFrame(tick)
}
watch(() => box.value?.seq, (s) => { if (s) start(); else cancelAnimationFrame(raf) })

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const seg = (a: number, b: number): number => clamp01((now.value - a) / Math.max(1, b - a))
const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const easeOutBack = (x: number): number => {
  const c = 1.9
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2)
}

const layerOpacity = computed(() => seg(0, T.appear) * (1 - seg(T.out, T.total)))
const slotSize = computed(() => geo.value?.slot.width ?? 40)
const slotCentre = computed<Pt | null>(() => {
  const g = geo.value
  return g ? { x: g.slot.left + g.slot.width / 2, y: g.slot.top + g.slot.height / 2 } : null
})

// ─── The "+1": a swell, then an arc into its socket ──────────────────────────
/** Where the bubble is now (reduced motion: already in the socket). */
const bubbleAt = computed<Pt | null>(() => {
  const b = box.value
  const to = slotCentre.value
  if (!b || !to) return null
  if (reduced) return to
  const k = easeInOut(seg(T.lift, T.land))
  const from = b.from
  // An arc that bows up and out, then drops into the socket.
  const lift = Math.min(140, Math.abs(to.y - from.y) * 0.35 + 40)
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * lift
  }
})
const bubbleStyle = computed<Record<string, string> | null>(() => {
  const p = bubbleAt.value
  if (!p || now.value >= T.morph) return null
  const s = slotSize.value * 0.95
  const swell = reduced ? 1 : 1 + 0.25 * Math.sin(Math.PI * seg(T.appear - 120, T.lift))
  const shrink = 1 - 0.7 * seg(T.land, T.morph)
  return {
    left: `${p.x - s / 2}px`, top: `${p.y - s / 2}px`, width: `${s}px`, height: `${s}px`,
    transform: `scale(${swell * shrink})`,
    opacity: String(1 - seg(T.land + 120, T.morph))
  }
})
const flashStyle = computed<Record<string, string> | null>(() => {
  const f = slotCentre.value
  if (!f || reduced || now.value < T.land || now.value > T.land + 340) return null
  const k = seg(T.land, T.land + 340)
  const size = slotSize.value * (0.6 + 2.4 * k)
  return { left: `${f.x}px`, top: `${f.y}px`, width: `${size}px`, height: `${size}px`, opacity: String(1 - k) }
})
const orbStyle = computed<Record<string, string> | null>(() => {
  const g = geo.value
  const b = box.value
  if (!g || !b || now.value < T.land) return null
  const k = seg(T.land, T.morph)
  const c = ballColors(b.tier)
  return {
    '--rim': c.glow, '--body': c.body, '--light': c.light,
    left: `${g.slot.left}px`, top: `${g.slot.top}px`, width: `${g.slot.width}px`, height: `${g.slot.height}px`,
    transform: `scale(${0.3 + 0.7 * easeOutBack(k)})`
  }
})

// ─── The spotlight: follows the "+1", then the tray, then the launcher ───────
const spot = computed<{ x: number; y: number; r: number } | null>(() => {
  const p = bubbleAt.value
  const g = geo.value
  if (!p || !g) return null
  const cell = g.cell
  const open = easeOutBack(seg(0, T.appear + 80))
  const r = cell * (1.55 * open - 0.35 * seg(T.lift, T.land))
  return { x: p.x, y: p.y, r: Math.max(1, r) }
})
/** The tray's window opens as the "+1" arrives; the launcher's as the comet lands. */
const trayHole = computed(() => seg(T.land - 250, T.land + 100))
const launcherHoleR = computed(() => {
  const g = geo.value
  if (!g?.launcher) return 0
  return g.cell * 0.95 * seg(T.trail1 - 200, T.trail1 + 60)
})

// ─── The comet into the launcher (the merge lightbox's, in the ball's colour) ─
const arc = computed(() => {
  const g = geo.value
  const f = slotCentre.value
  if (!g || !f || !g.launcher) return null
  const L = g.launcher
  const mx = (f.x + L.x) / 2
  const my = (f.y + L.y) / 2
  const dx = L.x - f.x
  const dy = L.y - f.y
  const len = Math.hypot(dx, dy) || 1
  const bow = Math.min(90, len * 0.3)
  const side = mx < window.innerWidth / 2 ? 1 : -1
  const c = { x: mx + (-dy / len) * bow * side, y: my + (dx / len) * bow * side }
  const at = (q: number): Pt => ({
    x: (1 - q) * (1 - q) * f.x + 2 * (1 - q) * q * c.x + q * q * L.x,
    y: (1 - q) * (1 - q) * f.y + 2 * (1 - q) * q * c.y + q * q * L.y
  })
  return { at, L }
})
const trailK = computed(() => easeInOut(seg(T.trail0, T.trail1)))
const trailPath = computed(() => {
  const a = arc.value
  const k = trailK.value
  if (!a || now.value < T.trail0) return ''
  const from = Math.max(0, k - 0.45)
  const pts: string[] = []
  for (let i = 0; i <= 16; i++) {
    const p = a.at(from + ((k - from) * i) / 16)
    pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`)
  }
  return pts.join(' ')
})
const launcherRing = computed(() => {
  const g = geo.value
  if (!g?.launcher || now.value < T.trail1) return null
  const k = seg(T.trail1, T.ring1)
  return { x: g.launcher.x, y: g.launcher.y, r: g.cell * (0.45 + 0.9 * k), o: 1 - k }
})
const trailColor = computed(() => ballColors(box.value?.tier ?? 1).glow)

const srText = computed(() => (box.value ? t('barrage.tray.pickupSr') : ''))

const skip = (): void => { finishPickup() }
const onKey = (e: KeyboardEvent): void => {
  if (!box.value) return
  if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    skip()
  }
}

let unregister: (() => void) | null = null
onMounted(() => {
  unregister = registerPickupBoxView()
  window.addEventListener('resize', measure)
  window.addEventListener('keydown', onKey)
  if (box.value) start()
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', measure)
  window.removeEventListener('keydown', onKey)
  unregister?.()
  // Never leave the game paused behind a view that is gone.
  finishPickup()
})
</script>

<template lang="pug">
  Teleport(to="body")
    //- `data-coach-live`: the playtest harness's moment marker.
    div.sr-only(aria-live="polite" data-coach-live="pickup") {{ srText }}
    div.pickup-box.hud-digits.fixed.inset-0(
      v-if="box && geo"
      :style="{ opacity: layerOpacity }"
      role="button"
      tabindex="0"
      :aria-label="t('barrage.merge.skipAria')"
      @pointerdown.prevent
      @click="skip"
    )
      svg.absolute.inset-0(width="100%" height="100%" aria-hidden="true")
        defs
          //- A soft-edged hole: black (see-through) in the middle, fading out.
          radialGradient(:id="'pb-soft-' + box.seq")
            stop(offset="0%" stop-color="#000")
            stop(offset="62%" stop-color="#000")
            stop(offset="100%" stop-color="#fff")
          mask(:id="'pb-mask-' + box.seq")
            rect(width="100%" height="100%" fill="#fff")
            circle(v-if="spot" :cx="spot.x" :cy="spot.y" :r="spot.r" :fill="'url(#pb-soft-' + box.seq + ')'")
            rect(
              v-if="trayHole > 0"
              :x="geo.tray.left - 6" :y="geo.tray.top - 6"
              :width="geo.tray.width + 12" :height="geo.tray.height + 12"
              rx="16" fill="#000" :fill-opacity="trayHole"
            )
            circle(v-if="geo.launcher && launcherHoleR > 0" :cx="geo.launcher.x" :cy="geo.launcher.y" :r="launcherHoleR" fill="#000")
        rect(width="100%" height="100%" fill="rgba(3, 6, 14, 0.76)" :mask="'url(#pb-mask-' + box.seq + ')'")
        circle.pb-spot-rim(v-if="spot" :cx="spot.x" :cy="spot.y" :r="spot.r * 0.66")
        polyline.pb-trail(
          v-if="trailPath"
          :points="trailPath"
          :stroke="trailColor"
          :style="{ color: trailColor }"
          :stroke-width="Math.max(4, slotSize * 0.18)"
          fill="none" stroke-linecap="round" stroke-linejoin="round"
        )
        circle.pb-ring(v-if="launcherRing" :cx="launcherRing.x" :cy="launcherRing.y" :r="launcherRing.r" :stroke="trailColor" :style="{ opacity: launcherRing.o }")
      //- The "+1" bubble — the same glyph the board pops.
      div.pb-plus.absolute.flex.items-center.justify-center.rounded-full(v-if="bubbleStyle" :style="bubbleStyle" aria-hidden="true")
        span.game-text.font-black {{ t('barrage.tray.plusOne') }}
      div.pb-flash.absolute.rounded-full(v-if="flashStyle" :style="flashStyle" aria-hidden="true")
      //- …and the ball it became, in its socket.
      div.pb-orb.absolute(v-if="orbStyle" :style="orbStyle" aria-hidden="true")
        img.pb-orb__portrait(:src="fighterSrc(box.tier)" alt="" draggable="false")
        span.pb-orb__gloss
</template>

<style scoped lang="sass">
// With the merge lightbox, above everything (the game is paused).
.pickup-box
  z-index: 80
  cursor: pointer
  touch-action: none
  -webkit-tap-highlight-color: transparent
  outline: none

.pb-spot-rim
  fill: none
  stroke: rgba(125, 255, 154, 0.55)
  stroke-width: 2
  filter: drop-shadow(0 0 6px rgba(125, 255, 154, 0.8))

.pb-plus
  border: 3px solid rgba(125, 255, 154, 0.95)
  background: radial-gradient(circle at 35% 30%, rgba(210, 255, 220, 0.7), rgba(90, 220, 130, 0.35) 60%, rgba(20, 60, 40, 0.5))
  box-shadow: 0 0 16px rgba(125, 255, 154, 0.9)
  color: #eafff0
  font-size: 18px
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6)
  transform-origin: center

.pb-flash
  translate: -50% -50%
  background: radial-gradient(circle, #ffffff 0%, rgba(220, 255, 230, 0.85) 30%, rgba(125, 255, 154, 0) 70%)

// The tray's glass orb (BallTray / MergeLightbox).
.pb-orb
  border-radius: 50%
  overflow: hidden
  background: radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--light) 55%, #0b1224) 0%, color-mix(in srgb, var(--body) 45%, #070b18) 70%, #050810 100%)
  box-shadow: 0 0 0 2.5px var(--rim), 0 0 22px var(--rim), inset 0 -3px 6px rgba(0, 0, 0, 0.55)
  transform-origin: center
.pb-orb__portrait
  position: absolute
  inset: 8%
  width: 84%
  height: 84%
  object-fit: contain
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6))
.pb-orb__gloss
  position: absolute
  inset: 0
  border-radius: 50%
  background: radial-gradient(ellipse 55% 35% at 36% 22%, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0) 70%)

.pb-trail
  opacity: 0.9
  filter: drop-shadow(0 0 6px currentColor)
.pb-ring
  fill: none
  stroke-width: 4
  filter: drop-shadow(0 0 8px rgba(255, 230, 150, 0.9))
</style>
