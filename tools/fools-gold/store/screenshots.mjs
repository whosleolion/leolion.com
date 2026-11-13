// Makes App Store screenshots from the real app. Usage: node tools/fools-gold/store/screenshots.mjs http://localhost:8765/index.html tools/fools-gold/store/shots
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/index.html', out = process.argv[3] || 'tools/fools-gold/store/shots';
mkdirSync(out, { recursive: true });
const DEVICES = [
  { id: 'iphone-6.9', w: 440, h: 956, dsf: 3 },     // 1320 x 2868
  { id: 'iphone-6.7', w: 430, h: 932, dsf: 3 },     // 1290 x 2796
];
const b = await chromium.launch();
for (const d of DEVICES) {
  const ctx = await b.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dsf, colorScheme: 'dark', hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(url); await p.waitForTimeout(3800); await p.fill('#q', ''); await p.waitForTimeout(300);
  const shot = async n => { await p.waitForTimeout(500); await p.screenshot({ path: `${out}/${d.id}-${n}.png` }); };
  await shot('1-ask');
  await p.fill('#q', 'buy 5 healing potions in a village'); await shot('2-price');
  await p.fill('#q', ''); await p.click('.plus'); await p.waitForTimeout(300); await shot('3-browse');
  await p.click('button[data-act=sheet-close]').catch(() => {});
  await p.fill('#q', '3 rope, 2 torches, a lantern, 5 rations'); await p.waitForTimeout(400); await p.click('[data-act=cart-offer-add]'); await p.waitForTimeout(500);
  await p.waitForTimeout(2600); await shot('4-cart');
  await p.click('button[data-act=sheet-close]').catch(() => {});
  await p.fill('#q', 'buy a rare enchanted dagger'); await shot('5-magic');
  await p.fill('#q', 'buy a cursed tuning fork'); await shot('6-guess');
  await ctx.close();
}
await b.close(); console.log('wrote screenshots to', out);
