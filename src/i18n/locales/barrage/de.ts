// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: 'Reihe {n}',
    daily: 'Täglich',
    bossIn: 'Boss in {n}',
    best: 'Rekord {n}',
    todayBest: 'Heute {n}',
    shields: 'Schildladungen: {n}',
    revives: 'Wiederbelebungen: {n}',
    warcry: 'Kriegsschrei bereit: Deine nächste Salve verursacht doppelten Schaden',
    coinGain: '+{n}',
    rank: 'Globaler Rang'
  },
  tray: {
    count: '{n}/{max}',
    aria: 'Kugelablage: {n} von {max} Kugeln',
    slotAria: '{name}, Stufe {n}',
    stackAria: '{name}, Stufe {n}, ×{count}',
    stackCount: '×{n}',
    tierOnly: 'Stufe {n}',
    plusOne: '+1',
    merged: 'Verschmolzen!',
    overflow: 'Ablage voll! +{n} Münzen',
    pickupSr: '„+1“ ist eine Kugel mehr in deiner Ablage: ein Schuss mehr pro Salve, mehr Schaden.'
  },
  upgrades: {
    title: 'Verbesserungen',
    damage: {
      name: 'Kugelschaden',
      short: 'Schaden',
      desc: 'Jede Kugel trifft härter.'
    },
    capacity: {
      name: 'Ablagekapazität',
      short: 'Kapazität',
      desc: 'Mehr Kugeln in deiner Ablage: mehr Schüsse pro Zug.'
    },
    speed: {
      name: 'Schusstempo',
      short: 'Tempo',
      desc: 'Kugeln fliegen schneller und treffen härter.'
    },
    luck: {
      name: 'Fundglück',
      short: 'Glück',
      desc: 'Mehr Münz- und Fertigkeitsblasen auf dem Feld.'
    },
    bounty: {
      name: 'Münzbeute',
      short: 'Beute',
      desc: 'Mehr Münzen von jedem Monster.'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}\u00a0%'
    },
    arrow: '{from} → {to}',
    max: 'MAX',
    free: 'Gratis',
    aria: '{name}: {desc} Kosten: {cost} Münzen.',
    ariaMaxed: '{name}: {desc} Voll ausgebaut.',
    ariaFree: '{name}: {desc} Gratis!',
    denied: 'Nicht genug Münzen: Du brauchst {cost}.',
    need: 'Noch {n} nötig'
  },
  turn: {
    bonus: '+{n} Kugeln',
    bonusAdAria: 'Werbung ansehen für {n} zusätzliche Kugeln',
    bonusCoinAria: '{n} zusätzliche Kugeln für {cost} Münzen kaufen',
    recall: 'Kugeln zurückrufen',
    speed: '×{n}',
    fastAria: 'Schnellvorlauf ×{n}'
  },
  boss: {
    enraged: 'Wütend!',
    hpAria: '{name}: {hp} von {max} Lebenspunkten'
  },
  bosses: {
    'slime-tower': 'Schleimturm',
    worm: 'Riesenwurm',
    'fire-dragon': 'Feuerdrache',
    'silver-dragon': 'Silberdrache',
    troll: 'Trollkönig',
    orc: 'Orkkriegsherr'
  },
  monsters: {
    slime: {
      name: 'Schleim',
      rule: 'Ein ganz normaler Klecks.'
    },
    goblin: {
      name: 'Goblin',
      rule: 'Hüpft jede Runde eine Spalte zur Seite.'
    },
    caterpillar: {
      name: 'Raupe',
      rule: 'Zwei Felder breit und besonders zäh.'
    },
    ogre: {
      name: 'Oger',
      rule: 'Doppelte Lebenspunkte. Brecher-Kugeln verursachen dreifachen Schaden.'
    },
    dryad: {
      name: 'Dryade',
      rule: 'Heilt jede Runde ihre Nachbarn – triff sie zuerst!'
    },
    centaur: {
      name: 'Zentaur',
      rule: 'Spuckt Schleim, der ein Feld für eine Runde blockiert.'
    },
    imp: {
      name: 'Wichtel',
      rule: 'Zerfällt besiegt in zwei kleine Wichtel.'
    },
    treant: {
      name: 'Baumhirte',
      rule: 'Langsam, aber zäh: rückt nur jede zweite Runde vor.'
    },
    carbuncle: {
      name: 'Karfunkel',
      rule: 'Sein Edelsteinschild blockt jede Runde den ersten Treffer.'
    },
    cyclops: {
      name: 'Zyklop',
      rule: 'Stürmt jede zweite Runde zwei Reihen vor – achte auf die Pfeile!'
    },
    corrupted: {
      name: 'Verderbt',
      rule: 'Elite-Monster: zäher, aber dreifache Münzen wert.'
    }
  },
  banners: {
    bossIncoming: 'Boss im Anmarsch!',
    enraged: '{name} ist wütend!',
    enragedSub: 'Er rückt jetzt zwei Reihen pro Runde vor!',
    checkpoint: 'Checkpoint!',
    checkpointSub: 'Neustartpunkt bei Reihe {n} gespeichert',
    fever: 'Fieber!',
    feverSub: 'Doppelte Münzen!',
    combo: 'Kombo',
    comboHits: '×{n}',
    newMonster: 'Neues Monster',
    shieldBlocked: 'Schild hat geblockt!',
    meteorStorm: 'Meteorsturm!',
    revived: 'Wiederbelebt!'
  },
  skills: {
    meteor: {
      name: 'Meteor',
      effect: 'Meteore treffen jedes Monster!'
    },
    warcry: {
      name: 'Kriegsschrei',
      effect: 'Deine nächste Salve verursacht doppelten Schaden!'
    },
    legion: {
      name: 'Legionsruf',
      effect: '+3 Geisterkugeln in dieser Salve!'
    },
    pact: {
      name: 'Seelenpakt',
      effect: 'Deine beste Kugel wurde kopiert!'
    },
    shield: {
      name: 'Schildwappen',
      effect: 'Fängt den nächsten Durchbruch ab.'
    },
    execute: {
      name: 'Henkersmal',
      effect: 'Das zäheste Monster fällt!'
    },
    heal: {
      name: 'Heilung',
      effect: 'Die Monster werden eine Reihe zurückgedrängt!'
    },
    revive: {
      name: 'Wiederbelebung',
      effect: '+1 kostenlose Fortsetzung.'
    }
  },
  abilities: {
    burn: {
      name: 'Brand',
      desc: 'Treffer brennen nach der Salve weiter.'
    },
    knockback: {
      name: 'Rückstoß',
      desc: 'Stößt das Monster eine Reihe zurück.'
    },
    pierce: {
      name: 'Durchbohren',
      desc: 'Fliegt durch das erste getroffene Monster.'
    },
    freeze: {
      name: 'Frost',
      desc: 'Das Monster setzt beim nächsten Vorrücken aus.'
    },
    splash: {
      name: 'Spritzer',
      desc: 'Verteilt Schaden auf die Nachbarn.'
    },
    crush: {
      name: 'Zermalmen',
      desc: 'Dreifacher Schaden gegen Oger und Bosse.'
    },
    chain: {
      name: 'Kette',
      desc: 'Blitze springen auf zwei weitere Monster über.'
    },
    poison: {
      name: 'Gift',
      desc: 'Stapelbares Gift wirkt jede Runde.'
    },
    midas: {
      name: 'Midas',
      desc: 'Bonusmünzen bei jedem Treffer.'
    },
    eruption: {
      name: 'Eruption',
      desc: 'Alle paar Treffer eine Explosion auf 3×3 Feldern.'
    }
  },
  breach: {
    title: 'Überrannt!',
    wasted: 'Überrannt',
    body: 'Die Monster sind bei Reihe {n} durchgebrochen.',
    bodyBy: 'Durchbruch in Reihe {n}: {name}',
    meteor: 'Meteorsturm',
    meteorDesc: 'Räumt die unteren zwei Reihen – spiel weiter',
    meteorAdAria: 'Werbung ansehen: Meteorsturm räumt die unteren zwei Reihen',
    meteorCoinAria: 'Meteorsturm für {cost} Münzen: räumt die unteren zwei Reihen',
    revive: 'Wiederbeleben',
    reviveDesc: 'Eine Wiederbelebung nutzen (noch {n})',
    free: 'Gratis',
    restart: 'Neustart bei Reihe {n}',
    restartDesc: 'Du behältst alle Münzen',
    onceHint: 'Meteorsturm geht einmal pro Checkpoint.',
    recapRow: 'Reihe',
    recapKills: 'Besiegt',
    recapEarned: 'In diesem Lauf verdient',
    recapAria: 'Dieser Lauf: Reihe {row}, {kills} besiegt, {coins} Münzen verdient'
  },
  chest: {
    title: 'Boss besiegt!',
    titleFirst: 'Erster Boss besiegt!',
    defeated: '{name} besiegt!',
    amount: '+{n}',
    boosted: 'Kopfgeld ×{n}!',
    checkpoint: 'Checkpoint bei Reihe {n} gespeichert',
    boost: '{n}×',
    boostAdAria: 'Werbung ansehen für das {n}-fache Kopfgeld',
    boostCoinAria: '{n}-faches Kopfgeld für {cost} Münzen',
    collect: 'Einsammeln',
    powerUp: 'Aufrüsten!'
  },
  daily: {
    today: 'Heutiges Feld: {date}',
    bestLabel: 'Heutiger Rekord',
    attemptsLabel: 'Versuche',
    streakLabel: 'Tage in Folge',
    active: 'Tageslauf läuft',
    keepPlaying: 'Weiterspielen',
    quit: 'Tageslauf verlassen',
    playAgain: 'Nochmal spielen',
    back: 'Zurück zum Endlosmodus',
    resultTitle: 'Tageslauf beendet',
    resultRow: 'Reihe {n}',
    waitTurn: 'Beende deinen Zug, um das Tagesfeld zu starten.'
  },
  collection: {
    cosmetic: 'Nur Optik – ändert nie deine Stärke.',
    unknown: '???',
    selectedAria: '{name}, ausgewählt',
    selectAria: '{name} auswählen',
    buyAria: '{name} für {cost} Münzen kaufen',
    adProgress: '{n}/{max}',
    adAria: 'Werbung ansehen, um {name} freizuschalten',
    adProgressAria: 'Werbung ansehen für {name} ({n} von {max} gesehen)'
  },
  supply: {
    ready: 'Schatztruhe bereit – tippe zum Öffnen!',
    filling: '{name}: +{n} Münzen in {time}'
  },
  codex: {
    title: 'Kugel-Kodex',
    progress: '{n} / {total} entdeckt',
    damage: 'Schaden ×{n}',
    locked: 'Verschmelze zwei Kugeln der Stufe {n}, um sie zu entdecken!'
  },
  tutorial: {
    aim: 'Zieh in Richtung der Monster und lass los, um zu schießen!',
    pickup: 'Schieß durch eine +1-Blase, um eine Kugel zu sammeln!',
    merge: 'Sammle noch eine Kugel: Eine volle Ablage verschmilzt Zwillinge zu einer stärkeren Kugel!',
    upgrade: 'Tippe auf die Gratis-Verbesserung, um mehr Kugeln zu halten!'
  },
  prompt: {
    tapToShoot: 'Tippen zum Schießen',
    clickToShoot: 'Klicken zum Schießen'
  },
  coach: {
    survive: 'Die Monster brechen gleich durch – triff zuerst die untersten!',
    tray: 'Deine Ablage ist voll: Ein +1 bringt nur dann einen Schuss mehr, wenn ein Platz frei ist. Verbessere die Ablagekapazität, um mehr Kugeln zu schießen!',
    combo: 'Ziel durch eine Lücke: Kugeln, die hinter den Monstern abprallen, bringen riesige Kombos!',
    trayIntro: 'Diese Ablage hält deine Kugeln: Jede ist ein Schuss. Ein +1 füllt einen freien Platz, und eine volle Ablage verschmilzt zwei Zwillinge zu einer stärkeren Kugel.',
    upgrade: 'Tippe auf die leuchtende Verbesserung: Sie macht deine Kugeln, deine Ablage oder deine Münzen besser.',
    bank: 'Ziel schräg: Eine Kugel, die von der Wand abprallt, trifft mit einem Schuss mehrere Monster!',
    funnel: 'Du kannst dir jetzt {name} leisten – tippe darauf, und jede Kugel trifft härter!',
    skipAria: 'Lektion überspringen',
    // The spotlight lessons (sr-only; the screen stages them).
    spot: {
      threat: 'Der Countdown neben dir zählt die Züge, bis das nächste Monster durchbricht – triff es, bevor er null erreicht!',
      speed: '{name}: Deine Kugeln fliegen schneller, und jeder Treffer macht mehr Schaden.',
      luck: '{name}: Neue Reihen bringen mehr Münz- und Fertigkeitsblasen.',
      bounty: '{name}: Jedes besiegte Monster bringt mehr Münzen.'
    }
  },
  merge: {
    sr: 'Zwei Kugeln der Stufe {from} sind zu einer Kugel der Stufe {to} verschmolzen! Jede Kugel in deiner Ablage ist ein Schuss.',
    discovery: 'Neue Kugel: {name}. Fähigkeit: {ability} – {desc}',
    skipAria: 'Verschmelzen überspringen'
  },
  unlock: {
    announce: 'Freigeschaltet: {name}!'
  }
}
