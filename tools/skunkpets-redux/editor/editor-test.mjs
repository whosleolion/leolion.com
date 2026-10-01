// Browser test of the preview's article editor, with GitHub faked: edits an
// article, adds a photo, makes a new page from a red link, finds it in search,
// reviews and saves (and builds what was saved), then works comments pinned
// to text in the markup and the game.
// Needs a local preview copy with the editor in it (see editor/README.md):
//   node tools/skunkpets-redux/editor/editor-test.mjs [outDir]
// (run from a folder where `playwright` resolves; set REPO_ROOT if this file
// was copied elsewhere). With outDir it also writes screenshots there.
import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
const ROOT = process.env.REPO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const URL_BASE = process.env.PREVIEW_URL || 'http://localhost:8765/building/skunkpets-preview/';
const OUT = process.argv[2];
const twee = fs.readFileSync(`${ROOT}/tools/skunkpets-redux/skunkpets-redux.twee`, 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Leo' : undefined));
const W = (ms) => p.waitForTimeout(ms);
const box = async (s) => { const r = await p.locator(s).first().boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
const text = (s) => p.locator(s).first().innerText().catch(() => '');
const ed = {
  get: () => p.evaluate(() => window.SkunkpetsEditorDebug.getText()),
  set: (t) => p.evaluate((t) => window.SkunkpetsEditorDebug.setText(t), t),
  select: (a, z) => p.evaluate(([a, z]) => window.SkunkpetsEditorDebug.select(a, z), [a, z]),
};
const goTo = (name) => p.evaluate((n) => window.SkunkpetsEditorHook.goTo(n), name);
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); if (!ok) failures++; };

// ---------- Fake GitHub ----------
const sent = { blobs: [], tree: null, commit: null, ref: null };
let readOnlyToken = true; // the first save acts like a token without write access
let commentsFile = { sha: 'C1', data: { comments: [
  { id: 'seed1', page: 'Tom Barry', author: 'Sofe', text: 'Is his birth year right?', at: '2026-09-30T00:00:00Z', resolved: false },
  { id: 'seed2', page: 'REV (Recast Entertainment Ventures)', author: 'Sofe', text: 'Where is Glen Cove?', quote: 'Glen Cove, New York', prefix: 'firm based in ', suffix: '. Originally', at: '2026-09-30T00:00:00Z', resolved: false },
] } };
let commentPuts = 0;
let failNextCommentPut = false;
const commentOps = [];
await p.route('https://api.github.com/**', async (route) => {
  const req = route.request(); const url = new URL(req.url()); const pth = url.pathname.replace('/repos/whosleolion/leolion.com', '');
  const cors = { 'access-control-allow-origin': '*' };
  const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (pth === '/contents/tools/skunkpets-redux/editor/comments.json') {
    if (req.method() === 'GET') return json({ sha: commentsFile.sha, content: Buffer.from(JSON.stringify(commentsFile.data)).toString('base64') });
    const body = req.postDataJSON();
    commentPuts++;
    if (failNextCommentPut || body.sha !== commentsFile.sha) {
      failNextCommentPut = false;
      commentsFile = { sha: 'C' + (commentPuts + 100), data: { comments: commentsFile.data.comments.concat([{ id: 'other', page: 'Skunkpets', author: 'Sofe', text: 'meanwhile', at: '2026-09-30T00:00:00Z', resolved: false }]) } };
      return route.fulfill({ status: 409, headers: cors, body: '{"message":"sha mismatch"}' });
    }
    commentOps.push(body);
    commentsFile = { sha: 'C' + (commentPuts + 1), data: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')) };
    return json({ content: { sha: commentsFile.sha } });
  }
  if (pth === '/commits') return json([{ commit: { message: 'Edit Winkipedia: Tom Barry\n\nx', author: { name: 'Sofe', date: new Date(Date.now() - 2 * 3600e3).toISOString() } } }]);
  if (req.method() !== 'GET' && readOnlyToken) return route.fulfill({ status: 403, contentType: 'application/json', headers: cors, body: '{"message":"Resource not accessible by personal access token"}' });
  if (pth === '/git/ref/heads/test-branch') return json({ object: { sha: 'HEAD1' } });
  if (pth === '/git/commits/HEAD1') return json({ tree: { sha: 'TREE1' } });
  if (pth.startsWith('/contents/tools/skunkpets-redux/skunkpets-redux.twee')) return route.fulfill({ status: 200, headers: cors, body: twee });
  if (pth === '/git/blobs') { sent.blobs.push(req.postDataJSON()); return json({ sha: 'BLOB' + sent.blobs.length }); }
  if (pth === '/git/trees') { sent.tree = req.postDataJSON(); return json({ sha: 'TREE2' }); }
  if (pth === '/git/commits') { sent.commit = req.postDataJSON(); return json({ sha: 'c0ffee1234567' }); }
  if (pth === '/git/refs/heads/test-branch') { sent.ref = req.postDataJSON(); return json({}); }
  return route.fulfill({ status: 404, headers: cors, body: 'nope ' + pth });
});

// ---------- Boot and open an article ----------
await p.goto(URL_BASE);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('skunkpets-editor-token', 'test-token'); });
await p.reload();
await p.click('.startbutton'); await W(2000);
await p.mouse.dblclick(...await box('.desktop-icon[data-window-template="recycle"]')); await W(500);
const from = await box('.bin-icon[data-app="browser"]');
await p.mouse.move(...from); await p.mouse.down(); await p.mouse.move(from[0] + 10, from[1] + 10, { steps: 3 }); await p.mouse.move(400, 600, { steps: 10 }); await p.mouse.up(); await W(500);
await p.click('.panel[data-window-template="recycle"] .panel-close'); await W(300);
await p.mouse.dblclick(...await box('.desktop-icon[data-window-template="browser"]')); await W(500);
await goTo('Tom Barry'); await W(600);
await p.click('.ske-toggle'); await W(1200);

