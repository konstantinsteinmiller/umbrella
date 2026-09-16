/**
 * useBattle — the auto-battler engine (implementation-plan.md §4/§5).
 *
 * Owns the battlefield simulation: fighters (deployed merge units), enemy
 * waves, projectiles, status effects, the kill-combo / FEVER layer, the
 * Meteor Storm ultimate, the Lab Gate, boss logic, the four battle upgrades,
 * and battle persistence inside the `merge-idle-war_state` blob.
 *
 * Module-level singleton (same pattern as `usePrismGame`): one authoritative
 * battle shared by every component. The arena view calls `startBattle()` /
 * `stopBattle()` around its lifecycle; the engine runs a single RAF with
 * fixed 30 Hz logic steps and a `timescale` for slow-mo drama.
 *
 * Rendering contract (hot path stays out of Vue reactivity):
 *   • `fighters` / `enemies` / `projectiles` are shallowRef arrays — Vue only
 *     patches when entities spawn/die (triggerRef).
 *   • After every logic step the engine invokes the render sink; the arena
 *     writes transforms/HP-bars straight to the DOM.
 *   • Discrete happenings (hits, deaths, meteors, …) are pushed to the event
 *     sink for damage numbers / particles / SFX.
 */

import { ref, shallowRef, computed, triggerRef, watch } from 'vue'
import { getState, setState, flushPersist } from '@/use/useEpicState'
import { saveDataVersion } from '@/use/useSaveStatus'
import useEpicConfig from '@/use/useEpicConfig'
import { isGamePaused } from '@/use/useGamePause'
import { playCountdownInterstitial, tickBreakInterstitial } from '@/use/useBreakInterstitial'
import {
  BATTLE_UPGRADES_KEY, BATTLE_WAVE_KEY, BATTLE_BEST_WAVE_KEY, BATTLE_ARMY_KEY,
  BATTLE_ULT_KEY, PRISM_STATS_KEY, BATTLE_DMG_BUFF_KEY, BATTLE_RUBBER_BAND_KEY,
  BATTLE_COIN_BUFF_KEY,
  BATTLE_HEAL_UNLOCKED_KEY, BATTLE_HEAL_CHARGE_KEY,
  BATTLE_REVIVE_UNLOCKED_KEY, BATTLE_REVIVE_CHARGE_KEY,
  BATTLE_DEFENDER_UNLOCKED_KEY, BATTLE_DEFENDER_CHARGE_KEY,
  BATTLE_WARCRY_UNLOCKED_KEY, BATTLE_WARCRY_CHARGE_KEY,
  BATTLE_LEGION_UNLOCKED_KEY, BATTLE_LEGION_CHARGE_KEY,
  BATTLE_MARK_UNLOCKED_KEY, BATTLE_MARK_CHARGE_KEY,
  BATTLE_PACT_UNLOCKED_KEY, BATTLE_PACT_COOLDOWN_KEY,
  BATTLE_MUTATION_CEILING_KEY, BATTLE_SPELL_CASTS_KEY,
  BATTLE_FIRST_BOSS_COACHED_KEY, PRISM_MAX_TIER_KEY
} from '@/keys'
import {
  getFighterDef, ENEMY_DEFS, composeWave, isBossWave, bossName, bossArtKey, rollMutator,
  waveHp, waveAtk, waveBounty, waveClearBonus,
  type EnemyKind, type WaveSpawn, type FighterAbility, type WaveMutator
} from '@/game/units'
import { getIngredient, type ElementKind } from '@/game/ingredients'
import { notifyTutorial } from '@/use/useTutorial'
import useBattlePass, { CAMPAIGN_XP_SOURCES } from '@/use/useBattlePass'
import { submitBestWave } from '@/platforms/leaderboard'

// ─── Tunables ────────────────────────────────────────────────────────────────
export const ARMY_CAP = 7
const ENEMY_CAP = 24
const PROJECTILE_CAP = 24
const LOGIC_STEP = 1 / 30
const GATE_MAX = 100
// Enemies stop and bash here. Kept clear of the (now ~11%-wide, centred) gate
// image plus a centre-anchored body's half-width, so attackers line up IN FRONT
// of the gate instead of overlapping / flying over it.
const GATE_X = 13
// The gate is vertically centred, so marching enemies funnel into this band
// (GATE_Y ± GATE_BAND) as they approach instead of assaulting the full height.
const GATE_Y = 50
const GATE_BAND = 18
const GUARD_X = 16
const COMBO_WINDOW = 2.5

// Right-edge bound for unit CENTRES (centre-anchored, so a little inside 100):
// knockback never shoves an enemy off-screen past this.
const UNIT_MAX_X = 96

// Gate image right edge in arena-x %, published by the view (it varies with the
// arena aspect — see the `.gate` CSS `min(25cqw, 20cqh)`). Fighters must never
// step ONTO the gate, so they guard at/right of the edge + a body's half-width;
// enemies bash just at the gate face.
let gateEdgeX = 0
export const setGateEdge = (x: number): void => { gateEdgeX = Math.max(0, Math.min(30, x)) }
const FIGHTER_CLEAR = 5
const ENEMY_CLEAR = 4
const fighterGuardX = (): number => Math.max(GUARD_X, gateEdgeX + FIGHTER_CLEAR)
const enemyGateX = (): number => Math.max(GATE_X, gateEdgeX + ENEMY_CLEAR)

// Enemy spawn portals near the right edge: top, centre, bottom. A portal opens
// per SUBWAVE (a burst of spawns ≤ PORTAL_MAX_OPEN apart), pours out its
// monsters, then closes. Bosses always use the centre portal.
const PORTAL_POSITIONS = [{ x: 92, y: 16 }, { x: 92, y: 50 }, { x: 92, y: 84 }] as const
const PORTAL_LEAD = 0.35   // s the portal is open before the first monster emerges
const PORTAL_TAIL = 0.4    // s it lingers open after the last one
const PORTAL_MAX_OPEN = 3  // s a single portal spends spawning its subwave
const SUBWAVE_GAP = 1.2    // s gap between spawns that starts a fresh portal
const FEVER_AT = 10
const FEVER_SECS = 8
const FEVER_ATK_SPEED = 1.6
const ULT_MAX = 100
const ULT_PER_KILL = 6
const ULT_PER_BOSS = 30
const METEOR_COUNT = 7
// Slime-tower boss: births companion slimes from its body (up to 3 alive), each
// scaling up + hopping down over BIRTH_SECS.
const BIRTH_SECS = 0.8
const COMPANION_MAX = 3
const COMPANION_INTERVAL = 5.5 // seconds between companion births
// Wave MUTATION: a 25% chance a fresh (new-territory, non-boss) wave turns into a
// mutation wave, where ~66% of its spawns are enlarged (×1.5) and buffed by a
// random +30…50% of their base stats — a spike of non-linear challenge.
const MUTATION_CHANCE = 0.25
const MUTATION_ENEMY_FRACTION = 0.45
const MUTATION_BUFF_MIN = 0.3
const MUTATION_BUFF_MAX = 0.5
const MUTATION_SCALE = 1.5
const MUTATION_MIN_WAVE = 3 // keep the FTUE (waves 1–2) clean
// Unlockable spells (Heal, Revive Guard). Both charge a flat 1% per monster
// killed (so ~100 kills per cast — deliberately slow, high-impact) and cost
// coins to unlock before they charge at all.
const SPELL_MAX = 100
const SPELL_PER_KILL = 1
const HEAL_UNLOCK_COST = 200_000
const REVIVE_UNLOCK_COST = 200_000
const DEFENDER_UNLOCK_COST = 150_000
const HEAL_FRACTION = 0.25    // Heal restores 25% of each unit's max HP.
const REVIVE_GUARD_SECS = 30  // Revive Guard window length.
const DEFENDER_SECS = 120     // Defender tank duration (2 minutes).
const TANK_DR = 0.2           // The tank takes only 20% of incoming damage.
const TANK_HP_MULT = 2        // …and has double its normal max HP.
const MELEE_RANGE_MAX = 14    // range > 14 ⇒ ranged (see FighterDef).

// ─── Arena skills, slots 5–8 ─────────────────────────────────────────────────
// Balanced as COOLDOWN × STRENGTH: the faster a skill comes back, the smaller
// its effect, so none of them out-values the others per minute of play. The
// yardstick is kills: ~95 per 5-wave boss cycle from wave 15 on.
//
// Warcry of the Legion — the everyday burst. 80 kills (≈ 4 waves) buys 8 s of
// +60% damage and +30% attack speed: 2.08× army DPS for 8 s, ≈ +10% averaged
// over its charge. Worth it by TIMING — pop it on a boss, a horde, an elite.
// The +60% is ADDED to the damage multiplier, so under the 2× ad buff it is
// 2.6×, not 3.2× (two boosts must not compound). Attack speed takes the higher
// of Warcry and FEVER, never both.
const WARCRY_UNLOCK_COST = 300_000
const WARCRY_PER_KILL = 1.25
const WARCRY_SECS = 8
const WARCRY_DMG_BONUS = 0.6
const WARCRY_ATK_SPEED = 1.3
// Legion Call — the comeback. Charges mainly from LOSSES: +20 per fighter that
// falls (5 losses fill it), plus a slow 0.25 per kill so it is never out of
// reach on a clean run (400 kills). Summons 3 spectral warriors one tier below
// your best, at 60% health, for 20 s — a full squad arriving exactly when the
// army is breaking. Spectral warriors are not army: never persisted, never
// counted against ARMY_CAP, and their deaths refill nothing.
const LEGION_UNLOCK_COST = 1_100_000
const LEGION_PER_KILL = 0.25
const LEGION_PER_FALLEN = 20
const LEGION_COUNT = 3
const LEGION_SECS = 20
const LEGION_HP_FRACTION = 0.6
// Executioner's Mark (desktop) — the boss breaker. 100 kills ≈ one per boss
// cycle. For 10 s the boss (else an elite, else the healthiest enemy) takes
// +75% damage from every source and is executed outright below 12% health:
// on a boss that is roughly a quarter to a third off the fight.
const MARK_UNLOCK_COST = 600_000
const MARK_PER_KILL = 1
const MARK_SECS = 10
const MARK_DMG_TAKEN = 1.75
const MARK_EXECUTE_BELOW = 0.12
// Soul Pact (desktop) — the only PERMANENT effect, hence the only one on a
// clock instead of a charge, and the priciest. Your highest-tier fighter gains
// a twin; the strongest fighter of a LOWER tier is consumed to pay for it. Net:
// that slot climbs from the second tier to the first, once every 3 minutes of
// play (paused with the game, like the coin buff).
const PACT_UNLOCK_COST = 1_500_000
export const PACT_COOLDOWN_MS = 180_000
const COUNTDOWN_SECS = 3.5
const OVERRUN_SECS = 2.5
/** Extended overrun pause while the RALLY! rewarded offer is on screen. */
const RALLY_OFFER_SECS = 5
/** Waves lost per wipe when the gate falls and the army is NOT revived — the
 *  recovery valve: a wiped player retreats to easier waves instead of being
 *  walled on the one that killed them (best wave is untouched). */
const OVERRUN_WAVE_SETBACK = 2
/** Floor on the retreat: the player can never be set back more than this many
 *  waves below their BEST wave. Lets them rebuild an army on beatable waves
 *  without grinding all the way from wave 1 back to their highscore. */
const MAX_FALL_FROM_BEST = 10
/** Milestone chest cadence (retention-roadmap #4): every 10th wave. */
export const CHEST_EVERY_WAVES = 10
// War Horns, Vitality, Bounty and the Imp have NO level cap. These are the levels
// their old caps sat at, and where their "deep ranks" begin: prices and effects
// up to here are exactly what they always were; past here the price ramps
// (`DEEP_COST_RAMP`) and the effect compounds (`progressive`, `impCadenceMs`).
// Bounty/Imp's curve is steeper, so a player reaches their seam ~150 waves before
// Attack/Vitality's (wave ~120-145 vs ~280).
export const UPGRADE_DEEP_FROM = 25
export const ATKVIT_DEEP_FROM = 100
/** Tamper bound for a saved level, not a gameplay cap: every price is `Infinity`
 *  well before it (see `DEEP_COST_RAMP`), and it keeps every effect finite. */
const UPGRADE_LEVEL_SANITY = 1_000

// ─── Entities ────────────────────────────────────────────────────────────────
export interface Fighter {
  id: number
  tier: number
  x: number
  y: number
  hp: number
  maxHp: number
  /** Seconds until the next attack is allowed. */
  cooldown: number
  /** Seconds until the periodic ability (nova / black hole) fires. */
  abilityCd: number
  /** Set for one render frame when the unit lunges (melee anim). */
  striking: boolean
  /** Enemy this fighter is currently locked onto (transient; 0 = none).
   *  Sticky so the 1v1 assignment doesn't flip-flop between equal picks. */
  targetId: number
  /** Revive Guard: true while this unit carries a pending revive (shows wings).
   *  Consumed on death — the unit resurrects at full HP and the flag clears. */
  revivePending: boolean
  /** Defender: true while this unit is the promoted tank (shield crest, 2× HP,
   *  takes 20% damage). Reverts when `tankUntil` lapses. */
  isTank: boolean
  /** Engine-time the tank buff expires at (0 ⇒ not a tank). */
  tankUntil: number
  /** Legion Call: a summoned spectral warrior. It fights like any fighter but
   *  is NOT army — never counted toward ARMY_CAP, never persisted, never
   *  mourned (no RALLY! slot, no Legion charge), and never a Defender, Soul
   *  Pact or field-merge target. Dissolves at `expiresAt`. */
  spectral: boolean
  /** Engine-time a spectral warrior dissolves at (0 ⇒ a real fighter). */
  expiresAt: number
}

export interface Enemy {
  id: number
  kind: EnemyKind
  x: number
  y: number
  hp: number
  maxHp: number
  atk: number
  speed: number
  range: number
  attackInterval: number
  bounty: number
  scale: number
  cooldown: number
  abilityCd: number
  /** Engine-time seconds. */
  slowUntil: number
  stunUntil: number
  burnDps: number
  burnUntil: number
  poisonStacks: number
  poisonUntil: number
  /** Knockback compounding: consecutive shoves inside KNOCK_WINDOW stack up. */
  knockStacks: number
  knockUntil: number
  boss: boolean
  /** Elite-mutator mini-boss (glowing aura, boosted stats). */
  elite: boolean
  enraged: boolean
  striking: boolean
  /** Mutation-wave spawn: enlarged (×1.5) + stat-buffed, so it reads as mutated. */
  mutated: boolean
  /** Slime-tower companion spawned FROM the boss (birth animation, then fights). */
  companion: boolean
  /** False while a companion is mid-birth (emerging + hopping down): the engine
   *  holds its movement/attack and the view plays the spawn animation until it
   *  flips true at `bornAt`. Always true for normal (portal) spawns. */
  born: boolean
  /** Engine-time the birth animation ends (0 ⇒ born on spawn). */
  bornAt: number
}

export interface Projectile {
  id: number
  x: number
  y: number
  speed: number
  targetId: number
  /** True → homing on an enemy; false → homing on a fighter. */
  fromFighter: boolean
  dmg: number
  ability: FighterAbility | 'spit'
  sourceTier: number
  color: string
  /** Aim offset from the target's body centre so shots scatter across it. */
  jitterX: number
  jitterY: number
  /** Visual element → picks the projectile sprite + impact splitter VFX. */
  element: ElementKind
}

// ─── Events (view drains these for numbers / particles / SFX) ────────────────
export type BattleEvent =
  | { type: 'number'; x: number; y: number; amount: number; variant: 'dmg' | 'crit' | 'heal' | 'burn' | 'poison' | 'gold' }
  | { type: 'strike'; id: number; x: number; y: number; tier: number; dx: number; dy: number }
  | { type: 'shot'; x: number; y: number; color: string }
  | { type: 'impact'; x: number; y: number; color: string; element?: ElementKind; target: 'enemy' | 'fighter' }
  | { type: 'splash'; x: number; y: number; color: string }
  | { type: 'chain'; points: { x: number; y: number }[] }
  | { type: 'nova'; x: number; y: number }
  | { type: 'death'; x: number; y: number; kind: EnemyKind; bounty: number; boss: boolean; id: number }
  | { type: 'fighterDeath'; x: number; y: number; tier: number; id: number }
  | { type: 'heal'; x: number; y: number; id: number }
  | { type: 'revive'; x: number; y: number; id: number }
  | { type: 'reviveGuard' }
  | { type: 'defender'; x: number; y: number; id: number }
  | { type: 'slimeBirth'; x: number; y: number }
  | { type: 'deploy'; x: number; y: number; tier: number }
  | { type: 'fieldMerge'; x: number; y: number; tier: number }
  | { type: 'gateHit'; amount: number }
  | { type: 'overrun' }
  | { type: 'setback'; wave: number }
  | { type: 'waveStart'; wave: number; boss: boolean; mutator: WaveMutator | null; mutated: boolean }
  | { type: 'waveCleared'; wave: number; bonus: number }
  | { type: 'milestone'; wave: number; gold: number }
  | { type: 'bossKill'; x: number; y: number; bounty: number; first: boolean }
  | { type: 'enrage' }
  | { type: 'combo'; combo: number }
  | { type: 'fever' }
  | { type: 'ultReady' }
  | { type: 'meteor'; x: number; y: number }
  | { type: 'warHeal'; x: number; y: number }
  /** Warcry of the Legion cast — (x, y) is the army's centre, where the roar rings out. */
  | { type: 'warcry'; x: number; y: number }
  /** Legion Call — one portal per summoned spectral warrior. */
  | { type: 'legionCall'; tier: number; points: { x: number; y: number; id: number }[] }
  /** A spectral warrior dissolving (its time ran out, or it was struck down). */
  | { type: 'spectralFade'; x: number; y: number; id: number }
  | { type: 'mark'; x: number; y: number; id: number }
  /** The marked enemy dropped under the execute line and was finished off. */
  | { type: 'execute'; x: number; y: number; id: number; boss: boolean }
  /** Soul Pact — (x, y) is the champion; the twin stands beside it, the
   *  sacrifice at (vx, vy) is already off the field. */
  | { type: 'soulPact'; x: number; y: number; tier: number; twinId: number; victimId: number; vx: number; vy: number; victimTier: number }

