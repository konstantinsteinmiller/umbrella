<script setup lang="ts">
/**
 * Why "+1" did not add a shot — acted out on the real tray, wordless.
 *
 * Measured: at capacity 2 a collected "+1" became coins 61 % of the time and
 * the volley grew on 5 % of turns. The bubble says "+1"; the player expects
 * one more ball; the launcher still says ×2. So, on the tray itself:
 *
 *   1. the tray is FULL — a gold frame pulses round the sockets;
 *   2. a ghost "+1" drops onto it, finds no room, bounces off and bursts
 *      into a coin;
 *   3. a ghost socket slides in after the last one, and the hand presses the
 *      Tray Capacity chip (ringed; pressed only when it is affordable);
 *   4. the next ghost "+1" drops INTO the new socket, which lights up.
 *
 * Anchors: `[data-tut="tray"] .tray-slot` and `[data-tut="upgrade-capacity"]`.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { coinSrc } from '@/barrage/art'
import useBarrageUpgrades from '@/barrage/state/useBarrageUpgrades'

interface Box { left: number; top: number; width: number; height: number }

const { t } = useI18n()
const upgrades = useBarrageUpgrades()
/** The board bubble's own label (a number, but it is the tray's i18n string). */
const plusOne = computed(() => t('barrage.tray.plusOne'))
const canBuy = computed(() =>
  upgrades.freeCapacityOffer.value || !!upgrades.list.value.find((v) => v.id === 'capacity')?.affordable)

// ─── Anchors ─────────────────────────────────────────────────────────────────
const tray = ref<Box | null>(null)
const slots = ref<Box | null>(null)
const last = ref<Box | null>(null)
const chip = ref<Box | null>(null)

const box = (el: Element | null): Box | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
}
const measure = (): void => {
  const root = document.querySelector('[data-tut="tray"]')
  const all = root ? Array.from(root.querySelectorAll('.tray-slot')) : []
  tray.value = box(root)
  last.value = box(all[all.length - 1] ?? null)
  const first = box(all[0] ?? null)
  slots.value = first && last.value
    ? { left: first.left, top: Math.min(first.top, last.value.top), width: last.value.left + last.value.width - first.left, height: Math.max(first.height, last.value.height) }
    : null
  chip.value = box(document.querySelector('[data-tut="upgrade-capacity"]'))
}

// ─── Clock ───────────────────────────────────────────────────────────────────
const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const PERIOD = (reduced ? 1.4 : 1) * 4400
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
const easeIn = (x: number): number => x * x
const easeOut = (x: number): number => 1 - (1 - x) * (1 - x)

// ─── Pieces ──────────────────────────────────────────────────────────────────
const size = computed(() => Math.max(22, last.value?.height ?? 40))
/** The ghost socket: right after the last one, kept inside the tray. */
const ghostSlot = computed<Box | null>(() => {
  const l = last.value
  const tr = tray.value
  if (!l || !tr) return null
  const left = Math.min(l.left + l.width + 4, tr.left + tr.width - l.width - 2)
  return { left, top: l.top, width: l.width, height: l.height }
})

const frameStyle = computed<Record<string, string>>(() => {
  const s = slots.value
  const out: Record<string, string> = { display: 'none' }
  if (!s) return out
  const pad = 5
  // Full until the ghost socket opens up.
  const on = u.value < 0.52 ? 1 : 1 - seg(0.52, 0.6)
  return {
    left: `${s.left - pad}px`, top: `${s.top - pad}px`,
    width: `${s.width + pad * 2}px`, height: `${s.height + pad * 2}px`,
    opacity: String(on)
  }
})

/** Ghost "+1" #1: falls onto the full tray, bounces off, pops into a coin. */
const drop1 = computed<Record<string, string> | null>(() => {
  const l = last.value
  if (!l || u.value < 0.06 || u.value > 0.46) return null
  const s = size.value * 0.78
  const cx = l.left + l.width / 2
  const restY = l.top - s * 0.45
  const startY = l.top - size.value * 2.6
  let y: number
  let sq = 1
  if (u.value < 0.3) {
    y = startY + (restY - startY) * easeIn(seg(0.06, 0.3))
  } else {
    // Bounce off: no room.
    const k = seg(0.3, 0.46)
    y = restY - Math.sin(k * Math.PI) * size.value * 0.7
    sq = k < 0.15 ? 0.75 : 1
  }
  return {
    left: `${cx - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s}px`,
    transform: `scale(${1 / sq}, ${sq})`, opacity: String(u.value > 0.43 ? 0 : 1)
  }
})
/** …and turns into a coin that floats away. */
const coin = computed<Record<string, string> | null>(() => {
  const l = last.value
  if (!l || u.value < 0.43 || u.value > 0.62) return null
  const k = seg(0.43, 0.62)
  const s = size.value * 0.7
  const cx = l.left + l.width / 2 + k * s * 0.6
  const y = l.top - size.value * 0.9 - easeOut(k) * size.value * 1.2
  return { left: `${cx - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s}px`, opacity: String(1 - k * 0.9) }
})
const shakeX = computed(() => (u.value > 0.29 && u.value < 0.36 ? Math.sin(u.value * 900) * 3 : 0))

const ghostStyle = computed<Record<string, string> | null>(() => {
  const g = ghostSlot.value
  if (!g || u.value < 0.5) return null
  const k = easeOut(seg(0.5, 0.6))
  const fade = u.value > 0.95 ? 1 - seg(0.95, 1) : 1
  return {
    left: `${g.left}px`, top: `${g.top}px`, width: `${g.width}px`, height: `${g.height}px`,
    transform: `scale(${0.4 + 0.6 * k})`, opacity: String(k * fade)
  }
})
const ghostFilled = computed(() => u.value > 0.9)

