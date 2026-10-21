<script setup lang="ts">
/**
 * Umbrella level editor (/editor) — reached from the "cmonc" cheat's
 * OPEN EDITOR button.
 *
 * The canvas draws the level with the game's own renderer, so what you see is
 * what plays; selection boxes, motion paths and handles are an overlay on top.
 * Tools:
 *  - Platform / Finish / Wind (4 directions) / Super Stream / Spikes: drag a box.
 *  - Pillar / Mine / Spawn: click to place.
 *  - Select: drag to move, the corner square resizes, the round handles move a
 *    mover's path points. Right-click or Del removes.
 * Levels save to a local library, can replace a campaign slot, and export /
 * import as .json files. "Test" plays the edit in the real game.
 *
 * A designer tool behind a cheat code, like the lil-gui tuning panel — its
 * copy is English only on purpose.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { LEVELS, type HazardDef, type LevelDef, type Motion, type PlatformDef, type Vec, type WindDef, type WindDir } from '@/umbrella/levels'
import { createWorld, poseMovers, type World } from '@/umbrella/engine'
import { render } from '@/umbrella/renderer'
import { DEFAULT_TUNING, type Tuning } from '@/umbrella/tuning'
import { getState } from '@/use/useEpicState'
import {
  campaignOverrides,
  clearCampaignOverride,
  cloneLevel,
  customLevels,
  deleteCustomLevel,
  editorDraft,
  levelFromFile,
  levelToFile,
  saveCampaignOverride,
  saveCustomLevel,
  testLevel
} from '@/umbrella/customLevels'

type Tool =
  | 'select' | 'platform' | 'finish' | 'spawn'
  | 'wind-up' | 'wind-down' | 'wind-left' | 'wind-right' | 'super'
  | 'pillar' | 'mine' | 'spikes-up' | 'spikes-down'

type Group = 'platforms' | 'winds' | 'hazards'
type Entity = { group: Group; i: number }
type HandleKey = 'a' | 'b' | 'center' | 'pivot'
type Selection =
  | ({ type: 'entity' } & Entity)
  | { type: 'spawn' }
  | null
type Drag =
  | { mode: 'move'; start: Vec; snapshot: LevelDef; target: Selection }
  | { mode: 'resize'; target: Entity }
  | { mode: 'handle'; target: Entity; key: HandleKey }
  | { mode: 'create'; tool: Tool; start: Vec; now: Vec }
  | null

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Select / move' },
  { id: 'platform', label: 'Platform' },
  { id: 'finish', label: 'Finish platform' },
  { id: 'spawn', label: 'Player spawn' },
  { id: 'wind-up', label: 'Wind ↑ (updraft)' },
  { id: 'wind-down', label: 'Wind ↓' },
  { id: 'wind-left', label: 'Wind ←' },
  { id: 'wind-right', label: 'Wind →' },
  { id: 'super', label: 'Super Stream ↑' },
  { id: 'pillar', label: 'Walldorf (pillar)' },
  { id: 'mine', label: 'Mine' },
  { id: 'spikes-up', label: 'Spikes (point up)' },
  { id: 'spikes-down', label: 'Spikes (point down)' }
]
const WORLD_PRESETS = [
  { label: '1 screen (1280×720)', w: 1280, h: 720 },
  { label: '2× (2560×1440)', w: 2560, h: 1440 },
  { label: '3× (3840×2160)', w: 3840, h: 2160 }
]
const MOTION_KINDS: Motion['kind'][] = ['static', 'line', 'circle', 'swing', 'lunge', 'arrive']

const router = useRouter()
const tuning: Tuning = { ...DEFAULT_TUNING, ...getState<Partial<Tuning>>('umb_tuning_r2', {}) }

const blankLevel = (): LevelDef => ({
  id: 0,
  world: { w: 1280, h: 720 },
  spawn: { x: 160, y: 400 },
  platforms: [{ x: 60, y: 440, w: 200, h: 20 }, { x: 1020, y: 440, w: 200, h: 20, finish: true }],
  winds: [{ x: 270, y: 400, w: 740, h: 320, dir: 'up', speed: 260 }],
  hazards: []
})

const level = ref<LevelDef>(editorDraft.value ? cloneLevel(editorDraft.value.level) : blankLevel())
const levelName = ref(editorDraft.value?.name ?? 'untitled')
const tool = ref<Tool>('select')
const selection = ref<Selection>(null)
const status = ref('')
const snap = ref(true)
const animate = ref(false)
const libraryPick = ref('')
const campaignPick = ref<number | ''>('')
const overwriteSlot = ref<number | ''>('')
const fileInput = ref<HTMLInputElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let drag: Drag = null
let previewT = 0

/** Shortcut hints in the keyboard's own words: "Strg" on German keyboards, ⌘ on a Mac. */
const MOD_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : navigator.language.toLowerCase().startsWith('de') ? 'Strg' : 'Ctrl'
const UNDO_KEYS = `${MOD_KEY}+Z`
const REDO_KEYS = `${MOD_KEY}+Y / ${MOD_KEY}+Shift+Z`

