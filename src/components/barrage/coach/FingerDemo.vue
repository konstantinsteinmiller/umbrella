<script setup lang="ts">
/**
 * The shot, acted out — every coach beat that teaches a SHOT uses it.
 *
 *   1. a ghost hand lands MID-BOARD, above the unit, and presses (a touch
 *      ripple under the fingertip);
 *   2. it drags TOWARD the monsters along the shot line, and a dashed ghost
 *      line grows under it from the unit to the fingertip — the board aims AT
 *      a finger above the unit, so this is the gesture players already try;
 *   3. release: the hand lifts, the line fades, a ghost ball flies the real
 *      path and fades out where it lands (lessons: each monster hit pops its
 *      running count, ending on the volley's total).
 *
 * Play-test (4 blind first-timers): the old slingshot demo pulled the hand
 * DOWN into the bottom panel, where a still frame reads "tap this card", and
 * its dotted line ended in a ball at the monster — read as "my shot does no
 * damage". So: the whole demo stays inside the board rect (`bounds`), the line
 * is dashed, translucent and moving (never a row of balls, never a marker at
 * its end), and every loop ends on an empty board.
 *
 * Run 2: first frames caught the demo between loops — a ghost ball and its
 * trail with no hand — and testers read it as a "joystick circle". So the
 * demo's first frame is the hand already down on the board (the clock starts
 * past the fade-in), and the lifted hand stays in view, dimmed, while its
 * ball flies: a still frame shows a hand whenever it shows anything.
 *
 * Words: none. Numbers only (the hit counts), like the canvas.
 * Pointer-events: none — the real board stays playable underneath.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

interface Pt { x: number; y: number }
interface Box { left: number; top: number; width: number; height: number }

const { t } = useI18n()

const props = withDefaults(defineProps<{
  /** The unit's body centre (client px). */
  launcher: Pt
  /** Unit shot direction on screen (y down: "up" is negative). */
  dir: Pt
  /** Client px per board cell. */
  cell: number
  /** Forward flight, launch point first (client px). */
  path: Pt[]
  /** Legs of `path` the ghost ball flies (1 = to the first bounce). */
  legs?: number
  /** Monster contacts along the flight, in order (client px). */
  contacts?: Pt[]
  /** The volley's total hits, popped when the ball is done. */
  total?: number | null
  tone?: 'teach' | 'combo' | 'survive'
  /** The board's client rect: nothing of the demo is ever drawn outside it
   *  (below it sit the tray and the buttons a still frame would point at). */
  bounds?: Box | null
}>(), { legs: 2, contacts: () => [], total: null, tone: 'teach', bounds: null })

// ─── Clock ───────────────────────────────────────────────────────────────────
const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
// The gestures ARE the instruction, so reduced motion slows them down rather
// than stopping them.
const K = reduced ? 1.45 : 1
const APPEAR = 280 * K
const PRESS = 200 * K
const DRAG = 950 * K
const HOLD = 260 * K
const RELEASE = 180 * K
const END = 420 * K
// An empty beat between loops: the board must be seen WITHOUT the demo, so
// nothing on it can be mistaken for something the player did.
const REST = 520 * K

