/**
 * A merge in the tray — its own flourish, while play goes on.
 *
 * Play-test run 2: merging went unnoticed ("the portraits kept flipping").
 * So the first MERGE_BOX_FIRST merges of a profile, and every merge that made
 * a tier the player had never had, PAUSED the game on a dimmed stage for
 * 2–2.7 s. Silent Flow (retention-roadmap #2) ended every pause: the first
 * three sat in the first minute, where 40 % of plays end. Every merge now
 * plays the tray's own flourish — the twins fly together into the ball they
 * make, it squishes, confetti (BallTray) — and a discovery gets the NEW BALL
 * reveal on top (`useTierReveal`: ≤ 1.5 s, never in the way). The engine's
 * forced first merge (the FTUE's turn 3) stays; only the freeze is gone.
 *
 * So `offerMerge` never takes the moment. The profile's first merges and
 * every discovery still say their sentence to screen readers (the coach's cue
 * region), and the first ones are counted (`umb_coach` exposure `mergeBox`,
 * which hydrates and never runs backwards with the rest of the coach's
 * bookkeeping).
 */
import { shallowRef } from 'vue'
import { MERGE_BOX_FIRST, bumpExposure, lessonShown, sayCue } from '@/use/useCoach'

export { MERGE_BOX_FIRST }

/** Pure rule: the first MERGE_BOX_FIRST merges are told, then discoveries only. */
export const shouldAnnounce = (shown: number, discovery: boolean): boolean =>
  shown < MERGE_BOX_FIRST || discovery

export interface MergeBox {
  seq: number
  fromTier: number
  toTier: number
  /** Tray index of the ball the merge made (`[data-slot=idx] .unit-holder`). */
  idx: number
  discovery: boolean
  ms: number
}

/** Always null: nothing is staged any more. Kept because the tray hides the
 *  ball a stage draws (`BallTray`'s `boxedIdx`). */
export const mergeBox = shallowRef<MergeBox | null>(null)

export interface MergeOffer {
  fromTier: number
  toTier: number
  idx: number
  /** The state layer announced this merge as a discovery. */
  discovery: boolean
  /** Nothing else owns the screen (no modal open). */
  allowed: boolean
}

/**
 * A merge just landed in the tray. Never takes the moment (returns false: the
 * tray plays its own flourish, and a discovery's reveal runs as announced);
 * the first merges of a profile and every discovery are told to screen readers.
 */
export const offerMerge = (o: MergeOffer): boolean => {
  const shown = lessonShown('mergeBox')
  if (shouldAnnounce(shown, o.discovery)) {
    if (shown < MERGE_BOX_FIRST) bumpExposure('mergeBox')
    sayCue({ kind: 'merge', from: o.fromTier, to: o.toTier, discovery: o.discovery })
  }
  return false
}
