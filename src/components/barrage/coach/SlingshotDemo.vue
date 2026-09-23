<script setup lang="ts">
/**
 * The slingshot, acted out — every coach beat that teaches a SHOT uses it.
 *
 *   1. a ghost hand lands ON the launcher (the player unit) and presses;
 *   2. it drags BACK, away from the target, and a thick arrow stretches out
 *      of the unit in the drag direction — two elastic bands run from the
 *      unit's shoulders to the fingertip, and the dotted flight line grows
 *      FORWARD as the pull grows (pull back → shoot forward);
 *   3. release: the arrow snaps back, a ghost ball flies the real path, and
 *      (lessons) each monster hit pops its running count, ending on the
 *      volley's total.
 *
 * `mode: 'hold'` is the live correction drawn UNDER a wrong-way thumb: the
 * arrow fully stretched the right way, pulsing, no ball.
 *
 * Words: none. Numbers only (the hit counts), like the canvas.
 * Pointer-events: none — the real board stays playable underneath.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

interface Pt { x: number; y: number }

const { t } = useI18n()

const props = withDefaults(defineProps<{
  /** The unit's body centre (client px). */
  launcher: Pt
  /** Unit shot direction on screen (y down: "up" is negative). */
  dir: Pt
  /** Client px per board cell. */
  cell: number
  /** Forward flight, launcher first (client px). */
  path: Pt[]
  /** Legs of `path` the ghost ball flies (1 = to the first bounce). */
  legs?: number
  /** Monster contacts along the flight, in order (client px). */
  contacts?: Pt[]
  /** The volley's total hits, popped when the ball is done. */
  total?: number | null
  tone?: 'teach' | 'combo' | 'survive'
  mode?: 'loop' | 'hold'
}>(), { legs: 1, contacts: () => [], total: null, tone: 'teach', mode: 'loop' })

// ─── Clock ───────────────────────────────────────────────────────────────────
const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
// The gestures ARE the instruction, so reduced motion slows them down rather
// than stopping them.
const K = reduced ? 1.45 : 1
const APPEAR = 260 * K
const PRESS = 200 * K
const PULL = 950 * K
const HOLD = 360 * K
const SNAP = 140 * K
const LINGER = 650 * K
const FADE = 300 * K

const now = ref(0)
let t0 = 0
let raf = 0
const tick = (t: number): void => {
  if (!t0) t0 = t
  now.value = t - t0
  raf = requestAnimationFrame(tick)
}
onMounted(() => { raf = requestAnimationFrame(tick) })
onUnmounted(() => cancelAnimationFrame(raf))
// A NEW shot restarts the loop from the top — not a re-measure: the overlays
// hand in fresh arrays every few hundred ms (the unit glides into place after
// a volley), and restarting on identity froze the demo on its first frames.
const shotKey = computed(() => {
  const p = props.path
  const end = p[p.length - 1]
  return `${Math.round(props.dir.x * 200)},${Math.round(props.dir.y * 200)},${p.length},${end ? Math.round(end.x / 6) : 0},${end ? Math.round(end.y / 6) : 0}`
})
watch(shotKey, () => { t0 = 0 })

// ─── Path geometry ───────────────────────────────────────────────────────────
const flight = computed(() => {
  const pts = props.path.length >= 2 ? props.path : [props.launcher, { x: props.launcher.x + props.dir.x * props.cell * 6, y: props.launcher.y + props.dir.y * props.cell * 6 }]
  const n = Math.min(pts.length, Math.max(1, props.legs) + 1)
  const use = pts.slice(0, n)
  const cum = [0]
  for (let i = 1; i < use.length; i++) cum.push(cum[i - 1]! + Math.hypot(use[i]!.x - use[i - 1]!.x, use[i]!.y - use[i - 1]!.y))
  return { pts: use, cum, len: cum[cum.length - 1]! }
})
const flyMs = computed(() => Math.max(450, Math.min(2800, (flight.value.len / Math.max(8, props.cell)) * 85)) * K)
const period = computed(() => APPEAR + PRESS + PULL + HOLD + SNAP + flyMs.value + LINGER + FADE)

