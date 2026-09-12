// ─── Static guards for the Playgama archive (= the YouTube Playables ZIP) ───
//
// `pnpm build:playgama` produces the artifact for playgama.com, Playgama's
// partner portals AND YouTube Playables — Playgama is an official Playables
// partner and distributes the one upload. So this build carries the strictest
// requirements of the set, and every one of them is a property of the SOURCE
// that a future edit can quietly undo:
//
//   • no external server calls (so: no CDN SDK tag, one bundled Bridge)
//   • `window.localStorage` is null there (so: a classic storage shim first)
//   • the ytgame SDK tag is mandatory and load-bearing
//   • the Page Visibility API is forbidden
//
// These are grep-shaped tests on purpose. The behavioural halves live in
// `playgamaSignals`, `PlaygamaStrategy` and `routerHostFragment`; what is left
// is "did someone add a listener / a script tag / an import that puts the
// submission back in the state that got rejected", and only a sweep of the
// tree can answer that.

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// jsdom hands `import.meta.url` back as an http URL, so resolve from the
// process cwd instead — vitest runs from the project root.
const ROOT = process.cwd()

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|vue)$/.test(entry)) out.push(full)
  }
  return out
}

const SRC_FILES = walk(join(ROOT, 'src'))
const rel = (f: string): string => relative(ROOT, f).split(sep).join('/')

/** Source with comments stripped, so a file that only DISCUSSES a banned API
 *  in its header (several do, at length) is not reported as using one. */
const codeOf = (file: string): string =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n')

const INDEX_HTML = readFileSync(join(ROOT, 'index.html'), 'utf8')

describe('index.html — what the Playables runtime needs', () => {
  it('ships the YouTube SDK tag (stripped from every non-Playgama build)', () => {
    // The Bridge's `youtube` adapter waits for `window.ytgame` with a 100ms
    // poll that has NO timeout: without this tag `initialize()` never settles
    // and the game simply "does not start".
    expect(INDEX_HTML).toContain('https://www.youtube.com/game_api/v1')
  })

  it('ships the storage shim as a CLASSIC script, before any module script', () => {
    // A `<script type="module">` is deferred, so a shim installed from inside
    // the module graph runs AFTER the entry chunk's static imports — and those
    // read `localStorage` at module scope. On Playables the accessor is null,
    // not absent, so those reads throw before `bootstrap()` can defend itself.
    const shim = INDEX_HTML.indexOf('/js/storage-shim.js')
    expect(shim).toBeGreaterThan(-1)

    const tag = INDEX_HTML.slice(INDEX_HTML.lastIndexOf('<script', shim), shim)
    expect(tag).not.toContain('type="module"')
    expect(tag).not.toContain('defer')
    expect(tag).not.toContain('async')

    const firstModule = INDEX_HTML.indexOf('type="module"')
    expect(firstModule).toBeGreaterThan(shim)

    // And it has to be in <head> — the entry chunk's imports evaluate before
    // anything at the end of <body>.
    expect(INDEX_HTML.indexOf('</head>')).toBeGreaterThan(shim)
  })

  it('the shim file itself exists and installs an in-memory Storage', () => {
    const p = join(ROOT, 'public/js/storage-shim.js')
    expect(existsSync(p)).toBe(true)
    const shim = readFileSync(p, 'utf8')
    expect(shim).toContain('MemoryStorage')
    expect(shim).toContain('localStorage')
    expect(shim).toContain('sessionStorage')
  })

  it('carries NO Playgama Bridge CDN tag any more', () => {
    // The CDN build is a webpack bundle with
    // `publicPath = bridge.playgama.com/v1/stable/` — it fetches adapter
    // chunks at runtime and posts to api.playgama.com. Both are external
    // calls, which Playables forbids "including built-in analytics".
    expect(INDEX_HTML).not.toContain('bridge.playgama.com')
  })
})

describe('the Bridge enters the graph in exactly one place', () => {
  it('only playgamaBridgeLoader.ts imports @playgama/bridge', () => {
    const importers = SRC_FILES
      .filter((f) => /@playgama\/bridge/.test(codeOf(f)))
      .map(rel)
    expect(importers).toEqual(['src/utils/playgamaBridgeLoader.ts'])
  })

  it('and it does so behind a build-time env literal, not a plain if', () => {
    // `if (isPlaygama) await import(...)` is NOT enough — Rollup still emits
    // the chunk when the syntactic dynamic import survives, so every other
    // portal would ship the ~286 KB Bridge. The `import.meta.env` ternary is
    // what makes the whole call disappear.
    const loader = readFileSync(join(ROOT, 'src/utils/playgamaBridgeLoader.ts'), 'utf8')
    expect(loader).toContain("import.meta.env.VITE_APP_PLAYGAMA === 'true'")
    expect(loader).toMatch(/\?[\s\S]*await import\('@playgama\/bridge'\)/)
  })

  it('no source file still reaches for the v1 window globals', () => {
    const offenders = SRC_FILES
      .filter((f) => /window\.(bridge|playgamaBridge)\b/.test(codeOf(f)))
      .map(rel)
    expect(offenders).toEqual([])
  })
})

describe('the Page Visibility API has exactly one owner', () => {
  const ALLOWED = 'src/use/useGamePause.ts'

  it('nothing outside useGamePause subscribes to visibilitychange', () => {
    // Playables: "Game MUST NOT use the web Page Visibility API or similar web
    // APIs and MUST only use Playables SDK `onPause` and `onResume`."
    // Everything else takes the portal-agnostic `onGameSuspended` edge.
    const offenders = SRC_FILES
      .filter((f) => /addEventListener\(\s*['"]visibilitychange['"]/.test(codeOf(f)))
      .map(rel)
      .filter((f) => f !== ALLOWED)
    expect(offenders).toEqual([])
  })

  it('nothing outside useGamePause reads document.hidden / visibilityState', () => {
    const offenders = SRC_FILES
      .filter((f) => /document\.(hidden|visibilityState)/.test(codeOf(f)))
      .map(rel)
      .filter((f) => f !== ALLOWED)
    expect(offenders).toEqual([])
  })

  it('every pagehide listener is gated on USES_PAGE_VISIBILITY', () => {
    // `pagehide` is a "similar web API" under the same rule. It stays on
    // non-Playgama builds because it catches tab close and iOS memory-pressure
    // unloads that visibility alone misses.
    for (const file of SRC_FILES) {
      const code = codeOf(file)
      if (!/addEventListener\(\s*['"]pagehide['"]/.test(code)) continue
      expect(code, rel(file)).toContain('USES_PAGE_VISIBILITY')
    }
  })

  it('useGamePause gates its own listener AND its initial read', () => {
    const code = readFileSync(join(ROOT, 'src/use/useGamePause.ts'), 'utf8')
    // The seed matters as much as the listener: `document.visibilityState` at
    // module scope is a read of the banned API too.
    expect(code).toMatch(/VITE_APP_PLAYGAMA !== 'true'[\s\S]{0,200}document\.visibilityState/)
    expect(code).toContain('if (USES_PAGE_VISIBILITY && typeof document !== \'undefined\')')
  })
})
