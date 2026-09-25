/**
 * ─── Promotion manifest — the art that goes OUTSIDE the game ────────────────
 *
 * A side step of the art pipeline (`scripts/art/art-promotion.mjs`, `pnpm
 * art:promotion`), and a side step on purpose: nothing here is a drawable. The
 * renderer never probes for any of it and the slicer never cuts it. These are
 * the images a PORTAL asks for — the cover tile on CrazyGames' grid, Poki's
 * landscape hero, Playgama's square, a portrait store poster — and they live in
 * `src/assets/promotion/` where a submission picks them up, not in `public/`
 * where a build would ship them to every player who never looks at them.
 *
 *   plate (the game's own painted cast, composited at the target aspect)
 *         → painter (the Art Desk's Gemini window, one generation per aspect)
 *         → master in `art-sheets/promotion/painted/`
 *         → every deliverable size cut from its OWN family's master
 *         → jpg + webp in `src/assets/promotion/`
 *
 * THREE RULES THIS FILE EXISTS TO HOLD:
 *
 * 1. NO TEXT, NO UI, NO LOGO in a cover. Every portal typesets the game's name
 *    over the art in its own type; a painted title crosses theirs and is the
 *    one thing that gets a cover sent back before anybody judges the art.
 *
 * 2. A DELIVERABLE IS ONLY EVER CUT FROM ITS OWN ASPECT. 1080x1920 is not a
 *    1920x1080 rotated and not a centre crop of one — the boss at the top of
 *    the tall frame is off the edge of the wide one. Each aspect FAMILY is
 *    painted once and every size in it is a resize, never a reframe.
 *
 * 3. THE PLATE IS THE FALLBACK. A family with no painting is still written,
 *    from its plate, so the folder is never half a folder.
 *
 * Loadable under plain Node (`scripts/art/ts-resolve.mjs`) like `artSheet.ts`:
 * no Vue, no `import.meta.env`.
 */

// ─── Shapes ─────────────────────────────────────────────────────────────────

export interface CoverSize {
  w: number
  h: number
}

/**
 * One sprite laid onto a plate.
 *
 * `size` is a fraction of the plate's SHORT side, so the same cast lands at the
 * same physical size whether the plate is lying down or standing up.
 */
export interface PlateLayer {
  /** Path under `public/` — a painted sprite the game already ships. */
  src: string
  /** Centre of the layer, as a fraction of the plate. */
  cx: number
  cy: number
  /** Width, as a fraction of the plate's short side. */
  size: number
  /** Degrees clockwise. */
  rotate?: number
  /** Mirror left-right — a walker faces left, and one on the left edge should
   *  face into the frame. */
  flip?: boolean
  /** 0..1. */
  opacity?: number
}

/**
 * A light trail behind a ball in flight, from its tail (x0, y0) to the ball
 * (x1, y1), as fractions of the plate. It tells the painter which way every
 * ball is travelling — a ball sprite alone is a round thing with no direction.
 */
export interface PlateStreak {
  x0: number
  y0: number
  x1: number
  y1: number
  /** Width at the ball end, as a fraction of the short side. */
  width: number
  color: string
}

export interface CoverAspect {
  /** `16x9` — the id everything keys on, and the plate's filename. */
  id: string
  label: string
  /** The plate handed to the painter. Its shape is what makes the return come
   *  back at this aspect: an image model follows the reference it is given far
   *  more reliably than a ratio written in words. */
  plate: CoverSize
  /** Every deliverable cut from this family's master. */
  sizes: CoverSize[]
  shape: 'landscape' | 'portrait' | 'tall' | 'square'
  /** Why this aspect exists, in the prompt's own words. */
  shot: string[]
}

