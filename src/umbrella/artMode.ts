// ─── The designers' art switch (the "cmonc" cheat) ──────────────────────────
//
// Which art the game is drawn in is fixed per build (kite.ts): the normal build draws the vector
// game, the lantern build the painted "Paper Moon" origami, the clay build the "Rainy Day Post"
// claymation. Switching therefore means opening the other build, through the same `?art=…` flag a
// player link uses (`?art=lantern`, `?art=clay`):
//   · deployed (GitHub Pages): /umbrella/12/?art=lantern, which public/js/art-kite-redirect.js sends
//     on to /umbrella/12/lantern/; "drawn" goes back to /umbrella/12/ without the flag;
//   · on a dev server: the same page with or without ?art=lantern (kite.ts reads it at runtime).
// A portal build has no sibling builds, so it cannot switch (artModeUrl returns null).
import { isClay, isLantern } from './kite'

export type ArtMode = 'drawn' | 'lantern' | 'clay'

export const ART_MODES: ReadonlyArray<{ id: ArtMode; label: string }> = [
  { id: 'drawn', label: 'Drawn only' },
  { id: 'lantern', label: 'Origami: Lantern' },
  { id: 'clay', label: 'Clay: Rainy Day Post' }
]

export const currentArtMode = (): ArtMode => (isLantern ? 'lantern' : isClay ? 'clay' : 'drawn')

/** The page that opens the game in `mode`, from the page at `href`; null where it cannot switch. */
export const artModeUrl = (href: string, mode: ArtMode, dev: boolean = import.meta.env.DEV): string | null => {
  const u = new URL(href)
  // The flag may sit before the # or in the hash route's own query: drop it from both.
  u.searchParams.delete('art')
  const q = u.hash.indexOf('?')
  if (q >= 0) {
    const rest = new URLSearchParams(u.hash.slice(q + 1))
    rest.delete('art')
    u.hash = u.hash.slice(0, q) + (rest.size ? `?${rest}` : '')
  }
  if (!dev) {
    const m = /^(\/umbrella\/(?:\d+\/)?)(?:lantern\/|clay\/)?/.exec(u.pathname)
    if (!m) return null
    u.pathname = m[1]!
  }
  if (mode !== 'drawn') u.searchParams.set('art', mode)
  return u.toString()
}

/** Open the game in `mode`. A URL that differs only after the # would not reload by itself. */
export const switchArtMode = (mode: ArtMode): void => {
  const url = artModeUrl(window.location.href, mode)
  if (!url || mode === currentArtMode()) return
  const next = new URL(url)
  const now = new URL(window.location.href)
  window.location.assign(url)
  if (next.origin + next.pathname + next.search === now.origin + now.pathname + now.search) window.location.reload()
}
