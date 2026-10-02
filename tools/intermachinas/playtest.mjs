// Headless mechanics check for INTERMACHINAS: real key/mouse events, with
// the sim stepped deterministically through the page's G.advance() hook (so
// it doesn't matter how slowly headless Chromium renders).
// Exits non-zero (and says why) if a mechanic regresses.
//   (cd src && python3 -m http.server 8765) &
//   cd <dir with playwright installed> && node playtest.mjs [url] [shotsDir]
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8765/building/intermachinas/';
const SHOTS = process.argv[3] || null;
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
// deterministic enemy rolls (block chance, cooldowns, strafing) so runs are repeatable
await p.addInitScript(() => { let s = 1234567; Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; });
const errs = [];
p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
p.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });

const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const run = (sec) => p.evaluate((s) => G.advance(s), sec);
const shot = async (name) => {
  if (!SHOTS) return;
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.screenshot({ path: `${SHOTS}/${name}.png` });
};
const S = () => p.evaluate(() => {
  const P = G.player;
  return { state: P.state, action: P.action && P.action.type, x: P.pos.x, y: P.pos.y, z: P.pos.z, hp: P.hp, hidden: P.hidden, synced: G.synced, prompt: P.prompt };
});
const place = (x, y, z, yaw) => p.evaluate(([x, y, z, yaw]) => { G.player.reset({ x, y, z, yaw }); G.cam.reset(yaw); }, [x, y, z, yaw]);
const down = async (...keys) => { for (const k of keys) await p.keyboard.down(k); };
const up = async (...keys) => { for (const k of keys) await p.keyboard.up(k); };
const tap = async (k) => { await p.keyboard.down(k); await run(1 / 30); await p.keyboard.up(k); await run(1 / 30); };
const click = async (button) => { await p.mouse.down({ button }); await run(1 / 30); await p.mouse.up({ button }); await run(1 / 30); };
// freeze / unfreeze enemies for pure traversal tests
const calm = (on) => p.evaluate((on) => { G.enemies.forEach((e) => { e._u = e._u || e.update; e.update = on ? () => {} : e._u; }); }, on);
// run until predicate(state) or timeout; returns [final state, saw-set of states]
async function until(pred, sec, every = 0.05, each) {
  const seen = new Set(); let s;
  for (let t = 0; t < sec; t += every) {
    await run(every); s = await S(); seen.add(s.state);
    if (each) await each(s, t);
    if (pred(s)) break;
  }
  return [s, seen];
}

await p.goto(URL);
await p.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 });
await p.waitForTimeout(800);
await shot('00-title');
check(errs.length === 0, 'boots without errors');
await p.click('#play');
check(await p.evaluate(() => !G.paused), 'play unpauses');
await p.mouse.move(640, 400);

// --- walk + vault ---
await calm(true);
await place(0, 0, -60, 0);
await down('KeyW'); await run(0.7); await up('KeyW');
let s = await S(), seen;
check(s.z > -58 && s.state === 'ground', `walks forward (z=${s.z.toFixed(2)})`);
await place(0, 0, -56, 0);
await down('ShiftLeft', 'KeyW');
[s, seen] = await until((s) => s.z > -50, 2);
await up('ShiftLeft', 'KeyW');
check(seen.has('scripted') && s.z > -51 && s.y < 0.1, `vaults the low wall (z=${s.z.toFixed(2)} y=${s.y.toFixed(2)})`);
await shot('01-vault');

// --- climb a 4 m block and top out ---
await place(7, 0, -61, 0); // block spans z -59..-55
await down('ShiftLeft', 'KeyW');
[s, seen] = await until((s) => s.y > 3.9 && s.state === 'ground', 5);
await up('ShiftLeft', 'KeyW');
check(seen.has('climb'), 'grabs the wall when freerunning into it');
check(s.y > 3.9 && s.state === 'ground', `tops out onto the roof (y=${s.y.toFixed(2)} ${s.state})`);
await shot('02-climbed');

// --- climb the viewpoint tower (28 m) ---
await place(0, 0, -21, 0);
await down('ShiftLeft', 'KeyW');
let top = 0, tt = 0;
[s] = await until((s) => s.state === 'ground' && s.y > 27, 30, 0.1, async (s, t) => {
  top = Math.max(top, s.y); tt = t;
  if (s.state === 'climb' && Math.round(t * 10) % 6 === 0) await tap('Space');
});
await up('ShiftLeft', 'KeyW');
check(s.y > 27, `climbs the viewpoint (max y=${Math.max(top, s.y).toFixed(1)} in ${tt.toFixed(1)}s game time)`);
await shot('03-tower-top');

