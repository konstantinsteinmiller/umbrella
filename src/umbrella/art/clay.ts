// ─── The clay art set: "Rainy Day Post" (?art=clay, /umbrella/clay/) ─────────
//
// The art direction of moodboard concept 6 (/umbrella/art-moodboards/): a rainy-evening
// rooftop town modelled in PLASTICINE, like a stop-motion claymation set. Pweeg is a little
// white clay postman with a blue cap and a satchel. It is the SAME game as the normal one,
// like the lantern set (lantern.ts): every sheet keeps the kite manifest's id, lattice,
// registration box and animations, so paint.ts draws it unchanged; only the words differ.
//
// What the lantern set taught, applied from the first sheet:
//   · the model sheet is painted first and every other pose of a character is painted from ONE
//     figure cut out of it (`modelCard`): his clay, cap, face and size never change between
//     animations, so idle → walk → hover never pops;
//   · the walk is described panel by panel as one ordered stride;
//   · eyes the game animates are painted EMPTY (the mine) or have their pupils taken out after
//     slicing (the Walldorf face, scripts/art/walldorf-pupils.py --set clay);
//   · stretched parts (pillars, the gate's tube) state exact band lines;
//   · no lines, numbers or frames between panels.
//
// PURE: no DOM, no Vue, no `import.meta.env` (read by `pnpm art:prompts:clay`).
import { CHAD_COLOUR, CHAD_IS, EXTRA_SHEETS, PWEEG_COLOUR, PWEEG_IS, sheetById, type SheetDef } from './manifest'
import { block, buildIndex, paintOrder, promptFor, type Fit, type Look } from './prompts'

/** Where the clay sheets ship (only the clay build's glob, art/shipped-clay.ts, reaches it). */
export const CLAY_DIR = 'src/assets/umbrella-art-clay'
/** References, style sheets, the slicer's index and painted/ returns. */
export const CLAY_SHEETS_DIR = 'art-sheets/umbrella-clay'
/** Moodboard concept 6's panels, padded square (the style references). */
const STYLE_HERO = 'style/clay-hero.png'
const STYLE_WORLD = 'style/clay-world.png'
const STYLE_FOES = 'style/clay-foes.png'
const DOC = 'PROMPTS-CLAY.md'

const CLAY_IS = 'Pweeg, who in this art style is a little stop-motion CLAY POSTMAN modelled from soft white plasticine, exactly the clay figure of the attached concept art: one soft rounded body, a little wider at the bottom, with the round head flowing straight into it (no neck), two small black bead eyes and a tiny pressed-in mouth; a small blue postman cap with a stiff peak; a brown leather satchel on a strap worn across his chest from one shoulder to the opposite hip; short stubby rounded clay arms and two short stubby legs'
const CLAY_COLOUR = 'Pweeg is modelled from warm off-white plasticine (#f1ece2) with a soft grey-beige shadow (#c9c0b0) and faint thumbprint texture; the cap a deep postal blue (#2f5fa8) with a darker band; the satchel and its strap a warm saddle brown (#7a4a2a) with a brass buckle; the eyes small glossy black beads. He must read as a light, soft shape on a dusky blue-grey rainy evening'

/** The game cycles a sheet's panels at 6–50 fps: a face that changes from panel to panel flickers. */
const ONE_FACE = 'ONE FACE: his little bead-eyed face is IDENTICAL in every panel of this sheet — the expression this sheet describes (two calm black bead eyes if it names none). It never cycles through moods; only a blink, where READ THE PANELS asks for one, changes it.'
const SMALL = 'SMALL IN HIS PANEL: he is only about HALF a panel tall, exactly as small as the figure in the reference panel, with a wide empty magenta band above his head and below his feet. No part of him ever comes near the next panel: the panels are found by the empty magenta between them.'
const MODEL_FACE = 'THE SAME CHARACTER IN ALL NINE PANELS: the same soft rounded body shape and size, the same small black bead eyes and tiny mouth (only widened in surprise where a pose asks for it), the same blue cap and the same brown satchel on its strap — the stretched-out falling pose and the squashed landing pose included. No panel is a different-looking creature.'
const KIT = 'HIS KIT NEVER CHANGES: the blue cap sits on his head and the brown satchel hangs on its strap at his hip in EVERY panel, the same size and the same colour; the cap never falls off, the satchel never swaps sides.'

