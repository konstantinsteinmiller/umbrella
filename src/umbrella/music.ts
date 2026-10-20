// ─── Umbrella score: generative, calm, endless ─────────────────────────────
//
// Not a loop but a slow composer: chords of D major laid out two bars at a
// time (64 BPM, 7.5 s per chord), voiced as a soft breathing pad with a
// wind-tuned "air choir" on top, a harp that arpeggiates them, a pan-flute
// that sings the theme now and then, a sub bass, and wind chimes drifting
// through. Sections rotate (flow → song → flow → air …) and every choice
// comes from one seeded PRNG, so a 10-minute session never repeats a minute
// yet always sounds like the same piece. Seamless by construction: there is
// no loop point.
//
// Pure Web Audio like soundKit.ts: `scheduleUntil(t)` writes notes into any
// context — live (audio.ts runs it 4 s ahead) or offline for the level report.

import { chime, filter, gainAD, gainNode, midiHz, noise, osc, pentaNote, prng, type Kit, type Out } from './soundKit'

const BPM = 64
const BEAT = 60 / BPM
/** One chord = two bars of 4/4. */
const SLOT = BEAT * 8

interface Chord {
  bass: number
  /** Pad voicing (MIDI), rootless where the bass carries the root. */
  pad: number[]
  /** Melody notes that rest well on this chord's strong beats. */
  rest: number[]
}

// Pitch classes: D=2 E=4 F#=6 A=9 B=11 (the pentatonic) + G, C# in the pads.
const CHORDS: Record<string, Chord> = {
  I: { bass: 38, pad: [54, 57, 61, 64], rest: [2, 6, 9, 4] }, // Dmaj9
  vi: { bass: 35, pad: [54, 57, 62, 64], rest: [11, 2, 6] }, // Bm11
  IV: { bass: 43, pad: [54, 57, 59, 62], rest: [11, 2, 6, 9] }, // Gmaj9
  V: { bass: 45, pad: [52, 57, 59, 62], rest: [9, 11, 4] }, // Asus2/4
  iii: { bass: 42, pad: [52, 57, 61, 66], rest: [6, 9, 4] }, // F#m7
  ii: { bass: 40, pad: [55, 59, 62, 66], rest: [4, 11, 2, 6] } // Em9
}

const PROGRESSIONS = [
  ['I', 'vi', 'IV', 'V'],
  ['IV', 'I', 'ii', 'V'],
  ['vi', 'IV', 'I', 'V'],
  ['I', 'iii', 'IV', 'ii'],
  ['IV', 'V', 'iii', 'vi'],
  ['I', 'IV', 'vi', 'V']
]

type Section = 'intro' | 'flow' | 'song' | 'air'

/** The theme: pentatonic degrees (D4 = 0) with onsets and lengths in beats. */
const THEME: [deg: number, at: number, len: number][] = [
  [3, 0, 1.5], [4, 1.5, 0.5], [3, 2, 1], [2, 3, 2], [1, 5, 0.5], [2, 5.5, 2.5]
]
const ANSWER: [deg: number, at: number, len: number][] = [
  [5, 0, 1], [4, 1, 1], [3, 2, 1.5], [4, 3.5, 0.5], [2, 4, 4]
]
/** Rhythms (onset, length) for the improvised phrases between the theme. */
const RHYTHMS: [at: number, len: number][][] = [
  [[0, 1.5], [1.5, 0.5], [2, 2], [4, 1], [5, 3]],
  [[0, 1], [1, 1], [2, 1], [3, 3]],
  [[2, 1], [3, 1], [4, 2.5], [6.5, 0.5], [7, 1]],
  [[4, 0.5], [4.5, 0.5], [5, 3]],
  [[0, 3], [3, 1], [4, 4]]
]

// ─── Instruments ───────────────────────────────────────────────────────────

