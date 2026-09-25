import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

/**
 * The engine-free meta around the run: the upgrade shop's single glowing track,
 * the launcher / ball-skin collection, the Daily Barrage record, the treasure
 * chest, the re-pointed achievements, and the save-field names.
 */

const STATE_KEY = 'elemental-barrage_state'

const seed = (blob: Record<string, unknown>): void => {
  localStorage.setItem(STATE_KEY, JSON.stringify(blob))
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(async () => {
  // Cancel this case's debounced blob write before the next case installs a
  // fresh store — a late write would overwrite the next case's seed.
  (await import('@/use/useEpicState')).flushPersist()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('save-field names are load-bearing', () => {
  it('pins every eb_ field literal', async () => {
    const k = await import('@/barrage/keys')
    expect({
      run: k.EB_RUN_KEY, best: k.EB_BEST_ROW_KEY, cp: k.EB_CHECKPOINT_KEY, up: k.EB_UPGRADES_KEY,
      stats: k.EB_STATS_KEY, seg: k.EB_SEGMENT_KEY, ftue: k.EB_FTUE_KEY, coll: k.EB_COLLECTIONS_KEY,
      daily: k.EB_DAILY_KEY, supply: k.EB_SUPPLY_KEY, pending: k.EB_PENDING_KEY, merge: k.EB_MERGE_SCORE_KEY,
      tut: k.EB_TUTORIAL_STEP_KEY, monsters: k.EB_MONSTERS_SEEN_KEY
    }).toEqual({
      run: 'eb_run', best: 'eb_best_row', cp: 'eb_checkpoint', up: 'eb_upgrades', stats: 'eb_stats',
      seg: 'eb_segment', ftue: 'eb_ftue', coll: 'eb_collections', daily: 'eb_daily', supply: 'eb_supply',
      pending: 'eb_pending', merge: 'epic_stage', tut: 'eb_tutorial_step', monsters: 'eb_ui_monsters_seen'
    })
  })
})

describe('upgrades: exactly one glows', () => {
  it('the pure rule (glowTrack): the cheaper affordable POWER track, else the cheapest other, else none', async () => {
    const { glowTrack, upgradeCost, upgradeMaxLevel } = await import('@/barrage/engine/economy')
    const lv = (o: Partial<Record<'damage' | 'capacity' | 'speed' | 'luck' | 'bounty', number>> = {}) =>
      ({ damage: 0, capacity: 0, speed: 0, luck: 0, bounty: 0, ...o })
    const cost = (id: 'damage' | 'capacity' | 'speed' | 'luck' | 'bounty', l: number) => upgradeCost(id, l)
    // Run 4's moment: free capacity + the first Damage bought. Launch Speed is
    // the cheapest chip, yet the cheapest POWER track glows once affordable.
    const afterFirstDamage = lv({ damage: 1, capacity: 1 })
    expect(cost('speed', 0)).toBeLessThan(cost('capacity', 1))
    expect(glowTrack(afterFirstDamage, cost('capacity', 1))).toBe('capacity')
    expect(glowTrack(afterFirstDamage, 1e6)).toBe(cost('capacity', 1) <= cost('damage', 1) ? 'capacity' : 'damage')
    // Neither power track affordable: the cheapest affordable other track.
    expect(glowTrack(afterFirstDamage, cost('speed', 0))).toBe('speed')
    // Nothing affordable: nothing glows.
    expect(glowTrack(afterFirstDamage, cost('speed', 0) - 1)).toBeNull()
    expect(glowTrack(lv(), 0)).toBeNull()
    // The FTUE's free capacity claimed: Damage (the funnel's arrows) is the
    // cheaper power track, so the arrows and the glow agree.
    expect(cost('damage', 0)).toBeLessThan(cost('capacity', 1))
    expect(glowTrack(lv({ capacity: 1 }), cost('damage', 0))).toBe('damage')
    expect(glowTrack(lv({ capacity: 1 }), 1e6)).toBe('damage')
    // The cheaper power track wins, whichever it is.
    expect(glowTrack(lv({ damage: 3, capacity: 1 }), 1e6)).toBe('capacity')
    expect(glowTrack(lv({ damage: 1, capacity: 6 }), 1e6)).toBe('damage')
    // A maxed power track never glows; the other one does.
    const capMax = upgradeMaxLevel('capacity')!
    expect(glowTrack(lv({ capacity: capMax, damage: 30 }), 1e30)).toBe('damage')
    expect(glowTrack(lv({ capacity: capMax, damage: 30 }), cost('damage', 30) - 1)).toBe('speed')
  })

  it('a price tie between the power tracks glows Damage; a tie among the others, the one listed first', async () => {
    const eco = await import('@/barrage/engine/economy')
    const base = { ...eco.ECONOMY.costBase }
    try {
      Object.assign(eco.ECONOMY.costBase, { damage: 40, capacity: 40, speed: 20, luck: 20, bounty: 20 })
      const zero = { damage: 0, capacity: 0, speed: 0, luck: 0, bounty: 0 }
      expect(eco.glowTrack(zero, 40)).toBe('damage')
      expect(eco.glowTrack(zero, 39)).toBe('speed')
    } finally {
      Object.assign(eco.ECONOMY.costBase, base)
    }
  })

  it('the live list lights the glowTrack track, buys it, and moves the glow', async () => {
    // Prices come from ENGINE's tuned economy — read them, never hard-code them.
    const { glowTrack, upgradeCost, upgradeValue } = await import('@/barrage/engine/economy')
    const levels = { damage: 1, capacity: 1, speed: 0, luck: 0, bounty: 0 }
    const price = upgradeCost('capacity', 1)
    seed({ epic_coins: price, eb_upgrades: levels })
    const up = (await import('@/barrage/state/useBarrageUpgrades')).default()
    const wallet = (await import('@/use/useEpicConfig')).default()
    const glowing = () => up.list.value.filter((v) => v.glowing).map((v) => v.id)
    expect(glowTrack(levels, price)).toBe('capacity')
    // Launch Speed is cheaper and affordable too — it wears only the quiet glow.
    expect(up.list.value.find((v) => v.id === 'speed')).toMatchObject({ affordable: true, glowing: false })
    expect(glowing()).toEqual(['capacity'])
    expect(up.glowingId.value).toBe('capacity')
    expect(up.buy('capacity')).toBe(true)
    expect(wallet.coins.value).toBe(0)
    expect(up.list.value.find((v) => v.id === 'capacity')).toMatchObject({ level: 2, value: upgradeValue('capacity', 2) })
    // Broke: nothing glows, nothing sells.
    expect(glowing()).toEqual([])
    expect(up.buy('damage')).toBe(false)
    // Only a non-power track affordable: it glows.
    wallet.addCoins(upgradeCost('speed', 0))
    expect(glowing()).toEqual(['speed'])
    wallet.addCoins(1e9)
    expect(glowing()).toHaveLength(1)
    expect(['damage', 'capacity']).toContain(up.glowingId.value)
  })

  it('run 10: a buy is one level — the glowing chip too (the multi-buy is gone)', async () => {
    const levels = { damage: 1, capacity: 1, speed: 0, luck: 0, bounty: 0 }
    seed({ epic_coins: 400, eb_upgrades: levels })
    const up = (await import('@/barrage/state/useBarrageUpgrades')).default()
    const first = up.glowingId.value!
    const before = up.list.value.find((v) => v.id === first)!.level
    expect(up.buy(first)).toBe(true)
    expect(up.list.value.find((v) => v.id === first)!.level).toBe(before + 1)
    expect((up as unknown as Record<string, unknown>).buyGlowing).toBeUndefined()
  })

  it('run 8: the free first Damage level — armed by the coach, one gift at a time, claimed once', async () => {
    seed({ epic_coins: 50, eb_upgrades: { damage: 0, capacity: 1, speed: 0, luck: 0, bounty: 0 }, eb_ftue: { firstMerge: true, freeCapacity: true } })
    const up = (await import('@/barrage/state/useBarrageUpgrades')).default()
    const wallet = (await import('@/use/useEpicConfig')).default()
    expect(up.freeDamageOffer.value).toBe(false)
    expect(up.freeId.value).toBeNull()
    up.offerFreeDamage()
    expect(up.freeDamageOffer.value).toBe(true)
    expect(up.freeId.value).toBe('damage')
    up.claimFree()
    expect(up.list.value.find((v) => v.id === 'damage')!.level).toBe(1)
    expect(wallet.coins.value).toBe(50)
    expect(up.freeDamageOffer.value).toBe(false)
    // Never again, and never to a player who owns a Damage level.
    up.offerFreeDamage()
    expect(up.freeDamageOffer.value).toBe(false)
  })

  it('run 8: the Capacity gift comes first — no free Damage while it is open', async () => {
    seed({ epic_coins: 50, eb_upgrades: { damage: 0, capacity: 0, speed: 0, luck: 0, bounty: 0 }, eb_ftue: { firstMerge: true } })
    const up = (await import('@/barrage/state/useBarrageUpgrades')).default()
    up.offerFreeDamage()
    expect(up.freeId.value).toBe('capacity')
    expect(up.freeDamageOffer.value).toBe(false)
    up.claimFree()
    expect(up.freeId.value).toBe('damage')
  })

  it('a maxed track never glows, reports no next value, and cannot be bought', async () => {
    seed({ epic_coins: 1e12, eb_upgrades: { damage: 0, capacity: 15, speed: 10, luck: 10, bounty: 0 } })
    const up = (await import('@/barrage/state/useBarrageUpgrades')).default()
    const cap = up.list.value.find((v) => v.id === 'capacity')!
    expect(cap).toMatchObject({ maxed: true, nextValue: null, glowing: false, cost: 0, value: 40 })
    expect(up.buy('capacity')).toBe(false)
    expect(up.glowingId.value).toBe('damage')
  })

  it('the FTUE free capacity is offered on its own state, whatever glows', async () => {
    const { upgradeCost } = await import('@/barrage/engine/economy')
    seed({ epic_coins: upgradeCost('capacity', 0), eb_ftue: { firstMerge: true } })
    const up = (await import('@/barrage/state/useBarrageUpgrades')).default()
    expect(up.freeCapacityOffer.value).toBe(true)
    up.claimFreeCapacity()
    expect(up.freeCapacityOffer.value).toBe(false)
    expect(up.list.value.find((v) => v.id === 'capacity')!.level).toBe(1)
  })
})

describe('collections', () => {
  it('launchers: tier 1 owned; a tier is seen once a ball of it was made; buying needs both sight and coins', async () => {
    seed({ epic_coins: 5000, eb_stats: { maxBallTier: 3 } })
    const c = (await import('@/barrage/state/useCollections')).default()
    const { launcherPrice } = await import('@/barrage/state/useCollections')
    expect(c.launchers.value).toHaveLength(50)
    expect(c.launchers.value[0]).toMatchObject({ tier: 1, owned: true, seen: true, selected: true, price: 0 })
    expect(c.launchers.value[2]).toMatchObject({ tier: 3, seen: true, owned: false, affordable: true })
    expect(c.launchers.value[3]).toMatchObject({ tier: 4, seen: false })
    // Price grows with the tier.
    for (let t = 2; t < 50; t++) expect(launcherPrice(t + 1)).toBeGreaterThan(launcherPrice(t))
    expect(c.buyLauncher(4)).toBe(false) // unseen
    expect(c.buyLauncher(3)).toBe(true)
    expect(c.selectedLauncher.value).toBe(3)
    c.selectLauncher(1)
    expect(c.selectedLauncher.value).toBe(1)
    c.selectLauncher(9) // not owned
    expect(c.selectedLauncher.value).toBe(1)
  })

  it('skins: orb owned; buy + select persist across a reload', async () => {
    seed({ epic_coins: 3000 })
    const c = (await import('@/barrage/state/useCollections')).default()
    expect(c.skins.value).toHaveLength(12)
    expect(c.skins.value.find((s) => s.id === 'orb')).toMatchObject({ owned: true, selected: true })
    expect(c.buySkin('tide')).toBe(false) // 5,000
    expect(c.buySkin('stone')).toBe(true) // 2,000
    expect(c.selectedSkin.value).toBe('stone')
    ;(await import('@/use/useEpicState')).flushPersist()
    vi.resetModules()
    const again = (await import('@/barrage/state/useCollections')).default()
    expect(again.selectedSkin.value).toBe('stone')
    expect(again.skins.value.find((s) => s.id === 'stone')!.owned).toBe(true)
  })

  it('retired skins are paid back once at their old price, and an equipped one falls back to orb', async () => {
    seed({
      epic_coins: 100,
      eb_collections: { skins: ['orb', 'baseball', 'lava', 'rainbow', 'bogus'], selectedSkin: 'rainbow', launchers: [1], selectedLauncher: 1 }
    })
    const c = (await import('@/barrage/state/useCollections')).default()
    const wallet = (await import('@/use/useEpicConfig')).default()
    expect(wallet.coins.value).toBe(100 + 4_000 + 100_000_000)
    expect(c.selectedSkin.value).toBe('orb')
    expect(c.skins.value.find((s) => s.id === 'lava')!.owned).toBe(true) // still in the catalogue: kept
    const state = await import('@/use/useEpicState')
    state.flushPersist()
    vi.resetModules()
    await import('@/barrage/state/useCollections')
    const again = (await import('@/use/useEpicConfig')).default()
    expect(again.coins.value).toBe(100 + 4_000 + 100_000_000) // never twice
  })

  it('a hydrated save that still lists a retired skin pays only if its own ledger has not', async () => {
    seed({ epic_coins: 0, eb_collections: { skins: ['orb', 'pot'], refunded: ['pot'] } })
    await import('@/barrage/state/useCollections')
    const wallet = (await import('@/use/useEpicConfig')).default()
    expect(wallet.coins.value).toBe(0)
  })

  it('NEW badges: a discovered launcher / a newly affordable skin, until looked at', async () => {
    seed({ epic_coins: 0, eb_stats: { maxBallTier: 1 } })
    const c = (await import('@/barrage/state/useCollections')).default()
    const progress = await import('@/barrage/state/progress')
    const wallet = (await import('@/use/useEpicConfig')).default()
    expect(c.hasNew.value).toBe(false)
    progress.noteBallTier(2)
    expect(c.launchers.value[1]!.isNew).toBe(true)
    expect(c.hasNew.value).toBe(true)
    c.markLaunchersSeen()
    expect(c.hasNew.value).toBe(false)
    wallet.addCoins(2500)
    expect(c.skins.value.find((s) => s.id === 'stone')!.isNew).toBe(true)
    c.markSkinsSeen()
    expect(c.hasNew.value).toBe(false)
  })
})

describe('Daily Barrage record', () => {
  it('counts attempts per local day, keeps the best, and builds a streak', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-23T09:00:00'))
    const d = await import('@/barrage/state/useDailyBarrage')
    const { dailySeed } = await import('@/barrage/engine/economy')
    const api = d.default()
    expect(api.today.value).toBe('2026-09-23')
    expect(api.seed.value).toBe(dailySeed('2026-09-23'))

    d.recordDailyAttempt()
    expect(d.recordDailyRow(8)).toBe(true)
    expect(d.recordDailyRow(5)).toBe(false)
    d.recordDailyAttempt()
    expect(api.attemptsToday.value).toBe(2)
    expect(api.todayBest.value).toBe(8)
    expect(api.streak.value).toBe(1)

    vi.setSystemTime(new Date('2026-09-24T20:00:00'))
    d.default() // refresh the clock outside a component
    expect(api.todayBest.value).toBe(0)
    expect(api.attemptsToday.value).toBe(0)
    expect(api.streak.value).toBe(1) // still alive the day after
    d.recordDailyAttempt()
    expect(api.streak.value).toBe(2)

    vi.setSystemTime(new Date('2026-09-27T08:00:00'))
    d.default()
    expect(api.streak.value).toBe(0) // broken
    d.recordDailyAttempt()
    expect(api.streak.value).toBe(1)
    expect(d.dailyRecord.value.bestEver).toBe(8)
  })
})

describe('treasure chest (small gift at 3 min, big at 10)', () => {
  const T0 = new Date('2026-09-23T09:00:00').getTime()
  const MIN = 60_000

  it('arrives filled to the small gift, then refills: small at 3 min, big at 10', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    seed({ eb_best_row: 40 })
    const s = await import('@/barrage/state/useSupplyDrop')
    const wallet = (await import('@/use/useEpicConfig')).default()
    const api = s.default()
    api.arm() // first sight of the chest
    expect(api.stage.value).toBe('small')
    const first = api.claim()
    expect(first).toEqual({ coins: s.chestCoins('small', 40), skill: null, stage: 'small' })
    expect(wallet.coins.value).toBe(first!.coins)
    expect(api.stage.value).toBe('cooldown')
    expect(api.claim()).toBeNull()
    expect(api.msLeft.value).toBe(s.CHEST_SMALL_MS)

    vi.setSystemTime(T0 + 3 * MIN - 1000)
    s.default()
    expect(api.stage.value).toBe('cooldown')
    expect(api.msLeft.value).toBe(1000)
    vi.setSystemTime(T0 + 3 * MIN)
    s.default()
    expect(api.stage.value).toBe('small')
    expect(api.msLeft.value).toBe(7 * MIN) // until the big one
    vi.setSystemTime(T0 + 10 * MIN)
    s.default()
    expect(api.stage.value).toBe('big')
    expect(api.msLeft.value).toBe(0)
    expect(api.progress.value).toBe(1)
  })

  it('arming is a first-sight thing only: it never refills a claimed chest', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    seed({ eb_supply: T0 - 60_000 }) // claimed a minute ago
    const s = await import('@/barrage/state/useSupplyDrop')
    const api = s.default()
    api.arm()
    expect(api.stage.value).toBe('cooldown')
    expect(api.msLeft.value).toBe(2 * MIN)
  })

  it('the big gift is four times the small one; only the big one can carry a skill charge', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    seed({ eb_best_row: 30, eb_supply: T0 - 4 * MIN })
    const s = await import('@/barrage/state/useSupplyDrop')
    const progress = await import('@/barrage/state/progress')
    vi.spyOn(Math, 'random').mockReturnValue(0.01) // would always roll a charge
    const small = s.default().claim()
    expect(small!.stage).toBe('small')
    expect(small!.skill).toBeNull()
    vi.setSystemTime(T0 + 10 * MIN)
    const big = s.default().claim()
    expect(big!.stage).toBe('big')
    expect(big!.skill).toBe(s.CHEST_SKILLS[0])
    expect(progress.pending.value.skills).toEqual([s.CHEST_SKILLS[0]])
    expect(big!.coins).toBe(4 * small!.coins)
  })

  it('a deeper best row pays more, and a brand-new player still gets a real gift', async () => {
    const s = await import('@/barrage/state/useSupplyDrop')
    expect(s.chestCoins('big', 80)).toBeGreaterThan(s.chestCoins('big', 20))
    expect(s.chestCoins('small', 0)).toBeGreaterThanOrEqual(30)
    expect(s.chestCoins('big', 0)).toBeGreaterThanOrEqual(120)
    expect(s.stageAt(0)).toBe('cooldown')
    expect(s.stageAt(s.CHEST_SMALL_MS)).toBe('small')
    expect(s.stageAt(s.CHEST_BIG_MS)).toBe('big')
  })
})

