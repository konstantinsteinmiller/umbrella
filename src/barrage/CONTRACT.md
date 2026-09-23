# Elemental Barrage — build contract

Source concept: `non-strategy-concepts.md` §4 (Concept B). This file turns it into binding rules for the
parallel build. `engine/types.ts` is the code-level contract; this file is the behavioural one.
**Mobile-first**: portrait phone (360–430 px wide) is the primary target; landscape and desktop must work
but are secondary.

## 0. Casual contract (never violate)
1. Nothing chosen before a run can lose it. Launchers/skins are cosmetic (+ a tiny passive at most).
2. Aim is the only skill. No planning prompts, no loadouts.
3. One obvious next upgrade: the cheapest affordable upgrade glows.
4. Merges are automatic (tray overflow). Always strictly positive (a merged ball does 2.2× one ball).
5. Breach ≠ game over: rewarded Meteor continue (once per checkpoint) or restart at the last boss checkpoint
   keeping every coin. A breach never costs more than ~2–4 minutes.

## 1. Board and turn flow (engine)
- 7 columns × 10 monster rows, launcher line at `FLOOR_Y`. Coordinates in cells, y down.
- Turn: `aim` → `fire(angle)` → `volley` (balls leave one per `launchInterval` from `launcherX`, bounce off
  side walls, ceiling, monsters, hazards; pass THROUGH pickups, collecting them; land on the floor) →
  `resolve` (burn/poison ticks, dryad heals; ~0.35 s) → `advance` (everything marches 1 row down — frozen
  monsters skip, enraged boss marches 2; goblins hop one column; centaurs may spit sludge; a new row spawns
  at row 0; ~0.4 s) → breach check → `aim`.
- The launcher moves to where the FIRST non-ghost ball landed (clamped to `LAUNCH_MARGIN`).
- Anti-stall: after every bounce enforce |vy| ≥ 0.18 × speed (keeps balls from skimming horizontally forever).
- Fast-forward: volley running > 2 s → `speedMul` 2; > 5 s → 3 (emit `speedUp`). `recall()` ends it at once.
- Physics: fixed step 1/120 s × speedMul, sub-stepped so no ball moves more than `BALL_R` per sub-step.
  Circle-vs-AABB with the reflection normal of the nearest face; one damage event per ball per contact.
  **Deterministic** (same seed + same angles ⇒ same result) — Daily Barrage fairness depends on it.
- Row counter: `row` = rows spawned. Every `BOSS_EVERY` rows the spawned "row" is a BOSS: a 3×3 block that
  enters from above (occupies rows −2..0 on spawn, fully visible after two marches), with 1–3 light monsters
  beside it in row 0. While a boss lives, new rows still spawn but sparser (1–3 monsters).
- Boss enrages at < 30% HP (`bossEnrage`), then marches 2 rows per turn. Killing it emits `bossDefeated`
  (with `bounty`) → the state layer sets the CHECKPOINT at that row.
- Breach: any monster that would march with its bottom edge past `ROWS`. If `shields > 0` a shield is
  consumed automatically (`shieldBlock`, same effect as a meteor continue). Otherwise phase → `breach` and the
  engine waits for `continueAfterBreach()` or for the state layer to rebuild the run from the checkpoint.
- `danger` event whenever the lowest monster is ≤ 2 rows from breaching (renderer: red floor pulse).

## 2. Monsters (one rule each; faces flinch/squash on hit — renderer)
| kind | footprint | rule | unlock row |
|---|---|---|---|
| slime | 1×1 | standard | 1 |
| goblin | 1×1 | hops one column sideways each turn if that cell is free | 6 |
| caterpillar | 2×1 | wide, ×1.6 HP | 12 |
| ogre | 1×1 | ×2 HP (crush balls do ×3 vs it) | 18 |
| dryad | 1×1 | heals orthogonal neighbours 15% max HP each turn; glows "hit me first" | 25 |
| centaur | 1×1 | every 2nd turn spits sludge into a free cell below it (hazard, 1 turn) | 32 |
| imp | 1×1 | defeated → splits into ≤ 2 little imps (35% of its max HP, 35% coins, never split again) in free cells: its own, left, right, above; not when cleared by a meteor continue / boss throw-back | 36 |
| treant | 1×1 | ×2.5 HP; slow: rests (no march) every other turn — `(turn + id) % 2 === 1` — holding up what is behind it | 44 |
| carbuncle | 1×1 | ×1.2 HP; gem shield blocks the first damage of any kind each turn (regrows every aim phase); execute and continue clears go through it | 52 |
| cyclops | 1×1 | ×1.4 HP; charges two rows every other turn — `(turn + id) % 2 === 0` — orange chevrons under it while aiming | 58 |
| corrupted (any kind) | — | elite: ×1.8 HP, ×3 coins, darker tint | 40+ (chance grows) |
Bosses in order: row 10 slime-tower, 20 worm, 30 fire-dragon, 40 silver-dragon, 50 troll, 60 orc, then cycle
corrupted. Boss HP = `HP_CURVE.boss` (15) × row HP; the scripted first Slime Tower gets 0.28×. Slime Tower
spawns a slime beside its top visible row every 2nd turn (never within 3 marches of the line).

