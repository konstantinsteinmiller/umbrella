<script setup lang="ts">
/**
 * ─── /#/playground — every replaceable drawable, at once (DEV ONLY) ─────────
 *
 * The verification scene of the art-generation-pipeline: each painted drop-in
 * on screen, moving, inside a dashed box showing what it may occupy, with the
 * art layer flipping LIVE — a painted part is only ever wrong relative to the
 * drawing it stands in for, and one button puts the two side by side.
 *
 * RULE 1 — the game's own painters, not lookalikes: fighters are
 * `IngredientUnit` (grid slot composed exactly as MergeGrid does it), enemies
 * and bosses are `EnemyUnit` (its own slime variant, boss rotation, reused-boss
 * tint and spitter mirror), spells are `SpellButton`. The flip is
 * `setArtOverrides`, the same flag the whole game reads.
 *
 * The one exception is labelled on screen: the projectile / VFX sheets are
 * stepped here with a COPY of BattleArena's `impact-sheet-9` keyframes and
 * sizes, because that CSS is scoped inside BattleArena and its impact player
 * is not exported. If they drift, this section lies — extracting them into a
 * shared stylesheet would make it rule-1 too.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'
import EnemyUnit from '@/components/organisms/EnemyUnit.vue'
import SpellButton from '@/components/atoms/SpellButton.vue'
import {
  artSrc, artOverridesEnabled, setArtOverrides, probeArtOverrides, refreshArtOverrides, type ArtKey
} from '@/use/useArtOverrides'
import { ART_KEYS } from '@/game/artCatalogue'
import { ENEMY_DEFS, type EnemyKind } from '@/game/units'

onMounted(() => probeArtOverrides())

const painted = computed(() => artOverridesEnabled.value)
const flip = (): void => setArtOverrides(!artOverridesEnabled.value)
const paintedCount = computed(() => ART_KEYS.filter((k) => artSrc(k)).length)

const TIERS = Array.from({ length: 20 }, (_, i) => i + 1)

// The empty merge slot, composed as MergeGrid composes it.
const slotStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  const art = artSrc('slot-frame')
  if (art) {
    style.backgroundImage = `url(${art})`
    style.backgroundSize = '100% 100%'
    style.borderColor = 'transparent'
  }
  return style
})

const enraged = ref(false)
const WALKERS: EnemyKind[] = ['slime', 'slime', 'slime', 'runner', 'brute', 'spitter', 'warlock']
/** Boss waves: the six authored sprites, then two reused (darkened) ones. */
const BOSS_WAVES = [5, 10, 15, 20, 25, 30, 35, 40]
const enemyBox = (kind: EnemyKind): string => `${Math.round(64 * ENEMY_DEFS[kind].scale)}px`

const PROJECTILES = ['fire', 'ice', 'stone', 'shadow'] as const
const FLIGHTS = ['fire', 'wind', 'cosmic'] as const
const IMPACTS = ['fire', 'ice', 'wind', 'stone', 'cosmic', 'shadow'] as const
const ANGLES = [0, 90, 180, 270]

/** Restart the one-shot impact animations every 1.2 s so they keep playing. */
const impactCycle = ref(0)
let impactTimer = 0
onMounted(() => { impactTimer = window.setInterval(() => { impactCycle.value++ }, 1200) })
onUnmounted(() => window.clearInterval(impactTimer))

const key = (k: string): ArtKey => k as ArtKey
</script>

