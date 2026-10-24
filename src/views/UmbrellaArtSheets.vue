<script setup lang="ts">
/**
 * ─── /#/art-sheets/umbrella — the Umbrella kite art bench (DEV ONLY) ───────
 *
 * The first half of the art round trip for roadmap #6. For every sheet in
 * src/umbrella/art/manifest.ts it bakes the REFERENCE — the game's own vector
 * painters, frame by frame, through each sheet's registration box — on a flat
 * magenta ground at the strict 256 px lattice, measures where the subject sits
 * on a TRANSPARENT copy (magenta has no alpha to measure), and exports:
 *
 *   art-sheets/umbrella/<id>.png          the layout reference sent to the model
 *   art-sheets/umbrella/<id>-key.png      panel numbers + anchor marks (never sent)
 *   art-sheets/umbrella/sheet-index.json  every rect, target and measured fit
 *   art-sheets/umbrella/PROMPTS-*.md      the prompt documents
 *
 * through the dev server's POST endpoint (`?set=umbrella`). The painted layer
 * is switched OFF while the bench is open: a reference is never the shipped
 * painting of itself. Dev tooling: its labels are not player-facing copy.
 *
 * `pnpm art:export http://localhost:<port>/#/art-sheets/umbrella` drives the
 * "Export all sheets" button headlessly and polls `.status` — keep both.
 */
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { PANEL, SHEETS, boxOf, referenceFile, targetOf, type SheetDef } from '@/umbrella/art/manifest'
import { buildIndex, promptDocs, type Fit } from '@/umbrella/art/prompts'
import { bakePanel, bakeWhole, panelTransform } from '@/umbrella/art/bake'
import { isKite } from '@/umbrella/kite'

const MAGENTA = '#ff00ff'
const SOLID = 140

const busy = ref(false)
const ready = ref(false)
const status = ref('')
const previews = reactive<Record<string, string>>({})
const fits = reactive<Record<string, Fit>>({})
const warnings = reactive<Record<string, string>>({})

/** Draw one sheet onto `ctx` (already sized), on `ground` or transparent. */
const drawSheet = (ctx: CanvasRenderingContext2D, s: SheetDef, ground: string | null): void => {
  const W = s.cols * PANEL
  const H = s.rows * PANEL
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, W, H)
  if (ground) {
    ctx.fillStyle = ground
    ctx.fillRect(0, 0, W, H)
  }
  if (s.use === 'nine' || s.use === 'pillar') {
    bakeWhole(ctx, s)
    return
  }
  for (let i = 0; i < s.cols * s.rows; i++) {
    const c = i % s.cols
    const r = Math.floor(i / s.cols)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.beginPath()
    ctx.rect(c * PANEL, r * PANEL, PANEL, PANEL)
    ctx.clip()
    panelTransform(ctx, s, i, boxOf(s, i))
    bakePanel(ctx, s, i)
    ctx.restore()
  }
}

/** The union over panels of where the SOLID pixels are, as panel fractions. */
const measure = (s: SheetDef): { fit: Fit | null; touches: number[] } => {
  const cv = document.createElement('canvas')
  cv.width = s.cols * PANEL
  cv.height = s.rows * PANEL
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  drawSheet(ctx, s, null)
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0
  const touches: number[] = []
  for (let i = 0; i < s.cols * s.rows; i++) {
    const ox = (i % s.cols) * PANEL
    const oy = Math.floor(i / s.cols) * PANEL
    let any = false
    let edge = false
    for (let y = 0; y < PANEL; y++) {
      for (let x = 0; x < PANEL; x++) {
        if (d[((oy + y) * cv.width + ox + x) * 4 + 3]! <= SOLID) continue
        any = true
        if (x === 0 || y === 0 || x === PANEL - 1 || y === PANEL - 1) edge = true
        const fx = x / PANEL
        const fy = y / PANEL
        if (fx < x0) x0 = fx
        if (fy < y0) y0 = fy
        if ((x + 1) / PANEL > x1) x1 = (x + 1) / PANEL
        if ((y + 1) / PANEL > y1) y1 = (y + 1) / PANEL
      }
    }
    if (edge && any) touches.push(i + 1)
  }
  if (x1 <= x0) return { fit: null, touches }
  const r3 = (v: number) => Math.round(v * 1000) / 1000
  return { fit: { w: r3(x1 - x0), h: r3(y1 - y0), cx: r3((x0 + x1) / 2), cy: r3((y0 + y1) / 2), bottom: r3(y1) }, touches }
}

