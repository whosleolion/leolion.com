// Graphics: phosphor palette, recoloured atlases, pixel primitives, text,
// and the CRT presenter that turns the 240x160 buffer into the screen.

export const W = 240, H = 160, T = 16;

// green phosphor, darkest to brightest
export const PAL = {
  bg: '#020b05',
  deep: '#06200f',
  dim: '#0f5a2a',
  mid: '#22a24c',
  hi: '#63ff95',
  hot: '#d8ffe4',
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export const buf = document.createElement('canvas');
buf.width = W; buf.height = H;
export const g = buf.getContext('2d');
g.imageSmoothingEnabled = false;

export const img = {};
export let atlas;

// Recolour a 1-bit atlas: black ink -> `ink`, white paper -> `paper`.
function recolor(src, ink, paper) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
  const I = rgb(ink), P = paper ? rgb(paper) : null;
  for (let i = 0; i < a.length; i += 4) {
    if (!a[i + 3]) continue;
    const isInk = a[i] < 128;
    const col = isInk ? I : P;
    if (!col) { a[i + 3] = 0; continue; }
    a[i] = col[0]; a[i + 1] = col[1]; a[i + 2] = col[2]; a[i + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  return c;
}

// 1px outline (in `col`) around opaque pixels, kept inside each 16x16 cell
function outline(src, col, cell) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), a = d.data, out = new Uint8ClampedArray(a);
  const C = rgb(col);
  const op = (px, py) => a[(py * c.width + px) * 4 + 3] > 0;
  for (let y = 0; y < c.height; y++) {
    for (let px = 0; px < c.width; px++) {
      if (op(px, y)) continue;
      const lx = px % cell, ly = y % cell;
      if ((lx > 0 && op(px - 1, y)) || (lx < cell - 1 && op(px + 1, y)) ||
          (ly > 0 && op(px, y - 1)) || (ly < cell - 1 && op(px, y + 1))) {
        out.set([...C, 255], (y * c.width + px) * 4);
      }
    }
  }
  x.putImageData(new ImageData(out, c.width, c.height), 0, 0);
  return c;
}

const loadImg = (src) => new Promise((ok, fail) => {
  const i = new Image();
  i.onload = () => ok(i);
  i.onerror = fail;
  i.src = src;
});

export async function loadAssets() {
  atlas = await (await fetch('assets/atlas.json')).json();
  const [tiles, sprites, font] = await Promise.all(['tiles', 'sprites', 'font'].map((n) => loadImg(`assets/${n}.png`)));
  // world
  img.tilesDim = recolor(tiles, PAL.dim, PAL.bg);
  img.tilesHi = recolor(tiles, PAL.hi, PAL.bg);
  img.sprites = recolor(sprites, PAL.hi, PAL.bg);
  img.spritesGlow = outline(img.sprites, PAL.deep, T);
  // memory (inverted, washed out)
  img.tilesDeep = recolor(tiles, PAL.deep, PAL.bg);
  img.tilesMem = recolor(tiles, PAL.dim, PAL.deep);
  img.tilesMemHi = recolor(tiles, PAL.hi, PAL.deep);
  img.spritesMem = recolor(sprites, PAL.hot, PAL.deep);
  // fonts
  for (const [k, col] of Object.entries(PAL)) img[`font_${k}`] = recolor(font, col, null);
  // dither patterns (Bayer 4x4), level 0..16, in any colour
  img.bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
}

const patternCache = {};
export function dither(level, col = PAL.bg) {
  const key = `${level}|${col}`;
  if (!patternCache[key]) {
    const p = document.createElement('canvas');
    p.width = p.height = 4;
    const pg = p.getContext('2d');
    pg.fillStyle = col;
    img.bayer.forEach((v, i) => { if (v < level) pg.fillRect(i % 4, (i / 4) | 0, 1, 1); });
    patternCache[key] = g.createPattern(p, 'repeat');
  }
  return patternCache[key];
}

// ------------------------------------------------------------ atlas drawing

export function tile(name, x, y, sheet = 'tilesDim') {
  const i = atlas.tiles[name];
  if (i === undefined) return;
  g.drawImage(img[sheet], (i % atlas.cols) * T, ((i / atlas.cols) | 0) * T, T, T, Math.round(x), Math.round(y), T, T);
}

