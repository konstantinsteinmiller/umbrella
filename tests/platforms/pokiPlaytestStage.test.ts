// Poki playtest recordings were black but for confetti: the recorder films the
// LARGEST canvas unless told otherwise — the full-window particle canvas. The
// stage (utils/pokiPlaytestStage.ts) is handed to `playtestSetCanvas`, paints
// the picture only while the recorder films it, and never turns on the SDK's
// DOM capture (a 2+ s freeze per snapshot on a phone).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetPokiPlaytestStage, installPokiPlaytestStage, readHud } from '@/utils/pokiPlaytestStage'

afterEach(() => {
  __resetPokiPlaytestStage()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('Poki playtest stage', () => {
  it('hands the recorder one window-sized, invisible stage — and nothing else', () => {
    const sdk = { playtestSetCanvas: vi.fn(), playtestCaptureHtmlOn: vi.fn() }
    const stage = installPokiPlaytestStage(sdk)!
    expect(stage).not.toBeNull()
    expect(document.body.contains(stage)).toBe(true)
    expect(sdk.playtestSetCanvas).toHaveBeenCalledWith(stage)
    // The SDK's DOM capture stays off.
    expect(sdk.playtestCaptureHtmlOn).not.toHaveBeenCalled()
    expect(stage.style.opacity).toBe('0')
    expect(stage.style.pointerEvents).toBe('none')
    expect(stage.style.width).toBe('100vw')
    // A second call is a no-op.
    expect(installPokiPlaytestStage(sdk)).toBe(stage)
    expect(sdk.playtestSetCanvas).toHaveBeenCalledTimes(1)
  })

  it('an SDK without the playtest API gets no stage', () => {
    expect(installPokiPlaytestStage({})).toBeNull()
    expect(document.querySelector('[data-poki-playtest-stage]')).toBeNull()
  })

  it('paints only once the recorder films it (its captureStream call)', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    const track = { readyState: 'live' } as MediaStreamTrack
    const stream = { getVideoTracks: () => [track] } as unknown as MediaStream
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: vi.fn(() => stream) })
    const stage = installPokiPlaytestStage({ playtestSetCanvas: vi.fn() })!
    expect(raf).not.toHaveBeenCalled()
    expect(stage.captureStream(24)).toBe(stream)
    expect(raf).toHaveBeenCalledTimes(1)
    delete (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream
  })

  it('outlines the HUD with what the player reads on it', () => {
    document.body.innerHTML = `
      <button aria-label="Settings"></button>
      <button><span>SCHADEN</span><span>12</span></button>
      <div class="ball-tray" role="group" aria-label="Tray: 1 of 2 balls" data-tut="tray"><span>1</span><span>1/2</span></div>
      <div aria-hidden="true"><button>hidden twin</button></div>`
    // jsdom lays nothing out: give every element a box.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 10, width: 80, height: 40, right: 90, bottom: 50, x: 10, y: 10, toJSON: () => ({}) } as DOMRect)
    const labels = readHud().map((b) => b.label)
    expect(labels).toContain('Settings')
    expect(labels.some((l) => l.includes('SCHADEN') && l.includes('12'))).toBe(true)
    expect(labels).toContain('Tray: 1 of 2 balls')
    expect(labels).not.toContain('hidden twin')
  })
})
