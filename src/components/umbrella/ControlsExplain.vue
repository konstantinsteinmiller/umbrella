<script setup lang="ts">
/**
 * The touch-controls lesson, before a new player's first level (see src/umbrella/controlsExplain.ts). No words: the
 * left half shows a finger sliding along an infinity line (steering is a slide left and right), the right half shows
 * an umbrella button that a tap switches between open and shut, its ring lighting up when it is open, as the real
 * button's does, and its picture always the NEXT state (the open umbrella while it is shut), as the real button's is. "Tap to continue" blinks at the bottom like the start screen's label; a tap, Enter or Space goes on.
 *
 * While it is up the game is frozen like behind any menu. It wears the build's look (drawn / lantern / clay), moves
 * with transform and opacity only, and holds still under prefers-reduced-motion (the umbrella still alternates).
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { acquireModalOpen } from '@/use/useModalState'
import { useUiTheme } from '@/umbrella/ui/theme'
import { drawPweeg, drawUmbrella } from '@/umbrella/characters'
import HangingLantern from './ornaments/HangingLantern.vue'

const emit = defineEmits<{ done: [] }>()
const { t } = useI18n()
const theme = useUiTheme()

const root = ref<HTMLElement | null>(null)
const track = ref<SVGPathElement | null>(null)
const trail = ref<SVGPathElement | null>(null)
const finger = ref<SVGGElement | null>(null)

// ── The finger on the infinity line ──
// Drawn from the middle crossing, round the right loop, back through the middle, round the left loop.
const INFINITY = 'M100 50 C130 8 188 8 188 50 C188 92 130 92 100 50 C70 8 12 8 12 50 C12 92 70 92 100 50 Z'
const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

let release: (() => void) | null = null
let raf = 0
let last = 0
let travelled = 0
const LOOP_SECONDS = 4.2
let len = 0
const frame = (now: number) => {
  raf = requestAnimationFrame(frame)
  const dt = Math.min(0.05, (now - (last || now)) / 1000)
  last = now
  drawDemo(now)
  if (reduced) return
  const tr = track.value
  if (!tr || !len) return
  travelled = (travelled + (dt / LOOP_SECONDS) * len) % len
  place(travelled)
}
const place = (at: number) => {
  const tr = track.value
  if (!tr) return
  const p = tr.getPointAtLength(at)
  finger.value?.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`)
  // A glowing tail behind the fingertip: the stretch of the line it has just crossed.
  const tail = len * 0.3
  trail.value?.setAttribute('stroke-dasharray', `${tail} ${len}`)
  trail.value?.setAttribute('stroke-dashoffset', String(-(at - tail)))
}

// ── Pweeg's answer to the button: the umbrella opens and shuts with each tap ──
// A small window beside the button, on the same clock as the button's own animation (one loop, two taps): while the
// ring is lit he floats down slowly under his open umbrella (a wavy current above him), after a tap that shuts it he
// drops fast with the umbrella furled in his hand (speed lines streak by), after the next tap it opens again.
const demo = ref<HTMLCanvasElement | null>(null)
const PERIOD = reduced ? 7.2 : 3.6
const OPEN_FROM = 0.33
const OPEN_TO = 0.73
let t0 = 0
const smooth = (x: number) => x * x * (3 - 2 * x)
/** Pweeg's height in the window (0 = top, 1 = bottom) through one loop, and how visible he is (he fades where the loop restarts). */
const pweegAt = (u: number): { y: number; open: boolean; alpha: number } => {
  let y: number
  // Shut, he falls like a stone: he starts near the top and speeds up (gravity), so at the tap he is dropping fast; the
  // open umbrella then catches him and he drifts down slowly. The contrast is the lesson.
  if (u < OPEN_FROM) y = 0.16 + 0.42 * Math.pow(u / OPEN_FROM, 1.7) // falling, shut
  else if (u < OPEN_TO) y = 0.58 + 0.06 * ((u - OPEN_FROM) / (OPEN_TO - OPEN_FROM)) // floating, open
  else y = 0.64 + 0.36 * Math.pow((u - OPEN_TO) / (1 - OPEN_TO), 1.7) // falling again, shut
  const alpha = Math.min(1, u / 0.05, (1 - u) / 0.07)
  return { y, open: u >= OPEN_FROM && u < OPEN_TO, alpha }
}
const drawDemo = (now: number) => {
  const cv = demo.value
  const ctx = cv?.getContext('2d')
  if (!cv || !ctx) return
  const dpr = window.devicePixelRatio || 1
  const cw = cv.clientWidth, ch = cv.clientHeight
  if (!cw || !ch) return
  if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr) }
  const time = (now - t0) / 1000
  const u = (time / PERIOD) % 1
  const p = pweegAt(u)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cw, ch)
  const k = ch / 150
  const cx = cw / 2
  const feetY = p.y * ch
  ctx.save()
  ctx.lineCap = 'round'
  if (p.open) {
    // The current he floats in: a wavy line running down to the canopy.
    ctx.strokeStyle = 'rgba(159, 211, 255, 0.8)'
    ctx.lineWidth = 2.2 * k
    ctx.globalAlpha = p.alpha
    ctx.beginPath()
    for (let y = 0.06 * ch; y <= feetY - 70 * k; y += 3) {
      const x = cx + 6 * k * Math.sin(y * 0.1 / k - time * 5)
      if (y === 0.06 * ch) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  } else {
    // Speed lines streaking up past a falling Pweeg.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.lineWidth = 2 * k
    ctx.globalAlpha = p.alpha
    for (let i = 0; i < 5; i++) {
      const lx = cx + (i - 2) * 15 * k
      const run = (((time * 5 + i * 0.37) % 1) + 1) % 1
      const ly = (0.95 - run * 0.85) * ch
      ctx.beginPath()
      ctx.moveTo(lx, ly)
      ctx.lineTo(lx, ly + 34 * k)
      ctx.stroke()
    }
  }
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = p.alpha
  ctx.translate(cx, feetY)
  ctx.scale(k * 1.15, k * 1.15)
  if (p.open) {
    drawPweeg(ctx, 0, 0, { pose: 'hold', facing: 1, w: 24, h: 36, time, open: true })
    drawUmbrella(ctx, 0, -40, { state: 'open', tilt: 0, time })
  } else {
    ctx.rotate(0.05 * Math.sin(time * 9))
    drawPweeg(ctx, 0, 0, { pose: 'flail', facing: 1, w: 24, h: 36, time, open: false })
    drawUmbrella(ctx, 23.5, -32.4, { state: 'furled', tilt: 0.35, time })
  }
  ctx.restore()
}

