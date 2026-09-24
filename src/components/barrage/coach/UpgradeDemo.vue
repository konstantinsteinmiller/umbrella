<script setup lang="ts">
/**
 * What an upgrade chip DOES — pressed, and its effect shown where it lands.
 *
 * A chip says "×1 → ×1.25" and a price. Play-testers who read it fine were
 * not sure everybody would connect it to the game, so the lesson draws the
 * connection: the hand presses the chip, a spark flies from it to the part of
 * the game it changes, and that part shows the change, wordless:
 *
 *   capacity — a new socket slides into the tray and a "+1" drops into it;
 *   damage   — the unit flares and the new multiplier pops over it;
 *   speed    — a fast stream of ghost balls leaves the unit;
 *   luck     — extra "+1" / coin bubbles pop onto the board;
 *   bounty   — coins pour into the wallet.
 *
 * Used by the FTUE's upgrade beat (the free Tray Capacity) and by the coach's
 * upgrade funnel. With `pay` (the funnel) the loop opens by PAYING: coins fly
 * from the wallet into the chip — along the screen edge when the straight way
 * would cross the board — before the hand presses it. Pointer-events none; a
 * JS clock drives every piece so the coins, the press and the effect stay in
 * step.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UpgradeId } from '@/barrage/engine/types'
import { COLS } from '@/barrage/engine/types'
import useBarrage from '@/barrage/state/useBarrage'
import useBarrageUpgrades from '@/barrage/state/useBarrageUpgrades'
import { coinSrc } from '@/barrage/art'
import { boardApi, upgradeValueKey, upgradeValueNumber } from '@/components/barrage/barrageUi'

const props = withDefaults(defineProps<{
  id: UpgradeId
  /** Draw the dashed ring round the chip (the FTUE draws its own hole). */
  ring?: boolean
  /** Open each loop with coins flying from the wallet into the chip. */
  pay?: boolean
}>(), { ring: true, pay: false })

const { t } = useI18n()
const barrage = useBarrage()
const upgrades = useBarrageUpgrades()

interface Box { left: number; top: number; width: number; height: number }
interface Pt { x: number; y: number }

// ─── Anchors ─────────────────────────────────────────────────────────────────
const chip = ref<Box | null>(null)
const tray = ref<Box | null>(null)
const lastSlot = ref<Box | null>(null)
const wallet = ref<Box | null>(null)
const board = ref<Box | null>(null)
const launcher = ref<Pt | null>(null)
const cell = ref(40)
const cells = ref<Pt[]>([])

const box = (el: Element | null): Box | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
}
const measure = (): void => {
  chip.value = box(document.querySelector(`[data-tut="upgrade-${props.id}"]`))
  const root = document.querySelector('[data-tut="tray"]')
  tray.value = box(root)
  const slots = root ? root.querySelectorAll('.tray-slot') : []
  lastSlot.value = box(slots[slots.length - 1] ?? null)
  wallet.value = box(document.querySelector('.coin-badge'))
  const b = boardApi.value
  const br = b?.boardClientRect() ?? null
  board.value = br && br.width > 0 ? { left: br.left, top: br.top, width: br.width, height: br.height } : null
  launcher.value = b?.launcherClientPoint() ?? null
  const o = b?.cellToClient(0, 0)
  const o1 = b?.cellToClient(1, 0)
  if (o && o1) cell.value = Math.max(16, o1.x - o.x)
  // Luck: two free cells in the middle rows get the new bubbles.
  const st = barrage.engine.value.state
  const taken = (c: number, r: number): boolean =>
    st.monsters.some((m) => c >= m.col && c < m.col + m.w && r >= m.row && r < m.row + m.h) ||
    st.pickups.some((p) => p.col === c && p.row === r)
  const free: Pt[] = []
  for (const [c, r] of [[1, 5], [5, 4], [3, 6], [2, 3], [4, 5], [0, 6], [6, 5]] as const) {
    if (c < COLS && !taken(c, r)) {
      const p = b?.cellToClient(c + 0.5, r + 0.5)
      if (p) free.push(p)
    }
    if (free.length >= 2) break
  }
  cells.value = free
}

