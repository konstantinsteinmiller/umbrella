// Umbrella meta strings ('barrageMeta' namespace: achievements, pass, collections, daily, supply drop).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  'achievements': {
    'title': 'Достижения',
    'subtitle': 'Достигайте вечных рубежей и получайте монеты.',
    'claim': 'Забрать',
    'claimed': 'Получено',
    'unlocked': 'Достижение выполнено!',
    'progress': '{c} / {t}',
    'items': {
      'kills100': 'Первая сотня',
      'kills1k': 'Истребитель монстров',
      'kills10k': 'Экстерминатор',
      'row10': 'В самую гущу',
      'row30': 'Глубокая осада',
      'row60': 'Железная стена',
      'row100': 'Легенда глубин',
      'boss1': 'Убийца великанов',
      'boss10': 'Охотник на боссов',
      'boss50': 'Погибель королей',
      'merges10': 'Сила близнецов',
      'merges100': 'Мастер слияний',
      'merges500': 'Кузница слияний',
      'tier3': 'Первая искра',
      'tier5': 'Восходящая стихия',
      'tier7': 'Мощь стихий',
      'tier9': 'Первозданная сила',
      'combo25': 'Рикошет',
      'combo50': 'Цепная реакция',
      'combo150': 'Волшебник пинбола',
      'fever1': 'Жар битвы',
      'fevers25': 'Радужный угар'
    },
    'desc': {
      'kills': 'Побеждено монстров: {n}',
      'bestRow': 'Дойдите до ряда {n}',
      'bossKills': 'Побеждено боссов: {n}',
      'merges': 'Слияний шаров: {n}',
      'maxBallTier': 'Создайте шар {n}-го уровня',
      'bestCombo': 'Попаданий за залп: {n}',
      'fevers': 'Залпов в ЛИХОРАДКЕ: {n}'
    }
  },
  'pass': {
    'title': 'Пропуск Barrage',
    'progress': 'Уровень {current} / {total}',
    'daysLeft': 'осталось {n}д',
    'maxed': 'ПРОПУСК ЗАВЕРШЁН',
    'xpProgress': '{current} / {total} XP',
    'xpAmount': '+{n} XP',
    'howToEarn': 'Как получить опыт',
    'perKill': 'за убийство',
    'perMerge': 'за слияние',
    'perRow': 'за ряд',
    'perBoss': 'за босса',
    'unlockHint': 'Наберите {n} XP, чтобы открыть следующую награду — незабранные награды ждут, пока вы их не коснётесь.',
    'ballReward': 'Бесплатный шар {tier}-го уровня'
  },
  'collections': {
    'title': 'Коллекция',
    'launchers': 'Метатели',
    'skins': 'Облики шаров',
    'buy': 'Купить',
    'equip': 'Надеть',
    'equipped': 'Надето',
    'new': 'Новое!',
    'undiscovered': 'Не открыто',
    'discoverHint': 'Слейте шар {tier}-го уровня, чтобы открыть его',
    'tier': 'Уровень {tier}',
    'rarity': {
      'common': 'Обычный',
      'rare': 'Редкий',
      'epic': 'Эпический',
      'legendary': 'Легендарный'
    },
    'skinNames': {
      'orb': 'Стеклянная сфера',
      'stone': 'Камень',
      'tide': 'Прилив',
      'gale': 'Шквал',
      'frost': 'Иней',
      'amber': 'Янтарь',
      'lava': 'Лава',
      'diamond': 'Алмаз',
      'obsidian': 'Обсидиан',
      'glow': 'Светящаяся руна',
      'gilded': 'Позолота',
      'eclipse': 'Затмение'
    }
  },
  'daily': {
    'title': 'Ежедневный обстрел',
    'subtitle': 'Сегодня у всех одно и то же поле. Как далеко вы пройдёте?',
    'rules': 'Без улучшений и продолжений — только ваша меткость.',
    'play': 'Играть',
    'best': 'Рекорд дня: ряд {n}',
    'attempts': 'Попыток сегодня: {n}',
    'streak': 'Дней подряд: {n}',
    'newBest': 'Новый рекорд дня!'
  },
  'supply': {
    'title': 'Сундук с сокровищами',
    'ready': 'Готово!',
    'readyIn': 'Следующий подарок через {time}',
    'biggerIn': 'Подарок побольше (+{n}) через {time}',
    'gift': '+{n}',
    'open': 'Открыть',
    'coins': 'Монеты: +{n}',
    'bonusCharge': 'Бонусный заряд: {skill}'
  }
}