<template lang="pug">
  div.playground
    div.bar
      h1 Playground
      button.flip(@click="flip" :class="{ on: painted }") {{ painted ? 'Painted' : 'Drawn' }} — flip
      button(@click="refreshArtOverrides") Re-probe art
      label
        input(type="checkbox" v-model="enraged")
        |  enraged
      span.sub {{ paintedCount }}/{{ ART_KEYS.length }} painted keys resolved · art {{ painted ? 'ON' : 'OFF' }}
      a(href="#/art-sheets") art sheets →

    section
      h2 Fighters — on a merge slot (IngredientUnit, slot as MergeGrid)
      div.row
        div.cell(v-for="t in TIERS" :key="'s' + t")
          div.slot(:style="slotStyle")
            div.box
              IngredientUnit(:tier="t")
          span.cap T{{ t }}

    section
      h2 Fighters — arena size, idle breathe
      div.row
        div.cell(v-for="t in TIERS" :key="'a' + t")
          div.box(style="width: 56px; height: 56px")
            IngredientUnit(:tier="t")
          span.cap T{{ t }}

    section
      h2 Enemies (EnemyUnit — box = 64 px × the arena's ENEMY_DEFS scale)
      div.row
        div.cell(v-for="(k, i) in WALKERS" :key="'e' + i")
          div.box(:style="{ width: enemyBox(k), height: enemyBox(k) }")
            EnemyUnit(:kind="k" :enraged="enraged")
          span.cap {{ k }}
      p.note Three slimes on purpose: EnemyUnit picks the caterpillar variant for about half of them.

    section
      h2 Bosses by wave (reused past 30 — darkened by EnemyUnit)
      div.row
        div.cell(v-for="w in BOSS_WAVES" :key="'b' + w")
          div.box(style="width: 120px; height: 120px")
            EnemyUnit(kind="boss" :boss-wave="w" :enraged="enraged")
          span.cap wave {{ w }}

    section
      h2 Spells (SpellButton, ready and locked)
      div.row
        div.cell(v-for="s in ['spell-heal', 'spell-revive', 'spell-defender', 'meteor-button']" :key="s")
          div.pair
            SpellButton(:pct="100" :ready="true" :icon-art="artSrc(key(s))" accent="#ffd23a" :label="s")
            SpellButton(:pct="40" :ready="false" :locked="true" :price="1000" :affordable="false" :icon-art="artSrc(key(s))" accent="#ffd23a" :label="s")
          span.cap {{ s }}
      div.row
        div.cell
          div.box.wings-stage
            img.wings(v-if="artSrc('revive-wings')" :src="artSrc('revive-wings') ?? ''" alt="")
            div.wing-unit
              IngredientUnit(:tier="6" :still="true")
          span.cap revive-wings behind a unit (arena CSS)
        div.cell
          div.box(style="width: 80px; height: 80px; position: relative")
            IngredientUnit(:tier="11" :still="true")
            img.crest(v-if="artSrc('spell-defender')" :src="artSrc('spell-defender') ?? ''" alt="")
          span.cap tank crest over a unit

    section
      h2 Projectiles — static, rotated as the arena rotates them
      div.row
        div.cell(v-for="p in PROJECTILES" :key="p")
          div.pair
            div.box.proj(v-for="a in ANGLES" :key="a")
              img(v-if="artSrc(key('proj-' + p))" :src="artSrc(key('proj-' + p)) ?? ''" :style="{ transform: 'rotate(' + a + 'deg)' }" alt="")
              span.fallback(v-else) dot
          span.cap {{ p }}

    section
      h2 VFX sheets — stepped with a COPY of BattleArena's keyframes
      div.row
        div.cell(v-for="f in FLIGHTS" :key="'f' + f")
          div.box.sheet-box
            div.sheet.flight(v-if="artSrc(key('proj-anim-' + f))" :style="{ backgroundImage: 'url(' + artSrc(key('proj-anim-' + f)) + ')' }")
            span.fallback(v-else) static / dot
          span.cap flight {{ f }}
        div.cell(v-for="f in IMPACTS" :key="'i' + f")
          div.box.sheet-box
            div.sheet.impact(v-if="artSrc(key('impact-' + f))" :key="impactCycle" :style="{ backgroundImage: 'url(' + artSrc(key('impact-' + f)) + ')' }")
            span.fallback(v-else) sparkle
          span.cap impact {{ f }}

    section
      h2 World
      div.row
        div.cell
          div.box(style="width: 90px; height: 128px")
            img.fit(v-if="artSrc('gate')" :src="artSrc('gate') ?? ''" alt="")
            span.fallback(v-else) CSS door
          span.cap gate
        div.cell
          div.box(style="width: 96px; height: 96px")
            img.fit.spin(v-if="artSrc('arena-portal')" :src="artSrc('arena-portal') ?? ''" alt="")
            span.fallback(v-else) CSS portal
          span.cap portal
        div.cell
          div.box(style="width: 110px; height: 110px")
            img.fit.bob(v-if="artSrc('flying-chest')" :src="artSrc('flying-chest') ?? ''" alt="")
            span.fallback(v-else) chest icon
          span.cap flying chest
        div.cell
          div.box(style="width: 240px; height: 120px")
            img.cover(v-if="artSrc('arena-bg')" :src="artSrc('arena-bg') ?? ''" alt="")
            span.fallback(v-else) gradient
          span.cap arena-bg
        div.cell
          div.box(style="width: 68px; height: 120px")
            img.cover(v-if="artSrc('scene-bg')" :src="artSrc('scene-bg') ?? ''" alt="")
            span.fallback(v-else) gradient
          span.cap scene-bg
</template>

<style scoped lang="sass">
// Scroll inside the view: the game shell is a fixed, overflow-hidden screen.
.playground
  position: fixed
  inset: 0
  z-index: 100
  overflow-y: auto
  padding: 10px 16px 48px
  background: #1a1d27
  color: #dfe3ee
  font: 13px/1.4 system-ui, sans-serif
.bar
  position: sticky
  top: -10px
  z-index: 5
  display: flex
  flex-wrap: wrap
  align-items: center
  gap: 10px
  padding: 8px 0
  background: #1a1d27
  h1
    margin: 0
    font-size: 20px
    font-weight: 800
  button
    padding: 5px 10px
    border-radius: 6px
    border: 1px solid #555c80
    background: #2a2f45
    color: #fff
    font-weight: 700
    cursor: pointer
  .flip.on
    border-color: #ffd23a
    color: #ffd23a
  .sub
    opacity: 0.7
  a
    color: #9cc3ff
h2
  margin: 16px 0 8px
  font-size: 14px
  text-transform: uppercase
  letter-spacing: 0.06em
  opacity: 0.8
.note
  opacity: 0.6
  margin: 4px 0 0
.row
  display: flex
  flex-wrap: wrap
  gap: 10px
  align-items: flex-end
.cell
  display: flex
  flex-direction: column
  align-items: center
  gap: 4px
.cap
  font-size: 11px
  opacity: 0.7
// The dashed box is what each drawable may occupy — overflow is the commonest
// fault, and invisible without something to overflow.
.box
  position: relative
  display: flex
  align-items: center
  justify-content: center
  outline: 1px dashed rgba(255, 210, 58, 0.55)
  outline-offset: 0
.slot
  width: 72px
  height: 72px
  padding: 6px
  border: 2px dashed rgba(255, 255, 255, 0.25)
  border-radius: 10px
  .box
    width: 100%
    height: 100%
.pair
  display: flex
  gap: 6px
.proj
  width: 36px
  height: 36px
  img
    width: 30px
    height: 30px
    object-fit: contain
.fallback
  font-size: 10px
  opacity: 0.55
.fit
  max-width: 100%
  max-height: 100%
  object-fit: contain
.cover
  width: 100%
  height: 100%
  object-fit: cover
.spin
  animation: pg-spin 3s linear infinite
.bob
  animation: pg-bob 1.2s ease-in-out infinite alternate
@keyframes pg-spin
  to
    transform: rotate(360deg)
@keyframes pg-bob
  from
    transform: translateY(-4%)
  to
    transform: translateY(4%)
.wings-stage
  width: 150px
  height: 80px
  .wing-unit
    position: relative
    width: 52px
    height: 52px
  // Same arithmetic as BattleArena's .revive-wings (258% of the unit, 44% down).
  .wings
    position: absolute
    left: 50%
    top: 44%
    width: calc(52px * 2.58)
    transform: translate(-50%, -50%)
    filter: brightness(1.3) contrast(1.08) drop-shadow(0 0 7px rgba(150, 210, 255, 0.95))
.crest
  position: absolute
  left: 50%
  bottom: 0
  width: 60%
  transform: translate(-50%, 0)
// ── VFX sheets: a COPY of BattleArena's sizes + keyframes (see the header) ──
.sheet-box
  width: 64px
  height: 64px
.sheet
  width: 57px
  height: 57px
  background-size: 300% 300%
  background-repeat: no-repeat
.flight
  animation: pg-sheet-9 0.5s step-end infinite
.impact
  animation: pg-sheet-9 0.48s step-end forwards
@keyframes pg-sheet-9
  0%
    background-position: 0% 0%
  11.111%
    background-position: 50% 0%
  22.222%
    background-position: 100% 0%
  33.333%
    background-position: 0% 50%
  44.444%
    background-position: 50% 50%
  55.555%
    background-position: 100% 50%
  66.666%
    background-position: 0% 100%
  77.777%
    background-position: 50% 100%
  88.888%
    background-position: 100% 100%
</style>
