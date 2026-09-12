# Sound TODO — drop-in audio assets

**How it works:** drop an `.ogg` with the exact filename into `public/audio/sfx/` (music into `public/audio/music/`) → it is auto-detected and played on the next page load (no code change). Until the file exists — or if it fails to decode — the listed **placeholder** (an SFX that already ships) plays instead, so every event always has sound.

**Specs:** `.ogg` (Vorbis), mono ok, 44.1 kHz, short one-shots trimmed tight (< 1s unless noted). Keep peaks ≈ −3 dB; the engine mixes very quietly and pitch-shifts per tier, so deliver at neutral pitch.

## Merge grid — `public/audio/sfx/`

| File                  | Sound | Placeholder now |
|:----------------------| :--- | :--- |
| x`unit-spawn.ogg`     | wet "materialize" pop when a recruit appears | coin-pickup |
| x `instant-spawn.ogg` | golden power-up ignition (rewarded 1-tap-spawn buff starts, ~1.5s) | celebration-1 |
| x`merge-pop.ogg`      | rubbery thud-pop, satisfying (pitch climbs with tier automatically) | level-up |
| x`grid-full.ogg`      | dull denied thunk | obstacle-hit |

## Discovery — a merge creates a tier the player has never had

| File                   | Sound | Placeholder now |
|:-----------------------| :--- | :--- |
| x `new-tier-reveal.ogg` | THE reveal (~3.3 s): the rarest, most rewarding sound in the game — plays once per new tier, on the grid merge or field merge that creates it, while the unit sits in its spotlight halo | — (ships a rendered synth) |

**Timing contract — the halo/spotlight is synced to it, keep it if you replace the file:**

| Time | Event |
|:---|:---|
| 0.00 – 0.35 s | anticipation swell: reverse-cymbal noise riser + metallic sheen + resonant whoosh + fluttering sines gliding up a fifth into the chord |
| **0.35 s** | **the BLOOM**: strummed Dmaj9 of FM celesta + glass bells, soft sub thump, struck-crystal "shing", air burst, glitter spray |
| 0.44 – 1.43 s | ascending D-major-pentatonic celesta arpeggio (D5 → D7, accelerating, short echo), crowned by a long D7; warm "aah" choir pad swelling underneath |
| → 3.26 s | reverb tail, faded out; silent by ~3.3 s (hard max 3.8 s) |

Played as `playSound('new-tier-reveal', 0.07)`. Mastered to max-momentary −15.5 LUFS / true peak ≤ −1 dBFS so it lands ≈ +1.2 dB above the milestone-chest fanfare at their call-site gains. It is also the one SFX the quiet-first-session rule lets through (`TUTORIAL_AUDIBLE_SFX` in `useSound.ts`): the tutorial's merge (→ T2) and field merge (→ T3) are the first two discoveries.

The shipped file is a render, not a recording: `scripts/sfx/new-tier-reveal.html` is the synth graph, `node scripts/sfx/render-new-tier-reveal.mjs [--stems]` (or `pnpm sfx:render`) renders it in a private headless Chrome and loudness-matches + encodes it (needs Chrome + ffmpeg with libvorbis). A pro replacement simply overwrites the same filename — keep the 0.35 s bloom and a similar loudness (`node scripts/sfx/sfx-stats.mjs <file>` prints the numbers).

## Arena skills, slots 5–8

All five ship as renders of `scripts/sfx/arena-skills.html` (`pnpm sfx:skills`, or `node scripts/sfx/render-arena-skills.mjs [name…]`), mastered by the same chain (`scripts/sfx/sfx-master.mjs`). Each is an override slot in `SFX_FALLBACKS`, so a replacement just overwrites the file.