// ─── The cast on a plate ────────────────────────────────────────────────────
//
// Built from what the game actually ships, so the painter restyles THIS cast
// rather than inventing some other ball game's.
//
// THE SAFE ZONES, measured off the live portal pages (Sep 2026) and binding on
// every layout below:
//   · the hero's face and the impact point sit inside the CENTRAL 60 % x 60 %;
//   · the TOP-LEFT corner stays empty — CrazyGames' Hot/New/Updated badge and
//     Poki's label ribbon both land there;
//   · the BOTTOM quarter is floor and trail-ends only — CrazyGames' hover
//     title bar covers the bottom ~30 %, Poki fades its title in down there;
//   · 16:9 keeps both subjects in the central 75 % of the width, so the same
//     master survives GameMonetize's 4:3 centre crop.
// And at most THREE readable characters (the hero, the boss, the volley as one
// soft group): more than three and a thumbnail's win rate falls off a cliff.

/** The board the fight happens on — the rune-stone field, cropped to its
 *  stones (the rune columns, the top fog and the launcher ledge are cut away)
 *  and blown up, so it is a quiet ground rather than a second subject. */
export const COVER_FLOOR = {
  src: 'images/backdrops/board-field.webp',
  crop: { x: 0.12, y: 0.16, w: 0.76, h: 0.56 }
}

/** The hero — tier 1, Magma Mote: the ball every player fires first and the
 *  one that sits on the launcher. Round, orange, flaming, with a face. */
const HERO = 'images/units/fighter-1.webp'
/** The villain — the blue slime, grown to boss size. It is the first monster
 *  every player meets, its blue is the exact complement of the hero's orange,
 *  and it is ONE round shape with two big eyes: at 94 px (Poki's grid) the
 *  cover has to read as two shapes and one colour clash. The slime-tower boss
 *  was tried first and its three stacked dot-faces turned to mush. */
const BOSS = 'enemies/slime2_256x256.webp'

/** The rest of the volley — the ice-crystal and storm-cloud balls, the same
 *  two in every family, because a portal shows its covers side by side and
 *  wants one scene across all of them. */
const ball = (tier: number, cx: number, cy: number, size: number, rotate = 0): PlateLayer =>
  ({ src: `images/units/fighter-${tier}.webp`, cx, cy, size, rotate })
const ICE_BALL = 4
const STORM_BALL = 30

/** A walker — background only, one per family, and never a fourth face. */
const walker = (file: string, cx: number, cy: number, size: number, flip = false, rotate = 0): PlateLayer =>
  ({ src: `enemies/${file}_256x256.webp`, cx, cy, size, flip, rotate })

const FIRE = '#ff8a1f'
const ICE = '#7fe3ff'
const STORM = '#ffe45c'

/**
 * LANDSCAPE — 16:9.
 *
 * The volley comes up out of the lower left and the boss looms right of
 * centre, so the one diagonal between them runs against the reading direction
 * and holds the eye inside the frame.
 */
const LANDSCAPE: PlateLayer[] = [
  walker('cyclops', 0.87, 0.6, 0.2, false, 6),
  { src: BOSS, cx: 0.67, cy: 0.42, size: 0.42 },
  ball(ICE_BALL, 0.2, 0.37, 0.12, -10),
  ball(STORM_BALL, 0.19, 0.64, 0.11, 8),
  { src: HERO, cx: 0.38, cy: 0.52, size: 0.6, rotate: -10 }
]
const LANDSCAPE_STREAKS: PlateStreak[] = [
  { x0: 0.06, y0: 1.02, x1: 0.38, y1: 0.52, width: 0.34, color: FIRE },
  { x0: -0.02, y0: 0.62, x1: 0.2, y1: 0.37, width: 0.08, color: ICE },
  { x0: -0.02, y0: 0.94, x1: 0.19, y1: 0.64, width: 0.07, color: STORM }
]

/**
 * PORTRAIT — 2:3.
 *
 * The way the game is actually played, stood up: the volley rises from the
 * bottom of the frame and the boss waits at the top. One vertical gesture,
 * read top to bottom, the hero about 40 % of the height.
 */