// --- sync at the perch ---
await place(4.4, 28, -15, Math.PI / 2);
await run(0.1);
s = await S();
check(s.prompt === 'SYNCHRONIZE', `perch offers sync (prompt="${s.prompt}")`);
await tap('KeyF');
await run(1.5); await shot('04-sync');
await run(2.2);
s = await S();
check(s.synced, 'synchronizes');

// --- leap of faith into the hay ---
await place(5.6, 28, -15, Math.PI / 2);
await p.evaluate(() => { G.player.state = 'air'; G.player.peakY = 28; });
await run(2.5);
s = await S();
check(s.hp === 100 && s.state === 'ground' && s.y < 0.5, `leap of faith lands safely (hp=${s.hp} y=${s.y.toFixed(2)})`);
check(s.hidden, 'hidden in the hay');

// --- fall damage from the same height without hay ---
await place(-4.5, 28, -10, 0);
await p.evaluate(() => { G.player.state = 'air'; G.player.peakY = 28; });
await run(2.5);
s = await S();
check(s.hp < 100, `big fall hurts (hp=${s.hp.toFixed(0)})`);

// --- wall run: sprint-jump alongside a building face ---
const wrSpot = await p.evaluate(() => {
  // east face of the (-14,-36) block: x = max.x; run north along it
  const b = G.world.boxes.find((b) => b.min.x < -14 && b.max.x > -14 && b.min.z < -36 && b.max.z > -36 && b.max.y > 4);
  return { x: b.max.x + 0.9, z: b.min.z - 1 };
});
await place(wrSpot.x, 0, wrSpot.z, 0);
await down('ShiftLeft', 'KeyW');
await run(0.45); await tap('Space');
[s, seen] = await until((s) => s.state === 'wallrun', 1.0, 0.03);
await up('ShiftLeft', 'KeyW');
check(seen.has('wallrun'), `wall-runs along a building (states: ${[...seen].join(',')})`);
await run(1.5);

// --- climbing controls: eject + drop ---
await place(13, 0, -62, 0); // 7 m block
await down('KeyW', 'ShiftLeft'); await until((s) => s.state === 'climb', 2); await up('ShiftLeft');
await run(0.3); await up('KeyW');
await down('KeyS'); await tap('Space'); await up('KeyS');
s = await S();
check(s.state === 'air', `S+SPACE ejects off the wall (${s.state})`);
await run(1);

// --- stealth: assassinate an unaware guard from behind ---
await calm(false);
const victim = await p.evaluate(() => {
  const e = G.enemies[1]; // boulevard patrol
  const f = e.forward;
  G.player.reset({ x: e.pos.x - f.x * 1.5, y: e.pos.y, z: e.pos.z - f.z * 1.5, yaw: e.yaw });
  G.cam.reset(e.yaw);
  return 1;
});
await run(0.05);
s = await S();
check(s.prompt === 'ASSASSINATE', `prompt to assassinate from behind (prompt="${s.prompt}")`);
await tap('KeyF');
await run(0.8);
check(await p.evaluate((i) => !G.enemies[i].alive, victim), 'assassination kills');
await shot('05-assassinate');

// --- hiding: crouched in a bush in front of a guard stays hidden ---
const hid = await p.evaluate(() => {
  const bush = G.world.volumes.find((v) => v.kind === 'hide' && v.min.z < -45 && v.max.z > -47);
  const cx = (bush.min.x + bush.max.x) / 2, cz = (bush.min.z + bush.max.z) / 2;
  G.player.reset({ x: cx, y: 0, z: cz, yaw: 0 }); G.player.crouch = true;
  const e = G.enemies[0];
  e.pos.x = cx; e.pos.z = cz + 5; e.yaw = Math.PI; e.def.route = [[cx, cz + 5]]; e.homeYaw = Math.PI;
  return true;
});
await run(3);
s = await S();
const hidState = await p.evaluate(() => G.enemies[0].state);
check(s.hidden && hidState !== 'combat', `crouched in cover stays hidden (hidden=${s.hidden}, guard ${hidState})`);
await p.evaluate(() => { G.player.crouch = false; });
await run(2.5);
check(await p.evaluate(() => G.enemies[0].state !== 'patrol'), `standing up in view gets noticed (guard ${await p.evaluate(() => G.enemies[0].state)})`);

