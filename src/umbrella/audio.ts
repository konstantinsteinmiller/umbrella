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
// once the context really runs.

import { getAudioContext, isAudioSuspended } from '@/use/useAssets'
import { createSoundEngine, type MixLevels, type SoundEngine } from './soundEngine'
import type { AmbienceState, SfxName, SfxParams } from './soundKit'

/** How far ahead the live scheduler keeps the score written (s). */
const MUSIC_LOOKAHEAD = 4

let engine: SoundEngine | null = null
let muted = false
let gestured = false
let bedsStarted = false
let levels: MixLevels | null = null

const getEngine = (): SoundEngine | null => {
  if (engine) return engine
  const c = getAudioContext()
  if (!c) return null
  engine = createSoundEngine(c, c.destination, (Math.random() * 2 ** 31) | 0)
  if (muted) engine.mix.mute.gain.value = 0
  if (levels) engine.setLevels(levels)
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
  e.startMusic(e.ctx.currentTime + 0.4, 5)
  // A suspended context's clock stands still, so nothing piles up under an
  // ad; a throttled background timer still finds 4 s of score written.
  setInterval(() => e.scheduleMusic(e.ctx.currentTime + MUSIC_LOOKAHEAD), 500)
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
}

/** Play a one-shot; silently refused while muted or before the context runs. */
export const playSfx = (name: SfxName, params?: SfxParams & { pan?: number }): void => {
  const e = engine
  if (!e || !live(e)) return
  e.play(name, params)
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