// ─── Clock ───────────────────────────────────────────────────────────────────
const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const PERIOD = (reduced ? 1.4 : 1) * 3800
/** The paying pre-roll (`pay`): the coins' flight, then the loop proper. */
const PAY_MS = props.pay ? (reduced ? 1.4 : 1) * 1300 : 0
const u = ref(0)
/** Pre-roll progress 0..1 (1 once the loop proper runs). */
const payK = ref(1)
let t0 = 0
let raf = 0
let poll = 0
const tick = (t: number): void => {
  if (!t0) t0 = t
  const e = (t - t0) % (PAY_MS + PERIOD)
  payK.value = e < PAY_MS ? e / PAY_MS : 1
  u.value = e < PAY_MS ? 0 : (e - PAY_MS) / PERIOD
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
const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const fade = computed(() => (u.value > 0.9 ? 1 - seg(0.9, 1) : 1))

// ─── The chip, the hand, the press ───────────────────────────────────────────
const chipTip = computed<Pt | null>(() => {
  const c = chip.value
  return c ? { x: c.left + c.width * 0.68, y: c.top + c.height * 0.36 } : null
})
const chipCentre = computed<Pt | null>(() => {
  const c = chip.value
  return c ? { x: c.left + c.width / 2, y: c.top + c.height / 2 } : null
})
// ─── Paying: coins from the wallet into the chip ─────────────────────────────
/** The coins' route: straight when that stays off the board, else out to the
 *  nearer screen edge, down it, and in to the chip — the board's aim area is
 *  never crossed. */
const payRoute = computed<Pt[] | null>(() => {
  const w = wallet.value
  const c = chipCentre.value
  if (!props.pay || !w || !c) return null
  const W = { x: w.left + w.width * 0.2, y: w.top + w.height / 2 }
  const b = board.value
  const crosses = (a: Pt, z: Pt): boolean => {
    if (!b) return false
    for (let i = 1; i < 20; i++) {
      const x = a.x + ((z.x - a.x) * i) / 20
      const y = a.y + ((z.y - a.y) * i) / 20
      if (x > b.left && x < b.left + b.width && y > b.top && y < b.top + b.height) return true
    }
    return false
  }
  if (!crosses(W, c)) return [W, c]
  const vw = window.innerWidth
  const left = c.x < vw / 2
  const edgeX = left ? Math.max(9, (b?.left ?? 20) - 11) : Math.min(vw - 9, (b ? b.left + b.width : vw - 20) + 11)
  return [W, { x: edgeX, y: W.y }, { x: edgeX, y: c.y }, c]
})
/** Point at fraction `k` of the route's length. */
const alongRoute = (pts: Pt[], k: number): Pt => {
  const lens: number[] = []
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
    lens.push(l)
    total += l
  }
  let d = total * clamp01(k)
  for (let i = 1; i < pts.length; i++) {
    const l = lens[i - 1]!
    if (d <= l) {
      const q = l > 0 ? d / l : 0
      return { x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * q, y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * q }
    }
    d -= l
  }
  return pts[pts.length - 1]!
}
const PAY_COINS = 5
const payCoins = computed<{ x: number; y: number; a: number }[]>(() => {
  const route = payRoute.value
  if (!route || payK.value >= 1) return []
  const out: { x: number; y: number; a: number }[] = []
  for (let j = 0; j < PAY_COINS; j++) {
    const a = j * 0.08
    const k = clamp01((payK.value - a) / 0.62)
    if (k <= 0 || k >= 1) continue
    const p = alongRoute(route, easeInOut(k))
    out.push({ x: p.x, y: p.y, a: k > 0.9 ? (1 - k) * 10 : 1 })
  }
  return out
})
/** The chip lights up as the coins land in it. */
const paidStyle = computed<Record<string, string> | null>(() => {
  const c = chip.value
  if (!props.pay || !c || payK.value < 0.62 || payK.value >= 1) return null
  const k = clamp01((payK.value - 0.62) / 0.38)
  const pad = 2 + 6 * k
  return {
    left: `${c.left - pad}px`, top: `${c.top - pad}px`, width: `${c.width + pad * 2}px`, height: `${c.height + pad * 2}px`,
    opacity: String(1 - k)
  }
})

