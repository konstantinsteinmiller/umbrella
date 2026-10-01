/**
 * In-world cues: the coach's lessons drawn ON THE BOARD while play goes on
 * (Silent Flow, retention-roadmap #2). Minute 1 used to stop the game three
 * or four times for a staged lesson (a dimmed stage, a paused sim, a tap to
 * skip); now the board itself shows the thing, in its own style, and the
 * player keeps playing through it.
 *
 * The UI side (the FTUE, the coach) sets a cue here; BoardRenderer reads it
 * every frame. A plain object, no Vue and no DOM, so the renderer (and the
 * lab's renderers) read it for free.
 *
 *   plusPulse — the FTUE's "+1" beats: every "+1" bubble on the board sends
 *               out a slow green ring, so the eye (and the ghost finger's aim)
 *               finds it. Replaces the paused first-"+1" spotlight.
 *   danger    — the first time a monster comes within DANGER_PIP_MARCHES of
 *               the line: the danger rows and the line flash red
 *               DANGER_FLASH_BLINKS times, and the threatening monster's pip
 *               and the unit's pip swell with every flash (the same number on
 *               both). Replaces the paused threat spotlight.
 */

/** A danger flash request: a new `seq` starts one; `monsterId` is the monster
 *  whose pip swells with the unit's (-1: the unit's alone). */
export interface DangerCue {
  seq: number
  monsterId: number
}

export const worldCues: { plusPulse: boolean; danger: DangerCue } = {
  plusPulse: false,
  danger: { seq: 0, monsterId: -1 }
}

/** How long a danger flash runs (board seconds: it waits while paused). */
export const DANGER_FLASH_S = 1.5
/** Red flashes in that time. */
export const DANGER_FLASH_BLINKS = 3

/** Flash the danger rows once, with `monsterId`'s pip swelling beside the unit's. */
export const flashDanger = (monsterId: number): void => {
  worldCues.danger = { seq: worldCues.danger.seq + 1, monsterId }
}

/** The FTUE's "+1" beats are on (or over). */
export const setPlusPulse = (on: boolean): void => {
  worldCues.plusPulse = on
}

/**
 * The flash's strength at `u` = elapsed / DANGER_FLASH_S: DANGER_FLASH_BLINKS
 * bright peaks, dark between them, 0 outside [0, 1). Reduced motion gets one
 * steady glow that fades out (a colour change, not a blink).
 */
export const dangerFlashK = (u: number, reduced = false): number => {
  if (!(u >= 0 && u < 1)) return 0
  if (reduced) return 1 - u
  const s = Math.sin(Math.PI * DANGER_FLASH_BLINKS * u)
  return s * s
}
