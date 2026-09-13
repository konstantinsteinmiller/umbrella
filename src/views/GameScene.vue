<script setup lang="ts">
/**
 * Merge Legion — the single game scene. Boots straight into the fight (no
 * main menu). Composes the implementation-plan.md §1 loop:
 *
 *   ┌ Top bar — Wave badge + Gold counter
 *   ├ Battle arena — fighters vs endless waves (BattleArena owns the juice)
 *   ├ Upgrade controls — War Horns / Vitality / Bounty / Imp
 *   └ Interaction grid — drag-to-merge units + the Spawn button
 *
 * Fully responsive (portrait / landscape / tablet / desktop) on vw/vh + flex
 * with safe-area insets. This file orchestrates: deploy drops from the grid
 * into the arena (new fighter / field merge / army-full bounce), the rewarded
 * "war chest" and 4×-boss-bounty placements, screenshake, ambient music, and
 * the Options modal.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import usePrismGame from '@/use/usePrismGame'
import useBattle from '@/use/useBattle'
import useSounds, { useMusic } from '@/use/useSound'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import useEpicConfig from '@/use/useEpicConfig'
import useScreenshake from '@/use/useScreenshake'
import { zoneRect } from '@/use/useDropZones'
import useReward, { formatCost } from '@/use/useReward'
import { formatBig } from '@/utils/bigNumber'
import { isMobileLandscape, isCompactHud, isUltraCompactHud, isRoomyHud, isWideCompactHud, windowWidth, windowHeight, isCrazyWeb, androidNavBarPx } from '@/use/useUser'
import { artSrc } from '@/use/useArtOverrides'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'

import MergeGrid from '@/components/organisms/MergeGrid.vue'
import BattleArena from '@/components/organisms/BattleArena.vue'
import UpgradePanel from '@/components/organisms/UpgradePanel.vue'
import ParticleCanvas from '@/components/organisms/ParticleCanvas.vue'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import CoinBuffTimer from '@/components/atoms/CoinBuffTimer.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import InstantSpawnAdButton from '@/components/atoms/InstantSpawnAdButton.vue'
import DamageBuffAdButton from '@/components/atoms/DamageBuffAdButton.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'
import TutorialOverlay from '@/components/organisms/TutorialOverlay.vue'
import UnitCodexModal from '@/components/organisms/UnitCodexModal.vue'
import BattlePass from '@/components/organisms/BattlePass.vue'
import AchievementsButton from '@/components/organisms/AchievementsButton.vue'
import WelcomeBackModal from '@/components/organisms/WelcomeBackModal.vue'
import TierRevealFx from '@/components/organisms/TierRevealFx.vue'
import { activeReveal, endReveal, retargetReveal, revealTargets } from '@/use/useTierReveal'
import { tutorialPreview } from '@/use/useTutorial'
import { achievementToast } from '@/use/useAchievements'
import { offlineGold } from '@/use/useOfflineEarnings'
import IconMovie from '@/components/icons/IconMovie.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import { CHEST_EVERY_WAVES } from '@/use/useBattle'
import { nextArchetypeUnlock, CODEX_MAX_TIER } from '@/game/units'
import { CLEAN_FEED } from '@/game/cleanFeed'

const { t } = useI18n()
const game = usePrismGame()
const battle = useBattle()
const { addCoins } = useEpicConfig()
// Boss-bounty multiplier: rewarded ad, or a coin purchase on coin-mode builds.
const { buffsCostCoins, REWARD_COIN_COST, canRedeem, redeem } = useReward()
const { playSound } = useSounds()
const { startBattleMusic, stopBattleMusic } = useMusic()
const { shakeStyle } = useScreenshake()

// ─── Refs ─────────────────────────────────────────────────────────────────
const gridRef = ref<InstanceType<typeof MergeGrid> | null>(null)
const coinBadgeRef = ref<InstanceType<typeof CoinBadge> | null>(null)
const coinBadgeEl = computed<HTMLElement | null>(() => coinBadgeRef.value?.rootEl ?? null)

const showOptions = ref(false)
const showCodex = ref(false)

// ─── Wave-counter pips (roadmap #4): next milestone chest + new-enemy teaser ──
const nextChestWave = computed(() => {
  const w = battle.wave.value
  return w % CHEST_EVERY_WAVES === 0 ? w : Math.ceil(w / CHEST_EVERY_WAVES) * CHEST_EVERY_WAVES
})
const nextEnemyWave = computed(() => nextArchetypeUnlock(battle.wave.value))

// Next undiscovered tier — ghosts as a silhouette on the codex button (#12).
const nextUndiscovered = computed(() => game.maxTier.value < CODEX_MAX_TIER ? game.maxTier.value + 1 : 0)

// Drop-in full-scene backdrop (art-todo.md); the CSS radial gradient stays
// as the fallback (and shows through until the bitmap is confirmed).
const sceneBgStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  const art = artSrc('scene-bg')
  if (art) {
    style.backgroundImage = `url(${art})`
    style.backgroundSize = 'cover'
    style.backgroundPosition = 'center'
  }
  return style
})

// Side-by-side (arena | controls) layout whenever the viewport is wide-and-short —
// covers mobile landscape AND a short desktop/tablet landscape window, where a
// stacked column would crush the merge grid to nothing.
const sideBySide = computed(() =>
  isMobileLandscape.value
  || (windowWidth.value > windowHeight.value && windowHeight.value < 620)
  // Wide desktop landscape (width > 1.5× height): grid-on-the-right, like mobile.
  || windowWidth.value > windowHeight.value * 1.5
)

// ─── Top-bar height reserve ─────────────────────────────────────────────────
//
// The top bar (wave badge + gold wallet) is teleported to <body>, so the scene
// has to reserve its height as padding. That reserve used to be a hard-coded
// `3.4rem` — which meant shrinking the badges on tiny viewports gave the merge
// grid nothing back, the exact "scaling down still keeps the original space in
// the flow" problem. Measuring the real bar instead makes the reserve track
// whatever the bar currently costs, and it self-corrects for two other cases a
// constant can't: a mutation wave adding the MUTATION tag, and locales whose
// "next chest / new enemy" strings wrap to a second line.
//
// `offsetHeight` already includes the bar's own safe-area top padding, so the
// inset must NOT be added again here. The literal is kept only as the
// pre-measurement fallback (and for browsers without ResizeObserver).
const topBarEl = ref<HTMLElement | null>(null)
const topBarH = ref(0)
let topBarRo: ResizeObserver | null = null

// A clean feed (`?clean=1`, DEV only) has no top bar to reserve room for.
const contentPadTop = computed(() => CLEAN_FEED
  ? 'calc(0.4rem + env(safe-area-inset-top, 0px))'
  : topBarH.value > 0
    ? `calc(${topBarH.value}px + 0.25rem)`
    : 'calc(3.4rem + env(safe-area-inset-top, 0px))')

/** Top bar's own top padding — trimmed on compact so the bar itself doesn't
 *  waste height above the shrunken badges. Kept in the script (not an inline
 *  template literal) to stay pug-safe. */
