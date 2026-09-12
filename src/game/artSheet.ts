/**
 * ─── The art manifest ───────────────────────────────────────────────────────
 *
 * Every drawable the painted-art layer can replace, and everything the art
 * pipeline needs to repaint it: what it is, how big its panel is, which way it
 * faces, where its reference comes from, where its return lands, and the TEXT
 * of the prompt that goes to the image model with it. One generator, one style
 * block, one background rule — per-asset words only where the asset genuinely
 * differs (art-generation-pipeline, PROMPT-ANATOMY.md).
 *
 * THIS GAME'S ROUTE THROUGH THE PIPELINE. Every slot already ships a painted
 * bitmap, and the SVG fallbacks in IngredientUnit / EnemyUnit are generic
 * shapes the paintings no longer resemble. So the REFERENCE for each drawable is
 * the bitmap that ships, laid on the magenta ground — a restyle / re-roll of
 * what exists, registered against its measured box so a repaint drops in at the
 * same size and place. A drawable with no bitmap falls back to its procedural
 * painter on the bench (the SVG), which is also what a new subject should be
 * drawn as first: a restyle of the old picture keeps the old subject.
 *
 * PURE: no Vue, no DOM, no `import.meta.env`. Read in the browser by the
 * `/art-sheets` bench and in plain Node by `pnpm art:prompts` (through
 * `scripts/art/ts-resolve.mjs`), and both must render byte-identical prompt
 * documents — the Art Desk sends what it parses back out of them.
 */
import { ART_PATHS, type ArtKey } from '@/game/artCatalogue'
import { INGREDIENTS, ELEMENTAL_FIRST_TIER, ELEMENTAL_LAST_TIER } from '@/game/ingredients'
import en from '@/i18n/locales/en'

export type ArtGroup = 'unit' | 'enemy' | 'boss' | 'projectile' | 'vfx' | 'spell' | 'world'
export type PromptDoc = 'PROMPTS-UNITS.md' | 'PROMPTS-ENEMIES.md' | 'PROMPTS-VFX.md' | 'PROMPTS-WORLD.md'

/**
 * Where the subject sits in ONE panel, as fractions of that panel, measured on
 * SOLID pixels (α > 140) so a soft glow is light rather than extent. For a
 * multi-panel sheet it is the union over every panel. The slicer registers a
 * return onto this box; the SIZE clause quotes it to the painter.
 */
export interface Fit { w: number; h: number; cx: number; cy: number; bottom: number }

export interface ArtDrawable {
  /** Reference file stem (`<id>.png` in art-sheets/) — also the Art Desk job. */
  id: string
  /** Catalogue keys this drawable feeds. Two only for the shared meteor bitmap. */
  keys: readonly ArtKey[]
  group: ArtGroup
  doc: PromptDoc
  title: string
  /** WHAT IT IS — what the reference DRAWS, never what the thing "is" besides. */
  blurb: string
  /** Colour identity: the hue that makes it THIS one, not a swatch to copy. */
  colour: string
  /** Facing / orientation clause. */
  view: string
  /** One panel, in the SHIPPED file's pixels. */
  panel: { w: number; h: number }
  cols: number
  rows: number
  /** The reference is drawn at this multiple of the shipped size so a 128 px
   *  panel reaches the model at 256. Fractions (the fit) do not care. */
  refScale: number
  /** `opaque` = a full-bleed backdrop: no key, no magenta, no trim. */
  bg: 'magenta' | 'opaque'
  /** Keep the shipped pixel size on a re-slice instead of the 256 px cap —
   *  only where the FILE NAME encodes the size or the sprite is shown larger
   *  than 256 device px (the gate). */
  exact?: boolean
  /** A tile that fills its box (the merge slot): registered INSIDE its box. */
  tight?: boolean
  /** READ THE PANELS, for cycles. */
  readPanels?: string
  /** Cut the nominal grid without measuring it — for impact sheets whose last
   *  panels are near-empty BY DESIGN and would read as a different grid. */
  gridCheck?: 'measure' | 'nominal'
  /** Extra per-asset lines, placed right after WHAT IT IS. */
  note?: string
  /** A NEW subject with no painting yet: the reference is the game's own
   *  placeholder drawing (`elementalArt.ts`), which fixes the design, and the
   *  prompt asks for the painted finish instead of a like-for-like repaint. */
  fresh?: boolean
  /** OUTPUT: the pixels to ask for, and the ratio to set in the tool. */
  output: { w: number; h: number; ratio: string }
}

// ─── The drawables ──────────────────────────────────────────────────────────

const codexName = (tier: number): string =>
  (en.battle.codex.names as Record<string, string>)[`t${tier}`] ?? `Tier ${tier}`

const SQUARE_OUT = { w: 1024, h: 1024, ratio: '1:1' }
const GRID_OUT = { w: 1536, h: 1536, ratio: '1:1' }

