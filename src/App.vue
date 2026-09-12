<script setup lang="ts">
import { RouterView } from 'vue-router'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { mobileCheck } from '@/utils/function'
import { useMusic } from '@/use/useSound'
import { useExtensionGuard } from '@/use/useExtensionGuard'
import { windowWidth, windowHeight } from '@/use/useUser'
import { isDebug } from '@/use/useMatch'
import useAssets from '@/use/useAssets'
import FLogoProgress from '@/components/atoms/FLogoProgress.vue'
import FPerfMeter from '@/components/atoms/FPerfMeter.vue'
import SaveStatusBanner from '@/components/atoms/SaveStatusBanner.vue'
import AdsBlockedModal from '@/components/atoms/AdsBlockedModal.vue'
import VConsoleHideButton from '@/components/atoms/VConsoleHideButton.vue'
import { useCrazyMuteSync } from '@/use/useCrazyMuteSync'
import { installModalGameplayGate } from '@/use/useModalGameplayGate'
import { installTutorialPauseGate } from '@/use/useTutorialPauseGate'
import { installPortalGameplayBracket } from '@/use/usePortalGameplay'
import useCheats, { installDebugUnlock } from '@/use/useCheats'
import { isCrazyWeb, isWaveDash, isItch, isGlitch, isGameDistribution, isPlaygama, isGamepix, isGameMonetize, isYandex, isPoki, isNative, orientation } from '@/use/useUser'
import { glitchLicenseStatus } from '@/use/useGlitchLicense'
import { resolveCapabilities } from '@/platforms/capabilities'
import { getPlattformText } from '@/platforms/plattformText'

const { t } = useI18n()
// Only `initMusic` — pause/continue are the audio orchestrator's job now
// (see the note above `updateGlobalDimensions`).
const { initMusic } = useMusic()
useExtensionGuard()
const { resourceCache } = useAssets()
useCrazyMuteSync()
// Freeze the sim while any menu is open and resume on close (every build);
// additionally fires CG gameplayStop/Start on the CrazyGames full release.
installModalGameplayGate()
// Hold the battle sim while the first-session coach-marks run, so wave 1 can't
// overrun the gate before the player has ever deployed a fighter. Releases on
// their first deploy.
installTutorialPauseGate()
// Poki's gameplayStart/Stop bracket, derived from the same pause gate the two
// installs above feed. Its FIRST start is held until the player touches the
// viewport (Poki rejects a gameplayStart nobody asked for) and the whole watcher
// is dead code on non-Poki builds. See `usePortalGameplay.ts`.
installPortalGameplayBracket()
// Attach the "cmarc" debug-unlock key listener at app boot (App.vue is eager),
// so typing it anywhere flips debug mode — the lazy game scene used to be the
// only importer, which tree-shook the listener out of production builds.
installDebugUnlock()
// Mount the cheat keyboard shortcuts (stage jumps, +coins, item-box spawn) for
// the whole app lifetime. The factory self-gates on `localStorage.cheat` and
// returns inert when cheats are off, so this is a no-op for normal players —
// but without CALLING it the keydown listeners were never attached at all
// (it was previously only imported for `installDebugUnlock`, never invoked).
useCheats()

initMusic()

const portraitQuery = window.matchMedia('(orientation: portrait)')
const onTouchStart = (event: any) => {
  if (event.touches.length > 1) {
    event.preventDefault() // Block multitouch (pinch)
  }
}

const onGestureStart = (event: any) => {
  event.preventDefault() // Block specific Safari zoom gestures
}
const onOrientationChange = (event: any) => {
  if (event.matches) {
    orientation.value = 'portrait'
  } else {
    orientation.value = 'landscape'
  }
}

const onContextMenu = (event: any) => {
  event.preventDefault() // Block right-click context menu
}

// NOTE: there is deliberately no `visibilitychange` handler here any more.
// It used to pause/continue the background music, which is now fully covered
// by `useGamePauseAudio` — that orchestrator subscribes to the unified pause
// gate (ad / tab-hidden / platform) and `suspendAllAudio()` pauses every
// tracked HTMLAudio element, the bg-music element among them, resuming exactly
// the ones it paused. So this listener was redundant on every build.
//
// It also could not stay: the Playgama archive is the YouTube Playables
// submission, and Playables forbids the Page Visibility API entirely. One
// owner for that API (`useGamePause`) is what makes the rule enforceable.

const updateGlobalDimensions = () => {
  windowWidth.value = window.innerWidth
  windowHeight.value = window.innerHeight
  orientation.value = mobileCheck() && windowWidth.value > windowHeight.value ? 'landscape' : 'portrait'
}

