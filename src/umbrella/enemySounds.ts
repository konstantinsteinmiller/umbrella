// ─── Enemy sounds: Walldorf and Prickbait ──────────────────────────────────
//
// The two enemies' voices, as Web Audio graphs in the same air-and-rubber
// palette as the rest of the kit (no samples, no chiptune). Every sound here is
// a warning first: the player should hear a danger before it lands.
//
//   Walldorf (the pillar)
//     wake    — an angry Walldorf notices Pweeg: a low rubbery growl and a snort.
//     charge  — the lunge: rubber creaks and the pillar sucks in air for `lead` s
//               (the tell), then a heavy air-cut whoosh and a thud at full reach.
//     bump    — a calm bouncy Walldorf throws Pweeg off: a springy rubber boing.
//     slam    — a CHARGING one hits him: a deep thump, a low boing, a whoomp of
//               displaced air and the umbrella's ribs rattling.
//     bed     — angry ones simmer (a low breathing growl) while Pweeg is near;
//               followers grind and rumble softly while they slide after him.
//   Prickbait (the mine)
//     alert   — Pweeg comes close: a cold double glint (a tritone: the one
//               interval outside the score's key, so it reads as "wrong").
//     sting   — touched: a needle prick, a metallic shimmer, a falling zing.
//     bed     — a proximity fuse ticking faster the closer he gets, and the wind
//               whistling thinly through its spikes (higher when it moves fast).
//
// Self-contained on purpose: its own seeded noise and primitives, so the kit's
// recipes (soundKit.ts) can change without touching these. audio.ts plays
// them on the engine's SFX bus, behind the same mute / pause gate.

import type { GameEvent, World } from './engine'
import type { Tuning } from './tuning'

const T60 = 6.9078 // ln(1000)
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))
const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

/** mulberry32 — tiny, fast, seedable. */
const prng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ─── Kit: one context, one PRNG, two noises ────────────────────────────────

export interface EnemyKit {
  ctx: BaseAudioContext
  rand: () => number
  white: AudioBuffer
  pink: AudioBuffer
}

const loopBuffer = (ctx: BaseAudioContext, seconds: number, gen: () => number): AudioBuffer => {
  const sr = ctx.sampleRate
  const n = Math.ceil(seconds * sr)
  const fade = Math.round(0.06 * sr)
  const raw = new Float32Array(n + fade)
  for (let i = 0; i < raw.length; i++) raw[i] = gen()
  const buf = ctx.createBuffer(1, n, sr)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = i < fade ? raw[i]! * (i / fade) + raw[n + i]! * (1 - i / fade) : raw[i]!
  return buf
}

export const createEnemyKit = (ctx: BaseAudioContext, seed: number): EnemyKit => {
  const nw = prng(seed + 31)
  const white = loopBuffer(ctx, 1.5, () => nw() * 2 - 1)
  const np = prng(seed + 37)
  let b0 = 0, b1 = 0, b2 = 0
  const pink = loopBuffer(ctx, 3, () => {
    const w = np() * 2 - 1
    b0 = 0.99765 * b0 + w * 0.099046
    b1 = 0.963 * b1 + w * 0.2965164
    b2 = 0.57 * b2 + w * 1.0526913
    return (b0 + b1 + b2 + w * 0.1848) * 0.25
  })
  return { ctx, rand: prng(seed), white, pink }
}

// ─── Primitives ────────────────────────────────────────────────────────────

const gain = (k: EnemyKit, v = 1): GainNode => {
  const g = k.ctx.createGain()
  g.gain.value = v
  return g
}

const band = (k: EnemyKit, type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode => {
  const f = k.ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

const tone = (k: EnemyKit, type: OscillatorType, freq: number, t0: number, dur: number): OscillatorNode => {
  const o = k.ctx.createOscillator()
  o.type = type
  o.frequency.value = freq
  o.start(t0)
  o.stop(t0 + dur)
  return o
}

const noise = (k: EnemyKit, t0: number, dur: number, buf: AudioBuffer = k.white): AudioBufferSourceNode => {
  const s = k.ctx.createBufferSource()
  s.buffer = buf
  s.loop = true
  s.start(t0, k.rand() * (buf.duration - 0.1))
  s.stop(t0 + dur)
  return s
}

/** Attack to `peak`, then an exponential decay to −60 dB `t60` s later. */
const env = (k: EnemyKit, t0: number, peak: number, attack: number, t60: number): GainNode => {
  const g = k.ctx.createGain()
  g.gain.value = 0
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + attack)
  g.gain.setTargetAtTime(0, t0 + attack, t60 / T60)
  return g
}

/** A swell: up to `peak` over `rise`, held, then gone over `fall`. */
const swell = (k: EnemyKit, t0: number, peak: number, rise: number, hold: number, fall: number): GainNode => {
  const g = k.ctx.createGain()
  g.gain.value = 0
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + rise)
  g.gain.setValueAtTime(peak, t0 + rise + hold)
  g.gain.linearRampToValueAtTime(0, t0 + rise + hold + fall)
  return g
}