// The clock starts at APPEAR: the hand is fully there on the very first frame.
const now = ref(APPEAR)
let t0 = 0
let raf = 0
const tick = (tm: number): void => {
  if (!t0) t0 = tm - APPEAR
  now.value = tm - t0
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
const origin = computed<Pt>(() => props.path[0] ?? props.launcher)
const flight = computed(() => {
  const L = origin.value
  const pts = props.path.length >= 2 ? props.path : [L, { x: L.x + props.dir.x * props.cell * 6, y: L.y + props.dir.y * props.cell * 6 }]
  const n = Math.min(pts.length, Math.max(1, props.legs) + 1)
  const use = pts.slice(0, n)
  const cum = [0]
  for (let i = 1; i < use.length; i++) cum.push(cum[i - 1]! + Math.hypot(use[i]!.x - use[i - 1]!.x, use[i]!.y - use[i - 1]!.y))
  return { pts: use, cum, len: cum[cum.length - 1]! }
})
const flyMs = computed(() => Math.max(420, Math.min(2800, (flight.value.len / Math.max(8, props.cell)) * 80)) * K)
const period = computed(() => APPEAR + PRESS + DRAG + HOLD + RELEASE + flyMs.value + END + REST)

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
/** The flight between arc lengths `a` and `b`, as an SVG points string. */
const span = (a: number, b: number): string => {
  const { pts, cum } = flight.value
  const from = along(Math.max(0, a))
  const out: string[] = [`${from.x},${from.y}`]
  for (let i = 1; i < pts.length; i++) {
    if (cum[i]! <= a) continue
    if (cum[i]! >= b) break
    out.push(`${pts[i]!.x},${pts[i]!.y}`)
  }
  const to = along(b)
  out.push(`${to.x},${to.y}`)
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

// ─── Where the finger goes ───────────────────────────────────────────────────
const HAND_K = 1.05 // hand size in cells
const handSize = computed(() => Math.max(40, props.cell * HAND_K))
// The fingertip sits at (18.5, 4) of the 64-unit hand drawing; the palm hangs
// below and to the right of it.
const TIP_X = 18.5 / 64
const TIP_Y = 4 / 64

/** Distances along the shot line (from the launch point) where the finger
 *  presses and where it lets go. Both lie on the line, so the ghost line and
 *  the ball's first leg are the same line — the board aims at the finger. */
const stroke = computed(() => {
  const c = props.cell
  const O = origin.value
  const D = props.dir
  const leg = flight.value.cum[1] ?? flight.value.len
  // Let go short of the first contact: a hand over the monster hides it.
  let dA = Math.min(Math.max(leg * 0.72, c * 3), c * 6.5, Math.max(c * 1.4, leg - c * 0.6))
  // Press well above the unit — the board reads a finger BELOW the unit as a
  // slingshot pull, and a hand that low would sit on the unit.
  const rise = Math.max(0.2, -D.y)
  let dS = Math.min(Math.max(dA * 0.42, (c * 1.8) / rise), dA - c * 1.2)
  // Keep the whole hand inside the board: each edge bounds d linearly.
  const b = props.bounds
  if (b) {
    const pad = Math.max(4, c * 0.12)
    const size = handSize.value
    let lo = c * 0.6
    let hi = Infinity
    const edge = (p0: number, v: number, min: number, max: number): void => {
      // p0 + v·d ∈ [min, max]
      if (Math.abs(v) < 1e-6) return
      const a = (min - p0) / v
      const z = (max - p0) / v
      lo = Math.max(lo, Math.min(a, z))
      hi = Math.min(hi, Math.max(a, z))
    }
    edge(O.x, D.x, b.left + pad + TIP_X * size, b.left + b.width - pad - (1 - TIP_X) * size)
    edge(O.y, D.y, b.top + pad + TIP_Y * size, b.top + b.height - pad - (1 - TIP_Y) * size)
    if (lo <= hi) {
      dA = Math.min(Math.max(dA, lo), hi)
      dS = Math.min(Math.max(dS, lo), dA)
      if (dA - dS < c * 0.8) dS = Math.max(lo, dA - c * 0.8)
    }
  }
  dS = Math.max(0, Math.min(dS, dA))
  return { dS, dA }
})
const onLine = (d: number): Pt => ({ x: origin.value.x + props.dir.x * d, y: origin.value.y + props.dir.y * d })
/** Last resort when the board is too small for the hand anywhere on the line. */
const inBounds = (p: Pt): Pt => {
  const b = props.bounds
  if (!b) return p
  const size = handSize.value
  const x = Math.min(Math.max(p.x, b.left + TIP_X * size), b.left + b.width - (1 - TIP_X) * size)
  const y = Math.min(Math.max(p.y, b.top + TIP_Y * size), b.top + b.height - (1 - TIP_Y) * size)
  return { x, y }
}

// ─── Timeline ────────────────────────────────────────────────────────────────
const ease = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

interface Frame {
  /** Hand opacity. */
  hand: number
  pressed: boolean
  /** Finger progress from the press point (0) to the release point (1). */
  drag: number
  /** Extra lift after release (cells along the line). */
  lift: number
  /** Touch ripple progress, or −1. */
  ripple: number
  /** Ghost line opacity. */
  line: number
  /** Ball progress along the flight, or −1 before release. */
  fly: number
  /** Ball / trail / numbers opacity (fades out at the end of every loop). */
  after: number
}

const frame = computed<Frame>(() => {
  const f: Frame = { hand: 0, pressed: false, drag: 0, lift: 0, ripple: -1, line: 0, fly: -1, after: 1 }
  let e = now.value % period.value
  if (e < APPEAR) {
    f.hand = e / APPEAR
    return f
  }
  if ((e -= APPEAR) < PRESS) {
    f.hand = 1
    f.pressed = e > PRESS * 0.35
    f.ripple = f.pressed ? (e - PRESS * 0.35) / (PRESS * 0.65 + 300 * K) : -1
    f.line = f.pressed ? 1 : 0
    return f
  }
  if ((e -= PRESS) < DRAG) {
    f.hand = 1
    f.pressed = true
    f.drag = ease(e / DRAG)
    const r = (PRESS * 0.65 + e) / (PRESS * 0.65 + 300 * K)
    f.ripple = r < 1 ? r : -1
    f.line = 1
    return f
  }
  if ((e -= DRAG) < HOLD) {
    f.hand = 1
    f.pressed = true
    f.drag = 1
    f.line = 1
    return f
  }
  if ((e -= HOLD) < RELEASE) {
    const k = e / RELEASE
    f.hand = 1 - k * 0.5
    f.drag = 1
    f.lift = k * 0.25
    f.line = 1 - k
    f.fly = 0
    return f
  }
  if ((e -= RELEASE) < flyMs.value) {
    // Lifted and dimmed, but still there: the ball in flight is the hand's.
    f.hand = 0.5 - Math.min(1, e / 260) * 0.15
    f.drag = 1
    f.lift = 0.25 + Math.min(1, e / 260) * 0.2
    f.fly = e / flyMs.value
    return f
  }
  if ((e -= flyMs.value) < END) {
    f.hand = 0.35 * (1 - clamp01(e / END))
    f.drag = 1
    f.lift = 0.45
    f.fly = 1
    f.after = 1 - clamp01(e / END)
    return f
  }
  // REST: nothing at all on screen.
  f.fly = -1
  f.after = 0
  return f
})

// ─── Drawing ─────────────────────────────────────────────────────────────────
/** Fingertip now. */
const tip = computed<Pt>(() => {
  const { dS, dA } = stroke.value
  const f = frame.value
  return inBounds(onLine(dS + (dA - dS) * f.drag + f.lift * props.cell))
})
const pressPt = computed<Pt>(() => inBounds(onLine(stroke.value.dS)))

/** The ghost line: launch point → fingertip, dashed and marching outward. */
const lineStyle = computed(() => {
  const c = props.cell
  const dash = Math.max(7, c * 0.3)
  const gap = Math.max(5, c * 0.2)
  return {
    strokeWidth: `${Math.max(3, c * 0.1)}px`,
    strokeDasharray: `${dash}px ${gap}px`,
    '--sd-dash': `${-(dash + gap)}px`,
    opacity: String(0.6 * frame.value.line)
  }
})

const ball = computed<Pt | null>(() => {
  const f = frame.value.fly
  if (f < 0) return null
  return along(flight.value.len * clamp01(f))
})
const ballR = computed(() => Math.max(6, props.cell * 0.2))
/** Teach: a short comet tail. Lessons: the flown path, so the bank reads —
 *  dashed and fading with everything else, never left standing. */
const trailPts = computed(() => {
  const f = frame.value.fly
  if (f <= 0) return ''
  const d = flight.value.len * clamp01(f)
  const from = props.tone === 'teach' ? d - props.cell * 1.6 : 0
  return span(from, d)
})

/** A soft ring where the teaching ball first touches something. */
const bounceRing = computed(() => {
  if (props.tone !== 'teach') return null
  const f = frame.value.fly
  const { pts, cum, len } = flight.value
  const at = cum[1]
  const p = pts[1]
  if (f < 0 || at === undefined || !p || pts.length < 3) return null
  const ms = ((len * clamp01(f) - at) / Math.max(1, len)) * flyMs.value
  if (ms < 0 || ms > 380 * K) return null
  const k = ms / (380 * K)
  return { x: p.x, y: p.y, r: props.cell * (0.25 + 0.4 * k), o: 1 - k }
})

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
  const b = props.bounds
  // Held inside the board like everything else (a contact on row 0 would
  // otherwise put the total over the top bar).
  const minY = b ? b.top + props.cell * 0.6 : -Infinity
  return { x: anchor.x, y: Math.max(minY, anchor.y - props.cell * 0.9) }
})

