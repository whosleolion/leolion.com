// Headless check for src/building/madison: boots on a phone-sized touch viewport, starts, walks with the
// touch stick, looks, cycles the light, flies up to the overview. Exits non-zero on any failure.
//   NODE_PATH=$(npm root -g) node tools/madison/playtest.mjs [shotsDir]
import { createRequire } from 'module';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'building', 'madison'), shots = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); }).listen(0);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errs = [], fails = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', e => errs.push(e.message));
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.jpg'), type: 'jpeg', quality: 80 }); };
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__madison, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => ({ ...window.__madison.street.counts, tris: window.__madison.renderer.info.render.triangles }));
check(info.trees > 300 && info.cars > 300 && info.tris > 200000, `world built: ${JSON.stringify(info)}`);
await shot('title');
await page.tap('#go'); await page.waitForFunction(() => window.__madison.mode === 'walk', null, { timeout: 60000 });
const p0 = await page.evaluate(() => ({ ...window.__madison.P }));
const cdp = await page.context().newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
await touch('touchStart', [[90, 650, 1]]); await touch('touchMove', [[90, 610, 1]]);
await touch('touchStart', [[90, 610, 1], [300, 400, 2]]);
for (let i = 1; i <= 8; i++) { await touch('touchMove', [[90, 610, 1], [300 + i * 10, 400, 2]]); await page.waitForTimeout(40); }
await page.waitForTimeout(2500); await shot('walk'); await touch('touchEnd', []);
const p1 = await page.evaluate(() => ({ ...window.__madison.P }));
check(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1, `touch stick walks (${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m)`);
check(Math.abs(p1.yaw - p0.yaw) > .2, 'right-thumb drag turns the view');
check(!(await page.evaluate(() => { const m = window.__madison; return !!m.city.buildingAt(m.P.x, m.P.z); })), 'player is not inside a building');
check(await page.evaluate(() => document.getElementById('street').textContent.length > 3), 'street chip names a street');
await page.tap('#bTime'); await page.waitForTimeout(2500);
check(await page.evaluate(() => window.__madison.sky.name) === 'night', 'time-of-day button cycles to night'); await shot('night');
await page.tap('#bView'); await page.waitForFunction(() => window.__madison.mode === 'orbit', null, { timeout: 60000 }); await shot('overview');
check(true, 'overview reached');
check(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
await browser.close(); srv.close();
process.exit(fails.length ? 1 : 0);
