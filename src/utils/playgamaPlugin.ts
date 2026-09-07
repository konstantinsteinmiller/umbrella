// ─── Playgama Bridge plugin ────────────────────────────────────────────────
//
// Lazy-loaded module that owns everything the game talks to the Playgama
// Bridge SDK about. Mirrors `gameDistributionPlugin.ts` / `glitchPlugin.ts`
// in shape — `main.ts` only imports it when `isPlaygama` is true so non-
// Playgama builds never ship the SDK glue.
//
// "Playgama Bridge" is the unified abstraction Playgama ships across 28+
// portals (production Playgama, Yandex, CrazyGames, Poki, GameSnacks, …).
// On the production Playgama portal `bridge.platform.id === 'playgama'`.
// On localhost dev (no parent-frame handshake) the bridge falls back to
// MOCK and `platform.id === 'mock'` — that's the fast happy path.
//
// **DO NOT** override `forciblySetPlatformId` in the bridge config. The
// bridge has built-in detectors per parent-frame protocol; forcing a
// platform id pins it to ONE protocol and breaks every other context
// (notably the developer QA tool, which speaks a different protocol than
// production). See `nexusorbiter` integration-doc pitfall A.

import { ref } from 'vue'
import { isPlaygama } from '@/use/useUser'
import { isDebug } from '@/use/useMatch'
import { LANGUAGES } from '@/utils/enums'
import { pauseGame, resumeGame } from '@/use/useGamePause'
import { setPlatformAudioMuted } from '@/use/useGamePauseAudio'
import type { SaveStrategy } from '@/utils/save/types'
// Static import — the obfuscator's `stringArray` mangles dynamic-import
// literals, which on the Playgama QA Tool surfaced as
// `Failed to resolve module specifier '@/utils/save/PlaygamaStrategy'`
// at runtime. Static-importing it inlines the (small) strategy class
// into this plugin's already-lazy-loaded chunk; non-Playgama builds
// don't touch this module at all (resolveSaveStrategy's `VITE_APP_PLAYGAMA`
// arm is dead code outside Playgama), so the bundle cost stays zero.
import { PlaygamaStrategy } from '@/utils/save/PlaygamaStrategy'

const SDK_SRC = 'https://bridge.playgama.com/v1/stable/playgama-bridge.js'

/**
 * Options handed to `bridge.initialize()`.
 *
 * The bridge resolves its config as `ConfigLoader.load(configFilePath, these)`
 * — it fetches `./playgama-bridge-config.json` and, **only if that fetch or
 * parse fails**, falls back to this object. So this is the safety net for QA
 * wrappers / CDNs that don't serve the emitted JSON; the file itself (see the
 * `emit-playgama-bridge-config` plugin in `vite.config.ts`) is the primary
 * source and MUST carry the same values.
 *
 * `storage.allowAnonymousCloudSave` is the load-bearing one. The Playgama
 * platform adapter gates cloud storage as:
 *
 *   isStorageAvailable(PLATFORM_INTERNAL)
 *     = isCloudSaveSupported
 *       && (options.storage?.allowAnonymousCloudSave === true
 *           || player.isAuthorized)
 *
 * Without it, every guest player — including the QA reviewer's first run —
 * silently degrades to the bridge's `local_storage` adapter and no progress
 * ever reaches the Playgama remote.
 */
const BRIDGE_OPTIONS = {
  storage: { allowAnonymousCloudSave: true },
  advertisement: { minimumDelayBetweenInterstitial: 120 }
} as const
// Production handshake on cold-start can take 5-7 s; keep generous headroom
// so a slow CDN / mobile cold-cache doesn't latch the "ads blocked" rail
// for the rest of the session. Localhost MOCK resolves in <50 ms either way.
const INIT_TIMEOUT_MS = 15_000

declare global {
  interface Window {
    bridge?: any
    playgamaBridge?: any
  }
}

/** Reactive: true once the bridge has resolved `initialize()` successfully. */
export const isPlaygamaSdkActive = ref(false)
/** Reactive: true when the bridge failed to come up or the script was
 *  blocked. Wired into `AdProvider.isAdsBlocked` via `PlaygamaProvider`. */
export const isPlaygamaAdsBlocked = ref(false)
/** Two-letter locale derived from `bridge.platform.language`. Used by the
 *  i18n boot path the same way `crazyLocale` is. `null` until the bridge
 *  reports one. */
