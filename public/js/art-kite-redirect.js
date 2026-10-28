// `?art=kite` (before or after the #) opens the painted kite-art version with its 100 levels.
// The kite game is its own build (it folds the kite flag at compile time), served beside the normal one:
//   /umbrella/?art=kite     → /umbrella/kite/
//   /umbrella/11/?art=kite  → /umbrella/11/kite/     (every revision from 11 on)
// A classic script, first in <head>, so the normal game never even starts. Only the GitHub Pages paths
// are touched: portal builds and the kite build itself (already under /kite/) pass through.
(function () {
  try {
    // The game is a hash-routed app, so the flag may sit before the # (/umbrella/?art=kite) or after it (/umbrella/#/?art=kite).
    var hash = window.location.hash || ''
    var inHash = hash.indexOf('?') >= 0 ? hash.slice(hash.indexOf('?')) : ''
    if (new URLSearchParams(window.location.search).get('art') !== 'kite' && new URLSearchParams(inHash).get('art') !== 'kite') return
    if (/\/kite\//.test(window.location.pathname)) return
    var m = /^(\/umbrella\/(?:\d+\/)?)/.exec(window.location.pathname)
    if (!m) return
    window.location.replace(m[1] + 'kite/' + window.location.search + window.location.hash)
  } catch (e) { /* storage-less sandboxes and old browsers just play the normal game */ }
})()
