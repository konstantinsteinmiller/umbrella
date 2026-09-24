// Player CLI:  node pt.mjs <port> <command> [args]
//   hello | shot | wait <ms> | tap <x> <y> | drag <x0> <y0> <x1> <y1> [ms] | end
const [port, cmd, ...rest] = process.argv.slice(2)
const r = await fetch(`http://127.0.0.1:${port}/${cmd}?a=${rest.join(',')}`)
console.log(JSON.stringify(await r.json(), null, 1))
