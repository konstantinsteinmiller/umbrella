/**
 * ─── Elemental Barrage — preview-video configuration ───────────────────────────
 *
 *   pnpm preview:video                          # every format, every scenario
 *   pnpm preview:video --formats 30s            # the 30 s 1080p pair only
 *   pnpm preview:video --scenarios success      # one scenario, every format
 *   pnpm preview:video --no-clean               # with the interface on
 *   pnpm preview:video --only-setup             # stop on the opening frame
 *                                               #   (the scenario-authoring loop)
 *   pnpm preview:video --help
 *
 * Output — one folder per quality, each a complete, uniformly named set:
 *   preview-videos/lossless/<scenario>-<format>-<orientation>-<W>x<H>.mp4 (+ .png poster)
 *   preview-videos/high/…     the same clips as upload-ready H.264 4:2:0
 */

export default {
  // The port-ownership check: the served <title> must contain this.
  title: 'elemental-barrage',

  // The DEV server, not a production build: `window.__video` (src/dev/videoSeam.ts),
  // `__arenaCast`, `__skills` and the `?clean=1` flag are all `import.meta.env.DEV`
  // only. 2096 is the pipeline's own — 2050 is `pnpm dev`, and the neighbours
  // (2051, 2063, 2071, 2077) belong to other projects' servers.
  server: {
    mode: 'dev',
    port: 2096,
    command: 'pnpm',
    args: ['exec', 'vite', '--port', '{port}', '--strictPort'],
    // Its own dependency pre-bundle (vite.config.ts `cacheDir`): a second vite
    // on the shared cache re-bundles it under the `pnpm dev` already running.
    env: { VITE_CACHE_DIR: 'node_modules/.vite-preview' },
    // The recording page never hears HMR: paintings land in public/images/units
    // while other sessions run the art pipeline, and a reload mid-take kills it.
    hotReload: false
  },

  // ── The deliverables ──
  //
  // Output PIXELS; the game lays out for width/dpr x height/dpr CSS px. The one
  // canvas (ParticleCanvas) caps its backing store at dpr 2, so nothing here
  // goes above 2 — past it the sparks would be upscaled while the units stay
  // sharp. Every ratio divides its output exactly.
  //
  // Both landscapes lay out at 1024x576 CSS: the arena gets 60 % of the width
  // (the clean feed caps the grid column at 40 %) and units reach their 58 px
  // cap. Narrower, the grid's 420 px square takes over half the frame.
  formats: {
    '10s': {
      durationMs: 10_000,
      orientations: {
        portrait: { width: 720, height: 1280, dpr: 2, isMobile: true, hasTouch: true },
        landscape: { width: 1280, height: 720, dpr: 1.25, isMobile: false, hasTouch: false }
      }
    },
    // MP4 · H.264 · 30 s · 1920x1080 and 1080x1920. A 30-second clip is a
    // different STORY, not a longer one — it plays its own beat sheets.
    '30s': {
      durationMs: 30_000,
      orientations: {
        portrait: { width: 1080, height: 1920, dpr: 2, isMobile: true, hasTouch: true },
        landscape: { width: 1920, height: 1080, dpr: 1.875, isMobile: false, hasTouch: false }
      },
      scenarios: { success: 'success-30s', fail: 'fail-30s' }
    }
  },

  scenarios: ['success', 'fail'],

  fps: 30,
  //   lossless — `-qp 0 -pix_fmt yuv444p`: the master. Big, and Safari and
  //              QuickTime will not play 4:4:4.
  //   high     — CRF 14, yuv420p, High profile: the "MP4 · H.264" upload.
  quality: ['lossless', 'high'],
  outDir: 'preview-videos',
  capture: 'virtual',
  seedRandom: 7,

  // ── Pure gameplay ──
  //
  // The game is DOM, not a canvas, so there is no `keep` list — instead the
  // playfield stays and the interface over it is listed below. Two levers:
  //   1. `?clean=1` (src/game/cleanFeed.ts) drops the HUD rows that shape the
  //      layout — top bar, upgrade row, utility stacks, spawn row — and the
  //      arena and the merge grid grow into the frame;
  //   2. `hide` covers what floats OVER the playfield. Visibility, so no box
  //      moves mid-take.
  // The painted unit/boss/gate art carries no text (checked frame by frame at
  // 2x zoom, see SKILL.md 4.1) — re-check whenever new paintings land.
  clean: {
    enabled: true,
    keep: [],
    hide: [
      '.tier-badge', '.tier-badge-svg', // the tier number on every unit (bitmap / drawn)
      '.hpbar', '.gate-hpbar', //         unit HP bars, the gate's HP bar
      '.arena-top-strip', //              boss name + HP bar, the global-rank badge
      '.dmg-num', //                      damage numbers
      '.spell-row', //                    the spell buttons
      '.wave-banner', '.wave-countdown', // WAVE CLEARED / next-wave countdown
      '.spell-toast', '.mutator-chip', '.combo-pop',
      '.fever-overlay', //                FEVER mode: its label and the warm wash that
      //                                  sits over the whole arena for as long as it lasts
      '.overrun-overlay > *', //          OVERRUN copy + RALLY button (the red wash stays)
      '.deploy-glow', //                  the dashed drop-zone frame + hint shown during any drag
      '.trf-label', //                    the new-tier reveal's NEW UNIT / name / tier
      '.chest-fly', '.boss-chip', '.ach-toast'
    ],
    suppressCanvasText: true,
    urlParams: { clean: '1' },
    // …and FEVER's hue shift on the ground, the other half of that wash.
    css: '.fever-on .arena-ground { filter: none !important; }'
  },

  urlParams: {},

  async onPageReady() { /* the scenarios boot themselves via _drive.boot */ }
}