const ringStyle = computed<Record<string, string> | null>(() => {
  const c = chip.value
  if (!c || !props.ring) return null
  const pad = 5
  return {
    left: `${c.left - pad}px`, top: `${c.top - pad}px`, width: `${c.width + pad * 2}px`, height: `${c.height + pad * 2}px`,
    opacity: String(fade.value)
  }
})
const HAND = 46
const handStyle = computed<Record<string, string> | null>(() => {
  const p = chipTip.value
  if (!p || u.value > 0.34) return null
  const inK = easeOut(seg(0.02, 0.1))
  const pressed = u.value > 0.13 && u.value < 0.2
  const out = seg(0.26, 0.34)
  return {
    left: `${p.x - (18.5 / 64) * HAND + (1 - inK) * 14}px`,
    top: `${p.y - (4 / 64) * HAND + (1 - inK) * 20}px`,
    width: `${HAND}px`, height: `${HAND}px`,
    transformOrigin: `${(18.5 / 64) * HAND}px ${(4 / 64) * HAND}px`,
    transform: `scale(${pressed ? 0.9 : 1})`,
    opacity: String(inK * (1 - out))
  }
})
const rippleStyle = computed<Record<string, string> | null>(() => {
  const p = chipTip.value
  if (!p || u.value < 0.15 || u.value > 0.28) return null
  const k = seg(0.15, 0.28)
  return { left: `${p.x}px`, top: `${p.y}px`, transform: `translate(-50%, -50%) scale(${0.3 + k * 1.4})`, opacity: String(1 - k) }
})

// ─── Where the upgrade lands ─────────────────────────────────────────────────
const ghostSlot = computed<Box | null>(() => {
  const l = lastSlot.value
  const tr = tray.value
  if (!l || !tr) return null
  const left = Math.min(l.left + l.width + 4, tr.left + tr.width - l.width - 2)
  return { left, top: l.top, width: l.width, height: l.height }
})
const target = computed<Pt | null>(() => {
  switch (props.id) {
    case 'capacity': {
      const g = ghostSlot.value
      return g ? { x: g.left + g.width / 2, y: g.top + g.height / 2 } : null
    }
    case 'damage':
    case 'speed':
      return launcher.value
    case 'luck': {
      const c = cells.value
      if (c.length === 0) return launcher.value
      return { x: c.reduce((a, p) => a + p.x, 0) / c.length, y: c.reduce((a, p) => a + p.y, 0) / c.length }
    }
    case 'bounty': {
      const w = wallet.value
      return w ? { x: w.left + w.width / 2, y: w.top + w.height / 2 } : null
    }
    default:
      return null
  }
})

/** The spark: chip → target along an arc, with a short comet tail. */
const sparks = computed<{ x: number; y: number; r: number; a: number }[]>(() => {
  const a = chipCentre.value
  const b = target.value
  if (!a || !b || u.value < 0.22 || u.value > 0.46) return []
  const k = easeInOut(seg(0.22, 0.44))
  // The funnel runs while the player aims: its spark keeps low, off the board.
  const lift = Math.min(props.pay ? 30 : 160, Math.hypot(b.x - a.x, b.y - a.y) * 0.35)
  const at = (q: number): Pt => ({
    x: a.x + (b.x - a.x) * q,
    y: a.y + (b.y - a.y) * q - Math.sin(Math.PI * q) * lift
  })
  const out: { x: number; y: number; r: number; a: number }[] = []
  for (let j = 0; j < 5; j++) {
    const q = Math.max(0, k - j * 0.035)
    const p = at(q)
    out.push({ x: p.x, y: p.y, r: 9 - j * 1.4, a: (1 - j * 0.18) * (u.value > 0.44 ? 1 - seg(0.44, 0.46) : 1) })
  }
  return out
})

