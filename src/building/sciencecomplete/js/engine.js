// Science Complete engine: state, input, world, dialogue, close-ups,
// memories, battle, menus, title, ending, and the main loop.

import * as audio from './audio.js';
import {
  W, H, T, PAL, buf, g, img, loadAssets, tile, sprite, text, center, wrap, rect, frame, line,
  circle, ditherRect, clear, panel, crt, initScreen, fitScreen, present,
} from './gfx.js';
import * as GFX from './gfx.js';
import { makeContent } from './content.js';
import { CLOSEUPS } from './closeups.js';

// ============================================================ state

const fresh = () => ({
  map: 'labA', x: 6, y: 4, dir: 'up',
  items: [], protons: 0, flags: {}, buttons: 0, ad: 0, time: 0,
  memory: null, back: null,
});
const S = fresh();
function resetState(from) {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, fresh(), from || {});
}
const has = (id) => S.items.includes(id);
const flag = (f) => !!S.flags[f];
const pick = (a) => a[(Math.random() * a.length) | 0];
const ease = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));

const SETTINGS_KEY = 'sciencecomplete.settings';
const settings = { text: 1, crt: true, motion: true, sound: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch (e) { /* defaults */ }
function applySettings() {
  crt.enabled = settings.crt;
  crt.motion = settings.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  audio.setMuted(!settings.sound);
  const b = document.getElementById('mute');
  if (b) b.textContent = settings.sound ? 'SOUND ON' : 'SOUND OFF';
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

let frameNo = 0;
let scene = 'boot';          // boot | title | play | battle | ending
let ui = null;               // modal ui: say | choose | inv | banner | pause | menu
const closeups = [];         // POV stack drawn instead of the world
let busy = false;
let fade = 0;                // 0..16 dither to black
const post = { ripple: 0, wash: 0 };
let trans = null;            // zoom transition snapshot
let roomTitle = null, savedAt = -999, caption = null;

// ============================================================ timing helpers

let waiters = [];
const wait = (frames) => new Promise((r) => waiters.push([frameNo + Math.max(1, frames | 0), r]));
async function tween(fn, a, b, frames) {
  for (let i = 1; i <= frames; i++) { fn(a + (b - a) * ease(i / frames)); await wait(1); }
}
async function fadeTo(level, speed = 2) {
  while (fade !== level) { fade += Math.sign(level - fade) * Math.min(speed, Math.abs(level - fade)); await wait(1); }
}
async function run(fn) {
  if (busy) return;
  busy = true;
  try { await fn(); } catch (e) { console.error(e); } finally { busy = false; }
}

// ============================================================ input

const held = { up: 0, down: 0, left: 0, right: 0, a: 0, b: 0, run: 0, start: 0 };
const hit = {};
const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'a', Enter: 'a', Space: 'a', KeyX: 'b', Backspace: 'b',
  ShiftLeft: 'run', ShiftRight: 'run', Escape: 'start', KeyP: 'start',
};
function press(k) { hit[k] = true; audio.unlock(); }
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') { settings.sound = !settings.sound; applySettings(); return; }
  const k = KEYS[e.code];
  if (!k) return;
  e.preventDefault();
  if (!held[k]) press(k);
  held[k] = 1;
});
addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) held[k] = 0; });
addEventListener('blur', () => Object.keys(held).forEach((k) => (held[k] = 0)));
addEventListener('pointerdown', () => audio.unlock(), { passive: true });
document.getElementById('mute')?.addEventListener('click', () => { settings.sound = !settings.sound; applySettings(); });

const pad = document.getElementById('dpad');
if (pad) {
  const setDir = (e) => {
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const before = ['up', 'down', 'left', 'right'].find((d) => held[d]);
    held.up = held.down = held.left = held.right = 0;
    if (Math.hypot(dx, dy) < r.width * 0.12) return;
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    held[d] = 1;
    if (d !== before) press(d);
  };
  const clearDirs = () => { held.up = held.down = held.left = held.right = 0; };
  pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); setDir(e); e.preventDefault(); });
  pad.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') setDir(e); });
  pad.addEventListener('pointerup', clearDirs);
  pad.addEventListener('pointercancel', clearDirs);
}
for (const [id, k] of [['btn-a', 'a'], ['btn-b', 'b'], ['btn-start', 'start']]) {
  const el = document.getElementById(id);
  if (!el) continue;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); press(k); held[k] = 1; });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => (held[k] = 0));
}
const coarse = matchMedia('(pointer: coarse)').matches;
const KEY_A = coarse ? 'A' : 'Z', KEY_B = coarse ? 'B' : 'X';

// ============================================================ content

const E = {
  S, has, flag, pick, wait,
  sfx: (n) => audio.sfx(n),
  say, choose, give, take, gainProtons, warp, closeup, remember, forget, battle,
};
const C = makeContent(E);

// ============================================================ dialogue

