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
import { LEVELS, type GateDef, type LevelDef } from '@/umbrella/levels'
import {
  campaignOrder, chapterRanges, customLevels, customPlay, editorUnlocked, isJamBuild, JAM_CHAPTER, jamPlay, keepSharedLevel,
  setEditorUnlocked, setJamTest, startLevelIndex, testLevel, type CustomPlay
} from '@/umbrella/customLevels'
import { createWorld, gateExit, liveWinds, step, windInfluence, type GameEvent, type Input, type World } from '@/umbrella/engine'
import { clearLevelParam, decodeLevel, levelParam } from '@/umbrella/levelCode'
import { communityEnabled, countPlay } from '@/umbrella/community'
import { editorAllowed } from '@/umbrella/editorAccess'
import CommunityLevelsModal from '@/components/umbrella/CommunityLevelsModal.vue'
import RateLevelCard from '@/components/umbrella/RateLevelCard.vue'
import PauseMenu from '@/components/umbrella/PauseMenu.vue'
import { createIntro, type Intro } from '@/umbrella/intro'
import { splashGone } from '@/use/useSplash'
import { render } from '@/umbrella/renderer'
import { ARRIVE_TIME, drawWarp, startWarp, warpPosition, warpTime, type Warp } from '@/umbrella/warp'
import { DEFAULT_TUNING, type Tuning } from '@/umbrella/tuning'
import { applyTuning, createTuningGui, exportTuning, type TuningExport, type TuningGui } from '@/umbrella/tuningGui'
import { createEnemyCues, ENEMY_BED_IDLE } from '@/umbrella/enemySounds'
import { playEnemySfx, playSfx, setAudioLevels, setAudioMuted, unlockAudio, updateAmbience, updateEnemyBed } from '@/umbrella/audio'
import { AMBIENCE_IDLE, type AmbienceState } from '@/umbrella/soundKit'
import { getState, setState } from '@/use/useEpicState'
import { isGamePaused, isAudioPaused } from '@/use/useGamePause'
import { acquireModalOpen } from '@/use/useModalState'
import { setRunBreak } from '@/use/usePortalGameplay'
import { notePlayTime, onDeath, requestTestInterstitial, tapLevelLabel } from '@/umbrella/ads'
import { isPlatformAudioMuted } from '@/use/useGamePauseAudio'
import { isMobileAudioMuted } from '@/use/useMobileAudioMute'

const { t } = useI18n()
const router = useRouter()

/** A level handed over by the editor's "Test" button: it loops until you go back. */
const testing = testLevel.value
/** The first load waits for a click on Play: it hands the page the user's interaction focus, so the
 *  browser lets the intro's sound and the music start. Coming back from the editor needs none. */
let startedOnce = false
const playBtn = ref<HTMLElement | null>(null)
const started = ref(!!testing || startedOnce)
/** A player level (share link or community) played instead of the campaign. */
const playing = ref<CustomPlay | null>(testing ? null : customPlay.value)
/** The level under test; ‹ › and a horizontal swipe walk it through the draft, the campaign and the library. */
let testDef = testing
const testPos = ref(-1) // -1 = the editor's draft
const testName = ref('')
const testList = () => [...LEVELS.map((l, i) => ({ name: t('umbrella.level', { n: i + 1 }), level: l })), ...Object.entries(customLevels.value).sort(([a], [b]) => a.localeCompare(b)).map(([name, level]) => ({ name, level }))]
const stepTest = (d: number) => {
  const list = testList()
  const n = list.length
  testPos.value = testPos.value < 0 ? (d > 0 ? 0 : n - 1) : (testPos.value + d + n) % n
  const e = list[testPos.value]!
  testReturn = null
  testDef = e.level
  testName.value = e.name
  restart()
}
/** Testing a level with a gate: the challenge it leads to is tested too, and winning it returns here. */
let testReturn: { def: LevelDef; gate: GateDef } | null = null
let swipeX = 0
const onSwipeDown = (e: PointerEvent) => { swipeX = e.clientX }
const onSwipeUp = (e: PointerEvent) => {
  if (!testing || !swipeX) return
  const dx = e.clientX - swipeX
  swipeX = 0
  if (Math.abs(dx) > 90) stepTest(dx < 0 ? 1 : -1)
}
const levelDef = () => testDef ?? playing.value?.level ?? LEVELS[shownIndex()]!
const backToEditor = () => {
  testLevel.value = null
  void router.push('/editor')
}
const openEditor = () => void router.push('/editor')

