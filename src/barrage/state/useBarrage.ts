/**
 * Elemental Barrage — the run owner (contract: `UseBarrage`, a module singleton).
 *
 * Owns the live engine and everything that has to survive it: the saved run,
 * the checkpoint, the one-shot rewarded offers, the daily/endless switch, the
 * wallet feed, and the retention signals (stats, pass XP, leaderboard edges).
 * RENDER drives `engine.update(dt)` from BarrageBoard's loop; this module never
 * ticks the sim — it only listens to engine events and rebuilds the engine.
 *
 * ─── Persistence ─────────────────────────────────────────────────────────────
 * The endless run is snapshotted every time the engine settles in 'aim' (the
 * only phase `snapshot()` is valid in). Each write carries a unique `stamp`.
 * A cloud hydrate (`saveDataVersion`) that hands back a stamp this session did
 * not write carries somebody else's run — the classic "back to row 1 after a
 * refresh" trap is a fresh default run that ignores it — so the engine is
 * rebuilt from the hydrated snapshot (deferred to the next 'aim' when a volley
 * is in flight). Stamps we wrote ourselves are remembered, so a hydrate that
 * races our debounced blob write can never rewind the player by a turn.
 *
 * ─── Ads ─────────────────────────────────────────────────────────────────────
 * Every rewarded offer below stays HIDDEN until `rewardedOffersUnlocked`
 * (progress.ts): the first boss kill AND 3:00 of lifetime active play (the
 * play clock). No rewarded CTA may appear in a player's opening minutes. Each
 * offer's own conditions apply on top of that gate.
 *   • Rewarded Meteor continue — once per checkpoint segment, ad FIRST.
 *   • Rewarded 3× boss chest (`CHEST_AD_MULT`) — ad FIRST, then the tripled
 *     payout (ad-before-result); declining, or an ad that does not complete,
 *     pays 1×.
 *   • Rewarded +5 balls — once per checkpoint segment, aim phase only, and
 *     only where it helps (`bonusBallsAvailable`): never before the player's
 *     first boss kill, and only with a boss on the board or a monster wearing
 *     a danger pip. Poki playtests: on the Poki build the rewarded is ready
 *     from the first frame, so the big blue "▶ +5 balls" stood under the board
 *     from turn 1 — every tester's first tap opened a "Rewarded Break".
 *   • Interstitial — ONLY on a checkpoint restart: never the first two restarts
 *     of a session, ≥ 3 min apart, played BEFORE the new board appears.
 * A "segment" is one attempt at the stretch after a checkpoint: a boss kill
 * starts a new one, and so does a checkpoint restart.
 *
 * ─── Play clock + drop-off funnel (retention roadmap T0.1 / T0.2) ────────────
 * This module installs the play clock (`playClock.ts`) with its half of
 * "active": the player has fired this page session and nothing holds the
 * board. It also reports the funnel milestones (`funnel.ts`) from the engine
 * events it already handles: the first shot, rows 5 and 20, the first boss
 * spawn and kill, and the first loss. The session clock supplies 3/5/8 min.
 *
 * ─── Boss mercy (adaptive difficulty) ────────────────────────────────────────
 * A checkpoint restart after a breach with the boss on the board counts a
 * death against that boss (`checkpoint.deaths`); the rebuilt board spawns it
 * with `bossHpMultForDeaths(deaths)` of its HP — 75%, then 50% at most. A
 * continue (Meteor / revive) is not a death: nothing is rebuilt. The kill moves
 * the checkpoint and the next boss is back at full HP.
 * Playtest run 9: the adaptive floor follows the tray, and the player keeps
 * the (stronger) tray at the breach — the retry boss came back STRONGER
 * (224 → 348 HP). The death records the boss's full HP (`checkpoint.bossHp`,
 * the weakest meeting lost), and the retry's boss is capped at it
 * (`config.bossHpCap`) before mercy.
 */
