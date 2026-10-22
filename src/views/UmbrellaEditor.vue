<script setup lang="ts">
/**
 * Umbrella level editor (/editor) — players build, save and share levels here
 * (reached from the community levels dialog); the "cmonc" cheat adds the
 * designer's campaign tools (overwrite / revert / reorder, the levels bucket).
 *
 * The canvas draws the level with the game's own renderer, so what you see is
 * what plays; selection boxes, motion paths and handles are an overlay on top.
 * Tools:
 *  - Platform / Finish / Wind (4 directions) / Super Stream / Spikes: drag a box.
 *  - Pillar / Mine / Spawn: click to place.
 *  - Select: drag to move, the corner square resizes, the round handles move a
 *    mover's path points. Right-click or Del removes.
 * Levels save to a local library, can replace a campaign slot (Reorder drags the
 * campaign into a new order and adds saved levels to it), and export /
 * import as .json files. "Test" plays the edit in the real game; "Mobile view"
 * playtests it right here on a portrait and a landscape phone at once.
 * Scrolling levels: a "screen" smaller than the world makes the camera follow
 * the player; the overlay shows the screen grid and the start screen.
 * Wheel zooms, middle- or Alt-drag pans, double-click the empty field refits.
 *
 * Menus, the tool palette and the quick buttons are driven by one command list,
 * so every shortcut is shown where its button is. Player-facing copy goes
 * through i18n (umbrellaEditor.*); the designer-only campaign tools stay English.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { CHANNELS, LEVELS, type ButtonDef, type CheckpointDef, type HazardDef, type LevelDef, type Motion, type PlatformDef, type Vec, type WindDef, type WindDir } from '@/umbrella/levels'
import { checkpointBox, createWorld, DEFAULT_TRIGGER_RADIUS, poseMovers, step, type Input, type World } from '@/umbrella/engine'
import { cameraFor, channelColor, render, type Camera } from '@/umbrella/renderer'
import { DEFAULT_TUNING, type Tuning } from '@/umbrella/tuning'
import { getState } from '@/use/useEpicState'
import { encodeLevel, shareLink } from '@/umbrella/levelCode'
import { communityEnabled, getQuota, submitLevel } from '@/umbrella/community'
import LanguageSelect from '@/components/umbrella/LanguageSelect.vue'
import {
  campaignEntries,
  campaignOrder,
  campaignOverrides,
  nextCustomId,
  slotTitle,
  saveCampaignOrder,
  type OrderEntry,
  clearCampaignOverride,
  cloneLevel,
  customLevels,
  deleteCustomLevel,
  editorDraft,
  editorUnlocked,
  applyBucket,
  BUCKET_URL,
  bucketFromFile,
  bucketPassword,
  bucketStatus,
  levelFromFile,
  libraryToFile,
  setBucketPassword,
  syncBucket,
  saveEditorDraft,
  saveCampaignOverride,
  saveCustomLevel,
  testLevel
} from '@/umbrella/customLevels'

type Tool =
  | 'select' | 'platform' | 'finish' | 'spawn' | 'checkpoint' | 'button'
  | 'wind-up' | 'wind-down' | 'wind-left' | 'wind-right' | 'super'
  | 'pillar' | 'mine' | 'spikes-up' | 'spikes-down'

type Group = 'platforms' | 'winds' | 'hazards' | 'buttons' | 'checkpoints'
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
  | { mode: 'pan'; x: number; y: number }
  | null

/** A keyboard shortcut: the typed key (so letters follow the player's layout), plus modifiers. */
interface Keys { key: string; mod?: boolean; shift?: boolean; alt?: boolean }

/** The tool palette, grouped by purpose; every tool has a one-key shortcut. */
const TOOL_GROUPS: { id: string; tools: { id: Tool; icon: string; keys: Keys }[] }[] = [
  { id: 'build', tools: [
    { id: 'select', icon: '⬚', keys: { key: 'v' } },
    { id: 'platform', icon: '▬', keys: { key: 'b' } },
    { id: 'finish', icon: '🏁', keys: { key: 'f' } },
    { id: 'spawn', icon: '☺', keys: { key: 's' } },
    { id: 'checkpoint', icon: '⚑', keys: { key: 'c' } }
  ] },
  { id: 'currents', tools: [
    { id: 'wind-up', icon: '↑', keys: { key: '1' } },
    { id: 'wind-down', icon: '↓', keys: { key: '2' } },
    { id: 'wind-left', icon: '←', keys: { key: '3' } },
    { id: 'wind-right', icon: '→', keys: { key: '4' } },
    { id: 'super', icon: '⇈', keys: { key: '5' } }
  ] },
  { id: 'hazards', tools: [
    { id: 'pillar', icon: '▮', keys: { key: 'p' } },
    { id: 'mine', icon: '✹', keys: { key: 'm' } },
    { id: 'spikes-up', icon: '▲', keys: { key: 'x' } },
    { id: 'spikes-down', icon: '▼', keys: { key: 'x', shift: true } }
  ] },
  { id: 'switches', tools: [
    { id: 'button', icon: '◉', keys: { key: 't' } }
  ] }
]
const TOOLS = TOOL_GROUPS.flatMap((g) => g.tools)

const SCREEN = { w: 1280, h: 720 }
/** `view`: the presets that scroll; the 2×/3× ones zoom out to show everything. */
const WORLD_PRESETS: { key: string; w: number; h: number; view?: { w: number; h: number } }[] = [
  { key: 'one', w: 1280, h: 720 },
  { key: 'wide2', w: 2560, h: 720, view: SCREEN },
  { key: 'wide3', w: 3840, h: 720, view: SCREEN },
  { key: 'tall2', w: 1280, h: 1440, view: SCREEN },
  { key: 'grid2', w: 2560, h: 1440, view: SCREEN },
  { key: 'zoom2', w: 2560, h: 1440 },
  { key: 'zoom3', w: 3840, h: 2160 }
]
/** Phone screens in CSS px for the mobile preview. */
const PHONE = { w: 390, h: 844 }
const MOTION_KINDS: Motion['kind'][] = ['static', 'line', 'circle', 'swing', 'lunge', 'arrive']

const router = useRouter()
const { t } = useI18n()
const tuning: Tuning = { ...DEFAULT_TUNING, ...getState<Partial<Tuning>>('umb_tuning_r3', {}) }

const blankLevel = (): LevelDef => ({
  id: 0,
  world: { w: 1280, h: 720 },
  spawn: { x: 160, y: 400 },
  platforms: [{ x: 60, y: 440, w: 200, h: 20 }, { x: 1020, y: 440, w: 200, h: 20, finish: true }],
  winds: [{ x: 270, y: 400, w: 740, h: 320, dir: 'up', speed: 260 }],
  hazards: []
})

const level = ref<LevelDef>(editorDraft.value ? cloneLevel(editorDraft.value.level) : blankLevel())
const levelName = ref(editorDraft.value?.name ?? t('umbrellaEditor.untitled'))
const tool = ref<Tool>('select')
const selection = ref<Selection>(null)
const status = ref('')
const snap = ref(true)
const animate = ref(false)
const overwriteSlot = ref<number | ''>('')
const fileInput = ref<HTMLInputElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let drag: Drag = null
let previewT = 0

/** Shortcut hints in the keyboard's own words: "Strg" on German keyboards, ⌘ on a Mac. */
const MOD_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : navigator.language.toLowerCase().startsWith('de') ? 'Strg' : 'Ctrl'
const KEY_NAMES: Record<string, string> = {
  enter: '↵', delete: 'Del', backspace: '⌫', escape: 'Esc', '+': '+', '-': '−', '=': '=', '?': '?',
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→'
}
const fmtKeys = (k: Keys): string =>
  [k.mod && MOD_KEY, k.shift && 'Shift', k.alt && 'Alt', KEY_NAMES[k.key] ?? k.key.toUpperCase()].filter(Boolean).join('+')
/** Symbols like + and ? need Shift on many layouts: for them only the typed character counts. */
const matches = (k: Keys, e: KeyboardEvent): boolean => {
  const symbol = k.key.length === 1 && !/[a-z0-9]/.test(k.key)
  // With Alt held some layouts type a different character: compare the physical letter then.
  const typed = e.altKey && /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key.toLowerCase()
  return typed === k.key && (e.ctrlKey || e.metaKey) === !!k.mod && e.altKey === !!k.alt && (symbol || e.shiftKey === !!k.shift)
}

const flash = (msg: string) => {
  status.value = msg
  window.setTimeout(() => { if (status.value === msg) status.value = '' }, 2500)
}

// Keep the draft, so a playtest round trip (or a reload of the route) resumes the edit.
watch([level, levelName], () => saveEditorDraft(levelName.value, level.value), { deep: true, immediate: true })

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
const listIn = (L: LevelDef, g: Group): (PlatformDef | WindDef | HazardDef | ButtonDef | CheckpointDef)[] =>
  g === 'platforms' ? L.platforms : g === 'winds' ? L.winds : g === 'hazards' ? (L.hazards ??= []) : g === 'buttons' ? (L.buttons ??= []) : (L.checkpoints ??= [])
const listOf = (g: Group) => listIn(level.value, g)
const hazards = () => (level.value.hazards ??= [])
const entityOf = (e: Entity) => listOf(e.group)[e.i]
const motionOf = (e: Entity): Motion | undefined =>
  e.group === 'platforms' || e.group === 'hazards' ? (entityOf(e) as PlatformDef | HazardDef | undefined)?.motion : undefined
const snapV = (v: number, step = 10) => (snap.value ? Math.round(v / step) * step : Math.round(v))

