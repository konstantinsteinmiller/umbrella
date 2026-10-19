<script setup lang="ts">
/**
 * Umbrella — the single game scene (GDD.md prototype).
 *
 * A fixed-step simulation (src/umbrella/engine.ts) drawn to one DPR-sharp
 * canvas. Failure resets the level at the spawn point; landing on the finish
 * dances, then moves on. The T key opens the feel-tuning panel the GDD asks
 * designers to send numbers from.
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { LEVELS } from '@/umbrella/levels'
import { createWorld, step, type GameEvent, type Input, type World } from '@/umbrella/engine'
import { render } from '@/umbrella/renderer'
import { DEFAULT_TUNING, TUNING_RANGES, type Tuning } from '@/umbrella/tuning'
import { setAudioMuted, sfx, unlockAudio } from '@/umbrella/audio'
import { getState, setState } from '@/use/useEpicState'
import { isGamePaused, isAudioPaused } from '@/use/useGamePause'

const { t } = useI18n()

const DT = 1 / 120
const WIN_HOLD = 1.6

const tuning = reactive<Tuning>({ ...DEFAULT_TUNING, ...getState<Partial<Tuning>>('umb_tuning', {}) })
watch(tuning, () => setState('umb_tuning', { ...tuning }), { deep: true })

const levelIndex = ref(Math.min(LEVELS.length - 1, Math.max(0, getState<number>('umb_level', 0))))
watch(levelIndex, (i) => setState('umb_level', i))

const canvas = ref<HTMLCanvasElement | null>(null)
const showTuning = ref(false)
const copied = ref(false)
const brokenFlash = ref(false)

let world: World = createWorld(LEVELS[levelIndex.value]!)
const held = { left: false, right: false }
let togglePending = false

const loadLevel = (i: number) => {
  levelIndex.value = (i + LEVELS.length) % LEVELS.length
  world = createWorld(LEVELS[levelIndex.value]!)
  brokenFlash.value = false
}
const restart = () => loadLevel(levelIndex.value)

const onEvent = (e: GameEvent) => {
  switch (e) {
    case 'open': sfx.open(); break
    case 'close': sfx.close(); break
    case 'land': sfx.land(); break
    case 'win': sfx.win(); break
    case 'splat': sfx.splat(); break
    case 'out': sfx.whistle(tuning.whistleFade); break
    case 'break':
      sfx.break()
      brokenFlash.value = true
      break
  }
}

const tick = () => {
  const input: Input = { left: held.left, right: held.right, toggle: togglePending }
  togglePending = false
  for (const e of step(world, input, DT, tuning)) onEvent(e)
  // GDD prototype: failure resets the level at the spawn point.
  if (world.phase === 'out') restart()
  else if (world.phase === 'splat' && world.phaseTime >= tuning.splatReset) restart()
  else if (world.phase === 'win' && world.phaseTime >= WIN_HOLD) loadLevel(levelIndex.value + 1)
}

// ── Loop ──
let raf = 0
let last = 0
let acc = 0
const frame = (now: number) => {
  raf = requestAnimationFrame(frame)
  const el = canvas.value
  if (!el) return
  const dtReal = Math.min(0.1, (now - (last || now)) / 1000)
  last = now
  if (!isGamePaused.value) {
    acc += dtReal
    while (acc >= DT) {
      tick()
      acc -= DT
    }
  }
  resize(el)
  const ctx = el.getContext('2d')
  if (ctx) render(ctx, world, { finish: t('umbrella.finish') })
}

/** Backing store at css × devicePixelRatio — never draw below native. */
const resize = (el: HTMLCanvasElement) => {
  const dpr = window.devicePixelRatio || 1
  const w = Math.round(el.clientWidth * dpr)
  const h = Math.round(el.clientHeight * dpr)
  if (el.width !== w || el.height !== h) {
    el.width = w
    el.height = h
  }
}

// ── Input (physical keys: WASD sits under the same fingers on any layout) ──
const LEFT = new Set(['ArrowLeft', 'KeyA'])
const RIGHT = new Set(['ArrowRight', 'KeyD'])
const onKey = (down: boolean) => (e: KeyboardEvent) => {
  if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
  if (LEFT.has(e.code)) held.left = down
  else if (RIGHT.has(e.code)) held.right = down
  else if (e.code === 'Space') {
    if (down && !e.repeat) togglePending = true
  } else if (down && e.code === 'KeyR') restart()
  else if (down && e.code === 'KeyT') showTuning.value = !showTuning.value
  else return
  e.preventDefault()
  if (down) unlockAudio()
}
const onKeyDown = onKey(true)
const onKeyUp = onKey(false)
const onBlur = () => { held.left = held.right = false }