const PORTRAIT: PlateLayer[] = [
  walker('cyclops', 0.86, 0.46, 0.22, false, 4),
  { src: BOSS, cx: 0.55, cy: 0.255, size: 0.5 },
  ball(ICE_BALL, 0.2, 0.7, 0.15, -12),
  ball(STORM_BALL, 0.8, 0.74, 0.14, 10),
  { src: HERO, cx: 0.47, cy: 0.61, size: 0.62, rotate: -8 }
]
const PORTRAIT_STREAKS: PlateStreak[] = [
  { x0: 0.42, y0: 1.04, x1: 0.47, y1: 0.61, width: 0.34, color: FIRE },
  { x0: 0.3, y0: 1.04, x1: 0.2, y1: 0.7, width: 0.1, color: ICE },
  { x0: 0.64, y0: 1.06, x1: 0.8, y1: 0.74, width: 0.09, color: STORM }
]

/**
 * TALL — 9:16.
 *
 * The phone held upright: boss in the 15–40 % band, hero rising through
 * 45–75 %, the top eighth and the bottom quarter left to stone and trails, and
 * 15 % side margins, because a frame this narrow is cropped at the sides first.
 */
const TALL: PlateLayer[] = [
  walker('cyclops', 0.84, 0.47, 0.2, false, 4),
  { src: BOSS, cx: 0.55, cy: 0.265, size: 0.58 },
  ball(ICE_BALL, 0.28, 0.82, 0.15, -12),
  ball(STORM_BALL, 0.72, 0.86, 0.14, 10),
  { src: HERO, cx: 0.48, cy: 0.605, size: 0.7, rotate: -8 }
]
const TALL_STREAKS: PlateStreak[] = [
  { x0: 0.44, y0: 1.02, x1: 0.48, y1: 0.605, width: 0.4, color: FIRE },
  { x0: 0.34, y0: 1.04, x1: 0.28, y1: 0.82, width: 0.1, color: ICE },
  { x0: 0.62, y0: 1.06, x1: 0.72, y1: 0.86, width: 0.09, color: STORM }
]

/**
 * SQUARE — 1:1, the tile shown at 94 px on Poki's grid: two shapes and one
 * colour clash. The hero is as big as the square allows, just right of the
 * top-left badge; the boss is cropped by the upper right edge behind it; one
 * volley ball, and no walker at all.
 */
const SQUARE: PlateLayer[] = [
  { src: BOSS, cx: 0.8, cy: 0.26, size: 0.48 },
  ball(STORM_BALL, 0.16, 0.5, 0.12, 8),
  { src: HERO, cx: 0.47, cy: 0.6, size: 0.56, rotate: -10 }
]
const SQUARE_STREAKS: PlateStreak[] = [
  { x0: 0.08, y0: 1.06, x1: 0.47, y1: 0.6, width: 0.3, color: FIRE },
  { x0: -0.04, y0: 0.8, x1: 0.16, y1: 0.5, width: 0.08, color: STORM }
]

export const PLATE_LAYERS: Record<CoverAspect['shape'], PlateLayer[]> = {
  landscape: LANDSCAPE,
  portrait: PORTRAIT,
  tall: TALL,
  square: SQUARE
}

export const PLATE_STREAKS: Record<CoverAspect['shape'], PlateStreak[]> = {
  landscape: LANDSCAPE_STREAKS,
  portrait: PORTRAIT_STREAKS,
  tall: TALL_STREAKS,
  square: SQUARE_STREAKS
}

/**
 * Where the eye is meant to land: the gap between the hero and the boss, where
 * the impact is about to happen. The plate pools a warm glow here and darkens
 * the corners away from it, so it arrives at the painter already saying which
 * part of it is the picture.
 */
export const PLATE_FOCUS: Record<CoverAspect['shape'], { x: number; y: number }> = {
  landscape: { x: 0.5, y: 0.48 },
  portrait: { x: 0.51, y: 0.43 },
  tall: { x: 0.51, y: 0.42 },
  square: { x: 0.6, y: 0.44 }
}

// ─── The four families ──────────────────────────────────────────────────────
//
// Each plate is its family's largest deliverable or an exact multiple of it,
// so the cut from master to deliverable is a clean downscale. The free Gemini
// app returns about a megapixel whatever it is asked for (1376x768 for a 16:9
// plate), so the two big ones are a ~1.4x upscale, which a cover survives.

