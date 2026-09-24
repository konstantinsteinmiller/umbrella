<script setup lang="ts">
/**
 * The merge, on a stage (`mergeLightbox.ts` decides WHEN; the game is paused
 * for the whole moment).
 *
 *   0 – 0.18 s   everything but the tray dims; the twins pop up side by side
 *                in the tray, over the ball they are about to become;
 *   – 0.78 s     they fly together (a small hop, a quarter turn);
 *   0.78 s       FUSE: a white flash, the next tier pops out of it;
 *   then         a short comet runs from the new ball into the launcher and
 *                rings it — these balls ARE the shots;
 *   discovery    its codex entry peeks above the tray: portrait, name, damage
 *                and the ability it brings (icon + name);
 *   end          the dim lifts; a discovery hands over to the NEW BALL reveal.
 *
 * A tap anywhere skips it. Words: only the codex entry (the ball's name and
 * ability, already localized for the codex); the rest is shapes and numbers.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ballColors, fighterSrc } from '@/barrage/art'
import { ballAbility, TIER_GROWTH } from '@/barrage/engine/balls'
import useSounds from '@/use/useSound'
import { claimRevealSound } from '@/use/useTierReveal'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import { boardApi, fmtMult } from '@/components/barrage/barrageUi'
import { finishMerge, mergeBox, registerMergeBoxView, setRevealResumeHook, type MergeBox } from '@/components/barrage/mergeLightbox'

interface Pt { x: number; y: number }
interface Box { left: number; top: number; width: number; height: number }

const { t, te } = useI18n()
const { playSound } = useSounds()

const box = computed<MergeBox | null>(() => mergeBox.value)

// ─── Geometry (measured once per lightbox: the game is paused, nothing moves) ─
const geo = ref<{ tray: Box; slot: Box; a: Pt; b: Pt; launcher: Pt | null; cell: number; vw: number; vh: number } | null>(null)

const rectOf = (el: Element | null): Box | null => {
  const r = el?.getBoundingClientRect()
  return r && r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
}
const measure = (): void => {
  const b = box.value
  if (!b) { geo.value = null; return }
  const trayEl = document.querySelector('[data-tut="tray"]')
  const tray = rectOf(trayEl)
  const slot = rectOf(trayEl?.querySelector(`[data-slot="${b.idx}"] .unit-holder`) ?? null)
  if (!tray || !slot) { geo.value = null; return }
  // The twins start either side of the ball they become, inside the tray.
  const cx = slot.left + slot.width / 2
  const cy = slot.top + slot.height / 2
  const off = slot.width * 1.1
  const lo = tray.left + slot.width * 0.55
  const hi = tray.left + tray.width - slot.width * 0.55
  const clampX = (x: number): number => Math.min(hi, Math.max(lo, x))
  let ax = clampX(cx - off)
  let bx = clampX(cx + off)
  // A slot at the tray's edge: both twins come from the open side.
  if (bx - ax < off) {
    if (ax === lo) { ax = cx; bx = clampX(cx + off * 2) } else { bx = cx; ax = clampX(cx - off * 2) }
  }
  const api = boardApi.value
  const o = api?.cellToClient(0, 0)
  const o1 = api?.cellToClient(1, 0)
  geo.value = {
    tray,
    slot,
    a: { x: ax, y: cy },
    b: { x: bx, y: cy },
    launcher: api?.launcherClientPoint() ?? null,
    cell: o && o1 ? Math.max(16, o1.x - o.x) : 40,
    vw: window.innerWidth,
    vh: window.innerHeight
  }
}

// ─── Clock ───────────────────────────────────────────────────────────────────
const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const now = ref(0)
let t0 = 0
let raf = 0
let fused = false
const tick = (tm: number): void => {
  if (!t0) t0 = tm
  now.value = tm - t0
  if (!fused && now.value >= T.value.fuse && box.value) {
    fused = true
    // The board already popped at the merge itself; this is the pop you SEE.
    playSound('merge-pop', 0.06, 1 + Math.min(12, box.value.toTier) * 0.04)
  }
  raf = requestAnimationFrame(tick)
}
const start = (): void => {
  cancelAnimationFrame(raf)
  t0 = 0
  now.value = 0
  fused = false
  measure()
  raf = requestAnimationFrame(tick)
}
watch(() => box.value?.seq, (s) => { if (s) start(); else cancelAnimationFrame(raf) })

/** Beat times, ms. A discovery holds a little longer for its codex peek. */
const T = computed(() => {
  const d = box.value?.discovery ?? false
  const total = box.value?.ms ?? 2000
  return {
    appear: 180,
    fuse: 780,
    codexIn: 1000,
    codexOut: total - 380,
    trail0: d ? 1350 : 1080,
    trail1: d ? 1890 : 1620,
    ring1: d ? 2170 : 1900,
    out: total - 220,
    total
  }
})

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const seg = (a: number, b: number): number => clamp01((now.value - a) / Math.max(1, b - a))
const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const easeOutBack = (x: number): number => {
  const c = 1.9
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2)
}

