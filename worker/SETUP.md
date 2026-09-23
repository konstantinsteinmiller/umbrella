# Leaderboard setup, start to finish

## Current deployment (2026-09-23)

| | |
|---|---|
| URL | `https://elemental-barrage-leaderboard.rodent-race.workers.dev` |
| Cloudflare account | `rodent.race.app@gmail.com` (the one `wrangler` was logged into) — NOT the `hyperg8` account that hosts the survivalist / tower-siege boards |
| D1 database | `elemental-barrage-leaderboard` · `6187430c-b73f-4a18-9434-0f540c79a820` · region EEUR · tables created 2026-09-23 |
| Worker version | `977e047d-5a1a-47ee-bac0-54a248f33e0a` (wrangler 3.114) |
| `SCORE_SECRET` | not set (optional, see below) |
| `score` / `flair` | best ROW reached (the depth) / highest ball tier ever merged |

Steps 1–6 below are DONE for that deployment (smoke-tested: `/top` answers an
empty board, an implausible POST is refused with 422, the CORS preflight is
204). The game side (step 7) is wired through `.env`; the Poki / Yandex /
Playgama builds keep `VITE_LEADERBOARD_URL` empty and bake the SEEDED board.
`pnpm leaderboard:snapshot` refuses an empty board, so the baked live snapshot
only appears once real players have posted — until then a live build's badge
rides the live fetch alone. To move it to another account: `npx wrangler login`
as that account, run steps 3–5 again, then change the URL in `.env` and
`DEFAULT_SOURCE` in `scripts/leaderboard-snapshot.mjs`.

In this game the rank is a runic plaque centred on the board's top edge
(`src/components/atoms/RankBadge.vue`, framed by `RuneFrame` like the upgrade
chips), shown on every device from the first second. It is reported from
`src/use/useWaveLeaderboard.ts` on boot, on every new best row (throttled to
one write per 3 min) and on a breach / the tab going away.

---

Every command below is run in PowerShell on Windows, from the repo root unless
it says otherwise. `elemental-barrage` is this game's slug — substitute it everywhere.

Nothing here touches the game's behaviour until step 7: until
`VITE_LEADERBOARD_URL` is set, the client treats the board as "feature off" and
the rank tag simply never appears.

---

## 1. Install the Worker toolchain

The Worker has its own `package.json`, deliberately separate from the game's —
it deploys on its own schedule and shares none of the game's dependencies.

```powershell
cd worker
npm install
```

(`pnpm install` works too. The lockfile it creates is local to `worker/`.)

## 2. Authorise the CLI

```powershell
npx wrangler login
```

A browser tab opens on the account you are already signed into. Click **Allow**.
The terminal then prints `Successfully logged in`. Confirm the account:

```powershell
npx wrangler whoami
```

## 3. Create the database

```powershell
npx wrangler d1 create elemental-barrage-leaderboard
```

It prints a block like this:

```toml
[[d1_databases]]
binding = "DB"
database_name = "elemental-barrage-leaderboard"
database_id = "0f2c9a51-....-............"
```

**Copy the `database_id` value** into `worker/wrangler.toml`, replacing
`REPLACE_ME`. That one line is the only edit the file needs.

## 4. Create the tables

```powershell
npm run db:init
```

This runs `schema.sql` against the **remote** database (the real one, not the
local emulator). Wrangler asks before touching remote data — answer `y`. You
should see two `CREATE TABLE` statements and one `CREATE INDEX` execute.

Verify from the dashboard if you like: **Storage & Databases → D1 →
elemental-barrage-leaderboard → Tables** should now list `scores` and `board_cache`.

## 5. Deploy

```powershell
npm run deploy
```

On a brand-new account this asks you to register a `workers.dev` subdomain
first — pick anything, it becomes part of the URL. When it finishes it prints:

```
Published elemental-barrage-leaderboard
  https://elemental-barrage-leaderboard.<your-subdomain>.workers.dev
```

**That URL is what the game needs.** Keep it.

## 6. Check it is alive

```powershell
$BOARD = 'https://elemental-barrage-leaderboard.<your-subdomain>.workers.dev'

# The board — empty at this point, which is the correct answer.
Invoke-RestMethod "$BOARD/top"

# Post a fake score and get a rank back.
$body = @{ id = 'testplayer01'; name = 'Tester'; score = 137; flair = 21 } | ConvertTo-Json
Invoke-RestMethod -Method Post -ContentType 'application/json' -Body $body "$BOARD/score"
```

The first returns `entries: {}` / `total: 0`. The second returns
`rank: 1, best: 137, total: 1`, and re-running `/top` now shows the entry.

Sanity-check the guards while you are here — both should be **rejected**:

```powershell
# 422: a score past MAX_SCORE.
$bad = @{ id = 'testplayer01'; name = 'Cheat'; score = 999999999; flair = 3 } | ConvertTo-Json
Invoke-RestMethod -Method Post -ContentType 'application/json' -Body $bad "$BOARD/score"

# 429: two writes for the same id inside the 3 s cooldown — run the good POST
#      above twice in a row.
```

Delete the test row when you are done:

```powershell
npx wrangler d1 execute elemental-barrage-leaderboard --remote `
  --command "DELETE FROM scores WHERE id = 'testplayer01'"
