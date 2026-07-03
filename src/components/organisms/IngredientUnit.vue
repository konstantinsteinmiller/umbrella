<script setup lang="ts">
/**
 * A single living ingredient unit, drawn as a scalable inline SVG in the GDD's
 * "Vibrant Stylized Vector Cartoon" style: a saturated rounded body with bold
 * black linework, a furious little face, and per-tier flourishes (ember sparks,
 * leaf crown, frost spikes, knight helmet, …). Purely presentational — the grid
 * owns dragging; this just reacts to `dragging` / `merging` flags with scale and
 * a squish keyframe. Fills its container; the slot decides the size.
 */
import { computed } from 'vue'
import { getIngredient } from '@/game/ingredients'
import { artSrc, type ArtKey } from '@/use/useArtOverrides'

const props = withDefaults(defineProps<{
  tier: number
  dragging?: boolean
  merging?: boolean
  /** Disable the idle breathing loop (e.g. for the flying inject ghost). */
  still?: boolean
}>(), { dragging: false, merging: false, still: false })

const ing = computed(() => getIngredient(props.tier))

// Drop-in bitmap override (art-todo.md): `images/units/fighter-<tier>.webp`.
// Null until the file exists and decodes — the SVG below is the fallback.
const bitmap = computed(() => artSrc(`fighter-${props.tier}` as ArtKey))

// Unique gradient ids per instance so multiple SVGs never collide in <defs>.
const uid = `ing${(Math.random() * 1e9) | 0}`
</script>

