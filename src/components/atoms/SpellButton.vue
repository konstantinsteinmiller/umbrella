<script setup lang="ts">
/**
 * One circular arena spell button (Meteor / Heal / Revive Guard). Three states:
 *   • LOCKED   — greyed icon + a coin price tag; click buys it (disabled when
 *                the player can't afford it).
 *   • CHARGING — unlocked; a radial ring fills 0→100% as monsters die.
 *   • READY    — fully charged; pulses and fires on click.
 * A live spell (Revive Guard's 30s window) shows a countdown instead of the ring.
 */
import { computed } from 'vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import SkillIcon, { type SkillIconId } from '@/components/atoms/SkillIcon.vue'
import RuneHintArrow from '@/components/atoms/RuneHintArrow.vue'
import { formatCost } from '@/use/useReward'

const props = defineProps<{
  pct: number              // charge 0..100
  ready: boolean           // unlocked && fully charged
  locked?: boolean         // not yet purchased
  price?: number           // coin cost while locked
  affordable?: boolean     // can pay the price right now
  iconArt?: string | null  // dropped-in bitmap icon
  skill?: SkillIconId      // procedural icon while `iconArt` has no bitmap
  accent?: string          // ring / glow colour
  activeSecs?: number      // >0 → the spell is live (show a countdown)
  label?: string
  hint?: boolean           // coach it: golden glow + a runic arrow above
}>()
const emit = defineEmits<{ (e: 'fire'): void; (e: 'unlock'): void }>()

const RING = 125.6
const ring = computed(() => props.accent ?? '#ff8a1f')
const disabled = computed(() => (props.locked ? !props.affordable : !props.ready))
// Locked but the player can afford it now → highlight (green pulse + live price).
const affordableLocked = computed(() => !!props.locked && !!props.affordable)
const onClick = (): void => { if (props.locked) emit('unlock'); else emit('fire') }
</script>

<template lang="pug">
  button.spell-btn.relative.cursor-pointer(
    class="active:scale-90 transition-transform disabled:cursor-default"
    :class="{ 'spell-ready': ready && !locked && !activeSecs, 'spell-dim': disabled, 'spell-affordable': affordableLocked, 'spell-hint': hint && !locked }"
    :disabled="disabled"
    :aria-label="label"
    @click="onClick"
  )
    //- Sized by `--spell-size` when the row sets it (a row of eight shrinks to
    //- fit its arena), else the classic 44 / 56 px.
    svg.spell-svg(viewBox="0 0 48 48")
      circle(cx="24" cy="24" r="20" fill="#0e1426" stroke="#0f1a30" stroke-width="3")
      //- Charge ring — only meaningful once unlocked.
      circle(
        v-if="!locked"
        cx="24" cy="24" r="20" fill="none" :stroke="ring" stroke-width="3.5" stroke-linecap="round"
        :stroke-dasharray="RING" :stroke-dashoffset="RING * (1 - Math.min(100, pct) / 100)"
        transform="rotate(-90 24 24)"
      )
      //- Icon (greyed while locked). No bitmap yet → the skill's procedural
      //- drawing, else a neutral dot placeholder.
      image(
        v-if="iconArt"
        :href="iconArt" x="8" y="8" width="32" height="32"
        :class="{ 'spell-icon-locked': locked }"
      )
      SkillIcon(
        v-else-if="skill"
        :skill="skill" x="7" y="7" width="34" height="34"
        :class="{ 'spell-icon-locked': locked }"
      )
      circle(v-else cx="24" cy="24" r="9" :fill="ring" :opacity="locked ? 0.35 : 0.85")
      //- Live-window countdown (Revive Guard).
      text(v-if="activeSecs" x="24" y="30" text-anchor="middle" class="spell-timer") {{ activeSecs }}
    //- Coin price tag under a locked spell.
    div.absolute.flex.items-center.rounded-full.border(
      v-if="locked"
      class="left-1/2 -bottom-1.5 -translate-x-1/2 gap-0.5 px-1 py-0 bg-[#0f1a30]"
      :class="affordableLocked ? 'border-emerald-300' : 'border-white/40'"
    )
      IconCoin(class="w-2.5 h-2.5 shrink-0 text-yellow-300")
      //- Green + bright once affordable; dim white while the player can't pay.
      span.font-black.game-text.tabular-nums.leading-none(
        class="text-[8px] sm:text-[9px]"
        :class="affordableLocked ? 'text-emerald-300' : 'text-white/70'"
      ) {{ formatCost(price ?? 0) }}
    //- Coach arrow (first boss: "fire the Meteor now").
    RuneHintArrow.spell-hint-arrow.absolute(v-if="hint && !locked" :size="22")
</template>

<style scoped lang="sass">
.spell-btn:disabled
  pointer-events: none

.spell-svg
  display: block
  width: var(--spell-size, 2.75rem)
  height: var(--spell-size, 2.75rem)
@media (min-width: 640px)
  .spell-svg
    width: var(--spell-size, 3.5rem)
    height: var(--spell-size, 3.5rem)

.spell-ready
  animation: spell-pulse 1.2s ease-in-out infinite
@keyframes spell-pulse
  0%, 100%
    filter: drop-shadow(0 0 0 rgba(255, 220, 120, 0))
  50%
    filter: drop-shadow(0 0 9px rgba(255, 220, 120, 0.95))

.spell-dim
  opacity: 0.55

// Locked-but-affordable: a greenish pulse ring draws the eye until it's bought.
.spell-affordable
  animation: spell-afford 1.1s ease-in-out infinite
@keyframes spell-afford
  0%, 100%
    filter: drop-shadow(0 0 1px rgba(60, 220, 122, 0.5))
  50%
    filter: drop-shadow(0 0 10px rgba(60, 220, 122, 0.95))

// Coached: a hot golden glow that out-shines the ready pulse, plus the arrow.
.spell-hint
  animation: spell-hint-glow 0.8s ease-in-out infinite
@keyframes spell-hint-glow
  0%, 100%
    filter: drop-shadow(0 0 4px rgba(255, 210, 60, 0.85)) drop-shadow(0 0 1px #fff3a8)
  50%
    filter: drop-shadow(0 0 14px rgba(255, 196, 40, 1)) drop-shadow(0 0 3px #fff3a8)
.spell-hint-arrow
  left: 50%
  bottom: calc(100% + 3px)
  margin-left: -11px

.spell-icon-locked
  filter: grayscale(1) brightness(0.55)

.spell-timer
  font: 900 15px system-ui, sans-serif
  fill: #ffffff
  paint-order: stroke
  stroke: #0f1a30
  stroke-width: 3px
</style>
