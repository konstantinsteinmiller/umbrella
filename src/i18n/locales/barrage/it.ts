// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: 'Fila {n}',
    daily: 'Giornaliera',
    bossIn: 'Boss tra {n}',
    best: 'Record {n}',
    todayBest: 'Oggi {n}',
    shields: 'Cariche scudo: {n}',
    revives: 'Cariche rinascita: {n}',
    warcry: 'Grido di guerra pronto: la prossima raffica fa danni doppi',
    coinGain: '+{n}'
  },
  tray: {
    count: '{n}/{max}',
    aria: 'Vassoio delle sfere: {n} su {max}',
    slotAria: '{name}, livello {n}',
    stackAria: '{name}, livello {n}, ×{count}',
    stackCount: '×{n}',
    tierOnly: 'Livello {n}',
    plusOne: '+1',
    merged: 'Fuse!',
    overflow: 'Vassoio pieno! +{n} monete'
  },
  upgrades: {
    title: 'Potenziamenti',
    damage: {
      name: 'Danno sfere',
      short: 'Danno',
      desc: 'Ogni sfera colpisce più forte.'
    },
    capacity: {
      name: 'Capacità vassoio',
      short: 'Capacità',
      desc: 'Tieni più sfere prima che le gemelle si fondano.'
    },
    speed: {
      name: 'Velocità di lancio',
      short: 'Velocità',
      desc: 'Le sfere volano più veloci e partono prima.'
    },
    luck: {
      name: 'Fortuna raccolta',
      short: 'Fortuna',
      desc: 'Più bolle di monete e abilità sul campo.'
    },
    bounty: {
      name: 'Taglia in monete',
      short: 'Taglia',
      desc: 'Guadagna più monete da ogni mostro.'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}%',
      plusPercent: '+{n}%'
    },
    arrow: '{from} → {to}',
    max: 'MAX',
    free: 'Gratis',
    aria: '{name}: {desc} Costo: {cost} monete.',
    ariaMaxed: '{name}: {desc} Al massimo.',
    ariaFree: '{name}: {desc} Gratis!',
    denied: 'Monete insufficienti: te ne servono {cost}.',
    need: 'Ne mancano {n}'
  },
  turn: {
    bonus: '+{n} sfere',
    bonusAdAria: 'Guarda una pubblicità per {n} sfere extra',
    bonusCoinAria: 'Compra {n} sfere extra per {cost} monete',
    recall: 'Richiama le sfere',
    speed: '×{n}',
    fastAria: 'Avanti veloce ×{n}'
  },
  boss: {
    enraged: 'Infuriato!',
    hpAria: '{name}: {hp} su {max} punti vita'
  },
  bosses: {
    'slime-tower': 'Torre di Melma',
    worm: 'Grande Verme',
    'fire-dragon': 'Drago di Fuoco',
    'silver-dragon': 'Drago d\'Argento',
    troll: 'Re dei Troll',
    orc: 'Signore della Guerra Orco'
  },
  monsters: {
    slime: {
      name: 'Melma',
      rule: 'Un semplice blob.'
    },
    goblin: {
      name: 'Goblin',
      rule: 'Salta di una colonna di lato ogni turno.'
    },
    caterpillar: {
      name: 'Bruco',
      rule: 'Largo due caselle ed extra resistente.'
    },
    ogre: {
      name: 'Orco',
      rule: 'Vita doppia. Le sfere frantumanti gli fanno il triplo dei danni.'
    },
    dryad: {
      name: 'Driade',
      rule: 'Cura i vicini ogni turno: colpiscila per prima!'
    },
    centaur: {
      name: 'Centauro',
      rule: 'Sputa fango che blocca una casella per un turno.'
    },
    imp: {
      name: 'Diavoletto',
      rule: 'Quando cade si divide in due diavoletti.'
    },
    treant: {
      name: 'Ent',
      rule: 'Lento ma robusto: avanza solo un turno sì e uno no.'
    },
    carbuncle: {
      name: 'Carbonchio',
      rule: 'Il suo scudo di gemma blocca il primo colpo di ogni turno.'
    },
    cyclops: {
      name: 'Ciclope',
      rule: 'Carica di due file un turno sì e uno no: occhio alle frecce!'
    },
    corrupted: {
      name: 'Corrotto',
      rule: 'Mostri d\'élite: più resistenti, ma valgono il triplo delle monete.'
    }
  },
  banners: {
    bossIncoming: 'Arriva un boss!',
    enraged: '{name} è infuriato!',
    enragedSub: 'Ora avanza di due file a turno!',
    checkpoint: 'Checkpoint!',
    checkpointSub: 'Punto di ripartenza salvato alla fila {n}',
    fever: 'Febbre!',
    feverSub: 'Monete doppie!',
    combo: 'Combo',
    comboHits: '×{n}',
    newMonster: 'Nuovo mostro',
    shieldBlocked: 'Bloccato dallo scudo!',
    meteorStorm: 'Tempesta di meteore!',
    revived: 'Rinato!'
  },
  skills: {
    meteor: {
      name: 'Meteora',
      effect: 'Le meteore colpiscono ogni mostro!'
    },
    warcry: {
      name: 'Grido di guerra',
      effect: 'La tua prossima raffica fa danni doppi!'
    },
    legion: {
      name: 'Richiamo della legione',
      effect: '+3 sfere fantasma in questa raffica!'
    },
    pact: {
      name: 'Patto delle anime',
      effect: 'La tua sfera migliore è stata copiata!'
    },
    shield: {
      name: 'Stemma scudo',
      effect: 'Assorbe la prossima breccia.'
    },
    execute: {
      name: 'Marchio del boia',
      effect: 'Il mostro più resistente cade!'
    },
    heal: {
      name: 'Cura',
      effect: 'I mostri arretrano di una fila!'
    },
    revive: {
      name: 'Rinascita',
      effect: '+1 continua gratis.'
    }
  },
  abilities: {
    burn: {
      name: 'Ustione',
      desc: 'I colpi continuano a bruciare dopo la raffica.'
    },
    knockback: {
      name: 'Contraccolpo',
      desc: 'Respinge il mostro su di una fila.'
    },
    pierce: {
      name: 'Perforazione',
      desc: 'Attraversa il primo mostro che colpisce.'
    },
    freeze: {
      name: 'Gelo',
      desc: 'Il mostro salta la sua prossima avanzata.'
    },
    splash: {
      name: 'Schizzo',
      desc: 'Schizza danni sui vicini.'
    },
    crush: {
      name: 'Frantumazione',
      desc: 'Danni tripli contro orchi e boss.'
    },
    chain: {
      name: 'Catena',
      desc: 'Un fulmine salta su altri due mostri.'
    },
    poison: {
      name: 'Veleno',
      desc: 'Veleno cumulabile che colpisce ogni turno.'
    },
    midas: {
      name: 'Mida',
      desc: 'Monete bonus a ogni colpo.'
    },
    eruption: {
      name: 'Eruzione',
      desc: 'Ogni pochi colpi, un\'esplosione su un\'area 3×3.'
    }
  },
  breach: {
    title: 'Travolto!',
    body: 'I mostri hanno sfondato alla fila {n}.',
    meteor: 'Tempesta di meteore',
    meteorDesc: 'Libera le due file in basso e continua',
    meteorAdAria: 'Guarda una pubblicità: la Tempesta di meteore libera le due file in basso',
    meteorCoinAria: 'Tempesta di meteore per {cost} monete: libera le due file in basso',
    revive: 'Rinasci',
    reviveDesc: 'Usa una carica rinascita (ne restano {n})',
    free: 'Gratis',
    restart: 'Riparti dalla fila {n}',
    restartDesc: 'Tieni tutte le monete',
    onceHint: 'La Tempesta di meteore funziona una volta per checkpoint.',
    recapRow: 'Fila',
    recapKills: 'Sconfitti',
    recapEarned: 'Guadagnate in questa partita',
    recapAria: 'Questa partita: fila {row}, {kills} sconfitti, {coins} monete guadagnate'
  },
  chest: {
    title: 'Boss sconfitto!',
    titleFirst: 'Primo boss sconfitto!',
    defeated: '{name} sconfitto!',
    amount: '+{n}',
    doubled: 'Taglia raddoppiata!',
    checkpoint: 'Checkpoint salvato alla fila {n}',
    double: '2×',
    doubleAdAria: 'Guarda una pubblicità per raddoppiare la taglia',
    doubleCoinAria: 'Raddoppia la taglia per {cost} monete',
    collect: 'Raccogli'
  },
  daily: {
    today: 'Campo di oggi: {date}',
    bestLabel: 'Record di oggi',
    attemptsLabel: 'Tentativi',
    streakLabel: 'Giorni di fila',
    active: 'Partita del giorno in corso',
    keepPlaying: 'Continua a giocare',
    quit: 'Esci dalla partita del giorno',
    playAgain: 'Gioca ancora',
    back: 'Torna alla modalità infinita',
    resultTitle: 'Partita del giorno finita',
    resultRow: 'Fila {n}',
    waitTurn: 'Finisci il tuo turno per iniziare il campo del giorno.'
  },
  collection: {
    cosmetic: 'Solo estetica: non cambia mai la tua forza.',
    unknown: '???',
    selectedAria: '{name}, scelto',
    selectAria: 'Scegli {name}',
    buyAria: 'Compra {name} per {cost} monete',
    adProgress: '{n}/{max}',
    adAria: 'Guarda una pubblicità per sbloccare {name}',
    adProgressAria: 'Guarda una pubblicità per {name} ({n} di {max} viste)'
  },
  supply: {
    ready: 'Forziere pronto: tocca per aprirlo!',
    filling: '{name}: +{n} monete tra {time}'
  },
  codex: {
    title: 'Codice delle sfere',
    progress: '{n} / {total} scoperte',
    damage: 'Danno ×{n}',
    locked: 'Fondi due sfere di livello {n} per scoprirla!'
  },
  tutorial: {
    aim: 'Trascina verso i mostri e rilascia per sparare!',
    pickup: 'Spara attraverso una bolla +1 per raccogliere una sfera!',
    merge: 'Raccogli un’altra sfera: un vassoio pieno fonde le gemelle in una sfera più forte!',
    upgrade: 'Tocca il potenziamento gratuito per tenere più sfere!'
  },
  coach: {
    survive: 'I mostri stanno per sfondare: colpisci prima quelli più in basso!',
    tray: 'Il tuo vassoio è pieno: un +1 aggiunge un colpo solo se c’è uno spazio libero. Potenzia la capacità vassoio per sparare più sfere!',
    combo: 'Mira attraverso un varco: le sfere che rimbalzano dietro i mostri fanno combo enormi!',
    trayIntro: 'Questo vassoio contiene le tue sfere: ognuna è un colpo. Un +1 riempie uno spazio libero, e un vassoio pieno fonde due gemelle in una sfera più forte.',
    upgrade: 'Tocca il potenziamento che brilla: migliora le tue sfere, il vassoio o le monete.',
    bank: 'Mira in diagonale: una sfera che rimbalza sul muro può colpire più mostri con un solo tiro!',
    funnel: 'Ora puoi permetterti {name}: toccalo e ogni sfera colpirà più forte!',
    overrun: 'Se un mostro supera la linea, vieni travolto: colpisci prima quelli con l’1!'
  },
  merge: {
    sr: 'Due sfere di livello {from} si sono fuse in una sfera di livello {to}! Ogni sfera nel vassoio è un colpo.',
    discovery: 'Nuova sfera: {name}. Abilità: {ability} — {desc}',
    skipAria: 'Salta la fusione'
  },
  unlock: {
    announce: 'Sbloccato: {name}!'
  }
}
