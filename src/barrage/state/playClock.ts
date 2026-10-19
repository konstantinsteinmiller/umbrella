/**
 * Umbrella — the play clock: seconds of ACTIVE gameplay.
 *
 * Two clocks share one tick:
 *   • `sessionPlaySeconds` — this page session only, never persisted. It drives
 *     the drop-off funnel's `played_180s` / `played_300s` / `played_480s`.
 *   • `lifetimePlaySeconds` (progress.ts) — every session, persisted with the
 *     stats and hydrated forward-only. It is half of the rewarded gate
 *     (`rewardedOffersUnlocked`: first boss kill AND 3:00 of play).
 *
 * WHAT COUNTS is the gameplay bracket's own definition (`usePortalGameplay`):
 *
 *     in a run  AND  no menu open  AND  no ad on screen  AND  tab visible  AND  no portal pause
 *
 * "In a run" comes from the run owner (`useBarrage`): the player has fired
 * this page session and no breach, boss chest, daily result or restart holds
 * the board. Two differences from the bracket, both on purpose:
 *   • It opens on the first SHOT, not on the first gesture. The rewarded gate
 *     needs the clock on every build, and the first-gesture signal exists only
 *     on builds that have a portal bracket. The first shot is the first act of
 *     play on all of them; the difference is one aim drag.
 *   • It reads `isAnyModalOpen` (every blocking modal) rather than the
 *     bracket's lifecycle subset. The two are equal today, since no modal opts
 *     out, and a modal that opts out still freezes the sim, which is not play.
 * Like the bracket, it ignores the tutorial's app-pause: the tutorial is play.
 *
 * TICKING. A 1 s interval runs only while active. Each tick folds in the real
 * time elapsed, capped at PLAY_CLOCK_MAX_STEP_MS so a stalled timer or a clock
 * jump cannot add minutes, and carries the sub-second remainder so fragments
 * from separate stretches still add up. The edge out of play is folded in
 * synchronously, in the same call stack as the flag flip, so the seconds up to
 * an ad or a page hide are counted before anything flushes.
 *
 * PERSISTENCE is throttled, never per second: every PLAY_CLOCK_PERSIST_EVERY_S
 * of play while active, on every edge out of play, and at every turn boundary
 * (useBarrage's `flushTurn` → `persistStats`). The blob write itself is
 * debounced again by `useEpicState`.
 */
import { computed, effectScope, ref, watch, type EffectScope, type Ref } from 'vue'
import { isAdShowing, isPlatformPaused, isVisibilityHidden } from '@/use/useGamePause'
import { isAnyModalOpen } from '@/use/useModalState'
import { addPlaySeconds, lifetimePlaySeconds, persistStats } from './progress'

/** How often the clock folds elapsed time in while play is active. */
export const PLAY_CLOCK_TICK_MS = 1000
/** Most real time one step may add (a stalled timer, a system clock jump). */
export const PLAY_CLOCK_MAX_STEP_MS = 5000
/** Lifetime seconds of play between two throttled persists while active. */
export const PLAY_CLOCK_PERSIST_EVERY_S = 15

const session = ref(0)
const running = ref(false)

/** Whole seconds of active play in this page session. Never persisted. */
export const sessionPlaySeconds: Readonly<Ref<number>> = session
/** True while the clock is counting (diagnostics and specs). */
export const isPlayClockRunning: Readonly<Ref<boolean>> = running

let timer: ReturnType<typeof setInterval> | null = null
let lastAt = 0
let carryMs = 0
/** Lifetime seconds at the clock's last persist (-1: never). */
let persistedAt = -1
let scope: EffectScope | null = null

/** `Date.now()`, not `performance.now()`: the step cap makes a clock jump
 *  harmless, and it is the clock the rest of the state layer's specs drive. */
const nowMs = (): number => Date.now()

/** Fold the real time since the last step into both clocks. */
const step = (): void => {
  const t = nowMs()
  const dt = Math.min(PLAY_CLOCK_MAX_STEP_MS, Math.max(0, t - lastAt))
  lastAt = t
  carryMs += dt
  const whole = Math.floor(carryMs / 1000)
  if (whole <= 0) return
  carryMs -= whole * 1000
  session.value += whole
  addPlaySeconds(whole)
}

const persist = (force: boolean): void => {
  const s = lifetimePlaySeconds.value
  if (s === persistedAt) return
  if (!force && persistedAt >= 0 && s - persistedAt < PLAY_CLOCK_PERSIST_EVERY_S) return
  persistedAt = s
  persistStats()
}

const onTick = (): void => {
  step()
  persist(false)
}

const start = (): void => {
  if (timer !== null) return
  lastAt = nowMs()
  timer = setInterval(onTick, PLAY_CLOCK_TICK_MS)
  running.value = true
}

const stop = (): void => {
  if (timer === null) return
  clearInterval(timer)
  timer = null
  running.value = false
  step()
  persist(true)
}

/**
 * Start the clock. Idempotent: the first call wins.
 *
 * `inRun` is the run owner's half of "active": the player has fired this page
 * session and nothing holds the board. It is read inside a computed, so it must
 * read reactive state. The clock adds the menu, ad, hidden-tab and portal-pause
 * halves itself.
 */
export const installPlayClock = (inRun: () => boolean): void => {
  if (scope) return
  persistedAt = lifetimePlaySeconds.value
  // Detached: the clock outlives whichever component first built the run owner.
  scope = effectScope(true)
  scope.run(() => {
    const active = computed(() =>
      inRun()
      && !isAnyModalOpen.value
      && !isAdShowing.value
      && !isVisibilityHidden.value
      && !isPlatformPaused.value)
    watch(active, (on) => { if (on) start(); else stop() }, { flush: 'sync', immediate: true })
  })
}

/** Test-only: stop the clock and forget this page session. A spec that boots
 *  the run owner must call it in `afterEach`. Otherwise the interval outlives the
 *  spec, and a later throttled persist writes that spec's blob over the next
 *  spec's seed. */
export const __resetPlayClockForTests = (): void => {
  scope?.stop()
  scope = null
  if (timer !== null) clearInterval(timer)
  timer = null
  running.value = false
  lastAt = 0
  carryMs = 0
  persistedAt = -1
  session.value = 0
}