const sweep = (p: AudioParam, t0: number, f0: number, f1: number, dur: number): void => {
  p.setValueAtTime(f0, t0)
  p.exponentialRampToValueAtTime(f1, t0 + dur)
}

/** A vibrato whose depth (Hz) dies away over `t60`: the jiggle of a rubber body. */
const wobble = (k: EnemyKit, target: AudioParam, t0: number, rate: number, depth: number, t60: number): void => {
  const lfo = tone(k, 'sine', rate, t0, t60 + 0.05)
  lfo.connect(env(k, t0, depth, 0.004, t60)).connect(target)
}

/** Modal ring: inharmonic partials with their own decays (metal, glass). */
const ring = (k: EnemyKit, out: AudioNode, t0: number, f: number, partials: [ratio: number, amp: number, t60: number][], peak: number): void => {
  for (const [ratio, amp, t60] of partials) {
    tone(k, 'sine', f * ratio, t0, t60 + 0.05).connect(env(k, t0, peak * amp, 0.001, t60)).connect(out)
  }
}

/** Gritty stretched-rubber creak: a narrow noise band chopped by a low square. */
const creak = (k: EnemyKit, out: AudioNode, t0: number, dur: number, f0: number, f1: number, peak: number): void => {
  const n = noise(k, t0, dur + 0.05)
  const bp = band(k, 'bandpass', f0, 10)
  sweep(bp.frequency, t0, f0, f1, dur)
  const am = gain(k, 0.5)
  tone(k, 'square', 34 + 10 * k.rand(), t0, dur + 0.05).connect(gain(k, 0.5)).connect(am.gain)
  n.connect(bp).connect(am).connect(swell(k, t0, peak, dur * 0.85, 0, dur * 0.15 + 0.03)).connect(out)
}

/** Where a recipe sends its sound: dry and into the room. */
export interface EnemyOut {
  dry: AudioNode
  verb: AudioNode
}

export interface EnemySfxParams {
  /** 0..1 — how close (charge, wake) or how hard (bump, slam). */
  intensity?: number
  /** Charge: seconds of wind-up tell before the strike starts. */
  lead?: number
  /** Charge: seconds the strike takes to reach full length (the thud). */
  strike?: number
  /** −1..1 stereo position. */
  pan?: number
}

type Recipe = (k: EnemyKit, o: EnemyOut, t: number, p: EnemySfxParams) => number

// ─── Walldorf ──────────────────────────────────────────────────────────────

/** WAKE — an angry Walldorf notices Pweeg: "hrrmm… hmph!" */
const wake: Recipe = (k, o, t, p) => {
  const v = 0.55 + 0.45 * clamp01(p.intensity ?? 1)
  // A low rubbery growl rising a little, gravelly from a fast flutter.
  const growl = tone(k, 'sawtooth', 58, t, 0.75)
  sweep(growl.frequency, t, 58, 76, 0.5)
  const glp = band(k, 'lowpass', 340, 2)
  sweep(glp.frequency, t, 260, 520, 0.45)
  const gravel = gain(k, 0.55)
  tone(k, 'triangle', 23, t, 0.75).connect(gain(k, 0.45)).connect(gravel.gain)
  growl.connect(glp).connect(gravel).connect(swell(k, t, 0.42 * v, 0.14, 0.22, 0.3)).connect(o.dry)
  // The breath behind it: a vowel opening ("oo" → "aa").
  const breath = noise(k, t, 0.7, k.pink)
  const formant = band(k, 'bandpass', 480, 4)
  sweep(formant.frequency, t, 420, 780, 0.45)
  breath.connect(formant).connect(swell(k, t, 0.34 * v, 0.1, 0.25, 0.25)).connect(o.dry)
  // Its body tensing.
  creak(k, o.dry, t + 0.08, 0.36, 260, 480, 0.2 * v)
  // …and the snort.
  const ts = t + 0.5
  const snort = noise(k, ts, 0.2, k.pink)
  const sb = band(k, 'bandpass', 1300, 1.6)
  sweep(sb.frequency, ts, 1300, 480, 0.12)
  const sg = env(k, ts, 0.5 * v, 0.006, 0.13)
  snort.connect(sb).connect(sg)
  sg.connect(o.dry)
  sg.connect(o.verb)
  return 0.85
}

