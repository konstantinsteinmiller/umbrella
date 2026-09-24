<script setup lang="ts">
/**
 * The ball tray — the game's merge stage (MIW's grid pressure, reborn).
 *
 * Two looks, picked by what FITS the box it is given:
 *   • sockets  — one glass orb per ball plus an empty socket per free slot.
 *                The FTUE lives here: the player SEES the tray fill up, then
 *                overflow, then two twins become one. Used while every slot
 *                can be drawn at a readable size.
 *   • stacks   — one orb per tier with a "×3" count, once capacity outgrows the
 *                box (late game holds 20–40 balls; 40 sockets on a phone are
 *                confetti, not information). A tray never holds many DISTINCT
 *                tiers, so stacks stay big however large capacity gets.
 *
 * Either way slot i of `useBarrage().tray` (sorted descending) is addressable as
 * `[data-slot=i] .unit-holder` — that is how TierRevealFx finds the ball a merge
 * just discovered. In stack mode every index of a stack gets an invisible
 * anchor laid over the stack's orb, so any index still resolves to a real box.
 *
 * The orbs are also a place to AIM from (play-test run 3: a tester started a
 * drag on them and nothing happened — dragging up from the shots is the
 * slingshot motion): a press anywhere on the orbs, an empty socket included,
 * hands the finger to the board (`beginAimFrom`), which treats it like a
 * press on the unit. The status icons beside them (shield / revive / warcry)
 * name themselves on a tap (HudTip) — a `title` never shows on touch.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useBarrage from '@/barrage/state/useBarrage'
import type { EngineEvent } from '@/barrage/engine/types'
import { fighterSrc, ballColors } from '@/barrage/art'
import useSounds from '@/use/useSound'
import { emitConfetti, emitSparkle } from '@/use/usePrismParticles'
import { activeReveal, claimRevealSound } from '@/use/useTierReveal'
import { isAnyModalOpen } from '@/use/useModalState'
import { isCompactHud, isRoomyHud } from '@/use/useUser'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import { boardApi, fmtCoins } from '@/components/barrage/barrageUi'
import { showHudTip, type TipIcon } from '@/components/barrage/hudTip'
import { centreOfEl, fly, type Pt } from '@/components/barrage/trayFlights'
import { mergeBox, offerMerge } from '@/components/barrage/mergeLightbox'

const { t, te } = useI18n()
const barrage = useBarrage()
const { playSound } = useSounds()

const tray = computed(() => barrage.tray.value)
const capacity = computed(() => Math.max(1, barrage.trayCapacity.value, tray.value.length))

// ─── Fitting ─────────────────────────────────────────────────────────────────
const boxEl = ref<HTMLElement | null>(null)
const boxW = ref(0)
const boxH = ref(0)
let ro: ResizeObserver | null = null

const GAP = 4
/** Below this an individual orb stops reading as "a ball with a face". */
const MIN_SOCKET = computed(() => (isCompactHud.value ? 26 : 30))
const MAX_ORB = computed(() => (isRoomyHud.value ? 60 : 50))

/** Largest square slot that fits `n` slots into the box, trying 1–4 rows. */
const fitSlot = (n: number): number => {
  const W = boxW.value
  const H = boxH.value
  if (W <= 0 || H <= 0 || n <= 0) return 0
  let best = 0
  for (let rows = 1; rows <= 4; rows++) {
    const cols = Math.ceil(n / rows)
    const s = Math.min((W - GAP * (cols - 1)) / cols, (H - GAP * (rows - 1)) / rows)
    if (s > best) best = s
  }
  return Math.floor(best)
}

const socketSize = computed(() => fitSlot(capacity.value))
/** One entry per socket: the ball's tier, or 0 for a free socket. (Pug
 *  templates get no TS transform, so the template must never need a `!`.) */
const sockets = computed(() => Array.from({ length: capacity.value }, (_, i) => tray.value[i] ?? 0))
const stacked = computed(() => boxW.value > 0 && socketSize.value < MIN_SOCKET.value)

interface Stack { tier: number; from: number; count: number; rest: number[] }
const stacks = computed<Stack[]>(() => {
  const out: Stack[] = []
  tray.value.forEach((tier, i) => {
    const last = out[out.length - 1]
    if (last && last.tier === tier) {
      last.count += 1
      last.rest.push(i)
    } else {
      out.push({ tier, from: i, count: 1, rest: [] })
    }
  })
  return out
})