const flash = (msg: string) => {
  status.value = msg
  window.setTimeout(() => { if (status.value === msg) status.value = '' }, 2500)
}

// Keep the draft, so a playtest round trip (or a reload of the route) resumes the edit.
watch([level, levelName], () => { editorDraft.value = { name: levelName.value, level: cloneLevel(level.value) } }, { deep: true, immediate: true })

// ── Undo / redo: snapshots of the whole level, drags coalesced ──
const UNDO_LIMIT = 100
const COALESCE_MS = 350
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
let lastSnap = JSON.stringify(level.value)
let lastPush = 0
let restoring = false
watch(level, () => {
  const now = JSON.stringify(level.value)
  if (restoring || now === lastSnap) { lastSnap = now; restoring = false; return }
  if (Date.now() - lastPush > COALESCE_MS || drag === null) {
    undoStack.value = [...undoStack.value, lastSnap].slice(-UNDO_LIMIT)
    redoStack.value = []
  }
  lastPush = Date.now()
  lastSnap = now
}, { deep: true })
const restore = (snapJson: string) => {
  restoring = true
  level.value = JSON.parse(snapJson) as LevelDef
  selection.value = null
}
const undo = () => {
  const prev = undoStack.value[undoStack.value.length - 1]
  if (prev === undefined) return
  undoStack.value = undoStack.value.slice(0, -1)
  redoStack.value = [...redoStack.value, JSON.stringify(level.value)]
  restore(prev)
}
const redo = () => {
  const next = redoStack.value[redoStack.value.length - 1]
  if (next === undefined) return
  redoStack.value = redoStack.value.slice(0, -1)
  undoStack.value = [...undoStack.value, JSON.stringify(level.value)]
  restore(next)
}

// ── Geometry helpers ──
const hazards = () => (level.value.hazards ??= [])
const listOf = (g: Group): (PlatformDef | WindDef | HazardDef)[] =>
  g === 'platforms' ? level.value.platforms : g === 'winds' ? level.value.winds : hazards()
const entityOf = (e: Entity) => listOf(e.group)[e.i]
const motionOf = (e: Entity): Motion | undefined => e.group === 'winds' ? undefined : (entityOf(e) as PlatformDef | HazardDef | undefined)?.motion
const snapV = (v: number, step = 10) => (snap.value ? Math.round(v / step) * step : Math.round(v))

/** The world as it plays at the preview time: movers posed, player at spawn. */
let world: World = createWorld(level.value, { w: tuning.playerWidth, h: tuning.playerHeight })
const rebuildWorld = () => {
  world = createWorld(level.value, { w: tuning.playerWidth, h: tuning.playerHeight })
  poseMovers(world, previewT, tuning)
}
/** Where an entity is drawn right now (movers follow their motion). */
const shownRect = (e: Entity) =>
  e.group === 'winds' ? level.value.winds[e.i]! : e.group === 'platforms' ? world.platforms[e.i]! : world.hazards[e.i]!

const translateMotion = (m: Motion, dx: number, dy: number) => {
  const mv = (v: Vec) => { v.x += dx; v.y += dy }
  if (m.kind === 'line' || m.kind === 'lunge' || m.kind === 'arrive') { mv(m.a); mv(m.b) }
  else if (m.kind === 'circle') mv(m.center)
  else if (m.kind === 'swing') mv(m.pivot)
}
const handlesOf = (m: Motion): { key: HandleKey; v: Vec }[] => {
  if (m.kind === 'line' || m.kind === 'lunge' || m.kind === 'arrive') return [{ key: 'a', v: m.a }, { key: 'b', v: m.b }]
  if (m.kind === 'circle') return [{ key: 'center', v: m.center }]
  if (m.kind === 'swing') return [{ key: 'pivot', v: m.pivot }]
  return []
}

// ── Canvas mapping: the world fits the canvas with a margin for off-world movers ──
const MARGIN = 0.1
let view = { s: 1, ox: 0, oy: 0 }
const toWorld = (e: PointerEvent): Vec => {
  const el = canvasRef.value!
  const r = el.getBoundingClientRect()
  const dpr = el.width / r.width
  return { x: ((e.clientX - r.left) * dpr - view.ox) / view.s, y: ((e.clientY - r.top) * dpr - view.oy) / view.s }
}
const inside = (p: Vec, r: { x: number; y: number; w: number; h: number }, pad = 0) =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad

const handleRadius = () => 9 / view.s

