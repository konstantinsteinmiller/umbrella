<script setup lang="ts">
// The cutscene mode of the level editor (designer tools: English only, like the tuning panel).
// Plays the real cutscene on the real set, scrubs it, and edits the script as data:
// segments per actor (times, poses, speeds), the sound cues, the fades — and drag an
// actor's anchor on the canvas to place it. Save keeps it here and on the server.
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { LEVELS } from '@/umbrella/levels'
import { DEFAULT_TUNING, type Tuning } from '@/umbrella/tuning'
import { getState } from '@/use/useEpicState'
import { introCutscene } from '@/umbrella/intro'
import {
  createCutscene, type ActorDef, type Cutscene, type CutsceneDef, type CutsceneSfx, type Seg
} from '@/umbrella/cutscene'
import { editedCutscene, revertCutscene, saveCutscene } from '@/umbrella/cutsceneStore'
import type { Camera } from '@/umbrella/renderer'

const props = defineProps<{ id: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const tuning: Tuning = { ...DEFAULT_TUNING, ...getState<Partial<Tuning>>('umb_tuning_r3', {}) }
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const builtIn = (): CutsceneDef => introCutscene(LEVELS[0]!, tuning)
const load = (): CutsceneDef => clone(editedCutscene(props.id) ?? builtIn())

const def = ref<CutsceneDef>(load())
const levelOf = () => LEVELS.find((l) => l.id === def.value.level) ?? LEVELS[0]!
const sel = ref<{ actor: number; seg: number } | null>(null)
const time = ref(0)
const playing = ref(false)
const status = ref('')
const flash = (m: string) => { status.value = m; window.setTimeout(() => { if (status.value === m) status.value = '' }, 3000) }

const SFX: CutsceneSfx[] = ['whoosh', 'land', 'open', 'step', 'cool']
const POSES = ['stand', 'walk', 'hold', 'flail', 'terminal', 'cheer'] as const
const ACTIONS = ['idle', 'flip', 'land', 'float', 'walk'] as const

const selSeg = computed<Seg | null>(() => (sel.value ? def.value.actors[sel.value.actor]?.segs[sel.value.seg] ?? null : null))
const num = (e: Event) => +(e.target as HTMLInputElement).value
const ends = (s: Seg) => s.to ?? def.value.duration

// ── Preview: the real cutscene, rebuilt on every edit and seeked to the scrubber ──
const canvas = ref<HTMLCanvasElement | null>(null)
let cs: Cutscene | null = null
let cam: Camera = { s: 1, ox: 0, oy: 0 }
const rebuild = () => { cs = createCutscene(def.value, levelOf(), tuning, () => {}) }
rebuild()
watch(def, rebuild, { deep: true })

let raf = 0
let last = 0
const frame = (now: number) => {
  raf = requestAnimationFrame(frame)
  const dt = Math.min(0.1, (now - (last || now)) / 1000)
  last = now
  const el = canvas.value
  if (!el || !cs) return
  if (playing.value) {
    time.value += dt
    if (time.value >= def.value.duration) { time.value = def.value.duration; playing.value = false }
  }
  const r = el.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const cw = Math.round(r.width * dpr)
  const ch = Math.round(r.height * dpr)
  if (el.width !== cw || el.height !== ch) { el.width = cw; el.height = ch }
  const ctx = el.getContext('2d')
  if (!ctx || cw <= 0 || ch <= 0) return
  cs.seek(time.value)
  cam = cs.draw(ctx, { finish: t('umbrella.finish') }, dt)
  drawAnchor(ctx)
}

// ── Placement: drag the selected segment's anchor on the canvas ──
interface Anchor { get: () => { x: number; y: number }; set: (x: number, y: number) => void }
const anchorOf = (s: Seg | null): Anchor | null => {
  if (!s) return null
  switch (s.kind) {
    case 'hold': return { get: () => s.at, set: (x, y) => { s.at = { x, y } } }
    case 'walk': return { get: () => s.a, set: (x, y) => { s.a = { x, y } } }
    case 'flip': return { get: () => s.b, set: (x, y) => { s.b = { x, y } } }
    case 'climb': return { get: () => ({ x: s.edgeX, y: s.top }), set: (x, y) => { s.edgeX = x; s.top = y } }
    default: return null
  }
}
const drawAnchor = (ctx: CanvasRenderingContext2D) => {
  const a = anchorOf(selSeg.value)
  if (!a) return
  const p = a.get()
  ctx.setTransform(cam.s, 0, 0, cam.s, cam.ox, cam.oy)
  ctx.strokeStyle = '#facc15'
  ctx.lineWidth = 2 / cam.s
  ctx.beginPath()
  ctx.arc(p.x, p.y, 9 / cam.s, 0, Math.PI * 2)
  ctx.moveTo(p.x - 14 / cam.s, p.y)
  ctx.lineTo(p.x + 14 / cam.s, p.y)
  ctx.moveTo(p.x, p.y - 14 / cam.s)
  ctx.lineTo(p.x, p.y + 14 / cam.s)
  ctx.stroke()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
const toWorld = (e: PointerEvent) => {
  const r = canvas.value!.getBoundingClientRect()
  const k = canvas.value!.width / r.width
  return { x: Math.round(((e.clientX - r.left) * k - cam.ox) / cam.s), y: Math.round(((e.clientY - r.top) * k - cam.oy) / cam.s) }
}
let dragging = false
const onDown = (e: PointerEvent) => {
  if (!anchorOf(selSeg.value)) return
  dragging = true
  canvas.value?.setPointerCapture(e.pointerId)
  const w = toWorld(e)
  anchorOf(selSeg.value)!.set(w.x, w.y)
}
const onMove = (e: PointerEvent) => {
  if (!dragging) return
  const w = toWorld(e)
  anchorOf(selSeg.value)?.set(w.x, w.y)
}
const onUp = () => { dragging = false }

// ── Editing ──
const pick = (actor: number, seg: number) => {
  sel.value = { actor, seg }
  const s = def.value.actors[actor]!.segs[seg]!
  time.value = Math.min(def.value.duration, s.from + 0.01)
  playing.value = false
}
const addSeg = (actor: ActorDef) => {
  const lastSeg = actor.segs[actor.segs.length - 1]
  const from = lastSeg ? ends(lastSeg) : 0
  const at = anchorOf(lastSeg ?? null)?.get() ?? { x: levelOf().spawn.x, y: levelOf().spawn.y }
  if (lastSeg && lastSeg.to === undefined) lastSeg.to = Math.min(def.value.duration, from + 1)
  actor.segs.push({ kind: 'hold', from: lastSeg?.to ?? from, at: { ...at }, ...(actor.id === 'chad' ? { action: 'idle' as const } : { pose: 'stand' as const }) })
  pick(def.value.actors.indexOf(actor), actor.segs.length - 1)
}
const removeSeg = () => {
  const s = sel.value
  if (!s) return
  def.value.actors[s.actor]!.segs.splice(s.seg, 1)
  sel.value = null
}
const addCue = () => { def.value.cues.push({ at: Math.round(time.value * 100) / 100, sfx: 'step' }); def.value.cues.sort((a, b) => a.at - b.at) }
const removeCue = (i: number) => { def.value.cues.splice(i, 1) }
const toggleEnd = () => {
  const s = selSeg.value
  if (!s || s.kind === 'flip' || s.kind === 'climb') return
  if (s.to === undefined) s.to = Math.min(def.value.duration, s.from + 1)
  else delete s.to
}

// ── Timeline bar ──
const pct = (v: number) => `${Math.max(0, Math.min(100, (v / def.value.duration) * 100))}%`
const onScrub = (e: MouseEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  time.value = Math.max(0, Math.min(def.value.duration, ((e.clientX - r.left) / r.width) * def.value.duration))
  playing.value = false
}
const togglePlay = () => {
  if (!playing.value && time.value >= def.value.duration - 0.01) time.value = 0
  playing.value = !playing.value
}

// ── Save / revert ──
const dirty = computed(() => JSON.stringify(def.value) !== JSON.stringify(editedCutscene(props.id) ?? builtIn()))
const onSave = async () => {
  const ok = await saveCutscene(clone(def.value))
  flash(ok ? 'Saved here and on the server' : 'Saved in this browser — server not reached (password? connection?)')
}
const onRevert = async () => {
  if (!window.confirm('Back to the built-in script? Your edit is removed here and on the server.')) return
  await revertCutscene(props.id)
  def.value = clone(builtIn())
  sel.value = null
  flash('Back to the built-in script')
}
const onKey = (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
  if (e.code === 'Space') { e.preventDefault(); togglePlay() }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void onSave() }
  else if (e.key === 'Escape') emit('close')
}
onMounted(() => { raf = requestAnimationFrame(frame); window.addEventListener('keydown', onKey) })
onUnmounted(() => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey) })

