// ─── Timed levels: the countdown and its 1–3 star rating ────────────────────
//
// A level with `timeLimit` (seconds, set in the level editor) counts down from the spawn. The
// clock keeps running through a checkpoint revive; when it runs out the level starts over from
// the spawn (checkpoints do not count). Landing on the finish rates the run by the time left.
// Pure: the scene, the level selector and the tests all read it.

/** Share of the limit still left for three stars, and for two. */
export const THREE_STARS_AT = 0.5
export const TWO_STARS_AT = 0.25
/** The longest limit the editor accepts. */
export const MAX_TIME_LIMIT = 999

/** Stars for a finish with `left` of `limit` seconds still on the clock (0 when it ran out). */
export const timeStars = (left: number, limit: number): 0 | 1 | 2 | 3 => {
  if (!(limit > 0) || !(left > 0)) return 0
  const f = left / limit
  return f >= THREE_STARS_AT ? 3 : f >= TWO_STARS_AT ? 2 : 1
}

/** From how many seconds left the timer blinks: the last fifth of the limit, between 3 and 10 s. */
export const blinkFrom = (limit: number): number => Math.min(10, Math.max(3, limit * 0.2))

/** "1:05", "0:09" — whole seconds, rounded up so it never shows 0:00 before the end. */
export const formatClock = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** A time limit from untrusted data: a whole number of seconds in 1…MAX_TIME_LIMIT, else none. */
export const parseTimeLimit = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.min(MAX_TIME_LIMIT, Math.round(v)) : undefined
