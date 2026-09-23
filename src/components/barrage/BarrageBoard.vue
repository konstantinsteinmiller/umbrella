<script setup lang="ts">
/**
 * BarrageBoard — the canvas board seam (CONTRACT §10; RENDER builds, UI mounts).
 *
 *   • fills its parent and letterboxes the board (`render/layout.ts`), DPR ≤ 2,
 *     ResizeObserver-driven;
 *   • owns the rAF loop: `engine.update(dt)` unless `isGamePaused || holdSim`,
 *     always draws (a paused game keeps its last frame and skips the work);
 *   • slingshot input in phase 'aim' only (`render/aim.ts`), fires through
 *     `useBarrage().fire(angle)` itself and emits aimStart / aimCancel / fired;
 *   • board SFX/VFX + coins flying to `coinTarget` (the shared particle overlay).
 *
 * Draws numbers only — every word on screen is DOM owned by UI.
 */
import { inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FLOOR_Y } from '@/barrage/engine/types'
import { coinSrc } from '@/barrage/art'
import useBarrage from '@/barrage/state/useBarrage'
import useCollections from '@/barrage/state/useCollections'
import { BoardRenderer, type RendererStats } from '@/barrage/render/BoardRenderer'
import { AimController } from '@/barrage/render/aim'
import { cellX, cellY } from '@/barrage/render/layout'
import { FIELD_BANDS } from '@/barrage/render/backdrop'
import { backdropSrc } from '@/barrage/render/backdropArt'
import { sprite } from '@/barrage/render/sprites'
import { BOARD_SOURCE_KEY, type BoardSource } from '@/barrage/render/source'
import { isGamePaused } from '@/use/useGamePause'
import { retiredTags } from '@/use/useCoach'
import { useScreenshake } from '@/use/useScreenshake'
import { emitCoinFlight, emitConfetti, setCoinFlightImage } from '@/use/usePrismParticles'

const props = withDefaults(defineProps<{
  /** Coins earned on the board fly to this element (the wallet badge). */
  coinTarget?: HTMLElement | null
}>(), { coinTarget: null })

const emit = defineEmits<{
  (e: 'aimStart'): void
  (e: 'aimCancel'): void
  (e: 'fired', angle: number): void
  /** The finger on the board points AT the monsters instead of pulling back:
   *  its drag vector (CSS px, y down) while it does, null when it stops. The
   *  coach shows the right way live. */
  (e: 'aimWrongWay', drag: { dx: number; dy: number } | null): void
  /** A release fired nothing: a wrong-way pull, or a pull too short to count. */
  (e: 'misfire', kind: 'wrongWay' | 'tap'): void
}>()

// The game reads the live run; the dev lab provides a sandbox source instead.
const liveSource = (): BoardSource => {
  const b = useBarrage()
  const c = useCollections()
  return {
    engine: b.engine,
    engineGen: b.engineGen,
    holdSim: b.holdSim,
    fire: (a: number) => b.fire(a),
    onEngineEvent: (cb) => b.onEngineEvent(cb),
    selectedLauncher: c.selectedLauncher,
    selectedSkin: c.selectedSkin,
    coachRetired: retiredTags
  }
}
const source: BoardSource = inject(BOARD_SOURCE_KEY, null) ?? liveSource()

const rootRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const { triggerShake } = useScreenshake()

// ─── Wallet coin flights (client space, rate-limited) ────────────────────────
let canvasRect: DOMRect | null = null
let targetRect: DOMRect | null = null
let targetEl: HTMLElement | null = null
let rectAge = 0
let coinBudget = 0
/** Client rects are cached (refreshed every 0.5 s / on resize): a coin event never forces a layout. */
const refreshRect = (): DOMRect | null => {
  const c = canvasRef.value
  if (!c) return null
  canvasRect = c.getBoundingClientRect()
  targetEl = props.coinTarget
  targetRect = targetEl ? targetEl.getBoundingClientRect() : null
  rectAge = 0
  return canvasRect
}

