// ─── GamePushProvider no-op stub (non-GamePush builds only) ─────────────────
//
// Replaces `GamePushProvider.ts` on builds that do not target GamePush via a
// `resolve.alias` in `vite.config.ts`. `createGamePushProvider` is statically
// imported by `resolveAdProvider`, so its `name: 'gamepush'` literal and the
// plugin import would otherwise ship in every portal's bundle.

import { ref } from 'vue'
import type { AdProvider } from './types'

const inertRef = ref(false)

export const createGamePushProvider = (): AdProvider => ({
  name: '',
  isReady: inertRef,
  isRewardedReady: inertRef,
  isInterstitialReady: inertRef,
  isAdsBlocked: inertRef,
  init: async () => {},
  showRewardedAd: async () => false,
  showMidgameAd: async () => {}
})
