// The picture-board image ids a set of level documents use (levelImages.ts names them: 24 hex digits).
// Walks any JSON, so it finds boards in campaign overrides AND in the levels the campaign order carries as snapshots.

const ID_RE = /^[0-9a-f]{24}$/

/** @param {...unknown} docs  parsed JSON (campaign-overrides.json, campaign-order.json, a level...) */
export const imageIdsIn = (...docs) => {
  const ids = new Set()
  const walk = (v) => {
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) { v.forEach(walk); return }
    for (const [k, x] of Object.entries(v)) {
      if (k === 'pictures' && Array.isArray(x)) {
        for (const p of x) if (p && typeof p.image === 'string' && ID_RE.test(p.image)) ids.add(p.image)
      }
      walk(x)
    }
  }
  docs.forEach(walk)
  return [...ids]
}
