/**
 * Elemental Barrage balance sim — the policy bot the row-HP curve and the
 * economy are tuned against (CONTRACT §2 / §6 / §7).
 *
 *   node --import ./scripts/art/ts-resolve.mjs scripts/barrage-sim.mjs [flags]
 *
 * Bots
 *   casual  each turn samples N angles (default 8), plays every one on a clone
 *           of the engine, fires the best (most damage / kills / "+1"s, never a
 *           breach if any angle avoids it), then buys the glowing upgrade (the
 *           cheapest affordable one) until nothing is affordable. On a breach it
 *           restarts at the checkpoint with the checkpoint tray, keeping coins.
 *   random  fires one uniformly random angle, same upgrade and restart rules.
 *   noup    random angles and NEVER buys an upgrade (not even the FTUE's free
 *           one) — the first-timer who has not found the upgrade bar yet.
 *   flat    drags TOWARD the monsters instead of pulling back: every shot is
 *           the pinned edge angle (MIN_AIM or π − MIN_AIM), the slow wall-
 *           to-wall zig-zag. Buys upgrades. The confused-controls floor.
 *   human   calibrated to playtest run 3's telemetry (4 blind first-timers on a
 *           phone, 3 min each): ~9.5 s per turn; aims like a lightly intentional
 *           first-timer (best of 2 random angles); takes the FTUE's free
 *           capacity, buys Ball Damage as soon as it is affordable (the gold-
 *           arrow funnel), then at most ONE purchase — the glowing chip — every
 *           4–5 turns (sooner right after a boss kill or a breach, when the
 *           arrows come back), leaving the surplus unspent. Run 3 at 3 min: rows
 *           15–19, trays [4,3,2] / [3,3,2,1] at capacity 3–4, 1–5 paid levels.
 *
 * Smoothness metrics (first life = until the first breach)
 *   pressure  per turn with no boss alive: board HP ÷ the bot's mean damage per
 *             volley over its last 3 volleys ("volleys to clear the board");
 *             medians per row band. A wall shows as a band far above 6–10.
 *   post/pre  HP of the first walker row after the first boss kill ÷ HP of the
 *             last walker row before that boss (slime-equivalent HP).
 *
 * Targets (run-3 pass, lead)
 *   human:  boss10 first try ≥ 20/24; at turn ~18 rows 15–19 with a run-3 tray;
 *           pressure at rows 11–20 ≤ ~1.5× rows 6–10; post/pre ≤ ~1.5; first
 *           breach around rows 25–30, not before ~22.
 *   noup:   first breach ≥ row 20.
 *   random: first merge turn 3; first paid upgrade within ~5 turns of the free one.
 *   casual: row-30 boss at ~4–6 min; still breaches past row 40; best row not
 *           past the old ~63–74.
 *   all:    boss kill + breach in the same turn 0; balls in flight ≤ ~40.
 *
 * Run-3 pass (24 seeds × 220 turns, medians, before → after): the flat curve
 * (×1.15 a clock row to 18, then ×1.25), the HP clock (boss row, first-boss
 * fight, 3 rows of a later fight and a 2-row post-boss plateau hold it), later
 * bosses ×45 row HP (first ×15), the fading safety net, the first boss's roar.
 * "pressure" ratios are rows 11–15 / 16–20 against rows 6–10.
 *   human   boss10 first try 24/24 @t13 (2:04) both · pressure 1.89× / 5.57×
 *           → 0.86× / 1.33× · post/pre boss HP 4.61 → 1.13 · first breach row
 *           31 → 31 @4:55 (now the row-20 boss: first try 10/24; before, the
 *           wall) · t18: row 18, cap 4, 4 paid, [4,3,2,1] both · row-30 boss
 *           @t102 (16:09) → @t51 (8:05), killed @t165 → @t90 · best row 40 → 64
 *   noup    first breach row 26 → 29 · boss10 first try 20 → 22/24 · pressure
 *           16–20 6.71× → 1.33× · post/pre 7.40 → 1.02 (it never gets past the
 *           row-20 boss without buying: 0/24, as before)
 *   random  first merge t3, first paid upgrade t4 (both unchanged) · first
 *           breach row 28 → 30 · boss10 first try 23 → 24/24 · best row 37 → 62
 *           · post/pre 4.46 → 1.18
 *   casual  boss10 24/24 @t12 both · row-30 boss @t31 (3:37) both — its floor:
 *           30 rows + the quiet turns, so ~4–6 min would need a breach before
 *           row 30 · first breach row 35 → 60 · best row 63 → 83 · breaches
 *           11 → 9 (all but one a boss) · pressure 2.09× → 0.91×
 *   flat    first breach row 29 → 58 · best row 42 → 76
 *   all     boss kill + breach in one turn 0 → 0 · balls in flight ≤ 42 (flat 43)
 *   Daily (`--daily`: DAILY_CONFIG kit, run ends at the first breach, 30
 *   dates; random / best-of-2 / best-of-8 aim): rows 28 / 28 / 37 → 29 / 50 /
 *   61 with the endless clock (6–9 min: too long for a daily) → 29 / 30 / 39
 *   with Daily's clock = the row (no holds, no plateau): 3:23 / 4:45 / 4:40.
 *   Best-of-2 reaches rows 38–43 on 5 of 30 dates, random never passes 33.
 *   Daily-only boss ×0.5–0.8 moved no median (it lifted random's worst dates);
 *   a clock at 0.8–0.9 × row either did nothing or pushed best-of-2 to 38 (6:11).
 *   --glow spill (Tray Capacity while the tray spills, else cheapest): no
 *   material change, so the game keeps cheapest-first — human identical (the
 *   bot's tray rarely spills at one purchase per 4–5 turns); a slow buyer
 *   (--buygap 8,10: trays [4,3,2] at cap 3 like run 3) boss20 first try 7 → 6/24,
 *   first breach 31 → 31, row-30 boss killed @t117 → @t116.
 *
 * History: run-2 pass (boss death blast, first boss alone, safety net) took
 * noup's first breach row 20 → 26 and boss-kill + breach in one turn 6 → 0.
 * Run-3 sweep notes: a clock held for the WHOLE of every boss fight stalled HP
 * (a first-timer's 6–8-row fights: boss-30 clock 17, first breach row 60–90);
 * the human bot's breaches are all bosses, so walkers set the smoothness and
 * the row-20 boss (`bossLater`) sets the first-session length.
 *
 * Flags: --seeds 6  --turns 260  --samples 8  --bot casual|random|noup|flat|human|both|all
 *        --assist on|off (the game's safety net; default on)
 *        --glow cheapest|spill|spillsave (the glowing-chip rule the bots buy:
 *          cheapest affordable; Tray Capacity while the tray spills "+1"s,
 *          else cheapest; the same but nothing glows while capacity is short)
 *        --buygap 4,5 (the human's turns between purchases)
 *        --daily (Daily Barrage: fixed kit, run ends at the first breach; one
 *          run per date, --seeds dates; bots random / human / casual aim only)
 *        --meteor (use the once-per-checkpoint rewarded continue)  --verbose
 *        --trace N (per-turn table for seed 1, every N turns)  --brief
 *        --tune '{"hp":{"mid":1.1},"eco":{"coinGrowth":1.05},"assist":{"fadeTo":40},"assistPaid":{"perLevel":0.25}}'
 *          (sweep HP_CURVE / ECONOMY / ASSIST / ASSIST_PAID in-process)
 */
