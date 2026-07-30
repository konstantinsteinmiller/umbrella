// ─── Central pause → audio + console-log orchestrator ──────────────────────
//
// ONE place, for EVERY build, that turns "the game must be silent" into "all
// audio is silenced and we said so in the console". The reasons that require
// silence (rewarded / interstitial ad on screen, tab hidden, platform SDK
// pause callback) OR into `isAudioPaused` (see `useGamePause.ts`); this
// module subscribes to that single gate and:
//
//   • suspends ALL engine audio on the false→true edge (bg music + the
//     Web Audio context + every registered HTMLAudio element), and
//   • resumes it on the true→false edge,
//   • logging both transitions with the active pause reasons.
//
// GamePix QA flagged that music / SFX kept playing under interstitial and
// rewarded ads. The fix is structural: route the audio mute through the
// universal pause gate so it can NEVER be skipped on any provider —
// CrazyGames, GameDistribution, Playgama, GamePix, or the Noop/web build.
// The sim loops early-return on the sibling `isGamePaused` gate, so this
// module is the audio half of the same mechanism.
//
// **`isAudioPaused`, not `isGamePaused`.** An in-game modal freezes the sim
// but must NOT mute — menus keep their music (and the modal-open cue plays to
// completion instead of being frozen mid-buffer and replaying clipped on
// close). The modal source is therefore absent from the gate this module
// watches; ads / tab-hide / platform pause still mute unconditionally.
//
// **Single suspend slot.** `suspendAllAudio` / `resumeAllAudio` are
// ref-counted in `useAssets.ts`. This orchestrator owns exactly ONE slot
// (tracked by `slotHeld`) so a duplicated `paused=true` emission can never
// drift the counter and leave the game permanently muted. All the older
// per-path suspends (in `useAds`, `gamepixPlugin`, `playgamaPlugin`,
// `useAssets.armVisibilitySuspend`) were removed in favour of this — there
// is now one suspend driver, not four overlapping ones.
//
// **`onAudioPauseChange` fires with `flush: 'sync'`.** `useAds.showRewardedAd`
// flips `isAdShowing = true` and then immediately `await`s the SDK call,
// which opens the ad overlay synchronously before the await yields. The
// sync fanout guarantees this orchestrator's `suspendAllAudio()` runs
// inside that same call stack — there is no microtask window where music
// plays under the ad.

import { ref } from 'vue'
import { isAudioPaused, getActiveAudioPauseReasons, onAudioPauseChange } from '@/use/useGamePause'
import { suspendAllAudio, resumeAllAudio, killOneShotSfx } from '@/use/useAssets'
import { isDebug } from '@/use/useMatch'

const TAG = '[pause]'

/** Debug-gated console.info for the pause/resume audit lines. They fire on
 *  every ad / tab-hide / platform pause, so they spam the QA console — gate
 *  them behind `isDebug` (flip with the `cmarc` cheat or
 *  `localStorage.setItem('debug','true')`). */
const dlog = (...args: unknown[]): void => {
  if (isDebug.value) console.info(...args)
}

let installed = false
/** True while THIS orchestrator is holding its single audio-suspend slot. */
let slotHeld = false
let unsubscribe: (() => void) | null = null

/** Apply the current gate state to audio exactly once per edge. Logs the
 *  transition with the reasons that are (or were) active. */
const sync = (paused: boolean): void => {
  if (paused && !slotHeld) {
    slotHeld = true
    suspendAllAudio()
    const reasons = getActiveAudioPauseReasons()
    dlog(
      `${TAG} ⏸ PAUSE  reasons=[${reasons.join(', ') || 'unknown'}]`
      + ' → music + SFX suspended, render loop halted'
    )
  } else if (!paused && slotHeld) {
    slotHeld = false
    resumeAllAudio()
    dlog(
      `${TAG} ▶ RESUME → music + SFX resumed, render loop running`
    )
  }
}

