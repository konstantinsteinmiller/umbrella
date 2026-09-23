// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: '第{n}行',
    daily: '每日',
    bossIn: '距首领{n}',
    best: '最佳{n}',
    todayBest: '今日{n}',
    shields: '护盾次数：{n}',
    revives: '复活次数：{n}',
    warcry: '战吼就绪：下一轮齐射伤害翻倍'
  },
  tray: {
    count: '{n}/{max}',
    aria: '球槽：{n}/{max}个球',
    slotAria: '{name}，{n}级',
    stackAria: '{name}，{n}级，×{count}',
    stackCount: '×{n}',
    tierOnly: '{n}级',
    plusOne: '+1',
    merged: '合成！',
    overflow: '球槽已满！+{n}金币'
  },
  upgrades: {
    title: '升级',
    damage: {
      name: '弹球伤害',
      short: '伤害',
      desc: '每个球的打击都更强。'
    },
    capacity: {
      name: '球槽容量',
      short: '容量',
      desc: '双胞胎合成前能容纳更多球。'
    },
    speed: {
      name: '发射速度',
      short: '速度',
      desc: '球飞得更快，发射更密集。'
    },
    luck: {
      name: '拾取幸运',
      short: '幸运',
      desc: '棋盘上出现更多金币和技能泡泡。'
    },
    bounty: {
      name: '金币赏金',
      short: '赏金',
      desc: '每只怪物掉落更多金币。'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}%',
      plusPercent: '+{n}%'
    },
    arrow: '{from} → {to}',
    max: '满级',
    free: '免费',
    aria: '{name}：{desc} 价格：{cost}金币。',
    ariaMaxed: '{name}：{desc} 已满级。',
    ariaFree: '{name}：{desc} 免费！'
  },
  turn: {
    bonus: '+{n}个球',
    bonusAdAria: '观看广告获得{n}个额外的球',
    bonusCoinAria: '花{cost}金币购买{n}个额外的球',
    recall: '收回弹球',
    speed: '×{n}',
    fastAria: '快进×{n}'
  },
  boss: {
    enraged: '狂暴！',
    hpAria: '{name}：生命值{hp}/{max}'
  },
  bosses: {
    'slime-tower': '史莱姆塔',
    worm: '巨型蠕虫',
    'fire-dragon': '烈焰巨龙',
    'silver-dragon': '银龙',
    troll: '巨魔之王',
    orc: '兽人督军'
  },
  monsters: {
    slime: {
      name: '史莱姆',
      rule: '普普通通的一团黏液。'
    },
    goblin: {
      name: '哥布林',
      rule: '每回合向旁边跳一列。'
    },
    caterpillar: {
      name: '毛毛虫',
      rule: '占两格宽，格外耐打。'
    },
    ogre: {
      name: '食人魔',
      rule: '双倍生命。粉碎球对它造成三倍伤害。'
    },
    dryad: {
      name: '树精',
      rule: '每回合治疗相邻的怪物——先打她！'
    },
    centaur: {
      name: '半人马',
      rule: '吐出淤泥，封住一格一回合。'
    },
    imp: {
      name: '小恶魔',
      rule: '被击败后分裂成两只迷你小恶魔。'
    },
    treant: {
      name: '树人',
      rule: '缓慢但坚韧：每两回合才前进一次。'
    },
    carbuncle: {
      name: '宝石兽',
      rule: '宝石护盾每回合挡下第一次攻击。'
    },
    cyclops: {
      name: '独眼巨人',
      rule: '每两回合冲锋两行——注意箭头！'
    },
    corrupted: {
      name: '腐化',
      rule: '精英怪物：更耐打，但金币翻三倍。'
    }
  },
  banners: {
    bossIncoming: '首领来袭！',
    enraged: '{name}狂暴了！',
    enragedSub: '现在每回合前进两行！',
    checkpoint: '检查点！',
    checkpointSub: '已在第{n}行保存重开点',
    fever: '狂热！',
    feverSub: '金币翻倍！',
    combo: '连击',
    comboHits: '×{n}',
    newMonster: '新怪物',
    shieldBlocked: '护盾挡住了！',
    meteorStorm: '流星风暴！',
    revived: '复活了！'
  },
  skills: {
    meteor: {
      name: '陨石',
      effect: '陨石砸向所有怪物！'
    },
    warcry: {
      name: '战吼',
      effect: '下一轮齐射伤害翻倍！'
    },
    legion: {
      name: '军团召唤',
      effect: '本轮齐射+3个幽灵球！'
    },
    pact: {
      name: '灵魂契约',
      effect: '你最强的球被复制了！'
    },
    shield: {
      name: '护盾纹章',
      effect: '抵挡下一次突破。'
    },
    execute: {
      name: '处决印记',
      effect: '最耐打的怪物倒下了！'
    },
    heal: {
      name: '治疗',
      effect: '怪物被击退一行！'
    },
    revive: {
      name: '复活',
      effect: '+1次免费继续。'
    }
  },
  abilities: {
    burn: {
      name: '灼烧',
      desc: '齐射结束后仍持续燃烧。'
    },
    knockback: {
      name: '击退',
      desc: '把怪物往上推一行。'
    },
    pierce: {
      name: '穿透',
      desc: '穿过击中的第一只怪物。'
    },
    freeze: {
      name: '冰冻',
      desc: '怪物跳过下一次前进。'
    },
    splash: {
      name: '溅射',
      desc: '把伤害溅到相邻怪物。'
    },
    crush: {
      name: '粉碎',
      desc: '对食人魔和首领造成三倍伤害。'
    },
    chain: {
      name: '连锁',
      desc: '闪电再跳向两只怪物。'
    },
    poison: {
      name: '剧毒',
      desc: '可叠加的毒每回合造成伤害。'
    },
    midas: {
      name: '点金',
      desc: '每次命中额外获得金币。'
    },
    eruption: {
      name: '喷发',
      desc: '每命中几次就在3×3范围爆炸。'
    }
  },
  breach: {
    title: '防线失守！',
    body: '怪物在第{n}行突破了防线。',
    meteor: '流星风暴',
    meteorDesc: '清除最下面两行，继续战斗',
    meteorAdAria: '观看广告：流星风暴清除最下面两行',
    meteorCoinAria: '花{cost}金币使用流星风暴：清除最下面两行',
    revive: '复活',
    reviveDesc: '使用一次复活（剩余{n}次）',
    free: '免费',
    restart: '从第{n}行重新开始',
    restartDesc: '保留你所有的金币',
    onceHint: '每个检查点只能使用一次流星风暴。'
  },
  chest: {
    title: '击败首领！',
    titleFirst: '击败了第一个首领！',
    defeated: '击败了{name}！',
    amount: '+{n}',
    doubled: '赏金翻倍！',
    checkpoint: '已在第{n}行保存检查点',
    double: '2×',
    doubleAdAria: '观看广告让赏金翻倍',
    doubleCoinAria: '花{cost}金币让赏金翻倍',
    collect: '领取'
  },
  daily: {
    today: '今日棋盘：{date}',
    bestLabel: '今日最佳',
    attemptsLabel: '尝试次数',
    streakLabel: '连续天数',
    active: '每日挑战进行中',
    keepPlaying: '继续游戏',
    quit: '退出每日挑战',
    playAgain: '再玩一次',
    back: '返回无尽模式',
    resultTitle: '每日挑战结束',
    resultRow: '第{n}行',
    waitTurn: '完成本回合后即可开始每日棋盘。'
  },
  collection: {
    cosmetic: '纯外观——绝不改变你的实力。',
    unknown: '???',
    selectedAria: '{name}，已选择',
    selectAria: '选择{name}',
    buyAria: '花{cost}金币购买{name}'
  },
  supply: {
    ready: '宝箱准备好了——点一下打开！'
  },
  codex: {
    title: '弹球图鉴',
    progress: '已发现{n} / {total}',
    damage: '伤害×{n}',
    locked: '合成两个{n}级球来发现它！'
  },
  tutorial: {
    aim: '向后拖动再松开来发射！',
    pickup: '射穿+1泡泡来收集一个球！',
    merge: '再收集一个球：球槽满了，双胞胎就会合成更强的球！',
    upgrade: '点击免费升级来容纳更多的球！'
  },
  coach: {
    survive: '怪物马上要冲破防线了——先打最下面的！',
    tray: '球槽满了：只有还有空位时，+1 才会多一发。升级球槽容量，发射更多的球！',
    combo: '瞄准空隙：在怪物后方弹跳的球能打出超大连击！',
    trayIntro: '球槽里装着你的球：每个球就是一发。+1 会填满一个空位，球槽满了时，两颗双胞胎会合成一颗更强的球。',
    upgrade: '点一下发光的升级：它会让你的球、球槽或金币变得更好。'
  },
  unlock: {
    announce: '已解锁：{name}！'
  }
}