export const COVER_ASPECTS: CoverAspect[] = [
  {
    id: '16x9',
    label: '16:9 landscape',
    plate: { w: 1920, h: 1080 },
    sizes: [
      { w: 1920, h: 1080 },
      { w: 1280, h: 720 }
    ],
    shape: 'landscape',
    shot: [
      'A WIDE LANDSCAPE SHOT — the hero banner that runs full width at the top of a game page, and the',
      'tile in CrazyGames\' grid, shown there only 273 pixels wide. The hero fireball flies in from the',
      'lower left, left of centre; the giant slime looms right of centre; the diagonal between them is the',
      'whole picture. Both of them stay inside the middle three quarters of the width and between 12 % and',
      '75 % of the height, so the same picture survives being centre-cropped to 4:3. The extra width is',
      'for the volley trails and a soft, dark scatter of distant monsters — never for more faces.',
      // A wide frame tempted the first return into a small hero beside a huge
      // boss; at 273 px that fireball was the second thing seen, not the first.
      'THE HERO IS NOT SMALLER THAN THE BOSS. The fireball\'s body is at least half the frame\'s height —',
      'as big as the slime, closer to the camera and brighter than it. The extra width never shrinks it.'
    ]
  },
  {
    id: '9x16',
    label: '9:16 portrait',
    plate: { w: 1080, h: 1920 },
    sizes: [{ w: 1080, h: 1920 }],
    shape: 'tall',
    shot: [
      'A TALL PORTRAIT SHOT, the shape of a phone held upright — which is exactly how this game is played.',
      'Build it as ONE vertical gesture read from top to bottom: the giant slime in the band from 15 % to',
      '40 % of the height, the hero fireball rocketing straight UP at it through 45 %–75 %, and the rest',
      'of the volley rising behind it in a fan. The top eighth and the bottom quarter are only stone, glow',
      'and trail-ends; keep 15 % side margins clear. Do NOT lay the landscape composition on its side.'
    ]
  },
  {
    id: '2x3',
    label: '2:3 portrait',
    plate: { w: 1024, h: 1536 },
    sizes: [{ w: 800, h: 1200 }],
    shape: 'portrait',
    shot: [
      'A PORTRAIT POSTER, a little wider than a phone screen — CrazyGames\' portrait cover. The same',
      'vertical gesture as the tall shot, compressed: giant slime above, the hero fireball rising at it',
      'from below and about 40 % of the height, the volley fanning out behind. The bottom quarter is only',
      'stone, glow and trail-ends, and the top-left corner stays empty.'
    ]
  },
  {
    id: '1x1',
    label: '1:1 square',
    plate: { w: 1024, h: 1024 },
    sizes: [
      { w: 1024, h: 1024 },
      { w: 800, h: 800 },
      { w: 512, h: 512 }
    ],
    shape: 'square',
    shot: [
      'A SQUARE TILE — the one that sits in a grid of forty other squares and has to win, shown on Poki\'s',
      'grid as small as 94 pixels across. At that size it must read as TWO SHAPES AND ONE COLOUR CLASH:',
      'the orange fireball and the blue slime. Crop in HARDER than the wide shot: the hero\'s face is about',
      'half the square\'s height, just below and right of centre; the giant slime is big and partly cut',
      'off by the upper right edge behind it; one small volley ball, no walkers, no empty floor.'
    ]
  }
]

/** Every deliverable cover, flat, with the family it is cut from. */
export const coverDeliverables = (): Array<{ aspect: CoverAspect; size: CoverSize }> =>
  COVER_ASPECTS.flatMap((aspect) => aspect.sizes.map((size) => ({ aspect, size })))

/** jpg for the portals that still ask for one, webp for everything modern. */
export const COVER_FORMATS = ['jpg', 'webp'] as const
export type CoverFormat = (typeof COVER_FORMATS)[number]

/** `cover_1920x1080.jpg` — this folder's existing naming (`cover-logo_…` is
 *  the logo-carrying variant). The size is in the name because the thing on
 *  the other end of the folder is a file picker in a submission form. */
