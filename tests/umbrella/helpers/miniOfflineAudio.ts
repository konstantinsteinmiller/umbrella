// A tiny offline Web Audio renderer for tests (jsdom has no OfflineAudioContext).
//
// Implements the subset the synthesised sounds use — gain, biquad (lowpass /
// highpass / bandpass), oscillators, looping buffer sources, stereo panner,
// AudioParam automation (set / linear / exponential / target / cancel) and
// audio-rate modulation of params — sample by sample, in stereo. Accurate
// enough to catch NaN, runaway levels, clipping and silence; not a reference
// implementation.

type Frame = [number, number]

class MiniParam {
  intrinsic: number
  events: { type: 'set' | 'linear' | 'exp' | 'target'; time: number; v: number; tc?: number }[] = []
  inputs: MiniNode[] = []
  constructor(v: number, private ctx: MiniOfflineAudioContext) { this.intrinsic = v }
  get value() { return this.events.length ? this.valueAt(this.ctx.currentTime) : this.intrinsic }
  set value(v: number) { this.intrinsic = v }
  private add(e: MiniParam['events'][number]) {
    let i = this.events.length
    while (i > 0 && this.events[i - 1]!.time > e.time) i--
    this.events.splice(i, 0, e)
    return this
  }
  setValueAtTime(v: number, time: number) { return this.add({ type: 'set', time, v }) }
  linearRampToValueAtTime(v: number, time: number) { return this.add({ type: 'linear', time, v }) }
  exponentialRampToValueAtTime(v: number, time: number) { return this.add({ type: 'exp', time, v }) }
  setTargetAtTime(v: number, time: number, tc: number) { return this.add({ type: 'target', time, v, tc }) }
  cancelScheduledValues(time: number) { this.events = this.events.filter((e) => e.time < time); return this }
  valueAt(t: number): number {
    let curT = 0
    let curV = this.intrinsic
    const ev = this.events
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i]!
      if (e.type === 'linear' || e.type === 'exp') {
        if (t < e.time) {
          const f = e.time > curT ? (t - curT) / (e.time - curT) : 1
          if (e.type === 'linear') return curV + (e.v - curV) * f
          return curV > 0 && e.v > 0 ? curV * Math.pow(e.v / curV, f) : curV
        }
        curT = e.time
        curV = e.v
        continue
      }
      if (t < e.time) return curV
      if (e.type === 'set') {
        curT = e.time
        curV = e.v
        continue
      }
      // target
      const next = ev[i + 1]
      const end = next ? next.time : Infinity
      const at = (x: number) => e.v + (curV - e.v) * Math.exp(-(x - e.time) / Math.max(1e-9, e.tc!))
      if (t < end) return at(t)
      curV = at(end)
      curT = end
    }
    return curV
  }
  sample(i: number, t: number): number {
    let v = this.events.length ? this.valueAt(t) : this.intrinsic
    for (const n of this.inputs) {
      const [l, r] = n.out(i)
      v += 0.5 * (l + r)
    }
    return v
  }
}

abstract class MiniNode {
  inputs: MiniNode[] = []
  private lastI = -1
  private last: Frame = [0, 0]
  constructor(protected ctx: MiniOfflineAudioContext) {}
  connect<T>(dest: T): T {
    if (dest instanceof MiniParam) dest.inputs.push(this)
    else (dest as unknown as MiniNode).inputs.push(this)
    return dest
  }
  disconnect() { /* graph is rendered as built; disconnect after the fact is ignored */ }
  protected sumInputs(i: number): Frame {
    let l = 0
    let r = 0
    for (const n of this.inputs) {
      const [a, b] = n.out(i)
      l += a
      r += b
    }
    return [l, r]
  }
  out(i: number): Frame {
    if (i !== this.lastI) {
      this.lastI = i
      this.last = this.compute(i, i / this.ctx.sampleRate)
    }
    return this.last
  }
  protected abstract compute(i: number, t: number): Frame
}

class MiniGain extends MiniNode {
  gain = new MiniParam(1, this.ctx)
  protected compute(i: number, t: number): Frame {
    const [l, r] = this.sumInputs(i)
    const g = this.gain.sample(i, t)
    return [l * g, r * g]
  }
}

class MiniBiquad extends MiniNode {
  type: BiquadFilterType = 'lowpass'
  frequency = new MiniParam(350, this.ctx)
  Q = new MiniParam(1, this.ctx)
  private s = [[0, 0, 0, 0], [0, 0, 0, 0]]
  protected compute(i: number, t: number): Frame {
    const x = this.sumInputs(i)
    const sr = this.ctx.sampleRate
    const f = Math.max(10, Math.min(sr * 0.49, this.frequency.sample(i, t)))
    const qRaw = this.Q.sample(i, t)
    // Web Audio reads a lowpass / highpass Q in dB, a bandpass Q linearly.
    const q = Math.max(1e-4, this.type === 'bandpass' ? qRaw : Math.pow(10, qRaw / 20))
    const w0 = (2 * Math.PI * f) / sr
    const cw = Math.cos(w0)
    const alpha = Math.sin(w0) / (2 * q)
    let b0: number, b1: number, b2: number
    if (this.type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2 }
    else if (this.type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha }
    else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2 }
    const a0 = 1 + alpha
    const a1 = -2 * cw
    const a2 = 1 - alpha
    const y: Frame = [0, 0]
    for (let c = 0; c < 2; c++) {
      const st = this.s[c]!
      const v = (b0 * x[c]! + b1 * st[0]! + b2 * st[1]! - a1 * st[2]! - a2 * st[3]!) / a0
      st[1] = st[0]!; st[0] = x[c]!; st[3] = st[2]!; st[2] = v
      y[c] = v
    }
    return y
  }
}

