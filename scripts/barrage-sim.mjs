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
 *
 * Targets (lead playtest follow-up)
 *   random: first paid upgrade within ~5 turns of the FTUE's free one; median
 *           gap ≤ 3–4 turns in the first 3 min; row-10 boss first try ≥ 7/10
 *           by ~turn 20–25; first breach around rows 18–25.
 *   casual: row-30 boss reached at ~4–6 min; still breaches past row 40.
 *   sprite budget: balls in flight ≤ ~40.
 *
 * Last tuning run (20 seeds × 220 turns, 7 s/turn):
 *   casual  boss10 first try 20/20 @turn 12 · row-30 boss reached @turn 47
 *           (5:29), killed 20/20 (median turn 116) · first breach row 32 ·
 *           best row 62 · 12 breaches · 13 upgrades in the first 3 min
 *   random  first merge turn 3 · first paid upgrade turn 4 · 9 upgrades in
 *           the first 3 min (median gap 2) · boss10 first try 18/20 @turn 16
 *           · first breach row 26 · best row 39 · 13 breaches
 *
 * Flags: --seeds 6  --turns 260  --samples 8  --bot casual|random|noup|flat|both|all
 *        --meteor (use the once-per-checkpoint rewarded continue)  --verbose
 *        --trace N (per-turn table for seed 1, every N turns)
 *        --tune '{"hp":{"growth":1.06},"eco":{"coinGrowth":1.05}}' (sweep
 *          the HP_CURVE / ECONOMY tables in-process without editing them)
 */
import { createEngine, createEngineAtRow } from '../src/barrage/engine/engine.ts'
import {
  ECONOMY, UPGRADE_IDS, configFromUpgrades, defaultConfig, upgradeCost, upgradeMaxLevel
} from '../src/barrage/engine/economy.ts'
import { HP_CURVE } from '../src/barrage/engine/monsters.ts'
import { trayPower } from '../src/barrage/engine/balls.ts'
import { Rng } from '../src/barrage/engine/rng.ts'
import { MIN_AIM } from '../src/barrage/engine/types.ts'

const SEC_PER_TURN = 7

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
const TRACE = Number(flag('trace', 0))
const TUNE = flag('tune', null)
if (typeof TUNE === 'string') {
  const t = JSON.parse(TUNE)
  if (t.hp) Object.assign(HP_CURVE, t.hp)
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
  let best = Math.PI / 2
  let bestScore = -Infinity
  for (let i = 0; i < SAMPLES; i++) {
    const a = lo + rng.next() * span
    const c = engine.clone()
    c.fire(a)
    c.settle()
    const sc = scoreTurn(engine, c)
    if (sc > bestScore) { bestScore = sc; best = a }
  }
  return best
}

const runBot = (bot, seed) => {
  const rng = new Rng(seed * 7919 + (bot === 'casual' ? 0 : 1))
  const buys = bot !== 'noup'
  const levels = { damage: 0, capacity: 0, speed: 0, luck: 0, bounty: 0 }
  let coins = 0
  let checkpointRow = 0
  let checkpointTray = [1]
  let meteorUsed = false
  let freeCapacity = true
  let firstMerge = false
  let restarts = 0
  const cfgFor = (extra) => ({ ...defaultConfig({ seed: seed + restarts * 1000003 }), ...configFromUpgrades(levels), ...extra })
  let engine
  const attach = (e) => {
    e.on(ev => {
      if (ev.type === 'coins') coins += ev.amount
      else if (ev.type === 'bossDefeated') {
        coins += ev.bounty
        checkpointRow = ev.row
        checkpointTray = e.state.tray.slice()
        meteorUsed = false
        log.bossKills.push({ row: ev.row, turn })
      } else if (ev.type === 'volleyEnd') {
        // Emitted before the phase flips, so phaseTime is the volley's length.
        log.volleySec += e.state.phaseTime
        log.volleys++
      } else if (ev.type === 'bossSpawn') log.bossSpawns.push({ row: ev.row, turn })
      else if (ev.type === 'trayMerge') {
        if (!firstMerge) log.firstMergeTurn = turn
        firstMerge = true
      }
    })
    engine = e
  }
  const log = { bossSpawns: [], bossKills: [], breaches: [], upgrades: [], rowAt: {}, maxInFlight: 0, maxTier: 1, restarts: 0, volleySec: 0, volleys: 0, firstMergeTurn: null }
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
    if (TRACE && seed === 1 && turn % TRACE === 0) {
      let hpLeft = 0
      for (const m of engine.state.monsters) hpLeft += m.hp
      console.log(`  t${turn} row ${engine.state.row} tray ${trayStr} power ${power.toFixed(1)} dealt ${(engine.stats.damage - dmg0).toFixed(0)}` +
        ` boardHP ${hpLeft.toFixed(0)} mons ${engine.state.monsters.length} +coins ${coins - coins0} bank ${coins} lv ${JSON.stringify(levels)}`)
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
        // The FTUE lasts until the first boss kill, restarts included.
        attach(createEngineAtRow(cfgFor({ ftue: log.bossKills.length === 0 }), checkpointRow + 1, checkpointTray))
      }
    }
    // FTUE beat: one free "Tray Capacity 3" after the first merge.
    if (buys && freeCapacity && firstMerge && levels.capacity === 0) {
      freeCapacity = false
      levels.capacity = 1
    }
    for (; buys;) {
      const up = cheapestAffordable(levels, coins)
      if (!up) break
      coins -= up.cost
      levels[up.id]++
      log.upgrades.push({ turn, id: up.id, level: levels[up.id], cost: up.cost })
    }
    engine.setConfig(configFromUpgrades(levels))
    if (turn % 20 === 0) log.rowAt[turn] = engine.state.row
  }
  log.bestRow = bestRow
  log.levels = { ...levels }
  log.coins = coins
  return log
}

