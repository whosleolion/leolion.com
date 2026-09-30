// Browser test of the preview's article editor, with GitHub faked: opens an
// article, edits text, adds a photo, saves, and checks the commit it sends.
// Needs a local preview copy with the editor in it (see editor/README.md):
//   node tools/skunkpets-redux/editor/editor-test.mjs [outDir]
// (run from a folder where `playwright` resolves). With outDir it also writes
// the committed .twee and photo there, to try building them.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// REPO_ROOT if this file was copied elsewhere to run (next to playwright).
const ROOT = process.env.REPO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const URL_BASE = process.env.PREVIEW_URL || 'http://localhost:8765/building/skunkpets-preview/';
const OUT = process.argv[2];
const twee = fs.readFileSync(`${ROOT}/tools/skunkpets-redux/skunkpets-redux.twee`, 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1400, height: 820 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const W = (ms) => p.waitForTimeout(ms);
const box = async (s) => { const r = await p.locator(s).first().boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); if (!ok) failures++; };

// Fake GitHub
const sent = { blobs: [], tree: null, commit: null, ref: null };
let readOnlyToken = true; // the first save acts like a token without write access
// comments.json on the fake branch: starts with one note on another page.
let commentsFile = { sha: 'C1', data: { comments: [{ id: 'seed1', page: 'Tom Barry', author: 'Sofe', text: 'Is his birth year right?', at: '2026-09-30T00:00:00Z', resolved: false }] } };
let commentPuts = 0;
let failNextCommentPut = false; // pretend someone else saved first
await p.route('https://api.github.com/**', async (route) => {
  const req = route.request(); const url = new URL(req.url()); const path = url.pathname.replace('/repos/whosleolion/leolion.com', '');
  const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (path === '/git/ref/heads/test-branch') return json({ object: { sha: 'HEAD1' } });
  if (path === '/git/commits/HEAD1') return json({ tree: { sha: 'TREE1' } });
  if (path.startsWith('/contents/tools/skunkpets-redux/skunkpets-redux.twee')) return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: twee });
  if (path === '/contents/tools/skunkpets-redux/editor/comments.json') {
    if (req.method() === 'GET') return json({ sha: commentsFile.sha, content: Buffer.from(JSON.stringify(commentsFile.data)).toString('base64') });
    if (req.method() === 'PUT') {
      const body = req.postDataJSON();
      commentPuts++;
      if (failNextCommentPut || body.sha !== commentsFile.sha) {
        failNextCommentPut = false;
        // Another person's comment lands first; ours must be replayed on top of it.
        commentsFile = { sha: 'C' + (commentPuts + 100), data: { comments: commentsFile.data.comments.concat([{ id: 'other', page: 'Skunkpets', author: 'Sofe', text: 'meanwhile', at: '2026-09-30T00:00:00Z', resolved: false }]) } };
        return route.fulfill({ status: 409, headers: { 'access-control-allow-origin': '*' }, body: '{"message":"sha mismatch"}' });
      }
      commentsFile = { sha: 'C' + (commentPuts + 1), data: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')) };
      return json({ content: { sha: commentsFile.sha } });
    }
  }
  if (req.method() !== 'GET' && readOnlyToken) return route.fulfill({ status: 403, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"Resource not accessible by personal access token"}' });
  if (path === '/git/blobs') { sent.blobs.push(req.postDataJSON()); return json({ sha: 'BLOB' + sent.blobs.length }); }
  if (path === '/git/trees') { sent.tree = req.postDataJSON(); return json({ sha: 'TREE2' }); }
  if (path === '/git/commits') { sent.commit = req.postDataJSON(); return json({ sha: 'c0ffee1234567' }); }
  if (path === '/git/refs/heads/test-branch') { sent.ref = req.postDataJSON(); return json({}); }
  return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'nope ' + path });
});

