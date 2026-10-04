<template lang="pug">
  //- ⚠️ NO `<Transition>` IN THIS COMPONENT — the fades are plain CSS classes
  //- and `setTimeout` owns every unmount. Vue's transition system schedules the
  //- `-leave-to` class inside a `requestAnimationFrame` and only unmounts on the
  //- resulting `transitionend`. A page that receives no animation frames during
  //- the ~0.5 s splash fade never gets that frame, so the element stays in
  //- `-leave-from -leave-active` at opacity 1 — and this backdrop is opaque,
  //- fixed, inset-0, z-150. The result is a featureless dark rectangle covering
  //- a perfectly healthy, running game, forever: the "black screen" reported
  //- from screenshot tools and playtest recordings. Frames stop exactly there
  //- for a background/occluded tab, a hidden or offscreen iframe, and any
  //- headless capture or session-recording harness that doesn't drive the
  //- compositor — and the logo (z-200) usually unmounts a frame earlier, which
  //- is why the stuck frame has no logo on it either.
  //-
  //- Timers fire in all of those cases (throttled to ~1 Hz when hidden, but they
  //- fire), so the splash now always clears — worst case it pops instead of
  //- fading. Anything added here that hides the game MUST stay timer-driven.
  div.splash-backdrop.no-os-ui(
    v-if="!backdropGone"
    :class="{ 'splash-backdrop--out': backdropHidden }"
    :style="backdropStyle"
  )

  //- Logo only renders during the loading sequence. Once `done` flips
  //- true (progress = 100% OR the 4s fallback fires), the logo fades out
  //- and unmounts — it deliberately does NOT shrink to the top-left
  //- corner like the previous splash flow.
  div.no-os-ui.splash-logo(
    v-if="!logoGone"
    ref="logoRef"
    class="fixed z-[200] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
    :class="{ 'splash-logo--out': done }"
  )
    div(class="relative flex flex-col items-center")
      div(:style="sizeStyle")
        img(
          :src="logoSrc"
          alt="elemental-barrage"
          class="w-full h-full object-contain"
          draggable="false"
        )

      //- Loading Text
      div.absolute.-bottom-8(class="mt-0 flex flex-col items-center gap-1")
        span(class="percentage-text text-shadow font-mono text-amber-500") {{ Math.round(progress) }}%

      div.stuck-hint.mt-4(v-if="showStuckHint") {{ t('loading.tooLong') }}
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useAssets from '@/use/useAssets'
import { cssVarUrl, prependBaseUrl } from '@/utils/function'
import { stopLoading } from '@/use/useCrazyGames'
import { armFirstLoadInterstitial, notifySplashGone } from '@/use/useFirstLoadInterstitial'

const { t } = useI18n()

const logoSrc = prependBaseUrl('images/logo/logo_256x256.webp')

// Full-screen sky behind the loading logo — the scene painting GameScene draws
// behind the board, picked by the same side-by-side rule (see the media query
// in the <style> block), so the splash fades into an identical backdrop. Both
// URLs are bound inline (not CSS urls) so they go through `prependBaseUrl` and
// resolve on base-path builds (e.g. GitHub Pages `/elemental-barrage/`); only
// the one the media query picks is fetched. The `.splash-backdrop` colour stays
// as the fallback and shows through until the bitmap decodes.
const backdropStyle = {
  '--splash-portrait': cssVarUrl(prependBaseUrl('images/backdrops/scene-portrait.webp')),
  '--splash-landscape': cssVarUrl(prependBaseUrl('images/backdrops/scene-landscape.webp'))
}

const { loadingProgress, preloadAssets } = useAssets()
const progress = computed(() => loadingProgress.value)

void preloadAssets()

// First-load interstitial — the builds `adTiming.ts` marks `FIRST_LOAD_AD`:
// GameMonetize (moderation rejects a build without it: "Ads should be shown
// the first time after the game loads") and GamePix (its QA asks for the same
// post-load ad). It is the ONLY first-ad path: this game boots straight into a
// live board with no Play button, so the old first-PLAY placement for
// GameMonetize was never called by anything and the build shipped with no
// first ad at all. `adTiming.test.ts` pins this arm list against `FIRST_LOAD_AD`.
// Every env read is a static literal so Rollup DCEs the entire branch (helper
// module included) on other platform builds — same pattern as the Playgama /
// GamePix loading signals further down.
if (
  import.meta.env.VITE_APP_GAMEPIX === 'true'
  || import.meta.env.VITE_APP_GAME_MONETIZE === 'true'
) {
  armFirstLoadInterstitial()
}