describe('achievements run on barrage stats', () => {
  it('completes, claims once, and toasts the moment a counter crosses its target', async () => {
    seed({ eb_stats: { kills: 99 } })
    const a = await import('@/use/useAchievements')
    const progress = await import('@/barrage/state/progress')
    const wallet = (await import('@/use/useEpicConfig')).default()
    const ach = a.default()
    const row = () => ach.list.value.find((x) => x.id === 'kills100')!
    expect(row().complete).toBe(false)
    progress.bumpStats({ kills: 1 })
    await nextTick()
    expect(row()).toMatchObject({ complete: true, claimable: true, current: 100 })
    expect(a.achievementToast.value?.id).toBe('kills100')
    const reward = a.ACHIEVEMENTS.find((x) => x.id === 'kills100')!.reward
    expect(reward).toBeGreaterThan(0)
    const before = wallet.coins.value
    expect(ach.claim('kills100')).toBe(reward)
    expect(wallet.coins.value - before).toBe(reward)
    expect(ach.claim('kills100')).toBe(0)
  })

  it('reads the best row and the max ball tier', async () => {
    seed({ eb_best_row: 31, eb_stats: { maxBallTier: 5 } })
    const a = (await import('@/use/useAchievements')).default()
    const byId = (id: string) => a.list.value.find((x) => x.id === id)!
    expect(byId('row30').complete).toBe(true)
    expect(byId('row60').complete).toBe(false)
    expect(byId('tier5').complete).toBe(true)
    expect(byId('tier7').current).toBe(5)
  })

  it('a cloud hydrate that raises the counters does not fire stale toasts', async () => {
    const a = await import('@/use/useAchievements')
    const state = await import('@/use/useEpicState')
    const save = await import('@/use/useSaveStatus')
    await import('@/barrage/state/progress')
    a.default()
    localStorage.setItem(STATE_KEY, JSON.stringify({ eb_stats: { kills: 5000, bossKills: 12 } }))
    state.reloadEpicState()
    save.saveDataVersion.value++
    await nextTick()
    expect(a.achievementToast.value).toBeNull()
    expect(a.default().pendingCount.value).toBeGreaterThan(0)
  })
})
