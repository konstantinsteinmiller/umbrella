<script setup lang="ts">
/**
 * BarrageBoard — the canvas board seam (CONTRACT §10; RENDER builds, UI mounts).
 *
 *   • fills its parent and letterboxes the board (`render/layout.ts`), DPR ≤ 2,
 *     ResizeObserver-driven;
 *   • owns the rAF loop: `engine.update(dt)` unless `isGamePaused || holdSim`,
 *     always draws (a paused game keeps its last frame and skips the work);
 *   • dual-mode aim in phase 'aim' only (`render/aim.ts`: point at a finger
 *     above the launcher, slingshot from one below it; a tap on the unit fires
 *     the repeat shot — the run's last fired angle, straight up before the
 *     first; every release fires but a drag let go back on the unit), fires
 *     through `useBarrage().fire(angle)` itself and emits aimStart / aimCancel /
 *     fired / misfire('tap');
 *   • `beginAimFrom(e)`: the same aim from a finger that went down OUTSIDE the
 *     canvas (the tray's ball orbs), tracked through window listeners;
 *   • a TAP-fire (press + release without a drag) flashes the bounce path the
 *     drag preview shows for ~0.3 s as the ball leaves (run 5: tap players
 *     never saw the preview, which shows only while a finger is down);
 *   • a breach plays the death sequence (render/death.ts): the monsters past
 *     the line bump the unit and it tears apart — the engine waits in
 *     'breach', the board keeps drawing (the state layer holds the death
 *     screen meanwhile);
 *   • a Ball Damage purchase flares the unit and the next volley's numbers burn
 *     gold (the renderer spots `config.damageMult` rising; a cloud hydrate that
 *     raises the levels is adopted silently via `resyncPower`);
 *   • a touch on the flying chest opens it (`engine.tapChest`, any phase but
 *     'breach', never paused/held) and emits chestTapped — never a shot;
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
import { AimController, REPEAT_DEFAULT, TapWatch } from '@/barrage/render/aim'
import { cellX, cellY, toCellX, toCellY } from '@/barrage/render/layout'
import { FIELD_BANDS } from '@/barrage/render/backdrop'
import { backdropSrc } from '@/barrage/render/backdropArt'
import { sprite } from '@/barrage/render/sprites'
import { BOARD_SOURCE_KEY, type BoardSource } from '@/barrage/render/source'
import { isGamePaused } from '@/use/useGamePause'
import { saveDataVersion } from '@/use/useSaveStatus'
import { coachLesson, retiredTags } from '@/use/useCoach'
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
  /** Kept for compatibility, NEVER emitted: pointing at the monsters is a
   *  valid aim now (point-at mode), not a wrong way. */
  (e: 'aimWrongWay', drag: { dx: number; dy: number } | null): void
  /** A release fired nothing: only a drag that left the unit and was let go
   *  back on it does that now ('tap' — a plain tap on the unit FIRES the repeat
   *  shot). 'wrongWay' is kept for compatibility, never emitted. */
  (e: 'misfire', kind: 'wrongWay' | 'tap'): void
  /** A touch on the flying chest opened it (no shot is fired by it). */
  (e: 'chestTapped'): void
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
/** The repeat shot (a tap on the unit, a tap on a tray orb): the run's last
 *  fired angle — straight up until this engine's first shot. */
let repeatAngle = REPEAT_DEFAULT
/** A TAP (run 5: press + release without a drag, `render/aim.ts`) fires and
 *  flashes the bounce path it never showed long enough to see. */
const tap = new TapWatch()
/** The renderer's view of the aim: its preview, and whether a finger is down
 *  at all (the intent previews hide under one). */
const syncAim = (): void => {
  renderer.setAim(aim.armed, aim.angle, aim.active)
}
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
  repeatAngle = REPEAT_DEFAULT
  renderer.setRestAngle(repeatAngle)
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
// The resting aim line stands aside while the coach demonstrates a shot on
// the board — one line on screen at a time.
watch(coachLesson, (l) => {
  renderer.restHidden = !!l && (l.id === 'pull' || l.id === 'combo' || l.id === 'survive')
}, { immediate: true })
// A cloud hydrate can raise the upgrade levels (the higher level per track
// wins) on the live engine: that damage rise is not a purchase — no flare.
watch(saveDataVersion, () => renderer.resyncPower())
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
  if (aim.active) aim.placeLauncher(renderer.layout, source.engine.value.state.launcherX)
  refreshRect()
  dirty = true
}