check('last-saved line from GitHub history', (await text('.ske-last-edit')).includes('Last saved by Sofe'), await text('.ske-last-edit'));
await goTo('REV (Recast Entertainment Ventures)'); await W(900);
check('editor follows the game to the article', (await text('.ske-title')) === 'REV (Recast Entertainment Ventures)');
check('markup is a code editor with colored links', (await p.locator('.ske-cm .cm-editor').count()) === 1 && (await p.locator('.cm-ske-link').count()) > 0);
const start = await ed.get();
check('links and photos use the short form', start.includes('[[Tom Barry]]') && start.includes('[[photo: rev-founders.jpg | left | 36% | REV\'s founders]]'));

// ---------- Edits, live ----------
await ed.set(start.replace('an American media investment firm', 'an American media conglomerate').replace('New York. Originally', 'New York, near [[Bin City]]. Originally'));
await W(1000);
check('edits show in the game as you type', (await text('.browser-page-content')).includes('an American media conglomerate'));
check('a link to a missing page is red in the markup', (await p.locator('.cm-ske-redlink').filter({ hasText: 'Bin City' }).count()) === 1);
check('...and red (not a broken link) in the game', (await p.locator('.browser-page-content .ske-redlink').filter({ hasText: 'Bin City' }).count()) === 1);
check('...and listed with Create', (await text('.ske-missing')).includes('Bin City'));

