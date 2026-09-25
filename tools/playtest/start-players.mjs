// Launch the four tester windows for one run and wait until each answers.
//   node tools/playtest/start-players.mjs playtest-runs/run-2 [http://127.0.0.1:5320/] [--budget 300 --extend 420 --wallcap 2100]
// Stop them afterwards by PID (printed below) — never by process name, so no
// other Chrome on the machine is touched.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PERSONAS } from './personas.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RUN = path.resolve(process.argv[2] ?? 'playtest-runs/run')
const URL_ = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'http://127.0.0.1:5320/'
/** Budget flags handed through to every daemon (play seconds; see pt-daemon). */
const passThrough = ['budget', 'extend', 'wallcap'].flatMap((k) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 && process.argv[i + 1] ? [`--${k}`, process.argv[i + 1]] : []
})
fs.mkdirSync(RUN, { recursive: true })

const pids = []
for (const p of PERSONAS) {
  const out = path.join(RUN, p.id)
  fs.rmSync(out, { recursive: true, force: true })
  const child = spawn(process.execPath, [
    path.join(HERE, 'pt-daemon.mjs'), '--id', p.slug, '--cdp', String(p.cdp), '--api', String(p.api),
    '--url', URL_, '--out', out, '--x', String(p.x), '--lang', p.lang, ...passThrough
  ], { stdio: 'ignore', detached: true })
  child.unref()
  pids.push({ id: p.id, pid: child.pid })
}
fs.writeFileSync(path.join(RUN, 'daemons.json'), JSON.stringify(pids, null, 2))
for (const p of PERSONAS) {
  let ok = false
  for (let i = 0; i < 90 && !ok; i++) {
    try { ok = (await fetch(`http://127.0.0.1:${p.api}/hello`)).ok } catch { await new Promise((r) => setTimeout(r, 1000)) }
  }
  console.log(`${p.slug}: ${ok ? `ready on ${p.api}` : 'NOT READY'}`)
}
console.log(`daemon pids: ${pids.map((p) => `${p.id}=${p.pid}`).join(' ')} (also in ${path.join(RUN, 'daemons.json')})`)
