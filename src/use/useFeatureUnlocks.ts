/**
 * useFeatureUnlocks — depth features are EARNED, one at a time.
 *
 * Play-test: the HUD showed eight feature buttons from the first second
 * (codex, supply drop, daily rewards, daily run, collection, battle pass,
 * achievements, leaderboard rank), several pulsing or dotted. Newcomers tapped
 * one, got a menu they did not care about yet, closed it and felt buried —
 * exactly what a Poki Player Fit test punishes. Now the first minutes are the
 * board, the tray and the upgrades; everything else arrives as a REWARD.
 *
 * The ladder is sequential: a step can only unlock after the one before it,
 * and at most one unlock happens per aim phase. Each step opens on a best row
 * OR on lifetime losses — the second arm is for the player who keeps losing:
 * a struggling player gets the consolation depth (a free supply drop, daily
 * coins) instead of being left alone with the wall.
 *
 * States per feature:
 *   locked   — not rendered at all (no pulses, no dots, no toasts);
 *   arriving — rendered but invisible while FeatureUnlockFx flies its clone
 *              in from the board centre;
 *   new      — visible, breathing with a gold ring and a sparkle, until tapped
 *              (or ignored for NEW_GLOW_VOLLEYS volleys);
 *   open     — plain.
 *
 * Persisted in the blob as `eb_unlocks`. A save written before this existed
 * unlocks silently everything its best row has passed — a veteran never sees
 * their HUD disappear or a celebration for something they already use.
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { getState, setState, prismState } from '@/use/useEpicState'
import { saveDataVersion } from '@/use/useSaveStatus'
import { EB_BEST_ROW_KEY, EB_UNLOCKS_KEY } from '@/barrage/keys'
import type { EngineListener, GameMode } from '@/barrage/engine/types'

export type FeatureId =
  | 'supply' | 'codex' | 'collection' | 'dailyRewards' | 'battlePass' | 'achievements' | 'dailyRun'

export interface UnlockStep {
  id: FeatureId
  /** Best row that unlocks it… */
  row: number
  /** …or this many lifetime losses (breaches) — whichever comes first. */
  losses: number
}

/** In order. The treasure chest leads: the first thing a new player earns is
 *  a gift they can open at once (it arrives filled to its small stage), and
 *  its 3 / 10-minute rhythm is a reason to keep playing. The leaderboard rank
 *  is NOT on the ladder: the game is competitive, so it shows from the start. */
export const UNLOCK_LADDER: readonly UnlockStep[] = [
  { id: 'supply', row: 6, losses: 1 },
  { id: 'codex', row: 11, losses: 1 },
  { id: 'collection', row: 16, losses: 2 },
  { id: 'dailyRewards', row: 21, losses: 3 },
  { id: 'battlePass', row: 26, losses: 4 },
  { id: 'achievements', row: 31, losses: 5 },
  { id: 'dailyRun', row: 36, losses: 6 }
]

/** Volleys a freshly unlocked button keeps glowing if the player ignores it. */
export const NEW_GLOW_VOLLEYS = 4

export type FeatureState = 'locked' | 'arriving' | 'new' | 'open'

// ─── Persistence ─────────────────────────────────────────────────────────────
interface UnlockSave {
  v: 1
  /** How many ladder steps are unlocked (a prefix of UNLOCK_LADDER). */
  n: number
  /** Lifetime losses (endless breaches). */
  losses: number
  /** Unlocked features the player has tapped (or ignored long enough). */
  seen: FeatureId[]
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0)
const IDS: ReadonlySet<string> = new Set(UNLOCK_LADDER.map((s) => s.id))

/** Steps a player with this best row / losses has earned (sequential prefix). */
export const earnedSteps = (bestRow: number, losses: number): number => {
  let n = 0
  for (const s of UNLOCK_LADDER) {
    if (bestRow >= s.row || losses >= s.losses) n++
    else break
  }
  return n
}

const readSave = (): UnlockSave => {
  const raw = getState<Partial<UnlockSave> | null>(EB_UNLOCKS_KEY, null)
  if (!raw || raw.v !== 1) {
    // Before the ladder existed: everything the best row has passed is simply
    // there, already seen. Losses were never counted — they start at 0.
    const n = earnedSteps(count(getState(EB_BEST_ROW_KEY, 0)), 0)
    return { v: 1, n, losses: 0, seen: UNLOCK_LADDER.slice(0, n).map((s) => s.id) }
  }
  return {
    v: 1,
    n: Math.min(UNLOCK_LADDER.length, count(raw.n)),
    losses: count(raw.losses),
    seen: Array.isArray(raw.seen) ? raw.seen.filter((x): x is FeatureId => typeof x === 'string' && IDS.has(x)) : []
  }
}

const save: Ref<UnlockSave> = ref(readSave())
const persist = (): void => { setState(EB_UNLOCKS_KEY, save.value) }

