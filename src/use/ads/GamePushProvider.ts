// GamePush ad provider — wraps the lazy-loaded `gamePushPlugin` in the
// cross-platform `AdProvider` surface consumed by `useAds`.
//
// Static imports (not dynamic): the obfuscator rewrites literal '@/...'
// specifiers inside dynamic imports. The `resolveAdProvider` arm gates on
// `import.meta.env.VITE_APP_GAMEPUSH === 'true'`, so other builds drop this.
//
// Readiness model: GamePush exposes `gp.ads.isRewardedAvailable` /
// `isFullscreenAvailable` (re-read by the plugin on every ad event + a poll),
// so the rewarded gate reflects REAL inventory — a "watch ad" button is only
// offered when the SDK says a video can play.
//
// `managesMidgameAudio`: the plugin reports the interstitial's real open via
// `fullscreen:start`; `useAds` still kills audio up front (the mute
// guarantee), the callback is the second, truthful edge.
//
// No `ownsAdBlockUi`: GamePush shows no ad-blocker notice of its own here, so
// the shared in-game `AdsBlockedModal` explains a refused rewarded tap.

import { computed } from 'vue'
import {
  gamePushPlugin,
  isGamePushSdkActive,
  isGamePushAdsBlocked,
  isGamePushRewardedAvailable,
  isGamePushFullscreenAvailable,
  showMidgameGP,
  showRewardedGP
} from '@/utils/gamePushPlugin'
import type { AdProvider } from './types'

export const createGamePushProvider = (): AdProvider => {
  const isReady = computed(() => isGamePushSdkActive.value)
  const isRewardedReady = computed(
    () => isGamePushSdkActive.value && isGamePushRewardedAvailable.value
  )
  const isInterstitialReady = computed(
    () => isGamePushSdkActive.value && isGamePushFullscreenAvailable.value
  )
  return {
    name: 'gamepush',
    isReady,
    isRewardedReady,
    isInterstitialReady,
    isAdsBlocked: isGamePushAdsBlocked,
    managesMidgameAudio: true,
    init: async () => {
      try {
        await gamePushPlugin()
      } catch (e) {
        console.warn('[ads/gamepush] plugin init failed', e)
      }
    },
    showRewardedAd: () => showRewardedGP(),
    showMidgameAd: (onImpression) => showMidgameGP(onImpression)
  }
}
