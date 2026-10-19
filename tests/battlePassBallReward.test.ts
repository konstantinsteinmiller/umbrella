import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The pass re-pointed at Umbrella: every 5th tier pays a free BALL off
 * the player's own ball ladder (third-best on the 5s, second-best on the 10s,
 * the outright best at the end of the pass) — never above the watermark, so a
 * gift can never skip the tier-reveal the player is merging towards. The claim
 * owes the ball to the endless run (saved), and coins are priced in "kills at
 * the best row" so a late claim is never pocket change.
 */

/** Cancel the loaded save module's debounced blob write — otherwise it can
 *  land in the NEXT fresh store and overwrite that case's seed. */
const settleSave = async (): Promise<void> => {
  (await import('@/use/useEpicState')).flushPersist()
}

beforeEach(async () => {
  await settleSave()
  localStorage.clear()
  vi.resetModules()
})

afterEach(settleSave)

/** Fresh module graph with the barrage watermarks already in the blob. */
const withProgress = async (maxBallTier: number, bestRow = 1) => {
  await settleSave()
  localStorage.clear()
  vi.resetModules()
  const { setState } = await import('@/use/useEpicState')
  setState('umb_stats', { maxBallTier })
  setState('umb_best_row', bestRow)
  const bp = await import('@/use/useBattlePass')
  const progress = await import('@/barrage/state/progress')
  return { bp, progress }
}

describe('battle-pass ball reward', () => {
  it('pays third-best on the 5s, second-best on the 10s, best at the end', async () => {
    const { bp } = await withProgress(14)
    expect([5, 15, 25].map(bp.bpBallTier)).toEqual([12, 12, 12])
    expect([10, 20].map(bp.bpBallTier)).toEqual([13, 13])
    expect(bp.bpBallTier(30)).toBe(14)
  })

  it('never pays above the player’s own best, and never below tier 1', async () => {
    const { bp } = await withProgress(2)
    for (let stage = 5; stage <= bp.BP_TOTAL_STAGES; stage += 5) {
      const t = bp.bpReward(stage).ballTier!
      expect(t, `stage ${stage}`).toBeGreaterThanOrEqual(1)
      expect(t, `stage ${stage}`).toBeLessThanOrEqual(2)
    }
    const { bp: junk } = await withProgress(Number.NaN)
    expect(junk.bpBallTier(30)).toBe(1)
  })

  it('is never stale: the reward re-prices as the watermark moves', async () => {
    const { bp, progress } = await withProgress(5)
    expect(bp.bpBallTier(20)).toBe(4)
    progress.noteBallTier(9)
    expect(bp.bpBallTier(20)).toBe(8)
  })

  it('gives a ball on every 5th tier and nothing but coins in between', async () => {
    const { bp } = await withProgress(14)
    for (let stage = 1; stage <= bp.BP_TOTAL_STAGES; stage++) {
      const reward = bp.bpReward(stage)
      expect(reward.coins, `stage ${stage}`).toBeGreaterThan(0)
      if (stage % 5 !== 0) expect(reward.ballTier, `stage ${stage}`).toBeUndefined()
      else expect(reward.ballTier, `stage ${stage}`).toBeGreaterThan(0)
    }
  })

  it('coins scale with the best row (priced in kills at that depth)', async () => {
    const { bp: shallow } = await withProgress(3, 1)
    const low = shallow.bpCoinReward(10)
    const { bp: deep } = await withProgress(3, 90)
    const { killCoins } = await import('@/barrage/engine/economy')
    const high = deep.bpCoinReward(10)
    expect(high).toBeGreaterThan(low)
    // Same number of kills, priced at each depth (ENGINE owns the coin curve).
    expect(high / low).toBeCloseTo(killCoins(90, 'slime', false) / killCoins(1, 'slime', false), 0)
  })

  it('claiming a ball tier owes the ball to the endless run (saved) and pays the coins', async () => {
    const { bp, progress } = await withProgress(6)
    const pass = bp.default()
    pass.awardXp(bp.BP_XP_PER_STAGE * 5)
    expect(pass.unlockedStages.value).toBe(5)
    const coins = (await import('@/use/useEpicConfig')).default().coins
    const before = coins.value
    const res = pass.claimStage(5)
    expect(res).toMatchObject({ stage: 5, ballTier: 4 })
    expect(coins.value - before).toBe(res!.coins)
    expect(progress.pending.value.balls).toEqual([4])
    const { getState } = await import('@/use/useEpicState')
    expect(getState('umb_pending')).toMatchObject({ balls: [4] })
    // A plain coin tier owes nothing.
    pass.claimStage(1)
    expect(progress.pending.value.balls).toEqual([4])
  })

  it('XP per barrage event is the single table the modal shows', async () => {
    const { bp } = await withProgress(1)
    expect(bp.BARRAGE_XP_SOURCES).toEqual({ kill: 1, merge: 2, row: 1, boss: 15 })
  })
})
