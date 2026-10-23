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
//
// ─── Community levels (D1 binding COMMUNITY, schema in migrations/) ───────
//   GET  /community/levels?sort=rating|newest|plays&page=1&size=12
//        → { items: (Meta & { code })[], total, page, pageSize }   (size ≤ 50; code draws the preview)
//   GET  /community/levels/:id          → { ...Meta, code }
//   POST /community/levels { name, author, code, player } → 201 { id }
//        5 per rolling 7 days per player id AND per hashed IP
//        → 429 { error: 'weekly-limit', limit, used, resetAt }
//   GET  /community/quota?player=…      → { limit, used, resetAt | null }
//   POST /community/levels/:id/play { player }        → { plays }   (once/player/level/day)
//   POST /community/levels/:id/rate { player, stars } → { ratingAvg, ratingCount } (0–5, upsert)
//
// Meta = { id, name, author, createdAt, plays, ratingAvg, ratingCount }
// IPs are stored only as SHA-256(salt|ip); salt secret: `npx wrangler secret put IP_SALT`.

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
    try {
      if (url.pathname.startsWith('/community/')) return await community(req, env, url)
      if (url.pathname !== '/levels') return json({ error: 'not found' }, 404)
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

// ─── Community levels ────────────────────────────────────────────────────
const WEEK = 7 * 86_400_000
const LIMIT = 5
const PRIOR_MEAN = 3 // Bayesian average: every rated level counts PRIOR_WEIGHT extra votes of PRIOR_MEAN
const PRIOR_WEIGHT = 3
const PLAYER_RE = /^[A-Za-z0-9-]{8,64}$/
const CODE_RE = /^[A-Za-z0-9_-]{10,60000}$/
const ID_RE = /^[a-z0-9]{6,32}$/

const META = 'id, name, author, created_at, plays, rating_avg, rating_count'
const meta = (r) => ({
  id: r.id, name: r.name, author: r.author, createdAt: r.created_at, plays: r.plays,
  ratingAvg: Math.round(r.rating_avg * 100) / 100, ratingCount: r.rating_count
})
// score = Bayesian average, -1 while unrated, so unrated levels list after rated ones
const SORTS = {
  rating: 'score DESC, rating_count DESC, created_at DESC',
  newest: 'created_at DESC',
  plays: 'plays DESC, created_at DESC'
}

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (x) => (x % 36).toString(36)).join('')

