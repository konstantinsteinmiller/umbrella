/**
 * Umbrella — UI-side shared helpers (owned by the UI layer).
 *
 * Kept free of component imports so the tutorial composable, the scene and the
 * overlays can all share the board seam and the number formatting without
 * forming import cycles.
 */
import { shallowRef, ref } from 'vue'
import { formatBig } from '@/utils/bigNumber'
import type { Phase, UpgradeId } from '@/barrage/engine/types'

/** The part of BarrageBoard's `defineExpose` the DOM layer relies on (CONTRACT §10). */
export interface BoardApi {
  launcherClientPoint(): { x: number; y: number } | null
  cellToClient(x: number, y: number): { x: number; y: number } | null
  boardClientRect(): DOMRect | null
  /** Start an aim from a finger that went down OUTSIDE the canvas — the
   *  tray's ball orbs (dragging up from them is the slingshot motion). Acts
   *  like a press on the unit: let go before moving = the repeat shot. False
   *  when no aim started (not the aim phase, paused, held, cannot fire). */
  beginAimFrom(e: PointerEvent): boolean
  /** The death sequence's culprit in client px (centre, radius); null when no
   *  death plays. DeathOverlay keeps a clear pool round it (playtest run 9). */
  deathFocusClient?(): { x: number; y: number; r: number } | null
}

/** The mounted board — set by GameScene, read by the FTUE overlay and banners.
 *  A shallowRef because the component instance must not be made deep-reactive. */
export const boardApi = shallowRef<BoardApi | null>(null)

/** True from BarrageBoard's `aimStart` until `aimCancel` / `fired`: the coach hand
 *  must get out of the way the moment a finger is on the board. */
export const playerAiming = ref(false)

/** Bumped when a purchase is refused for coins: the wallet (CoinBadge) pulses,
 *  so "not enough" points at what is short, not only at the chip tapped. */
export const walletDenied = ref(0)
export const pulseWallet = (): void => { walletDenied.value++ }

// ─── Coin rain ───────────────────────────────────────────────────────────────
/** A burst of coins flying into the wallet takes this long
 *  (`spawnCoinExplosion`: 600 ms burst + ≤ 300 ms stagger + 500 ms flight). */
export const COIN_RAIN_MS = 1500
/** Coins are raining into the wallet right now (a chest claim, a bounty, a
 *  gift). The upgrade funnel's own coins fly from the wallet to a chip: the two
 *  never share the screen (play-test run 4, a chest's rain over the funnel). */
export const coinRain = ref(false)
let coinRainTimer: ReturnType<typeof setTimeout> | null = null
export const noteCoinRain = (ms = COIN_RAIN_MS): void => {
  coinRain.value = true
  if (coinRainTimer !== null) clearTimeout(coinRainTimer)
  coinRainTimer = setTimeout(() => {
    coinRainTimer = null
    coinRain.value = false
  }, ms)
}

// ─── Recall (skip) button ────────────────────────────────────────────────────
/** Seconds a volley runs before the skip button appears — the moment the
 *  engine's own fast-forward starts (CONTRACT §1): a volley that is still
 *  quick needs no escape hatch. */
export const RECALL_AFTER_S = 2

/**
 * Whether the recall (skip) button shows. Play-test: a button that popped up
 * at every volley read as "confirm the shot" — players dragged, then tapped
 * it, and cut every volley short. So it waits until a volley is actually
 * long, and never shows while the first-session FTUE runs (its turns must
 * resolve on their own: every one of them is the lesson).
 */
export const recallVisible = (phase: Phase, volleySeconds: number, ftueActive: boolean): boolean =>
  phase === 'volley' && !ftueActive && volleySeconds >= RECALL_AFTER_S

// ─── Upgrade chips ───────────────────────────────────────────────────────────
/** What each chip's rune border — and the funnel's arrows — spell (ornament in
 *  Elder Futhark, never read, so not user-facing copy). */
export const UPGRADE_INSCRIPTION: Readonly<Record<UpgradeId, string>> = {
  damage: 'ball damage', capacity: 'tray capacity', speed: 'launch speed', luck: 'pickup luck', bounty: 'coin bounty'
}

/** The quiet gold glow of an affordable chip: every chip the player can buy
 *  right now EXCEPT the one glowing chip (which says it louder) — and none at
 *  all beside the FTUE's free offer, which must be the only thing lit. */
export const readyGlow = (c: { affordable: boolean; maxed: boolean; glow: boolean; free: boolean; freeOffer: boolean }): boolean =>
  c.affordable && !c.maxed && !c.glow && !c.free && !c.freeOffer

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

export type UpgradeValueKind = 'mult' | 'count' | 'percent'

/** Tempo (`speed`) shows its DAMAGE multiplier: the part that keeps growing
 *  (its ball speed tops out at level 10 — economy's `ballSpeedAt`). */
export const upgradeValueKind = (id: UpgradeId): UpgradeValueKind =>
  id === 'damage' || id === 'bounty' || id === 'speed' ? 'mult'
    : id === 'capacity' ? 'count'
      : 'percent'

/**
 * The number part of an upgrade value, already in the unit its i18n message
 * expects. STATE hands raw effect numbers (`UpgradeView.value`): luck as a
 * 0..1 fraction — but tolerated as an already-converted percentage too, so a
 * STATE-side change of unit can't print "0%".
 */
export const upgradeValueNumber = (id: UpgradeId, v: number): string => {
  switch (upgradeValueKind(id)) {
    case 'mult': return fmtMult(v)
    case 'count': return String(Math.round(v))
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
