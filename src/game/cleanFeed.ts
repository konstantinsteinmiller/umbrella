/**
 * Clean-feed flag for the gameplay video pipeline (`tools/preview-video`).
 *
 * Portal specs keep asking for "pure gameplay — no text, score counters, UI or
 * logos". The recorder hides the interface that floats OVER the playfield by
 * itself (`clean.hide` in `tools/preview-video/preview.config.mjs`: HP bars,
 * damage numbers, tier badges, banners, spell buttons). It hides with
 * `visibility`, which keeps every box — right for an overlay, wrong for the HUD
 * rows that SHAPE the layout: the top bar, the upgrade row, the utility stacks
 * beside the grid and the spawn row would leave empty bands where they were.
 *
 * So `?clean=1` drops those rows from the scene itself, and the arena and the
 * merge grid grow into the whole frame. DEV only, resolved once at module load:
 * statically false in every platform build, so a player's game can never hide
 * its own interface.
 */
export const CLEAN_FEED: boolean = import.meta.env.DEV && (() => {
  try { return new URLSearchParams(window.location.search).get('clean') === '1' } catch { return false }
})()
