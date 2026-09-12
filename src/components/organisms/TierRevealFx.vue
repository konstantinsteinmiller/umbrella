<script setup lang="ts">
/**
 * ─── "NEW UNIT!" — the stage for a new-tier discovery ───────────────────────
 *
 * Mounted once in GameScene, teleported to <body>, and following whichever unit
 * `useTierReveal` names (a grid slot, the drag ghost while that unit is carried,
 * or a fighter in the arena). Everything here is `pointer-events: none` and
 * local to the unit — no full-screen dim — so the merge grid and the battle
 * stay fully playable through the whole moment.
 *
 * The timeline, synced to the reveal sting (whose bloom lands at 0.35 s):
 *
 *   0 – 0.35 s   WIND-UP  the neighbourhood dims into a small spotlight, a thin
 *                ring IMPLODES onto the unit, faint rays start turning, the
 *                unit sinks (MergeGrid / BattleArena own the unit's own motion).
 *                Deliberately no confetti yet — the hush is what makes the
 *                burst land.
 *   0.35 s       BLOOM    white flash + a shockwave ring, the rays and the halo
 *                slam to full, a confetti + sparkle burst in the unit's own
 *                colours, the label pops in, the unit pops.
 *   0.35 – 4.4 s PRESENT  a stage beam from above, a light pool under the unit,
 *                two counter-rotating ray fans, and a halo that BREATHES while
 *                its colour walks the unit's palette (glow → accent → gold →
 *                white); twinkles keep spawning around it.
 *   4.4 – 5 s    EXIT     everything eases out together; the dim lifts last.
 *
 * Every keyframe is on a 5 s clock keyed to the reveal's start (`--t0`), so a
 * remount or a retarget mid-moment continues where it was instead of replaying.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  activeReveal, endReveal, REVEAL_BLOOM_MS, REVEAL_MS, type TierReveal
} from '@/use/useTierReveal'
import { getIngredient } from '@/game/ingredients'
import { emitConfetti, emitSparkle } from '@/use/usePrismParticles'
import { tutorialActive } from '@/use/useTutorial'
import usePrismGame from '@/use/usePrismGame'

const { t, te } = useI18n()
const game = usePrismGame()

const reveal = computed<TierReveal | null>(() => activeReveal.value)

const palette = computed(() => {
  const r = reveal.value
  const ing = getIngredient(r ? r.tier : 1)
  return { glow: ing.glow, accent: ing.accent, light: ing.bodyLight }
})

const unitName = computed(() => {
  const r = reveal.value
  if (!r) return ''
  const key = `battle.codex.names.t${r.tier}`
  return te(key) ? t(key) : ''
})

// ─── Following the unit ─────────────────────────────────────────────────────
const rootEl = ref<HTMLElement | null>(null)
const labelEl = ref<HTMLElement | null>(null)
/** Label side, decided once per reveal (flipping mid-moment would jar). */
const labelBelow = ref(false)
/** Negative ms into the reveal at mount — the shared CSS clock offset. */
const t0 = ref('0ms')

const targetEl = (r: TierReveal): HTMLElement | null => {
  if (r.target.kind === 'grid') {
    const idx = r.target.idx
    // Carried? Follow the drag ghost while the finger holds it.
    return document.querySelector<HTMLElement>(`.drag-ghost[data-drag-src="${idx}"]`)
      ?? document.querySelector<HTMLElement>(`[data-slot="${idx}"] .unit-holder`)
  }
  return document.querySelector<HTMLElement>(`[data-fighter-id="${r.target.fighterId}"] .unit-body`)
}

/** The revealed grid unit is still in its slot (or being carried from it). */
const gridUnitAlive = (r: TierReveal): boolean =>
  r.target.kind !== 'grid' || game.grid.value[r.target.idx] === r.tier

let raf = 0
let misses = 0
let lastX = -1
let lastY = -1
let lastR = -1
let lastShift = 0
let labelW = 0