const slotPx = computed(() => {
  const n = stacked.value ? Math.max(1, stacks.value.length) : capacity.value
  return Math.max(16, Math.min(MAX_ORB.value, fitSlot(n)))
})

// ─── Orb look ────────────────────────────────────────────────────────────────
const orbStyle = (tier: number): Record<string, string> => {
  const c = ballColors(tier)
  // The halo grows with tier so a T9 reads as precious at a glance, whatever
  // the portrait inside looks like.
  const glow = Math.min(14, 2 + tier * 0.9)
  return { '--rim': c.glow, '--body': c.body, '--light': c.light, '--glow': `${glow}px` }
}

const tierName = (tier: number): string => {
  const key = `battle.codex.names.t${Math.min(50, tier)}`
  return te(key) ? t(key) : t('barrage.tray.tierOnly', { n: tier })
}

// ─── Juice: +1 pops, merge squish + confetti, launch dimming ─────────────────
const rootEl = ref<HTMLElement | null>(null)
interface Pop { id: number; x: number; y: number; text: string; kind: 'add' | 'merge' }
const pops = ref<Pop[]>([])
let popSeq = 0
const addPop = (el: Element | null, text: string, kind: Pop['kind']): void => {
  const root = rootEl.value
  if (!el || !root) return
  const r = el.getBoundingClientRect()
  const rr = root.getBoundingClientRect()
  const id = ++popSeq
  pops.value = [...pops.value.slice(-5), { id, x: r.left - rr.left + r.width / 2, y: r.top - rr.top, text, kind }]
  window.setTimeout(() => { pops.value = pops.value.filter((p) => p.id !== id) }, 950)
}

/** A routine merge's twins take this long to fly into their ball. */
const TWIN_FLIGHT_MS = 240

/** The ball the merge lightbox is staging: hidden here, drawn there. */
const boxedIdx = computed(() => mergeBox.value?.idx ?? -1)

const bounceIdx = ref<number | null>(null)
const squishIdx = ref<number | null>(null)
let bounceTimer = 0
let squishTimer = 0

const slotEl = (i: number): HTMLElement | null =>
  rootEl.value?.querySelector<HTMLElement>(`[data-slot="${i}"] .unit-holder`) ?? null

/** Index of the LAST ball of `tier` (a fresh +1 always lands at the tail of its run). */
const lastIndexOf = (tier: number): number => tray.value.lastIndexOf(tier)

// A cascade (1+1→2, then 2+2→3) arrives as several synchronous events; they are
// collected and resolved once the tray ref has settled on the final state.
let pendingAdds = 0
let pendingMerges: number[] = []
let flushQueued = false
/** The "+1" spilled into coins in this burst — no socket got a ball. */
let pendingOverflow = false
/** Where on screen the "+1" that caused this burst was collected. */
let pendingPickup: Pt | null = null

