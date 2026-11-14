// Procedural canvas textures. Facade tiles are 2 bays wide; walls set UVs in whole bays / floors.
import { THREE, rng } from './util.js';

const C = 256;                                  // px per bay / per floor
export const WIN = { x0: .27, x1: .73, y0: .2, y1: .8 };   // window rect inside a cell (y down)
let ANISO = 4;
export function setAniso(a) { ANISO = a; }

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
function speckle(g, w, h, r, n, dark = .08, light = .06) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() < .5 ? `rgba(0,0,0,${r() * dark})` : `rgba(255,255,255,${r() * light})`;
    const s = 1 + r() * 5; g.fillRect(r() * w, r() * h, s, s * (.4 + r()));
  }
}
function streaks(g, w, h, r, n = 14) {           // rain / soot streaks
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, l = 30 + r() * 120;
    const gr = g.createLinearGradient(0, y, 0, y + l);
    gr.addColorStop(0, `rgba(20,15,10,${.05 + r() * .08})`); gr.addColorStop(1, 'rgba(20,15,10,0)');
    g.fillStyle = gr; g.fillRect(x, y, 3 + r() * 10, l);
  }
}

export const STYLES = {
  red:        { kind: 'brick', c: [9, 50, 37],  trim: '#cfc6b4', cornice: [.24, .16, .13], arch: true },
  orange:     { kind: 'brick', c: [14, 60, 43], trim: '#d8cdb6', cornice: [.30, .19, .14], arch: true },
  darkred:    { kind: 'brick', c: [3, 44, 28],  trim: '#a89b86', cornice: [.18, .13, .11] },
  brown:      { kind: 'brick', c: [20, 30, 30], trim: '#b5a78e', cornice: [.2, .17, .14] },
  tan:        { kind: 'brick', c: [36, 38, 58], trim: '#e2d9c4', cornice: [.42, .37, .3] },
  brownstone: { kind: 'stone', c: [19, 30, 31], trim: '#4f352a', cornice: [.22, .15, .12] },
  limestone:  { kind: 'stone', c: [42, 16, 68], trim: '#cfc7b4', cornice: [.6, .57, .5] },
  sidingA:    { kind: 'siding', c: [44, 32, 80], trim: '#ffffff', cornice: [.8, .78, .72] },
  sidingB:    { kind: 'siding', c: [206, 16, 64], trim: '#f4f4f0', cornice: [.75, .78, .8] },
  sidingC:    { kind: 'siding', c: [20, 6, 84],  trim: '#ffffff', cornice: [.5, .5, .5] },
  modernA:    { kind: 'modern', c: [210, 6, 60], trim: '#2a2c30', accent: '#8c5a3a' },
  modernB:    { kind: 'modern', c: [34, 14, 74], trim: '#33302c', accent: '#5b6770' },
  modernC:    { kind: 'modern', c: [215, 8, 34], trim: '#17181a', accent: '#b9773f' },
  stucco:     { kind: 'stucco', c: [38, 14, 72], trim: '#8a8478', cornice: [.5, .47, .42] },
  cinder:     { kind: 'cinder', c: [30, 4, 56],  trim: '#666', cornice: [.4, .4, .4] },
};

