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
 * "war chest" and 2×-boss-bounty placements, screenshake, ambient music, and
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
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import { isMobileLandscape, isMobilePortrait, windowWidth, windowHeight } from '@/use/useUser'
import { artSrc } from '@/use/useArtOverrides'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'

import MergeGrid from '@/components/organisms/MergeGrid.vue'
import BattleArena from '@/components/organisms/BattleArena.vue'
import UpgradePanel from '@/components/organisms/UpgradePanel.vue'
import ParticleCanvas from '@/components/organisms/ParticleCanvas.vue'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import InstantSpawnAdButton from '@/components/atoms/InstantSpawnAdButton.vue'
import DamageBuffAdButton from '@/components/atoms/DamageBuffAdButton.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'
import TutorialOverlay from '@/components/organisms/TutorialOverlay.vue'
import UnitCodexModal from '@/components/organisms/UnitCodexModal.vue'
import BattlePass from '@/components/organisms/BattlePass.vue'
import AchievementsButton from '@/components/organisms/AchievementsButton.vue'
import WelcomeBackModal from '@/components/organisms/WelcomeBackModal.vue'
import { achievementToast } from '@/use/useAchievements'
import { offlineGold } from '@/use/useOfflineEarnings'
import IconMovie from '@/components/icons/IconMovie.vue'
import { CHEST_EVERY_WAVES } from '@/use/useBattle'
import { nextArchetypeUnlock } from '@/game/units'

const { t } = useI18n()
const game = usePrismGame()
const battle = useBattle()
const { addCoins } = useEpicConfig()
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
const nextUndiscovered = computed(() => game.maxTier.value < 10 ? game.maxTier.value + 1 : 0)

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
  isMobileLandscape.value || (windowWidth.value > windowHeight.value && windowHeight.value < 620)
)

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
// quarter (full circle = the buffed 1-tap state or a completed meter).
const spawnReveal = computed(() => {
  if (game.instantSpawnActive.value) return '360deg'
  return `${(game.spawnClicks.value / game.clicksRequired.value) * 360}deg`
})

// On narrow portrait viewports the utility stack (mute + settings) shares its
// corner with the spawn row — lift it above the row so nothing overlaps. The
// width check catches narrow desktop windows/emulation, not just mobile UAs.
const utilityLifted = computed(() =>
  isMobilePortrait.value || (windowWidth.value < 640 && windowWidth.value < windowHeight.value)
)
const utilityBottom = computed(() =>
  `calc(${utilityLifted.value ? '4.4rem' : '0.4rem'} + env(safe-area-inset-bottom, 0px))`
)

// Left utility stack (campaign / achievements / codex). On the side-by-side
// landscape layout it moves to the CONTROLS half: anchored at the column's
// left edge (arena is the left 54%), lifted above the Instant Spawn button —
// mirroring the mute/settings stack above 2× Damage on the right edge. On
// stacked layouts it stays bottom-left of the screen.
const leftStackStyle = computed<Record<string, string>>(() => sideBySide.value
  ? {
      bottom: 'calc(4.4rem + env(safe-area-inset-bottom, 0px))',
      left: 'calc(54% + 0.4rem + env(safe-area-inset-left, 0px))'
    }
  : {
      bottom: utilityBottom.value,
      left: 'calc(0.4rem + env(safe-area-inset-left, 0px))'
    })

// ─── Deploy drops (grid → arena) ──────────────────────────────────────────────
const onDeploy = (p: { idx: number; tier: number; x: number; y: number }): void => {
  const r = zoneRect('arena')
  if (!r || r.width === 0 || r.height === 0) return
  const nx = ((p.x - r.left) / r.width) * 100
  const ny = ((p.y - r.top) / r.height) * 100

  // Dropped onto a same-tier fighter → field merge (tier+1, full heal).
  const under = battle.fighterAt(nx, ny)
  if (under && under.tier === p.tier && p.tier < 10) {
    const tier = game.takeFromGrid(p.idx)
    if (tier > 0) battle.fieldMerge(under.id, tier)
    return
  }

  if (battle.armyFull.value) {
    playSound('army-full', 0.015) // no room — merge into a fighter instead
    return
  }
  const tier = game.takeFromGrid(p.idx)
  // Fighters hold the left half; clamp the drop into friendly territory.
  if (tier > 0) battle.deployFighter(tier, Math.min(nx, 58), ny)
}

