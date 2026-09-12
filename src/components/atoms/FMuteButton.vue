<script setup lang="ts">
import { mobileCheck } from '@/utils/function'
import { isMobilePortrait, isMobileLandscape } from '@/use/useUser'
import { isMuted, toggleMute } from '@/use/useCrazyMuteSync'
import { isMobileAudioMuted, toggleMobileAudioMute } from '@/use/useMobileAudioMute'
</script>

<template lang="pug">
  //- Sized like the other utility buttons it stacks with (36px on a phone,
  //- 44px from `sm` up): the stacks sit beside the merge grid, and a wider
  //- button here would push the grid's cell narrower than it needs to be.
  div.flex.flex-col.items-end.gap-1
    //- Desktop: volume-based mute (Web Audio gain works here).
    button.rounded-full.backdrop-blur-sm.transition-all.cursor-pointer.flex.items-center.justify-center(
      v-if="!mobileCheck()"
      class="w-9 h-9 sm:w-11 sm:h-11 bg-black/20 hover:bg-black/40 active:scale-95 pointer-events-auto"
      @click="toggleMute"
    )
      span.leading-none(class="text-xl sm:text-2xl") {{ isMuted ? '🔇': '🔊' }}
    //- Mobile: hard silence toggle. The OS volume rocker owns the device level,
    //- so this suspends all engine audio + blocks new music/SFX instead of
    //- changing volume — letting players run their own music app.
    button.rounded-full.backdrop-blur-sm.transition-all.cursor-pointer.flex.items-center.justify-center(
      v-else-if="isMobilePortrait || isMobileLandscape"
      class="w-9 h-9 sm:w-11 sm:h-11 bg-black/20 hover:bg-black/40 active:scale-95 pointer-events-auto"
      @click="toggleMobileAudioMute"
    )
      span.leading-none(class="text-xl sm:text-2xl") {{ isMobileAudioMuted ? '🔇': '🔊' }}
</template>

<style scoped lang="sass">

</style>
