<script setup lang="ts">
/**
 * What the ball tray IS — acted out on the real tray, wordless, three acts.
 *
 * Play-test: "absolutely unclear what this does". Sockets, orbs with a number,
 * "4/10" — nothing said that these are the balls you shoot, that "+1" fills a
 * socket, or why two orbs sometimes become one bigger one. So:
 *
 *   1. YOUR SHOTS — each ball lifts out of its socket and flies into the unit,
 *      whose count ticks up (×1, ×2, …); then they leave the unit as a volley.
 *   2. "+1" FILLS A SOCKET — a "+1" bubble drops into the first empty socket,
 *      which lights up with a new ball.
 *   3. FULL → TWINS MERGE — the tray fills, one more "+1" lands, the two twins
 *      at the end slide together and become one ball of the next tier.
 *
 * Act 2 needs an empty socket and act 3 needs sockets at all: in the stacked
 * tray (large capacity) only act 1 plays. Anchors: `[data-tut="tray"]
 * .tray-slot` (`[data-slot]` on filled ones) and the unit (boardApi).
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import useBarrage from '@/barrage/state/useBarrage'
import { ballColors, fighterSrc } from '@/barrage/art'
import { boardApi } from '@/components/barrage/barrageUi'

const { t } = useI18n()
const barrage = useBarrage()

interface Box { left: number; top: number; width: number; height: number }
interface Pt { x: number; y: number }

// ─── Anchors ─────────────────────────────────────────────────────────────────
const tray = ref<Box | null>(null)
/** Every socket, filled or empty, in tray order. */
const sockets = ref<Box[]>([])
const filledCount = ref(0)
const stacked = ref(false)
const launcher = ref<Pt | null>(null)
const cell = ref(40)

const box = (el: Element | null): Box | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
}
const measure = (): void => {
  const root = document.querySelector('[data-tut="tray"]')
  tray.value = box(root)
  const all = root ? Array.from(root.querySelectorAll('.tray-slot')) : []
  sockets.value = all.map(box).filter((b): b is Box => b !== null)
  // Stacked mode shows one orb per tier (with a count): no empty sockets.
  stacked.value = !!root && !root.querySelector('.tray-socket') && barrage.tray.value.length > sockets.value.length
  filledCount.value = Math.min(sockets.value.length, barrage.tray.value.length)
  const b = boardApi.value
  launcher.value = b?.launcherClientPoint() ?? null
  const o = b?.cellToClient(0, 0)
  const o1 = b?.cellToClient(1, 0)
  if (o && o1) cell.value = Math.max(16, o1.x - o.x)
}

// ─── Clock ───────────────────────────────────────────────────────────────────
const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const PERIOD = (reduced ? 1.4 : 1) * 7200
const u = ref(0)
let t0 = 0
let raf = 0
let poll = 0
const tick = (t: number): void => {
  if (!t0) t0 = t
  u.value = ((t - t0) % PERIOD) / PERIOD
  raf = requestAnimationFrame(tick)
}
onMounted(() => {
  measure()
  raf = requestAnimationFrame(tick)
  poll = window.setInterval(measure, 300)
  window.addEventListener('resize', measure)
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  window.clearInterval(poll)
  window.removeEventListener('resize', measure)
})

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const seg = (a: number, b: number): number => clamp01((u.value - a) / (b - a))
const easeOut = (x: number): number => 1 - (1 - x) * (1 - x)
const easeIn = (x: number): number => x * x
const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const centre = (b: Box): Pt => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 })
const orbStyle = (tier: number, x: number, y: number, size: number, alpha = 1, scale = 1): Record<string, string> => {
  const c = ballColors(tier)
  return {
    left: `${x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px`,
    opacity: String(alpha), transform: `scale(${scale})`,
    '--rim': c.glow, '--body': c.body, '--light': c.light
  }
}

const tiers = computed(() => barrage.tray.value)
const orbSize = computed(() => Math.max(18, (sockets.value[0]?.height ?? 40) * 0.92))
const emptyIdx = computed(() => (stacked.value ? -1 : filledCount.value < sockets.value.length ? filledCount.value : -1))
const hasAct2 = computed(() => emptyIdx.value >= 0)
const hasAct3 = computed(() => !stacked.value && sockets.value.length >= 2)