const flushJuice = async (): Promise<void> => {
  flushQueued = false
  await nextTick()
  const merges = pendingMerges
  const adds = pendingAdds
  const overflow = pendingOverflow
  const pickup = pendingPickup
  pendingMerges = []
  pendingAdds = 0
  pendingOverflow = false
  pendingPickup = null
  /** The "+1" flies from its bubble into the socket it ended up in. */
  const flyIn = (el: Element | null): void => {
    const to = centreOfEl(el)
    if (!pickup || !to) return
    fly(pickup, to, { kind: 'plus', size: Math.max(18, slotPx.value * 0.7), dur: 380, arc: 40, endScale: 0.85, endOpacity: 0.3 })
  }

  if (merges.length) {
    // Celebrate the highest tier the cascade produced that still exists.
    const top = merges.filter((tier) => tray.value.includes(tier)).sort((a, b) => b - a)[0]
    if (top !== undefined) {
      const idx = tray.value.indexOf(top)
      const el = slotEl(idx)
      // The state layer has already announced a DISCOVERY (a microtask ahead
      // of this tick). The first merges of a profile and every discovery go on
      // the lightbox's stage instead — it plays the twins, the fuse and the
      // sting itself, so nothing below runs for them.
      const reveal = activeReveal.value
      const discovery = !!reveal && reveal.tier === top
      if (offerMerge({ fromTier: Math.max(1, top - 1), toTier: top, idx, discovery, allowed: !isAnyModalOpen.value })) {
        flyIn(el)
        return
      }
      // Routine merge, no pause: the twins still visibly fly together into
      // the ball they make ("the portraits kept flipping" — run 2), then it
      // squishes as they land.
      const s = slotPx.value
      const to = centreOfEl(el)
      if (to) {
        for (const dir of [-1, 1]) {
          fly({ x: to.x + dir * s * 1.05, y: to.y }, to, { kind: 'orb', tier: Math.max(1, top - 1), size: s * 0.8, dur: 260, arc: 10, endScale: 0.55, endOpacity: 0.5 })
        }
      }
      await new Promise<void>((done) => window.setTimeout(done, to ? TWIN_FLIGHT_MS : 0))
      squishIdx.value = null
      await nextTick()
      squishIdx.value = idx
      window.clearTimeout(squishTimer)
      squishTimer = window.setTimeout(() => { squishIdx.value = null }, 520)
      const r = el?.getBoundingClientRect()
      if (r) {
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        emitConfetti(cx, cy, 18 + merges.length * 6, 1.1)
        emitSparkle(cx, cy, ballColors(top).glow, 10)
      }
      addPop(el, t('barrage.tray.merged'), 'merge')
      flyIn(el)
      // The merge pop itself is the board mixer's (BarrageBoard plays it on
      // trayMerge). A DISCOVERY adds the reveal sting; claiming it here makes
      // sure it plays exactly once.
      if (discovery && claimRevealSound({ kind: 'grid', idx })) {
        playSound('new-tier-reveal', 0.09)
      }
    }
  }
  // A "+1" the full tray paid out as coins never became a ball: no bounce, no
  // "+1" pop on some other ball (that pop was half the "why do my shots only
  // sometimes duplicate?" confusion) — the "Tray full" line says what happened.
  if (adds > 0 && !overflow) {
    const idx = lastIndexOf(1)
    const at = idx >= 0 ? idx : tray.value.length - 1
    if (at >= 0) {
      bounceIdx.value = null
      await nextTick()
      bounceIdx.value = at
      window.clearTimeout(bounceTimer)
      bounceTimer = window.setTimeout(() => { bounceIdx.value = null }, 420)
      // The +1 only makes sense when the ball stayed a ball (no merge ate it).
      if (!merges.length) {
        addPop(slotEl(at), t('barrage.tray.plusOne'), 'add')
        flyIn(slotEl(at))
      }
    }
  }
}

const queueJuice = (): void => {
  if (flushQueued) return
  flushQueued = true
  void flushJuice()
}

// Overflow: the ball became coins instead (no pair to merge).
const overflowCoins = ref(0)
let overflowTimer = 0

// Launch dimming: a volley fires the tray top-down, one ball per interval.
const launched = ref(0)
let volleySize = 0

const onEvent = (e: EngineEvent): void => {
  switch (e.type) {
    case 'trayAdd':
      pendingAdds += 1
      queueJuice()
      break
    case 'trayMerge':
      pendingMerges.push(e.toTier)
      queueJuice()
      break
    case 'pickup':
      // Auto-collected "+1"s fly to the unit on the board instead.
      if (e.kind === 'ball' && !e.auto) pendingPickup = boardApi.value?.cellToClient(e.x, e.y) ?? null
      break
    case 'trayOverflow':
      pendingOverflow = true
      queueJuice()
      overflowCoins.value += e.coins
      window.clearTimeout(overflowTimer)
      overflowTimer = window.setTimeout(() => { overflowCoins.value = 0 }, 1800)
      break
    case 'fire': {
      volleySize = e.balls
      launched.value = 0
      // The tray IS the volley: its balls stream into the unit (the first few).
      const L = boardApi.value?.launcherClientPoint()
      if (L) {
        const n = Math.min(6, e.balls)
        for (let i = 0; i < n; i++) {
          const from = centreOfEl(slotEl(i))
          if (!from) continue
          fly(from, L, { kind: 'orb', tier: tray.value[i] ?? 1, size: slotPx.value * 0.9, delay: i * 45, dur: 300, arc: 30, endScale: 0.45, endOpacity: 0.15 })
        }
      }
      break
    }
    case 'launch':
      if (launched.value < volleySize) launched.value += 1
      break
    case 'phase':
      if (e.phase === 'aim') { launched.value = 0; volleySize = 0 }
      break
    default:
      break
  }
}
let off: (() => void) | null = null

