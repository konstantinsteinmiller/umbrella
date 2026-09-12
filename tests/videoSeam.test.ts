// The DEV seam the gameplay-video pipeline (tools/preview-video) drives the
// game through, and the two small engine hooks it stands on: an authored spawn
// keeps the portal it names and is exactly one monster.

import { describe, expect, it, vi } from 'vitest'
import { GRID_KEY, PRISM_MAX_TIER_KEY } from '@/keys'

type Video = {
  stage: (plan: Record<string, unknown>) => void
  freeze: (on: boolean) => void
  state: () => { grid: number[]; maxTier: number; frozen: boolean }
}

const load = async () => {
  vi.resetModules()
  window.localStorage.clear()
  const battle = await import('@/use/useBattle')
  const state = await import('@/use/useEpicState')
  await import('@/dev/videoSeam')
  const video = (window as unknown as { __video: Video }).__video
  return { battle, state, video }
}

describe('the gameplay-video seam', () => {
  it('stages a frozen fight whose arrivals are one monster each, out of the portal they name', async () => {
    const { battle, video } = await load()
    video.stage({
      wave: 20,
      army: [{ tier: 10, x: 30, y: 50 }],
      spawns: [
        { kind: 'slime', at: 0.1, portal: 2 },
        { kind: 'runner', at: 0.2, portal: 2 },
        { kind: 'slime', at: 0.3, portal: 0 }
      ]
    })
    expect(battle.timescale.value).toBe(0)
    expect(battle.wavePhase.value).toBe('fighting')
    expect(battle.wave.value).toBe(20)
    battle.advanceBattle(0.5)
    // No 1-3 cluster roll: exactly the three that were authored…
    expect(battle.enemies.value.map((e) => e.kind)).toEqual(['slime', 'runner', 'slime'])
    // …out of the bottom-right portal (y 84), then the top-right one (y 16).
    const [a, b, c] = battle.enemies.value
    expect(a!.y).toBeGreaterThan(70)
    expect(b!.y).toBeGreaterThan(70)
    expect(c!.y).toBeLessThan(30)
  })

  it('shapes staged foes and arrivals by their HP and attack multipliers', async () => {
    const { battle, video } = await load()
    video.stage({ wave: 20, foes: [{ kind: 'slime', x: 70, y: 50 }] })
    const plain = { ...battle.enemies.value[0]! }
    video.stage({
      wave: 20,
      foes: [{ kind: 'slime', x: 70, y: 50, hp: 3, atk: 0.5 }],
      spawns: [{ kind: 'slime', at: 0.1, portal: 1, hp: 2, atk: 4 }]
    })
    const staged = battle.enemies.value[0]!
    expect(staged.maxHp).toBe(plain.maxHp * 3)
    expect(staged.hp).toBe(staged.maxHp)
    expect(staged.atk).toBe(Math.round(plain.atk * 0.5))
    battle.advanceBattle(0.3)
    const arrived = battle.enemies.value[1]!
    expect(arrived.maxHp).toBe(plain.maxHp * 2)
    expect(arrived.atk).toBe(plain.atk * 4)
  })

  it('writes the staged grid and watermark to the save, so the next save write cannot revert them', async () => {
    const { state, video } = await load()
    const grid = [0, 18, 18, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12]
    video.stage({ wave: 30, grid, maxTier: 18 })
    expect(state.getState(GRID_KEY)).toEqual(grid)
    expect(state.getState(PRISM_MAX_TIER_KEY)).toBe(18)
    state.setState('epic_coins', 5) // any write re-reads the blob into the grid
    expect(video.state().grid).toEqual(grid)
    expect(video.state().maxTier).toBe(18)
  })

  it('leaves a composed wave to the engine: no portal is pre-assigned there', async () => {
    const { composeWave } = await import('@/game/units')
    for (const w of [7, 12, 25, 40]) {
      for (const s of composeWave(w)) {
        expect(s.portal).toBeUndefined()
        expect(s.count).toBeUndefined()
      }
    }
  })
})

describe('the clean-feed flag', () => {
  it('is off unless the page asks for it', async () => {
    vi.resetModules()
    const { CLEAN_FEED } = await import('@/game/cleanFeed')
    expect(CLEAN_FEED).toBe(false)
  })
})
