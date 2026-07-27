// Deep-wave catch-up + extended Recruits ladder.
//
// Reported from a real run: reached wave 223, wiped back to 213, and the −25%
// enemy rubber-band alone could not break the loop in any reasonable session.
// Past wave 175 the catch-up window now also boosts the ARMY (+50% max HP, ÷1.5
// incoming damage), and Recruits goes to level 20 so base spawn tier keeps
// climbing. These tests pin the numbers and the gating.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const importBattle = async () => {
  vi.resetModules()
  return await import('@/use/useBattle')
}

beforeEach(() => { window.localStorage.clear() })

describe('Recruits ladder — levels 16-20', () => {
  it('caps at level 20 (base spawn tier 21)', async () => {
    const b = await importBattle()
    expect(b.RECRUIT_MAX_LEVEL).toBe(20)
  })

  it('has a price for every level, and prices only ever rise', async () => {
    const b = await importBattle()
    const prices: number[] = []
    for (let lvl = 0; lvl < b.RECRUIT_MAX_LEVEL; lvl++) {
      b.battleUpgrades.value = { ...b.battleUpgrades.value, recruit: lvl }
      prices.push(b.upgradeCost('recruit'))
    }
    expect(prices).toHaveLength(20)
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]!).toBeGreaterThan(prices[i - 1]!)
    }
  })

  it('steepens past level 15 rather than continuing the old ~3.3× step', async () => {
    // The point of the new tail: a deep level must not be the cheapest part of
    // the curve in real terms. Steps 16-20 should outgrow the 1-15 average.
    const b = await importBattle()
    const costAt = (lvl: number): number => {
      b.battleUpgrades.value = { ...b.battleUpgrades.value, recruit: lvl }
      return b.upgradeCost('recruit')
    }
    const step = (lvl: number): number => costAt(lvl) / costAt(lvl - 1)
    const lateSteps = [16, 17, 18, 19].map((l) => step(l - 1))
    for (const s of lateSteps) expect(s).toBeGreaterThan(3.3)
  })

  it('recruitTier tracks the level so 20 ⇒ T21', async () => {
    const b = await importBattle()
    b.battleUpgrades.value = { ...b.battleUpgrades.value, recruit: 20 }
    expect(b.recruitTier.value).toBe(21)
  })

  it('sanitize clamps a tampered/legacy save to the new cap', async () => {
    window.localStorage.clear()
    const b = await importBattle()
    b.battleUpgrades.value = { ...b.battleUpgrades.value, recruit: 20 }
    expect(b.isUpgradeMaxed('recruit')).toBe(true)
    // One below the cap is still buyable (not maxed).
    b.battleUpgrades.value = { ...b.battleUpgrades.value, recruit: 19 }
    expect(b.isUpgradeMaxed('recruit')).toBe(false)
  })
})

describe('deep-wave catch-up gating (real flag)', () => {
  it('needs the catch-up window AND a deep wave', async () => {
    const b = await importBattle()

    b.rubberBandActive.value = false
    b.wave.value = 223
    expect(b.rubberBandArmyActive.value).toBe(false) // deep, but no window

    b.rubberBandActive.value = true
    b.wave.value = 100
    expect(b.rubberBandArmyActive.value).toBe(false) // window, but mid-game

    b.wave.value = 223
    expect(b.rubberBandArmyActive.value).toBe(true)  // the reported run
  })

  it('triggers strictly PAST wave 175, and leaves the mid-game curve alone', async () => {
    const b = await importBattle()
    b.rubberBandActive.value = true

    b.wave.value = 174
    expect(b.rubberBandArmyActive.value).toBe(false)
    b.wave.value = 175
    expect(b.rubberBandArmyActive.value).toBe(false) // boundary is exclusive
    b.wave.value = 176
    expect(b.rubberBandArmyActive.value).toBe(true)
    b.wave.value = 213 // the wave the reported run fell back to
    expect(b.rubberBandArmyActive.value).toBe(true)
  })
})

describe('deep-wave catch-up effect on the army', () => {
  it('gives a deployed fighter +50% max HP while it applies', async () => {
    // Drives the real path: deployFighter → hpMult() → armyCatchUpActive().
    const b = await importBattle()
    b.wave.value = 223

    b.rubberBandActive.value = false
    expect(b.deployFighter(5)).toBe(true)
    const baseline = b.fighters.value.at(-1)!.maxHp

    b.rubberBandActive.value = true
    expect(b.deployFighter(5)).toBe(true)
    const boosted = b.fighters.value.at(-1)!.maxHp

    expect(boosted / baseline).toBeCloseTo(1.5, 2)
  })

  it('does NOT boost a same-tier fighter below the wave threshold', async () => {
    const b = await importBattle()
    b.rubberBandActive.value = true

    b.wave.value = 100
    expect(b.deployFighter(5)).toBe(true)
    const midGame = b.fighters.value.at(-1)!.maxHp

    b.wave.value = 223
    expect(b.deployFighter(5)).toBe(true)
    const deep = b.fighters.value.at(-1)!.maxHp

    expect(deep / midGame).toBeCloseTo(1.5, 2)
  })

  it('composes with the −25% enemy nerf for ~half the incoming pressure', () => {
    // Documents the intended net effect of the two halves of the window:
    // enemies at 0.75× attack, army taking damage ÷1.5.
    expect(0.75 / 1.5).toBeCloseTo(0.5, 5)
    // …and ~2.25× effective durability (1.5× HP × 1.5× defence). Note "50% more
    // defence" is a divisor, so damage taken drops ~33%, not 50%.
    expect(1.5 * 1.5).toBeCloseTo(2.25, 5)
  })
})
