// ─── gameMonetizePlugin no-op stub (non-GameMonetize builds only) ──────────
//
// Replaces `gameMonetizePlugin.ts` on every build that does not target
// GameMonetize, via `resolve.alias` in `vite.config.ts` — the same pattern as
// the Poki / GamePix / Playgama / Yandex plugin stubs. The real module carries
// the SDK URL (`api.gamemonetize.com/sdk.js`) and the ad-block bait hosts, and
// the app shell imports its `isGameMonetizeAdShowing` ref statically, so
// without the alias those strings could ride into another portal's bundle
// (Poki's gate flags unapproved external hosts; Yandex flags foreign service
// URLs). Every export is inert.

import { ref } from 'vue'
import type { SaveStrategy } from '@/utils/save/types'

export const NO_FILL_MS = 6_000
export const AD_OPEN_CAP_MS = 60_000

export const isGmSdkActive = ref(false)
export const isGameMonetizeAdShowing = ref(false)
export const isGmAdsBlocked = ref(false)
export const isGmRewardedFilled = ref(false)
export const isGmAdCoolingDown = ref(false)

export const gameMonetizePlugin = (): Promise<void> => Promise.resolve()
export const createGameMonetizeSaveStrategy = (): SaveStrategy | null => null
export const showRewardedAdGM = (): Promise<boolean> => Promise.resolve(false)
export const showMidgameAdGM = (): Promise<void> => Promise.resolve()
export const preloadRewardedGM = (): void => {}

const useGameMonetize = () => ({
  isGmSdkActive,
  isGameMonetizeAdShowing,
  isGmAdsBlocked,
  isGmRewardedFilled,
  isGmAdCoolingDown,
  gameMonetizePlugin,
  createGameMonetizeSaveStrategy,
  showRewardedAdGM,
  showMidgameAdGM,
  preloadRewardedGM
})

export default useGameMonetize
