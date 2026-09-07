// Poki ad provider — wraps `pokiPlugin` in the cross-platform `AdProvider`
// surface consumed by `useAds`.
//
// Imports are STATIC, like `GamepixProvider` / `GameMonetizeProvider` and unlike
// the GameDistribution / Playgama providers, which lazy-load their (much larger)
// plugins via `await import('@/…')` and each need an obfuscator-exclude entry
// because `stringArray` mangles the literal into a "Failed to resolve module
// specifier" at runtime. `pokiPlugin` is small and side-effect-free at module
// scope, so a static import avoids that whole class of bug.
//
// Static imports are ONLY safe here because of the `resolve.alias` STUB SWAP in
// `vite.config.ts`: on non-Poki builds both this file and `@/utils/pokiPlugin`
// resolve to `.stub.ts` no-ops. Do not remove it on the theory that the
// env-literal gate in `resolveAdProvider` is enough — it is not.
// `resolveAdProvider` statically imports every provider, so each provider's
// function BODY (with its `name: 'poki'` literal) lives in every bundle; and
// worse, the obfuscator's `stringArray` pass hoists string literals into its
// indirection table BEFORE esbuild folds `import.meta.env.VITE_APP_POKI ===
// 'true'` to `false`, so the SDK URL would survive dead-code elimination —
// precisely the kind of foreign-host string Yandex moderation rejects as
// "Service storage URL detected".
//
// Three Poki-specific deviations from the other providers:
//
//   • `isRewardedReady` hangs off `isPokiSdkActive` — "init has settled" — not
//     off a coarse "provider exists" flag. The PokiSDK loader shim queues `init`
//     and `commercialBreak` for replay once the real core lands, but its
//     `rewardedBreak` is a literal `() => Promise.resolve(false)`. A rewarded
//     button live during those first few hundred ms silently refuses the reward,
//     with no ad and no error. The gate is what keeps it off screen.
//
//   • `managesMidgameAudio: true`. Poki's `commercialBreak(onStart)` invokes
//     `onStart` ONLY when a video ad genuinely opens — "not every
//     commercialBreak() triggers an ad". Killing audio up front would cut the
//     win/lose stinger for an ad the player never saw. `useAds` passes its
//     `killAudioForAd` in as `onImpression` and the plugin fires it on the real
//     edge. Same posture as Yandex, opposite of GamePix.
//
//   • `tryInstantGrant` — the PLAYTEST build's free rewarded grants
//     (`VITE_APP_POKI_FREE_REWARDS`). `useAds` consults it before it kills the
//     music and raises the pause gate, so a reward that shows no video also
//     runs none of the ad-audio ceremony. Folds to a permanently-false branch on
//     the production build, where the env var is unset.
//
// No `ownsAdBlockUi`, and `isAdsBlocked` is a constant `false`: `isAdBlocked()`
// is hardcoded `() => false` in the shipped v2 core, so there is no signal that
// could drive the shared AdsBlockedModal without also firing it on legitimate
// no-fills. Poki does not ban such a modal (that's the CrazyGames case, where
// the SDK shows its own and ours would stack) — it is simply undetectable. The
// binding rule is Poki's hard requirement that the game stay fully playable with
// a blocker active, which is verified by playing the build, not by a flag.

import { computed } from 'vue'
import {
  pokiPlugin,
  isPokiSdkActive,
  isPokiAdsBlocked,
  pokiHasFreeRewarded,
  pokiTryFreeRewardedGrant,
  showMidgameAdPoki,
  showRewardedAdPoki
} from '@/utils/pokiPlugin'
import type { AdProvider } from './types'

export const createPokiProvider = (): AdProvider => {
  const isReady = computed(() => isPokiSdkActive.value)

  return {
    name: 'poki',
    isReady,
    // Poki exposes no per-format fill query. An unfilled break simply resolves
    // (interstitial) or resolves `false` (rewarded), so both formats are
    // "ready" exactly when the core SDK has initialised.
    //
    // The free-grant OR is what makes the playtest build's first two reward
    // taps available immediately, before the ~325 KB core has landed — a
    // playtest session is short and a button that is hidden for its first
    // second reads as "no reward here".
    isRewardedReady: computed(() => isPokiSdkActive.value || pokiHasFreeRewarded.value),
    isInterstitialReady: isReady,
    isAdsBlocked: isPokiAdsBlocked,
    managesMidgameAudio: true,
    tryInstantGrant: () => pokiTryFreeRewardedGrant(),
    init: async () => {
      try {
        await pokiPlugin()
      } catch (e) {
        console.warn('[ads/poki] plugin init failed', e)
      }
    },
    showRewardedAd: () => showRewardedAdPoki('small'),
    showMidgameAd: (onImpression?: () => void) => showMidgameAdPoki(onImpression)
  }
}