type EventSink = (e: BattleEvent) => void
type RenderSink = () => void
let eventSink: EventSink | null = null
let renderSink: RenderSink | null = null
export const setEventSink = (fn: EventSink | null): void => { eventSink = fn }
export const setRenderSink = (fn: RenderSink | null): void => { renderSink = fn }
const emit = (e: BattleEvent): void => { if (eventSink) eventSink(e) }

// ─── Upgrades (battle-owned; bought from the UpgradePanel) ───────────────────
export type BattleUpgradeId = 'attack' | 'vitality' | 'bounty' | 'automation' | 'recruit'
export type BattleUpgrades = Record<BattleUpgradeId, number>

/** Recruits cap. Level N ⇒ the Spawn button's base tier is N+1, so 49 ⇒ T50,
 *  the top of the illustrated bestiary (`CODEX_MAX_TIER`): the Spawn button
 *  never produces a unit without its own look. Extended 15 → 20 for the
 *  deep-wave grind, then 20 → 49 with the elemental tiers 21–50; merges past
 *  T50 still climb and extrapolate their stats as before. */
export const RECRUIT_MAX_LEVEL = 49

/** `deepFrom`: the level the deep-rank price ramp starts at. `max`: `Infinity`
 *  for every upgrade but Recruits. */
export const BATTLE_UPGRADE_DEFS: Record<BattleUpgradeId, { base: number; growth: number; deepFrom: number; max: number }> = {
  attack: { base: 60, growth: 1.33, deepFrom: ATKVIT_DEEP_FROM, max: Infinity },
  vitality: { base: 55, growth: 1.32, deepFrom: ATKVIT_DEEP_FROM, max: Infinity },
  bounty: { base: 80, growth: 1.6, deepFrom: UPGRADE_DEEP_FROM, max: Infinity },
  automation: { base: 130, growth: 1.72, deepFrom: UPGRADE_DEEP_FROM, max: Infinity },
  // Recruits: each level raises the Spawn button's base tier by 1 (T1 → T50).
  // One level ≈ doubles the whole grid's merge throughput (a T2 spawn = two
  // T1 spawns pre-merged) ≈ 4–5 waves of enemy scaling — priced as milestone
  // purchases on the hand-tuned RECRUIT_COSTS ladder below (base/growth/deepFrom
  // here are unused for this id; `upgradeCost` special-cases it).
  recruit: { base: 2000, growth: 1, deepFrom: RECRUIT_MAX_LEVEL, max: RECRUIT_MAX_LEVEL }
}

/**
 * Deep-rank price ramp. Up to `deepFrom` a level costs `base × growth^level`,
 * as it always has. Past it, every price step is 1% steeper than the one
 * before, so the price of the n-th level past the seam carries an extra
 * `1.01^(n(n+1)/2)`: close to exponential at first, and steeper for good.
 *
 * Why a ramp and not the plain curve: the caps were hit because the plain
 * curve is far cheaper than late-game income (Bounty's level 25 is 10M at a
 * wave that pays Qi). Continued unchanged, a veteran's saved coins would buy
 * ~55 Bounty levels on the spot, and in the long run levels would keep pace
 * with the wave economy forever. With the ramp (simulated, 10 waves of income
 * per level): 3.5Qi saved buys +39 Bounty levels (≈2.8× coins) OR +23 War Horns
 * levels (≈1.37× damage); a player on wave 300 sits near War Horns 118 /
 * Bounty 61, on wave 500 near 152 / 84. Always another level worth buying,
 * never a runaway.
 */
const DEEP_COST_RAMP = 1.01

/**
 * An upgrade's effect multiplier: `1 + a·lvl + b·lvl²` up to `seam`, then
 * compounding. Each level past the seam multiplies the effect by the relative
 * step the curve was taking AT the seam, so value and slope both carry over
 * unchanged and a deep level is always worth what the last capped one was:
 * War Horns +1.38%, Vitality +1.4%, Bounty +2.67% per level.
 */
const progressive = (lvl: number, a: number, b: number, seam: number): number => {
  if (lvl <= seam) return 1 + lvl * a + lvl * lvl * b
  const atSeam = 1 + seam * a + seam * seam * b
  const slope = a + 2 * seam * b
  return atSeam * Math.pow(1 + slope / atSeam, lvl - seam)
}

/** Hand-tuned Recruits prices. Levels 1–15 continue a ~×3.3 step so each level
 *  lands as an affordable milestone against the exponential coin income
 *  (bounty/clear-bonus/milestone chests) at the wave you'd be on.
 *
 *  Levels 16–20 (base spawn T17…T21) deliberately steepen to ~×4.2 per level
 *  instead: by then a level is worth far more than earlier ones (it doubles the
 *  grid's merge throughput on top of an already-high base tier) and late-game
 *  income is enormous, so continuing the old ×3.3 would have made the deepest
 *  levels the cheapest part of the curve in real terms. The step keeps each one
 *  a genuine multi-session goal rather than a formality.
 *
 *  Level 1 is 2k, not 5k: T2 spawns are the first big power spike, and at 5k
 *  a first session reached it long after the wave-5 boss wall. */
const RECRUIT_COSTS_AUTHORED = [
  2_000, 20_000, 50_000, 175_000, 500_000, 1_500_000, 7_000_000, 15_000_000, 50_000_000,
  150_000_000, 500_000_000, 1_500_000_000, 5_000_000_000, 15_000_000_000, 50_000_000_000,
  // 16–20
  210_000_000_000, 900_000_000_000, 3_800_000_000_000, 16_000_000_000_000, 70_000_000_000_000
]
/** Levels 21–49 (base spawn T22…T50, the new elemental tiers) continue the
 *  16–20 step unchanged: ×4.25 a level, rounded to two significant figures.
 *  Why the same step still fits: coin income grows ×1.11 a wave, so ×4.25 lands
 *  each level ~14 waves after the last — and past wave 45 the softened enemy
 *  curve roughly doubles its HP in those same ~14 waves, which is what one more
 *  Recruits level (double merge throughput, +1 top tier) buys back. Level 21 is
 *  300T; level 49 is ~1.2×10³² — "Nod"-scale, a genuine end-game horizon. */
const RECRUIT_DEEP_STEP = 4.25
const twoSig = (v: number): number => {
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1)
  return Math.round(v / p) * p
}
const RECRUIT_COSTS = [
  ...RECRUIT_COSTS_AUTHORED,
  ...Array.from({ length: RECRUIT_MAX_LEVEL - RECRUIT_COSTS_AUTHORED.length }, (_, i) =>
    twoSig(RECRUIT_COSTS_AUTHORED[RECRUIT_COSTS_AUTHORED.length - 1]! * Math.pow(RECRUIT_DEEP_STEP, i + 1)))
]

const sanitizeUpgrades = (u: unknown): BattleUpgrades => {
  const o = (u && typeof u === 'object') ? u as Record<string, unknown> : {}
  const clamp = (n: unknown, max: number): number => {
    const v = Math.floor(Number(n))
    return Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0
  }
  return {
    attack: clamp(o.attack, UPGRADE_LEVEL_SANITY),
    vitality: clamp(o.vitality, UPGRADE_LEVEL_SANITY),
    bounty: clamp(o.bounty, UPGRADE_LEVEL_SANITY),
    automation: clamp(o.automation, UPGRADE_LEVEL_SANITY),
    recruit: clamp(o.recruit, RECRUIT_MAX_LEVEL)
  }
}

export const battleUpgrades = ref<BattleUpgrades>(sanitizeUpgrades(getState(BATTLE_UPGRADES_KEY, {})))

// ─── 2× Damage rewarded buff ─────────────────────────────────────────────────
// Watching a rewarded ad doubles all fighter damage for 2 minutes. Persisted
// as an epoch expiry so a reload mid-buff keeps the remaining time (same
// pattern as the Instant Spawn buff in `usePrismGame`).
export const DMG_BUFF_MS = 120_000
const dmgBuffUntil = ref(Number(getState(BATTLE_DMG_BUFF_KEY, 0)) || 0)
/** Buff countdown for the UI, ms. Ticked by the engine; >0 ⇔ buff active. */
export const dmgBuffRemainingMs = ref(Math.max(0, dmgBuffUntil.value - Date.now()))

export const activateDamageBuff = (): void => {
  dmgBuffUntil.value = Date.now() + DMG_BUFF_MS
  dmgBuffRemainingMs.value = DMG_BUFF_MS
  setState(BATTLE_DMG_BUFF_KEY, dmgBuffUntil.value)
}

// ─── 3× Coin income rewarded buff (flying-chest offer) ───────────────────────
// Watching a rewarded ad from a flying chest triples all COMBAT coin income —
// kill bounties, the wave-clear bonus and the milestone-chest bonus, i.e.
// everything that flows through `bountyMult()` — for 10 minutes.
//
// Unlike the 2× damage buff this drains on PLAY time, not wall-clock: the
// remaining ms are decremented in the RAF driver, which sits behind the pause
// gate. So the ten minutes the player was promised are ten minutes of actual
// play — a modal, an ad break or a closed tab can't quietly eat the reward they
// just watched a video for. That's also why the persisted value is
// remaining-time rather than an expiry timestamp.
export const COIN_BUFF_MS = 600_000 // 10 minutes
export const COIN_BUFF_MULT = 3
/** Play-time milliseconds left on the 3× coin buff. >0 ⇔ active. Ticked by the
 *  engine, read by the HUD clock beside the wallet. */
export const coinBuffRemainingMs = ref(Math.max(0, Number(getState(BATTLE_COIN_BUFF_KEY, 0)) || 0))
/** True while coin income is tripled. Gates the flying-chest offer (never
 *  offered on top of a running buff) and shows the wallet-side timer. */
export const isCoinBuffActive = computed(() => coinBuffRemainingMs.value > 0)

/** The buff's contribution to coin income: 3 while active, else 1. Exposed
 *  read-only so the multiplier folded into `bountyMult()` is observable
 *  (HUD copy, tests) without duplicating the condition. */
export const coinBuffMult = computed(() => (isCoinBuffActive.value ? COIN_BUFF_MULT : 1))

/** Grant / refresh the full 10 minutes. Called after the rewarded ad actually
 *  granted (or the coin purchase went through on coin-mode builds). */
export const activateCoinBuff = (): void => {
  coinBuffRemainingMs.value = COIN_BUFF_MS
  setState(BATTLE_COIN_BUFF_KEY, COIN_BUFF_MS)
}

// Persist the countdown at most every 5s of play (and always on expiry) — a
// setState per frame would thrash the save blob for a value that only needs to
// survive a reload with second-level accuracy.
const COIN_BUFF_PERSIST_EVERY_MS = 5_000
let coinBuffPersistDebt = 0

/** Drain the buff by `dtMs` of play time. Called from the RAF driver, so it
 *  only advances while the game is actually running. */
const tickCoinBuff = (dtMs: number): void => {
  if (coinBuffRemainingMs.value <= 0) return
  const next = Math.max(0, coinBuffRemainingMs.value - dtMs)
  coinBuffRemainingMs.value = next
  coinBuffPersistDebt += dtMs
  if (next === 0 || coinBuffPersistDebt >= COIN_BUFF_PERSIST_EVERY_MS) {
    coinBuffPersistDebt = 0
    setState(BATTLE_COIN_BUFF_KEY, Math.round(next))
  }
}

// ─── Rubber-band catch-up ────────────────────────────────────────────────────
// When a wipe drops the player all the way to their best-wave floor (they've
// slid the full MAX_FALL_FROM_BEST waves off their best and keep losing), every
// enemy spawned for the next RUBBER_BAND_MS is RUBBER_BAND_MULT weaker in BOTH
// hp and attack — so the struggling player can rebuild an army on now-beatable
// waves and climb back to their highscore instead of being walled. Persisted as
// an epoch expiry (same pattern as the 2× damage buff) so a reload mid-window
// keeps the remaining time.
export const RUBBER_BAND_MS = 900_000 // 15 minutes
const RUBBER_BAND_MULT = 0.75         // enemies at 75% (−25%) while active
const rubberBandUntil = ref(Number(getState(BATTLE_RUBBER_BAND_KEY, 0)) || 0)
/** True while the −25% enemy catch-up window is live. */
export const rubberBandActive = ref(rubberBandUntil.value > Date.now())

// ─── Deep-wave army boost (rides the same catch-up window) ──────────────────
//
// Past wave ~175 the −25% enemy nerf alone stopped being enough to break a wipe
// loop: the enemy curve is still exponential up there while the army's top tier
// has plateaued, so shaving a quarter off enemy stats only moves the wall by a
// couple of waves (reported from a real run: reached 223, fell to 213, couldn't
// climb back in any reasonable session).
//
// So while the catch-up window is live AND the player is deep enough to be past
// the point where tier growth can keep up, the ARMY gets stronger too:
//
//   • +50% max HP on every fighter (retro-applied to the standing army, and
//     folded into `hpMult()` so newly deployed / merged units get it as well)
//   • incoming damage divided by 1.5 — "50% more defence", i.e. ≈33% less
//     damage taken. Applied at `fighterDamage()`, the single choke point every
//     hit already routes through (the Defender tank's DR lives there too).
//
// Combined with the enemy −25% that is ~3× effective durability against ~0.75×
// incoming pressure for the 15-minute window — enough to actually re-clear the
// waves that were just lost, without touching the base curve that the mid-game
// is tuned around.
const RUBBER_BAND_ARMY_MIN_WAVE = 175
const RUBBER_BAND_ARMY_HP_MULT = 1.5  // +50% fighter max HP
const RUBBER_BAND_ARMY_DEF_MULT = 1.5 // incoming damage ÷1.5 (≈ −33%)

/**
 * True while the deep-wave army half of the catch-up is in effect: the rubber-band
 * window is live AND the player is past `RUBBER_BAND_ARMY_MIN_WAVE`.
 *
 * Public (and a computed, so lazy — `wave` is declared further down) because the
 * boost is otherwise completely invisible: part of why the old catch-up "didn't
 * feel like it worked" is that nothing ever told the player it was running. A HUD
 * indicator can bind straight to this.
 */
export const rubberBandArmyActive = computed(
  () => rubberBandActive.value && wave.value > RUBBER_BAND_ARMY_MIN_WAVE
)

const armyCatchUpActive = (): boolean => rubberBandArmyActive.value

/** Army-HP multiplier from the deep-wave catch-up: 1.5 while it applies. */
const armyCatchUpHpMult = (): number => (armyCatchUpActive() ? RUBBER_BAND_ARMY_HP_MULT : 1)

const activateRubberBand = (): void => {
  rubberBandUntil.value = Date.now() + RUBBER_BAND_MS
  rubberBandActive.value = true
  setState(BATTLE_RUBBER_BAND_KEY, rubberBandUntil.value)
  // Retro-apply the +50% HP to whoever is still standing — same delta-heal the
  // Vitality upgrade uses, so the boost is felt immediately instead of only by
  // units deployed after the wipe.
  refreshArmyMaxHp()
}
/** Enemy-stat multiplier: 0.75 while the catch-up window is live, else 1. */
const rubberBandMult = (): number => (rubberBandUntil.value > Date.now() ? RUBBER_BAND_MULT : 1)

// Attack & Vitality scale PROGRESSIVELY — a quadratic term makes each later level
// worth more than the last (≈2× the effect by level 100), so continued investment
// keeps pace with the enemy curve deep into the run instead of flat-lining. Base
// per-level rate is unchanged, so early-game feel is the same. Past level 100
// they compound instead (see `progressive`).
const atkUpgradeMult = (): number =>
  progressive(battleUpgrades.value.attack, 0.06, 0.0006, ATKVIT_DEEP_FROM)
const dmgBuffMult = (): number => (dmgBuffUntil.value > Date.now() ? 2 : 1)
/** Every hit's damage multiplier: upgrades × (the 2× ad buff + Warcry's +60%).
 *  Warcry ADDS to the buff term rather than multiplying it — see WARCRY_*. */
const atkMult = (): number =>
  atkUpgradeMult() * (dmgBuffMult() + (warcryActive.value ? WARCRY_DMG_BONUS : 0))
/** The same without Warcry — what the challenge valuation reads (see
 *  `playerPower`): an 8-second burst must not buy beefier spawns. */
const sustainedAtkMult = (): number => atkUpgradeMult() * dmgBuffMult()
const vitUpgradeMult = (): number =>
  progressive(battleUpgrades.value.vitality, 0.07, 0.0007, ATKVIT_DEEP_FROM)
const hpMult = (): number => vitUpgradeMult() * armyCatchUpHpMult()

/**
 * Recompute every standing fighter's `maxHp` from the current multipliers and
 * heal by the delta, so a mid-fight buff is felt now rather than only by units
 * deployed afterwards. Used by the Vitality purchase and by the deep-wave
 * catch-up activation — both change `hpMult()` for an army already on the field.
 */
