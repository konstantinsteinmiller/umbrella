/**
 * Ball tiers and the tray. Pure functions — the engine owns the state and the
 * events; these only encode the rules so tests can pin them in isolation.
 */
import type { BallAbility } from './types'

/** A merged ball is always strictly better than the pair it ate (2.2 > 2). */
export const TIER_GROWTH = 2.2
export const CRIT_CHANCE = 0.05
export const CRIT_MULT = 2

export const ballDamage = (tier: number, damageMult: number): number =>
  damageMult * Math.pow(TIER_GROWTH, Math.max(1, tier) - 1)

const LADDER: readonly BallAbility[] = [
  'burn', 'knockback', 'pierce', 'freeze', 'splash', 'crush', 'chain', 'poison', 'midas'
]

export const ballAbility = (tier: number): BallAbility =>
  tier >= 10 ? 'eruption' : LADDER[Math.max(1, Math.floor(tier)) - 1]!

// Proc tuning. Kept here so balance tweaks and tests read one table.
export const BURN_FRACTION = 0.35    // of the hit, per tick
export const BURN_TURNS = 2
export const SPLASH_FRACTION = 0.5
export const CRUSH_MULT = 3
export const CHAIN_FRACTION = 0.6
export const CHAIN_JUMPS = 2
export const CHAIN_RANGE = 2.6
export const POISON_FRACTION = 0.2   // per stack, per tick
export const POISON_MAX_STACKS = 10
export const MIDAS_FRACTION = 0.3    // of a kill's coins, per hit
/** Eruption fires on every Nth hit of the same ball — a 3×3 blast each hit
 *  would wash the board in particles and hide every number. */
export const ERUPTION_EVERY = 4
export const eruptionFraction = (tier: number): number => 0.6 + 0.15 * Math.max(0, tier - 10)

export interface TraySink {
  merge(fromTier: number, toTier: number): void
  overflow(tier: number): void
}

/** Inserts keeping the tray sorted DESCENDING. */
export const insertDesc = (tray: number[], tier: number): void => {
  let i = tray.length
  while (i > 0 && tray[i - 1]! < tier) i--
  tray.splice(i, 0, tier)
}

/**
 * CONTRACT §3 add rule: push; while over capacity merge the LOWEST tier that
 * has a pair, else convert the lowest ball to coins. Never merges below
 * capacity — the merge is the overflow's reward, not a free action.
 */
export const addToTray = (tray: number[], tier: number, capacity: number, sink?: TraySink): void => {
  insertDesc(tray, Math.max(1, Math.floor(tier)))
  const cap = Math.max(1, Math.floor(capacity))
  while (tray.length > cap) {
    // Sorted descending, so the first equal neighbours found from the tail are
    // the lowest pair.
    let pair = -1
    for (let i = tray.length - 1; i > 0; i--) {
      if (tray[i] === tray[i - 1]) { pair = i; break }
    }
    if (pair >= 0) {
      const t = tray[pair]!
      tray.splice(pair - 1, 2)
      insertDesc(tray, t + 1)
      sink?.merge(t, t + 1)
    } else {
      const t = tray.pop()!
      sink?.overflow(t)
    }
  }
}

/**
 * Soul Pact: copy the best ball. Below capacity the copy simply joins the tray;
 * at (or above) capacity the copy merges straight into its twin — the one case
 * where a merge skips the overflow queue, which is the whole point of the skill.
 * Returns 'add' or 'merge' so the engine can emit the matching event.
 */
export const pactTray = (tray: number[], capacity: number, sink?: TraySink): 'add' | 'merge' => {
  const best = tray[0] ?? 1
  if (tray.length < Math.max(1, Math.floor(capacity))) {
    insertDesc(tray, best)
    return 'add'
  }
  tray.shift()
  insertDesc(tray, best + 1)
  sink?.merge(best, best + 1)
  return 'merge'
}

/** Total tray damage per launch (all balls, one hit each) — bot/sim heuristics. */
export const trayPower = (tray: readonly number[], damageMult: number): number => {
  let sum = 0
  for (const t of tray) sum += ballDamage(t, damageMult)
  return sum
}