const COLS = 26, LINES = 3;
const VOICES = {
  CONSOLE: 'console', CAPTCHA: 'console', CHRIS: 'chris', PROTON: 'proton', 'PROF. HATCH': 'hatch',
  DIANE: 'diane', 'POP-UP': 'ad', ADVERTISEMENT: 'ad',
};
function parse(str) {
  const m = /^([A-Z][A-Z .'-]{1,16}): (.*)$/.exec(str);
  if (m && VOICES[m[1]]) return { who: m[1], voice: VOICES[m[1]], body: m[2] };
  return { who: null, voice: 'narrator', body: str };
}
function paginate(pages) {
  const out = [];
  for (const p of pages) {
    const { who, voice, body } = parse(p);
    const lines = wrap(body, COLS);
    for (let i = 0; i < lines.length; i += LINES) out.push({ who, voice, lines: lines.slice(i, i + LINES) });
  }
  return out;
}
function say(pages) {
  if (typeof pages === 'string') pages = [pages];
  return new Promise((resolve) => { ui = { kind: 'say', pages: paginate(pages), page: 0, shown: 0, resolve }; });
}
function choose(opts, prompt, required = false) {
  return new Promise((resolve) => {
    ui = { kind: 'choose', opts, idx: 0, prompt: prompt ? paginate([prompt]).pop() : null, required, resolve, t0: frameNo };
  });
}

const SPEED = [0.5, 1, 2.5];
function updateSay(u) {
  const p = u.pages[u.page];
  const total = p.lines.join('').length;
  if (u.shown < total) {
    const before = Math.floor(u.shown);
    u.shown = Math.min(total, u.shown + SPEED[settings.text] * (held.a ? 3 : 1));
    if (Math.floor(u.shown / 2) !== Math.floor(before / 2)) audio.voice(p.voice);
    if (hit.a && frameNo - (u.t0 || 0) > 2) u.shown = total;
  } else if (hit.a || hit.b) {
    audio.sfx('confirm');
    if (++u.page >= u.pages.length) { ui = null; u.resolve(); } else u.shown = 0;
  }
}

function drawTextBox(page, shown = Infinity) {
  const x = 4, y = H - 47, w = W - 8, h = 45;
  panel(x, y, w, h, page.who || null);
  let left = shown;
  page.lines.forEach((ln, i) => {
    const vis = ln.slice(0, Math.max(0, Math.floor(left)));
    text(vis, x + 9, y + 8 + i * 12, 'hi');
    left -= ln.length;
  });
  const total = page.lines.join('').length;
  if (shown >= total) {
    // block cursor at the end of the text
    const last = page.lines.length - 1;
    if ((frameNo >> 4) % 2) rect(x + 9 + page.lines[last].length * 8 + 2, y + 8 + last * 12, 6, 8, 'hi');
  }
}

function drawChoice(u) {
  if (u.prompt) drawTextBox(u.prompt);
  const w = Math.max(...u.opts.map((o) => o.length)) * 8 + 28;
  const vis = Math.min(u.opts.length, 6);
  const top = Math.max(0, Math.min(u.idx - 2, u.opts.length - vis));
  const h = vis * 12 + 12;
  const x = W - w - 4, y = (u.prompt ? H - 49 : H - 4) - h;
  panel(x, y, w, h);
  for (let i = 0; i < vis; i++) {
    const o = u.opts[top + i], sel = top + i === u.idx, yy = y + 7 + i * 12;
    if (sel) { rect(x + 4, yy - 2, w - 8, 11, 'hi'); text(`>${o}`, x + 6, yy, 'bg'); } else text(` ${o}`, x + 6, yy, 'mid');
  }
}
function updateChoice(u) {
  if (hit.up) { u.idx = (u.idx + u.opts.length - 1) % u.opts.length; audio.sfx('select'); }
  if (hit.down) { u.idx = (u.idx + 1) % u.opts.length; audio.sfx('select'); }
  if (hit.a && frameNo - u.t0 > 2) { audio.sfx('confirm'); ui = null; u.resolve(u.idx); } else if (hit.b && !u.required) { audio.sfx('cancel'); ui = null; u.resolve(-1); }
}

// ============================================================ items

function banner(icon, title, name) {
  return new Promise((resolve) => { ui = { kind: 'banner', icon, title, name, t0: frameNo, resolve }; });
}
async function give(id) {
  if (!has(id)) S.items.push(id);
  audio.sfx('item');
  await banner(`i_${id}`, 'ITEM ACQUIRED', C.ITEMS[id][0]);
  save();
}
function take(id) { S.items = S.items.filter((i) => i !== id); }
async function gainProtons(n) {
  S.protons += n;
  audio.sfx('item');
  await banner('proton0', `+${n} PROTONS`, `YOU HAVE ${S.protons}P`);
}
function drawBanner(u) {
  const t = frameNo - u.t0;
  const w = 150, h = 84, x = (W - w) / 2, y = 24;
  panel(x, y, w, h, u.title);
  const s = t < 8 ? 1 + (t / 8) * 2 : 3 + Math.sin(t / 10) * 0.1;
  const sc = Math.round(s);
  for (let i = 0; i < 12 && t < 30; i++) {
    const a = (i / 12) * Math.PI * 2, r = 10 + t * 1.6;
    rect(W / 2 + Math.cos(a) * r, y + 38 + Math.sin(a) * r, 2, 2, 'hot');
  }
  sprite(u.icon, W / 2 - 8 * sc, y + 38 - 8 * sc, sc);
  const nm = wrap(u.name, 17);
  nm.forEach((l, i) => center(l, y + 64 + i * 10 - (nm.length - 1) * 5, 'hi'));
  if (t > 20 && (frameNo >> 4) % 2) text(KEY_A, x + w - 16, y + h - 12, 'mid');
}

// inventory: 7x2 grid of icons + detail pane
function inventory() {
  return new Promise((resolve) => { ui = { kind: 'inv', idx: 0, resolve }; });
}
function updateInv(u) {
  const n = S.items.length;
  const mv = (d) => { if (n) { u.idx = (u.idx + d + n) % n; audio.sfx('select'); } };
  if (hit.left) mv(-1);
  if (hit.right) mv(1);
  if (hit.up) mv(-7);
  if (hit.down) mv(7);
  if (hit.b || hit.start) { audio.sfx('cancel'); ui = null; u.resolve(-1); } else if (hit.a && n) { audio.sfx('confirm'); ui = null; u.resolve(u.idx); }
}
function drawInv(u) {
  clear();
  panel(2, 4, W - 4, H - 6, 'ITEMS');
  text(`PROTONS ${S.protons}P`, 12, 12, 'mid');
  text(`${S.items.length}/14`, W - 52, 12, 'dim');
  for (let i = 0; i < 14; i++) {
    const x = 16 + (i % 7) * 30, y = 26 + ((i / 7) | 0) * 26;
    frame(x, y, 22, 22, i === u.idx && S.items.length ? 'hot' : 'deep');
    const id = S.items[i];
    if (id) sprite(`i_${id}`, x + 3, y + 3);
  }
  const id = S.items[u.idx];
  rect(8, 80, W - 16, 1, 'dim');
  if (!id) { center('NOTHING YET.', 100, 'dim'); return; }
  const [name, desc] = C.ITEMS[id];
  sprite(`i_${id}`, 12, 88, 2);
  text(name, 50, 90, 'hi');
  const d = typeof desc === 'function' ? desc().join(' ') : desc;
  wrap(d, 22).slice(0, 5).forEach((l, i) => text(l, 50, 104 + i * 10, 'mid'));
  text(`${KEY_A}:READ  ${KEY_B}:BACK`, 12, H - 16, 'dim');
}
async function openInventory() {
  for (;;) {
    const i = await inventory();
    if (i < 0) return;
    const d = C.ITEMS[S.items[i]][1];
    await say(typeof d === 'function' ? d() : [d]);
  }
}

// pause menu
let pauseIdx = 0;
async function pauseMenu() {
  audio.sfx('select');
  pauseIdx = 0;
  for (;;) {
    const opts = [
      'RESUME', 'ITEMS',
      `TEXT SPEED  ${['SLOW', 'NORMAL', 'FAST'][settings.text]}`,
      `CRT EFFECTS ${settings.crt ? 'ON' : 'OFF'}`,
      `MOTION      ${settings.motion ? 'ON' : 'OFF'}`,
      `SOUND       ${settings.sound ? 'ON' : 'OFF'}`,
      'QUIT TO TITLE',
    ];
    const i = await new Promise((resolve) => { ui = { kind: 'pause', opts, idx: pauseIdx, resolve, t0: frameNo }; });
    if (i >= 0) pauseIdx = i;
    if (i < 0 || i === 0) return;
    if (i === 1) { await openInventory(); continue; }
    if (i === 2) settings.text = (settings.text + 1) % 3;
    if (i === 3) settings.crt = !settings.crt;
    if (i === 4) settings.motion = !settings.motion;
    if (i === 5) settings.sound = !settings.sound;
    applySettings();
    if (i === 6) { await fadeTo(16); scene = 'title'; closeups.length = 0; audio.music('title'); titleT = frameNo; await fadeTo(0); return; }
  }
}
function drawPause(u) {
  ditherRect(0, 0, W, H, 12, 'bg');
  panel(20, 6, 200, 148, 'PAUSED');
  const obj = C.objective();
  text('OBJECTIVE', 30, 16, 'dim');
  wrap(obj.join(' '), 22).slice(0, 4).forEach((l, i) => text(l, 30, 28 + i * 10, 'hi'));
  const mins = Math.floor(S.time / 60), secs = Math.floor(S.time % 60);
  const tm = `${mins}:${String(secs).padStart(2, '0')}`;
  text(tm, 210 - tm.length * 8, 16, 'dim');
  u.opts.forEach((o, i) => {
    const y = 78 + i * 10;
    if (i === u.idx) { rect(28, y - 1, 184, 9, 'hi'); text(`>${o}`, 30, y, 'bg'); } else text(` ${o}`, 30, y, 'mid');
  });
}
function updatePause(u) {
  if (hit.up) { u.idx = (u.idx + u.opts.length - 1) % u.opts.length; audio.sfx('select'); }
  if (hit.down) { u.idx = (u.idx + 1) % u.opts.length; audio.sfx('select'); }
  if (hit.a) { audio.sfx('confirm'); ui = null; u.resolve(u.idx); } else if ((hit.b || hit.start) && frameNo - u.t0 > 2) { audio.sfx('cancel'); ui = null; u.resolve(-1); }
}

// ============================================================ world

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const player = { x: 6, y: 4, px: 96, py: 64, tx: 6, ty: 4, dir: 'up', moving: false, stepCount: 0 };
const NPCS = C.NPCS.map((n) => Object.assign({
  px: n.x * T, py: n.y * T, tx: n.x, ty: n.y, dir: 'down', moving: false, home: [n.x, n.y], timer: 60 + Math.random() * 120,
}, n));
const cam = { x: 0, y: 0 };
const view = { ox: 0, oy: 0 };

const map = () => C.MAPS[S.map];
const charAt = (m, x, y) => (C.MAPS[m].rows[y] || '')[x] ?? ' ';
const npcsHere = () => NPCS.filter((n) => n.map === S.map && !(n.gone && n.gone()));
const thingAt = (x, y) => C.THINGS.find((t) => t.map === S.map && t.x === x && t.y === y && !flag(`took_${t.item}`));

function solidAt(x, y, self) {
  const c = charAt(S.map, x, y);
  if (c === 'L' && flag('exit')) return false;
  if (C.TILEDEF[c]?.[1] ?? 1) return true;
  for (const n of npcsHere()) {
    if (n === self || n.ghost) continue;
    if ((n.x === x && n.y === y) || (n.moving && n.tx === x && n.ty === y)) return true;
  }
  if (self !== player && ((player.x === x && player.y === y) || (player.tx === x && player.ty === y))) return true;
  return false;
}
function tryMove(a, dir) {
  a.dir = dir;
  const [dx, dy] = DIRS[dir];
  if (solidAt(a.x + dx, a.y + dy, a)) return false;
  a.moving = true; a.tx = a.x + dx; a.ty = a.y + dy;
  return true;
}
function stepActor(a, speed) {
  const gx = a.tx * T, gy = a.ty * T;
  a.px += Math.sign(gx - a.px) * Math.min(speed, Math.abs(gx - a.px));
  a.py += Math.sign(gy - a.py) * Math.min(speed, Math.abs(gy - a.py));
  if (a.px === gx && a.py === gy) { a.x = a.tx; a.y = a.ty; a.moving = false; a.stepCount = (a.stepCount || 0) + 1; return true; }
  return false;
}
function place(m, x, y, dir) {
  S.map = m;
  Object.assign(player, { x, y, tx: x, ty: y, px: x * T, py: y * T, dir, moving: false });
  snapCamera();
}

function target() {
  const [dx, dy] = DIRS[player.dir];
  const x = player.x + dx, y = player.y + dy;
  const npc = npcsHere().find((n) => (n.x === x && n.y === y) || (n.moving && n.tx === x && n.ty === y));
  if (npc && npc.kind !== 'bees') return { x, y, label: C.LABELS[npc.kind], act: () => npc.talk(npc), npc };
  const th = thingAt(x, y);
  if (th) {
    return {
      x, y, label: C.ITEMS[th.item][0],
      act: async () => {
        if (th.locked && th.locked()) return say(C.WORDS.slimeWarn);
        await say(C.WORDS[th.words]);
        S.flags[`took_${th.item}`] = 1;
        return give(th.item);
      },
    };
  }
  const c = charAt(S.map, x, y);
  if (c === 'L' && flag('exit')) return null;
  const fn = (C.EXAMINE[S.map] || {})[c];
  if (fn) return { x, y, label: C.LABELS[c] || '', act: () => fn(x, y) };
  const bees = npcsHere().find((n) => n.kind === 'bees' && Math.abs(n.x - x) + Math.abs(n.y - y) <= 1);
  if (bees) return { x, y, label: 'BEES', act: () => bees.talk(bees) };
  return null;
}

let turnHold = 0, lastDir = null, bump = 0;
function heldDir() {
  if (lastDir && held[lastDir]) return lastDir;
  lastDir = ['up', 'down', 'left', 'right'].find((d) => held[d]) || null;
  return lastDir;
}
function updatePlayer() {
  if (player.moving) {
    if (stepActor(player, held.run ? 4 : 2)) {
      if (player.stepCount % 2) audio.sfx('step');
      arrive();
    }
    if (player.moving) return;
  }
  if (busy) return;
  if (hit.start) return run(pauseMenu);
  if (hit.a) { const t = target(); if (t) return run(t.act); }
  if (hit.b) return run(openInventory);
  const d = heldDir();
  if (!d) { turnHold = 0; return; }
  if (d !== player.dir && turnHold === 0) { player.dir = d; turnHold = 1; return; }
  if (turnHold > 0 && turnHold < 5) { turnHold++; return; }
  if (!tryMove(player, d) && bump-- <= 0) { audio.sfx('bump'); bump = 20; }
}
function arrive() {
  const w = map().warps[`${player.x},${player.y}`];
  if (w) return run(() => warp(w));
  if (charAt(S.map, player.x, player.y) === 'U') return run(ending);
}
function updateNPC(n) {
  if (n.moving) { stepActor(n, 1); return; }
  if (!n.wander || busy) return;
  if (--n.timer > 0) return;
  n.timer = 60 + Math.random() * 120;
  const d = pick(Object.keys(DIRS));
  const [dx, dy] = DIRS[d];
  if (Math.abs(n.x + dx - n.home[0]) > n.wander || Math.abs(n.y + dy - n.home[1]) > n.wander) return;
  if (n.ghost) {
    const c = charAt(S.map, n.x + dx, n.y + dy);
    if (!C.TILEDEF[c] || (C.TILEDEF[c][1] && c !== 'h')) return;
    n.moving = true; n.tx = n.x + dx; n.ty = n.y + dy;
    return;
  }
  tryMove(n, d);
}

// ------------------------------------------------------------ transitions

async function warp([m, x, y, dir], opts = {}) {
  if (opts.zap) { crt.flash = 12; await wait(10); }
  audio.sfx('door');
  if (crt.motion) { audio.sfx('powerOff'); await tween((v) => { crt.squash = v; }, 0, 1, 12); } else await fadeTo(16);
  place(m, x, y, dir);
  save();
  enterRoom();
  if (crt.motion) { await wait(6); audio.sfx('powerOn'); await tween((v) => { crt.squash = v; }, 1, 0, 12); crt.squash = 0; } else await fadeTo(0);
}
function enterRoom() {
  roomTitle = { text: map().name, t0: frameNo };
  audio.music(C.MUSIC[S.map] || 'lab');
}

async function remember(kind) {
  audio.sfx('memory');
  await tween((v) => { post.ripple = v * 6; post.wash = Math.round(v * 16); }, 0, 1, 45);
  S.back = [S.map, player.x, player.y, player.dir];
  S.memory = kind;
  place('classroom', 5, 7, 'up');
  audio.music('memory');
  caption = { text: C.WORDS.memoryCaption, t0: frameNo };
  await tween((v) => { post.ripple = v * 6; post.wash = Math.round(v * 16); }, 1, 0, 45);
  post.ripple = 0; post.wash = 0;
}
async function forget() {
  audio.sfx('memory');
  await tween((v) => { post.ripple = v * 6; post.wash = Math.round(v * 16); }, 0, 1, 45);
  const [m, x, y, dir] = S.back;
  S.memory = null; S.back = null; caption = null;
  place(m, x, y, dir);
  enterRoom();
  await tween((v) => { post.ripple = v * 6; post.wash = Math.round(v * 16); }, 1, 0, 45);
  post.ripple = 0; post.wash = 0;
  save();
}

function snapshot() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').drawImage(buf, 0, 0);
  return c;
}

async function closeup(name, fn) {
  const def = CLOSEUPS[name];
  const cu = {
    name, def, state: {}, S, start: frameNo, interactive: false, talking: false,
    frame: () => frameNo,
    t: () => frameNo - cu.start,
    set: (o) => Object.assign(cu.state, o),
    sfx: (n) => audio.sfx(n),
    flash: () => { crt.flash = 10; },
    interact: () => new Promise((r) => { cu.interactive = true; cu.resolveI = r; }),
    done: (v) => { if (!cu.interactive) return; cu.interactive = false; const r = cu.resolveI; cu.resolveI = null; r(v); },
  };
  def.enter?.(cu);
  // zoom into whatever you're facing
  let fx = W / 2, fy = H / 2;
  if (!closeups.length) {
    const [dx, dy] = DIRS[player.dir];
    fx = (player.x + dx) * T + 8 + view.ox;
    fy = (player.y + dy) * T + 8 + view.oy;
  }
  audio.sfx('scan');
  trans = { snap: snapshot(), fx, fy, t0: frameNo, dur: 16 };
  await wait(16);
  fade = 16;
  trans = null;
  closeups.push(cu);
  cu.start = frameNo;
  await fadeTo(0, 3);
  let result;
  try { result = await fn(cu); } finally {
    await fadeTo(16, 3);
    closeups.pop();
    await fadeTo(0, 3);
  }
  return result;
}

// ============================================================ battle

let B = null;
const anims = [];
function anim(draw, frames) {
  return new Promise((resolve) => anims.push({ draw, t0: frameNo, frames, resolve }));
}
async function battle() {
  audio.music('battle');
  audio.sfx('powerOff');
  if (crt.motion) await tween((v) => { crt.squash = v; }, 0, 1, 10); else await fadeTo(16);
  B = { hp: 12, max: 12, pops: [], slimes: [0, 1, 2].map((i) => ({ i, hp: 6, max: 6, x: 60 + i * 60, hurtT: -99, dieT: null, lungeT: -99 })) };
  scene = 'battle';
  if (crt.motion) { await tween((v) => { crt.squash = v; }, 1, 0, 10); crt.squash = 0; } else await fadeTo(0);
  await say(C.WORDS.battleStart);
  let result = null;
  while (!result) {
    const alive = B.slimes.filter((s) => s.hp > 0);
    const c = await choose(['FIGHT', 'SCAN', 'ITEM', 'RUN'], `WHAT WILL YOU DO?  HP ${B.hp}/${B.max}`, true);
    if (c === 0) {
      const s = alive[0];
      audio.sfx('slash');
      await anim((t) => {
        for (let k = 0; k < 3; k++) line(s.x - 24 + k * 6 + t * 3, 20 + t * 6, s.x - 36 + k * 6 + t * 5, 20 + t * 6 - 30, 'hot');
      }, 10);
      if (has('blade')) {
        audio.sfx('hit');
        s.hp = 0; s.hurtT = frameNo; s.dieT = frameNo; crt.shake = 8;
        B.pops.push({ x: s.x, y: 40, text: '-6', t0: frameNo });
        await wait(24);
        await say(C.WORDS.hitBlade);
      } else {
        audio.sfx('bump');
        s.hurtT = frameNo;
        B.pops.push({ x: s.x, y: 40, text: '0', t0: frameNo });
        await wait(20);
        await say(C.WORDS.hitFist);
      }
    } else if (c === 1) {
      audio.sfx('scan');
      await anim((t) => { const y = 10 + t * 4; rect(0, y, W, 1, 'hot'); ditherRect(0, y - 8, W, 8, 4, 'hi'); }, 20);
      await say(C.WORDS.scan);
      continue;
    } else if (c === 2) {
      const opts = S.items.map((i) => C.ITEMS[i][0]);
      if (!opts.length) { await say(['You have nothing.']); continue; }
      const i = await choose(opts, 'USE WHICH?');
      if (i < 0) continue;
      await say(S.items[i] === 'chris' ? C.WORDS.itemChris : C.WORDS.itemNotNow(opts[i]));
    } else {
      await say(C.WORDS.run);
      result = 'run';
      break;
    }
    const left = B.slimes.filter((s) => s.hp > 0);
    if (!left.length) { result = 'win'; break; }
    for (const s of left) s.lungeT = frameNo;
    await wait(10);
    if (has('armor')) {
      audio.sfx('bump');
      B.pops.push({ x: 40, y: 20, text: 'BLOCK', t0: frameNo });
      await say(C.WORDS.slimeBounce);
    } else {
      const dmg = left.length * 4;
      B.hp = Math.max(0, B.hp - dmg);
      audio.sfx('hurt');
      crt.shake = 14; crt.flash = 6;
      B.pops.push({ x: 40, y: 20, text: `-${dmg}`, t0: frameNo });
      await wait(16);
      await say(C.WORDS.slimeHit(left.length, dmg));
      if (B.hp <= 0) result = 'lose';
    }
  }
  if (result === 'win') { audio.sfx('victory'); await wait(30); await say(C.WORDS.win); S.flags.slimes = 1; }
  if (result === 'lose') await say(C.WORDS.lose);
  await fadeTo(16);
  scene = 'play';
  B = null;
  if (result !== 'win') place('hub', 14, 1, 'down');
  save();
  enterRoom();
  await fadeTo(0);
}

function drawBattle() {
  clear();
  const t = frameNo;
  for (let i = 0; i < 12; i++) {
    const y = 84 + i * i * 0.6;
    if (y < H) rect(0, y, W, 1, 'deep');
  }
  for (let x = -120; x <= 360; x += 30) line(120 + (x - 120) * 0.15, 84, x, 160, 'deep');
  for (const s of B.slimes) {
    if (s.hp <= 0 && s.dieT !== null && t - s.dieT > 24) continue;
    const hurt = t - s.hurtT < 16 && ((t >> 1) % 2);
    const lunge = t - s.lungeT < 14 ? Math.sin(((t - s.lungeT) / 14) * Math.PI) : 0;
    const sh = 1 + Math.sin(t / 9 + s.i * 2) * 0.08 - lunge * 0.15;
    const y = 36 + lunge * 16;
    if (!hurt) sprite(`slime${(t >> 4) % 2}`, s.x - 24 - lunge * 6, y, 3 + lunge * 0.4, 'sprites', false, sh);
    if (s.dieT !== null) {
      const d = t - s.dieT;
      ditherRect(s.x - 26, y, 52, 50, Math.min(16, d), 'bg');
      for (let k = 0; k < 10; k++) {
        const a = k * 0.63;
        rect(s.x + Math.cos(a) * d * 2, 60 + Math.sin(a) * d * 1.5, 2, 2, 'hi');
      }
    } else {
      rect(s.x - 12, 28, 24, 3, 'deep');
      rect(s.x - 12, 28, Math.round((24 * s.hp) / s.max), 3, 'mid');
    }
  }
  // you
  panel(4, 4, 92, 22);
  text('YOU', 10, 10, 'mid');
  rect(38, 11, 52, 6, 'deep');
  rect(38, 11, Math.round((52 * B.hp) / B.max), 6, B.hp > 4 ? 'hi' : 'mid');
  if (has('armor')) text('+ARMOR', 176, 6, 'dim');
  if (has('blade')) text('+BLADE', 176, 16, 'dim');
  for (const p of B.pops) {
    const d = t - p.t0;
    if (d < 40) text(p.text, p.x - p.text.length * 4, p.y - d * 0.6, d % 4 < 2 ? 'hot' : 'hi');
  }
}

// ============================================================ title, boot, ending

let titleT = 0, bootT = 0;
function updateBoot() {
  const t = frameNo - bootT;
  if (t % 3 === 0 && t < 110) audio.sfx('type');
  if (t > 150 || ((hit.a || hit.start) && t > 5)) {
    audio.sfx('boot');
    scene = 'title';
    titleT = frameNo;
    audio.music('title');
  }
}
function drawBoot() {
  clear();
  const t = frameNo - bootT;
  let chars = t * 1.4;
  C.WORDS.boot.forEach((l, i) => {
    const vis = l.slice(0, Math.max(0, Math.floor(chars)));
    chars -= l.length + 6;
    text(vis, 8, 10 + i * 12, i === C.WORDS.boot.length - 1 ? 'hi' : 'mid');
  });
  if (t > 110) {
    const p = Math.min(1, (t - 110) / 35);
    frame(8, 78, 160, 8, 'mid');
    rect(10, 80, Math.round(156 * p), 4, 'hi');
  }
  if ((t >> 3) % 2) rect(8, 140, 6, 8, 'hi');
}

function drawTitle() {
  clear();
  const t = frameNo - titleT;
  for (const [i, s] of [[0, 'SCIENCE'], [1, 'COMPLETE']]) {
    const y = 22 + i * 28;
    const glitch = crt.motion && Math.random() < 0.03 ? Math.round(Math.random() * 6 - 3) : 0;
    center(s, y + 2, 'dim', 3);
    text(s, Math.round((W - s.length * 24) / 2) + glitch, y, 'hi', 3);
  }
  center('A ROUGH BUILD  v0.2', 80, 'mid');
  rect(0, 94, W, 1, 'dim');
  rect(0, 117, W, 1, 'dim');
  const x = ((t * 0.6) % (W + 90)) - 45;
  sprite(`s_right${(t >> 3) % 2}`, x, 99);
  sprite(`chris${(t >> 4) % 2}`, x - 22, 99);
  sprite(`slime${(t >> 4) % 2}`, x - 66, 99);
  if (!ui && (t >> 5) % 2) center(`PRESS ${KEY_A}`, 132, 'hi');
}
async function titleMenu() {
  const saved = loadSave();
  let fromSave = null;
  if (saved) {
    const c = await choose(['CONTINUE', 'NEW GAME'], null, true);
    if (c === 0) fromSave = saved; else clearSave();
  }
  audio.sfx('confirm');
  await fadeTo(16);
  resetState(fromSave);
  if (S.memory && S.back) { const [m, x, y, dir] = S.back; S.memory = null; S.back = null; S.map = m; S.x = x; S.y = y; S.dir = dir; }
  for (const n of NPCS) Object.assign(n, { x: n.home[0], y: n.home[1], tx: n.home[0], ty: n.home[1], px: n.home[0] * T, py: n.home[1] * T, moving: false });
  place(S.map, S.x, S.y, S.dir);
  scene = 'play';
  enterRoom();
  await fadeTo(0);
  if (!fromSave) await say(C.WORDS.intro);
}

let endT = 0, endPage = -1;
async function ending() {
  // swallowed by the uplink
  audio.sfx('zap');
  for (let i = 0; i < 40; i++) { player.spin = i; await wait(1); }
  crt.flash = 16;
  await fadeTo(16);
  scene = 'ending';
  endT = frameNo;
  endPage = 0;
  audio.music('ending');
  await fadeTo(0);
  for (endPage = 0; endPage < C.WORDS.ending.length; endPage++) {
    const t0 = frameNo;
    await new Promise((r) => { ui = { kind: 'wait', resolve: r, t0 }; });
  }
  endPage = -1;
  audio.sfx('victory');
  await new Promise((r) => { ui = { kind: 'wait', resolve: r, t0: frameNo + 60 }; });
  clearSave();
  await fadeTo(16);
  player.spin = 0;
  scene = 'title';
  titleT = frameNo;
  audio.music('title');
  await fadeTo(0);
}
function drawEnding() {
  clear();
  const t = frameNo - endT;
  // star warp
  const speed = Math.min(1, t / 300) * 4 + 0.4;
  for (let i = 0; i < 90; i++) {
    const a = i * 2.39996, z0 = ((i * 37) % 100) / 100;
    const z = 1 - ((z0 + t * speed * 0.002) % 1);
    const r = 6 / (z + 0.05);
    const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r;
    const r2 = 6 / (z + 0.05 + speed * 0.01);
    line(x, y, W / 2 + Math.cos(a) * r2, H / 2 + Math.sin(a) * r2, z < 0.3 ? 'hot' : z < 0.6 ? 'hi' : 'dim');
  }
  // the planet falling away below
  const pr = Math.max(4, 160 - t * 0.35), py = H + pr * 0.55 + t * 0.12;
  if (py - pr < H) {
    circle(W / 2, py, pr, 'bg', true);
    g.save();
    g.beginPath(); g.arc(W / 2, py, pr, 0, Math.PI * 2); g.clip();
    ditherRect(W / 2 - pr, py - pr, pr * 2, pr * 2, 5, 'dim');
    ditherRect(W / 2 - pr, py - pr * 0.2, pr * 2, pr * 2, 10, 'bg');
    g.restore();
    circle(W / 2, py, pr, 'mid');
  }
  if (endPage >= 0 && endPage < C.WORDS.ending.length) {
    const lines = wrap(C.WORDS.ending[endPage], 26);
    const shown = (frameNo - (ui?.t0 ?? frameNo)) * 1.2;
    let left = shown;
    rect(0, 50 - lines.length * 6, W, lines.length * 12 + 8, 'bg');
    lines.forEach((l, i) => { center(l.slice(0, Math.max(0, Math.floor(left))).padEnd(l.length, ' '), 54 + i * 12 - lines.length * 6, 'hi'); left -= l.length; });
  } else if (endPage < 0) {
    rect(0, 10, W, 110, 'bg');
    center('SCIENCE', 16, 'hi', 3);
    center('COMPLETE', 42, 'hi', 3);
    C.WORDS.credits.slice(2).forEach((l, i) => center(l, 74 + i * 10, 'mid'));
    const mins = Math.floor(S.time / 60), secs = Math.floor(S.time % 60);
    center(`TIME ${mins}:${String(secs).padStart(2, '0')}   BUTTON x${S.buttons}`, 112, 'dim');
  }
  if (ui?.kind === 'wait' && frameNo > ui.t0 + 20 && (frameNo >> 4) % 2) text(KEY_A, W - 16, H - 14, 'mid');
}

// ============================================================ save

const SAVE_KEY = 'sciencecomplete.save.v2';
function save() {
  if (S.memory || scene !== 'play') return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(Object.assign({}, S, { x: player.x, y: player.y, dir: player.dir })));
    savedAt = frameNo;
    audio.sfx('save');
  } catch (e) { /* no storage */ }
}
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || JSON.parse(localStorage.getItem('sciencecomplete.save.v1')); } catch (e) { return null; }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem('sciencecomplete.save.v1'); } catch (e) { /* ignore */ }
}

