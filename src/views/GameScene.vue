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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import usePrismGame from '@/use/usePrismGame'
import useBattle from '@/use/useBattle'
import useSounds, { useMusic } from '@/use/useSound'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import useEpicConfig from '@/use/useEpicConfig'
import useScreenshake from '@/use/useScreenshake'
import { zoneRect } from '@/use/useDropZones'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import { isMobileLandscape, windowWidth, windowHeight } from '@/use/useUser'

import MergeGrid from '@/components/organisms/MergeGrid.vue'
import BattleArena from '@/components/organisms/BattleArena.vue'
import UpgradePanel from '@/components/organisms/UpgradePanel.vue'
import ParticleCanvas from '@/components/organisms/ParticleCanvas.vue'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'
import IconMovie from '@/components/icons/IconMovie.vue'

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

// Side-by-side (arena | controls) layout whenever the viewport is wide-and-short —
// covers mobile landscape AND a short desktop/tablet landscape window, where a
// stacked column would crush the merge grid to nothing.
const sideBySide = computed(() =>
  isMobileLandscape.value || (windowWidth.value > windowHeight.value && windowHeight.value < 620)
)

// ─── Spawn ──────────────────────────────────────────────────────────────────
const onSpawn = (): void => { gridRef.value?.spawn() }
const spawnLabel = computed(() =>
  game.spawnCharges.value > 0 ? t('prism.spawn') : t('prism.spawnCost', { n: game.spawnCostGold.value })
)

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
    playSound('obstacle-hit', 0.015) // no room — merge into a fighter instead
    return
  }
  const tier = game.takeFromGrid(p.idx)
  // Fighters hold the left half; clamp the drop into friendly territory.
  if (tier > 0) battle.deployFighter(tier, Math.min(nx, 58), ny)
}

