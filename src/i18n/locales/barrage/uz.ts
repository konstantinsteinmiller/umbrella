// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: '{n}-qator',
    daily: 'Kunlik',
    bossIn: 'Bossgacha {n}',
    best: 'Rekord {n}',
    todayBest: 'Bugun {n}',
    shields: 'Qalqon zaryadi: {n}',
    revives: 'Tirilish zaryadi: {n}',
    warcry: 'Jang hayqirig‘i tayyor: keyingi zarba ikki barobar zarar beradi',
    coinGain: '+{n}',
    rank: 'Jahon reytingi'
  },
  tray: {
    count: '{n}/{max}',
    aria: 'To‘p tovasi: {max} tadan {n} ta',
    slotAria: '{name}, {n}-daraja',
    stackAria: '{name}, {n}-daraja, ×{count}',
    stackCount: '×{n}',
    tierOnly: '{n}-daraja',
    plusOne: '+1',
    merged: 'Birlashdi!',
    overflow: 'Tova to‘la! +{n} tanga',
    pickupSr: '“+1” — tovangizda yana bitta to‘p: har bir zarbada bitta o‘q ko‘proq, ko‘proq zarar.'
  },
  upgrades: {
    title: 'Yaxshilanishlar',
    damage: {
      name: 'To‘p zarari',
      short: 'Zarar',
      desc: 'Har bir to‘p kuchliroq uradi.'
    },
    capacity: {
      name: 'Tova sig‘imi',
      short: 'Sig‘im',
      desc: 'Tovangda ko‘proq to‘p: har navbatda ko‘proq o‘q.'
    },
    speed: {
      name: 'Otish tezligi',
      short: 'Tezlik',
      desc: 'To‘plar tezroq uchadi va kuchliroq uradi.'
    },
    luck: {
      name: 'Topilma omadi',
      short: 'Omad',
      desc: 'Taxtada ko‘proq tanga va mahorat pufakchalari.'
    },
    bounty: {
      name: 'Tanga mukofoti',
      short: 'Mukofot',
      desc: 'Har bir maxluqdan ko‘proq tanga oling.'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}%'
    },
    arrow: '{from} → {to}',
    max: 'MAKS',
    free: 'Bepul',
    aria: '{name}: {desc} Narxi: {cost} tanga.',
    ariaMaxed: '{name}: {desc} To‘liq yaxshilangan.',
    ariaFree: '{name}: {desc} Bepul!',
    denied: 'Tangalar yetarli emas: {cost} kerak.',
    need: 'Yana {n} kerak'
  },
  turn: {
    bonus: '+{n} to‘p',
    bonusAdAria: 'Reklama ko‘rib {n} ta qo‘shimcha to‘p oling',
    bonusCoinAria: '{cost} tangaga {n} ta qo‘shimcha to‘p sotib oling',
    recall: 'To‘plarni qaytarish',
    speed: '×{n}',
    fastAria: 'Tezlatish ×{n}'
  },
  boss: {
    enraged: 'Quturdi!',
    hpAria: '{name}: {max} dan {hp} jon'
  },
  bosses: {
    'slime-tower': 'Shilimshiq minorasi',
    worm: 'Ulkan chuvalchang',
    'fire-dragon': 'Olov ajdari',
    'silver-dragon': 'Kumush ajdar',
    troll: 'Troll qiroli',
    orc: 'Ork sarkardasi'
  },
  monsters: {
    slime: {
      name: 'Shilimshiq',
      rule: 'Oddiy yopishqoq bo‘lak.'
    },
    goblin: {
      name: 'Goblin',
      rule: 'Har navbatda bir ustun yonga sakraydi.'
    },
    caterpillar: {
      name: 'Qurt',
      rule: 'Ikki katak kengligida va juda chidamli.'
    },
    ogre: {
      name: 'Ogr',
      rule: 'Ikki barobar jon. Ezuvchi to‘plar unga uch barobar zarar beradi.'
    },
    dryad: {
      name: 'Driada',
      rule: 'Har navbatda qo‘shnilarini davolaydi — avval uni uring!'
    },
    centaur: {
      name: 'Kentavr',
      rule: 'Bir katakni bir navbatga to‘sadigan loy tupuradi.'
    },
    imp: {
      name: 'Qanotli jin',
      rule: 'Yengilganda ikkita kichik jinga bo‘linadi.'
    },
    treant: {
      name: 'Daraxt dev',
      rule: 'Sekin, lekin mustahkam: faqat ikki navbatda bir marta oldinga yuradi.'
    },
    carbuncle: {
      name: 'Karbunkul',
      rule: 'Qimmatbaho tosh qalqoni har navbatda birinchi zarbani to‘sadi.'
    },
    cyclops: {
      name: 'Siklop',
      rule: 'Ikki navbatda bir marta ikki qatorga hamla qiladi — o‘qlarga qarang!'
    },
    corrupted: {
      name: 'Buzilgan',
      rule: 'Elita maxluqlar: chidamliroq, lekin uch barobar tanga beradi.'
    }
  },
  banners: {
    bossIncoming: 'Boss kelmoqda!',
    enraged: '{name} quturdi!',
    enragedSub: 'Endi u har navbatda ikki qator yuradi!',
    checkpoint: 'Nazorat nuqtasi!',
    checkpointSub: 'Qayta boshlash nuqtasi {n}-qatorda saqlandi',
    fever: 'Qizg‘inlik!',
    feverSub: 'Ikki barobar tanga!',
    combo: 'Kombo',
    comboHits: '×{n}',
    newMonster: 'Yangi maxluq',
    shieldBlocked: 'Qalqon to‘sib qoldi!',
    meteorStorm: 'Meteor bo‘roni!',
    revived: 'Tirildingiz!'
  },
  skills: {
    meteor: {
      name: 'Meteor',
      effect: 'Meteorlar barcha maxluqlarga uriladi!'
    },
    warcry: {
      name: 'Jang hayqirig‘i',
      effect: 'Keyingi zarba ikki barobar zarar beradi!'
    },
    legion: {
      name: 'Legion chaqirig‘i',
      effect: 'Bu zarbada +3 arvoh to‘p!'
    },
    pact: {
      name: 'Ruh ahdi',
      effect: 'Eng yaxshi to‘pingiz nusxalandi!'
    },
    shield: {
      name: 'Qalqon gerbi',
      effect: 'Keyingi yorib o‘tishni to‘sadi.'
    },
    execute: {
      name: 'Jallod tamg‘asi',
      effect: 'Eng chidamli maxluq yiqildi!'
    },
    heal: {
      name: 'Davolash',
      effect: 'Maxluqlar bir qator orqaga surildi!'
    },
    revive: {
      name: 'Tirilish',
      effect: '+1 bepul davom ettirish.'
    }
  },
  abilities: {
    burn: {
      name: 'Kuydirish',
      desc: 'Zarbalar keyin ham yonishda davom etadi.'
    },
    knockback: {
      name: 'Itarish',
      desc: 'Maxluqni bir qator yuqoriga itaradi.'
    },
    pierce: {
      name: 'Teshib o‘tish',
      desc: 'Birinchi tekkan maxluqni teshib o‘tadi.'
    },
    freeze: {
      name: 'Muzlatish',
      desc: 'Maxluq keyingi yurishini o‘tkazib yuboradi.'
    },
    splash: {
      name: 'Sachratish',
      desc: 'Zararni qo‘shnilarga sachratadi.'
    },
    crush: {
      name: 'Ezish',
      desc: 'Ogrlar va bosslarga uch barobar zarar.'
    },
    chain: {
      name: 'Zanjir',
      desc: 'Chaqmoq yana ikki maxluqqa sakraydi.'
    },
    poison: {
      name: 'Zahar',
      desc: 'Yig‘iladigan zahar har navbat zarar beradi.'
    },
    midas: {
      name: 'Midas',
      desc: 'Har zarbada bonus tanga.'
    },
    eruption: {
      name: 'Otilish',
      desc: 'Bir necha zarbada bir marta 3×3 hududda portlash.'
    }
  },
  breach: {
    title: 'Yorib o‘tildi!',
    wasted: 'Magʻlub',
    body: 'Maxluqlar {n}-qatorda chiziqni yorib o‘tdi.',
    bodyBy: '{n}-qatorda chiziqni yorgan: {name}',
    meteor: 'Meteor bo‘roni',
    meteorDesc: 'Pastki ikki qatorni tozalab, davom eting',
    meteorAdAria: 'Reklama ko‘ring: meteor bo‘roni pastki ikki qatorni tozalaydi',
    meteorCoinAria: '{cost} tangaga meteor bo‘roni: pastki ikki qatorni tozalaydi',
    revive: 'Tirilish',
    reviveDesc: 'Tirilish zaryadidan foydalaning ({n} qoldi)',
    free: 'Bepul',
    restart: '{n}-qatordan qayta boshlash',
    restartDesc: 'Barcha tangalaringiz saqlanadi',
    onceHint: 'Meteor bo‘roni har nazorat nuqtasida bir marta.',
    recapRow: 'Qator',
    recapKills: 'Yengilgan',
    recapEarned: 'Bu o‘yinda topildi',
    recapAria: 'Bu o‘yin: {row}-qator, {kills} yengilgan, {coins} tanga topildi'
  },
  chest: {
    title: 'Boss yengildi!',
    titleFirst: 'Birinchi boss yengildi!',
    defeated: '{name} yengildi!',
    amount: '+{n}',
    boosted: 'Mukofot ×{n}!',
    checkpoint: 'Nazorat nuqtasi {n}-qatorda saqlandi',
    boost: '{n}×',
    boostAdAria: 'Mukofotni {n} barobar qilish uchun reklama ko‘ring',
    boostCoinAria: '{cost} tangaga mukofotni {n} barobar qiling',
    collect: 'Olish',
    powerUp: 'Kuchaytir!'
  },
  daily: {
    today: 'Bugungi taxta: {date}',
    bestLabel: 'Bugungi rekord',
    attemptsLabel: 'Urinishlar',
    streakLabel: 'Ketma-ket kunlar',
    active: 'Kunlik o‘yin davom etmoqda',
    keepPlaying: 'O‘ynashda davom etish',
    quit: 'Kunlik o‘yindan chiqish',
    playAgain: 'Yana o‘ynash',
    back: 'Cheksiz rejimga qaytish',
    resultTitle: 'Kunlik o‘yin tugadi',
    resultRow: '{n}-qator',
    waitTurn: 'Kunlik taxtani boshlash uchun navbatingizni tugating.'
  },
  collection: {
    cosmetic: 'Faqat tashqi ko‘rinish — kuchingizni hech qachon o‘zgartirmaydi.',
    unknown: '???',
    selectedAria: '{name}, tanlangan',
    selectAria: '{name}ni tanlash',
    buyAria: '{name}ni {cost} tangaga sotib olish',
    adProgress: '{n}/{max}',
    adAria: '{name}ni ochish uchun reklama ko‘ring',
    adProgressAria: '{name} uchun reklama ko‘ring ({max} tadan {n} tasi ko‘rildi)',
    adUnlock: 'Ochish'
  },
  supply: {
    ready: 'Xazina sandig‘i tayyor — ochish uchun bos!',
    filling: '{name}: {time} dan keyin +{n} tanga'
  },
  codex: {
    title: 'To‘plar kodeksi',
    progress: '{n} / {total} kashf etildi',
    damage: 'Zarar ×{n}',
    locked: 'Kashf etish uchun ikkita {n}-darajali to‘pni birlashtiring!'
  },
  tutorial: {
    aim: 'Maxluqlar tomon torting va otish uchun qo‘yib yuboring!',
    pickup: 'To‘p yig‘ish uchun +1 pufakchasi orqali oting!',
    merge: 'Yana bitta to‘p yig‘ing: to‘la tova egizaklarni kuchliroq to‘pga birlashtiradi!',
    upgrade: 'Ko‘proq to‘p saqlash uchun bepul yaxshilanishni bosing!'
  },
  prompt: {
    tapToShoot: 'Otish uchun teging',
    clickToShoot: 'Otish uchun bosing'
  },
  coach: {
    survive: 'Maxluqlar yorib o‘tay deb qoldi — avval eng pastdagilarini ur!',
    tray: 'Tovang to‘la: +1 faqat bo‘sh joy bo‘lsagina qo‘shimcha o‘q beradi. Ko‘proq to‘p otish uchun tova sig‘imini yaxshila!',
    combo: 'Bo‘shliq orqali mo‘ljal ol: maxluqlar ortida sakragan to‘plar ulkan kombo beradi!',
    trayIntro: 'Bu tovada to‘plaring turadi: har biri — bitta o‘q. +1 bo‘sh joyni to‘ldiradi, to‘la tova esa ikki egizakni kuchliroq to‘pga birlashtiradi.',
    upgrade: 'Yonib turgan yaxshilashga bos: u to‘plaringni, tovangni yoki tangalaringni yaxshilaydi.',
    bank: 'Qiya nishonga ol: devordan qaytgan to‘p bir zarbada bir nechta maxluqqa tegadi!',
    funnel: 'Endi {name} uchun tangangiz yetadi — bosing, har bir to‘p kuchliroq uradi!',
    skipAria: 'Darsni o‘tkazib yuborish',
    // The spotlight lessons (sr-only; the screen stages them).
    spot: {
      threat: 'Yoningdagi teskari sanoq eng yaqin maxluq yorib o‘tguncha qolgan navbatlarni sanaydi — nolga yetmasdan uni ur!',
      speed: '{name}: to‘plaring tezroq uchadi va har bir zarba ko‘proq zarar yetkazadi.',
      luck: '{name}: yangi qatorlar ko‘proq tanga va mahorat pufakchalarini olib keladi.',
      bounty: '{name}: yenggan har bir maxluq ko‘proq tanga beradi.'
    }
  },
  merge: {
    sr: 'Ikkita {from}-darajali to‘p birlashib, bitta {to}-darajali to‘pga aylandi! Tovangizdagi har bir to‘p — bitta otish.',
    discovery: 'Yangi to‘p: {name}. Qobiliyati: {ability} — {desc}',
    skipAria: 'Birlashishni o‘tkazib yuborish'
  },
  unlock: {
    announce: 'Ochildi: {name}!'
  }
}
