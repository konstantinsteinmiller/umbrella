import { fileURLToPath, URL } from 'node:url'
import { resolve, dirname } from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

import { defineConfig, loadEnv, type Plugin } from 'vite'
import { pullLevels } from './scripts/levels-pull.mjs'

// ─── Campaign-overrides on-disk persistence ────────────────────────────
// The level editor writes back into `data/campaign-overrides.json` so the
// stages live in the repo (committable, fine-tunable in source) rather
// than only in the user's localStorage. Two surfaces:
//   1. A virtual module `virtual:campaign-overrides` that ships the
//      current JSON as the campaign's seed override map. Resolved at
//      both dev and build time.
//   2. Dev-only middleware:
//        POST /__maw/save-override   { id, stage }   → writes to disk
//        POST /__maw/clear-override  { id }          → removes from disk
//      Production builds don't expose these — the editor button silently
//      falls back to localStorage when the endpoint is absent.
const OVERRIDES_FILE = resolve(
  fileURLToPath(new URL('./data/campaign-overrides.json', import.meta.url))
)
const OVERRIDES_VIRTUAL_ID = 'virtual:campaign-overrides'
const OVERRIDES_RESOLVED = '\0' + OVERRIDES_VIRTUAL_ID

const ensureOverridesFile = () => {
  if (!existsSync(OVERRIDES_FILE)) {
    mkdirSync(dirname(OVERRIDES_FILE), { recursive: true })
    writeFileSync(OVERRIDES_FILE, '{}\n', 'utf-8')
  }
}

