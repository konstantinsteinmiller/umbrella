// ─── "Which builds pay for rewards with an AD, and which with COINS?" ───────
//
// This repo's version of that predicate is `buffsCostCoins` in `useUser.ts`:
//
//     buffsCostCoins = isBasicLaunch || (isCrazyWeb && !CRAZY_GAMES_FULL_RELEASE)
//
// …and `isBasicLaunch` is defined by ENUMERATION — "none of the platform flags
// is set". That enumeration is the trap. A new portal whose flag is missing
// from it is classified as a basic launch, so `useReward.redeem()` takes the
// COIN arm: Rally / Instant Spawn / 2x Damage silently start charging 1000 gold
// instead of playing a rewarded video, `rewardAvailable` stops consulting
// `isRewardedReady`, and every rewarded impression on the platform is lost.
// Nothing errors. The buttons even look right — they just advertise a coin
// price while a live rewarded unit sits behind them.
//
// That exact miss has happened to every portal added after CrazyGames in the
// sibling projects, because the predicate does not live in `src/platforms/`, is
// not named `resolve*`, and no registry test covered it. So this spec is
// table-driven over EVERY rewarded-capable build: adding the next portal and
// forgetting the enumeration fails here loudly instead of shipping quietly.

import { afterEach, describe, expect, it, vi } from 'vitest'

/** Every build flag that means "this platform can serve a rewarded video". */
const REWARD_CAPABLE_BUILDS = [
  'VITE_APP_GAME_DISTRIBUTION',
  'VITE_APP_PLAYGAMA',
  'VITE_APP_GAMEPIX',
  'VITE_APP_GAME_MONETIZE',
  'VITE_APP_YANDEX',
  'VITE_APP_POKI'
] as const

const loadUser = async () => {
  vi.resetModules()
  return await import('@/use/useUser')
}

describe('buffsCostCoins — rewarded ads vs coin purchases per build', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each(REWARD_CAPABLE_BUILDS)('%s builds pay with a rewarded AD, not coins', async (flag) => {
    vi.stubEnv(flag, 'true')
    const { buffsCostCoins, isBasicLaunch } = await loadUser()

    // Both assertions matter. The second is the ROOT cause the first would
    // otherwise only hint at: a portal missing from the `isBasicLaunch`
    // enumeration reads as "no platform at all".
    expect(isBasicLaunch, `${flag} is missing from isBasicLaunch`).toBe(false)
    expect(buffsCostCoins, `${flag} would charge coins instead of showing an ad`).toBe(false)
  })

  it('the Poki build reports itself as a Poki build', async () => {
    vi.stubEnv('VITE_APP_POKI', 'true')
    const { isPoki } = await loadUser()
    expect(isPoki).toBe(true)
  })

  it('the plain web build (no platform flag) still pays with coins', async () => {
    const { buffsCostCoins, isBasicLaunch } = await loadUser()
    // No ad SDK runs here, so a rewarded placement could never fill — the coin
    // price is what keeps the game balanced and playable.
    expect(isBasicLaunch).toBe(true)
    expect(buffsCostCoins).toBe(true)
  })

  it('a CrazyGames build that is not a full release still pays with coins', async () => {
    vi.stubEnv('VITE_APP_CRAZY_WEB', 'true')
    vi.stubEnv('VITE_APP_CRAZY_GAMES_FULL_RELEASE', '')
    const { buffsCostCoins } = await loadUser()
    // CG only serves rewarded inventory on a full release; before that the
    // placements are coin-priced. This is the one deliberate `true`.
    expect(buffsCostCoins).toBe(true)
  })
})
