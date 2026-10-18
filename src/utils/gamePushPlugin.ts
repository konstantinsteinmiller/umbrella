// ─── GamePush SDK plugin ────────────────────────────────────────────────────
//
// GamePush (gamepush.com) is a publishing hub: ONE build, uploaded once to
// GamePush Game Hosting, is fanned out to Yandex, VK, CrazyGames, Poki, GamePix,
// Playgama, GameMonetize, Y8 and more. The `gp` object it injects normalises
// every portal's ads, saves, language, pause and sound signals, so this file is
// the only place the game talks to any of them on a `build:gamepush` archive.
//
// Lazy-loaded: `main.ts` dynamic-imports it only when `isGamePush` is true.
//
// What lives here:
//
//   1. `gamePushPlugin()` — injects the loader script with the project id and
//      PUBLIC token (build-time env, see `.env.gamepush.local`), waits for the
//      `window.onGPInit` callback, then `gp.player.ready` so the cloud save is
//      readable before `SaveManager.init()`. Idempotent. Never rejects: a blocked
//      script / bad id leaves the SDK inactive and the game plays offline.
//
//   2. Pause / mute bridge — `gp.on('pause'|'resume')` drives the universal
//      platform pause gate; `gp.sounds` mute state drives `setPlatformAudioMuted`.
//      Muting is NOT pausing (a graded Playgama rejection), and the SDK also
//      pauses/mutes around its own ads, so both are idempotent and the ad
//      wrappers force a final `resumeGame()` (a no-fill can skip the resume).
//
//   3. Lifecycle — `gamePushGameStart()` (loaded edge) and
//      `gamePushGameplayStart/Stop()` (the bracket in `usePortalGameplay`).
//      Portals behind GamePush (CrazyGames, Poki, ...) grade these.
//
//   4. `showRewardedGP()` / `showMidgameGP()` — rewarded resolves true ONLY when
//      the SDK reports success; the interstitial reports its real open through
//      the `onImpression` callback so audio is cut when an ad is truly on screen.
//
//   5. `isGamePushSdkActive` / `isGamePushAdsBlocked` / `isGamePushRewardedAvailable`
//      / `isGamePushFullscreenAvailable` / `gamePushLocale` reactive refs.
//
// SDK reference: https://docs.gamepush.com/docs/get-start/getting-started/

import { ref } from 'vue'
import { isGamePush } from '@/use/useUser'
import { isDebug } from '@/use/useMatch'
import { pauseGame, resumeGame } from '@/use/useGamePause'
import { setPlatformAudioMuted } from '@/use/useGamePauseAudio'

const SDK_SRC = 'https://gamepush.com/sdk/gamepush.js'
const SDK_SCRIPT_ID = 'gamepush-sdk'
const SDK_READY_TIMEOUT_MS = 10_000
const PLAYER_READY_TIMEOUT_MS = 8_000
/** How often the ad-availability flags are re-read. The SDK exposes them as
 *  plain properties (no change event), so the rewarded gate polls. */
const AVAILABILITY_POLL_MS = 4_000

// Minimal structural typing of the bits of `gp` we touch.
export interface GamePushPlayer {
  ready: Promise<void>
  get(key: string): unknown
  set(key: string, value: unknown): void
  sync(options?: { override?: boolean; storage?: string }): Promise<unknown>
  on?(event: string, cb: (...args: unknown[]) => void): void
}

interface GamePushAds {
  isAdblockEnabled?: boolean
  isFullscreenAvailable?: boolean
  isRewardedAvailable?: boolean
  showFullscreen(options?: { showCountdownOverlay?: boolean }): Promise<unknown>
  showRewardedVideo(options?: { showFailedOverlay?: boolean }): Promise<unknown>
  on(event: string, cb: (...args: unknown[]) => void): void
}

interface GamePushSounds {
  isMuted?: boolean
  isSFXMuted?: boolean
  isMusicMuted?: boolean
  on(event: string, cb: () => void): void
}

export interface GamePushSdk {
  player: GamePushPlayer
  ads: GamePushAds
  sounds?: GamePushSounds
  language?: string
  isPaused?: boolean
  gameStart?: () => void
  gameplayStart?: () => void
  gameplayStop?: () => void
  on(event: string, cb: (...args: unknown[]) => void): void
}

declare global {
  interface Window {
    onGPInit?: (gp: GamePushSdk) => void
    gp?: GamePushSdk
  }
}

/** Reactive: true once `gp` is initialised AND `gp.player.ready` has settled. */
export const isGamePushSdkActive = ref(false)

/** Reactive: true when the SDK reports an ad-blocker (or the script itself was
 *  blocked). Drives the shared `AdsBlockedModal`; the reward is never granted. */
export const isGamePushAdsBlocked = ref(false)

/** Reactive: `gp.ads.isRewardedAvailable`, re-read on every ad event + a poll. */
export const isGamePushRewardedAvailable = ref(false)

