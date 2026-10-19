// Umbrella gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: '{n}列目',
    daily: 'デイリー',
    bossIn: 'ボスまで{n}',
    best: '最高{n}',
    todayBest: '今日{n}',
    shields: 'シールド: {n}',
    revives: '復活: {n}',
    warcry: 'ウォークライ準備完了：次の一斉射撃はダメージ2倍',
    coinGain: '+{n}',
    rank: '世界ランキング'
  },
  tray: {
    count: '{n}/{max}',
    aria: 'ボールトレイ: {n}/{max}個',
    slotAria: '{name}、レベル{n}',
    stackAria: '{name}、レベル{n}、×{count}',
    stackCount: '×{n}',
    tierOnly: 'レベル{n}',
    plusOne: '+1',
    merged: '合体！',
    overflow: 'トレイ満杯！ +{n}コイン',
    pickupSr: '「+1」はトレイのボールが1つ増えること：毎回の一斉射撃で1発多く、ダメージアップ。'
  },
  upgrades: {
    title: 'アップグレード',
    damage: {
      name: 'ボール攻撃力',
      short: '攻撃力',
      desc: 'すべてのボールの威力が上がる。'
    },
    capacity: {
      name: 'トレイ容量',
      short: '容量',
      desc: 'トレイに入るボールが増える：毎ターンの発射数が増える。'
    },
    speed: {
      name: '発射速度',
      short: '速度',
      desc: 'ボールがより速く飛び、威力も上がる。'
    },
    luck: {
      name: '拾得運',
      short: '運',
      desc: '盤面のコインとスキルの泡が増える。'
    },
    bounty: {
      name: 'コイン報酬',
      short: '報酬',
      desc: 'モンスターから得るコインが増える。'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}%'
    },
    arrow: '{from} → {to}',
    max: 'MAX',
    free: '無料',
    aria: '{name}：{desc} 価格：{cost}コイン',
    ariaMaxed: '{name}：{desc} 最大まで強化済み',
    ariaFree: '{name}：{desc} 無料！',
    denied: 'コインが足りません：{cost}コイン必要です。',
    need: 'あと{n}必要'
  },
  turn: {
    bonus: 'ボール+{n}',
    bonusAdAria: '広告を見てボールを{n}個追加',
    bonusCoinAria: '{cost}コインでボールを{n}個追加',
    recall: 'ボールを回収',
    speed: '×{n}',
    fastAria: '早送り×{n}'
  },
  boss: {
    enraged: '激怒！',
    hpAria: '{name}：HP {hp}/{max}'
  },
  bosses: {
    'slime-tower': 'スライムタワー',
    worm: 'ジャイアントワーム',
    'fire-dragon': 'ファイアドラゴン',
    'silver-dragon': 'シルバードラゴン',
    troll: 'トロルキング',
    orc: 'オーク将軍'
  },
  monsters: {
    slime: {
      name: 'スライム',
      rule: 'ごく普通のぷよぷよ。'
    },
    goblin: {
      name: 'ゴブリン',
      rule: '毎ターン横に1列ジャンプする。'
    },
    caterpillar: {
      name: 'イモムシ',
      rule: '2マス分の幅で、とても頑丈。'
    },
    ogre: {
      name: 'オーガ',
      rule: 'HP2倍。粉砕ボールは3倍のダメージ。'
    },
    dryad: {
      name: 'ドリアード',
      rule: '毎ターン隣を回復する。先に倒そう！'
    },
    centaur: {
      name: 'ケンタウロス',
      rule: '泥を吐いて1ターンだけマスをふさぐ。'
    },
    imp: {
      name: 'インプ',
      rule: '倒すと小さなインプ2体に分裂する。'
    },
    treant: {
      name: 'トレント',
      rule: '遅いけれど頑丈。2ターンに1回だけ進む。'
    },
    carbuncle: {
      name: 'カーバンクル',
      rule: '宝石のシールドが毎ターン最初の一撃を防ぐ。'
    },
    cyclops: {
      name: 'サイクロプス',
      rule: '2ターンに1回、2列突進する。矢印に注意！'
    },
    corrupted: {
      name: '堕落種',
      rule: 'エリートモンスター：より頑丈だがコインは3倍。'
    }
  },
  banners: {
    bossIncoming: 'ボス接近！',
    enraged: '{name}が激怒！',
    enragedSub: '1ターンに2列進むようになった！',
    checkpoint: 'チェックポイント！',
    checkpointSub: '{n}列目に再開地点を保存',
    fever: 'フィーバー！',
    feverSub: 'コイン2倍！',
    combo: 'コンボ',
    comboHits: '×{n}',
    newMonster: '新モンスター',
    shieldBlocked: 'シールドで防いだ！',
    meteorStorm: 'メテオストーム！',
    revived: '復活！'
  },
  skills: {
    meteor: {
      name: 'メテオ',
      effect: 'すべてのモンスターに隕石が降る！'
    },
    warcry: {
      name: 'ウォークライ',
      effect: '次の一斉射撃はダメージ2倍！'
    },
    legion: {
      name: 'レギオンコール',
      effect: 'この射撃でゴーストボール+3！'
    },
    pact: {
      name: 'ソウルパクト',
      effect: '一番強いボールをコピーした！'
    },
    shield: {
      name: 'シールドクレスト',
      effect: '次の突破を1回防ぐ。'
    },
    execute: {
      name: '処刑の刻印',
      effect: '一番頑丈なモンスターが倒れた！'
    },
    heal: {
      name: 'ヒール',
      effect: 'モンスターを1列押し戻した！'
    },
    revive: {
      name: 'リバイブ',
      effect: '無料コンティニュー+1。'
    }
  },
  abilities: {
    burn: {
      name: '炎上',
      desc: '射撃のあとも燃え続ける。'
    },
    knockback: {
      name: 'ノックバック',
      desc: 'モンスターを1列押し上げる。'
    },
    pierce: {
      name: '貫通',
      desc: '最初に当たったモンスターを貫く。'
    },
    freeze: {
      name: '凍結',
      desc: 'モンスターは次の前進を休む。'
    },
    splash: {
      name: 'スプラッシュ',
      desc: '隣のモンスターにもダメージ。'
    },
    crush: {
      name: '粉砕',
      desc: 'オーガとボスに3倍ダメージ。'
    },
    chain: {
      name: '連鎖',
      desc: '雷がさらに2体へ飛び移る。'
    },
    poison: {
      name: '毒',
      desc: '重なる毒が毎ターンダメージ。'
    },
    midas: {
      name: 'ミダス',
      desc: '命中ごとにボーナスコイン。'
    },
    eruption: {
      name: '噴火',
      desc: '数回ごとに3×3範囲で爆発。'
    }
  },
  breach: {
    title: '突破された！',
    wasted: '力尽きた',
    body: 'モンスターが{n}列目で防衛線を突破した。',
    bodyBy: '{n}列目で突破：{name}',
    meteor: 'メテオストーム',
    meteorDesc: '下の2列を一掃して続行',
    meteorAdAria: '広告を見る：メテオストームで下の2列を一掃',
    meteorCoinAria: '{cost}コインでメテオストーム：下の2列を一掃',
    revive: '復活する',
    reviveDesc: '復活を1回使う（残り{n}）',
    free: '無料',
    restart: '{n}列目から再開',
    restartDesc: 'コインはすべてそのまま',
    onceHint: 'メテオストームはチェックポイントごとに1回。',
    recapRow: '列',
    recapKills: '撃破',
    recapEarned: '今回の獲得',
    recapAria: '今回: {row}列目、撃破{kills}、獲得コイン{coins}'
  },
  chest: {
    title: 'ボス撃破！',
    titleFirst: '初めてのボス撃破！',
    defeated: '{name}を撃破！',
    amount: '+{n}',
    boosted: '報酬{n}倍！',
    checkpoint: '{n}列目にチェックポイントを保存',
    boost: '{n}×',
    boostAdAria: '広告を見て報酬を{n}倍にする',
    boostCoinAria: '{cost}コインで報酬を{n}倍にする',
    collect: '受け取る',
    powerUp: 'パワーアップ！'
  },
  daily: {
    today: '今日の盤面：{date}',
    bestLabel: '今日の最高',
    attemptsLabel: '挑戦回数',
    streakLabel: '連続日数',
    active: 'デイリー挑戦中',
    keepPlaying: '続ける',
    quit: 'デイリーをやめる',
    playAgain: 'もう一度',
    back: 'エンドレスに戻る',
    resultTitle: 'デイリー終了',
    resultRow: '{n}列目',
    waitTurn: 'ターンを終えるとデイリー盤面を始められます。'
  },
  collection: {
    cosmetic: '見た目だけ。強さは変わりません。',
    unknown: '???',
    selectedAria: '{name}、選択中',
    selectAria: '{name}を選択',
    buyAria: '{name}を{cost}コインで購入',
    adProgress: '{n}/{max}',
    adAria: '広告を見て{name}をアンロック',
    adProgressAria: '{name}の広告を見る（{max}回中{n}回視聴済み）',
    adUnlock: 'アンロック'
  },
  supply: {
    ready: '宝箱の準備完了！タップで開ける',
    filling: '{name}：あと{time}でコイン+{n}'
  },
  codex: {
    title: 'ボール図鑑',
    progress: '{n} / {total} 発見',
    damage: 'ダメージ×{n}',
    locked: 'レベル{n}のボールを2つ合体させて発見しよう！'
  },
  tutorial: {
    aim: 'モンスターの方へドラッグして、離すと発射！',
    pickup: '+1の泡を撃ち抜いてボールを拾おう！',
    merge: 'もう1個拾おう：トレイが満杯になると、ふたごが合体して強いボールになる！',
    upgrade: '無料アップグレードをタップしてボールを増やそう！'
  },
  prompt: {
    tapToShoot: 'タップで発射',
    clickToShoot: 'クリックで発射'
  },
  coach: {
    survive: 'モンスターが突破しそう！一番下のものから倒そう！',
    tray: 'トレイが満杯：空きがあるときだけ、+1で発射数が増えるよ。トレイ容量をアップグレードして、もっとたくさん撃とう！',
    combo: 'すき間を狙おう：モンスターの裏で跳ね回るボールが大コンボを生む！',
    trayIntro: 'このトレイにはボールが入っている：1個が1発。+1は空きスロットを埋め、満杯のトレイではふたごが合体してより強いボールになる。',
    upgrade: '光っているアップグレードをタップしよう：ボール、トレイ、コインが強くなる。',
    bank: '斜めに狙おう：壁で跳ね返ったボールは一発で何体ものモンスターに当たる！',
    funnel: '{name}を買えるようになりました。タップすると、すべてのボールの威力が上がります！',
    skipAria: 'レッスンをスキップ',
    // The spotlight lessons (sr-only; the screen stages them).
    spot: {
      threat: 'そばのカウントダウンは、一番近いモンスターが突破するまでのターン数。ゼロになる前に倒そう！',
      speed: '{name}：ボールが速く飛び、1回の命中ダメージが上がる。',
      luck: '{name}：新しい列にコインとスキルの泡が増える。',
      bounty: '{name}：倒したモンスターからもらえるコインが増える。'
    }
  },
  merge: {
    sr: 'レベル{from}のボール2つが合体して、レベル{to}のボールになりました！トレイのボール1つが1発の弾です。',
    discovery: '新しいボール: {name}。能力: {ability} — {desc}',
    skipAria: '合体をスキップ'
  },
  unlock: {
    announce: '解放：{name}！'
  }
}