export function sprite(name, x, y, scale = 1, sheet = 'sprites', flip = false, sh = 1) {
  const i = atlas.sprites[name];
  if (i === undefined) return;
  const sw = T * scale, shh = T * scale * sh;
  if (flip) {
    g.save();
    g.translate(Math.round(x) + sw, Math.round(y));
    g.scale(-1, 1);
    g.drawImage(img[sheet], (i % atlas.cols) * T, ((i / atlas.cols) | 0) * T, T, T, 0, Math.round(T * scale - shh), sw, shh);
    g.restore();
    return;
  }
  g.drawImage(img[sheet], (i % atlas.cols) * T, ((i / atlas.cols) | 0) * T, T, T,
    Math.round(x), Math.round(y + T * scale - shh), sw, Math.round(shh));
}

// ------------------------------------------------------------ text

export function text(str, x, y, col = 'hi', scale = 1) {
  const f = img[`font_${col}`] || img.font_hi;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i) - 32;
    if (c <= 0 || c > 94) continue;
    g.drawImage(f, (c % 16) * 8, ((c / 16) | 0) * 8, 8, 8, Math.round(x + i * 8 * scale), Math.round(y), 8 * scale, 8 * scale);
  }
}
export const center = (str, y, col = 'hi', scale = 1) => text(str, Math.round((W - str.length * 8 * scale) / 2), y, col, scale);

// "handwritten": per-glyph jitter that stays put (seeded by position)
export function scrawl(str, x, y, col = 'hi', seed = 1) {
  for (let i = 0; i < str.length; i++) {
    const r = Math.sin((i + 1) * 12.9898 * seed) * 43758.5453;
    const j = (r - Math.floor(r));
    text(str[i], x + i * 7 + Math.round(j * 2 - 1), y + Math.round(Math.sin(i * 1.7 + seed) * 1.5), col);
  }
}

export function wrap(s, cols) {
  const out = [];
  for (const para of String(s).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const next = line ? `${line} ${w}` : w;
      if (next.length > cols && line) { out.push(line); line = w; } else line = next;
    }
    out.push(line);
  }
  return out;
}

// ------------------------------------------------------------ primitives

