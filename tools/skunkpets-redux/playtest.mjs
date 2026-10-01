// Headless playthrough of Skunkpets Redux, boot to ending, with real mouse
// clicks and drags. Exits non-zero (and says why) if anything is off.
//   cd <dir with playwright installed> && node playtest.mjs [url] [shotsDir]
// Serves nothing itself: build first, then point it at a running copy, e.g.
//   node tools/skunkpets-redux/build.js
//   (cd src && python3 -m http.server 8765)  then url = http://localhost:8765/building/skunkpets/
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8765/building/skunkpets/';
const SHOTS = process.argv[3] || null;
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
const songLoads = [];
const voiceLoads = [];
p.on('response', (r) => {
  if (r.url().endsWith('comfortable-mystery.mp3')) songLoads.push(r.status());
  if (/diskette-hmm-\d\.mp3$/.test(r.url())) voiceLoads.push(r.status());
});
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
  // Plain scrollIntoView: Playwright's version waits for the element to stop
  // moving, which never happens while the Skunkpets zoom is running.
  await el.evaluate((e) => e.scrollIntoView({ block: 'nearest' }));
  const r = await el.evaluate((e) => { const rs = e.getClientRects(); const q = rs[rs.length - 1]; return { x: q.x + Math.min(12, q.width / 2), y: q.y + q.height / 2 }; });
  await p.mouse.click(r.x, r.y); await W(450);
};
const type = async (sel, text) => { await click(sel); await p.keyboard.type(text); };
const text = (sel) => p.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const ZOOM_START = 0.86; // matches ZOOM_START in the game's script
const zoom = () => p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--monitor-zoom')));
const pageTitle = () => text('.panel[data-window-template="browser"] .panel-title');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};

// Boot
const titleButtons = await p.$$eval('.splash-screen button', (e) => e.map((x) => x.textContent));
await click('.startbutton');
await p.locator('.monitor').waitFor();
await W(1800);
const icons = await p.$$eval('.desktop-icon', (e) => e.map((i) => i.dataset.windowTemplate).join(','));
check('boot: only READ_ME and Trash on the desktop', icons === 'readme,recycle', icons);
check('boot: no popup', (await p.locator('.xp-dialog').count()) === 0);
check('boot: monitor starts zoomed out', (await zoom()) === ZOOM_START, String(await zoom()));
check('boot: title screen had no CONTINUE (no save yet)', !titleButtons.includes('CONTINUE'), titleButtons.join(','));

// Volume popup in the tray
await click('.tray-volume');
check('tray speaker opens the volume popup', (await text('.volume-song-name')) === 'No music playing');
await click('.volume-mute-box');
check('mute all sound is remembered', (await p.evaluate(() => JSON.parse(localStorage.getItem('skunkpets-sound')).muted)) === true);
check('tray speaker shows muted', (await p.locator('.tray-volume.muted').count()) === 1);
await click('.volume-mute-box');
await p.mouse.click(640, 300); await W(300);
check('clicking away closes the popup', (await p.locator('.volume-popup').count()) === 0);
await shot('01-boot');

// READ_ME
await dbl('.desktop-icon[data-window-template="readme"]');
check('READ_ME opens', (await text('.notepad-text')).includes('refurbished'));

// Trash: restore everything
await dbl('.desktop-icon[data-window-template="recycle"]');
const trash = await p.$$eval('.bin-icon', (e) => e.map((x) => x.dataset.app).sort().join(','));
check('Trash holds the apps', trash === 'browser,diskette,downloads,mail,notes', trash);
await drag(await center('.bin-icon[data-app="browser"]'), [260, 650]);
await drag(await center('.bin-icon[data-app="mail"]'), [360, 650]);
await drag(await center('.bin-icon[data-app="notes"]'), [460, 650]);
await drag(await center('.bin-icon[data-app="diskette"]'), [560, 650]);
await drag(await center('.bin-icon[data-app="downloads"]'), [660, 650]);
check('Trash emptied', (await p.locator('.recycle-empty').count()) === 1);
const onGrid = await p.$$eval('.desktop-icon', (e) => e.every((i) => (parseFloat(i.style.left) - 26) % 92 === 0 && (parseFloat(i.style.top) - 22) % 94 === 0));
check('icons snapped to the grid', onGrid);
const column = await p.$$eval('.desktop-icon', (e) => e.map((i) => `${i.dataset.windowTemplate}@${parseFloat(i.style.left)},${parseFloat(i.style.top)}`).join(' '));
check('Trash items line up down the first column, in drop order',
  ['readme@26,22', 'browser@26,116', 'mail@26,210', 'notes@26,304', 'diskette@26,398', 'downloads@26,492'].every((x) => column.includes(x)), column);
