/**
 * BoardRenderer — the Canvas-2D view of an Elemental Barrage board.
 *
 * Reads `engine.state` every frame (never writes it), reacts to engine events
 * with VFX/SFX, and keeps its own DISPLAY state per entity (eased positions,
 * flinch/flash timers, spawn pops) so the discrete engine rows read as smooth
 * marches and every hit makes a face squash.
 *
 * Mobile-first performance rules followed here:
 *   • every sprite / gradient / glow is a bake (per size); the frame is drawImage
 *   • fixed pools for views, trails and VFX — no allocations in the steady state
 *     (HP text re-formats only when a monster's HP changes)
 *   • no ctx.filter, no shadowBlur, one clip per frame
 */
import {
  BALL_R, COLS, FLOOR_Y, ROWS,
  type AimPath, type Ball, type BoardState, type BossKind, type EngineEvent, type Hazard, type IBarrageEngine,
  type Monster, type MonsterKind, type Pickup, type SkillId
} from '../engine/types'
import { ballColors, ballElement, coinSrc, fighterSrc, flyingChestSrc, impactSrc, skillSrc, SKILL_IDS, FIGHTER_ART_MAX } from '../art'
import { chargesAt, KIND_UNLOCK_ROW, WALKER_KINDS } from '../engine/monsters'
import type { BallSkinId } from '../ballSkins'
import type { ElementKind } from '@/game/ingredients'
import { formatBig } from '@/utils/bigNumber'
import { BallLooks, tierGlow } from './balls'
import { bakeBackdrop, bakeEdgeGlow, bakeRainbowFrame, bakeVGradient, FIELD_BANDS, fieldAnchors, type FieldArt } from './backdrop'
import { glyphGen, glyphs, SMALL_INT_STR } from './glyphs'
import { BOARD_TOP, computeLayout, makeLayout } from './layout'
import { BOSS_COLOR, MONSTER_COLOR, MonsterLooks, monsterSpriteSrc, type MonsterBake } from './monsters'
import { BoardSfx, hitSoundFor, SHOT_IDS } from './sfx'
import { canvasesCreated, createCanvas, ctx2d, glowDot, rgba, sprite, type SpriteImage } from './sprites'
import { bakeFrostStar, BoardVfx, type DmgNum } from './vfx'
import { cellFree, healTargets, RuleBadges, ruleIconOf, tagKeyOf, type RuleIcon } from './ruleMarks'
import { DANGER_PIP_MARCHES, marchesToBreach, nextMarchTurn } from './danger'

const TAU = Math.PI * 2
/** Seconds a meteor falls (vfx.meteor's `dur`). */
const METEOR_FALL = 0.42
/** Rows before a depth band starts that its floor painting begins loading. */
const FIELD_PREFETCH_ROWS = 6
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeOutBack = (t: number): number => {
  const c1 = 1.9
  const c3 = c1 + 1
  const u = t - 1
  return 1 + c3 * u * u * u + c1 * u * u
}

// ─── Per-tier lookups (computed once; ballColors() allocates) ────────────────
interface TierInfo {
  el: ElementKind
  body: string
  light: string
  accent: string
  glow: string
  sheet: SpriteImage
}
const tierInfos: TierInfo[] = []
const tierInfo = (tier: number): TierInfo => {
  const t = Math.max(1, Math.min(FIGHTER_ART_MAX, tier | 0))
  let ti = tierInfos[t]
  if (!ti) {
    const c = ballColors(t)
    const el = ballElement(t)
    ti = { el, body: c.body, light: c.light, accent: c.accent, glow: c.glow, sheet: sprite(impactSrc(el)) }
    tierInfos[t] = ti
  }
  return ti
}

const monsterColor = (kind: MonsterKind, boss: BossKind | undefined): string =>
  kind === 'boss' ? BOSS_COLOR[boss ?? 'slime-tower'] : MONSTER_COLOR[kind]

// ─── Display views ───────────────────────────────────────────────────────────
interface MonsterView {
  id: number
  m: Monster | null
  kind: MonsterKind
  bossKind: BossKind | undefined
  corrupted: boolean
  w: number
  h: number
  src: string
  bake: MonsterBake | null
  bakeGen: number
  /** Display column / row of the footprint's top-left. */
  x: number
  y: number
  vy: number
  spawn: number
  flinch: number
  fdx: number
  fdy: number
  flash: number
  hopFrom: number
  hopTo: number
  hopT: number
  phase: number
  seen: number
  hpShown: number
  hpText: string
  /** Baked HP label (plate + digits), re-baked only when the text/variant/size changes. */
  label: HTMLCanvasElement | null
  labelText: string
  labelVariant: number
  labelGen: number
  labelGlyph: number
  labelW: number
  labelH: number
  num: DmgNum | null
  lastImpact: number
  emberT: number
  heal: number
  enrage: number
  color: string
  /** Renderer time a meteor aimed at this monster lands (−1: none). */
  meteorAt: number
  /** Killed, but kept on screen until its meteor lands (−1: alive / normal death). */
  dieAt: number
  dieKind: MonsterKind
  dieCorrupted: boolean
  /** Sprite scale inside the footprint (a little imp is drawn small). */
  scale: number
  /** Carbuncle shield grow-in, 0 → 1 after it comes back up. */
  shieldIn: number
  /** First-session kill hold: renderer time it started (−1: none), the HP the
   *  plate counts down from, and the kill's coins, flown once it poofs. */
  holdAt: number
  holdHp: number
  holdCoins: number
  /** Marches until it crosses the line (render/danger.ts): 1..DANGER_PIP_MARCHES
   *  wears the countdown pip; 0 / more = none. Refreshed every frame. */
  marches: number
  /** Boss roar (run 3): renderer time the shockwave reaches this walker (−1:
   *  none), whether it has struck yet, and the unit direction it is flung. */
  roarAt: number
  roarHit: boolean
  blowX: number
  blowY: number
  /** A boss's first hit already popped its extra-big number. */
  bigHit: boolean
}

/** Where a roared walker is drawn this frame (scratch, no allocation). */
interface BlowPose { x: number; y: number; s: number; r: number; a: number }
/** The overrun demo (CONTRACT §10 `overrunDemo`): a ghost of a monster walks
 *  its coming marches across the line. Display only. */
interface OverrunGhost {
  on: boolean
  t: number
  dur: number
  /** Demo time it was told to stop (−1: running): a quick fade from there. */
  stopAt: number
  bake: MonsterBake | null
  w: number
  h: number
  scale: number
  /** Footprint column, top row at the start and at the end of the walk. */
  x: number
  y0: number
  y1: number
  hops: number
  walkAt: number
  walkDur: number
  dissolveAt: number
  flashed: boolean
  dissolved: boolean
  reduced: boolean
}

/** A little imp (the imp's split) inside its one cell. */
const MINI_SCALE = 0.66
/**
 * First session only (`config.ftue`): blind first-timers never saw a kill
 * register — a 1–3 HP monster vanished in the frame the ball touched it. So a
 * kill holds on screen this long (s): white flash, the HP plate ticking to 0
 * (over KILL_TICK), a squash, then the poof and its coin flight. Display
 * only — the engine removed the monster the moment it died.
 */
const KILL_HOLD = 0.4
const KILL_TICK = 0.18
/** First session — and on a boss, always: damage numbers this much bigger.
 *  Playtest run 2: the first boss's HP bar "didn't move" for the testers;
 *  big numbers on it are the proof every hit counts. */
const FTUE_NUM_SCALE = 1.5
/** Playtest run 3 ("no on-boss hit number"): the first hit on each boss pops
 *  a number this many times the boss number, on the boss, lasting longer. */
const BOSS_FIRST_HIT_SCALE = 2
const BOSS_FIRST_HIT_LIFE = 1.15
/**
 * The first boss's roar (`bossRoar`, playtest run 3): a shockwave from the
 * boss that flings every walker away as it reaches them — never the
 * first-session kill hold (≈10 kills at once must not stall or stack).
 * Ring radii (cells) and life (s); a walker is struck when the ring reaches
 * it, at most ROAR_MAX_DELAY after the roar (its coins leave then, inside the
 * wallet's 0.4 s first-session pop delay), then flies BLOW_DIST cells away
 * over BLOW_DUR, spinning and shrinking, and poofs.
 */
const ROAR_R0 = 1
const ROAR_R1 = 12
const ROAR_LIFE = 0.75
const ROAR_MAX_DELAY = 0.4
const BLOW_DUR = 0.55
const BLOW_DIST = 2.6
/** Overrun demo timings (s): fade in, the walk, standing past the line, the dissolve, a stop's fade. */
const DEMO_IN = 0.25
const DEMO_WALK = 1.2
const DEMO_HOLD = 0.3
const DEMO_OUT = 0.5
const DEMO_STOP = 0.18
/** Reduced motion: the ghost appears past the line and holds this long before dissolving. */
const DEMO_IN_STILL = 0.3
const DEMO_HOLD_STILL = 1.2
/** The ghost's walk ends with its bottom edge here — on the launcher's floor
 *  line, clear of the real monster (whose bottom edge is on the line at most). */
const DEMO_END_BOTTOM = FLOOR_Y + 0.05
/** The flash comes once the ghost's bottom edge is this far past the line (cells):
 *  visibly across, not a hair over it. */
const DEMO_FLASH_PAST = 0.5
/** The line's skull glyph (cells): size, and its centre just above the line at both ends. */
const SKULL_SIZE = 0.34
const SKULL_INSET = 0.24
const SKULL_LIFT = 0.06
/** Page-wide: the first flying chest of a session wears the tap hint. */
let chestHintsLeft = 1

/** The HP a hit / tick actually removed (`dealt`, playtest run 3: overkill is
 *  not shown); `dmg` for an engine that does not send it yet. */
const dealtOf = (e: { dmg: number; dealt: number }): number =>
  typeof e.dealt === 'number' && Number.isFinite(e.dealt) ? e.dealt : e.dmg

const newMonsterView = (): MonsterView => ({
  id: 0, m: null, kind: 'slime', bossKind: undefined, corrupted: false, w: 1, h: 1, src: '', bake: null, bakeGen: -1,
  x: 0, y: 0, vy: 0, spawn: 1, flinch: 0, fdx: 0, fdy: 0, flash: 0, hopFrom: 0, hopTo: 0, hopT: -1, phase: 0,
  seen: 0, hpShown: -1, hpText: '', label: null, labelText: '', labelVariant: -1, labelGen: -1, labelGlyph: -1, labelW: 0, labelH: 0, num: null, lastImpact: -1, emberT: 0, heal: 0, enrage: 0, color: '#fff',
  meteorAt: -1, dieAt: -1, dieKind: 'slime', dieCorrupted: false, scale: 1, shieldIn: 1, holdAt: -1, holdHp: 0, holdCoins: 0, marches: 0,
  roarAt: -1, roarHit: false, blowX: 0, blowY: 0, bigHit: false
})

interface CellView {
  id: number
  x: number
  y: number
  spawn: number
  phase: number
  seen: number
  p: Pickup | null
  h: Hazard | null
}
const newCellView = (): CellView => ({ id: 0, x: 0, y: 0, spawn: 0, phase: 0, seen: 0, p: null, h: null })

const TRAIL_N = 7
interface Trail {
  id: number
  xs: Float32Array
  ys: Float32Array
  head: number
  count: number
  seen: number
}
const newTrail = (): Trail => ({ id: 0, xs: new Float32Array(TRAIL_N), ys: new Float32Array(TRAIL_N), head: 0, count: 0, seen: 0 })

export interface RendererHooks {
  /** Scene-wide screen shake (useScreenshake) — the renderer only asks for big moments. */
  shake(intensity: 'small' | 'strong' | 'big'): void
  /** Coins earned at a canvas point (CSS px): fly them to the wallet. Return false if there is no wallet target. */
  coins(canvasX: number, canvasY: number, amount: number): boolean
  /** A confetti burst at a canvas point (CSS px). */
  confetti(canvasX: number, canvasY: number, count: number): void
}

export interface RendererStats {
  /** Offscreen canvases (bakes) created in the worst frame of the window. */
  peakBakes: number
  /** Last frame's renderer CPU time (update + draw), ms. */
  frameMs: number
  /** Exponential average, ms. */
  avgMs: number
  /** Worst frame over the last ~2 s, ms. */
  peakMs: number
  balls: number
  monsters: number
}

const SKILL_SFX: Record<SkillId, string> = {
  meteor: 'meteor-impact',
  warcry: 'skill-warcry',
  legion: 'skill-legion-call',
  pact: 'skill-soul-pact',
  shield: 'barricade',
  execute: 'skill-execute',
  heal: 'level-up',
  revive: 'reward-continue'
}
const SKILL_TINT: Record<SkillId, string> = {
  meteor: '#ff7a2a', warcry: '#ff5a3c', legion: '#9fd8ff', pact: '#c05cff',
  shield: '#5ab8ff', execute: '#ff3050', heal: '#6fe08a', revive: '#ffe27a'
}

export class BoardRenderer {
  readonly layout = makeLayout()
  readonly vfx = new BoardVfx()
  readonly stats: RendererStats = { peakBakes: 0, frameMs: 0, avgMs: 0, peakMs: 0, balls: 0, monsters: 0 }
  /** Fighter tier drawn as the launcher. */
  launcherTier = 1
  skin: BallSkinId = 'orb'
  /** prefers-reduced-motion: no shakes, softer flashes. */
  reducedMotion = false
  /** Badge keys (`ruleMarks.tagKeyOf`) whose rule badge has done its turns
   *  (the coach owns that clock). Every other non-slime monster wears one. */
  coachRetired: ReadonlySet<string> = new Set()

  private readonly ballLooks = new BallLooks()
  private readonly monsterLooks = new MonsterLooks()
  private readonly badges = new RuleBadges()
  /** A "+1" collected this step; its tray outcome (merge / coins) arrives in
   *  the same synchronous event burst, so the pop is drawn once it settles. */
  private plusPending = false
  private plusX = 0
  private plusY = 0
  private plusMerge = 0
  private plusCoins = false
  private ctx: CanvasRenderingContext2D | null = null
  private engine: IBarrageEngine | null = null
  private readonly sfx: BoardSfx
  private readonly hooks: RendererHooks

  private time = 0
  private timeScale = 1
  private frameNo = 0
  private bakeGen = 0
  private synced = false
  private peakWindow = 0
  private curPeak = 0
  private curPeakBakes = 0

  private readonly views = new Map<number, MonsterView>()
  private readonly viewList: MonsterView[] = []
  private readonly viewPool: MonsterView[] = []
  private readonly pickViews = new Map<number, CellView>()
  private readonly pickList: CellView[] = []
  private readonly hazViews = new Map<number, CellView>()
  private readonly hazList: CellView[] = []
  private readonly cellPool: CellView[] = []
  private readonly trails = new Map<number, Trail>()
  private readonly trailList: Trail[] = []
  private readonly trailPool: Trail[] = []
  private readonly scratchX = new Float32Array(TRAIL_N + 2)
  private readonly scratchY = new Float32Array(TRAIL_N + 2)

  // launcher
  private lx = COLS / 2
  private kick = 0
  private countShown = -1
  private countText = ''
  private pedestal: HTMLCanvasElement | null = null
  private pedestalTier = -1

  // bakes (per size)
  private backdrop: HTMLCanvasElement | null = null
  /** Painted floor per FIELD_BANDS entry (null = none shipped / art off). */
  private fieldSrcs: (string | null)[] = FIELD_BANDS.map(() => null)
  /** The painting `backdrop` was baked from (null = the procedural floor). */
  private fieldSrc: string | null = null
  /** The floor being crossfaded away after a band change, and how much of it is left. */
  private prevBackdrop: HTMLCanvasElement | null = null
  private backdropFade = 0
  private dangerGrad: HTMLCanvasElement | null = null
  private feverFrame: HTMLCanvasElement | null = null
  private redEdge: HTMLCanvasElement | null = null
  private aimDot: HTMLCanvasElement | null = null
  private frostStar: HTMLCanvasElement | null = null
  private bubble: HTMLCanvasElement | null = null
  private bubbleGold: HTMLCanvasElement | null = null
  private sludge: HTMLCanvasElement | null = null
  /** A carbuncle's gem shield: the bubble drawn round it while the shield is up. */
  private gemShield: HTMLCanvasElement | null = null
  private readonly plates: (HTMLCanvasElement | undefined)[] = []

  // sprites
  private readonly coin: SpriteImage
  private readonly chest: SpriteImage
  private readonly skillIcons = new Map<SkillId, SpriteImage>()
  private readonly fighterSprites: SpriteImage[] = []

  // overlays / feel
  private danger = 0
  private dangerKick = 0
  private fever = 0
  private breach = 0
  private flashWhite = 0
  private flashRed = 0
  private flashGold = 0
  private flashBlue = 0
  private shakeT = 0
  private shakeMag = 0
  private chestSparkT = 0
  /** Flying chest pop-in, 0 → 1 after it appears (1 when adopted mid-flight). */
  private chestIn = 1
  /** This chest wears the wordless tap hint (ring + tapping hand). */
  private chestHint = false
  private tapHand: HTMLCanvasElement | null = null
  /** A kill held this event burst: its `coins` event (same burst) waits for the poof. */
  private heldKill: MonsterView | null = null
  /** This aim phase already shook + sounded the "the next march breaches" warning. */
  private aimWarned = false
  /** Countdown pip discs (render/danger.ts): '1' red, '2' amber; the digit is a glyph blit. */
  private pipRed: HTMLCanvasElement | null = null
  private pipAmber: HTMLCanvasElement | null = null
  /** The line's skull glyph (bone = dim, red = lit), baked per size. */
  private skullBone: HTMLCanvasElement | null = null
  private skullRed: HTMLCanvasElement | null = null
  /** 0 → 1 while any monster wears a '1' pip (eased). */
  private skullLit = 0
  /** The overrun demo's line flash, the skulls' flash, and the big skull where the ghost crossed. */
  private lineFlash = 0
  private skullFlash = 0
  private crossSkull = 0
  private crossX = 0
  /** The demo was cut short: its flashes fade as fast as the ghost. */
  private demoCut = false
  private readonly demo: OverrunGhost = {
    on: false, t: 0, dur: 0, stopAt: -1, bake: null, w: 1, h: 1, scale: 1, x: 0, y0: 0, y1: 0, hops: 1,
    walkAt: 0, walkDur: 0, dissolveAt: 0, flashed: false, dissolved: false, reduced: false
  }
  /** The ghost's top row and hop lift this frame (scratch). */
  private ghostY = 0
  private ghostLift = 0
  /** A boss roared before its view existed: its roar pulse waits for the view. */
  private roarBossId = -1
  private readonly blow: BlowPose = { x: 0, y: 0, s: 1, r: 0, a: 1 }

  // aim
  private aimArmed = false
  private aimAngle = Math.PI / 2
  private aimPath: AimPath | null = null
  private aimPathAngle = NaN

