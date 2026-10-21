# Umbrella (mini design doc)
**Genre**: Arcade
**Platform**: Desktop
**Perspective**: 2D, fixed screen
**Gameplay Length**: 10s-30s per level


## A. Core Gameplay Loop
Open/Close Umbrella
Float/Pass through Jet Streams
Land on the “Finish” platform to win
## B. Movement & Controls
Walk: Use WASD or Arrow Keys to move left or right on the ground and in the air
Open/Close Umbrella: Space Bar
The Umbrella automatically opens up when the player steps off a platform.
In Mid-Air: The player may close and reopen the Umbrella themselves.
C. Core Mechanics: Umbrella and Physics
Quick Guide: Float Speed, Mid-Air Turn, Wind Currents, Fall Speed and Terminal Velocity
1. Umbrella State
   States: Open (float/catch air) and Closed (free fall).
   Default Behavior: Opening the umbrella heavily slows downward acceleration and allows floating. Closing the umbrella immediately initiates standard gravity/falling.
2. Wind Currents
   There are two types of wind currents: directional wind currents and no wind currents.
   Visual Indicator: Marked by directional arrows (up, down, left or right)
   Open Umbrella Interaction: When inside a wind current with an open umbrella, the player is pushed in the direction of the air stream until reaching the current's boundary. If the boundary is reached, the player will gently bob up and down at the top edge.
   Closed Umbrella Interaction: Closing the umbrella while inside a stream allows the player to drop through it freely.


## Floating
The Feel: If falling, opening the umbrella will catch your fall and slow your descent.
Design Parameters:
Float Speed: Capped at a gentle descending speed.
Braking Snap: Opening the umbrella mid-fall clamps down to float speed within 0.1 to 0.2 seconds (I think?) for a snappy, responsive catch.
Air Current Interaction: Pushes the character in the direction of the wind, changing their vertical/horizontal direction in about 0.5 - 0.7 seconds (?).
Mid-Air Feel (Left & Right Movement)
The Feel: Think of turning around in water physics!
Design Parameters:
Acceleration Delay: Should take anywhere between 0.5 - 0.8 secs (?) to turn the other way and reach top horizontal speed in the air.
Momentum Carryover: Ground speed momentum carries over to air speed.
Low Friction Air: Low air resistance should drift the character slightly forward when you let go of the movement keys before coming to a stop.
3. Fall Speed & Break Mechanic
   Terminal Velocity: Falling continuously without opening the umbrella builds up the player’s downward speed, eventually reaching a max speed called: Terminal Velocity.
   Fall Speed should be determined in a range between a minimum of 0 spd for safe speed and a maximum of “x” spd for terminal velocity.
   Umbrella Break Condition: Reopening the umbrella at terminal velocity causes the umbrella to break.
   Mitigation: Players must periodically flutter (open/close) the umbrella during long falls to reset their speed and keep velocity in a safe range.
   Failure States:
   Ground Impact: If the player reaches terminal velocity and hits a platform, the character will slam into the ground with a cartoony "splat".
   Out-of-Bounds: Falling for too long in the play field, or falling past the bottom of the screen triggers a Looney Tunes-style whistling fall sound effect. (note: off-screen audio is crossfaded to 0db in “x” seconds by the game engine).
   D. Success & Failure States
   Success Condition
   Win Trigger: Player landing on the "Finish" platform. The character dances.
   Failure Conditions
   Out-of-Bounds: Player falls off-screen.
   Terminal Impact: Player lands on any surface at terminal velocity.
   Prototype Behavior
   Instant Level Reset: On failure trigger, immediately reload/reset the current level at the player's initial starting spawn point (no delay or game-over menu for prototype).



## E. Levels
Arrows indicate the direction of the wind. Level 10 - 12 are zoomed out because of the distance between the Start and Finish platforms. Mechanics remain the same.
Level 1 & 2: src/assets/art/levels_1-2.png
Level 3 & 4: src/assets/art/levels_3-4.png
Level 5 & 6 & 7 & 8: src/assets/art/levels_5-8.png
Level 9 & 10 & 11 & 12:src/assets/art/levels_9-12.png



