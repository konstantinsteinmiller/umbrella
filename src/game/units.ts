/**
 * Battle catalogue — stat formulas and archetype tables for the auto-battler.
 *
 * FIGHTERS are the 11 merge-grid tiers (see `ingredients.ts` for their look).
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
  | 'none'      // t1  — fast ranged fire-spitter, no rider effect
  | 'burn'      // t2  — ranged; lingering DoT on hit (frostbite flavour)
  | 'knockback' // t3  — ranged, shoves the target back
  | 'heal'      // t4  — hits heal the weakest ally
  | 'splash'    // t5  — AoE explosion on hit
  | 'poison'    // t6  — stacking DoT
  | 'chain'     // t7  — chain lightning
  | 'frost'     // t8  — slow on hit + periodic freeze nova
  | 'midas'     // t9  — bonus gold on hit, high crit
  | 'eruption'  // t11 — molten AoE splash + burn on impact

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
  { ...fighterBase, tier: 1, atk: F_ATK(1), hp: F_HP(1), attackInterval: 0.55, range: 24, speed: 20, ability: 'none' },
  { ...fighterBase, tier: 2, atk: F_ATK(2), hp: F_HP(2), range: 30, speed: 14, ability: 'burn' },
  { ...fighterBase, tier: 3, atk: F_ATK(3), hp: F_HP(3), range: 34, attackInterval: 1.35, speed: 13, ability: 'knockback' },
  { ...fighterBase, tier: 4, atk: F_ATK(4), hp: Math.round(F_HP(4) * 1.15), range: 28, ability: 'heal' },
  { ...fighterBase, tier: 5, atk: F_ATK(5), hp: F_HP(5), attackInterval: 1.25, ability: 'splash' },
  { ...fighterBase, tier: 6, atk: Math.round(F_ATK(6) * 0.85), hp: F_HP(6), attackInterval: 0.9, ability: 'poison' },
  { ...fighterBase, tier: 7, atk: F_ATK(7), hp: Math.round(F_HP(7) * 0.9), range: 38, attackInterval: 1.4, speed: 12, ability: 'chain' },
  { ...fighterBase, tier: 8, atk: F_ATK(8), hp: F_HP(8), range: 32, attackInterval: 1.3, speed: 12, ability: 'frost' },
  { ...fighterBase, tier: 9, atk: F_ATK(9), hp: F_HP(9), attackInterval: 1.0, ability: 'midas' },
  { ...fighterBase, tier: 10, atk: F_ATK(10), hp: Math.round(F_HP(10) * 1.3), range: 30, attackInterval: 1.5, speed: 10, ability: 'none', scale: 1.35 },
  { ...fighterBase, tier: 11, atk: F_ATK(11), hp: Math.round(F_HP(11) * 1.4), attackInterval: 1.3, range: 10, speed: 11, ability: 'eruption', scale: 1.4 }
]

// Tiers 12-20 have authored art (fighter-12..20) but live off the extrapolation
// below (kept out of FIGHTER_DEFS so their stats stay formula-driven). MELEE by
// default (tiers 12, 14, 18, 20); the entries below make the ranged ones fire —
// their projectile/impact element comes from getIngredient (see HIGH_TIER_ELEMENTS):
//   13 → shadow (like t8) · 15 → cosmic (like t7) · 16 → wind (like t2)
//   17 → shadow (like t8) · 19 → cosmic (like t7)
const HIGH_TIER_DEFS: Record<number, Partial<FighterDef>> = {
  13: { range: 32, attackInterval: 1.3, ability: 'frost' },
  15: { range: 38, attackInterval: 1.4, ability: 'chain' },
  16: { range: 30, attackInterval: 1.2, ability: 'burn' },
  17: { range: 32, attackInterval: 1.3, ability: 'frost' },
  19: { range: 38, attackInterval: 1.4, ability: 'chain' }
}

// Highest tier the Unit Codex lists: 1-11 are authored in FIGHTER_DEFS, 12-15
// extrapolate their stats via getFighterDef but carry authored art + localized
// names (`battle.codex.names.t12..t15`). Tiers past this still merge/extrapolate
// in-game; they're just beyond the illustrated bestiary.
export const CODEX_MAX_TIER = 15

export const getFighterDef = (tier: number): FighterDef => {
  if (tier <= FIGHTER_DEFS.length) return FIGHTER_DEFS[Math.max(0, tier - 1)]!
  // Beyond the authored tiers (merging is uncapped): keep the top tier's shape
  // but climb ATK/HP off the formula, so higher merges are actually stronger.
  const top = FIGHTER_DEFS[FIGHTER_DEFS.length - 1]!
  const base: FighterDef = { ...top, tier, atk: F_ATK(tier), hp: Math.round(F_HP(tier) * 1.4) }
  return { ...base, ...HIGH_TIER_DEFS[tier] }
}

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
  slime: { kind: 'slime', hpMult: 1, atkMult: 1, speed: 8.5, range: 7, attackInterval: 1.1, bountyMult: 1, scale: 0.8 },
  runner: { kind: 'runner', hpMult: 0.55, atkMult: 0.8, speed: 17, range: 6, attackInterval: 0.8, bountyMult: 0.8, scale: 0.85 },
  brute: { kind: 'brute', hpMult: 3.1, atkMult: 2.2, speed: 5.5, range: 8, attackInterval: 1.6, bountyMult: 2.6, scale: 1.35 },
  spitter: { kind: 'spitter', hpMult: 0.85, atkMult: 1.15, speed: 8, range: 30, attackInterval: 1.7, bountyMult: 1.5, scale: 0.95 },
  warlock: { kind: 'warlock', hpMult: 1.3, atkMult: 0.7, speed: 6.5, range: 9, attackInterval: 1.5, bountyMult: 3, scale: 1.05, healPulse: 0.5 },
  boss: { kind: 'boss', hpMult: 20, atkMult: 4.5, speed: 4.2, range: 10, attackInterval: 1.8, bountyMult: 22, scale: 2.3 }
}

// High-wave softening: a merge-grid army's tier grows only LOGARITHMICALLY with
// playtime (each +1 tier needs 2× the fuel), while a raw exponential enemy curve
// grows without bound — so past a point the ladder becomes impossible no matter
// the upgrades. Past SOFT_WAVE the *effective* wave grows as a power curve, so
// enemy stats decelerate to match the player's plateau. Validated by simulation
// to keep waves ≤~160 beatable (challenging, ad-assisted near the top) instead of
// walling in the mid-60s. Waves ≤ SOFT_WAVE are unchanged.
const SOFT_WAVE = 45
const softWave = (wave: number): number =>
  wave <= SOFT_WAVE ? wave : SOFT_WAVE + Math.pow(wave - SOFT_WAVE, 0.85)
/** Wave-scaled baseline enemy HP / ATK / bounty. Waves ≤ SOFT_WAVE are the
 *  original curve; only the late game is softened. */
