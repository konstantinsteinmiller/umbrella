import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// Stub for the `virtual:campaign-overrides` module that the production
// build provides via the `mawCampaignOverridesPlugin` in vite.config.ts.
// Tests don't run through that plugin, so any module that statically
// imports the virtual id (e.g. `useCustomStages.ts`) blows up at resolve
// time. This minimal plugin returns an empty overrides object — tests
// don't need real editor overrides.
const stubCampaignOverridesPlugin = () => ({
  name: 'stub-campaign-overrides',
  resolveId(id: string) {
    if (id === 'virtual:campaign-overrides') return '\0virtual:campaign-overrides'
    return null
  },
  load(id: string) {
    if (id === '\0virtual:campaign-overrides') return 'export default {}'
    return null
  }
})

// Same story for `virtual:public-override-manifest`, which the
// `publicOverrideManifestPlugin` in vite.config.ts generates by scanning
// `public/`. `usePublicManifest.ts` imports it statically, and it sits deep in
// the useSound / useArtOverrides graph — so without this stub every test that
// touches audio or ads (useAdsPause, useAdsThrottle, interstitialAudioKill)
// died at resolve time instead of running. An empty manifest is the right test
// default: "no drop-in override assets present", i.e. everything falls back to
// the built-in art / placeholder SFX.
const stubPublicManifestPlugin = () => ({
  name: 'stub-public-override-manifest',
  resolveId(id: string) {
    if (id === 'virtual:public-override-manifest') return '\0virtual:public-override-manifest'
    return null
  },
  load(id: string) {
    if (id === '\0virtual:public-override-manifest') return 'export default []'
    return null
  }
})

// Same story for `virtual:leaderboard-snapshot`, which `leaderboardSnapshot.ts`
// imports statically. Stubbed to `null` — "no baked board" — so the leaderboard
// suites assert the real "no endpoint, no leaderboard" contract by default; the
// specs that need a baked board mock `@/use/leaderboardSnapshot` itself, which
// is why that module exists as a thin re-export of the virtual id.
const stubLeaderboardSnapshotPlugin = () => ({
  name: 'stub-leaderboard-snapshot',
  resolveId(id: string) {
    if (id === 'virtual:leaderboard-snapshot') return '\0virtual:leaderboard-snapshot'
    return null
  },
  load(id: string) {
    if (id === '\0virtual:leaderboard-snapshot') return 'export default null'
    return null
  }
})

export default defineConfig({
  plugins: [vue(), stubCampaignOverridesPlugin(), stubPublicManifestPlugin(), stubLeaderboardSnapshotPlugin()],
  // Vite's production config (`vite.config.ts`) injects `APP_VERSION` at
  // build time via `define`. Vitest doesn't run that plugin, so any
  // module that reads `APP_VERSION` at import time (e.g. `useUser.ts`)
  // throws ReferenceError under tests. Mirror the define here so test
  // imports of those modules don't trip on a missing global.
  define: {
    APP_VERSION: JSON.stringify('test')
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/save/setup.ts'],
    // 15 s, not the 5 s default. Many suites `await import('@/use/useBattle')`
    // inside their FIRST case, and that graph (battle engine, sound, art,
    // platform layer) takes several seconds to transform while ~60 files load
    // in parallel — so the first case of those files timed out at random on a
    // full run while passing every time alone. Real hangs still fail.
    testTimeout: 15_000,
    // tests/e2e runs under Playwright + a real Vite dev server (Node env,
    // not jsdom). Excluded from the default suite so `pnpm test` stays
    // fast; run them with `pnpm test:e2e`.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**']
  }
})