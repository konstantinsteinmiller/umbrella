// Standalone build of the sound listening page (umbrella-sounds.html) for
// GitHub Pages: `vite build --config scripts/sfx/vite.sounds.config.mjs
// --base=/umbrella/sounds/ --outDir=<dist>/sounds`.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))
const src = fileURLToPath(new URL('../../src', import.meta.url))

export default defineConfig({
  root,
  resolve: { alias: [{ find: /^\/src\//, replacement: `${src}/` }, { find: '@', replacement: src }] },
  build: {
    emptyOutDir: true,
    rollupOptions: { input: { index: `${root}umbrella-sounds.html` } }
  }
})
