/**
 * The HUD name tip — a small plate that names the thing the player just
 * TAPPED (play-test run 3: the chest's pill and countdown, and the shield
 * charge beside the tray, went unexplained; a `title` never shows on touch).
 *
 * A label on demand, not a teaching card: it only ever answers a tap, sits
 * beside the tapped element (never over the board centre), holds the
 * element's glyph + its name + its value where one applies, and goes away
 * after TIP_MS or on the next pointerdown anywhere. `HudTip.vue` (mounted once
 * by GameScene) draws it; this module is the shared state, component-free so
 * any HUD element can raise it without an import cycle.
 */
import { shallowRef } from 'vue'

/** What the plate can show as a glyph: BarrageGlyph names, the wallet coin
 *  and the treasure chest's own art. */
export type TipIcon = 'shield' | 'revive' | 'warcry' | 'clock' | 'coin' | 'chest'

/** A value line: a glyph and a (digits-only or already translated) text. */
export interface TipFact { icon: TipIcon; text: string }

export interface TipContent {
  icon: TipIcon
  /** Already translated (i18n) — the element's name, or name + value. */
  name: string
  facts?: TipFact[]
  /** The screen-reader sentence (translated), read once when the plate opens.
   *  Defaults to the name and the facts. */
  sr?: string
}

export interface TipShow {
  seq: number
  /** The tapped element: the plate anchors beside it. */
  anchor: HTMLElement
  /** Read while the plate is up (reactively), so a countdown keeps ticking. */
  content: () => TipContent
}

/** How long a plate stays up when nothing else happens. */
export const TIP_MS = 2500

export const hudTip = shallowRef<TipShow | null>(null)
let seq = 0

/** Name `anchor` for a moment (a second tap restarts the clock). */
export const showHudTip = (anchor: HTMLElement, content: () => TipContent): void => {
  hudTip.value = { seq: ++seq, anchor, content }
}

export const hideHudTip = (): void => {
  if (hudTip.value) hudTip.value = null
}

export interface TipBox { left: number; top: number; width: number; height: number }
export interface TipPlace {
  left: number
  top: number
  /** The plate hangs under the anchor (no room above it). */
  below: boolean
  /** Where its little pointer sits, px from the plate's left edge. */
  caret: number
}

/** Gap between the plate and the element / the screen edge, px. */
export const TIP_GAP = 8
/** The pointer never sits closer than this to a plate corner, px. */
const CARET_INSET = 12

/**
 * Where the plate goes: centred over the anchor, above it (the HUD sits under
 * or beside the board, so "above" is its edge, never its centre) — below it
 * when there is no room above — and clamped inside the viewport. Its pointer
 * stays on the anchor however far the clamp pushed the plate.
 */
export const placeTip = (anchor: TipBox, plate: { width: number; height: number }, view: { width: number; height: number }): TipPlace => {
  const cx = anchor.left + anchor.width / 2
  const maxLeft = Math.max(TIP_GAP, view.width - TIP_GAP - plate.width)
  const left = Math.min(maxLeft, Math.max(TIP_GAP, cx - plate.width / 2))
  const caret = Math.min(Math.max(CARET_INSET, plate.width - CARET_INSET), Math.max(CARET_INSET, cx - left))
  const above = anchor.top - TIP_GAP - plate.height
  if (above >= TIP_GAP) return { left, top: above, below: false, caret }
  const below = anchor.top + anchor.height + TIP_GAP
  return { left, top: Math.min(below, Math.max(TIP_GAP, view.height - TIP_GAP - plate.height)), below: true, caret }
}
