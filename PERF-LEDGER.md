# Performance ledger — Elemental Barrage

Every performance experiment run on this project, **including the ones that did
nothing**. Null results stop the same idea being re-tried blind. Written by the
`web-game-performance-optimize` skill. Newest first; never delete a row.

## Budget

| | |
|---|---|
| Target device profile | mid-range Android / Chrome — desktop proxy: 4× CPU throttle, 412×915, DPR 2, headless Chrome |
| Target | 60 fps → 16.7 ms/frame |
| Primary metric | p95 work-per-frame (ms): `BoardRenderer.stats.frameMs` (renderer update + draw), sampled every rAF |
| Benchmark scenario | `/#/barrage-lab?scene=stress&auto=1&clean=1` (~40 balls airborne over ~50 high-HP monsters, auto-fire), 8 s warmup + 30 s measured |

---

## Experiments

### 2026-10-01 pc-idle — the particle canvas cleared once when idle, not every frame (T0.3)   [REVERTED — grey / unproven]

- Request:     retention-roadmap T0.3: Poki Player Fit reported a median of 40 fps (v1.2.3). Measure first and fix only the top offender.
- Attribution: a trace of the BUILT Poki bundle (`tools/perf/perf-ab.mjs --scene early --trace-ms 15000`, 4× CPU, 412×915, DPR 2, `--disable-gpu`). Main-thread self time per frame:

  | Cost | ms per frame |
  |---|---|
  | `LayerTreeHost::DoUpdateLayers` | 5.81 |
  | `FunctionCall` (game script) | 1.75 |
  | `Canvas2DResourceProvider::ProduceCanvasResource` | 1.26 |
  | `Document::recalcStyle` | 0.81 |

  Layer updates and canvas resource production dominate script. Suspect: two full-window canvases re-uploaded every frame. `ParticleCanvas` runs a full-window `clearRect` on every idle rAF (its comment says "clear once", but nothing records it).
- Hypothesis:  clearing the idle particle canvas once, not every frame, cuts p95 work per frame by ≥ 10 %. Cost: one module flag and one boolean.
- Setup:       `?perf.pcIdle=clear|once` (boot-frozen), interleaved A/B ×5, built Poki bundle, Poki SDK stubbed, seed 7, the `early` scene (a first session: rows 1–10+, the FTUE, the coach).
- Result:      p95 work per frame, median of reps.
  - Run 1, under another session's video encode: A 297.5 → B 301.6 ms (+1.4 %); A's spread ±89 %.
  - Run 2, started on an idle budget, then other sessions started: A 286.8 → B 276.1 ms (−3.7 %); spread ±77 %.
  - Both runs: about 8 fps in BOTH arms. A trace run of the same scene earlier that afternoon drew about 70 frames/s. The machine was saturated by other sessions throughout.
- Verdict:     REVERT — grey (−3.7 %) inside a ±77 % noise floor, and the change adds a flag rather than removing complexity.
- Follow-up:
  - The attribution stands: layer/raster upload, not game script, is the top main-thread cost on the desktop proxy.
  - Re-open on a real phone (Android `chrome://inspect` Performance trace) or a quiet machine. The two candidates are this one and the board's full redraw during idle aim phases (`BarrageBoard.vue` loop).
  - The next Player Fit's `diag / rec_stage` Events row (below) says whether the recording stage's 30 fps repaint was even running during that test.

### 2026-10-01 rec-stage diag — is the Poki recording stage live during Player Fit? (T0.3 step 1)   [SHIPPED — instrumentation]

- `utils/pokiPlaytestStage.ts` repaints a hidden stage canvas at 30 fps, but only after the recorder calls `captureStream`. Poki's docs say Player Fit tests are not recorded.
- The first `captureStream` now sends one `pokiMeasure('diag', 'rec_stage', start + complete)` (the T0.1 contract). If the next Player Fit's Events table shows a `diag / rec_stage` row, the stage ran during that test and its repaint is a cost to measure. If there is no row, it is ruled out.

### 2026-09-24 bg-layer — the board backdrop on its own canvas, redrawn only when it changes   [REVERTED — unproven]
- Request:     "move the background images that don't need a redraw to a background layer (only redraw on
               resize) and the buttons to a DOM HUD layer".
- Audit:       The HUD is already DOM — the top bar (teleported), the side column, the upgrade bar, the tray
               and every word over the board (`BarrageBoard.vue`: "draws numbers only"). The board canvas
               draws no buttons; its only static content is the backdrop, pre-baked once per resize /
               depth band (`bakeBackdrop`) and blitted with ONE full-canvas `drawImage` per frame.
- Hypothesis:  a second `<canvas>` behind the board canvas holding the backdrop (redrawn on resize, band
               swap and during the swap's crossfade only; the board canvas `clearRect`s instead of
               blitting) cuts p95 work/frame by ≥ 5 %. Cost: +1 composited layer, +~40 LOC, and a visual
               change — 13 `'lighter'` (additive) draws on the board canvas stop adding light onto the
               stones and alpha-cover them instead.
- Setup:       interleaved A/B, 5 reps each, flag `?perf.bgLayer=on|off` (boot-frozen), dev server (the lab
               route is dev-only), fresh Chrome profile per rep.
- Result:      p95 work/frame, per rep (ms) — A off: 22.7 · 12.0 · 31.4 · 48.6 · 23.1 (median 23.1,
               spread ±18.3 = ±80 %); B on: 12.9 · 17.5 · 33.3 · 24.1 · (last rep captured no frames).
               Adjacent pairs B − A: −9.8 · +5.5 · +1.9 · −24.5 ms — both signs. An earlier aborted run:
               A 11.2 → B 8.4 on its first pair. The machine was under outside load (frame p95 up to 99 ms)
               and the dev server full-reloaded the page 3× mid-run (another session editing the repo).
- Verdict:     REVERT — no effect above a ±80 % noise floor; the change also alters the look of every
               additive effect. The blit is a single GPU `drawImage`; its main-thread cost is small in
               principle, and its fill-rate cost only shows on a real device.
- Follow-up:   Re-open only with a real-phone measurement (Android `chrome://inspect` Performance trace,
               GPU raster time per frame) on a quiet machine / built bundle. If it wins there, solve the
               additive-blend look first (e.g. keep the glows on the board canvas and move only non-additive
               layers, or accept and review the look with the art).

## Standing conclusions for this project

- The HUD / buttons are DOM already; the board canvas draws numbers only. Nothing to move out of it.
- Backdrop split — unproven on desktop proxy (±80 % noise); needs a real device before it is re-tried.
