// ─── The kite build: /umbrella/kite/ ─────────────────────────────────────────
//
// A separate deployment of the game (`pnpm build:kite`, VITE_APP_KITE=true):
//   · the 100 kite levels (kiteLevels.ts) instead of the server's campaign,
//   · the painted art (art overrides on) instead of the vector drawing,
//   · no levels bucket: nothing is pulled from or pushed to the server; the player
//     can still edit the levels locally in the level editor.
// Literal env read so Vite folds it per build.
export const isKite = import.meta.env.VITE_APP_KITE === 'true'

// The lantern build: /umbrella/lantern/ (`pnpm build:lantern`, VITE_APP_LANTERN=true,
// opened by ?art=lantern). The normal game — campaign, server levels, save — drawn
// with the painted "Paper Moon" sheets (art/lantern.ts).
export const isLantern = import.meta.env.VITE_APP_LANTERN === 'true'

/** A build that carries the painted art layer (kite or lantern): the painters
 *  ask its slots first. Folded per build, so every other build has no art code. */
export const artLayer = isKite || isLantern