import { computed, effectScope, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import { flushPersist, getState, setState } from '@/use/useEpicState'
import { flushSaveNow, saveDataVersion } from '@/use/useSaveStatus'
import useEpicConfig from '@/use/useEpicConfig'
import useReward, { REWARD_COIN_COST } from '@/use/useReward'
import { isInterstitialReady, showMidgameAd } from '@/use/useAds'
import { noteExternalInterstitial } from '@/use/useBreakInterstitial'
import { resumeGameplayAfterWaveBreak, stopGameplayForWaveBreak } from '@/use/useCrazyWaveGameplay'
import { onGameSuspended } from '@/use/useGamePause'
import { announceNewTier } from '@/use/useTierReveal'
import useBattlePass, { BARRAGE_XP_SOURCES } from '@/use/useBattlePass'
import { submitBestRow } from '@/platforms/leaderboard'
import { restartTray } from '../engine/balls'
import { createEngine, createEngineAtRow, restoreEngine } from '../engine/engine'
import { DEATH_SCENE_MS, pickStriker } from '../render/death'
import { DANGER_PIP_MARCHES, dangerMarches } from '../render/danger'
import {
  ASSIST_PAID, assistForPaidLevels, bossHpMultForDeaths, configFromUpgrades, DAILY_CONFIG, defaultConfig, UPGRADE_IDS
} from '../engine/economy'
import {
  ROWS,
  type EngineConfig, type EngineEvent, type EngineListener, type IBarrageEngine, type Monster, type Phase,
  type RunSnapshot, type SkillId
} from '../engine/types'
import { EB_RUN_KEY } from '../keys'
import {
  bestRow, bumpStats, checkpoint, ftue, isFtueActive, maxBallTier, mode, noteBallTier, noteBestRow, noteBossDeath,
  patchFtue, patchSegment, pending, persistStats, rewardedOffersUnlocked, runEndSeq, sanitizeTray, segment,
  setCheckpoint, setPending, stats, toCount
} from './progress'
import { installPlayClock, sessionPlaySeconds } from './playClock'
import { funnelMilestone, funnelPlayTime, funnelRow, setFunnelCohortResolver } from './funnel'
import { setUpgradeLevel, upgradeLevels } from './upgradeLevels'
import { recordDailyAttempt, recordDailyRow, dailyRecord, todaySeed } from './useDailyBarrage'
import type { BossChestOffer, BossHud, BreachCulprit, BreachOffer, DailyResult, RunRecap, UseBarrage } from './contract'

// ─── Tunables ────────────────────────────────────────────────────────────────
/** Rewarded "+N balls". */
export const BONUS_BALLS = 5
/** The rewarded boss-chest multiplier (was 2×: a bigger offer makes the ad
 *  view likelier — the button reads "▶ 3× ●"). */
export const CHEST_AD_MULT = 3
/** The first N checkpoint restarts of a session never show an interstitial. */
export const RESTART_AD_GRACE = 2
/** Minimum wall-clock gap between two restart interstitials — and between the
 *  session start and the first one, which stands in for any first-load /
 *  first-play interstitial the portal build already showed (those record no
 *  timestamp of their own). */
export const RESTART_AD_MIN_GAP_MS = 3 * 60 * 1000
/** Ceiling on any ad this module awaits. Every provider resolves from SDK
 *  callbacks, and a callback that never fires (a tracking blocker, a dead ad
 *  CDN) is a promise that never settles — `await` on it would wedge the breach
 *  screen or the restart forever. No honest ad runs this long. */
export const AD_AWAIT_CAP_MS = 60 * 1000
/** The restart interstitial waits far less. The new board may be built under a
 *  slow ad: `isAdShowing` keeps the loop paused and the portal's overlay covers
 *  it, so the player still meets the board only after the ad. What this buys is
 *  that an interstitial whose SDK never answers (a tracking blocker) costs the
 *  player a few seconds on the breach screen, not a minute. */
export const RESTART_AD_WAIT_MS = 6 * 1000
/** The engine's safety net (`config.assist`) stays at full strength while the
 *  player owns fewer than this many PAID upgrade levels (playtest run 2: no
 *  blind tester bought one, and 3 of 4 were overrun at rows 15–19 on flat
 *  power), then fades per paid level — see `assistForPaidLevels` (economy). */
export const ASSIST_UNTIL_PAID = ASSIST_PAID.fullBelow

/** `p`, or `fallback` once the cap elapses — whichever comes first. */
const capped = <T>(p: Promise<T>, fallback: T, ms = AD_AWAIT_CAP_MS): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cap = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms) })
  return Promise.race([p, cap]).finally(() => { if (timer !== null) clearTimeout(timer) })
}

// ─── Engine factory (a seam, so tests can drive a scripted fake) ─────────────
export interface EngineFactory {
  create(config: EngineConfig): IBarrageEngine
  createAtRow(config: EngineConfig, row: number, tray: number[]): IBarrageEngine
  restore(snap: RunSnapshot): IBarrageEngine
}

const realFactory: EngineFactory = {
  create: (c) => createEngine(c),
  createAtRow: (c, row, tray) => createEngineAtRow(c, row, tray),
  restore: (s) => restoreEngine(s)
}
let factory: EngineFactory = realFactory

// ─── Persisted run record ────────────────────────────────────────────────────
interface RunRecord {
  v: 1
  snap: RunSnapshot
  stamp: string
  /** The run ended in a breach that was never continued. A reload must not
   *  resurrect the pre-breach turn as a free retry — it restarts at the
   *  checkpoint instead, exactly as the restart button would. */
  breached?: boolean
  /** The tray the breached run ended with — the snapshot is the last 'aim',
   *  before that volley's pickups (absent in older saves: the snapshot's). A
   *  checkpoint restart after a reload weighs it like the live breach tray. */
  breachTray?: number[]
  /** The run's loss-recap tally so far (absent in older saves = 0 / 0). */
  tally?: RunTally
}

/** Kills made and coins earned since the run started (the breach recap). */
interface RunTally {
  kills: number
  coins: number
}

const readTally = (raw: unknown): RunTally => {
  const t = (raw ?? {}) as Partial<Record<keyof RunTally, unknown>>
  return { kills: toCount(t.kills), coins: toCount(t.coins) }
}

const readRunRecord = (): RunRecord | null => {
  const raw = getState<Partial<RunRecord> | null>(EB_RUN_KEY, null)
  if (!raw || raw.v !== 1 || typeof raw.stamp !== 'string') return null
  const snap = raw.snap
  if (!snap || snap.v !== 1 || !snap.config || !Array.isArray(snap.monsters) || !Array.isArray(snap.tray)) return null
  if (snap.config.mode !== 'endless') return null
  const rec: RunRecord = { v: 1, snap, stamp: raw.stamp, breached: raw.breached === true, tally: readTally(raw.tally) }
  const breachTray = sanitizeTray(raw.breachTray)
  if (breachTray.length) rec.breachTray = breachTray
  return rec
}

const sessionId = Math.random().toString(36).slice(2, 8)
let stampSeq = 0
/** Every stamp this session wrote — a hydrate that returns one of these carries
 *  OUR run (possibly a turn old, if it raced the debounced blob write), never a
 *  foreign one to adopt. */
const writtenStamps = new Set<string>()

// ─── Singleton state ─────────────────────────────────────────────────────────
const { addCoins } = useEpicConfig()
const { canRedeem, redeem, buffsCostCoins } = useReward()

const phase: Ref<Phase> = ref('aim')
const row = ref(1)
const nextBossRow = ref(10)
const tray: Ref<number[]> = ref([])
const trayCapacity = ref(2)
const volleyHits = ref(0)
const fever = ref(false)
const speedMul = ref(1)
const boss: Ref<BossHud | null> = ref(null)
const shields = ref(0)
const revives = ref(0)
const warcryArmed = ref(false)
const lastSkill: Ref<SkillId | null> = ref(null)
const engineGen = ref(0)
const checkpointRow = computed(() => checkpoint.value.row)

/** Raw offers; the public refs below add the LIVE readiness gates. */
const breachRaw: Ref<{ row: number; recap: RunRecap; culprit: BreachCulprit | null } | null> = ref(null)
/** The endless run's recap tally (see RunRecord.tally). Plain module state: it
 *  is read once, at the breach, and saved with every run snapshot. */
