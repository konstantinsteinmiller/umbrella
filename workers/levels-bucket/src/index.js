// ─── Umbrella levels bucket ──────────────────────────────────────────────
// One JSON document in KV: every edited campaign slot and every saved editor
// level, each with the time it was last edited. `level: null` is a deletion
// (a reverted slot, a deleted saved level), kept so it can beat older copies.
//
//   GET  /levels   → { campaign: { [id]: Entry }, library: { [name]: Entry } }   (public)
//   POST /levels   same shape, partial; Authorization: Bearer <EDITOR_TOKEN>
//                  → merged per entry, newest `editedAt` wins; returns the bucket
//
// Entry = { editedAt: number, level: object | null }
// Secret: `npx wrangler secret put EDITOR_TOKEN`.

const KEY = 'bucket'
const MAX_BODY = 4_000_000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
}
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const isEntry = (e) =>
  !!e && typeof e === 'object' && Number.isFinite(e.editedAt) && e.editedAt > 0 &&
  e.editedAt < Date.now() + 86_400_000 && // a skewed clock must not pin an entry forever
  (e.level === null || (typeof e.level === 'object' && !Array.isArray(e.level)))

const mergeSection = (into, from) => {
  if (!from || typeof from !== 'object') return 0
  let changed = 0
  for (const [k, e] of Object.entries(from)) {
    if (k.length > 200 || !isEntry(e)) continue
    if ((into[k]?.editedAt ?? 0) >= e.editedAt) continue
    into[k] = { editedAt: e.editedAt, level: e.level }
    changed++
  }
  return changed
}

const read = async (env) => {
  let b = null
  try { b = await env.LEVELS.get(KEY, 'json') } catch { /* corrupt value: start over rather than fail every request */ }
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
  return { campaign: obj(b?.campaign), library: obj(b?.library) }
}

const sameToken = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (url.pathname !== '/levels') return json({ error: 'not found' }, 404)
    try {
      return await handle(req, env)
    } catch (e) {
      return json({ error: String(e?.message ?? e) }, 500)
    }
  }
}

async function handle(req, env) {
  if (req.method === 'GET') return json(await read(env))
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!env.EDITOR_TOKEN || !sameToken(token, env.EDITOR_TOKEN)) return json({ error: 'wrong editor password' }, 401)
  const text = await req.text()
  if (text.length > MAX_BODY) return json({ error: 'too large' }, 413)
  let body
  try { body = JSON.parse(text) } catch { return json({ error: 'bad json' }, 400) }

  const bucket = await read(env)
  const changed = mergeSection(bucket.campaign, body.campaign) + mergeSection(bucket.library, body.library)
  if (changed) await env.LEVELS.put(KEY, JSON.stringify(bucket))
  return json({ ...bucket, changed })
}
