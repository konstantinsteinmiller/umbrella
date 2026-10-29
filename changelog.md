Umbrella — changelog (newest first)

== Kite build (/umbrella/kite/) — unreleased ==
- [x] 100 kite levels (roadmap #7), designed after the Super Mario Bros. philosophy written up in mario-platformer-philosophy.md: ten worlds of ten (First Breeze, Free Fall, Crosswinds, Thorns, Walldorf, Prickbait, Ventilators & Super Streams, Switches, Hunters, The Storm), each one idea told as introduce → develop → twist → conclude, with tall and wide scrolling worlds and checkpoint flags in the long ones
- [x] The kite build plays only these levels: no levels server (no pull, push or sync, cutscenes included), no community levels, the repo's campaign overrides and order are not used; its save (progress, local level edits, tuning) is kept apart from the normal game's; players can still edit the kite levels in the level editor, in their browser
- [x] Every kite level is proven beatable: a bot plays the real engine (scripts/kite-solve.mjs) and the test suite replays its recorded wins; it also checks safe spawns and a rising difficulty curve across the worlds

- [x] Painted kite art (roadmap #6, kite build only): Pweeg and Chad are kites in a cream-paper crayon style (20 spritesheets: idle, walk, float, fall, terminal, broken, cheer, flattened, destroyed, front; platforms, finish, switch platform, ventilator, checkpoint); no umbrella is drawn over a kite. Enemies, props and wind wisps stay vector until painted; the normal /umbrella build contains no painted art
- [x] Kite animation polish: the walk uses every other painted frame at half cadence, the dance is a steady arms-up bounce with a rock, fast flutters capped at 10–12 fps, the checkpoint flag ping-pongs and dissolves between frames; the goal platform has no label any more and gets flag kites, bunting, a gold landing ring and bobbing chevrons
- [x] Kite art update: enemy art painted (Prickbait, Walldorf body and face, wind wisps); the dance sheet repainted (it had a pink ground that flickered), kite Pweeg no longer wears sunglasses (Chad's trademark); the Art Desk accepts Gemini's "Automatic" model when the Create image tool is on

- [x] Sounds reverted to their Revision 7 state (sound kit, music, mix and engine); the Revision 9 sound pass is gone, the Walldorf and Prickbait sounds stay. The intro's whoosh/cool, the button and the checkpoint borrow the closest Revision 7 sounds

== Revision 12 — 2026-10-29 ==
- [x] Timed levels: a time limit per level in the level editor (seconds; 0 = none). The clock runs from the spawn and keeps running through a checkpoint revive; when it runs out the level starts over from the spawn (checkpoints don't count). A clock pill sits under the collectible badge (where the badge is, when a level has none), with a sweeping hand and a draining bar; in the last fifth (3–10 s) it turns red, pulses and ticks each second
- [x] Star rating for timed levels by the whole seconds left on the clock: 2 or more earn ★★★, 1 ★★, less than 1 ★ (the clock reads seconds:hundredths, e.g. 12:34, the whole seconds first, so it shows exactly what the rating counts) — popped over Pweeg's head as he lands on the finish (stars bouncing in one by one with a chime each, sparkle bursts, the time left), and the best rating shows on the level's tile in the level selector (labels in all 21 locales)
- [x] Desktop no longer shows the touch joystick and umbrella button: they were drawn whenever the keyboard hint list was hidden (from level 4 on, in tests and player levels). They now show only on phones and tablets (judged by the device, iPadOS included) or after a touch, and a mouse click or key press hides them
- [x] "Paper Moon", the lantern-festival papercraft look picked from the moodboards: ?art=lantern (before or after the #, on /umbrella/ and on every revision from 12 on) opens the normal game — campaign, server levels, save — in its own build (/umbrella/lantern/, /umbrella/<N>/lantern/); no other build carries a byte of it
- [x] Lantern art painted so far: the festival-night sky behind every level (veiled outside the level, dimmed inside it), honey-wood ledges, a glowing paper-lantern finish pad (it keeps its "Finish" label) and the red-and-cream wagasa parasol. Pweeg's boxy origami sheets are being painted — he stays drawn until all of them are in — and Chad, the enemies, the wind, props, collectibles and the warp gate follow; anything not painted yet keeps its drawing
- [x] Lantern sky in parallax layers, cut from the painted night sky (scripts/art/lantern-parallax.py): the far plate (sky, moon, string lights, mountains) drifts slowest, three paper clouds drift across a middle plane, thirty sky lanterns rise, sway and fade at their own depths, and the town silhouette with two small clouds on its plane slides fastest along the bottom
- [x] Lantern wind: the painted paper ribbons are bent along moving curves — each lane meanders like gusting air and swells and eases in speed — and stay inside their current: sized to the lane, faded in and out at its ends, never cut off at an edge
- [x] A dev server shows the lantern art with ?art=lantern (no lantern build needed); every build still carries only its own art
- [x] Readability kept in the lantern art: red only on what kills, amber on what bounces, grey on what is solid; ledges and the finish hold no red
- [x] Chapters: the campaign is split into chapters — Chapter 1 holds every current level until the designer makes more. The editor's Reorder dialog has a chapter row above each run of levels: rename it, give it a subtitle, move the whole chapter up or down, delete it (its levels join the chapter before it), add a new one, and pick the chapter a new player starts with; a level dragged past a chapter row moves into that chapter. The level selector groups the levels under their chapters. Everything is saved on the levels server with the campaign order (older clients still read the flat order)
- [x] The Game Jam chapter: campaign levels (by reference) and saved levels (as snapshots) put together in the Reorder dialog; ONLY the itch.io build plays it, as the whole game. "▶ Test Jam chapter" in the editor plays it on any build, with its own progress
- [x] Chapter card: on the first level of a chapter, "Chapter N" (and the chapter's subtitle) with a new synthesised chapter sound — a gust, a low temple bell and a slow pentatonic phrase — for 3 s while the level waits. The start chapter's card plays only right after the intro; the jam chapter's card says Chapter 1
- [x] Typing "cmunc" in the game requests an interstitial right away (a tester's shortcut on every build; the next death ad still keeps its 121 s)
- [x] Portal ads (Poki and the other ad portals): an interstitial when you die in a level — never in the first 240 s of gameplay, at least 121 s after the last ad, and played BEFORE the respawn (the level stays frozen on the death until it closes); 20 clicks or taps in a row on the "Level N" label request a rewarded ad (kept in every build, as a tester's shortcut)
- [x] Ads and the menus (pause, level list, community, star rating) silence the music and every sound and bring them back when they close; the menus also stop the portal's gameplay, and the click-to-play screen and the intro cutscene are not gameplay (no gameplayStart before the first level is playing)
- [x] Proof: a Poki smoke test on the built bundle (`node tools/qa/poki-smoke.mjs`) — no gameplayStart before the first click, one after it (after the intro for a new player), stop/start around the pause menu and the rewarded ad, every AudioContext suspended under the ad; the audio mute check covers the pause menu

== Revision 11 — 2026-10-28 ==
- [x] /umbrella/art-moodboards/: a rating page for ten art-direction concepts for the jam version (the kite art plus nine painted alternatives, each with a gameplay theme, a game-name idea and six storyboard panels: in-game scene, key art, hero states, enemies, world kit, secret warp), with star ratings per criterion, a side-by-side compare wall and Claude's reference ranking; ratings stay in the viewer's browser
- [x] Desktop browsers with a touch screen (Firefox on a Windows touch laptop) no longer show the mobile joystick and umbrella button: the touch controls start only where the primary pointer is a finger, and then follow the last input (a touch shows them, a mouse click hides them)
- [x] The controls are a vertical key list in the bottom right corner, shown on the first three levels only (keyboard devices); Enter opens and closes the umbrella as well as Space (labels in all 21 locales)
- [x] The start screen's Play button is replaced by a pulsing "Click to play" (mouse) / "Tap to play" (phones and tablets) label like the arena's "tap to start"; the whole screen reacts to the click or tap (and Enter / Space), which still unlocks the browser's sound before the intro (labels in all 21 locales)
- [x] ?art=kite also works after the # (/umbrella/#/?art=kite, /umbrella/11/#/?art=kite): the redirect to the kite build reads the flag from either place
- [x] ?art=kite is the same game as the normal one: an umbrella opened on a platform deploys the kite where it stands, and the community list and submissions work there too (the kite levels themselves stay local, they are not the server's campaign)
- [x] `?art=kite` opens the painted kite-art version with its 100 levels on /umbrella/ and on every revision from 11 on (/umbrella/<N>/?art=kite → /umbrella/<N>/kite/, built per revision); the separate /umbrella/kite/ link keeps working
- [x] Kite art: the deployed (open) kite is drawn at the umbrella's size instead of twice as large; the angry (charging) Walldorf is a warm red-brown so it no longer matches the calm bouncy pusher of levels 48 and 49; Prickbait no longer flickers between left- and right-looking frames when it turns round
- [x] Walking across a small gap no longer flashes the umbrella open and shut (level 71): the automatic open is shown and heard only after 0.12 s in the air; the physics is unchanged
- [x] Level editor: "Screens wide" and "Screens tall" inputs for any number of screens (1–50) in a multi-screen level; the world grows by whole screens and scrolls (labels in all 21 locales)
- [x] Community overwrite: the Submit button stays usable when this week's submissions are used up (an overwrite costs none), with a hint saying so; overwriting also folds older duplicates of the same level into the best-rated copy (levels-bucket worker)
- [x] Gates also work in the level editor's Test: the warp plays, the challenge opens as the level under test, and winning it returns to the gate
- [x] Community submission can overwrite your own level of the same name and author: a styled confirmation card (instead of the browser's confirm) asks first; the overwrite keeps plays and ratings and costs no weekly submission, and a name and author that belong to another player are refused (levels-bucket worker; labels in all 21 locales)
- [x] Gates (green warp pipes, editor tool G): open the umbrella inside one and a hyper current carries Pweeg up through a cutscene (light column, rising streaks and rings, whiteout) to a challenge level; winning it carries him back out at the gate. A level that a gate leads to is a challenge: the campaign skips it and the level selector unlocks it once reached (campaign only; tests and player levels ignore gates)
- [x] Collectibles (editor tool T): stars, golden umbrellas or golden clouds, chosen per item in its properties; they bob and glint, a collected one leaves an outline, the best count per level is kept and shown on its tile in the level selector, and a gold badge in the top right counts them during play (labels in all 21 locales)

== Revision 10 — 2026-10-26 ==
- [x] Mine fields are quieter (level 26): Prickbait alerts share one voice (only the closest mine, at most one per 0.7 s) and the fuse ticking thins out when several mines are in range instead of staying at full volume
- [x] "Start with the umbrella open" toggle on the player start in the level editor (labels in all 21 locales)
- [x] An umbrella opened while standing on a platform catches currents: a current behind or above a platform lifts the player off it
- [x] Reorder dialog: deleting a saved level that sits in the campaign also removes it from Saved levels (it came back before); the Saved levels list has its own 🗑 button with the usual confirm
- [x] Level delete in the Reorder dialog: a 🗑 button on every campaign row asks "Delete … from the campaign?" first; deleting an authored level is remembered (it stays out until Reset to original) and only takes effect on Save order
- [x] A triggered Walldorf (Thwomp) now watches a rectangle in front of it, as in the design doc v0.10.0: Zone length and Zone width sliders in the level editor, the zone drawn on the canvas, a "Make the zone a rectangle" button for older circular triggers (labels in all 21 locales)

== Revision 9 — 2026-10-23 ==
- [x] Ventilator prop (editor tool, shortcut W; labels in all 21 locales): whirring blades; landing in one shreds the player
- [x] The intro stops on Pweeg looking at the player until the first key, tap or stick move, then Level 1 begins (cutscene editor: "Wait for the player at")
- [x] A Walldorf placed in the editor is a bouncy bumper from the start (existing levels unchanged)
- [x] A landing only splats at terminal velocity (was 80 % of it); the umbrella still breaks when reopened at 95 %
- [x] Shift+← / Shift+→ in the level editor open the previous / next campaign level (Level menu shows them)
- [x] Level editor: a level dropdown in the top bar (campaign levels, saved levels) and a Reorder button for the designer again
- [x] Test mode: ‹ › buttons and a horizontal swipe step through the draft, the campaign and the saved levels without leaving the test
- [x] Walldorf lunge no longer kills a solid-Walldorf rush (the wall's own speed no longer counts as a slam) and a fast-moving wall can no longer pass through Pweeg standing behind it
- [x] Cutscenes are data: the intro is a script (actors with timed segments, clouds, sound cues, fades) played by one cutscene player; edited scripts are kept in the browser and on the levels server (new `cutscenes` section in the bucket worker — redeploy the worker)
- [x] Cutscene mode in the level editor (designer): pick "Intro" in the dropdown to scrub, play and edit the script, drag actors into place on the canvas, edit cues and fades, save/revert
- [x] Enemy sounds (roadmap #3): an angry Walldorf growls and snorts when Pweeg comes near and simmers while he stays close; its charge creaks and sucks in air as a warning before the whoosh and the thud at full reach; a bouncy one boings, a charging one slams (thump, low boing, rattling ribs); a following one rumbles softly while it slides; Prickbait ticks like a proximity fuse (faster the closer), its spikes whistle in the wind, a cold glint warns on approach and a needle sting plays on touch. All synthesised, behind the same mute/pause gate; the old .ogg files were already gone

== Revision 8 — 2026-10-23 ==
- [x] Pweeg, the player character, drawn as in the design doc (round head, loop arms); walk, float, free-fall (arms up / sideways / upside-down with goggle eyes), win dance, splat
- [x] The umbrella as designed: white with one red panel, scalloped rim, ball tip, J-handle; leans into the drift; furled and broken looks
- [x] Walldorf with stacked eyes and angry brows when it can charge; its body colour shows what touching it does: red = deadly, grey-blue = solid, amber = bouncy
- [x] Walldorf touch modes in the level editor: deadly / solid block / bouncy bumper (knocks Pweeg back, harder while charging; own bounce strength)
- [x] Prickbait (the mine) as designed: spiky round body, angry brows, eyes that follow Pweeg
- [x] Pweeg's legs as in the sketches: solid rounded legs — short with the feet turned out when standing (stepping when walking), bent out with the feet up in a free fall, long and up at terminal velocity; hands: one holds the furled umbrella, the other swings when walking, both raised in a free fall
- [x] Falling too long counts as out of bounds (design doc): a free fall with the umbrella closed or broken longer than 6 s whistles and resets; floating never counts (feel tuner: maxFallTime, 0 = off)
- [x] Intro cutscene before Level 1 (design doc, intro.md): cool Chad front-flips in, lands with a sting and floats across the current (real physics); Pweeg walks in on the clouds, climbs down, turns to the player, and Level 1 starts from that pose. Plays once for new players, Skip with a second key/tap or Esc, "Watch intro" in the pause menu. Clouds and wavy currents in the intro only, cross-faded into the game's look; Chad walks his last steps before stepping off; checked on portrait and landscape phones (double-tap skips)
- [x] Walldorf bump sound: a rubbery boing on a soft thud, deeper and heavier when a charging Walldorf throws Pweeg
- [x] Walldorfs can follow the player (editor: speed; freely, left/right only, up/down only, or along a path where they slide to block his way)
- [x] Chad, the intro's cool character: sunglasses, front-flip arc, no-wobble landing, cool idle, float under a forward-tilted umbrella (ready for the intro cutscene)
- [x] Community levels: a preview image of every level (drawn by the game from the level itself), grid layout by default with the preview above the name, or a list with it on the left; the choice is remembered

== Revision 7 — 2026-10-23 ==
- [x] Pause menu in the game (⏸ button or Esc): Resume, Restart level, Settings → General → Language
- [x] Language dropdown in the level editor's top bar; every language listed by its own name, the choice is remembered
- [x] Wind catches the open umbrella: a separate umbrella hitbox (the drawn canopy, 60 × 40 px above the head) used for air currents only; platforms and hazards still hit the body (playtester: "the umbrella was in the current")
- [x] Reorder dialog: rename campaign levels (✎ or double-click) by mechanic or theme; the name shows in Open and as the editor name, and syncs with the order
- [x] Checkpoints: touch the flag, die, respawn there; a "Restart from the beginning" button stays up for 3 s after a checkpoint revive
- [x] Floor buttons on 6 coloured channels: toggle (on/off) or timed (e.g. 5 s); platforms solid while a channel is on (or while off)
- [x] Buttons that change a current's direction and/or strength (speed 0 stops it)
- [x] Share links: ?level=<code> rebuilds the level exactly and saves it to the player's levels
- [x] Level editor for players: local saving, open campaign levels as a copy; campaign overwrite / reorder / bucket sync only for the designer ("cmonc")
- [x] Editor redesign: File / Edit / View / Level / Help menus, grouped tool palette, every shortcut shown on its button, shortcut sheet (?)
- [x] Community levels (live server): best rated / newest / most played, paginated; submit max 5 per week (rule shown before submitting); 0–5 stars after a win or a fall; play counts
- [x] Poki / YouTube Playables builds: no community button, editor route closed; share links still open levels
- [x] Level selection: "My levels" lists the player's own levels (share links, editor) under the campaign
- [x] Players no longer receive the designer's saved levels from the levels bucket (campaign edits only)
- [x] Editor menus draw above the toolbar
- [x] All new player text in all 21 languages

== Revision 6 — 2026-10-22 ==
- Editor: Reorder dialog — drag campaign levels into a new order, drag saved custom levels into the campaign
- Designer tuning of 22 Oct is the new default (float speed, Super Stream resistance, wall splat, air turning/drag; level 3, 7, 8 currents)
- New feel slider: walk speed deceleration
