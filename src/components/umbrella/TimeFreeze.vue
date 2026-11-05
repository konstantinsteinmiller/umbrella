<script setup lang="ts">
/**
 * The time-freeze lightbox (src/umbrella/timeFreeze.ts): the game is held still, everything but the umbrella control is
 * dimmed, and a pulsing ring lights the control. No words — a tap or click on the lit control (or the umbrella key,
 * handled by the scene) opens the umbrella and the game goes on. Every other tap is swallowed, so nothing but the lesson
 * can happen while it is up. It sits under the HUD (z-index 3, earlier in the page), so pause and mute still work.
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  /** The control to light: the round umbrella button on touch, the umbrella key's hint row on a keyboard. */
  target: HTMLElement | null
  /** Round hole (the touch button) or a rounded box (the key hint). */
  round: boolean
}>()
const emit = defineEmits<{ press: [] }>()
const { t } = useI18n()

const PAD = 10
const hole = ref({ x: 0, y: 0, w: 0, h: 0 })
const measure = () => {
  const r = props.target?.getBoundingClientRect()
  if (!r || !r.width) {
    // Nothing to point at: a lit disc low on the right, where the button would be.
    const s = Math.min(window.innerWidth, window.innerHeight) * 0.22
    hole.value = { x: window.innerWidth - s * 1.4, y: window.innerHeight - s * 1.4, w: s, h: s }
    return
  }
  const side = props.round ? Math.max(r.width, r.height) : 0
  const w = props.round ? side : r.width
  const h = props.round ? side : r.height
  hole.value = { x: r.left + r.width / 2 - w / 2 - PAD, y: r.top + r.height / 2 - h / 2 - PAD, w: w + PAD * 2, h: h + PAD * 2 }
}

/** Where a pointer came down relative to the lit control, with a generous margin for a thumb. */
const onDown = (e: PointerEvent) => {
  e.preventDefault()
  const m = 14
  const { x, y, w, h } = hole.value
  if (e.clientX >= x - m && e.clientX <= x + w + m && e.clientY >= y - m && e.clientY <= y + h + m) emit('press')
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onUnmounted(() => window.removeEventListener('resize', measure))
</script>

<template>
  <div class="time-freeze" role="dialog" :aria-label="t('umbrella.umbrellaButton')" @pointerdown="onDown" @contextmenu.prevent>
    <div
      class="tf-hole"
      :class="{ round: round }"
      :style="{ left: `${hole.x}px`, top: `${hole.y}px`, width: `${hole.w}px`, height: `${hole.h}px` }"
      aria-hidden="true"
    >
      <i class="tf-ring" />
      <i class="tf-ring two" />
    </div>
  </div>
</template>

<style scoped>
.time-freeze {
  position: fixed;
  inset: 0;
  z-index: 3;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  animation: tf-in 0.35s ease-out both;
}
/* The lightbox: a cold dimmer cast from the hole outward (the hole itself shows the live control beneath). */
.tf-hole {
  position: absolute;
  border-radius: 16px;
  box-shadow: 0 0 0 200vmax rgba(8, 14, 34, 0.6), 0 0 28px 6px rgba(255, 231, 166, 0.55);
  pointer-events: none;
}
.tf-hole.round { border-radius: 50%; }
.tf-ring {
  position: absolute;
  inset: 0;
  border: 3px solid #ffe7a6;
  border-radius: inherit;
  animation: tf-pulse 1.3s ease-out infinite;
}
.tf-ring.two { animation-delay: 0.65s; }
@keyframes tf-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes tf-pulse {
  0% { transform: scale(1); opacity: 0.95; }
  100% { transform: scale(1.7); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .time-freeze { animation: none; }
  .tf-ring { animation: none; opacity: 0.9; }
  .tf-ring.two { display: none; }
}
</style>
