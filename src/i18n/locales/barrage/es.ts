// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: 'Fila {n}',
    daily: 'Diario',
    bossIn: 'Jefe en {n}',
    best: 'Récord {n}',
    todayBest: 'Hoy {n}',
    shields: 'Cargas de escudo: {n}',
    revives: 'Cargas de revivir: {n}',
    warcry: 'Grito de guerra listo: tu próxima ráfaga hace el doble de daño',
    coinGain: '+{n}'
  },
  tray: {
    count: '{n}/{max}',
    aria: 'Bandeja de bolas: {n} de {max} bolas',
    slotAria: '{name}, nivel {n}',
    stackAria: '{name}, nivel {n}, ×{count}',
    stackCount: '×{n}',
    tierOnly: 'Nivel {n}',
    plusOne: '+1',
    merged: '¡Fusionadas!',
    overflow: '¡Bandeja llena! +{n} monedas'
  },
  upgrades: {
    title: 'Mejoras',
    damage: {
      name: 'Daño de bola',
      short: 'Daño',
      desc: 'Cada bola golpea más fuerte.'
    },
    capacity: {
      name: 'Capacidad de bandeja',
      short: 'Capacidad',
      desc: 'Guarda más bolas antes de que los gemelos se fusionen.'
    },
    speed: {
      name: 'Velocidad de lanzamiento',
      short: 'Velocidad',
      desc: 'Las bolas vuelan más rápido y salen antes.'
    },
    luck: {
      name: 'Suerte de recogida',
      short: 'Suerte',
      desc: 'Más burbujas de monedas y habilidades en el tablero.'
    },
    bounty: {
      name: 'Botín de monedas',
      short: 'Botín',
      desc: 'Gana más monedas con cada monstruo.'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}%',
      plusPercent: '+{n}%'
    },
    arrow: '{from} → {to}',
    max: 'MÁX',
    free: 'Gratis',
    aria: '{name}: {desc} Cuesta {cost} monedas.',
    ariaMaxed: '{name}: {desc} Mejora completa.',
    ariaFree: '{name}: {desc} ¡Gratis!',
    denied: 'No tienes suficientes monedas: necesitas {cost}.',
    need: 'Faltan {n}'
  },
  turn: {
    bonus: '+{n} bolas',
    bonusAdAria: 'Mira un anuncio para {n} bolas extra',
    bonusCoinAria: 'Compra {n} bolas extra por {cost} monedas',
    recall: 'Recuperar bolas',
    speed: '×{n}',
    fastAria: 'Avance rápido ×{n}'
  },
  boss: {
    enraged: '¡Furioso!',
    hpAria: '{name}: {hp} de {max} de vida'
  },
  bosses: {
    'slime-tower': 'Torre de Limo',
    worm: 'Gran Gusano',
    'fire-dragon': 'Dragón de Fuego',
    'silver-dragon': 'Dragón de Plata',
    troll: 'Rey Trol',
    orc: 'Señor de la Guerra Orco'
  },
  monsters: {
    slime: {
      name: 'Limo',
      rule: 'Una simple masa viscosa.'
    },
    goblin: {
      name: 'Goblin',
      rule: 'Salta una columna hacia un lado cada turno.'
    },
    caterpillar: {
      name: 'Oruga',
      rule: 'Ocupa dos casillas y es extra resistente.'
    },
    ogre: {
      name: 'Ogro',
      rule: 'Vida doble. Las bolas aplastantes le hacen triple daño.'
    },
    dryad: {
      name: 'Dríade',
      rule: 'Cura a sus vecinos cada turno. ¡Golpéala primero!'
    },
    centaur: {
      name: 'Centauro',
      rule: 'Escupe lodo que bloquea una casilla durante un turno.'
    },
    imp: {
      name: 'Diablillo',
      rule: 'Al caer, se divide en dos diablillos.'
    },
    treant: {
      name: 'Ent',
      rule: 'Lento pero resistente: avanza solo cada dos turnos.'
    },
    carbuncle: {
      name: 'Carbunclo',
      rule: 'Su escudo de gema bloquea el primer golpe de cada turno.'
    },
    cyclops: {
      name: 'Cíclope',
      rule: 'Embiste dos filas cada dos turnos. ¡Vigila las flechas!'
    },
    corrupted: {
      name: 'Corrupto',
      rule: 'Monstruos de élite: más duros, pero valen el triple de monedas.'
    }
  },
  banners: {
    bossIncoming: '¡Se acerca un jefe!',
    enraged: '¡{name} está furioso!',
    enragedSub: '¡Ahora avanza dos filas por turno!',
    checkpoint: '¡Punto de control!',
    checkpointSub: 'Punto de reinicio guardado en la fila {n}',
    fever: '¡Fiebre!',
    feverSub: '¡Monedas dobles!',
    combo: 'Combo',
    comboHits: '×{n}',
    newMonster: 'Nuevo monstruo',
    shieldBlocked: '¡Escudo bloqueado!',
    meteorStorm: '¡Tormenta de meteoros!',
    revived: '¡Revivido!'
  },
  skills: {
    meteor: {
      name: 'Meteoro',
      effect: '¡Los meteoros golpean a todos los monstruos!'
    },
    warcry: {
      name: 'Grito de guerra',
      effect: '¡Tu próxima ráfaga hace el doble de daño!'
    },
    legion: {
      name: 'Llamada de la legión',
      effect: '¡+3 bolas fantasma en esta ráfaga!'
    },
    pact: {
      name: 'Pacto de almas',
      effect: '¡Tu mejor bola fue copiada!'
    },
    shield: {
      name: 'Blasón de escudo',
      effect: 'Absorbe la próxima brecha.'
    },
    execute: {
      name: 'Marca del verdugo',
      effect: '¡Cae el monstruo más duro!'
    },
    heal: {
      name: 'Curación',
      effect: '¡Los monstruos retroceden una fila!'
    },
    revive: {
      name: 'Revivir',
      effect: '+1 continuación gratis.'
    }
  },
  abilities: {
    burn: {
      name: 'Quemadura',
      desc: 'Los golpes siguen quemando tras la ráfaga.'
    },
    knockback: {
      name: 'Empuje',
      desc: 'Empuja al monstruo una fila hacia arriba.'
    },
    pierce: {
      name: 'Perforación',
      desc: 'Atraviesa al primer monstruo que golpea.'
    },
    freeze: {
      name: 'Congelación',
      desc: 'El monstruo se salta su próximo avance.'
    },
    splash: {
      name: 'Salpicadura',
      desc: 'Salpica daño a los vecinos.'
    },
    crush: {
      name: 'Aplastar',
      desc: 'Triple daño contra ogros y jefes.'
    },
    chain: {
      name: 'Cadena',
      desc: 'Un rayo salta a dos monstruos más.'
    },
    poison: {
      name: 'Veneno',
      desc: 'Veneno acumulable que daña cada turno.'
    },
    midas: {
      name: 'Midas',
      desc: 'Monedas extra con cada golpe.'
    },
    eruption: {
      name: 'Erupción',
      desc: 'Cada pocos golpes, una explosión en un área de 3×3.'
    }
  },
  breach: {
    title: '¡Arrollado!',
    body: 'Los monstruos rompieron la línea en la fila {n}.',
    meteor: 'Tormenta de meteoros',
    meteorDesc: 'Limpia las dos filas de abajo y sigue jugando',
    meteorAdAria: 'Mira un anuncio: la Tormenta de meteoros limpia las dos filas de abajo',
    meteorCoinAria: 'Tormenta de meteoros por {cost} monedas: limpia las dos filas de abajo',
    revive: 'Revivir',
    reviveDesc: 'Usa una carga de revivir (quedan {n})',
    free: 'Gratis',
    restart: 'Reiniciar en la fila {n}',
    restartDesc: 'Conservas todas tus monedas',
    onceHint: 'La Tormenta de meteoros funciona una vez por punto de control.',
    recapRow: 'Fila',
    recapKills: 'Derrotados',
    recapEarned: 'Ganadas en esta partida',
    recapAria: 'Esta partida: fila {row}, {kills} derrotados, {coins} monedas ganadas'
  },
  chest: {
    title: '¡Jefe derrotado!',
    titleFirst: '¡Primer jefe derrotado!',
    defeated: '¡{name} derrotado!',
    amount: '+{n}',
    doubled: '¡Botín duplicado!',
    checkpoint: 'Punto de control guardado en la fila {n}',
    double: '2×',
    doubleAdAria: 'Mira un anuncio para duplicar el botín',
    doubleCoinAria: 'Duplica el botín por {cost} monedas',
    collect: 'Recoger'
  },
  daily: {
    today: 'Tablero de hoy: {date}',
    bestLabel: 'Récord de hoy',
    attemptsLabel: 'Intentos',
    streakLabel: 'Racha de días',
    active: 'Partida diaria en curso',
    keepPlaying: 'Seguir jugando',
    quit: 'Salir de la partida diaria',
    playAgain: 'Jugar otra vez',
    back: 'Volver al modo infinito',
    resultTitle: 'Partida diaria terminada',
    resultRow: 'Fila {n}',
    waitTurn: 'Termina tu turno para empezar el tablero diario.'
  },
  collection: {
    cosmetic: 'Solo estético: nunca cambia tu poder.',
    unknown: '???',
    selectedAria: '{name}, elegido',
    selectAria: 'Elegir {name}',
    buyAria: 'Comprar {name} por {cost} monedas',
    adProgress: '{n}/{max}',
    adAria: 'Mira un anuncio para desbloquear {name}',
    adProgressAria: 'Mira un anuncio para {name} ({n} de {max} vistos)'
  },
  supply: {
    ready: '¡Cofre del tesoro listo: toca para abrirlo!',
    filling: '{name}: +{n} monedas en {time}'
  },
  codex: {
    title: 'Códice de bolas',
    progress: '{n} / {total} descubiertas',
    damage: 'Daño ×{n}',
    locked: '¡Fusiona dos bolas de nivel {n} para descubrirla!'
  },
  tutorial: {
    aim: '¡Arrastra hacia los monstruos y suelta para disparar!',
    pickup: '¡Dispara a través de una burbuja +1 para recoger una bola!',
    merge: 'Recoge otra bola: ¡una bandeja llena fusiona a los gemelos en una bola más fuerte!',
    upgrade: '¡Toca la mejora gratis para guardar más bolas!'
  },
  coach: {
    survive: '¡Los monstruos están a punto de atravesar: golpea primero a los de abajo!',
    tray: 'Tu bandeja está llena: un +1 solo añade un disparo si hay un hueco libre. ¡Mejora la capacidad de bandeja para disparar más bolas!',
    combo: '¡Apunta por un hueco: las bolas que rebotan detrás de los monstruos logran combos enormes!',
    trayIntro: 'Esta bandeja guarda tus bolas: cada una es un disparo. Un +1 llena un hueco libre y una bandeja llena fusiona dos gemelas en una bola más fuerte.',
    upgrade: 'Toca la mejora que brilla: mejora tus bolas, tu bandeja o tus monedas.',
    bank: '¡Apunta en diagonal: una bola que rebota en la pared puede golpear a varios monstruos de un solo tiro!',
    funnel: '¡Ya te alcanza para {name}! Tócalo y cada bola golpeará más fuerte.',
    overrun: 'Si un monstruo cruza la línea, te arrollan: ¡golpea primero a los marcados con 1!'
  },
  merge: {
    sr: 'Dos bolas de nivel {from} se fusionaron en una bola de nivel {to}. ¡Cada bola de tu bandeja es un disparo!',
    discovery: 'Nueva bola: {name}. Habilidad: {ability}: {desc}',
    skipAria: 'Saltar la fusión'
  },
  unlock: {
    announce: '¡Desbloqueado: {name}!'
  }
}