await p.goto(URL_BASE);
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.click('.startbutton'); await W(2000);
await p.mouse.dblclick(...await box('.desktop-icon[data-window-template="recycle"]')); await W(500);
const from = await box('.bin-icon[data-app="browser"]');
await p.mouse.move(...from); await p.mouse.down(); await p.mouse.move(from[0] + 10, from[1] + 10, { steps: 3 }); await p.mouse.move(400, 600, { steps: 10 }); await p.mouse.up(); await W(500);
await p.click('.panel[data-window-template="recycle"] .panel-close'); await W(300);
await p.mouse.dblclick(...await box('.desktop-icon[data-window-template="browser"]')); await W(500);
await p.click('.browser-star'); await W(300);
await p.locator('.bookmark-row tw-link').filter({ hasText: 'Winkipedia' }).first().click(); await W(500);
await p.locator('#winki-search-input').click(); await p.keyboard.type('REV (Recast Entertainment Ventures)'); await p.keyboard.press('Enter'); await W(800);

await p.click('.ske-toggle'); await W(800);
check('editor opens on the article shown in the game', (await p.locator('.ske-title').innerText()) === 'REV (Recast Entertainment Ventures)');
const text = await p.locator('.ske-text').inputValue();
check('links show as [[...]]', text.includes('[[Tom Barry]]'));
check('photos show as [[photo: ...]]', text.includes('[[photo: rev-storefront.jpg | right | Recast Entertainment Ventures storefront, Glen Cove]]') && text.includes('[[photo: rev-founders.jpg | left | 36% | REV\'s founders]]'));
const mon = await p.locator('.monitor').boundingBox();
check('monitor moves over for the panel', mon.x + mon.width <= 1400 - 440, JSON.stringify(mon));

// Edit text: live in the game
await p.locator('.ske-text').evaluate((t) => { t.value = t.value.replace('an American media investment firm', 'an American media conglomerate'); t.dispatchEvent(new Event('input')); });
await W(900);
check('text edits show in the game as you type', (await p.locator('.browser-page-content').innerText()).includes('an American media conglomerate'));
check('links still work in the game', (await p.locator('.browser-page-content tw-link').filter({ hasText: 'Tom Barry' }).count()) === 1);

// Add a photo
await p.locator('.ske-text').evaluate((t) => { t.setSelectionRange(0, 0); });
await p.locator('.ske-file').setInputFiles(`${ROOT}/tools/skunkpets-redux/art/songs-for-family-learning.jpg`);
await W(1200);
const t2 = await p.locator('.ske-text').inputValue();
const added = (t2.match(/\[\[photo: (songs-for-family-learning-[a-z0-9]{4}\.jpg) \| right \| songs-for-family-learning\]\]/) || [])[1];
check('+ Photo inserts a photo line', !!added, t2.slice(0, 120));
check('the new photo shows in the game', await p.evaluate((f) => { const e = document.querySelector(`.browser-page-content .article-art[data-art="${f}"]`); return !!e && getComputedStyle(e).backgroundImage.includes('data:image/jpeg'); }, added));
if (OUT) await p.screenshot({ path: `${OUT}/editor.png` });

// Save
await p.evaluate(() => localStorage.setItem('skunkpets-editor-token', 'test-token'));
await p.click('.ske-save'); await W(1500);
check('a read-only token gets a plain explanation', (await p.locator('.ske-status').innerText()).includes('Read and write'), await p.locator('.ske-status').innerText());
check('...and nothing is marked saved', (await p.locator('.ske-pending').innerText()).includes('Not saved yet'));
readOnlyToken = false;
await p.click('.ske-save'); await W(1500);
check('save reports success', (await p.locator('.ske-status').innerText()).includes('Saved (c0ffee1)'), await p.locator('.ske-status').innerText());
const tweeEntry = sent.tree && sent.tree.tree.find((e) => e.path === 'tools/skunkpets-redux/skunkpets-redux.twee');
const artEntry = sent.tree && sent.tree.tree.find((e) => e.path === `tools/skunkpets-redux/art/${added}`);
check('one commit: the .twee and the new photo', !!tweeEntry && !!artEntry && sent.tree.base_tree === 'TREE1' && sent.commit.parents[0] === 'HEAD1' && sent.ref.sha === 'c0ffee1234567');
check('commit message names the page and photo', /^Edit Winkipedia: REV \(Recast Entertainment Ventures\), photo /.test(sent.commit.message), sent.commit.message.split('\n')[0]);
if (OUT && tweeEntry) {
  fs.writeFileSync(`${OUT}/saved.twee`, tweeEntry.content);
  fs.writeFileSync(`${OUT}/${added}`, Buffer.from(sent.blobs[0].content, 'base64'));
  fs.writeFileSync(`${OUT}/added-name`, added);
}

