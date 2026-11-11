// Headless smoke test of the real page. Usage: node browser-smoke.mjs <url> <outdir>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/index.html';
const out = process.argv[3] || '.';
const browser = await chromium.launch();
const errors = [];
let failed = 0;
const ok = (n, c, d) => { if (!c) { failed++; console.log('FAIL', n, d ?? ''); } else console.log('ok  ', n); };
const goPage = async (page, p) => { await page.click(`.nrow[data-p="${p}"]`); };
const goBack = async page => { await page.click('.back'); };
const price = page => page.textContent('.pricebtn .num');
for (const [name, vp, scheme] of [['phone-dark', { width: 390, height: 844 }, 'dark'], ['desktop-light', { width: 1100, height: 900 }, 'light']]) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(name + ': ' + m.text()); });
  page.on('pageerror', e => errors.push(name + ': ' + e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.pricebtn');
  ok(name + ' price shown on load', (await price(page)).length > 0);
  ok(name + ' no horizontal overflow', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  ok(name + ' zoom is locked', /user-scalable=no/.test(await page.getAttribute('meta[name=viewport]', 'content')));
  ok(name + ' no footer text', !(await page.$('.foot')));
  ok(name + ' sheet closed by default', await page.isHidden('#sheet'));
  ok(name + ' no info dot or footer, only a gear', !(await page.$('#info')) && !!(await page.$('#gear')));

  // empty state: examples on one line, nothing else
  await page.fill('#q', '');
  const tops = await page.evaluate(() => [...document.querySelectorAll('#tray .sample')].map(b => [b.offsetTop, b.getBoundingClientRect().height]));
  ok(name + ' examples sit on one row', tops.length >= 4 && new Set(tops.map(t => t[0])).size === 1, tops);
  ok(name + ' each example is a single line', tops.every(t => t[1] < 50), tops);
  await page.screenshot({ path: `${out}/${name}-empty.png` });

  // the sentence becomes fields
  await page.fill('#q', 'price for train ride between two major capital cities, 3 days travel expensive');
  await page.waitForSelector('.slot');
  ok(name + ' words are colored by role', (await page.$$('#mirror .tok')).length >= 4);
  ok(name + ' fields list the set values', /3 days/.test(await page.textContent('.fields')) && /expensive/.test(await page.textContent('.fields')));
  ok(name + ' an empty field shows its swing', / to /.test(await page.textContent('[data-id="g:urgency"]')));
  ok(name + ' home fits without scrolling', (await page.evaluate(() => { const m = document.querySelector('#main'); return m.scrollHeight - m.clientHeight; })) <= 4);
  await page.screenshot({ path: `${out}/${name}-1.png` });
  const p0 = await price(page);
  await page.click('[data-act=slot][data-id="g:urgency"]');
  ok(name + ' tapping a field opens its options', await page.isVisible('#tray .o'));
  await page.click('#tray .o >> nth=0');
  const p1 = await price(page);
  ok(name + ' choosing an option changes the price', p0 !== p1, [p0, p1]);
  ok(name + ' the field and the sentence follow', /rush|no rush/.test(await page.textContent('[data-id="g:urgency"]')) && /rush/.test(await page.inputValue('#q')));
  await page.click('[data-act=slot][data-id="g:urgency"]');
  await page.click('#tray .o.sel');
  ok(name + ' choosing the selected option clears it', /not set/.test(await page.textContent('[data-id="g:urgency"]')));
  await page.click('[data-act=slot][data-id=length]');
  await page.click('[data-act=num-open]');
  await page.fill('#numIn', '5'); await page.click('[data-act=num-set]');
  ok(name + ' a custom number sets the field', /5 days/.test(await page.textContent('[data-id=length]')));
  await page.click('[data-act=quick][data-k=rush]');
  ok(name + ' quick Rush toggles the field', /rush/.test(await page.textContent('[data-id="g:urgency"]')));
  await page.click('[data-act=quick][data-k=rush]');
  const nShown = (await page.$$('.fields .slot')).length;
  await page.click('[data-act=more]');
  ok(name + ' more fields expands the list', (await page.$$('.fields .slot')).length > nShown);

  // item picker
  await page.click('[data-act=slot][data-id=item]');
  ok(name + ' item field opens the picker', await page.isVisible('#sheet #flowSearch'));
  await page.fill('#flowSearch', 'coach');
  await page.click('[data-act=pick-item] >> nth=0');
  ok(name + ' picking an item swaps the subject', /Coach/i.test(await page.textContent('.price .what')));
  await page.screenshot({ path: `${out}/${name}-picked.png` });

  // breakdown and factor editing
  await page.fill('#q', 'price for train ride between two major capital cities, 3 days travel expensive');
  await page.click('[data-act=sheet][data-mode=break]');
  ok(name + ' details open the breakdown', await page.isVisible('#sheet .fx'));
  const b0 = await price(page);
  await page.click('[data-act=edit-row][data-key="tier:expensive"]');
  await page.fill('[data-ed=lo]', '1'); await page.fill('[data-ed=hi]', '1.2'); await page.keyboard.press('Tab');
  ok(name + ' editing a factor changes the price', b0 !== (await price(page)));
  ok(name + ' edited flag shows', /edited/.test(await page.textContent('.meta')));
  await page.click('[data-act=ed-reset]');
  ok(name + ' reset restores the price', b0 === (await price(page)));
  await page.click('[data-act=edit-row][data-key="base"]');
  await page.fill('[data-ed=base]', '5 gp'); await page.keyboard.press('Tab');
  ok(name + ' editing the base price changes the result', b0 !== (await price(page)));
  await page.click('[data-act=ed-reset-all]');
  ok(name + ' reset all edits', b0 === (await price(page)));
  await page.screenshot({ path: `${out}/${name}-sheet.png` });
  await page.click('.sheet-x');
  ok(name + ' sheet closes', await page.isHidden('#sheet'));

  await page.fill('#q', 'blak market longsword');
  ok(name + ' suggestion', !!(await page.$('[data-act=fix]')));
  await page.click('[data-act=fix]');
  ok(name + ' suggestion applied', (await page.inputValue('#q')).includes('black market'));
  await page.fill('#q', 'sell sword in capital and village');
  ok(name + ' conflict UI', !!(await page.$('.conflict')));
  await page.click('.conflict [data-act=resolve] >> nth=0');
  ok(name + ' conflict resolved', !(await page.$('.conflict')));

  // settings as pushed pages, worlds, modern
  await page.click('#gear');
  ok(name + ' drawer opens', await page.isVisible('#drawer'));
  ok(name + ' settings root is a short grouped list', (await page.$$('.nrow')).length >= 10 && (await page.$$('.navgroup')).length === 3);
  await goPage(page, 'About');
  ok(name + ' the attribution lives in About', /Creative Commons/.test(await page.textContent('.sbody.page')));
  await goBack(page);
  await goPage(page, 'Appearance');
  await page.click('input[data-bind=theme][value=dark]');
  ok(name + ' theme can be forced dark', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await page.click('input[data-bind=theme][value=light]');
  ok(name + ' theme can be forced light', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  await page.click('input[data-bind=theme][value=system]');
  ok(name + ' match device clears the override', (await page.evaluate(() => document.documentElement.dataset.theme)) === undefined);
  await goBack(page);
  await goPage(page, 'Your worlds');
  await page.click('[data-act=w-select][data-id=modern]');
  await goBack(page);
  await page.click('[data-act=close-world]');
  await page.fill('#q', '6 months of rent in a city');
  ok(name + ' modern world prices in dollars', /^\$[\d,]+/.test(await price(page)), await price(page));
  ok(name + ' rent shows a length in months', /month/.test(await page.textContent('[data-id=length]')));
  await page.screenshot({ path: `${out}/${name}-modern.png` });
  await page.fill('#q', 'buy a laptop');
  await page.click('[data-act=round]');
  ok(name + ' round toggle keeps a price', (await price(page)).startsWith('$'));
  await page.click('[data-act=round]');
  await page.fill('#q', "John's rent is $800 a month");
  ok(name + ' a setting shows a confirmation, not a price', !!(await page.$('.setting')) && !(await page.$('.pricebtn')));
  await page.click('[data-act=s-cancel]');
  ok(name + ' cancel returns to a normal answer', !(await page.$('.setting')));
  await page.fill('#q', '');
  await page.fill('#q', "John's rent is $800 a month");
  await page.click('[data-act=s-set]');
  ok(name + ' set it saves and prices it', (await price(page)).startsWith('$800'), await price(page));
  await page.fill('#q', "6 months of John's rent");
  ok(name + ' saved variable works in a longer question', (await price(page)).replace(/\s/g, '').startsWith('$4,800'), await price(page));

  await page.click('#gear'); await goPage(page, 'Your worlds'); await page.click('[data-act=w-select][data-id=vcm]'); await goBack(page); await page.click('[data-act=close-world]');
  await page.fill('#q', 'a healing potion costs 40 gp here');
  await page.click('[data-act=s-set]');
  ok(name + ' override applies in the world', /^(3[6-9]|4[0-4])/.test(await price(page)), await price(page));

  // unknown word
  await page.fill('#q', '10 monster parts');
  ok(name + ' unknown word shows the card', !!(await page.$('.guess')));
  ok(name + ' best guess is selected with a price and stepper', await page.isVisible('.guess .stepper .num'));
  const g0 = await page.textContent('.guess .stepper .num');
  await page.click('[data-act=g-raise]');
  ok(name + ' raise changes the proposal', g0 !== (await page.textContent('.guess .stepper .num')), g0);
  await page.screenshot({ path: `${out}/${name}-guess.png` });
  await page.click('[data-act=g-set]');
  ok(name + ' save prices the thing', !(await page.$('.guess')) && /Monster parts/i.test(await page.textContent('.price .what')));
  await page.fill('#q', '3 sparkjuice');
  ok(name + ' second unknown word shows the card', !!(await page.$('.guess')));
  await page.fill('#gSearch', 'potion of healing');
  await page.click('.guess .fields .slot >> nth=-1');
  ok(name + ' same-as option offered for a real item', !!(await page.$('[data-act=g-alias]')));
  await page.click('[data-act=g-alias]');
  ok(name + ' alias prices it', /healing/i.test(await page.textContent('.price .what')));

  // hostile import
  let alerts = 0; page.on('dialog', d => { alerts++; d.dismiss(); });
  await page.click('#gear'); await goPage(page, 'Back up and share');
  await page.fill('#importBox', '{"name":"bad","items":[{}]}');
  await page.click('[data-act=w-import]');
  await page.fill('#importBox', '{"id":"i","name":"i","currency":{"denominations":[{"id":"gp","name":"gp","bu":"\\"><img src=x onerror=alert(1)>"}]},"dials":{"priceLevel":"\\"><img src=x onerror=alert(2)>"}}');
  await page.click('[data-act=w-import]');
  await page.click('[data-act=close-world]');
  await page.fill('#q', 'longsword');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#q');
  ok(name + ' hostile import: app still boots after reload', !!(await page.$('#q')));
  ok(name + ' hostile import: no script ran', alerts === 0, alerts);
  await page.click('#gear'); await goPage(page, 'Money');
  await page.focus('[data-bind=note]');
  await page.fill('[data-bind=note]', 'about a dollar'); await page.keyboard.press('Tab');
  ok(name + ' settings page keeps focus after an edit', await page.evaluate(() => document.activeElement && document.activeElement.tagName !== 'BODY'));
  await page.click('[data-act=close-world]');
  await page.fill('#q', 'buy a longsword'); await page.press('#q', 'Enter');
  await page.fill('#q', '');
  ok(name + ' recent list shows on the empty screen, dimmed', !!(await page.$('#history .hrow')) && parseFloat(await page.evaluate(() => getComputedStyle(document.querySelector('#history')).opacity)) < 0.9);
  const nRecent = (await page.$$('#history .hrow')).length;
  await page.click('#history [data-act=hist-del] >> nth=0');
  ok(name + ' a recent search can be removed', (await page.$$('#history .hrow')).length === nRecent - 1 || nRecent === 1);
  if (await page.$('[data-act=hist-clear]')) await page.click('[data-act=hist-clear]');
  ok(name + ' recent searches can be cleared', !(await page.$('#history .hrow')));
  await page.screenshot({ path: `${out}/${name}-2.png` });

  // a saved copy with old files updates itself
  const stale = await ctx.newPage();
  await stale.route('**/version.json*', r => r.fulfill({ contentType: 'application/json', body: '{"v":"deadbeef"}' }));
  await stale.goto(url, { waitUntil: 'load' });
  await stale.waitForURL(/\?v=deadbeef/, { timeout: 8000 }).catch(() => {});
  ok(name + ' stale copy reloads itself when version.json differs', /\?v=deadbeef/.test(stale.url()), stale.url());
  await stale.waitForSelector('#q');
  await stale.waitForTimeout(1200);
  ok(name + ' update reload happens once, never loops', /\?v=deadbeef$/.test(stale.url()));
  await stale.close();
  const fresh = await ctx.newPage();
  let navs = 0; fresh.on('framenavigated', f => { if (f === fresh.mainFrame()) navs++; });
  await fresh.goto(url, { waitUntil: 'load' }); await fresh.waitForTimeout(1200);
  ok(name + ' an up-to-date copy does not reload', navs === 1, navs);
  await fresh.close();
  await ctx.close();
}
await browser.close();
if (errors.length) { console.log('CONSOLE ERRORS', errors); failed++; }
console.log(failed ? failed + ' FAILED' : 'all smoke checks passed');
process.exit(failed ? 1 : 0);