let tally: RunTally = { kills: 0, coins: 0 }
const chestRaw: Ref<Omit<BossChestOffer, 'boostAvailable' | 'boostMult'> | null> = ref(null)
/** A boss died this volley; its chest is presented once the volley settles
 *  (next 'aim', or the breach if the same turn ends in one) — a modal thrown
 *  over balls still in flight hides the kill the player just made. */
let queuedChest: Omit<BossChestOffer, 'boostAvailable' | 'boostMult'> | null = null
const dailyResult: Ref<DailyResult | null> = ref(null)
/** Held while a restart / mode switch is between boards (ad included). */
const transition = ref(false)
/** The death sequence holds the death screen (run 7): from a live breach
 *  until DEATH_SCENE_MS later the board plays the monsters tearing the unit
 *  apart and "WASTED" holds over it (DeathOverlay); then the breach offer /
 *  the daily result opens. A reload into a saved breach opens it at once. */
const deathScene = ref(false)
let deathTimer: ReturnType<typeof setTimeout> | null = null
const endDeathScene = (): void => {
  if (deathTimer !== null) clearTimeout(deathTimer)
  deathTimer = null
  deathScene.value = false
}

let engineRef: ShallowRef<IBarrageEngine> | null = null
let unsubscribe: (() => void) | null = null
const listeners = new Set<EngineListener>()
let lastStamp = ''
/** A hydrate arrived while a volley was in flight — adopt at the next 'aim'. */
let hydratePending = false
/** The current daily run set a new best for today at some point. */
let dailyNewBest = false
/** Session-scoped restart-interstitial bookkeeping. */
let sessionRestarts = 0
let lastInterstitialAt = Date.now()
/** Pass XP accumulated since the last flush (flushed per turn, not per kill). */
let pendingXp = 0
/** Boss HP HUD throttle: at most one refresh per animation frame. */
let bossRefreshQueued = false
/** Highest never-seen tier a merge created in the current synchronous burst. */
let revealTier = 0
let revealQueued = false
let busy = false
/** The player has fired a shot this page session. The play clock opens here:
 *  the first act of play on every build (see playClock.ts). Never persisted. */
const firedThisSession = ref(false)

const eng = (): IBarrageEngine => {
  if (!engineRef) throw new Error('[barrage] engine not initialised')
  return engineRef.value
}

const nextFrame = (cb: () => void): void => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => cb())
  else setTimeout(cb, 16)
}

// ─── Config ──────────────────────────────────────────────────────────────────
const randomSeed = (): number => Math.floor(Math.random() * 0x7fffffff) >>> 0

/** Upgrade levels the player PAID for — the FTUE's free Tray Capacity level is
 *  a gift, not a purchase (a player who bought that level with coins before
 *  claiming the gift never gets the gift, so it counts as paid). */
export const paidUpgradeLevels = computed(() => {
  let n = 0
  for (const id of UPGRADE_IDS) n += upgradeLevels.value[id]
  return Math.max(0, n - (ftue.value.freeCapacity ? 1 : 0) - ftue.value.sockets)
})

/** The safety net for the endless run: full (1) below ASSIST_UNTIL_PAID paid
 *  levels, then a small step down per paid level to 0 (playtest run 3: the
 *  old on/off switch made monsters jump ~25% at the 2nd purchase — no single
 *  purchase may make monsters jump). Levels are never sold, so it only fades. */
const assistLevel = computed(() => assistForPaidLevels(paidUpgradeLevels.value))

/** Boss mercy for the boss past the checkpoint (see the module header). */
const bossHpMult = computed(() => bossHpMultForDeaths(checkpoint.value.deaths))
/** The retry cap: the full HP of the boss that won (0 = none). */
const bossHpCap = computed(() => checkpoint.value.bossHp)

const endlessTuning = (): Partial<EngineConfig> => ({
  ...configFromUpgrades(upgradeLevels.value),
  ftue: isFtueActive(),
  assist: assistLevel.value,
  bossHpMult: bossHpMult.value,
  bossHpCap: bossHpCap.value
})

const endlessConfig = (): EngineConfig =>
  defaultConfig({ ...endlessTuning(), mode: 'endless', seed: randomSeed() })

const dailyConfig = (): EngineConfig =>
  defaultConfig({ ...DAILY_CONFIG, mode: 'daily', seed: todaySeed(), ftue: false })

// ─── HUD mirrors ─────────────────────────────────────────────────────────────
const readBoss = (e: IBarrageEngine): BossHud | null => {
  const id = e.state.bossId
  if (id === null || id === undefined) return null
  const m = e.state.monsters.find((x) => x.id === id)
  if (!m) return null
  const hud: BossHud = { monsterId: id, bossKind: m.bossKind ?? 'slime-tower', hp: m.hp, maxHp: m.maxHp, enraged: m.enraged }
  if (m.mercy !== undefined && m.mercy > 0 && m.mercy < 1) hud.mercy = m.mercy
  return hud
}

const syncTray = (): void => {
  const s = eng().state
  tray.value = [...s.tray]
  trayCapacity.value = s.config.trayCapacity
}

const syncAll = (): void => {
  const e = eng()
  const s = e.state
  phase.value = s.phase
  row.value = s.row
  nextBossRow.value = s.nextBossRow
  volleyHits.value = s.volleyHits
  fever.value = s.fever
  speedMul.value = s.speedMul
  shields.value = s.shields
  revives.value = s.revives
  warcryArmed.value = s.warcryArmed
  boss.value = readBoss(e)
  syncTray()
}

const syncCharges = (): void => {
  if (!engineRef) return
  const s = engineRef.value.state
  shields.value = s.shields
  revives.value = s.revives
  warcryArmed.value = s.warcryArmed
}

const scheduleBossRefresh = (): void => {
  if (bossRefreshQueued) return
  bossRefreshQueued = true
  nextFrame(() => {
    bossRefreshQueued = false
    if (engineRef) boss.value = readBoss(engineRef.value)
  })
}

