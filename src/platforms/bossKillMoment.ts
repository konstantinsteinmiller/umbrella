/**
 * ─── "A boss just died" → the platform's celebration hook ──────────────────
 *
 * Shared game code (`useBarrage`) reports the moment; a platform's boot branch
 * decides what it means. On CrazyGames that is `SDK.game.happytime()` — the
 * docs name "beating bosses" as the example, and it is a non-ad call, so it
 * fires on the Basic Launch too. Every other build leaves the sink unset and
 * the report is a no-op.
 *
 * INJECTED, never imported: shared code must not import a portal SDK module
 * (it would drag the SDK into every platform's graph). `main.ts` sets the sink
 * from the CG branch only.
 */
type MomentSink = () => void

let sink: MomentSink | null = null

/** Called once from the platform's own boot branch. */
export const setBossKillMomentSink = (fn: MomentSink | null): void => {
  sink = fn
}

/** The run owner reports a boss kill. Never throws — a celebration must not
 *  break the kill that earned it. */
export const noteBossKillMoment = (): void => {
  if (!sink) return
  try {
    sink()
  } catch { /* the SDK wrapper already logs; nothing to add here */ }
}