# The cached blob still holds the old table until BOARD_TTL_MS expires and a
# read rebuilds it (writes no longer rebuild) — clear it to see the change now:
npx wrangler d1 execute elemental-barrage-leaderboard --remote --command "DELETE FROM board_cache"
```

## 7. Point the game at it

In the repo root, edit `.env`:

```
VITE_LEADERBOARD_URL=https://elemental-barrage-leaderboard.<your-subdomain>.workers.dev
VITE_LEADERBOARD_SECRET=
```

Vite loads `.env` for **every** build mode, so this one line switches the board
on for all of them. Two consequences worth knowing:

* **You do not need to touch `csp.ts`.** `buildCsp()` reads this same variable
  and folds the ORIGIN into `connect-src` itself, so the policy can never fall
  out of step with the endpoint.
* **The offline portals are the exception.** Poki forbids every external runtime
  request; Yandex's moderators reject third-party storage endpoints found
  anywhere in the bundle. Both build with the URL empty and ship the baked
  snapshot instead — add this line to `.env.poki.local` and `.env.yandex.local`:

  ```
  VITE_LEADERBOARD_URL=
  ```

Now run the game, finish a run, and check the result screen shows the rank
badge. In devtools' Network tab you should see exactly one request to the
Worker: a `POST /score` on a personal record, or a `GET /top` when it is not.

## 8. Ship it

Nothing extra — every `build:*` script picks the variable up from `.env`. To
confirm before uploading, grep the built HTML for the origin; it must be in the
CSP meta tag:

```powershell
Select-String -Path dist\index.html -Pattern "workers.dev"
```

---

## Running it locally (optional)

Useful when changing the Worker itself — no deploys, no remote data:

```powershell
cd worker
npm run db:init:local     # tables in the local emulator
npm run dev               # http://localhost:8787
```

Then set `VITE_LEADERBOARD_URL=http://localhost:8787` in the game's `.env` while
you work. The edge cache is a no-op locally, so every `/top` hits the database —
that is expected and does not reflect production behaviour.

## Signed submissions (optional)

Raises the bar against hand-rolled POSTs. It does not make the board
tamper-proof: the secret ships inside a public bundle, so a determined player
can extract it. The bound in `plausible()` is what actually caps the damage.

```powershell
cd worker
npx wrangler secret put SCORE_SECRET     # paste any long random string
npm run deploy
```

Then put the **same** string in the repo root `.env`:

```
VITE_LEADERBOARD_SECRET=<the same string>
```

Both sides must be set or neither: the Worker only demands a signature when
`SCORE_SECRET` exists, and the client only sends one when
`VITE_LEADERBOARD_SECRET` does. Either order of rollout is safe.

## Locking down origins (optional, later)

`ALLOWED_ORIGINS` in `wrangler.toml` is empty, which allows any origin. That is
the right setting while you are still collecting portal URLs — each portal
serves the game from a different host, and sandboxed iframes send
`Origin: null`, so an early allowlist mostly locks out your own game. Once you
know the real list:

```toml
ALLOWED_ORIGINS = "https://www.crazygames.com,https://html5.gamemonetize.com"
```

Then `npm run deploy` again.

## Watching it in production

* **Live logs:** `npx wrangler tail` (from `worker/`), or the dashboard under
  **Workers & Pages → elemental-barrage-leaderboard → Logs**.
* **Quota use:** same page, **Metrics**. Watch requests/day (100 k) and D1 rows
  **written**/day (100 k). Reads are effectively free under this design: a view
  costs one row or zero, and a submission three. The fixed ceiling is the two
  materialised rebuilds — the board every `BOARD_TTL_MS` and the histogram every
  `DIST_TTL_MS` — which together are a low tens of thousands of rows a day
  whatever the traffic does.
* **The data:** **Storage & Databases → D1 → elemental-barrage-leaderboard → Console**
  runs SQL straight from the browser, e.g.
  `SELECT * FROM scores ORDER BY score DESC LIMIT 20;`

## Clearing the rows an unstable identity left behind

If the board holds several rows for the same person — the symptom of a build
that could mint a fresh id per session — the honest fix is to empty it and let
the current build repopulate. The rows cannot be merged reliably.

```powershell
cd worker
npx wrangler d1 execute elemental-barrage-leaderboard --remote --command "DELETE FROM scores"
# The materialised top-N is a separate row and does not clear itself.
npx wrangler d1 execute elemental-barrage-leaderboard --remote --command "DELETE FROM board_cache"
```

## The histogram on `/top`, and the baked board

`GET /top` returns the published rows **and** a histogram of every score:

```json
{ "updatedAt": 1757254334067, "total": 2422,
  "entries": [ ... 100 rows ... ],
  "dist": [[134,1],[74,1],[72,1], ...] }
```

`dist` is `[score, howManyPlayersHaveIt]`, ordered score-descending, so the
client can compute the rank this Worker would — `COUNT(*) WHERE score > ?` plus
one — for **any** score, without asking. That is what makes every rank in the
game EXACT: the rows stop at 100, and on a board of thousands almost every
player sits below that cut. Without the histogram the client falls back to
estimating their placing from the published rows and the population count — a
plausible number, but a guess. The player never sees "#100+" either way; the
histogram is what makes the number true.

The histogram is materialised into `board_cache` under the id `dist` and rebuilt
only when that row is older than `DIST_TTL_MS` (one hour). This matters: its
`GROUP BY score` is the one query here that reads every row, so it must never
run per request or on the write path.

### The snapshot

```powershell
pnpm leaderboard:snapshot        # writes data/leaderboard-snapshot.json
```

Every build bakes that file (`vite.config.ts` refreshes it first, skipping if it
was fetched in the last ten minutes so a run of portal builds makes one
request). On Poki and Yandex it IS the leaderboard; everywhere else it is the
bottom rung of the offline ladder. **Commit the JSON** — that is what makes an
offline build reproducible.

Set `LEADERBOARD_SNAPSHOT_URL` to point the refresh at a staging Worker.
