// Ambient declarations for Vite virtual modules. This file is a SCRIPT (no
// top-level import/export), so `declare module 'x'` is a GLOBAL ambient module
// declaration — resolvable from any importer — rather than a scoped module
// augmentation (which is what it becomes inside a module d.ts like env.d.ts).

declare module 'virtual:public-override-manifest' {
  // Public-relative paths of every file under public/audio + public/images at
  // build time (e.g. 'audio/sfx/foo.ogg', 'images/attacks/bar_128x128.webp').
  // Drives the drop-in probes so they only request files that actually exist.
  const paths: string[]
  export default paths
}

declare module 'virtual:leaderboard-snapshot' {
  // The leaderboard as baked into this bundle (see `leaderboardSnapshotPlugin`
  // in vite.config.ts). Builds WITH a live endpoint bake the last real board as
  // the bottom rung of the offline ladder; builds without one (Poki, Yandex,
  // Playgama/YouTube) bake the SEEDED board from `data/leaderboard-seed.json`.
  // `null` when no usable file exists — the game then has no leaderboard.
  const snapshot: {
    updatedAt: number
    total: number
    entries: { rank: number; name: string; score: number; flair: number }[]
    /** `[score, howManyPlayersHaveIt]`, ordered score DESC. */
    dist: [number, number][]
  } | null
  export default snapshot
}

declare module 'virtual:campaign-order' {
  // data/campaign-order.json: { editedAt, order: [{ id, custom?, level? }] } — the
  // editor's Reorder dialog; {} while the campaign plays in the authored order.
  const order: unknown
  export default order
}

declare module 'virtual:campaign-overrides' {
  // Map of level id (as string keys, since JSON) → LevelDef: data/campaign-overrides.json,
  // written by the level editor through the dev-only Vite endpoints.
  const overrides: Record<string, unknown>
  export default overrides
}
