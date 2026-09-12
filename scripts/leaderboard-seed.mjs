/**
 * ─── The seeded board, for the builds that can never gain a player ──────────
 *
 * Poki forbids every external runtime request, Yandex rejects third-party
 * storage URLs at moderation, and the Playgama archive is also the YouTube
 * Playables submission, which allows no external server calls. Those builds
 * ship `VITE_LEADERBOARD_URL` empty: they cannot READ the live board and, more
 * to the point, they can never WRITE to it. Their baked copy is not a stale
 * snapshot of a living board — it is the whole board, for the life of the
 * build, and nobody playing it will ever appear on it.
 *
 * Seeding it from the live board would not work either: a live board is a
 * record of everyone who ever opened the game once — a survivorship sample,
 * frozen with whatever skew it had on build day. So this generates the board
 * from a stated RETENTION CURVE instead. It is modelled data, and it says so in
 * the file it writes (`source: 'seeded:retention-curve'`).
 *
 * NO NAMES. This game shows the player a rank and a population — "#1,130 of
 * 15,876" — and never a list, so the seeded board publishes no rows at all.
 * Nobody invented is ever shown as a real player.
 *
 * ── Determinism is the point ──
 *
 * There is no randomness in here at all, and the timestamps are fixed, so
 * re-running this produces a byte-identical file. A board that churned on every
 * run would move every player's rank for no reason, and a rank that moves
 * without the player doing anything is worse than no rank.
 *
 *     pnpm leaderboard:seed
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SEED_FILE = resolve(
  fileURLToPath(new URL('../data/leaderboard-seed.json', import.meta.url))
)

/** How many players the board claims. */
const TOTAL = 15_876

/**
 * The two players at the very top, placed by hand: the best reached wave 292,
 * the runner-up wave 245. Real tops of a board are outliers — far past where
 * any smooth curve would put them — so they are stated, not interpolated. The
 * curve below models the other `TOTAL - TOP.length` players, and its own best
 * must stay below the runner-up (asserted in `buildSeed`).
 */
const TOP = [292, 245]

/** When this curve was stated. Fixed, so the file is reproducible. */
const STATED_AT = Date.UTC(2026, 8, 11)

/**
 * The retention curve for everyone below the top two:
 * `best wave → fraction whose best is ≥ it`.
 *
 * The population is the one the live board holds — players who cleared at
 * least one wave (the client posts nothing before that), so it starts at 2.
 *
 *     waves   2-3   ~11 %   "some few" — cleared the tutorial wave, left
 *     waves   4-6   ~24 %   the quit PEAK, at the first boss (wave 5)
 *     waves  7-12   ~26 %   most casual sessions end around the first
 *                           milestone chest; the median best is ~wave 10
 *     waves 13-25    18 %   mutations from 12, new archetypes
 *     waves 26-50    12 %
 *     waves 51-100  6.5 %   the committed idlers
 *     waves 101-175 2.2 %
 *     waves 176+    0.3 %   into the rubber-band wall past 175 — the curve's
 *                           own best lands in the high 220s, below the top two
 *
 * The early anchors are one wave apart on purpose: they ramp the per-wave
 * drop-off 4.5 % → 6.5 % → 9 % → 11 % into the boss, so the quit histogram
 * RISES into its peak instead of stepping up to it. Between anchors the curve
 * is a monotone cubic through log(S) — continuous in slope, so the drop-off
 * rate (and with it the histogram) has no kinks at the anchors, which is what
 * made the piecewise log-linear version read as generated once plotted. Past
 * wave ~100 the rate climbs again (2.5 % → ~16 % by 226) — the wall.
 */
const SURVIVAL = [
  [2, 1],
  [3, 0.955],
  [4, 0.893],
  [5, 0.8125],
  [6, 0.7231],
  [7, 0.6508],
  [8, 0.5922],
  [10, 0.494],
  [13, 0.39],
  [18, 0.29],
  [26, 0.21],
  [36, 0.14],
  [51, 0.09],
  [71, 0.052],
  [101, 0.025],
  [131, 0.0115],
  [156, 0.0055],
  [176, 0.003],
  [196, 0.0012],
  [211, 0.0004],
  [226, 0.00006],
  [240, 0.000003]
]

// ─── Monotone cubic interpolation of log(S) (Fritsch–Carlson) ───────────────

