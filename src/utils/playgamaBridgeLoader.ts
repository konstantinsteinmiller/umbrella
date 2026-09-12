// ─── Playgama Bridge v2 loader ─────────────────────────────────────────────
//
// The ONE place `@playgama/bridge` enters the module graph. It exists as its
// own ~30-line file for two structural reasons:
//
// 1. THE IMPORT MUST BE BUILD-GATED. The Bridge npm package is a ~286 KB
//    single-file bundle with a module-level singleton — Rollup cannot prove it
//    side-effect-free, so anything that reaches it from a shared module would
//    ship the whole Bridge to CrazyGames, GameDistribution, itch, GamePix,
//    Yandex and Poki.
//
//    A plain `if (isPlaygama) await import(...)` is NOT enough: Rollup still
//    emits the chunk because the syntactic dynamic import survives. The
//    `import.meta.env`-literal TERNARY below is what makes the whole call
//    disappear on other builds — Vite substitutes the literal at parse time
//    and the dead arm (with its `import()`) is eliminated.
//
// 2. OBFUSCATOR CONSTRAINT. `vite-plugin-javascript-obfuscator`'s
//    `stringArray` transform rewrites the specifier inside `import('...')`
//    into an array lookup Vite can no longer resolve at runtime. Files holding
//    a dynamic import must sit on the obfuscator's exclude list in
//    `vite.config.ts` — keeping the import here means only this leaf file
//    loses obfuscation, not the ~500-line plugin with the actual logic.
//
// Why npm rather than the CDN `<script>` tag this project used until the v2
// migration: the `build:playgama` archive is ALSO the YouTube Playables
// submission (Playgama is an official Playables partner and distributes the
// one ZIP), and Playables forbids external server calls. The CDN build cannot
// satisfy that — it is a webpack bundle with
// `publicPath = "https://bridge.playgama.com/v1/stable/"`, so it fetches its
// per-platform adapter chunks at runtime and posts to `api.playgama.com`. The
// npm build is one self-contained file with no chunk loading at all.

// The package's DEFAULT export is the singleton INSTANCE (a value); the class
// type is exported separately as `PlaygamaBridge`.
import type { PlaygamaBridge } from '@playgama/bridge'

export type Bridge = PlaygamaBridge

/**
 * Resolve the Bridge singleton, or `null` on a build that is not targeting
 * Playgama. Never throws — a failed import degrades to "no SDK" and the game
 * runs local-only rather than dying on the splash.
 */
export const loadPlaygamaBridge: () => Promise<Bridge | null> =
  import.meta.env.VITE_APP_PLAYGAMA === 'true'
    ? async () => {
      try {
        const mod = await import('@playgama/bridge')
        return mod.default ?? null
      } catch (e) {
        console.warn('[playgama] Bridge module failed to load', e)
        return null
      }
    }
    : async () => null