function base(g, w, h, st, r, y0 = 0) {
  const [H, S, L] = st.c;
  if (st.kind === 'brick') {
    g.fillStyle = hsl(H + 12, S * .25, L + 18); g.fillRect(0, y0, w, h);
    for (let y = y0, row = 0; y < y0 + h; y += 8, row++)
      for (let x = -((row % 2) * 11); x < w; x += 22) {
        g.fillStyle = hsl(H + (r() - .5) * 8, S + (r() - .5) * 12, L + (r() - .5) * 11 - (r() < .06 ? 9 : 0));
        g.fillRect(x + 1, y + 1, 20.4, 6.4);
      }
  } else if (st.kind === 'stone') {
    g.fillStyle = hsl(H, S, L); g.fillRect(0, y0, w, h);
    for (let y = y0; y < y0 + h; y += 32) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, y, w, 1.5); g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, y + 2, w, 1); }
    for (let y = y0, row = 0; y < y0 + h; y += 32, row++) for (let x = (row % 2) * 48; x < w; x += 96) { g.fillStyle = 'rgba(0,0,0,.09)'; g.fillRect(x, y, 1.5, 32); }
  } else if (st.kind === 'siding') {
    g.fillStyle = hsl(H, S, L); g.fillRect(0, y0, w, h);
    for (let y = y0; y < y0 + h; y += 10) { g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, y + 8.5, w, 1.5); g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(0, y, w, 1.5); }
  } else if (st.kind === 'modern') {
    g.fillStyle = hsl(H, S, L); g.fillRect(0, y0, w, h);
    for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x, y0, 1.5, h); }
    for (let y = y0; y < y0 + h; y += 128) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, y, w, 1.5); }
  } else if (st.kind === 'cinder') {
    g.fillStyle = hsl(H, S, L); g.fillRect(0, y0, w, h);
    for (let y = y0, row = 0; y < y0 + h; y += 20, row++) for (let x = -((row % 2) * 20); x < w; x += 40) { g.strokeStyle = 'rgba(0,0,0,.18)'; g.strokeRect(x + .5, y + .5, 40, 20); }
  } else { g.fillStyle = hsl(H, S, L); g.fillRect(0, y0, w, h); }
  speckle(g, w, h + y0, r, st.kind === 'brick' ? 500 : 900);
}

function glass(g, x, y, w, h, r, night) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  const d = r() * 14;
  gr.addColorStop(0, hsl(212, 22, 30 + d)); gr.addColorStop(.55, hsl(210, 20, 19 + d * .5)); gr.addColorStop(1, hsl(215, 18, 12));
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.08)';                           // diagonal sky glint
  g.beginPath(); g.moveTo(x, y + h * .5); g.lineTo(x + w * .6, y); g.lineTo(x + w * .85, y); g.lineTo(x, y + h * .8); g.fill();
}

function windowCell(g, cx, cy, st, r, wide) {
  const x = cx + (wide ? .14 : WIN.x0) * C, y = cy + WIN.y0 * C, w = (wide ? .72 : WIN.x1 - WIN.x0) * C, h = (WIN.y1 - WIN.y0) * C;
  const k = st.kind;
  if (k === 'brick' || k === 'stone' || k === 'stucco') {         // stone lintel + sill
    g.fillStyle = st.trim;
    if (st.arch && k === 'brick') { g.beginPath(); g.moveTo(x - 8, y); g.quadraticCurveTo(x + w / 2, y - 26, x + w + 8, y); g.lineTo(x + w + 8, y - 14); g.quadraticCurveTo(x + w / 2, y - 40, x - 8, y - 14); g.fill(); }
    else g.fillRect(x - 9, y - 18, w + 18, 18);
    g.fillRect(x - 10, y + h, w + 20, 10);
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x - 10, y + h + 10, w + 20, 4);
    if (k === 'stone') { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 5; g.strokeRect(x - 7, y - 7, w + 14, h + 12); g.fillStyle = st.trim; g.fillRect(x - 14, y - 26, w + 28, 12); }
  } else if (k === 'siding') { g.fillStyle = st.trim; g.fillRect(x - 9, y - 9, w + 18, h + 20); }
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x - 2, y - 2, w + 4, h + 4);   // reveal shadow
  glass(g, x, y, w, h, r);
  const frame = k === 'modern' ? st.trim : (r() < .5 ? '#e8e6df' : (r() < .5 ? '#3a2f2a' : '#8f8a80'));
  g.strokeStyle = frame; g.lineWidth = k === 'modern' ? 5 : 6; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
  if (k === 'modern') { g.fillStyle = frame; g.fillRect(x + w * .33, y, 4, h); g.fillRect(x, y + h * .7, w, 4); }
  else { g.fillStyle = frame; g.fillRect(x, y + h * .48, w, 6); if (wide) g.fillRect(x + w / 2 - 3, y, 6, h); }
  const v = r();
  if (v < .3) { g.fillStyle = `rgba(${225 + r() * 25 | 0},${220 + r() * 20 | 0},${200 + r() * 30 | 0},.82)`; const bh = h * (.2 + r() * .32); g.fillRect(x + 6, y + 6, w - 12, bh); for (let s = y + 10; s < y + bh; s += 6) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x + 6, s, w - 12, 1); } }
  else if (v < .5) { g.fillStyle = hsl(r() * 360, 22, 62, .7); g.fillRect(x + 6, y + 6, w * .28, h - 12); g.fillRect(x + w * .72 - 6, y + 6, w * .28, h - 12); }
  if (k !== 'modern' && r() < .22) { const ah = 34; g.fillStyle = '#b9b7ae'; g.fillRect(x + 12, y + h - ah - 4, w - 24, ah); g.fillStyle = 'rgba(0,0,0,.3)'; for (let s = 0; s < ah - 8; s += 5) g.fillRect(x + 16, y + h - ah + s, w - 32, 2); }
}

