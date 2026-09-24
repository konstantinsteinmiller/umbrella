/**
 * The always-on overrun countdown (playtest run 2: the only warning was a red
 * floor, and the testers asked for a countdown). Every monster that will cross
 * the line within DANGER_PIP_MARCHES marches wears a pip with that number —
 * numbers only, the canvas shows no words — and the aim phase whose coming
 * march breaches shakes the board once and sounds a warning. Independent of
 * the coach's survive lesson (which may or may not be showing).
 *
 * Pure rules here (tested on their own); BoardRenderer draws them.
 */
import { chargesAt, restsAt } from '../engine/monsters'
import { ROWS, type BoardState, type Monster } from '../engine/types'

/** Pips show from this many marches out ('2', then '1'). */
export const DANGER_PIP_MARCHES = 2

/**
 * The `turn` value the NEXT advance runs under — `chargesAt` / `restsAt` read
 * it (fire() bumps `turn`, so while aiming the next march is `turn + 1`, and
 * during the volley it is `turn`). −1 in a breach: no march is coming.
 */
export const nextMarchTurn = (s: Pick<BoardState, 'phase' | 'turn'>): number => {
  switch (s.phase) {
    case 'aim':
    case 'advance':
      return s.turn + 1
    case 'volley':
    case 'resolve':
      return s.turn
    default:
      return -1
  }
}

/**
 * Marches until `m` crosses the line — 1 = the very next march breaches — or
 * `cap + 1` when it is further out than `cap` (0 if it already stands past the
 * line). Walks the monster's own pace: a frozen one skips a march, a resting
 * treant stays, a charging cyclops and an enraged boss stride two rows. A
 * monster held up by another below it is counted as free: the one below is
 * closer anyway, and it is the one to kill first.
 */
export const marchesToBreach = (
  m: Pick<Monster, 'kind' | 'id' | 'row' | 'h' | 'frozen' | 'enraged'>,
  nextTurn: number,
  cap = DANGER_PIP_MARCHES
): number => {
  let left = ROWS - (m.row + m.h)
  if (left < 0) return 0
  let frozen = m.frozen
  let t = nextTurn
  for (let n = 1; n <= cap; n++, t++) {
    let steps: number
    if (frozen > 0) {
      frozen--
      steps = 0
    } else if (restsAt(m, t)) {
      steps = 0
    } else {
      steps = (m.kind === 'boss' && m.enraged) || chargesAt(m, t) ? 2 : 1
    }
    if (steps > left) return n
    left -= steps
  }
  return cap + 1
}
