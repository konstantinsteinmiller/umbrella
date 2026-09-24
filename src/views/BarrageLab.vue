<script setup lang="ts">
/**
 * ─── /#/barrage-lab — the board, full-screen, for visual iteration (DEV ONLY) ─
 *
 * Mounts BarrageBoard on a SANDBOX source (its own engine, provided through
 * `BOARD_SOURCE_KEY`) so scenes can be staged without touching the player's
 * saved run: `?scene=showcase|boss|enraged|danger|breach|fever|stress|ftue|firstboss`
 * (`firstboss`: row 9 with grunts on the board — the next shot's advance brings
 * the row-10 first boss and its roar; `&ftue=1` runs it as a first session),
 * `?clean=1` hides the dev bar, `?auto=1` auto-fires for perf runs.
 * `?live=1` skips the sandbox: the board runs on the REAL `useBarrage()` +
 * `useCollections()` exactly as GameScene mounts it (scenes are then inert).
 * `window.__barrageLab` exposes the same controls to CDP scripts.
 *
 * Dev tooling: the plain-English labels below are debug chrome, never shipped
 * (the route is gated on `import.meta.env.DEV` in the router).
 */
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import BarrageBoard from '@/components/barrage/BarrageBoard.vue'
import ParticleCanvas from '@/components/organisms/ParticleCanvas.vue'
import { createEngine, restoreEngine } from '@/barrage/engine/engine'
import { defaultConfig } from '@/barrage/engine/economy'
import type { BossKind, EngineListener, IBarrageEngine, Monster, MonsterKind, Pickup, Hazard, RunSnapshot, SkillId } from '@/barrage/engine/types'
import { BALL_SKINS, type BallSkinId } from '@/barrage/ballSkins'
import { BOARD_SOURCE_KEY, type BoardSource } from '@/barrage/render/source'
import { useScreenshake } from '@/use/useScreenshake'
import useBarrage from '@/barrage/state/useBarrage'

type Scene = 'showcase' | 'boss' | 'enraged' | 'danger' | 'breach' | 'fever' | 'stress' | 'ftue' | 'fresh' | 'firstboss'
const SCENES: Scene[] = ['showcase', 'boss', 'enraged', 'danger', 'breach', 'fever', 'stress', 'ftue', 'fresh', 'firstboss']

const route = useRoute()
const q = (k: string): string | null => {
  const v = route.query[k]
  return typeof v === 'string' ? v : null
}
const clean = ref(q('clean') === '1')
const autoFire = ref(q('auto') === '1')
const autoContinue = ref(true)

// ─── Scene builders (snapshots → a real engine with a valid grid) ─────────────
const FOOT: Record<MonsterKind, [number, number]> = {
  slime: [1, 1], goblin: [1, 1], ogre: [1, 1], centaur: [1, 1], dryad: [1, 1], caterpillar: [2, 1],
  imp: [1, 1], treant: [1, 1], carbuncle: [1, 1], cyclops: [1, 1], boss: [3, 3]
}
let nextId = 1
const mon = (kind: MonsterKind, col: number, row: number, hp: number, extra: Partial<Monster> = {}): Monster => {
  const [w, h] = FOOT[kind]
  return {
    id: nextId++, kind, corrupted: false, col, row, w, h, hp, maxHp: hp, frozen: 0, burnDmg: 0, burnTurns: 0,
    poisonStacks: 0, poisonDmg: 0, enraged: false, spawnRow: row, ...extra
  }
}
const pick = (kind: Pickup['kind'], col: number, row: number, skill?: SkillId): Pickup => {
  const p: Pickup = { id: nextId++, kind, col, row }
  if (skill) p.skill = skill
  if (kind === 'coin') p.amount = 25
  return p
}
const haz = (col: number, row: number): Hazard => ({ id: nextId++, col, row, turns: 1 })
const ladder = (n: number, top: number): number[] => {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(Math.max(1, top - Math.floor(Math.sqrt(i * 2.2))))
  return out
}

