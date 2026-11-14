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
  // hand-matched to photos of the Madison & Broadway corner
  m932:       { kind: 'brick', sp: 'm932', painted: true, c: [5, 64, 38], trim: '#ece9e2', cornice: [.3, .19, .14] },
  m936:       { kind: 'modern', base: 'brick', sp: 'm936', painted: true, c: [40, 5, 86], trim: '#141416', accent: '#141416' },
  m940:       { kind: 'brick', sp: 'm940', c: [13, 56, 43], trim: '#b56a4c', cornice: [.36, .2, .15] },
  cinder:     { kind: 'cinder', c: [30, 4, 56],  trim: '#666', cornice: [.4, .4, .4] },
};

function base(g, w, h, st, r, y0 = 0) {
  const [H, S, L] = st.c, kind = st.base || st.kind, pv = st.painted ? .3 : 1;
  if (kind === 'brick') {
    g.fillStyle = st.painted ? hsl(H, S, L - 8) : hsl(H + 12, S * .25, L + 18); g.fillRect(0, y0, w, h);
    for (let y = y0, row = 0; y < y0 + h; y += 8, row++)
      for (let x = -((row % 2) * 11); x < w; x += 22) {
        g.fillStyle = hsl(H + (r() - .5) * 8 * pv, S + (r() - .5) * 12 * pv, L + ((r() - .5) * 11 - (r() < .06 ? 9 : 0)) * pv);
        g.fillRect(x + 1, y + 1, 20.4, 6.4);
      }
  } else if (kind === 'stone') {
    g.fillStyle = hsl(H, S, L); g.fillRect(0, y0, w, h);
    for (let y = y0; y < y0 + h; y += 32) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, y, w, 1.5); g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, y + 2, w, 1); }
    for (let y = y0, row = 0; y < y0 + h; y += 32, row++) for (let x = (row % 2) * 48; x < w; x += 96) { g.fillStyle = 'rgba(0,0,0,.09)'; g.fillRect(x, y, 1.5, 32); }
  } else if (kind === 'siding') {
    g.fillStyle = hsl(H, S, L); g.fillRect(0, y0, w, h);
    for (let y = y0; y < y0 + h; y += 10) { g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, y + 8.5, w, 1.5); g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(0, y, w, 1.5); }
  } else if (kind === 'modern') {
    g.fillStyle = hsl(H, S, L); g.fillRect(0, y0, w, h);
    for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x, y0, 1.5, h); }
    for (let y = y0; y < y0 + h; y += 128) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, y, w, 1.5); }
  } else if (kind === 'cinder') {
    g.fillStyle = hsl(H, S, L); g.fillRect(0, y0, w, h);
    for (let y = y0, row = 0; y < y0 + h; y += 20, row++) for (let x = -((row % 2) * 20); x < w; x += 40) { g.strokeStyle = 'rgba(0,0,0,.18)'; g.strokeRect(x + .5, y + .5, 40, 20); }
  } else { g.fillStyle = hsl(H, S, L); g.fillRect(0, y0, w, h); }
  speckle(g, w, h + y0, r, kind === 'brick' ? 500 : 900);
}

function glass(g, x, y, w, h, r, night) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  const d = r() * 14;
  gr.addColorStop(0, hsl(212, 22, 30 + d)); gr.addColorStop(.55, hsl(210, 20, 19 + d * .5)); gr.addColorStop(1, hsl(215, 18, 12));
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.08)';                           // diagonal sky glint
  g.beginPath(); g.moveTo(x, y + h * .5); g.lineTo(x + w * .6, y); g.lineTo(x + w * .85, y); g.lineTo(x, y + h * .8); g.fill();
}