/** The whole layer's opacity: in fast, out at the end. */
const layerOpacity = computed(() => seg(0, T.value.appear) * (1 - seg(T.value.out, T.value.total)))

// ─── Twins → fuse → the new ball ─────────────────────────────────────────────
const orbStyle = (tier: number): Record<string, string> => {
  const c = ballColors(tier)
  return { '--rim': c.glow, '--body': c.body, '--light': c.light }
}
const slotSize = computed(() => geo.value?.slot.width ?? 40)
const fusePt = computed<Pt | null>(() => {
  const g = geo.value
  return g ? { x: g.slot.left + g.slot.width / 2, y: g.slot.top + g.slot.height / 2 } : null
})
const twins = computed(() => {
  const g = geo.value
  const f = fusePt.value
  if (!g || !f || now.value >= T.value.fuse) return []
  const pop = easeOutBack(seg(0, T.value.appear + 60))
  const k = easeInOut(seg(T.value.appear, T.value.fuse))
  const s = slotSize.value
  return [g.a, g.b].map((p, i) => {
    const x = p.x + (f.x - p.x) * k
    // A small hop toward each other, so the path reads as a jump, not a slide.
    const y = p.y + (f.y - p.y) * k - Math.sin(Math.PI * k) * s * 0.35
    const turn = (i === 0 ? 1 : -1) * 90 * k
    return {
      key: i,
      style: {
        left: `${x - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s}px`,
        transform: `scale(${(0.55 + 0.45 * pop) * (1 - 0.18 * k)}) rotate(${turn}deg)`
      }
    }
  })
})
const flashStyle = computed<Record<string, string> | null>(() => {
  const f = fusePt.value
  if (!f || now.value < T.value.fuse || now.value > T.value.fuse + 320) return null
  const k = seg(T.value.fuse, T.value.fuse + 320)
  const size = slotSize.value * (0.6 + 2.6 * k)
  return { left: `${f.x}px`, top: `${f.y}px`, width: `${size}px`, height: `${size}px`, opacity: String(1 - k) }
})
const resultStyle = computed<Record<string, string> | null>(() => {
  const g = geo.value
  if (!g || now.value < T.value.fuse) return null
  const k = seg(T.value.fuse, T.value.fuse + 300)
  return {
    left: `${g.slot.left}px`, top: `${g.slot.top}px`, width: `${g.slot.width}px`, height: `${g.slot.height}px`,
    transform: `scale(${0.3 + 0.7 * easeOutBack(k)})`
  }
})

// ─── The comet into the launcher ─────────────────────────────────────────────
/** Quadratic arc from the new ball to the launcher, bowed away from the
 *  straight line so it reads as a throw. */
