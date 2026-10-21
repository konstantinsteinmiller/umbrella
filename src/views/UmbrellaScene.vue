<script setup lang="ts">
/**
 * Umbrella — the single game scene (GDD.md prototype).
 *
 * A fixed-step simulation (src/umbrella/engine.ts) drawn to one DPR-sharp
 * canvas. Failure resets the level at the spawn point; landing on the finish
 * dances, then moves on. Typing "cmonc" opens the hidden feel-tuning panel
 * the GDD asks designers to send numbers from.
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { LEVELS } from '@/umbrella/levels'
import { editorUnlocked, setEditorUnlocked, testLevel } from '@/umbrella/customLevels'
import { createWorld, step, windInfluence, type GameEvent, type Input, type World } from '@/umbrella/engine'
import { render } from '@/umbrella/renderer'
import { DEFAULT_TUNING, type Tuning } from '@/umbrella/tuning'
import { applyTuning, createTuningGui, exportTuning, type TuningExport, type TuningGui } from '@/umbrella/tuningGui'
import { playSfx, setAudioLevels, setAudioMuted, unlockAudio, updateAmbience } from '@/umbrella/audio'
import { AMBIENCE_IDLE, type AmbienceState } from '@/umbrella/soundKit'
import { getState, setState } from '@/use/useEpicState'
import { isGamePaused, isAudioPaused } from '@/use/useGamePause'
import { isPlatformAudioMuted } from '@/use/useGamePauseAudio'
import { isMobileAudioMuted } from '@/use/useMobileAudioMute'

const { t } = useI18n()
const router = useRouter()

/** A level handed over by the editor's "Test" button: it loops until you go back. */
const testing = testLevel.value
const levelDef = () => testing ?? LEVELS[levelIndex.value]!
const backToEditor = () => {
  testLevel.value = null
  void router.push('/editor')
}
const openEditor = () => void router.push('/editor')

const DT = 1 / 120

const tuning = reactive<Tuning>({ ...DEFAULT_TUNING, ...getState<Partial<Tuning>>('umb_tuning_r2', {}) })
watch(tuning, () => setState('umb_tuning_r2', { ...tuning }), { deep: true })
// Level edits from the panel (wind speeds, platform periods) persist alongside.
applyTuning({ levels: getState<TuningExport['levels']>('umb_levels_r2', []) }, tuning, LEVELS)
const saveLevels = () => setState('umb_levels_r2', exportTuning(tuning, LEVELS).levels)
let gui: TuningGui | null = null
// The "cmonc" cheat shows the tuning panel and the OPEN EDITOR button together.
watch(editorUnlocked, (on) => gui?.toggle(on))

const levelIndex = ref(Math.min(LEVELS.length - 1, Math.max(0, getState<number>('umb_level', 0))))
watch(levelIndex, (i) => setState('umb_level', i))

const canvas = ref<HTMLCanvasElement | null>(null)
const brokenFlash = ref(false)

// ── Level select: every level is open; cleared ones get a tick. ──
const showLevels = ref(false)
const cleared = ref<number[]>(getState<number[]>('umb_cleared', []))
const markCleared = (i: number) => {
  if (cleared.value.includes(i)) return
  cleared.value = [...cleared.value, i]
  setState('umb_cleared', cleared.value)
}
const pickLevel = (i: number) => {
  showLevels.value = false
  loadLevel(i)
}

let world: World = createWorld(levelDef(), { w: tuning.playerWidth, h: tuning.playerHeight })
const held = { left: false, right: false }
let togglePending = false

const loadLevel = (i: number) => {
  if (!testing) levelIndex.value = (i + LEVELS.length) % LEVELS.length
  world = createWorld(levelDef(), { w: tuning.playerWidth, h: tuning.playerHeight })
  gui?.setLevel(world.level)
  brokenFlash.value = false
}
const restart = () => loadLevel(levelIndex.value)

// ── Sound: events → one-shots, with what the engine knows about them ──
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
/** Where the player is, as a stereo position (kept off the hard edges). */
const playerPan = () => {
  const pl = world.player
  return (((pl.x + pl.w / 2) / world.level.world.w) * 2 - 1) * 0.6
}
/** The hazard the player just touched — its kind picks the hit sound. */
const touchedHazard = () => {
  const pl = world.player
  const cx = pl.x + pl.w / 2
  const cy = pl.y + pl.h / 2
  let best = world.hazards[0]
  let bestD = Infinity
  for (const h of world.hazards) {
    const d = Math.hypot(Math.max(h.x - cx, 0, cx - h.x - h.w), Math.max(h.y - cy, 0, cy - h.y - h.h))
    if (d < bestD) {
      bestD = d
      best = h
    }
  }
  return best?.kind
}
let lastToggle = -1
/** Footsteps: one per stride walked, and on each hop of the win dance. */
const STRIDE = 64
let stepDist = 0
let danceHops = 0

