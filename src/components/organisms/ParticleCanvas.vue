<script setup lang="ts">
/**
 * Full-screen, non-interactive canvas overlay that drives the shared particle
 * pool (`usePrismParticles`). One RAF for every effect in the scene. It idles
 * itself (skips the draw clear/loop body) when no particles are alive, and
 * pauses entirely while the tab is hidden, to keep the CPU/GPU cost near zero
 * when the lab is calm.
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { updateParticles, drawParticles, hasLiveParticles, clearParticles } from '@/use/usePrismParticles'

const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let raf = 0
let lastT = 0
let cssW = 0
let cssH = 0

const resize = (): void => {
  const c = canvasRef.value
  if (!c) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cssW = window.innerWidth
  cssH = window.innerHeight
  c.width = Math.round(cssW * dpr)
  c.height = Math.round(cssH * dpr)
  c.style.width = cssW + 'px'
  c.style.height = cssH + 'px'
  ctx = c.getContext('2d')
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

const loop = (t: number): void => {
  raf = requestAnimationFrame(loop)
  const dt = lastT ? Math.min(t - lastT, 48) : 16
  lastT = t
  if (document.hidden) return
  if (!ctx) return
  if (!hasLiveParticles()) {
    // Nothing to draw — clear once so the last frame doesn't linger, then idle.
    ctx.clearRect(0, 0, cssW, cssH)
    return
  }
  updateParticles(dt)
  ctx.clearRect(0, 0, cssW, cssH)
  drawParticles(ctx)
}

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
  raf = requestAnimationFrame(loop)
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  clearParticles()
})
</script>

<template lang="pug">
  canvas.particle-canvas.pointer-events-none.fixed.inset-0(ref="canvasRef" class="z-[60]")
</template>

<style scoped lang="sass">
.particle-canvas
  width: 100vw
  height: 100vh
</style>
