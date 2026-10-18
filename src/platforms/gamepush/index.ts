// ─── GamePush platform module ───────────────────────────────────────────────
//
// Barrel + registry descriptor. Heavy implementations stay in
// `@/utils/gamePushPlugin`, `@/utils/save/GamePushStrategy` and
// `@/use/ads/GamePushProvider`.
//
// GamePush is a hub: one archive, uploaded to GamePush Game Hosting, is fanned
// out to many portals (some of which forbid runtime URL gating), so the
// capability resolver renders on the build flag alone — same posture as
// Playgama.

export type { PlatformModule } from '../types'

export { GamePushStrategy } from '@/utils/save/GamePushStrategy'

export {
  gamePushPlugin,
  gamePushGameStart,
  gamePushGameplayStart,
  gamePushGameplayStop,
  showRewardedGP,
  showMidgameGP,
  isGamePushSdkActive,
  isGamePushAdsBlocked,
  gamePushLocale,
  getGamePush
} from '@/utils/gamePushPlugin'

export { createGamePushProvider } from '@/use/ads/GamePushProvider'

export const platform = {
  id: 'gamepush' as const,
  envFlag: 'GAMEPUSH',
  capabilities: {
    hasCloudSave: true,              // gp.player fields + gp.player.sync()
    hasAds: true,                    // gp.ads.showFullscreen / showRewardedVideo
    hostnameMatcher: '',             // NO site-lock: fans out to many portals
    portalEnforcesAgeGate: false,
    childDirectedAdSignal: false,
    needsParentOriginCheck: false
  }
}
