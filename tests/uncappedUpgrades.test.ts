// War Horns, Vitality, Bounty and the Imp have no level cap any more.
//
// Reported from a real run: all four sat on MAX from wave ~290 while the next
// Recruits level (7.5Qi) took longer and longer to save for, and nothing else
// could turn coins into progress. Past their old caps (100 / 100 / 25 / 25) the
// price keeps ramping and the effect keeps compounding. These tests pin that the
// old ranges are untouched, the deep ranks are always buyable and always worth
// something, and a veteran's deep levels survive a reload.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const importBattle = async () => {
  vi.resetModules()
  return await import('@/use/useBattle')
}

type Deep = 'attack' | 'vitality' | 'bounty' | 'automation'
const SEAM: Record<Deep, number> = { attack: 100, vitality: 100, bounty: 25, automation: 25 }
const PLAIN: Record<Deep, { base: number; growth: number }> = {
  attack: { base: 60, growth: 1.33 },
  vitality: { base: 55, growth: 1.32 },
  bounty: { base: 80, growth: 1.6 },
  automation: { base: 130, growth: 1.72 }
}
const IDS = Object.keys(SEAM) as Deep[]

beforeEach(() => { window.localStorage.clear() })

describe('no level cap', () => {
  it('never reports War Horns, Vitality, Bounty or the Imp as maxed', async () => {
    const b = await importBattle()
    for (const id of IDS) {
      for (const lvl of [SEAM[id], SEAM[id] + 1, 250]) {
        b.battleUpgrades.value = { ...b.battleUpgrades.value, [id]: lvl }
        expect(b.isUpgradeMaxed(id)).toBe(false)
      }
    }
  })

  it('still caps Recruits at 49 (the last illustrated tier)', async () => {
    const b = await importBattle()
    b.battleUpgrades.value = { ...b.battleUpgrades.value, recruit: 49 }
    expect(b.isUpgradeMaxed('recruit')).toBe(true)
  })

  it('buys the first level past each old cap', async () => {
    const b = await importBattle()
    const { default: useEpicConfig } = await import('@/use/useEpicConfig')
    const { coins, addCoins } = useEpicConfig()
    for (const id of IDS) {
      b.battleUpgrades.value = { ...b.battleUpgrades.value, [id]: SEAM[id] }
      const price = b.upgradeCost(id)
      addCoins(price)
      const before = coins.value
      expect(b.buyUpgrade(id)).toBe(true)
      expect(b.battleUpgrades.value[id]).toBe(SEAM[id] + 1)
      expect(before - coins.value).toBe(price)
    }
  })
})

describe('prices', () => {
  it('are unchanged up to the old cap', async () => {
    const b = await importBattle()
    for (const id of IDS) {
      for (const lvl of [0, 1, Math.floor(SEAM[id] / 2), SEAM[id]]) {
        b.battleUpgrades.value = { ...b.battleUpgrades.value, [id]: lvl }
        const { base, growth } = PLAIN[id]
        expect(b.upgradeCost(id)).toBe(Math.max(1, Math.round(base * Math.pow(growth, lvl))))
      }
    }
  })

  it('steepen with every level past the old cap', async () => {
    const b = await importBattle()
    for (const id of IDS) {
      const costAt = (lvl: number): number => {
        b.battleUpgrades.value = { ...b.battleUpgrades.value, [id]: lvl }
        return b.upgradeCost(id)
      }
      let prevStep = PLAIN[id].growth
      for (let lvl = SEAM[id] + 1; lvl <= SEAM[id] + 60; lvl++) {
        const step = costAt(lvl) / costAt(lvl - 1)
        expect(step).toBeGreaterThan(prevStep)
        prevStep = step
      }
      // Near-exponential at first, not a wall: the first deep step is only 1%
      // steeper than the plain curve's.
      expect(costAt(SEAM[id] + 1) / costAt(SEAM[id])).toBeCloseTo(PLAIN[id].growth * 1.01, 6)
    }
  })

  it("don't hand a capped veteran's savings a runaway", async () => {
    // The reported save: every upgrade at its old cap, 3.5Qi in the wallet.
    // All of it into one upgrade buys a real jump, and no more than that.
    const b = await importBattle()
    const buyable = (id: Deep, coins: number): number => {
      let lvl = SEAM[id]
      for (;;) {
        b.battleUpgrades.value = { ...b.battleUpgrades.value, [id]: lvl }
        const price = b.upgradeCost(id)
        if (price > coins) return lvl - SEAM[id]
        coins -= price
        lvl++
      }
    }
    for (const id of IDS) {
      expect(buyable(id, 3.5e18)).toBeGreaterThanOrEqual(15)
      expect(buyable(id, 3.5e18)).toBeLessThanOrEqual(45)
    }
  })

  it('reach Infinity (unbuyable, never NaN) long before the tamper bound', async () => {
    const b = await importBattle()
    for (const id of IDS) {
      b.battleUpgrades.value = { ...b.battleUpgrades.value, [id]: 1_000 }
      expect(b.upgradeCost(id)).toBe(Infinity)
      expect(b.canBuyUpgrade(id)).toBe(false)
    }
  })
})

