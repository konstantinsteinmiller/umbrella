import { ref, computed, watch, type Ref } from 'vue'
import { getState, setState, prismState } from '@/use/useEpicState'
import { saveDataVersion, flushSaveNow } from '@/use/useSaveStatus'
import { ACHIEVEMENTS_KEY } from '@/keys'
import useEpicConfig from '@/use/useEpicConfig'
import { killCoins } from '@/barrage/engine/economy'
import { bestRow, maxBallTier, stats } from '@/barrage/state/progress'

// ─── Barrage achievements (retention-roadmap #10) ───────────────────────────
//
// Lifetime milestones keyed off the counters the barrage state layer ALREADY
// keeps (`umb_stats` via `progress.stats`, plus the best-row and max-ball-tier
// watermarks) — no extra instrumentation. Each grants a one-time coin payout on
// claim in the AchievementsModal; completing one mid-run fires a toast
// (`achievementToast`, rendered by the scene). Claim state lives in the single
// `umbrella_state` blob under `ACHIEVEMENTS_KEY`: { claimed: string[] }.
//
// Names: `barrageMeta.achievements.items.<id>`; descriptions are one template
// per metric (`barrageMeta.achievements.desc.<metric>`, `{n}` = the target), so
// a new rung never needs 21 new translations.

export type AchievementMetric =
  | 'kills' | 'bossKills' | 'bestRow' | 'merges' | 'maxBallTier' | 'bestCombo' | 'fevers'

export interface AchievementDef {
  id: string
  metric: AchievementMetric
  /** Goal value for `metric`. */
  target: number
  /** Coins granted on claim — scaled to difficulty. */
  reward: number
}

/** Two significant digits past 100 — 1,487 reads as 1,500. */
const nice = (v: number): number => {
  if (v < 100) return Math.max(1, Math.round(v))
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1)
  return Math.round(v / mag) * mag
}

/**
 * A reward priced as "`kills` kills at the depth where this milestone usually
 * lands". Derived from ENGINE's live coin curve (`economy.killCoins`) rather
 * than hard-coded, so a balance retune moves every payout with it — a fixed
 * number that was generous at one coin growth rate is a faucet (or an insult)
 * at the next.
 */
const worth = (kills: number, atRow: number): number => nice(kills * killCoins(atRow, 'slime', false))

// Ordered roughly easy → hard within each family.
export const ACHIEVEMENTS: ReadonlyArray<AchievementDef> = [
  // Lifetime kills.
  { id: 'kills100', metric: 'kills', target: 100, reward: worth(40, 12) },
  { id: 'kills1k', metric: 'kills', target: 1000, reward: worth(50, 35) },
  { id: 'kills10k', metric: 'kills', target: 10000, reward: worth(60, 80) },
  // Deepest row reached (endless).
  { id: 'row10', metric: 'bestRow', target: 10, reward: worth(30, 10) },
  { id: 'row30', metric: 'bestRow', target: 30, reward: worth(40, 30) },
  { id: 'row60', metric: 'bestRow', target: 60, reward: worth(50, 60) },
  { id: 'row100', metric: 'bestRow', target: 100, reward: worth(60, 100) },
  // Boss kills (checkpoints).
  { id: 'boss1', metric: 'bossKills', target: 1, reward: worth(40, 10) },
  { id: 'boss10', metric: 'bossKills', target: 10, reward: worth(60, 50) },
  { id: 'boss50', metric: 'bossKills', target: 50, reward: worth(80, 120) },
  // Tray merges.
  { id: 'merges10', metric: 'merges', target: 10, reward: worth(25, 5) },
  { id: 'merges100', metric: 'merges', target: 100, reward: worth(40, 40) },
  { id: 'merges500', metric: 'merges', target: 500, reward: worth(60, 90) },
  // Discovery ladder (highest ball tier ever created).
  { id: 'tier3', metric: 'maxBallTier', target: 3, reward: worth(25, 4) },
  { id: 'tier5', metric: 'maxBallTier', target: 5, reward: worth(40, 20) },
  { id: 'tier7', metric: 'maxBallTier', target: 7, reward: worth(50, 45) },
  { id: 'tier9', metric: 'maxBallTier', target: 9, reward: worth(70, 80) },
  // Most hits in a single volley.
  { id: 'combo25', metric: 'bestCombo', target: 25, reward: worth(30, 15) },
  { id: 'combo50', metric: 'bestCombo', target: 50, reward: worth(40, 30) },
  { id: 'combo150', metric: 'bestCombo', target: 150, reward: worth(60, 70) },
  // FEVER volleys.
  { id: 'fever1', metric: 'fevers', target: 1, reward: worth(40, 25) },
  { id: 'fevers25', metric: 'fevers', target: 25, reward: worth(60, 70) }
] as const

interface AchievementState { claimed: string[] }

const loadState = (): AchievementState => {
  const v = getState<Partial<AchievementState> | null>(ACHIEVEMENTS_KEY, null)
  const validIds = new Set(ACHIEVEMENTS.map((a) => a.id))
  const claimed = Array.isArray(v?.claimed)
    ? v.claimed.filter((id): id is string => typeof id === 'string' && validIds.has(id))
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
  if (metric === 'maxBallTier') return maxBallTier.value
  if (metric === 'bestRow') return bestRow.value
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
// A cloud hydrate raising the counters is not an achievement the player just
// earned — re-seed silently so it can't fire a burst of stale toasts.
watch(saveDataVersion, () => {
  for (const a of ACHIEVEMENTS) if (metricValue(a.metric) >= a.target) announced.add(a.id)
}, { flush: 'sync' })
watch([stats, bestRow, maxBallTier], () => {
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

  /** Claim a completed achievement's coins. Returns the amount, or 0 if it
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
