// ─── The kite art prompts (art-generation-pipeline, PROMPT-ANATOMY.md) ──────
//
// One generator, one style block, one background rule: per-sheet words come
// only from the manifest (manifest.ts). The order of the blocks is the order
// PROMPT-ANATOMY.md measured to work — what comes back first and last, the
// exclusions before the subject, the consistency clause before the style.
//
// PURE (no DOM / Vue / import.meta.env): the /umbrella-art bench and
// `pnpm art:prompts -- --set umbrella` render byte-identical documents, and
// the Art Desk sends what it parses back out of them.
import { PANEL, SHEETS, SHIPPED_DIR, referenceFile, sheetById, targetOf, type PromptDoc, type SheetDef } from './manifest'

/** Where the subject sits in ONE panel (union over the sheet's panels), as
 *  fractions of a panel, measured on SOLID pixels (α > 140). */
export interface Fit { w: number; h: number; cx: number; cy: number; bottom: number }

const OUT = { w: 1024, h: 1024, ratio: '1:1' }
const pct = (v: number): string => `${Math.round(v * 100)}%`
const panels = (s: SheetDef): number => s.cols * s.rows

/** The images attached ahead of the layout reference, in order: the designer's style sheet first,
 *  then the approved concept design, then the painted model sheet, the layout last. */
export const alsoOf = (s: SheetDef): string[] => [...(s.styleRef ? [s.styleRef] : []), ...(s.designRef ? [s.designRef] : []), ...(s.model ? [s.modelCard ? `cards/${s.model}-card.png` : `painted/${s.model}.png`] : [])]

const KITE_GROUPS = new Set(['kite', 'chad-kite'])
const FIGURE_GROUPS = new Set(['pweeg', 'chad', 'kite', 'chad-kite'])
const NAMES: Record<string, string> = { pweeg: 'Pweeg', chad: 'Chad', kite: 'Pweeg-Kite', 'chad-kite': 'Chad-Kite' }

// ─── Shared clauses (hoisted: one copy to weaken, PROMPT-ANATOMY §8) ────────

/** An art direction: the STYLE block, and how the first attached image (the
 *  style reference) is introduced. The kite art's is KITE_LOOK; the lantern
 *  build's is in lantern.ts. */
export interface Look {
  head: string
  body: string[]
  /** The line introducing the attached style reference of sheet `s`. */
  styleSheet: (s: SheetDef) => string
}

const STYLE_HEAD = 'STYLE — one art direction for the whole game, the DESIGNER\'S OWN: HAND-DRAWN ON CREAM PAPER, SOFT CRAYON AND COLOURED-PENCIL, CEL-SHADED, CUTE AND COZY — exactly the finish of the attached style sheet.'
const STYLE_BODY = [
  '· Soft crayon / pencil outlines in a warm dark brown (#3b2a20), never pure black and never a clean vector line: slightly wobbly and grainy like a real crayon, at their heaviest about 2% of the panel\'s shorter side. Hold the finished picture at thumbnail size: if the outline has thinned to a hairline there, it is several times too thin.',
  '· Colour laid in like crayon and coloured pencil: flat-ish fills with visible soft pencil grain inside them, ONE crisp-edged cel shadow tone on the side away from a soft upper-left light, and ONE small highlight. No airbrush gradients, no rendered 3D look, no glossy plastic.',
  '· The designer\'s warm storybook palette: mustard and golden yellow, brick red, dusty blue, moss and grass green, warm browns, soft pink and purple — slightly muted, never neon.',
  '· Soft, rounded, chunky, friendly shapes with a readable silhouette at 48 px on a phone.',
  '· It is shown on a DARK NAVY night background (#1b2130): keep every shape light or saturated enough to read against it.',
  '· AN OBJECT WITH NO FACE IS NOT AN EXCEPTION TO ANY OF THIS. A block, a flag, a fan or a wisp of wind is painted to exactly the same standard as a character, with the same ink, the same cel shadow and the same highlight.',
  'AVOID — this is exactly how repaints go wrong:',
  '· photographic texture, painterly brush noise, 3D-render gloss, soft airbrushed gradients, lens flare',
  '· thin, grey, broken or missing outlines; flat clip-art with no shadow',
  '· fine detail that turns to mush when the sprite is shown small',
  '· text, letters, numbers, logos, signatures or watermarks anywhere — the style sheet\'s handwritten labels, arrows and titles are NOT part of any sprite'
]
const REF_REPAINT = '· The LAST attached image is the LAYOUT REFERENCE: the game\'s own flat drawing of every panel. FOLLOW ITS SHAPE, ITS POSE, ITS SIZE IN THE PANEL and ITS POSITION in the panel exactly, and take nothing else from it — not its line weight, its colours, its shading or its style. It is a flat stand-in for the painting.'
const REF_FRESH = '· The LAST attached image is the LAYOUT REFERENCE: a flat placeholder that fixes WHERE things go and HOW BIG they are. Its flat bands, plain circles and hard single-colour shapes are NOTATION — never a look to copy. A sheet that comes back as the same flat shapes, neatly repainted, is a trace of the placeholder and unusable: every shape becomes a painted, inked, cel-shaded object.'

