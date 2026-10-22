// ─── Where the level editor may open ────────────────────────────────────────
// Poki and YouTube Playables (shipped from the Playgama build) allow no outside
// links or servers and no routes of our own: there players only open shared
// levels, and the editor route is closed (the router redirects it home).
// Literal env reads so Vite folds them per build.
export const editorAllowed = !(import.meta.env.VITE_APP_POKI === 'true' || import.meta.env.VITE_APP_PLAYGAMA === 'true')