await click('.panel[data-window-template="recycle"] .panel-close');
await click('.panel[data-window-template="readme"] .panel-close');

// Downloads: a photo and the NetCon 2004 ticket
await dbl('.desktop-icon[data-window-template="downloads"]');
check('Downloads lists two files', (await text('.folder-files')) === 'granmas.jpg netcontkts.pdf', await text('.folder-files'));
await dbl('.folder-file[data-file="granmas"]');
check('granmas.jpg opens in a picture viewer', await p.evaluate(() => { const e = document.querySelector('.panel[data-window-template="granmas"] .photo-viewer-image'); return !!e && getComputedStyle(e).backgroundImage.includes('data:image/jpeg') && e.offsetWidth > 300; }));
await shot('03a-granmas');
await click('.panel[data-window-template="granmas"] .panel-close');
await dbl('.folder-file[data-file="netcontkts"]');
const ticket = await text('.netcon-ticket');
check('netcontkts.pdf opens the NetCon 2004 ticket', ticket.includes('NETCON 2004') && ticket.includes('NetCon 2004 Attendee Saturday') && ticket.includes('http://www.netcon04.com/tickets'), ticket.slice(0, 80));
await shot('03b-ticket');
await click('.panel[data-window-template="netcontkts"] .panel-close');
await click('.panel[data-window-template="downloads"] .panel-close');
await shot('02-restored');

// Mail starts empty
await dbl('.desktop-icon[data-window-template="mail"]');
check('inbox empty', (await text('.mail-list')) === 'Your inbox is empty');
await click('.panel[data-window-template="mail"] .panel-close');

// Diskette (READ_ME thrown away first: it's expected to end up in the Trash)
await drag(await center('.desktop-icon[data-window-template="readme"]'), await center('.desktop-icon[data-window-template="recycle"]'));
await dbl('.desktop-icon[data-window-template="diskette"]');
check('Diskette greets', (await text('.diskette-bubble')).includes("I'm Diskette"));
check('Diskette ignores a READ_ME-only Trash', (await p.locator('.diskette-note:not(.diskette-tip)').count()) === 0);
await W(500);
check('Diskette says a hmm when she pops up', voiceLoads.some((s) => s === 200 || s === 206), voiceLoads.join(','));

