Umbrella — changelog (newest first)

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