// ─── Persistence ─────────────────────────────────────────────────────────────
const writeRun = (snap: RunSnapshot, breached = false, breachTray?: readonly number[]): void => {
  const stamp = `${sessionId}-${++stampSeq}`
  lastStamp = stamp
  writtenStamps.add(stamp)
  const rec: RunRecord = { v: 1, snap, stamp, tally: { ...tally } }
  if (breached) rec.breached = true
  if (breached && breachTray?.length) rec.breachTray = [...breachTray]
  setState(EB_RUN_KEY, rec)
}

/** Snapshot the endless run (valid in 'aim' only; a no-op otherwise). */
const persistRun = (): void => {
  if (mode.value !== 'endless' || !engineRef) return
  const snap = eng().snapshot()
  if (snap) writeRun(snap)
}

/** Mark the saved run as breached (the snapshot itself is the last 'aim'),
 *  with the tray the breach left (a restart after a reload weighs it). */
const persistBreach = (): void => {
  const rec = readRunRecord()
  if (rec && writtenStamps.has(rec.stamp)) writeRun(rec.snap, true, eng().state.tray)
}

const flushXp = (): void => {
  if (pendingXp <= 0) return
  const xp = pendingXp
  pendingXp = 0
  useBattlePass().awardXp(xp)
}

/** Turn boundary: counters and pass XP go to the blob once, not per event. */
const flushTurn = (): void => {
  persistStats()
  flushXp()
}

// ─── Engine lifecycle ────────────────────────────────────────────────────────
const swapEngine = (next: IBarrageEngine): void => {
  endDeathScene()
  unsubscribe?.()
  if (engineRef) engineRef.value = next
  else engineRef = shallowRef(next)
  unsubscribe = next.on(onEvent)
  engineGen.value++
  bossRefreshQueued = false
  syncAll()
  for (const t of next.state.tray) noteBallTier(t)
}

/**
 * The tray a restart keeps before the FIRST boss, when there is no checkpoint
 * tray to fall back on: the one the player had at the last saved 'aim' (the
 * breached run's snapshot — the same record a reload restarts from, so an
 * in-session restart and a reload after the breach agree). Without it a
 * first-session breach threw away ~20 turns of built-up balls, far past the
 * casual contract's "a breach never costs more than 2–4 minutes"; with it the
 * player loses the board, not the tray.
 */
const preCheckpointTray = (): number[] => {
  const saved = readRunRecord()?.snap.tray
  const live = engineRef && mode.value === 'endless' ? eng().state.tray : undefined
  const tray = sanitizeTray(saved ?? live ?? [])
  return tray.length ? tray : [1]
}

/**
 * The tray the endless run breached with: the live board while it still stands
 * in 'breach' (an in-session restart), else the breached save's (a reload
 * after the breach, or a hydrated breached run). Null when no breach is behind
 * this rebuild (a fresh start, a hydrated checkpoint with no run).
 */
const trayAtBreach = (): number[] | null => {
  if (engineRef && mode.value === 'endless') {
    const s = eng().state
    // `mode` flips to endless before `exitDaily` swaps the daily board out.
    if (s.phase === 'breach' && s.config.mode === 'endless') return sanitizeTray(s.tray)
  }
  const rec = readRunRecord()
  if (!rec?.breached) return null
  return rec.breachTray ?? sanitizeTray(rec.snap.tray)
}

/**
 * The breach behind this rebuild had the boss past the checkpoint on the board
 * — a death to it (boss mercy). The live board while it still stands in
 * 'breach', else the breached save's last 'aim'. A boss that only arrived with
 * the breaching row does not count: the player never got a shot at it (and the
 * saved last 'aim' does not hold it either, so a reload agrees). Returns that
 * boss's full HP (before mercy; the retry cap), or null: no death to it.
 */
const bossAtBreach = (): number | null => {
  const fullHp = (m: Monster): number => Math.round(m.maxHp / (m.mercy && m.mercy > 0 && m.mercy < 1 ? m.mercy : 1))
  if (engineRef && mode.value === 'endless') {
    const s = eng().state
    if (s.phase === 'breach' && s.config.mode === 'endless') {
      const b = s.monsters.find((m) => m.id === s.bossId)
      return b !== undefined && (b.spawnRow ?? 0) < s.row ? fullHp(b) : null
    }
  }
  const rec = readRunRecord()
  if (rec?.breached !== true) return null
  const b = rec.snap.monsters.find((m) => m.kind === 'boss')
  return b ? fullHp(b) : null
}

/** A fresh board at the checkpoint, keeping every coin. Before the first boss
 *  that is row 1 (the FTUE script while it still applies) with the tray the
 *  player had built; after it, `checkpointRow + 1` with the STRONGER of the
 *  checkpoint tray and the tray at the breach (CONTRACT §6, `restartTray`;
 *  playtest run 4: a restart that dropped a ball read as lost progress right
 *  under "Keep all your coins"). */
const buildCheckpointRun = (): IBarrageEngine => {
  // Before the config is read: the rebuilt board meets the boss softer.
  const lostTo = bossAtBreach()
  if (lostTo !== null) noteBossDeath(lostTo)
  const cp = checkpoint.value
  // Every caller starts a new run on this board (restart, fresh start, a
  // hydrated save with no run in it): the loss recap counts from here.
  tally = { kills: 0, coins: 0 }
  if (cp.row <= 0) {
    const kept = preCheckpointTray()
    // A lone tier-1 ball is exactly `createEngine`'s own start; anything more
    // rides the same row-1 board (FTUE script included while it still applies).
    if (kept.length === 1 && kept[0] === 1) return factory.create(endlessConfig())
    return factory.createAtRow(endlessConfig(), 1, kept)
  }
  const config: EngineConfig = { ...endlessConfig(), ftue: false }
  const tray = restartTray(cp.tray.length ? cp.tray : [1], trayAtBreach(), config.damageMult)
  return factory.createAtRow(config, cp.row + 1, tray)
}

/** The saved endless run, or null when there is none worth resuming. */
const restoreSavedRun = (rec: RunRecord | null = readRunRecord()): IBarrageEngine | null => {
  if (!rec || rec.breached) return null
  try {
    const e = factory.restore(rec.snap)
    // The snapshot's config is from its 'aim'; upgrades bought after it (and
    // the FTUE flag) must apply to the resumed run too.
    e.setConfig(endlessTuning())
    lastStamp = rec.stamp
    writtenStamps.add(rec.stamp)
    tally = readTally(rec.tally)
    return e
  } catch (err) {
    console.warn('[barrage] saved run could not be restored — starting at the checkpoint', err)
    return null
  }
}

