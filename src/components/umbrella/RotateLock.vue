<script setup lang="ts">
/**
 * The landscape lock. On a phone or tablet held upright the game is covered by this card: a phone
 * that turns onto its side (and the world drawn inside it, sideways until it does), a sweeping
 * arrow, the message. It lifts the moment the device is turned, and comes back if it is turned
 * upright again. While it is up the game is frozen like behind any menu (gameplayStop included).
 *
 * It wears the build's look: plain flat vector for the drawn game, lit washi, lacquer and hanging
 * lanterns for the lantern build. Motion is transform /
 * opacity only; prefers-reduced-motion keeps the phone turned and fades instead.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isTouchDevice, shouldLockRotate } from '@/umbrella/rotateLock'
import { acquireModalOpen } from '@/use/useModalState'
import { useUiTheme } from '@/umbrella/ui/theme'
import HangingLantern from './ornaments/HangingLantern.vue'

const { t } = useI18n()
const theme = useUiTheme()
const touch = isTouchDevice()

const locked = ref(false)
const measure = () => {
  locked.value = shouldLockRotate(touch, window.innerWidth, window.innerHeight)
}

let release: (() => void) | null = null
watch(locked, (on) => {
  if (on && !release) release = acquireModalOpen()
  else if (!on) { release?.(); release = null }
})

// Orientation events fire before the viewport has settled on some browsers: measure again shortly after.
let settle = 0
const onTurn = () => { measure(); window.clearTimeout(settle); settle = window.setTimeout(measure, 300) }
onMounted(() => {
  measure()
  window.addEventListener('resize', onTurn)
  window.addEventListener('orientationchange', onTurn)
})
onUnmounted(() => {
  window.removeEventListener('resize', onTurn)
  window.removeEventListener('orientationchange', onTurn)
  window.clearTimeout(settle)
  release?.()
  release = null
})

// Stars of the lantern night: fixed spots, only the motion is random-looking.
const stars = Array.from({ length: 22 }, (_, k) => ({ left: `${(k * 41 + 7) % 100}%`, top: `${(k * 23 + 5) % 62}%`, delay: `${-((k * 47) % 30) / 10}s`, size: 2 + (k % 3) }))
</script>

<template>
  <Transition name="rl">
    <div
      v-if="locked"
      class="rl"
      :class="theme ? `rl-${theme}` : 'rl-plain'"
      role="alertdialog"
      aria-modal="true"
      :aria-label="t('umbrella.rotate.title')"
    >
      <!-- The backdrop of the build. -->
      <div class="rl-sky" aria-hidden="true">
        <template v-if="theme === 'lantern'">
          <i v-for="(s, k) in stars" :key="k" class="rl-star" :style="{ left: s.left, top: s.top, width: `${s.size}px`, height: `${s.size}px`, animationDelay: s.delay }" />
          <i class="rl-moon" />
        </template>
        <template v-else>
          <i class="rl-blob a" /><i class="rl-blob b" />
        </template>
      </div>
      <HangingLantern v-if="theme === 'lantern'" class="rl-hang l" />
      <HangingLantern v-if="theme === 'lantern'" class="rl-hang r" />

      <div class="rl-stage" aria-hidden="true">
        <!-- The arrow that sweeps round as the phone turns. -->
        <svg class="rl-arrow" viewBox="0 0 260 260">
          <path class="rl-arc" pathLength="1" d="M170 19 A118 118 0 0 0 19 90" />
          <path class="rl-head" d="M30.9 79.3 L19 90 L16.8 74.2" />
        </svg>
        <div class="rl-shadow" />
        <div class="rl-phone">
          <div class="rl-screen">
            <!-- The world is drawn sideways: upright once the phone is. -->
            <div class="rl-world">
              <i class="rl-cloud a" /><i class="rl-cloud b" />
              <i class="rl-hill" />
              <svg class="rl-umb" viewBox="0 0 48 52">
                <path class="rl-umb-dome" d="M3 25 A21 21 0 0 1 45 25 Q39.5 20.5 34.5 25 Q29.2 20.5 24 25 Q18.8 20.5 13.5 25 Q8.5 20.5 3 25Z" />
                <path class="rl-umb-pole" d="M24 25 V42 a3.6 3.6 0 0 1 -7.2 0" />
                <circle class="rl-umb-tip" cx="24" cy="4.4" r="1.7" />
              </svg>
              <i class="rl-finish" />
            </div>
            <i class="rl-glare" />
          </div>
          <i class="rl-notch" />
        </div>
      </div>

      <div class="rl-card">
        <h2 class="rl-title">{{ t('umbrella.rotate.title') }}</h2>
        <p class="rl-hint">{{ t('umbrella.rotate.hint') }}</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rl {
  --rl-t: 5.2s;
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(18px, 5vh, 40px);
  padding: env(safe-area-inset-top) 20px env(safe-area-inset-bottom);
  overflow: hidden;
  color: var(--rl-ink);
  font-family: var(--u-font, var(--app-font-stack, 'Segoe UI', system-ui, sans-serif));
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

/* ── Enter / leave: the card rises in, the phone scales out ─────────────────── */
.rl-enter-active { transition: opacity 0.45s ease; }
.rl-leave-active { transition: opacity 0.35s ease 0.05s; }
.rl-enter-from, .rl-leave-to { opacity: 0; }
.rl-enter-active .rl-stage, .rl-enter-active .rl-card { animation: rl-rise 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.rl-enter-active .rl-card { animation-delay: 0.12s; }
.rl-leave-active .rl-stage, .rl-leave-active .rl-card { transition: transform 0.35s cubic-bezier(0.55, 0, 0.75, 0.2); transform: scale(0.9); }
@keyframes rl-rise { from { opacity: 0; transform: translateY(26px) scale(0.92); } }

/* ── The phone: holds upright, turns a quarter (with a springy overshoot), holds, returns ── */
.rl-stage { position: relative; width: 260px; height: 260px; flex: none; display: grid; place-items: center; scale: 1.25; margin-block: 28px; }
.rl-arrow { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.rl-arc, .rl-head { fill: none; stroke: var(--rl-accent); stroke-width: 9; stroke-linecap: round; stroke-linejoin: round; }
.rl-arc { stroke-dasharray: 1; stroke-dashoffset: 1; animation: rl-arc var(--rl-t) ease-in-out infinite; }
.rl-head { opacity: 0; animation: rl-head var(--rl-t) ease-in-out infinite; }
@keyframes rl-arc {
  0%, 13% { stroke-dashoffset: 1; opacity: 0; }
  14% { stroke-dashoffset: 1; opacity: 1; }
  38% { stroke-dashoffset: 0; opacity: 1; }
  80% { stroke-dashoffset: 0; opacity: 1; }
  92%, 100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes rl-head {
  0%, 34% { opacity: 0; }
  40%, 80% { opacity: 1; }
  92%, 100% { opacity: 0; }
}
.rl-shadow {
  position: absolute;
  left: 50%;
  bottom: 14px;
  width: 150px;
  height: 22px;
  margin-left: -75px;
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--rl-shadow), transparent);
  animation: rl-shadow var(--rl-t) ease-in-out infinite;
}
@keyframes rl-shadow { 0%, 16%, 90%, 100% { transform: scale(0.7, 1); } 42%, 80% { transform: scale(1.25, 1); } }

.rl-phone {
  --pw: 112px;
  --ph: 200px;
  --bezel: 9px;
  position: relative;
  width: var(--pw);
  height: var(--ph);
  border-radius: 22px;
  background: var(--rl-body);
  box-shadow: var(--rl-body-shadow);
  animation: rl-turn var(--rl-t) infinite;
}
@keyframes rl-turn {
  0%, 14% { transform: rotate(0deg) translateY(0); animation-timing-function: cubic-bezier(0.5, 0, 0.3, 1); }
  18% { transform: rotate(0deg) translateY(-8px); animation-timing-function: cubic-bezier(0.5, 0, 0.3, 1); }
  38% { transform: rotate(-98deg) translateY(-4px); animation-timing-function: ease-in-out; }
  44% { transform: rotate(-88deg) translateY(0); animation-timing-function: ease-in-out; }
  48%, 82% { transform: rotate(-90deg) translateY(0); animation-timing-function: cubic-bezier(0.5, 0, 0.3, 1); }
  96%, 100% { transform: rotate(0deg) translateY(0); }
}
.rl-screen {
  position: absolute;
  inset: var(--bezel);
  border-radius: 14px;
  overflow: hidden;
  background: var(--rl-sky);
  box-shadow: inset 0 0 0 1.5px var(--rl-screen-rim);
}
.rl-notch { position: absolute; left: 50%; top: 3px; width: 26px; height: 4px; margin-left: -13px; border-radius: 3px; background: var(--rl-notch); }
.rl-glare {
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, rgba(255, 255, 255, 0.2) 0 28%, transparent 28% 40%, rgba(255, 255, 255, 0.07) 40% 52%, transparent 52%);
  pointer-events: none;
}

