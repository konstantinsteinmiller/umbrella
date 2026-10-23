# Intro — Pre-Game Cutscene (scene script)

Source: *Umbrella mini design doc v0.7.0*, section **F. Pre-Game Cutscene**.
Reference frames: [`docs/design/reference/intro-frame-1.png`](docs/design/reference/intro-frame-1.png),
[`docs/design/reference/intro-frame-2.png`](docs/design/reference/intro-frame-2.png).
Character references: [`pweeg.png`](docs/design/reference/pweeg.png),
[`umbrella.png`](docs/design/reference/umbrella.png).
Roadmap: `#0.7.0-9` – `#0.7.0-11`.

> Before Level 1 begins, the player is shown how to float across the air current.
>
> **Frame 1:** Chad front flips into frame. He's got sunglasses and is cool and
> effortless. He pauses then floats across the channel.
>
> **Frame 2:** Pweeg walks to the edge of the cloud, carefully climbs down, and
> steps into the starting position. He'll stop and look at the player. When he
> does, Level 1 can begin.

## 1. What the reference frames show

### Frame 1 (Chad)
- **Set:** a wide **cloud bank** fills the bottom-left half of the screen, two
  tiers: a smaller **upper cloud** at the far left (its top about 2/3 down the
  screen) in front of a bigger **lower cloud** that runs to the screen's middle.
  To the right of the cloud bank, from the cloud's edge to the right side of the
  screen, an **updraft channel**: wavy/squiggly arrows rising from the bottom
  (not the game's straight arrows — this is the "wind" look the doc draws).
- **Beat 1 (arc "1"):** Chad enters from **off-screen top-left**, a high arc
  (front flip) that lands him on the lower cloud, a little left of its right
  edge. Small figure, **sunglasses** (a dark band across the eyes).
- **Beat 2 (arrow "2"):** from the cloud edge he **floats across the channel**:
  a gently **rising** path to the right over the updraft, umbrella open and
  **tilted forward** (into the direction of travel), legs trailing behind,
  relaxed pose. He leaves the screen on the right (or reaches the far side).
- No finish platform is drawn: the channel is the lesson ("this is how you
  cross a current"), not the level.

### Frame 2 (Pweeg)
- **Same set** as frame 1 (the two-tier cloud and the updraft on the right).
- **Beat 1 (arrow "1"):** Pweeg walks in from the **left** along the **upper
  cloud** to its right edge.
- **Beat 2 ("climbs down"):** at the edge he **carefully climbs down** to the
  lower cloud — drawn hanging off the edge with his hands, i.e. a short
  lower-and-drop, not a jump. Careful, a little clumsy: the opposite of Chad.
- **Beat 3 ("level start"):** he walks right along the lower cloud to the
  **starting position** near the cloud's right edge, right before the current,
  **stops and turns to face the camera** (looks at the player). That pose is
  Level 1's spawn: the cutscene hands over to Level 1 without a cut.

### Reading of the scene
- It is a **demonstration** (Chad shows the move effortlessly) followed by a
  **hand-off** (Pweeg — the player — gets into position). The contrast is the
  joke: cool Chad flips in and glides; Pweeg walks, climbs down carefully, and
  looks at you as if to say "your turn".
- The cutscene's ground **is Level 1's start platform** dressed as cloud, and
  the channel **is Level 1's updraft**. Level 1 begins from the frame the
  cutscene ends on, so the player immediately repeats what Chad did.

## 2. Cast

| Actor | Look | Moves |
| --- | --- | --- |
| **Chad** | Pweeg's body shape (round head, loop arms) + **sunglasses**; same red/white umbrella. Optional: a tiny cool tilt of the head. | front flip (one full forward rotation along an arc), land with no wobble, pause, open umbrella with a flick, float across rising right, exit. |
| **Pweeg** | The player character ([`pweeg.png`](docs/design/reference/pweeg.png)): round head, two dot eyes, arms as two loops joined in front. Umbrella closed (furled) while walking. | walk, hesitate at edge, climb down (hang + drop), walk, stop, turn to camera, blink. |

## 3. Shot script (one fixed camera, Level 1's screen, 1280 × 720 world units)

Timings are a first pass for a ~11 s intro; tune in-engine. `t` = seconds from
the start. Coordinates are world units on Level 1's screen, y down; the cloud
values are placeholders until Level 1's current layout is read (the cloud must
sit on Level 1's start platform, its right edge = the platform's right edge,
the channel = Level 1's first updraft).

| t (s) | Shot / action | Notes |
| ---: | --- | --- |
| 0.0 | Fade in from black (0.4 s) on the set: sky, two-tier cloud, updraft channel already flowing. No HUD. | Wind ambience fades in with the picture. |
| 0.6 | **Chad's flip**: enters top-left off-screen, ballistic arc (apex ~y 120) over 0.9 s, one full forward rotation, lands on the lower cloud ~120 px left of its edge. | `whoosh` on take-off, soft `land` on touch-down. |
| 1.5 | Lands, tiny knee bend (squash 0.08 s), straight up. | No dust; effortless. |
| 1.6 | **Pause** 0.7 s. Looks toward the channel. Optional: pushes sunglasses up a pixel (1 frame gag). | Sells "cool". |
| 2.3 | Walks/steps off the edge; umbrella **opens with a flick** (`open` sfx), tilted forward ~20°. | Same auto-open rule as the game. |
| 2.4 – 5.2 | **Floats across** the channel on a rising path (the updraft lifts him) to the right edge, leaves screen right at ~y 260. | Use the real engine for this leg (Chad = a scripted `World` with input "right" held) so the physics he shows is the physics the player gets. |
| 5.2 | Beat of empty frame (0.4 s): only the current flows. | Lets the player's eye return left. |
| 5.6 | **Pweeg walks in** from the left on the upper cloud, umbrella furled, normal walk speed. | footsteps `step`. |
| 6.8 | Reaches the upper cloud's edge, **stops**, looks down (eyes shift down) 0.4 s. | Hesitation = character. |
| 7.2 | **Climbs down**: turns to face the cloud, lowers himself (hang 0.3 s, hands on the edge), drops the last bit onto the lower cloud. | small `land`. |
| 8.1 | Turns right, **walks** to the starting position (Level 1 spawn). | |
| 9.3 | **Stops, turns to face the camera**, blinks once (eyes close 0.1 s). | The "look at the player". |
| 9.8 | Level 1 HUD fades in (0.3 s), input enabled: **Level 1 has begun** from this exact pose. | No cut, no load: same scene. |

**Skip:** any key / tap / click shows "Skip ▸" for 1.5 s; a second press (or a
tap on it) jumps to t = 9.8 (Pweeg already in position). Escape skips at once.

## 4. Rules for the implementation (later)

- **When:** once, before Level 1, the first time a player starts the campaign
  (persist `umb_intro_seen` in the save blob). Replay from the pause menu
  ("Watch intro") and from the level select's Level 1 tile long-press is
  optional. Never in editor tests, shared/community levels, or on revisit.
- **Where it lives:** a small timeline runner (`src/umbrella/intro.ts`) that
  owns the actors and the clock and draws through the game renderer, so the
  set, the current and the characters are the in-game ones. Actor poses come
  from the same Pweeg/umbrella drawing code as the player (roadmap
  `#0.7.0-1` – `#0.7.0-3`) — build those first.
- **Chad's float** is simulated with the real engine (scripted input), not a
  hand-made curve: if tuning changes, the demo stays true.
- **Clouds:** Level 1's start platform drawn as a cloud for the intro only
  (white puffs, two tiers); the gameplay collision box is unchanged.
- **Wind arrows:** the doc draws wavy rising squiggles; the in-game straight
  arrows are fine for gameplay — the intro may use the same arrows for
  consistency (decide when implementing).
- **Portals:** the cutscene must not delay the first `gameplayStart` /
  loading-finished signals beyond what portals accept; it runs after the game
  is ready, counts as gameplay, and is skippable.
- **Accessibility / text:** no dialogue; if a "Skip" label is shown it goes
  through i18n (`umbrella.intro.skip`) in all locales.
- **Audio:** reuse `open`, `land`, `step`, wind ambience; a 2-note "cool" sting
  for Chad's landing is optional.

## 5. Open questions for the designer

1. Does Chad leave the screen on the right, or land on the far side and wait
   (wave) there?
2. Should the intro use Level 1's real layout (current Level 1 after the
   v0.6.2 rework) or its own fixed set with Level 1 starting right after?
3. Clouds everywhere (all start platforms as clouds) or only in the intro?

## 6. As built (2026-10-23)

- `src/umbrella/intro.ts` runs the timeline; `src/umbrella/chad.ts` draws Chad; the scene
  (`UmbrellaScene.vue`) plays it once (`umb_intro_seen`) on a new player's first start, after
  the boot splash has left, and again from the pause menu ("Watch intro").
- It plays on whatever level is first in the campaign (the designer's order), not a fixed
  set: the start platform is the one under the spawn; Chad lands near its edge.
- Chad's float is simulated with the real engine (right held, finish ignored). If that does
  not get him across the first level, he follows a scripted rising glide instead. If he lands
  on the far side he waits there, cool, until the hand-over.
- Decisions on §5's questions: clouds and the doc's wavy current lines are **intro only**;
  during the last 0.5 s the intro's look cross-fades into the game's (plain platform, arrow
  currents, Chad gone), so Level 1 starts from Pweeg's pose without a jump.
- Skip: any key or tap shows "Skip ▸" for 1.5 s, a second one (or a tap on it) skips; Esc
  skips at once. Sounds: a whoosh for the flip, the landing, a short two-note "cool" sting,
  the umbrella opening, Pweeg's steps.
