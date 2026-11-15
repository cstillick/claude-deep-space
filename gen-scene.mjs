// Builds the "Deep space" backdrop: a Hubble-deep-field-style pixel-art scene.
// Usage: node gen-scene.mjs <out hooks/scene.js> [<out preview.svg>]
//
// Everything is rasterised here onto a 384x240 grid with ordered dithering:
// the field stars, distant galaxies, the elliptical and the edge-on disk once,
// and each turning spiral as eight frames over half a turn, which CSS shows in
// turn. Twinkles and spikes step on a shared half-second beat; the frames hold
// for whole seconds, and only the brief shooting stars move faster.
//
// The desktop app draws a scene still, with no error, if its SVG uses any of
// these, so the scene uses none of them (tests/deep-space.test.tsx checks):
// - shape-rendering, as an attribute or in CSS, whatever its value
// - an @media rule other than prefers-reduced-motion (aspect-ratio,
//   orientation, width and the rest)
// - the filter steps feTile and feImage
import { writeFileSync } from 'node:fs'

const W = 384, H = 240
// The shared beat, in seconds: every change in the scene lands on a multiple of it.
const BEAT = +(process.env.BEAT ?? 0.5)
// A step of about `seconds`, rounded to whole beats.
const onBeat = seconds => Math.max(1, Math.round(seconds / BEAT)) * BEAT
let seed = 1990_04_24 // Hubble's launch day
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const pick = a => a[Math.floor(rnd() * a.length)]
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const f1 = n => String(Math.round(n * 10) / 10)

const RAMPS = {
  warm: ['#000000', '#140b06', '#2e190c', '#552f14', '#8c5420', '#cc8c3c', '#f3c26f', '#fff1cf'],
  cool: ['#000000', '#05071a', '#0c1638', '#1a3170', '#3060b8', '#6797ea', '#adcaff', '#f1f6ff'],
  pink: ['#000000', '#16050f', '#380d29', '#721c52', '#bb3884', '#ff6fae', '#ffb9d8', '#fff1f6'],
  red: ['#000000', '#120505', '#2a0c0a', '#521912', '#8c2d1c', '#cc5530', '#f5995a', '#ffdab8'],
  star: ['#000000', '#16161e', '#3a3a4a', '#6c6c84', '#a8a8c0', '#dcdcec', '#ffffff'],
}
const KEYS = Object.keys(RAMPS)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16)
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)]
const newBuf = () => Object.fromEntries(KEYS.map(k => [k, new Float32Array(W * H)]))

