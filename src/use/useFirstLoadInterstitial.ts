// First-load interstitial orchestrator. GameMonetize moderation rejects a build
// without it ("Ads should be shown the first time after the game loads"), and
// GamePix QA asks for the same post-load ad. Which builds arm it is decided in
// `adTiming.ts` (`FIRST_LOAD_AD`) and armed from `FLogoProgress` behind static
// `import.meta.env` literals, so every other build DCEs the whole branch.
//
// The fire is gated on TWO signals, and it is a WATCHER, never a one-shot
// readiness sample:
//
//   • Splash gone — flipped from `FLogoProgress` on the same edge as the
//     platform `game_ready` signals. Without it a fast SDK would race the
//     splash and the ad would cover the loading screen.
//   • SDK reports a fillable interstitial — `isInterstitialReady` from
//     `useAds`. A cross-origin ad SDK reports ready only after its own script
//     and ad stack load, which on a real portal is AFTER the splash clears. A
//     placement that samples readiness once at boot loses that race on every
//     real load and shows no ad, ever, with nothing logged — so the watcher
//     waits for the flip instead.
//
// This game boots straight into a live board (no menu, no Play button), so a
// "first PLAY" placement would never be called: this is the ONLY first-ad path,
// on every build that wants one.
//
// Two riders:
//   • The ad interrupts a LIVE run (stage 1 is running behind the splash), so it
//     owes the music a restart: `showMidgameAd` hard-stops it and clears the
//     play intent, and the next natural restart is minutes away. Restart on
//     `.finally()` — a played ad, a no-fill and a thrown SDK alike — through the
//     normal start path, so a portal mute still wins.
//   • It starts the shared interstitial clock (and the break cadence), so the
//     next placement owes the full gap from here.
//
// Fires once per session.
import { watch } from 'vue'
import { isInterstitialReady, showMidgameAd } from '@/use/useAds'
import { noteExternalInterstitial } from '@/use/useBreakInterstitial'
import { markInterstitialShown } from '@/use/adTiming'
import { resumeMusicAfterAd } from '@/use/useSound'

let armed = false
let splashGone = false
let fired = false

const tryFire = (): void => {
  if (!armed || !splashGone || fired) return
  if (!isInterstitialReady.value) return
  fired = true
  markInterstitialShown()
  noteExternalInterstitial()
  showMidgameAd()
    .catch((e) => console.warn('[first-load-ad] failed', e))
    .finally(() => resumeMusicAfterAd())
}

/** Install the SDK-readiness watcher. Idempotent — safe to call from
 *  multiple component setups. Only call on builds that actually need
 *  a first-load interstitial. */
export const armFirstLoadInterstitial = (): void => {
  if (armed) return
  armed = true
  watch(isInterstitialReady, () => tryFire(), { immediate: true })
}

/** Mark the splash as gone. Triggers the fire if the SDK is already
 *  ready; otherwise the watcher set up in `arm()` catches the next
 *  flip. */
export const notifySplashGone = (): void => {
  if (splashGone) return
  splashGone = true
  tryFire()
}

/** Test-only: reset the session latches. */
export const __resetFirstLoadInterstitial = (): void => {
  armed = false
  splashGone = false
  fired = false
}