const go = () => emit('done')
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() }
}

onMounted(() => {
  release = acquireModalOpen()
  root.value?.focus()
  len = track.value?.getTotalLength() ?? 0
  t0 = performance.now()
  if (reduced) { travelled = len * 0.18; place(travelled) }
  raf = requestAnimationFrame(frame)
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  release?.()
  release = null
})
</script>

<template>
  <div
    ref="root"
    class="ce"
    :class="theme ? `ce-${theme}` : 'ce-plain'"
    role="dialog"
    aria-modal="true"
    :aria-label="t('tapToContinue')"
    tabindex="0"
    @pointerdown.stop
    @click.stop="go"
    @keydown="onKey"
  >
    <HangingLantern v-if="theme === 'lantern'" class="ce-hang l" />
    <HangingLantern v-if="theme === 'lantern'" class="ce-hang r" />

    <div class="ce-stage">
      <!-- Left: steering. A finger slides along an infinity line. -->
      <div class="ce-half ce-left" aria-hidden="true">
        <svg class="ce-inf" viewBox="0 0 200 100" focusable="false">
          <path class="ce-track-glow" :d="INFINITY" />
          <path ref="track" class="ce-track" :d="INFINITY" />
          <path ref="trail" class="ce-trail" :d="INFINITY" />
          <g ref="finger" class="ce-finger">
            <circle class="ce-touch-ring" r="9" />
            <circle class="ce-touch-dot" r="4.2" />
            <!-- The hand, its fingertip on the point. -->
            <g class="ce-hand" transform="translate(-3 -1.5) scale(0.62)">
              <path d="M13.2 1.5c-1.9 0-3.4 1.5-3.4 3.4v17.6l-2.2-2.1c-1.2-1.1-3.1-1.1-4.2.1-1 1.1-1 2.8 0 3.9l7.4 8.4c1.6 1.9 3.8 3 6.3 3h8.1c3.7 0 6.7-3 6.7-6.7v-9.2c0-1.5-1.2-2.7-2.7-2.7-.5 0-.9.1-1.3.3-.4-1.2-1.5-2.1-2.8-2.1-.6 0-1.2.2-1.7.5-.5-1.1-1.5-1.8-2.7-1.8-.4 0-.8.1-1.1.2V4.9c0-1.9-1.5-3.4-3.4-3.4z" />
            </g>
          </g>
        </svg>
        <!-- The pad it stands for: the knob slides left and right with the finger. -->
        <div class="ce-pad"><i class="ce-pad-knob" /></div>
      </div>

      <!-- Right: the umbrella. A tap switches it open and shut; the ring is lit while it is open. -->
      <div class="ce-half ce-right" aria-hidden="true">
        <canvas ref="demo" class="ce-demo" />
        <!-- From the button to Pweeg: the tap goes through to him. -->
        <svg class="ce-flow" viewBox="0 0 40 24" focusable="false">
          <path class="f1" d="M30 4 L22 12 L30 20" />
          <path class="f2" d="M20 4 L12 12 L20 20" />
          <path class="f3" d="M10 4 L2 12 L10 20" />
        </svg>
        <div class="ce-btn">
          <span class="ce-ripple" />
          <svg class="ce-umb ce-umb-closed" viewBox="0 0 48 64" focusable="false">
            <path class="u-canopy" d="M24 3 C28 11 29 24 26.5 40 L21.5 40 C19 24 20 11 24 3Z" />
            <path class="u-pole" d="M24 40 V54 a4.2 4.2 0 0 1 -8.4 0" />
            <path class="u-rib" d="M24 6 C25.5 16 25.5 28 24.4 38" />
          </svg>
          <svg class="ce-umb ce-umb-open" viewBox="0 0 48 64" focusable="false">
            <path class="u-canopy" d="M3 30 A21 21 0 0 1 45 30 Q39.5 25 34.5 30 Q29.2 25 24 30 Q18.8 25 13.5 30 Q8.5 25 3 30Z" />
            <path class="u-pole" d="M24 30 V52 a4.2 4.2 0 0 1 -8.4 0" />
            <path class="u-rib" d="M24 10 V29 M13 17 L18 29 M35 17 L30 29" />
          </svg>
          <svg class="ce-tap" viewBox="0 0 40 48" focusable="false">
            <path d="M13.2 1.5c-1.9 0-3.4 1.5-3.4 3.4v17.6l-2.2-2.1c-1.2-1.1-3.1-1.1-4.2.1-1 1.1-1 2.8 0 3.9l7.4 8.4c1.6 1.9 3.8 3 6.3 3h8.1c3.7 0 6.7-3 6.7-6.7v-9.2c0-1.5-1.2-2.7-2.7-2.7-.5 0-.9.1-1.3.3-.4-1.2-1.5-2.1-2.8-2.1-.6 0-1.2.2-1.7.5-.5-1.1-1.5-1.8-2.7-1.8-.4 0-.8.1-1.1.2V4.9c0-1.9-1.5-3.4-3.4-3.4z" />
          </svg>
        </div>
      </div>
    </div>

    <div class="ce-label">{{ t('tapToContinue') }}</div>
  </div>
