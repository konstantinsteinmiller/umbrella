// Elemental Barrage meta strings ('barrageMeta' namespace: achievements, pass, collections, daily, supply drop).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  'achievements': {
    'title': '成就',
    'subtitle': '达成永久里程碑即可赚取金币。',
    'claim': '领取',
    'claimed': '已领取',
    'unlocked': '成就达成！',
    'progress': '{c} / {t}',
    'items': {
      'kills100': '首个一百',
      'kills1k': '怪物杀手',
      'kills10k': '歼灭者',
      'row10': '投身战场',
      'row30': '深层围攻',
      'row60': '钢铁之墙',
      'row100': '深渊传说',
      'boss1': '巨人杀手',
      'boss10': '首领猎人',
      'boss50': '弑王者',
      'merges10': '双子之力',
      'merges100': '合成大师',
      'merges500': '融合熔炉',
      'tier3': '初次火花',
      'tier5': '元素崛起',
      'tier7': '元素之力',
      'tier9': '原初之力',
      'combo25': '弹射',
      'combo50': '连锁反应',
      'combo150': '弹球巫师',
      'fever1': '狂热时刻',
      'fevers25': '彩虹狂潮'
    },
    'desc': {
      'kills': '击败怪物：{n}',
      'bestRow': '到达第 {n} 行',
      'bossKills': '击败首领：{n}',
      'merges': '球体合成：{n} 次',
      'maxBallTier': '合成一颗 {n} 级球',
      'bestCombo': '单轮齐射命中：{n}',
      'fevers': '狂热齐射：{n} 次'
    }
  },
  'pass': {
    'title': '弹幕通行证',
    'progress': '等级 {current} / {total}',
    'daysLeft': '剩余 {n} 天',
    'maxed': '通行证已完成',
    'xpProgress': '{current} / {total} XP',
    'xpAmount': '+{n} XP',
    'howToEarn': '如何获得 XP',
    'perKill': '每次击杀',
    'perMerge': '每次合成',
    'perRow': '每行',
    'perBoss': '每个首领',
    'unlockHint': '获得 {n} XP 即可解锁下一个奖励——未领取的奖励会一直保留，直到你点击领取。',
    'ballReward': '免费 {tier} 级球'
  },
  'collections': {
    'title': '收藏',
    'launchers': '发射器',
    'skins': '球体皮肤',
    'buy': '购买',
    'equip': '装备',
    'equipped': '已装备',
    'new': '新！',
    'undiscovered': '未发现',
    'discoverHint': '合成一颗 {tier} 级球即可发现',
    'tier': '{tier} 级',
    'rarity': {
      'common': '普通',
      'rare': '稀有',
      'epic': '史诗',
      'legendary': '传说'
    },
    'skinNames': {
      'orb': '玻璃球',
      'stone': '石头',
      'tide': '潮汐',
      'gale': '疾风',
      'frost': '冰霜',
      'amber': '琥珀',
      'lava': '熔岩',
      'diamond': '钻石',
      'obsidian': '黑曜石',
      'glow': '发光符文',
      'gilded': '鎏金',
      'eclipse': '日食'
    }
  },
  'daily': {
    'title': '每日弹幕',
    'subtitle': '今天所有人都挑战同一张棋盘。你能走多深？',
    'rules': '没有升级，没有续关——只靠你的准头。',
    'play': '开始',
    'best': '今日最佳：第 {n} 行',
    'attempts': '今日尝试：{n}',
    'streak': '连续天数：{n}',
    'newBest': '新的今日纪录！'
  },
  'supply': {
    'title': '宝箱',
    'ready': '已就绪！',
    'readyIn': '下一份礼物：{time}',
    'biggerIn': '更大的礼物（+{n}）：{time}',
    'gift': '+{n}',
    'open': '打开',
    'coins': '+{n} 金币',
    'bonusCharge': '额外充能：{skill}'
  }
}
