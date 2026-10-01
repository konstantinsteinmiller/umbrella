// ─── In-page frame probe — injected BEFORE the app (Page.addScriptToEvaluateOnNewDocument) ───
//
// No app code changes: it wraps requestAnimationFrame at document start.
//   • frame delta  — rAF timestamp to rAF timestamp (what the player sees; vsync-quantized)
//   • frame work   — first rAF callback of a frame → a MessageChannel task posted from it,
//                    i.e. every rAF callback + microtasks + style + layout + paint record +
//                    commit of that frame (the main-thread cost of the frame, not quantized)
//   • rAF script   — the summed duration of that frame's rAF callbacks alone
//   • per-callback — each distinct rAF callback (keyed by its source text) timed separately,
//                    so the board loop, the particle loop and the stage loop are told apart
//   • long tasks + long animation frames (LoAF, with their top scripts)
// Also seeds Math.random (mulberry32) so two reps play the same run.
// Zero allocation per frame on the hot path (typed arrays; per-callback samples capped).
// Config comes from window.__PERF_CFG, set by an init script that runs before this one.
(() => {
  if (window.top !== window || window.__perfProbe) return
  const CFG = window.__PERF_CFG || {}
  if (typeof CFG.seed === 'number') {
    let a = CFG.seed >>> 0
    Math.random = function random() {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const now = performance.now.bind(performance)
  const nativeRAF = window.requestAnimationFrame.bind(window)
  const CAP = 12000
  const fDelta = new Float32Array(CAP)
  const fWork = new Float32Array(CAP)
  const fRaf = new Float32Array(CAP)
  let n = 0
  let measuring = false
  let t0Measure = 0
  let prevTs = -1
  let curTs = -1
  let curDelta = 0
  let frameT0 = 0
  let rafSum = 0
  let frameOpen = false
  let frameSeq = 0
  const closeFrame = (endT) => {
    if (!frameOpen) return
    frameOpen = false
    if (measuring && n < CAP) {
      fWork[n] = endT - frameT0
      fRaf[n] = rafSum
      fDelta[n] = curDelta
      n++
    }
  }
  const ch = new MessageChannel()
  ch.port1.onmessage = (e) => { if (e.data === frameSeq) closeFrame(now()) }

  const hash = (s) => {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
    return (h >>> 0).toString(36)
  }
  const keyOf = new WeakMap()
  const cbStats = new Map()
  const keyFor = (cb) => {
    let k = keyOf.get(cb)
    if (k === undefined) {
      let src = ''
      try { src = Function.prototype.toString.call(cb) } catch { /* exotic */ }
      k = `${src.length}:${hash(src)}`
      keyOf.set(cb, k)
      if (!cbStats.has(k)) cbStats.set(k, { n: 0, total: 0, max: 0, src: src.slice(0, 400), samples: new Float32Array(CAP), sn: 0 })
    }
    return k
  }

  window.requestAnimationFrame = function requestAnimationFrame(cb) {
    return nativeRAF((ts) => {
      if (ts !== curTs) {
        if (frameOpen) closeFrame(now())
        curDelta = prevTs >= 0 ? ts - prevTs : 0
        prevTs = ts
        curTs = ts
        frameT0 = now()
        rafSum = 0
        frameOpen = true
        frameSeq++
        ch.port2.postMessage(frameSeq)
      }
      const t0 = now()
      try {
        return cb(ts)
      } finally {
        const d = now() - t0
        rafSum += d
        if (measuring) {
          const s = cbStats.get(keyFor(cb))
          s.n++
          s.total += d
          if (d > s.max) s.max = d
          if (s.sn < CAP) s.samples[s.sn++] = d
        }
      }
    })
  }
  // Frames keep flowing (and are counted) even when the app has no rAF of its own.
  const tick = () => { window.requestAnimationFrame(tick) }
  window.requestAnimationFrame(tick)

  const longTasks = []
  const loafs = []
  try {
    new PerformanceObserver((l) => {
      if (!measuring) return
      for (const e of l.getEntries()) longTasks.push([e.startTime, e.duration])
    }).observe({ type: 'longtask' })
  } catch { /* unsupported */ }
  try {
    new PerformanceObserver((l) => {
      if (!measuring) return
      for (const e of l.getEntries()) {
        const end = e.startTime + e.duration
        loafs.push({
          d: e.duration,
          block: e.blockingDuration,
          render: e.renderStart ? end - e.renderStart : 0,
          styleLayout: e.styleAndLayoutStart ? end - e.styleAndLayoutStart : 0,
          scripts: [...(e.scripts || [])]
            .map((s) => ({ d: s.duration, inv: String(s.invoker || '').slice(0, 80), type: s.invokerType, fn: s.sourceFunctionName, url: String(s.sourceURL || '').split('/').pop(), pos: s.sourceCharPosition, fsl: s.forcedStyleAndLayoutDuration }))
            .sort((a, b) => b.d - a.d)
            .slice(0, 4)
        })
      }
    }).observe({ type: 'long-animation-frame' })
  } catch { /* unsupported */ }

  // Diagnostic arm only: pause every ENDLESS animation (CSS or WAAPI) as it appears.
  // Finite ones (entrances, transitions) run untouched, so no flow waits forever.
  if (CFG.pauseInfinite) {
    const pauseAll = () => {
      for (const a of document.getAnimations()) {
        const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null
        if (t && t.iterations === Infinity && a.playState === 'running') a.pause()
      }
    }
    setInterval(pauseAll, 500)
  }

  const sorted = (arr, len) => Array.from(arr.subarray(0, len)).sort((a, b) => a - b)
  const q = (s, p) => (s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] : 0)
  const mean = (arr, len) => { let t = 0; for (let i = 0; i < len; i++) t += arr[i]; return len ? t / len : 0 }
  const summ = (arr, len) => {
    const s = sorted(arr, len)
    return { p50: q(s, 50), p90: q(s, 90), p95: q(s, 95), p99: q(s, 99), max: s.length ? s[s.length - 1] : 0, mean: mean(arr, len) }
  }

  window.__perfProbe = {
    start() {
      n = 0
      longTasks.length = 0
      loafs.length = 0
      for (const s of cbStats.values()) { s.n = 0; s.total = 0; s.max = 0; s.sn = 0 }
      t0Measure = now()
      measuring = true
      return true
    },
    stop() {
      measuring = false
      const durMs = now() - t0Measure
      let over20 = 0
      let over36 = 0
      for (let i = 0; i < n; i++) { if (fDelta[i] > 20) over20++; if (fDelta[i] > 36) over36++ }
      const cbs = [...cbStats.entries()]
        .filter(([, s]) => s.n > 0)
        .map(([key, s]) => {
          const ss = sorted(s.samples, s.sn)
          return { key, n: s.n, total: s.total, perSec: (s.total / durMs) * 1000, mean: s.total / s.n, p95: q(ss, 95), max: s.max, src: s.src }
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 14)
      let ltTotal = 0
      let ltMax = 0
      for (const [, d] of longTasks) { ltTotal += d; if (d > ltMax) ltMax = d }
      const loafSum = loafs.reduce((a, l) => ({ d: a.d + l.d, sl: a.sl + l.styleLayout, r: a.r + l.render }), { d: 0, sl: 0, r: 0 })
      return {
        durMs,
        frames: n,
        fps: (n / durMs) * 1000,
        delta: { ...summ(fDelta, n), over20, over36 },
        work: summ(fWork, n),
        raf: summ(fRaf, n),
        longTasks: { count: longTasks.length, totalMs: ltTotal, maxMs: ltMax, perMin: (longTasks.length / durMs) * 60000 },
        loaf: { count: loafs.length, totalMs: loafSum.d, styleLayoutMs: loafSum.sl, renderMs: loafSum.r, worst: [...loafs].sort((a, b) => b.d - a.d).slice(0, 5) },
        cbs,
        raw: { delta: Array.from(fDelta.subarray(0, n), (v) => Math.round(v * 10) / 10), work: Array.from(fWork.subarray(0, n), (v) => Math.round(v * 100) / 100) }
      }
    },
    state() { return { measuring, frames: n } }
  }
})()
