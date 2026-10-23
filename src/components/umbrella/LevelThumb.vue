<script setup lang="ts">
/**
 * A level's preview image, drawn by the game's own renderer from its share code
 * (the whole world, player at the start): no uploaded pictures, and previews
 * always match the current art. Backing store at css × devicePixelRatio.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { decodeLevel } from '@/umbrella/levelCode'
import { createWorld, poseMovers } from '@/umbrella/engine'
import { render } from '@/umbrella/renderer'
import { DEFAULT_TUNING } from '@/umbrella/tuning'
import type { LevelDef } from '@/umbrella/levels'

const props = defineProps<{ code?: string; label: string }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const broken = ref(false)

/** Decoded levels by code: paging back and forth does not inflate again. */
const cache = new Map<string, Promise<LevelDef | null>>()
const levelFor = (code: string) => {
  let p = cache.get(code)
  if (!p) cache.set(code, (p = decodeLevel(code).then((s) => s?.level ?? null)))
  return p
}

const draw = async () => {
  const el = canvas.value
  if (!el) return
  const level = props.code ? await levelFor(props.code) : null
  broken.value = !level
  if (!level || !el.isConnected) return
  const dpr = window.devicePixelRatio || 1
  const cw = Math.max(1, Math.round(el.clientWidth * dpr))
  const ch = Math.max(1, Math.round(el.clientHeight * dpr))
  el.width = cw
  el.height = ch
  const ctx = el.getContext('2d')
  if (!ctx) return
  const world = createWorld(level, { w: DEFAULT_TUNING.playerWidth, h: DEFAULT_TUNING.playerHeight })
  poseMovers(world, 0, DEFAULT_TUNING)
  // The whole world, letterboxed: a scrolling level shows all its screens.
  const s = Math.min(cw / level.world.w, ch / level.world.h)
  render(ctx, world, { finish: '' }, DEFAULT_TUNING, 0, { s, ox: (cw - level.world.w * s) / 2, oy: (ch - level.world.h * s) / 2 })
}

let observer: ResizeObserver | null = null
onMounted(() => {
  void draw()
  if (typeof ResizeObserver !== 'undefined' && canvas.value) {
    observer = new ResizeObserver(() => void draw())
    observer.observe(canvas.value)
  }
})
onUnmounted(() => observer?.disconnect())
watch(() => props.code, () => void draw())
</script>

<template>
  <div class="thumb" :class="{ broken }">
    <canvas ref="canvas" class="thumb-canvas" role="img" :aria-label="label" />
  </div>
</template>

<style scoped>
.thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: #0d1018;
}
.thumb-canvas { display: block; width: 100%; height: 100%; }
.thumb.broken .thumb-canvas { opacity: 0; }
</style>