const bootEndless = (): IBarrageEngine => restoreSavedRun() ?? buildCheckpointRun()

/** A hydrate brought back a run this session did not write: it wins. Runs
 *  only in 'aim' (never under a volley). Returns true when the engine moved. */
const adoptHydratedRun = (): boolean => {
  hydratePending = false
  if (mode.value !== 'endless') return false
  const rec = readRunRecord()
  if (rec) {
    if (writtenStamps.has(rec.stamp)) {
      // Our own run (possibly the blob lost a debounced write to the reload):
      // put the live one back rather than rewinding to it.
      if (rec.stamp !== lastStamp) persistRun()
      return false
    }
    // Consumed: a later hydrate that hands back the same foreign blob (before
    // our own write reaches storage) must not rebuild the board again.
    writtenStamps.add(rec.stamp)
    swapEngine(restoreSavedRun(rec) ?? buildCheckpointRun())
    persistRun()
    return true
  }
  // No run in the hydrated save, but a checkpoint beyond where this untouched
  // fresh board starts: the player has progress elsewhere — start there.
  const s = eng().state
  if (s.turn === 0 && checkpoint.value.row > 0 && s.row <= checkpoint.value.row) {
    swapEngine(buildCheckpointRun())
    persistRun()
    return true
  }
  return false
}

// ─── Owed rewards (battle pass balls, supply-drop charges) ───────────────────
/** Charges the board state carries between turns; the engine has no "grant"
 *  call, so they ride a snapshot → restore round-trip, which is 'aim'-only. */
const applyChargeViaSnapshot = (skills: SkillId[]): boolean => {
  const snap = eng().snapshot()
  if (!snap) return false
  const next: RunSnapshot = { ...snap }
  for (const s of skills) {
    if (s === 'shield') next.shields += 1
    else if (s === 'revive') next.revives += 1
    else if (s === 'warcry') next.warcryArmed = true
  }
  swapEngine(factory.restore(next))
  return true
}

const deliverPending = (): void => {
  if (mode.value !== 'endless' || !engineRef || holdSim.value) return
  const owed = pending.value
  if (!owed.balls.length && !owed.skills.length) return
  const e = eng()
  const delivered = { balls: [] as number[], skills: [] as SkillId[] }
  for (const t of owed.balls) {
    e.addBalls(1, t)
    delivered.balls.push(t)
  }
  if (owed.skills.length && e.state.phase === 'aim' && applyChargeViaSnapshot(owed.skills)) {
    delivered.skills = [...owed.skills]
  }
  setPending({
    balls: owed.balls.slice(delivered.balls.length),
    skills: owed.skills.slice(delivered.skills.length)
  })
  syncAll()
  if (eng().state.phase === 'aim') persistRun()
}

// ─── Event handling ──────────────────────────────────────────────────────────
const queueReveal = (tier: number): void => {
  revealTier = Math.max(revealTier, tier)
  if (revealQueued) return
  revealQueued = true
  // After the engine's synchronous add/merge chain has settled, so the tray is
  // sorted and the slot index is final.
  queueMicrotask(() => {
    revealQueued = false
    const t = revealTier
    revealTier = 0
    if (!engineRef || t <= 0) return
    syncTray()
    const idx = tray.value.indexOf(t)
    announceNewTier(t, { kind: 'grid', idx: Math.max(0, idx) })
  })
}

const onAim = (): void => {
  syncAll()
  fever.value = false
  // Silent watermark catch-up (a gifted or copied ball); discoveries were
  // already announced by the merge that made them.
  if (tray.value[0] !== undefined) noteBallTier(tray.value[0])
  flushTurn()
  if (queuedChest) presentChest()
  if (mode.value === 'endless') {
    if (hydratePending && adoptHydratedRun()) return
    persistRun()
    deliverPending()
  }
}

const presentChest = (): void => {
  if (!queuedChest) return
  chestRaw.value = queuedChest
  queuedChest = null
}

const onBossDefeated = (e: Extract<EngineEvent, { type: 'bossDefeated' }>): void => {
  boss.value = null
  const first = stats.value.bossKills === 0
  bumpStats({ bossKills: 1 })
  pendingXp += BARRAGE_XP_SOURCES.boss
  // The engine already applied the Coin Bounty multiplier to `bounty`, and pays
  // none of it itself — the chest below is the only place it reaches the wallet.
  const bounty = Math.max(1, Math.round(e.bounty))
  queuedChest = { bossKind: e.bossKind, row: e.row, bounty, first }
  // The first-session script ends with the first boss, on whichever board.
  if (!ftue.value.done) {
    patchFtue({ done: true })
    if (mode.value === 'endless') eng().setConfig({ ftue: false })
  }
  if (mode.value === 'endless') {
    setCheckpoint(e.row, eng().state.tray)
    patchSegment({ meteor: false, bonusBalls: false })
    submitBestRow(bestRow.value)
  }
  flushTurn()
  void flushSaveNow()
}

const onBreach = (): void => {
  endDeathScene()
  deathScene.value = true
  deathTimer = setTimeout(endDeathScene, DEATH_SCENE_MS)
  syncAll()
  flushTurn()
  if (queuedChest) presentChest()
  stopGameplayForWaveBreak()
  runEndSeq.value++
  if (mode.value === 'daily') {
    recordDailyRow(eng().state.row)
    dailyResult.value = { row: eng().state.row, best: dailyRecord.value.best, newBest: dailyNewBest }
  } else {
    const s = eng().state
    const at = s.row
    // The striker of the death sequence — the one the loss screen names.
    const who = pickStriker(s.monsters, s.launcherX)
    const culprit: BreachCulprit | null = who ? (who.bossKind ? { kind: who.kind, bossKind: who.bossKind } : { kind: who.kind }) : null
    breachRaw.value = { row: at, recap: { row: at, kills: tally.kills, coins: tally.coins }, culprit }
    persistBreach()
    submitBestRow(bestRow.value)
  }
  void flushSaveNow()
}