function render(buf, fn, cx, cy, reach) {
  const x0 = Math.max(0, Math.floor(cx - reach)), x1 = Math.min(W - 1, Math.ceil(cx + reach))
  const y0 = Math.max(0, Math.floor(cy - reach)), y1 = Math.min(H - 1, Math.ceil(cy + reach))
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const acc = {}
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const o = fn(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)
      for (const k in o) acc[k] = (acc[k] ?? 0) + o[k] / 9
    }
    for (const k in acc) buf[k][y * W + x] += acc[k]
  }
}
const frame = (cx, cy, R, q, pa) => {
  const c = Math.cos(pa), s = Math.sin(pa)
  return (x, y) => { const dx = x - cx, dy = y - cy; return [(dx * c + dy * s) / R, (-dx * s + dy * c) / (R * q)] }
}
function spiral({ cx, cy, R, q = 1, pa = 0, arms = 2, pitch = 0.3, bright = 1, knots = 0, bulge = 0.1, armRamp = 'cool', coreRamp = 'warm', twist = 0, dust = 0.55 }) {
  const toUV = frame(cx, cy, R, q, pa), k = 1 / Math.tan(pitch)
  const kn = []
  for (let i = 0; i < knots; i++) {
    const r = 0.22 + rnd() * 0.7, j = Math.floor(rnd() * arms)
    const th = k * Math.log(r) + (2 * Math.PI * j - twist) / arms + (rnd() - 0.5) * 0.25
    kn.push([r * Math.cos(th), r * Math.sin(th), 0.5 + rnd() * 0.9])
  }
  const kw = Math.max(0.022, 0.9 / R)
  return (x, y) => {
    const [u, v] = toUV(x, y), r = Math.hypot(u, v), th = Math.atan2(v, u)
    const ph = arms * (th - k * Math.log(r + 1e-4)) + twist
    const armv = Math.pow(0.5 + 0.5 * Math.cos(ph), 3)
    const dustv = Math.pow(0.5 + 0.5 * Math.cos(ph - 0.75), 10) * smooth(bulge, bulge * 2.5, r)
    const disk = Math.exp(-r / 0.32) * (1 - smooth(0.85, 1.2, r)), inner = Math.exp(-r / 0.16)
    const core = 2.2 * Math.exp(-Math.pow(r / bulge, 0.9))
    const arm = disk * (0.12 + 1.4 * armv) * (1 - dust * dustv)
    let pinkI = 0
    for (const [a, b, w] of kn) { const d2 = (u - a) ** 2 + (v - b) ** 2; if (d2 < 0.02) pinkI += w * Math.exp(-d2 / (2 * kw * kw)) }
    return { [coreRamp]: bright * (core + arm * inner), [armRamp]: bright * arm * (1 - inner), pink: bright * pinkI * disk * 1.4 }
  }
}
function elliptical({ cx, cy, R, q = 0.8, pa = 0, bright = 1, ramp = 'warm' }) {
  const toUV = frame(cx, cy, R, q, pa)
  return (x, y) => { const [u, v] = toUV(x, y), r = Math.hypot(u, v); return { [ramp]: bright * 2.4 * Math.exp(-4.2 * Math.pow(r, 0.55)) * (1 - smooth(0.9, 1.3, r)) } }
}
function edgeOn({ cx, cy, R, pa = 0, bright = 1, thick = 0.07 }) {
  const toUV = frame(cx, cy, R, 1, pa)
  return (x, y) => {
    const [u, v] = toUV(x, y)
    const disk = Math.exp(-Math.abs(u) / 0.3) * Math.exp(-Math.abs(v) / thick) * (1 - smooth(0.8, 1.05, Math.abs(u)))
    const bul = 1.8 * Math.exp(-Math.hypot(u, v * 1.5) / 0.07)
    const lane = 1 - 0.9 * Math.exp(-(((v - 0.012) / 0.02) ** 2)) * (1 - smooth(0.7, 0.95, Math.abs(u)))
    const halo = 0.25 * Math.exp(-Math.hypot(u * 0.6, v) / 0.12)
    return { warm: bright * (bul + halo) * lane, cool: bright * disk * 1.3 * lane }
  }
}
const tone = I => Math.max(0, Math.min(1, Math.asinh(I * 5) / Math.asinh(5 * 1.6)) - 0.08) / 0.92

const put = (m, color, x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; (m.get(color) ?? m.set(color, []).get(color)).push([x, y]) }
function quantize(buf, into = new Map()) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x
    let tot = 0
    for (const k of KEYS) tot += buf[k][i]
    if (tot < 0.012) continue
    let t = bayer(x + 2, y + 1) * tot, key = KEYS[0]
    for (const k of KEYS) { t -= buf[k][i]; if (t < 0) { key = k; break } }
    const ramp = RAMPS[key]
    const idx = Math.min(ramp.length - 1, Math.floor(tone(tot) * (ramp.length - 1) + bayer(x, y)))
    if (idx > 0) put(into, ramp[idx], x, y)
  }
  return into
}
function paths(m, attrs = '') {
  let out = ''
  for (const [color, pts] of m) {
    const seen = new Set(), list = []
    for (const [x, y] of pts) { const k = y * W + x; if (!seen.has(k)) { seen.add(k); list.push([x, y]) } }
    list.sort((a, b) => a[1] - b[1] || a[0] - b[0])
    const runs = []
    for (const [x, y] of list) { const r = runs[runs.length - 1]; if (r && r[1] === y && r[0] + r[2] === x) r[2]++; else runs.push([x, y, 1]) }
    let d = '', cx = null, cy = null
    for (const [x, y, n] of runs) {
      const abs = `M${x} ${y}.5h${n}`, rel = cx === null ? abs : `m${x - cx} ${y - cy}h${n}`
      d += rel.length < abs.length ? rel : abs
      cx = x + n; cy = y
    }
    out += `<path${attrs} stroke="${color}" d="${d}"/>`
  }
  return out
}

