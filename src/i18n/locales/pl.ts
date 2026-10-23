import barrage from './barrage/pl'
import barrageMeta from './barrageMeta/pl'

export default {
  barrage,
  barrageMeta,
  'umbrella': {
    'level': "Poziom {n}",
    'finish': "META",
    'controls': "←/→ lub A/D ruch · Spacja otwiera/zamyka parasol · R restart",
    'broken': "Parasol zepsuty!",
    'prevLevel': "Poprzedni poziom",
    'nextLevel': "Następny poziom",
    'restart': "Zrestartuj poziom",
    'selectLevel': "Wybierz poziom",
    'close': "Zamknij",
    'mute': "Wycisz dźwięk",
    'unmute': "Włącz dźwięk",
    'joystick': "Ruch w lewo / prawo",
    'umbrellaButton': "Otwórz / zamknij parasol",
    'back': "Wstecz",
    'reviveRestart': "Zacznij od początku",
    'sharedSaved': "„{name}” zapisano w twoich poziomach",
    'sharedBroken': "Ten link do poziomu jest uszkodzony lub niepełny",
    'rateLevel': "Oceń ten poziom",
    'myLevels': "Moje poziomy",
    'myLevelsEmpty': "Tu pojawiają się poziomy otwarte z udostępnionego linku lub zbudowane w edytorze.",
    'intro': {
      'skip': "Pomiń ▸"
    },
    'pause': {
      'open': "Pauza",
      'title': "Wstrzymano",
      'resume': "Wznów",
      'settings': "Ustawienia",
      'intro': "Obejrzyj intro"
    },
    'community': {
      'button': "Społeczność",
      'open': "Poziomy społeczności",
      'title': "Poziomy społeczności",
      'create': "Stwórz poziom",
      'createHint': "Zbuduj własny poziom w edytorze i podziel się nim ze wszystkimi.",
      'sortRating': "Najlepiej oceniane",
      'sortNewest': "Najnowsze",
      'sortPlays': "Najczęściej grane",
      'sortLabel': "Sortuj według",
      'layout': "Widok",
      'layoutGrid': "Siatka",
      'layoutList': "Lista",
      'play': "Graj",
      'by': "autor: {author}",
      'anonymous': "anonim",
      'plays': "brak rozgrywek | 1 rozgrywka | rozgrywki: {n}",
      'ratings': "brak ocen | 1 ocena | oceny: {n}",
      'loading': "Wczytywanie poziomów…",
      'empty': "Brak poziomów — dodaj pierwszy!",
      'error': "Nie można połączyć się z serwerem poziomów. Sprawdź połączenie i spróbuj ponownie.",
      'retry': "Spróbuj ponownie",
      'prev': "Poprzednia strona",
      'next': "Następna strona",
      'page': "Strona {page} z {pages}",
      'opening': "Otwieranie poziomu…",
      'broken': "Nie udało się otworzyć tego poziomu."
    },
    'rate': {
      'title': "Jak ci się podobał „{name}”?",
      'stars': "Gwiazdki: {n}",
      'skip': "Nie teraz",
      'send': "Wyślij ocenę",
      'thanks': "Dzięki za ocenę!",
      'error': "Nie udało się wysłać oceny."
    }
  },
  'umbrellaEditor': {
    'title': "Edytor poziomów",
    'untitled': "bez nazwy",
    'namePlaceholder': "Nazwa poziomu",
    'share': "Udostępnij",
    'submitShort': "Wyślij",
    'toolsTitle': "Narzędzia",
    'levelTitle': "Poziom",
    'selectionTitle': "Zaznaczenie",
    'switchTitle': "Przełącznik",
    'motionTitle': "Ruch",
    'menu': {
      'file': "Plik",
      'edit': "Edycja",
      'view': "Widok",
      'level': "Poziom",
      'help': "Pomoc"
    },
    'cmd': {
      'new': "Nowy poziom",
      'open': "Otwórz…",
      'save': "Zapisz",
      'importLevel': "Importuj plik poziomu…",
      'exportLevel': "Eksportuj plik poziomu",
      'prevLevel': "Poprzedni poziom kampanii",
      'nextLevel': "Następny poziom kampanii",
      'back': "Wróć do gry",
      'undo': "Cofnij",
      'redo': "Ponów",
      'duplicate': "Duplikuj",
      'delete': "Usuń",
      'deselect': "Odznacz",
      'fit': "Dopasuj do okna",
      'zoomIn': "Przybliż",
      'zoomOut': "Oddal",
      'snap': "Przyciągaj do siatki 10 px",
      'animate': "Animuj ruchome obiekty",
      'mobile': "Podgląd na telefonie",
      'test': "Testuj",
      'share': "Kopiuj link do udostępnienia",
      'submit': "Wyślij do społeczności…",
      'shortcuts': "Skróty klawiszowe"
    },
    'toolGroup': {
      'build': "Budowa",
      'currents': "Prądy",
      'hazards': "Zagrożenia",
      'switches': "Przełączniki"
    },
    'tool': {
      'select': "Zaznacz / przesuń",
      'platform': "Platforma",
      'finish': "Meta",
      'spawn': "Start gracza",
      'checkpoint': "Punkt kontrolny",
      'button': "Przycisk",
      'wind-up': "Prąd wznoszący",
      'wind-down': "Prąd opadający",
      'wind-left': "Wiatr w lewo",
      'wind-right': "Wiatr w prawo",
      'super': "Super Stream",
      'pillar': "Walldorf",
      'mine': "Mina",
      'spikes-up': "Kolce w górę",
      'spikes-down': "Kolce w dół"
    },
    'toolHint': {
      'select': "Kliknij, aby zaznaczyć, przeciągnij, aby przesunąć. Zielony róg zmienia rozmiar; żółte kropki przesuwają ścieżkę.",
      'platform': "Przeciągnij prostokąt, aby narysować platformę.",
      'finish': "Przeciągnij prostokąt mety — lądowanie na niej wygrywa poziom.",
      'spawn': "Kliknij miejsce startu gracza.",
      'checkpoint': "Kliknij na platformie: po dotknięciu flagi upadek przenosi gracza tutaj.",
      'button': "Kliknij górną krawędź platformy. Dotknięcie przycisku przełącza wszystko na jego kanale.",
      'wind-up': "Przeciągnij prostokąt prądu wiejącego w górę.",
      'wind-down': "Przeciągnij prostokąt prądu wiejącego w dół.",
      'wind-left': "Przeciągnij prostokąt prądu wiejącego w lewo.",
      'wind-right': "Przeciągnij prostokąt prądu wiejącego w prawo.",
      'super': "Przeciągnij prostokąt Super Stream — bardzo szybki, może rozpłaszczyć gracza o sufit.",
      'pillar': "Kliknij, aby postawić Walldorfa.",
      'mine': "Kliknij, aby postawić minę.",
      'spikes-up': "Przeciągnij wzdłuż podłogi, aby dodać kolce w górę.",
      'spikes-down': "Przeciągnij wzdłuż sufitu, aby dodać kolce w dół."
    },
    'canvasHint': "Kółko myszy przybliża, środkowy przycisk lub Alt z przeciąganiem przesuwa widok, dwuklik w pustym miejscu dopasowuje. Prawy przycisk usuwa.",
    'kind': {
      'platform': "Platforma",
      'finish': "Platforma mety",
      'wind': "Prąd",
      'super': "Super Stream",
      'pillar': "Walldorf",
      'mine': "Mina",
      'spikes': "Kolce",
      'button': "Przycisk",
      'checkpoint': "Punkt kontrolny"
    },
    'dir': {
      'up': "w górę",
      'down': "w dół",
      'left': "w lewo",
      'right': "w prawo"
    },
    'world': {
      'custom': "własny",
      'one': "1 ekran",
      'wide2': "2 ekrany szerokości, przewijany",
      'wide3': "3 ekrany szerokości, przewijany",
      'tall2': "2 ekrany wysokości, przewijany",
      'grid2': "2 × 2 ekrany, przewijany",
      'zoom2': "oddalenie 2×",
      'zoom3': "oddalenie 3×"
    },
    'prop': {
      'world': "Rozmiar świata",
      'worldW': "Szerokość",
      'worldH': "Wysokość",
      'scrolls': "Kamera podąża za graczem",
      'screenW': "Ekran szer.",
      'screenH': "Ekran wys.",
      'finish': "Meta",
      'direction': "Kierunek",
      'speed': "Prędkość",
      'switchedBy': "Przełączane przez",
      'noSwitch': "nic (zawsze włączone)",
      'channel': "Przycisk {n}",
      'channelLabel': "Kanał",
      'platformShows': "Stała",
      'whileOn': "gdy włączony",
      'whileOff': "gdy wyłączony",
      'same': "bez zmian",
      'mode': "Tryb",
      'toggle': "Przełącz (wł. / wył.)",
      'timed': "Czasowy",
      'seconds': "Sekundy włączenia",
      'harmless': "Nieszkodliwe (stałe, nie rani)",
      'touch': "Przy dotknięciu",
      'touchDeadly': "Zabójczy",
      'touchSolid': "Twardy blok",
      'touchBounce': "Odbijacz",
      'followMode': "Podąża",
      'bounce': "Siła odbicia",
      'points': "Punkty",
      'trigger': "Atakuje, gdy gracz jest blisko"
    },
    'scrollHint': "Kamera pokazuje jeden ekran i podąża za graczem.",
    'wholeHint': "Cały świat jest widoczny naraz (oddalony, jeśli jest większy niż ekran).",
    'spawnSelected': "Start gracza (pozycja stóp).",
    'nothingSelected': "Nic nie zaznaczono — wybierz coś na płótnie.",
    'switchedWindHint': "Gdy kanał przycisku jest włączony, ten prąd zmienia się na:",
    'speedZeroHint': "Prędkość 0 zatrzymuje prąd.",
    'toggleHint': "Każde dotknięcie włącza lub wyłącza kanał.",
    'timedHint': "Dotknięcie włącza kanał na {s} s.",
    'checkpointHint': "Po dotknięciu tej flagi upadek przenosi gracza tutaj.",
    'touchHint': {
      'deadly': "Dotknięcie zaczyna poziom od nowa.",
      'solid': "Nieszkodliwy blok: można w niego uderzyć i na nim stanąć.",
      'bounce': "Jak odbijacz we flipperze: odrzuca Pweega do tyłu. Szarża odrzuca dużo mocniej."
    },
    'triggerHint': "Czeka, aż gracz będzie w powietrzu i blisko, potem atakuje raz",
    'pathHint': "Przeciągnij żółte kropki na płótnie, aby zmienić ścieżkę (pomarańczowa = koniec).",
    'followMode': {
      'both': "swobodnie",
      'x': "tylko lewo / prawo",
      'y': "tylko góra / dół",
      'path': "wzdłuż ścieżki"
    },
    'followHint': {
      'both': "Powoli goni Pweega, dokądkolwiek pójdzie.",
      'x': "Porusza się tylko w bok, by być na wysokości Pweega.",
      'y': "Porusza się tylko w górę i w dół, by być na wysokości Pweega.",
      'path': "Sunie po swojej ścieżce do punktu najbliżej Pweega — zastawia mu drogę."
    },
    'motion': {
      'static': "nieruchomy",
      'line': "tam i z powrotem",
      'circle': "okrąg",
      'swing': "wahadło",
      'lunge': "wypad",
      'arrive': "wlot",
      'follow': "podąża za graczem"
    },
    'motionField': {
      'period': "Okres (s)",
      'radius': "Promień",
      'amplitude': "Wychylenie",
      'speed': "Prędkość wypadu ×",
      'delay': "Opóźnienie (s)",
      'duration': "Lot (s)",
      'followSpeed': "Szybkość pościgu"
    },
    'problem': {
      'noFinish': "Brak platformy mety — poziomu nie da się wygrać.",
      'spawnOutside': "Start gracza jest poza światem.",
      'noScroll': "Ekran obejmuje cały świat — nic się nie przewija.",
      'noButton': "Coś jest przełączane przez kanał bez przycisku."
    },
    'startScreen': "ekran startowy",
    'portrait': "Pionowo",
    'landscape': "Poziomo",
    'mobileHint': "Test: joystick na ekranie i przycisk ☂ albo ←/→, A/D i Spacja · R restart · edycja restartuje",
    'myLevels': "Moje poziomy",
    'campaignLevels': "Poziomy kampanii",
    'openBtn': "Otwórz",
    'deleteBtn': "Usuń „{name}”",
    'noSaved': "Brak zapisanych poziomów — zbuduj jakiś i naciśnij Zapisz.",
    'campaignCopy': "mój poziom {n}",
    'campaignCopyHint': "Poziom kampanii otwiera się jako twoja kopia: zmieniaj, zapisuj, udostępniaj.",
    'confirmDelete': "Usunąć zapisany poziom „{name}”?",
    'shareTitle': "Link do udostępnienia",
    'shareHint': "Każdy, kto otworzy ten link, zagra w twój poziom, a ten zapisze się w jego poziomach.",
    'copyLink': "Kopiuj link",
    'copied': "Skopiowano do schowka",
    'submitTitle': "Wyślij do społeczności",
    'submitRule': "Możesz wysłać do {n} poziomów tygodniowo. Wysłane poziomy są publiczne: każdy może w nie grać i je oceniać.",
    'submitLeft': "w tym tygodniu nie zostały żadne zgłoszenia | w tym tygodniu zostało 1 zgłoszenie | zgłoszenia pozostałe w tym tygodniu: {n}",
    'levelName': "Nazwa poziomu",
    'authorName': "Twoje imię (opcjonalnie)",
    'authorPlaceholder': "anonim",
    'submitBtn': "Wyślij poziom",
    'submitting': "Wysyłanie…",
    'submitDone': "Wysłano! Twój poziom jest teraz na liście społeczności.",
    'submitLimit': "Wykorzystano zgłoszenia na ten tydzień. Możesz znów wysłać {date}.",
    'submitError': "Nie udało się wysłać poziomu. Sprawdź połączenie i spróbuj ponownie.",
    'nudge': "Przesuń zaznaczenie (Shift: 10 px)",
    'msg': {
      'newLevel': "Nowy poziom",
      'saved': "Zapisano „{name}”",
      'opened': "Otwarto „{name}”",
      'deleted': "Usunięto „{name}”",
      'openedCampaign': "Otwarto poziom kampanii {n}",
      'exported': "Wyeksportowano „{name}”",
      'imported': "Otwarto „{name}” — zapisz, aby go zachować",
      'noLevelInFile': "Ten plik nie zawiera poziomu Umbrella",
      'fileBroken': "Nie można odczytać tego pliku"
    }
  },
  'ads': {
    'watch': 'Obejrzyj', 'revive': 'Wskrześ', 'secondChance': 'Druga szansa', 'doubleCoins': '2× monety', 'plusCoins': '+{n} monet'
  },
  'achievements': {
    'title': 'Osiągnięcia', 'subtitle': 'Zdobywaj kamienie milowe, by zarobić monety.', 'claim': 'Odbierz', 'claimed': 'Odebrano', 'progress': '{c} / {t}',
    'unlocked': 'Osiągnięcie zdobyte!',
    'items': {
      'kills100': { 'name': 'Pierwsza Setka', 'desc': 'Pokonaj 100 wrogów.' },
      'kills1k': { 'name': 'Pogromca', 'desc': 'Pokonaj 1000 wrogów.' },
      'kills10k': { 'name': 'Eksterminator', 'desc': 'Pokonaj 10 000 wrogów.' },
      'wave10': { 'name': 'Obrońca Linii', 'desc': 'Osiągnij falę 10.' },
      'wave25': { 'name': 'Dowódca Frontu', 'desc': 'Osiągnij falę 25.' },
      'wave50': { 'name': 'Władca Wojny', 'desc': 'Osiągnij falę 50.' },
      'boss1': { 'name': 'Pogromca Olbrzymów', 'desc': 'Pokonaj pierwszego bossa.' },
      'boss10': { 'name': 'Łowca Bossów', 'desc': 'Pokonaj 10 bossów.' },
      'boss50': { 'name': 'Zguba Królów', 'desc': 'Pokonaj 50 bossów.' },
      'merges50': { 'name': 'Łączący', 'desc': 'Połącz jednostki 50 razy.' },
      'merges500': { 'name': 'Mistrz Fuzji', 'desc': 'Połącz jednostki 500 razy.' },
      'tier5': { 'name': 'Płonąca Kuźnia', 'desc': 'Stwórz jednostkę poziomu 5.' },
      'tier8': { 'name': 'Mroźna Kuźnia', 'desc': 'Stwórz jednostkę poziomu 8.' },
      'tier10': { 'name': 'Kosmiczna Kuźnia', 'desc': 'Stwórz jednostkę poziomu 10.' },
      'fieldMerge1': { 'name': 'Medyk Polowy', 'desc': 'Wykonaj pierwszą fuzję w polu.' },
      'fieldMerges25': { 'name': 'Kowal Bitewny', 'desc': 'Wykonaj 25 fuzji w polu.' },
      'combo10': { 'name': 'Szał', 'desc': 'Osiągnij combo ×10.' },
      'combo25': { 'name': 'Niepowstrzymany', 'desc': 'Osiągnij combo ×25.' },
      'waves100': { 'name': 'Weteran Kampanii', 'desc': 'Ukończ łącznie 100 fal.' },
      'waves500': { 'name': 'Wieczna Wojna', 'desc': 'Ukończ łącznie 500 fal.' },
      'tiles1k': { 'name': 'Globtroter', 'desc': 'Pokonaj łącznie 1 000 pól.' },
      'tiles5k': { 'name': 'Maratończyk', 'desc': 'Pokonaj łącznie 5 000 pól.' },
      'tiles10k': { 'name': 'Długodystansowiec', 'desc': 'Pokonaj łącznie 10 000 pól.' },
      'tiles100k': { 'name': 'Podróżnik', 'desc': 'Pokonaj łącznie 100 000 pól.' },
      'stage5': { 'name': 'Pierwsze kroki', 'desc': 'Osiągnij etap 5.' },
      'stage10': { 'name': 'Doświadczony', 'desc': 'Osiągnij etap 10.' },
      'stage20': { 'name': 'Weteran', 'desc': 'Osiągnij etap 20.' },
      'clears25': { 'name': 'Porządkowy', 'desc': 'Ukończ łącznie 25 etapów.' },
      'clears100': { 'name': 'Centurion', 'desc': 'Ukończ łącznie 100 etapów.' },
      'bestRun100': { 'name': 'Sprinter', 'desc': 'Pokonaj 100 pól w jednym biegu.' },
      'bestRun250': { 'name': 'Demon dystansu', 'desc': 'Pokonaj 250 pól w jednym biegu.' },
      'coins5k': { 'name': 'Kolekcjoner monet', 'desc': 'Zbierz łącznie 5 000 monet.' },
      'coins50k': { 'name': 'Skarbnik', 'desc': 'Zbierz łącznie 50 000 monet.' },
      'items50': { 'name': 'Rozpakowywacz', 'desc': 'Złap łącznie 50 skrzyń z przedmiotami.' },
      'items250': { 'name': 'Zbieracz', 'desc': 'Złap łącznie 250 skrzyń z przedmiotami.' }
    }
  },
  'gameName': 'Umbrella',
  'cancel': 'Anuluj',
  'close': 'Zamknij',
  'ok': 'Ok',
  'continue': 'Kontynuuj',
  'tapToContinue': 'Dotknij, aby kontynuować',
  'clickToContinue': 'Kliknij, aby kontynuować',
  'stage': 'Etap',
  'rewards': 'NAGRODY',
  'tip': 'Wskazówka',
  'crazyGamesOnly': 'Ta gra jest dostępna tylko na',
  'startTouch': 'Dotknij, aby rozpocząć',
  'startDesktop': 'Kliknij, aby rozpocząć',
  'startSubhint': 'Tocz się w górę — zmieniaj kierunek, aby omijać luki i przeszkody!',
  'hints': {
    'tapToTurn': 'Dotknij, aby zmienić kierunek',
    'clickToTurn': 'Kliknij / Spacja, aby zmienić kierunek'
  },
  'powerups': {
    'invuln': 'Niezniszczalny',
    'magnet': 'Magnes na Monety',
    'dodge': 'Mistrz Uniku',
    'slowmo': 'Zwolnione Tempo',
    'push': 'Siła Pchnięcia',
   'racer': 'Racer!' },
  'secondChance': {
    'title': 'Toczyć dalej?',
    'body': 'Obejrzyj krótką reklamę, aby ożyć i kontynuować bieg.',
    'watch': 'Obejrzyj i kontynuuj',
    'skip': 'Pomiń'
  },
  'result': {
    'win': 'ETAP UKOŃCZONY!',
    'lose': 'KONIEC GRY',
    'fell': 'Wpadłeś w szczelinę!',
    'crashed': 'Uderzyłeś w przeszkodę!',
    'tiles': 'Pola',
    'winReward': 'w tym +{n} bonus za etap',
    'double': 'Podwój monety',
    'firstRunDouble': '2× — pierwszy bieg dzisiaj!',
   'almost': 'Prawie! Jeszcze {n} pól.', 'retry': 'Ponów', },
  'upgrades': {
    'title': 'Ulepszenia',
    'subtitle': 'Wydawaj monety, aby trwale się wzmocnić.',
    'level': 'Poz.{n}',
    'maxedOut': 'MAKS',
    'sellBack': 'Sprzedaj +{n}',
    'spotlight': 'Wydaj!',
    'unlocksAtStage': '🔒 Etap {n}',
    'names': {
      'powerupDuration': 'Wzmocnienie Mocy',
      'magnetRange': 'Zasięg Magnesu',
      'coinValue': 'Wartość Monety',
      'itemLuck': 'Szczęśliwe Skrzynie',
      'dodgeApprentice': 'Uczeń Uniku',
      'deathMagnet': 'Magnes Śmierci',
      'autoCollect': 'Auto-Zbieranie',
      'rollingBoulder': 'Toczący się Głaz'
    },
    'descriptions': {
      'powerupDuration': 'Wszystkie ulepszenia trwają dłużej (+0,75s na poziom).',
      'magnetRange': 'Magnes na Monety sięga dalej.',
      'coinValue': 'Każda moneta jest warta więcej.',
      'itemLuck': 'Skrzynie z przedmiotami pojawiają się częściej.',
      'dodgeApprentice': 'Automatyczny unik przed jednym śmiertelnym polem, potem ładowanie (10s; −0,5s na poziom).',
      'deathMagnet': 'Po śmierci zgarniasz każdą monetę w promieniu 4 pól — zachowaj to, co inaczej byś stracił.',
      'autoCollect': 'Zawsze zbieraj monety z pobliskich pól — stały magnes o zasięgu 1 pola.',
      'rollingBoulder': 'Tocz się prosto przez skrzynie bez szwanku.'
    },
    'secondChance': {
      'name': 'Druga Szansa',
      'description': 'Zaczynaj każdy bieg ze skrzydłami anioła — przetrwaj jeden upadek lub zderzenie. Aktywne do użycia.',
      'active': 'AKTYWNE',
      'watch': 'Za darmo'
    }
  },
  'prism': {
    'spawn': 'Przyzwij',
    'instantSpawn': 'Szybki Przyzew',
    'doubleDamage': '2× Obrażenia',
    'freeGold': 'Skrzynia Wojenna',
    'gridFull': 'Siatka pełna — połącz lub wystaw jednostki, by zrobić miejsce!',
    'hintDrag': 'Przeciągnij jednakowe jednostki, aby je połączyć'
  },
  'welcomeBack': {
    'title': 'Witaj z powrotem, dowódco!',
    'body': 'Twoja armia walczyła dalej pod twoją nieobecność:'
  },
  'battle': {
    'spellDesc': { 'heal': "Przywraca 25% zdrowia wszystkich jednostek.", 'reviveGuard': "Przez 30 s każda poległa jednostka natychmiast odradza się z pełnym zdrowiem.", 'defender': "Zamienia najlepszą jednostkę walczącą wręcz w czołg na 2 min: 2× zdrowia, 80% mniej obrażeń.", 'meteor': "Zsyła deszcz meteorów na pole, rażąc wszystkich wrogów.", 'warcry': "Przez 8 s twoja armia zadaje +60% obrażeń i atakuje o 30% szybciej.", 'legionCall': "Przyzywa na 20 s 3 widmowych wojowników o poziom niższych od twojej najlepszej jednostki. Ładuje się szybko, gdy twoje jednostki giną.", 'executionerMark': "Oznacza najtwardszego wroga na 10 s: otrzymuje +75% obrażeń i ginie poniżej 12% zdrowia.", 'soulPact': "Twoja najsilniejsza jednostka zyskuje bliźniaka — kolejna najsilniejsza zostaje za to poświęcona. Odnawia się w 3 minuty." },
    'mutationWave': "MUTACJA!",
    'overrunSetbackHint': "Te fale są dla ciebie za silne — najpierw rozbuduj armię na łatwiejszych falach.",
    'spells': { 'heal': "Leczenie", 'reviveGuard': "Straż Wskrzeszenia", 'defender': "Obrońca", 'warcry': "Okrzyk Wojenny Legionu", 'legionCall': "Zew Legionu", 'executionerMark': "Znak Kata", 'soulPact': "Pakt Dusz" },
    'pactNeedsSacrifice': "Pakt Dusz wymaga jednostki niższego poziomu na polu do poświęcenia.",
    'bossNames': { 'b0': "Glorp Pożeracz", 'b1': "Król Błotna Pięść", 'b2': "Mawzilla", 'b3': "Pożeracz Bram", 'b4': "Grumblor Prime" },
    'wave': 'Fala {n}',
    'best': 'Rekord {n}',
    'waveStart': 'Fala {n}',
    'nextWave': 'Fala {n} za…',
    'waveCleared': 'Fala ukończona! +{n}',
    'bossIncoming': 'NADCIĄGA BOSS!',
    'overrun': 'PRZEŁAMANIE!',
    'overrunBody': 'Brama padła — przegrupuj się i utrzymaj linię!',
    'deployHint': 'Upuść, aby wystawić!',
    'armyFullHint': 'Armia pełna — upuść na wojownika tego samego poziomu, aby połączyć!',
    'fever': 'GORĄCZKA!!!',
    'rampage': 'SZAŁ!',
    'ultimate': 'Deszcz Meteorów',
    'multBounty': '{mult}× łupu z bossa!',
    'upgrades': {
      'attack': 'Rogi Wojenne',
      'vitality': 'Witalność',
      'bounty': 'Łup',
      'automation': 'Chochlik',
      'recruit': 'Rekruci',
      'maxed': 'MAKS',
      'desc': {
        'attack': 'Zwiększa obrażenia ataku całej twojej armii.',
        'vitality': 'Zwiększa maksymalne zdrowie każdego wojownika.',
        'bounty': 'Zdobywaj więcej monet za każdego pokonanego wroga.',
        'automation': 'Automatycznie łączy za ciebie jednostki, szybciej z każdym poziomem.',
        'recruit': 'Nowe jednostki pojawiają się na wyższym poziomie.'
      }
    },
    'nextChest': 'Następna: 🎁 fala {n}',
    'newEnemyAt': 'Nowy wróg od fali {n}!',
    'newEnemy': 'Nadciąga nowy wróg!',
    'chestWave': 'Skrzynia wojenna! +{n}',
    'waveSetback': 'Cofnięto do fali {n}!',
    'rally': 'ZBIÓRKA!',
    'rallyBody': 'Obejrzyj reklamę, aby wskrzesić poległych wojowników!',
    'coinBuff': { 'offerTitle': 'W skrzyni jest {mult}× złota!', 'label': '{mult}× dochód z monet', 'duration': 'na {m} minut', 'expiresIn': 'Oferta kończy się za {n}s' },
    'tutorial': {
      'spawn': 'Stuknij PRZYZWIJ, aby zrekrutować dwie iskry!',
      'merge': 'Przeciągnij jedną iskrę na drugą, aby je POŁĄCZYĆ!',
      'deploy': 'Przeciągnij wojownika na arenę, aby dołączył do walki!',
      'fieldMerge': 'Stwórz kolejną jednostkę tego samego poziomu i upuść ją na wojownika — ULECZY i AWANSUJE!'
    },
    'codex': {
      'title': 'Kodeks jednostek',
      'names': { 't1': 'Iskra Magmy', 't2': 'Lodowy Wir', 't3': 'Skalny Brutal', 't4': 'Lodowcowy Strażnik', 't5': 'Kropla Przypływu', 't6': 'Kamienny Kolos', 't7': 'Oko Mgławicy', 't8': 'Widmo Pustki', 't9': 'Złoty Szpon', 't10': 'Władca Feniks', 't11': 'Obsydianowy Wódz', 't12': "Piekielny Tytan", 't13': "Mroczny Żniwiarz", 't14': "Lewiatan Magmy", 't15': "Kosmiczny Wniebowstąpiony", 't16': "Władca Burzy", 't17': "Strażnik Otchłani", 't18': "Roztopiony Behemot", 't19': "Astralny Pożeracz", 't20': "Wieczne Bóstwo", 't21': "Stalowy Strażnik", 't22': "Rtęciowy Psotnik", 't23': "Tyran Magnetu", 't24': "Bursztynowy Opiekun", 't25': "Dżin Wydm", 't26': "Żrąca Kolba", 't27': "Cierniowe Serce", 't28': "Koralowy Monarcha", 't29': "Grzybowy Mędrzec", 't30': "Burzowa Furia", 't31': "Jadeitowa Wyrocznia", 't32': "Runiczny Monolit", 't33': "Silnik Chrono", 't34': "Duch Origami", 't35': "Bańkowy Chochlik", 't36': "Kostka Glitch", 't37': "Dzwon Echa", 't38': "Latarnia Duchów", 't39': "Lustrzana Zjawa", 't40': "Rubinowe Serce", 't41': "Mroźny Błędny Ognik", 't42': "Diament Doskonały", 't43': "Plazmowe Dynamo", 't44': "Herold Komety", 't45': "Serafin Zorzy", 't46': "Słoneczny Cesarz", 't47': "Gwiazda Życzeń", 't48': "Sygnał Pulsara", 't49': "Ciemna Materia", 't50': "Najwyższa Osobliwość" },
      'locked': 'Połącz dwie jednostki poziomu {n}, aby odkryć!',
      'effects': { 'none': "Szybkie ciosy — zwinne i bezlitosne.", 'burn': "Trafienia zostawiają obrażenia, które wciąż narastają.", 'knockback': "Potężne ciosy odrzucają wrogów.", 'heal': "Każde trafienie leczy twojego najsłabszego sojusznika.", 'splash': "Każde trafienie rozchodzi się na wszystkich pobliskich wrogów.", 'poison': "Trafienia kumulują obrażenia w czasie.", 'chain': "Ataki przeskakują na trzech kolejnych wrogów.", 'frost': "Spowalnia przy trafieniu; impuls ogłusza pobliskie grupy.", 'midas': "Duża szansa na krytyk i dodatkowe złoto przy każdym trafieniu.", 'eruption': "Wybucha przy uderzeniu i podpala pobliskich wrogów." },
      'abilities': {
        'none': 'Roztopiona iskra — szybki, nieustraszony, zawsze na czele.',
        'burn': 'Gryzący mróz pozostaje — wrogowie wciąż otrzymują obrażenia po trafieniu.',
        'knockback': 'Ciska głazami, które odrzucają wrogów.',
        'heal': 'Emanuje leczącym mrozem — każde trafienie leczy najsłabszego sojusznika.',
        'splash': 'Rozbijające się fale rażą wszystkich pobliskich wrogów.',
        'poison': 'Duszący pył kumuluje się, zadając ciężkie obrażenia w czasie.',
        'chain': 'Gwiezdny ogień przeskakuje na trzech dodatkowych wrogów.',
        'frost': 'Pełzająca groza spowalnia wrogów i unieruchamia tłum.',
        'midas': 'Wysoka szansa na trafienie krytyczne i dodatkowe złoto przy każdym ciosie.',
        'blackhole': 'Przyzywa piekący wir, który wciąga hordę i obraca ją w popiół.',
        'eruption': 'Wybucha przy uderzeniu — roztopiony rozprysk pali wszystkich pobliskich wrogów.'
      }
    },
    'mutators': {
      'goldRush': 'GORĄCZKA ZŁOTA! Łup {mult}×',
      'frostMarch': 'LODOWY MARSZ! Mroźne ciosy',
      'horde': 'HORDA! Podwójny rój',
      'elite': 'ELITA! Falę prowadzi czempion'
    }
  },
  'battlePass': {
    'title': 'Kampania wojenna',
    'progress': '{current} / {total}',
    'daysLeft': 'pozostało {n}d',
    'maxed': 'KAMPANIA UKOŃCZONA',
    'xpProgress': '{current} / {total} XP',
    'howToEarn': 'Jak zdobywać XP',
    'perAttempt': 'za bieg',
    'perStageFinish': 'za ukończony etap',
    'perKill': 'za zabójstwo',
    'perMerge': 'za fuzję',
    'perWave': 'za falę',
    'perBoss': 'za bossa',
    'unlockHint': 'Zdobądź {n} XP, aby odblokować następną nagrodę — nieodebrane nagrody czekają, aż je dotkniesz.'
  },
  'dailyRewards': {
    'title': 'Nagrody Dzienne',
    'subtitle': 'Loguj się codziennie, aby utrzymać passę.',
    'day': 'Dzień {n}',
    'dayShort': 'D{n}'
  },
  'skins': {
    'title': 'Skórki Kuli',
    'subtitle': 'Wydawaj monety, aby odblokować i założyć nowe wyglądy.',
    'equip': 'Załóż',
    'equipped': 'Założono',
   'locked': 'Etap {n}', 'new': 'Nowość!', 'rarity': { 'common': 'Zwykły', 'rare': 'Rzadki', 'epic': 'Epicki' }, },
  'missions': {
    'title': 'Misje Dzienne',
    'subtitle': 'Wykonuj codzienne cele, aby zdobyć monety.',
    'claim': 'Odbierz',
    'done': 'Odebrano',
    'types': {
      'coins': 'Zbierz dziś {n} monet',
      'tiles': 'Przebądź {n} pól w jednym biegu',
      'items': 'Złap dziś {n} skrzyń z przedmiotami',
      'clears': 'Ukończ dziś {n} etapów'
    }
  },
  'endless': {
    'badge': 'Niekończący',
    'toEndless': 'Tryb Niekończący',
    'toCampaign': 'Kampania',
    'best': 'Najlepszy: {n}'
  },
  'boon': {
    'title': 'Wybierz dar',
    'names': {
      'secondChance': 'Druga Szansa',
      'startPowerup': 'Przewaga na Starcie',
      'coinBoost': 'Szał Monet'
    },
    'descriptions': {
      'secondChance': 'Rozpocznij następny etap z tarczą Drugiej Szansy.',
      'startPowerup': 'Rozpocznij następny etap z losowym ulepszeniem.',
      'coinBoost': '1,2× monet przez cały następny etap.'
    }
  },
  'options': {
    'title': 'Opcje',
    'general': 'Ogólne',
    'audio': 'Dźwięk',
    'language': 'Język',
    'difficulty': 'Trudność',
    'soundEffects': 'Efekty dźwiękowe',
    'music': 'Muzyka',
    'musicTrack': 'Ścieżka muzyczna',
    'musicTracks': {
      'cozy': 'Przytulna Harmonia',
      'battle': 'Motyw Bitewny'
    },
    'close': 'Zapisz i Zamknij',
    'difficulties': { 'easy': 'Łatwy', 'medium': 'Średni', 'hard': 'Trudny' },
    'difficultyHints': {
      'easy': 'Wolniejsze tempo — więcej czasu na reakcję.',
      'medium': 'Standardowe, zrównoważone tempo.',
      'hard': 'Szybsze tempo — wymaga precyzyjniejszego czasu.'
    }
  },
  'adsBlocked': {
    'title': 'Nie można wyświetlić reklamy',
    'body': 'Próbowaliśmy pokazać Ci film, abyś mógł zdobyć nagrodę, ale coś w Twojej przeglądarce blokuje reklamy.',
    'allowPrefix': 'Zezwól na reklamy w',
    'allowSuffix': '(lub wstrzymaj blokowanie reklam dla tej gry) i spróbuj ponownie.',
    'gotIt': 'Rozumiem'
  },
  'saveStatus': {
    'restoredTitle': 'Przywrócono zapis w chmurze',
    'restoredBody': '+{n} monet bonusowych za odzyskanie',
    'tap': 'dotknij',
    'pausedTitle': 'Synchronizacja w chmurze wstrzymana',
    'pausedBody': 'Grasz offline. Twój postęp jest zapisywany tutaj.',
    'retry': 'Ponów',
    'dismiss': 'zamknij'
  },
  'loading': {
    'tooLong': 'Ładowanie trwa zbyt długo? Wyłącz blokadę reklam i odśwież.'
  },
  'license': {
    'denied': 'Odmowa dostępu: kup licencję.'
  },
  // Global rank tag hung in the arena corner (RankBadge.vue). {n} / {rank} are
  // pre-formatted integers; `of` renders on its own line under the rank.
  'leaderboard': {
    'rank': '#{n}',
    'of': 'z {n}',
    'aria': 'Ranking: miejsce {rank} z {n}',
    'ariaRank': 'Ranking: miejsce {rank}',
    'signIn': 'Zaloguj się, by dołączyć',
    'signInAria': 'Zaloguj się, by dołączyć do rankingu'
  },
  // New-tier discovery moment (TierRevealFx.vue): the label over the unit a
  // merge just created for the first time. {n} is the tier number.
  'tierReveal': {
    'title': 'NOWA KULA!',
    'tier': 'Poziom {n}'
  }
}
