/**
 * Battle catalogue — stat formulas and archetype tables for the auto-battler.
 *
 * FIGHTERS are the 10 merge-grid tiers (see `ingredients.ts` for their look).
 * Stats roughly double per tier so every merge is a felt power spike; each
 * tier carries the signature ability listed in implementation-plan.md §4.2.
 *
 * ENEMIES are five walker archetypes plus the every-5th-wave boss. Scaling is
 * exponential-ish so the ladder never ends and the player must keep merging.
 *
 * All coordinates used by the engine are in normalized arena units:
 * x 0..100 (gate → spawn), y 0..100 (depth band).
 */

export type FighterAbility =
  | 'none'      // t1  — just fast
  | 'burn'      // t2  — DoT on hit
  | 'knockback' // t3  — ranged, shoves the target back
  | 'heal'      // t4  — hits heal the weakest ally
  | 'splash'    // t5  — AoE explosion on hit
  | 'poison'    // t6  — stacking DoT
  | 'chain'     // t7  — chain lightning
  | 'frost'     // t8  — slow on hit + periodic freeze nova
  | 'midas'     // t9  — bonus gold on hit, high crit
  | 'blackhole' // t10 — periodic mass pull + crunch

export interface FighterDef {
  tier: number
  /** Base damage per hit before upgrades/fever. */
  atk: number
  hp: number
  /** Seconds between attacks. */
  attackInterval: number
  /** Attack reach in arena units; > 14 makes the unit ranged. */
  range: number
  /** Walk speed, arena units / second. */
  speed: number
  ability: FighterAbility
  /** Render size multiplier (1 = standard slot). */
  scale: number
}

const F_ATK = (t: number): number => Math.round(6 * Math.pow(2.05, t - 1))
const F_HP = (t: number): number => Math.round(34 * Math.pow(2.0, t - 1))

const fighterBase: Omit<FighterDef, 'tier' | 'atk' | 'hp'> = {
  attackInterval: 1.1, range: 9, speed: 16, ability: 'none', scale: 1
}

export const FIGHTER_DEFS: FighterDef[] = [
  { ...fighterBase, tier: 1, atk: F_ATK(1), hp: F_HP(1), attackInterval: 0.55, speed: 20, ability: 'none' },
  { ...fighterBase, tier: 2, atk: F_ATK(2), hp: F_HP(2), ability: 'burn' },
  { ...fighterBase, tier: 3, atk: F_ATK(3), hp: F_HP(3), range: 34, attackInterval: 1.35, speed: 13, ability: 'knockback' },
  { ...fighterBase, tier: 4, atk: F_ATK(4), hp: Math.round(F_HP(4) * 1.15), ability: 'heal' },
  { ...fighterBase, tier: 5, atk: F_ATK(5), hp: F_HP(5), attackInterval: 1.25, ability: 'splash' },
  { ...fighterBase, tier: 6, atk: Math.round(F_ATK(6) * 0.85), hp: F_HP(6), attackInterval: 0.9, ability: 'poison' },
  { ...fighterBase, tier: 7, atk: F_ATK(7), hp: Math.round(F_HP(7) * 0.9), range: 38, attackInterval: 1.4, speed: 12, ability: 'chain' },
  { ...fighterBase, tier: 8, atk: F_ATK(8), hp: F_HP(8), range: 32, attackInterval: 1.3, speed: 12, ability: 'frost' },
  { ...fighterBase, tier: 9, atk: F_ATK(9), hp: F_HP(9), attackInterval: 1.0, ability: 'midas' },
  { ...fighterBase, tier: 10, atk: F_ATK(10), hp: Math.round(F_HP(10) * 1.3), attackInterval: 1.5, speed: 10, ability: 'blackhole', scale: 1.35 }
]

export const getFighterDef = (tier: number): FighterDef =>
  FIGHTER_DEFS[Math.max(0, Math.min(FIGHTER_DEFS.length - 1, tier - 1))]!

// ─── Enemies ─────────────────────────────────────────────────────────────────

export type EnemyKind = 'slime' | 'runner' | 'brute' | 'spitter' | 'warlock' | 'boss'

