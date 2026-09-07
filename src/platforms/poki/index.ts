// ─── Poki platform module ───────────────────────────────────────────────────
//
// DESCRIPTOR ONLY — deliberately unlike its sibling barrels.
//
// Every other `src/platforms/<name>/index.ts` re-exports its plugin / strategy /
// provider as a convenience surface. That is safe-ish for them because their
// modules are already aliased to stubs per build. Poki is not going to join
// that pattern: `src/platforms/index.ts` STATICALLY imports every descriptor to
// build `ALL_PLATFORMS`, so a re-export here drags `PokiStrategy` (and its
// `name = 'poki'` literal) into the entry graph of EVERY build — the exact
// "foreign identifier string in the submitted bundle" that Yandex moderation
// rejects as "Service storage URL detected", arriving by a different road than
// the one `resolve.alias` closes.
//
// Nothing imports Poki through this barrel. The real consumers reach the
// implementations directly:
//   • `@/utils/pokiPlugin`        — bracket, ads, measure, errors (stub-aliased)
//   • `@/use/ads/PokiProvider`    — via `resolveAdProvider` (stub-aliased)
//   • `@/utils/save/PokiStrategy` — via `resolveSaveStrategy`'s dynamic import
//
// Poki is a closed portal, but the build must ALSO run in the Poki Inspector
// (inspector.poki.dev) and in P4D Preview as well as on `*.poki-gdn.com`, so the
// capability resolver renders on the build flag alone — no hostname gate, same
// posture as Playgama / GameMonetize / Yandex.

export type { PlatformModule } from '../types'

export const platform = {
  id: 'poki' as const,
  envFlag: 'POKI',
  capabilities: {
    // No cloud-save API. Poki's wrapper mirrors localStorage + IndexedDB for
    // logged-in players with no game code involved — see PokiStrategy for the
    // three rules that come with that (1 MB gzip cap, reserved `poki_` prefix,
    // incognito try/catch).
    hasCloudSave: false,
    hasAds: true,
    // Deliberately empty: NO hostname gate — see the header.
    hostnameMatcher: '',
    portalEnforcesAgeGate: false,
    // Poki Kids (`?tag=kids`) is handled inside the SDK itself: the ad core is
    // never loaded and every call auto-resolves. Nothing for the game to signal.
    childDirectedAdSignal: false,
    needsParentOriginCheck: false
  }
}
