// 3× coin-income buff (flying-chest rewarded offer).
//
// Two things are worth pinning down here, because both are easy to break
// silently and neither is visible in a screenshot:
//
//   1. The MULTIPLIER actually reaches coin income, and only while active.
//   2. The buff drains on PLAY time and survives a reload with the remaining
//      time intact — it is persisted as remaining-ms, not an expiry stamp, so
//      that a closed tab or a long ad break can't eat a reward the player
//      watched a video for.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const importBattle = async () => {
  vi.resetModules()
  return await import('@/use/useBattle')
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('coin buff — state + persistence', () => {
  it('starts inactive with no persisted value', async () => {
    const b = await importBattle()
    expect(b.coinBuffRemainingMs.value).toBe(0)
    expect(b.isCoinBuffActive.value).toBe(false)
  })

  it('activate grants the full 10 minutes and flips active', async () => {
    const b = await importBattle()
    b.activateCoinBuff()
    expect(b.coinBuffRemainingMs.value).toBe(b.COIN_BUFF_MS)
    expect(b.COIN_BUFF_MS).toBe(600_000)
    expect(b.isCoinBuffActive.value).toBe(true)
  })

  it('is a 3× multiplier', async () => {
    const b = await importBattle()
    expect(b.COIN_BUFF_MULT).toBe(3)
  })

  it('folds a 3× factor into coin income, and drops back to 1× when it ends', async () => {
    // `bountyMult()` is module-private; `coinBuffMult` is the same condition
    // exposed read-only, and is what bountyMult() actually multiplies by.
    const b = await importBattle()
    expect(b.coinBuffMult.value).toBe(1)

    b.activateCoinBuff()
    expect(b.coinBuffMult.value).toBe(3)

    // Expiry (the engine drains this ref) → back to no bonus.
    b.coinBuffRemainingMs.value = 0
    expect(b.coinBuffMult.value).toBe(1)
    expect(b.isCoinBuffActive.value).toBe(false)
  })

  it('a shorter cloud value cannot shorten a locally-earned buff', async () => {
    // Rehydration runs off the `saveDataVersion` watcher, so bump that rather
    // than asserting on setState alone (which would prove nothing).
    const b = await importBattle()
    const { setState } = await import('@/use/useEpicState')
    const { saveDataVersion } = await import('@/use/useSaveStatus')
    const { nextTick } = await import('vue')

    b.activateCoinBuff()
    const full = b.coinBuffRemainingMs.value

    setState('battle_coin_buff_left', 1_000) // shorter blob value arrives
    saveDataVersion.value += 1
    await nextTick()
    expect(b.coinBuffRemainingMs.value).toBe(full) // local (longer) still wins
  })

  it('a longer cloud value is adopted on rehydrate', async () => {
    const b = await importBattle()
    const { setState } = await import('@/use/useEpicState')
    const { saveDataVersion } = await import('@/use/useSaveStatus')
    const { nextTick } = await import('vue')

    expect(b.coinBuffRemainingMs.value).toBe(0)
    setState('battle_coin_buff_left', 120_000) // 2 min left on another device
    saveDataVersion.value += 1
    await nextTick()
    expect(b.coinBuffRemainingMs.value).toBe(120_000)
    expect(b.isCoinBuffActive.value).toBe(true)
  })

  it('persists remaining time, not an expiry timestamp', async () => {
    // The distinction matters: an expiry stamp would keep draining while the
    // tab is closed. Assert the stored value is a duration, not a clock time.
    const b = await importBattle()
    const { getState } = await import('@/use/useEpicState')

    b.activateCoinBuff()
    const stored = Number(getState('battle_coin_buff_left', 0))
    expect(stored).toBe(b.COIN_BUFF_MS)
    // A Date.now()-based expiry would be ~1.7e12; a duration is 6e5.
    expect(stored).toBeLessThan(Date.now() / 2)
  })
})

describe('coin buff vs GOLD RUSH — strongest wins, never both', () => {
  it('GOLD RUSH is 1.5×, weaker than the rewarded 3× buff', async () => {
    const b = await importBattle()
    expect(b.GOLD_RUSH_MULT).toBe(1.5)
    expect(b.COIN_BUFF_MULT).toBeGreaterThan(b.GOLD_RUSH_MULT)
  })

  it('combines by MAX, not by product', async () => {
    // The rule this encodes: a gold-rush wave under the coin buff pays 3×, not
    // 4.5×. Asserted on the combination itself, since the multiplier that
    // implements it (`killBoostMult`) is module-private.
    const b = await importBattle()
    const combine = (coin: number, rush: number): number => Math.max(coin, rush)

    expect(combine(1, 1)).toBe(1)                                   // neither
    expect(combine(1, b.GOLD_RUSH_MULT)).toBe(1.5)                  // rush only
    expect(combine(b.COIN_BUFF_MULT, 1)).toBe(3)                    // buff only
    expect(combine(b.COIN_BUFF_MULT, b.GOLD_RUSH_MULT)).toBe(3)     // both → 3×
    expect(combine(b.COIN_BUFF_MULT, b.GOLD_RUSH_MULT)).not.toBe(4.5)
  })
})

describe('coin buff — chest offer cadence', () => {
  // The cadence rule: every 2nd chest opened rolls 75%. Mirrors the constants
  // in FlyingChest.vue; if those change this test should change with them.
  const EVERY_NTH = 2
  const CHANCE = 0.75

  const eligible = (opens: number, roll: number, buffActive: boolean, adReady: boolean): boolean =>
    !buffActive && adReady && opens % EVERY_NTH === 0 && roll < CHANCE

  it('offers on every 2nd chest, never on the odd ones', () => {
    // `opens` is the post-increment count, so chest #2 → opens === 2.
    expect(eligible(1, 0.1, false, true)).toBe(false)
    expect(eligible(2, 0.1, false, true)).toBe(true)
    expect(eligible(3, 0.1, false, true)).toBe(false)
    expect(eligible(4, 0.1, false, true)).toBe(true)
  })

  it('respects the 75% roll on an eligible chest', () => {
    expect(eligible(2, 0.74, false, true)).toBe(true)
    expect(eligible(2, 0.75, false, true)).toBe(false)
    expect(eligible(2, 0.99, false, true)).toBe(false)
  })

  it('never offers while a coin buff is already running', () => {
    // Stacking would overwrite the timer and waste the video.
    expect(eligible(2, 0.1, true, true)).toBe(false)
  })

  it('never offers when no rewarded ad can fill (readiness gating)', () => {
    expect(eligible(2, 0.1, false, false)).toBe(false)
  })
})