const BACKGROUND = [
  'BACKGROUND — read this before anything else. It matters more than the style.',
  'Fill every pixel that is not the drawing itself with solid, flat, pure magenta #FF00FF. Treat it as a green-screen: one flat chroma-key colour, edge to edge.',
  '· EXACTLY #FF00FF — red 255, green 0, blue 255. Not pink, not rose, not mauve, not a soft or tinted version of it.',
  '· NOT transparent (that comes back as a painted grey-and-white checkerboard). NOT white, cream, paper or any textured ground.',
  '· Nothing sits on a card, panel, badge, frame or rectangle of any kind; the magenta touches the outline on every side.',
  '· No drop shadow onto the background, no glow, no vignette. NOTHING IS EVER SEE-THROUGH: every piece is painted at full, solid colour.',
  '· The drawing itself contains no magenta or hot pink.',
  '· The soft, cosy palette above is for the DRAWING. The ground is not part of the painting and is not toned down with it: it stays a vivid #FF00FF.',
  '· The CREAM PAPER of the style sheet is NOT the ground here: no paper colour, no paper texture behind the drawing — only flat magenta.'
]
const GRID_RULE = '· Do NOT draw the panel edges: no boxes, borders, gutters, guides or numbers, in any colour, magenta included. The panels are found by measuring.'

// ─── The prompt ─────────────────────────────────────────────────────────────

const countWords = (n: number): string => {
  const wrong = [1, n === 16 ? 9 : 16, n === 4 ? 9 : n === 9 ? 4 : 12].filter((x) => x !== n)
  return `Not ${wrong.join(', not ')}.`
}

const shapeLine = (s: SheetDef): string[] => {
  if (s.use === 'nine') {
    return [
      'WHAT COMES BACK IS ONE BLOCK FILLING THE WHOLE IMAGE, NOT A SCENE.',
      `One square image, ${OUT.w} x ${OUT.h} pixels, filled edge to edge by ONE single rounded block, its outline touching all four sides of the image except where its corners round off (magenta shows only in those four rounded-off corners).`,
      '· Not a row of blocks, not a block floating in the middle of empty space, not a landscape.'
    ]
  }
  if (s.use === 'pillar') {
    return [
      'WHAT COMES BACK IS THREE PILLARS SIDE BY SIDE, NOT A SCENE.',
      `One square image, ${OUT.w} x ${OUT.h} pixels, holding exactly THREE tall pillars, each exactly one third of the image wide and the full height of the image, their sides touching the thirds of the image.`,
      '· 3 pillars. Not 1, not 2, not 4. Each one a single unbroken shape from the top of the image to the bottom.'
    ]
  }
  const n = panels(s)
  return [
    'WHAT COMES BACK IS A SPRITE SHEET, NOT ONE PICTURE.',
    `One square image, ${OUT.w} x ${OUT.h} pixels, holding ${n} SEPARATE small drawings laid out ${s.cols} across and ${s.rows} down, on the same grid as the LAST attached image, read left to right along each row, top row first.`,
    `· ${n} panels. ${countWords(n)} Exactly ${s.rows} rows of ${s.cols} — do not add or drop a row.`,
    '· ONE big drawing filling the canvas is the wrong answer however well it is painted.'
  ]
}

