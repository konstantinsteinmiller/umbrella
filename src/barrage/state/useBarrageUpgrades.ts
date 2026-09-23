/**
 * The upgrade shop (contract: `UseBarrageUpgrades`) — five tracks priced by
 * ENGINE's `economy.ts`, one of which glows.
 *
 * Casual contract rule 3: "one obvious next upgrade". Exactly one track glows —
 * the CHEAPEST affordable one that is not maxed (ties go to the track listed
 * first) — or none when nothing is affordable. Cheapest-first is what keeps
 * purchases landing every 30–60 s early on, and it never points at a track the
 * player cannot buy.
 *
 * The live run picks new levels up through `useBarrage`'s watcher on
 * `upgradeLevels` (endless only — the daily board runs on a fixed kit).
 */
import { computed, type ComputedRef } from 'vue'
import { flushSaveNow } from '@/use/useSaveStatus'
import useEpicConfig from '@/use/useEpicConfig'
import { UPGRADE_IDS, upgradeCost, upgradeMaxLevel, upgradeValue } from '../engine/economy'
import type { UpgradeId } from '../engine/types'
import { ftue, patchFtue } from './progress'
import { setUpgradeLevel, upgradeLevels } from './upgradeLevels'
import type { UpgradeView, UseBarrageUpgrades } from './contract'

const { coins, spendCoins } = useEpicConfig()

/** Index of the view that glows: cheapest affordable, not maxed; -1 = none. */
export const pickGlowing = (views: readonly Pick<UpgradeView, 'cost' | 'affordable' | 'maxed'>[]): number => {
  let best = -1
  views.forEach((v, i) => {
    if (!v.affordable || v.maxed) return
    const cur = best >= 0 ? views[best] : undefined
    if (!cur || v.cost < cur.cost) best = i
  })
  return best
}

const list: ComputedRef<UpgradeView[]> = computed(() => {
  const views = UPGRADE_IDS.map((id): UpgradeView => {
    const level = upgradeLevels.value[id]
    const max = upgradeMaxLevel(id)
    const maxed = max !== null && level >= max
    // Maxed tracks report cost 0 (economy says Infinity) so a view that formats
    // the number without checking `maxed` shows nothing absurd.
    const cost = maxed ? 0 : upgradeCost(id, level)
    return {
      id,
      level,
      maxed,
      cost,
      affordable: !maxed && coins.value >= cost,
      glowing: false,
      value: upgradeValue(id, level),
      nextValue: maxed ? null : upgradeValue(id, level + 1)
    }
  })
  const glow = pickGlowing(views)
  const lit = glow >= 0 ? views[glow] : undefined
  if (lit) lit.glowing = true
  return views
})

const glowingId = computed<UpgradeId | null>(() => list.value.find((v) => v.glowing)?.id ?? null)

const buy = (id: UpgradeId): boolean => {
  const view = list.value.find((v) => v.id === id)
  if (!view || view.maxed || !view.affordable) return false
  if (!spendCoins(view.cost)) return false
  setUpgradeLevel(id, view.level + 1)
  // Coins spent is a hard checkpoint: a reload a moment later must not find
  // the coins back AND the level gone (or the reverse on a cloud-only build).
  void flushSaveNow()
  return true
}

/** FTUE beat (~40 s): after the first merge, one free "Tray Capacity 3" —
 *  capacity level 0 → 1 — so the tray visibly grows right after it overflowed.
 *  Never offered to a player who already bought that level. */
const freeCapacityOffer = computed(() =>
  ftue.value.firstMerge && !ftue.value.freeCapacity && upgradeLevels.value.capacity === 0)

const claimFreeCapacity = (): void => {
  if (!freeCapacityOffer.value) return
  setUpgradeLevel('capacity', 1)
  patchFtue({ freeCapacity: true })
  void flushSaveNow()
}

const api: UseBarrageUpgrades = { list, glowingId, buy, freeCapacityOffer, claimFreeCapacity }

export default function useBarrageUpgrades(): UseBarrageUpgrades {
  return api
}
