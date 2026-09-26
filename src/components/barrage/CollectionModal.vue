<script setup lang="ts">
/**
 * Collection — the cosmetic meta (casual contract rule 1: nothing here changes
 * power). Two tabs:
 *
 *   Launchers — all 50 elementals. A tier the player has never made is a dark
 *               silhouette (the "one more merge" tease); a seen one can be
 *               bought and selected as the launcher on the board.
 *   Ball Skins — elemental shells (stone, tide, frost, lava, gold…) framed by
 *               rarity. Each card is the real bake from the renderer, around
 *               the face of the player's best tier: what they see is exactly
 *               what will fly, on the balls they actually make. Every skin
 *               past stone is ad-only: its card shows a lock (and n/N for the
 *               multi-ad rarities) instead of a price, and the "▶ Unlock"
 *               button under it is the way in — always there, disabled while
 *               no rewarded ad can fill. Stone keeps its coin price with the
 *               same button beside it, shown only while an ad can fill. Coin-
 *               mode builds have no rewarded ads: every skin keeps its price.
 *
 * NEW badges: opening a tab marks its items seen at once (STATE's
 * `markLaunchersSeen` / `markSkinsSeen`), but the set that WAS new is snapshotted
 * first, so the badges stay up for this viewing instead of vanishing the moment
 * the list appears.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconMovie from '@/components/icons/IconMovie.vue'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import useCollections from '@/barrage/state/useCollections'
import type { BallSkinView, LauncherView } from '@/barrage/state/contract'
import { BALL_SKINS, type BallSkinId, type BallSkinRarity } from '@/barrage/ballSkins'
import { fighterSrc, ballColors, FIGHTER_ART_MAX } from '@/barrage/art'
import { ballPreview } from '@/barrage/render/balls'
import { maxBallTier } from '@/barrage/state/progress'
import useSounds from '@/use/useSound'
import { buffsCostCoins } from '@/use/useUser'
import { fmtCoins } from '@/components/barrage/barrageUi'
import { emitSparkle } from '@/use/usePrismParticles'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t, te } = useI18n()
const col = useCollections()
const { playSound } = useSounds()

type Tab = 'launchers' | 'skins'
const tab = ref<Tab>('launchers')

/** What was NEW when each tab was opened this time (null = not opened yet). */
const newLauncherTiers = ref<Set<number> | null>(null)
const newSkinIds = ref<Set<BallSkinId> | null>(null)

const openTab = (which: Tab): void => {
  if (which === 'launchers') {
    newLauncherTiers.value = new Set(col.launchers.value.filter((l) => l.isNew).map((l) => l.tier))
    col.markLaunchersSeen()
  } else {
    newSkinIds.value = new Set(col.skins.value.filter((s) => s.isNew).map((s) => s.id))
    col.markSkinsSeen()
  }
}
const setTab = (next: Tab): void => {
  tab.value = next
  openTab(next)
}
watch(() => props.modelValue, (open) => {
  if (open) {
    openTab(tab.value)
  } else {
    newLauncherTiers.value = null
    newSkinIds.value = null
  }
}, { immediate: true })

// ── Skin previews: the renderer's own bake, around the best tier's face ──
const previewTier = computed(() => Math.max(1, Math.min(FIGHTER_ART_MAX, maxBallTier.value)))
const PREVIEW_PX = Math.round(60 * Math.min(2, window.devicePixelRatio || 1))
const previews = ref<Partial<Record<BallSkinId, string>>>({})
let previewTimer = 0
const bakePreviews = (): void => {
  window.clearTimeout(previewTimer)
  const next = { ...previews.value }
  let missing = false
  for (const def of BALL_SKINS) {
    if (next[def.id]) continue
    const url = ballPreview(previewTier.value, def.id, PREVIEW_PX)
    if (url) next[def.id] = url
    else missing = true
  }
  previews.value = next
  // A painting still decoding: ask again in a moment.
  if (missing && props.modelValue && tab.value === 'skins') previewTimer = window.setTimeout(bakePreviews, 150)
}
watch(previewTier, () => { previews.value = {} })
watch([() => props.modelValue, tab, previewTier], ([open, which]) => {
  if (open && which === 'skins') bakePreviews()
}, { immediate: true })
onUnmounted(() => window.clearTimeout(previewTimer))

