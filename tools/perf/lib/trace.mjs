// ─── Trace breakdown: where the renderer main thread's time goes ─────────────
//
// Records a CDP trace for `ms`, then sums SELF time per event name on the page's
// renderer main thread (CrRendererMain) and on its compositor / raster threads.
// Tracing costs time itself: use it to find WHERE, and the probe (tracing off)
// for the numbers that are compared.

const CATEGORIES = [
  'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'blink', 'cc', 'gpu', 'viz', 'toplevel', 'v8', 'blink.animations', 'disabled-by-default-v8.gc'
].join(',')

/** @returns {Promise<object[]>} the trace events */
export const recordTrace = async (cdp, sessionId, ms) => {
  const events = []
  const off1 = cdp.on('Tracing.dataCollected', (p) => { for (const e of p.value) events.push(e) }, sessionId)
  let done
  const finished = new Promise((r) => { done = r })
  const off2 = cdp.on('Tracing.tracingComplete', () => done(), sessionId)
  await cdp.send('Tracing.start', { categories: CATEGORIES, transferMode: 'ReportEvents', options: 'sampling-frequency=10000' }, sessionId)
  await new Promise((r) => setTimeout(r, ms))
  await cdp.send('Tracing.end', {}, sessionId)
  await finished
  off1()
  off2()
  return events
}

/** Self time (ms) per event name, per thread role. */
export const breakdown = (events) => {
  const threadName = new Map()
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') threadName.set(`${e.pid}:${e.tid}`, e.args?.name)
  // The busiest CrRendererMain is the page's.
  const counts = new Map()
  for (const e of events) {
    const k = `${e.pid}:${e.tid}`
    if (threadName.get(k) === 'CrRendererMain') counts.set(k, (counts.get(k) || 0) + 1)
  }
  const mainKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const mainPid = mainKey?.split(':')[0]
  const roleOf = (k) => {
    if (k === mainKey) return 'main'
    const [pid] = k.split(':')
    const name = threadName.get(k) || ''
    if (pid !== mainPid) return null
    if (/Compositor$/.test(name)) return 'compositor'
    if (/Raster|CompositorTileWorker/.test(name)) return 'raster'
    return null
  }
  // Per thread: complete events (ph X) plus B/E pairs, then self time by nesting.
  const byThread = new Map()
  const open = new Map()
  for (const e of events) {
    const k = `${e.pid}:${e.tid}`
    const role = roleOf(k)
    if (!role) continue
    if (!byThread.has(k)) byThread.set(k, [])
    if (e.ph === 'X' && typeof e.dur === 'number') byThread.get(k).push({ name: e.name, ts: e.ts, dur: e.dur })
    else if (e.ph === 'B') { if (!open.has(k)) open.set(k, []); open.get(k).push(e) }
    else if (e.ph === 'E') { const b = open.get(k)?.pop(); if (b) byThread.get(k).push({ name: b.name, ts: b.ts, dur: e.ts - b.ts }) }
  }
  const out = {}
  let frames = 0
  let spanUs = 0
  for (const [k, list] of byThread) {
    const role = roleOf(k)
    list.sort((a, b) => a.ts - b.ts || b.dur - a.dur)
    const self = new Map()
    const stack = []
    for (const ev of list) {
      while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= ev.ts) stack.pop()
      const parent = stack[stack.length - 1]
      if (parent) parent.child += Math.min(ev.dur, parent.ts + parent.dur - ev.ts)
      ev.child = 0
      stack.push(ev)
    }
    for (const ev of list) self.set(ev.name, (self.get(ev.name) || 0) + Math.max(0, ev.dur - ev.child))
    if (role === 'main') {
      frames = Math.max(list.filter((e) => e.name === 'BeginMainFrame').length, list.filter((e) => e.name === 'FireAnimationFrame').length)
      if (list.length) spanUs = list[list.length - 1].ts + list[list.length - 1].dur - list[0].ts
    }
    const bucket = (out[role] = out[role] || new Map())
    for (const [name, us] of self) bucket.set(name, (bucket.get(name) || 0) + us)
  }
  const fmt = (m) => [...(m || new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, us]) => ({ name, ms: us / 1000, msPerFrame: frames ? us / 1000 / frames : 0 }))
  return { frames, spanMs: spanUs / 1000, main: fmt(out.main), compositor: fmt(out.compositor), raster: fmt(out.raster) }
}
