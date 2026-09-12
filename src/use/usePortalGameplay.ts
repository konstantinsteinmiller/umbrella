// ─── Portal gameplay bracket (Poki + Playgama) ──────────────────────────────
//
// ONE watcher answers "is the player actually playing right now?" for every
// portal that wants to know. It was Poki-only; the Playgama arm was added when
// `playgamaGameplayStart` / `playgamaGameplayStop` turned out to be exported
// and never called from anywhere. Adding a portal is one arm in the watcher
// below, not an edit in the arena view and six modal components.
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
const isPortalGameplayLive = computed(() =>
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
export const notifyPortalGameLive = (): void => {
  isGameLive.value = true
}

// ─── Playgama fan-out ──────────────────────────────────────────────────────
//
// The Bridge takes the same bracket as `gameplay_started` / `gameplay_stopped`
// platform messages. Wiring them here is what finally CALLS the two wrappers —
// they were written, exported, and then never invoked from anywhere, so the
// portal was told the player loaded the game and never that they were playing
// it. That costs placement quality on playgama.com, and on a Playgama Build
// distribution it is the ONLY route those signals have to the downstream
// portal's own hooks: our CrazyGames / Poki plugins are compiled out of this
// bundle, so the Bridge's adapter is the one thing left that can forward them.
//
// The import is DYNAMIC and behind an `import.meta.env` literal on purpose.
// `@/utils/playgamaPlugin` statically imports `PlaygamaStrategy`, so a static
// import here would drag the whole Playgama integration into every other
// build's entry graph (the descriptor-module trap, and the one that had
// chaos-arena preloading a 277 KB plugin chunk on the wrong portal). With the
// literal, Vite folds the condition at build time and the `import()` — and its
// chunk — disappear from non-Playgama builds entirely. `vite.config.ts` also
// keeps this file on the obfuscator's exclude list so the specifier survives
// the `stringArray` transform on the build where the branch is live.
type PlaygamaGameplay = {
  playgamaGameplayStart: () => void
  playgamaGameplayStop: () => void
}
let playgamaGameplayPromise: Promise<PlaygamaGameplay> | null = null

const syncPlaygamaGameplay = (live: boolean): void => {
  if (import.meta.env.VITE_APP_PLAYGAMA !== 'true') return
  if (!playgamaGameplayPromise) {
    playgamaGameplayPromise = import('@/utils/playgamaPlugin')
  }
  void playgamaGameplayPromise.then((m) => {
    // Both wrappers are idempotent and no-op until the SDK reports active, so
    // an edge that lands before `initialize()` resolves is simply dropped —
    // the next one (there is always a next one: the first ad, the first modal)
    // re-states the truth.
    if (live) m.playgamaGameplayStart()
    else m.playgamaGameplayStop()
  }).catch((e) => console.warn('[portal-gameplay] playgama plugin load failed', e))
}

/**
 * Install the bracket watcher. Idempotent; call once at app boot (App.vue
 * setup). Inert on builds with no portal that wants the bracket — the env
 * literals let Rollup drop the watcher and both fan-out arms entirely, and
 * `@/utils/pokiPlugin` is stub-aliased on non-Poki builds anyway.
 */
export const installPortalGameplayBracket = (): void => {
  if (installed) return
  if (
    import.meta.env.VITE_APP_POKI !== 'true'
    && import.meta.env.VITE_APP_PLAYGAMA !== 'true'
  ) return
  installed = true
  watch(isPortalGameplayLive, (live) => {
    if (import.meta.env.VITE_APP_POKI === 'true') {
      if (live) pokiGameplayStart()
      else pokiGameplayStop()
    }
    syncPlaygamaGameplay(live)
  }, { flush: 'sync' })
}

/** Test-only: current bracket input, and a reset for the module refs. */
export const __isPortalGameplayLive = (): boolean => isPortalGameplayLive.value
export const __resetPortalGameplayBracketInstall = (): void => {
  installed = false
  isGameLive.value = false
}