/** Reactive: `gp.ads.isFullscreenAvailable`. */
export const isGamePushFullscreenAvailable = ref(false)

/** Reactive: ISO-639-1 language the host portal runs in (`gp.language`). */
export const gamePushLocale = ref<string | null>(null)

let gpSdk: GamePushSdk | null = null
let initPromise: Promise<void> | null = null
let gameStartFired = false
let gameplayActive = false
let availabilityTimer: ReturnType<typeof setInterval> | null = null
/** Impression callback of the interstitial currently being shown. */
let pendingImpression: (() => void) | null = null

const TAG = '[gamepush]'
const dlog = (...args: unknown[]): void => {
  if (isDebug.value) console.info(...args)
}

const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) }
    )
  })

/** Build the loader URL from the build-time env. `null` when the placeholders
 *  were never filled in (the plugin then stays inactive instead of loading a
 *  project that does not exist). */
export const buildGamePushSrc = (
  projectId: string | undefined,
  publicToken: string | undefined
): string | null => {
  if (!projectId || !publicToken) return null
  const q = new URLSearchParams({ projectId, publicToken, callback: 'onGPInit' })
  return `${SDK_SRC}?${q.toString()}`
}

// ─── Init ──────────────────────────────────────────────────────────────────

/**
 * Initialise the GamePush SDK. Idempotent — repeated calls return the same
 * Promise. Resolves once `gp` exists and `gp.player.ready` has settled (or a
 * defensive timeout fired). Safe to call when `isGamePush` is false — no-op.
 *
 * AWAITED from `main.ts` before `SaveManager.init()`: `GamePushStrategy.hydrate()`
 * needs the synced player, or it would read an empty row and the next flush
 * would overwrite the real cloud save with defaults.
 */
export const gamePushPlugin = (): Promise<void> => {
  if (initPromise) return initPromise
  initPromise = (async () => {
    if (typeof window === 'undefined' || !isGamePush) return

    const gp = await loadGp()
    if (!gp) return
    gpSdk = gp

    try {
      await withTimeout(gp.player.ready, PLAYER_READY_TIMEOUT_MS, 'gp.player.ready')
    } catch (e) {
      // Keep gp: ads still work; the strategy sees no usable player row.
      console.warn(`${TAG} player.ready failed — save may be local-only`, e)
    }

    try {
      const lang = gp.language
      if (typeof lang === 'string' && lang.length > 0) {
        gamePushLocale.value = lang.toLowerCase().split('-')[0] ?? null
        dlog(`${TAG} portal locale → ${gamePushLocale.value}`)
      }
    } catch { /* language optional */ }

    wirePauseAndMute(gp)
    wireAds(gp)
    isGamePushSdkActive.value = true
  })()
  return initPromise
}

const loadGp = (): Promise<GamePushSdk | null> => {
  // Already injected by GamePush Hosting's own install code, or a repeat init.
  if (window.gp) return Promise.resolve(window.gp)

  const src = buildGamePushSrc(
    import.meta.env.VITE_GAMEPUSH_PROJECT_ID,
    import.meta.env.VITE_GAMEPUSH_PUBLIC_TOKEN
  )
  if (!src) {
    console.warn(`${TAG} VITE_GAMEPUSH_PROJECT_ID / VITE_GAMEPUSH_PUBLIC_TOKEN missing — SDK disabled`)
    return Promise.resolve(null)
  }

  return new Promise<GamePushSdk | null>((resolve) => {
    let settled = false
    const done = (gp: GamePushSdk | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(gp)
    }
    const timer = setTimeout(() => {
      console.warn(`${TAG} SDK init timed out after ${SDK_READY_TIMEOUT_MS}ms`)
      isGamePushAdsBlocked.value = true
      done(null)
    }, SDK_READY_TIMEOUT_MS)

    // The loader calls `window[callback](gp)` once everything is initialised.
    window.onGPInit = (gp) => done(gp)

    const script = document.createElement('script')
    script.id = SDK_SCRIPT_ID
    script.src = src
    script.async = true
    script.onerror = () => {
      // Offline / CSP / content blocker. Never reject: boot continues.
      console.warn(`${TAG} SDK script failed to load (offline / blocker)`)
      isGamePushAdsBlocked.value = true
      done(null)
    }
    document.head.appendChild(script)
  })
}

// ─── Pause + mute ──────────────────────────────────────────────────────────

const readMuted = (s: GamePushSounds): boolean =>
  s.isMuted === true || (s.isSFXMuted === true && s.isMusicMuted === true)

const wirePauseAndMute = (gp: GamePushSdk): void => {
  try {
    gp.on('pause', () => { pauseGame() })
    gp.on('resume', () => { resumeGame() })
    if (gp.isPaused) pauseGame()
  } catch (e) {
    console.warn(`${TAG} pause/resume bridge wiring failed`, e)
  }

  const sounds = gp.sounds
  if (!sounds) return
  try {
    // INITIAL READ: the events only fire on changes, so a player arriving at an
    // already-muted portal is handled only here.
    setPlatformAudioMuted(readMuted(sounds))
    const sync = (): void => setPlatformAudioMuted(readMuted(sounds))
    for (const ev of ['mute', 'unmute', 'mute:sfx', 'unmute:sfx', 'mute:music', 'unmute:music']) {
      sounds.on(ev, sync)
    }
  } catch (e) {
    console.warn(`${TAG} sounds bridge wiring failed`, e)
  }
}