// Photo
await ed.select(0, 0);
await p.locator('.ske-file').setInputFiles(`${ROOT}/tools/skunkpets-redux/art/songs-for-family-learning.jpg`);
await W(1200);
const added = ((await ed.get()).match(/\[\[photo: (songs-for-family-learning-[a-z0-9]{4}\.jpg) \| right \|/) || [])[1];
check('+ Photo inserts a photo line', !!added);
check('the new photo shows in the game', await p.evaluate((f) => { const e = document.querySelector(`.browser-page-content .article-art[data-art="${f}"]`); return !!e && getComputedStyle(e).backgroundImage.includes('data:image/jpeg'); }, added));

// ---------- New page from the red link ----------
await p.locator('.ske-missing button').filter({ hasText: 'Create' }).click(); await W(400);
check('Create opens the new-page window with the name filled in', (await p.locator('.ske-modal input.ske-input').inputValue()) === 'Bin City');
check('five templates offered', (await p.locator('.ske-template').count()) === 5);
await p.locator('.ske-create').click(); await W(1200);
check('the game opens the new page', (await text('.browser-page-content h1')) === 'Bin City');
check('the editor follows to it', (await text('.ske-title')) === 'Bin City' && (await text('.ske-last-edit')).includes('New page'));
await ed.set((await ed.get()).replace('Bin City is … (write the opening here).', 'Bin City is where the Skunkpets live.'));
await W(900);
check('the new page edits live too', (await text('.browser-page-content')).includes('where the Skunkpets live'));
await goTo('Winkipedia'); await W(700);
await p.locator('#winki-search-input').click(); await p.keyboard.type('bin city'); await p.keyboard.press('Enter'); await W(900);
check('the new article is findable in Winkipedia search before saving', (await text('.browser-page-content h1')) === 'Bin City');
await goTo('REV (Recast Entertainment Ventures)'); await W(900);
check('the link to it is no longer red', (await p.locator('.browser-page-content .ske-redlink').count()) === 0 && (await p.locator('.browser-page-content tw-link').filter({ hasText: 'Bin City' }).count()) === 1);

// ---------- Review and save ----------
await p.locator('.ske-save').first().click(); await W(500);
const review = await text('.ske-modal');
check('review lists both pages, marking the new one', review.includes('REV (Recast Entertainment Ventures)') && review.includes('Bin City (new page)'));
check('review shows the changed lines', (await p.locator('.ske-diff-add').filter({ hasText: 'media conglomerate' }).count()) === 1 && (await p.locator('.ske-diff-del').filter({ hasText: 'media investment firm' }).count()) === 1);
if (OUT) await p.screenshot({ path: `${OUT}/review.png` });
await p.locator('.ske-review-save').click(); await W(1500);
check('a read-only token gets a plain explanation', (await text('.ske-status')).includes('Read and write'));
readOnlyToken = false;
await p.locator('.ske-save').first().click(); await W(400);
await p.locator('.ske-review-save').click(); await W(1500);
check('save reports success', (await text('.ske-status')).includes('Saved (c0ffee1)'), await text('.ske-status'));
const tweeEntry = sent.tree && sent.tree.tree.find((e) => e.path === 'tools/skunkpets-redux/skunkpets-redux.twee');
check('one commit: .twee with the new page, and the photo', !!tweeEntry && tweeEntry.content.includes(':: Bin City [wiki article]\n') && tweeEntry.content.includes('media conglomerate') && sent.tree.tree.some((e) => e.path === `tools/skunkpets-redux/art/${added}`));
check('commit is under the editor\'s name', sent.commit.author && sent.commit.author.name === 'Leo' && /Bin City \(new\)/.test(sent.commit.message), sent.commit.message.split('\n')[0]);
// Build exactly what was committed
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ske-e2e-'));
fs.cpSync(`${ROOT}/tools/skunkpets-redux`, `${tmp}/tool`, { recursive: true, filter: (f) => !f.includes('node_modules') });
fs.writeFileSync(`${tmp}/tool/skunkpets-redux.twee`, tweeEntry.content);
fs.writeFileSync(`${tmp}/tool/art/${added}`, Buffer.from(sent.blobs[0].content, 'base64'));
fs.copyFileSync(`${ROOT}/src/building/skunkpets/index.html`, `${tmp}/index.html`);
let builtOk = false;
try { execFileSync('node', [`${tmp}/tool/build.js`, `${tmp}/index.html`], { stdio: 'pipe' }); builtOk = fs.readFileSync(`${tmp}/index.html`, 'utf8').includes('name="Bin City"'); } catch (e) { console.log(String(e.stderr || e)); }
check('what was saved builds, new page included', builtOk);
fs.rmSync(tmp, { recursive: true, force: true });

// ---------- After a reload ----------
await p.reload(); await W(800);
await p.click('.continuebutton'); await W(2200);
check('saved edits still show after reload', (await text('.browser-page-content')).includes('an American media conglomerate'));
await goTo('Bin City'); await W(700);
check('the saved new page is still there', (await text('.browser-page-content')).includes('where the Skunkpets live'));
await goTo('REV (Recast Entertainment Ventures)'); await W(1000);

// ---------- Comments pinned to text ----------
check('the panel is the Backend Editor, with four tabs', (await text('.ske-head b')) === 'Backend Editor' && (await text('.ske-tabs')).replace(/\s+/g, ' ') === 'Markup Comments Diskette Events', await text('.ske-tabs'));
check('toggle counts open notes', (await text('.ske-toggle')).includes('2 comments'), await text('.ske-toggle'));
check('notes do not show in the game on the Markup tab', (await p.locator('.browser-page-content mark.ske-mark').count()) === 0);
await p.locator('.ske-tab-btn[data-tab="comments"]').click(); await W(600);
check('a pinned comment is highlighted in the game', (await p.locator('.browser-page-content mark.ske-mark').filter({ hasText: 'Glen Cove' }).count()) >= 1);
check('...and in the markup', (await p.locator('.cm-ske-comment').filter({ hasText: 'Glen Cove' }).count()) >= 1);
await p.locator('.browser-page-content .ske-mark-badge').first().click(); await W(500);
check('clicking it in the game opens its thread', (await p.locator('.ske-comment.ske-comment-focus').filter({ hasText: 'Where is Glen Cove?' }).count()) === 1);
check('...and selects its words in the markup', (await p.evaluate(() => { const v = document.querySelector('.cm-ske-comment-focus'); return v ? v.textContent : ''; })).includes('Glen Cove'));
const txt = await ed.get();
const q = txt.indexOf('media conglomerate');
await ed.select(q, q + 'media conglomerate'.length); await W(200);
check('selected words show as the quote', (await text('.ske-quote-hint')).includes('media conglomerate'));
await p.locator('.ske-comment-input').first().fill('Should this say conglomerate?');
failNextCommentPut = true;
await p.locator('.ske-post').click(); await W(1500);
const mine = commentsFile.data.comments.find((c) => c.text === 'Should this say conglomerate?');
check('posting pins the comment to the words', !!mine && mine.author === 'Leo' && mine.quote === 'media conglomerate' && mine.prefix.endsWith('an American ') && mine.suffix.startsWith(' based'), JSON.stringify(mine));
check('...without losing a comment saved at the same moment', commentsFile.data.comments.some((c) => c.id === 'other'));
check('...and it lights up in the game', (await p.locator('.browser-page-content mark.ske-mark').filter({ hasText: 'media conglomerate' }).count()) >= 1);
const thread = p.locator('.ske-comment').filter({ hasText: 'Should this say conglomerate?' });
await thread.locator('button').filter({ hasText: 'Reply' }).click(); await W(200);
await thread.locator('.ske-reply textarea').fill('Yes, keep it.');
await thread.locator('.ske-reply button').click(); await W(1200);
const reply = commentsFile.data.comments.find((c) => c.text === 'Yes, keep it.');
check('replies thread under the comment', !!reply && reply.parent === mine.id && (await p.locator('.ske-comment-reply').filter({ hasText: 'Yes, keep it.' }).count()) === 1);
// Orphan, then re-pin
await ed.set((await ed.get()).replace('an American media conglomerate', 'an American media empire')); await W(900);
check('editing the words away orphans the comment', (await p.locator('.ske-comment').filter({ hasText: 'Should this say conglomerate?' }).locator('.ske-orphan').count()) === 1);
const t3 = await ed.get(); const e3 = t3.indexOf('media empire');
await ed.select(e3, e3 + 'media empire'.length);
await p.locator('.ske-comment').filter({ hasText: 'Should this say conglomerate?' }).locator('button').filter({ hasText: 'Re-pin' }).click(); await W(1200);
check('Re-pin moves it to the new words', commentsFile.data.comments.find((c) => c.id === mine.id).quote === 'media empire');
if (OUT) await p.screenshot({ path: `${OUT}/comments.png` });
await p.locator('.ske-comment').filter({ hasText: 'Should this say conglomerate?' }).locator('button').filter({ hasText: 'Resolve' }).click(); await W(1000);
check('resolved comments fold away and stop highlighting', (await text('.ske-resolved summary')).includes('Resolved (1)') && (await p.locator('.browser-page-content mark.ske-mark').filter({ hasText: 'media empire' }).count()) === 0);

// Click a word in the game: the markup jumps there (Markup tab)
await p.locator('.ske-tab-btn[data-tab="markup"]').click(); await W(400);
const pt = await p.evaluate(() => {
  const w = document.createTreeWalker(document.querySelector('.browser-page-content'), NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.nodeValue.indexOf('nationwide development');
    if (i >= 0) { const r = document.createRange(); r.setStart(n, i + 3); r.setEnd(n, i + 4); const b = r.getBoundingClientRect(); return [b.x + 1, b.y + b.height / 2]; }
  }
  return null;
});
if (pt) { await p.mouse.click(pt[0], pt[1]); await W(400); }
const cursor = await p.evaluate(() => window.SkunkpetsEditorDebug.cursor());
const target = (await ed.get()).indexOf('nationwide development');
check('clicking words in the game moves the markup cursor there', !!pt && Math.abs(cursor - (target + 3)) <= 2, `cursor ${cursor}, word at ${target}`);

// Go to another page's notes
await p.locator('.ske-tab-btn[data-tab="comments"]').click(); await W(400);
await p.locator('.ske-other').filter({ hasText: 'Tom Barry' }).locator('button').click(); await W(1300);
check('Go opens that page with its notes', (await text('.ske-title')) === 'Tom Barry' && (await text('.ske-comment-list')).includes('Is his birth year right?'));

// ---------- Selecting in the game: crumbs, popup, and each tab following ----------
const wordsAt = async (words) => p.evaluate((w) => {
  const walker = document.createTreeWalker(document.querySelector('.browser-page-content'), NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = n.nodeValue.indexOf(w);
    if (i >= 0) {
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length);
      const c = document.querySelector('.browser-page-content'); const cr = c.getBoundingClientRect();
      c.scrollTop += r.getBoundingClientRect().top - (cr.top + cr.height / 3);
      return true;
    }
  }
  return false;
}, words).then(() => p.evaluate((w) => {
  const walker = document.createTreeWalker(document.querySelector('.browser-page-content'), NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = n.nodeValue.indexOf(w);
    if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); const rs = r.getClientRects(); const a = rs[0]; const z = rs[rs.length - 1]; return [a.x + 1, a.y + a.height / 2, z.x + z.width - 1, z.y + z.height / 2]; }
  }
  return null;
}, words));
const drag = await wordsAt('his two sons');
await p.mouse.move(drag[0], drag[1]); await p.mouse.down(); await p.mouse.move(drag[2], drag[3], { steps: 8 }); await p.mouse.up(); await W(600);
check('dragging across words selects them: breadcrumb', (await text('.ske-crumbs')).includes('Tom Barry') && (await text('.ske-crumbs')).includes('“his two sons”'), await text('.ske-crumbs'));
check('...a popup with Markup, Comment and Diskette', (await text('.ske-pop')).includes('Markup') && (await text('.ske-pop')).includes('Comment') && (await text('.ske-pop')).includes('Diskette'), await text('.ske-pop'));
check('...and the Comments tab follows it', (await text('.ske-comments-body .ske-section-title')).startsWith('Comments on “his two sons”'), await text('.ske-comments-body .ske-section-title'));
await p.locator('.ske-comment-input').first().fill('Is Bruce one of them?');
await p.locator('.ske-post').click(); await W(1200);
const sonsNote = commentsFile.data.comments.find((c) => c.text === 'Is Bruce one of them?');
check('a note posted now is pinned to the selected words', !!sonsNote && sonsNote.quote === 'his two sons', JSON.stringify(sonsNote));
await p.locator('.ske-tab-btn[data-tab="markup"]').click(); await W(300);
const mt = await ed.get(); const cur = await p.evaluate(() => window.SkunkpetsEditorDebug.cursor());
check('Markup selects the same words', mt.slice(cur - 'his two sons'.length, cur) === 'his two sons', mt.slice(cur - 20, cur));
await p.locator('.ske-pop-diskette').click(); await W(900);
check('◉ in the popup makes a zone on those words and opens it', (await text('.ske-tab-btn.ske-tab-on')).startsWith('Diskette') && (await ed.get()).includes('[[diskette: 10 | on: his two sons | ]]') && (await p.locator('.ske-react-open textarea').count()) === 1);
await p.locator('.ske-react-open textarea').fill('Two sons? Bruce, is that you?'); await W(1300);
check('...her line goes into the page', (await ed.get()).includes('[[diskette: 10 | on: his two sons | Two sons? Bruce, is that you?]]'));
check('..."Asked again" is hidden with one line', (await p.locator('.ske-react-open .ske-cycle:not([hidden])').count()) === 0);
await p.locator('.ske-react-open textarea').press('End'); await p.locator('.ske-react-open textarea').press('Enter'); await W(100);
await p.locator('.ske-react-open textarea').nth(1).fill('Still two sons.'); await W(1300);
check('...Enter adds another line, saved as an alternative', (await ed.get()).includes('| Two sons? Bruce, is that you? >> Still two sons.]]') && (await p.locator('.ske-react-open .ske-line-num').first().isVisible()));
check('...and "Asked again" shows with two', (await p.locator('.ske-react-open .ske-cycle:not([hidden])').count()) === 1);
await p.locator('.ske-react-open .ske-cycle-btn', { hasText: 'Loop' }).click(); await W(1300);
check('...Loop sets the cycle', (await ed.get()).includes('[[diskette: 10 | loop | on: his two sons | Two sons? Bruce, is that you? >> Still two sons.]]'), (await ed.get()).match(/\[\[diskette: 10[^\]]*his two sons[^\]]*\]\]/)?.[0]);
await p.locator('.ske-react-open .ske-cycle-btn', { hasText: 'In order' }).click();
await p.locator('.ske-react-open textarea').nth(1).fill(''); await p.locator('.ske-react-open textarea').nth(1).press('Backspace'); await W(1300);
check('...Backspace in an empty line removes it', (await p.locator('.ske-react-open textarea').count()) === 1 && (await ed.get()).includes('[[diskette: 10 | on: his two sons | Two sons? Bruce, is that you?]]') && (await p.locator('.ske-react-open .ske-cycle:not([hidden])').count()) === 0);
check('...and the popup shows it', (await text('.ske-pop')).includes('Two sons?'), await text('.ske-pop'));
await p.keyboard.press('Escape'); await W(200);
check('Esc clears the selection', (await p.locator('.ske-pop').count()) === 0 && (await p.locator('.ske-crumbs.ske-hidden').count()) === 1);
// Edit mode: click a thing
await p.locator('.ske-aim-btn').click(); await W(200);
await p.mouse.click(...await box('.taskbar-clock')); await W(500);
check('Edit mode: clicking the clock selects it', (await text('.ske-crumbs')).includes('the clock'), await text('.ske-crumbs'));
check('...and the popup shows her clock line', (await text('.ske-pop-diskette')).includes('“'), await text('.ske-pop-diskette'));
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await W(200);
check('Esc twice leaves Edit mode', (await p.locator('.ske-aim-btn.ske-aim-on').count()) === 0);

