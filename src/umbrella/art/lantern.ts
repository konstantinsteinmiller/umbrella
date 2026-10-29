// ─── The lantern art set: "Paper Moon" (?art=lantern, /umbrella/lantern/) ───
//
// The art direction picked from the moodboards (/umbrella/art-moodboards/):
// a lantern-festival night built from folded and cut washi paper. It is the
// SAME game as the normal one — the campaign, the server's levels, the save —
// with painted sheets in place of the vector drawing.
//
// Every sheet here keeps the kite manifest's id, lattice, registration box and
// animations (manifest.ts): it is painted over the SAME reference, so paint.ts
// draws it unchanged. Only the words differ — the subject, the colours and the
// style block — and the shipped folder (LANTERN_DIR), which only the lantern
// build's glob (art/shipped-lantern.ts) reaches.
//
// The first batch is what level 1 shows: Pweeg, his parasol, the ledges, the
// finish pad, the wind and the backdrop. Enemies, props and the checkpoint
// keep their vector drawing until they are added here.
//
// PURE: no DOM, no Vue, no `import.meta.env` (read by `pnpm art:prompts:lantern`).
import { CHAD_COLOUR, CHAD_IS, EXTRA_SHEETS, PWEEG_COLOUR, PWEEG_IS, sheetById, type SheetDef } from './manifest'
import { block, buildIndex, paintOrder, promptFor, type Fit, type Look } from './prompts'

/** Where the lantern sheets ship (kept out of public/ and out of the kite glob). */
export const LANTERN_DIR = 'src/assets/umbrella-art-lantern'
/** References, style sheets, the slicer's index and painted/ returns. */
export const LANTERN_SHEETS_DIR = 'art-sheets/umbrella-lantern'
/** The concept boards' hero sheet and world kit, padded square (the style references). */
export const STYLE_HERO = 'style/lantern-hero.png'
export const STYLE_WORLD = 'style/lantern-world.png'

// The hero is the concept board's boxy origami figure, NOT Pweeg's round vector
// shape: the layout reference only fixes each pose, its size and the foot line
// (so every lantern Pweeg sheet is `fresh` — the reference is notation).
const KAMI_IS = 'Pweeg, who in this art style is a little BOXY ORIGAMI figure folded from cream washi paper, exactly the paper character of the attached concept art: a big rounded-CUBE head folded like a small paper box (about as big as the rest of him), with two small black ink-dot eyes and a tiny ink mouth; under it a small boxy folded-paper body like a little pleated paper tunic with crisp crease lines; short chunky folded-paper arms and legs with blunt square ends'
const KAMI_COLOUR = 'Pweeg is folded from warm CREAM-BEIGE washi paper (#efdcae) with visible soft fibre, a tan shadow facet (#c9a874) on one side of every fold and a warm golden lit facet toward the light; the eyes and mouth are small black ink marks. He must read as a light, warm shape on a deep indigo night sky'

/** The game cycles a sheet's panels at 6–50 fps: a face that changes from panel
 *  to panel flickers. */
const ONE_FACE = 'ONE FACE: his little ink face is IDENTICAL in every panel of this sheet — the expression this sheet describes (two calm ink-dot eyes if it names none). It never cycles through moods; only a blink, where READ THE PANELS asks for one, changes it.'
const SMALL = 'SMALL IN HIS PANEL: he is only about HALF a panel tall, exactly as small as the figure in the reference panel, with a wide empty magenta band above his head and below his feet. No part of him ever comes near the next panel: the panels are found by the empty magenta between them.'

/** A figure sheet (Pweeg or Chad) in the paper style. `face`: the sheet keeps one expression. */
const figure = (id: string, is: [string, string], colour: [string, string], extra: Partial<SheetDef> = {}, face = true): SheetDef => {
  const s = sheetById(id)!
  return {
    ...s,
    doc: 'PROMPTS-LANTERN.md',
    styleRef: STYLE_HERO,
    fresh: true,
    ...(s.use === 'model' ? {} : { note: face ? `${ONE_FACE}\n${SMALL}` : SMALL }),
    blurb: s.blurb.replace(is[0], is[1]),
    colour: s.colour === colour[0] ? colour[1] : s.colour.replace(colour[0], colour[1]),
    ...extra
  }
}
const pweeg = (id: string, extra: Partial<SheetDef> = {}, face = true): SheetDef => figure(id, [PWEEG_IS, KAMI_IS], [PWEEG_COLOUR, KAMI_COLOUR], extra, face)