// ─── Hand ────────────────────────────────────────────────────────────────────
const handStyle = computed<Record<string, string>>(() => {
  const size = handSize.value
  const T = tip.value
  const f = frame.value
  return {
    left: `${T.x - TIP_X * size}px`,
    top: `${T.y - TIP_Y * size}px`,
    width: `${size}px`,
    height: `${size}px`,
    opacity: String(clamp01(f.hand) * 0.92),
    // Pivot on the fingertip, so a press never slides the tip off its point.
    transformOrigin: `${TIP_X * size}px ${TIP_Y * size}px`,
    transform: `scale(${f.pressed ? 0.9 : 1})`
  }
})

// Unique per instance: two demos on screen must never share one <defs> id.
const clipId = `fd-clip-${Math.random().toString(36).slice(2, 9)}`
const clipUrl = computed(() => (props.bounds ? `url(#${clipId})` : undefined))

const toneClass = computed(() => `fd--${props.tone}`)
</script>

<template lang="pug">
  div.finger-demo.fixed.inset-0.pointer-events-none(:class="toneClass" aria-hidden="true")
    svg.absolute.inset-0(width="100%" height="100%")
      defs(v-if="bounds")
        clipPath(:id="clipId")
          rect(:x="bounds.left" :y="bounds.top" :width="bounds.width" :height="bounds.height")
      g(:clip-path="clipUrl")
        //- The ghost aim line: launch point → fingertip. No end marker.
        line.fd-line(
          v-if="frame.line > 0"
          :x1="origin.x" :y1="origin.y" :x2="tip.x" :y2="tip.y"
          stroke-linecap="butt"
          :style="lineStyle"
        )
        //- Touch ripple where the finger lands.
        circle.fd-ripple(
          v-if="frame.ripple >= 0"
          :cx="pressPt.x" :cy="pressPt.y"
          :r="cell * (0.2 + 0.5 * frame.ripple)"
          :style="{ opacity: 1 - frame.ripple }"
        )
        g(:style="{ opacity: frame.after }")
          polyline.fd-trail(
            v-if="trailPts"
            :points="trailPts"
            fill="none" stroke-linecap="round" stroke-linejoin="round"
            :stroke-width="Math.max(3, cell * (tone === 'teach' ? 0.16 : 0.09))"
            :stroke-dasharray="tone === 'teach' ? undefined : Math.max(6, cell * 0.22) + ' ' + Math.max(4, cell * 0.14)"
          )
          circle.fd-ring(v-if="bounceRing" :cx="bounceRing.x" :cy="bounceRing.y" :r="bounceRing.r" :style="{ opacity: bounceRing.o }")
          //- Ghost ball — translucent, gone before the loop restarts.
          template(v-if="ball")
            circle.fd-ball-glow(:cx="ball.x" :cy="ball.y" :r="ballR * 1.9")
            circle.fd-ball(:cx="ball.x" :cy="ball.y" :r="ballR")
          //- Running hit counts.
          text.fd-pop.game-text(
            v-for="p in pops"
            :key="p.n"
            :x="p.x"
            :y="p.y - cell * 0.12"
            text-anchor="middle"
            dominant-baseline="middle"
            :font-size="popFont * (1 + 0.5 * Math.max(0, 1 - p.age * 3))"
          ) {{ p.n }}
          text.fd-total.game-text(
            v-if="totalAt"
            :x="totalAt.x"
            :y="totalAt.y"
            text-anchor="middle"
            dominant-baseline="middle"
            :font-size="Math.max(24, cell * 0.8)"
          ) {{ t('barrage.banners.comboHits', { n: total }) }}
    div.fd-hand.absolute(:style="handStyle")
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
.finger-demo
  z-index: 70
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5))

