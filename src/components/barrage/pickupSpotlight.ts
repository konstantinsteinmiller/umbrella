/**
 * The first "+1" on a stage — WHEN (the look lives in `PickupSpotlight.vue`).
 *
 * The designer's call after playtest run 8: "+1 means more balls = more
 * damage" was never shown — a bubble popped on the board and a socket filled
 * somewhere under it. So the first time a collected "+1" becomes a ball, the
 * game PAUSES (`acquireAppPause`) and a soft spotlight follows it: the bubble
 * lifts off the board, arcs down into the tray socket it filled and turns
 * into that ball, then a comet runs from the new ball into the launcher — one
 * more ball, one more shot every volley. Wordless; a tap skips it. Once per
 * profile: the count lives in the coach's save (`eb_coach`, exposure
 * `pickupBox`), so it hydrates with the rest of the coach's bookkeeping.
 */
import { shallowRef } from 'vue'
import { acquireAppPause } from '@/use/useGamePause'
import { bumpExposure, lessonShown } from '@/use/useCoach'

/** The whole moment, ms. */
export const PICKUP_BOX_MS = 2600

export interface Pt { x: number; y: number }

export interface PickupBox {
  seq: number
  /** Where on screen the "+1" was collected (client px). */
  from: Pt
  /** Tray index of the ball it became (`[data-slot=idx] .unit-holder`). */
  idx: number
  tier: number
  ms: number
}

/** The spotlight on screen, or null. */
export const pickupBox = shallowRef<PickupBox | null>(null)

let seq = 0
/** Mounted views: without one (the DEV clean feed, the lab) a pause would
 *  freeze the game behind nothing. */
let views = 0
let release: (() => void) | null = null
let endTimer: ReturnType<typeof setTimeout> | null = null

/** A spotlight view mounted; returns its unregister. */
export const registerPickupBoxView = (): (() => void) => {
  views++
  let done = false
  return () => {
    if (done) return
    done = true
    views = Math.max(0, views - 1)
  }
}

export interface PickupOffer {
  from: Pt | null
  idx: number
  tier: number
  /** Nothing else owns the screen (no modal, no merge lightbox). */
  allowed: boolean
}

/** A collected "+1" just became a ball in the tray. Returns true when the
 *  spotlight takes it — the tray then skips its own "+1" flight and pop. */
export const offerPickup = (o: PickupOffer): boolean => {
  if (!o.allowed || !o.from || views === 0 || pickupBox.value) return false
  if (lessonShown('pickupBox') >= 1) return false
  bumpExposure('pickupBox')
  release = acquireAppPause()
  pickupBox.value = { seq: ++seq, from: o.from, idx: o.idx, tier: o.tier, ms: PICKUP_BOX_MS }
  if (endTimer !== null) clearTimeout(endTimer)
  endTimer = setTimeout(finishPickup, PICKUP_BOX_MS)
  return true
}

/** End it now (its timer, a tap, or the view going away): the game runs again. */
export const finishPickup = (): void => {
  if (endTimer !== null) clearTimeout(endTimer)
  endTimer = null
  if (!pickupBox.value) return
  pickupBox.value = null
  const r = release
  release = null
  r?.()
}

/** Test-only. */
export const __resetPickupBox = (): void => {
  if (endTimer !== null) clearTimeout(endTimer)
  endTimer = null
  pickupBox.value = null
  release?.()
  release = null
  views = 0
}