import { createEngine, createEngineAtRow } from '../src/barrage/engine/engine.ts'
import * as economy from '../src/barrage/engine/economy.ts'
import * as monsters from '../src/barrage/engine/monsters.ts'
import { trayPower } from '../src/barrage/engine/balls.ts'
import { Rng } from '../src/barrage/engine/rng.ts'
import { MIN_AIM } from '../src/barrage/engine/types.ts'

const { DAILY_CONFIG, ECONOMY, UPGRADE_IDS, configFromUpgrades, dailySeed, defaultConfig, upgradeCost, upgradeMaxLevel } = economy
const { HP_CURVE, KIND_HP_MULT, CORRUPT_HP_MULT } = monsters

/** Seconds per turn: the old bots' 7 s, run 3's measured ~9.5 s for the human. */
const SEC_PER_TURN = { casual: 7, random: 7, noup: 7, flat: 7, human: 9.5 }
const HUMAN_SAMPLES = 2
/** Turns between the human's purchases after the funnel's Ball Damage
 *  (`--buygap 4,5`; run 3's slowest buyers were nearer 8–10). */
let HUMAN_BUY_GAP = [4, 5]

const args = process.argv.slice(2)
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return def
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}
const SEEDS = Number(flag('seeds', 6))
const TURNS = Number(flag('turns', 260))
const SAMPLES = Number(flag('samples', 8))
const BOT = String(flag('bot', 'both'))
const USE_METEOR = flag('meteor', false) === true
const VERBOSE = flag('verbose', false) === true
const BRIEF = flag('brief', false) === true
const TRACE = Number(flag('trace', 0))
const GLOW = String(flag('glow', 'cheapest'))
const DAILY = flag('daily', false) === true
if (typeof flag('buygap', null) === 'string') HUMAN_BUY_GAP = String(flag('buygap', '4,5')).split(',').map(Number)
// The safety net (config.assist): the state layer feeds it
// `assistForPaidLevels(paid)` (the FTUE's free capacity is not paid).
// `--assist off` measures without it.
const ASSIST = flag('assist', 'on') !== 'off'
const assistFor = economy.assistForPaidLevels
const TUNE = flag('tune', null)
if (typeof TUNE === 'string') {
  const t = JSON.parse(TUNE)
  if (t.hp) Object.assign(HP_CURVE, t.hp)
  if (t.assist && monsters.ASSIST) Object.assign(monsters.ASSIST, t.assist)
  if (t.assistPaid && economy.ASSIST_PAID) Object.assign(economy.ASSIST_PAID, t.assistPaid)
  if (t.eco) {
    const { costBase, costGrowth, ...rest } = t.eco
    Object.assign(ECONOMY, rest)
    if (costBase) Object.assign(ECONOMY.costBase, costBase)
    if (costGrowth) Object.assign(ECONOMY.costGrowth, costGrowth)
  }
}

