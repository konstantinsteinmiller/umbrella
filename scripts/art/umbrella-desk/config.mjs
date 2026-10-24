/**
 * Where things are. The defaults are the layout the art-generation-pipeline
 * skill scaffolds, so a project built on it needs no config at all; anything
 * else goes in `art-desk.config.json` at the project root, e.g.
 *
 *   {
 *     "sheetsDir": "art/sheets",
 *     "compress": null,                      // no compressor in this project
 *     "gemini": { "gapSeconds": 180, "dailyCap": 20 }
 *   }
 *
 * Commands are argv arrays run from the project root. `node` means the Node
 * running the desk. Placeholders: {painting} is the painted file, {files} the
 * comma-joined list of files the slicer just wrote, {compressRoot} the folder
 * the compressor keys its backups by. A command set to null is skipped.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { IMAGE_TOOL_DEFAULTS, MODEL_DEFAULTS, NO_IMAGE_DEFAULTS } from './guard.mjs'

const DEFAULTS = {
  sheetsDir: 'art-sheets',
  paintedDir: 'art-sheets/painted',
  indexFile: 'art-sheets/sheet-index.json',
  // Where the slicer's `target` paths are relative to.
  outDir: 'public',
  slice: ['node', 'tools/slice-sheets.mjs', '{painting}'],
  compressRoot: 'public/images',
  // --fresh: the slicer has just written NEW originals over files that may
  // have backups from an earlier cut — see processFile in the compressor.
  compress: ['node', 'scripts/compress-images.mjs', '{compressRoot}', '--backup-dir', 'public-backup', '--fresh', '--only', '{files}'],
  // Where a manual Gemini download lands; the desk files it under the job it
  // was armed for.
  watchDir: join(homedir(), 'Downloads'),
  // Said when a job's `+ also` image is missing — how this project makes it.
  alsoHint: null,
  port: 5178,
  gemini: {
    url: 'https://gemini.google.com/app',
    // One Chrome profile for every project: sign in to Google once.
    profileDir: join(homedir(), '.art-desk', 'gemini-chrome'),
    chrome: null,
    // Extra Chrome switches for that window, e.g. ["--window-position=2000,0"].
    chromeArgs: [],
    // Between two generations: gapSeconds plus up to jitterSeconds at random.
    gapSeconds: 5,
    jitterSeconds: 10,
    // Generations per calendar day across ALL projects (counted in
    // ~/.art-desk/usage.json) — a ceiling under the account's own quota.
    dailyCap: 200,
    timeoutSeconds: 200,
    // Re-rolls when a return comes back unusable (no image, or the slicer
    // refuses its grid). Each one is another generation off the quota.
    retries: 1,
    // A reply WITHOUT an image is never re-asked in the same chat (a nudged
    // return paints from the text alone). The job fails, nothing is written;
    // noImageRetries (0 or 1) re-runs it from a FRESH chat with every
    // attachment after noImagePauseSeconds, else the queue moves on.
    noImageRetries: NO_IMAGE_DEFAULTS.noImageRetries,
    noImagePauseSeconds: NO_IMAGE_DEFAULTS.noImagePauseSeconds,
    // Stop the queue after this many failures in a row.
    maxConsecutiveFailures: 3,
    // The model picker must name one of these (case-insensitive substring)
    // and none of `deniedModels` — a model that cannot edit from the
    // attachments paints from the words alone. See guard.mjs.
    allowedModels: MODEL_DEFAULTS.allowedModels,
    deniedModels: MODEL_DEFAULTS.deniedModels,
    // true: a model picker the desk cannot read stops the queue as well.
    requireModelLabel: MODEL_DEFAULTS.requireModelLabel,
    // null = gemini.mjs's own selector for the picker.
    modelPickerSelector: null,
    // The chat's image-creation tool ("+" → "Bild erstellen"), turned on for
    // every job; a job is never sent without it. Keys merge over these.
    // true: every job's images go up as ONE side-by-side picture. Some accounts
    // (hyperg8.studio, 2026-10-06) paint from one attachment but answer two or
    // more with "I can't edit images for you yet".
    compositeAttachments: false,
    imageTool: IMAGE_TOOL_DEFAULTS
  }
}

export const loadConfig = (root) => {
  // umbrella: this desk is the Umbrella KITE art's (barrage keeps scripts/art/art-desk
  // and art-desk.config.json); its own config, its own Gemini profile.
  const file = join(root, process.env.ART_DESK_CONFIG || 'art-desk.umbrella.config.json')
  let user = {}
  if (existsSync(file)) {
    try {
      user = JSON.parse(readFileSync(file, 'utf-8'))
    } catch (e) {
      throw new Error(`${file} is not valid JSON: ${e.message}`)
    }
  }
  const c = { ...DEFAULTS, ...user, gemini: { ...DEFAULTS.gemini, ...(user.gemini ?? {}) } }
  c.gemini.imageTool = { ...IMAGE_TOOL_DEFAULTS, ...(user.gemini?.imageTool ?? {}) }
  const abs = (p) => (p ? resolve(root, p) : p)
  return {
    ...c,
    root,
    project: (() => {
      try { return JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).name } catch { return 'project' }
    })(),
    sheetsDir: abs(c.sheetsDir),
    paintedDir: abs(c.paintedDir),
    indexFile: abs(c.indexFile),
    outDir: abs(c.outDir),
    compressRoot: abs(c.compressRoot),
    watchDir: c.watchDir ? resolve(c.watchDir.replace(/^~(?=$|[\\/])/, homedir())) : null,
    gemini: { ...c.gemini, profileDir: resolve(c.gemini.profileDir.replace(/^~(?=$|[\\/])/, homedir())) }
  }
}