/** The world as it plays at the preview time: movers posed, player at spawn. */
let world: World = createWorld(level.value, { w: tuning.playerWidth, h: tuning.playerHeight })
const rebuildWorld = () => {
  world = createWorld(level.value, { w: tuning.playerWidth, h: tuning.playerHeight })
  poseMovers(world, previewT, tuning)
}
/** Where an entity is drawn right now (movers follow their motion). */
const shownRect = (e: Entity): { x: number; y: number; w: number; h: number } =>
  e.group === 'winds' ? level.value.winds[e.i]!
    : e.group === 'platforms' ? world.platforms[e.i]!
      : e.group === 'hazards' ? world.hazards[e.i]!
        : e.group === 'buttons' ? level.value.buttons![e.i]!
          : checkpointBox(level.value.checkpoints![e.i]!)

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
let view: Camera = { s: 1, ox: 0, oy: 0 }
/** Zoom on top of fit-to-canvas, and pan in device px. */
let zoom = 1
let pan = { x: 0, y: 0 }
const fitView = () => { zoom = 1; pan = { x: 0, y: 0 } }
const onWheel = (e: WheelEvent) => {
  const el = canvasRef.value!
  const r = el.getBoundingClientRect()
  const dpr = el.width / r.width
  const mx = (e.clientX - r.left) * dpr
  const my = (e.clientY - r.top) * dpr
  const next = Math.min(8, Math.max(0.5, zoom * Math.exp(-e.deltaY * 0.0015)))
  const k = next / zoom
  // Keep the point under the cursor in place.
  const cx = el.width / 2, cy = el.height / 2
  pan = { x: (mx - cx) - ((mx - cx) - pan.x) * k, y: (my - cy) - ((my - cy) - pan.y) * k }
  zoom = next
}
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
  if (cur?.type === 'entity' && entityOf(cur)) {
    const r = shownRect(cur)
    if (cur.group !== 'checkpoints' && Math.hypot(p.x - (r.x + r.w), p.y - (r.y + r.h)) <= handleRadius() * 1.4) return { sel: cur, resize: true }
    const m = motionOf(cur)
    for (const h of m ? handlesOf(m) : []) if (Math.hypot(p.x - h.v.x, p.y - h.v.y) <= handleRadius() * 1.4) return { sel: cur, handle: h.key }
  }
  const sp = level.value.spawn
  if (inside(p, { x: sp.x - tuning.playerWidth / 2, y: sp.y - tuning.playerHeight, w: tuning.playerWidth, h: tuning.playerHeight }, 4)) return { sel: { type: 'spawn' } }
  // Small things first: hazards, then platforms, then (big) winds.
  for (const group of ['checkpoints', 'buttons', 'hazards', 'platforms', 'winds'] as Group[]) {
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
    case 'button': {
      // Its bottom on the click: drop it onto a platform's top edge.
      const list = (L.buttons ??= [])
      list.push({ x: snapV(a.x - 30), y: snapV(a.y) - 14, w: 60, h: 14, channel: 1 })
      sel = { type: 'entity', group: 'buttons', i: list.length - 1 }
      break
    }
    case 'checkpoint': {
      const list = (L.checkpoints ??= [])
      list.push({ x: snapV(a.x), y: snapV(a.y) })
      sel = { type: 'entity', group: 'checkpoints', i: list.length - 1 }
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
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    e.preventDefault()
    drag = { mode: 'pan', x: e.clientX, y: e.clientY }
    return
  }
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
  if (drag.mode === 'pan') {
    const el = canvasRef.value!
    const dpr = el.width / el.getBoundingClientRect().width
    pan = { x: pan.x + (e.clientX - drag.x) * dpr, y: pan.y + (e.clientY - drag.y) * dpr }
    drag.x = e.clientX
    drag.y = e.clientY
    return
  }
  const p = toWorld(e)
  if (drag.mode === 'create') { drag.now = p; return }
  if (drag.mode === 'move') {
    const dx = snapV(p.x - drag.start.x)
    const dy = snapV(p.y - drag.start.y)
    const t = drag.target
    if (t?.type === 'spawn') {
      level.value.spawn = { x: drag.snapshot.spawn.x + dx, y: drag.snapshot.spawn.y + dy }
    } else if (t?.type === 'entity') {
      const orig = listIn(drag.snapshot, t.group)[t.i]!
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
    if (drag.target.group === 'checkpoints') return
    const ent = entityOf(drag.target)! as PlatformDef
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

const onDoubleClick = (e: MouseEvent) => {
  if (!hitTest(toWorld(e as PointerEvent)).sel) fitView()
}

// ── Keys ──
const isTyping = (el: EventTarget | null) => {
  const tag = (el as HTMLElement | null)?.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
}
const onKeyDown = (e: KeyboardEvent) => {
  if (orderOpen.value) { if (e.key === 'Escape') closeOrder(); return }
  if (dialog.value) { if (e.key === 'Escape') dialog.value = null; return }
  if (openMenu.value && e.key === 'Escape') { openMenu.value = null; return }
  if (isTyping(e.target)) return
  if (mobileView.value && playKey(e, true)) return
  for (const id of visibleCommands.value) {
    const c = commands[id]!
    if (!c.keys?.some((k) => matches(k, e))) continue
    e.preventDefault()
    openMenu.value = null
    if (!c.enabled || c.enabled()) c.run()
    return
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const picked = TOOLS.find((x) => matches(x.keys, e))
  if (picked) { e.preventDefault(); tool.value = picked.id; return }
  // Arrows nudge the selection a pixel (Shift: 10).
  const dirs: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }
  const d = dirs[e.key.toLowerCase()]
  if (d && selection.value) {
    e.preventDefault()
    const k = e.shiftKey ? 10 : 1
    moveSelection(d[0] * k, d[1] * k)
  }
}

/** Moves the selection (and a mover's whole path) by dx, dy. */
const moveSelection = (dx: number, dy: number) => {
  const s = selection.value
  if (s?.type === 'spawn') { level.value.spawn.x += dx; level.value.spawn.y += dy; return }
  if (s?.type !== 'entity') return
  const ent = entityOf(s)
  if (!ent) return
  ent.x += dx
  ent.y += dy
  const m = motionOf(s)
  if (m && m.kind !== 'static') translateMotion(m, dx, dy)
}
/** A copy of the selection, a little down and to the right. */
const duplicateSelection = () => {
  const s = selection.value
  if (s?.type !== 'entity') return
  const ent = entityOf(s)
  if (!ent) return
  const copy = JSON.parse(JSON.stringify(ent)) as PlatformDef
  delete copy.finish
  const list = listOf(s.group) as unknown[]
  list.push(copy)
  selection.value = { type: 'entity', group: s.group, i: list.length - 1 }
  moveSelection(20, 20)
}

// ── Commands: one list drives the menus, the shortcuts and their hints ──
interface Command { keys?: Keys[]; run: () => void; enabled?: () => boolean; checked?: () => boolean; designer?: boolean }
const hasEntity = () => selection.value?.type === 'entity'
const zoomBy = (k: number) => { zoom = Math.min(8, Math.max(0.5, zoom * k)) }
const commands: Record<string, Command> = {
  new: { keys: [{ key: 'n', alt: true }], run: () => onNew() },
  open: { keys: [{ key: 'o', mod: true }], run: () => openDialog('open') },
  save: { keys: [{ key: 's', mod: true }], run: () => onSave() },
  importLevel: { keys: [{ key: 'i', mod: true }], run: () => fileInput.value?.click() },
  exportLevel: { keys: [{ key: 'e', mod: true }], run: () => onExportLevel() },
  back: { run: () => onBack() },
  undo: { keys: [{ key: 'z', mod: true }], run: () => undo(), enabled: () => undoStack.value.length > 0 },
  redo: { keys: [{ key: 'y', mod: true }, { key: 'z', mod: true, shift: true }], run: () => redo(), enabled: () => redoStack.value.length > 0 },
  duplicate: { keys: [{ key: 'd', mod: true }], run: () => duplicateSelection(), enabled: hasEntity },
  delete: { keys: [{ key: 'delete' }, { key: 'backspace' }], run: () => removeSelection(), enabled: hasEntity },
  deselect: { keys: [{ key: 'escape' }], run: () => { selection.value = null; tool.value = 'select' } },
  fit: { keys: [{ key: '0' }], run: () => fitView() },
  zoomIn: { keys: [{ key: '+' }, { key: '=' }], run: () => zoomBy(1.25) },
  zoomOut: { keys: [{ key: '-' }], run: () => zoomBy(0.8) },
  snap: { keys: [{ key: 'g' }], run: () => { snap.value = !snap.value }, checked: () => snap.value },
  animate: { keys: [{ key: 'a', shift: true }], run: () => { animate.value = !animate.value }, checked: () => animate.value },
  mobile: { keys: [{ key: 'm', shift: true }], run: () => toggleMobileView(), checked: () => mobileView.value },
  test: { keys: [{ key: 'enter' }], run: () => onTest() },
  share: { keys: [{ key: 'l', mod: true, shift: true }], run: () => void onShare() },
  submit: { keys: [{ key: 'u', mod: true, shift: true }], run: () => void openSubmit() },
  shortcuts: { keys: [{ key: '?' }], run: () => openDialog('keys') },
  // The designer's campaign tools ("cmonc"): English only, like the tuning panel.
  campaignOverwrite: { run: () => onOverwrite(), enabled: () => overwriteSlot.value !== '', designer: true },
  campaignReplace: { run: () => onReplaceSlot(), designer: true },
  campaignRevert: { run: () => onRevert(), enabled: () => overwriteSlot.value !== '' && !!campaignOverrides.value[overwriteSlot.value], designer: true },
  reorder: { run: () => openOrder(), designer: true },
  sync: { run: () => void onSync(), enabled: () => !!BUCKET_URL && !syncing.value, designer: true },
  password: { run: () => onPasswordPrompt(), enabled: () => !!BUCKET_URL, designer: true },
  exportLibrary: { run: () => onExportLibrary(), designer: true },
  importLibrary: { run: () => fileInput.value?.click(), designer: true }
}
const DESIGNER_LABELS: Record<string, () => string> = {
  campaignOverwrite: () => overwriteSlot.value === '' ? 'Overwrite campaign level' : `Overwrite campaign level ${slotNumber(overwriteSlot.value)}`,
  campaignReplace: () => 'Replace another campaign level…',
  campaignRevert: () => 'Revert to the original',
  reorder: () => 'Reorder campaign…',
  sync: () => '⇅ Sync levels bucket',
  password: () => 'Editor password…',
  exportLibrary: () => 'Export library (all levels)',
  importLibrary: () => 'Import library file…'
}
const cmdLabel = (id: string) => DESIGNER_LABELS[id]?.() ?? t(`umbrellaEditor.cmd.${id}`)
const designer = computed(() => editorUnlocked.value)
const menus = computed(() => [
  { id: 'file', items: ['new', 'open', 'save', '-', 'importLevel', 'exportLevel', '-', 'back'] },
  { id: 'edit', items: ['undo', 'redo', '-', 'duplicate', 'delete', 'deselect'] },
  { id: 'view', items: ['fit', 'zoomIn', 'zoomOut', '-', 'snap', 'animate', 'mobile'] },
  { id: 'level', items: ['test', '-', 'share', ...(communityEnabled ? ['submit'] : [])] },
  ...(designer.value ? [{ id: 'campaign', items: ['campaignOverwrite', 'campaignReplace', 'campaignRevert', 'reorder', '-', 'sync', 'password', '-', 'exportLibrary', 'importLibrary'] }] : []),
  { id: 'help', items: ['shortcuts'] }
])
/** Commands reachable now: the designer's only after "cmonc", Submit only where the community exists. */
const visibleCommands = computed(() => Object.keys(commands).filter((id) =>
  (!commands[id]!.designer || designer.value) && (id !== 'submit' || communityEnabled)))
const cmdKeys = (id: string) => (commands[id]?.keys?.[0] ? fmtKeys(commands[id]!.keys![0]!) : '')
const cmdEnabled = (id: string) => commands[id]?.enabled?.() ?? true
const runCmd = (id: string) => {
  openMenu.value = null
  if (cmdEnabled(id)) commands[id]?.run()
}
const openMenu = ref<string | null>(null)
const toggleMenu = (id: string) => { openMenu.value = openMenu.value === id ? null : id }
/** Once a menu is open, pointing at another opens that one (like a desktop menu bar). */
const hoverMenu = (id: string) => { if (openMenu.value) openMenu.value = id }
const onDocPointer = (e: PointerEvent) => {
  if (openMenu.value && !(e.target as HTMLElement | null)?.closest('.menus')) openMenu.value = null
}

// ── Dialogs ──
const dialog = ref<null | 'open' | 'share' | 'submit' | 'keys'>(null)
const openTab = ref<'mine' | 'campaign'>('mine')
const openDialog = (d: 'open' | 'share' | 'submit' | 'keys') => { openMenu.value = null; dialog.value = d }

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
const MOTION_FIELDS: Record<string, { key: string; label: string; min: number; max: number; step: number; def?: number; triggerOnly?: boolean }[]> = {
  line: [{ key: 'period', label: 'Period (s)', min: 0.3, max: 20, step: 0.1 }],
  circle: [{ key: 'period', label: 'Period (s)', min: 0.3, max: 20, step: 0.1 }, { key: 'radius', label: 'Radius', min: 0, max: 800, step: 5 }],
  swing: [
    { key: 'period', label: 'Period (s)', min: 0.3, max: 20, step: 0.1 },
    { key: 'amplitude', label: 'Swing (rad)', min: 0, max: 3, step: 0.05 },
    { key: 'radius', label: 'Rope length', min: 0, max: 900, step: 5 }
  ],
  lunge: [
    { key: 'period', label: 'Period (s)', min: 0.3, max: 10, step: 0.05 },
    { key: 'speed', label: 'Lunge speed ×', min: 0.25, max: 4, step: 0.05, def: 1 },
    { key: 'radius', label: 'Trigger radius', min: 40, max: 1200, step: 10, def: DEFAULT_TRIGGER_RADIUS, triggerOnly: true }
  ],
  arrive: [{ key: 'delay', label: 'Delay (s)', min: 0, max: 10, step: 0.1 }, { key: 'duration', label: 'Glide (s)', min: 0.1, max: 10, step: 0.1 }]
}
const motionFields = computed(() => (MOTION_FIELDS[motionKind.value] ?? []).filter((f) =>
  !f.triggerOnly || (selectedMotion.value?.kind === 'lunge' && selectedMotion.value.trigger)))
const fieldValue = (key: string, def?: number) => (selectedMotion.value as Record<string, number> | undefined)?.[key] ?? def
const setTrigger = (on: boolean) => {
  const m = selectedMotion.value
  if (m?.kind !== 'lunge') return
  if (on) { m.trigger = true; m.radius ??= DEFAULT_TRIGGER_RADIUS }
  else { delete m.trigger; delete m.radius }
}
const setMotionField = (key: string, v: number) => {
  const m = selectedMotion.value as Record<string, unknown> | undefined
  if (m && Number.isFinite(v)) m[key] = v
}
const setRect = (key: 'x' | 'y' | 'w' | 'h', v: number) => {
  const ent = selected.value?.ent
  if (!ent || !Number.isFinite(v)) return
  ;(ent as unknown as Record<string, number>)[key] = key === 'w' || key === 'h' ? Math.max(1, v) : v
}
const presetIndex = computed(() => WORLD_PRESETS.findIndex((p) =>
  p.w === level.value.world.w && p.h === level.value.world.h &&
  (p.view?.w ?? 0) === (level.value.view?.w ?? 0) && (p.view?.h ?? 0) === (level.value.view?.h ?? 0)))
const setWorldPreset = (i: number) => {
  const p = WORLD_PRESETS[i]
  if (!p) return
  level.value.world = { w: p.w, h: p.h }
  if (p.view) level.value.view = { ...p.view }
  else delete level.value.view
  fitView()
}
const setWorldSize = (key: 'w' | 'h', v: number) => {
  if (Number.isFinite(v) && v >= 100) level.value.world[key] = Math.round(v)
}
const scrolls = computed(() => !!level.value.view)
const setScrolls = (on: boolean) => {
  if (on) level.value.view = { ...SCREEN }
  else delete level.value.view
}
const setFinish = (on: boolean) => {
  const p = selectedPlatform.value
  if (!p) return
  if (on) { level.value.platforms.forEach((x) => { delete x.finish }); p.finish = true }
  else delete p.finish
}
const setFlag = (ent: object, key: 'super' | 'harmless' | 'whenOff', on: boolean) => {
  const o = ent as Record<string, unknown>
  if (on) o[key] = true
  else delete o[key]
}

// ── Switches: platforms and currents on a button channel ──
const setChannel = (ent: PlatformDef | WindDef, v: string) => {
  if (v === '') { delete ent.channel; delete (ent as PlatformDef).whenOff; delete (ent as WindDef).switched; return }
  ent.channel = Number(v)
  if ('dir' in ent) ent.switched ??= { speed: 0 }
}
const setSwitchedDir = (w: WindDef, v: string) => {
  w.switched ??= {}
  if (v === '') delete w.switched.dir
  else w.switched.dir = v as WindDir
}
const setSwitchedSpeed = (w: WindDef, v: string) => {
  w.switched ??= {}
  const n = Number(v)
  if (v === '' || !Number.isFinite(n)) delete w.switched.speed
  else w.switched.speed = Math.max(0, n)
}
const setButtonMode = (b: ButtonDef, timed: boolean) => {
  if (timed) b.duration ??= 5
  else delete b.duration
}
const selectedButton = computed(() => (selected.value?.group === 'buttons' ? (selected.value.ent as ButtonDef) : null))
const selectedCheckpoint = computed(() => (selected.value?.group === 'checkpoints' ? (selected.value.ent as CheckpointDef) : null))
const rectKeys = computed(() => (selected.value?.group === 'checkpoints' ? (['x', 'y'] as const) : (['x', 'y', 'w', 'h'] as const)))
const selectedKind = computed(() => {
  const s = selected.value
  if (!s) return ''
  if (s.group === 'hazards') return (s.ent as HazardDef).kind
  if (s.group === 'winds') return (s.ent as WindDef).super ? 'super' : 'wind'
  if (s.group === 'platforms') return (s.ent as PlatformDef).finish ? 'finish' : 'platform'
  return s.group === 'buttons' ? 'button' : 'checkpoint'
})

// ── Checks shown under the canvas, so a broken level is visible before testing ──
const problems = computed(() => {
  const L = level.value
  const out: string[] = []
  if (!L.platforms.some((p) => p.finish)) out.push(t('umbrellaEditor.problem.noFinish'))
  const sp = L.spawn
  if (sp.x < 0 || sp.y < 0 || sp.x > L.world.w || sp.y > L.world.h) out.push(t('umbrellaEditor.problem.spawnOutside'))
  if (L.view && L.view.w >= L.world.w && L.view.h >= L.world.h) out.push(t('umbrellaEditor.problem.noScroll'))
  const used = new Set((L.buttons ?? []).map((b) => b.channel))
  const switched = [...L.platforms, ...L.winds].some((x) => x.channel !== undefined && !used.has(x.channel))
  if (switched) out.push(t('umbrellaEditor.problem.noButton'))
  return out
})

// ── Library / campaign / files ──
const libraryNames = computed(() => Object.keys(customLevels.value).sort())
const campaignOptions = computed(() => {
  void campaignOrder.value // LEVELS is rebuilt in place when the order changes
  const names = new Map(campaignEntries().map((e) => [e.id, e.name ?? (e.custom && `★ ${e.custom}`)]))
  return LEVELS.map((l, i) => ({ id: l.id, label: `${t('umbrella.level', { n: i + 1 })}${names.get(l.id) ? ` · ${names.get(l.id)}` : ''}${designer.value && campaignOverrides.value[l.id] ? ' (edited)' : ''}` }))
})
const slotNumber = (id: number) => LEVELS.findIndex((l) => l.id === id) + 1

// ── Reorder dialog: drag the campaign into a new order, drag saved levels in ──
const orderOpen = ref(false)
const orderDraft = ref<OrderEntry[]>([])
/** What is being dragged: a campaign row (its index) or a saved level (its name). */
const dragging = ref<{ row: number } | { lib: string } | null>(null)
const dropAt = ref<number | null>(null)
/** The authored levels' ids in authored order, for "Original level N" and Reset. */
const AUTHORED_IDS = campaignEntries().filter((e) => !e.custom).map((e) => e.id).sort((a, b) => a - b)
/** Where the slot comes from: an authored level's original number, or the saved level added. */
const orderOrigin = (e: OrderEntry) =>
  e.custom ? `★ ${e.custom}` : `Original level ${AUTHORED_IDS.indexOf(e.id) + 1}${campaignOverrides.value[e.id] ? ' (edited)' : ''}`
const orderLabel = (e: OrderEntry) => e.name ?? orderOrigin(e)
// Rename: the slot's mechanic or theme instead of its number.
const renaming = ref<number | null>(null)
const renameDraft = ref('')
const startRename = (i: number) => {
  renaming.value = i
  renameDraft.value = orderDraft.value[i]?.name ?? ''
}
const commitRename = () => {
  const e = renaming.value === null ? undefined : orderDraft.value[renaming.value]
  if (e) {
    const v = renameDraft.value.trim().slice(0, 40)
    if (v) e.name = v
    else delete e.name
  }
  renaming.value = null
}
const orderPool = computed(() => libraryNames.value.filter((n) => !orderDraft.value.some((e) => e.custom === n)))
const orderKey = (list: OrderEntry[]) => JSON.stringify(list.map((e) => [e.id, e.custom, e.name ?? '']))
const orderChanged = computed(() => orderKey(orderDraft.value) !== orderKey(campaignEntries()))

const openOrder = () => { orderDraft.value = campaignEntries(); dragging.value = null; dropAt.value = null; renaming.value = null; orderOpen.value = true }
const closeOrder = () => {
  if (orderChanged.value && !window.confirm('Discard the new order?')) return
  orderOpen.value = false
}
const addToOrder = (name: string, at = orderDraft.value.length) => {
  const l = customLevels.value[name]
  if (!l) return
  const id = nextCustomId(orderDraft.value.map((e) => e.id))
  orderDraft.value.splice(at, 0, { id, custom: name, level: { ...cloneLevel(l), id } })
}
/** Moves row `from` so it lands before what is now at `to` (to = length: the end). */
const moveInOrder = (from: number, to: number) => {
  const list = orderDraft.value
  if (to < 0 || to > list.length) return
  const [e] = list.splice(from, 1)
  list.splice(to > from ? to - 1 : to, 0, e!)
}
const removeFromOrder = (i: number) => { orderDraft.value.splice(i, 1) }
const onOrderDragOver = (e: DragEvent, i: number) => {
  if (!dragging.value) return
  e.preventDefault()
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dropAt.value = e.clientY < r.top + r.height / 2 ? i : i + 1
}
const onOrderDrop = () => {
  const d = dragging.value
  const at = dropAt.value ?? orderDraft.value.length
  if (d && 'row' in d) moveInOrder(d.row, at)
  else if (d) addToOrder(d.lib, at)
  dragging.value = null
  dropAt.value = null
}
const onOrderSave = () => {
  saveCampaignOrder(orderDraft.value)
  orderOpen.value = false
  flash(`Campaign order saved · ${orderDraft.value.length} levels`)
}
const onOrderReset = () => { orderDraft.value = AUTHORED_IDS.map((id) => ({ id })) }

const loadIntoEditor = (l: LevelDef, name: string) => {
  level.value = cloneLevel(l)
  levelName.value = name
  selection.value = null
  previewT = 0
}
const onNew = () => { loadIntoEditor(blankLevel(), t('umbrellaEditor.untitled')); overwriteSlot.value = ''; flash(t('umbrellaEditor.msg.newLevel')) }
const onSave = () => {
  const name = levelName.value.trim() || t('umbrellaEditor.untitled')
  levelName.value = name
  saveCustomLevel(name, level.value)
  flash(t('umbrellaEditor.msg.saved', { name }))
}
const openSaved = (name: string) => {
  const l = customLevels.value[name]
  if (!l) return
  loadIntoEditor(l, name)
  overwriteSlot.value = ''
  dialog.value = null
  flash(t('umbrellaEditor.msg.opened', { name }))
}
const deleteSaved = (name: string) => {
  if (!window.confirm(t('umbrellaEditor.confirmDelete', { name }))) return
  deleteCustomLevel(name)
  flash(t('umbrellaEditor.msg.deleted', { name }))
}
const openCampaign = (id: number) => {
  const l = LEVELS.find((x) => x.id === id)
  if (!l) return
  const n = slotNumber(id)
  // A player's copy is theirs: it gets a name of its own and never touches the campaign.
  loadIntoEditor(l, designer.value ? slotTitle(id) ?? `level-${n}` : t('umbrellaEditor.campaignCopy', { n }))
  overwriteSlot.value = designer.value ? id : ''
  dialog.value = null
  flash(t('umbrellaEditor.msg.openedCampaign', { n }))
}
const onOverwrite = () => {
  const id = overwriteSlot.value
  if (id === '') return
  const n = slotNumber(id)
  if (!window.confirm(`Replace campaign level ${n} with this edit? (Revert restores the original.)`)) return
  saveCampaignOverride(id, level.value)
  flash(`Campaign level ${n} replaced`)
}
const onReplaceSlot = () => {
  const n = Number(window.prompt(`Replace which campaign level (1–${LEVELS.length})?`, ''))
  const l = Number.isInteger(n) ? LEVELS[n - 1] : undefined
  if (!l) return
  overwriteSlot.value = l.id
  onOverwrite()
}
const onRevert = () => {
  const id = overwriteSlot.value
  if (id === '' || !campaignOverrides.value[id]) return
  clearCampaignOverride(id)
  flash('Campaign level restored to the original')
}
const download = (fileName: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  a.click()
  URL.revokeObjectURL(a.href)
}
const fileSafe = (s: string) => s.trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'level'
/** The open level as a .json file (what Import reads back). */
const onExportLevel = () => {
  const name = levelName.value.trim() || t('umbrellaEditor.untitled')
  download(`umbrella-${fileSafe(name)}.json`, { game: 'umbrella', kind: 'level', version: 1, name, level: cloneLevel(level.value) })
  flash(t('umbrellaEditor.msg.exported', { name }))
}
/** Every saved level, edited campaign slot and deletion in one file — the designer's
 *  fallback when the levels bucket is unreachable. */
const onExportLibrary = () => {
  const n = libraryNames.value.length
  const c = Object.keys(campaignOverrides.value).length
  download(`umbrella-levels-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`, libraryToFile())
  flash(`Exported ${n} saved level${n === 1 ? '' : 's'} and ${c} edited campaign level${c === 1 ? '' : 's'}`)
}
const onImportFile = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const data: unknown = JSON.parse(await file.text())
    // Library files touch the campaign: the designer's only.
    const bucket = designer.value ? bucketFromFile(data) : null
    if (bucket) {
      // Newest wins, same as a sync: pull first so the file cannot undo a newer bucket edit.
      await syncBucket()
      const changed = applyBucket(bucket)
      if (changed) await syncBucket()
      const total = Object.keys(bucket.campaign ?? {}).length + Object.keys(bucket.library ?? {}).length
      flash(`Imported ${changed} of ${total} level${total === 1 ? '' : 's'} (the rest are older than the copies here)`)
      return
    }
    const one = levelFromFile(data)
    if (!one) { flash(t('umbrellaEditor.msg.noLevelInFile')); return }
    loadIntoEditor(one.level, one.name)
    overwriteSlot.value = ''
    flash(t('umbrellaEditor.msg.imported', { name: one.name }))
  } catch {
    flash(t('umbrellaEditor.msg.fileBroken'))
  }
}
const syncing = ref(false)
const onSync = async () => {
  syncing.value = true
  await syncBucket()
  syncing.value = false
  if (bucketStatus.value) flash(bucketStatus.value.text)
}
const onPasswordPrompt = () => {
  const pw = window.prompt('Editor password (kept in this browser only):', bucketPassword.value)
  if (pw === null) return
  setBucketPassword(pw)
  void onSync()
}

// ── Share link ──
const shareUrl = ref('')
const shareCopied = ref(false)
const onShare = async () => {
  const name = levelName.value.trim() || t('umbrellaEditor.untitled')
  shareUrl.value = shareLink(await encodeLevel(level.value, name))
  shareCopied.value = false
  openDialog('share')
  await copyShare()
}
const copyShare = async () => {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    shareCopied.value = true
  } catch {
    shareCopied.value = false // the link stays selectable in the dialog
  }
}

