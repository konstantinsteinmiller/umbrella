// ─── The kite art manifest (roadmap #6) ─────────────────────────────────────
//
// Every painted sheet the kite build (/umbrella/kite/, `isKite`) can draw in
// place of the vector drawing, and everything the art pipeline needs to paint
// it: the lattice, the REGISTRATION (which world-space square one frame
// covers, and where on it the anchor — feet, grip, centre — sits), the
// animations cut out of the sheet, the staged-loading tier, and the words of
// its prompt (prompts.ts).
//
// THE REGISTRATION IS ONE NUMBER SET, USED TWICE. The /umbrella-art bench bakes
// each reference frame by drawing the game's own vector painter into the panel
// through `box` (anchor at `ax, ay` of the panel, `box.size` world units across
// the panel), and the kite renderer blits the painted frame back through the
// SAME box. So a painting that matches its reference lands exactly where the
// vector drawing it replaces stood — the hitboxes never moved, only the pixels
// over them — and the slicer's fit step (scripts/art/slice-sheets.mjs) pulls a
// return that drifted back onto the reference's measured box.
//
// PURE: no DOM, no Vue, no `import.meta.env` — read by the browser bench, the
// kite renderer, and plain Node (`pnpm art:prompts -- --set umbrella`).

/** Pixels of one panel, in the reference and in the shipped sheet. */
export const PANEL = 256

/** One frame's square in WORLD units at the reference size (Pweeg 24 × 36,
 *  er = 9 eyes, a 90 fan…), and where the anchor point sits on it (fractions). */
export interface SpriteBox {
  size: number; ax: number; ay: number
  /** The size the game DRAWS the frame at, when it differs from the `size` the reference was baked at
   *  (the painting stays registered to its reference; only the blit is scaled, about the anchor). */
  drawSize?: number
}

/** A run of frames played as one animation. `fps` 0 = chosen by the caller
 *  (a walk is stepped by distance, a splat by its own clock). */
export interface AnimDef { frames: number[]; fps: number; loop?: boolean }

export type SheetGroup = 'pweeg' | 'chad' | 'kite' | 'chad-kite' | 'umbrella' | 'enemy' | 'world' | 'fx'
export type PromptDoc = 'PROMPTS-KITE.md' | 'PROMPTS-CHARACTERS.md' | 'PROMPTS-ENEMIES.md' | 'PROMPTS-WORLD.md' | 'PROMPTS-LANTERN.md' | 'PROMPTS-CLAY.md'

/**
 * How the renderer uses the sheet:
 *  sprite  — frames blitted through `box` at an anchor (characters, enemies, props)
 *  nine    — ONE block cut 3 × 3: corners keep their size, edges and centre stretch
 *  pillar  — 3 columns × 3 rows: column = variant, rows = top cap / body / bottom cap
 *  model   — a character model sheet: painted FIRST, attached ahead of every
 *            animation sheet of that character, never drawn by the game
 */
export type SheetUse = 'sprite' | 'nine' | 'pillar' | 'model'

export interface SheetDef {
  /** File stem: art-sheets/umbrella/<id>.png → src/assets/umbrella-art/<id>.webp. */
  id: string
  group: SheetGroup
  doc: PromptDoc
  title: string
  use: SheetUse
  cols: number
  rows: number
  /** Registration for `sprite` / `model` sheets (all panels, unless `boxes`). */
  box?: SpriteBox
  /** Per-panel registration, for a SET of different props on one sheet. */
  boxes?: SpriteBox[]
  anims: Record<string, AnimDef>
  /** Staged loading: 0 behind the splash, 1 right after, 2 when idle. */
  tier: 0 | 1 | 2
  /** The model sheet painted first and attached BEFORE this sheet's layout. */
  model?: string
  /** Attach only the model sheet's first figure (cards/<model>-card.png — never the same file
   *  name as a layout reference: Gemini drops a second attachment of the same name — cut by
   *  `lantern-refs.py --cards`) instead of the whole sheet: a single figure has
   *  no grid or poses to copy into the layout. */
  modelCard?: boolean
  /** The approved concept design of this very thing, cut from the concept art (under the sheets
   *  dir), attached after the style sheet: paint THIS design. */
  designRef?: string
  /** Write this sheet's frames at this many px (the slicer's \`exact\`), above its 256 px default
   *  cap: only for art drawn far bigger on screen than a sprite — the finish dais spans the whole
   *  finish platform, about 520 device px on a 2x phone. */
  edge?: number
  /** The designer's hand-drawn style reference (under SHEETS_DIR), attached
   *  FIRST: it sets the finish — cream-paper crayon, cel-shaded — never the subject. */
  styleRef?: string
  /** The reference is notation for a look that has no drawing yet (a new
   *  design); the prompt asks for a design, not a like-for-like repaint. */
  fresh?: boolean
  /** Slicer: register the return onto the reference's measured box by its
   *  feet or by its centre; `none` cuts the lattice as painted (tiles, sets). */
  fit: 'feet' | 'centre' | 'none'
  /** Slicer: cut the nominal lattice without measuring it — for sheets whose
   *  frames are wide and flat by design (a pancake reads as no grid). */
  gridCheck?: 'nominal'
  /** Prompt words (prompts.ts builds the block from them). */
  blurb: string
  colour: string
  view: string
  readPanels?: string
  /** The ONE-THING clause's subject ("Pweeg", "this umbrella"). */
  one?: string
  note?: string
  /** A shape a lattice cannot word (the warp gate): replaces the prompt's opening "what comes back". */
  shape?: string[]
  /** …and its count-and-check lines. */
  check?: string[]
}

/** Where every sheet ships: kept out of public/ so no other build carries it —
 *  only the kite-only module's `import.meta.glob` pulls the files into a bundle. */
export const SHIPPED_DIR = 'src/assets/umbrella-art'
/** The designer's two style sheets (docs/design/reference/kite-*.png, copied
 *  into SHEETS_DIR/style/ so the Art Desk can attach them — padded to a square
 *  with their own paper colour: an off-ratio attachment pulls the return off
 *  the square grid, PROMPT-ANATOMY.md §12). */
export const STYLE_KITE = 'style/kite-model-sheet.png'
export const STYLE_WORLD = 'style/platforms-enemies.png'
export const SHEETS_DIR = 'art-sheets/umbrella'
export const referenceFile = (s: SheetDef): string => `${s.id}.png`
/** Relative to SHIPPED_DIR. A model sheet is cut to `model/`, which the game's
 *  glob does not reach (it is a painting reference, not game art). */
export const targetOf = (s: SheetDef): string => (s.use === 'model' ? `model/${s.id}.webp` : `${s.id}.webp`)

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i)

// ─── Registration boxes ─────────────────────────────────────────────────────

/** Pweeg / Chad: an 80-unit square, feet 70 % down — room for raised arms,
 *  the hook legs of the fall and the long legs of terminal velocity. */
const FIGURE: SpriteBox = { size: 80, ax: 0.5, ay: 0.7 }
/** Splat and burst: the pancake is 2.6 × as wide as Pweeg stands. */
const FIGURE_WIDE: SpriteBox = { size: 128, ax: 0.5, ay: 0.75 }
/** The umbrella, held at its grip: the canopy reaches 68 above it. */
const UMBRELLA: SpriteBox = { size: 80, ax: 0.5, ay: 0.875 }
/** The kite characters, closed (walking, standing, falling): the diamond body,
 *  its stubby legs and the bow-tail trailing behind. */
const KITE: SpriteBox = { size: 96, ax: 0.5, ay: 0.72 }
/** The DEPLOYED kite: it IS the umbrella, so its wings and sail spread over
 *  the canopy's wind box (26–66 above the grip, 60 wide). */
/** Painted at 144 the wings spanned ~120 units — twice the umbrella. Drawn at 80 they span ~67, the umbrella's 60-wide canopy,
 *  and the kite body is about the player's own size. */