const refreshArmyMaxHp = (): void => {
  for (const f of fighters.value) {
    const newMax = Math.round(getFighterDef(f.tier).hp * hpMult() * (f.isTank ? TANK_HP_MULT : 1) * (f.spectral ? LEGION_HP_FRACTION : 1))
    if (newMax === f.maxHp) continue
    f.hp = Math.min(newMax, f.hp + (newMax - f.maxHp))
    f.maxHp = newMax
  }
  triggerRef(fighters)
}
/**
 * GOLD RUSH wave mutator: kill-bounty multiplier while that wave runs. Lowered
 * from 2× to 1.5× so the rewarded 3× coin buff is clearly the stronger, more
 * desirable boost — a free wave mutator matching two thirds of a watched video
 * made the video feel weak. Exported so the wave banner's label reads the same
 * number the economy uses (no hardcoded "2×" in 21 locale files to drift).
 */
export const GOLD_RUSH_MULT = 1.5

/** The permanent, earned part of coin income: the Bounty upgrade alone. Kept
 *  separate from the temporary boosts so those can be combined by MAX rather
 *  than by product — see `killBoostMult`. +8% a level up to 25 (3×), then
 *  +2.67% compounding per level (see `progressive`). */
const bountyUpgradeMult = (): number =>
  progressive(battleUpgrades.value.bounty, 0.08, 0, UPGRADE_DEEP_FROM)

/** The permanent, upgrade-only part of each multiplier (no buffs, no catch-up).
 *  Read-only, so the deep-rank curve is observable without driving combat. */
export const upgradeEffectMult = (id: 'attack' | 'vitality' | 'bounty'): number =>
  id === 'attack' ? atkUpgradeMult() : id === 'vitality' ? vitUpgradeMult() : bountyUpgradeMult()

/**
 * The temporary KILL-BOUNTY boosts, combined by taking the STRONGEST —
 * deliberately NOT multiplied together:
 *
 *   • GOLD RUSH wave mutator — `GOLD_RUSH_MULT` (1.5×)
 *   • 3× rewarded coin buff  — `COIN_BUFF_MULT`
 *
 * Stacking them multiplicatively made a gold-rush wave under the coin buff pay
 * 4.5×, which both devalues the rewarded buff (its marginal worth depended on
 * whichever wave you happened to be on) and spikes the economy unpredictably.
 * Taking the max means activating the 3× buff always OVERWRITES a running gold
 * rush, and the video is worth the same everywhere.
 *
 * Scope note: GOLD RUSH has always applied to kill bounty ONLY, never to the
 * wave-clear or milestone-chest bonuses — hence this lives at the kill site and
 * not inside `bountyMult()`, which those two use.
 */
const killBoostMult = (): number =>
  Math.max(coinBuffMult.value, mutator.value === 'goldRush' ? GOLD_RUSH_MULT : 1)

// Coin-income multiplier for the NON-kill payouts (wave-clear bonus,
// milestone-chest bonus): earned upgrade × the rewarded coin buff. Gold rush
// never reached these, and still doesn't.
const bountyMult = (): number => bountyUpgradeMult() * coinBuffMult.value
/** Base tier the Spawn button produces (1 + Recruits upgrade level). */
export const recruitTier = computed(() => 1 + battleUpgrades.value.recruit)
/** The strongest ARMY fighter's tier on the field right now — Legion Call's
 *  spectral warriors excluded — or 0 with nobody deployed. */
export const topFieldTier = computed(() => {
  let top = 0
  for (const f of fighters.value) if (!f.spectral && f.tier > top) top = f.tier
  return top
})
/** Tier of a chest's unit reward (the flying chest, the every-10th-wave
 *  milestone chest): ONE BELOW the strongest fighter on the field, so the drop
 *  always matters to the army the player has now — merge it with one more and
 *  that is another of their best — and never below the Spawn button's own
 *  tier. It used to be capped at T11 by a constant from the days T11 was the
 *  top of the ladder, which made every late-game chest unit worthless. */
export const chestUnitTier = computed(() => Math.max(recruitTier.value, topFieldTier.value - 1))
/** The shallow Imp curve bottoms out here (from level ~23). */
const IMP_SHALLOW_FLOOR_MS = 700
/** Past level 25 each Imp level merges 4% faster, with no floor: once the
 *  cadence drops under the engine's 120 ms tick, the engine takes every beat
 *  owed per tick (see `usePrismGame.tick`). */
const IMP_DEEP_STEP = 0.96
/** Imp cadence in ms for `usePrismGame`'s automation loop (0 ⇒ disabled). */
export const impCadenceMs = computed(() => {
  const lvl = battleUpgrades.value.automation
  if (lvl <= 0) return 0
  if (lvl <= UPGRADE_DEEP_FROM) return Math.max(IMP_SHALLOW_FLOOR_MS, 4200 / (1 + lvl * 0.22))
  return IMP_SHALLOW_FLOOR_MS * Math.pow(IMP_DEEP_STEP, lvl - UPGRADE_DEEP_FROM)
})

const { coins: gold, addCoins, spendCoins } = useEpicConfig()

export const upgradeLevel = (id: BattleUpgradeId): number => battleUpgrades.value[id]
export const isUpgradeMaxed = (id: BattleUpgradeId): boolean =>
  battleUpgrades.value[id] >= BATTLE_UPGRADE_DEFS[id].max
export const upgradeCost = (id: BattleUpgradeId): number => {
  if (id === 'recruit') {
    return RECRUIT_COSTS[Math.min(battleUpgrades.value.recruit, RECRUIT_COSTS.length - 1)]!
  }
  const def = BATTLE_UPGRADE_DEFS[id]
  const lvl = battleUpgrades.value[id]
  const past = Math.max(0, lvl - def.deepFrom)
  return Math.max(1, Math.round(
    def.base * Math.pow(def.growth, lvl) * Math.pow(DEEP_COST_RAMP, (past * (past + 1)) / 2)
  ))
}
export const canBuyUpgrade = (id: BattleUpgradeId): boolean =>
  !isUpgradeMaxed(id) && gold.value >= upgradeCost(id)
export const buyUpgrade = (id: BattleUpgradeId): boolean => {
  if (isUpgradeMaxed(id)) return false
  if (!spendCoins(upgradeCost(id))) return false
  battleUpgrades.value = { ...battleUpgrades.value, [id]: battleUpgrades.value[id] + 1 }
  setState(BATTLE_UPGRADES_KEY, battleUpgrades.value)
  // Vitality retro-applies to the standing army (heal by the delta).
  if (id === 'vitality') refreshArmyMaxHp()
  flushPersist()
  return true
}

// ─── Lifetime battle stats (merged into prism_stats) ─────────────────────────
export interface BattleStats {
  kills: number; bossKills: number; waves: number
  merges: number; spawns: number; fieldMerges: number
  /** Highest kill combo ever reached (watermark, not a counter). */
  bestCombo: number
}
const defaultStats = (): BattleStats => ({ kills: 0, bossKills: 0, waves: 0, merges: 0, spawns: 0, fieldMerges: 0, bestCombo: 0 })
export const stats = ref<BattleStats>({ ...defaultStats(), ...(getState<Partial<BattleStats>>(PRISM_STATS_KEY, {}) ?? {}) })
const persistStats = (): void => setState(PRISM_STATS_KEY, stats.value)

// War Campaign XP (retention-roadmap #18): stat bumps ARE the XP ticks, so
// every subsystem that already calls bumpStat feeds the pass for free. The
// per-event values live in CAMPAIGN_XP_SOURCES (useBattlePass) — one source
// of truth shared with the modal's "how to earn" explainer.
const { awardXp: awardCampaignXp } = useBattlePass()
const CAMPAIGN_XP: Partial<Record<keyof BattleStats, number>> = {
  kills: CAMPAIGN_XP_SOURCES.kill,
  merges: CAMPAIGN_XP_SOURCES.merge,
  fieldMerges: CAMPAIGN_XP_SOURCES.fieldMerge,
  waves: CAMPAIGN_XP_SOURCES.wave,
  bossKills: CAMPAIGN_XP_SOURCES.boss
}

export const bumpStat = (key: keyof BattleStats, n = 1): void => {
  stats.value = { ...stats.value, [key]: stats.value[key] + n }
  persistStats()
  const xp = CAMPAIGN_XP[key]
  if (xp) awardCampaignXp(xp * n)
}

// ─── Reactive battle state (HUD-facing) ──────────────────────────────────────
const readWave = (key: string, fallback: number): number => {
  const v = Math.floor(Number(getState(key, fallback)))
  return Number.isFinite(v) && v >= 1 ? v : fallback
}

export const wave = ref(readWave(BATTLE_WAVE_KEY, 1))
export const bestWave = ref(readWave(BATTLE_BEST_WAVE_KEY, 1))
export type WavePhase = 'countdown' | 'fighting' | 'cleared' | 'overrun'
export const wavePhase = ref<WavePhase>('countdown')
/** The currently-open enemy spawn portal (null = closed). Drives the arena. */
export const activePortal = ref<{ pos: number; x: number; y: number } | null>(null)
export const countdown = ref(COUNTDOWN_SECS)
export const gateHp = ref(GATE_MAX)
export const gateMax = GATE_MAX
export const combo = ref(0)
export const feverActive = ref(false)
export const ultCharge = ref(Math.max(0, Math.min(ULT_MAX, Number(getState(BATTLE_ULT_KEY, 0)) || 0)))
export const ultMax = ULT_MAX

// ─── Unlockable spells (Heal, Revive Guard) ──────────────────────────────────
const clampCharge = (v: unknown): number => Math.max(0, Math.min(SPELL_MAX, Number(v) || 0))
export const spellMax = SPELL_MAX
export const healUnlockCost = HEAL_UNLOCK_COST
export const reviveUnlockCost = REVIVE_UNLOCK_COST
export const defenderUnlockCost = DEFENDER_UNLOCK_COST
export const healUnlocked = ref(getState<boolean>(BATTLE_HEAL_UNLOCKED_KEY, false) === true)
export const reviveUnlocked = ref(getState<boolean>(BATTLE_REVIVE_UNLOCKED_KEY, false) === true)
export const defenderUnlocked = ref(getState<boolean>(BATTLE_DEFENDER_UNLOCKED_KEY, false) === true)
export const healCharge = ref(clampCharge(getState(BATTLE_HEAL_CHARGE_KEY, 0)))
export const reviveCharge = ref(clampCharge(getState(BATTLE_REVIVE_CHARGE_KEY, 0)))
export const defenderCharge = ref(clampCharge(getState(BATTLE_DEFENDER_CHARGE_KEY, 0)))
// Per-spell cast counts — the explanation toast only shows for the first
// SPELL_TOAST_CASTS casts of each spell; after that the player knows the effect.
const SPELL_TOAST_CASTS = 5
const spellCasts = ref<Record<string, number>>({ ...getState<Record<string, number>>(BATTLE_SPELL_CASTS_KEY, {}) })
/** Record a spell cast; returns true if its explanation toast should still show
 *  (i.e. it's one of the first SPELL_TOAST_CASTS casts of this spell). */
export const noteSpellCast = (id: string): boolean => {
  const n = spellCasts.value[id] ?? 0
  spellCasts.value = { ...spellCasts.value, [id]: n + 1 }
  setState(BATTLE_SPELL_CASTS_KEY, spellCasts.value)
  return n < SPELL_TOAST_CASTS
}
/** True while the 30s Revive Guard window is live (units carry wings). */
export const reviveGuardActive = ref(false)
/** Remaining Revive Guard time in ms, for the button's countdown. */
export const reviveGuardRemainingMs = ref(0)
let reviveGuardUntil = 0

// ─── Arena skills, slots 5–8 (state) ─────────────────────────────────────────
export const warcryUnlockCost = WARCRY_UNLOCK_COST
export const legionUnlockCost = LEGION_UNLOCK_COST
export const markUnlockCost = MARK_UNLOCK_COST
export const pactUnlockCost = PACT_UNLOCK_COST
export const warcryUnlocked = ref(getState<boolean>(BATTLE_WARCRY_UNLOCKED_KEY, false) === true)
export const legionUnlocked = ref(getState<boolean>(BATTLE_LEGION_UNLOCKED_KEY, false) === true)
export const markUnlocked = ref(getState<boolean>(BATTLE_MARK_UNLOCKED_KEY, false) === true)
export const pactUnlocked = ref(getState<boolean>(BATTLE_PACT_UNLOCKED_KEY, false) === true)
export const warcryCharge = ref(clampCharge(getState(BATTLE_WARCRY_CHARGE_KEY, 0)))
export const legionCharge = ref(clampCharge(getState(BATTLE_LEGION_CHARGE_KEY, 0)))
export const markCharge = ref(clampCharge(getState(BATTLE_MARK_CHARGE_KEY, 0)))
const clampPactCd = (v: unknown): number => Math.max(0, Math.min(PACT_COOLDOWN_MS, Number(v) || 0))
/** Play-time milliseconds until Soul Pact can be cast again (0 ⇔ off cooldown). */
export const pactCooldownMs = ref(clampPactCd(getState(BATTLE_PACT_COOLDOWN_KEY, 0)))
/** True while Warcry's 8 s window runs (drives damage, attack speed, the auras). */
export const warcryActive = ref(false)
export const warcryRemainingMs = ref(0)
let warcryUntil = 0
/** Remaining life of the summoned legion in ms (0 ⇔ none on the field). */
export const legionRemainingMs = ref(0)
let legionUntil = 0
/** Id of the enemy under Executioner's Mark (0 ⇔ none). */
export const markedId = ref(0)
export const markRemainingMs = ref(0)
let markUntil = 0

export const boss = ref<{ nameKey: string; cycle: number; hp: number; maxHp: number; enraged: boolean } | null>(null)
export const timescale = ref(1)
/** Active wave mutator (retention-roadmap #13); null on plain/boss waves. */
export const mutator = ref<WaveMutator | null>(null)
/** True while the current wave is a MUTATION wave (enlarged, buffed spawns). */
export const waveMutated = ref(false)
/** Highest wave that has already resolved its mutation roll (persisted) — keeps a
 *  wave from re-mutating on a rubber-band re-climb until the player pushes past it. */
let mutationCeiling = Math.max(0, Math.floor(getState(BATTLE_MUTATION_CEILING_KEY, 0)))
/** RALLY! rewarded revive offer is on screen (retention-roadmap #8). */
export const rallyOffer = ref(false)

export const fighters = shallowRef<Fighter[]>([])
export const enemies = shallowRef<Enemy[]>([])
export const projectiles = shallowRef<Projectile[]>([])
/** The ARMY: every fielded fighter except Legion Call's spectral warriors. */
const armySize = (): number => {
  let n = 0
  for (const f of fighters.value) if (!f.spectral) n++
  return n
}
export const armyCount = computed(() => armySize())
export const armyFull = computed(() => armySize() >= ARMY_CAP)

let idSeq = 0
let engineNow = 0 // engine-time seconds (scaled by timescale)
let comboTimer = 0
let feverUntil = 0
let slowmoRealLeft = 0
let schedule: WaveSpawn[] = []
let portalWindows: { portal: number; openAt: number; closeAt: number }[] = []
let portalIdx = 0
let waveElapsed = 0
let phaseTimer = 0
/** Tiers of fighters that fell during the current wave (RALLY! buffer). */
let deadThisWave: number[] = []
/** True once the current overrun's RALLY! offer was redeemed (no setback). */
let rallyClaimed = false
let pendingMeteors: { at: number }[] = [] // impact point resolved at impact time

const persistBattle = (): void => {
  setState(BATTLE_WAVE_KEY, wave.value)
  setState(BATTLE_BEST_WAVE_KEY, bestWave.value)
  setState(BATTLE_ULT_KEY, Math.round(ultCharge.value))
  setState(BATTLE_HEAL_CHARGE_KEY, Math.round(healCharge.value))
  setState(BATTLE_REVIVE_CHARGE_KEY, Math.round(reviveCharge.value))
  setState(BATTLE_DEFENDER_CHARGE_KEY, Math.round(defenderCharge.value))
  setState(BATTLE_WARCRY_CHARGE_KEY, Math.round(warcryCharge.value))
  setState(BATTLE_LEGION_CHARGE_KEY, Math.round(legionCharge.value))
  setState(BATTLE_MARK_CHARGE_KEY, Math.round(markCharge.value))
}
// Spectral warriors are summoned, not owned: they never reach the save.
const persistArmy = (): void => setState(BATTLE_ARMY_KEY, fighters.value.filter((f) => !f.spectral).map((f) => f.tier))

// ─── Spawning / deploying ────────────────────────────────────────────────────
const guardY = (idx: number): number => 18 + ((idx * 37) % 68)

const makeFighter = (tier: number, x: number, y: number, spectralUntil = 0): Fighter => {
  const def = getFighterDef(tier)
  const spectral = spectralUntil > 0
  const maxHp = Math.round(def.hp * hpMult() * (spectral ? LEGION_HP_FRACTION : 1))
  return {
    id: ++idSeq, tier,
    x: Math.max(4, Math.min(60, x)), y: Math.max(8, Math.min(92, y)),
    hp: maxHp, maxHp, cooldown: Math.random() * 0.4, abilityCd: 3, striking: false,
    targetId: 0,
    // A unit that joins while Revive Guard is live is covered by it too — a
    // summoned one is not (it has no death to undo).
    revivePending: !spectral && reviveGuardActive.value,
    isTank: false, tankUntil: 0,
    spectral, expiresAt: spectralUntil
  }
}

/** Deploy a merged unit onto the battlefield. Returns false when the army is
 *  at cap (the caller then bounces the drop).
 *
 *  `ignoreCap` lets a GRANTED unit — a battle-pass tier reward with nowhere
 *  else to land — join an already-full army rather than evaporate. Player
 *  drops never pass it: the cap is the whole reason a drop onto a full army
 *  bounces into a field merge. An over-cap fighter is real in every way while
 *  it lives; it is only the army RESTORE that trims back to ARMY_CAP, so the
 *  save can never grow without bound. */