<template lang="pug">
  div.ingredient-unit.relative.select-none(
    :class="[{ 'is-dragging': dragging, 'is-merging': merging, 'is-idle': !still && !dragging }]"
  )
    //- Drop-in bitmap art (keeps the same squish/breathe wrapper animations)
    template(v-if="bitmap")
      img.w-full.h-full.object-contain(
        :src="bitmap" alt="" draggable="false"
        :style="{ filter: dragging ? 'drop-shadow(0 6px 8px rgba(0,0,0,0.45))' : 'drop-shadow(0 3px 3px rgba(0,0,0,0.35))' }"
      )
      span.tier-badge {{ tier }}
    svg(v-else viewBox="0 0 100 100" class="w-full h-full overflow-visible" :style="{ filter: dragging ? 'drop-shadow(0 6px 8px rgba(0,0,0,0.45))' : 'drop-shadow(0 3px 3px rgba(0,0,0,0.35))' }")
      defs
        radialGradient(:id="uid + '-body'" cx="38%" cy="32%" r="80%")
          stop(offset="0%" :stop-color="ing.bodyLight")
          stop(offset="60%" :stop-color="ing.body")
          stop(offset="100%" :stop-color="ing.body")
        radialGradient(:id="uid + '-gloss'" cx="35%" cy="25%" r="40%")
          stop(offset="0%" stop-color="rgba(255,255,255,0.9)")
          stop(offset="100%" stop-color="rgba(255,255,255,0)")

      //- ── Tier-specific BEHIND-body decorations (aura / helmet back) ──
      g(v-if="ing.mood === 'blaze'")
        path(d="M50 6 C58 2 70 10 64 20 C74 16 80 30 70 34 M50 6 C42 2 30 10 36 20 C26 16 20 30 30 34" :fill="ing.accent" opacity="0.9" stroke="#000" stroke-width="2" stroke-linejoin="round")

      //- ── Body ──
      rect(x="14" y="16" width="72" height="72" rx="22" ry="22" :fill="'url(#' + uid + '-body)'" stroke="#000" stroke-width="4.5")
      //- Boil surface bubbles (acid)
      g(v-if="ing.mood === 'boil'" stroke="#000" stroke-width="2")
        circle(cx="32" cy="70" r="6" :fill="ing.accent")
        circle(cx="55" cy="76" r="4.5" :fill="ing.accent")
        circle(cx="70" cy="66" r="5" :fill="ing.accent")
      //- Gloss highlight
      ellipse(cx="40" cy="34" rx="18" ry="12" :fill="'url(#' + uid + '-gloss)'")
      //- Shiny catalyst extra spec
      circle(v-if="ing.mood === 'shiny'" cx="64" cy="30" r="5" fill="#fff" opacity="0.85")

      //- ── Eyes ──
      template(v-if="ing.mood === 'cosmic'")
        //- Knight helmet visor + shades
        rect(x="20" y="40" width="60" height="16" rx="6" fill="#0c0c18" stroke="#000" stroke-width="4")
        rect(x="26" y="44" width="20" height="8" rx="3" :fill="ing.glow")
        rect(x="54" y="44" width="20" height="8" rx="3" :fill="ing.glow")
        path(d="M14 30 Q50 4 86 30" fill="none" stroke="#000" stroke-width="4")
      template(v-else)
        g
          //- Eye whites
          ellipse(cx="38" cy="46" rx="11" ry="13" fill="#fff" stroke="#000" stroke-width="3.5")
          ellipse(cx="64" cy="46" rx="11" ry="13" fill="#fff" stroke="#000" stroke-width="3.5")
          //- Pupils
          circle(cx="40" cy="49" r="5.5" fill="#101018")
          circle(cx="66" cy="49" r="5.5" fill="#101018")
          circle(cx="38" cy="46" r="1.8" fill="#fff")
          circle(cx="64" cy="46" r="1.8" fill="#fff")

      //- Angry brows for the furious base droplet
      g(v-if="ing.mood === 'furious'" stroke="#000" stroke-width="4" stroke-linecap="round")
        line(x1="28" y1="34" x2="46" y2="40")
        line(x1="72" y1="34" x2="54" y2="40")
      //- Spark voltage lines across the eyes
      g(v-else-if="ing.mood === 'spark'" stroke="#000" stroke-width="3" fill="none" stroke-linejoin="round")
        polyline(points="24,40 30,36 28,44 36,40")
        polyline(points="76,40 70,36 72,44 64,40")
      //- Eyepatch bandana for pyro-core
      path(v-else-if="ing.mood === 'blaze'" d="M52 38 L82 44 L80 54 L54 52 Z" fill="#1a1a1a" stroke="#000" stroke-width="3")

      //- ── Mouth (mood-driven) ──
      path(v-if="ing.mood === 'furious'" d="M36 70 Q50 60 64 70" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round")
      path(v-else-if="ing.mood === 'blaze' || ing.mood === 'boil'" d="M36 66 Q50 82 64 66 Q50 74 36 66 Z" fill="#3a0a0a" stroke="#000" stroke-width="3")
      path(v-else-if="ing.mood === 'frost'" d="M40 70 L46 66 L52 70 L58 66 L64 70" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round")
      path(v-else d="M38 66 Q50 78 62 66" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round")

      //- ── ON-TOP decorations ──
      //- Ember forehead sparks
      g(v-if="ing.mood === 'burning'" :fill="ing.accent" stroke="#000" stroke-width="2")
        path(d="M44 18 q-4 -10 2 -16 q2 8 6 10 q-2 6 -8 6 z")
        path(d="M58 16 q-3 -8 1 -13 q2 6 5 8 q-2 5 -6 5 z")
      //- Vapor puffy bumps
      g(v-else-if="ing.mood === 'puffy'" :fill="ing.bodyLight" stroke="#000" stroke-width="3")
        circle(cx="34" cy="16" r="9")
        circle(cx="52" cy="11" r="11")
        circle(cx="70" cy="17" r="9")
      //- Bio-sprout leaf crown
      g(v-else-if="ing.mood === 'sprout'" :fill="ing.accent" stroke="#000" stroke-width="3" stroke-linejoin="round")
        path(d="M50 16 C44 4 30 4 28 12 C36 16 44 16 50 16 Z")
        path(d="M50 16 C56 2 72 4 74 12 C66 17 56 17 50 16 Z")
        line(x1="50" y1="16" x2="50" y2="8" stroke="#000" stroke-width="3")
      //- Cryo frost spikes
      g(v-else-if="ing.mood === 'frost'" fill="#fff" stroke="#000" stroke-width="2.5" stroke-linejoin="round")
        path(d="M28 18 l5 -12 l5 12 z")
        path(d="M47 14 l5 -14 l5 14 z")
        path(d="M66 18 l5 -12 l5 12 z")

      //- Tier number badge (readability)
      g
        circle(cx="80" cy="80" r="13" fill="#0e1426" stroke="#fff" stroke-width="2.5")
        text(x="80" y="85" text-anchor="middle" font-size="15" font-weight="900" fill="#fff" font-family="inherit") {{ tier }}
</template>

<style scoped lang="sass">
.ingredient-unit
  width: 100%
  height: 100%
  transform-origin: center
  will-change: transform
  // Container so the bitmap tier badge can scale off the unit's own size.
  container-type: size

// Tier readability badge over drop-in bitmap art (the SVG draws its own).
.tier-badge
  position: absolute
  right: 2%
  bottom: 2%
  width: 28%
  height: 28%
  display: flex
  align-items: center
  justify-content: center
  border-radius: 9999px
  background: #0e1426
  border: 2px solid #fff
  color: #fff
  font-weight: 900
  font-size: 17cqmin
  pointer-events: none

.is-idle
  animation: ing-breathe 2.6s ease-in-out infinite

.is-dragging
  animation: none
  transform: scale(1.18)
  z-index: 50

.is-merging
  animation: ing-squish 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)

@keyframes ing-breathe
  0%, 100%
    transform: translateY(0) scale(1)
  50%
    transform: translateY(-2%) scale(1.03)

@keyframes ing-squish
  0%
    transform: scale(1)
  30%
    transform: scale(0.8)
  60%
    transform: scale(1.15)
  100%
    transform: scale(1)
</style>