  constructor(hooks: RendererHooks, sfx?: BoardSfx) {
    this.hooks = hooks
    this.sfx = sfx ?? new BoardSfx()
    this.coin = sprite(coinSrc())
    this.badges.coin = this.coin
    this.chest = sprite(flyingChestSrc())
    for (const id of SKILL_IDS) this.skillIcons.set(id, sprite(skillSrc(id)))
    this.vfx.meteorSprite = this.skillIcons.get('meteor') ?? null
    this.vfx.onMeteorLand = (x, y, big) => this.meteorLanded(x, y, big)
    // Auto-collected "+1": the normal collect sound, softer and higher, per lift-off
    // (the stagger makes an FTUE double collect read as two); a small pop on arrival.
    this.vfx.onFlierLaunch = (x, y) => {
      this.vfx.ring(x, y, 0.2, 0.55, 0.3, '#7dff9a', 0.05)
      this.sfx.request('unit-spawn', 0.022, 1.5, 3, 50, 'auto-plus')
    }
    this.vfx.onFlierArrive = (x, y) => {
      this.kick = Math.max(this.kick, 0.6)
      this.vfx.ring(x, y, 0.15, 0.7, 0.3, '#7dff9a', 0.06)
      this.vfx.burst(x, y, 5, 2.5, '#7dff9a', 0.08, 0.35)
    }
    // Warm the common art so the first volley never pops in.
    for (const k of ['slime', 'goblin', 'caterpillar', 'ogre', 'centaur', 'dryad'] as const) sprite(monsterSpriteSrc(k, undefined))
    for (let t = 1; t <= 12; t++) this.fighter(t)
    for (let t = 1; t <= 10; t++) void tierInfo(t)
  }

  get sounds(): BoardSfx {
    return this.sfx
  }

  /** Alpha canvas: the letterbox around the board is left clear for the scene
   *  painting behind it. */
  attach(canvas: HTMLCanvasElement): void {
    this.ctx = canvas.getContext('2d')
  }

  /** The painted floor per depth band, in FIELD_BANDS order (null = none). The
   *  backdrop swaps once the painting for the current row has decoded. */
  setFieldArt(srcs: readonly (string | null)[]): void {
    this.fieldSrcs = FIELD_BANDS.map((_, i) => srcs[i] ?? null)
  }

  /** Band index whose painting should be on the floor at `row` (−1 = procedural):
   *  the deepest band reached that has a usable painting. */
  private fieldBand(row: number): number {
    for (let i = FIELD_BANDS.length - 1; i >= 0; i--) {
      const src = this.fieldSrcs[i]
      if (!src || row < FIELD_BANDS[i]!.from || !fieldAnchors(FIELD_BANDS[i]!.key)) continue
      if (sprite(src).failed) continue
      return i
    }
    return -1
  }

  private fieldArt(band: number): FieldArt | null {
    const src = band < 0 ? null : this.fieldSrcs[band]
    const a = band < 0 ? null : fieldAnchors(FIELD_BANDS[band]!.key)
    if (!src || !a) return null
    const sp = sprite(src)
    return sp.ready ? { img: sp.img, a } : null
  }

  /** Re-bake the backdrop when the floor for this row changed — once its
   *  painting has decoded (until then the old floor stays) — and crossfade. */
  private syncField(row: number): void {
    // Warm the next band's painting a few rows early, so the zone change at
    // the boss is a crossfade rather than a wait on the download.
    for (let i = 0; i < FIELD_BANDS.length; i++) {
      if (FIELD_BANDS[i]!.from <= row) continue
      const next = this.fieldSrcs[i]
      if (next && row >= FIELD_BANDS[i]!.from - FIELD_PREFETCH_ROWS) sprite(next)
      break
    }
    const band = this.fieldBand(row)
    const want = band < 0 ? null : this.fieldSrcs[band]!
    if (want === this.fieldSrc || this.layout.cssW === 0) return
    const art = this.fieldArt(band)
    if (want && !art) return
    this.fieldSrc = want
    this.prevBackdrop = this.backdrop
    this.backdropFade = this.backdrop ? 1 : 0
    this.backdrop = bakeBackdrop(this.layout, art)
  }

  /** Clear everything outside the letterboxed board: nothing owns it but the
   *  scene behind the canvas, and shaken overlays can stray a few px into it. */
  private clearLetterbox(ctx: CanvasRenderingContext2D): void {
    const l = this.layout
    const d = l.dpr
    const cw = ctx.canvas.width
    const ch = ctx.canvas.height
    const x0 = Math.floor(l.bx * d)
    const x1 = Math.ceil((l.bx + l.bw) * d)
    const y0 = Math.floor(l.by * d)
    const y1 = Math.ceil((l.by + l.bh) * d)
    if (x0 > 0) ctx.clearRect(0, 0, x0, ch)
    if (x1 < cw) ctx.clearRect(x1, 0, cw - x1, ch)
    if (y0 > 0) ctx.clearRect(x0, 0, x1 - x0, y0)
    if (y1 < ch) ctx.clearRect(x0, y1, x1 - x0, ch - y1)
  }

  /** Swap the engine (engineGen changed): drop every display cache. */
  setEngine(engine: IBarrageEngine | null): void {
    this.engine = engine
    this.views.clear()
    for (const v of this.viewList) {
      v.m = null
      v.num = null
      this.viewPool.push(v)
    }
    this.viewList.length = 0
    this.pickViews.clear()
    this.hazViews.clear()
    for (const v of this.pickList) { v.p = null; this.cellPool.push(v) }
    for (const v of this.hazList) { v.h = null; this.cellPool.push(v) }
    this.pickList.length = 0
    this.hazList.length = 0
    this.trails.clear()
    for (const t of this.trailList) this.trailPool.push(t)
    this.trailList.length = 0
    this.vfx.clear()
    this.sfx.clear()
    this.synced = false
    this.aimArmed = false
    this.aimPath = null
    this.aimPathAngle = NaN
    this.heldKill = null
    this.aimWarned = false
    this.chestIn = 1
    this.chestHint = false
    this.flashWhite = this.flashRed = this.flashGold = this.flashBlue = 0
    this.danger = this.dangerKick = this.breach = 0
    this.skullLit = this.lineFlash = this.skullFlash = this.crossSkull = 0
    this.demoCut = false
    this.demo.on = false
    this.demo.bake = null
    this.roarBossId = -1
    this.timeScale = 1
    if (engine) {
      this.lx = engine.state.launcherX
      this.warmWalkers(engine.state.row)
    }
  }

  /** Canvas box changed (CSS px + capped DPR): re-layout and re-bake size-dependent art. */
  resize(cssW: number, cssH: number, dpr: number): void {
    const l = computeLayout(this.layout, cssW, cssH, dpr)
    const cellDev = l.cell * dpr
    this.ballLooks.setCell(cellDev)
    this.monsterLooks.setCell(cellDev)
    this.bakeGen++
    this.backdrop = bakeBackdrop(l, this.fieldArt(this.fieldSrc ? this.fieldSrcs.indexOf(this.fieldSrc) : -1))
    this.prevBackdrop = null
    this.backdropFade = 0
    this.dangerGrad = bakeVGradient(64, [[0, 'rgba(255,40,50,0)'], [0.7, 'rgba(255,40,50,0.35)'], [1, 'rgba(255,40,50,0.6)']])
    const bw = Math.max(8, Math.round(COLS * l.cell * dpr))
    const bh = Math.max(8, Math.round((FLOOR_Y + BOARD_TOP) * l.cell * dpr))
    this.feverFrame = bakeRainbowFrame(bw, bh)
    this.redEdge = bakeEdgeGlow(Math.max(8, Math.round(bw / 2)), Math.max(8, Math.round(bh / 2)), 'rgba(255,20,40,0.85)', 0.5)
    this.aimDot = glowDot(Math.max(8, Math.round(l.cell * dpr * 0.3)), '#bfe8ff', 0.42)
    this.frostStar = bakeFrostStar(Math.max(16, Math.round(l.cell * dpr * 1.3)))
    this.bubble = this.bakeBubble(Math.round(l.cell * dpr * 0.72), 'rgba(200,240,255,0.85)', 'rgba(150,215,255,0.14)')
    this.bubbleGold = this.bakeBubble(Math.round(l.cell * dpr * 0.72), 'rgba(255,226,122,0.95)', 'rgba(255,210,90,0.16)')
    this.sludge = this.bakeSludge(Math.round(l.cell * dpr * 0.95))
    this.gemShield = this.bakeBubble(Math.round(l.cell * dpr * 1.12), 'rgba(140,215,255,0.95)', 'rgba(80,165,255,0.2)')
    this.tapHand = this.bakeTapHand(Math.round(l.cell * dpr * 0.8))
    this.pipRed = this.bakePip(Math.round(l.cell * dpr * 0.5), '#ff2a3a', '#7a0010')
    this.pipAmber = this.bakePip(Math.round(l.cell * dpr * 0.5), '#ff9a2a', '#6a3000')
    // Baked big enough for the demo's flash (≈2.4× the resting size) to stay crisp.
    const skullPx = Math.round(l.cell * dpr * SKULL_SIZE * 2.4)
    this.skullBone = this.bakeSkull(skullPx, '#efe6d2', '#1a1016', 'rgba(16,10,18,0.92)')
    this.skullRed = this.bakeSkull(skullPx, '#ff4a55', '#3a0008', 'rgba(42,0,8,0.95)')
    this.badges.setSize(l.cell * dpr * 0.46)
    this.plates.length = 0
    this.pedestal = null
    this.pedestalTier = -1
    for (const v of this.viewList) v.bake = null
    // The demo's ghost holds a bake of the old size: let it go.
    this.demo.on = false
    this.demo.bake = null
  }

  // ─── Aim ───────────────────────────────────────────────────────────────────
  /** Show / hide the aim preview. The engine's aimPreview is only re-queried
   *  when the angle moved. The board passes `armed` true only while a finger
   *  is down (off the launcher pad) — this is the ONLY way a preview gets
   *  drawn, so an idle board never shows a stale or static aim line. */
  setAim(armed: boolean, angle: number): void {
    this.aimArmed = armed
    this.aimAngle = angle
    // A finger aiming ends the lose-rule demo (the board also stops it on press).
    if (armed) this.stopOverrunDemo()
    if (!armed) {
      this.aimPath = null
      this.aimPathAngle = NaN
      return
    }
    // (NaN-safe: the first call after a reset always queries.)
    if (this.engine && !(Math.abs(angle - this.aimPathAngle) <= 1e-4)) {
      this.aimPath = this.engine.aimPreview(angle)
      this.aimPathAngle = angle
    }
  }

  /** Display x of the launcher (cells). */
  launcherX(): number {
    return this.lx
  }

  // ─── Overrun demo (CONTRACT §10) ───────────────────────────────────────────
  /**
   * The wordless lose-rule demo (playtest run 3: testers who never breached
   * never learned what the line does). A pale ghost of the monster (its own
   * sprite, ~55% alpha) steps out from under it — the real monster stays
   * drawn in place — and walks its coming marches down across the line onto
   * the launcher's floor (DEMO_WALK); half a row past the line, the line
   * flashes red and the skulls flash big under it; the ghost dissolves
   * (~2.25 s). Reduced motion: no walk — the ghost appears past
   * the line, the flash, the dissolve (~1.95 s). The real board is untouched.
   * It fades out at once (DEMO_STOP) when an aim starts or the phase leaves
   * 'aim'. Returns its duration in ms; 0 when it cannot play (not aiming, a
   * finger down, the monster gone or not drawn yet).
   */
  overrunDemo(monsterId: number): number {
    const s = this.engine?.state
    if (!s || s.phase !== 'aim' || this.aimArmed || this.layout.cssW === 0) return 0
    const v = this.views.get(monsterId)
    const m = v?.m
    if (!v || !m || v.dieAt >= 0 || !v.bake) return 0
    const d = this.demo
    d.on = true
    d.t = 0
    d.stopAt = -1
    this.demoCut = false
    d.bake = v.bake
    d.w = v.w
    d.h = v.h
    d.scale = v.scale
    d.x = m.col
    d.y0 = m.row
    d.y1 = Math.max(m.row + 0.5, DEMO_END_BOTTOM - m.h)
    // At least two steps, so even a last-row monster reads as walking.
    d.hops = Math.max(2, Math.ceil(d.y1 - d.y0 - 1e-6))
    d.reduced = this.reducedMotion
    d.flashed = false
    d.dissolved = false
    if (d.reduced) {
      d.walkAt = 0
      d.walkDur = 0
      d.dissolveAt = DEMO_IN_STILL + DEMO_HOLD_STILL
    } else {
      d.walkAt = DEMO_IN
      d.walkDur = DEMO_WALK
      d.dissolveAt = DEMO_IN + DEMO_WALK + DEMO_HOLD
    }
    d.dur = d.dissolveAt + DEMO_OUT
    return Math.round(d.dur * 1000)
  }

  /** End the overrun demo with a quick fade (no-op when none is playing). */
  stopOverrunDemo(): void {
    const d = this.demo
    if (d.on && d.stopAt < 0) d.stopAt = d.t
  }

  /** The overrun demo is on screen (tests / dev probes). */
  get overrunDemoPlaying(): boolean {
    return this.demo.on
  }

  // ─── Frame ─────────────────────────────────────────────────────────────────
  /** Advance display state by `dt` real seconds and draw. */
  frame(dt: number): void {
    const e = this.engine
    const ctx = this.ctx
    if (!e || !ctx || !this.backdrop) return
    const t0 = performance.now()
    const c0 = canvasesCreated
    this.timeScale += (1 - this.timeScale) * Math.min(1, dt * 0.9)
    const vdt = dt * this.timeScale
    this.time += vdt
    this.update(vdt, e.state)
    this.draw(ctx, e.state)
    this.sfx.flush()
    const ms = performance.now() - t0
    this.stats.frameMs = ms
    this.stats.avgMs += (ms - this.stats.avgMs) * 0.05
    if (ms > this.curPeak) {
      this.curPeak = ms
      this.curPeakBakes = canvasesCreated - c0
    }
    this.peakWindow += dt
    if (this.peakWindow > 2) {
      this.peakWindow = 0
      this.stats.peakMs = this.curPeak
      this.stats.peakBakes = this.curPeakBakes
      this.curPeak = 0
    }
  }

  /** Redraw without advancing (paused / resized while paused). */
  redraw(): void {
    const e = this.engine
    if (!e || !this.ctx || !this.backdrop) return
    this.update(0, e.state)
    this.draw(this.ctx, e.state)
  }

