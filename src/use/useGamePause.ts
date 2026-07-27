// ─── Unified pause gate ────────────────────────────────────────────────────
//
// One module, four flags, TWO computed gates. Every reason the game has to
// halt (tab hidden, platform SDK pause callback fired, an ad is on-screen,
// an app-side modal asked for a pause) ORs into `isGamePaused`; the renderer
// and the sim loops read it, and the SDK's pause/resume callbacks just toggle
// their flag without knowing about the rest.
//
// **Two gates, not one — `isGamePaused` (sim) vs `isAudioPaused` (sound).**
// Freezing the simulation and silencing the speakers are different products:
//
//   • An AD, a hidden tab, or a platform pause must do BOTH — nothing may be
//     audible under an ad (portal review rejection #1) and nothing may
//     advance while the player can't see the screen.
//   • An in-game MODAL (Achievements, Battle Pass, Unit Codex, Options, …)
//     must freeze the sim — CrazyGames' `gameplayStop()` is only truthful if
//     the game really stopped — but the background music should keep playing,
//     the way it does in every portal game's menus. Muting there also froze
//     the modal-open SFX cue mid-buffer, which then replayed as a clipped
//     tail when the modal closed.
//
// So the app/modal source ORs into `isGamePaused` only, and `isAudioPaused`
// deliberately omits it. `useGamePauseAudio` subscribes to the audio gate;
// `useBattle`'s RAF driver, `usePrismGame`'s engine tick and `FlyingChest`
// read the sim gate.
//
// **Zero-dependency module on purpose.** `useAds` imports `GamepixProvider`,
// which (transitively) imports this. If pause flags lived in `useAds`,
// `useGamepixPlugin` couldn't read them without a cycle. Keep this file
// importing only `vue`.
//
// **`flush: 'sync'` on the subscriber-fanout watcher is load-bearing.**
// `useAds.showRewardedAd` flips `isAdShowing.value = true` and then
// immediately awaits the SDK call, which opens the ad overlay
// synchronously before the await yields. With default `flush: 'pre'`
// the subscriber would fire on the next microtask tick, leaving a
// window where the game's bg-music + Web Audio sources play
// underneath the ad. GamePix's rewarded ad is the worst offender —
// it never fires the parent `sdk.pause` callback for rewarded
// placements, so `isAdShowing` is the ONLY signal that mutes audio
// for them.

import { computed, ref, watch } from 'vue'

/** True while a rewarded / midgame ad is currently on screen. Flipped
 *  by `useAds.showRewardedAd` / `useAds.showMidgameAd` set/reset. */
export const isAdShowing = ref(false)

/** True when `document.visibilityState === 'hidden'`. Seeded from the
 *  document on first import, kept current by the listener installed
 *  below. */
export const isVisibilityHidden = ref(
  typeof document !== 'undefined' && document.visibilityState === 'hidden'
)

/** True while the embedding portal (GamePix, etc.) has asked the game
 *  to pause via its SDK callback. Flipped by `pauseGame()` /
 *  `resumeGame()` from the platform plugin. */
export const isPlatformPaused = ref(false)

// Refcounted app-side pauses (in-game modals, tutorial overlays, etc.)
// compose: opening a modal during an ad-phase shouldn't stomp the ad
// pause when the modal closes. Plain boolean would lose that nesting.
let appPauseRefs = 0
const isAppPaused = ref(false)

/** Reserve an app-side pause. Returns a release function. Idempotent
 *  composition — N acquires + N releases. */
export const acquireAppPause = (): (() => void) => {
  appPauseRefs += 1
  isAppPaused.value = appPauseRefs > 0
  let released = false
  return (): void => {
    if (released) return
    released = true
    appPauseRefs = Math.max(0, appPauseRefs - 1)
    isAppPaused.value = appPauseRefs > 0
  }
}

/** Setter for platform-side pause (SDK pause callback). Idempotent. */
export const pauseGame = (): void => {
  if (!isPlatformPaused.value) isPlatformPaused.value = true
}
export const resumeGame = (): void => {
  if (isPlatformPaused.value) isPlatformPaused.value = false
}

/** SIM gate — OR of all four sources. Drives the renderer's early-return,
 *  the battle RAF driver, the merge-grid automation tick and the flying-chest
 *  spawner. A modal counts here: gameplay must really stop behind a menu. */
export const isGamePaused = computed(
  () => isAdShowing.value || isVisibilityHidden.value || isPlatformPaused.value || isAppPaused.value
)

/** AUDIO gate — the three sources that must SILENCE the game. Excludes the
 *  app/modal pause on purpose: menus freeze the sim but keep the music
 *  playing (see the file header). Subscribed by `useGamePauseAudio`. */
export const isAudioPaused = computed(
  () => isAdShowing.value || isVisibilityHidden.value || isPlatformPaused.value
)

/** The distinct reasons the game can be halted, in the same order they
 *  OR into `isGamePaused`. Logged by the audio orchestrator so the QA
 *  console shows *why* audio + the render loop stopped. */
export type PauseReason = 'ad' | 'tab-hidden' | 'platform' | 'modal'

/** Snapshot of every pause source currently asserting. Empty array =
 *  game is running. Used for structured pause/resume logging — see
 *  `useGamePauseAudio.ts`. */
export const getActivePauseReasons = (): PauseReason[] => {
  const reasons: PauseReason[] = []
  if (isAdShowing.value) reasons.push('ad')
  if (isVisibilityHidden.value) reasons.push('tab-hidden')
  if (isPlatformPaused.value) reasons.push('platform')
  if (isAppPaused.value) reasons.push('modal')
  return reasons
}

/** Same snapshot, restricted to the sources that mute audio — so the
 *  `[pause] 🔇` line can never claim `modal` as a mute reason. */
export const getActiveAudioPauseReasons = (): PauseReason[] =>
  getActivePauseReasons().filter((r) => r !== 'modal')

// ─── Subscriber fanout ─────────────────────────────────────────────────────

type PauseSubscriber = (paused: boolean) => void
const audioSubscribers = new Set<PauseSubscriber>()

/** Register a subscriber that fires on every `isAudioPaused` transition
 *  (ad / tab-hidden / platform — NOT modals). Returns an unsubscribe
 *  function. The watcher uses `flush: 'sync'` so the subscriber runs
 *  inside the same call stack as the flag flip — see file-level comment. */
export const onAudioPauseChange = (sub: PauseSubscriber): (() => void) => {
  audioSubscribers.add(sub)
  return (): void => {
    audioSubscribers.delete(sub)
  }
}

watch(isAudioPaused, (paused) => {
  for (const sub of audioSubscribers) {
    try { sub(paused) }
    catch (e) { console.warn('[pause] subscriber threw', e) }
  }
}, { flush: 'sync' })

// ─── Visibility listener ───────────────────────────────────────────────────

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    isVisibilityHidden.value = document.visibilityState === 'hidden'
  })
}
