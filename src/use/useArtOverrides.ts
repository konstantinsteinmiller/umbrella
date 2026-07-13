/**
 * Drop-in art overrides — final bitmap art can replace the procedural
 * SVG/CSS art WITHOUT a code change: drop a file at the documented path
 * under `public/images/` (full manifest: art-todo.md) and it is picked up
 * automatically on the next load.
 *
 * Every key probes its `.webp` candidate (then `.png`) in the background.
 * Until a probe succeeds — or whenever the file is missing / fails to
 * decode — `artSrc()` returns `null` and the component keeps rendering its
 * built-in vector fallback, so a dropped-in asset can never leave a hole
 * in the scene. The probe validates a real decode (`naturalWidth > 0`),
 * which also filters out the dev server's index.html SPA fallback.
 */
import { reactive } from 'vue'
import { prependBaseUrl } from '@/utils/function'
import { resourceCache } from '@/use/useAssets'
import { publicAssetExists } from '@/use/usePublicManifest'

const ART_PATHS = {
  // The 11 merge-tier fighters (also shown on the grid + drag ghost).
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

/** key → resolved bitmap URL once probed OK; absent/undefined → use fallback. */
const resolved = reactive<Partial<Record<ArtKey, string>>>({})

/** Reactive: the override bitmap's URL, or `null` → render the vector fallback. */
export const artSrc = (key: ArtKey): string | null => resolved[key] ?? null

const probeOne = (key: ArtKey, ext: 'webp' | 'png'): void => {
  const src = prependBaseUrl(`${ART_PATHS[key]}.${ext}`)
  const img = new Image()
  img.onload = () => {
    if (img.naturalWidth > 0) {
      resourceCache.images.set(src, img) // decoded — keep it warm
      resolved[key] = src
    }
  }
  img.src = src
}

let probeStarted = false
/** Fire-and-forget probe of every override slot that ACTUALLY shipped (per the
 *  build-time manifest — an unfilled slot is never requested, so no 404). Only
 *  the format present is fetched; `.webp` wins when both exist. Idempotent;
 *  kicked off in parallel with the hot-path preload. */
export const probeArtOverrides = (): void => {
  if (probeStarted || typeof window === 'undefined') return
  probeStarted = true
  for (const key of Object.keys(ART_PATHS) as ArtKey[]) {
    const base = ART_PATHS[key]
    if (publicAssetExists(`${base}.webp`)) probeOne(key, 'webp')
    else if (publicAssetExists(`${base}.png`)) probeOne(key, 'png')
    // else: unfilled slot → component keeps its vector fallback, no request.
  }
}
