// ─── Playgama Bridge plugin (SDK v2) ───────────────────────────────────────
//
// Lazy-loaded module that owns everything the game says to — and hears from —
// the Playgama Bridge. `main.ts` only imports it when `isPlaygama` is true, so
// non-Playgama builds never touch the SDK glue.
//
// "Playgama Bridge" is the unified abstraction Playgama ships across 28+
// portals (production Playgama, Yandex, CrazyGames, Poki, GameSnacks,
// YouTube Playables, …). On the production portal `bridge.platform.id ===
// 'playgama'`; on localhost with no parent-frame handshake the Bridge falls
// back to MOCK.
//
// **DO NOT** set `forciblySetPlatformId`. The Bridge has built-in detectors
// per parent-frame protocol; forcing an id pins it to ONE protocol and breaks
// every other context (notably the developer QA tool, which speaks a different
// protocol than production).
//
// ─── v1 → v2 migration (2026-09) ───────────────────────────────────────────
//
// Playgama QA now rejects v1 submissions outright ("please update Bridge to
// v2"), and v1 could never have shipped to YouTube Playables at all. Four
// things changed:
//
//   1. SOURCE. v1 came from `<script src="https://bridge.playgama.com/…">`;
//      v2 comes from the `@playgama/bridge` npm package via
//      `playgamaBridgeLoader.ts`. The CDN build is a webpack bundle with
//      `publicPath = bridge.playgama.com/v1/stable/` — it fetches per-platform
//      adapter chunks at runtime and posts to `api.playgama.com`. Playables
//      forbids external calls "including built-in analytics", and the
//      `build:playgama` archive IS the Playables submission (Playgama is an
//      official partner and distributes the one ZIP). The npm build is a
//      single self-contained file with no chunk loading.
//
//   2. EVENTS. v1 subscribed on the sub-modules (`bridge.platform.on(…)`,
//      `bridge.advertisement.on(…)`) and `on()` returned an unsubscribe
//      function. In v2 every module forwards to the root and **`on()` returns
//      void** — unsubscribe with `off(name, sameCallbackReference)`. Keeping
//      the old shape leaks one listener per ad shown, and the leaked
//      listeners resolve LATER ads early.
//
//   3. STORAGE. The storage-type argument is gone: `get/set/delete` take keys
//      and values only and the Bridge routes cloud-vs-local itself. See
//      `PlaygamaStrategy`.
//
//   4. `bridge.game` IS GONE. `setLoadingProgress` moved to
//      `bridge.setGameLoadingProgress(percent)` on the root object.
//
// ─── Page Visibility is BANNED on this build ───────────────────────────────
//
// Playables: "Game MUST NOT use the web Page Visibility API or similar web
// APIs and MUST only use Playables SDK `onPause` and `onResume`." The Bridge's
// `PAUSE_STATE_CHANGED` (fed by Playables' own `onPause`) and
// `VISIBILITY_STATE_CHANGED` are the ONLY pause sources on a Playgama build —
// which is why `useGamePause` skips its `visibilitychange` listener here and
// `main.ts` hangs the save flush off the platform-pause edge instead. Nothing
// in this file may read `document.hidden` / `document.visibilityState`.

import { ref } from 'vue'
import { isPlaygama } from '@/use/useUser'
import { isDebug } from '@/use/useMatch'
import { LANGUAGES } from '@/utils/enums'
import { pauseGame, resumeGame } from '@/use/useGamePause'
import { setPlatformAudioMuted } from '@/use/useGamePauseAudio'
import type { SaveStrategy } from '@/utils/save/types'
// Static import — the obfuscator's `stringArray` mangles dynamic-import
// literals, which on the Playgama QA Tool surfaced as
// `Failed to resolve module specifier '@/utils/save/PlaygamaStrategy'` at
// runtime. Static-importing inlines the (small) strategy class into this
// plugin's already-lazy-loaded chunk; non-Playgama builds don't reach this
// module at all, so the bundle cost stays zero.
import { PlaygamaStrategy } from '@/utils/save/PlaygamaStrategy'
import { loadPlaygamaBridge, type Bridge } from '@/utils/playgamaBridgeLoader'

