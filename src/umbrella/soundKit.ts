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
  /**
   * 4 s of fabric-flap ENVELOPE (0..1, not audio): irregular sharp-attack
   * flaps, about 10 a second. Played as a modulator into a gain, it makes
   * cloth luff and ribs rattle like the real thing instead of the buzz a
   * periodic LFO gives; `playbackRate` sets the flap rate (1 = 10 flaps/s).
   */
  flaps: AudioBuffer
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
  return { ctx, rand: prng(seed), white, pink, flaps: flapEnvelope(ctx, prng(seed + 13)) }
}

/**
 * The flap modulator: flaps at jittered intervals (mean 0.1 s), each a 3 ms
 * rise and an ~18 ms fall at a random strength. The last flap dies out
 * before the end, so the loop wraps on silence-to-silence.
 */
const flapEnvelope = (ctx: BaseAudioContext, r: () => number): AudioBuffer => {
  const sr = ctx.sampleRate
  const n = Math.ceil(4 * sr)
  const buf = ctx.createBuffer(1, n, sr)
  const d = buf.getChannelData(0)
  const up = 1 - Math.exp(-1 / (0.003 * sr))
  const down = 1 - Math.exp(-1 / (0.018 * sr))
  const stopAt = n - Math.round(0.16 * sr)
  let next = 0
  let target = 0
  let env = 0
  let rising = false
  for (let i = 0; i < n; i++) {
    if (i >= next && i < stopAt) {
      target = 0.45 + 0.55 * r()
      rising = true
      next = i + Math.round(sr * 0.1 * (0.6 + 0.8 * r()))
    }
    if (rising) {
      env += (target - env) * up
      if (env >= target * 0.92) rising = false
    } else env -= env * down
    d[i] = env
  }
  return buf
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

const curves = new Map<number, Float32Array<ArrayBuffer>>()
/**
 * Soft tanh saturation with unity small-signal gain: rounds a thump's peak
 * and thickens its body the way tape does, instead of a bare sine's "beep".
 */
const warm = (k: Kit, drive = 1.6): WaveShaperNode => {
  let c = curves.get(drive)
  if (!c) {
    c = new Float32Array(1025)
    for (let i = 0; i < c.length; i++) c[i] = Math.tanh(drive * (i / 512 - 1)) / drive
    curves.set(drive, c)
  }
  const ws = k.ctx.createWaveShaper()
  ws.curve = c
  return ws
}

/**
 * A one-off mono buffer written sample by sample and started at `t0` — for
 * the textures nodes can't make: crackle, tearing, trains of flaps.
 */
const texture = (k: Kit, t0: number, seconds: number, gen: (t: number) => number): AudioBufferSourceNode => {
  const sr = k.ctx.sampleRate
  const n = Math.max(1, Math.ceil(seconds * sr))
  const buf = k.ctx.createBuffer(1, n, sr)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = gen(i / sr)
  const s = k.ctx.createBufferSource()
  s.buffer = buf
  s.start(t0)
  return s
}

/**
 * Crackle: random micro-bursts of noise, `density(u)` per second over the
 * normalised time u = 0..1 — nylon crinkling, a canopy tearing, clothes.
 */
const crackle = (k: Kit, t0: number, seconds: number, density: (u: number) => number, decay = 0.0008): AudioBufferSourceNode => {
  const sr = k.ctx.sampleRate
  const a = Math.exp(-1 / (decay * sr))
  let env = 0
  return texture(k, t0, seconds, (t) => {
    if (k.rand() < density(t / seconds) / sr) env = 0.35 + 0.65 * k.rand()
    env *= a
    return env * (k.rand() * 2 - 1)
  })
}

/**
 * A train of fabric flaps: dark noise under sharp-attack envelopes at
 * `rate(u)` flaps/s (jittered ±30 %), each scaled by `amp(u)`.
 */
const flapTrain = (
  k: Kit, t0: number, seconds: number, rate: (u: number) => number, tau = 0.02, amp: (u: number) => number = () => 1
): AudioBufferSourceNode => {
  const sr = k.ctx.sampleRate
  const up = 1 - Math.exp(-1 / (0.0025 * sr))
  const down = 1 - Math.exp(-1 / (tau * sr))
  let next = 0
  let target = 0
  let env = 0
  let rising = false
  let lp = 0
  return texture(k, t0, seconds, (t) => {
    const u = t / seconds
    if (t >= next) {
      target = (0.55 + 0.45 * k.rand()) * amp(u)
      rising = true
      next = t + (0.7 + 0.6 * k.rand()) / Math.max(0.5, rate(u))
    }
    if (rising) {
      env += (target - env) * up
      if (env >= target * 0.92) rising = false
    } else env -= env * down
    lp += 0.4 * (k.rand() * 2 - 1 - lp)
    return env * lp * 1.8
  })
}

/** A thin steel rib or wire: a tick, then a short ring whose pitch sags back as it bends. */
const twang = (k: Kit, out: AudioNode, t0: number, f: number, peak: number, t60 = 0.08, bend = 0.04): void => {
  click(k, out, t0, Math.min(9000, f * 2.2), 3, peak * 1.6, 2)
  for (const [ratio, amp, d] of [[1, 1, 1], [2.76, 0.45, 0.6], [5.4, 0.2, 0.35]] as const) {
    const o = osc(k, 'sine', f * ratio, t0, t60 * d + 0.05)
    o.frequency.setValueAtTime(f * ratio * (1 + bend), t0)
    o.frequency.exponentialRampToValueAtTime(f * ratio, t0 + 0.03)
    o.connect(gainAD(k, t0, peak * amp, 0.0008, t60 * d)).connect(out)
  }
}

/**
 * A taut membrane struck — the canopy snapping full, a body landing: a sine
 * dropping `f0` → `f1` over `drop` s, rounded by soft saturation.
 */
const membrane = (k: Kit, out: AudioNode, t0: number, f0: number, f1: number, peak: number, t60: number, drop = 0.03): void => {
  const o = osc(k, 'sine', f0, t0, t60 + 0.06)
  sweep(o.frequency, t0, f0, f1, drop)
  o.connect(gainAD(k, t0, peak, 0.002, t60)).connect(warm(k)).connect(out)
}

/** A gain that feeds both the dry path and the room. */
const both = (k: Kit, o: Out, send = 1): GainNode => {
  const g = gainNode(k, 1)
  g.connect(o.dry)
  if (send === 1) g.connect(o.verb)
  else g.connect(gainNode(k, send)).connect(o.verb)
  return g
}

const panned = (k: Kit, pan: number, dest: AudioNode): StereoPannerNode => {
  const p = k.ctx.createStereoPanner()
  p.pan.value = pan
  p.connect(dest)
  return p
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
  // DC and sub-rumble blocker: pitch-dropping thumps and saturated bodies
  // leave a little offset; nothing musical lives under 22 Hz.
  const dcBlock = filterRaw(ctx, 'highpass', 22, 0.6)
  sum.connect(dcBlock).connect(limiter).connect(masterVol).connect(mute).connect(dest)
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
  hazard?: 'pillar' | 'mine' | 'spikes' | 'fan'
  /** Whistle: seconds to fade to silence. */
  fade?: number
  /** Lunge: seconds of wind-up tell before the strike lands. */
  lead?: number
  /** Arrive: seconds the enemy takes to glide in. */
  duration?: number
}

type Recipe = (k: Kit, o: Out, t: number, p: SfxParams) => number

/**
 * OPEN — the runner ratchets up the shaft, the latch catches, the canopy
 * snaps taut with a membrane "whap" and swallows a pocket of air, then
 * shudders out in a few flaps. Opened at speed, the catch is a big "whump"
 * with the brake of the wind behind it and a longer, harder shudder.
 */
const open: Recipe = (k, o, t, p) => {
  const v = clamp01(p.intensity ?? 0)
  const lvl = p.quick ? 0.7 : 1
  let tl = t
  if (!p.quick) {
    // The runner racing up the shaft: a ratchet closing up and rising in
    // pitch, over a little slide of friction.
    const ticks = 5 + Math.floor(k.rand() * 2)
    let at = t
    for (let i = 0; i < ticks; i++) {
      const u = i / (ticks - 1)
      click(k, o.dry, at, between(k, 2500, 2900) * (1 + 0.55 * u), 4, 0.07 + 0.08 * u, 2)
      at += 0.015 - 0.008 * u + between(k, -0.001, 0.001)
    }
    const slide = noise(k, t, at - t + 0.03)
    const sb = filter(k, 'bandpass', 2200, 1.6)
    sweep(sb.frequency, t, 2000, 4200, at - t)
    const sg = k.ctx.createGain()
    sg.gain.setValueAtTime(0, t)
    sg.gain.linearRampToValueAtTime(0.05, at - 0.004)
    sg.gain.linearRampToValueAtTime(0, at + 0.012)
    slide.connect(sb).connect(sg).connect(o.dry)
    tl = at
  }
  // The latch: a plastic catch, the spring's metal tick, the runner knocking its stop.
  click(k, o.dry, tl, between(k, 3800, 4600), 3.5, 0.3 * lvl, 2)
  ring(k, o.dry, tl, between(k, 2850, 3050), [[1, 1, 0.05], [2.41, 0.4, 0.03]], 0.03 * lvl)
  click(k, o.dry, tl + 0.003, between(k, 850, 1000), 2, 0.2 * lvl, 4)
  // The canopy snaps taut: a membrane "whap", a crack of nylon on top of it.
  const tc = tl + 0.006
  membrane(k, o.dry, tc, between(k, 255, 290), 150, (0.34 + 0.14 * v) * lvl, 0.11, 0.025)
  const crack = noise(k, tc, 0.06)
  const crackPk = filter(k, 'peaking', 2400, 1)
  crackPk.gain.value = 6
  crack.connect(filter(k, 'highpass', 900)).connect(crackPk).connect(gainAD(k, tc, 0.24 * lvl, 0.001, 0.04)).connect(o.dry)
  const fwap = noise(k, tc, 0.12, k.pink)
  fwap.connect(filter(k, 'bandpass', between(k, 700, 900), 1.1)).connect(gainAD(k, tc, 0.42 * lvl, 0.002, 0.07)).connect(o.dry)
  // …then the air fills it, a beat behind the snap.
  const tf = tc + 0.012
  const fill = noise(k, tf, 0.45, k.pink)
  const lp = filter(k, 'lowpass', 3500, 1.2)
  sweep(lp.frequency, tf, 3200 + 1200 * v, 380, 0.14 + 0.08 * v)
  const fillG = gainAD(k, tf, (0.55 + 0.3 * v) * lvl, 0.016, 0.2 + 0.25 * v)
  fill.connect(lp).connect(fillG).connect(both(k, o))
  // The air pocket: a soft low thump (A2 falling to A1).
  membrane(k, o.dry, tf, 112, 55, (0.16 + 0.2 * v) * lvl, 0.2, 0.12)
  // The canopy settles: a few flaps shuddering out — longer and harder when
  // it caught a fall.
  const settle = 0.22 + 0.4 * v
  const flaps = flapTrain(k, tc + 0.03, settle, (u) => 26 - 12 * u, 0.018, (u) => (1 - u) * (1 - u))
  flaps.connect(filter(k, 'bandpass', 1000, 0.8)).connect(gainNode(k, (0.14 + 0.24 * v) * lvl)).connect(both(k, o, 0.6))
  // Caught at speed: the wind brakes against the canopy.
  if (v > 0.15) {
    const brake = noise(k, tc, 0.7, k.pink)
    const bb = filter(k, 'bandpass', 700, 0.8)
    sweep(bb.frequency, tc, 900, 260, 0.5)
    brake.connect(bb).connect(gainAD(k, tc, 0.3 * v, 0.04, 0.45)).connect(both(k, o))
  }
  return 0.85 + 0.3 * v
}

/**
 * CLOSE — the panels fold with a crinkle of nylon and a soft "fshh" of air
 * pushed out, the runner ratchets down the shaft and the ribs knock home.
 */
const close: Recipe = (k, o, t, p) => {
  const lvl = p.auto ? 0.5 : p.quick ? 0.75 : 1
  const crinkle = crackle(k, t, 0.15, (u) => 2400 * Math.sin(Math.PI * Math.min(1, u * 1.25)), 0.0007)
  crinkle.connect(filter(k, 'bandpass', 4200, 0.7)).connect(gainNode(k, 0.2 * lvl)).connect(o.dry)
  const n = noise(k, t, 0.22, k.pink)
  const bp = filter(k, 'bandpass', 900, 0.8)
  sweep(bp.frequency, t, 700, 2600, 0.11)
  const g = k.ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.4 * lvl, t + 0.035)
  g.gain.setTargetAtTime(0, t + 0.05, 0.035)
  n.connect(bp).connect(g).connect(o.dry)
  // Air pushed out as the fabric folds: a tiny downward puff.
  membrane(k, o.dry, t + 0.01, 150, 80, 0.13 * lvl, 0.08, 0.08)
  // The runner sliding home: a ratchet falling and slowing.
  for (let i = 0; i < 4; i++) {
    click(k, o.dry, t + 0.03 + i * (0.011 + 0.004 * i), between(k, 3300, 3700) * (1 - 0.09 * i), 4, (0.09 - 0.014 * i) * lvl, 2)
  }
  // Ribs folding home.
  click(k, o.dry, t + 0.085, between(k, 2000, 2600), 2.5, 0.17 * lvl, 3)
  click(k, o.dry, t + between(k, 0.1, 0.115), between(k, 1600, 2100), 2.5, 0.13 * lvl, 3)
  if (!p.auto) ring(k, o.dry, t + 0.1, between(k, 2300, 2450), [[1, 1, 0.035]], 0.02 * lvl)
  return 0.35
}