const dimensionsInterval = ref<any | null>(null)
// Ensure listeners are active
const delayedUpdateGlobalDimensions = () => setTimeout(updateGlobalDimensions, 300)
onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateGlobalDimensions)

    dimensionsInterval.value = setInterval(() => {
      windowWidth.value = window.innerWidth
      windowHeight.value = window.innerHeight
    }, 400)
    window.addEventListener('orientationchange', delayedUpdateGlobalDimensions)
  }
})
onUnmounted(() => {
  window.removeEventListener('resize', updateGlobalDimensions)
  window.removeEventListener('orientationchange', delayedUpdateGlobalDimensions)
  clearInterval(dimensionsInterval.value)
})

onMounted(() => {
  document.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('touchstart', onTouchStart, { passive: false })
  document.addEventListener('gesturestart', onGestureStart)
  portraitQuery.addEventListener('change', onOrientationChange)
})
onUnmounted(() => {
  document.removeEventListener('contextmenu', onContextMenu)
  document.removeEventListener('touchstart', onTouchStart)
  document.removeEventListener('gesturestart', onGestureStart)
  portraitQuery.removeEventListener('change', onOrientationChange)
})

// Capability gates for the per-platform render fork in the template
// below — single source of truth lives in `@/platforms/capabilities`.
// `parentOrigin` is the iframe parent's origin (only meaningful for Glitch
// where the game runs on a CDN iframe-embedded into glitch.fun).
const hostname = window.location.hostname
const parentOrigin = window.location.ancestorOrigins?.[0] ?? document.referrer ?? ''
const platformFlags = {
  isCrazyWeb, isWaveDash, isItch, isGlitch, isGameDistribution, isPlaygama, isGamepix, isGameMonetize, isYandex, isPoki
}
const capabilities = computed(() => resolveCapabilities({
  flags: platformFlags,
  hostname,
  parentOrigin,
  glitchLicenseStatus: glitchLicenseStatus.value
}))

const isGameShowAllowed = computed(() =>
  capabilities.value.allowedToShowOnCrazyGames ||
  capabilities.value.allowedToShowOnWaveDash ||
  capabilities.value.allowedToShowOnItch ||
  capabilities.value.allowedToShowOnGlitch ||
  capabilities.value.allowedToShowOnGameDistribution ||
  capabilities.value.allowedToShowOnPlaygama ||
  capabilities.value.allowedToShowOnGamepix ||
  capabilities.value.allowedToShowOnGameMonetize ||
  capabilities.value.allowedToShowOnYandex ||
  capabilities.value.allowedToShowOnPoki ||
  location.hostname.includes('localhost')
)
const isGlitchDenied = computed(() => capabilities.value.isGlitchDenied)
const showOnlyAvailableText = computed(() => capabilities.value.showOnlyAvailableText)
// Sourced from `@/platforms/plattformText` — that file is in the obfuscator's
// exclude list so its env-literal ladder DCEs cleanly per build and only the
// active build's hostname survives in the bundle. See the comment in
// `plattformText.ts` for why a separate file (and why exclusion is required).
const plattformText = computed(() => getPlattformText())
</script>

<template lang="pug">
  div(v-if="isGameShowAllowed" id="app-root" class="h-screen h-dvh w-screen app-container root-protection game-ui-immune")
    FLogoProgress
    FPerfMeter(v-if="isDebug" :offset-y="52")
    SaveStatusBanner
    AdsBlockedModal
    VConsoleHideButton
    RouterView

  div.relative.w-full.h-full(v-else-if="isGlitchDenied")
    h1.absolute.text-red-500(class="left-1/2 -translate-x-[50%] top-1/2 -translate-y-[50%] text-3xl") {{ t('license.denied') }}


  div.relative.w-full.h-full(v-else-if="showOnlyAvailableText")
    h1.absolute(class="left-1/2 -translate-x-[50%] top-1/2 -translate-y-[50%] text-3xl") {{ t('crazyGamesOnly') }}
      span.ml-2.text-amber-500 {{ plattformText }}
</template>

<style lang="sass">
*
  // Script-aware stack. `--app-font-stack` is set on <html> by
  // `applyLocaleDirection()` on every locale switch; the literal fallback
  // keeps the Latin look if that never ran (SSR-less first paint, tests).
  //
  // `'Angry'` is a Latin-only display face, so before this the Arabic and
  // CJK locales fell straight through to the generic `sans-serif` — a
  // per-platform coin flip that renders tofu (□□□) wherever the system
  // default sans has no coverage. See `i18n/localeDirection.ts`.
  font-family: var(--app-font-stack, 'Angry', 'Segoe UI', Roboto, system-ui, sans-serif)
  user-select: none
  outline: none
  // Standard
  -webkit-user-select: none
  // Safari
  -moz-user-select: none
  // Firefox
  -ms-user-select: none
  // IE10+

  // Optional: prevent the "tap highlight" color on mobile
  -webkit-tap-highlight-color: transparent

img
  pointer-events: none
</style>