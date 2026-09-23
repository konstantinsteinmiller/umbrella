// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// English is the source: add keys here first, then mirror them into every other locale.
// Numbers are always passed in as {params} (formatted by the UI, Latin digits) —
// never concatenated onto a translated word.
export default {
  // Top bar + run status.
  hud: {
    row: 'Row {n}',
    daily: 'Daily',
    bossIn: 'Boss in {n}',
    best: 'Best {n}',
    todayBest: 'Today {n}',
    shields: 'Shield charges: {n}',
    revives: 'Revive charges: {n}',
    warcry: 'Warcry armed: your next volley deals double damage'
  },
  // The ball tray under the board.
  tray: {
    count: '{n}/{max}',
    aria: 'Ball tray: {n} of {max} balls',
    slotAria: '{name}, tier {n}',
    stackAria: '{name}, tier {n}, ×{count}',
    stackCount: '×{n}',
    tierOnly: 'Tier {n}',
    plusOne: '+1',
    merged: 'Merged!',
    overflow: 'Tray full! +{n} coins'
  },
  // The five upgrade chips. `short` is the chip label; `name` + `desc` are the
  // tooltip and the screen-reader label.
  upgrades: {
    title: 'Upgrades',
    damage: { name: 'Ball Damage', short: 'Damage', desc: 'Every ball hits harder.' },
    capacity: { name: 'Tray Capacity', short: 'Capacity', desc: 'Hold more balls before twins merge.' },
    speed: { name: 'Launch Speed', short: 'Speed', desc: 'Balls fly faster and leave the launcher quicker.' },
    luck: { name: 'Pickup Luck', short: 'Luck', desc: 'More coin and skill bubbles on the board.' },
    bounty: { name: 'Coin Bounty', short: 'Bounty', desc: 'Earn more coins from every monster.' },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}%',
      plusPercent: '+{n}%'
    },
    arrow: '{from} → {to}',
    max: 'MAX',
    free: 'Free',
    aria: '{name}: {desc} Cost: {cost} coins.',
    ariaMaxed: '{name}: {desc} Fully upgraded.',
    ariaFree: '{name}: {desc} Free!'
  },
  // The contextual control under the board.
  turn: {
    bonus: '+{n} balls',
    bonusAdAria: 'Watch an ad for {n} extra balls',
    bonusCoinAria: 'Buy {n} extra balls for {cost} coins',
    recall: 'Recall balls',
    speed: '×{n}',
    fastAria: 'Fast forward ×{n}'
  },
  boss: {
    enraged: 'Enraged!',
    hpAria: '{name}: {hp} of {max} health'
  },
  bosses: {
    'slime-tower': 'Slime Tower',
    worm: 'Great Worm',
    'fire-dragon': 'Fire Dragon',
    'silver-dragon': 'Silver Dragon',
    troll: 'Troll King',
    orc: 'Orc Warlord'
  },
  // New-monster introductions (one simple rule each).
  monsters: {
    slime: { name: 'Slime', rule: 'A plain old blob.' },
    goblin: { name: 'Goblin', rule: 'Hops one column sideways every turn.' },
    caterpillar: { name: 'Caterpillar', rule: 'Two cells wide and extra tough.' },
    ogre: { name: 'Ogre', rule: 'Double health. Crush balls deal triple damage to it.' },
    dryad: { name: 'Dryad', rule: 'Heals her neighbors every turn — hit her first!' },
    centaur: { name: 'Centaur', rule: 'Spits sludge that blocks a cell for a turn.' },
    imp: { name: 'Imp', rule: 'Splits into two little imps when defeated.' },
    treant: { name: 'Treant', rule: 'Slow but sturdy: marches only every other turn.' },
    carbuncle: { name: 'Carbuncle', rule: 'Its gem shield blocks the first hit every turn.' },
    cyclops: { name: 'Cyclops', rule: 'Charges two rows every other turn — mind the arrows!' },
    corrupted: { name: 'Corrupted', rule: 'Elite monsters: tougher, but worth triple coins.' }
  },
  // Big banners over the board.
  banners: {
    bossIncoming: 'Boss incoming!',
    enraged: '{name} is enraged!',
    enragedSub: 'It now marches two rows a turn!',
    checkpoint: 'Checkpoint!',
    checkpointSub: 'Restart point saved at row {n}',
    fever: 'Fever!',
    feverSub: 'Double coins!',
    combo: 'Combo',
    comboHits: '×{n}',
    newMonster: 'New monster',
    shieldBlocked: 'Shield blocked!',
    meteorStorm: 'Meteor Storm!',
    revived: 'Revived!'
  },
  // Skill bubbles: the toast shows the name and its one-line effect.
  skills: {
    meteor: { name: 'Meteor', effect: 'Meteors strike every monster!' },
    warcry: { name: 'Warcry', effect: 'Your next volley deals double damage!' },
    legion: { name: 'Legion Call', effect: '+3 ghost balls this volley!' },
    pact: { name: 'Soul Pact', effect: 'Your best ball was copied!' },
    shield: { name: 'Shield Crest', effect: 'Absorbs the next breach.' },
    execute: { name: "Executioner's Mark", effect: 'The toughest monster falls!' },
    heal: { name: 'Heal', effect: 'Monsters are pushed back up a row!' },
    revive: { name: 'Revive', effect: '+1 free continue.' }
  },
  // Ball abilities by tier (codex).
  abilities: {
    burn: { name: 'Burn', desc: 'Hits keep burning after the volley.' },
    knockback: { name: 'Knockback', desc: 'Pushes the monster back up a row.' },
    pierce: { name: 'Pierce', desc: 'Passes through the first monster it hits.' },
    freeze: { name: 'Freeze', desc: 'The monster skips its next march.' },
    splash: { name: 'Splash', desc: 'Splashes damage onto neighbors.' },
    crush: { name: 'Crush', desc: 'Triple damage to ogres and bosses.' },
    chain: { name: 'Chain', desc: 'Lightning jumps to two more monsters.' },
    poison: { name: 'Poison', desc: 'Stacking poison ticks every turn.' },
    midas: { name: 'Midas', desc: 'Bonus coins on every hit.' },
    eruption: { name: 'Eruption', desc: 'Every few hits, a blast hits a 3×3 area.' }
  },
  // OVERRUN — the breach screen.
  breach: {
    title: 'Overrun!',
    body: 'The monsters broke through at row {n}.',
    meteor: 'Meteor Storm',
    meteorDesc: 'Clear the bottom two rows and keep going',
    meteorAdAria: 'Watch an ad: Meteor Storm clears the bottom two rows',
    meteorCoinAria: 'Meteor Storm for {cost} coins: clears the bottom two rows',
    revive: 'Revive',
    reviveDesc: 'Use a revive charge ({n} left)',
    free: 'Free',
    restart: 'Restart at row {n}',
    restartDesc: 'Keep all your coins',
    onceHint: 'Meteor Storm works once per checkpoint.'
  },
  // Boss chest after a boss kill.
  chest: {
    title: 'Boss defeated!',
    titleFirst: 'First boss down!',
    defeated: '{name} defeated!',
    amount: '+{n}',
    doubled: 'Bounty doubled!',
    checkpoint: 'Checkpoint saved at row {n}',
    double: '2×',
    doubleAdAria: 'Watch an ad to double the bounty',
    doubleCoinAria: 'Double the bounty for {cost} coins',
    collect: 'Collect'
  },
  // Daily Barrage (title / rules / best: barrageMeta.daily.*).
  daily: {
    today: "Today's board: {date}",
    bestLabel: "Today's best",
    attemptsLabel: 'Attempts',
    streakLabel: 'Day streak',
    active: 'Daily run in progress',
    keepPlaying: 'Keep playing',
    quit: 'Leave daily run',
    playAgain: 'Play again',
    back: 'Back to endless',
    resultTitle: 'Daily run over',
    resultRow: 'Row {n}',
    waitTurn: 'Finish your turn to start the daily board.'
  },
  // Launchers + ball skins (titles, rarities and skin names: barrageMeta.collections.*).
  collection: {
    cosmetic: 'Cosmetic only — never changes your power.',
    unknown: '???',
    selectedAria: '{name}, selected',
    selectAria: 'Select {name}',
    buyAria: 'Buy {name} for {cost} coins',
    adProgress: '{n}/{max}',
    adAria: 'Watch an ad to unlock {name}',
    adProgressAria: 'Watch an ad for {name} ({n} of {max} watched)'
  },
  // The treasure chest: a small gift after 3 min, a big one after 10 (lines: barrageMeta.supply.*).
  supply: {
    ready: 'Treasure chest ready — tap to open!'
  },
  // Ball codex (every tier of the ladder).
  codex: {
    title: 'Ball Codex',
    progress: '{n} / {total} discovered',
    damage: 'Damage ×{n}',
    locked: 'Merge two tier {n} balls to discover!'
  },
  // First-session coach marks (screen-reader text; the screen shows a hand).
  tutorial: {
    aim: 'Drag back and release to shoot!',
    pickup: 'Shoot through a +1 bubble to collect a ball!',
    merge: 'Collect another ball: a full tray merges twins into a stronger ball!',
    upgrade: 'Tap the free upgrade to hold more balls!'
  },
  // The wordless coach (sr-only: the screen acts each lesson out).
  coach: {
    survive: 'Monsters are about to break through — hit the lowest ones first!',
    tray: 'Your tray is full: a +1 only adds a shot while there is a free slot. Upgrade Tray Capacity to shoot more balls!',
    combo: 'Aim through a gap: balls bouncing behind the monsters rack up huge combos!',
    trayIntro: 'This tray holds your balls: each one is a shot. A +1 fills an empty slot, and a full tray merges two twins into a stronger ball.',
    upgrade: 'Tap the glowing upgrade: it makes your balls, your tray or your coins better.'
  },
  // Earned HUD features (sr-only: the screen flies the button in).
  unlock: {
    announce: 'Unlocked: {name}!'
  }
}