function specialWindow(g, cx, cy, st, r) {
  if (st.sp === 'm936') {                                        // black metal spandrel + wide glazing with a glass rail
    const x = cx + .2 * C, y = cy + 34, w = .6 * C, h = C - 34;
    g.fillStyle = '#141416'; g.fillRect(x - 10, cy, w + 20, C);
    glass(g, x, y + 6, w, h - 12, r);
    if (r() < .5) { g.fillStyle = 'rgba(232,226,210,.55)'; g.fillRect(x + 4, y + 8, w * .45, h - 16); }
    g.fillStyle = '#141416'; g.fillRect(x + w / 2 - 3, y, 6, h); g.fillRect(x, y + h * .28, w, 4);
    g.fillStyle = 'rgba(190,215,225,.28)'; g.fillRect(x, y + h * .6, w, h * .4 - 6); g.fillStyle = 'rgba(230,240,245,.8)'; g.fillRect(x, y + h * .6, w, 2.5);
    return;
  }
  const x = cx + WIN.x0 * C, y = cy + WIN.y0 * C, w = (WIN.x1 - WIN.x0) * C, h = (WIN.y1 - WIN.y0) * C;
  if (st.sp === 'm932') {                                        // painted brick, white stone trim, pierced-brick panels
    g.fillStyle = hsl(4, 48, 22); g.fillRect(cx, cy + 4, C, 7); g.fillRect(cx, cy + C - 9, C, 5);
    g.fillStyle = st.trim; g.fillRect(x - 10, y - 22, w + 20, h + 34);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x - 10, y + h + 12, w + 20, 3);
    g.fillStyle = hsl(5, 60, 31); g.fillRect(x - 6, y + h + 18, w + 12, 26);
    g.fillStyle = hsl(4, 55, 17); for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) g.fillRect(x - 1 + i * (w + 2) / 9 + (j % 2) * 5, y + h + 21 + j * 8, 6, 4);
    glass(g, x, y, w, h, r);
    g.strokeStyle = '#f4f2ec'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, w - 6, h - 6); g.fillStyle = '#f4f2ec'; g.fillRect(x, y + h * .48, w, 6);
  } else {                                                        // m940: plain punched openings, dark sashes
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x - 5, y - 5, w + 10, h + 8);
    glass(g, x, y, w, h, r);
    g.strokeStyle = '#2a2624'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, w - 6, h - 6); g.fillStyle = '#2a2624'; g.fillRect(x, y + h * .48, w, 6);
    g.fillStyle = hsl(14, 40, 52); g.fillRect(x - 8, y + h + 3, w + 16, 7);
    if (r() < .5) { g.fillStyle = hsl(12, 50, 33); for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) g.fillRect(cx + 14 + i * 9 + (j % 2) * 4, y + 20 + j * 9, 5, 5); }
  }
  const v = r();
  if (v < .35) { g.fillStyle = 'rgba(238,234,222,.85)'; g.fillRect(x + 6, y + 6, w - 12, h * (.2 + r() * .25)); }
  else if (v < .55) { g.fillStyle = hsl(200 + r() * 40, 30, 60, .6); g.fillRect(x + 6, y + 6, w - 12, h - 12); }
  if (r() < .3) { g.fillStyle = '#c9c7be'; g.fillRect(x + 12, y + h - 38, w - 24, 34); g.fillStyle = 'rgba(0,0,0,.3)'; for (let s = 0; s < 26; s += 5) g.fillRect(x + 16, y + h - 34 + s, w - 32, 2); }
}

