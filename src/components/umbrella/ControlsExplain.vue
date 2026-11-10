<script setup lang="ts">
/**
 * The controls page, before a new player's first level (src/umbrella/controlsExplain.ts): three animated lessons side by
 * side, drawn by lessonArt.ts on one canvas: how to steer, how the umbrella opens by itself when he steps off a ledge, and
 * how to open and shut it. Touch players see the finger and the button, keyboard players their own keys. "Tap to continue"
 * (touch) / "Click to continue" blinks at the bottom like the start screen's label; a tap, a click, Enter or Space goes on.
 * The game is frozen behind it like behind any menu.
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { acquireModalOpen } from '@/use/useModalState'
import { useUiTheme } from '@/umbrella/ui/theme'
import { drawLessonCard } from '@/umbrella/lessonArt'
import { signTouch } from '@/umbrella/signArt'
import type { LessonKind } from '@/umbrella/levels'

const emit = defineEmits<{ done: [] }>()
const { t } = useI18n()
const theme = useUiTheme()
const touch = signTouch()

const root = ref<HTMLElement | null>(null)
const cv = ref<HTMLCanvasElement | null>(null)
let release: (() => void) | null = null
let raf = 0
let t0 = 0
const KINDS: LessonKind[] = ['move', 'auto', 'toggle']

const frame = (now: number) => {
  raf = requestAnimationFrame(frame)
  const c = cv.value
  const ctx = c?.getContext('2d')
  if (!c || !ctx) return
  const dpr = window.devicePixelRatio || 1
  const cw = c.clientWidth, ch = c.clientHeight
  if (!cw || !ch) return
  if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr) }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cw, ch)
  // Three cards in a row, as large as the screen allows, a little above the middle (the label sits below).
  const gap = Math.max(10, cw * 0.016)
  const total = Math.min(cw * 0.95, 1180)
  const w = (total - gap * 2) / 3
  const h = Math.min(w * 0.78, ch * 0.6)
  const x0 = (cw - total) / 2
  const y = Math.max(8, (ch - h) / 2 - ch * 0.05)
  const time = (now - t0) / 1000
  KINDS.forEach((kind, i) => {
    // The card's own scale: the lessons are drawn for a 280 x 180 board, so each is scaled to its slot.
    ctx.save()
    const s = Math.min(w / 280, h / 180)
    ctx.translate(x0 + i * (w + gap) + (w - 280 * s) / 2, y + (h - 180 * s) / 2)
    ctx.scale(s, s)
    drawLessonCard(ctx, { x: 0, y: 0, w: 280, h: 180, kind }, time)
    ctx.restore()
  })
}

const go = () => emit('done')
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() }
}
onMounted(() => {
  release = acquireModalOpen()
  root.value?.focus()
  t0 = performance.now()
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
    :aria-label="t(touch ? 'tapToContinue' : 'clickToContinue')"
    tabindex="0"
    @pointerdown.stop
    @click.stop="go"
    @keydown="onKey"
  >
    <canvas ref="cv" class="ce-canvas" aria-hidden="true" />
    <div class="ce-label">{{ t(touch ? 'tapToContinue' : 'clickToContinue') }}</div>
  </div>
</template>

<style scoped>
.ce {
  position: absolute;
  inset: 0;
  z-index: 6;
  color: var(--ce-label);
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
.ce-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.ce-label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: max(5vh, calc(env(safe-area-inset-bottom) + 12px));
  padding: 0 16px;
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

.ce-plain { --ce-label: #fff; --ce-back: rgba(13, 16, 24, 0.9); --ce-label-shadow: 0 3px 0 rgba(0, 0, 0, 0.45), 0 0 26px rgba(0, 0, 0, 0.6); }
.ce-lantern {
  --ce-label: #fff3d6;
  --ce-back: radial-gradient(110% 90% at 50% 100%, rgba(214, 69, 44, 0.3), rgba(214, 69, 44, 0) 60%), rgba(18, 14, 42, 0.92);
  --ce-label-shadow: 0 2px 0 #7e1a17, 0 4px 0 rgba(20, 8, 30, 0.6), 0 0 22px rgba(255, 170, 70, 0.85), 0 0 52px rgba(255, 140, 60, 0.5);
}
.ce-lantern .ce-label { font-weight: 800; }
@media (prefers-reduced-motion: reduce) { .ce, .ce-label { animation: none; } }
</style>
