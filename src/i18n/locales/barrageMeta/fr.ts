// Umbrella meta strings ('barrageMeta' namespace: achievements, pass, collections, daily, supply drop).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  'achievements': {
    'title': 'Succès',
    'subtitle': 'Atteins des paliers permanents pour gagner des pièces.',
    'claim': 'Récupérer',
    'claimed': 'Récupéré',
    'unlocked': 'Succès débloqué !',
    'progress': '{c} / {t}',
    'items': {
      'kills100': 'La première centaine',
      'kills1k': 'Tueur de monstres',
      'kills10k': 'Exterminateur',
      'row10': 'Dans la mêlée',
      'row30': 'Siège profond',
      'row60': 'Mur de fer',
      'row100': 'Légende des profondeurs',
      'boss1': 'Tueur de géants',
      'boss10': 'Chasseur de boss',
      'boss50': 'Fléau des rois',
      'merges10': 'Force jumelle',
      'merges100': 'Maître des fusions',
      'merges500': 'Forge de fusion',
      'tier3': 'Première étincelle',
      'tier5': 'Élément montant',
      'tier7': 'Puissance élémentaire',
      'tier9': 'Force primordiale',
      'combo25': 'Ricochet',
      'combo50': 'Réaction en chaîne',
      'combo150': 'Sorcier du flipper',
      'fever1': 'Fièvre montante',
      'fevers25': 'Ruée arc-en-ciel'
    },
    'desc': {
      'kills': 'Monstres vaincus : {n}',
      'bestRow': 'Atteins la rangée {n}',
      'bossKills': 'Boss vaincus : {n}',
      'merges': 'Fusions de billes : {n}',
      'maxBallTier': 'Crée une bille de niveau {n}',
      'bestCombo': 'Coups en une salve : {n}',
      'fevers': 'Salves FIÈVRE : {n}'
    }
  },
  'pass': {
    'title': 'Passe Barrage',
    'progress': 'Palier {current} / {total}',
    'daysLeft': '{n}j restants',
    'maxed': 'PASSE TERMINÉ',
    'xpProgress': '{current} / {total} XP',
    'xpAmount': '+{n} XP',
    'howToEarn': "Comment gagner de l'XP",
    'perKill': 'par élimination',
    'perMerge': 'par fusion',
    'perRow': 'par rangée',
    'perBoss': 'par boss',
    'unlockHint': "Atteins {n} XP pour débloquer la récompense suivante — les récompenses non récupérées t'attendent jusqu'à ce que tu les touches.",
    'ballReward': 'Bille de niveau {tier} offerte'
  },
  'collections': {
    'title': 'Collection',
    'launchers': 'Lanceurs',
    'skins': 'Skins de billes',
    'buy': 'Acheter',
    'equip': 'Équiper',
    'equipped': 'Équipé',
    'new': 'Nouveau !',
    'undiscovered': 'Non découvert',
    'discoverHint': 'Fusionne une bille de niveau {tier} pour le découvrir',
    'tier': 'Niveau {tier}',
    'rarity': {
      'common': 'Commun',
      'rare': 'Rare',
      'epic': 'Épique',
      'legendary': 'Légendaire'
    },
    'skinNames': {
      'orb': 'Orbe de verre',
      'stone': 'Pierre',
      'tide': 'Marée',
      'gale': 'Bourrasque',
      'frost': 'Givre',
      'amber': 'Ambre',
      'lava': 'Lave',
      'diamond': 'Diamant',
      'obsidian': 'Obsidienne',
      'glow': 'Rune lumineuse',
      'gilded': 'Doré',
      'eclipse': 'Éclipse'
    }
  },
  'daily': {
    'title': 'Barrage du jour',
    'subtitle': "Tout le monde joue le même plateau aujourd'hui. Jusqu'où iras-tu ?",
    'rules': 'Ni améliorations ni reprises — seulement ta visée.',
    'play': 'Jouer',
    'best': 'Record du jour : rangée {n}',
    'attempts': "Essais aujourd'hui : {n}",
    'streak': 'Série de jours : {n}',
    'newBest': 'Nouveau record du jour !'
  },
  'supply': {
    'title': 'Coffre au trésor',
    'ready': 'Prêt !',
    'readyIn': 'Prochain cadeau dans {time}',
    'biggerIn': 'Plus gros cadeau (+{n}) dans {time}',
    'gift': '+{n}',
    'open': 'Ouvrir',
    'coins': '+{n} pièces',
    'bonusCharge': 'Charge bonus : {skill}'
  }
}