/**
 * BREAK — reopened at terminal velocity, the canopy blows inside-out: a big
 * membrane FWOMP and a crack, the nylon tearing, steel ribs snapping and
 * ringing as they bend, a sprung rib wobbling, and the torn fabric flapping
 * wildly — slowing — as the air rushes through the wreck.
 */
const breakUmbrella: Recipe = (k, o, t) => {
  membrane(k, o.dry, t, 210, 55, 0.6, 0.2, 0.09)
  const crack = noise(k, t, 0.2)
  crack.connect(filter(k, 'highpass', 500)).connect(filter(k, 'peaking', 1600, 0.8)).connect(gainAD(k, t, 0.55, 0.001, 0.11)).connect(o.dry)
  // The nylon tearing: a dense crackle swelling and thinning out.
  const tear = crackle(k, t + 0.008, 0.34, (u) => 5000 * Math.pow(Math.sin(Math.PI * u), 0.7), 0.0006)
  const tearPk = filter(k, 'bandpass', 3600, 0.6)
  tear.connect(filter(k, 'highpass', 1500)).connect(tearPk).connect(gainAD(k, t + 0.008, 0.5, 0.02, 0.32)).connect(both(k, o, 0.6))
  // Ribs snapping: five steel ticks, spread a little left and right.
  for (let i = 0; i < 5; i++) {
    const ti = t + 0.006 + i * between(k, 0.025, 0.055)
    twang(k, panned(k, between(k, -0.35, 0.35), o.dry), ti, between(k, 1500, 2700), 0.05, between(k, 0.07, 0.12), 0.06)
  }
  // The sprung rib: an FM "boing" sagging down with a wobble.
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
  wob.connect(gainNode(k, 14)).connect(car.frequency)
  car.connect(filter(k, 'lowpass', 2200)).connect(gainAD(k, tb, 0.1, 0.004, 0.6)).connect(both(k, o))
  // Torn canopy flapping out of control in the rush, slowing as it falls apart.
  const flap = flapTrain(k, t + 0.03, 1.05, (u) => 28 - 21 * u, 0.024, (u) => 1 - 0.75 * u)
  flap.connect(filter(k, 'highpass', 220)).connect(filter(k, 'bandpass', 1000, 0.8)).connect(gainNode(k, 0.42)).connect(both(k, o))
  // Air rushing through the wreck: a falling, sighing whistle.
  const sigh = noise(k, t, 0.7)
  const sb = filter(k, 'bandpass', 2000, 7)
  sweep(sb.frequency, t, 2400, 600, 0.6)
  sigh.connect(sb).connect(gainAD(k, t, 0.22, 0.03, 0.55)).connect(o.verb)
  return 1.25
}

