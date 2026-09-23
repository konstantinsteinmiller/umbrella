/**
 * Elemental Barrage — UI-side shared helpers (owned by the UI layer).
 *
 * Kept free of component imports so the tutorial composable, the scene and the
 * overlays can all share the board seam and the number formatting without
 * forming import cycles.
 */
import { shallowRef, ref } from 'vue'
import { formatBig } from '@/utils/bigNumber'
import type { UpgradeId } from '@/barrage/engine/types'

/** The part of BarrageBoard's `defineExpose` the DOM layer relies on (CONTRACT §10). */
export interface BoardApi {
  launcherClientPoint(): { x: number; y: number } | null
  cellToClient(x: number, y: number): { x: number; y: number } | null
  boardClientRect(): DOMRect | null
}

/** The mounted board — set by GameScene, read by the FTUE overlay and banners.
 *  A shallowRef because the component instance must not be made deep-reactive. */
export const boardApi = shallowRef<BoardApi | null>(null)

/** True from BarrageBoard's `aimStart` until `aimCancel` / `fired`: the coach hand
 *  must get out of the way the moment a finger is on the board. */
export const playerAiming = ref(false)

/** The finger on the board points AT the monsters instead of pulling back
 *  (BarrageBoard's `aimWrongWay`): the drag vector in CSS px (y down), or
 *  null. The one moment the coach draws WHILE the player is aiming — the
 *  pull-back arrow, live, pointing the right way under their thumb. */
export const aimWrongWay = shallowRef<{ dx: number; dy: number } | null>(null)

// ─── Number formatting ───────────────────────────────────────────────────────
// Numbers are locale-neutral in this game (Latin digits, K/M/B suffixes — the
// same rule the wallet and the MIW HUD follow), so they are formatted here and
// passed into i18n messages as parameters; words never are.

/** Multiplier body without the sign: 1.25 · 12.5 · 1.23K. */
export const fmtMult = (v: number): string => {
  if (v < 10) return String(Math.round(v * 100) / 100)
  if (v < 100) return String(Math.round(v * 10) / 10)
  return formatBig(v, { sig: 3, trim: true })
}

/** Coin amounts on buttons and chips — compact, never rounded up past the truth. */
export const fmtCoins = (n: number): string =>
  formatBig(Math.max(0, Math.floor(n)), { decimals: 1, trim: true, lower: true })

/** Ball speed at level 0 (cells/s) — CONTRACT §6 "15 → 26 cells/s". The speed
 *  chip shows "percent faster" relative to it, which is the only framing a
 *  player can read without knowing what a cell is. */
export const BASE_BALL_SPEED = 15

export type UpgradeValueKind = 'mult' | 'count' | 'percent' | 'plusPercent'

export const upgradeValueKind = (id: UpgradeId): UpgradeValueKind =>
  id === 'damage' || id === 'bounty' ? 'mult'
    : id === 'capacity' ? 'count'
      : id === 'speed' ? 'plusPercent'
        : 'percent'

/**
 * The number part of an upgrade value, already in the unit its i18n message
 * expects. STATE hands raw effect numbers (`UpgradeView.value`): speed in
 * cells/s and luck as a 0..1 fraction — but both are tolerated as already-
 * converted percentages too, so a STATE-side change of unit can't print
 * "+1400%" or "0%".
 */
export const upgradeValueNumber = (id: UpgradeId, v: number): string => {
  switch (upgradeValueKind(id)) {
    case 'mult': return fmtMult(v)
    case 'count': return String(Math.round(v))
    case 'plusPercent': {
      const pct = v > 5 ? (v / BASE_BALL_SPEED - 1) * 100 : v <= 1 ? v * 100 : v
      return String(Math.max(0, Math.round(pct)))
    }
    case 'percent':
    default: {
      const pct = v <= 1 ? v * 100 : v
      return String(Math.round(pct))
    }
  }
}

/** i18n key of the value template for an upgrade kind (`barrage.upgrades.fmt.*`). */
export const upgradeValueKey = (id: UpgradeId): string => `barrage.upgrades.fmt.${upgradeValueKind(id)}`

/** h:mm:ss / m:ss — digits only, so no locale words are involved. */
export const fmtCountdown = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** Centre of an element in client px, or null when it is not laid out. */
export const centreOf = (el: Element | null | undefined): { x: number; y: number } | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}