**Row HP** (`rowHp(row)`): MIW-style curve with high-row softening so there is no wall; tuned by the bot sim
(`scripts/barrage-sim.mjs`). Tuned targets, re-checked after the onboarding pass: the random-angle bot (the
first-timer proxy) makes its first merge on turn 3, buys a paid upgrade a turn after the free one, kills the
row-10 boss first try in 18/20 seeds and first breaches around row 26; the casual bot (best of 8 sampled
angles) reaches the row-30 boss at ~5.5 min and still breaches every ~2 min past row 30.

## 3. Balls and the tray
- Tier ladder = MIW fighter ladder (tier N ball shows fighter N's portrait). Damage per hit:
  `ballDamage(tier) = damageMult × 2.2^(tier−1)` (T1 = 1). Crit 5% → ×2.
- Abilities per tier: T1 burn · T2 knockback · T3 pierce · T4 freeze · T5 splash · T6 crush · T7 chain ·
  T8 poison · T9 midas · T10+ eruption. Throttle procs so the board stays readable (e.g. chain max 2 jumps,
  eruption every 4th hit of that ball).
- Tray: `tray` sorted descending, `length ≤ trayCapacity`. **Add rule**: push; while `length > capacity`,
  merge the LOWEST tier that has a pair (two of tier t → one t+1, emit `trayMerge`); if no pair exists,
  convert the lowest ball to coins (`trayOverflow`). Only overflow merges — never a merge below capacity.
- A volley launches the tray as it was at `fire()` (highest tier first). Pickups collected mid-volley join
  the tray for the NEXT volley.
- Every row spawns exactly one "+1" ball pickup (tier 1) in a free cell; plus a coin pickup or skill bubble
  with chance scaled by `pickupLuck`. A "+1" that marches into the floor line is collected anyway
  (`pickup` event with `auto: true`; RENDER flies it to the launcher) — ball income stays ~1 per turn for
  every aim, and the tray cap turns it into merges. Coin and skill bubbles that reach the floor vanish.

## 4. Skills (bubbles on the board, triggered when a ball hits/passes them)
meteor: damages every monster (35% of its max HP, bosses 6%) · warcry: next volley ×2 damage ·
legion: +3 ghost balls (tier = best tray tier − 1, min 1) launched from the bubble upward this volley ·
pact: copy your best ball into the tray; if the tray is full this merges the copy with its twin directly ·
shield: +1 shield charge · execute: kill the toughest non-boss monster (boss: −15% max HP) ·
heal: every monster moves back up one row where free (bottom rows first) · revive: +1 revive charge.

## 5. Flying chest, combo, FEVER
- A chest crosses at y ≈ 4.5 every ~120 s of play (`chestTimer`), taking ~8 s. A ball hit opens it:
  coins (≈ 8 kills' worth) and 40% chance of a random skill bubble effect.
- `volleyHits` counts hits; `combo` events at 10/20/30/40; at `FEVER_HITS` → FEVER for the rest of the volley:
  coins ×2, balls drawn rainbow (`ball-rainbow` sprite).

## 6. Economy (state layer)
- Coins per kill: `killCoins(row, kind) × coinMult`; boss bounty ≈ 25 kills. Coins go to the shared wallet
  (`useEpicConfig().addCoins`), fly to the CoinBadge.
- Upgrades (5 tracks, one glows): Ball Damage (×1.25/level compounding), Tray Capacity (2,3,4,6,8,10,12,14,
  16,18,20,24,28,32,36,40 max), Launch Speed (ball speed 15→26 cells/s, interval 0.085→0.045 s, 10 levels),
  Pickup Luck (0→0.5, 10 levels), Coin Bounty (×1.2/level compounding). Costs exponential; early levels cost
  roughly one turn's income so the first upgrades land every ~30–60 s.
- Checkpoint = last defeated boss row (0 before the first boss). The checkpoint snapshot stores the tray.
  Restart from checkpoint = fresh board at `checkpointRow + 1` with the checkpoint tray, keep all coins.
- Persist (inside the `elemental-barrage_state` blob via `getState/setState`, keys prefixed `eb_`):
  run snapshot (saved each time the engine enters `aim`), best row, checkpoint (+ tray), upgrade levels,
  lifetime stats, collections, daily record, meteor-continue-used-this-checkpoint flag, FTUE step.

## 7. FTUE (first session, `config.ftue = true`)
| t | beat |
|---|---|
| 0 s | Row 1: three slimes, HP 1, in columns 2,3,4. Ghost hand drags back and releases (straight up is fine). Tray = [1], capacity 2. |
| ~10 s | Turn 2: a "+1" pickup sits straight above the launcher, in the preview line. |
| ~20 s | Turn 3: another "+1" in line → overflow → Magma Mote ×2 merge into **Frost Whirl** → tier reveal. |
| ~40 s | Free upgrade: "Tray Capacity 3" (costs 0 once). |
| ~2:30 | Row 10: Slime Tower. Win = coin fountain + CHECKPOINT banner. |
FTUE rows 1–5 use HP ≤ 3 and no goblins; while `row ≤ 4` any "+1" left on the board when a volley ends is
auto-collected, so the first merge lands on turn 3 whatever the aim. FTUE ends at the first boss kill.
Before the first boss, a breach restart keeps the tray from the last aim (a fresh row-1 board).

**After the FTUE — the wordless coach** (`use/useCoach.ts`; nothing typed on screen, sentences only in
sr-only live regions; one lesson at a time, exposure-capped, persisted as `eb_coach`; endless mode only
except the pull hint):
- *pull*: a wrong-way drag (pointing AT the monsters, > 35° above horizontal) no longer fires; the stretch
  arrow shows the right pull live under the thumb and replays on release. Also after 2 empty taps and
  after 7 s idle (novices, < 40 lifetime volleys, idle clock armed only by a first input).
- *survive*: ≤ 2 rows to the line → threat reticles + marches-left chevrons + a rescue shot found by trial
  volleys on engine clones (`engine/shotFinder.ts`). ≤ 4 showings, ≥ 2 volleys apart.
- *tray*: after a "+1" spills into coins → the tray acts out "full: no new shot" and presses Tray Capacity.
  ≤ 3 showings, ≥ 2 volleys apart, retired at capacity level 3.
- *combo*: a trial shot with ≥ 10 hits and ≥ 2× the median shot → demonstrated with running hit counts.
  ≤ 4 showings, ≥ 3 volleys after any lesson, retired at a lifetime best combo of 25.
- *trayIntro*: the first aim after the FTUE (and once more ≥ 8 volleys later) acts the tray out on the
  real tray: its balls fly into the unit (= the volley), a "+1" drops into an empty socket, a full tray
  merges twins into the next tier. Always on as well: at every volley the tray streams into the unit and
  a collected "+1" flies into its socket (a "+1" paid out as coins no longer pops "+1" on the tray).
- *upgrade*: the FTUE's upgrade beat shows what the chip DOES (press → spark → effect: capacity adds a
  socket, damage flares the unit, speed streams balls, luck adds bubbles, bounty fills the wallet); the
  same demo plays once more for a paid chip that glowed 2 aim phases unbought.
- New monster kinds wear an in-world rule badge + acted-out rule for their first 4 aim phases (the
  centre "new monster" / BOSS INCOMING / ENRAGED cards are gone). A "+1" pops what it became: +1, the
  merged ball, or a coin.

**Earned HUD** (`use/useFeatureUnlocks.ts`): the first minutes show the board, the tray and the upgrades
only. Treasure chest (row 6 | 1 loss) → codex (11 | 1) → collection (16 | 2) → daily rewards (21 | 3) →
battle pass (26 | 4) → achievements (31 | 5) → daily run (36 | 6), strictly
in order, one per aim phase, only when calm (aim phase, no modal / reveal / held sim / finger down) and
after the FTUE. The button's clone pops up over the board and flies into its slot; the real button then
breathes with a gold ring + sparkle until tapped (or 4 volleys). Locked features are silent (achievement
toasts wait). Saves from before the ladder unlock silently by best row. Default music: Cozy Harmony.
The global rank is NOT on the ladder: the game is competitive, so its runic plaque (`RankBadge`, gold
`RuneFrame` inscribed "global rank") sits on the board's top rim on every layout from the first rank.

**Treasure chest** (`state/useSupplyDrop.ts`, `eb_supply` = last claim, epoch ms): a small gift 3 min after
a claim, a big one (4× the coins, 40 % chance of a skill charge) at 10 min; coins scale with best row. The
chest arrives filled to the small gift the first time it is shown (`arm()`).

**Ball skins** (`ballSkins.ts`, `render/balls.ts`): a skin is a shell, never a replacement — the tier's
face, body colour and halo stay in a window (`SHELL_IN` = 0.72 r), the material fills the band around it,
the tier's accent colour lines the window. `rainbow` is FEVER only (`feverSrc`), not for sale. Retired
ids (`RETIRED_SKIN_PRICES`) are refunded at their price once (`eb_collections.refunded`).

## 8. Monetization (state + UI)
- Rewarded **Meteor continue** at a breach, once per checkpoint.
- Rewarded **2× boss chest**: the boss chest result modal offers "2×" — the ad runs BEFORE the doubled
  payout screen (ad-before-result rule); declining pays 1× immediately.
- Rewarded **+5 balls** (button in the aim HUD; once per checkpoint segment).
- Rewarded **ball-skin unlock**: every locked skin in the Collection offers a movie-icon pill beside its
  coin price — common 1 ad, rare 2, epic 3, legendary 5 (`SKIN_ADS_BY_RARITY`); the count is kept per skin
  (`eb_collections.adViews`, max-merged on hydrate) and the last ad unlocks + equips it. Ad FIRST: the
  count moves only on a granted reward. Not on coin-mode builds (the coin price already is the way in).
- Interstitials ONLY on checkpoint restarts, never the first two restarts of a session, ≥ 3 min apart.
- All rewarded offers are hidden when the provider is not ready (rewarded readiness gating); coin-mode
  builds price them in coins (existing `useReward` handles both).
- gameplayStart/Stop: gameplay is "active" while phase ∈ {aim, volley, resolve, advance} and no modal is open.

## 9. Ownership (parallel build — do not edit files you do not own)
| area | owner |
|---|---|
| `src/barrage/engine/**` (incl. `economy.ts` — the balance numbers), `tests/barrage/engine/**`, `scripts/barrage-sim.mjs` | ENGINE |
| `src/barrage/render/**`, `src/components/barrage/BarrageBoard.vue`, board SFX/VFX, `src/views/BarrageLab.vue` + its one dev-route line in `src/router/index.ts`, additive edits to `src/use/usePrismParticles.ts` | RENDER |
| `src/barrage/state/**`, `src/barrage/keys.ts`, retention re-pointing (`useBattlePass`, `useAchievements`, `useMissions`, leaderboard score source, `useCheats`), `src/i18n/locales/barrageMeta/**`, `tests/barrage/state/**` | STATE |
| `src/views/GameScene.vue`, `src/components/barrage/**` (except BarrageBoard.vue), `TutorialOverlay`/`useTutorial` FTUE, `src/i18n/locales/barrage/**` | UI |
| `engine/types.ts`, this file, `src/barrage/state/contract.ts`, `src/barrage/art.ts`, `src/barrage/ballSkins.ts` | lead (additive edits by owners allowed; note them in your report) |

## 10. Component seam: `src/components/barrage/BarrageBoard.vue` (RENDER builds, UI mounts)
- Props: `coinTarget?: HTMLElement | null` (coins earned on the board fly to it).
- Emits: `aimStart`, `aimCancel`, `fired(angle: number)`.
- `defineExpose`: `launcherClientPoint(): {x, y} | null`, `cellToClient(x: number, y: number): {x, y} | null`
  (board cells → client px; tutorial hand + banners), `boardClientRect(): DOMRect | null`.
- Fills its parent box and letterboxes the board (aspect `COLS : FLOOR_Y + small margins`); owns the rAF
  loop: `engine.update(dt)` unless `isGamePaused || useBarrage().holdSim`; always draws. Input only in
  phase `aim`: slingshot drag anywhere on the board (pull back, the ball flies the opposite way), dotted
  preview to the first bounce + a short continuation, fine-aim when dragging slowly, cancel on a tiny drag.
- Calls `useBarrage().fire(angle)` itself; reads `useCollections().selectedLauncher/selectedSkin`.
- Draws NO localized text (numbers only: HP, damage, "+1"); every word on screen is DOM owned by UI.
- Resets display caches when `useBarrage().engineGen` changes.

## 11. Rules for every agent
- Never `git commit/stash/reset/checkout`. Never reformat files you do not own.
- Whole-project `vue-tsc` will show other agents' in-progress errors — fix only yours.
- All user-facing strings go through i18n (`barrage.*` owned by UI, `barrageMeta.*` owned by STATE), English
  first, then EVERY other locale (20 more files) translated. Canvas shows numbers only.
- Browser checks: never close/kill an existing Chrome; start your own headless Chrome with a private
  `--user-data-dir` and random `--remote-debugging-port`; run your own dev server on your assigned port with
  `--strictPort`, and check the served `<title>` before trusting what you see. Stop your own server when done.
