// In-game pose sequences for INTERMACHINAS: drives the real sim (keys + G.advance) through
// moves and captures frames from a side camera, so Player.animate()'s layering, blend rates,
// cloth chains and foot contact are judged as they actually play. Rows are stacked into JPEG
// contact sheets by stack-sheets.py (game-*.jpg).
//   (cd src && python3 -m http.server 8792) &
//   node seqshots.mjs http://localhost:8792/building/intermachinas/ <rowsDir>
import { chromium } from 'playwright';
const URL = process.argv[2], OUT = process.argv[3];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.addInitScript(() => { let s = 1234567; Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(URL);
await p.waitForFunction(() => window.G && G.player);
await p.click('#play');
await p.addStyleTag({ content: 'body > *:not(#game){display:none !important}' });
await p.evaluate(() => { G.manual = true; G.advance(1); });
const run = (s) => p.evaluate((s) => G.advance(s), s);
const down = async (...k) => { for (const x of k) await p.keyboard.down(x); };
const up = async (...k) => { for (const x of k) await p.keyboard.up(x); };
const calm = (on) => p.evaluate((on) => G.enemies.forEach((e) => { e._u = e._u || e.update; e.update = on ? () => {} : e._u; }), on);
const place = (x, y, z, yaw) => p.evaluate(([x, y, z, yaw]) => { G.player.reset({ x, y, z, yaw }); G.cam.reset(yaw); }, [x, y, z, yaw]);
// camera on the player's left, fixed side vector for the row
let side = null;
async function frame(i, name, dist = 3.6, h = 0.95, zoomOut = 1) {
  await p.evaluate(([dist, h, side]) => {
    const P = G.player, yaw = side ?? P.yaw;
    const lx = Math.cos(yaw), lz = -Math.sin(yaw);
    G.camera.position.set(P.pos.x + lx * dist, P.pos.y + h + 0.25, P.pos.z + lz * dist);
    G.camera.lookAt(P.pos.x, P.pos.y + h, P.pos.z);
    G.camera.fov = 40; G.camera.updateProjectionMatrix();
  }, [dist * zoomOut, h, side]);
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.screenshot({ path: `${OUT}/${name}-${i}.png`, clip: { x: 440, y: 90, width: 400, height: 560 } });
}
// capture n frames, stepping `step` seconds of sim between them (optional per-step callback)
async function seq(name, n, step, each, opts = {}) {
  side = await p.evaluate(() => G.player.yaw);
  for (let i = 0; i < n; i++) {
    if (each) await each(i);
    await frame(i, name, opts.dist, opts.h);
    await run(step);
  }
  console.log('seq', name);
}
await calm(true);
const AX = -30, AZ = -63; // open floor west of the tutorial plaza (runs north)

// run, sprint (with flow), crouch-stalk
await place(AX, 0, AZ, 0); await down('KeyW'); await run(0.8);
await seq('g-run', 8, 0.06); await up('KeyW');
await place(AX, 0, AZ, 0); await p.evaluate(() => { G.player.flow = 1; }); await down('ShiftLeft', 'KeyW'); await run(0.9);
await seq('g-sprint', 8, 0.05); await up('ShiftLeft', 'KeyW');
await place(AX, 0, AZ, 0); await p.evaluate(() => { G.player.crouch = true; }); await down('KeyW'); await run(0.8);
await seq('g-stalk', 8, 0.12); await up('KeyW'); await p.evaluate(() => { G.player.crouch = false; });
// jump -> land
await place(AX, 0, AZ, 0); await down('KeyW'); await run(0.6);
await seq('g-jump', 8, 0.1, async (i) => { if (i === 1) { await p.keyboard.down('Space'); await run(1 / 30); await p.keyboard.up('Space'); } });
await up('KeyW');
// hard drop -> three-point landing
await place(AX, 6, AZ, 0); await p.evaluate(() => { const P = G.player; P.state = 'air'; P.peakY = 6; P.vel.y = -6; });
await run(0.45);
await seq('g-drop', 8, 0.06, null, { h: 0.7 });
// freerun drop -> roll
await place(AX, 4.5, AZ, 0); await p.evaluate(() => { const P = G.player; P.state = 'air'; P.peakY = 4.5; P.vel.y = -6; P.vel.z = 6; P.rollBuf = 1; });
await run(0.2);
await down('ShiftLeft', 'KeyW');
await seq('g-roll', 8, 0.07, async () => p.evaluate(() => { G.player.rollBuf = 1; }), { h: 0.6 });
await up('ShiftLeft', 'KeyW');
// climb a 4 m block
await place(7, 0, -61, 0); await down('ShiftLeft', 'KeyW'); await run(0.5);
await seq('g-climb', 8, 0.14, null, { h: 1.2 }); await up('ShiftLeft', 'KeyW');
// vault the low wall
await place(0, 0, -56.5, 0); await down('ShiftLeft', 'KeyW'); await run(0.25);
await seq('g-vault', 8, 0.07); await up('ShiftLeft', 'KeyW');
// wall-run along a building face
const wr = await p.evaluate(() => { const b = G.world.boxes.find((b) => b.min.x < -14 && b.max.x > -14 && b.min.z < -36 && b.max.z > -36 && b.max.y > 4); return { x: b.max.x + 0.9, z: b.min.z - 1 }; });
await place(wr.x, 0, wr.z - 6, 0); await down('ShiftLeft', 'KeyW'); await run(0.7);
await p.keyboard.down('Space'); await run(1 / 30); await p.keyboard.up('Space'); await run(0.12);
await seq('g-wallrun', 8, 0.08, null, { dist: 4.2 }); await up('ShiftLeft', 'KeyW');
// combat on a calmed guard: L L L, then H, then L L H (launcher)
const gi = await p.evaluate(([AX, AZ]) => {
  const e = G.enemies.find((x) => x.alive && x.type === 'guard');
  e.pos.x = AX; e.pos.y = 0; e.pos.z = AZ + 1.6; e.yaw = Math.PI; e.syncRig(); e.hp = 9999;
  G.player.reset({ x: AX, y: 0, z: AZ, yaw: 0 }); G.cam.reset(0);
  return G.enemies.indexOf(e);
}, [AX, AZ]);
const click = async (btn) => { await p.mouse.down({ button: btn }); await run(1 / 30); await p.mouse.up({ button: btn }); };
await seq('g-combo', 8, 0.12, async (i) => { if (i === 0 || i === 3 || i === 6) await click('left'); });
await run(0.6);
await seq('g-heavy', 8, 0.1, async (i) => { if (i === 0) await click('right'); });
await run(0.6);
await seq('g-launch', 8, 0.11, async (i) => { if (i === 0) await click('left'); if (i === 3) await click('left'); if (i === 5) await click('right'); }, { dist: 4.2 });
await run(0.6);
await seq('g-dodge', 8, 0.06, async (i) => { if (i === 1) { await p.keyboard.down('KeyD'); await p.keyboard.down('KeyQ'); await run(1 / 30); await p.keyboard.up('KeyQ'); await p.keyboard.up('KeyD'); } });
// assassination from behind
await p.evaluate(([gi, AX, AZ]) => { const e = G.enemies[gi]; e.hp = 60; e.pos.x = AX; e.pos.z = AZ + 1.3; e.yaw = 0; e.syncRig(); G.player.reset({ x: AX, y: 0, z: AZ, yaw: 0 }); }, [gi, AX, AZ]);
await run(0.1);
await seq('g-assassinate', 8, 0.09, async (i) => { if (i === 1) { await p.keyboard.down('KeyF'); await run(1 / 30); await p.keyboard.up('KeyF'); } });
await b.close();