/** A figure sheet (Pweeg or Chad) in clay. Every non-model sheet is painted from one figure of the model. */
const figure = (id: string, is: [string, string], colour: [string, string], extra: Partial<SheetDef> = {}, face = true): SheetDef => {
  const s = sheetById(id)!
  return {
    ...s,
    doc: DOC,
    styleRef: STYLE_HERO,
    fresh: true,
    // A model sheet keeps his kit and his face in all nine poses too: its first figure is cut out
    // for every later sheet, and its other panels are his reference for each pose.
    ...(s.use === 'model' ? { note: `${KIT}\n${MODEL_FACE}` } : { modelCard: true, note: [face ? ONE_FACE : '', KIT, SMALL].filter(Boolean).join('\n') }),
    blurb: s.blurb.replace(is[0], is[1]),
    colour: s.colour === colour[0] ? colour[1] : s.colour.replace(colour[0], colour[1]),
    ...extra
  }
}
const pweeg = (id: string, extra: Partial<SheetDef> = {}, face = true): SheetDef => figure(id, [PWEEG_IS, CLAY_IS], [PWEEG_COLOUR, CLAY_COLOUR], extra, face)

const CLAY_CHAD_IS = 'Chad, Pweeg\'s cool friend: EXACTLY the same little white clay postman as Pweeg (the same soft rounded body, blue cap and brown satchel — copy him from the attached figure) wearing a pair of black clay rounded-rectangle sunglasses with one small white glint'
const CLAY_CHAD_COLOUR = 'Chad is modelled from the same warm off-white plasticine as Pweeg (#f1ece2, grey-beige shadow #c9c0b0), with the same blue cap and brown satchel; his sunglasses are glossy black clay with a single white glint'
const chad = (id: string, extra: Partial<SheetDef> = {}): SheetDef => figure(id, [CHAD_IS, CLAY_CHAD_IS], [CHAD_COLOUR, CLAY_CHAD_COLOUR], extra)

const foe = (id: string, extra: Partial<SheetDef>): SheetDef => ({ ...sheetById(id)!, doc: DOC, styleRef: STYLE_FOES, fresh: true, ...extra })
const world = (id: string, extra: Partial<SheetDef>): SheetDef => ({ ...sheetById(id)!, doc: DOC, styleRef: STYLE_WORLD, ...extra })
const extraSheet = (id: string, extra: Partial<SheetDef>): SheetDef => ({ ...EXTRA_SHEETS.find((s) => s.id === id)!, doc: DOC, styleRef: STYLE_WORLD, ...extra })

const WALK = 'ONE walk cycle, played in order from panel 1 to panel 16 and round again: neighbouring panels differ only a LITTLE — legs and arms move by small even steps, never jumping. Panel 1: his front foot forward and his back foot behind, the widest stride. Panels 2, 3 and 4: the legs swing toward each other, a little more each panel. Panel 5: the legs together under him, passing, the back foot lifted a little. Panels 6, 7 and 8: that foot swings on forward, a little more each panel. Panel 9: the widest stride again with the feet swapped. Panels 10 to 16 do the same the other way, step by step, so panel 16 leads straight back into panel 1. His arms swing opposite to his legs by the same small steps; the satchel bobs a little. His head stays level at the same height in every panel, looking straight ahead to the right — never tilted up or down. EVERY panel is a side view facing right; none faces the viewer or stands with its feet together except the passing panels 5 and 13.'

