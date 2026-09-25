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

/** Tempo (the Launch Speed track, "Schusstempo" / "Tempo") is uncapped: its
 *  ball speed and launch interval stop improving at `SPEED_LEVELS`, its
 *  damage multiplier (`ECONOMY.tempoDamage`) keeps compounding. */
export const upgradeMaxLevel = (id: UpgradeId): number | null => {
  switch (id) {
    case 'capacity': return CAPACITY_TABLE.length - 1
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
  /** Kill coins: base × growth^(row−1) up to `coinLateRow`… */
  coinBase: 2,
  coinGrowth: 1.05,
  /** …then × `coinLateGrowth` per row past it (see `killCoins`). Late-game
   *  pass: at a flat 1.05 a Ball Damage level (×2.4 a level) took ~18 rows of
   *  income to afford while row HP grew ×1.12 a row, so from row ~40 every
   *  purchase fell further behind and only lucky combos cleared a board. Past
   *  row 40 kill coins now grow with the monsters' HP (`HP_CURVE.deep`), so a
   *  purchase stays a few turns of income away. */
  coinLateRow: 40,
  coinLateGrowth: 1.1,
  /** Damage × per Tempo level (compounding, uncapped) — on top of its speed
   *  (late-game pass: Tempo was speed only and stopped at level 10). */
  tempoDamage: 1.12
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

/** damage/speed/bounty: multiplier (speed: Tempo's DAMAGE multiplier — the
 *  number its chip shows; its ball speed is `ballSpeedAt`) · capacity: balls ·
 *  luck: 0..1 */
export const upgradeValue = (id: UpgradeId, level: number): number => {
  const l = clampLevel(id, level)
  switch (id) {
    case 'damage': return Math.pow(1.25, l)
    case 'capacity': return CAPACITY_TABLE[l]!
    case 'speed': return Math.pow(ECONOMY.tempoDamage, l)
    case 'luck': return (0.5 * l) / LUCK_LEVELS
    case 'bounty': return Math.pow(1.2, l)
  }
}

/** Launch speed (cells/s) at Tempo level `speedLevel`: 15 → 26 over the first
 *  `SPEED_LEVELS` levels, flat after (CONTRACT §6). */
export const ballSpeedAt = (speedLevel: number): number =>
  15 + (11 * Math.min(SPEED_LEVELS, clampLevel('speed', speedLevel))) / SPEED_LEVELS

/** Seconds between balls leaving the launcher (rides the Tempo track, flat
 *  past `SPEED_LEVELS`). */
export const launchIntervalAt = (speedLevel: number): number =>
  0.085 - (0.04 * Math.min(SPEED_LEVELS, clampLevel('speed', speedLevel))) / SPEED_LEVELS

/** Ball Damage × Tempo's damage: every ball's damage multiplier. */
export const configFromUpgrades = (levels: UpgradeLevels): TunedConfig => ({
  damageMult: upgradeValue('damage', levels.damage) * upgradeValue('speed', levels.speed),
  trayCapacity: upgradeValue('capacity', levels.capacity),
  ballSpeed: ballSpeedAt(levels.speed),
  launchInterval: launchIntervalAt(levels.speed),
  pickupLuck: upgradeValue('luck', levels.luck),
  coinMult: upgradeValue('bounty', levels.bounty)
})

/** Daily Barrage runs on one fixed mid-game kit so every player's board and
 *  power are identical — only the aim differs. */
export const DAILY_CONFIG: TunedConfig = Object.freeze({
  // Ball Damage 4 alone: the kit's end rows were tuned before Tempo hit harder.
  damageMult: upgradeValue('damage', 4),
  trayCapacity: upgradeValue('capacity', 5),
  ballSpeed: ballSpeedAt(5),
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

// ─── The glowing chip (CONTRACT §0.3) ────────────────────────────────────────
/** The tracks that make the volley stronger. Listed Damage first: a price tie
 *  between them glows Damage. Tempo hits harder too (`tempoDamage`) but is
 *  left out: its levels are the smaller step, and glowing it for a rare buyer
 *  cost the sim's low buyer the row-30 boss (by the 2nd try 38 → 23 of 48). */
export const POWER_TRACKS: readonly UpgradeId[] = ['damage', 'capacity']

/**
 * The one upgrade that glows for a player owning `levels` with `coins` in the
 * wallet: the cheaper affordable POWER track (Ball Damage or Tray Capacity;
 * tie → Damage); only when neither is affordable, the cheapest affordable other
 * track (tie → the one listed first in `UPGRADE_IDS`); null when nothing is
 * affordable. Maxed tracks never glow. Playtest run 4: after the first Damage
 * the cheapest chip was Launch Speed (16, no power), testers bought what
 * glowed, and by minute three monsters had outgrown every tester's damage.
 * The one rule for the shop (`useBarrageUpgrades`) and the sim's buyers.
 */
export const glowTrack = (levels: UpgradeLevels, coins: number): UpgradeId | null => {
  const wallet = Number.isNaN(coins) ? 0 : coins
  const cheapest = (ids: readonly UpgradeId[]): UpgradeId | null => {
    let best: UpgradeId | null = null
    let bestCost = Number.POSITIVE_INFINITY
    for (const id of ids) {
      // upgradeCost is Infinity once maxed: a maxed track never qualifies.
      const cost = upgradeCost(id, levels[id] ?? 0)
      if (Number.isFinite(cost) && cost <= wallet && cost < bestCost) { best = id; bestCost = cost }
    }
    return best
  }
  return cheapest(POWER_TRACKS) ?? cheapest(UPGRADE_IDS.filter(id => !POWER_TRACKS.includes(id)))
}

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
  const late = Math.max(0, r - ECONOMY.coinLateRow)
  const growth = Math.pow(ECONOMY.coinGrowth, r - 1 - late) * Math.pow(ECONOMY.coinLateGrowth, late)
  return Math.max(1, Math.round(ECONOMY.coinBase * growth * base * (corrupted ? 3 : 1)))
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

// ─── Boss mercy (config.bossHpMult) ──────────────────────────────────────────
/**
 * Adaptive difficulty: losing to a boss and then meeting it again at full HP
 * does nothing for a player who has not upgraded well enough. Every checkpoint
 * restart after a breach with that boss on the board takes `perDeath` off its
 * HP, down to `floor` — 75% after one death, 50% from the second on. A kill
 * moves the checkpoint and the next boss is back at full HP. Mutable only so
 * the sim can sweep it.
 */
export const BOSS_MERCY = { perDeath: 0.25, floor: 0.5 }

/** `config.bossHpMult` after `deaths` restarts against the same boss. 1 → floor. */
export const bossHpMultForDeaths = (deaths: number): number => {
  const d = Math.max(0, Math.floor(Number.isFinite(deaths) ? deaths : 0))
  return Math.max(BOSS_MERCY.floor, Math.round((1 - BOSS_MERCY.perDeath * d) * 1000) / 1000)
}

// ─── Combo coins ─────────────────────────────────────────────────────────────
/**
 * The volley's combo pays (fun pass after playtest run 6: lucky and cool
 * combos must be REWARDED). A combo is a BALL that keeps hitting far longer
 * than a normal shot — trapped above the rows, a long bank chain: every hit a
 * ball scores past `freeHits` in one launch pays `perHit` slime kills at this
 * row (× Coin Bounty), summed over the volley and capped at `capKills`. Per
 * ball, so neither a big late tray (many ordinary balls) nor a small one
 * (few balls with the board to themselves) is paid for ordinary shots; a
 * jackpot pays about one good volley's kills again. Mutable only so the sim
 * can sweep it.
 */
export const COMBO_COINS = { freeHits: 12, perHit: 0.5, capKills: 4 }

/** Slime kills' worth a volley pays for its balls' hit counts. */
export const comboKills = (balls: readonly { hits: number }[]): number => {
  if (!(COMBO_COINS.perHit > 0)) return 0
  let extra = 0
  for (let i = 0; i < balls.length; i++) {
    const h = balls[i]!.hits - COMBO_COINS.freeHits
    if (h > 0) extra += h
  }
  return Math.min(COMBO_COINS.capKills, extra * COMBO_COINS.perHit)
}

/** Combo coins (before Coin Bounty) that volley pays at `row`. */
export const comboCoins = (row: number, balls: readonly { hits: number }[]): number =>
  comboKills(balls) * killCoins(row, 'slime', false)

// ─── Savior boost (hidden) ───────────────────────────────────────────────────
/**
 * Hidden adaptive difficulty: the closer a boss stands to breaching, the
 * harder the player's balls hit — up to `max` more (+200%: ×3) on the last
 * volley before it breaches, +50% on the one before, nothing earlier (`volleys`
 * is the window, `curve` shapes the fade; > 1 keeps it small until the very
 * end). Sim (48 seeds × 220 turns, off → on): boss kills landed in the very
 * last volley human 120 → 178, random 195 → 247; row-30 boss first try human
 * 39 → 45 / 48, row-20 boss first try humanlow 38 → 46 / 48; a boss still wins
 * against a player far behind (noup row-20 boss by the 2nd try 5 → 9 / 48). Never shown or
 * taught: a boss that was about to win now tends to fall in the last volley or
 * two — a near-death win instead of a restart. Endless only (the Daily is a
 * fixed-kit sprint). The engine reads it at `fire()` from the board as the
 * player aims, so it is deterministic. Mutable only so the sim can sweep it.
 */
export const SAVIOR = { max: 2, volleys: 2, curve: 2 }

/** The hidden damage bonus (0..`SAVIOR.max`; damage × (1 + it)) for a volley
 *  fired while a boss is `volleysLeft` volleys from breaching — 1: this is the
 *  last volley before its march breaches. */
export const saviorBoost = (volleysLeft: number): number => {
  if (!Number.isFinite(volleysLeft) || SAVIOR.volleys <= 0) return 0
  const t = (SAVIOR.volleys + 1 - Math.max(1, Math.floor(volleysLeft))) / SAVIOR.volleys
  return t <= 0 ? 0 : SAVIOR.max * Math.pow(Math.min(1, t), SAVIOR.curve)
}
