// ─── Feel-tuning panel (lil-gui) ────────────────────────────────────────────
//
// Designer/debug overlay: every Tuning value grouped by what it feels like,
// plus every number of the current level (wind speeds, platform and enemy
// motion). Export downloads
// one JSON with all of it; Import reads the same file back.

import GUI from 'lil-gui'
import type { LevelDef } from './levels'
import { DEFAULT_TUNING, TUNING_GROUPS, TUNING_RANGES, type Tuning } from './tuning'

export interface TuningExport {
  game: 'umbrella'
  version: 2
  exportedAt: string
  tuning: Tuning
  /** Per level: every tunable number by path, e.g. "winds.0.speed", "hazards.1.motion.period". */
  levels: { id: number; values: Record<string, number> }[]
}

/** One tunable number inside a level definition. */
interface LevelKnob {
  path: string
  label: string
  obj: Record<string, unknown>
  key: string
  range: [min: number, max: number, step: number]
}

const MOTION_KNOBS: Record<string, { key: string; label: string; range: [number, number, number] }[]> = {
  line: [{ key: 'period', label: 'period (s)', range: [0.3, 20, 0.1] }],
  circle: [{ key: 'period', label: 'period (s)', range: [0.3, 20, 0.1] }, { key: 'radius', label: 'radius', range: [0, 600, 5] }],
  swing: [
    { key: 'period', label: 'period (s)', range: [0.3, 20, 0.1] },
    { key: 'amplitude', label: 'swing (rad)', range: [0, 3, 0.05] },
    { key: 'radius', label: 'radius', range: [0, 800, 5] }
  ],
  lunge: [{ key: 'period', label: 'period (s)', range: [0.3, 10, 0.05] }],
  arrive: [{ key: 'delay', label: 'delay (s)', range: [0, 10, 0.1] }, { key: 'duration', label: 'glide (s)', range: [0.1, 10, 0.1] }],
  follow: [{ key: 'speed', label: 'follow speed', range: [10, 800, 5] }]
}

/** Every tunable number of a level: wind speeds, platform and enemy motion. */
const levelKnobs = (l: LevelDef): LevelKnob[] => {
  const knobs: LevelKnob[] = []
  l.winds.forEach((w, i) =>
    knobs.push({ path: `winds.${i}.speed`, label: `wind ${i + 1} (${w.super ? 'super ' : ''}${w.dir}) speed`, obj: w as never, key: 'speed', range: [0, 1500, 5] }))
  const movers = [
    ...l.platforms.map((p, i) => ({ group: 'platforms', name: `platform ${i + 1}`, motion: p.motion, i })),
    ...(l.hazards ?? []).map((h, i) => ({ group: 'hazards', name: `${h.kind} ${i + 1}`, motion: h.motion, i }))
  ]
  for (const m of movers) {
    if (!m.motion || m.motion.kind === 'static') continue
    for (const k of MOTION_KNOBS[m.motion.kind] ?? []) {
      knobs.push({
        path: `${m.group}.${m.i}.motion.${k.key}`,
        label: `${m.name} (${m.motion.kind}) ${k.label}`,
        obj: m.motion as never,
        key: k.key,
        range: k.range
      })
    }
  }
  return knobs
}

const LEVEL_DEFAULTS = new WeakMap<LevelDef, Record<string, number>>()

const levelValues = (l: LevelDef): Record<string, number> =>
  Object.fromEntries(levelKnobs(l).map((k) => [k.path, k.obj[k.key] as number]))

/** Remembers each level's authored values once, so "Reset" can restore them. */
const rememberLevel = (l: LevelDef) => {
  if (!LEVEL_DEFAULTS.has(l)) LEVEL_DEFAULTS.set(l, levelValues(l))
}

const setLevelValues = (l: LevelDef, values: Record<string, unknown>) => {
  for (const k of levelKnobs(l)) {
    const v = values[k.path]
    if (typeof v === 'number' && Number.isFinite(v)) k.obj[k.key] = v
  }
}

export const exportTuning = (tuning: Tuning, levels: LevelDef[]): TuningExport => ({
  game: 'umbrella',
  version: 2,
  exportedAt: new Date().toISOString(),
  tuning: { ...tuning },
  levels: levels.map((l) => ({ id: l.id, values: levelValues(l) }))
})