const cheapestAffordable = (levels, coins) => {
  let best = null
  let bestCost = Infinity
  for (const id of UPGRADE_IDS) {
    const max = upgradeMaxLevel(id)
    if (max !== null && levels[id] >= max) continue
    const cost = upgradeCost(id, levels[id])
    if (cost <= coins && cost < bestCost) { best = id; bestCost = cost }
  }
  return best ? { id: best, cost: bestCost } : null
}

/** The full tray pays every new "+1" out as coins: no pair to merge, no 1 in it. */
const traySpills = (state) => {
  const t = state.tray
  if (t.length < state.config.trayCapacity || t.includes(1)) return false
  for (let i = 1; i < t.length; i++) if (t[i] === t[i - 1]) return false
  return true
}

/** The chip that glows (CONTRACT §0.3) under the `--glow` rule. */
const glowing = (levels, coins, state) => {
  if (GLOW !== 'cheapest' && traySpills(state)) {
    const max = upgradeMaxLevel('capacity')
    if (levels.capacity < max) {
      const cost = upgradeCost('capacity', levels.capacity)
      if (cost <= coins) return { id: 'capacity', cost }
      if (GLOW === 'spillsave') return null
    }
  }
  return cheapestAffordable(levels, coins)
}

const scoreTurn = (before, after) => {
  if (after.state.phase === 'breach') return -1e15
  const s0 = before.stats
  const s1 = after.stats
  const rowHp = Math.max(1, before.state.monsters.reduce((a, m) => Math.max(a, m.maxHp), 1))
  let lowest = 0
  for (const m of after.state.monsters) if (m.kind !== 'boss') lowest = Math.max(lowest, m.row + m.h)
  return (s1.damage - s0.damage)
    + (s1.kills - s0.kills) * rowHp * 0.5
    + (s1.ballsCollected - s0.ballsCollected) * rowHp * 1.5
    + (s1.bossKills - s0.bossKills) * rowHp * 20
    - Math.max(0, lowest - 7) * rowHp * 2
}