const xs = SURVIVAL.map(([w]) => w)
const ys = SURVIVAL.map(([, s]) => Math.log(s))
const N = xs.length

/** Endpoint-limited tangents: the classic Fritsch–Carlson construction, which
 *  keeps the interpolant monotone (a survival curve never rises). */
const tangents = (() => {
  const d = []
  for (let i = 0; i < N - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  const m = new Array(N)
  m[0] = d[0]
  m[N - 1] = d[N - 2]
  for (let i = 1; i < N - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < N - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }
  return m
})()

/** Fraction of the curve's players whose best wave is at least `wave`. */
export const survival = (wave) => {
  if (wave <= xs[0]) return 1
  if (wave >= xs[N - 1]) return 0
  let i = 0
  while (wave > xs[i + 1]) i++
  const h = xs[i + 1] - xs[i]
  const t = (wave - xs[i]) / h
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1
  const h10 = t ** 3 - 2 * t ** 2 + t
  const h01 = -2 * t ** 3 + 3 * t ** 2
  const h11 = t ** 3 - t ** 2
  return Math.exp(h00 * ys[i] + h10 * h * tangents[i] + h01 * ys[i + 1] + h11 * h * tangents[i + 1])
}

// ─── Build ──────────────────────────────────────────────────────────────────

export const buildSeed = () => {
  const rest = TOTAL - TOP.length

  // Per-wave counts from the ROUNDED CUMULATIVE curve, not rounded per wave.
  // `n(w) = round(rest·S(w)) − round(rest·S(w+1))` telescopes to exactly
  // `rest` players in total, and — the reason for it — places the sparse deep
  // tail at its true quantiles. Rounding each wave on its own rounds every
  // wave that expects 0.2 players down to nobody, which quietly shaved the top
  // of the old board off.
  const cumulative = (w) => Math.round(rest * survival(w))
  const counts = []
  for (let wave = xs[0]; wave <= xs[N - 1]; wave++) {
    const n = cumulative(wave) - cumulative(wave + 1)
    if (n > 0) counts.push([wave, n])
  }

  const curveBest = counts.reduce((best, [w]) => Math.max(best, w), 0)
  if (curveBest >= Math.min(...TOP)) {
    throw new Error(`the curve's best (${curveBest}) reaches the hand-placed top (${TOP.join(', ')})`)
  }

  // The hand-placed top, then score-DESC — the order every rank walk relies on.
  const dist = [...counts, ...TOP.map((w) => [w, 1])].sort((a, b) => b[0] - a[0])

  return {
    source: 'seeded:retention-curve',
    fetchedAt: STATED_AT,
    updatedAt: STATED_AT,
    total: dist.reduce((a, [, n]) => a + n, 0),
    // No published rows — see the header. The rank badge reads `dist` + `total`.
    entries: [],
    dist
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const seed = buildSeed()
  mkdirSync(dirname(SEED_FILE), { recursive: true })
  writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2) + '\n', 'utf-8')

  const band = (lo, hi) => seed.dist.filter(([s]) => s >= lo && s <= hi).reduce((a, [, n]) => a + n, 0)
  const above = (x) => seed.dist.filter(([s]) => s > x).reduce((a, [, n]) => a + n, 0)
  const pct = (n) => `${((100 * n) / seed.total).toFixed(1)}%`.padStart(6)
  const row = (label, n) => console.log(`[seed]   ${label.padEnd(12)} ${String(n).padStart(6)} ${pct(n)}`)
  console.log(`[seed] ${seed.total} players, top waves ${seed.dist.slice(0, 5).map(([w]) => w).join(', ')}`)
  row('wave 2-3', band(2, 3))
  row('wave 4-6', band(4, 6))
  row('wave 7-12', band(7, 12))
  row('wave 13-25', band(13, 25))
  row('wave 26-50', band(26, 50))
  row('wave 51-100', band(51, 100))
  row('wave 101-175', band(101, 175))
  row('past 175', above(175))
  for (const w of [5, 10, 25, 50, 100, 150, 200]) {
    console.log(`[seed]   a best of ${String(w).padStart(3)} ranks #${above(w) + 1} of ${seed.total}`)
  }
  console.log(`[seed] wrote ${SEED_FILE}`)
}