Prototype To-Do List:
Scene Creation
Create a white block as the character
Create two white rectangular blocks as the Start platform and Finish platform.
Give the character collision detection and gravity
Give the Start and Finish platform collision detection
Code left and right movement into the character via WASD and the arrow keys.
Insert an integer for gravity and then administer a fall test using Level 10’s layout. If you like the way he picks up speed, write down the decimal and send it with the prototype in our Discord. Remember Level 10 is zoomed out.
Terminal Velocity
Once we narrow a number that feels right, we’ll administer a second test in Level 11.
Level 11 will test the feeling of the character’s terminal velocity. Play with it and then send the decimal number with the prototype in the Discord.
Once we narrow what feels right, then we’ll add the Umbrella mechanic.
Umbrella
Add the Umbrella mechanic and test it within Level 10’s layout.
Code the Umbrella to open when the character is not standing on a platform
(note: this should trigger the Umbrella to open automatically once the player steps off a platform)
Code the ability to open and close the Umbrella through the command of the Space Bar.
Perform a standing test and press the Space Bar multiple times to open and close the umbrella and determine if the code is working properly.
The Float Test
Code the Umbrella to heavily slow the downward fall of the character. Then test the speed of moving the player laterally in the air. Find what feels like the right speed of descent and the Umbrella’s mid-air turning speed, and send the decimals and their respective names (e.g. Umbrella Fall: 3.6, Turning Speed Acceleration: 0.2) with the prototype in the Discord.
After we’ve narrowed what feels right, we will administer a test in Level 10. If it feels good to walk off the platform, float, fall, catch yourself while falling, and float down to the Finish platform, then we’ll move onto adding the next mechanic: Wind Currents.
Wind Currents
Create Level 1.
Add upstream wind currents.
Administer a test in Level 1, getting from the Start to the Finish. Send the numbers and this version of the prototype in Discord.
Then add Level 2. Test an upward slope of an air current and how it feels. This may make us tweak the mid-air acceleration turning speed. Send the prototype in Discord.
Then add Level 3. Test how it feels when the character drops through the air current and onto the Finish platform. 

## Revision 1
Hey bro, here's some improvements I wanted to tinker with:

**Ground Speed**
· I think he's moving quickly, perhaps we reduce his ground top speed a bit and slow his rate of acceleration a bit too.
**Gravity**
· Slow down the rate of acceleration Gravity has on him a little bit. He reaches top speed a bit fast. I want the player to have a little more time in correcting their falling speed.
**Umbrella **
· Increase the clamp or the rate of acceleration time by a few milliseconds when opening the Umbrella, so it eases him into his max floating speed a little more.
· Make him bob up and down at the top of an air current like how holding jump in Minecraft, while on water, makes you bob up and down. I wonder if the transition between air current speed and the player's top vertical speed needs a slightly longer rate of deceleration.
**Mid-Air Turning**
· Slow his rate of acceleration when he turns direction in mid-air so it feels a tiny tiny bit more floaty. I don't want to lose his responsiveness, but enough where you can feel the floatiness of being in the "air".

**TL;DR:** I want him to feel a little more like a weighted feather. Responsive, yet a little floaty.

Umbrella (mini design doc)
Genre: Arcade
Platform: Desktop
Perspective: 2D, fixed-screen, side-scroller
Gameplay Length: 10s-30s per level


### A. Core Gameplay Loop
Open/Close Umbrella
Float/Pass through Jet Streams
Land on the “Finish” platform to win

### B. Movement & Controls
Walk: Use WASD or Arrow Keys to move left or right on the ground and in the air
Open/Close Umbrella: Space Bar
The Umbrella automatically opens up when the player steps off a platform.
In Mid-Air: The player may close and reopen the Umbrella themselves.

### C. Core Mechanics: Umbrella and Physics
Quick Guide: Float Speed, Mid-Air Turn, Wind Currents, Fall Speed and Terminal Velocity
1. Umbrella State
   States: Open (float/catch air) and Closed (free fall).
   Default Behavior: Opening the umbrella heavily slows downward acceleration and allows floating. Closing the umbrella immediately initiates standard gravity/falling.