// Forward-only hydration: an unlock earned on another device stays earned.
const rehydrate = (): void => {
  const fresh = readSave()
  const cur = save.value
  save.value = {
    v: 1,
    n: Math.max(cur.n, fresh.n),
    losses: Math.max(cur.losses, fresh.losses),
    seen: [...new Set([...cur.seen, ...fresh.seen])]
  }
}
watch(saveDataVersion, rehydrate)
watch(prismState, rehydrate, { deep: false })

/** The feature flying in right now (FeatureUnlockFx animates it). */
export const unlocking = ref<FeatureId | null>(null)

const stepOf = (id: FeatureId): number => UNLOCK_LADDER.findIndex((s) => s.id === id)

export const featureStates: ComputedRef<Record<FeatureId, FeatureState>> = computed(() => {
  const out = {} as Record<FeatureId, FeatureState>
  const seen = new Set(save.value.seen)
  UNLOCK_LADDER.forEach((s, i) => {
    out[s.id] = i >= save.value.n ? 'locked'
      : unlocking.value === s.id ? 'arriving'
        : seen.has(s.id) ? 'open' : 'new'
  })
  return out
})

/** Rendered at all (arriving counts: it holds its slot while the clone flies in). */
export const featureShown = (id: FeatureId): boolean => featureStates.value[id] !== 'locked'
/** Usable and visible. */
export const featureReady = (id: FeatureId): boolean => {
  const s = featureStates.value[id]
  return s === 'new' || s === 'open'
}

/** The player tapped it (or it has glowed long enough). */
export const markFeatureSeen = (id: FeatureId): void => {
  if (save.value.seen.includes(id) || stepOf(id) >= save.value.n) return
  save.value = { ...save.value, seen: [...save.value.seen, id] }
  persist()
}

/** FeatureUnlockFx landed the clone: the real button takes over. */
export const finishArrival = (id: FeatureId): void => {
  if (unlocking.value === id) unlocking.value = null
}

// ─── Wiring ──────────────────────────────────────────────────────────────────
export interface UnlockWiring {
  bestRow: Readonly<Ref<number>>
  mode: Readonly<Ref<GameMode>>
  onEngineEvent(cb: EngineListener): () => void
  /** The FTUE has handed over (nothing unlocks under its coach marks). */
  ftueDone: Readonly<Ref<boolean>>
  /** A calm moment: aim phase, no modal, no tier reveal, no held sim. */
  calm: Readonly<Ref<boolean>>
}

export const installFeatureUnlocks = (w: UnlockWiring): (() => void) => {
  const offs: (() => void)[] = []
  let unlockedThisAim = false
  /** Volleys since each 'new' feature appeared (session-only). */
  const glowVolleys = new Map<FeatureId, number>()

  const tryUnlock = (): void => {
    if (unlockedThisAim || unlocking.value || !w.ftueDone.value || !w.calm.value) return
    const n = save.value.n
    if (n >= UNLOCK_LADDER.length) return
    if (earnedSteps(w.bestRow.value, save.value.losses) <= n) return
    const step = UNLOCK_LADDER[n]!
    unlockedThisAim = true
    unlocking.value = step.id
    save.value = { ...save.value, n: n + 1 }
    persist()
  }

  offs.push(w.onEngineEvent((e) => {
    switch (e.type) {
      case 'phase':
        if (e.phase === 'aim') { unlockedThisAim = false; tryUnlock() }
        break
      case 'breach':
        if (w.mode.value === 'endless') {
          save.value = { ...save.value, losses: save.value.losses + 1 }
          persist()
        }
        break
      case 'fire':
        // An ignored glow fades after a few volleys: it was noticed or not wanted.
        for (const [id, state] of Object.entries(featureStates.value) as [FeatureId, FeatureState][]) {
          if (state !== 'new') continue
          const v = (glowVolleys.get(id) ?? 0) + 1
          glowVolleys.set(id, v)
          if (v >= NEW_GLOW_VOLLEYS) markFeatureSeen(id)
        }
        break
      default:
        break
    }
  }))
  // A modal closing, a reveal ending or the FTUE handing over mid-aim.
  offs.push(watch([() => w.calm.value, () => w.ftueDone.value, () => w.bestRow.value], () => tryUnlock()))
  tryUnlock()

  return () => { for (const off of offs) off() }
}

// ⚠️ DEV-ONLY: browser checks and play-testers can walk the ladder.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__unlocks = {
    state: () => ({ ...save.value, states: featureStates.value, unlocking: unlocking.value }),
    /** Grant losses so the next step becomes due at the next calm aim phase. */
    addLosses: (k = 1): void => { save.value = { ...save.value, losses: save.value.losses + k }; persist() },
    all: (): void => {
      save.value = { v: 1, n: UNLOCK_LADDER.length, losses: save.value.losses, seen: UNLOCK_LADDER.map((s) => s.id) }
      persist()
    }
  }
}