watch(() => barrage.engineGen.value, () => { launched.value = 0; volleySize = 0 })

onMounted(() => {
  off = barrage.onEngineEvent(onEvent)
  const el = boxEl.value
  if (!el) return
  const measure = (): void => {
    boxW.value = el.clientWidth
    boxH.value = el.clientHeight
  }
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(measure)
    ro.observe(el)
  }
})
onUnmounted(() => {
  off?.()
  ro?.disconnect()
  window.clearTimeout(bounceTimer)
  window.clearTimeout(squishTimer)
  window.clearTimeout(overflowTimer)
})

// ─── Aim from the orbs ───────────────────────────────────────────────────────
/** A press on the orbs starts an aim on the board (same gates as a press on
 *  the board itself); only then is the default (text selection, the compat
 *  mouse events) cancelled. */
const onOrbsDown = (e: PointerEvent): void => {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  if (boardApi.value?.beginAimFrom(e)) e.preventDefault()
}

// ─── Status icons: a tap names them ──────────────────────────────────────────
type StatusId = 'shield' | 'revive' | 'warcry'
const statusName = (id: StatusId): string =>
  id === 'shield' ? t('barrage.hud.shields', { n: barrage.shields.value })
    : id === 'revive' ? t('barrage.hud.revives', { n: barrage.revives.value })
      : t('barrage.hud.warcry')
const onStatusTap = (id: StatusId, ev: MouseEvent): void => {
  const el = ev.currentTarget as HTMLElement | null
  if (!el) return
  const icon: TipIcon = id
  showHudTip(el, () => ({ icon, name: statusName(id) }))
  playSound('anchor-swap', 0.03, 1.15)
}

const countLabel = computed(() => t('barrage.tray.count', { n: tray.value.length, max: barrage.trayCapacity.value }))
const trayAria = computed(() => t('barrage.tray.aria', { n: tray.value.length, max: barrage.trayCapacity.value }))
const full = computed(() => tray.value.length >= barrage.trayCapacity.value)
const countClass = computed(() => isCompactHud.value ? 'text-[11px]' : isRoomyHud.value ? 'text-base' : 'text-xs')

defineExpose({ rootEl })
</script>