/**
 * Options handed to `bridge.initialize()`.
 *
 * v2 resolves its config as `ConfigLoader.load(configFilePath, these)` — it
 * fetches `./playgama-bridge-config.json` and, **only if that fetch or parse
 * fails**, falls back to this object. So the emitted file (see the
 * `emit-playgama-bridge-config` plugin in `vite.config.ts`) is the primary
 * source and MUST carry the same values; this is the safety net for QA
 * wrappers / CDNs that don't serve it.
 *
 * `storage.allowAnonymousCloudSave` survived the v2 upgrade and is still
 * load-bearing — verified in the shipped 2.1.0 bundle, which gates cloud
 * storage on:
 *
 *   canUseCloud = isCloudSaveSupported
 *                 && (options.storage?.allowAnonymousCloudSave === true
 *                     || player.isAuthorized)
 *
 * Without it, every guest player — including the QA reviewer's first run —
 * silently degrades to local storage and no progress reaches the remote.
 */
const BRIDGE_OPTIONS = {
  storage: { allowAnonymousCloudSave: true },
  advertisement: { minimumDelayBetweenInterstitial: 120 }
} as const

// Production handshake on cold-start can take 5-7 s; keep generous headroom so
// a slow CDN / mobile cold-cache doesn't latch the "ads blocked" rail for the
// rest of the session.
//
// The race is NOT belt-and-braces on Playables: the Bridge's `youtube` adapter
// waits for `window.ytgame` with a 100 ms poll that has NO timeout, so a build
// that reaches Playables without YouTube's own SDK tag would hang inside
// `initialize()` forever and the splash would never clear. `index.html` keeps
// that tag on this build; this is what stops a missing one from being fatal.
const INIT_TIMEOUT_MS = 15_000

// ─── v2 event / message names ──────────────────────────────────────────────
// Hard-coded rather than read off `bridge.EVENT_NAME` so the values are
// greppable in a QA console and usable before `initialize()` resolves. They
// match `@playgama/bridge` 2.1.0's exported constants exactly; the package
// also ships them at `@playgama/bridge/constants`, but importing that
// sub-path pulls a second module into the graph for nine string literals.
const EVENT = {
  PAUSE_STATE_CHANGED: 'pause_state_changed',
  AUDIO_STATE_CHANGED: 'audio_state_changed',
  VISIBILITY_STATE_CHANGED: 'visibility_state_changed',
  INTERSTITIAL_STATE_CHANGED: 'interstitial_state_changed',
  REWARDED_STATE_CHANGED: 'rewarded_state_changed'
} as const

const MESSAGE = {
  GAME_READY: 'game_ready',
  IN_GAME_LOADING_STARTED: 'in_game_loading_started',
  IN_GAME_LOADING_STOPPED: 'in_game_loading_stopped',
  GAMEPLAY_STARTED: 'gameplay_started',
  GAMEPLAY_STOPPED: 'gameplay_stopped'
} as const

/** Reactive: true once the Bridge has resolved `initialize()` successfully. */
export const isPlaygamaSdkActive = ref(false)
/** Reactive: true when the Bridge failed to come up or the module was
 *  blocked. Wired into `AdProvider.isAdsBlocked` via `PlaygamaProvider`. */
export const isPlaygamaAdsBlocked = ref(false)
/** Two-letter locale derived from `bridge.platform.language`. Used by the
 *  i18n boot path the same way `crazyLocale` is. `null` until the portal
 *  reports one we ship. */
export const playgamaLocale = ref<string | null>(null)
/** Auto-detected platform id reported by the Bridge after init — the fastest
 *  way to see which portal protocol it picked (`playgama`, `youtube`,
 *  `qa_tool`, `mock`, …). */
export const playgamaDetectedId = ref<string | null>(null)