export const playgamaLocale = ref<string | null>(null)
/** Auto-detected platform id reported by the bridge after init — useful for
 *  debugging which portal protocol the bridge picked. */
export const playgamaDetectedId = ref<string | null>(null)

// ─── Internal handles ──────────────────────────────────────────────────────

let initPromise: Promise<void> | null = null
let gameReadySent = false
let gameplayStartedActive = false
let injectPromise: Promise<any> | null = null

// ─── Pause inputs ─────────────────────────────────────────────────────────
//
// The bridge reports pause from TWO independent sources and they must be
// tracked as two independent flags, not one shared boolean.
//
// The previous version funnelled `pause_state_changed`, `audio_state_changed`
// AND `visibility_state_changed` into a single `heldPause`. That let a
// `visibility_state_changed: 'visible'` — which the bridge emits whenever the
// iframe regains visibility, including behind a still-open ad overlay — clear
// a pause that `pause_state_changed` had legitimately asserted. Gameplay then
// resumed underneath the ad.
//
// Now: `loopRuns = NOT (bridgePaused OR bridgeHidden)`, each edge-triggered on
// its own flag, aggregated into the unified `isPlatformPaused` gate. The
// shared `useGamePauseAudio` orchestrator is the single audio-suspend driver
// off the aggregate, so no double-counting.
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

const getBridge = (): any =>
  typeof window === 'undefined' ? null : (window.bridge ?? window.playgamaBridge ?? null)

/** Public accessor — `PlaygamaStrategy` reads `bridge.storage` through this. */
export const getPlaygamaBridge = (): any => getBridge()

// ─── Portal language ───────────────────────────────────────────────────────
//
// Per the Bridge docs, `bridge.platform.language` is an ISO 639-1 code taken
// from the host platform, must be read AFTER `initialize()` resolves, and
// "falls back to the browser language" when the platform provides none:
// https://wiki.playgama.com/playgama/bridge-sdk/api/platform#language
//
// Four separate things have to be right, and each was independently broken:
//
//   1. **Tag width.** Docs promise ISO 639-1; the value is passed through
//      from 28+ host portals, several of which hand back a full BCP-47 tag
//      (`zh-Hant`, `pt-BR`) or a 3-letter ISO 639-2 code (`deu`, `zho`).
//      → `normalizePlaygamaLanguage`, which returns null for anything we
//        don't ship rather than a bare code.
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
//      Playgama's guided-testing tools flip the language WITHOUT a reload —
//      so nothing happened and QA filed "the platform signal to change the
//      locale did not have any effect". → the poll below.
//
//   4. **Never persisted.** The portal locale drives the live refs and i18n
//      only; writing it into `spinner_user_language` would ride the cloud
//      save into every later session. See `main.ts`.

/** Adapters with no portal behind them — their `platform.language` is just
 *  `navigator.language` and must not be treated as a portal signal. */
const NO_PORTAL_LANGUAGE: ReadonlySet<string> = new Set(['mock', 'standalone'])

/**
 * BCP-47 / ISO-639 tag → an internal code from `LANGUAGES`, or `null` when
 * the portal's language is one we don't ship.
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

/** Last raw tag we logged. The poll runs every 2s, so logging is change-only
 *  — otherwise DevTools fills with identical lines and the QA console becomes
 *  useless for spotting the events that matter. */
let lastLoggedLanguageTag: string | null = null

/**
 * Read `bridge.platform.language` and publish it to `playgamaLocale`.
 *
 * Callable repeatedly on purpose (init, poll, window focus). `platform` is a
 * getter that throws "Before using the SDK you must initialize it" when
 * touched too early — the same trap `PlaygamaStrategy` documents for
 * `bridge.storage` — so it stays wrapped.
 *
 * Never clears a previously-resolved value: a later empty read must not undo
 * an earlier good one.
 */
const readPortalLanguage = (): void => {
  try {
    const bridge = getBridge()
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
 * The Bridge exposes no language-change event (confirmed against the platform
 * API reference), and the docs assume a single read at startup — fine when the
 * portal reloads the frame on a language change. Playgama's guided testing
 * tools flip the language WITHOUT a reload, and with no event to subscribe to
 * a poll is the only way to notice. This is the direct fix for "the platform
 * signal to change the locale did not have any effect".
 *
 * Cost is a property read plus a string compare, skipped entirely while the
 * document is hidden. `playgamaLocale` is a ref, so a detected change flows
 * straight into the watcher in `main.ts` — nothing else has to be re-plumbed.
 */
const LANGUAGE_POLL_MS = 2_000
let languagePollId: ReturnType<typeof setInterval> | null = null

const startLanguageWatch = (): void => {
  if (languagePollId !== null || typeof window === 'undefined') return
  languagePollId = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    readPortalLanguage()
  }, LANGUAGE_POLL_MS)
  // Re-read the moment the tab regains focus, so a switch made while the
  // frame was backgrounded lands immediately instead of up to 2s later.
  window.addEventListener('focus', readPortalLanguage)
}