const topBarPadTop = computed(() =>
  `calc(${isCompactHud.value ? '0.15rem' : '0.4rem'} + env(safe-area-inset-top, 0px))`)

// ─── Bottom-edge reserve ─────────────────────────────────────────────────────
//
// The mirror of the top-bar reserve. Everything anchored to the bottom edge —
// the scene's own padding, and with it the spawn row and the utility stacks that
// sit in the flow above it — measures from `bottomInset` rather than from a bare
// `env(safe-area-inset-bottom)`, so the Android system nav-bar strip
// (`androidNavBarPx`) is honored in one place. It's a `max()`, not a sum: a
// host that reports a real inset already covers the bar.
const bottomInset = computed(() => androidNavBarPx.value > 0
  ? `max(env(safe-area-inset-bottom, 0px), ${androidNavBarPx.value}px)`
  : 'env(safe-area-inset-bottom, 0px)')

const contentPadBottom = computed(() => `calc(0.5rem + ${bottomInset.value})`)

// ─── Portrait split: arena vs controls ──────────────────────────────────────
// The stacked (portrait) layout splits the column ARENA_FLEX : 1 between the
// arena and the controls. It was 1.25 : 1 (arena ≈ 56 %); the merge grid is the
// game's main verb and it came out barely half the screen width on a phone, so
// the arena now gives up ~10 % of its height (1 : 1) and the grid grows into it.
const ARENA_FLEX = 1
const arenaFlex = `${ARENA_FLEX} 1 0%`
// The BATTLEFIELD pays for the Android nav-bar reserve in full — the merge grid
// and the spawn row are what the strip exists to keep reachable, so shrinking
// them would defeat it — whereas a plain flex ratio would bill both in
// proportion. A controls flex-basis of `reserve / ARENA_FLEX` grows them back to
// exactly the height they had without the reserve; the arena absorbs all of it.
const controlsFlex = computed(() => `1 1 ${androidNavBarPx.value / ARENA_FLEX}px`)

// ─── Side-by-side: how wide the controls column is ──────────────────────────
// The grid row is [left utility stack] [grid] [right utility stack], and the
// grid is the largest square that fits the cell between the stacks. In the
// side-by-side layout the column's HEIGHT is fixed by the viewport, so the best
// the grid can do is that full height — it only falls short when the column is
// too NARROW, which is exactly what happened on short landscape phones (a 46 %
// column on a 667-wide screen capped the grid by width at 189 px).
//
// So the column takes whatever width lets the grid reach its full height —
// grid height + the stacks and gaps beside it — within [46 %, 56 %] of the row:
// never narrower than it always was (the upgrade chips and spawn row need it),
// never so wide the arena stops being the stage. The row's height does not
// depend on the column's width, so measuring it cannot feed back into itself.
const GRID_SBS_CAP_PX = 420 // keep in sync with `.grid-square--sbs`
const gridRowEl = ref<HTMLElement | null>(null)
const gridWrapEl = ref<HTMLElement | null>(null)
const sbsNeedPx = ref(0)
let gridRowRo: ResizeObserver | null = null
const measureGridRow = (): void => {
  const row = gridRowEl.value
  const wrap = gridWrapEl.value
  if (!row || !wrap) return
  // Everything in the row that is not the grid's cell: both stacks + both gaps.
  const beside = row.offsetWidth - wrap.offsetWidth
  sbsNeedPx.value = Math.ceil(Math.min(row.offsetHeight, GRID_SBS_CAP_PX) + beside)
}
const controlsSbsWidth = computed(() => {
  // A clean feed has no upgrade chips or spawn row to fit, and the arena is the
  // stage: the grid column takes what it needs, never more than 40 %.
  if (CLEAN_FEED) return sbsNeedPx.value > 0 ? `min(${sbsNeedPx.value}px, 40%)` : '40%'
  return sbsNeedPx.value > 0 ? `clamp(46%, ${sbsNeedPx.value}px, 56%)` : '46%'
})

// ─── Wave-badge type scale ───────────────────────────────────────────────────
// Four tiers. Compact viewports shrink for real (see `useUser`) and roomy
// desktop ones step UP — the `sm:` sizes below top out at phone scale and read
// as tiny at 1280×800. Between them sits compact-but-WIDE (1000×450): compact
// by height, so it keeps the tight compact layout, but a desktop window by
// width, where 10px wave text and an 8px teaser line are unreadable.
//
// Kept as computeds rather than nested ternaries in the template so the pug
// class bindings stay legible. The top bar is measured by a ResizeObserver, so
// a taller badge hands its cost to `contentPadTop` automatically instead of
// overlapping the arena.
const waveTextClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'text-sm leading-none' : 'text-[10px] leading-none')
  : isRoomyHud.value ? 'text-xl' : 'text-xs sm:text-base')
const bestTextClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'text-xs leading-none' : 'text-[8px] leading-none')
  : isRoomyHud.value ? 'text-base' : 'text-[10px] sm:text-sm')
const mutationTagClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'text-[9px] px-1 py-0' : 'text-[7px] px-0.5 py-0')
  : isRoomyHud.value ? 'text-xs px-1.5 py-0.5' : 'text-[8px] sm:text-[10px] px-1 py-0.5')
const waveIconClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'w-4 h-4' : 'w-3.5 h-3.5')
  : isRoomyHud.value ? 'w-7 h-7' : 'w-5 h-5 sm:w-6 sm:h-6')
/** The next-chest / new-enemy teaser pips under the badge — the "wave reward
 *  announcements" line. Hardest hit by the compact tier: 8px on a 1000px-wide
 *  window is the smallest type anywhere in the HUD. */
const teaserTextClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'text-[11px] leading-tight' : 'text-[8px] leading-tight')
  : isRoomyHud.value ? 'text-sm' : 'text-[9px] sm:text-[11px]')

// ─── Spawn ──────────────────────────────────────────────────────────────────
const spawnFlash = ref(false)
let spawnFlashTimer = 0
const onSpawn = (): void => {
  const idx = gridRef.value?.spawn() ?? -1
  if (idx >= 0) {
    // The meter completed — pop the button icon while the recruit lands.
    spawnFlash.value = true
    window.clearTimeout(spawnFlashTimer)
    spawnFlashTimer = window.setTimeout(() => { spawnFlash.value = false }, 320)
  }
}
// Radial reveal of the greyed spawn-button unit: each tap uncovers another
// third. Full colour whenever the next tap recruits — the buffed and the
// tutorial's one-tap states — so the big icon never reads as "disabled".
const spawnReveal = computed(() => {
  if (game.instantSpawnActive.value || game.clicksRequired.value <= 1) return '360deg'
  return `${(game.spawnClicks.value / game.clicksRequired.value) * 360}deg`
})