const view = reactive({ cues: true })
</script>

<template>
  <div class="cs-editor">
    <aside class="panel cs-left">
      <div class="head">Cutscene · {{ def.id }}</div>
      <section v-for="(a, ai) in def.actors" :key="a.id" class="tool-group">
        <div class="head">{{ a.id === 'chad' ? 'Chad' : 'Pweeg' }}</div>
        <button
          v-for="(s, si) in a.segs"
          :key="si"
          class="tool"
          :class="{ on: sel?.actor === ai && sel?.seg === si }"
          @click="pick(ai, si)"
        >
          <span class="tool-label">{{ s.kind }}</span>
          <kbd>{{ s.from.toFixed(2) }}–{{ s.to === undefined ? 'end' : s.to.toFixed(2) }}</kbd>
        </button>
        <button class="tool" @click="addSeg(a)"><span class="tool-label">+ Add segment</span></button>
      </section>
      <p class="hint">Space plays · click the bar to scrub · drag the yellow marker on the canvas to place the selected segment.</p>
    </aside>

    <main class="cs-stage">
      <canvas ref="canvas" class="cs-canvas" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" />
      <div class="cs-bar">
        <button class="btn" @click="togglePlay">{{ playing ? '⏸' : '▶' }} <kbd>Space</kbd></button>
        <div class="cs-track" @click="onScrub">
          <div v-for="(a, ai) in def.actors" :key="a.id" class="cs-lane">
            <span
              v-for="(s, si) in a.segs"
              :key="si"
              class="cs-seg"
              :class="{ on: sel?.actor === ai && sel?.seg === si, chad: a.id === 'chad' }"
              :style="{ left: pct(s.from), width: `calc(${pct(ends(s))} - ${pct(s.from)})` }"
              @click.stop="pick(ai, si)"
            />
          </div>
          <span v-for="(c, i) in def.cues" :key="`c${i}`" class="cs-cue" :style="{ left: pct(c.at) }" />
          <span class="cs-head" :style="{ left: pct(time) }" />
        </div>
        <span class="cs-time">{{ time.toFixed(2) }} / {{ def.duration.toFixed(2) }} s</span>
      </div>
      <div class="foot">
        <span v-if="status" class="status">{{ status }}</span>
        <span v-if="dirty && !status" class="warn">unsaved changes</span>
      </div>
    </main>

    <aside class="panel cs-right">
      <div class="head">Segment</div>
      <template v-if="selSeg">
        <label class="row"><span>Kind</span><b>{{ selSeg.kind }}</b></label>
        <label class="row"><span>From (s)</span><input class="field num" type="number" step="0.05" :value="selSeg.from" @input="selSeg.from = num($event)" /></label>
        <label v-if="selSeg.kind === 'flip' || selSeg.kind === 'climb'" class="row"><span>To (s)</span><input class="field num" type="number" step="0.05" :value="selSeg.to" @input="selSeg.to = num($event)" /></label>
        <label v-else class="row">
          <span>Until the end</span><input type="checkbox" :checked="selSeg.to === undefined" @change="toggleEnd" />
        </label>
        <label v-if="selSeg.kind !== 'flip' && selSeg.kind !== 'climb' && selSeg.to !== undefined" class="row"><span>To (s)</span><input class="field num" type="number" step="0.05" :value="selSeg.to" @input="selSeg.to = num($event)" /></label>

        <template v-if="selSeg.kind === 'hold'">
          <label class="row"><span>X</span><input class="field num" type="number" :value="selSeg.at.x" @input="selSeg.at.x = num($event)" /></label>
          <label class="row"><span>Y</span><input class="field num" type="number" :value="selSeg.at.y" @input="selSeg.at.y = num($event)" /></label>
          <label v-if="sel && def.actors[sel.actor]!.id === 'chad'" class="row"><span>Action</span>
            <select class="field" :value="selSeg.action ?? 'idle'" @change="selSeg.action = ($event.target as HTMLSelectElement).value as typeof ACTIONS[number]"><option v-for="a in ACTIONS" :key="a">{{ a }}</option></select>
          </label>
          <label v-else class="row"><span>Pose</span>
            <select class="field" :value="selSeg.pose ?? 'stand'" @change="selSeg.pose = ($event.target as HTMLSelectElement).value as typeof POSES[number]"><option v-for="p in POSES" :key="p">{{ p }}</option></select>
          </label>
          <label class="row"><span>Look at camera after (s)</span><input class="field num" type="number" step="0.05" :value="selSeg.frontAfter ?? ''" @input="selSeg.frontAfter = ($event.target as HTMLInputElement).value === '' ? undefined : num($event)" /></label>
        </template>
        <template v-else-if="selSeg.kind === 'walk'">
          <label class="row"><span>Start X</span><input class="field num" type="number" :value="selSeg.a.x" @input="selSeg.a.x = num($event)" /></label>
          <label class="row"><span>Ground Y</span><input class="field num" type="number" :value="selSeg.a.y" @input="selSeg.a.y = num($event)" /></label>
          <label class="row"><span>Speed (px/s)</span><input class="field num" type="number" step="5" :value="selSeg.speed" @input="selSeg.speed = num($event)" /></label>
        </template>
        <template v-else-if="selSeg.kind === 'flip'">
          <label class="row"><span>From X</span><input class="field num" type="number" :value="selSeg.a.x" @input="selSeg.a.x = num($event)" /></label>
          <label class="row"><span>From Y</span><input class="field num" type="number" :value="selSeg.a.y" @input="selSeg.a.y = num($event)" /></label>
          <label class="row"><span>Land X</span><input class="field num" type="number" :value="selSeg.b.x" @input="selSeg.b.x = num($event)" /></label>
          <label class="row"><span>Land Y</span><input class="field num" type="number" :value="selSeg.b.y" @input="selSeg.b.y = num($event)" /></label>
          <label class="row"><span>Apex Y</span><input class="field num" type="number" :value="selSeg.apex" @input="selSeg.apex = num($event)" /></label>
        </template>
        <template v-else-if="selSeg.kind === 'climb'">
          <label class="row"><span>Edge X</span><input class="field num" type="number" :value="selSeg.edgeX" @input="selSeg.edgeX = num($event)" /></label>
          <label class="row"><span>Top Y</span><input class="field num" type="number" :value="selSeg.top" @input="selSeg.top = num($event)" /></label>
          <label class="row"><span>Ground Y</span><input class="field num" type="number" :value="selSeg.ground" @input="selSeg.ground = num($event)" /></label>
        </template>
        <p v-else class="hint">Chad's float is simulated with the real engine and baked in ({{ (selSeg as any).frames.length }} samples): move its start/end times, or revert to rebuild it.</p>
        <button class="btn red" @click="removeSeg">Delete segment</button>
      </template>
      <p v-else class="hint">Pick a segment on the left or in the bar.</p>

      <div class="head">Scene</div>
      <label class="row"><span>Duration (s)</span><input class="field num" type="number" step="0.1" :value="def.duration" @input="def.duration = num($event)" /></label>
      <label class="row"><span>Fade in (s)</span><input class="field num" type="number" step="0.1" :value="def.fadeIn" @input="def.fadeIn = num($event)" /></label>
      <label class="row"><span>Wait for the player at (s)</span><input class="field num" type="number" step="0.1" :value="def.waitAt ?? ''" placeholder="off" @input="def.waitAt = ($event.target as HTMLInputElement).value === '' ? undefined : num($event)" /></label>
      <label class="row"><span>Fade to game (s)</span><input class="field num" type="number" step="0.1" :value="def.fadeOut" @input="def.fadeOut = num($event)" /></label>

      <div class="head">Sound cues <button class="mini" @click="view.cues = !view.cues">{{ view.cues ? '–' : '+' }}</button></div>
      <template v-if="view.cues">
        <div v-for="(c, i) in def.cues" :key="i" class="row">
          <input class="field num" type="number" step="0.05" :value="c.at" @change="c.at = num($event)" />
          <select class="field" :value="c.sfx" @change="c.sfx = ($event.target as HTMLSelectElement).value as CutsceneSfx"><option v-for="s in SFX" :key="s">{{ s }}</option></select>
          <button class="mini" @click="removeCue(i)">✕</button>
        </div>
        <button class="btn" @click="addCue">+ Cue at the playhead</button>
      </template>

      <div class="row cs-actions">
        <button class="btn green" :disabled="!dirty" @click="onSave">💾 Save <kbd>Ctrl S</kbd></button>
        <button class="btn" @click="onRevert">Revert to built-in</button>
        <button class="btn" @click="emit('close')">✕ Close <kbd>Esc</kbd></button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.cs-editor { display: contents; }
