// The 100 kite levels (src/umbrella/kiteLevels.ts): every one is well formed, starts
// safely and is PROVEN beatable — the wins recorded by the bot (scripts/kite-solve.mjs,
// tests/umbrella/helpers/kiteSolver.ts) are replayed here on the real engine. A level
// edited without re-running the solver fails here:
//   node "$HOME/.claude/skills/worker-budget/budget.mjs" run -- node scripts/kite-solve.mjs --ids <id>
import { describe, expect, it } from 'vitest'
import { contactOf, createWorld, step, type World } from '@/umbrella/engine'
import { KITE_LEVELS } from '@/umbrella/kiteLevels'
import { parseLevel } from '@/umbrella/customLevels'
import { DEFAULT_TUNING } from '@/umbrella/tuning'
import { difficulty, DT, MACRO, replay, solve, tuningSize, type SolutionRecord } from './helpers/kiteSolver'
import solutions from './kite-solutions.json'

const T = DEFAULT_TUNING
const records = (solutions as { levels: Record<string, SolutionRecord> }).levels
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

describe('the kite levels', () => {
  it('are 100, numbered 1–100, with the recording format the solver wrote', () => {
    expect(KITE_LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1))
    expect(solutions.dt).toBeCloseTo(DT)
    expect(solutions.macroTicks).toBe(MACRO)
  })

  it.each(KITE_LEVELS.map((l) => [l.id, l] as const))('level %i is well formed and starts safely', (_id, level) => {
    // Survives the editor / share-link validation unchanged (players can edit it locally).
    expect(parseLevel(JSON.parse(JSON.stringify(level)))).toEqual({ ...level, hazards: level.hazards ?? [] })
    const { w: ww, h: wh } = level.world
    // Spawn inside the world, a finish inside the world.
    expect(level.spawn.x).toBeGreaterThan(20)
    expect(level.spawn.x).toBeLessThan(ww - 20)
    expect(level.spawn.y).toBeGreaterThan(40)
    expect(level.spawn.y).toBeLessThan(wh)
    const fins = level.platforms.filter((p) => p.finish)
    expect(fins.length).toBeGreaterThan(0)
    const w = createWorld(level, tuningSize(T))
    for (const p of w.platforms.filter((x) => x.finish)) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x + p.w).toBeLessThanOrEqual(ww)
      expect(p.y).toBeLessThan(wh)
    }
    // Nothing solid or deadly where Pweeg appears.
    const pl = w.player
    for (const p of w.platforms) expect(overlaps(pl, p), 'spawn inside a platform').toBe(false)
    for (const h of w.hazards) expect(overlaps(pl, h), `spawn inside a ${h.kind}`).toBe(false)
    // No two static platforms overlap (they would tear in the renderer and trap the player).
    const still = level.platforms.filter((p) => !p.motion)
    for (let i = 0; i < still.length; i++) {
      for (let j = i + 1; j < still.length; j++) expect(overlaps(still[i]!, still[j]!), `platforms ${i} and ${j} overlap`).toBe(false)
    }
    // Standing still at the spawn is safe: he lands on the start platform and lives for 1.5 s.
    for (let i = 0; i < 1.5 / DT; i++) step(w, { left: false, right: false, toggle: false }, DT, T)
    expect(w.phase).toBe('play')
    expect(w.player.grounded).toBe(true)
    // Checkpoint flags stand on solid ground, clear of hazards.
    for (const c of level.checkpoints ?? []) {
      expect(level.platforms.some((p) => !p.motion && p.channel === undefined && c.x >= p.x && c.x <= p.x + p.w && Math.abs(p.y - c.y) < 2)).toBe(true)
      const box = { x: c.x - 15, y: c.y - 64, w: 30, h: 64 }
      for (const h of (level.hazards ?? []).filter((x) => !x.motion && contactOf(x) === 'deadly')) expect(overlaps(box, h)).toBe(false)
    }
  })

  it.each(KITE_LEVELS.map((l) => [l.id, l] as const))('level %i is beaten by its recorded run in 2–30 s', (id, level) => {
    const rec = records[id]
    expect(rec, `no recorded win for level ${id}: run scripts/kite-solve.mjs --ids ${id}`).toBeTruthy()
    const w: World = replay(level, rec!.actions, T)
    expect(w.phase, `the recorded run of level ${id} no longer wins (level edited? re-run the solver)`).toBe('win')
    expect(w.time).toBeCloseTo(rec!.time, 1)
    expect(w.time).toBeGreaterThanOrEqual(2)
    expect(w.time).toBeLessThanOrEqual(30)
  })

  it('the solver finds a win from scratch (not just the recordings)', () => {
    for (const id of [1, 12, 44]) {
      const s = solve(KITE_LEVELS[id - 1]!, { beam: 600, maxTime: 12 })
      expect(s, `level ${id}`).not.toBeNull()
      expect(replay(KITE_LEVELS[id - 1]!, s!.actions, T).phase).toBe('win')
    }
  }, 120_000)

  it('get harder across the curriculum: every world harder on average, every finale harder than its opener', () => {
    const d = KITE_LEVELS.map((l) => difficulty(records[l.id]!))
    const worlds = Array.from({ length: 10 }, (_, k) => d.slice(k * 10, k * 10 + 10))
    const mean = worlds.map((x) => x.reduce((a, b) => a + b, 0) / x.length)
    // Rank correlation of world number and mean difficulty (1 = strictly rising).
    const rank = (xs: number[]) => xs.map((x) => xs.filter((y) => y < x).length)
    const r = rank(mean)
    const spearman = 1 - (6 * r.reduce((a, ri, i) => a + (ri - i) ** 2, 0)) / (10 * (100 - 1))
    expect(spearman).toBeGreaterThanOrEqual(0.9)
    expect(mean[9]!).toBeGreaterThan(mean[0]! * 2)
    for (const w of worlds) expect(w[9]!).toBeGreaterThan(w[0]!)
    // Also over the levels themselves the trend rises — loosely, by design: every world
    // opens below the last one's peak (the sawtooth), so single levels zig-zag.
    const rl = rank(d)
    const rho = 1 - (6 * rl.reduce((a, ri, i) => a + (ri - i) ** 2, 0)) / (100 * (100 * 100 - 1))
    expect(rho).toBeGreaterThan(0.5)
  })
})