const KITE_LOOK: Look = {
  head: STYLE_HEAD,
  body: STYLE_BODY,
  styleSheet: (s) => {
    const kite = !!s.styleRef?.includes('kite')
    return `· The FIRST attached image is the designer's STYLE SHEET (hand-drawn on cream paper). Copy its FINISH exactly: the soft crayon outlines, the coloured-pencil fills, the cel shading, the cosy palette.${kite && KITE_GROUPS.has(s.group) ? ' It is also the DESIGN of the kite characters: follow it for the diamond body, face, panels, arms, legs and bow-tail.' : FIGURE_GROUPS.has(s.group) ? ' Its characters are KITES — take only its drawing style from it: this character is NOT a kite.' : ' Take only its finish and, where it draws this very thing, its design.'} Take NO layout, no labels, no handwriting, no arrows and no paper from it.`
  }
}

const notLine = (s: SheetDef, look: Look): string[] => {
  const out = [
    'DRAW ONLY WHAT EACH PANEL OF THE REFERENCE SHOWS — read this before the subject.',
    '· No ground, no floor line, no shadow on the ground, no scenery, no sky, no extra props.'
  ]
  if (s.group === 'pweeg' || s.group === 'chad') out.push('· NO umbrella anywhere: the game paints the umbrella as its own layer and adds it on top. Hands that hold it hold empty air.')
  if (KITE_GROUPS.has(s.group)) out.push('· NO umbrella anywhere: the KITE is his umbrella — closed on the ground, deployed in the air. No string, no person flying him, no sky.')
  const also = alsoOf(s)
  let n = 0
  if (s.styleRef) {
    n++
    out.push(look.styleSheet(s))
  }
  const ORD = ['FIRST', 'SECOND', 'THIRD']
  if (s.designRef) {
    n++
    out.push(`· The ${ORD[n - 1]} attached image is the APPROVED CONCEPT DESIGN of ${s.one ?? 'this thing'}, cut from the concept art: paint THIS design — its shape, its parts and its colours (unless the colour line below says otherwise) — in the finished style. Take nothing else from that picture (no background, no neighbours), and take NO layout from it: where each part goes comes from the LAST attached image.`)
  }
  if (s.model) {
    n++
    const model = sheetById(s.model)
    out.push(s.modelCard
      ? `· The ${ORD[n - 1]} attached image is ONE finished figure of ${NAMES[model?.group ?? 'pweeg'] ?? model?.one ?? 'him'}, cut from his approved painting. Copy his body, face, limbs, spikes, colours, line and shading from it EXACTLY, in every panel. It is a single figure, not a layout: the grid, the poses and the positions all come from the LAST attached image.`
      : `· The ${ORD[n - 1]} attached image is the finished MODEL SHEET of ${NAMES[model?.group ?? 'pweeg']} — his approved design. Copy his body, face, limbs, colours, line and shading from it EXACTLY. Take NO layout from it: the grid, the poses and the positions all come from the LAST attached image.`)
  }
  if (also.length) out.push(`· ${also.length + 1} images are attached; the LAST one is the layout reference.`)
  return out
}

const sizeLine = (s: SheetDef, fit?: Fit): string[] => {
  if (s.use === 'nine' || s.use === 'pillar') return []
  if (!fit || s.fit === 'none') {
    return [
      'SIZE AND PLACE — measure against the PANEL, not against the paper.',
      '· Every drawing is the size the reference draws it in its panel, and sits where the reference puts it. WHERE it sits is not a composition choice: it is the point the game holds it at. Do not re-centre it on its own outline, do not enlarge it to fill the panel.',
      GRID_RULE
    ]
  }
  const feet = s.fit === 'feet'
  return [
    'SIZE AND PLACE — measure against the PANEL, not against the paper.',
    `· In the reference the drawing spans about ${pct(fit.h)} of a panel's height at its tallest and ${pct(fit.w)} of its width at its widest, across all ${panels(s)} panels.`,
    feet
      ? `· Its lowest point sits ${pct(fit.bottom)} of the way down every panel — the same line in every panel: that line is the ground the game stands it on.`
      : `· Its middle sits ${pct(fit.cy)} of the way down and ${pct(fit.cx)} of the way across each panel: that point is where the game holds it.`,
    `· If yours spans three quarters of a panel it is too big, and it will not line up with the game's hitbox. Bigger is not clearer here.`,
    GRID_RULE
  ]
}