const PAPER_CHAD_IS = 'Chad, Pweeg\'s cool friend: EXACTLY the same little boxy origami paper figure as Pweeg (the same cube head, pleated body and chunky limbs — copy him from the attached model sheet) wearing a pair of black folded-paper rounded-rectangle sunglasses with one small white glint'
const PAPER_CHAD_COLOUR = 'Chad is folded from the same warm CREAM-BEIGE washi paper as Pweeg (#efdcae, tan fold shadows #c9a874); his sunglasses are glossy black paper with a single white glint'
const chad = (id: string, extra: Partial<SheetDef> = {}): SheetDef => figure(id, [CHAD_IS, PAPER_CHAD_IS], [CHAD_COLOUR, PAPER_CHAD_COLOUR], extra)

const STYLE_FOES = 'style/lantern-foes.png'
const foe = (id: string, extra: Partial<SheetDef>): SheetDef => ({ ...sheetById(id)!, doc: 'PROMPTS-LANTERN.md', styleRef: STYLE_FOES, fresh: true, ...extra })

const world = (id: string, extra: Partial<SheetDef>): SheetDef => ({ ...sheetById(id)!, doc: 'PROMPTS-LANTERN.md', styleRef: STYLE_WORLD, ...extra })

export const LANTERN_SHEETS: SheetDef[] = [
  pweeg('pweeg-model', {
    title: 'Pweeg (paper) — character model sheet',
    blurb: `${KAMI_IS}. This is his MODEL SHEET: the one picture every later animation of him is painted from. He is the concept art's paper figure, copied faithfully — the same cube head, pleated body, chunky limbs, paper colour and ink face — only posed like the layout reference`
  }),
  pweeg('pweeg-idle'),
  pweeg('pweeg-walk', { modelCard: true }),
  pweeg('pweeg-hover', {
    blurb: `${KAMI_IS}, floating calmly with a small content smile: both arms raised straight up above his head and BOTH HANDS TOGETHER, gripping one single handle at one point (the parasol itself is painted separately — paint NO parasol; the two hands meet in the air, touching, never apart), his legs dangling loose`
  }),
  pweeg('pweeg-fall', {
    readPanels: 'A fast flail loop of ONE pose: in all 16 panels he is UPRIGHT, head at the top in exactly the same place, body straight below it — never rotated, tilted, upside-down, tumbling or lying down (the game tips him itself). Both arms flung up and out, legs bent out, a startled face; from panel to panel ONLY the arms and feet wiggle a little out and back. Panel 16 leads straight back into panel 1.'
  }),
  // The kite wording says "goggle eyes" for his panic, which a painter reads as glasses: say what it means.
  pweeg('pweeg-terminal', {
    blurb: `${KAMI_IS}, at terminal velocity: no arms showing, his two legs stretched long and straight below him, pure panic in his face — his two ink-dot eyes opened WIDE into big round staring eyes (white with a small dark pupil, drawn ON his paper face). He wears NOTHING on his face: no glasses, no goggles, no spectacles, no rims. Paint him the way up the reference shows; the game turns him upside down`
  }),
  // Raised arms reach the row above, so the grid cannot be measured; the panels sit on the lattice.
  pweeg('pweeg-cheer', { gridCheck: 'nominal' }),
  pweeg('pweeg-flattened', { blurb: `${KAMI_IS}, squashed flat by a hard landing like a crumpled, flattened sheet of origami paper` }, false),
  pweeg('pweeg-destroyed', {
    blurb: `${KAMI_IS}, the moment an enemy gets him: a cartoon "poof" — he is NEVER hurt or cut, he pops into a soft puff of crumpled cream paper balls and a little burst of folded paper confetti`
  }, false),
  pweeg('pweeg-front'),
  chad('chad-model', {
    blurb: `${PAPER_CHAD_IS}. This is his MODEL SHEET, painted after Pweeg's: his body is Pweeg's body exactly (copy it from the attached painted model sheet of Pweeg), only the sunglasses and his cool attitude are his own`
  }),
  chad('chad-idle', { modelCard: true }),
  chad('chad-walk', { modelCard: true }),
  chad('chad-hover', {
    blurb: `${PAPER_CHAD_IS}, floating relaxed: both arms raised straight up above his head and BOTH HANDS TOGETHER gripping one single handle at one point (paint NO parasol; the two hands meet in the air, touching), legs dangling loose`
  }),
  {
    ...sheetById('umbrella')!,
    doc: 'PROMPTS-LANTERN.md',
    styleRef: STYLE_HERO,
    title: 'The wagasa parasol — open, furled, broken',
    blurb: 'one Japanese WAGASA paper parasol in its three states, exactly the parasol of the attached concept art, held at its curved crook handle of dark bamboo (the crook is at the bottom of every panel, at the same spot as the reference\'s J-hook): OPEN — a shallow dome canopy of red washi paper seen from the side, a cream-white ring band across it, a deeper red centre, many fine bamboo ribs fanning out from a small top cap; FURLED — folded shut into a slim tapering roll of pleated red paper bound with a thin cord; BROKEN — blown inside-out, the bamboo ribs splayed up and the torn red paper flapping',
    colour: 'warm red washi paper (#c8402f) with a darker red shadow facet, ONE cream-white ring band (#f1e2c4), a deep red centre (#8e2a22), pale bamboo ribs (#d9b77a), a dark brown bamboo crook handle and shaft (#4a2e22). The broken one is the SAME red and cream paper — never pink or rose',
    readPanels: 'Row 1 (panels 1–3): the OPEN wagasa, THREE NEAR-IDENTICAL COPIES of one parasol — the same shallow cone-shaped canopy, the same cream ring band, the same ribs and the same handle; only the canopy\'s height changes by a hair (panel 1 a little higher, panel 3 a little flatter). It is never a round Western umbrella dome with gores: the game cycles these three panels, so a different design in any one of them flickers. Row 2 (panels 4–6): the FURLED wagasa, three identical copies. Row 3 (panels 7–9): the BROKEN wagasa inside-out, its torn paper flapping down, level, then up. The crook handle is the same in all nine panels.',
    one: 'this parasol'
  },
  world('platform', {
    title: 'Ledge — nine-slice block',
    blurb: 'ONE big soft-cornered block that fills the WHOLE image edge to edge: a lantern-festival ledge built from layered cut card — a thick top beam of pale honey-coloured wood-grain paper, under it two or three stacked layers of cut card in dusty violet and slate indigo, each layer a little inset from the one above with a crisp cut edge and a thin shadow line between layers. A ledge is SAFE to stand on, so it holds NO red, crimson or orange anywhere: in this game red means deadly',
    colour: 'a pale honey wood-paper top beam (#e8c48a) with a soft tan grain, dusty violet (#7a6a9c) and slate indigo (#4a4f7a) card layers below — cool, calm, clearly lighter than the night sky — a thin deep plum-indigo cut-edge outline (#2a1d3a). No red, no orange'
  }),
  world('platform-finish', {
    title: 'Finish pad — nine-slice block',
    blurb: 'ONE big soft-cornered block that fills the WHOLE image edge to edge: the FINISH — a festival landing pad shaped like the side of a big glowing paper lantern: a gold-trimmed top beam of dark-brown lacquered wood paper, below it a wide band of warm glowing cream lantern paper with thin vertical bamboo ribs, lit from inside, and a dark lacquer base strip; one small round glowing paper lantern is painted ON the lantern band just inside each of the two top corners. The block\'s outline TOUCHES ALL FOUR EDGES OF THE IMAGE (no margin of magenta around it) and nothing sticks out past its outline. It is the goal, not a hazard: NO red anywhere (red means deadly in this game)',
    colour: 'dark brown lacquer wood (#4a2e22) with a bright gold trim (#f2b544), glowing warm cream-gold lantern paper (#ffe2a0) with pale bamboo ribs, a dark plum-black base strip, a thin deep plum-indigo cut-edge outline (#2a1d3a). No red',
    note: 'The game CUTS this block into a 3 × 3 grid: corners keep their size, edges and middle are STRETCHED to any size. The rounding of each corner and the little hanging lanterns stay inside the corner ninths; the middle third of every edge is a plain straight run that looks the same at both ends; the centre ninth is plain glowing lantern paper with no feature — draw NO letters.'
  }),
  world('wind-wisps', {
    // No style image: the concept kit draws its currents as tinted tiles with
    // chevron bars, and a return copies those tiles as the ground.
    styleRef: undefined,
    title: 'Wind — rising lantern-light ribbons and the super stream',
    blurb: 'sixteen separate wisps of wind, each ONE thin flowing ribbon of cut washi paper — like the tail of a paper streamer — that swooshes along to the RIGHT and ends in a small curl, some with a short second thin ribbon riding beside it. NOTHING ELSE in a panel: no folded sheets, bars, planks, fans or paper rectangles behind the ribbon, and no glow around it',
    colour: 'rows 1–2: pale cream-white and soft moonlight-blue paper ribbons (#e8f0ff, #a9c8f0) with a thin deep plum-indigo cut edge; rows 3–4 (the SUPER STREAM): fierce orange-gold paper ribbons (#ff8a2a) with a few tiny yellow spark-stars painted ON the ribbon. Every ribbon SOLID and opaque, with NO glow, halo or light spilling onto the ground — the game makes them fade in and out itself. The magenta ground is the same flat #FF00FF in all sixteen panels'
  }),
  world('platform-switch', {
    title: 'Switched block — nine-slice (tinted by the game)',
    blurb: 'ONE big soft-cornered block that fills the WHOLE image edge to edge: a block of thick pale folded card with a soft folded bevel along its edges and a small round paper rivet in each corner (it appears and disappears when a button is pressed)',
    colour: 'a pale neutral light grey-white card (#e8ecf2) with a mid-grey fold shadow and a thin deep plum-indigo cut-edge outline (#2a1d3a) — NO colour of its own: the game tints it with the colour of the button that switches it'
  }),
  world('checkpoint', {
    title: 'Checkpoint lantern — unlit and lit',
    fresh: true,
    blurb: 'a small checkpoint: a slim bamboo pole standing straight up with a short curved arm at its top, and a round paper lantern hanging from that arm on the RIGHT side of the pole, where the reference\'s pennant flies',
    colour: 'waiting: an UNLIT lantern of pale grey-blue paper (#aeb4c4) with darker grey ribs, dull; reached: a LIT lantern glowing warm cream-gold from inside (#ffd98a, the glow kept INSIDE the paper) with a small red tassel; pole pale bamboo (#d9b77a), thin deep plum-indigo cut edge (#2a1d3a)',
    readPanels: 'Panels 1–4: WAITING — the unlit grey lantern hanging almost still, the faintest sway. Panels 5–16: REACHED — the lit golden lantern swaying gently in an even loop, its tassel swinging, panel 16 leading back into panel 5. The whole TOP ROW is unlit grey and only the top row; every lantern in the three rows below is lit gold with its tassel, the bottom-right one included. Paint NO numbers, labels, lines or frames on the sheet: only the sixteen lanterns on one unbroken magenta ground. The pole never moves, and the lantern is the same size in every panel.'
  }),
  world('props', {
    title: 'Props — floor button (up, pressed) and paper spikes',
    fresh: true,
    blurb: 'a SET of small props, one per panel: panel 1 a chunky floor push-button, raised — a rounded folded-paper cap on a low dark lacquer base plate; panel 2 the same button pressed flat into its base; panels 3 and 4 two slightly different single spikes — a sharp cut-paper flame / sawtooth spike pointing straight up, standing on its base',
    colour: 'the button cap a pale neutral cream-white paper (the game tints it with its channel colour — paint it uncoloured), the base plate dark plum lacquer (#2a1d3a); the spikes a warning red cut paper (#e04a3a) with a deeper red fold shadow and one small gold highlight at the tip'
  }),
  foe('walldorf-body', {
    title: 'Walldorf — body (three paper pillars)',
    blurb: 'Walldorf\'s body: three tall folded-paper pillar spirits standing side by side, each exactly one panel wide and the full height of the image, a rounded top, straight sides, a rounded bottom. NO face, no eyes, no mouth: the game paints his face on separately. Left: the DEADLY one, a red-lacquered paper pillar with a gold rim at its top and bottom and a faint dragon-scale pattern pressed into its caps. Middle: the SOLID one, a plain column of pale grey stone-paper card, the SAME simple shape as the other two — straight sides, a rounded top, a rounded bottom; no roof, no windows, no tiers, no steps, no plinth. THE COLOURED BLOCKS IN THE LAYOUT REFERENCE ARE THE PILLARS THEMSELVES, not backgrounds: each pillar covers its block exactly, and everything around the three pillars is flat magenta. Right: the BOUNCY one, an amber paper column with springy accordion pleats in its top and bottom caps',
    colour: 'left lacquer red (#c8402f) with a gold rim (#f2b544), middle stone grey (#9aa0ac), right bright amber (#f0a830) — each with ONE fold-shadow facet down its right side and a lit facet down its left, and a thin deep plum-indigo cut edge (#2a1d3a)',
    note: 'The game CUTS each pillar into three: its top cap (row 1), its middle (row 2) and its bottom cap (row 3), and STRETCHES the middle to any height. So the scales, the pleats and the rims stay in the top and bottom thirds; the middle third of each pillar is plain straight paper of its colour, exactly the same at its top edge as at its bottom edge. THE BAND LINES ARE EXACT: on a 1024 px image every cap, rim, band and pleat ends above y = 320 and the bottom ones start below y = 705; nothing at all crosses y = 341 or y = 683 but the pillar\'s two straight sides. All three pillars are the SAME width, the full width of their panel, from top to bottom: no roof, ledge, collar or band sticking out wider than the shaft, and no shaft narrower than its caps.'
  }),
  foe('walldorf-face', {
    title: 'Walldorf — paper face (calm, angry, charging, bump)',
    blurb: 'Walldorf\'s FACE ONLY: two round eyes stacked one ABOVE the other (he is a tall pillar seen side-on, so his eyes sit on top of each other), each a white paper disc with a thin plum-indigo cut edge and a black ink pupil looking to the RIGHT, and a small ink mouth beside the lower eye — a friendly smile when calm, a grumpy frown when angry. ONLY the eyes, brows and mouth — NO pillar, no body, no paper behind them: the game lays this face over his painted body',
    colour: 'white washi paper eyeballs (#fbf6ea) with a tan fold shadow, black ink pupils and outline, one tiny white glint per pupil; brows thick black ink strokes'
  }),
  foe('prickbait', {
    title: 'Prickbait — paper firecracker mine',
    blurb: 'Prickbait, the floating mine: an angry round FIRECRACKER ball folded from lacquer-red paper, with six fat folded-paper cone spikes around it, a short fuse on top with a tiny gold spark, two angry slanted black ink brows, and two round EMPTY white paper eyes — the eyes have NO pupils: the game draws the pupils so they can follow the player',
    colour: 'a lacquer-red body (#d03a2c) with darker red fold facets (#8e2a22), deep red spikes with a gold rim at their base (#f2b544), white paper eye whites, black ink brows, a gold fuse spark'
  }),
  foe('fan', {
    title: 'Pinwheel fan — frame, pinwheel, lattice',
    blurb: 'a spinning paper PINWHEEL (kazaguruma) in four separate parts the game stacks on top of each other: panel 1 the HOUSING — a chunky square frame of pale bamboo and dark wood (it fills its panel to the reference\'s outline) with a deep dark round opening; panel 2 the ROTOR alone — a four-vaned folded-paper pinwheel, centred, around a small bamboo pin; panel 3 the front GUARD alone — a round lattice of thin bamboo strips (a few rings and spokes) with a small cream hub cap in the middle, see-through between the strips (magenta shows between them); panel 4 the same pinwheel as panel 2, turned 45 degrees',
    colour: 'the frame pale bamboo (#d9b77a) and dark wood (#4a2e22) with a near-black indigo opening; the pinwheel vanes warning red (#e04a3a) and cream paper, alternating, with sharp fold facets; the lattice pale bamboo, the hub cream'
  }),
  { ...EXTRA_SHEETS.find((s) => s.id === 'collect')!, styleRef: STYLE_WORLD },
  { ...EXTRA_SHEETS.find((s) => s.id === 'gate')!, styleRef: STYLE_WORLD }
]