/** Point at arc length `d` along the flight. */
const along = (d: number): Pt => {
  const { pts, cum } = flight.value
  if (d <= 0) return pts[0]!
  for (let i = 1; i < pts.length; i++) {
    if (d <= cum[i]!) {
      const k = (d - cum[i - 1]!) / Math.max(1e-6, cum[i]! - cum[i - 1]!)
      return { x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * k, y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * k }
    }
  }
  return pts[pts.length - 1]!
}
/** The flight cut at arc length `d`, as an SVG points string. */
const cut = (d: number): string => {
  const { pts, cum } = flight.value
  const out: string[] = [`${pts[0]!.x},${pts[0]!.y}`]
  for (let i = 1; i < pts.length; i++) {
    if (cum[i]! >= d) {
      const p = along(d)
      out.push(`${p.x},${p.y}`)
      break
    }
    out.push(`${pts[i]!.x},${pts[i]!.y}`)
  }
  return out.join(' ')
}

/** Each contact's arc length: the nearest vertex of the flight (contacts ARE
 *  the vertices where the ball turned; pierce hits sit on a straight leg). */
const contactAt = computed(() => {
  const { pts, cum } = flight.value
  return props.contacts.map((c) => {
    let best = Infinity
    let at = -1
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i]!.x - c.x, pts[i]!.y - c.y)
      if (d < best) { best = d; at = cum[i]! }
    }
    return best < props.cell * 0.7 ? at : -1
  })
})

// ─── Timeline ────────────────────────────────────────────────────────────────
const ease = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

const frame = computed(() => {
  if (props.mode === 'hold') {
    const pulse = 0.93 + 0.07 * Math.sin(now.value / 160)
    return { stretch: pulse, hand: 1, pressed: true, fly: -1, alpha: 1, dots: 1 }
  }
  const t = now.value % period.value
  let stretch = 0
  let hand = 0
  let pressed = false
  let fly = -1
  let dots = 0
  let alpha = 1
  let e = t
  if (e < APPEAR) {
    hand = e / APPEAR
  } else if ((e -= APPEAR) < PRESS) {
    hand = 1
    pressed = e > PRESS * 0.4
  } else if ((e -= PRESS) < PULL) {
    hand = 1
    pressed = true
    stretch = ease(e / PULL)
    dots = stretch
  } else if ((e -= PULL) < HOLD) {
    hand = 1
    pressed = true
    stretch = 1 + 0.025 * Math.sin((e / HOLD) * Math.PI * 4)
    dots = 1
  } else if ((e -= HOLD) < SNAP) {
    // Release: the band overshoots past the unit and settles.
    const k = e / SNAP
    stretch = 1 - k * 1.2
    hand = 1 - k * 0.4
    dots = 1
    fly = 0
  } else if ((e -= SNAP) < flyMs.value) {
    hand = Math.max(0, 0.6 - e / 300)
    fly = e / flyMs.value
    dots = 1
  } else if ((e -= flyMs.value) < LINGER) {
    fly = 1
    dots = 1
  } else {
    e -= LINGER
    fly = 1
    dots = 1
    alpha = 1 - clamp01(e / FADE)
  }
  return { stretch, hand, pressed, fly, alpha, dots }
})

// ─── Drawing ─────────────────────────────────────────────────────────────────
const back = computed(() => ({ x: -props.dir.x, y: -props.dir.y }))
const perp = computed(() => ({ x: -back.value.y, y: back.value.x }))
const pullLen = computed(() => props.cell * (props.tone === 'teach' ? 1.75 : 1.4))

/** Fingertip: dragged back from the unit by the stretch. */
const tip = computed<Pt>(() => {
  const s = Math.max(0, frame.value.stretch)
  return { x: props.launcher.x + back.value.x * pullLen.value * s, y: props.launcher.y + back.value.y * pullLen.value * s }
})

/** The stretch arrow: a tapering shaft out of the unit, head at the fingertip. */
const arrow = computed(() => {
  const s = frame.value.stretch
  const c = props.cell
  const L = props.launcher
  const b = back.value
  const p = perp.value
  const start = c * 0.3
  const len = pullLen.value * s
  if (len - start < c * 0.25) return ''
  const head = Math.min(c * 0.5, (len - start) * 0.6)
  const shaftEnd = len - head
  // Rubber: the shaft thins as it stretches.
  const w = c * 0.19 * (1 - 0.3 * clamp01(s))
  const hw = c * 0.4
  const P = (along_: number, side: number): string =>
    `${L.x + b.x * along_ + p.x * side},${L.y + b.y * along_ + p.y * side}`
  return [
    P(start, w * 0.7), P(shaftEnd, w), P(shaftEnd, hw), P(len, 0),
    P(shaftEnd, -hw), P(shaftEnd, -w), P(start, -w * 0.7)
  ].join(' ')
})

