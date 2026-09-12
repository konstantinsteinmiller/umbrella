// ─── Hidden debug chord: 20 taps on the gold badge → an interstitial ────────
//
// The tester's shortcut to a REAL portal interstitial, since every shipping
// placement is paced 150-180 s and fires only on a wave countdown.
//
// What these tests pin:
//
//   1. It takes 20 taps, not 19, inside a rolling 30 s window.
//   2. One physical tap is ONE tap. The badge listens on pointerdown AND
//      touchstart AND click for cross-WebView reliability, and a single finger
//      press fires all three within ~50 ms — undeduped, the chord would trip
//      after seven real taps.
//   3. Taps that age out of the window stop counting.
//   4. It goes through `showMidgameAd`, the same entry point the real
//      placements use, so it inherits the whole audio/pause contract.
//   5. It charges the shared cadence clock, so the next countdown still owes a
//      full interval.
//   6. It refuses while an ad is already on screen.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mockProvider = {
  name: 'mock',
  isReady: ref(true),
  isRewardedReady: ref(true),
  isInterstitialReady: ref(true),
  isAdsBlocked: ref(false),
  init: vi.fn(async () => {}),
  showRewardedAd: vi.fn(async () => true),
  showMidgameAd: vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))
}

vi.mock('@/platforms/resolveAdProvider', () => ({
  resolveAdProvider: () => mockProvider
}))
vi.mock('@/use/useAssets', () => ({
  suspendAllAudio: vi.fn(),
  resumeAllAudio: vi.fn(),
  killOneShotSfx: vi.fn()
}))
vi.mock('@/use/useSound', () => ({
  useMusic: () => ({ forceStopMusic: vi.fn(), resumeMusicAfterAd: vi.fn() }),
  forceStopMusic: vi.fn(),
  resumeMusicAfterAd: vi.fn()
}))

const THRESHOLD = 20
const WINDOW_MS = 30_000
/** Comfortably past the 60 ms coalesce window. */
const TAP_SPACING_MS = 120

const load = async () => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.stubEnv('VITE_APP_CRAZY_WEB', '')
  mockProvider.isInterstitialReady.value = true
  mockProvider.showMidgameAd.mockClear()
  const chord = await import('@/use/useAdDebugChord')
  const cadence = await import('@/use/useBreakInterstitial')
  const pause = await import('@/use/useGamePause')
  chord.resetAdDebugChord()
  cadence.resetBreakInterstitial()
  pause.isAdShowing.value = false
  return { chord, cadence, pause }
}

/** N distinct physical taps, spaced so the coalesce guard lets them through. */
const tap = (chord: typeof import('@/use/useAdDebugChord'), n: number): void => {
  for (let i = 0; i < n; i++) {
    chord.registerAdChordTap()
    vi.advanceTimersByTime(TAP_SPACING_MS)
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  // Date.now() must advance with the fake clock — the chord windows on it.
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('the ad debug chord', () => {
  it('does nothing at 19 taps and fires on the 20th', async () => {
    const { chord } = await load()

    tap(chord, THRESHOLD - 1)
    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()
    expect(chord.adChordTapCount.value).toBe(THRESHOLD - 1)

    tap(chord, 1)
    await vi.advanceTimersByTimeAsync(200)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('counts one physical tap once, not three times', async () => {
    // pointerdown + touchstart + click for the SAME press, ~20 ms apart.
    const { chord } = await load()

    for (let i = 0; i < THRESHOLD - 1; i++) {
      chord.registerAdChordTap()
      vi.advanceTimersByTime(20)
      chord.registerAdChordTap()
      vi.advanceTimersByTime(20)
      chord.registerAdChordTap()
      vi.advanceTimersByTime(TAP_SPACING_MS)
    }

    expect(chord.adChordTapCount.value).toBe(THRESHOLD - 1)
    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()
  })

  it('drops taps that fall out of the 30s window', async () => {
    const { chord } = await load()

    tap(chord, 10)
    expect(chord.adChordTapCount.value).toBe(10)

    // Wait the window out, then tap the remaining 10 — the first batch is gone,
    // so this must NOT reach the threshold.
    vi.advanceTimersByTime(WINDOW_MS + 1_000)
    tap(chord, 10)

    await vi.advanceTimersByTimeAsync(200)
    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()
    expect(chord.adChordTapCount.value).toBe(10)
  })

  it('clears its readout once the window lapses with no ad', async () => {
    const { chord } = await load()

    tap(chord, 5)
    expect(chord.adChordTapCount.value).toBe(5)

    await vi.advanceTimersByTimeAsync(WINDOW_MS + 1_000)
    expect(chord.adChordTapCount.value).toBe(0)
  })

  it('charges the cadence clock so the next countdown still owes a full gap', async () => {
    const { chord, cadence } = await load()

    for (let i = 0; i < 160 * 10; i++) cadence.tickBreakInterstitial(0.1)
    expect(cadence.__breakAdElapsed()).toBeGreaterThan(150)

    tap(chord, THRESHOLD)
    await vi.advanceTimersByTimeAsync(500)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)

    // The countdown placement must now be back to zero, not still due.
    expect(cadence.__breakAdElapsed()).toBe(0)
    cadence.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(500)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('refuses while an ad is already on screen', async () => {
    const { chord, pause } = await load()
    pause.isAdShowing.value = true

    tap(chord, THRESHOLD + 5)
    await vi.advanceTimersByTimeAsync(200)

    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()
    expect(chord.adChordTapCount.value).toBe(0)
  })

  it('re-arms after the ad closes, and needs a fresh 20 taps', async () => {
    const { chord } = await load()

    tap(chord, THRESHOLD)
    await vi.advanceTimersByTimeAsync(500)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
    expect(chord.adChordTapCount.value).toBe(0)

    tap(chord, THRESHOLD - 1)
    await vi.advanceTimersByTimeAsync(200)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)

    tap(chord, 1)
    await vi.advanceTimersByTimeAsync(500)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(2)
  })
})