const onEvents = (events: GameEvent[], vyBefore: number) => {
  const pan = playerPan()
  const pl = world.player
  for (const e of events) {
    switch (e) {
      case 'open':
      case 'close': {
        const quick = world.time - lastToggle < 0.25
        lastToggle = world.time
        if (e === 'open') {
          const v = (vyBefore - tuning.floatSpeed) / (tuning.terminalVelocity * tuning.breakFraction - tuning.floatSpeed)
          playSfx('open', { intensity: clamp01(v), quick, pan })
        } else playSfx('close', { auto: events.includes('land'), quick, pan })
        break
      }
      case 'land':
        stepDist = 0
        playSfx('land', { intensity: clamp01(vyBefore / (tuning.terminalVelocity * tuning.splatFraction)), pan })
        break
      case 'win':
        danceHops = 0
        playSfx('win', { pan: pan * 0.5 })
        break
      case 'splat': playSfx('splat', { intensity: 1, pan }); break
      case 'hit': playSfx('hit', { hazard: touchedHazard(), pan }); break
      case 'out': playSfx('whistle', { fade: tuning.whistleFade, pan }); break
      case 'break':
        playSfx('break', { pan })
        brokenFlash.value = true
        break
    }
  }
  if (world.phase === 'play' && pl.grounded && Math.abs(pl.vx) > 30) {
    stepDist += Math.abs(pl.vx) * DT
    if (stepDist >= STRIDE) {
      stepDist -= STRIDE
      playSfx('step', { intensity: Math.abs(pl.vx) / tuning.walkSpeed, pan })
    }
  } else if (world.phase === 'win') {
    // The renderer's dance hops on |sin(9t)|: a foot lands every π/9 s.
    const hops = Math.floor((world.phaseTime * 9) / Math.PI)
    if (hops > danceHops) {
      danceHops = hops
      playSfx('step', { intensity: 0.5, pan })
    }
  }
}

// ── Enemy sounds: a lunge's wind-up tell, an enemy flying in ──
/** Seconds of wind-up creak before an attacking pillar's strike lands. */
const LUNGE_TELL = 0.22
let lastEnemyTime = 0
const enemyCues = () => {
  const prev = lastEnemyTime
  const now = world.enemyTime
  lastEnemyTime = now
  if (now <= prev || world.phase !== 'play') return
  const pl = world.player
  const cx = pl.x + pl.w / 2
  const cy = pl.y + pl.h / 2
  for (const h of world.hazards) {
    const m = h.motion
    if (!m) continue
    const hx = h.x + h.w / 2
    const near = clamp01(1 - Math.hypot(hx - cx, h.y + h.h / 2 - cy) / 700)
    const pan = Math.max(-0.8, Math.min(0.8, (hx - cx) / 500))
    if (m.kind === 'lunge') {
      // Fire the tell so the strike (at lungeRest of each cycle) lands on it.
      const cue = (cycleT: number) => Math.floor((cycleT / m.period) - tuning.lungeRest + LUNGE_TELL * tuning.enemySpeedScale / m.period)
      if (cue(now) > cue(prev)) {
        playSfx('lunge', { intensity: near, lead: LUNGE_TELL, pan })
      }
    } else if (m.kind === 'arrive' && prev < m.delay && now >= m.delay) {
      playSfx('arrive', { hazard: h.kind === 'pillar' ? 'pillar' : 'mine', duration: m.duration / Math.max(0.05, tuning.enemySpeedScale), pan })
    }
  }
}

/** How close the nearest mine / pillar is, for their continuous sounds. */
const enemyNearby = (cx: number, cy: number) => {
  let mine = 0
  let mineSpeed = 0
  let pillar = 0
  let enemyPan = 0
  let loudest = 0
  for (const h of world.hazards) {
    if (h.kind === 'spikes') continue
    const hx = h.x + h.w / 2
    const d = Math.max(0, Math.hypot(hx - cx, h.y + h.h / 2 - cy) - Math.max(h.w, h.h) / 2)
    const near = clamp01(1 - d / 320)
    if (h.kind === 'mine' && near > mine) {
      mine = near
      mineSpeed = clamp01(Math.hypot(h.dx, h.dy) / DT / 600)
    }
    if (h.kind === 'pillar') pillar = Math.max(pillar, near)
    if (near > loudest) {
      loudest = near
      enemyPan = Math.max(-1, Math.min(1, (hx - cx) / 400))
    }
  }
  return { mine, mineSpeed, pillar, enemyPan }
}

