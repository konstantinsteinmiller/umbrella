# Blind playtest

Four AI testers (Claude Sonnet, one persona each) play a fresh build for 3 minutes in four headed Chrome
windows emulating a 390×844 phone. They see only screenshots and can only tap, drag, wait or quit. They get
no rules, docs or source. The harness logs game telemetry (row, tray, coins, upgrades, mute) for the report
but never shows it to them.

**Play budget.** Each action costs its in-game duration plus 2 s of "thinking". The model's own latency
doesn't count, so a session holds about as many turns as a human's 3 minutes. There's also a 15-minute
wall-clock cap.

## Run it

```sh
# 1. a stable production build (no HMR reloads mid-test, no leaderboard writes)
VITE_LEADERBOARD_URL= VITE_LEADERBOARD_SECRET= VITE_ENABLE_OBFUSCATION=false npx vite build --outDir <tmp>/dist-playtest
npx vite preview --outDir <tmp>/dist-playtest --port 5320 --strictPort --host 127.0.0.1   # check <title>

# 2. four tiled tester windows (fresh profiles, ports 9511–9514)
node tools/playtest/start-players.mjs playtest-runs/run-N

# 3. one Sonnet agent per persona with the prompt below (personas.mjs has the briefs + ports)

# 4. close the windows (ends any open session, stops only this run's processes)
node tools/playtest/stop-players.mjs playtest-runs/run-N

# 5. read every report.json, write playtest-runs/run-N/findings.json, then build the page
node tools/playtest/build-report.mjs --run playtest-runs/run-N --previous playtest-runs/run-1,playtest-runs/run-2   # all earlier runs, oldest first
```

`findings.json` holds `{ summary: { headline, bullets[] }, findings: [{ id, severity, title, players[], detail,
recommendation, evidence: [{ player, shot, sec }], status? }] }`. `status` is `fixed`, `improved`, `open` or
`new`, and it only means something when there is a previous run. The page is `tools/playtest/report/index.html`;
the builder copies it next to `data.json` and the screenshots, ready to publish as an artifact. Runs live in
the git-ignored `playtest-runs/`.

## Tester prompt (fill `{brief}`, `{name}`, `{api}`, `{reportPath}`)

> You are a BLIND PLAYTESTER for a brand-new mobile web game. You know nothing about it — no name, no rules,
> no genre. You play it for the first time, in character, and report what a real first-time player would
> experience.
>
> PERSONA — {brief}
>
> HARD RULES (a blind test is worthless if broken): Your ONLY way to see the game is the screenshots the CLI
> returns; your ONLY way to act is the CLI. Do NOT read, list or grep any project files, source code, docs,
> configs or other folders. Do NOT open any URL yourself. Do NOT start, stop or kill any process or browser.
> Tools you may use: Bash (ONLY for the `node <CLI>` commands below), Read (ONLY on screenshot paths the CLI
> returns), Write (ONLY for your final report file).
> CLI: `node "<repo>/tools/playtest/pt.mjs" {api} <command> [args]` — `hello` · `shot` · `wait <ms>` (≤5000) ·
> `tap <x> <y>` · `drag <x0> <y0> <x1> <y1> [ms]` · `end` (quit early, only if {name} would genuinely quit).
> The phone screen is 390×844; screenshot pixels = touch coordinates. Every command returns JSON with
> screenshot paths (`shots`), `playedSec` and `leftSec`; read EVERY screenshot returned. You have 3 MINUTES
> OF PLAY TIME (action game-time + 2 s per action); keep playing until the CLI says `ended: true`, then write
> the report.
>
> HOW TO PLAY: behave like {name}; figure things out only from what's on screen; think aloud and keep a
> running log with the `playedSec` of each moment — what you see, expect, try, what surprised you, every
> moment you did not know what to do (confusion), every moment that felt good (delight), anything broken
> (bug). Be honest and specific; don't guess the designer's intent or be polite.
>
> FINAL REPORT — write JSON to `{reportPath}` with keys: persona, firstImpression, whatIThinkTheGameIs,
> understoodGoalAtSec, understoodControlsAtSec, moments[{sec, shot, type: confusion|delight|frustration|
> insight|bug, note}] (8–20, chronological), bugs[{sec, shot, severity: low|medium|high, what, repro}],
> mechanicsIFiguredOut[], stillUnclear[], ratings{fun, clarity, controls, visuals, wantToKeepPlaying: 1–5},
> wouldContinueAfter3Min, whyOrWhyNot, topSuggestions[≤5], verdict. Then reply with a 3–5 sentence summary.

The German persona writes its report in English and quotes on-screen German verbatim.

## Caveats

Testers see still frames, not motion or sound, so feedback that only shows in motion is under-weighted.
The one exception the harness handles itself: when the game pauses on the merge lightbox while a turn
settles, it takes an extra `NNN-moment.jpg` frame (≤ 2 per action), which the tester gets like any other
and the report always keeps. In run 3 every lightbox fell between an action's two stills.
They are a stand-in for first-time players. That makes them good at finding readability and flow gaps,
but not a substitute for a human playtest or a portal fit test.