/* The little world on the screen: drawn landscape (182 × 94), laid on its side. */
.rl-world {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 182px;
  height: 94px;
  margin: -47px 0 0 -91px;
  transform: rotate(90deg);
  background: var(--rl-world-sky);
  overflow: hidden;
}
.rl-cloud { position: absolute; width: 38px; height: 12px; border-radius: 12px; background: var(--rl-cloud); box-shadow: 10px -6px 0 -1px var(--rl-cloud); animation: rl-drift 7s linear infinite; }
.rl-cloud.a { top: 16px; left: -40px; }
.rl-cloud.b { top: 38px; left: -90px; scale: 0.7; animation-duration: 10s; }
@keyframes rl-drift { to { transform: translateX(260px); } }
.rl-hill { position: absolute; left: -10%; right: -10%; bottom: -26px; height: 52px; border-radius: 50% 50% 0 0; background: var(--rl-hill); box-shadow: 0 -3px 0 var(--rl-hill-top); }
.rl-finish { position: absolute; right: 16px; bottom: 22px; width: 3px; height: 26px; background: var(--rl-pole); }
.rl-finish::after { content: ''; position: absolute; left: 3px; top: 0; width: 14px; height: 9px; background: var(--rl-flag); clip-path: polygon(0 0, 100% 50%, 0 100%); transform-origin: 0 50%; animation: rl-flag 1.2s ease-in-out infinite alternate; }
@keyframes rl-flag { to { transform: scaleX(0.7) skewY(-8deg); } }
.rl-umb { position: absolute; left: 48px; top: 18px; width: 30px; animation: rl-glide var(--rl-t) ease-in-out infinite; }
.rl-umb-dome { fill: var(--rl-umb); stroke: var(--rl-umb-line); stroke-width: 2.4; stroke-linejoin: round; }
.rl-umb-pole { fill: none; stroke: var(--rl-umb-line); stroke-width: 2.6; stroke-linecap: round; }
.rl-umb-tip { fill: var(--rl-umb-line); }
/* It floats across the screen once the phone has turned. */
@keyframes rl-glide {
  0%, 44% { transform: translate(0, 0) rotate(0deg); }
  60% { transform: translate(34px, 9px) rotate(5deg); }
  76% { transform: translate(70px, 4px) rotate(-4deg); }
  88%, 100% { transform: translate(86px, 16px) rotate(0deg); }
}

