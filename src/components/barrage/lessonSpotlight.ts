/**
 * Chip spotlights — the moment on screen. The coach (`useCoach.ts`) decides
 * WHICH and WHEN and counts the exposure; the look lives in
 * `LessonSpotlight.vue` (the shell) and `coach/UpgradeSpot.vue`.
 *
 * After playtest run 11 (the designer's call): what the three chips nobody
 * could explain do — Launch Speed ("Tempo"), Pickup Luck, Coin Bounty — a few
 * rows in and spaced out, each once, only while that chip is unbought: the
 * chip lit, the effect shown twice — before (its value now) and after (its
 * next value).
 *
 * They used to PAUSE the game under a dimmed stage (a tap skipped). Silent
 * Flow (retention-roadmap #2): none plays before the first boss kill, and
 * none pauses or dims any more — the demo plays over the running aim phase,
 * taps go through to the board, and a shot ends it (the board it showed has
 * changed). The threat lesson that shared this stage is a cue drawn by the
 * board now (`render/worldCues.ts`).
 *
 * Wordless: the numbers are the board's and the chips' own; the sentence is
 * for screen readers only.
 */
import { shallowRef } from 'vue'

export type SpotKind = 'threat' | 'speed' | 'luck' | 'bounty'
export type UpgradeSpotKind = Exclude<SpotKind, 'threat'>

/** The coach's threat draft: the monster the threat cue swells the pip of
 *  (fewest marches; nearest the unit on a tie) and its rows after each coming
 *  march — the last one crosses the line. */
export interface ThreatSpot {
  kind: 'threat'
  monsterId: number
  plan: number[]
}
export interface UpgradeSpot {
  kind: UpgradeSpotKind
  /** The chip's value now and after one level, as numbers (UI formats). */
  value: number
  next: number
  /** Bounty: the walker the demo "kills", and what it pays now / after one level. */
  monsterId?: number
  coinsNow?: number
  coinsNext?: number
}
export type Spot = UpgradeSpot & { seq: number; ms: number }

/** The whole chip spotlight, ms. */
export const UPGRADE_SPOT_MS = 3400

/** The spotlight on screen, or null. */
export const lessonSpot = shallowRef<Spot | null>(null)

let seq = 0
let views = 0
let endTimer: ReturnType<typeof setTimeout> | null = null
let onDone: (() => void) | null = null

/** A spotlight view mounted; returns its unregister. Without one (the DEV
 *  clean feed, the lab) nothing could show it. */
export const registerSpotView = (): (() => void) => {
  views++
  let done = false
  return () => {
    if (done) return
    done = true
    views = Math.max(0, views - 1)
  }
}

/** A view is mounted to show a spotlight, and none is up. */
export const canSpot = (): boolean => views > 0 && !lessonSpot.value

/** Start `draft` — over the running game: no pause, no dim. `done` runs when
 *  it ends (played out, cut short by a shot, or torn down). False when no view
 *  can show it or one is up. */
export const offerSpot = (draft: UpgradeSpot, done?: () => void): boolean => {
  if (!canSpot()) return false
  onDone = done ?? null
  lessonSpot.value = { ...draft, seq: ++seq, ms: UPGRADE_SPOT_MS }
  if (endTimer !== null) clearTimeout(endTimer)
  endTimer = setTimeout(finishSpot, UPGRADE_SPOT_MS)
  return true
}

/** End it now (its timer, a shot, the view going away). */
export const finishSpot = (): void => {
  if (endTimer !== null) clearTimeout(endTimer)
  endTimer = null
  if (!lessonSpot.value) return
  lessonSpot.value = null
  const d = onDone
  onDone = null
  d?.()
}

/** Test-only. */
export const __resetLessonSpot = (): void => {
  if (endTimer !== null) clearTimeout(endTimer)
  endTimer = null
  lessonSpot.value = null
  onDone = null
  views = 0
}
