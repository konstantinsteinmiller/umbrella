<script setup lang="ts">
/**
 * The HUD name tip on screen (`hudTip.ts` holds the state and the rules): a
 * small plate beside the element the player just tapped — its glyph, its name
 * and, where one applies, its value (a countdown keeps ticking while it is
 * up). Pointer-events none; it goes after TIP_MS, on the next pointerdown
 * anywhere, when a modal opens or the window resizes.
 *
 * Screen readers get one sentence per opening (the plate itself is hidden
 * from them — a ticking countdown in a live region would be re-read every
 * second).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import { chestSrc } from '@/barrage/art'
import { hideHudTip, hudTip, placeTip, TIP_MS, type TipContent, type TipPlace } from '@/components/barrage/hudTip'
import { isAnyModalOpen } from '@/use/useModalState'

const content = computed<TipContent | null>(() => hudTip.value?.content() ?? null)
const plateEl = ref<HTMLElement | null>(null)
const place = ref<TipPlace | null>(null)

/** The sentence for this opening — a snapshot, not the ticking plate. */
const srText = ref('')

const measure = (): void => {
  const tip = hudTip.value
  const el = plateEl.value
  if (!tip || !el) { place.value = null; return }
  const a = tip.anchor.getBoundingClientRect()
  if (!tip.anchor.isConnected || (a.width === 0 && a.height === 0)) { hideHudTip(); return }
  place.value = placeTip(a, { width: el.offsetWidth, height: el.offsetHeight }, { width: window.innerWidth, height: window.innerHeight })
}

let timer = 0
watch(() => hudTip.value?.seq, async (seq) => {
  window.clearTimeout(timer)
  place.value = null
  if (seq === undefined) { srText.value = ''; return }
  const c = content.value
  srText.value = c ? (c.sr ?? [c.name, ...(c.facts ?? []).map((f) => f.text)].join(' ')) : ''
  timer = window.setTimeout(hideHudTip, TIP_MS)
  await nextTick()
  measure()
})
// A countdown changes the plate's width: keep it on its anchor.
watch(content, () => { if (hudTip.value) void nextTick(measure) })
watch(isAnyModalOpen, (open) => { if (open) hideHudTip() })

const style = computed((): Record<string, string> => {
  const p = place.value
  // Unplaced (the first frame, measuring its own size): laid out, unseen.
  if (!p) return { left: '0px', top: '0px', visibility: 'hidden' }
  return { left: `${p.left}px`, top: `${p.top}px`, '--caret': `${p.caret}px` }
})

// Any new touch anywhere closes it — including the tap that re-opens it
// (that tap's click comes after its pointerdown and opens a fresh plate).
const onAnyDown = (): void => hideHudTip()
onMounted(() => {
  window.addEventListener('pointerdown', onAnyDown, true)
  window.addEventListener('resize', hideHudTip)
})
onUnmounted(() => {
  window.removeEventListener('pointerdown', onAnyDown, true)
  window.removeEventListener('resize', hideHudTip)
  window.clearTimeout(timer)
  hideHudTip()
})
</script>

<template lang="pug">
  Teleport(to="body")
    div.hud-tip-layer(aria-live="polite")
      span.sr-only {{ srText }}
      Transition(name="hud-tip")
        div.hud-tip(
          v-if="hudTip && content"
          ref="plateEl"
          :class="{ 'hud-tip--below': place && place.below }"
          :style="style"
          aria-hidden="true"
        )
          span.hud-tip__icon
            IconCoin.w-full.h-full(v-if="content.icon === 'coin'")
            img.w-full.h-full.hud-tip__art(v-else-if="content.icon === 'chest'" :src="chestSrc()" alt="" draggable="false")
            BarrageGlyph.w-full.h-full(v-else :name="content.icon")
          span.hud-tip__body
            span.hud-tip__name.game-text {{ content.name }}
            span.hud-tip__facts(v-if="content.facts && content.facts.length")
              span.hud-tip__fact(v-for="(f, i) in content.facts" :key="i" :class="'hud-tip__fact--' + f.icon")
                IconCoin.hud-tip__fact-icon(v-if="f.icon === 'coin'")
                img.hud-tip__fact-icon.hud-tip__art(v-else-if="f.icon === 'chest'" :src="chestSrc()" alt="" draggable="false")
                BarrageGlyph.hud-tip__fact-icon(v-else :name="f.icon")
                span.game-text.tabular-nums {{ f.text }}
</template>

<style scoped lang="sass">
.hud-tip-layer
  position: fixed
  inset: 0 auto auto 0
  width: 0
  height: 0
  pointer-events: none
  z-index: 60
.hud-tip
  position: fixed
  display: flex
  align-items: center
  gap: 7px
  max-width: min(260px, calc(100vw - 16px))
  padding: 5px 10px 5px 7px
  border-radius: 12px
  background: linear-gradient(180deg, #1d2a4d, #0e1630)
  border: 2px solid #0f1a30
  box-shadow: 0 0 0 1.5px rgba(255, 210, 90, 0.75), 0 4px 10px rgba(0, 0, 0, 0.45)
  color: #fff
  pointer-events: none
  // The little pointer on the tapped element.
  &::after
    content: ''
    position: absolute
    left: var(--caret, 50%)
    top: 100%
    width: 10px
    height: 10px
    translate: -50% -4px
    rotate: 45deg
    background: #0e1630
    border-right: 1.5px solid rgba(255, 210, 90, 0.75)
    border-bottom: 1.5px solid rgba(255, 210, 90, 0.75)
.hud-tip--below::after
  top: auto
  bottom: 100%
  translate: -50% 4px
  rotate: 225deg
.hud-tip__icon
  flex: 0 0 auto
  display: block
  width: 24px
  height: 24px
  color: #ffe27a
  filter: drop-shadow(1px 1px 0 rgba(0, 0, 0, 0.6))
.hud-tip__art
  object-fit: contain
.hud-tip__body
  display: flex
  flex-direction: column
  min-width: 0
  gap: 1px
.hud-tip__name
  font-size: 12px
  font-weight: 900
  line-height: 1.2
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.6)
.hud-tip__facts
  display: flex
  flex-wrap: wrap
  align-items: center
  gap: 2px 10px
.hud-tip__fact
  display: inline-flex
  align-items: center
  gap: 3px
  font-size: 12px
  font-weight: 900
  line-height: 1.2
  color: #bff7f0
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.6)
.hud-tip__fact--coin
  color: #ffe27a
.hud-tip__fact-icon
  width: 14px
  height: 14px
  flex: 0 0 auto

.hud-tip-enter-active, .hud-tip-leave-active
  transition: opacity 0.15s ease, transform 0.15s ease
.hud-tip-enter-from, .hud-tip-leave-to
  opacity: 0
  transform: translateY(4px)
@media (prefers-reduced-motion: reduce)
  .hud-tip-enter-active, .hud-tip-leave-active
    transition: opacity 0.15s ease
  .hud-tip-enter-from, .hud-tip-leave-to
    transform: none
</style>
