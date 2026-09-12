<script setup lang="ts">
/**
 * ─── /#/art-sheets — the art bench (DEV ONLY) ───────────────────────────────
 *
 * The first half of the art-generation-pipeline round trip. For every drawable
 * in `src/game/artSheet.ts` it lays the REFERENCE on a flat magenta ground at a
 * strict lattice, measures where the subject sits on a TRANSPARENT canvas (the
 * magenta one has no alpha to measure), and exports, in one pass:
 *
 *   art-sheets/<id>.png          the reference sent to the image model
 *   art-sheets/<id>-key.png      panel numbers for the 3×3 sheets (never sent)
 *   art-sheets/sheet-index.json  every rect, target and measured fit — the slicer's input
 *   art-sheets/PROMPTS-*.md      the prompt documents, with the measured SIZE clauses
 *
 * through the dev server's own POST endpoint (vite.config.ts, `maw-art-bench`),
 * because a browser download lands in Downloads under a name Chrome chose.
 *
 * The reference is the bitmap that SHIPS (this game is painted already — a
 * repaint is a restyle registered against it). A drawable whose bitmap is
 * missing falls back to its procedural painter: the IngredientUnit / EnemyUnit
 * / SkillIcon SVG, serialised off the hidden stage below.
 *
 * `pnpm art:export` drives the "Export all sheets" button headlessly and polls
 * the `.status` line — keep both selectors.
 */
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import {
  ART_DRAWABLES, buildIndex, promptDocs, referenceFile, referenceSize, targetOf,
  type ArtDrawable, type Fit
} from '@/game/artSheet'
import { prependBaseUrl } from '@/utils/function'
import { publicAssetExists } from '@/use/usePublicManifest'
import { probeArtOverrides } from '@/use/useArtOverrides'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'
import EnemyUnit from '@/components/organisms/EnemyUnit.vue'
import SkillIcon, { type SkillIconId } from '@/components/atoms/SkillIcon.vue'
import type { EnemyKind } from '@/game/units'

const MAGENTA = '#ff00ff'
/** Solid, not merely visible: a soft glow is light, not extent. The slicer
 *  and measure-art.py measure at the same floor, or the three disagree. */
const SOLID = 140

const busy = ref(false)
const status = ref('')
const previews = reactive<Record<string, string>>({})
const fits = reactive<Record<string, Fit>>({})
const sourceKind = reactive<Record<string, 'bitmap' | 'drawing' | 'none'>>({})

const groups = computed(() => {
  const out: { group: string; items: ArtDrawable[] }[] = []
  for (const d of ART_DRAWABLES) {
    let g = out.find((x) => x.group === d.group)
    if (!g) { g = { group: d.group, items: [] }; out.push(g) }
    g.items.push(d)
  }
  return out
})

// ─── Sources ────────────────────────────────────────────────────────────────

/** The shipped bitmap's public path, if the build-time manifest has it. */
const shippedPath = (d: ArtDrawable): string | null => {
  const base = targetOf(d).replace(/\.webp$/, '')
  if (publicAssetExists(`${base}.webp`)) return `${base}.webp`
  if (publicAssetExists(`${base}.png`)) return `${base}.png`
  return null
}

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => (img.naturalWidth > 0 ? resolve(img) : reject(new Error(`${src} decoded empty`)))
  img.onerror = () => reject(new Error(`${src} failed to load`))
  img.src = src
})

/** The arena skills whose only picture is SkillIcon's procedural drawing. */
const SKILL_ICONS: Partial<Record<string, SkillIconId>> = {
  'spell-warcry': 'warcry', 'spell-legion': 'legion', 'spell-execute': 'execute', 'spell-pact': 'pact'
}

/** Which drawables have a procedural painter this bench can serialise. */
const drawingOf = (d: ArtDrawable): { tier?: number; kind?: EnemyKind; bossWave?: number; skill?: SkillIconId } | null => {
  const key = d.keys[0]!
  const skill = SKILL_ICONS[key]
  if (skill) return { skill }
  const tier = /^fighter-(\d+)$/.exec(key)
  if (tier) return { tier: Number(tier[1]) }
  const enemy = /^enemy-(slime|runner|brute|spitter|warlock)$/.exec(key)
  if (enemy) return { kind: enemy[1] as EnemyKind }
  const boss = ['boss-slime-tower', 'boss-orc', 'boss-fire-dragon', 'boss-troll', 'boss-worm', 'boss-silver-dragon'].indexOf(key)
  if (boss >= 0) return { kind: 'boss', bossWave: (boss + 1) * 5 }
  return null
}

