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
 * The two players at the very top, placed by hand: the best reached row 214,
 * the runner-up row 181. Real tops of a board are outliers — far past where
 * any smooth curve would put them — so they are stated, not interpolated. The
 * curve below models the other `TOTAL - TOP.length` players, and its own best
 * must stay below the runner-up (asserted in `buildSeed`).
 */
const TOP = [214, 181]

/** When this curve was stated. Fixed, so the file is reproducible. */
const STATED_AT = Date.UTC(2026, 8, 23)

/**
 * The retention curve for everyone below the top two:
 * `best row → fraction whose best is ≥ it`.
 *
 * Umbrella's score is the deepest ROW reached (one row per turn,
 * ~7 s a turn). The population is the one the live board holds — players who
 * got past the first row (the client posts nothing before that), so it starts
 * at 2. Anchored on the balance sim (`scripts/barrage-sim.mjs`): a
 * random-angle bot first breaches around row 17, a best-of-8 bot reaches the
 * row-30 boss at ~3.5 min and plateaus at rows 45–70 by ~25 min.
 *
 *     rows   2-9   ~22 %   left during the FTUE, before the first boss — the
 *                           per-row drop-off RISES into it (1.0 % → 3.1 %)
 *     row   10       5.3 %  the quit PEAK: the Slime Tower, the first real wall
 *     rows  11-19   ~29 %   the first breach and checkpoint restart
 *     rows  20-39   ~23 %   most casual sessions end around the row-30 boss
 *     rows  40-69    12 %   corrupted elites from row 40
 *     rows  70-119    7 %   the committed aimers
 *     rows 120+       2 %   high-row softening keeps it a slope; the curve is
 *                           tapered to nothing by row 178, below the top two
 *
 * The anchors are samples of one smooth quit histogram — linear rise into the
 * row-10 peak, then `4·(1 + (row−10)/16)^−2`, tapered past 130 — sampled
 * densely around the peak so the monotone cubic through log(S) cannot put a
 * kink in the drop-off rate there.
 */
const SURVIVAL = [
  [2, 1],
  [3, 0.9868],
  [4, 0.9697],
  [5, 0.9485],
  [6, 0.9235],
  [7, 0.8945],
  [8, 0.8615],
  [9, 0.8245],
  [10, 0.7836],
  [11, 0.7309],
  [12, 0.6841],
  [13, 0.6424],
  [14, 0.605],
  [16, 0.5406],
  [18, 0.4872],
  [20, 0.4421],
  [23, 0.3863],
  [26, 0.3412],
  [30, 0.2929],
  [35, 0.2459],
  [40, 0.2093],
  [50, 0.1558],
  [60, 0.1186],
  [70, 0.09132],
  [85, 0.06166],
  [100, 0.04044],
  [115, 0.0245],
  [130, 0.01209],
  [140, 0.006163],
  [150, 0.002684],
  [160, 0.0008739],
  [168, 0.0002255],
  [174, 0.00003909],
  [178, 0.000003]
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

/** Fraction of the curve's players whose best row is at least `row`. */
export const survival = (row) => {
  if (row <= xs[0]) return 1
  if (row >= xs[N - 1]) return 0
  let i = 0
  while (row > xs[i + 1]) i++
  const h = xs[i + 1] - xs[i]
  const t = (row - xs[i]) / h
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1
  const h10 = t ** 3 - 2 * t ** 2 + t
  const h01 = -2 * t ** 3 + 3 * t ** 2
  const h11 = t ** 3 - t ** 2
  return Math.exp(h00 * ys[i] + h10 * h * tangents[i] + h01 * ys[i + 1] + h11 * h * tangents[i + 1])
}

// ─── Build ──────────────────────────────────────────────────────────────────

export const buildSeed = () => {
  const rest = TOTAL - TOP.length

  // Per-row counts from the ROUNDED CUMULATIVE curve, not rounded per row.
  // `n(w) = round(rest·S(w)) − round(rest·S(w+1))` telescopes to exactly
  // `rest` players in total, and — the reason for it — places the sparse deep
  // tail at its true quantiles. Rounding each row on its own rounds every
  // row that expects 0.2 players down to nobody, which quietly shaved the top
  // of the old board off.
  const cumulative = (w) => Math.round(rest * survival(w))
  const counts = []
  for (let row = xs[0]; row <= xs[N - 1]; row++) {
    const n = cumulative(row) - cumulative(row + 1)
    if (n > 0) counts.push([row, n])
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
  console.log(`[seed] ${seed.total} players, top rows ${seed.dist.slice(0, 5).map(([w]) => w).join(', ')}`)
  row('row 2-9', band(2, 9))
  row('row 10', band(10, 10))
  row('row 11-19', band(11, 19))
  row('row 20-39', band(20, 39))
  row('row 40-69', band(40, 69))
  row('row 70-119', band(70, 119))
  row('past 119', above(119))
  for (const w of [10, 20, 30, 50, 100, 150]) {
    console.log(`[seed]   a best of ${String(w).padStart(3)} ranks #${above(w) + 1} of ${seed.total}`)
  }
  console.log(`[seed] wrote ${SEED_FILE}`)
}