export const coverFile = (size: CoverSize, format: CoverFormat | string): string =>
  `cover_${size.w}x${size.h}.${format}`

/** The plate a family is painted from, and the stem its master is filed under. */
export const plateStem = (aspect: CoverAspect): string => `cover-${aspect.id}`

// ─── The prompt ─────────────────────────────────────────────────────────────

const DELIVERABLE = (a: CoverAspect): string[] => [
  'WHAT COMES BACK',
  `ONE finished piece of cover art, ${a.plate.w} x ${a.plate.h} pixels, exactly ${a.label}, filled edge to`,
  'edge. One single image and nothing else — not a sheet of options, not a grid, not two versions side',
  'by side, not a mock-up of a store page or a phone, not a poster with a border or a mount around it.',
  'The painting runs all the way to all four edges.'
]

/**
 * The exclusions — first block after the deliverable, and stated as facts
 * about the picture rather than as style notes, because "no UI" reads as a
 * preference and "there is no interface in this world" reads as a rule.
 */
const EXCLUSIONS = [
  'WHAT IS NOT IN IT',
  '· NO TEXT ANYWHERE. No title, no game name, no tagline, no caption, no number, no damage numbers,',
  '  no hit-point counts on the monsters, no rune that reads as a letter, no signature, no watermark,',
  '  no studio mark, no age rating. Every portal typesets the game\'s name over this art in its own type,',
  '  and a painted title crosses theirs — the most common reason a cover is sent back.',
  '· NO LOGO and no wordmark. The logo is a separate file delivered beside this one.',
  '· NO USER INTERFACE of any kind: no buttons, no score, no coin counter, no ball counter, no health',
  '  bar, no boss bar, no aiming line, no dotted trajectory, no tutorial hand, no arrows, no HUD panel,',
  '  no launcher pad, no phone or browser frame around the art. This is a scene, not a screenshot.',
  '· No border, no frame, no rounded corners, no drop shadow around the image itself, no letterboxing,',
  '  no bars. The art IS the whole rectangle.'
]

/** What the plate is, and what the painter is allowed to change about it. */
const READ_THE_PLATE = [
  'READ THE ATTACHED PLATE',
  'The attached image is a BLOCKING PLATE, not a painting to copy. Every creature in it is the game\'s',
  'own artwork, dropped in at the size and the place it belongs. Take from it, exactly:',
  '· WHO IS IN IT. The flaming orange ball with the angry face is the HERO. The big blue jelly slime is',
  '  the BOSS — the game\'s blue slime, grown giant. The small round creatures with faces — the',
  '  ice-crystal ball and the storm-cloud ball — are the rest of the VOLLEY the hero leads. The one-eyed',
  '  stone cyclops, where there is one, is a background monster. Keep these specific characters with',
  '  these silhouettes and these colours, the hero in exactly its default look; a player who has played',
  '  the game must recognise every one of them. Do not add creatures that are not in the plate.',
  '· WHERE THINGS ARE. The hero, the boss, the volley and the cyclops stay roughly where the plate puts',
  '  them, at roughly the size the plate gives them. The coloured streaks behind the balls are their',
  '  flight paths: every ball is travelling along its streak, toward the boss.',
  '· WHAT THE GROUND IS. The dark blue-violet stone slabs of the game\'s arena.',
  'Change everything else. The plate is stiff, evenly lit, flatly stacked and has no atmosphere at all',
  '— fixing that is the job. Give every creature a pose and a reaction, throw real fire-light across the',
  'stones, add the sparks, the flying stone chips, the motion and the depth.'
]

/**
 * The CTR block — marks a painter can check off, not "make it eye-catching".
 * Every line is a property of a thumbnail that survives being ~200 px wide in
 * a grid of forty others, which is the only place it is judged.
 */
