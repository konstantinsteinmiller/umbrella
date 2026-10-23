# Roadmap

## Backlog

- [ ] #1 I want to use the GamePush.com game distribution platform that works like Playgama to publish my games on as many web games platforms as possible as fast as possible, for that I need to setup another platform config and integrate the sdk in a similar way as
  Playgama Bridge SDK. Please find out all the necessary steps and configurations to allow publishing to GamePush.com. I have created an account and some of the brave browsers(debugging enabled) tabs are the logged-in user.
  Check <https://docs.gamepush.com/tutorials/publishing-the-game-on-platforms-guide/> and further official docs to find out all steps and pre-requirements needed to publish there.
  At the end, after the full umbrella release worked out, I want to create a claude user level skill (with all the learnings and templates for fast publish) and link it to the new-web-game-playbook, so other games can easily be released on GamePush.com too(no need to notify other claude sessions).

- [ ] #2 Do a full on sound pass to create extremely mind-blowingly good sounds for this game and a harmonic background music.
  The sound effects should fit perfectly to the umbrella and wind theme. Not 8-bit sounds.
  Use an expert sound designer from an AAA game studio as an opus 5.5 high effort subagent.

- [x] #3 add enemy sounds and delete the old ogg files

- [x] #4 Yesterday I had a playtester say they wished the umbrella would be the point of contact with the wind. Whenever they’d fall on the edge of the screen, they thought they’d catch a draft because the umbrella was in the current. I’m guessing the hit box isn’t tall enough? Add a triggerable platform that can be activated and deactivated by a pressable button trigger (can also have a timed activation option e.g. 5 seconds active). Add button triggers that can change the currents direction and/or strength of the current. Add a feature to allow players to create and share level designs via link string encoded level design so e.g. `https://umbrella.com/?level=dafd13fdf132ddafds123123dafd123` can deterministically recreate the players custom level design and this is a sharable link that opens the custom level and saves the level as a custom level in the custom level library. Players can create custom level using the level editor(without server access and without possiblity to overwrite campaign level, but able to load campaign levels). Improve the  Leveleditor UI, so it looks appealing and is easy to use for a real player, group button by purpose and functionality, create menus at the top of the app that group features and add shortcut keyboard combinations that make the working with the leveleditor easy (all shortcuts must show at the end of a button to make learning the shortcuts easier). The player created levels can be submitted/shared in a communityLevelsModal (reachable from the main game UI, contains the player levelEditor link/button jumpoff, community level editor automatically saved submitted levels as player creations to the server, max 5 level per week, state that somewhere before submission), after winning or loosing a community created level, players can rate levels 0-5 stars. Levels in the communityLevelsModal can be sorted by stars rating (default is best rated show first in the paginated list), by "newest" or by "most played", save all this to the server(platforms that dont allow external links and server connection like Poki and Youtube playables only offer the link shared levels and the community button is not shown and the manual routing is forbidden to the community level editor). Add the possibility to add checkpoint into a level, checkpoint respawn the player at the checkpoint if the checkpoint was touched and the player died. Player can refuse to revive at checkpoint for the perfect run but has to click a "restart" button on the screen for the first 3 seconds after a checkpoint revive.

- [x] #5 add ventilators as props, if player lands in them, he gets shreded. Add to level editor with a shortcut.
- [ ] #6 create art for the characters, the platform, checkpoint, ventilators(if it fits the theme and art style, otherwise im open for another reason that emits a wind current) the wind elements(no sharp borders like now we see the edges of a wind field), the enemies idle/lunge/move animations, chad and pweegs walk/idle/hover/fall-down/flattened/destroyed/etc. animations as spreadsheets of e.g. 16 256x256 frames using the art pipeline.
  The art style is cute, cozy, hand-drawn, stylized, cel-shaded.
  This art build is deployed separately and only turned on for the /umbrella/kite/ route and not for the normal revisions and /umbrella/ route of this github pages deployment. Its very important that the art style is kept very consistent, especially for the characters and enemies that have to have the same proportions and look across all animations. Use your own gemini profile to not interfere with the tree-smashers paints.
- [ ] #7 Create 100 every more interesting level designs that are following the same design philosophy like Super Mario Brothers, which introduce one challenge and make it more complex or harder with level progression or in the next level and then introduce other enemies and teach how to beat them and then create more challenging situations to train the new skills, do a web-research on how their platformer design philosophy works and write it down into mario-platformer-philosophy.md, which will be used to design interesting, exciting and ever challenging levels that players want to play. This extra levels are not stored on the server and dont distribute to the normal gameplay but only deployed separately and only turned on for the /umbrella/kite/ route. Those 100 kite level are really treated seperate from the normal levels coming from the server, but the player can still edit them locally in the level editor(remote edits are not possible on /umbrella/kite/ route).

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

- [x] #0.7.0
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

## v0.9.0 — from the mini design doc (checked 2026-10-23)

Checked against *Umbrella mini design doc v0.9.0* (Google Doc). Level images are ignored: the level
designer builds the levels in the level editor (v0.9.0 revised Levels 1–20 and added three new
designs). Everything else in the doc — core loop, controls, umbrella states, floating, mid-air feel
(turn 0.75 s, braking snap 0.1 s, wind turn 0.5 s are inside the doc's ranges), terminal velocity and
the break, fall states, win dance, out-of-bounds whistle, checkpoints, the air-current-only umbrella
hitbox, pause, language dropdown, Reorder renaming, community editor — already matches the game.
Differences left, in the order to tackle them:

- [x] #0.9.0-1 **Cutscene waits for the player** — doc §F, frame 2: Pweeg "will stop and look at the
  player *until they take control*; Level 1 can begin." Today the intro fades into Level 1 by itself
  0.5 s after he turns to the camera. Hold the final pose (looking at the player) until a key / tap /
  stick move, then hand over to Level 1 (keep Skip as is). Now that the intro is cutscene data, the
  hold is a segment with no end plus a "wait for input" flag on the cutscene.
  *Done:* the cutscene's `waitAt` stops its clock on the final pose until the first key / tap / stick move.
- [x] #0.9.0-2 **Walldorf is non-hostile and bouncy by default** — doc §E keywords: *Non-Hostile,
  Bouncy*. The engine default for a Walldorf with no setting is still *deadly* (`contactOf`), and a new
  Walldorf placed in the editor starts that way. Make a newly placed Walldorf bouncy; for the existing
  levels the designer decides whether unset ones convert (they are edited in the editor anyway).
- [x] #0.9.0-3 **Follow is tied to a fixed path** — doc §E: following is "toggled on if the Walldorf
  is set to a fixed path", slow, and it tries to obstruct the player's route. The editor offers follow
  as a free-standing motion (freely / left-right / up-down / along a path). Decide with the designer:
  keep the extra modes, or limit follow to a Walldorf that has a fixed path (the path becomes its
  patrol and follow only slides it along that path).
  **Decided: keep the extra modes** — Level 25 and the designer's levels use free following, and the
  doc's path-bound version is already one of the modes ("along a path"); nothing changed.
- [x] #0.9.0-4 **Splat threshold: terminal velocity vs 80 %** — doc §D: *Terminal Impact* = landing at
  terminal velocity. Today a landing at 80 % of terminal (`splatFraction` 0.8) already splats while the
  umbrella only breaks at 95 %. Designer's call: raise `splatFraction` to 1 (doc) or keep 0.8 as the
  tuned feel and update the doc.