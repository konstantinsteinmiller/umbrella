<script setup lang="ts">
/**
 * The alchemist's cauldron — the emotive heart of the lab (GDD §4.1). It:
 *   • blends its fluid colour from whatever ingredients are currently inside,
 *   • warps the surface with an animated sine wave,
 *   • emits rising bubbles at a rate scaled by the contents' thermal weight and
 *     the Heat upgrade (GDD §4.1.3),
 *   • rattles + expands while synthesising and flashes on burst,
 *   • reacts with cartoon eyes/mouth (neutral / strained / queasy-on-acid),
 *   • registers itself as the 'cauldron' drag-drop zone for the merge grid.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import usePrismGame, { CAULDRON_CAPACITY, synthesisMs } from '@/use/usePrismGame'
import { getIngredient } from '@/game/ingredients'
import { emitBubble } from '@/use/usePrismParticles'
import { registerDropZone, unregisterDropZone } from '@/use/useDropZones'

const { cauldron, isBrewing, brewFraction, upgrades } = usePrismGame()

const rootRef = ref<HTMLElement | null>(null)
const bursting = ref(false)

// ── Liquid colour: average of the ingredient glow colours inside ──
const hexToRgb = (h: string): [number, number, number] => {
  const s = h.replace('#', '')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}
const liquidColor = computed(() => {
  const tiers = cauldron.value
  if (tiers.length === 0) return '#243049'
  let r = 0, g = 0, b = 0
  for (const t of tiers) {
    const [rr, gg, bb] = hexToRgb(getIngredient(t).glow)
    r += rr; g += gg; b += bb
  }
  const n = tiers.length
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`
})
const hasLiquid = computed(() => cauldron.value.length > 0)
const fillFraction = computed(() => Math.min(1, cauldron.value.length / CAULDRON_CAPACITY))
const hasAcid = computed(() => cauldron.value.includes(6))

// Combined thermal weight → bubble spawn frequency (GDD §4.1.3: hot tiers ×3).
const thermal = computed(() => {
  let t = 0.15
  for (const tier of cauldron.value) t += getIngredient(tier).thermal
  return t
})

// ── Expression ──
type Mood = 'neutral' | 'focused' | 'strained' | 'queasy'
const mood = computed<Mood>(() => {
  if (isBrewing.value) return 'strained'
  if (hasAcid.value) return 'queasy'
  if (hasLiquid.value) return 'focused'
  return 'neutral'
})

// ── Bubble emitter (rAF-light: gated interval) ──
let bubbleTimer: ReturnType<typeof setInterval> | null = null
const tickBubbles = (): void => {
  if (document.hidden || !hasLiquid.value) return
  const el = rootRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  // Heat upgrade and thermal weight both raise the emission probability.
  const heat = upgrades.value.heat
  const intensity = thermal.value * (1 + heat * 0.06) * (isBrewing.value ? 1.8 : 1)
  const count = Math.random() < intensity * 0.5 ? (intensity > 1.2 ? 2 : 1) : 0
  for (let i = 0; i < count; i++) {
    const cx = r.left + r.width * (0.5 + (Math.random() - 0.5) * 0.4)
    const cy = r.top + r.height * 0.66
    emitBubble(cx, cy, liquidColor.value)
  }
}

// Burst flash when a synthesis completes (brewing true → false).
watch(isBrewing, (now, prev) => {
  if (prev && !now) {
    bursting.value = true
    setTimeout(() => { bursting.value = false }, 600)
  }
})

onMounted(() => {
  bubbleTimer = setInterval(tickBubbles, 110)
  registerDropZone('cauldron', () => rootRef.value?.getBoundingClientRect() ?? null)
})
onUnmounted(() => {
  if (bubbleTimer) clearInterval(bubbleTimer)
  unregisterDropZone('cauldron')
})

// Surface wave + synthesis pulse are CSS-driven; expose the synthesis duration
// so the rattle speeds up with Heat.
const rattleDuration = computed(() => Math.max(0.18, synthesisMs.value / 1000 / 6) + 's')
</script>

<template lang="pug">
  div.cauldron-wrap.relative.flex.items-center.justify-center(
    ref="rootRef"
    :class="{ 'is-brewing': isBrewing, 'is-bursting': bursting }"
    :style="{ '--rattle': rattleDuration }"
  )
    svg(viewBox="0 0 200 180" class="w-full h-full overflow-visible")
      defs
        clipPath(id="cauldron-bowl")
          path(d="M30 70 Q30 150 100 150 Q170 150 170 70 Z")
        linearGradient(id="liquid-grad" x1="0" y1="0" x2="0" y2="1")
          stop(offset="0%" :stop-color="liquidColor" stop-opacity="0.95")
          stop(offset="100%" :stop-color="liquidColor")
        radialGradient(id="pot-grad" cx="38%" cy="30%" r="80%")
          stop(offset="0%" stop-color="#3a4560")
          stop(offset="100%" stop-color="#10141f")

      //- Glow under the pot
      ellipse(cx="100" cy="156" rx="78" ry="14" :fill="liquidColor" opacity="0.25")

      //- Legs
      path(d="M52 140 L44 168 L60 168 L66 142 Z" fill="#10141f" stroke="#000" stroke-width="3")
      path(d="M148 140 L156 168 L140 168 L134 142 Z" fill="#10141f" stroke="#000" stroke-width="3")

      //- Pot body
      path(d="M22 70 Q22 158 100 158 Q178 158 178 70 Z" fill="url(#pot-grad)" stroke="#000" stroke-width="5")
      //- Rim
      ellipse(cx="100" cy="70" rx="80" ry="20" fill="#1b2235" stroke="#000" stroke-width="5")
      ellipse(cx="100" cy="70" rx="68" ry="14" fill="#0a0d16")

      //- Liquid (clipped to the bowl)
      g(clip-path="url(#cauldron-bowl)" v-if="hasLiquid")
        rect(x="20" :y="158 - fillFraction * 86" width="160" :height="fillFraction * 90 + 4" fill="url(#liquid-grad)")
        //- Wavy surface
        path.surface(:d="`M20 ${158 - fillFraction*86} q20 -8 40 0 t40 0 t40 0 t40 0 v90 h-160 Z`" :fill="liquidColor")
        //- Bright surface line
        path.surface2(:d="`M20 ${158 - fillFraction*86} q20 -8 40 0 t40 0 t40 0 t40 0`" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2")

      //- ── Cauldron face on the metal ──
      g(transform="translate(0 0)")
        //- Eyes
        template(v-if="mood === 'strained'")
          path(d="M64 96 q8 -8 16 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round")
          path(d="M120 96 q8 -8 16 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round")
        template(v-else)
          circle(cx="74" cy="98" r="8" fill="#fff")
          circle(cx="128" cy="98" r="8" fill="#fff")
          circle(cx="76" :cy="mood === 'queasy' ? 101 : 99" r="4" fill="#0a0d16")
          circle(cx="130" :cy="mood === 'queasy' ? 101 : 99" r="4" fill="#0a0d16")
        //- Mouth
        path(v-if="mood === 'neutral'" d="M86 118 q15 8 30 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round")
        path(v-else-if="mood === 'focused'" d="M88 120 q14 4 26 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round")
        path(v-else-if="mood === 'strained'" d="M86 116 q15 18 30 0 q-15 8 -30 0 Z" fill="#1a0a0a" stroke="#fff" stroke-width="3")
        path(v-else d="M88 122 q14 -10 26 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round")

      //- Burst flash ring
      circle.burst-ring(v-if="bursting" cx="100" cy="100" r="60" fill="none" :stroke="liquidColor" stroke-width="8")
</template>

<style scoped lang="sass">
.cauldron-wrap
  width: 100%
  height: 100%
  transform-origin: center bottom
  will-change: transform

.is-brewing
  animation: cauldron-rattle var(--rattle, 0.2s) linear infinite

.is-bursting
  animation: cauldron-burst 0.6s cubic-bezier(0.18, 0.9, 0.3, 1.2)

.surface
  animation: surface-wave 2.4s ease-in-out infinite alternate

@keyframes surface-wave
  from
    transform: translateX(0)
  to
    transform: translateX(-12px)

@keyframes cauldron-rattle
  0%, 100%
    transform: translate(0, 0) scale(1.02, 1.02)
  25%
    transform: translate(-1.5px, 0) rotate(-0.6deg)
  75%
    transform: translate(1.5px, 0) rotate(0.6deg)

@keyframes cauldron-burst
  0%
    transform: scale(1)
  35%
    transform: scale(1.14, 0.92)
  70%
    transform: scale(0.96, 1.05)
  100%
    transform: scale(1)

.burst-ring
  transform-origin: 100px 100px
  animation: burst-ring 0.6s ease-out forwards

@keyframes burst-ring
  0%
    transform: scale(0.4)
    opacity: 0.9
  100%
    transform: scale(2.2)
    opacity: 0
</style>
