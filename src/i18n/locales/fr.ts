import barrage from './barrage/fr'
import barrageMeta from './barrageMeta/fr'

export default {
  barrage,
  barrageMeta,
  'umbrella': {
    'level': "Niveau {n}",
    'finish': "ARRIVÉE",
    'controls': "←/→ ou Q/D se déplacer · Espace ouvre/ferme le parapluie · R recommencer",
    'broken': "Parapluie cassé !",
    'prevLevel': "Niveau précédent",
    'nextLevel': "Niveau suivant",
    'restart': "Recommencer le niveau",
    'selectLevel': "Choisir un niveau",
    'close': "Fermer"
  },
  'ads': {
    'watch': 'Regarder', 'revive': 'Revivre', 'secondChance': 'Seconde chance', 'doubleCoins': '2× pièces', 'plusCoins': '+{n} pièces'
  },
  'achievements': {
    'title': 'Succès', 'subtitle': 'Atteignez des jalons pour gagner des pièces.', 'claim': 'Réclamer', 'claimed': 'Réclamé', 'progress': '{c} / {t}',
    'unlocked': 'Succès accompli !',
    'items': {
      'kills100': { 'name': 'Premier Cent', 'desc': 'Vaincre 100 ennemis.' },
      'kills1k': { 'name': 'Pourfendeur', 'desc': 'Vaincre 1 000 ennemis.' },
      'kills10k': { 'name': 'Exterminateur', 'desc': 'Vaincre 10 000 ennemis.' },
      'wave10': { 'name': 'Gardien de la Ligne', 'desc': 'Atteindre la vague 10.' },
      'wave25': { 'name': 'Commandant du Front', 'desc': 'Atteindre la vague 25.' },
      'wave50': { 'name': 'Seigneur de Guerre', 'desc': 'Atteindre la vague 50.' },
      'boss1': { 'name': 'Tueur de Géants', 'desc': 'Vaincre votre premier boss.' },
      'boss10': { 'name': 'Chasseur de Boss', 'desc': 'Vaincre 10 boss.' },
      'boss50': { 'name': 'Fléau des Rois', 'desc': 'Vaincre 50 boss.' },
      'merges50': { 'name': 'Assembleur', 'desc': 'Fusionner des unités 50 fois.' },
      'merges500': { 'name': 'Maître de la Fusion', 'desc': 'Fusionner des unités 500 fois.' },
      'tier5': { 'name': 'Forge Ardente', 'desc': 'Créer une unité de niveau 5.' },
      'tier8': { 'name': 'Forge Glacée', 'desc': 'Créer une unité de niveau 8.' },
      'tier10': { 'name': 'Forge Cosmique', 'desc': "Créer l'unité de niveau 10." },
      'fieldMerge1': { 'name': 'Médecin de Campagne', 'desc': 'Réussir votre première fusion de terrain.' },
      'fieldMerges25': { 'name': 'Forgeron de Bataille', 'desc': 'Réussir 25 fusions de terrain.' },
      'combo10': { 'name': 'Carnage', 'desc': 'Atteindre un combo de ×10.' },
      'combo25': { 'name': 'Inarrêtable', 'desc': 'Atteindre un combo de ×25.' },
      'waves100': { 'name': 'Vétéran de Campagne', 'desc': 'Terminer 100 vagues au total.' },
      'waves500': { 'name': 'Guerre Éternelle', 'desc': 'Terminer 500 vagues au total.' },
      'tiles1k': { 'name': 'Globe-trotteur', 'desc': 'Parcourez 1 000 cases au total.' },
      'tiles5k': { 'name': 'Marathonien', 'desc': 'Parcourez 5 000 cases au total.' },
      'tiles10k': { 'name': 'Coureur de fond', 'desc': 'Parcourez 10 000 cases au total.' },
      'tiles100k': { 'name': 'Voyageur', 'desc': 'Parcourez 100 000 cases au total.' },
      'stage5': { 'name': 'Premiers pas', 'desc': 'Atteignez le niveau 5.' },
      'stage10': { 'name': 'Aguerri', 'desc': 'Atteignez le niveau 10.' },
      'stage20': { 'name': 'Vétéran', 'desc': 'Atteignez le niveau 20.' },
      'clears25': { 'name': 'Nettoyeur', 'desc': 'Terminez 25 niveaux au total.' },
      'clears100': { 'name': 'Centurion', 'desc': 'Terminez 100 niveaux au total.' },
      'bestRun100': { 'name': 'Sprinteur', 'desc': 'Parcourez 100 cases en une seule partie.' },
      'bestRun250': { 'name': 'Démon de la distance', 'desc': 'Parcourez 250 cases en une seule partie.' },
      'coins5k': { 'name': 'Collectionneur de pièces', 'desc': 'Collectez 5 000 pièces au total.' },
      'coins50k': { 'name': 'Trésorier', 'desc': 'Collectez 50 000 pièces au total.' },
      'items50': { 'name': 'Déballeur', 'desc': 'Attrapez 50 boîtes d\'objets au total.' },
      'items250': { 'name': 'Accumulateur', 'desc': 'Attrapez 250 boîtes d\'objets au total.' }
    }
  },
  'gameName': 'Umbrella',
  'cancel': 'Annuler',
  'close': 'Fermer',
  'ok': 'Ok',
  'continue': 'Continuer',
  'tapToContinue': 'Touchez pour continuer',
  'clickToContinue': 'Cliquez pour continuer',
  'stage': 'Niveau',
  'rewards': 'RÉCOMPENSES',
  'tip': 'Astuce',
  'crazyGamesOnly': 'Ce jeu est uniquement disponible sur',
  'startTouch': 'Touchez pour commencer',
  'startDesktop': 'Cliquez pour commencer',
  'startSubhint': 'Monte en roulant — change de direction pour éviter les trous et les obstacles !',
  'hints': {
    'tapToTurn': 'Touchez pour changer de direction',
    'clickToTurn': 'Clic / Espace pour changer de direction'
  },
  'powerups': {
    'invuln': 'Invincible',
    'magnet': 'Aimant à pièces',
    'dodge': "Maître de l'esquive",
    'slowmo': 'Ralenti',
    'push': 'Force de poussée',
   'racer': 'Racer !' },
  'secondChance': {
    'title': 'Continuer à rouler ?',
    'body': 'Regardez une courte pub pour ressusciter et continuer votre partie.',
    'watch': 'Regarder et continuer',
    'skip': 'Passer'
  },
  'result': {
    'win': 'NIVEAU TERMINÉ !',
    'lose': 'PARTIE TERMINÉE',
    'fell': 'Vous êtes tombé dans un trou !',
    'crashed': 'Vous avez percuté un obstacle !',
    'tiles': 'Cases',
    'winReward': 'dont +{n} bonus de niveau',
    'double': 'Doubler les pièces',
    'firstRunDouble': '2× — première partie du jour !',
   'almost': 'Presque ! Encore {n} cases.', 'retry': 'Réessayer', },
  'upgrades': {
    'title': 'Améliorations',
    'subtitle': 'Dépensez des pièces pour vous renforcer définitivement.',
    'level': 'Niv.{n}',
    'maxedOut': 'MAX',
    'sellBack': 'Vendre +{n}',
    'spotlight': 'Dépenser !',
    'unlocksAtStage': '🔒 Niveau {n}',
    'names': {
      'powerupDuration': 'Boost de pouvoir',
      'magnetRange': "Portée de l'aimant",
      'coinValue': 'Valeur des pièces',
      'itemLuck': 'Boîtes chanceuses',
      'dodgeApprentice': 'Apprenti Esquive',
      'deathMagnet': 'Aimant Mortel',
      'autoCollect': 'Collecte Auto',
      'rollingBoulder': 'Rocher Roulant'
    },
    'descriptions': {
      'powerupDuration': 'Tous les bonus durent plus longtemps (+0,75s par niveau).',
      'magnetRange': "L'aimant à pièces a une portée accrue.",
      'coinValue': 'Chaque pièce vaut plus.',
      'itemLuck': 'Les boîtes apparaissent plus souvent.',
      'dodgeApprentice': "Esquive auto une case mortelle, puis recharge (10s ; −0,5s par niveau).",
      'deathMagnet': "À la mort, récupère toutes les pièces dans un rayon de 4 cases — encaisse ce que tu aurais perdu.",
      'autoCollect': "Collecte toujours les pièces des cases adjacentes — un aimant à pièces permanent d'une case.",
      'rollingBoulder': 'Traversez les caisses sans dommage.'
    },
    'secondChance': {
      'name': 'Seconde Chance',
      'description': "Commencez chaque partie avec des ailes d'ange — survivez à un choc ou une chute. Actif jusqu'à utilisation.",
      'active': 'ACTIF',
      'watch': 'Gratuit'
    }
  },
  'prism': {
    'spawn': 'Invoquer',
    'instantSpawn': 'Invocation Éclair',
    'doubleDamage': '2× Dégâts',
    'freeGold': 'Coffre de Guerre',
    'gridFull': 'Grille pleine — fusionnez ou déployez pour faire de la place !',
    'hintDrag': 'Glissez deux unités identiques pour fusionner'
  },
  'welcomeBack': {
    'title': 'Bon retour, commandant !',
    'body': 'Votre armée a continué le combat pendant votre absence :'
  },
  'battle': {
    'spellDesc': { 'heal': "Restaure 25% des points de vie de toutes les unités.", 'reviveGuard': "Pendant 30 s, toute unité qui tombe ressuscite aussitôt avec toute sa vie.", 'defender': "Transforme votre meilleure unité de mêlée en tank pendant 2 min : 2× de vie, 80% de dégâts en moins.", 'meteor': "Fait pleuvoir des météores sur le champ, frappant tous les ennemis.", 'warcry': "Pendant 8 s, votre armée inflige +60% de dégâts et attaque 30% plus vite.", 'legionCall': "Invoque pendant 20 s 3 guerriers spectraux d'un rang sous votre meilleure unité. Se charge vite quand vos unités tombent.", 'executionerMark': "Marque l'ennemi le plus coriace pendant 10 s : il subit +75% de dégâts et est exécuté sous 12% de vie.", 'soulPact': "Votre unité la plus forte obtient un jumeau — la suivante est sacrifiée pour lui. Se recharge en 3 minutes." },
    'mutationWave': "MUTATION !",
    'overrunSetbackHint': "Ces vagues sont trop fortes — renforce d'abord ton armée sur des vagues plus faciles.",
    'spells': { 'heal': "Soin", 'reviveGuard': "Garde de Résurrection", 'defender': "Défenseur", 'warcry': "Cri de guerre de la Légion", 'legionCall': "Appel de la Légion", 'executionerMark': "Marque du Bourreau", 'soulPact': "Pacte des Âmes" },
    'pactNeedsSacrifice': "Le Pacte des Âmes exige une unité de rang inférieur sur le champ à sacrifier.",
    'bossNames': { 'b0': "Glorp le Dévoreur", 'b1': "Roi Poing-de-Boue", 'b2': "Mawzilla", 'b3': "Le Mange-Portail", 'b4': "Grumblor Prime" },
    'wave': 'Vague {n}',
    'best': 'Record {n}',
    'waveStart': 'Vague {n}',
    'nextWave': 'Vague {n} dans…',
    'waveCleared': 'Vague terminée ! +{n}',
    'bossIncoming': 'BOSS EN APPROCHE !',
    'overrun': 'SUBMERGÉ !',
    'overrunBody': 'La porte est tombée — regroupez-vous et tenez la ligne !',
    'deployHint': 'Lâchez pour déployer !',
    'armyFullHint': 'Armée au complet — déposez sur un combattant de même niveau pour fusionner !',
    'fever': 'FIÈVRE !!!',
    'rampage': 'CARNAGE !',
    'ultimate': 'Pluie de Météores',
    'multBounty': '{mult}× le butin du boss !',
    'upgrades': {
      'attack': 'Cors de Guerre',
      'vitality': 'Vitalité',
      'bounty': 'Butin',
      'automation': 'Diablotin',
      'recruit': 'Recrues',
      'maxed': 'MAX',
      'desc': {
        'attack': 'Augmente les dégâts d\'attaque de toute votre armée.',
        'vitality': 'Augmente les points de vie maximum de chaque combattant.',
        'bounty': 'Gagnez plus de pièces pour chaque ennemi vaincu.',
        'automation': 'Fusionne les unités à votre place, plus vite à chaque niveau.',
        'recruit': 'Les nouvelles unités apparaissent à un rang supérieur.'
      }
    },
    'nextChest': 'Prochain : 🎁 vague {n}',
    'newEnemyAt': 'Nouvel ennemi à la vague {n} !',
    'newEnemy': 'Nouvel ennemi en approche !',
    'chestWave': 'Coffre de guerre ! +{n}',
    'waveSetback': 'Repoussé à la vague {n} !',
    'rally': 'RALLIEMENT !',
    'rallyBody': 'Regardez une pub pour ressusciter vos combattants tombés !',
    'coinBuff': { 'offerTitle': 'Le coffre contient {mult}× d\'or !', 'label': '{mult}× revenus en pièces', 'duration': 'pendant {m} minutes', 'expiresIn': 'Offre expire dans {n}s' },
    'tutorial': {
      'spawn': 'Touchez INVOQUER pour recruter deux étincelles !',
      'merge': "Faites glisser une étincelle sur l'autre pour FUSIONNER !",
      'deploy': "Faites glisser votre combattant dans l'arène pour rejoindre le combat !",
      'fieldMerge': 'Créez une autre unité du même niveau et déposez-la sur votre combattant pour le SOIGNER et MONTER EN GRADE !'
    },
    'codex': {
      'title': 'Codex des unités',
      'names': { 't1': 'Étincelle de Magma', 't2': 'Tourbillon de Givre', 't3': 'Brute de Roche', 't4': 'Gardien Glaciaire', 't5': 'Goutte de Marée', 't6': 'Colosse de Pierre', 't7': 'Œil de Nébuleuse', 't8': 'Spectre du Vide', 't9': 'Serre Dorée', 't10': 'Souverain Phénix', 't11': "Seigneur de Guerre d'Obsidienne", 't12': "Titan Infernal", 't13': "Faucheur Ombral", 't14': "Léviathan de Magma", 't15': "Ascendant Cosmique", 't16': "Souverain des Tempêtes", 't17': "Gardien Abyssal", 't18': "Béhémoth en Fusion", 't19': "Dévoreur Astral", 't20': "Divinité Éternelle", 't21': "Sentinelle d'Acier", 't22': "Farceur de Mercure", 't23': "Tyran Magnétique", 't24': "Gardien d'Ambre", 't25': "Djinn des Dunes", 't26': "Fiole Caustique", 't27': "Cœur de Ronces", 't28': "Monarque de Corail", 't29': "Sage Luminescent", 't30': "Furie Orageuse", 't31': "Oracle de Jade", 't32': "Monolithe Runique", 't33': "Moteur Chrono", 't34': "Esprit Origami", 't35': "Lutin Bulle", 't36': "Cube Glitch", 't37': "Cloche Écho", 't38': "Lanterne Spectrale", 't39': "Spectre Miroir", 't40': "Cœur de Rubis", 't41': "Feu Follet Givré", 't42': "Diamant Parangon", 't43': "Dynamo Plasma", 't44': "Héraut Comète", 't45': "Séraphin Aurore", 't46': "Empereur Solaire", 't47': "Étoile à Vœux", 't48': "Phare Pulsar", 't49': "Matière Noire", 't50': "Singularité Suprême" },
      'locked': 'Fusionnez deux unités de niveau {n} pour la découvrir !',
      'effects': { 'none': "Frappes rapides — vives et implacables.", 'burn': "Les coups laissent des dégâts qui continuent d'agir.", 'knockback': "Des coups puissants repoussent les ennemis.", 'heal': "Chaque coup soigne votre allié le plus faible.", 'splash': "Chaque coup éclate sur tous les ennemis proches.", 'poison': "Les coups cumulent des dégâts sur la durée.", 'chain': "Les attaques rebondissent sur trois ennemis de plus.", 'frost': "Ralentit à l'impact ; une onde étourdit les groupes proches.", 'midas': "Fortes chances de critique et or bonus à chaque coup.", 'eruption': "Explose à l'impact et brûle tous les ennemis proches." },
      'abilities': {
        'none': 'Une étincelle en fusion : rapide, intrépide, toujours en tête.',
        'burn': 'Le givre mordant persiste : les ennemis continuent de subir des dégâts après le coup.',
        'knockback': 'Projette des rochers qui repoussent les ennemis.',
        'heal': 'Diffuse un givre régénérant : chaque coup soigne votre allié le plus faible.',
        'splash': 'Des vagues déferlantes frappent tous les ennemis proches.',
        'poison': "La poussière suffocante s'accumule pour infliger de lourds dégâts au fil du temps.",
        'chain': 'Le feu stellaire jaillit vers trois ennemis supplémentaires.',
        'frost': 'Une terreur rampante ralentit les ennemis et fige les foules.',
        'midas': 'Critiques fréquents et or bonus à chaque coup.',
        'blackhole': 'Invoque un vortex brûlant qui aspire la horde et la réduit en cendres.',
        'eruption': "Entre en éruption à l'impact — une éclaboussure de lave brûle tous les ennemis proches."
      }
    },
    'mutators': {
      'goldRush': "RUÉE VERS L'OR ! Butin ×{mult}",
      'frostMarch': 'MARCHE GLACIALE ! Coups givrants',
      'horde': 'HORDE ! Essaim doublé',
      'elite': 'ÉLITE ! Un champion mène la vague'
    }
  },
  'battlePass': {
    'title': 'Campagne de guerre',
    'progress': '{current} / {total}',
    'daysLeft': '{n}j restants',
    'maxed': 'CAMPAGNE TERMINÉE',
    'xpProgress': '{current} / {total} XP',
    'howToEarn': "Comment gagner de l'XP",
    'perAttempt': 'par partie',
    'perStageFinish': 'par niveau',
    'perKill': 'par élimination',
    'perMerge': 'par fusion',
    'perWave': 'par vague',
    'perBoss': 'par boss',
    'unlockHint': 'Atteignez {n} XP pour débloquer la récompense suivante — les récompenses non réclamées restent disponibles.'
  },
  'dailyRewards': {
    'title': 'Récompenses quotidiennes',
    'subtitle': 'Connectez-vous chaque jour pour garder votre série.',
    'day': 'Jour {n}',
    'dayShort': 'J{n}'
  },
  'skins': {
    'title': 'Skins de Balle',
    'subtitle': 'Dépensez des pièces pour débloquer et équiper de nouveaux looks.',
    'equip': 'Équiper',
    'equipped': 'Équipé',
   'locked': 'Niveau {n}', 'new': 'Nouveau !', 'rarity': { 'common': 'Commun', 'rare': 'Rare', 'epic': 'Épique' }, },
  'missions': {
    'title': 'Missions quotidiennes',
    'subtitle': 'Accomplissez des objectifs chaque jour pour des pièces.',
    'claim': 'Réclamer',
    'done': 'Réclamé',
    'types': {
      'coins': 'Collectez {n} pièces aujourd\'hui',
      'tiles': 'Parcourez {n} cases en une partie',
      'items': 'Attrapez {n} boîtes d\'objets aujourd\'hui',
      'clears': 'Terminez {n} niveaux aujourd\'hui'
    }
  },
  'endless': {
    'badge': 'Infini',
    'toEndless': 'Mode Infini',
    'toCampaign': 'Campagne',
    'best': 'Record : {n}'
  },
  'boon': {
    'title': 'Choisissez un bonus',
    'names': {
      'secondChance': 'Seconde Chance',
      'startPowerup': 'Avance',
      'coinBoost': 'Ruée vers les pièces'
    },
    'descriptions': {
      'secondChance': 'Commencez le niveau suivant avec un bouclier Seconde Chance.',
      'startPowerup': 'Commencez le niveau suivant avec un bonus aléatoire.',
      'coinBoost': '1,2× pièces pour tout le niveau suivant.'
    }
  },
  'options': {
    'title': 'Options',
    'general': 'Général',
    'audio': 'Audio',
    'language': 'Langue',
    'difficulty': 'Difficulté',
    'soundEffects': 'Effets Sonores',
    'music': 'Musique',
    'musicTrack': 'Piste musicale',
    'musicTracks': {
      'cozy': 'Harmonie Cosy',
      'battle': 'Thème de Bataille'
    },
    'close': 'Sauvegarder et Fermer',
    'difficulties': { 'easy': 'Facile', 'medium': 'Moyen', 'hard': 'Difficile' },
    'difficultyHints': {
      'easy': 'Vitesse réduite — plus de temps pour réagir.',
      'medium': 'Le rythme équilibré par défaut.',
      'hard': 'Vitesse accrue — timing plus précis requis.'
    }
  },
  'adsBlocked': {
    'title': 'Impossible d\'afficher la pub',
    'body': 'Nous avons essayé de vous montrer une vidéo pour gagner votre récompense, mais quelque chose dans votre navigateur bloque les pubs.',
    'allowPrefix': 'Veuillez autoriser les pubs sur',
    'allowSuffix': '(ou suspendez votre bloqueur de pub pour ce jeu) et réessayez.',
    'gotIt': 'Compris'
  },
  'saveStatus': {
    'restoredTitle': 'Sauvegarde cloud restaurée',
    'restoredBody': '+{n} pièces bonus pour la récupération',
    'tap': 'toucher',
    'pausedTitle': 'Synchronisation cloud en pause',
    'pausedBody': 'Jeu hors ligne. Votre progression est sauvegardée ici.',
    'retry': 'Réessayer',
    'dismiss': 'fermer'
  },
  'loading': {
    'tooLong': 'Le chargement est trop long ? Désactivez votre bloqueur de pub et actualisez.'
  },
  'license': {
    'denied': 'Accès refusé : veuillez acheter une licence.'
  },
  // Global rank tag hung in the arena corner (RankBadge.vue). {n} / {rank} are
  // pre-formatted integers; `of` renders on its own line under the rank.
  'leaderboard': {
    'rank': '#{n}',
    'of': 'sur {n}',
    'aria': 'Classement : rang {rank} sur {n}',
    'ariaRank': 'Classement : rang {rank}',
    'signIn': 'Connecte-toi pour participer',
    'signInAria': 'Connecte-toi pour rejoindre le classement'
  },
  // New-tier discovery moment (TierRevealFx.vue): the label over the unit a
  // merge just created for the first time. {n} is the tier number.
  'tierReveal': {
    'title': 'NOUVELLE BALLE !',
    'tier': 'Niveau {n}'
  }
}