/** What each fighter tier's painting shows (the art, not the lore). */
const UNIT_BLURBS: Record<number, string> = {
  1: 'a round molten lava-rock ball with a furious face — angry brows, glowing yellow eyes, a snarling mouth — dark cracked crust over glowing orange magma, and flames licking up from both sides and the top',
  2: 'a white and ice-blue whirlwind: a spiralling tornado funnel with a frosty face in its upper half (glowing pale eyes, a small open mouth) and curls of frost vapour drifting off both sides',
  3: 'a squared, chunky brown boulder with an angry face — heavy brows, gritted teeth — and one stubby stone fist jutting out of its left side',
  4: 'a pale-blue faceted ice-crystal golem head with a jagged crystal crown, calm glowing eyes, and two blocky crystal fists at its lower corners',
  5: 'a living water droplet, glossy blue with a curling pointed top, a determined face, and two swirling water arms curling out to either side',
  6: 'a full-body rock golem of stacked grey-brown boulders, glowing orange eyes, heavy boulder arms and short stubby legs',
  7: 'an upright oval of swirling blue-violet cosmic nebula with a glowing face at its centre, held in a thin teal crystal rim, with luminous tendrils trailing from its lower sides',
  8: 'a creature of inky violet-black shadow smoke with a spiky crystal crown, glowing purple eyes, and wispy tendrils dripping from its lower edge',
  9: 'a round, buff golden chick with angry brows, a small orange beak, and muscular flexing wing-arms at its sides',
  10: 'a round fiery phoenix: orange-red flame feathers flaring out like a mane, fierce eyes, a small beak, and fiery claws at its sides',
  11: 'a hulking dark navy volcanic-rock demon with two curved horns, a small flame crest, glowing orange eyes, glowing lava cracks across its body, and two huge stone fists',
  12: 'a round pink bird-fairy with big glossy pink eyes, a tiny beak, a feather tuft on its head, and four translucent pink insect wings',
  13: 'a deep-blue water-drop sprite with a crescent-moon crest on its head, a calm, confident face, and two faceted blue crystal wings',
  14: 'a navy-blue owl with golden brow feathers, scaled blue-and-gold plumage dotted with little stars, and half-spread wings',
  15: 'a glossy black oil-drop creature with a mischievous grin and a bright reflective sheen, with splash droplets flying off it',
  16: 'a pale golden cherub chick with a glowing halo above its head, soft feathered wings spread wide, and a gentle face',
  17: 'a black obsidian crystal creature, crab-like, with jagged crystal plates, glowing teal eyes, spiky legs, and wisps of dark smoke',
  18: 'a small beige bird-moth with a stern face, between two large butterfly wings patterned in blue, yellow and black',
  19: 'a glowing faceted crystal orb with a swirling cosmic spiral eye at its centre and crackling blue lightning tendrils around it',
  20: 'a pale cream, feathered owl-elf with big pointed ears, round amber eyes, soft feather tufts on its head, and a plump feathered body',
  // The elemental tiers — each blurb describes the placeholder drawing in
  // `elementalArt.ts`, which is the reference these are painted from.
  21: 'a floating riveted steel sphere-knight: a polished steel orb with a dark visor band across its face and two glowing cyan eye slits, a small fin on top, a row of rivets along its lower seam, two floating steel gauntlets at its sides, and a cyan thruster flame beneath it instead of legs',
  22: 'a living drop of liquid mercury: a mirror-chrome teardrop with a curling tip on top, reflective silver bands, a smug half-lidded face, a drip hanging from its underside and little chrome droplets floating around it',
  23: 'a horseshoe-magnet creature resting on its thick red bend, its two arms rising like horns capped with silver pole tips, a dashed cyan field arc between the tips, a small iron shard floating in the gap, and a fierce face on the bend',
  24: 'a glossy translucent blob of honey-coloured amber with a small dark fossil beetle trapped inside it, a smug face, and a drop of honey dripping from its underside',
  25: 'a sand djinn: a round sandy head with a swirled sand turban and a turquoise gem, two small sand arms, and a spiralling tail of sand instead of legs curling down to a point at the lower left, with sand grains flying around it',
  26: 'a round glass potion flask with a cork stopper, filled with bubbling neon-green acid, a grinning face showing through the glass, and green acid droplets floating beside it',
  27: 'a ball of twisted green vines ringed with pale thorns, two leaves and a glowing golden seed on its crown, a fierce face in the middle of the vines, and a single vine tendril trailing down instead of legs',
  28: 'a soft peach-coral sea-anemone creature with a frilled wavy lower edge, a crown of branching orange coral on its head, a grinning face, a few dangling tentacle tips below, and bubbles rising around it',
  29: 'a mushroom creature: a big violet cap covered in glowing cyan spots over a stubby cream stem that is its body, a calm closed-eyed smiling face on the stem, root tendrils dangling below instead of legs, and glowing spores drifting around',
  30: 'a dark blue-grey storm cloud with a furious face, forked yellow lightning bolts hanging below it instead of legs, and a few blue raindrops',
  31: 'a carved green jade sphere with a gold filigree band across its lower half and a gold spiral emblem on its brow, a serene closed-eyed smile, two jade rings with holes floating at its sides, and a small red tassel hanging below it',
  32: 'a floating grey-blue standing stone carved with three glowing cyan runes on its lower half, two glowing cyan eyes near its rounded top, a thin crack, and small rock chips drifting beneath it',
  33: 'a clockwork creature: a big brass cogwheel whose centre is an ivory clock face with a fierce face on it and hour ticks round the rim, two small brass cogs floating beside it, and a brass pendulum hanging below instead of legs',
  34: 'a creature folded from paper: a pointed paper body of flat white and cream facets with crisp creases, a red fold at its tip, two folded paper fins at its sides, a red paper streamer for a tail, and a fierce face on its front',
  35: 'a big iridescent soap bubble with a grinning face floating inside it, a rainbow sheen along its lower edge, a white window reflection at its top left, and two small bubbles floating beside it',
  36: 'a glitching neon cube: cyan front, pale top, violet side, a faint pixel grid, a blocky pixel face with square eyes, yellow and cyan glitch slices shifted across it, and loose pixels trailing below it',
  37: 'a bronze bell with a grinning face, a ring on top to hang from, its clapper dangling below the rim instead of legs, and curved sound-wave arcs pulsing at both sides',
  38: 'an iron lantern with a ring on top, glowing teal glass panes and a pale blue ghost flame inside it with a fierce little face, a soft teal glow around it and a wisp trailing from its base',
  39: 'an ornate lilac-silver hand mirror: a turquoise gem on top of the oval frame, small scrolls at its sides, a shining pale-blue glass that shows a smug face, and the handle tapering down to a turquoise bead instead of legs, with sparkles around it',
  40: 'a heart-shaped faceted ruby with light facet lines, a small gold crown floating above the dip of the heart, a fierce face, and white sparkles',
  41: 'a flame that burns cold: an ice-blue flame with a white-hot core, two smaller flame tongues at its sides, a fierce face in the core, snowflakes floating around it, and a wisp for a tail',
  42: 'a brilliant-cut diamond, crown up and point down, pale white-blue with facet lines and small peach, yellow and mint glints in its facets, a fierce face in its upper facets, and small diamond shards orbiting it',
  43: 'a white-hot violet plasma ball with a fierce face, inside a tilted gold containment ring that passes behind it and in front of it, with small white lightning arcs crackling off it',
  44: 'an icy comet: a round pale-blue icy head at the upper right with a fierce face, streaming a long glowing white-blue tail down to the lower left',
  45: 'a curtain of aurora light shaped into a spirit: a wavy ribbon glowing violet at the top, teal in the middle and green below, faint white light streaks through it, a calm smiling face near the top, and a scalloped, fading lower hem',
  46: 'a blazing sun: a golden disc with a big grin, ringed by two rows of pointed flame rays, one flame flare looping off its brow, and a couple of faint sunspots',
  47: 'a plump golden five-pointed star with a grin, two ribbons of lilac stardust trailing below it instead of legs, and small twinkles around it',
  48: 'a small, blindingly bright pale-blue star core with a fierce little face, spinning inside two crossed violet rings, with light beams shooting straight up and down from it',
  49: 'a shapeless mass of inky violet-black dark matter, rim-lit in violet, with swirling violet wisps inside it, glowing lilac eyes, small dark rocks caught in orbit around it, and a faint thin halo ring behind it',
  50: 'a black hole: a perfectly black sphere with two burning orange eyes, a thin bright ring on its edge, and a blazing orange-white accretion disk tilted around it, passing behind the sphere and in front of it'
}