/* ── The message ─────────────────────────────────────────────────────────────── */
.rl-card { position: relative; max-width: min(88vw, 420px); text-align: center; }
.rl-title {
  margin: 0;
  font-size: clamp(24px, 7.4vw, 38px);
  font-weight: 900;
  line-height: 1.12;
  letter-spacing: 0.04em;
  text-wrap: balance;
  font-family: var(--u-display, inherit);
}
.rl-hint { margin: 10px 0 0; font-size: clamp(15px, 4.2vw, 19px); font-weight: 700; line-height: 1.3; text-wrap: balance; opacity: 0.88; }

/* ═══ Drawn: the plain vector game — flat colour, one dark outline, the arena's "tap to start" type ═══ */
.rl-plain {
  --rl-ink: #fff;
  --rl-accent: #4f8cff;
  --rl-shadow: rgba(0, 0, 0, 0.5);
  --rl-body: #f2f5fb;
  --rl-body-shadow: 0 0 0 4px #0b0e16, 0 12px 0 4px #0b0e16, 0 20px 30px rgba(0, 0, 0, 0.45);
  --rl-notch: #0b0e16;
  --rl-screen-rim: #0b0e16;
  --rl-sky: #0b0e16;
  --rl-world-sky: linear-gradient(#7cc4ff, #cdeaff);
  --rl-cloud: #fff;
  --rl-hill: #52b36a;
  --rl-hill-top: #7fd78f;
  --rl-umb: #ff5d5d;
  --rl-umb-line: #1a2236;
  --rl-pole: #1a2236;
  --rl-flag: #ffd23f;
  background: radial-gradient(120% 90% at 50% 30%, #1d2b4f 0%, #0d1018 70%);
}
.rl-plain .rl-title { text-transform: uppercase; text-shadow: 0 3px 0 rgba(0, 0, 0, 0.45), 0 0 26px rgba(0, 0, 0, 0.6); }
.rl-plain .rl-arc, .rl-plain .rl-head { stroke: var(--rl-accent); filter: drop-shadow(0 3px 0 #0b0e16); }
.rl-blob { position: absolute; border-radius: 50%; background: rgba(79, 140, 255, 0.14); animation: rl-float 9s ease-in-out infinite alternate; }
.rl-blob.a { width: 60vmax; height: 60vmax; left: -22vmax; top: -18vmax; }
.rl-blob.b { width: 46vmax; height: 46vmax; right: -20vmax; bottom: -14vmax; background: rgba(255, 210, 63, 0.09); animation-duration: 12s; }
@keyframes rl-float { to { transform: translate(5%, 4%) scale(1.08); } }

/* ═══ Lantern: lit washi, lacquer and gold leaf under a festival night ═══ */
.rl-lantern {
  --rl-ink: #fbf1dc;
  --rl-accent: #ffe7a6;
  --rl-shadow: rgba(5, 3, 20, 0.6);
  --rl-body: linear-gradient(160deg, #a02a22 0%, #7e1a17 55%, #4e0e0d 100%);
  --rl-body-shadow: 0 0 0 2px #2a1d3a, 0 0 0 4px #e8b450, 0 0 0 5.5px #2a1d3a, 0 16px 26px rgba(5, 3, 20, 0.55), 0 0 40px rgba(255, 170, 70, 0.3);
  --rl-notch: #2a1d3a;
  --rl-screen-rim: #e8b450;
  --rl-sky: #18133a;
  --rl-world-sky: linear-gradient(#251f50, #5b2c5e 80%, #d6452c);
  --rl-cloud: rgba(246, 236, 214, 0.55);
  --rl-hill: #2a1d3a;
  --rl-hill-top: #e8b450;
  --rl-umb: #f6ecd6;
  --rl-umb-line: #7e1a17;
  --rl-pole: #e8b450;
  --rl-flag: #d6452c;
  background: radial-gradient(110% 80% at 50% 108%, rgba(214, 69, 44, 0.42) 0%, rgba(214, 69, 44, 0) 60%), linear-gradient(180deg, #1a1638 0%, #262052 100%);
}
.rl-lantern .rl-title { color: #7e1a17; text-shadow: none; }
/* The title on a washi banner with swallowtail ends and a gold rule, like the HUD's level label. */
.rl-lantern .rl-card::before {
  content: '';
  position: absolute;
  left: -14px;
  right: -14px;
  top: -4px;
  height: 66px;
  clip-path: polygon(0 0, 100% 0, calc(100% - 12px) 50%, 100% 100%, 0 100%, 12px 50%);
  background:
    linear-gradient(#b8862e, #b8862e) left 0 top 5px / 100% 1.5px no-repeat,
    linear-gradient(#b8862e, #b8862e) left 0 bottom 5px / 100% 1.5px no-repeat,
    radial-gradient(120% 140% at 50% 40%, #fffaf0 0%, #f3e4c4 60%, #dcc69a 100%);
  filter: drop-shadow(0 4px 0 rgba(15, 10, 35, 0.5));
}
.rl-lantern .rl-title, .rl-lantern .rl-hint { position: relative; }
.rl-lantern .rl-title { font-size: clamp(20px, 6.2vw, 32px); padding: 14px 8px 6px; white-space: normal; }
.rl-lantern .rl-hint { margin-top: 20px; color: #ffe7a6; text-shadow: 0 2px 0 rgba(15, 10, 35, 0.7), 0 0 14px rgba(255, 170, 70, 0.45); }
.rl-lantern .rl-arc, .rl-lantern .rl-head { filter: drop-shadow(0 0 7px rgba(255, 190, 90, 0.85)); stroke-width: 7; }
.rl-lantern .rl-phone { border-radius: 20px; }
.rl-lantern .rl-notch { background: #e8b450; opacity: 0.8; }
.rl-star { position: absolute; border-radius: 50%; background: #ffe7a6; box-shadow: 0 0 6px 1px rgba(255, 231, 166, 0.7); animation: rl-twinkle 3s ease-in-out infinite; }
@keyframes rl-twinkle { 0%, 100% { opacity: 0.25; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.15); } }
.rl-moon { position: absolute; right: 18%; top: 11%; width: 38px; height: 38px; border-radius: 50%; background: radial-gradient(circle at 36% 34%, #fff6d8, #f3dc9c 70%); box-shadow: 0 0 34px 8px rgba(255, 214, 130, 0.35); opacity: 0.9; }
/* The two lanterns hang from the top edge either side of the title and swing out of step. */
.rl-hang { position: absolute; top: -10px; width: clamp(40px, 13vw, 62px); }
.rl-hang.l { left: 6%; }
.rl-hang.r { right: 6%; }
.rl-hang.r :deep(.hl) { animation-delay: -1.9s; }


/* ═══ Reduced motion: the phone stays turned, the arrow stays drawn, nothing sweeps or falls ═══ */
@media (prefers-reduced-motion: reduce) {
  .rl-phone { animation: none; transform: rotate(-90deg); }
  .rl-arc { animation: none; stroke-dashoffset: 0; }
  .rl-head { animation: none; opacity: 1; }
  .rl-umb, .rl-cloud, .rl-finish::after, .rl-shadow, .rl-blob, .rl-star,   .rl-shadow { transform: scale(1.25, 1); }
  .rl-enter-active .rl-stage, .rl-enter-active .rl-card { animation: none; }
  .rl-leave-active .rl-stage, .rl-leave-active .rl-card { transform: none; }
}
</style>
