<script setup lang="ts">
/**
 * The Discovery Index — a sticker album (GDD §5.1). One page selector strip and
 * a grid of recipe cards for the active page. Discovered recipes show their
 * coloured potion + name; undiscovered ones are dark silhouettes with a "?" and
 * a discovery hint. Each page shows its completion progress and the permanent
 * milestone reward it grants.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import PotionBottle from '@/components/organisms/PotionBottle.vue'
import usePrismGame, { discoveredCount } from '@/use/usePrismGame'
import { PAGES, recipesForPage, TOTAL_RECIPES } from '@/game/recipes'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t } = useI18n()
const game = usePrismGame()

const selectedPage = ref(PAGES[0]!.id)

// When opening, jump to the first page that still has undiscovered recipes.
watch(() => props.modelValue, (open) => {
  if (!open) return
  const firstIncomplete = PAGES.find((p) => {
    const pr = game.pageProgress(p.id)
    return pr.done < pr.total
  })
  selectedPage.value = (firstIncomplete ?? PAGES[0]!).id
})

const cards = computed(() =>
  recipesForPage(selectedPage.value).map((r) => ({
    recipe: r,
    known: game.isDiscovered(r.id)
  }))
)

const activePage = computed(() => PAGES.find((p) => p.id === selectedPage.value)!)
const activeProgress = computed(() => game.pageProgress(selectedPage.value))
const activeClaimed = computed(() => game.claimedPages.value.includes(selectedPage.value))

const rewardText = (p: typeof PAGES[number]): string => {
  if (p.reward.type === 'goldMult') {
    return t('prism.index.rewardGold', { n: Math.round((p.reward.value - 1) * 100) })
  }
  return t('prism.index.rewardTier', { n: p.reward.value })
}
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    :title="t('prism.index.title')"
    @update:model-value="emit('update:modelValue', $event)"
  )
    div.flex.flex-col.gap-2
      //- Overall progress
      div.text-yellow-200.game-text.font-black(class="text-sm sm:text-base") {{ t('prism.index.collected', { a: discoveredCount, b: TOTAL_RECIPES }) }}

      //- Page selector strip (horizontal scroll)
      div.flex.gap-1.overflow-x-auto.pb-1(class="no-scrollbar")
        button.shrink-0.rounded-lg.border-2.px-2.py-1.transition-transform(
          v-for="p in PAGES"
          :key="p.id"
          class="active:scale-95 cursor-pointer"
          :class="selectedPage === p.id ? 'border-yellow-300 bg-[#243a6b]' : 'border-white/10 bg-[#16203a]'"
          @click="selectedPage = p.id"
        )
          div.flex.flex-col.items-center
            span.font-black.game-text.text-white.whitespace-nowrap(class="text-[9px] sm:text-[11px]") {{ p.title }}
            span.game-text(
              class="text-[8px] sm:text-[10px]"
              :class="game.pageProgress(p.id).done === game.pageProgress(p.id).total ? 'text-emerald-300' : 'text-white/60'"
            ) {{ game.pageProgress(p.id).done }}/{{ game.pageProgress(p.id).total }}

      //- Active page reward banner
      div.flex.items-center.justify-between.gap-2.rounded-lg.px-3.py-1.border(
        :class="activeClaimed ? 'border-emerald-400/60 bg-emerald-900/20' : 'border-yellow-400/40 bg-yellow-900/10'"
      )
        span.game-text.text-white(class="text-[10px] sm:text-xs text-left leading-tight") {{ rewardText(activePage) }}
        span.game-text.font-black.shrink-0(
          class="text-[10px] sm:text-xs"
          :class="activeClaimed ? 'text-emerald-300' : 'text-yellow-200'"
        ) {{ activeClaimed ? t('prism.index.claimed') : activeProgress.done + '/' + activeProgress.total }}

      //- Sticker grid
      div.grid.gap-2(class="grid-cols-3 sm:grid-cols-4")
        div.sticker.flex.flex-col.items-center.rounded-xl.border-2.p-1(
          v-for="c in cards"
          :key="c.recipe.id"
          :class="c.known ? (c.recipe.rarity === 'legendary' ? 'border-yellow-300 bg-[#2a2410]' : 'border-white/15 bg-[#0e1730]') : 'border-white/8 bg-black/30'"
        )
          div.aspect-square.w-full
            PotionBottle(
              :shape="c.recipe.bottle"
              :liquid="c.recipe.liquid"
              :silhouette="!c.known"
              :glow="c.known && c.recipe.rarity === 'legendary'"
            )
          span.game-text.text-center.leading-tight(
            class="mt-0.5 text-[8px] sm:text-[10px]"
            :class="c.known ? 'text-white' : 'text-white/40'"
          ) {{ c.known ? c.recipe.name : '???' }}
          span.game-text.text-center.leading-tight(
            v-if="!c.known"
            class="text-white/40 text-[7px] sm:text-[9px]"
          ) {{ c.recipe.hint }}
</template>

<style scoped lang="sass">
.no-scrollbar
  scrollbar-width: none
  &::-webkit-scrollbar
    display: none
</style>
