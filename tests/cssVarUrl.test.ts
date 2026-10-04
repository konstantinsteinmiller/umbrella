// A url() set on a CSS custom property resolves against the stylesheet that
// reads the var(), not the document — on a `--base=./` build that turned
// `./images/backdrops/x.webp` into `assets/images/...` (404 + missing art).
import { describe, expect, it } from 'vitest'
import { cssVarUrl } from '@/utils/function'

describe('cssVarUrl', () => {
  it('makes a relative path absolute against the document', () => {
    const v = cssVarUrl('./images/backdrops/panel-plate.webp')
    expect(v).toBe(`url("${new URL('./images/backdrops/panel-plate.webp', document.baseURI).href}")`)
    expect(v).toMatch(/^url\("https?:\/\//)
  })

  it('leaves an absolute URL absolute', () => {
    expect(cssVarUrl('https://cdn.example/x.webp')).toBe('url("https://cdn.example/x.webp")')
  })
})
