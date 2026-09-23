/**
 * Board layout — board cells ⇄ CSS px inside the BarrageBoard canvas.
 *
 * The board is letterboxed inside whatever box the parent gives the component:
 * world x ∈ [−SIDE, COLS + SIDE], world y ∈ [−TOP, FLOOR_Y + BOTTOM]. Everything
 * is drawn in CSS px (the context carries the DPR transform); sprite bakes are
 * made at `cssSize × dpr` so they stay crisp.
 */
import { COLS, FLOOR_Y } from '../engine/types'

/** Cells shown above row 0 (a spawning boss peeks in from here). */
export const BOARD_TOP = 0.28
/** Cells below the floor line (room for the launcher pedestal + ball count). */
export const BOARD_BOTTOM = 1.0
/** Wall frame thickness in cells, each side. */
export const BOARD_SIDE = 0.1
export const BOARD_W = COLS + BOARD_SIDE * 2
export const BOARD_H = BOARD_TOP + FLOOR_Y + BOARD_BOTTOM
/** Width : height of the letterboxed board. */
export const BOARD_ASPECT = BOARD_W / BOARD_H

export interface BoardLayout {
  /** Canvas box in CSS px. */
  cssW: number
  cssH: number
  dpr: number
  /** CSS px per board cell. */
  cell: number
  /** CSS px of board cell (0,0) — the top-left corner of row 0, column 0. */
  ox: number
  oy: number
  /** Letterboxed board rect (incl. margins) in CSS px, relative to the canvas. */
  bx: number
  by: number
  bw: number
  bh: number
}

export const makeLayout = (): BoardLayout => ({
  cssW: 0, cssH: 0, dpr: 1, cell: 1, ox: 0, oy: 0, bx: 0, by: 0, bw: 0, bh: 0
})

/** Fit the board into (cssW × cssH), centred. Mutates and returns `out`. */
export const computeLayout = (out: BoardLayout, cssW: number, cssH: number, dpr: number): BoardLayout => {
  out.cssW = cssW
  out.cssH = cssH
  out.dpr = dpr
  const cell = Math.max(1, Math.min(cssW / BOARD_W, cssH / BOARD_H))
  out.cell = cell
  out.bw = cell * BOARD_W
  out.bh = cell * BOARD_H
  out.bx = (cssW - out.bw) / 2
  // Portrait phones: hug the bottom a little less than centre so the launcher
  // sits near the thumb while the HUD above keeps its room — centred is the
  // safe default; the parent box already excludes the HUD.
  out.by = (cssH - out.bh) / 2
  out.ox = out.bx + BOARD_SIDE * cell
  out.oy = out.by + BOARD_TOP * cell
  return out
}

/** Board cells → canvas CSS px. */
export const cellX = (l: BoardLayout, x: number): number => l.ox + x * l.cell
export const cellY = (l: BoardLayout, y: number): number => l.oy + y * l.cell
/** Canvas CSS px → board cells. */
export const toCellX = (l: BoardLayout, px: number): number => (px - l.ox) / l.cell
export const toCellY = (l: BoardLayout, py: number): number => (py - l.oy) / l.cell