/** Hue identity for the tiers that live off the extrapolation helpers (12+). */
const UNIT_COLOURS_HIGH: Record<number, string> = {
  12: 'candy pink body, paler pink wings, magenta-pink eyes',
  13: 'deep royal blue with lighter sky-blue crystal wings and a pale moon crest',
  14: 'navy blue plumage with gold trim, gold brows, small white stars',
  15: 'glossy jet black with white and pale-blue reflections',
  16: 'pale gold and cream feathers, a warm yellow halo',
  17: 'black and dark slate crystal with teal glowing eyes',
  18: 'beige body; wings in sky blue, sunny yellow and black',
  19: 'cyan and violet crystal facets, a teal-white spiral, electric blue sparks',
  20: 'cream and warm beige feathers, amber eyes',
  21: 'polished steel greys, a near-black visor, cyan eyes and thruster',
  22: 'mirror-chrome silver with white reflections',
  23: 'magnet red, silver pole tips, a cyan field line',
  24: 'honey amber orange, a dark brown fossil',
  25: 'warm desert-sand tan, a turquoise gem',
  26: 'neon lime-green acid in clear pale-blue glass, a brown cork',
  27: 'deep leaf-green vines, pale bone thorns, a golden seed',
  28: 'a soft peach-coral body, an orange coral crown',
  29: 'a violet cap with glowing cyan spots, a cream stem',
  30: 'dark slate-blue storm cloud, bright yellow lightning',
  31: 'jade green, gold filigree, a red tassel',
  32: 'cool blue-grey stone, glowing cyan runes',
  33: 'polished brass, an ivory clock face',
  34: 'white and cream paper, red folds',
  35: 'a clear iridescent film: pale blue with pink and yellow sheen',
  36: 'neon cyan, electric violet, yellow glitch slices',
  37: 'warm bronze and gold',
  38: 'dark iron, glowing teal glass, a pale blue ghost flame',
  39: 'a lilac-silver frame, pale blue glass, a turquoise gem',
  40: 'deep ruby red with pink glints, a gold crown',
  41: 'ice-blue and white flame',
  42: 'clear white-blue diamond with rainbow glints',
  43: 'violet and white plasma, a gold ring',
  44: 'pale icy blue and white',
  45: 'violet, teal and green aurora light',
  46: 'golden yellow and fiery orange',
  47: 'a golden yellow star, lilac stardust',
  48: 'white and pale blue light, violet rings',
  49: 'inky violet-black, violet rim light',
  50: 'pure black, a blazing orange and white-gold disk'
}

const unitColour = (tier: number): string => {
  const ing = INGREDIENTS[tier - 1]
  if (ing) return `body around ${ing.body}, highlights ${ing.bodyLight}, accents ${ing.accent}, glow ${ing.glow}`
  return UNIT_COLOURS_HIGH[tier] ?? 'the colours of the reference'
}

const BADGE_NOTE = 'The game paints its own round tier badge over the BOTTOM-RIGHT corner (about a quarter of the width), so keep that corner free of the face and of any important detail. Draw no number or badge yourself.'
const FLOAT_NOTE = 'It is a NEW fighter that has never been painted: the reference is the game\'s own placeholder drawing of it. It FLOATS — no legs and no feet; its lower edge ends exactly as the reference draws it (a tail, trail, drip, flame or dangling part), because the game bobs and squashes the whole sprite and nothing may look like it stands on the ground.'

const UNITS: ArtDrawable[] = Array.from({ length: ELEMENTAL_LAST_TIER }, (_, i) => {
  const tier = i + 1
  const fresh = tier >= ELEMENTAL_FIRST_TIER
  return {
    id: `unit-fighter-${tier}`,
    keys: [`fighter-${tier}` as ArtKey],
    group: 'unit',
    doc: 'PROMPTS-UNITS.md',
    title: `Fighter tier ${tier} — ${codexName(tier)}`,
    blurb: UNIT_BLURBS[tier]!,
    colour: unitColour(tier),
    view: 'front-on, like the reference. If it turns at all it turns toward the RIGHT — the army marches right.',
    panel: { w: 256, h: 256 },
    cols: 1,
    rows: 1,
    refScale: 2,
    bg: 'magenta',
    note: fresh ? `${FLOAT_NOTE} ${BADGE_NOTE}` : BADGE_NOTE,
    fresh,
    output: SQUARE_OUT
  }
})

interface Creature { key: ArtKey; id: string; title: string; blurb: string; colour: string; view?: string; boss?: boolean }

const CREATURES: Creature[] = [
  { key: 'enemy-slime', id: 'enemy-slime', title: 'Enemy — slime', blurb: 'a glossy sky-blue slime blob with two big black oval eyes and a soft, dripping lower edge', colour: 'sky blue with white gloss highlights and a deep-blue shadow side' },
  { key: 'enemy-slime-alt', id: 'enemy-slime-alt', title: 'Enemy — slime (caterpillar variant)', blurb: 'a chunky green segmented caterpillar: a blocky head at the LEFT end with angry eyes, and three rounded body segments trailing off to the right', colour: 'fresh leaf green with a darker green shadow side', view: 'side-on, head on the LEFT — it crawls left toward the gate.' },
  { key: 'enemy-runner', id: 'enemy-runner', title: 'Enemy — runner (goblin)', blurb: 'an olive-green goblin with huge pointed ears, a grumpy frown, bright yellow eyes and a small stocky body', colour: 'olive green skin, yellow eyes, a brown loincloth' },
  { key: 'enemy-brute', id: 'enemy-brute', title: 'Enemy — brute (stone cyclops)', blurb: 'a grey stone cyclops golem: one big eye, a single horn on its head, a cracked boulder body and heavy stone arms', colour: 'warm grey stone with darker cracks' },
  { key: 'enemy-spitter', id: 'enemy-spitter', title: 'Enemy — spitter (centaur)', blurb: 'a muscular bald centaur — a tanned human torso on a brown horse body — standing with his arms at his sides', colour: 'tanned skin, chestnut-brown horse body, dark hooves', view: 'side-on, FACING RIGHT exactly like the reference. The game mirrors this one sprite, so do NOT flip it.' },
  { key: 'enemy-warlock', id: 'enemy-warlock', title: 'Enemy — warlock (dryad)', blurb: 'a tree dryad: a calm face of green leaves and bark, a crown of leaves with bare antler-like branches, a vine-wrapped bark body and one small pink flower', colour: 'leaf green, warm bark brown, one pink flower' },
  { key: 'boss-slime-tower', id: 'boss-slime-tower', title: 'Boss wave 5 — slime tower', blurb: 'a tall stack of glossy sky-blue slime in three drooping tiers, dotted with black oval eyes, dripping at every edge', colour: 'sky blue with white gloss highlights', boss: true },
  { key: 'boss-orc', id: 'boss-orc', title: 'Boss wave 10 — orc', blurb: 'a huge green orc head and shoulders: two short horns, jutting lower tusks, a scowling brow and a thick neck', colour: 'moss green skin, ivory tusks and horns', boss: true },
  { key: 'boss-fire-dragon', id: 'boss-fire-dragon', title: 'Boss wave 15 — fire dragon', blurb: 'a red serpentine dragon coiled into a tight spiral, horned head raised, small wings, and flames sprouting along its back', colour: 'scarlet scales, orange belly plates, yellow-orange flames', boss: true },
  { key: 'boss-troll', id: 'boss-troll', title: 'Boss wave 20 — troll', blurb: 'a green, muscular troll bust: bared tusks, small horns, a furious brow, a massive bare chest and huge arms', colour: 'deep green skin, ivory tusks', boss: true },
  { key: 'boss-worm', id: 'boss-worm', title: 'Boss wave 25 — worm', blurb: 'a brown burrowing worm: a thick coiled segmented body, and a furious face with heavy brows on its raised upper segment', colour: 'earthy ochre brown with darker segment rings', boss: true },
  { key: 'boss-silver-dragon', id: 'boss-silver-dragon', title: 'Boss wave 30 — silver dragon', blurb: 'a silver-scaled serpentine dragon coiled in a spiral, horned head raised', colour: 'silver and blue-steel scales, pale belly plates', boss: true }
]

