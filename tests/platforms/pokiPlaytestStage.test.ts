// Poki playtest recordings were black but for confetti: the recorder films the
// LARGEST canvas unless told otherwise — the full-window particle canvas. The
// stage (utils/pokiPlaytestStage.ts) is handed to `playtestSetCanvas`, paints
// the picture only while the recorder films it, and never turns on the SDK's
// DOM capture (a 2+ s freeze per snapshot on a phone).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetPokiPlaytestStage, fitLines, installPokiPlaytestStage, readArt, readHud } from '@/utils/pokiPlaytestStage'

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

  it('outlines the HUD with what the player reads on it, a line per entry', () => {
    document.body.innerHTML = `
      <button aria-label="Settings"></button>
      <button><span>SCHADEN</span><span>12</span></button>
      <div role="group" aria-label="Tray: 1 of 2 balls" data-tut="tray"></div>
      <div aria-hidden="true"><button>hidden twin</button></div>`
    // jsdom lays nothing out (and has no innerText): give every element a box,
    // and the chip its lines as a browser reads them.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 10, width: 80, height: 40, right: 90, bottom: 50, x: 10, y: 10, toJSON: () => ({}) } as DOMRect)
    Object.defineProperty(document.querySelectorAll('button')[1], 'innerText', { value: 'SCHADEN\n×1 → ×1.25\n12' })
    const lines = readHud().map((b) => b.lines)
    expect(lines).toContainEqual(['Settings'])
    // One entry per line — never joined into one string for a 66 px chip.
    expect(lines).toContainEqual(['SCHADEN', '×1 → ×1.25', '12'])
    // A tray with nothing of its own to draw falls back to its aria-label.
    expect(lines).toContainEqual(['Tray: 1 of 2 balls'])
    expect(lines.flat()).not.toContain('hidden twin')
  })

  it('draws the tray from its sockets, balls and count — not its aria-label', () => {
    document.body.innerHTML = `
      <div role="group" aria-label="Tray: 1 of 2 balls" data-tut="tray">
        <div class="tray-slot"><div class="unit-holder">
          <div class="orb" style="--rim: #ff6a2a"><img class="orb__portrait" alt=""><span class="orb__tier">3</span></div>
          <span class="orb__count">×2</span>
        </div></div>
        <div class="tray-slot"><div class="tray-socket" aria-hidden="true"></div></div>
        <span class="tray-count">1/2</span>
      </div>`
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 10, width: 30, height: 30, right: 40, bottom: 40, x: 10, y: 10, toJSON: () => ({}) } as DOMRect)
    const [tray] = readHud()
    expect(tray.lines).toEqual([])
    expect(tray.sockets).toHaveLength(1)
    expect(tray.orbs).toHaveLength(1)
    const [orb] = tray.orbs
    expect(orb.rim).toBe('#ff6a2a')
    expect(orb.img).toBeInstanceOf(HTMLImageElement)
    expect(orb.tier?.text).toBe('3')
    expect(orb.count?.text).toBe('×2')
    expect(tray.texts.map((p) => p.text)).toEqual(['1/2'])
  })

  it('reads HUD art (the boss preview) even though it is aria-hidden', () => {
    document.body.innerHTML = `
      <div class="boss-preview" aria-hidden="true" data-poki-stage-art="silhouette" style="--aura: 178, 77, 255">
        <img src="/enemies/bosses/orc_256x256.webp" alt="">
        <span data-poki-stage-glow></span><span data-poki-stage-glow></span>
      </div>`
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 10, width: 40, height: 40, right: 50, bottom: 50, x: 10, y: 10, toJSON: () => ({}) } as DOMRect)
    const [art] = readArt()
    expect(art).toBeDefined()
    expect(art.img).toBeInstanceOf(HTMLImageElement)
    expect(art.glows).toHaveLength(2)
    expect(art.aura).toBe('178, 77, 255')
    // …and it is no labelled HUD box.
    expect(readHud()).toHaveLength(0)
  })

  describe('fitLines', () => {
    // A stand-in font: every glyph is 0.6 × the size wide.
    const measure = (text: string, size: number): number => Array.from(text).length * size * 0.6

    it('shrinks only the line that is too wide, and never below the box', () => {
      const rows = fitLines(['DANO', '×1 → ×1,25', '12'], 66, 60, measure)
      expect(rows.map((r) => r.text)).toEqual(['DANO', '×1 → ×1,25', '12'])
      for (const r of rows) expect(measure(r.text, r.size)).toBeLessThanOrEqual(66 - 6)
      // The long value line gave way; the short lines kept the full size.
      expect(rows[1].size).toBeLessThan(rows[0].size)
      expect(rows[2].size).toBe(rows[0].size)
      // Stacked top to bottom, inside the box.
      expect(rows[0].y).toBeLessThan(rows[1].y)
      expect(rows[1].y).toBeLessThan(rows[2].y)
      expect(rows[0].y - rows[0].size / 2).toBeGreaterThanOrEqual(0)
      expect(rows[2].y + rows[2].size / 2).toBeLessThanOrEqual(60)
    })

    it('cuts a line with "…" once the smallest size is not enough', () => {
      const [row] = fitLines(['RECOMPENSA EM MOEDAS AGORA'], 40, 30, measure)
      expect(row.size).toBe(7)
      expect(row.text.endsWith('…')).toBe(true)
      expect(measure(row.text, row.size)).toBeLessThanOrEqual(40 - 6)
    })

    it('drops the lines a short box has no height for', () => {
      expect(fitLines(['A', 'B', 'C'], 80, 14, measure)).toHaveLength(1)
      expect(fitLines([], 80, 40, measure)).toEqual([])
    })
  })
})