// ─── Act 1: your shots ───────────────────────────────────────────────────────
const A1_END = 0.34
const shooters = computed(() => Math.min(6, stacked.value ? sockets.value.length : filledCount.value))
const liftAt = (i: number): number => 0.03 + i * 0.03
const act1Orbs = computed(() => {
  const L = launcher.value
  if (!L || u.value > A1_END) return []
  const out: { key: number; style: Record<string, string> }[] = []
  for (let i = 0; i < shooters.value; i++) {
    const s = sockets.value[i]
    if (!s) continue
    const start = centre(s)
    const t = liftAt(i)
    const k = seg(t, t + 0.085)
    if (k <= 0) continue
    // In the unit: wait, then leave upward in the volley (one after another).
    const fireAt = 0.25 + i * 0.012
    let x: number
    let y: number
    let alpha = 1
    let size = orbSize.value
    if (u.value < fireAt) {
      const e = easeInOut(k)
      x = start.x + (L.x - start.x) * e
      y = start.y + (L.y - start.y) * e - Math.sin(Math.PI * e) * cell.value * 1.2
      size *= 1 - 0.45 * e
      alpha = k >= 1 ? 0.35 : 1
    } else {
      const f = seg(fireAt, fireAt + 0.06)
      x = L.x
      y = L.y - easeOut(f) * cell.value * 5
      size *= 0.55
      alpha = 1 - f
    }
    out.push({ key: i, style: orbStyle(tiers.value[i] ?? 1, x, y, size, alpha) })
  }
  return out
})
/** The unit's count ticking up as each ball arrives (×1, ×2, …). */
const unitCount = computed(() => {
  if (u.value > 0.25 || u.value < liftAt(0) + 0.085) return 0
  let n = 0
  for (let i = 0; i < shooters.value; i++) if (u.value >= liftAt(i) + 0.085) n++
  return n
})
const unitCountStyle = computed<Record<string, string> | null>(() => {
  const L = launcher.value
  if (!L || unitCount.value === 0) return null
  return { left: `${L.x + cell.value * 0.55}px`, top: `${L.y - cell.value * 0.55}px` }
})
/** Sockets whose ball is "in the unit" dim, like the real launch does. */
const dimmed = computed(() => {
  if (u.value > A1_END) return []
  const out: Box[] = []
  for (let i = 0; i < shooters.value; i++) {
    const s = sockets.value[i]
    if (s && u.value >= liftAt(i)) out.push(s)
  }
  return out
})

// ─── Act 2: "+1" fills an empty socket ───────────────────────────────────────
const A2 = [0.38, 0.6] as const
const act2Drop = computed<Record<string, string> | null>(() => {
  if (!hasAct2.value || u.value < A2[0] || u.value > 0.52) return null
  const s = sockets.value[emptyIdx.value]
  if (!s) return null
  const c = centre(s)
  const k = seg(A2[0], 0.52)
  const size = orbSize.value * 0.9
  const y = c.y - s.height * 2.6 + s.height * 2.6 * easeIn(k)
  return { left: `${c.x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px` }
})
const act2Fill = computed<Record<string, string> | null>(() => {
  if (!hasAct2.value || u.value < 0.52 || u.value > 0.66) return null
  const s = sockets.value[emptyIdx.value]
  if (!s) return null
  const c = centre(s)
  const pop = easeOut(seg(0.52, 0.56))
  return orbStyle(1, c.x, c.y, orbSize.value, u.value > 0.62 ? 1 - seg(0.62, 0.66) : 1, 0.5 + 0.5 * pop)
})

// ─── Act 3: full → twins merge ───────────────────────────────────────────────
const A3 = 0.66
/** "+1"s filling the remaining sockets (a full tray); the last two are the
 *  twins, drawn by act3Twins. */
