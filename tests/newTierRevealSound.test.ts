import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// The new-tier reveal SFX (`scripts/sfx/render-new-tier-reveal.mjs`).
//
// It is the one one-shot the quiet-first-session rule lets through: the
// tutorial's own merge (T1+T1 → T2) and field merge (→ T3) are the player's
// first two discoveries, and a silent reveal there would teach the opposite of
// what the moment is for.

beforeEach(() => {
  vi.resetModules()
  // jsdom has no media playback; the HTMLAudio fallback only needs play() to exist.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
})

afterEach(() => {
  vi.doUnmock('@/use/useTutorial')
  vi.doUnmock('@/use/useAssets')
  vi.restoreAllMocks()
})

const sounds = async ({ inTutorial, suspended = false }: { inTutorial: boolean; suspended?: boolean }) => {
  vi.doMock('@/use/useTutorial', async (importOriginal) => {
    const { ref } = await import('vue')
    return { ...(await importOriginal<typeof import('@/use/useTutorial')>()), tutorialActive: ref(inTutorial) }
  })
  vi.doMock('@/use/useAssets', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/use/useAssets')>()),
    // No Web Audio in jsdom → the HTMLAudio fallback, which returns its element.
    getAudioContext: () => null,
    isAudioSuspended: () => suspended
  }))
  return (await import('@/use/useSound')).default()
}

describe('the new-tier reveal SFX', () => {
  it('ships as a real file, so it plays itself rather than a placeholder', async () => {
    expect(existsSync(resolve(__dirname, '../public/audio/sfx/new-tier-reveal.ogg'))).toBe(true)
    const { SFX_FALLBACKS } = await import('@/use/useSound')
    expect(SFX_FALLBACKS['new-tier-reveal']).toBeUndefined()
  })

  it('is heard during the tutorial, where the first two discoveries happen', async () => {
    const { playSound } = await sounds({ inTutorial: true })
    expect(playSound('new-tier-reveal', 0.07)).not.toBeNull()
    // …while the quiet-first-session rule still holds for everything else.
    expect(playSound('merge-pop', 0.05)).toBeNull()
    expect(playSound('field-merge', 0.05)).toBeNull()
  })

  it('plays normally once the tutorial is done', async () => {
    const { playSound } = await sounds({ inTutorial: false })
    expect(playSound('new-tier-reveal', 0.07)).not.toBeNull()
    expect(playSound('merge-pop', 0.05)).not.toBeNull()
  })

  it('still obeys the ad / hidden-tab hard mute', async () => {
    const { playSound } = await sounds({ inTutorial: true, suspended: true })
    expect(playSound('new-tier-reveal', 0.07)).toBeNull()
  })
})
