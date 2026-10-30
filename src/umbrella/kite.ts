// ─── The kite build: /umbrella/kite/ ─────────────────────────────────────────
//
// A separate deployment of the game (`pnpm build:kite`, VITE_APP_KITE=true):
//   · the 100 kite levels (kiteLevels.ts) instead of the server's campaign,
//   · the painted art (art overrides on) instead of the vector drawing,
//   · no levels bucket: nothing is pulled from or pushed to the server; the player
//     can still edit the levels locally in the level editor.
// Literal env read so Vite folds it per build.
import { devArtParam } from './devArt'

export const isKite = import.meta.env.VITE_APP_KITE === 'true'

// The lantern build: /umbrella/lantern/ (`pnpm build:lantern`, VITE_APP_LANTERN=true,
// opened by ?art=lantern). The normal game — campaign, server levels, save — drawn
// with the painted "Paper Moon" sheets (art/lantern.ts). On a dev server `?art=lantern`
// turns it on at runtime (`import.meta.env.DEV` folds that away in every build).
export const isLantern = import.meta.env.VITE_APP_LANTERN === 'true' || (import.meta.env.DEV && devArtParam() === 'lantern')

// The clay build: /umbrella/clay/ (`pnpm build:clay`, VITE_APP_CLAY=true, opened by ?art=clay). The
// normal game in the "Rainy Day Post" claymation art (art/clay.ts); on a dev server ?art=clay.
export const isClay = import.meta.env.VITE_APP_CLAY === 'true' || (import.meta.env.DEV && devArtParam() === 'clay')

/** The normal game drawn in one of its painted sets (lantern or clay): the same campaign and save,
 *  painted sheets in place of the vector drawing. What the two share lives behind this flag. */
export const paintedGame = isLantern || isClay

/** A build that carries the painted art layer (kite, lantern or clay): the painters
 *  ask its slots first. Folded per build, so every other build has no art code. */
export const artLayer = isKite || paintedGame