const readOverridesJson = (): Record<string, unknown> => {
  ensureOverridesFile()
  try {
    const parsed = JSON.parse(readFileSync(OVERRIDES_FILE, 'utf-8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

/** What the editor's endpoint last wrote: the watcher ignores that echo, so a
 *  save does not reload the page under the editor (only hand edits reload). */
let lastOverridesWrite = ''
const writeOverridesJson = (data: Record<string, unknown>) => {
  ensureOverridesFile()
  lastOverridesWrite = JSON.stringify(data, null, 2) + '\n'
  writeFileSync(OVERRIDES_FILE, lastOverridesWrite, 'utf-8')
}

const readBody = (req: import('node:http').IncomingMessage): Promise<string> =>
  new Promise((res, rej) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => res(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', rej)
  })

// ─── Warm gameplay chunks behind the boot await-chain ──────────────────
// The 390KB entry chunk runs a serial awaited chain — platform-SDK init +
// save hydrate — BEFORE it dynamic-imports App.vue, and App only pulls the
// gameplay route (GameScene → useEpicArt) once it mounts. Those chunk
// downloads therefore START only after that gate clears, serializing extra
// round-trips on the path to the first playable frame while the same-origin
// download pipe sits idle during SDK-init/hydrate. Warm them from index.html:
//   • App.vue  → modulepreload (22KB, needed the instant hydrate resolves;
//     high priority is fine at that size and it compiles ahead of import()).
//   • GameScene + useEpicArt → prefetch (170KB/51KB, LOW priority so they
//     fill the idle pipe during boot WITHOUT contending with the entry chunk
//     or the splash's first paint; the real import() then hits a warm cache).
// modulepreload/prefetch only FETCH (+compile) — they never EXECUTE the
// module, so the localStorage-at-eval boot ordering main.ts relies on is
// untouched: eval still happens at the real post-hydrate import().
// Build-only; skipped on the GamePix single-file build (no separate chunks).
const warmGameplayChunks = (): Plugin => {
  let base = '/'
  return {
    name: 'warm-gameplay-chunks',
    apply: 'build',
    enforce: 'post',
    configResolved(cfg) { base = cfg.base || '/' },
    transformIndexHtml(html, ctx) {
      const bundle = ctx.bundle
      if (!bundle) return
      const chunks = Object.values(bundle).filter(
        (c): c is import('vite').Rollup.OutputChunk => c.type === 'chunk'
      )
      const chunkByName = (name: string) => chunks.find((c) => c.name === name)
      const entryFile = chunks.find((c) => c.isEntry)?.fileName
      const href = (f: string) => (base.endsWith('/') ? base : base + '/') + f
      const tags: import('vite').HtmlTagDescriptor[] = []

      // App itself → modulepreload: tiny (~22KB) and needed the instant hydrate
      // resolves, so high priority + ahead-of-time compile is the right call.
      const app = chunkByName('App')
      if (app) tags.push({ tag: 'link', injectTo: 'head', attrs: { rel: 'modulepreload', href: href(app.fileName) } })

      // Everything else the path to first-frame pulls in — App's dependency
      // subtree (useEpicArt / useEpicConfig / … shared chunks) plus the lazy
      // GameScene route — goes in at LOW priority via prefetch so the big
      // downloads fill the idle pipe during SDK-init/hydrate WITHOUT competing
      // with the entry chunk or the splash first paint. The entry chunk is
      // excluded (already loading via <script type="module">). Deduped so a
      // chunk shared by App and GameScene is hinted once.
      const gameScene = chunkByName('GameScene')
      const prefetch = new Set<string>([
        ...(app ? app.imports : []),
        ...(gameScene ? [gameScene.fileName] : [])
      ])
      prefetch.delete(app?.fileName ?? '')
      if (entryFile) prefetch.delete(entryFile)
      for (const f of prefetch) {
        tags.push({ tag: 'link', injectTo: 'head', attrs: { rel: 'prefetch', as: 'script', href: href(f) } })
      }
      return { html, tags }
    }
  }
}

// ─── Drop-in override manifest ──────────────────────────────────────────────
// The runtime drop-in probes (useArtOverrides / useSound) check every OPTIONAL
// art + SFX slot for a real file so a dropped-in asset is picked up with no code
// change. Slots that were never filled 404 — which CrazyGames' resource audit
// flags as "missing resource". This virtual module ships the set of override
// files that ACTUALLY EXIST under public/ at build time, so the probes only
// request real files: present → used, absent → silent vector/placeholder
// fallback with NO request. Adding an asset = drop the file + rebuild (dev
// re-scans live via the watcher below, so drop-in-without-restart still works).
const PUBLIC_MANIFEST_ID = 'virtual:public-override-manifest'
const PUBLIC_MANIFEST_RESOLVED = '\0' + PUBLIC_MANIFEST_ID
const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url))

const scanPublicManifest = (): string[] => {
  const out: string[] = []
  const walk = (abs: string, rel: string): void => {
    let entries
    try { entries = readdirSync(abs, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const name = String(e.name)
      const childRel = rel ? `${rel}/${name}` : name
      if (e.isDirectory()) walk(`${abs}/${name}`, childRel)
      else out.push(childRel)
    }
  }
  // Walk ALL of public/ — the override probes reference several trees
  // (`images/`, `audio/`, AND `enemies/` for enemy/boss art), so scanning the
  // whole root is the only way to avoid falsely marking a shipped asset absent.
  walk(PUBLIC_DIR, '')
  return out
}

const publicOverrideManifestPlugin = (): Plugin => ({
  name: 'public-override-manifest',
  resolveId(id) { return id === PUBLIC_MANIFEST_ID ? PUBLIC_MANIFEST_RESOLVED : null },
  load(id) {
    if (id !== PUBLIC_MANIFEST_RESOLVED) return null
    return `export default ${JSON.stringify(scanPublicManifest())}`
  },
  configureServer(server) {
    // Re-emit the manifest when a file is added/removed under public/ so a
    // dropped-in asset is picked up live in dev without a manual restart.
    const invalidate = (file: string): void => {
      if (!resolve(file).startsWith(PUBLIC_DIR)) return
      const mod = server.moduleGraph.getModuleById(PUBLIC_MANIFEST_RESOLVED)
      if (mod) server.moduleGraph.invalidateModule(mod)
      server.ws.send({ type: 'full-reload', path: '*' })
    }
    server.watcher.on('add', invalidate)
    server.watcher.on('unlink', invalidate)
  }
})

// ─── The baked leaderboard ──────────────────────────────────────────────────
//
// Ships a board inside the bundle as the virtual module
// `virtual:leaderboard-snapshot`, which `src/use/leaderboardSnapshot.ts`
// re-exports and `useLeaderboard` ranks against. Which board depends on
// whether this build may talk to the Worker at all:
//
//   • LIVE builds (a `VITE_LEADERBOARD_URL` is set) bake the last REAL board,
//     `data/leaderboard-snapshot.json`, as the bottom rung of the offline
//     ladder — what a first-session player is ranked against when the fetch
//     fails and the device has no cache yet. Refreshed here via
//     `scripts/leaderboard-snapshot.mjs` (skipped if fetched < 10 min ago, so a
//     run of portal builds costs the Worker one request; a failed refresh never
//     fails the build — the committed copy stands in).
//   • Builds with NO endpoint — Poki (no external requests), Yandex (no
//     third-party storage URLs), Playgama (the YouTube Playables archive: no
//     external server calls) — can never post a score either, so their baked
//     copy is the whole board forever. They bake the MODELLED board,
//     `data/leaderboard-seed.json` from `pnpm leaderboard:seed`: a stated
//     best-wave retention curve, no names, byte-reproducible.
//
// Either file missing or unusable → the module is `null`, `leaderboardEnabled`
// goes false, and the game ships with no rank badge rather than a broken one.
const SEED_FILE = resolve(
  fileURLToPath(new URL('./data/leaderboard-seed.json', import.meta.url))
)
const SNAPSHOT_VIRTUAL_ID = 'virtual:leaderboard-snapshot'
const SNAPSHOT_RESOLVED = '\0' + SNAPSHOT_VIRTUAL_ID
const SNAPSHOT_FILE = resolve(
  fileURLToPath(new URL('./data/leaderboard-snapshot.json', import.meta.url))
)
const SNAPSHOT_SCRIPT = resolve(
  fileURLToPath(new URL('./scripts/leaderboard-snapshot.mjs', import.meta.url))
)

interface LeaderboardSnapshotFile {
  /** When the file was last pulled off the Worker — the freshness clock. */
  fetchedAt: number
  updatedAt: number
  total: number
  entries: { rank: number; name: string; score: number; flair: number }[]
  dist: [number, number][]
}

/** A refresh this recent is trusted as current (see the header). */
const SNAPSHOT_FRESH_MS = 10 * 60_000

const readSnapshotFile = (file: string): LeaderboardSnapshotFile | null => {
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<LeaderboardSnapshotFile>
    if (!Array.isArray(parsed.entries) || !Array.isArray(parsed.dist)) return null
    if (!(Number(parsed.total) > 0)) return null
    return {
      fetchedAt: Number(parsed.fetchedAt) || 0,
      updatedAt: Number(parsed.updatedAt) || 0,
      total: Number(parsed.total),
      entries: parsed.entries,
      dist: parsed.dist
    }
  } catch {
    return null
  }
}

/** @param seeded this build has no endpoint (Poki / Yandex / Playgama), so it
 *  bakes the modelled board instead of the real one. */
const leaderboardSnapshotPlugin = (seeded: boolean): Plugin => ({
  name: 'maw-leaderboard-snapshot',
  buildStart() {
    if (seeded) {
      // Nothing to fetch: the seed is generated from a curve, committed, and
      // deterministic — a build never needs to (and never should) regenerate it.
      const seed = readSnapshotFile(SEED_FILE)
      if (seed) {
        console.log(
          `[leaderboard] baking the SEEDED board — ${seed.total} players, top wave `
          + `${seed.dist[0]?.[0] ?? 0}. This build cannot post scores, so the board is modelled.`
        )
      } else {
        console.warn(`[leaderboard] no seed at ${SEED_FILE} — run \`pnpm leaderboard:seed\`. This build has no leaderboard.`)
      }
      return
    }
    const onDisk = readSnapshotFile(SNAPSHOT_FILE)
    const fresh = onDisk !== null && Date.now() - onDisk.fetchedAt < SNAPSHOT_FRESH_MS
    if (!fresh) {
      try {
        // A child process running the same code as `pnpm leaderboard:snapshot`,
        // so the build cannot drift from the manual command, and a fetch that
        // hangs or throws cannot take the vite process with it.
        execFileSync(process.execPath, [SNAPSHOT_SCRIPT, '--soft'], { stdio: 'inherit', timeout: 60_000 })
      } catch {
        console.warn('[leaderboard] could not refresh the snapshot — building with the committed copy.')
      }
    }
    const snap = readSnapshotFile(SNAPSHOT_FILE)
    if (snap) {
      console.log(
        `[leaderboard] baking ${snap.total} players / ${snap.entries.length} rows `
        + `(board of ${new Date(snap.updatedAt).toISOString().slice(0, 10)})`
      )
    } else {
      // Normal while the live board is still empty: the badge then relies on
      // the live fetch alone, and simply hides when that fails.
      console.warn('[leaderboard] no usable snapshot yet — the live fetch is the only rung on this build.')
    }
  },
  resolveId(id) {
    return id === SNAPSHOT_VIRTUAL_ID ? SNAPSHOT_RESOLVED : null
  },
  load(id) {
    if (id !== SNAPSHOT_RESOLVED) return null
    return `export default ${JSON.stringify(readSnapshotFile(seeded ? SEED_FILE : SNAPSHOT_FILE))}`
  }
})

// ─── Art bench export endpoint (DEV SERVER ONLY) ─────────────────────────────
//
// `/#/art-sheets` (src/views/ArtSheets.vue) writes its references, key sheets,
// `sheet-index.json` and `PROMPTS-*.md` into `art-sheets/` through these two
// POSTs — a browser download would land in Downloads under a name Chrome
// picked. `apply: 'serve'`, so no build ever carries it. Writes need the
// bench's own `x-maw-art` header (which forces a CORS preflight this server
// never answers for a foreign page), names are validated, and nothing escapes
// `art-sheets/`. (art-generation-pipeline, SKILL.md phase 1.)
const ART_SHEETS_DIR = resolve(fileURLToPath(new URL('./art-sheets', import.meta.url)))

const readBytes = (req: import('node:http').IncomingMessage): Promise<Buffer> =>
  new Promise((res, rej) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => res(Buffer.concat(chunks)))
    req.on('error', rej)
  })