const onEvent = (e: EngineEvent): void => {
  switch (e.type) {
    case 'phase':
      phase.value = e.phase
      if (e.phase === 'aim') onAim()
      else if (e.phase === 'volley') fever.value = eng().state.fever
      break
    case 'fire':
      // The session's first milestone decides the funnel's new/returning
      // cohort from the save, so it goes out BEFORE this shot is counted.
      if (!firedThisSession.value) {
        funnelMilestone('first_shot')
        firedThisSession.value = true
      }
      bumpStats({ volleys: 1 })
      syncTray()
      resumeGameplayAfterWaveBreak()
      break
    case 'hit':
      volleyHits.value = eng().state.volleyHits
      if (boss.value) scheduleBossRefresh()
      break
    case 'dot':
    case 'abilityProc':
    case 'heal':
    case 'skill':
    case 'march':
      if (boss.value) scheduleBossRefresh()
      if (e.type === 'skill') {
        lastSkill.value = e.skill
        // The engine announces a skill BEFORE applying it; read the charges
        // once its synchronous step is done.
        queueMicrotask(syncCharges)
      }
      break
    case 'kill':
      bumpStats({ kills: 1 })
      pendingXp += BARRAGE_XP_SOURCES.kill
      if (mode.value === 'endless') tally.kills++
      break
    case 'coins':
      // The boss bounty is paid by the boss chest (1× or rewarded 2×); if the
      // engine ever reports it as a coin event too it must not pay twice.
      if (e.source !== 'boss' && e.amount > 0) {
        addCoins(e.amount)
        if (mode.value === 'endless') tally.coins += e.amount
      }
      break
    case 'pickup':
      bumpStats({ pickups: 1 })
      break
    case 'trayAdd':
      // No watermark bump here: a merged ball may be reported as an add before
      // its merge, and bumping on the add would swallow the discovery reveal.
      syncTray()
      break
    case 'trayMerge':
      bumpStats({ merges: 1 })
      pendingXp += BARRAGE_XP_SOURCES.merge
      if (!ftue.value.firstMerge) patchFtue({ firstMerge: true })
      // Only a merge the player made may announce a discovery (useTierReveal).
      if (noteBallTier(e.toTier)) queueReveal(e.toTier)
      syncTray()
      break
    case 'trayOverflow':
      syncTray()
      break
    case 'traySocket':
      // Instant Barrage: the FTUE grew a socket — book it as a free capacity
      // level so the chip, the save and the next board all agree.
      if (upgradeLevels.value.capacity < e.level) {
        patchFtue({ sockets: ftue.value.sockets + (e.level - upgradeLevels.value.capacity) })
        setUpgradeLevel('capacity', e.level)
      }
      syncTray()
      break
    case 'fever':
      fever.value = true
      bumpStats({ fevers: 1 })
      break
    case 'speedUp':
      speedMul.value = e.speedMul
      break
    case 'volleyEnd':
      volleyHits.value = e.hits
      bumpStats({ hits: e.hits, bestCombo: e.hits })
      speedMul.value = 1
      break
    case 'rowSpawned':
      row.value = e.row
      nextBossRow.value = eng().state.nextBossRow
      bumpStats({ rowsTotal: 1 })
      pendingXp += BARRAGE_XP_SOURCES.row
      if (mode.value === 'endless') {
        noteBestRow(e.row)
        funnelRow(e.row)
      } else if (recordDailyRow(e.row)) dailyNewBest = true
      break
    case 'bossSpawn':
    case 'bossEnrage':
      boss.value = readBoss(eng())
      if (e.type === 'bossSpawn') funnelMilestone('boss1_spawn')
      break
    case 'bossDefeated':
      onBossDefeated(e)
      funnelMilestone('boss1_kill')
      break
    case 'shieldBlock':
    case 'continued':
      syncAll()
      break
    case 'breach':
      onBreach()
      funnelMilestone('first_loss')
      break
    default:
      break
  }
  for (const l of listeners) {
    try { l(e) } catch (err) { console.warn('[barrage] engine listener threw', err) }
  }
}

// ─── Public computed state ───────────────────────────────────────────────────
const holdSim = computed(() =>
  breachRaw.value !== null || chestRaw.value !== null || dailyResult.value !== null || transition.value)

/** A rewarded ad (or, on coin-mode builds, its coin price) can run right now.
 *  Readiness only: every placement ANDs the rewarded gate in beside it. */
const rewardReady = computed(() => canRedeem(REWARD_COIN_COST))

const breach = computed<BreachOffer | null>(() => {
  const b = breachRaw.value
  if (!b) return null
  return {
    meteorAvailable: rewardedOffersUnlocked.value && !segment.value.meteor && rewardReady.value,
    reviveAvailable: revives.value > 0,
    isDaily: false,
    checkpointRow: checkpoint.value.row,
    row: b.row,
    recap: { ...b.recap },
    ...(b.culprit ? { culprit: { ...b.culprit } } : {})
  }
})

const bossChest = computed<BossChestOffer | null>(() => {
  const c = chestRaw.value
  if (!c) return null
  // In coin-priced builds the "3×" costs REWARD_COIN_COST: only offer it when
  // the extra bounty is worth more than the price — never a trade at a loss.
  const worthIt = !buffsCostCoins || c.bounty * (CHEST_AD_MULT - 1) > REWARD_COIN_COST
  return { ...c, boostMult: CHEST_AD_MULT, boostAvailable: rewardedOffersUnlocked.value && worthIt && rewardReady.value }
})

/** The +5 balls only where they help (see the module header): a boss on the
 *  board, or a monster within the danger pips' reach of the line. Read at the
 *  aim phase — the board only changes between aim phases, and `phase` / `boss`
 *  are what make this recompute. */
const bonusBallsUseful = (): boolean => {
  if (!engineRef) return false
  if (boss.value) return true
  const s = eng().state
  return s.bossId !== null || dangerMarches(s) <= DANGER_PIP_MARCHES
}

