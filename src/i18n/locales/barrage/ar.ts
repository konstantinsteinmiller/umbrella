// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: 'الصف {n}',
    daily: 'يومي',
    bossIn: 'الزعيم بعد {n}',
    best: 'الأفضل {n}',
    todayBest: 'اليوم {n}',
    shields: 'شحنات الدرع: {n}',
    revives: 'شحنات الإحياء: {n}',
    warcry: 'صيحة الحرب جاهزة: رشقتك التالية تضاعف الضرر',
    coinGain: '+{n}',
    rank: 'الترتيب العالمي'
  },
  tray: {
    count: '{n}/{max}',
    aria: 'صينية الكرات: {n} من {max}',
    slotAria: '{name}، المستوى {n}',
    stackAria: '{name}، المستوى {n}، ×{count}',
    stackCount: '×{n}',
    tierOnly: 'المستوى {n}',
    plusOne: '+1',
    merged: 'اندمجت!',
    overflow: 'الصينية ممتلئة! +{n} عملة',
    pickupSr: '"+1" كرة إضافية في صينيتك: طلقة إضافية في كل رشقة وضرر أكبر.'
  },
  upgrades: {
    title: 'التطويرات',
    damage: {
      name: 'ضرر الكرات',
      short: 'الضرر',
      desc: 'كل كرة تضرب أقوى.'
    },
    capacity: {
      name: 'سعة الصينية',
      short: 'السعة',
      desc: 'كرات أكثر في صينيتك: طلقات أكثر في كل دور.'
    },
    speed: {
      name: 'سرعة الإطلاق',
      short: 'السرعة',
      desc: 'تطير الكرات أسرع وتضرب أقوى.'
    },
    luck: {
      name: 'حظ الالتقاط',
      short: 'الحظ',
      desc: 'فقاعات عملات ومهارات أكثر على اللوحة.'
    },
    bounty: {
      name: 'مكافأة العملات',
      short: 'المكافأة',
      desc: 'اكسب عملات أكثر من كل وحش.'
    },
    fmt: {
      mult: '\u200e×{n}',
      count: '{n}',
      percent: '\u200e{n}%'
    },
    arrow: '{from} ← {to}',
    max: 'أقصى',
    free: 'مجانًا',
    aria: '{name}: {desc} السعر: {cost} عملة.',
    ariaMaxed: '{name}: {desc} مطوّر بالكامل.',
    ariaFree: '{name}: {desc} مجانًا!',
    denied: 'لا تملك عملات كافية: تحتاج إلى {cost}.',
    need: 'تحتاج {n} أخرى'
  },
  turn: {
    bonus: '+{n} كرات',
    bonusAdAria: 'شاهد إعلانًا للحصول على {n} كرات إضافية',
    bonusCoinAria: 'اشترِ {n} كرات إضافية مقابل {cost} عملة',
    recall: 'استدعاء الكرات',
    speed: '×{n}',
    fastAria: 'تسريع ×{n}'
  },
  boss: {
    enraged: 'هائج!',
    hpAria: '{name}: {hp} من {max} صحة'
  },
  bosses: {
    'slime-tower': 'برج الوحل',
    worm: 'الدودة العملاقة',
    'fire-dragon': 'تنين النار',
    'silver-dragon': 'التنين الفضي',
    troll: 'ملك الترول',
    orc: 'أمير حرب الأورك'
  },
  monsters: {
    slime: {
      name: 'وحل',
      rule: 'كتلة لزجة عادية.'
    },
    goblin: {
      name: 'عفريت',
      rule: 'يقفز عمودًا إلى الجانب كل دور.'
    },
    caterpillar: {
      name: 'يرقة',
      rule: 'بعرض خانتين وقوية جدًا.'
    },
    ogre: {
      name: 'غول',
      rule: 'صحة مضاعفة. كرات السحق تضربه بثلاثة أضعاف الضرر.'
    },
    dryad: {
      name: 'حورية الشجر',
      rule: 'تعالج جيرانها كل دور — اضربها أولًا!'
    },
    centaur: {
      name: 'قنطور',
      rule: 'يبصق طينًا يسد خانة لدور واحد.'
    },
    imp: {
      name: 'شيطان مجنّح',
      rule: 'عند هزيمته ينقسم إلى شيطانين صغيرين.'
    },
    treant: {
      name: 'العملاق الشجري',
      rule: 'بطيء لكنه صلب: يتقدم مرة كل دورين.'
    },
    carbuncle: {
      name: 'كاربنكل',
      rule: 'درعه الجوهري يصد الضربة الأولى كل دور.'
    },
    cyclops: {
      name: 'سيكلوب',
      rule: 'يندفع صفّين كل دورين — انتبه للأسهم!'
    },
    corrupted: {
      name: 'فاسد',
      rule: 'وحوش نخبة: أقوى، لكنها تمنح ثلاثة أضعاف العملات.'
    }
  },
  banners: {
    bossIncoming: 'الزعيم قادم!',
    enraged: '{name} هائج!',
    enragedSub: 'صار يتقدم صفين في كل دور!',
    checkpoint: 'نقطة حفظ!',
    checkpointSub: 'حُفظت نقطة البدء عند الصف {n}',
    fever: 'حُمّى!',
    feverSub: 'عملات مضاعفة!',
    combo: 'سلسلة',
    comboHits: '×{n}',
    newMonster: 'وحش جديد',
    shieldBlocked: 'صدّه الدرع!',
    meteorStorm: 'عاصفة نيازك!',
    revived: 'عدت للحياة!'
  },
  skills: {
    meteor: {
      name: 'نيزك',
      effect: 'نيازك تضرب كل الوحوش!'
    },
    warcry: {
      name: 'صيحة الحرب',
      effect: 'رشقتك التالية تضاعف الضرر!'
    },
    legion: {
      name: 'نداء الفيلق',
      effect: '+3 كرات شبحية في هذه الرشقة!'
    },
    pact: {
      name: 'ميثاق الأرواح',
      effect: 'نُسخت أفضل كرة لديك!'
    },
    shield: {
      name: 'شعار الدرع',
      effect: 'يصد الاختراق التالي.'
    },
    execute: {
      name: 'علامة الجلاد',
      effect: 'سقط أقوى وحش!'
    },
    heal: {
      name: 'شفاء',
      effect: 'دُفعت الوحوش صفًا إلى الوراء!'
    },
    revive: {
      name: 'إحياء',
      effect: '+1 متابعة مجانية.'
    }
  },
  abilities: {
    burn: {
      name: 'حرق',
      desc: 'تستمر الضربات بالاحتراق بعد الرشقة.'
    },
    knockback: {
      name: 'دفع',
      desc: 'يدفع الوحش صفًا إلى الأعلى.'
    },
    pierce: {
      name: 'اختراق',
      desc: 'تخترق أول وحش تصيبه.'
    },
    freeze: {
      name: 'تجميد',
      desc: 'يتخطى الوحش تقدمه التالي.'
    },
    splash: {
      name: 'رذاذ',
      desc: 'يتناثر الضرر على الجيران.'
    },
    crush: {
      name: 'سحق',
      desc: 'ثلاثة أضعاف الضرر ضد الغيلان والزعماء.'
    },
    chain: {
      name: 'سلسلة برق',
      desc: 'يقفز البرق إلى وحشين آخرين.'
    },
    poison: {
      name: 'سم',
      desc: 'سم متراكم يضرب كل دور.'
    },
    midas: {
      name: 'ميداس',
      desc: 'عملات إضافية مع كل ضربة.'
    },
    eruption: {
      name: 'ثوران',
      desc: 'كل بضع ضربات، انفجار في مساحة 3×3.'
    }
  },
  breach: {
    title: 'اختراق!',
    wasted: 'سقطت',
    body: 'اخترقت الوحوش الخط عند الصف {n}.',
    bodyBy: 'اختراق عند الصف {n}: {name}',
    meteor: 'عاصفة نيازك',
    meteorDesc: 'امسح الصفين السفليين وتابع اللعب',
    meteorAdAria: 'شاهد إعلانًا: عاصفة النيازك تمسح الصفين السفليين',
    meteorCoinAria: 'عاصفة نيازك مقابل {cost} عملة: تمسح الصفين السفليين',
    revive: 'إحياء',
    reviveDesc: 'استخدم شحنة إحياء (متبقٍ {n})',
    free: 'مجانًا',
    restart: 'ابدأ من الصف {n}',
    restartDesc: 'تحتفظ بكل عملاتك',
    onceHint: 'عاصفة النيازك مرة واحدة لكل نقطة حفظ.',
    recapRow: 'الصف',
    recapKills: 'القتلى',
    recapEarned: 'أرباح هذه الجولة',
    recapAria: 'هذه الجولة: الصف {row}، {kills} قتيل، ربحت {coins} عملة'
  },
  chest: {
    title: 'هُزم الزعيم!',
    titleFirst: 'هزمت أول زعيم!',
    defeated: 'هُزم {name}!',
    amount: '+{n}',
    boosted: 'المكافأة ×{n}!',
    checkpoint: 'حُفظت نقطة الحفظ عند الصف {n}',
    boost: '{n}×',
    boostAdAria: 'شاهد إعلانًا لتحصل على المكافأة ×{n}',
    boostCoinAria: 'المكافأة ×{n} مقابل {cost} عملة',
    collect: 'اجمع',
    powerUp: 'قوِّ نفسك!'
  },
  daily: {
    today: 'لوحة اليوم: {date}',
    bestLabel: 'أفضل نتيجة اليوم',
    attemptsLabel: 'المحاولات',
    streakLabel: 'أيام متتالية',
    active: 'الجولة اليومية جارية',
    keepPlaying: 'تابع اللعب',
    quit: 'غادر الجولة اليومية',
    playAgain: 'العب مجددًا',
    back: 'عودة إلى الوضع اللانهائي',
    resultTitle: 'انتهت الجولة اليومية',
    resultRow: 'الصف {n}',
    waitTurn: 'أنهِ دورك لبدء لوحة اليوم.'
  },
  collection: {
    cosmetic: 'شكل فقط — لا يغيّر قوتك أبدًا.',
    unknown: '???',
    selectedAria: '{name}، مُختار',
    selectAria: 'اختر {name}',
    buyAria: 'اشترِ {name} مقابل {cost} عملة',
    adProgress: '{n}/{max}',
    adAria: 'شاهد إعلانًا لفتح {name}',
    adProgressAria: 'شاهد إعلانًا من أجل {name} (تمت مشاهدة {n} من {max})'
  },
  supply: {
    ready: 'صندوق الكنز جاهز — اضغط لفتحه!',
    filling: '{name}: +{n} عملة بعد {time}'
  },
  codex: {
    title: 'موسوعة الكرات',
    progress: 'اكتُشف {n} / {total}',
    damage: 'الضرر ×{n}',
    locked: 'ادمج كرتين من المستوى {n} لاكتشافها!'
  },
  tutorial: {
    aim: 'اسحب نحو الوحوش ثم أفلت لتطلق!',
    pickup: 'أطلق عبر فقاعة +1 لتلتقط كرة!',
    merge: 'التقط كرة أخرى: الصينية الممتلئة تدمج التوائم في كرة أقوى!',
    upgrade: 'اضغط على التطوير المجاني لتحمل كرات أكثر!'
  },
  prompt: {
    tapToShoot: 'المس لتطلق',
    clickToShoot: 'انقر لتطلق'
  },
  coach: {
    survive: 'الوحوش على وشك الاختراق — اضرب الأدنى أولًا!',
    tray: 'صينيتك ممتلئة: ‏+1 يضيف طلقة فقط عندما توجد خانة فارغة. طوّر سعة الصينية لتطلق كرات أكثر!',
    combo: 'صوّب عبر فجوة: الكرات التي ترتد خلف الوحوش تصنع كومبو ضخمًا!',
    trayIntro: 'هذه الصينية تحمل كراتك: كل كرة طلقة. ‏+1 يملأ خانة فارغة، والصينية الممتلئة تدمج كرتين توأمين في كرة أقوى.',
    upgrade: 'اضغط على التطوير المتوهج: إنه يحسّن كراتك أو صينيتك أو عملاتك.',
    bank: 'صوّب بزاوية: الكرة التي ترتد عن الجدار يمكنها إصابة عدة وحوش بطلقة واحدة!',
    funnel: 'يمكنك الآن شراء {name} — اضغط عليه وستضرب كل كرة بقوة أكبر!',
    skipAria: 'تخطَّ الدرس',
    // The spotlight lessons (sr-only; the screen stages them).
    spot: {
      threat: 'العدّ التنازلي بجانبك يحسب الأدوار حتى يخترق أقرب وحش — اضربه قبل أن يصل إلى الصفر!',
      speed: '{name}: تطير كراتك أسرع وكل ضربة تُحدث ضررًا أكبر.',
      luck: '{name}: الصفوف الجديدة تجلب فقاعات عملات ومهارات أكثر.',
      bounty: '{name}: كل وحش تهزمه يمنحك عملات أكثر.'
    }
  },
  merge: {
    sr: 'اندمجت كرتان من المستوى {from} في كرة واحدة من المستوى {to}! كل كرة في صينيتك هي رمية واحدة.',
    discovery: 'كرة جديدة: {name}. القدرة: {ability} — {desc}',
    skipAria: 'تخطي الدمج'
  },
  unlock: {
    announce: 'تم فتح: {name}!'
  }
}
