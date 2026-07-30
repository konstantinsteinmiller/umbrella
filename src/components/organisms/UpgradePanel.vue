<script setup lang="ts">
/**
 * The battle upgrade controls (implementation-plan.md §4.6): War Horns
 * (attack), Vitality (HP), Bounty (gold per kill), Imp Sergeant (automation).
 * A compact row of buy-chips, each with a themed mini-gauge, the current level
 * as a pip bar, and the next cost. Buying spends gold via `useBattle`; the
 * chip flashes and plays a confirm SFX. Fully responsive — chips wrap and
 * shrink on narrow viewports.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import useBattle, { type BattleUpgradeId, BATTLE_UPGRADE_DEFS } from '@/use/useBattle'
import useSounds from '@/use/useSound'
import IconCoin from '@/components/icons/IconCoin.vue'
import { isCompactHud, isUltraCompactHud, isRoomyHud, isWideCompactHud } from '@/use/useUser'

const { t } = useI18n()
const battle = useBattle()
const { playSound } = useSounds()

const ids = Object.keys(BATTLE_UPGRADE_DEFS) as BattleUpgradeId[]

const accent: Record<BattleUpgradeId, string> = {
  attack: '#ff6a2a', vitality: '#36d399', bounty: '#ffd23c', automation: '#5fb0ff', recruit: '#c05cff'
}

const buy = (id: BattleUpgradeId): void => {
  if (battle.buyUpgrade(id)) {
    playSound('upgrade-buy', 0.05, 1.05)
  } else {
    playSound('upgrade-denied', 0.015)
  }
}

const fmt = (n: number): string => {
  if (n >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + 'T'
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K'
  return String(n)
}

// Pip bar: show level out of a soft "page" of 5 (or the upgrade's own max
// when it caps below 5, e.g. Recruits' 3) so the bar stays readable.
const pips = (lvl: number, max: number): boolean[] => {
  const page = Math.min(5, max)
  const within = lvl % page
  const shown = lvl > 0 && within === 0 ? page : within
  return Array.from({ length: page }, (_, i) => i < shown)
}
const tier = (lvl: number): number => Math.floor(lvl / 5)

// ─── Chip type scale ─────────────────────────────────────────────────────────
// Three tiers: compact shrinks for real, roomy (desktop) steps UP — the `sm:`
// sizes top out at phone scale, which left the labels and costs as 10-11px type
// on a 1280×800 desktop.
//
// On the roomy tier the name also gets its own ROW (the header flips to a
// column). Horizontally there is nothing to win: the panel caps at `max-w-md`
// and five chips split it ~86px each, so beside a glyph the label has ~41px —
// `truncate` was already clipping "War Horns" at the old 10px and enlarging it
// in place only clipped more. Stacking buys it the chip's full inner width.
//
// **Gated on the row's MEASURED height, not just the viewport.** The row is
// `h-[15%] min-h-14 max-h-[92px]`, so on a stacked (non-side-by-side) layout it
// collapses to its 56px floor even at 861×640 — a viewport that is otherwise
// "roomy". The enlarged chip needs ~72px, so keying off `isRoomyHud` alone
// overflowed the chip there. Below the threshold every consumer falls back to
// the phone-tuned sizes, i.e. exactly today's rendering.
const rootEl = ref<HTMLElement | null>(null)
const panelH = ref(0)
let panelRo: ResizeObserver | null = null

onMounted(() => {
  const el = rootEl.value
  if (!el) return
  const measure = (): void => { panelH.value = el.clientHeight }
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    panelRo = new ResizeObserver(measure)
    panelRo.observe(el)
  }
})
onUnmounted(() => {
  panelRo?.disconnect()
  panelRo = null
})

/** Chip height the enlarged (stacked glyph + label + pips + cost) layout needs. */
const ROOMY_MIN_H = 74
const roomy = computed(() => isRoomyHud.value && panelH.value >= ROOMY_MIN_H)

// Compact-but-wide (1000×450 and friends) keeps the compact LAYOUT but lifts
// the type — see `isWideCompactHud`. 12px is the ceiling for the name here:
// beside the glyph a chip leaves it ~65px, and "War Horns" needs 59px at 12px.
const nameTextClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'text-xs' : 'text-[12px]')
  : roomy.value ? 'text-[13px]' : 'text-[9px] sm:text-[14px]')
/** Roomy: glyph over label instead of beside it — see above. */
const headerStackClass = computed(() => roomy.value ? 'flex-col gap-0.5' : 'gap-0.25')
const costTextClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'text-[11px]' : 'text-[12px]')
  : roomy.value ? 'text-[13px]' : 'text-[9px] sm:text-[14px]')
const maxedTextClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'text-[11px]' : 'text-[12px]')
  : roomy.value ? 'text-[13px]' : 'text-[9px] sm:text-[14px]')
const glyphClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'w-4 h-4' : 'w-3 h-3')
  : roomy.value ? 'w-6 h-6' : 'w-4 h-4 sm:w-5 sm:h-5')
const coinIconClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'w-3 h-3' : 'w-2 h-2')
  : roomy.value ? 'w-4 h-4' : 'w-2.5 h-2.5 sm:w-3 sm:h-3')

const chips = computed(() => ids.map((id) => ({
  id,
  level: battle.upgradeLevel(id),
  cost: battle.upgradeCost(id),
  maxed: battle.isUpgradeMaxed(id),
  can: battle.canBuyUpgrade(id),
  max: BATTLE_UPGRADE_DEFS[id].max,
  accent: accent[id]
})))
</script>