const renderer = new BoardRenderer({
  shake: (i) => triggerShake(i),
  coins: (px, py, amount) => {
    const target = props.coinTarget
    if (!target) return false
    const cr = target !== targetEl || !canvasRect ? refreshRect() : canvasRect
    const tr = targetRect
    if (!cr || !tr || tr.width === 0) return false
    // ≤ ~14 flying coins per 100 ms: a 40-kill volley still reads as a stream.
    const want = Math.max(1, Math.min(5, Math.round(1 + Math.log10(amount + 1) * 1.2)))
    const n = Math.min(want, Math.floor(coinBudget))
    if (n <= 0) return true
    coinBudget -= n
    emitCoinFlight(cr.left + px, cr.top + py, tr.left + tr.width / 2, tr.top + tr.height / 2, n, Math.max(12, Math.min(22, renderer.layout.cell * 0.34)))
    return true
  },
  confetti: (px, py, count) => {
    const cr = canvasRect ?? refreshRect()
    if (cr) emitConfetti(cr.left + px, cr.top + py, count, 1.2)
  }
})
setCoinFlightImage(sprite(coinSrc()).img)

const aim = new AimController()
let raf = 0
let last = 0
/** A redraw is owed even while paused (resize, engine swap, cosmetic change). */
let dirty = true
let simMs = 0
let reduceMq: MediaQueryList | null = null
const onReduceChange = (): void => {
  renderer.reducedMotion = !!reduceMq?.matches
}

// ─── Engine swaps / cosmetics ────────────────────────────────────────────────
const bindEngine = (): void => {
  renderer.setEngine(source.engine.value)
  if (aim.active) cancelAim(true)
  dirty = true
}
// Both: a swap bumps engineGen, but never trust the order of the two writes.
watch([() => source.engine.value, () => source.engineGen.value], bindEngine)
watch(() => source.selectedLauncher.value, (t) => { renderer.launcherTier = t; dirty = true }, { immediate: true })
watch(() => source.selectedSkin.value, (s) => { renderer.skin = s; dirty = true }, { immediate: true })
// Painted floors per depth band (and the art flag flipping them off/on).
watch(() => FIELD_BANDS.map((b) => backdropSrc(b.key)), (srcs) => { renderer.setFieldArt(srcs); dirty = true }, { immediate: true })
if (source.coachRetired) {
  watch(source.coachRetired, (set) => { renderer.coachRetired = set; dirty = true }, { immediate: true })
}
let offEvents: (() => void) | null = null

// ─── Loop ────────────────────────────────────────────────────────────────────
const loop = (now: number): void => {
  raf = requestAnimationFrame(loop)
  let dt = last ? (now - last) / 1000 : 1 / 60
  last = now
  if (dt > 0.1) dt = 0.1
  else if (dt < 0) dt = 0
  if (isGamePaused.value) {
    // Frozen: keep the last frame; only re-draw after a resize.
    if (dirty) {
      renderer.redraw()
      dirty = false
    }
    return
  }
  dirty = false
  coinBudget = Math.min(14, coinBudget + dt * 140)
  rectAge += dt
  if (rectAge > 0.5) refreshRect()
  const eng = source.engine.value
  if (aim.active && eng.state.phase !== 'aim') cancelAim(true)
  if (!source.holdSim.value) {
    const t0 = performance.now()
    eng.update(dt)
    simMs += (performance.now() - t0 - simMs) * 0.05
  }
  renderer.frame(dt)
}

// ─── Resize ──────────────────────────────────────────────────────────────────
let ro: ResizeObserver | null = null
const applySize = (w: number, h: number): void => {
  const c = canvasRef.value
  if (!c || w <= 0 || h <= 0) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const pw = Math.max(1, Math.round(w * dpr))
  const ph = Math.max(1, Math.round(h * dpr))
  if (c.width !== pw) c.width = pw
  if (c.height !== ph) c.height = ph
  renderer.resize(w, h, dpr)
  aim.minPull = Math.max(14, renderer.layout.cell * 0.32)
  refreshRect()
  dirty = true
}

// ─── Input (phase 'aim' only) ────────────────────────────────────────────────
const localPoint = (e: PointerEvent): { x: number; y: number } => {
  const r = canvasRect ?? refreshRect()
  return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: e.offsetX, y: e.offsetY }
}

const cancelAim = (notify: boolean): void => {
  const c = canvasRef.value
  if (c && aim.pointerId >= 0 && c.hasPointerCapture?.(aim.pointerId)) {
    try { c.releasePointerCapture(aim.pointerId) } catch { /* already released */ }
  }
  const was = aim.active
  const wrong = aim.wrongWay
  aim.cancel()
  renderer.setAim(false, aim.angle)
  if (wrong) emit('aimWrongWay', null)
  if (notify && was) emit('aimCancel')
}