export function rect(x, y, w, h, col) { g.fillStyle = PAL[col] || col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
export function frame(x, y, w, h, col) {
  rect(x, y, w, 1, col); rect(x, y + h - 1, w, 1, col);
  rect(x, y, 1, h, col); rect(x + w - 1, y, 1, h, col);
}
export function line(x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  g.fillStyle = PAL[col] || col;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
export function circle(cx, cy, r, col, fill = false) {
  g.fillStyle = PAL[col] || col;
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  let x = r, y = 0, e = 1 - r;
  while (x >= y) {
    if (fill) {
      g.fillRect(cx - x, cy + y, 2 * x + 1, 1); g.fillRect(cx - x, cy - y, 2 * x + 1, 1);
      g.fillRect(cx - y, cy + x, 2 * y + 1, 1); g.fillRect(cx - y, cy - x, 2 * y + 1, 1);
    } else {
      for (const [a, b] of [[x, y], [y, x], [-x, y], [-y, x], [x, -y], [y, -x], [-x, -y], [-y, -x]]) g.fillRect(cx + a, cy + b, 1, 1);
    }
    y++;
    if (e < 0) e += 2 * y + 1; else { x--; e += 2 * (y - x) + 1; }
  }
}
export function ditherRect(x, y, w, h, level, col) {
  g.fillStyle = dither(level, PAL[col] || col);
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
export function clear(col = 'bg') { rect(0, 0, W, H, col); }

// terminal-style window: double rule
export function panel(x, y, w, h, title) {
  rect(x, y, w, h, 'bg');
  frame(x, y, w, h, 'mid');
  frame(x + 2, y + 2, w - 4, h - 4, 'dim');
  if (title) {
    rect(x + 8, y - 1, title.length * 8 + 8, 3, 'bg');
    text(title, x + 12, y - 3, 'mid');
  }
}

// ------------------------------------------------------------ CRT presenter

export const crt = {
  enabled: true,
  motion: true,
  squash: 0,        // 0..1 power-off squash
  shake: 0,         // frames of screen shake
  flash: 0,         // frames of full-bright flash
};

let screen, sctx, bloom, bctx, scan, vign, prev, pctx, dispW = 0, dispH = 0, scale = 1;

export function initScreen(canvas) {
  screen = canvas;
  sctx = screen.getContext('2d');
  bloom = document.createElement('canvas');
  bloom.width = W / 4; bloom.height = H / 4;
  bctx = bloom.getContext('2d');
  prev = document.createElement('canvas');
  pctx = prev.getContext('2d');
}

export function fitScreen(stage) {
  const r = stage.getBoundingClientRect();
  const s = Math.min((r.width - 16) / W, (r.height - 16) / H);
  scale = s >= 2 ? Math.floor(s) : Math.max(0.5, s);
  const cssW = Math.round(W * scale), cssH = Math.round(H * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  screen.style.width = `${cssW}px`;
  screen.style.height = `${cssH}px`;
  dispW = Math.round(cssW * dpr); dispH = Math.round(cssH * dpr);
  screen.width = dispW; screen.height = dispH;
  prev.width = dispW; prev.height = dispH;
  // scanlines: darken the lower part of every game-pixel row
  scan = document.createElement('canvas');
  scan.width = 1; scan.height = dispH;
  const sc = scan.getContext('2d');
  const row = dispH / H;
  for (let y = 0; y < H; y++) {
    const y0 = Math.round(y * row + row * 0.62), y1 = Math.round((y + 1) * row);
    sc.fillStyle = 'rgba(0,0,0,0.42)';
    if (row >= 2) sc.fillRect(0, y0, 1, Math.max(1, y1 - y0));
  }
  vign = document.createElement('canvas');
  vign.width = dispW; vign.height = dispH;
  const vc = vign.getContext('2d');
  const grad = vc.createRadialGradient(dispW / 2, dispH / 2, dispH * 0.35, dispW / 2, dispH / 2, dispW * 0.72);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.62)');
  vc.fillStyle = grad;
  vc.fillRect(0, 0, dispW, dispH);
}

export function present(frameNo) {
  if (!sctx) return;
  sctx.imageSmoothingEnabled = false;
  let ox = 0, oy = 0;
  if (crt.shake > 0) {
    crt.shake--;
    if (crt.motion) { ox = (Math.random() * 4 - 2) * dispW / W; oy = (Math.random() * 4 - 2) * dispH / H; }
  }
  const full = !crt.enabled;
  // phosphor persistence: previous frame lingers a touch
  sctx.globalCompositeOperation = 'source-over';
  sctx.globalAlpha = 1;
  sctx.fillStyle = PAL.bg;
  sctx.fillRect(0, 0, dispW, dispH);
  const ghost = !full && crt.motion;
  if (ghost) sctx.drawImage(prev, 0, 0);
  const sq = crt.squash;
  const h = sq > 0 ? Math.max(2, dispH * (1 - sq) * (1 - sq)) : dispH;
  const w = sq > 0.85 ? dispW * (1 - (sq - 0.85) / 0.15) : dispW;
  const dx = (dispW - w) / 2 + ox, dy = (dispH - h) / 2 + oy;
  if (sq > 0) { sctx.fillStyle = PAL.bg; sctx.fillRect(0, 0, dispW, dispH); }
  sctx.globalAlpha = ghost ? 0.8 : 1;
  sctx.drawImage(buf, dx, dy, w, h);
  sctx.globalAlpha = 1;
  if (!full) {
    // bloom: tiny blurred copy added back on top
    bctx.imageSmoothingEnabled = true;
    bctx.clearRect(0, 0, bloom.width, bloom.height);
    bctx.drawImage(buf, 0, 0, bloom.width, bloom.height);
    sctx.imageSmoothingEnabled = true;
    sctx.globalCompositeOperation = 'lighter';
    sctx.globalAlpha = 0.55;
    sctx.drawImage(bloom, dx - 2, dy - 2, w + 4, h + 4);
    sctx.globalAlpha = 0.25;
    sctx.drawImage(bloom, dx - 10, dy - 10, w + 20, h + 20);
    sctx.globalCompositeOperation = 'source-over';
    sctx.globalAlpha = 1;
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(scan, 0, 0, dispW, dispH);
    sctx.drawImage(vign, 0, 0);
    if (crt.motion) {
      // slow rolling band + faint flicker
      const band = ((frameNo * 0.6) % (dispH + 120)) - 60;
      sctx.fillStyle = 'rgba(99,255,149,0.025)';
      sctx.fillRect(0, band, dispW, 50);
      if (Math.random() < 0.04) { sctx.fillStyle = 'rgba(0,0,0,0.06)'; sctx.fillRect(0, 0, dispW, dispH); }
    }
  }
  if (crt.flash > 0) {
    crt.flash--;
    sctx.globalCompositeOperation = 'lighter';
    sctx.fillStyle = `rgba(160,255,190,${Math.min(0.8, crt.flash / 8)})`;
    sctx.fillRect(0, 0, dispW, dispH);
    sctx.globalCompositeOperation = 'source-over';
  }
  if (sq > 0) {
    // the bright line a CRT leaves when it collapses
    sctx.fillStyle = PAL.hot;
    sctx.globalAlpha = Math.min(1, sq * 1.5);
    sctx.fillRect(dx, dispH / 2 - 1, w, 2);
    sctx.globalAlpha = 1;
  }
  pctx.clearRect(0, 0, dispW, dispH);
  pctx.drawImage(screen, 0, 0);
}