export const deployFighter = (tier: number, xNorm?: number, yNorm?: number, ignoreCap = false): boolean => {
  if (!ignoreCap && armySize() >= ARMY_CAP) return false
  const f = makeFighter(tier, xNorm ?? GUARD_X, yNorm ?? guardY(armySize()))
  fighters.value = [...fighters.value, f]
  triggerRef(fighters)
  persistArmy()
  emit({ type: 'deploy', x: f.x, y: f.y, tier })
  notifyTutorial('deploy')
  return true
}

/** Field merge: feed a grid unit of the same tier into a deployed fighter →
 *  tier+1, full heal. Returns false if tiers mismatch or already max tier. */
export const fieldMerge = (fighterId: number, tier: number): boolean => {
  const f = fighters.value.find((x) => x.id === fighterId)
  // No tier cap — two same-tier fighters always rank up (art/stats extrapolate
  // past the authored tiers via getFighterDef / getIngredient). A spectral
  // warrior is not a merge target: it dissolves in seconds, taking the unit
  // fed into it along.
  if (!f || f.spectral || f.tier !== tier) return false
  const def = getFighterDef(tier + 1)
  f.tier = tier + 1
  f.maxHp = Math.round(def.hp * hpMult())
  f.hp = f.maxHp
  triggerRef(fighters)
  persistArmy()
  bumpStat('fieldMerges')
  emit({ type: 'fieldMerge', x: f.x, y: f.y, tier: f.tier })
  notifyTutorial('fieldMerge')
  return true
}

/** Hit-test a deployed fighter near a normalized arena point (for drop-merge).
 *  The visual body is anchored ABOVE the logical (x, y) foot point, so the
 *  test compares against a slightly raised centre with a generous radius —
 *  a finger drop on any part of the unit should land the merge.
 *
 *  Pass the dropped unit's `tier` and a same-tier fighter anywhere in the radius
 *  wins over a closer fighter of another tier: melee clumps, and "nearest of
 *  any tier" turned a drop aimed at the right fighter into a fresh deploy. */
export const fighterAt = (xNorm: number, yNorm: number, radius = 13, tier?: number): Fighter | null => {
  let best: Fighter | null = null
  let bestD = radius
  let match: Fighter | null = null
  let matchD = radius
  for (const f of fighters.value) {
    if (f.spectral) continue // never a drop-merge target (see fieldMerge)
    const d = Math.hypot(f.x - xNorm, f.y - 5 - yNorm)
    if (d < bestD) { bestD = d; best = f }
    if (tier !== undefined && f.tier === tier && d < matchD) { matchD = d; match = f }
  }
  return match ?? best
}

/** Group a wave's flat spawn list into portal subwaves: consecutive spawns
 *  closer than SUBWAVE_GAP (and within PORTAL_MAX_OPEN of the group start) share
 *  one portal; each new group hops to a different portal (bosses → centre). Tags
 *  every spawn with its portal index and records the open/close windows. */
const buildPortals = (spawns: WaveSpawn[]): void => {
  portalWindows = []
  portalIdx = 0
  let prevAt = -Infinity
  let groupStart = 0
  let lastPortal = -1
  for (const s of spawns) {
    // A spawn that already names its portal keeps it, opening a window of its
    // own when that differs from the open one (the DEV video seam authors its
    // arrivals); a composed wave never names one.
    const startNew = portalWindows.length === 0 || s.at - prevAt > SUBWAVE_GAP || s.at - groupStart > PORTAL_MAX_OPEN
      || (s.portal !== undefined && s.portal !== lastPortal)
    if (startNew) {
      const portal = s.portal ?? (s.kind === 'boss' ? 1 : (lastPortal + 1 + ((Math.random() * 2) | 0)) % 3)
      lastPortal = portal
      groupStart = s.at
      portalWindows.push({ portal, openAt: Math.max(0, s.at - PORTAL_LEAD), closeAt: s.at + PORTAL_TAIL })
    }
    const w = portalWindows[portalWindows.length - 1]!
    s.portal = w.portal
    w.closeAt = s.at + PORTAL_TAIL
    prevAt = s.at
  }
}

const spawnEnemy = (kind: EnemyKind, elite = false, portal = 1): void => {
  if (enemies.value.length >= ENEMY_CAP) { schedule.unshift({ kind, at: waveElapsed + 0.8, elite, portal }); return }
  const def = ENEMY_DEFS[kind]
  const w = wave.value
  // Mutators: Horde halves per-enemy HP (2× count comes from the composer);
  // the Elite champion is a hugely buffed single spawn with a fat bounty.
  const hordeHp = mutator.value === 'horde' ? 0.5 : 1
  // Challenge rubber-band: overpowered armies face beefier spawns. HP takes
  // the full multiplier, ATK a gentler share (a burstier gate assault would
  // punish the base, not the army), and the bounty pays out PART of the extra
  // toughness so the adjustment reads as reward, not punishment.
  const c = challengeMult.value
  const cAtk = 1 + (c - 1) * 0.6
  const cBounty = 1 + (c - 1) * 0.5
  const rb = rubberBandMult()
  const maxHp = Math.round(waveHp(w) * def.hpMult * hordeHp * (elite ? 7 : 1) * c * rb)
  const e: Enemy = {
    id: ++idSeq, kind,
    // Emerge from the assigned portal near the right edge (on-screen).
    x: (PORTAL_POSITIONS[portal] ?? PORTAL_POSITIONS[1]).x - Math.random() * 2,
    y: kind === 'boss'
      ? (PORTAL_POSITIONS[portal] ?? PORTAL_POSITIONS[1]).y
      : Math.max(8, Math.min(90, (PORTAL_POSITIONS[portal] ?? PORTAL_POSITIONS[1]).y + (Math.random() - 0.5) * 12)),
    hp: maxHp, maxHp,
    atk: Math.round(waveAtk(w) * def.atkMult * (elite ? 1.6 : 1) * cAtk * rb),
    speed: def.speed * (1 + Math.min(0.5, w / 60)) * (elite ? 0.85 : 1),
    range: def.range, attackInterval: def.attackInterval,
    bounty: Math.round(waveBounty(w) * def.bountyMult * (elite ? 9 : 1) * cBounty),
    scale: def.scale * (elite ? 1.5 : 1),
    cooldown: 0, abilityCd: 3,
    slowUntil: 0, stunUntil: 0,
    burnDps: 0, burnUntil: 0, poisonStacks: 0, poisonUntil: 0,
    knockStacks: 0, knockUntil: 0,
    boss: kind === 'boss', elite, enraged: false, striking: false,
    mutated: false, companion: false, born: true, bornAt: 0
  }
  // Mutation wave: ~66% of non-boss spawns mutate — 50% bigger + a random
  // +30…50% to their core stats (HP/ATK), paying out extra bounty to match.
  if (waveMutated.value && !e.boss && Math.random() < MUTATION_ENEMY_FRACTION) {
    const buff = 1 + MUTATION_BUFF_MIN + Math.random() * (MUTATION_BUFF_MAX - MUTATION_BUFF_MIN)
    e.mutated = true
    e.scale *= MUTATION_SCALE
    e.maxHp = Math.round(e.maxHp * buff)
    e.hp = e.maxHp
    e.atk = Math.round(e.atk * buff)
    e.bounty = Math.round(e.bounty * buff)
  }
  enemies.value = [...enemies.value, e]
  triggerRef(enemies)
  if (e.boss) {
    const bn = bossName(w)
    boss.value = { nameKey: bn.key, cycle: bn.cycle, hp: e.hp, maxHp: e.maxHp, enraged: false }
    // Slime-tower boss: arm the companion trickle a beat after it lands.
    if (bossArtKey(w) === 'boss-slime-tower') nextCompanionAt = engineNow + 2
    coachFirstBoss()
  }
}

let nextCompanionAt = 0

/** Birth one companion slime out of the slime-tower boss: it lands on the ground
 *  band just in front of the boss and plays its emerge-and-hop birth animation. */
const spawnCompanionSlime = (bossE: Enemy): void => {
  if (enemies.value.length >= ENEMY_CAP) return
  const w = wave.value
  const def = ENEMY_DEFS.slime
  const c = challengeMult.value
  const rb = rubberBandMult()
  const e: Enemy = {
    id: ++idSeq, kind: 'slime',
    x: Math.max(8, Math.min(96, bossE.x - 3 - Math.random() * 9)),
    y: Math.max(12, Math.min(90, bossE.y + 6 + (Math.random() - 0.5) * 22)),
    hp: 0, maxHp: 1,
    atk: Math.round(waveAtk(w) * def.atkMult * (1 + (c - 1) * 0.6) * rb),
    speed: def.speed * (1 + Math.min(0.5, w / 60)),
    range: def.range, attackInterval: def.attackInterval,
    bounty: Math.round(waveBounty(w) * def.bountyMult * (1 + (c - 1) * 0.5)),
    scale: def.scale,
    cooldown: 0, abilityCd: 3,
    slowUntil: 0, stunUntil: 0,
    burnDps: 0, burnUntil: 0, poisonStacks: 0, poisonUntil: 0,
    knockStacks: 0, knockUntil: 0,
    boss: false, elite: false, enraged: false, striking: false,
    mutated: false, companion: true, born: false, bornAt: engineNow + BIRTH_SECS
  }
  // A touch softer than a full wave slime — they're an accent, not the threat.
  e.maxHp = Math.round(waveHp(w) * def.hpMult * c * rb * 0.6)
  e.hp = e.maxHp
  enemies.value = [...enemies.value, e]
  triggerRef(enemies)
  emit({ type: 'slimeBirth', x: bossE.x, y: bossE.y }) // burst at the boss body
}

/** Trickle up to COMPANION_MAX companion slimes out of a live slime-tower boss. */
const tickCompanions = (): void => {
  if (bossArtKey(wave.value) !== 'boss-slime-tower') return
  const bossE = enemies.value.find((e) => e.boss && e.hp > 0)
  if (!bossE || engineNow < nextCompanionAt) return
  if (enemies.value.filter((e) => e.companion && e.hp > 0).length >= COMPANION_MAX) return
  spawnCompanionSlime(bossE)
  nextCompanionAt = engineNow + COMPANION_INTERVAL
}

// ─── Combat helpers ──────────────────────────────────────────────────────────
// Impact / splash / projectile tint: the tier's own glow from the catalogue, so
// the elemental tiers (21–50) spark in their own colours.
const glowOf = (tier: number): string => getIngredient(tier).glow

// Units are drawn anchored at their FEET (see `.unit-box` translate(-50%,-88%)
// in BattleArena). Ranged shots + their impact VFX should target the BODY
// CENTRE — ~5 arena-y units above the anchor for a standard unit, scaled up for
// bigger sprites (brutes, bosses) so the hit lands mid-body, not at the ground.
const BODY_RISE = 5
const bodyY = (feetY: number, scale = 1): number => feetY - BODY_RISE * scale

// Scatter hits across the target's body instead of all landing dead-centre — the
// spread grows with the sprite size, so a boss takes hits all over (not one
// pile of overlapping VFX). Returns a random x/y offset in arena units.
const HIT_SCATTER = 2.6
const hitScatterX = (scale = 1): number => (Math.random() - 0.5) * 2 * HIT_SCATTER * scale
const hitScatterY = (scale = 1): number => (Math.random() - 0.5) * 2.4 * HIT_SCATTER * scale

// Knockback (Tier-3) — deliberately weak on a single hit so a lone Boulder
// Brute can't perma-shove a boss. Each shove landing within KNOCK_WINDOW of the
// previous one stacks (compounds): the window is shorter than a single unit's
// attack interval, so the ramp only builds when SEVERAL Tier-3 units focus-fire
// in quick succession — that squad still shoves bosses; one or two don't.
const KNOCK_BASE = 2         // arena-x shove per stack
const KNOCK_MAX_STACKS = 5   // push caps at KNOCK_BASE * this
const KNOCK_WINDOW = 0.5     // seconds; consecutive shoves inside this compound

const comboGoldMult = (): number => (1 + 0.1 * combo.value) * (feverActive.value ? 2 : 1)

const registerKill = (e: Enemy): void => {
  // Earned upgrade × combo/fever × the STRONGEST temporary boost (gold rush OR
  // the 3× coin buff, never both — see `killBoostMult`).
  const payout = Math.max(1, Math.round(
    e.bounty * bountyUpgradeMult() * comboGoldMult() * killBoostMult()
  ))
  addCoins(payout)
  combo.value = Math.min(99, combo.value + 1)
  comboTimer = COMBO_WINDOW
  // Combo watermark (achievements roadmap #10) — a max, not a counter, so it
  // bypasses bumpStat (no campaign XP for merely holding a streak).
  if (combo.value > (stats.value.bestCombo ?? 0)) {
    stats.value = { ...stats.value, bestCombo: combo.value }
    persistStats()
  }
  if (combo.value > 1) emit({ type: 'combo', combo: combo.value })
  if (!feverActive.value && combo.value >= FEVER_AT) {
    feverActive.value = true
    feverUntil = engineNow + FEVER_SECS
    emit({ type: 'fever' })
  }
  const before = ultCharge.value
  ultCharge.value = Math.min(ULT_MAX, ultCharge.value + (e.boss ? ULT_PER_BOSS : ULT_PER_KILL))
  if (before < ULT_MAX && ultCharge.value >= ULT_MAX) emit({ type: 'ultReady' })
  // Unlockable spells charge a flat 1% per kill (only once purchased).
  if (healUnlocked.value) healCharge.value = Math.min(SPELL_MAX, healCharge.value + SPELL_PER_KILL)
  if (reviveUnlocked.value) reviveCharge.value = Math.min(SPELL_MAX, reviveCharge.value + SPELL_PER_KILL)
  if (defenderUnlocked.value) defenderCharge.value = Math.min(SPELL_MAX, defenderCharge.value + SPELL_PER_KILL)
  if (warcryUnlocked.value) warcryCharge.value = Math.min(SPELL_MAX, warcryCharge.value + WARCRY_PER_KILL)
  if (legionUnlocked.value) legionCharge.value = Math.min(SPELL_MAX, legionCharge.value + LEGION_PER_KILL)
  if (markUnlocked.value) markCharge.value = Math.min(SPELL_MAX, markCharge.value + MARK_PER_KILL)
  // The mark dies with its target — on this frame, not the next step's sweep.
  if (markedId.value === e.id) { markedId.value = 0; markRemainingMs.value = 0 }
  bumpStat('kills')
  emit({ type: 'death', x: e.x, y: e.y, kind: e.kind, bounty: payout, boss: e.boss, id: e.id })
  emit({ type: 'number', x: e.x, y: e.y - 6, amount: payout, variant: 'gold' })
  if (e.boss) {
    // The FIRST boss kill ever is a scripted spectacle (retention-roadmap #2):
    // deeper slow-mo held longer; the arena boosts the particle/coin theatre.
    const first = stats.value.bossKills === 0
    boss.value = null
    meteorHintActive.value = false
    bumpStat('bossKills')
    timescale.value = first ? 0.22 : 0.35
    slowmoRealLeft = first ? 2.0 : 0.9
    emit({ type: 'bossKill', x: e.x, y: e.y, bounty: payout, first })
  }
}

const removeDeadEnemies = (): void => {
  const alive = enemies.value.filter((e) => e.hp > 0)
  if (alive.length !== enemies.value.length) {
    enemies.value = alive
    triggerRef(enemies)
  }
}

/** Damage taken multiplier: Executioner's Mark makes its target take +75%. */
const markAmp = (e: Enemy): number => (markedId.value === e.id ? MARK_DMG_TAKEN : 1)

/** Executioner's Mark: a marked enemy that has dropped under the execute line
 *  is finished off on the spot. Every damage path calls this after landing its
 *  hit, the damage-over-time ticks included. */
const checkExecute = (e: Enemy): void => {
  if (markedId.value !== e.id || e.hp <= 0 || e.hp >= e.maxHp * MARK_EXECUTE_BELOW) return
  emit({ type: 'execute', x: e.x, y: e.y, id: e.id, boss: e.boss })
  e.hp = 0
  if (e.boss && boss.value) boss.value = { ...boss.value, hp: 0 }
}

const hurtEnemy = (e: Enemy, amount: number, variant: 'dmg' | 'crit' | 'burn' | 'poison' = 'dmg'): void => {
  if (e.hp <= 0) return
  amount *= markAmp(e)
  e.hp -= amount
  emit({ type: 'number', x: e.x, y: e.y - 4, amount: Math.round(amount), variant })
  if (e.boss && boss.value) {
    boss.value = { ...boss.value, hp: Math.max(0, e.hp) }
    if (!e.enraged && e.hp < e.maxHp * 0.3) {
      e.enraged = true
      e.speed *= 1.5
      e.attackInterval *= 0.7
      boss.value = { ...boss.value, enraged: true }
      emit({ type: 'enrage' })
    }
  }
  checkExecute(e)
  if (e.hp <= 0) registerKill(e)
}

// ─── Fighter target assignment (1v1 spread) ──────────────────────────────────
// Fighters distribute across the field instead of all dog-piling the single
// nearest enemy: every fighter already locked onto an enemy makes that enemy
// less attractive to the next one (CROWD_PENALTY per claim), so with enough
// targets the army fans out into duels — and naturally doubles up again when
// enemies are scarce. Bosses discount the penalty (a boss is a group target),
// and a fighter's current target gets a stickiness bonus so equal-distance
// picks don't flip-flop frame to frame.
const CROWD_PENALTY = 26
const STICKINESS = 6

const pickTarget = (f: Fighter, claims: Map<number, number>): Enemy | null => {
  let best: Enemy | null = null
  let bestScore = Infinity
  for (const e of enemies.value) {
    if (e.hp <= 0 || e.x > 101) continue
    const d = Math.hypot(e.x - f.x, (e.y - f.y) * 0.8)
    const crowd = (claims.get(e.id) ?? 0) * CROWD_PENALTY * (e.boss ? 0.25 : 1)
    const score = d + crowd - (e.id === f.targetId ? STICKINESS : 0)
    if (score < bestScore) { bestScore = score; best = e }
  }
  return best
}