// ─── Internal handles ──────────────────────────────────────────────────────

let sdk: Bridge | null = null
let initPromise: Promise<void> | null = null
let gameReadySent = false
let gameplayStartedActive = false

// ─── Pause inputs ─────────────────────────────────────────────────────────
//
// The Bridge reports pause from TWO independent sources and they must be
// tracked as two independent flags, not one shared boolean.
//
// An earlier version funnelled `pause_state_changed`, `audio_state_changed`
// AND `visibility_state_changed` into a single `heldPause`. That let a
// `visibility_state_changed: 'visible'` — which the Bridge emits whenever the
// iframe regains visibility, including behind a still-open ad overlay — clear
// a pause that `pause_state_changed` had legitimately asserted. Gameplay then
// resumed underneath the ad.
//
// Now: paused = (bridgePaused OR bridgeHidden), each edge-triggered on its own
// flag, aggregated into the unified `isPlatformPaused` gate. The shared
// `useGamePauseAudio` orchestrator is the single audio-suspend driver off that
// aggregate, so nothing is double-counted.
let bridgePaused = false
let bridgeHidden = false

const applyPauseAggregate = (): void => {
  if (bridgePaused || bridgeHidden) pauseGame()
  else resumeGame()
}

const setBridgePaused = (paused: boolean): void => {
  if (paused === bridgePaused) return
  bridgePaused = paused
  applyPauseAggregate()
}

const setBridgeHidden = (hidden: boolean): void => {
  if (hidden === bridgeHidden) return
  bridgeHidden = hidden
  applyPauseAggregate()
}

/** Public accessor — `PlaygamaStrategy` reads `bridge.storage` through this.
 *  Null until `playgamaPlugin()` has resolved AND `initialize()` succeeded. */
export const getPlaygamaBridge = (): Bridge | null => sdk

// ─── Portal language ───────────────────────────────────────────────────────
//
// Per the Bridge docs, `bridge.platform.language` is an ISO 639-1 code taken
// from the host platform, must be read AFTER `initialize()` resolves, and
// "falls back to the browser language" when the platform provides none:
// https://wiki.playgama.com/playgama/bridge-sdk/api/platform#language
//
// Four separate things have to be right, and each was independently broken:
//
//   1. **Tag width.** Docs promise ISO 639-1; the value is passed through from
//      28+ host portals, several of which hand back a full BCP-47 tag
//      (`zh-Hant`, `pt-BR`) or a 3-letter ISO 639-2 code (`deu`, `zho`).
//      → `normalizePlaygamaLanguage`, which returns null for anything we don't
//        ship rather than a bare code.
//
//   2. **No portal, no signal.** De-minified, the Playgama adapter is
//      `platformService.getLanguage?.() || navigator.language.substring(0,2)`.
//      On the MOCK and STANDALONE adapters `getLanguage` does not exist, so
//      the value is purely the browser's. Honouring it there is what booted
//      the game in the tester's language — "the game started in another
//      language, but the default language must be English".
//
//   3. **Mid-session change.** The Bridge exposes NO language-change event.
//      A single read at init is fine when the portal reloads the frame, but
//      Playgama's guided-testing tools flip the language WITHOUT a reload — so
//      nothing happened and QA filed "the platform signal to change the locale
//      did not have any effect". → the poll below.
//
//   4. **Never persisted.** The portal locale drives the live refs and i18n
//      only; writing it into `spinner_user_language` would ride the cloud save
//      into every later session. See `main.ts`.

/** Adapters with no portal behind them — their `platform.language` is just
 *  `navigator.language` and must not be treated as a portal signal. */
const NO_PORTAL_LANGUAGE: ReadonlySet<string> = new Set(['mock', 'standalone'])