// ---- Turning spirals: pre-drawn pixel-art frames, shown one at a time.
// The desktop app stops animating a scene whose SVG has certain filter steps
// (feTile, feImage), so the spirals are drawn here by the same rasteriser as
// the still galaxies, at evenly spaced turns, and CSS shows each frame in turn.
// A two-armed spiral looks the same after half a turn, so the frames cover 180°.
const liveRects = []
const frameCss = new Set()
function frameSpiral({ cx, cy, R, q, paDeg, pitch = 0.28, twist = 0, knots = 24, arm = 'cool', bright = 1, period, frames, cls }) {
  const reach = R * 1.25 + 1
  liveRects.push([Math.floor(cx - reach), Math.floor(cy - reach * Math.max(q, 0.75)), Math.ceil(cx + reach), Math.ceil(cy + reach * Math.max(q, 0.75))])
  const half = period / 2, slot = half / frames
  const s0 = seed
  let s1 = seed, out = ''
  for (let i = 0; i < frames; i++) {
    seed = s0 // the same knots in every frame, turned with the arms
    const b = newBuf()
    render(b, spiral({ cx, cy, R, q, pa: paDeg * Math.PI / 180, pitch, bright, knots, bulge: 0.12, armRamp: arm, coreRamp: 'warm', twist: twist + 2 * Math.PI * i / frames, dust: 0.5 }), cx, cy, reach)
    s1 = seed
    out += `<g class="fr${i ? '' : ' f0'}" style="animation-name:fr${frames};animation-duration:${half}s;animation-delay:-${f1((frames - i) % frames * slot * 100) / 100}s">${paths(quantize(b))}</g>`
  }
  seed = s1
  frameCss.add(`@keyframes fr${frames}{0%{opacity:1}${f1(100000 / frames) / 1000}%,100%{opacity:0}}`)
  return { defs: '', svg: `<g class="${cls}"><g fill="none" stroke-width="1">${out}</g></g>` }
}

const quiet = (x, y) => (Math.abs(x - W / 2) < 95 && y > 55 && y < 190) || (y > 200 && Math.abs(x - W / 2) < 120)

// ---- The still deep field.
const field = newBuf()
for (let i = 0; i < 150; i++) {
  const x = rnd() * W, y = rnd() * H, far = rnd()
  const R = far < 0.7 ? 1.2 + rnd() * 2.2 : 2.5 + rnd() * 4.5
  if (R > 3 && quiet(x, y)) continue
  const bright = 0.5 + rnd() * 0.7, type = rnd()
  const fn = type < 0.45
    ? elliptical({ cx: x, cy: y, R, q: 0.45 + rnd() * 0.55, pa: rnd() * Math.PI, bright, ramp: pick(['red', 'red', 'warm']) })
    : type < 0.85
      ? spiral({ cx: x, cy: y, R, q: 0.35 + rnd() * 0.65, pa: rnd() * Math.PI, bright, knots: R > 4 ? 4 : 0, armRamp: pick(['cool', 'cool', 'pink']), coreRamp: pick(['warm', 'red']), twist: rnd() * 6, pitch: 0.25 + rnd() * 0.2 })
      : edgeOn({ cx: x, cy: y, R: R * 1.4, pa: rnd() * Math.PI, bright })
  render(field, fn, x, y, R * 1.6 + 1)
}
const fieldPx = quantize(field)
for (let i = 0; i < 520; i++) {
  const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H), b = rnd()
  const lvl = b < 0.6 ? 1 + Math.floor(rnd() * 2) : b < 0.9 ? 3 + Math.floor(rnd() * 2) : 5
  const tint = rnd(), ramp = tint < 0.12 ? RAMPS.cool : tint < 0.2 ? RAMPS.warm : RAMPS.star
  put(fieldPx, ramp[Math.min(lvl + (ramp === RAMPS.star ? 0 : 1), ramp.length - 1)], x, y)
}
const still = (fn, cx, cy, reach) => { const b = newBuf(); render(b, fn, cx, cy, reach); return quantize(b) }
const heroB = still(elliptical({ cx: 46, cy: 38, R: 26, q: 0.78, pa: 0.4, bright: 1.1 }), 46, 38, 36)
const heroC = still(edgeOn({ cx: 50, cy: 176, R: 46, pa: -0.42, bright: 1.05, thick: 0.06 }), 50, 176, 50)

