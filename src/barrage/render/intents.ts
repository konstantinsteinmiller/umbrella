/**
 * Intent previews (playtest run 5: four blind testers saw only still
 * screenshots, and a rule acted out in motion was lost on them) — a behaviour
 * kind's NEXT move, drawn so a still frame reads it, while its rule badge is
 * up (the kind's first TAG_TURNS aim phases) and the player aims:
 *
 *   • goblin  — a ghost in the cell it hops to, with a dotted arc. The engine
 *     picks the side with its RNG (then tries the other), which is never read
 *     here: with both sides free BOTH are shown, with one free that one is
 *     exactly where it goes.
 *   • dryad   — a green "+" on every neighbour it heals at the coming resolve
 *     (the engine heals only a wounded one, and the volley before the resolve
 *     is what wounds them — so every non-boss neighbour is marked).
 *   • centaur — the cell its sludge lands in, on the turns it spits.
 *   • treant  — a rest marker on the turns it rests (no march).
 *
 * Pure reads of the board — never the engine's RNG, never an allocation per
 * frame; BoardRenderer draws. `nextTurn` is `danger.nextMarchTurn(state)`: the
 * `turn` value the coming advance runs under.
 */
import { restsAt } from '../engine/monsters'
import { COLS, ROWS, type Monster, type Pickup } from '../engine/types'

type Mon = Pick<Monster, 'id' | 'kind' | 'col' | 'row' | 'w' | 'h' | 'frozen'>
type Pick1 = Pick<Pickup, 'col' | 'row'>

/** What the intents read of the board (a `BoardState` fits). Sludge is not
 *  read: every hazard on the board expires before the next advance moves
 *  anything (it lasts one volley). */
export interface IntentBoard {
  monsters: readonly Mon[]
  pickups: readonly Pick1[]
}

/** The monster whose footprint covers (col, row), or null. */
export const monsterAt = <M extends Mon>(ms: readonly M[], col: number, row: number): M | null => {
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]!
    if (col >= m.col && col < m.col + m.w && row >= m.row && row < m.row + m.h) return m
  }
  return null
}

const pickupAt = (ps: readonly Pick1[], col: number, row: number): boolean => {
  for (let i = 0; i < ps.length; i++) if (ps[i]!.col === col && ps[i]!.row === row) return true
  return false
}

const inBoard = (col: number, row: number): boolean => col >= 0 && col < COLS && row >= 0 && row < ROWS

// ─── Goblin ──────────────────────────────────────────────────────────────────
/** Hop sides, as a bit mask. */
export const HOP_LEFT = 1
export const HOP_RIGHT = 2

/**
 * The sides a goblin may hop to at the coming advance (it hops before the
 * march, in its own row): a mask of HOP_LEFT / HOP_RIGHT, 0 when it will not
 * hop (frozen, still above the board, or boxed in). Mirrors the engine's
 * `goblinHops` — a free cell has no monster and no pickup.
 */
export const hopSides = (m: Mon, b: IntentBoard): number => {
  if (m.kind !== 'goblin' || m.frozen > 0 || m.row < 0) return 0
  let mask = 0
  const free = (col: number): boolean => inBoard(col, m.row) && !monsterAt(b.monsters, col, m.row) && !pickupAt(b.pickups, col, m.row)
  if (free(m.col - 1)) mask |= HOP_LEFT
  if (free(m.col + m.w)) mask |= HOP_RIGHT
  return mask
}

// ─── Dryad ───────────────────────────────────────────────────────────────────
/** `n` is one of dryad `d`'s heal targets: orthogonally next to its footprint,
 *  never a boss (the engine's `dryadHeals`). */
export const healsNeighbour = (d: Mon, n: Mon): boolean => {
  if (n === d || n.id === d.id || n.kind === 'boss') return false
  const hTouch = n.row < d.row + d.h && n.row + n.h > d.row && (n.col + n.w === d.col || n.col === d.col + d.w)
  const vTouch = n.col < d.col + d.w && n.col + n.w > d.col && (n.row + n.h === d.row || n.row === d.row + d.h)
  return hTouch || vTouch
}

/** Every monster dryad `d` heals at the coming resolve (tests / probes; the
 *  renderer walks the list with `healsNeighbour` and allocates nothing). */
export const healTargets = <M extends Mon>(d: Mon, monsters: readonly M[]): M[] =>
  d.kind !== 'dryad' ? [] : monsters.filter((n) => healsNeighbour(d, n))

// ─── Centaur ─────────────────────────────────────────────────────────────────
/** A centaur spits at the advance of turns where this holds (the engine's
 *  `centaurSludge`: `(turn + id) % 2 === 0`, the same `turn` convention as
 *  `chargesAt`). */
export const spitsAt = (m: Pick<Monster, 'kind' | 'id'>, turn: number): boolean =>
  m.kind === 'centaur' && (turn + m.id) % 2 === 0

/** Something standing at (col, row) now moves out of it at the coming march. */
const movesOut = (b: IntentBoard, col: number, row: number, nextTurn: number): boolean => {
  const o = monsterAt(b.monsters, col, row)
  if (o) return o.frozen <= 0 && !restsAt(o, nextTurn)
  return true // a pickup marches too
}

const occupied = (b: IntentBoard, col: number, row: number): boolean =>
  monsterAt(b.monsters, col, row) !== null || pickupAt(b.pickups, col, row)

/**
 * Where a centaur's sludge lands at the coming advance: writes the cell into
 * `out` and returns true, or false when it will not spit (not its turn, or no
 * free cell). The engine spits AFTER the march, into the cell below it: read
 * with everything marching one row, that cell is two below it now — free only
 * if the cell right below it is empty now (whatever stands there comes along)
 * and whatever stands two below moves on. A frozen centaur stays put and spits
 * right below itself once that cell has cleared. (A monster killed by the
 * coming volley or a cyclops charging away can still change it.)
 */
export const spitCell = (m: Mon, b: IntentBoard, nextTurn: number, out: { col: number; row: number }): boolean => {
  if (!spitsAt(m, nextTurn)) return false
  const col = m.col
  let row: number
  if (m.frozen > 0) {
    row = m.row + 1
    if (!inBoard(col, row) || (occupied(b, col, row) && !movesOut(b, col, row, nextTurn))) return false
  } else {
    if (occupied(b, col, m.row + 1)) return false
    row = m.row + 2
    if (!inBoard(col, row) || (occupied(b, col, row) && !movesOut(b, col, row, nextTurn))) return false
  }
  out.col = col
  out.row = row
  return true
}

// ─── Treant ──────────────────────────────────────────────────────────────────
/** The treant rests (does not march) at the coming advance. A frozen one is
 *  held by the ice instead — its frost star says so. */
export const restsNext = (m: Mon, nextTurn: number): boolean =>
  m.kind === 'treant' && m.frozen <= 0 && restsAt(m, nextTurn)
