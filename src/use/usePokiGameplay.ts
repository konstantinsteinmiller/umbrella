// ─── Poki gameplay bracket ──────────────────────────────────────────────────
//
// Poki's `gameplayStart()` / `gameplayStop()` pair is what the portal treats as
// "the player is actually playing". It drives conversion-to-play (the Web Fit
// Test's 65 % gate is measured on the FIRST `gameplayStart()`), it decides
// whether a `commercialBreak()` is reported as a preroll or a midroll, and it
// takes/releases a screen wake lock.
//
// ONE watcher owns it, over ONE expression:
//
//     isGameLive && !isAdShowing && !isVisibilityHidden && !isPlatformPaused
//                && !isGameplayInterruptingModalOpen
//
//   • `isGameLive` flips once — from `FLogoProgress` on the splash-resolved
//     edge, the same edge that fires CrazyGames' `loadingStop`, Playgama's
//     `game_ready`, GamePix's `gameLoaded` and Yandex's `LoadingAPI.ready()`.
//     This game boots straight into a live arena, so that edge IS "the
//     simulation is running".
//   • The three pause refs come from `useGamePause`: an ad is on screen, the
//     tab is hidden, or the portal asked us to pause.
//   • `isGameplayInterruptingModalOpen` is the same NARROW modal signal
//     `useModalGameplayGate` already feeds to CrazyGames — it omits modals that
//     opt out via `acquireModalOpen({ firesGameplayLifecycle: false })`, today
//     just the welcome-back claim, which opens seconds into a returning
//     player's boot and would otherwise emit a pointless stop/start pair right
//     behind the launch one.
//
// WHAT THIS DELIBERATELY DOES **NOT** WATCH: `isGamePaused`.
//
// That computed looks like the obvious source — it is the single flag the whole
// sim reads — but it also ORs in the app-pause slot, and `useTutorialPauseGate`
// holds one for the ENTIRE first-session tutorial (spawn → merge → deploy).
// Deriving the bracket from it therefore reports a first-time player as "not
// playing" from boot until they complete the FTUE, which is wrong twice over:
// that player is tapping, merging and dragging the whole time (the sim is held
// so wave 1 cannot overrun them mid-lesson, not because play stopped), and C2P
// is measured on the FIRST `gameplayStart()` — so the metric that decides
// whether the game clears the Web Fit Test would never fire for exactly the
// players it is meant to count. `useTutorialPauseGate`'s own header reasons the
// same way for CrazyGames, and this is the Poki half of that rule.
//
// Measured, not theorised: a headless run of the built bundle reported
// `starts after tap: 0` while the bracket read `isGamePaused`, because the
// tutorial hold was up the whole time.
//
// Deriving the bracket from these signals rather than sprinkling start/stop
// calls through the scene buys three things for free:
//
//   1. **Ad ordering.** `useAds` flips `isAdShowing` SYNCHRONOUSLY before it
//      calls the SDK, so with `flush: 'sync'` here the `gameplayStop()` is
//      emitted inside that same call stack — always ahead of the ad request,
//      which is the ordering Poki documents (stop → break → start).
//   2. **Menus.** `useModalState` already tracks the interrupting-modal count,
//      so opening Achievements / Options / the Battle Pass closes the bracket
//      with no Poki-shaped condition added to `useModalGameplayGate`.
//   3. **Truthfulness.** Every input is a signal the rest of the game already
//      acts on, so the bracket cannot drift away from what is on screen.
//
// What is deliberately NOT bracketed either: the per-wave break.
// `useCrazyWaveGameplay` stops/starts CG gameplay on every `waveCleared` →
// `waveStart`, because CG certification asks for it. On Poki that would
// fragment a continuous idle/merge session into dozens of short brackets — the
// player is still merging and spawning during the break, so "gameplay stopped"
// would simply be false, and each pair is another chance to trip the SDK's
// bad-event counter.
//
// `flush: 'sync'` means intermediate values are seen: a modal closing in the
// same tick an ad opens can produce a stop→start pair microseconds apart. That
// is exactly what the SDK's bad-event counter penalises (10 strikes and
// gameplayStart / gameplayStop / commercialBreak all silently become no-ops),
// and exactly what the guard inside `pokiPlugin` exists to absorb — duplicate
// consecutive events are collapsed and a start landing inside the 120 ms window
// is deferred, or cancelled outright if a stop beats it. Feed it the honest
// edge; let the plugin decide what Poki is allowed to hear.
//
// The FIRST start is additionally held by the plugin's trusted-gesture gate
// until the player actually touches the viewport — Poki rejects a
// `gameplayStart()` that no player asked for, and a game with no menu reports
// one during mount otherwise. See `pokiPlugin.ts`, "The user-gesture gate".

import { computed, ref, watch } from 'vue'
import { isAdShowing, isVisibilityHidden, isPlatformPaused } from '@/use/useGamePause'
import { isGameplayInterruptingModalOpen } from '@/use/useModalState'
import { pokiGameplayStart, pokiGameplayStop } from '@/utils/pokiPlugin'

/** True once the splash has resolved and the arena is on screen. */
const isGameLive = ref(false)

/** The bracket's source of truth. See the header for why the tutorial's
 *  app-pause is deliberately absent from this list. */
const isPokiGameplayLive = computed(() =>
  isGameLive.value
  && !isAdShowing.value
  && !isVisibilityHidden.value
  && !isPlatformPaused.value
  && !isGameplayInterruptingModalOpen.value
)

let installed = false

/**
 * Mark the game as live. Called from `FLogoProgress` on the splash-resolved
 * edge, alongside the other platforms' `game_ready` signals. Idempotent — this
 * game never returns to a "not live" state within a session.
 */
export const notifyPokiGameLive = (): void => {
  isGameLive.value = true
}

/**
 * Install the bracket watcher. Idempotent; call once at app boot (App.vue
 * setup). Inert on every non-Poki build — the env literal lets Rollup drop the
 * watcher entirely, and `@/utils/pokiPlugin` is stub-aliased there anyway.
 */
export const installPokiGameplayBracket = (): void => {
  if (installed) return
  if (import.meta.env.VITE_APP_POKI !== 'true') return
  installed = true
  watch(isPokiGameplayLive, (live) => {
    if (live) pokiGameplayStart()
    else pokiGameplayStop()
  }, { flush: 'sync' })
}

/** Test-only: current bracket input, and a reset for the module refs. */
export const __isPokiGameplayLive = (): boolean => isPokiGameplayLive.value
export const __resetPokiGameplayBracketInstall = (): void => {
  installed = false
  isGameLive.value = false
}
