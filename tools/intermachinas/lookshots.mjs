// In-game character look screenshots for INTERMACHINAS (crowd, climb, telegraph, posture break,
// dead guard, last-known-position ghost). Stages each moment through the sim, then freezes the
// frame (G.manual) and frames it with a hand-placed camera, HUD hidden.
//   (cd src && python3 -m http.server 8765) &
//   cd <dir with playwright installed> && node lookshots.mjs [url] [outDir]
// The lineup / turnaround shots come from lookdev.html (serve the repo root for that one).
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8765/building/intermachinas/';
const OUT = process.argv[3] || '.';
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.addInitScript(() => { let s = 1234567; Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(URL);
await p.waitForFunction(() => window.G && G.player);
await p.click('#play');
await p.addStyleTag({ content: 'body > *:not(#game){display:none !important}' });
const run = (sec) => p.evaluate((s) => G.advance(s), sec);
await p.evaluate(async () => { window.RIG = await import('./js/rig.js'); });
const calm = (on) => p.evaluate((on) => { G.enemies.forEach((e) => { e._u = e._u || e.update; e.update = on ? () => {} : e._u; }); }, on);
const frame = async (name, cam, look) => {
  await p.evaluate(([c, l]) => {
    G.manual = true;
    G.camera.position.set(c[0], c[1], c[2]); G.camera.lookAt(l[0], l[1], l[2]);
    if (c[3]) { G.camera.fov = c[3]; G.camera.updateProjectionMatrix(); }
  }, [cam, look]);
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await p.evaluate(() => { G.manual = false; G.camera.fov = 68; G.camera.updateProjectionMatrix(); });
  console.log('shot', name);
};
await run(1); // let textures land

// ---- 1. a crowd of guards on the street, mid distance
await calm(true);
await p.evaluate(() => {
  const P = G.player; P.reset({ x: 0.5, y: 0, z: -47, yaw: Math.PI }); G.cam.reset(Math.PI);
  const { Poses } = RIG;
  const pick = ['guard', 'guard', 'bodyguard', 'guard', 'sentry', 'guard', 'guard', 'bodyguard', 'guard', 'target'];
  const used = new Set();
  const spots = [[-2.2, -38], [-0.8, -37.2], [0.6, -38.4], [2.0, -37.4], [-1.6, -35.6], [0.0, -35.2], [1.6, -35.8], [-0.6, -33.6], [1.0, -33.4], [2.8, -34.6]];
  spots.forEach(([x, z], i) => {
    const e = G.enemies.find((e) => e.alive && e.type === pick[i] && !used.has(e)) || G.enemies.find((e) => e.alive && !used.has(e));
    used.add(e);
    e.pos.x = x; e.pos.y = 0; e.pos.z = z; e.yaw = Math.PI + (i % 3 - 1) * 0.2;
    const pose = i % 3 === 0 ? Poses.run(i * 1.3, 0.25) : i % 3 === 1 ? Poses.look(i * 0.7) : Poses.idle(i);
    e.rig.applyNow(pose); e.syncRig();
  });
});
await frame('crowd', [4.6, 2.5, -44.2], [0.2, 1.2, -36]);

// ---- 2. the player climbing a 4 m block
await calm(true);
await p.evaluate(() => { G.player.reset({ x: 7, y: 0, z: -61, yaw: 0 }); G.cam.reset(0); });
await p.keyboard.down('ShiftLeft'); await p.keyboard.down('KeyW');
for (let i = 0; i < 40; i++) { await run(0.05); const s = await p.evaluate(() => [G.player.state, G.player.pos.y]); if (s[0] === 'climb' && s[1] > 1.4) break; }
await p.keyboard.up('ShiftLeft'); await p.keyboard.up('KeyW');
await run(1 / 60);
const pc = await p.evaluate(() => [G.player.pos.x, G.player.pos.y, G.player.pos.z]);
await frame('climb', [pc[0] - 2.0, pc[1] + 0.6, pc[2] - 1.5], [pc[0], pc[1] + 1.1, pc[2] + 0.2]);

// ---- 3. combat in a clear plaza: a guard winding up (red telegraph) on the player
const AX = -30, AZ = -56; // empty floor west of the tutorial plaza
const only = (idx) => p.evaluate((idx) => G.enemies.forEach((e, i) => { e.rig.root.visible = idx.includes(i); }), idx);
await calm(false);
const fight = await p.evaluate(([AX, AZ]) => {
  const e = G.enemies.find((x) => x.alive && x.type === 'guard' && x.state === 'patrol');
  e.pos.x = AX; e.pos.y = 0; e.pos.z = AZ + 2.2; e.yaw = Math.PI;
  G.enemies.forEach((o) => { if (o !== e) { o._u = o._u || o.update; o.update = () => {}; } });
  G.player.reset({ x: AX, y: 0, z: AZ, yaw: 0 }); G.cam.reset(0);
  e.enterCombat(false);
  return G.enemies.indexOf(e);
}, [AX, AZ]);
await only([fight]);
for (let i = 0; i < 150; i++) {
  await run(1 / 30);
  const st = await p.evaluate((i) => { const e = G.enemies[i]; return e.attack ? e.attack.phase + ':' + e.attack.t.toFixed(2) : ''; }, fight);
  if (st.startsWith('windup') && parseFloat(st.split(':')[1]) > 0.3) break;
}
const fc = await p.evaluate((i) => { const e = G.enemies[i]; e.rig.flash(0xcc0000, true); const P = G.player; return [e.pos.x, e.pos.y, e.pos.z, P.pos.x, P.pos.z]; }, fight);
await calm(true);
const mid = () => [(fc[0] + fc[3]) / 2, (fc[2] + fc[4]) / 2];
{ const [mx, mz] = mid(); await frame('telegraph', [mx + 3.4, 1.6, mz - 1.0], [mx, 1.05, mz]); }

// ---- 4. posture broken (gold flash)
await p.evaluate((i) => {
  const e = G.enemies[i]; e.cancelAttack(); e.breakGuard();
  e.rig.applyNow(RIG.Poses.broken(0.3)); e.rig.flash(0x806000, true); e.syncRig();
  G.player.rig.applyNow(RIG.Poses.stance());
}, fight);
{ const [mx, mz] = mid(); await frame('posture-broken', [mx + 3.2, 1.5, mz + 1.4], [mx, 1.0, mz]); }

// ---- 5. dead guard
await p.evaluate((i) => {
  const e = G.enemies[i]; e.rig.flash(0, false); e.die('assassinate');
  for (let k = 0; k < 60; k++) e.rig.apply(RIG.Poses.dead(), 1 / 30, 7);
  e.syncRig();
  G.player.rig.applyNow(RIG.Poses.idle(0));
}, fight);
await frame('dead-guard', [fc[0] + 2.3, 1.7, fc[2] + 1.4], [fc[0], 0.25, fc[2] - 0.2]);

// ---- 6. last-known-position ghost: a hunter loses sight, the player slips away
await p.evaluate(() => G.enemies.forEach((e) => { if (e._u) e.update = e._u; }));
const gh = await p.evaluate(([AX, AZ]) => {
  const e = G.enemies.find((x) => x.alive && x.type === 'guard');
  G.enemies.forEach((o) => { if (o !== e) o.update = () => {}; });
  e.pos.x = AX + 1; e.pos.y = 0; e.pos.z = AZ + 6; e.yaw = Math.PI;
  G.player.reset({ x: AX, y: 0, z: AZ, yaw: 0.6 });
  e.enterCombat(false);
  G.advance(0.2);
  const P = G.player, g0 = [P.pos.x, P.pos.y, P.pos.z];
  P.hidden = true; e.seePlayer = () => 0;
  G.advance(0.5);
  P.reset({ x: AX - 3.2, y: 0, z: AZ - 1.5, yaw: -1.2 }); P.crouch = true; P.hidden = true;
  G.advance(0.6);
  e.pos.x = AX + 1.2; e.pos.z = AZ + 4.5; e.yaw = Math.PI + 0.3; e.syncRig();
  return { g: g0, e: G.enemies.indexOf(e) };
}, [AX, AZ]);
await calm(true);
await only([gh.e]);
await frame('ghost', [AX + 3.5, 2.2, AZ - 5], [AX - 0.6, 0.9, AZ + 0.5]);

await b.close();