const CLICKABLE = [
  'WHAT MAKES IT CLICKABLE — this is the whole job',
  'This image is judged at 94 to 273 pixels wide, for a fraction of a second, in a grid of forty other',
  'games. Everything below is about winning THAT glance, not about being a nice illustration at full size.',
  '· TWO FACES, ONE STORY. The hero fireball faces the VIEWER: V-shaped brows slammed down, wide fierce',
  '  eyes with bright white catchlights, and its mouth WIDE OPEN in a battle roar, teeth showing —',
  '  an open action mouth, never a closed smirk. The boss slime is the villain caught out: eyes HUGE',
  '  and round, pupils tiny, mouth a wide open "O" of panic, jelly wobbling, a drop of sweat flying off.',
  '  Comic panic, never horror. Those two faces are the first thing seen and the reason for the click.',
  '· AT MOST THREE READABLE CHARACTERS: the hero, the boss, and the volley as one soft secondary group.',
  '  Anything else — the cyclops, a far-off row of marching monsters — is a dark, soft, low-contrast',
  '  shape in the background that nobody reads as a face.',
  '· ONE SUBJECT, ENORMOUS. The hero and the boss together fill at least half the frame. The hero is',
  '  the closest, sharpest, most saturated thing in the image, with a rim light and a cast shadow',
  '  that lift it off the ground.',
  '· THE MOMENT IS THE ONE BEFORE. The hero has NOT hit yet — it is a hand\'s breadth from the boss, the',
  '  boss\'s jelly already lit orange by its heat. An impact already finished has no tension left.',
  '· MAXIMUM CONTRAST WHERE THE EYE LANDS. Blazing orange-gold fire directly against cool cyan-blue',
  '  jelly: the brightest, most saturated meeting of colours in the whole image happens exactly between',
  '  the hero and the boss, and nowhere else.',
  '· A BARRAGE, NOT ONE SHOT. Behind the hero the volley streams in along bright glowing light trails,',
  '  one of them with a sharp kink where the ball ricocheted off the stone. That is what the game is:',
  '  one pull, a whole volley of balls ricocheting through the monsters. No dotted aiming line.',
  '· EVERYTHING POINTS AT IT. The light trails, the sparks and the stone chips flung outward — every',
  '  line in the picture leads to the gap between the hero and the boss.',
  '· IT READS AT 94 PIXELS. Thick dark outlines, big flat areas of colour, no detail smaller than about',
  '  a thirtieth of the frame\'s width. Squint at it: it must still be an orange fireball with a roaring',
  '  face flying at a scared blue slime.',
  '· A SIMPLE BACKGROUND. The stone arena is lower in contrast than the characters and slightly soft,',
  '  darkening from the fire-lit centre toward deep blue-violet at the edges. The edges must NOT go',
  '  near-black (portal pages are near-black and the image would melt into them) and must NOT be mint or',
  '  pale cyan (other portal pages are mint): keep them a rich, visibly coloured deep indigo.',
  '· THE SAFE ZONES. The hero\'s face and the impact point sit inside the central 60 % of the width and',
  '  the height. The top-left corner is EMPTY stone (portals stamp a "new"/"hot" badge there). The',
  '  bottom quarter holds only stone, glow and trail-ends (portals lay the game\'s title bar over it).',
  '  Nothing important within an eighth of any edge.'
]

const CAMERA = [
  'THE CAMERA',
  'Looking at the game\'s arena almost head-on, the way it is played, but pushed IN close and tilted a',
  'few degrees for energy, so the hero fireball rushes toward the boss with real volume and perspective',
  '— slightly bigger than life, a little foreshortened. Not a flat diagram and not an eye-level side view.'
]

const PALETTE = [
  'COLOUR',
  'The game\'s own palette: blazing orange, gold and white-hot yellow for the hero\'s fire; cyan and',
  'bright sky-blue for the slime boss and the ice ball; electric yellow for the storm ball; deep blue-',
  'violet stone slabs with a faint teal glow in their cracks for the arena (no carved runes or glyphs —',
  'they read as lettering at thumbnail size); black ink contours on every',
  'character. Rich and saturated. No sepia, no desaturated wash, no grey fog over the subject.'
]