// Diskette's inspecting mode: her pupils follow the mouse; drag from her eyes
// to something and she scans it and says something about it.
const pupilX = () => p.$eval('.diskette-pupil-l', (e) => new DOMMatrix(getComputedStyle(e).transform).m41);
const eyes = () => center('.diskette-eye-hit-l');
const look = async (to) => { await drag(await eyes(), to); await W(900); };
const reaction = () => text('.diskette-reaction p');
await p.mouse.move(5, 400); await W(150);
const leftX = await pupilX();
await p.mouse.move(1275, 400); await W(150);
const rightX = await pupilX();
check('her pupils follow the mouse', leftX < -1 && rightX > 1, `${leftX} / ${rightX}`);
check('the tip about dragging from her eyes is in her menu', (await text('.diskette-bubble')).includes('drag from my eyes'));
await look(await center('.desktop-icon[data-window-template="browser"]'));
check('dragging from her eyes to an icon: she talks about it', (await reaction()).includes('Browse'), await reaction());
check('...in place of her menu, and the arrow is gone', (await p.locator('.diskette-bubble:visible').count()) === 1 && (await p.locator('.diskette-look-layer').count()) === 0);
await p.locator('.start-button').evaluate((e) => e.click()); await W(400);
await p.locator('.start-button').evaluate((e) => e.click()); await W(400);
check('her answer stays up through a redraw', (await reaction()).includes('Browse'));
await click('.diskette-reaction .diskette-option');
check('"Thanks" puts her menu back', (await p.locator('.diskette-reaction').count()) === 0 && (await text('.diskette-bubble')).includes('What would you like'));
await click('.diskette-eye-hit-r'); await W(300);
check('a poke in the eye', /poke|see/.test(await reaction()), await reaction());
await click('.diskette-reaction .diskette-close');
await go('.diskette-options tw-link', 'Browse');
check('Diskette explains Browse', (await text('.diskette-bubble')).includes('web browser'));
await shot('03-diskette');
check('Diskette has no READ_ME topic', !(await text('.diskette-options')).includes('READ'));
await look([640, 160]);
check('the wallpaper', /desktop|wallpaper/.test(await reaction()), await reaction());
await dbl('.desktop-icon[data-window-template="downloads"]');
await dbl('.folder-file[data-file="netcontkts"]');
await look(await center('.netcon-redact'));
check('a response zone in the ticket answers', (await reaction()).includes('blacked that out'), await reaction());
await look(await center('.netcon-big'));
check('the rest of the ticket gets the window\'s line', (await reaction()).includes('NetCon 2004'), await reaction());
await click('.panel[data-window-template="netcontkts"] .panel-close');
await click('.panel[data-window-template="downloads"] .panel-close');
await dbl('.desktop-icon[data-window-template="browser"]');
await click('.browser-star');
await go('.bookmark-row tw-link', 'Winkipedia');
await type('#winki-search-input', 'Diskette');
await p.keyboard.press('Enter'); await W(500);
await look(await center('.browser-page-content h1'));
check('a page with its own comment', (await reaction()).includes('my page'), await reaction());
// (zones are often empty markers: no size, so Playwright calls them hidden)
const zoneAt = (n) => p.locator('.browser-page-content .diskette-zone').nth(n).evaluate((e) => { e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await look(await zoneAt(0));
check('a response zone in an article', (await reaction()).includes('sabbatical'), await reaction());
await shot('03c-diskette-inspecting');
await click('.panel[data-window-template="browser"] .panel-close');
await click('.diskette-reaction .diskette-close');
await go('.diskette-options tw-link', 'Dismiss');
check('Dismiss tucks Diskette into the tray', (await p.locator('.diskette-bubble').count()) === 0 && (await p.locator('.tray-diskette').count()) === 1);
check('first dismiss: tray balloon explains the tray', (await text('.diskette-balloon')).includes('down here in the tray'));
await W(500);
check('the balloon says a hmm too', voiceLoads.length >= 2, voiceLoads.join(','));
await click('.diskette-balloon p');
check('clicking the balloon brings Diskette back', (await text('.diskette-bubble')).includes("I'm Diskette"));
check('her main menu has Dismiss too', (await text('.diskette-options')).includes('Dismiss'));
await click('.diskette-close');
check('the x also tucks her away, without a second balloon', (await p.locator('.diskette-bubble').count()) === 0 && (await p.locator('.diskette-balloon').count()) === 0);
await click('.tray-diskette');
check('tray icon brings her back', (await p.locator('.diskette-bubble').count()) === 1);
await click('.tray-diskette');
check('tray icon tucks her away again', (await p.locator('.diskette-bubble').count()) === 0);
// Something coming out of the Trash while she's tucked away: she pipes up.
await drag(await center('.desktop-icon[data-window-template="notes"]'), await center('.desktop-icon[data-window-template="recycle"]'));
await dbl('.desktop-icon[data-window-template="recycle"]');
await drag(await center('.bin-icon[data-app="notes"]'), [460, 650]);
await click('.panel[data-window-template="recycle"] .panel-close');
check('restoring an app makes her balloon offer help', (await text('.diskette-balloon')).includes('Notes'));
await click('.tray-diskette');
check('clicking her answers about it', (await text('.diskette-bubble')).includes('notepad'));
await go('.diskette-options tw-link', 'Dismiss');
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
check('other pages leave the zoom alone', (await zoom()) === ZOOM_START && songLoads.length === 0, String(await zoom()));
check('search skips non-article pages', (await text('#winki-msg')).includes('does not have an article'));
await p.locator('#winki-search-input').fill('');
await type('#winki-search-input', 'skunkpets.com');
await p.keyboard.press('Enter'); await W(500);
check('"skunkpets.com" opens the Skunkpets article', (await text('.browser-page-content h1')).includes('SkunkPets'));
await W(3000);
// Scroll memory: redraws that don't change the page keep the scroll position
const scrollTo = (y) => p.evaluate((y) => { const c = document.querySelector('.browser-page-content'); c.scrollTop = y; c.dispatchEvent(new Event('scroll')); }, y);
const scrollNow = () => p.evaluate(() => Math.round(document.querySelector('.browser-page-content').scrollTop));
await scrollTo(300); await W(200);
const scrolled = await scrollNow();
await p.locator('.browser-star').evaluate((e) => e.click()); await W(500);
check('opening the bookmarks keeps the page scrolled', scrolled > 100 && Math.abs((await scrollNow()) - scrolled) <= 2, `${scrolled} -> ${await scrollNow()}`);
await p.locator('.browser-star').evaluate((e) => e.click()); await W(500);
await p.locator('.start-button').evaluate((e) => e.click()); await W(500);
check('opening the Start menu keeps it too', Math.abs((await scrollNow()) - scrolled) <= 2, `${scrolled} -> ${await scrollNow()}`);
await p.locator('.start-button').evaluate((e) => e.click()); await W(400);
// ...and so does a warning dialog (the footnote link to the fan wiki), after Cancel
await p.locator('.browser-page-content tw-link sup').first().evaluate((e) => e.closest('tw-link').click()); await W(500);
check('the fan wiki footnote warns before leaving', (await text('.xp-dialog-msg')).includes('skunkpets.fanwiki.net'));
await p.locator('.xp-dialog-buttons tw-link').filter({ hasText: 'Cancel' }).evaluate((e) => e.click()); await W(500);
check('...and Cancel keeps the page scrolled', Math.abs((await scrollNow()) - scrolled) <= 2, `${scrolled} -> ${await scrollNow()}`);
check('Skunkpets article starts the zoom', (await zoom()) > ZOOM_START, String(await zoom()));
check('Skunkpets article starts the song', songLoads.some((s) => s === 200 || s === 206), songLoads.join(','));

// Autosave: reload mid-game, CONTINUE, and carry on from the same spot
await W(1500);
check('game autosaves', await p.evaluate(() => !!localStorage.getItem('skunkpets-save')));
const songsBefore = songLoads.length;
await p.reload(); await W(1000);
check('reload shows CONTINUE and NEW GAME', (await p.$$eval('.splash-screen button', (e) => e.map((x) => x.textContent))).join(',') === 'CONTINUE,NEW GAME');
await click('.continuebutton');
await p.locator('.monitor').waitFor(); await W(1800);
check('CONTINUE restores the browser on the Skunkpets article', (await text('.browser-page-content h1')).includes('SkunkPets'));
check('CONTINUE restores the full-size zoom', (await zoom()) === 1, String(await zoom()));
check('CONTINUE brings the song back', songLoads.length > songsBefore, songLoads.join(','));

// Story path to the ending
await go('.browser-page-content tw-link', '2004 NetCon');
await p.locator('.browser-page-content tw-link').filter({ hasText: 'Global Games Archive' }).evaluate((e) => e.click()); await W(500);
check('leaving Winkipedia for the games archive warns first', (await text('.xp-dialog-msg')).includes('exiting to external website') && (await text('.xp-dialog-msg')).includes('globalgamesarchive.co.uk'), await text('.xp-dialog-msg'));
await go('.xp-dialog-buttons tw-link', 'Cancel');
check('Cancel stays on Winkipedia', (await pageTitle()) === 'NetCon 2004', await pageTitle());
await go('.browser-page-content tw-link', 'Global Games Archive');
await go('.xp-dialog-buttons tw-link', 'OK');
check('OK goes on to the games archive', (await pageTitle()) === 'globalgamesarchive.co.uk', await pageTitle());
check('a new page starts at the top', (await p.evaluate(() => document.querySelector('.browser-page-content').scrollTop)) === 0);
await type('#gga-search-input', 'skunkpets');
await p.keyboard.press('Enter'); await W(500);
check('games archive search for "skunkpets" finds nothing', (await pageTitle()) !== 'kraska1' && (await text('.browser-page-content')).includes('No results found'));
await p.locator('#gga-search-input').fill('');
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
check('ending card credits the song', (await text('.endcard-credit')).includes('Kevin MacLeod'));
check('the ending clears the save', await p.evaluate(() => !localStorage.getItem('skunkpets-save')));
await shot('04-ending');

const twErrors = await p.$$eval('tw-error', (e) => e.map((x) => x.textContent.slice(0, 120)));
check('no Harlowe errors', twErrors.length === 0, twErrors.join(' | '));
check('no script errors', errs.length === 0, errs.join(' | '));

await b.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
