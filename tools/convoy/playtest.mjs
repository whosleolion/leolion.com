// Headless check of Convoy: a GM and two players on separate "devices" against the
// stand-in database. Run: node tools/convoy/playtest.mjs   (add --shots <dir> for screenshots)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // set NODE_PATH to your global node_modules if it is installed globally
import { start } from './mock-rtdb.mjs';

const PORT = 9471, URL_ = `http://localhost:${PORT}/building/convoy/?db=http://localhost:${PORT}&g=test`;
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const server = await start(PORT);
const browser = await chromium.launch();
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`); if (!c) fails++; };
const open = async (w = 1280, h = 860) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: shots ? 2 : 1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  p.on('dialog', d => d.accept());
  await p.goto(URL_);
  return p;
};
const state = p => p.evaluate(() => JSON.parse(JSON.stringify(window.CONVOY.store.state)));
const inv = async (p, h, i) => (await state(p)).inv?.[h]?.[i] || 0;
const wait = (p, ms = 350) => p.waitForTimeout(ms);
const type = async (p, bind, text, enter = true) => { const el = p.locator(`[data-bind="${bind}"]`); await el.click(); await el.fill(text); if (enter) await el.press('Enter'); };

const gm = await open();
await gm.locator('[data-bind="new.name"]').fill('Exodus Fleet');
await gm.click('[data-act="create"]');
await gm.waitForSelector('nav');
let s = await state(gm);
ok(Object.keys(s.holders).length === 4, 'new convoy has 4 tables');
ok(Object.values(s.map.bodies).every(b => b.sector >= 0 && b.sector <= 3), 'starting space is charted');

// GM creates stock; names stack whatever the spelling
await type(gm, 'add.t1', '5 Fuel Cells, 3 ore');
await wait(gm);
await type(gm, 'add.t1', '2 fuel cell');
await type(gm, 'add.t2', '4 fuel, 2 Medkits');
await wait(gm);
s = await state(gm);
ok(Object.keys(s.items).length === 3, `three item types exist (${Object.keys(s.items)})`);
ok(s.inv.t1.fuelcell === 7 && s.inv.t2.fuelcell === 4, 'fuel stacked across spellings and prefix');

// players join on their own devices
const p1 = await open(1024, 768), p2 = await open(820, 1100);
await p1.waitForSelector('[data-act="joinCrew"]');
await p1.click('[data-act="joinCrew"][data-h="t1"]');
await p2.waitForSelector('[data-act="joinCrew"]');
await p2.locator('[data-bind="join.char"]').fill('Mara Voss');
await p2.click('[data-act="joinCrew"][data-h="t2"]');
await wait(p2);
ok(await p1.locator('.card.ship').count() === 1, 'a player sees only their own table');
ok(await p1.locator('[data-bind^="add."]').count() === 0, 'players cannot create stock');
ok(await p1.locator('[data-act="tab"][data-tab="setup"]').count() === 0, 'players have no Setup');

// gift: table 1 -> table 2
await p1.selectOption('[data-bind="to"]', 't2');
await type(p1, 'give', '2 fuel');
await wait(p1);
ok(await inv(gm, 't1', 'fuelcell') === 5 && await inv(gm, 't2', 'fuelcell') === 6, 'gift moved 2 fuel, seen live by the GM');

// cannot give more than you hold
await type(p1, 'give', '99 ore', false);
ok(await p1.locator('[data-act="give"]').isDisabled(), 'over-giving is blocked');
await p1.locator('[data-bind="give"]').fill('');

// trade: Mara (table 2) offers table 1 a medkit for 2 ore; table 1 accepts
await p2.selectOption('[data-bind="from"]', 't2');
await p2.selectOption('[data-bind="to"]', 't1');
await type(p2, 'give', '1 med', false);
await type(p2, 'want', '2 ore');
await p1.waitForSelector('[data-act="accept"]');
ok(true, 'offer appears on the other table without a refresh');
if (shots) await p1.screenshot({ path: `${shots}/player-offer.png` });
await p1.click('[data-act="accept"]');
await wait(p1);
s = await state(gm);
ok(s.inv.t1.medkit === 1 && s.inv.t1.ore === 1 && s.inv.t2.ore === 2 && s.inv.t2.medkit === 1, 'trade swapped both ways');
ok(Object.values(s.trades)[0].status === 'accepted', 'trade is closed');

// a settled trade cannot be settled twice (two screens accepting at once)
const tid = Object.keys(s.trades)[0];
const again = await gm.evaluate(id => window.CONVOY.store.update({ [`trades/${id}/status`]: 'accepted' }), tid);
ok(!again.ok, 'second accept is refused');
// the server refuses a stale overdraw even if the screen thought it was fine
const res = await fetch(`http://localhost:${PORT}/convoy/test.json`, { method: 'PATCH', body: JSON.stringify({ 'inv/t1/ore': { '.sv': { increment: -5 } } }) });
ok(res.status === 401, 'database refuses stock below zero');

