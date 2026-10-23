import { describe, expect, it } from 'vitest'
import {
  CHARGE_TELL, createEnemyBed, createEnemyCues, createEnemyKit, createEnemySounds, ENEMY_BED_IDLE, ENEMY_RECIPES, ENEMY_TRIM,
  type EnemyCue, type EnemySfxName, type EnemySfxParams
} from '@/umbrella/enemySounds'
import { createWorld, step, type Input } from '@/umbrella/engine'
import type { HazardDef, LevelDef } from '@/umbrella/levels'
import { DEFAULT_TUNING } from '@/umbrella/tuning'
import { MiniOfflineAudioContext, stats } from './helpers/miniOfflineAudio'

const SR = 16000

/** Render one recipe at its trim (dry, plus the room send at a stand-in level). */
const renderSfx = (name: EnemySfxName, params: EnemySfxParams, seconds = 2) => {
  const c = new MiniOfflineAudioContext(SR, seconds)
  const dry = c.createGain()
  dry.gain.value = ENEMY_TRIM[name]
  dry.connect(c.destination)
  const verb = c.createGain()
  verb.gain.value = ENEMY_TRIM[name] * 0.3
  verb.connect(c.destination)
  const len = ENEMY_RECIPES[name](createEnemyKit(c.asContext, 9), { dry: dry as unknown as AudioNode, verb: verb as unknown as AudioNode }, 0.02, params)
  return { out: c.render(), len }
}

/** Loudest 50 ms window (dBFS, unweighted). */
const momentary = ([L, R]: [Float32Array, Float32Array]) => {
  const w = Math.round(SR * 0.05)
  let best = 0
  for (let i = 0; i + w <= L.length; i += w >> 1) {
    let s = 0
    for (let j = i; j < i + w; j++) s += (L[j]! ** 2 + R[j]! ** 2) / 2
    best = Math.max(best, Math.sqrt(s / w))
  }
  return 20 * Math.log10(best + 1e-12)
}

const CASES: [EnemySfxName, EnemySfxParams][] = [
  ['walldorf-wake', { intensity: 1 }],
  ['walldorf-wake', { intensity: 0 }],
  ['walldorf-charge', { intensity: 1, lead: CHARGE_TELL, strike: 0.14 }],
  ['walldorf-charge', { intensity: 1, lead: 0, strike: 0.14 }],
  ['walldorf-charge', { intensity: 0, lead: 0.2, strike: 0.5 }],
  ['walldorf-bump', { intensity: 0 }],
  ['walldorf-bump', { intensity: 1 }],
  ['walldorf-slam', { intensity: 0 }],
  ['walldorf-slam', { intensity: 1 }],
  ['prickbait-alert', { intensity: 1 }],
  ['prickbait-sting', {}]
]

describe('enemy sounds render offline', () => {
  it('covers every recipe', () => {
    expect(new Set(CASES.map(([n]) => n))).toEqual(new Set(Object.keys(ENEMY_RECIPES)))
  })

  it.each(CASES)('%s %j: finite, audible, not clipping, and it ends', (name, params) => {
    const { out, len } = renderSfx(name, params)
    const all = stats(out, SR)
    expect(all.nan).toBe(0)
    // The kit's own loud sounds reach ~2.2 into the −3 dB bus limiter; an enemy
    // sound stays well under that and never relies on the limiter to survive.
    expect(all.peak).toBeLessThan(1.8)
    expect(momentary(out)).toBeGreaterThan(-24)
    expect(momentary(out)).toBeLessThan(-2)
    // Rings out inside the length it reports (the caller retires the voice on it).
    expect(len).toBeGreaterThan(0.2)
    expect(len).toBeLessThan(1.6)
    expect(stats(out, SR, 0.02 + len + 0.1, 2).peak).toBeLessThan(0.01)
  })

  it('a close charge is louder than a distant one, a slam louder than a bump', () => {
    const close = momentary(renderSfx('walldorf-charge', { intensity: 1, lead: 0.3 }).out)
    const far = momentary(renderSfx('walldorf-charge', { intensity: 0, lead: 0.3 }).out)
    expect(close - far).toBeGreaterThan(6)
    const bump = momentary(renderSfx('walldorf-bump', { intensity: 0.6 }).out)
    const slam = momentary(renderSfx('walldorf-slam', { intensity: 1 }).out)
    expect(slam - bump).toBeGreaterThan(2)
  })

  it('the charge tell is heard before the strike', () => {
    const { out } = renderSfx('walldorf-charge', { intensity: 1, lead: CHARGE_TELL, strike: 0.14 })
    // Most of the wind-up's energy sits in its last half, swelling into the strike.
    const early = stats(out, SR, 0.02, 0.02 + CHARGE_TELL / 2).rms
    const late = stats(out, SR, 0.02 + CHARGE_TELL / 2, 0.02 + CHARGE_TELL).rms
    expect(late).toBeGreaterThan(0.01)
    expect(late).toBeGreaterThan(early)
  })
})

