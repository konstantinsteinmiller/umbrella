/**
 * The HUD name tip — a small plate that names the thing the player just
 * TAPPED (play-test run 3: the chest's pill and countdown, and the shield
 * charge beside the tray, went unexplained; a `title` never shows on touch —
 * run 4: the rank plaque's "#15,667 of 15,876" too).
 *
 * A label on demand, not a teaching card: it only ever answers a tap, sits
 * beside the tapped element (never over the board centre), holds the
 * element's glyph + its name + its value where one applies, and goes away
 * after TIP_MS or on the next pointerdown anywhere. `HudTip.vue` (mounted once
 * by GameScene) draws it; this module is the shared state, component-free so
 * any HUD element can raise it without an import cycle.
 */
import { shallowRef } from 'vue'
import type { UpgradeId } from '@/barrage/engine/types'

/** What the plate can show as a glyph: BarrageGlyph names, the wallet coin
 *  and the treasure chest's own art. */
export type TipIcon = 'shield' | 'revive' | 'warcry' | 'clock' | 'coin' | 'chest' | 'trophy' | UpgradeId

/** A value line: a glyph (none when the plate's own glyph already says it),
 *  a (digits-only or already translated) text, and an optional quieter tail
 *  in the same line — the rank's "of 2,345". */
export interface TipFact { icon?: TipIcon; text: string; sub?: string }

export interface TipContent {
  /** Absent: a name-only plate (a HUD button's long-press, run 9). */
  icon?: TipIcon
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

/**
 * Playtest run 9 (GLÜCK, the calendar and profile icons: "I read carefully but
 * still couldn't explain"): a press held LONG_PRESS_MS on an upgrade chip or a
 * HUD button names it instead of acting — the same plate, on demand. Returns
 * the handlers for the element and `consumed()`, true (once) when the click
 * that ends a long-press must do nothing.
 */
export const LONG_PRESS_MS = 450
export const longPressTip = (content: () => TipContent) => {
  let timer = 0
  let fired = false
  const cancel = (): void => { window.clearTimeout(timer) }
  return {
    down: (ev: PointerEvent): void => {
      fired = false
      window.clearTimeout(timer)
      const el = ev.currentTarget as HTMLElement | null
      if (!el) return
      timer = window.setTimeout(() => {
        fired = true
        showHudTip(el, content)
      }, LONG_PRESS_MS)
    },
    cancel,
    consumed: (): boolean => {
      cancel()
      const f = fired
      fired = false
      return f
    }
  }
}

/** What the rank plaque (`RankBadge`, `tap`) shows: the trophy, its name and
 *  its placing — "#1,130" with its quieter "of 2,345", the plaque's own texts. */
export const rankTip = (name: string, info: { rank: string; of: string | null; aria: string }): TipContent => ({
  icon: 'trophy',
  name,
  facts: [info.of ? { text: info.rank, sub: info.of } : { text: info.rank }],
  // The plaque's own label ("Leaderboard rank 1,130 of 2,345") names it too.
  sr: info.aria
})

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