// ─── Boss bounty 2× rewarded offer ───────────────────────────────────────────
const bossOffer = ref<number | null>(null)
let bossOfferTimer = 0
const onBossKill = (bounty: number): void => {
  if (!isRewardedReady.value || bounty <= 0) return
  bossOffer.value = bounty
  window.clearTimeout(bossOfferTimer)
  bossOfferTimer = window.setTimeout(() => { bossOffer.value = null }, 9000)
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

// ─── Free-gold "war chest" rewarded placement ─────────────────────────────────
const freeGoldBusy = ref(false)
const warChestGold = computed(() => Math.round(400 * (1 + battle.wave.value * 0.12)))
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
const onFreeGold = async (): Promise<void> => {
  if (freeGoldBusy.value) return
  freeGoldBusy.value = true
  try {
    const ok = await showRewardedAd()
    if (ok) {
      const reward = warChestGold.value
      addCoins(reward)
      flyGold(reward)
      playSound('coin-pickup', 0.05)
    }
  } finally {
    freeGoldBusy.value = false
  }
}

onMounted(() => {
  startBattleMusic()
})
onUnmounted(() => {
  stopBattleMusic()
  window.clearTimeout(bossOfferTimer)
})
</script>

<template lang="pug">
  div.prism-scene.relative.w-screen.overflow-hidden(class="h-screen h-dvh" :style="shakeStyle")
    //- ── Top bar ──────────────────────────────────────────────────────────
    div.absolute.top-0.left-0.right-0.z-30.flex.items-center.justify-between(
      class="px-2 py-1"
      :style="{\
        paddingTop: 'calc(0.4rem + env(safe-area-inset-top, 0px))',\
        paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
        paddingRight: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
      }"
    )
      //- Wave badge
      div.relative
        div.absolute.inset-0.translate-y-1.rounded-xl(class="bg-[#7a1c1c]")
        div.relative.flex.items-center.gap-2.rounded-xl.border-2.px-3(
          class="py-1.5 bg-gradient-to-b from-[#ff7a4d] to-[#d43a1f] border-[#0f1a30]"
        )
          svg(viewBox="0 0 24 24" class="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round")
            path(d="M5 21 L5 4 L13 4 L12 7 L19 7 L19 14 L11 14 L12 11 L5 11")
          span.text-white.font-black.game-text(class="text-xs sm:text-base") {{ t('battle.wave', { n: battle.wave.value }) }}
          span.text-yellow-200.font-black.game-text(class="text-[10px] sm:text-sm opacity-90") {{ t('battle.best', { n: battle.bestWave.value }) }}
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
        :class="sideBySide ? 'flex-1 h-full' : 'w-full'"
        :style="sideBySide ? {} : { flex: '1.25 1 0%' }"
      )
        BattleArena(:coin-target="coinBadgeEl" @boss-kill="onBossKill")

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
          div.grid-square
            MergeGrid(ref="gridRef" @deploy="onDeploy")
        //- Spawn button
        div.shrink-0.w-full.max-w-md.mx-auto.flex.items-center.justify-center.gap-2.mt-1
          button.relative.cursor-pointer.transition-transform.flex-1.max-w-xs(
            class="active:scale-95 hover:scale-[101%]"
            @click="onSpawn"
          )
            div.absolute.inset-0.translate-y-1.rounded-xl(class="bg-[#1c6b2a]")
            div.relative.flex.items-center.justify-center.gap-2.rounded-xl.border-2.py-2(
              class="bg-gradient-to-b from-[#4fd16a] to-[#27a03f] border-[#0f1a30]"
            )
              svg(viewBox="0 0 24 24" class="w-5 h-5 text-white" fill="currentColor")
                path(d="M12 3 v18 M3 12 h18" stroke="#0a0d16" stroke-width="2" stroke-linecap="round")
              span.text-white.font-black.uppercase.game-text(class="text-sm sm:text-base") {{ spawnLabel }}
          //- Spawn charge meter
          div.flex.flex-col.items-center(class="gap-0.5")
            div.flex(class="gap-0.5")
              span.charge-pip(
                v-for="i in game.spawnMax"
                :key="i"
                :class="i <= game.spawnCharges.value ? 'charge-on' : ''"
              )

    //- ── Bottom-left utility buttons ───────────────────────────────────────
    div.absolute.z-30.flex.flex-col.items-start.gap-1(
      :style="{\
        bottom: 'calc(0.4rem + env(safe-area-inset-bottom, 0px))',\
        left: 'calc(0.4rem + env(safe-area-inset-left, 0px))'\
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

    //- ── Bottom-right: war-chest rewarded button ───────────────────────────
    div.absolute.z-30(
      v-if="isRewardedReady"
      :style="{\
        bottom: 'calc(0.4rem + env(safe-area-inset-bottom, 0px))',\
        right: 'calc(0.4rem + env(safe-area-inset-right, 0px))'\
      }"
    )
      button.cursor-pointer.transition-transform(
        class="active:scale-90 hover:scale-[103%] scale-90 sm:scale-100 disabled:opacity-50"
        :disabled="freeGoldBusy"
        @click="onFreeGold"
      )
        div.relative
          div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#7a5a00]")
          div.relative.flex.items-center.gap-1.rounded-lg.border-2.px-2.py-2(
            class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]"
          )
            IconMovie(class="w-5 h-5 text-white shrink-0")
            span.text-white.font-black.uppercase.game-text(class="text-[10px] sm:text-xs") {{ t('prism.freeGold') }}

    //- ── 2× boss bounty prompt ─────────────────────────────────────────────
    Transition(name="fade")
      div.fixed.inset-0.flex.items-center.justify-center.backdrop-blur-md.p-4(
        v-if="bossOffer"
        class="z-[118] bg-black/70"
      )
        div.flex.flex-col.items-center.gap-3.rounded-2xl.border-2.px-6.py-5.max-w-sm(
          class="bg-gradient-to-b from-[#1a1f3a] to-[#0a0e22] border-yellow-300"
        )
          div.font-black.uppercase.game-text.text-yellow-300.text-center(class="text-xl sm:text-2xl") {{ t('battle.doubleBounty') }}
          button.cursor-pointer.transition-transform.flex.items-center.gap-2.w-full.justify-center.rounded-lg.border-2.px-4.py-2(
            class="bg-gradient-to-b from-emerald-400 to-emerald-700 border-emerald-200 text-white font-black uppercase game-text active:scale-95"
            @click="onDoubleBounty"
          )
            IconMovie(class="w-5 h-5")
            span +{{ bossOffer }}
          button.cursor-pointer.game-text(class="text-white/70 text-sm" @click="bossOffer = null") {{ t('close') }}

    //- ── Overlays ──────────────────────────────────────────────────────────
    ParticleCanvas

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

.charge-pip
  width: 0.5rem
  height: 0.5rem
  border-radius: 2px
  background: rgba(255, 255, 255, 0.15)
  transition: background 0.2s ease
.charge-on
  background: #4fd16a
  box-shadow: 0 0 5px rgba(79, 209, 106, 0.8)

.fade-enter-active, .fade-leave-active
  transition: opacity 0.3s ease
.fade-enter-from, .fade-leave-to
  opacity: 0
</style>