/**
 * Wire the universal pause gate to the audio layer. Idempotent — calling
 * it more than once (main.ts boot + useAds module load) installs a single
 * subscriber. Returns an uninstall function (used by tests).
 *
 * Applies the current gate state immediately on install so a game that
 * boots into a hidden tab starts muted without waiting for a transition.
 */
export const installGamePauseAudio = (): (() => void) => {
  if (installed) return uninstallGamePauseAudio
  installed = true
  // Seed from the live gate so we don't miss a pause that is already
  // asserting at install time (e.g. booted in a backgrounded tab).
  sync(isAudioPaused.value)
  unsubscribe = onAudioPauseChange(sync)
  return uninstallGamePauseAudio
}

/** Tear down the subscriber and release the suspend slot if held. Mainly
 *  for tests — production installs once and never uninstalls. */
export const uninstallGamePauseAudio = (): void => {
  if (!installed) return
  unsubscribe?.()
  unsubscribe = null
  if (slotHeld) {
    slotHeld = false
    resumeAllAudio()
  }
  installed = false
}

// ─── Platform sound-toggle (audio-only, NOT a gameplay pause) ───────────────
//
// Portals expose mute callbacks that ask the game to go silent WITHOUT pausing
// gameplay — GamePix's `soundOff` / `soundOn`, and the CrazyGames toolbar's
// mute toggle (bridged in `useCrazyMuteSync`). This is distinct from the pause
// gate (which freezes the render loop too), so it does NOT go through
// `isGamePaused`. It still drives the SAME ref-counted suspend stack in
// `useAssets`, so this module remains the only audio authority — no second
// driver, no counter drift. Edge-triggered so a duplicated `soundOff` from the
// SDK can't double-suspend and strand the game muted.
//
// **This is a HARD mute, and it outranks the in-game sound settings.** The
// CrazyGames bridge also zeroes the stored volumes so the in-game mute button
// reflects the platform state, but a player who then drags the volume slider
// back up must still hear nothing while the portal says muted — CG QA tests
// exactly that. Zeroed volumes alone can't deliver it, so the guarantee lives
// here instead: the AudioContext is suspended, every tracked HTMLAudio is
// paused, `playSound`/`playLoop` refuse to start (they check
// `isAudioSuspended()`), and `playWithFade` refuses to start the music (it
// watches the ref below).
let platformAudioMuted = false

/** Reactive mirror of the hard platform mute. `useSound.playWithFade` reads it
 *  to refuse a NEW music start — suspending only pauses elements that were
 *  already playing, so without this a `startBattleMusic()` issued while muted
 *  would sound straight through the suspend. */
export const isPlatformAudioMuted = ref(false)

/** Mute / unmute engine audio in response to a portal sound-toggle callback.
 *  Holds its own ref-counted suspend slot, independent of the pause-gate
 *  slot — so an ad that fires BOTH a pause and a soundOff still resumes
 *  correctly once both clear. Idempotent per edge. */
export const setPlatformAudioMuted = (muted: boolean): void => {
  if (muted === platformAudioMuted) return
  platformAudioMuted = muted
  isPlatformAudioMuted.value = muted
  if (muted) {
    suspendAllAudio()
    // Suspending only FREEZES in-flight Web Audio one-shots — they'd thaw and
    // tail on unmute. Kill them so "muted" really means nothing is pending.
    killOneShotSfx()
    dlog(`${TAG} 🔇 platform mute → audio suspended (overrides in-game volume)`)
  } else {
    resumeAllAudio()
    dlog(`${TAG} 🔊 platform unmute → audio resumed`)
  }
}

/** Test-only introspection: is the orchestrator currently holding its
 *  audio-suspend slot? */
export const __isAudioSlotHeld = (): boolean => slotHeld

/** Test-only introspection: is the platform sound-toggle mute active? */
export const __isPlatformAudioMuted = (): boolean => platformAudioMuted
