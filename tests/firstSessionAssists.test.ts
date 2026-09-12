// First-session assists from the 2026-09 play-test pass: the 3-tap spawn meter,
// the 2k Recruits entry price, drop-merges that find the matching fighter in a
// clump, the first-boss Meteor coaching, the RALLY! champion guarantee, and the
// tutorial no longer ending itself when wave 1 is cleared mid-step.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const STATE_KEY = 'merge-idle-war_state'

const seed = (blob: Record<string, unknown>): void => {
  window.localStorage.setItem(STATE_KEY, JSON.stringify(blob))
}

beforeEach(() => {
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('spawn meter', () => {
  it('needs exactly 3 taps per recruit once the tutorial is done', async () => {
    seed({ prism_tutorial_step: 4 })
    vi.resetModules()
    const game = await import('@/use/usePrismGame')
    expect(game.CLICKS_PER_SPAWN).toBe(3)
    expect(game.tapSpawn().idx).toBe(-1)
    expect(game.tapSpawn().idx).toBe(-1)
    expect(game.tapSpawn().idx).toBeGreaterThanOrEqual(0)
  })
})

describe('Recruits entry price', () => {
  it('level 1 costs 2,000 and the ladder still only rises', async () => {
    vi.resetModules()
    const b = await import('@/use/useBattle')
    expect(b.upgradeCost('recruit')).toBe(2_000)
    b.battleUpgrades.value = { ...b.battleUpgrades.value, recruit: 1 }
    expect(b.upgradeCost('recruit')).toBeGreaterThan(2_000)
  })
})

describe('drop-merge hit test', () => {
  it('prefers a same-tier fighter in reach over a closer one of another tier', async () => {
    seed({ prism_tutorial_step: 4 })
    vi.resetModules()
    const b = await import('@/use/useBattle')
    b.deployFighter(2, 30, 50)
    b.deployFighter(3, 36, 50)
    // Dropped right on the T2 (the hit test aims 5 above the foot point)…
    expect(b.fighterAt(30, 45)?.tier).toBe(2)
    // …but carrying a T3, the T3 six units away is the target.
    expect(b.fighterAt(30, 45, undefined, 3)?.tier).toBe(3)
    // No same-tier fighter in reach → the nearest one, as before.
    expect(b.fighterAt(30, 45, undefined, 7)?.tier).toBe(2)
  })
})

describe('first boss + RALLY! (engine run)', () => {
  it('coaches the Meteor on the first boss and RALLY! always returns the top tier', async () => {
    // Wave 5 is a boss wave; one lone T1 cannot hold it, so the gate falls.
    seed({ prism_tutorial_step: 4, prism_max_tier: 6, battle_wave: 5, battle_best_wave: 5 })
    vi.resetModules()
    const rafs = new Map<number, (t: number) => void>()
    let rafId = 0
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => { rafs.set(++rafId, cb); return rafId })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { rafs.delete(id) })
    const b = await import('@/use/useBattle')
    const { getState } = await import('@/use/useEpicState')
    const { BATTLE_FIRST_BOSS_COACHED_KEY } = await import('@/keys')

    b.deployFighter(1)
    b.startBattle()
    let t = 1000
    let coachedAtSpawn: { hint: boolean; ult: number } | null = null
    for (let i = 0; i < 60 * 240 && b.wavePhase.value !== 'overrun'; i++) {
      t += 1000 / 60
      for (const [id, cb] of [...rafs]) { rafs.delete(id); cb(t) }
      if (!coachedAtSpawn && b.boss.value) coachedAtSpawn = { hint: b.meteorHintActive.value, ult: b.ultCharge.value }
    }

    // The first boss handed over a full, highlighted Meteor Storm, once.
    expect(coachedAtSpawn).toEqual({ hint: true, ult: b.ultMax })
    expect(getState(BATTLE_FIRST_BOSS_COACHED_KEY)).toBe(true)

    // The gate fell with only the T1 lost → the revive alone would not bring
    // back the Codex's best (T6), so one T6 is gifted on top.
    expect(b.wavePhase.value).toBe('overrun')
    expect(b.meteorHintActive.value).toBe(false)
    expect(b.requestRallyHold()).toBe(true)
    const back = b.claimRally()
    const tiers = b.fighters.value.map((f) => f.tier).sort((x, y) => x - y)
    expect(tiers).toEqual([1, 6])
    expect(back).toBe(2)
    b.stopBattle()
  })
})

describe('tutorial veteran skip', () => {
  it('still skips a veteran who never started the coach-marks', async () => {
    seed({ battle_best_wave: 3 })
    vi.resetModules()
    const tut = await import('@/use/useTutorial')
    expect(tut.tutorialStep.value).toBe('done')
  })

  it('does not end the tutorial when wave 1 is cleared during the field-merge step', async () => {
    seed({ battle_best_wave: 2, prism_tutorial_step: 3 })
    vi.resetModules()
    const tut = await import('@/use/useTutorial')
    expect(tut.tutorialStep.value).toBe('fieldMerge')
  })
})