/** CHARGE — the lunge: a creaking, inhaling tell, the air cut, the thud at full reach. */
const charge: Recipe = (k, o, t, p) => {
  const v = 0.3 + 0.7 * clamp01(p.intensity ?? 1)
  const lead = Math.max(0, p.lead ?? 0.4)
  const strike = Math.max(0.04, Math.min(0.6, p.strike ?? 0.14))
  if (lead >= 0.08) {
    // Rubber squeezing and the pillar sucking air in: the "it's coming" tell.
    creak(k, o.dry, t, lead, 300, 720, 0.45 * v)
    const inhale = noise(k, t, lead + 0.05, k.pink)
    const ib = band(k, 'bandpass', 620, 1.3)
    sweep(ib.frequency, t, 600, 1900, lead)
    inhale.connect(ib).connect(swell(k, t, 0.36 * v, lead, 0, 0.03)).connect(o.dry)
    // A low tension tone you feel more than hear.
    const tense = tone(k, 'sine', 52, t, lead + 0.05)
    sweep(tense.frequency, t, 52, 74, lead)
    tense.connect(swell(k, t, 0.22 * v, lead * 0.9, 0, lead * 0.1 + 0.03)).connect(o.dry)
  } else {
    // No time to wind up (a triggered charge): just the snort as it goes.
    const sn = noise(k, t, 0.12, k.pink)
    sn.connect(band(k, 'bandpass', 900, 1.5)).connect(env(k, t, 0.32 * v, 0.004, 0.09)).connect(o.dry)
  }
  // The strike: a big body cutting the air.
  const ts = t + lead
  const air = noise(k, ts, strike + 0.45, k.pink)
  const ab = band(k, 'bandpass', 2200, 1.1)
  sweep(ab.frequency, ts, 2300, 300, strike + 0.25)
  const ag = env(k, ts, 0.8 * v, Math.min(0.03, strike * 0.4), strike + 0.3)
  air.connect(ab).connect(ag)
  ag.connect(o.dry)
  ag.connect(o.verb)
  const push = noise(k, ts, strike + 0.3, k.pink)
  push.connect(band(k, 'lowpass', 380, 0.9)).connect(env(k, ts, 0.38 * v, strike * 0.6, strike + 0.2)).connect(o.dry)
  // Full reach: it stops dead — a thump and the rubber jiggling.
  const th = ts + strike
  const thump = tone(k, 'sine', 110, th, 0.45)
  sweep(thump.frequency, th, 112, 42, 0.18)
  thump.connect(env(k, th, 0.72 * v, 0.002, 0.32)).connect(o.dry)
  const slap = noise(k, th, 0.08)
  slap.connect(band(k, 'bandpass', 850, 1.5)).connect(env(k, th, 0.3 * v, 0.001, 0.06)).connect(o.dry)
  const jig = tone(k, 'sine', midiHz(50), th, 0.45) // D3, in the score's key
  wobble(k, jig.frequency, th, 11, 16, 0.38)
  jig.connect(env(k, th, 0.2 * v, 0.004, 0.36)).connect(o.dry)
  return lead + strike + 0.6
}

/** BUMP — a bouncy Walldorf throws Pweeg off: a springy rubber boing. */
const bump: Recipe = (k, o, t, p) => {
  const v = clamp01(p.intensity ?? 0.4)
  const base = midiHz(62) * (1 - 0.12 * v) * (0.98 + 0.04 * k.rand()) // around D4
  const len = 0.28 + 0.16 * v
  const boing = tone(k, 'sine', base, t, len + 0.08)
  const f = boing.frequency
  f.setValueAtTime(base * 0.6, t)
  f.exponentialRampToValueAtTime(base * 1.09, t + 0.03)
  f.exponentialRampToValueAtTime(base, t + 0.12)
  wobble(k, f, t + 0.02, 12.5, base * 0.085, len)
  boing.connect(env(k, t, 0.5 + 0.15 * v, 0.003, len)).connect(o.dry)
  // The rubber's squeak: a quiet octave partial.
  const skin = tone(k, 'triangle', base * 2.01, t, 0.14)
  skin.connect(band(k, 'lowpass', 2600)).connect(env(k, t, 0.08 + 0.05 * v, 0.002, 0.09)).connect(o.dry)
  // The bumper's membrane taking him.
  const thud = tone(k, 'sine', 140, t, 0.2)
  sweep(thud.frequency, t, 145, 68, 0.06)
  thud.connect(env(k, t, 0.34 + 0.12 * v, 0.002, 0.12)).connect(o.dry)
  // A puff of air pushed out.
  const puff = noise(k, t, 0.15, k.pink)
  const pb = band(k, 'bandpass', 900, 1.2)
  sweep(pb.frequency, t, 950, 420, 0.08)
  puff.connect(pb).connect(env(k, t, 0.24 + 0.16 * v, 0.002, 0.08)).connect(o.dry)
  return len + 0.12
}

