// The dev server's painted sheets (vite.config.ts aliases `shipped` here for `vite` serve only):
// every folder is on disk, and `?art=lantern` / `?art=clay` (before or after the #) picks one at
// runtime — a plain dev server shows the painted art without `pnpm dev:lantern`. Builds never see
// this module: each bundles exactly one folder (shipped.ts / shipped-lantern.ts / shipped-clay.ts).
import { devArtParam } from '../devArt'

const kite = import.meta.glob('../../assets/umbrella-art/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const lantern = import.meta.glob('../../assets/umbrella-art-lantern/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const clay = import.meta.glob('../../assets/umbrella-art-clay/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export const files = import.meta.env.VITE_APP_LANTERN === 'true' || devArtParam() === 'lantern' ? lantern
  : import.meta.env.VITE_APP_CLAY === 'true' || devArtParam() === 'clay' ? clay : kite