<template lang="pug">
  div.ball-tray.relative.flex.items-stretch.min-w-0.min-h-0.rounded-2xl(
    ref="rootEl"
    role="group"
    :aria-label="trayAria"
    data-tut="tray"
  )
    //- Slot area — measured; every orb size is derived from it.
    //- …and the place a drag up from the shots starts an aim (touch-action: none).
    div.tray-box.flex-1.min-w-0.min-h-0.flex.items-center.justify-center(ref="boxEl" @pointerdown="onOrbsDown")
      div.tray-slots.flex.flex-wrap.items-center.justify-center(
        :style="{ gap: GAP + 'px', '--s': slotPx + 'px' }"
      )
        //- ── Sockets: one orb per ball + empty sockets ──
        template(v-if="!stacked")
          div.tray-slot.relative(
            v-for="(tier, i) in sockets"
            :key="'s' + i"
            :data-slot="tier > 0 ? i : undefined"
          )
            div.unit-holder.w-full.h-full(
              v-if="tier > 0"
              :class="{ 'is-bounce': bounceIdx === i, 'is-squish': squishIdx === i, 'is-launched': i < launched, 'is-boxed': boxedIdx === i }"
            )
              div.orb(:style="orbStyle(tier)" role="img" :aria-label="t('barrage.tray.slotAria', { name: tierName(tier), n: tier })")
                img.orb__portrait(:src="fighterSrc(tier)" alt="" draggable="false")
                span.orb__gloss
                span.orb__tier.game-text {{ tier }}
            div.tray-socket.w-full.h-full(v-else aria-hidden="true")
        //- ── Stacks: one orb per tier ──
        template(v-else)
          div.tray-slot.relative(
            v-for="g in stacks"
            :key="'g' + g.tier"
            :data-slot="g.from"
          )
            div.unit-holder.w-full.h-full(
              :class="{ 'is-bounce': bounceIdx !== null && bounceIdx >= g.from && bounceIdx < g.from + g.count, 'is-squish': squishIdx !== null && squishIdx >= g.from && squishIdx < g.from + g.count, 'is-launched': g.from + g.count <= launched, 'is-boxed': boxedIdx >= g.from && boxedIdx < g.from + g.count }"
            )
              div.orb(:style="orbStyle(g.tier)" role="img" :aria-label="t('barrage.tray.stackAria', { name: tierName(g.tier), n: g.tier, count: g.count })")
                img.orb__portrait(:src="fighterSrc(g.tier)" alt="" draggable="false")
                span.orb__gloss
                span.orb__tier.game-text {{ g.tier }}
              span.orb__count.game-text(v-if="g.count > 1") {{ t('barrage.tray.stackCount', { n: g.count }) }}
            //- Invisible anchors so `[data-slot=j] .unit-holder` resolves for every index.
            div.tray-anchor.absolute.inset-0.pointer-events-none(v-for="j in g.rest" :key="'a' + j" :data-slot="j" aria-hidden="true")
              div.unit-holder.w-full.h-full

    //- Count + run status (shield / revive charges, warcry armed) — a tap names each.
    div.tray-side.shrink-0.flex.flex-col.items-center.justify-center.gap-1.px-1
      span.tray-count.game-text.font-black.tabular-nums.leading-none(:class="[countClass, { 'is-full': full }]") {{ countLabel }}
      div.flex.items-center(class="gap-0.5" v-if="barrage.shields.value > 0 || barrage.revives.value > 0 || barrage.warcryArmed.value")
        button.tray-status.text-sky-300(v-if="barrage.shields.value > 0" type="button" :aria-label="statusName('shield')" @click="onStatusTap('shield', $event)")
          BarrageGlyph.w-4.h-4(name="shield")
          span.game-text(v-if="barrage.shields.value > 1") {{ barrage.shields.value }}
        button.tray-status.text-rose-300(v-if="barrage.revives.value > 0" type="button" :aria-label="statusName('revive')" @click="onStatusTap('revive', $event)")
          BarrageGlyph.w-4.h-4(name="revive")
          span.game-text(v-if="barrage.revives.value > 1") {{ barrage.revives.value }}
        button.tray-status.tray-status--warcry.text-amber-300(v-if="barrage.warcryArmed.value" type="button" :aria-label="statusName('warcry')" @click="onStatusTap('warcry', $event)")
          BarrageGlyph.w-4.h-4(name="warcry")

    //- Floating "+1" / "Merged!" pops.
    span.tray-pop.game-text.absolute.pointer-events-none(
      v-for="p in pops"
      :key="p.id"
      :class="'tray-pop--' + p.kind"
      :style="{ left: p.x + 'px', top: p.y + 'px' }"
      aria-hidden="true"
    ) {{ p.text }}

    //- Overflow: no twin to merge with, the ball turned into coins.
    Transition(name="tray-note")
      div.tray-note.absolute.left-1_2.pointer-events-none.flex.items-center.gap-1.rounded-full.px-2.py-0_5(
        v-if="overflowCoins > 0"
        aria-live="polite"
      )
        span.game-text.font-black.text-white(class="text-[11px]") {{ t('barrage.tray.overflow', { n: fmtCoins(overflowCoins) }) }}
</template>

<style scoped lang="sass">
.ball-tray
  background: linear-gradient(180deg, rgba(10, 16, 34, 0.78), rgba(18, 28, 56, 0.82))
  box-shadow: inset 0 0 0 2px rgba(15, 26, 48, 0.9), inset 0 2px 0 rgba(255, 255, 255, 0.08), 0 3px 0 rgba(0, 0, 0, 0.35)
  padding: 4px

.tray-slot
  width: var(--s)
  height: var(--s)
  flex: 0 0 auto

.tray-socket
  border-radius: 50%
  background: radial-gradient(circle at 50% 60%, rgba(0, 0, 0, 0.45), rgba(255, 255, 255, 0.04) 70%)
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.6), 0 0 0 1.5px rgba(255, 255, 255, 0.12)

// ── Glass orb: dark glass body, the tier's element rim + halo, portrait inside ──
.orb
  position: relative
  width: 100%
  height: 100%
  border-radius: 50%
  overflow: hidden
  background: radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--light) 55%, #0b1224) 0%, color-mix(in srgb, var(--body) 45%, #070b18) 70%, #050810 100%)
  box-shadow: 0 0 0 2px var(--rim), 0 0 var(--glow) color-mix(in srgb, var(--rim) 75%, transparent), inset 0 -3px 6px rgba(0, 0, 0, 0.55)