// ---------- Diskette tab overview: drafts, lines, and saving ----------
await p.locator('.ske-tab-btn[data-tab="diskette"]').click(); await W(500);
const ticketCard = p.locator('.ske-react').filter({ hasText: 'blacked that out' });
check('the overview groups reactions by place', (await text('.ske-tab-diskette')).includes('DESKTOP & APPS') || (await p.locator('.ske-group-title').filter({ hasText: 'Desktop & apps' }).count()) === 1);
await ticketCard.locator('.ske-react-head').click(); await W(200);
await ticketCard.locator('textarea').fill('A ticket to NetCon 2004! Somebody had fun.'); await W(1200);
await p.locator('.ske-react-open .ske-icon-btn', { hasText: 'Make draft' }).first().click(); await W(800);
check('Make draft moves it to Drafts, last', /Diskette \(1 drafts?\)/.test(await text('.ske-tab-btn[data-tab="diskette"]')) && (await p.locator('.ske-group-drafts .ske-react').count()) === 1, await text('.ske-tab-btn[data-tab="diskette"]'));
await p.locator('.ske-group-drafts .ske-icon-btn', { hasText: 'Publish' }).click(); await W(800);
check('Publish puts it back', (await text('.ske-tab-btn[data-tab="diskette"]')) === 'Diskette');
check('editing a reaction outside the articles edits that passage', (await text('.ske-pending')).includes('RenderNetconTicket'), await text('.ske-pending'));
await p.locator('.ske-tab-diskette .ske-icon-btn', { hasText: 'Line for something you can' }).click();
await p.locator('.ske-modal select').first().selectOption('outside');
await p.locator('.ske-modal textarea').fill('Out there? Nothing!');
await p.locator('.ske-modal .ske-save').click(); await W(800);
check('a line for something you can\'t point at', (await p.$$eval('.ske-tab-diskette textarea', (t) => t.map((x) => x.value))).includes('Out there? Nothing!'));
await p.locator('.ske-save').first().click(); await W(500);
await p.locator('.ske-review-save').click(); await W(1500);
const savedTwee = sent.tree && sent.tree.tree.find((e) => e.path === 'tools/skunkpets-redux/skunkpets-redux.twee');
check('saving commits reactions with everything else', !!savedTwee && savedTwee.content.includes('data-say="A ticket to NetCon 2004! Somebody had fun."') && savedTwee.content.includes('<p data-look="outside">Out there? Nothing!</p>') && savedTwee.content.includes('data-say="Two sons? Bruce, is that you?">his two sons</span>'));
await p.locator('.ske-tab-btn[data-tab="events"]').click(); await W(1500);
check('Events lists events, ticked when they happened', (await p.locator('.ske-event-done').filter({ hasText: 'game-started' }).count()) === 1 && (await p.locator('.ske-event').count()) > 20);
await p.locator('.ske-tab-btn[data-tab="markup"]').click(); await W(300);

// Closing the panel leaves the game clean
await goTo('REV (Recast Entertainment Ventures)'); await W(900);
await p.locator('.ske-close').click(); await W(900);
check('closed panel: no highlights or red links in the game', (await p.locator('.browser-page-content mark.ske-mark, .browser-page-content .ske-mark-badge, .browser-page-content .ske-redlink').count()) === 0);
check('comments never go into the game itself', !fs.readFileSync(`${ROOT}/src/building/skunkpets/index.html`, 'utf8').includes('comments.json'));
check('no Harlowe errors', (await p.locator('tw-error').count()) === 0, await p.locator('tw-error').allInnerTexts().then((a) => a.join(' | ').slice(0, 300)));
check('no script errors', errs.length === 0, errs.join(' | '));
await b.close();
console.log(failures ? `\n${failures} failed` : '\nall editor checks passed');
process.exit(failures ? 1 : 0);
