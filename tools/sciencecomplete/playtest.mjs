// Headless playthrough of Science Complete, start to credits.
//   cd <dir with playwright installed> && node playtest.mjs [url] [shotsDir]
// Serves nothing itself: point it at a running copy, e.g.
//   (cd src && python3 -m http.server 8765) then url = http://localhost:8765/building/sciencecomplete/
// Uses real key presses for everything except hopping between rooms.
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8765/building/sciencecomplete/';
const SHOTS = process.argv[3] || null;
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const p = await b.newPage({ viewport: { width: 1000, height: 760 } });
const errs = [];
p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
await p.goto(URL);
await p.evaluate(() => localStorage.clear());
await p.reload();

const W = (ms) => p.waitForTimeout(ms);
const key = async (k, ms = 40) => { await p.keyboard.down(k); await W(ms); await p.keyboard.up(k); await W(60); };
const shot = async (name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png` }); };
const st = () => p.evaluate(() => {
  const u = SC.ui, cu = SC.closeups[SC.closeups.length - 1];
  return {
    ui: u && u.kind, busy: SC.busy, scene: SC.scene, map: SC.S.map, items: SC.S.items.join(','),
    protons: SC.S.protons, flags: Object.keys(SC.S.flags).join(','),
    cu: cu && cu.name, inter: cu && cu.interactive,
    text: u && u.kind === 'say' ? u.pages.map((x) => (x.who ? `[${x.who}] ` : '') + x.lines.join(' ')).join(' / ')
      : u && u.kind === 'choose' ? `${u.prompt ? u.prompt.lines.join(' ') : ''} [${u.opts.join('|')}]`
        : u && u.kind === 'banner' ? `** ${u.title}: ${u.name}` : '',
  };
});
const log = [];
const note = (s) => { if (s && log[log.length - 1] !== s) log.push(s); };

async function keypad(code) {
  const order = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '<', '0', 'OK'];
  let cur = 0;
  for (const ch of [...code, 'OK']) {
    const t = order.indexOf(ch);
    const dr = ((t / 3) | 0) - ((cur / 3) | 0), dc = (t % 3) - (cur % 3);
    for (let i = 0; i < Math.abs(dr); i++) await key(dr > 0 ? 'ArrowDown' : 'ArrowUp');
    for (let i = 0; i < Math.abs(dc); i++) await key(dc > 0 ? 'ArrowRight' : 'ArrowLeft');
    await key('KeyZ');
    cur = t;
  }
}
async function photograph() {
  for (let i = 0; i < 400; i++) {
    const ok = await p.evaluate(() => {
      const cu = SC.closeups[SC.closeups.length - 1];
      const [x, y] = SC.CLOSEUPS.viewfinder.beePos(cu, cu.t());
      return Math.abs(x - 120) < 10 && Math.abs(y - 80) < 10;
    });
    if (ok) { await key('KeyZ', 16); return; }
    await W(16);
  }
  await key('KeyZ');
}

// answers: choice indices (or -1 for "last option") consumed in order
async function drain(answers = [], max = 200) {
  for (let i = 0; i < max; i++) {
    const s = await st();
    if (!s.ui && !s.busy) return s;
    if (s.ui === 'say' || s.ui === 'banner' || s.ui === 'wait') { note(s.text); await key('KeyZ'); await key('KeyZ'); continue; }
    if (s.ui === 'choose') {
      note(`CHOICE ${s.text}`);
      const n = answers.length ? answers.shift() : 0;
      if (n < 0) await key('ArrowUp'); else for (let j = 0; j < n; j++) await key('ArrowDown');
      await key('KeyZ');
      continue;
    }
    if (!s.ui && s.inter) {
      if (s.cu === 'keypad') { await shot('keypad'); await keypad('3141'); } else if (s.cu === 'viewfinder') { await shot('viewfinder'); await photograph(); } else if (s.cu === 'note') { await shot('note'); const n = answers.length ? answers.shift() : 0; for (let j = 0; j < n; j++) await key('ArrowRight'); await key('KeyZ'); }
      continue;
    }
    await W(80);
  }
  return st();
}
const tp = (m, x, y, dir) => p.evaluate(([m, x, y, dir]) => SC.place(m, x, y, dir), [m, x, y, dir]);
async function act(m, x, y, dir, answers = [], name) {
  await tp(m, x, y, dir);
  await W(120);
  if (name) await shot(`${name}-reticle`);
  await key('KeyZ');
  await W(500);
  if (name) await shot(name);
  return drain(answers);
}
async function walk(k, ms = 220) { await p.keyboard.down(k); await W(ms); await p.keyboard.up(k); await W(1400); }
const expect = (cond, msg) => { if (!cond) { errs.push(`EXPECT FAILED: ${msg}`); } };

await W(900); await shot('boot');
await key('KeyZ'); await W(700); await shot('title');
await key('KeyZ'); await W(900);
await drain();
await shot('lab');
await act('labA', 8, 3, 'up', [1], 'button');
await act('labA', 2, 3, 'up', [], 'tubes');
await act('labA', 1, 1, 'up', [], 'cabinet');
await act('labA', 7, 1, 'up', [0], 'console');
await act('labA', 7, 1, 'up', [0, -1]);
await tp('labA', 9, 7, 'down'); await walk('ArrowDown');
expect((await st()).map === 'labA', 'exit starts locked');
await tp('labA', 1, 7, 'down'); await walk('ArrowDown');
expect((await st()).map === 'bathroom', 'bathroom door');
await act('bathroom', 1, 1, 'up', [], 'dryer');
await act('bathroom', 7, 2, 'up', [], 'stall');
await act('labA', 7, 1, 'up', [0, -1]);
expect((await st()).flags.includes('exit'), 'exit code accepted');
await act('labA', 2, 3, 'up', [], 'microscope');
expect((await st()).items.includes('chris'), 'got chris');
await tp('labA', 9, 7, 'down'); await walk('ArrowDown');
expect((await st()).map === 'hub', 'exit to stairwell');
await shot('hub');
await tp('hub', 2, 1, 'up'); await walk('ArrowUp');
expect((await st()).map === 'deck', 'deck door');
await shot('deck-arrive');
await act('deck', 5, 3, 'up');
await act('deck', 1, 3, 'up', [], 'board');
await tp('deck', 1, 2, 'up'); await W(100); await key('KeyZ'); await drain();
expect((await st()).map === 'classroom', 'hatch memory');
await W(600); await shot('memory');
await act('classroom', 6, 2, 'up', [], 'hatch');
expect((await st()).items.includes('inspiration'), 'got inspiration');
await act('labB', 4, 3, 'up');
expect((await st()).items.includes('beePic'), 'got bee picture');
await tp('breakroom', 2, 1, 'up'); await W(100); await key('KeyZ'); await drain();
expect((await st()).map === 'classroom', 'diane memory');
await act('classroom', 7, 6, 'down', [2, 1]);
expect((await st()).flags.includes('diane'), 'diane done');
await act('breakroom', 4, 3, 'up');
await act('breakroom', 1, 5, 'left');
await act('labA', 7, 1, 'up', [3, -1]);
expect((await st()).items.includes('chain'), 'got chain');
await act('servers', 6, 4, 'up', [0, 0, 0, 0, 0, 0]);
expect((await st()).map === 'hub', 'lost bare-handed');
await act('labC', 5, 3, 'up', [0]);
expect((await st()).map === 'micro', 'shrunk to micro');
await shot('micro');
await act('micro', 3, 3, 'up');
await act('micro', 9, 3, 'up', [0, 1, 2]);
expect((await st()).items.includes('armor') && (await st()).items.includes('blade'), 'bought gear');
await tp('micro', 6, 6, 'down'); await walk('ArrowDown');
expect((await st()).map === 'labC', 'grew back');
await tp('servers', 6, 4, 'up'); await key('KeyZ'); await W(200);
await drain([0, 0], 6); await W(1500); await shot('battle');
await drain([0, 0, 0, 0, 0]);
expect((await st()).flags.includes('slimes'), 'beat slimes');
await act('servers', 6, 2, 'up');
expect((await st()).items.includes('usb'), 'got usb');
await tp('labC', 5, 3, 'up'); await key('Escape'); await W(500); await shot('pause'); await key('Escape'); await W(300);
await key('KeyX'); await W(400); await shot('inventory'); await key('KeyX'); await W(300);
await act('labC', 5, 3, 'up', [1]);
expect((await st()).map === 'net', 'entered the internet');
await shot('net');
await act('net', 13, 2, 'right');
await tp('net', 14, 3, 'right'); await walk('ArrowRight');
await W(2500); await shot('ending');
for (let i = 0; i < 30 && (await st()).scene === 'ending'; i++) {
  if (i === 6) await shot('credits');
  await key('KeyZ'); await W(700);
}
await W(1500);
expect((await st()).scene === 'title', 'back to title after credits');

console.log(log.join('\n'));
console.log(errs.length ? `\nFAILURES:\n${errs.join('\n')}` : '\nPLAYTEST OK');
await b.close();
process.exit(errs.length ? 1 : 0);