const act3Fill = computed(() => {
  if (!hasAct3.value || u.value < A3 || u.value > 0.94) return []
  const n = sockets.value.length
  const k = easeOut(seg(A3, A3 + 0.03))
  const out: { key: number; style: Record<string, string> }[] = []
  for (let i = Math.max(0, filledCount.value); i < n - 2; i++) {
    const c = centre(sockets.value[i]!)
    out.push({ key: i, style: orbStyle(1, c.x, c.y, orbSize.value, k * fadeOut.value) })
  }
  return out
})
const fadeOut = computed(() => (u.value > 0.9 ? 1 - seg(0.9, 0.94) : 1))
const frameGold = computed(() => hasAct3.value && u.value >= A3 + 0.02 && u.value < 0.8)
const act3Drop = computed<Record<string, string> | null>(() => {
  if (!hasAct3.value || u.value < 0.7 || u.value > 0.77) return null
  const s = sockets.value[sockets.value.length - 1]
  if (!s) return null
  const c = centre(s)
  const size = orbSize.value * 0.9
  const k = seg(0.7, 0.77)
  const y = c.y - s.height * 2.6 + s.height * 2.2 * easeIn(k)
  return { left: `${c.x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px` }
})
/** The two twins at the end slide together and become the next tier. */
const twinTier = computed(() => {
  const n = sockets.value.length
  // A full tray of real balls keeps its real last two tiers only if they are
  // twins; otherwise the demo's ghosts are tier 1 — the pair is the lesson.
  const a = tiers.value[n - 2]
  const b = tiers.value[n - 1]
  return a !== undefined && a === b ? a : 1
})
const act3Twins = computed(() => {
  if (!hasAct3.value || u.value < A3 || u.value > 0.94) return []
  const n = sockets.value.length
  const A = sockets.value[n - 2]
  const B = sockets.value[n - 1]
  if (!A || !B) return []
  const a = centre(A)
  const b = centre(B)
  const slide = easeInOut(seg(0.77, 0.82))
  const merged = u.value >= 0.82
  const k = easeOut(seg(A3, A3 + 0.03))
  if (merged) {
    const pop = easeOut(seg(0.82, 0.86))
    return [{ key: 'm', style: orbStyle(twinTier.value + 1, a.x, a.y, orbSize.value, fadeOut.value, 0.8 + 0.35 * pop - 0.15 * seg(0.86, 0.9)) }]
  }
  return [
    { key: 'a', style: orbStyle(twinTier.value, a.x, a.y, orbSize.value, k) },
    { key: 'b', style: orbStyle(twinTier.value, b.x + (a.x - b.x) * slide, b.y + (a.y - b.y) * slide, orbSize.value, k) }
  ]
})
const mergeFlash = computed<Record<string, string> | null>(() => {
  if (!hasAct3.value || u.value < 0.81 || u.value > 0.88) return null
  const A = sockets.value[sockets.value.length - 2]
  if (!A) return null
  const c = centre(A)
  const k = seg(0.81, 0.88)
  const size = orbSize.value * (1 + 1.4 * k)
  return { left: `${c.x - size / 2}px`, top: `${c.y - size / 2}px`, width: `${size}px`, height: `${size}px`, opacity: String(1 - k) }
})

// ─── Frame round the tray ────────────────────────────────────────────────────
const frameStyle = computed<Record<string, string> | null>(() => {
  const all = sockets.value
  if (all.length === 0) return null
  const pad = 5
  let l = Infinity
  let tp = Infinity
  let r = -Infinity
  let bt = -Infinity
  for (const s of all) {
    l = Math.min(l, s.left)
    tp = Math.min(tp, s.top)
    r = Math.max(r, s.left + s.width)
    bt = Math.max(bt, s.top + s.height)
  }
  const on = u.value > 0.94 ? 1 - seg(0.94, 1) : 1
  return { left: `${l - pad}px`, top: `${tp - pad}px`, width: `${r - l + pad * 2}px`, height: `${bt - tp + pad * 2}px`, opacity: String(on) }
})

const plusOne = computed(() => t('barrage.tray.plusOne'))
const countText = (n: number): string => t('barrage.tray.stackCount', { n })
</script>