const pickAngle = (engine, bot, rng) => {
  const lo = MIN_AIM
  const span = Math.PI - 2 * MIN_AIM
  if (bot === 'random' || bot === 'noup') return lo + rng.next() * span
  if (bot === 'flat') return rng.next() < 0.5 ? MIN_AIM : Math.PI - MIN_AIM
  const samples = bot === 'human' ? HUMAN_SAMPLES : SAMPLES
  let best = Math.PI / 2
  let bestScore = -Infinity
  for (let i = 0; i < samples; i++) {
    const a = lo + rng.next() * span
    const c = engine.clone()
    c.fire(a)
    c.settle()
    const sc = scoreTurn(engine, c)
    if (sc > bestScore) { bestScore = sc; best = a }
  }
  return best
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Slime-equivalent HP of a walker (kind / corrupted multipliers divided out). */
const slimeHp = (m) => m.maxHp / ((KIND_HP_MULT[m.kind] ?? 1) * (m.corrupted ? CORRUPT_HP_MULT : 1))

const runBot = (bot, seed) => {
  const rng = new Rng(seed * 7919 + (bot === 'casual' ? 0 : 1))
  const buyRng = new Rng(seed * 104729 + 17)
  const buys = bot !== 'noup'
  const levels = { damage: 0, capacity: 0, speed: 0, luck: 0, bounty: 0 }
  let coins = 0
  let checkpointRow = 0
  let checkpointTray = [1]
  let meteorUsed = false
  let freeCapacity = true
  let firstMerge = false
  let restarts = 0
  // Human purchase rhythm.
  let nextBuyTurn = 0
  const buyGap = () => HUMAN_BUY_GAP[0] + buyRng.int(HUMAN_BUY_GAP[1] - HUMAN_BUY_GAP[0] + 1)
  const assistNow = () => (ASSIST ? assistFor(log.upgrades.length) : 0)
  const cfgFor = (extra) => ({ ...defaultConfig({ seed: seed + restarts * 1000003 }), ...configFromUpgrades(levels), assist: assistNow(), ...extra })
  let engine
  // Smoothness bookkeeping.
  let lastWalkerHp = null
  let awaitingPost = false
  const attach = (e) => {
    e.on(ev => {
      if (ev.type === 'coins') coins += ev.amount
      else if (ev.type === 'kill') log.kills++
      else if (ev.type === 'bossDefeated') {
        coins += ev.bounty
        checkpointRow = ev.row
        checkpointTray = e.state.tray.slice()
        meteorUsed = false
        if (log.bossKills.length === 0) awaitingPost = true
        log.bossKills.push({ row: ev.row, turn })
        // The funnel's arrows come back on the glowing chip after a boss kill.
        nextBuyTurn = Math.min(nextBuyTurn, turn + 1)
      } else if (ev.type === 'breach') {
        // Run 2's worst moment: the boss chest, then OVERRUN, in one turn.
        if (log.bossKills.some(k => k.turn === turn)) log.killThenBreach++
      } else if (ev.type === 'volleyEnd') {
        // Emitted before the phase flips, so phaseTime is the volley's length.
        log.volleySec += e.state.phaseTime
        log.volleys++
      } else if (ev.type === 'bossSpawn') {
        log.bossSpawns.push({ row: ev.row, turn, clock: e.hpClock ? e.hpClock.hpRow + 1 : ev.row })
        if (log.bossKills.length === 0) log.preBossHp = lastWalkerHp
      } else if (ev.type === 'rowSpawned') {
        const ws = e.state.monsters.filter(m => m.spawnRow === ev.row && m.kind !== 'boss' && !m.mini)
        if (ws.length > 0) {
          lastWalkerHp = mean(ws.map(slimeHp))
          if (awaitingPost) { log.postBossHp = lastWalkerHp; awaitingPost = false }
        }
      } else if (ev.type === 'trayMerge') {
        if (!firstMerge) log.firstMergeTurn = turn
        firstMerge = true
      }
    })
    engine = e
  }
  const log = {
    bossSpawns: [], bossKills: [], breaches: [], upgrades: [], rowAt: {}, maxInFlight: 0, maxTier: 1, restarts: 0,
    volleySec: 0, volleys: 0, firstMergeTurn: null, killThenBreach: 0, pressure: [], preBossHp: null, postBossHp: null,
    at18: null, kills: 0
  }
  const buy = (up) => {
    coins -= up.cost
    levels[up.id]++
    log.upgrades.push({ turn, id: up.id, level: levels[up.id], cost: up.cost })
  }
  const recentDmg = []
  let turn = 0
  attach(createEngine(cfgFor({ ftue: true })))
  let bestRow = 1
  for (turn = 1; turn <= TURNS; turn++) {
    const a = pickAngle(engine, bot, rng)
    const dmg0 = engine.stats.damage
    const coins0 = coins
    const power = trayPower(engine.state.tray, engine.state.config.damageMult)
    const trayStr = `${engine.state.tray.length}x[${engine.state.tray.slice(0, 4).join(',')}${engine.state.tray.length > 4 ? '…' : ''}]`
    engine.fire(a)
    const phase = engine.settle()
    const dealt = engine.stats.damage - dmg0
    recentDmg.push(dealt)
    if (recentDmg.length > 3) recentDmg.shift()
    let hpLeft = 0
    for (const m of engine.state.monsters) hpLeft += m.hp
    if (TRACE && seed === 1 && turn % TRACE === 0) {
      console.log(`  t${turn} row ${engine.state.row} tray ${trayStr} power ${power.toFixed(1)} dealt ${dealt.toFixed(0)}` +
        ` boardHP ${hpLeft.toFixed(0)} mons ${engine.state.monsters.length} +coins ${coins - coins0} bank ${coins} lv ${JSON.stringify(levels)}`)
    }
    // Pressure: walker boards only (a boss fight is its own gate), first life.
    if (phase === 'aim' && log.breaches.length === 0 && engine.state.bossId === null && engine.state.monsters.length > 0) {
      log.pressure.push({ row: engine.state.row, p: hpLeft / Math.max(1, mean(recentDmg)) })
    }
    log.maxInFlight = Math.max(log.maxInFlight, engine.stats.maxBallsInFlight)
    log.maxTier = Math.max(log.maxTier, engine.stats.maxTier)
    bestRow = Math.max(bestRow, engine.state.row)
    if (phase === 'breach') {
      // Who broke through: boss (and whether enraged) or a walker of which row.
      const who = engine.state.monsters.filter(m => m.row + m.h > 10)
        .map(m => m.kind === 'boss' ? `boss${m.enraged ? '!' : ''}` : `${m.kind}@${m.spawnRow}`).join('+')
      log.breaches.push({ row: engine.state.row, turn, who })
      if (engine.state.revives > 0) engine.continueAfterBreach('revive')
      else if (USE_METEOR && !meteorUsed) { meteorUsed = true; engine.continueAfterBreach('meteor') }
      else {
        restarts++
        log.restarts = restarts
        recentDmg.length = 0
        nextBuyTurn = Math.min(nextBuyTurn, turn + 1)
        // The FTUE lasts until the first boss kill, restarts included.
        attach(createEngineAtRow(cfgFor({ ftue: log.bossKills.length === 0 }), checkpointRow + 1, checkpointTray))
      }
    }
    // FTUE beat: one free "Tray Capacity 3" after the first merge.
    if (buys && freeCapacity && firstMerge && levels.capacity === 0) {
      freeCapacity = false
      levels.capacity = 1
    }
    if (bot === 'human') {
      if (!freeCapacity && levels.damage === 0 && log.upgrades.length === 0) {
        // The gold-arrow funnel points at Ball Damage until it is bought.
        const cost = upgradeCost('damage', 0)
        if (coins >= cost) { buy({ id: 'damage', cost }); nextBuyTurn = turn + buyGap() }
      } else if (log.upgrades.length > 0 && turn >= nextBuyTurn) {
        const up = glowing(levels, coins, engine.state)
        if (up) { buy(up); nextBuyTurn = turn + buyGap() }
      }
    } else {
      for (; buys;) {
        const up = glowing(levels, coins, engine.state)
        if (!up) break
        buy(up)
      }
    }
    engine.setConfig({ ...configFromUpgrades(levels), assist: assistNow() })
    if (turn % 20 === 0) log.rowAt[turn] = engine.state.row
    if (turn === 18) {
      log.at18 = { row: engine.state.row, tray: engine.state.tray.slice(), cap: engine.state.config.trayCapacity, coins, paid: log.upgrades.length, kills: log.kills }
    }
  }
  log.bestRow = bestRow
  log.levels = { ...levels }
  log.coins = coins
  return log
}

const mmss = (turns, sec) => {
  const s = Math.round(turns * sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const median = (xs) => {
  const v = xs.filter(x => x !== null && x !== undefined && !Number.isNaN(x)).sort((a, b) => a - b)
  if (v.length === 0) return null
  return v[Math.floor(v.length / 2)]
}

const BANDS = [[6, 10], [11, 15], [16, 20], [21, 25], [26, 30]]
const f1 = (v) => (v === null || v === undefined ? '-' : v.toFixed(1))
const f2 = (v) => (v === null || v === undefined ? '-' : v.toFixed(2))

const report = (bot) => {
  const SEC = SEC_PER_TURN[bot] ?? 7
  const samples = bot === 'human' ? HUMAN_SAMPLES : SAMPLES
  if (!BRIEF) console.log(`\n=== ${bot} bot — ${SEEDS} seeds × ${TURNS} turns (${samples} samples/turn, ${SEC} s/turn, glow ${GLOW}${USE_METEOR ? ', meteor continue' : ''}) ===`)
  const logs = []
  const t0 = performance.now()
  for (let s = 1; s <= SEEDS; s++) {
    const log = runBot(bot, s)
    logs.push(log)
    if (BRIEF) continue
    const kill = r => log.bossKills.find(k => k.row === r)?.turn ?? null
    const reach = r => log.bossSpawns.find(k => k.row === r)?.turn ?? null
    const firstBreach = log.breaches[0]
    const up = log.upgrades
    const gaps = []
    for (let i = 1; i < Math.min(up.length, 12); i++) gaps.push(up[i].turn - up[i - 1].turn)
    console.log(
      `seed ${s}: bestRow ${log.bestRow}  boss10 kill@${kill(10) ?? '-'}  boss20 kill@${kill(20) ?? '-'}` +
      `  boss30 reach@${reach(30) ?? '-'} kill@${kill(30) ?? '-'}  boss40 reach@${reach(40) ?? '-'}` +
      `  breaches ${log.breaches.length} (first row ${firstBreach?.row ?? '-'} @t${firstBreach?.turn ?? '-'})` +
      `  upgrades ${up.length} (first @t${up[0]?.turn ?? '-'}, early gaps ${gaps.join(',')})` +
      `  maxTier ${log.maxTier}  maxInFlight ${log.maxInFlight}` +
      (log.at18 ? `  t18 row ${log.at18.row} [${log.at18.tray.join(',')}] cap ${log.at18.cap} bank ${log.at18.coins} paid ${log.at18.paid}` : '')
    )
    if (VERBOSE) {
      console.log('   rows@turn', JSON.stringify(log.rowAt))
      console.log('   breaches', log.breaches.map(b => `r${b.row}@t${b.turn}(${b.who})`).join(' '))
      console.log('   levels', JSON.stringify(log.levels), 'coins', log.coins)
      console.log('   upgrades', log.upgrades.map(u => `${u.id[0]}${u.level}@t${u.turn}`).join(' '))
    }
  }
  const pick = (f) => median(logs.map(f))
  // First 3 minutes of play at this bot's pace. The free FTUE capacity is not
  // in log.upgrades.
  const EARLY_TURNS = Math.floor(180 / SEC)
  const earlyGaps = logs.flatMap(l => {
    const ups = l.upgrades.filter(u => u.turn <= EARLY_TURNS)
    const g = []
    for (let i = 1; i < ups.length; i++) g.push(ups[i].turn - ups[i - 1].turn)
    return g
  })
  const firstPaid = pick(l => l.upgrades[0]?.turn)
  const earlyCount = pick(l => l.upgrades.filter(u => u.turn <= EARLY_TURNS).length)
  const firstMergeTurn = pick(l => l.firstMergeTurn)
  const b10 = pick(l => l.bossKills.find(k => k.row === 10)?.turn)
  const r30 = pick(l => l.bossSpawns.find(k => k.row === 30)?.turn)
  const k30 = pick(l => l.bossKills.find(k => k.row === 30)?.turn)
  const fb = pick(l => l.breaches[0]?.row)
  const fbTurn = pick(l => l.breaches[0]?.turn)
  const firstTry = (row) => logs.filter(l => {
    const k = l.bossKills.find(x => x.row === row)
    return k && !l.breaches.some(b => b.turn < k.turn)
  }).length
  const firstTry10 = firstTry(10)
  // A boss fight's length: first kill turn − the turn that boss first spawned.
  const fight = (row) => pick(l => {
    const k = l.bossKills.find(x => x.row === row)
    const sp = l.bossSpawns.find(x => x.row === row)
    return k && sp ? k.turn - sp.turn : null
  })
  const who = logs.map(l => l.breaches[0]?.who ?? '-').map(w => (w.startsWith('boss') ? 'B' : w === '-' ? '-' : 'w')).join('')
  const bosses = `boss20 first try ${firstTry(20)}/${SEEDS} fight ${fight(20) ?? '-'} · boss30 ${firstTry(30)}/${SEEDS} fight ${fight(30) ?? '-'} · first breach by ${who}`
  const gapsAll = logs.flatMap(l => {
    const g = []
    for (let i = 1; i < Math.min(l.upgrades.length, 12); i++) g.push(l.upgrades[i].turn - l.upgrades[i - 1].turn)
    return g
  })
  const meanGap = gapsAll.length ? gapsAll.reduce((a, b) => a + b, 0) / gapsAll.length : null
  // Boss bounties buy several upgrades at once (gap 0); the median shows the
  // everyday rhythm between those sprees.
  const medGap = median(gapsAll)
  // Smoothness.
  const bandMed = BANDS.map(([lo, hi]) => median(logs.flatMap(l => l.pressure.filter(p => p.row >= lo && p.row <= hi).map(p => p.p))))
  const base = bandMed[0]
  const ratio = pick(l => (l.preBossHp && l.postBossHp ? l.postBossHp / l.preBossHp : null))
  const kt = logs.reduce((a, l) => a + l.killThenBreach, 0)
  const bestRow = pick(l => l.bestRow)
  const breaches = pick(l => l.breaches.length)
  // The HP clock each boss spawned with (its first spawn): row − clock = lag.
  const clockAt = [20, 30, 40, 50].map(r => [r, pick(l => l.bossSpawns.find(k => k.row === r)?.clock)])
  const clocks = `boss clocks ${clockAt.map(([r, c]) => `${r}:${c ?? '-'}`).join(' ')}`
  const at = logs.filter(l => l.at18)
  const at18 = at.length
    ? `t18 row ${median(at.map(l => l.at18.row))} cap ${median(at.map(l => l.at18.cap))} bank ${median(at.map(l => l.at18.coins))} paid ${median(at.map(l => l.at18.paid))} kills ${median(at.map(l => l.at18.kills))}` +
      ` trays ${at.slice(0, 6).map(l => `[${l.at18.tray.join(',')}]`).join(' ')}`
    : ''
  const press = `pressure ${BANDS.map(([lo, hi], i) => `${lo}-${hi} ${f1(bandMed[i])}`).join(' · ')}` +
    ` (11-15 ${f2(bandMed[1] && base ? bandMed[1] / base : null)}× · 16-20 ${f2(bandMed[2] && base ? bandMed[2] / base : null)}×)` +
    ` · post/pre boss HP ${f2(ratio)} · ${clocks}`
  if (BRIEF) {
    console.log(`${bot.padEnd(6)} b10 ${firstTry10}/${SEEDS}@${b10 ?? '-'} fb r${fb ?? '-'}@t${fbTurn ?? '-'} best ${bestRow} br ${breaches}` +
      ` r30@${r30 ?? '-'}(${r30 ? mmss(r30, SEC) : '-'}) k30@${k30 ?? '-'} merge@${firstMergeTurn ?? '-'} paid1@${firstPaid ?? '-'} 3min ${earlyCount}` +
      ` kt ${kt} | ${bosses} | ${press} | ${at18}`)
    return
  }
  console.log(`median: boss10 killed @turn ${b10 ?? '-'} (${b10 ? mmss(b10, SEC) : '-'}), first try ${firstTry10}/${SEEDS}` +
    ` · row-30 boss reached @turn ${r30 ?? '-'} (${r30 ? mmss(r30, SEC) : '-'}) killed @${k30 ?? '-'}` +
    ` · first breach row ${fb ?? '-'} @turn ${fbTurn ?? '-'} (${fbTurn ? mmss(fbTurn, SEC) : '-'}) · best row ${bestRow} · breaches ${breaches}` +
    ` · early turns/upgrade mean ${meanGap ? meanGap.toFixed(1) : '-'} (${meanGap ? Math.round(meanGap * SEC) : '-'} s)` +
    ` median ${medGap ?? '-'} (${medGap !== null ? Math.round(medGap * SEC) : '-'} s)` +
    `
        first merge @turn ${firstMergeTurn ?? '-'} · first paid upgrade @turn ${firstPaid ?? '-'}` +
    ` · upgrades in first 3 min ${earlyCount} (median gap ${median(earlyGaps) ?? '-'} turns)` +
    ` · boss10 kill turns ${logs.map(l => l.bossKills.find(k => k.row === 10)?.turn ?? '-').join(',')}` +
    `
        first breach rows ${logs.map(l => l.breaches[0]?.row ?? '-').join(',')}` +
    ` · boss10 killed at all ${logs.filter(l => l.bossKills.some(k => k.row === 10)).length}/${SEEDS}` +
    ` · boss kill + breach in one turn ${kt}` +
    ` · max balls in flight ${Math.max(...logs.map(l => l.maxInFlight))}` +
    ` · avg volley ${(logs.reduce((a, l) => a + l.volleySec, 0) / Math.max(1, logs.reduce((a, l) => a + l.volleys, 0))).toFixed(1)} s (+0.75 s resolve/advance + aiming)` +
    ` · ${((performance.now() - t0) / 1000).toFixed(1)} s` +
    `
        ${bosses}
        ${press}` +
    (at18 ? `
        ${at18}` : ''))
}

/**
 * Daily Barrage: the fixed DAILY_CONFIG kit, no upgrades, no checkpoints — the
 * run ends at the first breach (as in the game). One run per date from
 * 2026-09-01 (`--seeds` dates); the bot only picks angles.
 */
const reportDaily = (bot) => {
  const SEC = SEC_PER_TURN[bot] ?? 7
  const rows = []
  const turns = []
  const bosses = []
  for (let d = 0; d < SEEDS; d++) {
    const date = new Date(Date.UTC(2026, 8, 1 + d)).toISOString().slice(0, 10)
    const e = createEngine(defaultConfig({ ...DAILY_CONFIG, mode: 'daily', seed: dailySeed(date), ftue: false }))
    const rng = new Rng(d * 7919 + 13)
    let t = 0
    while (t < TURNS) {
      e.fire(pickAngle(e, bot, rng))
      t++
      if (e.settle() === 'breach') break
    }
    rows.push(e.state.row)
    turns.push(t)
    bosses.push(e.stats.bossKills)
  }
  const mt = median(turns)
  console.log(`daily ${bot.padEnd(6)} (${bot === 'random' ? 1 : bot === 'human' ? HUMAN_SAMPLES : SAMPLES} angle${bot === 'random' ? '' : 's'}) ` +
    `ends at row ${median(rows)} (${Math.min(...rows)}–${Math.max(...rows)}) · ${mt} turns (${mmss(mt, SEC)} at ${SEC} s) · bosses killed ${median(bosses)}` +
    (VERBOSE ? ` · rows ${rows.join(',')}` : ''))
}

const runReport = DAILY ? reportDaily : report
if (BOT === 'casual' || BOT === 'both' || BOT === 'all') runReport('casual')
if (BOT === 'random' || BOT === 'both' || BOT === 'all') runReport('random')
if (BOT === 'noup' || (BOT === 'all' && !DAILY)) runReport('noup')
if (BOT === 'human' || BOT === 'all') runReport('human')
if (BOT === 'flat' || (BOT === 'all' && !DAILY)) runReport('flat')