</template>

<style scoped>
.ce {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  color: var(--ce-ink);
  background: var(--ce-back);
  font-family: var(--u-display, var(--app-font-stack, 'Segoe UI', system-ui, sans-serif));
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  animation: ce-in 0.45s ease both;
}
@keyframes ce-in { from { opacity: 0; } }

.ce-stage {
  --u: min(32vw, 52vh);
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  width: min(92vw, 980px);
  margin-top: -6vh;
}
.ce-half { display: grid; justify-items: center; align-content: center; gap: calc(var(--u) * 0.16); animation: ce-rise 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both; }
.ce-right { animation-delay: 0.22s; }
@keyframes ce-rise { from { opacity: 0; transform: translateY(18px) scale(0.94); } }

/* ── Left: the infinity line, the finger, the pad's knob ───────────────────── */
.ce-inf { width: var(--u); height: calc(var(--u) * 0.5); overflow: visible; }
.ce-track-glow { fill: none; stroke: var(--ce-line-glow); stroke-width: 11; stroke-linecap: round; filter: blur(5px); }
.ce-track { fill: none; stroke: var(--ce-line); stroke-width: 4.2; stroke-linecap: round; stroke-dasharray: 1 9; }
.ce-trail { fill: none; stroke: var(--ce-accent); stroke-width: 5.5; stroke-linecap: round; filter: drop-shadow(0 0 5px var(--ce-accent)); }
.ce-touch-ring { fill: var(--ce-touch-fill); stroke: var(--ce-accent); stroke-width: 1.6; }
.ce-touch-dot { fill: var(--ce-accent); }
.ce-hand path { fill: var(--ce-hand); stroke: var(--ce-hand-line); stroke-width: 1.8; stroke-linejoin: round; paint-order: stroke; }
.ce-pad {
  position: relative;
  width: calc(var(--u) * 0.62);
  height: calc(var(--u) * 0.2);
  border-radius: 999px;
  background: var(--ce-pad);
  box-shadow: var(--ce-pad-shadow);
}
.ce-pad-knob {
  position: absolute;
  top: 11%;
  left: 50%;
  width: calc(var(--u) * 0.156);
  height: calc(var(--u) * 0.156);
  margin-left: calc(var(--u) * -0.078);
  border-radius: 50%;
  background: var(--ce-knob);
  box-shadow: var(--ce-knob-shadow);
  /* The same loop as the finger's: it crosses the line's middle at 0 %, 50 % and 100 %, right-most a quarter in. */
  animation: ce-knob 4.2s linear infinite;
}
@keyframes ce-knob {
  0% { transform: translateX(0); }
  25% { transform: translateX(calc(var(--u) * 0.17)); }
  50% { transform: translateX(0); }
  75% { transform: translateX(calc(var(--u) * -0.17)); }
  100% { transform: translateX(0); }
}

