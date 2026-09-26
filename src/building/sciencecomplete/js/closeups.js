// POV close-ups. Each one paints a full 240x160 scene with the gfx
// primitives; the engine zooms into them from the world and overlays the
// terminal text box along the bottom (so key art lives above y~108).
//
//   draw(cu, t)            t = frames since the close-up opened
//   update(cu, input)      optional; only while a script awaits cu.interact()
//   cu.state               whatever scripts cu.set({...})
//   cu.done(value)         resolves the pending cu.interact()

import {
  W, H, PAL, g, img, atlas, rect, frame, line, circle, ditherRect, text, scrawl, sprite, clear,
} from './gfx.js';

// ------------------------------------------------------------ helpers

function ellipse(cx, cy, rx, ry, col, fill = true) {
  g.fillStyle = PAL[col] || col;
  for (let y = -ry; y <= ry; y++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    if (fill) g.fillRect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1);
    else {
      g.fillRect(Math.round(cx - hw), Math.round(cy + y), 1, 1);
      g.fillRect(Math.round(cx + hw), Math.round(cy + y), 1, 1);
    }
  }
  if (!fill) {
    for (let x = -rx; x <= rx; x++) {
      const hh = Math.round(ry * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx))));
      g.fillRect(Math.round(cx + x), Math.round(cy - hh), 1, 1);
      g.fillRect(Math.round(cx + x), Math.round(cy + hh), 1, 1);
    }
  }
}
function box(x, y, w, h, fill = 'bg', edge = 'hi') { rect(x, y, w, h, fill); frame(x, y, w, h, edge); }
function heart(cx, cy, s, col) {
  const rows = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') rect(cx + (x - 3) * s, cy + (y - 3) * s, s, s, col); }));
}
function check(x, y, col) { line(x, y + 4, x + 3, y + 7, col); line(x + 3, y + 7, x + 9, y - 1, col); }
function wallBg(col = 'deep') {
  clear();
  ditherRect(0, 0, W, H, 3, col);
}
const ease = (p) => (p < 0 ? 0 : p > 1 ? 1 : p * p * (3 - 2 * p));
function bigTile(name, x, y, s, sheet) {
  const i = atlas.tiles[name];
  g.drawImage(img[sheet], (i % atlas.cols) * 16, ((i / atlas.cols) | 0) * 16, 16, 16, x, y, 16 * s, 16 * s);
}
const since = (cu, key) => (cu.state[key] === undefined ? Infinity : cu.frame() - cu.state[key]);

// seeded star field
const STARS = Array.from({ length: 60 }, (_, i) => {
  const r = (n) => { const v = Math.sin(i * 91.7 + n * 13.1) * 9999; return v - Math.floor(v); };
  return [r(1), r(2), r(3)];
});

// ------------------------------------------------------------ scenes

