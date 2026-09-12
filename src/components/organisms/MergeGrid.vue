<script setup lang="ts">
/**
 * The interaction grid (GDD §3.1 / §7.2). Owns all drag input with a single
 * unified pointer pipeline (mouse + touch, no library):
 *
 *   pointerdown on a unit → lift it (floating ghost follows the pointer)
 *   pointermove           → ghost tracks; drop zones / target slot highlight
 *   pointerup             → resolve:
 *                             • over the battle arena drop zone → DEPLOY
 *                             • over a same-tier slot           → MERGE (tier+1)
 *                             • over an empty slot              → MOVE
 *                             • else                            → snap back
 *
 * Merge "juice" (squish + confetti + SFX) is fired here from the slot's live
 * screen rect. Deploys emit upward — the scene resolves them against the
 * battle (new fighter vs field merge vs army-full bounce). The component also
 * watches the automation imp's actions to mirror its merges/deploys.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import usePrismGame, { GRID_COLS } from '@/use/usePrismGame'
import { artSrc } from '@/use/useArtOverrides'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'
import useSounds from '@/use/useSound'
import { emitConfetti, emitSparkle } from '@/use/usePrismParticles'
import { hitZone, dragActive, dragTier, dragOverDrop } from '@/use/useDropZones'
import { activeReveal, claimRevealSound, revealAnimationDelay } from '@/use/useTierReveal'

const emit = defineEmits<{
  (e: 'deploy', payload: { idx: number; tier: number; x: number; y: number }): void
  (e: 'gridFull'): void
}>()

const game = usePrismGame()
const { grid } = game
const { playSound } = useSounds()

const rootRef = ref<HTMLElement | null>(null)

// Drop-in slot-frame bitmap (art-todo.md); null → procedural dashed frame.
const slotFrameStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  const art = artSrc('slot-frame')
  if (art) {
    style.backgroundImage = `url(${art})`
    style.backgroundSize = '100% 100%'
    style.borderColor = 'transparent'
    style.boxShadow = 'none'
  }
  return style
})

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
  // Drive the rest of the gesture from WINDOW, not this element. Pointer capture
  // is unreliable on mobile — if the drop lands on another control (e.g. the
  // Spawn button) the grid's own pointerup never fires, so the drag never ends
  // and the ghost freezes on screen (CG had to be restarted). Window listeners
  // guarantee we always see the up/cancel wherever the finger lifts.
  addDragListeners()
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
  removeDragListeners()
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

  // 1) Drop into the battle arena → deploy (the scene resolves the outcome).
  if (hitZone(x, y) === 'arena') {
    const tier = grid.value[src] ?? 0
    if (tier > 0) emit('deploy', { idx: src, tier, x, y })
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
      playSound('unit-move', 0.03)
    }
  }
  endDrag()
}

const onPointerCancel = (e: PointerEvent): void => {
  if (dragging.value && e.pointerId === activePointer) endDrag()
}

// Window-level drag listeners (added on drag start, removed on end) — the safety
// net that makes the drop robust regardless of where the finger lifts.
const addDragListeners = (): void => {
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
}
const removeDragListeners = (): void => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
}
onUnmounted(removeDragListeners) // never leak a global listener

// ── Merge feedback ──
const fireMerge = (idx: number, newTier: number): void => {
  mergingIndex.value = idx
  setTimeout(() => { if (mergingIndex.value === idx) mergingIndex.value = -1 }, 340)
  // A merge that produced a tier the player never had (announced by
  // `usePrismGame.merge`): the reveal sting REPLACES the ordinary pop, and the
  // confetti is held back for the bloom 0.35 s later (TierRevealFx) — the
  // contrast between the hush and the burst is most of what makes it land.
  if (claimRevealSound({ kind: 'grid', idx })) {
    playSound('new-tier-reveal', 0.07)
    return
  }
  const r = slotRect(idx)
  if (r) {
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    emitConfetti(cx, cy, 10 + Math.min(newTier, 8), 0.9 + newTier * 0.05)
  }
  // Pitch climbs with tier for a satisfying ladder.
  playSound('merge-pop', 0.04, 0.85 + Math.min(newTier, 10) * 0.05)
}

/** Grid slot of the unit currently being revealed, or -1. */
const revealIdx = computed<number>(() => {
  const r = activeReveal.value
  return r && r.target.kind === 'grid' ? r.target.idx : -1
})

