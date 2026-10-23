# Roadmap

## Backlog

- [ ] #1 I want to use the GamePush.com game distribution platform that works like Playgama to publish my games on as many web games platforms as possible as fast as possible, for that I need to setup another platform config and integrate the sdk in a similar way as
  Playgama Bridge SDK. Please find out all the necessary steps and configurations to allow publishing to GamePush.com. I have created an account and some of the brave browsers(debugging enabled) tabs are the logged-in user.
  Check <https://docs.gamepush.com/tutorials/publishing-the-game-on-platforms-guide/> and further official docs to find out all steps and pre-requirements needed to publish there.
  At the end, after the full umbrella release worked out, I want to create a claude user level skill (with all the learnings and templates for fast publish) and link it to the new-web-game-playbook, so other games can easily be released on GamePush.com too(no need to notify other claude sessions).

- [ ] #2 Do a full on sound pass to create extremely mind-blowingly good sounds for this game and a harmonic background music.
  The sound effects should fit perfectly to the umbrella and wind theme. Not 8-bit sounds.
  Use an expert sound designer from an AAA game studio as an opus 5.5 high effort subagent.

- [ ] #3 add enemy sounds and delete the old ogg files

- [x] #4 Yesterday I had a playtester say they wished the umbrella would be the point of contact with the wind. Whenever they’d fall on the edge of the screen, they thought they’d catch a draft because the umbrella was in the current. I’m guessing the hit box isn’t tall enough? Add a triggerable platform that can be activated and deactivated by a pressable button trigger (can also have a timed activation option e.g. 5 seconds active). Add button triggers that can change the currents direction and/or strength of the current. Add a feature to allow players to create and share level designs via link string encoded level design so e.g. `https://umbrella.com/?level=dafd13fdf132ddafds123123dafd123` can deterministically recreate the players custom level design and this is a sharable link that opens the custom level and saves the level as a custom level in the custom level library. Players can create custom level using the level editor(without server access and without possiblity to overwrite campaign level, but able to load campaign levels). Improve the  Leveleditor UI, so it looks appealing and is easy to use for a real player, group button by purpose and functionality, create menus at the top of the app that group features and add shortcut keyboard combinations that make the working with the leveleditor easy (all shortcuts must show at the end of a button to make learning the shortcuts easier). The player created levels can be submitted/shared in a communityLevelsModal (reachable from the main game UI, contains the player levelEditor link/button jumpoff, community level editor automatically saved submitted levels as player creations to the server, max 5 level per week, state that somewhere before submission), after winning or loosing a community created level, players can rate levels 0-5 stars. Levels in the communityLevelsModal can be sorted by stars rating (default is best rated show first in the paginated list), by "newest" or by "most played", save all this to the server(platforms that dont allow external links and server connection like Poki and Youtube playables only offer the link shared levels and the community button is not shown and the manual routing is forbidden to the community level editor). Add the possibility to add checkpoint into a level, checkpoint respawn the player at the checkpoint if the checkpoint was touched and the player died. Player can refuse to revive at checkpoint for the perfect run but has to click a "restart" button on the screen for the first 3 seconds after a checkpoint revive.

## v0.7.0 — from the mini design doc (checked 2026-10-23)

Checked against *Umbrella mini design doc v0.7.0* (Google Doc). Reference images saved in
[docs/design/reference/](docs/design/reference/); the doc's level images are obsolete (the designer reworked the levels
in the editor) and are not tracked.

Already in the game: core loop (open/close, float, currents, land on Finish); WASD/arrow
walking on the ground and in the air; Space toggles; auto-open when stepping off a platform;
open = floats, closed = gravity; arrow-marked currents that push to their edge and bob there;
dropping through a current with the umbrella closed (light resistance); Super Stream (slow
build-up, splats into walls/ceilings); braking snap; current turn time; water-like mid-air turn;
ground momentum carry-over; low-friction air drift; terminal velocity; breaking the umbrella by
reopening at terminal velocity; fluttering to reset speed; splat on landing at terminal
velocity; out-of-bounds below the screen with the fading whistle; fall poses (upright /
sideways / upside-down) on the placeholder block; win dance on the Finish; instant reset
(plus checkpoints); Walldorf blocking, charging, harmless mode and fixed paths; Prickbait
(the mine) as a hostile enemy; level editor, server sync, reorder and walk deceleration.

Missing, in the order to tackle them:

