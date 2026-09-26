// ─── yandexPlugin no-op stub (non-Yandex builds only) ───────────────────────
//
// Replaces `@/utils/yandexPlugin` on non-Yandex builds via `resolve.alias` in
// `vite.config.ts`. Same mechanism, and the same reason, as
// `pokiPlugin.stub.ts` / `gamepixPlugin.stub.ts`, in the other direction.
//
// WHY THIS EXISTS: `platforms/leaderboard.ts` (reached from `useBarrage` on
// every build) STATICALLY imports `getYandexSdk`, so the real module rode into
// the main chunk of every portal's build — and with it its ad-block bait URLs
// (`an.yandex.ru` / `yandex.ru/ads`). The Poki release gate flagged them as
// unapproved external hosts (1.1.2, 2026-09-26): Poki forbids external
// requests, and a foreign ad network's URL in the bundle is exactly what a
// portal reviewer greps for. The `isYandex` guard at the call site removes the
// CALL, not the module: the obfuscator hoists the literals into its string
// table before esbuild can fold the guard.
//
// Aliasing keeps the URLs out of the bundle AND leaves a valid module for the
// static importers to resolve (no chunk deletion, no 404).
//
// Must match the real module's FULL export surface — every name imported
// anywhere. No Yandex URL literal anywhere in this file.

import { ref } from 'vue'
import type { Ref } from 'vue'
import type { YandexPlayer, YandexSdk } from './yandexPlugin'

export type { YandexPlayer, YandexSdk } from './yandexPlugin'

export const isYandexSdkActive: Ref<boolean> = ref(false)
export const isYandexAdsBlocked: Ref<boolean> = ref(false)
export const yandexLocale: Ref<string | null> = ref(null)

export const yandexPlugin = async (): Promise<void> => {}
export const getYandexPlayer = (): YandexPlayer | null => null
export const getYandexSdk = (): YandexSdk | null => null
export const yandexLoadingReady = (): void => {}
export const yandexGameplayStart = (): void => {}
export const yandexGameplayStop = (): void => {}
export const showRewardedAdYA = async (): Promise<boolean> => false
export const showMidgameAdYA = async (_onImpression?: () => void): Promise<void> => {}

const useYandex = () => ({
  isYandexSdkActive,
  isYandexAdsBlocked,
  yandexLocale,
  yandexPlugin,
  yandexLoadingReady,
  yandexGameplayStart,
  yandexGameplayStop,
  showRewardedAdYA,
  showMidgameAdYA,
  getYandexPlayer,
  getYandexSdk
})

export default useYandex
