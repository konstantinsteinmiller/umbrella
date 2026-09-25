/**
 * The always-on overrun countdown (playtest run 2: the only warning was a red
 * floor, and the testers asked for a countdown). Every monster that will cross
 * the line within DANGER_PIP_MARCHES marches wears a pip with that number —
 * numbers only, the canvas shows no words — and the aim phase whose coming
 * march breaches shakes the board once and sounds a warning. Independent of
 * the coach's survive lesson (which may or may not be showing).
 *
 * Run 6: ONE threshold for all of it. The red floor and line used to light at
 * two rows of space (three marches for a walker) while the pips and the lose
 * demo waited for a `2`, so testers met a lit line that nothing explained.
 * Now "in danger" means within DANGER_PIP_MARCHES (3) marches, by each
 * monster's own pace, for the floor, the line, the pips ('3', '2', '1'), the
 * coach's rescue-shot reticles and the lose demo alike (`dangerMarches`,
 * `dangerIds`).
 *
 * Pure rules here (tested on their own); BoardRenderer draws them.
 */
import { chargesAt, restsAt } from '../engine/monsters'
import { COLS, FLOOR_Y, ROWS, type BoardState, type Monster } from '../engine/types'

/** Pips show from this many marches out ('3', '2', then '1') — the one danger
 *  threshold (see above). */
export const DANGER_PIP_MARCHES = 3

/** Pip discs, in cells: a walker's, a boss's and the unit's (BoardRenderer
 *  draws them; the threat spotlight lays its own over them). */
export const PIP_CELLS = { walker: 0.48, boss: 0.62, launcher: 0.62 } as const

/** Centre (cells) and size of a monster's pip: on its top-left shoulder,
 *  inside the left wall. `cellPx` = one cell in px (the wall's 1 px inset). */
export const monsterPipCell = (
  m: Pick<Monster, 'kind' | 'col' | 'row'>, cellPx: number
): { x: number; y: number; s: number } => {
  const s = m.kind === 'boss' ? PIP_CELLS.boss : PIP_CELLS.walker
  return { x: Math.max(s * 0.5 + 1 / Math.max(1, cellPx), m.col + s * 0.32), y: Math.max(m.row, 0.05) + s * 0.32, s }
}

/** Centre (cells) and size of the unit's pip: its right shoulder — its left
 *  one when it stands at the right wall. `lx` = the launcher's x in cells. */
export const launcherPipCell = (lx: number, cellPx: number): { x: number; y: number; s: number } => {
  const s = PIP_CELLS.launcher
  let x = lx + 0.58
  if (x + s / 2 > COLS - 1 / Math.max(1, cellPx)) x = lx - 0.58
  return { x, y: FLOOR_Y - 0.92, s }
}

/**
 * The rows `m` stands on after each of its next marches, until it crosses the
 * line (the last entry) or `cap` marches — the pace `marchesToBreach` counts
 * (frozen / resting marches repeat the row, a charge or an enraged boss moves
 * two). The threat spotlight walks a ghost along it.
 */
export const marchPlan = (
  m: Pick<Monster, 'kind' | 'id' | 'row' | 'h' | 'frozen' | 'enraged'>,
  nextTurn: number,
  cap = DANGER_PIP_MARCHES
): number[] => {
  const rows: number[] = []
  let row = m.row
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
    row += steps
    rows.push(row)
    if (row + m.h > ROWS) break
  }
  return rows
}

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

/**
 * Fewest marches any monster needs to cross the line (`marchesToBreach`):
 * 1..DANGER_PIP_MARCHES = danger, DANGER_PIP_MARCHES + 1 = none within reach
 * (also with no monster or no march coming), 0 = one already stands past it.
 * No allocation.
 */
export const dangerMarches = (s: Pick<BoardState, 'phase' | 'turn' | 'monsters'>): number => {
  const next = nextMarchTurn(s)
  if (next < 0) return DANGER_PIP_MARCHES + 1
  let best = DANGER_PIP_MARCHES + 1
  const ms = s.monsters
  for (let i = 0; i < ms.length; i++) {
    const n = marchesToBreach(ms[i]!, next)
    if (n < best) best = n
  }
  return best
}

/** Ids of the monsters in danger — within DANGER_PIP_MARCHES marches (or past
 *  the line): the ones wearing a pip, the ones a rescue shot is for. */
export const dangerIds = (s: Pick<BoardState, 'phase' | 'turn' | 'monsters'>): number[] => {
  const next = nextMarchTurn(s)
  if (next < 0) return []
  const out: number[] = []
  for (const m of s.monsters) if (marchesToBreach(m, next) <= DANGER_PIP_MARCHES) out.push(m.id)
  return out
}

/**
 * The unit's danger cue (run 4: a still frame showed nothing of the pre-breach
 * shake and sound): true while any monster wears the `1` pip — its very next
 * march crosses the line. Exactly the pips' rule, so the cowering unit, the
 * lit skulls and the red `1` always agree. Never in a breach (no march is
 * coming). No allocation.
 */
export const breachComing = (s: Pick<BoardState, 'phase' | 'turn' | 'monsters'>): boolean => {
  const next = nextMarchTurn(s)
  if (next < 0) return false
  const ms = s.monsters
  for (let i = 0; i < ms.length; i++) if (marchesToBreach(ms[i]!, next) === 1) return true
  return false
}
