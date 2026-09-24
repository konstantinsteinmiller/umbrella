// Close one run's tester windows: end every session (writes final.json for a
// tester that stopped without `end`), then stop the daemons by PID and only the
// Chrome processes whose profile lives inside this run's folder.
//   node tools/playtest/stop-players.mjs playtest-runs/run-2
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { PERSONAS } from './personas.mjs'

const RUN = path.resolve(process.argv[2] ?? 'playtest-runs/run')
for (const p of PERSONAS) {
  try { await fetch(`http://127.0.0.1:${p.api}/end`) } catch { /* already gone */ }
}
const pids = (() => { try { return JSON.parse(fs.readFileSync(path.join(RUN, 'daemons.json'), 'utf8')) } catch { return [] } })()
for (const { pid } of pids) { try { process.kill(pid) } catch { /* already gone */ } }
// A daemon killed on Windows never runs its SIGTERM handler, so its Chrome is
// found by profile path instead — the run folder is unique to these windows.
const needle = RUN.replace(/\\/g, '\\\\')
if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${needle.replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  ], { stdio: 'inherit' })
}
console.log(`stopped ${pids.length} daemons and their windows`)