function finish(g, w, h, r) { streaks(g, w, h, r); }

// ---- per-style texture set: up (2x2 cells), gr / shop (2x1), blank ----
const cache = new Map();
export function styleTextures(name) {
  if (cache.has(name)) return cache.get(name);
  const st = STYLES[name], r = rng(name.length * 7919 + name.charCodeAt(0) * 31 + name.charCodeAt(name.length - 1));
  const wide = st.kind === 'modern';
  const [cu, gu] = canvas(C * 2, C * 2);
  base(gu, C * 2, C * 2, st, r);
  if (st.kind === 'modern') { gu.fillStyle = st.accent; gu.fillRect(0, 0, 40, C * 2); }
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) windowCell(gu, i * C, j * C, st, r, wide);
  if (st.kind !== 'modern' && st.kind !== 'siding') { gu.fillStyle = 'rgba(0,0,0,.12)'; gu.fillRect(0, 0, C * 2, 3); }
  finish(gu, C * 2, C * 2, r);

  // residential ground floor: door bay + window bay
  const [cg, gg] = canvas(C * 2, C);
  base(gg, C * 2, C, st, r);
  if (st.kind === 'brick' || st.kind === 'stone') { gg.fillStyle = 'rgba(0,0,0,.16)'; gg.fillRect(0, C - 42, C * 2, 42); gg.fillStyle = st.trim; gg.fillRect(0, C - 46, C * 2, 5); }
  { const x = .26 * C, w = .48 * C, y = .12 * C, h = .88 * C;
    gg.fillStyle = st.trim; gg.fillRect(x - 12, y - 14, w + 24, h + 14);
    gg.fillStyle = 'rgba(0,0,0,.5)'; gg.fillRect(x - 3, y - 3, w + 6, h + 3);
    glass(gg, x, y, w, h * .2, r);
    gg.fillStyle = ['#3c2a22', '#1f2a26', '#4a1f1c', '#22262c'][r() * 4 | 0]; gg.fillRect(x, y + h * .22, w, h * .78);
    gg.strokeStyle = 'rgba(255,255,255,.12)'; gg.lineWidth = 3; gg.strokeRect(x + 10, y + h * .28, w / 2 - 14, h * .3); gg.strokeRect(x + w / 2 + 4, y + h * .28, w / 2 - 14, h * .3);
    gg.strokeRect(x + 10, y + h * .64, w / 2 - 14, h * .3); gg.strokeRect(x + w / 2 + 4, y + h * .64, w / 2 - 14, h * .3);
    gg.fillStyle = '#c9a54a'; gg.fillRect(x + w - 16, y + h * .6, 6, 6); }
  windowCell(gg, C, 0, st, r, wide);
  gg.strokeStyle = 'rgba(15,15,15,.75)'; gg.lineWidth = 2;        // window guard
  for (let x = C + WIN.x0 * C + 8; x < C + WIN.x1 * C; x += 14) { gg.beginPath(); gg.moveTo(x, WIN.y0 * C + C * .3); gg.lineTo(x, WIN.y1 * C); gg.stroke(); }
  finish(gg, C * 2, C, r);

  // storefront ground floor: glazed shop + roll-down gate, piers in the building's masonry
  const [cs, gs] = canvas(C * 2, C), [ce, ge] = canvas(C * 2, C);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, C * 2, C);
  base(gs, C * 2, C, st, r);
  for (let i = 0; i < 2; i++) {
    const x = i * C + 16, w = C - 32, y = 40, h = C - 40;
    gs.fillStyle = '#1b1c1e'; gs.fillRect(x - 4, y - 4, w + 8, h + 4);
    if (i === 0) {
      glass(gs, x, y, w, h - 34, r);
      gs.fillStyle = 'rgba(255,214,150,.16)'; gs.fillRect(x, y, w, h - 34);
      gs.fillStyle = '#2b2d30'; gs.fillRect(x, y + h - 34, w, 34);
      gs.fillStyle = '#b8bbbd'; gs.fillRect(x + w * .58, y, 5, h); gs.fillRect(x, y + 44, w, 4); gs.fillRect(x + w * .58, y + h * .55, 22, 4);
      for (let k = 0; k < 6; k++) { gs.fillStyle = hsl(r() * 360, 35, 60, .5); gs.fillRect(x + 8 + r() * (w * .5 - 40), y + 56 + r() * (h - 150), 22 + r() * 30, 26 + r() * 30); }
      ge.fillStyle = '#ffd9a0'; ge.fillRect(x, y, w, h - 34); ge.fillStyle = 'rgba(0,0,0,.35)'; ge.fillRect(x, y + h * .5, w * .58, h * .5 - 34);
    } else {
      gs.fillStyle = '#8d9296'; gs.fillRect(x, y, w, h);
      for (let s = y; s < y + h; s += 7) { gs.fillStyle = 'rgba(0,0,0,.22)'; gs.fillRect(x, s + 5, w, 2); gs.fillStyle = 'rgba(255,255,255,.14)'; gs.fillRect(x, s, w, 2); }
      gs.strokeStyle = hsl(r() * 360, 50, 40, .55); gs.lineWidth = 5; gs.lineCap = 'round'; gs.beginPath();   // a little tagging
      let px = x + 20, py = y + h * .6; gs.moveTo(px, py);
      for (let k = 0; k < 7; k++) { px += 18 + r() * 14; py = y + h * (.45 + r() * .35); gs.lineTo(px, py); } gs.stroke();
    }
  }
  finish(gs, C * 2, C, r);

  const [cb, gb] = canvas(C, C);
  const plain = st.kind === 'brick' ? { ...st, c: [st.c[0] + 4, st.c[1] * .6, st.c[2] + 4] } : st;   // common brick on side walls
  base(gb, C, C, plain, r); streaks(gb, C, C, r, 8);

  const set = { st, up: tex(cu, .5, .5), gr: tex(cg, .5, 1), shop: tex(cs, .5, 1), shopLit: tex(ce, .5, 1), blank: tex(cb), wide };
  cache.set(name, set); return set;
}

