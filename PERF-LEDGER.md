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
