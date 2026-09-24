/**
 * The merge lightbox — WHEN a tray merge is put on a stage (the look lives in
 * `MergeLightbox.vue`).
 *
 * Play-test run 2: merging went unnoticed. "The portraits kept flipping", "the
 * roster changed with no visible merge" — the tray re-sorts in one frame and a
 * squish on the result is over before anyone looks down. So the first
 * MERGE_BOX_FIRST merges of a profile, and every merge that makes a tier the
 * player has never had, PAUSE the game (`acquireAppPause`) and dim everything
 * but the tray: the twins fly together, fuse with a flash into the next tier,
 * and a short trail runs from the tray into the launcher — these balls ARE the
 * shots. A discovery then peeks its codex entry (ability icon + name). Tap to
 * skip. Every later merge animates in the tray without pausing.
 *
 * The discovery reveal (`useTierReveal`, TierRevealFx) is announced by the
 * state layer the moment the merge happens. It would spotlight the tray under
 * the lightbox, so the lightbox takes it off the stage and announces the same
 * discovery again when it ends: the lightbox is the first act, the reveal the
 * second — with its full five seconds, and the sting it was due.
 *
 * The count lives in the coach's save (`eb_coach`, exposure `mergeBox`), so it
 * hydrates and never runs backwards with the rest of the coach's bookkeeping.
 */
import { shallowRef } from 'vue'
import { acquireAppPause } from '@/use/useGamePause'
import { activeReveal, announceNewTier, endReveal, type RevealTarget } from '@/use/useTierReveal'
import { MERGE_BOX_FIRST, bumpExposure, lessonShown } from '@/use/useCoach'

export { MERGE_BOX_FIRST }

/** One routine lightbox (the first merges), ms. */
export const MERGE_BOX_MS = 2000
/** A discovery's lightbox: the same, plus the codex peek. */
export const MERGE_BOX_DISCOVERY_MS = 2700

/** Pure rule: the first MERGE_BOX_FIRST merges, then discoveries only. */
export const shouldLightbox = (shown: number, discovery: boolean): boolean =>
  shown < MERGE_BOX_FIRST || discovery

export interface MergeBox {
  seq: number
  fromTier: number
  toTier: number
  /** Tray index of the ball the merge made (`[data-slot=idx] .unit-holder`). */
  idx: number
  discovery: boolean
  /** Whole duration, ms. */
  ms: number
}

/** The lightbox on screen, or null. */
export const mergeBox = shallowRef<MergeBox | null>(null)

let seq = 0
/** Mounted lightbox views: without one (the DEV clean feed, the lab) a pause
 *  would freeze the game behind nothing. */
let views = 0
let release: (() => void) | null = null
let endTimer: ReturnType<typeof setTimeout> | null = null
/** The discovery the lightbox took off the stage, re-announced at its end. */
let deferred: { tier: number; target: RevealTarget } | null = null
/** Called with the re-announced reveal (the view plays its sting). */
let onRevealResumed: ((tier: number, target: RevealTarget) => void) | null = null

/** A lightbox view mounted; returns its unregister. */
export const registerMergeBoxView = (): (() => void) => {
  views++
  let done = false
  return () => {
    if (done) return
    done = true
    views = Math.max(0, views - 1)
  }
}

/** The view registers what to do when a deferred discovery resumes. */
export const setRevealResumeHook = (fn: ((tier: number, target: RevealTarget) => void) | null): void => {
  onRevealResumed = fn
}

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
 * A merge just landed in the tray. Returns true when the lightbox takes it —
 * the tray then skips its own merge juice (the lightbox plays it).
 */
export const offerMerge = (o: MergeOffer): boolean => {
  if (!o.allowed || views === 0 || mergeBox.value) return false
  if (!shouldLightbox(lessonShown('mergeBox'), o.discovery)) return false
  const reveal = activeReveal.value
  deferred = null
  if (o.discovery && reveal && reveal.tier === o.toTier) {
    deferred = { tier: reveal.tier, target: reveal.target }
    endReveal(reveal.id)
  }
  bumpExposure('mergeBox')
  release = acquireAppPause()
  const ms = o.discovery ? MERGE_BOX_DISCOVERY_MS : MERGE_BOX_MS
  mergeBox.value = { seq: ++seq, fromTier: o.fromTier, toTier: o.toTier, idx: o.idx, discovery: o.discovery, ms }
  if (endTimer !== null) clearTimeout(endTimer)
  endTimer = setTimeout(finishMerge, ms)
  return true
}

/** End the lightbox now (its timer, a tap, or the view going away): the game
 *  runs again and a deferred discovery takes the stage. */
export const finishMerge = (): void => {
  if (endTimer !== null) clearTimeout(endTimer)
  endTimer = null
  if (!mergeBox.value) return
  mergeBox.value = null
  const r = release
  release = null
  r?.()
  const d = deferred
  deferred = null
  if (d) {
    announceNewTier(d.tier, d.target)
    onRevealResumed?.(d.tier, d.target)
  }
}

/** Test-only. */
export const __resetMergeBox = (): void => {
  if (endTimer !== null) clearTimeout(endTimer)
  endTimer = null
  mergeBox.value = null
  release?.()
  release = null
  deferred = null
  onRevealResumed = null
  views = 0
}