const tierOf = (d: ArtDrawable): number => drawingOf(d)?.tier ?? 0
const kindOf = (d: ArtDrawable): EnemyKind => drawingOf(d)?.kind ?? 'slime'
const waveOf = (d: ArtDrawable): number => drawingOf(d)?.bossWave ?? 0
const skillOf = (d: ArtDrawable): SkillIconId | undefined => drawingOf(d)?.skill

/** Drawables with no shipped bitmap that CAN be drawn — mounted on the hidden
 *  stage, where their component has no bitmap either and so renders its SVG. */
const needsDrawing = computed(() => ART_DRAWABLES.filter((d) => !shippedPath(d) && drawingOf(d)))
const stageEl = ref<HTMLElement | null>(null)

/** The procedural painter's SVG as an image, off the hidden stage. */
const drawingImage = async (d: ArtDrawable): Promise<HTMLImageElement | null> => {
  await nextTick()
  const svg = stageEl.value?.querySelector<SVGSVGElement>(`[data-id="${d.id}"] svg`)
  if (!svg) return null
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', '512')
  clone.setAttribute('height', '512')
  // A data: URL, not a blob: one — the page's CSP (platforms/csp.ts) allows
  // `img-src data:` but not `blob:`, so a blob drawing never loads.
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(clone.outerHTML)}`)
}

const sourceFor = async (d: ArtDrawable): Promise<HTMLImageElement | null> => {
  const shipped = shippedPath(d)
  if (shipped) {
    sourceKind[d.id] = 'bitmap'
    return loadImage(prependBaseUrl(shipped))
  }
  const drawn = drawingOf(d) ? await drawingImage(d) : null
  sourceKind[d.id] = drawn ? 'drawing' : 'none'
  return drawn
}

// ─── The lattice ────────────────────────────────────────────────────────────

/** Contain-fit the source into the reference canvas, centred — a 254 px
 *  fighter on a 256 px panel, or a drawing's square on a wide panel. */
const drawSource = (g: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number): void => {
  const k = Math.min(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * k
  const dh = img.naturalHeight * k
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

/**
 * The shipped 3×3 VFX sheets carry a baked 1–2 px opaque GREY rim around the
 * whole sheet (an artifact of how they were first cut; the internal seams are
 * clean). On a reference that rim is a grey frame drawn round the lattice —
 * exactly what the prompt forbids the painter to draw, it reads to the slicer
 * as a non-magenta ground, and it inflates the measured fit to the full panel.
 * So a multi-panel reference drops the outer band before compositing. Every
 * panel is meant to keep a magenta margin anyway, and a reference is a guide,
 * not shipped art.
 */
const SHEET_RIM_PX = 2

const canvasFor = (d: ArtDrawable, img: HTMLImageElement, ground: string | null): HTMLCanvasElement => {
  const { w, h } = referenceSize(d)
  const art = document.createElement('canvas')
  art.width = w
  art.height = h
  const ag = art.getContext('2d')!
  drawSource(ag, img, w, h)
  if (d.cols * d.rows > 1) {
    const band = SHEET_RIM_PX * d.refScale
    ag.clearRect(0, 0, w, band)
    ag.clearRect(0, h - band, w, band)
    ag.clearRect(0, 0, band, h)
    ag.clearRect(w - band, 0, band, h)
  }
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  if (ground) { g.fillStyle = ground; g.fillRect(0, 0, w, h) }
  g.drawImage(art, 0, 0)
  return cv
}

/** The reference: magenta ground (none for a full-bleed backdrop). */
const renderReference = (d: ArtDrawable, img: HTMLImageElement): HTMLCanvasElement =>
  canvasFor(d, img, d.bg === 'opaque' ? null : MAGENTA)

const round3 = (v: number): number => Math.round(v * 1000) / 1000

/**
 * Where the subject sits in one panel, as fractions of that panel, on SOLID
 * pixels — the union across every panel for a multi-panel sheet (one scale and
 * offset for the whole sheet, never per frame: per-frame fitting is jitter).
 */
const measureFit = (d: ArtDrawable, img: HTMLImageElement): Fit | null => {
  const cv = canvasFor(d, img, null)
  const px = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data
  const pw = cv.width / d.cols
  const ph = cv.height / d.rows
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0, any = false
  for (let r = 0; r < d.rows; r++) {
    for (let c = 0; c < d.cols; c++) {
      let bx0 = pw, by0 = ph, bx1 = -1, by1 = -1
      for (let y = 0; y < ph; y++) {
        const row = (Math.floor(r * ph) + y) * cv.width
        for (let x = 0; x < pw; x++) {
          if (px[(row + Math.floor(c * pw) + x) * 4 + 3]! > SOLID) {
            if (x < bx0) bx0 = x
            if (x > bx1) bx1 = x
            if (y < by0) by0 = y
            if (y > by1) by1 = y
          }
        }
      }
      if (bx1 < 0) continue // an empty panel (an impact's last frame) is fine
      any = true
      x0 = Math.min(x0, bx0 / pw)
      y0 = Math.min(y0, by0 / ph)
      x1 = Math.max(x1, (bx1 + 1) / pw)
      y1 = Math.max(y1, (by1 + 1) / ph)
    }
  }
  if (!any) return null
  return { w: round3(x1 - x0), h: round3(y1 - y0), cx: round3((x0 + x1) / 2), cy: round3((y0 + y1) / 2), bottom: round3(y1) }
}

/** Captions live HERE, never on the reference: text inside a cell is text an
 *  image model faithfully repaints as art. */
const renderKey = (d: ArtDrawable, img: HTMLImageElement): HTMLCanvasElement => {
  const cv = canvasFor(d, img, '#1b1b22')
  const g = cv.getContext('2d')!
  g.fillStyle = 'rgba(27,27,34,0.55)'
  g.fillRect(0, 0, cv.width, cv.height)
  const pw = cv.width / d.cols
  const ph = cv.height / d.rows
  g.strokeStyle = 'rgba(255,255,255,0.35)'
  g.lineWidth = 2
  g.font = `900 ${Math.round(ph * 0.28)}px system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (let i = 0; i < d.cols * d.rows; i++) {
    const x = (i % d.cols) * pw
    const y = Math.floor(i / d.cols) * ph
    g.strokeRect(x + 1, y + 1, pw - 2, ph - 2)
    g.fillStyle = '#fff'
    g.fillText(String(i + 1), x + pw / 2, y + ph / 2)
  }
  return cv
}

