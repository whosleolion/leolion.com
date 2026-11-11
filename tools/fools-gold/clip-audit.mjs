// Walks the main screens at four widths and text sizes and fails if any button clips its label or leaves the screen.
// Usage: node clip-audit.mjs [url]   (serve src/building/fools-gold first)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
let bad = 0;
for (const [w, size] of [[320, null], [390, null], [390, 'xl'], [390, 'xxl']]) {
  const c = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const p = await c.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto((process.argv[2] || 'http://127.0.0.1:8765/index.html')); await p.waitForSelector('#q'); await p.waitForTimeout(1900);
  if (size) { await p.click('#gear'); await p.click('.nrow[data-p="Appearance"]'); await p.click(`input[data-bind=textsize][value=${size}]`); await p.click('.back'); await p.click('[data-act=close-world]'); }
  const check = async label => {
    const r = await p.evaluate(() => [...document.querySelectorAll('button, .btn, .cta, .cta2')].filter(b => { const r = b.getBoundingClientRect(); const scroller = (() => { for (let e = b.parentElement; e; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; })(); return r.width > 0 && r.height > 0 && (b.scrollWidth > b.clientWidth + 1 || (!scroller && (r.right > document.documentElement.clientWidth + 1 || r.left < -1))); }).slice(0, 4).map(b => (b.textContent || '').trim().slice(0, 24) + ' sw' + b.scrollWidth + '/cw' + b.clientWidth));
    if (r.length) { bad++; console.log(w, size || '-', label, 'CLIPPED', JSON.stringify(r)); }
  };
  await p.fill('#q', '3 rope, 2 torches, sell 2 shortswords in a village'); await p.waitForTimeout(300); await check('main offer');
  await p.click('[data-act=cart-offer-add]'); await p.waitForTimeout(400); await check('cart');
  await p.fill('#cartIn', '4 rope, 2 lanterns, sell 1 chain mail'); await p.click('[data-act=cart-read]'); await p.waitForTimeout(200); await check('cart read'); await p.click('[data-act=cart-read-no]');
  await p.click('[data-act=cart-shop-toggle]'); await check('shop options'); await p.click('[data-act=cart-shop-toggle]');
  await p.click('[data-act=cart-haggle]'); await check('cart haggle'); await p.click('[data-act=cart-haggle]');
  await p.click('[data-act=cart-why]'); await check('math');
  await p.click('.cline >> nth=0 >> .lbl'); await p.waitForTimeout(300); await check('edit bar');
  await p.click('[data-act=haggle-open]'); await check('item haggle'); await p.click('[data-act=haggle-set][data-v="-10"]'); await check('item haggled');
  await p.click('[data-act=cart-cancel]'); await p.click('button[data-act=sheet-close]'); await p.waitForTimeout(200);
  await p.click('#gear'); await p.waitForTimeout(200); await check('settings');
  await p.click('.nrow[data-p=World]'); await check('world');
  for (const tab of ['Money', 'Economy', 'Dials', 'My changes']) { await p.click(`.jump [data-id="${tab}"]`); await check('world ' + tab); }
  await p.click('.wsq'); await check('world sheet');
  await c.close();
}
console.log(bad ? bad + ' clipped' : 'no clipped buttons');
await b.close();
