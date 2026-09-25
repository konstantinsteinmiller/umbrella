<script setup lang="ts">
/**
 * The threat spotlight (`lessonSpotlight.ts`, kind `threat`) — the countdown
 * on the launcher, staged (after playtest run 11: both losses had the '1' and
 * its tether up, unread). The game is paused; beats (THREAT_BEATS):
 *
 *   open    — everything dims; the monster with the fewest marches and the
 *             unit are lit, both wearing the same pip (N), a dashed tether
 *             between them.
 *   march   — a ghost of the monster steps down at its real pace, one beat a
 *             march; as each step lands BOTH pips tick down together (the old
 *             digit drops out), so the unit's number is the monster's.
 *   breach  — the last step crosses the line: the line flares, the unit's pip
 *             turns into a skull and the unit is struck.
 *   rewind  — the ghost fades; the monster and both pips are back at N.
 *   shot    — an aim line from the unit to it, a ghost ball, a hit: both pips
 *             and the tether are gone, a check on the unit's shoulder.
 *
 * Reduced motion: the same beats as cuts — no slides, no shake.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import useBarrage from '@/barrage/state/useBarrage'
import { bossSrc, monsterSrc } from '@/barrage/art'
import { ROWS, type MonsterKind } from '@/barrage/engine/types'
import { PIP_CELLS, launcherPipCell, monsterPipCell } from '@/barrage/render/danger'
import { boardApi } from '@/components/barrage/barrageUi'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import SpotMask from '@/components/barrage/coach/SpotMask.vue'
import {
  THREAT_BEATS, THREAT_STEP_MS, type Spot, type SpotHole, type ThreatSpot
} from '@/components/barrage/lessonSpotlight'

const props = defineProps<{ spot: Spot & ThreatSpot; now: number; reduced: boolean }>()

interface Pt { x: number; y: number }
interface Geo {
  cell: number
  /** Client px of cell (0, 0): the board maps cells linearly. */
  origin: Pt
  kind: MonsterKind
  col: number
  row: number
  w: number
  h: number
  src: string
  lineY: number
  left: number
  right: number
  unit: Pt
  lpip: Pt
}

const barrage = useBarrage()
const geo = ref<Geo | null>(null)
const measure = (): void => {
  const api = boardApi.value
  const st = barrage.engine.value.state
  const m = st.monsters.find((x) => x.id === props.spot.monsterId)
  const o = api?.cellToClient(0, 0)
  const o1 = api?.cellToClient(1, 0)
  const unit = api?.launcherClientPoint() ?? null
  const b = api?.boardClientRect() ?? null
  if (!api || !m || !o || !o1 || !unit || !b) {
    geo.value = null
    return
  }
  const cell = Math.max(8, o1.x - o.x)
  const lp = launcherPipCell(st.launcherX, cell)
  geo.value = {
    cell,
    origin: o,
    kind: m.kind,
    col: m.col,
    row: m.row,
    w: m.w,
    h: m.h,
    src: m.kind === 'boss' ? bossSrc(m.bossKind ?? 'slime-tower') : monsterSrc(m.kind),
    lineY: o.y + ROWS * cell,
    left: b.left,
    right: b.left + b.width,
    unit,
    lpip: { x: o.x + lp.x * cell, y: o.y + lp.y * cell }
  }
}
watch(() => props.spot.seq, measure)
onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onUnmounted(() => window.removeEventListener('resize', measure))

// ─── Clock ───────────────────────────────────────────────────────────────────
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const seg = (a: number, b: number): number => clamp01((props.now - a) / Math.max(1, b - a))
const easeOut = (x: number): number => 1 - (1 - x) * (1 - x)
const easeOutBack = (x: number): number => {
  const c = 1.7
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2)
}
/** A step's slide; the pips tick as it lands. */
const SLIDE = 260
const n = computed(() => props.spot.plan.length)
const tMarch = THREAT_BEATS.open
const tBreach = computed(() => tMarch + n.value * THREAT_STEP_MS)
const tRewind = computed(() => tBreach.value + THREAT_BEATS.breach)
const tShot = computed(() => tRewind.value + THREAT_BEATS.rewind)
/** The ghost ball lands. */
const tHit = computed(() => tShot.value + 620)
type Phase = 'march' | 'breach' | 'rewind' | 'shot'
const phase = computed<Phase>(() =>
  props.now < tBreach.value ? 'march' : props.now < tRewind.value ? 'breach' : props.now < tShot.value ? 'rewind' : 'shot')