// ── Submit to the community ──
const AUTHOR_KEY = 'umb_author'
const author = ref((() => { try { return localStorage.getItem(AUTHOR_KEY) ?? '' } catch { return '' } })())
const quota = ref<{ used: number; limit: number; resetAt: number | null } | null>(null)
const submitState = ref<'idle' | 'sending' | 'done' | 'limit' | 'error'>('idle')
const submitLeft = computed(() => (quota.value ? Math.max(0, quota.value.limit - quota.value.used) : null))
const openSubmit = async () => {
  if (!communityEnabled) return
  submitState.value = 'idle'
  openDialog('submit')
  quota.value = await getQuota().catch(() => null)
}
const onSubmit = async () => {
  const name = levelName.value.trim()
  if (!name || problems.value.length) return
  try { localStorage.setItem(AUTHOR_KEY, author.value.trim()) } catch { /* private mode */ }
  submitState.value = 'sending'
  // A submitted level is also the player's own: kept in their library.
  saveCustomLevel(name, level.value)
  const res = await submitLevel({ name, author: author.value.trim(), code: await encodeLevel(level.value, name) })
  if (res.ok) {
    submitState.value = 'done'
    if (quota.value) quota.value = { ...quota.value, used: quota.value.used + 1 }
  } else if (res.reason === 'weekly-limit') {
    submitState.value = 'limit'
    quota.value = { limit: quota.value?.limit ?? 5, used: res.used, resetAt: res.resetAt }
  } else submitState.value = 'error'
}
const resetDate = computed(() => (quota.value?.resetAt ? new Date(quota.value.resetAt).toLocaleDateString() : ''))

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
  if (mobileView.value) {
    stepPlay(dtReal)
    // One shared camera centre: only the first phone advances its smoothing.
    paintPhone(portraitRef.value, dtReal)
    paintPhone(landscapeRef.value, 0)
    return
  }
  if (animate.value && !drag) previewT += dtReal
  const dpr = window.devicePixelRatio || 1
  const cw = Math.round(el.clientWidth * dpr)
  const ch = Math.round(el.clientHeight * dpr)
  if (el.width !== cw || el.height !== ch) { el.width = cw; el.height = ch }
  const ctx = el.getContext('2d')
  if (!ctx || cw === 0 || ch === 0) return

  rebuildWorld()
  const L = level.value
  // Fit the world plus a margin, then the wheel zoom and the pan on top.
  const s = Math.min(cw / (L.world.w * (1 + 2 * MARGIN)), ch / (L.world.h * (1 + 2 * MARGIN))) * zoom
  view = { s, ox: (cw - L.world.w * s) / 2 + pan.x, oy: (ch - L.world.h * s) / 2 + pan.y }
  render(ctx, world, { finish: t('umbrella.finish') }, tuning, 0, view)

  // Overlay in world space.
  ctx.setTransform(s, 0, 0, s, view.ox, view.oy)
  ctx.lineWidth = 1.5 / s
  // Scrolling level: the screen grid, and the screen the camera starts on.
  if (L.view) {
    ctx.strokeStyle = 'rgba(160,200,255,0.18)'
    ctx.setLineDash([12 / s, 10 / s])
    ctx.beginPath()
    for (let x = L.view.w; x < L.world.w; x += L.view.w) { ctx.moveTo(x, 0); ctx.lineTo(x, L.world.h) }
    for (let y = L.view.h; y < L.world.h; y += L.view.h) { ctx.moveTo(0, y); ctx.lineTo(L.world.w, y) }
    ctx.stroke()
    ctx.setLineDash([])
    const start = startScreen(L)
    strokeRect(ctx, start, 'rgba(120,200,255,0.8)', [10 / s, 6 / s])
    ctx.fillStyle = 'rgba(120,200,255,0.9)'
    ctx.font = `${12 / s}px system-ui, sans-serif`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(t('umbrellaEditor.startScreen'), start.x + 6 / s, start.y + 6 / s)
  }
  // Off-world things (a lunge resting off-screen) still need an outline to grab.
  for (const group of ['platforms', 'winds', 'hazards', 'buttons', 'checkpoints'] as Group[]) {
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
      if (m.kind === 'lunge' && m.trigger) {
        // The trigger zone, around the rest point.
        ctx.strokeStyle = isSel ? 'rgba(255,90,95,0.85)' : 'rgba(255,90,95,0.35)'
        ctx.fillStyle = 'rgba(255,90,95,0.06)'
        ctx.setLineDash([6 / s, 6 / s])
        ctx.beginPath()
        ctx.arc(m.a.x, m.a.y, m.radius ?? DEFAULT_TRIGGER_RADIUS, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.setLineDash([])
      }
      if (isSel) for (const h of handlesOf(m)) dot(ctx, h.v, handleRadius(), h.key === 'b' ? '#ffb347' : '#ffe066')
    })
  }

  if (sel?.type === 'entity' && entityOf(sel)) {
    const r = shownRect(sel)
    strokeRect(ctx, r, '#4ade80')
    ctx.fillStyle = '#4ade80'
    const hs = handleRadius()
    if (sel.group !== 'checkpoints') ctx.fillRect(r.x + r.w - hs, r.y + r.h - hs, hs * 2, hs * 2)
  } else if (sel?.type === 'spawn') {
    const sp = L.spawn
    strokeRect(ctx, { x: sp.x - tuning.playerWidth / 2, y: sp.y - tuning.playerHeight, w: tuning.playerWidth, h: tuning.playerHeight }, '#4ade80')
  }

  if (drag?.mode === 'create') {
    const a = drag.start, b = drag.now
    strokeRect(ctx, { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }, '#60a5fa', [6 / s, 4 / s])
  }
}
/** The screen a scrolling level opens on: one view centred on the spawn, kept inside the world. */
const startScreen = (L: LevelDef) => {
  const v = L.view ?? L.world
  const clamp = (c: number, size: number, world: number) => Math.max(0, Math.min(world - size, c - size / 2))
  return { x: clamp(L.spawn.x, v.w, L.world.w), y: clamp(L.spawn.y - tuning.playerHeight / 2, v.h, L.world.h), w: Math.min(v.w, L.world.w), h: Math.min(v.h, L.world.h) }
}