export interface EnemyDef {
  kind: EnemyKind
  /** Multipliers on the wave-scaled baseline. */
  hpMult: number
  atkMult: number
  speed: number
  range: number
  attackInterval: number
  /** Gold bounty multiplier. */
  bountyMult: number
  scale: number
  /** Warlock only: heal pulse fraction of baseline hp. */
  healPulse?: number
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  slime: { kind: 'slime', hpMult: 1, atkMult: 1, speed: 8.5, range: 7, attackInterval: 1.1, bountyMult: 1, scale: 1 },
  runner: { kind: 'runner', hpMult: 0.55, atkMult: 0.8, speed: 17, range: 6, attackInterval: 0.8, bountyMult: 0.8, scale: 0.85 },
  brute: { kind: 'brute', hpMult: 3.1, atkMult: 2.2, speed: 5.5, range: 8, attackInterval: 1.6, bountyMult: 2.6, scale: 1.35 },
  spitter: { kind: 'spitter', hpMult: 0.85, atkMult: 1.15, speed: 8, range: 30, attackInterval: 1.7, bountyMult: 1.5, scale: 0.95 },
  warlock: { kind: 'warlock', hpMult: 1.3, atkMult: 0.7, speed: 6.5, range: 9, attackInterval: 1.5, bountyMult: 3, scale: 1.05, healPulse: 0.5 },
  boss: { kind: 'boss', hpMult: 20, atkMult: 4.5, speed: 4.2, range: 10, attackInterval: 1.8, bountyMult: 22, scale: 2.3 }
}

/** Wave-scaled baseline enemy HP / ATK / bounty. Tuned so tier ≈ wave/3 keeps up. */
export const waveHp = (wave: number): number =>
  Math.round(26 * Math.pow(1.16, wave - 1) * (1 + wave / 22))
export const waveAtk = (wave: number): number =>
  Math.round(5 * Math.pow(1.13, wave - 1) * (1 + wave / 30))
export const waveBounty = (wave: number): number =>
  Math.round(6 * Math.pow(1.09, wave - 1))
/** Flat gold bonus paid when the wave is cleared. */
export const waveClearBonus = (wave: number): number =>
  Math.round(30 * Math.pow(1.11, wave - 1) + wave * 6)

export const isBossWave = (wave: number): boolean => wave % 5 === 0

/** Boss display names cycle with a "+N" suffix once the list wraps. */
const BOSS_NAMES = ['GLORP THE DEVOURER', 'KING SLUDGEFIST', 'MAWZILLA', 'THE GATE-EATER', 'GRUMBLOR PRIME']
export const bossName = (wave: number): string => {
  const idx = Math.floor(wave / 5) - 1
  const cycle = Math.floor(idx / BOSS_NAMES.length)
  const name = BOSS_NAMES[idx % BOSS_NAMES.length]!
  return cycle > 0 ? `${name} +${cycle}` : name
}

export interface WaveSpawn {
  kind: EnemyKind
  /** Seconds after wave start. */
  at: number
}

/** Compose a wave's spawn schedule. Deterministic-ish in shape, random jitter
 *  in timing so waves don't feel copy-pasted. */
export const composeWave = (wave: number): WaveSpawn[] => {
  const out: WaveSpawn[] = []
  const push = (kind: EnemyKind, at: number): void => { out.push({ kind, at }) }
  const jitter = (): number => Math.random() * 0.7

  if (isBossWave(wave)) {
    // Boss + a light escort so the field isn't empty.
    push('boss', 1.2)
    const escorts = Math.min(6, 2 + Math.floor(wave / 8))
    for (let i = 0; i < escorts; i++) push(i % 2 ? 'runner' : 'slime', 3 + i * 2.2 + jitter())
    return out
  }

  const count = Math.min(22, 4 + Math.floor(wave * 1.25))
  let t = 0.8
  for (let i = 0; i < count; i++) {
    let kind: EnemyKind = 'slime'
    const r = Math.random()
    if (wave >= 3 && r < 0.22) kind = 'runner'
    if (wave >= 5 && r >= 0.22 && r < 0.36) kind = 'spitter'
    if (wave >= 7 && r >= 0.36 && r < 0.46) kind = 'brute'
    if (wave >= 9 && r >= 0.46 && r < 0.54) kind = 'warlock'
    push(kind, t)
    t += (kind === 'brute' ? 2.2 : 1.15) + jitter()
    // Mid-wave breather every ~7 spawns to create attack "pulses".
    if (i > 0 && i % 7 === 0) t += 2.5
  }
  return out
}
