/**
 * ─── The drop-in art catalogue ──────────────────────────────────────────────
 *
 * Every painted bitmap the renderer can pick up, by key → public path (no
 * extension; `.webp` is probed first, then `.png`). Full manifest with sizes
 * and rules: art-todo.md.
 *
 * PURE ON PURPOSE. No Vue, no DOM, no `import.meta.env` — this module is read
 * by the game (`useArtOverrides` probes these paths) AND by plain Node through
 * `scripts/art/ts-resolve.mjs` (`pnpm art:status`, `pnpm art:prompts`, the
 * art bench's manifest). The moment it imports anything with a side effect,
 * the headless half of the art pipeline stops working.
 */

export const ART_PATHS = {
  // The merge-tier fighters (also shown on the grid + drag ghost).
  'fighter-1': 'images/units/fighter-1',
  'fighter-2': 'images/units/fighter-2',
  'fighter-3': 'images/units/fighter-3',
  'fighter-4': 'images/units/fighter-4',
  'fighter-5': 'images/units/fighter-5',
  'fighter-6': 'images/units/fighter-6',
  'fighter-7': 'images/units/fighter-7',
  'fighter-8': 'images/units/fighter-8',
  'fighter-9': 'images/units/fighter-9',
  'fighter-10': 'images/units/fighter-10',
  'fighter-11': 'images/units/fighter-11',
  'fighter-12': 'images/units/fighter-12',
  'fighter-13': 'images/units/fighter-13',
  'fighter-14': 'images/units/fighter-14',
  'fighter-15': 'images/units/fighter-15',
  'fighter-16': 'images/units/fighter-16',
  'fighter-17': 'images/units/fighter-17',
  'fighter-18': 'images/units/fighter-18',
  'fighter-19': 'images/units/fighter-19',
  'fighter-20': 'images/units/fighter-20',
  // The elemental tiers (21-50). No bitmap ships yet: IngredientUnit draws
  // their elementalArt.ts figure until the pipeline writes these files.
  'fighter-21': 'images/units/fighter-21',
  'fighter-22': 'images/units/fighter-22',
  'fighter-23': 'images/units/fighter-23',
  'fighter-24': 'images/units/fighter-24',
  'fighter-25': 'images/units/fighter-25',
  'fighter-26': 'images/units/fighter-26',
  'fighter-27': 'images/units/fighter-27',
  'fighter-28': 'images/units/fighter-28',
  'fighter-29': 'images/units/fighter-29',
  'fighter-30': 'images/units/fighter-30',
  'fighter-31': 'images/units/fighter-31',
  'fighter-32': 'images/units/fighter-32',
  'fighter-33': 'images/units/fighter-33',
  'fighter-34': 'images/units/fighter-34',
  'fighter-35': 'images/units/fighter-35',
  'fighter-36': 'images/units/fighter-36',
  'fighter-37': 'images/units/fighter-37',
  'fighter-38': 'images/units/fighter-38',
  'fighter-39': 'images/units/fighter-39',
  'fighter-40': 'images/units/fighter-40',
  'fighter-41': 'images/units/fighter-41',
  'fighter-42': 'images/units/fighter-42',
  'fighter-43': 'images/units/fighter-43',
  'fighter-44': 'images/units/fighter-44',
  'fighter-45': 'images/units/fighter-45',
  'fighter-46': 'images/units/fighter-46',
  'fighter-47': 'images/units/fighter-47',
  'fighter-48': 'images/units/fighter-48',
  'fighter-49': 'images/units/fighter-49',
  'fighter-50': 'images/units/fighter-50',
  // Enemy walkers (public/enemies/) — bitmap over the SVG fallback. `slime-alt`
  // is a second slime look picked at random for variety.
  'enemy-slime': 'enemies/slime2_256x256',
  'enemy-slime-alt': 'enemies/caterpillar_256x256',
  'enemy-runner': 'enemies/goblin_256x256',
  'enemy-brute': 'enemies/ogre_256x256',
  'enemy-spitter': 'enemies/centaur_256x256',
  'enemy-warlock': 'enemies/dryad_256x256',
  // Bosses (public/enemies/bosses/) — rotate by boss wave (5,10,15,20,25,30…);
  // waves past 30 reuse these with a darkness tint (see EnemyUnit).
  'boss-slime-tower': 'enemies/bosses/slime-tower_256x256',
  'boss-orc': 'enemies/bosses/orc_256x256',
  'boss-fire-dragon': 'enemies/bosses/fire-dragon_256x256',
  'boss-troll': 'enemies/bosses/troll_256x256',
  'boss-worm': 'enemies/bosses/worm_256x256',
  'boss-silver-dragon': 'enemies/bosses/silver-dragon_256x256',
  // Environment.
  'arena-bg': 'images/arena/arena-bg',
  'scene-bg': 'images/arena/scene-bg',
  'gate': 'images/arena/gate',
  'arena-portal': 'images/arena/portal',
  'slot-frame': 'images/grid/slot-frame',
  // VFX sprites (static; the CSS keyframes keep animating them).
  // Meteor Storm ultimate: the falling meteor and the ult button icon share the
  // one fireball bitmap; the fall + impact is animated procedurally in CSS.
  'vfx-meteor': 'images/attacks/meteor_256x256',
  'meteor-button': 'images/attacks/meteor_256x256',
  // Unlockable arena spells — button icons + the Revive Guard wings overlay.
  'spell-heal': 'images/attacks/heal_128x128',
  'spell-revive': 'images/attacks/revive_128x128',
  'spell-defender': 'images/attacks/shield-crest_256x256',
  'revive-wings': 'images/props/wings_260x108',
  // Arena skills, slots 5–8. No bitmap ships yet: SpellButton draws their
  // procedural SkillIcon until the pipeline writes these files.
  'spell-warcry': 'images/attacks/warcry_128x128',
  'spell-legion': 'images/attacks/legion-call_128x128',
  'spell-execute': 'images/attacks/executioners-mark_128x128',
  'spell-pact': 'images/attacks/soul-pact_128x128',
  // Ranged-attack projectiles, keyed by element (shared across tiers). A
  // ranged unit with no matching bitmap falls back to a glowing colour dot.
  'proj-fire': 'images/attacks/fire-projectile_128x128',
  'proj-ice': 'images/attacks/ice-projectile_128x128',
  // Optional ANIMATED in-flight projectiles (3×3 sprite sheet, looped). When
  // present these win over the static `proj-*` image for that element — so wind
  // & cosmic ship ONLY the animated version (no static `proj-wind`/`proj-cosmic`
  // slot, which would just be a redundant, never-rendered 404).
  'proj-anim-fire': 'images/attacks/animations/fire-projectile-vfx-9-frames_384x384',
  'proj-anim-wind': 'images/attacks/animations/wind-projectile-vfx-9-frames_384x384',
  'proj-anim-cosmic': 'images/attacks/animations/cosmic-projectile-vfx-9-frames_384x384',
  'proj-stone': 'images/attacks/stone-projectile_128x128',
  'proj-shadow': 'images/attacks/shadow-projectile_128x128',
  // Impact "splitter" bursts — a 3×3 sprite sheet (9 frames) played on land.
  // Absent → fall back to the coloured sparkle burst.
  'impact-fire': 'images/attacks/animations/fire-splitter-vfx-9-frames_384x384',
  'impact-ice': 'images/attacks/animations/ice-splitter-vfx-9-frames_384x384',
  'impact-wind': 'images/attacks/animations/wind-impact-vfx-9-frames_384x384',
  'impact-stone': 'images/attacks/animations/stone-splitter-vfx-9-frames_384x384',
  'impact-cosmic': 'images/attacks/animations/cosmic-splitter-vfx-9-frames_384x384',
  'impact-shadow': 'images/attacks/animations/shadow-splitter-vfx-9-frames_384x384',
  // Flying chest reward (retention-roadmap #1B); falls back to the shipped
  // static chest icon inside FlyingChest.vue when this override is absent.
  'flying-chest': 'images/props/flying-chest_347x347'
} as const