// ============================================================ rendering the world

const layerCache = {};
const INTERACTIVE_EXTRA = new Set(['D', 'M', 'U', 'g', 'L']);
function staticLayer() {
  const mem = !!map().memory;
  const key = `${S.map}|${mem}`;
  if (layerCache[key]) return layerCache[key];
  const m = map();
  const c = document.createElement('canvas');
  c.width = m.rows[0].length * T; c.height = m.rows.length * T;
  const x2 = c.getContext('2d');
  const hot = new Set([...Object.keys(C.EXAMINE[S.map] || {}), ...INTERACTIVE_EXTRA]);
  const dimSheet = mem ? img.tilesMem : img.tilesDim, hiSheet = mem ? img.tilesMemHi : img.tilesHi;
  const baseName = S.map === 'breakroom' || S.map === 'classroom' ? 'floor' : 'lab_floor';
  const put = (sheet, name, x, y) => {
    const i = atlas().tiles[name];
    if (i !== undefined) x2.drawImage(sheet, (i % 8) * T, ((i / 8) | 0) * T, T, T, x, y, T, T);
  };
  m.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const def = C.TILEDEF[ch];
    if (!def || !def[0] || C.ANIM[def[0]] || ch === 'L') return;
    const floor = !mem && (ch === ',' || ch === ':') ? img.tilesDeep : dimSheet;
    if (def[2]) put(def[2] === 'cyto' ? floor : dimSheet, def[2] === 'base' ? baseName : def[2], x * T, y * T);
    put(hot.has(ch) ? hiSheet : ch === ',' || ch === ':' ? floor : dimSheet, def[0], x * T, y * T);
  }));
  layerCache[key] = c;
  return c;
}
const atlas = () => GFX.atlas;