const effectK = computed(() => (u.value < 0.44 ? 0 : seg(0.44, 0.52)))
/** The value the chip is about to buy, in the chip's own format. */
const nextText = computed(() => {
  const view = upgrades.list.value.find((v) => v.id === props.id)
  if (!view || view.nextValue === null) return ''
  return t(upgradeValueKey(props.id), { n: upgradeValueNumber(props.id, view.nextValue) })
})
const valuePop = computed<Record<string, string> | null>(() => {
  const p = target.value
  if (!p || effectK.value <= 0 || props.id === 'capacity' || !nextText.value) return null
  const k = seg(0.46, 0.8)
  const baseY = props.id === 'bounty' ? p.y + 26 : p.y - cell.value * 0.9
  return {
    left: `${p.x}px`, top: `${baseY - easeOut(k) * 18}px`,
    transform: `translate(-50%, -50%) scale(${0.6 + 0.5 * easeOut(seg(0.46, 0.54))})`,
    opacity: String(fade.value * (u.value > 0.82 ? 1 - seg(0.82, 0.9) : 1))
  }
})

// capacity
const socketStyle = computed<Record<string, string> | null>(() => {
  const g = ghostSlot.value
  if (props.id !== 'capacity' || !g || effectK.value <= 0) return null
  return {
    left: `${g.left}px`, top: `${g.top}px`, width: `${g.width}px`, height: `${g.height}px`,
    transform: `scale(${0.4 + 0.6 * easeOut(effectK.value)})`, opacity: String(fade.value)
  }
})
const socketFilled = computed(() => u.value > 0.78)
const dropStyle = computed<Record<string, string> | null>(() => {
  const g = ghostSlot.value
  if (props.id !== 'capacity' || !g || u.value < 0.62 || u.value > 0.78) return null
  const s = g.height * 0.78
  const k = seg(0.62, 0.78)
  const y = g.top - g.height * 2.4 + (g.height * 2.4 + g.height / 2) * k * k
  return { left: `${g.left + g.width / 2 - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s}px` }
})

// damage + speed: a burst ring on the unit
const burstStyle = computed<Record<string, string> | null>(() => {
  const p = launcher.value
  if ((props.id !== 'damage' && props.id !== 'speed') || !p || effectK.value <= 0) return null
  const k = seg(0.44, 0.7)
  const size = cell.value * (0.8 + 1.8 * easeOut(k))
  return { left: `${p.x}px`, top: `${p.y}px`, width: `${size}px`, height: `${size}px`, opacity: String((1 - k) * fade.value) }
})
// speed: a quick stream of ghost balls
const streamBalls = computed<{ x: number; y: number; a: number }[]>(() => {
  const p = launcher.value
  if (props.id !== 'speed' || !p || u.value < 0.48 || u.value > 0.9) return []
  const out: { x: number; y: number; a: number }[] = []
  for (let j = 0; j < 5; j++) {
    const k = seg(0.48 + j * 0.035, 0.66 + j * 0.035)
    if (k <= 0 || k >= 1) continue
    out.push({ x: p.x, y: p.y - easeOut(k) * cell.value * 4.5, a: 1 - k })
  }
  return out
})
// luck: new bubbles pop onto the board
const luckBubbles = computed<{ x: number; y: number; s: number; coin: boolean }[]>(() => {
  if (props.id !== 'luck' || effectK.value <= 0) return []
  return cells.value.map((p, i) => ({
    x: p.x, y: p.y, coin: i === 1,
    s: cell.value * 0.72 * easeOut(seg(0.46 + i * 0.06, 0.56 + i * 0.06)) * fade.value
  })).filter((b) => b.s > 0.5)
})
// bounty: coins pour into the wallet
const pourCoins = computed<{ x: number; y: number; a: number }[]>(() => {
  const w = wallet.value
  if (props.id !== 'bounty' || !w || u.value < 0.46 || u.value > 0.86) return []
  const cx = w.left + w.width / 2
  const out: { x: number; y: number; a: number }[] = []
  for (let j = 0; j < 4; j++) {
    const k = seg(0.46 + j * 0.05, 0.62 + j * 0.05)
    if (k <= 0 || k >= 1) continue
    out.push({ x: cx + (j - 1.5) * 10 * (1 - k), y: w.top + w.height / 2 + 60 * (1 - k), a: 1 - k * 0.6 })
  }
  return out
})
const walletPulse = computed<Record<string, string> | null>(() => {
  const w = wallet.value
  if (props.id !== 'bounty' || !w || u.value < 0.5 || u.value > 0.88) return null
  const k = seg(0.5, 0.88)
  const pad = 4 + 10 * k
  return {
    left: `${w.left - pad}px`, top: `${w.top - pad}px`, width: `${w.width + pad * 2}px`, height: `${w.height + pad * 2}px`,
    opacity: String(1 - k)
  }
})