.cs-left, .cs-right { overflow-y: auto; }
.cs-stage { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 8px; }
.cs-canvas { flex: 1; min-height: 0; width: 100%; background: #0b0f17; border-radius: 8px; touch-action: none; cursor: crosshair; }
.cs-bar { display: flex; align-items: center; gap: 10px; }
.cs-track { position: relative; flex: 1; height: 42px; background: var(--raised); border-radius: 6px; cursor: pointer; }
.cs-lane { position: relative; height: 16px; margin: 3px 0 0; }
.cs-seg { position: absolute; top: 0; bottom: 0; background: #60a5fa; border-radius: 3px; opacity: 0.7; border: 1px solid rgba(0, 0, 0, 0.4); }
.cs-seg.chad { background: #f59e0b; }
.cs-seg.on { opacity: 1; outline: 2px solid #facc15; }
.cs-cue { position: absolute; bottom: 0; width: 2px; height: 8px; background: #34d399; }
.cs-head { position: absolute; top: 0; bottom: 0; width: 2px; background: #fff; pointer-events: none; }
.cs-time { font-variant-numeric: tabular-nums; min-width: 110px; text-align: right; color: var(--muted); }
.num { width: 84px; }
.cs-actions { flex-wrap: wrap; margin-top: 10px; }
</style>
