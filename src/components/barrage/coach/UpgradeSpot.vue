<script setup lang="ts">
/**
 * A chip spotlight (`lessonSpotlight.ts`, kinds speed / luck / bounty): what
 * the chip does, shown twice on the player's own board — BEFORE (its value
 * now) and AFTER (its value one level up), the chip's glyph flying from the
 * chip into the demo between the two. The game is paused; wordless — the only
 * text is the chip's own value format and the board's coin "+N".
 *
 *   speed  — a ball flies from the unit to the monster above it and hits
 *            ("×1"); then one flies twice as fast, streaking, and hits harder
 *            ("×1.12").
 *   luck   — the top rows (where new rows come in) show one bubble ("0 %");
 *            then more coin and skill bubbles pop up there ("5 %").
 *   bounty — a monster pops and its coins fly to the wallet ("+10"); then
 *            the same kill pays more, in more coins ("+12").
 *
 * Beats (UPGRADE_SPOT_MS): open 0–350 · before 350–1400 · the glyph flies
 * 1400–1800 · after 1800–2900 · hold, then the stage closes.
 *
 * Playtest run 13: the two values sit side by side (now left, next right) on
 * dark plates of their own, inside the board and below the rank plaque on its
 * top rim. Bare, they landed on whatever number was there: speed's "×1.12"
 * over the plaque read as "GLOBAL RANK #X1.12", luck's "5%" beside the Fire
 * Dragon's "1.2K" as "boss HP 1.2%".
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useBarrage from '@/barrage/state/useBarrage'
import { coinSrc, skillSrc } from '@/barrage/art'
import { COLS, ROWS } from '@/barrage/engine/types'
import { boardApi, fmtCoins, upgradeValueKey, upgradeValueNumber } from '@/components/barrage/barrageUi'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import SpotMask from '@/components/barrage/coach/SpotMask.vue'
import type { Spot, SpotHole, UpgradeSpot } from '@/components/barrage/lessonSpotlight'

const props = defineProps<{ spot: Spot & UpgradeSpot; now: number; reduced: boolean }>()
const { t } = useI18n()
const barrage = useBarrage()

interface Pt { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }
/** Where the value plates may stand (client px). */
interface Room { l: number; t: number; r: number; b: number }
/** The plates keep this far from the board's edges and the rank plaque (px). */
const ROOM_INSET = 4
interface Geo {
  cell: number
  /** The board below the rank plaque, inset a little (run 13). */
  room: Room
  origin: Pt
  chip: Rect
  unit: Pt
  wallet: Rect | null
  /** speed: the monster above the unit (or the top of its column). */
  target: Pt
  /** bounty: the walker that pops. */
  prey: Rect | null
}
const rectOf = (el: Element | null): Rect | null => {
  const r = el?.getBoundingClientRect()
  return r && r.width > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
}
const geo = ref<Geo | null>(null)
const measure = (): void => {
  const api = boardApi.value
  const o = api?.cellToClient(0, 0)
  const o1 = api?.cellToClient(1, 0)
  const unit = api?.launcherClientPoint() ?? null
  const chip = rectOf(document.querySelector(`[data-upgrade-id="${props.spot.kind}"]`))
  if (!api || !o || !o1 || !unit || !chip) {
    geo.value = null
    return
  }
  const cell = Math.max(8, o1.x - o.x)
  const toC = (x: number, y: number): Pt => ({ x: o.x + x * cell, y: o.y + y * cell })
  const b = api.boardClientRect()
  const rim = document.querySelector('.rank-rim')?.getBoundingClientRect()
  const top = b ? b.top : o.y
  const room: Room = {
    l: (b ? b.left : o.x) + ROOM_INSET,
    r: (b ? b.right : o.x + COLS * cell) - ROOM_INSET,
    t: Math.max(top, rim && rim.height > 0 ? rim.bottom : top) + ROOM_INSET,
    b: (b ? b.bottom : o.y + ROWS * cell) - ROOM_INSET
  }
  const st = barrage.engine.value.state
  // speed: the monster most directly above the unit.
  let best: { x: number; y: number } | null = null
  let bestD = Infinity
  for (const m of st.monsters) {
    const c = { x: m.col + m.w / 2, y: m.row + m.h / 2 }
    if (c.y < 0.5) continue
    const d = Math.abs(c.x - st.launcherX)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  const prey = props.spot.monsterId !== undefined ? st.monsters.find((m) => m.id === props.spot.monsterId) : undefined
  geo.value = {
    cell,
    room,
    origin: o,
    chip,
    unit,
    wallet: rectOf(document.querySelector('.coin-badge')),
    target: toC(best?.x ?? st.launcherX, best?.y ?? 1.5),
    prey: prey ? { ...toC(prey.col, prey.row), w: prey.w * cell, h: prey.h * cell } : null
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
const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const easeOutBack = (x: number): number => {
  const c = 1.7
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2)
}
const B = { open: 350, before: 350, fly: 1400, after: 1800, hold: 2900 } as const

const fmt = (v: number): string => t(upgradeValueKey(props.spot.kind), { n: upgradeValueNumber(props.spot.kind, v) })
const nowText = computed(() => fmt(props.spot.value))
const nextText = computed(() => fmt(props.spot.next))
const toC = (x: number, y: number): Pt => {
  const g = geo.value!
  return { x: g.origin.x + x * g.cell, y: g.origin.y + y * g.cell }
}
const centre = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

// ─── The glyph that flies from the chip into the demo ─────────────────────────
const demoPoint = computed<Pt | null>(() => {
  const g = geo.value
  if (!g) return null
  if (props.spot.kind === 'speed') return g.unit
  if (props.spot.kind === 'luck') return toC(COLS / 2, 1)
  return g.prey ? centre(g.prey) : g.target
})
const flyer = computed<Record<string, string> | null>(() => {
  const g = geo.value
  const to = demoPoint.value
  if (!g || !to || props.now < B.fly || props.now > B.after) return null
  const from = centre(g.chip)
  const k = props.reduced ? 1 : easeInOut(seg(B.fly, B.after - 60))
  const lift = Math.min(120, Math.abs(from.y - to.y) * 0.3)
  const x = from.x + (to.x - from.x) * k
  const y = from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * lift
  const size = g.cell * 0.9
  return { left: `${x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px`, opacity: String(1 - seg(B.after - 120, B.after)) }
})
/** The chip's frame: lit from the start, flaring as the glyph leaves it. */
const chipFrame = computed<Record<string, string> | null>(() => {
  const g = geo.value
  if (!g) return null
  const pad = 4
  const flare = props.reduced ? 0 : Math.sin(Math.PI * seg(B.fly - 80, B.fly + 320))
  return {
    left: `${g.chip.x - pad}px`, top: `${g.chip.y - pad}px`,
    width: `${g.chip.w + pad * 2}px`, height: `${g.chip.h + pad * 2}px`,
    transform: `scale(${1 + 0.06 * flare})`, opacity: String(seg(0, B.open))
  }
})

// ─── speed ───────────────────────────────────────────────────────────────────
const SPEED_A = [B.before, B.before + 900] as const
const SPEED_B = [B.after, B.after + 450] as const
const along = (k: number): Pt => {
  const g = geo.value!
  return { x: g.unit.x + (g.target.x - g.unit.x) * k, y: g.unit.y + (g.target.y - g.unit.y) * k }
}
const speedBalls = computed(() => {
  if (props.spot.kind !== 'speed' || !geo.value) return []
  const out: { key: string; at: Pt; trail: Pt | null; fast: boolean }[] = []
  if (props.now >= SPEED_A[0] && props.now < SPEED_A[1]) out.push({ key: 'a', at: along(seg(...SPEED_A)), trail: null, fast: false })
  if (props.now >= SPEED_B[0] && props.now < SPEED_B[1]) {
    const k = seg(...SPEED_B)
    out.push({ key: 'b', at: along(k), trail: along(Math.max(0, k - 0.35)), fast: true })
  }
  return out
})
/** The values' type size, in cells; the next value is drawn this much larger. */
const POP_FONT = 0.52
const GOLD_SCALE = 1.2
const clampTo = (v: number, lo: number, hi: number): number => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)))
/** A plate's box, estimated from its text (it is placed before it is laid out). */
const plateW = (text: string, font: number): number => text.length * 0.6 * font + 0.9 * font + 4
const plateH = (font: number): number => 1.5 * font + 4
/** The two plates side by side, the gap between them on `at` — now on the
 *  left, next on the right — the pair moved as one to stay inside the room. */
