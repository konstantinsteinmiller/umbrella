// The dragon kite's five onboarding levels (src/umbrella/dragonLevels.ts): every one is well formed, starts
// safely and is PROVEN beatable — the bot (tests/umbrella/helpers/kiteSolver.ts) plays it on the real engine
// under the game's own tuning and must find a win a person could repeat.
import { describe, expect, it } from 'vitest'
import { contactOf, createWorld, step } from '@/umbrella/engine'
import { DRAGON_ENTRIES, DRAGON_ID_BASE, DRAGON_LEVELS, isDragonId } from '@/umbrella/dragonLevels'
import { parseLevel } from '@/umbrella/customLevels'
import { DEFAULT_TUNING as T } from '@/umbrella/tuning'
import { DT, replay, solve, tuningSize } from './helpers/kiteSolver'

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

describe('the dragon chapter', () => {
  it('has five levels under ids of their own, none of them in the campaign', () => {
    expect(DRAGON_LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4].map((i) => DRAGON_ID_BASE + i))
    expect(DRAGON_LEVELS.every((l) => isDragonId(l.id))).toBe(true)
    expect(isDragonId(DRAGON_ID_BASE - 1)).toBe(false)
    expect(isDragonId(DRAGON_ID_BASE + 5)).toBe(false)
    expect(DRAGON_ENTRIES.map((e) => e.id)).toEqual(DRAGON_LEVELS.map((l) => l.id))
  })

  it.each(DRAGON_LEVELS.map((l) => [l.id, l] as const))('level %i is well formed and starts safely', (_id, level) => {
    // Survives the editor / share-link validation unchanged (players can open it in the editor).
    expect(parseLevel(JSON.parse(JSON.stringify(level)))).toEqual({ ...level, hazards: level.hazards ?? [] })
    const { w: ww, h: wh } = level.world
    expect(level.spawn.x).toBeGreaterThan(20)
    expect(level.spawn.x).toBeLessThan(ww - 20)
    expect(level.spawn.y).toBeGreaterThan(40)
    expect(level.spawn.y).toBeLessThan(wh)
    expect(level.platforms.filter((p) => p.finish).length).toBe(1)
    const w = createWorld(level, tuningSize(T))
    for (const p of w.platforms.filter((x) => x.finish)) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x + p.w).toBeLessThanOrEqual(ww)
      expect(p.y).toBeLessThan(wh)
    }
    const pl = w.player
    for (const p of w.platforms) expect(overlaps(pl, p), 'spawn inside a platform').toBe(false)
    for (const h of w.hazards) expect(overlaps(pl, h), `spawn inside a ${h.kind}`).toBe(false)
    const still = level.platforms.filter((p) => !p.motion)
    for (let i = 0; i < still.length; i++) {
      for (let j = i + 1; j < still.length; j++) expect(overlaps(still[i]!, still[j]!), `platforms ${i} and ${j} overlap`).toBe(false)
    }
    // Standing still at the spawn is safe: he lands on the start platform and lives for 1.5 s.
    for (let i = 0; i < 1.5 / DT; i++) step(w, { left: false, right: false, toggle: false }, DT, T)
    expect(w.phase).toBe('play')
    expect(w.player.grounded).toBe(true)
    for (const c of level.checkpoints ?? []) {
      expect(level.platforms.some((p) => !p.motion && p.channel === undefined && c.x >= p.x && c.x <= p.x + p.w && Math.abs(p.y - c.y) < 2)).toBe(true)
      const box = { x: c.x - 15, y: c.y - 64, w: 30, h: 64 }
      for (const h of (level.hazards ?? []).filter((x) => !x.motion && contactOf(x) === 'deadly')) expect(overlaps(box, h)).toBe(false)
    }
  })

  it.each(DRAGON_LEVELS.map((l) => [l.id, l] as const))('the bot beats level %i from scratch, and the run replays to a win', (_id, level) => {
    const s = solve(level, { beam: 900, maxTime: 40 })
    expect(s, 'no win found: the level cannot be beaten (or is far too hard)').not.toBeNull()
    const w = replay(level, s!.actions, T)
    expect(w.phase).toBe('win')
    expect(w.time).toBeGreaterThanOrEqual(2)
    expect(w.time).toBeLessThanOrEqual(40)
    console.info(`dragon level ${level.id}: won in ${w.time.toFixed(1)} s (${s!.nodes} states)`)
  }, 240_000)
})
