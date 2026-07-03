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

const ART_PATHS = {
  // The 10 merge-tier fighters (also shown on the grid + drag ghost).
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
  // Enemy walkers + boss.
  'enemy-slime': 'images/enemies/slime',
  'enemy-runner': 'images/enemies/runner',
  'enemy-brute': 'images/enemies/brute',
  'enemy-spitter': 'images/enemies/spitter',
  'enemy-warlock': 'images/enemies/warlock',
  'enemy-boss': 'images/enemies/boss',
  // Environment.
  'arena-bg': 'images/arena/arena-bg',
  'scene-bg': 'images/arena/scene-bg',
  'gate': 'images/arena/gate',
  'slot-frame': 'images/grid/slot-frame',
  // VFX sprites (static; the CSS keyframes keep animating them).
  'vfx-meteor': 'images/vfx/meteor',
  'vfx-blackhole': 'images/vfx/blackhole'
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
    } else if (ext === 'webp') probeOne(key, 'png')
  }
  img.onerror = () => { if (ext === 'webp') probeOne(key, 'png') }
  img.src = src
}

let probeStarted = false
/** Fire-and-forget probe of every override slot. Idempotent; kicked off in
 *  parallel with the hot-path preload so present bitmaps are usually ready
 *  by the first gameplay frame. */
export const probeArtOverrides = (): void => {
  if (probeStarted || typeof window === 'undefined') return
  probeStarted = true
  for (const key of Object.keys(ART_PATHS) as ArtKey[]) probeOne(key, 'webp')
}
