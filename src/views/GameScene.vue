<script setup lang="ts">
/**
 * Merge Alchemy Lab — the single game scene. Boots straight into the lab (no
 * main menu, per the brief). Composes the GDD §7.2 wireframe:
 *
 *   ┌ Top bar — Index button + Gold counter
 *   ├ Lab visualiser — injection lanes, emotive cauldron, heat gauge, buffs
 *   ├ Upgrade controls — Heat / Pressure / Containment / Imp
 *   └ Interaction grid — drag-to-merge units + the Spawn button
 *
 * Fully responsive (portrait / landscape / tablet / desktop) on vw/vh + flex
 * with safe-area insets. This file orchestrates: the inject gravity-slide, the
 * brew-outcome reveal/toast split, gold fly-to VFX, the rewarded "free gold"
 * and 2×-on-discovery placements, ambient music, and the Index/Options modals.
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

import usePrismGame, { CAULDRON_CAPACITY, buffs } from '@/use/usePrismGame'
import { getIngredient } from '@/game/ingredients'
import { PAGES, TOTAL_RECIPES, type BottleShape } from '@/game/recipes'
import useEpicConfig from '@/use/useEpicConfig'
import useSounds, { useMusic } from '@/use/useSound'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import { emitSplash, emitSparkle } from '@/use/usePrismParticles'
import { registerDropZone, unregisterDropZone, zoneRect } from '@/use/useDropZones'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import { isMobileLandscape, windowWidth, windowHeight } from '@/use/useUser'

import MergeGrid from '@/components/organisms/MergeGrid.vue'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'
import Cauldron from '@/components/organisms/Cauldron.vue'
import InjectionLanes from '@/components/organisms/InjectionLanes.vue'
import UpgradePanel from '@/components/organisms/UpgradePanel.vue'
import IndexBookModal from '@/components/organisms/IndexBookModal.vue'
import PotionRevealOverlay from '@/components/organisms/PotionRevealOverlay.vue'
import PotionBottle from '@/components/organisms/PotionBottle.vue'
import ParticleCanvas from '@/components/organisms/ParticleCanvas.vue'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'
import IconMovie from '@/components/icons/IconMovie.vue'
import type { BrewOutcome } from '@/use/usePrismGame'

const { t } = useI18n()
const game = usePrismGame()
const { addCoins } = useEpicConfig()
const { playSound } = useSounds()
const { startBattleMusic, stopBattleMusic } = useMusic()

// ─── Refs ─────────────────────────────────────────────────────────────────
const gridRef = ref<InstanceType<typeof MergeGrid> | null>(null)
const labRef = ref<HTMLElement | null>(null)
const coinBadgeRef = ref<InstanceType<typeof CoinBadge> | null>(null)
const coinBadgeEl = computed<HTMLElement | null>(() => coinBadgeRef.value?.rootEl ?? null)

const showIndex = ref(false)
const showOptions = ref(false)

// Side-by-side (lab | controls) layout whenever the viewport is wide-and-short —
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

// ─── Inject gravity-slide ghosts (GDD §3.3) ───────────────────────────────────
interface Ghost { id: number; tier: number; x: number; y: number; flying: boolean }
const ghosts = ref<Ghost[]>([])
let ghostSeq = 0

const onInject = (p: { tier: number; fromX: number; fromY: number }): void => {
  const r = zoneRect('cauldron')
  const tx = r ? r.left + r.width / 2 : p.fromX
  const ty = r ? r.top + r.height * 0.42 : p.fromY
  const id = ++ghostSeq
  ghosts.value.push({ id, tier: p.tier, x: p.fromX, y: p.fromY, flying: false })
  nextTick(() => {
    const g = ghosts.value.find((x) => x.id === id)
    if (g) { g.x = tx; g.y = ty; g.flying = true }
  })
  window.setTimeout(() => {
    emitSplash(tx, ty, getIngredient(p.tier).glow)
    ghosts.value = ghosts.value.filter((x) => x.id !== id)
  }, 440)
}

// ─── Brew outcome handling (reveal vs lightweight toast) ──────────────────────
interface Toast { id: number; tier?: number; bottle?: BottleShape; liquid?: string; text: string; sludge?: boolean }
const toasts = ref<Toast[]>([])
let toastSeq = 0
const revealOutcome = ref<BrewOutcome | null>(null)
const showReveal = ref(false)
const twoXOffer = ref<BrewOutcome | null>(null)

const flyGoldFromLab = (gold: number): void => {
  if (gold <= 0 || !labRef.value || !coinBadgeEl.value) return
  spawnCoinExplosion({
    sourceEl: labRef.value,
    targetEl: coinBadgeEl.value,
    count: Math.min(40, 10 + Math.round(gold / 50))
  })
}

const pushToast = (o: BrewOutcome): void => {
  const id = ++toastSeq
  const t0: Toast = o.recipe
    ? { id, bottle: o.recipe.bottle, liquid: o.recipe.liquid, text: `+${o.gold}` }
    : (o.kind === 'sub'
      ? { id, bottle: 'flask', liquid: '#7a86a0', text: `+${o.gold}` }
      : { id, text: t('prism.toast.sludge'), sludge: true })
  toasts.value.push(t0)
  window.setTimeout(() => { toasts.value = toasts.value.filter((x) => x.id !== id) }, 1400)
}

watch(game.brewOutcome, (o) => {
  if (!o) return
  // Always fly the gold to the wallet.
  flyGoldFromLab(o.gold)

  if (o.kind === 'legendary') {
    playSound('celebration-3', 0.09)
    playSound('happy', 0.06)
  } else if (o.kind === 'sludge') {
    playSound('lose', 0.06)
  } else {
    playSound('happy', 0.06)
  }

  // Noteworthy brews (new discovery or legendary) → full reveal overlay.
  if (o.isNew || o.kind === 'legendary') {
    revealOutcome.value = o
    showReveal.value = true
  } else {
    pushToast(o)
  }
})

const onRevealCollect = (): void => {
  const o = revealOutcome.value
  showReveal.value = false
  playSound('plastic-torn-1', 0.06) // sticker slap
  // Sparkle on the Index button as the sticker lands home.
  const btn = document.getElementById('prism-index-btn')
  if (btn) {
    const r = btn.getBoundingClientRect()
    emitSparkle(r.left + r.width / 2, r.top + r.height / 2, '#ffe27a', 10)
  }
  // Offer a 2× rewarded boost on a fresh discovery's gold.
  if (o && o.gold > 0 && isRewardedReady.value) twoXOffer.value = o
  else revealOutcome.value = null
}

const onTwoX = async (): Promise<void> => {
  const o = twoXOffer.value
  twoXOffer.value = null
  if (!o) return
  const ok = await showRewardedAd()
  if (ok) {
    addCoins(o.gold)
    flyGoldFromLab(o.gold)
    playSound('coin-pickup', 0.05)
  }
  revealOutcome.value = null
}
const skipTwoX = (): void => { twoXOffer.value = null; revealOutcome.value = null }

// ─── Page-completion celebration ──────────────────────────────────────────────
const pageBanner = ref<string | null>(null)
watch(game.pageComplete, (pc) => {
  if (!pc) return
  const page = PAGES.find((p) => p.id === pc.pageId)
  if (!page) return
  playSound('win', 0.07)
  pageBanner.value = t('prism.toast.pageComplete', { title: page.title })
  window.setTimeout(() => { pageBanner.value = null }, 2600)
})

// ─── Free-gold rewarded placement ─────────────────────────────────────────────
const freeGoldBusy = ref(false)
const FREE_GOLD_BASE = 400
const onFreeGold = async (): Promise<void> => {
  if (freeGoldBusy.value) return
  freeGoldBusy.value = true
  try {
    const ok = await showRewardedAd()
    if (ok) {
      const reward = Math.round(FREE_GOLD_BASE * game.goldMultTotal.value)
      addCoins(reward)
      flyGoldFromLab(reward)
      playSound('coin-pickup', 0.05)
    }
  } finally {
    freeGoldBusy.value = false
  }
}

// ─── Active buffs banner ──────────────────────────────────────────────────────
const tickNow = ref(Date.now())
let buffTimer = 0
// Recomputes every tick (tickNow dependency) so the countdown is live and an
// expired buff drops off the moment its `until` passes.
const buffPills = computed(() => {
  const now = tickNow.value
  const kinds = ['goldMult', 'spawnSpeed', 'autoBoost'] as const
  const out: { kind: string; label: string; secs: number }[] = []
  for (const k of kinds) {
    const b = buffs.value[k]
    if (b && b.until > now) {
      out.push({
        kind: k,
        label: k === 'goldMult' ? t('prism.buffs.goldMult', { n: b.mult }) : t('prism.buffs.' + k),
        secs: Math.ceil((b.until - now) / 1000)
      })
    }
  }
  return out
})

// Brew synthesis progress ring fraction.
const brewPct = computed(() => Math.round(game.brewFraction.value * 100))
const cauldronCount = computed(() => game.cauldron.value.length)

onMounted(() => {
  registerDropZone('labdrop', () => labRef.value?.getBoundingClientRect() ?? null)
  startBattleMusic()
  buffTimer = window.setInterval(() => { tickNow.value = Date.now() }, 500)
})
onUnmounted(() => {
  unregisterDropZone('labdrop')
  stopBattleMusic()
  clearInterval(buffTimer)
})
</script>

<template lang="pug">
  div.prism-scene.relative.w-screen.overflow-hidden(class="h-screen h-dvh")
    //- ── Top bar ──────────────────────────────────────────────────────────
    div.absolute.top-0.left-0.right-0.z-30.flex.items-center.justify-between(
      class="px-2 py-1"
      :style="{\
        paddingTop: 'calc(0.4rem + env(safe-area-inset-top, 0px))',\
        paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
        paddingRight: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
      }"
    )
      //- Index book button
      button#prism-index-btn.relative.cursor-pointer.transition-transform(
        class="active:scale-90 hover:scale-[103%]"
        @click="showIndex = true"
      )
        div.relative
          div.absolute.inset-0.translate-y-1.rounded-xl(class="bg-[#102e7a]")
          div.relative.flex.items-center.gap-2.rounded-xl.border-2.px-3(
            class="py-1.5 bg-gradient-to-b from-[#50aaff] to-[#2266ff] border-[#0f1a30]"
          )
            svg(viewBox="0 0 24 24" class="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor")
              path(d="M4 4 h7 a2 2 0 0 1 2 2 v14 a3 3 0 0 0 -3 -2 H4 Z M20 4 h-7 a2 2 0 0 0 -2 2 v14 a3 3 0 0 1 3 -2 h6 Z" stroke="#0a0d16" stroke-width="0.8")
            span.text-white.font-black.game-text(class="text-xs sm:text-base") {{ t('prism.index.title') }}
            span.text-yellow-200.font-black.game-text(class="text-xs sm:text-base") {{ game.discoveredCount.value }}/{{ TOTAL_RECIPES }}
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
      //- ── Lab visualiser ──
      div.lab-area.relative.flex.items-stretch.justify-center.min-h-0(
        ref="labRef"
        :class="sideBySide ? 'flex-1 h-full' : 'w-full'"
        :style="sideBySide ? {} : { flex: '1.25 1 0%' }"
      )
        //- Heat thermometer gauge (GDD §6.1)
        div.absolute.left-1.bottom-2.z-10.flex.flex-col.items-center.gap-1(class="top-2")
          div.thermo.relative.rounded-full.overflow-hidden(class="w-2.5 sm:w-3 flex-1 border-2 border-[#0f1a30] bg-[#0a0d16]")
            div.thermo-fill.absolute.bottom-0.left-0.right-0(
              :style="{ height: Math.min(100, game.upgradeLevel('heat') / 25 * 100) + '%' }"
            )
          div.rounded-full.border-2(class="w-4 h-4 sm:w-5 sm:h-5 border-[#0f1a30]" style="background: radial-gradient(circle at 35% 30%, #ff9a3c, #ff3d1f)")

        //- Buff pills (top-right of lab)
        div.absolute.right-1.top-1.z-10.flex.flex-col.items-end.gap-1
          div.flex.items-center.gap-1.rounded-full.border.px-2(
            v-for="b in buffPills"
            :key="b.kind"
            class="py-0.5 bg-black/45 border-yellow-300/40"
          )
            span.game-text.text-yellow-200.font-black(class="text-[9px] sm:text-[11px]") {{ b.label }}
            span.game-text(class="text-white/60 text-[8px] sm:text-[10px]") {{ b.secs }}s

        //- Lanes + cauldron stack
        div.flex.flex-col.items-center.justify-end.w-full.h-full.max-w-md.mx-auto(class="pb-1")
          div.w-full(class="h-[26%] max-h-28")
            InjectionLanes
          div.relative.w-full.flex.items-center.justify-center(class="h-[66%]")
            div.h-full(class="aspect-[10/9] max-h-full")
              Cauldron
            //- Capacity dots + brew progress
            div.absolute.left-0.right-0.flex.flex-col.items-center.gap-1(class="-bottom-1")
              div.flex.items-center(class="gap-1.5")
                span.cap-dot(
                  v-for="i in CAULDRON_CAPACITY"
                  :key="i"
                  :class="i <= cauldronCount ? 'cap-on' : ''"
                )
              div.rounded-full.overflow-hidden(class="w-2/3 h-1.5 bg-black/40" v-if="game.isBrewing.value")
                div.h-full.bg-orange-400(:style="{ width: brewPct + '%' }")

      //- ── Controls (upgrades + grid + spawn) ──
      div.controls-area.flex.flex-col.min-h-0(
        :class="sideBySide ? 'w-[46%] h-full' : 'w-full'"
        :style="sideBySide ? {} : { flex: '1 1 0%' }"
      )
        //- Upgrade controls
        div.shrink-0.w-full.max-w-md.mx-auto(class="h-[15%] min-h-14 mb-1")
          UpgradePanel
        //- Merge grid — square that always fits the available box (height-led
        //- so it never overflows under the Spawn button on short viewports).
        div.grid-square-wrap.flex-1.min-h-0.w-full.mx-auto.flex.items-center.justify-center
          div.grid-square
            MergeGrid(ref="gridRef" @inject="onInject")
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

    //- ── Bottom-right: free-gold rewarded button ───────────────────────────
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

    //- ── Page-complete banner ──────────────────────────────────────────────
    Transition(name="fade")
      div.absolute.left-0.right-0.flex.justify-center.z-40.pointer-events-none(
        v-if="pageBanner"
        class="top-[18%]"
      )
        div.rounded-2xl.border-2.px-5.py-2.font-black.uppercase.game-text.text-white.shadow-2xl(
          class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30] text-base sm:text-2xl animate-pulse"
        ) {{ pageBanner }}

    //- ── Inject gravity-slide ghosts (the falling unit, GDD §3.3) ───────────
    Teleport(to="body")
      div.fixed.pointer-events-none.ghost-fly(
        v-for="g in ghosts"
        :key="g.id"
        class="z-[70]"
        :style="{ left: g.x + 'px', top: g.y + 'px', width: '13vw', height: '13vw', maxWidth: '64px', maxHeight: '64px', transform: 'translate(-50%, -50%) scale(' + (g.flying ? 0.5 : 1) + ')', opacity: g.flying ? 0.8 : 1 }"
      )
        IngredientUnit(:tier="g.tier" :still="true")

    //- ── Lightweight brew toasts ───────────────────────────────────────────
    Teleport(to="body")
      div.fixed.pointer-events-none.flex.items-center.gap-1.toast-rise(
        v-for="tt in toasts"
        :key="tt.id"
        class="left-1/2 z-[75] bottom-[40%] -translate-x-1/2"
      )
        div(v-if="tt.bottle" class="w-10 h-12")
          PotionBottle(:shape="tt.bottle" :liquid="tt.liquid || '#fff'")
        span.font-black.game-text(
          :class="tt.sludge ? 'text-purple-300 text-sm' : 'text-yellow-300 text-lg'"
        ) {{ tt.text }}

    //- ── Overlays ──────────────────────────────────────────────────────────
    ParticleCanvas

    PotionRevealOverlay(:show="showReveal" :outcome="revealOutcome" @collect="onRevealCollect")

    //- 2× discovery reward prompt
    Transition(name="fade")
      div.fixed.inset-0.flex.items-center.justify-center.backdrop-blur-md.p-4(
        v-if="twoXOffer"
        class="z-[118] bg-black/70"
      )
        div.flex.flex-col.items-center.gap-3.rounded-2xl.border-2.px-6.py-5.max-w-sm(
          class="bg-gradient-to-b from-[#1a1f3a] to-[#0a0e22] border-yellow-300"
        )
          div.font-black.uppercase.game-text.text-yellow-300(class="text-xl sm:text-2xl") {{ t('prism.reveal.doubleYield') }}
          button.cursor-pointer.transition-transform.flex.items-center.gap-2.w-full.justify-center.rounded-lg.border-2.px-4.py-2(
            class="bg-gradient-to-b from-emerald-400 to-emerald-700 border-emerald-200 text-white font-black uppercase game-text active:scale-95"
            @click="onTwoX"
          )
            IconMovie(class="w-5 h-5")
            span +{{ twoXOffer.gold }}
          button.cursor-pointer.game-text(class="text-white/70 text-sm" @click="skipTwoX") {{ t('close') }}

    IndexBookModal(v-model="showIndex")
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

.thermo-fill
  background: linear-gradient(180deg, #ff6a2a 0%, #ff3d1f 100%)
  box-shadow: 0 0 8px rgba(255, 90, 30, 0.8)
  transition: height 0.3s ease

.cap-dot
  width: 0.7rem
  height: 0.7rem
  border-radius: 9999px
  border: 2px solid #0f1a30
  background: rgba(255, 255, 255, 0.18)
  transition: background 0.2s ease, transform 0.2s ease
.cap-on
  background: radial-gradient(circle at 35% 30%, #fff07a, #ffb13a)
  transform: scale(1.15)

.charge-pip
  width: 0.5rem
  height: 0.5rem
  border-radius: 2px
  background: rgba(255, 255, 255, 0.15)
  transition: background 0.2s ease
.charge-on
  background: #4fd16a
  box-shadow: 0 0 5px rgba(79, 209, 106, 0.8)

.ghost-fly
  transition: left 0.42s cubic-bezier(0.45, 0, 0.7, 1), top 0.42s cubic-bezier(0.6, 0.1, 0.9, 1), transform 0.42s ease, opacity 0.42s ease

.toast-rise
  animation: toast-rise 1.4s ease-out forwards
@keyframes toast-rise
  0%
    transform: translate(-50%, 10px)
    opacity: 0
  20%
    transform: translate(-50%, 0)
    opacity: 1
  100%
    transform: translate(-50%, -60px)
    opacity: 0

.fade-enter-active, .fade-leave-active
  transition: opacity 0.3s ease
.fade-enter-from, .fade-leave-to
  opacity: 0
</style>
