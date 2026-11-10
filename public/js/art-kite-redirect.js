// `?art=kite` / `?art=lantern` (before or after the #) open a painted-art version of the game.
// Each is its own build (it folds its art flag at compile time), served beside the normal one:
//   /umbrella/?art=kite        → /umbrella/kite/        (the kite art and its 100 levels)
//   /umbrella/?art=lantern     → /umbrella/lantern/     (the normal game in the "Paper Moon" art)
//   /umbrella/11/?art=kite     → /umbrella/11/kite/     (every revision from 11 on; lantern likewise)
// A classic script, first in <head>, so the normal game never even starts. Only the GitHub Pages paths
// are touched: portal builds and an art build already under its own folder pass through.
(function () {
  try {
    // The game is a hash-routed app, so the flag may sit before the # (/umbrella/?art=kite) or after it (/umbrella/#/?art=kite).
    var hash = window.location.hash || ''
    var inHash = hash.indexOf('?') >= 0 ? hash.slice(hash.indexOf('?')) : ''
    var art = new URLSearchParams(window.location.search).get('art') || new URLSearchParams(inHash).get('art')
    if (art !== 'kite' && art !== 'lantern') return
    if (new RegExp('/' + art + '/').test(window.location.pathname)) return
    var m = /^(\/umbrella\/(?:\d+\/)?)/.exec(window.location.pathname)
    if (!m) return
    window.location.replace(m[1] + art + '/' + window.location.search + window.location.hash)
  } catch (e) { /* storage-less sandboxes and old browsers just play the normal game */ }
})()