describe('the enemy bed', () => {
  const renderBed = (state: Partial<typeof ENEMY_BED_IDLE>, seconds = 2) => {
    const c = new MiniOfflineAudioContext(SR, seconds)
    const bed = createEnemyBed(createEnemyKit(c.asContext, 4), c.destination as unknown as AudioNode, 0)
    for (let t = 0; t < seconds; t += 1 / 30) bed.set({ ...ENEMY_BED_IDLE, ...state }, t)
    return stats(c.render(), SR, 0.5, seconds)
  }

  it('is silent with no enemy near', () => {
    expect(renderBed({}).peak).toBeLessThan(1e-3)
  })

  it.each([
    ['mine close', { mine: 1, mineSpeed: 1, minePan: 0.8 }],
    ['mine far', { mine: 0.2 }],
    ['follower', { rumble: 1, rumblePan: -0.5 }],
    ['angry Walldorf', { angry: 1 }]
  ])('%s: finite and bounded', (_label, state) => {
    const s = renderBed(state)
    expect(s.nan).toBe(0)
    expect(s.peak).toBeLessThan(1)
    expect(s.rms).toBeGreaterThan(1e-3)
  })

  it('a mine ticks louder the closer it is', () => {
    expect(renderBed({ mine: 1 }).rms).toBeGreaterThan(renderBed({ mine: 0.3 }).rms * 2)
  })
})

describe('the enemy voice pool', () => {
  it('plays on the host SFX bus and kills its voices on mute', () => {
    const c = new MiniOfflineAudioContext(SR, 1)
    const dry = c.createGain()
    const verb = c.createGain()
    dry.connect(c.destination)
    verb.connect(c.destination)
    const ducks: number[] = []
    const sounds = createEnemySounds({
      ctx: c.asContext,
      mix: { sfx: { dry: dry as unknown as AudioNode, verb: verb as unknown as AudioNode } },
      duck: (db) => ducks.push(db)
    })
    sounds.play('walldorf-slam', { intensity: 1, pan: 0.5 })
    sounds.play('prickbait-alert')
    expect(sounds.activeVoices).toBe(2)
    expect(ducks).toEqual([-5])
    sounds.startBed()
    sounds.setBed({ ...ENEMY_BED_IDLE, mine: 1 })
    sounds.killVoices()
    expect(sounds.activeVoices).toBe(0)
    expect(stats(c.render(), SR).nan).toBe(0)
  })
})

// ─── Cues from the game world ──────────────────────────────────────────────

const T = DEFAULT_TUNING
const DT = 1 / 120
const idle: Input = { left: false, right: false, toggle: false }
const level = (hazards: HazardDef[], extra: Partial<LevelDef> = {}): LevelDef => ({
  id: 0, world: { w: 1280, h: 720 }, spawn: { x: 200, y: 400 },
  platforms: [{ x: 0, y: 400, w: 1280, h: 20 }], winds: [], hazards, ...extra
})
const run = (lv: LevelDef, seconds: number, setup?: (w: ReturnType<typeof createWorld>) => void) => {
  const w = createWorld(lv)
  setup?.(w)
  const cues = createEnemyCues()
  const heard: (EnemyCue & { at: number })[] = []
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const events = step(w, idle, DT, T)
    for (const c of cues.tick(w, events, T)) heard.push({ ...c, at: w.enemyTime })
    if (w.phase !== 'play') break
  }
  return { w, heard, cues }
}