/** Elastic bands from the unit's shoulders to the fingertip. */
const bands = computed(() => {
  if (frame.value.stretch <= 0.05) return null
  const c = props.cell
  const L = props.launcher
  const p = perp.value
  const T = tip.value
  return [
    { x1: L.x + p.x * c * 0.42, y1: L.y + p.y * c * 0.42 - c * 0.05, x2: T.x, y2: T.y },
    { x1: L.x - p.x * c * 0.42, y1: L.y - p.y * c * 0.42 - c * 0.05, x2: T.x, y2: T.y }
  ]
})

/** Forward dots: grow with the pull along the first leg. */
const dotsPts = computed(() => {
  const f = frame.value
  if (f.dots <= 0) return ''
  const leg = flight.value.cum[1] ?? flight.value.len
  return cut(Math.max(1, leg * (f.fly >= 0 ? 1 : f.dots)))
})
const dotStyle = computed(() => ({
  strokeWidth: `${Math.max(4, props.cell * 0.14)}px`,
  strokeDasharray: `0 ${Math.max(10, props.cell * 0.42)}px`
}))

const ball = computed<Pt | null>(() => {
  const f = frame.value.fly
  if (f < 0) return null
  return along(flight.value.len * clamp01(f))
})
const trailPts = computed(() => {
  const f = frame.value.fly
  if (f <= 0 || props.tone === 'teach') return ''
  return cut(flight.value.len * clamp01(f))
})
const ballR = computed(() => Math.max(6, props.cell * 0.2))

/** Hit counts along the flight; a pocket that rattles shows one ticking
 *  counter instead of a pile of numbers. */
const pops = computed(() => {
  const f = frame.value.fly
  if (f < 0 || props.contacts.length === 0) return []
  const d = flight.value.len * clamp01(f)
  const shown: { x: number; y: number; n: number; age: number }[] = []
  props.contacts.forEach((c, i) => {
    const at = contactAt.value[i]!
    if (at < 0 || at > d) return
    shown.push({ x: c.x, y: c.y, n: i + 1, age: (d - at) / Math.max(1, props.cell) })
  })
  const near = props.cell * 0.45
  return shown.filter((a, i) => !shown.some((b, j) => j > i && Math.hypot(a.x - b.x, a.y - b.y) < near))
})
const popFont = computed(() => Math.max(13, props.cell * 0.36))

const totalAt = computed<Pt | null>(() => {
  if (props.total == null || frame.value.fly < 1) return null
  const cs = props.contacts
  const anchor = cs.length ? cs.reduce((a, c) => ({ x: a.x + c.x / cs.length, y: a.y + c.y / cs.length }), { x: 0, y: 0 }) : props.launcher
  return { x: anchor.x, y: anchor.y - props.cell * 0.9 }
})

// ─── Hand ────────────────────────────────────────────────────────────────────
const HAND_K = 1.05 // hand size in cells
const handStyle = computed<Record<string, string>>(() => {
  const size = Math.max(40, props.cell * HAND_K)
  const T = tip.value
  const f = frame.value
  return {
    left: `${T.x - (18.5 / 64) * size}px`,
    top: `${T.y - (4 / 64) * size}px`,
    width: `${size}px`,
    height: `${size}px`,
    opacity: String(clamp01(f.hand) * f.alpha),
    // Pivot on the fingertip, so a press never slides the tip off the unit.
    transformOrigin: `${(18.5 / 64) * size}px ${(4 / 64) * size}px`,
    transform: `scale(${f.pressed ? 0.9 : 1})`
  }
})

// Unique per instance: two demos on screen must never share one <defs> id.
const gradId = `sd-fill-${Math.random().toString(36).slice(2, 9)}`

const toneClass = computed(() => `sd--${props.tone}`)
</script>