const ENEMIES: ArtDrawable[] = CREATURES.map((c) => ({
  id: c.id,
  keys: [c.key],
  group: c.boss ? 'boss' : 'enemy',
  doc: 'PROMPTS-ENEMIES.md',
  title: c.title,
  blurb: c.blurb,
  colour: c.colour,
  view: c.view ?? 'front-on, like the reference. If it turns at all it turns toward the LEFT — enemies march left, toward the gate.',
  panel: { w: 256, h: 256 },
  cols: 1,
  rows: 1,
  refScale: 2,
  bg: 'magenta',
  note: c.boss
    ? 'It is a BOSS: the game draws it at more than twice a normal enemy\'s size, so it has to read as heavy and dangerous — but it is still this one creature, not a scene.'
    : undefined,
  output: SQUARE_OUT
}))

const single = (d: Omit<ArtDrawable, 'cols' | 'rows' | 'bg' | 'output'> & Partial<Pick<ArtDrawable, 'output'>>): ArtDrawable => ({
  cols: 1, rows: 1, bg: 'magenta', output: SQUARE_OUT, ...d
})

const PROJECTILES: ArtDrawable[] = [
  single({ id: 'proj-fire', keys: ['proj-fire'], group: 'projectile', doc: 'PROMPTS-VFX.md', title: 'Projectile — fire', blurb: 'a fireball: a dark cracked lava-rock core with glowing orange seams, wrapped in flame that trails DOWNWARD behind it', colour: 'black-red rock, orange-yellow flame', view: 'pointing straight UP (north): it flies upward, its flame trails downward. The game rotates it to face its flight.', panel: { w: 128, h: 128 }, refScale: 2 }),
  single({ id: 'proj-ice', keys: ['proj-ice'], group: 'projectile', doc: 'PROMPTS-VFX.md', title: 'Projectile — ice', blurb: 'a sharp icicle shard of translucent pale blue ice with a few frost crystals at its base', colour: 'pale ice blue with white highlights', view: 'point straight UP (north). The game rotates it to face its flight.', panel: { w: 128, h: 128 }, refScale: 2 }),
  single({ id: 'proj-stone', keys: ['proj-stone'], group: 'projectile', doc: 'PROMPTS-VFX.md', title: 'Projectile — stone', blurb: 'a rough, lumpy grey boulder chunk with cracks and chipped edges', colour: 'warm grey stone', view: 'as the reference; it tumbles, so no side is the front.', panel: { w: 128, h: 128 }, refScale: 2 }),
  single({ id: 'proj-shadow', keys: ['proj-shadow'], group: 'projectile', doc: 'PROMPTS-VFX.md', title: 'Projectile — shadow', blurb: 'a dark violet shadow-crystal shard with wisps of black smoke along its sides', colour: 'deep violet crystal, black smoke', view: 'point straight UP (north). The game rotates it to face its flight.', panel: { w: 128, h: 128 }, refScale: 2 })
]

const FLIGHT_PANELS = 'All 9 panels are the SAME projectile in flight, pointing UP, as one looping flicker: its core is identical in every panel and only the flames / wisps / sparkles shift a little from panel to panel, so the loop shimmers. Read left to right along the top row, then the middle row, then the bottom. Panel 9 must lead straight back into panel 1 — no panel is a different pose, and none is a burst.'

const IMPACT_PANELS = 'Panel 1 is the projectile at the instant it lands — whole, the same object as the flight sprite. Panels 2 and 3: it cracks and bursts open. Panels 4 to 6: its fragments fly outward and a cloud blooms. Panels 7 and 8: the fragments shrink and the cloud thins. Panel 9 is only a faint scatter of specks, almost empty — that near-empty last panel is correct, do NOT fill it. Read left to right along the top row, then the middle row, then the bottom.'

const grid = (d: Omit<ArtDrawable, 'cols' | 'rows' | 'bg' | 'output' | 'panel' | 'refScale' | 'group' | 'doc'>): ArtDrawable => ({
  ...d, group: 'vfx', doc: 'PROMPTS-VFX.md', cols: 3, rows: 3, bg: 'magenta',
  panel: { w: 128, h: 128 }, refScale: 2, output: GRID_OUT
})

const VFX: ArtDrawable[] = [
  grid({ id: 'vfx-proj-anim-fire', keys: ['proj-anim-fire'], title: 'Fire projectile — flight loop (3×3)', blurb: 'a fireball in flight: a dark lava-rock core in a mantle of flame that trails DOWNWARD', colour: 'black-red rock, orange-yellow flame', view: 'pointing straight UP (north) in every panel.', readPanels: FLIGHT_PANELS }),
  grid({ id: 'vfx-proj-anim-wind', keys: ['proj-anim-wind'], title: 'Wind projectile — flight loop (3×3)', blurb: 'a swirling ball of wind: pale blue-white cloud curls spiralling up into a pointed tip', colour: 'pale sky blue and white', view: 'pointing straight UP (north) in every panel.', readPanels: FLIGHT_PANELS }),
  grid({ id: 'vfx-proj-anim-cosmic', keys: ['proj-anim-cosmic'], title: 'Cosmic projectile — flight loop (3×3)', blurb: 'a cosmic orb in flight: a teardrop of swirling blue-violet nebula with a bright star at its heart, pale silver wisps around it and tendrils trailing below', colour: 'indigo and teal nebula, a white-cyan star, silver wisps', view: 'pointing straight UP (north) in every panel.', readPanels: FLIGHT_PANELS }),
  grid({ id: 'vfx-impact-fire', keys: ['impact-fire'], title: 'Fire impact burst (3×3)', blurb: 'a fireball\'s impact: the lava-rock core bursts into glowing chunks and flame, then a peach-orange smoke cloud blooms and fades', colour: 'black-red rock chunks, orange flame, peach smoke', view: 'front-on; the burst spreads evenly from the panel centre.', readPanels: IMPACT_PANELS, gridCheck: 'nominal' }),
  grid({ id: 'vfx-impact-ice', keys: ['impact-ice'], title: 'Ice impact burst (3×3)', blurb: 'an ice impact: the icicle splits into pairs of crystal shards flaring outward, then shatters into a frosty white burst that fades', colour: 'pale ice blue, white frost', view: 'front-on; the burst spreads evenly from the panel centre.', readPanels: IMPACT_PANELS, gridCheck: 'nominal' }),
  grid({ id: 'vfx-impact-wind', keys: ['impact-wind'], title: 'Wind impact burst (3×3)', blurb: 'a wind impact: the wind ball flattens into a disc of cloud, bursts into a ring of puffs, then scatters into small drifting wisps', colour: 'pale sky blue and white', view: 'front-on; the burst spreads evenly from the panel centre.', readPanels: IMPACT_PANELS, gridCheck: 'nominal' }),
  grid({ id: 'vfx-impact-stone', keys: ['impact-stone'], title: 'Stone impact burst (3×3)', blurb: 'a stone impact: the boulder cracks apart, grey chunks and dust burst outward, then the dust settles into a pale haze', colour: 'warm grey stone, pale beige dust', view: 'front-on; the burst spreads evenly from the panel centre.', readPanels: IMPACT_PANELS, gridCheck: 'nominal' }),
  grid({ id: 'vfx-impact-cosmic', keys: ['impact-cosmic'], title: 'Cosmic impact burst (3×3)', blurb: 'a cosmic impact: the nebula orb unravels, its swirl breaking into glittering fragments that scatter into a fading field of silver specks', colour: 'indigo and teal nebula, silver specks', view: 'front-on; the burst spreads evenly from the panel centre.', readPanels: IMPACT_PANELS, gridCheck: 'nominal' }),
  grid({ id: 'vfx-impact-shadow', keys: ['impact-shadow'], title: 'Shadow impact burst (3×3)', blurb: 'a shadow impact: the dark crystal cracks open into lilac fragments and black shards that scatter into a fading haze of specks', colour: 'deep violet, lilac, black', view: 'front-on; the burst spreads evenly from the panel centre.', readPanels: IMPACT_PANELS, gridCheck: 'nominal' })
]

