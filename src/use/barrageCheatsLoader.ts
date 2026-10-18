// The ONE dynamic import behind the QA console/keyboard cheats (`useCheats`).
//
// It lives in its own leaf file because the production obfuscator's
// `stringArray` pass rewrites every string literal — including a dynamic
// import's specifier — into a decoder call. Rollup can then no longer resolve
// the `@/` alias or point it at the right chunk, so the bundle shipped a bare
// `import('@/barrage/state/useBarrage')` and every `__barrage.*` call threw
// "Failed to resolve module specifier". This file is excluded from the
// obfuscator in vite.config.ts (same pattern as playgamaBridgeLoader.ts), so
// `useCheats` itself — with the unlock sequence and cheat strings — stays
// obfuscated and only these few lines don't.
//
// Lazy on purpose: a static import would drag the barrage engine into the
// app-shell chunk just to serve a dev shortcut.
import type { barrageCheats } from '@/barrage/state/useBarrage'

export type BarrageCheats = typeof barrageCheats

export const loadBarrageCheats = (): Promise<BarrageCheats> =>
  import('@/barrage/state/useBarrage').then((m) => {
    m.default() // make sure the singleton (and its engine) exists
    return m.barrageCheats
  })