/** Test-only teardown so the poll can't leak across test files. */
export const __stopPlaygamaLanguageWatch = (): void => {
  if (languagePollId !== null) {
    clearInterval(languagePollId)
    languagePollId = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', readPortalLanguage)
  }
  lastLoggedLanguageTag = null
}

/**
 * Resolves as soon as we know whether the portal has a language for us —
 * either because `initialize()` finished, or because it failed / timed out.
 * `main.ts` can race this against a short budget so a slow or unreachable
 * Bridge never holds up first paint.
 */
let resolveLocaleReady: () => void = () => {}
export const playgamaLocaleReady: Promise<void> = new Promise((resolve) => {
  resolveLocaleReady = resolve
})

// ─── SDK script injection (defensive — build-time tag is primary) ─────────

const ensureSdkLoaded = (): Promise<any> => {
  if (injectPromise) return injectPromise
  injectPromise = new Promise<any>((resolve) => {
    if (typeof window === 'undefined') return resolve(null)
    if (getBridge()) return resolve(getBridge())
    const existing = document.querySelector(`script[src="${SDK_SRC}"]`) as HTMLScriptElement | null
    const onLoad = () => {
      // Poll briefly — the bridge sets `window.bridge` synchronously on
      // load but some wrappers wrap the script in a deferred chunk.
      let tries = 0
      const tick = () => {
        const b = getBridge()
        if (b) return resolve(b)
        if (++tries > 200) return resolve(null) // ~10 s @ 50 ms
        setTimeout(tick, 50)
      }
      tick()
    }
    if (existing) {
      if (existing.dataset.loaded === 'true') return onLoad()
      existing.addEventListener('load', onLoad, { once: true })
      existing.addEventListener('error', () => resolve(null), { once: true })
      return
    }
    const tag = document.createElement('script')
    tag.src = SDK_SRC
    tag.async = false
    tag.addEventListener('load', () => { tag.dataset.loaded = 'true'; onLoad() }, { once: true })
    tag.addEventListener('error', () => resolve(null), { once: true })
    document.head.appendChild(tag)
  })
  return injectPromise
}

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
    try {
    const sdk = await ensureSdkLoaded()
    if (!sdk) {
      isPlaygamaAdsBlocked.value = true
      if (isDebug.value) console.warn('[playgama] SDK script missing — ads disabled')
      return
    }
    const bridge = getBridge()
    if (!bridge?.initialize) {
      isPlaygamaAdsBlocked.value = true
      return
    }
    try {
      await Promise.race([
        bridge.initialize(BRIDGE_OPTIONS),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('initialize() timeout')), INIT_TIMEOUT_MS)
        )
      ])
      isPlaygamaSdkActive.value = true
      playgamaDetectedId.value = bridge?.platform?.id ?? null
      console.info('[playgama] initialized — platform.id:', playgamaDetectedId.value)

      // ── LANGUAGE ─────────────────────────────────────────────────────
      // Read once now, then keep watching — see `readPortalLanguage` /
      // `startLanguageWatch` for why a single read is not enough.
      readPortalLanguage()
      startLanguageWatch()

      const ev = bridge?.EVENT_NAME ?? {}
      const pauseEventName = ev.PAUSE_STATE_CHANGED ?? 'pause_state_changed'
      const audioEventName = ev.AUDIO_STATE_CHANGED ?? 'audio_state_changed'
      const visibilityEventName = ev.VISIBILITY_STATE_CHANGED ?? 'visibility_state_changed'
      const interstitialEventName = ev.INTERSTITIAL_STATE_CHANGED ?? 'interstitial_state_changed'
      const rewardedEventName = ev.REWARDED_STATE_CHANGED ?? 'rewarded_state_changed'

      // ── PAUSE ────────────────────────────────────────────────────────
      // Aggregated pause from the bridge already includes interstitial /
      // visibility / platform pauses — DO NOT also subscribe to
      // INTERSTITIAL_STATE_CHANGED for pause; that double-counts the
      // suspend stack and the engine ends up permanently muted.
      //
      // INITIAL READ first: `pause_state_changed` only fires on SUBSEQUENT
      // changes, so a game that boots into an already-paused portal context
      // is handled only by reading `platform.isPaused` here.
      if (typeof bridge.platform?.isPaused === 'boolean') {
        setBridgePaused(bridge.platform.isPaused)
      }
      bridge.platform?.on?.(pauseEventName, (p: boolean) => setBridgePaused(!!p))
      bridge.platform?.on?.(visibilityEventName, (state: string) => {
        setBridgeHidden(state === 'hidden')
      })

      // ── MUTE ─────────────────────────────────────────────────────────
      // Muting is NOT pausing. Routing the portal's audio toggle into the
      // pause gate (the previous behaviour) froze the simulation instead of
      // silencing it, left every SFX audible, and made unmute a no-op —
      // "the game does not respond to the platform mute request" is a
      // graded Playgama rejection.
      //
      // `setPlatformAudioMuted` zeroes what ALL audio derives from: it
      // suspends the AudioContext, pauses every tracked HTMLAudio, kills
      // in-flight one-shots, and blocks new music/SFX from starting. It
      // deliberately does NOT touch the player's persisted volume settings
      // — platform state is not player state, and writing it into a
      // player-choice key would survive into the cloud save and poison a
      // QA re-test on the same account.
      //
      // INITIAL READ again: `audio_state_changed` only fires on subsequent
      // changes, so a player arriving at an already-muted portal is handled
      // only by reading `platform.isAudioEnabled` here.
      if (typeof bridge.platform?.isAudioEnabled === 'boolean') {
        setPlatformAudioMuted(!bridge.platform.isAudioEnabled)
      }
      bridge.platform?.on?.(audioEventName, (enabled: boolean) => {
        setPlatformAudioMuted(enabled === false)
      })
      // Per-format flags drive only the ad-show promise resolution edges —
      // never pause. (Pause is the aggregated `PAUSE_STATE_CHANGED`.)
      bridge.advertisement?.on?.(interstitialEventName, (_s: string) => {
        // Pause is already handled by the aggregated event. Keep this
        // subscriber registered so the bridge knows we care about
        // interstitial lifecycle — used internally for `showInterstitialPG`.
      })
      bridge.advertisement?.on?.(rewardedEventName, (_s: string) => {
        // Same: grant edge is read inside `showRewardedPG` via a dedicated
        // listener registered at show time.
      })
    } catch (e) {
      console.warn('[playgama] initialize() failed', e)
      isPlaygamaAdsBlocked.value = true
    }
    } finally {
      // Best-effort read even on the failure paths, then open the gate.
      readPortalLanguage()
      resolveLocaleReady()
    }
  })()
  return initPromise
}

