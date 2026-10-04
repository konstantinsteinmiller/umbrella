<script setup lang="ts">
/**
 * Elemental Barrage — the single game scene. Boots straight into the board.
 *
 * MOBILE PORTRAIT FIRST (360–430 px wide):
 *
 *   ┌ top bar (teleported): ROW 12 · Boss in 8 · Best 34 │ rank · coins · mute · ⚙
 *   ├ BarrageBoard — the hero, everything the rest leaves (≈ 70 % of a 390×844)
 *   └ bottom panel (≈ 23 %): [codex] ball tray [supply]
 *                            five upgrade chips
 *                            [daily][daily run][collection] TURN CONTROL [pass][trophies]
 *
 * LANDSCAPE / DESKTOP (any viewport meaningfully wider than tall): the board is
 * centred and height-led; utilities (and the rank) stand in the left column, the
 * tray + upgrades + turn control in the right one — each under a thumb on a
 * landscape phone.
 *
 * Platform chores kept from MIW: the teleported z-[55] top bar (so the wallet
 * stays visible — and the coin-flight target — above every modal), safe-area
 * insets + the Android nav-bar reserve, the compact / ultra / roomy HUD tiers,
 * no in-game mute on CrazyGames, screenshake on the scene root, battle music,
 * the DEV clean feed and video seam, and the achievement toast held back while
 * a new-tier reveal owns the moment.
 *
 * SILENT FLOW (retention-roadmap #2) — until the first boss kill (`silentFlow`,
 * progress.ts `isFtueActive`) the HUD is earned, not given. A first-timer's
 * frame 1 is the board, the launcher, "Tap to Shoot" with its ghost finger,
 * the boss countdown and the options gear. Then, in the world's own time:
 * the tray appears as the first "+1" flies into it, the wallet with the first
 * coin, each upgrade chip the first time it is affordable (flown in,
 * useFeatureUnlocks), and at the first boss kill the row badge, the mute and
 * the rank plaque (the plaque with an earned fly-in). Every hidden piece keeps
 * its box (visibility), so nothing — least of all the board — ever resizes
 * when it arrives. A returning player sees the whole HUD from the first frame.
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

import BarrageBoard from '@/components/barrage/BarrageBoard.vue'
import BallTray from '@/components/barrage/BallTray.vue'
import UpgradeBar from '@/components/barrage/UpgradeBar.vue'
import TurnControls from '@/components/barrage/TurnControls.vue'
import BossBar from '@/components/barrage/BossBar.vue'
import BossPreview from '@/components/barrage/BossPreview.vue'
import BarrageBanners from '@/components/barrage/BarrageBanners.vue'
import ShootPrompt from '@/components/barrage/ShootPrompt.vue'
import BreachModal from '@/components/barrage/BreachModal.vue'
import DeathOverlay from '@/components/barrage/DeathOverlay.vue'
import BossChestModal from '@/components/barrage/BossChestModal.vue'
import CollectionModal from '@/components/barrage/CollectionModal.vue'
import DailyBarrageModal from '@/components/barrage/DailyBarrageModal.vue'
import SupplyDropButton from '@/components/barrage/SupplyDropButton.vue'
import HudButton from '@/components/barrage/HudButton.vue'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import AchievementToast from '@/components/barrage/AchievementToast.vue'
import { boardApi, coinRain, fmtCoins, noteCoinRain, playerAiming, type BoardApi } from '@/components/barrage/barrageUi'
import CoachOverlay from '@/components/barrage/coach/CoachOverlay.vue'
import HudTip from '@/components/barrage/HudTip.vue'
import { rankTip, showHudTip } from '@/components/barrage/hudTip'
import FeatureSlot from '@/components/barrage/FeatureSlot.vue'
import FeatureUnlockFx from '@/components/barrage/FeatureUnlockFx.vue'
import LessonSpotlight from '@/components/barrage/LessonSpotlight.vue'
import { lessonSpot } from '@/components/barrage/lessonSpotlight'

import useBarrage from '@/barrage/state/useBarrage'
import useBarrageUpgrades from '@/barrage/state/useBarrageUpgrades'
import useCollections from '@/barrage/state/useCollections'
import useDailyBarrage from '@/barrage/state/useDailyBarrage'
import { BOARD_ASPECT } from '@/barrage/render/layout'
import { FIGHTER_ART_MAX, fighterSrc } from '@/barrage/art'

import { useMusic } from '@/use/useSound'
import useSounds from '@/use/useSound'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import useEpicConfig from '@/use/useEpicConfig'
import useScreenshake from '@/use/useScreenshake'
import { isMobileLandscape, isCompactHud, isUltraCompactHud, isRoomyHud, isWideCompactHud, windowWidth, windowHeight, isCrazyWeb, androidNavBarPx } from '@/use/useUser'
import { artSrc } from '@/use/useArtOverrides'
import { cssVarUrl } from '@/utils/function'
import { backdropSrc } from '@/barrage/render/backdropArt'
import { installBarrageTutorial, tutorialActive, tutorialStep } from '@/use/useTutorial'
import { installCoach, noteMisfire } from '@/use/useCoach'
import { CHIP_IDS, chipStates, featureReady, featureShown, installFeatureUnlocks, rankState, unlocking } from '@/use/useFeatureUnlocks'
import { isAnyModalOpen } from '@/use/useModalState'
import { isFtueActive, stats as barrageStats } from '@/barrage/state/progress'
import { upgradeLevels } from '@/barrage/state/upgradeLevels'
import { activeReveal, setRevealGate, silentRevealAllowed } from '@/use/useTierReveal'
import useAchievements, { ACHIEVEMENTS, achievementToast } from '@/use/useAchievements'
import { rankedBest, installWaveLeaderboard } from '@/use/useWaveLeaderboard'
import { leaderboardEnabled } from '@/use/useLeaderboard'
import { CLEAN_FEED } from '@/game/cleanFeed'

import CoinBadge from '@/components/organisms/CoinBadge.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import RankBadge from '@/components/atoms/RankBadge.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'
import ParticleCanvas from '@/components/organisms/ParticleCanvas.vue'
import TutorialOverlay from '@/components/organisms/TutorialOverlay.vue'
import UnitCodexModal from '@/components/organisms/UnitCodexModal.vue'
import BattlePass from '@/components/organisms/BattlePass.vue'
import AchievementsButton from '@/components/organisms/AchievementsButton.vue'
import DailyRewards from '@/components/organisms/DailyRewards.vue'
import TierRevealFx from '@/components/organisms/TierRevealFx.vue'

const { t, te } = useI18n()
const barrage = useBarrage()
/** Run 7: the death sequence plays before the death screen (BreachModal waits for it). */
const deathScene = computed(() => barrage.deathScene.value)
const upgrades = useBarrageUpgrades()
const collections = useCollections()
const daily = useDailyBarrage()
const { playSound } = useSounds()
const { startBattleMusic, stopBattleMusic } = useMusic()
const { shakeStyle } = useScreenshake()
const { coins: walletCoins } = useEpicConfig()