function snapCamera() {
  const m = map();
  const mw = m.rows[0].length * T, mh = m.rows.length * T;
  cam.tx = mw <= W ? (mw - W) / 2 : Math.max(0, Math.min(mw - W, player.px + 8 - W / 2));
  cam.ty = mh <= H ? (mh - H) / 2 : Math.max(0, Math.min(mh - H, player.py + 8 - H / 2));
  cam.x = cam.tx; cam.y = cam.ty;
}
function updateCamera() {
  const m = map();
  const mw = m.rows[0].length * T, mh = m.rows.length * T;
  const [dx, dy] = DIRS[player.dir];
  const look = player.moving ? 10 : 0;
  cam.tx = mw <= W ? (mw - W) / 2 : Math.max(0, Math.min(mw - W, player.px + 8 + dx * look - W / 2));
  cam.ty = mh <= H ? (mh - H) / 2 : Math.max(0, Math.min(mh - H, player.py + 8 + dy * look - H / 2));
  cam.x += (cam.tx - cam.x) * 0.15;
  cam.y += (cam.ty - cam.y) * 0.15;
}

function drawWorld() {
  const m = map();
  const mem = !!m.memory;
  const ox = -Math.round(cam.x), oy = -Math.round(cam.y);
  view.ox = ox; view.oy = oy;
  clear();
  g.drawImage(staticLayer(), ox, oy);
  const tSheet = mem ? 'tilesMemHi' : 'tilesHi';
  // animated + stateful tiles
  m.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const def = C.TILEDEF[ch];
    if (!def || !def[0]) return;
    const px = ox + x * T, py = oy + y * T;
    if (px < -T || py < -T || px > W || py > H) return;
    if (ch === 'L') { tile(flag('exit') ? 'doorway' : 'lab_door', px, py, tSheet); return; }
    const a = C.ANIM[def[0]];
    if (a) tile(`${def[0]}${(frameNo / a | 0) % 2}`, px, py, (C.EXAMINE[S.map] || {})[ch] || INTERACTIVE_EXTRA.has(ch) ? tSheet : (mem ? 'tilesMem' : 'tilesDim'));
  }));
  const sSheet = mem ? 'spritesMem' : 'spritesGlow';
  for (const th of C.THINGS) {
    if (th.map === S.map && !flag(`took_${th.item}`)) sprite(th.sprite, ox + th.x * T, oy + th.y * T - 6 + Math.round(Math.sin(frameNo / 20) * 1), 1, sSheet);
  }
  const actors = [player, ...npcsHere()].sort((a, b) => a.py - b.py);
  for (const a of actors) {
    let name, dy = -2;
    if (a === player) {
      let dir = a.dir;
      if (a.spin) dir = ['down', 'left', 'up', 'right'][(a.spin >> 2) % 4];
      const phase = a.moving && (Math.abs(a.px - a.tx * T) + Math.abs(a.py - a.ty * T)) < 9;
      if (dir === 'left' || dir === 'right') name = `s_${dir}${phase ? 1 : 0}`;
      else name = `s_${dir}${phase ? (a.stepCount % 2 ? 1 : 2) : 0}`;
      if (a.spin) {
        const s = Math.max(0.1, 1 - a.spin / 40);
        sprite(name, ox + a.px + 8 - 8 * s, oy + a.py + 8 - 8 * s, s, sSheet);
        continue;
      }
    } else {
      const k = a.kind === 'chris' && flag('hatGiven') ? 'chris_hat' : a.kind;
      name = `${k}${(frameNo >> (a.kind === 'bees' ? 3 : 5)) % 2}`;
      if (a.kind === 'ad') dy = Math.round(Math.sin(frameNo / 15 + a.x) * 1.5) - 2;
    }
    sprite(name, ox + a.px, oy + a.py + dy, 1, sSheet);
  }
  if (mem) {
    // film grain + vignette for memories
    for (let i = 0; i < 120; i++) rect(Math.random() * W, Math.random() * H, 1, 1, Math.random() < 0.5 ? 'deep' : 'hot');
    ditherRect(0, 0, W, 10, 8, 'bg'); ditherRect(0, H - 10, W, 10, 8, 'bg');
    ditherRect(0, 0, 10, H, 8, 'bg'); ditherRect(W - 10, 0, 10, H, 8, 'bg');
  }
  if (!ui && !busy && !player.moving && scene === 'play') drawReticle(ox, oy);
}