const hitTest = (p: Vec): { sel: Selection; handle?: HandleKey; resize?: boolean } => {
  const cur = selection.value
  if (cur?.type === 'entity') {
    const r = shownRect(cur)
    if (Math.hypot(p.x - (r.x + r.w), p.y - (r.y + r.h)) <= handleRadius() * 1.4) return { sel: cur, resize: true }
    const m = motionOf(cur)
    for (const h of m ? handlesOf(m) : []) if (Math.hypot(p.x - h.v.x, p.y - h.v.y) <= handleRadius() * 1.4) return { sel: cur, handle: h.key }
  }
  const sp = level.value.spawn
  if (inside(p, { x: sp.x - tuning.playerWidth / 2, y: sp.y - tuning.playerHeight, w: tuning.playerWidth, h: tuning.playerHeight }, 4)) return { sel: { type: 'spawn' } }
  // Small things first: hazards, then platforms, then (big) winds.
  for (const group of ['hazards', 'platforms', 'winds'] as Group[]) {
    const list = listOf(group)
    for (let i = list.length - 1; i >= 0; i--) if (inside(p, shownRect({ group, i }), 3)) return { sel: { type: 'entity', group, i } }
  }
  return { sel: null }
}

// ── Placing ──
const place = (t: Tool, a: Vec, b: Vec) => {
  const x = snapV(Math.min(a.x, b.x))
  const y = snapV(Math.min(a.y, b.y))
  const dragged = Math.abs(b.x - a.x) > 6 || Math.abs(b.y - a.y) > 6
  const w = (fallback: number) => (dragged ? Math.max(10, snapV(Math.abs(b.x - a.x))) : fallback)
  const h = (fallback: number) => (dragged ? Math.max(10, snapV(Math.abs(b.y - a.y))) : fallback)
  const L = level.value
  let sel: Selection = null
  switch (t) {
    case 'platform':
    case 'finish': {
      // One finish per level: placing a new one demotes the old.
      if (t === 'finish') L.platforms.forEach((p) => { delete p.finish })
      L.platforms.push({ x, y, w: w(200), h: h(20), ...(t === 'finish' ? { finish: true } : {}) })
      sel = { type: 'entity', group: 'platforms', i: L.platforms.length - 1 }
      break
    }
    case 'spawn':
      L.spawn = { x: snapV(a.x), y: snapV(a.y) }
      sel = { type: 'spawn' }
      break
    case 'wind-up': case 'wind-down': case 'wind-left': case 'wind-right': case 'super': {
      const dir = (t === 'super' ? 'up' : t.slice(5)) as WindDir
      L.winds.push({ x, y, w: w(240), h: h(320), dir, speed: t === 'super' ? 760 : 260, ...(t === 'super' ? { super: true } : {}) })
      sel = { type: 'entity', group: 'winds', i: L.winds.length - 1 }
      break
    }
    case 'pillar': {
      const pw = 40, ph = 200
      hazards().push({ kind: 'pillar', x: snapV(a.x - pw / 2), y: snapV(a.y - ph / 2), w: pw, h: ph })
      sel = { type: 'entity', group: 'hazards', i: hazards().length - 1 }
      break
    }
    case 'mine': {
      const r = 26
      hazards().push({ kind: 'mine', x: snapV(a.x) - r, y: snapV(a.y) - r, w: r * 2, h: r * 2 })
      sel = { type: 'entity', group: 'hazards', i: hazards().length - 1 }
      break
    }
    case 'spikes-up': case 'spikes-down':
      hazards().push({ kind: 'spikes', x, y, w: w(200), h: 26, facing: t === 'spikes-up' ? 'up' : 'down' })
      sel = { type: 'entity', group: 'hazards', i: hazards().length - 1 }
      break
  }
  selection.value = sel
}

const removeSelection = () => {
  const s = selection.value
  if (s?.type !== 'entity') return
  listOf(s.group).splice(s.i, 1)
  selection.value = null
}

// ── Pointer ──
const onPointerDown = (e: PointerEvent) => {
  const p = toWorld(e)
  canvasRef.value?.setPointerCapture(e.pointerId)
  if (e.button === 2) {
    const hit = hitTest(p)
    if (hit.sel?.type === 'entity') { selection.value = hit.sel; removeSelection() }
    return
  }
  if (tool.value !== 'select') {
    drag = { mode: 'create', tool: tool.value, start: p, now: p }
    return
  }
  const hit = hitTest(p)
  selection.value = hit.sel
  if (hit.sel?.type === 'entity' && hit.resize) drag = { mode: 'resize', target: hit.sel }
  else if (hit.sel?.type === 'entity' && hit.handle) drag = { mode: 'handle', target: hit.sel, key: hit.handle }
  else if (hit.sel) drag = { mode: 'move', start: p, snapshot: cloneLevel(level.value), target: hit.sel }
}