// ── Spawn (called by the scene's Spawn button; taps meter up to a spawn) ──
const spawn = (): number => {
  const res = game.tapSpawn()
  if (res.full) {
    shake.value = true
    setTimeout(() => { shake.value = false }, 360)
    emit('gridFull')
    playSound('grid-full', 0.015)
    return -1
  }
  if (res.idx < 0) {
    // Meter tick only — pitch climbs toward the spawn for a "winding up" feel.
    playSound('spawn-tick', 0.02, 0.9 + (res.progress / res.required) * 0.35)
    return -1
  }
  const idx = res.idx
  poppingIndex.value = idx
  setTimeout(() => { if (poppingIndex.value === idx) poppingIndex.value = -1 }, 360)
  const r = slotRect(idx)
  if (r) emitSparkle(r.left + r.width / 2, r.top + r.height / 2, '#ffffff', 7)
  playSound('unit-spawn', 0.03, 1.1)
  return idx
}
defineExpose({ spawn })

// ── Mirror the automation imp's merges with the same VFX ──
// Merges are the ONLY thing the imp does — deploying stayed with the player
// (see `usePrismGame.autoStep`), so there is no auto-deploy flash to mirror.
watch(game.autoAction, (v) => {
  if (!v || !v.action) return
  const a = v.action
  if (a.type === 'merge') fireMerge(a.to, a.tier)
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
    @contextmenu.prevent
  )
    div.grid.h-full.w-full(
      :style="{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gap: '1.2  %' }"
    )
      div.slot.relative.flex.items-center.justify-center(
        v-for="(tier, idx) in grid"
        :key="idx"
        :data-slot="idx"
        :class="{ 'slot-hover': hoverIndex === idx, 'slot-source': dragSource === idx }"
      )
        div.slot-frame.absolute.inset-0(:style="slotFrameStyle")
        Transition(name="unit-pop")
          div.unit-holder.absolute(
            v-if="tier > 0"
            :key="tier + '-' + idx"
            :class="{ 'unit-pop-anim': poppingIndex === idx, 'unit-revealed': revealIdx === idx && dragSource !== idx }"
            :style="{ opacity: dragSource === idx ? 0.25 : 1, animationDelay: revealIdx === idx ? revealAnimationDelay(activeReveal) : undefined }"
          )
            IngredientUnit(:tier="tier" :merging="mergingIndex === idx")

    //- Floating drag ghost (follows the pointer, fixed to viewport).
    //- `data-drag-src` lets TierRevealFx follow a revealed unit while carried.
    Teleport(to="body")
      div.drag-ghost.fixed.pointer-events-none(
        v-if="dragging && ghostTier > 0"
        :data-drag-src="dragSource"
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

// New-tier reveal: the unit itself is part of the show. It sinks as the sting
// winds up, POPS at the bloom (0.35 s = 7 % of 5 s), then floats and glows for
// the rest of the moment. Rendered under TierRevealFx, whose halo has a clear
// centre so the unit always reads crisp through it.
.unit-revealed
  z-index: 2
  animation: unit-revealed 5s ease-in-out both
@keyframes unit-revealed
  0%
    transform: scale(0.82)
    filter: brightness(1)
  7%
    transform: scale(1.34) translateY(-6%)
    filter: brightness(2.1) drop-shadow(0 0 12px rgba(255, 244, 190, 1))
  11%
    transform: scale(0.96) translateY(0)
  15%
    transform: scale(1.08) translateY(-3%)
    filter: brightness(1.35) drop-shadow(0 0 9px rgba(255, 220, 110, 0.95))
  30%
    transform: scale(1.04) translateY(-6%)
  45%
    transform: scale(1.06) translateY(-1%)
    filter: brightness(1.1) drop-shadow(0 0 4px rgba(255, 220, 110, 0.6))
  60%
    transform: scale(1.04) translateY(-6%)
    filter: brightness(1.3) drop-shadow(0 0 9px rgba(255, 220, 110, 0.95))
  75%
    transform: scale(1.05) translateY(-1%)
    filter: brightness(1.1) drop-shadow(0 0 4px rgba(255, 220, 110, 0.6))
  90%
    transform: scale(1.02) translateY(-4%)
    filter: brightness(1.2) drop-shadow(0 0 7px rgba(255, 220, 110, 0.8))
  100%
    transform: scale(1) translateY(0)
    filter: brightness(1)
@media (prefers-reduced-motion: reduce)
  .unit-revealed
    animation-name: unit-revealed-still
  @keyframes unit-revealed-still
    0%, 100%
      filter: none
    10%, 90%
      filter: brightness(1.3) drop-shadow(0 0 8px rgba(255, 220, 110, 0.9))

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