function drawReticle(ox, oy) {
  const t = target();
  if (!t) return;
  const x = ox + t.x * T, y = oy + t.y * T, p = (frameNo >> 4) % 2;
  const corner = (cx, cy, sx, sy) => {
    rect(sx > 0 ? cx : cx - 3, cy, 4, 1, 'hot');
    rect(cx, sy > 0 ? cy : cy - 3, 1, 4, 'hot');
  };
  corner(x - 2 + p, y - 2 + p, 1, 1);
  corner(x + 17 - p, y - 2 + p, -1, 1);
  corner(x - 2 + p, y + 17 - p, 1, -1);
  corner(x + 17 - p, y + 17 - p, -1, -1);
  if (t.label) {
    const w = (t.label.length + 2) * 8 + 8;
    const bx = W - w - 4, by = H - 16;
    rect(bx, by, w, 12, 'bg');
    frame(bx, by, w, 12, 'dim');
    rect(bx + 3, by + 2, 9, 8, 'hi');
    text(KEY_A, bx + 4, by + 2, 'bg');
    text(t.label, bx + 20, by + 2, 'hi');
  }
}

function drawHUD() {
  if (roomTitle && !ui) {
    const t = frameNo - roomTitle.t0;
    if (t < 150) {
      const s = `> ${roomTitle.text}`;
      const vis = s.slice(0, Math.floor(t / 2));
      rect(4, 4, s.length * 8 + 14, 14, 'bg');
      frame(4, 4, s.length * 8 + 14, 14, t > 130 ? 'deep' : 'dim');
      text(vis, 9, 7, t > 130 ? 'dim' : 'hi');
      if ((frameNo >> 3) % 2) rect(9 + vis.length * 8, 7, 6, 8, 'hi');
    }
  }
  if (caption && S.memory) {
    const t = frameNo - caption.t0;
    if (t < 220) {
      const w = caption.text.length * 8 + 16;
      rect((W - w) / 2, 22, w, 14, 'bg');
      frame((W - w) / 2, 22, w, 14, 'dim');
      center(caption.text.slice(0, Math.floor(t / 2)), 25, 'hot');
    }
  }
  if (frameNo - savedAt < 70 && !ui) {
    rect(W - 46, 4, 42, 12, 'bg');
    text('SAVED', W - 44, 6, (frameNo >> 3) % 2 ? 'mid' : 'dim');
  }
}

