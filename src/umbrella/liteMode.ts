// ─── Weak phones: the light look of the painted styles ──────────────────────
//
// Poki playtests (2026-10) showed the lantern build at 3-6 fps on mid-range and older phones
// (Adreno 505, Mali-G52, Mali-T860). On those the painted sky is drawn as ONE merged still picture
// (the far plate, its clouds and the town, no parallax, no drift) and the rising sky lanterns are
// left out; the level itself, the characters and the wind are unchanged.
//
// It switches on by itself, two ways, and is kept in the save (the next visit boots light):
//   · at the first frame of play, from the GPU's name (WEBGL_debug_renderer_info): the families
//     every slow playtest named (Adreno 3xx-51x, Mali-4xx/T/G3x/G5x, PowerVR Rogue GE/GX) start light
//     at once, instead of spending a first visit's first seconds at a few fps;
//   · a watchdog reads the frame times while the level is played, and a slow median turns it on.
// It never switches back by itself: a phone that was too slow once stays light.
// `?lite=1` forces it on, `?lite=0` forces it off (testing). Leaf module: the renderer reads it
// every frame.
import { ref } from 'vue'
import { getState, setState } from '@/use/useEpicState'

const KEY = 'umb_lite'

const forced = (): boolean | null => {
  if (typeof location === 'undefined') return null
  const v = new URLSearchParams(location.search).get('lite')
  return v === '1' ? true : v === '0' ? false : null
}

const FORCED = forced()
export const liteMode = ref<boolean>(FORCED ?? getState<boolean>(KEY, false) === true)

/** Frames to skip after the watchdog starts (loading, the first build of caches). */
const WARMUP = 30
/** Frames the median is taken over. */
const WINDOW = 45
/** A median frame slower than this (25 fps) switches the light look on. */
const SLOW_MS = 40

let seen = 0
const samples: number[] = []
let probed = false

/** GPU families a 2D canvas runs this game slowly on (Poki playtests, 2026-10: Adreno 505,
 *  Mali-G52, Mali-G57, Mali-T860, PowerVR Rogue GE8320 at 3-20 fps). Pure, for the tests. */
export const WEAK_GPU = /adreno[^0-9]*(3\d\d|4\d\d|50\d|51\d)\b|mali-(4\d\d|t\d+|g3\d|g5\d)\b|powervr rogue (ge|gx)\d+/i
export const isWeakGpu = (renderer: string): boolean => WEAK_GPU.test(renderer)

/** The GPU's name, from a throwaway WebGL context (lost again at once); '' when unreadable. */
const gpuName = (): string => {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl') as WebGLRenderingContext | null
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return name
  } catch {
    return ''
  }
}

const goLite = (): void => {
  liteMode.value = true
  setState(KEY, true)
}

/** Called once per drawn frame while the level is being played, with the frame's real length. */
export const watchFrame = (ms: number): void => {
  if (liteMode.value || FORCED !== null || !(ms > 0)) return
  if (!probed) {
    probed = true
    if (typeof document !== 'undefined' && isWeakGpu(gpuName())) {
      goLite()
      return
    }
  }
  // A hidden tab or a breakpoint is not a slow phone.
  if (ms > 250) return
  if (++seen <= WARMUP) return
  samples.push(ms)
  if (samples.length < WINDOW) return
  const median = [...samples].sort((a, b) => a - b)[samples.length >> 1]!
  samples.length = 0
  if (median > SLOW_MS) goLite()
}

/** The still background canvas behind the game canvas (the scene hands both over): on weak phones
 *  the painted sky is painted into it once and the game canvas clears to transparent each frame. */
export let stillSkyCanvas: { main: HTMLCanvasElement; bg: HTMLCanvasElement } | null = null
export const setStillSkyCanvas = (main: HTMLCanvasElement | null, bg: HTMLCanvasElement | null): void => {
  stillSkyCanvas = main && bg ? { main, bg } : null
  if (bg) bg.hidden = true
}

/** Specs only. */
export const __resetLiteWatch = (): void => {
  seen = 0
  probed = false
  samples.length = 0
}
