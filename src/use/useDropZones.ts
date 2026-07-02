/**
 * A tiny global registry of drag-and-drop target rectangles, so the merge grid
 * can hit-test the cauldron / injection lanes on pointer-up without the two
 * components having to know about each other. The cauldron registers its live
 * bounding rect (via a getter so it always reflects the current layout / scroll
 * position); the grid queries `hitZone(x, y)` when a drag is released.
 */

import { ref } from 'vue'

type RectGetter = () => DOMRect | null

const zones = new Map<string, RectGetter>()

/** Shared, reactive drag state so the lanes/cauldron can light up while a unit
 *  is being dragged. Set by the merge grid during a pointer drag. */
export const dragActive = ref(false)
export const dragTier = ref(0)
/** True while the pointer (mid-drag) is hovering a valid drop zone. */
export const dragOverDrop = ref(false)

export const registerDropZone = (id: string, getRect: RectGetter): void => {
  zones.set(id, getRect)
}

export const unregisterDropZone = (id: string): void => {
  zones.delete(id)
}

/** Return the id of the first registered zone whose rect contains the point,
 *  or null. The point is in client (viewport) coordinates. */
export const hitZone = (x: number, y: number): string | null => {
  for (const [id, getRect] of zones) {
    const r = getRect()
    if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id
  }
  return null
}

/** The live rect for a single zone (used to aim the cosmetic inject slide). */
export const zoneRect = (id: string): DOMRect | null => {
  const g = zones.get(id)
  return g ? g() : null
}
