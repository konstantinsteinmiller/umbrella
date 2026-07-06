# Sound TODO — drop-in audio assets

**How it works:** drop an `.ogg` with the exact filename into `public/audio/sfx/` (music into `public/audio/music/`) → it is auto-detected and played on the next page load (no code change). Until the file exists — or if it fails to decode — the listed **placeholder** (an SFX that already ships) plays instead, so every event always has sound.

**Specs:** `.ogg` (Vorbis), mono ok, 44.1 kHz, short one-shots trimmed tight (< 1s unless noted). Keep peaks ≈ −3 dB; the engine mixes very quietly and pitch-shifts per tier, so deliver at neutral pitch.

## Merge grid — `public/audio/sfx/`

| File | Sound | Placeholder now |
| :--- | :--- | :--- |
| `unit-spawn.ogg` | wet "materialize" pop when a recruit appears | coin-pickup |
| `spawn-tick.ogg` | tiny mechanical ratchet tick (spawn-button tap meter; pitch auto-climbs) | anchor-swap |
| `instant-spawn.ogg` | golden power-up ignition (rewarded 1-tap-spawn buff starts, ~1.5s) | celebration-1 |
| `merge-pop.ogg` | rubbery thud-pop, satisfying (pitch climbs with tier automatically) | level-up |
| `unit-move.ogg` | soft slide/tick for moving a unit to an empty slot | anchor-swap |
| `grid-full.ogg` | dull denied thunk | obstacle-hit |

## Battle — deploy & combat

| File | Sound | Placeholder now |
| :--- | :--- | :--- |
| `deploy-land.ogg` | heavy landing stomp + small shockwave whoosh | stone-cut |
| `field-merge.ogg` | big power-up chord (in-arena merge, full heal) | level-up |
| `army-full.ogg` | denied bounce (drop rejected, field full) | obstacle-hit |
| `unit-shot.ogg` | short ranged pew/puff | dodge |
| `chain-zap.ogg` | crackling electric arc | crystal-cut |
| `frost-nova.ogg` | icy shatter-burst | crystal-cut |
| `black-hole.ogg` | deep gravity implosion suck (~1.2s) | gravity |
| `enemy-death.ogg` | squishy burst-pop | shrapnel |
| `fighter-death.ogg` | sad wet deflate | obstacle-hit |
| `gate-hit.ogg` | heavy wooden/metal gate slam | obstacle-hit |

## Wave & boss theatre

| File | Sound | Placeholder now |
| :--- | :--- | :--- |
| `wave-start.ogg` | short war-horn blast | modal-open |
| `wave-cleared.ogg` | victory chime fanfare (~1.5s) | win |
| `boss-incoming.ogg` | ominous deep drum + roar sting (~2s) | barricade |
| `boss-death.ogg` | massive celebration fanfare (~2s) | celebration-3 |
| `enrage-roar.ogg` | furious monster roar | chainsaw-break |
| `overrun.ogg` | defeat sting, descending (~2s) | lose |

## Combo, fever & ultimate

| File | Sound | Placeholder now |
| :--- | :--- | :--- |
| `combo-tick.ogg` | tiny bright tick (pitch auto-climbs with the combo) | coin-pickup |
| `fever-start.ogg` | euphoric ignition whoosh + chime (~1.5s) | celebration-1 |
| `ult-ready.ogg` | charged power-hum ping | reward-continue |
| `ult-cast.ogg` | rising cast rumble | gravity |
| `meteor-impact.ogg` | boomy meteor explosion | explosion-1 |

## Upgrades

| File | Sound | Placeholder now |
| :--- | :--- | :--- |
| `upgrade-buy.ogg` | anvil/forge confirm clink | level-up |

## Rewards & offers (flying chest, milestone chest, RALLY!)

| File | Sound | Placeholder now |
| :--- | :--- | :--- |
| `chest-flyby.ogg` | fluttering wings + faint loot jingle as the flying chest crosses (~1s) | modal-open |
| `chest-open.ogg` | latch click + treasure burst chime | celebration-2 |
| `milestone-chest.ogg` | big chest-drop fanfare, every 10th wave (~1.5s) | celebration-2 |
| `rally-revive.ogg` | heroic revive fanfare with war drums (~1.5s) | celebration-1 |
| `damage-buff.ogg` | raging power-up ignition (2× damage buff starts, ~1.5s) | celebration-1 |

## Music — `public/audio/music/`

| File | Sound |
| :--- | :--- |
| `battle-theme.ogg` | loopable battle track, ~90–120s, mid-energy with percussion (the engine speeds it up ±15% with battle intensity). Becomes the default track when present; a player's explicit "Cozy Harmony" pick in Options is respected. |

*(Already final, no work needed: `clash-1..5.ogg` melee hits, `explosion-1.ogg` splash/AoE, `coin-pickup.ogg` gold, `modal-open.ogg` UI, `reward-continue.ogg` rewarded flow.)*
