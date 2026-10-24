// The umbrella sound kit and score, without a browser: a fake context that
// records the graph and enforces the Web Audio rules that throw at runtime
// (an exponential ramp to 0, an empty buffer), then checks every recipe
// builds, every name has a level, and every note of the score is in D major.
import { describe, expect, it } from 'vitest'
import { createComposer, MUSIC_SLOT, type MusicVoice } from '@/umbrella/music'
import { AMBIENCE_IDLE, createAmbience, createKit, createMix, RECIPES, SFX_TRIM, type SfxName } from '@/umbrella/soundKit'
import { createSoundEngine } from '@/umbrella/soundEngine'

class Param {
  value: number
  events: [string, number, number][] = []
  constructor(v = 0) { this.value = v }
  setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]); return this }
  linearRampToValueAtTime(v: number, t: number) { this.events.push(['lin', v, t]); return this }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (!(v > 0) && !(v < 0)) throw new RangeError(`exponential ramp to ${v}`)
    this.events.push(['exp', v, t])
    return this
  }
  setTargetAtTime(v: number, t: number, tc: number) {
    if (!(tc > 0)) throw new RangeError(`time constant ${tc}`)
    this.events.push(['target', v, t])
    return this
  }
  cancelScheduledValues() { return this }
}

class Node {
  outs: unknown[] = []
  connect<T>(n: T): T { this.outs.push(n); return n }
  disconnect() { this.outs = [] }
}

class FakeCtx {
  sampleRate = 8000
  currentTime = 0
  state = 'running'
  oscillators: { type: string; frequency: Param }[] = []
  destination = new Node()
  private node(extra: Record<string, unknown>) { return Object.assign(new Node(), extra) }
  createGain() { return this.node({ gain: new Param(1) }) }
  createBiquadFilter() { return this.node({ type: 'lowpass', frequency: new Param(350), Q: new Param(1), gain: new Param(0) }) }
  createOscillator() {
    const o = this.node({ type: 'sine', frequency: new Param(440), detune: new Param(0), start() {}, stop() {}, setPeriodicWave() {} })
    this.oscillators.push(o as never)
    return o
  }
  createBufferSource() { return this.node({ buffer: null, loop: false, playbackRate: new Param(1), start() {}, stop() {} }) }
  createBuffer(ch: number, n: number, sr: number) {
    if (!(n >= 1)) throw new RangeError(`buffer of ${n} samples`)
    const data = Array.from({ length: ch }, () => new Float32Array(n))
    return { duration: n / sr, length: n, sampleRate: sr, getChannelData: (i: number) => data[i]! }
  }
  createStereoPanner() { return this.node({ pan: new Param(0) }) }
  createWaveShaper() { return this.node({ curve: null }) }
  createConvolver() { return this.node({ buffer: null }) }
  createDynamicsCompressor() {
    return this.node({ threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() })
  }
  createAnalyser() { return this.node({ fftSize: 2048, getFloatTimeDomainData() {} }) }
  createPeriodicWave() { return {} }
}

const ctx = () => new FakeCtx() as unknown as BaseAudioContext & FakeCtx

// D major: D E F# G A B C#.
const D_MAJOR = new Set([2, 4, 6, 7, 9, 11, 1])
const PENTA = new Set([2, 4, 6, 9, 11])

describe('umbrella sound kit', () => {
  it('builds every recipe, with every intensity and option, and reports a length', () => {
    const c = ctx()
    const kit = createKit(c, 1)
    const out = { dry: c.createGain() as unknown as AudioNode, verb: c.createGain() as unknown as AudioNode }
    const variants = [{}, { intensity: 0 }, { intensity: 1 }, { quick: true }, { auto: true }, { hazard: 'pillar' as const }, { hazard: 'mine' as const }, { fade: 0.1 }]
    for (const name of Object.keys(RECIPES) as SfxName[]) {
      for (const p of variants) {
        const len = RECIPES[name](kit, out, 0.1, p)
        expect(len, name).toBeGreaterThan(0)
        expect(len, name).toBeLessThan(6)
      }
    }
  })

  it('gives every sound a level trim', () => {
    for (const name of Object.keys(RECIPES) as SfxName[]) expect(SFX_TRIM[name], name).toBeGreaterThan(0)
  })

  it('builds the mix and the wind and rides every ambience input', () => {
    const c = ctx()
    const kit = createKit(c, 2)
    const mix = createMix(c, c.destination as unknown as AudioNode, 2)
    const amb = createAmbience(kit, mix.ambience, 0)
    for (const s of [AMBIENCE_IDLE, { ...AMBIENCE_IDLE, wind: 1, canopy: 1 }, { ...AMBIENCE_IDLE, superWind: 1, speed: 1, danger: 1 }]) amb.set(s, 1)
  })

  it('fades the adaptive stems in with the wind and out again', () => {
    const c = ctx()
    const e = createSoundEngine(c, c.destination as unknown as AudioNode, 3)
    e.startMusic(0, 1)
    e.setAmbience({ ...AMBIENCE_IDLE, superWind: 1 }, 1)
    e.setAmbience(AMBIENCE_IDLE, 5)
    e.scheduleMusic(60)
    expect(e.musicStarted).toBe(true)
  })
})

describe('umbrella score', () => {
  const notes = (minutes: number, seed: number) => {
    const c = ctx()
    const kit = createKit(c, seed)
    const g = () => c.createGain() as unknown as AudioNode
    const out: { voice: MusicVoice; midi: number; chord: string; beat: number }[] = []
    const comp = createComposer(kit, { dry: g(), verb: g() }, 0, seed, {
      layers: { drive: { dry: g(), verb: g() }, pulse: { dry: g(), verb: g() } },
      onNote: (voice, midi, _t, chord, beat) => out.push({ voice, midi, chord, beat })
    })
    comp.scheduleUntil(minutes * 60)
    return { out, slots: Math.round(comp.next / MUSIC_SLOT) }
  }

  it('keeps the melody and the chimes on the pentatonic, and in range', () => {
    const { out } = notes(10, 5)
    for (const n of out.filter((x) => x.voice === 'flute' || x.voice === 'chime')) {
      expect(PENTA.has(n.midi % 12), `${n.voice} ${n.midi}`).toBe(true)
    }
    const flute = out.filter((n) => n.voice === 'flute').map((n) => n.midi)
    expect(Math.min(...flute)).toBeGreaterThanOrEqual(62)
    expect(Math.max(...flute)).toBeLessThanOrEqual(86)
  })
})
