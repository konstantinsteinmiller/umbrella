/**
 * Spotlight lessons — the moment on screen and the pause it holds. The coach
 * (`useCoach.ts`) decides WHICH and WHEN and counts the exposure; the look
 * lives in `LessonSpotlight.vue`.
 *
 * After playtest run 11 (the designer's call):
 *   threat — the countdown on the launcher: the first time a monster comes
 *            within DANGER_PIP_MARCHES marches, the game pauses and a ghost
 *            of it marches down while its pip and the unit's tick down
 *            together — to the line, where the unit is overrun. Then it
 *            rewinds and a ghost shot takes it out: the count is gone. The
 *            coach's rescue-shot lesson (survive) follows on the real board.
 *   speed / luck / bounty — what the three unexplained chips do, a few rows
 *            in and spaced out, each once, only while that chip is unbought:
 *            the chip spotlit, the effect shown twice — before (its value
 *            now) and after (its next value).
 *
 * Wordless: the numbers are the board's and the chips' own; the sentence is
 * for screen readers only. A tap skips. The game is paused throughout
 * (`acquireAppPause`), so nothing moves under the stage.
 */
import { shallowRef } from 'vue'
import { acquireAppPause } from '@/use/useGamePause'

export type SpotKind = 'threat' | 'speed' | 'luck' | 'bounty'
export type UpgradeSpotKind = Exclude<SpotKind, 'threat'>

export interface ThreatSpot {
  kind: 'threat'
  /** The monster the lesson walks (fewest marches; nearest the unit on a tie). */
  monsterId: number
  /** Its rows after each coming march; the last one crosses the line. */
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
export type SpotDraft = ThreatSpot | UpgradeSpot
export type Spot = SpotDraft & { seq: number; ms: number }

/** A see-through window in a spotlight's dim (client px): a soft circle
 *  (`r`) or a rounded rectangle (`w` × `h`); `k` 0..1 = how far it is open. */
export interface SpotHole {
  x: number
  y: number
  r?: number
  w?: number
  h?: number
  k?: number
}

/** One beat of the threat lesson's march, ms (a step, then both pips tick). */
export const THREAT_STEP_MS = 620
/** The threat lesson's other phases, ms, in order: the stage opens · (the
 *  march, one beat per step) · the breach · the rewind · the shot · the stage
 *  closes. */
export const THREAT_BEATS = { open: 400, breach: 700, rewind: 450, shot: 950, out: 350 } as const
/** The whole threat lesson for a march plan of `n` steps. */
export const threatSpotMs = (n: number): number =>
  THREAT_BEATS.open + Math.max(1, n) * THREAT_STEP_MS + THREAT_BEATS.breach + THREAT_BEATS.rewind + THREAT_BEATS.shot + THREAT_BEATS.out
/** The whole upgrade lesson. */
export const UPGRADE_SPOT_MS = 3400

/** The spotlight on screen, or null. */
export const lessonSpot = shallowRef<Spot | null>(null)

let seq = 0
let views = 0
let release: (() => void) | null = null
let endTimer: ReturnType<typeof setTimeout> | null = null
let onDone: (() => void) | null = null

/** A spotlight view mounted; returns its unregister. Without one (the DEV
 *  clean feed, the lab) a pause would freeze the game behind nothing. */
export const registerSpotView = (): (() => void) => {
  views++
  let done = false
  return () => {
    if (done) return
    done = true
    views = Math.max(0, views - 1)
  }
}

/** A view is mounted to show a spotlight. */
export const canSpot = (): boolean => views > 0 && !lessonSpot.value

/** Start `draft` (paused, tap to skip). `done` runs when it ends — played out,
 *  skipped or torn down. False when no view can show it or one is up. */
export const offerSpot = (draft: SpotDraft, done?: () => void): boolean => {
  if (!canSpot()) return false
  const ms = draft.kind === 'threat' ? threatSpotMs(draft.plan.length) : UPGRADE_SPOT_MS
  release = acquireAppPause()
  onDone = done ?? null
  lessonSpot.value = { ...draft, seq: ++seq, ms }
  if (endTimer !== null) clearTimeout(endTimer)
  endTimer = setTimeout(finishSpot, ms)
  return true
}

/** End it now (its timer, a tap, the view going away): the game runs again. */
export const finishSpot = (): void => {
  if (endTimer !== null) clearTimeout(endTimer)
  endTimer = null
  if (!lessonSpot.value) return
  lessonSpot.value = null
  const r = release
  release = null
  r?.()
  const d = onDone
  onDone = null
  d?.()
}

/** Test-only. */
export const __resetLessonSpot = (): void => {
  if (endTimer !== null) clearTimeout(endTimer)
  endTimer = null
  lessonSpot.value = null
  release?.()
  release = null
  onDone = null
  views = 0
}
