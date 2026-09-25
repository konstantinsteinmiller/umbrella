// ─── The gameplay bracket (CrazyGames, Poki, Playgama, Yandex) ──────────────
//
// ONE module answers "is the player actually playing right now?" for every
// portal that wants to know, and it is the ONLY place that calls a portal's
// gameplayStart / gameplayStop. It used to be three owners — the splash fired
// CrazyGames' start, `useModalGameplayGate` stopped/started CG around menus,
// `useCrazyWaveGameplay` did the same around a lost run — and Yandex's
// `GameplayAPI.start/stop` wrappers were written and never called at all.
// Adding a portal is one arm in `installPortalGameplayBracket`.
//
// THE INPUTS
//
//     isGameLive && hasPlayerStarted && !isRunBreak && !isGameplayInterruptingModalOpen
//                                      (+ per portal: an ad on screen, tab hidden, portal pause)
//
//   • `isGameLive` flips once — from `FLogoProgress` on the splash-resolved
//     edge, the same edge that fires CrazyGames' `loadingStop`, Playgama's
//     `game_ready`, Poki's `gameLoadingFinished` and Yandex's
//     `LoadingAPI.ready()`. This game boots straight into a live board.
//   • `hasPlayerStarted` — THE FIRST INTERACTION AFTER LOADING. A live board
//     nobody has touched is not gameplay: Poki rejects a `gameplayStart()` no
//     player asked for, C2P is measured on the first one, and it takes a screen
//     wake lock. So the bracket opens on the player's first trusted gesture
//     anywhere in the game once it is live — the board (a tap fires the first
//     shot; "Tap to Shoot" invites it) or any button — and never on a timer. A
//     gesture on the loading screen does not count: that is not playing.
//     Capture-phase `window` listeners, `isTrusted` only, so a component that
//     stops propagation cannot hide it and a synthetic event is not a player.
//     No "press start" screen: that would be churn measured against C2P.
//   • `isRunBreak` — the run is over and not yet restarted (the breach /
//     daily-result screen), set by `useCrazyWaveGameplay` on the engine's
//     breach and cleared by the player's restart / continue / next shot. The
//     result modal closes the bracket too; this closes it on the breach itself.
//   • `isGameplayInterruptingModalOpen` — any menu (Achievements, Options, the
//     Battle Pass, the boss chest, …) minus the modals that opt out via
//     `acquireModalOpen({ firesGameplayLifecycle: false })` — today just the
//     welcome-back claim, which opens seconds into a returning player's boot and
//     would otherwise emit a pointless stop/start pair right behind the launch.
//
// BEFORE ADS. `useAds` flips `isAdShowing` SYNCHRONOUSLY before it calls the
// SDK, and every watcher here is `flush: 'sync'`, so the stop is emitted inside
// that same call stack — always ahead of the ad request (Poki documents
// stop → break → start). Nothing is emitted while the ad plays; the start comes
// once `isAdShowing` drops. CrazyGames' wrappers additionally stay silent for
// the whole request (`adInFlight` in `useCrazyGames` — CG QA: "no need to call
// gameplay events while ads are playing") and replay the last state asked for.
//
// NO DOUBLE CALLS. Each portal is driven by one watcher over one computed
// boolean, so its calls strictly alternate start / stop: a watcher only fires
// when the value CHANGES. Every SDK wrapper is idempotent on top of that, and
// Poki's collapses duplicates and defers a start landing inside the SDK's
// 50 ms bad-event window (`flush: 'sync'` does see intermediate values — a
// modal closing in the tick an ad opens — and 10 such strikes switch Poki's
// gameplay AND ad calls off for the session).
//
// WHAT THIS DELIBERATELY DOES **NOT** WATCH: `isGamePaused`. It ORs in the
// app-pause slot, which `useTutorialPauseGate` holds for the whole first-session
// tutorial — a bracket derived from it reported a brand-new player as "not
// playing" until the FTUE ended, i.e. never fired the event C2P is measured on
// (a headless run of the built bundle: `starts after tap: 0`).
//
// Per portal:
//   • CrazyGames — no tab-hidden / portal-pause input (CG has no pause API and
//     never asked for one). The BASIC launch gets the single start and no stops,
//     as before; the full release stops for menus, lost runs and ads.
//   • Poki, Playgama, Yandex — everything above, plus a hidden tab and the
//     portal's own pause.