watch(isAudioPaused, (m) => setAudioMuted(m), { immediate: true })

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  raf = requestAnimationFrame(frame)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  cancelAnimationFrame(raf)
})

// ── Tuning panel (designer/debug overlay) ──
const tuningKeys = Object.keys(TUNING_RANGES) as (keyof Tuning)[]
const tuningText = computed(() => tuningKeys.map((k) => `${k}: ${tuning[k]}`).join('\n'))
const copyTuning = async () => {
  try {
    await navigator.clipboard.writeText(`Umbrella tuning (level ${levelIndex.value + 1})\n${tuningText.value}`)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch { /* clipboard blocked: values are visible in the panel */ }
}
const resetTuning = () => Object.assign(tuning, DEFAULT_TUNING)
</script>

<template>
  <div class="umbrella-scene">
    <canvas ref="canvas" class="umbrella-canvas" @pointerdown="unlockAudio" />

    <div class="hud">
      <button class="hud-btn" :aria-label="t('umbrella.prevLevel')" @click="loadLevel(levelIndex - 1)">‹</button>
      <span class="hud-level">{{ t('umbrella.level', { n: levelIndex + 1 }) }}</span>
      <button class="hud-btn" :aria-label="t('umbrella.nextLevel')" @click="loadLevel(levelIndex + 1)">›</button>
      <button class="hud-btn" :aria-label="t('umbrella.restart')" @click="restart">↻</button>
    </div>

    <div class="hint">{{ t('umbrella.controls') }}</div>
    <div v-if="brokenFlash" class="toast">{{ t('umbrella.broken') }}</div>

    <div v-if="showTuning" class="tuning" @keydown.stop>
      <div class="tuning-head">
        <b>Tuning</b>
        <button @click="copyTuning">{{ copied ? 'Copied!' : 'Copy values' }}</button>
        <button @click="resetTuning">Reset</button>
        <button @click="showTuning = false">✕</button>
      </div>
      <label v-for="k in tuningKeys" :key="k" class="tuning-row">
        <span>{{ k }}</span>
        <input
          v-model.number="tuning[k]"
          type="range"
          :min="TUNING_RANGES[k][0]"
          :max="TUNING_RANGES[k][1]"
          :step="TUNING_RANGES[k][2]"
        >
        <input v-model.number="tuning[k]" type="number" :step="TUNING_RANGES[k][2]" class="tuning-num">
      </label>
    </div>
  </div>
</template>

<style scoped>
.umbrella-scene {
  position: fixed;
  inset: 0;
  background: #0d1018;
  color: #fff;
  font-family: system-ui, sans-serif;
  user-select: none;
}
.umbrella-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.hud {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
}
.hud-level {
  font-weight: 700;
  font-size: 20px;
  min-width: 110px;
  text-align: center;
}
.hud-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 20px;
  line-height: 1;
}
.hud-btn:hover { background: rgba(255, 255, 255, 0.22); }
.hint {
  position: absolute;
  bottom: 12px;
  left: 0;
  right: 0;
  text-align: center;
  opacity: 0.6;
  font-size: 14px;
}
.toast {
  position: absolute;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  background: #c0392b;
  padding: 6px 14px;
  border-radius: 8px;
  font-weight: 700;
}
.tuning {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 360px;
  max-height: calc(100% - 24px);
  overflow: auto;
  background: rgba(10, 12, 20, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  padding: 10px;
  font-size: 12px;
}
.tuning-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
.tuning-head b { flex: 1; }
.tuning-head button {
  background: rgba(255, 255, 255, 0.15);
  padding: 2px 8px;
  border-radius: 6px;
}
.tuning-row {
  display: grid;
  grid-template-columns: 120px 1fr 64px;
  gap: 6px;
  align-items: center;
  margin: 3px 0;
}
.tuning-num {
  background: #222;
  color: #fff;
  width: 64px;
  padding: 1px 4px;
}
</style>