// ─── Refs ─────────────────────────────────────────────────────────────────────
const coinBadgeRef = ref<InstanceType<typeof CoinBadge> | null>(null)
const coinBadgeEl = computed<HTMLElement | null>(() => coinBadgeRef.value?.rootEl ?? null)
/** BarrageBoard's exposed seam (CONTRACT §10). Typed by the seam, not by the
 *  component, so a RENDER-side refactor of its internals can't ripple here —
 *  and Partial: every call falls back safely while a seam method is missing. */
const boardRef = ref<Partial<BoardApi> | null>(null)
const boardAreaEl = ref<HTMLElement | null>(null)

const showOptions = ref(false)
const showCodex = ref(false)
const showCollection = ref(false)
const showDaily = ref(false)

// ─── HUD numbers ─────────────────────────────────────────────────────────────
const bossIn = computed(() => Math.max(1, barrage.nextBossRow.value - barrage.row.value))
/** The next boss in smoke beside "Boss in N" — while no boss lives (a live
 *  boss has its bar on that line instead). Wordless: the retention hook for a
 *  first-time player still nine rows from the first boss. */
const showBossPreview = computed(() => !barrage.boss.value && !isUltraCompactHud.value)
/** Its edge: a little under the row badge + line 2 it stands beside. */
const bossPreviewPx = computed(() => isCompactHud.value ? (isWideCompactHud.value ? 40 : 38) : isRoomyHud.value ? 60 : 50)
/** The badge / line-2 stack fills the block — and line 2 shows the boss bar —
 *  only once the preview has LEFT: flipped after the render (`flush: 'post'`),
 *  so `pinForLeave` still reads the preview where it stood beside "Boss in N",
 *  not where the bar's width pushed it. Same frame, so nothing paints between. */
const stackFill = ref(!showBossPreview.value)
watch(showBossPreview, (shown) => { stackFill.value = !shown }, { flush: 'post' })
/** A leaving preview (its boss just spawned) puffs away where it stood, out of
 *  the flow, while the boss bar takes the line. */
const pinForLeave = (el: Element): void => {
  const h = el as HTMLElement
  const left = h.offsetLeft
  const top = h.offsetTop
  Object.assign(h.style, { position: 'absolute', left: `${left}px`, top: `${top}px`, margin: '0' })
}
const isDaily = computed(() => barrage.mode.value === 'daily')
/** Next undiscovered ball tier — ghosts as a silhouette on the codex button. */
const nextUndiscovered = computed(() =>
  barrage.maxBallTier.value < FIGHTER_ART_MAX ? barrage.maxBallTier.value + 1 : 0)
// ─── Silent Flow: the HUD a first-timer earns (see the header) ───────────────
/** No boss killed yet (progress.ts `isFtueActive`: reactive through its refs). */
const silentFlow = computed(() => isFtueActive())
/** The row badge (and its record line) arrive with the first boss kill: until
 *  then "Boss in N" says everything a first-timer needs. */
const rowShown = computed(() => !silentFlow.value)
/** The tray arrives as the first "+1" flies into it (the FTUE's pickup beat
 *  is over: a ball has joined it). */
const trayShown = computed(() => !silentFlow.value || (tutorialStep.value !== 'aim' && tutorialStep.value !== 'pickup'))
/** The wallet arrives with the first coin — and stays, whatever is spent. */
const coinsSeen = ref(walletCoins.value > 0 || Object.values(upgradeLevels.value).some((l) => l > 0))
watch(walletCoins, (c) => { if (c > 0) coinsSeen.value = true })
const coinsShown = computed(() => !silentFlow.value || coinsSeen.value)
/** One control on frame 1 — the options gear (its sliders hold the sound
 *  too); the mute joins it at the first boss kill. */
const muteShown = computed(() => !silentFlow.value)
/** Nothing on the control deck yet: its plate stays away too. */
const deckBare = computed(() => !trayShown.value && CHIP_IDS.every((id) => chipStates.value[id] === 'hidden'))

/** A best of 0 / 1 on a fresh profile is noise, not a record to beat. */
const showBest = computed(() => rowShown.value && (isDaily.value ? daily.todayBest.value : barrage.bestRow.value) > 1)
/** The global rank plaque sits on the board's top rim on every device — once
 *  EARNED: it stays hidden until the first boss kill and then flies in
 *  (useFeatureUnlocks `rankState`). User decision 2026-09-27, reversing "it
 *  shows from the first second": testers did not understand it in minute 1. */
const rankOnBuild = leaderboardEnabled && !CLEAN_FEED
const showRank = computed(() => rankOnBuild && rankState.value !== 'hidden')
/** The strip reserved above the board for the plaque. The plaque is a little
 *  taller and overlaps the board's own top margin (the band a boss peeks in
 *  through) — never row 0, where new monsters enter. Reserved whenever the
 *  build has a plaque, earned or not, so the board never shrinks the moment
 *  the rank arrives. */
const rankReserve = computed(() => (!rankOnBuild ? 0
  : isUltraCompactHud.value ? 16 : isCompactHud.value ? 18 : isRoomyHud.value ? 26 : 20))
/** Earned features only (useFeatureUnlocks): the landscape utility plate is
 *  not drawn at all while it would be an empty frame. */
const anyUtility = computed(() =>
  (['codex', 'collection', 'dailyRun', 'supply', 'dailyRewards', 'battlePass', 'achievements'] as const).some(featureShown))
/** A calm moment for an unlock celebration: the board waits for a shot and
 *  nothing else is asking for the player's eyes. */
const unlockCalm = computed(() =>
  barrage.phase.value === 'aim' && !barrage.holdSim.value && !isAnyModalOpen.value && !activeReveal.value
  && !playerAiming.value && !lessonSpot.value)
/** …and for a spotlight lesson (useCoach): no unlock flying in, no coin rain,
 *  no FTUE mark, no death scene either. */
