// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: 'Rij {n}',
    daily: 'Dagelijks',
    bossIn: 'Baas over {n}',
    best: 'Record {n}',
    todayBest: 'Vandaag {n}',
    shields: 'Schildladingen: {n}',
    revives: 'Herrijzenisladingen: {n}',
    warcry: 'Strijdkreet klaar: je volgende salvo doet dubbele schade',
    coinGain: '+{n}',
    rank: 'Wereldranglijst'
  },
  tray: {
    count: '{n}/{max}',
    aria: 'Ballenbak: {n} van {max} ballen',
    slotAria: '{name}, niveau {n}',
    stackAria: '{name}, niveau {n}, ×{count}',
    stackCount: '×{n}',
    tierOnly: 'Niveau {n}',
    plusOne: '+1',
    merged: 'Samengevoegd!',
    overflow: 'Bak vol! +{n} munten',
    pickupSr: '“+1” is een bal extra in je bak: één schot meer per salvo, meer schade.'
  },
  upgrades: {
    title: 'Upgrades',
    damage: {
      name: 'Balschade',
      short: 'Schade',
      desc: 'Elke bal raakt harder.'
    },
    capacity: {
      name: 'Bakcapaciteit',
      short: 'Capaciteit',
      desc: 'Meer ballen in je bak: meer schoten per beurt.'
    },
    speed: {
      name: 'Lanceersnelheid',
      short: 'Snelheid',
      desc: 'Ballen vliegen sneller en raken harder.'
    },
    luck: {
      name: 'Vondstgeluk',
      short: 'Geluk',
      desc: 'Meer munt- en vaardigheidsbellen op het bord.'
    },
    bounty: {
      name: 'Muntbuit',
      short: 'Buit',
      desc: 'Verdien meer munten per monster.'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}%'
    },
    arrow: '{from} → {to}',
    max: 'MAX',
    free: 'Gratis',
    aria: '{name}: {desc} Kost {cost} munten.',
    ariaMaxed: '{name}: {desc} Volledig verbeterd.',
    ariaFree: '{name}: {desc} Gratis!',
    denied: 'Niet genoeg munten: je hebt er {cost} nodig.',
    need: 'Nog {n} nodig'
  },
  turn: {
    bonus: '+{n} ballen',
    bonusAdAria: 'Bekijk een advertentie voor {n} extra ballen',
    bonusCoinAria: 'Koop {n} extra ballen voor {cost} munten',
    recall: 'Ballen terugroepen',
    speed: '×{n}',
    fastAria: 'Vooruitspoelen ×{n}'
  },
  boss: {
    enraged: 'Woedend!',
    hpAria: '{name}: {hp} van {max} levenspunten'
  },
  bosses: {
    'slime-tower': 'Slijmtoren',
    worm: 'Reuzenworm',
    'fire-dragon': 'Vuurdraak',
    'silver-dragon': 'Zilverdraak',
    troll: 'Trollenkoning',
    orc: 'Orkkrijgsheer'
  },
  monsters: {
    slime: {
      name: 'Slijm',
      rule: 'Een doodgewone klodder.'
    },
    goblin: {
      name: 'Goblin',
      rule: 'Springt elke beurt een kolom opzij.'
    },
    caterpillar: {
      name: 'Rups',
      rule: 'Twee vakjes breed en extra taai.'
    },
    ogre: {
      name: 'Oger',
      rule: 'Dubbele levenspunten. Verpletterballen doen driedubbele schade.'
    },
    dryad: {
      name: 'Dryade',
      rule: 'Geneest elke beurt haar buren: raak haar eerst!'
    },
    centaur: {
      name: 'Centaur',
      rule: 'Spuwt slijk dat een vakje een beurt lang blokkeert.'
    },
    imp: {
      name: 'Duiveltje',
      rule: 'Valt verslagen uiteen in twee kleine duiveltjes.'
    },
    treant: {
      name: 'Boomreus',
      rule: 'Traag maar taai: rukt maar om de beurt op.'
    },
    carbuncle: {
      name: 'Karbonkel',
      rule: 'Zijn edelsteenschild blokkeert elke beurt de eerste treffer.'
    },
    cyclops: {
      name: 'Cycloop',
      rule: 'Stormt om de beurt twee rijen vooruit: let op de pijlen!'
    },
    corrupted: {
      name: 'Verdorven',
      rule: 'Elitemonsters: taaier, maar driedubbele munten waard.'
    }
  },
  banners: {
    bossIncoming: 'Baas in aantocht!',
    enraged: '{name} is woedend!',
    enragedSub: 'Hij rukt nu twee rijen per beurt op!',
    checkpoint: 'Checkpoint!',
    checkpointSub: 'Herstartpunt opgeslagen bij rij {n}',
    fever: 'Koorts!',
    feverSub: 'Dubbele munten!',
    combo: 'Combo',
    comboHits: '×{n}',
    newMonster: 'Nieuw monster',
    shieldBlocked: 'Schild blokkeerde!',
    meteorStorm: 'Meteorenstorm!',
    revived: 'Herrezen!'
  },
  skills: {
    meteor: {
      name: 'Meteoor',
      effect: 'Meteoren raken elk monster!'
    },
    warcry: {
      name: 'Strijdkreet',
      effect: 'Je volgende salvo doet dubbele schade!'
    },
    legion: {
      name: 'Legioenroep',
      effect: '+3 spookballen in dit salvo!'
    },
    pact: {
      name: 'Zielenpact',
      effect: 'Je beste bal is gekopieerd!'
    },
    shield: {
      name: 'Schildwapen',
      effect: 'Vangt de volgende doorbraak op.'
    },
    execute: {
      name: 'Beulsteken',
      effect: 'Het taaiste monster valt!'
    },
    heal: {
      name: 'Genezing',
      effect: 'De monsters worden een rij teruggeduwd!'
    },
    revive: {
      name: 'Herrijzenis',
      effect: '+1 gratis doorgaan.'
    }
  },
  abilities: {
    burn: {
      name: 'Brand',
      desc: 'Treffers blijven branden na het salvo.'
    },
    knockback: {
      name: 'Terugslag',
      desc: 'Duwt het monster een rij omhoog.'
    },
    pierce: {
      name: 'Doorboren',
      desc: 'Gaat door het eerste monster dat hij raakt.'
    },
    freeze: {
      name: 'Bevriezen',
      desc: 'Het monster slaat zijn volgende opmars over.'
    },
    splash: {
      name: 'Spatten',
      desc: 'Spat schade op de buren.'
    },
    crush: {
      name: 'Verpletteren',
      desc: 'Driedubbele schade tegen ogers en bazen.'
    },
    chain: {
      name: 'Keten',
      desc: 'Bliksem springt over naar nog twee monsters.'
    },
    poison: {
      name: 'Gif',
      desc: 'Stapelbaar gif dat elke beurt schade doet.'
    },
    midas: {
      name: 'Midas',
      desc: 'Bonusmunten bij elke treffer.'
    },
    eruption: {
      name: 'Uitbarsting',
      desc: 'Om de paar treffers een explosie op 3×3 vakjes.'
    }
  },
  breach: {
    title: 'Overlopen!',
    wasted: 'Gevallen',
    body: 'De monsters braken door bij rij {n}.',
    bodyBy: 'Doorbraak bij rij {n}: {name}',
    meteor: 'Meteorenstorm',
    meteorDesc: 'Veeg de onderste twee rijen weg en speel door',
    meteorAdAria: 'Bekijk een advertentie: de Meteorenstorm veegt de onderste twee rijen weg',
    meteorCoinAria: 'Meteorenstorm voor {cost} munten: veegt de onderste twee rijen weg',
    revive: 'Herrijzen',
    reviveDesc: 'Gebruik een herrijzenislading (nog {n})',
    free: 'Gratis',
    restart: 'Herstart bij rij {n}',
    restartDesc: 'Je houdt al je munten',
    onceHint: 'De Meteorenstorm werkt één keer per checkpoint.',
    recapRow: 'Rij',
    recapKills: 'Verslagen',
    recapEarned: 'Verdiend deze run',
    recapAria: 'Deze run: rij {row}, {kills} verslagen, {coins} munten verdiend'
  },
  chest: {
    title: 'Baas verslagen!',
    titleFirst: 'Eerste baas verslagen!',
    defeated: '{name} verslagen!',
    amount: '+{n}',
    boosted: 'Buit ×{n}!',
    checkpoint: 'Checkpoint opgeslagen bij rij {n}',
    boost: '{n}×',
    boostAdAria: 'Bekijk een advertentie voor {n}× de buit',
    boostCoinAria: '{n}× de buit voor {cost} munten',
    collect: 'Ophalen',
    powerUp: 'Versterk!'
  },
  daily: {
    today: 'Bord van vandaag: {date}',
    bestLabel: 'Record van vandaag',
    attemptsLabel: 'Pogingen',
    streakLabel: 'Dagen op rij',
    active: 'Dagelijkse run bezig',
    keepPlaying: 'Verder spelen',
    quit: 'Dagelijkse run verlaten',
    playAgain: 'Opnieuw spelen',
    back: 'Terug naar eindeloos',
    resultTitle: 'Dagelijkse run voorbij',
    resultRow: 'Rij {n}',
    waitTurn: 'Maak je beurt af om het dagelijkse bord te starten.'
  },
  collection: {
    cosmetic: 'Alleen uiterlijk: verandert nooit je kracht.',
    unknown: '???',
    selectedAria: '{name}, gekozen',
    selectAria: '{name} kiezen',
    buyAria: '{name} kopen voor {cost} munten',
    adProgress: '{n}/{max}',
    adAria: 'Bekijk een advertentie om {name} te ontgrendelen',
    adProgressAria: 'Bekijk een advertentie voor {name} ({n} van {max} bekeken)',
    adUnlock: 'Ontgrendel'
  },
  supply: {
    ready: 'Schatkist klaar — tik om te openen!',
    filling: '{name}: +{n} munten over {time}'
  },
  codex: {
    title: 'Ballencodex',
    progress: '{n} / {total} ontdekt',
    damage: 'Schade ×{n}',
    locked: 'Voeg twee ballen van niveau {n} samen om hem te ontdekken!'
  },
  tutorial: {
    aim: 'Sleep richting de monsters en laat los om te schieten!',
    pickup: 'Schiet door een +1-bel om een bal te pakken!',
    merge: 'Pak nog een bal: een volle bak smelt tweelingen samen tot een sterkere bal!',
    upgrade: 'Tik op de gratis upgrade om meer ballen te houden!'
  },
  prompt: {
    tapToShoot: 'Tik om te schieten',
    clickToShoot: 'Klik om te schieten'
  },
  coach: {
    survive: 'De monsters breken bijna door — raak eerst de onderste!',
    tray: 'Je bak is vol: een +1 geeft alleen een extra schot als er een plek vrij is. Upgrade de bakcapaciteit om meer ballen te schieten!',
    combo: 'Mik door een gat: ballen die achter de monsters stuiteren, maken enorme combo’s!',
    trayIntro: 'Deze bak houdt je ballen vast: elke bal is een schot. Een +1 vult een lege plek, en een volle bak smelt twee tweelingen samen tot een sterkere bal.',
    upgrade: 'Tik op de gloeiende upgrade: die maakt je ballen, je bak of je munten beter.',
    bank: 'Mik schuin: een bal die tegen de muur kaatst, kan met één schot meerdere monsters raken!',
    funnel: 'Je kunt nu {name} betalen – tik erop en elke bal raakt harder!',
    skipAria: 'Les overslaan',
    // The spotlight lessons (sr-only; the screen stages them).
    spot: {
      threat: 'Het aftellen naast je telt de beurten tot het dichtstbijzijnde monster doorbreekt — raak het voordat het nul bereikt!',
      speed: '{name}: je ballen vliegen sneller en elke treffer doet meer schade.',
      luck: '{name}: nieuwe rijen brengen meer munt- en vaardigheidsbellen.',
      bounty: '{name}: elk verslagen monster levert meer munten op.'
    }
  },
  merge: {
    sr: 'Twee ballen van niveau {from} zijn samengesmolten tot één bal van niveau {to}! Elke bal in je bak is één schot.',
    discovery: 'Nieuwe bal: {name}. Vaardigheid: {ability} – {desc}',
    skipAria: 'Samensmelten overslaan'
  },
  unlock: {
    announce: 'Vrijgespeeld: {name}!'
  }
}
