// Characterization tests for the CSP generator. The current implementation
// in vite.config.ts builds the CSP string by concatenating per-platform host
// arrays + per-directive extras based on env-var flags. The extracted
// generator must produce byte-identical output for the same env input.
//
// Each test sets the env input the way `loadEnv()` would in vite.config.ts
// (a Record<string, string>) and asserts properties of the generated CSP
// string.

import { describe, expect, it } from 'vitest'
import { buildCsp } from '@/platforms/csp'

const baseEnv = (): Record<string, string> => ({})

describe('buildCsp', () => {
  describe('default web (no platform flag)', () => {
    it('contains base host whitelist', () => {
      const csp = buildCsp(baseEnv())
      expect(csp).toContain('https://*.crazygames.com')
      expect(csp).toContain('https://gamedistribution.com')
      expect(csp).toContain('https://wavedash.com')
      expect(csp).toContain('https://itch.io')
      expect(csp).toContain('https://glitch.fun')
    })

    it('does NOT include GameDistribution partner hosts', () => {
      const csp = buildCsp(baseEnv())
      expect(csp).not.toContain('amazon-adsystem')
      expect(csp).not.toContain('rubiconproject')
    })

    it('does NOT open script-src or style-src to https:', () => {
      const csp = buildCsp(baseEnv())
      // The literal "https:" should not appear as a stand-alone source.
      // (It WILL appear inside specific host URLs like https://*.adnxs.com.)
      const scriptSrc = csp.match(/script-src ([^;]+)/)![1]!
      expect(scriptSrc.split(/\s+/)).not.toContain('https:')
      const styleSrc = csp.match(/style-src ([^;]+)/)![1]!
      expect(styleSrc.split(/\s+/)).not.toContain('https:')
    })

    it('img-src is locked to data: + base hosts', () => {
      const csp = buildCsp(baseEnv())
      const imgSrc = csp.match(/img-src ([^;]+)/)![1]!
      expect(imgSrc).toContain('data:')
      expect(imgSrc.split(/\s+/)).not.toContain('https:')
    })

    it('frame-src is empty (only "self" + base hosts)', () => {
      const csp = buildCsp(baseEnv())
      const frameSrc = csp.match(/frame-src ([^;]+)/)![1]!
      expect(frameSrc.split(/\s+/)).not.toContain('https:')
    })

    it('font-src is locked to data: only', () => {
      const csp = buildCsp(baseEnv())
      const fontSrc = csp.match(/font-src ([^;]+)/)![1]!
      expect(fontSrc).toContain('data:')
      expect(fontSrc.split(/\s+/)).not.toContain('https:')
    })
  })

  describe('GameDistribution build (VITE_APP_GAME_DISTRIBUTION=true)', () => {
    const env = (): Record<string, string> => ({ VITE_APP_GAME_DISTRIBUTION: 'true' })

    it('includes GD partner hosts', () => {
      const csp = buildCsp(env())
      expect(csp).toContain('https://*.amazon-adsystem.com')
      expect(csp).toContain('https://*.rubiconproject.com')
      expect(csp).toContain('https://cdn.jsdelivr.net')
      expect(csp).toContain('https://*.2mdn.net')
      expect(csp).toContain('https://fundingchoicesmessages.google.com')
    })

    it('opens script-src to https: + unsafe-inline + unsafe-eval', () => {
      const csp = buildCsp(env())
      const scriptSrc = csp.match(/script-src ([^;]+)/)![1]!
      expect(scriptSrc.split(/\s+/)).toContain('https:')
      expect(scriptSrc).toContain('\'unsafe-inline\'')
      expect(scriptSrc).toContain('\'unsafe-eval\'')
    })

    it('opens style-src to https: + unsafe-inline', () => {
      const csp = buildCsp(env())
      const styleSrc = csp.match(/style-src ([^;]+)/)![1]!
      expect(styleSrc.split(/\s+/)).toContain('https:')
      expect(styleSrc).toContain('\'unsafe-inline\'')
    })

    it('opens img-src + frame-src + media-src + font-src to https:', () => {
      const csp = buildCsp(env())
      for (const dir of ['img-src', 'frame-src', 'media-src', 'font-src']) {
        const m = csp.match(new RegExp(`${dir} ([^;]+)`))![1]!
        expect(m.split(/\s+/), dir).toContain('https:')
      }
    })

    it('opens connect-src to https: and wss:', () => {
      const csp = buildCsp(env())
      const connectSrc = csp.match(/connect-src ([^;]+)/)![1]!
      expect(connectSrc.split(/\s+/)).toContain('https:')
      expect(connectSrc.split(/\s+/)).toContain('wss:')
    })
  })

  describe('CrazyGames build (VITE_APP_CRAZY_WEB=true)', () => {
    const env = (): Record<string, string> => ({ VITE_APP_CRAZY_WEB: 'true' })

    it('includes Google ad-stack hosts so rafvertizing.js can load GPT', () => {
      const csp = buildCsp(env())
      expect(csp).toContain('https://securepubads.g.doubleclick.net')
      expect(csp).toContain('https://*.doubleclick.net')
      expect(csp).toContain('https://*.googletagservices.com')
      expect(csp).toContain('https://*.googlesyndication.com')
      expect(csp).toContain('https://*.2mdn.net')
    })

    it('includes header-bidding partner hosts the portal pulls in', () => {
      const csp = buildCsp(env())
      expect(csp).toContain('https://*.amazon-adsystem.com')
      expect(csp).toContain('https://*.adsrvr.org')
      expect(csp).toContain('https://api.rlcdn.com')
    })

    it('includes downstream GPT-loaded partner tags (RTB House, Lotame, OpenX CDN)', () => {
      const csp = buildCsp(env())
      // These three were observed being blocked AFTER GPT itself loaded.
      // Keep them present so the regression doesn't silently come back.
      expect(csp).toContain('https://*.creativecdn.com')
      expect(csp).toContain('https://*.crwdcntrl.net')
      expect(csp).toContain('https://*.openxcdn.net')
    })

    it('opens frame-src and media-src to https: for nested ad creatives', () => {
      const csp = buildCsp(env())
      const frameSrc = csp.match(/frame-src ([^;]+)/)![1]!
      expect(frameSrc.split(/\s+/)).toContain('https:')
      const mediaSrc = csp.match(/media-src ([^;]+)/)![1]!
      expect(mediaSrc.split(/\s+/)).toContain('https:')
    })

    it('does NOT open script-src to https: blanket (host list is enough)', () => {
      const csp = buildCsp(env())
      const scriptSrc = csp.match(/script-src ([^;]+)/)![1]!
      expect(scriptSrc.split(/\s+/)).not.toContain('https:')
    })

    it('does NOT open img-src to https: blanket (data: + host list only)', () => {
      const csp = buildCsp(env())
      const imgSrc = csp.match(/img-src ([^;]+)/)![1]!
      expect(imgSrc.split(/\s+/)).not.toContain('https:')
      expect(imgSrc).toContain('data:')
    })
  })

  describe('Glitch build (VITE_APP_GLITCH=true)', () => {
    it('adds unsafe-inline to script-src for the iframe bootstrap', () => {
      const csp = buildCsp({ VITE_APP_GLITCH: 'true' })
      const scriptSrc = csp.match(/script-src ([^;]+)/)![1]!
      expect(scriptSrc).toContain('\'unsafe-inline\'')
    })

    it('does NOT add unsafe-eval (only GD needs that)', () => {
      const csp = buildCsp({ VITE_APP_GLITCH: 'true' })
      const scriptSrc = csp.match(/script-src ([^;]+)/)![1]!
      expect(scriptSrc).not.toContain('\'unsafe-eval\'')
    })

    it('does NOT open script-src to https:', () => {
      const csp = buildCsp({ VITE_APP_GLITCH: 'true' })
      const scriptSrc = csp.match(/script-src ([^;]+)/)![1]!
      expect(scriptSrc.split(/\s+/)).not.toContain('https:')
    })
  })

  describe('GameMonetize build (VITE_APP_GAME_MONETIZE=true)', () => {
    const env = (): Record<string, string> => ({ VITE_APP_GAME_MONETIZE: 'true' })

    it('includes the GameMonetize API hosts', () => {
      const csp = buildCsp(env())
      expect(csp).toContain('https://api.gamemonetize.com')
      expect(csp).toContain('https://*.gamemonetize.com')
    })

    it('ships the GameMonetize hosts on the GameMonetize build ONLY', () => {
      // A foreign portal host in another build's index.html is the string
      // class Yandex moderation and the Poki release gate both flag.
      for (const other of [
        {},
        { VITE_APP_CRAZY_WEB: 'true' },
        { VITE_APP_GAME_DISTRIBUTION: 'true' },
        { VITE_APP_ITCH: 'true' },
        { VITE_APP_GLITCH: 'true' },
        { VITE_APP_WAVEDASH: 'true' },
        { VITE_APP_GAMEPIX: 'true' },
        { VITE_APP_YANDEX: 'true' }
      ] as Record<string, string>[]) {
        expect(buildCsp(other)).not.toContain('gamemonetize')
      }
    })

    it('opens script-src / img-src / frame-src to https: for the Google-IMA bidder chain', () => {
      const csp = buildCsp(env())
      const scriptSrc = csp.match(/script-src ([^;]+)/)![1]!
      expect(scriptSrc.split(/\s+/)).toContain('https:')
      const imgSrc = csp.match(/img-src ([^;]+)/)![1]!
      expect(imgSrc.split(/\s+/)).toContain('https:')
      const frameSrc = csp.match(/frame-src ([^;]+)/)![1]!
      expect(frameSrc.split(/\s+/)).toContain('https:')
    })
  })

  describe('Yandex build (VITE_APP_YANDEX=true)', () => {
    const env = (): Record<string, string> => ({ VITE_APP_YANDEX: 'true' })

    it('includes the Yandex telemetry / iframe-wrapper hosts via wildcards', () => {
      const csp = buildCsp(env())
      expect(csp).toContain('https://*.yandex.ru')
      expect(csp).toContain('https://*.yandex.com')
      expect(csp).toContain('https://*.yandex.net')
      expect(csp).toContain('https://an.yandex.ru')
    })

    it('does NOT hardcode any *.s3.yandex.* host (moderation rejects "Service storage URL detected")', () => {
      const csp = buildCsp(env())
      // The wildcard `https://*.yandex.net` covers `sdk.games.s3.yandex.net` at
      // request time via multi-level subdomain matching, so connectivity is
      // unaffected. But Yandex's static scanner greps the BUNDLE for any
      // hardcoded `s3.yandex.*` string and rejects the draft if found.
      expect(csp).not.toMatch(/s3\.yandex\./)
    })

    it('includes the Yandex Direct / AdFox / Ad Exchange hosts (per official ad-platform CSP)', () => {
      const csp = buildCsp(env())
      // These root domains are NOT subdomains of yandex.{ru,com,net} —
      // they need to be listed explicitly or the ad chain breaks silently.
      expect(csp).toContain('https://yastatic.net')
      expect(csp).toContain('https://*.adfox.ru')
      expect(csp).toContain('https://yandexadexchange.net')
      expect(csp).toContain('https://*.yandexadexchange.net')
    })

    it('opens script-src / img-src / frame-src to https: for the Yandex ad-tech surface', () => {
      const csp = buildCsp(env())
      const scriptSrc = csp.match(/script-src ([^;]+)/)![1]!
      expect(scriptSrc.split(/\s+/)).toContain('https:')
      const imgSrc = csp.match(/img-src ([^;]+)/)![1]!
      expect(imgSrc.split(/\s+/)).toContain('https:')
      const frameSrc = csp.match(/frame-src ([^;]+)/)![1]!
      expect(frameSrc.split(/\s+/)).toContain('https:')
    })

    it('does NOT ship the Yandex ad-tech hosts on non-Yandex builds', () => {
      const csp = buildCsp({})
      expect(csp).not.toContain('https://yastatic.net')
      expect(csp).not.toContain('https://*.adfox.ru')
      expect(csp).not.toContain('yandexadexchange')
    })

    it('does NOT leak third-party storage / service URLs (moderation rule)', () => {
      const csp = buildCsp(env())
      // Yandex's moderator flags ANY third-party "service storage" URL it
      // finds in the bundle (including the CSP meta tag). These were legacy
      // allowlist remnants from other-platform integrations that no runtime
      // code on this project actually uses — they must NOT be in the Yandex
      // build's CSP.
      expect(csp).not.toContain('jsonbin')
      expect(csp).not.toContain('getpantry')
      expect(csp).not.toContain('pantry.cloud')
      expect(csp).not.toContain('peerjs')
      expect(csp).not.toContain('sentry')
    })

    it('does NOT leak other-portal hosts (the build is for Yandex only)', () => {
      const csp = buildCsp(env())
      // Same moderation rule — other portals' own hosts shouldn't show up
      // on a Yandex submission. (Most aren't "storage" URLs per se, but
      // they're irrelevant noise and risk extra moderator scrutiny.)
      expect(csp).not.toContain('crazygames')
      expect(csp).not.toContain('wavedash')
      expect(csp).not.toContain('itch.io')
      expect(csp).not.toContain('glitch.fun')
      expect(csp).not.toContain('gamedistribution')
      expect(csp).not.toContain('playgama')
      expect(csp).not.toContain('gamepix')
      expect(csp).not.toContain('gamemonetize')
      expect(csp).not.toContain('clarity.ms')
    })
  })

  describe('Playgama build (= the YouTube Playables submission)', () => {
    it('emits NO policy at all', () => {
      // A CSP meta tag applies to the whole DOCUMENT, and on Playables that
      // document is shared with YouTube's own runtime — their SDK and their
      // telemetry. Any host we forget is a host we silently break for THEM,
      // with nothing surfaced on our side. `vite.config.ts` skips the tag for
      // this build too; this is the unit-testable half of the same rule.
      expect(buildCsp({ VITE_APP_PLAYGAMA: 'true' })).toBe('')
    })

    it('stays empty even when another flag leaks in from the base .env', () => {
      expect(buildCsp({
        VITE_APP_PLAYGAMA: 'true',
        VITE_APP_GAME_DISTRIBUTION: 'true'
      })).toBe('')
    })

    it('still emits a policy when the flag is off', () => {
      expect(buildCsp({ VITE_APP_PLAYGAMA: 'false' })).not.toBe('')
    })

    it('no longer names bridge.playgama.com on ANY build', () => {
      // v2 is bundled from npm; nothing fetches the CDN host any more, so the
      // string has no business surviving in a shipped policy.
      for (const env of [{}, { VITE_APP_CRAZY_WEB: 'true' }, { VITE_APP_GAMEPIX: 'true' }]) {
        expect(buildCsp(env)).not.toContain('bridge.playgama.com')
      }
    })
  })

  describe('GamePush build (one archive fanned out to many portals)', () => {
    it('emits NO policy at all', () => {
      // GamePush injects its own SDK and each host portal's ad stack into our
      // document; a meta CSP would silently break whichever host we forgot.
      expect(buildCsp({ VITE_APP_GAMEPUSH: 'true' })).toBe('')
    })

    it('stays empty even when another flag leaks in from the base .env', () => {
      expect(buildCsp({ VITE_APP_GAMEPUSH: 'true', VITE_APP_CRAZY_WEB: 'true' })).toBe('')
    })

    it('still emits a policy when the flag is off', () => {
      expect(buildCsp({ VITE_APP_GAMEPUSH: 'false' })).not.toBe('')
    })

    it('never names gamepush on any other build', () => {
      for (const env of [{}, { VITE_APP_CRAZY_WEB: 'true' }, { VITE_APP_YANDEX: 'true' }, { VITE_APP_GAMEPIX: 'true' }]) {
        expect(buildCsp(env)).not.toContain('gamepush')
      }
    })
  })

  describe('directive ordering and shape', () => {
    it('emits all 8 standard directives separated by "; "', () => {
      const csp = buildCsp(baseEnv())
      for (const dir of ['default-src', 'script-src', 'style-src', 'img-src', 'connect-src', 'frame-src', 'media-src', 'font-src']) {
        expect(csp).toContain(dir)
      }
      // Should be separated by "; " (semicolon + space) per CSP convention.
      expect(csp.split('; ').length).toBe(8)
    })

    it('every directive starts with "self"', () => {
      const csp = buildCsp(baseEnv())
      for (const directive of csp.split('; ')) {
        expect(directive).toMatch(/^[a-z-]+ 'self'/)
      }
    })
  })

  describe('global leaderboard endpoint', () => {
    const connectSrc = (csp: string): string[] =>
      csp.match(/connect-src ([^;]+)/)![1]!.split(/\s+/)

    it('folds the Worker ORIGIN into connect-src — never the path', () => {
      // A CSP source with a path is a path-PREFIX match, so the configured URL
      // must be reduced to its origin or `/top` could be refused.
      const csp = buildCsp({ VITE_LEADERBOARD_URL: 'https://board.example.workers.dev/api/' })
      expect(connectSrc(csp)).toContain('https://board.example.workers.dev')
      expect(csp).not.toContain('board.example.workers.dev/api')
    })

    it('adds nothing when the build has no endpoint', () => {
      expect(buildCsp({ VITE_LEADERBOARD_URL: '' })).not.toContain('workers.dev')
      expect(buildCsp(baseEnv())).not.toContain('workers.dev')
    })

    it('never lets a malformed URL take the build down', () => {
      expect(() => buildCsp({ VITE_LEADERBOARD_URL: 'not a url' })).not.toThrow()
      expect(buildCsp({ VITE_LEADERBOARD_URL: 'not a url' })).not.toContain('not a url')
    })

    it('keeps the endpoint off a Yandex policy even if the env var leaked in', () => {
      // Yandex moderation greps the bundle, CSP tag included, for third-party
      // storage endpoints — belt and braces with the empty `.env.yandex.local`.
      const csp = buildCsp({ VITE_APP_YANDEX: 'true', VITE_LEADERBOARD_URL: 'https://board.example.workers.dev' })
      expect(csp).not.toContain('workers.dev')
    })
  })
})
