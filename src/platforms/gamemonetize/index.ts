// ─── GameMonetize platform module ───────────────────────────────────────────
//
// DESCRIPTOR ONLY — like `platforms/poki`. `src/platforms/index.ts` statically
// imports every descriptor to build `ALL_PLATFORMS`, so a re-export here would
// drag the plugin / strategy / provider (and their `gamemonetize` strings and
// SDK URL) into the entry graph of EVERY build. The real consumers reach the
// implementations directly:
//   • `@/utils/gameMonetizePlugin`        — SDK init, ads, pause signal (stub-aliased)
//   • `@/use/ads/GameMonetizeProvider`    — via `resolveAdProvider` (stub-aliased)
//   • `@/utils/save/GameMonetizeStrategy` — via `resolveSaveStrategy`'s dynamic import
//
// GameMonetize is an ad DISTRIBUTION network — the build is embedded across many
// partner sites (and publishers may self-host), so hostname-based site locking
// would block legitimate embeds. The capability resolver therefore renders on
// the build flag alone, with no URL gate (same posture as Playgama).
//
// The SDK (api.gamemonetize.com/sdk.js) has no cloud-save / player-data API, so
// persistence is local-only.

export type { PlatformModule } from '../types'

export const platform = {
  id: 'gamemonetize' as const,
  envFlag: 'GAME_MONETIZE',
  capabilities: {
    hasCloudSave: false,             // no GameMonetize player-data API
    hasAds: true,                    // sdk.showAd / sdk.showBanner
    hostnameMatcher: 'gamemonetize', // informational only — NO site-lock applied
    portalEnforcesAgeGate: false,
    // No child-directed ad flag on any web portal build (owner decision
    // 2026-10-02 — those flags are for Tauri / app-store builds only).
    childDirectedAdSignal: false,
    needsParentOriginCheck: false    // distribution network — no URL gating
  }
}
