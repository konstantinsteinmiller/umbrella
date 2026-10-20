#!/usr/bin/env node
// Prints the revision the project is on right now: the highest "## Revision N"
// section in GDD.md that has any content under its heading. Empty placeholder
// headings ("## Revision 2" with nothing below) don't count. 0 = no revision yet.
//
//   node scripts/revision.mjs            → 1
//   node scripts/revision.mjs GDD.md     (explicit path)

import { readFileSync } from 'node:fs'

export const currentRevision = (gdd) => {
  const lines = gdd.split(/\r?\n/)
  let current = 0
  for (let i = 0; i < lines.length; i++) {
    const m = /^##\s+Revision\s+(\d+)\s*$/.exec(lines[i])
    if (!m) continue
    let hasContent = false
    for (let j = i + 1; j < lines.length && !/^##\s/.test(lines[j]); j++) {
      if (lines[j].trim()) { hasContent = true; break }
    }
    if (hasContent) current = Math.max(current, Number(m[1]))
  }
  return current
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('revision.mjs')) {
  process.stdout.write(String(currentRevision(readFileSync(process.argv[2] ?? 'GDD.md', 'utf8'))) + '\n')
}