<template lang="pug">
  div.tray-intro.fixed.inset-0.pointer-events-none(aria-hidden="true")
    div.ti-frame.absolute.rounded-2xl(v-if="frameStyle" :style="frameStyle" :class="{ 'is-gold': frameGold }")
    //- Act 1 — the sockets a ball has left dim, the balls fly into the unit.
    div.ti-dim.absolute.rounded-full(
      v-for="(s, i) in dimmed"
      :key="'d' + i"
      :style="{ left: s.left + 'px', top: s.top + 'px', width: s.width + 'px', height: s.height + 'px' }"
    )
    div.ti-orb.absolute.rounded-full(v-for="o in act1Orbs" :key="'o' + o.key" :style="o.style")
      img.ti-orb__face(:src="fighterSrc(tiers[o.key] ?? 1)" alt="" draggable="false")
    span.ti-count.absolute.game-text(v-if="unitCountStyle" :key="unitCount" :style="unitCountStyle") {{ countText(unitCount) }}
    //- Act 2 — "+1" drops into the first empty socket.
    div.ti-bubble.absolute.rounded-full.flex.items-center.justify-center(v-if="act2Drop" :style="act2Drop")
      span.ti-plus.game-text {{ plusOne }}
    div.ti-orb.absolute.rounded-full.ti-orb--new(v-if="act2Fill" :style="act2Fill")
      img.ti-orb__face(:src="fighterSrc(1)" alt="" draggable="false")
    //- Act 3 — full: one more "+1", the twins merge.
    div.ti-orb.absolute.rounded-full.ti-orb--ghost(v-for="o in act3Fill" :key="'f' + o.key" :style="o.style")
      img.ti-orb__face(:src="fighterSrc(1)" alt="" draggable="false")
    div.ti-bubble.absolute.rounded-full.flex.items-center.justify-center(v-if="act3Drop" :style="act3Drop")
      span.ti-plus.game-text {{ plusOne }}
    div.ti-orb.absolute.rounded-full(v-for="o in act3Twins" :key="'t' + o.key" :style="o.style" :class="{ 'ti-orb--merged': o.key === 'm' }")
      img.ti-orb__face(:src="fighterSrc(o.key === 'm' ? twinTier + 1 : twinTier)" alt="" draggable="false")
    div.ti-flash.absolute.rounded-full(v-if="mergeFlash" :style="mergeFlash")
</template>

<style scoped lang="sass">
.tray-intro
  z-index: 70

.ti-frame
  border: 3px solid rgba(120, 220, 255, 0.95)
  box-shadow: 0 0 12px rgba(120, 220, 255, 0.7), inset 0 0 10px rgba(120, 220, 255, 0.3)
  transition: border-color 0.2s ease, box-shadow 0.2s ease
  &.is-gold
    border-color: #ffd23c
    box-shadow: 0 0 14px rgba(255, 210, 60, 0.85), inset 0 0 10px rgba(255, 210, 60, 0.35)

.ti-dim
  background: rgba(6, 10, 22, 0.6)

// The tray's own orb, as a ghost: element-coloured glass round the face.
.ti-orb
  border: 2.5px solid var(--rim)
  background: radial-gradient(circle at 35% 30%, var(--light), var(--body) 70%)
  box-shadow: 0 0 10px var(--rim)
  overflow: hidden
  transform-origin: center
.ti-orb__face
  width: 100%
  height: 100%
  object-fit: contain
.ti-orb--ghost
  filter: saturate(0.7) brightness(1.1)
.ti-orb--new
  box-shadow: 0 0 16px rgba(125, 255, 154, 0.95)
.ti-orb--merged
  box-shadow: 0 0 18px var(--rim), 0 0 6px #fff

.ti-bubble
  background: radial-gradient(circle at 35% 30%, rgba(210, 255, 220, 0.55), rgba(90, 220, 130, 0.25) 60%, rgba(40, 140, 80, 0.2))
  border: 2.5px solid rgba(125, 255, 154, 0.95)
  box-shadow: 0 0 10px rgba(125, 255, 154, 0.7)
.ti-plus
  color: #eaffd0
  font-weight: 900
  font-size: 13px
  line-height: 1
  -webkit-text-stroke: 3px #1f5a12
  paint-order: stroke fill

.ti-count
  translate: -50% -50%
  color: #fff
  font-weight: 900
  font-size: 22px
  line-height: 1
  -webkit-text-stroke: 4px #0b0e18
  paint-order: stroke fill
  animation: ti-count-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)
@keyframes ti-count-pop
  from
    scale: 1.7
  to
    scale: 1

.ti-flash
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95), rgba(255, 230, 140, 0.4) 50%, transparent 70%)
</style>