.orb__portrait
  position: absolute
  inset: 8%
  width: 84%
  height: 84%
  object-fit: contain
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6))
  user-select: none
.orb__gloss
  position: absolute
  inset: 0
  border-radius: 50%
  background: radial-gradient(ellipse 55% 35% at 36% 22%, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0) 70%)
  pointer-events: none
.orb__tier
  position: absolute
  right: 4%
  bottom: 2%
  min-width: 38%
  padding: 0 2px
  border-radius: 999px
  background: #0e1426
  border: 1.5px solid #fff
  color: #fff
  font-size: max(8px, calc(var(--s) * 0.26))
  line-height: 1.15
  text-align: center
  font-weight: 900
.orb__count
  position: absolute
  left: -4%
  top: -6%
  padding: 0 4px
  border-radius: 999px
  background: linear-gradient(180deg, #ffcd00, #f7a000)
  border: 1.5px solid #0f1a30
  color: #fff
  font-size: max(9px, calc(var(--s) * 0.28))
  font-weight: 900
  line-height: 1.2
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.5)

.unit-holder
  transition: opacity 0.2s ease, filter 0.2s ease
.unit-holder.is-launched
  opacity: 0.35
  filter: grayscale(0.6)
// The merge lightbox draws this ball itself until its moment is over.
.unit-holder.is-boxed
  opacity: 0
  transition: none
.unit-holder.is-bounce
  animation: tray-bounce 0.42s cubic-bezier(0.34, 1.56, 0.64, 1)
.unit-holder.is-squish
  animation: tray-squish 0.52s cubic-bezier(0.34, 1.56, 0.64, 1)
@keyframes tray-bounce
  0%
    transform: translateY(-40%) scale(0.6)
    opacity: 0.4
  60%
    transform: translateY(4%) scale(1.08)
    opacity: 1
  100%
    transform: translateY(0) scale(1)
@keyframes tray-squish
  0%
    transform: scale(1.35, 0.7)
  35%
    transform: scale(0.8, 1.25)
  65%
    transform: scale(1.12, 0.92)
  100%
    transform: scale(1)

.tray-count
  color: #e6efff
  text-shadow: 1px 1px 0 #000
  &.is-full
    color: #ffd23a
// The orbs: a drag up from them is an aim, never a scroll / pan.
.tray-box
  touch-action: none
  user-select: none
  -webkit-user-select: none
  -webkit-touch-callout: none
.tray-status
  position: relative
  display: inline-flex
  align-items: center
  padding: 0
  border: 0
  background: none
  cursor: pointer
  font-size: 10px
  font-weight: 900
  filter: drop-shadow(1px 1px 0 rgba(0, 0, 0, 0.6))
  touch-action: manipulation
  // A thumb-sized hit box around a 16 px glyph, without moving the layout.
  &::before
    content: ''
    position: absolute
    inset: -8px -3px
  &:active
    transform: scale(0.9)
.tray-status--warcry
  animation: warcry-throb 0.9s ease-in-out infinite alternate
@keyframes warcry-throb
  from
    transform: scale(1)
  to
    transform: scale(1.2)

.tray-pop
  translate: -50% -60%
  font-size: 15px
  font-weight: 900
  white-space: nowrap
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000
  animation: tray-pop 0.95s ease-out forwards
  z-index: 3
.tray-pop--add
  color: #7dffa0
.tray-pop--merge
  color: #ffe27a
@keyframes tray-pop
  0%
    transform: translateY(6px) scale(0.6)
    opacity: 0
  20%
    transform: translateY(-4px) scale(1.2)
    opacity: 1
  100%
    transform: translateY(-26px) scale(1)
    opacity: 0

.tray-note
  bottom: calc(100% + 4px)
  translate: -50% 0
  background: linear-gradient(180deg, #ffb13b, #e07818)
  border: 2px solid #0f1a30
  z-index: 4
  white-space: nowrap
.left-1_2
  left: 50%
.py-0_5
  padding-top: 2px
  padding-bottom: 2px
.tray-note-enter-active, .tray-note-leave-active
  transition: opacity 0.2s ease, transform 0.2s ease
.tray-note-enter-from, .tray-note-leave-to
  opacity: 0
  transform: translateY(6px)

@media (prefers-reduced-motion: reduce)
  .unit-holder.is-bounce, .unit-holder.is-squish, .tray-status--warcry
    animation: none
</style>
