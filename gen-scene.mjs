// Builds the "Deep space" backdrop: a Hubble-deep-field-style pixel-art scene.
// Usage: node gen-scene.mjs <out hooks/scene.js> [<out preview.svg>]
//
// Still parts (field stars, distant galaxies, the elliptical, the edge-on disk)
// are rasterised here onto a 384x240 grid with ordered dithering. The spiral
// galaxies are vector art that slowly rotates; an SVG filter snaps them onto
// the same grid, dither and all, so they turn as pixel art. Every animation
// steps on a shared 0.25 s beat, so the scene repaints a few times a second.
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

// ---- Live spirals: vector art, spun by CSS, snapped to the pixel grid by a filter.
const LEVELS = [0, 0.05, 0.14, 0.3, 0.5, 0.75, 1]
const hex2 = v => Math.round(v * 255).toString(16).padStart(2, '0')
function pixelFilter(id, X, Y, FW, FH) {
  let bay = '', merge = ''
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const g = hex2(BAYER[j * 4 + i])
    bay += `<feFlood x="${X + i}" y="${Y + j}" width="1" height="1" flood-color="#${g}${g}${g}" result="b${j * 4 + i}"/>`
    merge += `<feMergeNode in="b${j * 4 + i}"/>`
  }
  const tv = LEVELS.join(' ')
  return `<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="${X}" y="${Y}" width="${FW}" height="${FH}" color-interpolation-filters="sRGB">`
    + `<feGaussianBlur in="SourceGraphic" stdDeviation="0.55" result="s"/><feFlood flood-color="#000" result="k"/><feMerge result="o"><feMergeNode in="k"/><feMergeNode in="s"/></feMerge>`
    + `${bay}<feMerge x="${X}" y="${Y}" width="4" height="4" result="bt">${merge}</feMerge><feTile in="bt" result="bay"/>`
    + `<feComposite in="o" in2="bay" operator="arithmetic" k2="1" k3="${f1(1000 / LEVELS.length) / 1000}" result="d"/>`
    + `<feComponentTransfer in="d" result="q"><feFuncR type="discrete" tableValues="${tv}"/><feFuncG type="discrete" tableValues="${tv}"/><feFuncB type="discrete" tableValues="${tv}"/></feComponentTransfer>`
    + `<feColorMatrix in="q" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 12 12 12 0 0" result="p"/>`
    + `<feFlood x="${X + 0.4}" y="${Y + 0.4}" width="0.2" height="0.2" flood-color="#fff" result="dot"/><feComposite in="dot" in2="dot" x="${X}" y="${Y}" width="1" height="1" result="cell"/><feTile in="cell" result="dots"/>`
    + `<feComposite in="p" in2="dots" operator="in"/><feMorphology operator="dilate" radius="0.45"/></filter>`
}

