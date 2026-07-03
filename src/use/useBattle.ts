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

import { ref, shallowRef, computed, triggerRef } from 'vue'
import { getState, setState, flushPersist } from '@/use/useEpicState'
import useEpicConfig from '@/use/useEpicConfig'
import { isGamePaused } from '@/use/useGamePause'
import {
  BATTLE_UPGRADES_KEY, BATTLE_WAVE_KEY, BATTLE_BEST_WAVE_KEY, BATTLE_ARMY_KEY,
  BATTLE_ULT_KEY, PRISM_STATS_KEY
} from '@/keys'
import {
  getFighterDef, ENEMY_DEFS, composeWave, isBossWave, bossName,
  waveHp, waveAtk, waveBounty, waveClearBonus,
  type EnemyKind, type WaveSpawn, type FighterAbility
} from '@/game/units'

// ─── Tunables ────────────────────────────────────────────────────────────────
export const ARMY_CAP = 7
const ENEMY_CAP = 24
const PROJECTILE_CAP = 24
const LOGIC_STEP = 1 / 30
const GATE_MAX = 100
const GATE_X = 3
const GUARD_X = 16
const COMBO_WINDOW = 2.5
const FEVER_AT = 10
const FEVER_SECS = 8
const FEVER_ATK_SPEED = 1.6
const ULT_MAX = 100
const ULT_PER_KILL = 6
const ULT_PER_BOSS = 30
const METEOR_COUNT = 7
const COUNTDOWN_SECS = 3.5
const OVERRUN_SECS = 2.5
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
  boss: boolean
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
}

// ─── Events (view drains these for numbers / particles / SFX) ────────────────
export type BattleEvent =
  | { type: 'number'; x: number; y: number; amount: number; variant: 'dmg' | 'crit' | 'heal' | 'burn' | 'poison' | 'gold' }
  | { type: 'strike'; id: number; x: number; y: number; tier: number }
  | { type: 'shot'; x: number; y: number; color: string }
  | { type: 'impact'; x: number; y: number; color: string }
  | { type: 'splash'; x: number; y: number; color: string }
  | { type: 'chain'; points: { x: number; y: number }[] }
  | { type: 'nova'; x: number; y: number }
  | { type: 'blackhole'; x: number; y: number }
  | { type: 'death'; x: number; y: number; kind: EnemyKind; bounty: number; boss: boolean }
  | { type: 'fighterDeath'; x: number; y: number; tier: number }
  | { type: 'deploy'; x: number; y: number; tier: number }
  | { type: 'fieldMerge'; x: number; y: number; tier: number }
  | { type: 'gateHit'; amount: number }
  | { type: 'overrun' }
  | { type: 'waveStart'; wave: number; boss: boolean }
  | { type: 'waveCleared'; wave: number; bonus: number }
  | { type: 'bossKill'; x: number; y: number; bounty: number }
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
export type BattleUpgradeId = 'attack' | 'vitality' | 'bounty' | 'automation'
export type BattleUpgrades = Record<BattleUpgradeId, number>

export const BATTLE_UPGRADE_DEFS: Record<BattleUpgradeId, { base: number; growth: number }> = {
  attack: { base: 60, growth: 1.55 },
  vitality: { base: 55, growth: 1.52 },
  bounty: { base: 80, growth: 1.6 },
  automation: { base: 130, growth: 1.72 }
}

const sanitizeUpgrades = (u: unknown): BattleUpgrades => {
  const o = (u && typeof u === 'object') ? u as Record<string, unknown> : {}
  const clamp = (n: unknown): number => {
    const v = Math.floor(Number(n))
    return Number.isFinite(v) ? Math.max(0, Math.min(UPGRADE_MAX_LEVEL, v)) : 0
  }
  return { attack: clamp(o.attack), vitality: clamp(o.vitality), bounty: clamp(o.bounty), automation: clamp(o.automation) }
}

export const battleUpgrades = ref<BattleUpgrades>(sanitizeUpgrades(getState(BATTLE_UPGRADES_KEY, {})))

const atkMult = (): number => 1 + battleUpgrades.value.attack * 0.06
const hpMult = (): number => 1 + battleUpgrades.value.vitality * 0.07
const bountyMult = (): number => 1 + battleUpgrades.value.bounty * 0.08
/** Imp cadence in ms for `usePrismGame`'s automation loop (0 ⇒ disabled). */
export const impCadenceMs = computed(() => {
  const lvl = battleUpgrades.value.automation
  return lvl <= 0 ? 0 : Math.max(700, 4200 / (1 + lvl * 0.22))
})