// ─── Ads ───────────────────────────────────────────────────────────────────

const refreshAvailability = (): void => {
  const ads = gpSdk?.ads
  if (!ads) return
  isGamePushRewardedAvailable.value = ads.isRewardedAvailable === true
  isGamePushFullscreenAvailable.value = ads.isFullscreenAvailable === true
  if (ads.isAdblockEnabled === true) isGamePushAdsBlocked.value = true
}

const wireAds = (gp: GamePushSdk): void => {
  refreshAvailability()
  try {
    gp.ads.on('fullscreen:start', () => {
      // The interstitial is genuinely on screen NOW — cut the audio.
      const cb = pendingImpression
      pendingImpression = null
      cb?.()
    })
    for (const ev of ['start', 'close', 'rewarded:close', 'fullscreen:close']) {
      gp.ads.on(ev, refreshAvailability)
    }
  } catch (e) {
    console.warn(`${TAG} ads event wiring failed`, e)
  }
  if (availabilityTimer === null) {
    availabilityTimer = setInterval(refreshAvailability, AVAILABILITY_POLL_MS)
  }
}

/**
 * Show a rewarded video. Resolves `true` ONLY when the SDK reports success.
 * Resolves `false` for no-fill, skip, ad-blocker or error. Never rejects.
 */
export const showRewardedGP = async (): Promise<boolean> => {
  const gp = gpSdk
  if (!gp || !isGamePushSdkActive.value) return false
  refreshAvailability()
  if (!isGamePushRewardedAvailable.value) return false
  try {
    const ok = await gp.ads.showRewardedVideo()
    dlog(`${TAG} rewarded result`, ok)
    return ok === true
  } catch (e) {
    console.warn(`${TAG} rewarded show threw`, e)
    return false
  } finally {
    // The SDK resumes on ad close; a no-fill may skip it. Idempotent.
    resumeGame()
    refreshAvailability()
  }
}

/**
 * Show an interstitial. Resolves when the ad closed (or was skipped by the
 * frequency cap / no fill). `onImpression` fires when the ad really opens.
 * Never rejects.
 */
export const showMidgameGP = async (onImpression?: () => void): Promise<void> => {
  const gp = gpSdk
  if (!gp || !isGamePushSdkActive.value) return
  refreshAvailability()
  if (!isGamePushFullscreenAvailable.value) return
  pendingImpression = onImpression ?? null
  try {
    await gp.ads.showFullscreen()
  } catch (e) {
    console.warn(`${TAG} interstitial show threw`, e)
  } finally {
    pendingImpression = null
    resumeGame()
    refreshAvailability()
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────

/** `gp.gameStart()` — "the game is fully loaded". Some portals require it.
 *  Idempotent; no-op until the SDK is active. */
export const gamePushGameStart = (): void => {
  if (!isGamePushSdkActive.value || gameStartFired) return
  try {
    gpSdk?.gameStart?.()
    gameStartFired = true
    dlog(`${TAG} gameStart()`)
  } catch (e) {
    console.warn(`${TAG} gameStart() threw`, e)
  }
}

/** `gp.gameplayStart()` — idempotent; balanced with `gamePushGameplayStop`. */
export const gamePushGameplayStart = (): void => {
  if (!isGamePushSdkActive.value || gameplayActive) return
  try {
    gpSdk?.gameplayStart?.()
    gameplayActive = true
    dlog(`${TAG} gameplayStart()`)
  } catch (e) {
    console.warn(`${TAG} gameplayStart() threw`, e)
  }
}

export const gamePushGameplayStop = (): void => {
  if (!isGamePushSdkActive.value || !gameplayActive) return
  try {
    gpSdk?.gameplayStop?.()
    gameplayActive = false
    dlog(`${TAG} gameplayStop()`)
  } catch (e) {
    console.warn(`${TAG} gameplayStop() threw`, e)
  }
}

// ─── Accessors ─────────────────────────────────────────────────────────────

/** Strategy accessor — `null` until `gamePushPlugin()` resolves. */
export const getGamePush = (): GamePushSdk | null => gpSdk

const useGamePush = () => ({
  isGamePushSdkActive,
  isGamePushAdsBlocked,
  isGamePushRewardedAvailable,
  isGamePushFullscreenAvailable,
  gamePushLocale,
  gamePushPlugin,
  gamePushGameStart,
  gamePushGameplayStart,
  gamePushGameplayStop,
  showRewardedGP,
  showMidgameGP,
  getGamePush
})

export default useGamePush