// ============================================================ frame

function drawUI() {
  if (!ui) return;
  if (ui.kind === 'say') drawTextBox(ui.pages[ui.page], ui.shown);
  else if (ui.kind === 'choose') drawChoice(ui);
  else if (ui.kind === 'banner') drawBanner(ui);
  else if (ui.kind === 'inv') drawInv(ui);
  else if (ui.kind === 'pause') drawPause(ui);
}

function drawTrans() {
  const p = ease((frameNo - trans.t0) / trans.dur);
  const s = 1 + p * 2.2;
  clear();
  g.imageSmoothingEnabled = false;
  g.drawImage(trans.snap, trans.fx - trans.fx * s, trans.fy - trans.fy * s, W * s, H * s);
  // lens rings closing in
  for (let i = 0; i < 3; i++) {
    const r = (1 - p) * 180 + i * 10;
    circle(trans.fx, trans.fy, r, 'hi');
  }
  ditherRect(0, 0, W, H, Math.round(p * 16), 'bg');
}

function postFX() {
  if (post.ripple > 0.1 || post.wash > 0) {
    const snap = snapshot();
    clear();
    for (let y = 0; y < H; y++) {
      const off = Math.round(Math.sin(y / 5 + frameNo / 4) * post.ripple);
      g.drawImage(snap, 0, y, W, 1, off, y, W, 1);
    }
    if (post.wash > 0) ditherRect(0, 0, W, H, post.wash, 'mid');
  }
  if (fade > 0) {
    if (fade >= 16) clear();
    else ditherRect(0, 0, W, H, fade, 'bg');
  }
}