const spotCalm = computed(() =>
  unlockCalm.value && !unlocking.value && !coinRain.value && !tutorialActive.value && !deathScene.value)

// ─── Layout mode ─────────────────────────────────────────────────────────────
// The board is portrait-shaped (≈ 0.58 : 1), so ANY clearly-wider-than-tall
// viewport has idle room beside it: that is where the side columns go. A
// near-square window stays stacked — side columns would starve the chips.
const sideBySide = computed(() =>
  isMobileLandscape.value || windowWidth.value >= windowHeight.value * 1.15)

// ─── Top-bar height reserve (measured, see MIW's rationale) ──────────────────
// The bar is teleported, so the scene reserves its REAL height — compact
// shrinking and a wrapped translation both hand the difference to the board.
const topBarEl = ref<HTMLElement | null>(null)
const topBarH = ref(0)
let topBarRo: ResizeObserver | null = null

const topReserve = computed(() => CLEAN_FEED
  ? 'calc(0.4rem + env(safe-area-inset-top, 0px))'
  : topBarH.value > 0
    ? `calc(${topBarH.value}px + 0.25rem)`
    : 'calc(3.4rem + env(safe-area-inset-top, 0px))')
const topBarPadTop = computed(() =>
  `calc(${isCompactHud.value ? '0.15rem' : '0.4rem'} + env(safe-area-inset-top, 0px))`)

// ─── Bottom-edge reserve (Android nav bar honoured in one place) ─────────────
const bottomInset = computed(() => androidNavBarPx.value > 0
  ? `max(env(safe-area-inset-bottom, 0px), ${androidNavBarPx.value}px)`
  : 'env(safe-area-inset-bottom, 0px)')

const mainPad = computed(() => ({
  // Side by side, the board runs the full height under the (transparent-middle)
  // top bar; the side columns reserve the bar themselves.
  paddingTop: sideBySide.value ? 'calc(0.35rem + env(safe-area-inset-top, 0px))' : topReserve.value,
  paddingBottom: `calc(${sideBySide.value ? '0.35rem' : '0.4rem'} + ${bottomInset.value})`,
  paddingLeft: 'calc(0.4rem + env(safe-area-inset-left, 0px))',
  paddingRight: 'calc(0.4rem + env(safe-area-inset-right, 0px))'
}))

// ─── Portrait bottom-panel rows ──────────────────────────────────────────────
// Fixed row heights per HUD tier — the board is height-led, so every pixel
// kept out of this panel is board. 390×844: 64 + 62 + 48 (+ gaps) ≈ 23 %.
const panelTier = computed(() => isUltraCompactHud.value ? 'ultra'
  : isCompactHud.value ? 'compact'
    : isRoomyHud.value ? 'roomy' : 'normal')
const ROWS_PX = {
  ultra: { tray: 44, upg: 46, ctrl: 44 },
  compact: { tray: 52, upg: 54, ctrl: 46 },
  normal: { tray: 64, upg: 62, ctrl: 50 },
  roomy: { tray: 84, upg: 80, ctrl: 58 }
} as const
const rows = computed(() => ROWS_PX[panelTier.value])

// ─── Side-by-side column width ───────────────────────────────────────────────
// Whatever the height-led board leaves, split between the two columns, within
// [190, 400] px: never so narrow the chips can't show a price, never so wide the
// board stops being the stage on a big desktop.
const sideW = computed(() => {
  const w = windowWidth.value - 16
  const h = windowHeight.value - 12
  const boardW = h * BOARD_ASPECT
  const free = (w - boardW - 16) / 2
  return Math.round(Math.max(190, Math.min(400, free)))
})
/** A side column is at most 400 px: five chips across would be ~75 px each,
 *  which clips "×1.25 → ×1.56" at desktop type sizes. Three (+ two) always. */
const sideChipCols = computed(() => (sideW.value >= 460 ? 5 : 3))
const sideUpgH = computed(() => {
  const one = isRoomyHud.value ? 78 : isCompactHud.value ? 52 : 60
  return sideChipCols.value === 5 ? one : one * 2 + 6
})
const sideTrayH = computed(() => Math.round(Math.max(64, Math.min(isRoomyHud.value ? 150 : 110, windowHeight.value * 0.24))))
/** Grid cell per utility button: the 44 px hit box, or the roomy 46 px face + air. */
const utilCell = computed(() => (isRoomyHud.value ? 54 : 46))
const sideUtilCols = computed(() => Math.max(2, Math.min(4, Math.floor((sideW.value - 8) / (utilCell.value + 4)))))

