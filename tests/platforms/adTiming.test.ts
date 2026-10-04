// Per-portal ad timing (`src/use/adTiming.ts`) and the first-load arm list.
//
// Pins the owner's per-portal matrix: Poki / CrazyGames / Playgama (and every
// other portal by default) keep the ~3 min early-ad grace and fire no
// first-load ad; GameMonetize fires the first-load ad with grace 0; GamePix
// fires the first-load ad but keeps the grace for everything after it.
//
// The first-load arm in `FLogoProgress.vue` is a DCE'd `import.meta.env`
// branch, so no unit test can execute it — it is pinned at source level
// against `FIRST_LOAD_AD` instead (the trap that shipped GameMonetize builds
// with no first ad at all: a first-PLAY module nothing ever called).

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adTimingFor, effectiveLastAdAt, EARLY_AD_GRACE_MS } from '@/use/adTiming'

const ROOT = resolve(__dirname, '../..')
const src = (p: string): string => readFileSync(resolve(ROOT, p), 'utf-8')

const PORTALS: Record<string, Record<string, string>> = {
  poki: { VITE_APP_POKI: 'true' },
  crazygames: { VITE_APP_CRAZY_WEB: 'true' },
  playgama: { VITE_APP_PLAYGAMA: 'true' },
  yandex: { VITE_APP_YANDEX: 'true' },
  gamepix: { VITE_APP_GAMEPIX: 'true' },
  gamemonetize: { VITE_APP_GAME_MONETIZE: 'true' },
  web: {}
}

describe('adTimingFor — the per-portal matrix', () => {
  it.each(['poki', 'crazygames', 'playgama', 'yandex', 'web'])('%s keeps the early-ad grace and fires no first-load ad', (portal) => {
    expect(adTimingFor(PORTALS[portal]!)).toEqual({ firstLoadAd: false, earlyAds: false, graceMs: EARLY_AD_GRACE_MS })
  })

  it('the grace is about three minutes', () => {
    expect(EARLY_AD_GRACE_MS).toBe(3 * 60 * 1000)
  })

  it('GameMonetize fires the first-load ad with NO grace', () => {
    expect(adTimingFor(PORTALS.gamemonetize!)).toEqual({ firstLoadAd: true, earlyAds: true, graceMs: 0 })
  })

  it('GamePix fires the first-load ad but keeps the grace after it', () => {
    expect(adTimingFor(PORTALS.gamepix!)).toEqual({ firstLoadAd: true, earlyAds: false, graceMs: EARLY_AD_GRACE_MS })
  })
})

describe('build constants agree with the matrix', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it.each(Object.keys(PORTALS))('%s', async (portal) => {
    vi.resetModules()
    for (const [k, v] of Object.entries(PORTALS[portal]!)) vi.stubEnv(k, v)
    // Explicitly off for the two flags the constants read, when not this portal.
    if (portal !== 'gamemonetize') vi.stubEnv('VITE_APP_GAME_MONETIZE', 'false')
    if (portal !== 'gamepix') vi.stubEnv('VITE_APP_GAMEPIX', 'false')
    const mod = await import('@/use/adTiming')
    const want = adTimingFor(PORTALS[portal]!)
    expect(mod.FIRST_LOAD_AD).toBe(want.firstLoadAd)
    expect(mod.EARLY_ADS).toBe(want.earlyAds)
    expect(mod.AD_GRACE_MS).toBe(want.graceMs)
  })
})

describe('effectiveLastAdAt — grace threaded into the min-gap policy', () => {
  const START = 1_000_000
  const GAP = 3 * 60 * 1000

  it('a real last ad always wins', () => {
    expect(effectiveLastAdAt(START + 5, START, 0, GAP)).toBe(START + 5)
    expect(effectiveLastAdAt(START + 5, START, GAP, GAP)).toBe(START + 5)
  })

  it('grace = gap → the first ad is due one full gap after load (the old behaviour)', () => {
    expect(effectiveLastAdAt(null, START, GAP, GAP)).toBe(START)
  })

  it('grace 0 → the first ad is due at once', () => {
    const last = effectiveLastAdAt(null, START, 0, GAP)
    expect(START - last).toBe(GAP)
  })
})

describe('the first-load arm (source-level pin)', () => {
  const flogo = src('src/components/atoms/FLogoProgress.vue')

  it('FLogoProgress arms the first-load watcher for exactly the FIRST_LOAD_AD portals', () => {
    const arm = flogo.match(/if \(([^{]*?)\)\s*\{\s*armFirstLoadInterstitial\(\)/)
    expect(arm, 'armFirstLoadInterstitial() must sit behind a static env-literal if').not.toBeNull()
    const flags = [...arm![1]!.matchAll(/import\.meta\.env\.(VITE_APP_\w+) === 'true'/g)].map(m => m[1]).sort()
    expect(flags).toEqual(['VITE_APP_GAMEPIX', 'VITE_APP_GAME_MONETIZE'])
    // …and that matches the matrix.
    const fromMatrix = Object.entries(PORTALS)
      .filter(([, env]) => adTimingFor(env).firstLoadAd)
      .flatMap(([, env]) => Object.keys(env))
      .sort()
    expect(flags).toEqual(fromMatrix)
  })

  it('the splash-gone edge feeds it', () => {
    expect(flogo).toMatch(/notifySplashGone\(\)/)
  })

  it('there is no second first-ad path (first-PLAY module is gone)', () => {
    expect(existsSync(resolve(ROOT, 'src/use/useFirstStartInterstitial.ts'))).toBe(false)
  })
})