// Reload: saved edits keep showing until the rebuild
await p.reload(); await W(800);
await p.click('.continuebutton'); await W(2000);
check('after reload the saved edit still shows', (await p.locator('.browser-page-content').innerText()).includes('an American media conglomerate'));
check('...with the new photo', await p.evaluate((f) => !!document.querySelector(`.browser-page-content .article-art[data-art="${f}"]`), added));
// Comments
p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Leo' : undefined));
await p.locator('.ske-comments button').filter({ hasText: 'Refresh' }).click(); await W(800);
check('toggle counts open notes', (await p.locator('.ske-toggle').innerText()).includes('1 note'), await p.locator('.ske-toggle').innerText());
check('notes on other pages are listed', (await p.locator('.ske-others').innerText()).includes('Tom Barry (1)'));
await p.locator('.ske-text').evaluate((t) => { const i = t.value.indexOf('media conglomerate'); t.focus(); t.setSelectionRange(i, i + 'media conglomerate'.length); t.dispatchEvent(new Event('select')); });
check('selected words show as the quote', (await p.locator('.ske-quote-hint').innerText()).includes('media conglomerate'));
await p.locator('.ske-comment-input').fill('Should this say conglomerate?');
failNextCommentPut = true;
await p.locator('.ske-comments button').filter({ hasText: 'Post comment' }).click(); await W(1500);
const mine = commentsFile.data.comments.find((c) => c.text === 'Should this say conglomerate?');
check('posting saves the comment with name, page and quote', !!mine && mine.author === 'Leo' && mine.page === 'REV (Recast Entertainment Ventures)' && mine.quote === 'media conglomerate', JSON.stringify(mine));
check('...without losing a comment someone saved at the same moment', commentsFile.data.comments.some((c) => c.id === 'other') && commentsFile.data.comments.some((c) => c.id === 'seed1'));
check('the comment shows on this page', (await p.locator('.ske-comment-list').innerText()).includes('Should this say conglomerate?'));
await p.locator('.ske-comment').filter({ hasText: 'Should this say conglomerate?' }).locator('button').filter({ hasText: 'Resolve' }).click(); await W(1000);
check('resolve marks it done, by name', commentsFile.data.comments.find((c) => c.id === mine.id).resolved === true && commentsFile.data.comments.find((c) => c.id === mine.id).resolvedBy === 'Leo');
check('resolved notes fold away', (await p.locator('.ske-resolved summary').innerText()).includes('Resolved (1)'));
await p.locator('.ske-other').filter({ hasText: 'Tom Barry' }).locator('button').click(); await W(1200);
check('Go opens that page in the game and the editor', (await p.locator('.ske-title').innerText()) === 'Tom Barry' && (await p.locator('.browser-page-content h1').innerText()).includes('Tom Barry'));
if (OUT) await p.screenshot({ path: `${OUT}/comments.png` });
check('...with its notes', (await p.locator('.ske-comment-list').innerText()).includes('Is his birth year right?'));
check('comments never go into the game itself', !fs.readFileSync(`${ROOT}/src/building/skunkpets/index.html`, 'utf8').includes('comments.json'));

check('no Harlowe errors', (await p.locator('tw-error').count()) === 0);
check('no script errors', errs.length === 0, errs.join(' | '));
await b.close();
console.log(failures ? `\n${failures} failed` : '\nall editor checks passed');
process.exit(failures ? 1 : 0);