/** Ghost "+1" #2: falls INTO the new socket. */
const drop2 = computed<Record<string, string> | null>(() => {
  const g = ghostSlot.value
  if (!g || u.value < 0.76 || u.value > 0.9) return null
  const s = size.value * 0.78
  const cx = g.left + g.width / 2
  const endY = g.top + g.height / 2
  const startY = g.top - size.value * 2.6
  const y = startY + (endY - startY) * easeIn(seg(0.76, 0.9))
  return { left: `${cx - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s}px` }
})

const chipRing = computed<Record<string, string> | null>(() => {
  const c = chip.value
  if (!c || u.value < 0.54 || u.value > 0.96) return null
  const pad = 5
  return { left: `${c.left - pad}px`, top: `${c.top - pad}px`, width: `${c.width + pad * 2}px`, height: `${c.height + pad * 2}px` }
})
const HAND = 46
const handStyle = computed<Record<string, string> | null>(() => {
  const c = chip.value
  if (!c || !canBuy.value || u.value < 0.56 || u.value > 0.84) return null
  const tipX = c.left + c.width * 0.68
  const tipY = c.top + c.height * 0.36
  const inK = easeOut(seg(0.56, 0.64))
  const press = u.value > 0.66 && u.value < 0.72
  const out = seg(0.76, 0.84)
  return {
    left: `${tipX - (18.5 / 64) * HAND + (1 - inK) * 14}px`,
    top: `${tipY - (4 / 64) * HAND + (1 - inK) * 20}px`,
    width: `${HAND}px`, height: `${HAND}px`,
    transformOrigin: `${(18.5 / 64) * HAND}px ${(4 / 64) * HAND}px`,
    transform: `scale(${press ? 0.9 : 1})`,
    opacity: String(inK * (1 - out))
  }
})
const ripple = computed<Record<string, string> | null>(() => {
  const c = chip.value
  if (!c || !canBuy.value || u.value < 0.68 || u.value > 0.8) return null
  const k = seg(0.68, 0.8)
  return {
    left: `${c.left + c.width * 0.68}px`, top: `${c.top + c.height * 0.36}px`,
    transform: `translate(-50%, -50%) scale(${0.3 + k * 1.3})`, opacity: String(1 - k)
  }
})
</script>

<template lang="pug">
  div.tray-demo.fixed.inset-0.pointer-events-none(aria-hidden="true")
    div.td-frame.absolute.rounded-2xl(:style="[frameStyle, { translate: shakeX + 'px 0' }]")
    div.td-bubble.absolute.rounded-full.flex.items-center.justify-center(v-if="drop1" :style="drop1")
      span.td-plus.game-text {{ plusOne }}
    img.td-coin.absolute(v-if="coin" :src="coinSrc()" :style="coin" alt="" draggable="false")
    div.td-socket.absolute.rounded-full.flex.items-center.justify-center(v-if="ghostStyle" :style="ghostStyle" :class="{ 'is-filled': ghostFilled }")
      span.td-plus.game-text(v-if="ghostFilled") {{ plusOne }}
      svg.td-add(v-else viewBox="0 0 24 24" width="55%" height="55%")
        path(d="M12 5 V19 M5 12 H19" stroke="currentColor" stroke-width="4" stroke-linecap="round")
    div.td-bubble.absolute.rounded-full.flex.items-center.justify-center(v-if="drop2" :style="drop2")
      span.td-plus.game-text {{ plusOne }}
    div.td-chip.absolute.rounded-xl(v-if="chipRing" :style="chipRing")
    div.td-ripple.absolute(v-if="ripple" :style="ripple")
    div.td-hand.absolute(v-if="handStyle" :style="handStyle")
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
.tray-demo
  z-index: 70

.td-frame
  border: 3px solid #ffd23c
  box-shadow: 0 0 12px rgba(255, 210, 60, 0.75), inset 0 0 10px rgba(255, 210, 60, 0.35)
  animation: td-pulse 0.6s ease-in-out infinite alternate
@keyframes td-pulse
  from
    border-color: rgba(255, 210, 60, 0.55)
  to
    border-color: rgba(255, 226, 90, 1)

// The board's "+1" bubble, as a DOM ghost.
.td-bubble
  background: radial-gradient(circle at 35% 30%, rgba(210, 255, 220, 0.55), rgba(90, 220, 130, 0.25) 60%, rgba(40, 140, 80, 0.2))
  border: 2.5px solid rgba(125, 255, 154, 0.95)
  box-shadow: 0 0 10px rgba(125, 255, 154, 0.7)
.td-plus
  color: #eaffd0
  font-weight: 900
  font-size: 13px
  line-height: 1
  -webkit-text-stroke: 3px #1f5a12
  paint-order: stroke fill

.td-coin
  object-fit: contain
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6))

.td-socket
  border: 3px dashed rgba(125, 255, 154, 0.95)
  background: rgba(20, 60, 36, 0.55)
  transform-origin: center
  transition: background 0.2s ease, box-shadow 0.2s ease
  &.is-filled
    border-style: solid
    background: rgba(90, 220, 130, 0.45)
    box-shadow: 0 0 14px rgba(125, 255, 154, 0.9)
.td-add
  color: #b8ffc8

.td-chip
  border: 3px dashed rgba(255, 226, 58, 0.95)
  animation: td-pulse 0.5s ease-in-out infinite alternate

.td-ripple
  width: 36px
  height: 36px
  border-radius: 50%
  border: 3px solid rgba(255, 255, 255, 0.9)

.td-hand
  filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.5))
</style>