const toC = (x: number, y: number): Pt => {
  const g = geo.value!
  return { x: g.origin.x + x * g.cell, y: g.origin.y + y * g.cell }
}

// ─── The march ───────────────────────────────────────────────────────────────
const rows = computed(() => [geo.value?.row ?? 0, ...props.spot.plan])
const tickAt = (k: number): number => tMarch + k * THREAT_STEP_MS + SLIDE
/** Ticks so far: marches left as the pips show them = n − ticks. */
const ticks = computed(() => {
  let c = 0
  for (let k = 0; k < n.value; k++) if (props.now >= tickAt(k)) c++
  return c
})
const left = computed(() => n.value - ticks.value)
/** 0..1 since the last tick (1 = none yet): the old digit's fall. */
const dropK = computed(() => (ticks.value === 0 ? 1 : seg(tickAt(ticks.value - 1), tickAt(ticks.value - 1) + 450)))
const ghostRow = computed(() => {
  const r = rows.value
  const t = props.now
  if (t < tMarch) return r[0]!
  if (t >= tBreach.value) return r[n.value]! + (props.reduced ? 0 : 0.3 * easeOut(seg(tBreach.value, tBreach.value + 300)))
  const k = Math.min(n.value - 1, Math.floor((t - tMarch) / THREAT_STEP_MS))
  const local = t - tMarch - k * THREAT_STEP_MS
  const u = props.reduced ? (local >= SLIDE ? 1 : 0) : easeOutBack(clamp01(local / SLIDE))
  return r[k]! + (r[k + 1]! - r[k]!) * u
})
/** The ghost stands where the pips are read: marching, or back at its start. */
const bodyRow = computed(() => (phase.value === 'march' || phase.value === 'breach' ? ghostRow.value : rows.value[0]!))

const rectAt = (row: number): { x: number; y: number; w: number; h: number } | null => {
  const g = geo.value
  if (!g) return null
  const a = toC(g.col, row)
  return { x: a.x, y: a.y, w: g.w * g.cell, h: g.h * g.cell }
}
/** The real monster (and the board's own pip on it) disappears while its
 *  ghost is the one marching, and again once the ghost shot takes it out —
 *  there is only ever one of it on the stage. */
const shroudStyle = computed<Record<string, string> | null>(() => {
  const g = geo.value
  if (!g) return null
  let o = 0
  if (phase.value === 'march') o = seg(tMarch, tMarch + 180)
  else if (phase.value === 'breach') o = 1
  else if (phase.value === 'rewind') o = 1 - seg(tRewind.value, tRewind.value + 300)
  else o = seg(tHit.value + 40, tHit.value + 220)
  if (o <= 0.01) return null
  const r = rectAt(rows.value[0]!)!
  const pad = g.cell * 0.3
  return {
    left: `${r.x - pad}px`, top: `${r.y - pad}px`, width: `${r.w + pad * 2}px`, height: `${r.h + pad * 2}px`,
    opacity: String(o)
  }
})
const ghostStyle = computed<Record<string, string> | null>(() => {
  if (phase.value === 'shot') return null
  const r = rectAt(ghostRow.value)
  if (!r) return null
  let op = 0.3 + 0.62 * seg(tMarch - 150, tMarch + 120)
  if (phase.value === 'rewind') op *= 1 - seg(tRewind.value, tRewind.value + 260)
  return { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, opacity: String(op) }
})

