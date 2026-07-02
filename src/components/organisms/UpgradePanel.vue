<script setup lang="ts">
/**
 * The lab upgrade controls (GDD §6): Heat, Pressure, Containment, Automation.
 * A compact row of buy-chips, each with a themed mini-gauge, the current level
 * as a pip bar, and the next cost. Buying spends Cosmic Gold via the game logic;
 * the chip flashes and plays a confirm SFX. Fully responsive — chips wrap and
 * shrink on narrow viewports.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import usePrismGame, { type UpgradeId, UPGRADE_DEFS } from '@/use/usePrismGame'
import useSounds from '@/use/useSound'

const { t } = useI18n()
const game = usePrismGame()
const { playSound } = useSounds()

const ids = Object.keys(UPGRADE_DEFS) as UpgradeId[]

const accent: Record<UpgradeId, string> = {
  heat: '#ff6a2a', pressure: '#ff4d6d', containment: '#36d399', automation: '#5fb0ff'
}

const buy = (id: UpgradeId): void => {
  if (game.buyUpgrade(id)) {
    playSound('level-up', 0.05, 1.05)
  } else {
    playSound('obstacle-hit', 0.015)
  }
}

const fmt = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K'
  return String(n)
}

// Pip bar: show level out of a soft "page" of 5 so the bar stays readable.
const pips = (lvl: number): boolean[] => {
  const within = lvl % 5
  const shown = lvl > 0 && within === 0 ? 5 : within
  return Array.from({ length: 5 }, (_, i) => i < shown)
}
const tier = (lvl: number): number => Math.floor(lvl / 5)

const chips = computed(() => ids.map((id) => ({
  id,
  level: game.upgradeLevel(id),
  cost: game.upgradeCost(id),
  maxed: game.isUpgradeMaxed(id),
  can: game.canBuyUpgrade(id),
  accent: accent[id]
})))
</script>

<template lang="pug">
  div.upgrade-panel.flex.items-stretch.justify-center.gap-1.w-full.h-full(class="sm:gap-2")
    button.chip.relative.flex.flex-col.items-center.justify-between.rounded-xl.border-2.px-1.py-1(
      v-for="c in chips"
      :key="c.id"
      class="flex-1 min-w-0 active:scale-95 transition-transform sm:px-2"
      :class="c.can ? 'chip-affordable cursor-pointer' : 'opacity-90 cursor-not-allowed'"
      :style="{ '--accent': c.accent }"
      :disabled="!c.can"
      @click="buy(c.id)"
    )
      div.flex.items-center.gap-1.w-full.justify-center
        //- Themed mini gauge
        svg(viewBox="0 0 24 24" class="w-4 h-4 sm:w-5 sm:h-5 shrink-0" :style="{ color: c.accent }")
          template(v-if="c.id === 'heat'")
            path(d="M12 3 a3 3 0 0 1 3 3 v8.2 a4 4 0 1 1 -6 0 V6 a3 3 0 0 1 3 -3 Z" fill="none" stroke="currentColor" stroke-width="2")
            circle(cx="12" cy="17" r="2.4" fill="currentColor")
          template(v-else-if="c.id === 'pressure'")
            circle(cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2")
            path(d="M12 12 L16 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round")
            circle(cx="12" cy="12" r="1.6" fill="currentColor")
          template(v-else-if="c.id === 'containment'")
            ellipse(cx="12" cy="12" rx="9" ry="3.6" fill="none" stroke="currentColor" stroke-width="2")
            ellipse(cx="12" cy="12" rx="3.6" ry="9" fill="none" stroke="currentColor" stroke-width="2")
          template(v-else)
            circle(cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="2")
            g(stroke="currentColor" stroke-width="2" stroke-linecap="round")
              line(x1="12" y1="2.5" x2="12" y2="5.5")
              line(x1="12" y1="18.5" x2="12" y2="21.5")
              line(x1="2.5" y1="12" x2="5.5" y2="12")
              line(x1="18.5" y1="12" x2="21.5" y2="12")
        span.chip-name.font-black.uppercase.leading-none.truncate(class="text-[8px] sm:text-[10px]") {{ t('prism.upgrades.' + c.id) }}
      //- Level pips
      div.flex.items-center(class="gap-0.5 my-0.5")
        span.pip(v-for="(on, i) in pips(c.level)" :key="i" :class="on ? 'pip-on' : ''" :style="{ background: on ? c.accent : 'rgba(255,255,255,0.15)' }")
      div.flex.items-center(class="gap-0.5")
        template(v-if="c.maxed")
          span.font-black.text-yellow-300(class="text-[8px] sm:text-[10px]") {{ t('prism.upgrades.maxed') }}
        template(v-else)
          svg(viewBox="0 0 24 24" class="w-2.5 h-2.5 sm:w-3 sm:h-3 text-yellow-300 shrink-0" fill="currentColor")
            circle(cx="12" cy="12" r="9" stroke="#7a5a00" stroke-width="2")
          span.font-black.leading-none(class="text-[9px] sm:text-[11px]" :class="c.can ? 'text-yellow-200' : 'text-red-300'") {{ fmt(c.cost) }}
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
  font-size: 9px
  font-weight: 900
  color: #0a0d16
  border: 2px solid #0a0d16
  padding: 0 3px
</style>