// ── Player levels: share links, the community list, stars ──
const showCommunity = ref(false)
/** The pause menu (Resume, Restart, Settings → General → language). */
const showPause = ref(false)
const openPause = () => {
  showPause.value = true
  held.left = held.right = false
}
// ── The intro cutscene (intro.md): once for a new player before Level 1, again from
//    the pause menu. Any key or tap shows Skip; a second one (or Esc) skips. ──
const INTRO_SEEN = 'umb_intro_seen'
let intro: Intro | null = null
let introWait = 0
const introOn = ref(false)
const skipShown = ref(false)
let skipTimer = 0
const startIntro = () => {
  showPause.value = showLevels.value = showCommunity.value = false
  if (playing.value) { playing.value = null; customPlay.value = null }
  // The intro plays on, and hands over to, the first level of the start chapter.
  levelIndex.value = startIndex
  challenge.value = null
  warp = null
  held.left = held.right = false
  intro = createIntro(LEVELS[startIndex]!, tuning, (name) => {
    if (name === 'land') playSfx('land', { intensity: 0.25 })
    else if (name === 'open') playSfx('open', { intensity: 0.2 })
    else if (name === 'step') playSfx('step', { intensity: 0.6 })
    else if (name === 'whoosh') playSfx('arrive', { hazard: 'mine', duration: 0.6 })
    else if (name === 'cool') playSfx('win', { pan: 0 })
    else playSfx(name as 'land')
  })
  introOn.value = true
  skipShown.value = false
  introWait = 0
}
const endIntro = () => {
  intro = null
  introOn.value = false
  skipShown.value = false
  window.clearTimeout(skipTimer)
  setState(INTRO_SEEN, true)
  // The start level begins from the pose the intro ended on: Pweeg at the spawn.
  loadLevel(startIndex)
  showChapterCard(startIndex, true)
}
const requestSkip = () => {
  // Pweeg is looking at the player: the first key, tap or stick move is taking control.
  if (intro?.waiting) { intro.release(); return }
  if (skipShown.value) { endIntro(); return }
  skipShown.value = true
  window.clearTimeout(skipTimer)
  skipTimer = window.setTimeout(() => { skipShown.value = false }, 1500)
}
const watchIntro = () => {
  showPause.value = false
  startIntro()
}
const restartFromPause = () => {
  showPause.value = false
  restart()
}
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

// The jam chapter (itch.io build, or the designer's jam playtest) is its own run of levels: its place
// and its cleared levels are kept apart from the campaign's, which index a different list.
const progressKey = (key: string) => (jamPlay.value ? `${key}_jam` : key)
/** Where a new player begins: the first level of the start chapter. */
const startIndex = startLevelIndex()
const levelIndex = ref(Math.min(LEVELS.length - 1, Math.max(0, getState<number>(progressKey('umb_level'), startIndex))))
watch(levelIndex, (i) => setState(progressKey('umb_level'), i))

// ── Gates and challenge levels ──
// A level that some gate leads to is a challenge: the campaign walks past it, the level
// selector hides it until a gate has taken the player there, and winning it brings the
// player back out of the gate they came through.
interface Challenge { idx: number; ret: { gate: GateDef; levelIdx: number } | null }
const challenge = ref<Challenge | null>(null)
const unlocked = ref<number[]>(getState<number[]>('umb_unlocked', []))
const challengeIds = computed(() => new Set(LEVELS.flatMap((l) => (l.gates ?? []).map((g) => g.to))))
const isChallenge = (i: number) => challengeIds.value.has(LEVELS[i]?.id ?? -1)
const isLocked = (i: number) => isChallenge(i) && !unlocked.value.includes(LEVELS[i]!.id)
const shownIndex = () => challenge.value?.idx ?? levelIndex.value
/** The next campaign level in a direction, walking past challenge levels. */
const walkIndex = (from: number, d: 1 | -1) => {
  const n = LEVELS.length
  for (let k = 1; k <= n; k++) {
    const i = (((from + d * k) % n) + n) % n
    if (!isChallenge(i)) return i
  }
  return from
}
const unlockChallenge = (id: number) => {
  if (unlocked.value.includes(id)) return
  unlocked.value = [...unlocked.value, id]
  setState('umb_unlocked', unlocked.value)
}

// ── Stars: the best count per level is kept; the HUD shows this run's ──
const starBest = ref<Record<number, number>>(getState<Record<number, number>>('umb_stars', {}))
const hudStars = ref<{ got: number; total: number; shape: string }>({ got: 0, total: 0, shape: 'umbrella' })
/** Bumped on each pickup so the badge pops. */
const badgePop = ref(0)
const syncStars = () => {
  const total = world.level.stars?.length ?? 0
  const got = world.starsGot.filter(Boolean).length
  const shape = world.level.stars?.[0]?.shape ?? 'umbrella'
  if (hudStars.value.got !== got || hudStars.value.total !== total || hudStars.value.shape !== shape) {
    if (got > hudStars.value.got && total === hudStars.value.total) badgePop.value++
    hudStars.value = { got, total, shape }
  }
}
const recordStars = () => {
  const got = world.starsGot.filter(Boolean).length
  const id = LEVELS[shownIndex()]?.id
  if (testing || playing.value || id === undefined || got <= (starBest.value[id] ?? 0)) return
  starBest.value = { ...starBest.value, [id]: got }
  setState('umb_stars', starBest.value)
}