const KITE_DEPLOYED: SpriteBox = { size: 144, drawSize: 80, ax: 0.5, ay: 0.8 }
/** Splat and burst. */
const KITE_WIDE: SpriteBox = { size: 128, ax: 0.5, ay: 0.75 }
/** Walldorf's two stacked eyes at er = 9, centred on the pair. */
const WALLDORF_FACE: SpriteBox = { size: 60, ax: 0.5, ay: 0.5 }
/** Prickbait of radius 26, centred; the spikes reach 1.18 r. */
export const PRICKBAIT_R = 26
const PRICKBAIT: SpriteBox = { size: 80, ax: 0.5, ay: 0.5 }
/** A 90 fan in a 100 panel. */
export const FAN_SIZE = 90
const FAN: SpriteBox = { size: 100, ax: 0.5, ay: 0.5 }
/** A checkpoint flag, anchored on the point it stands on. */
const CHECKPOINT: SpriteBox = { size: 80, ax: 0.5, ay: 0.9 }
/** A 60-wide floor button, anchored on its bottom centre. */
export const BUTTON_W = 60
const BUTTON: SpriteBox = { size: 80, ax: 0.5, ay: 0.75 }
/** One 26 × 26 spike, anchored on its base centre. */
export const SPIKE = 26
const SPIKE_BOX: SpriteBox = { size: 32, ax: 0.5, ay: 0.9 }
/** One wind wisp, centred, flowing to the RIGHT. */
const WISP: SpriteBox = { size: 80, ax: 0.5, ay: 0.5 }

// ─── Shared words ───────────────────────────────────────────────────────────

export const PWEEG_IS = 'Pweeg, a tiny round creature: a big round head with two small dot eyes, no torso — two short thick rounded tube legs and two thin loop arms come straight out from under the head'
export const PWEEG_COLOUR ='Pweeg is WHITE — a warm porcelain white body with a cool lavender-grey cel shadow; the eyes are deep plum-brown dots. He must read as a light shape on a dark navy night background'
export const CHAD_IS = 'Chad, Pweeg\'s cool friend: exactly Pweeg\'s body (a big round white head, no torso, two short thick tube legs, two thin loop arms) wearing a pair of black rounded-rectangle sunglasses with one small white glint'
export const CHAD_COLOUR = 'Chad is WHITE like Pweeg (warm porcelain white, lavender-grey cel shadow); his sunglasses are glossy black with a single white glint'
const SIDE_VIEW = 'a flat side view, facing RIGHT like the reference (his eyes sit toward the right of his head). No three-quarter view, no perspective, no ground, no shadow on the ground.'
const KITE_IS = 'Pweeg-Kite, the player as a KITE (exactly as the designer\'s Pweeg-Chad kite character model sheet draws him): a diamond kite body with a cute face on it, crossed spars, mustard-yellow paper panels with brick-red and dusty-blue edges, two stubby little arms and two stubby legs, and a string bow-tail with small red, yellow and blue bows. Pweeg-Kite NEVER wears sunglasses, goggles or glasses in any pose: his face is only two plum-brown dot eyes and a small smile (sunglasses belong to his friend Chad alone)'
const KITE_COLOUR = 'mustard and golden-yellow kite paper, brick-red and dusty-blue edge panels, a warm brown spar cross; the face plum-brown dots and a small smile; bows red, mustard and blue'
const CHAD_KITE_IS = 'Chad-Kite, Pweeg-Kite\'s cool friend: the SAME diamond kite body, arms, legs and bow-tail, wearing black rounded sunglasses with one small white glint'
const CHAD_KITE_COLOUR = 'the same kite colours as Pweeg-Kite (mustard, brick red, dusty blue); glossy black sunglasses'
const KITE_VIEW = 'a flat side view facing RIGHT like the reference (the face sits toward the right of the diamond), the kite seen flat-on like a paper kite. No three-quarter view, no perspective, no ground, no shadow on the ground. The ground of EVERY panel is the same flat pure magenta (#FF00FF): never pink, pastel, white, cream or a gradient. Keep every figure, raised arms and tail included, well inside its own panel with clear empty magenta space (at least 8% of the panel) on all four sides, so no limb reaches the next panel.'

// ─── The sheets ─────────────────────────────────────────────────────────────

