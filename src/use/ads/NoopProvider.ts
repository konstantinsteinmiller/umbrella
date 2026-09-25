// Fallback provider for builds without an ad backend (plain web, itch,
// wavedash, glitch, desktop electron, etc.). Every call is inert and
// every readiness ref stays false, which hides ad UI via the v-if gates
// on the ad placements.
import { ref } from 'vue'
import type { AdProvider } from './types'

// ⚠️ DEV-only: `window.__fakeRewarded(true)` shows the rewarded placements and
// "plays" each one as a 1 s grant, so their UI can be checked without an ad
// backend. One flag for every instance (the resolver may build more than one).
// Dead-code-eliminated from every production build.
const fakeRewarded = ref(false)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__fakeRewarded = (on = true): void => { fakeRewarded.value = on }
}

export const createNoopProvider = (): AdProvider => {
  const off = ref(false)
  return {
    name: 'noop',
    isReady: off,
    isRewardedReady: import.meta.env.DEV ? fakeRewarded : off,
    isInterstitialReady: off,
    // No backend → no blocker concept. Always false so the modal never
    // appears in non-ad builds.
    isAdsBlocked: off,
    init: async () => {
    },
    showRewardedAd: async () => {
      if (import.meta.env.DEV && fakeRewarded.value) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return true
      }
      return false
    },
    showMidgameAd: async () => {
    }
  }
}