const done = ref(false)
const backdropHidden = ref(false)
// `*Gone` = removed from the DOM. `done` / `backdropHidden` only START the
// respective fade (a CSS class); a timer one fade-length later does the
// unmount. See the template header for why this is not a `<Transition>`.
const logoGone = ref(false)
const backdropGone = ref(false)
// Keep in sync with the two `transition-duration`s in the <style> block.
const LOGO_FADE_MS = 350
const BACKDROP_FADE_MS = 400
const showStuckHint = ref(false)
let stuckHintId: number | null = null
let logoGoneId: number | null = null
let backdropGoneId: number | null = null

// Start the fade → unmount one fade-length later. `+ 80 ms` of slack so a
// frame-starved page still gets the element out even if the CSS transition
// never visibly ran (it pops instead of fading — always better than a splash
// that outlives the game).
watch(done, (isDone) => {
  if (!isDone || logoGoneId !== null) return
  logoGoneId = window.setTimeout(() => { logoGone.value = true }, LOGO_FADE_MS + 80)
})
watch(backdropHidden, (hidden) => {
  if (!hidden || backdropGoneId !== null) return
  backdropGoneId = window.setTimeout(() => { backdropGone.value = true }, BACKDROP_FADE_MS + 80)
})

const viewportSize = ref(Math.min(window.innerWidth, window.innerHeight))
const logoRef = ref<HTMLElement | null>(null)

const onResize = () => {
  viewportSize.value = Math.min(window.innerWidth, window.innerHeight)
}

let settleFallbackId: number | null = null

onMounted(() => {
  window.addEventListener('resize', onResize)

  const staticSplash = document.getElementById('static-splash')
  if (staticSplash) {
    staticSplash.classList.add('hidden')
    setTimeout(() => staticSplash.remove(), 500)
  }

  // Hard fallback so the splash always clears, even if the asset loader
  // never reports 100% (offline / blocked images / dropped requests).
  settleFallbackId = window.setTimeout(() => {
    if (!done.value) done.value = true
  }, 4000)
  stuckHintId = window.setTimeout(() => {
    if (!done.value) showStuckHint.value = true
  }, 10000)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  if (settleFallbackId !== null) clearTimeout(settleFallbackId)
  if (stuckHintId !== null) clearTimeout(stuckHintId)
  if (logoGoneId !== null) clearTimeout(logoGoneId)
  if (backdropGoneId !== null) clearTimeout(backdropGoneId)
})

const centeredSize = computed(() => Math.floor(viewportSize.value * 0.4))
const sizeStyle = computed(() => ({
  width: `${centeredSize.value}px`,
  height: `${centeredSize.value}px`
}))

// `immediate: true` fires the handler with the current value the moment
// the watcher is set up. Without it, an asset loader that already reports
// 100% (instant boots, especially on localhost) never trips the watcher
// and the splash sits around for the full 4s `settleFallbackId` window.
watch(progress, (val) => {
  if (val >= 100 && !done.value) {
    setTimeout(() => { done.value = true }, 100)
  }
}, { immediate: true })

let cgLoadSignaled = false
const signalGameReadyToCG = () => {
  if (cgLoadSignaled) return
  cgLoadSignaled = true
  try {
    // Hot-loading is done → close the CG loading phase. `gameplayStart()` is
    // NOT fired here: it waits for the player's first interaction with the live
    // game (the gameplay bracket, `usePortalGameplay`). No-op off CrazyGames.
    stopLoading()
  } catch (e) { console.warn('[FLogoProgress] CG ready-to-play failed', e) }
}