/** The rewarded gate replaces the old `ftue.done` check: its first-boss-kill
 *  half is the same condition, read from the lifetime counter. */
const bonusBallsAvailable = computed(() =>
  rewardedOffersUnlocked.value && mode.value === 'endless' && phase.value === 'aim' && !segment.value.bonusBalls &&
  !holdSim.value && rewardReady.value && bonusBallsUseful())

// ─── Actions ─────────────────────────────────────────────────────────────────
const fire = (angle: number): boolean => {
  if (holdSim.value || !engineRef) return false
  const ok = eng().fire(angle)
  if (ok) resumeGameplayAfterWaveBreak()
  return ok
}

const recall = (): void => {
  if (engineRef) eng().recall()
}

const endBreach = (): void => {
  breachRaw.value = null
  syncAll()
  resumeGameplayAfterWaveBreak()
}

const continueWithMeteor = async (): Promise<boolean> => {
  const offer = breach.value
  if (!offer?.meteorAvailable || busy || eng().state.phase !== 'breach') return false
  busy = true
  try {
    // Ad FIRST; the board only moves once the reward is granted.
    if (!(await capped(redeem(REWARD_COIN_COST), false))) return false
    if (!eng().continueAfterBreach('meteor')) return false
    patchSegment({ meteor: true })
    endBreach()
    void flushSaveNow()
    return true
  } finally {
    busy = false
  }
}

const continueWithRevive = (): boolean => {
  if (!breachRaw.value || revives.value <= 0) return false
  if (!eng().continueAfterBreach('revive')) return false
  endBreach()
  return true
}

/** Pay a pending boss chest at 1× (used when something replaces the board
 *  under an unclaimed chest — a bounty must never evaporate). */
const payChestIfPending = (): void => {
  const c = chestRaw.value ?? queuedChest
  if (!c) return
  addCoins(c.bounty)
  chestRaw.value = null
  queuedChest = null
}

/** Restart-interstitial cadence (see the module header). */
export const restartAdDue = (restartNo: number, nowMs: number, lastAdAt: number, ready: boolean): boolean =>
  restartNo > RESTART_AD_GRACE && nowMs - lastAdAt >= RESTART_AD_MIN_GAP_MS && ready

const restartFromCheckpoint = async (): Promise<void> => {
  if (transition.value || mode.value !== 'endless' || !engineRef) return
  transition.value = true
  try {
    sessionRestarts++
    payChestIfPending()
    const nowMs = Date.now()
    if (restartAdDue(sessionRestarts, nowMs, lastInterstitialAt, isInterstitialReady.value)) {
      lastInterstitialAt = nowMs
      // Keep the break-cadence clock honest about an ad it did not play.
      noteExternalInterstitial()
      // BEFORE the new board: the ad sits between the breach and the fresh run,
      // never on top of a board the player is about to aim at.
      await capped(showMidgameAd(), undefined, RESTART_AD_WAIT_MS)
    }
    breachRaw.value = null
    patchSegment({ meteor: false, bonusBalls: false })
    swapEngine(buildCheckpointRun())
    persistRun()
    submitBestRow(bestRow.value)
    void flushSaveNow()
    resumeGameplayAfterWaveBreak()
  } finally {
    transition.value = false
  }
}

const claimBossChest = async (boost: boolean): Promise<number> => {
  const offer = bossChest.value
  if (!offer || busy) return 0
  busy = true
  try {
    let mult = 1
    // Ad FIRST, payout after (ad-before-result). A no-fill or a skipped ad
    // still pays the chest at 1× — the bounty was earned by the kill.
    if (boost && offer.boostAvailable && (await capped(redeem(REWARD_COIN_COST), false))) mult = CHEST_AD_MULT
    const coins = offer.bounty * mult
    addCoins(coins)
    if (mode.value === 'endless') tally.coins += coins
    chestRaw.value = null
    void flushSaveNow()
    return coins
  } finally {
    busy = false
  }
}

const claimBonusBalls = async (): Promise<boolean> => {
  if (!bonusBallsAvailable.value || busy) return false
  busy = true
  try {
    if (!(await capped(redeem(REWARD_COIN_COST), false))) return false
    if (mode.value !== 'endless') return false
    eng().addBalls(BONUS_BALLS)
    patchSegment({ bonusBalls: true })
    syncTray()
    persistRun()
    return true
  } finally {
    busy = false
  }
}

const canStartDaily = computed(() =>
  mode.value === 'endless' && phase.value === 'aim' && !holdSim.value)

const startDaily = (): void => {
  if (!canStartDaily.value) return
  // The endless run is parked exactly as it stands (it is in 'aim').
  persistRun()
  flushTurn()
  recordDailyAttempt()
  dailyNewBest = false
  mode.value = 'daily'
  swapEngine(factory.create(dailyConfig()))
  resumeGameplayAfterWaveBreak()
  void flushSaveNow()
}

const exitDaily = (): void => {
  if (mode.value !== 'daily') return
  payChestIfPending()
  flushTurn()
  recordDailyRow(eng().state.row)
  dailyResult.value = null
  mode.value = 'endless'
  swapEngine(bootEndless())
  persistRun()
  deliverPending()
  resumeGameplayAfterWaveBreak()
}

