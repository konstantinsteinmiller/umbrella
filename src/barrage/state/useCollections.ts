/**
 * Elemental Barrage — launchers + ball skins (contract: `UseCollections`).
 *
 * Both are pure cosmetics (casual contract rule 1): nothing here reaches the
 * engine, so owning or equipping one can never change a run's outcome.
 *
 *   • Launchers — the 50 fighters. A fighter is SEEN once the player has made a
 *     ball of its tier (the tier ladder is the codex), bought with coins, then
 *     equippable. Tier 1 is owned from the start.
 *   • Ball skins — the catalogue in `ballSkins.ts`; `orb` is owned from the start.
 *     A skin that was retired from the catalogue is paid back at what it cost,
 *     once (`refunded` remembers which), and an equipped one falls back to orb.
 *     Skins are unlocked with rewarded ads (`SKIN_ADS_BY_RARITY`) — the only way
 *     in for every skin past stone (`adOnly`), the alternative to stone's coin
 *     price; `adViews` keeps the count per skin so the ads can be watched across
 *     sessions. Readiness-gated, and absent on coin-mode builds (no rewarded ads
 *     there), where every skin keeps its coin price.
 *
 * NEW badges: a launcher is new from the moment its tier is discovered until the
 * player opens the launcher list; a skin is new from the moment it becomes
 * affordable until the player opens the skin list — the badge always means
 * "there is something here you can act on", never just "this exists".
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { getState, setState } from '@/use/useEpicState'
import { flushSaveNow, saveDataVersion } from '@/use/useSaveStatus'
import useEpicConfig from '@/use/useEpicConfig'
import { buffsCostCoins } from '@/use/useUser'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import { BALL_SKINS, DEFAULT_BALL_SKIN, RETIRED_SKIN_PRICES, skinAdsNeeded, type BallSkinDef, type BallSkinId } from '../ballSkins'
import { FIGHTER_ART_MAX } from '../art'
import { EB_COLLECTIONS_KEY } from '../keys'
import { maxBallTier } from './progress'
import type { BallSkinView, LauncherView, SkinAdResult, UseCollections } from './contract'

export const LAUNCHER_COUNT = FIGHTER_ART_MAX

/** Round a price to two significant digits so the shop reads 1.5k / 26k / 1.5M,
 *  not 25,629. */
const nicePrice = (n: number): number => {
  if (n < 100) return Math.round(n)
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / mag) * mag
}

/**
 * Coin price of launcher `tier`. Geometric (×1.5 per tier from 1,000 at T2), so
 * the launcher for the tier a player has JUST discovered costs about what a few
 * minutes at that depth earns — never free, never a grind wall. Tier 1 is free.
 */
export const launcherPrice = (tier: number): number =>
  tier <= 1 ? 0 : nicePrice(1000 * 1.5 ** (tier - 2))

interface CollectionsState {
  launchers: number[]
  selectedLauncher: number
  skins: BallSkinId[]
  selectedSkin: BallSkinId
  seenSkins: BallSkinId[]
  seenLaunchers: number[]
  /** Retired skins this save owned and has been paid back for. */
  refunded: string[]
  /** Rewarded ads watched towards each not-yet-owned skin. */
  adViews: Partial<Record<BallSkinId, number>>
}

const SKIN_IDS: ReadonlySet<string> = new Set(BALL_SKINS.map((s) => s.id))
const isSkinId = (v: unknown): v is BallSkinId => typeof v === 'string' && SKIN_IDS.has(v)
const isRetired = (v: unknown): v is string => typeof v === 'string' && Object.prototype.hasOwnProperty.call(RETIRED_SKIN_PRICES, v)
const isLauncherTier = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= LAUNCHER_COUNT

const readAdViews = (v: unknown): Partial<Record<BallSkinId, number>> => {
  const out: Partial<Record<BallSkinId, number>> = {}
  if (!v || typeof v !== 'object') return out
  for (const [id, n] of Object.entries(v)) {
    if (isSkinId(id) && typeof n === 'number' && Number.isInteger(n) && n > 0) out[id] = n
  }
  return out
}

/** Per skin, the higher count: an ad watched on either device stays watched. */
const mergeAdViews = (
  a: Partial<Record<BallSkinId, number>>,
  b: Partial<Record<BallSkinId, number>>
): Partial<Record<BallSkinId, number>> => {
  const out = { ...a }
  for (const [id, n] of Object.entries(b) as [BallSkinId, number][]) out[id] = Math.max(out[id] ?? 0, n)
  return out
}

/**
 * Skins whose watched ads already reach what they need now — a save from when
 * epics took 3 ads and legendaries 5 may hold 2+ towards one: it owns it. Those
 * leave the ad ledger; the rest stay as they are.
 */
