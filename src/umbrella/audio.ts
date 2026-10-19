// ─── Synthesised SFX (no asset files) ───────────────────────────────────────
//
// One AudioContext behind a master gain the scene mutes whenever the game is
// paused (ads, hidden tab, portal pause).

let ctx: AudioContext | null = null
let master: GainNode | null = null

const ac = (): AudioContext | null => {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  master = ctx.createGain()
  master.gain.value = 0.5
  master.connect(ctx.destination)
  return ctx
}

/** Call from a user gesture so the context may start. */
export const unlockAudio = (): void => {
  const c = ac()
  if (c && c.state === 'suspended') void c.resume()
}

export const setAudioMuted = (muted: boolean): void => {
  const c = ac()
  if (!c || !master) return
  master.gain.setTargetAtTime(muted ? 0 : 0.5, c.currentTime, 0.02)
}

const tone = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number, fadeFrom = 0) => {
  const c = ac()
  if (!c || !master || c.state !== 'running') return
  const t = c.currentTime
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  g.gain.setValueAtTime(vol, t)
  if (fadeFrom > 0) g.gain.setValueAtTime(vol, t + fadeFrom)
  g.gain.linearRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

const noise = (dur: number, vol: number, lowpass: number) => {
  const c = ac()
  if (!c || !master || c.state !== 'running') return
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = lowpass
  const g = c.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(master)
  src.start()
}

export const sfx = {
  open: () => { noise(0.12, 0.5, 2500); tone('triangle', 300, 520, 0.1, 0.15) },
  close: () => { noise(0.08, 0.35, 1800); tone('triangle', 420, 240, 0.08, 0.12) },
  break: () => { noise(0.3, 0.7, 4000); tone('sawtooth', 600, 120, 0.3, 0.12) },
  land: () => noise(0.08, 0.4, 600),
  splat: () => { noise(0.35, 0.9, 900); tone('sine', 160, 40, 0.3, 0.4) },
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone('square', f, f, 0.14, 0.08), i * 110)),
  /** Looney-Tunes falling whistle, faded to silence over `fade` seconds. */
  whistle: (fade: number) => tone('sine', 2200, 500, Math.max(0.1, fade), 0.2, fade * 0.4)
}