// Playgama's `game_ready` is certification-mandatory — fire it on the same
// splash-resolved edge as CG's loadingStop. The plugin guards the message
// internally so it fires once even if the watcher re-triggers.
//
// Gate uses the inline `import.meta.env.VITE_APP_*` literal (NOT the
// `isPlaygama` re-export from `useUser`) so Rollup can statically
// eliminate the dynamic-import branch on non-Playgama builds. The
// cross-module constant propagation isn't reliable enough for the
// re-exported `const` to be recognised as a build-time literal, and
// without DCE every build picks up a ~5 KB lazy `playgamaPlugin` chunk
// it never loads. Same pattern in `main.ts`.
let playgamaLoadSignaled = false
const signalGameReadyToPlaygama = () => {
  if (playgamaLoadSignaled) return
  if (import.meta.env.VITE_APP_PLAYGAMA !== 'true') return
  playgamaLoadSignaled = true
  void import('@/utils/playgamaPlugin').then(({ playgamaGameLoadingStop }) => {
    try { playgamaGameLoadingStop() }
    catch (e) { console.warn('[FLogoProgress] Playgama game_ready failed', e) }
  })
}

// Feed the Bridge's own loading logo. v2 moved this off the deleted
// `bridge.game` module onto `bridge.setGameLoadingProgress(percent)`, and the
// Bridge renders that overlay BY DEFAULT on every platform except Yandex/Y8
// (`disableLoadingLogo` in the config would suppress it). We deliberately keep
// it — it is Playgama's own branding on their own portal, and suppressing a
// portal's loading UI is the kind of deviation a reviewer notices — but an
// overlay stuck at 0% while our splash loads underneath is worse than no
// overlay, so it gets the real number.
//
// Rounded + deduped: `progress` ticks on every asset, and each report walks
// the Bridge's DOM overlay.
let playgamaProgressPromise: Promise<typeof import('@/utils/playgamaPlugin')> | null = null
let lastReportedProgress = -1
if (import.meta.env.VITE_APP_PLAYGAMA === 'true') {
  watch(progress, (val) => {
    const pct = Math.max(0, Math.min(100, Math.round(val)))
    if (pct === lastReportedProgress) return
    lastReportedProgress = pct
    if (!playgamaProgressPromise) playgamaProgressPromise = import('@/utils/playgamaPlugin')
    void playgamaProgressPromise
      .then(({ playgamaSetLoadingProgress }) => playgamaSetLoadingProgress(pct))
      .catch(() => undefined)
  }, { immediate: true })
}

// GamePix's `gameLoaded` is the analogous certification-critical edge —
// the toolkit's pause/resume self-test requires a complete
// `customLoading → gameLoading(0..100) → gameLoaded` chain or
// `processLoadingEvent` dies on every pause click. The plugin guards the
// `gameLoaded` fire internally so re-triggering is harmless. Same
// `import.meta.env` literal pattern as the Playgama branch above so
// non-GamePix builds DCE the dynamic-import entirely.
let gamepixLoadSignaled = false
const signalGameReadyToGamepix = () => {
  if (gamepixLoadSignaled) return
  if (import.meta.env.VITE_APP_GAMEPIX !== 'true') return
  gamepixLoadSignaled = true
  void import('@/utils/gamepixPlugin').then(({ gamePixGameLoadingStop }) => {
    try { gamePixGameLoadingStop() }
    catch (e) { console.warn('[FLogoProgress] GamePix gameLoaded failed', e) }
  })
}

// Yandex's `LoadingAPI.ready()` is certification-mandatory — fire it on the
// same splash-resolved edge as CG / Playgama / GamePix. Cert text: "At the
// moment when the user can start playing the game, the LoadingAPI.ready()
// method from Game Ready must be called." The plugin guards the call
// internally so re-triggering is harmless. Same `import.meta.env` literal
// pattern as the platform branches above so non-Yandex builds DCE the
// dynamic-import entirely.
let yandexLoadSignaled = false
const signalGameReadyToYandex = () => {
  if (yandexLoadSignaled) return
  if (import.meta.env.VITE_APP_YANDEX !== 'true') return
  yandexLoadSignaled = true
  void import('@/utils/yandexPlugin').then(({ yandexLoadingReady }) => {
    try { yandexLoadingReady() }
    catch (e) { console.warn('[FLogoProgress] Yandex LoadingAPI.ready failed', e) }
  })
}