// ─── Lifecycle messages ───────────────────────────────────────────────────

const sendMessage = (name: string, params?: any): void => {
  const bridge = getBridge()
  try {
    bridge?.platform?.sendMessage?.(name, params)
  } catch (e) {
    if (isDebug.value) console.warn('[playgama] sendMessage failed', name, e)
  }
}

/** Fires `in_game_loading_started`. Safe to call before init resolves — a
 *  no-op until `isPlaygamaSdkActive` flips true. */
export const playgamaLoadingStart = (): void => {
  if (!isPlaygamaSdkActive.value) return
  sendMessage('in_game_loading_started')
}

/** Fires `in_game_loading_stopped` AND `game_ready` (once). `game_ready`
 *  is a certification-mandatory edge — missing it is an explicit rejection
 *  reason on the Playgama QA Tool. Idempotent. */
export const playgamaGameLoadingStop = (): void => {
  if (!isPlaygamaSdkActive.value) return
  sendMessage('in_game_loading_stopped')
  if (gameReadySent) return
  gameReadySent = true
  sendMessage('game_ready')
}

/** Notify the portal that gameplay is starting. Idempotent. */
export const playgamaGameplayStart = (): void => {
  if (!isPlaygamaSdkActive.value || gameplayStartedActive) return
  gameplayStartedActive = true
  sendMessage('gameplay_started')
}

/** Companion to `playgamaGameplayStart`. Idempotent. */
export const playgamaGameplayStop = (): void => {
  if (!isPlaygamaSdkActive.value || !gameplayStartedActive) return
  gameplayStartedActive = false
  sendMessage('gameplay_stopped')
}

