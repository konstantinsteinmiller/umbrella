/**
 * useFeatureUnlocks — the HUD is EARNED, one piece at a time.
 *
 * Play-test: the HUD showed eight feature buttons from the first second
 * (codex, supply drop, daily rewards, daily run, collection, battle pass,
 * achievements, leaderboard rank), several pulsing or dotted. Newcomers tapped
 * one, got a menu they did not care about yet, closed it and felt buried —
 * exactly what a Poki Player Fit test punishes. Now the first minutes are the
 * board and the launcher; everything else arrives as a REWARD.
 *
 * Three kinds of arrival share one channel (`unlocking`, one at a time, each
 * at a calm aim phase, flown in by FeatureUnlockFx):
 *
 *   • the LADDER of depth features — sequential: a step can only unlock after
 *     the one before it, at most one step per aim phase, never under the
 *     FTUE's marks. Each step opens on a best row OR on lifetime losses — the
 *     second arm is for the player who keeps losing: a struggling player gets
 *     the consolation depth (a free supply drop, daily coins) instead of being
 *     left alone with the wall.
 *   • the five UPGRADE CHIPS (Silent Flow, retention-roadmap #2: frame 1 used
 *     to show all five with prices, before a coin was earned) — each flies in
 *     the first time it becomes affordable (or free, or owns a level) and
 *     stays for good (`umb_unlocks.chips`).
 *   • the RANK PLAQUE — hidden until the first boss kill, then it flies in
 *     once, the earned reveal of the kill (user decision 2026-09-27: testers
 *     did not understand "#15,667 of 15,876" in their first minute).
 *
 * States per ladder feature:
 *   locked   — not rendered at all (no pulses, no dots, no toasts);
 *   arriving — rendered but invisible while FeatureUnlockFx flies its clone
 *              in from the board centre;
 *   new      — visible, breathing with a gold ring and a sparkle, until tapped
 *              (or ignored for NEW_GLOW_VOLLEYS volleys);
 *   open     — plain.
 * A chip and the rank plaque are simply hidden · arriving · shown (nothing
 * locked may pulse or show a dot; a shown chip glows by its own rules).
 *
 * Persisted in the blob as `umb_unlocks`. A save written before the ladder
 * existed unlocks silently everything its best row has passed, and one written
 * before earned chips shows every chip if it has played before — a veteran
 * never sees their HUD disappear or a celebration for something they use.
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { getState, setState, prismState } from '@/use/useEpicState'
import { saveDataVersion } from '@/use/useSaveStatus'
import { EB_BEST_ROW_KEY, EB_FTUE_KEY, EB_STATS_KEY, EB_UNLOCKS_KEY, EB_UPGRADES_KEY } from '@/barrage/keys'
import type { EngineListener, GameMode, UpgradeId } from '@/barrage/engine/types'

export type FeatureId =
  | 'supply' | 'codex' | 'collection' | 'dailyRewards' | 'battlePass' | 'achievements' | 'dailyRun'

/** An upgrade chip's arrival. */
export type ChipArrival = `chip:${UpgradeId}`
/** Everything that can fly in (one at a time). */
export type ArrivalId = FeatureId | ChipArrival | 'rank'
export const chipArrival = (id: UpgradeId): ChipArrival => `chip:${id}`

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
 *  is NOT on the ladder: it is earned by the first boss kill instead (see the
 *  header) — it no longer shows from the start (user decision 2026-09-27,
 *  retention-roadmap #2: testers did not understand it in their first minute). */
export const UNLOCK_LADDER: readonly UnlockStep[] = [
  { id: 'supply', row: 6, losses: 1 },
  { id: 'codex', row: 11, losses: 1 },
  { id: 'collection', row: 16, losses: 2 },
  { id: 'dailyRewards', row: 21, losses: 3 },
  { id: 'battlePass', row: 26, losses: 4 },
  { id: 'achievements', row: 31, losses: 5 },
  { id: 'dailyRun', row: 36, losses: 6 }
]

/** The chips, in the upgrade row's order (their arrival order on a tie). */
export const CHIP_IDS: readonly UpgradeId[] = ['damage', 'capacity', 'speed', 'luck', 'bounty']

/** Volleys a freshly unlocked button keeps glowing if the player ignores it. */
export const NEW_GLOW_VOLLEYS = 4

export type FeatureState = 'locked' | 'arriving' | 'new' | 'open'
export type HudState = 'hidden' | 'arriving' | 'shown'

// ─── Persistence ─────────────────────────────────────────────────────────────
interface UnlockSave {
  v: 1
  /** How many ladder steps are unlocked (a prefix of UNLOCK_LADDER). */
  n: number
  /** Lifetime losses (endless breaches). */
  losses: number
  /** Unlocked features the player has tapped (or ignored long enough). */
  seen: FeatureId[]
  /** Upgrade chips that have flown in: they stay. */
  chips: UpgradeId[]
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0)
const IDS: ReadonlySet<string> = new Set(UNLOCK_LADDER.map((s) => s.id))
const CHIPS: ReadonlySet<string> = new Set(CHIP_IDS)

/** Steps a player with this best row / losses has earned (sequential prefix). */
export const earnedSteps = (bestRow: number, losses: number): number => {
  let n = 0
  for (const s of UNLOCK_LADDER) {
    if (bestRow >= s.row || losses >= s.losses) n++
    else break
  }
  return n
}

/** A save from before earned chips that has played before (past row 1, a
 *  level bought, a boss beaten): it saw every chip, so it keeps them all. */
const playedBefore = (): boolean => {
  if (count(getState(EB_BEST_ROW_KEY, 0)) > 1) return true
  const levels = getState<Record<string, unknown> | null>(EB_UPGRADES_KEY, null)
  if (levels && typeof levels === 'object' && Object.values(levels).some((v) => count(v) > 0)) return true
  const stats = getState<Record<string, unknown> | null>(EB_STATS_KEY, null)
  if (count(stats?.bossKills) > 0) return true
  return getState<{ done?: unknown } | null>(EB_FTUE_KEY, null)?.done === true
}

const readChips = (raw: unknown): UpgradeId[] =>
  Array.isArray(raw) ? raw.filter((x): x is UpgradeId => typeof x === 'string' && CHIPS.has(x)) : []

const readSave = (): UnlockSave => {
  const raw = getState<Partial<UnlockSave> | null>(EB_UNLOCKS_KEY, null)
  // No chip record yet: all of them for a save that has played, none for a new one.
  const chips = raw && Array.isArray(raw.chips) ? readChips(raw.chips) : playedBefore() ? [...CHIP_IDS] : []
  if (!raw || raw.v !== 1) {
    // Before the ladder existed: everything the best row has passed is simply
    // there, already seen. Losses were never counted — they start at 0.
    const n = earnedSteps(count(getState(EB_BEST_ROW_KEY, 0)), 0)
    return { v: 1, n, losses: 0, seen: UNLOCK_LADDER.slice(0, n).map((s) => s.id), chips }
  }
  return {
    v: 1,
    n: Math.min(UNLOCK_LADDER.length, count(raw.n)),
    losses: count(raw.losses),
    seen: Array.isArray(raw.seen) ? raw.seen.filter((x): x is FeatureId => typeof x === 'string' && IDS.has(x)) : [],
    chips
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
    seen: [...new Set([...cur.seen, ...fresh.seen])],
    chips: CHIP_IDS.filter((id) => cur.chips.includes(id) || fresh.chips.includes(id))
  }
}
watch(saveDataVersion, rehydrate)
watch(prismState, rehydrate, { deep: false })

/** What is flying in right now (FeatureUnlockFx animates it). */
export const unlocking = ref<ArrivalId | null>(null)

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

/** Each chip: hidden (holds its slot, invisible), arriving, or shown. */
export const chipStates: ComputedRef<Record<UpgradeId, HudState>> = computed(() => {
  const out = {} as Record<UpgradeId, HudState>
  const have = new Set(save.value.chips)
  for (const id of CHIP_IDS) out[id] = unlocking.value === chipArrival(id) ? 'arriving' : have.has(id) ? 'shown' : 'hidden'
  return out
})
/** The chip is on screen (landed). */
export const chipShown = (id: UpgradeId): boolean => chipStates.value[id] === 'shown'

/** The rank plaque: hidden until the first boss kill; `pending` = earned by a
 *  kill this session, waiting for a calm moment to fly in. */
const rankPhase = ref<'hidden' | 'pending' | 'arriving' | 'shown'>('hidden')
export const rankState: ComputedRef<HudState> = computed(() =>
  rankPhase.value === 'arriving' ? 'arriving' : rankPhase.value === 'shown' ? 'shown' : 'hidden')

/** The player tapped it (or it has glowed long enough). */
export const markFeatureSeen = (id: FeatureId): void => {
  if (save.value.seen.includes(id) || stepOf(id) >= save.value.n) return
  save.value = { ...save.value, seen: [...save.value.seen, id] }
  persist()
}

/** FeatureUnlockFx landed the clone: the real element takes over. */
export const finishArrival = (id: ArrivalId): void => {
  if (unlocking.value !== id) return
  if (id === 'rank') rankPhase.value = 'shown'
  unlocking.value = null
}

// ─── Wiring ──────────────────────────────────────────────────────────────────
/** What a chip needs to fly in: the upgrade row's own view of it. */
export interface ChipView {
  id: UpgradeId
  affordable: boolean
  level: number
}

export interface UnlockWiring {
  bestRow: Readonly<Ref<number>>
  mode: Readonly<Ref<GameMode>>
  onEngineEvent(cb: EngineListener): () => void
  /** The FTUE has handed over (no ladder step unlocks under its coach marks). */
  ftueDone: Readonly<Ref<boolean>>
  /** A calm moment: aim phase, no modal, no tier reveal, no held sim. */
  calm: Readonly<Ref<boolean>>
  /** The five chips (`useBarrageUpgrades().list`); absent = chips are not
   *  earned here (they stay as the save says). */
  chips?: Readonly<Ref<readonly ChipView[]>>
  /** The chip whose next level is a gift right now (`freeId`): it counts as
   *  affordable — the FTUE's free Tray Capacity flies in when it is offered. */
  freeChip?: Readonly<Ref<UpgradeId | null>>
  /** Silent Flow: no boss killed yet (the rank plaque stays hidden). Absent =
   *  never silent: the plaque simply shows. */
  silent?: Readonly<Ref<boolean>>
  /** The plaque can show on this build at all (a leaderboard, not the clean
   *  feed). False: it never flies in. */
  rankEnabled?: boolean
}

export const installFeatureUnlocks = (w: UnlockWiring): (() => void) => {
  const offs: (() => void)[] = []
  let unlockedThisAim = false
  /** Volleys since each 'new' feature appeared (session-only). */
  const glowVolleys = new Map<FeatureId, number>()

  // A save that had no chip record: the migration's answer is written now,
  // before the first shot can move the best row it reads.
  if (!Array.isArray(getState<Partial<UnlockSave> | null>(EB_UNLOCKS_KEY, null)?.chips)) persist()

  // The rank plaque: already earned (a returning player) — simply there.
  if (!(w.silent?.value ?? false) || w.rankEnabled === false) rankPhase.value = 'shown'
  else if (rankPhase.value === 'shown') rankPhase.value = 'hidden'

  /** The next ladder step, when one is due (at most one per aim phase). */
  const tryStep = (): boolean => {
    if (unlockedThisAim || !w.ftueDone.value) return false
    const n = save.value.n
    if (n >= UNLOCK_LADDER.length) return false
    if (earnedSteps(w.bestRow.value, save.value.losses) <= n) return false
    unlockedThisAim = true
    unlocking.value = UNLOCK_LADDER[n]!.id
    save.value = { ...save.value, n: n + 1 }
    persist()
    return true
  }

  /** A chip that has earned its place: affordable, free or owning a level. */
  const dueChip = (): UpgradeId | null => {
    const views = w.chips?.value
    if (!views) return null
    const free = w.freeChip?.value ?? null
    for (const id of CHIP_IDS) {
      if (save.value.chips.includes(id)) continue
      const v = views.find((x) => x.id === id)
      if (v && (v.affordable || v.level > 0 || free === id)) return id
    }
    return null
  }

  /** One arrival at a time, at a calm moment: the rank plaque (the first boss
   *  kill's reveal), then a ladder step, then a chip. */
  const tryArrive = (): void => {
    if (unlocking.value || !w.calm.value) return
    if (rankPhase.value === 'pending') {
      rankPhase.value = 'arriving'
      unlocking.value = 'rank'
      return
    }
    if (tryStep()) return
    const chip = dueChip()
    if (!chip) return
    // Kept at once, so a reload mid-flight never takes it back.
    save.value = { ...save.value, chips: CHIP_IDS.filter((id) => id === chip || save.value.chips.includes(id)) }
    persist()
    unlocking.value = chipArrival(chip)
  }

  offs.push(w.onEngineEvent((e) => {
    switch (e.type) {
      case 'phase':
        if (e.phase === 'aim') { unlockedThisAim = false; tryArrive() }
        break
      case 'breach':
        if (w.mode.value === 'endless') {
          save.value = { ...save.value, losses: save.value.losses + 1 }
          persist()
        }
        break
      case 'bossDefeated':
        // The first boss kill, live: the plaque flies in at the next calm moment.
        if (rankPhase.value === 'hidden') rankPhase.value = 'pending'
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
  // A modal closing, a reveal ending, the FTUE handing over mid-aim, a chip
  // turning affordable, or the last arrival landing.
  offs.push(watch(
    [() => w.calm.value, () => w.ftueDone.value, () => w.bestRow.value, () => w.chips?.value, () => w.freeChip?.value, unlocking],
    () => tryArrive()
  ))
  // No boss killed any more without a kill heard here (a cloud hydrate): the
  // plaque is simply there. After a live kill it waits for its fly-in.
  offs.push(watch(() => w.silent?.value ?? false, (silent) => {
    if (!silent && rankPhase.value === 'hidden') rankPhase.value = 'shown'
  }))
  tryArrive()

  return () => { for (const off of offs) off() }
}

// ⚠️ DEV-ONLY: browser checks and play-testers can walk the ladder.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__unlocks = {
    state: () => ({ ...save.value, states: featureStates.value, chips: chipStates.value, rank: rankPhase.value, unlocking: unlocking.value }),
    /** Grant losses so the next step becomes due at the next calm aim phase. */
    addLosses: (k = 1): void => { save.value = { ...save.value, losses: save.value.losses + k }; persist() },
    all: (): void => {
      save.value = { v: 1, n: UNLOCK_LADDER.length, losses: save.value.losses, seen: UNLOCK_LADDER.map((s) => s.id), chips: [...CHIP_IDS] }
      persist()
    }
  }
}
