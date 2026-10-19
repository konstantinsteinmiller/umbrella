// Umbrella meta strings ('barrageMeta' namespace: achievements, pass, collections, daily, supply drop).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  'achievements': {
    'title': 'Logros',
    'subtitle': 'Alcanza hitos permanentes para ganar monedas.',
    'claim': 'Reclamar',
    'claimed': 'Reclamado',
    'unlocked': '¡Logro completado!',
    'progress': '{c} / {t}',
    'items': {
      'kills100': 'Los primeros cien',
      'kills1k': 'Cazamonstruos',
      'kills10k': 'Exterminador',
      'row10': 'A la refriega',
      'row30': 'Asedio profundo',
      'row60': 'Muro de hierro',
      'row100': 'Leyenda de las profundidades',
      'boss1': 'Matagigantes',
      'boss10': 'Cazajefes',
      'boss50': 'Azote de reyes',
      'merges10': 'Poder gemelo',
      'merges100': 'Maestro de fusiones',
      'merges500': 'Forja de fusión',
      'tier3': 'Primera chispa',
      'tier5': 'Elemento en ascenso',
      'tier7': 'Poder elemental',
      'tier9': 'Fuerza primigenia',
      'combo25': 'Rebote',
      'combo50': 'Reacción en cadena',
      'combo150': 'Mago del pinball',
      'fever1': 'Fiebre total',
      'fevers25': 'Furia arcoíris'
    },
    'desc': {
      'kills': 'Monstruos derrotados: {n}',
      'bestRow': 'Llega a la fila {n}',
      'bossKills': 'Jefes derrotados: {n}',
      'merges': 'Fusiones de bolas: {n}',
      'maxBallTier': 'Crea una bola de nivel {n}',
      'bestCombo': 'Impactos en una ráfaga: {n}',
      'fevers': 'Ráfagas de FIEBRE: {n}'
    }
  },
  'pass': {
    'title': 'Pase Barrage',
    'progress': 'Nivel {current} / {total}',
    'daysLeft': 'quedan {n} d',
    'maxed': 'PASE COMPLETADO',
    'xpProgress': '{current} / {total} XP',
    'xpAmount': '+{n} XP',
    'howToEarn': 'Cómo ganar XP',
    'perKill': 'por baja',
    'perMerge': 'por fusión',
    'perRow': 'por fila',
    'perBoss': 'por jefe',
    'unlockHint': 'Consigue {n} XP para desbloquear la siguiente recompensa: las recompensas sin reclamar se guardan hasta que las toques.',
    'ballReward': 'Bola de nivel {tier} gratis'
  },
  'collections': {
    'title': 'Colección',
    'launchers': 'Lanzadores',
    'skins': 'Aspectos de bola',
    'buy': 'Comprar',
    'equip': 'Equipar',
    'equipped': 'Equipado',
    'new': '¡Nuevo!',
    'undiscovered': 'Sin descubrir',
    'discoverHint': 'Fusiona una bola de nivel {tier} para descubrirlo',
    'tier': 'Nivel {tier}',
    'rarity': {
      'common': 'Común',
      'rare': 'Raro',
      'epic': 'Épico',
      'legendary': 'Legendario'
    },
    'skinNames': {
      'orb': 'Orbe de cristal',
      'stone': 'Piedra',
      'tide': 'Marea',
      'gale': 'Vendaval',
      'frost': 'Escarcha',
      'amber': 'Ámbar',
      'lava': 'Lava',
      'diamond': 'Diamante',
      'obsidian': 'Obsidiana',
      'glow': 'Runa brillante',
      'gilded': 'Dorado',
      'eclipse': 'Eclipse'
    }
  },
  'daily': {
    'title': 'Barrage diario',
    'subtitle': 'Hoy todos juegan el mismo tablero. ¿Hasta dónde llegarás?',
    'rules': 'Sin mejoras ni continuaciones: solo tu puntería.',
    'play': 'Jugar',
    'best': 'Récord de hoy: fila {n}',
    'attempts': 'Intentos hoy: {n}',
    'streak': 'Racha de días: {n}',
    'newBest': '¡Nuevo récord diario!'
  },
  'supply': {
    'title': 'Cofre del tesoro',
    'ready': '¡Listo!',
    'readyIn': 'Próximo regalo en {time}',
    'biggerIn': 'Regalo mayor (+{n}) en {time}',
    'gift': '+{n}',
    'open': 'Abrir',
    'coins': '+{n} monedas',
    'bonusCharge': 'Carga extra: {skill}'
  }
}