const oneLine = (s: SheetDef): string[] => {
  if (!s.one || panels(s) === 1) return []
  if (s.use === 'nine') return []
  const n = s.use === 'pillar' ? 'All three pillars' : `All ${panels(s)} panels`
  return [
    `ONE ${s.one.toUpperCase()}: ${n} show the same ${s.one} — identical proportions, identical head and eye size, identical limb thickness, identical colours, identical ink line and identical cel shading in every panel. Only the moment changes.`,
    `· Do not re-scale it between panels and do not re-scale it from the reference. A ${s.one} whose head is bigger in one panel, or white in one and cream in another, is several different ${/Pweeg|Chad/.test(s.one) ? 'characters' : 'things'} side by side, and the sheet is unusable.`
  ]
}

const checkLine = (s: SheetDef): string[] => {
  const lines = ['BEFORE YOU CALL IT FINISHED, count and check:']
  if (s.check) lines.push(...s.check)
  else if (s.use === 'nine') lines.push('· ONE block, filling the whole square image; magenta only in the four rounded-off corners.', '· The middle third of each edge and the centre are plain and even.')
  else if (s.use === 'pillar') lines.push('· THREE pillars, each one third of the width and the full height; no face on any of them.', '· The middle third of each pillar is a plain straight section.')
  else lines.push(`· ${s.cols} panels across, ${s.rows} down, ${panels(s)} in all, on a square canvas.`, '· Every drawing is the size and in the place the reference panel has it.')
  if (FIGURE_GROUPS.has(s.group)) lines.push('· Not one umbrella anywhere. The same character, same size, same colours, in every panel.')
  lines.push('· Every pixel that is not the drawing itself is flat, vivid #FF00FF — hold it against a pure magenta swatch, not against your memory of one.')
  return lines
}

/** One sheet's prompt: `# heading` then the body (block() fences it). */
export const promptFor = (s: SheetDef, fit?: Fit, look: Look = KITE_LOOK): string => {
  const body: string[] = []
  const para = (lines: string[]): void => { if (lines.length) body.push(lines.join('\n')) }
  para(s.shape ?? shapeLine(s))
  para(notLine(s, look))
  para([`WHAT IT IS: ${s.blurb}.`, ...(s.note ? [s.note] : [])])
  if (s.readPanels) para([`READ THE PANELS: ${s.readPanels}`])
  para([`COLOUR IDENTITY (keep the HUE — it is how a player tells this one from the others): ${s.colour}.`])
  para([`THE VIEW: ${s.view}`, '· No dramatic perspective, no tilt, no ground plane.'])
  para(oneLine(s))
  para([look.head, s.fresh ? REF_FRESH : REF_REPAINT, ...look.body])
  para(sizeLine(s, fit))
  para(BACKGROUND)
  para(checkLine(s))
  para([`OUTPUT: one image, ${OUT.w} x ${OUT.h} pixels (${OUT.ratio}, square). If your tool has an aspect-ratio control, set it to ${OUT.ratio} — a return of any other shape crushes the grid and cannot be cut. PNG if you can choose. No labels, captions, numbers or watermarks.`])
  const attach = [...alsoOf(s), referenceFile(s)].join(' + ')
  return `# ${s.title}  (${attach} → ${targetOf(s)})\n\n${body.join('\n\n')}`
}

// ─── The documents ──────────────────────────────────────────────────────────

