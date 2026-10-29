// ─── Umbrella sound kit: every sound as a Web Audio graph ──────────────────
//
// Pure Web Audio, no Vue, no assets: each recipe builds its graph into any
// BaseAudioContext, so the game plays it live (audio.ts) and the listening
// page / level report renders the very same code through an
// OfflineAudioContext (scripts/sfx/umbrella-sounds.html).
//
// The palette is air and cloth, not chiptune: filtered noise for wind and
// fabric, resonant clicks for the umbrella's runner and ribs, modal partials
// for anything that rings. Pitched sounds sit in the music's key (D major
// pentatonic) so a stinger never clashes with the score.

export const T60 = 6.9078 // ln(1000): tau = t60 / T60 decays to −60 dB at t60

/** mulberry32 — tiny, fast, seedable. */
export const prng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

// ─── Kit: one context, one PRNG, shared noise ───────────────────────────────

export interface Kit {
  ctx: BaseAudioContext
  rand: () => number
  /** 2 s of seeded white noise, loop-safe. */
  white: AudioBuffer
  /** 4 s of seeded pink noise, crossfaded so the loop seam is inaudible. */
  pink: AudioBuffer
}

/** `n` samples whose head is crossfaded with the tail, so looping is seamless. */
const loopSafe = (ctx: BaseAudioContext, seconds: number, gen: (i: number) => number): AudioBuffer => {
  const sr = ctx.sampleRate
  const n = Math.ceil(seconds * sr)
  const fade = Math.round(0.08 * sr)
  const raw = new Float32Array(n + fade)
  for (let i = 0; i < raw.length; i++) raw[i] = gen(i)
  const buf = ctx.createBuffer(1, n, sr)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) {
    const v = raw[i]!
    d[i] = i < fade ? v * (i / fade) + raw[n + i]! * (1 - i / fade) : v
  }
  return buf
}

export const createKit = (ctx: BaseAudioContext, seed: number): Kit => {
  const nr = prng(seed + 7)
  const white = loopSafe(ctx, 2, () => nr() * 2 - 1)
  // Paul Kellet's economy pink filter.
  let b0 = 0, b1 = 0, b2 = 0
  const pr = prng(seed + 11)
  const pink = loopSafe(ctx, 4, () => {
    const w = pr() * 2 - 1
    b0 = 0.99765 * b0 + w * 0.099046
    b1 = 0.963 * b1 + w * 0.2965164
    b2 = 0.57 * b2 + w * 1.0526913
    return (b0 + b1 + b2 + w * 0.1848) * 0.25
  })
  return { ctx, rand: prng(seed), white, pink }
}

// ─── Primitives ────────────────────────────────────────────────────────────

const between = (k: Kit, a: number, b: number): number => a + (b - a) * k.rand()

export const gainNode = (k: Kit, value = 1): GainNode => {
  const g = k.ctx.createGain()
  g.gain.value = value
  return g
}

