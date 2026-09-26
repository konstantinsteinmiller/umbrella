// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: 'Rząd {n}',
    daily: 'Dzienne',
    bossIn: 'Boss za {n}',
    best: 'Rekord {n}',
    todayBest: 'Dziś {n}',
    shields: 'Ładunki tarczy: {n}',
    revives: 'Ładunki wskrzeszenia: {n}',
    warcry: 'Okrzyk bojowy gotowy: następna salwa zada podwójne obrażenia',
    coinGain: '+{n}',
    rank: 'Ranking światowy'
  },
  tray: {
    count: '{n}/{max}',
    aria: 'Taca na kule: {n} z {max}',
    slotAria: '{name}, poziom {n}',
    stackAria: '{name}, poziom {n}, ×{count}',
    stackCount: '×{n}',
    tierOnly: 'Poziom {n}',
    plusOne: '+1',
    merged: 'Połączone!',
    overflow: 'Taca pełna! +{n} monet',
    pickupSr: '„+1” to jedna kula więcej na tacy: jeden strzał więcej w każdej salwie, więcej obrażeń.'
  },
  upgrades: {
    title: 'Ulepszenia',
    damage: {
      name: 'Obrażenia kul',
      short: 'Obrażenia',
      desc: 'Każda kula uderza mocniej.'
    },
    capacity: {
      name: 'Pojemność tacy',
      short: 'Pojemność',
      desc: 'Więcej kul na tacy: więcej strzałów w każdej turze.'
    },
    speed: {
      name: 'Szybkość strzału',
      short: 'Szybkość',
      desc: 'Kule lecą szybciej i uderzają mocniej.'
    },
    luck: {
      name: 'Szczęście do znalezisk',
      short: 'Szczęście',
      desc: 'Więcej baniek z monetami i umiejętnościami na planszy.'
    },
    bounty: {
      name: 'Łup z monet',
      short: 'Łup',
      desc: 'Zdobywaj więcej monet z każdego potwora.'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}%'
    },
    arrow: '{from} → {to}',
    max: 'MAKS',
    free: 'Za darmo',
    aria: '{name}: {desc} Koszt: {cost} monet.',
    ariaMaxed: '{name}: {desc} W pełni ulepszone.',
    ariaFree: '{name}: {desc} Za darmo!',
    denied: 'Za mało monet: potrzebujesz {cost}.',
    need: 'Brakuje {n}'
  },
  turn: {
    bonus: '+{n} kul',
    bonusAdAria: 'Obejrzyj reklamę, aby dostać {n} dodatkowych kul',
    bonusCoinAria: 'Kup {n} dodatkowych kul za {cost} monet',
    recall: 'Przywołaj kule',
    speed: '×{n}',
    fastAria: 'Przewijanie ×{n}'
  },
  boss: {
    enraged: 'Wściekły!',
    hpAria: '{name}: {hp} z {max} zdrowia'
  },
  bosses: {
    'slime-tower': 'Wieża Szlamu',
    worm: 'Wielki Czerw',
    'fire-dragon': 'Ognisty Smok',
    'silver-dragon': 'Srebrny Smok',
    troll: 'Król Trolli',
    orc: 'Orczy Wódz'
  },
  monsters: {
    slime: {
      name: 'Szlam',
      rule: 'Zwykła glutowata kulka.'
    },
    goblin: {
      name: 'Goblin',
      rule: 'Co turę skacze o kolumnę w bok.'
    },
    caterpillar: {
      name: 'Gąsienica',
      rule: 'Szeroka na dwa pola i wyjątkowo wytrzymała.'
    },
    ogre: {
      name: 'Ogr',
      rule: 'Podwójne zdrowie. Kule miażdżące zadają mu potrójne obrażenia.'
    },
    dryad: {
      name: 'Driada',
      rule: 'Co turę leczy sąsiadów: uderz ją najpierw!'
    },
    centaur: {
      name: 'Centaur',
      rule: 'Pluje mazią, która blokuje pole na jedną turę.'
    },
    imp: {
      name: 'Chochlik',
      rule: 'Pokonany rozpada się na dwa małe chochliki.'
    },
    treant: {
      name: 'Drzewiec',
      rule: 'Powolny, ale wytrzymały: rusza się co drugą turę.'
    },
    carbuncle: {
      name: 'Karbunkuł',
      rule: 'Jego klejnotowa tarcza co turę blokuje pierwsze trafienie.'
    },
    cyclops: {
      name: 'Cyklop',
      rule: 'Co drugą turę szarżuje o dwa rzędy: uważaj na strzałki!'
    },
    corrupted: {
      name: 'Spaczony',
      rule: 'Elitarne potwory: twardsze, ale warte potrójne monety.'
    }
  },
  banners: {
    bossIncoming: 'Nadciąga boss!',
    enraged: '{name} wpada w szał!',
    enragedSub: 'Teraz maszeruje o dwa rzędy na turę!',
    checkpoint: 'Punkt kontrolny!',
    checkpointSub: 'Punkt restartu zapisany w rzędzie {n}',
    fever: 'Gorączka!',
    feverSub: 'Podwójne monety!',
    combo: 'Kombo',
    comboHits: '×{n}',
    newMonster: 'Nowy potwór',
    shieldBlocked: 'Tarcza zablokowała!',
    meteorStorm: 'Burza meteorów!',
    revived: 'Wskrzeszono!'
  },
  skills: {
    meteor: {
      name: 'Meteor',
      effect: 'Meteory trafiają każdego potwora!'
    },
    warcry: {
      name: 'Okrzyk bojowy',
      effect: 'Następna salwa zada podwójne obrażenia!'
    },
    legion: {
      name: 'Zew legionu',
      effect: '+3 kule-duchy w tej salwie!'
    },
    pact: {
      name: 'Pakt dusz',
      effect: 'Twoja najlepsza kula została skopiowana!'
    },
    shield: {
      name: 'Herb tarczy',
      effect: 'Pochłania następne przełamanie.'
    },
    execute: {
      name: 'Znak kata',
      effect: 'Najtwardszy potwór pada!'
    },
    heal: {
      name: 'Leczenie',
      effect: 'Potwory cofają się o rząd!'
    },
    revive: {
      name: 'Wskrzeszenie',
      effect: '+1 darmowa kontynuacja.'
    }
  },
  abilities: {
    burn: {
      name: 'Podpalenie',
      desc: 'Trafienia palą się jeszcze po salwie.'
    },
    knockback: {
      name: 'Odrzut',
      desc: 'Odpycha potwora o rząd w górę.'
    },
    pierce: {
      name: 'Przebicie',
      desc: 'Przelatuje przez pierwszego trafionego potwora.'
    },
    freeze: {
      name: 'Zamrożenie',
      desc: 'Potwór pomija swój następny marsz.'
    },
    splash: {
      name: 'Rozprysk',
      desc: 'Rozpryskuje obrażenia na sąsiadów.'
    },
    crush: {
      name: 'Miażdżenie',
      desc: 'Potrójne obrażenia przeciw ogrom i bossom.'
    },
    chain: {
      name: 'Łańcuch',
      desc: 'Piorun przeskakuje na dwa kolejne potwory.'
    },
    poison: {
      name: 'Trucizna',
      desc: 'Kumulująca się trucizna działa co turę.'
    },
    midas: {
      name: 'Midas',
      desc: 'Dodatkowe monety za każde trafienie.'
    },
    eruption: {
      name: 'Erupcja',
      desc: 'Co kilka trafień wybuch na obszarze 3×3.'
    }
  },
  breach: {
    title: 'Przełamanie!',
    wasted: 'Pokonany',
    body: 'Potwory przebiły się w rzędzie {n}.',
    bodyBy: 'Przełamanie w rzędzie {n}: {name}',
    meteor: 'Burza meteorów',
    meteorDesc: 'Oczyść dwa dolne rzędy i graj dalej',
    meteorAdAria: 'Obejrzyj reklamę: Burza meteorów oczyszcza dwa dolne rzędy',
    meteorCoinAria: 'Burza meteorów za {cost} monet: oczyszcza dwa dolne rzędy',
    revive: 'Wskrześ',
    reviveDesc: 'Użyj ładunku wskrzeszenia (zostało {n})',
    free: 'Za darmo',
    restart: 'Zacznij od rzędu {n}',
    restartDesc: 'Zachowujesz wszystkie monety',
    onceHint: 'Burza meteorów działa raz na punkt kontrolny.',
    recapRow: 'Rząd',
    recapKills: 'Pokonani',
    recapEarned: 'Zdobyte w tej grze',
    recapAria: 'Ta gra: rząd {row}, pokonani: {kills}, zdobyte monety: {coins}'
  },
  chest: {
    title: 'Boss pokonany!',
    titleFirst: 'Pierwszy boss pokonany!',
    defeated: '{name} pokonany!',
    amount: '+{n}',
    boosted: 'Łup ×{n}!',
    checkpoint: 'Punkt kontrolny zapisany w rzędzie {n}',
    boost: '{n}×',
    boostAdAria: 'Obejrzyj reklamę, aby zwiększyć łup {n}×',
    boostCoinAria: 'Łup ×{n} za {cost} monet',
    collect: 'Odbierz',
    powerUp: 'Ulepsz!'
  },
  daily: {
    today: 'Dzisiejsza plansza: {date}',
    bestLabel: 'Dzisiejszy rekord',
    attemptsLabel: 'Próby',
    streakLabel: 'Dni z rzędu',
    active: 'Trwa dzienna rozgrywka',
    keepPlaying: 'Graj dalej',
    quit: 'Opuść dzienną rozgrywkę',
    playAgain: 'Zagraj ponownie',
    back: 'Wróć do trybu bez końca',
    resultTitle: 'Dzienna rozgrywka zakończona',
    resultRow: 'Rząd {n}',
    waitTurn: 'Dokończ turę, aby rozpocząć dzienną planszę.'
  },
  collection: {
    cosmetic: 'Tylko wygląd: nigdy nie zmienia twojej siły.',
    unknown: '???',
    selectedAria: '{name}, wybrano',
    selectAria: 'Wybierz: {name}',
    buyAria: 'Kup {name} za {cost} monet',
    adProgress: '{n}/{max}',
    adAria: 'Obejrzyj reklamę, aby odblokować {name}',
    adProgressAria: 'Obejrzyj reklamę dla {name} (obejrzano {n} z {max})',
    adUnlock: 'Odblokuj'
  },
  supply: {
    ready: 'Skrzynia skarbów gotowa — dotknij, aby otworzyć!',
    filling: '{name}: +{n} monet za {time}'
  },
  codex: {
    title: 'Kodeks kul',
    progress: 'Odkryto {n} / {total}',
    damage: 'Obrażenia ×{n}',
    locked: 'Połącz dwie kule poziomu {n}, aby ją odkryć!'
  },
  tutorial: {
    aim: 'Przeciągnij w stronę potworów i puść, aby strzelić!',
    pickup: 'Strzel przez bańkę +1, aby zebrać kulę!',
    merge: 'Zbierz kolejną kulę: pełna taca łączy bliźniaki w silniejszą kulę!',
    upgrade: 'Dotknij darmowego ulepszenia, aby mieścić więcej kul!'
  },
  prompt: {
    tapToShoot: 'Stuknij, aby strzelić',
    clickToShoot: 'Kliknij, aby strzelić'
  },
  coach: {
    survive: 'Potwory zaraz się przebiją — najpierw trafiaj te najniżej!',
    tray: 'Twoja taca jest pełna: +1 dodaje strzał tylko wtedy, gdy jest wolne miejsce. Ulepsz pojemność tacy, aby strzelać większą liczbą kul!',
    combo: 'Celuj przez lukę: kule odbijające się za potworami dają ogromne komba!',
    trayIntro: 'Ta taca trzyma twoje kule: każda to jeden strzał. +1 wypełnia wolne miejsce, a pełna taca łączy dwa bliźniaki w silniejszą kulę.',
    upgrade: 'Dotknij świecącego ulepszenia: poprawia twoje kule, tacę albo monety.',
    bank: 'Celuj pod kątem: kula odbita od ściany może trafić kilka potworów jednym strzałem!',
    funnel: 'Stać cię teraz na {name} – dotknij, a każda kula uderzy mocniej!',
    skipAria: 'Pomiń lekcję',
    // The spotlight lessons (sr-only; the screen stages them).
    spot: {
      threat: 'Odliczanie obok ciebie liczy tury, zanim najbliższy potwór się przebije — traf go, zanim dojdzie do zera!',
      speed: '{name}: twoje kule lecą szybciej, a każde trafienie zadaje więcej obrażeń.',
      luck: '{name}: nowe rzędy przynoszą więcej baniek z monetami i umiejętnościami.',
      bounty: '{name}: każdy pokonany potwór daje więcej monet.'
    }
  },
  merge: {
    sr: 'Dwie kule poziomu {from} połączyły się w jedną kulę poziomu {to}! Każda kula na tacy to jeden strzał.',
    discovery: 'Nowa kula: {name}. Umiejętność: {ability} – {desc}',
    skipAria: 'Pomiń łączenie'
  },
  unlock: {
    announce: 'Odblokowano: {name}!'
  }
}
