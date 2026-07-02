<script setup lang="ts">
/**
 * The interaction grid (GDD §3.1 / §7.2). Owns all drag input with a single
 * unified pointer pipeline (mouse + touch, no library):
 *
 *   pointerdown on a unit → lift it (floating ghost follows the pointer)
 *   pointermove           → ghost tracks; drop zones / target slot highlight
 *   pointerup             → resolve:
 *                             • over the cauldron/lab drop zone → INJECT
 *                             • over a same-tier slot           → MERGE (tier+1)
 *                             • over an empty slot              → MOVE
 *                             • else                            → snap back
 *
 * Merge "juice" (squish + confetti + SFX) is fired here from the slot's live
 * screen rect. Injects emit upward so the scene can run the gravity slide. The
 * component also watches the automation imp's actions to mirror its merges.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import usePrismGame, { GRID_COLS } from '@/use/usePrismGame'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'
import useSounds from '@/use/useSound'
import { emitConfetti, emitSparkle } from '@/use/usePrismParticles'
import { hitZone, dragActive, dragTier, dragOverDrop } from '@/use/useDropZones'

const emit = defineEmits<{
  (e: 'inject', payload: { tier: number; fromX: number; fromY: number }): void
  (e: 'gridFull'): void
}>()

const game = usePrismGame()
const { grid } = game
const { playSound } = useSounds()

const rootRef = ref<HTMLElement | null>(null)

// ── Drag state ──
const dragging = ref(false)
const dragSource = ref(-1)
const ghostTier = ref(0)
const ghostX = ref(0)
const ghostY = ref(0)
const ghostSize = ref(64)
const hoverIndex = ref(-1)
const mergingIndex = ref(-1)
const poppingIndex = ref(-1)
const shake = ref(false)

let activePointer: number | null = null

const slotEls = (): HTMLElement[] =>
  rootRef.value ? Array.from(rootRef.value.querySelectorAll<HTMLElement>('[data-slot]')) : []

const slotRect = (idx: number): DOMRect | null => {
  const el = rootRef.value?.querySelector<HTMLElement>(`[data-slot="${idx}"]`)
  return el ? el.getBoundingClientRect() : null
}

const slotIndexAt = (x: number, y: number): number => {
  for (const el of slotEls()) {
    const r = el.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return Number(el.dataset.slot)
    }
  }
  return -1
}

const onPointerDown = (e: PointerEvent): void => {
  if (dragging.value) return
  const el = (e.target as HTMLElement)?.closest<HTMLElement>('[data-slot]')
  if (!el) return
  const idx = Number(el.dataset.slot)
  if (!grid.value[idx]) return
  e.preventDefault()
  activePointer = e.pointerId
  try { rootRef.value?.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  dragging.value = true
  dragSource.value = idx
  ghostTier.value = grid.value[idx]
  const r = el.getBoundingClientRect()
  ghostSize.value = r.width
  ghostX.value = e.clientX
  ghostY.value = e.clientY
  dragActive.value = true
  dragTier.value = ghostTier.value
}

const onPointerMove = (e: PointerEvent): void => {
  if (!dragging.value || e.pointerId !== activePointer) return
  e.preventDefault()
  ghostX.value = e.clientX
  ghostY.value = e.clientY
  const overZone = hitZone(e.clientX, e.clientY) !== null
  dragOverDrop.value = overZone
  hoverIndex.value = overZone ? -1 : slotIndexAt(e.clientX, e.clientY)
}

const endDrag = (): void => {
  dragging.value = false
  dragSource.value = -1
  ghostTier.value = 0
  hoverIndex.value = -1
  dragActive.value = false
  dragOverDrop.value = false
  dragTier.value = 0
  activePointer = null
}

const onPointerUp = (e: PointerEvent): void => {
  if (!dragging.value || e.pointerId !== activePointer) return
  e.preventDefault()
  const src = dragSource.value
  const x = e.clientX, y = e.clientY

  // 1) Drop into the cauldron / lab area → inject.
  if (hitZone(x, y) !== null) {
    const tier = game.injectFromGrid(src)
    if (tier > 0) {
      const r = slotRect(src)
      emit('inject', { tier, fromX: r ? r.left + r.width / 2 : x, fromY: r ? r.top + r.height / 2 : y })
      playSound('water-splash', 0.05)
    } else {
      playSound('obstacle-hit', 0.015) // cauldron busy / full
    }
    endDrag()
    return
  }

  // 2) Drop onto another slot.
  const target = slotIndexAt(x, y)
  if (target >= 0 && target !== src) {
    if (grid.value[target] === grid.value[src]) {
      const newTier = game.merge(src, target)
      if (newTier > 0) fireMerge(target, newTier)
    } else if (grid.value[target] === 0) {
      game.moveSlot(src, target)
      playSound('anchor-swap', 0.03)
    }
  }
  endDrag()
}

const onPointerCancel = (): void => { if (dragging.value) endDrag() }

// ── Merge feedback ──
const fireMerge = (idx: number, newTier: number): void => {
  mergingIndex.value = idx
  setTimeout(() => { if (mergingIndex.value === idx) mergingIndex.value = -1 }, 340)
  const r = slotRect(idx)
  if (r) {
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    emitConfetti(cx, cy, 10 + Math.min(newTier, 8), 0.9 + newTier * 0.05)
  }
  // Pitch climbs with tier for a satisfying ladder.
  playSound('level-up', 0.04, 0.85 + Math.min(newTier, 10) * 0.05)
}

// ── Spawn (called by the scene's Spawn button) ──
const spawn = (): number => {
  const idx = game.spawnIngredient()
  if (idx < 0) {
    shake.value = true
    setTimeout(() => { shake.value = false }, 360)
    emit('gridFull')
    playSound('obstacle-hit', 0.015)
    return -1
  }
  poppingIndex.value = idx
  setTimeout(() => { if (poppingIndex.value === idx) poppingIndex.value = -1 }, 360)
  const r = slotRect(idx)
  if (r) emitSparkle(r.left + r.width / 2, r.top + r.height / 2, '#ffffff', 7)
  playSound('coin-pickup', 0.03, 1.1)
  return idx
}
defineExpose({ spawn })

// ── Mirror the automation imp's merges with the same VFX ──
watch(game.autoAction, (v) => {
  if (!v || !v.action) return
  const a = v.action
  if (a.type === 'merge') {
    fireMerge(a.to, a.tier)
  } else if (a.type === 'inject') {
    const r = slotRect(a.idx)
    emit('inject', { tier: a.tier, fromX: r ? r.left + r.width / 2 : 0, fromY: r ? r.top + r.height / 2 : 0 })
    playSound('water-splash', 0.04)
  }
})

onMounted(() => {
  game.startEngine()
})
onUnmounted(() => {
  game.stopEngine()
})
</script>

<template lang="pug">
  div.merge-grid.relative.w-full.h-full(
    ref="rootRef"
    :class="{ 'is-shake': shake }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @contextmenu.prevent
  )
    div.grid.h-full.w-full(
      :style="{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gap: '2.4%' }"
    )
      div.slot.relative.flex.items-center.justify-center(
        v-for="(tier, idx) in grid"
        :key="idx"
        :data-slot="idx"
        :class="{ 'slot-hover': hoverIndex === idx, 'slot-source': dragSource === idx }"
      )
        div.slot-frame.absolute.inset-0
        Transition(name="unit-pop")
          div.unit-holder.absolute(
            v-if="tier > 0"
            :key="tier + '-' + idx"
            :class="{ 'unit-pop-anim': poppingIndex === idx }"
            :style="{ opacity: dragSource === idx ? 0.25 : 1 }"
          )
            IngredientUnit(:tier="tier" :merging="mergingIndex === idx")

    //- Floating drag ghost (follows the pointer, fixed to viewport)
    Teleport(to="body")
      div.drag-ghost.fixed.pointer-events-none(
        v-if="dragging && ghostTier > 0"
        class="z-[80]"
        :style="{ left: ghostX + 'px', top: ghostY + 'px', width: ghostSize + 'px', height: ghostSize + 'px', transform: 'translate(-50%, -50%)' }"
      )
        IngredientUnit(:tier="ghostTier" :dragging="true" :still="true")
</template>

<style scoped lang="sass">
.merge-grid
  touch-action: none

.slot
  aspect-ratio: 1 / 1

.slot-frame
  border-radius: 18%
  border: 2.5px dashed rgba(255, 255, 255, 0.16)
  background: radial-gradient(circle at 50% 35%, rgba(80, 110, 170, 0.18), rgba(10, 16, 32, 0.35))
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.45)
  transition: border-color 0.15s ease, box-shadow 0.15s ease

.slot-hover .slot-frame
  border-color: #ffe23a
  box-shadow: inset 0 0 0 2px rgba(255, 226, 58, 0.5), inset 0 2px 6px rgba(0, 0, 0, 0.4)

.unit-holder
  inset: 5%

.unit-pop-anim
  animation: unit-spawn 0.36s cubic-bezier(0.34, 1.56, 0.64, 1)

@keyframes unit-spawn
  0%
    transform: scale(0.2)
    opacity: 0
  70%
    transform: scale(1.12)
    opacity: 1
  100%
    transform: scale(1)

.unit-pop-enter-active
  transition: transform 0.2s ease, opacity 0.2s ease
.unit-pop-enter-from
  transform: scale(0.4)
  opacity: 0

.is-shake
  animation: grid-shake 0.36s ease
@keyframes grid-shake
  0%, 100%
    transform: translateX(0)
  25%
    transform: translateX(-5px)
  75%
    transform: translateX(5px)
</style>