const snap = (
  row: number, monsters: Monster[], pickups: Pickup[], hazards: Hazard[], tray: number[],
  extra: Partial<RunSnapshot> = {}, cfg: Partial<RunSnapshot['config']> = {}
): RunSnapshot => ({
  v: 1,
  config: defaultConfig({ seed: 4242, trayCapacity: Math.max(12, tray.length), ballSpeed: 18, launchInterval: 0.06, pickupLuck: 0.3, ...cfg }),
  row,
  nextBossRow: Math.ceil((row + 1) / 10) * 10,
  monsters, pickups, hazards, tray,
  launcherX: 3.5, shields: 0, revives: 0, warcryArmed: false, chestTimer: 120, turn: 10, rng: 12345, nextId: nextId + 1,
  ...extra
})

const buildScene = (scene: Scene): IBarrageEngine => {
  nextId = 1
  const walkers: MonsterKind[] = ['slime', 'goblin', 'ogre', 'centaur', 'dryad', 'slime', 'slime']
  switch (scene) {
    case 'fresh':
      return createEngine(defaultConfig({ seed: 7, trayCapacity: 12 }))
    case 'ftue':
      return createEngine(defaultConfig({ seed: 7, ftue: true, trayCapacity: 2 }))
    case 'showcase': {
      const m: Monster[] = [
        mon('slime', 0, 0, 12), mon('goblin', 1, 0, 9), mon('caterpillar', 2, 0, 30), mon('dryad', 4, 0, 14),
        mon('ogre', 5, 0, 40), mon('centaur', 6, 0, 18),
        mon('slime', 0, 1, 26, { corrupted: true }), mon('slime', 2, 1, 7), mon('slime', 5, 1, 11), mon('ogre', 6, 1, 66, { corrupted: true }),
        mon('goblin', 0, 2, 8), mon('slime', 1, 2, 5), mon('caterpillar', 3, 2, 21), mon('slime', 5, 2, 4),
        mon('slime', 1, 3, 3), mon('dryad', 2, 3, 10), mon('slime', 4, 3, 1250),
        mon('ogre', 0, 4, 30, { frozen: 1 }), mon('slime', 3, 4, 9, { burnTurns: 2, burnDmg: 1 }), mon('slime', 6, 4, 8, { poisonStacks: 2, poisonDmg: 1 })
      ]
      const p = [pick('ball', 1, 1), pick('skill', 3, 1, 'meteor'), pick('coin', 4, 1), pick('skill', 6, 2, 'warcry'), pick('ball', 5, 3), pick('skill', 4, 5, 'legion')]
      return restoreEngine(snap(25, m, p, [haz(2, 2)], ladder(24, 10), { chestTimer: 1.5 }))
    }
    case 'boss':
    case 'enraged': {
      const kinds: BossKind[] = ['fire-dragon', 'slime-tower', 'worm', 'silver-dragon', 'troll', 'orc']
      const kind = kinds[Math.floor(Number(q('boss') ?? 0)) % kinds.length] ?? 'fire-dragon'
      const enr = scene === 'enraged'
      const m: Monster[] = [
        mon('boss', 2, 1, enr ? 260 : 980, { bossKind: kind, enraged: enr, maxHp: 1000 }),
        mon('slime', 0, 0, 14), mon('goblin', 1, 1, 12), mon('slime', 5, 1, 16), mon('ogre', 6, 0, 30),
        mon('slime', 0, 3, 9), mon('dryad', 6, 3, 12), mon('slime', 1, 4, 7), mon('slime', 5, 4, 8)
      ]
      const p = [pick('ball', 3, 5), pick('skill', 0, 5, 'execute')]
      const s = snap(30, m, p, [], ladder(30, 12))
      const e = restoreEngine(s)
      e.state.bossId = m[0]!.id
      return e
    }
    case 'danger': {
      const m: Monster[] = []
      for (let c = 0; c < 7; c++) if (c !== 3) m.push(mon(walkers[c % walkers.length]!, c, 8, 20 + c * 3))
      m.push(mon('slime', 1, 6, 9), mon('ogre', 4, 7, 44), mon('slime', 5, 5, 6))
      return restoreEngine(snap(40, m, [pick('skill', 3, 4, 'shield')], [], ladder(18, 8), { shields: 1 }))
    }
    case 'firstboss': {
      // Row 9, grunts spread over the board: the next advance spawns the row-10
      // Slime Tower (the run's first boss), which roars them all away.
      const m: Monster[] = []
      const kinds: MonsterKind[] = ['slime', 'goblin', 'slime', 'slime', 'goblin', 'slime', 'slime']
      for (let i = 0; i < 11; i++) m.push(mon(kinds[i % kinds.length]!, (i * 3) % 7, 2 + Math.floor(i / 3), 60 + i * 7))
      return restoreEngine(snap(9, m, [pick('ball', 3, 1)], [], [1, 1, 1], {}, { ftue: q('ftue') === '1' }))
    }
    case 'breach': {
      // One march from the line: the next advance breaches (OVERRUN → meteor continue).
      const m: Monster[] = [mon('ogre', 0, 9, 900), mon('slime', 2, 9, 900), mon('goblin', 5, 9, 900), mon('slime', 6, 8, 900), mon('dryad', 1, 7, 900)]
      return restoreEngine(snap(45, m, [], [], [1, 1]))
    }
    case 'fever': {
      const m: Monster[] = []
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if ((r + c) % 5 === 0) continue
          m.push(mon('slime', c, r, 7))
        }
      }
      return restoreEngine(snap(20, m, [], [], ladder(30, 2)))
    }
    case 'stress': {
      const m: Monster[] = []
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 7; c++) {
          if ((r * 7 + c) % 9 === 4) continue
          const kind = walkers[(r * 3 + c) % walkers.length]!
          m.push(mon(kind, c, r, 5e7 + r * 1e6, { corrupted: (r + c) % 11 === 0 }))
        }
      }
      // ~40 balls airborne at once over ~50 monsters: the perf worst case.
      return restoreEngine(snap(60, m, [], [], ladder(40, 14), {}, { launchInterval: 0.012, ballSpeed: 16 }))
    }
  }
}

