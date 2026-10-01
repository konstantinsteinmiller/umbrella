/**
 * The first "+1" that becomes a ball — in the world, while play goes on.
 *
 * After playtest run 8 ("+1 means more balls = more damage" was never shown)
 * the first collected "+1" PAUSED the game and flew across a dimmed stage
 * into the tray for 2.6 s. Silent Flow (retention-roadmap #2) ended every
 * pause before the first boss kill, and this one sat in the first ten
 * seconds. The same lesson now plays in the world:
 *
 *   • before it is taken, every "+1" on the board pulses (the FTUE's "+1"
 *     beats, `worldCues.plusPulse`, kept by useTutorial) and the FTUE's ghost
 *     finger aims at it;
 *   • when it is taken, the tray plays its own flight — the "+1" flies from
 *     where it was collected into the socket it fills and that ball bounces.
 *
 * So `offerPickup` never takes the moment (the tray keeps its own juice). The
 * first one of a profile is still counted (`eb_coach` exposure `pickupBox`)
 * and says its sentence to screen readers (the coach's cue region).
 */
import { shallowRef } from 'vue'
import { bumpExposure, lessonShown, sayCue } from '@/use/useCoach'

export interface Pt { x: number; y: number }

export interface PickupBox {
  seq: number
  from: Pt
  idx: number
  tier: number
  ms: number
}

/** Always null: nothing is staged any more. Kept because the tray hides the
 *  ball a stage draws (`BallTray`'s `boxedIdx`). */
export const pickupBox = shallowRef<PickupBox | null>(null)

export interface PickupOffer {
  from: Pt | null
  idx: number
  tier: number
  /** Nothing else owns the screen (no modal). */
  allowed: boolean
}

/** A collected "+1" just became a ball in the tray. Never takes the moment
 *  (returns false: the tray plays its own flight and bounce); the first one of
 *  a profile is counted and told to screen readers. */
export const offerPickup = (_o: PickupOffer): boolean => {
  if (lessonShown('pickupBox') < 1) {
    bumpExposure('pickupBox')
    sayCue({ kind: 'pickup' })
  }
  return false
}