// ---- The turning spirals: a grand design at top right (one turn in 4 minutes),
// a pink one at lower right (3 minutes) and the elliptical's small companion (2).
const FRAMES = +(process.env.FRAMES ?? 8)
const live = [
  frameSpiral({ cx: 322, cy: 54, R: 36, q: 0.72, paDeg: -28, twist: 1.2, knots: 32, period: 240, frames: FRAMES, cls: 'ha' }),
  frameSpiral({ cx: 346, cy: 196, R: 20, q: 0.55, paDeg: 52, pitch: 0.4, twist: 3.5, knots: 14, arm: 'pink', period: 176, frames: FRAMES, cls: 'hd' }),
  frameSpiral({ cx: 79, cy: 59, R: 8, q: 0.5, paDeg: 63, pitch: 0.34, twist: 2, knots: 3, period: 120, frames: FRAMES, cls: 'hb' }),
]
const inLive = (x, y, pad = 4) => liveRects.some(([a, b, c, d]) => x >= a - pad && x < c + pad && y >= b - pad && y < d + pad)

// ---- Timing on the shared beat: every step lands on a multiple of BEAT.
const beatDelay = maxBeats => `-${f1(Math.floor(rnd() * maxBeats) * BEAT * 100) / 100}s`

// ---- Bright stars with Hubble's four-point spikes; the long spikes breathe.
const starSpots = [[150, 22], [262, 30], [24, 112], [370, 120], [208, 226], [118, 210], [286, 168], [96, 88], [252, 104], [176, 150]]
let spikeSvg = ''
const spikeBase = new Map()
for (const [x, y] of starSpots) {
  const len = 3 + Math.floor(rnd() * 5), r = RAMPS[pick(['star', 'star', 'cool', 'warm'])], top = r.length - 1
  put(spikeBase, '#ffffff', x, y)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(spikeBase, r[top - 1], x + dx, y + dy)
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put(spikeBase, r[Math.max(1, top - 4)], x + dx, y + dy)
  const n = len + 3, longer = new Map()
  for (let s = 2; s <= n; s++) {
    const lvl = Math.max(1, Math.round(top - 1 - (s / n) * (top - 1)))
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(s <= len ? spikeBase : longer, r[lvl], x + dx * s, y + dy * s)
  }
  const step = onBeat(pick([1, 1.5, 2])) // 7 levels each way: about 7 to 14 s
  spikeSvg += `<g class="sk" style="animation-duration:${f1(step * 7 * 100) / 100}s;animation-delay:${beatDelay(96)}">${paths(longer)}</g>`
}

// ---- Twinkling stars: each fades through 8 brightness levels and back, slowly.
let twSvg = ''
let made = 0
while (made < 96) {
  const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H)
  if (inLive(x, y)) continue
  const ramp = pick([RAMPS.star, RAMPS.star, RAMPS.star, RAMPS.cool, RAMPS.warm, RAMPS.pink])
  const m = new Map()
  put(m, ramp[ramp.length - 1], x, y)
  if (rnd() < 0.3) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(m, ramp[ramp.length - 3], x + dx, y + dy)
  const step = onBeat(pick([0.5, 0.5, 1, 1.5])) // 7 levels each way: about 3.5 to 10.5 s
  const low = pick(['', ' l2', ' l3'])
  twSvg += `<g class="tw${low}" style="animation-duration:${f1(step * 7 * 100) / 100}s;animation-delay:${beatDelay(96)}">${paths(m)}</g>`
  made++
}

