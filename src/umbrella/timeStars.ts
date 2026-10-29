// ─── Timed levels: the countdown and its 1–3 star rating ────────────────────
//
// A level with `timeLimit` (seconds, set in the level editor) counts down from the spawn. The
// clock keeps running through a checkpoint revive; when it runs out the level starts over from
// the spawn (checkpoints do not count). Landing on the finish rates the run by the time left.
// Pure: the scene, the level selector and the tests all read it.

/** Whole seconds still on the clock for three stars, and for two (less than that: one). */
export const THREE_STARS_AT = 2
export const TWO_STARS_AT = 1
/** The longest limit the editor accepts. */
export const MAX_TIME_LIMIT = 999

/** Stars for a finish with `left` of `limit` seconds still on the clock (0 when it ran out): the
 *  whole seconds the clock shows — 2 or more ★★★, 1 ★★, under a second ★. */
export const timeStars = (left: number, limit: number): 0 | 1 | 2 | 3 => {
  if (!(limit > 0) || !(left > 0)) return 0
  const s = Math.floor(left)
  return s >= THREE_STARS_AT ? 3 : s >= TWO_STARS_AT ? 2 : 1
}

/** From how many seconds left the timer blinks: the last fifth of the limit, between 3 and 10 s. */
export const blinkFrom = (limit: number): number => Math.min(10, Math.max(3, limit * 0.2))

/** "12:34" — the whole seconds left (at least two digits), then hundredths of a second. The first
 *  numbers are what the rating counts: "01:xx" is 1–1.99 s left (★★), "00:xx" the last second (★). */
export const formatClock = (seconds: number): string => {
  const cs = Math.max(0, Math.floor(seconds * 100))
  return `${String(Math.floor(cs / 100)).padStart(2, '0')}:${String(cs % 100).padStart(2, '0')}`
}

/** A time limit from untrusted data: a whole number of seconds in 1…MAX_TIME_LIMIT, else none. */
export const parseTimeLimit = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.min(MAX_TIME_LIMIT, Math.round(v)) : undefined
