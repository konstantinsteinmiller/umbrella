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
  **The run's FIRST boss comes alone** (`isFirstBoss`: spawn row < 20; playtest run 2): no walkers beside
  it, and while it lives every new row carries only its "+1" — no walkers, no bubbles. Its Slime Tower
  minions (its one rule) still come.
  **It clears the stage as it arrives** (playtest run 3: the 8–13 grunts already on the board shielded it
  for several turns — "HP bar stayed pinned at 57"): right after its `bossSpawn` the engine emits
  `bossRoar {monsterId, ids, x, y}` and kills every walker on the board (normal kill coins, through gem
  shields, no imp split; pickups and hazards stay). The renderer plays it as a roar shockwave that blows
  them away; the first hit on a boss pops an extra-big number on the boss. Keyed on `isFirstBoss`, so the
  FTUE's scripted Slime Tower roars, later bosses and a checkpoint restart past row 10 never do; it reads the
  board, never the RNG. Walkers that marched past the line in that advance die before the breach check.
- Boss enrages at < 30% HP (`bossEnrage`), then marches 2 rows per turn. Killing it emits `bossDefeated`
  (with `bounty`) → the state layer sets the CHECKPOINT at that row.
- **Boss death blast** (playtest run 2: a boss kill and OVERRUN landed in the same turn): right after
  `bossDefeated` the engine emits `bossBlast {monsterId, rows: 2, ids, x, y}` and kills every monster in the
  bottom two rows (normal kill coins, through gem shields, no imp split); a boss that died before its turn's
  advance makes that advance move and spawn nothing (the quiet turn). A boss kill is never followed by a
  breach in the same turn.
- Breach: any monster that would march with its bottom edge past `ROWS`. If `shields > 0` a shield is
  consumed automatically (`shieldBlock`, same effect as a meteor continue). Otherwise phase → `breach` and the
  engine waits for `continueAfterBreach()` or for the state layer to rebuild the run from the checkpoint.
- `danger` event whenever the lowest monster is ≤ 2 rows from breaching (renderer: red floor pulse).
  Always on as well (renderer, `render/danger.ts`): every monster ≤ 2 marches from the line wears a
  marches-left pip (amber `2`, pulsing red `1`; numbers only), and the aim phase whose coming march breaches
  shakes the board once (`small`, never under prefers-reduced-motion) and plays one warning sound.

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
corrupted. Boss HP = `HP_CURVE.boss` (15) × row HP for the run's FIRST boss (the scripted FTUE Slime Tower
gets 0.28× of that) and `HP_CURVE.bossLater` (45) × row HP for every later one (`bossHp`), at the clock row
after its walkers' (see the HP clock). Slime Tower spawns a slime beside its top visible row every 2nd turn
(never within 3 marches of the line).