// ---- Shooting stars: now and then a short streak crosses a corner of the sky.
// They are the one thing off the beat: each lasts about a second, in 0.1 s
// pixel jumps, then the sky is still again for most of a minute.
let meteorSvg = '', meteorCss = ''
const meteors = [
  // start x, y, travel [dx, dy] in px (multiples of 10, so each of the 10 jumps
  // is whole pixels), period s, first after s
  [128, 8, [50, 20], 41, 6],
  [372, 124, [-40, 20], 59, 21],
  [20, 196, [40, -20], 73, 38],
  [228, 12, [-30, 30], 97, 64],
]
meteors.forEach(([x, y, [dx, dy], period, first], i) => {
  const m = new Map(), len = 9, n = Math.hypot(dx, dy), sx = dx, sy = dy
  // The head is white; the tail falls through the cool ramp behind it.
  for (let t = 0; t < len; t++) {
    const px = Math.round(x - (sx / n) * t * 1.1), py = Math.round(y - (sy / n) * t * 1.1)
    put(m, t === 0 ? '#ffffff' : RAMPS.cool[Math.max(1, 7 - Math.ceil(t * 6 / len))], px, py)
  }
  const end = +(1.1 / period * 100).toFixed(2) // percent of the cycle spent crossing
  meteorCss += `@keyframes mt${i}{0%{opacity:1;transform:translate(0,0)}${+(end * 0.6).toFixed(2)}%{opacity:1}${end}%,100%{opacity:0;transform:translate(${dx}px,${dy}px)}}`
  meteorSvg += `<g class="mt" style="animation-name:mt${i};animation-duration:${period}s;animation-delay:${first - period}s">${paths(m)}</g>`
})

// ---- A satellite: a dim point drifting across the top of the sky, one pixel
// a beat, every five minutes. Level, so every step lands on a whole pixel.
const satCross = W + 8, satPeriod = 300, satTime = satCross * BEAT
const satPct = +(satTime / satPeriod * 100).toFixed(2), satHold = +(satPct - 0.1).toFixed(2)
meteorCss += `@keyframes sat{0%{transform:translate(0,0);opacity:1}${satHold}%{opacity:1}${satPct}%{transform:translate(${satCross}px,0)}${satPct}%,100%{opacity:0;transform:translate(${satCross}px,0)}}`
const satM = new Map(); put(satM, RAMPS.star[4], 0, 30)
meteorSvg += `<g class="sat" style="animation-duration:${satPeriod}s;animation-timing-function:steps(${Math.round(satTime / BEAT)},end);animation-delay:-${satPeriod - 30}s">${paths(satM)}</g>`

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><style>
.fr{opacity:0;animation:none 60s steps(1,end) infinite}.f0{opacity:1}${[...frameCss].join('')}
.tw{animation:tw 8s steps(7,jump-none) infinite alternate}.l2{animation-name:tw2}.l3{animation-name:tw3}
@keyframes tw{from{opacity:1}to{opacity:.12}}@keyframes tw2{from{opacity:1}to{opacity:.3}}@keyframes tw3{from{opacity:.85}to{opacity:.05}}
.sk{animation:sk 8s steps(7,jump-none) infinite alternate}@keyframes sk{from{opacity:0}to{opacity:1}}
.mt,.sat{opacity:0;animation:none 60s steps(10,end) infinite}.sat{animation-name:sat}${meteorCss}
@media (prefers-reduced-motion:reduce){.fr,.tw,.sk,.mt,.sat{animation:none}}
</style><rect width="${W}" height="${H}" fill="#000"/><g fill="none" stroke-width="1">${paths(fieldPx)}<g class="hb">${paths(heroB)}</g><g class="hc">${paths(heroC)}</g>${paths(spikeBase)}${spikeSvg}${twSvg}${meteorSvg}</g>${live.map(l => l.svg).join('')}</svg>`

writeFileSync(process.argv[2], `// Generated by gen-scene.mjs: the "Deep space" backdrop, a pixel-art deep field\n// with slowly turning galaxies. It runs no script and loads nothing; CSS inside\n// its own <style> moves it.\nexport const SCENE = ${JSON.stringify(svg)}\n`)
if (process.argv[3]) writeFileSync(process.argv[3], svg)
console.log('chars', svg.length)
