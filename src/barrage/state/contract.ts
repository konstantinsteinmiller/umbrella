/**
 * Elemental Barrage — STATE LAYER CONTRACT (lead-owned; STATE implements, UI + RENDER consume).
 *
 * Implementations live next to this file:
 *   useBarrage.ts          → `export default function useBarrage(): UseBarrage` (module singleton)
 *   useBarrageUpgrades.ts  → `export default function useBarrageUpgrades(): UseBarrageUpgrades`
 *   useCollections.ts      → `export default function useCollections(): UseCollections`
 *   useDailyBarrage.ts     → `export default function useDailyBarrage(): UseDailyBarrage`
 *   useSupplyDrop.ts       → `export default function useSupplyDrop(): UseSupplyDrop`
 * Fields may be ADDED; nothing listed here may be renamed or removed.
 */
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import type { BossKind, EngineListener, GameMode, IBarrageEngine, MonsterKind, Phase, SkillId, UpgradeId } from '../engine/types'
import type { BallSkinId } from '../ballSkins'

// ─── Run / board state ───────────────────────────────────────────────────────
export interface BossHud {
  monsterId: number
  bossKind: BossKind
  hp: number
  maxHp: number
  enraged: boolean
  /** (STATE, additive) Boss mercy: the share of its full HP this boss spawned
   *  with after the player's earlier losses to it (absent = 1, full HP). The
   *  bar draws the rest as a cracked-off chunk. */
  mercy?: number
}

export interface BreachOffer {
  /** The rewarded Meteor continue is still unused in this checkpoint segment
   *  AND a rewarded ad (or coin redeem) can run right now. */
  meteorAvailable: boolean
  /** A Revive charge can be spent for a free continue. */
  reviveAvailable: boolean
  /** Daily Barrage has no continues: a breach ends the daily run. */
  isDaily: boolean
  checkpointRow: number
  /** Row reached when the breach happened. */
  row: number
  /** (STATE, additive) This run's tally for the loss recap: the row it reached,
   *  and the kills made and coins earned since it started (the last checkpoint
   *  restart or fresh start — a Meteor/revive continue does not start a new
   *  run; boss chests count at what they paid). Endless only. */
  recap?: RunRecap
  /** (STATE, additive, playtest run 9) The monster that broke through — the
   *  death sequence's striker (render/death.ts `pickStriker`): the loss
   *  screen names it ("I never saw … which enemy crossed the line"). Endless
   *  only; absent when none stood past the line. */
  culprit?: BreachCulprit
  /** (STATE, additive) One-Tap Comeback's near-miss cue: the boss on the board
   *  at the breach, its HP left as a share of its full HP (0..1). Absent: no
   *  boss stood (or an older save). */
  bossLeft?: number
}

/** (STATE, additive) See `BreachOffer.culprit`. */
export interface BreachCulprit {
  kind: MonsterKind
  bossKind?: BossKind
}

/** (STATE, additive) See `BreachOffer.recap`. */
export interface RunRecap {
  row: number
  kills: number
  coins: number
}

export interface BossChestOffer {
  bossKind: BossKind
  row: number
  /** Coins the chest pays at 1×. */
  bounty: number
  /** The rewarded multiplier (3×: "▶ 3× ●") and whether it is possible right
   *  now (readiness-gated). */
  boostMult: number
  boostAvailable: boolean
  /** First-ever boss kill (UI: bigger celebration + CHECKPOINT banner). */
  first: boolean
}

export interface DailyResult {
  row: number
  best: number
  newBest: boolean
}

