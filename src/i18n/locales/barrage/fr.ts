// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: 'Rangée {n}',
    daily: 'Du jour',
    bossIn: 'Boss dans {n}',
    best: 'Record {n}',
    todayBest: 'Auj. {n}',
    shields: 'Charges de bouclier : {n}',
    revives: 'Charges de résurrection : {n}',
    warcry: 'Cri de guerre prêt : ta prochaine salve inflige des dégâts doublés'
  },
  tray: {
    count: '{n}/{max}',
    aria: 'Réserve de balles : {n} sur {max}',
    slotAria: '{name}, niveau {n}',
    stackAria: '{name}, niveau {n}, ×{count}',
    stackCount: '×{n}',
    tierOnly: 'Niveau {n}',
    plusOne: '+1',
    merged: 'Fusion !',
    overflow: 'Réserve pleine ! +{n} pièces'
  },
  upgrades: {
    title: 'Améliorations',
    damage: {
      name: 'Dégâts des balles',
      short: 'Dégâts',
      desc: 'Chaque balle frappe plus fort.'
    },
    capacity: {
      name: 'Capacité de réserve',
      short: 'Capacité',
      desc: 'Garde plus de balles avant que les jumelles fusionnent.'
    },
    speed: {
      name: 'Vitesse de tir',
      short: 'Vitesse',
      desc: 'Les balles volent plus vite et partent plus tôt.'
    },
    luck: {
      name: 'Chance de butin',
      short: 'Chance',
      desc: 'Plus de bulles de pièces et de compétences sur le plateau.'
    },
    bounty: {
      name: 'Prime en pièces',
      short: 'Prime',
      desc: 'Gagne plus de pièces sur chaque monstre.'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}\u00a0%',
      plusPercent: '+{n}\u00a0%'
    },
    arrow: '{from} → {to}',
    max: 'MAX',
    free: 'Gratuit',
    aria: '{name} : {desc} Coût : {cost} pièces.',
    ariaMaxed: '{name} : {desc} Au maximum.',
    ariaFree: '{name} : {desc} Gratuit !'
  },
  turn: {
    bonus: '+{n} balles',
    bonusAdAria: 'Regarde une pub pour {n} balles en plus',
    bonusCoinAria: 'Achète {n} balles en plus pour {cost} pièces',
    recall: 'Rappeler les balles',
    speed: '×{n}',
    fastAria: 'Avance rapide ×{n}'
  },
  boss: {
    enraged: 'Enragé !',
    hpAria: '{name} : {hp} sur {max} points de vie'
  },
  bosses: {
    'slime-tower': 'Tour de Slime',
    worm: 'Ver Géant',
    'fire-dragon': 'Dragon de Feu',
    'silver-dragon': 'Dragon d\'Argent',
    troll: 'Roi Troll',
    orc: 'Seigneur de Guerre Orc'
  },
  monsters: {
    slime: {
      name: 'Slime',
      rule: 'Une simple boule gluante.'
    },
    goblin: {
      name: 'Gobelin',
      rule: 'Saute d\'une colonne sur le côté à chaque tour.'
    },
    caterpillar: {
      name: 'Chenille',
      rule: 'Large de deux cases et très résistante.'
    },
    ogre: {
      name: 'Ogre',
      rule: 'Vie doublée. Les balles écrasantes lui infligent le triple.'
    },
    dryad: {
      name: 'Dryade',
      rule: 'Soigne ses voisins à chaque tour : frappe-la d\'abord !'
    },
    centaur: {
      name: 'Centaure',
      rule: 'Crache une boue qui bloque une case pendant un tour.'
    },
    imp: {
      name: 'Diablotin',
      rule: 'Vaincu, il se divise en deux petits diablotins.'
    },
    treant: {
      name: 'Tréant',
      rule: 'Lent mais robuste : n\'avance qu\'un tour sur deux.'
    },
    carbuncle: {
      name: 'Escarboucle',
      rule: 'Son bouclier de gemme bloque le premier coup à chaque tour.'
    },
    cyclops: {
      name: 'Cyclope',
      rule: 'Charge de deux rangées un tour sur deux : surveille les flèches !'
    },
    corrupted: {
      name: 'Corrompu',
      rule: 'Monstres d\'élite : plus coriaces, mais valent le triple de pièces.'
    }
  },
  banners: {
    bossIncoming: 'Boss en approche !',
    enraged: '{name} est enragé !',
    enragedSub: 'Il avance maintenant de deux rangées par tour !',
    checkpoint: 'Point de contrôle !',
    checkpointSub: 'Point de reprise enregistré à la rangée {n}',
    fever: 'Fièvre !',
    feverSub: 'Pièces doublées !',
    combo: 'Combo',
    comboHits: '×{n}',
    newMonster: 'Nouveau monstre',
    shieldBlocked: 'Bloqué par le bouclier !',
    meteorStorm: 'Pluie de météores !',
    revived: 'Ressuscité !'
  },
  skills: {
    meteor: {
      name: 'Météore',
      effect: 'Des météores frappent tous les monstres !'
    },
    warcry: {
      name: 'Cri de guerre',
      effect: 'Ta prochaine salve inflige des dégâts doublés !'
    },
    legion: {
      name: 'Appel de la légion',
      effect: '+3 balles fantômes pour cette salve !'
    },
    pact: {
      name: 'Pacte des âmes',
      effect: 'Ta meilleure balle a été copiée !'
    },
    shield: {
      name: 'Blason-bouclier',
      effect: 'Absorbe la prochaine percée.'
    },
    execute: {
      name: 'Marque du bourreau',
      effect: 'Le monstre le plus coriace tombe !'
    },
    heal: {
      name: 'Soin',
      effect: 'Les monstres reculent d\'une rangée !'
    },
    revive: {
      name: 'Résurrection',
      effect: '+1 reprise gratuite.'
    }
  },
  abilities: {
    burn: {
      name: 'Brûlure',
      desc: 'Les coups continuent de brûler après la salve.'
    },
    knockback: {
      name: 'Recul',
      desc: 'Repousse le monstre d\'une rangée vers le haut.'
    },
    pierce: {
      name: 'Perforation',
      desc: 'Traverse le premier monstre touché.'
    },
    freeze: {
      name: 'Gel',
      desc: 'Le monstre saute sa prochaine avancée.'
    },
    splash: {
      name: 'Éclaboussure',
      desc: 'Éclabousse les voisins de dégâts.'
    },
    crush: {
      name: 'Écrasement',
      desc: 'Triple dégâts contre les ogres et les boss.'
    },
    chain: {
      name: 'Chaîne',
      desc: 'La foudre rebondit sur deux autres monstres.'
    },
    poison: {
      name: 'Poison',
      desc: 'Un poison cumulable agit à chaque tour.'
    },
    midas: {
      name: 'Midas',
      desc: 'Pièces bonus à chaque coup.'
    },
    eruption: {
      name: 'Éruption',
      desc: 'Tous les quelques coups, une explosion sur une zone 3×3.'
    }
  },
  breach: {
    title: 'Submergé !',
    body: 'Les monstres ont percé à la rangée {n}.',
    meteor: 'Pluie de météores',
    meteorDesc: 'Nettoie les deux rangées du bas et continue',
    meteorAdAria: 'Regarde une pub : la Pluie de météores nettoie les deux rangées du bas',
    meteorCoinAria: 'Pluie de météores pour {cost} pièces : nettoie les deux rangées du bas',
    revive: 'Ressusciter',
    reviveDesc: 'Utilise une charge de résurrection (encore {n})',
    free: 'Gratuit',
    restart: 'Reprendre à la rangée {n}',
    restartDesc: 'Tu gardes toutes tes pièces',
    onceHint: 'La Pluie de météores marche une fois par point de contrôle.'
  },
  chest: {
    title: 'Boss vaincu !',
    titleFirst: 'Premier boss vaincu !',
    defeated: '{name} vaincu !',
    amount: '+{n}',
    doubled: 'Prime doublée !',
    checkpoint: 'Point de contrôle enregistré à la rangée {n}',
    double: '2×',
    doubleAdAria: 'Regarde une pub pour doubler la prime',
    doubleCoinAria: 'Double la prime pour {cost} pièces',
    collect: 'Récupérer'
  },
  daily: {
    today: 'Plateau du jour : {date}',
    bestLabel: 'Record du jour',
    attemptsLabel: 'Essais',
    streakLabel: 'Jours de suite',
    active: 'Partie du jour en cours',
    keepPlaying: 'Continuer',
    quit: 'Quitter la partie du jour',
    playAgain: 'Rejouer',
    back: 'Retour au mode infini',
    resultTitle: 'Partie du jour terminée',
    resultRow: 'Rangée {n}',
    waitTurn: 'Termine ton tour pour lancer le plateau du jour.'
  },
  collection: {
    cosmetic: 'Purement esthétique : ne change jamais ta puissance.',
    unknown: '???',
    selectedAria: '{name}, choisi',
    selectAria: 'Choisir {name}',
    buyAria: 'Acheter {name} pour {cost} pièces'
  },
  supply: {
    ready: 'Coffre au trésor prêt — touche pour l’ouvrir !'
  },
  codex: {
    title: 'Codex des balles',
    progress: '{n} / {total} découvertes',
    damage: 'Dégâts ×{n}',
    locked: 'Fusionne deux balles de niveau {n} pour la découvrir !'
  },
  tutorial: {
    aim: 'Tire vers l’arrière et relâche pour tirer !',
    pickup: 'Tire à travers une bulle +1 pour récupérer une balle !',
    merge: 'Récupère une autre balle : une réserve pleine fusionne les jumelles en une balle plus forte !',
    upgrade: 'Touche l\'amélioration gratuite pour garder plus de balles !'
  },
  coach: {
    survive: 'Les monstres vont percer : frappe d’abord ceux du bas !',
    tray: 'Ta réserve est pleine : un +1 n’ajoute un tir que s’il reste une place libre. Améliore la capacité de réserve pour tirer plus de balles !',
    combo: 'Vise à travers une brèche : les balles qui rebondissent derrière les monstres font d’énormes combos !',
    trayIntro: 'Cette réserve contient tes balles : chacune est un tir. Un +1 remplit une place libre, et une réserve pleine fusionne deux jumelles en une balle plus forte.',
    upgrade: 'Touche l’amélioration qui brille : elle rend tes balles, ta réserve ou tes pièces meilleures.'
  },
  unlock: {
    announce: 'Débloqué : {name} !'
  }
}
