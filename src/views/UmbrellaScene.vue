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
import { customLevels, customPlay, editorUnlocked, keepSharedLevel, setEditorUnlocked, testLevel, type CustomPlay } from '@/umbrella/customLevels'
import { createWorld, liveWinds, step, windInfluence, type GameEvent, type Input, type World } from '@/umbrella/engine'
import { clearLevelParam, decodeLevel, levelParam } from '@/umbrella/levelCode'
import { communityEnabled, countPlay } from '@/umbrella/community'
import { editorAllowed } from '@/umbrella/editorAccess'
import CommunityLevelsModal from '@/components/umbrella/CommunityLevelsModal.vue'
import RateLevelCard from '@/components/umbrella/RateLevelCard.vue'
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
/** A player level (share link or community) played instead of the campaign. */
const playing = ref<CustomPlay | null>(testing ? null : customPlay.value)
const levelDef = () => testing ?? playing.value?.level ?? LEVELS[levelIndex.value]!
const backToEditor = () => {
  testLevel.value = null
  void router.push('/editor')
}
const openEditor = () => void router.push('/editor')

// ── Player levels: share links, the community list, stars ──
const showCommunity = ref(false)
/** Stars are asked for once the player has finished or failed the level. */
const canRate = ref(false)
const showRate = ref(false)
const rated = ref(false)
const notice = ref('')
const flashNotice = (msg: string) => {
  notice.value = msg
  window.setTimeout(() => { if (notice.value === msg) notice.value = '' }, 3500)
}
const playCustom = (p: CustomPlay) => {
  playing.value = p
  customPlay.value = p
  canRate.value = showRate.value = rated.value = false
  showCommunity.value = false
  if (p.communityId) void countPlay(p.communityId)
  loadLevel(levelIndex.value)
}
const leaveCustom = () => {
  const fromCommunity = !!playing.value?.communityId
  playing.value = null
  customPlay.value = null
  showRate.value = false
  loadLevel(levelIndex.value)
  if (fromCommunity) showCommunity.value = true
}
/** `?level=<code>`: open the shared level and keep it in the player's library. */
const openSharedLink = async () => {
  const code = levelParam()
  if (!code) return
  clearLevelParam()
  const shared = await decodeLevel(code)
  if (!shared) { flashNotice(t('umbrella.sharedBroken')); return }
  const name = keepSharedLevel(shared.name, shared.level)
  playCustom({ level: shared.level, name })
  flashNotice(t('umbrella.sharedSaved', { name }))
}

const DT = 1 / 120

const tuning = reactive<Tuning>({ ...DEFAULT_TUNING, ...getState<Partial<Tuning>>('umb_tuning_r3', {}) })
watch(tuning, () => setState('umb_tuning_r3', { ...tuning }), { deep: true })
// Level edits from the panel (wind speeds, platform periods) persist alongside.
applyTuning({ levels: getState<TuningExport['levels']>('umb_levels_r3', []) }, tuning, LEVELS)
const saveLevels = () => setState('umb_levels_r3', exportTuning(tuning, LEVELS).levels)
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
/** The player's saved levels (share links, the editor), shown under the campaign. */
const myLevelNames = computed(() => Object.keys(customLevels.value).sort((a, b) => a.localeCompare(b)))
const playMine = (name: string) => {
  const level = customLevels.value[name]
  if (!level) return
  showLevels.value = false
  playCustom({ level, name })
}
const pickLevel = (i: number) => {
  showLevels.value = false
  if (playing.value) { playing.value = null; customPlay.value = null }
  loadLevel(i)
}

let world: World = createWorld(levelDef(), { w: tuning.playerWidth, h: tuning.playerHeight })
const held = { left: false, right: false }
let togglePending = false

const loadLevel = (i: number) => {
  if (!testing && !playing.value) levelIndex.value = (i + LEVELS.length) % LEVELS.length
  world = createWorld(levelDef(), { w: tuning.playerWidth, h: tuning.playerHeight })
  gui?.setLevel(world.level)
  brokenFlash.value = false
  hideRevive()
}
const restart = () => loadLevel(levelIndex.value)