/* ── Right: the umbrella button, open and shut by tap, and Pweeg's answer ──────── */
.ce-right { grid-auto-flow: column; align-items: center; justify-items: center; gap: calc(var(--u) * 0.04); }
.ce-demo {
  width: calc(var(--u) * 0.4);
  height: calc(var(--u) * 0.62);
  border-radius: calc(var(--u) * 0.05);
  background: var(--ce-card);
  box-shadow: var(--ce-card-shadow);
}
.ce-flow { width: calc(var(--u) * 0.15); height: auto; overflow: visible; }
.ce-flow path { fill: none; stroke: var(--ce-accent); stroke-width: 4.5; stroke-linecap: round; stroke-linejoin: round; opacity: 0.25; animation: ce-flow 3.6s ease-out infinite; }
.ce-flow .f2 { animation-delay: 0.1s; }
.ce-flow .f3 { animation-delay: 0.2s; }
/* The chevrons run from the button towards Pweeg right after each tap (at 24 % and 72 % of the loop). */
@keyframes ce-flow {
  0%, 22% { opacity: 0.2; }
  27% { opacity: 1; }
  44% { opacity: 0.2; }
  70% { opacity: 0.2; }
  75% { opacity: 1; }
  92%, 100% { opacity: 0.2; }
}
.ce-btn {
  --d: calc(var(--u) * 0.56);
  position: relative;
  width: var(--d);
  height: var(--d);
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--ce-btn-back);
  box-shadow: var(--ce-btn-shadow);
  animation: ce-ring 3.6s ease-in-out infinite;
}
/* The ring lights while the umbrella is open (from the first tap to the second), like the real button's. */
@keyframes ce-ring {
  0%, 24% { box-shadow: var(--ce-btn-shadow); filter: none; }
  30%, 70% { box-shadow: var(--ce-btn-shadow-open); filter: brightness(1.12); }
  76%, 100% { box-shadow: var(--ce-btn-shadow); filter: none; }
}
.ce-umb { position: absolute; inset: 0; margin: auto; width: 58%; height: 58%; overflow: visible; }
.ce-umb .u-canopy { fill: var(--ce-umb); stroke: var(--ce-umb-line); stroke-width: 2.4; stroke-linejoin: round; }
.ce-umb .u-pole { fill: none; stroke: var(--ce-umb-line); stroke-width: 2.8; stroke-linecap: round; }
.ce-umb .u-rib { fill: none; stroke: var(--ce-umb-line); stroke-width: 1.5; stroke-linecap: round; opacity: 0.6; }
/* The button shows what the next tap does: the OPEN umbrella while it is shut, the furled one while it is open. */
.ce-umb-open { animation: ce-closed 3.6s ease-in-out infinite; }
.ce-umb-closed { animation: ce-open 3.6s ease-in-out infinite; transform-origin: 50% 70%; }
@keyframes ce-closed {
  0%, 26% { opacity: 1; transform: scale(1); }
  31%, 72% { opacity: 0; transform: scale(0.82); }
  77%, 100% { opacity: 1; transform: scale(1); }
}
@keyframes ce-open {
  0%, 26% { opacity: 0; transform: scale(0.6); }
  34% { opacity: 1; transform: scale(1.08); }
  38%, 70% { opacity: 1; transform: scale(1); }
  74%, 100% { opacity: 0; transform: scale(0.6); }
}
/* The finger taps the button twice per loop: it lands, presses, lifts; a ring spreads from the touch. */
.ce-tap {
  position: absolute;
  right: -14%;
  bottom: -30%;
  width: 40%;
  fill: var(--ce-hand);
  stroke: var(--ce-hand-line);
  stroke-width: 1.8;
  stroke-linejoin: round;
  paint-order: stroke;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35));
  animation: ce-tap 3.6s ease-in-out infinite;
}
@keyframes ce-tap {
  0%, 12% { transform: translate(22%, 26%); opacity: 0; }
  20% { transform: translate(0, 0); opacity: 1; }
  24% { transform: translate(-6%, -7%) scale(0.92); opacity: 1; }
  32% { transform: translate(8%, 10%); opacity: 1; }
  40%, 62% { transform: translate(22%, 26%); opacity: 0; }
  68% { transform: translate(0, 0); opacity: 1; }
  72% { transform: translate(-6%, -7%) scale(0.92); opacity: 1; }
  80% { transform: translate(8%, 10%); opacity: 1; }
  88%, 100% { transform: translate(22%, 26%); opacity: 0; }
}
.ce-ripple { position: absolute; inset: 0; border-radius: 50%; border: 3px solid var(--ce-accent); opacity: 0; animation: ce-ripple 3.6s ease-out infinite; }
@keyframes ce-ripple {
  0%, 22% { transform: scale(0.8); opacity: 0; }
  24% { transform: scale(0.85); opacity: 0.9; }
  42% { transform: scale(1.5); opacity: 0; }
  70% { transform: scale(0.8); opacity: 0; }
  72% { transform: scale(0.85); opacity: 0.9; }
  90%, 100% { transform: scale(1.5); opacity: 0; }
}