/**
 * BCP-47 / ISO-639 tag → an internal code from `LANGUAGES`, or `null` when the
 * portal's language is one we don't ship.
 *
 * Returning `null` rather than an unsupported code is load-bearing: every
 * consumer treats a non-null value as "safe to apply", so an unshipped
 * language can never knock the player out of their stored choice.
 *
 * Script subtags are deliberately collapsed (`zh-Hant`/`zh-TW`/`zh-HK` → `zh`)
 * — serving Simplified to a Traditional reader beats serving English.
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  jpn: 'ja', kor: 'ko', cmn: 'zh', chi: 'zh', zho: 'zh',
  eng: 'en', deu: 'de', ger: 'de', spa: 'es', fra: 'fr', fre: 'fr',
  rus: 'ru', ara: 'ar', ukr: 'uk', tur: 'tr', pol: 'pl', nld: 'nl',
  dut: 'nl', ita: 'it', por: 'pt', hin: 'hi', tha: 'th', vie: 'vi',
  ind: 'id', kaz: 'kk', uzb: 'uz'
}

export const normalizePlaygamaLanguage = (raw: string): string | null => {
  const base = raw.toLowerCase().trim().split(/[-_]/)[0]
  if (!base) return null
  const code = LANGUAGE_ALIASES[base] ?? base
  return LANGUAGES.includes(code) ? code : null
}

/** Last raw tag we logged. The poll runs every 2 s, so logging is change-only
 *  — otherwise DevTools fills with identical lines and the QA console becomes
 *  useless for spotting the events that matter. */
let lastLoggedLanguageTag: string | null = null

/**
 * Read `platform.language` off the given bridge and publish it to
 * `playgamaLocale`.
 *
 * Takes the handle as a parameter rather than reading the module-level `sdk`
 * so the failure path can still recover a language from a bridge whose
 * `initialize()` rejected — `sdk` stays null there on purpose, so nothing else
 * starts using a half-initialized SDK.
 *
 * `platform` is a getter that throws "Before using the SDK you must initialize
 * it" when touched too early — the same trap `PlaygamaStrategy` documents for
 * `bridge.storage` — so it stays wrapped.
 *
 * Never clears a previously-resolved value: a later empty read must not undo
 * an earlier good one.
 */
const readPortalLanguage = (bridge: Bridge | null = sdk): void => {
  try {
    const detectedId = bridge?.platform?.id ?? playgamaDetectedId.value ?? ''
    if (NO_PORTAL_LANGUAGE.has(detectedId)) {
      if (lastLoggedLanguageTag !== `__noportal:${detectedId}`) {
        lastLoggedLanguageTag = `__noportal:${detectedId}`
        console.info(
          `[playgama] platform.id='${detectedId}' has no portal language — `
          + 'ignoring the bridge\'s browser-language fallback, defaulting to English'
        )
      }
      return
    }
    const raw = bridge?.platform?.language
    if (typeof raw !== 'string' || raw.length === 0) {
      if (lastLoggedLanguageTag !== '') {
        lastLoggedLanguageTag = ''
        console.info('[playgama] portal reported no language — keeping stored/browser locale')
      }
      return
    }
    const code = normalizePlaygamaLanguage(raw)
    if (raw !== lastLoggedLanguageTag) {
      lastLoggedLanguageTag = raw
      console.info('[playgama] portal language:', raw, '→', code ?? '(unsupported, ignored)')
    }
    if (code) playgamaLocale.value = code
  } catch (e) {
    console.warn('[playgama] platform.language read threw', e)
  }
}

/**
 * Poll `platform.language` for a mid-session switch.
 *
 * The Bridge exposes no language-change event (confirmed against the v2
 * platform API), and the docs assume a single read at startup — fine when the
 * portal reloads the frame on a language change. Playgama's guided testing
 * tools flip the language WITHOUT a reload, and with no event to subscribe to
 * a poll is the only way to notice. This is the direct fix for "the platform
 * signal to change the locale did not have any effect".
 *
 * The idle skip reads `bridgeHidden` — the Bridge's own visibility state — and
 * NOT `document.visibilityState`, which this build is not allowed to touch
 * (see the Page Visibility note in the file header).
 *
 * Cost is a property read plus a string compare. `playgamaLocale` is a ref, so
 * a detected change flows straight into the watcher in `main.ts`.
 */
