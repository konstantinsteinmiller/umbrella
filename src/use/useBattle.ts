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
import { tickMidgameAd } from '@/use/useMidgameAdTimer'
import {
  BATTLE_UPGRADES_KEY, BATTLE_WAVE_KEY, BATTLE_BEST_WAVE_KEY, BATTLE_ARMY_KEY,
  BATTLE_ULT_KEY, PRISM_STATS_KEY, BATTLE_DMG_BUFF_KEY, BATTLE_RUBBER_BAND_KEY
} from '@/keys'
import {
  getFighterDef, ENEMY_DEFS, composeWave, isBossWave, bossName, rollMutator,
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
export const UPGRADE_MAX_LEVEL = 25

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
  | { type: 'deploy'; x: number; y: number; tier: number }
  | { type: 'fieldMerge'; x: number; y: number; tier: number }
  | { type: 'gateHit'; amount: number }
  | { type: 'overrun' }
  | { type: 'setback'; wave: number }
  | { type: 'waveStart'; wave: number; boss: boolean; mutator: WaveMutator | null }
  | { type: 'waveCleared'; wave: number; bonus: number }
  | { type: 'milestone'; wave: number; gold: number }
  | { type: 'bossKill'; x: number; y: number; bounty: number; first: boolean }
  | { type: 'enrage' }
  | { type: 'combo'; combo: number }
  | { type: 'fever' }
  | { type: 'ultReady' }
  | { type: 'meteor'; x: number; y: number }
  | { type: 'warHeal'; x: number; y: number }

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

export const RECRUIT_MAX_LEVEL = 5

export const BATTLE_UPGRADE_DEFS: Record<BattleUpgradeId, { base: number; growth: number; max: number }> = {
  attack: { base: 60, growth: 1.55, max: UPGRADE_MAX_LEVEL },
  vitality: { base: 55, growth: 1.52, max: UPGRADE_MAX_LEVEL },
  bounty: { base: 80, growth: 1.6, max: UPGRADE_MAX_LEVEL },
  automation: { base: 130, growth: 1.72, max: UPGRADE_MAX_LEVEL },
  // Recruits: each level raises the Spawn button's base tier by 1 (T1 → T6).
  // One level ≈ doubles the whole grid's merge throughput (a T2 spawn = two
  // T1 spawns pre-merged) ≈ 4–5 waves of enemy scaling — priced as milestone
  // purchases on the hand-tuned RECRUIT_COSTS ladder below (base/growth here
  // are unused for this id; `upgradeCost` special-cases it).
  recruit: { base: 5000, growth: 1, max: RECRUIT_MAX_LEVEL }
}

/** Hand-tuned Recruits prices for levels 1–5. */
const RECRUIT_COSTS = [5_000, 20_000, 50_000, 175_000, 500_000]

const sanitizeUpgrades = (u: unknown): BattleUpgrades => {
  const o = (u && typeof u === 'object') ? u as Record<string, unknown> : {}
  const clamp = (n: unknown, max: number): number => {
    const v = Math.floor(Number(n))
    return Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0
  }
  return {
    attack: clamp(o.attack, UPGRADE_MAX_LEVEL),
    vitality: clamp(o.vitality, UPGRADE_MAX_LEVEL),
    bounty: clamp(o.bounty, UPGRADE_MAX_LEVEL),
    automation: clamp(o.automation, UPGRADE_MAX_LEVEL),
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

const activateRubberBand = (): void => {
  rubberBandUntil.value = Date.now() + RUBBER_BAND_MS
  rubberBandActive.value = true
  setState(BATTLE_RUBBER_BAND_KEY, rubberBandUntil.value)
}
/** Enemy-stat multiplier: 0.75 while the catch-up window is live, else 1. */
const rubberBandMult = (): number => (rubberBandUntil.value > Date.now() ? RUBBER_BAND_MULT : 1)

const atkMult = (): number =>
  (1 + battleUpgrades.value.attack * 0.06) * (dmgBuffUntil.value > Date.now() ? 2 : 1)
const hpMult = (): number => 1 + battleUpgrades.value.vitality * 0.07
const bountyMult = (): number => 1 + battleUpgrades.value.bounty * 0.08
/** Base tier the Spawn button produces (1 + Recruits upgrade level). */
export const recruitTier = computed(() => 1 + battleUpgrades.value.recruit)
/** Imp cadence in ms for `usePrismGame`'s automation loop (0 ⇒ disabled). */
export const impCadenceMs = computed(() => {
  const lvl = battleUpgrades.value.automation
  return lvl <= 0 ? 0 : Math.max(700, 4200 / (1 + lvl * 0.22))
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
  return Math.max(1, Math.round(def.base * Math.pow(def.growth, battleUpgrades.value[id])))
}
export const canBuyUpgrade = (id: BattleUpgradeId): boolean =>
  !isUpgradeMaxed(id) && gold.value >= upgradeCost(id)
export const buyUpgrade = (id: BattleUpgradeId): boolean => {
  if (isUpgradeMaxed(id)) return false
  if (!spendCoins(upgradeCost(id))) return false
  battleUpgrades.value = { ...battleUpgrades.value, [id]: battleUpgrades.value[id] + 1 }
  setState(BATTLE_UPGRADES_KEY, battleUpgrades.value)
  // Vitality retro-applies to the standing army (heal by the delta).
  if (id === 'vitality') {
    for (const f of fighters.value) {
      const def = getFighterDef(f.tier)
      const newMax = Math.round(def.hp * hpMult())
      f.hp = Math.min(newMax, f.hp + (newMax - f.maxHp))
      f.maxHp = newMax
    }
    triggerRef(fighters)
  }
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
export const boss = ref<{ nameKey: string; cycle: number; hp: number; maxHp: number; enraged: boolean } | null>(null)
export const timescale = ref(1)
/** Active wave mutator (retention-roadmap #13); null on plain/boss waves. */
export const mutator = ref<WaveMutator | null>(null)
/** RALLY! rewarded revive offer is on screen (retention-roadmap #8). */
export const rallyOffer = ref(false)

export const fighters = shallowRef<Fighter[]>([])
export const enemies = shallowRef<Enemy[]>([])
export const projectiles = shallowRef<Projectile[]>([])
export const armyCount = computed(() => fighters.value.length)
export const armyFull = computed(() => fighters.value.length >= ARMY_CAP)

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
}
const persistArmy = (): void => setState(BATTLE_ARMY_KEY, fighters.value.map((f) => f.tier))

// ─── Spawning / deploying ────────────────────────────────────────────────────
const guardY = (idx: number): number => 18 + ((idx * 37) % 68)

const makeFighter = (tier: number, x: number, y: number): Fighter => {
  const def = getFighterDef(tier)
  const maxHp = Math.round(def.hp * hpMult())
  return {
    id: ++idSeq, tier,
    x: Math.max(4, Math.min(60, x)), y: Math.max(8, Math.min(92, y)),
    hp: maxHp, maxHp, cooldown: Math.random() * 0.4, abilityCd: 3, striking: false,
    targetId: 0
  }
}

/** Deploy a merged unit onto the battlefield. Returns false when the army is
 *  at cap (the caller then bounces the drop). */
export const deployFighter = (tier: number, xNorm?: number, yNorm?: number): boolean => {
  if (fighters.value.length >= ARMY_CAP) return false
  const f = makeFighter(tier, xNorm ?? GUARD_X, yNorm ?? guardY(fighters.value.length))
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
  // past the authored tiers via getFighterDef / getIngredient).
  if (!f || f.tier !== tier) return false
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
 *  a finger drop on any part of the unit should land the merge. */
export const fighterAt = (xNorm: number, yNorm: number, radius = 13): Fighter | null => {
  let best: Fighter | null = null
  let bestD = radius
  for (const f of fighters.value) {
    const d = Math.hypot(f.x - xNorm, f.y - 5 - yNorm)
    if (d < bestD) { bestD = d; best = f }
  }
  return best
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
    const startNew = portalWindows.length === 0 || s.at - prevAt > SUBWAVE_GAP || s.at - groupStart > PORTAL_MAX_OPEN
    if (startNew) {
      const portal = s.kind === 'boss' ? 1 : (lastPortal + 1 + ((Math.random() * 2) | 0)) % 3
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
    boss: kind === 'boss', elite, enraged: false, striking: false
  }
  enemies.value = [...enemies.value, e]
  triggerRef(enemies)
  if (e.boss) {
    const bn = bossName(w)
    boss.value = { nameKey: bn.key, cycle: bn.cycle, hp: e.hp, maxHp: e.maxHp, enraged: false }
  }
}

// ─── Combat helpers ──────────────────────────────────────────────────────────
const FIGHTER_GLOWS = ['#ff7a3c', '#bfe6ff', '#c8a97e', '#9fd8ff', '#7fd6ff', '#ff9a3c', '#8a6cff', '#b45cff', '#ffe27a', '#ff8a3c', '#ff7a2e']
const glowOf = (tier: number): string => FIGHTER_GLOWS[Math.max(0, Math.min(FIGHTER_GLOWS.length - 1, tier - 1))]!

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
  const goldRush = mutator.value === 'goldRush' ? 2 : 1
  const payout = Math.max(1, Math.round(e.bounty * bountyMult() * comboGoldMult() * goldRush))
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
  bumpStat('kills')
  emit({ type: 'death', x: e.x, y: e.y, kind: e.kind, bounty: payout, boss: e.boss, id: e.id })
  emit({ type: 'number', x: e.x, y: e.y - 6, amount: payout, variant: 'gold' })
  if (e.boss) {
    // The FIRST boss kill ever is a scripted spectacle (retention-roadmap #2):
    // deeper slow-mo held longer; the arena boosts the particle/coin theatre.
    const first = stats.value.bossKills === 0
    boss.value = null
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

const hurtEnemy = (e: Enemy, amount: number, variant: 'dmg' | 'crit' | 'burn' | 'poison' = 'dmg'): void => {
  if (e.hp <= 0) return
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
const playerPower = (): number => {
  let dps = 0
  let hp = 0
  for (const f of fighters.value) {
    if (f.hp <= 0) continue
    const def = getFighterDef(f.tier)
    dps += (def.atk * atkMult()) / def.attackInterval
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

export const fireUltimate = (): boolean => {
  if (ultCharge.value < ULT_MAX || wavePhase.value === 'overrun') return false
  ultCharge.value = 0
  persistBattle()
  pendingMeteors = []
  for (let i = 0; i < METEOR_COUNT; i++) {
    pendingMeteors.push({ at: engineNow + 0.15 + i * 0.18 })
  }
  return true
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
  wavePhase.value = 'fighting'
  emit({ type: 'waveStart', wave: wave.value, boss: isBossWave(wave.value), mutator: mutator.value })
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
  for (const tier of deadThisWave) {
    if (!deployFighter(tier)) break
    revived++
  }
  deadThisWave = []
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
const stepFighters = (dt: number): void => {
  let removed = false
  // Fresh claim tally per step — earlier fighters in the array claim first,
  // later ones route around crowded targets (see pickTarget).
  const claims = new Map<number, number>()
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

    const target = pickTarget(f, claims)
    if (!target) {
      f.targetId = 0
      // No enemies → drift back to the guard line (kept clear of the gate).
      const gx = fighterGuardX()
      const dx = gx - f.x
      if (Math.abs(dx) > 1) f.x += Math.sign(dx) * def.speed * dt
      continue
    }
    f.targetId = target.id
    claims.set(target.id, (claims.get(target.id) ?? 0) + 1)
    const dist = Math.hypot(target.x - f.x, (target.y - f.y) * 0.8)
    if (dist > def.range) {
      const nx = (target.x - f.x) / (dist || 1)
      const ny = (target.y - f.y) / (dist || 1)
      f.x = Math.max(fighterGuardX(), Math.min(96, f.x + nx * def.speed * dt))
      f.y = Math.max(6, Math.min(94, f.y + ny * def.speed * dt))
    } else if (f.cooldown <= 0) {
      const interval = def.attackInterval / (feverActive.value ? FEVER_ATK_SPEED : 1)
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
  // enough to hold a melee unit out of range.
  const SEP_DIST = 7.5
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
  // Bury the fallen (buffered per wave for the RALLY! revive offer).
  const alive = fighters.value.filter((f) => {
    if (f.hp > 0) return true
    emit({ type: 'fighterDeath', x: f.x, y: f.y, tier: f.tier, id: f.id })
    deadThisWave.push(f.tier)
    removed = true
    return false
  })
  if (removed) {
    fighters.value = alive
    triggerRef(fighters)
    persistArmy()
  }
}

const stepEnemies = (dt: number): void => {
  for (const e of enemies.value) {
    e.striking = false
    if (e.hp <= 0) continue
    e.cooldown -= dt
    e.abilityCd -= dt

    // Status DoTs.
    if (e.burnUntil > engineNow) {
      e.hp -= e.burnDps * dt
      if (Math.random() < dt * 2) emit({ type: 'number', x: e.x, y: e.y - 4, amount: Math.max(1, Math.round(e.burnDps * 0.5)), variant: 'burn' })
    }
    if (e.poisonUntil > engineNow && e.poisonStacks > 0) {
      const dps = e.poisonStacks * e.maxHp * 0.01 + e.poisonStacks * 2
      e.hp -= dps * dt
      if (Math.random() < dt * 2) emit({ type: 'number', x: e.x, y: e.y - 4, amount: Math.max(1, Math.round(dps * 0.5)), variant: 'poison' })
    }
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
          target.hp -= e.atk
          emit({ type: 'number', x: target.x, y: target.y - 5, amount: e.atk, variant: 'dmg' })
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
      // Bash the gate.
      e.cooldown = e.attackInterval
      e.striking = true
      gateHp.value = Math.max(0, gateHp.value - e.atk)
      emit({ type: 'gateHit', amount: e.atk })
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
        f.hp -= p.dmg
        emit({ type: 'impact', x: f.x, y: bodyY(f.y, getFighterDef(f.tier).scale), color: p.color, element: p.element, target: 'fighter' })
        emit({ type: 'number', x: f.x, y: f.y - 5, amount: p.dmg, variant: 'dmg' })
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
        spawnEnemy(s.kind, s.elite ?? false, s.portal ?? 1)
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
      if (phaseTimer <= 0) startCountdown()
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
  // periodic midgame-ad clock (fires an interstitial every 121s of play).
  tickMidgameAd(realDt)

  // 2× Damage buff countdown (UI chip reads the ref; 0 ⇔ expired).
  const dmgRemaining = Math.max(0, dmgBuffUntil.value - Date.now())
  if (dmgRemaining !== dmgBuffRemainingMs.value) dmgBuffRemainingMs.value = dmgRemaining

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
  const savedDmgBuff = Number(getState(BATTLE_DMG_BUFF_KEY, 0)) || 0
  if (savedDmgBuff > dmgBuffUntil.value) dmgBuffUntil.value = savedDmgBuff
  const savedRubberBand = Number(getState(BATTLE_RUBBER_BAND_KEY, 0)) || 0
  if (savedRubberBand > rubberBandUntil.value) {
    rubberBandUntil.value = savedRubberBand
    rubberBandActive.value = rubberBandUntil.value > Date.now()
  }

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
  mutator, rallyOffer, dmgBuffRemainingMs, challengeMult,
  // upgrades
  battleUpgrades, upgradeLevel, upgradeCost, canBuyUpgrade, buyUpgrade,
  isUpgradeMaxed, impCadenceMs,
  // actions
  deployFighter, fieldMerge, fighterAt, fireUltimate, bumpStat,
  requestRallyHold, claimRally, declineRally, activateDamageBuff,
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
}