/** SLAM — a charging Walldorf hits Pweeg: much bigger than a bump. */
const slam: Recipe = (k, o, t, p) => {
  const v = 0.55 + 0.45 * clamp01(p.intensity ?? 1)
  // Chest thump.
  const thump = tone(k, 'sine', 96, t, 0.6)
  sweep(thump.frequency, t, 98, 38, 0.22)
  thump.connect(env(k, t, 0.7 * v, 0.002, 0.46)).connect(o.dry)
  // The rubber skin's crack.
  const crack = noise(k, t, 0.08)
  crack.connect(band(k, 'lowpass', 2400, 0.7)).connect(env(k, t, 0.5 * v, 0.0008, 0.05)).connect(o.dry)
  // A low, heavy boing as the pillar's body springs back.
  const base = midiHz(50) // D3
  const tb = t + 0.014 // it springs back just after the impact
  const boing = tone(k, 'sine', base, tb, 0.7)
  const f = boing.frequency
  f.setValueAtTime(base * 0.55, tb)
  f.exponentialRampToValueAtTime(base * 1.12, tb + 0.045)
  f.exponentialRampToValueAtTime(base, tb + 0.18)
  wobble(k, f, tb + 0.03, 8.5, base * 0.11, 0.6)
  boing.connect(env(k, tb, 0.36 * v, 0.004, 0.62)).connect(o.dry)
  // Whoomp: the air between them thrown out.
  const whoomp = noise(k, t, 0.5, k.pink)
  const wl = band(k, 'lowpass', 1300, 0.8)
  sweep(wl.frequency, t, 1400, 240, 0.3)
  const wg = env(k, t, 0.6 * v, 0.008, 0.36)
  whoomp.connect(wl).connect(wg)
  wg.connect(o.dry)
  wg.connect(o.verb)
  // Pweeg's umbrella ribs rattling from the blow.
  for (let i = 0; i < 5; i++) {
    const at = t + 0.02 + i * 0.024 + k.rand() * 0.01
    const c = noise(k, at, 0.04)
    c.connect(band(k, 'bandpass', 2500 + 900 * k.rand(), 6)).connect(env(k, at, (0.32 - 0.05 * i) * v, 0.0005, 0.025)).connect(o.dry)
  }
  return 0.95
}

// ─── Prickbait ─────────────────────────────────────────────────────────────

/** ALERT — Pweeg is close to a mine: a cold double glint, a tritone apart. */
const alert: Recipe = (k, o, t, p) => {
  const v = 0.6 + 0.4 * clamp01(p.intensity ?? 1)
  const out = gain(k, 1)
  out.connect(o.dry)
  out.connect(gain(k, 0.8)).connect(o.verb)
  const metal: [number, number, number][] = [[1, 1, 0.5], [2.76, 0.3, 0.22], [5.4, 0.12, 0.1]]
  ring(k, out, t, midiHz(80), metal, 0.16 * v) // G#5: the note outside the key
  ring(k, out, t + 0.085, midiHz(86), metal, 0.13 * v) // D6
  // The glint of the spikes catching the wind.
  const tss = noise(k, t, 0.06)
  tss.connect(band(k, 'highpass', 6200)).connect(env(k, t, 0.12 * v, 0.002, 0.04)).connect(o.dry)
  return 0.7
}

/** STING — touched a mine: a needle prick, a metallic shimmer, a falling zing. */
const sting: Recipe = (k, o, t) => {
  const prick = noise(k, t, 0.03)
  prick.connect(band(k, 'highpass', 3800)).connect(band(k, 'bandpass', 7000, 1)).connect(env(k, t, 0.55, 0.0004, 0.012)).connect(o.dry)
  const sh = gain(k, 1)
  sh.connect(o.dry)
  sh.connect(gain(k, 0.6)).connect(o.verb)
  const f = 2950 + 120 * k.rand()
  ring(k, sh, t, f, [[1, 1, 0.3], [1.02, 0.7, 0.26], [1.414, 0.45, 0.2], [2.13, 0.3, 0.12], [3.7, 0.15, 0.07]], 0.14)
  const zing = tone(k, 'sine', 1900, t + 0.005, 0.3)
  sweep(zing.frequency, t + 0.005, 1900, 640, 0.2)
  zing.connect(env(k, t + 0.005, 0.24, 0.002, 0.22)).connect(o.dry)
  // A little weight under it.
  const kick = tone(k, 'sine', 180, t, 0.12)
  sweep(kick.frequency, t, 190, 85, 0.05)
  kick.connect(env(k, t, 0.36, 0.001, 0.08)).connect(o.dry)
  return 0.45
}