const launcherIsNew = (l: LauncherView): boolean => newLauncherTiers.value?.has(l.tier) ?? l.isNew
const skinIsNew = (s: BallSkinView): boolean => newSkinIds.value?.has(s.id) ?? s.isNew

const rarityOf = (id: BallSkinId): BallSkinRarity => BALL_SKINS.find((s) => s.id === id)?.rarity ?? 'common'
const tierName = (tier: number): string => {
  const key = `battle.codex.names.t${tier}`
  return te(key) ? t(key) : t('barrage.tray.tierOnly', { n: tier })
}

// Tab-label badges: a tab already opened shows its snapshot; the other one live.
const newLaunchers = computed(() => col.launchers.value.some(launcherIsNew))
const newSkins = computed(() => col.skins.value.some(skinIsNew))

const sparkleAt = (el: HTMLElement | null, color: string): void => {
  const r = el?.getBoundingClientRect()
  if (r) emitSparkle(r.left + r.width / 2, r.top + r.height / 2, color, 14)
}
const sparkle = (ev: MouseEvent, color: string): void => sparkleAt(ev.currentTarget as HTMLElement | null, color)

const onLauncher = (l: LauncherView, ev: MouseEvent): void => {
  if (l.selected || !l.seen) return
  if (l.owned) {
    col.selectLauncher(l.tier)
    playSound('anchor-swap', 0.05)
    return
  }
  if (col.buyLauncher(l.tier)) {
    col.selectLauncher(l.tier)
    playSound('upgrade-buy', 0.06)
    sparkle(ev, ballColors(l.tier).glow)
  } else {
    playSound('upgrade-denied', 0.015)
  }
}

const onSkin = (s: BallSkinView, ev: MouseEvent): void => {
  if (s.selected) return
  if (s.owned) {
    col.selectSkin(s.id)
    playSound('anchor-swap', 0.05)
    return
  }
  if (col.buySkin(s.id)) {
    col.selectSkin(s.id)
    playSound('upgrade-buy', 0.06)
    sparkle(ev, '#ffe27a')
  } else {
    playSound('upgrade-denied', 0.015)
  }
}

// ── Rewarded-ad unlock (the only way in past stone; stone's alternative to coins) ──
const adBusy = ref(false)
/** An ad-only skin always shows its button (disabled while no ad can fill: it
 *  is the only way in); stone's only while an ad can fill or one was watched.
 *  Only on builds that have rewarded ads at all. */
const showSkinAd = (s: BallSkinView): boolean =>
  !buffsCostCoins && !s.owned && s.adsNeeded > 0 && (s.adOnly || col.skinAdReady.value || s.adsWatched > 0)

const onSkinAd = async (s: BallSkinView, ev: MouseEvent): Promise<void> => {
  if (adBusy.value || !col.skinAdReady.value) return
  // `currentTarget` is gone once the handler awaits — keep the cell for the burst.
  const cell = (ev.currentTarget as HTMLElement | null)?.parentElement ?? null
  adBusy.value = true
  try {
    const result = await col.watchSkinAd(s.id)
    if (result === 'unlocked') {
      playSound('upgrade-buy', 0.06)
      sparkleAt(cell, '#ffe27a')
    } else if (result === 'progress') {
      playSound('reward-continue', 0.06)
      sparkleAt(cell, '#8dffa6')
    }
  } finally {
    adBusy.value = false
  }
}