const toBlob = (cv: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
  cv.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas would not encode PNG'))), 'image/png')
})

const preview = (cv: HTMLCanvasElement): string => {
  const k = Math.min(1, 160 / Math.max(cv.width, cv.height))
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.round(cv.width * k))
  small.height = Math.max(1, Math.round(cv.height * k))
  const g = small.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(cv, 0, 0, small.width, small.height)
  return small.toDataURL('image/png')
}

// ─── The dev endpoint ───────────────────────────────────────────────────────

const HEADERS = { 'x-maw-art': '1' }

const postFile = async (name: string, cv: HTMLCanvasElement): Promise<void> => {
  const res = await fetch(`/__maw/art-export/file?name=${encodeURIComponent(name)}`, {
    method: 'POST', headers: { ...HEADERS, 'content-type': 'image/png' }, body: await toBlob(cv)
  })
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`)
}

const postMeta = async (payload: unknown): Promise<void> => {
  const res = await fetch('/__maw/art-export/meta', {
    method: 'POST', headers: { ...HEADERS, 'content-type': 'application/json' }, body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`meta: HTTP ${res.status} ${await res.text()}`)
}

// ─── Render + export ────────────────────────────────────────────────────────

const renderAll = async (): Promise<Map<string, HTMLImageElement>> => {
  const sources = new Map<string, HTMLImageElement>()
  for (const d of ART_DRAWABLES) {
    try {
      const img = await sourceFor(d)
      if (!img) continue
      sources.set(d.id, img)
      previews[d.id] = preview(renderReference(d, img))
      if (d.bg === 'magenta') {
        const fit = measureFit(d, img)
        if (fit) fits[d.id] = fit
      }
    } catch (e) {
      sourceKind[d.id] = 'none'
      console.warn('[art-sheets]', d.id, e)
    }
  }
  return sources
}

const exportAll = async (): Promise<void> => {
  if (busy.value) return
  busy.value = true
  status.value = 'Rendering references…'
  try {
    const sources = await renderAll()
    let wrote = 0
    let i = 0
    for (const d of ART_DRAWABLES) {
      i++
      const img = sources.get(d.id)
      if (!img) continue
      status.value = `Exporting ${i}/${ART_DRAWABLES.length} — ${d.id}`
      await postFile(referenceFile(d), renderReference(d, img))
      wrote++
      if (d.cols * d.rows > 1) {
        await postFile(`${d.id}-key.png`, renderKey(d, img))
        wrote++
      }
    }
    const measured: Record<string, Fit> = { ...fits }
    const docs = promptDocs(measured)
    await postMeta({ index: { ...buildIndex(measured), exportedAt: new Date().toISOString() }, docs })
    const missing = ART_DRAWABLES.length - sources.size
    status.value = `wrote ${wrote} images, sheet-index.json and ${Object.keys(docs).length} prompt documents`
      + (missing ? ` — ${missing} drawable(s) had no reference` : '')
  } catch (e) {
    status.value = `FAILED: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}

