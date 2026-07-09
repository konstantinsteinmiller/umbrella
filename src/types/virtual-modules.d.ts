// Ambient declarations for Vite virtual modules. This file is a SCRIPT (no
// top-level import/export), so `declare module 'x'` is a GLOBAL ambient module
// declaration — resolvable from any importer — rather than a scoped module
// augmentation (which is what it becomes inside a module d.ts like env.d.ts).

declare module 'virtual:public-override-manifest' {
  // Public-relative paths of every file under public/audio + public/images at
  // build time (e.g. 'audio/sfx/foo.ogg', 'images/attacks/bar_128x128.webp').
  // Drives the drop-in probes so they only request files that actually exist.
  const paths: string[]
  export default paths
}
