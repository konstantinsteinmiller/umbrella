import { ref, computed, watch, type Ref } from 'vue'
import { getState, setState, prismState } from '@/use/useEpicState'
import { saveDataVersion, flushSaveNow } from '@/use/useSaveStatus'
import { ACHIEVEMENTS_KEY } from '@/keys'
import useEpicConfig from '@/use/useEpicConfig'
import { stats, bestWave } from '@/use/useBattle'
import { maxTier } from '@/use/usePrismGame'

// ─── Battler achievements (retention-roadmap #10) ───────────────────────────
//
// ~20 lifetime milestones keyed off the counters the battler ALREADY tracks
// (`prism_stats` via useBattle.stats, plus the best-wave and max-tier
// watermarks) — no extra instrumentation. Each grants a one-time gold payout
// on claim in the AchievementsModal; completing one mid-battle fires a toast
// (`achievementToast`, rendered by the scene). Claim state lives in the
// single `merge-idle-war_state` blob under `ACHIEVEMENTS_KEY`: { claimed: string[] }.

export type AchievementMetric =
  | 'kills' | 'waves' | 'bossKills' | 'merges' | 'fieldMerges' | 'bestCombo'
  | 'maxTier' | 'bestWave'

export interface AchievementDef {
  id: string
  metric: AchievementMetric
  /** Goal value for `metric`. */
  target: number
  /** Gold granted on claim — scaled to difficulty. */
  reward: number
}

// Ordered roughly easy → hard within each family. Rewards are modest and
// back-loaded (the gold curve pays ~6·1.09^wave per kill, so late capstones
// can afford fat payouts without becoming a faucet).
export const ACHIEVEMENTS: ReadonlyArray<AchievementDef> = [
  // Lifetime kills.
  { id: 'kills100', metric: 'kills', target: 100, reward: 150 },
  { id: 'kills1k', metric: 'kills', target: 1000, reward: 600 },
  { id: 'kills10k', metric: 'kills', target: 10000, reward: 3000 },
  // Best wave reached.
  { id: 'wave10', metric: 'bestWave', target: 10, reward: 200 },
  { id: 'wave25', metric: 'bestWave', target: 25, reward: 1000 },
  { id: 'wave50', metric: 'bestWave', target: 50, reward: 5000 },
  // Boss kills.
  { id: 'boss1', metric: 'bossKills', target: 1, reward: 150 },
  { id: 'boss10', metric: 'bossKills', target: 10, reward: 800 },
  { id: 'boss50', metric: 'bossKills', target: 50, reward: 4000 },
  // Grid merges.
  { id: 'merges50', metric: 'merges', target: 50, reward: 150 },
  { id: 'merges500', metric: 'merges', target: 500, reward: 1000 },
  // Discovery ladder (highest tier ever created).
  { id: 'tier5', metric: 'maxTier', target: 5, reward: 250 },
  { id: 'tier8', metric: 'maxTier', target: 8, reward: 1500 },
  { id: 'tier10', metric: 'maxTier', target: 10, reward: 6000 },
  // Field merges (in-arena).
  { id: 'fieldMerge1', metric: 'fieldMerges', target: 1, reward: 100 },
  { id: 'fieldMerges25', metric: 'fieldMerges', target: 25, reward: 600 },
  // Kill-combo watermark.
  { id: 'combo10', metric: 'bestCombo', target: 10, reward: 200 },
  { id: 'combo25', metric: 'bestCombo', target: 25, reward: 1200 },
  // Lifetime waves cleared.
  { id: 'waves100', metric: 'waves', target: 100, reward: 800 },
  { id: 'waves500', metric: 'waves', target: 500, reward: 4000 }
] as const

interface AchievementState { claimed: string[] }

const loadState = (): AchievementState => {
  const v = getState<Partial<AchievementState> | null>(ACHIEVEMENTS_KEY, null)
  const validIds = new Set(ACHIEVEMENTS.map((a) => a.id))
  const claimed = Array.isArray(v?.claimed)
    ? v!.claimed.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : []
  return { claimed }
}

const state: Ref<AchievementState> = ref(loadState())

const refresh = (): void => { state.value = loadState() }
watch(saveDataVersion, refresh)
watch(prismState, refresh, { deep: false })

const persist = (): void => {
  setState(ACHIEVEMENTS_KEY, state.value)
  void flushSaveNow()
}

/** Live lifetime value backing a given metric. */
const metricValue = (metric: AchievementMetric): number => {
  if (metric === 'maxTier') return maxTier.value
  if (metric === 'bestWave') return bestWave.value
  return stats.value[metric] ?? 0
}

// ─── Completion toast ────────────────────────────────────────────────────────
// Fires once per achievement per session the moment its metric crosses the
// target (already-complete ones are seeded silently at boot so reloading
// never replays old toasts). The scene renders it; nonce keys re-triggers.
export const achievementToast = ref<{ id: string; nonce: number } | null>(null)
let toastNonce = 0
const announced = new Set<string>(
  ACHIEVEMENTS.filter((a) => metricValue(a.metric) >= a.target).map((a) => a.id)
)
watch([stats, bestWave, maxTier], () => {
  for (const a of ACHIEVEMENTS) {
    if (announced.has(a.id)) continue
    if (metricValue(a.metric) >= a.target) {
      announced.add(a.id)
      achievementToast.value = { id: a.id, nonce: ++toastNonce }
    }
  }
})

export interface AchievementView extends AchievementDef {
  current: number
  claimed: boolean
  complete: boolean
  claimable: boolean
}

/** The modal's row order: anything claimable is hoisted to the top, everything
 *  else keeps its authored order. Because the hoist is keyed on `claimable`
 *  alone, claiming a row drops it straight back to the position it came from —
 *  the player never has to re-find a list they just reordered. Pure so the
 *  contract can be pinned by tests; the view animates the move. */
export const claimableFirst = (rows: readonly AchievementView[]): AchievementView[] =>
  rows
    .map((a, i) => ({ a, i }))
    .sort((x, y) => Number(y.a.claimable) - Number(x.a.claimable) || x.i - y.i)
    .map(({ a }) => a)

const useAchievements = () => {
  const { addCoins } = useEpicConfig()

  const list = computed<AchievementView[]>(() =>
    ACHIEVEMENTS.map((a) => {
      const current = metricValue(a.metric)
      const complete = current >= a.target
      const claimed = state.value.claimed.includes(a.id)
      return { ...a, current, complete, claimed, claimable: complete && !claimed }
    })
  )

  const pendingCount = computed(() => list.value.filter((a) => a.claimable).length)
  const hasUnclaimed = computed(() => pendingCount.value > 0)

  /** Claim a completed achievement's gold. Returns the amount, or 0 if it
   *  wasn't claimable. */
  const claim = (id: string): number => {
    const a = ACHIEVEMENTS.find((x) => x.id === id)
    if (!a) return 0
    if (state.value.claimed.includes(id)) return 0
    if (metricValue(a.metric) < a.target) return 0
    state.value = { ...state.value, claimed: [...state.value.claimed, id] }
    addCoins(a.reward)
    persist()
    return a.reward
  }

  return { list, pendingCount, hasUnclaimed, claim }
}

export default useAchievements