export const ENEMY_RECIPES = {
  'walldorf-wake': wake,
  'walldorf-charge': charge,
  'walldorf-bump': bump,
  'walldorf-slam': slam,
  'prickbait-alert': alert,
  'prickbait-sting': sting
} satisfies Record<string, Recipe>

export type EnemySfxName = keyof typeof ENEMY_RECIPES

/** Per-sound trim (linear), so the hierarchy holds against the kit's sounds:
 *  a bump under a death hit, a slam about level with it, the telegraphs (wake,
 *  alert) clearly audible but under the umbrella's own open/close. */
export const ENEMY_TRIM: Record<EnemySfxName, number> = {
  'walldorf-wake': 1.8,
  'walldorf-charge': 1.25,
  'walldorf-bump': 1.25,
  'walldorf-slam': 1.45,
  'prickbait-alert': 2.2,
  'prickbait-sting': 1.4
}

/** Music duck under the big ones: [dB, hold s]. */
const ENEMY_DUCK: Partial<Record<EnemySfxName, [number, number]>> = {
  'walldorf-slam': [-5, 0.4],
  'walldorf-charge': [-3, 0.5]
}

// ─── The bed: continuous enemy presence ────────────────────────────────────

/** What the scene reports about the enemies around Pweeg, each frame. */
export interface EnemyBedState {
  /** 0..1 — how close the nearest Prickbait is. */
  mine: number
  /** 0..1 — how fast it moves (its spikes whistle higher). */
  mineSpeed: number
  minePan: number
  /** 0..1 — a following Walldorf sliding after Pweeg (speed × closeness). */
  rumble: number
  rumblePan: number
  /** 0..1 — how close the nearest angry (charging) Walldorf is. */
  angry: number
  angryPan: number
}

export const ENEMY_BED_IDLE: EnemyBedState = { mine: 0, mineSpeed: 0, minePan: 0, rumble: 0, rumblePan: 0, angry: 0, angryPan: 0 }

export interface EnemyBed {
  set: (s: EnemyBedState, at: number, smooth?: number) => void
}

/** How far ahead the fuse ticks are written (s). */
const TICK_AHEAD = 0.12

