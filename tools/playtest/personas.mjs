// The four blind testers. Ports and window slots are fixed so four headed
// windows tile a 1707-px-wide (150 % scaled 2560) screen without overlap.
export const PERSONAS = [
  {
    id: 'p1', slug: 'p1-mia', name: 'Mia', role: 'Casual commuter', lang: 'en-US', hue: 'ember', cdp: 9411, api: 9511, x: 0,
    brief: '"Mia", 34, casual commuter. Plays short hyper-casual games on her phone on the bus. Impatient; skims or ignores text; taps whatever looks shiny or glows; quits apps that confuse her in the first minute. Has not played this game or anything exactly like it recently.'
  },
  {
    id: 'p2', slug: 'p2-dev', name: 'Dev', role: 'Genre veteran', lang: 'en-US', hue: 'frost', cdp: 9412, api: 9512, x: 427,
    brief: '"Dev", 27, experienced mobile gamer. Has sunk many hours into aim-and-shoot and physics/arcade games (brick breakers, bubble shooters, "Ballz"-likes, idle games). Plays deliberately, looks for optimal shots and patterns, compares everything to games he knows, notices balance and feedback details, gets bored if there\'s no skill expression or if the game over-explains.'
  },
  {
    id: 'p3', slug: 'p3-leo', name: 'Leo', role: '10-year-old novice', lang: 'en-US', hue: 'moss', cdp: 9413, api: 9513, x: 854,
    brief: '"Leo", 10 years old. Plays games on a parent\'s phone. Reads slowly and skips text, experiments by tapping and swiping everywhere, is drawn to monsters, explosions and colourful things, gets frustrated when he loses without understanding why, and loves "big numbers" and surprises. Has no idea what genre this is.'
  },
  {
    id: 'p4', slug: 'p4-jonas', name: 'Jonas', role: 'German explorer', lang: 'de-DE', hue: 'violet', cdp: 9414, api: 9514, x: 1281,
    brief: '"Jonas", 41, German-speaking player; his phone is set to German, so the game will show German text. Methodical explorer and min-maxer: opens every menu and button to understand the systems (upgrades, currencies, collections, rewards), reads the text carefully, cares whether progression feels fair and whether the German text is correct and fits on screen.'
  }
]