// Poki's `gameLoadingFinished()` is the ONE strictly-required SDK call — every
// byte transferred before it counts toward the load-size metric P4D reports.
// Same splash-resolved edge as CG's `loadingStop` / Playgama's `game_ready` /
// GamePix's `gameLoaded` / Yandex's `LoadingAPI.ready()`; the plugin guards it
// internally so a re-trigger is harmless.
//
// Same `import.meta.env` literal pattern as the branches above so non-Poki
// builds DCE the dynamic import entirely (this component is in the obfuscator's
// exclude list, which is what keeps the `'@/…'` specifier resolvable).
let pokiLoadSignaled = false
const signalGameReadyToPoki = () => {
  if (pokiLoadSignaled) return
  if (import.meta.env.VITE_APP_POKI !== 'true') return
  pokiLoadSignaled = true
  void import('@/utils/pokiPlugin').then(({ pokiGameLoadingFinished }) => {
    try { pokiGameLoadingFinished() }
    catch (e) { console.warn('[FLogoProgress] Poki gameLoadingFinished failed', e) }
  })
}

// The gameplay bracket (`usePortalGameplay`) learns the game is live on the
// same edge — this game boots straight into a live board, so "the splash is
// gone" IS "the board is running". It then waits for the player's first
// interaction before any portal hears `gameplayStart()`. Every portal with a
// bracket needs this edge: it used to ride along on Poki's only, which left
// Playgama's `gameplay_started` unreachable.
let bracketLiveSignaled = false
const signalGameLiveToBracket = () => {
  if (bracketLiveSignaled) return
  if (
    import.meta.env.VITE_APP_CRAZY_WEB !== 'true'
    && import.meta.env.VITE_APP_POKI !== 'true'
    && import.meta.env.VITE_APP_PLAYGAMA !== 'true'
    && import.meta.env.VITE_APP_YANDEX !== 'true'
  ) return
  bracketLiveSignaled = true
  void import('@/use/usePortalGameplay').then(({ notifyPortalGameLive }) => {
    try { notifyPortalGameLive() }
    catch (e) { console.warn('[FLogoProgress] game-live signal failed', e) }
  })
}

watch(done, (isDone) => {
  if (isDone) {
    setTimeout(() => {
      backdropHidden.value = true
      signalGameReadyToCG()
      signalGameReadyToPlaygama()
      signalGameReadyToGamepix()
      signalGameReadyToYandex()
      signalGameReadyToPoki()
      signalGameLiveToBracket()
      // Triggers the GameMonetize / GamePix first-load interstitial (no-op on
      // other builds — the orchestrator was never armed). Runs alongside the platform
      // `game_ready` / `gameLoaded` signals so the ad lands immediately once
      // the splash is gone and the SDK is fillable.
      notifySplashGone()
    }, 150)
  }
})
</script>

<style scoped lang="sass">
.no-os-ui
  caret-color: transparent
  user-select: none
  -webkit-user-select: none
  -webkit-touch-callout: none
  -webkit-tap-highlight-color: transparent

  &, & *
    -webkit-user-drag: none

.percentage-text
  font-size: 1.2rem
  font-weight: bold

// The two fades below are the former `splash-fade` / `logo-fade` <Transition>
// leaves, re-expressed as state classes. Same durations, same easing, same
// end state — but the element's removal is a `setTimeout`, not a
// `transitionend` that a frame-starved page never delivers.
.splash-backdrop
  position: fixed
  inset: 0
  z-index: 150
  background-color: #070a14
  background-image: var(--splash-portrait)
  background-repeat: no-repeat
  background-position: center
  background-size: cover
  transition: opacity 0.4s ease-out
  // GameScene's `sideBySide` (≥ 1.15 wide, or a phone held landscape) → the landscape sky.
  @media (min-aspect-ratio: 23/20), (orientation: landscape) and (pointer: coarse) and (min-width: 501px)
    background-image: var(--splash-landscape)

.splash-backdrop--out
  opacity: 0
  pointer-events: none

.splash-logo
  transition: opacity 0.35s ease-out, transform 0.35s ease-out

.splash-logo--out
  opacity: 0
  transform: translate(-50%, -50%) scale(0.85)
  pointer-events: none

.stuck-hint
  color: rgba(255, 200, 0, 0.85)
  font-size: 0.9rem
  text-align: center
  max-width: 80vw
</style>
