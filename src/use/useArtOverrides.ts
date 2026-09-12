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
 *
 * The key → path table lives in `@/game/artCatalogue` (pure, so the Node side
 * of the art pipeline — `pnpm art:status` / `art:prompts` — reads the same one).
 *
 * ─── The art flag ───────────────────────────────────────────────────────────
 *
 * ON by default, as it always was: every slot is painted and the build-time
 * manifest already keeps unfilled slots from ever being requested, so the
 * reason the art-generation-pipeline defaults its flag OFF (a 404 per missing
 * sprite in a portal's QA console) does not apply here. What the flag buys is
 * the other direction — turning painted art OFF to see the drawing it stands
 * in for:
 *
 *   build    VITE_ENABLE_ART_OVERRIDES=false   the kill switch, any build
 *   URL      ?art=off / ?art=on                 DEV only
 *   console  __art.off() / .on() / .refresh() / .status()   DEV only
 *   code     setArtOverrides(on)                the /playground A/B button
 *
 * CACHE CONTRACT: nothing to invalidate. Every consumer (IngredientUnit,
 * EnemyUnit, BattleArena, MergeGrid, FlyingChest, GameScene) reads `artSrc()`
 * reactively inside a computed or a template, and nothing bakes a bitmap into a
 * canvas — so a flag flip or a new probe result re-renders exactly what
 * depends on it. (`BattleArena` reads it once per impact/meteor spawn; a flip
 * shows on the next one.) The scoped-invalidation machinery a canvas renderer
 * needs has no job in this DOM renderer.
 */
import { reactive, ref, type Ref } from 'vue'
import { prependBaseUrl } from '@/utils/function'
import { resourceCache } from '@/use/useAssets'
import { publicAssetExists } from '@/use/usePublicManifest'
import { ART_PATHS, ART_KEYS, type ArtKey } from '@/game/artCatalogue'

export type { ArtKey } from '@/game/artCatalogue'

/** key → resolved bitmap URL once probed OK; absent/undefined → use fallback. */
const resolved = reactive<Partial<Record<ArtKey, string>>>({})

const BUILD_ENABLED = import.meta.env.VITE_ENABLE_ART_OVERRIDES !== 'false'

/** Dev-only `?art=off|on` — read once, per load, never remembered. */
const urlOverride = (): boolean | null => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  try {
    const v = new URL(window.location.href).searchParams.get('art')
    return v === 'off' ? false : v === 'on' ? true : null
  } catch {
    return null
  }
}

/** Reactive: whether painted art is being drawn at all. */
export const artOverridesEnabled: Ref<boolean> = ref(urlOverride() ?? BUILD_ENABLED)

/** Flip the painted layer live. Components re-render from their computeds. */
export const setArtOverrides = (on: boolean): void => {
  artOverridesEnabled.value = on
}

/** Reactive: the override bitmap's URL, or `null` → render the vector fallback. */
export const artSrc = (key: ArtKey): string | null =>
  artOverridesEnabled.value ? (resolved[key] ?? null) : null

/** Cache-buster generation — bumped by `refreshArtOverrides` so a re-sliced
 *  file with the SAME name is not served back from the browser cache. */
let generation = 0

const probeOne = (key: ArtKey, ext: 'webp' | 'png'): void => {
  const base = prependBaseUrl(`${ART_PATHS[key]}.${ext}`)
  const src = generation > 0 ? `${base}?v=${generation}` : base
  const img = new Image()
  img.onload = () => {
    if (img.naturalWidth > 0) {
      resourceCache.images.set(src, img) // decoded — keep it warm
      resolved[key] = src
    }
  }
  img.src = src
}

const probeAll = (): void => {
  for (const key of ART_KEYS) {
    const base = ART_PATHS[key]
    if (publicAssetExists(`${base}.webp`)) probeOne(key, 'webp')
    else if (publicAssetExists(`${base}.png`)) probeOne(key, 'png')
    // else: unfilled slot → component keeps its vector fallback, no request.
  }
}

let probeStarted = false
/** Fire-and-forget probe of every override slot that ACTUALLY shipped (per the
 *  build-time manifest — an unfilled slot is never requested, so no 404). Only
 *  the format present is fetched; `.webp` wins when both exist. Idempotent;
 *  kicked off in parallel with the hot-path preload. */
export const probeArtOverrides = (): void => {
  if (probeStarted || typeof window === 'undefined') return
  probeStarted = true
  probeAll()
}

/**
 * Forget every probe and fetch again, cache-busted — for a painting that was
 * sliced over a file of the same name while the page was open. Until the new
 * decode lands the old URL keeps rendering, so nothing flashes to the drawing.
 */
export const refreshArtOverrides = (): void => {
  if (typeof window === 'undefined') return
  generation++
  probeStarted = true
  probeAll()
}

// Console hooks, DEV only — the bench and the playground are dev-only too.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__art = {
    on: () => setArtOverrides(true),
    off: () => setArtOverrides(false),
    refresh: refreshArtOverrides,
    status: () => ({
      enabled: artOverridesEnabled.value,
      painted: Object.keys(resolved).length,
      of: ART_KEYS.length,
      missing: ART_KEYS.filter((k) => !resolved[k])
    })
  }
}
