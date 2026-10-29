// `?art=…` (before or after the #) as the page was opened. On GitHub Pages it is a redirect to the
// art build (public/js/art-kite-redirect.js); on a dev server, which has no such builds, kite.ts
// and the dev glob (art/shipped-dev.ts) read it here instead. Leaf module, no imports.
export const devArtParam = (): string | null => {
  if (typeof window === 'undefined') return null
  try {
    const hash = window.location.hash || ''
    const inHash = hash.includes('?') ? hash.slice(hash.indexOf('?')) : ''
    return new URLSearchParams(window.location.search).get('art') || new URLSearchParams(inHash).get('art')
  } catch {
    return null
  }
}
