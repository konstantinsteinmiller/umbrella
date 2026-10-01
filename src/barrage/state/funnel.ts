/**
 * Elemental Barrage — the drop-off funnel (retention roadmap T0.1).
 *
 * Each milestone goes out at most once per page session, as a `start` +
 * `complete` pair, to the platform's measure API. Today that is Poki's
 * `measure(category, what, action)`, via `pokiMeasure`, the only portal in the
 * matrix that has one. On every other build the sink is null and each call is a
 * no-op. It never throws, because analytics must never break a run. The run owner
 * (`useBarrage`) reports the game events; the play clock reports the session time.
 *
 * THE MEASURE CONTRACT (`integrate-poki` SDK-REFERENCE §4, measured on Glyphyx 1.2.1):
 *   • The Player Fit test's Events table has one row per (category, what) and
 *     only the Started / Completed / Failed columns. A custom action is accepted
 *     by the SDK and never displayed, so a milestone ("the player got here") is
 *     a `start` and a `complete` sent together. The row's Gameplays is then the
 *     number of sessions that reached it.
 *   • No `/` or `^` in any argument (the SDK drops the event). This module
 *     sends only `[a-z0-9_]` and refuses anything else.
 *   • The values stay stable across versions, or the funnels break.
 *   • Never an ad impression: the SDK tracks those itself.
 *
 * NEW vs RETURNING rides in the CATEGORY (`funnel_new` / `funnel_returning`),
 * because the table can split only by (category, what): each milestone gets one
 * row per cohort. The cohort is decided once, at the session's first milestone,
 * which is always `first_shot` because nothing else can happen before a shot.
 * The run owner installs the resolver ("the save shows play from an earlier
 * session"). The cohort is frozen from then on, so one session never splits
 * across both categories. When it cannot be decided, the player counts as
 * returning (fail closed), so an unknown never pollutes the new-player funnel.
 */
import { pokiMeasure } from '@/utils/pokiPlugin'

export type FunnelMilestone =
  | 'first_shot'
  | 'row_5'
  | 'boss1_spawn'
  | 'boss1_kill'
  | 'first_loss'
  | 'row_20'
  | 'played_180s'
  | 'played_300s'
  | 'played_480s'

/** Every milestone, in funnel order. */
export const FUNNEL_MILESTONES: readonly FunnelMilestone[] = [
  'first_shot', 'row_5', 'boss1_spawn', 'boss1_kill', 'first_loss', 'row_20', 'played_180s', 'played_300s', 'played_480s'
]

/** Endless rows: [row reached, milestone]. */
export const ROW_MILESTONES: readonly (readonly [number, FunnelMilestone])[] = [[5, 'row_5'], [20, 'row_20']]

/** Session play time: [seconds of ACTIVE play (`sessionPlaySeconds`), milestone]. */
export const PLAY_TIME_MILESTONES: readonly (readonly [number, FunnelMilestone])[] = [
  [180, 'played_180s'], [300, 'played_300s'], [480, 'played_480s']
]

export type FunnelCohort = 'new' | 'returning'

/** The measure category per cohort: the Events table's split. */
export const FUNNEL_CATEGORY: Readonly<Record<FunnelCohort, string>> = {
  new: 'funnel_new',
  returning: 'funnel_returning'
}

/** Poki's `measure(category, what, action)`, argument names as the docs give them. */
export type MeasureSink = (category: string, what: string, action: string) => void

/** The platform's measure API, or null where the platform has none. The
 *  literal folds per build, and `@/utils/pokiPlugin` is stub-aliased off Poki
 *  anyway, so no other build carries a live Poki call. */
const platformSink = (): MeasureSink | null =>
  import.meta.env.VITE_APP_POKI === 'true' ? pokiMeasure : null

const CLEAN_ARG = /^[a-z0-9_]+$/

let sink: MeasureSink | null = platformSink()
let resolveCohort: (() => FunnelCohort) | null = null
let cohort: FunnelCohort | null = null
const reached = new Set<FunnelMilestone>()

/** Install how the session's cohort is decided (called once by the run owner).
 *  It runs lazily, at the first milestone that actually goes out. */
export const setFunnelCohortResolver = (fn: () => FunnelCohort): void => {
  resolveCohort = fn
}

const cohortNow = (): FunnelCohort => {
  if (cohort !== null) return cohort
  let c: FunnelCohort = 'returning'
  try {
    if (resolveCohort?.() === 'new') c = 'new'
  } catch { /* undecidable: counts as returning */ }
  cohort = c
  return c
}

/**
 * Report `what`. Returns true the first time it is reached in this page session
 * (whether or not the platform records it), false on every repeat.
 */
export const funnelMilestone = (what: FunnelMilestone): boolean => {
  if (reached.has(what)) return false
  reached.add(what)
  try {
    if (!sink) return true
    const category = FUNNEL_CATEGORY[cohortNow()]
    if (!CLEAN_ARG.test(category) || !CLEAN_ARG.test(what)) {
      console.warn('[funnel] refusing a measure argument outside [a-z0-9_]', category, what)
      return true
    }
    sink(category, what, 'start')
    sink(category, what, 'complete')
  } catch (e) {
    console.warn('[funnel] measure failed', what, e)
  }
  return true
}

/** An endless row spawned: every row milestone at or below it. */
export const funnelRow = (row: number): void => {
  for (const [at, what] of ROW_MILESTONES) if (row >= at) funnelMilestone(what)
}

/** The session clock moved: every play-time milestone at or below it. */
export const funnelPlayTime = (seconds: number): void => {
  for (const [at, what] of PLAY_TIME_MILESTONES) if (seconds >= at) funnelMilestone(what)
}

/** Test-only: route the funnel to `s` (null: the no-op path). */
export const __setFunnelSinkForTests = (s: MeasureSink | null): void => {
  sink = s
}

/** Test-only: a fresh page session on the build's own sink. */
export const __resetFunnelForTests = (): void => {
  reached.clear()
  cohort = null
  resolveCohort = null
  sink = platformSink()
}