const frame = (): void => {
  raf = 0
  const r = reveal.value
  const root = rootEl.value
  if (!r || !root) return
  const el = gridUnitAlive(r) ? targetEl(r) : null
  if (!el) {
    // Consumed (merged away, fed to a fighter), died, or the view unmounted:
    // a few frames of grace for a synchronous retarget, then bow out.
    if (++misses > 6) { endReveal(r.id); return }
    raf = requestAnimationFrame(frame)
    return
  }
  misses = 0
  const b = el.getBoundingClientRect()
  const x = b.left + b.width / 2
  const y = b.top + b.height / 2
  const rad = Math.max(b.width, b.height) / 2
  if (Math.abs(x - lastX) > 0.25 || Math.abs(y - lastY) > 0.25) {
    root.style.transform = `translate3d(${x}px, ${y}px, 0)`
    lastX = x
    lastY = y
  }
  if (Math.abs(rad - lastR) > 0.5) {
    root.style.setProperty('--r', `${rad.toFixed(1)}px`)
    lastR = rad
  }
  // Keep the label on screen: corner slots sit a unit's width from the edge.
  if (labelW === 0 && labelEl.value) labelW = labelEl.value.offsetWidth
  if (labelW > 0) {
    const half = labelW / 2
    const margin = 8
    const shift = Math.round(
      Math.max(margin - (x - half), Math.min(0, window.innerWidth - margin - (x + half)))
    )
    if (shift !== lastShift) {
      root.style.setProperty('--label-shift', `${shift}px`)
      lastShift = shift
    }
  }
  raf = requestAnimationFrame(frame)
}

// ─── Particles, on the sting's clock ────────────────────────────────────────
const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

let bloomTimer = 0
let twinkleTimer = 0

const bloom = (): void => {
  if (lastX < 0) return
  const { glow, accent, light } = palette.value
  if (reducedMotion) {
    emitSparkle(lastX, lastY, glow, 10)
    return
  }
  emitConfetti(lastX, lastY, 34, 1.55)
  emitSparkle(lastX, lastY, glow, 16)
  emitSparkle(lastX, lastY, accent, 12)
  emitSparkle(lastX, lastY, light, 10)
  emitSparkle(lastX, lastY, '#fff7b0', 10)
}

/** A few motes around the unit, every beat of the presentation phase. */
const twinkle = (startedAt: number): void => {
  if (Date.now() - startedAt > REVEAL_MS - 700 || lastX < 0) return
  const { glow, accent } = palette.value
  const rad = Math.max(lastR, 16)
  const a = Math.random() * Math.PI * 2
  const d = rad * (0.9 + Math.random() * 0.9)
  emitSparkle(lastX + Math.cos(a) * d, lastY + Math.sin(a) * d, Math.random() < 0.5 ? glow : accent, 3)
  if (Math.random() < 0.45) emitSparkle(lastX, lastY - rad * 0.6, '#fff7b0', 2)
}