  // ─── Update ────────────────────────────────────────────────────────────────
  private update(dt: number, s: BoardState): void {
    const frame = ++this.frameNo
    this.syncField(s.row)
    if (this.prevBackdrop) {
      this.backdropFade -= dt * 1.25
      if (this.backdropFade <= 0) {
        this.backdropFade = 0
        this.prevBackdrop = null
      }
    }
    if (this.plusPending) this.flushPlus()
    // Every event burst ran inside engine.update(), before this frame.
    this.heldKill = null
    const pop = this.synced
    const kPos = 1 - Math.exp(-dt * 14)

    // Monsters.
    const ms = s.monsters
    const nextTurn = nextMarchTurn(s)
    let breachNext = false
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]!
      let v = this.views.get(m.id)
      if (!v) {
        v = this.viewPool.pop() ?? newMonsterView()
        this.initView(v, m, pop)
        this.views.set(m.id, v)
        this.viewList.push(v)
      }
      v.m = m
      v.seen = frame
      if (m.id === this.roarBossId) {
        // The boss that roared on arrival: its white roar pulse.
        this.roarBossId = -1
        v.enrage = 1
        v.flinch = 1
      }
      v.marches = nextTurn >= 0 ? marchesToBreach(m, nextTurn) : 0
      if (v.marches === 1) breachNext = true
      if (v.bake === null || v.bakeGen !== this.bakeGen) {
        if (sprite(v.src).ready) {
          v.bake = this.monsterLooks.get(v.src, v.kind, v.corrupted, v.w, v.h)
          v.bakeGen = this.bakeGen
        }
      }
      // Horizontal: hop arc tween, else ease.
      if (v.hopT >= 0) {
        v.hopT += dt / 0.34
        if (v.hopT >= 1) {
          v.hopT = -1
          v.x = m.col
          v.flinch = Math.max(v.flinch, 0.6)
          v.fdx = 0
          v.fdy = 1
        }
      } else {
        v.x += (m.col - v.x) * kPos
      }
      // Vertical: under-damped spring → marches land with a little stomp.
      const w = v.kind === 'boss' ? 13 : 17
      const acc = (m.row - v.y) * w * w - 2 * 0.62 * w * v.vy
      v.vy += acc * dt
      v.y += v.vy * dt
      if (Math.abs(m.row - v.y) < 0.002 && Math.abs(v.vy) < 0.01) { v.y = m.row; v.vy = 0 }
      if (v.spawn < 1) v.spawn = Math.min(1, v.spawn + dt / 0.32)
      v.flinch = Math.max(0, v.flinch - dt * 4.2)
      v.flash = Math.max(0, v.flash - dt * 7)
      v.heal = Math.max(0, v.heal - dt * 1.6)
      v.enrage = Math.max(0, v.enrage - dt * 1.4)
      if (v.shieldIn < 1) v.shieldIn = Math.min(1, v.shieldIn + dt * 2.6)
      // HP text only re-formats on change.
      const hp = m.hp <= 0 ? 0 : Math.ceil(m.hp)
      // A meteor in the air: the number drops when the rock lands, not before.
      if (hp !== v.hpShown && !(v.meteorAt > this.time)) {
        v.hpShown = hp
        v.hpText = hp < 1000 ? SMALL_INT_STR[hp]! : formatBig(hp)
      }
      // Status emitters: embers (burn), bubbles (poison).
      if (dt > 0 && (m.burnTurns > 0 || m.poisonStacks > 0)) {
        v.emberT -= dt
        if (v.emberT <= 0) {
          v.emberT = 0.16 + Math.random() * 0.1
          const ex = v.x + v.w * (0.2 + Math.random() * 0.6)
          const ey = v.y + v.h * 0.35
          if (m.burnTurns > 0) this.vfx.spark(ex, ey, (Math.random() - 0.5) * 0.4, -1.3, 0.55, 0.09, '#ff9a3c', -0.5, 0.97)
          if (m.poisonStacks > 0) this.vfx.spark(ex, ey + 0.2, (Math.random() - 0.5) * 0.3, -0.8, 0.7, 0.08, '#aaff3c', -0.3, 0.97)
        }
      }
    }
    for (let i = this.viewList.length - 1; i >= 0; i--) {
      const v = this.viewList[i]!
      if (v.seen === frame) continue
      if (v.dieAt >= 0 && v.roarAt >= 0) {
        // Roared away: struck when the shockwave reaches it (its coins leave
        // then), flung off, and poofed where it lands.
        if (dt > 0) v.flash = Math.max(0, v.flash - dt * 7)
        if (!v.roarHit && this.time >= v.roarAt) this.roarStrike(v)
        if (v.dieAt > this.time) continue
        this.roarPoof(v)
        v.roarAt = -1
      } else if (v.dieAt >= 0) {
        // Killed by a meteor still in the air — or held by the first-session
        // kill hold: stay on screen, flinching, until then.
        if (dt > 0) {
          v.flinch = Math.max(0, v.flinch - dt * 4.2)
          v.flash = Math.max(0, v.flash - dt * 7)
        }
        if (v.holdAt >= 0) {
          const hp = Math.floor(v.holdHp * (1 - clamp01((this.time - v.holdAt) / KILL_TICK)))
          if (hp !== v.hpShown) {
            v.hpShown = hp
            v.hpText = hp < 1000 ? SMALL_INT_STR[hp]! : formatBig(hp)
          }
        }
        if (v.dieAt > this.time) continue
        const cx = v.x + v.w / 2
        const cy = v.y + v.h / 2
        this.deathFx(v, v.dieKind, v.bossKind, v.dieCorrupted, cx, cy)
        if (v.holdCoins > 0) this.coinFx(cx, cy, v.holdCoins)
        v.holdAt = -1
        v.holdCoins = 0
      }
      this.views.delete(v.id)
      v.m = null
      v.num = null
      this.viewList[i] = this.viewList[this.viewList.length - 1]!
      this.viewList.pop()
      this.viewPool.push(v)
    }

    // Pickups + hazards (ease with the march).
    this.syncCells(s.pickups, this.pickViews, this.pickList, frame, pop, kPos, dt, true)
    this.syncCells(s.hazards, this.hazViews, this.hazList, frame, pop, kPos, dt, false)

    // Ball trails.
    const balls = s.balls
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i]!
      if (!b.active) continue
      let tr = this.trails.get(b.id)
      if (!tr) {
        tr = this.trailPool.pop() ?? newTrail()
        tr.id = b.id
        tr.count = 0
        tr.head = 0
        this.trails.set(b.id, tr)
        this.trailList.push(tr)
      }
      tr.seen = frame
      if (dt > 0) {
        tr.head = (tr.head + 1) % TRAIL_N
        tr.xs[tr.head] = b.x
        tr.ys[tr.head] = b.y
        if (tr.count < TRAIL_N) tr.count++
      }
    }
    for (let i = this.trailList.length - 1; i >= 0; i--) {
      const tr = this.trailList[i]!
      if (tr.seen === frame) continue
      this.trails.delete(tr.id)
      this.trailList[i] = this.trailList[this.trailList.length - 1]!
      this.trailList.pop()
      this.trailPool.push(tr)
    }

    // Launcher: glides to its new spot once the volley is over.
    if (s.phase !== 'volley') this.lx += (s.launcherX - this.lx) * (1 - Math.exp(-dt * 7))
    this.kick = Math.max(0, this.kick - dt * 5)

    // Danger: the lowest monster's distance to the breach line.
    let bottom = -99
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]!
      if (m.row + m.h > bottom) bottom = m.row + m.h
    }
    const rowsLeft = ROWS - bottom
    const dTarget = rowsLeft <= 0 ? 1 : rowsLeft <= 1 ? 0.8 : rowsLeft <= 2 ? 0.5 : 0
    this.danger += (dTarget - this.danger) * Math.min(1, dt * 3)
    this.dangerKick = Math.max(0, this.dangerKick - dt * 1.5)
    // The aim before a breaching march: one short shake and one warning sound
    // (the shake is skipped under prefers-reduced-motion; the sound still
    // plays). Once per aim phase, and only while time runs (not a paused redraw).
    if (s.phase !== 'aim') this.aimWarned = false
    else if (breachNext && !this.aimWarned && dt > 0) {
      this.aimWarned = true
      this.dangerKick = 1
      this.bigShake('small')
      this.sfx.request('grid-full', 0.06, 0.8, 7, 1500, 'breach-warn')
    }
    // The line's skull lights while the coming march breaches.
    this.skullLit += ((breachNext ? 1 : 0) - this.skullLit) * Math.min(1, dt * 6)
    // A demo cut short takes its flashes with it (as quickly as the ghost).
    const flashK = this.demoCut ? 1 / DEMO_STOP : 1
    this.lineFlash = Math.max(0, this.lineFlash - dt * 1.5 * flashK)
    this.skullFlash = Math.max(0, this.skullFlash - dt * 1.2 * flashK)
    this.crossSkull = Math.max(0, this.crossSkull - dt * 0.9 * flashK)
    this.updateDemo(dt, s)
    this.fever += ((s.fever ? 1 : 0) - this.fever) * Math.min(1, dt * 5)
    this.breach += ((s.phase === 'breach' ? 1 : 0) - this.breach) * Math.min(1, dt * 4)
    this.flashWhite = Math.max(0, this.flashWhite - dt * 2.6)
    this.flashRed = Math.max(0, this.flashRed - dt * 2.2)
    this.flashGold = Math.max(0, this.flashGold - dt * 2.4)
    this.flashBlue = Math.max(0, this.flashBlue - dt * 2.4)
    this.shakeT = Math.max(0, this.shakeT - dt)

    // Flying chest: pop-in + sparkle trail.
    if (this.chestIn < 1) this.chestIn = Math.min(1, this.chestIn + dt / 0.35)
    if (!s.chest) this.chestHint = false
    if (s.chest && dt > 0) {
      this.chestSparkT -= dt
      if (this.chestSparkT <= 0) {
        this.chestSparkT = 0.07
        const c = s.chest
        this.vfx.spark(c.x - Math.sign(c.vx || 1) * c.r * 0.8, c.y + (Math.random() - 0.5) * c.r, -c.vx * 0.2, 0.3, 0.6, 0.08, '#ffe27a', 0.4, 0.96)
      }
    }

    this.vfx.flyTargetX = this.lx
    this.vfx.flyTargetY = FLOOR_Y - 0.45
    this.vfx.update(dt)
    this.synced = true
  }

  private syncCells(
    list: (Pickup | Hazard)[], map: Map<number, CellView>, arr: CellView[],
    frame: number, pop: boolean, kPos: number, dt: number, isPickup: boolean
  ): void {
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!
      let v = map.get(p.id)
      if (!v) {
        v = this.cellPool.pop() ?? newCellView()
        v.id = p.id
        v.x = p.col
        v.y = pop ? p.row - 0.6 : p.row
        v.spawn = pop ? 0 : 1
        v.phase = Math.random() * TAU
        map.set(p.id, v)
        arr.push(v)
      }
      v.seen = frame
      if (isPickup) { v.p = p as Pickup; v.h = null } else { v.h = p as Hazard; v.p = null }
      v.x += (p.col - v.x) * kPos
      v.y += (p.row - v.y) * kPos
      if (v.spawn < 1) v.spawn = Math.min(1, v.spawn + dt / 0.3)
    }
    for (let i = arr.length - 1; i >= 0; i--) {
      const v = arr[i]!
      if (v.seen === frame) continue
      map.delete(v.id)
      v.p = null
      v.h = null
      arr[i] = arr[arr.length - 1]!
      arr.pop()
      this.cellPool.push(v)
    }
  }

  private initView(v: MonsterView, m: Monster, pop: boolean): void {
    v.id = m.id
    v.m = m
    v.kind = m.kind
    v.bossKind = m.bossKind
    v.corrupted = m.corrupted
    v.w = m.w
    v.h = m.h
    v.src = monsterSpriteSrc(m.kind, m.bossKind)
    v.bake = null
    v.bakeGen = -1
    v.x = m.col
    // New rows drop in from above; a little imp bursts out where it stands.
    v.y = pop && !m.mini ? m.row - 0.85 : m.row
    v.vy = 0
    v.spawn = pop ? 0 : 1
    v.scale = m.mini ? MINI_SCALE : 1
    v.shieldIn = 1
    v.flinch = 0
    v.fdx = 0
    v.fdy = 0
    v.flash = 0
    v.hopT = -1
    v.phase = Math.random() * TAU
    v.hpShown = -1
    v.hpText = ''
    v.num = null
    v.lastImpact = -1
    v.emberT = Math.random() * 0.2
    v.heal = 0
    v.enrage = 0
    v.color = monsterColor(m.kind, m.bossKind)
    v.meteorAt = -1
    v.dieAt = -1
    v.holdAt = -1
    v.holdHp = 0
    v.holdCoins = 0
    v.marches = 0
    v.roarAt = -1
    v.roarHit = false
    v.blowX = 0
    v.blowY = 0
    v.bigHit = false
  }

  // ─── Draw ──────────────────────────────────────────────────────────────────
  private draw(ctx: CanvasRenderingContext2D, s: BoardState): void {
    const l = this.layout
    const d = l.dpr
    const c = l.cell
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.imageSmoothingEnabled = true
    this.clearLetterbox(ctx)
    if (this.backdrop) ctx.drawImage(this.backdrop, 0, 0)
    if (this.prevBackdrop) {
      ctx.globalAlpha = this.backdropFade
      ctx.drawImage(this.prevBackdrop, 0, 0)
      ctx.globalAlpha = 1
    }
    // Board-space micro shake (eruptions, crits, meteors).
    let sx = 0
    let sy = 0
    if (this.shakeT > 0 && !this.reducedMotion) {
      const k = this.shakeMag * Math.min(1, this.shakeT * 5)
      sx = (Math.random() - 0.5) * k * c
      sy = (Math.random() - 0.5) * k * c
    }
    ctx.setTransform(d, 0, 0, d, sx * d, sy * d)

    const ox = l.ox
    const oy = l.oy
    const t = this.time

    // Clip everything board-bound to the playfield (a spawning boss peeks in from the top).
    ctx.save()
    ctx.beginPath()
    ctx.rect(ox, l.by, COLS * c, l.bh)
    ctx.clip()

    // Danger tint under the monsters.
    if (this.danger > 0.01 && this.dangerGrad) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 6.5)
      ctx.globalAlpha = clamp01(this.danger * (0.5 + 0.35 * pulse) + this.dangerKick * 0.3)
      const top = oy + (ROWS - 3.2) * c
      ctx.drawImage(this.dangerGrad, ox, top, COLS * c, oy + FLOOR_Y * c - top)
      ctx.globalAlpha = 1
    }
    // Shield charges: a cyan barrier along the breach line.
    if (s.shields > 0) {
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 3)
      ctx.fillStyle = '#5ab8ff'
      ctx.fillRect(ox, oy + ROWS * c - 1.5, COLS * c, 3)
      ctx.globalAlpha = 1
    }
    // Pulsing breach line when in danger.
    if (this.danger > 0.05) {
      ctx.globalAlpha = clamp01(this.danger * (0.45 + 0.55 * Math.abs(Math.sin(t * 5))))
      ctx.fillStyle = '#ff3848'
      ctx.fillRect(ox, oy + ROWS * c - 1.5, COLS * c, 3)
      ctx.globalAlpha = 1
    }

    // The line's skulls sit UNDER everything, so they never hide a pip, a
    // plate or the launcher; the demo's flash draws them again on top.
    this.drawLineSkulls(ctx, t, false)
    this.vfx.drawUnder(ctx, l, this.ballLooks.bakePx / d)
    this.drawHazards(ctx, t)
    this.drawPickups(ctx, t)
    this.drawBossTelegraphs(ctx, t)
    // Under the monsters: the ghost steps OUT from behind the real one (drawn
    // over it, it washed the real monster out for the first half of the walk).
    this.drawOverrunGhost(ctx)
    this.drawMonsters(ctx, t)
    this.drawRuleMarks(ctx, s, t)
    this.drawDangerPips(ctx, t)
    this.drawLineFlash(ctx, t)
    this.drawChest(ctx, s, t)
    this.drawLauncher(ctx, s, t)
    this.drawAim(ctx, t)
    this.drawBalls(ctx, s)
    this.vfx.drawOver(ctx, l)
    if (this.bubble) this.vfx.drawFliers(ctx, l, this.bubble, t)
    this.vfx.drawNums(ctx, l)
    ctx.restore()

    // Full-board overlays.
    this.drawOverlays(ctx, t)
    ctx.setTransform(d, 0, 0, d, 0, 0)
    this.stats.balls = s.balls.length
    this.stats.monsters = s.monsters.length
  }

  private drawHazards(ctx: CanvasRenderingContext2D, t: number): void {
    const img = this.sludge
    if (!img) return
    const l = this.layout
    const c = l.cell
    for (let i = 0; i < this.hazList.length; i++) {
      const v = this.hazList[i]!
      const wob = Math.sin(t * 3 + v.phase)
      const sp = easeOutBack(v.spawn)
      const w = c * 0.95 * (1 + 0.04 * wob) * sp
      const h = c * 0.95 * (1 - 0.04 * wob) * sp
      ctx.drawImage(img, l.ox + (v.x + 0.5) * c - w / 2, l.oy + (v.y + 0.5) * c - h / 2 + (c * 0.95 - h) / 2, w, h)
    }
  }

  private drawPickups(ctx: CanvasRenderingContext2D, t: number): void {
    const l = this.layout
    const c = l.cell
    const bub = this.bubble
    if (!bub) return
    for (let i = 0; i < this.pickList.length; i++) {
      const v = this.pickList[i]!
      const p = v.p
      if (!p) continue
      const pulse = 1 + 0.07 * Math.sin(t * 4.2 + v.phase)
      const sp = easeOutBack(v.spawn)
      const cx = l.ox + (v.x + 0.5) * c
      const cy = l.oy + (v.y + 0.5) * c + Math.sin(t * 2.2 + v.phase) * c * 0.04
      const r = c * 0.36 * pulse * sp
      if (p.kind === 'ball') {
        const glow = this.vfx.dot('#7dff9a')
        ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 4.2 + v.phase)
        ctx.drawImage(glow, cx - r * 1.5, cy - r * 1.5, r * 3, r * 3)
        ctx.globalAlpha = 1
        ctx.drawImage(bub, cx - r, cy - r, r * 2, r * 2)
        glyphs('plus').draw(ctx, '+1', cx, cy, r * 0.95)
      } else if (p.kind === 'coin') {
        ctx.drawImage(bub, cx - r, cy - r, r * 2, r * 2)
        const cs = this.coin
        if (cs.ready) {
          const b = cs.box
          const s = r * 1.15
          ctx.drawImage(cs.img, b.x, b.y, b.w, b.h, cx - s / 2, cy - s / 2, s, s)
        }
      } else {
        const gold = this.bubbleGold ?? bub
        const glow = this.vfx.dot(p.skill ? SKILL_TINT[p.skill] : '#ffe27a')
        ctx.globalAlpha = 0.4 + 0.25 * Math.sin(t * 5 + v.phase)
        ctx.drawImage(glow, cx - r * 1.6, cy - r * 1.6, r * 3.2, r * 3.2)
        ctx.globalAlpha = 1
        ctx.drawImage(gold, cx - r, cy - r, r * 2, r * 2)
        const icon = p.skill ? this.skillIcons.get(p.skill) : undefined
        if (icon && icon.ready) {
          const b = icon.box
          const s = r * 1.45
          ctx.drawImage(icon.img, b.x, b.y, b.w, b.h, cx - s / 2, cy - s / 2, s, s)
        }
      }
    }
  }

  private drawMonsters(ctx: CanvasRenderingContext2D, t: number): void {
    const l = this.layout
    const c = l.cell
    const ox = l.ox
    const oy = l.oy
    const list = this.viewList
    const aimTarget = this.aimArmed && this.aimPath && this.aimPath.hit === 'monster' ? this.aimPath.monsterId ?? -1 : -1
    // Pass 1: auras + sprites.
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!
      const m = v.m
      const bake = v.bake
      if (!m || !bake) continue
      if (v.roarAt >= 0 && v.dieAt >= 0) {
        this.drawBlown(ctx, v, bake, t)
        continue
      }
      const boss = v.kind === 'boss'
      const bob = Math.sin(t * (boss ? 2.2 : 3.3) + v.phase)
      let sxK = 1 - 0.03 * bob
      let syK = 1 + 0.035 * bob
      const st = Math.max(-0.14, Math.min(0.14, v.vy * 0.045))
      syK *= 1 + st
      sxK *= 1 - st * 0.6
      const f = v.flinch
      sxK *= 1 + 0.2 * f
      syK *= 1 - 0.22 * f
      // Kill hold: it squashes down harder and harder until it pops.
      const hold = v.holdAt >= 0 ? clamp01((t - v.holdAt) / KILL_HOLD) : -1
      if (hold >= 0) {
        const q = hold * hold
        sxK *= 1 + 0.3 * q
        syK *= 1 - 0.36 * q
      }
      if (v.spawn < 1) {
        const sp = Math.max(0.01, easeOutBack(v.spawn))
        sxK *= sp
        syK *= sp
      }
      let cxC = v.x + v.w / 2 + v.fdx * 0.07 * f
      let byC = v.y + v.h - (boss ? 0.08 : 0.06) + Math.max(0, v.fdy) * 0.05 * f
      if (v.hopT >= 0) {
        const k = v.hopT
        const e = k * k * (3 - 2 * k)
        cxC = v.hopFrom + (v.hopTo - v.hopFrom) * e + v.w / 2
        byC -= Math.sin(Math.PI * k) * 0.5
        syK *= 1 + 0.1 * Math.sin(Math.PI * k)
      }
      const dw = bake.dw * c * sxK * v.scale
      const dh = bake.dh * c * syK * v.scale
      const x = ox + cxC * c - dw / 2
      const y = oy + byC * c - dh
      const midX = x + dw / 2
      const midY = y + dh / 2
      // Auras (additive glow dots).
      if (m.kind === 'dryad' || m.corrupted || m.enraged || v.heal > 0) {
        ctx.globalCompositeOperation = 'lighter'
        if (m.kind === 'dryad') {
          const a = 0.45 + 0.3 * Math.sin(t * 4 + v.phase)
          const r = c * v.w * (1.05 + 0.1 * Math.sin(t * 4 + v.phase))
          ctx.globalAlpha = a
          ctx.drawImage(this.vfx.dot('#fff06a'), midX - r, midY - r, r * 2, r * 2)
        }
        if (m.corrupted) {
          ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 2.5 + v.phase)
          const r = c * Math.max(v.w, v.h) * 0.85
          ctx.drawImage(this.vfx.dot('#9a3cff'), midX - r, midY - r, r * 2, r * 2)
        }
        if (m.enraged) {
          ctx.globalAlpha = 0.55 + 0.3 * Math.sin(t * 7)
          const r = c * v.w * 0.75
          ctx.drawImage(this.vfx.dot('#ff3020'), midX - r, midY - r, r * 2, r * 2)
        }
        if (v.heal > 0) {
          ctx.globalAlpha = v.heal * 0.8
          const r = c * v.w * 0.8
          ctx.drawImage(this.vfx.dot('#6fe08a'), midX - r, midY - r, r * 2, r * 2)
        }
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }
      const img = m.frozen > 0 ? bake.frozen : m.enraged && bake.enraged ? bake.enraged : bake.base
      if (v.spawn < 1) ctx.globalAlpha = clamp01(v.spawn * 2.5)
      ctx.drawImage(img, x, y, dw, dh)
      // Hit flash / enrage flash / aim-target pulse: the white silhouette.
      let white = v.flash * 0.85
      if (v.enrage > 0) white = Math.max(white, v.enrage)
      if (v.id === aimTarget) white = Math.max(white, 0.16 + 0.12 * Math.sin(t * 9))
      // Kill hold: a full white hit-flash, then it glows back up to the pop.
      if (hold >= 0) white = Math.max(white, hold < 0.25 ? 1 : 0.45 + 0.5 * ((hold - 0.25) / 0.75) * ((hold - 0.25) / 0.75))
      if (white > 0.01) {
        ctx.globalAlpha = clamp01(white)
        ctx.drawImage(bake.white, x, y, dw, dh)
      }
      ctx.globalAlpha = 1
      if (m.frozen > 0 && this.frostStar) {
        const r = c * 0.22
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 5 + v.phase)
        ctx.drawImage(this.frostStar, x + dw - r * 1.4, y + r * 0.2, r * 1.6, r * 1.6)
        ctx.globalAlpha = 1
      }
      // A carbuncle's gem shield, for as long as it is up: the next hit is wasted.
      if (m.shield && this.gemShield) {
        const k = Math.max(0.01, easeOutBack(clamp01(v.shieldIn)))
        const r = c * v.w * 0.6 * k * (1 + 0.03 * Math.sin(t * 3.2 + v.phase))
        ctx.globalAlpha = (0.72 + 0.14 * Math.sin(t * 2.4 + v.phase)) * (v.spawn < 1 ? clamp01(v.spawn * 2.5) : 1)
        ctx.drawImage(this.gemShield, midX - r, midY - r, r * 2, r * 2)
        ctx.globalAlpha = 1
      }
    }
    // Pass 2: HP plates on top of every sprite (one baked label blit each).
    const gg = glyphGen()
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!
      const m = v.m
      // A held kill keeps its plate: the count reaching 0 is the point.
      if (!m || !v.bake || v.hpText === '' || (v.dieAt >= 0 && v.holdAt < 0)) continue
      const boss = v.kind === 'boss'
      let cxC = v.x + v.w / 2
      if (v.hopT >= 0) {
        const k = v.hopT
        cxC = v.hopFrom + (v.hopTo - v.hopFrom) * (k * k * (3 - 2 * k)) + v.w / 2
      }
      const variant = m.corrupted ? 1 : m.kind === 'dryad' ? 2 : m.enraged ? 3 : 0
      if (v.label === null || v.labelText !== v.hpText || v.labelVariant !== variant || v.labelGen !== this.bakeGen || v.labelGlyph !== gg) {
        this.bakeLabel(v, variant, boss, gg)
      }
      const label = v.label
      if (!label) continue
      const pw = v.labelW / l.dpr
      const ph = v.labelH / l.dpr
      const px = ox + cxC * c
      const py = oy + (v.y + v.h) * c - ph * 0.5 - c * 0.03
      const sp = v.spawn < 1 ? clamp01(v.spawn * 2) : 1
      if (sp < 1) ctx.globalAlpha = sp
      ctx.drawImage(label, 0, 0, v.labelW, v.labelH, px - pw / 2, py - ph / 2, pw, ph)
      ctx.globalAlpha = 1
    }
  }

  private drawChest(ctx: CanvasRenderingContext2D, s: BoardState, t: number): void {
    const ch = s.chest
    if (!ch || !this.chest.ready) return
    const l = this.layout
    const c = l.cell
    const b = this.chest.box
    const pop = this.chestIn < 1 ? Math.max(0.01, easeOutBack(this.chestIn)) : 1
    const w = ch.r * 2 * 2.1 * c * pop
    const h = w * (b.h / b.w) * (1 + 0.06 * Math.sin(t * 16))
    const x = l.ox + ch.x * c
    const y = l.oy + (ch.y + Math.sin(t * 3) * 0.08) * c
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 5)
    const g = this.vfx.dot('#ffe27a')
    ctx.drawImage(g, x - w * 0.6, y - w * 0.6, w * 1.2, w * 1.2)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(this.chest.img, b.x, b.y, b.w, b.h, x - w / 2, y - h / 2, w, h)
    if (this.chestHint && s.phase !== 'breach') this.drawChestHint(ctx, x, y, w, t)
  }

  /**
   * The first chest of a session: blind first-timers all wanted to TAP it,
   * and now a tap opens it — so say so without a word. A hand taps at the
   * chest's lower right; each touch sends a ring out round the chest.
   */
  private drawChestHint(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, t: number): void {
    const c = this.layout.cell
    const P = 1.2
    const u = (t % P) / P
    const TOUCH = 0.22
    // Rings: one per touch, a second trailing from the touch before.
    ctx.lineWidth = Math.max(2, c * 0.06)
    ctx.strokeStyle = '#fff3b0'
    for (let j = 0; j < 2; j++) {
      let k = u - TOUCH + j * 0.5
      if (k < 0) k += 1
      if (k >= 1) k -= 1
      ctx.globalAlpha = (1 - k) * 0.85
      ctx.beginPath()
      ctx.arc(x, y, w * (0.5 + 0.45 * k), 0, TAU)
      ctx.stroke()
    }
    const hand = this.tapHand
    if (hand) {
      // In to the touch, a beat on it, back out.
      const d = u < TOUCH ? 1 - u / TOUCH : u < 0.4 ? 0 : Math.min(1, (u - 0.4) / 0.35)
      const e = d * d * (3 - 2 * d)
      const hs = c * 0.8
      // The bake's fingertip sits at its top-left quarter.
      const tipX = x + w * 0.2 + e * c * 0.28
      const tipY = y + w * 0.12 + e * c * 0.28
      ctx.globalAlpha = 0.95
      ctx.drawImage(hand, tipX - hs * 0.28, tipY - hs * 0.1, hs, hs)
    }
    ctx.globalAlpha = 1
  }

  private drawLauncher(ctx: CanvasRenderingContext2D, s: BoardState, t: number): void {
    const l = this.layout
    const c = l.cell
    const tier = this.launcherTier
    const ti = tierInfo(tier)
    if (this.pedestalTier !== tier || !this.pedestal) {
      this.pedestal = this.bakePedestal(Math.round(c * l.dpr * 1.3), ti)
      this.pedestalTier = tier
    }
    const cx = l.ox + this.lx * c
    const floor = l.oy + FLOOR_Y * c
    // Under-glow in the element colour (warcry turns it to war-red).
    ctx.globalCompositeOperation = 'lighter'
    const warcry = s.warcryArmed || s.warcryActive
    ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 3) + (warcry ? 0.25 : 0)
    const gr = c * (warcry ? 1.05 : 0.85)
    ctx.drawImage(this.vfx.dot(warcry ? '#ff4a2a' : ti.glow), cx - gr, floor - gr * 0.8, gr * 2, gr * 1.6)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    const pw = c * 1.3
    const ph = pw * (this.pedestal.height / this.pedestal.width)
    ctx.drawImage(this.pedestal, cx - pw / 2, floor - ph * 0.3, pw, ph)
    // The elemental itself.
    const fs = this.fighter(tier)
    if (fs.ready) {
      const b = fs.box
      const side = c * 0.98
      const k = side / Math.max(b.w, b.h)
      const bob = Math.sin(t * 2.6)
      let sxK = 1 - 0.025 * bob + 0.1 * this.kick
      let syK = 1 + 0.03 * bob - 0.13 * this.kick
      let lean = 0
      if (this.aimArmed) {
        lean = Math.cos(this.aimAngle) * 0.07
        syK *= 0.95
        sxK *= 1.03
      }
      const w = b.w * k * sxK
      const h = b.h * k * syK
      ctx.drawImage(fs.img, b.x, b.y, b.w, b.h, cx + lean * c - w / 2, floor + c * 0.06 - h, w, h)
    }
    // Queued-ball count ("×12") under the pedestal — numbers only.
    let n = 0
    if (s.phase === 'aim') {
      n = s.tray.length
    } else if (s.phase === 'volley') {
      const balls = s.balls
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i]!
        if (!b.active && !b.landed && !b.ghost) n++
      }
    }
    if (n > 0) {
      if (n !== this.countShown) {
        this.countShown = n
        this.countText = `×${n}`
      }
      glyphs('count').draw(ctx, this.countText, cx, floor + c * 0.62, Math.max(11, Math.min(20, c * 0.34)))
    }
    // Where the next launcher will stand (first landed ball).
    if (s.phase === 'volley' && s.nextLauncherX !== null) {
      const img = this.ballLooks.get(s.tray[0] ?? 1, this.skin, false)
      const bp = this.ballLooks.bakePx / l.dpr
      const nx = l.ox + s.nextLauncherX * c
      const ny = floor - BALL_R * 1.2 * c
      if (img) ctx.drawImage(img, nx - bp / 2, ny - bp / 2, bp, bp)
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 8)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(nx, ny, BALL_R * 2.2 * c, 0, TAU)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  private drawAim(ctx: CanvasRenderingContext2D, t: number): void {
    const path = this.aimPath
    const dot = this.aimDot
    if (!this.aimArmed || !path || !dot || path.points.length < 2) return
    const l = this.layout
    const c = l.cell
    const pts = path.points
    const p0 = pts[0]!
    const p1 = pts[1]!
    const first = Math.hypot(p1.x - p0.x, p1.y - p0.y)
    let total = first
    for (let i = 2; i < pts.length; i++) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
    const cont = Math.max(0.01, total - first)
    const spacing = 0.34
    const phase = (t * 1.5) % spacing
    let acc = 0
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 1e-6) continue
      const ux = (b.x - a.x) / len
      const uy = (b.y - a.y) / len
      // First dot of this segment on the global marching lattice.
      let dd = phase - (acc % spacing)
      while (dd < 0) dd += spacing
      for (; dd <= len; dd += spacing) {
        const sAlong = acc + dd
        if (sAlong < 0.45) continue // keep the launcher face clear
        const alpha = sAlong <= first ? 0.95 : Math.max(0, 1 - (sAlong - first) / cont) * 0.75
        if (alpha <= 0.02) continue
        const r = (sAlong <= first ? 0.085 : 0.068) * c
        ctx.globalAlpha = alpha
        ctx.drawImage(dot, l.ox + (a.x + ux * dd) * c - r * 1.6, l.oy + (a.y + uy * dd) * c - r * 1.6, r * 3.2, r * 3.2)
      }
      acc += len
    }
    // First contact: a hollow reticle — ring + four ticks. It used to be a
    // ghost ball, which first-timers read as a dud shot lying on the board.
    const bx = l.ox + p1.x * c
    const by = l.oy + p1.y * c
    const r = BALL_R * 1.25 * c
    const r0 = r * 1.45
    const r1 = r * 2.3
    ctx.lineCap = 'round'
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalAlpha = pass === 0 ? 0.5 : 0.7 + 0.25 * Math.sin(t * 8)
      ctx.strokeStyle = pass === 0 ? 'rgba(8,12,30,0.9)' : '#dff3ff'
      ctx.lineWidth = pass === 0 ? 3.5 : 1.6
      ctx.beginPath()
      ctx.arc(bx, by, r, 0, TAU)
      ctx.moveTo(bx - r1, by)
      ctx.lineTo(bx - r0, by)
      ctx.moveTo(bx + r0, by)
      ctx.lineTo(bx + r1, by)
      ctx.moveTo(bx, by - r1)
      ctx.lineTo(bx, by - r0)
      ctx.moveTo(bx, by + r0)
      ctx.lineTo(bx, by + r1)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  private drawBalls(ctx: CanvasRenderingContext2D, s: BoardState): void {
    const l = this.layout
    const c = l.cell
    const bp = this.ballLooks.bakePx / l.dpr
    const balls = s.balls
    const fever = s.fever
    // Trails: one tapered comet polygon per ball, additive.
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i]!
      if (!b.active) continue
      const tr = this.trails.get(b.id)
      if (!tr || tr.count < 2) continue
      this.drawTrail(ctx, tr, b, fever)
    }
    ctx.globalCompositeOperation = 'source-over'
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i]!
      if (!b.active) continue
      const img = this.ballLooks.get(b.tier, this.skin, fever && !b.ghost)
      const x = l.ox + b.x * c
      const y = l.oy + b.y * c
      if (b.ghost) ctx.globalAlpha = 0.5
      if (img) {
        ctx.drawImage(img, x - bp / 2, y - bp / 2, bp, bp)
      } else {
        ctx.fillStyle = tierInfo(b.tier).body
        ctx.beginPath()
        ctx.arc(x, y, BALL_R * 1.3 * c, 0, TAU)
        ctx.fill()
      }
      if (b.ghost) ctx.globalAlpha = 1
    }
  }

  private drawTrail(ctx: CanvasRenderingContext2D, tr: Trail, b: Ball, fever: boolean): void {
    const l = this.layout
    const c = l.cell
    const g = tierGlow(b.tier)
    const maxLen = 0.95 + 0.5 * g
    const r0 = BALL_R * (0.95 + 0.4 * g)
    const tx = this.scratchX
    const ty = this.scratchY
    // Gather head → tail, clipped to maxLen.
    tx[0] = b.x
    ty[0] = b.y
    let n = 1
    let len = 0
    let px = b.x
    let py = b.y
    for (let k = 0; k < tr.count; k++) {
      const idx = (tr.head - k + TRAIL_N) % TRAIL_N
      const qx = tr.xs[idx]!
      const qy = tr.ys[idx]!
      const dl = Math.hypot(qx - px, qy - py)
      if (dl < 1e-4) continue
      if (len + dl >= maxLen) {
        const f = (maxLen - len) / dl
        tx[n] = px + (qx - px) * f
        ty[n] = py + (qy - py) * f
        n++
        break
      }
      len += dl
      tx[n] = qx
      ty[n] = qy
      n++
      px = qx
      py = qy
    }
    if (n < 2) return
    ctx.fillStyle = fever ? '#fff4a8' : tierInfo(b.tier).glow
    ctx.globalAlpha = b.ghost ? 0.14 : 0.3
    ctx.beginPath()
    // Left edge head → tail, right edge tail → head; the tail tapers to a point.
    for (let pass = 0; pass < 2; pass++) {
      const side = pass === 0 ? 1 : -1
      for (let j = 0; j < n; j++) {
        const i = pass === 0 ? j : n - 1 - j
        const a = i > 0 ? i - 1 : 0
        const z = i < n - 1 ? i + 1 : n - 1
        const dx = tx[a]! - tx[z]!
        const dy = ty[a]! - ty[z]!
        const dl = Math.hypot(dx, dy) || 1
        const r = r0 * (1 - i / (n - 1))
        const X = l.ox + (tx[i]! - (dy / dl) * r * side) * c
        const Y = l.oy + (ty[i]! + (dx / dl) * r * side) * c
        if (pass === 0 && j === 0) ctx.moveTo(X, Y)
        else ctx.lineTo(X, Y)
      }
    }
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, t: number): void {
    const l = this.layout
    const c = l.cell
    const x = l.ox
    const y = l.by
    const w = COLS * c
    const h = (FLOOR_Y + BOARD_TOP) * c
    const soft = this.reducedMotion ? 0.35 : 1
    if (this.fever > 0.01 && this.feverFrame) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = clamp01(this.fever * (0.6 + 0.35 * Math.sin(t * 7)))
      ctx.drawImage(this.feverFrame, x, y, w, h)
      ctx.globalCompositeOperation = 'source-over'
    }
    if (this.breach > 0.01 && this.redEdge) {
      ctx.globalAlpha = clamp01(this.breach * (0.55 + 0.3 * Math.sin(t * 4.5)))
      ctx.drawImage(this.redEdge, x, y, w, h)
    }
    if (this.flashWhite > 0.01) {
      ctx.globalAlpha = clamp01(this.flashWhite * 0.55 * soft)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x, y, w, h)
    }
    if (this.flashRed > 0.01) {
      ctx.globalAlpha = clamp01(this.flashRed * 0.45 * soft)
      ctx.fillStyle = '#ff1e32'
      ctx.fillRect(x, y, w, h)
    }
    if (this.flashGold > 0.01) {
      ctx.globalAlpha = clamp01(this.flashGold * 0.35 * soft)
      ctx.fillStyle = '#ffd23c'
      ctx.fillRect(x, y, w, h)
    }
    if (this.flashBlue > 0.01) {
      ctx.globalAlpha = clamp01(this.flashBlue * 0.35 * soft)
      ctx.fillStyle = '#5ab8ff'
      ctx.fillRect(x, y, w, h)
    }
    ctx.globalAlpha = 1
  }

  // ─── Events ────────────────────────────────────────────────────────────────
  onEvent(e: EngineEvent): void {
    const s = this.engine?.state
    switch (e.type) {
      case 'hit': {
        const ti = tierInfo(e.tier)
        const v = this.views.get(e.monsterId)
        if (v) {
          v.flinch = 1
          v.flash = 1
          const cx = v.x + v.w / 2
          const cy = v.y + v.h / 2
          const dx = cx - e.x
          const dy = cy - e.y
          const dl = Math.hypot(dx, dy) || 1
          v.fdx = dx / dl
          v.fdy = dy / dl
          // The HP actually removed (playtest run 3: overkill read as noise).
          const dealt = dealtOf(e)
          if (dealt > 0) {
            if (v.kind === 'boss' && !v.bigHit) {
              v.bigHit = true
              this.bossFirstHit(v, dealt, e.crit)
            } else {
              this.damageNumber(v, dealt, e.crit ? 'crit' : 'dmg')
            }
          }
          if (this.time - v.lastImpact > 0.09 && this.vfx.liveImpacts() < 6) {
            if (this.vfx.impact(e.x, e.y, v.kind === 'boss' ? 1.35 : 0.95, ti.sheet)) v.lastImpact = this.time
          }
        }
        this.vfx.burst(e.x, e.y, e.crit ? 7 : 3, e.crit ? 4.5 : 3, ti.glow, 0.1, 0.35)
        if (e.crit) this.microShake(0.06, 0.12)
        const hits = s?.volleyHits ?? 0
        const step = Math.min(24, Math.floor(hits / 2))
        this.sfx.request('combo-tick', 0.022, Math.pow(2, step / 12) * 0.9, 2, 55)
        this.sfx.request(hitSoundFor(ti.el, Math.random()), 0.018, 0.92 + Math.random() * 0.16, 1, 85, 'hit')
        break
      }
      case 'abilityProc':
        this.ability(e.ability, e.x, e.y, e.monsterId, e.targets)
        break
      case 'dot': {
        const v = this.views.get(e.monsterId)
        const dealt = dealtOf(e)
        if (v && dealt > 0) this.damageNumber(v, dealt, e.kind)
        this.vfx.burst(e.x, e.y, 3, 1.5, e.kind === 'burn' ? '#ff9a3c' : '#aaff3c', 0.09, 0.4, -1)
        this.sfx.request(e.kind === 'burn' ? 'flesh-hit-1' : 'water-splash', 0.012, e.kind === 'burn' ? 1.2 : 1.5, 0, 90, 'dot')
        break
      }
      case 'kill':
        this.killFx(e.monsterId, e.kind, e.bossKind, e.corrupted, e.x, e.y)
        break
      case 'coins': {
        // A held kill's coins leave with its poof, not with the killing hit.
        const held = this.heldKill
        if (held && e.source === 'kill') {
          held.holdCoins += e.amount
          this.heldKill = null
          break
        }
        this.coinFx(e.x, e.y, e.amount)
        break
      }
      case 'pickup': {
        if (e.auto && e.kind === 'ball') {
          // No ball touched it (marched into the floor line / FTUE end-of-volley
          // sweep): the bubble lifts off and flies to the launcher instead of popping.
          this.vfx.flyToLauncher(e.x, e.y)
          break
        }
        const tint = e.kind === 'ball' ? '#7dff9a' : e.kind === 'coin' ? '#ffd23c' : e.skill ? SKILL_TINT[e.skill] : '#ffe27a'
        this.vfx.ring(e.x, e.y, 0.15, 0.8, 0.35, tint, 0.08)
        this.vfx.burst(e.x, e.y, 8, 3.5, tint, 0.1, 0.45)
        if (e.kind === 'ball') {
          // What the "+1" actually became is decided by the tray a moment
          // later in this same burst (trayMerge / trayOverflow): the pop shows
          // THAT, so "+1" is only ever drawn when it really added a shot.
          if (this.plusPending) this.flushPlus()
          this.plusPending = true
          this.plusX = e.x
          this.plusY = e.y
          this.plusMerge = 0
          this.plusCoins = false
          this.sfx.request('unit-spawn', 0.035, 1.25, 3, 60)
        } else if (e.kind === 'coin') {
          this.sfx.request('coin-pickup', 0.035, 1.1, 3, 60)
        } else if (e.skill) {
          const icon = this.skillIcons.get(e.skill)
          if (icon && icon.ready) {
            const b = icon.box
            this.vfx.floater(icon.img, b.x, b.y, b.w, b.h, e.x, e.y, 1.1, 0.8, 0.8)
          }
          this.sfx.request('happy', 0.035, 1.1, 3, 80)
        }
        break
      }
      case 'skill':
        this.skillFx(e.skill, e.x, e.y)
        break
      case 'trayMerge':
        if (this.plusPending) this.plusMerge = Math.max(this.plusMerge, e.toTier)
        this.sfx.request('merge-pop', 0.045, 0.9 + Math.min(12, e.toTier) * 0.04, 4, 80)
        break
      case 'trayOverflow':
        if (this.plusPending) this.plusCoins = true
        this.sfx.request('coin-pickup', 0.03, 0.8, 2, 80)
        break
      case 'combo': {
        const lx = this.lx
        this.vfx.ring(lx, FLOOR_Y - 0.4, 0.3, 1.8, 0.45, '#ffe23a', 0.08)
        this.vfx.burst(lx, FLOOR_Y - 0.4, 14, 5, '#ffe23a', 0.12, 0.5, 0, true)
        this.sfx.request('combo-tick', 0.045, 1.5 + Math.min(4, e.hits / 10) * 0.12, 5, 50, 'combo')
        break
      }
      case 'fever':
        this.flashGold = 1
        this.vfx.ring(this.lx, FLOOR_Y - 0.4, 0.3, 4, 0.7, '#ffffff', 0.12)
        this.sfx.request('fever-start', 0.07, 1, 9, 300)
        break
      case 'speedUp':
        this.vfx.ring(this.lx, FLOOR_Y - 0.3, 0.2, 1.2, 0.3, '#9fd8ff', 0.05)
        this.sfx.request('dodge', 0.02, 1.2, 1, 300)
        break
      case 'launch':
        this.kick = 1
        this.sfx.request(SHOT_IDS[(Math.random() * 3) | 0] ?? 'unit-shot-1', 0.01, 1.2 + Math.random() * 0.2, 0, 90, 'shot')
        break
      case 'fire':
        this.kick = 1
        this.aimArmed = false
        this.aimPath = null
        break
      case 'wallBounce':
        this.vfx.burst(e.x, e.y, 2, 2, '#cfe6ff', 0.06, 0.25)
        break
      case 'ballLanded': {
        const target = s?.nextLauncherX ?? e.x
        if (e.first) {
          this.vfx.ring(e.x, FLOOR_Y - BALL_R, 0.1, 0.6, 0.35, '#ffffff', 0.05)
          this.vfx.retargetRollers(target)
        }
        const b = s ? this.findBall(s, e.ballId) : null
        if (b && !b.ghost && !e.first) {
          this.vfx.roller(e.x, target, FLOOR_Y - BALL_R * 1.2, this.ballLooks.get(b.tier, this.skin, false))
        }
        this.vfx.burst(e.x, FLOOR_Y - 0.05, 2, 1.2, '#9fb4ff', 0.06, 0.3)
        break
      }
      case 'march':
        this.sfx.request('unit-move', 0.02, 0.8, 0, 250)
        break
      case 'heal': {
        const v = this.views.get(e.monsterId)
        const by = this.views.get(e.byId)
        if (v) {
          v.heal = 1
          this.damageNumber(v, e.amount, 'heal')
          if (by) {
            const x0 = by.x + by.w / 2
            const y0 = by.y + by.h / 2
            const x1 = v.x + v.w / 2
            const y1 = v.y + v.h / 2
            for (let i = 0; i < 4; i++) {
              this.vfx.spark(x0, y0, (x1 - x0) * (2 + i * 0.4), (y1 - y0) * (2 + i * 0.4), 0.4, 0.09, '#6fe08a', 0, 0.94)
            }
          }
        }
        this.sfx.request('level-up', 0.015, 1.6, 0, 200, 'heal')
        break
      }
      case 'sludge': {
        const x = e.col + 0.5
        const y = e.row + 0.5
        this.vfx.ring(x, y, 0.1, 0.7, 0.35, '#7a8a2a', 0.1)
        this.vfx.burst(x, y, 8, 3, '#8fa03a', 0.1, 0.45, 3)
        this.sfx.request('water-splash', 0.025, 0.7, 1, 150)
        break
      }
      case 'hop': {
        const v = this.views.get(e.monsterId)
        if (v) {
          v.hopFrom = e.fromCol
          v.hopTo = e.toCol
          v.hopT = 0
        }
        break
      }
      case 'monsterSpawn':
        break
      case 'bossSpawn': {
        this.bigShake('strong')
        this.flashRed = Math.max(this.flashRed, 0.5)
        for (let col = 0; col < COLS; col++) this.vfx.burst(col + 0.5, 0.2, 2, 2, '#9aa4c8', 0.12, 0.6, 2)
        this.sfx.request('boss-incoming', 0.07, 1, 9, 1000)
        break
      }
      case 'bossRoar':
        this.roar(e.monsterId, e.ids, e.x, e.y)
        break
      case 'bossEnrage': {
        const v = this.views.get(e.monsterId)
        if (v) {
          v.enrage = 1
          this.vfx.ring(v.x + v.w / 2, v.y + v.h / 2, 0.8, 3, 0.6, '#ff3020', 0.14)
        }
        this.flashRed = 1
        this.bigShake('strong')
        this.sfx.request('enrage-roar', 0.05, 0.9, 8, 800)
        break
      }
      case 'bossDefeated': {
        const v = this.views.get(e.monsterId)
        const x = v ? v.x + v.w / 2 : COLS / 2
        const y = v ? v.y + v.h / 2 : 2
        this.flashWhite = 1
        this.bigShake('big')
        this.vfx.ring(x, y, 0.5, 5, 0.8, '#ffffff', 0.16)
        this.vfx.ring(x, y, 0.3, 3.5, 0.6, '#ffd23c', 0.12)
        this.vfx.blast(x, y, 3.2, v ? v.color : '#ffd23c', 0.7)
        this.vfx.burst(x, y, 40, 9, v ? v.color : '#ffd23c', 0.16, 0.9, 4, true)
        this.vfx.burst(x, y, 24, 7, '#ffd23c', 0.12, 1.0, 3, true)
        const l = this.layout
        this.hooks.confetti(l.ox + x * l.cell, l.oy + y * l.cell, 36)
        this.sfx.request('boss-death', 0.08, 1, 10, 800)
        this.sfx.request('explosion-1', 0.06, 0.8, 9, 300)
        break
      }
      case 'bossBlast': {
        // The death blast: a gold shockwave from the boss, then a wall of fire
        // rolling across the bottom rows it clears (their own kills follow in
        // this same burst and poof on top of it). Pooled VFX only.
        const top = ROWS - e.rows
        const midY = top + e.rows / 2
        this.flashGold = Math.max(this.flashGold, 0.7)
        this.vfx.ring(e.x, e.y, 0.8, 7, 0.75, '#ffe27a', 0.18)
        this.vfx.ring(COLS / 2, midY, 0.5, COLS * 0.62, 0.55, '#ff9a3c', 0.22)
        for (let col = 0; col < COLS; col++) {
          const x = col + 0.5
          this.vfx.blast(x, midY, 1.05, col % 2 === 0 ? '#ffb15a' : '#ffd23c', 0.5)
          this.vfx.burst(x, ROWS - 0.3, 5, 4.5, '#ffd23c', 0.12, 0.55, -3, true)
        }
        for (let i = 0; i < e.ids.length; i++) {
          const v = this.views.get(e.ids[i]!)
          if (!v) continue
          v.flash = 1
          v.flinch = 1
        }
        this.microShake(0.16, 0.32)
        this.sfx.request('meteor-impact', 0.07, 0.7, 9, 400, 'boss-blast')
        break
      }
      case 'danger':
        this.dangerKick = 1
        break
      case 'shieldBlock':
        this.flashBlue = 1
        for (let col = 0; col < COLS; col++) this.vfx.burst(col + 0.5, ROWS, 3, 3, '#5ab8ff', 0.1, 0.6)
        this.vfx.ring(COLS / 2, ROWS, 0.5, 4.5, 0.6, '#5ab8ff', 0.12)
        this.bigShake('strong')
        this.sfx.request('barricade', 0.06, 1, 9, 500)
        break
      case 'breach':
        this.flashRed = 1
        this.timeScale = 0.2
        this.bigShake('big')
        this.sfx.request('overrun', 0.06, 1, 10, 800)
        break
      case 'continued':
        if (e.how === 'meteor') {
          // The cleared monsters already have their rocks (killFx during 'breach');
          // a pushed-back boss gets one too.
          const s2 = this.engine?.state
          const bv = s2 && s2.bossId !== null ? this.views.get(s2.bossId) : undefined
          if (bv && bv.dieAt < 0) this.vfx.meteor(bv.x + bv.w / 2, bv.y + bv.h / 2, 0.1, true)
          this.flashGold = 1
        } else if (e.how === 'revive') {
          this.flashGold = 1
          this.vfx.burst(this.lx, FLOOR_Y - 0.5, 30, 6, '#ffe27a', 0.14, 0.8)
          this.sfx.request('reward-continue', 0.06, 1, 9, 500)
        } else {
          this.flashBlue = 1
        }
        this.timeScale = 1
        break
      case 'chestAppear': {
        // It appears whole on the board (never clipped at a wall): pop it in.
        this.chestIn = 0
        this.chestHint = chestHintsLeft > 0
        if (this.chestHint) chestHintsLeft--
        const ch = s?.chest
        if (ch) {
          this.vfx.ring(ch.x, ch.y, 0.2, 1.3, 0.4, '#ffe27a', 0.08)
          this.vfx.burst(ch.x, ch.y, 12, 3.5, '#ffe27a', 0.1, 0.5)
        }
        this.sfx.request('chest-flyby', 0.04, 1, 4, 1000)
        break
      }
      case 'chestHit': {
        this.chestHint = false
        this.flashGold = 0.8
        this.vfx.ring(e.x, e.y, 0.3, 2.2, 0.5, '#ffd23c', 0.1)
        this.vfx.burst(e.x, e.y, 26, 6, '#ffd23c', 0.13, 0.8, 3, true)
        if (this.chest.ready) {
          const b = this.chest.box
          this.vfx.floater(this.chest.img, b.x, b.y, b.w, b.h, e.x, e.y, 1.6, 0.8, 0.8)
        }
        const l = this.layout
        this.hooks.confetti(l.ox + e.x * l.cell, l.oy + e.y * l.cell, 24)
        this.sfx.request('chest-open', 0.06, 1, 9, 500)
        this.bigShake('small')
        break
      }
      // ─── The late walkers' rules ───
      case 'shieldPop': {
        // The gem shield shatters: glass ring, shards, a crystal crack.
        const v = this.views.get(e.monsterId)
        const cx = v ? v.x + v.w / 2 : e.x
        const cy = v ? v.y + v.h / 2 : e.y
        if (v) {
          v.flinch = Math.max(v.flinch, 0.55)
          v.flash = Math.max(v.flash, 0.5)
        }
        this.vfx.ring(cx, cy, 0.3, 0.95, 0.32, '#8fd6ff', 0.09)
        this.vfx.burst(cx, cy, 10, 3.6, '#bfe8ff', 0.09, 0.5, 2)
        this.sfx.request('crystal-cut', 0.03, 1.35, 4, 70, 'shield')
        break
      }
      case 'shieldUp': {
        const v = this.views.get(e.monsterId)
        if (v) {
          v.shieldIn = 0
          this.vfx.burst(v.x + v.w / 2, v.y + v.h / 2, 5, 1.6, '#8fd6ff', 0.06, 0.4, 1)
        }
        break
      }
      case 'split': {
        // The imp bursts: pinecone scales fly, its little imps pop out.
        this.vfx.burst(e.x, e.y, 12, 4, '#b0703e', 0.1, 0.55, 3)
        this.vfx.ring(e.x, e.y, 0.2, 0.8, 0.3, '#e0924e', 0.08)
        for (const id of e.childIds) {
          const v = this.views.get(id)
          if (v) v.flinch = 1
        }
        this.sfx.request('instant-spawn', 0.03, 1.25, 4, 90, 'split')
        break
      }
      case 'charge': {
        // A cyclops charges: dust where it lands, a thump in the floor.
        const v = this.views.get(e.monsterId)
        if (v) {
          const m = v.m
          const x = (m ? m.col : v.x) + v.w / 2
          const y = (m ? m.row : v.y) + v.h
          this.vfx.burst(x, y, 9, 2.6, '#a9b1bd', 0.1, 0.5, 2)
        }
        this.microShake(0.05, 0.18)
        this.sfx.request('gate-hit', 0.03, 0.85, 4, 120, 'charge')
        break
      }
      case 'rowSpawned':
        this.warmWalkers(e.row)
        break
      case 'chestGone':
        this.chestHint = false
        break
      case 'volleyEnd':
      case 'trayAdd':
      case 'phase':
        break
    }
  }

  // ─── "+1" outcome ──────────────────────────────────────────────────────────
  /**
   * Draw what a collected "+1" became. Play-testers could not tell why the
   * volley grew some turns and not others: at capacity 2, 61 % of "+1"s
   * turned into coins and most of the rest merged. Now the bubble answers:
   *   • "+1"             — it added a shot;
   *   • the merged ball  — full tray, it fused with its twin (stronger, not more);
   *   • a coin           — full tray and no twin, it was paid out.
   */
  private flushPlus(): void {
    this.plusPending = false
    const x = Math.max(0.45, Math.min(COLS - 0.45, this.plusX))
    const y = this.plusY
    if (this.plusCoins) {
      if (this.coin.ready) {
        const b = this.coin.box
        this.vfx.floater(this.coin.img, b.x, b.y, b.w, b.h, x, y - 0.1, 0.55, 0.9, 0.9)
      }
      this.vfx.ring(x, y, 0.1, 0.6, 0.3, '#ffd23c', 0.06)
      return
    }
    if (this.plusMerge > 0) {
      const img = this.ballLooks.get(this.plusMerge, this.skin, false)
      if (img) this.vfx.floater(img, 0, 0, img.width, img.height, x, y - 0.1, 0.62, 0.95, 0.8)
      this.vfx.ring(x, y, 0.15, 0.9, 0.4, tierInfo(this.plusMerge).glow, 0.08)
      return
    }
    this.vfx.num('+1', 'plus', x, y - 0.1, Math.max(14, Math.min(24, this.layout.cell * 0.45)), 1)
  }

  // ─── Rule marks (see ruleMarks.ts) ─────────────────────────────────────────
  private drawRuleMarks(ctx: CanvasRenderingContext2D, s: BoardState, t: number): void {
    const l = this.layout
    const c = l.cell
    const ox = l.ox
    const oy = l.oy
    // Demos play while the player aims (fading in), dimmed under a live aim.
    const demoK = s.phase === 'aim' ? clamp01(s.phaseTime / 0.35) * (this.aimArmed ? 0.45 : 1) : 0
    const list = this.viewList
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!
      const m = v.m
      if (!m || v.dieAt >= 0 || !v.bake) continue
      const vx = v.hopT >= 0 ? v.hopFrom + (v.hopTo - v.hopFrom) * v.hopT : v.x
      const key = tagKeyOf(m)
      if (!key || this.coachRetired.has(key)) continue
      const icon = ruleIconOf(m)
      if (!icon) continue
      if (demoK > 0.01) this.drawRuleDemo(ctx, icon, v, m, s, t, demoK)
      const badge = this.badges.get(icon)
      if (!badge) continue
      const bs = c * 0.46
      const top = Math.max(v.y, 0.05)
      const bob = Math.sin(t * 3 + v.phase) * 0.04 * c
      // On the right shoulder — kept inside the board on the right-hand column.
      const bx = Math.min(ox + (vx + v.w) * c - bs * 0.62, ox + COLS * c - bs - 1)
      const by = oy + top * c - bs * 0.18 + bob
      ctx.globalAlpha = v.spawn < 1 ? clamp01(v.spawn * 2) : 1
      ctx.drawImage(badge, bx, by, bs, bs)
      ctx.globalAlpha = 1
    }
  }

  /** Always on, for every player (render/danger.ts): the marches-left pip on
   *  the top-left shoulder of every monster within DANGER_PIP_MARCHES marches
   *  of the line — amber '2', then a pulsing red '1'. Numbers only. The rule
   *  badge sits on the other shoulder. */
  private drawDangerPips(ctx: CanvasRenderingContext2D, t: number): void {
    const red = this.pipRed
    const amber = this.pipAmber
    if (!red || !amber) return
    const l = this.layout
    const c = l.cell
    const ox = l.ox
    const oy = l.oy
    const list = this.viewList
    const digits = glyphs('count')
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!
      const n = v.marches
      if (!v.m || v.dieAt >= 0 || !v.bake || n < 1 || n > DANGER_PIP_MARCHES) continue
      const last = n === 1
      const pulse = this.reducedMotion ? 1 : 1 + (last ? 0.13 : 0.05) * Math.sin(t * (last ? 9 : 4) + v.phase)
      const ps = c * (v.kind === 'boss' ? 0.62 : 0.48) * pulse
      const vx = v.hopT >= 0 ? v.hopFrom + (v.hopTo - v.hopFrom) * v.hopT : v.x
      const cx = Math.max(ox + ps * 0.5 + 1, ox + vx * c + ps * 0.32)
      const cy = oy + Math.max(v.y, 0.05) * c + ps * 0.32
      ctx.globalAlpha = v.spawn < 1 ? clamp01(v.spawn * 2) : 1
      if (last) {
        ctx.globalCompositeOperation = 'lighter'
        const g = ps * 1.05
        ctx.globalAlpha *= 0.55 + (this.reducedMotion ? 0 : 0.25 * Math.sin(t * 9 + v.phase))
        ctx.drawImage(this.vfx.dot('#ff3040'), cx - g, cy - g, g * 2, g * 2)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = v.spawn < 1 ? clamp01(v.spawn * 2) : 1
      }
      ctx.drawImage(last ? red : amber, cx - ps / 2, cy - ps / 2, ps, ps)
      digits.draw(ctx, last ? '1' : '2', cx, cy + ps * 0.02, ps * 0.66)
      ctx.globalAlpha = 1
    }
  }

  /** Always on, for every player, UNDER the sprites and HP plates: red
   *  chevrons over the columns a boss is entering through, and a double
   *  chevron under an enraged boss (it marches two rows a turn now). */
  private drawBossTelegraphs(ctx: CanvasRenderingContext2D, t: number): void {
    const l = this.layout
    const c = l.cell
    const list = this.viewList
    // The turn number the NEXT march runs under (fire() bumps it): a cyclops
    // whose march is a charge wears orange chevrons two rows long from the
    // moment the player aims until it has charged.
    const s = this.engine?.state
    const next = !s ? -1 : s.phase === 'aim' ? s.turn + 1 : s.phase === 'volley' || s.phase === 'resolve' ? s.turn : -1
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!
      const m = v.m
      if (!m || v.dieAt >= 0) continue
      if (m.kind === 'cyclops') {
        if (next >= 0 && m.frozen <= 0 && chargesAt(m, next)) {
          this.drawChevrons(ctx, l.ox + v.x * c, l.oy + (v.y + v.h) * c + 0.04 * c, v.w * c, 1.7 * c, 2, t * 1.3, '#ff9a3a', c)
        }
        continue
      }
      if (m.kind !== 'boss') continue
      if (m.row < 0) this.drawChevrons(ctx, l.ox + v.x * c, l.oy + 0.04 * c, v.w * c, 0.8 * c, 3, t, '#ff3848', c)
      if (m.enraged) this.drawChevrons(ctx, l.ox + v.x * c, l.oy + (v.y + v.h) * c + 0.04 * c, v.w * c, 0.85 * c, 2, t * 1.5, '#ff2a1a', c)
    }
  }

  /** `n` down-chevrons stacked in (x, y, w, h), marching down. */
  private drawChevrons(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, n: number, t: number, color: string, c: number): void {
    const cw = Math.min(w * 0.5, c * 0.9)
    const ch = cw * 0.38
    const cx = x + w / 2
    const march = (t * 1.2) % 1
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let k = 0; k < n; k++) {
      const u = (k + march) / n
      const cy = y + u * (h - ch)
      const a = Math.sin(Math.PI * clamp01(u)) * 0.95
      if (a <= 0.02) continue
      ctx.globalAlpha = a
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? 'rgba(10,6,16,0.85)' : color
        ctx.lineWidth = pass === 0 ? c * 0.15 : c * 0.085
        ctx.beginPath()
        ctx.moveTo(cx - cw / 2, cy)
        ctx.lineTo(cx, cy + ch)
        ctx.lineTo(cx + cw / 2, cy)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
  }

  private drawRuleDemo(ctx: CanvasRenderingContext2D, icon: RuleIcon, v: MonsterView, m: Monster, s: BoardState, t: number, k: number): void {
    const l = this.layout
    const c = l.cell
    const ox = l.ox
    const oy = l.oy
    const midX = ox + (v.x + v.w / 2) * c
    const midY = oy + (v.y + v.h / 2) * c
    switch (icon) {
      case 'hop': {
        // A ghost of the goblin hops to a free side — the move it makes at
        // the end of this turn (it tries a random side, then the other).
        const bake = v.bake
        if (!bake) break
        const blocked = (col: number, row: number): boolean =>
          s.hazards.some((h) => h.col === col && h.row === row) || s.pickups.some((p) => p.col === col && p.row === row)
        const left = cellFree(m.col - 1, m.row, s.monsters, blocked)
        const right = cellFree(m.col + m.w, m.row, s.monsters, blocked)
        if (!left && !right) break
        const P = 1.7
        const tt = t + v.phase
        const cycle = Math.floor(tt / P)
        const dir = left && right ? (cycle % 2 === 0 ? 1 : -1) : right ? 1 : -1
        const f = (tt % P) / P
        const u = clamp01(f * 1.35)
        const e = u * u * (3 - 2 * u)
        const dw = bake.dw * c
        const dh = bake.dh * c
        const x0 = v.x + v.w / 2
        // The arc it travels, dotted.
        const dot = this.aimDot
        if (dot) {
          ctx.globalAlpha = 0.55 * k
          for (let j = 1; j <= 4; j++) {
            const q = j / 5
            const px = ox + (x0 + dir * q) * c
            const py = oy + (v.y + v.h * 0.5 - Math.sin(Math.PI * q) * 0.55) * c
            ctx.drawImage(dot, px - c * 0.07, py - c * 0.07, c * 0.14, c * 0.14)
          }
        }
        const lift = Math.sin(Math.PI * e) * 0.55
        const gx = ox + (x0 + dir * e) * c - dw / 2
        const gy = oy + (v.y + v.h - 0.06 - lift) * c - dh
        const fade = k * (f > 0.74 ? 1 - clamp01((f - 0.74) / 0.26) : 1)
        // A GHOST, not a shadow: the sprite faint, its white silhouette over it.
        ctx.globalAlpha = 0.34 * fade
        ctx.drawImage(bake.base, gx, gy, dw, dh)
        ctx.globalAlpha = 0.3 * fade
        ctx.drawImage(bake.white, gx, gy, dw, dh)
        ctx.globalAlpha = 1
        break
      }
      case 'heal': {
        // Green motes run to every neighbour it will heal at the end of the turn.
        const targets = healTargets(m, s.monsters)
        const g = this.vfx.dot('#6fe08a')
        const r = c * 0.17
        for (const n of targets) {
          const tx = ox + (n.col + n.w / 2) * c
          const ty = oy + (n.row + n.h / 2) * c
          for (let j = 0; j < 3; j++) {
            const u = (t * 0.8 + j / 3 + v.phase) % 1
            ctx.globalAlpha = Math.sin(Math.PI * u) * 0.9 * k
            ctx.drawImage(g, midX + (tx - midX) * u - r, midY + (ty - midY) * u - r, r * 2, r * 2)
          }
        }
        ctx.globalAlpha = 1
        break
      }
      case 'spit': {
        // A sludge glob drops out of it: the cell below gets blocked.
        const img = this.sludge
        if (!img) break
        const u = ((t + v.phase) % 1.5) / 1.5
        const size = c * 0.5
        const y = oy + (v.y + v.h - 0.15 + u * u * 0.95) * c - size / 2
        ctx.globalAlpha = Math.sin(Math.PI * u) * 0.85 * k
        ctx.drawImage(img, midX - size / 2, y, size, size)
        ctx.globalAlpha = 1
        break
      }
      case 'armor': {
        // Armour shimmer round the footprint: it takes more to bring down.
        ctx.globalAlpha = (0.35 + 0.3 * Math.sin(t * 4 + v.phase)) * k
        ctx.strokeStyle = '#ffe2b0'
        ctx.lineWidth = Math.max(2, c * 0.07)
        const inset = c * 0.04
        ctx.beginPath()
        ctx.rect(ox + v.x * c + inset, oy + v.y * c + inset, v.w * c - inset * 2, v.h * c - inset * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
        break
      }
      case 'coins': {
        // Coins lift off an elite: worth triple.
        if (!this.coin.ready) break
        const b = this.coin.box
        const size = c * 0.28
        for (let j = 0; j < 3; j++) {
          const u = (t * 0.7 + j / 3 + v.phase) % 1
          ctx.globalAlpha = Math.sin(Math.PI * u) * 0.9 * k
          ctx.drawImage(this.coin.img, b.x, b.y, b.w, b.h, midX + (j - 1) * c * 0.22 - size / 2, oy + (v.y - u * 0.7) * c, size, size)
        }
        ctx.globalAlpha = 1
        break
      }
      case 'skull':
        break
      case 'split': {
        // Two little imps burst out of it, left and right — what it becomes when it falls.
        const bake = v.bake
        if (!bake) break
        const P = 1.8
        const f = ((t + v.phase) % P) / P
        const u = clamp01(f * 1.4)
        const e = u * u * (3 - 2 * u)
        const fade = k * clamp01(f * 6) * (f > 0.72 ? 1 - clamp01((f - 0.72) / 0.28) : 1)
        const dw = bake.dw * c * MINI_SCALE
        const dh = bake.dh * c * MINI_SCALE
        const gy = oy + (v.y + v.h - 0.06 - Math.sin(Math.PI * e) * 0.4) * c - dh
        for (let j = 0; j < 2; j++) {
          const gx = midX + (j === 0 ? -1 : 1) * e * c * 0.62 - dw / 2
          ctx.globalAlpha = 0.4 * fade
          ctx.drawImage(bake.base, gx, gy, dw, dh)
          ctx.globalAlpha = 0.28 * fade
          ctx.drawImage(bake.white, gx, gy, dw, dh)
        }
        ctx.globalAlpha = 1
        break
      }
      case 'slow': {
        // A clock sweeps once round it — a whole turn of waiting — and only
        // then does a ghost of it take its one step down.
        const bake = v.bake
        if (!bake) break
        const P = 2.6
        const f = ((t + v.phase) % P) / P
        const sweep = clamp01(f / 0.6)
        ctx.globalAlpha = 0.75 * k * (f < 0.6 ? 1 : 1 - clamp01((f - 0.6) / 0.25))
        ctx.strokeStyle = '#b9f28a'
        ctx.lineWidth = Math.max(2, c * 0.06)
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.arc(midX, midY, c * v.w * 0.56, -Math.PI / 2, -Math.PI / 2 + TAU * sweep)
        ctx.stroke()
        if (f >= 0.6) {
          const u = clamp01((f - 0.6) / 0.3)
          const e = u * u * (3 - 2 * u)
          const dw = bake.dw * c
          const dh = bake.dh * c
          const gy = oy + (v.y + v.h - 0.06 + e) * c - dh
          const fade = k * (1 - clamp01((f - 0.85) / 0.15))
          ctx.globalAlpha = 0.3 * fade
          ctx.drawImage(bake.base, midX - dw / 2, gy, dw, dh)
          ctx.globalAlpha = 0.24 * fade
          ctx.drawImage(bake.white, midX - dw / 2, gy, dw, dh)
        }
        ctx.globalAlpha = 1
        break
      }
      case 'shield': {
        // A ghost ball flies up into the bubble and bounces straight back:
        // the first hit of the turn is wasted on the gem.
        if (!m.shield) break
        const P = 1.5
        const f = ((t + v.phase) % P) / P
        const face = midY + c * v.w * 0.6
        const reach = c * 1.3
        const y = f < 0.5 ? face + reach * (1 - f / 0.5) : face + reach * ((f - 0.5) / 0.5)
        const r = c * 0.13
        ctx.globalAlpha = k * 0.85 * (f < 0.5 ? clamp01(f * 5) : 1 - clamp01((f - 0.5) / 0.5))
        ctx.drawImage(this.vfx.dot('#ffe7a0'), midX - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2)
        const hit = 1 - Math.abs(f - 0.5) / 0.14
        if (hit > 0) {
          ctx.globalAlpha = k * hit
          ctx.strokeStyle = '#d8f2ff'
          ctx.lineWidth = Math.max(2, c * 0.07)
          ctx.beginPath()
          ctx.arc(midX, midY, c * v.w * (0.6 + 0.06 * (1 - hit)), 0, TAU)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        break
      }
      case 'charge': {
        // A ghost rushes down two rows, speed streaks behind it: a charge.
        const bake = v.bake
        if (!bake) break
        const P = 1.7
        const f = ((t + v.phase) % P) / P
        const u = clamp01(f / 0.45)
        const e = u * u
        const fade = k * clamp01(f * 6) * (f > 0.55 ? 1 - clamp01((f - 0.55) / 0.35) : 1)
        const dw = bake.dw * c
        const dh = bake.dh * c
        for (let j = 2; j >= 0; j--) {
          const at = e * 2 - j * 0.22
          if (at < 0) continue
          ctx.globalAlpha = (j === 0 ? 0.36 : 0.14 / j) * fade
          ctx.drawImage(bake.base, midX - dw / 2, oy + (v.y + v.h - 0.06 + at) * c - dh, dw, dh)
        }
        ctx.globalAlpha = 1
        break
      }
    }
  }

  // ─── Event helpers ─────────────────────────────────────────────────────────
  private findBall(s: BoardState, id: number): Ball | null {
    const balls = s.balls
    for (let i = 0; i < balls.length; i++) if (balls[i]!.id === id) return balls[i]!
    return null
  }

  private fighter(tier: number): SpriteImage {
    const t = Math.max(1, Math.min(FIGHTER_ART_MAX, tier | 0))
    let f = this.fighterSprites[t]
    if (!f) {
      f = sprite(fighterSrc(t))
      this.fighterSprites[t] = f
    }
    return f
  }

  private fmtNum(v: number): string {
    const n = Math.max(1, Math.round(v))
    return n < 1000 ? SMALL_INT_STR[n]! : formatBig(n)
  }

  /** Spawn (or fold into this monster's still-young number) a damage number. */
  private damageNumber(v: MonsterView, dmg: number, style: 'dmg' | 'crit' | 'burn' | 'poison' | 'heal'): void {
    const c = this.layout.cell
    const live = v.num
    if (style !== 'crit' && live && live.on && live.key === v.id && live.style === style && live.t < 0.3) {
      live.value += dmg
      live.text = this.fmtNum(live.value)
      live.t = Math.min(live.t, 0.08)
      return
    }
    // First session: bigger numbers, so the first hits read as damage — and on
    // a boss always, so a long fight visibly chips away at it.
    const k = this.engine?.state.config.ftue || v.kind === 'boss' ? FTUE_NUM_SCALE : 1
    const size = k * (style === 'crit'
      ? Math.max(15, Math.min(28, c * 0.52))
      : v.kind === 'boss' ? Math.max(13, Math.min(22, c * 0.4)) : Math.max(11, Math.min(18, c * 0.34)))
    const jitter = (Math.random() - 0.5) * 0.35 * v.w
    // Keep the label off the side walls (the playfield clip would cut it).
    const edge = (0.45 + (style === 'crit' ? 0.2 : 0)) * (k > 1 ? 1.3 : 1)
    const nx = Math.max(edge, Math.min(COLS - edge, v.x + v.w / 2 + jitter))
    // ...and leave it room to rise inside the board: a top-row monster's
    // number (the whole first session's) used to rise out through the top edge.
    const ny = Math.max(v.y + Math.min(0.3, v.h * 0.25), (size * 1.4) / c - BOARD_TOP)
    // A boss's numbers are never dropped for a full pool and draw over every
    // other number (playtest run 3: "no on-boss hit number").
    const n = this.vfx.num(this.fmtNum(dmg), style, nx, ny, size, dmg, v.id, v.kind === 'boss')
    if (style !== 'crit') v.num = n
  }

  /**
   * The first hit on a boss (playtest run 3: "HP bar stayed pinned at 57 with
   * no on-boss hit number"): an extra-big number (BOSS_FIRST_HIT_SCALE × the
   * boss number) ON the boss's visible body, lasting longer and rising less,
   * over every other number. Later hits fold into ordinary boss numbers.
   */
  private bossFirstHit(v: MonsterView, dealt: number, crit: boolean): void {
    const c = this.layout.cell
    const base = FTUE_NUM_SCALE * (crit ? Math.max(15, Math.min(28, c * 0.52)) : Math.max(13, Math.min(22, c * 0.4)))
    const size = base * BOSS_FIRST_HIT_SCALE
    const style = crit ? 'crit' : 'dmg'
    const text = this.fmtNum(dealt)
    // ~0.62 em a digit (as the HP plates assume), at the 1.15× pop size.
    const halfW = (text.length * 0.62 * size * 1.15) / 2 / c + 0.08
    const halfH = (0.42 * size * 1.15) / c
    const mid = v.x + v.w / 2
    const clampX = (x: number): number => Math.max(halfW, Math.min(COLS - halfW, x))
    let nx = clampX(mid)
    // On the body — for a boss still entering, on the part already on the
    // board — with room for its short rise under the top rim.
    const ny = Math.max(v.y + v.h * 0.5, (size * 0.9) / c - BOARD_TOP)
    // A boss still entering shows only its lowest row, where its HP plate
    // sits: never cover the plate (its count dropping is the other half of
    // the proof) — stand beside it, toward the board's middle.
    const fs = Math.max(14, Math.min(30, c * 0.5))
    const plateHalfW = (fs * (0.62 * Math.max(1, v.hpText.length) + 0.75)) / 2 / c
    const plateHalfH = (fs * 1.22) / 2 / c
    const plateY = v.y + v.h - plateHalfH - 0.03
    if (Math.abs(ny - plateY) < halfH + plateHalfH) {
      const gap = plateHalfW + halfW + 0.06
      const toward = mid <= COLS / 2 ? 1 : -1
      const a = clampX(mid + toward * gap)
      const b = clampX(mid - toward * gap)
      nx = Math.abs(a - mid) >= gap - 1e-6 ? a : Math.abs(b - mid) >= gap - 1e-6 ? b : a
    }
    const n = this.vfx.num(text, style, nx, ny, size, dealt, v.id, true)
    if (n) {
      n.life = BOSS_FIRST_HIT_LIFE
      n.riseK = 0.35
    }
    // Later hits start their own numbers rather than folding into this one.
    v.num = null
    this.vfx.ring(nx, ny, 0.3, 1.5, 0.45, '#fff3b0', 0.1)
    this.vfx.burst(nx, ny, 10, 4, '#ffe27a', 0.12, 0.5, 0, true)
  }

  // ─── Boss roar (playtest run 3) ────────────────────────────────────────────
  /** `bossRoar`: a shockwave from the boss; every listed walker is struck
   *  when it reaches them and flung away (their `kill` + `coins` follow in
   *  this burst — see killFx). A medium shake (never under reduced motion). */
  private roar(bossId: number, ids: readonly number[], x: number, y: number): void {
    const bv = this.views.get(bossId)
    if (bv) {
      bv.enrage = 1
      bv.flinch = 1
    } else {
      this.roarBossId = bossId
    }
    const color = bv ? bv.color : '#ffd9a0'
    // Seen from the board: the boss is mostly above the top rim, so the
    // shockwave's origin sits on its lowest visible row.
    const oy = Math.max(y, 0.4)
    this.vfx.ring(x, oy, ROAR_R0, ROAR_R1, ROAR_LIFE, '#ffffff', 0.18)
    this.vfx.ring(x, oy, ROAR_R0 * 0.8, ROAR_R1 * 0.7, ROAR_LIFE * 0.85, '#ffd9a0', 0.26)
    this.vfx.ring(x, oy, 0.4, 3.4, 0.5, color, 0.3)
    this.vfx.blast(x, oy, 2.6, '#ffe6b0', 0.55)
    for (let i = 0; i < ids.length; i++) {
      const v = this.views.get(ids[i]!)
      if (!v || v.dieAt >= 0) continue
      const dx = v.x + v.w / 2 - x
      const dy = v.y + v.h / 2 - oy
      const d = Math.hypot(dx, dy) || 1
      // The ring's radius eases out (easeOutCubic over ROAR_LIFE): the time it reaches d.
      const k = clamp01((d - ROAR_R0) / (ROAR_R1 - ROAR_R0))
      v.roarAt = this.time + Math.min(ROAR_MAX_DELAY, ROAR_LIFE * (1 - Math.cbrt(1 - k)))
      v.roarHit = false
      // Flung away from the boss, flattened toward the sides — a straight
      // drop down the board would read as a march.
      let bx = dx / d
      const by = Math.max(0.12, dy / d) * 0.5
      if (Math.abs(bx) < 0.3) bx = (v.id % 2 === 0 ? 0.55 : -0.55) + bx
      const bl = Math.hypot(bx, by) || 1
      v.blowX = bx / bl
      v.blowY = by / bl
    }
    this.flashWhite = Math.max(this.flashWhite, 0.3)
    this.microShake(0.14, 0.45)
    this.bigShake('strong')
    this.sfx.request('enrage-roar', 0.075, 0.78, 10, 600, 'boss-roar')
  }

  /** The shockwave reaches a roared walker: a white flash, dust, its coins. */
  private roarStrike(v: MonsterView): void {
    v.roarHit = true
    v.flash = 1
    const cx = v.x + v.w / 2
    const cy = v.y + v.h / 2
    this.vfx.burst(cx, v.y + v.h - 0.1, 6, 3, '#d8cdb8', 0.1, 0.4, 2)
    if (v.holdCoins > 0) this.coinFx(cx, cy, v.holdCoins)
    v.holdCoins = 0
    this.sfx.request('dodge', 0.02, 0.8 + Math.random() * 0.3, 2, 45, 'roar-fling')
  }

  /** A roared walker's flight is over: a small poof where it ended up. */
  private roarPoof(v: MonsterView): void {
    this.blowAt(v, v.roarAt + BLOW_DUR)
    const b = this.blow
    const cx = v.x + v.w / 2 + b.x
    const cy = v.y + v.h / 2 + b.y
    const color = v.dieCorrupted ? '#b05cff' : v.color
    this.vfx.burst(cx, cy, 8, 3.5, color, 0.1, 0.45, 3)
    this.vfx.burst(cx, cy, 3, 2, '#ffffff', 0.08, 0.3)
    this.sfx.request('enemy-death', 0.025, 0.95 + Math.random() * 0.25, 3, 70)
  }

  /** Where a roared walker is drawn at renderer time `t` → `this.blow` (cells
   *  offset from its footprint, scale, spin, alpha). Reduced motion: no
   *  flight, no spin — it flashes and fades where it stood. */
  private blowAt(v: MonsterView, t: number): void {
    const b = this.blow
    const u = t > v.roarAt ? clamp01((t - v.roarAt) / BLOW_DUR) : 0
    b.a = u < 0.5 ? 1 : 1 - (u - 0.5) / 0.5
    if (this.reducedMotion) {
      b.x = b.y = b.r = 0
      b.s = 1 - 0.15 * u
      return
    }
    const e = 1 - (1 - u) * (1 - u) * (1 - u)
    b.x = v.blowX * BLOW_DIST * e
    b.y = v.blowY * BLOW_DIST * e - Math.sin(Math.PI * Math.min(1, u * 1.4)) * 0.55
    b.s = 1 - 0.5 * u
    b.r = (v.blowX >= 0 ? 1 : -1) * u * u * 2.6
  }

  private drawBlown(ctx: CanvasRenderingContext2D, v: MonsterView, bake: MonsterBake, t: number): void {
    const l = this.layout
    const c = l.cell
    this.blowAt(v, t)
    const b = this.blow
    if (b.a <= 0.01) return
    // Waiting for the shockwave: it trembles.
    const shiver = t < v.roarAt && !this.reducedMotion ? Math.sin(t * 55 + v.phase) * 0.035 : 0
    const dw = bake.dw * c * v.scale * b.s
    const dh = bake.dh * c * v.scale * b.s
    const cx = l.ox + (v.x + v.w / 2 + b.x + shiver) * c
    const cy = l.oy + (v.y + v.h - 0.06 - (bake.dh * v.scale) / 2 + b.y) * c
    ctx.save()
    ctx.translate(cx, cy)
    if (b.r !== 0) ctx.rotate(b.r)
    ctx.globalAlpha = b.a
    ctx.drawImage(bake.base, -dw / 2, -dh / 2, dw, dh)
    const white = Math.max(v.flash * 0.9, t >= v.roarAt ? 0.35 : 0)
    if (white > 0.01) {
      ctx.globalAlpha = b.a * clamp01(white)
      ctx.drawImage(bake.white, -dw / 2, -dh / 2, dw, dh)
    }
    ctx.restore()
  }

  // ─── The line: skulls, the overrun demo ────────────────────────────────────
  /**
   * A small skull glyph at both ends of the line the monsters must not cross
   * (clear of the launcher at its outermost spot, and of the pips, which sit
   * on the monsters' shoulders a row up). Dim bone always; lit red — pulsing,
   * steady under reduced motion — while any monster wears a '1' pip. `onTop`:
   * the overrun demo's flash draws them again, big, over everything.
   */
  private drawLineSkulls(ctx: CanvasRenderingContext2D, t: number, onTop: boolean): void {
    const bone = this.skullBone
    const red = this.skullRed
    if (!bone || !red) return
    const l = this.layout
    const c = l.cell
    const flash = this.skullFlash
    if (onTop && flash <= 0.01) return
    const lit = onTop ? 0 : this.skullLit
    const pulse = this.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(t * 7)
    const grow = onTop ? 1 + 1.3 * flash : 1 + 0.1 * lit * pulse
    const size = c * SKULL_SIZE * grow
    // Resting: just above the line. Flashing big: in the lane UNDER the line,
    // so it never covers a monster (or its plate) still standing above it.
    const y = onTop ? l.oy + ROWS * c + size / 2 + c * 0.02 : l.oy + (ROWS - SKULL_LIFT) * c
    const inset = Math.max(SKULL_INSET * c, size / 2 + 1)
    const yieldK = onTop ? 1 : 1 - clamp01(flash * 1.6)
    if (yieldK <= 0.01) return
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? l.ox + inset : l.ox + COLS * c - inset
      if (onTop) {
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.8 * flash
        const g = size * 0.8
        ctx.drawImage(this.vfx.dot('#ff2a3a'), x - g, y - g, g * 2, g * 2)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = clamp01(flash * 1.6)
        ctx.drawImage(red, x - size / 2, y - size / 2, size, size)
        continue
      }
      if (lit > 0.01) {
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = lit * (0.3 + 0.3 * pulse) * yieldK
        ctx.drawImage(this.vfx.dot('#ff2a3a'), x - size, y - size, size * 2, size * 2)
        ctx.globalCompositeOperation = 'source-over'
      }
      ctx.globalAlpha = 0.34 * (1 - lit) * yieldK
      if (ctx.globalAlpha > 0.01) ctx.drawImage(bone, x - size / 2, y - size / 2, size, size)
      if (lit > 0.01) {
        ctx.globalAlpha = lit * (0.72 + 0.28 * pulse) * yieldK
        ctx.drawImage(red, x - size / 2, y - size / 2, size, size)
      }
    }
    ctx.globalAlpha = 1
  }

  /** The overrun demo's moment: the line flashes red, the skulls flash big, and
   *  a big red skull blooms under the line where the ghost crossed — all of
   *  it below the line, so the real monster above stays in plain view. */
  private drawLineFlash(ctx: CanvasRenderingContext2D, t: number): void {
    const l = this.layout
    const c = l.cell
    const ly = l.oy + ROWS * c
    const f = this.lineFlash
    if (f > 0.01) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.7 * f
      ctx.drawImage(this.vfx.dot('#ff2a3a'), l.ox - c * 0.5, ly - c * 0.6, (COLS + 1) * c, c * 1.2)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = clamp01(f * 1.3)
      ctx.fillStyle = '#ff3848'
      const hh = 2 + 4 * f
      ctx.fillRect(l.ox, ly - hh / 2, COLS * c, hh)
      ctx.globalAlpha = 1
    }
    this.drawLineSkulls(ctx, t, true)
    const k = this.crossSkull
    const red = this.skullRed
    if (k > 0.01 && red) {
      const size = c * SKULL_SIZE * (2.2 + (this.reducedMotion ? 0 : 0.5 * k))
      const x = Math.max(l.ox + size / 2, Math.min(l.ox + COLS * c - size / 2, l.ox + this.crossX * c))
      const y = ly + size / 2 + c * 0.02
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.7 * k
      const g = size * 0.8
      ctx.drawImage(this.vfx.dot('#ff2a3a'), x - g, y - g, g * 2, g * 2)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = clamp01(k * 1.5)
      ctx.drawImage(red, x - size / 2, y - size / 2, size, size)
      ctx.globalAlpha = 1
    }
  }

  /** The ghost's top row (+ its hop lift) at demo time → ghostY / ghostLift. */
  private ghostPos(d: OverrunGhost): void {
    this.ghostLift = 0
    if (d.reduced) {
      this.ghostY = d.y1
      return
    }
    const tw = d.t - d.walkAt
    if (tw <= 0) {
      this.ghostY = d.y0
      return
    }
    if (tw >= d.walkDur) {
      this.ghostY = d.y1
      return
    }
    const stepDur = d.walkDur / d.hops
    const i = Math.min(d.hops - 1, Math.floor(tw / stepDur))
    const u = clamp01((tw - i * stepDur) / stepDur)
    const e = u * u * (3 - 2 * u)
    this.ghostY = d.y0 + ((i + e) * (d.y1 - d.y0)) / d.hops
    this.ghostLift = Math.sin(Math.PI * u) * 0.16
  }

  private updateDemo(dt: number, s: BoardState): void {
    const d = this.demo
    if (!d.on) return
    d.t += dt
    if (d.stopAt < 0 && (s.phase !== 'aim' || this.aimArmed)) d.stopAt = d.t
    if (d.stopAt >= 0) {
      this.demoCut = true
      if (d.t >= d.stopAt + DEMO_STOP) d.on = false
      return
    }
    if (d.t >= d.dur) {
      d.on = false
      return
    }
    if (!d.flashed) {
      this.ghostPos(d)
      if (d.reduced ? d.t >= DEMO_IN_STILL : this.ghostY + d.h >= ROWS + DEMO_FLASH_PAST) {
        // Across the line: this is the loss.
        d.flashed = true
        this.lineFlash = 1
        this.skullFlash = 1
        this.crossSkull = 1
        this.crossX = d.x + d.w / 2
        this.vfx.burst(this.crossX, ROWS, 12, 3.5, '#ff3848', 0.11, 0.5, 0, true)
        this.sfx.request('overrun', 0.045, 1.1, 8, 800, 'overrun-demo')
      }
    }
    if (!d.dissolved && d.t >= d.dissolveAt) {
      d.dissolved = true
      this.ghostPos(d)
      const cx = d.x + d.w / 2
      const cy = this.ghostY + d.h / 2
      for (let i = 0; i < 10; i++) {
        this.vfx.spark(cx + (Math.random() - 0.5) * d.w * 0.8, cy + (Math.random() - 0.5) * d.h * 0.8,
          (Math.random() - 0.5) * 0.6, -1.2 - Math.random() * 1.2, 0.6, 0.1, '#e8f0ff', -0.4, 0.96)
      }
    }
  }

  /** The pale ghost (its own sprite, ~55% alpha + its white silhouette). */
  private drawOverrunGhost(ctx: CanvasRenderingContext2D): void {
    const d = this.demo
    const bake = d.bake
    if (!d.on || !bake) return
    let a = clamp01(d.t / (d.reduced ? DEMO_IN_STILL : DEMO_IN))
    if (d.t > d.dissolveAt) a *= 1 - clamp01((d.t - d.dissolveAt) / DEMO_OUT)
    if (d.stopAt >= 0) a *= 1 - clamp01((d.t - d.stopAt) / DEMO_STOP)
    if (a <= 0.01) return
    this.ghostPos(d)
    const l = this.layout
    const c = l.cell
    const grow = d.t > d.dissolveAt ? 1 + 0.22 * clamp01((d.t - d.dissolveAt) / DEMO_OUT) : 1
    const dw = bake.dw * c * d.scale * grow
    const dh = bake.dh * c * d.scale * grow
    const cx = l.ox + (d.x + d.w / 2) * c
    const by = l.oy + (this.ghostY + d.h - 0.06 - this.ghostLift) * c
    // The real monster stays drawn in place: the ghost only shows below its
    // footprint, stepping out from under it.
    const top = l.oy + (d.y0 + d.h) * c
    ctx.save()
    ctx.beginPath()
    ctx.rect(l.ox, top, COLS * c, l.by + l.bh - top)
    ctx.clip()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.28 * a
    const gr = Math.max(dw, dh) * 0.75
    ctx.drawImage(this.vfx.dot('#dfe8ff'), cx - gr, by - dh / 2 - gr, gr * 2, gr * 2)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 0.55 * a
    ctx.drawImage(bake.base, cx - dw / 2, by - dh, dw, dh)
    ctx.globalAlpha = 0.5 * a
    ctx.drawImage(bake.white, cx - dw / 2, by - dh, dw, dh)
    ctx.restore()
  }

  /** Start loading every walker unlocked by `row` + 3, so a new kind's first
   *  row never pops in (a Map hit once loaded; boot warms the first six). */
  private warmWalkers(row: number): void {
    for (const k of WALKER_KINDS) if (KIND_UNLOCK_ROW[k] <= row + 3) sprite(monsterSpriteSrc(k, undefined))
  }

  private microShake(mag: number, dur: number): void {
    if (this.reducedMotion) return
    if (mag >= this.shakeMag || this.shakeT <= 0) this.shakeMag = mag
    this.shakeT = Math.max(this.shakeT, dur)
  }

  private bigShake(i: 'small' | 'strong' | 'big'): void {
    if (this.reducedMotion) return
    this.hooks.shake(i)
  }

  private ability(a: string, x: number, y: number, monsterId: number | undefined, targets: number[] | undefined): void {
    const v = monsterId !== undefined ? this.views.get(monsterId) : undefined
    const mx = v ? v.x + v.w / 2 : x
    const my = v ? v.y + v.h / 2 : y
    switch (a) {
      case 'burn':
        this.vfx.burst(mx, my, 4, 1.6, '#ff9a3c', 0.1, 0.5, -2)
        break
      case 'knockback':
        if (v) {
          v.flinch = 1
          v.fdx = 0
          v.fdy = -1
        }
        this.vfx.ring(mx, my + 0.3, 0.2, 0.9, 0.3, '#eaf6ff', 0.07)
        for (let i = 0; i < 5; i++) this.vfx.spark(mx + (i - 2) * 0.16, my + 0.45, 0, -5.5, 0.25, 0.07, '#eaf6ff', 0, 0.9)
        this.sfx.request('dodge', 0.025, 0.9, 1, 120)
        break
      case 'pierce':
        this.vfx.burst(x, y, 5, 5, '#e8d2b0', 0.08, 0.3)
        this.sfx.request('stone-cut', 0.015, 1.3, 0, 120, 'pierce')
        break
      case 'freeze':
        if (this.frostStar) {
          const img = this.frostStar
          this.vfx.floater(img, 0, 0, img.width, img.height, mx, my, v ? Math.max(v.w, v.h) * 1.1 : 1.1, 0.55, 0, 2)
        }
        this.vfx.ring(mx, my, 0.3, 1, 0.4, '#9fdcff', 0.08)
        this.sfx.request('frost-nova', 0.03, 1.1, 2, 150)
        break
      case 'splash':
        this.vfx.ring(mx, my, 0.3, 1.5, 0.45, '#7fd6ff', 0.1)
        this.vfx.burst(mx, my, 10, 4, '#7fd6ff', 0.1, 0.45, 5)
        this.sfx.request('water-splash', 0.03, 1, 2, 120)
        break
      case 'crush':
        if (v) v.flinch = 1
        this.vfx.burst(mx, my, 10, 4.5, '#b8a184', 0.12, 0.5, 6)
        this.vfx.ring(mx, my, 0.3, 1.1, 0.3, '#ffcf8a', 0.1)
        this.microShake(0.08, 0.15)
        this.sfx.request('stone-cut', 0.035, 0.75, 3, 120, 'crush')
        break
      case 'chain': {
        let n = 0
        if (targets) {
          let fx = mx
          let fy = my
          for (let i = 0; i < targets.length; i++) {
            const tv = this.views.get(targets[i]!)
            if (!tv) continue
            const tx = tv.x + tv.w / 2
            const ty = tv.y + tv.h / 2
            this.vfx.bolt(fx, fy, tx, ty, '#a88bff')
            tv.flash = 1
            tv.flinch = Math.max(tv.flinch, 0.7)
            fx = tx
            fy = ty
            n++
          }
        }
        if (n > 0) this.sfx.request('chain-zap', 0.035, 1 + Math.random() * 0.2, 3, 120)
        break
      }
      case 'poison':
        this.vfx.burst(mx, my, 5, 1.4, '#aaff3c', 0.1, 0.6, -1.5)
        break
      case 'midas':
        this.vfx.burst(mx, my, 6, 3, '#ffe27a', 0.1, 0.5)
        this.sfx.request('coin-pickup', 0.02, 1.5, 1, 100, 'midas')
        break
      case 'eruption': {
        this.vfx.blast(mx, my, 1.8, '#ff7a2a', 0.5)
        this.vfx.ring(mx, my, 0.4, 1.9, 0.45, '#ffb15a', 0.12)
        this.vfx.burst(mx, my, 18, 6, '#ff9a3c', 0.13, 0.6, 5)
        this.vfx.impact(mx, my, 3, tierInfo(1).sheet)
        this.microShake(0.12, 0.22)
        this.sfx.request('explosion-1', 0.045, 0.9 + Math.random() * 0.2, 6, 150)
        break
      }
    }
  }

  private killFx(id: number, kind: MonsterKind, bossKind: BossKind | undefined, corrupted: boolean, x: number, y: number): void {
    const v = this.views.get(id)
    // Roared away (the first boss's arrival): flung off when the shockwave
    // reaches it — never the first-session kill hold, so ~10 kills at once
    // neither stack nor stall. Its coins (next in this burst) leave on the strike.
    if (v && v.roarAt >= 0 && v.dieAt < 0) {
      v.dieAt = v.roarAt + BLOW_DUR
      v.dieKind = kind
      v.dieCorrupted = corrupted
      v.holdAt = -1
      v.holdCoins = 0
      this.heldKill = v
      return
    }
    // Engine kills are instant; a meteor kill (Meteor skill, meteor/revive continue)
    // waits on screen for its meteor so the rock visibly does it.
    if (v && v.bake && v.dieAt < 0) {
      let at = v.meteorAt > this.time ? v.meteorAt : -1
      if (at < 0 && this.engine?.state.phase === 'breach') {
        const delay = 0.08 + Math.random() * 0.3
        this.vfx.meteor(v.x + v.w / 2, v.y + v.h / 2, delay, kind === 'boss')
        at = this.time + delay + METEOR_FALL
      }
      if (at > 0) {
        v.dieAt = at
        v.dieKind = kind
        v.dieCorrupted = corrupted
        return
      }
    }
    // First session: hold the kill so it visibly registers (bosses have their
    // own set piece — bossDefeated — and are never held).
    if (v && v.dieAt < 0 && kind !== 'boss' && this.engine?.state.config.ftue) {
      v.dieAt = this.time + KILL_HOLD
      v.dieKind = kind
      v.dieCorrupted = corrupted
      v.holdAt = this.time
      v.holdHp = Math.max(0, v.hpShown)
      v.holdCoins = 0
      v.flash = 1
      v.flinch = 1
      this.heldKill = v
      return
    }
    this.deathFx(v ?? null, kind, bossKind, corrupted, x, y)
  }

  /** Coins earned at board point (x, y): fly them to the wallet (or float a coin up). */
  private coinFx(x: number, y: number, amount: number): void {
    const l = this.layout
    if (!this.hooks.coins(l.ox + x * l.cell, l.oy + y * l.cell, amount)) {
      if (this.coin.ready) {
        const b = this.coin.box
        this.vfx.floater(this.coin.img, b.x, b.y, b.w, b.h, x, y, 0.45, 0.7, 0.9)
      }
    }
    this.vfx.burst(x, y, 4, 2.5, '#ffd23c', 0.08, 0.5)
    this.sfx.request('coin-pickup', 0.02, 1 + Math.random() * 0.2, 1, 90)
  }

  private deathFx(v: MonsterView | null, kind: MonsterKind, bossKind: BossKind | undefined, corrupted: boolean, x: number, y: number): void {
    const color = corrupted ? '#b05cff' : monsterColor(kind, bossKind)
    if (v && v.bake) {
      const bake = v.bake
      const m = v.m
      const img = m && m.enraged && bake.enraged ? bake.enraged : bake.base
      this.vfx.corpse(v.x + v.w / 2, v.y + v.h - 0.06, bake.dw * v.scale, bake.dh * v.scale, img, bake.white, kind === 'boss' ? 0.55 : 0.3)
    }
    const cx = v ? v.x + v.w / 2 : x
    const cy = v ? v.y + v.h / 2 : y
    const big = kind === 'boss'
    this.vfx.burst(cx, cy, big ? 30 : 12, big ? 8 : 5, color, big ? 0.16 : 0.12, 0.55, 7)
    this.vfx.burst(cx, cy, big ? 10 : 4, 3, '#ffffff', 0.1, 0.3)
    this.vfx.ring(cx, cy, 0.2, big ? 2.5 : 0.9, 0.35, color, 0.08)
    this.sfx.request('enemy-death', 0.03, 0.9 + Math.random() * 0.25, 4, 60)
    if (corrupted) this.sfx.request('crystal-cut', 0.03, 0.8, 3, 120)
  }

  private skillFx(skill: SkillId, x: number, y: number): void {
    const tint = SKILL_TINT[skill]
    this.vfx.ring(x, y, 0.3, 2.2, 0.6, tint, 0.12)
    this.sfx.request(SKILL_SFX[skill], 0.06, 1, 8, 250, 'skill')
    switch (skill) {
      case 'meteor': {
        // Emitted before the engine applies the damage: aim one rock per monster
        // and remember when it lands, so the kills that follow wait for it.
        let i = 0
        const n = this.viewList.length
        const step = Math.min(0.045, 0.9 / Math.max(1, n))
        for (let k = 0; k < n; k++) {
          const v = this.viewList[k]!
          if (!v.m || v.dieAt >= 0) continue
          const delay = i * step + Math.random() * 0.08
          this.vfx.meteor(v.x + v.w / 2, v.y + v.h / 2, delay, v.kind === 'boss')
          v.meteorAt = this.time + delay + METEOR_FALL
          i++
        }
        this.flashGold = 0.6
        break
      }
      case 'warcry':
        this.flashRed = 0.5
        this.vfx.ring(this.lx, FLOOR_Y - 0.4, 0.3, 3.2, 0.6, '#ff5a3c', 0.14)
        break
      case 'legion':
        this.vfx.burst(x, y, 16, 5, '#9fd8ff', 0.12, 0.6)
        break
      case 'pact':
        this.vfx.burst(this.lx, FLOOR_Y - 0.5, 18, 4, '#c05cff', 0.12, 0.7, -2)
        break
      case 'shield':
        this.flashBlue = 0.8
        this.vfx.ring(COLS / 2, ROWS, 0.4, 4, 0.6, '#5ab8ff', 0.12)
        break
      case 'execute':
        this.flashRed = 0.6
        this.microShake(0.1, 0.2)
        break
      case 'heal':
        for (let k = 0; k < this.viewList.length; k++) {
          const v = this.viewList[k]!
          if (!v.m) continue
          for (let j = 0; j < 2; j++) this.vfx.spark(v.x + v.w * Math.random(), v.y + v.h, 0, -4, 0.35, 0.08, '#6fe08a', 0, 0.92)
        }
        this.flashGold = 0.3
        break
      case 'revive':
        this.flashGold = 0.7
        this.vfx.burst(this.lx, FLOOR_Y - 0.5, 20, 5, '#ffe27a', 0.12, 0.7)
        break
    }
    const icon = this.skillIcons.get(skill)
    if (icon && icon.ready) {
      const b = icon.box
      this.vfx.floater(icon.img, b.x, b.y, b.w, b.h, x, y, 1.5, 0.9, 1)
    }
  }

  private meteorLanded(x: number, y: number, big: boolean): void {
    this.vfx.blast(x, y, big ? 2 : 1.2, '#ff7a2a', 0.4)
    this.vfx.burst(x, y, big ? 14 : 8, 5, '#ff9a3c', 0.12, 0.5, 6)
    this.vfx.impact(x, y, big ? 2.4 : 1.5, tierInfo(1).sheet)
    const v = this.nearestView(x, y)
    if (v) {
      v.flinch = 1
      v.flash = 1
      v.fdx = 0
      v.fdy = 1
    }
    this.microShake(big ? 0.14 : 0.07, 0.15)
    this.sfx.request('meteor-impact', 0.04, 0.85 + Math.random() * 0.35, 5, 70)
  }

  private nearestView(x: number, y: number): MonsterView | null {
    let best: MonsterView | null = null
    let bd = 0.8
    for (let i = 0; i < this.viewList.length; i++) {
      const v = this.viewList[i]!
      const d = Math.abs(v.x + v.w / 2 - x) + Math.abs(v.y + v.h / 2 - y)
      if (d < bd) { bd = d; best = v }
    }
    return best
  }

  // ─── Bakes ─────────────────────────────────────────────────────────────────
  /** Plate + HP digits into the view's own label canvas (reused across the view's lifetimes). */
  private bakeLabel(v: MonsterView, variant: number, boss: boolean, gg: number): void {
    const l = this.layout
    const d = l.dpr
    const c = l.cell
    const plate = this.plate(v.hpText.length, boss, variant)
    const w = plate.width
    const h = plate.height
    let cv = v.label
    if (!cv || cv.width < w || cv.height < h) {
      cv = createCanvas(Math.max(w, cv?.width ?? 0), Math.max(h, cv?.height ?? 0))
      v.label = cv
    }
    const g = ctx2d(cv)
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, cv.width, cv.height)
    g.drawImage(plate, 0, 0)
    const fs = (boss ? Math.max(14, Math.min(30, c * 0.5)) : Math.max(10, Math.min(19, c * 0.3))) * d
    glyphs('hp').draw(g, v.hpText, w / 2, h / 2, fs)
    v.labelW = w
    v.labelH = h
    v.labelText = v.hpText
    v.labelVariant = variant
    v.labelGen = this.bakeGen
    v.labelGlyph = gg
  }

  /** HP plate for `n` characters (baked per count × variant × size). */
  private plate(n: number, boss: boolean, variant: number): HTMLCanvasElement {
    const idx = Math.min(12, n) + (boss ? 16 : 0) + variant * 32
    const hit = this.plates[idx]
    if (hit) return hit
    const l = this.layout
    const c = l.cell
    const fs = boss ? Math.max(14, Math.min(30, c * 0.5)) : Math.max(10, Math.min(19, c * 0.3))
    const w = Math.round((fs * (0.62 * Math.min(12, n) + 0.75)) * l.dpr)
    const h = Math.round(fs * 1.22 * l.dpr)
    const cv = createCanvas(w, h)
    const g = ctx2d(cv)
    const r = h / 2
    const border = variant === 1 ? '#c05cff' : variant === 2 ? '#fff06a' : variant === 3 ? '#ff4030' : 'rgba(255,255,255,0.28)'
    g.fillStyle = 'rgba(10,12,28,0.84)'
    g.beginPath()
    g.moveTo(r, 0)
    g.lineTo(w - r, 0)
    g.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2)
    g.lineTo(r, h)
    g.arc(r, r, r, Math.PI / 2, Math.PI * 1.5)
    g.closePath()
    g.fill()
    g.lineWidth = Math.max(1, l.dpr * (variant ? 1.4 : 1))
    g.strokeStyle = border
    g.stroke()
    this.plates[idx] = cv
    return cv
  }

  /** Countdown pip disc: a solid, dark-rimmed coin the digit sits on. */
  private bakePip(px: number, fill: string, rim: string): HTMLCanvasElement {
    const s = Math.max(10, px)
    const cv = createCanvas(s, s)
    const g = ctx2d(cv)
    const c = s / 2
    const r = c - Math.max(1, s * 0.06)
    const body = g.createRadialGradient(c - r * 0.3, c - r * 0.35, r * 0.1, c, c, r)
    body.addColorStop(0, rgba('#ffffff', 0.55))
    body.addColorStop(0.35, fill)
    body.addColorStop(1, fill)
    g.fillStyle = body
    g.beginPath()
    g.arc(c, c, r, 0, TAU)
    g.fill()
    g.lineWidth = Math.max(1.5, s * 0.1)
    g.strokeStyle = rim
    g.stroke()
    g.lineWidth = Math.max(1, s * 0.04)
    g.strokeStyle = 'rgba(255,255,255,0.85)'
    g.beginPath()
    g.arc(c, c, r - s * 0.07, 0, TAU)
    g.stroke()
    return cv
  }

  /** The line's skull glyph: cranium + jaw in `bone`, dark eye sockets, nose
   *  and teeth in `socket`, a dark outline (drawn in a 100-unit box). */
  private bakeSkull(px: number, bone: string, socket: string, outline: string): HTMLCanvasElement {
    const s = Math.max(12, px)
    const cv = createCanvas(s, s)
    const g = ctx2d(cv)
    const k = s / 100
    g.setTransform(k, 0, 0, k, 0, 0)
    const shape = (): void => {
      g.beginPath()
      g.arc(50, 42, 33, 0, TAU)
      // Jaw: a rounded rect, clockwise like the cranium so the fill is the union.
      const x = 31
      const y = 56
      const w = 38
      const h = 32
      const r = 9
      g.moveTo(x + r, y)
      g.arcTo(x + w, y, x + w, y + h, r)
      g.arcTo(x + w, y + h, x, y + h, r)
      g.arcTo(x, y + h, x, y, r)
      g.arcTo(x, y, x + w, y, r)
      g.closePath()
    }
    g.lineJoin = 'round'
    g.strokeStyle = outline
    g.lineWidth = 9
    shape()
    g.stroke()
    g.fillStyle = bone
    shape()
    g.fill()
    g.fillStyle = socket
    g.beginPath()
    g.ellipse(37, 45, 10, 11.5, 0.15, 0, TAU)
    g.ellipse(63, 45, 10, 11.5, -0.15, 0, TAU)
    g.fill()
    g.beginPath()
    g.moveTo(50, 57)
    g.lineTo(44.5, 67)
    g.lineTo(55.5, 67)
    g.closePath()
    g.fill()
    g.strokeStyle = socket
    g.lineWidth = 3.5
    g.lineCap = 'round'
    g.beginPath()
    for (const tx of [41, 50, 59]) {
      g.moveTo(tx, 75)
      g.lineTo(tx, 85)
    }
    g.stroke()
    // A bone highlight on the crown.
    g.strokeStyle = 'rgba(255,255,255,0.45)'
    g.lineWidth = 3
    g.beginPath()
    g.arc(50, 42, 26, Math.PI * 1.15, Math.PI * 1.55)
    g.stroke()
    return cv
  }

  private bakeBubble(px: number, rim: string, fill: string): HTMLCanvasElement {
    const s = Math.max(8, px)
    const cv = createCanvas(s, s)
    const g = ctx2d(cv)
    const c = s / 2
    const r = c - 1.5
    const body = g.createRadialGradient(c, c, r * 0.4, c, c, r)
    body.addColorStop(0, fill)
    body.addColorStop(1, rgba('#bfe8ff', 0.3))
    g.fillStyle = body
    g.beginPath()
    g.arc(c, c, r, 0, TAU)
    g.fill()
    g.lineWidth = Math.max(1.2, s * 0.05)
    g.strokeStyle = rim
    g.stroke()
    g.fillStyle = 'rgba(255,255,255,0.75)'
    g.beginPath()
    g.ellipse(c - r * 0.42, c - r * 0.48, r * 0.22, r * 0.12, -0.7, 0, TAU)
    g.fill()
    return cv
  }

  /** A white pointing hand, tilted up-left, fingertip at (0.28, 0.1) of the bake. */
  private bakeTapHand(px: number): HTMLCanvasElement {
    const s = Math.max(12, px)
    const cv = createCanvas(s, s)
    const g = ctx2d(cv)
    // Drawn in a 100-unit box pointing straight up (fingertip at 50,8), then
    // turned round the fingertip.
    const k = s / 100
    g.setTransform(k, 0, 0, k, 0, 0)
    g.translate(28, 10)
    g.rotate((-25 * Math.PI) / 180)
    g.translate(-50, -8)
    // All subpaths clockwise, so the fill is their union.
    const rrect = (x: number, y: number, w: number, h: number, r: number): void => {
      g.moveTo(x + r, y)
      g.arcTo(x + w, y, x + w, y + h, r)
      g.arcTo(x + w, y + h, x, y + h, r)
      g.arcTo(x, y + h, x, y, r)
      g.arcTo(x, y, x + w, y, r)
      g.closePath()
    }
    const shape = (): void => {
      g.beginPath()
      rrect(42, 8, 16, 54, 8)
      rrect(30, 46, 50, 48, 16)
      g.moveTo(75, 52)
      g.arc(66, 52, 9, 0, TAU)
      g.moveTo(84, 59)
      g.arc(76, 59, 8, 0, TAU)
      g.moveTo(40, 66)
      g.ellipse(31, 66, 9, 15, -0.5, 0, TAU)
    }
    g.lineJoin = 'round'
    g.strokeStyle = 'rgba(14,18,42,0.95)'
    g.lineWidth = 9
    shape()
    g.stroke()
    g.fillStyle = '#ffffff'
    shape()
    g.fill()
    // Knuckle creases, so it reads as a hand and not a blob.
    g.strokeStyle = 'rgba(14,18,42,0.55)'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(58, 50)
    g.lineTo(58, 64)
    g.moveTo(71, 57)
    g.lineTo(71, 68)
    g.stroke()
    return cv
  }

  private bakeSludge(px: number): HTMLCanvasElement {
    const s = Math.max(8, px)
    const cv = createCanvas(s, s)
    const g = ctx2d(cv)
    const c = s / 2
    const blob = (x: number, y: number, r: number): void => {
      const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r)
      grad.addColorStop(0, '#9fb04a')
      grad.addColorStop(0.6, '#5d6b22')
      grad.addColorStop(1, '#343d12')
      g.fillStyle = grad
      g.beginPath()
      g.arc(x, y, r, 0, TAU)
      g.fill()
    }
    blob(c, c + s * 0.08, s * 0.36)
    blob(c - s * 0.2, c + s * 0.14, s * 0.2)
    blob(c + s * 0.22, c + s * 0.12, s * 0.22)
    blob(c + s * 0.05, c - s * 0.12, s * 0.22)
    g.fillStyle = 'rgba(230,255,170,0.55)'
    for (const [bx, by, br] of [[-0.1, -0.05, 0.05], [0.14, 0.1, 0.035], [-0.16, 0.18, 0.03]] as const) {
      g.beginPath()
      g.arc(c + bx * s, c + by * s, br * s, 0, TAU)
      g.fill()
    }
    g.strokeStyle = 'rgba(20,24,6,0.8)'
    g.lineWidth = Math.max(1, s * 0.025)
    g.beginPath()
    g.arc(c, c + s * 0.08, s * 0.36, 0, TAU)
    g.stroke()
    return cv
  }

  private bakePedestal(px: number, ti: TierInfo): HTMLCanvasElement {
    const w = Math.max(16, px)
    const h = Math.round(w * 0.42)
    const cv = createCanvas(w, h)
    const g = ctx2d(cv)
    const cx = w / 2
    const top = h * 0.3
    const rx = w * 0.46
    const ry = h * 0.26
    // Stone drum.
    const side = g.createLinearGradient(0, top, 0, h)
    side.addColorStop(0, '#3a4270')
    side.addColorStop(1, '#161a33')
    g.fillStyle = side
    g.beginPath()
    g.ellipse(cx, h - ry - 1, rx, ry, 0, 0, Math.PI)
    g.lineTo(cx - rx, top)
    g.ellipse(cx, top, rx, ry, 0, Math.PI, 0, true)
    g.closePath()
    g.fill()
    // Glowing element rim on top.
    const cap = g.createRadialGradient(cx, top, rx * 0.1, cx, top, rx)
    cap.addColorStop(0, rgba(ti.light, 0.9))
    cap.addColorStop(0.6, rgba(ti.body, 0.85))
    cap.addColorStop(1, rgba(ti.accent, 0.95))
    g.fillStyle = cap
    g.beginPath()
    g.ellipse(cx, top, rx, ry, 0, 0, TAU)
    g.fill()
    g.lineWidth = Math.max(1.5, w * 0.022)
    g.strokeStyle = rgba(ti.accent, 1)
    g.stroke()
    g.lineWidth = Math.max(1, w * 0.01)
    g.strokeStyle = 'rgba(255,255,255,0.6)'
    g.beginPath()
    g.ellipse(cx, top - ry * 0.1, rx * 0.7, ry * 0.55, 0, Math.PI * 1.1, Math.PI * 1.9)
    g.stroke()
    return cv
  }
}