const fenceFor = (body: string): string => {
  let longest = 0
  for (const run of body.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return '`'.repeat(Math.max(3, longest + 1))
}

/** The heading OUTSIDE the fence (the operator's line), the body inside. */
export const block = (text: string): string => {
  const cut = text.indexOf('\n')
  const heading = (cut < 0 ? text : text.slice(0, cut)).replace(/^#+\s*/, '')
  const body = (cut < 0 ? '' : text.slice(cut + 1)).replace(/^\n+/, '')
  const fence = fenceFor(body)
  return [`## ${heading}`, '', `${fence}text`, body, fence].join('\n')
}

/** The body a block holds — what the Art Desk parses back. */
export const promptBody = (text: string): string => {
  const cut = text.indexOf('\n')
  return (cut < 0 ? '' : text.slice(cut + 1)).replace(/^\n+/, '')
}

type KiteDoc = Exclude<PromptDoc, 'PROMPTS-LANTERN.md'>

const DOC_TITLES: Record<KiteDoc, string> = {
  'PROMPTS-KITE.md': 'the KITE characters (Pweeg-Kite and Chad-Kite) — the kite build\'s player; paint these first',
  'PROMPTS-CHARACTERS.md': 'Pweeg, Chad and the umbrella (the non-kite look, kept as a fallback)',
  'PROMPTS-ENEMIES.md': 'Walldorf and Prickbait',
  'PROMPTS-WORLD.md': 'platforms, props, the ventilator and the wind'
}

/** Paint in this order: a model sheet before every sheet that attaches it. */
export const paintOrder = (sheets: SheetDef[] = SHEETS): SheetDef[] => {
  const out: SheetDef[] = []
  const add = (s: SheetDef): void => {
    if (out.includes(s)) return
    // A sheet repainted from a card of its own earlier painting is its own model: nothing to wait for.
    const m = s.model && s.model !== s.id ? sheets.find((x) => x.id === s.model) : undefined
    if (m) add(m)
    out.push(s)
  }
  for (const s of sheets) add(s)
  return out
}

export const promptDocs = (fits: Record<string, Fit> = {}): Record<KiteDoc, string> => {
  const out = {} as Record<KiteDoc, string>
  const order = paintOrder()
  for (const doc of Object.keys(DOC_TITLES) as KiteDoc[]) {
    const items = order.filter((s) => s.doc === doc)
    out[doc] = [
      `# Prompts — Umbrella kite art: ${DOC_TITLES[doc]}`,
      '',
      'Generated from `src/umbrella/art/manifest.ts` + `prompts.ts` by `pnpm art:prompts -- --set umbrella` (or the `/#/umbrella-art` bench export). Do not edit by hand — edit the manifest and regenerate.',
      '',
      'For each block: attach the images named in the heading\'s parenthesis IN THAT ORDER (from `art-sheets/umbrella/`: the designer\'s `style/…` sheet first, then a `painted/…` model sheet, the layout reference LAST), then paste the text inside the fence — the heading is for you, not the model. Paint the MODEL SHEETS first (pweeg-kite-model, then chad-kite-model): every animation sheet of a character attaches his painted model. Save the return into `art-sheets/umbrella/painted/` under the reference\'s name (any extension), then `pnpm art:slice:umbrella`.',
      '',
      ...items.flatMap((s) => [block(promptFor(s, fits[s.id])), ''])
    ].join('\n')
  }
  return out
}

// ─── The slicer's index ─────────────────────────────────────────────────────

export const buildIndex = (fits: Record<string, Fit> = {}, sheets: SheetDef[] = SHEETS, outDir: string = SHIPPED_DIR) => ({
  generator: 'src/umbrella/art/manifest.ts',
  outDir,
  sheets: [],
  walks: sheets.map((s) => ({
    id: s.id,
    kind: s.group,
    title: s.title,
    file: referenceFile(s),
    aliases: [],
    target: targetOf(s),
    width: s.cols * PANEL,
    height: s.rows * PANEL,
    panel: { w: PANEL, h: PANEL },
    cols: s.cols,
    rows: s.rows,
    frames: s.cols * s.rows,
    layout: 'grid',
    // Tiles, sets and blocks are cut as painted; a block filling its panels
    // would read as "no grid" to the measuring pass.
    gridCheck: s.fit === 'none' || s.gridCheck === 'nominal' ? 'nominal' : 'measure',
    anchor: s.fit === 'feet' ? 'feet' : 'centre',
    // A block or pillar fills whole panels: its centre holds no magenta, and
    // the slicer's flood fallback must not take its stone for a background.
    ...(s.use === 'nine' || s.use === 'pillar' ? { autoBg: false } : {}),
    tight: false,
    maxEdge: PANEL,
    exact: false,
    fit: s.fit === 'none' ? null : (fits[s.id] ?? null)
  }))
})
