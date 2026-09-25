/**
 * The upgrade shop (contract: `UseBarrageUpgrades`) — five tracks priced by
 * ENGINE's `economy.ts`, one of which glows.
 *
 * Casual contract rule 3: "one obvious next upgrade". Exactly one track glows —
 * ENGINE's `glowTrack` (economy.ts): the cheaper affordable POWER track (Ball
 * Damage or Tray Capacity, tie → Damage); only when neither is affordable, the
 * cheapest affordable other track; none when nothing is affordable. It never
 * points at a track the player cannot buy (playtest run 4: the old cheapest-
 * first rule lit Launch Speed after the first Damage, and testers bought what
 * glowed while monsters outgrew their damage).
 *
 * The live run picks new levels up through `useBarrage`'s watcher on
 * `upgradeLevels` (endless only — the daily board runs on a fixed kit).
 */
import { computed, type ComputedRef } from 'vue'
import { flushSaveNow } from '@/use/useSaveStatus'
import useEpicConfig from '@/use/useEpicConfig'
import { glowTrack, UPGRADE_IDS, upgradeCost, upgradeMaxLevel, upgradeValue } from '../engine/economy'
import type { UpgradeId } from '../engine/types'
import { ftue, patchFtue } from './progress'
import { setUpgradeLevel, upgradeLevels } from './upgradeLevels'
import type { UpgradeView, UseBarrageUpgrades } from './contract'

const { coins, spendCoins } = useEpicConfig()

const list: ComputedRef<UpgradeView[]> = computed(() => {
  const glow = glowTrack(upgradeLevels.value, coins.value)
  return UPGRADE_IDS.map((id): UpgradeView => {
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
      glowing: id === glow,
      value: upgradeValue(id, level),
      nextValue: maxed ? null : upgradeValue(id, level + 1)
    }
  })
})

const glowingId = computed<UpgradeId | null>(() => list.value.find((v) => v.glowing)?.id ?? null)

/** One level of `id`, if the wallet covers it (no save — the callers flush). */
const buyOne = (id: UpgradeId): boolean => {
  const view = list.value.find((v) => v.id === id)
  if (!view || view.maxed || !view.affordable) return false
  if (!spendCoins(view.cost)) return false
  setUpgradeLevel(id, view.level + 1)
  return true
}

const buy = (id: UpgradeId): boolean => {
  if (!buyOne(id)) return false
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

/** Playtest run 8: a player who ignored the Damage arrows three times (Mia:
 *  347 coins, Damage 0 — "a stuck tutorial hint") gets the first Ball Damage
 *  level FREE, the way the Capacity gift taught everyone that the chips buy
 *  power. The coach arms it (`offerFreeDamage`); never with the Capacity
 *  gift still open, never to a player who owns a Damage level. */
const freeDamageOffer = computed(() =>
  ftue.value.freeDamageOffer && !ftue.value.freeDamage && upgradeLevels.value.damage === 0 && !freeCapacityOffer.value)

const offerFreeDamage = (): void => {
  if (ftue.value.freeDamageOffer || ftue.value.freeDamage || upgradeLevels.value.damage > 0) return
  patchFtue({ freeDamageOffer: true })
}

const claimFreeDamage = (): void => {
  if (!freeDamageOffer.value) return
  setUpgradeLevel('damage', 1)
  patchFtue({ freeDamage: true })
  void flushSaveNow()
}

/** The chip whose next level is free right now (one gift at a time). */
const freeId = computed<UpgradeId | null>(() =>
  freeCapacityOffer.value ? 'capacity' : freeDamageOffer.value ? 'damage' : null)

const claimFree = (): void => {
  if (freeCapacityOffer.value) claimFreeCapacity()
  else claimFreeDamage()
}

const api: UseBarrageUpgrades = {
  list, glowingId, buy, freeCapacityOffer, claimFreeCapacity,
  freeDamageOffer, offerFreeDamage, claimFreeDamage, freeId, claimFree
}

export default function useBarrageUpgrades(): UseBarrageUpgrades {
  return api
}