const nearestFighter = (x: number, y: number): Fighter | null => {
  let best: Fighter | null = null
  let bestD = Infinity
  for (const f of fighters.value) {
    if (f.hp <= 0) continue
    const d = Math.hypot(f.x - x, (f.y - y) * 0.8)
    if (d < bestD) { bestD = d; best = f }
  }
  return best
}

const spawnProjectile = (p: Omit<Projectile, 'id'>): void => {
  if (projectiles.value.length >= PROJECTILE_CAP) return
  projectiles.value = [...projectiles.value, { ...p, id: ++idSeq }]
  triggerRef(projectiles)
  emit({ type: 'shot', x: p.x, y: p.y, color: p.color })
}

/** Resolve one fighter hit landing on an enemy (melee or projectile). When the
 *  hit arrives by projectile, `impactElement` picks the element's splitter VFX
 *  at the landing point (melee hits leave it undefined → light sparkle only). */
const landFighterHit = (f: { tier: number; x: number; y: number }, e: Enemy, dmg: number, impactElement?: ElementKind, hitX?: number, hitY?: number): void => {
  const def = getFighterDef(f.tier)
  const critChance = def.ability === 'midas' ? 0.25 : 0.08
  const crit = Math.random() < critChance
  const critMult = def.ability === 'midas' ? 3 : 2
  const final = dmg * (crit ? critMult : 1)
  // Scatter the impact across the body (default centre when no explicit point).
  const ix = hitX ?? (e.x + hitScatterX(e.scale))
  const iy = hitY ?? (bodyY(e.y, e.scale) + hitScatterY(e.scale))
  emit({ type: 'impact', x: ix, y: iy, color: glowOf(f.tier), element: impactElement, target: 'enemy' })
  hurtEnemy(e, final, crit ? 'crit' : 'dmg')

  switch (def.ability) {
    case 'burn':
      e.burnDps = dmg * 0.35
      e.burnUntil = engineNow + 3
      break
    case 'knockback': {
      // Compound the shove only when hits arrive faster than a lone unit fires.
      e.knockStacks = engineNow < e.knockUntil ? Math.min(KNOCK_MAX_STACKS, e.knockStacks + 1) : 1
      e.knockUntil = engineNow + KNOCK_WINDOW
      e.x = Math.min(UNIT_MAX_X, e.x + KNOCK_BASE * e.knockStacks)
      // Only a real focus-fire stack briefly stuns — a single shove no longer does.
      if (e.knockStacks >= 3) e.stunUntil = Math.max(e.stunUntil, engineNow + 0.12)
      break
    }
    case 'poison':
      e.poisonStacks = Math.min(5, e.poisonStacks + 1)
      e.poisonUntil = engineNow + 4
      break
    case 'splash': {
      emit({ type: 'splash', x: e.x, y: e.y, color: glowOf(f.tier) })
      for (const other of enemies.value) {
        if (other === e || other.hp <= 0) continue
        if (Math.hypot(other.x - e.x, other.y - e.y) <= 14) hurtEnemy(other, final * 0.6)
      }
      break
    }
    case 'heal': {
      let weakest: Fighter | null = null
      for (const a of fighters.value) {
        if (a.hp < a.maxHp && (!weakest || a.hp / a.maxHp < weakest.hp / weakest.maxHp)) weakest = a
      }
      if (weakest) {
        const amount = Math.round(dmg * 0.3)
        weakest.hp = Math.min(weakest.maxHp, weakest.hp + amount)
        emit({ type: 'number', x: weakest.x, y: weakest.y - 6, amount, variant: 'heal' })
      }
      break
    }
    case 'chain': {
      const others = enemies.value
        .filter((o) => o !== e && o.hp > 0)
        .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))
        .slice(0, 3)
      if (others.length) {
        const points = [{ x: e.x, y: e.y }, ...others.map((o) => ({ x: o.x, y: o.y }))]
        emit({ type: 'chain', points })
        for (const o of others) hurtEnemy(o, final * 0.55)
      }
      break
    }
    case 'frost':
      e.slowUntil = engineNow + 2
      break
    case 'eruption': {
      emit({ type: 'splash', x: e.x, y: e.y, color: glowOf(f.tier) })
      e.burnDps = dmg * 0.4
      e.burnUntil = engineNow + 3
      for (const other of enemies.value) {
        if (other === e || other.hp <= 0) continue
        if (Math.hypot(other.x - e.x, other.y - e.y) <= 16) {
          hurtEnemy(other, final * 0.7)
          other.burnDps = dmg * 0.3
          other.burnUntil = engineNow + 3
        }
      }
      break
    }
    case 'midas': {
      const bonus = Math.max(2, Math.round(2 + wave.value * 0.6))
      addCoins(bonus)
      emit({ type: 'number', x: e.x, y: e.y - 9, amount: bonus, variant: 'gold' })
      break
    }
    default:
      break
  }
  removeDeadEnemies()
}

// ─── Dynamic challenge scaling (anti-steamroll rubber-band) ──────────────────
// With a stacked army + the 2× damage buff the formula waves stop being able
// to threaten the player at all. A strength valuation compares the DEPLOYED
// army against the incoming wave; once the player outguns the wave by more
// than CHALLENGE_AT the enemies spawned from that moment on are scaled up to
// close (part of) the gap.
//
// The multiplier is deliberately asymmetric: it ramps IN slowly (~10 s to
// fully engage, so a good merge never feels instantly punished) but collapses
// almost instantly when the player's power drops (army dying, buff expiring)
// — a recovering player immediately fights unbuffed enemies again. Because it
// is applied per SPAWN, the adjustment is live even mid-wave. Never persisted.
const CHALLENGE_AT = 1.5 // the player may outgun the wave by this factor for free
const CHALLENGE_MAX = 2.5
const CHALLENGE_UP_PER_SEC = 0.12
const CHALLENGE_DOWN_PER_SEC = 2.0

/** Current enemy-strength multiplier (1 ⇔ no adjustment). Exposed for HUD/debug. */
export const challengeMult = ref(1)

/** Fielded-army strength: √(total DPS × total current HP). Damage buff and
 *  upgrades flow in via `atkMult`; wounded armies rate lower (current hp). */
// Skills are left out on purpose: Warcry (sustainedAtkMult) and the summoned
// legion are bursts the player spent a charge on, and a burst that ramps up the
// very enemies it was cast against would be a tax on using it.
const playerPower = (): number => {
  let dps = 0
  let hp = 0
  for (const f of fighters.value) {
    if (f.hp <= 0 || f.spectral) continue
    const def = getFighterDef(f.tier)
    dps += (def.atk * sustainedAtkMult()) / def.attackInterval
    hp += f.hp
  }
  return Math.sqrt(dps * hp)
}

/** Expected strength of wave `w`, from the same formulas the composer uses
 *  (coarse archetype averages — the ratio only gates a soft threshold). */
const wavePower = (w: number): number => {
  if (isBossWave(w)) {
    const escorts = Math.min(6, 2 + Math.floor(w / 8))
    const dps = (waveAtk(w) * 4.5) / 1.8 + (waveAtk(w) * 0.9 * escorts) / 1.0
    const hp = waveHp(w) * 20 + waveHp(w) * 0.8 * escorts
    return Math.sqrt(dps * hp)
  }
  const count = Math.min(22, 4 + Math.floor(w * 1.25))
  const dps = (waveAtk(w) * 1.15 * count) / 1.2
  const hp = waveHp(w) * 1.15 * count
  return Math.sqrt(dps * hp)
}

const tickChallenge = (dt: number): void => {
  const pw = playerPower()
  const ratio = pw > 0 ? pw / Math.max(1, wavePower(wave.value)) : 0
  const target = ratio > CHALLENGE_AT ? Math.min(CHALLENGE_MAX, ratio / CHALLENGE_AT) : 1
  const rate = target >= challengeMult.value ? CHALLENGE_UP_PER_SEC : CHALLENGE_DOWN_PER_SEC
  const diff = target - challengeMult.value
  challengeMult.value += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt)
}

// ─── Ultimate ────────────────────────────────────────────────────────────────
export const ultReady = computed(() => ultCharge.value >= ULT_MAX)

/** True while a wipe would still RETREAT the player (they sit above the best-wave
 *  floor), so the overrun screen can suggest rebuilding on easier waves. Once at
 *  the floor / wave 1 there's nothing left to lose, so the hint hides. */
export const canSetback = computed(() =>
  wave.value > Math.max(1, bestWave.value - MAX_FALL_FROM_BEST))

// ─── First-boss Meteor coaching ──────────────────────────────────────────────
/** True while the Meteor button is coached (golden glow + runic arrow). */
export const meteorHintActive = ref(false)

/** The first boss a player ever meets: hand them a full Meteor Storm and point
 *  at it. Glorp breaks a tier-3 army, and by wave 5 the kill-charged ultimate
 *  is often spent or not yet full; seven meteors on the boss are what turns the
 *  play-testers' first wipe into a win. Once per player — the sticky flag is
 *  read from the live blob at spawn time (so a hydrated veteran save never gets
 *  it), and `bossKills` covers saves from before the flag existed. */
const coachFirstBoss = (): void => {
  if (getState<boolean>(BATTLE_FIRST_BOSS_COACHED_KEY, false) === true || stats.value.bossKills > 0) return
  setState(BATTLE_FIRST_BOSS_COACHED_KEY, true)
  if (ultCharge.value < ULT_MAX) {
    ultCharge.value = ULT_MAX
    persistBattle()
    emit({ type: 'ultReady' })
  }
  meteorHintActive.value = true
}

export const fireUltimate = (): boolean => {
  if (ultCharge.value < ULT_MAX || wavePhase.value === 'overrun') return false
  meteorHintActive.value = false
  ultCharge.value = 0
  persistBattle()
  pendingMeteors = []
  for (let i = 0; i < METEOR_COUNT; i++) {
    pendingMeteors.push({ at: engineNow + 0.15 + i * 0.18 })
  }
  return true
}

// ─── Unlockable spells ───────────────────────────────────────────────────────
export const healReady = computed(() => healUnlocked.value && healCharge.value >= SPELL_MAX)
export const reviveReady = computed(() => reviveUnlocked.value && reviveCharge.value >= SPELL_MAX)

/** Buy the Heal spell for coins (idempotent — no double charge). */
export const unlockHeal = (): boolean => {
  if (healUnlocked.value || !spendCoins(HEAL_UNLOCK_COST)) return false
  healUnlocked.value = true
  setState(BATTLE_HEAL_UNLOCKED_KEY, true)
  return true
}
export const unlockReviveGuard = (): boolean => {
  if (reviveUnlocked.value || !spendCoins(REVIVE_UNLOCK_COST)) return false
  reviveUnlocked.value = true
  setState(BATTLE_REVIVE_UNLOCKED_KEY, true)
  return true
}

/** Heal every fielded unit for HEAL_FRACTION of its max HP; one heal VFX/unit. */
export const fireHeal = (): boolean => {
  if (!healReady.value || wavePhase.value === 'overrun') return false
  healCharge.value = 0
  persistBattle()
  for (const f of fighters.value) {
    if (f.hp <= 0) continue
    f.hp = Math.min(f.maxHp, f.hp + f.maxHp * HEAL_FRACTION)
    emit({ type: 'heal', x: f.x, y: f.y, id: f.id })
  }
  triggerRef(fighters)
  return true
}

/** Arm Revive Guard: for REVIVE_GUARD_SECS, every fielded unit gets one
 *  auto-revive (wings). Consumed on death → resurrect at full HP, wings gone. */
export const fireReviveGuard = (): boolean => {
  if (!reviveReady.value || wavePhase.value === 'overrun') return false
  reviveCharge.value = 0
  persistBattle()
  reviveGuardUntil = engineNow + REVIVE_GUARD_SECS
  reviveGuardActive.value = true
  reviveGuardRemainingMs.value = REVIVE_GUARD_SECS * 1000
  for (const f of fighters.value) if (!f.spectral) f.revivePending = true
  triggerRef(fighters)
  emit({ type: 'reviveGuard' })
  return true
}

/** End the Revive Guard window: unused wings vanish. */
const endReviveGuard = (): void => {
  reviveGuardActive.value = false
  reviveGuardRemainingMs.value = 0
  let changed = false
  for (const f of fighters.value) if (f.revivePending) { f.revivePending = false; changed = true }
  if (changed) triggerRef(fighters)
}

// ─── Defender (tank) ─────────────────────────────────────────────────────────
export const defenderReady = computed(() => defenderUnlocked.value && defenderCharge.value >= SPELL_MAX)

/** Damage a fighter actually takes — the tank absorbs 80% of it. */
// Every hit on a fighter routes through here: the Defender tank's flat DR, then
// the deep-wave catch-up's "+50% defence" (a divisor, so ≈33% less damage taken)
// while that window applies. One choke point, so neither can be bypassed.
const fighterDamage = (f: Fighter, raw: number): number => {
  const afterTank = f.isTank ? raw * TANK_DR : raw
  return armyCatchUpActive() ? afterTank / RUBBER_BAND_ARMY_DEF_MULT : afterTank
}

/** Drop a unit's tank buff: max HP back to normal, HP clamped, crest gone. */
const revertTank = (f: Fighter): void => {
  f.isTank = false
  f.tankUntil = 0
  const normalMax = Math.round(getFighterDef(f.tier).hp * hpMult())
  f.maxHp = normalMax
  f.hp = Math.min(f.hp, normalMax)
}

export const unlockDefender = (): boolean => {
  if (defenderUnlocked.value || !spendCoins(DEFENDER_UNLOCK_COST)) return false
  defenderUnlocked.value = true
  setState(BATTLE_DEFENDER_UNLOCKED_KEY, true)
  return true
}

/** True while there's a valid tank target: at least one MELEE unit deployed
 *  (a spectral warrior never counts — it would take the tank buff with it). */
const meleeFielded = (f: Fighter): boolean => !f.spectral && getFighterDef(f.tier).range <= MELEE_RANGE_MAX
export const hasTankTarget = computed(() => fighters.value.some(meleeFielded))

/** Promote the highest-tier MELEE unit currently deployed on the battlefield into
 *  a tank for 2 minutes (double max HP, takes 20% damage). STRICTLY melee — a
 *  ranged unit is never chosen; if no melee unit is fielded the cast is a no-op
 *  and the charge is kept. Only one tank exists at a time. */
export const fireDefender = (): boolean => {
  if (!defenderReady.value || wavePhase.value === 'overrun') return false
  // Scan the LIVE field for the highest-tier melee (range ≤ 14) fighter.
  let cand: Fighter | null = null
  for (const f of fighters.value) {
    if (!meleeFielded(f)) continue // ranged unit — never a tank
    if (!cand || f.tier > cand.tier) cand = f
  }
  if (!cand) return false // no melee unit on the field → nothing to promote
  defenderCharge.value = 0
  persistBattle()
  for (const f of fighters.value) if (f.isTank && f !== cand) revertTank(f) // one tank max
  cand.isTank = true
  cand.tankUntil = engineNow + DEFENDER_SECS
  cand.maxHp = Math.round(getFighterDef(cand.tier).hp * hpMult() * TANK_HP_MULT)
  cand.hp = cand.maxHp
  triggerRef(fighters)
  emit({ type: 'defender', x: cand.x, y: cand.y, id: cand.id })
  return true
}

// ─── Arena skills, slots 5–8 ─────────────────────────────────────────────────
const unlockSkill = (unlocked: typeof warcryUnlocked, cost: number, key: string): boolean => {
  if (unlocked.value || !spendCoins(cost)) return false
  unlocked.value = true
  setState(key, true)
  return true
}
export const unlockWarcry = (): boolean => unlockSkill(warcryUnlocked, WARCRY_UNLOCK_COST, BATTLE_WARCRY_UNLOCKED_KEY)
export const unlockLegion = (): boolean => unlockSkill(legionUnlocked, LEGION_UNLOCK_COST, BATTLE_LEGION_UNLOCKED_KEY)
export const unlockMark = (): boolean => unlockSkill(markUnlocked, MARK_UNLOCK_COST, BATTLE_MARK_UNLOCKED_KEY)
export const unlockPact = (): boolean => unlockSkill(pactUnlocked, PACT_UNLOCK_COST, BATTLE_PACT_UNLOCKED_KEY)

export const warcryReady = computed(() => warcryUnlocked.value && warcryCharge.value >= SPELL_MAX)
export const legionReady = computed(() => legionUnlocked.value && legionCharge.value >= SPELL_MAX)
export const markReady = computed(() => markUnlocked.value && markCharge.value >= SPELL_MAX)
export const pactReady = computed(() => pactUnlocked.value && pactCooldownMs.value <= 0)

/** Where the army stands: the centroid of the living, fielded fighters. */
const armyCentre = (): { x: number; y: number } => {
  let x = 0, y = 0, n = 0
  for (const f of fighters.value) { if (f.hp > 0) { x += f.x; y += f.y; n++ } }
  return n ? { x: x / n, y: y / n } : { x: fighterGuardX() + 8, y: 50 }
}

/** Warcry of the Legion: 8 s of +60% damage and +30% attack speed. A second
 *  cast inside the window just restarts the eight seconds. */
export const fireWarcry = (): boolean => {
  if (!warcryReady.value || wavePhase.value === 'overrun') return false
  warcryCharge.value = 0
  persistBattle()
  warcryActive.value = true
  warcryUntil = engineNow + WARCRY_SECS
  warcryRemainingMs.value = WARCRY_SECS * 1000
  const c = armyCentre()
  emit({ type: 'warcry', x: c.x, y: c.y })
  return true
}