function render() {
  if (trans) drawTrans();
  else if (closeups.length) {
    const cu = closeups[closeups.length - 1];
    cu.talking = ui?.kind === 'say' && ui.shown < ui.pages[ui.page].lines.join('').length && ui.pages[ui.page].voice === 'console';
    cu.def.draw(cu, frameNo - cu.start);
  } else if (scene === 'boot') drawBoot();
  else if (scene === 'title') drawTitle();
  else if (scene === 'battle') drawBattle();
  else if (scene === 'ending') drawEnding();
  else { drawWorld(); drawHUD(); }
  if (scene === 'battle' || closeups.length) drawAnims();
  if (!trans) drawUI();
  postFX();
  present(frameNo);
}
function drawAnims() {
  for (const a of anims) a.draw(frameNo - a.t0);
}

function update() {
  frameNo++;
  waiters = waiters.filter(([f, r]) => (f <= frameNo ? (r(), false) : true));
  for (let i = anims.length - 1; i >= 0; i--) {
    if (frameNo - anims[i].t0 >= anims[i].frames) { anims[i].resolve(); anims.splice(i, 1); }
  }
  if (ui) {
    if (ui.kind === 'say') updateSay(ui);
    else if (ui.kind === 'choose') updateChoice(ui);
    else if (ui.kind === 'inv') updateInv(ui);
    else if (ui.kind === 'pause') updatePause(ui);
    else if (ui.kind === 'banner') {
      if ((hit.a || hit.b) && frameNo - ui.t0 > 20) { const u = ui; ui = null; audio.sfx('confirm'); u.resolve(); }
    } else if (ui.kind === 'wait') {
      if ((hit.a || hit.b) && frameNo - ui.t0 > 20) { const u = ui; ui = null; audio.sfx('confirm'); u.resolve(); }
    }
  } else if (closeups.length && closeups[closeups.length - 1].interactive) {
    const cu = closeups[closeups.length - 1];
    cu.def.update?.(cu, { hit, held });
  } else if (scene === 'boot') {
    updateBoot();
  } else if (scene === 'title') {
    if ((hit.a || hit.start) && !busy && frameNo - titleT > 10) run(titleMenu);
  } else if (scene === 'play' && !closeups.length && fade === 0 && !trans && !crt.squash) {
    updatePlayer();
  }
  if (scene === 'play') {
    npcsHere().forEach(updateNPC);
    updateCamera();
    if (!ui) S.time += 1 / 60;
  }
  for (const k in hit) delete hit[k];
}

// ============================================================ boot the thing

const screenEl = document.getElementById('game');
const stage = document.getElementById('stage');
initScreen(screenEl);
applySettings();

let last = 0, acc = 0;
function loop(ts) {
  acc += Math.min(100, ts - (last || ts));
  last = ts;
  while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
  render();
  requestAnimationFrame(loop);
}

loadAssets().then(() => {
  fitScreen(stage);
  addEventListener('resize', () => fitScreen(stage));
  bootT = frameNo;
  requestAnimationFrame(loop);
}).catch((e) => {
  stage.textContent = 'Could not load the game.';
  console.error(e);
});

// test hooks
window.SC = {
  S, player, NPCS, closeups, C, CLOSEUPS,
  get ui() { return ui; }, get busy() { return busy; }, get scene() { return scene; },
  place: (m, x, y, dir) => place(m, x, y, dir),
};