export const filter = (k: Kit, type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode => {
  const f = k.ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

/** A noise source that plays from `t0` for `dur` s at a random offset. */
export const noise = (k: Kit, t0: number, dur: number, buf: AudioBuffer = k.white): AudioBufferSourceNode => {
  const s = k.ctx.createBufferSource()
  s.buffer = buf
  s.loop = true
  s.start(t0, k.rand() * (buf.duration - 0.1))
  s.stop(t0 + dur)
  return s
}

export const osc = (k: Kit, type: OscillatorType, freq: number, t0: number, dur: number): OscillatorNode => {
  const o = k.ctx.createOscillator()
  o.type = type
  o.frequency.value = freq
  o.start(t0)
  o.stop(t0 + dur)
  return o
}

/** Attack to `peak`, then exponential decay to −60 dB at `t60` after the attack. */
export const envAD = (param: AudioParam, t0: number, peak: number, attack: number, t60: number): void => {
  param.value = 0
  param.setValueAtTime(0, t0)
  param.linearRampToValueAtTime(peak, t0 + attack)
  param.setTargetAtTime(0, t0 + attack, t60 / T60)
}

export const gainAD = (k: Kit, t0: number, peak: number, attack: number, t60: number): GainNode => {
  const g = k.ctx.createGain()
  envAD(g.gain, t0, peak, attack, t60)
  return g
}

/** Exponential sweep of a frequency param from `f0` to `f1` over `dur`. */
const sweep = (p: AudioParam, t0: number, f0: number, f1: number, dur: number): void => {
  p.setValueAtTime(f0, t0)
  p.exponentialRampToValueAtTime(f1, t0 + dur)
}

/** Where a recipe sends its sound: dry and into the room. */
export interface Out {
  dry: AudioNode
  verb: AudioNode
}

/** A tiny transient: `ms` of noise through a band — runner ticks, rib clicks, latches. */
const click = (k: Kit, out: AudioNode, t0: number, freq: number, q: number, peak: number, ms = 3): void => {
  const n = noise(k, t0, ms / 1000 + 0.03)
  const g = gainAD(k, t0, peak, 0.0005, ms / 1000 * 4)
  n.connect(filter(k, 'bandpass', freq, q)).connect(g).connect(out)
}

/** Modal ring: inharmonic partials with their own decays (metal, glass, bells). */
const ring = (
  k: Kit, out: AudioNode, t0: number, f: number, partials: [ratio: number, amp: number, t60: number][], peak: number, attack = 0.001
): void => {
  for (const [ratio, amp, t60] of partials) {
    const o = osc(k, 'sine', f * ratio, t0, t60 + attack + 0.05)
    o.connect(gainAD(k, t0, peak * amp, attack, t60)).connect(out)
  }
}

// ─── Room: generated impulse responses ─────────────────────────────────────

/**
 * A stereo room with decorrelated sides: bright early energy over a darker,
 * longer body, after `pre` s of pre-delay. Open sky has no walls, so the sfx
 * room is short and diffuse; the music room is a long soft hall.
 */
export const makeImpulse = (ctx: BaseAudioContext, seed: number, seconds: number, bright: number, dark: number, pre = 0.012): AudioBuffer => {
  const sr = ctx.sampleRate
  const n = Math.ceil(seconds * sr)
  const buf = ctx.createBuffer(2, n, sr)
  const p0 = Math.round(pre * sr)
  for (let ch = 0; ch < 2; ch++) {
    const r = prng(seed + ch * 101)
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = p0; i < n; i++) {
      const t = (i - p0) / sr
      const w = r() * 2 - 1
      lp += 0.1 * (w - lp)
      const build = Math.min(1, t / 0.02)
      const tail = Math.min(1, (n - i) / (0.05 * sr))
      d[i] = (0.45 * w * Math.exp((-T60 / bright) * t) + 1.2 * lp * Math.exp((-T60 / dark) * t)) * build * tail
    }
  }
  return buf
}

// ─── Mix: buses, rooms, limiter, mute ──────────────────────────────────────

export interface Mix {
  sfx: Out
  ambience: AudioNode
  music: Out
  /** Briefly pulled down under big moments (break, splat, win). */
  musicDuck: GainNode
  sfxVol: GainNode
  ambienceVol: GainNode
  musicVol: GainNode
  masterVol: GainNode
  /** The LAST gain before the speakers: 0 = silent, whatever the buses do. */
  mute: GainNode
  /** Tap after the mute gain, for level checks and the mute regression test. */
  meter: AnalyserNode
}

export const createMix = (ctx: BaseAudioContext, dest: AudioNode, seed = 1): Mix => {
  const g = (v = 1) => {
    const n = ctx.createGain()
    n.gain.value = v
    return n
  }
  const sum = g()
  // Safety limiter: only the rare pile-up (splat + slam + whistle) reaches it.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.12
  const masterVol = g(1)
  const mute = g(1)
  const meter = ctx.createAnalyser()
  meter.fftSize = 2048
  sum.connect(limiter).connect(masterVol).connect(mute).connect(dest)
  mute.connect(meter)

  // SFX: dry + a short, diffuse "open air" room.
  const sfxVol = g(1)
  sfxVol.connect(sum)
  const sfxDry = g()
  sfxDry.connect(sfxVol)
  const sfxRoom = ctx.createConvolver()
  sfxRoom.buffer = makeImpulse(ctx, seed + 3, 1.3, 0.35, 1.1, 0.018)
  const sfxVerb = g()
  sfxVerb.connect(sfxRoom).connect(g(0.55)).connect(sfxVol)

  const ambienceVol = g(1)
  ambienceVol.connect(sum)
  const ambience = g()
  ambience.connect(ambienceVol)

  // Music: its own long hall, ducked and levelled as one.
  const musicVol = g(1)
  musicVol.connect(sum)
  const musicDuck = g(1)
  musicDuck.connect(musicVol)
  const musicDry = g()
  musicDry.connect(musicDuck)
  const hall = ctx.createConvolver()
  hall.buffer = makeImpulse(ctx, seed + 5, 4.2, 1.1, 3.6, 0.03)
  const musicVerb = g()
  // Keep mud out of the hall: no sub, a gentle top.
  musicVerb.connect(filterRaw(ctx, 'highpass', 180)).connect(filterRaw(ctx, 'lowpass', 6500)).connect(hall).connect(g(0.8)).connect(musicDuck)

  return {
    sfx: { dry: sfxDry, verb: sfxVerb },
    ambience,
    music: { dry: musicDry, verb: musicVerb },
    musicDuck,
    sfxVol,
    ambienceVol,
    musicVol,
    masterVol,
    mute,
    meter
  }
}

const filterRaw = (ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode => {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

// ─── One-shot recipes ──────────────────────────────────────────────────────
//
// Each takes the kit, where to play (already panned and gained by the
// caller), the start time and its own parameters, and returns how long it
// rings — so the caller can retire the voice.

export interface SfxParams {
  /** 0..1 — how hard: fall speed for open/land, impact for splat. */
  intensity?: number
  /** Open/close: toggled again within a moment — a lighter flick. */
  quick?: boolean
  /** Close: the automatic fold on landing. */
  auto?: boolean
  /** Hit: what was touched. */
  hazard?: 'pillar' | 'mine' | 'spikes'
  /** Whistle: seconds to fade to silence. */
  fade?: number
  /** Lunge: seconds of wind-up tell before the strike lands. */
  lead?: number
  /** Arrive: seconds the enemy takes to glide in. */
  duration?: number
}

type Recipe = (k: Kit, o: Out, t: number, p: SfxParams) => number

/**
 * OPEN — the runner zips up the shaft, the latch clicks, the canopy snaps
 * taut and swallows a pocket of air. Opened at speed, the catch is a big
 * "whump" with the brake of the wind behind it.
 */
const open: Recipe = (k, o, t, p) => {
  const v = clamp01(p.intensity ?? 0)
  const lvl = p.quick ? 0.7 : 1
  // Runner sliding up the shaft: a short rising zip plus three or four ticks.
  if (!p.quick) {
    const zip = noise(k, t, 0.08)
    const bp = filter(k, 'bandpass', 1800, 2.2)
    sweep(bp.frequency, t, 1600, 3800, 0.055)
    zip.connect(bp).connect(gainAD(k, t, 0.09, 0.008, 0.07)).connect(o.dry)
    const ticks = 3 + Math.floor(k.rand() * 2)
    for (let i = 0; i < ticks; i++) click(k, o.dry, t + 0.008 + i * between(k, 0.011, 0.015), between(k, 3000, 4800), 3, 0.11 + i * 0.03)
  }
  // The latch: a crisp catch with a short metallic ring.
  const tl = t + (p.quick ? 0 : 0.058)
  click(k, o.dry, tl, between(k, 4200, 5200), 4, 0.32 * lvl, 2)
  ring(k, o.dry, tl, between(k, 2850, 3050), [[1, 1, 0.05], [2.41, 0.4, 0.03]], 0.035 * lvl)
  // Canopy snapping taut: fabric crack, then the fill — a falling low-pass whump.
  const tc = tl + 0.006
  const snap = noise(k, tc, 0.06)
  snap.connect(filter(k, 'bandpass', between(k, 1300, 1700), 0.9)).connect(gainAD(k, tc, 0.36 * lvl, 0.002, 0.05)).connect(o.dry)
  // …then the air fills it, a beat behind the snap.
  const tf = tc + 0.012
  const fill = noise(k, tf, 0.45, k.pink)
  const lp = filter(k, 'lowpass', 3500, 1.2)
  sweep(lp.frequency, tf, 3200 + 1200 * v, 380, 0.14 + 0.08 * v)
  const fillG = gainAD(k, tf, (0.6 + 0.3 * v) * lvl, 0.016, 0.2 + 0.25 * v)
  fill.connect(lp).connect(fillG)
  fillG.connect(o.dry)
  fillG.connect(o.verb)
  // The air pocket: a soft low thump (A2 falling to A1).
  const th = osc(k, 'sine', 110, tf, 0.35)
  sweep(th.frequency, tf, 112, 55, 0.12)
  th.connect(gainAD(k, tf, (0.16 + 0.18 * v) * lvl, 0.012, 0.2)).connect(o.dry)
  // Caught at speed: the wind brakes against the canopy.
  if (v > 0.15) {
    const brake = noise(k, tc, 0.7, k.pink)
    const bb = filter(k, 'bandpass', 700, 0.8)
    sweep(bb.frequency, tc, 900, 260, 0.5)
    const bg = gainAD(k, tc, 0.3 * v, 0.04, 0.45)
    brake.connect(bb).connect(bg)
    bg.connect(o.dry)
    bg.connect(o.verb)
  }
  return 0.75
}

/** CLOSE — the canopy collapses with a soft "fshh", two ribs fold home. */
const close: Recipe = (k, o, t, p) => {
  const lvl = p.auto ? 0.5 : p.quick ? 0.75 : 1
  const n = noise(k, t, 0.22, k.pink)
  const bp = filter(k, 'bandpass', 900, 0.8)
  sweep(bp.frequency, t, 700, 2600, 0.11)
  const g = k.ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.42 * lvl, t + 0.035)
  g.gain.setTargetAtTime(0, t + 0.05, 0.035)
  n.connect(bp).connect(g).connect(o.dry)
  // Air pushed out as the fabric folds: a tiny downward puff.
  const puff = osc(k, 'sine', 140, t + 0.01, 0.15)
  sweep(puff.frequency, t + 0.01, 150, 80, 0.08)
  puff.connect(gainAD(k, t + 0.01, 0.12 * lvl, 0.006, 0.08)).connect(o.dry)
  // Ribs folding home and the runner sliding down.
  click(k, o.dry, t + 0.05, between(k, 2000, 2600), 2.5, 0.18 * lvl, 3)
  click(k, o.dry, t + between(k, 0.075, 0.09), between(k, 1600, 2100), 2.5, 0.14 * lvl, 3)
  if (!p.auto) ring(k, o.dry, t + 0.08, between(k, 2300, 2450), [[1, 1, 0.035]], 0.02 * lvl)
  return 0.3
}

/**
 * BREAK — reopened at terminal velocity, the canopy blows inside-out: a
 * cloth crack, ribs snapping, a bent spring wobbling, and the torn fabric
 * flapping out of control as the air rushes through it.
 */
const breakUmbrella: Recipe = (k, o, t) => {
  // Inside-out crack.
  const crack = noise(k, t, 0.2)
  crack.connect(filter(k, 'highpass', 500)).connect(filter(k, 'peaking', 1600, 0.8)).connect(gainAD(k, t, 0.65, 0.001, 0.11)).connect(o.dry)
  const pop = osc(k, 'sine', 180, t, 0.2)
  sweep(pop.frequency, t, 190, 60, 0.09)
  pop.connect(gainAD(k, t, 0.3, 0.002, 0.13)).connect(o.dry)
  // Ribs snapping: four bright clicks, each with a short inharmonic ring.
  for (let i = 0; i < 4; i++) {
    const ti = t + 0.01 + i * between(k, 0.03, 0.06)
    click(k, o.dry, ti, between(k, 3500, 6000), 3, 0.3, 2)
    ring(k, o.dry, ti, between(k, 1400, 2600), [[1, 1, 0.09], [2.71, 0.5, 0.06], [5.13, 0.25, 0.04]], 0.05)
  }
  // The bent spring: an FM "boing" sagging down a fifth with a wobble.
  const tb = t + 0.04
  const car = osc(k, 'sine', 300, tb, 0.8)
  const mod = osc(k, 'sine', 300 * 1.41, tb, 0.8)
  const idx = k.ctx.createGain()
  idx.gain.setValueAtTime(300 * 1.8, tb)
  idx.gain.exponentialRampToValueAtTime(30, tb + 0.6)
  mod.connect(idx).connect(car.frequency)
  sweep(car.frequency, tb, 330, 196, 0.55)
  sweep(mod.frequency, tb, 330 * 1.41, 196 * 1.41, 0.55)
  const wob = osc(k, 'sine', 11, tb, 0.8)
  const wobD = gainNode(k, 14)
  wob.connect(wobD).connect(car.frequency)
  const boingG = gainAD(k, tb, 0.14, 0.004, 0.65)
  car.connect(filter(k, 'lowpass', 2200)).connect(boingG)
  boingG.connect(o.dry)
  boingG.connect(o.verb)
  // Torn canopy flapping in the rush: noise chopped by a slowing flutter.
  const tf = t + 0.03
  const flap = noise(k, tf, 0.9, k.pink)
  const am = gainNode(k, 0.5)
  const lfo = osc(k, 'triangle', 17, tf, 0.9)
  lfo.frequency.setValueAtTime(19, tf)
  lfo.frequency.exponentialRampToValueAtTime(7, tf + 0.8)
  const lfoD = gainNode(k, 0.5)
  lfo.connect(lfoD).connect(am.gain)
  const flapG = gainAD(k, tf, 0.5, 0.01, 0.75)
  flap.connect(filter(k, 'bandpass', 1100, 0.9)).connect(am).connect(flapG)
  flapG.connect(o.dry)
  flapG.connect(o.verb)
  // Air rushing through the wreck: a falling, sighing whistle.
  const sigh = noise(k, t, 0.7)
  const sb = filter(k, 'bandpass', 2000, 7)
  sweep(sb.frequency, t, 2400, 600, 0.6)
  sigh.connect(sb).connect(gainAD(k, t, 0.22, 0.03, 0.55)).connect(o.verb)
  return 1.1
}

/** LAND — soft shoes on a platform; the harder the drop, the heavier the thud. */
const land: Recipe = (k, o, t, p) => {
  const v = clamp01(p.intensity ?? 0.2)
  const th = osc(k, 'sine', 150, t, 0.2)
  sweep(th.frequency, t, between(k, 140, 165), 62, 0.07)
  th.connect(gainAD(k, t, 0.22 + 0.5 * v, 0.002, 0.09 + 0.08 * v)).connect(o.dry)
  const tap = noise(k, t, 0.06)
  tap.connect(filter(k, 'lowpass', 1400 + 1000 * v, 0.9)).connect(gainAD(k, t, 0.28 + 0.4 * v, 0.001, 0.035)).connect(o.dry)
  const scuff = noise(k, t + 0.004, 0.1)
  scuff.connect(filter(k, 'bandpass', between(k, 2600, 3400), 1)).connect(gainAD(k, t + 0.004, 0.05 + 0.06 * v, 0.004, 0.06)).connect(o.dry)
  if (v > 0.45) {
    // A heavy landing: the second foot, and a puff of dust.
    land2(k, o, t + between(k, 0.035, 0.05), v)
    const dust = noise(k, t, 0.35, k.pink)
    dust.connect(filter(k, 'lowpass', 900)).connect(gainAD(k, t, 0.14 * v, 0.01, 0.25)).connect(o.dry)
  }
  return 0.4
}
const land2 = (k: Kit, o: Out, t: number, v: number) => {
  const th = osc(k, 'sine', 130, t, 0.15)
  sweep(th.frequency, t, 130, 60, 0.06)
  th.connect(gainAD(k, t, 0.3 * v, 0.002, 0.08)).connect(o.dry)
}

/** STEP — a soft footfall while walking; quiet enough to sit under everything. */
const step: Recipe = (k, o, t, p) => {
  const lvl = 0.6 + 0.4 * clamp01(p.intensity ?? 1)
  const tap = noise(k, t, 0.04)
  tap.connect(filter(k, 'bandpass', between(k, 1300, 2100), 1.3)).connect(gainAD(k, t, 0.16 * lvl, 0.001, 0.03)).connect(o.dry)
  const th = osc(k, 'sine', between(k, 170, 200), t, 0.08)
  th.connect(gainAD(k, t, 0.12 * lvl, 0.002, 0.045)).connect(o.dry)
  return 0.12
}

/**
 * SPLAT — the cartoon pancake: a heavy body thump, a wet resonant "splut"
 * sweeping down, a scatter of droplets and the umbrella clattering after.
 */
const splat: Recipe = (k, o, t) => {
  const body = osc(k, 'sine', 120, t, 0.45)
  sweep(body.frequency, t, 135, 38, 0.22)
  body.connect(gainAD(k, t, 0.6, 0.002, 0.3)).connect(o.dry)
  const thud = noise(k, t, 0.2, k.pink)
  thud.connect(filter(k, 'lowpass', 500)).connect(gainAD(k, t, 0.6, 0.001, 0.13)).connect(o.dry)
  // The wet part: a resonant band falling fast, two formants for the "plut".
  for (const [f0, f1, q, a] of [[2600, 320, 3, 0.75], [1500, 500, 5, 0.4]] as const) {
    const s = noise(k, t + 0.004, 0.25)
    const bp = filter(k, 'bandpass', f0, q)
    sweep(bp.frequency, t + 0.004, f0, f1, 0.13)
    const sg = gainAD(k, t + 0.004, a, 0.002, 0.16)
    s.connect(bp).connect(sg)
    sg.connect(o.dry)
    sg.connect(o.verb)
  }
  // Droplets: tiny "plip"s, each a sine falling an octave in a few ms.
  const drops = 5
  for (let i = 0; i < drops; i++) {
    const td = t + 0.07 + k.rand() * 0.35
    const f = between(k, 700, 1500)
    const d = osc(k, 'sine', f, td, 0.08)
    d.frequency.setValueAtTime(f * 1.6, td)
    d.frequency.exponentialRampToValueAtTime(f, td + 0.018)
    d.connect(gainAD(k, td, between(k, 0.04, 0.09), 0.001, 0.05)).connect(o.dry)
  }
  // The umbrella clattering down after him.
  for (let i = 0; i < 3; i++) {
    const tc = t + 0.12 + i * between(k, 0.05, 0.09)
    click(k, o.dry, tc, between(k, 2400, 4000), 3, 0.12 - i * 0.025, 3)
    ring(k, o.dry, tc, between(k, 1700, 2300), [[1, 1, 0.07], [2.63, 0.5, 0.04]], 0.025)
  }
  return 0.9
}

/**
 * HIT — touched a creature or spikes: a sharp prick (mines, spikes) or a
 * rubbery bonk (pillars), then a puff as he vanishes back to the start.
 */
const hit: Recipe = (k, o, t, p) => {
  if (p.hazard === 'pillar') {
    const b = osc(k, 'sine', 260, t, 0.3)
    sweep(b.frequency, t, 280, 175, 0.12)
    b.connect(gainAD(k, t, 0.6, 0.002, 0.2)).connect(o.dry)
    const b2 = osc(k, 'triangle', 600, t, 0.12)
    sweep(b2.frequency, t, 640, 420, 0.06)
    b2.connect(filter(k, 'lowpass', 1500)).connect(gainAD(k, t, 0.2, 0.001, 0.06)).connect(o.dry)
    const n = noise(k, t, 0.08)
    n.connect(filter(k, 'lowpass', 900)).connect(gainAD(k, t, 0.5, 0.001, 0.04)).connect(o.dry)
  } else {
    click(k, o.dry, t, 5200, 2, 0.7, 2)
    ring(k, o.dry, t, between(k, 3150, 3300), [[1, 1, 0.16], [1.59, 0.5, 0.12], [2.83, 0.3, 0.07]], 0.09)
    const ouch = osc(k, 'sine', 420, t + 0.01, 0.25)
    sweep(ouch.frequency, t + 0.01, 440, 300, 0.15)
    ouch.connect(gainAD(k, t + 0.01, 0.38, 0.004, 0.16)).connect(o.dry)
  }
  // Poof: a puff of air sweeping up.
  const tp = t + 0.05
  const puff = noise(k, tp, 0.4, k.pink)
  const bp = filter(k, 'bandpass', 600, 1.1)
  sweep(bp.frequency, tp, 500, 2600, 0.22)
  const pg = gainAD(k, tp, 0.55, 0.012, 0.28)
  puff.connect(bp).connect(pg)
  pg.connect(o.dry)
  pg.connect(o.verb)
  return 0.7
}

/**
 * LUNGE — a pillar creature attacks. A rubbery creak and a sharp intake of
 * breath during the wind-up (`lead` s, the player's warning), then a heavy
 * air-cut whoosh as it strikes, and a soft slap of its body stopping.
 * `intensity` is how close it is to the player.
 */
const lunge: Recipe = (k, o, t, p) => {
  const v = 0.35 + 0.65 * clamp01(p.intensity ?? 1)
  const lead = Math.max(0.08, p.lead ?? 0.22)
  // Wind-up: a stretched-rubber creak (a pitched, gritty band rising)…
  const creak = noise(k, t, lead + 0.05)
  const cb = filter(k, 'bandpass', 380, 9)
  sweep(cb.frequency, t, 320, 620, lead)
  const cam = gainNode(k, 0.5)
  const grit = osc(k, 'square', 38, t, lead + 0.05)
  grit.connect(gainNode(k, 0.5)).connect(cam.gain)
  const cg = k.ctx.createGain()
  cg.gain.setValueAtTime(0, t)
  cg.gain.linearRampToValueAtTime(0.5 * v, t + lead * 0.85)
  cg.gain.linearRampToValueAtTime(0, t + lead + 0.03)
  creak.connect(cb).connect(cam).connect(cg).connect(o.dry)
  // …and an inhale: breathy noise swelling up into the strike.
  const inhale = noise(k, t, lead + 0.05, k.pink)
  const ib = filter(k, 'bandpass', 900, 1.4)
  sweep(ib.frequency, t, 700, 1800, lead)
  const ig = k.ctx.createGain()
  ig.gain.setValueAtTime(0, t)
  ig.gain.linearRampToValueAtTime(0.35 * v, t + lead)
  ig.gain.linearRampToValueAtTime(0, t + lead + 0.02)
  inhale.connect(ib).connect(ig).connect(o.dry)
  // Strike: a heavy whoosh, the air cut by a big body moving fast.
  const ts = t + lead
  const whoosh = noise(k, ts, 0.4, k.pink)
  const wb = filter(k, 'bandpass', 1400, 1.2)
  sweep(wb.frequency, ts, 1900, 260, 0.28)
  const wg = gainAD(k, ts, 0.9 * v, 0.012, 0.3)
  whoosh.connect(wb).connect(wg)
  wg.connect(o.dry)
  wg.connect(o.verb)
  const body = osc(k, 'sine', 95, ts, 0.3)
  sweep(body.frequency, ts, 120, 60, 0.2)
  body.connect(gainAD(k, ts, 0.3 * v, 0.01, 0.2)).connect(o.dry)
  // It stops dead at full reach: a soft rubbery slap.
  const tsl = ts + 0.13
  const slap = noise(k, tsl, 0.06)
  slap.connect(filter(k, 'bandpass', 700, 1.6)).connect(gainAD(k, tsl, 0.22 * v, 0.001, 0.05)).connect(o.dry)
  return lead + 0.6
}

/**
 * ARRIVE — an enemy flies in: a distant air-hiss growing and falling in
 * pitch as it closes (a little Doppler), then it settles. A mine whirs up
 * to a hover with a glassy ping; a pillar lands with a soft heavy thump.
 */
const arrive: Recipe = (k, o, t, p) => {
  const dur = Math.max(0.3, p.duration ?? 1.6)
  const approach = noise(k, t, dur + 0.1, k.pink)
  const ab = filter(k, 'bandpass', 2400, 2)
  sweep(ab.frequency, t, 2600, 700, dur)
  const ag = k.ctx.createGain()
  ag.gain.setValueAtTime(0.0001, t)
  ag.gain.exponentialRampToValueAtTime(0.01, t + 0.05)
  ag.gain.exponentialRampToValueAtTime(0.4, t + dur * 0.92)
  ag.gain.linearRampToValueAtTime(0, t + dur + 0.08)
  approach.connect(ab).connect(ag)
  ag.connect(o.dry)
  ag.connect(o.verb)
  const te = t + dur
  if (p.hazard === 'pillar') {
    const thump = osc(k, 'sine', 80, te, 0.35)
    sweep(thump.frequency, te, 95, 45, 0.25)
    thump.connect(gainAD(k, te, 0.45, 0.004, 0.28)).connect(o.dry)
    const dust = noise(k, te, 0.3, k.pink)
    dust.connect(filter(k, 'lowpass', 700)).connect(gainAD(k, te, 0.35, 0.002, 0.2)).connect(o.dry)
  } else {
    // Spin-up whirr into a hover, and a glassy ping as it locks in place.
    const whirr = osc(k, 'sawtooth', 70, te - 0.25, 0.6)
    sweep(whirr.frequency, te - 0.25, 60, 190, 0.3)
    whirr.connect(filter(k, 'bandpass', 1100, 4)).connect(gainAD(k, te - 0.2, 0.25, 0.15, 0.35)).connect(o.dry)
    const pg = gainNode(k, 1)
    pg.connect(o.dry)
    pg.connect(o.verb)
    ring(k, pg, te + 0.02, midiHz(pentaNote(7, 74)), [[1, 1, 0.9], [2.76, 0.35, 0.4], [5.4, 0.15, 0.2]], 0.12)
  }
  return dur + 1
}

/** A celesta / music-box note: bright attack, a few partials decaying apart. */
export const celesta = (k: Kit, out: AudioNode, t: number, f: number, peak: number): void => {
  ring(k, out, t, f, [[1, 1, 1.6], [2, 0.32, 0.7], [3, 0.1, 0.35], [4.2, 0.07, 0.18]], peak, 0.002)
  click(k, out, t, Math.min(9000, f * 3), 1.5, peak * 0.35, 2)
}

/** A wind chime: a tubular bell's inharmonic partials. */
export const chime = (k: Kit, out: AudioNode, t: number, f: number, peak: number): void => {
  ring(k, out, t, f, [[1, 1, 3.2], [2.76, 0.45, 1.8], [5.4, 0.22, 0.9], [8.93, 0.08, 0.45]], peak, 0.0015)
}

// D major pentatonic, the music's scale.
const PENTA = [0, 2, 4, 7, 9]
export const pentaNote = (degree: number, base = 62): number =>
  base + 12 * Math.floor(degree / 5) + PENTA[((degree % 5) + 5) % 5]!

/**
 * WIN — he lands on the finish: a whoosh of lift, a celesta arpeggio
 * climbing the D major chord, a warm swell and wind chimes shimmering
 * through the dance. In key with the score, so it blooms out of it.
 */
const win: Recipe = (k, o, t) => {
  const lift = noise(k, t, 0.6, k.pink)
  const lb = filter(k, 'bandpass', 500, 1)
  sweep(lb.frequency, t, 400, 3200, 0.4)
  const lg = k.ctx.createGain()
  lg.gain.setValueAtTime(0, t)
  lg.gain.linearRampToValueAtTime(0.16, t + 0.3)
  lg.gain.setTargetAtTime(0, t + 0.32, 0.06)
  lift.connect(lb).connect(lg).connect(o.verb)
  // D5 F#5 A5 D6 … and an E6 + F#6 bloom on top.
  const arp = [74, 78, 81, 86]
  arp.forEach((m, i) => {
    const g = gainNode(k, 1)
    g.connect(o.dry)
    g.connect(o.verb)
    celesta(k, g, t + 0.05 + i * 0.085, midiHz(m), 0.2)
  })
  const tb = t + 0.05 + 4 * 0.085 + 0.04
  const bloom = gainNode(k, 1)
  bloom.connect(o.dry)
  bloom.connect(o.verb)
  for (const m of [88, 90, 81]) celesta(k, bloom, tb, midiHz(m), 0.13)
  // A warm Dadd9 swell under it.
  for (const [m, pan] of [[62, -0.3], [66, 0.3], [69, -0.1], [76, 0.15]] as const) {
    const o1 = osc(k, 'triangle', midiHz(m), t, 2.6)
    const pg = k.ctx.createGain()
    pg.gain.setValueAtTime(0, t)
    pg.gain.linearRampToValueAtTime(0.05, t + 0.35)
    pg.gain.setTargetAtTime(0, t + 0.6, 0.45)
    const pn = k.ctx.createStereoPanner()
    pn.pan.value = pan
    o1.connect(filter(k, 'lowpass', 1800)).connect(pg).connect(pn)
    pn.connect(o.dry)
    pn.connect(o.verb)
  }
  // Wind chimes through the dance.
  for (let i = 0; i < 7; i++) {
    const tc = tb + 0.1 + k.rand() * 1.3
    const pn = k.ctx.createStereoPanner()
    pn.pan.value = between(k, -0.7, 0.7)
    pn.connect(o.dry)
    pn.connect(o.verb)
    chime(k, pn, tc, midiHz(pentaNote(10 + Math.floor(k.rand() * 7))), 0.04)
  }
  return 3.2
}

/**
 * CHAPTER — the chapter card: a gust of wind swelling in, a low temple bell
 * (D3 with its D4 / A4 tubular partials), then a slow pentatonic phrase on
 * the celesta climbing out of it — A4 D5 E5 F#5 … A5 — under a shimmer of
 * chimes. Calmer and lower than WIN: a beginning, not a finish. In key.
 */
const chapter: Recipe = (k, o, t) => {
  // The gust: pink noise through a band that opens as it swells, then settles.
  const gust = noise(k, t, 2.2, k.pink)
  const gb = filter(k, 'bandpass', 300, 0.8)
  sweep(gb.frequency, t, 260, 1500, 1.1)
  const gg = k.ctx.createGain()
  gg.gain.setValueAtTime(0, t)
  gg.gain.linearRampToValueAtTime(0.14, t + 0.7)
  gg.gain.setTargetAtTime(0, t + 0.9, 0.4)
  gust.connect(gb).connect(gg).connect(o.verb)
  // The bell, struck as the gust peaks.
  const tb = t + 0.35
  const bell = gainNode(k, 1)
  bell.connect(o.dry)
  bell.connect(o.verb)
  ring(k, bell, tb, midiHz(50), [[1, 1, 3.4], [2, 0.5, 2.6], [3, 0.22, 1.6], [4.07, 0.12, 0.9], [6.8, 0.05, 0.4]], 0.22, 0.004)
  // The phrase.
  const phrase: [m: number, dt: number][] = [[69, 0], [74, 0.22], [76, 0.44], [78, 0.66], [81, 1.02]]
  for (const [m, dt] of phrase) {
    const g = gainNode(k, 1)
    g.connect(o.dry)
    g.connect(o.verb)
    celesta(k, g, tb + 0.25 + dt, midiHz(m), m === 81 ? 0.19 : 0.15)
  }
  // A soft D / A pad holding it together.
  for (const [m, pan] of [[50, -0.2], [57, 0.2], [62, 0]] as const) {
    const o1 = osc(k, 'triangle', midiHz(m), tb, 2.4)
    const pg = k.ctx.createGain()
    pg.gain.setValueAtTime(0, tb)
    pg.gain.linearRampToValueAtTime(0.045, tb + 0.5)
    pg.gain.setTargetAtTime(0, tb + 1.4, 0.35)
    const pn = k.ctx.createStereoPanner()
    pn.pan.value = pan
    o1.connect(filter(k, 'lowpass', 1400)).connect(pg).connect(pn)
    pn.connect(o.dry)
    pn.connect(o.verb)
  }
  // Chimes shimmering after the last note.
  for (let i = 0; i < 5; i++) {
    const pn = k.ctx.createStereoPanner()
    pn.pan.value = between(k, -0.6, 0.6)
    pn.connect(o.dry)
    pn.connect(o.verb)
    chime(k, pn, tb + 1.3 + k.rand() * 0.9, midiHz(pentaNote(10 + Math.floor(k.rand() * 5))), 0.035)
  }
  return 3.4
}

/**
 * RATE — one star of a timed level's rating landing: a filled star is a bright celesta note that
 * steps up the D major pentatonic with each star (intensity 0, 0.5, 1 → degrees 7, 9, 11), with a
 * chime sparkle; an empty one (`quick`) is a soft, low paper tap.
 */
const rate: Recipe = (k, o, t, p) => {
  const i = Math.round((p.intensity ?? 0) * 2)
  if (p.quick) {
    const tap = noise(k, t, 0.12)
    tap.connect(filter(k, 'lowpass', 900)).connect(gainAD(k, t, 0.18, 0.002, 0.09)).connect(o.dry)
    const thud = osc(k, 'sine', 140, t, 0.2)
    sweep(thud.frequency, t, 160, 90, 0.15)
    thud.connect(gainAD(k, t, 0.12, 0.004, 0.14)).connect(o.dry)
    return 0.3
  }
  const g = gainNode(k, 1)
  g.connect(o.dry)
  g.connect(o.verb)
  celesta(k, g, t, midiHz(pentaNote(7 + i * 2)), 0.2)
  celesta(k, g, t + 0.02, midiHz(pentaNote(12 + i * 2)), 0.08)
  for (let s = 0; s < 3; s++) {
    const pn = k.ctx.createStereoPanner()
    pn.pan.value = between(k, -0.5, 0.5)
    pn.connect(o.dry)
    pn.connect(o.verb)
    chime(k, pn, t + 0.06 + s * 0.05 + k.rand() * 0.04, midiHz(pentaNote(14 + i + s)), 0.03)
  }
  return 1.6
}

/**
 * TIMEUP — the clock of a timed level ran out: a cute "wah-wah-waaah" of a muted horn (a sawtooth
 * through a wah filter that opens and closes on each note) falling A4 → F#4 → E4, the last one
 * sagging down a semitone, then a soft paper thud as the level folds back to the start.
 */
const timeUp: Recipe = (k, o, t) => {
  const notes: [m: number, at: number, len: number][] = [[69, 0, 0.26], [66, 0.3, 0.26], [64, 0.6, 0.9]]
  for (const [m, at, len] of notes) {
    const t0 = t + at
    const f = midiHz(m)
    const horn = osc(k, 'sawtooth', f, t0, len + 0.1)
    const body = osc(k, 'triangle', f / 2, t0, len + 0.1)
    if (len > 0.5) {
      // The last note sags, with a slow, sad vibrato.
      sweep(horn.frequency, t0 + 0.25, f, f * 0.94, len - 0.25)
      sweep(body.frequency, t0 + 0.25, f / 2, (f / 2) * 0.94, len - 0.25)
      const vib = osc(k, 'sine', 5, t0, len + 0.1)
      const depth = gainNode(k, 0)
      depth.gain.setValueAtTime(0, t0)
      depth.gain.linearRampToValueAtTime(f * 0.012, t0 + len * 0.7)
      vib.connect(depth).connect(horn.frequency)
    }
    const wah = filter(k, 'bandpass', 500, 3)
    wah.frequency.setValueAtTime(380, t0)
    wah.frequency.linearRampToValueAtTime(1500, t0 + Math.min(0.12, len * 0.4))
    wah.frequency.linearRampToValueAtTime(520, t0 + len)
    const env = k.ctx.createGain()
    env.gain.setValueAtTime(0, t0)
    env.gain.linearRampToValueAtTime(0.32, t0 + 0.03)
    env.gain.setValueAtTime(0.32, t0 + len * 0.6)
    env.gain.linearRampToValueAtTime(0, t0 + len)
    horn.connect(wah).connect(env)
    body.connect(gainNode(k, 0.35)).connect(env)
    env.connect(o.dry)
    env.connect(o.verb)
  }
  const td = t + 1.45
  const thud = osc(k, 'sine', 120, td, 0.3)
  sweep(thud.frequency, td, 150, 70, 0.25)
  thud.connect(gainAD(k, td, 0.2, 0.004, 0.22)).connect(o.dry)
  noise(k, td, 0.15).connect(filter(k, 'lowpass', 700)).connect(gainAD(k, td, 0.14, 0.002, 0.1)).connect(o.dry)
  return 2
}

/** TICK — the last seconds of a timed level: a small woodblock tick (intensity = how loud). */
const tick: Recipe = (k, o, t, p) => {
  const v = 0.5 + 0.5 * (p.intensity ?? 0.5)
  const body = osc(k, 'sine', 1750, t, 0.08)
  sweep(body.frequency, t, 1900, 1500, 0.05)
  body.connect(gainAD(k, t, 0.14 * v, 0.001, 0.05)).connect(o.dry)
  click(k, o.dry, t, 3200, 4, 0.08 * v, 3)
  return 0.15
}

/**
 * WHISTLE — the Looney-Tunes falling whistle as he drops off screen: a
 * breathy whistle tone (sine plus band-limited breath that tracks it) gliding
 * down, held, then faded to silence over `fade` s.
 */
const whistle: Recipe = (k, o, t, p) => {
  const fade = Math.max(0.15, p.fade ?? 1.2)
  const dur = fade + 0.25
  const f0 = 2000
  const f1 = 420
  const tone = osc(k, 'sine', f0, t, dur)
  sweep(tone.frequency, t, f0, f1, dur)
  const vib = osc(k, 'sine', 6.2, t, dur)
  const vibD = gainNode(k, 0)
  vibD.gain.setValueAtTime(0, t)
  vibD.gain.linearRampToValueAtTime(18, t + 0.3)
  vib.connect(vibD).connect(tone.frequency)
  const h2 = osc(k, 'sine', f0 * 2, t, dur)
  sweep(h2.frequency, t, f0 * 2, f1 * 2, dur)
  const breath = noise(k, t, dur)
  const bb = filter(k, 'bandpass', f0, 22)
  sweep(bb.frequency, t, f0, f1, dur)
  const env = k.ctx.createGain()
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(1, t + 0.05)
  env.gain.setValueAtTime(1, t + fade * 0.35)
  env.gain.linearRampToValueAtTime(0, t + fade)
  tone.connect(gainNode(k, 0.2)).connect(env)
  h2.connect(gainNode(k, 0.012)).connect(env)
  breath.connect(bb).connect(gainNode(k, 0.9)).connect(env)
  env.connect(o.dry)
  env.connect(o.verb)
  return dur + 0.1
}

export const RECIPES = {
  open,
  close,
  break: breakUmbrella,
  land,
  step,
  splat,
  hit,
  lunge,
  arrive,
  win,
  whistle,
  chapter,
  rate,
  tick,
  timeUp
} satisfies Record<string, Recipe>

export type SfxName = keyof typeof RECIPES

/** Per-sound trim (linear), set from the level report so the hierarchy holds. */
export const SFX_TRIM: Record<SfxName, number> = {
  open: 1.68, // +4.5 dB
  close: 2.5, // +8 dB
  break: 2.66, // +8.5 dB
  land: 2.8, // +9 dB
  step: 4.5, // +13 dB
  splat: 2.8, // +9 dB
  hit: 3.16, // +10 dB
  lunge: 2,
  arrive: 2,
  win: 0.68, // −3.3 dB
  whistle: 0.7, // −3 dB
  chapter: 0.75, // a stinger, set beside WIN by the level report (sound.test.ts)
  rate: 0.9,
  tick: 1.2,
  timeUp: 0.8
}

/** Seconds the music ducks under a sound, and how deep (dB). */
export const SFX_DUCK: Partial<Record<SfxName, [db: number, hold: number]>> = {
  break: [-7, 0.6],
  splat: [-8, 0.5],
  hit: [-7, 0.4],
  win: [-6, 1.6],
  whistle: [-4, 0.8],
  chapter: [-8, 2.6],
  timeUp: [-7, 1.6]
}

// ─── Ambience: the wind, continuously ──────────────────────────────────────

/** What the scene reports about the air around the player, each frame. */
export interface AmbienceState {
  /** Ordinary current at the player 0..1 (inside, or a hint when close). */
  wind: number
  /** Super Stream at the player 0..1. */
  superWind: number
  /** Airborne speed as a fraction of terminal velocity. */
  speed: number
  /** 0..1 — closed and closing in on the speed where reopening breaks it. */
  danger: number
  /** 1 while the open canopy is in the air. */
  canopy: number
  /** −1..1, where the nearest current is. */
  pan: number
  /** 0..1 — how close the nearest mine is. */
  mine: number
  /** 0..1 — how fast that mine is moving (raises its whirr). */
  mineSpeed: number
  /** 0..1 — how close the nearest pillar creature is. */
  pillar: number
  /** −1..1, where the nearest enemy is. */
  enemyPan: number
}

export const AMBIENCE_IDLE: AmbienceState = {
  wind: 0, superWind: 0, speed: 0, danger: 0, canopy: 0, pan: 0, mine: 0, mineSpeed: 0, pillar: 0, enemyPan: 0
}

export interface Ambience {
  set: (s: AmbienceState, at: number, smooth?: number) => void
}

/**
 * The sky, as layers over two looping noise sources:
 *   bed     — a soft, always-there breeze, breathing on two slow LFOs;
 *   stream  — the whoosh of an updraft, brighter the stronger it blows;
 *   howl    — a narrow resonant whistle riding the stream;
 *   roar    — a Super Stream's deep rumble and low howl;
 *   canopy  — the open umbrella's fabric luffing in the current;
 *   rush    — air tearing past a closed fall, rising with speed;
 *   rattle  — the closed canopy shuddering near terminal velocity: the
 *             audible warning that reopening now will break it;
 *   mine    — a spinning, metallic whirr that swells as a mine comes close;
 *   pillar  — a pillar creature's slow, low breathing when you are near it.
 */
export const createAmbience = (k: Kit, out: AudioNode, t0: number): Ambience => {
  const { ctx } = k
  const pink = ctx.createBufferSource()
  pink.buffer = k.pink
  pink.loop = true
  pink.start(t0)
  const white = ctx.createBufferSource()
  white.buffer = k.white
  white.loop = true
  white.start(t0)
  const lfo = (freq: number, depth: number, target: AudioParam, type: OscillatorType = 'sine') => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const d = ctx.createGain()
    d.gain.value = depth
    o.connect(d).connect(target)
    o.start(t0)
    return o
  }

  // Bed: a breeze that breathes on its own (gusts every ~8–14 s).
  const bedLp = filter(k, 'lowpass', 420, 0.6)
  const bed = gainNode(k, 0)
  bed.gain.setValueAtTime(0, t0)
  bed.gain.linearRampToValueAtTime(0.09, t0 + 3)
  const bedBreath = gainNode(k, 1)
  lfo(0.071, 0.3, bedBreath.gain)
  lfo(0.123, 0.22, bedBreath.gain)
  lfo(0.09, 140, bedLp.frequency)
  pink.connect(bedLp).connect(bedBreath).connect(bed).connect(out)
  const air = filter(k, 'bandpass', 2600, 0.7)
  const airG = gainNode(k, 0.012)
  lfo(0.057, 0.008, airG.gain)
  white.connect(air).connect(airG).connect(bed)

  // Stream + howl, panned toward the current.
  const streamPan = ctx.createStereoPanner()
  streamPan.connect(out)
  const streamBp = filter(k, 'bandpass', 400, 0.8)
  const stream = gainNode(k, 0)
  lfo(0.31, 90, streamBp.frequency)
  pink.connect(streamBp).connect(stream).connect(streamPan)
  const howlBp = filter(k, 'bandpass', 800, 18)
  const howl = gainNode(k, 0)
  lfo(0.27, 45, howlBp.frequency)
  lfo(0.83, 18, howlBp.frequency)
  white.connect(howlBp).connect(howl).connect(streamPan)

  // Super Stream: rumble and a low howl.
  const roarLp = filter(k, 'lowpass', 240, 0.9)
  const roar = gainNode(k, 0)
  pink.connect(roarLp).connect(roar).connect(streamPan)
  const lowHowlBp = filter(k, 'bandpass', 430, 12)
  const lowHowl = gainNode(k, 0)
  lfo(0.19, 30, lowHowlBp.frequency)
  white.connect(lowHowlBp).connect(lowHowl).connect(streamPan)

  // Canopy luffing: noise chopped by a flutter that quickens with the wind.
  const canBp = filter(k, 'bandpass', 1800, 1.1)
  const canAm = gainNode(k, 0.55)
  const canLfo = lfo(8, 0.45, canAm.gain, 'triangle')
  const canopy = gainNode(k, 0)
  white.connect(canBp).connect(canAm).connect(canopy).connect(out)

  // Rush of a closed fall.
  const rushHp = filter(k, 'highpass', 250)
  const rushBp = filter(k, 'bandpass', 500, 0.6)
  const rush = gainNode(k, 0)
  pink.connect(rushHp).connect(rushBp).connect(rush).connect(out)

  // Near-break rattle.
  const ratBp = filter(k, 'bandpass', 1250, 2.2)
  const ratAm = gainNode(k, 0.5)
  const ratLfo = lfo(23, 0.5, ratAm.gain, 'square')
  const rattle = gainNode(k, 0)
  white.connect(ratBp).connect(ratAm).connect(rattle).connect(out)

  // Enemies, panned toward the nearest one.
  const enemyPan = ctx.createStereoPanner()
  enemyPan.connect(out)
  const mineA = ctx.createOscillator()
  mineA.type = 'sawtooth'
  mineA.frequency.value = 98
  const mineB = ctx.createOscillator()
  mineB.type = 'sawtooth'
  mineB.frequency.value = 98 * 1.498 // a slightly beating fifth
  mineA.start(t0)
  mineB.start(t0)
  const mineBp = filter(k, 'bandpass', 1300, 5)
  const mineAm = gainNode(k, 0.6)
  const mineSpin = lfo(3.8, 0.4, mineAm.gain, 'triangle') // its 16 spikes going round
  const mine = gainNode(k, 0)
  mineA.connect(mineBp)
  mineB.connect(gainNode(k, 0.7)).connect(mineBp)
  mineBp.connect(mineAm).connect(mine).connect(enemyPan)
  const mineHiss = filter(k, 'bandpass', 5200, 3)
  white.connect(mineHiss).connect(gainNode(k, 0.35)).connect(mineAm)
  const pilLp = filter(k, 'lowpass', 220, 1.2)
  const pilBreath = gainNode(k, 0.5)
  lfo(0.55, 0.5, pilBreath.gain) // a slow in-out breath
  const pilTone = ctx.createOscillator()
  pilTone.frequency.value = midiHz(38) // D2, in the score's key
  pilTone.start(t0)
  const pillar = gainNode(k, 0)
  pink.connect(pilLp).connect(pilBreath)
  pilTone.connect(gainNode(k, 0.25)).connect(pilBreath)
  pilBreath.connect(pillar).connect(enemyPan)

  const to = (p: AudioParam, v: number, at: number, tc: number) => p.setTargetAtTime(v, at, tc)

  return {
    set: (s, at, smooth = 0.08) => {
      const w = clamp01(s.wind)
      const sw = clamp01(s.superWind)
      const any = Math.max(w, sw)
      const sp = clamp01(s.speed)
      to(streamPan.pan, Math.max(-0.7, Math.min(0.7, s.pan)) * (1 - 0.6 * any), at, 0.2)
      to(stream.gain, 0.42 * Math.pow(any, 1.3), at, smooth * 2)
      to(streamBp.frequency, 380 + 800 * w + 500 * sw, at, smooth * 3)
      to(howl.gain, 0.05 * Math.pow(w, 1.5) + 0.03 * sw, at, smooth * 3)
      to(howlBp.frequency, 720 + 520 * w + 260 * sw, at, smooth * 4)
      to(roar.gain, 0.6 * Math.pow(sw, 1.2), at, smooth * 2)
      to(lowHowl.gain, 0.09 * sw, at, smooth * 3)
      const c = clamp01(s.canopy)
      to(canopy.gain, c * (0.012 + 0.07 * w + 0.12 * sw + 0.08 * sp), at, smooth)
      to(canLfo.frequency, 6 + 8 * any + 10 * sp, at, smooth)
      to(rush.gain, 0.45 * Math.pow(sp, 2) * (1 - 0.5 * c), at, smooth)
      to(rushBp.frequency, 380 + 2600 * sp * sp, at, smooth)
      const d = clamp01(s.danger)
      to(rattle.gain, 0.2 * d * d, at, smooth * 0.6)
      to(ratLfo.frequency, 18 + 14 * d, at, smooth)
      const m = clamp01(s.mine)
      const ms = clamp01(s.mineSpeed)
      to(enemyPan.pan, Math.max(-0.8, Math.min(0.8, s.enemyPan)), at, 0.1)
      to(mine.gain, 0.8 * Math.pow(m, 1.6), at, smooth)
      to(mineBp.frequency, 900 + 900 * m + 1400 * ms, at, smooth)
      to(mineSpin.frequency, 3.8 + 9 * ms, at, smooth)
      to(mineA.frequency, 98 + 40 * ms, at, smooth * 2)
      to(mineB.frequency, (98 + 40 * ms) * 1.498, at, smooth * 2)
      to(pillar.gain, 0.24 * Math.pow(clamp01(s.pillar), 1.5), at, smooth * 2)
    }
  }
}