const onPointerMove = (e: PointerEvent) => {
  if (!drag) return
  const p = toWorld(e)
  if (drag.mode === 'create') { drag.now = p; return }
  if (drag.mode === 'move') {
    const dx = snapV(p.x - drag.start.x)
    const dy = snapV(p.y - drag.start.y)
    const t = drag.target
    if (t?.type === 'spawn') {
      level.value.spawn = { x: drag.snapshot.spawn.x + dx, y: drag.snapshot.spawn.y + dy }
    } else if (t?.type === 'entity') {
      const orig = (t.group === 'platforms' ? drag.snapshot.platforms : t.group === 'winds' ? drag.snapshot.winds : drag.snapshot.hazards ?? [])[t.i]!
      const ent = entityOf(t)!
      ent.x = orig.x + dx
      ent.y = orig.y + dy
      const om = (orig as PlatformDef).motion
      if (om && om.kind !== 'static') {
        const m = JSON.parse(JSON.stringify(om)) as Motion
        translateMotion(m, dx, dy)
        ;(ent as PlatformDef).motion = m
      }
    }
    return
  }
  if (drag.mode === 'resize') {
    const ent = entityOf(drag.target)!
    const shown = shownRect(drag.target)
    const nw = Math.max(10, snapV(p.x - shown.x))
    const nh = Math.max(10, snapV(p.y - shown.y))
    const m = motionOf(drag.target)
    const moving = m && m.kind !== 'static'
    if ((ent as HazardDef).kind === 'mine') {
      const d = Math.max(nw, nh)
      if (!moving) { const cx = ent.x + ent.w / 2, cy = ent.y + ent.h / 2; ent.x = cx - d / 2; ent.y = cy - d / 2 }
      ent.w = ent.h = d
    } else {
      ent.w = nw
      ent.h = (ent as HazardDef).kind === 'spikes' ? ent.h : nh
    }
    return
  }
  if (drag.mode === 'handle') {
    const m = motionOf(drag.target)
    const h = m && handlesOf(m).find((x) => x.key === (drag as { key: HandleKey }).key)
    if (h) { h.v.x = snapV(p.x); h.v.y = snapV(p.y) }
  }
}

const onPointerUp = () => {
  if (drag?.mode === 'create') place(drag.tool, drag.start, drag.now)
  drag = null
}

// ── Keys ──
const isTyping = (el: EventTarget | null) => {
  const tag = (el as HTMLElement | null)?.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
}
const onKeyDown = (e: KeyboardEvent) => {
  if (isTyping(e.target)) return
  // The letter typed, not the key position: on QWERTZ the Z key is where QWERTY has Y.
  const mod = e.ctrlKey || e.metaKey
  const letter = e.key.toLowerCase()
  if (mod && letter === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
  if (mod && letter === 'y') { e.preventDefault(); redo(); return }
  if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); removeSelection(); return }
  if (e.code === 'Escape') { selection.value = null; tool.value = 'select' }
  if (e.code === 'KeyV') tool.value = 'select'
}

// ── Properties panel ──
const selected = computed(() => {
  void level.value
  const s = selection.value
  if (s?.type !== 'entity') return null
  const ent = entityOf(s)
  return ent ? { ...s, ent } : null
})
const selectedPlatform = computed(() => (selected.value?.group === 'platforms' ? (selected.value.ent as PlatformDef) : null))
const selectedWind = computed(() => (selected.value?.group === 'winds' ? (selected.value.ent as WindDef) : null))
const selectedHazard = computed(() => (selected.value?.group === 'hazards' ? (selected.value.ent as HazardDef) : null))
const selectedMover = computed(() => selectedPlatform.value ?? selectedHazard.value)
const selectedMotion = computed(() => selectedMover.value?.motion)
const motionKind = computed(() => selectedMotion.value?.kind ?? 'static')

