// ─── PokiSDK stand-in — injected before the app; the real CDN script is blocked ───
//
// Keeps the Poki build's own code path (pokiPlugin → installPokiPlaytestStage)
// while making no request to Poki: the real core, run from localhost, would send
// measure events and gameinfo requests, and `?playtest=2` would open a real
// recorder WebSocket to recorder.poki.io and upload the session. Never use that.
//
// window.__PERF_CFG:
//   stage: 'none'  → no playtestSetCanvas (the stage is never installed)
//   rec:   true    → play the recorder: after `recDelay` ms call captureStream on the
//                    stage like the SDK core does (xd(): `captureStream(qr)`, qr = 24 on
//                    desktop, 12 on mobile) and pull its frames the way the core's
//                    MediaStreamTrackProcessor does, closing each one.
//   recFps:        the rate handed to captureStream (default 12 — mobile, like the scenes)
(() => {
  if (window.top !== window) return
  const CFG = window.__PERF_CFG || {}
  const noop = () => {}
  const sdk = {
    init: () => Promise.resolve(),
    gameLoadingFinished: () => { window.__perfLoadedAt = performance.now() },
    gameplayStart: () => { window.__perfGameplay = (window.__perfGameplay || 0) + 1 },
    gameplayStop: noop,
    commercialBreak: () => Promise.resolve(),
    rewardedBreak: () => Promise.resolve(false),
    measure: noop,
    captureError: noop,
    getLanguage: () => 'en',
    getDeviceInfo: () => ({ category: CFG.device || 'mobile' }),
    getURLParam: () => '',
    movePill: noop,
    muteAd: noop,
    setVolume: noop,
    setDebug: noop,
    isAdBlocked: () => false,
    gameInteractive: noop,
    happyTime: noop,
    customEvent: noop,
    logError: noop,
    roundStart: noop,
    roundEnd: noop
  }
  if (CFG.stage !== 'none') {
    sdk.playtestSetCanvas = (c) => {
      const canvas = [].concat(c)[0]
      window.__perfStage = canvas
      if (!CFG.rec || !canvas) return
      setTimeout(() => {
        try {
          const stream = canvas.captureStream(CFG.recFps || 12)
          const track = stream.getVideoTracks()[0]
          const rec = { frames: 0, error: null }
          window.__perfRec = rec
          if (typeof MediaStreamTrackProcessor === 'function') {
            const reader = new MediaStreamTrackProcessor({ track }).readable.getReader()
            ;(async () => {
              for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                rec.frames++
                value.close()
              }
            })()
          } else {
            const v = document.createElement('video')
            v.muted = true
            v.srcObject = stream
            v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
            document.body.appendChild(v)
            v.play().catch(() => {})
          }
        } catch (e) {
          window.__perfRec = { frames: 0, error: String(e) }
        }
      }, CFG.recDelay ?? 1500)
    }
  }
  window.PokiSDK = sdk
})()