const LANGUAGE_POLL_MS = 2_000
let languagePollId: ReturnType<typeof setInterval> | null = null

const onWindowFocus = (): void => readPortalLanguage()

const startLanguageWatch = (): void => {
  if (languagePollId !== null || typeof window === 'undefined') return
  languagePollId = setInterval(() => {
    if (bridgeHidden) return
    readPortalLanguage()
  }, LANGUAGE_POLL_MS)
  // Re-read the moment the frame regains focus, so a switch made while it was
  // backgrounded lands immediately instead of up to 2 s later. `focus` is not
  // part of the Page Visibility API, so it stays allowed on Playables.
  window.addEventListener('focus', onWindowFocus)
}

/** Test-only teardown so the poll can't leak across test files. */
export const __stopPlaygamaLanguageWatch = (): void => {
  if (languagePollId !== null) {
    clearInterval(languagePollId)
    languagePollId = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', onWindowFocus)
  }
  lastLoggedLanguageTag = null
}

/**
 * Resolves as soon as we know whether the portal has a language for us —
 * either because `initialize()` finished, or because it failed / timed out.
 * `main.ts` races this against a short budget so a slow or unreachable Bridge
 * never holds up first paint.
 */
let resolveLocaleReady: () => void = () => {}
export const playgamaLocaleReady: Promise<void> = new Promise((resolve) => {
  resolveLocaleReady = resolve
})

// ─── Public init ──────────────────────────────────────────────────────────

export const playgamaPlugin = (): Promise<void> => {
  if (initPromise) return initPromise
  if (!isPlaygama) {
    initPromise = Promise.resolve()
    return initPromise
  }
  initPromise = (async () => {
    // Every exit path below MUST settle `playgamaLocaleReady`, including the
    // failures: a Bridge whose `initialize()` rejected or timed out often
    // still exposes the browser-derived fallback language, and a gate that
    // never resolves would stall any caller racing it.
    const bridge = await loadPlaygamaBridge()
    if (!bridge) {
      isPlaygamaAdsBlocked.value = true
      if (isDebug.value) console.warn('[playgama] Bridge module unavailable — ads disabled')
      resolveLocaleReady()
      return
    }
    try {
      await Promise.race([
        bridge.initialize(BRIDGE_OPTIONS),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('initialize() timeout')), INIT_TIMEOUT_MS)
        )
      ])
      sdk = bridge
      isPlaygamaSdkActive.value = true
      playgamaDetectedId.value = bridge.platform?.id ?? null
      console.info(
        '[playgama] Bridge v%s initialized — platform.id: %s',
        bridge.version,
        playgamaDetectedId.value
      )

      // ── LANGUAGE ─────────────────────────────────────────────────────
      // Read once now, then keep watching — see `readPortalLanguage` /
      // `startLanguageWatch` for why a single read is not enough.
      readPortalLanguage(bridge)
      startLanguageWatch()

      // ── PAUSE ────────────────────────────────────────────────────────
      // The aggregated pause from the Bridge already includes interstitial /
      // visibility / platform pauses — DO NOT also subscribe to
      // INTERSTITIAL_STATE_CHANGED for pause; that double-counts the suspend
      // stack and the engine ends up permanently muted.
      //
      // INITIAL READ first: `pause_state_changed` only fires on SUBSEQUENT
      // changes, so a game booting into an already-paused portal context is
      // handled only by reading `platform.isPaused` here.
      if (typeof bridge.platform?.isPaused === 'boolean') {
        setBridgePaused(bridge.platform.isPaused)
      }
      // v2: every module forwards its events onto the bridge root and `on()`
      // returns void (v1 returned an unsubscribe function). Subscribing at the
      // root keeps one surface for all five events.
      bridge.on(EVENT.PAUSE_STATE_CHANGED, (paused: boolean) => setBridgePaused(!!paused))
      bridge.on(EVENT.VISIBILITY_STATE_CHANGED, (state: string) => {
        setBridgeHidden(state === 'hidden')
        readPortalLanguage(bridge)
      })

      // ── MUTE ─────────────────────────────────────────────────────────
      // Muting is NOT pausing. Routing the portal's audio toggle into the
      // pause gate (the previous behaviour) froze the simulation instead of
      // silencing it, left every SFX audible, and made unmute a no-op — "the
      // game does not respond to the platform mute request" is a graded
      // Playgama rejection.
      //
      // `setPlatformAudioMuted` zeroes what ALL audio derives from: it
      // suspends the AudioContext, pauses every tracked HTMLAudio, kills
      // in-flight one-shots, and blocks new music/SFX from starting. It
      // deliberately does NOT touch the player's persisted volume settings —
      // platform state is not player state, and writing it into a
      // player-choice key would survive into the cloud save and poison a QA
      // re-test on the same account.
      //
      // INITIAL READ again: `audio_state_changed` only fires on subsequent
      // changes, so a player arriving at an already-muted portal is handled
      // only by reading `platform.isAudioEnabled` here.
      if (typeof bridge.platform?.isAudioEnabled === 'boolean') {
        setPlatformAudioMuted(!bridge.platform.isAudioEnabled)
      }
      bridge.on(EVENT.AUDIO_STATE_CHANGED, (enabled: boolean) => {
        setPlatformAudioMuted(enabled === false)
      })
    } catch (e) {
      console.warn('[playgama] initialize() failed', e)
      isPlaygamaAdsBlocked.value = true
      // A rejected / timed-out `initialize()` must NOT cost us the language.
      // The Bridge documents a browser-language fallback for
      // `platform.language`, and it is frequently readable even when the
      // portal handshake never completed. Ads are lost here; localisation need
      // not be. `sdk` deliberately stays null so nothing else starts using a
      // half-initialized SDK, hence the explicit handle.
      readPortalLanguage(bridge)
    } finally {
      resolveLocaleReady()
    }
  })()
  return initPromise
}