// ── The hyper current: opening the umbrella at a gate carries Pweeg through it ──
let warp: Warp | null = null
let warpDone: (() => void) | null = null
let arrive = 0
const beginWarp = (kind: 'in' | 'out', mouth: GateDef, done: () => void) => {
  const pl = world.player
  warp = startWarp(kind, mouth, { x: pl.x + pl.w / 2, y: pl.y + pl.h })
  warpDone = done
  pl.open = true
  pl.vx = pl.vy = 0
  held.left = held.right = false
  togglePending = false
  playSfx('arrive', { hazard: 'mine', duration: kind === 'in' ? 1.4 : 0.9 })
}
const enterGate = (gate: GateDef) => {
  const to = LEVELS.findIndex((l) => l.id === gate.to)
  if (to < 0) return
  beginWarp('in', gate, () => {
    if (testing && testDef) {
      // The designer's test: the challenge opens as the level under test, progress untouched.
      testReturn = { def: testDef, gate }
      testDef = LEVELS[to]!
    } else {
      unlockChallenge(gate.to)
      challenge.value = { idx: to, ret: { gate, levelIdx: levelIndex.value } }
    }
    reload()
    arrive = ARRIVE_TIME
  })
}
/** Winning a tested challenge: out through the current, back to the level under test. */
const leaveTestChallenge = () => {
  const back = testReturn
  if (!back) return
  const pl = world.player
  const mouth: GateDef = { x: pl.x + pl.w / 2 - 30, y: pl.y + pl.h - 22, w: 60, h: 22, to: back.gate.to }
  beginWarp('out', mouth, () => {
    testReturn = null
    testDef = back.def
    reload({ at: gateExit(back.gate) })
    arrive = ARRIVE_TIME
  })
}
/** Winning a challenge: out through the same current, back to where the gate stands. */
const leaveChallenge = () => {
  const c = challenge.value
  if (!c) return
  markCleared(c.idx)
  recordStars()
  const pl = world.player
  const mouth: GateDef = { x: pl.x + pl.w / 2 - 30, y: pl.y + pl.h - 22, w: 60, h: 22, to: LEVELS[c.idx]!.id }
  beginWarp('out', mouth, () => {
    challenge.value = null
    if (c.ret) {
      levelIndex.value = c.ret.levelIdx
      reload({ at: gateExit(c.ret.gate) })
    } else loadLevel(walkIndex(levelIndex.value, 1))
    arrive = ARRIVE_TIME
  })
}

const canvas = ref<HTMLCanvasElement | null>(null)
const brokenFlash = ref(false)

// ── Level select: every level is open; cleared ones get a tick. ──
const showLevels = ref(false)
const cleared = ref<number[]>(getState<number[]>(progressKey('umb_cleared'), []))
const markCleared = (i: number) => {
  if (cleared.value.includes(i)) return
  cleared.value = [...cleared.value, i]
  setState(progressKey('umb_cleared'), cleared.value)
}
/** The level selector's sections: the chapters (or the jam chapter alone), each with its level indices. */
const chapterSections = computed(() => {
  void campaignOrder.value // LEVELS and the chapters are rebuilt together when the order changes
  return chapterRanges().map((c) => ({
    ...c,
    title: c.name || (c.id === JAM_CHAPTER ? t('umbrella.jamChapter') : t('umbrella.chapter', { n: c.n })),
    levels: Array.from({ length: c.to - c.from }, (_, k) => c.from + k).filter((i) => !isLocked(i))
  })).filter((c) => c.levels.length)
})
/** The designer's jam playtest (not the itch.io build, where the jam chapter IS the game). */
const jamTest = computed(() => jamPlay.value && !isJamBuild)
const endJamTest = () => {
  setJamTest(false)
  void router.push('/editor')
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
  if (isLocked(i)) return
  if (playing.value) { playing.value = null; customPlay.value = null }
  loadLevel(i)
  // An unlocked challenge opens as a challenge: winning it moves on in the campaign.
  if (isChallenge(i) && !testing) {
    challenge.value = { idx: i, ret: null }
    reload()
  }
  else showChapterCard(i)
}

// ── The chapter card: "Chapter N" (and the designer's subtitle) with the chapter sound, for 3 s
//    on the first level of a chapter. The level waits under it. The start chapter's card plays only
//    right after the intro; any other chapter's when the player arrives at its first level — by
//    finishing the chapter before it, or from the level selector. The jam chapter is Chapter 1. ──
const CHAPTER_CARD_MS = 3000
const chapterCard = ref<{ title: string; subtitle: string; key: number } | null>(null)
let chapterCardTimer = 0
const showChapterCard = (i: number, afterIntro = false) => {
  if (testing || playing.value || challenge.value) return
  if (i === startIndex && !afterIntro) return
  const c = chapterRanges().find((r) => r.from === i && r.to > r.from)
  if (!c) return
  chapterCard.value = { title: t('umbrella.chapter', { n: c.n }), subtitle: c.subtitle ?? '', key: Date.now() }
  playSfx('chapter')
  window.clearTimeout(chapterCardTimer)
  chapterCardTimer = window.setTimeout(() => { chapterCard.value = null }, CHAPTER_CARD_MS)
}

let world: World = createWorld(levelDef(), { w: tuning.playerWidth, h: tuning.playerHeight })
const held = { left: false, right: false }
let togglePending = false