// ── Mobile view: one live playtest drawn on a portrait and a landscape phone at once ──
const mobileView = ref(false)
const portraitRef = ref<HTMLCanvasElement | null>(null)
const landscapeRef = ref<HTMLCanvasElement | null>(null)
const DT = 1 / 120
let play: World | null = null
let playAcc = 0
const playHeld = { left: false, right: false }
let playToggle = false
const restartPlay = () => {
  play = createWorld(cloneLevel(level.value), { w: tuning.playerWidth, h: tuning.playerHeight })
  playAcc = 0
}
const toggleMobileView = () => {
  mobileView.value = !mobileView.value
  playHeld.left = playHeld.right = false
  if (mobileView.value) { selection.value = null; restartPlay() } else play = null
}
// Editing the level while previewing restarts the playtest with the change.
watch(level, () => { if (mobileView.value) restartPlay() }, { deep: true })
/** The game's controls, while the mobile preview is up. True when the key was the game's. */
const playKey = (e: KeyboardEvent, down: boolean): boolean => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') playHeld.left = down
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') playHeld.right = down
  else if (e.code === 'Space') { if (down && !e.repeat) playToggle = true }
  else if (e.code === 'KeyR') { if (down) restartPlay() }
  else return false
  e.preventDefault()
  return true
}
const onKeyUp = (e: KeyboardEvent) => { if (mobileView.value) playKey(e, false) }
/** A tap on either phone is the game's one button. */
const onPhoneTap = () => { playToggle = true }
// The game's touch controls, drawn on each phone: one shared joystick state.
const STICK_RANGE = 22
const STICK_DEAD = 6
const stickDir = ref(0)
const knobX = ref(0)
let stickId = -1
let stickOrigin = 0
const onStickDown = (e: PointerEvent) => {
  stickId = e.pointerId
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  stickOrigin = r.left + r.width / 2
  onStickMove(e)
}
const onStickMove = (e: PointerEvent) => {
  if (e.pointerId !== stickId) return
  const dx = Math.max(-STICK_RANGE, Math.min(STICK_RANGE, e.clientX - stickOrigin))
  knobX.value = dx
  stickDir.value = Math.abs(dx) < STICK_DEAD ? 0 : Math.sign(dx)
}
const onStickUp = (e: PointerEvent) => {
  if (e.pointerId !== stickId) return
  stickId = -1
  knobX.value = 0
  stickDir.value = 0
}
const umbrellaPressed = ref(false)
const onUmbrellaDown = (e: PointerEvent) => {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  playToggle = true
  umbrellaPressed.value = true
}
const stepPlay = (dtReal: number) => {
  if (!play) return
  playAcc += dtReal
  while (playAcc >= DT) {
    playAcc -= DT
    const input: Input = { left: playHeld.left || stickDir.value < 0, right: playHeld.right || stickDir.value > 0, toggle: playToggle }
    playToggle = false
    step(play, input, DT, tuning)
    // Like the game's test mode: any ending restarts the level.
    if (play.phase === 'out' || (play.phase === 'splat' && play.phaseTime >= tuning.splatReset)) {
      const cp = play.checkpoint
      if (cp >= 0) play = createWorld(cloneLevel(level.value), { w: tuning.playerWidth, h: tuning.playerHeight }, cp)
      else restartPlay()
      return
    }
    if (play.phase === 'win' && play.phaseTime >= tuning.winHold) {
      restartPlay()
      return
    }
  }
}
const paintPhone = (el: HTMLCanvasElement | null, dt: number) => {
  if (!el || !play) return
  const dpr = window.devicePixelRatio || 1
  const cw = Math.round(el.clientWidth * dpr)
  const ch = Math.round(el.clientHeight * dpr)
  if (el.width !== cw || el.height !== ch) { el.width = cw; el.height = ch }
  const ctx = el.getContext('2d')
  if (ctx && cw > 0 && ch > 0) render(ctx, play, { finish: t('umbrella.finish') }, tuning, dt, cameraFor(play, cw, ch, dt))
}