// ─── The tap meter, said out loud ───────────────────────────────────────────
// Play-testers read the silent multi-tap meter as a cooldown and waited between
// taps. The label now carries the number of taps still to go BEFORE the tap
// that spawns (2 → 1 → 0, the next tap recruits), and the button charges up
// visibly: a halo after the first tap, rune sparks after the second, released
// in a burst by the spawning tap. The instant-spawn buff and the tutorial's
// one-tap spawns show neither — every tap already recruits.
const spawnMetered = computed(() => !game.instantSpawnActive.value && game.clicksRequired.value > 1)
const spawnTapsLeft = computed<number | null>(() =>
  spawnMetered.value ? Math.max(0, game.clicksRequired.value - 1 - game.spawnClicks.value) : null)
/** 0 idle · 1 halo · 2 halo + sparks. */
const spawnCharge = computed(() => (spawnMetered.value ? Math.min(2, game.spawnClicks.value) : 0))
const spawnBurst = ref(false)
let spawnBurstTimer = 0
watch(() => game.spawnClicks.value, (now, before) => {
  // A metered spawn resets the meter from its last step to 0: release the sparks.
  if (!spawnMetered.value || now !== 0 || before < 1) return
  spawnBurst.value = true
  window.clearTimeout(spawnBurstTimer)
  spawnBurstTimer = window.setTimeout(() => { spawnBurst.value = false }, 420)
})
/** Eight sparks around the button: [left %, top %, delay s, size px]. */
const SPAWN_SPARKS: [number, number, number, number][] = [
  [8, 0, 0, 9], [46, -4, 0.28, 7], [88, 2, 0.14, 10], [100, 52, 0.42, 8],
  [84, 100, 0.07, 9], [40, 104, 0.35, 7], [2, 92, 0.21, 10], [-4, 40, 0.49, 8]
]
const sparkStyle = ([left, top, delay, size]: [number, number, number, number]): Record<string, string> => ({
  left: `${left}%`,
  top: `${top}%`,
  width: `${size}px`,
  height: `${size}px`,
  animationDelay: `${delay}s`,
  // Burst direction: straight out from the button's centre.
  '--burst-x': `${(left - 50) * 0.5}px`,
  '--burst-y': `${(top - 50) * 0.45}px`
})

// The face keeps the height the old padded icon gave it — the icon now fills
// that height edge to edge instead of floating in padding.
const spawnFaceClass = computed(() => isUltraCompactHud.value
  ? 'h-9 pr-3'
  : isCompactHud.value ? 'h-10 sm:h-11 pr-3.5' : 'h-11 sm:h-12 pr-4')

// ─── Deploy drops (grid → arena) ──────────────────────────────────────────────
const onDeploy = (p: { idx: number; tier: number; x: number; y: number }): void => {
  const r = zoneRect('arena')
  if (!r || r.width === 0 || r.height === 0) return
  const nx = ((p.x - r.left) / r.width) * 100
  const ny = ((p.y - r.top) / r.height) * 100

  // Is this the unit a new-tier reveal is spotlighting right now?
  const revealed = revealTargets({ kind: 'grid', idx: p.idx })

  // Dropped onto a same-tier fighter → field merge (tier+1, full heal). Any tier;
  // a matching fighter in reach wins over a closer one of another tier.
  const under = battle.fighterAt(nx, ny, undefined, p.tier)
  if (under && under.tier === p.tier) {
    const tier = game.takeFromGrid(p.idx)
    if (tier > 0) battle.fieldMerge(under.id, tier)
    // The revealed unit was fed into a fighter. If that merge was a discovery
    // itself, the arena already started a new reveal; otherwise its moment ends.
    if (revealed && revealTargets({ kind: 'grid', idx: p.idx })) endReveal()
    return
  }

  if (battle.armyFull.value) {
    playSound('army-full', 0.015) // no room — merge into a fighter instead
    return
  }
  const tier = game.takeFromGrid(p.idx)
  // Fighters hold the left half; clamp the drop into friendly territory.
  if (tier > 0 && battle.deployFighter(tier, Math.min(nx, 58), ny) && revealed) {
    // A freshly revealed unit marched straight into battle carries its
    // spotlight with it for the rest of the five seconds.
    const fighter = battle.fighters.value[battle.fighters.value.length - 1]
    if (fighter) retargetReveal({ kind: 'grid', idx: p.idx }, { kind: 'fighter', fighterId: fighter.id })
  }
}

// ─── Boss bounty rewarded offer (roadmap #9 — 6 s non-blocking chip) ────────
// The kill already banked the base bounty, so the reward TOPS IT UP to
// `BOSS_BOUNTY_AD_MULT` times the normal amount — i.e. it pays out
// `mult - 1` extra bounties. Both the label and the `+n` on the chip derive
// from this one constant so the promise can't drift from the payout.
const BOSS_BOUNTY_AD_MULT = 4
const bossOffer = ref<number | null>(null)
/** Coins the offer actually pays on top of the bounty already banked. */
const bossOfferGrant = computed(() => Math.round((bossOffer.value ?? 0) * (BOSS_BOUNTY_AD_MULT - 1)))
let bossOfferTimer = 0
const BOSS_OFFER_MS = 6000
const onBossKill = (bounty: number, first: boolean): void => {
  // The first-ever boss kill also spotlights the War Chest button (#2).
  if (first) {
    warChestPulse.value = true
    window.clearTimeout(warChestPulseTimer)
    warChestPulseTimer = window.setTimeout(() => { warChestPulse.value = false }, 8000)
  }
  if (!canRedeem(REWARD_COIN_COST) || bounty <= 0) return
  bossOffer.value = bounty
  window.clearTimeout(bossOfferTimer)
  bossOfferTimer = window.setTimeout(() => { bossOffer.value = null }, BOSS_OFFER_MS)
}

// ─── Milestone chest (roadmap #4): free high-tier unit onto the grid ─────────
// Same rule as the flying chest: one below the strongest fighter on the field
// (`chestUnitTier`), with the old tier-2 floor for a first milestone.
const onMilestone = (): void => {
  const tier = Math.max(2, battle.chestUnitTier.value)
  if (game.spawnUnitAt(tier) < 0 && !battle.armyFull.value) {
    battle.deployFighter(tier) // grid full → straight to the front line
  }
}
const onBoostBounty = async (): Promise<void> => {
  const grant = bossOfferGrant.value
  bossOffer.value = null
  window.clearTimeout(bossOfferTimer)
  if (!grant) return
  const ok = await redeem(REWARD_COIN_COST)
  if (ok) {
    addCoins(grant)
    flyGold(grant)
    playSound('coin-pickup', 0.05)
  }
}