const reload = (opts: { at?: { x: number; y: number } } = {}) => {
  world = createWorld(levelDef(), { w: tuning.playerWidth, h: tuning.playerHeight }, -1, opts)
  gui?.setLevel(world.level)
  brokenFlash.value = false
  hideRevive()
  syncStars()
}
/** Opens a campaign level by position (this leaves any challenge). */
const loadLevel = (i: number) => {
  if (!testing && !playing.value) { levelIndex.value = (i + LEVELS.length) % LEVELS.length; challenge.value = null }
  reload()
}
const stepLevel = (d: 1 | -1) => loadLevel(walkIndex(levelIndex.value, d))
const restart = () => reload()

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
  world = createWorld(levelDef(), { w: tuning.playerWidth, h: tuning.playerHeight }, cp, { starsGot: world.starsGot })
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
      case 'hit': playSfx('hit', { hazard: (touchedHazard() === 'fan' ? 'mine' : touchedHazard()) as 'pillar' | 'mine' | 'spikes' | undefined, pan }); break
      case 'out': playSfx('whistle', { fade: tuning.whistleFade, pan }); break
      case 'break':
        playSfx('break', { pan })
        brokenFlash.value = true
        break
      case 'button': playSfx('step', { intensity: 1, pan }); break
      case 'checkpoint': playSfx('open', { intensity: 0.5, pan }); break
      case 'star': playSfx('open', { intensity: 0.9, quick: true, pan }); playSfx('step', { intensity: 0.3, pan }); break
      case 'gate':
        // Only the campaign (and the editor's test of it) has somewhere to go; a player level lets the gate be.
        if (!playing.value && !challenge.value?.ret && !testReturn) enterGate(world.level.gates![world.gate]!)
        break
      // 'bump' / 'charge-bump' and the mine's sting: the enemy cues below.
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

// ── Enemy sounds (enemySounds.ts): telegraphs, bumps, stings and the enemy bed ──
const enemyCueTracker = createEnemyCues()
let lastEnemyTime = 0
const enemyCues = (events: GameEvent[]) => {
  for (const c of enemyCueTracker.tick(world, events, tuning)) playEnemySfx(c.name, c.params)
  // An enemy flying in (the kit's arrive sound).
  const prev = lastEnemyTime
  const now = world.enemyTime
  lastEnemyTime = now
  if (now <= prev || world.phase !== 'play') return
  const cx = world.player.x + world.player.w / 2
  for (const h of world.hazards) {
    const m = h.motion
    if (m?.kind !== 'arrive' || prev >= m.delay || now < m.delay) continue
    const pan = Math.max(-0.8, Math.min(0.8, (h.x + h.w / 2 - cx) / 500))
    playSfx('arrive', { hazard: h.kind === 'pillar' ? 'pillar' : 'mine', duration: m.duration / Math.max(0.05, tuning.enemySpeedScale), pan })
  }
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
    ...AMBIENCE_IDLE,
    wind,
    superWind,
    pan,
    speed: airborne ? Math.hypot(pl.vx, pl.vy) / tuning.terminalVelocity : 0,
    danger: airborne && !pl.open && !pl.broken ? clamp01((pl.vy / breakSpeed - 0.72) / 0.28) : 0,
    // A broken canopy keeps flapping on the way down.
    canopy: airborne ? (pl.open ? 1 : pl.broken ? 0.6 : 0) : 0
  }
}
let ambienceClock = 0

/** A death interstitial is up: the world stays frozen on the death until it closes. */
let deathAdHold = false
/** Dying: the interstitial first when one is due (umbrella/ads.ts), then the respawn. */
const die = () => {
  if (testing) { fail(); return }
  deathAdHold = onDeath(() => {
    deathAdHold = false
    fail()
  })
}