<template lang="pug">
  //- On `isCompactHud` the whole row has to fit ~36px of height so the merge
  //- grid (which is height-led: `min(100cqh, …)`) gets the rest of the column.
  //- Every dimension is reduced for real — padding, icon, font, pip size and
  //- border — never a transform, which would keep the original footprint.
  div.upgrade-panel.flex.items-stretch.justify-center.w-full.h-full(
    ref="rootEl"
    :class="isCompactHud ? 'gap-0.5' : 'gap-1 sm:gap-1'"
  )
    button.chip.relative.flex.flex-col.items-center.justify-around.rounded-xl(
      v-for="c in chips"
      :key="c.id"
      class="flex-1 min-w-0 active:scale-95 transition-transform !gap-[0px]"
      :class="[\
        c.can ? 'chip-affordable cursor-pointer' : 'opacity-90 cursor-not-allowed',\
        isCompactHud ? 'border px-0.5 py-0 chip--compact' : 'border-2 px-1 py-1 sm:px-2'\
      ]"
      :style="{ '--accent': c.accent }"
      :disabled="!c.can"
      @click="buy(c.id)"
    )
      div.flex.items-center.w-full.justify-center.min-w-0(:class="headerStackClass")
        //- Themed mini gauge
        svg(
          viewBox="0 0 24 24"
          class="shrink-0"
          :class="glyphClass"
          :style="{ color: c.accent }"
        )
          template(v-if="c.id === 'attack'")
            //- Crossed sword
            path(d="M5 19 L15 9 L19 5 L19 9 L9 19 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round")
            line(x1="4" y1="15" x2="9" y2="20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round")
          template(v-else-if="c.id === 'vitality'")
            //- Heart
            path(d="M12 20 C4 14 3 8.5 7 6.5 C9.5 5.3 11.5 7 12 8.5 C12.5 7 14.5 5.3 17 6.5 C21 8.5 20 14 12 20 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round")
          template(v-else-if="c.id === 'bounty'")
            //- Coin stack
            circle(cx="12" cy="9" r="6.5" fill="none" stroke="currentColor" stroke-width="2")
            path(d="M6 15 a6.5 4 0 0 0 12 0 M6 18 a6.5 4 0 0 0 12 0" fill="none" stroke="currentColor" stroke-width="2")
          template(v-else-if="c.id === 'recruit'")
            //- Recruit rank-up: unit square with an ascending arrow
            rect(x="5" y="12" width="9" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="2")
            g(stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round")
              path(d="M16 12 L16 4 M12.5 7.5 L16 4 L19.5 7.5")
          template(v-else)
            //- Imp gear
            circle(cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="2")
            g(stroke="currentColor" stroke-width="2" stroke-linecap="round")
              line(x1="12" y1="2.5" x2="12" y2="5.5")
              line(x1="12" y1="18.5" x2="12" y2="21.5")
              line(x1="2.5" y1="12" x2="5.5" y2="12")
              line(x1="18.5" y1="12" x2="21.5" y2="12")
        //- Under 320px the name goes: the themed glyph already identifies the
        //- upgrade (sword / heart / coins / gear / rank-up arrow), and dropping
        //- the label is what lets the chip body fit ~28px so the merge grid
        //- gets the height. The cost and level pips stay — those are the two
        //- things the player actually decides on.
        span.chip-name.font-black.uppercase.leading-none.truncate(
          v-if="!isUltraCompactHud"
          :class="nameTextClass"
        ) {{ t('battle.upgrades.' + c.id) }}
      //- Level pips
      div.flex.items-center(class="gap-0.5" :class="isCompactHud ? 'my-0' : 'my-0.5'")
        span.pip(v-for="(on, i) in pips(c.level, c.max)" :key="i" :class="on ? 'pip-on' : ''" :style="{ background: on ? c.accent : 'rgba(255,255,255,0.15)' }")
      div.flex.items-center(class="gap-0.5")
        template(v-if="c.maxed")
          span.font-black.text-yellow-300(:class="maxedTextClass") {{ t('battle.upgrades.maxed') }}
        template(v-else)
          IconCoin(class="shrink-0" :class="coinIconClass")
          span.font-black.leading-none(
            :class="[c.can ? 'text-yellow-200' : 'text-red-300', costTextClass]"
          ) {{ fmt(c.cost) }}
      //- Tier ribbon (every 5 levels)
      span.tier-ribbon(v-if="tier(c.level) > 0" :style="{ background: c.accent }") {{ tier(c.level) }}
</template>

<style scoped lang="sass">
.chip
  background: linear-gradient(180deg, #1a2440 0%, #0c122a 100%)
  border-color: rgba(255, 255, 255, 0.12)
  min-height: 100%

.chip-affordable
  border-color: var(--accent)
  box-shadow: 0 0 0 1px var(--accent), 0 0 12px -4px var(--accent)

.chip-name
  color: #cdd8f0
  text-shadow: 1px 1px 0 #000

.pip
  width: 0.32rem
  height: 0.32rem
  border-radius: 9999px
  transition: background 0.2s ease

// Compact chips: thinner pips and a smaller tier ribbon, so the chip body can
// live inside ~36px without the pip row or the corner badge dominating it.
.chip--compact
  .pip
    width: 0.2rem
    height: 0.2rem

  .tier-ribbon
    top: -4px
    right: -4px
    min-width: 12px
    height: 12px
    font-size: 16px
    border-width: 1px
    padding: 0 2px

.tier-ribbon
  position: absolute
  top: -6px
  right: -6px
  min-width: 16px
  height: 16px
  display: flex
  align-items: center
  justify-content: center
  border-radius: 9999px
  font-size: 16px
  font-weight: 900
  color: #0a0d16
  border: 2px solid #0a0d16
  padding: 0 3px
</style>
