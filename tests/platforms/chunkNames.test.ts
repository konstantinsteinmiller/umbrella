// `foreignPortalChunk` — a build's dist/assets must not list another portal's
// plugin chunk by name (stubs keep the code out, but Rollup would still name
// the split chunk `pokiPlugin.stub-*.js` and write that name into importers).

import { describe, expect, it } from 'vitest'
import { foreignPortalChunk } from '@/platforms/chunkNames'

const GM = { VITE_APP_GAME_MONETIZE: 'true' }
const POKI = { VITE_APP_POKI: 'true' }

describe('foreignPortalChunk', () => {
  it('every stub chunk is foreign', () => {
    for (const n of ['pokiPlugin.stub', 'useCrazyGames.stub', 'gamepixPlugin.stub', 'playgamaPlugin.stub', 'gameMonetizePlugin.stub', 'gamePushPlugin.stub']) {
      expect(foreignPortalChunk(n, GM)).toBe(true)
      expect(foreignPortalChunk(n, POKI)).toBe(true)
    }
  })

  it('another portal\'s named chunk is foreign, the active portal\'s is not', () => {
    expect(foreignPortalChunk('useCrazyMuteSync', GM)).toBe(true)
    expect(foreignPortalChunk('usePokiGameplay', GM)).toBe(true)
    expect(foreignPortalChunk('usePokiGameplay', POKI)).toBe(false)
    expect(foreignPortalChunk('gameMonetizePlugin', GM)).toBe(false)
    expect(foreignPortalChunk('gameMonetizePlugin', POKI)).toBe(true)
  })

  it('GamePush chunks are foreign everywhere except the GamePush build', () => {
    const GP = { VITE_APP_GAMEPUSH: 'true' }
    expect(foreignPortalChunk('gamePushPlugin', GP)).toBe(false)
    expect(foreignPortalChunk('GamePushStrategy', GP)).toBe(false)
    expect(foreignPortalChunk('gamePushPlugin', POKI)).toBe(true)
    expect(foreignPortalChunk('GamePushProvider', GM)).toBe(true)
    // GamePix is a different portal: its token must not match the GamePush flag.
    expect(foreignPortalChunk('gamepixPlugin', GP)).toBe(true)
  })

  it('neutral chunks keep their names', () => {
    for (const n of ['GameScene', 'App', 'useBarrage', 'de', 'useEpicArt']) {
      expect(foreignPortalChunk(n, GM)).toBe(false)
      expect(foreignPortalChunk(n, {})).toBe(false)
    }
  })
})
