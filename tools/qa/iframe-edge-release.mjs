// T0.4 acceptance: a mouse drag from the launcher released OUTSIDE a
// cross-origin portal iframe fires exactly one shot.
//   pnpm dev --port 5791 --host 127.0.0.1   (then)
//   node tools/qa/iframe-edge-release.mjs http://127.0.0.1:5791/ chrome|firefox <outDir>
// The host page is served from localhost, so the frame is cross-origin like a portal's.
// Exit code 0 = exactly one shot. Firefox: Playwright's own binary (npx playwright install firefox).
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium, firefox } = require('playwright-core')
const [gameUrl, which, out] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The "portal": another origin (localhost vs 127.0.0.1) framing the game.
const host = http.createServer((_q, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(`<!doctype html><title>portal</title><body style="margin:0;background:#222">
  <iframe id="game" src="${gameUrl}" style="position:absolute;left:150px;top:40px;width:420px;height:760px;border:0" allow="autoplay"></iframe></body>`)
})
await new Promise((r) => host.listen(0, 'localhost', r))
const hostUrl = `http://localhost:${host.address().port}/`

const browser = which === 'firefox'
  ? await firefox.launch({ headless: true })
  : await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 900, height: 860 } })
await page.goto(hostUrl)
const frameEl = await page.waitForSelector('#game')
const frame = await frameEl.contentFrame()
await frame.waitForSelector('.barrage-board__canvas', { timeout: 120000 })
await sleep(3000)
const volleys = async () => JSON.parse((await frame.evaluate(() => localStorage.getItem('umbrella_state'))) || '{}').eb_stats?.volleys ?? 0
const fb = await frameEl.boundingBox()
const cb = await frame.$eval('.barrage-board__canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
// The launcher: bottom centre of the board.
const lx = fb.x + cb.x + cb.w / 2
const ly = fb.y + cb.y + cb.h * 0.93
const v0 = await volleys()
await page.mouse.move(lx, ly)
await page.mouse.down()
// Up and to the right across the board, then out past the frame's right edge.
const pts = [[lx + 30, ly - 120], [lx + 80, ly - 260], [fb.x + fb.width - 10, ly - 300], [fb.x + fb.width + 60, ly - 320], [fb.x + fb.width + 140, ly - 330]]
for (const [x, y] of pts) { await page.mouse.move(x, y, { steps: 8 }); await sleep(60) }
await page.mouse.up()
await sleep(400)
// Back over the game (Chrome delivers the dangling capture's end here) and a
// harmless move — no click.
await page.mouse.move(lx - 40, ly - 200, { steps: 6 })
await sleep(4500)
const v1 = await volleys()
await page.screenshot({ path: path.join(out, `${which}.png`) })
console.log(JSON.stringify({ which, shots: v1 - v0 }))
await browser.close()
host.close()
process.exit(v1 - v0 === 1 ? 0 : 1)