const skinAdAria = (s: BallSkinView): string => {
  const name = t(`barrageMeta.collections.skinNames.${s.id}`)
  return s.adsNeeded > 1
    ? t('barrage.collection.adProgressAria', { name, n: s.adsWatched, max: s.adsNeeded })
    : t('barrage.collection.adAria', { name })
}

const launcherAria = (l: LauncherView): string => {
  if (!l.seen) return t('barrageMeta.collections.discoverHint', { tier: l.tier })
  const name = tierName(l.tier)
  if (l.selected) return t('barrage.collection.selectedAria', { name })
  if (l.owned) return t('barrage.collection.selectAria', { name })
  return t('barrage.collection.buyAria', { name, cost: fmtCoins(l.price) })
}
const skinAria = (s: BallSkinView): string => {
  const name = t(`barrageMeta.collections.skinNames.${s.id}`)
  if (s.selected) return t('barrage.collection.selectedAria', { name })
  if (s.owned) return t('barrage.collection.selectAria', { name })
  // The Unlock button under the card carries the ad offer.
  if (s.adOnly) return name
  return t('barrage.collection.buyAria', { name, cost: fmtCoins(s.price) })
}
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    :title="t('barrageMeta.collections.title')"
    @update:model-value="emit('update:modelValue', $event)"
  )
    div.collection.hud-digits.flex.flex-col.gap-2.px-1.pb-2
      p.game-text.text-center.opacity-80(class="text-[11px] sm:text-xs") {{ t('barrage.collection.cosmetic') }}
      //- In-frame tabs (not FModal's ribbon tabs) so each can carry its NEW badge.
      div.flex.justify-center.gap-2
        button.col-tab.game-text(
          type="button"
          :class="{ 'is-on': tab === 'launchers' }"
          @click="setTab('launchers')"
        )
          span {{ t('barrageMeta.collections.launchers') }}
          span.col-tab__new(v-if="newLaunchers") {{ t('barrageMeta.collections.new') }}
        button.col-tab.game-text(
          type="button"
          :class="{ 'is-on': tab === 'skins' }"
          @click="setTab('skins')"
        )
          span {{ t('barrageMeta.collections.skins') }}
          span.col-tab__new(v-if="newSkins") {{ t('barrageMeta.collections.new') }}

      //- ── Launchers ──
      div.col-grid(v-if="tab === 'launchers'")
        button.col-card(
          v-for="l in col.launchers.value"
          :key="l.tier"
          type="button"
          :class="{ 'is-selected': l.selected, 'is-locked': !l.seen, 'is-owned': l.owned }"
          :style="{ '--rim': ballColors(l.tier).glow }"
          :aria-label="launcherAria(l)"
          :aria-disabled="!l.seen || (!l.owned && !l.affordable) ? 'true' : undefined"
          @click="onLauncher(l, $event)"
        )
          span.col-card__new.game-text(v-if="launcherIsNew(l)") {{ t('barrageMeta.collections.new') }}
          span.col-card__art(:class="{ 'is-silhouette': !l.seen }")
            img(:src="fighterSrc(l.tier)" alt="" draggable="false" loading="lazy")
          span.col-card__name.game-text {{ l.seen ? tierName(l.tier) : t('barrage.collection.unknown') }}
          span.col-card__foot.game-text
            template(v-if="!l.seen")
              BarrageGlyph.w-3_5.h-3_5(name="lock")
              span {{ t('barrageMeta.collections.tier', { tier: l.tier }) }}
            template(v-else-if="l.selected")
              BarrageGlyph.w-3_5.h-3_5.text-emerald-300(name="check")
              span.text-emerald-300 {{ t('barrageMeta.collections.equipped') }}
            template(v-else-if="l.owned")
              span.text-sky-200 {{ t('barrageMeta.collections.equip') }}
            template(v-else)
              IconCoin.w-3_5.h-3_5
              span(:class="l.affordable ? 'text-yellow-200' : 'text-red-300'") {{ fmtCoins(l.price) }}

      //- ── Ball skins ──
      //- Each cell: the card (select / buy with coins) and, under a locked one,
      //- the rewarded-ad pill — a sibling, never nested inside the card button.
      div.col-grid(v-else)
        div.col-cell(
          v-for="s in col.skins.value"
          :key="s.id"
        )
          button.col-card(
            type="button"
            :class="['rarity--' + rarityOf(s.id), { 'is-selected': s.selected, 'is-owned': s.owned }]"
            :aria-label="skinAria(s)"
            :aria-disabled="!s.owned && !s.affordable ? 'true' : undefined"
            @click="onSkin(s, $event)"
          )
            span.col-card__new.game-text(v-if="skinIsNew(s)") {{ t('barrageMeta.collections.new') }}
            span.col-card__art.col-card__art--skin
              img(v-if="previews[s.id]" :src="previews[s.id]" alt="" draggable="false")
            span.col-card__name.game-text {{ t('barrageMeta.collections.skinNames.' + s.id) }}
            span.col-card__rarity.game-text {{ t('barrageMeta.collections.rarity.' + rarityOf(s.id)) }}
            span.col-card__foot.game-text
              template(v-if="s.selected")
                BarrageGlyph.w-3_5.h-3_5.text-emerald-300(name="check")
                span.text-emerald-300 {{ t('barrageMeta.collections.equipped') }}
              template(v-else-if="s.owned")
                span.text-sky-200 {{ t('barrageMeta.collections.equip') }}
              template(v-else-if="s.adOnly")
                BarrageGlyph.w-3_5.h-3_5.text-slate-300(name="lock")
                span.text-sky-200(v-if="s.adsNeeded > 1") {{ t('barrage.collection.adProgress', { n: s.adsWatched, max: s.adsNeeded }) }}
              template(v-else)
                IconCoin.w-3_5.h-3_5
                span(:class="s.affordable ? 'text-yellow-200' : 'text-red-300'") {{ fmtCoins(s.price) }}
          button.col-ad(
            v-if="showSkinAd(s)"
            type="button"
            :disabled="adBusy || !col.skinAdReady.value"
            :aria-label="skinAdAria(s)"
            :title="skinAdAria(s)"
            @click="onSkinAd(s, $event)"
          )
            IconMovie.col-ad__icon.shrink-0
            span.col-ad__label.game-text {{ t('barrage.collection.adUnlock') }}