/**
 * LAND — soft shoes on a platform: a round heel thump with a felt tap, a
 * breath of clothes settling, and from a real drop the folded umbrella's tip
 * touching down a moment later. The harder, the heavier.
 */
const land: Recipe = (k, o, t, p) => {
  const v = clamp01(p.intensity ?? 0.2)
  membrane(k, o.dry, t, between(k, 140, 165), 62, 0.26 + 0.5 * v, 0.09 + 0.08 * v, 0.07)
  const tap = noise(k, t, 0.06)
  tap.connect(filter(k, 'lowpass', 1200 + 900 * v, 0.9)).connect(gainAD(k, t, 0.26 + 0.4 * v, 0.001, 0.035)).connect(o.dry)
  const scuff = noise(k, t + 0.004, 0.1)
  scuff.connect(filter(k, 'bandpass', between(k, 2600, 3400), 1)).connect(gainAD(k, t + 0.004, 0.04 + 0.05 * v, 0.004, 0.06)).connect(o.dry)
  const rustle = crackle(k, t + 0.012, 0.1, (u) => 900 * (1 - u), 0.001)
  rustle.connect(filter(k, 'bandpass', 3800, 0.8)).connect(gainNode(k, 0.06 + 0.08 * v)).connect(o.dry)
  if (v > 0.2) {
    const tt = t + between(k, 0.05, 0.07)
    click(k, o.dry, tt, 3200, 3, 0.04 + 0.07 * v, 2)
    ring(k, o.dry, tt, between(k, 2500, 2800), [[1, 1, 0.05], [2.6, 0.4, 0.03]], 0.008 + 0.014 * v)
  }
  if (v > 0.45) {
    // A heavy landing: the second foot, and a puff of dust.
    membrane(k, o.dry, t + between(k, 0.035, 0.05), 130, 60, 0.3 * v, 0.08, 0.06)
    const dust = noise(k, t, 0.35, k.pink)
    dust.connect(filter(k, 'lowpass', 900)).connect(gainAD(k, t, 0.14 * v, 0.01, 0.25)).connect(o.dry)
  }
  return 0.45
}

