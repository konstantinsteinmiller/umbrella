/**
 * Painted backdrops — the board floor per depth band, the scene around the
 * board (landscape / portrait) and the side-panel plate. Prompts and layout
 * guides: `art-sheets/backdrops/`; `pnpm art:backdrops` turns the paintings
 * into `public/images/backdrops/*.webp` and measures each floor's rows into
 * `backdropAnchors.json`.
 *
 * Kept out of the MIW art catalogue on purpose: that one is pinned to the
 * sheet manifest, whose prompt generator would write generic prompts over the
 * hand-written backdrop ones. Same contract though — gated by the art flag
 * (`?art=off` shows the drawing), and only files that shipped (the build-time
 * public manifest) are ever requested, so a missing painting is never a 404.
 */
import { prependBaseUrl } from '@/utils/function'
import { artOverridesEnabled } from '@/use/useArtOverrides'
import { publicAssetExists } from '@/use/usePublicManifest'
import type { FieldKey } from './backdrop'

export type BackdropKey = FieldKey | 'scene-landscape' | 'scene-portrait' | 'panel-plate'

/** Reactive (the art flag): the painting's URL, or null → keep the fallback. */
export const backdropSrc = (key: BackdropKey): string | null => {
  const rel = `images/backdrops/${key}.webp`
  return artOverridesEnabled.value && publicAssetExists(rel) ? prependBaseUrl(rel) : null
}