<template lang="pug">
  div.slingshot-demo.fixed.inset-0.pointer-events-none(:class="toneClass" :style="{ opacity: frame.alpha }" aria-hidden="true")
    svg.absolute.inset-0(width="100%" height="100%")
      defs
        linearGradient(:id="gradId" x1="0" y1="0" x2="1" y2="1")
          stop(offset="0" stop-color="#fffbe6")
          stop(offset="1" stop-color="#ffc93c")
      //- Forward dotted flight line (grows with the pull).
      polyline.sd-dots(v-if="dotsPts" :points="dotsPts" fill="none" stroke-linecap="round" stroke-linejoin="round" :style="dotStyle")
      //- Where the ghost ball has been (lessons).
      polyline.sd-trail(v-if="trailPts" :points="trailPts" fill="none" stroke-linecap="round" stroke-linejoin="round" :stroke-width="Math.max(3, cell * 0.1)")
      //- Elastic bands, then the stretch arrow over them.
      template(v-if="bands")
        line.sd-band(v-for="(b, i) in bands" :key="i" :x1="b.x1" :y1="b.y1" :x2="b.x2" :y2="b.y2" :stroke-width="Math.max(2.5, cell * 0.07)")
      polygon.sd-arrow(v-if="arrow" :points="arrow" :fill="'url(#' + gradId + ')'" stroke-linejoin="round" :stroke-width="Math.max(2.5, cell * 0.075)")
      //- Grab ring on the unit while the hand presses.
      circle.sd-grab(v-if="frame.pressed && frame.stretch < 0.2 && mode === 'loop'" :cx="launcher.x" :cy="launcher.y" :r="cell * 0.55")
      //- Ghost ball.
      template(v-if="ball")
        circle.sd-ball-glow(:cx="ball.x" :cy="ball.y" :r="ballR * 2")
        circle.sd-ball(:cx="ball.x" :cy="ball.y" :r="ballR")
      //- Running hit counts.
      text.sd-pop.game-text(
        v-for="p in pops"
        :key="p.n"
        :x="p.x"
        :y="p.y - cell * 0.12"
        text-anchor="middle"
        dominant-baseline="middle"
        :font-size="popFont * (1 + 0.5 * Math.max(0, 1 - p.age * 3))"
      ) {{ p.n }}
      text.sd-total.game-text(
        v-if="totalAt"
        :x="totalAt.x"
        :y="totalAt.y"
        text-anchor="middle"
        dominant-baseline="middle"
        :font-size="Math.max(24, cell * 0.8)"
      ) {{ t('barrage.banners.comboHits', { n: total }) }}
    div.sd-hand.absolute(:style="handStyle")
      svg(viewBox="0 0 64 64" width="100%" height="100%")
        g(fill="#fff" stroke="#0f1a30" stroke-width="3" stroke-linejoin="round" stroke-linecap="round")
          path(d="M13 32 H43 A8 8 0 0 1 51 40 V46 A14 14 0 0 1 37 60 H25 A14 14 0 0 1 11 46 V36 A4 4 0 0 1 13 32 Z")
          rect(x="24" y="24" width="9" height="15" rx="4.5")
          rect(x="32.5" y="26" width="9" height="14" rx="4.5")
          rect(x="41" y="29" width="9" height="12" rx="4.5")
          rect(x="13" y="4" width="11" height="34" rx="5.5")
          path(d="M13 41 C5 39 3 47 8 51 C10 53 13 54 15 54")
</template>

<style scoped lang="sass">
.slingshot-demo
  z-index: 70
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.55))

.sd-dots
  stroke: rgba(255, 255, 255, 0.95)
.sd-trail
  stroke: rgba(255, 226, 122, 0.75)
.sd--survive .sd-trail
  stroke: rgba(255, 138, 90, 0.8)
.sd-band
  stroke: #ffcf5a
  stroke-linecap: round
  opacity: 0.9
.sd-arrow
  stroke: #0f1a30
.sd-grab
  fill: none
  stroke: rgba(255, 255, 255, 0.9)
  stroke-width: 3
  animation: sd-grab 0.45s ease-out infinite
  transform-box: fill-box
  transform-origin: center
@keyframes sd-grab
  from
    opacity: 1
    transform: scale(0.6)
  to
    opacity: 0
    transform: scale(1.35)
.sd-ball
  fill: #ffe9a8
  stroke: #0f1a30
  stroke-width: 2
.sd-ball-glow
  fill: rgba(255, 200, 80, 0.35)
.sd-pop
  fill: #ffe27a
  stroke: #000
  stroke-width: 3.5px
  paint-order: stroke
  font-weight: 900
.sd--survive .sd-pop
  fill: #ffffff
.sd-total
  fill: #ffe27a
  stroke: #000
  stroke-width: 5px
  paint-order: stroke
  font-weight: 900
  transform: rotate(-6deg)
  animation: sd-total 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)
  transform-box: fill-box
  transform-origin: center
@keyframes sd-total
  from
    transform: scale(1.9) rotate(-6deg)
    opacity: 0
  to
    transform: scale(1) rotate(-6deg)
    opacity: 1

.sd-hand
  z-index: 2
</style>