class MiniScheduled extends MiniNode {
  protected startAt = Infinity
  protected stopAt = Infinity
  start(when = 0, _offset = 0) { this.startAt = when; this.offset = _offset }
  stop(when = 0) { this.stopAt = when }
  protected offset = 0
  protected playing(t: number) { return t >= this.startAt && t < this.stopAt }
  protected compute(): Frame { return [0, 0] }
}

class MiniOscillator extends MiniScheduled {
  type: OscillatorType = 'sine'
  frequency = new MiniParam(440, this.ctx)
  detune = new MiniParam(0, this.ctx)
  private phase = 0
  protected compute(i: number, t: number): Frame {
    if (!this.playing(t)) return [0, 0]
    const f = this.frequency.sample(i, t)
    const p = this.phase
    this.phase = (p + f / this.ctx.sampleRate) % 1
    let v: number
    if (this.type === 'square') v = p < 0.5 ? 1 : -1
    else if (this.type === 'sawtooth') v = 2 * p - 1
    else if (this.type === 'triangle') v = 1 - 4 * Math.abs(p - 0.5)
    else v = Math.sin(2 * Math.PI * p)
    return [v, v]
  }
}

class MiniBufferSource extends MiniScheduled {
  buffer: MiniBuffer | null = null
  loop = false
  playbackRate = new MiniParam(1, this.ctx)
  protected compute(i: number, t: number): Frame {
    const b = this.buffer
    if (!b || !this.playing(t)) return [0, 0]
    let k = Math.floor((t - this.startAt + this.offset) * b.sampleRate)
    if (this.loop) k %= b.length
    else if (k >= b.length) return [0, 0]
    const l = b.channels[0]![k]!
    const r = (b.channels[1] ?? b.channels[0]!)[k]!
    return [l, r]
  }
}

class MiniPanner extends MiniNode {
  pan = new MiniParam(0, this.ctx)
  protected compute(i: number, t: number): Frame {
    const [l, r] = this.sumInputs(i)
    const p = Math.max(-1, Math.min(1, this.pan.sample(i, t)))
    // Web Audio's StereoPannerNode, stereo input.
    if (p <= 0) {
      const x = (p + 1) * Math.PI / 2
      return [l + r * Math.cos(x), r * Math.sin(x)]
    }
    const x = p * Math.PI / 2
    return [l * Math.cos(x), r + l * Math.sin(x)]
  }
}

class MiniDestination extends MiniNode {
  protected compute(i: number): Frame { return this.sumInputs(i) }
}

class MiniBuffer {
  channels: Float32Array[]
  constructor(n: number, readonly length: number, readonly sampleRate: number) {
    this.channels = Array.from({ length: n }, () => new Float32Array(length))
  }
  get duration() { return this.length / this.sampleRate }
  get numberOfChannels() { return this.channels.length }
  getChannelData(c: number) { return this.channels[c]! }
}

export class MiniOfflineAudioContext {
  currentTime = 0
  state = 'running'
  readonly destination: MiniDestination
  constructor(readonly sampleRate: number, readonly seconds: number) {
    this.destination = new MiniDestination(this)
  }
  createGain() { return new MiniGain(this) }
  createBiquadFilter() { return new MiniBiquad(this) }
  createOscillator() { return new MiniOscillator(this) }
  createBufferSource() { return new MiniBufferSource(this) }
  createStereoPanner() { return new MiniPanner(this) }
  createBuffer(ch: number, n: number, sr: number) { return new MiniBuffer(ch, n, sr) }
  /** Render the whole graph: [left, right]. */
  render(): [Float32Array, Float32Array] {
    const n = Math.ceil(this.seconds * this.sampleRate)
    const L = new Float32Array(n)
    const R = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      this.currentTime = i / this.sampleRate
      const [l, r] = this.destination.out(i)
      L[i] = l
      R[i] = r
    }
    return [L, R]
  }
  /** As the type the sound code expects. */
  get asContext(): BaseAudioContext { return this as unknown as BaseAudioContext }
}

/** Peak, RMS and NaN count of a render, optionally over [from, to) seconds. */
export const stats = ([L, R]: [Float32Array, Float32Array], sr: number, from = 0, to = Infinity) => {
  let peak = 0
  let sum = 0
  let nan = 0
  const a = Math.floor(from * sr)
  const b = Math.min(L.length, Math.floor(to * sr))
  for (let i = a; i < b; i++) {
    for (const v of [L[i]!, R[i]!]) {
      if (!Number.isFinite(v)) { nan++; continue }
      peak = Math.max(peak, Math.abs(v))
      sum += v * v
    }
  }
  const count = Math.max(1, (b - a) * 2)
  return { peak, rms: Math.sqrt(sum / count), nan }
}