const { coins: gold, addCoins, spendCoins } = useEpicConfig()

export const upgradeLevel = (id: BattleUpgradeId): number => battleUpgrades.value[id]
export const isUpgradeMaxed = (id: BattleUpgradeId): boolean => battleUpgrades.value[id] >= UPGRADE_MAX_LEVEL
export const upgradeCost = (id: BattleUpgradeId): number => {
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
}
const defaultStats = (): BattleStats => ({ kills: 0, bossKills: 0, waves: 0, merges: 0, spawns: 0, fieldMerges: 0 })
export const stats = ref<BattleStats>({ ...defaultStats(), ...(getState<Partial<BattleStats>>(PRISM_STATS_KEY, {}) ?? {}) })
const persistStats = (): void => setState(PRISM_STATS_KEY, stats.value)
export const bumpStat = (key: keyof BattleStats, n = 1): void => {
  stats.value = { ...stats.value, [key]: stats.value[key] + n }
  persistStats()
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
export const countdown = ref(COUNTDOWN_SECS)
export const gateHp = ref(GATE_MAX)
export const gateMax = GATE_MAX
export const combo = ref(0)
export const feverActive = ref(false)
export const ultCharge = ref(Math.max(0, Math.min(ULT_MAX, Number(getState(BATTLE_ULT_KEY, 0)) || 0)))
export const ultMax = ULT_MAX
export const boss = ref<{ name: string; hp: number; maxHp: number; enraged: boolean } | null>(null)
export const timescale = ref(1)

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
let waveElapsed = 0
let phaseTimer = 0
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
    hp: maxHp, maxHp, cooldown: Math.random() * 0.4, abilityCd: 3, striking: false
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
  return true
}

/** Field merge: feed a grid unit of the same tier into a deployed fighter →
 *  tier+1, full heal. Returns false if tiers mismatch or already max tier. */
