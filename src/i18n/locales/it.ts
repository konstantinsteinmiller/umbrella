import barrage from './barrage/it'
import barrageMeta from './barrageMeta/it'

export default {
  barrage,
  barrageMeta,
  'umbrella': {
    'level': "Livello {n}",
    'finish': "ARRIVO",
    'controls': "←/→ o A/D muoversi · Spazio apre/chiude l'ombrello · R ricomincia",
    'broken': "Ombrello rotto!",
    'prevLevel': "Livello precedente",
    'nextLevel': "Livello successivo",
    'restart': "Ricomincia livello"
  },
  'ads': {
    'watch': 'Guarda', 'revive': 'Rinasci', 'secondChance': 'Seconda chance', 'doubleCoins': '2× monete', 'plusCoins': '+{n} monete'
  },
  'achievements': {
    'title': 'Obiettivi', 'subtitle': 'Raggiungi traguardi per ottenere monete.', 'claim': 'Riscuoti', 'claimed': 'Riscosso', 'progress': '{c} / {t}',
    'unlocked': 'Obiettivo completato!',
    'items': {
      'kills100': { 'name': 'Primo Centinaio', 'desc': 'Sconfiggi 100 nemici.' },
      'kills1k': { 'name': 'Massacratore', 'desc': 'Sconfiggi 1.000 nemici.' },
      'kills10k': { 'name': 'Sterminatore', 'desc': 'Sconfiggi 10.000 nemici.' },
      'wave10': { 'name': 'Difensore della Linea', 'desc': "Raggiungi l'ondata 10." },
      'wave25': { 'name': 'Comandante del Fronte', 'desc': "Raggiungi l'ondata 25." },
      'wave50': { 'name': 'Signore della Guerra', 'desc': "Raggiungi l'ondata 50." },
      'boss1': { 'name': 'Ammazzagiganti', 'desc': 'Sconfiggi il tuo primo boss.' },
      'boss10': { 'name': 'Cacciatore di Boss', 'desc': 'Sconfiggi 10 boss.' },
      'boss50': { 'name': 'Flagello dei Re', 'desc': 'Sconfiggi 50 boss.' },
      'merges50': { 'name': 'Combinatore', 'desc': 'Fondi unità 50 volte.' },
      'merges500': { 'name': 'Maestro della Fusione', 'desc': 'Fondi unità 500 volte.' },
      'tier5': { 'name': 'Fucina Ardente', 'desc': "Crea un'unità di livello 5." },
      'tier8': { 'name': 'Fucina Gelida', 'desc': "Crea un'unità di livello 8." },
      'tier10': { 'name': 'Fucina Cosmica', 'desc': "Crea l'unità di livello 10." },
      'fieldMerge1': { 'name': 'Medico da Campo', 'desc': 'Esegui la tua prima fusione sul campo.' },
      'fieldMerges25': { 'name': 'Fabbro di Battaglia', 'desc': 'Esegui 25 fusioni sul campo.' },
      'combo10': { 'name': 'Furia', 'desc': 'Raggiungi una combo di ×10.' },
      'combo25': { 'name': 'Inarrestabile', 'desc': 'Raggiungi una combo di ×25.' },
      'waves100': { 'name': 'Veterano di Campagna', 'desc': 'Supera 100 ondate in totale.' },
      'waves500': { 'name': 'Guerra Eterna', 'desc': 'Supera 500 ondate in totale.' },
      'tiles1k': { 'name': 'Giramondo', 'desc': 'Percorri 1.000 caselle in totale.' },
      'tiles5k': { 'name': 'Maratoneta', 'desc': 'Percorri 5.000 caselle in totale.' },
      'tiles10k': { 'name': 'Fondista', 'desc': 'Percorri 10.000 caselle in totale.' },
      'tiles100k': { 'name': 'Viaggiatore', 'desc': 'Percorri 100.000 caselle in totale.' },
      'stage5': { 'name': 'Primi passi', 'desc': 'Raggiungi il livello 5.' },
      'stage10': { 'name': 'Esperto', 'desc': 'Raggiungi il livello 10.' },
      'stage20': { 'name': 'Veterano', 'desc': 'Raggiungi il livello 20.' },
      'clears25': { 'name': 'Spazzino', 'desc': 'Completa 25 livelli in totale.' },
      'clears100': { 'name': 'Centurione', 'desc': 'Completa 100 livelli in totale.' },
      'bestRun100': { 'name': 'Velocista', 'desc': 'Percorri 100 caselle in una sola corsa.' },
      'bestRun250': { 'name': 'Demone della distanza', 'desc': 'Percorri 250 caselle in una sola corsa.' },
      'coins5k': { 'name': 'Collezionista di monete', 'desc': 'Raccogli 5.000 monete in totale.' },
      'coins50k': { 'name': 'Tesoriere', 'desc': 'Raccogli 50.000 monete in totale.' },
      'items50': { 'name': 'Apriscatole', 'desc': 'Afferra 50 casse oggetto in totale.' },
      'items250': { 'name': 'Accumulatore', 'desc': 'Afferra 250 casse oggetto in totale.' }
    }
  },
  'gameName': 'Umbrella',
  'cancel': 'Annulla',
  'close': 'Chiudi',
  'ok': 'Ok',
  'continue': 'Continua',
  'tapToContinue': 'Tocca per continuare',
  'clickToContinue': 'Clicca per continuare',
  'stage': 'Livello',
  'rewards': 'RICOMPENSE',
  'tip': 'Consiglio',
  'crazyGamesOnly': 'Questo gioco è disponibile solo su',
  'startTouch': 'Tocca per iniziare',
  'startDesktop': 'Clicca per iniziare',
  'startSubhint': "Rotola verso l'alto — cambia direzione per schivare vuoti e ostacoli!",
  'hints': {
    'tapToTurn': 'Tocca per cambiare direzione',
    'clickToTurn': 'Clicca / Spazio per cambiare direzione'
  },
  'powerups': {
    'invuln': 'Invincibile',
    'magnet': 'Calamita Monete',
    'dodge': 'Maestro di Schivata',
    'slowmo': 'Rallentatore',
    'push': "Forza d'Urto",
   'racer': 'Racer!' },
  'secondChance': {
    'title': 'Continuare?',
    'body': 'Guarda un breve annuncio per rivivere e continuare la corsa.',
    'watch': 'Guarda e continua',
    'skip': 'Salta'
  },
  'result': {
    'win': 'LIVELLO COMPLETATO!',
    'lose': 'GAME OVER',
    'fell': 'Sei caduto in un vuoto!',
    'crashed': 'Hai colpito un ostacolo!',
    'tiles': 'Caselle',
    'winReward': 'incl. +{n} bonus livello',
    'double': 'Raddoppia monete',
    'firstRunDouble': '2× — prima corsa di oggi!',
   'almost': 'Quasi! Ancora {n} caselle.', 'retry': 'Riprova', },
  'upgrades': {
    'title': 'Potenziamenti',
    'subtitle': 'Spendi monete per potenziarti in modo permanente.',
    'level': 'Lv.{n}',
    'maxedOut': 'MAX',
    'sellBack': 'Vendi +{n}',
    'spotlight': 'Spendi!',
    'unlocksAtStage': '🔒 Livello {n}',
    'names': {
      'powerupDuration': 'Boost Potere',
      'magnetRange': 'Raggio Calamita',
      'coinValue': 'Valore Moneta',
      'itemLuck': 'Casse Fortunate',
      'dodgeApprentice': 'Apprendista Schivata',
      'deathMagnet': 'Calamita Mortale',
      'autoCollect': 'Raccolta Automatica',
      'rollingBoulder': 'Masso Rotolante'
    },
    'descriptions': {
      'powerupDuration': 'Tutti i potenziamenti durano di più (+0,75s per livello).',
      'magnetRange': 'La Calamita Monete arriva più lontano.',
      'coinValue': 'Ogni moneta vale di più.',
      'itemLuck': 'Le casse oggetto appaiono più spesso.',
      'dodgeApprentice': 'Schiva auto una casella mortale, poi ricarica (10s; −0,5s per livello).',
      'deathMagnet': 'Alla morte, raccogli tutte le monete entro 4 caselle — incassa ciò che avresti perso.',
      'autoCollect': 'Raccoglie sempre le monete dalle caselle vicine — una calamita monete permanente da 1 casella.',
      'rollingBoulder': 'Rotola dritto attraverso le casse, senza danni.'
    },
    'secondChance': {
      'name': 'Seconda Chance',
      'description': "Inizia ogni corsa con ali d'angelo — sopravvivi a uno schianto o una caduta. Attivo fino all'uso.",
      'active': 'ATTIVO',
      'watch': 'Gratis'
    }
  },
  'prism': {
    'spawn': 'Evoca',
    'instantSpawn': 'Evocazione Rapida',
    'doubleDamage': '2× Danni',
    'freeGold': 'Forziere di Guerra',
    'gridFull': 'Griglia piena — fondi o schiera per fare spazio!',
    'hintDrag': 'Trascina unità uguali per fonderle'
  },
  'welcomeBack': {
    'title': 'Bentornato, comandante!',
    'body': 'Il tuo esercito ha continuato a combattere in tua assenza:'
  },
  'battle': {
    'spellDesc': { 'heal': "Ripristina il 25% della salute di tutte le unità.", 'reviveGuard': "Per 30 s, ogni unità che cade rinasce subito con salute piena.", 'defender': "Trasforma la tua migliore unità da mischia in un tank per 2 min: 2× salute, 80% danni in meno.", 'meteor': "Fa piovere meteore sul campo, colpendo tutti i nemici.", 'warcry': "Per 8 s il tuo esercito infligge +60% di danni e attacca il 30% più velocemente.", 'legionCall': "Evoca per 20 s 3 guerrieri spettrali di un livello inferiore alla tua unità migliore. Si carica in fretta quando le tue unità cadono.", 'executionerMark': "Marchia il nemico più resistente per 10 s: subisce +75% di danni e viene giustiziato sotto il 12% di salute.", 'soulPact': "La tua unità più forte ottiene un gemello: la successiva più forte viene sacrificata per lui. Si ricarica in 3 minuti." },
    'mutationWave': "MUTAZIONE!",
    'overrunSetbackHint': "Queste ondate sono troppo forti: prima potenzia il tuo esercito su ondate più facili.",
    'spells': { 'heal': "Cura", 'reviveGuard': "Guardia di Rinascita", 'defender': "Difensore", 'warcry': "Grido di Guerra della Legione", 'legionCall': "Richiamo della Legione", 'executionerMark': "Marchio del Boia", 'soulPact': "Patto delle Anime" },
    'pactNeedsSacrifice': "Il Patto delle Anime richiede un'unità di livello inferiore in campo da sacrificare.",
    'bossNames': { 'b0': "Glorp il Divoratore", 'b1': "Re Pugnofango", 'b2': "Mawzilla", 'b3': "Il Divora-Cancelli", 'b4': "Grumblor Prime" },
    'wave': 'Ondata {n}',
    'best': 'Record {n}',
    'waveStart': 'Ondata {n}',
    'nextWave': 'Ondata {n} tra…',
    'waveCleared': 'Ondata superata! +{n}',
    'bossIncoming': 'BOSS IN ARRIVO!',
    'overrun': 'TRAVOLTI!',
    'overrunBody': 'Il cancello è caduto — riorganizzati e tieni la linea!',
    'deployHint': 'Rilascia per schierare!',
    'armyFullHint': 'Esercito al completo — rilascia su un combattente dello stesso livello per fondere!',
    'fever': 'FEBBRE!!!',
    'rampage': 'FURIA!',
    'ultimate': 'Tempesta di Meteore',
    'multBounty': '{mult}× il bottino del boss!',
    'upgrades': {
      'attack': 'Corni di Guerra',
      'vitality': 'Vitalità',
      'bounty': 'Bottino',
      'automation': 'Diavoletto',
      'recruit': 'Reclute',
      'maxed': 'MAX',
      'desc': {
        'attack': 'Aumenta i danni d\'attacco di tutto il tuo esercito.',
        'vitality': 'Aumenta la salute massima di ogni combattente.',
        'bounty': 'Guadagna più monete per ogni nemico sconfitto.',
        'automation': 'Unisce le unità al posto tuo, più veloce a ogni livello.',
        'recruit': 'Le nuove unità compaiono a un livello superiore.'
      }
    },
    'nextChest': 'Prossimo: 🎁 ondata {n}',
    'newEnemyAt': "Nuovo nemico all'ondata {n}!",
    'newEnemy': 'Nuovo nemico in arrivo!',
    'chestWave': 'Forziere di guerra! +{n}',
    'waveSetback': "Respinto all'ondata {n}!",
    'rally': 'ADUNATA!',
    'rallyBody': 'Guarda un annuncio per resuscitare i combattenti caduti!',
    'coinBuff': { 'offerTitle': 'Lo scrigno contiene {mult}× oro!', 'label': '{mult}× guadagno monete', 'duration': 'per {m} minuti', 'expiresIn': 'L\'offerta scade in {n}s' },
    'tutorial': {
      'spawn': 'Tocca EVOCA per reclutare due faville!',
      'merge': "Trascina una favilla sull'altra per FONDERLE!",
      'deploy': "Trascina il tuo combattente nell'arena per unirsi alla battaglia!",
      'fieldMerge': "Crea un'altra unità dello stesso livello e lasciala sul tuo combattente per CURARLO e PROMUOVERLO!"
    },
    'codex': {
      'title': 'Codex delle unità',
      'names': { 't1': 'Favilla di Magma', 't2': 'Vortice di Gelo', 't3': 'Bruto di Roccia', 't4': 'Guardiano Glaciale', 't5': 'Goccia di Marea', 't6': 'Colosso di Pietra', 't7': 'Occhio di Nebulosa', 't8': 'Spettro del Vuoto', 't9': 'Artiglio Dorato', 't10': 'Sovrano Fenice', 't11': "Signore della Guerra d'Ossidiana", 't12': "Titano Infernale", 't13': "Mietitore Umbrale", 't14': "Leviatano di Magma", 't15': "Ascendente Cosmico", 't16': "Sovrano delle Tempeste", 't17': "Guardiano Abissale", 't18': "Behemoth Fuso", 't19': "Divoratore Astrale", 't20': "Divinità Eterna", 't21': "Sentinella d'Acciaio", 't22': "Burlone di Mercurio", 't23': "Tiranno Magnetico", 't24': "Custode d'Ambra", 't25': "Djinn delle Dune", 't26': "Fiala Caustica", 't27': "Cuore di Rovi", 't28': "Monarca di Corallo", 't29': "Saggio Fungo Lucente", 't30': "Furia Tempestosa", 't31': "Oracolo di Giada", 't32': "Monolite Runico", 't33': "Motore Crono", 't34': "Spirito Origami", 't35': "Folletto Bolla", 't36': "Cubo Glitch", 't37': "Campana Eco", 't38': "Lanterna Spirituale", 't39': "Spettro Specchio", 't40': "Cuore di Rubino", 't41': "Fuoco Fatuo Gelido", 't42': "Diamante Perfetto", 't43': "Dinamo al Plasma", 't44': "Araldo Cometa", 't45': "Serafino Aurora", 't46': "Imperatore Solare", 't47': "Stella dei Desideri", 't48': "Faro Pulsar", 't49': "Materia Oscura", 't50': "Singolarità Suprema" },
      'locked': 'Fondi due unità di livello {n} per scoprirla!',
      'effects': { 'none': "Colpi rapidi: veloci e implacabili.", 'burn': "I colpi lasciano danni che continuano nel tempo.", 'knockback': "Colpi possenti respingono i nemici.", 'heal': "Ogni colpo cura l'alleato più debole.", 'splash': "Ogni colpo esplode su tutti i nemici vicini.", 'poison': "I colpi accumulano danni nel tempo.", 'chain': "Gli attacchi rimbalzano su altri tre nemici.", 'frost': "Rallenta a ogni colpo; un impulso stordisce i gruppi vicini.", 'midas': "Alta probabilità di critico e oro bonus a ogni colpo.", 'eruption': "Esplode all'impatto e brucia tutti i nemici vicini." },
      'abilities': {
        'none': 'Una favilla fusa: veloce, impavido e sempre in prima linea.',
        'burn': 'Il gelo pungente persiste: i nemici continuano a subire danni dopo il colpo.',
        'knockback': 'Scaglia massi che respingono i nemici.',
        'heal': 'Irradia gelo rigenerante: ogni colpo cura il tuo alleato più debole.',
        'splash': 'Onde fragorose colpiscono tutti i nemici vicini.',
        'poison': 'La polvere soffocante si accumula per infliggere gravi danni nel tempo.',
        'chain': 'Il fuoco stellare rimbalza su tre nemici in più.',
        'frost': 'Un terrore strisciante rallenta i nemici e blocca le folle.',
        'midas': 'Alta probabilità di critico e oro bonus a ogni colpo.',
        'blackhole': "Evoca un vortice rovente che risucchia l'orda e la incenerisce.",
        'eruption': "Erutta all'impatto — uno schizzo incandescente brucia ogni nemico vicino."
      }
    },
    'mutators': {
      'goldRush': "CORSA ALL'ORO! Bottino {mult}×",
      'frostMarch': 'MARCIA GELIDA! Colpi glaciali',
      'horde': 'ORDA! Sciame raddoppiato',
      'elite': "ÉLITE! Un campione guida l'ondata"
    }
  },
  'battlePass': {
    'title': 'Campagna di Guerra',
    'progress': '{current} / {total}',
    'daysLeft': '{n}g rimasti',
    'maxed': 'CAMPAGNA COMPLETATA',
    'xpProgress': '{current} / {total} XP',
    'howToEarn': 'Come guadagnare XP',
    'perAttempt': 'per corsa',
    'perStageFinish': 'per livello completato',
    'perKill': 'per uccisione',
    'perMerge': 'per fusione',
    'perWave': 'per ondata',
    'perBoss': 'per boss',
    'unlockHint': 'Raggiungi {n} XP per sbloccare la prossima ricompensa — le ricompense non riscosse restano finché non le tocchi.'
  },
  'dailyRewards': {
    'title': 'Ricompense Giornaliere',
    'subtitle': 'Accedi ogni giorno per mantenere la serie.',
    'day': 'Giorno {n}',
    'dayShort': 'G{n}'
  },
  'skins': {
    'title': 'Skin Palla',
    'subtitle': 'Spendi monete per sbloccare ed equipaggiare nuovi look.',
    'equip': 'Equipaggia',
    'equipped': 'Equipaggiato',
   'locked': 'Livello {n}', 'new': 'Nuovo!', 'rarity': { 'common': 'Comune', 'rare': 'Raro', 'epic': 'Epico' }, },
  'missions': {
    'title': 'Missioni Giornaliere',
    'subtitle': 'Completa obiettivi ogni giorno per ottenere monete.',
    'claim': 'Riscuoti',
    'done': 'Riscosso',
    'types': {
      'coins': 'Raccogli {n} monete oggi',
      'tiles': 'Percorri {n} caselle in una corsa',
      'items': 'Afferra {n} casse oggetto oggi',
      'clears': 'Completa {n} livelli oggi'
    }
  },
  'endless': {
    'badge': 'Infinito',
    'toEndless': 'Modalità Infinita',
    'toCampaign': 'Campagna',
    'best': 'Record: {n}'
  },
  'boon': {
    'title': 'Scegli un bonus',
    'names': {
      'secondChance': 'Seconda Chance',
      'startPowerup': 'Vantaggio',
      'coinBoost': 'Pioggia di Monete'
    },
    'descriptions': {
      'secondChance': 'Inizia il prossimo livello con uno scudo Seconda Chance.',
      'startPowerup': 'Inizia il prossimo livello con un potenziamento casuale.',
      'coinBoost': '1,2× monete per tutto il prossimo livello.'
    }
  },
  'options': {
    'title': 'Opzioni',
    'general': 'Generale',
    'audio': 'Audio',
    'language': 'Lingua',
    'difficulty': 'Difficoltà',
    'soundEffects': 'Effetti Sonori',
    'music': 'Musica',
    'musicTrack': 'Traccia musicale',
    'musicTracks': {
      'cozy': 'Armonia Accogliente',
      'battle': 'Tema di Battaglia'
    },
    'close': 'Salva e Chiudi',
    'difficulties': { 'easy': 'Facile', 'medium': 'Media', 'hard': 'Difficile' },
    'difficultyHints': {
      'easy': 'Velocità ridotta — più tempo per reagire.',
      'medium': 'Il ritmo standard ed equilibrato.',
      'hard': 'Velocità maggiore — tempismo più preciso.'
    }
  },
  'adsBlocked': {
    'title': 'Impossibile mostrare l\'annuncio',
    'body': 'Abbiamo provato a mostrarti un video per farti guadagnare la ricompensa, ma qualcosa nel tuo browser sta bloccando gli annunci.',
    'allowPrefix': 'Consenti gli annunci su',
    'allowSuffix': '(o metti in pausa il tuo ad-blocker per questo gioco) e riprova.',
    'gotIt': 'Ho capito'
  },
  'saveStatus': {
    'restoredTitle': 'Salvataggio cloud ripristinato',
    'restoredBody': '+{n} monete bonus per il recupero',
    'tap': 'tocca',
    'pausedTitle': 'Sincronizzazione cloud in pausa',
    'pausedBody': 'Stai giocando offline. I tuoi progressi sono salvati qui.',
    'retry': 'Riprova',
    'dismiss': 'chiudi'
  },
  'loading': {
    'tooLong': 'Il caricamento è troppo lento? Disattiva il tuo ad-blocker e ricarica.'
  },
  'license': {
    'denied': 'Accesso negato: acquista una licenza.'
  },
  // Global rank tag hung in the arena corner (RankBadge.vue). {n} / {rank} are
  // pre-formatted integers; `of` renders on its own line under the rank.
  'leaderboard': {
    'rank': '#{n}',
    'of': 'su {n}',
    'aria': 'Classifica: posizione {rank} su {n}',
    'ariaRank': 'Classifica: posizione {rank}',
    'signIn': 'Accedi per partecipare',
    'signInAria': 'Accedi per entrare in classifica'
  },
  // New-tier discovery moment (TierRevealFx.vue): the label over the unit a
  // merge just created for the first time. {n} is the tier number.
  'tierReveal': {
    'title': 'NUOVA SFERA!',
    'tier': 'Livello {n}'
  }
}