const ipHash = async (req, env) => {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.IP_SALT ?? 'umbrella-community'}|${ip}`))
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('')
}

const readBody = async (req) => {
  const text = await req.text()
  if (text.length > 80_000) return null
  try {
    const b = JSON.parse(text)
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null
  } catch { return null }
}

// submissions inside the rolling week for one key, and when the oldest of them ages out
const usage = async (env, col, value, now) => {
  const r = await env.COMMUNITY.prepare(`SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM levels WHERE ${col} = ? AND created_at > ?`)
    .bind(value, now - WEEK).first()
  const used = r?.n ?? 0
  return { used, resetAt: used ? r.oldest + WEEK : null }
}
const quota = async (env, player, hash, now) => {
  const a = await usage(env, 'player', player, now)
  const b = await usage(env, 'ip_hash', hash, now)
  const w = b.used > a.used ? b : a
  return { limit: LIMIT, used: w.used, resetAt: w.resetAt }
}

async function community(req, env, url) {
  const db = env.COMMUNITY
  const parts = url.pathname.split('/').filter(Boolean) // ['community', ...]
  const now = Date.now()

  if (parts[1] === 'quota' && parts.length === 2) {
    if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)
    const player = url.searchParams.get('player') ?? ''
    if (!PLAYER_RE.test(player)) return json({ error: 'bad player' }, 400)
    return json(await quota(env, player, await ipHash(req, env), now))
  }
  if (parts[1] !== 'levels') return json({ error: 'not found' }, 404)

  if (parts.length === 2) {
    if (req.method === 'GET') {
      const sort = url.searchParams.get('sort') || 'rating'
      if (!Object.hasOwn(SORTS, sort)) return json({ error: 'bad sort' }, 400)
      const page = Math.max(1, Math.floor(Number(url.searchParams.get('page') ?? 1)) || 1)
      const size = Math.min(50, Math.max(1, Math.floor(Number(url.searchParams.get('size') ?? 12)) || 12))
      const [rows, total] = await db.batch([
        // With each level's share code: the game draws the list's preview images from it.
        db.prepare(`SELECT ${META}, code FROM levels ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`).bind(size, (page - 1) * size),
        db.prepare('SELECT COUNT(*) AS n FROM levels')
      ])
      return json({ items: rows.results.map((r) => ({ ...meta(r), code: r.code })), total: total.results[0]?.n ?? 0, page, pageSize: size })
    }
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
    const b = await readBody(req)
    if (!b) return json({ error: 'bad json' }, 400)
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    const author = b.author == null ? '' : typeof b.author === 'string' ? b.author.trim() : null
    if (name.length < 1 || name.length > 40) return json({ error: 'bad name' }, 400)
    if (author === null || author.length > 24) return json({ error: 'bad author' }, 400)
    if (typeof b.code !== 'string' || !CODE_RE.test(b.code)) return json({ error: 'bad code' }, 400)
    if (typeof b.player !== 'string' || !PLAYER_RE.test(b.player)) return json({ error: 'bad player' }, 400)
    const hash = await ipHash(req, env)
    const q = await quota(env, b.player, hash, now)
    if (q.used >= LIMIT) return json({ error: 'weekly-limit', limit: LIMIT, used: q.used, resetAt: q.resetAt }, 429)
    const id = newId()
    await db.prepare('INSERT INTO levels (id, name, author, code, player, ip_hash, created_at, score) VALUES (?, ?, ?, ?, ?, ?, ?, -1)')
      .bind(id, name, author, b.code, b.player, hash, now).run()
    return json({ id }, 201)
  }

  const id = parts[2]
  if (!ID_RE.test(id)) return json({ error: 'not found' }, 404)

  if (parts.length === 3) {
    if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)
    const r = await db.prepare(`SELECT ${META}, code FROM levels WHERE id = ?`).bind(id).first()
    return r ? json({ ...meta(r), code: r.code }) : json({ error: 'not found' }, 404)
  }
  if (parts.length !== 4 || (parts[3] !== 'play' && parts[3] !== 'rate')) return json({ error: 'not found' }, 404)
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const b = await readBody(req)
  if (!b || typeof b.player !== 'string' || !PLAYER_RE.test(b.player)) return json({ error: 'bad player' }, 400)
  if (parts[3] === 'rate' && (!Number.isInteger(b.stars) || b.stars < 0 || b.stars > 5)) return json({ error: 'bad stars' }, 400)
  if (!(await db.prepare('SELECT id FROM levels WHERE id = ?').bind(id).first())) return json({ error: 'not found' }, 404)

  if (parts[3] === 'play') {
    const day = Math.floor(now / 86_400_000)
    const ins = await db.prepare('INSERT OR IGNORE INTO plays (level_id, player, day) VALUES (?, ?, ?)').bind(id, b.player, day).run()
    if (ins.meta.changes) await db.prepare('UPDATE levels SET plays = plays + 1 WHERE id = ?').bind(id).run()
    const r = await db.prepare('SELECT plays FROM levels WHERE id = ?').bind(id).first()
    return json({ plays: r.plays })
  }

  await db.batch([
    db.prepare('INSERT INTO ratings (level_id, player, stars, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (level_id, player) DO UPDATE SET stars = excluded.stars, updated_at = excluded.updated_at')
      .bind(id, b.player, b.stars, now),
    db.prepare(`UPDATE levels SET
        rating_sum = (SELECT COALESCE(SUM(stars), 0) FROM ratings WHERE level_id = ?1),
        rating_count = (SELECT COUNT(*) FROM ratings WHERE level_id = ?1)
      WHERE id = ?1`).bind(id),
    db.prepare(`UPDATE levels SET
        rating_avg = CASE WHEN rating_count > 0 THEN CAST(rating_sum AS REAL) / rating_count ELSE 0 END,
        score = CASE WHEN rating_count > 0 THEN (${PRIOR_MEAN * PRIOR_WEIGHT} + rating_sum) * 1.0 / (${PRIOR_WEIGHT} + rating_count) ELSE -1 END
      WHERE id = ?`).bind(id)
  ])
  const r = await db.prepare('SELECT rating_avg, rating_count FROM levels WHERE id = ?').bind(id).first()
  return json({ ratingAvg: Math.round(r.rating_avg * 100) / 100, ratingCount: r.rating_count })
}