// ─── Lifecycle messages ───────────────────────────────────────────────────

const sendMessage = (name: string, params?: Record<string, unknown>): void => {
  try {
    // v2 `sendMessage` returns a promise that REJECTS on portals which don't
    // implement the message. That is not a game-facing failure.
    const result = sdk?.platform?.sendMessage?.(name, params)
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      void (result as Promise<unknown>).catch(() => {})
    }
  } catch (e) {
    if (isDebug.value) console.warn('[playgama] sendMessage failed', name, e)
  }
}

/** Fires `in_game_loading_started`. Safe to call before init resolves — a
 *  no-op until `isPlaygamaSdkActive` flips true. */
export const playgamaLoadingStart = (): void => {
  if (!isPlaygamaSdkActive.value) return
  sendMessage(MESSAGE.IN_GAME_LOADING_STARTED)
}

/** Fires `in_game_loading_stopped` AND `game_ready` (once). `game_ready` is a
 *  certification-mandatory edge — missing it is an explicit rejection reason
 *  on the Playgama QA Tool. Idempotent. */
export const playgamaGameLoadingStop = (): void => {
  if (!isPlaygamaSdkActive.value) return
  sendMessage(MESSAGE.IN_GAME_LOADING_STOPPED)
  if (gameReadySent) return
  gameReadySent = true
  sendMessage(MESSAGE.GAME_READY)
}

/** Notify the portal that active gameplay has started. Idempotent. Driven by
 *  the shared bracket in `usePortalGameplay.ts`, not called ad hoc. */
export const playgamaGameplayStart = (): void => {
  if (!isPlaygamaSdkActive.value || gameplayStartedActive) return
  gameplayStartedActive = true
  sendMessage(MESSAGE.GAMEPLAY_STARTED)
}