const settleAdViews = (
  adViews: Partial<Record<BallSkinId, number>>
): { earned: BallSkinId[]; adViews: Partial<Record<BallSkinId, number>> } => {
  const earned: BallSkinId[] = []
  const rest: Partial<Record<BallSkinId, number>> = {}
  for (const [id, n] of Object.entries(adViews) as [BallSkinId, number][]) {
    const def = BALL_SKINS.find((s) => s.id === id)
    const needed = def ? skinAdsNeeded(def) : 0
    if (needed > 0 && n >= needed) earned.push(id)
    else rest[id] = n
  }
  return { earned, adViews: rest }
}

const read = (): CollectionsState => {
  const raw = getState<Partial<CollectionsState> | null>(EB_COLLECTIONS_KEY, null) ?? {}
  const ads = settleAdViews(readAdViews(raw.adViews))
  const launchers = new Set<number>([1, ...(Array.isArray(raw.launchers) ? raw.launchers.filter(isLauncherTier) : [])])
  const skins = new Set<BallSkinId>([DEFAULT_BALL_SKIN, ...(Array.isArray(raw.skins) ? raw.skins.filter(isSkinId) : []), ...ads.earned])
  const selectedLauncher = isLauncherTier(raw.selectedLauncher) && launchers.has(raw.selectedLauncher) ? raw.selectedLauncher : 1
  const selectedSkin = isSkinId(raw.selectedSkin) && skins.has(raw.selectedSkin) ? raw.selectedSkin : DEFAULT_BALL_SKIN
  return {
    launchers: [...launchers].sort((a, b) => a - b),
    selectedLauncher,
    skins: [...skins],
    selectedSkin,
    seenSkins: Array.isArray(raw.seenSkins) ? raw.seenSkins.filter(isSkinId) : [],
    seenLaunchers: Array.isArray(raw.seenLaunchers) ? raw.seenLaunchers.filter(isLauncherTier) : [],
    refunded: Array.isArray(raw.refunded) ? raw.refunded.filter(isRetired) : [],
    adViews: ads.adViews
  }
}

/** Retired skins the stored save still lists as owned and was never paid for. */
const unpaidRetired = (): string[] => {
  const raw = getState<{ skins?: unknown; refunded?: unknown } | null>(EB_COLLECTIONS_KEY, null) ?? {}
  const paid = new Set(Array.isArray(raw.refunded) ? raw.refunded.filter(isRetired) : [])
  const owned = Array.isArray(raw.skins) ? raw.skins.filter(isRetired) : []
  return [...new Set(owned)].filter((id) => !paid.has(id))
}

const state: Ref<CollectionsState> = ref(read())
/** Equipped launcher / skin as plain refs (RENDER reads them every frame). */
const selectedLauncher: Ref<number> = ref(state.value.selectedLauncher)
const selectedSkin: Ref<BallSkinId> = ref(state.value.selectedSkin)

const persist = (): void => {
  state.value = { ...state.value, selectedLauncher: selectedLauncher.value, selectedSkin: selectedSkin.value }
  setState(EB_COLLECTIONS_KEY, state.value)
}

// Hydration: ownership is a union (a purchase on either device stays bought);
// the equipped items follow the hydrated save when they are owned. The refund
// ledger is the hydrated save's own: it travels with that save's coins.
watch(saveDataVersion, () => {
  const saved = read()
  const launchers = [...new Set([...state.value.launchers, ...saved.launchers])].sort((a, b) => a - b)
  const skins = [...new Set([...state.value.skins, ...saved.skins])]
  state.value = {
    launchers,
    skins,
    selectedLauncher: saved.selectedLauncher,
    selectedSkin: saved.selectedSkin,
    seenSkins: [...new Set([...state.value.seenSkins, ...saved.seenSkins])],
    seenLaunchers: [...new Set([...state.value.seenLaunchers, ...saved.seenLaunchers])],
    refunded: saved.refunded,
    adViews: mergeAdViews(state.value.adViews, saved.adViews)
  }
  selectedLauncher.value = saved.selectedLauncher
  selectedSkin.value = saved.selectedSkin
  refundRetired()
})

const { coins, addCoins, spendCoins } = useEpicConfig()

/**
 * Pay back every retired skin the save owns (baseball, clay pot, … — the
 * pre-shell catalogue) at the price it was bought for, once. The ledger is
 * written into the same save blob as the coins, so a reload can never pay twice.
 */
function refundRetired(): number {
  const due = unpaidRetired()
  if (!due.length) return 0
  const total = due.reduce((sum, id) => sum + (RETIRED_SKIN_PRICES[id] ?? 0), 0)
  addCoins(total)
  state.value = { ...state.value, refunded: [...new Set([...state.value.refunded, ...due])] }
  persist()
  return total
}
refundRetired()

const launchers: ComputedRef<LauncherView[]> = computed(() => {
  const owned = new Set(state.value.launchers)
  const seenList = new Set(state.value.seenLaunchers)
  return Array.from({ length: LAUNCHER_COUNT }, (_, i): LauncherView => {
    const tier = i + 1
    const price = launcherPrice(tier)
    const seen = tier <= maxBallTier.value
    const isOwned = owned.has(tier)
    return {
      tier,
      seen,
      owned: isOwned,
      price,
      affordable: seen && !isOwned && coins.value >= price,
      selected: selectedLauncher.value === tier,
      isNew: seen && tier > 1 && !seenList.has(tier)
    }
  })
})