/** The tier Legion Call summons: one below the army's best (never below 1). */
export const legionTier = (): number => {
  let best = 0
  for (const f of fighters.value) if (!f.spectral && f.tier > best) best = f.tier
  return Math.max(1, best - 1)
}

/**
 * Legion Call: three spectral warriors, one tier below your best, at 60%
 * health for 20 s. They take the field whether or not the army is full. A cast
 * while a legion still stands refreshes it — the survivors get their health
 * and full time back and the fallen are replaced — so there are never more
 * than three.
 */
export const fireLegion = (): boolean => {
  if (!legionReady.value || wavePhase.value === 'overrun') return false
  legionCharge.value = 0
  persistBattle()
  const tier = legionTier()
  legionUntil = engineNow + LEGION_SECS
  legionRemainingMs.value = LEGION_SECS * 1000
  const standing = fighters.value.filter((f) => f.spectral)
  for (const f of standing) { f.expiresAt = legionUntil; f.hp = f.maxHp }
  const points: { x: number; y: number; id: number }[] = []
  const summoned: Fighter[] = []
  const gx = fighterGuardX()
  for (let i = standing.length; i < LEGION_COUNT; i++) {
    // Portals open in a column just ahead of the guard line: top, middle, bottom.
    const y = 26 + i * 24 + (Math.random() - 0.5) * 6
    const f = makeFighter(tier, gx + 6 + Math.random() * 4, y, legionUntil)
    summoned.push(f)
    points.push({ x: f.x, y: f.y, id: f.id })
  }
  if (summoned.length) fighters.value = [...fighters.value, ...summoned]
  triggerRef(fighters)
  emit({ type: 'legionCall', tier, points })
  return true
}

/** Who Executioner's Mark lands on: the boss, else an elite, else the enemy
 *  with the most health left. Only living, landed, on-screen enemies. */
const markTarget = (): Enemy | null => {
  let bossE: Enemy | null = null
  let elite: Enemy | null = null
  let top: Enemy | null = null
  for (const e of enemies.value) {
    if (e.hp <= 0 || !e.born || e.x > 101) continue
    if (e.boss && (!bossE || e.hp > bossE.hp)) bossE = e
    if (e.elite && (!elite || e.hp > elite.hp)) elite = e
    if (!top || e.hp > top.hp) top = e
  }
  return bossE ?? elite ?? top
}
/** Something on the field to mark. `enemies` is triggered on every spawn,
 *  birth and death, which is exactly when this can change. */
export const hasMarkTarget = computed(() =>
  enemies.value.some((e) => e.hp > 0 && e.born && e.x <= 101))

export const fireMark = (): boolean => {
  if (!markReady.value || wavePhase.value !== 'fighting') return false
  const t = markTarget()
  if (!t) return false
  markCharge.value = 0
  persistBattle()
  markedId.value = t.id
  markUntil = engineNow + MARK_SECS
  markRemainingMs.value = MARK_SECS * 1000
  emit({ type: 'mark', x: t.x, y: t.y, id: t.id })
  // Already under the line (a boss finished off by the mark itself).
  checkExecute(t)
  if (t.hp <= 0) { registerKill(t); removeDeadEnemies() }
  return true
}

/**
 * The two parties to a Soul Pact on the current field: the champion (the
 * highest-tier fighter) and the sacrifice (the strongest fighter of a strictly
 * LOWER tier — among equals, the most wounded). Null when there is no such pair
 * (an empty field, one fighter, or every fighter on the same tier): then there
 * is nothing to gain and the pact refuses.
 */
export const pactPair = (): { champion: Fighter; victim: Fighter } | null => {
  let champion: Fighter | null = null
  for (const f of fighters.value) {
    if (!f.spectral && f.hp > 0 && (!champion || f.tier > champion.tier)) champion = f
  }
  if (!champion) return null
  let victim: Fighter | null = null
  for (const f of fighters.value) {
    if (f.spectral || f.hp <= 0 || f.tier >= champion.tier) continue
    if (!victim || f.tier > victim.tier || (f.tier === victim.tier && f.hp / f.maxHp < victim.hp / victim.maxHp)) victim = f
  }
  return victim ? { champion, victim } : null
}
export const hasPactPair = computed(() => pactPair() !== null)

/**
 * Soul Pact: the champion gains a twin at full health, and the sacrifice is
 * consumed — removed, not killed, so it neither fills a RALLY! slot nor charges
 * Legion Call. The twin takes the field right beside the champion; the arena
 * animates it splitting off the champion's body into that spot.
 */
export const firePact = (): boolean => {
  if (!pactReady.value || wavePhase.value === 'overrun') return false
  const pair = pactPair()
  if (!pair) return false
  const { champion, victim } = pair
  const twin = makeFighter(champion.tier, champion.x, champion.y)
  // It splits off where the champion stands (not clamped into the deploy band),
  // one separation-distance away toward the open middle — between waves the
  // soft separation does not run, and a twin stacked exactly on its champion
  // would read as nothing having happened.
  twin.x = Math.min(96, champion.x + 2)
  twin.y = Math.max(6, Math.min(94, champion.y + (champion.y < 50 ? 7.5 : -7.5)))
  fighters.value = [...fighters.value.filter((f) => f !== victim), twin]
  triggerRef(fighters)
  persistArmy()
  pactCooldownMs.value = PACT_COOLDOWN_MS
  setState(BATTLE_PACT_COOLDOWN_KEY, PACT_COOLDOWN_MS)
  flushPersist() // a permanent change to the army — checkpoint it now
  emit({
    type: 'soulPact', x: champion.x, y: champion.y, tier: champion.tier, twinId: twin.id,
    victimId: victim.id, vx: victim.x, vy: victim.y, victimTier: victim.tier
  })
  return true
}

// The pact's cooldown drains on PLAY time (called from the RAF driver past the
// pause gate, like the coin buff) and is persisted at most every 5 s.
let pactPersistDebt = 0
const tickPactCooldown = (dtMs: number): void => {
  if (pactCooldownMs.value <= 0) return
  const next = Math.max(0, pactCooldownMs.value - dtMs)
  pactCooldownMs.value = next
  pactPersistDebt += dtMs
  if (next === 0 || pactPersistDebt >= 5_000) {
    pactPersistDebt = 0
    setState(BATTLE_PACT_COOLDOWN_KEY, Math.round(next))
  }
}

/** Per logic step: Warcry's window, the legion's lifetime, the mark's hold. */
const tickSkills = (): void => {
  if (warcryActive.value) {
    warcryRemainingMs.value = Math.max(0, Math.round((warcryUntil - engineNow) * 1000))
    if (engineNow >= warcryUntil) { warcryActive.value = false; warcryRemainingMs.value = 0 }
  }
  if (legionRemainingMs.value > 0) {
    legionRemainingMs.value = Math.max(0, Math.round((legionUntil - engineNow) * 1000))
  }
  let faded = false
  for (const f of fighters.value) {
    if (f.spectral && engineNow >= f.expiresAt) { f.hp = 0; faded = true }
  }
  if (faded) buryFallen() // a spectral warrior dissolves; it is never mourned
  if (!fighters.value.some((f) => f.spectral)) legionRemainingMs.value = 0
  if (markedId.value) {
    const alive = enemies.value.some((e) => e.id === markedId.value && e.hp > 0)
    markRemainingMs.value = Math.max(0, Math.round((markUntil - engineNow) * 1000))
    if (!alive || engineNow >= markUntil) { markedId.value = 0; markRemainingMs.value = 0 }
  }
}

/** Where the next meteor lands: on a random living, on-screen enemy — with a
 *  little scatter so the volley still reads as a rain, and resolved at IMPACT
 *  time so late meteors track enemies that moved (or spawned) since the cast.
 *  Empty field → random carpet-bomb spot, so the spectacle never no-shows. */
const meteorPoint = (): { x: number; y: number } => {
  const targets = enemies.value.filter((e) => e.hp > 0 && e.x <= 100)
  if (targets.length) {
    const t = targets[(Math.random() * targets.length) | 0]!
    return {
      x: Math.max(6, Math.min(98, t.x + (Math.random() - 0.5) * 9)),
      y: Math.max(8, Math.min(94, t.y + (Math.random() - 0.5) * 9))
    }
  }
  return { x: 24 + Math.random() * 72, y: 12 + Math.random() * 76 }
}

const tickMeteors = (): void => {
  if (!pendingMeteors.length) return
  const due = pendingMeteors.filter((m) => m.at <= engineNow)
  if (!due.length) return
  pendingMeteors = pendingMeteors.filter((m) => m.at > engineNow)
  const dmg = waveHp(wave.value) * 0.55
  for (let i = 0; i < due.length; i++) {
    const p = meteorPoint()
    emit({ type: 'meteor', x: p.x, y: p.y })
    for (const e of enemies.value) {
      if (e.hp <= 0) continue
      if (Math.hypot(e.x - p.x, e.y - p.y) <= 18) hurtEnemy(e, dmg)
    }
  }
  removeDeadEnemies()
}

/** DEV cheat: clear the field and jump straight into wave `n` (e.g. 5 = the
 *  slime-tower boss, for testing its companion spawns). */
export const cheatJumpToWave = (n: number): void => {
  wave.value = Math.max(1, Math.floor(n))
  enemies.value = []
  projectiles.value = []
  boss.value = null
  triggerRef(enemies); triggerRef(projectiles)
  deadThisWave = []
  nextCompanionAt = 0
  startCountdown(0.6)
}

// ─── Wave lifecycle ──────────────────────────────────────────────────────────
const startCountdown = (secs = COUNTDOWN_SECS): void => {
  wavePhase.value = 'countdown'
  countdown.value = secs
  activePortal.value = null // portals are closed between waves
}

const beginWave = (): void => {
  schedule = composeWave(wave.value)
  buildPortals(schedule)
  activePortal.value = null
  waveElapsed = 0
  deadThisWave = []
  rallyOffer.value = false
  mutator.value = rollMutator(wave.value)
  // MUTATION roll — only on brand-new territory (above the ceiling) that isn't a
  // boss wave. Advancing the ceiling for EVERY wave means a rubber-band re-climb
  // never re-mutates an already-fought wave; only pushing past it rolls again.
  const w = wave.value
  const freshTerritory = w > mutationCeiling
  if (w > mutationCeiling) {
    mutationCeiling = w
    setState(BATTLE_MUTATION_CEILING_KEY, mutationCeiling)
  }
  waveMutated.value = freshTerritory && !isBossWave(w) && w >= MUTATION_MIN_WAVE && Math.random() < MUTATION_CHANCE
  wavePhase.value = 'fighting'
  emit({ type: 'waveStart', wave: w, boss: isBossWave(w), mutator: mutator.value, mutated: waveMutated.value })
}

const clearWave = (): void => {
  const clearedWave = wave.value
  const bonus = Math.round(waveClearBonus(clearedWave) * bountyMult() * (feverActive.value ? 2 : 1))
  addCoins(bonus)
  emit({ type: 'waveCleared', wave: clearedWave, bonus })
  // Milestone chest every 10th wave (retention-roadmap #4): fat gold drop here;
  // the scene adds the free high-tier unit onto the grid via the event.
  if (clearedWave % CHEST_EVERY_WAVES === 0) {
    const chestGold = Math.round(waveClearBonus(clearedWave) * 3 * bountyMult())
    addCoins(chestGold)
    emit({ type: 'milestone', wave: clearedWave, gold: chestGold })
  }
  bumpStat('waves')
  wave.value += 1
  if (wave.value > bestWave.value) {
    bestWave.value = wave.value
    submitBestWave(bestWave.value) // platform leaderboards (roadmap #16)
  }
  gateHp.value = Math.min(GATE_MAX, gateHp.value + GATE_MAX * 0.25)
  persistBattle()
  flushPersist() // a cleared wave is real progress — checkpoint now
  wavePhase.value = 'cleared'
  phaseTimer = 1.6
}

const triggerOverrun = (): void => {
  wavePhase.value = 'overrun'
  rallyClaimed = false
  phaseTimer = OVERRUN_SECS
  timescale.value = 0.45
  slowmoRealLeft = 1.0
  boss.value = null
  meteorHintActive.value = false
  emit({ type: 'overrun' })
}

const resetAfterOverrun = (): void => {
  enemies.value = []
  projectiles.value = []
  triggerRef(enemies)
  triggerRef(projectiles)
  gateHp.value = GATE_MAX
  combo.value = 0
  feverActive.value = false
  rallyOffer.value = false
  deadThisWave = []
  // Recovery valve: an unrevived wipe retreats a few waves so the player can
  // rebuild an army on beatable waves instead of re-losing wave N forever.
  // A RALLY! revive keeps the wave — the resurrected army earned the retry.
  if (!rallyClaimed) {
    // Retreat OVERRUN_WAVE_SETBACK waves, but never below the best-wave floor
    // (bestWave - MAX_FALL_FROM_BEST) nor below wave 1. The floor already folds
    // in the wave-1 clamp, so the retreat is just "floor vs natural setback".
    const floor = Math.max(1, bestWave.value - MAX_FALL_FROM_BEST)
    const fallback = Math.max(floor, wave.value - OVERRUN_WAVE_SETBACK)
    // Struggling: the natural retreat was capped by the best-wave floor — the
    // player has slid the full MAX_FALL_FROM_BEST waves off their best and keeps
    // wiping. Grant the rubber-band catch-up (only meaningful once best is high
    // enough for a real floor, i.e. best > MAX_FALL_FROM_BEST). Re-firing on a
    // later floored wipe just refreshes the 15-min window — fine, still stuck.
    if (bestWave.value > MAX_FALL_FROM_BEST && wave.value - OVERRUN_WAVE_SETBACK <= floor) {
      activateRubberBand()
    }
    if (fallback !== wave.value) {
      wave.value = fallback
      persistBattle()
      emit({ type: 'setback', wave: fallback })
    }
  }
  startCountdown()
  // Same placement as a cleared wave: the retry's countdown is a 3…2…1 for the
  // next wave like any other. The OVERRUN overlay has already had its full
  // `OVERRUN_SECS` on screen by now, so this can never open over a result
  // screen — and a RALLY rewarded ad taken during that window holds
  // `isAdShowing`, which `isBreakAdDue` refuses on.
  playCountdownInterstitial()
}

// ─── RALLY! rewarded revive (retention-roadmap #8) ───────────────────────────
/** Hold the overrun restart while the RALLY! offer shows. Called by the arena
 *  UI (which owns the `isRewardedReady` gate — the engine stays ad-agnostic).
 *  Returns false when nobody died this wave (nothing to resurrect). */
export const requestRallyHold = (): boolean => {
  if (wavePhase.value !== 'overrun' || deadThisWave.length === 0) return false
  phaseTimer = Math.max(phaseTimer, RALLY_OFFER_SECS)
  rallyOffer.value = true
  return true
}

/** Rewarded ad granted → the fallen return at full HP (army-cap permitting).
 *  Returns how many fighters came back. */
export const claimRally = (): number => {
  if (!rallyOffer.value) return 0
  rallyOffer.value = false
  rallyClaimed = true
  let revived = 0
  let championBack = false
  // The discovery watermark (the Unit Codex's highest tier) lives in the grid
  // module's state; read it from the blob rather than import the grid module.
  const topTier = Math.max(1, Math.floor(Number(getState(PRISM_MAX_TIER_KEY, 1))) || 1)
  for (const tier of deadThisWave) {
    if (!deployFighter(tier)) break
    revived++
    if (tier >= topTier) championBack = true
  }
  deadThisWave = []
  // The ad must always hand back the best unit the player has discovered: when
  // none of the resurrected fighters is of that tier, one is gifted on top —
  // making room by dismissing the weakest fighter if the army is at cap.
  if (!championBack) {
    let spot: { x: number; y: number } | null = null
    if (armySize() >= ARMY_CAP) {
      let weakest: Fighter | null = null
      for (const f of fighters.value) {
        if (f.spectral) continue
        if (!weakest || f.tier < weakest.tier || (f.tier === weakest.tier && f.hp < weakest.hp)) weakest = f
      }
      if (weakest && weakest.tier < topTier) {
        const gone = weakest
        spot = { x: gone.x, y: gone.y } // the champion takes its place in the line
        fighters.value = fighters.value.filter((f) => f !== gone)
        triggerRef(fighters)
      }
    }
    if (deployFighter(topTier, spot?.x, spot?.y)) revived++
  }
  phaseTimer = Math.min(phaseTimer, 1.0) // ceremony done — restart promptly
  return revived
}

/** Offer declined / expired — release the hold so the restart resumes. */
export const declineRally = (): void => {
  if (!rallyOffer.value) return
  rallyOffer.value = false
  phaseTimer = Math.min(phaseTimer, 0.8)
}

// ─── Logic step ──────────────────────────────────────────────────────────────
/** Attack-speed multiplier: FEVER or Warcry, whichever is higher — never both. */
const attackSpeedMult = (): number =>
  Math.max(feverActive.value ? FEVER_ATK_SPEED : 1, warcryActive.value ? WARCRY_ATK_SPEED : 1)