- [x] #0.7.0-1 **Pweeg, the player character** — replace the white block with Pweeg as drawn in
  [pweeg.png](docs/design/reference/pweeg.png): a round head with two dot eyes on top of two arms drawn as
  loops that meet in front (no torso), ink outline style. Keep the hitbox size from Tuning;
  facing shows through the eyes. Standing, walking (loops swing), win dance and splat poses.
  Draw in the canvas renderer (vector, DPR-sharp), not a bitmap, so the fall poses can bend.
- [x] #0.7.0-2 **Pweeg's fall states** — [pweeg-fall-states.png](docs/design/reference/pweeg-fall-states.png):
  *safe fall, slow* = upright with both arms raised and bent outward; *getting faster* = tipped
  sideways, arms trailing up behind; *terminal velocity ("say bye-bye")* = upside-down, legs
  (two long loops) up, big goggle eyes. Same thresholds as now (`fallPoseSideways`,
  `breakFraction`), eased between poses.
- [x] #0.7.0-3 **The umbrella** — [umbrella.png](docs/design/reference/umbrella.png): scalloped canopy with
  ribs, **white** panels and one **red** (hatched) panel, a ball finial on top, a curved
  J-handle. Open (tilted in the direction of travel when drifting), furled (slim, red/white
  wrap) and broken (inside-out) states. The wind hitbox already matches the drawn canopy
  (60 × 40 px) — keep `umbrellaBox` in sync with the art.
- [x] #0.7.0-4 **Walldorf look** — [walldorf.png](docs/design/reference/walldorf.png): a tall rounded
  pillar with two stacked eyes on its facing side (side profile). When it **can charge** it
  **looks angry** (slanted brows over the eyes, as in the right-hand drawing); a calm one has
  plain eyes. Charging Walldorfs face their charge direction.
- [x] #0.7.0-5 **Walldorf is a bouncy bumper** — the doc makes Walldorfs *non-hostile* and
  *bouncy like a pinball bumper*: touching one knocks Pweeg backwards (impulse away from its
  surface) instead of killing; a **charge** hits much harder (can knock Pweeg out of bounds or
  into hazards). Today a Walldorf either kills on touch or is a solid "harmless" block.
  Needs the designer's call before changing existing levels: keep "hostile" as an option for
  current levels, or convert all? Add tuning knobs (bounce speed, charge bounce speed).
- [x] #0.7.0-6 **Walldorf "bump" sound** — a rubbery bump on every touch / bounce
  (and a bigger one for a charge hit), through the existing sound kit and mute path.
- [x] #0.7.0-7 **Walldorf follows the player** — a new motion kind *follow*: the Walldorf
  slowly tracks Pweeg (speed setting, optional axis lock, optional leash area) — the doc's
  Level 25 Walldorf. In the editor as a motion option with its speed.
- [x] #0.7.0-8 **Prickbait look (the mine)** — [prickbait.png](docs/design/reference/prickbait.png): a round
  body with 5–6 cone spikes around it, angry slanted brows and two eyes looking at Pweeg; rename
  "Mine" to "Prickbait" in the editor (all locales) while the level data keeps `kind: 'mine'`.
- [x] #0.7.0-9 **Chad** — the intro's cool character (`src/umbrella/chad.ts`: flip arc, landing, idle, float): Pweeg's shape plus sunglasses, front-flip
  and float animations, same umbrella. See [intro.md](intro.md) §2.
- [x] #0.7.0-10 **Intro cutscene runner** — [intro.md](intro.md): a timeline that plays on Level 1's set
  (start platform drawn as a two-tier cloud, Level 1's updraft), Chad's flip + float (simulated
  with the real engine), Pweeg's walk / climb-down / look at the player, then Level 1 begins
  from that pose. Skippable (press twice / Esc), shown once (`umb_intro_seen`), replay from the
  pause menu. Depends on #0.7.0-1, -3, -9.
- [x] #0.7.0-11 **Intro polish** — clouds for start platforms (decide: intro only or every
  level), the doc's wavy wind squiggles (decide: intro only or everywhere), a short "cool"
  sting on Chad's landing, the Skip label in all locales. allow to replay the intro from the pause menu.
- [x] #0.7.0-12 **Out of bounds after falling too long** — the doc: "falling for too long in
  the play field" also counts as out of bounds (whistle + reset), not only leaving the screen.
  Add a max free-fall time (tuning knob, off by default for open-umbrella floats).