export const lanternSheet = (id: string): SheetDef | undefined => LANTERN_SHEETS.find((s) => s.id === id)

/** The slicer's index for the lantern set: the kite index's entries for these
 *  sheets (same references, same fits), shipped to LANTERN_DIR. */
export const buildLanternIndex = (fits: Record<string, Fit> = {}) => ({
  ...buildIndex(fits, LANTERN_SHEETS.filter((s) => !UNSLICED.has(s.id)), LANTERN_DIR),
  generator: 'src/umbrella/art/lantern.ts'
})

/** Cut by scripts/art/lantern-refs.py --cut, not by the slicer (one pipe, not a lattice). */
export const UNSLICED = new Set(['gate'])

/** The backdrop is not a lattice sheet: one 16:9 painting the game draws behind
 *  the level (paint.ts `backdrop`), shipped as LANTERN_DIR/backdrop.webp. */
export const BACKDROP = {
  id: 'backdrop',
  /** Attached ahead of the prompt: the concept's key art (sky) and the scene. */
  refs: ['style/lantern-key.png', 'style/lantern-scene.png'],
  prompt: [
    'WHAT COMES BACK IS ONE WIDE BACKGROUND PAINTING FOR A 2D GAME — the sky and far scenery only, with NOTHING the player can touch.',
    'Use the attached images as the art-style reference: they are this game\'s approved LANTERN FESTIVAL concept art. Match their finish exactly — layered cut-paper diorama, washi paper fibre, warm lantern light against a deep indigo night — and take NO characters, platforms, pillars, currents, arrows, coins or UI from them.',
    'THE PICTURE: a lantern-festival night seen as a layered PAPER-CUT diorama. A deep indigo sky (#1a1638 at the top, a little lighter plum-indigo toward the horizon) with a few cut-paper clouds and a big pale cream paper moon in the upper right. Far layers of cut-paper mountains in blue-violet; nearer, along the BOTTOM sixth only, a low silhouette of pagoda rooftops and festival roofs in dark plum with a few warm lit windows. Hundreds of small glowing sky lanterns rising across the whole sky, smaller and fainter with distance; one or two loose strings of tiny paper lights near the top corners.',
    'IT SITS BEHIND GAMEPLAY: keep the big middle of the picture calm, dark and low in contrast — small lanterns and soft clouds only, no big shapes, no bright spots, nothing red or amber large enough to look like a hazard (red means deadly in this game, amber means bouncy). The brightest things are the moon and the lantern glow; even they stay softer than a foreground sprite.',
    'No text, no letters, no signature, no frame, no border, no vignette.',
    'OUTPUT: one landscape image, 16:9 (1920 × 1080), the whole frame painted edge to edge.'
  ].join('\n\n')
}