// ─── Ad show wrappers ─────────────────────────────────────────────────────

/** Shows an interstitial; resolves on `closed` or `failed`. Never rejects. */
export const showInterstitialPG = async (): Promise<void> => {
  await playgamaPlugin()
  const bridge = getBridge()
  if (!bridge?.advertisement?.showInterstitial) return
  return new Promise<void>((resolve) => {
    let settled = false
    let opened = false
    const ev = bridge?.EVENT_NAME ?? {}
    const evName = ev.INTERSTITIAL_STATE_CHANGED ?? 'interstitial_state_changed'
    const finish = () => {
      if (settled) return
      settled = true
      try { off?.() } catch { /* ignore */ }
      resolve()
    }
    const off = bridge.advertisement?.on?.(evName, (state: string) => {
      if (state === 'loading' || state === 'opened') { opened = true; return }
      if (state === 'closed' || state === 'failed') finish()
    })
    try {
      const maybe = bridge.advertisement.showInterstitial()
      if (maybe && typeof maybe.then === 'function') {
        // DO NOT settle when the show() promise resolves: Playgama resolves it
        // the instant the request is DISPATCHED, before the ad opens. Settling
        // there dropped the pause gate immediately, so music + gameplay resumed
        // UNDERNEATH the still-open ad. The lifecycle is driven by
        // INTERSTITIAL_STATE_CHANGED ('opened' → 'closed'/'failed'). The promise
        // is only used to (a) catch a hard dispatch failure, and (b) detect a
        // no-fill where the ad never opened (short grace, then finish).
        maybe.then(
          () => { setTimeout(() => { if (!opened) finish() }, 800) },
          () => finish()
        )
      }
    } catch (e) {
      console.warn('[playgama] showInterstitial threw', e)
      finish()
    }
    // Belt-and-braces: hard cap so a state event drop can't strand the call.
    setTimeout(finish, 60_000)
  })
}

/** Shows a rewarded video. Resolves `true` only when the bridge fired
 *  `rewarded` BEFORE the `closed` / `failed` edge (Playgama's docs note
 *  the grant edge is `'rewarded'`, not `'closed'`). */
export const showRewardedPG = async (): Promise<boolean> => {
  await playgamaPlugin()
  const bridge = getBridge()
  if (!bridge?.advertisement?.showRewarded) return false
  return new Promise<boolean>((resolve) => {
    let settled = false
    let rewarded = false
    let opened = false
    const ev = bridge?.EVENT_NAME ?? {}
    const evName = ev.REWARDED_STATE_CHANGED ?? 'rewarded_state_changed'
    const finish = () => {
      if (settled) return
      settled = true
      try { off?.() } catch { /* ignore */ }
      resolve(rewarded)
    }
    const off = bridge.advertisement?.on?.(evName, (state: string) => {
      if (state === 'loading' || state === 'opened') { opened = true; return }
      if (state === 'rewarded') {
        rewarded = true
        return
      }
      if (state === 'closed' || state === 'failed') finish()
    })
    try {
      const maybe = bridge.advertisement.showRewarded()
      if (maybe && typeof maybe.then === 'function') {
        // DO NOT settle when the show() promise resolves: Playgama resolves it
        // the instant the request is DISPATCHED — before the ad opens, and well
        // before the 'rewarded' grant edge. Settling there resolved granted=false
        // immediately and dropped the pause gate, so music + gameplay resumed
        // UNDER the still-open ad (the bug in the log). The grant + close are
        // driven entirely by REWARDED_STATE_CHANGED ('opened' → 'rewarded' →
        // 'closed'/'failed'). The promise is only used to (a) catch a hard
        // dispatch failure, and (b) detect a no-fill where the ad never opened.
        maybe.then(
          () => { setTimeout(() => { if (!opened) finish() }, 800) },
          () => finish()
        )
      }
    } catch (e) {
      console.warn('[playgama] showRewarded threw', e)
      finish()
    }
    setTimeout(finish, 120_000)
  })
}

// ─── Save-strategy factory ────────────────────────────────────────────────

/**
 * Build the Playgama save strategy. Non-Playgama builds never reach this
 * code (resolveSaveStrategy's `VITE_APP_PLAYGAMA` arm is dead code there),
 * so the static import above doesn't bloat their bundles.
 */
export const createPlaygamaSaveStrategy = async (): Promise<SaveStrategy> => {
  return new PlaygamaStrategy()
}
