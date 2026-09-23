<script setup lang="ts">
/**
 * Ball Codex: every ball tier on the fighter ladder (1 to `FIGHTER_ART_MAX`,
 * 50) with its damage and on-hit ability. Tiers above the player's discovery
 * watermark (`useBarrage().maxBallTier`) render as dark silhouettes with a
 * "Merge two tier N balls to discover!" tease — the cheapest "one more merge"
 * driver in the game.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import useBarrage from '@/barrage/state/useBarrage'
import { ballAbility, TIER_GROWTH } from '@/barrage/engine/balls'
import { FIGHTER_ART_MAX, fighterSrc, ballColors } from '@/barrage/art'
import { fmtMult } from '@/components/barrage/barrageUi'

defineProps<{ modelValue: boolean }>()
defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t, te } = useI18n()
const barrage = useBarrage()

const entries = computed(() => Array.from({ length: FIGHTER_ART_MAX }, (_, i) => {
  const tier = i + 1
  const ability = ballAbility(tier)
  const nameKey = `battle.codex.names.t${tier}`
  return {
    tier,
    name: te(nameKey) ? t(nameKey) : t('barrage.tray.tierOnly', { n: tier }),
    damage: fmtMult(Math.pow(TIER_GROWTH, tier - 1)),
    abilityName: t(`barrage.abilities.${ability}.name`),
    abilityDesc: t(`barrage.abilities.${ability}.desc`),
    rim: ballColors(tier).glow,
    discovered: tier <= barrage.maxBallTier.value
  }
}))
const found = computed(() => Math.min(FIGHTER_ART_MAX, barrage.maxBallTier.value))
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    :title="t('barrage.codex.title')"
    @update:model-value="$emit('update:modelValue', $event)"
  )
    p.game-text.text-center.text-yellow-200(class="text-xs sm:text-sm") {{ t('barrage.codex.progress', { n: found, total: FIGHTER_ART_MAX }) }}
    div.grid.gap-2.p-3.codex-grid
      div.codex-card.relative.flex.items-center.gap-2.rounded-xl.border-2.p-2(
        v-for="e in entries"
        :key="e.tier"
        :class="e.discovered ? 'border-white/20 bg-black/30' : 'border-white/10 bg-black/50'"
      )
        div.codex-orb.shrink-0.relative(
          class="w-11 h-11 sm:w-12 sm:h-12"
          :class="{ 'codex-silhouette': !e.discovered }"
          :style="{ '--rim': e.rim }"
        )
          img.w-full.h-full.object-contain(:src="fighterSrc(e.tier)" alt="" draggable="false" loading="lazy")
          span.codex-tier.game-text {{ e.tier }}
        div.flex.flex-col.min-w-0.flex-1.items-start.text-start
          template(v-if="e.discovered")
            span.game-text.font-black.text-white.truncate.max-w-full(class="text-xs sm:text-sm") {{ e.name }}
            span.game-text.font-black.text-orange-300(class="text-[10px] sm:text-xs") {{ t('barrage.codex.damage', { n: e.damage }) }}
            span.text-white.game-text.opacity-80.leading-tight(class="text-[9px] sm:text-[11px]")
              span.font-black.text-sky-200 {{ e.abilityName }}
              | {{ ' — ' + e.abilityDesc }}
          template(v-else)
            span.game-text.font-black.text-white.opacity-60(class="text-xs sm:text-sm") {{ t('barrage.collection.unknown') }}
            span.text-yellow-200.game-text.leading-tight(class="text-[9px] sm:text-[11px]") {{ t('barrage.codex.locked', { n: e.tier - 1 }) }}
</template>

<style scoped lang="sass">
.codex-grid
  grid-template-columns: repeat(1, minmax(0, 1fr))

@media (min-width: 480px)
  .codex-grid
    grid-template-columns: repeat(2, minmax(0, 1fr))

.codex-orb
  border-radius: 50%
  background: radial-gradient(circle at 50% 42%, #2a3a66, #070b18 75%)
  box-shadow: 0 0 0 2px var(--rim), 0 0 6px color-mix(in srgb, var(--rim) 60%, transparent)
  padding: 3px
.codex-tier
  position: absolute
  right: -4px
  bottom: -3px
  min-width: 16px
  padding: 0 3px
  border-radius: 999px
  background: #0e1426
  border: 1.5px solid #fff
  color: #fff
  font-size: 9px
  font-weight: 900
  line-height: 13px
  text-align: center
.codex-silhouette img
  filter: brightness(0) opacity(0.7)
</style>