/** STEP — a soft, padded footfall while walking; never twice the same, and quiet enough to sit under everything. */
const step: Recipe = (k, o, t, p) => {
  const lvl = (0.6 + 0.4 * clamp01(p.intensity ?? 1)) * between(k, 0.85, 1.1)
  const f = between(k, 125, 160)
  const th = osc(k, 'sine', f, t, 0.09)
  sweep(th.frequency, t, f, f * 0.7, 0.04)
  th.connect(gainAD(k, t, 0.14 * lvl, 0.002, 0.05)).connect(o.dry)
  const tap = noise(k, t, 0.04)
  tap.connect(filter(k, 'lowpass', between(k, 1500, 2200), 0.8)).connect(gainAD(k, t, 0.17 * lvl, 0.001, 0.025)).connect(o.dry)
  const ts = t + between(k, 0.008, 0.016)
  const scuff = noise(k, ts, 0.05)
  scuff.connect(filter(k, 'bandpass', between(k, 2800, 3600), 1.2)).connect(gainAD(k, ts, 0.035 * lvl, 0.006, 0.035)).connect(o.dry)
  return 0.12
}

/**
 * SPLAT — the cartoon pancake: a heavy body thump, a flat slap of air
 * squeezed out, a wet "splut" sweeping down, droplets plipping up in pitch
 * and the umbrella clattering after him, bounce by bounce.
 */