const waves = new WeakMap<BaseAudioContext, { pad: PeriodicWave; flute: PeriodicWave; bass: PeriodicWave }>()
const wavesFor = (ctx: BaseAudioContext) => {
  let w = waves.get(ctx)
  if (w) return w
  const make = (amps: number[]) => {
    const real = new Float32Array(amps.length + 1)
    const imag = new Float32Array(amps.length + 1)
    amps.forEach((a, i) => { imag[i + 1] = a })
    return ctx.createPeriodicWave(real, imag)
  }
  // Pad: soft, hollow (odd harmonics a touch stronger) — between flute and string.
  const pad = make(Array.from({ length: 14 }, (_, i) => (1 / Math.pow(i + 1, 1.7)) * (i % 2 === 0 ? 1 : 0.6)))
  const flute = make([1, 0.16, 0.05, 0.02])
  const bass = make([1, 0.22, 0.05])
  w = { pad, flute, bass }
  waves.set(ctx, w)
  return w
}

const panner = (k: Kit, pan: number, dest: AudioNode): StereoPannerNode => {
  const p = k.ctx.createStereoPanner()
  p.pan.value = pan
  p.connect(dest)
  return p
}

/** Pad chord: two detuned voices per note through one breathing low-pass. */
const padChord = (k: Kit, o: Out, chord: Chord, t: number, dur: number, level: number) => {
  const { ctx } = k
  const lp = filter(k, 'lowpass', 700, 0.4)
  lp.frequency.setValueAtTime(650, t)
  lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.45)
  lp.frequency.linearRampToValueAtTime(900, t + dur + 2)
  const env = ctx.createGain()
  const attack = 2.4
  const release = 3.2
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(level, t + attack)
  env.gain.setValueAtTime(level, t + dur)
  env.gain.linearRampToValueAtTime(0, t + dur + release)
  lp.connect(env)
  env.connect(o.dry)
  env.connect(gainNode(k, 0.9)).connect(o.verb)
  const pans = [-0.55, -0.18, 0.18, 0.55]
  chord.pad.forEach((m, i) => {
    const p = panner(k, pans[i] ?? 0, lp)
    for (const cents of [-7, 6]) {
      const o1 = ctx.createOscillator()
      o1.setPeriodicWave(wavesFor(ctx).pad)
      o1.frequency.value = midiHz(m)
      o1.detune.value = cents + (k.rand() * 4 - 2)
      o1.connect(p)
      o1.start(t)
      o1.stop(t + dur + release + 0.1)
    }
  })
  // Air choir: pink noise sung through narrow bands on two chord tones.
  for (const [m, pan] of [[chord.pad[1]! + 12, -0.4], [chord.pad[3]! + 12, 0.4]] as const) {
    const n = noise(k, t, dur + release + 0.1, k.pink)
    const bp = filter(k, 'bandpass', midiHz(m), 40)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(level * 0.9, t + attack * 1.5)
    g.gain.setValueAtTime(level * 0.9, t + dur)
    g.gain.linearRampToValueAtTime(0, t + dur + release)
    n.connect(bp).connect(g).connect(panner(k, pan, o.verb))
  }
}

/** Harp pluck: partials decaying apart, a soft finger noise on the attack. */
const harp = (k: Kit, o: Out, m: number, t: number, vel: number, pan: number) => {
  const f = midiHz(m)
  const reg = Math.pow(440 / f, 0.35)
  const p = panner(k, pan, o.dry)
  const send = gainNode(k, 0.7)
  p.connect(send).connect(o.verb)
  for (const [ratio, amp, t60] of [[1, 1, 2.8], [2, 0.42, 1.4], [3, 0.14, 0.7], [4.02, 0.06, 0.4]] as const) {
    const o1 = osc(k, 'sine', f * ratio, t, t60 * reg + 0.05)
    o1.connect(gainAD(k, t, vel * amp, 0.004, t60 * reg)).connect(p)
  }
  const n = noise(k, t, 0.03)
  n.connect(filter(k, 'lowpass', 2500)).connect(gainAD(k, t, vel * 0.12, 0.001, 0.02)).connect(p)
}