// ─── Input (phase 'aim' only) ────────────────────────────────────────────────
const localPoint = (e: PointerEvent): { x: number; y: number } => {
  const r = canvasRect ?? refreshRect()
  return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: e.offsetX, y: e.offsetY }
}

/** The aim was begun OUTSIDE the canvas (`beginAimFrom`): its moves and its
 *  release arrive through window listeners (capture phase) — pointer capture
 *  across elements is flaky on touch — and the canvas handlers stand aside. */
let outside = false

const releaseCapture = (): void => {
  const c = canvasRef.value
  if (c && aim.pointerId >= 0 && c.hasPointerCapture?.(aim.pointerId)) {
    try { c.releasePointerCapture(aim.pointerId) } catch { /* already released */ }
  }
}

const cancelAim = (notify: boolean): void => {
  releaseCapture()
  detachOutside()
  const was = aim.active
  aim.cancel()
  syncAim()
  if (notify && was) emit('aimCancel')
}

/** Every blind first-timer tried to tap the flying chest: a touch on it opens
 *  it (the engine checks the hit), in any phase but a breach. Never a shot. */
const tryChestTap = (px: number, py: number): boolean => {
  const eng = source.engine.value
  if (!eng.state.chest || eng.state.phase === 'breach') return false
  const l = renderer.layout
  if (l.cssW === 0 || !eng.tapChest(toCellX(l, px), toCellY(l, py))) return false
  emit('chestTapped')
  return true
}

/** An aim may start: phase 'aim', a shot to fire, no finger already aiming,
 *  not paused / held. */
const canStartAim = (): boolean => {
  if (aim.active || isGamePaused.value || source.holdSim.value) return false
  const eng = source.engine.value
  return eng.state.phase === 'aim' && eng.canFire()
}

const aimStarted = (e: PointerEvent): void => {
  syncAim()
  e.preventDefault()
  emit('aimStart')
}

const onDown = (e: PointerEvent): void => {
  if (aim.active || isGamePaused.value || source.holdSim.value) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  refreshRect()
  const p = localPoint(e)
  if (tryChestTap(p.x, p.y)) {
    e.preventDefault()
    return
  }
  if (!canStartAim()) return
  // The preview is up from the press: a tap is a press + release and fires
  // at the tapped point — on the unit itself, the repeat shot.
  aim.placeLauncher(renderer.layout, source.engine.value.state.launcherX)
  aim.begin(e.pointerId, p.x, p.y, e.timeStamp || performance.now(), repeatAngle)
  tap.press(p.x, p.y, performance.now(), renderer.layout.cell)
  try { canvasRef.value?.setPointerCapture(e.pointerId) } catch { /* synthetic event */ }
  aimStarted(e)
}

const trackTo = (e: PointerEvent): void => {
  const p = localPoint(e)
  tap.move(p.x, p.y)
  aim.move(p.x, p.y, e.timeStamp || performance.now())
}

const release = (e: PointerEvent): void => {
  trackTo(e)
  detachOutside()
  // Capture is released implicitly after pointerup; end the aim first so the
  // trailing lostpointercapture finds nothing active.
  const angle = aim.end()
  syncAim()
  const tapped = tap.isTap(performance.now())
  const eng = source.engine.value
  if (angle !== null && eng.state.phase === 'aim' && !source.holdSim.value && !isGamePaused.value && source.fire(angle)) {
    // A tap never showed its preview long enough to see: flash it as the ball leaves.
    if (tapped) renderer.flashShot(angle)
    emit('fired', angle)
  } else {
    emit('aimCancel')
    // A drag let go back on the unit: the one release that fires nothing.
    if (angle === null) emit('misfire', 'tap')
  }
}