const plusOne = computed(() => t('barrage.tray.plusOne'))
</script>

<template lang="pug">
  div.upgrade-demo.fixed.inset-0.pointer-events-none(aria-hidden="true")
    div.ud-ring.absolute.rounded-xl(v-if="ringStyle" :style="ringStyle")
    //- Paying: the wallet's coins into the chip.
    img.ud-coin.ud-coin--pay.absolute(
      v-for="(c, i) in payCoins"
      :key="'p' + i"
      :src="coinSrc()"
      :style="{ left: c.x + 'px', top: c.y + 'px', opacity: c.a }"
      alt=""
      draggable="false"
    )
    div.ud-paid.absolute.rounded-xl(v-if="paidStyle" :style="paidStyle")
    //- The spark from the chip to what it changes.
    div.ud-spark.absolute.rounded-full(
      v-for="(p, i) in sparks"
      :key="'s' + i"
      :style="{ left: p.x + 'px', top: p.y + 'px', width: p.r * 2 + 'px', height: p.r * 2 + 'px', opacity: p.a }"
    )
    //- capacity
    div.ud-socket.absolute.rounded-full.flex.items-center.justify-center(v-if="socketStyle" :style="socketStyle" :class="{ 'is-filled': socketFilled }")
      span.ud-plus.game-text(v-if="socketFilled") {{ plusOne }}
      svg.ud-add(v-else viewBox="0 0 24 24" width="55%" height="55%")
        path(d="M12 5 V19 M5 12 H19" stroke="currentColor" stroke-width="4" stroke-linecap="round")
    div.ud-bubble.absolute.rounded-full.flex.items-center.justify-center(v-if="dropStyle" :style="dropStyle")
      span.ud-plus.game-text {{ plusOne }}
    //- damage / speed
    div.ud-burst.absolute.rounded-full(v-if="burstStyle" :style="burstStyle" :class="'ud-burst--' + id")
    div.ud-ball.absolute.rounded-full(
      v-for="(b, i) in streamBalls"
      :key="'b' + i"
      :style="{ left: b.x + 'px', top: b.y + 'px', opacity: b.a }"
    )
    //- luck
    div.ud-bubble.absolute.rounded-full.flex.items-center.justify-center(
      v-for="(b, i) in luckBubbles"
      :key="'l' + i"
      :class="{ 'ud-bubble--coin': b.coin }"
      :style="{ left: (b.x - b.s / 2) + 'px', top: (b.y - b.s / 2) + 'px', width: b.s + 'px', height: b.s + 'px' }"
    )
      img.ud-coin-in(v-if="b.coin" :src="coinSrc()" alt="" draggable="false")
      span.ud-plus.game-text(v-else) {{ plusOne }}
    //- bounty
    img.ud-coin.absolute(
      v-for="(c, i) in pourCoins"
      :key="'c' + i"
      :src="coinSrc()"
      :style="{ left: c.x + 'px', top: c.y + 'px', opacity: c.a }"
      alt=""
      draggable="false"
    )
    div.ud-wallet.absolute.rounded-full(v-if="walletPulse" :style="walletPulse")
    //- The value it buys, over the spot it changes.
    span.ud-value.absolute.game-text(v-if="valuePop" :style="valuePop") {{ nextText }}
    //- The hand and its press.
    div.ud-ripple.absolute(v-if="rippleStyle" :style="rippleStyle")
    div.ud-hand.absolute(v-if="handStyle" :style="handStyle")
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
.upgrade-demo
  z-index: 71