/** Bury the fallen (buffered per wave for the RALLY! revive offer). */
const buryFallen = (): void => {
  let removed = false
  const alive = fighters.value.filter((f) => {
    if (f.hp > 0) return true
    // A spectral warrior just dissolves: no RALLY! slot, no Legion charge.
    if (f.spectral) {
      emit({ type: 'spectralFade', x: f.x, y: f.y, id: f.id })
      removed = true
      return false
    }
    // Revive Guard: a pending revive resurrects the unit at full HP instead of
    // removing it — the wings are consumed (flag cleared), and it stays fielded.
    if (f.revivePending) {
      f.revivePending = false
      f.hp = f.maxHp
      f.cooldown = Math.max(f.cooldown, 0.3)
      emit({ type: 'revive', x: f.x, y: f.y, id: f.id })
      removed = true // army composition changed → re-render + persist
      return true
    }
    emit({ type: 'fighterDeath', x: f.x, y: f.y, tier: f.tier, id: f.id })
    deadThisWave.push(f.tier)
    // Legion Call is the comeback skill: it charges from losses.
    if (legionUnlocked.value) legionCharge.value = Math.min(SPELL_MAX, legionCharge.value + LEGION_PER_FALLEN)
    removed = true
    return false
  })
  if (removed) {
    fighters.value = alive
    triggerRef(fighters)
    persistArmy()
  }
}

// ─── Engagement ring: attackers fan out round their target ──────────────────
// Every fighter used to walk the straight line to its target and stop at range,
// so all the melee units on one enemy stood on the SAME spot — one blob where
// tier badges, hit sparks and field-merge drops landed on top of each other.
// Now each attacker takes its own slot on an arc round the target's army-facing
// side: the first straight in front, the next above and below, fanning wider as
// more join — never round the far side, where the wave comes from. Ranged units
// fan on a tighter arc at their longer reach.
const RING_ARC_MELEE = Math.PI * 1.1   // ≈ 200° of arc for melee slots
const RING_ARC_RANGED = Math.PI * 0.5  // ≈ 90° for ranged
const RING_STEP_MAX = Math.PI / 4      // never more than 45° between neighbours
/** Fraction of its range an attacker stands off at — inside reach, so it can swing. */
const RING_STANDOFF = 0.78
/** How fast an attacker in reach keeps sliding to its slot (× its walk speed). */
const RING_DRIFT_WHILE_FIGHTING = 0.35

/** Slot angle for attacker `k` of `n` on one target (π = straight in front). */
const ringAngle = (k: number, n: number, arc: number): number => {
  if (n <= 1) return Math.PI
  const step = Math.min(RING_STEP_MAX, arc / (n - 1))
  // 0 front, then alternate above / below: 0, +1, −1, +2, −2 …
  const side = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2)
  return Math.PI + side * step
}

const stepFighters = (dt: number): void => {
  // Fresh claim tally per step — earlier fighters in the array claim first,
  // later ones route around crowded targets (see pickTarget).
  const claims = new Map<number, number>()
  // Pass 1 — targets, and how many melee / ranged attackers each one draws, so
  // pass 2 can give every attacker its own slot on the target's ring.
  const targets = new Map<Fighter, Enemy | null>()
  const ringCount = new Map<string, number>()
  for (const f of fighters.value) {
    const target = pickTarget(f, claims)
    targets.set(f, target)
    if (!target) continue
    claims.set(target.id, (claims.get(target.id) ?? 0) + 1)
    const key = `${target.id}:${getFighterDef(f.tier).range > MELEE_RANGE_MAX ? 'r' : 'm'}`
    ringCount.set(key, (ringCount.get(key) ?? 0) + 1)
  }
  const ringNext = new Map<string, number>()
  for (const f of fighters.value) {
    f.striking = false
    const def = getFighterDef(f.tier)
    f.cooldown -= dt
    f.abilityCd -= dt

    // Periodic abilities fire even while repositioning.
    if (def.ability === 'frost' && f.abilityCd <= 0 && enemies.value.length) {
      f.abilityCd = 7
      emit({ type: 'nova', x: f.x, y: f.y })
      for (const e of enemies.value) {
        if (e.hp > 0 && Math.hypot(e.x - f.x, e.y - f.y) <= 20) {
          e.stunUntil = engineNow + 1.2
          e.slowUntil = engineNow + 3
        }
      }
    }

    const target = targets.get(f) ?? null
    if (!target) {
      f.targetId = 0
      // No enemies → drift back to the guard line (kept clear of the gate).
      const gx = fighterGuardX()
      const dx = gx - f.x
      if (Math.abs(dx) > 1) f.x += Math.sign(dx) * def.speed * dt
      continue
    }
    f.targetId = target.id
    const dist = Math.hypot(target.x - f.x, (target.y - f.y) * 0.8)

    // This attacker's slot on the target's ring (same 0.8 y-metric as `dist`).
    const ranged = def.range > MELEE_RANGE_MAX
    const key = `${target.id}:${ranged ? 'r' : 'm'}`
    const k = ringNext.get(key) ?? 0
    ringNext.set(key, k + 1)
    const angle = ringAngle(k, ringCount.get(key) ?? 1, ranged ? RING_ARC_RANGED : RING_ARC_MELEE)
    const r = def.range * RING_STANDOFF
    const slotX = target.x + Math.cos(angle) * r
    const slotY = target.y + (Math.sin(angle) * r) / 0.8
    const toSlot = Math.hypot(slotX - f.x, slotY - f.y)
    // Out of reach: head for the slot at full speed. In reach: keep swinging,
    // and slide toward the slot meanwhile so the ring forms mid-fight.
    const inReach = dist <= def.range
    if (toSlot > 0.5) {
      const step = Math.min(toSlot, def.speed * dt * (inReach ? RING_DRIFT_WHILE_FIGHTING : 1))
      f.x = Math.max(fighterGuardX(), Math.min(96, f.x + ((slotX - f.x) / toSlot) * step))
      f.y = Math.max(6, Math.min(94, f.y + ((slotY - f.y) / toSlot) * step))
    }
    if (inReach && f.cooldown <= 0) {
      const interval = def.attackInterval / attackSpeedMult()
      f.cooldown = interval
      const dmg = def.atk * atkMult()
      if (def.range > 14) {
        spawnProjectile({
          x: f.x, y: bodyY(f.y, def.scale), speed: 90, targetId: target.id, fromFighter: true,
          dmg, ability: def.ability, sourceTier: f.tier, color: glowOf(f.tier),
          jitterX: hitScatterX(target.scale), jitterY: hitScatterY(target.scale),
          element: getIngredient(f.tier).element
        })
      } else {
        // Melee: the arena lunges the body ALONG this direction (dash-push).
        const nx = (target.x - f.x) / (dist || 1)
        const ny = (target.y - f.y) / (dist || 1)
        f.striking = true
        emit({ type: 'strike', id: f.id, x: f.x, y: f.y, tier: f.tier, dx: nx, dy: ny })
        landFighterHit(f, target, dmg)
      }
    }
  }
  // Soft separation: stacked fighters ease apart so every unit (and its tier
  // badge) stays readable. Gentle rate — never fights the chase movement hard
  // enough to hold a melee unit out of range. A notch wider than it was now
  // that the engagement ring hands each attacker its own spot to hold.
  const SEP_DIST = 8.5
  const list = fighters.value
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!
      const b = list[j]!
      let dx = b.x - a.x
      let dy = b.y - a.y
      let d = Math.hypot(dx, dy)
      if (d >= SEP_DIST) continue
      if (d < 0.01) { dx = Math.random() - 0.5; dy = (Math.random() - 0.5) || 0.5; d = Math.hypot(dx, dy) }
      const push = (SEP_DIST - d) * 3 * dt // resolves a full overlap in ~⅓ s
      const px = (dx / d) * push
      const py = (dy / d) * push
      a.x = Math.max(fighterGuardX(), Math.min(96, a.x - px))
      a.y = Math.max(6, Math.min(94, a.y - py))
      b.x = Math.max(fighterGuardX(), Math.min(96, b.x + px))
      b.y = Math.max(6, Math.min(94, b.y + py))
    }
  }
  buryFallen()
}

const stepEnemies = (dt: number): void => {
  for (const e of enemies.value) {
    e.striking = false
    if (e.hp <= 0) continue
    // A companion mid-birth just plays its emerge/hop animation — no moving,
    // no attacking — until it lands (bornAt).
    if (!e.born) {
      if (engineNow >= e.bornAt) { e.born = true; triggerRef(enemies) }
      else continue
    }
    e.cooldown -= dt
    e.abilityCd -= dt

    // Status DoTs (amplified under Executioner's Mark, like every other hit).
    const amp = markAmp(e)
    if (e.burnUntil > engineNow) {
      e.hp -= e.burnDps * amp * dt
      if (Math.random() < dt * 2) emit({ type: 'number', x: e.x, y: e.y - 4, amount: Math.max(1, Math.round(e.burnDps * amp * 0.5)), variant: 'burn' })
    }
    if (e.poisonUntil > engineNow && e.poisonStacks > 0) {
      const dps = (e.poisonStacks * e.maxHp * 0.01 + e.poisonStacks * 2) * amp
      e.hp -= dps * dt
      if (Math.random() < dt * 2) emit({ type: 'number', x: e.x, y: e.y - 4, amount: Math.max(1, Math.round(dps * 0.5)), variant: 'poison' })
    }
    checkExecute(e)
    if (e.hp <= 0) { registerKill(e); continue }

    if (e.stunUntil > engineNow) continue
    const slowMult = e.slowUntil > engineNow ? 0.45 : 1

    // Warlock heal pulse.
    if (e.kind === 'warlock' && e.abilityCd <= 0) {
      e.abilityCd = 3
      const heal = Math.round(waveHp(wave.value) * (ENEMY_DEFS.warlock.healPulse ?? 0.5))
      let healed = false
      for (const o of enemies.value) {
        if (o === e || o.hp <= 0 || o.hp >= o.maxHp) continue
        if (Math.hypot(o.x - e.x, o.y - e.y) <= 24) {
          o.hp = Math.min(o.maxHp, o.hp + heal)
          if (o.boss && boss.value) boss.value = { ...boss.value, hp: o.hp }
          healed = true
        }
      }
      if (healed) emit({ type: 'warHeal', x: e.x, y: e.y })
    }

    const target = nearestFighter(e.x, e.y)
    const gateDist = e.x - enemyGateX()
    const targetDist = target ? Math.hypot(target.x - e.x, (target.y - e.y) * 0.8) : Infinity

    // Attack a fighter in range, else march on the gate.
    if (target && targetDist <= e.range) {
      if (e.cooldown <= 0) {
        e.cooldown = e.attackInterval
        e.striking = true
        if (e.range > 14) {
          spawnProjectile({
            x: e.x, y: bodyY(e.y, e.scale), speed: 60, targetId: target.id, fromFighter: false,
            dmg: e.atk, ability: 'spit', sourceTier: 0, color: '#c8a97e',
            jitterX: hitScatterX(), jitterY: hitScatterY(),
            // Spitter (centaur) hurls rocks: reuse the Tier-3 stone projectile + splitter.
            element: 'stone'
          })
        } else {
          const dmg = fighterDamage(target, e.atk)
          target.hp -= dmg
          emit({ type: 'number', x: target.x, y: target.y - 5, amount: Math.round(dmg), variant: 'dmg' })
          // Frost March mutator: every landed hit chills the fighter's attack.
          if (mutator.value === 'frostMarch') target.cooldown = Math.min(3, Math.max(target.cooldown, 0) + 0.5)
        }
      }
    } else if (target && targetDist < gateDist + 16) {
      // Intercept the nearest fighter.
      const nx = (target.x - e.x) / (targetDist || 1)
      const ny = (target.y - e.y) / (targetDist || 1)
      e.x += nx * e.speed * slowMult * dt
      e.y = Math.max(6, Math.min(94, e.y + ny * e.speed * slowMult * dt))
    } else if (gateDist > 0) {
      e.x -= e.speed * slowMult * dt
      // Steer toward the gate's vertical band — top/bottom spawns angle inward
      // as they march, so they converge on the centred gate rather than the
      // whole height (still spread WITHIN the band, so it doesn't single-file).
      const bandY = Math.max(GATE_Y - GATE_BAND, Math.min(GATE_Y + GATE_BAND, e.y))
      if (bandY !== e.y) {
        const step = e.speed * 0.7 * slowMult * dt
        e.y += Math.sign(bandY - e.y) * Math.min(Math.abs(bandY - e.y), step)
      }
      e.y += Math.sin(engineNow * 2 + e.id) * 1.2 * dt // lively wiggle
    } else if (e.cooldown <= 0) {
      // Bash the gate. Damage is a FIXED fraction of the gate's max (not the
      // enemy's wave-scaled atk), so the gate always survives exactly 25 normal
      // hits / 5 boss hits — late-game enemies can never one-shot it.
      e.cooldown = e.attackInterval
      e.striking = true
      const gateDmg = e.boss ? GATE_MAX / 5 : GATE_MAX / 25
      gateHp.value = Math.max(0, gateHp.value - gateDmg)
      emit({ type: 'gateHit', amount: gateDmg })
      if (gateHp.value <= 0) { triggerOverrun(); return }
    }
  }
  removeDeadEnemies()
}

const stepProjectiles = (dt: number): void => {
  if (!projectiles.value.length) return
  let changed = false
  const keep: Projectile[] = []
  for (const p of projectiles.value) {
    const target = p.fromFighter
      ? enemies.value.find((e) => e.id === p.targetId && e.hp > 0)
      : fighters.value.find((f) => f.id === p.targetId && f.hp > 0)
    if (!target) { changed = true; continue } // fizzle
    const tScale = p.fromFighter ? (target as Enemy).scale : getFighterDef((target as Fighter).tier).scale
    // Aim at the scattered point on the body, not dead-centre.
    const dx = (target.x + p.jitterX) - p.x
    const dy = (bodyY(target.y, tScale) + p.jitterY) - p.y
    const dist = Math.hypot(dx, dy)
    const step = p.speed * dt
    if (dist <= step + 2) {
      changed = true
      if (p.fromFighter) {
        landFighterHit({ tier: p.sourceTier, x: p.x, y: p.y }, target as Enemy, p.dmg, p.element, p.x, p.y)
      } else {
        const f = target as Fighter
        const dmg = fighterDamage(f, p.dmg)
        f.hp -= dmg
        emit({ type: 'impact', x: f.x, y: bodyY(f.y, getFighterDef(f.tier).scale), color: p.color, element: p.element, target: 'fighter' })
        emit({ type: 'number', x: f.x, y: f.y - 5, amount: Math.round(dmg), variant: 'dmg' })
        if (mutator.value === 'frostMarch') f.cooldown = Math.min(3, Math.max(f.cooldown, 0) + 0.5)
      }
      continue
    }
    p.x += (dx / dist) * step
    p.y += (dy / dist) * step
    keep.push(p)
  }
  if (changed) {
    projectiles.value = keep
    triggerRef(projectiles)
  }
}

const step = (dt: number): void => {
  engineNow += dt

  // Revive Guard window countdown → wings vanish when it lapses.
  if (reviveGuardActive.value) {
    reviveGuardRemainingMs.value = Math.max(0, Math.round((reviveGuardUntil - engineNow) * 1000))
    if (engineNow >= reviveGuardUntil) endReviveGuard()
  }
  // Defender tank expiry → revert stats + shed the crest.
  let tankChanged = false
  for (const f of fighters.value) {
    if (f.tankUntil > 0 && engineNow >= f.tankUntil) { revertTank(f); tankChanged = true }
  }
  if (tankChanged) triggerRef(fighters)

  // Warcry window, the legion's lifetime, the mark's hold.
  tickSkills()

  tickCompanions()

  tickChallenge(dt)

  // Combo decay + fever expiry.
  if (combo.value > 0 && !feverActive.value) {
    comboTimer -= dt
    if (comboTimer <= 0) combo.value = 0
  }
  if (feverActive.value && engineNow >= feverUntil) {
    feverActive.value = false
    combo.value = 0
  }

  tickMeteors()

  switch (wavePhase.value) {
    case 'countdown':
      countdown.value -= dt
      if (countdown.value <= 0) beginWave()
      break
    case 'fighting': {
      waveElapsed += dt
      // Open / close the current subwave's portal around its spawn window.
      const pw = portalWindows[portalIdx]
      if (pw) {
        if (waveElapsed >= pw.closeAt) {
          if (activePortal.value?.pos === pw.portal) activePortal.value = null
          portalIdx++
        } else if (waveElapsed >= pw.openAt && activePortal.value?.pos !== pw.portal) {
          const pos = PORTAL_POSITIONS[pw.portal]!
          activePortal.value = { pos: pw.portal, x: pos.x, y: pos.y }
        }
      }
      while (schedule.length && schedule[0]!.at <= waveElapsed) {
        const s = schedule.shift()!
        // A portal can disgorge a CLUSTER: 3% → 3, 20% → 2, else 1 — so the
        // early game isn't a trickle of lone monsters. Bosses and elite
        // champions always spawn solo (they're a single, deliberate threat).
        let count = s.count ?? 1
        if (s.count === undefined && s.kind !== 'boss' && !s.elite) {
          const r = Math.random()
          count = r < 0.03 ? 3 : r < 0.23 ? 2 : 1
        }
        for (let i = 0; i < count; i++) spawnEnemy(s.kind, s.elite ?? false, s.portal ?? 1)
      }
      stepFighters(dt)
      if (wavePhase.value !== 'fighting') break // overrun mid-step
      stepEnemies(dt)
      if (wavePhase.value !== 'fighting') break
      stepProjectiles(dt)
      if (!schedule.length && enemies.value.length === 0) clearWave()
      break
    }
    case 'cleared':
      phaseTimer -= dt
      stepFighters(dt)
      if (phaseTimer <= 0) {
        startCountdown()
        // The ONE moment the game opens an interstitial. No-op unless the
        // cadence is due AND the provider can fill; when it does fire, the ad
        // flips the pause gate inside this call stack, so the countdown holds
        // where it is and resumes on close.
        playCountdownInterstitial()
      }
      break
    case 'overrun':
      phaseTimer -= dt
      if (phaseTimer <= 0) resetAfterOverrun()
      break
  }
}

// ─── RAF driver ──────────────────────────────────────────────────────────────
let raf = 0
let lastT = 0
let acc = 0
let engineRefs = 0

