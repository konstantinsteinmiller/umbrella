<script setup lang="ts">
/**
 * "Welcome back" claim (retention-roadmap #3): presents the offline gold the
 * Imp Sergeant earned while the game was closed. Two ways out — plain claim,
 * or the 2× rewarded claim (hidden without ad fill). Not closable otherwise:
 * the gold is already earned, the only choice is how much of it to take.
 * If the rewarded ad fails/declines mid-flow the base amount is still paid.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconMovie from '@/components/icons/IconMovie.vue'
import useEpicConfig from '@/use/useEpicConfig'
import useSounds from '@/use/useSound'
import useReward from '@/use/useReward'
import { offlineGold, consumeOfflineGold } from '@/use/useOfflineEarnings'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'

const props = defineProps<{
  modelValue: boolean
  /** Wallet badge element — the payout flies coins into it. */
  coinTarget?: HTMLElement | null
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t } = useI18n()
const { playSound } = useSounds()
const { addCoins } = useEpicConfig()
// 2× claim: rewarded ad, or a coin purchase on coin-mode builds.
const { buffsCostCoins, REWARD_COIN_COST, rewardAvailable, canRedeem, redeem } = useReward()
const affordable = computed(() => canRedeem(REWARD_COIN_COST))

const busy = ref(false)
const isOpen = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const payout = (amount: number, sourceEl: HTMLElement | null): void => {
  addCoins(amount)
  playSound('coin-pickup', 0.05)
  if (sourceEl && props.coinTarget) {
    spawnCoinExplosion({
      sourceEl, targetEl: props.coinTarget,
      count: Math.min(40, 10 + Math.round(amount / 50))
    })
  }
  isOpen.value = false
}

const onClaim = (e: MouseEvent): void => {
  if (busy.value) return
  const base = consumeOfflineGold()
  if (base > 0) payout(base, e.currentTarget as HTMLElement)
  else isOpen.value = false
}

const onClaimDouble = async (e: MouseEvent): Promise<void> => {
  if (busy.value) return
  if (buffsCostCoins && !affordable.value) return
  busy.value = true
  const el = e.currentTarget as HTMLElement
  try {
    const ok = await redeem(REWARD_COIN_COST)
    const base = consumeOfflineGold()
    if (base > 0) payout(ok ? base * 2 : base, el) // never punish a no-fill / failed spend
    else isOpen.value = false
  } finally {
    busy.value = false
  }
}
</script>

<template lang="pug">
  FModal(v-model="isOpen" :title="t('welcomeBack.title')" :is-closable="false")
    div.flex.flex-col.items-center.gap-3.p-4
      p.text-center.text-white.game-text.opacity-90(class="text-xs sm:text-sm") {{ t('welcomeBack.body') }}
      div.flex.items-center.gap-2
        IconCoin(class="w-8 h-8 sm:w-10 sm:h-10")
        span.font-black.game-text.text-yellow-300(class="text-2xl sm:text-3xl") +{{ offlineGold }}
      div.flex.items-stretch.gap-2.w-full.max-w-xs
        //- Base claim
        button.flex-1.cursor-pointer.transition-transform.rounded-xl.border-2.px-3.py-2(
          class="bg-gradient-to-b from-[#50aaff] to-[#2266ff] border-[#0f1a30] active:scale-95 disabled:opacity-50"
          :disabled="busy"
          @click="onClaim"
        )
          span.text-white.font-black.uppercase.game-text(class="text-xs sm:text-sm") {{ t('achievements.claim') }}
        //- Rewarded 2× claim — ad-fill-gated, or a coin purchase in coin mode.
        button.flex-1.cursor-pointer.transition-transform.rounded-xl.border-2.px-3.py-2.flex.items-center.justify-center.gap-1(
          v-if="rewardAvailable"
          class="bg-gradient-to-b from-emerald-400 to-emerald-700 border-emerald-200 active:scale-95 disabled:opacity-50"
          :disabled="busy || (buffsCostCoins && !affordable)"
          @click="onClaimDouble"
        )
          //- Coin mode shows the price + IconCoin; ad mode the movie icon + label.
          template(v-if="buffsCostCoins")
            IconCoin(class="w-5 h-5 shrink-0 text-yellow-200")
            span.text-white.font-black.game-text.tabular-nums(class="text-xs sm:text-sm") {{ REWARD_COIN_COST }}
          template(v-else)
            IconMovie(class="w-5 h-5 shrink-0")
            span.text-white.font-black.uppercase.game-text(class="text-xs sm:text-sm") {{ t('ads.doubleCoins') }}
</template>
