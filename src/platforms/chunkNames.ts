// ─── Foreign-portal chunk names ─────────────────────────────────────────────
//
// Pure helper for `vite.config.ts` (`build.rollupOptions.output.chunkFileNames`).
// The `resolve.alias` stubs keep every other portal's CODE out of a build, but
// Rollup still names a split chunk after its source module — so a GameMonetize
// archive listed `pokiPlugin.stub-*.js` and `useCrazyGames.stub-*.js`, and each
// importing chunk carried that file name as a string. Chunks whose name points
// at a portal other than the active one get a neutral name instead.

/** Portal identifier in a chunk name → the env flag that makes it "ours". */
const PORTAL_TOKENS: ReadonlyArray<readonly [RegExp, string]> = [
  [/crazy/i, 'VITE_APP_CRAZY_WEB'],
  [/poki/i, 'VITE_APP_POKI'],
  [/gamepix/i, 'VITE_APP_GAMEPIX'],
  [/playgama/i, 'VITE_APP_PLAYGAMA'],
  [/yandex/i, 'VITE_APP_YANDEX'],
  [/gamepush/i, 'VITE_APP_GAMEPUSH'],
  [/monetize/i, 'VITE_APP_GAME_MONETIZE'],
  [/gamedistribution/i, 'VITE_APP_GAME_DISTRIBUTION'],
  [/glitch/i, 'VITE_APP_GLITCH'],
  [/wavedash/i, 'VITE_APP_WAVEDASH']
]

/**
 * True when `chunkName` is a stub, or names a portal this build is not for.
 * Stubs are always foreign: a build never stubs its own portal.
 */
export const foreignPortalChunk = (chunkName: string, env: Record<string, string | undefined>): boolean => {
  if (/\.stub$/i.test(chunkName)) return true
  return PORTAL_TOKENS.some(([re, flag]) => re.test(chunkName) && env[flag] !== 'true')
}
