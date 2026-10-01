// T0.4 — the aim drag at a portal iframe's edge. Checked in the real game in a
// cross-origin iframe (2026-09-27): Firefox 155 delivers the pointerup of a
// mouse drag released past the frame's edge; Chrome 154 delivered NONE — the
// capture dangled until the mouse came back in, then arrived as a
// lostpointercapture (then a button-up move), and the board cancelled the aim:
// the shot was silently lost. A release always fires what the preview shows,
// so the board now takes those as the release they were — the LAST preview
// fires, exactly once — while a touch that loses capture is still cancelled
// (the system took it; it always sees its pointerup otherwise).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { BoardRenderer } from '@/barrage/render/BoardRenderer'
import { BOARD_SOURCE_KEY, type BoardSource } from '@/barrage/render/source'
import BarrageBoard from '@/components/barrage/BarrageBoard.vue'
import { MIN_AIM, type EngineListener, type IBarrageEngine } from '@/barrage/engine/types'
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

describe('BarrageBoard: an aim released where the frame never saw it', () => {
  const realRO = globalThis.ResizeObserver
  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.ResizeObserver = realRO
  })

  const mountBoard = () => {
    // jsdom: no layout, no ResizeObserver, no matchMedia, no pointer capture.
    globalThis.ResizeObserver = class { observe(): void {} disconnect(): void {} unobserve(): void {} } as unknown as typeof ResizeObserver
    if (!window.matchMedia) {
      window.matchMedia = ((): MediaQueryList => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia
    }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 390, 700))
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const e = board({ monsters: [mon('slime', 1, 2)] })
    const engine = shallowRef(e as unknown as IBarrageEngine)
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
    // The angle the preview shows, as the renderer is told it.
    const preview = vi.spyOn(BoardRenderer.prototype, 'setAim')
    const Host = defineComponent({
      provide: { [BOARD_SOURCE_KEY as symbol]: source },
      render: () => h(BarrageBoard)
    })
    const w = mount(Host, { attachTo: document.body })
    const vm = w.findComponent(BarrageBoard)
    const canvas = w.find('canvas').element as HTMLCanvasElement
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const ptr = (type: string, x: number, y: number, o: { buttons?: number; pointerType?: string } = {}): MouseEvent => {
      const ev = new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: o.buttons ?? 0, bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'pointerId', { value: 1 })
      Object.defineProperty(ev, 'pointerType', { value: o.pointerType ?? 'mouse' })
      return ev
    }
    const on = (t: EventTarget, type: string, x: number, y: number, o?: { buttons?: number; pointerType?: string }): void => {
      now += 50
      t.dispatchEvent(ptr(type, x, y, o))
    }
    const count = (name: string): number => vm.emitted(name)?.length ?? 0
    const lastPreview = (): number => preview.mock.lastCall![1]
    const backToAim = (): void => {
      e.recall()
      for (let i = 0; i < 600 && e.state.phase !== 'aim'; i++) e.update(DT)
      expect(e.state.phase).toBe('aim')
    }
    return { w, vm, e, canvas, fired, ptr, on, count, lastPreview, backToAim }
  }

  it('Firefox: the pointerup comes from past the edge — one shot; the trailing lost capture adds nothing', () => {
    const b = mountBoard()
    b.on(b.canvas, 'pointerdown', 120, 200, { buttons: 1 })
    b.on(b.canvas, 'pointermove', 60, 205, { buttons: 1 })
    // Captured: moves keep coming from outside the canvas's box (the frame's edge).
    b.on(b.canvas, 'pointermove', -70, 210, { buttons: 1 })
    b.on(b.canvas, 'pointerup', -70, 210)
    b.on(b.canvas, 'lostpointercapture', -70, 210)
    expect(b.fired).toHaveLength(1)
    // Up and to the left, inside the fan.
    expect(b.fired[0]!).toBeGreaterThan(UP)
    expect(b.fired[0]!).toBeLessThanOrEqual(Math.PI - MIN_AIM)
    expect(b.count('fired')).toBe(1)
    expect(b.count('aimCancel')).toBe(0)
    b.w.unmount()
  })

  it('Chrome: no pointerup — the dangling capture is dropped when the mouse comes back; the LAST preview fires, once', () => {
    const b = mountBoard()
    b.on(b.canvas, 'pointerdown', 120, 200, { buttons: 1 })
    b.on(b.canvas, 'pointermove', 330, 150, { buttons: 1 })
    const shown = b.lastPreview()
    expect(shown).toBeLessThan(UP)
    // Let go past the frame's edge: nothing arrives. The mouse comes back far to
    // the LEFT — the preview it left behind is the shot, not this point.
    b.on(b.canvas, 'lostpointercapture', 15, 420)
    expect(b.fired).toEqual([shown])
    b.on(b.canvas, 'pointermove', 15, 420)
    b.on(b.canvas, 'pointerup', 15, 420)
    expect(b.fired).toHaveLength(1)
    expect(b.count('aimCancel')).toBe(0)
    expect(b.count('misfire')).toBe(0)
    b.w.unmount()
  })

  it('…and a move with the button up is that release too, when no lost capture comes first', () => {
    const b = mountBoard()
    b.on(b.canvas, 'pointerdown', 120, 200, { buttons: 1 })
    b.on(b.canvas, 'pointermove', 330, 150, { buttons: 1 })
    const shown = b.lastPreview()
    b.on(b.canvas, 'pointermove', 15, 420)
    expect(b.fired).toEqual([shown])
    b.on(b.canvas, 'lostpointercapture', 15, 420)
    expect(b.fired).toHaveLength(1)
    b.w.unmount()
  })

  it('an aim begun on a tray orb resolves on the button-up move — its stale aim never fires on the next click', () => {
    const b = mountBoard()
    const down = b.ptr('pointerdown', 195, 690, { buttons: 1 })
    expect((b.vm.vm as unknown as { beginAimFrom(e: PointerEvent): boolean }).beginAimFrom(down as PointerEvent)).toBe(true)
    // Its window listeners track the drag; it leaves the orb (an ordinary aim now)…
    b.on(window, 'pointermove', 300, 420, { buttons: 1 })
    const shown = b.lastPreview()
    // …is let go past the frame's edge; the frame hears of it only on the way back.
    b.on(window, 'pointermove', 30, 100)
    expect(b.fired).toEqual([shown])
    // The next click (on the HUD, say) is only a click.
    b.on(window, 'pointerdown', 30, 100, { buttons: 1 })
    b.on(window, 'pointerup', 30, 100)
    expect(b.fired).toHaveLength(1)
    b.w.unmount()
  })

  it('a touch that loses its capture is still cancelled: no shot, no misfire', () => {
    const b = mountBoard()
    b.on(b.canvas, 'pointerdown', 120, 200, { buttons: 1, pointerType: 'touch' })
    b.on(b.canvas, 'pointermove', 330, 150, { buttons: 1, pointerType: 'touch' })
    b.on(b.canvas, 'lostpointercapture', 330, 150, { pointerType: 'touch' })
    expect(b.fired).toHaveLength(0)
    expect(b.count('aimCancel')).toBe(1)
    expect(b.count('misfire')).toBe(0)
    // A touch's moves never read as a release (touch moves report the contact).
    b.backToAim()
    b.on(b.canvas, 'pointerdown', 120, 200, { buttons: 1, pointerType: 'touch' })
    b.on(b.canvas, 'pointermove', 330, 150, { buttons: 0, pointerType: 'touch' })
    expect(b.fired).toHaveLength(0)
    b.on(b.canvas, 'pointerup', 330, 150, { pointerType: 'touch' })
    expect(b.fired).toHaveLength(1)
    b.w.unmount()
  })

  it('after an unseen release the next press is a fresh aim', () => {
    const b = mountBoard()
    b.on(b.canvas, 'pointerdown', 120, 200, { buttons: 1 })
    b.on(b.canvas, 'pointermove', 330, 150, { buttons: 1 })
    b.on(b.canvas, 'lostpointercapture', 15, 420)
    expect(b.fired).toHaveLength(1)
    b.backToAim()
    b.on(b.canvas, 'pointerdown', 60, 220, { buttons: 1 })
    b.on(b.canvas, 'pointerup', 60, 220)
    expect(b.fired).toHaveLength(2)
    expect(b.fired[1]!).toBeGreaterThan(UP)
    b.w.unmount()
  })
})