/* ── The label: big, uppercase, softly pulsing, like the start screen's ───────── */
.ce-label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: max(5vh, calc(env(safe-area-inset-bottom) + 12px));
  padding: 0 16px;
  color: var(--ce-label);
  font-weight: 900;
  font-size: clamp(22px, 4.6vw, 46px);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: center;
  text-wrap: balance;
  text-shadow: var(--ce-label-shadow);
  animation: ce-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@keyframes ce-pulse { 50% { opacity: 0.5; } }

/* ═══ Drawn ═══ */
.ce-plain {
  --ce-ink: #fff;
  --ce-back: rgba(13, 16, 24, 0.9);
  --ce-accent: #4f8cff;
  --ce-line: rgba(255, 255, 255, 0.55);
  --ce-line-glow: rgba(79, 140, 255, 0.35);
  --ce-touch-fill: rgba(79, 140, 255, 0.25);
  --ce-hand: #f4efe2;
  --ce-hand-line: #0d0d12;
  --ce-pad: rgba(255, 255, 255, 0.1);
  --ce-pad-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.35);
  --ce-knob: rgba(255, 255, 255, 0.88);
  --ce-knob-shadow: none;
  --ce-btn-back: rgba(255, 255, 255, 0.12);
  --ce-btn-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.4);
  --ce-btn-shadow-open: inset 0 0 0 3px #ffe7a6, 0 0 22px rgba(255, 231, 166, 0.5);
  --ce-umb: #ff5d5d;
  --ce-umb-line: #fff;
  --ce-label: #fff;
  --ce-label-shadow: 0 3px 0 rgba(0, 0, 0, 0.45), 0 0 26px rgba(0, 0, 0, 0.6);
  --ce-card: linear-gradient(180deg, #1b2336, #0f1522);
  --ce-card-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.5), 0 8px 18px rgba(0, 0, 0, 0.4);
}