const mmss = (turns) => {
  const s = turns * SEC_PER_TURN
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const median = (xs) => {
  const v = xs.filter(x => x !== null && x !== undefined).sort((a, b) => a - b)
  if (v.length === 0) return null
  return v[Math.floor(v.length / 2)]
}

const report = (bot) => {
  console.log(`\n=== ${bot} bot — ${SEEDS} seeds × ${TURNS} turns (${SAMPLES} samples/turn${USE_METEOR ? ', meteor continue' : ''}) ===`)
  const logs = []
  const t0 = performance.now()
  for (let s = 1; s <= SEEDS; s++) {
    const log = runBot(bot, s)
    logs.push(log)
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
      `  maxTier ${log.maxTier}  maxInFlight ${log.maxInFlight}`
    )
    if (VERBOSE) {
      console.log('   rows@turn', JSON.stringify(log.rowAt))
      console.log('   breaches', log.breaches.map(b => `r${b.row}@t${b.turn}(${b.who})`).join(' '))
      console.log('   levels', JSON.stringify(log.levels), 'coins', log.coins)
    }
  }
  const pick = (f) => median(logs.map(f))
  // First 3 minutes of play (7 s turns): the "each turn nearly pays for an
  // upgrade" window. The free FTUE capacity is not in log.upgrades.
  const EARLY_TURNS = Math.floor(180 / SEC_PER_TURN)
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
  const firstTry10 = logs.filter(l => {
    const k = l.bossKills.find(x => x.row === 10)
    return k && !l.breaches.some(b => b.turn < k.turn)
  }).length
  const gapsAll = logs.flatMap(l => {
    const g = []
    for (let i = 1; i < Math.min(l.upgrades.length, 12); i++) g.push(l.upgrades[i].turn - l.upgrades[i - 1].turn)
    return g
  })
  const meanGap = gapsAll.length ? gapsAll.reduce((a, b) => a + b, 0) / gapsAll.length : null
  // Boss bounties buy several upgrades at once (gap 0); the median shows the
  // everyday rhythm between those sprees.
  const medGap = median(gapsAll)
  console.log(`median: boss10 killed @turn ${b10 ?? '-'} (${b10 ? mmss(b10) : '-'}), first try ${firstTry10}/${SEEDS}` +
    ` · row-30 boss reached @turn ${r30 ?? '-'} (${r30 ? mmss(r30) : '-'}) killed @${k30 ?? '-'}` +
    ` · first breach row ${fb ?? '-'} · best row ${pick(l => l.bestRow)} · breaches ${pick(l => l.breaches.length)}` +
    ` · early turns/upgrade mean ${meanGap ? meanGap.toFixed(1) : '-'} (${meanGap ? Math.round(meanGap * SEC_PER_TURN) : '-'} s)` +
    ` median ${medGap ?? '-'} (${medGap !== null ? medGap * SEC_PER_TURN : '-'} s)` +
    `
        first merge @turn ${firstMergeTurn ?? '-'} · first paid upgrade @turn ${firstPaid ?? '-'}` +
    ` · upgrades in first 3 min ${earlyCount} (median gap ${median(earlyGaps) ?? '-'} turns)` +
    ` · boss10 kill turns ${logs.map(l => l.bossKills.find(k => k.row === 10)?.turn ?? '-').join(',')}` +
    `
        first breach rows ${logs.map(l => l.breaches[0]?.row ?? '-').join(',')}` +
    ` · max balls in flight ${Math.max(...logs.map(l => l.maxInFlight))}` +
    ` · avg volley ${(logs.reduce((a, l) => a + l.volleySec, 0) / Math.max(1, logs.reduce((a, l) => a + l.volleys, 0))).toFixed(1)} s (+0.75 s resolve/advance + aiming)` +
    ` · ${((performance.now() - t0) / 1000).toFixed(1)} s`)
}

if (BOT === 'casual' || BOT === 'both' || BOT === 'all') report('casual')
if (BOT === 'random' || BOT === 'both' || BOT === 'all') report('random')
if (BOT === 'noup' || BOT === 'all') report('noup')
if (BOT === 'flat' || BOT === 'all') report('flat')