/** The air around the player, for the wind bed (see soundKit `createAmbience`). */
const ambience = (): AmbienceState => {
  const pl = world.player
  if (world.phase !== 'play' || showLevels.value) return AMBIENCE_IDLE
  const cx = pl.x + pl.w / 2
  const cy = pl.y + pl.h / 2
  let wind = 0
  let superWind = 0
  let pan = 0
  let loudest = 0
  for (const wd of world.level.winds) {
    let s = windInfluence(pl, wd, tuning.windEdge)
    if (!s) {
      // Close by: hear the current before you ride it.
      const dx = Math.max(wd.x - cx, 0, cx - (wd.x + wd.w))
      const dy = Math.max(wd.y - cy, 0, cy - (wd.y + wd.h))
      s = 0.35 * Math.max(0, 1 - Math.hypot(dx, dy) / (wd.super ? 320 : 220))
    }
    const v = wd.super ? s : s * Math.min(1, 0.45 + (wd.speed * tuning.windScale) / 500)
    if (wd.super) superWind = Math.max(superWind, v)
    else wind = Math.max(wind, v)
    if (v > loudest) {
      loudest = v
      pan = Math.max(-1, Math.min(1, (wd.x + wd.w / 2 - cx) / 400))
    }
  }
  const airborne = !pl.grounded
  const breakSpeed = tuning.terminalVelocity * tuning.breakFraction
  return {
    wind,
    superWind,
    pan,
    speed: airborne ? Math.hypot(pl.vx, pl.vy) / tuning.terminalVelocity : 0,
    danger: airborne && !pl.open && !pl.broken ? clamp01((pl.vy / breakSpeed - 0.72) / 0.28) : 0,
    // A broken canopy keeps flapping on the way down.
    canopy: airborne ? (pl.open ? 1 : pl.broken ? 0.6 : 0) : 0,
    ...enemyNearby(cx, cy)
  }
}
let ambienceClock = 0

const tick = () => {
  const input: Input = { left: held.left, right: held.right, toggle: togglePending }
  togglePending = false
  const vyBefore = world.player.vy
  onEvents(step(world, input, DT, tuning), vyBefore)
  enemyCues()
  // GDD prototype: failure resets the level at the spawn point.
  if (world.phase === 'out') restart()
  else if (world.phase === 'splat' && world.phaseTime >= tuning.splatReset) restart()
  else if (world.phase === 'win' && world.phaseTime >= tuning.winHold) {
    if (testing) restart()
    else {
      markCleared(levelIndex.value)
      loadLevel(levelIndex.value + 1)
    }
  }
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
  if (!isGamePaused.value && !showLevels.value) {
    acc += dtReal
    while (acc >= DT) {
      tick()
      acc -= DT
    }
  }
  ambienceClock += dtReal
  if (ambienceClock >= 1 / 30) {
    ambienceClock = 0
    updateAmbience(isGamePaused.value ? AMBIENCE_IDLE : ambience())
  }
  resize(el)
  const ctx = el.getContext('2d')
  if (ctx) render(ctx, world, { finish: t('umbrella.finish') }, tuning, dtReal)
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
// Typed letters (not physical keys): the designer types the word itself.
const GUI_CODE = 'cmonc'
let typed = ''
const onKey = (down: boolean) => (e: KeyboardEvent) => {
  if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
  if (down && e.key.length === 1) {
    typed = (typed + e.key.toLowerCase()).slice(-GUI_CODE.length)
    if (typed === GUI_CODE) { typed = ''; setEditorUnlocked(!editorUnlocked.value) }
  }
  if (down && (e.code === 'KeyL' || (e.code === 'Escape' && showLevels.value))) {
    showLevels.value = !showLevels.value
    held.left = held.right = false
    e.preventDefault()
    return
  }
  if (showLevels.value) return
  if (LEFT.has(e.code)) held.left = down
  else if (RIGHT.has(e.code)) held.right = down
  else if (e.code === 'Space') {
    if (down && !e.repeat) togglePending = true
  } else if (down && e.code === 'KeyR') restart()
  else return
  e.preventDefault()
  if (down) unlockAudio()
}
const onKeyDown = onKey(true)
const onKeyUp = onKey(false)
const onBlur = () => { held.left = held.right = false }

// Every reason the game must be silent: ads, hidden tab, platform pause, and
// the portal / mobile hard mutes. `sync` so the mute lands in the same call
// stack that opens an ad (see useGamePause.ts).
const audioMuted = computed(() => isAudioPaused.value || isPlatformAudioMuted.value || isMobileAudioMuted.value)
watch(audioMuted, (m) => setAudioMuted(m), { immediate: true, flush: 'sync' })
watch(
  () => [tuning.masterVolume, tuning.musicVolume, tuning.sfxVolume, tuning.windVolume],
  ([master, music, sfx, wind]) => setAudioLevels({ master: master!, music: music!, sfx: sfx!, wind: wind! }),
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  gui = createTuningGui({ tuning, levels: LEVELS, onLevelsChange: saveLevels })
  gui.setLevel(world.level)
  gui.toggle(editorUnlocked.value)
  raf = requestAnimationFrame(frame)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  cancelAnimationFrame(raf)
  gui?.destroy()
})