// Ghost line: white, see-through and always moving outward — a line of
// light, not a row of balls.
.fd-line
  stroke: #ffffff
  animation: fd-march 0.5s linear infinite
@keyframes fd-march
  to
    stroke-dashoffset: var(--sd-dash)
.fd-ripple
  fill: none
  stroke: rgba(255, 255, 255, 0.9)
  stroke-width: 3
.fd-trail
  stroke: rgba(255, 255, 255, 0.35)
.fd--combo .fd-trail
  stroke: rgba(255, 226, 122, 0.55)
.fd--survive .fd-trail
  stroke: rgba(255, 138, 90, 0.6)
.fd-ring
  fill: none
  stroke: rgba(255, 255, 255, 0.85)
  stroke-width: 2.5
.fd-ball
  fill: rgba(255, 244, 205, 0.72)
  stroke: rgba(255, 255, 255, 0.9)
  stroke-width: 1.5
.fd-ball-glow
  fill: rgba(255, 220, 120, 0.22)
.fd-pop
  fill: #ffe27a
  stroke: #000
  stroke-width: 3.5px
  paint-order: stroke
  font-weight: 900
.fd--survive .fd-pop
  fill: #ffffff
.fd-total
  fill: #ffe27a
  stroke: #000
  stroke-width: 5px
  paint-order: stroke
  font-weight: 900
  transform: rotate(-6deg)
  animation: fd-total 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)
  transform-box: fill-box
  transform-origin: center
@keyframes fd-total
  from
    transform: scale(1.9) rotate(-6deg)
    opacity: 0
  to
    transform: scale(1) rotate(-6deg)
    opacity: 1

.fd-hand
  z-index: 2

@media (prefers-reduced-motion: reduce)
  .fd-line
    animation-duration: 1.2s
</style>