export const fieldMerge = (fighterId: number, tier: number): boolean => {
  const f = fighters.value.find((x) => x.id === fighterId)
  if (!f || f.tier !== tier || tier >= 10) return false
  const def = getFighterDef(tier + 1)
  f.tier = tier + 1
  f.maxHp = Math.round(def.hp * hpMult())
  f.hp = f.maxHp
  triggerRef(fighters)
  persistArmy()
  bumpStat('fieldMerges')
  emit({ type: 'fieldMerge', x: f.x, y: f.y, tier: f.tier })
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

const spawnEnemy = (kind: EnemyKind): void => {
  if (enemies.value.length >= ENEMY_CAP) { schedule.unshift({ kind, at: waveElapsed + 0.8 }); return }
  const def = ENEMY_DEFS[kind]
  const w = wave.value
  const maxHp = Math.round(waveHp(w) * def.hpMult)
  const e: Enemy = {
    id: ++idSeq, kind,
    x: 103 + Math.random() * 4,
    y: kind === 'boss' ? 50 : 12 + Math.random() * 76,
    hp: maxHp, maxHp,
    atk: Math.round(waveAtk(w) * def.atkMult),
    speed: def.speed * (1 + Math.min(0.5, w / 60)),
    range: def.range, attackInterval: def.attackInterval,
    bounty: Math.round(waveBounty(w) * def.bountyMult),
    scale: def.scale,
    cooldown: 0, abilityCd: 3,
    slowUntil: 0, stunUntil: 0,
    burnDps: 0, burnUntil: 0, poisonStacks: 0, poisonUntil: 0,
    boss: kind === 'boss', enraged: false, striking: false
  }
  enemies.value = [...enemies.value, e]
  triggerRef(enemies)
  if (e.boss) boss.value = { name: bossName(w), hp: e.hp, maxHp: e.maxHp, enraged: false }
}

// ─── Combat helpers ──────────────────────────────────────────────────────────
const FIGHTER_GLOWS = ['#ff6b5e', '#ff9a3c', '#bfe6ff', '#5fe06f', '#ff8a1f', '#aaff3c', '#5cf0ff', '#bfe6ff', '#ffe27a', '#a05cff']
const glowOf = (tier: number): string => FIGHTER_GLOWS[Math.max(0, Math.min(9, tier - 1))]!

const comboGoldMult = (): number => (1 + 0.1 * combo.value) * (feverActive.value ? 2 : 1)

const registerKill = (e: Enemy): void => {
  const payout = Math.max(1, Math.round(e.bounty * bountyMult() * comboGoldMult()))
  addCoins(payout)
  combo.value = Math.min(99, combo.value + 1)
  comboTimer = COMBO_WINDOW
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
  emit({ type: 'death', x: e.x, y: e.y, kind: e.kind, bounty: payout, boss: e.boss })
  emit({ type: 'number', x: e.x, y: e.y - 6, amount: payout, variant: 'gold' })
  if (e.boss) {
    boss.value = null
    bumpStat('bossKills')
    timescale.value = 0.35
    slowmoRealLeft = 0.9
    emit({ type: 'bossKill', x: e.x, y: e.y, bounty: payout })
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

const nearestEnemy = (x: number, y: number): Enemy | null => {
  let best: Enemy | null = null
  let bestD = Infinity
  for (const e of enemies.value) {
    if (e.hp <= 0 || e.x > 101) continue
    const d = Math.hypot(e.x - x, (e.y - y) * 0.8)
    if (d < bestD) { bestD = d; best = e }
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

/** Resolve one fighter hit landing on an enemy (melee or projectile). */
const landFighterHit = (f: { tier: number; x: number; y: number }, e: Enemy, dmg: number): void => {
  const def = getFighterDef(f.tier)
  const critChance = def.ability === 'midas' ? 0.25 : 0.08
  const crit = Math.random() < critChance
  const critMult = def.ability === 'midas' ? 3 : 2
  const final = dmg * (crit ? critMult : 1)
  emit({ type: 'impact', x: e.x, y: e.y, color: glowOf(f.tier) })
  hurtEnemy(e, final, crit ? 'crit' : 'dmg')

  switch (def.ability) {
    case 'burn':
      e.burnDps = dmg * 0.35
      e.burnUntil = engineNow + 3
      break
    case 'knockback':
      e.x = Math.min(104, e.x + 6)
      e.stunUntil = Math.max(e.stunUntil, engineNow + 0.15)
      break
    case 'poison':
      e.poisonStacks = Math.min(5, e.poisonStacks + 1)
      e.poisonUntil = engineNow + 4
      break
    case 'splash': {
      emit({ type: 'splash', x: e.x, y: e.y, color: '#ff8a1f' })
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
}

const beginWave = (): void => {
  schedule = composeWave(wave.value)
  waveElapsed = 0
  wavePhase.value = 'fighting'
  emit({ type: 'waveStart', wave: wave.value, boss: isBossWave(wave.value) })
}

const clearWave = (): void => {
  const bonus = Math.round(waveClearBonus(wave.value) * bountyMult() * (feverActive.value ? 2 : 1))
  addCoins(bonus)
  emit({ type: 'waveCleared', wave: wave.value, bonus })
  bumpStat('waves')
  wave.value += 1
  if (wave.value > bestWave.value) bestWave.value = wave.value
  gateHp.value = Math.min(GATE_MAX, gateHp.value + GATE_MAX * 0.25)
  persistBattle()
  flushPersist() // a cleared wave is real progress — checkpoint now
  wavePhase.value = 'cleared'
  phaseTimer = 1.6
}

const triggerOverrun = (): void => {
  wavePhase.value = 'overrun'
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
  startCountdown()
}

// ─── Logic step ──────────────────────────────────────────────────────────────
const stepFighters = (dt: number): void => {
  let removed = false
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
    } else if (def.ability === 'blackhole' && f.abilityCd <= 0 && enemies.value.length) {
      f.abilityCd = 6
      const cx = Math.min(80, f.x + 24)
      const cy = f.y
      emit({ type: 'blackhole', x: cx, y: cy })
      const dmg = Math.round(def.atk * atkMult() * 1.5)
      for (const e of enemies.value) {
        if (e.hp <= 0 || e.boss) {
          if (e.boss && Math.hypot(e.x - cx, e.y - cy) <= 30) hurtEnemy(e, dmg)
          continue
        }
        if (Math.hypot(e.x - cx, e.y - cy) <= 30) {
          e.x += (cx - e.x) * 0.8
          e.y += (cy - e.y) * 0.8
          e.stunUntil = engineNow + 0.5
          hurtEnemy(e, dmg)
        }
      }
      removeDeadEnemies()
    }

    const target = nearestEnemy(f.x, f.y)
    if (!target) {
      // No enemies → drift back to the guard line.
      const gx = GUARD_X
      const dx = gx - f.x
      if (Math.abs(dx) > 1) f.x += Math.sign(dx) * def.speed * dt
      continue
    }
    const dist = Math.hypot(target.x - f.x, (target.y - f.y) * 0.8)
    if (dist > def.range) {
      const nx = (target.x - f.x) / (dist || 1)
      const ny = (target.y - f.y) / (dist || 1)
      f.x = Math.max(3, Math.min(96, f.x + nx * def.speed * dt))
      f.y = Math.max(6, Math.min(94, f.y + ny * def.speed * dt))
    } else if (f.cooldown <= 0) {
      const interval = def.attackInterval / (feverActive.value ? FEVER_ATK_SPEED : 1)
      f.cooldown = interval
      const dmg = def.atk * atkMult()
      if (def.range > 14) {
        spawnProjectile({
          x: f.x, y: f.y - 3, speed: 90, targetId: target.id, fromFighter: true,
          dmg, ability: def.ability, sourceTier: f.tier, color: glowOf(f.tier)
        })
      } else {
        f.striking = true
        emit({ type: 'strike', id: f.id, x: f.x, y: f.y, tier: f.tier })
        landFighterHit(f, target, dmg)
      }
    }
  }
  // Bury the fallen.
  const alive = fighters.value.filter((f) => {
    if (f.hp > 0) return true
    emit({ type: 'fighterDeath', x: f.x, y: f.y, tier: f.tier })
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
    const gateDist = e.x - GATE_X
    const targetDist = target ? Math.hypot(target.x - e.x, (target.y - e.y) * 0.8) : Infinity

    // Attack a fighter in range, else march on the gate.
    if (target && targetDist <= e.range) {
      if (e.cooldown <= 0) {
        e.cooldown = e.attackInterval
        e.striking = true
        if (e.range > 14) {
          spawnProjectile({
            x: e.x, y: e.y - 3, speed: 60, targetId: target.id, fromFighter: false,
            dmg: e.atk, ability: 'spit', sourceTier: 0, color: '#9cff2e'
          })
        } else {
          target.hp -= e.atk
          emit({ type: 'number', x: target.x, y: target.y - 5, amount: e.atk, variant: 'dmg' })
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
    const dx = target.x - p.x
    const dy = target.y - 3 - p.y
    const dist = Math.hypot(dx, dy)
    const step = p.speed * dt
    if (dist <= step + 2) {
      changed = true
      if (p.fromFighter) {
        landFighterHit({ tier: p.sourceTier, x: p.x, y: p.y }, target as Enemy, p.dmg)
      } else {
        const f = target as Fighter
        f.hp -= p.dmg
        emit({ type: 'impact', x: f.x, y: f.y, color: p.color })
        emit({ type: 'number', x: f.x, y: f.y - 5, amount: p.dmg, variant: 'dmg' })
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
      while (schedule.length && schedule[0]!.at <= waveElapsed) {
        const s = schedule.shift()!
        spawnEnemy(s.kind)
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
    .filter((t) => Number.isFinite(t) && t >= 1 && t <= 10)
    .slice(0, ARMY_CAP)
  fighters.value = tiers.map((tier, i) => makeFighter(tier, GUARD_X, guardY(i)))
  triggerRef(fighters)
}
restoreArmy()

// ─── Public composable surface ───────────────────────────────────────────────
const useBattle = () => ({
  // entities
  fighters, enemies, projectiles,
  // HUD state
  wave, bestWave, wavePhase, countdown, gateHp, gateMax, combo, feverActive,
  ultCharge, ultMax, ultReady, boss, timescale, armyCount, armyFull, stats,
  // upgrades
  battleUpgrades, upgradeLevel, upgradeCost, canBuyUpgrade, buyUpgrade,
  isUpgradeMaxed, impCadenceMs,
  // actions
  deployFighter, fieldMerge, fighterAt, fireUltimate, bumpStat,
  // lifecycle
  startBattle, stopBattle, setEventSink, setRenderSink
})

export default useBattle