export const CLAY_SHEETS: SheetDef[] = [
  pweeg('pweeg-model', {
    title: 'Pweeg (clay postman) — character model sheet',
    blurb: `${CLAY_IS}. This is his MODEL SHEET: the one picture every later animation of him is painted from. He is the concept art's clay postman, copied faithfully — the same soft white body, bead eyes, blue cap and brown satchel — only posed like the layout reference`
  }),
  pweeg('pweeg-idle'),
  pweeg('pweeg-walk', { readPanels: WALK }),
  pweeg('pweeg-hover', {
    blurb: `${CLAY_IS}, floating calmly with a small content smile: both arms raised straight up above his head and BOTH HANDS TOGETHER, gripping one single handle at one point (the umbrella itself is painted separately — paint NO umbrella; the two hands meet in the air, touching, never apart), his legs dangling loose`
  }),
  pweeg('pweeg-fall', {
    readPanels: 'A fast flail loop of ONE pose: in all 16 panels he is UPRIGHT, head at the top in exactly the same place, body straight below it — never rotated, tilted, upside-down, tumbling or lying down (the game tips him itself). Both arms flung up and out, legs bent out, a startled face; from panel to panel ONLY the arms and feet wiggle a little out and back. Panel 16 leads straight back into panel 1.'
  }),
  pweeg('pweeg-terminal', {
    blurb: `${CLAY_IS}, at terminal velocity: no arms showing, his two legs stretched long and straight below him, pure panic in his face — his two bead eyes opened WIDE into big round staring eyes (white with a small black pupil, pressed INTO his clay face). He wears NOTHING on his face: no glasses, no goggles, no rims. Paint him the way up the reference shows; the game turns him upside down`,
    readPanels: 'A fast shiver loop: the long legs tremble a little left and right; the head and the wide eyes stay put. Panel 16 leads straight back into panel 1. NO arms in any panel: the body sits straight on the two long legs, exactly as the reference shows.'
  }),
  pweeg('pweeg-cheer', { gridCheck: 'nominal' }),
  pweeg('pweeg-flattened', { blurb: `${CLAY_IS}, squashed flat by a hard landing like a pancake of soft clay, his cap squashed on top` }, false),
  pweeg('pweeg-destroyed', {
    blurb: `${CLAY_IS}, the moment an enemy gets him: a cartoon "poof" — he is NEVER hurt or cut, he pops into a soft puff of little white clay balls, his blue cap and a few paper letters flying out of the satchel`
  }, false),
  pweeg('pweeg-front'),
  // Chad's model is painted from Pweeg's one cut-out figure, not his whole model sheet (whose other
  // panels can carry stray props a painter copies).
  chad('chad-model', {
    modelCard: true,
    blurb: `${CLAY_CHAD_IS}. This is his MODEL SHEET, painted after Pweeg's: his body is Pweeg's body exactly (copy it from the attached figure of Pweeg), only the sunglasses and his cool attitude are his own`
  }),
  chad('chad-idle'),
  chad('chad-walk', { readPanels: WALK }),
  chad('chad-hover', {
    blurb: `${CLAY_CHAD_IS}, floating relaxed: both arms raised straight up above his head and BOTH HANDS TOGETHER gripping one single handle at one point (paint NO umbrella; the two hands meet in the air, touching), legs dangling loose`
  }),
  {
    ...sheetById('umbrella')!,
    doc: DOC,
    styleRef: STYLE_HERO,
    title: 'The umbrella — open, furled, broken (clay)',
    blurb: 'one red-and-white striped umbrella in its three states, exactly the umbrella of the attached concept art, modelled in plasticine and held at its curved wooden crook handle (the crook is at the bottom of every panel, at the same spot as the reference\'s J-hook): OPEN — a rounded dome canopy of eight panels alternating tomato red and creamy white, a small knob on top; FURLED — rolled shut into a slim tapering clay roll of red and white with a little strap; BROKEN — blown inside-out, the panels torn and flapping up',
    colour: 'tomato-red plasticine (#d8423a) and creamy white (#f3ece0) panels with soft clay shading, a warm brown wooden crook and shaft (#6a4128). The broken one is the SAME red and white — never pink',
    readPanels: 'Row 1 (panels 1–3): the OPEN umbrella, THREE NEAR-IDENTICAL COPIES of one umbrella — the same dome, the same stripes and the same handle; only the canopy\'s height changes by a hair. The game cycles these three panels, so a different design in any one of them flickers. Row 2 (panels 4–6): the FURLED umbrella, three identical copies. Row 3 (panels 7–9): the BROKEN umbrella inside-out, its torn panels flapping down, level, then up. The crook handle is the same in all nine panels.',
    one: 'this umbrella'
  },
  world('platform', {
    title: 'Rooftop ledge — nine-slice block',
    blurb: 'ONE big soft-cornered block that fills the WHOLE image edge to edge: a rooftop ledge from the clay town — a thick capping of smooth slate-grey clay stone along the top, under it rows of little clay bricks in muted grey-brown, the mortar lines pressed in. A ledge is SAFE to stand on, so it holds NO red, rust or orange anywhere: in this game red means deadly',
    colour: 'a slate-grey clay coping (#8e949c) with a lighter top edge, muted grey-brown clay bricks below (#7d6f66) with paler mortar (#b7ada2) — calm and cool, clearly lighter than the dusky sky — no red, no orange'
  }),
  world('platform-finish', {
    title: 'Finish ledge — nine-slice block (under the doorstep)',
    blurb: 'ONE big soft-cornered block that fills the WHOLE image edge to edge: a sandstone doorstep block in clay, pale honey-beige stone with soft rounded edges and a few pressed-in chisel lines. It is the goal, not a hazard: NO red anywhere (red means deadly in this game)',
    colour: 'pale honey-beige clay stone (#d8c3a0) with a warm tan shadow (#ad9670) — no red',
    note: 'The game CUTS this block into a 3 × 3 grid: corners keep their size, edges and middle are STRETCHED. The middle third of every edge is a plain straight run; the centre ninth is plain stone with no feature — draw NO letters.'
  }),
  world('platform-switch', {
    title: 'Switched block — nine-slice (tinted by the game)',
    blurb: 'ONE big soft-cornered block that fills the WHOLE image edge to edge: a block of smooth pale plasticine with a soft rounded bevel along its edges and a small round clay rivet in each corner (it appears and disappears when a button is pressed). THE WHOLE PICTURE IS THIS ONE PLAIN BLOCK AND NOTHING ELSE: no scene, no characters, no chimneys, no currents, no umbrellas, no buttons, no collectibles — the concept art only shows the clay finish to copy, none of its objects',
    colour: 'a pale neutral light grey-white clay (#e8ecf2) with a soft grey shadow — NO colour of its own: the game tints it with the colour of the button that switches it'
  }),
  world('checkpoint', {
    title: 'Checkpoint flag — waiting and reached (clay)',
    fresh: true,
    blurb: 'a small checkpoint: a thin grey clay pole standing straight up with a small triangular pennant flag at its top, flying to the RIGHT, exactly like the little flags of the attached concept art',
    colour: 'waiting: a pale grey flag (#c7c9cc), limp; reached: a bright mustard-yellow clay flag (#f1b72f) waving; pole a cool grey (#8e949c)',
    readPanels: 'Panels 1–4 (the whole TOP ROW, and only the top row): WAITING — the grey flag hanging almost still, the faintest sway. Panels 5–16: REACHED — the yellow flag waving in an even loop, panel 16 leading back into panel 5. Paint NO numbers, labels, lines or frames on the sheet: only the sixteen flags on one unbroken magenta ground. The pole never moves, and the flag is the same size in every panel.'
  }),
  world('props', {
    title: 'Props — floor button (up, pressed) and iron fence spikes',
    fresh: true,
    blurb: 'a SET of small props, one per panel: panel 1 a chunky round clay floor push-button, raised — a domed clay cap on a low dark grey base ring, exactly like the round buttons along the bottom of the attached concept art; panel 2 the same button pressed flat into its base; panels 3 and 4 two slightly different single spikes — a rust-red wrought-iron fence spear point (an arrowhead on a short bar) pointing straight up, standing on its base',
    colour: 'the button cap a pale neutral off-white clay (the game tints it with its channel colour — paint it uncoloured), the base ring dark grey (#4a4f57); the spikes rust-red clay iron (#9a3a2e) with a darker shadow'
  }),
  foe('walldorf-body', {
    title: 'Walldorf — body (three clay chimneys)',
    blurb: 'Walldorf\'s body: three tall clay chimney-stack spirits standing side by side, each exactly one panel wide and the full height of the image, straight sides top to bottom. NO face, no eyes, no mouth: the game puts his face on separately. Left: the DEADLY one, a red clay stove-pipe — smooth brick-red clay with a dark iron cap ring at its top and a dark iron base ring at its bottom. Middle: the SOLID one, a grey brick chimney — little grey clay bricks with pressed-in mortar lines, a slab cap on top. Right: the BOUNCY one, a soft column of glossy translucent amber jelly-clay with a rounded top and bottom. THE COLOURED BLOCKS IN THE LAYOUT REFERENCE ARE THE PILLARS THEMSELVES, not backgrounds: each pillar covers its block exactly, and everything around the three pillars is flat magenta',
    colour: 'left brick-red clay (#b8432f) with dark iron rings (#3a3a40), middle grey clay bricks (#8e949c) with paler mortar, right glossy amber (#e89a2a) — each with a soft shadow down its right side and a light edge down its left',
    note: 'The game CUTS each pillar into three: its top cap (row 1), its middle (row 2) and its bottom cap (row 3), and STRETCHES the middle to any height. So the rings, the slab and the rounded ends stay in the top and bottom thirds; the middle third of each pillar is a plain straight stretch, exactly the same at its top edge as at its bottom edge. THE BAND LINES ARE EXACT: on a 1024 px image every cap, ring and rounded end ends above y = 320 and the bottom ones start below y = 705; nothing at all crosses y = 341 or y = 683 but the pillar\'s two straight sides. All three pillars are the SAME width, the full width of their panel, from top to bottom: no cap or ring sticking out wider than the shaft.'
  }),
  foe('walldorf-face', {
    title: 'Walldorf — clay face (calm, angry, charging, bump)',
    blurb: 'Walldorf\'s FACE ONLY: two round googly eyes stacked one ABOVE the other (he is a tall chimney seen side-on, so his eyes sit on top of each other), each a white clay ball with a black clay pupil looking to the RIGHT, and a small clay mouth beside the lower eye — a friendly smile when calm, a grumpy frown when angry. ONLY the eyes, brows and mouth, floating on the flat magenta ground — NO chimney, no body, no head, no disc, no plate, no blob of clay behind or around them: magenta shows right up to the edge of each eye. The game lays this face over his body',
    colour: 'white clay eyeballs (#f6f3ec) with a soft grey shadow, glossy black clay pupils, one tiny white glint per pupil; brows thick dark brown clay rolls (#3a2a24)'
  }),
  foe('prickbait', {
    title: 'Prickbait — spiky clay mine',
    blurb: 'Prickbait, the floating mine: an angry round ball of dark crimson clay covered in SHORT SHARP clay cone spikes all over (like the spiky ball of the attached concept art), and two round EMPTY white clay eyes — the eyes have NO pupils, and there are NO brows: the game draws the pupils and the brows so they can follow the player',
    colour: 'a dark crimson clay body (#8e2234) with a lighter red lit side (#b83a48), the spikes the same crimson with paler tips; white clay eye whites',
    readPanels: 'It is ONE animation of ONE mine, and the panels play one after another: neighbouring panels differ only a LITTLE. Every panel has the SAME spikes all round the ball — never missing on one side, never shrunk to stubs — and the same two empty white eyes in the same place, with NO pupils and NO brows in any panel. Panels 1–8 PASSIVE: a slow breath, mouth closed; the spikes ease a little longer up to panel 4 and back by panel 8. Panels 9–12 MOVE: the same mine, the round body squashed a little wider and lower; nothing else changes. Panels 13–16 AGGRESSIVE, all four of them: puffed up a little bigger with a wide open mouth of little pointed clay teeth under the eyes, the spikes a little longer, and the eyes STILL empty white with no pupils and no brows.'
  }),
  foe('fan', {
    title: 'Chimney fan — ring, rotor, hub',
    blurb: 'a spinning chimney FAN, exactly like the round fan of the attached concept art, in four separate parts the game stacks on top of each other: panel 1 the RING alone — a chunky round wrought-iron ring of grey clay with four short struts, its inside EMPTY (flat magenta: the scene shows through); panel 2 the ROTOR alone — four plump rounded red clay blades around the centre, no ring; panel 3 the HUB alone — one small round grey clay hub cap, centred; panel 4 the same rotor as panel 2, turned 45 degrees',
    colour: 'the ring and the hub cool iron-grey clay (#6e737b) with a lighter top edge; the blades tomato-red clay (#d8423a) with a darker red shadow',
    one: 'the fan'
  }),
  extraSheet('collect', {
    title: 'Collectibles — stamp, umbrella, cloud, sparkle (gold clay)',
    blurb: 'a SET of four small golden treasures modelled in shiny gold clay, one per panel, centred, exactly like the gold collectibles of the attached concept art: panel 1 a square POSTAGE STAMP with a wavy perforated edge and a little crown pressed into its middle; panel 2 a small golden UMBRELLA, open, with a crook handle; panel 3 a puffy golden CLOUD of round bumps on a flat base; panel 4 a small four-pointed white-gold SPARKLE',
    colour: 'shiny gold clay (#f2c23a) with a warm light-gold highlight (#fff0a0) and a deeper amber shadow (#c98a0a); the sparkle white with a pale gold core'
  }),
  // The wind's painted swooshes (the game lays its own arrows and leaves around them).
  extraSheet('clay-wind', { designRef: 'designs/clay-wind-design.png' }),
  extraSheet('gate', {
    title: 'Warp pipe — rim, tube, base (three pieces)',
    shape: [
      'WHAT COMES BACK IS ONE WARP PIPE TAKEN APART INTO THREE SEPARATE PIECES, NOT A SCENE.',
      'One square image, 1024 x 1024 pixels, holding THREE separate pieces of one short fat green clay pipe, stacked one above the other with a clear band of flat magenta between each piece, exactly where the layout reference puts its three pieces: the TOP piece is the rim with its dark round mouth, the MIDDLE piece is a short section of plain straight tube, the BOTTOM piece is the base. The game puts them back together itself.',
      '· The pieces do NOT touch: magenta all the way across between the rim and the tube, and between the tube and the base.',
      '· Each piece is as wide as the reference draws it: the rim widest, nearly the full image width; the tube a little narrower; the base a little wider than the tube.'
    ],
    blurb: 'the WARP PIPE of the attached concept art, a fat glossy green clay pipe, in three pieces — TOP PIECE: the thick round rim of the pipe seen a little from above, its mouth a dark round opening with a faint swirl of light deep inside; MIDDLE PIECE: a short section of plain straight green tube, cut flat at its top and bottom, with nothing on it; BOTTOM PIECE: the pipe\'s base, a slightly wider dark-green collar',
    colour: 'glossy green clay (#2f9a4a) with a lighter lit side (#5cc070) and a darker shadow side (#1e6a32); the mouth near black-green inside',
    view: 'flat front-on, square on, no perspective — the rim seen just a little from above.',
    note: 'The game STRETCHES the middle piece to any height: it must be plain straight tube that looks the same along its whole height.',
    check: ['· THREE separate pieces, top to bottom: rim, plain tube section, base — magenta between them.', '· The rim is the widest piece; the tube section is plain green with nothing on it.']
  }),
  extraSheet('finish-dais', {
    title: 'Finish — the doorstep, the postbox, a flag and a bunting pennant',
    anims: { dais: { frames: [0], fps: 0 }, postbox: { frames: [1], fps: 0 }, flag: { frames: [2], fps: 0 }, bunting: { frames: [3], fps: 0 } },
    blurb: 'the FINISH, the post office\'s doorstep, as a SET of four separate clay pieces, one per panel, exactly in the clay style of the attached concept art — panel 1 the DOORSTEP alone: a wide flat slab of pale sandstone clay seen a little from above, with a woven brown doormat lying on its top (no letters on the mat); it spans the panel\'s whole width, and nothing stands on it or hangs from it; panel 2 the POSTBOX alone: a red clay pillar postbox standing upright with a dark letter slot and a rounded top, standing on the bottom of its panel; panel 3 ONE small flag alone: a thin grey pole with a small white triangular pennant at its top, flying to the right, the pole standing on the bottom of its panel; panel 4 ONE small bunting pennant: a little triangular cloth pennant hanging point-down from a short piece of string at the top middle of its panel',
    colour: 'the doorstep pale honey sandstone clay (#d8c3a0) with a tan shadow, the mat warm woven brown (#8a5a34); the postbox bright postal red clay (#c8302a) with a near-black slot; the flag white (#f3ece0) on a grey pole (#8e949c); the bunting mustard yellow (#f1b72f)',
    view: 'the doorstep seen a little from above (its top a flat slab); the postbox, flag and bunting flat front-on.',
    one: 'the finish',
    note: 'Paint NO lines, borders or dividers between the four panels: the magenta runs on unbroken from panel to panel. The game lays the doorstep across the finish platform, stands the postbox and the flag on it and hangs a row of bunting under its front edge: paint each piece alone.'
  })
]

