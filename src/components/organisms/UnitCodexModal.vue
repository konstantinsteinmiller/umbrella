<script setup lang="ts">
/**
 * Unit Codex (retention-roadmap #12): every illustrated merge tier (1 to
 * `CODEX_MAX_TIER`, 50) with stats and ability copy. Tiers above the player's discovery watermark
 * (`maxTier`) render as dark silhouettes with a "Merge 2× Tier N to discover!"
 * tease — the cheapest "one more merge" driver in the game.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'
import IconAttack from '@/components/icons/IconAttack.vue'
import IconHp from '@/components/icons/IconHp.vue'
import usePrismGame from '@/use/usePrismGame'
import { getFighterDef, CODEX_MAX_TIER } from '@/game/units'
import { formatBig } from '@/utils/bigNumber'
import { ELEMENTAL_FIRST_TIER } from '@/game/ingredients'

defineProps<{ modelValue: boolean }>()
defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t } = useI18n()
const game = usePrismGame()

// Tiers 1-11 are authored in FIGHTER_DEFS; 12-50 extrapolate their stats via
// getFighterDef but carry their own look + localized names — so drive the whole
// bestiary off getFighterDef by tier.
const entries = computed(() => Array.from({ length: CODEX_MAX_TIER }, (_, i) => {
  const def = getFighterDef(i + 1)
  return {
    tier: def.tier,
    name: t(`battle.codex.names.t${def.tier}`),
    atk: def.atk,
    hp: def.hp,
    // `abilities` copy is themed to the tiers 1-20 it was written for ("biting
    // frost", "crashing waves"); the elementals get the plain mechanic instead.
    ability: def.tier >= ELEMENTAL_FIRST_TIER
      ? t(`battle.codex.effects.${def.ability}`)
      : t(`battle.codex.abilities.${def.ability}`),
    discovered: def.tier <= game.maxTier.value
  }
}))
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    :title="t('battle.codex.title')"
    @update:model-value="$emit('update:modelValue', $event)"
  )
    div.grid.gap-2.p-3.codex-grid
      div.codex-card.relative.flex.items-center.gap-2.rounded-xl.border-2.p-2(
        v-for="e in entries"
        :key="e.tier"
        :class="e.discovered ? 'border-white/20 bg-black/30' : 'border-white/10 bg-black/50'"
      )
        div.shrink-0.relative(class="w-11 h-11 sm:w-12 sm:h-12" :class="{ 'codex-silhouette': !e.discovered }")
          IngredientUnit(:tier="e.tier" :still="true")
        div.flex.flex-col.min-w-0.flex-1
          template(v-if="e.discovered")
            span.game-text.font-black.text-white.truncate(class="text-xs sm:text-sm") {{ e.name }}
            div.flex.items-center.gap-2(class="text-[10px] sm:text-xs")
              span.flex.items-center.text-orange-300.font-black.game-text(class="gap-0.5")
                IconAttack(class="w-3 h-3")
                | {{ formatBig(e.atk, { sig: 3, trim: true }) }}
              span.flex.items-center.text-emerald-300.font-black.game-text(class="gap-0.5")
                IconHp(class="w-3 h-3")
                | {{ formatBig(e.hp, { sig: 3, trim: true }) }}
            span.text-white.game-text.opacity-75.leading-tight(class="text-[9px] sm:text-[11px]") {{ e.ability }}
          template(v-else)
            span.game-text.font-black.text-white.opacity-60(class="text-xs sm:text-sm") ???
            span.text-yellow-200.game-text.leading-tight(class="text-[9px] sm:text-[11px]") {{ t('battle.codex.locked', { n: e.tier - 1 }) }}
</template>

<style scoped lang="sass">
.codex-grid
  grid-template-columns: repeat(1, minmax(0, 1fr))

@media (min-width: 480px)
  .codex-grid
    grid-template-columns: repeat(2, minmax(0, 1fr))

.codex-silhouette
  filter: brightness(0) opacity(0.7)
</style>
