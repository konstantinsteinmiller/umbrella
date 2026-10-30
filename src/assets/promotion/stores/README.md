# Store screenshots

Eight 1920×1080 landscape gameplay screenshots for store and portal submissions. Each one comes as a lossless PNG and a JPG (quality 92). They were captured from the real game (dev server, headless Chrome, 1920×1080 CSS at device scale 1, so the canvas is drawn 1:1). The moments were staged through the runtime state, and the editor and debug UI were hidden. The top HUD bar is the real in-game HUD.

| # | File | Art style | What it shows |
|---|------|-----------|---------------|
| 01 | `store-01-lantern-glide-past-mines.png/.jpg` | Lantern (papercraft festival) | Level 18: Pweeg glides up a wind current with the umbrella open. Spiky fuse mines and bouncy amber Walldorf pillars surround him, a red charging Walldorf waits by the moon, and the festival dais finish is on the right. |
| 02 | `store-02-clay-walldorf-charge.png/.jpg` | Clay (rainy rooftops) | Level 15: a red Walldorf charges at Pweeg as he floats over a wind current. The doorstep finish with the red postbox is on the right. |
| 03 | `store-03-lantern-super-stream.png/.jpg` | Lantern | Level 30: Pweeg rides a golden Super Stream under a ceiling, with a spiky mine in the second stream and the dais finish below. |
| 04 | `store-04-clay-spike-corridor.png/.jpg` | Clay | Level 27: Pweeg glides through a brick corridor lined with spikes on the floor and ceiling, while a spiky mine lurks in the corner. |
| 05 | `store-05-lantern-walldorf-maze.png/.jpg` | Lantern | Level 31: Pweeg floats through a maze of googly-eyed amber Walldorf blocks and spike rows, with the festival dais at the end. |
| 06 | `store-06-clay-mine-gauntlet.png/.jpg` | Clay | Level 24: Pweeg rides the wind into a gauntlet of four spiky mines and a Walldorf pillar, framed by rows of Walldorfs. The doorstep finish is on the right. |
| 07 | `store-07-lantern-chad-intro.png/.jpg` | Lantern | The intro: Chad, Pweeg's cool friend in sunglasses, glides off the cloud over a wind current toward the festival dais. |
| 08 | `store-08-clay-doorstep-finish.png/.jpg` | Clay | Level 24 cleared: Pweeg cheers with his umbrella raised on the doorstep finish next to the postbox, after getting past the mine gauntlet. |

Notes
- There are no tutorial key hints, editor buttons, lil-gui panel or transitions in any shot.
- The sharpness probe (`blur-probe.mjs image`) rates shot 03 SHARP and the others SOFT, and nothing is rated BLURRY overall. The canvas backing store is 1920×1080 at 1920×1080 CSS, so the canvas is not upscaled. The HUD and the sprite edges score sharp. The low tiles are the painted backdrops, including the clay style's deliberately out-of-focus foreground chimneys.
