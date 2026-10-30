// Poki allows no outside references in its package (roadmap #14): the campaign is baked in at build
// time (vite.config.ts pulls the levels bucket into data/campaign-*.json for every build) and a Poki
// build must never fetch levels, the community list or a leaderboard at runtime, nor carry the
// public web build's address for share links.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const envOf = (file: string): Record<string, string> => {
  const p = join(ROOT, file)
  if (!existsSync(p)) return {}
  return Object.fromEntries(readFileSync(p, 'utf-8').split(/\r?\n/).filter((l) => /^\s*[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf('=')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
  }))
}

describe('the Poki build is offline', () => {
  it('sets no levels bucket, community or leaderboard server (the runtime fetches stay off)', () => {
    // `vite build --mode poki` reads .env, .env.local, .env.poki and .env.poki.local.
    const env = { ...envOf('.env'), ...envOf('.env.local'), ...envOf('.env.poki'), ...envOf('.env.poki.local') }
    expect(env.VITE_APP_POKI).toBe('true')
    expect(env.VITE_APP_LEVELS_BUCKET_URL ?? '').toBe('')
    expect(env.VITE_LEADERBOARD_URL ?? '').toBe('')
  })

  it('folds the share-link base to nothing in a Poki build', () => {
    const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf-8')
    expect(config).toMatch(/VITE_APP_POKI === 'true' \? \{ 'import\.meta\.env\.VITE_APP_SHARE_URL': JSON\.stringify\(''\) \}/)
  })

  it('bakes the campaign it plays from the repo data', () => {
    const order = JSON.parse(readFileSync(join(ROOT, 'data', 'campaign-order.json'), 'utf-8')) as { order: unknown[] }
    expect(order.order.length).toBeGreaterThan(0)
  })
})