const onDown = (e: PointerEvent): void => {
  if (aim.active || isGamePaused.value || source.holdSim.value) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const eng = source.engine.value
  if (eng.state.phase !== 'aim' || !eng.canFire()) return
  refreshRect()
  const p = localPoint(e)
  aim.begin(e.pointerId, p.x, p.y, e.timeStamp || performance.now())
  try { canvasRef.value?.setPointerCapture(e.pointerId) } catch { /* synthetic event */ }
  e.preventDefault()
  emit('aimStart')
}

const onMove = (e: PointerEvent): void => {
  if (!aim.active || e.pointerId !== aim.pointerId) return
  const p = localPoint(e)
  const wasWrong = aim.wrongWay
  if (aim.move(p.x, p.y, e.timeStamp || performance.now()) || aim.armed) renderer.setAim(aim.armed, aim.angle)
  if (aim.wrongWay) emit('aimWrongWay', { dx: aim.dragX, dy: aim.dragY })
  else if (wasWrong) emit('aimWrongWay', null)
  e.preventDefault()
}

const onUp = (e: PointerEvent): void => {
  if (!aim.active || e.pointerId !== aim.pointerId) return
  const p = localPoint(e)
  aim.move(p.x, p.y, e.timeStamp || performance.now())
  // Capture is released implicitly after pointerup; end the aim first so the
  // trailing lostpointercapture finds nothing active.
  const wasWrong = aim.wrongWay
  const angle = aim.end()
  renderer.setAim(false, aim.angle)
  if (wasWrong) emit('aimWrongWay', null)
  const eng = source.engine.value
  if (angle !== null && eng.state.phase === 'aim' && !source.holdSim.value && !isGamePaused.value && source.fire(angle)) {
    emit('fired', angle)
  } else {
    emit('aimCancel')
    if (angle === null) emit('misfire', aim.endedWrongWay ? 'wrongWay' : 'tap')
  }
}

const onCancel = (e: PointerEvent): void => {
  if (aim.active && e.pointerId === aim.pointerId) cancelAim(true)
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(() => {
  const c = canvasRef.value
  const root = rootRef.value
  if (!c || !root) return
  renderer.attach(c)
  bindEngine()
  offEvents = source.onEngineEvent((ev) => renderer.onEvent(ev))
  const r = root.getBoundingClientRect()
  applySize(r.width, r.height)
  ro = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect
    if (box) applySize(box.width, box.height)
  })
  ro.observe(root)
  reduceMq = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
  onReduceChange()
  reduceMq?.addEventListener?.('change', onReduceChange)
  raf = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  ro = null
  offEvents?.()
  offEvents = null
  reduceMq?.removeEventListener?.('change', onReduceChange)
  renderer.setEngine(null)
})

// ─── Exposed seam (CONTRACT §10) ─────────────────────────────────────────────
const launcherClientPoint = (): { x: number; y: number } | null => {
  const r = canvasRef.value?.getBoundingClientRect()
  const l = renderer.layout
  if (!r || l.cssW === 0) return null
  return { x: r.left + cellX(l, renderer.launcherX()), y: r.top + cellY(l, FLOOR_Y - 0.45) }
}
const cellToClient = (x: number, y: number): { x: number; y: number } | null => {
  const r = canvasRef.value?.getBoundingClientRect()
  const l = renderer.layout
  if (!r || l.cssW === 0) return null
  return { x: r.left + cellX(l, x), y: r.top + cellY(l, y) }
}
const boardClientRect = (): DOMRect | null => {
  const r = canvasRef.value?.getBoundingClientRect()
  const l = renderer.layout
  if (!r || l.cssW === 0) return null
  return new DOMRect(r.left + l.bx, r.top + l.by, l.bw, l.bh)
}
/** Dev / perf probe (not part of the contract): renderer + sim timings. */
const stats = (): RendererStats & { simMs: number } => ({ ...renderer.stats, simMs })

defineExpose({ launcherClientPoint, cellToClient, boardClientRect, stats })
</script>

<template lang="pug">
  div.barrage-board(ref="rootRef")
    canvas.barrage-board__canvas(
      ref="canvasRef"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onCancel"
      @lostpointercapture="onCancel"
      @contextmenu.prevent
    )
</template>

<style scoped lang="sass">
.barrage-board
  position: relative
  width: 100%
  height: 100%
  overflow: hidden
  touch-action: none
  user-select: none
  -webkit-user-select: none
  -webkit-touch-callout: none
  -webkit-tap-highlight-color: transparent

.barrage-board__canvas
  position: absolute
  inset: 0
  display: block
  width: 100%
  height: 100%
  touch-action: none
</style>