// ─── Boss bounty 2× rewarded offer (roadmap #9 — 6 s non-blocking chip) ──────
const bossOffer = ref<number | null>(null)
let bossOfferTimer = 0
const BOSS_OFFER_MS = 6000
const onBossKill = (bounty: number, first: boolean): void => {
  // The first-ever boss kill also spotlights the War Chest button (#2).
  if (first) {
    warChestPulse.value = true
    window.clearTimeout(warChestPulseTimer)
    warChestPulseTimer = window.setTimeout(() => { warChestPulse.value = false }, 8000)
  }
  if (!isRewardedReady.value || bounty <= 0) return
  bossOffer.value = bounty
  window.clearTimeout(bossOfferTimer)
  bossOfferTimer = window.setTimeout(() => { bossOffer.value = null }, BOSS_OFFER_MS)
}

// ─── Milestone chest (roadmap #4): free high-tier unit onto the grid ─────────
const onMilestone = (wave: number): void => {
  const tier = Math.max(2, Math.min(game.maxTier.value - 1, 2 + Math.floor(wave / 10)))
  if (game.spawnUnitAt(tier) < 0 && !battle.armyFull.value) {
    battle.deployFighter(tier) // grid full → straight to the front line
  }
}
const onDoubleBounty = async (): Promise<void> => {
  const bounty = bossOffer.value
  bossOffer.value = null
  window.clearTimeout(bossOfferTimer)
  if (!bounty) return
  const ok = await showRewardedAd()
  if (ok) {
    addCoins(bounty)
    flyGold(bounty)
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
watch(achievementToast, (v) => {
  if (!v) return
  achToast.value = v.id
  playSound('reward-continue', 0.04)
  window.clearTimeout(achToastTimer)
  achToastTimer = window.setTimeout(() => { achToast.value = null }, 3200)
})

onUnmounted(() => {
  stopBattleMusic()
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
    Teleport(to="body")
      div.fixed.top-0.left-0.right-0.flex.items-center.justify-between(
        class="px-2 py-1 z-[55]"
        :style="{\
          paddingTop: 'calc(0.4rem + env(safe-area-inset-top, 0px))',\
          paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
          paddingRight: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        //- Wave badge (+ next-chest / new-enemy pips, roadmap #4)
        div.flex.flex-col.items-start(class="gap-0.5")
          div.relative
            div.absolute.inset-0.translate-y-1.rounded-xl(class="bg-[#7a1c1c]")
            div.relative.flex.items-center.gap-2.rounded-xl.border-2.px-3(
              class="py-1.5 bg-gradient-to-b from-[#ff7a4d] to-[#d43a1f] border-[#0f1a30]"
            )
              svg(viewBox="0 0 24 24" class="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round")
                path(d="M5 21 L5 4 L13 4 L12 7 L19 7 L19 14 L11 14 L12 11 L5 11")
              span.text-white.font-black.game-text(class="text-xs sm:text-base") {{ t('battle.wave', { n: battle.wave.value }) }}
              span.text-yellow-200.font-black.game-text(class="text-[10px] sm:text-sm opacity-90") {{ t('battle.best', { n: battle.bestWave.value }) }}
          div.flex.gap-2.px-1
            span.game-text.font-black.text-yellow-200.drop-shadow(class="text-[9px] sm:text-[11px]") {{ t('battle.nextChest', { n: nextChestWave }) }}
            span.game-text.font-black.text-red-300.drop-shadow(v-if="nextEnemyWave" class="text-[9px] sm:text-[11px]") {{ t('battle.newEnemyAt', { n: nextEnemyWave }) }}
        //- Gold counter
        CoinBadge(ref="coinBadgeRef")

    //- ── Main content (column on portrait, row on landscape) ───────────────
    div.absolute.inset-0.flex.min-h-0(
      :class="sideBySide ? 'flex-row' : 'flex-col'"
      :style="{\
        paddingTop: 'calc(3.4rem + env(safe-area-inset-top, 0px))',\
        paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',\
        paddingLeft: 'calc(0.4rem + env(safe-area-inset-left, 0px))',\
        paddingRight: 'calc(0.4rem + env(safe-area-inset-right, 0px))'\
      }"
    )
      //- ── Battle arena ──
      div.arena-area.relative.flex.items-stretch.justify-center.min-h-0(
        data-tut="arena"
        :class="sideBySide ? 'flex-1 h-full' : 'w-full'"
        :style="sideBySide ? {} : { flex: '1.25 1 0%' }"
      )
        BattleArena(:coin-target="coinBadgeEl" @boss-kill="onBossKill" @milestone="onMilestone")

      //- ── Controls (upgrades + grid + spawn) ──
      div.controls-area.flex.flex-col.min-h-0(
        :class="sideBySide ? 'w-[46%] h-full' : 'w-full'"
        :style="sideBySide ? {} : { flex: '1 1 0%' }"
      )
        //- Upgrade controls
        div.shrink-0.w-full.max-w-md.mx-auto(class="h-[15%] min-h-14 mb-1 mt-1")
          UpgradePanel
        //- Merge grid — square that always fits the available box (height-led
        //- so it never overflows under the Spawn button on short viewports).
        div.grid-square-wrap.flex-1.min-h-0.w-full.mx-auto.flex.items-center.justify-center
          div.grid-square(data-tut="grid")
            MergeGrid(ref="gridRef" @deploy="onDeploy")
        //- Spawn row: [rewarded Instant Spawn] [Spawn button] [rewarded 2× Damage]
        div.shrink-0.w-full.max-w-md.mx-auto.flex.items-center.justify-center.gap-2.mt-1
          InstantSpawnAdButton
          button.relative.cursor-pointer.transition-transform(
            data-tut="spawn"
            class="active:scale-95 hover:scale-[101%]"
            @click="onSpawn"
          )
            div.absolute.inset-0.translate-y-1.rounded-xl(:class="game.instantSpawnActive.value ? 'bg-[#7a5a00]' : 'bg-[#1c6b2a]'")
            div.relative.flex.items-center.justify-center.gap-2.rounded-xl.border-2.py-2.px-5(
              :class="game.instantSpawnActive.value\
                ? 'bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]'\
                : 'bg-gradient-to-b from-[#4fd16a] to-[#27a03f] border-[#0f1a30]'"
            )
              //- Next recruit (tier follows the Recruits upgrade), revealed
              //- radially tap by tap (grey → full color)
              div.spawn-icon.relative.shrink-0(class="w-6 h-6 sm:w-7 sm:h-7" :class="{ 'spawn-pop': spawnFlash }")
                div.absolute.inset-0.spawn-icon-grey
                  IngredientUnit(:tier="game.recruitTier.value" :still="true")
                div.absolute.inset-0.spawn-icon-reveal(:style="{ '--spawn-reveal': spawnReveal }")
                  IngredientUnit(:tier="game.recruitTier.value" :still="true")
              span.text-white.font-black.uppercase.game-text(class="text-sm sm:text-base") {{ t('prism.spawn') }}
          //- 2× Damage rewarded buff (tap progress lives in the spawn icon's
          //- radial reveal, so this slot sells damage instead of a meter)
          DamageBuffAdButton(:pulse="warChestPulse")

    //- ── Bottom-left utility buttons (lifted above the spawn row on
    //-    narrow portrait phones so they never crowd the Spawn controls).
    //-    Only TWO buttons per stack — four in a column reached up into the
    //-    upgrade row on portrait; mute + settings live in the right-side
    //-    stack beside the merge grid instead. ─────────────────────────────
    div.absolute.z-30.flex.flex-col.items-start.gap-1(:style="leftStackStyle")
      //- War Campaign (free battle pass, roadmap #18)
      BattlePass(@coins-awarded="onBpCoins")
      //- Achievements (roadmap #10)
      AchievementsButton(@coins-awarded="onBpCoins")
      //- Unit Codex (roadmap #12) — the next undiscovered tier ghosts on the
      //- button as a silhouette: pure "one more merge" bait.
      button.cursor-pointer.transition-transform(
        class="active:scale-90 hover:scale-[103%]"
        :aria-label="t('battle.codex.title')"
        @click="showCodex = true"
      )
        div.relative
          div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#7a4a10]")
          div.relative.rounded-lg.border-2.flex.items-center.justify-center(
            class="p-1.5 sm:p-2 bg-gradient-to-b from-[#ffb054] to-[#e07818] border-[#0f1a30]"
          )
            svg(viewBox="0 0 24 24" class="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round")
              path(d="M4 19.5 A2.5 2.5 0 0 1 6.5 17 H20 V3 H6.5 A2.5 2.5 0 0 0 4 5.5 Z")
              path(d="M4 19.5 A2.5 2.5 0 0 0 6.5 22 H20 V17")
          div.absolute.codex-ghost(v-if="nextUndiscovered" class="-top-1.5 -right-1.5 w-5 h-5")
            IngredientUnit(:tier="nextUndiscovered" :still="true")

    //- ── Right of the merge grid: mute + settings (always lifted above the
    //-    spawn row — its right edge reaches the corner on landscape) ────────
    div.absolute.z-30.flex.flex-col.items-end.gap-1(
      :style="{\
        bottom: 'calc(4.4rem + env(safe-area-inset-bottom, 0px))',\
        right: 'calc(0.4rem + env(safe-area-inset-right, 0px))'\
      }"
    )
      FMuteButton
      button.cursor-pointer.transition-transform(
        class="active:scale-90 hover:scale-[103%] scale-90 sm:scale-100"
        @click="showOptions = true"
      )
        div.relative
          div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#102e7a]")
          div.relative.rounded-lg.border-2.flex.items-center.justify-center.p-2(
            class="bg-gradient-to-b from-[#50aaff] to-[#2266ff] border-[#0f1a30]"
          )
            svg(viewBox="0 0 24 24" class="w-6 h-6 text-white" fill="currentColor")
              path(d="M12 4 a1 1 0 0 1 1 1 v1.6 a6 6 0 0 1 1.8 0.7 l1.1 -1.1 a1 1 0 0 1 1.4 1.4 l -1.1 1.1 a6 6 0 0 1 0.7 1.8 H18 a1 1 0 1 1 0 2 h-1.6 a6 6 0 0 1 -0.7 1.8 l1.1 1.1 a1 1 0 0 1 -1.4 1.4 l-1.1 -1.1 a6 6 0 0 1 -1.8 0.7 V18 a1 1 0 1 1 -2 0 v -1.6 a6 6 0 0 1 -1.8 -0.7 l-1.1 1.1 a1 1 0 0 1 -1.4 -1.4 l1.1 -1.1 a6 6 0 0 1 -0.7 -1.8 H6 a1 1 0 1 1 0 -2 h1.6 a6 6 0 0 1 0.7 -1.8 L7.2 7.6 a1 1 0 0 1 1.4 -1.4 l1.1 1.1 a6 6 0 0 1 1.8 -0.7 V5 a1 1 0 0 1 1 -1 Z M12 9 a3 3 0 1 0 0 6 a3 3 0 0 0 0 -6 Z")

    //- ── 2× boss bounty — 6 s non-blocking offer chip (roadmap #9) ─────────
    Transition(name="chip")
      div.absolute.left-0.right-0.flex.justify-center.pointer-events-none(
        v-if="bossOffer"
        class="z-[60]"
        :style="{ top: 'calc(4.6rem + env(safe-area-inset-top, 0px))' }"
      )
        button.boss-chip.pointer-events-auto.cursor-pointer.flex.items-center.gap-2.rounded-xl.border-2.px-3.py-2(
          class="bg-gradient-to-b from-emerald-400 to-emerald-700 border-emerald-200 active:scale-95 transition-transform"
          @click="onDoubleBounty"
        )
          IconMovie(class="w-6 h-6 shrink-0")
          div.flex.flex-col.items-start
            span.text-white.font-black.uppercase.game-text(class="text-xs sm:text-sm leading-none") {{ t('battle.doubleBounty') }}
            span.text-emerald-100.font-black.game-text(class="text-[11px] sm:text-sm") +{{ bossOffer }}
          //- Draining bar mirrors the 6 s window
          div.boss-chip-timer.absolute.bottom-0.left-1.right-1.rounded-full(class="h-0.5")

    //- ── Achievement unlock toast (roadmap #10) ────────────────────────────
    Transition(name="chip")
      div.absolute.left-0.right-0.flex.justify-center.pointer-events-none(
        v-if="achToast"
        class="z-[59]"
        :style="{ top: 'calc(7.4rem + env(safe-area-inset-top, 0px))' }"
      )
        div.flex.items-center.gap-2.rounded-xl.border-2.px-3.py-2(
          class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30] shadow-2xl"
        )
          svg(viewBox="0 0 24 24" class="w-5 h-5 shrink-0" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round")
            path(d="M7 4 h10 v3 a5 5 0 0 1 -10 0 Z")
            path(d="M7 5 H4 v1 a3 3 0 0 0 3 3")
            path(d="M17 5 h3 v1 a3 3 0 0 1 -3 3")
            path(d="M12 12 v4")
            path(d="M9 20 h6 l-1 -4 h-4 Z")
          div.flex.flex-col.items-start
            span.text-white.font-black.uppercase.game-text(class="text-[9px] sm:text-[10px] leading-none opacity-90") {{ t('achievements.unlocked') }}
            span.text-white.font-black.game-text(class="text-xs sm:text-sm") {{ t('achievements.items.' + achToast + '.name') }}

    //- ── Overlays ──────────────────────────────────────────────────────────
    ParticleCanvas
    TutorialOverlay

    UnitCodexModal(v-model="showCodex")
    WelcomeBackModal(v-model="showWelcomeBack" :coin-target="coinBadgeEl")
    OptionsModal(:is-open="showOptions" @close="showOptions = false")
</template>

<style scoped lang="sass">
.prism-scene
  background: radial-gradient(ellipse at 50% 38%, #1c2742 0%, #0c1120 55%, #070a14 100%)
  background-color: #070a14

// Largest square that fits the available box, in BOTH orientations — uses
// container-query units so the grid never overflows under the Spawn button on
// short viewports nor past the column edge in landscape.
.grid-square-wrap
  container-type: size
.grid-square
  width: min(100cqw, 100cqh)
  height: min(100cqw, 100cqh)

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

// ── 2× boss bounty chip (roadmap #9) ──
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