export const SHEETS: SheetDef[] = [
  // ── Pweeg ──
  {
    id: 'pweeg-model', styleRef: STYLE_WORLD, group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — character model sheet', use: 'model',
    cols: 3, rows: 3, box: FIGURE, anims: {}, tier: 2, fresh: true, fit: 'none',
    blurb: `${PWEEG_IS}. This is his MODEL SHEET: the one picture every later animation of him is painted from`,
    colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'Panel 1 standing; panel 2 standing and looking straight at the viewer (eyes centred); panels 3 and 4 two walking steps; panel 5 hanging with both hands raised above his head (they hold an umbrella the game draws separately — paint NO umbrella); panel 6 falling, arms flung up and out, legs bent out with the feet up; panel 7 his terminal-velocity pose, legs stretched long and straight, eyes big round goggles (the game turns this one upside down); panel 8 cheering, both arms thrown up in a V; panel 9 squashed flat and wide like a pancake after a hard landing.'
  },
  {
    id: 'pweeg-idle', styleRef: STYLE_WORLD, group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — idle', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 0, fit: 'feet',
    anims: { idle: { frames: range(0, 15), fps: 6 } },
    blurb: `${PWEEG_IS}, standing still and breathing`, colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'A slow breathing loop: from panel 1 to panel 8 his head sinks a hair and his legs bend a hair; from 9 to 16 he rises back. Panels 13 and 14 are a blink — both eyes shut as short curved lines. Every other panel has the eyes open. Panel 16 must lead straight back into panel 1.'
  },
  {
    id: 'pweeg-walk', styleRef: STYLE_WORLD, group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — walk cycle', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 0, fit: 'feet',
    anims: { walk: { frames: range(0, 15), fps: 0 } },
    blurb: `${PWEEG_IS}, walking to the right`, colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'One full walk cycle in 16 even steps: the two tube legs lift and swing alternately, the free arm swings opposite the legs, and the arm on his facing side stays forward (it holds a furled umbrella the game draws separately — paint NO umbrella). Panel 16 leads straight back into panel 1. His head stays the same size and at the same height band in every panel. EVERY one of the 16 panels is a SIDE-VIEW walking stride facing right, his legs apart mid-step: none faces the viewer, none stands with its feet together.'
  },
  {
    id: 'pweeg-hover', styleRef: STYLE_WORLD, group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — hover under the umbrella', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 0, fit: 'feet',
    anims: { hover: { frames: range(0, 15), fps: 7.64 } },
    blurb: `${PWEEG_IS}, floating: both hands raised straight up above his head gripping a handle (the umbrella itself is painted separately — paint NO umbrella, the hands meet in the air), his legs dangling loose`,
    colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'A gentle dangle loop: the hands stay locked together at the same point above his head in every panel; only the legs swing a little left and right and back. Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'pweeg-fall', styleRef: STYLE_WORLD, group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — falling (flail)', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 0, fit: 'feet',
    anims: { fall: { frames: range(0, 15), fps: 40.7 } },
    blurb: `${PWEEG_IS}, in free fall: both arms flung up and bent outward, legs bent down and out with the feet curled up, a startled look`,
    colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'A fast flail loop: the arms and feet wiggle out and back a little; the head does not move. Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'pweeg-terminal', styleRef: STYLE_WORLD, group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — terminal velocity', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 1, fit: 'feet',
    anims: { terminal: { frames: range(0, 15), fps: 50.9 } },
    blurb: `${PWEEG_IS}, at terminal velocity: no arms showing, his two legs stretched long and straight below him, and his eyes two BIG round goggle eyes (white rings with a dot pupil) — pure panic. Paint him the way up the reference shows; the game turns him upside down`,
    colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'A fast shiver loop: the long legs tremble a little left and right; the head and goggle eyes stay put. Panel 16 leads straight back into panel 1. The goggle eyes ARE his eyes, painted on the head — NO glasses, no frames, no bridge, no lenses — and they are the same in all 16 panels. NO arms in any panel: the head sits straight on the two long legs, exactly as the reference shows.'
  },
  {
    id: 'pweeg-cheer', styleRef: STYLE_WORLD, group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — win dance', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 1, fit: 'feet',
    anims: { cheer: { frames: range(0, 15), fps: 0 } },
    blurb: `${PWEEG_IS}, cheering: both arms thrown up in a V, a happy bouncy dance`,
    colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'One hop of a happy dance: panels 1–4 he squashes down a little ready to jump, 5–12 he stretches tall at the top of the hop with the arms highest, 13–16 he comes back down and squashes again. The game moves him up and down and tilts him itself — keep his feet on the same line in every panel.'
  },
  {
    id: 'pweeg-flattened', styleRef: STYLE_WORLD, group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — flattened (hard landing)', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE_WIDE, model: 'pweeg-model', tier: 1, fit: 'feet', gridCheck: 'nominal',
    anims: { squash: { frames: range(0, 5), fps: 75, loop: false }, flat: { frames: range(6, 15), fps: 12 } },
    blurb: `${PWEEG_IS}, squashed flat by a hard landing like a cartoon pancake`,
    colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'Panels 1–6 are the squash: panel 1 is him standing, and each panel after it is wider and lower until panel 6 is a flat pancake more than twice his width with dizzy swirl eyes. Panels 7–16 are him lying flat as that pancake, wobbling a little wider and narrower, eyes dizzy. His feet line stays the same in every panel.'
  },
  {
    id: 'pweeg-destroyed', styleRef: STYLE_WORLD, group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — destroyed (hit by an enemy / shredded)', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE_WIDE, model: 'pweeg-model', tier: 1, fit: 'none', fresh: true,
    anims: { poof: { frames: range(0, 15), fps: 24, loop: false } },
    blurb: `${PWEEG_IS}, the moment an enemy gets him: a cartoon "poof" — he is NEVER hurt or cut, he pops into a soft cloud puff like a cartoon knock-out`,
    colour: `${PWEEG_COLOUR}. The puff is the same warm white with lavender cel shadows; a few tiny golden stars`,
    view: 'a flat side view, the puff centred on where he stood. No perspective, no ground.', one: 'the puff',
    readPanels: 'Panels 1–3: Pweeg jolts, startled, eyes as two little crosses, squashing slightly. Panels 4–6: he pops — a round cloud puff bursts out where he was, growing. Panels 7–11: the puff is at its biggest, a cluster of round cloud balls with three or four tiny golden stars spinning around it. Panels 12–16: the puff breaks into fewer and SMALLER balls each panel; panel 16 holds only two tiny balls. Nothing is ever half-transparent: a fading puff shrinks and breaks apart.'
  },
  {
    id: 'pweeg-front', styleRef: STYLE_WORLD, group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — looking at the player', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 1, fit: 'feet',
    anims: { front: { frames: range(0, 11), fps: 6 }, blink: { frames: [12, 13], fps: 6 } },
    blurb: `${PWEEG_IS}, standing and looking straight out at the viewer, his two dot eyes centred on his head`,
    colour: PWEEG_COLOUR, view: 'he stands side-on like the reference, only his eyes look straight out at the viewer. No perspective, no ground.', one: 'Pweeg',
    readPanels: 'A slow breathing loop like his idle: the head sinks a hair from panel 1 to 8 and rises back by 16. Panels 13 and 14 are a blink — eyes shut as short curved lines. Eyes open and centred in every other panel.'
  },

  // ── Chad ──
  {
    id: 'chad-model', styleRef: STYLE_WORLD, group: 'chad', doc: 'PROMPTS-CHARACTERS.md', title: 'Chad — character model sheet', use: 'model',
    cols: 3, rows: 3, box: FIGURE, anims: {}, tier: 2, fresh: true, fit: 'none', model: 'pweeg-model',
    blurb: `${CHAD_IS}. This is his MODEL SHEET, painted after Pweeg's: the body is Pweeg's body exactly (copy it from the first attached image), only the sunglasses and his cool attitude are his own`,
    colour: CHAD_COLOUR, view: SIDE_VIEW, one: 'Chad',
    readPanels: 'Panel 1 standing; panel 2 standing and facing the viewer; panels 3–6 four walking steps; panels 7 and 8 hanging with both hands raised above his head (they hold an umbrella the game draws separately — paint NO umbrella); panel 9 a slight knee-bend landing squash.'
  },
  {
    id: 'chad-idle', styleRef: STYLE_WORLD, group: 'chad', doc: 'PROMPTS-CHARACTERS.md', title: 'Chad — idle', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'chad-model', tier: 2, fit: 'feet',
    anims: { idle: { frames: range(0, 15), fps: 6 } },
    blurb: `${CHAD_IS}, standing still, effortlessly cool`, colour: CHAD_COLOUR, view: SIDE_VIEW, one: 'Chad',
    readPanels: 'A slow breathing loop: from panel 1 to 8 his head sinks a hair; from 9 to 16 he rises back. The sunglasses never come off and never change. Both arms hang loose at his sides in ALL 16 panels — never folded across the chest, never on a hip: only the head moves. Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'chad-walk', styleRef: STYLE_WORLD, group: 'chad', doc: 'PROMPTS-CHARACTERS.md', title: 'Chad — walk cycle', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'chad-model', tier: 2, fit: 'feet',
    anims: { walk: { frames: range(0, 15), fps: 0 } },
    blurb: `${CHAD_IS}, strolling to the right`, colour: CHAD_COLOUR, view: SIDE_VIEW, one: 'Chad',
    readPanels: 'One full walk cycle in 16 even steps, exactly like Pweeg\'s: the tube legs lift and swing alternately, the free arm swings, the facing-side arm stays forward (it holds a furled umbrella the game draws separately — paint NO umbrella). Panel 16 leads straight back into panel 1. EVERY one of the 16 panels is a SIDE-VIEW walking stride facing right, mid-step like the layout reference: none faces the viewer, stands still, kneels, presses its palms together or squats — those are the model sheet\'s poses, and no pose is ever copied from the model sheet.'
  },
  {
    id: 'chad-hover', styleRef: STYLE_WORLD, group: 'chad', doc: 'PROMPTS-CHARACTERS.md', title: 'Chad — float under the umbrella', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'chad-model', tier: 2, fit: 'feet',
    anims: { hover: { frames: range(0, 15), fps: 7.64 } },
    blurb: `${CHAD_IS}, floating relaxed: both hands raised straight up above his head gripping a handle (paint NO umbrella, the hands meet in the air), legs dangling loose`,
    colour: CHAD_COLOUR, view: SIDE_VIEW, one: 'Chad',
    readPanels: 'A gentle dangle loop: the hands stay locked at the same point above his head in every panel; only the legs swing a little. Panel 16 leads straight back into panel 1.'
  },

  // ── The KITE characters (the kite build's player and Chad) ──
  // In the kite deployment Pweeg and Chad ARE kites: closed on the ground
  // (stubby legs), deployed in the air (wings, colourful panels, bow-tail) —
  // the kite replaces the umbrella (closed = furled, deployed = open), so no
  // umbrella is drawn over them. Hitboxes do not change.
  {
    id: 'pweeg-kite-model', group: 'kite', doc: 'PROMPTS-KITE.md', title: 'Pweeg-Kite — character model sheet', use: 'model',
    cols: 3, rows: 3, boxes: [KITE, KITE, KITE, KITE, KITE_DEPLOYED, KITE, KITE, KITE, KITE], anims: {}, tier: 2, fresh: true, fit: 'none', styleRef: STYLE_KITE,
    blurb: `${KITE_IS}. This is his MODEL SHEET: the one picture every later animation of him is painted from — follow the designer's sheet (the first attached image) for his design`,
    colour: KITE_COLOUR, view: KITE_VIEW, one: 'Pweeg-Kite',
    readPanels: 'Panel 1 standing, kite CLOSED; panel 2 standing and looking straight at the viewer; panels 3 and 4 two walking steps on his stubby legs; panel 5 DEPLOYED and floating — wide colourful wings spread out, the bow-tail streaming below (the deployed kite is much bigger than the closed one, so it fills more of its panel — keep it exactly that size); panel 6 RETRACTED mid-air — wings folded in, a squinting frown, fluttering; panel 7 terminal velocity — big round goggle eyes, two torn corners (the game turns this one upside down); panel 8 BROKEN — torn paper, a cracked spar poking out; panel 9 cheering, both stubby arms up.'
  },
  {
    id: 'pweeg-kite-idle', group: 'kite', doc: 'PROMPTS-KITE.md', title: 'Pweeg-Kite — idle (closed)', use: 'sprite',
    cols: 4, rows: 4, box: KITE, model: 'pweeg-kite-model', styleRef: STYLE_KITE, tier: 0, fit: 'feet', fresh: true,
    anims: { idle: { frames: range(0, 15), fps: 6 } },
    blurb: `${KITE_IS}, standing on the ground with his kite CLOSED, breathing`, colour: KITE_COLOUR, view: KITE_VIEW, one: 'Pweeg-Kite',
    readPanels: 'A slow breathing loop: the kite body sinks a hair from panel 1 to 8 and rises back by 16, the bow-tail sways gently. Panels 13 and 14 are a blink (eyes shut as short curved lines). Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'pweeg-kite-walk', group: 'kite', doc: 'PROMPTS-KITE.md', title: 'Pweeg-Kite — walk cycle (closed)', use: 'sprite',
    cols: 4, rows: 4, box: KITE, model: 'pweeg-kite-model', styleRef: STYLE_KITE, tier: 0, fit: 'feet', fresh: true,
    anims: { walk: { frames: range(0, 15), fps: 0 } },
    blurb: `${KITE_IS}, walking to the right on his stubby legs with his kite CLOSED`, colour: KITE_COLOUR, view: KITE_VIEW, one: 'Pweeg-Kite',
    readPanels: 'One full walk cycle in 16 even steps: the two stubby legs swing alternately, the little arms swing opposite, the kite body bobs a hair, the bow-tail trails and swings behind him. Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'pweeg-kite-hover', group: 'kite', doc: 'PROMPTS-KITE.md', title: 'Pweeg-Kite — floating, kite DEPLOYED', use: 'sprite',
    cols: 4, rows: 4, box: KITE_DEPLOYED, model: 'pweeg-kite-model', styleRef: STYLE_KITE, tier: 0, fit: 'feet', fresh: true,
    anims: { hover: { frames: range(0, 15), fps: 7.64 } },
    blurb: `${KITE_IS}, floating with his kite DEPLOYED: wide wings with colourful panels (red, mustard, blue) spread out to both sides and above him like a glider's sail, his little legs dangling, the bow-tail streaming down behind him, a happy relaxed face`,
    colour: KITE_COLOUR, view: KITE_VIEW, one: 'Pweeg-Kite',
    readPanels: 'A gentle glide loop: the wings ripple a little, the tail bows wave, the legs dangle and swing; the body and wings stay the same size and in the same place in every panel. Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'pweeg-kite-fall', group: 'kite', doc: 'PROMPTS-KITE.md', title: 'Pweeg-Kite — retracted, fluttering mid-air', use: 'sprite',
    cols: 4, rows: 4, box: KITE, model: 'pweeg-kite-model', styleRef: STYLE_KITE, tier: 0, fit: 'feet', fresh: true,
    anims: { fall: { frames: range(0, 15), fps: 10 } },
    blurb: `${KITE_IS}, in free fall with his kite RETRACTED: wings folded in tight, a squinting frown, his arms and legs flailing, the bow-tail whipping up behind him`,
    colour: KITE_COLOUR, view: KITE_VIEW, one: 'Pweeg-Kite',
    readPanels: 'A fast flutter loop: the folded kite edges and the tail flap, arms and legs wiggle; the body does not move. Panel 16 leads straight back into panel 1. (The game tips this pose sideways when he gets close to danger.)'
  },
  {
    id: 'pweeg-kite-terminal', group: 'kite', doc: 'PROMPTS-KITE.md', title: 'Pweeg-Kite — terminal velocity', use: 'sprite',
    cols: 4, rows: 4, box: KITE, model: 'pweeg-kite-model', styleRef: STYLE_KITE, tier: 1, fit: 'feet', fresh: true,
    anims: { terminal: { frames: range(0, 15), fps: 12 } },
    blurb: `${KITE_IS}, at terminal velocity: big round goggle eyes, pure panic, two corners of the kite torn ragged, his legs stretched out straight. Paint him the way up the reference shows; the game turns him upside down`,
    colour: KITE_COLOUR, view: KITE_VIEW, one: 'Pweeg-Kite',
    readPanels: 'A fast shiver loop: the torn corners and the tail tremble; the body and goggles stay put. Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'pweeg-kite-broken', group: 'kite', doc: 'PROMPTS-KITE.md', title: 'Pweeg-Kite — broken kite (the umbrella-break condition)', use: 'sprite',
    cols: 4, rows: 4, box: KITE, model: 'pweeg-kite-model', styleRef: STYLE_KITE, tier: 1, fit: 'feet', fresh: true,
    anims: { broken: { frames: range(0, 15), fps: 10 } },
    blurb: `${KITE_IS}, his kite BROKEN by opening it too fast: the paper torn open, one spar cracked and poking out, scraps flapping, a dismayed face, falling`,
    colour: KITE_COLOUR, view: KITE_VIEW, one: 'Pweeg-Kite',
    readPanels: 'A flapping loop: the torn paper flaps and the broken spar wobbles; his body and face stay the same size and in the same place. Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'pweeg-kite-cheer', group: 'kite', doc: 'PROMPTS-KITE.md', title: 'Pweeg-Kite — finish-podium dance', use: 'sprite',
    cols: 4, rows: 4, box: KITE, model: 'pweeg-kite-model', styleRef: STYLE_KITE, tier: 1, fit: 'feet', fresh: true,
    anims: { cheer: { frames: range(0, 15), fps: 0 } },
    blurb: `${KITE_IS}, cheering on the finish podium: both stubby arms thrown up, a big happy grin, a bouncy dance`,
    colour: KITE_COLOUR, view: KITE_VIEW, one: 'Pweeg-Kite',
    readPanels: 'One hop of a happy dance: panels 1–4 he squashes down, 5–12 he stretches tall with the arms highest, 13–16 he comes down and squashes again. The game moves him up and down and tilts him itself — keep his feet on the same line in every panel.'
  },
  {
    id: 'pweeg-kite-flattened', group: 'kite', doc: 'PROMPTS-KITE.md', title: 'Pweeg-Kite — flattened (splat)', use: 'sprite',
    cols: 4, rows: 4, box: KITE_WIDE, model: 'pweeg-kite-model', styleRef: STYLE_KITE, tier: 1, fit: 'feet', gridCheck: 'nominal', fresh: true,
    anims: { squash: { frames: range(0, 5), fps: 75, loop: false }, flat: { frames: range(6, 15), fps: 12 } },
    blurb: `${KITE_IS}, squashed flat by a hard landing like a cartoon pancake, with a little splat burst`,
    colour: KITE_COLOUR, view: KITE_VIEW, one: 'Pweeg-Kite',
    readPanels: 'Panels 1–6 are the squash: panel 1 standing, each panel after wider and lower until panel 6 is a flat crumpled kite more than twice his width with dizzy swirl eyes and a small splat burst. Panels 7–16 he lies flat, wobbling a little. His feet line stays the same in every panel.'
  },
  {
    id: 'pweeg-kite-destroyed', group: 'kite', doc: 'PROMPTS-KITE.md', title: 'Pweeg-Kite — destroyed (hit by an enemy / shredded)', use: 'sprite',
    cols: 4, rows: 4, box: KITE_WIDE, model: 'pweeg-kite-model', styleRef: STYLE_KITE, tier: 1, fit: 'none', fresh: true,
    anims: { poof: { frames: range(0, 15), fps: 24, loop: false } },
    blurb: `${KITE_IS}, the moment an enemy gets him: a cartoon "poof" — he is NEVER hurt or cut, he pops into a soft cloud puff with a few paper scraps and tail bows`,
    colour: `${KITE_COLOUR}. The puff is warm cream with lavender cel shadows; a few tiny golden stars`,
    view: 'a flat side view, the puff centred where he stood. No perspective, no ground.', one: 'the puff',
    readPanels: 'Panels 1–3: he jolts, eyes as little crosses. Panels 4–6: he pops into a round cloud puff, growing. Panels 7–11: the puff at its biggest, with paper scraps and tiny stars. Panels 12–16: the puff breaks into fewer and SMALLER balls each panel; panel 16 holds only two tiny balls. Nothing is ever half-transparent.'
  },
  {
    id: 'pweeg-kite-front', group: 'kite', doc: 'PROMPTS-KITE.md', title: 'Pweeg-Kite — looking at the player', use: 'sprite',
    cols: 4, rows: 4, box: KITE, model: 'pweeg-kite-model', styleRef: STYLE_KITE, tier: 1, fit: 'feet', fresh: true,
    anims: { front: { frames: range(0, 11), fps: 6 }, blink: { frames: [12, 13], fps: 6 } },
    blurb: `${KITE_IS}, standing with his kite closed, looking straight out at the viewer with a friendly smile`,
    colour: KITE_COLOUR, view: 'he faces the viewer, eyes centred. No perspective, no ground.', one: 'Pweeg-Kite',
    readPanels: 'A slow breathing loop like his idle. Panels 13 and 14 are a blink. Eyes open and centred in every other panel.'
  },
  {
    id: 'chad-kite-model', group: 'chad-kite', doc: 'PROMPTS-KITE.md', title: 'Chad-Kite — character model sheet', use: 'model',
    cols: 3, rows: 3, boxes: [KITE, KITE, KITE, KITE, KITE, KITE, KITE_DEPLOYED, KITE_DEPLOYED, KITE], anims: {}, tier: 2, fresh: true, fit: 'none', styleRef: STYLE_KITE, model: 'pweeg-kite-model',
    blurb: `${CHAD_KITE_IS}. This is his MODEL SHEET, painted after Pweeg-Kite's: the kite body is Pweeg-Kite's exactly (copy it from his painted model sheet), only the black sunglasses and his cool attitude are his own — exactly as the designer's sheet shows him`,
    colour: CHAD_KITE_COLOUR, view: KITE_VIEW, one: 'Chad-Kite',
    readPanels: 'Panel 1 standing, kite closed; panel 2 facing the viewer; panels 3–6 four walking steps; panels 7 and 8 DEPLOYED and floating, wings spread, bow-tail streaming (much bigger than the closed kite, filling more of their panels — keep that size); panel 9 a slight knee-bend landing squash.'
  },
  {
    id: 'chad-kite-idle', group: 'chad-kite', doc: 'PROMPTS-KITE.md', title: 'Chad-Kite — idle (closed)', use: 'sprite',
    cols: 4, rows: 4, box: KITE, model: 'chad-kite-model', styleRef: STYLE_KITE, tier: 2, fit: 'feet', fresh: true,
    anims: { idle: { frames: range(0, 15), fps: 6 } },
    blurb: `${CHAD_KITE_IS}, standing with his kite closed, effortlessly cool`, colour: CHAD_KITE_COLOUR, view: KITE_VIEW, one: 'Chad-Kite',
    readPanels: 'A slow breathing loop; the sunglasses never come off and never change; the tail sways. Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'chad-kite-walk', group: 'chad-kite', doc: 'PROMPTS-KITE.md', title: 'Chad-Kite — walk cycle (closed)', use: 'sprite',
    cols: 4, rows: 4, box: KITE, model: 'chad-kite-model', styleRef: STYLE_KITE, tier: 2, fit: 'feet', fresh: true,
    anims: { walk: { frames: range(0, 15), fps: 0 } },
    blurb: `${CHAD_KITE_IS}, strolling to the right on his stubby legs, kite closed`, colour: CHAD_KITE_COLOUR, view: KITE_VIEW, one: 'Chad-Kite',
    readPanels: 'One full walk cycle in 16 even steps, exactly like Pweeg-Kite\'s. Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'chad-kite-hover', group: 'chad-kite', doc: 'PROMPTS-KITE.md', title: 'Chad-Kite — floating, kite DEPLOYED', use: 'sprite',
    cols: 4, rows: 4, box: KITE_DEPLOYED, model: 'chad-kite-model', styleRef: STYLE_KITE, tier: 2, fit: 'feet', fresh: true,
    anims: { hover: { frames: range(0, 15), fps: 7.64 } },
    blurb: `${CHAD_KITE_IS}, gliding with his kite DEPLOYED — wide colourful wings spread, the bow-tail streaming, a cool grin`,
    colour: CHAD_KITE_COLOUR, view: KITE_VIEW, one: 'Chad-Kite',
    readPanels: 'A gentle glide loop: the wings ripple, the tail bows wave; the body stays in place. Panel 16 leads straight back into panel 1.'
  },

  // ── The umbrella ──
  {
    id: 'umbrella', styleRef: STYLE_WORLD, group: 'umbrella', doc: 'PROMPTS-CHARACTERS.md', title: 'The umbrella — open, furled, broken', use: 'sprite',
    cols: 3, rows: 3, box: UMBRELLA, tier: 0, fit: 'none',
    anims: { open: { frames: [0, 1, 2, 1], fps: 6 }, furled: { frames: [4], fps: 0 }, broken: { frames: [6, 7, 8, 7], fps: 14 } },
    blurb: 'one umbrella in its three states, held at the grip of its curved J-handle (the J-hook is at the bottom of every panel, at the same spot): OPEN — a scalloped dome canopy with ribs, white panels and ONE red panel (second from the left), a small ball finial on top; FURLED — rolled up into a slim spike with a red wrap and the same ball tip; BROKEN — blown inside-out, the ribs splayed up and the torn panels flapping',
    colour: 'warm porcelain-white canopy panels with lavender-grey cel shadow, ONE tomato-red panel; a cream handle and shaft; rib tips plum-brown',
    view: 'a flat side view of the umbrella standing upright on its handle; no perspective, no tilt (the game tilts it).', one: 'this umbrella',
    readPanels: 'Row 1 (panels 1–3): the OPEN umbrella, its canopy breathing very slightly flatter from panel 1 to 3. Row 2 (panels 4–6): the FURLED umbrella, three identical copies. Row 3 (panels 7–9): the BROKEN umbrella inside-out, its torn panels flapping down, level, then up.'
  },

  // ── Enemies ──
  {
    id: 'walldorf-body', styleRef: STYLE_WORLD, group: 'enemy', doc: 'PROMPTS-ENEMIES.md', title: 'Walldorf — body (three moods of pillar)', use: 'pillar',
    cols: 3, rows: 3, tier: 0, fit: 'none',
    anims: { deadly: { frames: [0, 3, 6], fps: 0 }, solid: { frames: [1, 4, 7], fps: 0 }, bounce: { frames: [2, 5, 8], fps: 0 } },
    blurb: 'Walldorf\'s body: three tall soft rounded blue capsules standing side by side — the round, squishy, friendly blue Walldorf of the designer\'s sheet stretched into a tall pillar — each exactly one panel wide and the full height of the image, a round top, straight sides, a round bottom. NO face, no eyes, no mouth: the game paints his face on separately. Left: the dangerous one, a deep indigo blue with a rosy-red warning rim just inside its outline. Middle: the harmless solid one, a soft slate blue-grey. Right: the bouncy bumper, bright friendly sky blue with a springy pale rim just inside its outline',
    colour: 'left deep indigo blue (#4a5bc4) with a rosy-red rim (#ff5a5f), middle soft slate blue-grey (#9fb0cc), right bright sky blue (#5b9be8) — each with ONE cel shadow down its right side, a crayon highlight down its left',
    view: 'flat front-on, straight up and down, no perspective.', one: 'the pillar',
    note: 'The game CUTS each pillar into three: its top cap (row 1), its middle (row 2) and its bottom cap (row 3), and STRETCHES the middle to any height. So the middle third of each pillar must be a plain straight section, exactly the same at its top edge as at its bottom edge — no cracks, spots, bands or features in it.',
    readPanels: 'Read it by COLUMN: each column is ONE pillar running from the top of the image to the bottom. Rows are not separate drawings.'
  },
  {
    id: 'walldorf-face', styleRef: STYLE_WORLD, group: 'enemy', doc: 'PROMPTS-ENEMIES.md', title: 'Walldorf — face (calm, angry, charging, bump)', use: 'sprite',
    cols: 4, rows: 4, box: WALLDORF_FACE, tier: 0, fit: 'centre',
    anims: { calm: { frames: [0, 1], fps: 1.5 }, blink: { frames: [2, 3, 2], fps: 18, loop: false }, angry: { frames: [4, 5, 6, 7], fps: 6 }, charge: { frames: [8, 9, 10, 11], fps: 12 }, bump: { frames: [12, 13, 14, 15], fps: 16, loop: false } },
    blurb: 'Walldorf\'s FACE ONLY: two round eyes stacked one ABOVE the other (he is a tall pillar seen side-on, so his eyes sit on top of each other), each a white eyeball with a brown crayon outline and a dark pupil looking to the RIGHT, and a small mouth beside the lower eye — a friendly smile when calm, a grumpy frown when angry. ONLY the eyes, brows and mouth — NO pillar, no body, no skin behind them: the game lays this face over his painted blue body',
    colour: 'white eyeballs with a lavender cel shadow, plum-brown pupils and outline, one tiny white glint per pupil; brows thick plum-brown',
    view: 'flat side-on, looking to the RIGHT. No perspective.', one: 'the pair of eyes',
    readPanels: 'Row 1 CALM: panels 1–2 plain open eyes (panel 2 a hair rounder), panel 3 half shut, panel 4 shut as two short lines. Row 2 ANGRY: the same eyes with thick brows slanting down toward the right, a little twitch from panel to panel. Row 3 CHARGING: angry brows and the eyes narrowed to a fierce squint. Row 4 BUMP: surprised — panel 13 the eyes wide and big, no brows, shrinking back to normal size by panel 16.'
  },
  {
    id: 'prickbait', styleRef: STYLE_WORLD, group: 'enemy', doc: 'PROMPTS-ENEMIES.md', title: 'Prickbait — idle, move, lunge', use: 'sprite',
    cols: 4, rows: 4, box: PRICKBAIT, tier: 0, fit: 'centre',
    anims: { idle: { frames: range(0, 7), fps: 8 }, move: { frames: range(8, 11), fps: 10 }, lunge: { frames: range(12, 15), fps: 12 } },
    blurb: 'Prickbait, the floating mine of the designer\'s sheet: a round pink-and-purple body with six fat cone spikes around it, two angry slanted brows, and two round EMPTY white eyes — the eyes have NO pupils: the game draws the pupils so they can follow the player',
    colour: 'a candy-pink body (#e86fb0) shading to purple (#9a5ac8) on its shadow side, purple spikes (#8a4cc0); white eye whites; brown crayon brows and outline',
    view: 'flat front-on, no perspective.', one: 'Prickbait',
    note: 'The two eye whites sit at EXACTLY the same place and size in every panel (the game puts its pupils there) — only the spikes and the body outline move.',
    readPanels: 'Panels 1–8 PASSIVE: a slow breath, mouth closed, the spikes growing a little longer up to panel 4 and back by panel 8. Panels 9–12 MOVE: drifting to the LEFT, the spikes swept back toward the right a little, the body squashed slightly in the direction of travel. Panels 13–16 AGGRESSIVE: puffed up and BITING — a wide open mouth full of little pointed teeth under the eyes, spikes long and sharp, brows angrier, panel 13 the biggest.'
  },

  // ── The ventilator ──
  {
    id: 'fan', styleRef: STYLE_WORLD, group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Ventilator — housing, rotor, guard', use: 'sprite',
    cols: 2, rows: 2, box: FAN, tier: 1, fit: 'none', fresh: true,
    anims: { housing: { frames: [0], fps: 0 }, rotor: { frames: [1], fps: 0 }, guard: { frames: [2], fps: 0 }, rotor2: { frames: [3], fps: 0 } },
    blurb: 'a cosy old box fan in four separate parts the game stacks on top of each other: panel 1 the HOUSING — a chunky rounded-square box (it fills its panel to the reference\'s outline) with a deep dark round opening; panel 2 the ROTOR alone — four plump rounded red blades around a small hub, centred; panel 3 the front GUARD alone — a round wire grille (a few thin concentric rings and spokes) with a cream hub cap in the middle, see-through between the wires (magenta shows between them); panel 4 the same rotor as panel 2, turned 45 degrees',
    colour: 'housing a cosy slate blue-grey (#3a4256) with a near-black opening; rotor blades warning red (#ff5a5f) with a darker red cel shadow; guard wires and hub warm cream',
    view: 'flat front-on, square on, no perspective — the rotor and guard are centred exactly on the housing\'s opening.', one: 'the fan'
  },

  // ── The world ──
  {
    id: 'platform', styleRef: STYLE_WORLD, group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Platform — nine-slice block', use: 'nine',
    cols: 3, rows: 3, tier: 0, fit: 'none', fresh: true, anims: {},
    blurb: 'ONE big soft rounded block that fills the WHOLE image edge to edge: the designer\'s mossy grass-top dirt platform — a chunk of warm brown earth with a thick cap of fresh green grass and moss along its top edge (a few grass blades hanging over the lip), softly rounded corners, a few pebbles and roots in the dirt',
    colour: 'warm brown dirt (#a87a52) with a darker brown cel shadow along the bottom, a fresh grass-green top (#7fbf5a), brown crayon outline',
    view: 'flat front-on, square on, no perspective.', one: 'the block',
    note: 'The game CUTS this block into a 3 × 3 grid: the four corners keep their size, and the edges and the middle are STRETCHED to any width and height (a ledge can be 30 times wider than it is tall). So: the rounding of each corner stays inside its own corner ninth; the middle third of every edge is a plain straight run that looks the same at both of its ends (no cracks, tufts or pebbles there); the centre ninth is plain sandstone with no feature at all.'
  },
  {
    id: 'platform-finish', styleRef: STYLE_WORLD, group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Finish platform — nine-slice block', use: 'nine',
    cols: 3, rows: 3, tier: 0, fit: 'none', fresh: true, anims: {},
    blurb: 'ONE big soft rounded block that fills the WHOLE image edge to edge: the designer\'s FINISH PODIUM — a festive grass-top block wrapped with a strip of warm golden wood along its front, a row of colourful bunting triangles (red, yellow, blue, green) hanging just under its top edge, and a few confetti dots',
    colour: 'a fresh grass-green top (#7fbf5a), warm golden wood front (#e2b25a) with an amber cel shadow, bunting in red, mustard, blue and green, brown crayon outline',
    view: 'flat front-on, square on, no perspective.', one: 'the block',
    note: 'The game CUTS this block into a 3 × 3 grid: corners keep their size, edges and middle are STRETCHED to any size. The rounding of each corner stays inside its own corner ninth; the middle third of every edge is a plain straight run that looks the same at both ends (keep the little stars to the corner ninths); the centre ninth is plain and quiet — the game writes the word "Finish" over it, so draw NO letters yourself.'
  },
  {
    id: 'platform-switch', styleRef: STYLE_WORLD, group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Switched platform — nine-slice block (tinted by the game)', use: 'nine',
    cols: 3, rows: 3, tier: 1, fit: 'none', fresh: true, anims: {},
    blurb: 'ONE big soft rounded block that fills the WHOLE image edge to edge: a pale hand-drawn stone block with a soft rounded bevel and a small round rivet in each corner (it appears and disappears when a button is pressed)',
    colour: 'a pale neutral light grey-white (#e8ecf2) with a mid-grey cel shadow and a plum-brown outline — NO colour of its own: the game tints it with the colour of the button that switches it',
    view: 'flat front-on, square on, no perspective.', one: 'the block',
    note: 'The game CUTS this block into a 3 × 3 grid: corners keep their size, edges and middle are STRETCHED to any size. The rounding and the rivets stay inside the corner ninths; the middle third of every edge is a plain straight run; the centre ninth is plain.'
  },
  {
    id: 'checkpoint', styleRef: STYLE_WORLD, group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Checkpoint flag — waiting and reached', use: 'sprite',
    cols: 4, rows: 4, box: CHECKPOINT, tier: 1, fit: 'feet',
    anims: { idle: { frames: [0, 1, 2, 3], fps: 3 }, reached: { frames: range(4, 15), fps: 11.5 } },
    blurb: 'a small checkpoint flag on a slim cream pole, the flag a triangular pennant pointing RIGHT from the top of the pole',
    colour: 'waiting: a warm muted orange-tan pennant (#d9a066); reached (active): a light sky-blue pennant (#8fd0f5) with one small cream star, as the designer\'s active checkpoint; pole warm wood, brown crayon outline',
    view: 'flat side view, the pole straight up, no perspective, no ground.', one: 'the flag',
    readPanels: 'Panels 1–4: WAITING — the orange-tan pennant hanging almost still, the faintest sway. Panels 5–16: REACHED — the light-blue pennant with its star, waving proudly in an even loop (its tip rising and falling), panel 16 leading back into panel 5. The pole never moves.'
  },
  {
    id: 'props', styleRef: STYLE_WORLD, group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Props — floor button (up, pressed) and spikes', use: 'sprite',
    cols: 2, rows: 2, boxes: [BUTTON, BUTTON, SPIKE_BOX, SPIKE_BOX], tier: 0, fit: 'none',
    anims: { buttonUp: { frames: [0], fps: 0 }, buttonDown: { frames: [1], fps: 0 }, spikeA: { frames: [2], fps: 0 }, spikeB: { frames: [3], fps: 0 } },
    blurb: 'a SET of small props, one per panel: panel 1 a chunky floor push-button, raised — a rounded cap on a low dark base plate; panel 2 the same button pressed flat into its base; panels 3 and 4 two slightly different single spikes — a fat cartoon cone pointing straight up, standing on its base',
    colour: 'the button cap a pale neutral cream-white (the game tints it with its channel colour — paint it uncoloured), the base plate dark slate; the spikes a warning rosy red (#ff5a5f) with a deeper red cel shadow and one small glint',
    view: 'flat side view, no perspective, no ground.', one: 'the set'
  },
  {
    id: 'wind-wisps', styleRef: STYLE_WORLD, group: 'fx', doc: 'PROMPTS-WORLD.md', title: 'Wind wisps — normal and super stream', use: 'sprite',
    cols: 4, rows: 4, box: WISP, tier: 0, fit: 'none', fresh: true,
    anims: { normal: { frames: range(0, 7), fps: 0 }, super: { frames: range(8, 15), fps: 0 } },
    blurb: 'sixteen separate crayon wisps of wind, the soft blue swooshes of the designer\'s sheet: each one a single flowing ribbon-stroke that swooshes along to the RIGHT and ends in a small curl, some with a short second stroke riding beside it',
    colour: 'rows 1–2: soft pale-blue and white swooshes (#bfe0f7); rows 3–4 (the SUPER STREAM): a deeper swirling wave, teal-blue (#5aa9d6) with white foam curls. Every stroke SOLID and opaque — the game makes them fade in and out itself',
    view: 'flat, every wisp flowing horizontally to the RIGHT.', one: 'the wind',
    readPanels: 'Each panel is ONE wisp, centred in its panel, about as long as the reference stroke: rows 1–2 eight different calm swooshes, rows 3–4 eight swirling, curling super-stream waves. They are not frames of a motion; they are sixteen variations.'
  }
]