const SPELLS: ArtDrawable[] = [
  single({ id: 'spell-meteor', keys: ['vfx-meteor', 'meteor-button'], group: 'spell', doc: 'PROMPTS-VFX.md', title: 'Meteor Storm — meteor (button icon + falling meteor)', blurb: 'a flaming meteor: a dark cracked lava-rock ball with glowing orange seams inside a large swirling mantle of flame that sweeps up and to the right', colour: 'black-red rock, orange-yellow flame', view: 'as the reference — the meteor falls toward the bottom-left, its flame sweeping up behind it.', panel: { w: 256, h: 256 }, refScale: 2, note: 'One file, two uses: the ultimate\'s button icon and every meteor falling in the storm. It has to read at button size.' }),
  single({ id: 'spell-heal', keys: ['spell-heal'], group: 'spell', doc: 'PROMPTS-VFX.md', title: 'Spell icon — Heal', blurb: 'a glossy mint-green bubble orb with a raised lime-green plus sign in its centre and a few small bubbles inside', colour: 'mint and lime green with white gloss', view: 'front-on, perfectly upright.', panel: { w: 128, h: 128 }, refScale: 2, note: 'A button icon, shown small: one clear symbol, bold, centred.' }),
  single({ id: 'spell-revive', keys: ['spell-revive'], group: 'spell', doc: 'PROMPTS-VFX.md', title: 'Spell icon — Revive Guard', blurb: 'a small golden emblem: a cream badge with a gold cross between two spread golden-white wings', colour: 'gold, cream and warm white', view: 'front-on, perfectly upright and symmetrical.', panel: { w: 128, h: 128 }, refScale: 2, note: 'A button icon, shown small: one clear symbol, bold, centred. It is wide and short, like the reference — do not stretch it to fill the square.' }),
  single({ id: 'spell-defender', keys: ['spell-defender'], group: 'spell', doc: 'PROMPTS-VFX.md', title: 'Spell icon — Defender (shield crest)', blurb: 'an ornate shield crest: a carved dark-stone and gold frame topped by a lion\'s head, framing a swirling teal portal, with small chains at its sides', colour: 'dark slate stone, gold trim, teal glow', view: 'front-on, perfectly upright and symmetrical.', panel: { w: 256, h: 256 }, refScale: 2, note: 'Used as a button icon AND drawn over a promoted tank unit at 60% of its size, so it must read at both.' }),
  // Arena skills, slots 5–8. Their references are the procedural SkillIcon
  // drawings (no bitmap ships yet) — so each blurb describes that drawing.
  single({ id: 'spell-warcry', keys: ['spell-warcry'], group: 'spell', doc: 'PROMPTS-VFX.md', title: 'Spell icon — Warcry of the Legion', blurb: 'a curved ivory war horn with two gold bands, its gold mouthpiece at the bottom-left and its flared dark bell at the upper-right, blasting three curved red-orange and amber shockwave arcs out of the bell, over a soft crimson glow', colour: 'ivory horn, gold bands, red-orange and amber shockwaves, a crimson glow', view: 'as the reference: the horn sweeps from the bottom-left up to the top-right, bell and shockwaves at the upper-right.', panel: { w: 128, h: 128 }, refScale: 2, note: 'A button icon, shown small: one clear symbol, bold, centred. It is the army\'s battle roar — loud, hot, red and gold.' }),
  single({ id: 'spell-legion', keys: ['spell-legion'], group: 'spell', doc: 'PROMPTS-VFX.md', title: 'Spell icon — Legion Call', blurb: 'three ghostly pale-cyan crested warrior helmets with dark T-shaped visor slits and glowing eyes, rising out of a round cyan portal seen at a slant — the middle helmet larger and in front, the other two behind it to either side — with thin wisps of light drifting up', colour: 'pale cyan and white spectral glow, a deep teal portal with a bright cyan rim', view: 'front-on and symmetrical, the portal flat across the bottom.', panel: { w: 128, h: 128 }, refScale: 2, note: 'A button icon, shown small. The helmets are spirits, not metal: translucent light with dark visor slits.' }),
  single({ id: 'spell-execute', keys: ['spell-execute'], group: 'spell', doc: 'PROMPTS-VFX.md', title: 'Spell icon — Executioner\'s Mark', blurb: 'a bone-white skull with glowing red eyes, centred inside a crimson targeting ring that has four inward tick marks and four small diamond runes between them, over a dark blood-red glow', colour: 'bone white, crimson red, a deep blood-red glow', view: 'front-on, perfectly upright and symmetrical.', panel: { w: 128, h: 128 }, refScale: 2, note: 'A button icon, shown small: a mark of death. The ring stays a clean circle; the skull reads first.' }),
  single({ id: 'spell-pact', keys: ['spell-pact'], group: 'spell', doc: 'PROMPTS-VFX.md', title: 'Spell icon — Soul Pact', blurb: 'two tall soul flames leaning toward each other — a violet one on the left and a golden one on the right, each with a pale inner core — a white four-pointed spark where their tips meet, and a violet and a gold chain link joined together beneath them', colour: 'violet and lilac, amber gold, a white spark', view: 'front-on and mirror-symmetrical.', panel: { w: 128, h: 128 }, refScale: 2, note: 'A button icon, shown small: two souls bound into one — the pact that twins a champion by consuming another.' }),
  single({ id: 'prop-revive-wings', keys: ['revive-wings'], group: 'spell', doc: 'PROMPTS-VFX.md', title: 'Revive Guard — wings overlay', blurb: 'a pair of spread angel wings in golden-white feathers: the left and the right wing are separate, with an EMPTY gap between them', colour: 'warm white feathers, gold edges', view: 'front-on and mirror-symmetrical, wings spread level.', panel: { w: 260, h: 108 }, refScale: 2, exact: true, gridCheck: 'nominal', note: 'The game draws a unit IN that middle gap, behind which these wings sit — so the gap stays empty: no body, no halo, no emblem between the wings.', output: { w: 1040, h: 432, ratio: '12:5 (2.4:1, landscape)' } })
]