const onMove = (e: PointerEvent): void => {
  if (outside || !aim.active || e.pointerId !== aim.pointerId) return
  trackTo(e)
  syncAim()
  e.preventDefault()
}

const onUp = (e: PointerEvent): void => {
  if (outside || !aim.active || e.pointerId !== aim.pointerId) return
  release(e)
}

/** pointercancel / lost capture: the system took the touch — no shot, no misfire. */
const onCancel = (e: PointerEvent): void => {
  if (!outside && aim.active && e.pointerId === aim.pointerId) cancelAim(true)
}

// Window-level tracking for an aim begun outside the canvas.
const onWinMove = (e: PointerEvent): void => {
  if (!outside || !aim.active || e.pointerId !== aim.pointerId) return
  trackTo(e)
  syncAim()
}
const onWinUp = (e: PointerEvent): void => {
  if (!outside || !aim.active || e.pointerId !== aim.pointerId) return
  release(e)
}
const onWinCancel = (e: PointerEvent): void => {
  if (outside && aim.active && e.pointerId === aim.pointerId) cancelAim(true)
}
const attachOutside = (): void => {
  if (outside) return
  outside = true
  window.addEventListener('pointermove', onWinMove, true)
  window.addEventListener('pointerup', onWinUp, true)
  window.addEventListener('pointercancel', onWinCancel, true)
}
const detachOutside = (): void => {
  if (!outside) return
  outside = false
  window.removeEventListener('pointermove', onWinMove, true)
  window.removeEventListener('pointerup', onWinUp, true)
  window.removeEventListener('pointercancel', onWinCancel, true)
}

/**
 * CONTRACT §10 (run 3): start an aim from a finger that went down OUTSIDE the
 * canvas — the tray's ball orbs in the bottom panel, where dragging up is the
 * slingshot motion. Same gates as a press on the board. It behaves like a
 * press on the unit: the repeat shot until the finger has moved ~0.3 cell,
 * then the ordinary dual-mode aim; a release before moving fires the repeat
 * shot. Emits aimStart / fired / aimCancel (+ misfire) like a board press.
 * Returns false when no aim started.
 */
const beginAimFrom = (e: PointerEvent): boolean => {
  if (!canvasRef.value || !canStartAim()) return false
  if (e.pointerType === 'mouse' && e.button !== 0) return false
  if (renderer.layout.cssW === 0) return false
  refreshRect()
  const p = localPoint(e)
  aim.placeLauncher(renderer.layout, source.engine.value.state.launcherX)
  aim.beginFrom(e.pointerId, p.x, p.y, e.timeStamp || performance.now(), repeatAngle)
  tap.press(p.x, p.y, performance.now(), renderer.layout.cell)
  attachOutside()
  try { canvasRef.value.setPointerCapture(e.pointerId) } catch { /* not an active pointer: the window listeners carry it */ }
  aimStarted(e)
  return true
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(() => {
  const c = canvasRef.value
  const root = rootRef.value
  if (!c || !root) return
  renderer.attach(c)
  bindEngine()
  offEvents = source.onEngineEvent((ev) => {
    // The repeat shot follows every shot of this run, however it was fired.
    if (ev.type === 'fire') {
      repeatAngle = ev.angle
      renderer.setRestAngle(ev.angle)
    }
    renderer.onEvent(ev)
  })
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
  detachOutside()
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
/** The death sequence's culprit in client px (centre, radius) — DeathOverlay
 *  keeps a clear pool round it. Null: no death playing. */
const deathFocusClient = (): { x: number; y: number; r: number } | null => {
  const f = renderer.deathFocus
  const r = canvasRef.value?.getBoundingClientRect()
  const l = renderer.layout
  if (!f || !r || l.cssW === 0) return null
  return { x: r.left + cellX(l, f.x), y: r.top + cellY(l, f.y), r: f.r * l.cell }
}
/** Dev / perf probe (not part of the contract): renderer + sim timings. */
const stats = (): RendererStats & { simMs: number } => ({ ...renderer.stats, simMs })

defineExpose({ launcherClientPoint, cellToClient, boardClientRect, beginAimFrom, deathFocusClient, stats })
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
