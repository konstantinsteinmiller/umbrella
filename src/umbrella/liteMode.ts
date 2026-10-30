// ─── Weak phones: the light look of the painted styles ──────────────────────
//
// Poki playtests (2026-10) showed the lantern build at 3-6 fps on mid-range and older phones
// (Adreno 505, Mali-G52, Mali-T860). On those the painted sky is drawn as ONE merged still picture
// (the far plate, its clouds and the town, no parallax, no drift) and the rising sky lanterns are
// left out; the level itself, the characters and the wind are unchanged.
//
// It switches on by itself: a watchdog reads the frame times while the level is played, and a
// slow median turns the light look on for good (kept in the save, so the next visit boots light).
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
const WARMUP = 60
/** Frames the median is taken over. */
const WINDOW = 90
/** A median frame slower than this (25 fps) switches the light look on. */
const SLOW_MS = 40

let seen = 0
const samples: number[] = []

/** Called once per drawn frame while the level is being played, with the frame's real length. */
export const watchFrame = (ms: number): void => {
  if (liteMode.value || FORCED !== null || !(ms > 0)) return
  // A hidden tab or a breakpoint is not a slow phone.
  if (ms > 250) return
  if (++seen <= WARMUP) return
  samples.push(ms)
  if (samples.length < WINDOW) return
  const median = [...samples].sort((a, b) => a - b)[samples.length >> 1]!
  samples.length = 0
  if (median > SLOW_MS) {
    liteMode.value = true
    setState(KEY, true)
  }
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
  samples.length = 0
}
