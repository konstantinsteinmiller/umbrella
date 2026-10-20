// ─── Sound engine: kit + mix + wind + score on one context ─────────────────
//
// Context-agnostic, so the game (audio.ts), the listening page and the
// offline level report all drive the exact same graph. Owns no gates: the
// caller decides when sound may play; this only makes it.

import { createComposer, MUSIC_SLOT, type Composer } from './music'
import {
  AMBIENCE_IDLE, createAmbience, createKit, createMix, RECIPES, SFX_DUCK, SFX_TRIM,
  type Ambience, type AmbienceState, type Kit, type Mix, type SfxName, type SfxParams
} from './soundKit'

/** Mix levels as the tuning panel sets them (linear, 1 = as designed). */
export interface MixLevels {
  master: number
  music: number
  sfx: number
  wind: number
}

/**
 * Designed bus levels — set from the level report so the score sits well
 * under the one-shots and the wind bed under both.
 */
export const BUS = { master: 0.82, music: 0.25, sfx: 1, wind: 0.5 }

export interface SoundEngine {
  readonly ctx: BaseAudioContext
  readonly mix: Mix
  readonly kit: Kit
  /** Play a one-shot at `at` (default now), panned −1..1. */
  play: (name: SfxName, params?: SfxParams & { pan?: number }, at?: number) => void
  /** Start the wind layers (idempotent). */
  startAmbience: (at?: number) => void
  setAmbience: (s: AmbienceState, at?: number) => void
  /** Start the score at `at`, fading in over `fadeIn` s (idempotent). */
  startMusic: (at?: number, fadeIn?: number) => void
  /** Write the score up to `t` (the live scheduler calls this ahead of time). */
  scheduleMusic: (t: number) => void
  readonly musicStarted: boolean
  duck: (db: number, hold: number, at?: number) => void
  setLevels: (l: MixLevels, at?: number) => void
  /** Hard mute at the last gain stage; unmute fades back in. */
  setMuted: (muted: boolean, at?: number) => void
  /** Silence and drop every one-shot still ringing. */
  killVoices: () => void
  readonly activeVoices: number
}

export const createSoundEngine = (ctx: BaseAudioContext, dest: AudioNode, seed: number): SoundEngine => {
  const kit = createKit(ctx, seed)
  const mix = createMix(ctx, dest, seed)
  let ambience: Ambience | null = null
  let composer: Composer | null = null
  type Voice = { gains: GainNode[]; until: number }
  const voices = new Set<Voice>()
  let whistle: Voice | null = null
  let levels: MixLevels = { master: 1, music: 1, sfx: 1, wind: 1 }

  const now = () => ctx.currentTime

  const prune = () => {
    const t = now()
    for (const v of voices) {
      if (v.until < t) {
        for (const g of v.gains) g.disconnect()
        voices.delete(v)
      }
    }
  }

  /** Fade a voice out and drop it from the graph on the wall clock — a
   *  suspended context's clock stands still, so it can't be the one to retire it. */
  const retire = (v: Voice) => {
    for (const g of v.gains) {
      g.gain.cancelScheduledValues(now())
      g.gain.setTargetAtTime(0, now(), 0.008)
    }
    voices.delete(v)
    setTimeout(() => { for (const g of v.gains) g.disconnect() }, 80)
  }

  const duck = (db: number, hold: number, at = now()) => {
    const g = mix.musicDuck.gain
    const depth = Math.pow(10, db / 20)
    g.cancelScheduledValues(at)
    g.setTargetAtTime(depth, at, 0.03)
    g.setTargetAtTime(1, at + hold, 0.6)
  }

  const applyLevels = (at: number) => {
    mix.masterVol.gain.setTargetAtTime(BUS.master * levels.master, at, 0.05)
    mix.musicVol.gain.setTargetAtTime(BUS.music * levels.music, at, 0.05)
    mix.sfxVol.gain.setTargetAtTime(BUS.sfx * levels.sfx, at, 0.05)
    mix.ambienceVol.gain.setTargetAtTime(BUS.wind * levels.wind, at, 0.05)
  }
  mix.masterVol.gain.value = BUS.master
  mix.musicVol.gain.value = BUS.music
  mix.sfxVol.gain.value = BUS.sfx
  mix.ambienceVol.gain.value = BUS.wind

  return {
    ctx,
    mix,
    kit,
    play: (name, params = {}, at = now()) => {
      prune()
      // dry → trim → pan → sfx bus (with a little air on everything);
      // the recipe's own reverb send → trim → sfx room.
      const trim = SFX_TRIM[name]
      const dry = ctx.createGain()
      dry.gain.value = trim
      const pan = ctx.createStereoPanner()
      pan.pan.value = Math.max(-1, Math.min(1, params.pan ?? 0))
      dry.connect(pan).connect(mix.sfx.dry)
      const air = ctx.createGain()
      air.gain.value = 0.18
      pan.connect(air).connect(mix.sfx.verb)
      const verb = ctx.createGain()
      verb.gain.value = trim
      verb.connect(mix.sfx.verb)
      const len = RECIPES[name](kit, { dry, verb }, at, params)
      const v = { gains: [dry, verb], until: at + len + 1.4 }
      voices.add(v)
      if (name === 'whistle') {
        // One falling whistle at a time.
        if (whistle) retire(whistle)
        whistle = v
      }
      const d = SFX_DUCK[name]
      if (d && composer) duck(d[0], d[1], at)
    },
    startAmbience: (at = now()) => {
      if (ambience) return
      ambience = createAmbience(kit, mix.ambience, at)
      ambience.set(AMBIENCE_IDLE, at)
    },
    setAmbience: (s, at = now()) => ambience?.set(s, at),
    startMusic: (at = now(), fadeIn = 4) => {
      if (composer) return
      // Dry and hall sends both ride the opening fade.
      const fade = (into: AudioNode) => {
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, at)
        g.gain.linearRampToValueAtTime(1, at + fadeIn)
        g.connect(into)
        return g
      }
      const dry = fade(mix.music.dry)
      const verb = fade(mix.music.verb)
      composer = createComposer(kit, { dry, verb }, at + 0.05, seed + 77)
      composer.scheduleUntil(at + MUSIC_SLOT * 0.5)
    },
    scheduleMusic: (t) => composer?.scheduleUntil(t),
    get musicStarted() { return composer !== null },
    duck,
    setLevels: (l, at = now()) => {
      levels = { ...l }
      applyLevels(at)
    },
    setMuted: (muted, at = now()) => {
      const g = mix.mute.gain
      g.cancelScheduledValues(at)
      if (muted) {
        g.setValueAtTime(g.value, at)
        g.setTargetAtTime(0, at, 0.008)
      } else {
        g.setValueAtTime(0, at)
        g.linearRampToValueAtTime(1, at + 0.35)
      }
    },
    killVoices: () => {
      for (const v of voices) retire(v)
      whistle = null
    },
    get activeVoices() {
      prune()
      return voices.size
    }
  }
}
