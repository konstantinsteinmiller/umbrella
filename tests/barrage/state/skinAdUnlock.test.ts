import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Ball skins unlocked with rewarded ads: the only way in past stone, stone's
 * alternative to coins. Ad FIRST (the count only moves on a granted reward),
 * rarity-scaled counts kept per skin across a reload and merged on hydrate,
 * readiness-gated, and absent on coin-mode builds (every coin price stays).
 */

const ctl = vi.hoisted(() => ({
  coinMode: false,
  grant: true,
  ready: null as null | { value: boolean },
  showRewardedAd: null as null | ReturnType<typeof vi.fn>
}))

vi.mock('@/use/useUser', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get buffsCostCoins() { return ctl.coinMode }
}))

vi.mock('@/use/useAds', async () => {
  const { ref } = await import('vue')
  ctl.ready = ref(true)
  ctl.showRewardedAd = vi.fn(async () => ctl.grant)
  return { isRewardedReady: ctl.ready, showRewardedAd: ctl.showRewardedAd }
})

const STATE_KEY = 'elemental-barrage_state'
const seed = (blob: Record<string, unknown>): void => {
  localStorage.setItem(STATE_KEY, JSON.stringify(blob))
}
const load = async () => (await import('@/barrage/state/useCollections')).default()

beforeEach(() => {
  vi.resetModules()
  ctl.coinMode = false
  ctl.grant = true
  // The mocked module outlives `resetModules`: reset its state per case.
  if (ctl.ready) ctl.ready.value = true
  ctl.showRewardedAd?.mockClear()
})

afterEach(async () => {
  (await import('@/use/useEpicState')).flushPersist()
  vi.restoreAllMocks()
})

