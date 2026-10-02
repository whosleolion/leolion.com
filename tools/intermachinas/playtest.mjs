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

// --- forgiveness: coyote time + jump buffer ---
await place(7, 4, -57, 0);
await p.evaluate(() => { const P = G.player; P.state = 'air'; P.airT = 0.05; P.jumped = false; P.vel.y = -1; });
await tap('Space');
check(await p.evaluate(() => G.player.vel.y > 5), 'coyote time: jump just after leaving an edge');
await run(1.5);
await place(0, 0.45, -60, 0);
await p.evaluate(() => { const P = G.player; P.state = 'air'; P.jumped = true; P.vel.y = -3; P.peakY = 0.45; });
await tap('Space'); // pressed in the air, a few frames before touching down
[s] = await until((s) => s.state === 'air' && s.y > 0.3, 0.6, 0.03);
check(await p.evaluate(() => G.player.vel.y > 0 && G.player.state === 'air'), 'jump buffer: early press jumps on landing');
await run(1.5);

// --- landing roll off the 7 m block while freerunning ---
await place(13, 7, -57, 0);
await down('ShiftLeft', 'KeyW');
let sawRoll = false;
[s] = await until((s) => s.y < 0.1 && s.state === 'ground' && s.action !== 'roll', 3, 0.03, (s) => { if (s.action === 'roll') sawRoll = true; });
await up('ShiftLeft', 'KeyW');
s = await S();
check(sawRoll && s.hp === 100, `freerun drop rolls out without damage (roll=${sawRoll} hp=${s.hp.toFixed(0)})`);

// --- parkour down: crouch-walk off the 4 m block -> hang on the wall ---
await place(8.3, 4, -56, Math.PI); // facing the south edge (z=-59), beside the roof crate
await p.evaluate(() => { G.player.crouch = true; });
await down('KeyW');
[s, seen] = await until((s) => s.state === 'climb', 3);
await up('KeyW');
check(s.state === 'climb' && s.y > 1.5 && s.y < 3, `parkour down hangs from the edge (state ${s.state}, y=${s.y.toFixed(2)})`);
// fast-climb back up with shift
await down('ShiftLeft', 'KeyW');
[s] = await until((s) => s.state === 'ground' && s.y > 3.9, 2);
await up('ShiftLeft', 'KeyW');
check(s.y > 3.9, 'fast-climbs back up');

// --- climbing wraps around an outside corner ---
await place(7, 0, -61, 0);
await down('KeyW'); await down('Space'); await run(0.1); await up('Space');
await until((s) => s.state === 'climb', 1);
await up('KeyW');
const n0 = await p.evaluate(() => ({ ...G.player.cl }));
await down('KeyD');
await until(() => false, 2.2, 0.1);
await up('KeyD');
const n1 = await p.evaluate(() => ({ ...G.player.cl, state: G.player.state }));
check(n1.state === 'climb' && (n1.nx !== n0.nx || n1.nz !== n0.nz), `climb wraps the corner (normal ${n0.nx},${n0.nz} -> ${n1.nx},${n1.nz})`);
await p.keyboard.down('KeyC'); await run(0.05); await p.keyboard.up('KeyC'); await run(1.5);

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

// --- chain kill: right after an assassination, F again dashes to the next unaware guard ---
const chained = await p.evaluate(() => {
  const a = G.enemies[7], b = G.enemies[8]; // market-street patrols
  b.pos.x = a.pos.x + 5; b.pos.z = a.pos.z; b.pos.y = a.pos.y; b.yaw = 0; b.state = 'patrol'; b.awareness = 0; b.syncRig();
  a.yaw = 0; a.state = 'patrol'; a.awareness = 0;
  G.player.reset({ x: a.pos.x, y: a.pos.y, z: a.pos.z - 1.5, yaw: 0 });
  return [G.enemies.indexOf(a), G.enemies.indexOf(b)];
});
await run(0.02); await tap('KeyF'); await run(0.7);
s = await S();
check(s.prompt === 'CHAIN KILL', `chain prompt after an assassination (prompt="${s.prompt}")`);
await tap('KeyF'); await run(0.8);
check(await p.evaluate(([a, b]) => !G.enemies[a].alive && !G.enemies[b].alive, chained), 'chain kill lands');

// --- whistle lures a guard ---
const lured = await p.evaluate(() => {
  const e = G.enemies.find((x) => x.alive && x.type === 'guard' && x.state === 'patrol');
  G.player.reset({ x: e.pos.x + 7, y: e.pos.y, z: e.pos.z, yaw: 0 });
  return G.enemies.indexOf(e);
});
await tap('KeyV');
check(await p.evaluate((i) => G.enemies[i].state === 'investigate', lured), 'whistle pulls a guard to investigate');

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

check(await p.evaluate(() => G.player.stats.bestCombo >= 2), `combo builds while fighting (best ×${await p.evaluate(() => G.player.stats.bestCombo)})`);

// --- posture: battering a guard's block breaks it, then F executes ---
const broke = await p.evaluate(() => {
  const e = G.enemies.find((x) => x.alive && x.type === 'guard');
  G.player.reset({ x: e.pos.x, y: e.pos.y, z: e.pos.z - 1.8, yaw: 0 });
  e.enterCombat(false); e.yaw = Math.PI; e.attack = null; e.blockT = 1;
  let r, n = 0;
  while (n++ < 10 && r !== 'break') r = e.takeHit(1, { dx: 0, dz: 1, knock: 0, posture: 0.18 });
  G.player.updateContext();
  return [r, G.player.prompt, G.enemies.indexOf(e)];
});
check(broke[0] === 'break' && broke[1] === 'EXECUTE', `blocked hits break posture -> EXECUTE (${broke[0]}, prompt "${broke[1]}")`);
await tap('KeyF'); await run(0.9);
check(await p.evaluate((i) => !G.enemies[i].alive, broke[2]), 'execution kills');

// --- last-known-position ghost appears when hunters lose sight of you ---
const ghostShown = await p.evaluate(() => {
  const e = G.enemies.find((x) => x.alive && x.type === 'guard');
  G.player.reset({ x: e.pos.x, y: e.pos.y, z: e.pos.z - 4, yaw: 0 });
  e.enterCombat(false);
  G.advance(0.2);
  G.player.hidden = true; const sp = e.seePlayer; e.seePlayer = () => 0; // break line of sight
  G.advance(1);
  const v = G.scene.children.some((o) => o.visible && o.children.length && o.children[0].children.length && o.traverse && (() => { let g = false; o.traverse((m) => { if (m.material && m.material.opacity < 0.4 && m.material.isMeshBasicMaterial && (m.isSkinnedMesh || m.geometry.type === 'BoxGeometry') && m.parent && m.parent.parent) g = true; }); return g; })());
  e.seePlayer = sp;
  return v;
});
check(ghostShown, 'last-known-position ghost shows after losing sight');

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