describe('effects past the old cap', () => {
  it('continue smoothly from the seam and compound', async () => {
    const b = await importBattle()
    const effectAt = (id: 'attack' | 'vitality' | 'bounty', lvl: number): number => {
      b.battleUpgrades.value = { ...b.battleUpgrades.value, [id]: lvl }
      return b.upgradeEffectMult(id)
    }
    // Unchanged up to the seam.
    expect(effectAt('attack', 100)).toBeCloseTo(13, 9)
    expect(effectAt('vitality', 100)).toBeCloseTo(15, 9)
    expect(effectAt('bounty', 25)).toBeCloseTo(3, 9)
    expect(effectAt('bounty', 10)).toBeCloseTo(1.8, 9)

    // Every deep level is worth what the last capped level was, relatively:
    // War Horns +1.38%, Vitality +1.4%, Bounty +2.67%.
    const perLevel = { attack: 0.18 / 13, vitality: 0.21 / 15, bounty: 0.08 / 3 }
    for (const id of ['attack', 'vitality', 'bounty'] as const) {
      const seam = SEAM[id]
      const lastCapped = effectAt(id, seam) - effectAt(id, seam - 1)
      const firstDeep = effectAt(id, seam + 1) - effectAt(id, seam)
      expect(firstDeep / lastCapped).toBeGreaterThan(0.95)
      expect(firstDeep / lastCapped).toBeLessThan(1.1)
      for (const past of [1, 40, 200]) {
        const ratio = effectAt(id, seam + past) / effectAt(id, seam + past - 1)
        expect(ratio).toBeCloseTo(1 + perLevel[id], 9)
      }
      expect(Number.isFinite(effectAt(id, 1_000))).toBe(true)
    }
  })

  it('Vitality past 100 reaches deployed fighters', async () => {
    const b = await importBattle()
    b.battleUpgrades.value = { ...b.battleUpgrades.value, vitality: 100 }
    b.deployFighter(20)
    const atSeam = b.fighters.value.at(-1)!.maxHp
    b.battleUpgrades.value = { ...b.battleUpgrades.value, vitality: 150 }
    b.deployFighter(20)
    const deep = b.fighters.value.at(-1)!.maxHp
    expect(deep / atSeam).toBeCloseTo(Math.pow(1 + 0.21 / 15, 50), 2)
  })

  it('the Imp keeps merging faster, with no floor', async () => {
    const b = await importBattle()
    const cadenceAt = (lvl: number): number => {
      b.battleUpgrades.value = { ...b.battleUpgrades.value, automation: lvl }
      return b.impCadenceMs.value
    }
    expect(cadenceAt(0)).toBe(0)
    expect(cadenceAt(25)).toBe(700)
    expect(cadenceAt(26)).toBeCloseTo(672, 6)
    for (let lvl = 26; lvl <= 200; lvl++) {
      expect(cadenceAt(lvl)).toBeLessThan(cadenceAt(lvl - 1))
      expect(cadenceAt(lvl)).toBeGreaterThan(0)
    }
    expect(cadenceAt(1_000)).toBeGreaterThan(0) // still enabled at the tamper bound
  })
})

