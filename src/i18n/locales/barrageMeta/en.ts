// Umbrella meta strings ('barrageMeta' namespace: achievements, pass, collections, daily, supply drop).
// English is the source: add keys here first, then mirror them into every other locale.
export default {
  'achievements': {
    'title': 'Achievements',
    'subtitle': 'Hit lifetime milestones to earn coins.',
    'claim': 'Claim',
    'claimed': 'Claimed',
    'unlocked': 'Achievement complete!',
    'progress': '{c} / {t}',
    'items': {
      'kills100': 'First Hundred',
      'kills1k': 'Monster Slayer',
      'kills10k': 'Exterminator',
      'row10': 'Into the Fray',
      'row30': 'Deep Siege',
      'row60': 'Iron Wall',
      'row100': 'Legend of the Deep',
      'boss1': 'Giant Slayer',
      'boss10': 'Boss Hunter',
      'boss50': 'Kingsbane',
      'merges10': 'Twin Power',
      'merges100': 'Merge Master',
      'merges500': 'Fusion Forge',
      'tier3': 'First Spark',
      'tier5': 'Rising Element',
      'tier7': 'Elemental Might',
      'tier9': 'Primal Force',
      'combo25': 'Ricochet',
      'combo50': 'Chain Reaction',
      'combo150': 'Pinball Wizard',
      'fever1': 'Fever Pitch',
      'fevers25': 'Rainbow Rush'
    },
    'desc': {
      'kills': 'Monsters defeated: {n}',
      'bestRow': 'Reach row {n}',
      'bossKills': 'Bosses defeated: {n}',
      'merges': 'Ball merges: {n}',
      'maxBallTier': 'Create a tier {n} ball',
      'bestCombo': 'Hits in one volley: {n}',
      'fevers': 'FEVER volleys: {n}'
    }
  },
  'pass': {
    'title': 'Barrage Pass',
    'progress': 'Tier {current} / {total}',
    'daysLeft': '{n}d left',
    'maxed': 'PASS COMPLETE',
    'xpProgress': '{current} / {total} XP',
    'xpAmount': '+{n} XP',
    'howToEarn': 'How to earn XP',
    'perKill': 'per kill',
    'perMerge': 'per merge',
    'perRow': 'per row',
    'perBoss': 'per boss',
    'unlockHint': 'Reach {n} XP to unlock the next reward — unclaimed rewards stay until you tap them.',
    'ballReward': 'Free tier {tier} ball'
  },
  'collections': {
    'title': 'Collection',
    'launchers': 'Launchers',
    'skins': 'Ball Skins',
    'buy': 'Buy',
    'equip': 'Equip',
    'equipped': 'Equipped',
    'new': 'New!',
    'undiscovered': 'Undiscovered',
    'discoverHint': 'Merge a tier {tier} ball to discover it',
    'tier': 'Tier {tier}',
    'rarity': {
      'common': 'Common',
      'rare': 'Rare',
      'epic': 'Epic',
      'legendary': 'Legendary'
    },
    'skinNames': {
      'orb': 'Glass Orb',
      'stone': 'Stone',
      'tide': 'Tide',
      'gale': 'Gale',
      'frost': 'Frost',
      'amber': 'Amber',
      'lava': 'Lava',
      'diamond': 'Diamond',
      'obsidian': 'Obsidian',
      'glow': 'Glow Rune',
      'gilded': 'Gilded',
      'eclipse': 'Eclipse'
    }
  },
  'daily': {
    'title': 'Daily Barrage',
    'subtitle': 'Everyone gets the same board today. How deep can you go?',
    'rules': 'No upgrades, no continues — just your aim.',
    'play': 'Play',
    'best': "Today's best: row {n}",
    'attempts': 'Attempts today: {n}',
    'streak': 'Day streak: {n}',
    'newBest': 'New daily best!'
  },
  'supply': {
    'title': 'Treasure Chest',
    'ready': 'Ready!',
    'readyIn': 'Next gift in {time}',
    'biggerIn': 'Bigger gift (+{n}) in {time}',
    'gift': '+{n}',
    'open': 'Open',
    'coins': '+{n} coins',
    'bonusCharge': 'Bonus charge: {skill}'
  }
}
