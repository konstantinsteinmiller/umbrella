import { describe, expect, it } from 'vitest'
import { artModeUrl } from '@/umbrella/artMode'

describe('the designers\' art switch', () => {
  it('opens the lantern build through ?art=lantern on the deployed game, and comes back without it', () => {
    expect(artModeUrl('https://x.github.io/umbrella/12/#/', 'lantern', false)).toBe('https://x.github.io/umbrella/12/?art=lantern#/')
    expect(artModeUrl('https://x.github.io/umbrella/12/lantern/?art=lantern#/', 'drawn', false)).toBe('https://x.github.io/umbrella/12/#/')
    expect(artModeUrl('https://x.github.io/umbrella/lantern/#/editor', 'drawn', false)).toBe('https://x.github.io/umbrella/#/editor')
  })

  it('drops a flag hidden in the hash route\'s query too', () => {
    expect(artModeUrl('https://x.github.io/umbrella/12/lantern/#/?art=lantern', 'drawn', false)).toBe('https://x.github.io/umbrella/12/#/')
  })

  it('opens the clay build the same way, and switches straight between the painted builds', () => {
    expect(artModeUrl('https://x.github.io/umbrella/12/#/', 'clay', false)).toBe('https://x.github.io/umbrella/12/?art=clay#/')
    expect(artModeUrl('https://x.github.io/umbrella/12/clay/?art=clay#/', 'lantern', false)).toBe('https://x.github.io/umbrella/12/?art=lantern#/')
    expect(artModeUrl('https://x.github.io/umbrella/12/clay/#/', 'drawn', false)).toBe('https://x.github.io/umbrella/12/#/')
  })

  it('on a dev server keeps the page and only sets or clears the flag', () => {
    expect(artModeUrl('http://127.0.0.1:5173/#/', 'lantern', true)).toBe('http://127.0.0.1:5173/?art=lantern#/')
    expect(artModeUrl('http://127.0.0.1:5173/?art=lantern#/', 'drawn', true)).toBe('http://127.0.0.1:5173/#/')
  })

  it('cannot switch in a portal build, which has no sibling builds', () => {
    expect(artModeUrl('https://games.portal.example/abc/index.html', 'lantern', false)).toBeNull()
  })
})
