<script setup lang="ts">
/**
 * A scalable potion bottle, drawn as inline SVG in the bold cartoon style. Ten
 * distinct container silhouettes (GDD §8.1) selectable by `shape`, filled with
 * the recipe's `liquid` colour. `silhouette` renders the undiscovered state — a
 * dark grey outline with a question mark — for the Index book. `glow` adds a
 * legendary aura. Fills its container.
 */
import { computed } from 'vue'
import type { BottleShape } from '@/game/recipes'

const props = withDefaults(defineProps<{
  shape: BottleShape
  liquid: string
  silhouette?: boolean
  glow?: boolean
}>(), { silhouette: false, glow: false })

const fill = computed(() => props.silhouette ? '#3a4256' : props.liquid)
const glass = computed(() => props.silhouette ? 'rgba(120,130,150,0.18)' : 'rgba(255,255,255,0.16)')
const stroke = '#0a0d16'
const uid = `pot${(Math.random() * 1e9) | 0}`
</script>

<template lang="pug">
  div.potion-bottle.relative.w-full.h-full(:class="{ 'is-glow': glow && !silhouette }")
    svg(viewBox="0 0 100 120" class="w-full h-full overflow-visible" :style="{ filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.4))' }")
      defs
        linearGradient(:id="uid" x1="0" y1="0" x2="0" y2="1")
          stop(offset="0%" :stop-color="fill" stop-opacity="0.85")
          stop(offset="100%" :stop-color="fill")
      //- Cork + neck (shared by most shapes)
      g(v-if="shape !== 'sphere' && shape !== 'orb' && shape !== 'heart'")
        rect(x="42" y="6" width="16" height="12" rx="3" fill="#9c6b3f" :stroke="stroke" stroke-width="3")
        rect(x="44" y="14" width="12" height="12" :fill="silhouette ? '#2c3242' : 'rgba(255,255,255,0.25)'" :stroke="stroke" stroke-width="3")

      //- ── Bodies ──
      template(v-if="shape === 'flask'")
        path(d="M44 26 L56 26 L56 50 L78 100 Q80 112 66 112 L34 112 Q20 112 22 100 L44 50 Z" :fill="`url(#${uid})`" :stroke="stroke" stroke-width="4" stroke-linejoin="round")
      template(v-else-if="shape === 'triangle'")
        path(d="M50 28 L82 108 Q84 113 78 113 L22 113 Q16 113 18 108 Z" :fill="`url(#${uid})`" :stroke="stroke" stroke-width="4" stroke-linejoin="round")
      template(v-else-if="shape === 'tube'")
        rect(x="34" y="26" width="32" height="86" rx="16" :fill="`url(#${uid})`" :stroke="stroke" stroke-width="4")
      template(v-else-if="shape === 'vial'")
        rect(x="36" y="40" width="28" height="66" rx="13" :fill="`url(#${uid})`" :stroke="stroke" stroke-width="4")
      template(v-else-if="shape === 'gourd'")
        path(d="M50 26 C40 26 38 44 42 52 C30 60 26 80 36 96 C46 112 64 110 70 94 C78 76 70 60 58 52 C62 44 60 26 50 26 Z" :fill="`url(#${uid})`" :stroke="stroke" stroke-width="4")
      template(v-else-if="shape === 'chalice'")
        path(d="M28 30 L72 30 Q72 64 50 70 Q28 64 28 30 Z" :fill="`url(#${uid})`" :stroke="stroke" stroke-width="4" stroke-linejoin="round")
        rect(x="46" y="70" width="8" height="26" :fill="silhouette ? '#3a4256' : '#d8c060'" :stroke="stroke" stroke-width="3")
        rect(x="30" y="104" width="40" height="9" rx="4" :fill="silhouette ? '#3a4256' : '#d8c060'" :stroke="stroke" stroke-width="3")
      template(v-else-if="shape === 'teardrop'")
        path(d="M50 24 C66 56 78 76 78 90 A28 28 0 1 1 22 90 C22 76 34 56 50 24 Z" :fill="`url(#${uid})`" :stroke="stroke" stroke-width="4")
      template(v-else-if="shape === 'heart'")
        path(d="M50 110 C8 80 16 36 38 36 C46 36 50 42 50 48 C50 42 54 36 62 36 C84 36 92 80 50 110 Z" :fill="`url(#${uid})`" :stroke="stroke" stroke-width="4" stroke-linejoin="round")
      template(v-else)
        //- sphere / orb
        circle(cx="50" cy="74" r="34" :fill="`url(#${uid})`" :stroke="stroke" stroke-width="4")
        rect(v-if="shape === 'orb'" x="40" y="30" width="20" height="14" rx="3" fill="#9c6b3f" :stroke="stroke" stroke-width="3")

      //- Glass highlight
      ellipse(cx="40" cy="60" rx="9" ry="20" :fill="glass" transform="rotate(-18 40 60)")

      //- Question mark for undiscovered
      text(v-if="silhouette" x="50" y="86" text-anchor="middle" font-size="40" font-weight="900" fill="rgba(255,255,255,0.35)" font-family="inherit") ?
</template>

<style scoped lang="sass">
.is-glow svg
  animation: pot-glow 1.8s ease-in-out infinite
@keyframes pot-glow
  0%, 100%
    filter: drop-shadow(0 0 4px rgba(255,210,60,0.6)) drop-shadow(0 3px 3px rgba(0,0,0,0.4))
  50%
    filter: drop-shadow(0 0 14px rgba(255,210,60,0.95)) drop-shadow(0 3px 3px rgba(0,0,0,0.4))
</style>