function windowCell(g, cx, cy, st, r, wide) {
  if (st.sp) return specialWindow(g, cx, cy, st, r);
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
  if (st.kind === 'modern' && !st.sp) { gu.fillStyle = st.accent; gu.fillRect(0, 0, 40, C * 2); }
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

// ---- hand-painted ground floors for the buildings in the reference photos (canvas spans the whole wall) ----
function board(L) {
  const w = Math.min(2048, Math.round(L * 110)), h = 420, [c, g] = canvas(w, h), sx = w / L, sy = h / 3.9;
  const R = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x * sx, y * sy, ww * sx, hh * sy); };
  const T = (s, x, y, size, col, font = '800', align = 'center') => { g.fillStyle = col; g.font = `${font} ${size * sy}px "Helvetica Neue",Arial,sans-serif`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x * sx, y * sy); };
  const courses = (x, y, ww, hh, a = .1) => { g.fillStyle = `rgba(0,0,0,${a})`; for (let q = y; q < y + hh; q += .075) g.fillRect(x * sx, q * sy, ww * sx, 1); };
  const slats = (x, y, ww, hh) => { for (let q = y; q < y + hh; q += .07) { g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(x * sx, (q + .05) * sy, ww * sx, 2); g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x * sx, q * sy, ww * sx, 1.5); } };
  const shop = (x, y, ww, hh, r, warm = .22) => { glass(g, x * sx, y * sy, ww * sx, hh * sy, r); g.fillStyle = `rgba(255,214,150,${warm})`; g.fillRect(x * sx, y * sy, ww * sx, hh * sy); };
  const done = () => { const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
  return { c, g, sx, sy, R, T, courses, slats, shop, done };
}
function flower(g, x, y, s) {
  for (let i = 0; i < 5; i++) { const a = i * 1.257 - .3; g.fillStyle = i % 2 ? '#f6a3b8' : '#ee5d86'; g.beginPath(); g.ellipse(x + Math.cos(a) * s * .55, y + Math.sin(a) * s * .55, s * .5, s * .36, a, 0, 7); g.fill(); }
  g.fillStyle = '#f4c531'; g.beginPath(); g.arc(x, y, s * .26, 0, 7); g.fill(); g.strokeStyle = '#1a1a1a'; g.lineWidth = Math.max(1.5, s * .05); g.stroke();
}
function luckyCat(g, x, y, s) {                  // beckoning cat, after the gate mural at no. 934
  const ink = '#161616'; g.lineJoin = 'round'; g.strokeStyle = ink; g.lineWidth = s * .05;
  const blob = (px, py, rx, ry, col, rot = 0) => { g.fillStyle = col; g.beginPath(); g.ellipse(x + px * s, y + py * s, rx * s, ry * s, rot, 0, 7); g.fill(); g.stroke(); };
  blob(0, .75, .62, .6, '#f7f5ef'); blob(-.2, .95, .28, .22, '#d98a2b', .3);                 // body + patch
  blob(.52, .1, .17, .42, '#f7f5ef', -.25); blob(.6, -.28, .17, .15, '#f7f5ef');              // raised arm, paw
  for (const e of [-1, 1]) { g.fillStyle = '#f7f5ef'; g.beginPath(); g.moveTo(x + e * .5 * s, y - .32 * s); g.lineTo(x + e * .46 * s, y - .86 * s); g.lineTo(x + e * .12 * s, y - .52 * s); g.fill(); g.stroke();
    g.fillStyle = '#e8463e'; g.beginPath(); g.moveTo(x + e * .43 * s, y - .42 * s); g.lineTo(x + e * .42 * s, y - .72 * s); g.lineTo(x + e * .22 * s, y - .5 * s); g.fill(); }
  blob(0, 0, .58, .5, '#f7f5ef'); blob(.3, -.3, .2, .14, '#d98a2b', .5); blob(-.34, -.24, .15, .12, '#8a4b25', -.5);
  g.lineWidth = s * .045; for (const e of [-1, 1]) { g.beginPath(); g.arc(x + e * .24 * s, y - .02 * s, .12 * s, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    for (const k of [-.08, .06]) { g.beginPath(); g.moveTo(x + e * .34 * s, y + (.16 + k) * s); g.lineTo(x + e * .72 * s, y + (.14 + k * 2.2) * s); g.stroke(); } }
  g.fillStyle = '#e8463e'; g.beginPath(); g.ellipse(x, y + .22 * s, .08 * s, .12 * s, 0, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#e8463e'; g.fillRect(x - .42 * s, y + .42 * s, .84 * s, .09 * s); g.fillStyle = '#f0b730'; g.beginPath(); g.arc(x, y + .56 * s, .13 * s, 0, 7); g.fill(); g.stroke();
}
export const GROUND = {
  '932 Madison Street': L => {
    const b = board(L), { g, sx, sy, R, T } = b, r = rng(932), m = L / 2;
    // east half: no. 934, white-painted brick, blue awning zone, muralled roll gates
    R(0, 0, m, 3.9, '#e6e3dc'); b.courses(0, 0, m, 3.9, .07); R(0, .28, m - .2, 1.15, '#2343cf');
    R(.25, 1.5, .8, 2.4, '#1c2f86'); R(.33, 1.6, .64, 1.1, '#101a44'); T('934', .65, 2.95, .2, '#e8e8e8');
    for (const [x0, ww] of [[1.25, 1.75], [3.15, m - 3.55]]) { R(x0 - .06, 1.45, ww + .12, 2.45, '#1a2f8f'); R(x0, 1.5, ww, 2.4, '#2b62cf'); }
    g.save(); g.beginPath(); g.rect(3.15 * sx, 1.5 * sy, (m - 3.55) * sx, 2.4 * sy); g.clip();
    g.fillStyle = '#5ec2e6'; g.beginPath(); g.ellipse(4.5 * sx, 3.2 * sy, 1.3 * sx, .5 * sy, -.3, 0, 7); g.fill();
    for (const [fx, fy, fs] of [[3.6, 1.9, .34], [4.5, 1.8, .4], [5.4, 2.0, .36], [3.5, 2.9, .3], [5.5, 3.3, .32], [4.1, 2.5, .26]]) flower(g, fx * sx, fy * sy, fs * sy);
    luckyCat(g, 4.75 * sx, 3.45 * sy, .52 * sy); g.restore();
    g.save(); g.beginPath(); g.rect(1.25 * sx, 1.5 * sy, 1.75 * sx, 2.4 * sy); g.clip();
    flower(g, 1.5 * sx, 1.75 * sy, .3 * sy); flower(g, 2.8 * sx, 1.8 * sy, .26 * sy); flower(g, 2.75 * sx, 3.6 * sy, .3 * sy); flower(g, 1.45 * sx, 3.65 * sy, .24 * sy);
    luckyCat(g, 2.1 * sx, 2.5 * sy, .62 * sy); g.restore();
    b.slats(1.25, 1.5, 1.75, 2.4); b.slats(3.15, 1.5, m - 3.55, 2.4);
    // middle: the door to 932, recessed in navy-painted brick, up a short stoop
    R(m - .2, 0, 1.6, 3.9, '#1b2a70'); b.courses(m - .2, 0, 1.6, 3.9, .22);
    R(m + .12, .75, 1.0, 2.6, '#1d1411'); R(m + .2, .85, .84, 2.5, '#2b1d17');
    R(m + .3, 1.0, .5, 1.35, '#cdbf9f'); b.shop(m + .35, 1.05, .4, 1.25, r, .05); T('932', m + .55, 1.42, .17, '#f0c419');
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; for (const yy of [2.5, 2.72, 2.94]) g.strokeRect((m + .3) * sx, yy * sy, .5 * sx, .16 * sy);
    R(m + .86, .9, .18, 2.4, '#20150f'); R(m + .12, 3.35, 1.0, .55, '#3a3a3c'); R(m + .32, .55, .3, .16, '#d9d6cf');
    // west half: the navy shopfront with its rust-red sign band
    const x0 = m + 1.4, ww = L - x0; R(x0, 0, ww, 3.9, '#1c2a6e'); b.courses(x0, 0, ww, .4, .25);
    for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(${170 + r() * 50 | 0},${80 + r() * 40 | 0},40,${.3 + r() * .5})`; g.beginPath(); g.ellipse((x0 + r() * .32) * sx, (.4 + r() * 3.5) * sy, (.01 + r() * .05) * sx, (.02 + r() * .08) * sy, r() * 3, 0, 7); g.fill(); }
    R(x0 + .35, .35, ww - .35, .62, '#6f3028'); for (let k = 0; k < 40; k++) R(x0 + .35 + r() * (ww - .5), .35 + r() * .55, .05 + r() * .2, .02 + r() * .05, `rgba(40,30,60,${r() * .35})`);
    T('and company', x0 + .6, .68, .19, '#d8cfc4', '500', 'left');
    R(x0 + .35, .97, ww - .35, .45, '#17225c');
    const gx = x0 + .5, gw2 = ww - 2.2; glass(g, gx * sx, 1.45 * sy, gw2 * sx, 2.1 * sy, r);
    { const gr = g.createLinearGradient(0, 1.45 * sy, 0, 3.55 * sy); gr.addColorStop(0, 'rgba(120,80,45,.55)'); gr.addColorStop(1, 'rgba(70,45,28,.6)'); g.fillStyle = gr; g.fillRect(gx * sx, 1.45 * sy, gw2 * sx, 2.1 * sy); }
    R(gx + .3, 2.75, gw2 - .6, .12, 'rgba(40,26,16,.8)'); R(gx, 3.55, gw2, .35, '#141c48');
    for (const dx of [0, .82]) { const xx = L - 1.75 + dx; b.shop(xx, 1.45, .78, 2.45, r, .28); g.strokeStyle = '#e6e6e2'; g.lineWidth = 5; g.strokeRect(xx * sx, 1.45 * sy, .78 * sx, 2.45 * sy); R(xx + (dx ? .08 : .6), 2.55, .1, .3, '#e6e6e2'); }
    g.strokeStyle = '#e6e6e2'; g.lineWidth = 4; g.strokeRect(gx * sx, 1.45 * sy, gw2 * sx, 2.1 * sy);
    R(0, 0, m - .2, .26, '#efede8'); R(0, .24, m - .2, .04, 'rgba(0,0,0,.25)');
    return b.done();
  },
  '936 Madison Street': L => {
    const b = board(L), { g, sx, sy, R, T } = b, r = rng(936);
    R(0, 0, L, 3.9, '#121214'); R(0, .3, L, .08, '#26262a');
    b.shop(.5, 1.25, 1.5, 2.2, r, .1); R(.6, 1.35, 1.3, 2.0, 'rgba(214,190,90,.5)'); R(.5, 3.45, 1.5, .45, '#0c0c0e');
    R(L * .42, .72, 2.5, .42, '#f4f2ee'); T('MEI HUI SPA', L * .42 + 1.25, .94, .3, '#c8201e');
    b.shop(L * .42 + .1, 1.4, 1.0, 2.5, r, .15); b.shop(L * .42 + 1.25, 1.4, 1.0, 2.5, r, .15);
    T('OPEN', L * .42 + .6, 2.0, .16, '#ff4fd0'); g.strokeStyle = '#3ad0ff'; g.lineWidth = 2; g.strokeRect((L * .42 + .3) * sx, 1.86 * sy, .6 * sx, .28 * sy);
    R(L - 2.3, 1.2, 1.1, 2.7, '#1b1b1f'); R(L - 2.2, 1.3, .9, 1.6, '#0a0a0c'); T('936', L - 1.75, 1.0, .18, '#d8d8d8');
    for (const x of [L * .42 - .25, L - 2.55, L - 1.0]) { g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(x * sx, 1.15 * sy, .07 * sy, 0, 7); g.fill(); }
    return b.done();
  },
  '940 Madison Street': (L, street) => {                          // Prince Broadway Deli wraps the corner
    const b = board(L), { g, sx, sy, R, T } = b, r = rng(940 + L * 10 | 0), side = street === 'Madison St', gw = side ? L - 1.5 : L;
    R(0, 0, L, 3.9, '#c7a57a');
    g.fillStyle = 'rgba(90,60,30,.3)'; for (let x = 0; x < L; x += .1) g.fillRect(x * sx, 0, 1, 3.9 * sy); for (let y = 0; y < 3.9; y += .2) g.fillRect(0, y * sy, L * sx, 1);
    R(0, 0, L, .62, '#141416'); R(0, .62, L, .5, '#0b0b0c'); R(0, 1.12, L, .05, '#2a2a2c');
    const name = L > 6 ? 'PRINCE BROADWAY DELI' : L > 3.6 ? 'PRINCE BROADWAY' : 'DELI';
    T(name, gw * (L > 6 ? .4 : .5), .88, .25, '#f2f2f2', '800'); if (L > 6) T('1432 Broadway', gw * .86, .88, .22, '#f2f2f2', 'italic 500');
    const win = (x, ww) => { b.shop(x, 1.3, ww, 1.75, r, .34); for (let k = 0; k < ww * 14; k++) { g.fillStyle = hsl(r() * 360, 55, 45 + r() * 30, .85); g.fillRect((x + .08 + r() * (ww - .3)) * sx, (1.5 + (r() * 6 | 0) * .25) * sy, (.08 + r() * .12) * sx, .17 * sy); }
      g.fillStyle = 'rgba(245,245,240,.9)'; for (let q = 1.47; q < 3; q += .25) g.fillRect(x * sx, (q + .19) * sy, ww * sx, 2); g.strokeStyle = '#d8d8d4'; g.lineWidth = 4; g.strokeRect(x * sx, 1.3 * sy, ww * sx, 1.75 * sy); };
    const door = gw > 4.5 ? gw * .36 : -1;
    if (door > 0) { win(.3, door - .45); b.shop(door, 1.3, .85, 2.6, r, .4); g.strokeStyle = '#e4e4e0'; g.lineWidth = 5; g.strokeRect(door * sx, 1.3 * sy, .85 * sx, 2.6 * sy); win(door + 1.0, gw - door - 1.3); R(door + 1.6, 2.2, Math.min(1.6, gw - door - 2.1), .8, '#c9402b'); for (let k = 0; k < 6; k++) { g.fillStyle = '#e9b55a'; g.beginPath(); g.arc((door + 1.8 + (k % 3) * .5) * sx, (2.42 + (k / 3 | 0) * .36) * sy, .13 * sy, 0, 7); g.fill(); } }
    else win(.3, gw - .6);
    if (side) { R(gw, 0, 1.5, 3.9, '#8d8f93'); R(gw + .3, 1.5, .95, 2.4, '#6f747b'); g.strokeStyle = 'rgba(20,20,20,.7)'; g.lineWidth = 3; g.beginPath(); let px = gw + .4, py = 2.9; g.moveTo(px * sx, py * sy); for (let k = 0; k < 7; k++) { px += .11; py = 2.6 + r() * .7; g.lineTo(px * sx, py * sy); } g.stroke(); }
    return b.done();
  },
};
export function awning(text) {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = '#2140d6'; g.fillRect(0, 0, 1024, 256); g.fillStyle = '#1a33b0'; g.fillRect(0, 196, 1024, 60);
  g.font = 'italic 900 118px "Arial Black","Helvetica Neue",Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#e9efff'; g.strokeText(text, 512, 104, 900); g.fillStyle = '#5b86ea'; g.fillText(text, 512, 104, 900);
  g.fillStyle = '#e9efff'; g.font = '700 30px Arial'; g.fillText('NYC', 512, 28); g.fillText('INC.', 600, 176);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