const keySheet = (s: SheetDef): HTMLCanvasElement => {
  const cv = document.createElement('canvas')
  cv.width = s.cols * PANEL
  cv.height = s.rows * PANEL
  const ctx = cv.getContext('2d')!
  drawSheet(ctx, s, '#1b2130')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  for (let i = 0; i < s.cols * s.rows; i++) {
    const c = i % s.cols
    const r = Math.floor(i / s.cols)
    const b = boxOf(s, i)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.strokeRect(c * PANEL + 0.5, r * PANEL + 0.5, PANEL - 1, PANEL - 1)
    ctx.fillStyle = '#ffd34d'
    ctx.font = '700 22px system-ui, sans-serif'
    ctx.fillText(String(i + 1), c * PANEL + 8, r * PANEL + 26)
    if (s.use === 'sprite' || s.use === 'model') {
      // The anchor the game holds this frame at.
      ctx.strokeStyle = '#4ade80'
      ctx.beginPath()
      ctx.arc(c * PANEL + b.ax * PANEL, r * PANEL + b.ay * PANEL, 5, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  return cv
}

const reference = (s: SheetDef): HTMLCanvasElement => {
  const cv = document.createElement('canvas')
  cv.width = s.cols * PANEL
  cv.height = s.rows * PANEL
  drawSheet(cv.getContext('2d')!, s, MAGENTA)
  return cv
}

const renderAll = (): void => {
  for (const s of SHEETS) {
    previews[s.id] = reference(s).toDataURL('image/png')
    const m = measure(s)
    if (m.fit && s.fit !== 'none') fits[s.id] = m.fit
    if (m.touches.length && s.use !== 'nine' && s.use !== 'pillar' && s.id !== 'fan') warnings[s.id] = `touches its panel edge in ${m.touches.join(', ')}`
  }
}

const toBlob = (cv: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
  cv.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas would not encode PNG'))), 'image/png')
})
const HEADERS = { 'x-maw-art': '1' }
const postFile = async (name: string, cv: HTMLCanvasElement): Promise<void> => {
  const res = await fetch(`/__maw/art-export/file?set=umbrella&name=${encodeURIComponent(name)}`, {
    method: 'POST', headers: { ...HEADERS, 'content-type': 'image/png' }, body: await toBlob(cv)
  })
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`)
}

const exportAll = async (): Promise<void> => {
  if (busy.value) return
  busy.value = true
  let n = 0
  try {
    status.value = 'Rendering references…'
    renderAll()
    for (const s of SHEETS) {
      status.value = `Writing ${referenceFile(s)} (${n / 2 + 1}/${SHEETS.length})…`
      await postFile(referenceFile(s), reference(s))
      await postFile(`${s.id}-key.png`, keySheet(s))
      n += 2
    }
    const res = await fetch('/__maw/art-export/meta?set=umbrella', {
      method: 'POST', headers: { ...HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ index: buildIndex({ ...fits }), docs: promptDocs({ ...fits }) })
    })
    if (!res.ok) throw new Error(`meta: ${res.status} ${await res.text()}`)
    const meta = (await res.json()) as { written: string[] }
    status.value = `wrote ${n + meta.written.length} files into art-sheets/umbrella/`
  } catch (e) {
    status.value = `FAILED: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}

const fmt = (f?: Fit): string => (f ? `h ${Math.round(f.h * 100)}% · w ${Math.round(f.w * 100)}% · bottom ${Math.round(f.bottom * 100)}% · cx ${Math.round(f.cx * 100)}%` : '—')

let restore: (() => void) | null = null
onMounted(async () => {
  if (isKite) {
    const paint = await import('@/umbrella/art/paint')
    const was = paint.paintedArt()
    paint.setPaintedArt(false)
    restore = () => paint.setPaintedArt(was)
  }
  renderAll()
  ready.value = true
})
onUnmounted(() => restore?.())
</script>

<template lang="pug">
  div.art-sheets(:data-ready="ready ? '1' : '0'")
    div.bar
      h1 Art sheets — Umbrella kite
      span.sub {{ SHEETS.length }} sheets · {{ PANEL }} px panels on magenta · fits at α &gt; {{ SOLID }}
      button(:disabled="busy" @click="exportAll") Export all sheets
      span.status {{ status }}
    p.hint
      | Writes into <code>art-sheets/umbrella/</code>. Then <code>pnpm art:prompts -- --set umbrella</code>,
      | paint (model sheets first), drop returns into <code>art-sheets/umbrella/painted/</code>,
      | <code>pnpm art:slice -- --set umbrella</code>, and compare at <a href="#/umbrella-playground">/#/umbrella-playground</a>
      | (on <code>pnpm dev:kite</code>). Or run the loop from <code>pnpm art:desk:umbrella</code>.
    div.cards
      div.card(v-for="s in SHEETS" :key="s.id")
        div.thumb
          img(v-if="previews[s.id]" :src="previews[s.id]" :alt="s.id")
        div.meta
          div.title {{ s.title }}
          div.line <code>{{ referenceFile(s) }}</code> → <code>{{ targetOf(s) }}</code>
          div.line {{ s.cols }}×{{ s.rows }} · {{ s.use }} · tier {{ s.tier }}{{ s.model ? ` · model ${s.model}` : '' }}
          div.line(v-if="s.fit !== 'none'") fit {{ fmt(fits[s.id]) }}
          div.warn(v-if="warnings[s.id]") {{ warnings[s.id] }}
</template>

<style scoped lang="sass">
.art-sheets
  position: fixed
  inset: 0
  z-index: 100
  overflow-y: auto
  padding: 12px 16px 48px
  background: #14161d
  color: #dfe3ee
  font: 13px/1.4 system-ui, sans-serif
.bar
  position: sticky
  top: -12px
  z-index: 2
  display: flex
  flex-wrap: wrap
  align-items: center
  gap: 10px
  padding: 10px 0
  background: #14161d
  h1
    margin: 0
    font-size: 20px
    font-weight: 800
  .sub
    opacity: 0.6
  button
    padding: 6px 12px
    border-radius: 6px
    border: 1px solid #6a74ff
    background: #2a2f6a
    color: #fff
    font-weight: 700
    cursor: pointer
    &:disabled
      opacity: 0.5
  .status
    font-family: ui-monospace, monospace
    color: #9fe6a6
.hint
  opacity: 0.75
  a
    color: #9cc3ff
.cards
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))
  gap: 12px
.card
  background: #1c1f2a
  border-radius: 8px
  overflow: hidden
.thumb img
  display: block
  width: 100%
  height: auto
  image-rendering: auto
.meta
  padding: 8px
  .title
    font-weight: 700
  .line
    opacity: 0.75
    word-break: break-all
  .warn
    color: #ffb4a0
</style>
