// ─── The landscape lock: when the game asks a phone to be turned sideways ───────
//
// Umbrella is built for a wide view. A touch device held upright gets a full-screen "turn your
// phone" card (components/umbrella/RotateLock.vue) instead of a squeezed game; turning the device
// lifts it. A desktop browser is never locked, however narrow its window is.

/** A device whose primary input is a finger: phones and tablets, never a desktop window. */
export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Android|iPhone|iPad|iPod|Mobile|Tablet|Kindle|Silk/i.test(ua)) return true
  // iPadOS reports a Mac.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true
  return !!window.matchMedia?.('(pointer: coarse) and (hover: none)').matches
}

/** The card shows while a touch device is taller than it is wide. Pure, for the spec. */
export const shouldLockRotate = (touch: boolean, width: number, height: number): boolean =>
  touch && height > width