</template>

<style scoped lang="sass">
.w-3_5
  width: 14px
.h-3_5
  height: 14px

.col-tab
  display: inline-flex
  align-items: center
  gap: 4px
  min-height: 36px
  padding: 4px 12px
  border-radius: 999px
  font-weight: 900
  font-size: 13px
  text-transform: uppercase
  color: #cfe2ff
  background: rgba(0, 0, 0, 0.3)
  border: 2px solid rgba(255, 255, 255, 0.12)
  cursor: pointer
  &.is-on
    color: #fff
    background: linear-gradient(180deg, #50aaff, #2266ff)
    border-color: #0f1a30
.col-tab__new
  font-size: 9px
  padding: 1px 4px
  border-radius: 999px
  background: #e0302a
  color: #fff

.col-grid
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr))
  gap: 8px

.col-cell
  display: flex
  flex-direction: column
  gap: 4px
  min-width: 0
  // An owned card stretches to its row: the cards line up with the ones above a pill.
  > .col-card
    flex: 1

// "▶ Unlock" under a locked skin: the only way in past stone, stone's alternative to coins.
// Tight padding + an 18 px icon: the longest labels (Freischalten, Desbloquear:
// 62 px at 12 px) fit an 89 px button, the three-column grid on a 360 px phone.
.col-ad
  display: flex
  align-items: center
  justify-content: center
  gap: 2px
  min-height: 32px
  padding: 2px 3px
  border-radius: 10px
  border: 2px solid #0f1a30
  // The ad blue (components.sass `--ad-*`): a rewarded button is never green.
  background: linear-gradient(180deg, var(--ad-top), var(--ad-bottom))
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.3), 0 3px 0 var(--ad-plate)
  cursor: pointer
  touch-action: manipulation
  transition: transform 0.08s ease
  &:active
    transform: translateY(2px)
  &:disabled
    filter: grayscale(0.7) brightness(0.8)
    cursor: default