const WORLD: ArtDrawable[] = [
  single({ id: 'prop-flying-chest', keys: ['flying-chest'], group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Flying chest reward', blurb: 'a red treasure chest with gold trim and a gold lock, carried between two large spread golden-white feathered wings', colour: 'cherry red wood, gold metal, warm white feathers', view: 'front-on and mirror-symmetrical.', panel: { w: 347, h: 347 }, refScale: 1, exact: true, note: 'A tappable reward that flies across the battlefield: the chest has to read as treasure at a glance.' }),
  single({ id: 'grid-slot-frame', keys: ['slot-frame'], group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Merge grid — empty slot tile', blurb: 'a square slot tile: a thick dark stone-and-iron frame with small rivets, enclosing a recessed, cave-like pattern of dim blue crystals', colour: 'charcoal stone and dark iron, dim teal-blue crystals', view: 'straight down onto the tile, perfectly square and symmetrical.', panel: { w: 256, h: 256 }, refScale: 2, tight: true, note: 'It FILLS its square edge to edge — the frame reaches all four sides, with no margin and no rounded-off corners. Units sit on top of it, so the recessed centre stays dark and quiet.' }),
  single({ id: 'arena-gate', keys: ['gate'], group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Arena — the Lab Gate (ice tower)', blurb: 'an ornate crystal ice tower: pale blue faceted ice crystals in a tall symmetrical spire, a star-shaped crown of crystals, three small purple gems, and a crystal column base', colour: 'pale ice blue and white, violet gems', view: 'front-on, perfectly upright and symmetrical.', panel: { w: 500, h: 712 }, refScale: 1, exact: true, note: 'It stands at the arena\'s LEFT edge as the thing the army defends; the game overlays its own cracks and health bar on it.', output: { w: 1000, h: 1424, ratio: '5:7 (portrait)' } }),
  single({ id: 'arena-portal', keys: ['arena-portal'], group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Arena — enemy spawn portal', blurb: 'a round swirling vortex: bright blue and cyan spiral arms around a dark centre', colour: 'electric blue and cyan, a dark navy centre', view: 'front-on, round.', panel: { w: 256, h: 256 }, refScale: 2, note: 'The game spins and scales it as it opens and closes, so keep it round and centred.' }),
  { id: 'arena-bg', keys: ['arena-bg'], group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Arena — battlefield floor (backdrop)', blurb: 'a dungeon arena floor seen from above: dark, cracked stone flagstones with moss in the seams, a large glowing cyan magic circle in the middle, a few glowing rune tiles, low stone walls with dark alcoves along the top and bottom edges, and small cyan crystals in the corners', colour: 'warm dark stone browns, moss green, glowing cyan runes', view: 'top-down, flat, no perspective.', panel: { w: 1024, h: 512 }, cols: 1, rows: 1, refScale: 1, bg: 'opaque', note: 'Where the game covers it: the ice gate stands on the LEFT edge, enemy portals open near the RIGHT edge (top, centre, bottom), fighters and enemies fight across the middle, a boss health bar and a rank tag sit along the top edge, and a row of up to eight round spell buttons runs along the bottom from the right-hand corner. Keep the floor readable but quiet so units read against it.', output: { w: 2048, h: 1024, ratio: '2:1 (landscape)' } },
  { id: 'arena-scene-bg', keys: ['scene-bg'], group: 'world', doc: 'PROMPTS-WORLD.md', title: 'Scene — full-screen app backdrop', blurb: 'an almost-black deep navy backdrop with a soft, faint vignette and a subtle speckled texture', colour: 'near-black navy (#070a14 to #1c2742)', view: 'flat, no subject.', panel: { w: 768, h: 1376 }, cols: 1, rows: 1, refScale: 1, bg: 'opaque', note: 'Everything covers it: the top HUD, the arena, the upgrade chips, the merge grid and the buttons. It must stay DARK and LOW-CONTRAST everywhere so none of that competes with it. No subject, no focal point.', output: { w: 1152, h: 2064, ratio: '9:16 (portrait)' } }
]

export const ART_DRAWABLES: readonly ArtDrawable[] = [...UNITS, ...ENEMIES, ...PROJECTILES, ...VFX, ...SPELLS, ...WORLD]

// ─── Geometry ───────────────────────────────────────────────────────────────

/** The file the pipeline writes (and the renderer probes) for a drawable. */
export const targetOf = (d: ArtDrawable): string => `${ART_PATHS[d.keys[0]!]}.webp`

/** Reference image name in art-sheets/. */
export const referenceFile = (d: ArtDrawable): string => `${d.id}.png`

/** Pixel size of the reference image: the lattice, at the reference scale. */
export const referenceSize = (d: ArtDrawable): { w: number; h: number } => ({
  w: d.panel.w * d.cols * d.refScale,
  h: d.panel.h * d.rows * d.refScale
})

/** Every target the manifest can write. */
export const manifestTargets = (): Set<string> => new Set(ART_DRAWABLES.map(targetOf))

/**
 * The `sheet-index.json` document the slicer reads.
 *
 * Every transparent drawable is a "walk" in the slicer's vocabulary — N panels
 * of ONE thing, never trimmed, keyed, and registered onto the box the bench
 * measured, then composed back into the file the game loads. A single sprite is
 * a one-panel walk; a 3×3 VFX sheet composes back into a 3×3 GRID
 * (`layout: 'grid'`), not a strip. Opaque backdrops are `scenery`: written at
 * their declared shape, no key.
 */
export const buildIndex = (fits: Record<string, Fit> = {}) => ({
  generator: 'src/game/artSheet.ts',
  sheets: [],
  walks: ART_DRAWABLES.filter((d) => d.bg === 'magenta').map((d) => {
    const ref = referenceSize(d)
    return {
      id: d.id,
      kind: d.group,
      title: d.title,
      file: referenceFile(d),
      // The catalogue keys, so a return saved as `fighter-10.png` still lands.
      aliases: [...d.keys],
      target: targetOf(d),
      width: ref.w,
      height: ref.h,
      panel: { w: d.panel.w * d.refScale, h: d.panel.h * d.refScale },
      cols: d.cols,
      rows: d.rows,
      frames: d.cols * d.rows,
      layout: d.cols * d.rows > 1 ? 'grid' : 'strip',
      gridCheck: d.gridCheck ?? 'measure',
      anchor: 'centre',
      tight: d.tight === true,
      // Frame height cap for the written file: the shipped frame height. The
      // slicer lowers the 256 default to it, or keeps it outright when `exact`.
      maxEdge: d.panel.h,
      exact: d.exact === true,
      fit: fits[d.id] ?? null
    }
  }),
  scenery: ART_DRAWABLES.filter((d) => d.bg === 'opaque').map((d) => ({
    id: d.id,
    title: d.title,
    file: referenceFile(d),
    aliases: [...d.keys],
    target: targetOf(d),
    width: d.panel.w,
    height: d.panel.h,
    bg: 'opaque'
  }))
})

// ─── The prompt ─────────────────────────────────────────────────────────────

const pct = (v: number): string => `${Math.round(v * 100)}%`

const STYLE = [
  'STYLE — one art direction for the whole game:',
  '· Vibrant stylized vector cartoon: bold, clean BLACK ink outlines (about 3–5 px at 256 px), flat saturated colour with soft cel shading and one crisp glossy highlight.',
  '· A chunky, readable silhouette that still reads at 48 px on a phone.',
  '· Match the reference\'s own rendering — the same outline weight, the same shading depth, the same amount of detail. This is a repaint of that picture, not a redesign of it.',
  'AVOID — this is exactly how repaints go wrong:',
  '· photographic texture, painterly brush noise, 3D-render gloss, airbrushed gradients',
  '· thin, grey, broken or missing outlines',
  '· fine detail that turns to mush when the sprite is shown small',
  '· text, letters, numbers, logos, signatures or watermarks anywhere'
]

/** STYLE for a `fresh` drawable: the reference is a placeholder that fixes the
 *  DESIGN, and what is asked for is the finish — the one line that differs. */
const STYLE_FRESH = STYLE.map((line) => line.startsWith('· Match the reference\'s own rendering')
  ? '· The attached reference is a flat PLACEHOLDER drawn by the game. It fixes the DESIGN: the silhouette, every part and where it sits, the colours, the size. Keep all of that. It does not fix the FINISH: give it the full painted finish of this game\'s other fighters — soft cel shading, one crisp glossy highlight, a material that reads true to its element, a lively expressive cartoon face — without adding a part the reference does not draw.'
  : line)

const BACKGROUND = [
  'BACKGROUND — read this before anything else. It matters more than the style.',
  'Fill every pixel that is not the subject with solid, flat, pure magenta #FF00FF. Treat it as a green-screen: one flat chroma-key colour, edge to edge.',
  '· EXACTLY #FF00FF — red 255, green 0, blue 255. Not pink, not rose, not dusty pink, not mauve, not a soft or tinted version of it. Only the true colour can be cut away cleanly; a near miss has to be flood-filled instead, and a flood fill eats any pale paint it can reach.',
  '· NOT transparent. Transparency gets exported as a grey-and-white CHECKERBOARD and then baked into the artwork as though the squares were paint.',
  '· NOT white, cream, parchment, paper, or any tinted or textured ground.',
  '· The subject must NOT sit on a card, panel, badge, frame or rectangle of any kind. The magenta must touch its outline on every side.',
  '· No drop shadow onto the background, and no vignette.',
  '· The subject itself must contain no magenta or hot pink.',
  '· The colours above are for the SUBJECT. The ground is not part of the painting: it stays a vivid, eye-hurting #FF00FF however the subject is lit.',
  'KEEP ANY GLOW TIGHT. A halo, aura or bloom spreading into the background is measured as part of the subject when the return is fitted back onto the reference — a wide aura comes back as a tiny subject inside a huge smear — and soft light over magenta turns pink instead of transparent. Any glow belongs inside the subject\'s own outline.'
]

const FULL_BLEED = [
  'IT FILLS THE IMAGE, edge to edge, corner to corner. There is NO background behind it and NO magenta anywhere in this one: it is itself the background the game is drawn on top of. No frame, no border, no card, no matting, no rounded corners, no letterboxing.'
]

const shapeLine = (d: ArtDrawable): string[] => {
  if (d.bg === 'opaque') {
    return [
      'WHAT COMES BACK IS ONE FULL-BLEED BACKDROP PAINTING.',
      `One ${d.output.w} x ${d.output.h} image (${d.output.ratio}), the same composition as the attached reference, repainted.`
    ]
  }
  if (d.cols * d.rows > 1) {
    const n = d.cols * d.rows
    return [
      'WHAT COMES BACK IS A SPRITE SHEET, NOT ONE PICTURE.',
      `One square image, ${d.output.w} x ${d.output.h} pixels, holding ${n} SEPARATE small drawings laid out ${d.cols} across and ${d.rows} down, on exactly the grid of the attached reference.`,
      `· ${n} panels. Not 1, not 4, not 16. Exactly ${d.rows} rows of ${d.cols} — do not add a row or a column.`,
      '· ONE big drawing filling the canvas is the wrong answer however well it is painted.'
    ]
  }
  const what = d.group === 'unit' || d.group === 'enemy' || d.group === 'boss' ? 'character' : 'object'
  return [
    'WHAT COMES BACK IS ONE OBJECT ON A FLAT MAGENTA GROUND.',
    d.fresh
      ? `One ${d.output.w} x ${d.output.h} image (${d.output.ratio}) holding exactly ONE ${what}: the new one drawn in the attached reference, painted properly. Not a sheet, not several poses, not a scene.`
      : `One ${d.output.w} x ${d.output.h} image (${d.output.ratio}) holding exactly ONE ${what}: the one in the attached reference, repainted. Not a sheet, not several poses, not a scene.`
  ]
}

const notLine = (d: ArtDrawable): string[] => {
  if (d.bg === 'opaque') {
    return [
      'THIS IS A BACKDROP, NOT A SCENE WITH CHARACTERS.',
      '· Draw ONLY what the reference shows. No characters, no creatures, no units, no UI, no buttons, no text.',
      '· Keep the reference\'s layout: every wall, circle and feature stays where it is.'
    ]
  }
  return [
    `THIS IS ${d.cols * d.rows > 1 ? 'ONE EFFECT' : 'ONE SUBJECT'} ALONE — the reference settles every argument about what belongs.`,
    '· Draw ONLY what the reference shows, and nothing else.',
    '· NO ground, no floor, no cast shadow, no scenery, no second character, no frame, no UI, no text.',
    '· If it is not in the reference, it is not in the picture.'
  ]
}

/** The grid clauses — independent of whether a fit has been measured yet. */
const gridLines = (d: ArtDrawable): string[] => d.cols * d.rows > 1
  ? [
      'WHERE it sits in its panel is not a composition choice: every panel is centred on the same point, the spot the effect is played at. Do not re-centre panels on their own outlines, do not tidy the spacing.',
      'Do NOT draw the panel edges: no boxes, borders, gutters, guides or numbers, in any colour, magenta included. Leave a clear band of magenta between neighbouring panels — no drawing touches its neighbour.'
    ]
  : []

const sizeLine = (d: ArtDrawable, fit: Fit | undefined): string[] => {
  if (d.bg === 'opaque') return []
  const where = d.cols * d.rows > 1 ? 'a panel' : 'the canvas'
  if (!fit) {
    return [
      `SIZE — keep the subject exactly as big as it is in the reference, in the same place in ${where}.`,
      'Bigger is not better here: the game shows this file scaled into a fixed box, and a bigger subject reads as a different, bigger thing next to the others.',
      ...gridLines(d)
    ]
  }
  const lines = [
    `SIZE — measure it against ${d.cols * d.rows > 1 ? 'the PANEL, not the whole sheet' : 'the CANVAS'}. In the reference the subject spans ${pct(fit.w)} of ${where}'s width and ${pct(fit.h)} of its height, centred ${pct(fit.cx)} across and ${pct(fit.cy)} down.`,
    fit.w < 0.85 && fit.h < 0.85
      ? `Keep it that size and in that place — the same margin of magenta around it. If yours reaches much further than ${pct(Math.max(fit.w, fit.h) + 0.1)} of the ${d.cols * d.rows > 1 ? 'panel' : 'canvas'}, it is too big.`
      : 'Keep it that size and in that place: it reaches right out to the edge in the reference, and it does in yours — but never past it, and never cropped by it.',
    'Bigger is not clearer here: the game shows this file scaled into a fixed box, and a bigger subject reads as a different, bigger thing next to the others.',
    ...gridLines(d)
  ]
  return lines
}

const checkLine = (d: ArtDrawable): string[] => {
  const lines = ['BEFORE YOU CALL IT FINISHED, count and check:']
  if (d.bg === 'opaque') {
    lines.push('· It fills the whole image, edge to edge, with no border, frame or matting.')
    lines.push('· There is not one character, creature, button or word in it.')
    lines.push(`· The canvas is ${d.output.ratio}.`)
    return lines
  }
  if (d.cols * d.rows > 1) {
    lines.push(`· ${d.cols} panels across, ${d.rows} down, ${d.cols * d.rows} in all.`)
    lines.push('· Every panel shows the same effect, at the same size, in the same colours.')
    lines.push('· No panel edges, numbers or guides are drawn.')
  } else {
    lines.push('· There is exactly one subject, and nothing else.')
    lines.push('· It is about as big as in the reference, in the same place.')
  }
  lines.push('· Every pixel that is not the subject is flat, vivid #FF00FF — hold it against a pure magenta swatch, not against your memory of one.')
  lines.push('· No glow spills out onto the magenta.')
  return lines
}

/** The prompt, as "# <heading>\n\n<body>" — the heading names the reference
 *  and the target in its last parenthesis (the Art Desk's contract). */
export const promptFor = (d: ArtDrawable, fit?: Fit): string => {
  const body: string[] = []
  const para = (lines: string[]): void => { if (lines.length) body.push(lines.join('\n')) }
  para(shapeLine(d))
  para(notLine(d))
  para([`WHAT IT IS: ${d.blurb}.`, ...(d.note ? [d.note] : [])])
  if (d.readPanels) para([`READ THE PANELS: ${d.readPanels}`])
  para([`COLOUR IDENTITY (keep the HUE — it is how a player tells this one from the others): ${d.colour}.`])
  para([`THE VIEW: ${d.view}`, '· No dramatic perspective, no tilt, no ground plane.'])
  if (d.cols * d.rows > 1) {
    para([
      `ONE EFFECT: all ${d.cols * d.rows} panels are the same effect at a different moment. Identical colours, identical materials, identical line weight in every panel — only the moment changes.`,
      '· Effects that change colour or style between panels are several different effects side by side, and the result is unusable.'
    ])
  }
  para(d.fresh ? STYLE_FRESH : STYLE)
  para(sizeLine(d, fit))
  para(d.bg === 'opaque' ? FULL_BLEED : BACKGROUND)
  para(checkLine(d))
  para([`OUTPUT: one image, ${d.output.w} x ${d.output.h} pixels (${d.output.ratio}). If your tool has an aspect-ratio control, set it to ${d.output.ratio.split(' ')[0]}${d.cols * d.rows > 1 ? ' — a return with a different ratio crushes the grid and cannot be cut' : ''}. PNG if you can choose. No labels, captions, numbers or watermarks.`])
  const heading = `${d.title}  (${referenceFile(d)} → ${targetOf(d)})`
  return `# ${heading}\n\n${body.join('\n\n')}`
}

// ─── The documents ──────────────────────────────────────────────────────────

/** Longer than any backtick run in the body, so the fence cannot close early. */
const fenceFor = (body: string): string => {
  let longest = 0
  for (const run of body.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return '`'.repeat(Math.max(3, longest + 1))
}

/** One prompt as a document block: the heading OUTSIDE the fence (it is the
 *  operator's line), the body inside a `text` fence (one-click copy). */
export const block = (text: string): string => {
  const cut = text.indexOf('\n')
  const heading = (cut < 0 ? text : text.slice(0, cut)).replace(/^#+\s*/, '')
  const body = (cut < 0 ? '' : text.slice(cut + 1)).replace(/^\n+/, '')
  const fence = fenceFor(body)
  return [`## ${heading}`, '', `${fence}text`, body, fence].join('\n')
}

/** The prompt body a document block holds — what the Art Desk parses back. */
export const promptBody = (text: string): string => {
  const cut = text.indexOf('\n')
  return (cut < 0 ? '' : text.slice(cut + 1)).replace(/^\n+/, '')
}

const DOC_TITLES: Record<PromptDoc, string> = {
  'PROMPTS-UNITS.md': 'the merge-tier fighters',
  'PROMPTS-ENEMIES.md': 'enemies and bosses',
  'PROMPTS-VFX.md': 'projectiles, VFX sheets and spell icons',
  'PROMPTS-WORLD.md': 'the arena, the grid and the rewards'
}

export const promptDocs = (fits: Record<string, Fit> = {}): Record<PromptDoc, string> => {
  const out = {} as Record<PromptDoc, string>
  for (const doc of Object.keys(DOC_TITLES) as PromptDoc[]) {
    const items = ART_DRAWABLES.filter((d) => d.doc === doc)
    out[doc] = [
      `# Prompts — ${DOC_TITLES[doc]}`,
      '',
      'Generated from `src/game/artSheet.ts` by `pnpm art:prompts` (or the `/#/art-sheets` bench export). Do not edit by hand — edit the manifest and regenerate.',
      '',
      'For each block: attach the reference named in the heading\'s parenthesis (from `art-sheets/`), then paste the text inside the fence. The heading is for you, not the model — copy only what is inside the fence. Save the return into `art-sheets/painted/` under the reference\'s name (any extension), then `pnpm art:slice`.',
      '',
      ...items.flatMap((d) => [block(promptFor(d, fits[d.id])), ''])
    ].join('\n')
  }
  return out
}
