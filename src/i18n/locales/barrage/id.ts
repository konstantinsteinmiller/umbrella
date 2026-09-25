// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: 'Baris {n}',
    daily: 'Harian',
    bossIn: 'Bos dalam {n}',
    best: 'Rekor {n}',
    todayBest: 'Hari ini {n}',
    shields: 'Muatan perisai: {n}',
    revives: 'Muatan bangkit: {n}',
    warcry: 'Teriakan perang siap: tembakan berikutnya memberi damage ganda',
    coinGain: '+{n}',
    rank: 'Peringkat global'
  },
  tray: {
    count: '{n}/{max}',
    aria: 'Nampan bola: {n} dari {max}',
    slotAria: '{name}, tingkat {n}',
    stackAria: '{name}, tingkat {n}, ×{count}',
    stackCount: '×{n}',
    tierOnly: 'Tingkat {n}',
    plusOne: '+1',
    merged: 'Bergabung!',
    overflow: 'Nampan penuh! +{n} koin',
    pickupSr: '"+1" berarti satu bola lagi di nampanmu: satu tembakan lagi tiap tembakan beruntun, lebih banyak kerusakan.'
  },
  upgrades: {
    title: 'Peningkatan',
    damage: {
      name: 'Damage bola',
      short: 'Damage',
      desc: 'Setiap bola memukul lebih keras.'
    },
    capacity: {
      name: 'Kapasitas nampan',
      short: 'Kapasitas',
      desc: 'Lebih banyak bola di nampanmu: lebih banyak tembakan setiap giliran.'
    },
    speed: {
      name: 'Kecepatan luncur',
      short: 'Kecepatan',
      desc: 'Bola terbang lebih cepat dan menghantam lebih keras.'
    },
    luck: {
      name: 'Keberuntungan pungut',
      short: 'Hoki',
      desc: 'Lebih banyak gelembung koin dan skill di papan.'
    },
    bounty: {
      name: 'Hadiah koin',
      short: 'Hadiah',
      desc: 'Dapat lebih banyak koin dari setiap monster.'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}%'
    },
    arrow: '{from} → {to}',
    max: 'MAKS',
    free: 'Gratis',
    aria: '{name}: {desc} Harga: {cost} koin.',
    ariaMaxed: '{name}: {desc} Sudah maksimal.',
    ariaFree: '{name}: {desc} Gratis!',
    denied: 'Koin tidak cukup: butuh {cost}.',
    need: 'Kurang {n}'
  },
  turn: {
    bonus: '+{n} bola',
    bonusAdAria: 'Tonton iklan untuk {n} bola tambahan',
    bonusCoinAria: 'Beli {n} bola tambahan seharga {cost} koin',
    recall: 'Tarik kembali bola',
    speed: '×{n}',
    fastAria: 'Percepat ×{n}'
  },
  boss: {
    enraged: 'Mengamuk!',
    hpAria: '{name}: {hp} dari {max} nyawa'
  },
  bosses: {
    'slime-tower': 'Menara Lendir',
    worm: 'Cacing Raksasa',
    'fire-dragon': 'Naga Api',
    'silver-dragon': 'Naga Perak',
    troll: 'Raja Troll',
    orc: 'Panglima Orc'
  },
  monsters: {
    slime: {
      name: 'Lendir',
      rule: 'Gumpalan biasa saja.'
    },
    goblin: {
      name: 'Goblin',
      rule: 'Melompat satu kolom ke samping setiap giliran.'
    },
    caterpillar: {
      name: 'Ulat',
      rule: 'Selebar dua petak dan ekstra kuat.'
    },
    ogre: {
      name: 'Ogre',
      rule: 'Nyawa ganda. Bola penghancur memberi damage tiga kali lipat.'
    },
    dryad: {
      name: 'Dryad',
      rule: 'Menyembuhkan tetangganya setiap giliran — serang dia dulu!'
    },
    centaur: {
      name: 'Centaur',
      rule: 'Meludahkan lumpur yang menutup satu petak selama satu giliran.'
    },
    imp: {
      name: 'Imp',
      rule: 'Saat dikalahkan, terbelah menjadi dua imp kecil.'
    },
    treant: {
      name: 'Pohon Raksasa',
      rule: 'Lambat tapi kuat: hanya maju setiap dua giliran.'
    },
    carbuncle: {
      name: 'Karbunkel',
      rule: 'Perisai permatanya menahan serangan pertama setiap giliran.'
    },
    cyclops: {
      name: 'Siklops',
      rule: 'Menerjang dua baris setiap dua giliran — awasi panahnya!'
    },
    corrupted: {
      name: 'Terkorupsi',
      rule: 'Monster elite: lebih kuat, tapi bernilai tiga kali lipat koin.'
    }
  },
  banners: {
    bossIncoming: 'Bos datang!',
    enraged: '{name} mengamuk!',
    enragedSub: 'Sekarang ia maju dua baris per giliran!',
    checkpoint: 'Checkpoint!',
    checkpointSub: 'Titik mulai ulang tersimpan di baris {n}',
    fever: 'Demam!',
    feverSub: 'Koin ganda!',
    combo: 'Kombo',
    comboHits: '×{n}',
    newMonster: 'Monster baru',
    shieldBlocked: 'Perisai menahan!',
    meteorStorm: 'Badai meteor!',
    revived: 'Bangkit!'
  },
  skills: {
    meteor: {
      name: 'Meteor',
      effect: 'Meteor menghantam semua monster!'
    },
    warcry: {
      name: 'Teriakan perang',
      effect: 'Tembakan berikutnya memberi damage ganda!'
    },
    legion: {
      name: 'Panggilan legiun',
      effect: '+3 bola hantu di tembakan ini!'
    },
    pact: {
      name: 'Pakta jiwa',
      effect: 'Bola terbaikmu disalin!'
    },
    shield: {
      name: 'Lambang perisai',
      effect: 'Menahan jebolnya pertahanan berikutnya.'
    },
    execute: {
      name: 'Tanda algojo',
      effect: 'Monster terkuat tumbang!'
    },
    heal: {
      name: 'Pulihkan',
      effect: 'Monster terdorong mundur satu baris!'
    },
    revive: {
      name: 'Bangkit',
      effect: '+1 lanjut gratis.'
    }
  },
  abilities: {
    burn: {
      name: 'Bakar',
      desc: 'Serangan terus membakar setelah tembakan.'
    },
    knockback: {
      name: 'Dorong',
      desc: 'Mendorong monster naik satu baris.'
    },
    pierce: {
      name: 'Tembus',
      desc: 'Menembus monster pertama yang dikenai.'
    },
    freeze: {
      name: 'Beku',
      desc: 'Monster melewatkan langkah berikutnya.'
    },
    splash: {
      name: 'Percik',
      desc: 'Memercikkan damage ke tetangga.'
    },
    crush: {
      name: 'Hancurkan',
      desc: 'Damage tiga kali lipat ke ogre dan bos.'
    },
    chain: {
      name: 'Rantai',
      desc: 'Petir melompat ke dua monster lagi.'
    },
    poison: {
      name: 'Racun',
      desc: 'Racun bertumpuk yang melukai setiap giliran.'
    },
    midas: {
      name: 'Midas',
      desc: 'Koin bonus di setiap serangan.'
    },
    eruption: {
      name: 'Erupsi',
      desc: 'Setiap beberapa serangan, ledakan di area 3×3.'
    }
  },
  breach: {
    title: 'Kewalahan!',
    wasted: 'Tumbang',
    body: 'Para monster menjebol pertahanan di baris {n}.',
    bodyBy: 'Jebol di baris {n}: {name}',
    meteor: 'Badai meteor',
    meteorDesc: 'Bersihkan dua baris terbawah dan lanjutkan',
    meteorAdAria: 'Tonton iklan: Badai meteor membersihkan dua baris terbawah',
    meteorCoinAria: 'Badai meteor seharga {cost} koin: membersihkan dua baris terbawah',
    revive: 'Bangkit',
    reviveDesc: 'Pakai muatan bangkit (sisa {n})',
    free: 'Gratis',
    restart: 'Mulai ulang di baris {n}',
    restartDesc: 'Semua koinmu tetap aman',
    onceHint: 'Badai meteor hanya sekali per checkpoint.',
    recapRow: 'Baris',
    recapKills: 'Dikalahkan',
    recapEarned: 'Didapat di permainan ini',
    recapAria: 'Permainan ini: baris {row}, {kills} dikalahkan, {coins} koin didapat'
  },
  chest: {
    title: 'Bos dikalahkan!',
    titleFirst: 'Bos pertama tumbang!',
    defeated: '{name} dikalahkan!',
    amount: '+{n}',
    boosted: 'Hadiah ×{n}!',
    checkpoint: 'Checkpoint tersimpan di baris {n}',
    boost: '{n}×',
    boostAdAria: 'Tonton iklan untuk hadiah {n}×',
    boostCoinAria: 'Hadiah {n}× seharga {cost} koin',
    collect: 'Ambil',
    powerUp: 'Tingkatkan!'
  },
  daily: {
    today: 'Papan hari ini: {date}',
    bestLabel: 'Rekor hari ini',
    attemptsLabel: 'Percobaan',
    streakLabel: 'Hari beruntun',
    active: 'Permainan harian berlangsung',
    keepPlaying: 'Lanjut main',
    quit: 'Keluar dari permainan harian',
    playAgain: 'Main lagi',
    back: 'Kembali ke mode tanpa akhir',
    resultTitle: 'Permainan harian selesai',
    resultRow: 'Baris {n}',
    waitTurn: 'Selesaikan giliranmu untuk memulai papan harian.'
  },
  collection: {
    cosmetic: 'Hanya tampilan — tidak pernah mengubah kekuatanmu.',
    unknown: '???',
    selectedAria: '{name}, dipilih',
    selectAria: 'Pilih {name}',
    buyAria: 'Beli {name} seharga {cost} koin',
    adProgress: '{n}/{max}',
    adAria: 'Tonton iklan untuk membuka {name}',
    adProgressAria: 'Tonton iklan untuk {name} ({n} dari {max} ditonton)'
  },
  supply: {
    ready: 'Peti harta siap — ketuk untuk membuka!',
    filling: '{name}: +{n} koin dalam {time}'
  },
  codex: {
    title: 'Kodeks bola',
    progress: '{n} / {total} ditemukan',
    damage: 'Damage ×{n}',
    locked: 'Gabungkan dua bola tingkat {n} untuk menemukannya!'
  },
  tutorial: {
    aim: 'Seret ke arah monster lalu lepas untuk menembak!',
    pickup: 'Tembak menembus gelembung +1 untuk mengambil bola!',
    merge: 'Ambil satu bola lagi: nampan penuh menggabungkan bola kembar jadi bola yang lebih kuat!',
    upgrade: 'Ketuk peningkatan gratis untuk menyimpan lebih banyak bola!'
  },
  prompt: {
    tapToShoot: 'Ketuk untuk menembak',
    clickToShoot: 'Klik untuk menembak'
  },
  coach: {
    survive: 'Monster hampir menerobos — serang yang paling bawah dulu!',
    tray: 'Nampanmu penuh: +1 hanya menambah tembakan jika ada slot kosong. Tingkatkan kapasitas nampan untuk menembakkan lebih banyak bola!',
    combo: 'Bidik lewat celah: bola yang memantul di belakang monster menghasilkan kombo besar!',
    trayIntro: 'Nampan ini menyimpan bolamu: setiap bola adalah satu tembakan. +1 mengisi slot kosong, dan nampan penuh menggabungkan dua bola kembar jadi bola yang lebih kuat.',
    upgrade: 'Ketuk peningkatan yang bersinar: itu membuat bola, nampan, atau koinmu lebih baik.',
    bank: 'Bidik miring: bola yang memantul dari dinding bisa mengenai beberapa monster sekaligus!',
    funnel: 'Sekarang koinmu cukup untuk {name} — ketuk dan setiap bola memukul lebih keras!',
    skipAria: 'Lewati pelajaran',
    // The spotlight lessons (sr-only; the screen stages them).
    spot: {
      threat: 'Hitung mundur di sampingmu menghitung giliran sampai monster terdekat menerobos — serang sebelum mencapai nol!',
      speed: '{name}: bolamu terbang lebih cepat dan setiap pukulan memberi lebih banyak kerusakan.',
      luck: '{name}: baris baru membawa lebih banyak gelembung koin dan skill.',
      bounty: '{name}: setiap monster yang kamu kalahkan memberi lebih banyak koin.'
    }
  },
  merge: {
    sr: 'Dua bola tingkat {from} bergabung menjadi satu bola tingkat {to}! Setiap bola di nampanmu adalah satu tembakan.',
    discovery: 'Bola baru: {name}. Kemampuan: {ability} — {desc}',
    skipAria: 'Lewati penggabungan'
  },
  unlock: {
    announce: 'Terbuka: {name}!'
  }
}