.col-ad__icon
  width: 18px
  height: 18px
// Outlined so it reads on the ad blue; one line, never wrapped.
.col-ad__label
  font-size: 12px
  font-weight: 900
  line-height: 1
  white-space: nowrap
  color: #fff
  text-shadow: -1px -1px 0 #0f1a30, 1px -1px 0 #0f1a30, -1px 1px 0 #0f1a30, 1px 1px 0 #0f1a30

.col-card
  --rim: rgba(255, 255, 255, 0.25)
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  gap: 2px
  padding: 8px 4px 6px
  border-radius: 14px
  background: rgba(0, 0, 0, 0.32)
  border: 2px solid rgba(255, 255, 255, 0.14)
  cursor: pointer
  transition: transform 0.1s ease, border-color 0.15s ease
  touch-action: manipulation
  &:active
    transform: scale(0.96)
  &.is-owned
    border-color: color-mix(in srgb, var(--rim) 60%, transparent)
  &.is-selected
    border-color: #6cff9a
    box-shadow: 0 0 0 2px rgba(108, 255, 154, 0.35), 0 0 14px rgba(108, 255, 154, 0.35)
  &.is-locked
    cursor: default
    opacity: 0.8

.col-card__art
  width: 56px
  height: 56px
  display: flex
  align-items: center
  justify-content: center
  img
    width: 100%
    height: 100%
    object-fit: contain
    filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.55))
  &.is-silhouette img
    filter: brightness(0) opacity(0.75)
// A skin bake carries its own halo and outline: no drop shadow, a touch bigger.
.col-card__art--skin
  width: 60px
  height: 60px
  margin: -2px 0
  img
    filter: none

.col-card__name
  font-size: 11px
  font-weight: 900
  line-height: 1.1
  color: #fff
  text-align: center
  max-width: 100%
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
.col-card__rarity
  font-size: 9px
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.05em
  color: var(--rarity, #cfd8e8)
.col-card__foot
  display: flex
  align-items: center
  gap: 3px
  font-size: 11px
  font-weight: 900
  min-height: 16px
.col-card__new
  position: absolute
  top: -6px
  right: -4px
  z-index: 1
  font-size: 9px
  font-weight: 900
  padding: 1px 5px
  border-radius: 999px
  color: #fff
  background: #e0302a
  border: 1.5px solid #fff
  animation: new-bob 0.9s ease-in-out infinite alternate
@keyframes new-bob
  from
    transform: translateY(0)
  to
    transform: translateY(-2px)

// Rarity frames: the colour is the rarity, before any word is read.
.rarity--common
  --rarity: #cfd8e8
  border-color: rgba(207, 216, 232, 0.45)
.rarity--rare
  --rarity: #5fb0ff
  border-color: rgba(95, 176, 255, 0.75)
.rarity--epic
  --rarity: #c56bff
  border-color: rgba(197, 107, 255, 0.8)
  background: radial-gradient(circle at 50% 30%, rgba(197, 107, 255, 0.18), rgba(0, 0, 0, 0.32) 70%)
.rarity--legendary
  --rarity: #ffd23a
  border-color: rgba(255, 210, 58, 0.9)
  background: radial-gradient(circle at 50% 30%, rgba(255, 210, 58, 0.22), rgba(0, 0, 0, 0.32) 70%)
  box-shadow: 0 0 10px rgba(255, 210, 58, 0.3)
.col-card.is-selected
  border-color: #6cff9a

@media (prefers-reduced-motion: reduce)
  .col-card__new
    animation: none
</style>
