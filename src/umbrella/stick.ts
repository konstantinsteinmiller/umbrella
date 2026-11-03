// ─── The touch joystick's arithmetic ────────────────────────────────────────
//
// The pad is a horizontal slider. The finger is followed wherever it goes (the caller listens on the window), and
// when it is dragged past either end of the pad the pad's centre follows it: turning back then reverses at once,
// instead of first having to travel all the way back across the outline and the other half of the pad.

export const STICK_DEAD = 12

export interface StickState { origin: number; dx: number; dir: -1 | 0 | 1 }

/** The stick for a finger at `x`, given the pad's current centre `origin` and how far the knob may travel. */
export const stickAt = (origin: number, range: number, x: number): StickState => {
  let dx = x - origin
  if (dx > range) { origin += dx - range; dx = range }
  else if (dx < -range) { origin += dx + range; dx = -range }
  return { origin, dx, dir: Math.abs(dx) < STICK_DEAD ? 0 : dx > 0 ? 1 : -1 }
}