/** Companion to `playgamaGameplayStart`. Idempotent. */
export const playgamaGameplayStop = (): void => {
  if (!isPlaygamaSdkActive.value || !gameplayStartedActive) return
  gameplayStartedActive = false
  sendMessage(MESSAGE.GAMEPLAY_STOPPED)
}

/** Report load progress to the portal. v2 moved this off the deleted
 *  `bridge.game` module onto the root object. */
export const playgamaSetLoadingProgress = (percent: number): void => {
  try {
    sdk?.setGameLoadingProgress?.(percent)
  } catch (e) {
    if (isDebug.value) console.warn('[playgama] setGameLoadingProgress failed', e)
  }
}

// ─── Ad show wrappers ─────────────────────────────────────────────────────
//
// v2 CHANGES that matter here:
//   • `showInterstitial()` / `showRewarded()` return VOID, not a promise. The
//     entire lifecycle is the state event — there is nothing to await and
//     nothing to catch except a synchronous throw.
//   • `on()` returns void. v1 handed back an unsubscribe function and these
//     wrappers called it; keeping that shape leaks one listener per ad shown,
//     and the leaked listeners resolve LATER ads early.

/** Shows an interstitial; resolves on `closed` or `failed`. Never rejects. */
export const showInterstitialPG = async (): Promise<void> => {
  await playgamaPlugin()
  const bridge = sdk
  if (!isPlaygamaSdkActive.value || !bridge?.advertisement?.showInterstitial) return
  return new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      try { bridge.off(EVENT.INTERSTITIAL_STATE_CHANGED, onState) } catch { /* ignore */ }
      resolve()
    }
    const onState = (state: string): void => {
      if (state === 'closed' || state === 'failed') finish()
    }
    bridge.on(EVENT.INTERSTITIAL_STATE_CHANGED, onState)
    try {
      bridge.advertisement.showInterstitial()
    } catch (e) {
      console.warn('[playgama] showInterstitial threw', e)
      finish()
    }
    // Belt-and-braces: a dropped state event must not strand the caller (and
    // with it the ad-pause gate) for the rest of the session.
    setTimeout(finish, 60_000)
  })
}

/** Shows a rewarded video. Resolves `true` only when the Bridge fired
 *  `'rewarded'` — Playgama's docs note that edge can arrive BEFORE `'closed'`,
 *  and granting on `'closed'` alone is a certification-graded violation. */
export const showRewardedPG = async (): Promise<boolean> => {
  await playgamaPlugin()
  const bridge = sdk
  if (!isPlaygamaSdkActive.value || !bridge?.advertisement?.showRewarded) return false
  return new Promise<boolean>((resolve) => {
    let settled = false
    let rewarded = false
    const finish = (): void => {
      if (settled) return
      settled = true
      try { bridge.off(EVENT.REWARDED_STATE_CHANGED, onState) } catch { /* ignore */ }
      resolve(rewarded)
    }
    const onState = (state: string): void => {
      if (state === 'rewarded') {
        rewarded = true
        return
      }
      if (state === 'closed' || state === 'failed') finish()
    }
    bridge.on(EVENT.REWARDED_STATE_CHANGED, onState)
    try {
      bridge.advertisement.showRewarded()
    } catch (e) {
      console.warn('[playgama] showRewarded threw', e)
      finish()
    }
    setTimeout(finish, 120_000)
  })
}

// ─── Save-strategy factory ────────────────────────────────────────────────

/**
 * Build the Playgama save strategy. Non-Playgama builds never reach this code
 * (resolveSaveStrategy's `VITE_APP_PLAYGAMA` arm is dead there), so the static
 * import above doesn't bloat their bundles.
 */
export const createPlaygamaSaveStrategy = async (): Promise<SaveStrategy> => {
  return new PlaygamaStrategy()
}

// NOTE: this file MUST stay free of `import('...')` expressions. The
// obfuscator's `stringArray` transform mangles dynamic-import specifiers and
// the browser then fails to resolve them at runtime. The Bridge import lives
// in `playgamaBridgeLoader.ts`, which is on the obfuscator's exclude list.