**Row HP** (`rowHp(hpRow)`, read off the HP clock): MIW shape (0.36·h·1.185^(h−1)) up to clock row 10 (17 HP),
then ×1.15 per clock row to row 18 (51), then ×1.25 per clock row (79 at 20, 242 at 25, 738 at 30, 6,877 at
40). Tuned by the bot sim (`scripts/barrage-sim.mjs`; its header holds the targets and before → after).
**HP clock** (`hpRow` in the engine, `RunSnapshot.hpRow/hpHold`): one clock row per spawned row, except the
held ones — a boss's own row (its walkers stay at the last clock row, the boss takes the next), the whole
fight against the first boss, the first 3 rows (`fightHold`) of a later boss fight, and the 2 rows
(`plateau`) spawned right after a boss kill. A fresh board (`createEngineAtRow(config, row, tray, hpClock?)`,
or a save from before the clock) starts at `hpClockAt(row)`: a typical run that held 5 rows (`bossHold`) per
boss — row 11 → clock 9 with 3 more held rows (the plateau), row 20 → 14, 30 → 19, 40 → 24. Kill coins,
bounty, kinds, bosses and corruption stay on the real row. Never touches the RNG. **Daily Barrage** (a
fixed-kit sprint with no checkpoints) never holds it: its clock is the row counter itself, bosses included
(the holds stretched a daily run to ~50–60 rows, 6–9 min).
**Safety net** (`config.assist`, 0..1, endless only): up to −20% HP (`ASSIST.cut`, bosses included), fading
linearly out over clock rows 20 → 40 (`ASSIST.fadeFrom/fadeTo`). The state layer feeds it
`assistForPaidLevels(paid)`: 1 below 2 PAID upgrade levels (the FTUE's free capacity does not count), then
0.75, 0.5, 0.25 and 0 from 5 paid levels — one purchase moves monster HP by ≤ 5%. Read at spawn time (a change
never touches a monster already out), never touches the RNG.
**Run-3 pass — no cliffs** (playtest run 3: every tester hit a wall within five rows of the first boss; row HP
went 17 → 73 → 181 → 280 at rows 10/16/20/22 while their damage was ×1.25–1.56, and the safety net switching
off at the 2nd purchase made monsters jump ~25% the moment the player got stronger):
- rows 11–30 grow much flatter (~10–12% per row), the late game keeps its pressure past row 30 — ×1.15 per
  clock row to clock 18, then ×1.25; with the clock held ~5 rows per boss a veteran meets about the old HP
  again from row ~50 (clock 30);
- the HP clock does not run while a boss fight lasts, and the rows right after a boss kill are a short
  plateau — the monsters after a boss come back at about the strength they had before it (the first boss:
  its whole fight; a later boss: its first 3 rows — held for a whole fight, a first-timer's 6–8-row fights
  froze HP for most of every 10 rows and no curve kept late pressure without a wall);
- the safety net fades instead of switching: `assistForPaidLevels(paid)` (economy.ts) steps down in small
  bites per paid level, and `assistHpMult` fades over rows instead of stopping dead at row 30 — no single
  purchase or row makes monsters jump;
- the first session's loss is the row-20 boss (×45), not a walker wall: walkers never threaten a first-timer
  before it, and about half of them beat it on the first try;
- tuned against a new `human` sim bot (random-ish aim, ~1 purchase per 4–6 turns, Damage first) as well as
  the old bots. Human bot, before → after: walker pressure at rows 16–20 5.6× → 1.3× of rows 6–10, first
  walker row after the first boss ÷ last before it 4.6 → 1.1, row-10 boss first try 24/24, first breach row
  31 at ~5 min (now the row-20 boss, first try 10/24), row-30 boss killed at turn 165 → 90. No-upgrade bot
  first breach row 26 → 29; casual bot first breach 35 → 60, best row 63 → 83, still ~9 breaches in 220
  turns. Daily (fixed kit, clock = row, 30 dates) runs end at rows 29 / 30 / 39 for random / best-of-2 /
  best-of-8 aim (~3.5 / 4.8 / 4.7 min); best-of-2 reaches rows 38–43 on 5 of 30 dates, random never
  passes 33. Full numbers: `scripts/barrage-sim.mjs` header.

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
- A chest crosses at y ≈ 4.5 every ~120 s of play (`chestTimer`), born fully on the board and hittable
  for ~8 s (~13 s in the first session, 0.6× speed). A ball hit OR a tap on it (`engine.tapChest(x, y)`,
  chest radius + 0.35 cell; every phase but `breach`) opens it: coins (≈ 8 kills' worth) and 40% chance of
  a random skill bubble effect. The first chest of a session carries a wordless tap hint.
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
- *pull* (now the aim hint): a ghost finger inside the board drags toward the monsters while the dotted
  line grows from the launcher (playtest run 1: every blind tester's first drag went toward the monsters,
  so that is the gesture taught; the slingshot still works but is never the lesson). Run-2 rule (also
  for the FTUE's aim hand): shown in the aim phase unless a shot was fired within the last 20 s — so it is
  on at once before the first shot (first frame already shows the hand) and back for a player returning
  from AFK; no idle/novice gating. The wrong-way refusal is gone — see §10.
- *survive*: ≤ 2 rows to the line → threat reticles + a rescue shot found by trial (marches-left: the
  canvas's always-on danger pips; the coach's chevrons are gone)
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
  socket, damage flares the unit, speed streams balls, luck adds bubbles, bounty fills the wallet).
- *upgrade funnel* (run 2: nobody bought a paid upgrade; its own channel `upgradeFunnel`, never over the
  board): once Ball Damage is affordable after the free Tray Capacity, runic gold arrows point at its chip,
  coins fly from the wallet into it and the hand presses it — every aim phase until Damage is bought
  (≤ 6 showings, `eb_coach.shown.arrows`); after every boss kill / breach the arrows return on the
  glowing chip for 2 aim phases (or until any purchase); an aim that opens with something affordable and
  no purchase for 2 aims pulses the glowing chip. Every other affordable chip wears a quiet gold glow;
  short prices are grey; a refused tap = red price + "need N more" callout + wallet pulse + small shake.
- *merge lightbox* (`components/barrage/mergeLightbox.ts`): the first 3 merges of a profile and every
  discovery pause the game (`acquireAppPause`) and stage the merge in the tray (twins fly together, fuse,
  comet into the launcher; a discovery peeks its codex entry), tap to skip; the NEW BALL reveal is
  deferred until it ends. Count: `eb_coach.shown.mergeBox`. Later merges animate in the tray unpaused.
- *overrun* (run 3: testers who never breached never learned what the line does): the first time a monster
  shows the `1` pip, the coach plays `overrunDemo` on it before anything else (sr-only sentence only);
  counted as `eb_coach.shown.overrun`, one visible showing (a board that has not drawn the monster yet returns
  0 and the lesson retries a few frames, then waits for the next aim with a `1` pip). Runs during the FTUE too;
  a real endless breach, a save with a lifetime loss, or a pre-coach veteran counts as already taught.
- *HUD name tips* (run 3: the chest's countdown / gift pill and the tray's shield charge went unexplained):
  tapping a tray status icon (shield / revive / warcry) or a still-filling treasure chest shows a small plate
  beside it — its glyph, its name and its value (the chest: countdown + the gift it fills toward) — gone
  after ~2.5 s or at the next touch (`HudTip.vue`, `hudTip.ts`). A label on demand, never a teaching card.
  Monster rule badges get none: a tap on the board is a shot.
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
- Emits: `aimStart`, `aimCancel`, `fired(angle: number)`, `misfire('tap')` (released on the launcher — the
  only cancel), `chestTapped`. (`aimWrongWay` / `misfire('wrongWay')` stay declared, never emitted.)
- `defineExpose`: `launcherClientPoint(): {x, y} | null`, `cellToClient(x: number, y: number): {x, y} | null`
  (board cells → client px; tutorial hand + banners), `boardClientRect(): DOMRect | null`.
- Fills its parent box and letterboxes the board (aspect `COLS : FLOOR_Y + small margins`); owns the rAF
  loop: `engine.update(dt)` unless `isGamePaused || useBarrage().holdSim`; always draws. Aim input only in
  phase `aim`, dual-mode, decided by the finger's position against the launch line (±0.2-cell dead band):
  above it the shot points AT the finger; below it (also over the bottom panel) it is a slingshot through
  the launcher. The dotted preview shows from the press, only while a finger is down, and ends in a hollow
  ring (never a ball). Release always fires (clamped to 8°/172°); a tap fires at the tapped point. Fine aim
  applies to the slingshot only (off above 300 px/s, never > 6° off the finger). A tap on the flying chest
  opens it instead of aiming.
  **The unit** (playtest run 3: the most natural first tap — on the unit — was the one gesture that did
  nothing): a TAP on the launcher fires the repeat shot (the run's last fired angle, straight up before the
  first), and its preview shows while the finger rests there. The only cancel is a DRAG that left the
  launcher pad (0.6 cell) and comes back onto it → `misfire('tap')`.
- `defineExpose` additions (run 3): `beginAimFrom(e: PointerEvent): boolean` — starts an aim from a finger
  that went down OUTSIDE the canvas (the tray's ball orbs in the bottom panel: dragging up from them is the
  slingshot motion); it behaves like a press on the unit (release before moving = the repeat shot, then
  ordinary dual-mode aim). Same gates as a press on the board (phase `aim`, `canFire`, not paused / held);
  returns false when it did not start. `overrunDemo(monsterId: number): number` — the wordless lose-rule
  demo: a ghost of that monster marches across the line, the line flashes red and the breach skull flashes
  on it; the real board is untouched. Returns its duration in ms (0 = could not play).
- The line itself wears a small skull glyph (always on, dim; lit while any monster shows a `1` pip).
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