const splat: Recipe = (k, o, t) => {
  membrane(k, o.dry, t, 135, 38, 0.62, 0.3, 0.22)
  const thud = noise(k, t, 0.2, k.pink)
  thud.connect(filter(k, 'lowpass', 500)).connect(gainAD(k, t, 0.55, 0.001, 0.13)).connect(o.dry)
  const flat = noise(k, t, 0.12, k.pink)
  flat.connect(filter(k, 'lowpass', 1400, 0.7)).connect(gainAD(k, t, 0.3, 0.003, 0.08)).connect(o.dry)
  // The wet part: a resonant band falling fast, two formants for the "plut".
  for (const [f0, f1, q, a] of [[2600, 320, 3, 0.7], [1500, 500, 5, 0.38]] as const) {
    const s = noise(k, t + 0.004, 0.25)
    const bp = filter(k, 'bandpass', f0, q)
    sweep(bp.frequency, t + 0.004, f0, f1, 0.13)
    s.connect(bp).connect(gainAD(k, t + 0.004, a, 0.002, 0.16)).connect(both(k, o))
  }
  // Droplets: each a bubble whose pitch rises as its cavity closes ("plip").
  for (let i = 0; i < 6; i++) {
    const td = t + 0.06 + k.rand() * 0.4
    const f = between(k, 650, 1400)
    const d = osc(k, 'sine', f, td, 0.07)
    d.frequency.setValueAtTime(f * 0.8, td)
    d.frequency.exponentialRampToValueAtTime(f * 1.5, td + 0.025)
    d.connect(gainAD(k, td, between(k, 0.03, 0.07), 0.001, 0.04)).connect(panned(k, between(k, -0.5, 0.5), o.dry))
  }
  // The umbrella clattering down after him: rib ring and handle knock, each
  // bounce sooner and softer than the last.
  let tc = t + 0.11
  let gap = 0.13
  let a = 0.06
  for (let i = 0; i < 4; i++) {
    twang(k, o.dry, tc, between(k, 1800, 2600), a, 0.06, 0.02)
    click(k, o.dry, tc + 0.002, between(k, 900, 1200), 2, a * 2.5, 4)
    tc += gap
    gap *= 0.62
    a *= 0.6
  }
  return 0.95
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

/** A light harp pluck for stingers (the score has its own, fuller harp). */
const pluck = (k: Kit, out: AudioNode, t: number, f: number, peak: number): void => {
  ring(k, out, t, f, [[1, 1, 1.2], [2, 0.38, 0.6], [3, 0.12, 0.3]], peak, 0.003)
  const n = noise(k, t, 0.03)
  n.connect(filter(k, 'lowpass', 2500)).connect(gainAD(k, t, peak * 0.12, 0.001, 0.02)).connect(out)
}

/**
 * WIN — he lands on the finish: the umbrella twirls up on a breath of lift,
 * a harp runs up the pentatonic into a celesta arpeggio of the D major chord,
 * a warm Dadd9 swell blooms under it and wind chimes shimmer through the
 * dance. In key with the score, so it blooms out of it.
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
  // The canopy fluttering as it spins.
  const twirl = flapTrain(k, t, 0.55, (u) => 16 + 22 * u, 0.014, (u) => Math.sin(Math.PI * u))
  twirl.connect(filter(k, 'bandpass', 1500, 1)).connect(gainNode(k, 0.07)).connect(both(k, o, 0.7))
  // Harp run D4 → F#5 up the pentatonic, into the arpeggio.
  const run = both(k, o)
  for (let i = 0; i < 8; i++) {
    pluck(k, panned(k, -0.5 + i * 0.14, run), t + i * 0.034, midiHz(pentaNote(i)), 0.05 + i * 0.006)
  }
  // D5 F#5 A5 D6 … and an E6 + F#6 bloom on top.
  const t0 = t + 8 * 0.034 + 0.02
  const arp = [74, 78, 81, 86]
  arp.forEach((m, i) => celesta(k, both(k, o), t0 + i * 0.085, midiHz(m), 0.2))
  const tb = t0 + 4 * 0.085 + 0.04
  const bloom = both(k, o)
  for (const m of [88, 90, 81]) celesta(k, bloom, tb, midiHz(m), 0.13)
  // A warm Dadd9 swell under it: two detuned voices a note, and a soft D2 root.
  for (const [m, pan] of [[62, -0.3], [66, 0.3], [69, -0.1], [76, 0.15]] as const) {
    const pg = k.ctx.createGain()
    pg.gain.setValueAtTime(0, t)
    pg.gain.linearRampToValueAtTime(0.036, t + 0.35)
    pg.gain.setTargetAtTime(0, t + 0.7, 0.5)
    const lp = filter(k, 'lowpass', 1800)
    lp.connect(pg).connect(panned(k, pan, both(k, o)))
    for (const cents of [-6, 7]) {
      const o1 = osc(k, 'triangle', midiHz(m), t, 3)
      o1.detune.value = cents
      o1.connect(lp)
    }
  }
  const root = osc(k, 'sine', midiHz(38), t + 0.2, 2.2)
  const rg = k.ctx.createGain()
  rg.gain.setValueAtTime(0, t + 0.2)
  rg.gain.linearRampToValueAtTime(0.1, t + 0.5)
  rg.gain.setTargetAtTime(0, t + 0.8, 0.4)
  root.connect(rg).connect(o.dry)
  // Wind chimes through the dance.
  for (let i = 0; i < 7; i++) {
    const tc = tb + 0.1 + k.rand() * 1.3
    chime(k, panned(k, between(k, -0.7, 0.7), both(k, o)), tc, midiHz(pentaNote(10 + Math.floor(k.rand() * 7))), 0.04)
  }
  return 3.3
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

/**
 * BUMP — a bouncy Walldorf throws Pweeg off: a rubbery "boing" (a sine that
 * dips, springs back above its pitch and wobbles out) on a soft body thud.
 * intensity 1 = a charging Walldorf: lower, longer, with a heavier thump.
 */
const bump: Recipe = (k, o, t, p) => {
  const v = clamp01(p.intensity ?? 0.4)
  const base = between(k, 230, 260) * (1 - 0.3 * v)
  const len = 0.22 + 0.2 * v
  const boing = osc(k, 'sine', base, t, len + 0.05)
  const f = boing.frequency
  f.setValueAtTime(base * 0.62, t)
  f.exponentialRampToValueAtTime(base * 1.18, t + 0.035)
  // The spring rings out: a few shrinking wobbles around the pitch.
  for (let i = 1; i <= 5; i++) {
    const at = t + 0.035 + i * (len / 6)
    f.exponentialRampToValueAtTime(base * (1 + (i % 2 ? -1 : 1) * 0.12 / i), at)
  }
  boing.connect(gainAD(k, t, 0.42 + 0.25 * v, 0.004, len)).connect(o.dry)
  // Rubber skin: a quiet second partial for the "squeak" of the boing.
  const skin = osc(k, 'triangle', base * 2.02, t, 0.12)
  skin.connect(gainAD(k, t, 0.06 + 0.05 * v, 0.003, 0.08)).connect(o.dry)
  // The body hitting it.
  const thud = osc(k, 'sine', 110, t, 0.16)
  sweep(thud.frequency, t, 120 - 30 * v, 55, 0.08)
  thud.connect(gainAD(k, t, 0.25 + 0.45 * v, 0.002, 0.07 + 0.08 * v)).connect(o.dry)
  const slap = noise(k, t, 0.05)
  slap.connect(filter(k, 'lowpass', 1100 + 900 * v, 0.8)).connect(gainAD(k, t, 0.12 + 0.2 * v, 0.001, 0.03)).connect(o.dry)
  return len + 0.1
}

/**
 * WHOOSH — Chad's front flip in the intro: the body cuts the air twice as it
 * turns (the second pass higher, a touch of Doppler), his umbrella's fabric
 * flickering in the spin and a low "vwum", travelling left to right.
 */
const whoosh: Recipe = (k, o, t) => {
  const len = 0.75
  const pan = k.ctx.createStereoPanner()
  pan.pan.setValueAtTime(-0.45, t)
  pan.pan.linearRampToValueAtTime(0.45, t + len)
  pan.connect(o.dry)
  pan.connect(gainNode(k, 0.45)).connect(o.verb)
  for (const [at, f0, f1, f2, a] of [[0, 380, 1500, 700, 0.3], [0.3, 500, 2200, 800, 0.36]] as const) {
    const ta = t + at
    const n = noise(k, ta, 0.45, k.pink)
    const bp = filter(k, 'bandpass', f0, 1.3)
    bp.frequency.setValueAtTime(f0, ta)
    bp.frequency.exponentialRampToValueAtTime(f1, ta + 0.2)
    bp.frequency.exponentialRampToValueAtTime(f2, ta + 0.42)
    const g = k.ctx.createGain()
    g.gain.setValueAtTime(0, ta)
    g.gain.linearRampToValueAtTime(a, ta + 0.18)
    g.gain.setTargetAtTime(0, ta + 0.2, 0.07)
    n.connect(bp).connect(g).connect(pan)
  }
  const fl = flapTrain(k, t + 0.1, 0.55, (u) => 30 + 15 * u, 0.012, (u) => Math.sin(Math.PI * u))
  fl.connect(filter(k, 'bandpass', 1700, 1)).connect(gainNode(k, 0.07)).connect(pan)
  const body = osc(k, 'sine', 95, t + 0.22, 0.42)
  sweep(body.frequency, t + 0.22, 95, 68, 0.3)
  const bg = k.ctx.createGain()
  bg.gain.setValueAtTime(0, t + 0.22)
  bg.gain.linearRampToValueAtTime(0.09, t + 0.34)
  bg.gain.setTargetAtTime(0, t + 0.36, 0.06)
  body.connect(bg).connect(warm(k)).connect(pan)
  return len + 0.15
}

/** A vibraphone bar: a sine and its 4th partial, a mallet tick, the motor's tremolo. */
const vibe = (k: Kit, out: AudioNode, t: number, f: number, peak: number, t60: number): void => {
  const trem = gainNode(k, 0.82)
  const lfo = osc(k, 'sine', 5.6, t, t60 + 0.1)
  lfo.connect(gainNode(k, 0.18)).connect(trem.gain)
  trem.connect(out)
  osc(k, 'sine', f, t, t60 + 0.05).connect(gainAD(k, t, peak, 0.003, t60)).connect(trem)
  osc(k, 'sine', f * 4, t, t60 * 0.3 + 0.05).connect(gainAD(k, t, peak * 0.22, 0.002, t60 * 0.3)).connect(trem)
  click(k, out, t, Math.min(9000, f * 6), 2, peak * 0.4, 2)
}

/**
 * COOL — Chad lands, sunglasses on: a lazy vibraphone "yeah" (F#+A sliding
 * up into D+A that rings out on its tremolo) and the glint off his shades.
 */
const cool: Recipe = (k, o, t) => {
  const g = both(k, o, 0.7)
  vibe(k, g, t, midiHz(66), 0.09, 0.22)
  vibe(k, g, t, midiHz(69), 0.09, 0.22)
  // The slide into the second chord: a soft voice gliding A4 → D5.
  const sl = osc(k, 'triangle', midiHz(69), t + 0.06, 0.3)
  sweep(sl.frequency, t + 0.06, midiHz(69), midiHz(74), 0.08)
  sl.connect(filter(k, 'lowpass', 1800)).connect(gainAD(k, t + 0.06, 0.05, 0.03, 0.15)).connect(g)
  const t2 = t + 0.13
  vibe(k, g, t2, midiHz(74), 0.15, 1.1)
  vibe(k, g, t2, midiHz(81), 0.085, 0.9)
  // The glint: a sweep of sparkle and two tiny high chimes.
  const tg = t2 + 0.04
  const sp = noise(k, tg, 0.2)
  const sbp = filter(k, 'bandpass', 5000, 3)
  sweep(sbp.frequency, tg, 5000, 9500, 0.14)
  sp.connect(sbp).connect(gainAD(k, tg, 0.06, 0.02, 0.12)).connect(g)
  chime(k, panned(k, 0.3, g), tg + 0.02, midiHz(90), 0.022)
  chime(k, panned(k, 0.45, g), tg + 0.06, midiHz(93), 0.016)
  return 1.4
}

/**
 * BUTTON — a pressure button in the level: a chunky plastic "thock", the
 * mechanism latching underneath, a valve hiss as the current changes, and
 * the switch answering in key (A5 → D6).
 */
const button: Recipe = (k, o, t) => {
  click(k, o.dry, t, between(k, 1600, 2000), 2, 0.28, 3)
  ring(k, o.dry, t, between(k, 480, 520), [[1, 1, 0.09], [2.32, 0.45, 0.05], [4.1, 0.2, 0.03]], 0.16)
  membrane(k, o.dry, t, 190, 110, 0.22, 0.06, 0.03)
  click(k, o.dry, t + 0.045, between(k, 3300, 3700), 4, 0.15, 2)
  const ta = t + 0.05
  const hiss = noise(k, ta, 0.5, k.pink)
  const hb = filter(k, 'bandpass', 2600, 1.2)
  sweep(hb.frequency, ta, 3200, 900, 0.4)
  const hg = k.ctx.createGain()
  hg.gain.setValueAtTime(0, ta)
  hg.gain.linearRampToValueAtTime(0.16, ta + 0.04)
  hg.gain.setTargetAtTime(0, ta + 0.08, 0.12)
  hiss.connect(hb).connect(hg).connect(both(k, o))
  const cg = both(k, o)
  celesta(k, cg, t + 0.06, midiHz(81), 0.055)
  celesta(k, cg, t + 0.15, midiHz(86), 0.065)
  return 1
}

/**
 * CHECKPOINT — a banner catching the wind (a few cloth snaps), a warm
 * breath of air rising, and chimes ringing it in on D5 A5 D6 E6 over a soft
 * open fifth — a smaller cousin of the win.
 */
const checkpoint: Recipe = (k, o, t) => {
  const flap = flapTrain(k, t, 0.5, (u) => 16 - 8 * u, 0.025, (u) => Math.pow(1 - u, 1.5))
  flap.connect(filter(k, 'bandpass', 800, 0.9)).connect(gainNode(k, 0.32)).connect(both(k, o, 0.7))
  membrane(k, o.dry, t, 240, 160, 0.16, 0.06, 0.02)
  const sw = noise(k, t, 0.9, k.pink)
  const sb = filter(k, 'bandpass', 500, 1)
  sweep(sb.frequency, t, 500, 1600, 0.6)
  const sg = k.ctx.createGain()
  sg.gain.setValueAtTime(0, t)
  sg.gain.linearRampToValueAtTime(0.1, t + 0.25)
  sg.gain.setTargetAtTime(0, t + 0.3, 0.18)
  sw.connect(sb).connect(sg).connect(both(k, o))
  ;[74, 81, 86, 88].forEach((m, i) => {
    chime(k, panned(k, -0.4 + i * 0.27, both(k, o)), t + 0.04 + i * 0.07, midiHz(m), 0.055 - i * 0.008)
  })
  for (const m of [62, 69]) {
    const o1 = osc(k, 'triangle', midiHz(m), t + 0.05, 1.3)
    const pg = k.ctx.createGain()
    pg.gain.setValueAtTime(0, t + 0.05)
    pg.gain.linearRampToValueAtTime(0.03, t + 0.3)
    pg.gain.setTargetAtTime(0, t + 0.45, 0.25)
    o1.connect(filter(k, 'lowpass', 1500)).connect(pg).connect(both(k, o))
  }
  return 2.4
}

/** TAP — a UI press: a small, cloth-muted wooden bar on A5, in key with the score. */
const tap: Recipe = (k, o, t) => {
  ring(k, o.dry, t, midiHz(81) * between(k, 0.998, 1.002), [[1, 1, 0.08], [3.93, 0.25, 0.025]], 0.36, 0.001)
  click(k, o.dry, t, 2400, 1.5, 0.3, 2)
  return 0.15
}

/** An airy swoosh for panels: `up` rises (opening), otherwise it falls (closing). */
const swoosh = (k: Kit, o: Out, t: number, up: boolean, peak: number): void => {
  const n = noise(k, t, 0.3, k.pink)
  const bp = filter(k, 'bandpass', 500, 1.1)
  sweep(bp.frequency, t, up ? 500 : 2200, up ? 2400 : 500, 0.16)
  const g = k.ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + 0.1)
  g.gain.setTargetAtTime(0, t + 0.12, 0.05)
  n.connect(bp).connect(g).connect(both(k, o, 0.6))
}

