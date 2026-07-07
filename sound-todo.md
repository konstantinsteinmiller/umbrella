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