const fmt = (f?: Fit): string => f
  ? `w ${Math.round(f.w * 100)}% · h ${Math.round(f.h * 100)}% · c ${Math.round(f.cx * 100)},${Math.round(f.cy * 100)}`
  : '—'

onMounted(() => {
  probeArtOverrides()
  void renderAll()
})
</script>

<template lang="pug">
  div.art-sheets
    div.bar
      h1 Art sheets
      span.sub {{ ART_DRAWABLES.length }} drawables · references on magenta · fits measured at α &gt; {{ SOLID }}
      button(:disabled="busy" @click="exportAll") Export all sheets
      span.status {{ status }}
    p.hint
      | Writes into <code>art-sheets/</code>. Then <code>pnpm art:prompts</code> for PAINT-STATUS.md,
      | paint, drop the return into <code>art-sheets/painted/</code>, <code>pnpm art:slice</code>,
      | and look at <a href="#/playground">/#/playground</a>. Or run the whole loop from <code>pnpm art:desk</code>.
    section(v-for="g in groups" :key="g.group")
      h2 {{ g.group }} ({{ g.items.length }})
      div.cards
        div.card(v-for="d in g.items" :key="d.id")
          div.thumb(:class="{ opaque: d.bg === 'opaque' }")
            img(v-if="previews[d.id]" :src="previews[d.id]" :alt="d.id")
            span.none(v-else-if="sourceKind[d.id] === 'none'") no reference
          div.meta
            div.title {{ d.title }}
            div.line <code>{{ referenceFile(d) }}</code> → <code>{{ targetOf(d) }}</code>
            div.line {{ d.cols }}×{{ d.rows }} · panel {{ d.panel.w }}×{{ d.panel.h }} · ref ×{{ d.refScale }} · {{ sourceKind[d.id] ?? '…' }}
            div.line(v-if="d.bg === 'magenta'") fit {{ fmt(fits[d.id]) }}
            div.line(v-else) full-bleed backdrop (no key)
    //- The procedural painters, for any drawable that has no bitmap. Their
    //- components find no bitmap either, so they render their SVG fallback.
    div.stage(ref="stageEl" aria-hidden="true")
      div(v-for="d in needsDrawing" :key="d.id" :data-id="d.id")
        IngredientUnit(v-if="tierOf(d) > 0" :tier="tierOf(d)" :still="true" :bare="true")
        SkillIcon(v-else-if="skillOf(d)" :skill="skillOf(d) ?? 'warcry'")
        EnemyUnit(v-else :kind="kindOf(d)" :boss-wave="waveOf(d)")
</template>

<style scoped lang="sass">
// A game shell is a fixed-height, overflow-hidden screen — the bench scrolls
// inside itself or the last rows are unreachable.
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
      cursor: default
  .status
    font-family: ui-monospace, monospace
    color: #9fe6a6
.hint
  opacity: 0.75
  a
    color: #9cc3ff
h2
  margin: 18px 0 8px
  font-size: 15px
  text-transform: uppercase
  letter-spacing: 0.08em
  opacity: 0.8
.cards
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr))
  gap: 10px
.card
  display: flex
  gap: 10px
  padding: 8px
  border-radius: 8px
  background: #1d2029
.thumb
  flex: 0 0 160px
  height: 160px
  display: flex
  align-items: center
  justify-content: center
  background: #0d0e12
  img
    max-width: 100%
    max-height: 100%
  .none
    opacity: 0.5
.meta
  min-width: 0
  .title
    font-weight: 700
    margin-bottom: 4px
  .line
    font-size: 12px
    opacity: 0.8
    word-break: break-all
code
  font-family: ui-monospace, monospace
  font-size: 11px
.stage
  position: fixed
  left: -10000px
  top: 0
  width: 512px
  height: 512px
  pointer-events: none
  > div
    width: 512px
    height: 512px
</style>