const stopTimers = (): void => {
  window.clearTimeout(bloomTimer)
  window.clearInterval(twinkleTimer)
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

const start = (r: TierReveal): void => {
  stopTimers()
  misses = 0
  lastX = lastY = lastR = -1
  lastShift = 0
  labelW = 0
  const elapsed = Math.max(0, Date.now() - r.startedAt)
  t0.value = `${-elapsed}ms`

  // Label side. During the tutorial the coach-mark bubble sits ABOVE a target in
  // the lower half of the screen (TutorialOverlay's own rule), so ours goes on
  // the other side; otherwise above, unless the unit is too near the top.
  const el = targetEl(r)
  const b = el?.getBoundingClientRect()
  if (b) {
    const cy = b.top + b.height / 2
    labelBelow.value = tutorialActive.value ? cy > window.innerHeight * 0.55 : b.top < 96
  } else {
    labelBelow.value = false
  }

  // Place it now, before the first paint (this runs post-flush), so it never
  // shows a frame at the viewport's top-left corner; `frame` keeps itself going.
  frame()
  if (elapsed < REVEAL_BLOOM_MS) bloomTimer = window.setTimeout(bloom, REVEAL_BLOOM_MS - elapsed)
  if (!reducedMotion) twinkleTimer = window.setInterval(() => twinkle(r.startedAt), 420)
}

// A new discovery (new id) restarts the show; a retarget (same id) only moves
// it — the rAF loop already reads the target fresh every frame.
watch(() => reveal.value?.id, (id) => {
  const r = reveal.value
  if (id !== undefined && r) start(r)
  else stopTimers()
}, { flush: 'post', immediate: true })

onUnmounted(stopTimers)

/** Above the tutorial's dim while it runs, so its first discovery is not
 *  muddied by the coach-mark lightbox; otherwise under modals (z-50). */
const zIndex = computed(() => (tutorialActive.value ? 71 : 46))
</script>

<template lang="pug">
  Teleport(to="body")
    Transition(name="trf-out")
      div.trf(
        v-if="reveal"
        :key="reveal.id"
        ref="rootEl"
        aria-hidden="true"
        :style="{\
          zIndex,\
          '--t0': t0,\
          '--c-glow': palette.glow,\
          '--c-accent': palette.accent,\
          '--c-light': palette.light\
        }"
      )
        //- Small local spotlight: darkens a ring around the unit, never the screen.
        div.trf-layer.trf-dim
        //- Stage beam from above + the pool of light it lands in.
        div.trf-layer.trf-beam
          div.trf-beam__warm
          div.trf-beam__tint
        div.trf-layer.trf-pool
        //- Two counter-rotating ray fans (warm white, and the unit's own glow).
        div.trf-layer.trf-rays.trf-rays--a
        div.trf-layer.trf-rays.trf-rays--b
        //- The halo: an intro swell wrapping a breathing ring stack whose colour
        //- walks the unit's palette.
        div.trf-layer.trf-halo
          div.trf-halo__breath
            div.trf-ring.trf-aura
            div.trf-ring.trf-ring--glow
            div.trf-ring.trf-ring--accent
            div.trf-ring.trf-ring--gold
            div.trf-ring.trf-ring--white
            div.trf-ring.trf-ring--outer
        //- Wind-up implosion, then the bloom's flash and shockwave.
        div.trf-layer.trf-implode
        div.trf-layer.trf-flash
        div.trf-layer.trf-shock
        //- "NEW UNIT!" + name + tier.
        div.trf-label(ref="labelEl" :class="labelBelow ? 'is-below' : 'is-above'")
          div.trf-label__pop
            div.trf-label__title.game-text {{ t('tierReveal.title') }}
            div.trf-label__name.game-text(v-if="unitName") {{ unitName }}
            div.trf-label__tier {{ t('tierReveal.tier', { n: reveal.tier }) }}
</template>

<style scoped lang="sass">
// Sizes are multiples of --r, the unit's half-size, measured every frame from
// the element being followed. All motion is transform/opacity (independent
// `scale` / `rotate` / `translate` properties, so each layer's centring
// transform is never fought by its animation).
.trf
  position: fixed
  left: 0
  top: 0
  width: 0
  height: 0
  pointer-events: none
  --r: 36px
  will-change: transform

.trf-layer
  position: absolute
  left: 0
  top: 0
  translate: -50% -50%
  pointer-events: none
  animation-delay: var(--t0, 0ms)
  animation-fill-mode: both

// ── The local spotlight ──
.trf-dim
  width: calc(var(--r) * 8)
  height: calc(var(--r) * 8)
  border-radius: 50%
  // Clear over the unit and its aura, darkest just outside, gone by ~4R: the
  // neighbours stay visible (and tappable — it is pointer-events: none), but
  // the eye has nowhere to go except the unit.
  background: radial-gradient(circle closest-side, rgba(2, 4, 12, 0) 0 30%, rgba(2, 4, 12, 0.8) 42%, rgba(2, 4, 12, 0.62) 60%, rgba(2, 4, 12, 0.25) 80%, rgba(2, 4, 12, 0) 100%)
  animation: trf-dim 5s ease-out both
  animation-delay: var(--t0, 0ms)
@keyframes trf-dim
  0%
    opacity: 0
    scale: 1.3
  7%
    opacity: 1
    scale: 1
  30%
    opacity: 0.82
  55%
    opacity: 0.95
  80%
    opacity: 0.78
  100%
    opacity: 0
    scale: 1.12

// ── Stage beam ──
// A soft trapezoid of light falling onto the unit from above, bottom edge a
// little below its centre so the pool reads as the floor it lands on.
.trf-beam
  width: calc(var(--r) * 2.9)
  height: calc(var(--r) * 6.5)
  translate: -50% calc(-100% + var(--r) * 0.7)
  transform-origin: 50% 0
  clip-path: polygon(40% 0, 60% 0, 100% 100%, 0 100%)
  animation: trf-beam 5s ease-in-out both, trf-sway 3.1s ease-in-out infinite alternate
  animation-delay: var(--t0, 0ms), 0ms
.trf-beam__warm, .trf-beam__tint
  position: absolute
  inset: 0
.trf-beam__warm
  background: linear-gradient(to bottom, rgba(255, 250, 225, 0) 0%, rgba(255, 246, 205, 0.16) 35%, rgba(255, 240, 190, 0.5) 100%)
.trf-beam__tint
  background: linear-gradient(to bottom, transparent 10%, var(--c-glow) 100%)
  opacity: 0.35
  animation: trf-beam-tint 5s linear both
  animation-delay: var(--t0, 0ms)
@keyframes trf-beam
  0%, 5%
    opacity: 0
  9%
    opacity: 1
  30%
    opacity: 0.7
  50%
    opacity: 0.95
  70%
    opacity: 0.72
  88%
    opacity: 0.85
  100%
    opacity: 0
@keyframes trf-beam-tint
  0%, 20%
    opacity: 0.45
  45%
    opacity: 0.1
  70%
    opacity: 0.5
  100%
    opacity: 0.2
@keyframes trf-sway
  from
    rotate: -3deg
  to
    rotate: 3deg

.trf-pool
  width: calc(var(--r) * 3.4)
  height: calc(var(--r) * 1.3)
  translate: -50% calc(-50% + var(--r) * 0.82)
  border-radius: 50%
  background: radial-gradient(closest-side, rgba(255, 246, 210, 0.6), var(--c-glow) 45%, transparent 100%)
  opacity: 0.8
  animation: trf-beam 5s ease-in-out both
  animation-delay: var(--t0, 0ms)

// ── God rays ──
// Thin repeating conic spokes, masked so they start outside the unit and fade
// at the rim. Two fans turning opposite ways never line up twice.
.trf-rays
  border-radius: 50%
  -webkit-mask: radial-gradient(circle closest-side, transparent 0 30%, #000 42%, #000 58%, transparent 100%)
  mask: radial-gradient(circle closest-side, transparent 0 30%, #000 42%, #000 58%, transparent 100%)
.trf-rays--a
  width: calc(var(--r) * 6.6)
  height: calc(var(--r) * 6.6)
  background: repeating-conic-gradient(from 0deg, rgba(255, 244, 200, 0) 0deg 10deg, rgba(255, 244, 200, 0.75) 13.5deg, rgba(255, 244, 200, 0) 17deg 25.714deg)
  animation: trf-rays-a 5s linear both
  animation-delay: var(--t0, 0ms)
@keyframes trf-rays-a
  0%
    opacity: 0
    rotate: -30deg
    scale: 0.6
  6%
    opacity: 0.35
  7%
    opacity: 1
    scale: 1.12
  12%
    scale: 1
  30%
    opacity: 0.6
  50%
    opacity: 0.95
  70%
    opacity: 0.62
  88%
    opacity: 0.85
  100%
    opacity: 0
    rotate: 62deg
    scale: 1.05
.trf-rays--b
  width: calc(var(--r) * 5.4)
  height: calc(var(--r) * 5.4)
  background: repeating-conic-gradient(from 12deg, transparent 0deg 22deg, var(--c-glow) 28deg, transparent 34deg 40deg)
  animation: trf-rays-b 5s linear both
  animation-delay: var(--t0, 0ms)
@keyframes trf-rays-b
  0%, 6%
    opacity: 0
    rotate: 20deg
  8%
    opacity: 0.9
  35%
    opacity: 0.45
  60%
    opacity: 0.8
  85%
    opacity: 0.5
  100%
    opacity: 0
    rotate: -48deg

// ── Halo ──
.trf-halo
  width: calc(var(--r) * 3.2)
  height: calc(var(--r) * 3.2)
  animation: trf-halo-in 5s cubic-bezier(0.3, 1.4, 0.5, 1) both
  animation-delay: var(--t0, 0ms)
@keyframes trf-halo-in
  0%, 5%
    opacity: 0
    scale: 0.3
  8%
    opacity: 1
    scale: 1.3
  13%
    scale: 0.95
  18%
    scale: 1
  90%
    opacity: 1
    scale: 1
  100%
    opacity: 0
    scale: 0.7
.trf-halo__breath
  position: absolute
  inset: 0
  animation: trf-breathe 1.15s ease-in-out infinite alternate
@keyframes trf-breathe
  from
    scale: 0.95
    opacity: 0.78
  to
    scale: 1.06
    opacity: 1
.trf-ring
  position: absolute
  inset: 0
  border-radius: 50%
  animation-duration: 5s
  animation-timing-function: ease-in-out
  animation-fill-mode: both
  animation-delay: var(--t0, 0ms)
// A luminous band hugging the unit's edge — light spilling OFF it, not over it
// (the centre stays clear so the unit reads crisp through the halo).
.trf-aura
  inset: -8%
  background: radial-gradient(circle closest-side, transparent 0 46%, var(--c-glow) 54%, rgba(255, 246, 214, 0.55) 60%, var(--c-glow) 68%, transparent 92%)
  opacity: 0.55
  animation-name: trf-aura
@keyframes trf-aura
  0%, 6%
    opacity: 0
  8%
    opacity: 0.95
  30%
    opacity: 0.5
  50%
    opacity: 0.75
  70%
    opacity: 0.45
  88%
    opacity: 0.7
  100%
    opacity: 0
// The four colour layers cross-fade on the 5 s clock: the unit's glow, its
// accent, gold, then white-hot — the halo visibly "cooks" through the palette.
.trf-ring--glow
  background: radial-gradient(circle closest-side, transparent 0 55%, var(--c-glow) 63%, rgba(255, 255, 255, 0.85) 66%, var(--c-glow) 69%, transparent 80%)
  animation-name: trf-c-glow
.trf-ring--accent
  background: radial-gradient(circle closest-side, transparent 0 55%, var(--c-accent) 63%, rgba(255, 255, 255, 0.8) 66%, var(--c-accent) 69%, transparent 80%)
  animation-name: trf-c-accent
.trf-ring--gold
  background: radial-gradient(circle closest-side, transparent 0 55%, #ffb81f 63%, #fff4c2 66%, #ffcc33 69%, transparent 80%)
  animation-name: trf-c-gold
.trf-ring--white
  background: radial-gradient(circle closest-side, transparent 0 56%, #ffffff 64%, #fffbe8 66%, #ffffff 68%, transparent 78%)
  animation-name: trf-c-white
.trf-ring--outer
  inset: -22%
  background: radial-gradient(circle closest-side, transparent 0 72%, rgba(255, 238, 170, 0.55) 78%, transparent 88%)
  animation-name: trf-c-outer
@keyframes trf-c-glow
  0%, 6%
    opacity: 0
  8%, 26%
    opacity: 1
  36%, 72%
    opacity: 0
  82%, 100%
    opacity: 1
@keyframes trf-c-accent
  0%, 24%
    opacity: 0
  34%, 46%
    opacity: 1
  56%, 100%
    opacity: 0
@keyframes trf-c-gold
  0%, 44%
    opacity: 0
  54%, 66%
    opacity: 1
  76%, 100%
    opacity: 0
@keyframes trf-c-white
  0%, 5%
    opacity: 0
  7%
    opacity: 1
  11%, 64%
    opacity: 0
  72%, 78%
    opacity: 0.9
  86%, 100%
    opacity: 0
@keyframes trf-c-outer
  0%, 6%
    opacity: 0
  9%
    opacity: 1
  40%
    opacity: 0.35
  60%
    opacity: 0.9
  85%
    opacity: 0.4
  100%
    opacity: 0

// ── Wind-up and bloom ──
// A thin bright ring collapses onto the unit over the sting's first 0.35 s…
.trf-implode
  width: calc(var(--r) * 2.2)
  height: calc(var(--r) * 2.2)
  border-radius: 50%
  box-shadow: 0 0 0 2px rgba(255, 248, 220, 0.95), 0 0 14px 3px var(--c-glow)
  animation: trf-implode 5s ease-in both
  animation-delay: var(--t0, 0ms)
@keyframes trf-implode
  0%
    opacity: 0
    scale: 2.6
  5%
    opacity: 1
  7%
    opacity: 1
    scale: 0.55
  8%, 100%
    opacity: 0
    scale: 0.5
// …then the flash that fills it,
.trf-flash
  width: calc(var(--r) * 3)
  height: calc(var(--r) * 3)
  border-radius: 50%
  background: radial-gradient(circle closest-side, #ffffff 0%, rgba(255, 252, 235, 0.95) 32%, var(--c-glow) 58%, transparent 100%)
  animation: trf-flash 5s ease-out both
  animation-delay: var(--t0, 0ms)
@keyframes trf-flash
  0%, 6.6%
    opacity: 0
    scale: 0.25
  7%
    opacity: 1
    scale: 0.6
  11%
    opacity: 0.45
    scale: 1.8
  15%, 100%
    opacity: 0
    scale: 2.3
// …and the shockwave it throws.
.trf-shock
  width: calc(var(--r) * 2)
  height: calc(var(--r) * 2)
  border-radius: 50%
  background: radial-gradient(circle closest-side, transparent 0 78%, rgba(255, 250, 230, 0.95) 88%, var(--c-glow) 94%, transparent 100%)
  animation: trf-shock 5s cubic-bezier(0.1, 0.7, 0.3, 1) both
  animation-delay: var(--t0, 0ms)
@keyframes trf-shock
  0%, 6.8%
    opacity: 0
    scale: 0.5
  7%
    opacity: 1
    scale: 0.7
  21%, 100%
    opacity: 0
    scale: 4.4

// ── Label ──
.trf-label
  position: absolute
  left: 0
  translate: calc(-50% + var(--label-shift, 0px)) 0
  white-space: nowrap
  pointer-events: none
  &.is-above
    bottom: calc(var(--r) * 1.18)
  &.is-below
    top: calc(var(--r) * 1.12)
.trf-label__pop
  display: flex
  flex-direction: column
  align-items: center
  gap: 1px
  animation: trf-label 5s ease-out both
  animation-delay: var(--t0, 0ms)
  transform-origin: 50% 100%
.is-below .trf-label__pop
  transform-origin: 50% 0
@keyframes trf-label
  0%, 6.8%
    opacity: 0
    scale: 0.2
  7%
    opacity: 1
    scale: 0.5
  11%
    scale: 1.2
  15%
    scale: 0.94
  19%
    scale: 1
    translate: 0 0
  45%
    translate: 0 -3px
  70%
    translate: 0 0
  88%
    opacity: 1
    translate: 0 -2px
  100%
    opacity: 0
    translate: 0 -10px
    scale: 0.96
.trf-label__title
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.04em
  line-height: 1
  font-size: clamp(15px, calc(var(--r) * 0.5), 26px)
  color: #fff3a0
  // game-text's hard outline, plus a hot glow so it reads as light, not ink.
  text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 12px rgba(255, 210, 60, 0.95)
  animation: trf-title-glint 1.15s ease-in-out infinite alternate
@keyframes trf-title-glint
  from
    color: #fff3a0
  to
    color: #ffffff
.trf-label__name
  font-weight: 900
  line-height: 1.05
  font-size: clamp(11px, calc(var(--r) * 0.34), 17px)
  color: var(--c-glow)
  filter: brightness(1.25)
.trf-label__tier
  margin-top: 1px
  padding: 1px 7px
  border-radius: 999px
  border: 1.5px solid var(--c-glow)
  background: rgba(8, 12, 26, 0.85)
  color: #fff
  font-weight: 900
  font-size: clamp(9px, calc(var(--r) * 0.24), 12px)
  line-height: 1.3
  text-transform: uppercase
  letter-spacing: 0.06em

// An early end (the unit was merged away, fed to a fighter, or died) bows out
// quickly; the natural end at 5 s has already faded every layer to nothing.
.trf-out-leave-active
  transition: opacity 0.3s ease
.trf-out-leave-to
  opacity: 0

// Reduced motion: keep the light, the colour walk and the label — lose the
// spin, the sway, the implosion and the shockwave.
@media (prefers-reduced-motion: reduce)
  .trf-rays, .trf-implode, .trf-shock, .trf-flash
    display: none
  .trf-beam
    animation: trf-beam 5s ease-in-out both
    animation-delay: var(--t0, 0ms)
  .trf-halo__breath, .trf-label__title
    animation: none
</style>