export const claySheet = (id: string): SheetDef | undefined => CLAY_SHEETS.find((s) => s.id === id)

/** Cut by scripts/art/lantern-refs.py --set clay --cut, not by the slicer (one pipe in three pieces). */
export const UNSLICED = new Set(['gate'])

/** The slicer's index for the clay set: the kite index's entries for these sheets, shipped to CLAY_DIR. */
export const buildClayIndex = (fits: Record<string, Fit> = {}) => ({
  ...buildIndex(fits, CLAY_SHEETS.filter((s) => !UNSLICED.has(s.id)), CLAY_DIR),
  generator: 'src/umbrella/art/clay.ts'
})

/** One 16:9 painting the game draws behind the level (paint.ts `backdrop`), shipped as CLAY_DIR/backdrop.webp. */
export const BACKDROP = {
  id: 'backdrop',
  refs: ['style/clay-key.png', 'style/clay-scene.png'],
  prompt: [
    'WHAT COMES BACK IS ONE WIDE BACKGROUND PAINTING FOR A 2D GAME — the sky and the far town only, with NOTHING the player can touch.',
    'Use the attached images as the art-style reference: they are this game\'s approved RAINY DAY POST claymation concept art. Match their finish exactly — a stop-motion PLASTICINE model town, soft clay shapes with thumbprint texture, a misty rainy evening — and take NO characters, chimneys with faces, pipes, fans, currents, arrows, stamps or UI from them.',
    'THE PICTURE: a rainy evening over a little clay town, seen across the rooftops. A soft dusky blue-grey sky (#5d6b86 at the top, a little lighter and warmer toward the horizon) with low clay clouds; far rows of clay houses with pitched slate roofs and brick chimneys fading into the mist, warm yellow lit windows dotted among them; a washing line with a few clay clothes; thin streaks of falling rain. Nearer, along the BOTTOM sixth only, darker rooftops and chimney pots in silhouette.',
    'IT SITS BEHIND GAMEPLAY: keep the big middle of the picture calm, misty and low in contrast — soft far houses and clouds only, no big shapes, no bright spots, nothing red or amber large enough to look like a hazard (red means deadly in this game, amber means bouncy). Nothing that looks like a game object either: NO green pipes, no flags, no chimneys or pillars with faces, no fans, no buttons — the game puts those in the level itself, and a painted one would be mistaken for the real thing. The brightest things are the lit windows; even they stay softer than a foreground sprite.',
    'No text, no letters, no signature, no frame, no border, no vignette.',
    'OUTPUT: one landscape image, 16:9 (1920 × 1080), the whole frame painted edge to edge.'
  ].join('\n\n')
}