const frame = (t: number): void => {
  raf = requestAnimationFrame(frame)
  const realDt = lastT ? Math.min((t - lastT) / 1000, 0.1) : LOGIC_STEP
  lastT = t
  if (isGamePaused.value) return

  // Past the pause gate ⇒ this is real, active gameplay time: advance the
  // break-paced interstitial clock. It only decides WHEN an ad becomes owed;
  // the ad itself fires at the next wave clear / run loss, never here.
  tickBreakInterstitial(realDt)

  // 2× Damage buff countdown (UI chip reads the ref; 0 ⇔ expired).
  const dmgRemaining = Math.max(0, dmgBuffUntil.value - Date.now())
  if (dmgRemaining !== dmgBuffRemainingMs.value) dmgBuffRemainingMs.value = dmgRemaining

  // 3× Coin buff drains on PLAY time — this line is past the pause gate, so a
  // menu / ad / hidden tab freezes the clock instead of burning the reward.
  tickCoinBuff(realDt * 1000)
  // Soul Pact's 3-minute cooldown, on the same play-time clock.
  tickPactCooldown(realDt * 1000)

  // Keep the rubber-band flag in sync so it flips false the moment the 15-min
  // catch-up window lapses (enemy spawns read `rubberBandUntil` live regardless).
  const rbLive = rubberBandUntil.value > Date.now()
  if (rbLive !== rubberBandActive.value) rubberBandActive.value = rbLive

  // Slow-mo runs on real time so it always recovers.
  if (slowmoRealLeft > 0) {
    slowmoRealLeft -= realDt
    if (slowmoRealLeft <= 0) timescale.value = 1
  }

  acc += realDt * timescale.value
  let steps = 0
  while (acc >= LOGIC_STEP && steps < 6) {
    step(LOGIC_STEP)
    acc -= LOGIC_STEP
    steps++
  }
  if (steps === 6) acc = 0 // dropped frames — don't spiral
  if (renderSink) renderSink()
}

export const startBattle = (): void => {
  engineRefs++
  if (engineRefs === 1) {
    lastT = 0
    acc = 0
    raf = requestAnimationFrame(frame)
  }
}

export const stopBattle = (): void => {
  engineRefs = Math.max(0, engineRefs - 1)
  if (engineRefs === 0) {
    cancelAnimationFrame(raf)
    activePortal.value = null
    persistBattle()
    persistArmy()
  }
}

// ─── Boot: restore the persisted army at the guard line, full HP ────────────
const restoreArmy = (): void => {
  const saved = getState<unknown>(BATTLE_ARMY_KEY, [])
  if (!Array.isArray(saved)) return
  const tiers = saved
    .map((t) => Math.floor(Number(t)))
    // Allow tiers past the authored art (merging is uncapped); reject only junk.
    .filter((t) => Number.isFinite(t) && t >= 1 && t <= 999)
    .slice(0, ARMY_CAP)
  fighters.value = tiers.map((tier, i) => makeFighter(tier, GUARD_X, guardY(i)))
  triggerRef(fighters)
}
restoreArmy()

// ─── Save hydration ──────────────────────────────────────────────────────────
// All of the engine's persisted refs initialise at MODULE IMPORT — but the
// SaveManager may patch/hydrate localStorage after module init (import order
// is bundle-dependent), leaving these refs on defaults. Without a re-read the
// engine would then PERSIST those defaults over the real save at the next
// checkpoint — losing wave, best wave, stats and upgrades on a refresh.
// Adoption is forward-only: hydrated values are taken when they're AHEAD of
// the live session, so a mid-session hydrate can never regress active play.
const refreshFromBlob = (): void => {
  const savedBest = readWave(BATTLE_BEST_WAVE_KEY, 1)
  if (savedBest > bestWave.value) bestWave.value = savedBest
  // Current wave only jumps while idling between waves — never mid-fight.
  const savedWave = readWave(BATTLE_WAVE_KEY, 1)
  if (savedWave > wave.value && wavePhase.value === 'countdown') wave.value = savedWave

  const savedStats = { ...defaultStats(), ...(getState<Partial<BattleStats>>(PRISM_STATS_KEY, {}) ?? {}) }
  const mergedStats = { ...stats.value }
  let statsChanged = false
  for (const k of Object.keys(mergedStats) as (keyof BattleStats)[]) {
    if ((savedStats[k] ?? 0) > mergedStats[k]) { mergedStats[k] = savedStats[k]; statsChanged = true }
  }
  if (statsChanged) stats.value = mergedStats

  const savedUps = sanitizeUpgrades(getState(BATTLE_UPGRADES_KEY, {}))
  const mergedUps = { ...battleUpgrades.value }
  let upsChanged = false
  for (const k of Object.keys(mergedUps) as BattleUpgradeId[]) {
    if (savedUps[k] > mergedUps[k]) { mergedUps[k] = savedUps[k]; upsChanged = true }
  }
  if (upsChanged) battleUpgrades.value = mergedUps

  const savedUlt = Math.max(0, Math.min(ULT_MAX, Number(getState(BATTLE_ULT_KEY, 0)) || 0))
  if (savedUlt > ultCharge.value) ultCharge.value = savedUlt
  // Spell unlocks are sticky (never un-buy); charges take the higher value.
  if (getState<boolean>(BATTLE_HEAL_UNLOCKED_KEY, false) === true) healUnlocked.value = true
  if (getState<boolean>(BATTLE_REVIVE_UNLOCKED_KEY, false) === true) reviveUnlocked.value = true
  if (getState<boolean>(BATTLE_DEFENDER_UNLOCKED_KEY, false) === true) defenderUnlocked.value = true
  healCharge.value = Math.max(healCharge.value, clampCharge(getState(BATTLE_HEAL_CHARGE_KEY, 0)))
  reviveCharge.value = Math.max(reviveCharge.value, clampCharge(getState(BATTLE_REVIVE_CHARGE_KEY, 0)))
  defenderCharge.value = Math.max(defenderCharge.value, clampCharge(getState(BATTLE_DEFENDER_CHARGE_KEY, 0)))
  if (getState<boolean>(BATTLE_WARCRY_UNLOCKED_KEY, false) === true) warcryUnlocked.value = true
  if (getState<boolean>(BATTLE_LEGION_UNLOCKED_KEY, false) === true) legionUnlocked.value = true
  if (getState<boolean>(BATTLE_MARK_UNLOCKED_KEY, false) === true) markUnlocked.value = true
  if (getState<boolean>(BATTLE_PACT_UNLOCKED_KEY, false) === true) pactUnlocked.value = true
  warcryCharge.value = Math.max(warcryCharge.value, clampCharge(getState(BATTLE_WARCRY_CHARGE_KEY, 0)))
  legionCharge.value = Math.max(legionCharge.value, clampCharge(getState(BATTLE_LEGION_CHARGE_KEY, 0)))
  markCharge.value = Math.max(markCharge.value, clampCharge(getState(BATTLE_MARK_CHARGE_KEY, 0)))
  // Soul Pact's cooldown takes the LONGER of local vs cloud: a boot on module
  // defaults reads 0, and adopting that over a real pending cooldown would hand
  // out a free cast on every device switch.
  const savedPactCd = clampPactCd(getState(BATTLE_PACT_COOLDOWN_KEY, 0))
  if (savedPactCd > pactCooldownMs.value) pactCooldownMs.value = savedPactCd
  // Spell-toast cast counts only ever grow — take the higher of local/cloud per id.
  const savedCasts = getState<Record<string, number>>(BATTLE_SPELL_CASTS_KEY, {})
  const mergedCasts = { ...spellCasts.value }
  for (const id in savedCasts) mergedCasts[id] = Math.max(mergedCasts[id] ?? 0, savedCasts[id] ?? 0)
  spellCasts.value = mergedCasts
  const savedDmgBuff = Number(getState(BATTLE_DMG_BUFF_KEY, 0)) || 0
  if (savedDmgBuff > dmgBuffUntil.value) dmgBuffUntil.value = savedDmgBuff
  const savedRubberBand = Number(getState(BATTLE_RUBBER_BAND_KEY, 0)) || 0
  if (savedRubberBand > rubberBandUntil.value) {
    rubberBandUntil.value = savedRubberBand
    rubberBandActive.value = rubberBandUntil.value > Date.now()
  }
  // Coin buff is stored as remaining PLAY time, so "more is newer" — take the
  // larger of local vs cloud so a sync can't shorten a buff the player earned.
  const savedCoinBuff = Math.max(0, Number(getState(BATTLE_COIN_BUFF_KEY, 0)) || 0)
  if (savedCoinBuff > coinBuffRemainingMs.value) coinBuffRemainingMs.value = savedCoinBuff

  // Army: only when nothing is fielded (the boot-hydration case).
  if (fighters.value.length === 0) restoreArmy()
}
watch(saveDataVersion, refreshFromBlob)

// ─── Public composable surface ───────────────────────────────────────────────
const useBattle = () => ({
  // entities
  fighters, enemies, projectiles, activePortal,
  // HUD state
  wave, bestWave, wavePhase, countdown, gateHp, gateMax, combo, feverActive,
  ultCharge, ultMax, ultReady, boss, timescale, armyCount, armyFull, stats,
  mutator, waveMutated, rallyOffer, dmgBuffRemainingMs, challengeMult, canSetback,
  coinBuffRemainingMs, isCoinBuffActive, coinBuffMult,
  // unlockable spells
  spellMax, healUnlocked, reviveUnlocked, defenderUnlocked,
  healCharge, reviveCharge, defenderCharge,
  healReady, reviveReady, defenderReady, hasTankTarget,
  healUnlockCost, reviveUnlockCost, defenderUnlockCost,
  reviveGuardActive, reviveGuardRemainingMs,
  // arena skills, slots 5–8
  warcryUnlocked, legionUnlocked, markUnlocked, pactUnlocked,
  warcryCharge, legionCharge, markCharge, pactCooldownMs,
  warcryReady, legionReady, markReady, pactReady, hasMarkTarget, hasPactPair,
  warcryUnlockCost, legionUnlockCost, markUnlockCost, pactUnlockCost,
  warcryActive, warcryRemainingMs, legionRemainingMs, markedId, markRemainingMs,
  // upgrades
  battleUpgrades, upgradeLevel, upgradeCost, canBuyUpgrade, buyUpgrade,
  isUpgradeMaxed, impCadenceMs, recruitTier, chestUnitTier, topFieldTier,
  // actions
  deployFighter, fieldMerge, fighterAt, fireUltimate, bumpStat,
  fireHeal, fireReviveGuard, fireDefender, unlockHeal, unlockReviveGuard, unlockDefender, noteSpellCast,
  fireWarcry, fireLegion, fireMark, firePact, unlockWarcry, unlockLegion, unlockMark, unlockPact,
  requestRallyHold, claimRally, declineRally, activateDamageBuff, activateCoinBuff,
  // lifecycle
  startBattle, stopBattle, setEventSink, setRenderSink, setGateEdge
})

export default useBattle

// ⚠️ DEV-ONLY TRAILER HARNESS — dead-code-eliminated from every platform build
// (`import.meta.env.DEV` is statically false there). Sets up a NATURAL wave-25
// boss fight and steps it DETERMINISTICALLY for real-gameplay video capture.
// From the DevTools console:
//   window.__trailer()      // start the wave-25 fight (boss + a handful of adds)
//   window.__advance(0.05)  // step the whole scene by dt game-seconds + render.
//                           //   The RAF's own clock is frozen so ONLY these calls
//                           //   move time → evenly spaced frames that play back
//                           //   smooth + real-time (no slow-mo, no interp mush).
//   window.__ult()          // fire the Meteor Storm ultimate
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>
  // A moderate, VFX-rich party (fire/cosmic/shadow ranged + melee) — enough to
  // fight the wave dynamically without instantly wiping it.
  const PARTY: Array<[number, number, number]> = [
    [10, 30, 32], [8, 24, 52], [7, 34, 44], [9, 20, 68], [6, 30, 72]
  ]
  const ADDS: EnemyKind[] = ['runner', 'brute', 'spitter', 'warlock', 'slime', 'runner']
  w.__trailer = (): void => {
    fighters.value = []
    enemies.value = []
    projectiles.value = []
    boss.value = null
    wave.value = 25
    wavePhase.value = 'fighting'
    for (const [tier, x, y] of PARTY) deployFighter(tier, x, y)
    // Survive the ~15s clip (not one-shot by the boss).
    fighters.value.forEach((f) => { f.maxHp *= 8; f.hp = f.maxHp })
    // Wave-25 boss + a NATURAL handful of monsters (no masses). Boss HP padded so
    // it survives the clip and its bar visibly drains as the party chips it.
    spawnEnemy('boss', false, 1)
    ADDS.forEach((k, i) => spawnEnemy(k, false, i % 3))
    enemies.value.forEach((e) => { if (e.boss) { e.maxHp *= 10; e.hp = e.maxHp } })
    ultCharge.value = ULT_MAX
    timescale.value = 1
    triggerRef(fighters); triggerRef(enemies)
  }
  // Deterministic scene stepper: advance battle + a gentle merge churn + a light
  // monster trickle (keeps ~5-6 adds, never masses) by `dt` game-seconds, render.
  let _mAcc = 0, _sAcc = 0
  w.__advance = (dt = 0.05): void => {
    timescale.value = 0 // freeze the RAF's own stepping — this call owns the clock
    step(dt)
    if (renderSink) renderSink()
    _mAcc += dt
    if (_mAcc >= 0.55) { _mAcc = 0; (window as unknown as Record<string, (() => void) | undefined>).__mergePulse?.() }
    _sAcc += dt
    if (_sAcc >= 2.8) {
      _sAcc = 0
      if (enemies.value.filter((e) => !e.boss).length < 6) {
        spawnEnemy(ADDS[(Math.random() * ADDS.length) | 0]!, false, (Math.random() * 3) | 0)
      }
    }
  }
  w.__ult = (): void => { fireUltimate() }
  // Unlock and fully charge every arena skill (slots 5–8) and clear Soul Pact's
  // cooldown — for trying the skills and their VFX without the grind.
  w.__skills = (): void => {
    for (const r of [warcryUnlocked, legionUnlocked, markUnlocked, pactUnlocked, healUnlocked, reviveUnlocked, defenderUnlocked]) r.value = true
    for (const c of [warcryCharge, legionCharge, markCharge, healCharge, reviveCharge, defenderCharge]) c.value = SPELL_MAX
    pactCooldownMs.value = 0
    ultCharge.value = ULT_MAX
  }
}

/** Advance the simulation headlessly by `secs` of engine time, in the same
 *  fixed logic steps the RAF driver takes. No render, no pause gate, no
 *  play-time clocks (coin buff, Soul Pact) — for tests and tooling. */
export const advanceBattle = (secs: number): void => {
  for (let t = 0; t < secs - 1e-9; t += LOGIC_STEP) step(LOGIC_STEP)
}

/** DEV only — the engine internals the gameplay-video seam stages a fight
 *  through (`src/dev/videoSeam.ts`). Null in every platform build. */
export const devBattle = import.meta.env.DEV
  ? {
      /** Wave `wave`, mid-fight, with an empty field and NO composed schedule:
       *  only `spawns` arrive, each out of the portal it names. */
      stageFight(o: { wave: number; gate?: number; spawns?: WaveSpawn[] }): void {
        // The engine clock and the id sequence restart too: both carry however
        // long the boot happened to take (enemies wiggle on sin(engineNow + id)),
        // and a staged fight must be the same fight on every take.
        engineNow = 0
        idSeq = 0
        wave.value = Math.max(1, Math.floor(o.wave))
        if (wave.value > bestWave.value) bestWave.value = wave.value
        fighters.value = []
        enemies.value = []
        projectiles.value = []
        boss.value = null
        pendingMeteors = []
        deadThisWave = []
        nextCompanionAt = 0
        combo.value = 0
        feverActive.value = false
        rallyOffer.value = false
        mutator.value = null
        waveMutated.value = false
        gateHp.value = Math.max(1, Math.min(GATE_MAX, o.gate ?? GATE_MAX))
        schedule = [...(o.spawns ?? [])].sort((a, b) => a.at - b.at)
        buildPortals(schedule)
        activePortal.value = null
        waveElapsed = 0
        wavePhase.value = 'fighting'
        triggerRef(fighters); triggerRef(enemies); triggerRef(projectiles)
      },
      /** A fighter at (x, y), `hp` a fraction of its max — no deploy event. */
      addFighter(tier: number, x: number, y: number, hp = 1): Fighter {
        const f = makeFighter(tier, x, y)
        f.hp = Math.max(1, Math.round(f.maxHp * hp))
        fighters.value = [...fighters.value, f]
        return f
      },
      /** An enemy of `kind` at (x, y), its HP `hp`× the wave's own. */
      addEnemy(kind: EnemyKind, x: number, y: number, hp = 1, elite = false): Enemy {
        spawnEnemy(kind, elite, 1)
        const e = enemies.value[enemies.value.length - 1]!
        e.x = x
        e.y = y
        e.maxHp = Math.max(1, Math.round(e.maxHp * hp))
        e.hp = e.maxHp
        if (e.boss && boss.value) boss.value = { ...boss.value, hp: e.hp, maxHp: e.maxHp }
        return e
      },
      /** Drop the RAF driver's leftover partial step: the next frame steps
       *  exactly once, whatever real frames came before. */
      syncClock(): void {
        acc = 0
        lastT = 0
      },
      /** Simulate `secs` with the event sink unplugged, so a staged fight can
       *  open mid-exchange without a burst of every VFX it skipped. */
      preroll(secs: number): void {
        const sink = eventSink
        eventSink = null
        try { advanceBattle(secs) } finally { eventSink = sink }
        if (renderSink) renderSink()
      }
    }
  : null
