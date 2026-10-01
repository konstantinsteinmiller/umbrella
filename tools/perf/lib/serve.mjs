// ─── Tiny static server for a built bundle (zero dependencies) ───────────────
//
// Serves `root` on 127.0.0.1 at a RANDOM high port and refuses to hand the
// port back until the served index.html carries the expected <title>: a stale
// server from another game answering on a guessed port would otherwise be
// measured instead of this one (web-game-performance-optimize MEASURING.md).

import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.webm': 'video/webm',
  '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm'
}

/**
 * @param {string} root directory to serve
 * @param {{ host?: string, extra?: Record<string, string> }} [o] extra: url path -> file (e.g. a parent page)
 */
export const serveDir = (root, o = {}) => new Promise((resolveP, reject) => {
  const base = resolve(root)
  const host = o.host || '127.0.0.1'
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    let path = decodeURIComponent(url.pathname)
    if (o.extra && o.extra[path]) {
      const f = o.extra[path]
      res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' })
      createReadStream(f).pipe(res)
      return
    }
    if (path.endsWith('/')) path += 'index.html'
    const file = normalize(join(base, path))
    if (!file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' })
    createReadStream(file).pipe(res)
  })
  server.on('error', reject)
  const tryListen = (attempt) => {
    const port = 30000 + Math.floor(Math.random() * 20000)
    server.once('error', (e) => (e.code === 'EADDRINUSE' && attempt < 20 ? tryListen(attempt + 1) : reject(e)))
    server.listen(port, host, () => resolveP({ server, port, origin: `http://${host}:${port}`, close: () => new Promise((r) => server.close(r)) }))
  }
  tryListen(0)
})

/** Throws unless `url` serves a page whose <title> matches `re`. Returns the title. */
export const assertTitle = async (url, re = /elemental barrage/i) => {
  const html = await (await fetch(url)).text()
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
  if (!re.test(title)) throw new Error(`refusing to measure: ${url} serves <title>${title}</title>, not ${re}`)
  return title
}