onMounted(() => {
  // The designer's editor always starts from the bucket's newest levels (the game pulled once at boot).
  if (designer.value) void syncBucket()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  raf = requestAnimationFrame(paint)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="editor" @pointerdown.capture="onDocPointer">
    <header class="topbar">
      <div class="brand">☂ <span>{{ t('umbrellaEditor.title') }}</span><em v-if="designer" class="badge">designer</em></div>
      <nav class="menus" role="menubar">
        <div v-for="m in menus" :key="m.id" class="menu">
          <button
            class="menu-btn"
            :class="{ open: openMenu === m.id }"
            role="menuitem"
            aria-haspopup="true"
            :aria-expanded="openMenu === m.id"
            @click="toggleMenu(m.id)"
            @pointerenter="hoverMenu(m.id)"
          >{{ m.id === 'campaign' ? 'Campaign' : t(`umbrellaEditor.menu.${m.id}`) }}</button>
          <div v-if="openMenu === m.id" class="menu-list" role="menu">
            <template v-for="(id, i) in m.items" :key="`${m.id}-${i}`">
              <div v-if="id === '-'" class="menu-sep" role="separator" />
              <button v-else class="menu-item" role="menuitem" :disabled="!cmdEnabled(id)" @click="runCmd(id)">
                <span class="menu-check">{{ commands[id]?.checked?.() ? '✓' : '' }}</span>
                <span class="menu-label">{{ cmdLabel(id) }}</span>
                <kbd v-if="cmdKeys(id)">{{ cmdKeys(id) }}</kbd>
              </button>
            </template>
          </div>
        </div>
      </nav>
      <input v-model="levelName" class="field name" :placeholder="t('umbrellaEditor.namePlaceholder')" :aria-label="t('umbrellaEditor.namePlaceholder')" />
      <div class="quick">
        <button class="btn" :disabled="!cmdEnabled('undo')" :title="cmdLabel('undo')" @click="runCmd('undo')">↶ <kbd>{{ cmdKeys('undo') }}</kbd></button>
        <button class="btn" :disabled="!cmdEnabled('redo')" :title="cmdLabel('redo')" @click="runCmd('redo')">↷ <kbd>{{ cmdKeys('redo') }}</kbd></button>
        <button class="btn green" @click="runCmd('save')">💾 {{ t('umbrellaEditor.cmd.save') }} <kbd>{{ cmdKeys('save') }}</kbd></button>
        <button class="btn blue" @click="runCmd('share')">🔗 {{ t('umbrellaEditor.share') }} <kbd>{{ cmdKeys('share') }}</kbd></button>
        <button v-if="communityEnabled" class="btn indigo" @click="runCmd('submit')">🌐 {{ t('umbrellaEditor.submitShort') }} <kbd>{{ cmdKeys('submit') }}</kbd></button>
        <button class="btn yellow" @click="runCmd('test')">▶ {{ t('umbrellaEditor.cmd.test') }} <kbd>{{ cmdKeys('test') }}</kbd></button>
      </div>
      <span class="grow" />
      <span v-if="designer && BUCKET_URL && bucketStatus" class="sync" :class="{ bad: !bucketStatus.ok }" role="status">{{ bucketStatus.ok ? '✓' : '⚠' }} {{ bucketStatus.text }}</span>
      <LanguageSelect compact />
      <button class="btn" @click="runCmd('back')">✕ {{ t('umbrellaEditor.cmd.back') }}</button>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onImportFile" />
    </header>

    <div class="body">
      <aside class="panel tools" :aria-label="t('umbrellaEditor.toolsTitle')">
        <section v-for="g in TOOL_GROUPS" :key="g.id" class="tool-group">
          <div class="head">{{ t(`umbrellaEditor.toolGroup.${g.id}`) }}</div>
          <button
            v-for="tl in g.tools"
            :key="tl.id"
            class="tool"
            :class="{ on: tool === tl.id }"
            :aria-pressed="tool === tl.id"
            @click="tool = tl.id"
          >
            <span class="tool-icon">{{ tl.icon }}</span>
            <span class="tool-label">{{ t(`umbrellaEditor.tool.${tl.id}`) }}</span>
            <kbd>{{ fmtKeys(tl.keys) }}</kbd>
          </button>
        </section>
        <p class="hint">{{ t(`umbrellaEditor.toolHint.${tool}`) }}</p>
        <p class="hint">{{ t('umbrellaEditor.canvasHint') }}</p>
      </aside>

      <main class="stage">
        <div v-if="mobileView" class="phones">
          <div class="phone portrait" :style="{ aspectRatio: `${PHONE.w} / ${PHONE.h}` }">
            <canvas ref="portraitRef" class="phone-canvas" @pointerdown="onPhoneTap" />
            <div class="stick" @pointerdown.stop="onStickDown" @pointermove="onStickMove" @pointerup="onStickUp" @pointercancel="onStickUp">
              <span class="stick-arrow left">‹</span>
              <span class="stick-arrow right">›</span>
              <span class="stick-knob" :style="{ transform: `translateX(${knobX}px)` }" />
            </div>
            <button class="umbrella-btn" :class="{ pressed: umbrellaPressed }" :aria-label="t('umbrella.umbrellaButton')" @pointerdown.stop="onUmbrellaDown" @pointerup="umbrellaPressed = false" @pointercancel="umbrellaPressed = false">☂</button>
            <span class="phone-label">{{ t('umbrellaEditor.portrait') }} {{ PHONE.w }}×{{ PHONE.h }}</span>
          </div>
          <div class="phone landscape" :style="{ aspectRatio: `${PHONE.h} / ${PHONE.w}` }">
            <canvas ref="landscapeRef" class="phone-canvas" @pointerdown="onPhoneTap" />
            <div class="stick" @pointerdown.stop="onStickDown" @pointermove="onStickMove" @pointerup="onStickUp" @pointercancel="onStickUp">
              <span class="stick-arrow left">‹</span>
              <span class="stick-arrow right">›</span>
              <span class="stick-knob" :style="{ transform: `translateX(${knobX}px)` }" />
            </div>
            <button class="umbrella-btn" :class="{ pressed: umbrellaPressed }" :aria-label="t('umbrella.umbrellaButton')" @pointerdown.stop="onUmbrellaDown" @pointerup="umbrellaPressed = false" @pointercancel="umbrellaPressed = false">☂</button>
            <span class="phone-label">{{ t('umbrellaEditor.landscape') }} {{ PHONE.h }}×{{ PHONE.w }}</span>
          </div>
        </div>
        <canvas
          v-show="!mobileView"
          ref="canvasRef"
          class="canvas"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @contextmenu.prevent
          @wheel.prevent="onWheel"
          @dblclick="onDoubleClick"
        />
        <div class="foot">
          <span v-if="mobileView" class="status">{{ t('umbrellaEditor.mobileHint') }}</span>
          <span v-for="p in problems" :key="p" class="warn">⚠ {{ p }}</span>
          <span v-if="status" class="status">{{ status }}</span>
        </div>
      </main>

      <aside class="panel props">
        <div class="head">{{ t('umbrellaEditor.levelTitle') }}</div>
        <label class="row col">{{ t('umbrellaEditor.prop.world') }}
          <select class="field" :value="presetIndex" @change="setWorldPreset(+($event.target as HTMLSelectElement).value)">
            <option :value="-1" disabled>{{ t('umbrellaEditor.world.custom') }}</option>
            <option v-for="(p, i) in WORLD_PRESETS" :key="p.key" :value="i">{{ t(`umbrellaEditor.world.${p.key}`) }}</option>
          </select>
        </label>
        <div class="pair">
          <label class="row">{{ t('umbrellaEditor.prop.worldW') }} <input class="field num" type="number" min="100" step="10" :value="level.world.w" @change="setWorldSize('w', +($event.target as HTMLInputElement).value)" /></label>
          <label class="row">{{ t('umbrellaEditor.prop.worldH') }} <input class="field num" type="number" min="100" step="10" :value="level.world.h" @change="setWorldSize('h', +($event.target as HTMLInputElement).value)" /></label>
        </div>
        <label class="check"><input type="checkbox" :checked="scrolls" @change="setScrolls(($event.target as HTMLInputElement).checked)" /> {{ t('umbrellaEditor.prop.scrolls') }}</label>
        <div v-if="level.view" class="pair">
          <label class="row">{{ t('umbrellaEditor.prop.screenW') }} <input v-model.number="level.view.w" class="field num" type="number" min="100" step="10" /></label>
          <label class="row">{{ t('umbrellaEditor.prop.screenH') }} <input v-model.number="level.view.h" class="field num" type="number" min="100" step="10" /></label>
        </div>
        <p class="hint">{{ t(level.view ? 'umbrellaEditor.scrollHint' : 'umbrellaEditor.wholeHint') }}</p>

        <div class="head">{{ t('umbrellaEditor.selectionTitle') }}</div>
        <p v-if="!selected" class="hint">{{ t(selection?.type === 'spawn' ? 'umbrellaEditor.spawnSelected' : 'umbrellaEditor.nothingSelected') }}</p>
        <template v-if="selection?.type === 'spawn'">
          <div class="pair">
            <label class="row">x <input v-model.number="level.spawn.x" class="field num" type="number" /></label>
            <label class="row">y <input v-model.number="level.spawn.y" class="field num" type="number" /></label>
          </div>
        </template>
        <template v-if="selected">
          <div class="kind">{{ t(`umbrellaEditor.kind.${selectedKind}`) }}</div>
          <div class="pair">
            <label v-for="k in rectKeys" :key="k" class="row">{{ k }}
              <input class="field num" type="number" :value="Math.round((selected.ent as unknown as Record<string, number>)[k]!)" @change="setRect(k, +($event.target as HTMLInputElement).value)" />
            </label>
          </div>

          <template v-if="selectedPlatform">
            <label class="check"><input type="checkbox" :checked="!!selectedPlatform.finish" @change="setFinish(($event.target as HTMLInputElement).checked)" /> {{ t('umbrellaEditor.prop.finish') }}</label>
          </template>

          <template v-if="selectedWind">
            <label class="row">{{ t('umbrellaEditor.prop.direction') }}
              <select v-model="selectedWind.dir" class="field">
                <option v-for="d in (['up', 'down', 'left', 'right'] as const)" :key="d" :value="d">{{ t(`umbrellaEditor.dir.${d}`) }}</option>
              </select>
            </label>
            <label class="row">{{ t('umbrellaEditor.prop.speed') }} <input v-model.number="selectedWind.speed" class="field num" type="number" min="0" step="10" /></label>
            <input v-model.number="selectedWind.speed" type="range" min="0" max="1500" step="10" :aria-label="t('umbrellaEditor.prop.speed')" />
            <label class="check"><input type="checkbox" :checked="!!selectedWind.super" @change="setFlag(selectedWind, 'super', ($event.target as HTMLInputElement).checked)" /> {{ t('umbrellaEditor.kind.super') }}</label>
          </template>

          <template v-if="selectedPlatform || selectedWind">
            <div class="head">{{ t('umbrellaEditor.switchTitle') }}</div>
            <label class="row">{{ t('umbrellaEditor.prop.switchedBy') }}
              <select class="field" :value="(selectedPlatform ?? selectedWind)!.channel ?? ''" @change="setChannel((selectedPlatform ?? selectedWind)!, ($event.target as HTMLSelectElement).value)">
                <option value="">{{ t('umbrellaEditor.prop.noSwitch') }}</option>
                <option v-for="c in CHANNELS" :key="c" :value="c" :style="{ color: channelColor(c) }">● {{ t('umbrellaEditor.prop.channel', { n: c }) }}</option>
              </select>
            </label>
            <template v-if="selectedPlatform && selectedPlatform.channel !== undefined">
              <label class="row">{{ t('umbrellaEditor.prop.platformShows') }}
                <select class="field" :value="selectedPlatform.whenOff ? 'off' : 'on'" @change="setFlag(selectedPlatform, 'whenOff', ($event.target as HTMLSelectElement).value === 'off')">
                  <option value="on">{{ t('umbrellaEditor.prop.whileOn') }}</option>
                  <option value="off">{{ t('umbrellaEditor.prop.whileOff') }}</option>
                </select>
              </label>
            </template>
            <template v-if="selectedWind && selectedWind.channel !== undefined">
              <p class="hint">{{ t('umbrellaEditor.switchedWindHint') }}</p>
              <label class="row">{{ t('umbrellaEditor.prop.direction') }}
                <select class="field" :value="selectedWind.switched?.dir ?? ''" @change="setSwitchedDir(selectedWind, ($event.target as HTMLSelectElement).value)">
                  <option value="">{{ t('umbrellaEditor.prop.same') }}</option>
                  <option v-for="d in (['up', 'down', 'left', 'right'] as const)" :key="d" :value="d">{{ t(`umbrellaEditor.dir.${d}`) }}</option>
                </select>
              </label>
              <label class="row">{{ t('umbrellaEditor.prop.speed') }}
                <input class="field num" type="number" min="0" step="10" :placeholder="t('umbrellaEditor.prop.same')" :value="selectedWind.switched?.speed ?? ''" @change="setSwitchedSpeed(selectedWind, ($event.target as HTMLInputElement).value)" />
              </label>
              <p class="hint">{{ t('umbrellaEditor.speedZeroHint') }}</p>
            </template>
          </template>

          <template v-if="selectedButton">
            <label class="row">{{ t('umbrellaEditor.prop.channelLabel') }}
              <select v-model.number="selectedButton.channel" class="field">
                <option v-for="c in CHANNELS" :key="c" :value="c" :style="{ color: channelColor(c) }">● {{ t('umbrellaEditor.prop.channel', { n: c }) }}</option>
              </select>
            </label>
            <label class="row">{{ t('umbrellaEditor.prop.mode') }}
              <select class="field" :value="selectedButton.duration ? 'timed' : 'toggle'" @change="setButtonMode(selectedButton, ($event.target as HTMLSelectElement).value === 'timed')">
                <option value="toggle">{{ t('umbrellaEditor.prop.toggle') }}</option>
                <option value="timed">{{ t('umbrellaEditor.prop.timed') }}</option>
              </select>
            </label>
            <label v-if="selectedButton.duration" class="row">{{ t('umbrellaEditor.prop.seconds') }}
              <input v-model.number="selectedButton.duration" class="field num" type="number" min="0.5" step="0.5" />
            </label>
            <p class="hint">{{ t(selectedButton.duration ? 'umbrellaEditor.timedHint' : 'umbrellaEditor.toggleHint', { s: selectedButton.duration ?? 0 }) }}</p>
          </template>

          <template v-if="selectedCheckpoint">
            <p class="hint">{{ t('umbrellaEditor.checkpointHint') }}</p>
          </template>

          <template v-if="selectedHazard">
            <label v-if="selectedHazard.kind === 'pillar'" class="check"><input type="checkbox" :checked="!!selectedHazard.harmless" @change="setFlag(selectedHazard, 'harmless', ($event.target as HTMLInputElement).checked)" /> {{ t('umbrellaEditor.prop.harmless') }}</label>
            <label v-if="selectedHazard.kind === 'spikes'" class="row">{{ t('umbrellaEditor.prop.points') }}
              <select v-model="selectedHazard.facing" class="field">
                <option value="up">{{ t('umbrellaEditor.dir.up') }}</option>
                <option value="down">{{ t('umbrellaEditor.dir.down') }}</option>
              </select>
            </label>
          </template>

          <template v-if="selectedMover">
            <div class="head">{{ t('umbrellaEditor.motionTitle') }}</div>
            <select class="field" :value="motionKind" :aria-label="t('umbrellaEditor.motionTitle')" @change="setMotionKind(($event.target as HTMLSelectElement).value as Motion['kind'])">
              <option v-for="k in MOTION_KINDS" :key="k" :value="k">{{ t(`umbrellaEditor.motion.${k}`) }}</option>
            </select>
            <label v-for="f in motionFields" :key="f.key" class="row col">
              <span>{{ t(`umbrellaEditor.motionField.${f.key}`) }}: {{ fieldValue(f.key, f.def) }}</span>
              <input type="range" :min="f.min" :max="f.max" :step="f.step" :value="fieldValue(f.key, f.def)" @input="setMotionField(f.key, +($event.target as HTMLInputElement).value)" />
            </label>
            <label v-if="selectedMotion?.kind === 'lunge'" class="check" :title="t('umbrellaEditor.triggerHint')">
              <input type="checkbox" :checked="!!selectedMotion.trigger" @change="setTrigger(($event.target as HTMLInputElement).checked)" /> {{ t('umbrellaEditor.prop.trigger') }}
            </label>
            <p v-if="motionKind !== 'static'" class="hint">{{ t('umbrellaEditor.pathHint') }}</p>
          </template>
          <div class="row actions">
            <button class="btn" @click="runCmd('duplicate')">⧉ {{ t('umbrellaEditor.cmd.duplicate') }} <kbd>{{ cmdKeys('duplicate') }}</kbd></button>
            <button class="btn red" @click="runCmd('delete')">🗑 {{ t('umbrellaEditor.cmd.delete') }} <kbd>{{ cmdKeys('delete') }}</kbd></button>
          </div>
        </template>
      </aside>
    </div>

    <!-- Open: the player's saved levels and the campaign (a campaign level opens as a copy). -->
    <div v-if="dialog === 'open'" class="modal-back" @pointerdown.self="dialog = null">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="t('umbrellaEditor.cmd.open')">
        <div class="row"><b>{{ t('umbrellaEditor.cmd.open') }}</b><button class="btn" :aria-label="t('umbrella.close')" @click="dialog = null">✕ <kbd>Esc</kbd></button></div>
        <div class="tabs" role="tablist">
          <button role="tab" class="tab" :class="{ on: openTab === 'mine' }" :aria-selected="openTab === 'mine'" @click="openTab = 'mine'">{{ t('umbrellaEditor.myLevels') }}</button>
          <button role="tab" class="tab" :class="{ on: openTab === 'campaign' }" :aria-selected="openTab === 'campaign'" @click="openTab = 'campaign'">{{ t('umbrellaEditor.campaignLevels') }}</button>
        </div>
        <ul v-if="openTab === 'mine'" class="pick-list">
          <li v-for="n in libraryNames" :key="n" class="pick-row">
            <span class="order-name">{{ n }}</span>
            <button class="btn blue" @click="openSaved(n)">{{ t('umbrellaEditor.openBtn') }}</button>
            <button class="btn red" :aria-label="t('umbrellaEditor.deleteBtn', { name: n })" @click="deleteSaved(n)">🗑</button>
          </li>
          <li v-if="!libraryNames.length" class="hint">{{ t('umbrellaEditor.noSaved') }}</li>
        </ul>
        <ul v-else class="pick-list">
          <li v-for="c in campaignOptions" :key="c.id" class="pick-row">
            <span class="order-name">{{ c.label }}</span>
            <button class="btn blue" @click="openCampaign(c.id)">{{ t('umbrellaEditor.openBtn') }}</button>
          </li>
        </ul>
        <p v-if="openTab === 'campaign' && !designer" class="hint">{{ t('umbrellaEditor.campaignCopyHint') }}</p>
      </div>
    </div>

    <div v-if="dialog === 'share'" class="modal-back" @pointerdown.self="dialog = null">
      <div class="modal narrow" role="dialog" aria-modal="true" :aria-label="t('umbrellaEditor.shareTitle')">
        <div class="row"><b>{{ t('umbrellaEditor.shareTitle') }}</b><button class="btn" :aria-label="t('umbrella.close')" @click="dialog = null">✕ <kbd>Esc</kbd></button></div>
        <p class="hint">{{ t('umbrellaEditor.shareHint') }}</p>
        <p v-if="problems.length" class="warn">⚠ {{ problems[0] }}</p>
        <input class="field link" readonly :value="shareUrl" :aria-label="t('umbrellaEditor.shareTitle')" @focus="($event.target as HTMLInputElement).select()" />
        <div class="row">
          <span class="status">{{ shareCopied ? t('umbrellaEditor.copied') : '' }}</span>
          <button class="btn blue" @click="copyShare">📋 {{ t('umbrellaEditor.copyLink') }}</button>
        </div>
      </div>
    </div>

    <div v-if="dialog === 'submit'" class="modal-back" @pointerdown.self="dialog = null">
      <div class="modal narrow" role="dialog" aria-modal="true" :aria-label="t('umbrellaEditor.submitTitle')">
        <div class="row"><b>{{ t('umbrellaEditor.submitTitle') }}</b><button class="btn" :aria-label="t('umbrella.close')" @click="dialog = null">✕ <kbd>Esc</kbd></button></div>
        <p class="rule">{{ t('umbrellaEditor.submitRule', { n: quota?.limit ?? 5 }) }}</p>
        <p v-if="submitLeft !== null" class="hint">{{ t('umbrellaEditor.submitLeft', { n: submitLeft }) }}</p>
        <label class="row col">{{ t('umbrellaEditor.levelName') }} <input v-model="levelName" class="field" maxlength="40" /></label>
        <label class="row col">{{ t('umbrellaEditor.authorName') }} <input v-model="author" class="field" maxlength="24" :placeholder="t('umbrellaEditor.authorPlaceholder')" /></label>
        <p v-for="p in problems" :key="p" class="warn">⚠ {{ p }}</p>
        <p v-if="submitState === 'done'" class="ok">✓ {{ t('umbrellaEditor.submitDone') }}</p>
        <p v-else-if="submitState === 'limit'" class="warn">⚠ {{ t('umbrellaEditor.submitLimit', { date: resetDate }) }}</p>
        <p v-else-if="submitState === 'error'" class="warn">⚠ {{ t('umbrellaEditor.submitError') }}</p>
        <div class="row">
          <span class="grow" />
          <button
            class="btn green"
            :disabled="submitState === 'sending' || submitState === 'done' || submitLeft === 0 || !levelName.trim() || problems.length > 0"
            @click="onSubmit"
          >🌐 {{ t(submitState === 'sending' ? 'umbrellaEditor.submitting' : 'umbrellaEditor.submitBtn') }}</button>
        </div>
      </div>
    </div>

    <div v-if="dialog === 'keys'" class="modal-back" @pointerdown.self="dialog = null">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="t('umbrellaEditor.cmd.shortcuts')">
        <div class="row"><b>{{ t('umbrellaEditor.cmd.shortcuts') }}</b><button class="btn" :aria-label="t('umbrella.close')" @click="dialog = null">✕ <kbd>Esc</kbd></button></div>
        <div class="keys-grid">
          <section v-for="m in menus" :key="m.id">
            <div class="head">{{ m.id === 'campaign' ? 'Campaign' : t(`umbrellaEditor.menu.${m.id}`) }}</div>
            <template v-for="id in m.items" :key="id">
              <div v-if="id !== '-' && cmdKeys(id)" class="key-row"><span>{{ cmdLabel(id) }}</span><kbd>{{ cmdKeys(id) }}</kbd></div>
            </template>
          </section>
          <section>
            <div class="head">{{ t('umbrellaEditor.toolsTitle') }}</div>
            <div v-for="tl in TOOLS" :key="tl.id" class="key-row"><span>{{ t(`umbrellaEditor.tool.${tl.id}`) }}</span><kbd>{{ fmtKeys(tl.keys) }}</kbd></div>
            <div class="key-row"><span>{{ t('umbrellaEditor.nudge') }}</span><kbd>← ↑ → ↓</kbd></div>
          </section>
        </div>
      </div>
    </div>

    <div v-if="orderOpen" class="modal-back" @pointerdown.self="closeOrder">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Campaign order">
        <div class="row">
          <div class="kind">Campaign order</div>
          <button class="btn" title="Close (Esc)" @click="closeOrder">✕ <kbd>Esc</kbd></button>
        </div>
        <p class="hint">Drag a level to its new position (or use ▲ ▼); ✎ names a level by its mechanic or theme. Drag a saved level from the right into the list to add it to the campaign; ✕ takes it out again.</p>
        <div class="order-cols">
          <ol class="order-list" @dragover.prevent @drop="onOrderDrop">
            <li
              v-for="(e, i) in orderDraft"
              :key="e.id"
              class="order-row"
              :class="{ custom: !!e.custom, before: dropAt === i, after: dropAt === i + 1 && i === orderDraft.length - 1, lifted: !!dragging && 'row' in dragging && dragging.row === i }"
              :draggable="renaming !== i"
              @dragstart="dragging = { row: i }"
              @dragend="dragging = null; dropAt = null"
              @dragover="onOrderDragOver($event, i)"
            >
              <span class="order-num">{{ i + 1 }}</span>
              <input
                v-if="renaming === i"
                v-model="renameDraft"
                class="field order-rename"
                maxlength="40"
                placeholder="Mechanic or theme, e.g. Wind tunnel"
                aria-label="Level name"
                @keydown.enter.prevent="commitRename"
                @keydown.escape.stop.prevent="renaming = null"
                @blur="commitRename"
                @vue:mounted="({ el }: { el: HTMLInputElement }) => el.focus()"
              />
              <span v-else class="order-name" :title="orderOrigin(e)" @dblclick="startRename(i)">
                {{ orderLabel(e) }}<small v-if="e.name" class="order-origin"> · {{ orderOrigin(e) }}</small>
              </span>
              <button v-if="renaming !== i" class="mini" title="Rename (or double-click the name)" @click="startRename(i)">✎</button>
              <button class="mini" :disabled="i === 0" title="Move up" @click="moveInOrder(i, i - 1)">▲</button>
              <button class="mini" :disabled="i === orderDraft.length - 1" title="Move down" @click="moveInOrder(i, i + 2)">▼</button>
              <button v-if="e.custom" class="mini" title="Take out of the campaign" @click="removeFromOrder(i)">✕</button>
            </li>
          </ol>
          <div class="order-pool">
            <div class="head">Saved levels</div>
            <div
              v-for="n in orderPool"
              :key="n"
              class="order-row custom"
              draggable="true"
              @dragstart="dragging = { lib: n }"
              @dragend="dragging = null; dropAt = null"
            >
              <span class="order-name">★ {{ n }}</span>
              <button class="mini" title="Add at the end of the campaign" @click="addToOrder(n)">+</button>
            </div>
            <p v-if="!orderPool.length" class="hint">No saved levels left to add — Save one first.</p>
          </div>
        </div>
        <div class="row">
          <button class="btn" title="The authored order, without added levels" @click="onOrderReset">Reset to original</button>
          <span class="grow" />
          <button class="btn" @click="closeOrder">Cancel</button>
          <button class="btn green" :disabled="!orderChanged" @click="onOrderSave">Save order</button>
        </div>
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
  --ink: #e8ecf5;
  --muted: rgba(232, 236, 245, 0.62);
  --line: rgba(255, 255, 255, 0.12);
  --panel: #141a26;
  --raised: #1c2433;
  --accent: #34d399;
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #0b0f17;
  color: var(--ink);
  font: 13px system-ui, sans-serif;
  user-select: none;
}
.topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: linear-gradient(#1a2130, #141a26);
  border-bottom: 1px solid var(--line);
  position: relative;
  z-index: 20;
}
.brand { display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 15px; letter-spacing: 0.02em; margin-right: 4px; }
.badge { font-style: normal; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 99px; background: #eab308; color: #000; }
.menus { display: flex; gap: 2px; }
.menu { position: relative; }
.menu-btn {
  padding: 5px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.menu-btn:hover, .menu-btn.open { background: rgba(255, 255, 255, 0.1); }
.menu-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 260px;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--raised);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  /* Above the toolbar's buttons and their shortcut chips (kbd opacity makes its own layer). */
  z-index: 100;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.menu-item:hover:not(:disabled) { background: #2563eb; }
.menu-item:disabled { opacity: 0.4; cursor: default; }
.menu-check { width: 12px; color: var(--accent); }
.menu-label { flex: 1; }
.menu-sep { height: 1px; margin: 4px 6px; background: var(--line); }
.quick { display: flex; flex-wrap: wrap; gap: 6px; }
.body { flex: 1; min-height: 0; display: flex; }
.panel {
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--panel);
}
.tools { width: 210px; border-right: 1px solid var(--line); }
.props { width: 250px; border-left: 1px solid var(--line); }
.tool-group { display: flex; flex-direction: column; gap: 2px; }
.stage { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.canvas { flex: 1; min-height: 0; width: 100%; display: block; touch-action: none; }
.foot {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 6px 10px;
  min-height: 30px;
  border-top: 1px solid var(--line);
  background: var(--panel);
}
.warn { color: #fbbf24; margin: 0; }
.ok { color: var(--accent); margin: 0; }
.rule { margin: 0; padding: 8px 10px; border-radius: 6px; background: rgba(37, 99, 235, 0.18); border: 1px solid rgba(96, 165, 250, 0.4); }
.status { color: var(--muted); }
.head {
  margin-top: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.kind { font-weight: 700; font-size: 14px; }
.hint { margin: 4px 0; font-size: 11px; color: var(--muted); line-height: 1.45; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.row.col { flex-direction: column; align-items: stretch; }
.row.actions { margin-top: 8px; justify-content: flex-start; flex-wrap: wrap; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; }
.pair .row { min-width: 0; }
.pair .field.num { width: 100%; min-width: 0; }
.check { display: flex; align-items: center; gap: 6px; }
.sync { font-size: 12px; color: #6ee7b7; max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sync.bad { color: #fbbf24; }
.field {
  padding: 4px 7px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.45);
  color: var(--ink);
  font: inherit;
}
.field:focus { outline: 2px solid #3b82f6; outline-offset: 0; }
.field.name { width: 170px; }
.field.num { width: 72px; }
.field.link { width: 100%; font-size: 12px; user-select: all; }
.btn {
  padding: 5px 10px;
  border: 0;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--ink);
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.btn:hover:not(:disabled) { filter: brightness(1.2); }
.btn:disabled { opacity: 0.45; cursor: default; }
.btn.green { background: #059669; font-weight: 700; }
.btn.blue { background: #2563eb; }
.btn.red { background: #b91c1c; }
.btn.indigo { background: #4f46e5; }
.btn.orange { background: #ea580c; font-weight: 700; }
.btn.yellow { background: #eab308; color: #000; font-weight: 700; }
.btn.yellow kbd { border-color: rgba(0, 0, 0, 0.35); }
.tool {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.tool:hover { background: rgba(255, 255, 255, 0.07); }
.tool.on { background: rgba(52, 211, 153, 0.16); border-color: rgba(52, 211, 153, 0.6); font-weight: 700; }
.tool-icon { width: 18px; text-align: center; }
.tool-label { flex: 1; }
kbd {
  margin-left: 4px;
  padding: 0 5px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-bottom-width: 2px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 600;
  opacity: 0.85;
  white-space: nowrap;
}
.phones {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 16px;
}
.phone {
  position: relative;
  max-height: 100%;
  border: 10px solid #222838;
  border-radius: 22px;
  background: #000;
  overflow: hidden;
}
/* Portrait sized by height, landscape by the width left over. */
.phone.portrait { height: 100%; }
.phone.landscape { flex: 1; max-width: 70%; }
.phone-canvas { display: block; width: 100%; height: 100%; touch-action: none; }
/* The game's touch controls at half size, as they sit on a phone. */
.stick,
.umbrella-btn {
  position: absolute;
  bottom: 12px;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
.stick {
  left: 12px;
  width: 75px;
  height: 36px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.08);
  cursor: ew-resize;
}
.stick-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 16px;
  opacity: 0.45;
  pointer-events: none;
}
.stick-arrow.left { left: 6px; }
.stick-arrow.right { right: 6px; }
.stick-knob {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 28px;
  height: 28px;
  margin: -14px 0 0 -14px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  pointer-events: none;
}
.umbrella-btn {
  right: 12px;
  width: 46px;
  height: 46px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.umbrella-btn.pressed { background: rgba(255, 255, 255, 0.4); }
.phone-label {
  position: absolute;
  left: 8px;
  top: 6px;
  font-size: 11px;
  opacity: 0.6;
  pointer-events: none;
}
.modal-back {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.6);
}
.modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(720px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--raised);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}
.modal.narrow { width: min(480px, 100%); }
.tabs { display: flex; gap: 4px; }
.tab { padding: 6px 12px; border: 0; border-radius: 6px; background: rgba(255, 255, 255, 0.06); color: var(--ink); font: inherit; cursor: pointer; }
.tab.on { background: #2563eb; font-weight: 700; }
.pick-list { margin: 0; padding: 0; list-style: none; max-height: 55vh; overflow-y: auto; }
.pick-row { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 6px; }
.pick-row:hover { background: rgba(255, 255, 255, 0.05); }
.keys-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 4px 18px; }
.key-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 2px 0; }
.order-cols { display: flex; gap: 10px; min-height: 0; }
.order-list, .order-pool {
  margin: 0;
  padding: 4px;
  list-style: none;
  overflow-y: auto;
  max-height: calc(100vh - 220px);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.35);
}
.order-list { flex: 3; }
.order-pool { flex: 2; }
.order-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  margin: 2px 0;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-top: 2px solid transparent;
  border-bottom: 2px solid transparent;
  cursor: grab;
}
.order-row.custom { background: rgba(79, 70, 229, 0.3); }
.order-row.before { border-top-color: #eab308; }
.order-row.after { border-bottom-color: #eab308; }
.order-row.lifted { opacity: 0.4; }
.order-num { width: 24px; text-align: right; font-weight: 700; opacity: 0.7; }
.order-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.order-origin { opacity: 0.55; }
.order-rename { flex: 1; min-width: 0; }
.mini {
  padding: 0 6px;
  border: 0;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.mini:disabled { opacity: 0.3; cursor: default; }
.grow { flex: 1; }
@media (max-width: 900px) {
  .tools { width: 170px; }
  .props { width: 210px; }
  .tool-label { font-size: 12px; }
}
</style>