.ud-ring
  border: 3px dashed rgba(255, 226, 58, 0.95)
  animation: ud-pulse 0.5s ease-in-out infinite alternate
@keyframes ud-pulse
  from
    border-color: rgba(255, 226, 58, 0.5)
  to
    border-color: rgba(255, 236, 110, 1)

.ud-spark
  translate: -50% -50%
  background: radial-gradient(circle, #fffbe0 0%, #ffd23c 45%, rgba(255, 170, 40, 0) 72%)
  filter: drop-shadow(0 0 6px rgba(255, 210, 60, 0.9))

.ud-socket
  border: 3px dashed rgba(125, 255, 154, 0.95)
  background: rgba(20, 60, 36, 0.55)
  transform-origin: center
  &.is-filled
    border-style: solid
    background: rgba(90, 220, 130, 0.45)
    box-shadow: 0 0 14px rgba(125, 255, 154, 0.9)
.ud-add
  color: #b8ffc8
.ud-bubble
  background: radial-gradient(circle at 35% 30%, rgba(210, 255, 220, 0.55), rgba(90, 220, 130, 0.25) 60%, rgba(40, 140, 80, 0.2))
  border: 2.5px solid rgba(125, 255, 154, 0.95)
  box-shadow: 0 0 10px rgba(125, 255, 154, 0.7)
.ud-bubble--coin
  background: radial-gradient(circle at 35% 30%, rgba(255, 245, 200, 0.5), rgba(255, 200, 60, 0.22) 60%)
  border-color: rgba(255, 210, 60, 0.95)
  box-shadow: 0 0 10px rgba(255, 210, 60, 0.7)
.ud-coin-in
  width: 62%
  height: 62%
  object-fit: contain
.ud-plus
  color: #eaffd0
  font-weight: 900
  font-size: 13px
  line-height: 1
  -webkit-text-stroke: 3px #1f5a12
  paint-order: stroke fill

.ud-burst
  translate: -50% -50%
  border: 4px solid #ff8a3c
  box-shadow: 0 0 16px rgba(255, 120, 40, 0.9), inset 0 0 12px rgba(255, 160, 60, 0.6)
.ud-burst--speed
  border-color: #9fd8ff
  box-shadow: 0 0 16px rgba(120, 200, 255, 0.9), inset 0 0 12px rgba(160, 220, 255, 0.6)
.ud-ball
  width: 14px
  height: 14px
  translate: -50% -50%
  background: radial-gradient(circle at 35% 30%, #fff, #ffe27a 40%, #f08a1c)
  box-shadow: 0 0 8px rgba(255, 210, 90, 0.9)
.ud-coin
  width: 20px
  height: 20px
  translate: -50% -50%
  object-fit: contain
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.6))
.ud-coin--pay
  width: 18px
  height: 18px
  filter: drop-shadow(0 0 4px rgba(255, 210, 60, 0.9)) drop-shadow(0 2px 2px rgba(0, 0, 0, 0.6))
.ud-paid
  border: 3px solid rgba(255, 226, 90, 0.95)
  box-shadow: 0 0 16px rgba(255, 210, 60, 0.9), inset 0 0 12px rgba(255, 210, 60, 0.6)
.ud-wallet
  border: 3px solid rgba(255, 210, 60, 0.95)
  box-shadow: 0 0 12px rgba(255, 210, 60, 0.8)

.ud-value
  color: #ffe27a
  font-weight: 900
  font-size: 22px
  line-height: 1
  white-space: nowrap
  -webkit-text-stroke: 4px #000
  paint-order: stroke fill

.ud-ripple
  width: 36px
  height: 36px
  border-radius: 50%
  border: 3px solid rgba(255, 255, 255, 0.9)
.ud-hand
  filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.5))
</style>