// ─── Pips ────────────────────────────────────────────────────────────────────
interface PipView { x: number; y: number; size: number; digit: number | null; icon: 'skull' | 'check' | null; tone: 'amber' | 'red' | 'green'; scale: number; alpha: number }
const toneOf = (d: number): 'amber' | 'red' => (d <= 1 ? 'red' : 'amber')
const monsterPipAt = (row: number): Pt & { size: number } | null => {
  const g = geo.value
  if (!g) return null
  const p = monsterPipCell({ kind: g.kind, col: g.col, row }, g.cell)
  return { ...toC(p.x, p.y), size: p.s * g.cell }
}
/** Popping back in at the rewind, and out at the hit. */
const backIn = computed(() => (props.reduced ? 1 : easeOutBack(seg(tRewind.value + 140, tRewind.value + 400))))
const hitOut = computed(() => 1 - seg(tHit.value + 40, tHit.value + 240))
const monsterPip = computed<PipView | null>(() => {
  const at = monsterPipAt(bodyRow.value)
  if (!at) return null
  const base = { x: at.x, y: at.y, size: at.size, icon: null, alpha: 1 }
  if (phase.value === 'march') {
    if (left.value < 1) return null
    return { ...base, digit: left.value, tone: toneOf(left.value), scale: 1 + 0.35 * (1 - dropK.value) * (props.reduced ? 0 : 1) }
  }
  if (phase.value === 'breach') return null
  const s = phase.value === 'rewind' ? backIn.value : hitOut.value
  if (s <= 0.01) return null
  return { ...base, digit: n.value, tone: toneOf(n.value), scale: s }
})
const launcherPip = computed<PipView | null>(() => {
  const g = geo.value
  if (!g) return null
  const size = PIP_CELLS.launcher * g.cell
  const base = { x: g.lpip.x, y: g.lpip.y, size, alpha: 1 }
  if (phase.value === 'march') {
    if (left.value < 1) return { ...base, digit: null, icon: 'skull', tone: 'red', scale: 1.15 }
    return { ...base, digit: left.value, icon: null, tone: toneOf(left.value), scale: 1 + 0.35 * (1 - dropK.value) * (props.reduced ? 0 : 1) }
  }
  if (phase.value === 'breach') {
    const shake = props.reduced ? 0 : Math.sin(props.now * 0.09) * 3 * (1 - seg(tBreach.value, tRewind.value))
    return { ...base, x: base.x + shake, digit: null, icon: 'skull', tone: 'red', scale: 1.2 }
  }
  if (phase.value === 'rewind') return { ...base, digit: n.value, icon: null, tone: toneOf(n.value), scale: backIn.value }
  if (props.now < tHit.value + 60) return { ...base, digit: n.value, icon: null, tone: toneOf(n.value), scale: 1 }
  // Defused: the count is gone — a check, then it fades with the stage.
  const pop = props.reduced ? 1 : easeOutBack(seg(tHit.value + 60, tHit.value + 300))
  return { ...base, digit: null, icon: 'check', tone: 'green', scale: pop }
})
const pipStyle = (p: PipView): Record<string, string> => ({
  left: `${p.x}px`, top: `${p.y}px`, width: `${p.size}px`, height: `${p.size}px`,
  transform: `translate(-50%, -50%) scale(${p.scale})`, opacity: String(p.alpha),
  fontSize: `${p.size * 0.62}px`
})
/** The digit that just dropped out of a pip (march ticks only). */
const fallen = computed(() => {
  if (phase.value !== 'march' || props.reduced || ticks.value === 0 || dropK.value >= 1) return null
  const k = dropK.value
  return { digit: left.value + 1, k, alpha: clamp01(1 - k * 1.3) }
})
const fallStyle = (p: PipView): Record<string, string> => {
  const f = fallen.value!
  return {
    left: `${p.x}px`, top: `${p.y + p.size * (0.3 + 1.1 * f.k)}px`,
    fontSize: `${p.size * 0.5}px`, opacity: String(f.alpha)
  }
}

