<script setup lang="ts">
/**
 * The unlock moment — a new HUD feature arrives as a REWARD, wordless.
 *
 * `useFeatureUnlocks` picks a calm aim phase and marks one feature
 * `arriving`; its FeatureSlot is then laid out but invisible. This takes a
 * clone of that very button (so the icon is exactly the one the player will
 * tap), pops it up big over the board with a burst of light, holds it a beat,
 * then flies it down into its slot — where the real button lands with
 * confetti and starts to glow.
 *
 * Pointer-events none throughout; ~2 s; the sentence lives in an sr-only
 * live region.
 */
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { finishArrival, unlocking, type FeatureId } from '@/use/useFeatureUnlocks'
import { boardApi } from '@/components/barrage/barrageUi'
import useSounds from '@/use/useSound'
import { emitConfetti, emitSparkle } from '@/use/usePrismParticles'

const { t } = useI18n()
const { playSound } = useSounds()

const NAME_KEY: Record<FeatureId, string> = {
  codex: 'barrage.codex.title',
  supply: 'barrageMeta.supply.title',
  collection: 'barrageMeta.collections.title',
  dailyRewards: 'dailyRewards.title',
  battlePass: 'barrageMeta.pass.title',
  achievements: 'barrageMeta.achievements.title',
  dailyRun: 'barrageMeta.daily.title'
}

const layer = ref<HTMLElement | null>(null)
const rays = ref<{ x: number; y: number; size: number } | null>(null)
const raysOn = ref(false)
const announcement = ref('')

const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const DURATION = reduced ? 1400 : 2000

let clone: HTMLElement | null = null
let anim: Animation | null = null
let raysTimer = 0

const cleanup = (): void => {
  anim?.cancel()
  anim = null
  clone?.remove()
  clone = null
  window.clearTimeout(raysTimer)
  raysOn.value = false
}

const play = async (id: FeatureId): Promise<void> => {
  announcement.value = t('barrage.unlock.announce', { name: t(NAME_KEY[id]) })
  await nextTick()
  // One frame so the slot (visibility: hidden) has its real box.
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  const target = document.querySelector<HTMLElement>(`[data-feature="${id}"]`)
  const board = boardApi.value?.boardClientRect()
  const host = layer.value
  if (!target || !board || !host || typeof target.animate !== 'function') {
    finishArrival(id)
    return
  }
  const tr = target.getBoundingClientRect()
  cleanup()
  const c = target.cloneNode(true) as HTMLElement
  c.removeAttribute('data-feature')
  c.classList.remove('is-arriving')
  Object.assign(c.style, {
    position: 'fixed', left: `${tr.left}px`, top: `${tr.top}px`, width: `${tr.width}px`, height: `${tr.height}px`,
    margin: '0', visibility: 'visible', pointerEvents: 'none', zIndex: '1', transformOrigin: 'center'
  })
  c.setAttribute('aria-hidden', 'true')
  host.appendChild(c)
  clone = c

  const cx = board.left + board.width / 2
  const cy = board.top + board.height * 0.42
  const dx = cx - (tr.left + tr.width / 2)
  const dy = cy - (tr.top + tr.height / 2)
  const S = Math.max(2, Math.min(3, (board.width * 0.3) / Math.max(24, tr.width)))
  rays.value = { x: cx, y: cy, size: tr.width * S * 2.6 }
  raysOn.value = true
  playSound('new-tier-reveal', 0.07)
  emitSparkle(cx, cy, '#ffe27a', 14)

  const at = (x: number, y: number, s: number): string => `translate(${x}px, ${y}px) scale(${s})`
  anim = c.animate([
    { transform: at(dx, dy, 0), opacity: 0, offset: 0, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    { transform: at(dx, dy, S), opacity: 1, offset: 0.2 },
    { transform: at(dx, dy - 6, S * 1.04), opacity: 1, offset: 0.4 },
    { transform: at(dx, dy, S), opacity: 1, offset: 0.56, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
    { transform: at(0, 0, 1), opacity: 1, offset: 1 }
  ], { duration: DURATION, fill: 'forwards' })
  raysTimer = window.setTimeout(() => { raysOn.value = false }, DURATION * 0.58)
  anim.onfinish = () => {
    cleanup()
    finishArrival(id)
    const r = target.getBoundingClientRect()
    emitConfetti(r.left + r.width / 2, r.top + r.height / 2, 26, 1)
    playSound('merge-pop', 0.05, 1.2)
  }
}

watch(unlocking, (id) => { if (id) void play(id) })
onUnmounted(() => {
  const id = unlocking.value
  cleanup()
  if (id) finishArrival(id)
})
</script>

<template lang="pug">
  Teleport(to="body")
    //- `data-coach-live`: the playtest harness grabs a moment frame the first
    //- time each distinct sentence shows (run 6: testers saw only the before /
    //- after of the fly-in and read the new buttons as "silently appearing").
    div.sr-only(aria-live="polite" data-coach-live="unlock") {{ announcement }}
    div.unlock-fx.fixed.inset-0.pointer-events-none(ref="layer" aria-hidden="true")
      //- type="transition": the rays SPIN on an infinite animation, and Vue would
      //- otherwise wait for its (never-coming) animationend before leaving.
      Transition(name="unlock-rays" type="transition")
        div.unlock-fx__rays.absolute(
          v-if="raysOn && rays"
          :style="{ left: rays.x + 'px', top: rays.y + 'px', width: rays.size + 'px', height: rays.size + 'px' }"
        )
</template>

<style scoped lang="sass">
.unlock-fx
  z-index: 80
.unlock-fx__rays
  translate: -50% -50%
  border-radius: 50%
  background: repeating-conic-gradient(from 0deg, rgba(255, 236, 150, 0.55) 0deg 10deg, rgba(255, 236, 150, 0) 10deg 24deg)
  mask-image: radial-gradient(circle, #000 18%, transparent 68%)
  -webkit-mask-image: radial-gradient(circle, #000 18%, transparent 68%)
  animation: unlock-spin 6s linear infinite
  z-index: 0
  &::after
    content: ''
    position: absolute
    inset: 22%
    border-radius: 50%
    background: radial-gradient(circle, rgba(255, 244, 190, 0.85), rgba(255, 200, 80, 0.25) 55%, transparent 72%)
@keyframes unlock-spin
  to
    rotate: 360deg
.unlock-rays-enter-active
  transition: opacity 0.3s ease, scale 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)
.unlock-rays-leave-active
  transition: opacity 0.35s ease
.unlock-rays-enter-from
  opacity: 0
  scale: 0.3
.unlock-rays-leave-to
  opacity: 0

@media (prefers-reduced-motion: reduce)
  .unlock-fx__rays
    animation: none
</style>