const pairAt = (g: Geo, at: Pt, now: string, next: string): [Pt, Pt] => {
  const font = g.cell * POP_FONT
  const wa = plateW(now, font)
  const wb = plateW(next, font) * GOLD_SCALE
  const gap = g.cell * 0.3
  const h = plateH(font) * GOLD_SCALE
  const x = clampTo(at.x, g.room.l + wa + gap / 2, g.room.r - wb - gap / 2)
  const y = clampTo(at.y, g.room.t + h / 2, g.room.b - h / 2)
  return [{ x: x - gap / 2 - wa / 2, y }, { x: x + gap / 2 + wb / 2, y }]
}
/** Where the pair stands: speed — on the ball's path, just below the monster
 *  it hits; luck — under the top rows' bubbles, mid-board; bounty — above
 *  the kill, or under it when it stands at the top. */
const popAnchor = (g: Geo): Pt | null => {
  const k = props.spot.kind
  if (k === 'speed') {
    const rise = Math.max(1, g.unit.y - g.target.y)
    return along(1 - Math.min(0.6, (g.cell * 1.4) / rise))
  }
  if (k === 'luck') return toC(COLS / 2, 3.3)
  if (!g.prey) return null
  const h = plateH(g.cell * POP_FONT) * GOLD_SCALE
  const above = g.prey.y - g.cell * 0.2 - h / 2
  return { x: g.prey.x + g.prey.w / 2, y: above - h / 2 >= g.room.t ? above : g.prey.y + g.prey.h + g.cell * 0.2 + h / 2 }
}
const coinGain = (n: number | undefined): string => t('barrage.hud.coinGain', { n: fmtCoins(n ?? 1) })
const nowPop = computed(() => (props.spot.kind === 'bounty' ? coinGain(props.spot.coinsNow) : nowText.value))
const nextPop = computed(() => (props.spot.kind === 'bounty' ? coinGain(props.spot.coinsNext) : nextText.value))
/** When each value lands: the now value after the first demo, the next after the second. */
const popTimes = computed<[number, number]>(() => {
  const k = props.spot.kind
  if (k === 'speed') return [SPEED_A[1], SPEED_B[1]]
  if (k === 'luck') return [B.before + 350, B.after + 450]
  return [BOUNTY_A.hit, BOUNTY_B.hit]
})
const pops = computed(() => {
  const g = geo.value
  const at = g ? popAnchor(g) : null
  if (!g || !at) return []
  const [pa, pb] = pairAt(g, at, nowPop.value, nextPop.value)
  const [ta, tb] = popTimes.value
  const out: { key: string; text: string; at: Pt; gold: boolean; scale: number; o: number }[] = []
  const pop = (key: string, text: string, p: Pt, t0: number, gold: boolean): void => {
    if (props.now < t0) return
    const s = props.reduced ? 1 : easeOutBack(seg(t0, t0 + 260))
    out.push({ key, text, at: p, gold, scale: s * (gold ? GOLD_SCALE : 1), o: !gold && props.now > B.after ? 0.6 : 1 })
  }
  pop('a', nowPop.value, pa, ta, false)
  pop('b', nextPop.value, pb, tb, true)
  return out
})
const hitRings = computed(() => {
  const g = geo.value
  if (!g) return []
  const out: { key: string; x: number; y: number; r: number; o: number; gold: boolean }[] = []
  const ring = (key: string, at: Pt, t0: number, gold: boolean, big: number): void => {
    if (props.now < t0 || props.now > t0 + 320) return
    const k = seg(t0, t0 + 320)
    out.push({ key, x: at.x, y: at.y, r: g.cell * (0.35 + big * k), o: 1 - k, gold })
  }
  if (props.spot.kind === 'speed') {
    ring('a', g.target, SPEED_A[1], false, 0.8)
    ring('b', g.target, SPEED_B[1], true, 1.3)
  } else if (props.spot.kind === 'bounty' && g.prey) {
    ring('a', centre(g.prey), BOUNTY_A.hit, false, 0.9)
    ring('b', centre(g.prey), BOUNTY_B.hit, true, 1.4)
    if (g.wallet) {
      ring('wa', centre(g.wallet), BOUNTY_A.land, false, 0.7)
      ring('wb', centre(g.wallet), BOUNTY_B.land, true, 1)
    }
  }
  return out
})