/** Pan-flute: a breathy chiff, then a tone that grows a late vibrato. */
const flute = (k: Kit, o: Out, m: number, t: number, len: number, vel: number) => {
  const { ctx } = k
  const f = midiHz(m)
  const dur = Math.max(0.25, len * BEAT * 0.92)
  const o1 = ctx.createOscillator()
  o1.setPeriodicWave(wavesFor(ctx).flute)
  o1.frequency.value = f
  const vib = osc(k, 'sine', 5.1, t, dur + 0.5)
  const vd = gainNode(k, 0)
  vd.gain.setValueAtTime(0, t)
  vd.gain.setValueAtTime(0, t + Math.min(0.4, dur * 0.5))
  vd.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.9, dur))
  vib.connect(vd).connect(o1.frequency)
  const env = ctx.createGain()
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(vel, t + 0.08)
  env.gain.setTargetAtTime(vel * 0.8, t + 0.08, 0.2)
  env.gain.setValueAtTime(vel * 0.8, t + dur)
  env.gain.linearRampToValueAtTime(0, t + dur + 0.35)
  o1.start(t)
  o1.stop(t + dur + 0.4)
  const p = panner(k, 0.12, o.dry)
  p.connect(gainNode(k, 0.6)).connect(o.verb)
  o1.connect(filter(k, 'lowpass', 3200)).connect(env).connect(p)
  // Breath: noise in a band around the note, loud on the chiff, then a whisper.
  const n = noise(k, t, dur + 0.4)
  const bg = ctx.createGain()
  bg.gain.setValueAtTime(0, t)
  bg.gain.linearRampToValueAtTime(vel * 1.3, t + 0.03)
  bg.gain.setTargetAtTime(vel * 0.35, t + 0.04, 0.08)
  bg.gain.setValueAtTime(vel * 0.35, t + dur)
  bg.gain.linearRampToValueAtTime(0, t + dur + 0.3)
  n.connect(filter(k, 'bandpass', f, 9)).connect(bg).connect(p)
}

const bass = (k: Kit, o: Out, m: number, t: number, dur: number, level: number) => {
  const { ctx } = k
  const o1 = ctx.createOscillator()
  o1.setPeriodicWave(wavesFor(ctx).bass)
  o1.frequency.value = midiHz(m)
  const env = ctx.createGain()
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(level, t + 0.6)
  env.gain.setTargetAtTime(level * 0.45, t + 0.6, 2.5)
  env.gain.setTargetAtTime(0, t + dur, 0.5)
  o1.start(t)
  o1.stop(t + dur + 3)
  o1.connect(filter(k, 'lowpass', 400)).connect(env).connect(o.dry)
}

// ─── Composer ──────────────────────────────────────────────────────────────

/** Mix levels for the voices (the music bus trims the whole). */
const LEVEL = { pad: 0.05, harp: 0.075, flute: 0.075, bass: 0.13, chime: 0.022 }

export interface Composer {
  /** Write every chord slot that starts before `t`. */
  scheduleUntil: (t: number) => void
  /** Start time of the next unscheduled slot. */
  readonly next: number
}