// First-boss spotlight for the 2× Damage rewarded button (roadmap #2).
const warChestPulse = ref(false)
let warChestPulseTimer = 0
const flyGold = (gold: number): void => {
  if (gold <= 0 || !coinBadgeEl.value) return
  const src = document.querySelector<HTMLElement>('.battle-arena')
  if (!src) return
  spawnCoinExplosion({
    sourceEl: src,
    targetEl: coinBadgeEl.value,
    count: Math.min(40, 10 + Math.round(gold / 50))
  })
}
onMounted(() => {
  startBattleMusic()
  // DEV only: `window.__video`, the gameplay-video pipeline's scripting seam.
  if (import.meta.env.DEV) void import('@/dev/videoSeam')
  // The grid row decides the side-by-side column width (see `controlsSbsWidth`).
  // Observed whole — row, grid cell and both stacks — so a breakpoint that
  // resizes the stack buttons re-measures as well as a viewport change does.
  measureGridRow()
  if (typeof ResizeObserver !== 'undefined' && gridRowEl.value) {
    gridRowRo = new ResizeObserver(measureGridRow)
    gridRowRo.observe(gridRowEl.value)
    for (const child of Array.from(gridRowEl.value.children)) gridRowRo.observe(child)
  }
  // Track the teleported top bar's real height so the content reserve above
  // follows it (compact shrink, mutation tag, wrapped translations).
  const el = topBarEl.value
  if (!el) return
  const measure = (): void => { topBarH.value = el.offsetHeight }
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    topBarRo = new ResizeObserver(measure)
    topBarRo.observe(el)
  }
})
// Battle-pass / achievement claim VFX: coins fly from the card to the wallet.
const onBpCoins = (sourceEl: HTMLElement): void => {
  if (coinBadgeEl.value) spawnCoinExplosion({ sourceEl, targetEl: coinBadgeEl.value, count: 14 })
}

// ─── Welcome-back offline earnings (roadmap #3) ──────────────────────────────
// Opens shortly after the scene settles whenever a grant is pending — also
// when cloud hydration surfaces one late (hence a watcher, not a mount check).
const showWelcomeBack = ref(false)
let welcomeTimer = 0
watch(offlineGold, (g) => {
  if (g > 0 && !showWelcomeBack.value) {
    window.clearTimeout(welcomeTimer)
    welcomeTimer = window.setTimeout(() => { showWelcomeBack.value = true }, 1200)
  }
}, { immediate: true })

// ─── Achievement unlock toast (roadmap #10) ──────────────────────────────────
const achToast = ref<string | null>(null)
let achToastTimer = 0
const showAchToast = (id: string): void => {
  achToast.value = id
  playSound('reward-continue', 0.04)
  window.clearTimeout(achToastTimer)
  achToastTimer = window.setTimeout(() => { achToast.value = null }, 3200)
}
// HELD while a new-tier reveal is on screen. The reveal owns that moment — and
// the first field merge unlocks an achievement in the very same frame, so every
// player saw the gold toast land beside the reveal's label, two banners and two
// stings fighting for one glance. The toast (and its sound) now follows the
// moment the reveal ends; if several unlock meanwhile, the latest shows, as before.
let heldAchToast: string | null = null
watch(achievementToast, (v) => {
  if (!v) return
  if (activeReveal.value) { heldAchToast = v.id; return }
  showAchToast(v.id)
})
watch(activeReveal, (reveal) => {
  if (reveal || heldAchToast === null) return
  const id = heldAchToast
  heldAchToast = null
  showAchToast(id)
})

onUnmounted(() => {
  stopBattleMusic()
  topBarRo?.disconnect()
  gridRowRo?.disconnect()
  gridRowRo = null
  topBarRo = null
  window.clearTimeout(bossOfferTimer)
  window.clearTimeout(warChestPulseTimer)
  window.clearTimeout(achToastTimer)
  window.clearTimeout(welcomeTimer)
})
</script>