// lit-window mask for night: 4x4 cells, a random subset glowing
export function litWindows(wide) {
  const n = 4, s = 64, [c, g] = canvas(n * s, n * s), r = rng(wide ? 77 : 33);
  g.fillStyle = '#000'; g.fillRect(0, 0, n * s, n * s);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (r() > .42) continue;
    const x = i * s + (wide ? .14 : WIN.x0) * s, w = (wide ? .72 : WIN.x1 - WIN.x0) * s, y = j * s + WIN.y0 * s, h = (WIN.y1 - WIN.y0) * s;
    const v = r(); g.fillStyle = v < .12 ? '#9db8ff' : v < .5 ? '#ffd08a' : v < .8 ? '#ffe3b5' : '#ffb86b';
    g.globalAlpha = .55 + r() * .45; g.fillRect(x, y, w, h); g.globalAlpha = 1;
    if (r() < .5) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, y, w, h * (.2 + r() * .3)); }
    g.fillStyle = '#000'; g.fillRect(x, y + h * .48, w, 1.5);
  }
  return tex(c, .25, .25);
}

export function asphalt() {
  const [c, g] = canvas(512, 512), r = rng(5);
  g.fillStyle = '#77787a'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { const v = 85 + r() * 80 | 0; g.fillStyle = `rgba(${v},${v},${v + 2},.5)`; g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${r() < .5 ? '30,30,32' : '110,110,112'},${.04 + r() * .08})`; g.beginPath(); g.ellipse(r() * 512, r() * 512, 20 + r() * 90, 10 + r() * 40, r() * 3, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(30,30,32,.3)'; g.lineWidth = 1.2;                 // cracks / tar seams
  for (let i = 0; i < 5; i++) { let x = r() * 512, y = r() * 512; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - .5) * 90; y += (r() - .5) * 90; g.lineTo(x, y); } g.stroke(); }
  return tex(c, 1, 1);
}
export function concrete() {
  const [c, g] = canvas(256, 256), r = rng(9);
  g.fillStyle = '#a9a7a0'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = r() < .5 ? `rgba(0,0,0,${r() * .07})` : `rgba(255,255,255,${r() * .07})`; g.fillRect(i * 128, j * 128, 128, 128); }
  speckle(g, 256, 256, r, 2600, .12, .1);
  g.fillStyle = 'rgba(40,40,40,.5)'; for (let k = 0; k < 2; k++) { g.fillRect(k * 128, 0, 2, 256); g.fillRect(0, k * 128, 256, 2); }
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(25,25,25,${.25 + r() * .3})`; g.beginPath(); g.arc(r() * 256, r() * 256, 1.5 + r() * 3, 0, 7); g.fill(); }   // gum spots
  return tex(c, 1, 1);
}
export function steel() {
  const [c, g] = canvas(256, 256), r = rng(21);
  g.fillStyle = '#5d6f66'; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, r, 1800, .14, .08);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${120 + r() * 50 | 0},${55 + r() * 30 | 0},30,${.12 + r() * .3})`; g.beginPath(); g.ellipse(r() * 256, r() * 256, 2 + r() * 14, 2 + r() * 9, r() * 3, 0, 7); g.fill(); }
  for (let y = 10; y < 256; y += 118) for (let x = 6; x < 256; x += 12) { g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(x + 1, y + 1, 2.4, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
  for (let x = 4; x < 256; x += 126) for (let y = 6; y < 256; y += 12) { g.fillStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
  return tex(c, 1, 1);
}
// open timber deck of the el seen from below: u across the structure, v along (one tie period)
export function ties() {
  const [c, g] = canvas(256, 32);
  g.clearRect(0, 0, 256, 32);
  const track = (a, b) => { g.fillStyle = '#3a2e25'; g.fillRect(a * 256, 0, (b - a) * 256, 14); g.fillStyle = '#2a211b'; g.fillRect(a * 256, 12, (b - a) * 256, 2); };
  track(.09, .44); track(.56, .91);
  g.fillStyle = '#4a3c30'; g.fillRect(0, 0, .09 * 256, 32); g.fillRect(.91 * 256, 0, .09 * 256, 32); g.fillRect(.475 * 256, 0, .05 * 256, 32);   // walkways
  const t = tex(c, 1, 1); t.magFilter = THREE.NearestFilter; return t;
}

const SIGNS = [['DELI · GROCERY', '#f2c230', '#b3202a'], ['LAUNDROMAT', '#1f5fae', '#fff'], ['BARBER SHOP', '#111', '#f3f3f3'], ['PHARMACY', '#fff', '#1b7a43'],
  ['PIZZA', '#b3202a', '#fff'], ['99¢ & UP', '#ffe94a', '#d3202a'], ['NAIL SALON', '#e7c9d8', '#6b1f4f'], ['HARDWARE', '#d8641c', '#fff'],
  ['BAKERY', '#f1e6d0', '#5a3a1e'], ['FISH MARKET', '#2a7fb8', '#fff'], ['CHINESE FOOD', '#c21f1f', '#ffe36b'], ['CELL PHONES', '#0f0f10', '#3fd0ff'],
  ['BEAUTY SUPPLY', '#7a2fa0', '#fff'], ['TAX SERVICE', '#15396b', '#fff'], ['FURNITURE', '#2c6b3a', '#fff'], ['COFFEE', '#2b211b', '#e9d7b8']];
export const SIGN_COUNT = SIGNS.length;
export function signAtlas() {                    // 2 columns x 8 rows of 512x64
  const [c, g] = canvas(1024, 512);
  SIGNS.forEach(([t, bg, fg], i) => {
    const x = (i % 2) * 512, y = (i >> 1) * 64;
    g.fillStyle = bg; g.fillRect(x, y, 512, 64); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, y + 56, 512, 8);
    g.fillStyle = fg; g.font = '800 40px "Helvetica Neue",Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, x + 256, y + 31, 470);
  });
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
export function streetSign(name) {
  const [c, g] = canvas(512, 96);
  g.fillStyle = '#0d6b3f'; g.fillRect(0, 0, 512, 96); g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(5, 5, 502, 86);
  g.fillStyle = '#fff'; g.font = '700 54px "Helvetica Neue",Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 256, 50, 470);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
export function glow() {
  const [c, g] = canvas(128, 128), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(.25, 'rgba(255,190,110,.5)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function trainSide(night) {
  const [c, g] = canvas(1024, 192), [e, ge] = canvas(1024, 192);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 1024, 192);
  const gr = g.createLinearGradient(0, 0, 0, 192); gr.addColorStop(0, '#c9cdd1'); gr.addColorStop(.5, '#aeb3b8'); gr.addColorStop(1, '#8f9499');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 192);
  for (let y = 96; y < 180; y += 6) { g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect(0, y, 1024, 1.5); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(0, y + 2, 1024, 1); }
  g.fillStyle = '#2b2d30'; g.fillRect(0, 180, 1024, 12);
  for (let d = 0; d < 4; d++) {
    const x = 70 + d * 256;
    g.fillStyle = '#9da2a7'; g.fillRect(x, 26, 76, 150); g.strokeStyle = '#555'; g.lineWidth = 2; g.strokeRect(x, 26, 76, 150); g.beginPath(); g.moveTo(x + 38, 26); g.lineTo(x + 38, 176); g.stroke();
    for (const dx of [8, 44]) { g.fillStyle = '#1c2530'; g.fillRect(x + dx, 40, 24, 56); ge.fillStyle = '#fff2d0'; ge.fillRect(x + dx, 40, 24, 56); }
    g.fillStyle = '#1c2530'; g.fillRect(x + 92, 40, 140, 52); ge.fillStyle = '#fff2d0'; ge.fillRect(x + 92, 40, 140, 52);
    g.fillStyle = '#9da2a7'; g.fillRect(x + 160, 40, 4, 52); ge.fillStyle = '#000'; ge.fillRect(x + 160, 40, 4, 52);
  }
  g.fillStyle = '#1c2530'; g.fillRect(8, 40, 46, 52); ge.fillStyle = '#fff2d0'; ge.fillRect(8, 40, 46, 52);
  const a = tex(c), b = tex(e); a.wrapS = b.wrapS = THREE.ClampToEdgeWrapping; return [a, b];
}
export function trainEnd() {
  const [c, g] = canvas(256, 256), [e, ge] = canvas(256, 256);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 256, 256);
  g.fillStyle = '#b3b8bc'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#17191c'; g.fillRect(14, 14, 228, 228);
  g.fillStyle = '#1c2530'; g.fillRect(34, 50, 76, 90); g.fillRect(146, 50, 76, 90);
  g.fillStyle = '#996633'; g.beginPath(); g.arc(128, 28, 16, 0, 7); g.fill();                    // brown route bullet
  g.fillStyle = '#fff'; g.font = '800 22px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('J', 128, 29);
  for (const x of [46, 210]) { for (const [cg, col] of [[g, '#fff6d8'], [ge, '#fff6d8']]) { cg.fillStyle = col; cg.beginPath(); cg.arc(x, 196, 11, 0, 7); cg.fill(); } ge.fillStyle = '#ff3b30'; ge.fillRect(x - 6, 222, 12, 6); }
  ge.fillStyle = '#ffe9c0'; ge.fillRect(34, 50, 76, 90); ge.fillRect(146, 50, 76, 90);
  return [tex(c), tex(e)];
}
export function foliage() {
  const [c, g] = canvas(128, 128), r = rng(88);
  g.fillStyle = '#7d8648'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { g.fillStyle = hsl(66 + r() * 22, 30 + r() * 12, 30 + r() * 16, .55); g.beginPath(); g.ellipse(r() * 128, r() * 128, 2 + r() * 4, 1.5 + r() * 2.5, r() * 3.14, 0, 7); g.fill(); }
  return tex(c, 3, 2);
}
