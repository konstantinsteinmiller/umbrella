// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: 'Hàng {n}',
    daily: 'Hằng ngày',
    bossIn: 'Trùm sau {n}',
    best: 'Kỷ lục {n}',
    todayBest: 'Hôm nay {n}',
    shields: 'Lượt khiên: {n}',
    revives: 'Lượt hồi sinh: {n}',
    warcry: 'Chiến hống sẵn sàng: loạt bắn kế tiếp gây sát thương gấp đôi',
    coinGain: '+{n}',
    rank: 'Xếp hạng toàn cầu'
  },
  tray: {
    count: '{n}/{max}',
    aria: 'Khay bóng: {n}/{max} quả',
    slotAria: '{name}, cấp {n}',
    stackAria: '{name}, cấp {n}, ×{count}',
    stackCount: '×{n}',
    tierOnly: 'Cấp {n}',
    plusOne: '+1',
    merged: 'Hợp nhất!',
    overflow: 'Khay đầy! +{n} xu',
    pickupSr: '"+1" là thêm một bóng trong khay: mỗi loạt bắn thêm một phát, sát thương cao hơn.'
  },
  upgrades: {
    title: 'Nâng cấp',
    damage: {
      name: 'Sát thương bóng',
      short: 'Sát thương',
      desc: 'Mỗi quả bóng đánh mạnh hơn.'
    },
    capacity: {
      name: 'Sức chứa khay',
      short: 'Sức chứa',
      desc: 'Khay chứa nhiều bóng hơn: bắn nhiều hơn mỗi lượt.'
    },
    speed: {
      name: 'Tốc độ phóng',
      short: 'Tốc độ',
      desc: 'Bóng bay nhanh hơn và đánh mạnh hơn.'
    },
    luck: {
      name: 'May mắn nhặt đồ',
      short: 'May mắn',
      desc: 'Nhiều bong bóng xu và kỹ năng hơn trên bàn.'
    },
    bounty: {
      name: 'Thưởng xu',
      short: 'Thưởng',
      desc: 'Nhận nhiều xu hơn từ mỗi quái vật.'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}%'
    },
    arrow: '{from} → {to}',
    max: 'TỐI ĐA',
    free: 'Miễn phí',
    aria: '{name}: {desc} Giá: {cost} xu.',
    ariaMaxed: '{name}: {desc} Đã tối đa.',
    ariaFree: '{name}: {desc} Miễn phí!',
    denied: 'Không đủ xu: cần {cost}.',
    need: 'Cần thêm {n}'
  },
  turn: {
    bonus: '+{n} bóng',
    bonusAdAria: 'Xem quảng cáo để nhận thêm {n} quả bóng',
    bonusCoinAria: 'Mua thêm {n} quả bóng với {cost} xu',
    recall: 'Thu hồi bóng',
    speed: '×{n}',
    fastAria: 'Tua nhanh ×{n}'
  },
  boss: {
    enraged: 'Nổi điên!',
    hpAria: '{name}: {hp}/{max} máu'
  },
  bosses: {
    'slime-tower': 'Tháp Chất Nhờn',
    worm: 'Sâu Khổng Lồ',
    'fire-dragon': 'Rồng Lửa',
    'silver-dragon': 'Rồng Bạc',
    troll: 'Vua Troll',
    orc: 'Lãnh Chúa Orc'
  },
  monsters: {
    slime: {
      name: 'Chất nhờn',
      rule: 'Một cục nhầy bình thường.'
    },
    goblin: {
      name: 'Yêu tinh',
      rule: 'Mỗi lượt nhảy sang ngang một cột.'
    },
    caterpillar: {
      name: 'Sâu bướm',
      rule: 'Rộng hai ô và cực kỳ lì lợm.'
    },
    ogre: {
      name: 'Chằn tinh',
      rule: 'Máu gấp đôi. Bóng nghiền gây sát thương gấp ba lên nó.'
    },
    dryad: {
      name: 'Tiên cây',
      rule: 'Hồi máu cho hàng xóm mỗi lượt — hãy đánh cô ta trước!'
    },
    centaur: {
      name: 'Nhân mã',
      rule: 'Phun bùn chặn một ô trong một lượt.'
    },
    imp: {
      name: 'Tiểu quỷ',
      rule: 'Khi bị hạ sẽ tách thành hai tiểu quỷ nhỏ.'
    },
    treant: {
      name: 'Người cây',
      rule: 'Chậm nhưng bền: cứ hai lượt mới tiến một lần.'
    },
    carbuncle: {
      name: 'Thú ngọc',
      rule: 'Khiên ngọc chặn đòn đầu tiên mỗi lượt.'
    },
    cyclops: {
      name: 'Khổng lồ một mắt',
      rule: 'Cứ hai lượt lại lao xuống hai hàng — coi chừng mũi tên!'
    },
    corrupted: {
      name: 'Tha hóa',
      rule: 'Quái tinh anh: lì hơn nhưng cho gấp ba xu.'
    }
  },
  banners: {
    bossIncoming: 'Trùm đang đến!',
    enraged: '{name} nổi điên!',
    enragedSub: 'Giờ nó tiến hai hàng mỗi lượt!',
    checkpoint: 'Điểm lưu!',
    checkpointSub: 'Đã lưu điểm chơi lại ở hàng {n}',
    fever: 'Cuồng nhiệt!',
    feverSub: 'Xu gấp đôi!',
    combo: 'Combo',
    comboHits: '×{n}',
    newMonster: 'Quái vật mới',
    shieldBlocked: 'Khiên đã chặn!',
    meteorStorm: 'Mưa thiên thạch!',
    revived: 'Hồi sinh!'
  },
  skills: {
    meteor: {
      name: 'Thiên thạch',
      effect: 'Thiên thạch giáng xuống mọi quái vật!'
    },
    warcry: {
      name: 'Chiến hống',
      effect: 'Loạt bắn kế tiếp gây sát thương gấp đôi!'
    },
    legion: {
      name: 'Hiệu triệu quân đoàn',
      effect: '+3 bóng ma trong loạt bắn này!'
    },
    pact: {
      name: 'Khế ước linh hồn',
      effect: 'Quả bóng tốt nhất của bạn đã được sao chép!'
    },
    shield: {
      name: 'Huy hiệu khiên',
      effect: 'Chặn lần phá tuyến kế tiếp.'
    },
    execute: {
      name: 'Dấu đao phủ',
      effect: 'Quái vật lì nhất gục ngã!'
    },
    heal: {
      name: 'Hồi phục',
      effect: 'Quái vật bị đẩy lùi một hàng!'
    },
    revive: {
      name: 'Hồi sinh',
      effect: '+1 lượt chơi tiếp miễn phí.'
    }
  },
  abilities: {
    burn: {
      name: 'Thiêu đốt',
      desc: 'Đòn đánh tiếp tục cháy sau loạt bắn.'
    },
    knockback: {
      name: 'Đẩy lùi',
      desc: 'Đẩy quái vật lên một hàng.'
    },
    pierce: {
      name: 'Xuyên thủng',
      desc: 'Xuyên qua quái vật đầu tiên trúng phải.'
    },
    freeze: {
      name: 'Đóng băng',
      desc: 'Quái vật bỏ lượt tiến tiếp theo.'
    },
    splash: {
      name: 'Văng tóe',
      desc: 'Làm văng sát thương sang hàng xóm.'
    },
    crush: {
      name: 'Nghiền nát',
      desc: 'Sát thương gấp ba lên chằn tinh và trùm.'
    },
    chain: {
      name: 'Dây chuyền',
      desc: 'Sét nhảy sang thêm hai quái vật.'
    },
    poison: {
      name: 'Độc',
      desc: 'Độc cộng dồn gây sát thương mỗi lượt.'
    },
    midas: {
      name: 'Midas',
      desc: 'Thêm xu với mỗi đòn trúng.'
    },
    eruption: {
      name: 'Phun trào',
      desc: 'Cứ vài đòn lại nổ tung trên vùng 3×3.'
    }
  },
  breach: {
    title: 'Bị tràn tuyến!',
    wasted: 'Gục ngã',
    body: 'Quái vật đã phá tuyến ở hàng {n}.',
    bodyBy: 'Phá tuyến ở hàng {n}: {name}',
    meteor: 'Mưa thiên thạch',
    meteorDesc: 'Dọn sạch hai hàng dưới cùng và chơi tiếp',
    meteorAdAria: 'Xem quảng cáo: Mưa thiên thạch dọn sạch hai hàng dưới cùng',
    meteorCoinAria: 'Mưa thiên thạch với {cost} xu: dọn sạch hai hàng dưới cùng',
    revive: 'Hồi sinh',
    reviveDesc: 'Dùng một lượt hồi sinh (còn {n})',
    free: 'Miễn phí',
    restart: 'Chơi lại từ hàng {n}',
    restartDesc: 'Giữ nguyên toàn bộ xu',
    onceHint: 'Mưa thiên thạch chỉ dùng một lần mỗi điểm lưu.',
    recapRow: 'Hàng',
    recapKills: 'Hạ gục',
    recapEarned: 'Kiếm được lượt này',
    recapAria: 'Lượt này: hàng {row}, hạ gục {kills}, kiếm được {coins} xu'
  },
  chest: {
    title: 'Hạ gục trùm!',
    titleFirst: 'Hạ gục trùm đầu tiên!',
    defeated: 'Đã hạ {name}!',
    amount: '+{n}',
    boosted: 'Thưởng ×{n}!',
    checkpoint: 'Đã lưu điểm ở hàng {n}',
    boost: '{n}×',
    boostAdAria: 'Xem quảng cáo để nhận thưởng gấp {n}',
    boostCoinAria: 'Thưởng gấp {n} với {cost} xu',
    collect: 'Nhận',
    powerUp: 'Nâng cấp!'
  },
  daily: {
    today: 'Bàn hôm nay: {date}',
    bestLabel: 'Kỷ lục hôm nay',
    attemptsLabel: 'Lượt thử',
    streakLabel: 'Chuỗi ngày',
    active: 'Đang chơi lượt hằng ngày',
    keepPlaying: 'Chơi tiếp',
    quit: 'Rời lượt hằng ngày',
    playAgain: 'Chơi lại',
    back: 'Về chế độ vô tận',
    resultTitle: 'Hết lượt hằng ngày',
    resultRow: 'Hàng {n}',
    waitTurn: 'Hãy xong lượt để bắt đầu bàn hằng ngày.'
  },
  collection: {
    cosmetic: 'Chỉ để trang trí — không bao giờ đổi sức mạnh.',
    unknown: '???',
    selectedAria: '{name}, đã chọn',
    selectAria: 'Chọn {name}',
    buyAria: 'Mua {name} với {cost} xu',
    adProgress: '{n}/{max}',
    adAria: 'Xem quảng cáo để mở khóa {name}',
    adProgressAria: 'Xem quảng cáo cho {name} (đã xem {n}/{max})'
  },
  supply: {
    ready: 'Rương kho báu đã sẵn sàng — chạm để mở!',
    filling: '{name}: +{n} xu sau {time}'
  },
  codex: {
    title: 'Sách bóng',
    progress: 'Đã khám phá {n} / {total}',
    damage: 'Sát thương ×{n}',
    locked: 'Hợp nhất hai quả bóng cấp {n} để khám phá!'
  },
  tutorial: {
    aim: 'Kéo về phía quái vật rồi thả để bắn!',
    pickup: 'Bắn xuyên qua bong bóng +1 để nhặt thêm bóng!',
    merge: 'Nhặt thêm một quả: khay đầy sẽ hợp nhất cặp song sinh thành bóng mạnh hơn!',
    upgrade: 'Chạm vào nâng cấp miễn phí để chứa nhiều bóng hơn!'
  },
  prompt: {
    tapToShoot: 'Chạm để bắn',
    clickToShoot: 'Nhấp để bắn'
  },
  coach: {
    survive: 'Quái vật sắp phá vỡ phòng tuyến — hãy bắn những con thấp nhất trước!',
    tray: 'Khay của bạn đã đầy: +1 chỉ thêm một phát bắn khi còn ô trống. Nâng cấp sức chứa khay để bắn nhiều bóng hơn!',
    combo: 'Ngắm qua khe hở: bóng nảy phía sau quái vật tạo combo cực lớn!',
    trayIntro: 'Khay này chứa bóng của bạn: mỗi quả là một phát bắn. +1 lấp một ô trống, và khay đầy sẽ hợp nhất hai quả sinh đôi thành một quả mạnh hơn.',
    upgrade: 'Chạm vào nâng cấp đang sáng: nó làm bóng, khay hoặc xu của bạn tốt hơn.',
    bank: 'Ngắm chéo: bóng nảy vào tường có thể trúng nhiều quái vật chỉ với một phát!',
    funnel: 'Giờ bạn đã đủ xu mua {name} — chạm vào để mọi quả bóng đánh mạnh hơn!',
    skipAria: 'Bỏ qua bài học',
    // The spotlight lessons (sr-only; the screen stages them).
    spot: {
      threat: 'Bộ đếm ngược cạnh bạn đếm số lượt đến khi con quái gần nhất phá vỡ phòng tuyến — hãy bắn nó trước khi về 0!',
      speed: '{name}: bóng của bạn bay nhanh hơn và mỗi cú đánh gây nhiều sát thương hơn.',
      luck: '{name}: các hàng mới mang theo nhiều bong bóng xu và kỹ năng hơn.',
      bounty: '{name}: mỗi quái vật bị hạ cho nhiều xu hơn.'
    }
  },
  merge: {
    sr: 'Hai quả bóng cấp {from} đã hợp nhất thành một quả bóng cấp {to}! Mỗi quả bóng trong khay là một phát bắn.',
    discovery: 'Bóng mới: {name}. Kỹ năng: {ability} — {desc}',
    skipAria: 'Bỏ qua hợp nhất'
  },
  unlock: {
    announce: 'Đã mở khóa: {name}!'
  }
}
