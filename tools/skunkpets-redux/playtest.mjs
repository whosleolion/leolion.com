// Headless playthrough of Skunkpets Redux, boot to ending, with real mouse
// clicks and drags. Exits non-zero (and says why) if anything is off.
//   cd <dir with playwright installed> && node playtest.mjs [url] [shotsDir]
// Serves nothing itself: build first, then point it at a running copy, e.g.
//   node tools/skunkpets-redux/build.js
//   (cd src && python3 -m http.server 8765)  then url = http://localhost:8765/building/skunkpets-redux/
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8765/building/skunkpets-redux/';
const SHOTS = process.argv[3] || null;
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
await p.goto(URL);

const W = (ms) => p.waitForTimeout(ms);
const shot = async (name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png` }); };
const center = async (sel) => {
  const el = p.locator(sel).first();
  await el.waitFor({ state: 'visible', timeout: 8000 });
  const r = await el.boundingBox();
  return [r.x + r.width / 2, r.y + r.height / 2];
};
const click = async (sel) => { const [x, y] = await center(sel); await p.mouse.click(x, y); await W(300); };
const dbl = async (sel) => { const [x, y] = await center(sel); await p.mouse.dblclick(x, y); await W(400); };
const drag = async (from, to) => {
  await p.mouse.move(...from); await p.mouse.down();
  await p.mouse.move(from[0] + 10, from[1] + 10, { steps: 3 });
  await p.mouse.move(...to, { steps: 12 }); await p.mouse.up(); await W(400);
};
// Click a link by its text, scrolled into view first (clicks its last line of text).
const go = async (sel, text) => {
  const el = p.locator(sel).filter({ hasText: text }).first();
  await el.scrollIntoViewIfNeeded();
  const r = await el.evaluate((e) => { const rs = e.getClientRects(); const q = rs[rs.length - 1]; return { x: q.x + Math.min(12, q.width / 2), y: q.y + q.height / 2 }; });
  await p.mouse.click(r.x, r.y); await W(450);
};
const type = async (sel, text) => { await click(sel); await p.keyboard.type(text); };
const text = (sel) => p.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const pageTitle = () => text('.panel[data-window-template="browser"] .panel-title');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};

// Boot
await click('.startbutton');
await p.locator('.monitor').waitFor();
await W(1800);
const icons = await p.$$eval('.desktop-icon', (e) => e.map((i) => i.dataset.windowTemplate).join(','));
check('boot: only READ_ME and Trash on the desktop', icons === 'readme,recycle', icons);
check('boot: no popup', (await p.locator('.xp-dialog').count()) === 0);
await shot('01-boot');

// READ_ME
await dbl('.desktop-icon[data-window-template="readme"]');
check('READ_ME opens', (await text('.notepad-text')).includes('refurbished'));

// Trash: restore everything
await dbl('.desktop-icon[data-window-template="recycle"]');
const trash = await p.$$eval('.bin-icon', (e) => e.map((x) => x.dataset.app).sort().join(','));
check('Trash holds the apps', trash === 'browser,diskette,mail,notes', trash);
await drag(await center('.bin-icon[data-app="browser"]'), [260, 650]);
await drag(await center('.bin-icon[data-app="mail"]'), [360, 650]);
await drag(await center('.bin-icon[data-app="notes"]'), [460, 650]);
await drag(await center('.bin-icon[data-app="diskette"]'), [560, 650]);
check('Trash emptied', (await p.locator('.recycle-empty').count()) === 1);
const onGrid = await p.$$eval('.desktop-icon', (e) => e.every((i) => (parseFloat(i.style.left) - 26) % 92 === 0 && (parseFloat(i.style.top) - 22) % 94 === 0));
check('icons snapped to the grid', onGrid);
await click('.panel[data-window-template="recycle"] .panel-close');
await click('.panel[data-window-template="readme"] .panel-close');
await shot('02-restored');

// Mail starts empty
await dbl('.desktop-icon[data-window-template="mail"]');
check('inbox empty', (await text('.mail-list')) === 'Your inbox is empty');
await click('.panel[data-window-template="mail"] .panel-close');

// Diskette
await dbl('.desktop-icon[data-window-template="diskette"]');
check('Diskette greets', (await text('.diskette-bubble')).includes("I'm Diskette"));
await go('.diskette-options tw-link', 'Browse');
check('Diskette explains Browse', (await text('.diskette-bubble')).includes('web browser'));
await shot('03-diskette');
await go('.diskette-options tw-link', 'Thanks, Diskette!');
check('Diskette closes', (await p.locator('.diskette-bubble').count()) === 0);

// Browser, bookmarks, Winkipedia search
await dbl('.desktop-icon[data-window-template="browser"]');
await click('.browser-star');
await go('.bookmark-row tw-link', 'Skunkpets.com');
check('Skunkpets.com is a 404', (await text('.browser-page-content')).includes('404 Not Found'));
await click('.browser-star');
await go('.bookmark-row tw-link', 'Winkipedia');
await type('#winki-search-input', '  tom BARRY ');
await p.keyboard.press('Enter'); await W(500);
check('search finds an article by exact name', (await pageTitle()) === 'Tom Barry');
await click('.browser-btn[title="Back"]');
await type('#winki-search-input', 'Forum: Hacked');
await p.keyboard.press('Enter'); await W(500);
check('search skips non-article pages', (await text('#winki-msg')).includes('does not have an article'));
await p.locator('#winki-search-input').fill('');
await type('#winki-search-input', 'skunkpets.com');
await p.keyboard.press('Enter'); await W(500);
check('"skunkpets.com" opens the Skunkpets article', (await text('.browser-page-content h1')).includes('SkunkPets'));

// Story path to the ending
await go('.browser-page-content tw-link', '2004 NetCon');
await go('.browser-page-content tw-link', 'Global Games Archive');
await type('#gga-search-input', 'kraska');
await p.keyboard.press('Enter'); await W(500);
check('games archive search finds kraska1', (await pageTitle()) === 'kraska1');
await go('.browser-page-content tw-link', 'devlink-userbase');
await go('.xp-dialog-buttons tw-link', 'OK');
await type('#devlink-username', 'bruce1');
await type('#devlink-password', 'thegoldwoman');
await p.keyboard.press('Enter');
await p.locator('.xp-dialog').waitFor({ timeout: 8000 });
check('post-login email arrives', (await text('.xp-dialog-msg')).includes('new email'));
await go('.xp-dialog-buttons tw-link', 'Open Now');
await go('.mail-summary tw-link', 'stop');
await go('.mail-body tw-link', 'game over');
await W(8000);
check('ending card', (await text('.endcard')).includes('THANK YOU FOR PLAYING'));
await shot('04-ending');

const twErrors = await p.$$eval('tw-error', (e) => e.map((x) => x.textContent.slice(0, 120)));
check('no Harlowe errors', twErrors.length === 0, twErrors.join(' | '));
check('no script errors', errs.length === 0, errs.join(' | '));

await b.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