// ─── Lines, rings, the breach and the shot (one SVG) ─────────────────────────
const tether = computed<{ a: Pt; b: Pt; o: number } | null>(() => {
  const mp = monsterPip.value
  const lp = launcherPip.value
  if (!mp || !lp || lp.icon) return null
  const o = phase.value === 'shot' ? hitOut.value : phase.value === 'rewind' ? backIn.value : seg(80, tMarch)
  return { a: { x: mp.x, y: mp.y }, b: { x: lp.x, y: lp.y }, o: clamp01(o) }
})
/** The ring a tick throws off each pip. */
const tickRings = computed(() => {
  if (!fallen.value) return []
  const out: { x: number; y: number; r: number; o: number; red: boolean }[] = []
  for (const p of [monsterPip.value, launcherPip.value]) {
    if (!p) continue
    out.push({ x: p.x, y: p.y, r: p.size * (0.55 + 0.9 * fallen.value.k), o: 1 - fallen.value.k, red: left.value <= 1 })
  }
  return out
})
const breachK = computed(() => (phase.value === 'breach' ? seg(tBreach.value, tRewind.value) : -1))
const breachLine = computed(() => {
  const g = geo.value
  if (!g || breachK.value < 0) return null
  const pulse = props.reduced ? 0.8 : 0.55 + 0.45 * Math.abs(Math.sin(props.now * 0.02))
  return { x1: g.left, x2: g.right, y: g.lineY, o: pulse * (1 - breachK.value * 0.6), w: Math.max(4, g.cell * 0.14) }
})
const strike = computed(() => {
  const g = geo.value
  if (!g || breachK.value < 0) return null
  const k = seg(tBreach.value + 60, tBreach.value + 520)
  return { x: g.unit.x, y: g.unit.y, r: g.cell * (0.5 + 1.2 * k), o: 1 - k }
})
/** The real monster's centre (the shot's target). */
const target = computed<Pt | null>(() => {
  const g = geo.value
  if (!g) return null
  return toC(g.col + g.w / 2, rows.value[0]! + g.h / 2)
})
const aim = computed(() => {
  const g = geo.value
  const tg = target.value
  if (!g || !tg || phase.value !== 'shot') return null
  const grow = props.reduced ? 1 : easeOut(seg(tShot.value, tShot.value + 280))
  const fade = 1 - seg(tHit.value + 100, tHit.value + 330)
  return { a: g.unit, b: { x: g.unit.x + (tg.x - g.unit.x) * grow, y: g.unit.y + (tg.y - g.unit.y) * grow }, o: fade }
})
const ball = computed<Pt | null>(() => {
  const g = geo.value
  const tg = target.value
  if (!g || !tg || phase.value !== 'shot' || props.now < tShot.value + 280 || props.now > tHit.value) return null
  const k = props.reduced ? 1 : seg(tShot.value + 280, tHit.value)
  return { x: g.unit.x + (tg.x - g.unit.x) * k, y: g.unit.y + (tg.y - g.unit.y) * k }
})
const hitBurst = computed(() => {
  const g = geo.value
  const tg = target.value
  if (!g || !tg || props.now < tHit.value || props.now > tHit.value + 320) return null
  const k = seg(tHit.value, tHit.value + 320)
  return { x: tg.x, y: tg.y, r: g.cell * (0.4 + 1.1 * k), o: 1 - k }
})

// ─── The stage's windows ─────────────────────────────────────────────────────
const holes = computed<SpotHole[]>(() => {
  const g = geo.value
  if (!g) return []
  const k = props.reduced ? 1 : easeOut(seg(0, tMarch))
  const pad = g.cell * 0.32
  const r = rectAt(bodyRow.value)!
  const unitHole: SpotHole = { x: (g.unit.x + g.lpip.x) / 2, y: (g.unit.y + g.lpip.y) / 2 - g.cell * 0.1, r: g.cell * 1.55, k }
  const bodyHole: SpotHole = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2, k }
  return [unitHole, bodyHole]
})
</script>