const tick = () => {
  if (deathAdHold) return
  if (warp) {
    // The current carries him: no physics, just the ride up the column.
    warp.t += DT
    const p = warpPosition(warp)
    world.player.x = p.x - world.player.w / 2
    world.player.y = p.y - world.player.h
    if (warp.t >= warpTime(warp.kind)) {
      const done = warpDone
      warp = null
      warpDone = null
      done?.()
    }
    return
  }
  const input: Input = { left: held.left || stickDir.value < 0, right: held.right || stickDir.value > 0, toggle: togglePending }
  togglePending = false
  const vyBefore = world.player.vy
  if (world.phase === 'play') notePlayTime(DT)
  const events = step(world, input, DT, tuning)
  onEvents(events, vyBefore)
  if (events.includes('star')) syncStars()
  enemyCues(events)
  // Failure resets the level at the spawn point, or revives at the last checkpoint.
  if (world.phase === 'out') die()
  else if (world.phase === 'splat' && world.phaseTime >= tuning.splatReset) die()
  else if (world.phase === 'win' && world.phaseTime >= tuning.winHold) {
    if (testing) { if (testReturn) leaveTestChallenge(); else restart() }
    else if (challenge.value) leaveChallenge()
    else if (playing.value) {
      // A player level loops; a community one asks for stars after the first win.
      canRate.value = true
      if (playing.value.communityId && !rated.value) showRate.value = true
      restart()
    } else {
      markCleared(levelIndex.value)
      recordStars()
      const next = walkIndex(levelIndex.value, 1)
      loadLevel(next)
      showChapterCard(next)
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
  if (intro) {
    // The intro waits for the boot splash to leave (5 s at most): its first frames matter.
    introWait += dtReal
    if (!isGamePaused.value && !showPause.value && (splashGone.value || introWait > 5)) intro.update(dtReal)
    if (intro.done) endIntro()
  }
  // The level waits under a chapter card.
  if (!intro && !chapterCard.value && started.value && !isGamePaused.value && !showLevels.value && !showCommunity.value && !showRate.value && !showPause.value) {
    acc += dtReal
    while (acc >= DT) {
      tick()
      acc -= DT
    }
  }
  ambienceClock += dtReal
  if (ambienceClock >= 1 / 30) {
    ambienceClock = 0
    updateAmbience(isGamePaused.value || intro ? AMBIENCE_IDLE : ambience())
    const frozen = isGamePaused.value || !!intro || showLevels.value || showCommunity.value || showRate.value || showPause.value
    updateEnemyBed(frozen ? ENEMY_BED_IDLE : enemyCueTracker.bed(world, tuning, DT))
  }
  resize(el)
  const ctx = el.getContext('2d')
  if (ctx && intro) intro.draw(ctx, { finish: t('umbrella.finish') }, dtReal)
  else if (ctx) {
    const cam = render(ctx, world, { finish: t('umbrella.finish') }, tuning, dtReal)
    if (warp) drawWarp(ctx, cam, warp)
    if (arrive > 0) {
      arrive = Math.max(0, arrive - dtReal)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = `rgba(255, 255, 255, ${arrive / ARRIVE_TIME})`
      ctx.fillRect(0, 0, el.width, el.height)
    }
  }
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
/** Typed in the game: an interstitial right away (the tester's shortcut, umbrella/ads.ts). */
const AD_CODE = 'cmunc'
let typed = ''
const onKey = (down: boolean) => (e: KeyboardEvent) => {
  if ((e.target as HTMLElement | null)?.tagName === 'INPUT' || !started.value) return
  if (down) unlockAudio() // a keyboard-only first visit must hear the intro too
  if (introOn.value && !showPause.value) {
    if (down && !e.repeat) {
      if (e.code === 'Escape') endIntro()
      else requestSkip()
    }
    e.preventDefault()
    return
  }
  if (down && e.key.length === 1) {
    typed = (typed + e.key.toLowerCase()).slice(-GUI_CODE.length)
    if (typed === GUI_CODE) { typed = ''; setEditorUnlocked(!editorUnlocked.value) }
    else if (typed === AD_CODE) { typed = ''; requestTestInterstitial() }
  }
  if (down && (e.code === 'KeyL' || (e.code === 'Escape' && showLevels.value))) {
    showLevels.value = !showLevels.value
    held.left = held.right = false
    e.preventDefault()
    return
  }
  if (down && e.code === 'Escape' && !showLevels.value && !showCommunity.value && !showRate.value && !showPause.value) {
    openPause()
    e.preventDefault()
    return
  }
  if (showLevels.value || showCommunity.value || showRate.value || showPause.value) return
  if (LEFT.has(e.code)) held.left = down
  else if (RIGHT.has(e.code)) held.right = down
  else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (down && !e.repeat) togglePending = true
  } else if (down && e.code === 'KeyR') restart()
  else return
  e.preventDefault()
  if (down) unlockAudio()
}
// ── Touch: a left/right joystick bottom-left, the umbrella button bottom-right ──
/** Shown on touch screens, and from the first touch on any device. */
/** Phones and tablets (the primary pointer is a finger): "Tap to play"; a mouse or a touch laptop: "Click to play". */
const showControls = computed(() => !touchUI.value && !introOn.value && !testing && !playing.value && !challenge.value && levelIndex.value < 3)
const tapDevice = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : 'ontouchstart' in window
// Touch controls start only where the PRIMARY pointer is a finger (phones, tablets). `'ontouchstart' in window` is
// true on a Windows laptop with a touch screen in Firefox, which put the joystick on desktops; from then on the
// controls follow the last input: a touch shows them, a mouse click hides them again.
const touchUI = ref(tapDevice)
const onAnyPointer = (e: PointerEvent) => {
  if (e.pointerType === 'touch') touchUI.value = true
  else if (e.pointerType === 'mouse') touchUI.value = false
  unlockAudio()
  if (introOn.value && !(e.target as HTMLElement | null)?.closest('.intro-skip')) requestSkip()
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
// The menus (pause, level list, community, star rating) are modals: they freeze the game, tell the
// portal gameplay has stopped, and silence the music and sounds until they close.
const menuOpen = computed(() => showPause.value || showLevels.value || showCommunity.value || showRate.value)
let releaseMenu: (() => void) | null = null
watch(menuOpen, (open) => {
  if (open) releaseMenu ??= acquireModalOpen()
  else {
    releaseMenu?.()
    releaseMenu = null
  }
}, { immediate: true, flush: 'sync' })
// The click-to-play screen and the intro cutscene are not gameplay: no portal gameplayStart under them.
// (Default flush: the click that starts a new player's intro settles before the bracket reads it.)
watch(() => !started.value || introOn.value, (held) => setRunBreak(held), { immediate: true })
const audioMuted = computed(() => userMuted.value || menuOpen.value || isAudioPaused.value || isPlatformAudioMuted.value || isMobileAudioMuted.value)
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
  if (started.value) begin()
  else playBtn.value?.focus()
})
const begin = () => {
  if (!testing) void openSharedLink()
  // A new player's first start: the intro, then Level 1 (not when a shared level opens).
  if (!testing && !playing.value && !levelParam() && levelIndex.value === startIndex && !getState<boolean>(INTRO_SEEN, false)) startIntro()
}
const onPlay = () => {
  unlockAudio()
  startedOnce = true
  started.value = true
  begin()
}
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  cancelAnimationFrame(raf)
  window.clearTimeout(reviveTimer)
  window.clearTimeout(skipTimer)
  window.clearTimeout(chapterCardTimer)
  releaseMenu?.()
  releaseMenu = null
  setRunBreak(false)
  // Leaving the scene ends a jam playtest (a reload stays in it: the flag lives in this tab).
  if (jamTest.value) setJamTest(false)
  gui?.destroy()
})

