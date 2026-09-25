// Playtest run 5: players who TAP never saw the aim preview — it shows only
// while a finger is down, and a tap is down for a blink ("no pre-shot aim line
// is shown before release"). A tap-fire now flashes the bounce path the drag
// preview shows for ~0.3 s as the ball leaves; a drag already showed it.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { TAP_MS, TapWatch } from '@/barrage/render/aim'
import { BoardRenderer } from '@/barrage/render/BoardRenderer'
import { BOARD_SOURCE_KEY, type BoardSource } from '@/barrage/render/source'
import BarrageBoard from '@/components/barrage/BarrageBoard.vue'
import type { AimPath, EngineListener, IBarrageEngine } from '@/barrage/engine/types'
import { board, mon } from '../engine/helpers'

beforeAll(() => {
  const noop: unknown = new Proxy(function () {}, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => 8 : noop),
    apply: () => noop,
    set: () => true
  })
  HTMLCanvasElement.prototype.getContext = (() => noop) as unknown as HTMLCanvasElement['getContext']
})

const DT = 1 / 60
const UP = Math.PI / 2

describe('TapWatch: a tap is a quick press that never strayed', () => {
  it('a release where it went down, quickly, is a tap; a drag or a long press is not', () => {
    const w = new TapWatch()
    w.press(100, 200, 1000, 50)
    w.move(104, 203)
    expect(w.isTap(1000 + 120)).toBe(true)
    expect(w.isTap(1000 + TAP_MS + 1)).toBe(false)
    // Strayed past the slop (0.2 cell, at least 8 px) → a drag, for good.
    w.move(100, 200 + 11)
    w.move(100, 200)
    expect(w.isTap(1000 + 120)).toBe(false)
    // Small cells: the slop never drops under 8 px.
    w.press(0, 0, 0, 10)
    w.move(7, 0)
    expect(w.isTap(50)).toBe(true)
    w.move(9, 0)
    expect(w.isTap(50)).toBe(false)
  })
})

describe('the renderer\'s tap-fire flash', () => {
  const rig = (reduced = false) => {
    const e = board({ monsters: [mon('slime', 1, 2), mon('slime', 5, 4)] })
    const r = new BoardRenderer({ shake: () => {}, coins: () => true, confetti: () => {} })
    r.attach(document.createElement('canvas'))
    r.resize(390, 700, 1)
    r.setEngine(e)
    e.on((ev) => r.onEvent(ev))
    r.reducedMotion = reduced
    const draw = vi.spyOn(r as unknown as { drawAimPath(ctx: unknown, p: AimPath, t: number, k: number): void }, 'drawAimPath')
    const frame = (): void => {
      e.update(DT)
      r.frame(DT)
    }
    return { e, r, draw, frame }
  }

  it('flashes the same bounce path the drag preview shows, fading out over ~0.3 s as the ball leaves', () => {
    const g = rig()
    const angle = 1.1
    const preview = g.e.aimPreview(angle, 2)
    expect(g.e.fire(angle)).toBe(true)
    g.r.flashShot(angle)
    expect(g.r.shotFlashing).toBe(true)
    const ks: number[] = []
    let t = 0
    while (g.r.shotFlashing && t < 1) {
      g.frame()
      t += DT
      const call = g.draw.mock.lastCall
      if (call && g.r.shotFlashing) {
        expect(call[1].points).toEqual(preview.points)
        ks.push(call[3])
      }
    }
    expect(t).toBeGreaterThan(0.26)
    expect(t).toBeLessThan(0.34)
    expect(ks.length).toBeGreaterThan(10)
    // Fading: every frame no brighter than the one before, from ~full to ~none.
    for (let i = 1; i < ks.length; i++) expect(ks[i]!).toBeLessThanOrEqual(ks[i - 1]! + 1e-9)
    expect(ks[0]!).toBeGreaterThan(0.9)
    expect(ks[ks.length - 1]!).toBeLessThan(0.25)
    // Gone: nothing more is drawn.
    g.draw.mockClear()
    for (let i = 0; i < 10; i++) g.frame()
    expect(g.draw).not.toHaveBeenCalled()
  })

  it('reduced motion: the same ~0.3 s, held at full strength (no fade animation)', () => {
    const g = rig(true)
    g.e.fire(1.9)
    g.r.flashShot(1.9)
    const ks: number[] = []
    for (let i = 0; i < 30 && g.r.shotFlashing; i++) {
      g.frame()
      if (g.r.shotFlashing) ks.push(g.draw.mock.lastCall![3])
    }
    expect(ks.length).toBeGreaterThan(10)
    expect(ks.every((k) => k === 1)).toBe(true)
  })

  it('a drag shows its preview while the finger is down and nothing after the release', () => {
    const g = rig()
    g.r.setAim(true, 1.2, true)
    g.frame()
    expect(g.draw).toHaveBeenCalled()
    g.r.setAim(false, 1.2, false)
    g.e.fire(1.2)
    g.draw.mockClear()
    for (let i = 0; i < 20; i++) g.frame()
    expect(g.draw).not.toHaveBeenCalled()
  })

  it('an engine swap drops a flash in flight', () => {
    const g = rig()
    g.e.fire(UP)
    g.r.flashShot(UP)
    g.r.setEngine(board({ monsters: [] }))
    expect(g.r.shotFlashing).toBe(false)
  })
})

