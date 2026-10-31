// ─── Kite art: switch the painted layer on and stage its loading ───────────
//
// KITE AND LANTERN ONLY: `startKiteArt()` is reached through a dynamic import
// inside an `artLayer` branch (useAssets.ts), so in every other build neither this module
// nor the sheets it loads exist. It fills the `kiteArt` slots once and starts
// the three loading tiers; the returned promise is tier 0, which the splash
// waits for (capped — a slow sheet never strands it: the vector drawing
// stands in until the paint arrives).
import { LEVELS } from '../levels'
import { kiteArt } from './hooks'
import { EXTRA_SHEETS } from './manifest'
import { KITE_PAINTERS, paintedArt, setPaintedArt } from './paint'
import { hasSheet, loadSheets, refreshSheets, sheetStatus, shippedSheets, tiersFor } from './sheets'

let started: Promise<void> | null = null
let figureReady: Promise<void> | null = null

/** What the first screen must never show as the drawing: Pweeg standing (front and side), his first
 *  steps, and his umbrella. Fetched FIRST, ahead of the sky and props, and waited for longer: a slow
 *  line (Poki playtests, 2026-10) let the 6 s cap pass with Pweeg still the vector stand-in. */
const FIGURE_FIRST = ['pweeg-front', 'pweeg-idle', 'pweeg-walk', 'umbrella']

/** Pweeg and his umbrella decoded (resolves at once where none shipped). Starts the art if needed. */
export const figureArtReady = (): Promise<void> => {
  void startKiteArt()
  return figureReady ?? Promise.resolve()
}

const idle = (fn: () => void): void => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  if (typeof ric === 'function') ric(fn, { timeout: 4000 })
  else setTimeout(fn, 1500)
}

/** Where the player resumes, and whether the intro still has to play —
 *  read defensively: any failure means "a new player on level 1". */
const resumeState = async (): Promise<{ level: number; introSeen: boolean }> => {
  try {
    const { getState } = await import('@/use/useEpicState')
    const level = Math.floor(Number(getState<number>('umb_level', 0)))
    return { level: Number.isFinite(level) && level > 0 ? Math.min(level, LEVELS.length - 1) : 0, introSeen: getState<boolean>('umb_intro_seen', false) === true }
  } catch {
    return { level: 0, introSeen: false }
  }
}

export const startKiteArt = (): Promise<void> => {
  if (started) return started
  Object.assign(kiteArt, KITE_PAINTERS)
  // The figure first, on its own: nothing else competes with it for the line.
  const figure = FIGURE_FIRST.filter(hasSheet)
  figureReady = loadSheets(figure, 'high')
  started = (async () => {
    await figureReady
    const { level, introSeen } = await resumeState()
    const [t0, t1, t2] = tiersFor(LEVELS, level, introSeen)
    // The lantern's sky, collectibles and gate are on the first screen too.
    // (The parallax layers when they shipped, else the single painting.)
    const sky = shippedSheets().filter((id) => id.startsWith('backdrop-'))
    const extra = [...(sky.length ? sky : ['backdrop']), ...EXTRA_SHEETS.map((s) => s.id)].filter(hasSheet)
    await loadSheets([...t0, ...extra], 'high')
    // Tier 1 one at a time, in order, so a slow line gets the next level's
    // enemy before the late cast; tier 2 in one low-priority batch when idle.
    void (async () => {
      for (const id of t1) await loadSheets([id])
      idle(() => void loadSheets(t2, 'low'))
    })()
  })()
  return started
}

// Console hooks, DEV only (a `vite --mode kite` dev server).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__kiteArt = {
    on: () => setPaintedArt(true),
    off: () => setPaintedArt(false),
    toggle: () => setPaintedArt(!paintedArt()),
    refresh: refreshSheets,
    status: sheetStatus
  }
}
