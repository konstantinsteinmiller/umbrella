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
export interface SpriteBox { size: number; ax: number; ay: number }

/** A run of frames played as one animation. `fps` 0 = chosen by the caller
 *  (a walk is stepped by distance, a splat by its own clock). */
export interface AnimDef { frames: number[]; fps: number; loop?: boolean }

export type SheetGroup = 'pweeg' | 'chad' | 'umbrella' | 'enemy' | 'world' | 'fx'
export type PromptDoc = 'PROMPTS-CHARACTERS.md' | 'PROMPTS-ENEMIES.md' | 'PROMPTS-WORLD.md'

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
}

/** Where every sheet ships: kept out of public/ so no other build carries it —
 *  only the kite-only module's `import.meta.glob` pulls the files into a bundle. */
export const SHIPPED_DIR = 'src/assets/umbrella-art'
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

const PWEEG_IS = 'Pweeg, a tiny round creature: a big round head with two small dot eyes, no torso — two short thick rounded tube legs and two thin loop arms come straight out from under the head'
const PWEEG_COLOUR = 'Pweeg is WHITE — a warm porcelain white body with a cool lavender-grey cel shadow; the eyes are deep plum-brown dots. He must read as a light shape on a dark navy night background'
const CHAD_IS = 'Chad, Pweeg\'s cool friend: exactly Pweeg\'s body (a big round white head, no torso, two short thick tube legs, two thin loop arms) wearing a pair of black rounded-rectangle sunglasses with one small white glint'
const CHAD_COLOUR = 'Chad is WHITE like Pweeg (warm porcelain white, lavender-grey cel shadow); his sunglasses are glossy black with a single white glint'
const SIDE_VIEW = 'a flat side view, facing RIGHT like the reference (his eyes sit toward the right of his head). No three-quarter view, no perspective, no ground, no shadow on the ground.'

// ─── The sheets ─────────────────────────────────────────────────────────────