2. Wind Currents
   There are two types of wind currents: directional wind currents and no wind currents.
   Visual Indicator: Marked by directional arrows (up, down, left or right) or none at all.
   Open Umbrella Interaction: When inside a wind current with an open umbrella, the player is pushed in the direction of the air stream until they reach the current's boundary. If the boundary is reached, the player will gently bob up and down at the edge.
   Closed Umbrella Interaction: Closing the umbrella while inside a stream allows the player to drop through it with some minor air resistance from the upward stream.
   Super Stream: A supercharged air current. Careful with these, they’ll blow you into a wall and you’ll splat. The rate of the player’s acceleration within the SuperStream should be slow enough for the player to close their umbrella before being whisked into a ceiling.
   Floating
   The Feel: If falling, opening the umbrella will catch your fall and slow your descent.
   Design Parameters:
   Float Speed: Capped at a gentle descending speed.
   Braking Snap: Opening the umbrella mid-fall clamps the float speed within 0.1 to 0.2 seconds (I think?) for a snappy, responsive catch.
   Air Current Interaction: Pushes the character in the direction of the wind, changing their vertical/horizontal direction in about 0.5 - 0.7 seconds (?).
   Mid-Air Feel (Left & Right Movement)
   The Feel: Think of turning around in water physics!
   Design Parameters:
   Mid-Air Turn: Should take anywhere between 0.5 - 0.8 secs (?) to turn the opposite direction.
   Momentum Carryover: Ground speed momentum carries over to air speed.
   Low Friction Air: When the player lets go of the movement keys, the float should gently slide them forward before coming to a stop.
3. Fall Speed & Break Mechanic
   Terminal Velocity: Falling continuously without opening the umbrella builds up the player’s downward speed, eventually reaching a max speed called: Terminal Velocity.
   Fall Speed should be determined in a range between 0 spd and “x” spd for terminal velocity.
   Umbrella Break Condition: Reopening the umbrella at terminal velocity breaks the umbrella.
   Mitigation: Players must periodically flutter (open/close) the umbrella during long falls to reset their speed and keep velocity in a safe range.
   Failure States:
   Ground Impact: If the player reaches terminal velocity and hits a platform, the character will slam into the ground with a cartoony "splat".
   Out-of-Bounds: Falling for too long in the play field, or falling past the bottom of the screen triggers a Looney Tunes-style whistling fall sound effect. (note: off-screen audio is crossfaded to 0db in “x” seconds by the game engine).


Fall States: In a free fall, he will turn upside-down as a visual indicator of his fall speed.
Safe Fall: Upright
Close to Danger Fall: Sideways (Umbrella will save you)
Terminal Velocity: Upside-Down (Umbrella breaks)
"C:\Users\konst\Documents\__p\umbrella\src\assets\art\fall-image.png"

### D. Success & Failure States
Success Condition
Win Trigger: Player landing on the "Finish" platform. The character dances.
Failure Conditions
Out-of-Bounds: Player falls off-screen.
Terminal Impact: Player lands on any surface at terminal velocity.
Prototype Behavior
Instant Level Reset: On failure trigger, immediately reload/reset the current level at the player's initial starting spawn point (no delay or game-over menu for prototype).
"C:\Users\konst\Documents\__p\umbrella\src\assets\art\success-failure-states.png"

### E. Levels:
"C:\Users\konst\Documents\__p\umbrella\src\assets\art\levels_1-4.png"

"C:\Users\konst\Documents\__p\umbrella\src\assets\art\levels_1-4.png"
"C:\Users\konst\Documents\__p\umbrella\src\assets\art\levels_5-6.png"
"C:\Users\konst\Documents\__p\umbrella\src\assets\art\levels_7-10.png"
"C:\Users\konst\Documents\__p\umbrella\src\assets\art\levels_11-12.png"
"C:\Users\konst\Documents\__p\umbrella\src\assets\art\levels_13-16.png"
"C:\Users\konst\Documents\__p\umbrella\src\assets\art\levels_17-18.png"
"C:\Users\konst\Documents\__p\umbrella\src\assets\art\levels_19-22.png"
"C:\Users\konst\Documents\__p\umbrella\src\assets\art\levels_23-24.png"

