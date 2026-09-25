// Elemental Barrage gameplay + UI strings ('barrage' namespace).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  hud: {
    row: '{n}줄',
    daily: '일일',
    bossIn: '보스까지 {n}',
    best: '최고 {n}',
    todayBest: '오늘 {n}',
    shields: '방패 충전: {n}',
    revives: '부활 충전: {n}',
    warcry: '함성 준비 완료: 다음 일제 사격 피해 2배',
    coinGain: '+{n}',
    rank: '글로벌 순위'
  },
  tray: {
    count: '{n}/{max}',
    aria: '공 트레이: {max}개 중 {n}개',
    slotAria: '{name}, {n}단계',
    stackAria: '{name}, {n}단계, ×{count}',
    stackCount: '×{n}',
    tierOnly: '{n}단계',
    plusOne: '+1',
    merged: '합체!',
    overflow: '트레이 가득! +{n} 코인',
    pickupSr: '"+1"은 트레이에 공이 하나 더 생긴다는 뜻: 매 발사마다 한 발 더, 피해 증가.'
  },
  upgrades: {
    title: '업그레이드',
    damage: {
      name: '공 피해량',
      short: '피해',
      desc: '모든 공이 더 세게 때립니다.'
    },
    capacity: {
      name: '트레이 용량',
      short: '용량',
      desc: '트레이에 공이 더 들어가요: 매 턴 더 많이 쏴요.'
    },
    speed: {
      name: '발사 속도',
      short: '속도',
      desc: '공이 더 빨리 날아가고 더 세게 때립니다.'
    },
    luck: {
      name: '획득 행운',
      short: '행운',
      desc: '판 위에 코인과 스킬 방울이 더 많이 나옵니다.'
    },
    bounty: {
      name: '코인 보상',
      short: '보상',
      desc: '몬스터마다 코인을 더 많이 얻습니다.'
    },
    fmt: {
      mult: '×{n}',
      count: '{n}',
      percent: '{n}%'
    },
    arrow: '{from} → {to}',
    max: 'MAX',
    free: '무료',
    aria: '{name}: {desc} 가격: {cost} 코인.',
    ariaMaxed: '{name}: {desc} 최대 강화.',
    ariaFree: '{name}: {desc} 무료!',
    denied: '코인이 부족해요: {cost} 코인이 필요해요.',
    need: '{n} 더 필요해요'
  },
  turn: {
    bonus: '공 +{n}',
    bonusAdAria: '광고를 보고 공 {n}개 추가',
    bonusCoinAria: '{cost} 코인으로 공 {n}개 추가',
    recall: '공 회수',
    speed: '×{n}',
    fastAria: '빨리 감기 ×{n}'
  },
  boss: {
    enraged: '격노!',
    hpAria: '{name}: 체력 {hp}/{max}'
  },
  bosses: {
    'slime-tower': '슬라임 탑',
    worm: '거대 벌레',
    'fire-dragon': '화염 드래곤',
    'silver-dragon': '은빛 드래곤',
    troll: '트롤 왕',
    orc: '오크 군주'
  },
  monsters: {
    slime: {
      name: '슬라임',
      rule: '평범한 말랑이.'
    },
    goblin: {
      name: '고블린',
      rule: '매 턴 옆으로 한 칸 뛰어요.'
    },
    caterpillar: {
      name: '애벌레',
      rule: '두 칸 너비에 아주 튼튼해요.'
    },
    ogre: {
      name: '오우거',
      rule: '체력 2배. 분쇄 공은 3배 피해를 줘요.'
    },
    dryad: {
      name: '드라이어드',
      rule: '매 턴 이웃을 치유해요. 먼저 공격하세요!'
    },
    centaur: {
      name: '켄타우로스',
      rule: '진흙을 뱉어 한 턴 동안 칸을 막아요.'
    },
    imp: {
      name: '임프',
      rule: '쓰러뜨리면 작은 임프 둘로 갈라져요.'
    },
    treant: {
      name: '트렌트',
      rule: '느리지만 튼튼해요. 두 턴에 한 번만 전진해요.'
    },
    carbuncle: {
      name: '카벙클',
      rule: '보석 방패가 매 턴 첫 공격을 막아요.'
    },
    cyclops: {
      name: '사이클롭스',
      rule: '두 턴마다 두 줄을 돌진해요. 화살표를 조심하세요!'
    },
    corrupted: {
      name: '타락한 몬스터',
      rule: '정예 몬스터: 더 튼튼하지만 코인이 3배예요.'
    }
  },
  banners: {
    bossIncoming: '보스 등장!',
    enraged: '{name} 격노!',
    enragedSub: '이제 한 턴에 두 줄씩 전진해요!',
    checkpoint: '체크포인트!',
    checkpointSub: '{n}줄에 재시작 지점 저장',
    fever: '피버!',
    feverSub: '코인 2배!',
    combo: '콤보',
    comboHits: '×{n}',
    newMonster: '새 몬스터',
    shieldBlocked: '방패로 막았다!',
    meteorStorm: '유성 폭풍!',
    revived: '부활!'
  },
  skills: {
    meteor: {
      name: '유성',
      effect: '모든 몬스터에게 유성이 떨어져요!'
    },
    warcry: {
      name: '함성',
      effect: '다음 일제 사격 피해 2배!'
    },
    legion: {
      name: '군단 소환',
      effect: '이번 사격에 유령 공 +3!'
    },
    pact: {
      name: '영혼 계약',
      effect: '가장 강한 공이 복제됐어요!'
    },
    shield: {
      name: '방패 문장',
      effect: '다음 돌파를 막아 줘요.'
    },
    execute: {
      name: '처형의 표식',
      effect: '가장 튼튼한 몬스터가 쓰러졌어요!'
    },
    heal: {
      name: '치유',
      effect: '몬스터가 한 줄 밀려났어요!'
    },
    revive: {
      name: '부활',
      effect: '무료 이어하기 +1.'
    }
  },
  abilities: {
    burn: {
      name: '화상',
      desc: '사격 후에도 계속 불타요.'
    },
    knockback: {
      name: '넉백',
      desc: '몬스터를 한 줄 위로 밀어내요.'
    },
    pierce: {
      name: '관통',
      desc: '처음 맞은 몬스터를 뚫고 지나가요.'
    },
    freeze: {
      name: '빙결',
      desc: '몬스터가 다음 전진을 쉬어요.'
    },
    splash: {
      name: '스플래시',
      desc: '이웃에게도 피해가 튀어요.'
    },
    crush: {
      name: '분쇄',
      desc: '오우거와 보스에게 3배 피해.'
    },
    chain: {
      name: '연쇄',
      desc: '번개가 두 마리에게 더 튀어요.'
    },
    poison: {
      name: '독',
      desc: '중첩되는 독이 매 턴 피해를 줘요.'
    },
    midas: {
      name: '미다스',
      desc: '맞힐 때마다 보너스 코인.'
    },
    eruption: {
      name: '분화',
      desc: '몇 번 맞힐 때마다 3×3 범위 폭발.'
    }
  },
  breach: {
    title: '방어선 붕괴!',
    wasted: '쓰러졌다',
    body: '몬스터가 {n}줄에서 방어선을 돌파했어요.',
    bodyBy: '{n}줄에서 돌파: {name}',
    meteor: '유성 폭풍',
    meteorDesc: '맨 아래 두 줄을 쓸어버리고 계속하기',
    meteorAdAria: '광고 보기: 유성 폭풍이 맨 아래 두 줄을 쓸어버려요',
    meteorCoinAria: '{cost} 코인으로 유성 폭풍: 맨 아래 두 줄을 쓸어버려요',
    revive: '부활하기',
    reviveDesc: '부활 충전 사용 ({n}개 남음)',
    free: '무료',
    restart: '{n}줄부터 다시 시작',
    restartDesc: '코인은 모두 유지돼요',
    onceHint: '유성 폭풍은 체크포인트마다 한 번만 쓸 수 있어요.',
    recapRow: '줄',
    recapKills: '처치',
    recapEarned: '이번 판 획득',
    recapAria: '이번 판: {row}줄, 처치 {kills}, 획득 코인 {coins}'
  },
  chest: {
    title: '보스 처치!',
    titleFirst: '첫 보스 처치!',
    defeated: '{name} 처치!',
    amount: '+{n}',
    boosted: '보상 {n}배!',
    checkpoint: '{n}줄에 체크포인트 저장',
    boost: '{n}×',
    boostAdAria: '광고를 보고 보상 {n}배 받기',
    boostCoinAria: '{cost} 코인으로 보상 {n}배',
    collect: '받기',
    powerUp: '강화!'
  },
  daily: {
    today: '오늘의 판: {date}',
    bestLabel: '오늘 최고',
    attemptsLabel: '도전 횟수',
    streakLabel: '연속 일수',
    active: '일일 도전 진행 중',
    keepPlaying: '계속하기',
    quit: '일일 도전 나가기',
    playAgain: '다시 하기',
    back: '무한 모드로 돌아가기',
    resultTitle: '일일 도전 종료',
    resultRow: '{n}줄',
    waitTurn: '턴을 마치면 일일 판을 시작할 수 있어요.'
  },
  collection: {
    cosmetic: '외형만 바뀌어요. 힘은 절대 변하지 않아요.',
    unknown: '???',
    selectedAria: '{name}, 선택됨',
    selectAria: '{name} 선택',
    buyAria: '{cost} 코인으로 {name} 구매',
    adProgress: '{n}/{max}',
    adAria: '광고를 보고 {name} 잠금 해제',
    adProgressAria: '{name}을(를) 위해 광고 보기 ({max}개 중 {n}개 시청)'
  },
  supply: {
    ready: '보물 상자 준비 완료 — 탭해서 열어요!',
    filling: '{name}: {time} 후 코인 +{n}'
  },
  codex: {
    title: '공 도감',
    progress: '{n} / {total} 발견',
    damage: '피해 ×{n}',
    locked: '{n}단계 공 두 개를 합체해서 발견하세요!'
  },
  tutorial: {
    aim: '몬스터 쪽으로 드래그했다가 놓아서 발사하세요!',
    pickup: '+1 방울을 관통해 쏴서 공을 얻으세요!',
    merge: '공을 하나 더 얻으세요: 트레이가 가득 차면 쌍둥이가 더 강한 공으로 합체해요!',
    upgrade: '무료 업그레이드를 탭해서 공을 더 담으세요!'
  },
  prompt: {
    tapToShoot: '탭하여 발사',
    clickToShoot: '클릭하여 발사'
  },
  coach: {
    survive: '몬스터가 곧 돌파해요 — 가장 아래 있는 것부터 맞히세요!',
    tray: '트레이가 가득 찼어요: 빈 칸이 있을 때만 +1이 발사 수를 늘려요. 트레이 용량을 업그레이드해서 더 많은 공을 쏘세요!',
    combo: '틈으로 조준하세요: 몬스터 뒤에서 튕기는 공이 엄청난 콤보를 만들어요!',
    trayIntro: '이 트레이에는 공이 담겨 있어요: 공 하나가 한 발이에요. +1은 빈 칸을 채우고, 가득 찬 트레이는 쌍둥이 두 개를 더 강한 공으로 합쳐요.',
    upgrade: '빛나는 업그레이드를 탭하세요: 공, 트레이 또는 코인이 좋아져요.',
    bank: '비스듬히 조준하세요: 벽에 튕긴 공은 한 번에 여러 몬스터를 맞힐 수 있어요!',
    funnel: '이제 {name}을(를) 살 수 있어요. 탭하면 모든 공이 더 세게 맞혀요!',
    skipAria: '레슨 건너뛰기',
    // The spotlight lessons (sr-only; the screen stages them).
    spot: {
      threat: '옆의 카운트다운은 가장 가까운 몬스터가 돌파하기까지 남은 턴 수예요 — 0이 되기 전에 맞히세요!',
      speed: '{name}: 공이 더 빨리 날아가고 맞힐 때마다 피해가 더 커져요.',
      luck: '{name}: 새 줄에 코인과 스킬 방울이 더 많이 나와요.',
      bounty: '{name}: 물리친 몬스터마다 코인을 더 줘요.'
    }
  },
  merge: {
    sr: '{from}단계 공 두 개가 합쳐져 {to}단계 공이 되었어요! 트레이의 공 하나가 한 발이에요.',
    discovery: '새 공: {name}. 능력: {ability} — {desc}',
    skipAria: '합체 건너뛰기'
  },
  unlock: {
    announce: '잠금 해제: {name}!'
  }
}
