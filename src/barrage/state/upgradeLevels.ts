/**
 * The five upgrade levels, persisted — split out of `useBarrageUpgrades` so the
 * engine owner (`useBarrage`, which applies them to the live run) and the shop
 * (`useBarrageUpgrades`, which sells them) can both import it without importing
 * each other.
 */
import { ref, watch, type Ref } from 'vue'
import { getState, setState } from '@/use/useEpicState'
import { saveDataVersion } from '@/use/useSaveStatus'
import { UPGRADE_IDS, upgradeMaxLevel } from '../engine/economy'
import type { UpgradeId, UpgradeLevels } from '../engine/types'
import { EB_UPGRADES_KEY } from '../keys'
import { toCount } from './progress'

export const zeroLevels = (): UpgradeLevels => ({ damage: 0, capacity: 0, speed: 0, luck: 0, bounty: 0 })

const clamp = (id: UpgradeId, v: unknown): number => {
  const l = toCount(v)
  const max = upgradeMaxLevel(id)
  return max === null ? l : Math.min(max, l)
}

const read = (): UpgradeLevels => {
  const raw = getState<Partial<Record<UpgradeId, unknown>> | null>(EB_UPGRADES_KEY, null) ?? {}
  const levels = zeroLevels()
  for (const id of UPGRADE_IDS) levels[id] = clamp(id, raw[id])
  return levels
}

export const upgradeLevels: Ref<UpgradeLevels> = ref(read())

export const setUpgradeLevel = (id: UpgradeId, level: number): void => {
  upgradeLevels.value = { ...upgradeLevels.value, [id]: clamp(id, level) }
  setState(EB_UPGRADES_KEY, upgradeLevels.value)
}

// Levels are bought, never sold: a hydrate takes the higher level per track.
watch(saveDataVersion, () => {
  const saved = read()
  const merged = { ...upgradeLevels.value }
  let changed = false
  for (const id of UPGRADE_IDS) {
    if (saved[id] > merged[id]) { merged[id] = saved[id]; changed = true }
  }
  if (changed) upgradeLevels.value = merged
})