export const waveHp = (wave: number): number => {
  const w = softWave(wave)
  return Math.round(26 * Math.pow(1.16, w - 1) * (1 + w / 22))
}
export const waveAtk = (wave: number): number => {
  const w = softWave(wave)
  return Math.round(5 * Math.pow(1.13, w - 1) * (1 + w / 30))
}
export const waveBounty = (wave: number): number =>
  Math.round(6 * Math.pow(1.09, wave - 1))
/** Flat gold bonus paid when the wave is cleared. */
export const waveClearBonus = (wave: number): number =>
  Math.round(30 * Math.pow(1.11, wave - 1) + wave * 6)

export const isBossWave = (wave: number): boolean => wave % 5 === 0

/** Waves that introduce a new enemy archetype — drives the "New enemy at
 *  wave N!" HUD teasers (retention-roadmap #4). */
export const ARCHETYPE_UNLOCK_WAVES: Partial<Record<EnemyKind, number>> = {
  runner: 3, spitter: 5, brute: 7, warlock: 9
}

/** Next wave (> `wave`) that introduces a new archetype, or null. */
export const nextArchetypeUnlock = (wave: number): number | null => {
  const upcoming = Object.values(ARCHETYPE_UNLOCK_WAVES)
    .filter((w): w is number => typeof w === 'number' && w > wave)
  return upcoming.length ? Math.min(...upcoming) : null
}

// ─── Wave mutators (retention-roadmap #13) ───────────────────────────────────
// From wave 12+, roughly every 4th non-boss wave rolls a mutator. The roll is
// a pure hash of the wave number, so the countdown overlay can telegraph the
// UPCOMING wave's mutator and the engine will roll the identical result.
export type WaveMutator = 'goldRush' | 'frostMarch' | 'horde' | 'elite'
const MUTATOR_POOL: WaveMutator[] = ['goldRush', 'frostMarch', 'horde', 'elite']

export const rollMutator = (wave: number): WaveMutator | null => {
  if (wave < 12 || isBossWave(wave)) return null
  const h = (wave * 2654435761) >>> 0 // Knuth multiplicative hash
  if (h % 4 !== 0) return null
  return MUTATOR_POOL[(h >>> 8) % MUTATOR_POOL.length]!
}

// Boss roster size — the display names live in i18n (`battle.bossNames.b0..b4`),
// translated per locale; the roster cycles with a "+N" suffix once it wraps.
const BOSS_NAME_COUNT = 5
/** Boss identity for a wave: the localization key (`b0`..`b4`) and the
 *  roster-wrap `cycle` (0 on the first pass; the view appends " +N" when > 0).
 *  Keeps display strings out of the engine so the name localizes with the UI. */