// star map
await gm.click('[data-act="tab"][data-tab="map"]');
await p1.click('[data-act="tab"][data-tab="map"]');
const before = await state(gm);
const old = Object.entries(before.map.bodies).find(([, b]) => b.sector === 0);
await gm.click('[data-act="newBody"][data-sec="5"]');
await gm.locator('#bodyName').fill('Haven');
await gm.locator('#bodyName').press('Enter');
await wait(gm);
ok(await p1.locator('.body', { hasText: 'Haven' }).count() === 0, 'uncharted prep is invisible to players');
for (let i = 0; i < 3; i++) { await gm.click('[data-act="advance"][data-n="1"]'); await wait(gm, 250); }
s = await state(gm);
ok(s.map.pos === 3, 'time advanced three sectors');
ok(Object.values(s.map.bodies).some(b => b.sector === 6), 'new space ahead was generated');
ok(Object.values(s.map.bodies).filter(b => b.sector === 5).length === 1, 'hand-made sector was left alone');
ok(await p1.locator('.body', { hasText: 'Haven' }).count() === 1, 'Haven is now on the players’ scanners');
ok(await p1.locator(`.body[data-id="${old[0]}"]`).count() === 0, 'the oldest sector has fallen astern');

if (shots) { await gm.screenshot({ path: `${shots}/gm-map.png` }); await p1.locator('.body', { hasText: 'Haven' }).click(); await p1.screenshot({ path: `${shots}/player-map.png` }); }

// sheets
await gm.click('[data-act="tab"][data-tab="sheets"]');
await p1.click('[data-act="tab"][data-tab="sheets"]');
for (let i = 0; i < 3; i++) await gm.click('[data-k="sh-t1"] [data-act="step"][data-f="hull"][data-n="1"]');
await gm.locator('[data-path="holders/t1/sheet/captain"]').fill('Okafor');
await gm.locator('[data-path="holders/t1/sheet/captain"]').press('Enter');
await wait(gm, 500);
ok((await state(p1)).holders.t1.sheet.hull === 3, 'sheet track syncs');
ok(await p1.locator('[data-path="holders/t1/sheet/captain"]').inputValue() === 'Okafor', 'sheet text shows on the table’s screen');
ok(await p2.evaluate(() => window.CONVOY.me.char) && (await (async () => { await p2.click('[data-act="tab"][data-tab="sheets"]'); await wait(p2); return p2.locator('.sheet').count(); })()) === 2, 'a named player has a character sheet and their table’s');
if (shots) await gm.screenshot({ path: `${shots}/gm-sheets.png` });

// setup: a new sheet field reaches every table
await gm.click('[data-act="tab"][data-tab="setup"]');
await gm.click('[data-act="addField"][data-kind="ship"]');
await wait(gm);
ok(await p1.locator('.sheet .f', { hasText: 'New field' }).count() === 1, 'template change reaches players');
await gm.click('[data-act="tab"][data-tab="hold"]');
await type(gm, 'add.t3', '6 fue', false);
if (shots) await gm.screenshot({ path: `${shots}/gm-hold.png` });

await browser.close(); server.close(); server.closeAllConnections();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