/** The clay style: tactile stop-motion plasticine, with a readable edge on every silhouette (a sprite
 *  is 48 px on a phone) and no photographic depth. */
export const CLAY_LOOK: Look = {
  head: 'STYLE — one art direction for the whole game: RAINY DAY POST, a stop-motion CLAYMATION look. Every object is modelled from soft plasticine, like a tiny handmade model set for a stop-motion film — exactly the finish of the attached concept art.',
  body: [
    '· Everything is clay: soft rounded forms, gently pressed edges, faint thumbprint and tool marks in every surface, a soft satin sheen. Never a flat vector fill, never paper, felt or hard plastic.',
    '· A clear dark edge around every silhouette: a thin soft dark line (#2a2630) along every outer edge, at its heaviest about 1.5% of the panel\'s shorter side. Hold the finished picture at thumbnail size: the shape must still read. Never a hairline.',
    '· Light: soft cool daylight from the upper left — ONE lit side, ONE soft shadow side and a small gentle highlight. No harsh 3D-render gloss, no photographic depth of field, no blur.',
    '· The palette of a rainy evening in a clay town: off-white and cream, postal blue, saddle brown, tomato red, mustard yellow, brick red, slate grey and moss green — rich and warm, never neon.',
    '· It is shown on a DUSKY BLUE-GREY rainy sky (#5d6b86): keep every shape light, warm or saturated enough to read against it.',
    '· AN OBJECT WITH NO FACE IS NOT AN EXCEPTION TO ANY OF THIS. A ledge, an umbrella or a fan is modelled and lit to exactly the same standard as the character.',
    'AVOID — this is exactly how repaints go wrong:',
    '· a photograph of a model: blurred bokeh, depth of field, a table, a studio backdrop, lens flare',
    '· raindrops, puddles, splashes or shadows painted onto a sprite or onto the magenta ground',
    '· thin, grey, broken or missing outlines; flat clip-art with no clay shading',
    '· fine detail that turns to mush when the sprite is shown small',
    '· text, letters, numbers, logos, signatures or watermarks anywhere — the concept art\'s captions and labels are NOT part of any sprite'
  ],
  styleSheet: (s) => `· The FIRST attached image is this game's approved RAINY DAY POST CLAYMATION CONCEPT ART. Copy its FINISH exactly: soft plasticine, thumbprint texture, soft daylight, its palette.${s.group === 'chad' ? ' Its little white clay postman is the DESIGN of Chad\'s body: Chad is that same clay figure wearing black clay sunglasses. He is NOT the round figure drawn in the layout reference: that only fixes each pose, his size in the panel and where his feet stand. Paint NO umbrella in his hands.' : s.group === 'pweeg' ? ' Its little white clay postman IS THE CHARACTER: copy his design EXACTLY — the soft rounded body, the bead eyes, the blue cap, the brown satchel. He is NOT the round figure drawn in the layout reference: that only fixes each pose, his size in the panel and where his feet stand. Paint NO umbrella in his hands.' : s.id === 'umbrella' ? ' Its red-and-white striped umbrella IS this umbrella: copy its design exactly.' : ' Where it shows this very thing, follow its design.'} Take NO layout, no scenery, no backdrop, no labels and no background colour from it.`
}