const setMotionKind = (kind: Motion['kind']) => {
  const ent = selectedMover.value
  if (!ent || !selected.value) return
  const r = shownRect(selected.value)
  const c = { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) }
  if (kind === 'static') {
    ent.x = r.x
    ent.y = r.y
    delete ent.motion
    return
  }
  const isEnemy = selected.value.group === 'hazards'
  const motions: Record<Exclude<Motion['kind'], 'static'>, Motion> = {
    line: { kind: 'line', a: c, b: { x: c.x + 240, y: c.y }, period: 4 },
    circle: { kind: 'circle', center: { x: c.x - 120, y: c.y }, radius: 120, period: 6 },
    swing: { kind: 'swing', pivot: { x: c.x, y: c.y - 220 }, radius: 220, amplitude: 0.8, period: 4 },
    lunge: { kind: 'lunge', a: c, b: { x: c.x - (isEnemy ? 320 : 200), y: c.y }, period: 3.2 },
    arrive: { kind: 'arrive', a: { x: c.x + 400, y: c.y }, b: c, delay: 1.5, duration: 2 }
  }
  ent.motion = motions[kind]
}
const MOTION_FIELDS: Record<string, { key: string; label: string; min: number; max: number; step: number }[]> = {
  line: [{ key: 'period', label: 'Period (s)', min: 0.3, max: 20, step: 0.1 }],
  circle: [{ key: 'period', label: 'Period (s)', min: 0.3, max: 20, step: 0.1 }, { key: 'radius', label: 'Radius', min: 0, max: 800, step: 5 }],
  swing: [
    { key: 'period', label: 'Period (s)', min: 0.3, max: 20, step: 0.1 },
    { key: 'amplitude', label: 'Swing (rad)', min: 0, max: 3, step: 0.05 },
    { key: 'radius', label: 'Rope length', min: 0, max: 900, step: 5 }
  ],
  lunge: [{ key: 'period', label: 'Period (s)', min: 0.3, max: 10, step: 0.05 }],
  arrive: [{ key: 'delay', label: 'Delay (s)', min: 0, max: 10, step: 0.1 }, { key: 'duration', label: 'Glide (s)', min: 0.1, max: 10, step: 0.1 }]
}
const motionFields = computed(() => MOTION_FIELDS[motionKind.value] ?? [])
const setMotionField = (key: string, v: number) => {
  const m = selectedMotion.value as Record<string, unknown> | undefined
  if (m && Number.isFinite(v)) m[key] = v
}
const setRect = (key: 'x' | 'y' | 'w' | 'h', v: number) => {
  const ent = selected.value?.ent
  if (!ent || !Number.isFinite(v)) return
  ent[key] = key === 'w' || key === 'h' ? Math.max(1, v) : v
}
const setWorldPreset = (i: number) => {
  const p = WORLD_PRESETS[i]
  if (p) level.value.world = { w: p.w, h: p.h }
}
const setFinish = (on: boolean) => {
  const p = selectedPlatform.value
  if (!p) return
  if (on) { level.value.platforms.forEach((x) => { delete x.finish }); p.finish = true }
  else delete p.finish
}
const setFlag = (ent: object, key: 'super' | 'harmless', on: boolean) => {
  const o = ent as Record<string, unknown>
  if (on) o[key] = true
  else delete o[key]
}

// ── Checks shown under the canvas, so a broken level is visible before testing ──
const problems = computed(() => {
  const L = level.value
  const out: string[] = []
  if (!L.platforms.some((p) => p.finish)) out.push('No finish platform — the level cannot be won.')
  const sp = L.spawn
  if (sp.x < 0 || sp.y < 0 || sp.x > L.world.w || sp.y > L.world.h) out.push('The spawn is outside the world.')
  return out
})

// ── Library / campaign / files ──
const libraryNames = computed(() => Object.keys(customLevels.value).sort())
const campaignOptions = computed(() => LEVELS.map((l, i) => ({ id: l.id, label: `Level ${i + 1}${campaignOverrides.value[l.id] ? ' (edited)' : ''}` })))