<template lang="pug">
  div.threat-spot.absolute.inset-0(v-if="geo")
    SpotMask(:id="'ts-' + spot.seq" :holes="holes")
    div.ts-shroud.absolute.rounded-xl(v-if="shroudStyle" :style="shroudStyle")
    //- The ghost of the monster, marching.
    img.ts-ghost.absolute(v-if="ghostStyle" :src="geo.src" :style="ghostStyle" alt="" draggable="false")
    svg.absolute.inset-0(width="100%" height="100%" aria-hidden="true")
      line.ts-tether(
        v-if="tether"
        :x1="tether.a.x" :y1="tether.a.y" :x2="tether.b.x" :y2="tether.b.y"
        :stroke-width="Math.max(2, geo.cell * 0.06)"
        :style="{ opacity: tether.o, strokeDashoffset: reduced ? 0 : -now * 0.05 }"
      )
      circle.ts-ring(
        v-for="(r, i) in tickRings"
        :key="'r' + i"
        :cx="r.x" :cy="r.y" :r="r.r"
        :class="{ 'is-red': r.red }"
        :style="{ opacity: r.o }"
      )
      line.ts-breach(v-if="breachLine" :x1="breachLine.x1" :x2="breachLine.x2" :y1="breachLine.y" :y2="breachLine.y" :stroke-width="breachLine.w" :style="{ opacity: breachLine.o }")
      circle.ts-strike(v-if="strike" :cx="strike.x" :cy="strike.y" :r="strike.r" :style="{ opacity: strike.o }")
      line.ts-aim(v-if="aim" :x1="aim.a.x" :y1="aim.a.y" :x2="aim.b.x" :y2="aim.b.y" :stroke-width="Math.max(3, geo.cell * 0.09)" :style="{ opacity: aim.o }")
      circle.ts-ball(v-if="ball" :cx="ball.x" :cy="ball.y" :r="geo.cell * 0.2")
      circle.ts-hit(v-if="hitBurst" :cx="hitBurst.x" :cy="hitBurst.y" :r="hitBurst.r" :style="{ opacity: hitBurst.o }")
    //- The two pips — the same disc and digit the board draws.
    template(v-for="(p, i) in [monsterPip, launcherPip]" :key="'p' + i")
      div.ts-pip.absolute.flex.items-center.justify-center.rounded-full.game-text(
        v-if="p"
        :class="'is-' + p.tone"
        :style="pipStyle(p)"
      )
        span(v-if="p.digit !== null") {{ p.digit }}
        BarrageGlyph.ts-pip__icon(v-else-if="p.icon" :name="p.icon")
      span.ts-fallen.absolute.game-text(v-if="p && fallen" :style="fallStyle(p)") {{ fallen.digit }}
</template>

<style scoped lang="sass">
.ts-shroud
  background: rgba(3, 6, 14, 0.94)
  box-shadow: 0 0 10px 6px rgba(3, 6, 14, 0.94)

.ts-ghost
  object-fit: contain
  filter: drop-shadow(0 0 6px rgba(255, 50, 60, 0.9)) saturate(1.15)

.ts-tether
  stroke: #ff3848
  stroke-dasharray: 8 6
  stroke-linecap: round
  filter: drop-shadow(0 0 3px rgba(255, 40, 50, 0.8))

.ts-ring
  fill: none
  stroke: #ffa23a
  stroke-width: 3
  &.is-red
    stroke: #ff3040

.ts-breach
  stroke: #ff2a3a
  stroke-linecap: round
  filter: drop-shadow(0 0 10px rgba(255, 40, 50, 0.95))

.ts-strike
  fill: rgba(255, 40, 50, 0.35)
  stroke: #ff3040
  stroke-width: 4

.ts-aim
  stroke: rgba(255, 255, 255, 0.9)
  stroke-dasharray: 2 9
  stroke-linecap: round

.ts-ball
  fill: #fff6d0
  filter: drop-shadow(0 0 6px rgba(255, 230, 140, 0.95))

.ts-hit
  fill: rgba(255, 245, 200, 0.55)
  stroke: #ffe28a
  stroke-width: 3

// The board's pip (BoardRenderer bakePip): a glossy disc, a dark rim, a white inner ring.
.ts-pip
  color: #fff
  font-weight: 900
  line-height: 1
  border: 2px solid var(--rim)
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.85), 0 0 10px var(--glow)
  background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.55), var(--fill) 40%, var(--fill))
  -webkit-text-stroke: 2px rgba(0, 0, 0, 0.55)
  paint-order: stroke fill
  &.is-amber
    --fill: #ff9a2a
    --rim: #6a3000
    --glow: rgba(255, 150, 40, 0.7)
  &.is-red
    --fill: #ff2a3a
    --rim: #7a0010
    --glow: rgba(255, 40, 50, 0.9)
  &.is-green
    --fill: #3fcf6a
    --rim: #0d4a1e
    --glow: rgba(90, 255, 140, 0.8)
.ts-pip__icon
  width: 70%
  height: 70%
  color: #fff

.ts-fallen
  translate: -50% -50%
  color: #fff
  font-weight: 900
  -webkit-text-stroke: 2px rgba(0, 0, 0, 0.6)
  paint-order: stroke fill
</style>