export const SHEETS: SheetDef[] = [
  // ── Pweeg ──
  {
    id: 'pweeg-model', group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — character model sheet', use: 'model',
    cols: 3, rows: 3, box: FIGURE, anims: {}, tier: 2, fresh: true, fit: 'none',
    blurb: `${PWEEG_IS}. This is his MODEL SHEET: the one picture every later animation of him is painted from`,
    colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'Panel 1 standing; panel 2 standing and looking straight at the viewer (eyes centred); panels 3 and 4 two walking steps; panel 5 hanging with both hands raised above his head (they hold an umbrella the game draws separately — paint NO umbrella); panel 6 falling, arms flung up and out, legs bent out with the feet up; panel 7 his terminal-velocity pose, legs stretched long and straight, eyes big round goggles (the game turns this one upside down); panel 8 cheering, both arms thrown up in a V; panel 9 squashed flat and wide like a pancake after a hard landing.'
  },
  {
    id: 'pweeg-idle', group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — idle', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 0, fit: 'feet',
    anims: { idle: { frames: range(0, 15), fps: 6 } },
    blurb: `${PWEEG_IS}, standing still and breathing`, colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'A slow breathing loop: from panel 1 to panel 8 his head sinks a hair and his legs bend a hair; from 9 to 16 he rises back. Panels 13 and 14 are a blink — both eyes shut as short curved lines. Every other panel has the eyes open. Panel 16 must lead straight back into panel 1.'
  },
  {
    id: 'pweeg-walk', group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — walk cycle', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 0, fit: 'feet',
    anims: { walk: { frames: range(0, 15), fps: 0 } },
    blurb: `${PWEEG_IS}, walking to the right`, colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'One full walk cycle in 16 even steps: the two tube legs lift and swing alternately, the free arm swings opposite the legs, and the arm on his facing side stays forward (it holds a furled umbrella the game draws separately — paint NO umbrella). Panel 16 leads straight back into panel 1. His head stays the same size and at the same height band in every panel.'
  },
  {
    id: 'pweeg-hover', group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — hover under the umbrella', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 0, fit: 'feet',
    anims: { hover: { frames: range(0, 15), fps: 7.64 } },
    blurb: `${PWEEG_IS}, floating: both hands raised straight up above his head gripping a handle (the umbrella itself is painted separately — paint NO umbrella, the hands meet in the air), his legs dangling loose`,
    colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'A gentle dangle loop: the hands stay locked together at the same point above his head in every panel; only the legs swing a little left and right and back. Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'pweeg-fall', group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — falling (flail)', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 0, fit: 'feet',
    anims: { fall: { frames: range(0, 15), fps: 40.7 } },
    blurb: `${PWEEG_IS}, in free fall: both arms flung up and bent outward, legs bent down and out with the feet curled up, a startled look`,
    colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'A fast flail loop: the arms and feet wiggle out and back a little; the head does not move. Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'pweeg-terminal', group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — terminal velocity', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 1, fit: 'feet',
    anims: { terminal: { frames: range(0, 15), fps: 50.9 } },
    blurb: `${PWEEG_IS}, at terminal velocity: no arms showing, his two legs stretched long and straight below him, and his eyes two BIG round goggle eyes (white rings with a dot pupil) — pure panic. Paint him the way up the reference shows; the game turns him upside down`,
    colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'A fast shiver loop: the long legs tremble a little left and right; the head and goggle eyes stay put. Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'pweeg-cheer', group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — win dance', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 1, fit: 'feet',
    anims: { cheer: { frames: range(0, 15), fps: 0 } },
    blurb: `${PWEEG_IS}, cheering: both arms thrown up in a V, a happy bouncy dance`,
    colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'One hop of a happy dance: panels 1–4 he squashes down a little ready to jump, 5–12 he stretches tall at the top of the hop with the arms highest, 13–16 he comes back down and squashes again. The game moves him up and down and tilts him itself — keep his feet on the same line in every panel.'
  },
  {
    id: 'pweeg-flattened', group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — flattened (hard landing)', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE_WIDE, model: 'pweeg-model', tier: 1, fit: 'feet', gridCheck: 'nominal',
    anims: { squash: { frames: range(0, 5), fps: 75, loop: false }, flat: { frames: range(6, 15), fps: 12 } },
    blurb: `${PWEEG_IS}, squashed flat by a hard landing like a cartoon pancake`,
    colour: PWEEG_COLOUR, view: SIDE_VIEW, one: 'Pweeg',
    readPanels: 'Panels 1–6 are the squash: panel 1 is him standing, and each panel after it is wider and lower until panel 6 is a flat pancake more than twice his width with dizzy swirl eyes. Panels 7–16 are him lying flat as that pancake, wobbling a little wider and narrower, eyes dizzy. His feet line stays the same in every panel.'
  },
  {
    id: 'pweeg-destroyed', group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — destroyed (hit by an enemy / shredded)', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE_WIDE, model: 'pweeg-model', tier: 1, fit: 'none', fresh: true,
    anims: { poof: { frames: range(0, 15), fps: 24, loop: false } },
    blurb: `${PWEEG_IS}, the moment an enemy gets him: a cartoon "poof" — he is NEVER hurt or cut, he pops into a soft cloud puff like a cartoon knock-out`,
    colour: `${PWEEG_COLOUR}. The puff is the same warm white with lavender cel shadows; a few tiny golden stars`,
    view: 'a flat side view, the puff centred on where he stood. No perspective, no ground.', one: 'the puff',
    readPanels: 'Panels 1–3: Pweeg jolts, startled, eyes as two little crosses, squashing slightly. Panels 4–6: he pops — a round cloud puff bursts out where he was, growing. Panels 7–11: the puff is at its biggest, a cluster of round cloud balls with three or four tiny golden stars spinning around it. Panels 12–16: the puff breaks into fewer and SMALLER balls each panel; panel 16 holds only two tiny balls. Nothing is ever half-transparent: a fading puff shrinks and breaks apart.'
  },
  {
    id: 'pweeg-front', group: 'pweeg', doc: 'PROMPTS-CHARACTERS.md', title: 'Pweeg — looking at the player', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'pweeg-model', tier: 1, fit: 'feet',
    anims: { front: { frames: range(0, 11), fps: 6 }, blink: { frames: [12, 13], fps: 6 } },
    blurb: `${PWEEG_IS}, standing and looking straight out at the viewer, his two dot eyes centred on his head`,
    colour: PWEEG_COLOUR, view: 'he stands side-on like the reference, only his eyes look straight out at the viewer. No perspective, no ground.', one: 'Pweeg',
    readPanels: 'A slow breathing loop like his idle: the head sinks a hair from panel 1 to 8 and rises back by 16. Panels 13 and 14 are a blink — eyes shut as short curved lines. Eyes open and centred in every other panel.'
  },

  // ── Chad ──
  {
    id: 'chad-model', group: 'chad', doc: 'PROMPTS-CHARACTERS.md', title: 'Chad — character model sheet', use: 'model',
    cols: 3, rows: 3, box: FIGURE, anims: {}, tier: 2, fresh: true, fit: 'none', model: 'pweeg-model',
    blurb: `${CHAD_IS}. This is his MODEL SHEET, painted after Pweeg's: the body is Pweeg's body exactly (copy it from the first attached image), only the sunglasses and his cool attitude are his own`,
    colour: CHAD_COLOUR, view: SIDE_VIEW, one: 'Chad',
    readPanels: 'Panel 1 standing; panel 2 standing and facing the viewer; panels 3–6 four walking steps; panels 7 and 8 hanging with both hands raised above his head (they hold an umbrella the game draws separately — paint NO umbrella); panel 9 a slight knee-bend landing squash.'
  },
  {
    id: 'chad-idle', group: 'chad', doc: 'PROMPTS-CHARACTERS.md', title: 'Chad — idle', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'chad-model', tier: 2, fit: 'feet',
    anims: { idle: { frames: range(0, 15), fps: 6 } },
    blurb: `${CHAD_IS}, standing still, effortlessly cool`, colour: CHAD_COLOUR, view: SIDE_VIEW, one: 'Chad',
    readPanels: 'A slow breathing loop: from panel 1 to 8 his head sinks a hair; from 9 to 16 he rises back. The sunglasses never come off and never change. Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'chad-walk', group: 'chad', doc: 'PROMPTS-CHARACTERS.md', title: 'Chad — walk cycle', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'chad-model', tier: 2, fit: 'feet',
    anims: { walk: { frames: range(0, 15), fps: 0 } },
    blurb: `${CHAD_IS}, strolling to the right`, colour: CHAD_COLOUR, view: SIDE_VIEW, one: 'Chad',
    readPanels: 'One full walk cycle in 16 even steps, exactly like Pweeg\'s: the tube legs lift and swing alternately, the free arm swings, the facing-side arm stays forward (it holds a furled umbrella the game draws separately — paint NO umbrella). Panel 16 leads straight back into panel 1.'
  },
  {
    id: 'chad-hover', group: 'chad', doc: 'PROMPTS-CHARACTERS.md', title: 'Chad — float under the umbrella', use: 'sprite',
    cols: 4, rows: 4, box: FIGURE, model: 'chad-model', tier: 2, fit: 'feet',
    anims: { hover: { frames: range(0, 15), fps: 7.64 } },
    blurb: `${CHAD_IS}, floating relaxed: both hands raised straight up above his head gripping a handle (paint NO umbrella, the hands meet in the air), legs dangling loose`,
    colour: CHAD_COLOUR, view: SIDE_VIEW, one: 'Chad',
    readPanels: 'A gentle dangle loop: the hands stay locked at the same point above his head in every panel; only the legs swing a little. Panel 16 leads straight back into panel 1.'
  },

  // ── The umbrella ──
  {
    id: 'umbrella', group: 'umbrella', doc: 'PROMPTS-CHARACTERS.md', title: 'The umbrella — open, furled, broken', use: 'sprite',
    cols: 3, rows: 3, box: UMBRELLA, tier: 0, fit: 'none',
    anims: { open: { frames: [0, 1, 2, 1], fps: 6 }, furled: { frames: [4], fps: 0 }, broken: { frames: [6, 7, 8, 7], fps: 14 } },
    blurb: 'one umbrella in its three states, held at the grip of its curved J-handle (the J-hook is at the bottom of every panel, at the same spot): OPEN — a scalloped dome canopy with ribs, white panels and ONE red panel (second from the left), a small ball finial on top; FURLED — rolled up into a slim spike with a red wrap and the same ball tip; BROKEN — blown inside-out, the ribs splayed up and the torn panels flapping',
    colour: 'warm porcelain-white canopy panels with lavender-grey cel shadow, ONE tomato-red panel; a cream handle and shaft; rib tips plum-brown',
    view: 'a flat side view of the umbrella standing upright on its handle; no perspective, no tilt (the game tilts it).', one: 'this umbrella',
    readPanels: 'Row 1 (panels 1–3): the OPEN umbrella, its canopy breathing very slightly flatter from panel 1 to 3. Row 2 (panels 4–6): the FURLED umbrella, three identical copies. Row 3 (panels 7–9): the BROKEN umbrella inside-out, its torn panels flapping down, level, then up.'
  },

  // ── Enemies ──
  {
    id: 'walldorf-body', group: 'enemy', doc: 'PROMPTS-ENEMIES.md', title: 'Walldorf — body (three moods of pillar)', use: 'pillar',
    cols: 3, rows: 3, tier: 0, fit: 'none',
    anims: { deadly: { frames: [0, 3, 6], fps: 0 }, solid: { frames: [1, 4, 7], fps: 0 }, bounce: { frames: [2, 5, 8], fps: 0 } },
    blurb: 'Walldorf\'s body: three tall soft rounded pillars standing side by side, each exactly one panel wide and the full height of the image — a rounded top, straight sides, a rounded bottom. NO face, no eyes: the game paints his eyes on separately. Left pillar: the dangerous one, rosy red. Middle pillar: the harmless one, cool blue-grey stone. Right pillar: the bouncy bumper, warm orange with a springy pale rim running round just inside its outline',
    colour: 'left rosy red (around #ff5a5f), middle cool blue-grey (around #c3cde0), right warm orange (around #ffb020) — each with ONE cel shadow down its right side and a soft highlight down its left',
    view: 'flat front-on, straight up and down, no perspective.', one: 'the pillar',
    note: 'The game CUTS each pillar into three: its top cap (row 1), its middle (row 2) and its bottom cap (row 3), and STRETCHES the middle to any height. So the middle third of each pillar must be a plain straight section, exactly the same at its top edge as at its bottom edge — no cracks, spots, bands or features in it.',
    readPanels: 'Read it by COLUMN: each column is ONE pillar running from the top of the image to the bottom. Rows are not separate drawings.'
  },
  {
    id: 'walldorf-face', group: 'enemy', doc: 'PROMPTS-ENEMIES.md', title: 'Walldorf — face (calm, angry, charging, bump)', use: 'sprite',
    cols: 4, rows: 4, box: WALLDORF_FACE, tier: 0, fit: 'centre',
    anims: { calm: { frames: [0, 1], fps: 1.5 }, blink: { frames: [2, 3, 2], fps: 18, loop: false }, angry: { frames: [4, 5, 6, 7], fps: 6 }, charge: { frames: [8, 9, 10, 11], fps: 12 }, bump: { frames: [12, 13, 14, 15], fps: 16, loop: false } },
    blurb: 'Walldorf\'s FACE ONLY: two round eyes stacked one ABOVE the other (he is a tall pillar seen side-on, so his eyes sit on top of each other), each a white eyeball with a plum-brown outline and a dark pupil looking to the RIGHT. ONLY the eyes and, where shown, their brows — NO pillar, no body, no skin behind them: the game lays these eyes over his painted body',
    colour: 'white eyeballs with a lavender cel shadow, plum-brown pupils and outline, one tiny white glint per pupil; brows thick plum-brown',
    view: 'flat side-on, looking to the RIGHT. No perspective.', one: 'the pair of eyes',
    readPanels: 'Row 1 CALM: panels 1–2 plain open eyes (panel 2 a hair rounder), panel 3 half shut, panel 4 shut as two short lines. Row 2 ANGRY: the same eyes with thick brows slanting down toward the right, a little twitch from panel to panel. Row 3 CHARGING: angry brows and the eyes narrowed to a fierce squint. Row 4 BUMP: surprised — panel 13 the eyes wide and big, no brows, shrinking back to normal size by panel 16.'
  },
  {
    id: 'prickbait', group: 'enemy', doc: 'PROMPTS-ENEMIES.md', title: 'Prickbait — idle, move, lunge', use: 'sprite',
    cols: 4, rows: 4, box: PRICKBAIT, tier: 0, fit: 'centre',
    anims: { idle: { frames: range(0, 7), fps: 8 }, move: { frames: range(8, 11), fps: 10 }, lunge: { frames: range(12, 15), fps: 12 } },
    blurb: 'Prickbait, the floating mine: a round red body with six fat cone spikes around it, two angry slanted brows, and two round EMPTY white eyes — the eyes have NO pupils: the game draws the pupils so they can follow the player',
    colour: 'a rosy red body (around #ff5a5f) with a deeper red (#d93a40) for the spikes and the cel shadow; white eye whites; plum-brown brows and outline',
    view: 'flat front-on, no perspective.', one: 'Prickbait',
    note: 'The two eye whites sit at EXACTLY the same place and size in every panel (the game puts its pupils there) — only the spikes and the body outline move.',
    readPanels: 'Panels 1–8 IDLE: a slow menacing breath, the spikes growing a little longer up to panel 4 and back by panel 8. Panels 9–12 MOVE: drifting to the LEFT, the spikes swept back toward the right a little, the body squashed slightly in the direction of travel. Panels 13–16 LUNGE: puffed up, spikes long and sharp, brows angrier, panel 13 the biggest.'
  },

  // ── The ventilator ──
  {
    id: 'fan', group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Ventilator — housing, rotor, guard', use: 'sprite',
    cols: 2, rows: 2, box: FAN, tier: 1, fit: 'none', fresh: true,
    anims: { housing: { frames: [0], fps: 0 }, rotor: { frames: [1], fps: 0 }, guard: { frames: [2], fps: 0 }, rotor2: { frames: [3], fps: 0 } },
    blurb: 'a cosy old box fan in four separate parts the game stacks on top of each other: panel 1 the HOUSING — a chunky rounded-square box (it fills its panel to the reference\'s outline) with a deep dark round opening; panel 2 the ROTOR alone — four plump rounded red blades around a small hub, centred; panel 3 the front GUARD alone — a round wire grille (a few thin concentric rings and spokes) with a cream hub cap in the middle, see-through between the wires (magenta shows between them); panel 4 the same rotor as panel 2, turned 45 degrees',
    colour: 'housing a cosy slate blue-grey (#3a4256) with a near-black opening; rotor blades warning red (#ff5a5f) with a darker red cel shadow; guard wires and hub warm cream',
    view: 'flat front-on, square on, no perspective — the rotor and guard are centred exactly on the housing\'s opening.', one: 'the fan'
  },

  // ── The world ──
  {
    id: 'platform', group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Platform — nine-slice block', use: 'nine',
    cols: 3, rows: 3, tier: 0, fit: 'none', fresh: true, anims: {},
    blurb: 'ONE big soft rounded block that fills the WHOLE image edge to edge: a cosy chunk of warm cream sandstone with a thin cap of fresh mint-green moss along its top edge, softly rounded corners, a few gentle pebble dents',
    colour: 'warm cream sandstone (#efe6d2) with a lavender-grey cel shadow along the bottom, a fresh mint-green moss cap (#8fd6a0) on top, plum-brown outline',
    view: 'flat front-on, square on, no perspective.', one: 'the block',
    note: 'The game CUTS this block into a 3 × 3 grid: the four corners keep their size, and the edges and the middle are STRETCHED to any width and height (a ledge can be 30 times wider than it is tall). So: the rounding of each corner stays inside its own corner ninth; the middle third of every edge is a plain straight run that looks the same at both of its ends (no cracks, tufts or pebbles there); the centre ninth is plain sandstone with no feature at all.'
  },
  {
    id: 'platform-finish', group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Finish platform — nine-slice block', use: 'nine',
    cols: 3, rows: 3, tier: 0, fit: 'none', fresh: true, anims: {},
    blurb: 'ONE big soft rounded block that fills the WHOLE image edge to edge: the goal ledge — a cosy honey-gold stone block with a soft glowing warm top rim and a row of tiny painted stars along its top edge',
    colour: 'warm honey gold (#f2c14e) with an amber cel shadow along the bottom, a pale butter-yellow top rim, plum-brown outline',
    view: 'flat front-on, square on, no perspective.', one: 'the block',
    note: 'The game CUTS this block into a 3 × 3 grid: corners keep their size, edges and middle are STRETCHED to any size. The rounding of each corner stays inside its own corner ninth; the middle third of every edge is a plain straight run that looks the same at both ends (keep the little stars to the corner ninths); the centre ninth is plain and quiet — the game writes the word "Finish" over it, so draw NO letters yourself.'
  },
  {
    id: 'platform-switch', group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Switched platform — nine-slice block (tinted by the game)', use: 'nine',
    cols: 3, rows: 3, tier: 1, fit: 'none', fresh: true, anims: {},
    blurb: 'ONE big soft rounded block that fills the WHOLE image edge to edge: a light machine-panel block with a soft rounded bevel, a small round rivet in each corner',
    colour: 'a pale neutral light grey-white (#e8ecf2) with a mid-grey cel shadow and a plum-brown outline — NO colour of its own: the game tints it with the colour of the button that switches it',
    view: 'flat front-on, square on, no perspective.', one: 'the block',
    note: 'The game CUTS this block into a 3 × 3 grid: corners keep their size, edges and middle are STRETCHED to any size. The rounding and the rivets stay inside the corner ninths; the middle third of every edge is a plain straight run; the centre ninth is plain.'
  },
  {
    id: 'checkpoint', group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Checkpoint flag — waiting and reached', use: 'sprite',
    cols: 4, rows: 4, box: CHECKPOINT, tier: 1, fit: 'feet',
    anims: { idle: { frames: [0, 1, 2, 3], fps: 3 }, reached: { frames: range(4, 15), fps: 11.5 } },
    blurb: 'a small checkpoint flag on a slim cream pole, the flag a triangular pennant pointing RIGHT from the top of the pole',
    colour: 'waiting: a pale dusty grey-lilac pennant; reached: a fresh mint-green pennant (#4ade80) with one small cream star on it; pole warm cream, plum-brown outline',
    view: 'flat side view, the pole straight up, no perspective, no ground.', one: 'the flag',
    readPanels: 'Panels 1–4: WAITING — the grey pennant hanging almost still, the faintest sway. Panels 5–16: REACHED — the green pennant with its star, waving proudly in an even loop (its tip rising and falling), panel 16 leading back into panel 5. The pole never moves.'
  },
  {
    id: 'props', group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Props — floor button (up, pressed) and spikes', use: 'sprite',
    cols: 2, rows: 2, boxes: [BUTTON, BUTTON, SPIKE_BOX, SPIKE_BOX], tier: 0, fit: 'none',
    anims: { buttonUp: { frames: [0], fps: 0 }, buttonDown: { frames: [1], fps: 0 }, spikeA: { frames: [2], fps: 0 }, spikeB: { frames: [3], fps: 0 } },
    blurb: 'a SET of small props, one per panel: panel 1 a chunky floor push-button, raised — a rounded cap on a low dark base plate; panel 2 the same button pressed flat into its base; panels 3 and 4 two slightly different single spikes — a fat cartoon cone pointing straight up, standing on its base',
    colour: 'the button cap a pale neutral cream-white (the game tints it with its channel colour — paint it uncoloured), the base plate dark slate; the spikes a warning rosy red (#ff5a5f) with a deeper red cel shadow and one small glint',
    view: 'flat side view, no perspective, no ground.', one: 'the set'
  },
  {
    id: 'wind-wisps', group: 'fx', doc: 'PROMPTS-WORLD.md', title: 'Wind wisps — normal and super stream', use: 'sprite',
    cols: 4, rows: 4, box: WISP, tier: 0, fit: 'none', fresh: true,
    anims: { normal: { frames: range(0, 7), fps: 0 }, super: { frames: range(8, 15), fps: 0 } },
    blurb: 'sixteen separate hand-inked wisps of wind, the kind a storybook draws: each one a single flowing ribbon-stroke that swirls along to the RIGHT and ends in a small curl, some with a short second stroke riding beside it',
    colour: 'rows 1–2: pale sky-blue and white wisps (#cfe8ff); rows 3–4 (the super stream): warm apricot and peach wisps (#ffbe7a). Every stroke SOLID and opaque — the game makes them fade in and out itself',
    view: 'flat, every wisp flowing horizontally to the RIGHT.', one: 'the wind',
    readPanels: 'Each panel is ONE wisp, centred in its panel, about as long as the reference stroke: rows 1–2 eight different calm curls, rows 3–4 eight faster, longer, more streaked curls. They are not frames of a motion; they are sixteen variations.'
  }
]

export const sheetById = (id: string): SheetDef | undefined => SHEETS.find((s) => s.id === id)

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
