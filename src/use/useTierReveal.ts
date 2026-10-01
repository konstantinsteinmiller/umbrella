import { shallowRef, type ShallowRef } from 'vue'

/**
 * ─── "NEW UNIT!" — the new-tier discovery moment ────────────────────────────
 *
 * The first time a merge produces a tier the player has never had, that exact
 * unit gets a short moment of its own: a reveal sting, a bloom, rays and a halo
 * in its colours. The point is conditioning — the moment has to be good enough
 * that the NEXT tier becomes the thing the player is merging towards.
 *
 * Silent Flow (retention-roadmap #2): it lasts REVEAL_MS (1.5 s, was 5 s),
 * never dims and never blocks play (pointer-events none, nothing waits for
 * it). Before the first boss kill the scene's gate (`setRevealGate`) lets
 * only the first discovery through (`silentRevealAllowed`), and TierRevealFx
 * shows it without its words; later first-minute discoveries are the tray's
 * own merge flourish. Three reveals used to fill the first minute.
 *
 * This module only holds WHICH unit is being revealed and for how long; the
 * look lives in `TierRevealFx.vue`, and the decision "is this a discovery" is
 * made where the merge happens (`usePrismGame.merge` for the grid,
 * `usePrismGame.noteFieldMerge` for the arena). Nothing else may call
 * `announceNewTier`: the watermark (`bumpMaxTier`) also moves on spawns,
 * deploys, chest rewards and the restored-army reconcile, and none of those is a
 * merge the player made.
 *
 * One reveal at a time. A second discovery inside the moment (a cascade
 * chaining two merges, say) replaces the first — it is the higher tier anyway,
 * and two spotlights on one screen would make neither special.
 */

export type RevealTarget =
  | { kind: 'grid'; idx: number }
  | { kind: 'fighter'; fighterId: number }

export interface TierReveal {
  /** Unique per discovery; a retarget (unit dragged / deployed) keeps it. */
  readonly id: number
  readonly tier: number
  readonly target: RevealTarget
  /** `Date.now()` at the discovery. Views that (re)attach mid-moment offset
   *  their CSS timeline by it, so a drag or a deploy never replays the pop. */
  readonly startedAt: number
}

/** Negative `animation-delay` that puts a reveal animation where the running
 *  reveal is now — for an element that attaches mid-moment. */
export const revealAnimationDelay = (reveal: TierReveal | null): string =>
  reveal ? `${-Math.min(REVEAL_MS, Math.max(0, Date.now() - reveal.startedAt))}ms` : '0ms'

/** The whole moment, ms (Silent Flow: ≤ 1.5 s). */
export const REVEAL_MS = 1500
/** When the reveal sting blooms — the visual peak is synced to it. */
export const REVEAL_BLOOM_MS = 350

/** The tier of a player's first discovery: every first merge is 1 + 1 → 2. */
export const FIRST_DISCOVERY_TIER = 2
/** Silent Flow's rule for a discovery before the first boss kill: only the
 *  first one gets its moment. */
export const silentRevealAllowed = (tier: number): boolean => tier <= FIRST_DISCOVERY_TIER

/** The reveal on screen right now, or null. */
export const activeReveal: ShallowRef<TierReveal | null> = shallowRef(null)

let seq = 0
let endTimer: ReturnType<typeof setTimeout> | null = null
let soundClaimedFor = 0
/** The scene's say on which discoveries get a moment (null = all of them). */
let gate: ((tier: number) => boolean) | null = null

/** Install (or with null, remove) the gate `announceNewTier` asks first. */
export const setRevealGate = (fn: ((tier: number) => boolean) | null): void => {
  gate = fn
}

const sameTarget = (a: RevealTarget, b: RevealTarget): boolean => {
  if (a.kind === 'grid' && b.kind === 'grid') return a.idx === b.idx
  if (a.kind === 'fighter' && b.kind === 'fighter') return a.fighterId === b.fighterId
  return false
}

/** Start the moment for the unit a merge just produced — unless the scene's
 *  gate declines it (null: the merge is the tray's own flourish, no reveal). */
export const announceNewTier = (tier: number, target: RevealTarget): TierReveal | null => {
  if (gate && !gate(tier)) return null
  if (endTimer !== null) clearTimeout(endTimer)
  const reveal: TierReveal = { id: ++seq, tier, target, startedAt: Date.now() }
  activeReveal.value = reveal
  endTimer = setTimeout(() => endReveal(reveal.id), REVEAL_MS)
  return reveal
}

/** End the moment — the current one, or only reveal `id` if given (so a stale
 *  timer can never end a newer discovery). */
export const endReveal = (id?: number): void => {
  const cur = activeReveal.value
  if (!cur || (id !== undefined && cur.id !== id)) return
  if (endTimer !== null) {
    clearTimeout(endTimer)
    endTimer = null
  }
  activeReveal.value = null
}

/** Is the running reveal on this unit? */
export const revealTargets = (target: RevealTarget): boolean => {
  const cur = activeReveal.value
  return cur !== null && sameTarget(cur.target, target)
}

/** The revealed unit moved (dragged to another slot, deployed into the arena):
 *  the spotlight follows it, keeping its timeline. */
export const retargetReveal = (from: RevealTarget, to: RevealTarget): void => {
  const cur = activeReveal.value
  if (!cur || !sameTarget(cur.target, from)) return
  activeReveal.value = { ...cur, target: to }
}

/**
 * True exactly once per reveal, for the view that lands its merge — so the
 * reveal sting replaces that merge's ordinary pop instead of stacking on it, and
 * a re-render can never fire it twice.
 */
export const claimRevealSound = (target: RevealTarget): boolean => {
  const cur = activeReveal.value
  if (!cur || soundClaimedFor === cur.id || !sameTarget(cur.target, target)) return false
  soundClaimedFor = cur.id
  return true
}

/** Test-only. */
export const __resetTierReveal = (): void => {
  if (endTimer !== null) clearTimeout(endTimer)
  endTimer = null
  activeReveal.value = null
  soundClaimedFor = 0
  gate = null
}
