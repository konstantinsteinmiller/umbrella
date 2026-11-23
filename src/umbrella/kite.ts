// ─── The dragon kite skin: /umbrella/kite/ (?art=kite) ───────────────────────
//
// The normal game in a painted skin (`pnpm build:kite`, VITE_APP_KITE=true), like the lantern:
//   · the painted baby-dragon kite art (art overrides on) instead of the vector drawing,
//   · the same campaign, levels server, community, tuning and save as the normal game, so the editor lists the
//     same levels and the same My Levels,
//   · one addition: its own first chapter of five onboarding levels (dragonLevels.ts), played before the campaign.
// Literal env read so Vite folds it per build.
import { devArtParam } from './devArt'

// On a dev server `?art=kite` turns it on at runtime, like `?art=lantern` (the cheat-mode Art dropdown, artMode.ts);
// `import.meta.env.DEV` folds that away in every build.
export const isKite = import.meta.env.VITE_APP_KITE === 'true' || (import.meta.env.DEV && devArtParam() === 'kite')

// The lantern build: /umbrella/lantern/ (`pnpm build:lantern`, VITE_APP_LANTERN=true,
// opened by ?art=lantern). The normal game — campaign, server levels, save — drawn
// with the painted "Paper Moon" sheets (art/lantern.ts). On a dev server `?art=lantern`
// turns it on at runtime (`import.meta.env.DEV` folds that away in every build).
export const isLantern = import.meta.env.VITE_APP_LANTERN === 'true' || (import.meta.env.DEV && devArtParam() === 'lantern')

/** The normal game drawn in one of its painted sets (lantern): the same campaign and save,
 *  painted sheets in place of the vector drawing. */
export const paintedGame = isLantern

/** A build that carries the painted art layer (kite or lantern): the painters
 *  ask its slots first. Folded per build, so every other build has no art code. */
export const artLayer = isKite || paintedGame