// ── Checkpoints: a death after touching one revives there. For a perfect run the
//    player can refuse: a Restart button stays up for the first seconds. ──
const REVIVE_CHOICE_MS = 3000
const showRevive = ref(false)
let reviveTimer = 0
const hideRevive = () => {
  showRevive.value = false
  window.clearTimeout(reviveTimer)
}
const fail = () => {
  if (playing.value) canRate.value = true
  const cp = world.checkpoint
  if (cp < 0) { restart(); return }
  world = createWorld(levelDef(), { w: tuning.playerWidth, h: tuning.playerHeight }, cp)
  brokenFlash.value = false
  hideRevive()
  showRevive.value = true
  reviveTimer = window.setTimeout(() => { showRevive.value = false }, REVIVE_CHOICE_MS)
}

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
      case 'button': playSfx('close', { quick: true, pan }); break
      case 'checkpoint': playSfx('open', { intensity: 0, quick: true, pan }); break
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
  for (const wd of liveWinds(world)) {
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
  const input: Input = { left: held.left || stickDir.value < 0, right: held.right || stickDir.value > 0, toggle: togglePending }
  togglePending = false
  const vyBefore = world.player.vy
  onEvents(step(world, input, DT, tuning), vyBefore)
  enemyCues()
  // Failure resets the level at the spawn point, or revives at the last checkpoint.
  if (world.phase === 'out') fail()
  else if (world.phase === 'splat' && world.phaseTime >= tuning.splatReset) fail()
  else if (world.phase === 'win' && world.phaseTime >= tuning.winHold) {
    if (testing) restart()
    else if (playing.value) {
      // A player level loops; a community one asks for stars after the first win.
      canRate.value = true
      if (playing.value.communityId && !rated.value) showRate.value = true
      restart()
    } else {
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
  if (!isGamePaused.value && !showLevels.value && !showCommunity.value && !showRate.value) {
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
  if (showLevels.value || showCommunity.value || showRate.value) return
  if (LEFT.has(e.code)) held.left = down
  else if (RIGHT.has(e.code)) held.right = down
  else if (e.code === 'Space') {
    if (down && !e.repeat) togglePending = true
  } else if (down && e.code === 'KeyR') restart()
  else return
  e.preventDefault()
  if (down) unlockAudio()
}
// ── Touch: a left/right joystick bottom-left, the umbrella button bottom-right ──
/** Shown on touch screens, and from the first touch on any device. */
const touchUI = ref(window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)
const onAnyPointer = (e: PointerEvent) => {
  if (e.pointerType === 'touch') touchUI.value = true
  unlockAudio()
}
const STICK_RANGE = 44
const STICK_DEAD = 12
const stickDir = ref(0)
const knobX = ref(0)
let stickId = -1
let stickOrigin = 0
const onStickDown = (e: PointerEvent) => {
  stickId = e.pointerId
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  stickOrigin = r.left + r.width / 2
  onStickMove(e)
}
const onStickMove = (e: PointerEvent) => {
  if (e.pointerId !== stickId) return
  const dx = Math.max(-STICK_RANGE, Math.min(STICK_RANGE, e.clientX - stickOrigin))
  knobX.value = dx
  stickDir.value = Math.abs(dx) < STICK_DEAD ? 0 : Math.sign(dx)
}
const onStickUp = (e: PointerEvent) => {
  if (e.pointerId !== stickId) return
  stickId = -1
  knobX.value = 0
  stickDir.value = 0
}
const umbrellaPressed = ref(false)
const onUmbrellaDown = (e: PointerEvent) => {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  togglePending = true
  umbrellaPressed.value = true
}
const onUmbrellaUp = () => { umbrellaPressed.value = false }

const onKeyDown = onKey(true)
const onKeyUp = onKey(false)
const onBlur = () => {
  held.left = held.right = false
  stickId = -1
  knobX.value = 0
  stickDir.value = 0
}

// Every reason the game must be silent: ads, hidden tab, platform pause, and
// the portal / mobile hard mutes. `sync` so the mute lands in the same call
// stack that opens an ad (see useGamePause.ts).
// The player's own mute button, remembered across visits.
const userMuted = ref(getState<boolean>('umb_muted', false))
const toggleMute = () => {
  userMuted.value = !userMuted.value
  setState('umb_muted', userMuted.value)
}
const audioMuted = computed(() => userMuted.value || isAudioPaused.value || isPlatformAudioMuted.value || isMobileAudioMuted.value)
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
  if (!testing) void openSharedLink()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  cancelAnimationFrame(raf)
  window.clearTimeout(reviveTimer)
  gui?.destroy()
})

</script>

<template>
  <div class="umbrella-scene" @pointerdown="onAnyPointer">
    <canvas ref="canvas" class="umbrella-canvas" />

    <!-- Designer tools behind the "cmonc" cheat: English only, like the lil-gui panel. -->
    <div v-if="testing" class="hud">
      <button class="hud-btn wide" @click="backToEditor">◀ Editor</button>
      <span class="hud-level">TEST LEVEL</span>
      <button class="hud-btn" :aria-label="t('umbrella.restart')" @click="restart">↻</button>
    </div>
    <div v-else-if="playing" class="hud">
      <button class="hud-btn" :aria-label="t('umbrella.back')" @click="leaveCustom">‹</button>
      <span class="hud-level custom" :title="playing.name">{{ playing.name }}</span>
      <button class="hud-btn" :aria-label="t('umbrella.restart')" @click="restart">↻</button>
      <button class="hud-btn" :aria-label="t('umbrella.selectLevel')" @click="showLevels = true">☰</button>
      <button v-if="playing.communityId && canRate" class="hud-btn" :aria-label="t('umbrella.rateLevel')" @click="showRate = true">★</button>
      <button class="hud-btn" :aria-label="t(userMuted ? 'umbrella.unmute' : 'umbrella.mute')" :aria-pressed="userMuted" @click="toggleMute">{{ userMuted ? '🔇' : '🔊' }}</button>
    </div>
    <div v-else class="hud">
      <button class="hud-btn" :aria-label="t('umbrella.prevLevel')" @click="loadLevel(levelIndex - 1)">‹</button>
      <span class="hud-level">{{ t('umbrella.level', { n: levelIndex + 1 }) }}</span>
      <button class="hud-btn" :aria-label="t('umbrella.nextLevel')" @click="loadLevel(levelIndex + 1)">›</button>
      <button class="hud-btn" :aria-label="t('umbrella.restart')" @click="restart">↻</button>
      <button class="hud-btn" :aria-label="t('umbrella.selectLevel')" @click="showLevels = true">☰</button>
      <button v-if="communityEnabled" class="hud-btn wide" :aria-label="t('umbrella.community.open')" @click="showCommunity = true">🌐 {{ t('umbrella.community.button') }}</button>
      <button class="hud-btn" :aria-label="t(userMuted ? 'umbrella.unmute' : 'umbrella.mute')" :aria-pressed="userMuted" @click="toggleMute">{{ userMuted ? '🔇' : '🔊' }}</button>
    </div>

    <button v-if="showRevive" class="revive-restart" @click="restart">↻ {{ t('umbrella.reviveRestart') }}</button>
    <div v-if="notice" class="toast info" role="status">{{ notice }}</div>

    <CommunityLevelsModal v-if="showCommunity" @close="showCommunity = false" @play="playCustom" />
    <RateLevelCard
      v-if="showRate && playing?.communityId"
      :level-id="playing.communityId"
      :name="playing.name"
      @done="showRate = false; rated = true"
      @close="showRate = false"
    />

    <button v-if="editorUnlocked && !testing && editorAllowed" class="open-editor" :class="{ 'above-stick': touchUI }" @click="openEditor">OPEN EDITOR</button>
    <div v-if="!touchUI" class="hint">{{ t('umbrella.controls') }}</div>
    <template v-else>
      <div
        class="stick"
        role="slider"
        :aria-label="t('umbrella.joystick')"
        aria-valuemin="-1"
        aria-valuemax="1"
        :aria-valuenow="stickDir"
        @pointerdown.stop="onStickDown"
        @pointermove="onStickMove"
        @pointerup="onStickUp"
        @pointercancel="onStickUp"
      >
        <span class="stick-arrow left">‹</span>
        <span class="stick-arrow right">›</span>
        <span class="stick-knob" :style="{ transform: `translateX(${knobX}px)` }" />
      </div>
      <button
        class="umbrella-btn"
        :class="{ pressed: umbrellaPressed }"
        :aria-label="t('umbrella.umbrellaButton')"
        @pointerdown.stop="onUmbrellaDown"
        @pointerup="onUmbrellaUp"
        @pointercancel="onUmbrellaUp"
        @contextmenu.prevent
      >☂</button>
    </template>
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
        <!-- The player's own levels: opened from share links, built in the editor. -->
        <div class="levels-head mine">
          <b>{{ t('umbrella.myLevels') }}</b>
        </div>
        <div v-if="myLevelNames.length" class="my-levels">
          <button
            v-for="n in myLevelNames"
            :key="n"
            class="my-level"
            :class="{ current: playing?.name === n && !playing?.communityId }"
            @click="playMine(n)"
          >▶ {{ n }}</button>
        </div>
        <p v-else class="my-empty">{{ t('umbrella.myLevelsEmpty') }}</p>
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
.open-editor.above-stick { bottom: 170px; }
.stick,
.umbrella-btn {
  position: absolute;
  bottom: calc(24px + env(safe-area-inset-bottom));
  z-index: 2;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.stick {
  left: calc(24px + env(safe-area-inset-left));
  width: 150px;
  height: 72px;
  border-radius: 36px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.08);
}
.stick-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 30px;
  opacity: 0.45;
  pointer-events: none;
}
.stick-arrow.left { left: 12px; }
.stick-arrow.right { right: 12px; }
.stick-knob {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 56px;
  height: 56px;
  margin: -28px 0 0 -28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  pointer-events: none;
}
.umbrella-btn {
  right: calc(24px + env(safe-area-inset-right));
  width: 92px;
  height: 92px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 44px;
  line-height: 1;
  cursor: pointer;
}
.umbrella-btn.pressed { background: rgba(255, 255, 255, 0.4); transform: scale(0.94); }
.hud-btn.wide { width: auto; padding: 0 12px; font-size: 16px; font-weight: 700; }
.hud-level.custom {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 18px;
}
.revive-restart {
  position: absolute;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  padding: 10px 20px;
  border-radius: 10px;
  border: 2px solid #fff;
  background: #eab308;
  color: #000;
  font: 800 18px system-ui, sans-serif;
  cursor: pointer;
}
.toast.info { background: #2563eb; top: 112px; }
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
.levels-head.mine { margin-top: 18px; font-size: 18px; }
.my-levels { display: flex; flex-direction: column; gap: 6px; }
.my-level {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(79, 70, 229, 0.3);
  font-size: 16px;
  font-weight: 700;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.my-level:hover { background: rgba(79, 70, 229, 0.5); }
.my-level.current { outline: 2px solid #6fa8ff; }
.my-empty { margin: 0; font-size: 14px; opacity: 0.7; }
.level-tick {
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 14px;
  color: #7ee08a;
}
</style>