describe('BarrageBoard: a TAP on the board flashes the shot, a drag does not', () => {
  const realRO = globalThis.ResizeObserver
  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.ResizeObserver = realRO
  })

  const mountBoard = () => {
    // jsdom: no layout, no ResizeObserver, no matchMedia — stand them in.
    globalThis.ResizeObserver = class { observe(): void {} disconnect(): void {} unobserve(): void {} } as unknown as typeof ResizeObserver
    if (!window.matchMedia) {
      window.matchMedia = ((): MediaQueryList => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia
    }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 390, 700))
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const e = board({ monsters: [mon('slime', 1, 2)] }) as unknown as IBarrageEngine
    const engine = shallowRef(e)
    const listeners = new Set<EngineListener>()
    e.on((ev) => listeners.forEach((l) => l(ev)))
    const fired: number[] = []
    const source: BoardSource = {
      engine,
      engineGen: ref(0),
      holdSim: ref(false),
      fire: (a) => { fired.push(a); return engine.value.fire(a) },
      onEngineEvent: (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
      selectedLauncher: ref(1),
      selectedSkin: ref('orb')
    }
    const flash = vi.spyOn(BoardRenderer.prototype, 'flashShot')
    const Host = defineComponent({
      provide: { [BOARD_SOURCE_KEY as symbol]: source },
      render: () => h(BarrageBoard)
    })
    const w = mount(Host, { attachTo: document.body })
    const canvas = w.find('canvas').element as HTMLCanvasElement
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const ptr = (type: string, x: number, y: number): void => {
      const ev = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'pointerId', { value: 7 })
      Object.defineProperty(ev, 'pointerType', { value: 'touch' })
      canvas.dispatchEvent(ev)
    }
    const advance = (ms: number): void => { now += ms }
    return { w, e, fired, flash, ptr, advance }
  }

  it('a quick tap above the unit fires and flashes that very shot', () => {
    const b = mountBoard()
    b.ptr('pointerdown', 120, 200)
    b.advance(90)
    b.ptr('pointerup', 121, 201)
    expect(b.fired).toHaveLength(1)
    expect(b.flash).toHaveBeenCalledTimes(1)
    expect(b.flash.mock.calls[0]![0]).toBe(b.fired[0])
    b.w.unmount()
  })

  it('a drag fires without a flash (its preview was on screen); so does a long press', () => {
    const b = mountBoard()
    b.ptr('pointerdown', 120, 200)
    b.advance(60)
    b.ptr('pointermove', 180, 150)
    b.advance(60)
    b.ptr('pointerup', 180, 150)
    expect(b.fired).toHaveLength(1)
    expect(b.flash).not.toHaveBeenCalled()
    // Next aim phase: a press held in place for a while (it saw its preview).
    b.e.recall()
    for (let i = 0; i < 400 && b.e.state.phase !== 'aim'; i++) b.e.update(DT)
    expect(b.e.state.phase).toBe('aim')
    b.ptr('pointerdown', 120, 200)
    b.advance(TAP_MS + 100)
    b.ptr('pointerup', 120, 200)
    expect(b.fired).toHaveLength(2)
    expect(b.flash).not.toHaveBeenCalled()
    b.w.unmount()
  })
})