</script>

<template>
  <div class="umbrella-scene" @pointerdown="unlockAudio">
    <canvas ref="canvas" class="umbrella-canvas" />

    <!-- Designer tools behind the "cmonc" cheat: English only, like the lil-gui panel. -->
    <div v-if="testing" class="hud">
      <button class="hud-btn wide" @click="backToEditor">◀ Editor</button>
      <span class="hud-level">TEST LEVEL</span>
      <button class="hud-btn" :aria-label="t('umbrella.restart')" @click="restart">↻</button>
    </div>
    <div v-else class="hud">
      <button class="hud-btn" :aria-label="t('umbrella.prevLevel')" @click="loadLevel(levelIndex - 1)">‹</button>
      <span class="hud-level">{{ t('umbrella.level', { n: levelIndex + 1 }) }}</span>
      <button class="hud-btn" :aria-label="t('umbrella.nextLevel')" @click="loadLevel(levelIndex + 1)">›</button>
      <button class="hud-btn" :aria-label="t('umbrella.restart')" @click="restart">↻</button>
      <button class="hud-btn" :aria-label="t('umbrella.selectLevel')" @click="showLevels = true">☰</button>
    </div>

    <button v-if="editorUnlocked && !testing" class="open-editor" @click="openEditor">OPEN EDITOR</button>
    <div class="hint">{{ t('umbrella.controls') }}</div>
    <div v-if="brokenFlash" class="toast">{{ t('umbrella.broken') }}</div>

    <div v-if="showLevels" class="levels-backdrop" @click.self="showLevels = false">
      <div class="levels" role="dialog" :aria-label="t('umbrella.selectLevel')">
        <div class="levels-head">
          <b>{{ t('umbrella.selectLevel') }}</b>
          <button class="hud-btn" :aria-label="t('umbrella.close')" @click="showLevels = false">✕</button>
        </div>
        <div class="levels-grid">
          <button
            v-for="(lv, i) in LEVELS"
            :key="lv.id"
            class="level-tile"
            :class="{ current: i === levelIndex, cleared: cleared.includes(i) }"
            :aria-label="t('umbrella.level', { n: i + 1 })"
            @click="pickLevel(i)"
          >
            <span class="level-num">{{ i + 1 }}</span>
            <span v-if="cleared.includes(i)" class="level-tick">✓</span>
          </button>
        </div>
      </div>
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
.open-editor {
  position: absolute;
  left: 16px;
  bottom: 16px;
  padding: 14px 26px;
  border: 2px solid #fff;
  border-radius: 10px;
  background: #eab308;
  color: #000;
  font: 800 20px system-ui, sans-serif;
  letter-spacing: 0.04em;
  cursor: pointer;
  z-index: 2;
}
.open-editor:hover { filter: brightness(1.1); }
.hud-btn.wide { width: auto; padding: 0 12px; }
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
.levels-backdrop {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.55);
  padding: 16px;
}
.levels {
  width: min(560px, 100%);
  max-height: 100%;
  overflow: auto;
  background: #1a1f2e;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 16px;
}
.levels-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 20px;
}
.levels-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 10px;
}
.level-tile {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 22px;
  font-weight: 700;
}
.level-tile:hover { background: rgba(255, 255, 255, 0.22); }
.level-tile.current { outline: 2px solid #6fa8ff; }
.level-tick {
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 14px;
  color: #7ee08a;
}
</style>