</script>

<template>
  <div class="umbrella-scene" @pointerdown="onAnyPointer" @pointerdown.capture="onSwipeDown" @pointerup="onSwipeUp">
    <canvas ref="canvas" class="umbrella-canvas" />

    <!-- The whole screen is the start button: the first click or tap is what lets the browser play sound. -->
    <div
      v-if="!started"
      ref="playBtn"
      class="start-screen"
      role="button"
      tabindex="0"
      :aria-label="t(tapDevice ? 'umbrella.tapToPlay' : 'umbrella.clickToPlay')"
      @click="onPlay"
      @keydown.enter.prevent="onPlay"
      @keydown.space.prevent="onPlay"
    >
      <span class="start-label">{{ t(tapDevice ? 'umbrella.tapToPlay' : 'umbrella.clickToPlay') }}</span>
    </div>

    <!-- Designer tools behind the "cmonc" cheat: English only, like the lil-gui panel. -->
    <button v-if="introOn && skipShown" class="intro-skip" @click.stop="endIntro">{{ t('umbrella.intro.skip') }}</button>
    <template v-if="!introOn">
    <div v-if="testing" class="hud">
      <button class="hud-btn wide" @click="backToEditor">◀ Editor</button>
      <button class="hud-btn" aria-label="Previous level" @click="stepTest(-1)">‹</button>
      <span class="hud-level">{{ testName || 'TEST LEVEL' }}</span>
      <button class="hud-btn" aria-label="Next level" @click="stepTest(1)">›</button>
      <button class="hud-btn" :aria-label="t('umbrella.restart')" @click="restart">↻</button>
      <button class="hud-btn" :aria-label="t('umbrella.pause.open')" @click="openPause">⏸</button>
    </div>
    <div v-else-if="playing" class="hud">
      <button class="hud-btn" :aria-label="t('umbrella.back')" @click="leaveCustom">‹</button>
      <span class="hud-level custom" :title="playing.name">{{ playing.name }}</span>
      <button class="hud-btn" :aria-label="t('umbrella.restart')" @click="restart">↻</button>
      <button class="hud-btn" :aria-label="t('umbrella.selectLevel')" @click="showLevels = true">☰</button>
      <button class="hud-btn" :aria-label="t('umbrella.pause.open')" @click="openPause">⏸</button>
      <button v-if="playing.communityId && canRate" class="hud-btn" :aria-label="t('umbrella.rateLevel')" @click="showRate = true">★</button>
      <button class="hud-btn" :aria-label="t(userMuted ? 'umbrella.unmute' : 'umbrella.mute')" :aria-pressed="userMuted" @click="toggleMute">{{ userMuted ? '🔇' : '🔊' }}</button>
    </div>
    <div v-else class="hud">
      <!-- The designer's jam playtest (from the editor): English, like the other designer tools. -->
      <button v-if="jamTest" class="hud-btn wide jam-test" title="Back to the editor" @click="endJamTest">◀ Jam test</button>
      <button class="hud-btn" :aria-label="t('umbrella.prevLevel')" @click="stepLevel(-1)">‹</button>
      <span class="hud-level" @pointerdown="tapLevelLabel">{{ t('umbrella.level', { n: shownIndex() + 1 }) }}<template v-if="challenge"> · {{ t('umbrella.challenge') }}</template></span>
      <button class="hud-btn" :aria-label="t('umbrella.nextLevel')" @click="stepLevel(1)">›</button>
      <button class="hud-btn" :aria-label="t('umbrella.restart')" @click="restart">↻</button>
      <button class="hud-btn" :aria-label="t('umbrella.selectLevel')" @click="showLevels = true">☰</button>
