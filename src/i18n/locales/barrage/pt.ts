// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: 'Fileira {n}',
    daily: 'Diário',
    bossIn: 'Chefe em {n}',
    best: 'Recorde {n}',
    todayBest: 'Hoje {n}',
    shields: 'Cargas de escudo: {n}',
    revives: 'Cargas de reviver: {n}',
    warcry: 'Grito de guerra pronto: sua próxima rajada causa dano dobrado',
    coinGain: '+{n}',
    rank: 'Ranking global'
  },
  tray: {
    count: '{n}/{max}',
    aria: 'Bandeja de bolas: {n} de {max}',
    slotAria: '{name}, nível {n}',
    stackAria: '{name}, nível {n}, ×{count}',
    stackCount: '×{n}',
    tierOnly: 'Nível {n}',
    plusOne: '+1',
    merged: 'Fundidas!',
    overflow: 'Bandeja cheia! +{n} moedas',
    pickupSr: '“+1” é uma bola a mais na tua bandeja: um tiro a mais em cada rajada, mais dano.'
  },
  upgrades: {
    title: 'Melhorias',
    damage: {
      name: 'Dano da bola',
      short: 'Dano',
      desc: 'Cada bola bate mais forte.'
    },
    capacity: {
      name: 'Capacidade da bandeja',
      short: 'Capacidade',
      desc: 'Mais bolas na sua bandeja: mais tiros a cada turno.'
    },
    speed: {
      name: 'Velocidade de lançamento',
      short: 'Velocidade',
      desc: 'As bolas voam mais rápido e batem mais forte.'
    },
    luck: {
      name: 'Sorte de coleta',
      short: 'Sorte',
      desc: 'Mais bolhas de moedas e habilidades no tabuleiro.'
    },
    bounty: {
      name: 'Recompensa em moedas',
      short: 'Recompensa',
      desc: 'Ganhe mais moedas de cada monstro.'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}%'
    },
    arrow: '{from} → {to}',
    max: 'MÁX',
    free: 'Grátis',
    aria: '{name}: {desc} Custa {cost} moedas.',
    ariaMaxed: '{name}: {desc} No máximo.',
    ariaFree: '{name}: {desc} Grátis!',
    denied: 'Moedas insuficientes: você precisa de {cost}.',
    need: 'Faltam {n}'
  },
  turn: {
    bonus: '+{n} bolas',
    bonusAdAria: 'Assista a um anúncio para ganhar {n} bolas extras',
    bonusCoinAria: 'Compre {n} bolas extras por {cost} moedas',
    recall: 'Recolher bolas',
    speed: '×{n}',
    fastAria: 'Avanço rápido ×{n}'
  },
  boss: {
    enraged: 'Enfurecido!',
    hpAria: '{name}: {hp} de {max} de vida'
  },
  bosses: {
    'slime-tower': 'Torre de Gosma',
    worm: 'Grande Verme',
    'fire-dragon': 'Dragão de Fogo',
    'silver-dragon': 'Dragão de Prata',
    troll: 'Rei Troll',
    orc: 'Senhor da Guerra Orc'
  },
  monsters: {
    slime: {
      name: 'Gosma',
      rule: 'Uma simples bolha gosmenta.'
    },
    goblin: {
      name: 'Goblin',
      rule: 'Pula uma coluna para o lado a cada turno.'
    },
    caterpillar: {
      name: 'Lagarta',
      rule: 'Ocupa duas casas e é extra resistente.'
    },
    ogre: {
      name: 'Ogro',
      rule: 'Vida dobrada. Bolas esmagadoras causam dano triplo nele.'
    },
    dryad: {
      name: 'Dríade',
      rule: 'Cura os vizinhos a cada turno: acerte-a primeiro!'
    },
    centaur: {
      name: 'Centauro',
      rule: 'Cospe lodo que bloqueia uma casa por um turno.'
    },
    imp: {
      name: 'Diabrete',
      rule: 'Ao ser derrotado, se divide em dois diabretes.'
    },
    treant: {
      name: 'Ent',
      rule: 'Lento mas resistente: só avança a cada dois turnos.'
    },
    carbuncle: {
      name: 'Carbúnculo',
      rule: 'Seu escudo de gema bloqueia o primeiro golpe de cada turno.'
    },
    cyclops: {
      name: 'Ciclope',
      rule: 'Investe duas fileiras a cada dois turnos: fique de olho nas setas!'
    },
    corrupted: {
      name: 'Corrompido',
      rule: 'Monstros de elite: mais duros, mas valem o triplo de moedas.'
    }
  },
  banners: {
    bossIncoming: 'Chefe chegando!',
    enraged: '{name} está enfurecido!',
    enragedSub: 'Agora ele avança duas fileiras por turno!',
    checkpoint: 'Checkpoint!',
    checkpointSub: 'Ponto de reinício salvo na fileira {n}',
    fever: 'Febre!',
    feverSub: 'Moedas em dobro!',
    combo: 'Combo',
    comboHits: '×{n}',
    newMonster: 'Novo monstro',
    shieldBlocked: 'Escudo bloqueou!',
    meteorStorm: 'Chuva de meteoros!',
    revived: 'Revivido!'
  },
  skills: {
    meteor: {
      name: 'Meteoro',
      effect: 'Meteoros atingem todos os monstros!'
    },
    warcry: {
      name: 'Grito de guerra',
      effect: 'Sua próxima rajada causa dano dobrado!'
    },
    legion: {
      name: 'Chamado da legião',
      effect: '+3 bolas fantasmas nesta rajada!'
    },
    pact: {
      name: 'Pacto das almas',
      effect: 'Sua melhor bola foi copiada!'
    },
    shield: {
      name: 'Brasão de escudo',
      effect: 'Absorve a próxima invasão.'
    },
    execute: {
      name: 'Marca do carrasco',
      effect: 'O monstro mais duro cai!'
    },
    heal: {
      name: 'Cura',
      effect: 'Os monstros recuam uma fileira!'
    },
    revive: {
      name: 'Reviver',
      effect: '+1 continuação grátis.'
    }
  },
  abilities: {
    burn: {
      name: 'Queimadura',
      desc: 'Os golpes continuam queimando após a rajada.'
    },
    knockback: {
      name: 'Repulsão',
      desc: 'Empurra o monstro uma fileira para cima.'
    },
    pierce: {
      name: 'Perfuração',
      desc: 'Atravessa o primeiro monstro que acerta.'
    },
    freeze: {
      name: 'Congelamento',
      desc: 'O monstro pula o próximo avanço.'
    },
    splash: {
      name: 'Respingo',
      desc: 'Espalha dano nos vizinhos.'
    },
    crush: {
      name: 'Esmagar',
      desc: 'Dano triplo contra ogros e chefes.'
    },
    chain: {
      name: 'Corrente',
      desc: 'Um raio salta para mais dois monstros.'
    },
    poison: {
      name: 'Veneno',
      desc: 'Veneno acumulativo que age a cada turno.'
    },
    midas: {
      name: 'Midas',
      desc: 'Moedas bônus a cada golpe.'
    },
    eruption: {
      name: 'Erupção',
      desc: 'A cada poucos golpes, uma explosão numa área 3×3.'
    }
  },
  breach: {
    title: 'Invadido!',
    wasted: 'Caído',
    body: 'Os monstros romperam a linha na fileira {n}.',
    bodyBy: 'Rompeu a linha na fileira {n}: {name}',
    meteor: 'Chuva de meteoros',
    meteorDesc: 'Limpa as duas fileiras de baixo e continue',
    meteorAdAria: 'Assista a um anúncio: a Chuva de meteoros limpa as duas fileiras de baixo',
    meteorCoinAria: 'Chuva de meteoros por {cost} moedas: limpa as duas fileiras de baixo',
    revive: 'Reviver',
    reviveDesc: 'Use uma carga de reviver (restam {n})',
    free: 'Grátis',
    restart: 'Recomeçar na fileira {n}',
    restartDesc: 'Você mantém todas as moedas',
    onceHint: 'A Chuva de meteoros funciona uma vez por checkpoint.',
    recapRow: 'Fileira',
    recapKills: 'Derrotados',
    recapEarned: 'Ganhas nesta partida',
    recapAria: 'Nesta partida: fileira {row}, {kills} derrotados, {coins} moedas ganhas'
  },
  chest: {
    title: 'Chefe derrotado!',
    titleFirst: 'Primeiro chefe derrotado!',
    defeated: '{name} derrotado!',
    amount: '+{n}',
    boosted: 'Recompensa ×{n}!',
    checkpoint: 'Checkpoint salvo na fileira {n}',
    boost: '{n}×',
    boostAdAria: 'Assista a um anúncio para multiplicar a recompensa por {n}',
    boostCoinAria: 'Recompensa ×{n} por {cost} moedas',
    collect: 'Coletar',
    powerUp: 'Melhore!'
  },
  daily: {
    today: 'Tabuleiro de hoje: {date}',
    bestLabel: 'Recorde de hoje',
    attemptsLabel: 'Tentativas',
    streakLabel: 'Dias seguidos',
    active: 'Partida diária em andamento',
    keepPlaying: 'Continuar jogando',
    quit: 'Sair da partida diária',
    playAgain: 'Jogar de novo',
    back: 'Voltar ao modo infinito',
    resultTitle: 'Partida diária encerrada',
    resultRow: 'Fileira {n}',
    waitTurn: 'Termine seu turno para começar o tabuleiro diário.'
  },
  collection: {
    cosmetic: 'Só visual: nunca muda o seu poder.',
    unknown: '???',
    selectedAria: '{name}, escolhido',
    selectAria: 'Escolher {name}',
    buyAria: 'Comprar {name} por {cost} moedas',
    adProgress: '{n}/{max}',
    adAria: 'Assista a um anúncio para desbloquear {name}',
    adProgressAria: 'Assista a um anúncio para {name} ({n} de {max} assistidos)'
  },
  supply: {
    ready: 'Baú do tesouro pronto — toque para abrir!',
    filling: '{name}: +{n} moedas em {time}'
  },
  codex: {
    title: 'Códice de bolas',
    progress: '{n} / {total} descobertas',
    damage: 'Dano ×{n}',
    locked: 'Funda duas bolas de nível {n} para descobrir!'
  },
  tutorial: {
    aim: 'Arraste em direção aos monstros e solte para atirar!',
    pickup: 'Atire através de uma bolha +1 para coletar uma bola!',
    merge: 'Colete outra bola: uma bandeja cheia funde as gêmeas numa bola mais forte!',
    upgrade: 'Toque na melhoria grátis para guardar mais bolas!'
  },
  prompt: {
    tapToShoot: 'Toque para atirar',
    clickToShoot: 'Clique para atirar'
  },
  coach: {
    survive: 'Os monstros estão prestes a passar — acerte primeiro os de baixo!',
    tray: 'Sua bandeja está cheia: um +1 só adiciona um tiro quando há um espaço livre. Melhore a capacidade da bandeja para disparar mais bolas!',
    combo: 'Mire por uma brecha: bolas quicando atrás dos monstros fazem combos enormes!',
    trayIntro: 'Esta bandeja guarda suas bolas: cada uma é um tiro. Um +1 preenche um espaço vazio, e uma bandeja cheia funde duas gêmeas em uma bola mais forte.',
    upgrade: 'Toque na melhoria que brilha: ela melhora suas bolas, sua bandeja ou suas moedas.',
    bank: 'Mire na diagonal: uma bola que ricocheteia na parede pode acertar vários monstros com um só tiro!',
    funnel: 'Agora você pode comprar {name} — toque e cada bola vai bater mais forte!',
    skipAria: 'Pular a lição',
    // The spotlight lessons (sr-only; the screen stages them).
    spot: {
      threat: 'A contagem regressiva ao seu lado conta os turnos até o monstro mais próximo passar — acerte-o antes que chegue a zero!',
      speed: '{name}: suas bolas voam mais rápido e cada acerto causa mais dano.',
      luck: '{name}: novas fileiras trazem mais bolhas de moedas e habilidades.',
      bounty: '{name}: cada monstro derrotado rende mais moedas.'
    }
  },
  merge: {
    sr: 'Duas bolas de nível {from} se fundiram em uma bola de nível {to}! Cada bola na sua bandeja é um tiro.',
    discovery: 'Nova bola: {name}. Habilidade: {ability} — {desc}',
    skipAria: 'Pular a fusão'
  },
  unlock: {
    announce: 'Desbloqueado: {name}!'
  }
}