const liveRects = []
function liveSpiral({ id, cx, cy, R, q, paDeg, pitch = 0.28, twist = 0, knots = 24, arm = 'blue', period, cls }) {
  const k = 1 / Math.tan(pitch)
  const armPts = (j, r0, r1, dth = 0) => {
    let d = ''
    const N = Math.max(14, Math.round(R * 0.9))
    for (let t = 0; t <= N; t++) {
      const r = r0 * Math.pow(r1 / r0, t / N), th = k * Math.log(r) + Math.PI * j + twist + dth
      d += `${t ? 'L' : 'M'}${f1(R * r * Math.cos(th))} ${f1(R * r * Math.sin(th))}`
    }
    return d
  }
  // Muted, Hubble-like colours: the filter's posterising saturates, so start soft.
  const cols = arm === 'pink'
    ? { mid: '#c08ad2', out: '#6a4298', knot: '#ff7ab8', disk: '#1e1030' }
    : { mid: '#9ab0e6', out: '#4566b8', knot: '#ff78b4', disk: '#0f1834' }
  const g = `g${id}`, cg = `c${id}`, dg = `d${id}`
  let body = `<circle r="${f1(R * 1.05)}" fill="url(#${dg})"/>`
  // Three widths per arm, each reaching less far, so the arms taper and fade.
  const layers = [[0.22, 0.5, 0.1, 1.02], [0.11, 0.8, 0.1, 0.92], [0.05, 0.85, 0.12, 0.8], [0.022, 0.9, 0.16, 0.66]]
  for (const [w, op, r0, r1] of layers) for (const j of [0, 1]) body += `<path d="${armPts(j, r0, r1)}" fill="none" stroke="url(#${g})" stroke-width="${f1(Math.max(0.7, w * R))}" stroke-linecap="round" opacity="${op}"/>`
  // Spurs: short, faint feathers off the arms, as in a flocculent disk.
  for (let i = 0; i < Math.round(R / 5); i++) {
    const j = i % 2, r0 = 0.3 + rnd() * 0.45, r1 = r0 + 0.12 + rnd() * 0.18
    body += `<path d="${armPts(j, r0, r1, 0.25 + rnd() * 0.35)}" fill="none" stroke="url(#${g})" stroke-width="${f1(Math.max(0.6, 0.035 * R))}" stroke-linecap="round" opacity="${f1(0.25 + rnd() * 0.25)}"/>`
  }
  for (const j of [0, 1]) body += `<path d="${armPts(j, 0.16, 0.7, -0.2)}" fill="none" stroke="#000" stroke-width="${f1(Math.max(0.6, 0.026 * R))}" opacity=".7"/>`
  // Star-forming knots, in clumps along the arms, each its own size and brightness.
  for (let i = 0; i < knots; i++) {
    const r = 0.25 + Math.pow(rnd(), 0.8) * 0.68, j = rnd() < 0.5 ? 0 : 1
    const th = k * Math.log(r) + Math.PI * j + twist + (rnd() - 0.5) * 0.3
    const c = rnd() < 0.65 ? cols.knot : '#d6e4ff'
    body += `<circle cx="${f1(R * r * Math.cos(th))}" cy="${f1(R * r * Math.sin(th))}" r="${f1(Math.max(0.45, (0.008 + rnd() * 0.02) * R))}" fill="${c}" opacity="${f1(0.45 + rnd() * 0.55)}"/>`
  }
  body += `<circle r="${f1(0.55 * R)}" fill="url(#${cg})" opacity=".45"/><circle r="${f1(0.3 * R)}" fill="url(#${cg})"/>`
  const defs = `<radialGradient id="${g}" gradientUnits="userSpaceOnUse" r="${f1(R)}"><stop offset="0" stop-color="#ffe7b0"/><stop offset=".2" stop-color="#e9b86a"/><stop offset=".4" stop-color="${cols.mid}"/><stop offset=".75" stop-color="${cols.out}" stop-opacity=".8"/><stop offset="1" stop-color="${cols.out}" stop-opacity=".4"/></radialGradient>`
    + `<radialGradient id="${cg}"><stop offset="0" stop-color="#fff8e6"/><stop offset=".3" stop-color="#ffd890"/><stop offset=".65" stop-color="#b9772f" stop-opacity=".8"/><stop offset="1" stop-color="#5a3414" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="${dg}"><stop offset="0" stop-color="${cols.disk}" stop-opacity=".7"/><stop offset=".55" stop-color="${cols.disk}" stop-opacity=".3"/><stop offset="1" stop-color="${cols.disk}" stop-opacity="0"/></radialGradient>`
  // Room for the widest stroke's round cap past the disk's edge, and the blur.
  const m = Math.ceil(R * 1.15 + 3)
  const X = Math.floor((cx - m) / 4) * 4, Y = Math.floor((cy - m) / 4) * 4
  const FW = Math.ceil((cx + m - X) / 4) * 4, FH = Math.ceil((cy + m - Y) / 4) * 4
  liveRects.push([X, Y, X + FW, Y + FH])
  // Arms wind outward with rising angle, so trailing arms mean turning the other way.
  const svg = `<g class="${cls}" filter="url(#f${id})"><g transform="translate(${cx} ${cy}) rotate(${paDeg}) scale(1 ${q})"><g class="sp" style="animation-duration:${period}s;animation-timing-function:steps(${Math.round(period / BEAT)})">${body}</g></g></g>`
  return { defs: defs + pixelFilter(`f${id}`, X, Y, FW, FH), svg }
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

// ---- The turning spirals: a grand design at top right (one turn in 12 minutes),
// a pink one at lower right (9 minutes) and the elliptical's small companion (6).
const live = [
  liveSpiral({ id: 'A', cx: 322, cy: 54, R: 44, q: 0.72, paDeg: -28, twist: 1.2, knots: 52, period: 720, cls: 'ha' }),
  liveSpiral({ id: 'D', cx: 346, cy: 196, R: 20, q: 0.55, paDeg: 52, pitch: 0.4, twist: 3.5, knots: 20, arm: 'pink', period: 540, cls: 'hd' }),
  liveSpiral({ id: 'E', cx: 79, cy: 59, R: 8, q: 0.5, paDeg: 63, pitch: 0.34, twist: 2, knots: 4, period: 360, cls: 'hb' }),
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
  const step = onBeat(pick([1.5, 2, 2.5])) // 7 levels each way: about 10 to 18 s
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
  const step = onBeat(pick([1, 1, 1.5, 2])) // 7 levels each way: about 7 to 14 s
  const low = pick(['', ' l2', ' l3'])
  twSvg += `<g class="tw${low}" style="animation-duration:${f1(step * 7 * 100) / 100}s;animation-delay:${beatDelay(96)}">${paths(m)}</g>`
  made++
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges"><style>
.sp{animation:sp 600s infinite}@keyframes sp{to{transform:rotate(-360deg)}}
.tw{animation:tw 8s steps(7,jump-none) infinite alternate}.l2{animation-name:tw2}.l3{animation-name:tw3}
@keyframes tw{from{opacity:1}to{opacity:.12}}@keyframes tw2{from{opacity:1}to{opacity:.3}}@keyframes tw3{from{opacity:.85}to{opacity:.05}}
.sk{animation:sk 8s steps(7,jump-none) infinite alternate}@keyframes sk{from{opacity:0}to{opacity:1}}
@media (max-aspect-ratio:1/1){.ha{transform:translate(-100px,4px)}.hd{transform:translate(-148px,-60px)}}
@media (max-aspect-ratio:3/5){.ha{transform:translate(-112px,4px)}.hd{transform:translate(-176px,-64px)}}
@media (min-aspect-ratio:2/1){.ha,.hb{transform:translate(0,24px)}.hc{transform:translate(0,-24px)}.hd{transform:translate(0,-28px)}}
@media (prefers-reduced-motion:reduce){.sp,.tw,.sk{animation:none}}
</style><defs>${live.map(l => l.defs).join('')}</defs><rect width="${W}" height="${H}" fill="#000"/><g fill="none" stroke-width="1">${paths(fieldPx)}<g class="hb">${paths(heroB)}</g><g class="hc">${paths(heroC)}</g>${paths(spikeBase)}${spikeSvg}${twSvg}</g>${live.map(l => l.svg).join('')}</svg>`

writeFileSync(process.argv[2], `// Generated by gen-scene.mjs: the "Deep space" backdrop, a pixel-art deep field\n// with slowly turning galaxies. It runs no script and loads nothing; CSS inside\n// its own <style> moves it.\nexport const SCENE = ${JSON.stringify(svg)}\n`)
if (process.argv[3]) writeFileSync(process.argv[3], svg)
console.log('chars', svg.length)