const onEngineEvent = (cb: EngineListener): (() => void) => {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Deliver an owed ball to the endless run right away when possible (queued
 *  otherwise). Exposed for UI/cheats; the pass and supply drop use `oweBall`. */
const grantBalls = (tier: number, n = 1): void => {
  const t = Math.max(1, Math.floor(tier) || 1)
  const add = Array.from({ length: Math.max(1, Math.floor(n)) }, () => t)
  setPending({ balls: [...pending.value.balls, ...add], skills: pending.value.skills })
  deliverPending()
}

const grantSkillCharge = (skill: SkillId): void => {
  setPending({ balls: pending.value.balls, skills: [...pending.value.skills, skill] })
  deliverPending()
}

// ─── Watchers (installed once, with the singleton) ───────────────────────────
const installWatchers = (): void => {
  // Upgrades apply live — endless only; the daily board runs on a fixed kit.
  // Sync flush: a purchase and the very next shot can land in the same tick.
  watch(upgradeLevels, () => {
    if (mode.value !== 'endless' || !engineRef) return
    eng().setConfig(configFromUpgrades(upgradeLevels.value))
    syncTray()
  }, { flush: 'sync' })
  // The safety net fades with every paid level from the 2nd on (engine: rows
  // spawned from then on read the new value; monsters already out keep their HP).
  watch(assistLevel, (assist) => {
    if (mode.value !== 'endless' || !engineRef) return
    eng().setConfig({ assist })
  }, { flush: 'sync' })
  // Boss mercy back to 1 at the kill (the next boss is a new one), or raised by
  // a hydrate — read at the boss's spawn, never touching a live boss.
  watch(bossHpMult, (mult) => {
    if (mode.value !== 'endless' || !engineRef) return
    eng().setConfig({ bossHpMult: mult })
  }, { flush: 'sync' })
  // The retry cap likewise: cleared by the kill, set by a hydrate's death.
  watch(bossHpCap, (cap) => {
    if (mode.value !== 'endless' || !engineRef) return
    eng().setConfig({ bossHpCap: cap })
  }, { flush: 'sync' })
  // Owed rewards land as soon as the run can take them.
  watch(pending, () => { if (phase.value === 'aim') deliverPending() })
  watch(holdSim, (held) => { if (!held && phase.value === 'aim') deliverPending() })
  // Cloud hydration — see the module header.
  watch(saveDataVersion, () => {
    if (mode.value !== 'endless' || !engineRef) return
    if (eng().state.phase === 'aim' && !holdSim.value) adoptHydratedRun()
    else hydratePending = true
  })
  // Anything the turn has not flushed yet must reach the blob before the page
  // goes away. `useEpicState` flushes on the same edge, but it registered
  // first — so write, then flush again ourselves.
  onGameSuspended(() => {
    flushTurn()
    flushPersist()
  })
  // The funnel's 3 / 5 / 8 min milestones ride the session play clock.
  watch(sessionPlaySeconds, (s) => funnelPlayTime(s), { flush: 'sync' })
}

/** The save shows play from an earlier session: the funnel's "returning"
 *  cohort. Read once, at the session's first milestone (the first shot), before
 *  that shot is counted into the stats. */
const hadPriorPlay = (): boolean =>
  stats.value.volleys > 0 || stats.value.bossKills > 0 || bestRow.value > 0

// ─── The singleton ───────────────────────────────────────────────────────────
let api: UseBarrage | null = null

const init = (): UseBarrage => {
  swapEngine(bootEndless())
  persistRun()
  installWatchers()
  setFunnelCohortResolver(() => (hadPriorPlay() ? 'returning' : 'new'))
  // The run owner's half of "active play": fired this session, board not held.
  installPlayClock(() => firedThisSession.value && !holdSim.value)
  const engine = engineRef as ShallowRef<IBarrageEngine>
  return {
    engine,
    engineGen,
    mode,
    phase,
    row,
    bestRow,
    nextBossRow,
    checkpointRow,
    tray,
    trayCapacity,
    volleyHits,
    fever,
    speedMul,
    boss,
    shields,
    revives,
    warcryArmed,
    maxBallTier,
    holdSim,
    breach,
    deathScene,
    bossChest,
    dailyResult,
    bonusBallsAvailable,
    lastSkill,
    fire,
    recall,
    continueWithMeteor,
    continueWithRevive,
    restartFromCheckpoint,
    claimBossChest,
    claimBonusBalls,
    startDaily,
    exitDaily,
    onEngineEvent,
    canStartDaily,
    grantBalls,
    grantSkillCharge
  }
}

export default function useBarrage(): UseBarrage {
  // Detached scope: the first caller is usually a component's setup, and
  // watchers created there would be stopped when THAT component unmounts —
  // taking the upgrade / hydrate / owed-reward watchers down with it.
  if (!api) api = effectScope(true).run(init) ?? null
  if (!api) throw new Error('[barrage] state layer failed to initialise')
  return api
}

// ─── Debug / cheats (not part of the contract) ───────────────────────────────
/** Rebuild the endless run at `row` with the current tray (dev cheats). */
const cheatJumpToRow = (target: number): void => {
  if (mode.value !== 'endless' || !engineRef) return
  const t = Math.max(1, Math.floor(target))
  const trayNow = eng().state.tray.length ? [...eng().state.tray] : [1]
  swapEngine(factory.createAtRow({ ...endlessConfig(), ftue: false }, t, trayNow))
  persistRun()
}

/** Edit the parked run through a snapshot round-trip ('aim' only). */
const cheatEditSnapshot = (edit: (snap: RunSnapshot) => void): boolean => {
  if (!engineRef) return false
  const snap = eng().snapshot()
  if (!snap) return false
  edit(snap)
  swapEngine(factory.restore(snap))
  persistRun()
  return true
}

export const barrageCheats = {
  jumpToRow: cheatJumpToRow,
  /** Jump so the NEXT spawned row is the boss. */
  jumpToNextBoss: (): void => cheatJumpToRow(Math.max(1, (engineRef?.value.state.nextBossRow ?? 10) - 1)),
  fillTray: (tier: number): boolean => cheatEditSnapshot((s) => {
    s.tray = Array.from({ length: Math.max(1, s.config.trayCapacity) }, () => Math.max(1, Math.floor(tier)))
  }),
  /** The flying chest launches within a moment. */
  forceChest: (): boolean => cheatEditSnapshot((s) => { s.chestTimer = 0.05 }),
  /** Every monster steps to the floor line and shields drop, so the next
   *  march breaches (fire once to trigger it). */
  forceBreach: (): boolean => cheatEditSnapshot((s) => {
    s.shields = 0
    for (const m of s.monsters) m.row = Math.max(m.row, ROWS - m.h)
  }),
  grantBalls,
  grantSkillCharge
}

// ─── Test hooks ──────────────────────────────────────────────────────────────
/** Test-only: swap the engine factory (null restores the real engine). Call
 *  before the first `useBarrage()` of a fresh module graph. */
export const __setEngineFactory = (f: EngineFactory | null): void => {
  factory = f ?? realFactory
}