Prototype To-Do List:
Scene Creation
Create a white block as the character
Create two white rectangular blocks as the Start platform and Finish platform.
Give the character collision detection and gravity
Give the Start and Finish platform collision detection
Code left and right movement into the character via WASD and the arrow keys.
Fall Speed and Terminal Velocity
Administer a fall test using Level 10’s layout (remember Level 10 is zoomed out). If you like the way he accelerates while falling, write down the decimal and send it with the prototype in our Discord. We’ll go back and forth to determine the best acceleration number and top speed.
Then, Level 11 will test how it feels to enter terminal velocity. Just a visual test.
Once we narrow what feels right, then we’ll add the Umbrella mechanic.
Umbrella
Add the Umbrella mechanic and test it within Level 10’s layout.
Code the Umbrella to open when the character is not standing on a platform.
(note: this should trigger the Umbrella to open automatically once the player steps off a platform)
Code the ability to open and close the Umbrella through the command of the Space Bar.
Perform a standing test and press the Space Bar multiple times to open and close the umbrella and determine if the code is working properly.
The Float Test
Code the Umbrella to heavily slow the downward fall of the character. Then test the speed of moving the player laterally in the air. Find what feels like the right speed of descent and the Umbrella’s mid-air turning speed, and send the decimals for both values (e.g. Umbrella Fall: 3.6, Turning Speed Acceleration: 0.2) with the prototype in the Discord.
Then, test if it feels good to walk off the platform, float, fall, catch yourself while falling, and float down to the Finish platform, then we’ll move onto adding the next mechanic: Wind Currents.
Wind Currents
Create Level 1.
Add upstream wind currents.
Administer a test in Level 1, getting from the Start to the Finish. Send the numbers and this version of the prototype in Discord.
Then add Level 2. Test an upward slope of an air current and how it feels. This may make us tweak the mid-air acceleration turning speed. Send the prototype in Discord.
Then add Level 3. Test how it feels when the character drops through the air current and onto the Finish platform.



## Revision 2
## Revision 3
**Tuning**
· Import the level designer's tuned constants (umbrella-tuning-2026-10-21T00-57-37.json) as the new defaults.
· Hide the lil-gui on start; typing "cmonc" shows it.
· On level 4 and 5 the player is pushed to the sides when trying to land on the finish platform.

**Levels**
· Make the Walldorfs in Level 13 - 14 not dangerous to touch.
· Have the angry Walldorf in Level 15 charge straight on, not diagonally.
· Level 22's air current should be a Super Stream.
· The wind currents in Level 13 - 15: level them with the Start and Finish platform and bring them in closer to both platforms.

**Level Editor**
· A level editor like Spin&Mow's, with the Umbrella game elements. Typing "cmonc" also shows a semi-big "OPEN EDITOR" button in the bottom left, leading to the /editor page for building and playtesting levels, which can export levels as .json files for importing.
· In dev mode, campaign overrides saved in the editor are written into the repo (data/campaign-overrides.json).
## Revision 4
**Multi-screen levels**
· Levels can be bigger than one screen: the camera scrolls with the player's movement, clamped to the world edges (level 27 is the first scrolling level, three screens wide).
· The level editor supports scrolling levels: world size and screen size, the screen grid and start screen, zoom and pan.

**Mobile view**
· A "Toggle Mobile view" button in the editor shows and playtests the level on a portrait and a landscape phone at the same time.
· Mobile controls: a left/right joystick bottom-left and an open/close umbrella button bottom-right.

**Walldorf (lunging pillar) toggles**
· Lunge speed customization.
· Proximity trigger: attacks when the player is in the air and nearby (like a Thwomp).
· Trigger radius, to change the size of the trigger zone.
· Non-hostile: his lunge attack doesn't hurt the player.

## Revision 5
**Levels bucket (shared level editing)**
· Level edits are stored online: the designer edits on the website, and every Save, Delete, Overwrite and Revert uploads at once (editor password, Sync button).
· The newest edit of each level wins, wherever it was made; the game on the website plays the latest campaign levels right away.
· Every new build pulls the latest levels first, so a revision ships them.
· Works offline: edits stay in the browser and upload once the server is reachable again.
· Export library: one file with every saved level and every changed campaign level, as a manual backup.

## Revision 6
## Revision 
## Revision 
## Revision 
## Revision 