describe('enemy cues', () => {
  it('a charging Walldorf telegraphs every strike, timed to it', () => {
    const period = 2
    const { heard } = run(level([{
      kind: 'pillar', x: 500, y: 300, w: 40, h: 100, contact: 'solid',
      motion: { kind: 'lunge', a: { x: 520, y: 350 }, b: { x: 700, y: 350 }, period }
    }]), 4.2)
    const charges = heard.filter((c) => c.name === 'walldorf-charge')
    expect(charges).toHaveLength(2)
    for (const [n, c] of charges.entries()) {
      // Fires `lead` s before the strike starts (at lungeRest of each cycle).
      expect(c.at + c.params.lead!).toBeCloseTo(n * period + T.lungeRest * period, 1)
      expect(c.params.lead!).toBeGreaterThan(CHARGE_TELL - 0.02)
      expect(c.params.strike!).toBeCloseTo(T.lungeStrike * period, 3)
    }
    // An angry Walldorf this close wakes once, not every tick.
    expect(heard.filter((c) => c.name === 'walldorf-wake')).toHaveLength(1)
  })

  it('a triggered Walldorf charges the moment it is set off', () => {
    const { w, heard } = run(level([{
      kind: 'pillar', x: 600, y: 100, w: 40, h: 100, contact: 'solid',
      motion: { kind: 'lunge', a: { x: 620, y: 150 }, b: { x: 620, y: 380 }, period: 2, trigger: true, radius: 300 }
    }], { platforms: [] }), 0.5, (w) => { w.player.x = 560; w.player.y = 200 })
    const charge = heard.find((c) => c.name === 'walldorf-charge')
    expect(w.hazards[0]!.lungeAt).toBeDefined()
    expect(charge?.params.lead).toBe(0)
  })

  it('a calm bouncy Walldorf boings; a charging one slams', () => {
    const bump = run(level([{ kind: 'pillar', x: 180, y: 300, w: 60, h: 100, contact: 'bounce' }]), 0.2, (w) => {
      w.player.x = 190
      w.player.y = 280
    })
    expect(bump.heard.map((c) => c.name)).toContain('walldorf-bump')
    expect(bump.heard.map((c) => c.name)).not.toContain('walldorf-slam')
    const slam = run(level([{
      kind: 'pillar', x: 100, y: 300, w: 40, h: 100, contact: 'bounce',
      motion: { kind: 'lunge', a: { x: 120, y: 350 }, b: { x: 400, y: 350 }, period: 2 }
    }]), 1.5)
    expect(slam.heard.map((c) => c.name)).toContain('walldorf-slam')
  })

  it('a mine alerts once on approach and stings on touch', () => {
    const near = run(level([{ kind: 'mine', x: 300, y: 330, w: 40, h: 40 }]), 0.3)
    expect(near.heard.filter((c) => c.name === 'prickbait-alert')).toHaveLength(1)
    const hit = run(level([{ kind: 'mine', x: 180, y: 340, w: 40, h: 40 }]), 0.2)
    expect(hit.w.phase).toBe('splat')
    expect(hit.heard.map((c) => c.name)).toContain('prickbait-sting')
  })

  it('the bed hears mines, angry Walldorfs and a moving follower, and goes idle outside play', () => {
    const { w, cues } = run(level([
      { kind: 'mine', x: 300, y: 330, w: 40, h: 40 },
      { kind: 'pillar', x: 420, y: 300, w: 40, h: 100, contact: 'solid', motion: { kind: 'lunge', a: { x: 440, y: 350 }, b: { x: 600, y: 350 }, period: 2 } },
      { kind: 'pillar', x: 500, y: 300, w: 40, h: 100, contact: 'bounce', motion: { kind: 'follow', speed: 60, axis: 'x' } }
    ]), 0.3)
    const s = cues.bed(w, T, DT)
    expect(s.mine).toBeGreaterThan(0.5)
    expect(s.angry).toBeGreaterThan(0.3)
    expect(s.rumble).toBeGreaterThan(0.1)
    expect(s.minePan).toBeGreaterThan(0)
    w.phase = 'win'
    expect(cues.bed(w, T, DT)).toEqual(ENEMY_BED_IDLE)
  })
})
