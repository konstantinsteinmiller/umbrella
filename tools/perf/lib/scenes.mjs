// ─── Benchmark scenes for tools/perf/perf-ab.mjs ─────────────────────────────
//
// A scene runs the REAL game scene (GameScene: DOM HUD, coach, CSS, particles,
// the board) of a built bundle, driven by the same tap at the same board point
// every `tapEveryMs`. The engine is fixed-step, the run seed comes from the
// seeded Math.random, and a tap only fires in the aim phase, so every rep fires
// the same angle on the same turns: two reps play the same run.
//
//   early — a first session from an empty save: rows 1–10+, the FTUE script,
//           the coach and the tutorial live (the minute a Player Fit tester
//           sees). Checked 2026-09-27 on the Poki build: row 7 at ~20 s, the
//           first boss (row 10) by ~30 s.
//
// A `busy` (40-ball volley) scene needs a seeded veteran save: `save: () => blob`
// (the object stored under `umbrella_state`). Not built yet.

export const SCENES = {
  early: {
    save: null,
    tapEveryMs: 800,
    settleMs: 1500,
    warmMs: 6000,
    ms: 40000,
    // Up-right of the launcher: a point-at shot that ricochets off the right wall.
    tap: { fx: 0.66, fy: 0.42 }
  }
}