/** Coins cannot buy `def` on this build: an ad-only skin wherever rewarded ads
 *  exist (coin-mode builds have none, so the coin price stays the way in). */
const adOnlyHere = (def: BallSkinDef): boolean => def.adOnly && !buffsCostCoins

const skins: ComputedRef<BallSkinView[]> = computed(() => {
  const owned = new Set(state.value.skins)
  const seen = new Set(state.value.seenSkins)
  return BALL_SKINS.map((def): BallSkinView => {
    const isOwned = owned.has(def.id)
    const adOnly = adOnlyHere(def)
    const affordable = !isOwned && !adOnly && coins.value >= def.price
    const adsNeeded = skinAdsNeeded(def)
    return {
      id: def.id,
      owned: isOwned,
      price: def.price,
      affordable,
      selected: selectedSkin.value === def.id,
      isNew: affordable && !seen.has(def.id),
      adsNeeded,
      adsWatched: Math.min(adsNeeded, state.value.adViews[def.id] ?? 0),
      adOnly
    }
  })
})

const hasNew = computed(() =>
  launchers.value.some((l) => l.isNew) || skins.value.some((s) => s.isNew))

const buyLauncher = (tier: number): boolean => {
  const view = launchers.value[tier - 1]
  if (!view || view.owned || !view.seen) return false
  if (!spendCoins(view.price)) return false
  state.value = { ...state.value, launchers: [...state.value.launchers, tier].sort((a, b) => a - b) }
  selectedLauncher.value = tier
  persist()
  void flushSaveNow()
  return true
}

const selectLauncher = (tier: number): void => {
  if (!state.value.launchers.includes(tier)) return
  selectedLauncher.value = tier
  persist()
}

const buySkin = (id: BallSkinId): boolean => {
  const def = BALL_SKINS.find((s) => s.id === id)
  if (!def || adOnlyHere(def) || state.value.skins.includes(id)) return false
  if (!spendCoins(def.price)) return false
  state.value = { ...state.value, skins: [...state.value.skins, id] }
  selectedSkin.value = id
  persist()
  void flushSaveNow()
  return true
}

/** Coin-mode builds have no rewarded ads: the coin price is the only way in. */
const skinAdReady = computed(() => !buffsCostCoins && isRewardedReady.value)
let adBusy = false

/**
 * One rewarded ad towards skin `id` — ad FIRST, the count moves only once the
 * reward is granted. The last ad needed unlocks and equips the skin. The count
 * is flushed at once: a watched ad is the player's effort and must survive a
 * closed tab. (`showRewardedAd` caps its own wait, so this can never wedge.)
 */
const watchSkinAd = async (id: BallSkinId): Promise<SkinAdResult> => {
  const def = BALL_SKINS.find((s) => s.id === id)
  if (!def || adBusy || !skinAdReady.value || state.value.skins.includes(id)) return 'none'
  const needed = skinAdsNeeded(def)
  if (needed <= 0) return 'none'
  adBusy = true
  try {
    if (!(await showRewardedAd())) return 'none'
    // A hydrate may have landed the skin while the ad ran.
    if (state.value.skins.includes(id)) return 'none'
    const watched = Math.min(needed, (state.value.adViews[id] ?? 0) + 1)
    if (watched >= needed) {
      const adViews = { ...state.value.adViews }
      delete adViews[id]
      state.value = { ...state.value, skins: [...state.value.skins, id], adViews }
      selectedSkin.value = id
    } else {
      state.value = { ...state.value, adViews: { ...state.value.adViews, [id]: watched } }
    }
    persist()
    void flushSaveNow()
    return watched >= needed ? 'unlocked' : 'progress'
  } finally {
    adBusy = false
  }
}

const selectSkin = (id: BallSkinId): void => {
  if (!state.value.skins.includes(id)) return
  selectedSkin.value = id
  persist()
}

const markSkinsSeen = (): void => {
  const fresh = skins.value.filter((s) => s.isNew).map((s) => s.id)
  if (!fresh.length) return
  state.value = { ...state.value, seenSkins: [...new Set([...state.value.seenSkins, ...fresh])] }
  persist()
}

const markLaunchersSeen = (): void => {
  const fresh = launchers.value.filter((l) => l.isNew).map((l) => l.tier)
  if (!fresh.length) return
  state.value = { ...state.value, seenLaunchers: [...new Set([...state.value.seenLaunchers, ...fresh])] }
  persist()
}

const api: UseCollections = {
  launchers,
  selectedLauncher,
  buyLauncher,
  selectLauncher,
  skins,
  selectedSkin,
  buySkin,
  skinAdReady,
  watchSkinAd,
  selectSkin,
  markSkinsSeen,
  markLaunchersSeen,
  hasNew
}

export default function useCollections(): UseCollections {
  return api
}
