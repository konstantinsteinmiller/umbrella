import manifest from 'virtual:public-override-manifest'

// Set of public-relative paths (under audio/ + images/) that existed at build
// time. The drop-in probes (useArtOverrides / useSound) consult this so they
// only request files that are actually shipped — an unfilled optional slot is
// simply never fetched, instead of 404-ing (which CrazyGames' resource audit
// flags). See the `public-override-manifest` Vite plugin.
const existing = new Set<string>(manifest)

/** True if a file at this public-relative path (e.g. `audio/sfx/frost-nova.ogg`
 *  or `images/attacks/wind-projectile_128x128.webp`) shipped in this build. */
export const publicAssetExists = (relPath: string): boolean => existing.has(relPath)