export interface UseBarrage {
  /** The live engine. Replaced (never mutated in place) on restart / daily start / cloud hydrate. */
  engine: ShallowRef<IBarrageEngine>
  /** Increments whenever `engine` is replaced — RENDER drops its display caches on change. */
  engineGen: Ref<number>
  mode: Ref<GameMode>
  // HUD mirrors — updated from engine events (not every frame).
  phase: Ref<Phase>
  row: Ref<number>
  bestRow: Ref<number>
  nextBossRow: Ref<number>
  checkpointRow: Ref<number>
  /** Sorted DESCENDING, same order as `engine.state.tray` — BallTray renders slot i as `[data-slot=i]`. */
  tray: Ref<number[]>
  trayCapacity: Ref<number>
  volleyHits: Ref<number>
  fever: Ref<boolean>
  speedMul: Ref<number>
  boss: Ref<BossHud | null>
  shields: Ref<number>
  revives: Ref<number>
  warcryArmed: Ref<boolean>
  /** Highest ball tier ever created (codex progress / launcher unlocks). */
  maxBallTier: Ref<number>
  /** True while the sim must not advance (breach / boss chest / daily result pending).
   *  BarrageBoard's loop skips `engine.update` when `holdSim || isGamePaused`. */
  holdSim: ComputedRef<boolean>
  breach: Ref<BreachOffer | null>
  /** Run 7: the death sequence is playing — the board tears the unit apart
   *  and "WASTED" holds over it (DeathOverlay). The breach offer and the
   *  daily result exist already but their screen waits until this is false
   *  again (≈1.2 s after a live breach). */
  deathScene: Readonly<Ref<boolean>>
  bossChest: Ref<BossChestOffer | null>
  dailyResult: Ref<DailyResult | null>
  /** Rewarded "+5 balls" is offered (phase aim, unused this checkpoint segment, ad ready). */
  bonusBallsAvailable: ComputedRef<boolean>
  /** The last skill that triggered (UI toast), cleared after display by UI. */
  lastSkill: Ref<SkillId | null>

  // ─── Actions ───
  fire(angle: number): boolean
  recall(): void
  /** Rewarded (or coin) Meteor continue. Resolves true when the run continues. */
  continueWithMeteor(): Promise<boolean>
  continueWithRevive(): boolean
  /** Rebuild the run at the checkpoint (keeps coins). Plays the checkpoint-restart
   *  interstitial per the cadence rule (never the first two restarts, ≥ 3 min apart). */
  restartFromCheckpoint(): Promise<void>
  /** Pay the boss chest; `double` runs the rewarded ad FIRST. Resolves to coins granted. */
  claimBossChest(double: boolean): Promise<number>
  claimBonusBalls(): Promise<boolean>
  /** Start today's seeded Daily Barrage run (the endless run is saved and resumed after). */
  startDaily(): void
  /** Leave the daily run (or dismiss its result) and resume the endless run. */
  exitDaily(): void
  /** Subscribe to engine events across engine swaps. */
  onEngineEvent(cb: EngineListener): () => void

  // ─── (STATE, additive) ───
  /** `startDaily()` would start a run right now: endless mode, phase aim, no
   *  breach / chest / result pending. */
  canStartDaily: ComputedRef<boolean>
  /** Give the ENDLESS run `n` balls of `tier` — delivered at once when it can
   *  take them, otherwise owed (and saved) until its next turn. */
  grantBalls(tier: number, n?: number): void
  /** Give the ENDLESS run a charge (shield / revive / warcry) at its next 'aim'. */
  grantSkillCharge(skill: SkillId): void
}

// ─── Upgrades ────────────────────────────────────────────────────────────────
export type { UpgradeId }

export interface UpgradeView {
  id: UpgradeId
  level: number
  maxed: boolean
  cost: number
  affordable: boolean
  /** Exactly one upgrade glows (or none): economy's `glowTrack` — the cheaper
   *  affordable power track (Damage / Capacity, tie → Damage), else the
   *  cheapest affordable other track; never a maxed one (CONTRACT §0.3). */
  glowing: boolean
  /** Current and next effect as numbers; UI formats (damage/bounty: multiplier,
   *  capacity: balls, speed: percent faster, luck: percent). */
  value: number
  nextValue: number | null
}

export interface UseBarrageUpgrades {
  list: ComputedRef<UpgradeView[]>
  glowingId: ComputedRef<UpgradeId | null>
  /** One level of `id` — every tap, every chip (playtest run 10: the glowing
   *  chip's up-to-5 multi-buy, runs 7–9, spent 89 coins on one tap and read as
   *  a bug; runs 7–8's bundle before it as "a double purchase"). */
  buy(id: UpgradeId): boolean
  /** FTUE beat: one free "Tray Capacity 3" after the first merge. Run 7: any
   *  chip tap takes it, and two aims after the FTUE hands over it is granted
   *  on its own (useTutorial). */
  freeCapacityOffer: ComputedRef<boolean>
  claimFreeCapacity(): void
  /** Run 8: the first Ball Damage level FREE after the Damage arrows were
   *  ignored three times (the coach arms it with `offerFreeDamage`). */
  freeDamageOffer: ComputedRef<boolean>
  offerFreeDamage(): void
  claimFreeDamage(): void
  /** The chip whose next level is free right now (Capacity first), and its claim. */
  freeId: ComputedRef<UpgradeId | null>
  claimFree(): void
}