import { computed, ref, watch } from 'vue'
import { isAdShowing, isVisibilityHidden, isPlatformPaused } from '@/use/useGamePause'
import { isGameplayInterruptingModalOpen } from '@/use/useModalState'
import { isCrazyGamesFullRelease } from '@/use/useMatch'
import { startGameplay as crazyGameplayStart, stopGameplay as crazyGameplayStop } from '@/use/useCrazyGames'
import { pokiGameplayStart, pokiGameplayStop, pokiNoteUserInteraction } from '@/utils/pokiPlugin'

/** True once the splash has resolved and the board is on screen. */
const isGameLive = ref(false)
/** The player's first trusted gesture since the game went live. */
const hasPlayerStarted = ref(false)
/** A lost run is on screen (breach / daily result) and not yet restarted. */
const isRunBreak = ref(false)

/** The player is in the game: live, touched, not between runs, no menu up. */
const isPlayerInGame = computed(() =>
  isGameLive.value
  && hasPlayerStarted.value
  && !isRunBreak.value
  && !isGameplayInterruptingModalOpen.value
)

/** Poki / Playgama / Yandex. See the header for what is deliberately absent. */
const isPortalGameplayLive = computed(() =>
  isPlayerInGame.value
  && !isAdShowing.value
  && !isVisibilityHidden.value
  && !isPlatformPaused.value
)

/** CrazyGames: the full release stops for menus, lost runs and ads; the basic
 *  launch reports the one start and nothing else. */
const isCrazyGameplayLive = computed(() =>
  isCrazyGamesFullRelease
    ? isPlayerInGame.value && !isAdShowing.value
    : isGameLive.value && hasPlayerStarted.value
)

let installed = false

// ─── The first interaction ──────────────────────────────────────────────────
const GESTURE_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'keydown'] as const
let gestureListening = false

const onGesture = (e: Event): void => {
  if (!e.isTrusted) return
  notePlayerInteraction()
}

const stopGestureWatch = (): void => {
  if (!gestureListening || typeof window === 'undefined') return
  gestureListening = false
  for (const type of GESTURE_EVENTS) window.removeEventListener(type, onGesture, true)
}

/** Armed once the bracket is installed AND the game is live — a gesture on the
 *  loading screen is not playing. */
const startGestureWatch = (): void => {
  if (!installed || !isGameLive.value || hasPlayerStarted.value) return
  if (gestureListening || typeof window === 'undefined') return
  gestureListening = true
  for (const type of GESTURE_EVENTS) {
    window.addEventListener(type, onGesture, { capture: true, passive: true })
  }
}

/**
 * The player has genuinely interacted with the live game — opens the bracket.
 *
 * The `window` listeners call this for real gestures; it is exported for a call
 * site that KNOWS it is on a player-driven path, and for the specs (a
 * `dispatchEvent` is never trusted). Calling it from a timer, a lifecycle hook
 * or an SDK callback would defeat the whole point. Before the game is live it
 * does nothing.
 */
export const notePlayerInteraction = (): void => {
  if (!isGameLive.value || hasPlayerStarted.value) return
  stopGestureWatch()
  // Poki's plugin keeps its own gesture gate (belt and braces); this IS a
  // player-driven path, so tell it before the bracket asks it to start.
  if (import.meta.env.VITE_APP_POKI === 'true') pokiNoteUserInteraction()
  hasPlayerStarted.value = true
}

/** Has the player touched the live game yet? */
export const hasPlayerInteracted = (): boolean => hasPlayerStarted.value

/**
 * Mark the game as live. Called from `FLogoProgress` on the splash-resolved
 * edge. Idempotent — this game never returns to a "not live" state.
 */
export const notifyPortalGameLive = (): void => {
  isGameLive.value = true
  startGestureWatch()
}

/** A lost run is on screen (true) / the player is back in a run (false).
 *  Driven by `useCrazyWaveGameplay`. */
export const setRunBreak = (held: boolean): void => {
  isRunBreak.value = held
}

