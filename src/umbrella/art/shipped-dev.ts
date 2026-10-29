// The dev server's painted sheets (vite.config.ts aliases `shipped` here for `vite` serve only):
// both folders are on disk, and `?art=lantern` (before or after the #) picks the lantern one at
// runtime — a plain dev server shows the lantern art without `pnpm dev:lantern`. Builds never see
// this module: each bundles exactly one folder (shipped.ts / shipped-lantern.ts).
import { devArtParam } from '../devArt'

const kite = import.meta.glob('../../assets/umbrella-art/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const lantern = import.meta.glob('../../assets/umbrella-art-lantern/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export const files = import.meta.env.VITE_APP_LANTERN === 'true' || devArtParam() === 'lantern' ? lantern : kite