describe('ball skins: rewarded-ad unlock', () => {
  it('every purchasable skin needs 1 or 2 ads, never more; orb needs none', async () => {
    const { BALL_SKINS, skinAdsNeeded, SKIN_ADS_BY_RARITY } = await import('@/barrage/ballSkins')
    expect(skinAdsNeeded(BALL_SKINS.find((s) => s.id === 'orb')!)).toBe(0)
    for (const def of BALL_SKINS.filter((s) => s.price > 0)) {
      expect(skinAdsNeeded(def), def.id).toBeGreaterThan(0)
      expect(skinAdsNeeded(def), def.id).toBeLessThanOrEqual(2)
    }
    const r = SKIN_ADS_BY_RARITY
    expect(r.common).toBeLessThanOrEqual(r.rare)
    expect(r.rare).toBeLessThanOrEqual(r.epic)
    expect(r.epic).toBeLessThanOrEqual(r.legendary)
  })

  it('a save that already watched 2+ ads towards a skin (old 3- and 5-ad counts) owns it', async () => {
    seed({ epic_coins: 0, eb_collections: { skins: ['orb'], adViews: { lava: 2, eclipse: 4, glow: 1 } } })
    const c = await load()
    const view = (id: string) => c.skins.value.find((s) => s.id === id)!
    expect(view('lava').owned).toBe(true)
    expect(view('eclipse').owned).toBe(true)
    expect(view('glow')).toMatchObject({ owned: false, adsNeeded: 2, adsWatched: 1 })
    // Owned, not forced on: the equipped skin stays the player's choice.
    expect(c.selectedSkin.value).toBe('orb')
    expect(await c.watchSkinAd('eclipse')).toBe('none')
    expect(ctl.showRewardedAd).not.toHaveBeenCalled()
  })

  it('only the first two skins are coin skins: every skin past stone is ad-only', async () => {
    const { BALL_SKINS } = await import('@/barrage/ballSkins')
    expect(BALL_SKINS.slice(0, 2).map((s) => s.id)).toEqual(['orb', 'stone'])
    expect(BALL_SKINS.slice(0, 2).every((s) => !s.adOnly)).toBe(true)
    expect(BALL_SKINS.slice(2).every((s) => s.adOnly)).toBe(true)
  })

  it('coins cannot buy an ad-only skin however many there are; stone still sells for coins', async () => {
    seed({ epic_coins: 1_000_000_000 })
    const c = await load()
    const wallet = (await import('@/use/useEpicConfig')).default()
    const view = (id: string) => c.skins.value.find((s) => s.id === id)!
    for (const s of c.skins.value.filter((v) => v.id !== 'orb' && v.id !== 'stone')) {
      expect(s, s.id).toMatchObject({ adOnly: true, affordable: false, isNew: false })
    }
    expect(c.buySkin('tide')).toBe(false)
    expect(c.buySkin('eclipse')).toBe(false)
    expect(wallet.coins.value).toBe(1_000_000_000)
    expect(view('tide').owned).toBe(false)
    // NEW badges only for what coins can act on: stone, never an ad-only skin.
    expect(view('stone')).toMatchObject({ adOnly: false, affordable: true, isNew: true })
    expect(c.buySkin('stone')).toBe(true)
    expect(wallet.coins.value).toBe(1_000_000_000 - 2_000)
    // The ad is the way in.
    expect(await c.watchSkinAd('tide')).toBe('unlocked')
    expect(view('tide')).toMatchObject({ owned: true, selected: true })
  })

  it('an ad-only skin a save already bought with coins stays owned', async () => {
    seed({ epic_coins: 0, eb_collections: { skins: ['orb', 'lava'], selectedSkin: 'lava' } })
    const c = await load()
    expect(c.skins.value.find((s) => s.id === 'lava')).toMatchObject({ owned: true, selected: true })
  })

  it('coin-mode builds (no rewarded ads) keep every coin price', async () => {
    ctl.coinMode = true
    seed({ epic_coins: 5_000 })
    const c = await load()
    expect(c.skins.value.every((s) => !s.adOnly)).toBe(true)
    expect(c.skins.value.find((s) => s.id === 'tide')).toMatchObject({ affordable: true })
    expect(c.buySkin('tide')).toBe(true)
  })

  it('a common unlocks and equips after one ad, without spending a coin', async () => {
    seed({ epic_coins: 0 })
    const c = await load()
    const wallet = (await import('@/use/useEpicConfig')).default()
    expect(c.skinAdReady.value).toBe(true)
    expect(await c.watchSkinAd('stone')).toBe('unlocked')
    expect(ctl.showRewardedAd).toHaveBeenCalledTimes(1)
    expect(c.skins.value.find((s) => s.id === 'stone')).toMatchObject({ owned: true, selected: true })
    expect(c.selectedSkin.value).toBe('stone')
    expect(wallet.coins.value).toBe(0)
    // Owned now: no further ad is played for it.
    expect(await c.watchSkinAd('stone')).toBe('none')
    expect(ctl.showRewardedAd).toHaveBeenCalledTimes(1)
  })

  it('a two-ad skin counts up, survives a reload, and unlocks on the second ad', async () => {
    seed({ epic_coins: 0 })
    const c = await load()
    expect(c.skins.value.find((s) => s.id === 'eclipse')).toMatchObject({ adsNeeded: 2, adsWatched: 0, owned: false })
    expect(await c.watchSkinAd('eclipse')).toBe('progress')
    expect(c.skins.value.find((s) => s.id === 'eclipse')).toMatchObject({ adsWatched: 1, owned: false })
    expect(c.selectedSkin.value).toBe('orb')
    ;(await import('@/use/useEpicState')).flushPersist()
    vi.resetModules()
    const again = await load()
    expect(again.skins.value.find((s) => s.id === 'eclipse')!.adsWatched).toBe(1)
    expect(await again.watchSkinAd('eclipse')).toBe('unlocked')
    expect(again.skins.value.find((s) => s.id === 'eclipse')).toMatchObject({ owned: true, selected: true })
  })

  it('ad FIRST: a no-fill or skipped ad moves nothing', async () => {
    seed({ epic_coins: 0 })
    const c = await load()
    ctl.grant = false
    expect(await c.watchSkinAd('gale')).toBe('none')
    expect(c.skins.value.find((s) => s.id === 'gale')).toMatchObject({ adsWatched: 0, owned: false })
  })

  it('readiness-gated: no ad is requested while none can fill', async () => {
    seed({ epic_coins: 0 })
    const c = await load()
    ctl.ready!.value = false
    expect(c.skinAdReady.value).toBe(false)
    expect(await c.watchSkinAd('stone')).toBe('none')
    expect(ctl.showRewardedAd).not.toHaveBeenCalled()
  })

  it('coin-mode builds have no rewarded ads: the coin price is the only way in', async () => {
    ctl.coinMode = true
    seed({ epic_coins: 0 })
    const c = await load()
    expect(c.skinAdReady.value).toBe(false)
    expect(await c.watchSkinAd('stone')).toBe('none')
    expect(ctl.showRewardedAd).not.toHaveBeenCalled()
  })

  it('one ad at a time: a second tap while an ad runs is refused', async () => {
    seed({ epic_coins: 0 })
    const c = await load()
    let finish: (v: boolean) => void = () => {}
    ctl.showRewardedAd!.mockImplementationOnce(() => new Promise<boolean>((r) => { finish = r }))
    const first = c.watchSkinAd('gale')
    expect(await c.watchSkinAd('gale')).toBe('none')
    finish(true)
    expect(await first).toBe('progress')
    expect(c.skins.value.find((s) => s.id === 'gale')!.adsWatched).toBe(1)
  })

  it('hydrate keeps the higher ad count per skin (an ad watched on either device stays watched)', async () => {
    seed({ epic_coins: 0, eb_collections: { skins: ['orb'], adViews: { lava: 1 } } })
    const c = await load()
    const { setState } = await import('@/use/useEpicState')
    const { saveDataVersion } = await import('@/use/useSaveStatus')
    const { nextTick } = await import('vue')
    // The other device ran a build that still asked 5 ads for eclipse: 3 watched there owns it here.
    setState('eb_collections', { skins: ['orb'], adViews: { eclipse: 3, gale: 1, bogus: 9 } })
    saveDataVersion.value++
    await nextTick()
    const view = (id: string) => c.skins.value.find((s) => s.id === id)!
    expect(view('lava').adsWatched).toBe(1)
    expect(view('gale').adsWatched).toBe(1)
    expect(view('eclipse').owned).toBe(true)
  })
})
