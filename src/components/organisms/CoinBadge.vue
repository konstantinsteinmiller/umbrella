<script setup lang="ts">
import { ref, computed } from 'vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useEpicConfig from '@/use/useEpicConfig'

const { coins } = useEpicConfig()

// Abbreviate big wallets: 1435 → "1.4k", 4.5m, 1.2b, 1.3t. One decimal, FLOORED
// so the badge never shows more than the player actually has; trailing ".0"
// dropped (2000 → "2k"). Under 1000 shows the exact count.
const abbreviate = (n: number): string => {
  const unit = (v: number, suffix: string): string => {
    const t = Math.floor(v * 10) / 10
    return (Number.isInteger(t) ? String(t) : t.toFixed(1)) + suffix
  }
  const abs = Math.abs(n)
  if (abs >= 1e12) return unit(n / 1e12, 't')
  if (abs >= 1e9) return unit(n / 1e9, 'b')
  if (abs >= 1e6) return unit(n / 1e6, 'm')
  if (abs >= 1e3) return unit(n / 1e3, 'k')
  return String(Math.floor(n))
}
const display = computed(() => abbreviate(coins.value))

// Exposed so siblings (e.g. TreasureChest) can target the badge for fly-to VFX.
const rootEl = ref<HTMLElement | null>(null)
defineExpose({ rootEl })
</script>

<template lang="pug">
  div.coin-badge.relative.flex.items-center.gap-2.rounded-full.font-bold(
    ref="rootEl"
    class="pl-1 pr-3 py-1 text-sm sm:text-base"
  )
    div.coin-badge__icon.flex.items-center.justify-center.rounded-full(
      class="w-7 h-7 sm:w-8 sm:h-8"
    )
      IconCoin(class="w-5 h-5 sm:w-6 sm:h-6 text-yellow-100 drop-shadow")
    span.game-text.coin-badge__value {{ display }}
</template>

<style scoped lang="sass">
.coin-badge
  background: linear-gradient(135deg, #50aaff 0%, #2266ff 50%, #1b3e95 100%)
  border: 2px solid #fcd34d
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 4px 10px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 0 -2px 4px rgba(0, 0, 0, 0.4)
  overflow: hidden

  &::before
    content: ''
    position: absolute
    inset: 0
    background: linear-gradient(115deg, transparent 35%, rgba(255, 255, 255, 0.35) 50%, transparent 65%)
    background-size: 250% 100%
    animation: coin-shine 3.5s linear infinite
    pointer-events: none

  &__icon
    background: radial-gradient(circle at 30% 30%, #fff7b0 0%, #fcd34d 35%, #b8860b 100%)
    box-shadow: 0 0 8px rgba(252, 211, 77, 0.7), inset 0 -2px 3px rgba(0, 0, 0, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.6)
    border: 1px solid #78350f

  &__value
    color: #fff7d6
    text-shadow: 0 1px 0 #000, 0 0 6px rgba(252, 211, 77, 0.7)
    letter-spacing: 0.5px
    position: relative

@keyframes coin-shine
  0%
    background-position: 200% 0
  100%
    background-position: -100% 0
</style>