// ─── Lazy portal arms (Playgama, Yandex) ───────────────────────────────────
//
// Both imports are DYNAMIC and behind an `import.meta.env` literal on purpose:
// each plugin statically imports its save strategy, so a static import here
// would drag that whole integration into every other build's entry graph (the
// descriptor-module trap). With the literal, Vite folds the condition and the
// `import()` — and its chunk — disappears from other builds. `vite.config.ts`
// keeps this file on the obfuscator's exclude list so the specifiers survive
// the `stringArray` transform where the branch is live.
//
// The module is loaded when the bracket is installed (main.ts has already
// imported it for the SDK init by then) and called SYNCHRONOUSLY once it is in
// hand, so the stop still lands ahead of the ad request. An edge that beats the
// load is chained in order behind it. Both wrappers are idempotent and no-op
// until their SDK reports active.
type GameplayPair = { start: () => void; stop: () => void }

const lazyArm = (load: () => Promise<GameplayPair>, tag: string) => {
  let pair: GameplayPair | null = null
  let loading: Promise<GameplayPair> | null = null
  const ensure = (): Promise<GameplayPair> => {
    if (!loading) {
      loading = load().then((p) => { pair = p; return p })
      loading.catch((e) => console.warn(`[portal-gameplay] ${tag} plugin load failed`, e))
    }
    return loading
  }
  return {
    preload: (): void => { void ensure().catch(() => {}) },
    sync: (live: boolean): void => {
      if (pair) { if (live) pair.start(); else pair.stop(); return }
      void ensure().then((p) => { if (live) p.start(); else p.stop() }).catch(() => {})
    }
  }
}

const playgamaArm = lazyArm(async () => {
  const m = await import('@/utils/playgamaPlugin')
  return { start: m.playgamaGameplayStart, stop: m.playgamaGameplayStop }
}, 'playgama')

const yandexArm = lazyArm(async () => {
  const m = await import('@/utils/yandexPlugin')
  return { start: m.yandexGameplayStart, stop: m.yandexGameplayStop }
}, 'yandex')

/**
 * Install the bracket watchers. Idempotent; call once at app boot (App.vue
 * setup). Inert on builds with no portal that wants the bracket — the env
 * literals let Rollup drop every arm, and `@/utils/pokiPlugin` is stub-aliased
 * on non-Poki builds anyway.
 */
export const installPortalGameplayBracket = (): void => {
  if (installed) return
  if (
    import.meta.env.VITE_APP_CRAZY_WEB !== 'true'
    && import.meta.env.VITE_APP_POKI !== 'true'
    && import.meta.env.VITE_APP_PLAYGAMA !== 'true'
    && import.meta.env.VITE_APP_YANDEX !== 'true'
  ) return
  installed = true
  startGestureWatch()

  if (import.meta.env.VITE_APP_CRAZY_WEB === 'true') {
    watch(isCrazyGameplayLive, (live) => {
      if (live) crazyGameplayStart()
      else crazyGameplayStop()
    }, { flush: 'sync' })
  }

  if (import.meta.env.VITE_APP_PLAYGAMA === 'true') playgamaArm.preload()
  if (import.meta.env.VITE_APP_YANDEX === 'true') yandexArm.preload()

  if (
    import.meta.env.VITE_APP_POKI === 'true'
    || import.meta.env.VITE_APP_PLAYGAMA === 'true'
    || import.meta.env.VITE_APP_YANDEX === 'true'
  ) {
    watch(isPortalGameplayLive, (live) => {
      if (import.meta.env.VITE_APP_POKI === 'true') {
        if (live) pokiGameplayStart()
        else pokiGameplayStop()
      }
      if (import.meta.env.VITE_APP_PLAYGAMA === 'true') playgamaArm.sync(live)
      if (import.meta.env.VITE_APP_YANDEX === 'true') yandexArm.sync(live)
    }, { flush: 'sync' })
  }
}

/** Test-only: current bracket inputs, and a reset for the module refs. */
export const __isPortalGameplayLive = (): boolean => isPortalGameplayLive.value
export const __isCrazyGameplayLive = (): boolean => isCrazyGameplayLive.value
export const __resetPortalGameplayBracketInstall = (): void => {
  installed = false
  stopGestureWatch()
  isGameLive.value = false
  hasPlayerStarted.value = false
  isRunBreak.value = false
}
