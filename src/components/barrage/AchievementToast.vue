<script setup lang="ts">
/**
 * The gold "Achievement complete!" toast (MIW's look). A component so GameScene
 * can put it wherever the layout has room: low on a tall portrait board, or in
 * the left column when the board is short and landscape.
 */
import { useI18n } from 'vue-i18n'

defineProps<{ name: string }>()
const { t } = useI18n()
</script>

<template lang="pug">
  div.ach-toast.flex.items-center.gap-2.rounded-xl.border-2.px-3.py-2(
    class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30] shadow-2xl"
    role="status"
  )
    //- Trophy medal on a dark disc, so the gold glyph reads on the gold toast.
    div.shrink-0.rounded-full.border-2.flex.items-center.justify-center(class="w-7 h-7 bg-[#0f1a30] border-white/60")
      svg(viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="#ffd23a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true")
        path(d="M7 4 h10 v3 a5 5 0 0 1 -10 0 Z")
        path(d="M7 5 H4 v1 a3 3 0 0 0 3 3")
        path(d="M17 5 h3 v1 a3 3 0 0 1 -3 3")
        path(d="M12 12 v4")
        path(d="M9 20 h6 l-1 -4 h-4 Z")
    div.flex.flex-col.items-start.min-w-0
      span.text-white.font-black.uppercase.game-text(class="text-[9px] leading-none opacity-90") {{ t('barrageMeta.achievements.unlocked') }}
      span.text-white.font-black.game-text.truncate.max-w-full(class="text-xs sm:text-sm") {{ name }}
</template>