export type ArtKey = keyof typeof ART_PATHS

export const ART_KEYS = Object.keys(ART_PATHS) as ArtKey[]

/**
 * The same keys grouped by what they are, for `pnpm art:status` — "which
 * drop-ins will the renderer actually find, per kind". A key sits in exactly
 * one group (pinned by `tests/art/artSheet.test.ts`).
 */
export const ART_CATALOGUE: Record<string, readonly ArtKey[]> = {
  units: ART_KEYS.filter((k) => k.startsWith('fighter-')),
  enemies: ART_KEYS.filter((k) => k.startsWith('enemy-')),
  bosses: ART_KEYS.filter((k) => k.startsWith('boss-')),
  projectiles: ART_KEYS.filter((k) => k.startsWith('proj-') && !k.startsWith('proj-anim-')),
  vfx: ART_KEYS.filter((k) => k.startsWith('proj-anim-') || k.startsWith('impact-') || k === 'vfx-meteor'),
  spells: [
    'meteor-button', 'spell-heal', 'spell-revive', 'spell-defender', 'revive-wings',
    'spell-warcry', 'spell-legion', 'spell-execute', 'spell-pact'
  ],
  world: ['arena-bg', 'scene-bg', 'gate', 'arena-portal', 'slot-frame', 'flying-chest']
}

/** The path under `public/`, extensionless, that the probe tries for `key`. */
export const artBase = (key: ArtKey): string => ART_PATHS[key]

/** The drop-in the pipeline writes for `key` (the renderer also accepts `.png`). */
export const artTarget = (_kind: string, key: ArtKey): string => `${ART_PATHS[key]}.webp`