// --- detection: stand in front of a stationary guard ---
await p.evaluate(() => {
  const e = G.enemies[3];
  const f = e.forward;
  G.player.reset({ x: e.pos.x + f.x * 6, y: e.pos.y, z: e.pos.z + f.z * 6, yaw: e.yaw + Math.PI });
  G.cam.reset(e.yaw + Math.PI);
});
let det = false;
for (let i = 0; i < 40 && !det; i++) { await run(0.1); det = await p.evaluate(() => G.enemies[3].state === 'combat'); }
check(det, 'guard detects a player standing in plain view');
await shot('06-detected');

// --- combat: light combos + heavies until a guard drops ---
const before = await p.evaluate(() => G.player.stats.kills);
let killed = false;
for (let i = 0; i < 80 && !killed; i++) {
  await click(i % 4 === 3 ? 'right' : 'left');
  await run(0.12);
  killed = await p.evaluate((b) => G.player.stats.kills > b, before);
  if ((await S()).state === 'dead') break;
}
s = await S();
check(killed, `combat kills a guard (hp left ${s.hp.toFixed(0)})`);
await shot('07-combat');

// --- counter window is offered when a guard winds up ---
const counter = await p.evaluate(() => {
  const e = G.enemies.find((x) => x.alive && x.type === 'guard');
  G.player.reset({ x: e.pos.x, y: e.pos.y, z: e.pos.z - 2, yaw: 0 });
  e.enterCombat(false); e.yaw = Math.PI; e.startAttack('CLUB');
  G.player.updateContext();
  return [G.player.prompt, G.enemies.indexOf(e)];
});
check(counter[0] === 'COUNTER', `counter prompt during wind-up (prompt="${counter[0]}")`);
await tap('KeyF'); await run(0.7);
check(await p.evaluate((i) => !G.enemies[i].alive, counter[1]), 'counter kill lands');

// --- getting hit while climbing knocks you off ---
await p.evaluate(() => {
  G.player.reset({ x: 7, y: 0, z: -61, yaw: 0 });
});
await down('ShiftLeft', 'KeyW'); await until((s) => s.state === 'climb', 2); await up('ShiftLeft', 'KeyW');
await p.evaluate(() => G.player.hurt(5, { x: 7, z: -65 }, 'ranged'));
s = await S();
check(s.state === 'air', `hit on the wall knocks you off (${s.state})`);

// --- target + mission complete ---
await p.evaluate(() => {
  for (const e of G.enemies) { if (e !== G.target) { e.update = () => {}; e.state = 'patrol'; e.pos.x += 40; e.syncRig(); } }
  const t = G.target, f = t.forward;
  G.player.reset({ x: t.pos.x - f.x * 1.5, y: t.pos.y, z: t.pos.z - f.z * 1.5, yaw: t.yaw });
});
await run(0.05); await tap('KeyF'); await run(1);
await p.evaluate(() => { for (const e of G.enemies) if (e !== G.target && e.alive) e.state = 'patrol'; });
await run(3);
const banner = await p.evaluate(() => document.getElementById('banner').textContent);
check(banner === 'MISSION COMPLETE', `killing the target completes the mission (banner="${banner}")`);
await shot('08-complete');

// --- death + retry ---
await p.keyboard.press('KeyR'); await run(0.1);
await p.evaluate(() => G.player.hurt(500, null, 'fall'));
await run(0.1);
check(await p.evaluate(() => document.getElementById('banner').textContent) === 'DESYNCHRONIZED', 'death shows DESYNCHRONIZED');
await p.keyboard.press('KeyR'); await run(0.1);
check(await p.evaluate(() => G.player.hp === 100 && G.player.state === 'ground'), 'R retries');

// --- soak: let the whole city run for a while with the player idle ---
await p.evaluate(() => G.player.reset(G.world.spawn));
await run(20);
check(errs.length === 0, 'no runtime errors' + (errs.length ? ':\n  ' + errs.slice(0, 5).join('\n  ') : ''));
await b.close();
if (fails.length) { console.log(`\n${fails.length} failing`); process.exit(1); }
console.log('\nall good');