// ─── luck ────────────────────────────────────────────────────────────────────
/** The bubbles in the top rows: one before, three more after. */
const LUCK_BUBBLES = [
  { key: 'c0', col: 3.5, row: 0.55, kind: 'coin', at: B.before + 200 },
  { key: 'c1', col: 1.5, row: 1.45, kind: 'coin', at: B.after + 80 },
  { key: 's1', col: 5.5, row: 0.55, kind: 'skill', at: B.after + 220 },
  { key: 'c2', col: 4.5, row: 1.45, kind: 'coin', at: B.after + 360 }
] as const
const luckBubbles = computed(() => {
  const g = geo.value
  if (props.spot.kind !== 'luck' || !g) return []
  const size = g.cell * 0.82
  return LUCK_BUBBLES.filter((b) => props.now >= b.at).map((b) => {
    const p = toC(b.col, b.row)
    const s = props.reduced ? 1 : easeOutBack(seg(b.at, b.at + 280))
    return {
      key: b.key,
      skill: b.kind === 'skill',
      fresh: b.at >= B.after,
      style: { left: `${p.x - size / 2}px`, top: `${p.y - size / 2}px`, width: `${size}px`, height: `${size}px`, transform: `scale(${s})` }
    }
  })
})

// ─── bounty ──────────────────────────────────────────────────────────────────
const BOUNTY_A = { hit: B.before + 150, fly: B.before + 300, land: B.before + 900, coins: 3 } as const
const BOUNTY_B = { hit: B.after + 80, fly: B.after + 230, land: B.after + 830, coins: 5 } as const
const coinFlights = computed(() => {
  const g = geo.value
  if (props.spot.kind !== 'bounty' || !g?.prey || !g.wallet) return []
  const from = centre(g.prey)
  const to = centre(g.wallet)
  const size = g.cell * 0.46
  const out: { key: string; style: Record<string, string> }[] = []
  for (const [tag, b] of [['a', BOUNTY_A], ['b', BOUNTY_B]] as const) {
    for (let i = 0; i < b.coins; i++) {
      const t0 = b.fly + i * 55
      const t1 = b.land - (b.coins - 1 - i) * 20
      if (props.now < t0 || props.now > t1) continue
      const k = props.reduced ? 1 : easeInOut(seg(t0, t1))
      const spread = (i - (b.coins - 1) / 2) * g.cell * 0.35
      const x = from.x + spread * (1 - k) + (to.x - from.x) * k
      const y = from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * g.cell * 1.2
      out.push({ key: `${tag}${i}`, style: { left: `${x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px` } })
    }
  }
  return out
})
/** The prey blinks white as it "dies", twice. */
const preyFlash = computed<Record<string, string> | null>(() => {
  const g = geo.value
  if (props.spot.kind !== 'bounty' || !g?.prey) return null
  const a = props.now >= BOUNTY_A.hit && props.now < BOUNTY_A.hit + 260 ? 1 - seg(BOUNTY_A.hit, BOUNTY_A.hit + 260) : 0
  const b = props.now >= BOUNTY_B.hit && props.now < BOUNTY_B.hit + 300 ? 1 - seg(BOUNTY_B.hit, BOUNTY_B.hit + 300) : 0
  const o = Math.max(a, b)
  if (o <= 0) return null
  const p = g.prey
  return { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px`, opacity: String(o) }
})

// ─── The stage's windows ─────────────────────────────────────────────────────
const holes = computed<SpotHole[]>(() => {
  const g = geo.value
  if (!g) return []
  const k = props.reduced ? 1 : easeOut(seg(0, B.open))
  const pad = 6
  const out: SpotHole[] = [{ x: g.chip.x - pad, y: g.chip.y - pad, w: g.chip.w + pad * 2, h: g.chip.h + pad * 2, k }]
  const c = g.cell
  if (props.spot.kind === 'speed') {
    const x0 = Math.min(g.unit.x, g.target.x) - c * 1.1
    const x1 = Math.max(g.unit.x, g.target.x) + c * 1.1
    out.push({ x: x0, y: g.target.y - c * 1.6, w: x1 - x0, h: g.unit.y - g.target.y + c * 2.4, k })
  } else if (props.spot.kind === 'luck') {
    const a = toC(0, 0)
    const b = toC(COLS, 2)
    out.push({ x: a.x - 4, y: a.y - 4, w: b.x - a.x + 8, h: b.y - a.y + c * 2.4, k })
  } else {
    if (g.prey) out.push({ x: g.prey.x - c * 1.2, y: g.prey.y - c * 1.1, w: g.prey.w + c * 2.4, h: g.prey.h + c * 1.6, k })
    if (g.wallet) out.push({ x: g.wallet.x - 8, y: g.wallet.y - 8, w: g.wallet.w + 16, h: g.wallet.h + 16, k })
  }
  return out
})
</script>

<template lang="pug">
  div.upgrade-spot.absolute.inset-0(v-if="geo")
    SpotMask(:id="'us-' + spot.seq" :holes="holes")
    div.us-chip.absolute.rounded-xl(v-if="chipFrame" :style="chipFrame" :class="'is-' + spot.kind")
    svg.absolute.inset-0(width="100%" height="100%" aria-hidden="true")
      template(v-for="b in speedBalls" :key="b.key")
        line.us-streak(
          v-if="b.trail"
          :x1="b.trail.x" :y1="b.trail.y" :x2="b.at.x" :y2="b.at.y"
          :stroke-width="geo.cell * 0.3"
        )
        circle.us-ball(:cx="b.at.x" :cy="b.at.y" :r="geo.cell * 0.2" :class="{ 'is-fast': b.fast }")
      circle.us-ring(
        v-for="r in hitRings"
        :key="r.key"
        :cx="r.x" :cy="r.y" :r="r.r"
        :class="{ 'is-gold': r.gold }"
        :style="{ opacity: r.o }"
      )
    //- luck: the bubbles new rows bring.
    div.us-bubble.absolute.rounded-full.flex.items-center.justify-center(
      v-for="b in luckBubbles"
      :key="b.key"
      :style="b.style"
      :class="{ 'is-skill': b.skill, 'is-fresh': b.fresh }"
    )
      img.us-bubble__art(:src="b.skill ? skillSrc('meteor') : coinSrc()" alt="" draggable="false")
    //- bounty: the kill's flash and its coins flying to the wallet.
    div.us-flash.absolute.rounded-xl(v-if="preyFlash" :style="preyFlash")
    img.us-coin.absolute(v-for="c in coinFlights" :key="c.key" :src="coinSrc()" :style="c.style" alt="" draggable="false")
    //- The chip's glyph, from the chip into the demo.
    div.us-flyer.absolute.rounded-full.flex.items-center.justify-center(v-if="flyer" :style="flyer" :class="'is-' + spot.kind")
      BarrageGlyph.us-flyer__glyph(:name="spot.kind")
    //- The values: now (after the first demo) and next (after the second).
    span.us-pop.absolute.game-text(
      v-for="p in pops"
      :key="p.key"
      :class="['is-' + spot.kind, { 'is-gold': p.gold }]"
      :style="{ left: p.at.x + 'px', top: p.at.y + 'px', transform: 'translate(-50%, -50%) scale(' + p.scale + ')', opacity: p.o, fontSize: geo.cell * POP_FONT + 'px' }"
    ) {{ p.text }}
</template>

<style scoped lang="sass">
.us-chip
  border: 3px solid #ffd23c
  box-shadow: 0 0 14px rgba(255, 210, 60, 0.85), inset 0 0 10px rgba(255, 210, 60, 0.35)
  transform-origin: center
  &.is-speed
    border-color: #7fe0ff
    box-shadow: 0 0 14px rgba(120, 220, 255, 0.85), inset 0 0 10px rgba(120, 220, 255, 0.35)
  &.is-luck
    border-color: #7dff9a
    box-shadow: 0 0 14px rgba(125, 255, 154, 0.85), inset 0 0 10px rgba(125, 255, 154, 0.35)

.us-flyer
  border: 2.5px solid #ffd23c
  background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.35), rgba(20, 30, 60, 0.9))
  box-shadow: 0 0 12px rgba(255, 210, 60, 0.9)
  color: #ffe28a
  &.is-speed
    border-color: #7fe0ff
    color: #bff0ff
    box-shadow: 0 0 12px rgba(120, 220, 255, 0.9)
  &.is-luck
    border-color: #7dff9a
    color: #c8ffd4
    box-shadow: 0 0 12px rgba(125, 255, 154, 0.9)
.us-flyer__glyph
  width: 62%
  height: 62%

.us-ball
  fill: #f2f6ff
  filter: drop-shadow(0 0 4px rgba(200, 220, 255, 0.9))
  &.is-fast
    fill: #bff0ff
    filter: drop-shadow(0 0 8px rgba(120, 220, 255, 1))
.us-streak
  stroke: rgba(120, 220, 255, 0.55)
  stroke-linecap: round

.us-ring
  fill: rgba(255, 255, 255, 0.25)
  stroke: #ffffff
  stroke-width: 3
  &.is-gold
    fill: rgba(255, 220, 90, 0.3)
    stroke: #ffd23c

.us-bubble
  border: 2.5px solid #ffd23c
  background: radial-gradient(circle at 35% 30%, rgba(255, 245, 200, 0.55), rgba(255, 200, 60, 0.2) 60%, rgba(60, 40, 0, 0.3))
  box-shadow: 0 0 10px rgba(255, 210, 60, 0.7)
  &.is-skill
    border-color: #c68bff
    background: radial-gradient(circle at 35% 30%, rgba(240, 220, 255, 0.55), rgba(170, 100, 255, 0.25) 60%, rgba(40, 10, 70, 0.35))
    box-shadow: 0 0 10px rgba(190, 130, 255, 0.8)
  &.is-fresh
    outline: 2px solid rgba(125, 255, 154, 0.9)
    outline-offset: 2px
.us-bubble__art
  width: 70%
  height: 70%
  object-fit: contain

.us-flash
  background: rgba(255, 255, 255, 0.85)
  box-shadow: 0 0 18px rgba(255, 255, 255, 0.9)

.us-coin
  object-fit: contain
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6))

// Run 13: a plate of its own, so a value never reads as part of a number
// already on the board.
.us-pop
  white-space: nowrap
  color: #fff
  font-weight: 900
  line-height: 1
  padding: 0.25em 0.45em
  border-radius: 999px
  border: 2px solid rgba(190, 205, 235, 0.55)
  background: rgba(8, 11, 24, 0.92)
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6)
  -webkit-text-stroke: 2px #0b0e18
  paint-order: stroke fill
  &.is-gold
    color: #ffe28a
    border-color: #ffd23c
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6), 0 0 10px rgba(255, 210, 60, 0.7)
  &.is-gold.is-speed
    color: #bff0ff
    border-color: #7fe0ff
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6), 0 0 10px rgba(120, 220, 255, 0.75)
  &.is-gold.is-luck
    color: #c8ffd4
    border-color: #7dff9a
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6), 0 0 10px rgba(125, 255, 154, 0.75)
</style>
