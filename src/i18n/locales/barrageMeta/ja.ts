// Umbrella meta strings ('barrageMeta' namespace: achievements, pass, collections, daily, supply drop).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  'achievements': {
    'title': '実績',
    'subtitle': '永続の目標を達成してコインを獲得しよう。',
    'claim': '受け取る',
    'claimed': '受取済み',
    'unlocked': '実績達成！',
    'progress': '{c} / {t}',
    'items': {
      'kills100': '最初の百体',
      'kills1k': 'モンスタースレイヤー',
      'kills10k': '殲滅者',
      'row10': '戦いの渦へ',
      'row30': '深き包囲',
      'row60': '鉄壁',
      'row100': '深淵の伝説',
      'boss1': '巨人殺し',
      'boss10': 'ボスハンター',
      'boss50': '王殺し',
      'merges10': 'ツインパワー',
      'merges100': '合体マスター',
      'merges500': '融合の炉',
      'tier3': '最初の火花',
      'tier5': '昇る元素',
      'tier7': '元素の力',
      'tier9': '原初の力',
      'combo25': '跳弾',
      'combo50': '連鎖反応',
      'combo150': 'ピンボールの魔術師',
      'fever1': 'フィーバー！',
      'fevers25': '虹色ラッシュ'
    },
    'desc': {
      'kills': '倒したモンスター：{n}',
      'bestRow': '{n}段目に到達',
      'bossKills': '倒したボス：{n}',
      'merges': 'ボール合体：{n}回',
      'maxBallTier': 'ティア{n}のボールを作る',
      'bestCombo': '1斉射のヒット数：{n}',
      'fevers': 'フィーバー斉射：{n}回'
    }
  },
  'pass': {
    'title': 'バラージパス',
    'progress': 'ティア {current} / {total}',
    'daysLeft': '残り{n}日',
    'maxed': 'パス完了',
    'xpProgress': '{current} / {total} XP',
    'xpAmount': '+{n} XP',
    'howToEarn': 'XPの獲得方法',
    'perKill': '撃破ごと',
    'perMerge': '合体ごと',
    'perRow': '1段ごと',
    'perBoss': 'ボスごと',
    'unlockHint': '{n} XP貯めると次の報酬が解放されます。未受け取りの報酬はタップするまで残ります。',
    'ballReward': 'ティア{tier}のボール無料'
  },
  'collections': {
    'title': 'コレクション',
    'launchers': 'ランチャー',
    'skins': 'ボールスキン',
    'buy': '購入',
    'equip': '装備',
    'equipped': '装備中',
    'new': 'NEW!',
    'undiscovered': '未発見',
    'discoverHint': 'ティア{tier}のボールを合体させて発見しよう',
    'tier': 'ティア{tier}',
    'rarity': {
      'common': 'コモン',
      'rare': 'レア',
      'epic': 'エピック',
      'legendary': 'レジェンダリー'
    },
    'skinNames': {
      'orb': 'ガラスオーブ',
      'stone': '石',
      'tide': '潮',
      'gale': '疾風',
      'frost': '霜',
      'amber': '琥珀',
      'lava': '溶岩',
      'diamond': 'ダイヤモンド',
      'obsidian': '黒曜石',
      'glow': '光るルーン',
      'gilded': '黄金',
      'eclipse': '日食'
    }
  },
  'daily': {
    'title': 'デイリーバラージ',
    'subtitle': '今日は全員が同じ盤面。どこまで深く進める？',
    'rules': 'アップグレードもコンティニューもなし。腕前だけが頼り。',
    'play': 'プレイ',
    'best': '今日のベスト：{n}段',
    'attempts': '今日の挑戦回数：{n}',
    'streak': '連続日数：{n}',
    'newBest': '今日の新記録！'
  },
  'supply': {
    'title': '宝箱',
    'ready': '準備完了！',
    'readyIn': '次のプレゼントまで {time}',
    'biggerIn': 'もっと大きなプレゼント（+{n}）まで {time}',
    'gift': '+{n}',
    'open': '開ける',
    'coins': '+{n} コイン',
    'bonusCharge': 'ボーナスチャージ：{skill}'
  }
}