export const createComposer = (k: Kit, o: Out, start: number, seed: number): Composer => {
  const rand = prng(seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!
  let next = start
  let section: Section = 'intro'
  let prog = PROGRESSIONS[0]!
  let slotInSection = 0
  let lastDeg = 3
  let sinceAir = 0

  const nextSection = (): Section => {
    sinceAir++
    if (sinceAir >= 3 + Math.floor(rand() * 2)) {
      sinceAir = 0
      return 'air'
    }
    if (section === 'song') return 'flow'
    return rand() < 0.6 ? 'song' : 'flow'
  }

  /** Nearest pentatonic degree to `deg` that rests on the chord (for strong beats). */
  const settle = (deg: number, chord: Chord): number => {
    for (const d of [0, 1, -1, 2, -2]) {
      if (chord.rest.includes(pentaNote(deg + d) % 12)) return deg + d
    }
    return deg
  }

  const melody = (chord: Chord, t: number, slot: number) => {
    const theme = slot === 0 ? THEME : slot === 2 && rand() < 0.7 ? ANSWER : null
    const notes: [number, number, number][] = theme
      ? theme.map(([d, at, len]) => [d, at, len])
      : pick(RHYTHMS).map(([at, len]) => {
        lastDeg = Math.max(1, Math.min(8, lastDeg + pick([-2, -1, -1, 1, 1, 2, 0])))
        return [lastDeg, at, len]
      })
    if (!theme && rand() < 0.3) return // breathe: not every chord sings
    for (const [d, at, len] of notes) {
      const strong = at % 2 === 0
      const deg = strong ? settle(d, chord) : d
      lastDeg = deg
      flute(k, o, pentaNote(deg, 62), t + at * BEAT + (rand() - 0.5) * 0.02, len, LEVEL.flute * (0.85 + rand() * 0.2))
    }
  }

  const arpeggio = (chord: Chord, t: number, density: number) => {
    const tones = [...chord.pad.map((m) => m + 12), chord.pad[0]! + 24]
    const up = rand() < 0.5
    const steps = [0, 1, 1.5, 2.5, 3, 4, 5, 5.5, 6.5, 7]
    let i = up ? 0 : tones.length - 1
    for (const s of steps) {
      if (rand() > density) continue
      const m = tones[Math.max(0, Math.min(tones.length - 1, i))]!
      i += up ? 1 : -1
      if (i >= tones.length || i < 0) i = up ? 0 : tones.length - 1
      const vel = LEVEL.harp * (s % 4 === 0 ? 1 : 0.7) * (0.85 + rand() * 0.3)
      harp(k, o, m, t + s * BEAT + (rand() - 0.5) * 0.025, vel, (rand() - 0.5) * 0.8)
    }
  }

  const chimes = (t: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const tc = t + rand() * SLOT * 0.8
      const p = k.ctx.createStereoPanner()
      p.pan.value = (rand() - 0.5) * 1.4
      p.connect(o.dry)
      p.connect(o.verb)
      chime(k, p, tc, midiHz(pentaNote(10 + Math.floor(rand() * 8))), LEVEL.chime * (0.6 + rand() * 0.5))
    }
  }

  const slot = (t: number) => {
    if (slotInSection === 4) {
      slotInSection = 0
      section = nextSection()
      let p = pick(PROGRESSIONS)
      while (p === prog) p = pick(PROGRESSIONS)
      prog = p
    }
    const chord = CHORDS[prog[slotInSection]!]!
    padChord(k, o, chord, t, SLOT, LEVEL.pad)
    if (section !== 'air' && !(section === 'intro' && slotInSection < 2)) bass(k, o, chord.bass, t, SLOT, LEVEL.bass)
    if (section === 'flow') arpeggio(chord, t, 0.75)
    if (section === 'song') {
      arpeggio(chord, t, 0.4)
      melody(chord, t, slotInSection)
    }
    if (section === 'intro' && slotInSection >= 1) arpeggio(chord, t, 0.3)
    if (section === 'air') {
      arpeggio(chord, t, 0.15)
      chimes(t, 2 + Math.floor(rand() * 3))
    } else if (rand() < 0.25) chimes(t, 1 + Math.floor(rand() * 2))
    slotInSection++
  }

  return {
    scheduleUntil: (t) => {
      while (next < t) {
        slot(next)
        next += SLOT
      }
    },
    get next() { return next }
  }
}

/** Length of one chord slot (s) — the composer's scheduling granularity. */
export const MUSIC_SLOT = SLOT