const loadIntoEditor = (l: LevelDef, name: string) => {
  level.value = cloneLevel(l)
  levelName.value = name
  selection.value = null
  previewT = 0
}
const onNew = () => { loadIntoEditor(blankLevel(), 'untitled'); overwriteSlot.value = ''; flash('New level') }
const onSave = () => {
  const name = levelName.value.trim() || 'untitled'
  levelName.value = name
  saveCustomLevel(name, level.value)
  flash(`Saved "${name}"`)
}
const onLoad = () => {
  const l = customLevels.value[libraryPick.value]
  if (l) { loadIntoEditor(l, libraryPick.value); flash(`Loaded "${libraryPick.value}"`) }
}
const onDelete = () => {
  if (!libraryPick.value || !window.confirm(`Delete saved level "${libraryPick.value}"?`)) return
  deleteCustomLevel(libraryPick.value)
  flash(`Deleted "${libraryPick.value}"`)
  libraryPick.value = ''
}
const onImportCampaign = () => {
  const l = LEVELS.find((x) => x.id === campaignPick.value)
  if (!l) return
  const n = LEVELS.indexOf(l) + 1
  loadIntoEditor(l, `level-${n}`)
  overwriteSlot.value = l.id
  flash(`Opened campaign level ${n}`)
}
const onOverwrite = () => {
  const id = overwriteSlot.value
  if (id === '') return
  const n = LEVELS.findIndex((l) => l.id === id) + 1
  if (!window.confirm(`Replace campaign level ${n} with this edit? (Revert restores the original.)`)) return
  saveCampaignOverride(id, level.value)
  flash(`Campaign level ${n} replaced`)
}
const onRevert = () => {
  const id = overwriteSlot.value
  if (id === '' || !campaignOverrides.value[id]) return
  clearCampaignOverride(id)
  flash('Campaign level restored to the original')
}
const onExport = () => {
  const name = levelName.value.trim() || 'untitled'
  const blob = new Blob([JSON.stringify(levelToFile(name, level.value), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `umbrella-level-${name.replace(/[^\w-]+/g, '_')}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
const onImportFile = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const parsed = levelFromFile(JSON.parse(await file.text()))
    if (!parsed) { flash('That file is not an Umbrella level'); return }
    loadIntoEditor(parsed.level, parsed.name)
    flash(`Imported "${parsed.name}"`)
  } catch {
    flash('Could not read that file')
  }
}
const onTest = () => {
  testLevel.value = cloneLevel(level.value)
  void router.push('/')
}
const onBack = () => {
  testLevel.value = null
  void router.push('/')
}

// ── Drawing ──
const strokeRect = (ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, color: string, dash: number[] = []) => {
  ctx.setLineDash(dash)
  ctx.strokeStyle = color
  ctx.strokeRect(r.x, r.y, r.w, r.h)
  ctx.setLineDash([])
}
const dot = (ctx: CanvasRenderingContext2D, v: Vec, r: number, fill: string) => {
  ctx.beginPath()
  ctx.arc(v.x, v.y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = '#000'
  ctx.stroke()
}

let raf = 0
let last = 0
const paint = (now: number) => {
  raf = requestAnimationFrame(paint)
  const el = canvasRef.value
  if (!el) return
  const dtReal = Math.min(0.1, (now - (last || now)) / 1000)
  last = now
  if (animate.value && !drag) previewT += dtReal
  const dpr = window.devicePixelRatio || 1
  const cw = Math.round(el.clientWidth * dpr)
  const ch = Math.round(el.clientHeight * dpr)
  if (el.width !== cw || el.height !== ch) { el.width = cw; el.height = ch }
  const ctx = el.getContext('2d')
  if (!ctx || cw === 0 || ch === 0) return

  rebuildWorld()
  const L = level.value
  // Fit the world plus a margin: render() letterboxes into the box we give it.
  const s = Math.min(cw / (L.world.w * (1 + 2 * MARGIN)), ch / (L.world.h * (1 + 2 * MARGIN)))
  view = { s, ox: (cw - L.world.w * s) / 2, oy: (ch - L.world.h * s) / 2 }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#080a10'
  ctx.fillRect(0, 0, cw, ch)
  // Draw the game into the world's own box (its renderer fits to the canvas size).
  const bw = Math.max(1, Math.round(L.world.w * s))
  const bh = Math.max(1, Math.round(L.world.h * s))
  if (gameCanvas.width !== bw || gameCanvas.height !== bh) { gameCanvas.width = bw; gameCanvas.height = bh }
  const gctx = gameCanvas.getContext('2d')
  if (gctx) {
    render(gctx, world, { finish: 'FINISH' }, tuning, 0)
    ctx.drawImage(gameCanvas, Math.round(view.ox), Math.round(view.oy))
  }

  // Overlay in world space.
  ctx.setTransform(s, 0, 0, s, view.ox, view.oy)
  ctx.lineWidth = 1.5 / s
  // Off-world things (a lunge resting off-screen) still need an outline to grab.
  for (const group of ['platforms', 'winds', 'hazards'] as Group[]) {
    listOf(group).forEach((_, i) => {
      const r = shownRect({ group, i })
      const off = r.x < 0 || r.y < 0 || r.x + r.w > L.world.w || r.y + r.h > L.world.h
      if (off) strokeRect(ctx, r, 'rgba(255,255,255,0.45)', [6 / s, 4 / s])
    })
  }
  strokeRect(ctx, { x: 0, y: 0, w: L.world.w, h: L.world.h }, 'rgba(255,255,255,0.25)')

  // Motion paths of every mover, faintly; the selected one bright with handles.
  const sel = selection.value
  for (const group of ['platforms', 'hazards'] as Group[]) {
    listOf(group).forEach((_, i) => {
      const m = motionOf({ group, i })
      if (!m || m.kind === 'static') return
      const isSel = sel?.type === 'entity' && sel.group === group && sel.i === i
      ctx.strokeStyle = isSel ? 'rgba(255,220,90,0.9)' : 'rgba(255,220,90,0.3)'
      ctx.setLineDash([8 / s, 6 / s])
      ctx.beginPath()
      if (m.kind === 'line' || m.kind === 'lunge' || m.kind === 'arrive') { ctx.moveTo(m.a.x, m.a.y); ctx.lineTo(m.b.x, m.b.y) }
      else if (m.kind === 'circle') ctx.arc(m.center.x, m.center.y, m.radius, 0, Math.PI * 2)
      else if (m.kind === 'swing') {
        ctx.moveTo(m.pivot.x, m.pivot.y)
        ctx.arc(m.pivot.x, m.pivot.y, m.radius, Math.PI / 2 - m.amplitude, Math.PI / 2 + m.amplitude)
        ctx.closePath()
      }
      ctx.stroke()
      ctx.setLineDash([])
      if (isSel) for (const h of handlesOf(m)) dot(ctx, h.v, handleRadius(), h.key === 'b' ? '#ffb347' : '#ffe066')
    })
  }

  if (sel?.type === 'entity' && entityOf(sel)) {
    const r = shownRect(sel)
    strokeRect(ctx, r, '#4ade80')
    ctx.fillStyle = '#4ade80'
    const hs = handleRadius()
    ctx.fillRect(r.x + r.w - hs, r.y + r.h - hs, hs * 2, hs * 2)
  } else if (sel?.type === 'spawn') {
    const sp = L.spawn
    strokeRect(ctx, { x: sp.x - tuning.playerWidth / 2, y: sp.y - tuning.playerHeight, w: tuning.playerWidth, h: tuning.playerHeight }, '#4ade80')
  }

  if (drag?.mode === 'create') {
    const a = drag.start, b = drag.now
    strokeRect(ctx, { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }, '#60a5fa', [6 / s, 4 / s])
  }
}
const gameCanvas = document.createElement('canvas')

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  raf = requestAnimationFrame(paint)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="editor">
    <div class="bar">
      <input v-model="levelName" class="field name" placeholder="Level name" />
      <button class="btn green" @click="onSave">Save</button>
      <select v-model="libraryPick" class="field">
        <option value="">— saved levels —</option>
        <option v-for="n in libraryNames" :key="n" :value="n">{{ n }}</option>
      </select>
      <button class="btn blue" :disabled="!libraryPick" @click="onLoad">Load</button>
      <button class="btn red" :disabled="!libraryPick" @click="onDelete">Delete</button>
      <button class="btn" @click="onNew">New</button>
      <span class="sep" />
      <select v-model.number="campaignPick" class="field">
        <option value="">— campaign level —</option>
        <option v-for="c in campaignOptions" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
      <button class="btn indigo" :disabled="campaignPick === ''" @click="onImportCampaign">Open</button>
      <select v-model.number="overwriteSlot" class="field">
        <option value="">— replace slot —</option>
        <option v-for="c in campaignOptions" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
      <button class="btn orange" :disabled="overwriteSlot === ''" title="Replace this campaign level with the current edit" @click="onOverwrite">Overwrite</button>
      <button class="btn" :disabled="overwriteSlot === '' || !campaignOverrides[overwriteSlot]" title="Restore the original level in this slot" @click="onRevert">Revert</button>
      <span class="sep" />
      <button class="btn" :disabled="!undoStack.length" :title="`Undo (${UNDO_KEYS})`" @click="undo">↶ Undo <kbd>{{ UNDO_KEYS }}</kbd></button>
      <button class="btn" :disabled="!redoStack.length" :title="`Redo (${REDO_KEYS})`" @click="redo">↷ Redo <kbd>{{ REDO_KEYS }}</kbd></button>
      <span class="sep" />
      <button class="btn" @click="onExport">Export .json</button>
      <button class="btn" @click="fileInput?.click()">Import .json</button>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onImportFile" />
      <span class="grow" />
      <button class="btn yellow" @click="onTest">Test ▶</button>
      <button class="btn" @click="onBack">Back to game</button>
    </div>

    <div class="body">
      <div class="panel tools">
        <div class="head">Tools</div>
        <button v-for="t in TOOLS" :key="t.id" class="tool" :class="{ on: tool === t.id }" @click="tool = t.id">{{ t.label }}</button>
        <label class="check"><input v-model="snap" type="checkbox" /> Snap to 10 px</label>
        <label class="check"><input v-model="animate" type="checkbox" /> Animate movers</label>
        <p class="hint">Drag to draw boxes; click for pillar, mine, spawn. Select tool: drag to move, green corner resizes, yellow dots move a path. Right-click or Del deletes. Undo {{ UNDO_KEYS }}, redo {{ REDO_KEYS }}.</p>
      </div>

      <div class="stage">
        <canvas
          ref="canvasRef"
          class="canvas"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @contextmenu.prevent
        />
        <div class="foot">
          <span v-for="p in problems" :key="p" class="warn">⚠ {{ p }}</span>
          <span v-if="status" class="status">{{ status }}</span>
        </div>
      </div>

      <div class="panel props">
        <div class="head">Level</div>
        <label class="row">World
          <select class="field" :value="WORLD_PRESETS.findIndex((p) => p.w === level.world.w && p.h === level.world.h)" @change="setWorldPreset(+($event.target as HTMLSelectElement).value)">
            <option :value="-1" disabled>custom</option>
            <option v-for="(p, i) in WORLD_PRESETS" :key="p.label" :value="i">{{ p.label }}</option>
          </select>
        </label>
        <label class="row">Spawn x <input v-model.number="level.spawn.x" class="field num" type="number" /></label>
        <label class="row">Spawn y <input v-model.number="level.spawn.y" class="field num" type="number" /></label>

        <div class="head">Selection</div>
        <p v-if="!selected" class="hint">{{ selection?.type === 'spawn' ? 'Player spawn (feet position).' : 'Nothing selected.' }}</p>
        <template v-else>
          <div class="kind">{{ selectedHazard ? selectedHazard.kind : selected.group === 'winds' ? 'wind' : selectedPlatform?.finish ? 'finish platform' : 'platform' }}</div>
          <label v-for="k in (['x', 'y', 'w', 'h'] as const)" :key="k" class="row">{{ k }}
            <input class="field num" type="number" :value="Math.round(selected.ent[k])" @change="setRect(k, +($event.target as HTMLInputElement).value)" />
          </label>

          <template v-if="selectedPlatform">
            <label class="check"><input type="checkbox" :checked="!!selectedPlatform.finish" @change="setFinish(($event.target as HTMLInputElement).checked)" /> Finish</label>
          </template>

          <template v-if="selectedWind">
            <label class="row">Direction
              <select v-model="selectedWind.dir" class="field">
                <option v-for="d in ['up', 'down', 'left', 'right']" :key="d" :value="d">{{ d }}</option>
              </select>
            </label>
            <label class="row">Speed <input v-model.number="selectedWind.speed" class="field num" type="number" min="0" step="10" /></label>
            <input v-model.number="selectedWind.speed" type="range" min="0" max="1500" step="10" />
            <label class="check"><input type="checkbox" :checked="!!selectedWind.super" @change="setFlag(selectedWind, 'super', ($event.target as HTMLInputElement).checked)" /> Super Stream</label>
          </template>

          <template v-if="selectedHazard">
            <label v-if="selectedHazard.kind === 'pillar'" class="check"><input type="checkbox" :checked="!!selectedHazard.harmless" @change="setFlag(selectedHazard, 'harmless', ($event.target as HTMLInputElement).checked)" /> Harmless (solid, safe)</label>
            <label v-if="selectedHazard.kind === 'spikes'" class="row">Points
              <select v-model="selectedHazard.facing" class="field">
                <option value="up">up</option>
                <option value="down">down</option>
              </select>
            </label>
          </template>

          <template v-if="selectedMover">
            <div class="head">Motion</div>
            <select class="field" :value="motionKind" @change="setMotionKind(($event.target as HTMLSelectElement).value as Motion['kind'])">
              <option v-for="k in MOTION_KINDS" :key="k" :value="k">{{ k }}</option>
            </select>
            <label v-for="f in motionFields" :key="f.key" class="row col">
              <span>{{ f.label }}: {{ (selectedMotion as Record<string, number> | undefined)?.[f.key] }}</span>
              <input type="range" :min="f.min" :max="f.max" :step="f.step" :value="(selectedMotion as Record<string, number> | undefined)?.[f.key]" @input="setMotionField(f.key, +($event.target as HTMLInputElement).value)" />
            </label>
            <p v-if="motionKind !== 'static'" class="hint">Drag the yellow dots on the canvas to move the path (orange = end).</p>
          </template>
          <button class="btn red" @click="removeSelection">Delete</button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor, .editor * {
  font-family: system-ui, sans-serif !important;
  font-variant: normal !important;
}
.editor {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #0d1018;
  color: #fff;
  font: 13px system-ui, sans-serif;
  user-select: none;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.3);
  overflow-y: auto;
}
.tools { width: 170px; border-right: 1px solid rgba(255, 255, 255, 0.15); }
.props { width: 230px; border-left: 1px solid rgba(255, 255, 255, 0.15); }
.stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.canvas {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: block;
  cursor: crosshair;
  touch-action: none;
}
.foot {
  display: flex;
  gap: 12px;
  min-height: 22px;
  padding: 2px 8px;
  font-size: 12px;
}
.warn { color: #fbbf24; }
.status { opacity: 0.8; }
.head {
  margin-top: 6px;
  font-size: 11px;
  text-transform: uppercase;
  opacity: 0.6;
}
.kind { font-weight: 700; text-transform: capitalize; }
.hint { margin: 4px 0; font-size: 11px; opacity: 0.6; line-height: 1.4; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.row.col { flex-direction: column; align-items: stretch; }
.check { display: flex; align-items: center; gap: 6px; }
.field {
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font: inherit;
}
.field.name { width: 150px; }
.field.num { width: 80px; }
.btn {
  padding: 4px 10px;
  border: 0;
  border-radius: 4px;
  background: #334155;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.btn:hover:not(:disabled) { filter: brightness(1.15); }
.btn:disabled { opacity: 0.45; cursor: default; }
.btn.green { background: #059669; font-weight: 700; }
.btn.blue { background: #2563eb; }
.btn.red { background: #b91c1c; }
.btn.indigo { background: #4f46e5; }
.btn.orange { background: #ea580c; font-weight: 700; }
.btn.yellow { background: #eab308; color: #000; font-weight: 700; }
.tool {
  padding: 4px 8px;
  border: 0;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.tool.on { background: #059669; font-weight: 700; }
kbd {
  margin-left: 4px;
  padding: 0 4px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  font-size: 11px;
  opacity: 0.8;
}
.sep { width: 1px; height: 22px; background: rgba(255, 255, 255, 0.15); margin: 0 2px; }
.grow { flex: 1; }
</style>