/** MENU-OPEN — a panel opens like a little canopy: a swoosh up, a soft pop, a D6. */
const menuOpen: Recipe = (k, o, t) => {
  swoosh(k, o, t, true, 0.18)
  membrane(k, o.dry, t + 0.11, 240, 170, 0.15, 0.06, 0.02)
  celesta(k, both(k, o), t + 0.11, midiHz(86), 0.045)
  return 0.6
}

/** MENU-CLOSE — the panel folds away: a swoosh down, a softer puff, an A5. */
const menuClose: Recipe = (k, o, t) => {
  swoosh(k, o, t, false, 0.15)
  membrane(k, o.dry, t + 0.1, 170, 110, 0.12, 0.06, 0.03)
  celesta(k, both(k, o), t + 0.1, midiHz(81), 0.035)
  return 0.6
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
  bump,
  whoosh,
  cool,
  button,
  checkpoint,
  tap,
  'menu-open': menuOpen,
  'menu-close': menuClose
} satisfies Record<string, Recipe>

export type SfxName = keyof typeof RECIPES

/** Per-sound trim (linear), set from the level report so the hierarchy holds. */
export const SFX_TRIM: Record<SfxName, number> = {
  open: 1.68, // +4.5 dB
  close: 2.5, // +8 dB
  break: 1.7, // +4.6 dB
  land: 2.8, // +9 dB
  step: 4.5, // +13 dB
  splat: 2.3, // +7.2 dB
  hit: 3.16, // +10 dB
  lunge: 2,
  arrive: 2,
  win: 0.68, // −3.3 dB
  whistle: 0.7, // −3 dB
  bump: 1.6, // +4 dB: a bump sits under a death hit, a charge bump about level with it
  whoosh: 2, // +6 dB: about level with the umbrella opening
  cool: 1.1, // +0.8 dB: under the whoosh, over the steps
  button: 2, // +6 dB: under an open, clearly over the wind
  checkpoint: 1.75, // +4.9 dB: between an open and the win
  tap: 2.1, // +6.4 dB: UI sits under every gameplay sound
  'menu-open': 1.9, // +5.6 dB
  'menu-close': 2.2 // +6.8 dB: a touch under the opening
}