// ─── Sandbox source ──────────────────────────────────────────────────────────
const initial = (SCENES as string[]).includes(q('scene') ?? '') ? (q('scene') as Scene) : 'showcase'
const scene = ref<Scene>(initial)
const engine = shallowRef<IBarrageEngine>(buildScene(initial))
const engineGen = ref(0)
const hold = ref(false)
const listeners = new Set<EngineListener>()
const coins = ref(0)
const fanOut: EngineListener = (e) => {
  if (e.type === 'coins') coins.value += e.amount
  listeners.forEach((l) => l(e))
}
let offEngine = engine.value.on(fanOut)
const swap = (e: IBarrageEngine): void => {
  offEngine()
  engine.value = e
  offEngine = e.on(fanOut)
  engineGen.value++
}
const selectedLauncher = ref(Number(q('launcher') ?? 1) || 1)
const skinIds = BALL_SKINS.map((s) => s.id)
const selectedSkin = ref<BallSkinId>((skinIds as string[]).includes(q('skin') ?? '') ? (q('skin') as BallSkinId) : 'orb')

const source: BoardSource = {
  engine,
  engineGen,
  holdSim: computed(() => hold.value),
  fire: (a) => engine.value.fire(a),
  onEngineEvent: (cb) => {
    listeners.add(cb)
    return () => { listeners.delete(cb) }
  },
  selectedLauncher,
  selectedSkin
}
const live = q('live') === '1'
const liveBarrage = live ? useBarrage() : null
if (!live) provide(BOARD_SOURCE_KEY, source)
/** The engine the mounted board is actually drawing. */
const active = (): IBarrageEngine => (liveBarrage ? liveBarrage.engine.value : engine.value)