/** PROMPTS-CLAY.md: one block per sheet, model sheets first, then the backdrop. */
export const clayPromptDoc = (fits: Record<string, Fit> = {}): string => [
  '# Prompts — Umbrella clay art ("Rainy Day Post", ?art=clay)',
  '',
  'Generated from `src/umbrella/art/clay.ts` + `prompts.ts` by `pnpm art:prompts:clay`. Do not edit by hand — edit the manifest and regenerate.',
  '',
  `For each block: attach the images named in the heading's parenthesis IN THAT ORDER (from \`${CLAY_SHEETS_DIR}/\`: the concept \`style/…\` sheet first, then a \`cards/…\` figure, the layout reference LAST), then paste the text inside the fence. Paint pweeg-model and chad-model first, then cut their cards (\`python scripts/art/lantern-refs.py --set clay --cards\`). Save each return into \`${CLAY_SHEETS_DIR}/painted/\` under the reference's name, then \`pnpm art:slice:clay\`.`,
  '',
  ...paintOrder(CLAY_SHEETS).flatMap((s) => [block(promptFor(s, fits[s.id], CLAY_LOOK)), '']),
  block(`# Backdrop  (${BACKDROP.refs.join(' + ')} → backdrop.webp, converted by hand: not sliced)\n\n${BACKDROP.prompt}`),
  ''
].join('\n')