// ─── Board overlay box (banners, boss bar) = the letterboxed board rect ──────
const boardBox = ref<{ left: number; top: number; width: number; height: number } | null>(null)
let areaRo: ResizeObserver | null = null
const measureBoard = (): void => {
  const area = boardAreaEl.value
  const r = boardRef.value?.boardClientRect?.() ?? null
  if (!area || !r || r.width <= 0) { boardBox.value = null; return }
  const a = area.getBoundingClientRect()
  boardBox.value = { left: r.left - a.left, top: r.top - a.top, width: r.width, height: r.height }
}
const BOX_FALLBACK: Record<string, string> = { left: '0', top: '0', right: '0', bottom: '0' }
const boardBoxStyle = computed<Record<string, string>>(() => {
  const b = boardBox.value
  if (!b) return BOX_FALLBACK
  const style: Record<string, string> = { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` }
  return style
})

// ─── Board seam → the shared UI refs (tutorial hand, overlays) ───────────────
const installBoardApi = (): void => {
  boardApi.value = {
    launcherClientPoint: () => boardRef.value?.launcherClientPoint?.() ?? null,
    cellToClient: (x, y) => boardRef.value?.cellToClient?.(x, y) ?? null,
    boardClientRect: () => boardRef.value?.boardClientRect?.() ?? null,
    // Run 3: a drag up from the tray's orbs is the slingshot motion.
    beginAimFrom: (e) => boardRef.value?.beginAimFrom?.(e) ?? false,
    deathFocusClient: () => boardRef.value?.deathFocusClient?.() ?? null
  }
}
const onAimStart = (): void => { playerAiming.value = true }
const onAimEnd = (): void => { playerAiming.value = false }
/** The board's only non-firing release is a let-go on the unit (`'tap'`);
 *  typed loosely so the handler outlives any change to the board's union. */
const onMisfire = (kind: string): void => {
  onAimEnd()
  if (kind === 'tap') noteMisfire()
}
/** A tap on the flying chest opens it and is not an aim: whatever the board
 *  reported on press, no finger is aiming any more (the coach may show). Its
 *  coins rain into the wallet: the upgrade funnel waits that out. */
const onChestTapped = (): void => {
  onAimEnd()
  noteCoinRain()
}

// ─── Scene backdrop (drop-in art; the gradient is the fallback) ──────────────
// The sky around the keep, painted per orientation (art-sheets/backdrops): the
// landscape one keeps its islands in the upper outer corners and the middle
// calm for the columns; the portrait one is sky over the top bar, cloud sea
// under the control deck. The board canvas leaves its letterbox clear, so the
// painting runs right up to the board's walls.
const plateSrc = computed(() => backdropSrc('panel-plate'))
const sceneBgStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  const art = backdropSrc(sideBySide.value ? 'scene-landscape' : 'scene-portrait') ?? artSrc('scene-bg')
  if (art) {
    style.backgroundImage = `url(${art})`
    style.backgroundSize = 'cover'
    style.backgroundPosition = 'center'
  }
  // Absolute: a relative url() in a custom property resolves against the
  // stylesheet that reads it (assets/), not the document — see `cssVarUrl`.
  if (plateSrc.value) style['--plate-img'] = cssVarUrl(plateSrc.value)
  return style
})

// ─── Type scale for the row badge ────────────────────────────────────────────
const rowTextClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'text-sm leading-none' : 'text-[12px] leading-none')
  : isRoomyHud.value ? 'text-xl' : 'text-sm sm:text-base')
const subTextClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'text-[11px] leading-tight' : 'text-[9px] leading-tight')
  : isRoomyHud.value ? 'text-sm' : 'text-[10px] sm:text-xs')
/** Height of the top bar's second line — fixed, so the boss bar replacing the
 *  "Boss in N" text never changes the bar (and with it the board) height. */
const line2H = computed(() => isCompactHud.value ? (isWideCompactHud.value ? 20 : 18) : isRoomyHud.value ? 26 : 22)
const rowIconClass = computed(() => isCompactHud.value ? 'w-3.5 h-3.5' : isRoomyHud.value ? 'w-6 h-6' : 'w-4 h-4 sm:w-5 sm:h-5')

// ─── When a kill's coin reaches the wallet (its "+N" pop waits for it) ───────
// The flight itself takes ~0.65 s (usePrismParticles: 620–820 ms); on the
// first-session board the renderer also holds each kill 0.4 s before the coin
// leaves (BoardRenderer KILL_HOLD), so the badge would pop early without it.
const COIN_FLIGHT_MS = 650
const FTUE_KILL_HOLD_MS = 400
const coinLandMs = computed(() =>
  COIN_FLIGHT_MS + (barrage.mode.value === 'endless' && isFtueActive() ? FTUE_KILL_HOLD_MS : 0))

// ─── Coins from menus fly to the wallet ──────────────────────────────────────
const onMenuCoins = (sourceEl: HTMLElement): void => {
  if (coinBadgeEl.value) spawnCoinExplosion({ sourceEl, targetEl: coinBadgeEl.value, count: 14 })
  noteCoinRain()
}

// ─── The rank plaque names itself on a tap (run 4: "#15,667 of 15,876" was a
// mystery) — the same name plate as the chest and the tray's status icons. ──
const onRankTap = (el: HTMLElement, info: { rank: string; of: string | null; aria: string }): void => {
  showHudTip(el, () => rankTip(t('barrage.hud.rank'), info))
  playSound('anchor-swap', 0.03, 1.15)
}

const openModal = (which: 'codex' | 'collection' | 'daily'): void => {
  if (which === 'codex') showCodex.value = true
  else if (which === 'collection') showCollection.value = true
  else showDaily.value = true
}

// ─── Achievement unlock toast (held while a tier reveal owns the moment) ─────
// Playtest run 11: rewards pay out as they are earned. Dev and Leo found
// 400–800 coins waiting unclaimed in the trophy panel, and that windfall is
// what beat the third boss; the two who lost never opened it. A toast claims
// its achievement as it shows (its "+N", the coins flying to the wallet); the
// ones completed before the trophy was earned pay out as it arrives. The
// panel stays as the record.
const achievements = useAchievements()
const achToast = ref<string | null>(null)
const achReward = ref<string | null>(null)
/** Fly a payout from `selector` (the toast, the trophy) into the wallet. */
const flyPayout = (selector: string): void => {
  void nextTick(() => {
    const el = document.querySelector<HTMLElement>(selector)
    if (el) onMenuCoins(el)
  })
}
/** Everything complete and unclaimed, paid out of the trophy button at once. */
const sweepAchievements = (): void => {
  if (!featureReady('achievements')) return
  let total = 0
  for (const a of achievements.list.value) if (a.claimable) total += achievements.claim(a.id)
  if (total > 0) flyPayout('.achievements-btn')
}
let achToastTimer = 0
const achName = (id: string): string => {
  // STATE's catalogue — a plain string per id today; `.name` tolerated if it grows one.
  for (const key of [`barrageMeta.achievements.items.${id}`, `barrageMeta.achievements.items.${id}.name`]) {
    if (te(key)) return t(key)
  }
  return ''
}
/** What earned it (run 9): the goal line, "Hits in one volley: 50". */
const achGoal = (id: string): string => {
  const a = ACHIEVEMENTS.find((x) => x.id === id)
  return a ? t(`barrageMeta.achievements.desc.${a.metric}`, { n: fmtCoins(a.target) }) : ''
}
const showAchToast = (id: string): void => {
  achToast.value = id
  const paid = achievements.claim(id)
  achReward.value = paid > 0 ? t('barrage.hud.coinGain', { n: fmtCoins(paid) }) : null
  if (paid > 0) flyPayout('.ach-toast')
  playSound('reward-continue', 0.04)
  window.clearTimeout(achToastTimer)
  achToastTimer = window.setTimeout(() => { achToast.value = null }, 3200)
}
let heldAchToast: string | null = null
watch(achievementToast, (v) => {
  // Locked achievements stay silent: they are there, claimable, the moment
  // the feature is earned — a toast before that is a menu nobody asked for.
  if (!v || !featureReady('achievements')) return
  if (activeReveal.value) { heldAchToast = v.id; return }
  showAchToast(v.id)
})
watch(activeReveal, (reveal) => {
  if (reveal || heldAchToast === null) return
  const id = heldAchToast
  heldAchToast = null
  showAchToast(id)
})
// The trophy lands (its fly-in done) — or a save that already has it loads.
watch(() => featureReady('achievements'), (ready) => { if (ready) sweepAchievements() })

// ─── Lifecycle ───────────────────────────────────────────────────────────────
let uninstallTutorial: (() => void) | null = null
let uninstallCoach: (() => void) | null = null
let uninstallUnlocks: (() => void) | null = null
let boardPoll = 0

onMounted(() => {
  startBattleMusic()

  installBoardApi()
  // Leaderboard reporting edges (best-row posts, the one read per session).
  // Idempotent and a no-op on builds without a board; mounted here because the
  // scene mounts after the save hydrate, so `bestRow` is already the player's.
  installWaveLeaderboard()
  // Depth features, the upgrade chips and the rank plaque are earned one at a
  // time (useFeatureUnlocks.ts).
  uninstallUnlocks = installFeatureUnlocks({
    bestRow: barrage.bestRow,
    mode: barrage.mode,
    onEngineEvent: barrage.onEngineEvent,
    ftueDone: computed(() => !tutorialActive.value),
    calm: unlockCalm,
    chips: upgrades.list,
    freeChip: upgrades.freeId,
    silent: silentFlow,
    rankEnabled: rankOnBuild
  })
  // Silent Flow: before the first boss kill only the first discovery gets the
  // NEW BALL reveal (wordless); later ones are the tray's own flourish.
  setRevealGate((tier) => !silentFlow.value || silentRevealAllowed(tier))
  // A save whose trophy is already earned: anything left unclaimed pays out now.
  sweepAchievements()
  // The wordless coach picks up where the FTUE hands over (useCoach.ts).
  uninstallCoach = installCoach({
    engine: barrage.engine,
    engineGen: barrage.engineGen,
    mode: barrage.mode,
    onEngineEvent: barrage.onEngineEvent,
    volleys: computed(() => barrageStats.value.volleys),
    bestCombo: computed(() => barrageStats.value.bestCombo),
    ftueDone: computed(() => !tutorialActive.value),
    ftuePressBeat: computed(() => tutorialActive.value && tutorialStep.value === 'upgrade'),
    capacityLevel: computed(() => upgradeLevels.value.capacity),
    glowingUpgrade: computed(() => (upgrades.freeCapacityOffer.value ? null : (upgrades.freeId.value ?? upgrades.glowingId.value))),
    upgradeTotal: computed(() => Object.values(upgradeLevels.value).reduce((a, b) => a + b, 0)),
    // The upgrade funnel reads Ball Damage off the chips, after the free claim.
    upgrades: upgrades.list,
    freeOffer: upgrades.freeCapacityOffer,
    // Run 13: no lesson frames another chip while a gift waits.
    giftId: upgrades.freeId,
    // Run 8: Damage arrows ignored three times → the first Damage level is free.
    offerFreeDamage: () => upgrades.offerFreeDamage(),
    // Run 4: the rich-wallet funnel, and nothing lands on top of it.
    coins: walletCoins,
    funnelCalm: computed(() => !isAnyModalOpen.value && !unlocking.value && !coinRain.value),
    // Past row 25 the player has learnt that coins buy power: no funnel.
    bestRow: barrage.bestRow,
    // After run 11: the threat cue on the board and the speed / luck / bounty chips.
    spotCalm,
    // Silent Flow: before the first boss kill only the shot demo speaks (and
    // the threat cue is drawn on the board).
    silent: silentFlow
  })
  uninstallTutorial = installBarrageTutorial({
    bestRow: barrage.bestRow,
    onEngineEvent: barrage.onEngineEvent,
    upgradeTarget: computed(() => upgrades.freeId.value !== null || upgrades.glowingId.value !== null),
    freeOffer: upgrades.freeCapacityOffer,
    claimFree: () => upgrades.claimFreeCapacity()
  })

  // The board letterboxes itself inside its area; the overlay follows it.
  void nextTick(measureBoard)
  if (typeof ResizeObserver !== 'undefined' && boardAreaEl.value) {
    areaRo = new ResizeObserver(() => measureBoard())
    areaRo.observe(boardAreaEl.value)
  }
  // Until the board has laid out (its canvas sizes on its own rAF) poll briefly.
  boardPoll = window.setInterval(() => {
    measureBoard()
    if (boardBox.value) window.clearInterval(boardPoll)
  }, 150)

  const el = topBarEl.value
  if (!el) return
  const measure = (): void => { topBarH.value = el.offsetHeight }
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    topBarRo = new ResizeObserver(measure)
    topBarRo.observe(el)
  }
})
watch([sideBySide, windowWidth, windowHeight], () => { void nextTick(measureBoard) })

onUnmounted(() => {
  stopBattleMusic()
  uninstallTutorial?.()
  uninstallCoach?.()
  uninstallUnlocks?.()
  setRevealGate(null)
  topBarRo?.disconnect()
  areaRo?.disconnect()
  topBarRo = null
  areaRo = null
  boardApi.value = null
  playerAiming.value = false
  window.clearInterval(boardPoll)
  window.clearTimeout(achToastTimer)
})
</script>

<template lang="pug">
  //- `hud-digits`: every DOM digit of the HUD in the numeral face (run 5:
  //- 'Angry''s "2" read as "Z"); the canvas keeps its own font.
  //- `data-poki-stage-bg`: Poki playtest recordings paint this backdrop into
  //- their stage (utils/pokiPlaytestStage.ts).
  div.barrage-scene.hud-digits.relative.w-screen.overflow-hidden(class="h-screen h-dvh" :style="[shakeStyle, sceneBgStyle]" data-poki-stage-bg="true")
    //- ── Top bar ──────────────────────────────────────────────────────────────
    //- Teleported to <body> at z-[55]: modals teleport to body at z-50 and the
    //- scene root's transform (screenshake) traps any in-scene z-index, so this is
    //- the only way the wallet stays visible — and a coin-flight target — above
    //- an open modal. The bar itself is click-through; only its clusters catch
    //- taps (side by side, its empty middle lies over the board).
    Teleport(to="body" v-if="!CLEAN_FEED")
      div.barrage-topbar.hud-digits.fixed.top-0.left-0.right-0.flex.items-start.justify-between.pointer-events-none(
        ref="topBarEl"
        class="px-2 z-[55]"
        :class="isCompactHud ? 'pb-0.5' : 'pb-1'"
        :style="{\
          paddingTop: topBarPadTop,\
          paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
          paddingRight: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        //- Left block. Row 1: row badge + the rank tag (inline, centred in whatever
        //- the wallet cluster leaves). Row 2: a FIXED-height line that shows
        //- "Boss in N · Best N" — or, while a boss lives, its HP bar. The boss bar
        //- used to hang over the board's top rows, exactly where a boss enters
        //- (rows −2..0) and hid it; here it costs the board nothing, and the fixed
        //- height means the board never resizes when a boss shows up.
        //- Side by side, the block stops at the left column's edge so neither the
        //- rank nor the boss bar ever lies over the board.
        //- Beside the two rows, until the boss comes: its silhouette in smoke
        //- (BossPreview) — the reason to play the next rows.
        div.topbar-left.relative.flex.items-center.pointer-events-auto.min-w-0(
          :class="sideBySide ? '' : 'flex-1'"
          :style="sideBySide ? { width: sideW + 'px' } : {}"
        )
          //- Row badge over line 2. Content-wide while the boss preview stands
          //- beside it; the whole block once a boss lives (its bar needs the room).
          div.topbar-stack.flex.flex-col.items-stretch.min-w-0(
            :class="[isCompactHud ? 'gap-0.5' : 'gap-1', stackFill ? 'flex-1' : 'shrink']"
          )
            div.flex.items-center.min-w-0(:class="isCompactHud ? 'gap-1' : 'gap-1.5'")
              //- Silent Flow: the row badge arrives with the first boss kill (its box stays).
              div.relative.shrink-0.hud-earned(:class="{ 'is-hidden': !rowShown }")
                div.absolute.inset-0.rounded-xl(
                  :class="[isDaily ? 'bg-[#0d4d52]' : 'bg-[#7a1c1c]', isCompactHud ? 'translate-y-0.5' : 'translate-y-1']"
                )
                div.relative.flex.items-center.rounded-xl(
                  data-poki-hud="row"
                  :class="[                  isDaily ? 'bg-gradient-to-b from-[#3fe0d0] to-[#1a9a9a] border-[#0f1a30]' : 'bg-gradient-to-b from-[#ff7a4d] to-[#d43a1f] border-[#0f1a30]',                  isCompactHud ? 'gap-1 border px-1.5 py-0.5' : 'gap-1.5 border-2 px-2.5 py-1'                ]"
                )
                  BarrageGlyph.text-white.shrink-0(name="flag" :class="rowIconClass")
                  span.text-white.font-black.game-text.uppercase.whitespace-nowrap(:class="rowTextClass") {{ t('barrage.hud.row', { n: barrage.row.value }) }}
                  span.daily-tag.rounded.font-black.game-text.uppercase.leading-none(
                    v-if="isDaily"
                    :class="isCompactHud ? 'text-[8px] px-0.5' : 'text-[10px] px-1 py-0.5'"
                  ) {{ t('barrage.hud.daily') }}
            div.topbar-line2.flex.items-center.min-w-0(
              v-if="!isUltraCompactHud"
              :class="isCompactHud ? 'gap-x-1.5 px-0.5' : 'gap-x-2 px-1'"
              :style="{ height: line2H + 'px' }"
            )
              //- Mounts with the full-width stack (`stackFill`), one render after
              //- the boss preview left — see `pinForLeave`.
              BossBar.flex-1.min-w-0(v-if="barrage.boss.value && stackFill" :inline="true")
              template(v-else)
                span.game-text.font-black.text-red-300.drop-shadow.whitespace-nowrap(
                  :class="subTextClass"
                  data-poki-hud="boss-in"
                ) {{ t('barrage.hud.bossIn', { n: bossIn }) }}
                span.game-text.font-black.text-yellow-200.drop-shadow.whitespace-nowrap(
                  v-if="showBest"
                  :class="subTextClass"
                ) {{ isDaily ? t('barrage.hud.todayBest', { n: daily.todayBest.value }) : t('barrage.hud.best', { n: barrage.bestRow.value }) }}
          //- The next boss in smoke, right beside the line its HP bar will fill.
          Transition(name="boss-preview" @before-leave="pinForLeave")
            BossPreview(
              v-if="showBossPreview"
              :next-row="barrage.nextBossRow.value"
              :rows-left="bossIn"
              :size="bossPreviewPx"
              :class="isCompactHud ? 'ms-1.5' : 'ms-2'"
            )
        div.flex-1(v-if="sideBySide")
        //- Wallet · mute · options. Silent Flow: the wallet arrives with the
        //- first coin, the mute with the first boss kill (both keep their box —
        //- the wallet is the coins' flight target even while hidden).
        div.flex.items-center.shrink-0.pointer-events-auto(:class="isCompactHud ? 'gap-1' : 'gap-1.5'")
          div.hud-earned(:class="{ 'is-hidden': !coinsShown }")
            CoinBadge(ref="coinBadgeRef" :land-ms="coinLandMs")
          //- CrazyGames owns the sound toggle on their build (their toolbar mute
          //- must win; a second in-game switch reads as two competing mutes).
          div.hud-wrap.hud-earned(v-if="!isCrazyWeb" :class="{ 'is-hidden': !muteShown }")
            FMuteButton
          HudButton(tone="blue" :aria-label="t('options.title')" @click="showOptions = true")
            BarrageGlyph.w-full.h-full(name="gear")

    //- ── Main content ─────────────────────────────────────────────────────────
    div.absolute.inset-0.flex.min-h-0(:class="sideBySide ? 'flex-row items-stretch gap-2' : 'flex-col'" :style="mainPad")
      //- ── LEFT column (side by side): rank + utilities ──
      div.side-col.flex.flex-col.shrink-0.min-h-0(
        v-if="sideBySide && !CLEAN_FEED"
        :style="{ width: sideW + 'px', paddingTop: topReserve }"
        :class="isRoomyHud ? 'justify-center' : 'justify-end'"
      )
        Transition(name="chip")
          div.flex.justify-center.mb-3(v-if="achToast")
            AchievementToast(:name="achName(achToast)" :goal="achGoal(achToast)" :reward="achReward ?? undefined")
        //- Only earned features (useFeatureUnlocks); no empty plate before the first.
        div.util-grid.grid.justify-center.gap-1(v-if="anyUtility" :class="{ 'panel-plate': plateSrc }" :style="{ gridTemplateColumns: 'repeat(' + sideUtilCols + ', ' + utilCell + 'px)' }")
          FeatureSlot(id="codex")
            HudButton(tone="orange" :aria-label="t('barrage.codex.title')" :class="{ 'codex-nudge': activeReveal }" data-tut="codex" @click="openModal('codex')")
              BarrageGlyph.w-full.h-full(name="codex")
              template(#corner)
                img.codex-ghost.absolute(v-if="nextUndiscovered" :src="fighterSrc(nextUndiscovered)" alt="" draggable="false")
          FeatureSlot(id="collection")
            HudButton(tone="purple" :aria-label="t('barrageMeta.collections.title')" :dot="collections.hasNew.value" @click="openModal('collection')")
              BarrageGlyph.w-full.h-full(name="collection")
          FeatureSlot(id="dailyRun")
            HudButton(tone="teal" :aria-label="t('barrageMeta.daily.title')" :pulse="daily.attemptsToday.value === 0" @click="openModal('daily')")
              BarrageGlyph.w-full.h-full(name="daily")
          FeatureSlot(id="supply")
            SupplyDropButton(:coin-target="coinBadgeEl")
          FeatureSlot.hud-wrap(id="dailyRewards")
            DailyRewards(@coins-awarded="onMenuCoins")
          FeatureSlot.hud-wrap(id="battlePass")
            BattlePass(@coins-awarded="onMenuCoins")
          FeatureSlot.hud-wrap(id="achievements")
            AchievementsButton(@coins-awarded="onMenuCoins")

      //- ── THE BOARD ──
      div.board-area.relative.flex-1.min-h-0.min-w-0(ref="boardAreaEl" data-tut="board" :style="{ paddingTop: rankReserve + 'px' }")
        BarrageBoard(
          ref="boardRef"
          :coin-target="coinBadgeEl"
          @aim-start="onAimStart"
          @aim-cancel="onAimEnd"
          @fired="onAimEnd"
          @misfire="onMisfire"
          @chest-tapped="onChestTapped"
        )
        //- Words over the board (the canvas draws numbers only), boxed to the
        //- letterboxed board rect so they centre on the board, not the area.
        div.board-overlay.absolute.pointer-events-none(v-if="!CLEAN_FEED" :style="boardBoxStyle")
          //- The global rank: a runic plaque on the board's top rim, every layout —
          //- earned by the first boss kill, then flown in (FeatureUnlockFx).
          div.rank-rim.absolute.left-0.right-0.flex.justify-center(v-if="showRank" :style="{ top: -rankReserve + 'px' }")
            //- Run 8: named on the plaque itself (a tap still names it too).
            div.rank-rim__slot(data-feature="rank" :class="{ 'is-arriving': rankState === 'arriving' }")
              RankBadge(:score="rankedBest" :label="t('barrage.hud.rank')" tappable @tap="onRankTap")
          BarrageBanners
          //- A first-time player's "Tap to Shoot", pulsing until the first shot.
          ShootPrompt
          Transition(name="chip")
            //- Low on the board: the top rows are where new rows (and bosses) enter.
            //- Side by side it lives in the left column instead (a short landscape
            //- board has no room below the centre banner).
            div.absolute.left-0.right-0.flex.justify-center(v-if="achToast && !sideBySide" class="z-[26]" :style="{ bottom: '24%' }")
              AchievementToast(:name="achName(achToast)" :goal="achGoal(achToast)" :reward="achReward ?? undefined")

      //- ── PORTRAIT bottom panel ──
      div.bottom-panel.shrink-0.w-full.mx-auto.flex.flex-col(
        v-if="!sideBySide && !CLEAN_FEED"
        :class="[panelTier === 'roomy' ? 'max-w-[640px]' : 'max-w-[520px]', panelTier === 'normal' || panelTier === 'roomy' ? 'gap-1.5 pt-1.5' : 'gap-1 pt-1', { 'panel-plate panel-plate--deck': plateSrc, 'panel-plate--bare': deckBare }]"
      )
        //- [codex] tray [supply] — a 3 px gutter each side: the deck clips its
        //- overflow, and an edge button's "new" ring must not be cut there.
        div.flex.items-center.gap-1(class="px-[3px]" :style="{ height: rows.tray + 'px' }")
          FeatureSlot(id="codex")
            HudButton(tone="orange" :aria-label="t('barrage.codex.title')" :class="{ 'codex-nudge': activeReveal }" data-tut="codex" @click="openModal('codex')")
              BarrageGlyph.w-full.h-full(name="codex")
              template(#corner)
                img.codex-ghost.absolute(v-if="nextUndiscovered" :src="fighterSrc(nextUndiscovered)" alt="" draggable="false")
          //- Silent Flow: laid out but hidden until the first "+1" flies into it.
          BallTray.flex-1.h-full.hud-earned(:class="{ 'is-hidden': !trayShown }")
          FeatureSlot(id="supply")
            SupplyDropButton(:coin-target="coinBadgeEl")
        div(:style="{ height: rows.upg + 'px' }")
          UpgradeBar
        //- [daily rewards][daily run][collection]  TURN  [pass][trophies]
        div.flex.items-center.justify-between.gap-1(class="px-[3px]" :style="{ height: rows.ctrl + 'px' }")
          div.flex.items-center.gap-0_5.shrink-0
            FeatureSlot.hud-wrap(id="dailyRewards")
              DailyRewards(@coins-awarded="onMenuCoins")
            FeatureSlot(id="dailyRun")
              HudButton(tone="teal" :aria-label="t('barrageMeta.daily.title')" :pulse="daily.attemptsToday.value === 0" @click="openModal('daily')")
                BarrageGlyph.w-full.h-full(name="daily")
            FeatureSlot(id="collection")
              HudButton(tone="purple" :aria-label="t('barrageMeta.collections.title')" :dot="collections.hasNew.value" @click="openModal('collection')")
                BarrageGlyph.w-full.h-full(name="collection")
          TurnControls.flex-1.min-w-0
          div.flex.items-center.gap-0_5.shrink-0
            FeatureSlot.hud-wrap(id="battlePass")
              BattlePass(@coins-awarded="onMenuCoins")
            FeatureSlot.hud-wrap(id="achievements")
              AchievementsButton(@coins-awarded="onMenuCoins")

      //- ── RIGHT column (side by side): tray + upgrades + turn ──
      div.side-col.flex.flex-col.shrink-0.min-h-0.gap-2(
        v-if="sideBySide && !CLEAN_FEED"
        :style="{ width: sideW + 'px', paddingTop: topReserve }"
        :class="isRoomyHud ? 'justify-center' : 'justify-end'"
      )
        div.flex.flex-col.gap-2(:class="{ 'panel-plate': plateSrc, 'panel-plate--bare': deckBare }")
          BallTray.w-full.hud-earned(:class="{ 'is-hidden': !trayShown }" :style="{ height: sideTrayH + 'px' }")
          div.w-full(:style="{ height: sideUpgH + 'px' }")
            UpgradeBar(:cols="sideChipCols")
          div.flex.items-center.justify-center(:style="{ height: rows.ctrl + 'px' }")
            TurnControls

    //- ── Overlays + modals ─────────────────────────────────────────────────────
    ParticleCanvas
    //- No coach hand in the DEV clean feed: that capture is "pure gameplay".
    TutorialOverlay(v-if="!CLEAN_FEED")
    CoachOverlay(v-if="!CLEAN_FEED")
    //- A name plate beside a tapped HUD element (chest, tray status icons, rank plaque).
    HudTip(v-if="!CLEAN_FEED")
    //- An earned feature flies in (useFeatureUnlocks).
    FeatureUnlockFx(v-if="!CLEAN_FEED")
    //- New-tier discovery moment (teleports itself; follows `[data-slot=i] .unit-holder`).
    //- The merges themselves play the tray's own flourish, the first "+1" its
    //- own flight and the threat lesson flashes on the board: nothing stops
    //- the game for them any more (Silent Flow).
    TierRevealFx
    //- The speed / luck / bounty chips' spotlight — over the running game (the coach decides when).
    LessonSpotlight(v-if="!CLEAN_FEED")

    //- The death sequence's "WASTED" — then the death screen.
    DeathOverlay(:open="deathScene")
    BreachModal
    BossChestModal(:coin-target="coinBadgeEl")
    UnitCodexModal(v-model="showCodex")
    CollectionModal(v-model="showCollection")
    DailyBarrageModal(v-model="showDaily")
    OptionsModal(:is-open="showOptions" @close="showOptions = false")
</template>

<style scoped lang="sass">
.barrage-scene
  background: radial-gradient(ellipse at 50% 38%, #1c2742 0%, #0c1120 55%, #070a14 100%)
  background-color: #070a14

// ── The side-panel plate (art-sheets/backdrops, 9-slice) ──
// A bronze-framed slate slab behind each control group. The frame is a
// pseudo-element, so it never takes a pixel from the board's layout math; the
// padding keeps the controls on the slab, clear of the rim. The 21 % slice
// keeps each corner bracket (with its elemental gem) whole.
.panel-plate
  --plate-b: 26px
  position: relative
  isolation: isolate
  padding: calc(var(--plate-b) * 0.55)
  &::before
    content: ''
    position: absolute
    inset: 0
    z-index: -1
    pointer-events: none
    border: var(--plate-b) solid transparent
    border-image: var(--plate-img) 21% fill / var(--plate-b) stretch
    transition: opacity 0.4s ease
// Silent Flow: an empty deck (no tray, no chip yet) shows no plate either.
.panel-plate--bare::before
  opacity: 0
// The utility grid hugs its buttons instead of spanning the whole column.
.util-grid.panel-plate
  align-self: center
// The portrait control deck: thinner rim, and no side padding — the five chips
// already fill 390 px to the last German letter. The rim hangs out into the
// side gutters instead, so it reads as a deck rather than a card.
.panel-plate--deck
  --plate-b: 18px
  padding: calc(var(--plate-b) * 0.4) 0 calc(var(--plate-b) * 0.3)
  &::before
    inset: 0 -6px -3px
  // No accidental horizontal scroll — ever (portal iframes show a scrollbar).
  overflow: hidden
  touch-action: none

.gap-0_5
  gap: 2px

.daily-tag
  background: #062a2e
  color: #bff7f0
  border: 1px solid #7ff0e4

// The organisms mounted here (BattlePass, Achievements, DailyRewards, the mute)
// draw a ~36 px face; their hit box is grown to the 44 px thumb minimum and the
// DailyRewards phone shrink (scale-80) is undone — it would take the box under
// 44 again.
.hud-wrap
  display: flex
  align-items: center
  justify-content: center
  min-width: 44px
  min-height: 44px
  :deep(> button), :deep(> div > button)
    min-width: 44px
    min-height: 44px
    display: flex
    align-items: center
    justify-content: center
  :deep(.daily-rewards-btn:not(:active))
    --tw-scale-x: 100%
    --tw-scale-y: 100%
  :deep(.daily-rewards-btn .p-2)
    padding: 0.375rem
  :deep(.daily-rewards-btn svg)
    width: 1.5rem
    height: 1.5rem

// The rank plaque on the board's top rim — above the banners, below modals.
.rank-rim
  z-index: 26
// Its fly-in (FeatureUnlockFx) owns the moment: the real plaque waits unseen.
.rank-rim__slot.is-arriving
  visibility: hidden

// Silent Flow: a HUD piece not earned yet keeps its box (nothing resizes when
// it arrives) and simply is not there; it pops in when it is.
.hud-earned
  transition: opacity 0.35s ease, scale 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)
.hud-earned.is-hidden
  visibility: hidden
  opacity: 0
  scale: 0.6
  transition: none
@media (prefers-reduced-motion: reduce)
  .hud-earned
    transition: opacity 0.35s ease

// ── Codex button: the next undiscovered tier as a dark silhouette ──
.codex-ghost
  top: -7px
  right: -7px
  width: 22px
  height: 22px
  object-fit: contain
  filter: brightness(0) opacity(0.85) drop-shadow(0 0 1px rgba(255, 255, 255, 0.7))
  animation: codex-ghost-bob 1.4s ease-in-out infinite alternate
  pointer-events: none
@keyframes codex-ghost-bob
  from
    transform: translateY(0)
  to
    transform: translateY(-2px)
// A tier reveal is running: the codex is where discoveries live, and its ghost
// is the next tier to chase.
.codex-nudge
  animation: codex-nudge 0.9s ease-in-out infinite alternate
@keyframes codex-nudge
  from
    scale: 1
    filter: drop-shadow(0 0 0 rgba(255, 210, 60, 0))
  to
    scale: 1.1
    filter: drop-shadow(0 0 8px rgba(255, 210, 60, 0.95))
@media (prefers-reduced-motion: reduce)
  .codex-nudge, .codex-ghost
    animation: none

.chip-enter-active, .chip-leave-active
  transition: opacity 0.25s ease, transform 0.25s ease
.chip-enter-from, .chip-leave-to
  opacity: 0
  transform: translateY(-10px)
</style>
