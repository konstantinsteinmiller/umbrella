/**
 * ─── Elemental Barrage — preview-video configuration ───────────────────────────
 *
 *   pnpm preview:video                          # the CrazyGames set (4 clips)
 *   pnpm preview:video --scenarios success      # one scenario, both orientations
 *   pnpm preview:video --no-clean               # with the interface on
 *   pnpm preview:video --only-setup             # stop on the opening frame
 *   pnpm preview:video --help
 *
 * Output — one folder per quality, each a complete, uniformly named set:
 *   preview-videos/<quality>/<scenario>-crazygames-<orientation>-<W>x<H>.mp4 (+ .png poster)
 */

export default {
  // The port-ownership check: the served <title> must contain this.
  title: 'elemental-barrage',

  // The DEV server, not a production build: the scenarios import the game's own
  // modules by URL (`/src/barrage/...`) and `?clean=1` (src/game/cleanFeed.ts) is
  // `import.meta.env.DEV` only. 2096 is the pipeline's own — 2050 is `pnpm dev`.
  server: {
    mode: 'dev',
    port: 2096,
    command: 'pnpm',
    args: ['exec', 'vite', '--port', '{port}', '--strictPort'],
    // Its own dependency pre-bundle (vite.config.ts `cacheDir`): a second vite
    // on the shared cache re-bundles it under the `pnpm dev` already running.
    env: { VITE_CACHE_DIR: 'node_modules/.vite-preview' },
    hotReload: false
  },

  // ── The deliverable ──
  //
  // CrazyGames (docs.crazygames.com/requirements/game-covers, checked
  // 2026-10-04): preview video 15-20 s, ≤ 50 MB, no sound, landscape 16:9 AND
  // portrait 2:3 at 1080p, no logos / promotional text / cursor / black bars.
  // Portrait is recorded 9:16 (1080x1920) by user decision 2026-10-04, not CG's
  // documented 2:3 — a native 9:16 viewport, never a pad or crop.
  //
  // Output PIXELS; the game lays out for width/dpr x height/dpr CSS px. The board
  // canvas caps its backing store at dpr 2 (BarrageBoard.vue), so nothing here
  // goes above 2: portrait is a 540x960 phone, landscape a 960x540 laptop.
  formats: {
    crazygames: {
      durationMs: 16_000,
      orientations: {
        landscape: { width: 1920, height: 1080, dpr: 2, isMobile: false, hasTouch: false },
        portrait: { width: 1080, height: 1920, dpr: 2, isMobile: true, hasTouch: true }
      }
    }
  },

  scenarios: ['success', 'fail'],

  fps: 30,
  //   lossless — the master (archive; Safari/QuickTime will not play 4:4:4)
  //   high     — CRF 14 yuv420p: the upload, if it fits CrazyGames' 50 MB
  //   balanced — CRF 20 yuv420p: the upload when `high` breaks the cap
  quality: ['lossless', 'high', 'balanced'],
  outDir: 'preview-videos',
  capture: 'virtual',
  seedRandom: 7,

  // ── Pure gameplay ──
  //
  // `?clean=1` drops the HUD rows from the scene itself (top bar, side columns,
  // bottom panel, the words over the board, the coach), so the board centres in
  // the frame. What is left floats over it and is teleported to <body>: modals,
  // the death screen's "WASTED" band, the tier reveal. The backdrop is DOM
  // background, so this is a `hide` list, not a `keep` list.
  //
  // Canvas text stays ON: the board's numbers (monster HP, the ball count) are
  // baked once into glyph atlases with fillText (render/glyphs.ts) — turning
  // fillText off leaves blank HP plates. They are the game's pieces, not
  // promotional text; the canvas draws no words.
  clean: {
    enabled: true,
    keep: [],
    hide: [
      'body > *:not(#app):not(.death-fx)', // modals, tier reveal, tips, the splash
      '.death-fx__band' //                    "WASTED" (its colour-drain stays)
    ],
    suppressCanvasText: false,
    urlParams: { clean: '1' }
  },

  urlParams: {},

  async onPageReady() { /* the scenarios boot themselves via _drive.boot */ }
}