<button class="hud-btn" :aria-label="t('umbrella.pause.open')" @click="openPause">⏸</button>
      <button v-if="communityEnabled" class="hud-btn wide" :aria-label="t('umbrella.community.open')" @click="showCommunity = true">🌐 {{ t('umbrella.community.button') }}</button>
      <button class="hud-btn" :aria-label="t(userMuted ? 'umbrella.unmute' : 'umbrella.mute')" :aria-pressed="userMuted" @click="toggleMute">{{ userMuted ? '🔇' : '🔊' }}</button>
    </div>
    </template>

    <button v-if="showRevive" class="revive-restart" @click="restart">↻ {{ t('umbrella.reviveRestart') }}</button>
    <div v-if="notice" class="toast info" role="status">{{ notice }}</div>

    <PauseMenu v-if="showPause" @resume="showPause = false" @restart="restartFromPause" @intro="watchIntro" />
    <CommunityLevelsModal v-if="showCommunity" @close="showCommunity = false" @play="playCustom" />
    <RateLevelCard
      v-if="showRate && playing?.communityId"
      :level-id="playing.communityId"
      :name="playing.name"
      @done="showRate = false; rated = true"
      @close="showRate = false"
    />

    <button v-if="editorUnlocked && !testing && editorAllowed" class="open-editor" :class="{ 'above-stick': touchUI }" @click="openEditor">OPEN EDITOR</button>
    <!-- The controls, in the bottom right, for the first three campaign levels. -->
    <ul v-if="showControls" class="controls" :aria-label="t('umbrella.controls')">
      <li><span class="keys"><kbd>←</kbd><kbd>→</kbd><i>/</i><kbd>A</kbd><kbd>D</kbd></span><span class="what">{{ t('umbrella.ctlMove') }}</span></li>
      <li><span class="keys"><kbd class="wide">Space</kbd><i>/</i><kbd class="wide">Enter</kbd></span><span class="what">{{ t('umbrella.ctlUmbrella') }}</span></li>
      <li><span class="keys"><kbd>R</kbd></span><span class="what">{{ t('umbrella.ctlRestart') }}</span></li>
    </ul>
    <template v-else-if="!introOn">
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
    <!-- Collectibles: a gold badge in the top right, popping with every pickup. -->
    <div v-if="hudStars.total && started && !introOn" :key="'badge' + hudStars.total" class="collect-badge" :class="{ done: hudStars.got === hudStars.total }" role="status" :aria-label="t('umbrella.stars', hudStars)">
      <span :key="badgePop" class="collect-glyph">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path v-if="hudStars.shape === 'star'" d="M12 2.5l2.9 6.2 6.7.8-5 4.6 1.4 6.7L12 17.4l-6 3.4 1.4-6.7-5-4.6 6.7-.8z" />
          <template v-else-if="hudStars.shape === 'cloud'">
            <path d="M6.5 19a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.5 9a5 5 0 0 1 .5 10z" />
          </template>
          <template v-else>
            <path d="M2.5 12.5C2.5 7 6.7 3 12 3s9.5 4 9.5 9.5c-1.3-1.2-2.6-1.2-3.9 0-1.3-1.2-2.6-1.2-3.8 0-1.3-1.2-2.5-1.2-3.8 0-1.3-1.2-2.6-1.2-3.9 0z" />
            <path d="M11 12.5h2V19a2.6 2.6 0 0 1-5.2 0h1.8a.8.8 0 0 0 1.6 0z" />
          </template>
        </svg>
      </span>
      <span class="collect-count"><b>{{ hudStars.got }}</b><i>/</i>{{ hudStars.total }}</span>
    </div>
    <div v-if="brokenFlash" class="toast">{{ t('umbrella.broken') }}</div>
    <!-- The chapter card: 3 s on a chapter's first level (showChapterCard). -->
    <div v-if="chapterCard" :key="chapterCard.key" class="chapter-card" role="status" aria-live="polite">
      <div class="chapter-card-title">{{ chapterCard.title }}</div>
      <div v-if="chapterCard.subtitle" class="chapter-card-sub">{{ chapterCard.subtitle }}</div>
    </div>

    <div v-if="showLevels" class="levels-backdrop" @click.self="showLevels = false">
      <div class="levels" role="dialog" :aria-label="t('umbrella.selectLevel')">
        <div class="levels-head">
          <b>{{ t('umbrella.selectLevel') }}</b>
          <button class="hud-btn" :aria-label="t('umbrella.close')" @click="showLevels = false">✕</button>
        </div>
        <section v-for="ch in chapterSections" :key="ch.id" class="chapter" :aria-label="ch.title">
          <h3 v-if="chapterSections.length > 1 || ch.id === JAM_CHAPTER || ch.name" class="chapter-title">{{ ch.title }}</h3>
          <div class="levels-grid">
            <button
              v-for="i in ch.levels"
              :key="LEVELS[i]!.id"
              class="level-tile"
              :class="{ current: i === shownIndex(), cleared: cleared.includes(i), challenge: isChallenge(i) }"
              :aria-label="t('umbrella.level', { n: i + 1 }) + (isChallenge(i) ? ' · ' + t('umbrella.challenge') : '')"
              @click="pickLevel(i)"
            >
              <span class="level-num">{{ i + 1 }}</span>
              <span v-if="cleared.includes(i)" class="level-tick">✓</span>
              <span v-if="LEVELS[i]!.stars?.length" class="level-stars">★{{ starBest[LEVELS[i]!.id] ?? 0 }}/{{ LEVELS[i]!.stars!.length }}</span>
            </button>
          </div>
        </section>
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
  /* Tapped twenty times in a row it requests a rewarded ad (umbrella/ads.ts): no text selection, no double-tap zoom. */
  user-select: none;
  touch-action: manipulation;
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
.hud-btn.jam-test { background: rgba(234, 179, 8, 0.35); }
.controls {
  position: absolute;
  right: calc(16px + env(safe-area-inset-right, 0px));
  bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  z-index: 3;
  margin: 0;
  padding: 10px 14px;
  list-style: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  border-radius: 12px;
  background: rgba(13, 16, 24, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 14px;
  opacity: 0.85;
  pointer-events: none;
}
.controls li { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.controls .keys { display: inline-flex; align-items: center; gap: 4px; }
.controls i { font-style: normal; opacity: 0.5; margin: 0 2px; }
.controls kbd {
  min-width: 26px;
  padding: 3px 7px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-bottom-width: 3px;
  background: rgba(255, 255, 255, 0.1);
  font: 700 13px system-ui, sans-serif;
  text-align: center;
}
.controls kbd.wide { padding: 3px 10px; }
.controls .what { min-width: 150px; text-align: left; opacity: 0.85; }
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
.start-screen {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  background: rgba(13, 16, 24, 0.55);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.start-screen:focus-visible { outline: none; }
/* Like the arena's "tap to start": big, white, uppercase, softly pulsing over the dimmed scene. */
.start-label {
  max-width: 100%;
  color: #fff;
  font-weight: 900;
  font-size: clamp(28px, 6vw, 56px);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: center;
  text-wrap: balance;
  text-shadow: 0 3px 0 rgba(0, 0, 0, 0.45), 0 0 26px rgba(0, 0, 0, 0.6);
  animation: start-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@keyframes start-pulse { 50% { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) { .start-label { animation: none; } }
.intro-skip {
  position: absolute;
  right: calc(20px + env(safe-area-inset-right));
  bottom: calc(20px + env(safe-area-inset-bottom));
  z-index: 3;
  padding: 10px 18px;
  border-radius: 10px;
  border: 2px solid rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font: 800 18px system-ui, sans-serif;
  cursor: pointer;
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
.chapter-card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(8, 10, 20, 0.62) 0%, rgba(8, 10, 20, 0.35) 55%, transparent 80%);
  /* A fade and a short slide, never a scale (a scaled card rasterises small and reads soft). */
  animation: chapter-card 3s ease-out both;
}
.chapter-card-title {
  font-size: clamp(34px, 8vw, 72px);
  font-weight: 800;
  letter-spacing: 0.06em;
  text-shadow: 0 3px 18px rgba(0, 0, 0, 0.6);
}
.chapter-card-sub {
  font-size: clamp(16px, 3.2vw, 26px);
  font-style: italic;
  opacity: 0.9;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
}
/* Arabic is joined: any tracking breaks it. */
html[lang^='ar'] .chapter-card-title,
html[lang^='ar'] .chapter-title { letter-spacing: 0; }
@keyframes chapter-card {
  0% { opacity: 0; transform: translateY(14px); }
  15% { opacity: 1; transform: translateY(0); }
  82% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-6px); }
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
.chapter + .chapter { margin-top: 16px; }
.chapter-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
  opacity: 0.8;
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
.level-tile.challenge { background: rgba(34, 163, 90, 0.35); }
.level-stars {
  position: absolute;
  bottom: 3px;
  left: 0;
  right: 0;
  font-size: 11px;
  color: #facc15;
  text-align: center;
}
/* The collectible badge: a gilded pill in the top right corner. */
.collect-badge {
  position: absolute;
  top: calc(12px + env(safe-area-inset-top, 0px));
  right: calc(12px + env(safe-area-inset-right, 0px));
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px 6px 8px;
  border-radius: 999px;
  color: #3b2400;
  background: linear-gradient(180deg, #fff3a8 0%, #facc15 48%, #d99a06 100%);
  border: 2px solid #fff8d6;
  box-shadow: 0 0 0 2px #8a5a00, 0 4px 14px rgba(0, 0, 0, 0.45), 0 0 18px rgba(250, 204, 21, 0.45);
  font-weight: 800;
  pointer-events: none;
}
.collect-badge::before {
  content: '';
  position: absolute;
  inset: 3px 12px auto 12px;
  height: 38%;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0));
}
.collect-badge.done { animation: collect-shine 1.6s ease-in-out infinite; }
.collect-glyph {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 20px;
  line-height: 1;
  color: #facc15;
  background: radial-gradient(circle at 35% 30%, #5b3a00, #2a1800);
  box-shadow: inset 0 0 0 2px #fff3a8;
  animation: collect-pop 0.5s cubic-bezier(0.2, 1.6, 0.4, 1);
}
.collect-glyph svg { fill: #facc15; }
.collect-count { font-size: 20px; letter-spacing: 0.5px; position: relative; }
.collect-count i { font-style: normal; opacity: 0.55; margin: 0 1px; }
@keyframes collect-pop { 0% { transform: scale(0.5) rotate(-25deg); } 100% { transform: scale(1) rotate(0); } }
@keyframes collect-shine { 50% { filter: brightness(1.25); box-shadow: 0 0 0 2px #8a5a00, 0 4px 14px rgba(0, 0, 0, 0.45), 0 0 30px rgba(250, 204, 21, 0.9); } }
.level-tick {
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 14px;
  color: #7ee08a;
}
</style>
