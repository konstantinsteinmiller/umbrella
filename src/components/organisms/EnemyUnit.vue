<script setup lang="ts">
/**
 * A single enemy, drawn inline-SVG in the same "vibrant cartoon, bold black
 * linework" style as `IngredientUnit.vue` so both armies share one visual
 * language. Five walker archetypes + the boss. Purely presentational — the
 * arena owns position/HP; this reacts to `enraged` with a red flush.
 */
import { computed } from 'vue'
import type { EnemyKind } from '@/game/units'

const props = withDefaults(defineProps<{
  kind: EnemyKind
  enraged?: boolean
}>(), { enraged: false })

interface Palette { body: string; light: string; accent: string }
const PALETTES: Record<EnemyKind, Palette> = {
  slime: { body: '#46b86a', light: '#8fe0a8', accent: '#1d7a3a' },
  runner: { body: '#ff8a3c', light: '#ffc08a', accent: '#b84a10' },
  brute: { body: '#8a5cc8', light: '#b993ec', accent: '#4a2a80' },
  spitter: { body: '#2ab8b0', light: '#7fe0da', accent: '#0e6a66' },
  warlock: { body: '#3a4470', light: '#6a77a8', accent: '#c05cff' },
  boss: { body: '#c83a3a', light: '#ff8a7a', accent: '#7a1010' }
}
const pal = computed<Palette>(() => props.enraged
  ? { body: '#e03a2a', light: '#ff8a6a', accent: '#7a1010' }
  : PALETTES[props.kind])

const uid = `en${(Math.random() * 1e9) | 0}`
</script>

<template lang="pug">
  div.enemy-unit.relative.select-none
    svg(viewBox="0 0 100 100" class="w-full h-full overflow-visible" style="filter: drop-shadow(0 3px 3px rgba(0,0,0,0.35))")
      defs
        radialGradient(:id="uid + '-b'" cx="38%" cy="32%" r="80%")
          stop(offset="0%" :stop-color="pal.light")
          stop(offset="60%" :stop-color="pal.body")
          stop(offset="100%" :stop-color="pal.body")

      //- ── Slime: gooey blob ──
      template(v-if="kind === 'slime'")
        path(d="M50 18 C74 18 86 40 84 62 C92 66 90 78 80 80 C70 88 30 88 20 80 C10 78 8 66 16 62 C14 40 26 18 50 18 Z" :fill="'url(#' + uid + '-b)'" stroke="#000" stroke-width="4.5")
        circle(cx="30" cy="74" r="5" :fill="pal.accent" stroke="#000" stroke-width="2")
        circle(cx="68" cy="78" r="4" :fill="pal.accent" stroke="#000" stroke-width="2")

      //- ── Runner: lean imp with legs ──
      template(v-else-if="kind === 'runner'")
        path(d="M50 14 C70 14 78 32 74 52 L70 78 L58 70 L50 84 L42 70 L30 78 L26 52 C22 32 30 14 50 14 Z" :fill="'url(#' + uid + '-b)'" stroke="#000" stroke-width="4.5")
        //- Horns
        path(d="M32 20 L22 6 L38 14 Z" :fill="pal.accent" stroke="#000" stroke-width="3")
        path(d="M68 20 L78 6 L62 14 Z" :fill="pal.accent" stroke="#000" stroke-width="3")

      //- ── Brute: heavy slab + horns ──
      template(v-else-if="kind === 'brute'")
        rect(x="12" y="20" width="76" height="66" rx="16" :fill="'url(#' + uid + '-b)'" stroke="#000" stroke-width="5")
        path(d="M20 24 L6 6 L32 14 Z" :fill="pal.accent" stroke="#000" stroke-width="3.5")
        path(d="M80 24 L94 6 L68 14 Z" :fill="pal.accent" stroke="#000" stroke-width="3.5")
        //- Belly plate
        path(d="M28 66 Q50 78 72 66 L72 84 Q50 92 28 84 Z" :fill="pal.accent" opacity="0.5" stroke="#000" stroke-width="3")

      //- ── Spitter: round lobber with open maw ──
      template(v-else-if="kind === 'spitter'")
        circle(cx="50" cy="52" r="36" :fill="'url(#' + uid + '-b)'" stroke="#000" stroke-width="4.5")
        //- Open maw
        ellipse(cx="38" cy="64" rx="14" ry="10" fill="#1a2a1a" stroke="#000" stroke-width="3")
        circle(cx="38" cy="60" r="3" fill="#9cff2e")
        //- Back spikes
        path(d="M60 18 l8 -12 l4 14 z M74 28 l12 -8 l-2 14 z" :fill="pal.accent" stroke="#000" stroke-width="2.5")

      //- ── Warlock: hooded robe ──
      template(v-else-if="kind === 'warlock'")
        path(d="M50 8 C72 8 76 30 74 44 L84 88 L16 88 L26 44 C24 30 28 8 50 8 Z" :fill="'url(#' + uid + '-b)'" stroke="#000" stroke-width="4.5")
        //- Hood shadow
        path(d="M50 14 C66 14 70 30 68 42 C60 48 40 48 32 42 C30 30 34 14 50 14 Z" fill="#141a30" stroke="#000" stroke-width="3")
        //- Glowing eyes
        circle(cx="42" cy="34" r="4" :fill="pal.accent")
        circle(cx="58" cy="34" r="4" :fill="pal.accent")
        //- Rune
        path(d="M50 60 l8 10 l-8 10 l-8 -10 Z" :fill="pal.accent" opacity="0.9" stroke="#000" stroke-width="2.5")

      //- ── Boss: crowned colossus ──
      template(v-else)
        rect(x="8" y="22" width="84" height="68" rx="18" :fill="'url(#' + uid + '-b)'" stroke="#000" stroke-width="5.5")
        //- Crown
        path(d="M26 22 L26 6 L38 16 L50 2 L62 16 L74 6 L74 22 Z" fill="#ffd23c" stroke="#000" stroke-width="4")
        //- Tusks
        path(d="M30 74 L24 88 L38 80 Z" fill="#fff" stroke="#000" stroke-width="3")
        path(d="M70 74 L76 88 L62 80 Z" fill="#fff" stroke="#000" stroke-width="3")

      //- ── Shared angry face (not for warlock/boss variants that define their own eyes) ──
      template(v-if="kind !== 'warlock'")
        g
          ellipse(cx="38" cy="44" rx="9" ry="10" fill="#fff" stroke="#000" stroke-width="3")
          ellipse(cx="62" cy="44" rx="9" ry="10" fill="#fff" stroke="#000" stroke-width="3")
          circle(cx="40" cy="46" r="4.5" fill="#101018")
          circle(cx="60" cy="46" r="4.5" fill="#101018")
        g(stroke="#000" stroke-width="4" stroke-linecap="round")
          line(x1="28" y1="32" x2="44" y2="38")
          line(x1="72" y1="32" x2="56" y2="38")
        path(v-if="kind === 'boss' || enraged" d="M36 62 Q50 74 64 62 Q50 68 36 62 Z" fill="#3a0a0a" stroke="#000" stroke-width="3")
        path(v-else-if="kind !== 'spitter'" d="M38 62 Q50 56 62 62" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round")
</template>

<style scoped lang="sass">
.enemy-unit
  width: 100%
  height: 100%
  transform-origin: center
</style>