const artBenchPlugin = (): Plugin => ({
  name: 'maw-art-bench',
  apply: 'serve',
  configureServer(server) {
    type Req = import('node:http').IncomingMessage
    type Res = import('node:http').ServerResponse
    const refuse = (res: Res, code: number, why: string): void => {
      res.statusCode = code
      res.end(why)
    }
    const allowed = (req: Req, res: Res): boolean => {
      if (req.method !== 'POST' || req.headers['x-maw-art'] !== '1') {
        refuse(res, 403, 'art bench writes only')
        return false
      }
      return true
    }
    server.middlewares.use('/__maw/art-export/file', async (req, res) => {
      if (!allowed(req, res)) return
      const name = new URL(req.url ?? '', 'http://bench').searchParams.get('name') ?? ''
      if (!/^[a-z0-9][a-z0-9._-]*\.png$/i.test(name)) return refuse(res, 400, `bad name "${name}"`)
      const bytes = await readBytes(req)
      if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47) return refuse(res, 400, 'not a PNG')
      mkdirSync(ART_SHEETS_DIR, { recursive: true })
      writeFileSync(resolve(ART_SHEETS_DIR, name), bytes)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, name, bytes: bytes.length }))
    })
    server.middlewares.use('/__maw/art-export/meta', async (req, res) => {
      if (!allowed(req, res)) return
      let body: { index?: unknown; docs?: Record<string, unknown> }
      try {
        body = JSON.parse(await readBody(req))
      } catch (e) {
        return refuse(res, 400, `bad json: ${(e as Error).message}`)
      }
      mkdirSync(ART_SHEETS_DIR, { recursive: true })
      const written: string[] = []
      if (body.index && typeof body.index === 'object') {
        writeFileSync(resolve(ART_SHEETS_DIR, 'sheet-index.json'), JSON.stringify(body.index, null, 2) + '\n', 'utf-8')
        written.push('sheet-index.json')
      }
      for (const [name, text] of Object.entries(body.docs ?? {})) {
        if (!/^PROMPTS-[A-Z]+\.md$/.test(name) || typeof text !== 'string') continue
        writeFileSync(resolve(ART_SHEETS_DIR, name), text, 'utf-8')
        written.push(name)
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, written }))
    })
  }
})

const mawCampaignOverridesPlugin = (bucketUrl: string): Plugin => ({
  name: 'maw-campaign-overrides',
  // A build ships the designer's newest edits: pull the levels bucket into the repo file first.
  async buildStart() {
    if (!bucketUrl) return
    const r = await pullLevels(bucketUrl, OVERRIDES_FILE)
    if (r.ok) this.info(r.message)
    else this.warn(r.message)
  },
  resolveId(id) {
    if (id === OVERRIDES_VIRTUAL_ID) return OVERRIDES_RESOLVED
    return null
  },
  load(id) {
    if (id !== OVERRIDES_RESOLVED) return null
    return `export default ${JSON.stringify(readOverridesJson())}`
  },
  configureServer(server) {
    // Hot-reload the virtual module if the JSON file is edited by hand.
    server.watcher.add(OVERRIDES_FILE)
    server.watcher.on('change', (path) => {
      if (resolve(path) !== OVERRIDES_FILE) return
      const mod = server.moduleGraph.getModuleById(OVERRIDES_RESOLVED)
      if (readFileSync(OVERRIDES_FILE, 'utf-8') === lastOverridesWrite) {
        // Our own save: refresh the module for the next load, keep the page.
        if (mod) server.moduleGraph.invalidateModule(mod)
        return
      }
      if (mod) server.moduleGraph.invalidateModule(mod)
      server.ws.send({ type: 'full-reload', path: '*' })
    })

    server.middlewares.use('/__maw/save-override', async (req, res, next) => {
      if (req.method !== 'POST') { next(); return }
      try {
        const body = JSON.parse(await readBody(req)) as { id?: number; stage?: unknown }
        if (typeof body.id !== 'number' || !body.stage) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'expected { id: number, stage }' }))
          return
        }
        const data = readOverridesJson()
        data[String(body.id)] = body.stage
        writeOverridesJson(data)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, id: body.id }))
      } catch (e) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: String((e as Error).message) }))
      }
    })

    server.middlewares.use('/__maw/clear-override', async (req, res, next) => {
      if (req.method !== 'POST') { next(); return }
      try {
        const body = JSON.parse(await readBody(req)) as { id?: number }
        if (typeof body.id !== 'number') {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'expected { id: number }' }))
          return
        }
        const data = readOverridesJson()
        delete data[String(body.id)]
        writeOverridesJson(data)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, id: body.id }))
      } catch (e) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: String((e as Error).message) }))
      }
    })
  }
})

