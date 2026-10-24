// ─── Kite art: switch the painted layer on and stage its loading ───────────
//
// KITE ONLY: `startKiteArt()` is reached through a dynamic import inside an
// `isKite` branch (useAssets.ts), so in every other build neither this module
// nor the sheets it loads exist. It fills the `kiteArt` slots once and starts
// the three loading tiers; the returned promise is tier 0, which the splash
// waits for (capped — a slow sheet never strands it: the vector drawing
// stands in until the paint arrives).
import { LEVELS } from '../levels'
import { kiteArt } from './hooks'
import { KITE_PAINTERS, paintedArt, setPaintedArt } from './paint'
import { loadSheets, refreshSheets, sheetStatus, tiersFor } from './sheets'

let started: Promise<void> | null = null

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
  started = (async () => {
    const { level, introSeen } = await resumeState()
    const [t0, t1, t2] = tiersFor(LEVELS, level, introSeen)
    await loadSheets(t0, 'high')
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