<template lang="pug">
  div.prism-scene.relative.w-screen.overflow-hidden(class="h-screen h-dvh" :style="[shakeStyle, sceneBgStyle]")
    //- ── Top bar ──────────────────────────────────────────────────────────
    //- Teleported to <body> at z-[55]: modals teleport to body at z-50, and
    //- the scene root's transform (screenshake) traps any in-scene z-index in
    //- its own stacking context — so the ONLY way the gold wallet stays
    //- visible above an open modal is to live at body level too. This keeps
    //- reward claims (achievements, campaign, welcome-back) visibly ticking
    //- the counter with coins flying onto it (particles are z-60); a claim
    //- with a hidden wallet reads as "the coins never arrived".
    //- A clean feed (`CLEAN_FEED`) drops this row and the three below it —
    //- upgrades, utility stacks, spawn row — so arena and grid fill the frame.
    Teleport(to="body" v-if="!CLEAN_FEED")
      div.fixed.top-0.left-0.right-0.flex.items-center.justify-between(
        ref="topBarEl"
        class="px-2 z-[55]"
        :class="isCompactHud ? 'py-0' : 'py-1'"
        :style="{\
          paddingTop: topBarPadTop,\
          paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
          paddingRight: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        //- Wave badge (+ next-chest / new-enemy pips, roadmap #4). On a MUTATION
        //- wave it flips to a glowing purple + shows a MUTATION tag.
        //- On `isCompactHud` viewports every dimension shrinks for real —
        //- font sizes, the flag icon, padding, borders and gaps — rather than
        //- via `transform: scale()`, which would keep the original box in the
        //- top bar and hand none of the height back to the merge grid.
        div.flex.flex-col.items-start(:class="isCompactHud ? 'gap-0' : 'gap-0.5'")
          div.relative
            div.absolute.inset-0.rounded-xl(
              :class="[\
                battle.waveMutated.value ? 'bg-[#3a1080]' : 'bg-[#7a1c1c]',\
                isCompactHud ? 'translate-y-0.5' : 'translate-y-1'\
              ]"
            )
            div.relative.flex.items-center.rounded-xl(
              :class="[\
                battle.waveMutated.value ? 'mutated-badge bg-gradient-to-b from-[#d24bff] to-[#7a1fd0] border-[#e9b6ff]' : 'bg-gradient-to-b from-[#ff7a4d] to-[#d43a1f] border-[#0f1a30]',\
                isCompactHud ? 'gap-1 border px-1.5 py-0.5' : 'gap-2 border-2 px-3 py-1.5'\
              ]"
            )
              svg(
                viewBox="0 0 24 24"
                class="text-white"
                :class="waveIconClass"
                fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
              )
                path(d="M5 21 L5 4 L13 4 L12 7 L19 7 L19 14 L11 14 L12 11 L5 11")
              span.text-white.font-black.game-text(:class="waveTextClass") {{ t('battle.wave', { n: battle.wave.value }) }}
              span.text-yellow-200.font-black.game-text.opacity-90(
                :class="bestTextClass"
              ) {{ t('battle.best', { n: battle.bestWave.value }) }}
              //- Mutation marker — only on a mutated wave.
              span.rounded.font-black.game-text.uppercase.leading-none.mutated-tag(
                v-if="battle.waveMutated.value"
                class="bg-[#3a0d66] text-fuchsia-100 border border-fuchsia-300"
                :class="mutationTagClass"
              ) {{ t('battle.mutationWave') }}
          //- Teaser pips. On compact they stay (they're the "one more wave"
          //- bait) but drop to 8px with a tight gap so the whole stack costs
          //- ~11px instead of ~18px. Under 320px they go entirely — pure teaser
          //- chrome is the first thing to yield, and dropping the second line
          //- takes the whole top bar down to just the badge row.
          div.flex(v-if="!isUltraCompactHud" :class="isCompactHud ? 'gap-1 px-0.5' : 'gap-2 px-1'")
            span.game-text.font-black.text-yellow-200.drop-shadow(
              :class="teaserTextClass"
            ) {{ t('battle.nextChest', { n: nextChestWave }) }}
            span.game-text.font-black.text-red-300.drop-shadow(
              v-if="nextEnemyWave"
              :class="teaserTextClass"
            ) {{ t('battle.newEnemyAt', { n: nextEnemyWave }) }}
        //- Gold counter, preceded by the 3× coin-buff clock while that buff is
        //- running (CoinBuffTimer renders nothing otherwise, so it costs no
        //- layout the rest of the time).
        div.flex.items-center.shrink-0(:class="isCompactHud ? 'gap-1' : 'gap-1.5'")
          CoinBuffTimer
          CoinBadge(ref="coinBadgeRef")

    //- ── Main content (column on portrait, row on landscape) ───────────────
    div.absolute.inset-0.flex.min-h-0(
      :class="sideBySide ? 'flex-row' : 'flex-col'"
      :style="{\
        paddingTop: contentPadTop,\
        paddingBottom: contentPadBottom,\
        paddingLeft: 'calc(0.4rem + env(safe-area-inset-left, 0px))',\
        paddingRight: 'calc(0.4rem + env(safe-area-inset-right, 0px))'\
      }"
    )
      //- ── Battle arena ──
      div.arena-area.relative.flex.items-stretch.justify-center.min-h-0(
        data-tut="arena"
        :class="sideBySide ? 'flex-1 h-full' : 'w-full'"
        :style="sideBySide ? {} : { flex: arenaFlex }"
      )
        BattleArena(:coin-target="coinBadgeEl" @boss-kill="onBossKill" @milestone="onMilestone")
        //- The two chips below are anchored to the ARENA, not the screen: centred on
        //- the scene they crossed into the controls column in landscape (the screen's
        //- centre sits right at the arena/column border) and covered a corner of the
        //- merge grid for as long as they showed. Here they centre over the battle in
        //- every layout and can never reach the grid.
        //- ── 4× boss bounty — 6 s non-blocking offer chip (roadmap #9) ─────────
        Transition(name="chip")
          div.absolute.left-0.right-0.flex.justify-center.pointer-events-none(
            v-if="bossOffer"
            class="z-[60]"
            :style="{ top: '2.4rem' }"
          )
            //- The halo lives on a WRAPPER, not the chip: the chip clips its own
            //- overflow for the draining bar, which would eat an expanding ring.
            div.boss-chip-halo.relative.pointer-events-none
              button.boss-chip.pointer-events-auto.cursor-pointer.flex.items-center.gap-2.rounded-xl.border-2.px-3.py-2.relative(
                class="bg-gradient-to-b from-emerald-400 to-emerald-700 border-[#ffd23a] active:scale-95 transition-transform"
                @click="onBoostBounty"
              )
                //- Coin mode shows the price + IconCoin; ad mode the movie icon.
                template(v-if="buffsCostCoins")
                  IconCoin(class="w-6 h-6 shrink-0 text-yellow-200")
                  span.text-white.font-black.game-text.tabular-nums(class="text-xs sm:text-sm leading-none") {{ formatCost(REWARD_COIN_COST) }}
                IconMovie(v-else class="w-6 h-6 shrink-0")
                div.flex.flex-col.items-start
                  span.text-white.font-black.uppercase.game-text(class="text-xs sm:text-sm leading-none") {{ t('battle.multBounty', { mult: BOSS_BOUNTY_AD_MULT }) }}
                  span.boss-chip-gold.font-black.game-text(class="text-[11px] sm:text-sm") +{{ formatBig(bossOfferGrant) }}
                //- Draining bar mirrors the 6 s window
                div.boss-chip-timer.absolute.bottom-0.left-1.right-1.rounded-full(class="h-0.5")

        //- ── Achievement unlock toast (roadmap #10) ────────────────────────────
        Transition(name="chip")
          div.absolute.left-0.right-0.flex.justify-center.pointer-events-none(
            v-if="achToast"
            class="z-[59]"
            :style="{ top: '5.2rem' }"
          )
            div.ach-toast.flex.items-center.gap-2.rounded-xl.border-2.px-3.py-2(
              class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30] shadow-2xl"
            )
              //- Trophy medal — a dark badge so the gold trophy reads clearly on the
              //- gold toast (a bare white trophy washed out into the background). The
              //- glyph matches the HUD achievements button, signalling at a glance
              //- that the yellow banner is an achievement unlock.
              div.shrink-0.rounded-full.border-2.flex.items-center.justify-center(class="w-7 h-7 sm:w-8 sm:h-8 bg-[#0f1a30] border-white/60")
                svg(viewBox="0 0 24 24" class="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="#ffd23a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round")
                  path(d="M7 4 h10 v3 a5 5 0 0 1 -10 0 Z")
                  path(d="M7 5 H4 v1 a3 3 0 0 0 3 3")
                  path(d="M17 5 h3 v1 a3 3 0 0 1 -3 3")
                  path(d="M12 12 v4")
                  path(d="M9 20 h6 l-1 -4 h-4 Z")
              div.flex.flex-col.items-start
                span.text-white.font-black.uppercase.game-text(class="text-[9px] sm:text-[10px] leading-none opacity-90") {{ t('achievements.unlocked') }}
                span.text-white.font-black.game-text(class="text-xs sm:text-sm") {{ t('achievements.items.' + achToast + '.name') }}

      //- ── Controls (upgrades + grid + spawn) ──
      div.controls-area.relative.flex.flex-col.min-h-0(
        :class="sideBySide ? 'h-full shrink-0' : 'w-full'"
        :style="sideBySide ? { width: controlsSbsWidth } : { flex: controlsFlex }"
      )
        //- Upgrade controls. The `min-h-14` (56px) floor was the single biggest
        //- block on a ~280px-tall viewport — bigger than the whole top bar — and
        //- since the grid below is height-led (`min(100cqh, …)`) every pixel
        //- taken here comes straight out of the merge grid. Compact drops the
        //- floor to 36px and the cap to 54px; UpgradePanel shrinks its chips to
        //- match.
        //- Deliberately NOT raised for roomy viewports: in the STACKED
        //- (non-side-by-side) layout `h-[15%]` resolves under the 56px floor
        //- even at 1024×768, so the enlarged chips would have to buy their
        //- height from the grid — and that is exactly the trade this whole
        //- block exists to refuse. UpgradePanel measures the height it actually
        //- gets and falls back to the phone-tuned chip sizes below ~74px, so
        //- the two can never disagree.
        div.shrink-0.w-full.max-w-md.mx-auto(
          v-if="!CLEAN_FEED"
          :class="isUltraCompactHud\
            ? 'h-[13%] min-h-7 max-h-[38px] mb-0.5 mt-0.5'\
            : (isCompactHud ? 'h-[15%] min-h-9 max-h-[54px] mb-0.5 mt-0.5' : 'h-[15%] min-h-14 max-h-[92px] mb-1 mt-1')"
        )
          UpgradePanel
        //- ── Grid row: [left utility stack] [merge grid] [right utility stack] ──
        //- The utility buttons sit IN this row, beside the grid, instead of
        //- floating over the screen corners: the grid is the largest square that
        //- fits the cell BETWEEN them, so however big it grows — on any
        //- viewport, in either orientation — no button can cover a slot. Both
        //- stacks bottom-align, just above the spawn row, as before; both are the
        //- same width, so the grid stays centred under the upgrade and spawn
        //- rows. The 0.5rem gaps swallow the count badges and the codex
        //- silhouette, which overhang their buttons' corners by up to 6px.
        div.grid-row.flex-1.min-h-0.w-full.flex.items-end.gap-2(ref="gridRowEl")
          //- Left: War Campaign (battle pass, #18) · Achievements (#10) · Codex (#12)
          div.utility-stack.z-30.shrink-0.flex.flex-col.items-center.gap-1(v-if="!CLEAN_FEED")
            BattlePass(@coins-awarded="onBpCoins")
            AchievementsButton(@coins-awarded="onBpCoins")
            //- Unit Codex — the next undiscovered tier ghosts on the button as a
            //- silhouette: pure "one more merge" bait.
            button.cursor-pointer.transition-transform(
              class="active:scale-90 hover:scale-[103%]"
              :aria-label="t('battle.codex.title')"
              @click="showCodex = true"
            )
              //- While a new-tier reveal runs the codex pulses and the NEXT tier's
              //- silhouette bobs harder: "that was great — here's what's next".
              div.relative(:class="{ 'codex-nudge': activeReveal }")
                div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#7a4a10]")
                div.relative.rounded-lg.border-2.flex.items-center.justify-center(
                  class="p-1.5 sm:p-2 bg-gradient-to-b from-[#ffb054] to-[#e07818] border-[#0f1a30]"
                )
                  svg(viewBox="0 0 24 24" class="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round")
                    path(d="M4 19.5 A2.5 2.5 0 0 1 6.5 17 H20 V3 H6.5 A2.5 2.5 0 0 0 4 5.5 Z")
                    path(d="M4 19.5 A2.5 2.5 0 0 0 6.5 22 H20 V17")
                div.absolute.codex-ghost(v-if="nextUndiscovered" class="-top-1.5 -right-1.5 w-5 h-5")
                  IngredientUnit(:tier="nextUndiscovered" :still="true")
          //- Merge grid — the largest square that fits the cell between stacks.
          div.grid-square-wrap.flex-1.min-w-0.h-full.flex.items-center.justify-center(ref="gridWrapEl")
            div.grid-square(data-tut="grid" :class="{ 'grid-square--sbs': sideBySide }")
              MergeGrid(ref="gridRef" @deploy="onDeploy")
          //- Right: mute + settings.
          div.utility-stack.z-30.shrink-0.flex.flex-col.items-center.gap-1(v-if="!CLEAN_FEED")
            //- CrazyGames owns the sound toggle on their build: their toolbar has
            //- its own mute, and CG QA requires the platform state to win over
            //- any in-game setting. `useCrazyMuteSync` already enforces that
            //- (hard AudioContext suspend via `setPlatformAudioMuted`), but a
            //- second, in-game mute beside it reads as two competing switches —
            //- so we take QA's offered alternative and drop ours from the CG
            //- build. The volume sliders in Options stay: they trim levels, they
            //- can't defeat the mute.
            FMuteButton(v-if="!isCrazyWeb")
            button.cursor-pointer.transition-transform(
              class="active:scale-90 hover:scale-[103%]"
              :aria-label="t('options.title')"
              @click="showOptions = true"
            )
              div.relative
                div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#102e7a]")
                div.relative.rounded-lg.border-2.flex.items-center.justify-center(
                  class="p-1.5 sm:p-2 bg-gradient-to-b from-[#50aaff] to-[#2266ff] border-[#0f1a30]"
                )
                  svg(viewBox="0 0 24 24" class="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor")
                    path(d="M12 4 a1 1 0 0 1 1 1 v1.6 a6 6 0 0 1 1.8 0.7 l1.1 -1.1 a1 1 0 0 1 1.4 1.4 l -1.1 1.1 a6 6 0 0 1 0.7 1.8 H18 a1 1 0 1 1 0 2 h-1.6 a6 6 0 0 1 -0.7 1.8 l1.1 1.1 a1 1 0 0 1 -1.4 1.4 l-1.1 -1.1 a6 6 0 0 1 -1.8 0.7 V18 a1 1 0 1 1 -2 0 v -1.6 a6 6 0 0 1 -1.8 -0.7 l-1.1 1.1 a1 1 0 0 1 -1.4 -1.4 l1.1 -1.1 a6 6 0 0 1 -0.7 -1.8 H6 a1 1 0 1 1 0 -2 h1.6 a6 6 0 0 1 0.7 -1.8 L7.2 7.6 a1 1 0 0 1 1.4 -1.4 l1.1 1.1 a6 6 0 0 1 1.8 -0.7 V5 a1 1 0 0 1 1 -1 Z M12 9 a3 3 0 1 0 0 6 a3 3 0 0 0 0 -6 Z")
        //- Spawn row: [rewarded Instant Spawn] [Spawn button] [rewarded 2× Damage]
        div.shrink-0.w-full.max-w-md.mx-auto.flex.items-center.justify-center(
          v-if="!CLEAN_FEED"
          :class="isCompactHud ? 'gap-1 mt-0.5' : 'gap-2 mt-1'"
        )
          InstantSpawnAdButton
          button.spawn-btn.relative.cursor-pointer.transition-transform(
            data-tut="spawn"
            class="active:scale-95 hover:scale-[101%]"
            :class="{ 'spawn-btn--tut-press': tutorialPreview === 'spawn' }"
            @click="onSpawn"
          )
            //- Charge halo — behind the button, so only its glow shows around it.
            div.spawn-halo.absolute.pointer-events-none(
              v-if="spawnCharge > 0"
              :class="'spawn-halo--' + spawnCharge"
              aria-hidden="true"
            )
            div.absolute.inset-0.rounded-xl(
              :class="[\
                game.instantSpawnActive.value ? 'bg-[#7a5a00]' : 'bg-[#1c6b2a]',\
                isCompactHud ? 'translate-y-0.5' : 'translate-y-1'\
              ]"
            )
            //- SPAWN is the game's primary verb and a thumb target — it keeps
            //- its full border and label even on the smallest screens. The two
            //- rewarded chips beside it absorb the row's shrink instead.
            div.spawn-face.relative.flex.items-center.rounded-xl.border-2(
              :class="[\
                game.instantSpawnActive.value\
                  ? 'bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]'\
                  : 'bg-gradient-to-b from-[#4fd16a] to-[#27a03f] border-[#0f1a30]',\
                spawnFaceClass\
              ]"
            )
              //- Next recruit (tier follows the Recruits upgrade), revealed
              //- radially tap by tap (grey → full color). Fills the face's full
              //- height, flush to its left edge; only the text side gets a gap.
              div.spawn-icon.relative.shrink-0.h-full.aspect-square(
                :class="{ 'spawn-pop': spawnFlash }"
              )
                div.absolute.inset-0.spawn-icon-grey
                  IngredientUnit(:tier="game.recruitTier.value" :still="true")
                div.absolute.inset-0.spawn-icon-reveal(:style="{ '--spawn-reveal': spawnReveal }")
                  IngredientUnit(:tier="game.recruitTier.value" :still="true")
              div.flex.items-center(:class="isUltraCompactHud ? 'gap-1 pl-1' : 'gap-1.5 pl-1.5'")
                span.text-white.font-black.uppercase.game-text(
                  :class="isUltraCompactHud ? 'text-[13px]' : 'text-sm sm:text-base'"
                ) {{ t('prism.spawn') }}
                //- Taps still to go before the recruiting tap (metered only).
                span.spawn-count.game-text.tabular-nums.font-black.leading-none(
                  v-if="spawnTapsLeft !== null"
                  :key="spawnTapsLeft"
                  :class="isUltraCompactHud ? 'text-[11px]' : 'text-xs sm:text-sm'"
                ) {{ spawnTapsLeft }}
            //- Rune sparks after the second metered tap; the spawning tap bursts them.
            div.spawn-sparks.absolute.pointer-events-none(
              v-if="spawnCharge === 2 || spawnBurst"
              :class="{ 'spawn-sparks--burst': spawnBurst }"
              aria-hidden="true"
            )
              span.spawn-spark(v-for="(s, i) in SPAWN_SPARKS" :key="i" :style="sparkStyle(s)")
          //- 2× Damage rewarded buff (tap progress lives in the spawn icon's
          //- radial reveal, so this slot sells damage instead of a meter)
          DamageBuffAdButton(:pulse="warChestPulse")

    //- ── Overlays ──────────────────────────────────────────────────────────
    ParticleCanvas
    TutorialOverlay
    //- New-tier discovery moment (teleports itself to <body>, follows the unit).
    TierRevealFx

    UnitCodexModal(v-model="showCodex")
    WelcomeBackModal(v-model="showWelcomeBack" :coin-target="coinBadgeEl")
    OptionsModal(:is-open="showOptions" @close="showOptions = false")
</template>

<style scoped lang="sass">
.prism-scene
  background: radial-gradient(ellipse at 50% 38%, #1c2742 0%, #0c1120 55%, #070a14 100%)
  background-color: #070a14

// Mutation-wave marker on the wave badge: a pulsing purple glow + a throbbing tag.
.mutated-badge
  animation: mutated-badge-throb 0.9s ease-in-out infinite alternate
@keyframes mutated-badge-throb
  from
    box-shadow: 0 0 7px rgba(190, 90, 255, 0.5)
  to
    box-shadow: 0 0 18px rgba(210, 120, 255, 0.95)
.mutated-tag
  animation: mutated-tag-throb 0.9s ease-in-out infinite alternate
@keyframes mutated-tag-throb
  from
    filter: brightness(1)
  to
    filter: brightness(1.35)

// Largest square that fits the available box, in BOTH orientations — uses
// container-query units so the grid never overflows under the Spawn button on
// short viewports nor past the column edge in landscape.
.grid-square-wrap
  container-type: size
.grid-square
  width: min(100cqw, 100cqh)
  height: min(100cqw, 100cqh)
// Side-by-side (desktop/mobile landscape): hard-cap the grid so wide desktop
// columns don't blow the cells up (keep in sync with `GRID_SBS_CAP_PX`). No side
// margin is reserved any more — the utility stacks are siblings in the grid row,
// so the cell this measures is already the space BETWEEN them.
.grid-square--sbs
  width: min(100cqh, 100cqw, 420px)
  height: min(100cqh, 100cqw, 420px)

// Both utility stacks share one width — the width of their buttons (36px on a
// phone, 44px from `sm` up) — so the grid between them stays centred under the
// upgrade and spawn rows.
.utility-stack
  width: 2.25rem
  @media (min-width: 640px)
    width: 2.75rem

// ── Spawn-button icon: greyed next recruit, revealed by a radial wipe ──
// The angle is a registered custom property so supporting browsers animate
// the wipe smoothly; others just snap per tap.
@property --spawn-reveal
  syntax: '<angle>'
  initial-value: 0deg
  inherits: false

.spawn-icon-grey
  filter: grayscale(1) brightness(0.55)
  opacity: 0.55
.spawn-icon-reveal
  -webkit-mask: conic-gradient(#000 var(--spawn-reveal, 0deg), transparent 0)
  mask: conic-gradient(#000 var(--spawn-reveal, 0deg), transparent 0)
  transition: --spawn-reveal 0.22s ease-out
.spawn-pop
  animation: spawn-icon-pop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)

@keyframes spawn-icon-pop
  0%
    transform: scale(1)
  40%
    transform: scale(1.4) rotate(8deg)
  100%
    transform: scale(1)

// ── Spawn charge VFX (metered taps only) ──
// The halo sits UNDER the base plate and the face, so only its glow escapes
// round the edges: a soft summoning light after tap 1, a hotter one after tap 2.
.spawn-halo
  inset: -3px
  border-radius: 0.95rem
  animation: spawn-halo-breathe 1.1s ease-in-out infinite alternate
.spawn-halo--1
  box-shadow: 0 0 8px 2px rgba(255, 228, 120, 0.55), 0 0 2px 1px rgba(255, 244, 190, 0.8)
.spawn-halo--2
  box-shadow: 0 0 16px 6px rgba(255, 214, 90, 0.75), 0 0 4px 2px rgba(255, 248, 210, 0.95)
  animation-duration: 0.6s
@keyframes spawn-halo-breathe
  from
    opacity: 0.7
  to
    opacity: 1

// Rune sparks: four-point stars twinkling round the rim after the second tap,
// flung outward and snuffed by the tap that recruits.
.spawn-sparks
  inset: -9px
.spawn-spark
  position: absolute
  translate: -50% -50%
  clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%)
  background: radial-gradient(circle, #fffbe6 0%, #ffe27a 45%, #f5a300 100%)
  filter: drop-shadow(0 0 3px rgba(255, 220, 110, 0.95))
  animation: spawn-spark-twinkle 0.9s ease-in-out infinite
@keyframes spawn-spark-twinkle
  0%, 100%
    transform: scale(0.35) rotate(0deg)
    opacity: 0.35
  50%
    transform: scale(1.1) rotate(45deg)
    opacity: 1
.spawn-sparks--burst .spawn-spark
  animation: spawn-spark-burst 0.42s ease-out forwards
@keyframes spawn-spark-burst
  from
    transform: translate(0, 0) scale(1.1) rotate(0deg)
    opacity: 1
  to
    transform: translate(var(--burst-x), var(--burst-y)) scale(0.2) rotate(90deg)
    opacity: 0

// The taps-left count: a small pill that pops each time it ticks down.
.spawn-count
  display: inline-grid
  place-items: center
  min-width: 1.4em
  height: 1.4em
  padding: 0 0.3em
  border-radius: 999px
  color: #fff
  background: rgba(8, 40, 18, 0.55)
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.35)
  animation: spawn-count-pop 0.26s cubic-bezier(0.34, 1.56, 0.64, 1)
@keyframes spawn-count-pop
  from
    transform: scale(1.45)
  to
    transform: scale(1)

// Tutorial: the face presses down onto its base plate in time with the coach
// hand (`TutorialOverlay`, same 1.4 s loop, started in the same tick).
.spawn-btn--tut-press .spawn-face
  animation: spawn-tut-press 1.4s ease-in-out infinite
@keyframes spawn-tut-press
  0%, 34%, 58%, 100%
    transform: translateY(0)
  42%, 50%
    transform: translateY(3px)

@media (prefers-reduced-motion: reduce)
  .spawn-halo, .spawn-spark, .spawn-count, .spawn-btn--tut-press .spawn-face
    animation: none
  .spawn-spark
    transform: scale(0.9)
  .spawn-sparks--burst .spawn-spark
    opacity: 0

.fade-enter-active, .fade-leave-active
  transition: opacity 0.3s ease
.fade-enter-from, .fade-leave-to
  opacity: 0

// ── Codex button: next undiscovered tier as a dark silhouette ghost ──
.codex-ghost
  filter: brightness(0) opacity(0.85)
  animation: codex-ghost-bob 1.4s ease-in-out infinite alternate
@keyframes codex-ghost-bob
  from
    transform: translateY(0)
  to
    transform: translateY(-2px)

// New-tier reveal running: the codex is where the discovery lives, and its
// ghost is the next tier to chase.
.codex-nudge
  animation: codex-nudge 0.9s ease-in-out infinite alternate
@keyframes codex-nudge
  from
    scale: 1
    filter: drop-shadow(0 0 0 rgba(255, 210, 60, 0))
  to
    scale: 1.1
    filter: drop-shadow(0 0 8px rgba(255, 210, 60, 0.95))
.codex-nudge .codex-ghost
  animation: codex-ghost-hint 0.45s ease-in-out infinite alternate
@keyframes codex-ghost-hint
  from
    transform: translateY(0) scale(1)
  to
    transform: translateY(-4px) scale(1.2)
@media (prefers-reduced-motion: reduce)
  .codex-nudge, .codex-nudge .codex-ghost
    animation: none

// ── 4× boss bounty chip (roadmap #9) ──
// A player mid-merge is looking at the GRID, not the arena, and a 6 s chip is
// easy to miss. The gold halo is the peripheral-vision hook: a breathing glow
// under the chip plus a ring that expands and fades out of it, both in the
// coin colour so the eye reads "money" before it reads the words.
.boss-chip-halo
  border-radius: 0.85rem
  animation: boss-halo-breathe 1.1s ease-in-out infinite
  box-shadow: 0 0 12px 2px rgba(255, 205, 0, 0.75), 0 0 30px 8px rgba(255, 170, 0, 0.4)

  // Expanding ring — escapes the chip because the chip clips its own overflow.
  &::after
    content: ''
    position: absolute
    inset: -2px
    border-radius: inherit
    border: 2px solid rgba(255, 214, 74, 0.9)
    animation: boss-halo-ring 1.4s ease-out infinite
    pointer-events: none

@keyframes boss-halo-breathe
  0%, 100%
    box-shadow: 0 0 12px 2px rgba(255, 205, 0, 0.65), 0 0 26px 6px rgba(255, 170, 0, 0.32)
  50%
    box-shadow: 0 0 20px 5px rgba(255, 224, 110, 0.95), 0 0 46px 16px rgba(255, 176, 0, 0.55)

@keyframes boss-halo-ring
  0%
    transform: scale(1)
    opacity: 0.85
  100%
    transform: scale(1.28)
    opacity: 0

.boss-chip
  position: relative
  overflow: hidden
  animation: boss-chip-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)
@keyframes boss-chip-pop
  0%
    transform: scale(0.4)
  70%
    transform: scale(1.1)
  100%
    transform: scale(1)
// The payout line is gold rather than emerald — it is the number the halo is
// advertising, so it should match the glow.
.boss-chip-gold
  color: #ffe27a
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.55)
// The halo is an attention device, not information: a still gold glow carries
// the same message without the motion.
@media (prefers-reduced-motion: reduce)
  .boss-chip-halo
    animation: none
  .boss-chip-halo::after
    animation: none
    opacity: 0.6
.boss-chip-timer
  background: rgba(255, 255, 255, 0.85)
  transform-origin: left center
  animation: boss-chip-drain 6s linear forwards
@keyframes boss-chip-drain
  from
    transform: scaleX(1)
  to
    transform: scaleX(0)

.chip-enter-active, .chip-leave-active
  transition: opacity 0.25s ease, transform 0.25s ease
.chip-enter-from, .chip-leave-to
  opacity: 0
  transform: translateY(-10px)
</style>
