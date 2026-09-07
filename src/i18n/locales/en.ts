// English source bundle. Single source of truth for translation keys — every
// new player-facing string gets a key here first; the per-language files in
// this folder mirror the shape. Vite ships each non-English locale as its own
// lazy chunk (see `src/i18n/index.ts`).
export default {
  'gameName': 'Merge Legion',
  // ─── Merge Legion UI chrome (source locale; en is the runtime fallback for
  // every other locale via vue-i18n `fallbackLocale`). Unit & boss
  // proper-nouns live in the data files — full content localisation is a
  // dedicated follow-up (see the roadmap). ───────────────────────────────────
  'prism': {
    'spawn': 'Spawn',
    'instantSpawn': 'Instant Spawn',
    'doubleDamage': '2x Damage',
    'freeGold': 'War Chest',
    'gridFull': 'Grid full — merge or deploy to make room!',
    'hintDrag': 'Drag matching units together to merge'
  },
  'welcomeBack': {
    'title': 'Welcome back, commander!',
    'body': 'Your army kept fighting while you were away:'
  },
  'battle': {
    'spellDesc': { 'heal': "Restores 25% of every unit's health.", 'reviveGuard': "For 30s, any unit that falls instantly revives at full health.", 'defender': "Turns your top melee unit into a tank: 2× health, 80% less damage, for 2 minutes.", 'meteor': "Rains meteors across the field, blasting all enemies." },
    'mutationWave': "MUTATION!",
    'overrunSetbackHint': "These waves are too strong for you — build up your army on easier waves first.",
    'spells': { 'heal': "Heal", 'reviveGuard': "Revive Guard", 'defender': "Defender" },
    'bossNames': { 'b0': "Glorp the Devourer", 'b1': "King Sludgefist", 'b2': "Mawzilla", 'b3': "The Gate-Eater", 'b4': "Grumblor Prime" },
    'wave': 'Wave {n}',
    'best': 'Best {n}',
    'waveStart': 'Wave {n}',
    'nextWave': 'Wave {n} in…',
    'waveCleared': 'Wave cleared! +{n}',
    'bossIncoming': 'BOSS INCOMING!',
    'overrun': 'OVERRUN!',
    'overrunBody': 'The gate has fallen — regroup and hold the line!',
    'deployHint': 'Drop to deploy!',
    'armyFullHint': 'Army full — drop onto a same-tier fighter to merge!',
    'fever': 'FEVER!!!',
    'rampage': 'RAMPAGE!',
    'ultimate': 'Meteor Storm',
    'doubleBounty': 'Double the boss bounty!',
    'nextChest': 'Next: 🎁 wave {n}',
    'newEnemyAt': 'New enemy at wave {n}!',
    'newEnemy': 'New enemy incoming!',
    'chestWave': 'War chest! +{n}',
    'waveSetback': 'Pushed back to wave {n}!',
    'rally': 'RALLY!',
    'rallyBody': 'Watch to resurrect your fallen fighters!',
    'coinBuff': {
      'offerTitle': 'The chest holds {mult}× gold!',
      'label': '{mult}× Coin Income',
      'duration': 'for {m} minutes',
      'expiresIn': 'Offer ends in {n}s'
    },
    'tutorial': {
      'spawn': 'Tap SPAWN to recruit two sparks!',
      'merge': 'Drag one spark onto the other to MERGE them!',
      'deploy': 'Drag your fighter into the arena to join the fight!',
      'fieldMerge': 'Build another unit of the same tier and drop it onto your fighter to HEAL & RANK UP!'
    },
    'codex': {
      'title': 'Unit Codex',
      'names': { 't1': 'Magma Mote', 't2': 'Frost Whirl', 't3': 'Boulder Brute', 't4': 'Glacier Guard', 't5': 'Tide Drop', 't6': 'Crag Colossus', 't7': 'Nebula Eye', 't8': 'Void Wraith', 't9': 'Golden Talon', 't10': 'Phoenix Sovereign', 't11': 'Obsidian Warlord', 't12': "Infernal Titan", 't13': "Umbral Reaper", 't14': "Magma Leviathan", 't15': "Cosmic Ascendant", 't16': "Tempest Sovereign", 't17': "Abyssal Warden", 't18': "Molten Behemoth", 't19': "Astral Devourer", 't20': "Eternal Godhead" },
      'locked': 'Merge two Tier {n} to discover!',
      'abilities': {
        'none': 'A molten spark — fast, fearless, and first through the gate.',
        'burn': 'Biting frost lingers — enemies keep taking damage after the hit.',
        'knockback': 'Hurls boulders that smash enemies backward.',
        'heal': 'Radiates renewing frost — every hit heals your weakest ally.',
        'splash': 'Crashing waves strike every nearby enemy.',
        'poison': 'Choking grit stacks up for heavy damage over time.',
        'chain': 'Starfire arcs to three extra enemies.',
        'frost': 'A creeping dread slows foes and locks crowds in place.',
        'midas': 'High crit chance and bonus gold on every hit.',
        'blackhole': 'Conjures a searing vortex that pulls the horde in and burns it to ash.',
        'eruption': 'Erupts on impact — a molten splash burns every nearby enemy.'
      }
    },
    'mutators': {
      'goldRush': 'GOLD RUSH! {mult}× bounty',
      'frostMarch': 'FROST MARCH! Chilling hits',
      'horde': 'HORDE! Double the swarm',
      'elite': 'ELITE! A champion leads the wave'
    },
    'upgrades': {
      'attack': 'War Horns',
      'vitality': 'Vitality',
      'bounty': 'Bounty',
      'automation': 'Imp',
      'recruit': 'Recruits',
      'maxed': 'MAX',
      'desc': {
        'attack': 'Raises the attack damage of your whole army.',
        'vitality': 'Raises the maximum health of every fighter.',
        'bounty': 'Earn more coins from every enemy you kill.',
        'automation': 'Merges units for you automatically, faster each level.',
        'recruit': 'New units spawn at a higher tier.'
      }
    }
  },
  'cancel': 'Cancel',
  'close': 'Close',
  'ok': 'Ok',
  'continue': 'Continue',
  'tapToContinue': 'Tap to continue',
  'clickToContinue': 'Click to continue',
  'stage': 'Stage',
  'rewards': 'REWARDS',
  'tip': 'Tip',
  'crazyGamesOnly': 'This game is only available on',
  'startTouch': 'Tap to Start',
  'startDesktop': 'Click to Start',
  'startSubhint': 'Roll upward — change direction to dodge the gaps and obstacles!',
  'hints': {
    'tapToTurn': 'Tap to change direction',
    'clickToTurn': 'Click / Space to change direction'
  },
  'powerups': {
    'invuln': 'Invincible',
    'magnet': 'Coin Magnet',
    'dodge': 'Dodge Master',
    'slowmo': 'Slow Motion',
    'push': 'Push Force',
    'racer': 'Racer!'
  },
  'secondChance': {
    'title': 'Keep rolling?',
    'body': 'Watch a short ad to revive and continue your run.',
    'watch': 'Watch & Continue',
    'skip': 'Skip'
  },
  'result': {
    'win': 'STAGE CLEAR!',
    'lose': 'GAME OVER',
    'fell': 'You fell into a gap!',
    'crashed': 'You crashed into an obstacle!',
    'tiles': 'Tiles',
    'winReward': 'incl. +{n} stage bonus',
    'double': 'Double coins',
    'firstRunDouble': '2× — first run today!',
    'almost': 'Almost! {n} more tiles to clear.',
    'retry': 'Retry'
  },
  'ads': {
    'watch': 'Watch',
    'revive': 'Revive',
    'secondChance': 'Second Chance',
    'doubleCoins': '2× Coins',
    'plusCoins': '+{n} coins'
  },
  'achievements': {
    'title': 'Achievements',
    'subtitle': 'Hit lifetime milestones to earn gold.',
    'claim': 'Claim',
    'claimed': 'Claimed',
    'unlocked': 'Achievement complete!',
    'progress': '{c} / {t}',
    'items': {
      'kills100': { 'name': 'First Hundred', 'desc': 'Defeat 100 enemies.' },
      'kills1k': { 'name': 'Slayer', 'desc': 'Defeat 1,000 enemies.' },
      'kills10k': { 'name': 'Exterminator', 'desc': 'Defeat 10,000 enemies.' },
      'wave10': { 'name': 'Line Holder', 'desc': 'Reach wave 10.' },
      'wave25': { 'name': 'Front Commander', 'desc': 'Reach wave 25.' },
      'wave50': { 'name': 'Warlord', 'desc': 'Reach wave 50.' },
      'boss1': { 'name': 'Giant Slayer', 'desc': 'Defeat your first boss.' },
      'boss10': { 'name': 'Boss Hunter', 'desc': 'Defeat 10 bosses.' },
      'boss50': { 'name': 'Kingsbane', 'desc': 'Defeat 50 bosses.' },
      'merges50': { 'name': 'Combiner', 'desc': 'Merge units 50 times.' },
      'merges500': { 'name': 'Merge Master', 'desc': 'Merge units 500 times.' },
      'tier5': { 'name': 'Blazing Forge', 'desc': 'Create a Tier 5 unit.' },
      'tier8': { 'name': 'Frozen Forge', 'desc': 'Create a Tier 8 unit.' },
      'tier10': { 'name': 'Cosmic Forge', 'desc': 'Create the Tier 10 unit.' },
      'fieldMerge1': { 'name': 'Field Medic', 'desc': 'Perform your first field merge.' },
      'fieldMerges25': { 'name': 'Battle Smith', 'desc': 'Perform 25 field merges.' },
      'combo10': { 'name': 'Rampage', 'desc': 'Reach a ×10 kill combo.' },
      'combo25': { 'name': 'Unstoppable', 'desc': 'Reach a ×25 kill combo.' },
      'waves100': { 'name': 'Campaigner', 'desc': 'Clear 100 waves in total.' },
      'waves500': { 'name': 'War Eternal', 'desc': 'Clear 500 waves in total.' }
    }
  },
  'missions': {
    'title': 'Daily Missions',
    'subtitle': 'Complete goals each day for coins.',
    'claim': 'Claim',
    'done': 'Claimed',
    'types': {
      'coins': 'Collect {n} coins today',
      'tiles': 'Travel {n} tiles in one run',
      'items': 'Grab {n} item boxes today',
      'clears': 'Clear {n} stages today'
    }
  },
  'endless': {
    'badge': 'Endless',
    'toEndless': 'Endless Mode',
    'toCampaign': 'Campaign',
    'best': 'Best: {n}'
  },
  'boon': {
    'title': 'Choose a boon',
    'names': {
      'secondChance': 'Second Chance',
      'startPowerup': 'Head Start',
      'coinBoost': 'Coin Rush'
    },
    'descriptions': {
      'secondChance': 'Begin the next stage with a Second Chance shield.',
      'startPowerup': 'Begin the next stage with a random power-up.',
      'coinBoost': '1.2× coins for the whole next stage.'
    }
  },
  'upgrades': {
    'title': 'Upgrades',
    'subtitle': 'Spend coins to power up permanently.',
    'level': 'Lv.{n}',
    'maxedOut': 'MAXED',
    'sellBack': 'Sell +{n}',
    'spotlight': 'Spend!',
    'unlocksAtStage': '🔒 Stage {n}',
    'names': {
      'powerupDuration': 'Power Boost',
      'magnetRange': 'Magnet Range',
      'coinValue': 'Coin Value',
      'itemLuck': 'Lucky Boxes',
      'dodgeApprentice': 'Dodge Apprentice',
      'deathMagnet': 'Death Magnet',
      'autoCollect': 'Auto-Collect',
      'rollingBoulder': 'Rolling Boulder'
    },
    'descriptions': {
      'powerupDuration': 'All power-ups last longer (+0.75s per level).',
      'magnetRange': 'The Coin Magnet reaches further.',
      'coinValue': 'Each coin you grab is worth more.',
      'itemLuck': 'Item boxes appear more often.',
      'dodgeApprentice': 'Auto-dodge one deadly tile, then recharge (10s; −0.5s per level).',
      'deathMagnet': 'On death, grab every coin within 4 tiles — bank what you would have lost.',
      'autoCollect': 'Always collect coins from nearby tiles — a permanent 1-tile magnet.',
      'rollingBoulder': 'Roll straight through box obstacles, unharmed.'
    },
    'secondChance': {
      'name': 'Second Chance',
      'description': 'Start each run with angel wings — survive one crash or fall. Active until used.',
      'active': 'ACTIVE',
      'watch': 'Free'
    }
  },
  'battlePass': {
    'title': 'War Campaign',
    'progress': '{current} / {total}',
    'daysLeft': '{n}d left',
    'maxed': 'CAMPAIGN COMPLETE',
    'xpProgress': '{current} / {total} XP',
    'howToEarn': 'How to earn XP',
    'perAttempt': 'per run',
    'perStageFinish': 'per stage clear',
    'perKill': 'per kill',
    'perMerge': 'per merge',
    'perWave': 'per wave',
    'perBoss': 'per boss',
    'unlockHint': 'Reach {n} XP to unlock the next reward — unclaimed rewards stay until you tap them.'
  },
  'dailyRewards': {
    'title': 'Daily Rewards',
    'subtitle': 'Sign in every day to keep your streak.',
    'day': 'Day {n}',
    'dayShort': 'D{n}'
  },
  'skins': {
    'title': 'Ball Skins',
    'subtitle': 'Spend coins to unlock and equip new looks.',
    'equip': 'Equip',
    'equipped': 'Equipped',
    'locked': 'Stage {n}',
    'new': 'New!',
    'rarity': {
      'common': 'Common',
      'rare': 'Rare',
      'epic': 'Epic'
    }
  },
  'options': {
    'title': 'Options',
    'general': 'General',
    'audio': 'Audio',
    'language': 'Language',
    'difficulty': 'Difficulty',
    'soundEffects': 'Sound Effects',
    'music': 'Music',
    'musicTrack': 'Music Track',
    'musicTracks': {
      'cozy': 'Cozy Harmony',
      'battle': 'Battle Theme'
    },
    'close': 'Save & Close',
    'difficulties': {
      'easy': 'Easy',
      'medium': 'Medium',
      'hard': 'Hard'
    },
    'difficultyHints': {
      'easy': 'Slower travel speed — more time to react.',
      'medium': 'The standard, balanced pace.',
      'hard': 'Faster travel speed — tighter, more precise timing.'
    }
  },
  'adsBlocked': {
    'title': "Couldn't show ad",
    'body': 'We tried to show you a video so you could earn your reward, but something on your browser is blocking ads.',
    'allowPrefix': 'Please allow ads on',
    'allowSuffix': '(or pause your ad-blocker for this game) and try again.',
    'gotIt': 'Got it'
  },
  'saveStatus': {
    'restoredTitle': 'Cloud save restored',
    'restoredBody': '+{n} bonus coins for the recovery',
    'tap': 'tap',
    'pausedTitle': 'Cloud sync paused',
    'pausedBody': 'Playing offline. Your progress is saved here.',
    'retry': 'Retry',
    'dismiss': 'dismiss'
  },
  'loading': {
    'tooLong': 'Loading taking too long? Try disabling your ad blocker and refresh.'
  },
  'license': {
    'denied': 'Access Denied: Please purchase a license.'
  }
}
