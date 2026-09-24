/**
 * Barrage economy — the balance numbers. ENGINE owns them because the bot sim
 * (scripts/barrage-sim.mjs) tunes them; STATE builds the upgrade UI on top.
 * Signatures are binding (see the comment block in types.ts).
 */
import type { EngineConfig, MonsterKind, UpgradeId, UpgradeLevels } from './types'
import { hashString } from './rng'

type TunedConfig = Pick<EngineConfig, 'damageMult' | 'trayCapacity' | 'ballSpeed' | 'launchInterval' | 'pickupLuck' | 'coinMult'>

export const UPGRADE_IDS: UpgradeId[] = ['damage', 'capacity', 'speed', 'luck', 'bounty']

/** CONTRACT §6 — level 0 is the starting tray. */
export const CAPACITY_TABLE: readonly number[] = [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40]
const SPEED_LEVELS = 10
const LUCK_LEVELS = 10

export const upgradeMaxLevel = (id: UpgradeId): number | null => {
  switch (id) {
    case 'capacity': return CAPACITY_TABLE.length - 1
    case 'speed': return SPEED_LEVELS
    case 'luck': return LUCK_LEVELS
    default: return null
  }
}

/**
 * Balance table (tuned by scripts/barrage-sim.mjs). Mutable only so the sim
 * can sweep it in-process — the game never writes to it.
 *
 * Level-0 prices sit at about one to two turns of row-1..10 income, so even a
 * random aimer buys its first upgrade the turn after the FTUE's free one and
 * then one every ~2–3 turns for the first three minutes. Growth then has to
 * far outrun the 1.05/row coin curve: Coin Bounty feeds back into every
 * track, and with MIW-like 1.4–1.6 growth the loop compounded (an early sim
 * pass reached damage level 77 by turn 200).
 */
export const ECONOMY = {
  // Capacity is the cheap, slow-growing track on purpose: the concept's early
  // hook is volleys getting visibly bigger (3, 4, 6, 8…) right after the FTUE.
  // Its base stays above turn-1..2 income so nobody out-buys the turn-3 merge.
  costBase: { damage: 12, capacity: 10, speed: 16, luck: 20, bounty: 30 } as Record<UpgradeId, number>,
  costGrowth: { damage: 2.4, capacity: 1.65, speed: 2.0, luck: 2.1, bounty: 2.7 } as Record<UpgradeId, number>,
  /** Kill coins: base × growth^(row−1). */
  coinBase: 2,
  coinGrowth: 1.05
}

/** Rounds to 2 significant digits past 100 so prices read cleanly (1,400 not 1,387). */
const nice = (v: number): number => {
  if (v < 100) return Math.max(1, Math.round(v))
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1)
  return Math.round(v / mag) * mag
}

/** Price to go level → level + 1. Infinity once maxed. */
export const upgradeCost = (id: UpgradeId, level: number): number => {
  const max = upgradeMaxLevel(id)
  const l = Math.max(0, Math.floor(level))
  if (max !== null && l >= max) return Number.POSITIVE_INFINITY
  return nice(ECONOMY.costBase[id] * Math.pow(ECONOMY.costGrowth[id], l))
}

const clampLevel = (id: UpgradeId, level: number): number => {
  const max = upgradeMaxLevel(id)
  const l = Math.max(0, Math.floor(level || 0))
  return max === null ? l : Math.min(max, l)
}

/** damage/bounty: multiplier · capacity: balls · speed: cells/s · luck: 0..1 */
export const upgradeValue = (id: UpgradeId, level: number): number => {
  const l = clampLevel(id, level)
  switch (id) {
    case 'damage': return Math.pow(1.25, l)
    case 'capacity': return CAPACITY_TABLE[l]!
    case 'speed': return 15 + (11 * l) / SPEED_LEVELS
    case 'luck': return (0.5 * l) / LUCK_LEVELS
    case 'bounty': return Math.pow(1.2, l)
  }
}

/** Seconds between balls leaving the launcher (rides the Launch Speed track). */
export const launchIntervalAt = (speedLevel: number): number =>
  0.085 - (0.04 * clampLevel('speed', speedLevel)) / SPEED_LEVELS

