// ─── Umbrella audio: the game's one sound authority ────────────────────────
//
// Synthesised live (soundKit.ts / music.ts, no asset files) on the app's
// SHARED AudioContext, so the central pause orchestrator (useGamePauseAudio)
// suspends it for ads, hidden tabs, platform pauses and portal mutes like any
// other engine audio. On top of that the scene drives `setAudioMuted` from the
// same gates, which:
//   • zeroes the last gain stage before the speakers,
//   • hard-stops every one-shot still ringing (a suspended context only
//     freezes them; they would tail out on resume), and
//   • refuses every new one-shot until it clears.
// Music and the wind bed start only after the first user gesture, and only
// once the context really runs. The music is the recorded loop
// public/audio/music/bg-cozy.ogg (fetched then, never before the first
// screen), played on the engine's music bus: the same gate, the same suspend
// under an ad (it carries on from where it was when the ad closes), and the
// same ducking under the big one-shots as the synthesised score had.

import { getAudioContext, isAudioSuspended } from '@/use/useAssets'
import { createSoundEngine, type MixLevels, type SoundEngine } from './soundEngine'
import type { AmbienceState, SfxName, SfxParams } from './soundKit'
import { createEnemySounds, ENEMY_BED_IDLE, type EnemyBedState, type EnemySfxName, type EnemySfxParams, type EnemySounds } from './enemySounds'

/** The background music: a seamless loop, at the music bus's level (tuning.musicVolume). */
const MUSIC_TRACK = `${import.meta.env.BASE_URL}audio/music/bg-cozy.ogg`
/** Seconds the track fades in over when it first starts. */
const MUSIC_FADE_IN = 4

let engine: SoundEngine | null = null
let muted = false
let gestured = false
let bedsStarted = false
let levels: MixLevels | null = null
/** Walldorf / Prickbait voices on the engine's SFX bus (enemySounds.ts). */
let enemies: EnemySounds | null = null

const getEngine = (): SoundEngine | null => {
  if (engine) return engine
  const c = getAudioContext()
  if (!c) return null
  engine = createSoundEngine(c, c.destination, (Math.random() * 2 ** 31) | 0)
  if (muted) engine.mix.mute.gain.value = 0
  if (levels) engine.setLevels(levels)
  enemies = createEnemySounds(engine, (Math.random() * 2 ** 31) | 0)
  c.addEventListener('statechange', startBeds)
  return engine
}

/** May a sound start right now? */
const live = (e: SoundEngine): boolean => !muted && !isAudioSuspended() && e.ctx.state === 'running'

/** Wind bed + score, once: after a gesture, on a running context. */
const startBeds = (): void => {
  const e = engine
  if (!e || bedsStarted || !gestured || e.ctx.state !== 'running') return
  bedsStarted = true
  e.startAmbience()
  enemies?.startBed()
  void startTrack(e)
}

/** Fetch and decode the track once, then start it (silently skipped if either fails). */
const startTrack = async (e: SoundEngine): Promise<void> => {
  try {
    const res = await fetch(MUSIC_TRACK)
    if (!res.ok) return
    const buffer = await e.ctx.decodeAudioData(await res.arrayBuffer())
    e.startTrack(buffer, e.ctx.currentTime + 0.1, MUSIC_FADE_IN)
  } catch {
    // No music: the game plays on with its effects and wind.
  }
}

/** Call from a user gesture so the context may start. */
export const unlockAudio = (): void => {
  gestured = true
  const e = getEngine()
  if (!e) return
  if (e.ctx.state === 'suspended' && !muted && !isAudioSuspended()) {
    void (e.ctx as AudioContext).resume().then(startBeds, () => { /* closed */ })
  }
  startBeds()
}

/** The game's audio gate (ads, hidden tab, platform pause or mute). */
export const setAudioMuted = (m: boolean): void => {
  if (m === muted) return
  muted = m
  if (!engine) return
  engine.setMuted(m)
  if (m) engine.killVoices()
  if (m) enemies?.killVoices()
}

/** Play a one-shot; silently refused while muted or before the context runs. */
export const playSfx = (name: SfxName, params?: SfxParams & { pan?: number }): void => {
  const e = engine
  if (!e || !live(e)) return
  e.play(name, params)
}

/** An enemy one-shot (enemySounds.ts), behind the same gate as `playSfx`. */
export const playEnemySfx = (name: EnemySfxName, params?: EnemySfxParams): void => {
  const e = engine
  if (!e || !enemies || !live(e)) return
  enemies.play(name, params)
}

/** The enemies around the player, from the scene each frame (idle while gated). */
export const updateEnemyBed = (s: EnemyBedState): void => {
  if (enemies && bedsStarted) enemies.setBed(muted || isAudioSuspended() ? ENEMY_BED_IDLE : s)
}

/** The wind around the player, from the scene each frame. */
export const updateAmbience = (s: AmbienceState): void => {
  if (engine && bedsStarted) engine.setAmbience(s)
}

/** Mix levels from the tuning panel (1 = as designed). */
export const setAudioLevels = (l: MixLevels): void => {
  levels = { ...l }
  engine?.setLevels(levels)
}

/**
 * Snapshot for the mute regression check (scripts/sfx/umbrella-mute-check.mjs):
 * the context state, the gate, the last gain stage and the level the speakers
 * actually get (RMS after the mute gain).
 */
export const audioDebug = () => {
  const e = engine
  if (!e) return { state: 'none', muted, gate: isAudioSuspended(), muteGain: null, voices: 0, music: false, rms: 0 }
  const buf = new Float32Array(e.mix.meter.fftSize)
  e.mix.meter.getFloatTimeDomainData(buf)
  let sum = 0
  for (const v of buf) sum += v * v
  return {
    state: e.ctx.state,
    muted,
    gate: isAudioSuspended(),
    muteGain: e.mix.mute.gain.value,
    voices: e.activeVoices,
    music: e.musicStarted,
    rms: Math.sqrt(sum / buf.length)
  }
}
