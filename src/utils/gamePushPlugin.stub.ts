// ─── gamePushPlugin no-op stub (non-GamePush builds only) ───────────────────
//
// Replaces `@/utils/gamePushPlugin` on non-GamePush builds via `resolve.alias`
// in `vite.config.ts`. Same mechanism and reason as `yandexPlugin.stub.ts`:
// `platforms/gamepush` and the strategy/provider import the real module
// statically, so without the alias its SDK loader URL would ride into every
// other portal's bundle (the Poki release gate flags foreign hosts).
//
// Must match the real module's FULL export surface. No GamePush URL literal.

import { ref } from 'vue'
import type { Ref } from 'vue'
import type { GamePushSdk } from './gamePushPlugin'

export type { GamePushSdk, GamePushPlayer } from './gamePushPlugin'

export const isGamePushSdkActive: Ref<boolean> = ref(false)
export const isGamePushAdsBlocked: Ref<boolean> = ref(false)
export const isGamePushRewardedAvailable: Ref<boolean> = ref(false)
export const isGamePushFullscreenAvailable: Ref<boolean> = ref(false)
export const gamePushLocale: Ref<string | null> = ref(null)

export const buildGamePushSrc = (_projectId?: string, _publicToken?: string): string | null => null
export const gamePushPlugin = async (): Promise<void> => {}
export const getGamePush = (): GamePushSdk | null => null
export const gamePushGameStart = (): void => {}
export const gamePushGameplayStart = (): void => {}
export const gamePushGameplayStop = (): void => {}
export const showRewardedGP = async (): Promise<boolean> => false
export const showMidgameGP = async (_onImpression?: () => void): Promise<void> => {}

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