const setScene = (s: Scene): void => {
  scene.value = s
  swap(buildScene(s))
}
const cycleSkin = (): void => {
  const i = skinIds.indexOf(selectedSkin.value)
  selectedSkin.value = skinIds[(i + 1) % skinIds.length] ?? 'orb'
}
const cycleLauncher = (d: number): void => {
  selectedLauncher.value = ((selectedLauncher.value - 1 + d + 50) % 50) + 1
}
const fireAt = (deg: number): boolean => (liveBarrage ? liveBarrage.fire((deg * Math.PI) / 180) : engine.value.fire((deg * Math.PI) / 180))

// ─── Stats + auto-fire ───────────────────────────────────────────────────────
const boardRef = ref<InstanceType<typeof BarrageBoard> | null>(null)
/** The board's emits, newest last (CDP probes drain it via `__barrageLab.events()`). */
const boardEvents: (string | number)[][] = []
const logEmit = (...e: (string | number)[]): void => {
  boardEvents.push(e)
  if (boardEvents.length > 200) boardEvents.shift()
}
const coinTargetRef = ref<HTMLElement | null>(null)
const statText = ref('')
let frames = 0
let fps = 0
let fpsT = performance.now()
let rafId = 0
let worstGap = 0
let lastT = 0
const tick = (t: number): void => {
  rafId = requestAnimationFrame(tick)
  frames++
  if (lastT) worstGap = Math.max(worstGap, t - lastT)
  lastT = t
}
let statTimer = 0
let autoTimer = 0
let breachAt = 0
const sample = { fps: 0, avgMs: 0, peakMs: 0, simMs: 0, worstGapMs: 0 }
const updateStats = (): void => {
  const now = performance.now()
  fps = (frames * 1000) / Math.max(1, now - fpsT)
  frames = 0
  fpsT = now
  const s = boardRef.value?.stats()
  const st = active().state
  sample.fps = fps
  sample.avgMs = s?.avgMs ?? 0
  sample.peakMs = s?.peakMs ?? 0
  sample.simMs = s?.simMs ?? 0
  sample.worstGapMs = worstGap
  worstGap = 0
  statText.value = `${fps.toFixed(0)} fps · draw ${sample.avgMs.toFixed(2)} ms (peak ${sample.peakMs.toFixed(1)}) · sim ${sample.simMs.toFixed(2)} ms · `
    + `${st.phase} · row ${st.row} · balls ${st.balls.filter((b) => b.active).length}/${st.tray.length} · monsters ${st.monsters.length} · hits ${st.volleyHits}`
  // Breach: auto meteor-continue so a long perf run keeps going.
  if (st.phase === 'breach') {
    if (!breachAt) breachAt = now
    if (autoContinue.value && now - breachAt > 1400) {
      if (!live) engine.value.continueAfterBreach('meteor')
      breachAt = 0
    }
  } else {
    breachAt = 0
  }
}
const autoStep = (): void => {
  if (!autoFire.value || hold.value) return
  const e = active()
  if (e.state.phase === 'aim' && e.state.phaseTime > 0.35 && e.canFire()) fireAt(25 + Math.random() * 130)
}

const { shakeStyle } = useScreenshake()