export const createEnemyBed = (k: EnemyKit, out: AudioNode, t0: number): EnemyBed => {
  const { ctx } = k
  const loop = (buf: AudioBuffer) => {
    const s = ctx.createBufferSource()
    s.buffer = buf
    s.loop = true
    s.start(t0, k.rand() * (buf.duration - 0.1))
    return s
  }
  const lfo = (freq: number, depth: number, target: AudioParam, type: OscillatorType = 'sine') => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    o.connect(gain(k, depth)).connect(target)
    o.start(t0)
    return o
  }
  const panner = () => {
    const p = ctx.createStereoPanner()
    p.connect(out)
    return p
  }
  const pink = loop(k.pink)
  const white = loop(k.white)

  // Prickbait: wind whistling through the spikes — two thin bands an eerie interval apart.
  const minePan = panner()
  const mineAir = gain(k, 0)
  mineAir.connect(minePan)
  const whistleA = band(k, 'bandpass', 2300, 22)
  const whistleB = band(k, 'bandpass', 2300 * 1.335, 26)
  lfo(5.2, 40, whistleA.frequency)
  lfo(4.1, 55, whistleB.frequency)
  white.connect(whistleA).connect(mineAir)
  white.connect(whistleB).connect(gain(k, 0.7)).connect(mineAir)
  // The fuse ticks: scheduled one by one, faster the closer he is.
  const ticks = gain(k, 1)
  ticks.connect(minePan)
  let nextTick = 0

  const tick = (at: number, level: number) => {
    const n = ctx.createBufferSource()
    n.buffer = k.white
    n.start(at, k.rand() * (k.white.duration - 0.1))
    n.stop(at + 0.03)
    n.connect(band(k, 'bandpass', 4300 + 500 * k.rand(), 5)).connect(env(k, at, level, 0.0005, 0.018)).connect(ticks)
    const ping = ctx.createOscillator()
    ping.frequency.value = 2450
    ping.start(at)
    ping.stop(at + 0.06)
    ping.connect(env(k, at, level * 0.35, 0.0005, 0.035)).connect(ticks)
  }

  // Angry Walldorf: a slow, low breathing growl.
  const angryPan = panner()
  const angry = gain(k, 0)
  angry.connect(angryPan)
  const breathAm = gain(k, 0.5)
  lfo(0.62, 0.45, breathAm.gain)
  const growl = ctx.createOscillator()
  growl.type = 'sawtooth'
  growl.frequency.value = midiHz(33) // A1, the score's dominant, an octave down
  growl.start(t0)
  const growlLp = band(k, 'lowpass', 180, 1.4)
  lfo(0.62, 50, growlLp.frequency)
  growl.connect(growlLp).connect(breathAm)
  pink.connect(band(k, 'bandpass', 420, 2.5)).connect(gain(k, 0.5)).connect(breathAm)
  breathAm.connect(angry)

  // Following Walldorf: a soft heavy rumble and a grinding scrape while it slides.
  const rumblePan = panner()
  const rumble = gain(k, 0)
  rumble.connect(rumblePan)
  const shuffle = gain(k, 0.6)
  lfo(3.4, 0.4, shuffle.gain, 'triangle')
  pink.connect(band(k, 'lowpass', 140, 1.5)).connect(shuffle)
  const hum = ctx.createOscillator()
  hum.frequency.value = midiHz(38) // D2
  hum.start(t0)
  hum.connect(gain(k, 0.35)).connect(shuffle)
  shuffle.connect(rumble)
  const scrape = gain(k, 0.12)
  lfo(7.3, 0.1, scrape.gain, 'triangle')
  pink.connect(band(k, 'bandpass', 320, 3)).connect(scrape).connect(rumble)

  const to = (p: AudioParam, v: number, at: number, tc: number) => p.setTargetAtTime(v, at, tc)
  const pan = (v: number) => Math.max(-0.8, Math.min(0.8, v))

  return {
    set: (s, at, smooth = 0.08) => {
      const m = clamp01(s.mine)
      const ms = clamp01(s.mineSpeed)
      to(minePan.pan, pan(s.minePan), at, 0.08)
      to(mineAir.gain, 0.05 * m * m * (1 + 0.6 * ms), at, smooth)
      to(whistleA.frequency, 2300 + 1400 * ms, at, smooth * 2)
      to(whistleB.frequency, (2300 + 1400 * ms) * 1.335, at, smooth * 2)
      if (m > 0.03) {
        const rate = 1.6 + 8.4 * Math.pow(m, 1.5) + 2.5 * ms
        const level = 0.1 + 0.32 * Math.pow(m, 1.3)
        if (nextTick < at) nextTick = at + 0.02
        while (nextTick < at + TICK_AHEAD) {
          tick(nextTick, level)
          nextTick += 1 / rate
        }
      } else nextTick = 0
      to(angryPan.pan, pan(s.angryPan), at, 0.15)
      to(angry.gain, 0.2 * Math.pow(clamp01(s.angry), 1.6), at, smooth * 3)
      to(rumblePan.pan, pan(s.rumblePan), at, 0.15)
      to(rumble.gain, 0.22 * Math.pow(clamp01(s.rumble), 1.2), at, smooth * 2)
    }
  }
}

// ─── The player: one-shots and the bed on an engine's SFX bus ──────────────

/** What the enemy sounds need from the sound engine. */
export interface EnemyHost {
  ctx: BaseAudioContext
  mix: { sfx: EnemyOut }
  duck?: (db: number, hold: number, at?: number) => void
}

export interface EnemySounds {
  play: (name: EnemySfxName, params?: EnemySfxParams, at?: number) => void
  /** Start the continuous layers (idempotent). */
  startBed: (at?: number) => void
  setBed: (s: EnemyBedState, at?: number) => void
  /** Silence and drop every one-shot still ringing. */
  killVoices: () => void
  readonly activeVoices: number
}

/** Bed level into the SFX bus. */
const BED_TRIM = 1.4

