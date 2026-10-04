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

import { computed, ref, watch, type Ref } from 'vue'

/** True while a rewarded / midgame ad is currently on screen. Flipped
 *  by `useAds.showRewardedAd` / `useAds.showMidgameAd` set/reset. */
export const isAdShowing = ref(false)

/** True when `document.visibilityState === 'hidden'`. Seeded from the
 *  document on first import, kept current by the listener installed below.
 *
 *  Always `false` on the Playgama build — that one may not read the Page
 *  Visibility API at all (see `USES_PAGE_VISIBILITY` at the bottom of this
 *  file), and the Bridge's own visibility event drives `isPlatformPaused`
 *  instead. The seed is gated too: `document.visibilityState` is a read of
 *  the banned API, not just the listener. */
export const isVisibilityHidden = ref(
  import.meta.env.VITE_APP_PLAYGAMA !== 'true'
  && typeof document !== 'undefined'
  && document.visibilityState === 'hidden'
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

/**
 * Bind a portal SDK's published "pause me" ref onto the platform pause gate —
 * THE single place such a ref turns into a stopped loop + silent audio
 * (`isPlatformPaused` ORs into both `isGamePaused` and `isAudioPaused`).
 *
 * Plugins that use this (GameMonetize) never call `pauseGame()` /
 * `resumeGame()` themselves; they raise and lower their ref, and lower it on
 * every cycle that ends on a timer. The ref is a pure signal, so muting here is
 * never a write into the player's volume settings.
 *
 * `flush: 'sync'` for the same reason as the audio fanout below: an ad overlay
 * opens in the same call stack as the SDK event, and a deferred flush would
 * leave a tick of sound and simulation under it. Returns a stop function.
 */
export const installPlatformPauseSource = (source: Ref<boolean>): (() => void) => {
  if (source.value) pauseGame()
  return watch(source, (paused) => {
    if (paused) pauseGame()
    else resumeGame()
  }, { flush: 'sync' })
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

// ─── Suspend fanout (save flushes) ─────────────────────────────────────────
//
// Rising edge of "the player is no longer looking at a running game", from
// whichever source THIS build is allowed to use. Everything that needs to get
// state to disk before the process can be evicted subscribes here instead of
// registering its own `visibilitychange` / `pagehide` listener — see
// `USES_PAGE_VISIBILITY` below for why that matters.
//
// `isPlatformPaused` is in the expression on purpose: on a Playgama build it
// is the ONLY signal that arrives (fed by the Bridge's `PAUSE_STATE_CHANGED`,
// which on Playables is fed by YouTube's own `onPause` — the event that exists
// precisely because "the game has a short window to save any state before it
// is evicted"). On every other build it costs one extra flush per portal
// pause, which is exactly when you want one.

type SuspendSubscriber = () => void
const suspendSubscribers = new Set<SuspendSubscriber>()

/** Subscribe to the "game just went away" edge. Returns an unsubscribe fn. */
export const onGameSuspended = (sub: SuspendSubscriber): (() => void) => {
  suspendSubscribers.add(sub)
  return (): void => {
    suspendSubscribers.delete(sub)
  }
}

const isSuspended = computed(() => isVisibilityHidden.value || isPlatformPaused.value)

watch(isSuspended, (suspended) => {
  if (!suspended) return
  for (const sub of suspendSubscribers) {
    try { sub() }
    catch (e) { console.warn('[pause] suspend subscriber threw', e) }
  }
})

// ─── Visibility listener ───────────────────────────────────────────────────
//
// **The Page Visibility API is BANNED on the Playgama build**, and this is the
// only place in the codebase that may touch it.
//
// `build:playgama` produces the YouTube Playables submission as well —
// Playgama is an official Playables partner and distributes the one archive —
// and Playables states: "Game MUST NOT use the web Page Visibility API or
// similar web APIs and MUST only use Playables SDK `onPause` and `onResume`."
// `pagehide` counts as "similar", so it is gated on this flag too wherever it
// appears.
//
// Nothing is lost on that build. The Playgama Bridge emits
// `VISIBILITY_STATE_CHANGED` for a tab hide and `PAUSE_STATE_CHANGED` for
// overlays and ads, and `playgamaPlugin` routes BOTH into `isPlatformPaused`
// — a strictly better signal than the raw DOM event, since it also fires for
// portal chrome this document never sees.
export const USES_PAGE_VISIBILITY = import.meta.env.VITE_APP_PLAYGAMA !== 'true'

if (USES_PAGE_VISIBILITY && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    isVisibilityHidden.value = document.visibilityState === 'hidden'
  })
}