/** Seconds the music ducks under a sound, and how deep (dB). */
export const SFX_DUCK: Partial<Record<SfxName, [db: number, hold: number]>> = {
  break: [-7, 0.6],
  splat: [-8, 0.5],
  hit: [-7, 0.4],
  win: [-6, 1.6],
  whistle: [-4, 0.8],
  checkpoint: [-3, 0.8]
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

/** Layer levels for the wind bed, set from the level report. */
const SING = 1.8
const LOW_HOWL = 0.3
const CANOPY = 1
const RATTLE = 0.2

/**
 * The sky, as layers over looping noise sources:
 *   bed     — a soft, always-there breeze, wide (two decorrelated sides),
 *             each side breathing on its own slow LFOs;
 *   gusts   — three unrelated slow swells summed and rectified, so a gust
 *             comes now and then instead of on a beat;
 *   stream  — the whoosh of an updraft, brighter the stronger it blows;
 *   sing    — the wind singing across the ribs: narrow bands tuned to A and
 *             E, the two notes that sit in every chord of the score;
 *   roar    — a Super Stream's deep rumble and low howl (on A3);
 *   canopy  — the open umbrella's fabric luffing: irregular flaps, faster
 *             and harder with the wind and the speed;
 *   rush    — air tearing past a closed fall, rising with speed;
 *   rattle  — the closed canopy's ribs shuddering near terminal velocity:
 *             the audible warning that reopening now will break it;
 *   mine    — a spinning, metallic whirr that swells as a mine comes close;
 *   pillar  — a pillar creature's slow, low breathing when you are near it.
 */
export const createAmbience = (k: Kit, out: AudioNode, t0: number): Ambience => {
  const { ctx } = k
  const loop = (buf: AudioBuffer, offset: number) => {
    const s = ctx.createBufferSource()
    s.buffer = buf
    s.loop = true
    s.start(t0, offset)
    return s
  }
  const pink = loop(k.pink, 0)
  // The same loop from its other half: decorrelated enough for a wide bed.
  const pinkR = loop(k.pink, k.pink.duration * 0.5)
  const white = loop(k.white, 0)
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

  // Bed: a breeze that breathes on its own, left and right apart.
  const bed = gainNode(k, 0)
  bed.gain.setValueAtTime(0, t0)
  bed.gain.linearRampToValueAtTime(0.09, t0 + 3)
  for (const [src, pan, a, b, f] of [[pink, -0.6, 0.071, 0.123, 0.09], [pinkR, 0.6, 0.083, 0.109, 0.077]] as const) {
    const lp = filter(k, 'lowpass', 420, 0.6)
    const breath = gainNode(k, 1)
    lfo(a, 0.3, breath.gain)
    lfo(b, 0.22, breath.gain)
    lfo(f, 140, lp.frequency)
    src.connect(lp).connect(breath).connect(panned(k, pan, bed))
  }
  bed.connect(out)
  const air = filter(k, 'bandpass', 2600, 0.7)
  const airG = gainNode(k, 0.012)
  lfo(0.057, 0.008, airG.gain)
  white.connect(air).connect(airG).connect(bed)
  // Gusts: the rectified sum of three slow, unrelated swells drives a mid band.
  const gustShape = ctx.createWaveShaper()
  const gc = new Float32Array(257)
  for (let i = 0; i < gc.length; i++) gc[i] = Math.pow(Math.max(0, (i / 128 - 1 - 0.3) / 0.7), 2)
  gustShape.curve = gc
  for (const f of [0.043, 0.067, 0.029]) {
    const o = ctx.createOscillator()
    o.frequency.value = f
    o.connect(gainNode(k, 0.34)).connect(gustShape)
    o.start(t0)
  }
  const gustBp = filter(k, 'bandpass', 700, 0.8)
  lfo(0.05, 250, gustBp.frequency)
  const gust = gainNode(k, 0)
  gustShape.connect(gust.gain)
  pinkR.connect(gustBp).connect(gust).connect(gainNode(k, 0.9)).connect(bed)

  // Stream + the singing ribs, panned toward the current.
  const streamPan = ctx.createStereoPanner()
  streamPan.connect(out)
  const streamBp = filter(k, 'bandpass', 400, 0.8)
  const stream = gainNode(k, 0)
  lfo(0.31, 90, streamBp.frequency)
  pink.connect(streamBp).connect(stream).connect(streamPan)
  const sing = gainNode(k, 0)
  for (const [f, a, rate] of [[880, 1, 0.21], [1318.5, 0.55, 0.26], [440, 0.6, 0.17]] as const) {
    const bp = filter(k, 'bandpass', f, 90)
    lfo(rate, f * 0.0025, bp.frequency) // a few cents of drift, never off the note
    white.connect(bp).connect(gainNode(k, a)).connect(sing)
  }
  sing.connect(streamPan)

  // Super Stream: rumble and a low howl on A3.
  const roarLp = filter(k, 'lowpass', 240, 0.9)
  const roar = gainNode(k, 0)
  pink.connect(roarLp).connect(roar).connect(streamPan)
  const lowHowlBp = filter(k, 'bandpass', 220, 14)
  const lowHowl = gainNode(k, 0)
  lfo(0.19, 2, lowHowlBp.frequency)
  white.connect(lowHowlBp).connect(lowHowl).connect(streamPan)

  // Canopy luffing: two bands of fabric noise, gated by irregular flaps.
  const canFlaps = loop(k.flaps, 0)
  const canAm = gainNode(k, 0.12)
  canFlaps.connect(gainNode(k, 0.9)).connect(canAm.gain)
  white.connect(filter(k, 'bandpass', 750, 0.9)).connect(canAm)
  white.connect(filter(k, 'bandpass', 2400, 1.3)).connect(gainNode(k, 0.45)).connect(canAm)
  const canopy = gainNode(k, 0)
  canAm.connect(canopy).connect(out)

  // Rush of a closed fall.
  const rushHp = filter(k, 'highpass', 250)
  const rushBp = filter(k, 'bandpass', 500, 0.6)
  const rush = gainNode(k, 0)
  pinkR.connect(rushHp).connect(rushBp).connect(rush).connect(out)

  // Near-break rattle: the ribs' metal resonances, shuddering in fast flaps.
  const ratFlaps = loop(k.flaps, k.flaps.duration * 0.37)
  const ratAm = gainNode(k, 0.08)
  ratFlaps.connect(ratAm.gain)
  white.connect(filter(k, 'bandpass', 1250, 2.2)).connect(ratAm)
  white.connect(filter(k, 'bandpass', 2350, 9)).connect(gainNode(k, 1.6)).connect(ratAm)
  white.connect(filter(k, 'bandpass', 3720, 10)).connect(gainNode(k, 1.2)).connect(ratAm)
  const rattle = gainNode(k, 0)
  ratAm.connect(rattle).connect(out)

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
      const c = clamp01(s.canopy)
      to(streamPan.pan, Math.max(-0.7, Math.min(0.7, s.pan)) * (1 - 0.6 * any), at, 0.2)
      to(stream.gain, 0.42 * Math.pow(any, 1.3), at, smooth * 2)
      to(streamBp.frequency, 380 + 800 * w + 500 * sw, at, smooth * 3)
      to(sing.gain, SING * (Math.pow(w, 1.5) * (0.45 + 0.55 * c) + 0.6 * sw), at, smooth * 4)
      to(roar.gain, 0.6 * Math.pow(sw, 1.2), at, smooth * 2)
      to(lowHowl.gain, LOW_HOWL * sw, at, smooth * 3)
      to(canopy.gain, c * CANOPY * (0.012 + 0.07 * w + 0.12 * sw + 0.08 * sp), at, smooth)
      to(canFlaps.playbackRate, (6 + 8 * any + 10 * sp) / 10, at, smooth)
      to(rush.gain, 0.45 * Math.pow(sp, 2) * (1 - 0.5 * c), at, smooth)
      to(rushBp.frequency, 380 + 2600 * sp * sp, at, smooth)
      const d = clamp01(s.danger)
      to(rattle.gain, RATTLE * d * d, at, smooth * 0.6)
      to(ratFlaps.playbackRate, (18 + 16 * d) / 10, at, smooth)
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