export const createEnemySounds = (host: EnemyHost, seed = 1): EnemySounds => {
  const { ctx } = host
  const kit = createEnemyKit(ctx, seed)
  type Voice = { gains: GainNode[]; until: number }
  const voices = new Set<Voice>()
  let bed: EnemyBed | null = null
  let bedIn: GainNode | null = null
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
  const retire = (v: Voice) => {
    for (const g of v.gains) {
      g.gain.cancelScheduledValues(now())
      g.gain.setTargetAtTime(0, now(), 0.008)
    }
    voices.delete(v)
    setTimeout(() => { for (const g of v.gains) g.disconnect() }, 80)
  }

  return {
    play: (name, params = {}, at = now()) => {
      prune()
      const trim = ENEMY_TRIM[name]
      const dry = ctx.createGain()
      dry.gain.value = trim
      const pan = ctx.createStereoPanner()
      pan.pan.value = Math.max(-1, Math.min(1, params.pan ?? 0))
      dry.connect(pan).connect(host.mix.sfx.dry)
      const air = ctx.createGain()
      air.gain.value = 0.18
      pan.connect(air).connect(host.mix.sfx.verb)
      const verb = ctx.createGain()
      verb.gain.value = trim
      verb.connect(host.mix.sfx.verb)
      const len = ENEMY_RECIPES[name](kit, { dry, verb }, at, params)
      voices.add({ gains: [dry, verb], until: at + len + 1.4 })
      const d = ENEMY_DUCK[name]
      if (d) host.duck?.(d[0], d[1], at + (name === 'walldorf-charge' ? Math.max(0, params.lead ?? 0) : 0))
    },
    startBed: (at = now()) => {
      if (bed) return
      bedIn = ctx.createGain()
      bedIn.gain.value = BED_TRIM
      bedIn.connect(host.mix.sfx.dry)
      bed = createEnemyBed(kit, bedIn, at)
      bed.set(ENEMY_BED_IDLE, at)
    },
    setBed: (s, at = now()) => bed?.set(s, at),
    killVoices: () => {
      for (const v of voices) retire(v)
      // The bed's scheduled fuse ticks are at most TICK_AHEAD out: let the mute gain take them.
      if (bed) bed.set(ENEMY_BED_IDLE, now(), 0.01)
    },
    get activeVoices() {
      prune()
      return voices.size
    }
  }
}

// ─── Cues: the game world → what to play ───────────────────────────────────
//
// The engine reports bumps and hits as events; everything else (a lunge about
// to strike, a Walldorf waking up, a mine coming close) is read from the world
// each tick. Pure, so tests drive it headless.

export interface EnemyCue {
  name: EnemySfxName
  params: EnemySfxParams
}

/** Wind-up tell before a cyclic lunge's strike (s, real time; capped by its rest). */
export const CHARGE_TELL = 0.45
/** An angry Walldorf wakes when Pweeg comes this close to it (px from its edge). */
export const WAKE_RANGE = 380
/** A mine's alert sounds once at this closeness (0..1), re-armed below `ALERT_REARM`. */
const ALERT_AT = 0.4
const ALERT_REARM = 0.12
/** Distances (px from the enemy's edge) at which the bed layers start. */
const MINE_RANGE = 300
const ANGRY_RANGE = 420
const RUMBLE_RANGE = 520
const HEAR_RANGE = 700

export interface EnemyCueTracker {
  /** Call once per simulation tick, after `step`, with its events. */
  tick: (w: World, events: readonly GameEvent[], t: Tuning) => EnemyCue[]
  /** The bed's state for this world (idle outside play). */
  bed: (w: World, t: Tuning, dt: number) => EnemyBedState
}

/** Distance from (cx, cy) to a hazard's box (0 inside). */
const edgeDist = (h: { x: number; y: number; w: number; h: number; kind: string }, cx: number, cy: number): number => {
  if (h.kind === 'mine') return Math.max(0, Math.hypot(h.x + h.w / 2 - cx, h.y + h.h / 2 - cy) - h.w / 2)
  return Math.hypot(Math.max(h.x - cx, 0, cx - h.x - h.w), Math.max(h.y - cy, 0, cy - h.y - h.h))
}