export const applyTuning = (data: Partial<TuningExport>, tuning: Tuning, levels: LevelDef[]): void => {
  for (const k of Object.keys(DEFAULT_TUNING) as (keyof Tuning)[]) {
    const v = data.tuning?.[k]
    if (typeof v === 'number' && Number.isFinite(v)) tuning[k] = v
  }
  for (const saved of data.levels ?? []) {
    const l = levels.find((x) => x.id === saved?.id)
    if (!l || !saved.values) continue
    rememberLevel(l)
    setLevelValues(l, saved.values)
  }
}

const download = (name: string, text: string) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const pickFile = (): Promise<string | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const f = input.files?.[0]
      if (f) f.text().then(resolve, () => resolve(null))
      else resolve(null)
    }
    input.click()
  })

export interface TuningGui {
  setLevel: (level: LevelDef) => void
  toggle: (show?: boolean) => void
  destroy: () => void
}

export const createTuningGui = (opts: {
  tuning: Tuning
  levels: LevelDef[]
  /** Called after level data changes (wind/period) so the scene can persist it. */
  onLevelsChange: () => void
}): TuningGui => {
  const { tuning, levels, onLevelsChange } = opts
  levels.forEach(rememberLevel)
  // Collapsed to its title bar on start: the developer opens it (and its folders) on demand.
  const gui = new GUI({ title: 'Feel tuning (type "cmonc")', width: 340, closeFolders: true })
  gui.close()
  gui.domElement.style.zIndex = '50'
  // The game's display font is small-caps; keep numbers and names legible.
  const style = document.createElement('style')
  style.textContent = '.lil-gui, .lil-gui * { font-family: system-ui, sans-serif !important; font-variant: normal !important; text-transform: none !important; }'
  gui.domElement.appendChild(style)
  gui.domElement.addEventListener('keydown', (e) => e.stopPropagation())

  for (const [name, keys] of Object.entries(TUNING_GROUPS)) {
    const f = gui.addFolder(name).close()
    for (const k of keys) {
      const [min, max, step] = TUNING_RANGES[k]
      f.add(tuning, k, min, max, step)
    }
  }

  const levelFolder = gui.addFolder('Level').close()
  let current: LevelDef = levels[0]!
  const buildLevel = () => {
    for (const c of [...levelFolder.controllers]) c.destroy()
    for (const f of [...levelFolder.folders]) f.destroy()
    levelFolder.title(`Level ${current.id}`)
    for (const k of levelKnobs(current)) {
      levelFolder.add(k.obj, k.key, ...k.range).name(k.label).onChange(onLevelsChange)
    }
    if (!levelFolder.controllers.length) levelFolder.add({ none: 'nothing moves here' }, 'none').name('—').disable()
  }

  const actions = {
    exportJson: () => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      download(`umbrella-tuning-${stamp}.json`, JSON.stringify(exportTuning(tuning, levels), null, 2))
    },
    importJson: async () => {
      const text = await pickFile()
      if (!text) return
      try {
        applyTuning(JSON.parse(text) as Partial<TuningExport>, tuning, levels)
        onLevelsChange()
        gui.controllersRecursive().forEach((c) => c.updateDisplay())
      } catch { /* not a tuning file */ }
    },
    copyJson: () => { void navigator.clipboard?.writeText(JSON.stringify(exportTuning(tuning, levels), null, 2)).catch(() => {}) },
    reset: () => {
      Object.assign(tuning, DEFAULT_TUNING)
      for (const l of levels) setLevelValues(l, LEVEL_DEFAULTS.get(l)!)
      onLevelsChange()
      gui.controllersRecursive().forEach((c) => c.updateDisplay())
    }
  }
  const io = gui.addFolder('Export / import').close()
  io.add(actions, 'exportJson').name('Download JSON')
  io.add(actions, 'importJson').name('Load JSON…')
  io.add(actions, 'copyJson').name('Copy JSON')
  io.add(actions, 'reset').name('Reset all to defaults')

  // Hidden on start; typing "cmonc" shows/hides it.
  gui.hide()
  return {
    setLevel: (level) => { current = level; buildLevel() },
    toggle: (show) => gui.show(show ?? gui._hidden),
    destroy: () => gui.destroy()
  }
}
