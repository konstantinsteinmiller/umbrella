/**
 * The treasure chest (contract: `UseSupplyDrop`) — Survivalist's two-stage
 * gift, not a 4-hour timer.
 *
 * Play-test: four hours is not a reason to keep playing; it is a reason to
 * forget the button exists. The Survivalist chest gave a SMALL coin gift three
 * minutes after the last claim and a BIGGER one after ten — a short, readable
 * rhythm inside one session, with a decision in it: take the small gift now,
 * or keep playing a few minutes more for the big one.
 *
 *   cooldown  (0–3 min)   nothing yet; the chest fills
 *   small     (3–10 min)  a tap pays the small gift
 *   big       (10 min +)  a tap pays the big gift — and 40 % of the time a
 *                         skill charge (Shield / Revive / Warcry) owed to the
 *                         endless run
 *
 * Wall clock (it keeps filling while the game is closed, capped at the big
 * gift). The chest arrives as an earned feature (`useFeatureUnlocks`): the
 * first time the player sees it, it is already at the small stage, so the
 * unlock itself is a gift they can open at once.
 *
 * Gifts scale with the depth the player's economy runs at (kill coins at the
 * best row, never shallower than the first boss) and with their Coin Bounty,
 * like every other coin source: the small one is ~20 kills' worth, the big one
 * ~80 — roughly a fifth of what those ten minutes of play earn.
 */
import { computed, ref, watchEffect, type ComputedRef, type Ref } from 'vue'
import { getState, setState } from '@/use/useEpicState'
import { flushSaveNow } from '@/use/useSaveStatus'
import useEpicConfig from '@/use/useEpicConfig'
import { killCoins, upgradeValue } from '../engine/economy'
import { BOSS_EVERY, type SkillId } from '../engine/types'
import { EB_SUPPLY_KEY } from '../keys'
import { now, touchClock, useTickingClock } from './clock'
import { bestRow, oweSkill, toCount } from './progress'
import { upgradeLevels } from './upgradeLevels'
import type { ChestStage, UseSupplyDrop } from './contract'

export const CHEST_SMALL_MS = 3 * 60 * 1000
export const CHEST_BIG_MS = 10 * 60 * 1000
/** Kill-coin units in each gift, and the floor for a brand-new player. */
export const CHEST_SMALL_KILLS = 20
export const CHEST_BIG_KILLS = 80
const CHEST_SMALL_MIN = 30
const CHEST_BIG_MIN = 120
/** Only the big gift can carry a skill charge. */
export const CHEST_SKILL_CHANCE = 0.4
export const CHEST_SKILLS: readonly SkillId[] = ['shield', 'revive', 'warcry']

/** Coins in a gift of `stage` for a player whose best row is `best`. */
export const chestCoins = (stage: 'small' | 'big', best: number, coinMult = 1): number => {
  const unit = killCoins(Math.max(BOSS_EVERY, best), 'slime', false)
  const big = stage === 'big'
  const coins = unit * (big ? CHEST_BIG_KILLS : CHEST_SMALL_KILLS) * Math.max(1, coinMult)
  return Math.max(big ? CHEST_BIG_MIN : CHEST_SMALL_MIN, Math.round(coins))
}

export const stageAt = (elapsedMs: number): ChestStage =>
  elapsedMs < CHEST_SMALL_MS ? 'cooldown' : elapsedMs < CHEST_BIG_MS ? 'small' : 'big'

/** Last claim (epoch ms), or null when the chest has never been armed. */
const lastClaimAt = (): number | null => {
  const v = getState<unknown>(EB_SUPPLY_KEY, null)
  return v === null || v === undefined ? null : toCount(v)
}
const elapsedAt = (t: number): number => {
  const last = lastClaimAt()
  // Never armed (the chest is not even on screen yet): treat as "just filled
  // to the small gift" so a read before `arm()` never shows a full big chest.
  return last === null ? CHEST_SMALL_MS : Math.max(0, t - last)
}

// `getState` reads the reactive blob ref, so this re-runs on a claim, a cloud
// hydrate AND every clock tick. Sync flush: a claim must read back as not
// ready in the same tick, or a double tap could see a stale stage.
const elapsed: Ref<number> = ref(0)
watchEffect(() => { elapsed.value = elapsedAt(now.value) }, { flush: 'sync' })

const stage: ComputedRef<ChestStage> = computed(() => stageAt(elapsed.value))
const ready = computed(() => stage.value !== 'cooldown')
/** Until the next stage (0 once the big gift is waiting). */
const msLeft = computed(() => {
  const e = elapsed.value
  return e < CHEST_SMALL_MS ? CHEST_SMALL_MS - e : e < CHEST_BIG_MS ? CHEST_BIG_MS - e : 0
})
/** 0 → 1 across the current wait (to the small gift, then to the big one). */
const progress = computed(() => {
  const e = elapsed.value
  if (e < CHEST_SMALL_MS) return e / CHEST_SMALL_MS
  if (e < CHEST_BIG_MS) return (e - CHEST_SMALL_MS) / (CHEST_BIG_MS - CHEST_SMALL_MS)
  return 1
})
const coinMult = (): number => upgradeValue('bounty', upgradeLevels.value.bounty)
const gifts = computed(() => ({
  small: chestCoins('small', bestRow.value, coinMult()),
  big: chestCoins('big', bestRow.value, coinMult())
}))

/** First sight of the chest: start it at the small stage (a gift to open now). */
const arm = (): void => {
  if (lastClaimAt() !== null) return
  setState(EB_SUPPLY_KEY, touchClock() - CHEST_SMALL_MS)
}

const claim = (): { coins: number; skill: SkillId | null; stage: 'small' | 'big' } | null => {
  const t = touchClock()
  const s = stageAt(elapsedAt(t))
  if (s === 'cooldown') return null
  const coins = chestCoins(s, bestRow.value, coinMult())
  const skill = s === 'big' && Math.random() < CHEST_SKILL_CHANCE
    ? CHEST_SKILLS[Math.floor(Math.random() * CHEST_SKILLS.length)] ?? 'shield'
    : null
  setState(EB_SUPPLY_KEY, t)
  useEpicConfig().addCoins(coins)
  // Owed, not applied: the claim usually happens mid-volley or on the daily
  // board, and the charge belongs to the endless run's next turn.
  if (skill) oweSkill(skill)
  // A timed reward is a hard checkpoint: a reload right after the claim must
  // not find the chest full again.
  void flushSaveNow()
  return { coins, skill, stage: s }
}

export default function useSupplyDrop(): UseSupplyDrop {
  useTickingClock()
  return { ready, stage, msLeft, progress, gifts, arm, claim }
}