/** The lantern style: tactile papercraft, but with a readable edge on every
 *  silhouette (a sprite is 48 px on a phone) and no photographic depth. */
export const LANTERN_LOOK: Look = {
  head: 'STYLE — one art direction for the whole game: PAPER MOON, a lantern-festival PAPERCRAFT look. Every object is folded or cut from Japanese washi paper and thin card, like a tiny handmade paper diorama lit by warm lantern light — exactly the finish of the attached concept art.',
  body: [
    '· Everything is paper: crisp clean cut edges, soft visible paper fibre inside every fill, and a few sharp fold creases where a shape turns — one lit facet and one shadow facet on either side of a fold. Never a smooth vector fill, never plastic, clay or felt.',
    '· A clear dark edge around every silhouette: a thin deep plum-indigo line (#2a1d3a), like the shadowed cut edge of the paper, at its heaviest about 1.5% of the panel\'s shorter side. Hold the finished picture at thumbnail size: the shape must still read. Never pure black, never a hairline.',
    '· Light: warm golden lantern light from the upper left — ONE lit facet, ONE crisp shadow facet and a thin warm rim on the lit edge. No airbrush gradients, no 3D-render gloss, no photographic depth of field.',
    '· The palette of a lantern-festival night: ivory and cream washi, vermilion and lacquer red, warm gold and amber glow, plum, deep indigo, bamboo green and pale honey wood — rich and warm, never neon.',
    '· It is shown on a DEEP INDIGO night sky (#1a1638): keep every shape light, warm or saturated enough to read against it.',
    '· AN OBJECT WITH NO FACE IS NOT AN EXCEPTION TO ANY OF THIS. A ledge, a parasol or a ribbon of wind is folded and lit to exactly the same standard as the character.',
    'AVOID — this is exactly how repaints go wrong:',
    '· a photograph of paper: blurred bokeh, depth of field, soft cast shadows on a table, lens flare',
    '· a glow or halo that spills past the outline onto the background (glow stays INSIDE the paper)',
    '· thin, grey, broken or missing outlines; flat clip-art with no fold shading',
    '· fine detail that turns to mush when the sprite is shown small',
    '· text, letters, numbers, logos, signatures or watermarks anywhere — the concept art\'s captions and labels are NOT part of any sprite'
  ],
  styleSheet: (s) => `· The FIRST attached image is this game's approved LANTERN FESTIVAL CONCEPT ART. Copy its FINISH exactly: folded and cut washi paper, crisp cut edges, paper fibre, warm lantern light, its palette.${s.group === 'chad' ? ' Its little boxy paper figure is the DESIGN of Chad\'s body: Chad is that same paper figure wearing black paper sunglasses. He is NOT the round figure drawn in the layout reference: that only fixes each pose, his size in the panel and where his feet stand. Paint NO parasol in his hands.' : s.group === 'pweeg' ? ' Its little boxy paper figure IS THE CHARACTER: copy his design EXACTLY — the cube-like folded head, the boxy pleated body, the chunky folded arms and legs, the cream paper, the creases and the tiny ink face. He is NOT the round figure drawn in the layout reference: that only fixes each pose, his size in the panel and where his feet stand. Paint NO parasol in his hands.' : s.id === 'umbrella' ? ' Its red-and-cream wagasa IS this parasol: copy its design exactly.' : ' Where it shows this very thing, follow its design.'} Take NO layout, no scenery, no backdrop, no labels and no background colour from it.`
}

/** PROMPTS-LANTERN.md: one block per sheet, model sheet first, then the backdrop. */
export const lanternPromptDoc = (fits: Record<string, Fit> = {}): string => [
  '# Prompts — Umbrella lantern art ("Paper Moon", ?art=lantern)',
  '',
  'Generated from `src/umbrella/art/lantern.ts` + `prompts.ts` by `pnpm art:prompts:lantern`. Do not edit by hand — edit the manifest and regenerate.',
  '',
  `For each block: attach the images named in the heading's parenthesis IN THAT ORDER (from \`${LANTERN_SHEETS_DIR}/\`: the concept \`style/…\` sheet first, then a \`painted/…\` model sheet, the layout reference LAST), then paste the text inside the fence. Paint pweeg-model first. Save the return into \`${LANTERN_SHEETS_DIR}/painted/\` under the reference's name, then \`pnpm art:slice:lantern\`.`,
  '',
  ...paintOrder(LANTERN_SHEETS).flatMap((s) => [block(promptFor(s, fits[s.id], LANTERN_LOOK)), '']),
  block(`# Backdrop  (${BACKDROP.refs.join(' + ')} → backdrop.webp, converted by hand: not sliced)\n\n${BACKDROP.prompt}`),
  ''
].join('\n')
