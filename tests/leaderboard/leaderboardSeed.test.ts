// @vitest-environment node
// (The seed script resolves its output path from `import.meta.url`, which is
// only a `file:` URL under node — and nothing here needs a DOM.)
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @ts-expect-error — a plain .mjs build script, no type declarations.
import { buildSeed } from '../../scripts/leaderboard-seed.mjs'

/**
 * ─── The seeded board is a stated curve, not a pile of numbers ──────────────
 *
 * Poki, Yandex and Playgama (the YouTube Playables archive) cannot post a
 * score, so their baked board is the whole board for the life of the build and
 * nobody playing it will ever join it. It is generated from a best-row
 * retention curve plus two hand-placed top players, rather than copied from
 * the live board, because a live board is a survivorship sample frozen on
 * build day.
 *
 * The curve is a design decision with numbers in it, so the numbers are pinned
 * here. Regenerate with `pnpm leaderboard:seed` after changing it, and expect
 * this file to be what tells you the shape moved.
 */

interface Seed {
  source: string
  fetchedAt: number
  updatedAt: number
  total: number
  entries: { rank: number; name: string; score: number; flair: number }[]
  dist: [number, number][]
}

const SEED_PATH = resolve(__dirname, '../../data/leaderboard-seed.json')
const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8')) as Seed

const band = (lo: number, hi: number): number =>
  seed.dist.filter(([s]) => s >= lo && s <= hi).reduce((a, [, n]) => a + n, 0)
const share = (n: number): number => n / seed.total
const above = (x: number): number =>
  seed.dist.filter(([s]) => s > x).reduce((a, [, n]) => a + n, 0)
const at = (row: number): number => seed.dist.find(([s]) => s === row)?.[1] ?? 0

describe('the seeded board matches the population it claims', () => {
  it('says out loud that it is modelled', () => {
    // The one guard against this file being mistaken for telemetry later.
    expect(seed.source).toBe('seeded:retention-curve')
  })

  it('invents nobody — no published rows, no names', () => {
    // The game shows a rank and a population and never a list, so a seeded
    // name could only ever be a fabricated player waiting for a future screen.
    expect(seed.entries).toEqual([])
  })

  it('is the file the script produces, byte for byte', () => {
    // A board that churned between builds would move every player's rank for
    // no reason they could see.
    expect(JSON.stringify(buildSeed(), null, 2) + '\n').toBe(
      readFileSync(SEED_PATH, 'utf-8').replace(/\r\n/g, '\n')
    )
  })

  it('holds exactly 15,876 players', () => {
    expect(seed.total).toBe(15_876)
    expect(seed.dist.reduce((a, [, n]) => a + n, 0)).toBe(15_876)
  })

  it('has the stated top two — row 214, then row 181 — each alone', () => {
    expect(seed.dist[0]).toEqual([214, 1])
    expect(seed.dist[1]).toEqual([181, 1])
    // …and the curve's own best stays a believable step below the runner-up.
    const third = seed.dist[2]![0]
    expect(third).toBeLessThan(181)
    expect(third).toBeGreaterThan(160)
  })

  it('puts the mass where the curve says players stop', () => {
    // Half a point per band: tight enough to catch a reshaped curve.
    expect(share(band(2, 9))).toBeCloseTo(0.216, 2)    // left during the FTUE
    expect(share(band(10, 10))).toBeCloseTo(0.053, 2)  // the first boss
    expect(share(band(11, 19))).toBeCloseTo(0.289, 2)
    expect(share(band(20, 39))).toBeCloseTo(0.233, 2)
    expect(share(band(40, 69))).toBeCloseTo(0.118, 2)
    expect(share(band(70, 119))).toBeCloseTo(0.071, 2)
    expect(share(above(119))).toBeCloseTo(0.02, 2)
  })

  it('rises into its quit peak at the first boss, row 10', () => {
    // A player who got past row 1 rarely stops on the very next turn; the
    // first real wall is the Slime Tower. So the quit histogram climbs into
    // row 10 rather than starting at its highest point.
    for (let r = 2; r < 10; r++) expect(at(r)).toBeLessThan(at(r + 1))
    const byRow = [...seed.dist].sort((a, b) => a[0] - b[0])
    const peak = byRow.reduce((p, c) => (c[1] > p[1] ? c : p))
    expect(peak[0]).toBe(10)
  })

  it('falls away without a kink once past the peak', () => {
    // A rise past the peak is the tell that the interpolation broke between two
    // anchors (a step in the drop-off rate is a step here) — allowed only as
    // integer rounding out in the tail, where buckets hold a handful of players.
    const byRow = [...seed.dist].sort((a, b) => a[0] - b[0]).filter(([w]) => w >= 10 && w < 181)
    for (let i = 1; i < byRow.length; i++) {
      const [row, n] = byRow[i]!
      const prev = byRow[i - 1]![1]
      expect(n, `row ${row} kept more players than the row before it`)
        .toBeLessThanOrEqual(Math.max(prev * 1.02, prev + 1))
    }
  })

  it('holds the same population the live board does — best row 2 and up', () => {
    // The client never posts a best row below 2.
    for (const [score, n] of seed.dist) {
      expect(score).toBeGreaterThanOrEqual(2)
      expect(n).toBeGreaterThan(0)
    }
  })

  it('is ordered score-DESC, which every rank walk depends on', () => {
    for (let i = 1; i < seed.dist.length; i++) {
      expect(seed.dist[i]![0]).toBeLessThan(seed.dist[i - 1]![0])
    }
  })
})