| File | Sound | Plays | Mastered (max momentary) | Placeholder if missing |
|:-----|:------|:------|:------|:------|
| x `skill-warcry.ogg` | Warcry of the Legion (1.7 s): BOOM-BOOM on two war drums, a brass war horn swelling on A2 with its fifth, a legion's "HAAA!" under it | on the cast, `0.07` | −16.5 LUFS | `barricade` |
| x `skill-legion-call.ogg` | Legion Call (2.2 s): a portal tearing open (resonant sweep + sub drop), then three glass bells at 0.34 / 0.46 / 0.58 s — one per spectral warrior — over a hollow "ooh" ghost choir | on the cast, `0.07` | −17 LUFS | `gravity` |
| x `skill-mark.ogg` | Executioner's Mark, the cast (1.2 s): a two-click lock-on, a low cracked death-bell toll, a falling whisper | on the cast, `0.06` | −18.5 LUFS | `crystal-cut` |
| x `skill-execute.ogg` | Executioner's Mark, the execute (0.8 s): blade whoosh → steel "shing" + heavy thud at 0.11 s, a short gong tail | when the marked enemy drops under 12%, `0.07` | −18 LUFS (a 150 ms hit reads ~2 dB quiet on a 400 ms meter) | `chainsaw-break` |
| x `skill-soul-pact.ogg` | Soul Pact (2.3 s): a tremolo'd pull rising for 0.66 s (the sacrifice drawn along the tether), then violet + gold bells a fifth apart over a boom, and two beating tones — the twin — fading | on the cast, `0.07` | −16.5 LUFS | `celebration-3` |

**Timing contract:** Legion Call's three bells land on the arena's three portals, and Soul Pact's 0.66 s arrival is when the sacrifice reaches the champion and the twin pops (`soulPactFx` in `BattleArena.vue`). Keep those beats in a replacement.

## Battle — deploy & combat

| File                   | Sound | Placeholder now |
|:-----------------------| :--- | :--- |
| x `field-merge.ogg`    | big power-up chord (in-arena merge, full heal) | level-up |
| x `army-full.ogg`      | denied bounce (drop rejected, field full) | obstacle-hit |
| x `unit-shot-1..3.ogg` | short ranged pew/puff (3 variants, fired randomly) | dodge |
| x `flesh-hit-1..2.ogg` | wet flesh thud when a ranged attack lands on an enemy (2 variants, fired randomly) | — |
| x `enemy-death.ogg`    | squishy burst-pop | shrapnel |
| x `fighter-death.ogg`  | sad wet deflate | obstacle-hit |
| x `gate-hit.ogg`       | heavy wooden/metal gate slam | obstacle-hit |

## Wave & boss theatre

| File                  | Sound | Placeholder now |
|:----------------------| :--- | :--- |
| x `boss-incoming.ogg` | ominous deep drum + roar sting (~2s) | barricade |
| x `boss-death.ogg`    | massive celebration fanfare (~2s) | celebration-3 |
| x `overrun.ogg`       | defeat sting, descending (~2s) | lose |

## Combo, fever & ultimate

| File                  | Sound | Placeholder now |
|:----------------------| :--- | :--- |
| x `combo-tick.ogg`    | tiny bright tick (pitch auto-climbs with the combo) | coin-pickup |
| x `fever-start.ogg`   | euphoric ignition whoosh + chime (~1.5s) | celebration-1 |
| x `ult-ready.ogg`     | charged power-hum ping | reward-continue |
| x `meteor-impact.ogg` | boomy meteor explosion | explosion-1 |

## Upgrades

| File                | Sound | Placeholder now |
|:--------------------| :--- | :--- |
| x `upgrade-buy.ogg` | anvil/forge confirm clink | level-up |

## Rewards & offers (flying chest, milestone chest, RALLY!)

| File                    | Sound | Placeholder now |
|:------------------------| :--- | :--- |
| `chest-flyby.ogg`       | fluttering wings + faint loot jingle as the flying chest crosses (~1s) | modal-open |
| x `chest-open.ogg`      | latch click + treasure burst chime | level-up |
| x `milestone-chest.ogg` | big chest-drop fanfare, every 10th wave (~1.5s) | celebration-2 |
| x `rally-revive.ogg`    | heroic revive fanfare with war drums (~1.5s) | celebration-1 |
| x `damage-buff.ogg`     | raging power-up ignition (2× damage buff starts, ~1.5s) | dodge |

## Music — `public/audio/music/`

| File                 | Sound |
|:---------------------| :--- |
| x `battle-theme.ogg` | loopable battle track, ~90–120s, mid-energy with percussion (the engine speeds it up ±15% with battle intensity). The default track ("Battle Theme"); the only alternative is "Cozy Harmony" (`bg-cozy.ogg`) in Options. |
| x `bg-cozy.ogg`      | the calm alternative track ("Cozy Harmony"), player-selectable in Options. |

*(Already final, no work needed: `clash-1..5.ogg` melee hits, `explosion-1.ogg` splash/AoE, `coin-pickup.ogg` gold, `modal-open.ogg` UI, `reward-continue.ogg` rewarded flow.)*