/* ═══ Lantern ═══ */
.ce-lantern {
  --ce-ink: #fbf1dc;
  --ce-back: radial-gradient(110% 90% at 50% 100%, rgba(214, 69, 44, 0.3), rgba(214, 69, 44, 0) 60%), rgba(18, 14, 42, 0.92);
  --ce-accent: #ffc66e;
  --ce-line: rgba(255, 231, 166, 0.7);
  --ce-line-glow: rgba(255, 170, 70, 0.4);
  --ce-touch-fill: rgba(255, 170, 70, 0.25);
  --ce-hand: #fbf1dc;
  --ce-hand-line: #7e1a17;
  --ce-pad: linear-gradient(180deg, rgba(42, 36, 92, 0.95), rgba(24, 19, 58, 0.95));
  --ce-pad-shadow: 0 0 0 1.5px #2a1d3a, 0 0 0 3.5px rgba(232, 180, 80, 0.85), 0 0 0 4.5px #2a1d3a;
  --ce-knob: radial-gradient(circle at 46% 40%, #fff2c4 0%, #ffc66e 35%, #e6612f 75%, #a92a1a 100%);
  --ce-knob-shadow: 0 0 16px 3px rgba(255, 170, 70, 0.55);
  --ce-btn-back:
    radial-gradient(circle, #fbeec9 0 27%, #2a1d3a 27% 28.5%, transparent 29%),
    repeating-conic-gradient(from 0deg, #d6452c 0 15deg, #b52f1d 15deg 30deg);
  --ce-btn-shadow: 0 0 0 2px #2a1d3a, 0 0 0 5px #e8b450, 0 0 0 6.5px #2a1d3a, 0 10px 22px rgba(0, 0, 0, 0.45);
  --ce-btn-shadow-open: 0 0 0 2px #2a1d3a, 0 0 0 5px #ffe7a6, 0 0 0 6.5px #2a1d3a, 0 0 32px rgba(255, 170, 70, 0.75);
  --ce-umb: #f6ecd6;
  --ce-umb-line: #7e1a17;
  --ce-label: #fff3d6;
  --ce-label-shadow: 0 2px 0 #7e1a17, 0 4px 0 rgba(20, 8, 30, 0.6), 0 0 22px rgba(255, 170, 70, 0.85), 0 0 52px rgba(255, 140, 60, 0.5);
  --ce-card: linear-gradient(180deg, #3a2a5e, #1b1740 70%, #2a1d3a);
  --ce-card-shadow: 0 0 0 2px #2a1d3a, 0 0 0 4.5px #e8b450, 0 0 0 6px #2a1d3a, 0 10px 20px rgba(0, 0, 0, 0.45);
}
.ce-lantern .ce-label { font-family: var(--u-display); font-weight: 800; }
.ce-hang { position: absolute; top: -4px; width: clamp(34px, 6vw, 64px); pointer-events: none; }
.ce-hang.l { left: 9%; }
.ce-hang.r { right: 9%; }
.ce-hang.r :deep(.hl) { animation-delay: -1.9s; }

/* ═══ Clay ═══ */
.ce-clay {
  --ce-ink: #fffaf0;
  --ce-back: rgba(63, 76, 104, 0.93);
  --ce-accent: #f1b72f;
  --ce-line: rgba(255, 250, 240, 0.75);
  --ce-line-glow: rgba(241, 183, 47, 0.35);
  --ce-touch-fill: rgba(241, 183, 47, 0.3);
  --ce-hand: #f3ead8;
  --ce-hand-line: #2f5fa8;
  --ce-pad: linear-gradient(180deg, #4b5462, #606b7b);
  --ce-pad-shadow: inset 0 4px 8px rgba(0, 0, 0, 0.45), 0 0 0 4px #efe4cc, 0 3px 0 4px #b9a888;
  --ce-knob: radial-gradient(circle at 36% 30%, #ffe7a0 0%, #f1b72f 50%, #a9760a 100%);
  --ce-knob-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.45), 0 4px 0 #7d5806;
  --ce-btn-back: radial-gradient(circle at 50% 30%, #ff9f88 0%, #ee6a50 34%, #e0533d 58%, #a9321f 100%);
  --ce-btn-shadow: inset 0 3px 2px rgba(255, 255, 255, 0.4), inset 0 -7px 9px rgba(80, 10, 0, 0.3), 0 0 0 2px #7a2014, 0 6px 0 1px #7a2014, 0 14px 20px rgba(0, 0, 0, 0.4);
  --ce-btn-shadow-open: inset 0 3px 2px rgba(255, 255, 255, 0.5), inset 0 -7px 9px rgba(80, 10, 0, 0.2), 0 0 0 3px #ffd75e, 0 6px 0 1px #7a2014, 0 0 30px rgba(255, 215, 94, 0.7);
  --ce-umb: #fffaf0;
  --ce-umb-line: #7a2014;
  --ce-label: #fffaf0;
  --ce-label-shadow: 0 2px 0 #2f5fa8, 0 4px 0 #24508f, 0 6px 0 #1d3f78, 0 8px 0 #173464, 0 14px 22px rgba(0, 0, 0, 0.5);
  --ce-card: linear-gradient(180deg, #7d8fae, #5d6b86);
  --ce-card-shadow: inset 0 3px 2px rgba(255, 255, 255, 0.4), 0 0 0 3px #efe4cc, 0 4px 0 3px #b9a888, 0 14px 20px rgba(0, 0, 0, 0.4);
}
.ce-clay .ce-label { font-family: var(--u-display); font-weight: 400; letter-spacing: 0.05em; }

/* ═══ Reduced motion: the finger rests on the line, the label stays lit; the umbrella still alternates, slowly ═══ */
@media (prefers-reduced-motion: reduce) {
  .ce, .ce-half { animation: none; }
  .ce-label, .ce-pad-knob, .ce-tap, .ce-ripple { animation: none; }
  .ce-flow path { animation-duration: 7.2s; }
  .ce-tap { opacity: 1; transform: translate(8%, 10%); }
  .ce-ripple { display: none; }
  .ce-umb-closed, .ce-umb-open, .ce-btn { animation-duration: 7.2s; }
}
</style>
