// Every source file with a real `import('...')` expression must be on the
// production obfuscator's `exclude` list in vite.config.ts. The obfuscator's
// stringArray pass rewrites the specifier into a decoder call, Rollup can no
// longer resolve the `@/` alias, and the built bundle throws
// "Failed to resolve module specifier '@/…'" at runtime — it passes every dev
// run and every unit test, and only breaks on a shipped build. Happened to the
// CG save strategy, the Playgama/GamePix ready edges and the QA console
// cheats (`__barrage.*`), which is what this guard was added for.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const srcDir = join(root, 'src')

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name)
  if (statSync(p).isDirectory()) return walk(p)
  return /\.(ts|vue)$/.test(name) && !/\.d\.ts$/.test(name) ? [p] : []
})

/** Strip comments so prose like "`await import('@/x')`" doesn't count. */
const stripComments = (code: string): string => code
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

/** A runtime dynamic import — not `typeof import('…')` (type-only, erased). */
const hasDynamicImport = (code: string): boolean =>
  /(?<![\w.$])(?<!typeof\s)import\(\s*['"`]/.test(stripComments(code))

const obfuscatorExcludes = (): RegExp[] => {
  const cfg = readFileSync(join(root, 'vite.config.ts'), 'utf8')
  const start = cfg.indexOf('javascriptObfuscator({')
  expect(start).toBeGreaterThan(-1)
  const open = cfg.indexOf('exclude: [', start)
  const close = cfg.indexOf('\n        ],', open)
  expect(open).toBeGreaterThan(-1)
  expect(close).toBeGreaterThan(open)
  const block = stripComments(cfg.slice(open + 'exclude: ['.length, close))
  // One regex literal per line in that array.
  return block.split('\n')
    .map((l) => l.trim().match(/^\/(.+)\/([a-z]*),?$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map(([, body, flags]) => new RegExp(body!, flags))
}

describe('obfuscator vs dynamic imports', () => {
  const excludes = obfuscatorExcludes()
  const files = walk(srcDir).filter((f) => hasDynamicImport(readFileSync(f, 'utf8')))

  it('finds the exclude list and the known dynamic-import files', () => {
    expect(excludes.length).toBeGreaterThan(5)
    const rel = files.map((f) => relative(srcDir, f).split(sep).join('/'))
    expect(rel).toContain('use/barrageCheatsLoader.ts')
    expect(rel).toContain('platforms/resolveSaveStrategy.ts')
  })

  it.each(walk(srcDir).filter((f) => hasDynamicImport(readFileSync(f, 'utf8'))).map((f) => [relative(srcDir, f).split(sep).join('/'), f]))(
    '%s is excluded from obfuscation', (_rel, file) => {
      // Test with the OS path (what the plugin sees) and a posix one.
      const hit = excludes.some((re) => re.test(file) || re.test(file.split(sep).join('/')))
      expect(hit).toBe(true)
    })

  it('useCheats keeps its import() in the excluded leaf loader', () => {
    const cheats = readFileSync(join(srcDir, 'use', 'useCheats.ts'), 'utf8')
    expect(hasDynamicImport(cheats)).toBe(false)
    const loader = readFileSync(join(srcDir, 'use', 'barrageCheatsLoader.ts'), 'utf8')
    // A plain literal specifier Rollup can analyse — no @vite-ignore, no
    // runtime-built string.
    expect(stripComments(loader)).toMatch(/import\('@\/barrage\/state\/useBarrage'\)/)
    expect(loader).not.toMatch(/@vite-ignore/)
  })
})