// ─── Collections (launchers + ball skins) ────────────────────────────────────
export interface LauncherView {
  tier: number
  /** Seen = the player has made a ball of this tier (otherwise a silhouette). */
  seen: boolean
  owned: boolean
  price: number
  affordable: boolean
  selected: boolean
  /** (STATE, additive) Discovered but not yet looked at — cleared by `markLaunchersSeen`. */
  isNew: boolean
}

export interface BallSkinView {
  id: BallSkinId
  owned: boolean
  price: number
  affordable: boolean
  selected: boolean
  isNew: boolean
  /** (STATE, additive) Rewarded ads that unlock it instead of the coin price (0 = owned from the start). */
  adsNeeded: number
  /** (STATE, additive) Rewarded ads already watched towards it (kept across sessions). */
  adsWatched: number
  /** (STATE, additive) Rewarded ads are the only way in: coins cannot buy it
   *  (false on coin-mode builds, where the coin price stays the way in). */
  adOnly: boolean
}

/** (STATE, additive) Outcome of one rewarded ad towards a skin. */
export type SkinAdResult = 'unlocked' | 'progress' | 'none'

export interface UseCollections {
  launchers: ComputedRef<LauncherView[]>
  /** Fighter tier drawn as the launcher (default 1). */
  selectedLauncher: Ref<number>
  buyLauncher(tier: number): boolean
  selectLauncher(tier: number): void
  skins: ComputedRef<BallSkinView[]>
  selectedSkin: Ref<BallSkinId>
  buySkin(id: BallSkinId): boolean
  /** (STATE, additive) A rewarded ad can unlock skins right now (readiness
   *  gating; always false on coin-mode builds, which have no rewarded ads). */
  skinAdReady: ComputedRef<boolean>
  /** (STATE, additive) Play one rewarded ad towards skin `id`; the last one
   *  needed unlocks and equips it. 'none' = no ad granted (no fill, skipped, busy). */
  watchSkinAd(id: BallSkinId): Promise<SkinAdResult>
  selectSkin(id: BallSkinId): void
  markSkinsSeen(): void
  /** (STATE, additive) Clear the launcher NEW badges (call when the launcher list opens). */
  markLaunchersSeen(): void
  hasNew: ComputedRef<boolean>
}

// ─── Daily Barrage + supply drop ─────────────────────────────────────────────
export interface UseDailyBarrage {
  /** 'YYYY-MM-DD' (local) of today's board. */
  today: ComputedRef<string>
  seed: ComputedRef<number>
  todayBest: ComputedRef<number>
  attemptsToday: ComputedRef<number>
  /** Consecutive days with at least one daily attempt. */
  streak: ComputedRef<number>
  isActive: ComputedRef<boolean>
}

/** Treasure chest stage: filling, small gift waiting, big gift waiting. */
export type ChestStage = 'cooldown' | 'small' | 'big'

export interface UseSupplyDrop {
  /** A gift is waiting (small or big). */
  ready: ComputedRef<boolean>
  stage: ComputedRef<ChestStage>
  /** Milliseconds until the NEXT stage (0 once the big gift waits); ticks
   *  once per second while mounted. */
  msLeft: ComputedRef<number>
  /** 0 → 1 across the current wait (to the small gift, then to the big one). */
  progress: ComputedRef<number>
  /** What each gift pays right now (best row + Coin Bounty). */
  gifts: ComputedRef<{ small: number; big: number }>
  /** First sight: start the chest at the small stage. No-op afterwards. */
  arm(): void
  /** Opens the waiting gift (coins, and on a big one maybe a skill charge). */
  claim(): { coins: number; skill: SkillId | null; stage: 'small' | 'big' } | null
}
