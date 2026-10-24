// ─── The kite build: /umbrella/kite/ ─────────────────────────────────────────
//
// A separate deployment of the game (`pnpm build:kite`, VITE_APP_KITE=true):
//   · the 100 kite levels (kiteLevels.ts) instead of the server's campaign,
//   · the painted art (art overrides on) instead of the vector drawing,
//   · no levels bucket: nothing is pulled from or pushed to the server; the player
//     can still edit the levels locally in the level editor.
// Literal env read so Vite folds it per build.
export const isKite = import.meta.env.VITE_APP_KITE === 'true'