export const CLOSEUPS = {

  button: {
    draw(cu, t) {
      wallBg();
      rect(0, 100, W, 60, 'bg');
      line(0, 100, W, 100, 'dim');
      for (let x = -200; x < W + 200; x += 24) line(120 + (x - 120) * 0.3, 100, x, 160, 'deep');
      // press counter on the wall
      box(164, 12, 60, 28, 'bg', 'mid');
      text('PRESSES', 166, 16, 'dim');
      text(String(cu.state.count ?? cu.S.buttons).padStart(4, '0'), 178, 27, 'hi');
      // pedestal
      rect(96, 64, 48, 44, 'bg');
      frame(96, 64, 48, 44, 'mid');
      frame(99, 67, 42, 38, 'dim');
      text('USE', 108, 78, 'dim');
      text('LESS', 104, 88, 'dim');
      ellipse(120, 64, 30, 7, 'bg');
      ellipse(120, 64, 30, 7, 'mid', false);
      // the button itself
      const p = since(cu, 'press');
      const down = p < 10 ? 1 - Math.abs(p - 4) / 6 : 0;
      const top = 44 + down * 7;
      ellipse(120, 60, 20, 6, 'dim');
      rect(100, top + 2, 41, 60 - top, 'mid');
      ellipse(120, top + 2, 20, 8 - down * 3, 'hi');
      ellipse(114, top, 6, 2, 'hot');
      if (p < 12) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2, r0 = 26 + p * 2, r1 = r0 + 6;
          line(120 + Math.cos(a) * r0, 54 + Math.sin(a) * r0 * 0.5, 120 + Math.cos(a) * r1, 54 + Math.sin(a) * r1 * 0.5, 'hi');
        }
      }
      // finger
      const fy = p < 16 ? top - 34 + ease(1 - Math.abs(p - 5) / 8) * 20 : -40;
      if (fy > -40) {
        box(112, fy - 60, 16, 64, 'bg', 'hi');
        rect(114, fy - 4, 12, 6, 'mid');
      }
    },
  },

  tubes: {
    draw(cu, t) {
      wallBg();
      box(30, 84, 180, 12, 'bg', 'mid');
      for (let i = 0; i < 5; i++) {
        const x = 46 + i * 34, lvl = 30 + ((i * 7) % 20);
        rect(x, 20, 18, 70, 'bg');
        frame(x, 20, 18, 70, 'hi');
        ditherRect(x + 2, 90 - lvl, 14, lvl - 2, 6 + (i % 3) * 3, 'mid');
        for (let b = 0; b < 3; b++) {
          const by = 88 - ((t * (0.5 + b * 0.2) + b * 23 + i * 11) % lvl);
          circle(x + 5 + b * 4, by, 1 + (b % 2), 'hot');
        }
      }
      text('EXPERIMENTS 41-44', 52, 6, 'dim');
    },
  },

  microscope: {
    draw(cu, t) {
      clear();
      const cx = 120, cy = 58, R = 54;
      g.save();
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.clip();
      rect(0, 0, W, H, 'deep');
      for (let i = 0; i < 9; i++) {
        const x = cx + Math.sin(t / 90 + i * 2.1) * 44, y = cy + Math.cos(t / 110 + i * 1.3) * 40;
        circle(x, y, 6 + (i % 4) * 2, 'dim', true);
        circle(x, y, 6 + (i % 4) * 2, 'mid');
        circle(x + 2, y - 1, 2, 'mid', true);
      }
      const c = since(cu, 'chris');
      if (c < Infinity) {
        const s = Math.min(1, c / 30);
        const bob = Math.sin(t / 10) * 2;
        sprite(`chris${(t >> 3) % 2}`, cx - 32, cy - 36 + bob, 4);
        if (s < 1) ditherRect(cx - 40, cy - 40, 80, 80, Math.round((1 - s) * 16), 'deep');
      }
      g.restore();
      circle(cx, cy, R, 'hi');
      circle(cx, cy, R + 1, 'mid');
      for (let i = -3; i <= 3; i++) {
        if (!i) continue;
        line(cx + i * 12, cy + R - 6, cx + i * 12, cy + R - (i % 2 ? 3 : 1), 'dim');
      }
      line(cx - 4, cy, cx + 4, cy, 'dim');
      line(cx, cy - 4, cx, cy + 4, 'dim');
      text('x400', 196, 8, 'dim');
    },
  },

  console: {
    draw(cu, t) {
      wallBg();
      // bezel + stand
      rect(104, 110, 32, 10, 'bg'); frame(104, 110, 32, 10, 'dim');
      box(20, 4, 200, 108, 'bg', 'mid');
      frame(23, 7, 194, 102, 'dim');
      rect(30, 12, 180, 90, 'deep');
      for (let y = 12; y < 102; y += 2) rect(30, y, 180, 1, 'bg');
      const face = cu.state.face || 'idle';
      const talking = cu.talking && (t >> 2) % 2;
      const blink = face === 'idle' && t % 170 > 162;
      const eye = (x, kind) => {
        if (kind === 'open') rect(x, 34, 14, 20, 'hi');
        else if (kind === 'closed') rect(x, 46, 14, 3, 'hi');
        else if (kind === 'squint') rect(x, 42, 14, 7, 'hi');
        else if (kind === 'happy') { line(x, 48, x + 7, 40, 'hi'); line(x + 7, 40, x + 14, 48, 'hi'); line(x, 49, x + 7, 41, 'hi'); line(x + 7, 41, x + 14, 49, 'hi'); }
        else if (kind === 'up') { rect(x, 34, 14, 20, 'hi'); rect(x + 7, 36, 5, 6, 'deep'); }
        else if (kind === 'heart') heart(x + 7, 44, 2 + ((t >> 4) % 2), 'hi');
        else if (kind === 'dollar') text('$', x - 1, 32, 'hi', 2.5);
      };
      const L = 84, Rr = 142;
      const eyes = {
        idle: blink ? ['closed', 'closed'] : ['open', 'open'],
        doubt: ['squint', 'open'],
        think: ['up', 'up'],
        happy: ['happy', 'happy'],
        flirt: ['closed', 'open'],
        love: ['heart', 'heart'],
        ad: ['dollar', 'dollar'],
        sleep: ['closed', 'closed'],
      }[face] || ['open', 'open'];
      eye(L, eyes[0]); eye(Rr, eyes[1]);
      if (face === 'doubt') line(Rr - 2, 28, Rr + 16, 32, 'hi');
      if (face === 'think') { for (let i = 0; i < 3; i++) if ((t >> 4) % 4 > i) rect(170 + i * 8, 26, 4, 4, 'mid'); }
      if (face === 'sleep') { text('z', 176, 30 - ((t >> 3) % 6), 'mid'); text('Z', 188, 20 - ((t >> 4) % 4), 'hi'); }
      // mouth
      if (talking) ellipse(120, 78, 12, 5, 'hi');
      else if (face === 'doubt' || face === 'sleep') rect(106, 78, 28, 2, 'hi');
      else if (face === 'think') ellipse(120, 78, 4, 3, 'hi', false);
      else {
        const w = face === 'happy' || face === 'love' ? 20 : 14;
        for (let x = -w; x <= w; x++) rect(120 + x, 74 + Math.round((1 - (x * x) / (w * w)) * 6), 1, 2, 'hi');
      }
      rect(200, 104, 4, 2, (t >> 5) % 2 ? 'hi' : 'dim');
    },
  },

  keypad: {
    enter(cu) { cu.state.code = ''; cu.state.cur = 0; },
    draw(cu, t) {
      wallBg();
      box(58, 4, 124, 104, 'bg', 'mid');
      frame(61, 7, 118, 98, 'dim');
      // display
      box(70, 12, 100, 18, 'deep', 'dim');
      const code = cu.state.code || '';
      for (let i = 0; i < 4; i++) {
        const ch = code[i] ?? ((t >> 4) % 2 && i === code.length ? '_' : ' ');
        text(ch, 88 + i * 18, 17, cu.state.err > cu.frame() ? 'mid' : 'hi');
      }
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '<', '0', 'OK'];
      keys.forEach((k, i) => {
        const x = 74 + (i % 3) * 32, y = 36 + ((i / 3) | 0) * 17;
        const sel = i === cu.state.cur;
        const pressed = cu.state.pressKey === i && cu.frame() - cu.state.pressT < 6;
        box(x, y, 28, 14, pressed ? 'hi' : sel ? 'dim' : 'bg', sel ? 'hot' : 'mid');
        text(k, x + 14 - k.length * 4, y + 3, pressed ? 'bg' : 'hi');
      });
      // the dry notes, taped next to the keypad
      box(190, 20, 44, 50, 'bg', 'dim');
      scrawl('4', 194, 26, 'mid', 3);
      scrawl('DIGITS', 194, 36, 'mid', 4);
      scrawl('OF', 194, 46, 'mid', 5);
      scrawl('PI', 194, 56, 'hi', 6);
      text('A:PRESS  B:BACK', 60, 112, 'dim');
    },
    update(cu, { hit }) {
      const s = cu.state;
      const move = (dx, dy) => {
        const col = s.cur % 3, row = (s.cur / 3) | 0;
        s.cur = ((row + dy + 4) % 4) * 3 + ((col + dx + 3) % 3);
        cu.sfx('select');
      };
      if (hit.left) move(-1, 0);
      if (hit.right) move(1, 0);
      if (hit.up) move(0, -1);
      if (hit.down) move(0, 1);
      if (hit.b) return cu.done(null);
      if (hit.a) {
        s.pressKey = s.cur; s.pressT = cu.frame();
        cu.sfx('click');
        if (s.cur === 9) s.code = s.code.slice(0, -1);
        else if (s.cur === 11) {
          if (s.code.length === 4) return cu.done(s.code);
          s.err = cu.frame() + 20; cu.sfx('error');
        } else if (s.code.length < 4) s.code += s.cur === 10 ? '0' : String(s.cur + 1);
      }
    },
  },

  cabinet: {
    draw(cu, t) {
      wallBg();
      box(50, 4, 140, 104, 'bg', 'mid');
      // shelves
      for (let i = 0; i < 3; i++) rect(54, 34 + i * 30, 132, 2, 'dim');
      const S = cu.S;
      const after = S.flags.cabinet && cu.state.open === undefined;
      const shelf = [['i_wetNotes', 70, 12], ['i_microscope', 128, 12], ['i_adapter', 100, 42]];
      for (const [icon, x, y] of shelf) {
        const id = icon.slice(2);
        if (after || cu.state[`took_${id}`]) continue;
        sprite(icon, x, y, 2);
      }
      // the notebook stays
      box(64, 76, 36, 22, 'bg', 'mid');
      for (let i = 0; i < 3; i++) rect(68, 81 + i * 5, 26, 1, 'dim');
      // doors swing open
      const p = after ? 1 : ease(since(cu, 'open') / 24);
      const dw = Math.round(70 * (1 - (Number.isFinite(p) ? p : 0)));
      if (dw > 1) {
        box(50, 4, dw, 104, 'bg', 'hi');
        box(190 - dw, 4, dw, 104, 'bg', 'hi');
        if (dw > 10) { rect(50 + dw - 8, 50, 3, 12, 'hi'); rect(190 - dw + 5, 50, 3, 12, 'hi'); }
      }
    },
  },

  dryer: {
    draw(cu, t) {
      wallBg();
      for (let x = 0; x < W; x += 20) line(x, 0, x, H, 'deep');
      // dryer
      box(84, 2, 72, 30, 'bg', 'hi');
      text('DRY-O-MATIC', 88, 8, 'dim');
      rect(110, 32, 20, 6, 'mid');
      const d = since(cu, 'dry');
      const p = Math.min(1, d / 110);
      const blowing = d < 120;
      if (blowing) {
        for (let i = 0; i < 6; i++) {
          const x = 104 + i * 6, y0 = 40 + ((t * 4 + i * 9) % 18);
          line(x, y0, x, y0 + 5, 'mid');
        }
      }
      // the notes, fluttering under the air
      const flutter = blowing ? 2 : 0.4;
      const px = 40, py = 56, pw = 160, ph = 50;
      for (let y = 0; y < ph; y++) {
        const off = Math.round(Math.sin(t / 5 + y / 6) * flutter);
        rect(px + off, py + y, pw, 1, y === 0 || y === ph - 1 ? 'hi' : 'bg');
        rect(px + off, py + y, 1, 1, 'hi');
        rect(px + off + pw - 1, py + y, 1, 1, 'hi');
      }
      const ready = Number.isFinite(p) ? p : 0;
      if (ready > 0.3) {
        scrawl('EXIT CODE =', px + 8, py + 10, 'hi', 7);
        scrawl('FIRST 4 DIGITS OF PI', px + 8, py + 26, 'hi', 8);
      }
      // ink blots evaporate as it dries
      const blot = Math.round(14 * (1 - ready));
      if (blot > 0) {
        for (let i = 0; i < 5; i++) {
          const bx = px + 18 + i * 28, by = py + 16 + (i % 2) * 14;
          g.fillStyle = PAL.dim;
          ditherRect(bx - 14, by - 10, 30, 22, blot, 'dim');
        }
      }
      if (!Number.isFinite(p)) {
        for (let i = 0; i < 4; i++) {
          const x = px + 20 + i * 38, y = py + ph + ((t + i * 13) % 30);
          rect(x, y, 1, 3, 'mid');
        }
      }
    },
  },

  stall: {
    draw(cu, t) {
      clear();
      for (let x = 0; x < W; x += 24) line(x, 0, x, H, 'deep');
      for (let y = 0; y < H; y += 24) line(0, y, W, y, 'deep');
      scrawl('SHROEDINGER BOTH', 56, 14, 'hi', 11);
      scrawl('RULEZ AND DROOLS', 58, 28, 'hi', 12);
      scrawl('UNTIL U CHECK', 70, 42, 'hi', 13);
      // the box, of course
      box(98, 60, 44, 32, 'bg', 'mid');
      line(98, 60, 110, 52, 'mid'); line(142, 60, 154, 52, 'mid'); line(110, 52, 154, 52, 'mid'); line(154, 52, 154, 84, 'mid'); line(142, 92, 154, 84, 'mid');
      text('?', 116, 72, (t >> 5) % 2 ? 'hi' : 'dim');
      for (let i = 0; i < 7; i++) line(18 + i * 5, 80, 18 + i * 5, 96, 'dim');
      line(14, 90, 54, 84, 'dim');
      scrawl('LAB 4', 186, 86, 'dim', 3);
    },
  },

  window: {
    draw(cu, t) {
      wallBg();
      box(24, 4, 192, 104, 'bg', 'mid');
      rect(27, 7, 186, 98, 'bg');
      for (const [a, b, c] of STARS) {
        const x = 28 + a * 184, y = 8 + b * 70;
        rect(x, y, 1, 1, (t / 20 + c * 10) % 10 < 1 ? 'hot' : c > 0.7 ? 'hi' : 'dim');
      }
      circle(180, 26, 10, 'mid', true);
      circle(184, 23, 9, 'bg', true);
      // dunes
      for (let x = 27; x < 213; x++) {
        const y = 84 + Math.round(Math.sin(x / 17) * 4 + Math.sin(x / 7) * 1.5);
        rect(x, y, 1, 105 - y, 'deep');
        rect(x, y, 1, 1, 'dim');
      }
      line(120, 7, 120, 104, 'mid');
      line(27, 56, 212, 56, 'mid');
      // your reflection
      g.globalAlpha = 0.35 + Math.sin(t / 40) * 0.05;
      sprite('s_down0', 80, 20 + Math.sin(t / 30) * 1.5, 5);
      g.globalAlpha = 1;
    },
  },

  viewfinder: {
    enter(cu) { cu.state.seed = Math.random() * 100; },
    beePos(cu, t) {
      const s = cu.state.seed || 0;
      return [120 + Math.sin(t / 23 + s) * 70 + Math.sin(t / 7) * 8, 52 + Math.cos(t / 31 + s) * 30 + Math.sin(t / 5) * 4];
    },
    draw(cu, t) {
      clear();
      // the hive and flowers, slightly out of focus
      bigTile('hive', 72, 44, 6, 'tilesDim');
      for (let i = 0; i < 5; i++) bigTile('flower', 4 + i * 50, 104 + (i % 2) * 8, 2, 'tilesDim');
      const [bx, by] = CLOSEUPS.viewfinder.beePos(cu, t);
      sprite(`bees${(t >> 2) % 2}`, bx - 24, by - 24, 3);
      // viewfinder furniture
      const c = 'hi';
      for (const [x, y, dx, dy] of [[8, 8, 1, 1], [232, 8, -1, 1], [8, 150, 1, -1], [232, 150, -1, -1]]) {
        line(x, y, x + dx * 14, y, c); line(x, y, x, y + dy * 14, c);
      }
      frame(100, 60, 40, 40, 'mid');
      line(116, 80, 124, 80, 'mid'); line(120, 76, 120, 84, 'mid');
      if ((t >> 4) % 2) circle(20, 20, 3, 'hot', true);
      text('REC', 28, 16, 'hi');
      text('A: SHOOT  B: CANCEL', 44, 140, 'dim');
      box(206, 14, 18, 8, 'bg', 'dim'); rect(208, 16, 10, 4, 'mid');
    },
    update(cu, { hit }) {
      if (hit.b) return cu.done(null);
      if (hit.a) {
        const [bx, by] = CLOSEUPS.viewfinder.beePos(cu, cu.t());
        cu.flash();
        cu.done(Math.abs(bx - 120) < 22 && Math.abs(by - 80) < 22);
      }
    },
  },

  ray: {
    draw(cu, t) {
      wallBg();
      // emitter overhead
      box(96, 0, 48, 20, 'bg', 'mid');
      ellipse(120, 22, 14, 4, 'hi');
      // platform
      ellipse(120, 96, 56, 12, 'bg');
      ellipse(120, 96, 56, 12, 'mid', false);
      ellipse(120, 96, 44, 9, 'dim', false);
      sprite(cu.state.usb ? 'i_usb' : 'i_chris', 104, 60, 2);
      const c = since(cu, 'charge');
      if (c < Infinity) {
        const p = Math.min(1, c / 60);
        ditherRect(106, 24, 28, 70, Math.round(p * 12), 'hi');
        for (let i = 0; i < 4; i++) {
          const k = ((c * 2 + i * 12) % 48) / 48;
          ellipse(120, 24 + k * 72, 10 + k * 40, 3 + k * 8, 'hi', false);
        }
        if (c > 60 && c < 64) cu.flash();
      }
    },
  },

  board: {
    draw(cu, t) {
      wallBg();
      box(14, 6, 212, 100, 'deep', 'mid');
      frame(17, 9, 206, 94, 'dim');
      scrawl('DO IT AGAIN,', 28, 18, 'hi', 21);
      scrawl('BUT WRITE IT DOWN', 28, 32, 'hi', 22);
      scrawl('THIS TIME.', 28, 46, 'hi', 23);
      // an atom, obviously
      circle(180, 66, 3, 'hi', true);
      ellipse(180, 66, 26, 8, 'mid', false);
      ellipse(180, 66, 8, 22, 'mid', false);
      const a = t / 20;
      circle(180 + Math.cos(a) * 26, 66 + Math.sin(a) * 8, 2, 'hot', true);
      scrawl('E = ?', 40, 76, 'dim', 24);
      rect(30, 102, 20, 3, 'hot');
    },
  },

  note: {
    enter(cu) { cu.state.cur = 0; },
    draw(cu, t) {
      clear();
      box(18, 2, 204, 150, 'bg', 'hi');
      for (let y = 14; y < 150; y += 10) rect(20, y, 200, 1, 'deep');
      rect(38, 3, 1, 148, 'dim');
      heart(204, 16, 2, 'mid');
      const q = cu.state.q ?? 0;
      const opts = ['YES', 'NO', 'MAYBE'];
      const row = (label, y, ans, active, seed) => {
        scrawl(label, 46, y, 'hi', seed);
        opts.forEach((o, i) => {
          const x = 46 + i * 58;
          frame(x, y + 16, 10, 10, 'hi');
          scrawl(o, x + 14, y + 17, 'mid', seed + i);
          if (ans === i) check(x + 1, y + 17, 'hot');
          if (active && i === cu.state.cur && (t >> 3) % 2) frame(x - 2, y + 14, 14, 14, 'hot');
        });
      };
      row('DO YOU LIKE STRING THEORY?', 12, cu.state.a1, cu.interactive && q === 0, 31);
      if (q >= 1) row('DO YOU LIKE ME?', 56, cu.state.a2, cu.interactive && q === 1, 41);
    },
    update(cu, { hit }) {
      if (hit.left || hit.up) { cu.state.cur = (cu.state.cur + 2) % 3; cu.sfx('select'); }
      if (hit.right || hit.down) { cu.state.cur = (cu.state.cur + 1) % 3; cu.sfx('select'); }
      if (hit.a) { cu.sfx('confirm'); cu.done(cu.state.cur); }
    },
  },
};
