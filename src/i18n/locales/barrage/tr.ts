// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: 'Sıra {n}',
    daily: 'Günlük',
    bossIn: 'Boss {n} sıra sonra',
    best: 'Rekor {n}',
    todayBest: 'Bugün {n}',
    shields: 'Kalkan yükü: {n}',
    revives: 'Diriliş yükü: {n}',
    warcry: 'Savaş çığlığı hazır: sonraki atışın iki kat hasar verir',
    coinGain: '+{n}',
    rank: 'Dünya sıralaması'
  },
  tray: {
    count: '{n}/{max}',
    aria: 'Top tepsisi: {n}/{max} top',
    slotAria: '{name}, seviye {n}',
    stackAria: '{name}, seviye {n}, ×{count}',
    stackCount: '×{n}',
    tierOnly: 'Seviye {n}',
    plusOne: '+1',
    merged: 'Birleşti!',
    overflow: 'Tepsi dolu! +{n} para',
    pickupSr: '"+1" tepsinde bir top daha demek: her atışta bir mermi daha, daha çok hasar.'
  },
  upgrades: {
    title: 'Geliştirmeler',
    damage: {
      name: 'Top hasarı',
      short: 'Hasar',
      desc: 'Her top daha sert vurur.'
    },
    capacity: {
      name: 'Tepsi kapasitesi',
      short: 'Kapasite',
      desc: 'Tepside daha çok top: her turda daha çok atış.'
    },
    speed: {
      name: 'Atış hızı',
      short: 'Hız',
      desc: 'Toplar daha hızlı uçar ve daha sert vurur.'
    },
    luck: {
      name: 'Toplama şansı',
      short: 'Şans',
      desc: 'Tahtada daha çok para ve yetenek balonu.'
    },
    bounty: {
      name: 'Para ödülü',
      short: 'Ödül',
      desc: 'Her canavardan daha çok para kazan.'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '%{n}'
    },
    arrow: '{from} → {to}',
    max: 'MAKS',
    free: 'Bedava',
    aria: '{name}: {desc} Fiyat: {cost} para.',
    ariaMaxed: '{name}: {desc} Tamamen geliştirildi.',
    ariaFree: '{name}: {desc} Bedava!',
    denied: 'Yeterli para yok: {cost} gerekiyor.',
    need: '{n} daha lazım'
  },
  turn: {
    bonus: '+{n} top',
    bonusAdAria: '{n} ekstra top için reklam izle',
    bonusCoinAria: '{cost} paraya {n} ekstra top al',
    recall: 'Topları geri çağır',
    speed: '×{n}',
    fastAria: 'Hızlı ileri ×{n}'
  },
  boss: {
    enraged: 'Öfkeli!',
    hpAria: '{name}: {hp}/{max} can'
  },
  bosses: {
    'slime-tower': 'Balçık Kulesi',
    worm: 'Dev Solucan',
    'fire-dragon': 'Ateş Ejderhası',
    'silver-dragon': 'Gümüş Ejderha',
    troll: 'Trol Kral',
    orc: 'Ork Savaş Lordu'
  },
  monsters: {
    slime: {
      name: 'Balçık',
      rule: 'Sıradan bir yapışkan top.'
    },
    goblin: {
      name: 'Goblin',
      rule: 'Her tur bir sütun yana zıplar.'
    },
    caterpillar: {
      name: 'Tırtıl',
      rule: 'İki kare genişliğinde ve çok dayanıklı.'
    },
    ogre: {
      name: 'Dev',
      rule: 'İki kat can. Ezici toplar ona üç kat hasar verir.'
    },
    dryad: {
      name: 'Driyad',
      rule: 'Her tur komşularını iyileştirir: önce ona vur!'
    },
    centaur: {
      name: 'Sentor',
      rule: 'Bir kareyi bir tur kapatan çamur tükürür.'
    },
    imp: {
      name: 'İblisçik',
      rule: 'Yenilince iki küçük iblisçiğe bölünür.'
    },
    treant: {
      name: 'Ağaçadam',
      rule: 'Yavaş ama dayanıklı: yalnızca iki turda bir ilerler.'
    },
    carbuncle: {
      name: 'Karbonkül',
      rule: 'Mücevher kalkanı her tur ilk vuruşu engeller.'
    },
    cyclops: {
      name: 'Tepegöz',
      rule: 'İki turda bir iki sıra hücum eder: oklara dikkat!'
    },
    corrupted: {
      name: 'Bozulmuş',
      rule: 'Elit canavarlar: daha dayanıklı ama üç kat para değerinde.'
    }
  },
  banners: {
    bossIncoming: 'Boss geliyor!',
    enraged: '{name} öfkelendi!',
    enragedSub: 'Artık her tur iki sıra ilerliyor!',
    checkpoint: 'Kontrol noktası!',
    checkpointSub: 'Yeniden başlama noktası {n}. sırada kaydedildi',
    fever: 'Ateş!',
    feverSub: 'İki kat para!',
    combo: 'Kombo',
    comboHits: '×{n}',
    newMonster: 'Yeni canavar',
    shieldBlocked: 'Kalkan engelledi!',
    meteorStorm: 'Meteor fırtınası!',
    revived: 'Dirildin!'
  },
  skills: {
    meteor: {
      name: 'Meteor',
      effect: 'Meteorlar her canavarı vurur!'
    },
    warcry: {
      name: 'Savaş çığlığı',
      effect: 'Sonraki atışın iki kat hasar verir!'
    },
    legion: {
      name: 'Lejyon çağrısı',
      effect: 'Bu atışta +3 hayalet top!'
    },
    pact: {
      name: 'Ruh anlaşması',
      effect: 'En iyi topun kopyalandı!'
    },
    shield: {
      name: 'Kalkan arması',
      effect: 'Bir sonraki yarılmayı emer.'
    },
    execute: {
      name: 'Cellat damgası',
      effect: 'En dayanıklı canavar düşer!'
    },
    heal: {
      name: 'Şifa',
      effect: 'Canavarlar bir sıra geri itildi!'
    },
    revive: {
      name: 'Diriliş',
      effect: '+1 bedava devam hakkı.'
    }
  },
  abilities: {
    burn: {
      name: 'Yanma',
      desc: 'İsabetler atıştan sonra da yanmaya devam eder.'
    },
    knockback: {
      name: 'Geri itme',
      desc: 'Canavarı bir sıra yukarı iter.'
    },
    pierce: {
      name: 'Delme',
      desc: 'Vurduğu ilk canavarın içinden geçer.'
    },
    freeze: {
      name: 'Dondurma',
      desc: 'Canavar bir sonraki ilerlemesini atlar.'
    },
    splash: {
      name: 'Sıçrama',
      desc: 'Hasarı komşulara sıçratır.'
    },
    crush: {
      name: 'Ezme',
      desc: 'Devlere ve bosslara üç kat hasar.'
    },
    chain: {
      name: 'Zincir',
      desc: 'Şimşek iki canavara daha sıçrar.'
    },
    poison: {
      name: 'Zehir',
      desc: 'Birikebilen zehir her tur hasar verir.'
    },
    midas: {
      name: 'Midas',
      desc: 'Her isabette bonus para.'
    },
    eruption: {
      name: 'Patlama',
      desc: 'Birkaç isabette bir 3×3 alanda patlama.'
    }
  },
  breach: {
    title: 'Yarıldı!',
    wasted: 'Yenildin',
    body: 'Canavarlar {n}. sırada hattı yardı.',
    bodyBy: '{n}. sırada hattı yaran: {name}',
    meteor: 'Meteor fırtınası',
    meteorDesc: 'Alttaki iki sırayı temizle ve devam et',
    meteorAdAria: 'Reklam izle: Meteor fırtınası alttaki iki sırayı temizler',
    meteorCoinAria: '{cost} paraya Meteor fırtınası: alttaki iki sırayı temizler',
    revive: 'Diril',
    reviveDesc: 'Bir diriliş yükü kullan ({n} kaldı)',
    free: 'Bedava',
    restart: '{n}. sıradan yeniden başla',
    restartDesc: 'Tüm paraların sende kalır',
    onceHint: 'Meteor fırtınası kontrol noktası başına bir kez kullanılır.',
    recapRow: 'Sıra',
    recapKills: 'Yenilen',
    recapEarned: 'Bu turda kazanılan',
    recapAria: 'Bu tur: sıra {row}, {kills} yenilen, {coins} para kazanıldı'
  },
  chest: {
    title: 'Boss yenildi!',
    titleFirst: 'İlk boss yenildi!',
    defeated: '{name} yenildi!',
    amount: '+{n}',
    boosted: 'Ödül ×{n}!',
    checkpoint: 'Kontrol noktası {n}. sırada kaydedildi',
    boost: '{n}×',
    boostAdAria: 'Ödülü {n} katına çıkarmak için reklam izle',
    boostCoinAria: '{cost} paraya ödülü {n} katına çıkar',
    collect: 'Topla',
    powerUp: 'Güçlen!'
  },
  daily: {
    today: 'Bugünün tahtası: {date}',
    bestLabel: 'Bugünün rekoru',
    attemptsLabel: 'Deneme',
    streakLabel: 'Gün serisi',
    active: 'Günlük oyun sürüyor',
    keepPlaying: 'Oynamaya devam',
    quit: 'Günlük oyundan çık',
    playAgain: 'Tekrar oyna',
    back: 'Sonsuz moda dön',
    resultTitle: 'Günlük oyun bitti',
    resultRow: 'Sıra {n}',
    waitTurn: 'Günlük tahtayı başlatmak için turunu bitir.'
  },
  collection: {
    cosmetic: 'Sadece görünüm: gücünü asla değiştirmez.',
    unknown: '???',
    selectedAria: '{name}, seçili',
    selectAria: '{name} seç',
    buyAria: '{name}, {cost} paraya satın al',
    adProgress: '{n}/{max}',
    adAria: '{name} kilidini açmak için reklam izle',
    adProgressAria: '{name} için reklam izle ({max} reklamdan {n} izlendi)',
    adUnlock: 'Kilidi aç'
  },
  supply: {
    ready: 'Hazine sandığı hazır — açmak için dokun!',
    filling: '{name}: {time} sonra +{n} para'
  },
  codex: {
    title: 'Top kodeksi',
    progress: '{n} / {total} keşfedildi',
    damage: 'Hasar ×{n}',
    locked: 'Keşfetmek için iki tane {n}. seviye topu birleştir!'
  },
  tutorial: {
    aim: 'Canavarlara doğru sürükle ve ateş etmek için bırak!',
    pickup: 'Bir top toplamak için +1 balonunun içinden ateş et!',
    merge: 'Bir top daha topla: dolu tepsi ikizleri daha güçlü bir topa birleştirir!',
    upgrade: 'Daha çok top tutmak için bedava geliştirmeye dokun!'
  },
  prompt: {
    tapToShoot: 'Ateş etmek için dokun',
    clickToShoot: 'Ateş etmek için tıkla'
  },
  coach: {
    survive: 'Canavarlar geçmek üzere — önce en alttakileri vur!',
    tray: 'Tepsin dolu: +1 yalnızca boş bir yuva varken bir atış ekler. Daha çok top atmak için tepsi kapasitesini yükselt!',
    combo: 'Bir boşluktan nişan al: canavarların arkasında seken toplar dev kombolar yapar!',
    trayIntro: 'Bu tepsi toplarını tutar: her top bir atıştır. +1 boş bir yuvayı doldurur, dolu tepsi ise iki ikizi daha güçlü bir topa birleştirir.',
    upgrade: 'Parlayan geliştirmeye dokun: toplarını, tepsini ya da paralarını iyileştirir.',
    bank: 'Açılı nişan al: duvardan seken bir top tek atışta birkaç canavarı vurabilir!',
    funnel: 'Artık {name} alabilirsin — dokun, her top daha sert vursun!',
    skipAria: 'Dersi atla',
    // The spotlight lessons (sr-only; the screen stages them).
    spot: {
      threat: 'Yanındaki geri sayım, en yakın canavar geçene kadar kalan turları sayar — sıfıra inmeden onu vur!',
      speed: '{name}: topların daha hızlı uçar ve her vuruş daha çok hasar verir.',
      luck: '{name}: yeni sıralar daha çok para ve yetenek balonu getirir.',
      bounty: '{name}: yendiğin her canavar daha çok para verir.'
    }
  },
  merge: {
    sr: 'İki {from}. seviye top birleşip bir {to}. seviye top oldu! Tepsindeki her top bir atıştır.',
    discovery: 'Yeni top: {name}. Yetenek: {ability} — {desc}',
    skipAria: 'Birleşmeyi atla'
  },
  unlock: {
    announce: 'Açıldı: {name}!'
  }
}