/** The game's house style (`artSheet.ts` STYLE) — MINUS its ground rule. A
 *  sprite must not bring its own shadow; a cover IS the ground, the light and
 *  the shadow out to its four edges, and without them it would be a cast of
 *  cut-outs floating over a texture, which is what the plate already is. */
const STYLE = [
  'STYLE',
  '· The game\'s own art direction: vibrant stylized cartoon with bold, clean BLACK ink outlines, flat',
  '  saturated colour with soft cel shading and one crisp glossy highlight on every character.',
  '· Chunky, readable silhouettes that still read at 200 px wide.',
  '· A finished key-art illustration, not a sprite sheet: real light, cast shadows on the stone, glow',
  '  spill from the fire and the ice, atmospheric sparks and embers.',
  'AVOID: photographic texture, 3D-render plastic gloss, airbrushed mush, thin or grey outlines, fine',
  'detail that turns to noise when the image is shown small, and any text, letters or numbers.'
]

/** A ready-to-paste prompt for one cover aspect. */
export const promptForCover = (a: CoverAspect): string => [
  ...DELIVERABLE(a),
  '',
  ...EXCLUSIONS,
  '',
  'WHAT IT IS',
  'Cover art for Elemental Barrage, a casual arcade game: you pull back and release a volley of cute',
  'elemental balls — each one a little creature with a face — that ricochet through rows of cartoon',
  'monsters marching down a rune-stone arena. The picture is the most exciting half-second the game has:',
  'the whole volley in flight, and the blazing fireball leading it an instant from smashing into the',
  'giant slime boss.',
  '',
  ...a.shot,
  '',
  ...READ_THE_PLATE,
  '',
  ...CLICKABLE,
  '',
  ...CAMERA,
  '',
  ...PALETTE,
  '',
  ...STYLE,
  '',
  'CHECK BEFORE YOU ANSWER',
  '· Is there a single letter, digit, logo or rune that reads as a letter anywhere? There must not be.',
  '· Is there a button, a bar, a counter, an aiming line or a frame anywhere? There must not be.',
  '· Does the painting reach all four edges with no border and no bars?',
  '· Are the hero\'s fierce face and the boss\'s panicked face the two biggest, brightest things in it?',
  '· Would you know what this game is about from a 200-pixel-wide copy?',
  '',
  'OUTPUT',
  `One image, ${a.plate.w} x ${a.plate.h} pixels, aspect ratio exactly ${a.label}, PNG if you can, JPEG`,
  'otherwise. No text, no logo, no interface, no border.'
].join('\n')

/**
 * `art-sheets/promotion/PROMPTS-PROMOTION.md` — one folder DOWN from the sheets
 * the Art Desk scans, and the folder is load-bearing: the desk turns every
 * block of `art-sheets/PROMPTS-*.md` into a job for the slicer, which would
 * refuse a cover and leave it in the folder it reads.
 */
export const promotionPromptDoc = (): string => [
  '# Promotion prompts — one cover per generation',
  '',
  'Generated from `src/game/promotionSheet.ts` — do not hand-edit, re-run',
  '`pnpm art:promotion --plates` instead.',
  '',
  'These are the images that go on a STORE PAGE, not into the game. Attach the',
  'plate named in the heading and paste the block beside it; drop the return in',
  '`art-sheets/promotion/painted/` under the same stem and run `pnpm',
  'art:promotion --no-generate`, which cuts every deliverable size out of it into',
  '`src/assets/promotion/`.',
  '',
  '`pnpm art:promotion` on its own does all of that including the painting — it',
  'drives the same signed-in Gemini window the Art Desk uses. This document is',
  'the hand route, and the record of what the automated one sends.',
  '',
  ...COVER_ASPECTS.map((a) => [
    `## ${a.id} — ${a.label}  (${plateStem(a)}.png)`,
    '',
    `Cuts ${a.sizes.map((s) => `${s.w}x${s.h}`).join(', ')} in ${COVER_FORMATS.join(' and ')}.`,
    '',
    '```text',
    promptForCover(a),
    '```',
    ''
  ].join('\n'))
].join('\n')