const arc = computed(() => {
  const g = geo.value
  const f = fusePt.value
  if (!g || !f || !g.launcher) return null
  const L = g.launcher
  const mx = (f.x + L.x) / 2
  const my = (f.y + L.y) / 2
  const dx = L.x - f.x
  const dy = L.y - f.y
  const len = Math.hypot(dx, dy) || 1
  const bow = Math.min(90, len * 0.3)
  // Bow toward the screen's middle (never off the edge).
  const side = mx < g.vw / 2 ? 1 : -1
  const c = { x: mx + (-dy / len) * bow * side, y: my + (dx / len) * bow * side }
  const at = (q: number): Pt => ({
    x: (1 - q) * (1 - q) * f.x + 2 * (1 - q) * q * c.x + q * q * L.x,
    y: (1 - q) * (1 - q) * f.y + 2 * (1 - q) * q * c.y + q * q * L.y
  })
  return { f, c, L, at }
})
const trailK = computed(() => easeInOut(seg(T.value.trail0, T.value.trail1)))
const trailPath = computed(() => {
  const a = arc.value
  const k = trailK.value
  if (!a || now.value < T.value.trail0) return ''
  // Only the tail end of the flown part: a comet, not a painted line.
  const from = Math.max(0, k - 0.45)
  const pts: string[] = []
  for (let i = 0; i <= 16; i++) {
    const p = a.at(from + ((k - from) * i) / 16)
    pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`)
  }
  return pts.join(' ')
})
const cometHead = computed<Pt | null>(() => {
  const a = arc.value
  if (!a || now.value < T.value.trail0 || now.value > T.value.trail1) return null
  return a.at(trailK.value)
})
const launcherRing = computed(() => {
  const g = geo.value
  if (!g?.launcher || now.value < T.value.trail1) return null
  const k = seg(T.value.trail1, T.value.ring1)
  return { x: g.launcher.x, y: g.launcher.y, r: g.cell * (0.45 + 0.9 * k), o: 1 - k }
})
/** The launcher's window in the dim opens as the comet arrives. */
const launcherHoleR = computed(() => {
  const g = geo.value
  if (!g?.launcher) return 0
  return g.cell * 0.95 * seg(T.value.trail1 - 200, T.value.trail1 + 60)
})
const trailColor = computed(() => ballColors(box.value?.toTier ?? 1).glow)

// ─── Codex peek (discoveries) ────────────────────────────────────────────────
const codex = computed(() => {
  const b = box.value
  if (!b?.discovery) return null
  const tier = b.toTier
  const ability = ballAbility(tier)
  const nameKey = `battle.codex.names.t${Math.min(50, tier)}`
  return {
    tier,
    name: te(nameKey) ? t(nameKey) : t('barrage.tray.tierOnly', { n: tier }),
    damage: t('barrage.codex.damage', { n: fmtMult(Math.pow(TIER_GROWTH, tier - 1)) }),
    ability,
    abilityName: t(`barrage.abilities.${ability}.name`),
    abilityDesc: t(`barrage.abilities.${ability}.desc`),
    rim: ballColors(tier).glow
  }
})
const codexStyle = computed<Record<string, string> | null>(() => {
  const g = geo.value
  if (!codex.value || !g || now.value < T.value.codexIn) return null
  const inK = easeOutBack(seg(T.value.codexIn, T.value.codexIn + 260))
  const outK = seg(T.value.codexOut, T.value.codexOut + 200)
  const w = Math.min(300, g.vw - 24)
  const cx = Math.min(g.vw - 12 - w / 2, Math.max(12 + w / 2, g.tray.left + g.tray.width / 2))
  // Above the tray (portrait: over the dimmed board; side by side: over the
  // column above the tray) — never off the top, and never over the launcher,
  // where the comet has to be SEEN landing.
  let bottom = g.tray.top - 10
  const L = g.launcher
  if (L && Math.abs(L.x - cx) < w / 2 + g.cell && bottom > L.y - g.cell * 1.1) bottom = L.y - g.cell * 1.1
  bottom = Math.max(bottom, 96)
  return {
    left: `${cx - w / 2}px`,
    top: `${bottom}px`,
    width: `${w}px`,
    transform: `translateY(calc(-100% + ${(1 - inK) * 16}px)) scale(${0.85 + 0.15 * inK})`,
    opacity: String(clamp01(inK) * (1 - outK))
  }
})

// ─── Words for screen readers only ───────────────────────────────────────────
const srText = computed(() => {
  const b = box.value
  if (!b) return ''
  const line = t('barrage.merge.sr', { from: b.fromTier, to: b.toTier })
  const c = codex.value
  return c ? `${line} ${t('barrage.merge.discovery', { name: c.name, ability: c.abilityName, desc: c.abilityDesc })}` : line
})

const skip = (): void => { finishMerge() }
const onKey = (e: KeyboardEvent): void => {
  if (!box.value) return
  if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    skip()
  }
}

let unregister: (() => void) | null = null
onMounted(() => {
  unregister = registerMergeBoxView()
  window.addEventListener('resize', measure)
  window.addEventListener('keydown', onKey)
  // The discovery's NEW BALL moment resumes when the lightbox ends: its sting
  // is played here (the tray's merge juice was skipped for this merge).
  setRevealResumeHook((_tier, target) => {
    if (claimRevealSound(target)) playSound('new-tier-reveal', 0.09)
  })
  if (box.value) start()
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', measure)
  window.removeEventListener('keydown', onKey)
  setRevealResumeHook(null)
  unregister?.()
  // Never leave the game paused behind a view that is gone.
  finishMerge()
})
</script>

<template lang="pug">
  Teleport(to="body")
    div.sr-only(aria-live="polite") {{ srText }}
    div.merge-box.fixed.inset-0(
      v-if="box && geo"
      :style="{ opacity: layerOpacity }"
      role="button"
      tabindex="0"
      :aria-label="t('barrage.merge.skipAria')"
      @pointerdown.prevent
      @click="skip"
    )
      //- The dim, with a window over the tray (and the launcher, once the comet lands).
      svg.absolute.inset-0(width="100%" height="100%" aria-hidden="true")
        defs
          mask(:id="'mb-mask-' + box.seq")
            rect(width="100%" height="100%" fill="#fff")
            rect(
              :x="geo.tray.left - 6" :y="geo.tray.top - 6"
              :width="geo.tray.width + 12" :height="geo.tray.height + 12"
              rx="16" fill="#000"
            )
            circle(v-if="geo.launcher && launcherHoleR > 0" :cx="geo.launcher.x" :cy="geo.launcher.y" :r="launcherHoleR" fill="#000")
        rect(width="100%" height="100%" fill="rgba(3, 6, 14, 0.74)" :mask="'url(#mb-mask-' + box.seq + ')'")
        rect.mb-tray-rim(
          :x="geo.tray.left - 6" :y="geo.tray.top - 6"
          :width="geo.tray.width + 12" :height="geo.tray.height + 12"
          rx="16"
        )
        //- The comet: the new ball's colour, into the unit.
        polyline.mb-trail(
          v-if="trailPath"
          :points="trailPath"
          :stroke="trailColor"
          :style="{ color: trailColor }"
          :stroke-width="Math.max(4, slotSize * 0.18)"
          fill="none" stroke-linecap="round" stroke-linejoin="round"
        )
        circle.mb-ring(v-if="launcherRing" :cx="launcherRing.x" :cy="launcherRing.y" :r="launcherRing.r" :stroke="trailColor" :style="{ opacity: launcherRing.o }")
      div.mb-comet.absolute.rounded-full(
        v-if="cometHead"
        :style="{ left: cometHead.x + 'px', top: cometHead.y + 'px', width: slotSize * 0.55 + 'px', height: slotSize * 0.55 + 'px', '--rim': trailColor }"
        aria-hidden="true"
      )
      //- The twins.
      div.mb-orb.absolute(v-for="tw in twins" :key="tw.key" :style="[orbStyle(box.fromTier), tw.style]" aria-hidden="true")
        img.mb-orb__portrait(:src="fighterSrc(box.fromTier)" alt="" draggable="false")
        span.mb-orb__gloss
        span.mb-orb__tier.game-text {{ box.fromTier }}
      //- The fuse.
      div.mb-flash.absolute.rounded-full(v-if="flashStyle && !reduced" :style="flashStyle" aria-hidden="true")
      div.mb-orb.mb-orb--result.absolute(v-if="resultStyle" :style="[orbStyle(box.toTier), resultStyle]" aria-hidden="true")
        img.mb-orb__portrait(:src="fighterSrc(box.toTier)" alt="" draggable="false")
        span.mb-orb__gloss
        span.mb-orb__tier.game-text {{ box.toTier }}
      //- A discovery's codex entry.
      div.mb-codex.absolute.flex.items-center.gap-2.rounded-2xl(v-if="codex && codexStyle" :style="[codexStyle, { '--rim': codex.rim }]" aria-hidden="true")
        div.mb-codex__orb.shrink-0
          img.w-full.h-full.object-contain(:src="fighterSrc(codex.tier)" alt="" draggable="false")
          span.mb-codex__tier.game-text {{ codex.tier }}
        div.flex.flex-col.min-w-0.flex-1.items-start.text-start
          div.flex.items-center.gap-1.min-w-0.w-full
            BarrageGlyph.mb-codex__book.shrink-0(name="codex")
            span.mb-codex__name.game-text.font-black.uppercase.truncate {{ codex.name }}
          span.mb-codex__dmg.game-text.font-black {{ codex.damage }}
          div.mb-codex__ability.flex.items-center.gap-1.min-w-0.w-full
            span.mb-codex__icon.shrink-0.flex.items-center.justify-center.rounded-full
              BarrageGlyph.w-full.h-full(:name="codex.ability")
            span.game-text.font-black.truncate {{ codex.abilityName }}
</template>

<style scoped lang="sass">
// Above everything in the scene, the teleported top bar (55), the coach (69–71)
// and the modals (50): the game is paused and this is the only thing going on.
.merge-box
  z-index: 80
  cursor: pointer
  touch-action: none
  -webkit-tap-highlight-color: transparent
  outline: none

.mb-tray-rim
  fill: none
  stroke: rgba(255, 226, 122, 0.9)
  stroke-width: 2.5
  filter: drop-shadow(0 0 6px rgba(255, 210, 90, 0.8))

.mb-trail
  opacity: 0.9
  filter: drop-shadow(0 0 6px currentColor)
.mb-ring
  fill: none
  stroke-width: 4
  filter: drop-shadow(0 0 8px rgba(255, 230, 150, 0.9))
.mb-comet
  translate: -50% -50%
  background: radial-gradient(circle, #fffbe8 0%, var(--rim) 55%, rgba(0, 0, 0, 0) 75%)
  box-shadow: 0 0 14px var(--rim)

// Same glass orb as the tray's (BallTray), so the twins read as tray balls.
.mb-orb
  border-radius: 50%
  overflow: hidden
  background: radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--light) 55%, #0b1224) 0%, color-mix(in srgb, var(--body) 45%, #070b18) 70%, #050810 100%)
  box-shadow: 0 0 0 2px var(--rim), 0 0 12px color-mix(in srgb, var(--rim) 80%, transparent), inset 0 -3px 6px rgba(0, 0, 0, 0.55)
  transform-origin: center
.mb-orb--result
  box-shadow: 0 0 0 2.5px var(--rim), 0 0 22px var(--rim), inset 0 -3px 6px rgba(0, 0, 0, 0.55)
.mb-orb__portrait
  position: absolute
  inset: 8%
  width: 84%
  height: 84%
  object-fit: contain
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6))
.mb-orb__gloss
  position: absolute
  inset: 0
  border-radius: 50%
  background: radial-gradient(ellipse 55% 35% at 36% 22%, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0) 70%)
.mb-orb__tier
  position: absolute
  right: 4%
  bottom: 2%
  min-width: 38%
  padding: 0 2px
  border-radius: 999px
  background: #0e1426
  border: 1.5px solid #fff
  color: #fff
  font-size: 11px
  line-height: 1.15
  text-align: center
  font-weight: 900

.mb-flash
  translate: -50% -50%
  background: radial-gradient(circle, #ffffff 0%, rgba(255, 250, 220, 0.85) 30%, rgba(255, 220, 120, 0) 70%)

.mb-codex
  padding: 8px 10px
  background: linear-gradient(180deg, rgba(24, 32, 64, 0.97), rgba(10, 14, 32, 0.97))
  border: 2px solid #0f1a30
  box-shadow: 0 0 0 2px var(--rim), 0 0 18px color-mix(in srgb, var(--rim) 70%, transparent), 0 8px 18px rgba(0, 0, 0, 0.6)
  transform-origin: 50% 100%
  color: #fff
.mb-codex__orb
  position: relative
  width: 48px
  height: 48px
  border-radius: 50%
  background: radial-gradient(circle, color-mix(in srgb, var(--rim) 35%, #0b1224), #060a16 75%)
  box-shadow: 0 0 0 2px var(--rim)
.mb-codex__tier
  position: absolute
  right: -3px
  bottom: -3px
  padding: 0 4px
  border-radius: 999px
  background: #0e1426
  border: 1.5px solid #fff
  font-size: 11px
  font-weight: 900
  line-height: 1.2
.mb-codex__book
  width: 14px
  height: 14px
  color: #ffb13b
.mb-codex__name
  font-size: 14px
  line-height: 1.1
  color: #fff3c4
  text-shadow: 0 1px 0 #000
.mb-codex__dmg
  font-size: 12px
  color: #ffe27a
  text-shadow: 0 1px 0 #000
.mb-codex__ability
  font-size: 12px
  color: #bfe6ff
  text-shadow: 0 1px 0 #000
.mb-codex__icon
  width: 20px
  height: 20px
  padding: 2px
  color: #ffffff
  background: color-mix(in srgb, var(--rim) 55%, #0b1224)
  box-shadow: 0 0 0 1.5px var(--rim)
</style>