export const configFromUpgrades = (levels: UpgradeLevels): TunedConfig => ({
  damageMult: upgradeValue('damage', levels.damage),
  trayCapacity: upgradeValue('capacity', levels.capacity),
  ballSpeed: upgradeValue('speed', levels.speed),
  launchInterval: launchIntervalAt(levels.speed),
  pickupLuck: upgradeValue('luck', levels.luck),
  coinMult: upgradeValue('bounty', levels.bounty)
})

/** Daily Barrage runs on one fixed mid-game kit so every player's board and
 *  power are identical — only the aim differs. */
export const DAILY_CONFIG: TunedConfig = Object.freeze({
  damageMult: upgradeValue('damage', 4),
  trayCapacity: upgradeValue('capacity', 5),
  ballSpeed: upgradeValue('speed', 5),
  launchInterval: launchIntervalAt(5),
  pickupLuck: upgradeValue('luck', 3),
  coinMult: 1
})

const ZERO_LEVELS: UpgradeLevels = { damage: 0, capacity: 0, speed: 0, luck: 0, bounty: 0 }

export const defaultConfig = (overrides?: Partial<EngineConfig>): EngineConfig => ({
  mode: 'endless',
  seed: 1,
  ...configFromUpgrades(ZERO_LEVELS),
  ftue: false,
  ...overrides
})

// ─── Coins ───────────────────────────────────────────────────────────────────
const KIND_COINS: Record<MonsterKind, number> = {
  slime: 1, goblin: 1.2, caterpillar: 1.6, ogre: 2, dryad: 1.4, centaur: 1.4,
  imp: 1.2, treant: 2.2, carbuncle: 1.8, cyclops: 1.6, boss: 0
}

/** Coins for one kill, before coinMult. Bosses pay through `bossBounty` (the
 *  boss chest), not per kill. */
export const killCoins = (row: number, kind: MonsterKind, corrupted: boolean): number => {
  const base = KIND_COINS[kind]
  if (base <= 0) return 0
  const r = Math.max(1, row)
  return Math.max(1, Math.round(ECONOMY.coinBase * Math.pow(ECONOMY.coinGrowth, r - 1) * base * (corrupted ? 3 : 1)))
}

/** Boss chest at 1× (before coinMult) ≈ 25 kills of that row. */
export const bossBounty = (row: number): number => 25 * killCoins(row, 'slime', false)

/** A ball the full tray had to spill: worth what it took to build (2^(tier−1) T1 balls). */
export const overflowCoins = (row: number, tier: number): number =>
  killCoins(row, 'slime', false) * Math.pow(2, Math.max(0, tier - 1))

/** Flying chest ≈ 8 kills' worth. */
export const chestCoins = (row: number): number => 8 * killCoins(row, 'slime', false)

/** Coin bubble on the board ≈ 3 kills' worth. */
export const coinPickupCoins = (row: number): number => 3 * killCoins(row, 'slime', false)

export const dailySeed = (dateYmd: string): number => hashString(`eb-daily:${dateYmd}`)

// ─── Safety net by purchases (config.assist) ─────────────────────────────────
/**
 * Playtest run 3: the safety net used to switch off at the 2nd paid upgrade —
 * monsters jumped ~25% right when the player got stronger. It now steps down
 * in small bites: full while fewer than `fullBelow` paid levels are owned,
 * then `perLevel` less per further paid level (each step is a few % of HP,
 * far less than any purchase adds). Mutable only so the sim can sweep it.
 */
export const ASSIST_PAID = { fullBelow: 2, perLevel: 0.25 }

/** `config.assist` for a player owning `paid` PAID upgrade levels (the FTUE's
 *  free Tray Capacity does not count). 1 → 0. */
export const assistForPaidLevels = (paid: number): number => {
  const p = Math.max(0, Math.floor(Number.isFinite(paid) ? paid : 0))
  const over = p - ASSIST_PAID.fullBelow + 1
  if (over <= 0) return 1
  return Math.max(0, Math.round((1 - ASSIST_PAID.perLevel * over) * 1000) / 1000)
}