onMounted(() => {
  rafId = requestAnimationFrame(tick)
  statTimer = window.setInterval(updateStats, 500)
  autoTimer = window.setInterval(autoStep, 150)
  ;(window as unknown as { __barrageLab: unknown }).__barrageLab = {
    scene: (s: Scene) => setScene(s),
    engine: () => active(),
    fire: fireAt,
    stats: () => ({ ...sample, ...(boardRef.value?.stats() ?? {}) }),
    board: () => boardRef.value,
    setSkin: (s: BallSkinId) => { selectedSkin.value = s },
    setLauncher: (t: number) => { selectedLauncher.value = t },
    autoFire: (on: boolean) => { autoFire.value = on },
    hold: (on: boolean) => { hold.value = on },
    clean: (on: boolean) => { clean.value = on },
    /** Drain the board's emits: ['aimStart'] / ['fired', deg] / ['aimCancel'] / ['misfire', kind] / ['chestTapped']. */
    events: () => boardEvents.splice(0),
    /** The overrun demo on `id`, or on the monster closest to the line. Returns its ms (0 = not played). */
    demo: (id?: number): number => {
      const ms = active().state.monsters
      let target = id
      if (target === undefined) {
        let best = -1e9
        for (const m of ms) if (m.row + m.h > best) { best = m.row + m.h; target = m.id }
      }
      return target === undefined ? 0 : (boardRef.value?.overrunDemo(target) ?? 0)
    }
  }
})
onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.clearInterval(statTimer)
  window.clearInterval(autoTimer)
  offEngine()
  delete (window as unknown as { __barrageLab?: unknown }).__barrageLab
})
</script>

<template lang="pug">
  div.barrage-lab.fixed.inset-0.flex.flex-col(:style="shakeStyle")
    div.lab-bar.flex.flex-wrap.items-center.gap-1.px-2.py-1(v-if="!clean")
      button.lab-btn(v-for="s in SCENES" :key="s" :class="{ 'lab-btn--on': s === scene }" @click="setScene(s)") {{ s }}
      button.lab-btn(@click="cycleSkin") skin: {{ selectedSkin }}
      button.lab-btn(@click="cycleLauncher(-1)") −
      span.lab-chip launcher {{ selectedLauncher }}
      button.lab-btn(@click="cycleLauncher(1)") +
      button.lab-btn(:class="{ 'lab-btn--on': autoFire }" @click="autoFire = !autoFire") auto
      button.lab-btn(:class="{ 'lab-btn--on': hold }" @click="hold = !hold") hold
      button.lab-btn(@click="engine.recall()") recall
      button.lab-btn(@click="clean = true") hide
      span.lab-stats.w-full {{ statText }}
    div.relative.flex-1.min-h-0
      BarrageBoard(
        ref="boardRef"
        :coin-target="coinTargetRef"
        @aim-start="logEmit('aimStart')"
        @aim-cancel="logEmit('aimCancel')"
        @fired="(a) => logEmit('fired', Math.round(a * 18000 / Math.PI) / 100)"
        @misfire="(k) => logEmit('misfire', k)"
        @chest-tapped="logEmit('chestTapped')"
      )
      div.lab-wallet(ref="coinTargetRef") {{ coins }}
    ParticleCanvas
</template>

<style scoped lang="sass">
.barrage-lab
  background: #070a14
  height: 100dvh
.lab-bar
  background: rgba(10, 14, 30, 0.92)
  color: #cfe0ff
  font: 600 11px/1.2 ui-monospace, Menlo, Consolas, monospace
  border-bottom: 1px solid rgba(120, 150, 255, 0.25)
.lab-btn
  padding: 3px 7px
  border-radius: 6px
  background: #1c2550
  color: #cfe0ff
  border: 1px solid rgba(140, 170, 255, 0.3)
.lab-btn--on
  background: #3b5bdb
  color: #fff
.lab-chip
  padding: 0 4px
.lab-stats
  opacity: 0.8
.lab-wallet
  position: absolute
  top: 8px
  right: 10px
  min-width: 44px
  padding: 2px 8px 2px 22px
  border-radius: 999px
  background: rgba(10, 14, 30, 0.8) url('/images/props/coin_128x128.webp') no-repeat 3px center / 16px 16px
  color: #ffd23c
  font: 800 13px/20px ui-monospace, Menlo, Consolas, monospace
  pointer-events: none
</style>