// Read the package version directly so APP_VERSION resolves regardless of
// how vite is invoked. `process.env.npm_package_version` is only set when
// vite runs via `pnpm run <script>` — running `pnpm vite` directly leaves
// it undefined, which makes Vite log the literal define entry as a warning.
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
) as { version?: string }
const appVersion: string = pkg.version ?? '0.0.0'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import javascriptObfuscator from 'vite-plugin-javascript-obfuscator'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { buildCsp } from './src/platforms/csp'
import { foreignPortalChunk } from './src/platforms/chunkNames'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  // Load env file based on `mode` in the current working directory.
  // The third parameter '' loads all env vars regardless of VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), '')

  // Only obfuscate during a real production build — never during dev,
  // where the obfuscator rewrites dynamic import strings into lookups
  // Vite can no longer transform, breaking module specifiers at runtime.
  const isProduction = (mode === 'production' || env.VITE_NODE_ENV === 'production') && command === 'build'
  const shouldObfuscate = env.VITE_ENABLE_OBFUSCATION === 'true'

  // Initialize plugins array
  const plugins = []

  // Campaign-overrides plugin — virtual module + dev write endpoints so
  // editor saves persist to `data/campaign-overrides.json` in the repo.
  // Every build (portal builds too) pulls the bucket into the repo file; only the Pages
  // and dev builds also read it at runtime (their env files carry the URL).
  const levelsBucketUrl = (env.VITE_APP_LEVELS_BUCKET_URL || loadEnv('production', process.cwd(), '').VITE_APP_LEVELS_BUCKET_URL || '').trim()
  plugins.push(mawCampaignOverridesPlugin(command === 'build' ? levelsBucketUrl : ''))

  // Drop-in override manifest — so the runtime probes only request art/SFX
  // files that actually exist (no 404s for unfilled slots).
  plugins.push(publicOverrideManifestPlugin())

  // Baked leaderboard: the real board on live builds, the modelled one on the
  // builds with no endpoint (Poki / Yandex / Playgama). See the plugin header.
  plugins.push(leaderboardSnapshotPlugin((env.VITE_LEADERBOARD_URL ?? '').trim().length === 0))

  // Art bench export endpoint — dev server only (`apply: 'serve'`).
  plugins.push(artBenchPlugin())

  // Only push the obfuscator if both conditions are met
  if (isProduction && shouldObfuscate) {
    console.log('--- 🛡️  Obfuscating Production Build ---')
    plugins.push(
      javascriptObfuscator({
        // Exclude files with dynamic imports — the obfuscator's stringArray
        // rewrites import paths into array lookups that Vite can no longer
        // resolve, which breaks code splitting.
        exclude: [
          // FIRST, and not optional: passing ANY `exclude` REPLACES the
          // plugin's default of `[/node_modules/, /\.nuxt/]` — it does not
          // add to it. Without this line every vendor library (Vue, vue-i18n,
          // the portal SDK glue…) goes through the stringArray pass: a bigger,
          // slower bundle for zero protection, since it is public code.
          /node_modules/,
          /router\/index\.ts$/,
          /main\.ts$/,
          // i18n loader uses `import.meta.glob` for per-locale code
          // splitting — the obfuscator's stringArray rewrites those
          // dynamic paths so rollup can no longer produce separate
          // chunks (every locale ends up inlined in index.js).
          /i18n[\\/]index\.ts$/,
          // resolveSaveStrategy uses `await import('@/...')` inside
          // `import.meta.env.VITE_APP_*`-gated branches so Rollup can
          // tree-shake unused platform plugins. Obfuscation would
          // mangle the dynamic-import literals and break runtime
          // module resolution. (resolveAdProvider stays static-import
          // sync, so it doesn't need an exclude.)
          /platforms[\\/]resolveSaveStrategy\.ts$/,
          // useCrazyGames is the CrazyGames save-strategy delegate that
          // resolveSaveStrategy hands off to. It lazy-loads
          // `@/utils/save/CrazyGamesStrategy` via dynamic import. Without
          // this exclude the obfuscator's stringArray rewrite mangles the
          // literal, Vite can't resolve the `@/` alias, and the browser
          // surfaces `Failed to resolve module specifier
          // '@/utils/save/CrazyGamesStrategy'` at runtime (CG QA flagged
          // it 2026-05-20).
          /use[\\/]useCrazyGames\.ts$/,
          // GameDistributionProvider lazy-loads the heavy
          // `@/utils/gameDistributionPlugin` (~500 LOC) via dynamic
          // import so non-GD builds don't ship the GD SDK code.
          // Same obfuscator-vs-dynamic-import constraint as above.
          /use[\\/]ads[\\/]GameDistributionProvider\.ts$/,
          // PlaygamaProvider lazy-loads `@/utils/playgamaPlugin` for the
          // same reason — keeps the ~280 LOC bridge module off non-Playgama
          // builds. The obfuscator would mangle the dynamic-import literal.
          /use[\\/]ads[\\/]PlaygamaProvider\.ts$/,
          // `playgamaBridgeLoader.ts` is the ONE place `@playgama/bridge`
          // enters the module graph, behind an `import.meta.env`-gated
          // dynamic import. Same constraint: the `stringArray` transform
          // would rewrite the bare specifier into a lookup Vite can no
          // longer resolve. The loader is ~30 lines, which is exactly why
          // the import lives there rather than in the ~500-line plugin —
          // only this leaf file loses obfuscation.
          /utils[\\/]playgamaBridgeLoader\.ts$/,
          // The QA cheats' lazy `import('@/barrage/state/useBarrage')`.
          // Without this exclude the specifier shipped unresolved and every
          // `__barrage.*` console cheat threw "Failed to resolve module
          // specifier". Leaf loader so useCheats.ts stays obfuscated.
          // tests/build/obfuscatorDynamicImports.test.ts guards the pattern.
          /use[\\/]barrageCheatsLoader\.ts$/,
          // usePortalGameplay dynamic-imports `@/utils/playgamaPlugin` to
          // fire the gameplay_started / gameplay_stopped bracket. Same
          // obfuscator-vs-dynamic-import constraint as FLogoProgress.
          /use[\\/]usePortalGameplay\.ts$/,
          // GamepixProvider lazy-loads `@/utils/gamepixPlugin` so the
          // GamePix SDK glue only ships on GamePix builds. Same
          // obfuscator-vs-dynamic-import constraint as the others.
          /use[\\/]ads[\\/]GamepixProvider\.ts$/,
          // FLogoProgress dynamic-imports `@/utils/playgamaPlugin` and
          // `@/utils/gamepixPlugin` to fire the certification-mandatory
          // `game_ready` / `gameLoaded` edges. Without this exclude the
          // obfuscator wraps the string literal in a stringArray-decoder
          // call expression — Rollup can't statically analyse it for
          // alias resolution, so `@/utils/...` survives into the chunk
          // and the browser surfaces `Failed to resolve module specifier
          // '@/utils/gamepixPlugin'` at runtime.
          //
          // NOTE: no `$` end-anchor — Vue SFCs are presented to the
          // obfuscator's transform hook as virtual paths like
          // `FLogoProgress.vue?vue&type=script&setup=true&lang.ts`,
          // which an anchored regex would miss. Match anywhere on the
          // path so both the raw `.vue` file AND the script-block
          // virtual module are excluded.
          /components[\\/]atoms[\\/]FLogoProgress\.vue/,
          // useMawCampaign lazy-loads the heavy `useStageBuilder`
          // chunk via `await import('@/use/useStageBuilder')` so all
          // 20 stage builds stay off the boot critical path. The
          // obfuscator's stringArray rewrite would inline the chunk
          // back into the parent, undoing the split.
          /use[\\/]useMawCampaign\.ts$/,
          // useAssets.preloadAssets dynamic-imports the campaign module
          // so the gameplay shared-chunk loads in parallel with the
          // splash render instead of blocking the entry parse. Same
          // obfuscator-vs-dynamic-import constraint as above.
          /use[\\/]useAssets\.ts$/,
          // capabilities.ts has per-platform URL-detector helpers (with
          // hostname literals like `'crazygames'`, `'wavedash'`, `'glitch.fun'`,
          // ...) gated by env-literal IFs so Rollup can tree-shake the dead
          // branches per build. The obfuscator's `stringArray` transform runs
          // BEFORE esbuild's constant folding can fold `import.meta.env.X === 'true'`,
          // baking every hostname into the indirection table regardless of
          // which build is active. Excluding capabilities.ts keeps the
          // constant-fold + tree-shake path intact so on a Yandex build the
          // bundle contains no non-Yandex hostnames — required by Yandex's
          // moderator ("Service storage URL detected").
          /platforms[\\/]capabilities\.ts$/,
          // plattformText.ts is the per-build "available on <hostname>" string
          // mapping. Same obfuscator-vs-stringArray issue as capabilities.ts —
          // the ladder needs env-literal DCE to keep non-active hostnames out
          // of the bundle. The file is intentionally tiny so excluding it
          // doesn't meaningfully reduce obfuscation coverage of App.vue (which
          // still gets obfuscated normally and just imports from this helper).
          /platforms[\\/]plattformText\.ts$/
        ],
        // ─── Obfuscation profile (tuned 2026-04-30) ─────────────────────
        // The previous profile enabled every aggressive transform the
        // plugin offers — `controlFlowFlattening`, `numbersToExpressions`,
        // `splitStrings`, `unicodeEscapeSequence`. Combined they were
        // inflating the bundle by ~3.4× over the unobfuscated baseline
        // (e.g. 217KB → 768KB on the entry chunk for the CrazyGames
        // build flagged by CG QA on 2026-04-30).
        //
        // The transforms removed below all have the same trade-off:
        // huge bundle / runtime cost for protection that any
        // off-the-shelf deobfuscator strips in seconds. Keeping them on
        // costs real users real download time without preventing a
        // motivated reverse-engineer for more than a coffee break.
        //
        // What stays (cheap, useful):
        //   • compact            — single-line output
        //   • simplify           — CFG simplification
        //   • stringArray        — string indirection table
        //   • stringArrayThreshold 0.6 — moderate coverage
        //
        // What was removed (expensive, low-value):
        //   • unicodeEscapeSequence — every `"foo"` → `"foo"`
        //     ~doubles strings on the wire. Trivially reversed.
        //   • splitStrings          — splits every string into 2-char
        //     pieces concatenated at runtime. Triples string size,
        //     interpretable by any human in <1 minute.
        //   • controlFlowFlattening — wraps every block in a switch
        //     dispatcher. ~30% bundle inflation, ~10% runtime perf hit.
        //   • numbersToExpressions  — every literal `5` becomes
        //     `0x4 + 0x1` etc. Bloats math-heavy modules (the canvas
        //     game loop is full of these).
        //
        // If a tighter profile is needed later, prefer enabling
        // `controlFlowFlattening` selectively on a small allowlist of
        // sensitive files (anti-cheat hot paths, license checks) rather
        // than blanket-enabling everywhere.
        options: {
          compact: true,
          simplify: true,
          stringArray: true,
          stringArrayThreshold: 0.6
        }
      } as any)
    )
  }

  // ─── CSP generation ────────────────────────────────────────────────
  // The whole per-platform CSP shape lives in `src/platforms/csp.ts`
  // — extracted so it's unit-testable. Adding a new platform's CSP
  // contribution = edit that file, not this one.
  //
  // YANDEX EXCEPTION: do NOT inject a CSP meta tag on Yandex builds. The
  // game runs inside Yandex's own iframe wrapper, which injects its own
  // production CSP (that's exactly what `@yandex-games/sdk-dev-proxy --csp`
  // fetches + applies during local testing). Our own meta tag is therefore
  // redundant — AND it's the last place in the bundle that names Yandex
  // service hostnames like `yastatic.net` (Yandex's static-storage CDN),
  // `an.yandex.ru`, `yandexadexchange.net`. Yandex's moderation auto-check
  // flags those as "Service storage URL detected" (requirement: no absolute
  // URLs to Yandex service storage in the game's own code). Omitting the
  // meta tag entirely leaves index.html with ZERO Yandex-service URLs and
  // lets Yandex's wrapper own the security policy. The placeholder comment
  // is simply removed so it doesn't ship either.
  const isYandexBuild = env.VITE_APP_YANDEX === 'true'
  // GamePix, like Yandex, hosts the game in its own environment and applies its
  // own CSP. Our meta tag is redundant there and the GamePix testing toolkit's
  // wrapper surfaced it as a `script-src` "blocks the use of 'eval'" violation
  // (the GamePix SDK + its Google ad-creative chain need `eval`/`Function`).
  // Skipping our meta tag on the GamePix build lets GamePix's environment own
  // the policy — same exception we already make for Yandex.
  const isGamepixBuild = env.VITE_APP_GAMEPIX === 'true'
  // POKI: same exception, stronger reason. Poki applies a PER-GAME allowlist
  // server-side (P4D -> Settings -> CSP) and injects its OWN ad stack into our
  // iframe — Google Publisher Tag, IMA, Amazon TAM and a prebid waterfall
  // (securepubads.g.doubleclick.net, imasdk.googleapis.com, prebid.adnxs.com,
  // aax.amazon-adsystem.com, onetag-sys.com, s0.2mdn.net, ...). Our meta tag
  // would block the entire waterfall with NO error surfaced: the game runs,
  // `commercialBreak()` resolves, and no ad ever plays. Whitelisting those
  // hosts is the wrong fix — the list rotates with Poki's ad partners. Let P4D
  // own the policy. (`src/platforms/csp.ts` gets no Poki arm either: this build
  // emits no meta tag at all, so an entry there would only leak `*.poki.com`
  // into every OTHER platform's bundle — the "Service storage URL detected"
  // rejection trigger on Yandex moderation.)
  const isPokiBuild = env.VITE_APP_POKI === 'true'
  // PLAYGAMA: no meta tag either, and the reason is YouTube. The
  // `build:playgama` archive IS the YouTube Playables submission — Playgama
  // is an official Playables partner and distributes the one ZIP — and on
  // Playables our document is shared with YouTube's own runtime: their
  // `game_api/v1` SDK and their telemetry. A CSP meta tag applies to the
  // whole DOCUMENT, so any host we forget is a host we silently break for
  // THEM, with no way for us to see it. YouTube already sandboxes the frame
  // and enforces "no external server calls" at review time, so a self-imposed
  // policy buys nothing here and can only cause false failures. On
  // playgama.com nothing is lost either: it is an iframe on a portal that
  // sets its own frame policy. `buildCsp` returns '' for this build too, so
  // the decision is unit-testable in `csp.test.ts`.
  const isPlaygama = env.VITE_APP_PLAYGAMA === 'true'
  // GAMEPUSH: no meta tag, for the Playgama/Poki reason multiplied: GamePush
  // fans this ONE archive out to a dozen portals and injects its own SDK plus
  // each portal's ad stack into our document. `buildCsp` returns '' for it too.
  const isGamePushBuild = env.VITE_APP_GAMEPUSH === 'true'
  const skipCspMeta = isYandexBuild || isGamepixBuild || isPokiBuild || isPlaygama || isGamePushBuild
  const cspValue = buildCsp(env)

  // ─── Exactly-one-platform guard ─────────────────────────────────────────
  //
  // Vite merges `.env` with `.env.<mode>`, so a platform flag set in the base
  // `.env` stays TRUE for every mode that does not explicitly clear it. That
  // is how `build:playgama` silently became a CrazyGames build: `.env` sets
  // `VITE_APP_CRAZY_WEB=true`, `.env.playgama` didn't mention it, and BOTH
  // `resolveSaveStrategy` and `resolveAdProvider` check the CrazyGames arm
  // first — so the Playgama bundle shipped `CrazyGamesStrategy` + the CG ad
  // provider, no `PlaygamaStrategy` chunk at all, and `persistToRaw=false`
  // (CG cloud-only mode) scrubbing local state on every boot. Nothing in the
  // build output said a word about it.
  //
  // Fail the build instead. Two platform flags true at once is never valid.
  const PLATFORM_FLAGS = [
    'VITE_APP_CRAZY_WEB',
    'VITE_APP_GAME_DISTRIBUTION',
    'VITE_APP_PLAYGAMA',
    'VITE_APP_GAMEPIX',
    'VITE_APP_GAME_MONETIZE',
    'VITE_APP_YANDEX',
    'VITE_APP_GLITCH',
    'VITE_APP_ITCH',
    'VITE_APP_WAVEDASH',
    'VITE_APP_POKI',
    'VITE_APP_GAMEPUSH'
  ] as const
  const activePlatforms = PLATFORM_FLAGS.filter(f => env[f] === 'true')
  if (activePlatforms.length > 1) {
    throw new Error(
      `[build] ${activePlatforms.length} platform flags are true at once: `
      + `${activePlatforms.join(', ')} (mode="${mode}").\n`
      + 'Only one platform may be active per build — the save-strategy and '
      + 'ad-provider resolvers take the FIRST matching arm, so the extra flag '
      + 'silently hijacks the build.\n'
      + `Fix: set the flags you do not want to "false" in .env.${mode} `
      + '(a flag omitted there inherits its value from the base `.env`).'
    )
  }

  plugins.push({
    name: 'inject-csp',
    transformIndexHtml(html: string) {
      return html.replace(
        '<!-- CSP meta tag injected by vite.config.ts at build time -->',
        skipCspMeta
          ? ''
          : `<meta http-equiv="Content-Security-Policy" content="${cspValue}" />`
      )
    }
  })

  // Strip the CrazyGames SDK <script> tag from index.html for non-CrazyGames builds
  // so it doesn't block or error on other platforms (e.g. Wavedash).
  const isCrazyWeb = env.VITE_APP_CRAZY_WEB === 'true'
  if (!isCrazyWeb) {
    plugins.push({
      name: 'strip-crazygames-sdk',
      transformIndexHtml(html: string) {
        return html.replace(
          /<!-- Load the SDK before your game code -->\s*<script[^>]*sdk\.crazygames\.com[^>]*><\/script>\s*/,
          ''
        )
      }
    })
  }

  // ─── YouTube Playables SDK tag ──────────────────────────────────────────
  //
  // There is no longer a Playgama Bridge <script> tag to strip: v2 comes from
  // the `@playgama/bridge` npm package (see `src/utils/playgamaBridgeLoader.ts`)
  // because the CDN build fetches per-platform adapter chunks at runtime and
  // posts to `api.playgama.com` — neither of which YouTube permits, and the
  // Playgama archive IS the Playables submission.
  //
  // What gets stripped now is YOUTUBE's own SDK tag, which only the Playgama
  // build keeps. There it is load-bearing rather than cosmetic: the Bridge's
  // `youtube` adapter waits for `window.ytgame` with a 100ms poll that has NO
  // timeout, so a Playables build without the tag hangs inside
  // `bridge.initialize()` forever and reads as "the game does not start".
  // Every other portal strips it so nobody pays for a third-party request
  // they cannot use.
  if (!isPlaygama) {
    plugins.push({
      name: 'strip-youtube-sdk',
      transformIndexHtml(html: string) {
        return html.replace(
          /<!--[^]*?YouTube Playables SDK[^]*?-->\s*<script[^>]*youtube\.com\/game_api[^>]*><\/script>\s*/,
          ''
        )
      }
    })
  }

  // Strip the GamePix SDK <script> tag from non-GamePix builds. Same reason
  // as the Playgama strip — we don't want an extra DNS lookup to
  // integration.gamepix.com on other portals. The plugin polls for
  // `window.GamePix` after init and stays inert if it never appears.
  const isGamepix = env.VITE_APP_GAMEPIX === 'true'
  if (!isGamepix) {
    plugins.push({
      name: 'strip-gamepix-sdk',
      transformIndexHtml(html: string) {
        return html.replace(
          /<!-- Load the SDK before your game code -->\s*<script[^>]*integration\.gamepix\.com[^>]*><\/script>\s*/,
          ''
        )
      }
    })
  }

  // Strip the Poki SDK <script> tag from non-Poki builds. Same reason as the
  // Playgama / GamePix strips — no extra DNS lookup to game-cdn.poki.com on
  // other portals — plus the harder one: a foreign SDK host in the shipped
  // index.html is what Yandex moderation rejects as "Service storage URL
  // detected". The plugin re-injects the tag at runtime if it is missing, so a
  // QA wrapper that serves its own index.html still works.
  //
  // The comment half is OPTIONAL and cannot cross a `-->`: a lazy `[^]*?`
  // wildcard between `<!--` and the Poki comment can start matching at ANY
  // earlier comment in the file and swallow every tag in between (that pattern
  // ate the CrazyGames + Playgama tags in a sibling project). Making the
  // comment optional also means the strip survives someone rewording it.
  const isPoki = env.VITE_APP_POKI === 'true'
  if (!isPoki) {
    plugins.push({
      name: 'strip-poki-sdk',
      transformIndexHtml(html: string) {
        return html.replace(
          /(?:<!--(?:(?!-->)[\s\S])*?-->\s*)?<script[^>]*game-cdn\.poki\.com[^>]*><\/script>\s*/,
          ''
        )
      }
    })
  }

  // ─── GamePix single-file bundle ─────────────────────────────────────────
  // The GamePix build CDN serves the root `index.html` (200) but intermittently
  // 403s the hashed `assets/*.js` / `assets/*.css` chunks — the 403 body is XML,
  // so the browser refuses the ES module ("blocked due to MIME application/xml")
  // and the app never finishes loading → dead UI, no ad calls. Verified end-to-
  // end in a real browser that the ad chain itself works when assets load, so
  // this is purely the CDN refusing separate chunks. Inline the ENTIRE app
  // (JS + CSS) into index.html for the GamePix build so there are no separate
  // code chunks to refuse — the one file the CDN already serves carries
  // everything. Runtime-URL assets (`images/`, `audio/`, fetched by string URL,
  // not build-time imports) stay external and load fine. GamePix-only; other
  // platforms keep normal code-splitting. Obfuscation is off for GamePix, and
  // the CSP already allows `'unsafe-inline'` scripts on this ad-waterfall build,
  // so the inlined bundle isn't a CSP regression.
  if (isGamepix) {
    // Cast to `any` — the plugin ships its own (mismatched) Vite Plugin types,
    // same reason the obfuscator plugin above is cast.
    plugins.push(viteSingleFile() as any)
  } else {
    // Every non-single-file build: warm App / GameScene / useEpicArt from
    // index.html so the gameplay chunks download during the boot await-chain
    // instead of serially after it. See `warmGameplayChunks` above.
    plugins.push(warmGameplayChunks())
  }

  // Emit `playgama-bridge-config.json` ONLY for the Playgama build. NOT
  // served from `public/` because Vite would expose it in dev and in every
  // other platform's `dist/` — which historically baked
  // `forciblySetPlatformId: 'playgama'` and made the bridge hang in
  // localhost / QA-tool contexts (which speak different protocols than
  // the production portal). The config here intentionally OMITS
  // `forciblySetPlatformId` so the bridge auto-detects the right protocol.
  //
  // `storage.allowAnonymousCloudSave` is load-bearing for cloud saves and it
  // SURVIVED the v2 upgrade — verified in the shipped 2.1.0 bundle, which
  // gates its cloud path on:
  //
  //   isCloudSaveSupported
  //     && (options.storage?.allowAnonymousCloudSave === true
  //         || player.isAuthorized)
  //
  // Guest players — most portal traffic, and the QA reviewer's first run —
  // are not authorized, so without this flag every write degrades to local
  // and NO progress ever reaches the Playgama remote. That was the "cleared
  // wave isn't saved" bug. (v2 dropped the per-call storage TYPE argument,
  // not this option.)
  //
  // Keep in sync with `BRIDGE_OPTIONS` in `src/utils/playgamaPlugin.ts`,
  // which the bridge falls back to when this file 404s.
  const playgamaBridgeConfig = JSON.stringify({
    storage: { allowAnonymousCloudSave: true },
    advertisement: { minimumDelayBetweenInterstitial: 120 }
  }, null, 2)
  if (isPlaygama) {
    plugins.push({
      name: 'emit-playgama-bridge-config',
      apply: 'build' as const,
      generateBundle() {
        (this as any).emitFile({
          type: 'asset',
          fileName: 'playgama-bridge-config.json',
          source: playgamaBridgeConfig
        })
      }
    })
    // ─── Dev-only reload-durable Playgama bridge mock (`?pgmock=1`) ───────
    //
    // The runtime proof that cloud saves survive a reload (the
    // `verify-cloud-save-hydration` protocol) needs two things the real
    // bridge cannot give us on localhost:
    //
    //   • A cloud store that OUTLIVES a reload. On localhost the real bridge
    //     detects the MOCK platform, whose adapter returns false for
    //     `platform_internal` outright — so the cloud path is unreachable and
    //     the test would be vacuous. This mock backs `platform_internal` with
    //     real localStorage under a `__pgcloud__` prefix (not a payload key,
    //     so BlobStorage and the save layer both ignore it).
    //
    //   • An injectable hydrate DELAY. A store that answers instantly beats
    //     the module-eval defaults every time, so the boot race never happens
    //     and a BROKEN strategy still passes. `?hydrateDelay=1500` reproduces
    //     "the cloud answers 1.5s after the app already seeded stage 1".
    //
    // Injected before `/src/main.ts` so `window.bridge` exists at module-eval.
    // `defineProperty` with `writable:false` keeps the real CDN bridge script
    // (still tagged in dev `index.html`) from replacing it.
    //
    // Dev + mode-gated + query-gated: never reachable in a built bundle.
    plugins.push({
      name: 'playgama-reload-durable-mock',
      apply: 'serve' as const,
      transformIndexHtml(html: string, ctx: any) {
        if (!ctx?.originalUrl?.includes('pgmock=1')) return html
        const mock = `
<script>
(function () {
  var CLOUD = '__pgcloud__';
  var params = new URL(location.href).searchParams;
  var DELAY = Number(params.get('hydrateDelay') || 0);
  var FAIL_FIRST = params.get('failFirstGet') === '1';
  var failed = false;
  var listeners = {};
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms) }) };
  var read = function (k) { return window.localStorage.getItem(CLOUD + k) };
  var write = function (k, v) { window.localStorage.setItem(CLOUD + k, String(v)) };
  var storage = {
    defaultType: 'local_storage',
    isAvailable: function (type) { return true },
    get: function (key, type, tryParseJson) {
      return (DELAY ? sleep(DELAY) : Promise.resolve()).then(function () {
        if (FAIL_FIRST && !failed) { failed = true; throw new Error('mock: transient blip') }
        var one = function (k) {
          var raw = type === 'platform_internal' ? read(k) : window.localStorage.getItem(k);
          if (raw !== null && tryParseJson !== false) { try { return JSON.parse(raw) } catch (e) {} }
          return raw;
        };
        return Array.isArray(key) ? key.map(one) : one(key);
      });
    },
    set: function (key, value, type) {
      var keys = Array.isArray(key) ? key : [key];
      var vals = Array.isArray(value) ? value : [value];
      keys.forEach(function (k, i) {
        var v = vals[i];
        v = (typeof v === 'object' && v !== null) ? JSON.stringify(v) : String(v);
        if (type === 'platform_internal') write(k, v); else window.localStorage.setItem(k, v);
      });
      return Promise.resolve();
    },
    'delete': function (key, type) {
      var keys = Array.isArray(key) ? key : [key];
      keys.forEach(function (k) {
        if (type === 'platform_internal') window.localStorage.removeItem(CLOUD + k);
        else window.localStorage.removeItem(k);
      });
      return Promise.resolve();
    }
  };
  var platform = {
    id: params.get('platformId') || 'playgama',
    language: params.get('lang') || 'en',
    isAudioEnabled: params.get('muted') !== '1',
    isPaused: false,
    on: function (n, cb) { (listeners[n] = listeners[n] || []).push(cb); return function () {} },
    sendMessage: function (n) { console.info('[pgmock] sendMessage', n) }
  };
  var bridge = {
    platform: platform,
    storage: storage,
    advertisement: { on: function () { return function () {} } },
    EVENT_NAME: {
      PAUSE_STATE_CHANGED: 'pause_state_changed',
      AUDIO_STATE_CHANGED: 'audio_state_changed',
      VISIBILITY_STATE_CHANGED: 'visibility_state_changed',
      INTERSTITIAL_STATE_CHANGED: 'interstitial_state_changed',
      REWARDED_STATE_CHANGED: 'rewarded_state_changed'
    },
    initialize: function (opts) { console.info('[pgmock] initialize', opts); return Promise.resolve() }
  };
  // Test hook so the MCP driver can fire portal signals.
  window.__pgmock = {
    emit: function (n, p) { (listeners[n] || []).forEach(function (cb) { cb(p) }) },
    // Simulate Playgama's guided-testing tools flipping the portal language
    // WITHOUT reloading the frame — the case the 2s poll exists for.
    setLanguage: function (code) { platform.language = code },
    cloudKeys: function () {
      return Object.keys(window.localStorage).filter(function (k) { return k.indexOf(CLOUD) === 0 })
    },
    wipeLocalOnly: function () {
      Object.keys(window.localStorage).forEach(function (k) {
        if (k.indexOf(CLOUD) !== 0) window.localStorage.removeItem(k)
      })
    }
  };
  Object.defineProperty(window, 'bridge', { value: bridge, writable: false, configurable: true });
  Object.defineProperty(window, 'playgamaBridge', { value: bridge, writable: false, configurable: true });
  console.info('[pgmock] installed (delay=' + DELAY + 'ms, failFirstGet=' + FAIL_FIRST + ')');
})();
</script>`
        return html.replace('<script type="module" src="/src/main.ts">', mock + '\n<script type="module" src="/src/main.ts">')
      }
    })

    // Serve the SAME config from the dev server under `--mode playgama` so
    // `pnpm dev-playgama` exercises the real config path (and the browser
    // hydration QA in the playbook's Phase 7 isn't testing a different
    // configuration than the one that ships). Dev-only + mode-gated, so it
    // never leaks into another platform's dist/ the way a `public/` file would.
    plugins.push({
      name: 'serve-playgama-bridge-config',
      apply: 'serve' as const,
      configureServer(server: any) {
        server.middlewares.use((req: any, res: any, next: any) => {
          if (!req.url?.startsWith('/playgama-bridge-config.json')) return next()
          res.setHeader('Content-Type', 'application/json')
          res.end(playgamaBridgeConfig)
        })
      }
    })
  }

  // Foreign-platform code is kept out of the Yandex bundle via `resolve.alias`
  // stubs (see the resolve.alias block below), NOT by deleting emitted chunks.
  //
  // The previous approach — a `generateBundle` hook that DELETED chunks like
  // `gamepixPlugin-*.js` — was fundamentally unsafe: `MawScene.vue` STATICALLY
  // imports `gamePixHappyMoment` from `@/utils/gamepixPlugin`, so Rollup emits
  // gamepixPlugin as a shared chunk that MawScene depends on. Deleting that
  // chunk left MawScene's import dangling → 404 at runtime → "Failed to fetch
  // dynamically imported module: MawScene" → the whole game failed to load on
  // Yandex. Stub-aliasing instead swaps the real module (with its SDK URL) for
  // a tiny no-op module BEFORE bundling, so the URL never enters the build AND
  // the import resolves to a valid chunk. No chunk deletion, no 404.

  return {
    base: '/',
    // The gameplay-video pipeline's own dev server (`tools/preview-video`) sets
    // VITE_CACHE_DIR so its dependency pre-bundle lives apart: starting it can
    // never re-bundle the cache out from under a `pnpm dev` that is running.
    cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
    server: {
      port: 2050,
      // `art-sheets/` is the art pipeline's workbench (references, prompt
      // docs, painted returns, the slicer's receipt) — never part of the app.
      // Unwatched, so an export or an Art Desk run doesn't set off Tailwind's
      // source rescan and an HMR storm in the middle of the bench's own export.
      // `preview-videos/` is the video pipeline's output: frames and mp4s, the
      // same story.
      watch: { ignored: ['**/art-sheets/**', '**/preview-videos/**'] }
    },
    define: {
      APP_VERSION: JSON.stringify(appVersion)
    },
    plugins: [
      tailwindcss(),
      vue(),
      // vueDevTools(),
      VueI18nPlugin({
        // 1. Tell the plugin where your global translation files are
        include: resolve(dirname(fileURLToPath(import.meta.url)), './src/locales/**'),

        // 2. This allows you to use YAML in the <i18n> block
        // The plugin usually detects yaml automatically, but you can force
        // strict behavior if needed by ensuring the 'yaml' loader is available.
        defaultSFCLang: 'yaml'
      }),
      ...plugins
    ],
    resolve: {
      alias: {
        // On non-CrazyGames builds, redirect `@/use/useCrazyGames` to a
        // no-op stub. The real module contains the literal SDK environment
        // identifier 'crazygames' + `[crazygames]` console log prefixes;
        // many components statically import from it, so its strings end up
        // in the bundle of every build even when the functions are no-ops
        // at runtime. Yandex's moderator flags those non-Yandex identifier
        // strings as "Service storage URL detected", so the alias forces
        // the bundle to use the stub on non-CG builds and the strings stay
        // out entirely. MUST appear BEFORE the `@` / `@/` catch-alls so the
        // more-specific path wins resolution.
        // The other-portal Ad/Save providers are STATICALLY imported by
        // `resolveAdProvider` / `resolveSaveStrategy`. Even on a Yandex build
        // where every `createXxxProvider()` function is dead code (the
        // env-gated arm never executes), the function BODIES — including
        // their `name: 'crazygames'` / `name: 'gamemonetize'` / etc. string
        // literals — live in the chunk. Yandex's moderator flags non-Yandex
        // identifier strings as "Service storage URL detected". Aliasing each
        // foreign-portal provider to a no-op stub on non-active builds keeps
        // the strings out of the bundle entirely. Same pattern for the heavy
        // `useCrazyGames` module which is statically imported by many Vue
        // components for `stopGameplay` / `triggerHappytime` etc.
        ...(env.VITE_APP_CRAZY_WEB === 'true' ? {} : {
          '@/use/useCrazyGames': fileURLToPath(new URL('./src/use/useCrazyGames.stub.ts', import.meta.url)),
          '@/use/ads/CrazyGamesProvider': fileURLToPath(new URL('./src/use/ads/CrazyGamesProvider.stub.ts', import.meta.url))
        }),
        ...(env.VITE_APP_GAME_DISTRIBUTION === 'true' ? {} : {
          '@/use/ads/GameDistributionProvider': fileURLToPath(new URL('./src/use/ads/GameDistributionProvider.stub.ts', import.meta.url))
        }),
        ...(env.VITE_APP_PLAYGAMA === 'true' ? {} : {
          '@/use/ads/PlaygamaProvider': fileURLToPath(new URL('./src/use/ads/PlaygamaProvider.stub.ts', import.meta.url)),
          // playgamaPlugin is STATICALLY imported by `platforms/leaderboard.ts`
          // and `platforms/playgama` (both in every build's graph), so the
          // whole plugin rode inside the Poki build's GameScene chunk (1.1.3).
          // Same failure, same fix as pokiPlugin / yandexPlugin below.
          '@/utils/playgamaPlugin': fileURLToPath(new URL('./src/utils/playgamaPlugin.stub.ts', import.meta.url))
        }),
        ...(env.VITE_APP_GAMEPIX === 'true' ? {} : {
          '@/use/ads/GamepixProvider': fileURLToPath(new URL('./src/use/ads/GamepixProvider.stub.ts', import.meta.url)),
          // gamepixPlugin is STATICALLY imported by MawScene.vue (for
          // gamePixHappyMoment), so Rollup emits it as a shared chunk MawScene
          // depends on. The real module hardcodes the GamePix SDK URL
          // (integration.gamepix.com) which Yandex moderation flags. Alias to
          // the stub so the URL never enters the bundle AND MawScene's import
          // resolves to a valid no-op chunk (no 404 — the bug that broke game
          // loading when we tried deleting the chunk instead).
          '@/utils/gamepixPlugin': fileURLToPath(new URL('./src/utils/gamepixPlugin.stub.ts', import.meta.url))
        }),
        ...(env.VITE_APP_GAME_MONETIZE === 'true' ? {} : {
          '@/use/ads/GameMonetizeProvider': fileURLToPath(new URL('./src/use/ads/GameMonetizeProvider.stub.ts', import.meta.url)),
          // App.vue STATICALLY imports `isGameMonetizeAdShowing` from the plugin
          // (the one app-shell pause watcher), so the plugin is in every build's
          // module graph. The real module hardcodes the SDK URL and the ad-block
          // bait hosts — same failure, same fix as pokiPlugin / gamepixPlugin.
          '@/utils/gameMonetizePlugin': fileURLToPath(new URL('./src/utils/gameMonetizePlugin.stub.ts', import.meta.url))
        }),
        ...(env.VITE_APP_POKI === 'true' ? {} : {
          '@/use/ads/PokiProvider': fileURLToPath(new URL('./src/use/ads/PokiProvider.stub.ts', import.meta.url)),
          // pokiPlugin is STATICALLY imported by `usePokiGameplay.ts` (installed
          // from App.vue on every build) and by `PokiProvider`, so it lands in
          // every build's module graph. The real module hardcodes the PokiSDK
          // URL, and the env-literal `if` at each call site is NOT enough to
          // keep it out: the obfuscator's stringArray pass hoists string
          // literals into its indirection table BEFORE esbuild folds
          // `import.meta.env.VITE_APP_POKI === 'true'` to `false`, so the URL
          // survives DCE. Same failure — and same fix — as gamepixPlugin above.
          '@/utils/pokiPlugin': fileURLToPath(new URL('./src/utils/pokiPlugin.stub.ts', import.meta.url))
        }),
        ...(env.VITE_APP_YANDEX === 'true' ? {} : {
          // yandexPlugin is STATICALLY imported by `platforms/leaderboard.ts`
          // (on every build, via useBarrage), so it rode into every portal's
          // main chunk with its ad-block bait URLs (`an.yandex.ru`,
          // `yandex.ru/ads`) — the Poki gate's "unapproved external hosts"
          // warning on 1.1.2. Same failure, same fix as pokiPlugin above.
          '@/utils/yandexPlugin': fileURLToPath(new URL('./src/utils/yandexPlugin.stub.ts', import.meta.url))
        }),
        ...(env.VITE_APP_GAMEPUSH === 'true' ? {} : {
          // gamePushPlugin is STATICALLY imported by `platforms/gamepush`,
          // `GamePushStrategy` and `GamePushProvider` (all reachable from every
          // build's resolvers), and hardcodes the GamePush SDK URL. Same
          // failure, same fix as yandexPlugin / pokiPlugin above.
          '@/use/ads/GamePushProvider': fileURLToPath(new URL('./src/use/ads/GamePushProvider.stub.ts', import.meta.url)),
          '@/utils/gamePushPlugin': fileURLToPath(new URL('./src/utils/gamePushPlugin.stub.ts', import.meta.url))
        }),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@/': fileURLToPath(new URL('./src/', import.meta.url)),
        '#': fileURLToPath(new URL('./src/assets', import.meta.url))
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
    },
    build: {
      minify: 'esbuild',
      // Source maps ride along on any build that is NOT obfuscated (there is
      // no point mapping a bundle whose identifiers were rewritten), EXCEPT
      // the Playgama one.
      //
      // That build deliberately turns obfuscation off — it is the YouTube
      // Playables submission as well, both portals review by hand, and a
      // rejection arrives as a stack trace that an obfuscated bundle cannot
      // map back to a source line. But maps are the opposite mistake: the ZIP
      // is served from a public URL, so shipping them publishes the entire
      // original source next to it. Minified-but-readable is the sweet spot —
      // QA still gets a greppable file+line, which is all the last rejection
      // was missing.
      sourcemap: !shouldObfuscate && !isPlaygama && !isGamePushBuild,
      rollupOptions: {
        output: {
          // Foreign-portal chunk NAMES. The stubs above keep other portals'
          // code out of the bundle, but Rollup still names a split chunk after
          // its module — `pokiPlugin.stub-*.js`, `useCrazyGames.stub-*.js` —
          // and that name is written into every importing chunk too. A portal
          // reviewer listing `assets/` (or a moderator grepping for foreign
          // portal identifiers) sees another portal's plugin in the archive.
          // Give those chunks a neutral name; the active portal's own chunks
          // keep theirs.
          chunkFileNames: (chunk: { name: string }) =>
            foreignPortalChunk(chunk.name, env) ? 'assets/m-[hash].js' : 'assets/[name]-[hash].js'
        }
      }
    }
  }
})
