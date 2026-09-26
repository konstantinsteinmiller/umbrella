// ─── playgamaPlugin no-op stub (non-Playgama builds only) ───────────────────
//
// Replaces `@/utils/playgamaPlugin` on non-Playgama builds via `resolve.alias`
// in `vite.config.ts`. Same mechanism, and the same reason, as
// `yandexPlugin.stub.ts` / `pokiPlugin.stub.ts`.
//
// WHY THIS EXISTS: `platforms/leaderboard.ts` (reached from `useBarrage` on
// every build) and `platforms/playgama` (in the platform registry every build
// imports) STATICALLY import from the real module, so the whole Playgama
// plugin — its Bridge wiring, its "[playgama] …" log lines — shipped inside
// the GameScene chunk of the Poki build (1.1.3). The `isPlaygama` guards do
// not remove it: the obfuscator hoists the literals into its string table
// before esbuild can fold the guards (the unobfuscated twin tree-shakes it
// away, which is why a clear build alone does not show the leak).
//
// Aliasing keeps the plugin — and the dynamic `@playgama/bridge` import behind
// `playgamaBridgeLoader` — out of the bundle, and leaves a valid module for
// the static importers to resolve.
//
// Must match the real module's FULL export surface — every name imported
// anywhere. No Playgama host literal anywhere in this file.

import { ref } from 'vue'
import type { Ref } from 'vue'
import type { SaveStrategy } from '@/utils/save/types'
import type { Bridge } from '@/utils/playgamaBridgeLoader'

export const isPlaygamaSdkActive: Ref<boolean> = ref(false)
export const isPlaygamaAdsBlocked: Ref<boolean> = ref(false)
export const playgamaLocale: Ref<string | null> = ref(null)
export const playgamaDetectedId: Ref<string | null> = ref(null)
export const playgamaLocaleReady: Promise<void> = Promise.resolve()

export const getPlaygamaBridge = (): Bridge | null => null
export const normalizePlaygamaLanguage = (_raw: string): string | null => null
export const __stopPlaygamaLanguageWatch = (): void => {}

export const playgamaPlugin = async (): Promise<void> => {}
export const playgamaLoadingStart = (): void => {}
export const playgamaGameLoadingStop = (): void => {}
export const playgamaGameplayStart = (): void => {}
export const playgamaGameplayStop = (): void => {}
export const playgamaSetLoadingProgress = (_percent: number): void => {}

export const showInterstitialPG = async (): Promise<void> => {}
export const showRewardedPG = async (): Promise<boolean> => false

/** Only `resolveSaveStrategy`'s `VITE_APP_PLAYGAMA` arm calls this, and that
 *  arm never runs on the builds that get this stub. (The message names no
 *  portal: it ships inside every other portal's bundle.) */
export const createPlaygamaSaveStrategy = async (): Promise<SaveStrategy> => {
  throw new Error('portal save strategy is not part of this build')
}