export const createEnemyCues = (): EnemyCueTracker => {
  let world: World | null = null
  let prevEnemy = 0
  let awake: boolean[] = []
  let alerted: boolean[] = []
  let lungeAt: (number | undefined)[] = []
  let lastWake = -Infinity

  const reset = (w: World) => {
    world = w
    prevEnemy = w.enemyTime
    awake = w.hazards.map(() => false)
    alerted = w.hazards.map(() => false)
    lungeAt = w.hazards.map(() => undefined)
    lastWake = -Infinity
  }

  return {
    tick: (w, events, t) => {
      if (w !== world) reset(w)
      const cues: EnemyCue[] = []
      const prev = prevEnemy
      const now = w.enemyTime
      prevEnemy = now
      const pl = w.player
      const cx = pl.x + pl.w / 2
      const cy = pl.y + pl.h / 2
      const stagePan = ((cx / w.level.world.w) * 2 - 1) * 0.6
      const scale = Math.max(0.05, t.enemySpeedScale)

      // Bumps and stings (the engine's events).
      for (const e of events) {
        if (e === 'bump' || e === 'charge-bump') {
          const speed = Math.hypot(pl.vx, pl.vy)
          const base = Math.max(1, t.walldorfBounce)
          if (e === 'bump') cues.push({ name: 'walldorf-bump', params: { intensity: clamp01(speed / (base * 1.6)), pan: stagePan } })
          else cues.push({ name: 'walldorf-slam', params: { intensity: clamp01((speed - base) / (base * 1.5)), pan: stagePan } })
        } else if (e === 'hit') {
          let best: (typeof w.hazards)[number] | undefined
          let bestD = Infinity
          for (const h of w.hazards) {
            const d = edgeDist(h, cx, cy)
            if (d < bestD) { bestD = d; best = h }
          }
          if (best?.kind === 'mine') cues.push({ name: 'prickbait-sting', params: { pan: stagePan } })
        }
      }
      if (w.phase !== 'play') {
        for (let i = 0; i < w.hazards.length; i++) lungeAt[i] = w.hazards[i]!.lungeAt
        return cues
      }

      for (let i = 0; i < w.hazards.length; i++) {
        const h = w.hazards[i]!
        const hx = h.x + h.w / 2
        const d = edgeDist(h, cx, cy)
        const pan = Math.max(-0.8, Math.min(0.8, (hx - cx) / 500))
        const near = clamp01(1 - d / HEAR_RANGE)
        if (h.kind === 'mine') {
          const close = clamp01(1 - d / MINE_RANGE)
          if (!alerted[i] && close >= ALERT_AT) {
            alerted[i] = true
            cues.push({ name: 'prickbait-alert', params: { intensity: close, pan } })
          } else if (alerted[i] && close < ALERT_REARM) alerted[i] = false
          continue
        }
        if (h.kind !== 'pillar') continue
        const m = h.motion
        if (m?.kind !== 'lunge') continue
        // An angry Walldorf notices Pweeg coming.
        const range = m.trigger ? (m.reach ?? m.radius ?? 300) * 1.4 : WAKE_RANGE
        const dWake = m.trigger ? Math.hypot(cx - m.a.x, cy - m.a.y) : d
        if (!awake[i] && dWake <= range) {
          awake[i] = true
          if (w.time - lastWake > 0.3) {
            lastWake = w.time
            cues.push({ name: 'walldorf-wake', params: { intensity: clamp01(1 - dWake / range + 0.4), pan } })
          }
        } else if (awake[i] && dWake > range * 1.35) awake[i] = false
        // The charge, timed so its whoosh starts with the strike and its thud lands at full reach.
        const speed = Math.max(0.05, m.speed ?? 1)
        const strikeFrac = Math.min(1, t.lungeRest + t.lungeStrike / speed) - t.lungeRest
        const strike = (strikeFrac * m.period) / scale
        if (m.trigger) {
          if (lungeAt[i] === undefined && h.lungeAt !== undefined) {
            cues.push({ name: 'walldorf-charge', params: { intensity: near, lead: 0, strike, pan } })
          }
          lungeAt[i] = h.lungeAt
        } else if (now > prev && m.period > 0) {
          const restReal = (t.lungeRest * m.period) / scale
          const lead = Math.min(CHARGE_TELL, restReal * 0.85)
          const off = t.lungeRest * m.period - lead * scale
          const cycle = (x: number) => Math.floor((x - off) / m.period)
          if (cycle(now) > cycle(prev) && near > 0.02) {
            const strikeAt = (cycle(now) * m.period) + t.lungeRest * m.period
            cues.push({ name: 'walldorf-charge', params: { intensity: near, lead: Math.max(0, (strikeAt - now) / scale), strike, pan } })
          }
        }
      }
      return cues
    },
    bed: (w, t, dt) => {
      if (w.phase !== 'play') return ENEMY_BED_IDLE
      const pl = w.player
      const cx = pl.x + pl.w / 2
      const cy = pl.y + pl.h / 2
      const s: EnemyBedState = { ...ENEMY_BED_IDLE }
      const scale = Math.max(0.05, t.enemySpeedScale)
      for (const h of w.hazards) {
        const d = edgeDist(h, cx, cy)
        const pan = Math.max(-1, Math.min(1, (h.x + h.w / 2 - cx) / 400))
        if (h.kind === 'mine') {
          const near = clamp01(1 - d / MINE_RANGE)
          if (near > s.mine) {
            s.mine = near
            s.mineSpeed = clamp01(Math.hypot(h.dx, h.dy) / dt / 600)
            s.minePan = pan
          }
        } else if (h.kind === 'pillar') {
          const m = h.motion
          if (m?.kind === 'lunge') {
            const near = clamp01(1 - d / ANGRY_RANGE)
            if (near > s.angry) { s.angry = near; s.angryPan = pan }
          } else if (m?.kind === 'follow') {
            const moving = clamp01(Math.hypot(h.dx, h.dy) / dt / Math.max(20, m.speed * scale))
            const r = moving * clamp01(1 - d / RUMBLE_RANGE)
            if (r > s.rumble) { s.rumble = r; s.rumblePan = pan }
          }
        }
      }
      return s
    }
  }
}