describe('deep levels in a save', () => {
  it('survive a reload instead of being clamped to the old caps', async () => {
    const { setState, flushPersist } = await import('@/use/useEpicState')
    setState('battle_upgrades', { attack: 131, vitality: 128, bounty: 64, automation: 59, recruit: 27 })
    flushPersist()
    const b = await importBattle()
    expect(b.battleUpgrades.value).toEqual({ attack: 131, vitality: 128, bounty: 64, automation: 59, recruit: 27 })
  })

  it('clamps a tampered level to the sanity bound', async () => {
    const { setState, flushPersist } = await import('@/use/useEpicState')
    setState('battle_upgrades', { attack: 1e12, bounty: -4, automation: 'x' })
    flushPersist()
    const b = await importBattle()
    expect(b.battleUpgrades.value.attack).toBe(1_000)
    expect(b.battleUpgrades.value.bounty).toBe(0)
    expect(b.battleUpgrades.value.automation).toBe(0)
  })
})

describe('deep-level imp (engine run)', () => {
  const importGame = async () => {
    vi.resetModules()
    const battle = await import('@/use/useBattle')
    const prism = await import('@/use/usePrismGame')
    return { battle, game: prism.default() }
  }

  it('merges several pairs within one 120 ms engine tick once it outpaces the tick', async () => {
    vi.useFakeTimers()
    try {
      const { battle, game } = await importGame()
      battle.battleUpgrades.value = { ...battle.battleUpgrades.value, automation: 100 } // ≈33 ms
      game.grid.value = [1, 1, 3, 3, 5, 5, 7, 7, ...Array(8).fill(0)]

      game.startEngine()
      vi.advanceTimersByTime(120) // exactly one tick
      const afterOneTick = game.grid.value.filter((t) => t > 0).length
      game.stopEngine()

      // A 700 ms imp could not have merged even once; this one merged 3 of 4.
      expect(afterOneTick).toBe(5)
    } finally {
      vi.useRealTimers()
    }
  })

  it('merges faster past level 25 than at it', async () => {
    vi.useFakeTimers()
    try {
      const mergesIn = async (lvl: number, ms: number): Promise<number> => {
        const { battle, game } = await importGame()
        battle.battleUpgrades.value = { ...battle.battleUpgrades.value, automation: lvl }
        // Plenty of T1 pairs, topped up so the imp never runs dry.
        let merges = 0
        const { watch } = await import('vue')
        const stop = watch(game.autoAction, (v) => {
          if (v?.action) {
            merges++
            game.grid.value = game.grid.value.map((t) => (t === 0 ? 1 : t > 1 ? 1 : t))
          }
        }, { flush: 'sync' })
        game.grid.value = Array(16).fill(1)
        game.startEngine()
        vi.advanceTimersByTime(ms)
        game.stopEngine()
        stop()
        return merges
      }
      const atSeam = await mergesIn(25, 12_000)
      const deep = await mergesIn(60, 12_000) // 700 × 0.96^35 ≈ 168 ms
      expect(atSeam).toBeGreaterThanOrEqual(16)
      expect(atSeam).toBeLessThanOrEqual(18)
      expect(deep).toBeGreaterThan(atSeam * 3.5)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not bank a backlog: after a long stall it acts exactly once', async () => {
    vi.useFakeTimers()
    try {
      const { battle, game } = await importGame()
      battle.battleUpgrades.value = { ...battle.battleUpgrades.value, automation: 100 } // ≈33 ms
      game.grid.value = [1, 1, 2, 2, 3, 3, 4, 4, ...Array(8).fill(0)]
      game.startEngine()
      // A minute passes with no tick at all (a paused game, a frozen tab) …
      vi.setSystemTime(Date.now() + 60_000)
      // … then one tick runs. A banked minute would be ~1,800 beats (every pair).
      vi.advanceTimersByTime(120)
      game.stopEngine()
      expect(8 - game.grid.value.filter((t) => t > 0).length).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
