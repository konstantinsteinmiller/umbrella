# Blind playtest

Four AI testers (Claude Sonnet, one persona each) play a fresh build for 3 minutes in four headed Chrome
windows emulating a 390×844 phone. They see only screenshots and can only tap, drag, wait or quit. They get
no rules, docs or source. The harness logs game telemetry (row, tray, coins, upgrades, mute) for the report
but never shows it to them.

**Play budget.** Each action costs its in-game duration plus 2 s of "thinking". The model's own latency
doesn't count, so a session holds about as many turns as a human's session of the same length. The default
is 3 minutes with a 15-minute wall-clock cap; run 9 played 5 minutes, extended to 7 for a tester who had not
lost by then (`--budget 300 --extend 420 --wallcap 2100`). When a loss shrinks the budget, the reply carries a
`note` saying so. In run 9, two testers filed the drop in `leftSec` as "the game skipped 2 minutes". A loss that
lands past the base budget still gets 30 s (`GRACE`) so its aftermath is seen.

## Run it

```sh
# 1. a stable production build (no HMR reloads mid-test, no leaderboard writes)
VITE_LEADERBOARD_URL= VITE_LEADERBOARD_SECRET= VITE_ENABLE_OBFUSCATION=false npx vite build --outDir <tmp>/dist-playtest
npx vite preview --outDir <tmp>/dist-playtest --port 5320 --strictPort --host 127.0.0.1   # check <title>

# 2. four tiled tester windows (fresh profiles, ports 9511–9514); optional budget flags (play seconds):
#    --budget 300 --extend 420 = 5 minutes, 7 for a tester who has not lost by then; --wallcap = wall-clock cap
node tools/playtest/start-players.mjs playtest-runs/run-N [http://127.0.0.1:5320/] [--budget 300 --extend 420 --wallcap 2100]

# 3. one Sonnet agent per persona with the prompt below (personas.mjs has the briefs + ports)

# 4. close the windows (ends any open session, stops only this run's processes)
node tools/playtest/stop-players.mjs playtest-runs/run-N

# 5. read every report.json, write playtest-runs/run-N/findings.json, then build the page
node tools/playtest/build-report.mjs --run playtest-runs/run-N --previous playtest-runs/run-1,playtest-runs/run-2,…   # all earlier runs, oldest first
```

`findings.json` holds `{ summary: { headline, bullets[] }, findings: [{ id, severity, title, players[], detail,
recommendation, evidence: [{ player, shot, sec }], status? }] }`. `status` is `fixed`, `improved`, `open` or
`new`, and it only means something when there is a previous run. The page is `tools/playtest/report/index.html`;
the builder copies it next to `data.json` and the screenshots, ready to publish as an artifact. Runs live in
the git-ignored `playtest-runs/`.

## Tester prompt (fill `{brief}`, `{name}`, `{api}`, `{reportPath}`, `{budget}`)

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
> screenshot paths (`shots`), `playedSec` and `leftSec`; read EVERY screenshot returned. You have {budget}
> OF PLAY TIME (action game-time + 2 s per action; e.g. "3 MINUTES", or run 9's "about 5 MINUTES — up to 7 if
> you never lose; `leftSec` always tells you what is left"); keep playing until the CLI says `ended: true`,
> then write the report.
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
Two harness measures narrow that gap:
- **Moments.** While a turn settles and for a second after it, each merge lightbox and the FIRST showing of
  each distinct coach lesson (the sr-only sentence in a `[data-coach-live]` region, compared as text) get an
  extra `NNN-moment.jpg` frame (≤ 2 per action). The tester gets it like any other frame, and the report
  always keeps it. In runs 3–4 every lightbox and the overrun demo fell between an action's two stills.
  Since run 7 a fresh sentence that shows while the game is HELD between actions (an unlock's fly-in runs on
  DOM timers) gets one too, at the front of the next action's shots; the death sequence's "WASTED" is one.
  Since run 9 the first "+1" spotlight (`.pickup-box`) counts as a lightbox with two frames: the "+1" in flight,
  then the ball in the tray. It pauses the game, and in run 9 it ran out before any frame. Since run 12 the
  spotlight lessons (`.lesson-spot`: the launcher's countdown, the speed / luck / bounty chips) get two frames
  too, ~1 s and ~2.4 s in: the demo's first act and its payoff.
- **Hold between actions.** Outside an action the page reports itself hidden, so the game's own visibility
  pause stops the sim; each action resumes it. Game time then matches the play budget (action time + think)
  instead of running through a model's 10–20 s of thinking. In run 4 the flying chest was gone before any
  tap landed. Wall-clock timers (the treasure chest's refill, the 20-s shot-demo rule) still run in real time.

**Tester agents inherit the project's memory.** In run 8 a tester cited "your standing note" (the memory index
is loaded into every agent spawned from this project), so the blind setup leaked a little. Since run 9 the
index (`MEMORY.md` in the project's memory folder) is moved aside just while the four agents are spawned and
put back right after — or launch them from a session without project memory.

**Don't file: "the boss HP is stuck".** Two stills a few shots apart that show the same boss HP are
misses between frames (a straight shot from a launcher off to the side passes the boss) — not a player
problem (the designer's call after run 7). Leave it out of findings, follow-ups and the plan.

**Don't file: "a boss off to the side is never hit by plain taps".** A tester that only taps the unit
repeats one straight shot; a human aims at what they are fighting. In run 12 Mia lost the first boss that
way — an AI-only problem (the designer's call after run 12). Report the loss as a number, never as a
finding, follow-up or plan item.

The testers are a stand-in for first-time players. That makes them good at finding readability and flow
gaps, but not a substitute for a human playtest or a portal fit test.

**The tester windows are muted** (`--mute-audio`, since run 12). In runs 1 and 11 all four testers filed
"the sound muted itself": four windows of game audio on the desktop got silenced by hand through the game's
own speaker button. Nobody needs to touch the windows now, and the in-game mute stays the testers' own.

`--headless 1` on `pt-daemon.mjs` runs a tester window headless, for testing the harness itself.
