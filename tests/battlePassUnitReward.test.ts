import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The pass's unit rewards used to be a fixed T4 / T5 / T6 ladder on the 10s,
 * which made them relics: anyone deep enough to finish a season merges past T6
 * long before stage 10, so the "free high-tier unit" landed as junk. The 5s
 * were worse — a two-minute Instant Spawn buff that reads as nothing.
 *
 * Every 5th tier now pays in units off the player's own codex watermark:
 * third-best on the 5s, second-best on the 10s, his outright highest at the
 * end of the pass. The authored ladder survives as a floor on the 10s, for
 * players who have not passed it yet.
 */

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

/** Fresh module graph with `prism_max_tier` already in the blob. */
const withMaxTier = async (maxTier: number) => {
  const { setState } = await import('@/use/useEpicState')
  const { PRISM_MAX_TIER_KEY } = await import('@/keys')
  setState(PRISM_MAX_TIER_KEY, maxTier)
  return import('@/use/useBattlePass')
}

describe('battle-pass unit reward', () => {
  it('pays third-best on the 5s, second-best on the 10s, best at the end', async () => {
    const { bpUnitTier } = await withMaxTier(14)
    expect([5, 15, 25].map(bpUnitTier)).toEqual([12, 12, 12])
    expect([10, 20].map(bpUnitTier)).toEqual([13, 13])
    expect(bpUnitTier(30)).toBe(14)
  })

  it('keeps the authored ladder on the 10s for a player who has not passed it', async () => {
    const { bpUnitTier } = await withMaxTier(1)
    expect(bpUnitTier(10)).toBe(4)
    expect(bpUnitTier(20)).toBe(5)
    expect(bpUnitTier(30)).toBe(6)
  })

  it('never pays below the authored floor mid-ladder', async () => {
    // Watermark 7: second-highest (6) beats stage 10's authored 4, and the
    // final tier's outright highest (7) beats its authored 6.
    const { bpUnitTier } = await withMaxTier(7)
    expect(bpUnitTier(5)).toBe(5)
    expect(bpUnitTier(10)).toBe(6)
    expect(bpUnitTier(30)).toBe(7)
  })

  it('never drops below tier 1 on a junk or tiny watermark', async () => {
    const { bpUnitTier } = await withMaxTier(0)
    expect(bpUnitTier(5)).toBeGreaterThanOrEqual(1)
    expect(bpUnitTier(10)).toBeGreaterThanOrEqual(1)
    const { bpUnitTier: t2 } = await withMaxTier(Number.NaN)
    expect(t2(30)).toBeGreaterThanOrEqual(1)
  })

  it('is never stale: the reward re-prices as the watermark moves', async () => {
    const { bpUnitTier } = await withMaxTier(5)
    expect(bpUnitTier(20)).toBe(5)
    const { setState } = await import('@/use/useEpicState')
    const { PRISM_MAX_TIER_KEY } = await import('@/keys')
    setState(PRISM_MAX_TIER_KEY, 18)
    // Same module instance, read again — this is what makes an open modal show
    // the current unit rather than the one it was built with.
    expect(bpUnitTier(20)).toBe(17)
  })

  it('gives a unit on every 5th tier and nothing but gold in between', async () => {
    const { bpReward, BP_TOTAL_STAGES } = await withMaxTier(14)
    for (let stage = 1; stage <= BP_TOTAL_STAGES; stage++) {
      const reward = bpReward(stage)
      expect(reward.coins, `stage ${stage}`).toBeGreaterThan(0)
      if (stage % 5 !== 0) {
        expect(reward.unitTier, `stage ${stage}`).toBeUndefined()
        continue
      }
      const expected = stage === BP_TOTAL_STAGES ? 14 : stage % 10 === 0 ? 13 : 12
      expect(reward.unitTier, `stage ${stage}`).toBe(expected)
    }
  })

  it('never pays a unit above the player’s own best', async () => {
    const { bpReward, BP_TOTAL_STAGES } = await withMaxTier(20)
    for (let stage = 5; stage <= BP_TOTAL_STAGES; stage += 5) {
      expect(bpReward(stage).unitTier!, `stage ${stage}`).toBeLessThanOrEqual(20)
    }
  })
})