export const bossName = (wave: number): { key: string; cycle: number } => {
  const idx = Math.max(0, Math.floor(wave / 5) - 1)
  return { key: `b${idx % BOSS_NAME_COUNT}`, cycle: Math.floor(idx / BOSS_NAME_COUNT) }
}

// Boss sprite per boss wave (5,10,15,20,25,30…). One authored sprite each up to
// wave 30; beyond that the list cycles (reused with a darkness tint in the view).
const BOSS_ART_KEYS = ['boss-slime-tower', 'boss-orc', 'boss-fire-dragon', 'boss-troll', 'boss-worm', 'boss-silver-dragon']
const bossIndex = (wave: number): number => Math.max(0, Math.floor(wave / 5) - 1)
/** Art-override key for the boss on this wave. */
export const bossArtKey = (wave: number): string => BOSS_ART_KEYS[bossIndex(wave) % BOSS_ART_KEYS.length]!
/** True once we've run out of authored bosses and are reusing an earlier one. */
export const bossIsReused = (wave: number): boolean => bossIndex(wave) >= BOSS_ART_KEYS.length

export interface WaveSpawn {
  kind: EnemyKind
  /** Seconds after wave start. */
  at: number
  /** Elite mutator: one glowing mini-boss with boosted stats. */
  elite?: boolean
  /** Spawn portal index (0 top-right, 1 centre-right, 2 bottom-right); assigned
   *  by the engine when it groups spawns into portal subwaves. */
  portal?: number
}

/** Compose a wave's spawn schedule. Deterministic-ish in shape, random jitter
 *  in timing so waves don't feel copy-pasted. */
export const composeWave = (wave: number): WaveSpawn[] => {
  const out: WaveSpawn[] = []
  const push = (kind: EnemyKind, at: number, elite = false): void => { out.push({ kind, at, elite }) }
  const jitter = (): number => Math.random() * 0.7

  if (isBossWave(wave)) {
    // Boss + a light escort so the field isn't empty.
    push('boss', 1.2)
    const escorts = Math.min(6, 2 + Math.floor(wave / 8))
    for (let i = 0; i < escorts; i++) push(i % 2 ? 'runner' : 'slime', 3 + i * 2.2 + jitter())
    return out
  }

  // Hand-tuned opener waves (retention-roadmap #2): wave 1 is winnable with
  // two T1 fighters but losable when idle; wave 3 delivers the guaranteed
  // first Runner leak scare; wave 5 (boss branch above) is the first event.
  if (wave === 1) {
    push('slime', 1.2); push('slime', 4.4); push('slime', 8.2)
    return out
  }
  if (wave === 2) {
    push('slime', 1.0); push('slime', 2.6); push('slime', 4.2)
    push('slime', 7.4); push('slime', 8.8)
    return out
  }
  if (wave === 3) {
    // Slimes lull, then a paired Runner burst races the guard line.
    push('slime', 1.0); push('slime', 3.2)
    push('runner', 5.0); push('runner', 5.5)
    push('slime', 7.6); push('slime', 9.4); push('runner', 11.5)
    return out
  }
  if (wave === 4) {
    push('slime', 0.8); push('slime', 2.0); push('runner', 3.4)
    push('slime', 5.2); push('slime', 6.4); push('runner', 8.2)
    push('slime', 9.6); push('slime', 10.8)
    return out
  }

  const mutator = rollMutator(wave)
  const count = Math.min(mutator === 'horde' ? 44 : 22, (4 + Math.floor(wave * 1.25)) * (mutator === 'horde' ? 2 : 1))
  let t = 0.8
  for (let i = 0; i < count; i++) {
    let kind: EnemyKind = 'slime'
    const r = Math.random()
    if (wave >= 3 && r < 0.22) kind = 'runner'
    if (wave >= 5 && r >= 0.22 && r < 0.36) kind = 'spitter'
    if (wave >= 7 && r >= 0.36 && r < 0.46) kind = 'brute'
    if (wave >= 9 && r >= 0.46 && r < 0.54) kind = 'warlock'
    push(kind, t)
    t += ((kind === 'brute' ? 2.2 : 1.15) + jitter()) * (mutator === 'horde' ? 0.55 : 1)
    // Mid-wave breather every ~7 spawns to create attack "pulses".
    if (i > 0 && i % 7 === 0) t += 2.5
  }
  // Elite mutator: a single glowing mini-boss anchors the middle of the wave.
  if (mutator === 'elite') {
    const mid = out[Math.floor(out.length * 0.6)]
    push('brute', (mid?.at ?? t) + 0.6, true)
  }
  return out
}