// ─── Drawables painted only by the lantern build ────────────────────────────
//
// The collectibles and the warp gate have no kite sheet (the kite build draws
// them as vectors). Their references are notation made by
// scripts/art/lantern-refs.py, not baked by the bench, so they are kept out of
// SHEETS (and so out of the kite prompts, index and status).

/** One collectible, centred: the vector one spans 2 × STAR_R = 32 units. */
const COLLECT: SpriteBox = { size: 48, ax: 0.5, ay: 0.5 }

export const EXTRA_SHEETS: SheetDef[] = [
  {
    id: 'collect', group: 'world', doc: 'PROMPTS-LANTERN.md', title: 'Collectibles — star, parasol, cloud, sparkle', use: 'sprite',
    cols: 2, rows: 2, box: COLLECT, tier: 0, fit: 'none', fresh: true,
    anims: { star: { frames: [0], fps: 0 }, umbrella: { frames: [1], fps: 0 }, cloud: { frames: [2], fps: 0 }, glint: { frames: [3], fps: 0 } },
    blurb: 'a SET of four small golden treasures, one per panel, centred, each on its own with NO ring, circle, halo or frame round it (the game draws a glowing ring round each): panel 1 a STAR CLUSTER — one big five-pointed golden origami star folded from gold foil paper, with two small golden stars tucked in front of its two lower points; panel 2 an OPEN golden origami PARASOL (wagasa), its pleated canopy fanned open and tilted, on a long straight thin handle running down to the lower right; panel 3 a golden paper CLOUD with round puffs whose edges curl into little spirals, on a flat base; panel 4 a small four-pointed white-gold SPARKLE',
    colour: 'shining gold foil paper (#f6c235) with a warm light-gold lit facet (#fff0a0) and a deep amber fold shadow (#c98a0a); the sparkle white with a pale gold core',
    view: 'flat front-on, no perspective.'
  },
  {
    id: 'gate', group: 'world', doc: 'PROMPTS-LANTERN.md', title: 'Warp gate — a vermilion torii', use: 'sprite',
    cols: 1, rows: 3, tier: 0, fit: 'none', fresh: true, anims: {},
    shape: [
      'WHAT COMES BACK IS ONE TORII GATE FILLING THE WHOLE IMAGE, NOT A SCENE.',
      'One square image, 1024 x 1024 pixels, holding ONE torii gate standing upright, front-on, as wide as the image at its top beam, exactly where the layout reference draws it: the top beams across the top, two round posts standing straight down, and the posts\' black feet at the bottom.',
      '· One gate. Not a row of gates, not a gate in a landscape.',
      '· Between the two posts, under the beams, there is NOTHING: flat magenta all the way down to the ground line. No portal, no swirl, no glow, no door, no light, no sky there — the game draws its own swirling portal in that opening.',
      '· The posts are straight round columns of the same thickness from just under the lower beam down to the black feet, with nothing on them in their middle stretch (no rings, plaques, ropes or writing): the game stretches that stretch to any height.'
    ],
    blurb: 'the WARP GATE: a small Japanese TORII gate like the vermilion gates of Fushimi Inari, folded from lacquered paper — on top the KASAGI, a heavy black-lacquered top beam whose two ends sweep gently UP, with a vermilion beam right under it; a little lower the NUKI, a straight vermilion crossbeam running through both posts and sticking out a little past them; a small vermilion plaque post between the two beams in the middle; two thick round vermilion POSTS standing straight down; and at the bottom of each post a black-lacquered FOOT (a short black sleeve where the post meets the ground)',
    colour: 'bright vermilion lacquer paper (#e8501f) with a deeper red-orange fold shadow (#b8361a) and a warm lit edge (#ff8a4a); the top beam and the two feet glossy black lacquer (#1c1620) with a faint cool highlight; a thin deep plum-indigo cut-edge outline (#2a1d3a)',
    view: 'flat front-on, square on, no perspective.', one: 'the gate',
    note: 'The game CUTS this gate into three: the beams on top, a stretch of the two posts in the middle (stretched to any height), and the two black feet at the bottom.',
    check: ['· ONE vermilion torii, front-on, filling the image width at its top beam.', '· Black top beam with its ends sweeping up; black feet; plain straight posts in the middle; NOTHING painted between the posts.']
  },
  {
    id: 'clay-wind', group: 'world', doc: 'PROMPTS-CLAY.md', title: 'Clay wind — four rolled-clay swooshes', use: 'sprite',
    cols: 2, rows: 2, box: { size: 64, ax: 0.5, ay: 0.5 }, tier: 0, fit: 'none', fresh: true, gridCheck: 'nominal',
    anims: { blueA: { frames: [0], fps: 0 }, blueB: { frames: [1], fps: 0 }, orangeA: { frames: [2], fps: 0 }, orangeB: { frames: [3], fps: 0 } },
    blurb: 'the wind of the clay town, as a SET of four separate SWOOSHES of rolled plasticine, one per panel, exactly like the swirling clay wind of the attached concept art: each one ONE long smooth rolled-clay stroke lying across its panel from left to right, THICK in its middle and TAPERING to a fine point at BOTH ends, in a gentle wave, its right-hand (downstream) end curling over into a small spiral; panels 1 and 2 two slightly different swooshes in soft dusty-blue clay; panels 3 and 4 the same two shapes in warm orange clay. Each swoosh alone, nothing else in its panel',
    colour: 'panels 1-2 a soft dusty-blue clay (#6f96bd) with a lighter top edge (#a9c6e2) and a deeper shadow underneath (#4c6f93); panels 3-4 a warm orange clay (#e8873a) with a light apricot top edge (#ffbf86) and a burnt-orange shadow (#b45a1f)',
    view: 'flat front-on, no perspective, lit softly from the upper left.', one: 'the clay swoosh',
    note: 'Each swoosh lies flat across the MIDDLE of its panel and spans about four fifths of the panel\'s width, leaving magenta all round it: no leaves, no arrows, no second stroke, no background, no shadow cast on the ground.'
  },
  {
    id: 'wind-paper', group: 'world', doc: 'PROMPTS-LANTERN.md', title: 'Wind paper — blue and gold washi, chevron, arrow', use: 'sprite',
    cols: 2, rows: 2, box: { size: 64, ax: 0.5, ay: 0.5 }, tier: 0, fit: 'none', fresh: true, gridCheck: 'nominal',
    anims: { paperBlue: { frames: [0], fps: 0 }, paperGold: { frames: [1], fps: 0 }, chevron: { frames: [2], fps: 0 }, arrow: { frames: [3], fps: 0 } },
    blurb: 'the paper the game folds its wind currents from, and the marks printed on it, as a SET of four separate pieces, one per panel — panel 1 a flat SWATCH of soft BLUE washi paper filling the WHOLE panel edge to edge (no outline, no border, no magenta in it): even colour with fine visible paper fibres and a few faint fibre flecks, nothing drawn on it; panel 2 the same kind of flat swatch in warm GOLDEN washi paper, filling the whole panel edge to edge; panel 3 ONE double CHEVRON pointing RIGHT (two bold rounded strokes, one behind the other), printed in dark ink, alone and centred; panel 4 ONE bold solid ARROWHEAD pointing RIGHT with two short speed dashes trailing behind it, printed in dark brown ink, alone and centred',
    colour: 'panel 1 a calm cornflower-blue washi (#84a8de) with lighter and darker fibres; panel 2 a warm golden-yellow washi (#f6c448) with amber fibres; the chevron a deep indigo ink (#1f2a4a) with a soft brush edge; the arrow a dark brown ink (#5a2c0c)',
    view: 'flat front-on, no perspective, no shading, no folds — the game folds and lights the paper itself.', one: 'the wind paper',
    note: 'The two swatches are PLAIN paper the game cuts into strips: no pattern, no stripes, no motif, no gradient, no vignette, no edge darker than the middle. The chevron and the arrow stand alone on flat magenta, nothing around them.'
  },
  {
    id: 'finish-dais', group: 'world', doc: 'PROMPTS-LANTERN.md', title: 'Finish dais — the dais, a tassel and two pennants', use: 'sprite',
    cols: 2, rows: 2, edge: 512, box: { size: 64, ax: 0.5, ay: 0 }, tier: 0, fit: 'none', fresh: true,
    anims: { dais: { frames: [0], fps: 0 }, tassel: { frames: [1], fps: 0 }, pennantRed: { frames: [2], fps: 0 }, pennantBlue: { frames: [3], fps: 0 } },
    blurb: 'the FINISH: a festival DAIS and the decorations that hang from it, as a SET of four separate pieces, one per panel — panel 1 the DAIS alone: a big round flat lacquered drum stage seen a little from above, so its top is a wide flat ellipse — the top a glowing warm golden-cream paper disc with thin concentric rings drawn on it, a gold rim round it, and below the rim a thin band of red lacquer with a gold edge; it spans the panel\'s whole width, and nothing hangs from it; panel 2 ONE golden TASSEL: a small gold knot with a long gold fringe hanging straight down from a tiny loop at the top middle of the panel; panel 3 ONE red hanging PENNANT: a narrow swallow-tailed paper banner hanging straight down from the top middle of the panel; panel 4 ONE slate-blue hanging PENNANT, the same shape as panel 3',
    colour: 'the dais top glowing warm golden cream (#ffe2a0 at its centre to #f2b544 at its edge) with thin amber rings (#d08a2a), a gold rim (#f2b544), a red lacquer band (#b8361a) with a gold edge; the tassel gold (#e8b83a) with an amber shadow; the pennants lacquer red (#c8402f) and slate blue (#5a6f8f) washi paper; a thin deep plum-indigo cut-edge outline (#2a1d3a)',
    view: 'the dais seen a little from above (its top an ellipse); the tassel and pennants flat front-on.', one: 'the finish dais',
    note: 'Paint NO lines, borders or dividers between the four panels: the magenta runs on unbroken from panel to panel. The game stretches the dais across the finish platform and hangs a row of tassels and pennants under its rim, swaying: paint NO tassels or pennants on the dais itself, and each hanging piece alone, hanging straight down.'
  }
]

export const sheetById = (id: string): SheetDef | undefined => SHEETS.find((s) => s.id === id) ?? EXTRA_SHEETS.find((s) => s.id === id)

/** The registration box of panel `i`. */
export const boxOf = (s: SheetDef, i: number): SpriteBox => s.boxes?.[i] ?? s.box ?? { size: 1, ax: 0.5, ay: 0.5 }

/** Sheets the game draws (model sheets are only painting references). */
export const GAME_SHEETS = SHEETS.filter((s) => s.use !== 'model')

/** Sheets that ride every level from the first frame (staged loading tier 0
 *  before the level's own enemies are added). */
export const tierOf = (id: string): 0 | 1 | 2 => sheetById(id)?.tier ?? 2

/** Which sheets a hazard kind needs. */
export const SHEETS_FOR_HAZARD: Record<string, string[]> = {
  pillar: ['walldorf-body', 'walldorf-face'],
  mine: ['prickbait'],
  fan: ['fan'],
  spikes: ['props']
}
