// Unit checks for the editor's text logic (no browser):
//   node tools/skunkpets-redux/editor/unit-test.js
// Also builds a copy of the game with one new page per template, to prove
// build.js accepts what the editor writes and makes articles searchable.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const E = require('./editor.js');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};

// What a reader sees
check('gameText drops link targets and markup',
  E.gameText("[[the founder->Tom Barry]] was ''very'' rich.\\\n<h2>Next</h2>") === 'the founder was very rich. Next',
  JSON.stringify(E.gameText("[[the founder->Tom Barry]] was ''very'' rich.\\\n<h2>Next</h2>")));
check('gameText keeps URLs', E.gameText('see https://x.com') === 'see https://x.com');
check('gameText decodes &#95;', E.gameText('READ&#95;ME') === 'READ_ME');

// Diskette's response zones and page comments
const zone = E.fromFriendly('[[diskette: 80 | shake | Say "hi" & <b>wave</b>]]');
check('a zone becomes its span', zone === '<span class="diskette-zone" data-radius="80" data-mood="shake" data-say="Say \u201chi\u201d &amp; &lt;b&gt;wave&lt;/b&gt;"></span>', zone);
check('...and comes back (straight quotes turn curly)', E.toFriendly(zone) === '[[diskette: 80 | shake | Say \u201chi\u201d & <b>wave</b>]]', E.toFriendly(zone));
check('a zone without a radius gets the default', E.fromFriendly('[[diskette: Hello]]').includes('data-radius="60"'));
check('a page comment', E.fromFriendly('[[diskette: page | Hi!]]') === '<span class="diskette-page" data-say="Hi!"></span>');
check('zones are not links', E.linkTargets('[[diskette: 9 | x]] [[A]]').length === 1 && E.gameText('a [[diskette: 9 | x]] b') === 'a b');

// Reactions: conditions, TODO notes, the Diskette tab's edits
const cz = E.fromFriendly('[[diskette: 40 | wide | if: zoom-started, !visited:kraska1 | Ooh!]]');
check('a zone with an if', cz === '<span class="diskette-zone" data-radius="40" data-mood="wide" data-if="zoom-started, !visited:kraska1" data-say="Ooh!"></span>', cz);
check('...comes back the same', E.toFriendly(cz) === '[[diskette: 40 | wide | if: zoom-started, !visited:kraska1 | Ooh!]]', E.toFriendly(cz));
check('TODO notes are read with their priority', JSON.stringify(E.todoOf('TODO P1-04 The ticket')) === '{"prio":1,"num":4,"note":"The ticket"}' && E.todoOf('Hello') === null);
const rsrc = 'a' + cz + ' b <span class="diskette-page" data-say="TODO P2 page"></span> <span class="diskette-zone" data-radius="9" data-say="w"><i>x</i></span>';
const found = E.findReactions(rsrc);
check('findReactions finds zones, page comments and wrapping zones', found.length === 3 && found[0].cond === 'zoom-started, !visited:kraska1' && found[1].todo.prio === 2 && !found[2].empty);
check('editReaction rewrites one', E.findReactions(E.editReaction(rsrc, 1, { say: 'Hi' }))[1].say === 'Hi' && E.editReaction(rsrc, 1, { say: 'Hi' }).startsWith('a' + cz));
check('...deletes an empty one, and unwraps one around words (keeping them)', E.findReactions(E.editReaction(rsrc, 0, null)).length === 2 && E.editReaction(rsrc, 2, null).endsWith(' <i>x</i>'));
check('...including one around other tags', E.editReaction('<span class="diskette-zone" data-say="a"><span class="x"></span></span>', 0, null) === '<span class="x"></span>');
const para = 'Hi <span class="diskette-zone" data-radius="10" data-draft="1" data-say="Wow">the (link: "founder")[(set: $navPending to "Tom Barry")(display: "func-navigate")] is rich</span>.';
check('a zone around a paragraph with links uses around … [[/diskette]]', E.toFriendly(para) === 'Hi [[diskette: 10 | draft | around | Wow]]the [[founder->Tom Barry]] is rich[[/diskette]].' && E.fromFriendly(E.toFriendly(para)) === para, E.toFriendly(para));
check('drafts are read and written', E.findReactions(para)[0].draft === true && E.fromFriendly('[[diskette: draft | shake | 30 | Hey]]') === '<span class="diskette-zone" data-radius="30" data-mood="shake" data-draft="1" data-say="Hey"></span>');
check('mergeLines carries edits over a newer base, or gives up on a clash', E.mergeLines('a\nb\nc', 'a\nB\nc', 'a\nb\nC') === 'a\nB\nC' && E.mergeLines('a\nb\nc', 'a\nX\nc', 'a\nY\nc') === null);
const shapes = E.findReactions(E.fromFriendly('[[diskette: 10 | on: two words | a]] [[diskette: 10 | on photo: p.jpg | b]] [[diskette: 70 | c]] [[diskette: page | d]]')).map((r) => r.shape + ':' + (r.words || r.photo || r.radius));
check('zones cover words, a photo, or a point', shapes.join() === 'words:two words,element:p.jpg,point:70,page:60', shapes.join());
check('words zones round-trip', E.toFriendly(E.fromFriendly('x [[diskette: 10 | on: two words | a]] y')) === 'x [[diskette: 10 | on: two words | a]] y');
const looks = '<!-- x -->\n<p data-look="self icon-diskette">Me</p>\n<p data-look="page" data-mood="wide" data-if="zoom-started">TODO P2 x</p>\n';
check('DisketteLooks lines', E.findLooks(looks).length === 2 && E.findLooks(looks)[1].todo.prio === 2 && E.findLooks(looks)[0].keys.join() === 'self,icon-diskette');
check('...edit, delete and add', E.findLooks(E.editLook(looks, 1, { text: 'Yo' }))[1].text === 'Yo' && E.findLooks(E.editLook(looks, 0, null)).length === 1 && E.findLooks(E.addLook(looks, { keys: ['clock'], text: 'tick' })).length === 3);
check('GameEvents entries', JSON.stringify(E.findEvents('<p data-event="b" data-after="a, c">B</p>')) === '{"id":"b","after":["a","c"],"text":"B"}'.replace(/^/, '[').replace(/$/, ']'));
const prose = 'Her first game, "Bad Door", was a hit. Next [[Tom Barry]] here.';
check('a new zone goes at the end of the sentence, not inside a title', E.safeInsertPos(prose, 18) === prose.indexOf('hit.') + 4);
check('...or after a link', E.safeInsertPos(prose, prose.indexOf('Barry')) === prose.length);
const tw = fs.readFileSync(path.join(__dirname, '..', 'skunkpets-redux.twee'), 'utf8');
check('no reaction text has a straight double quote entity (Harlowe breaks on it)', !/data-say="[^"]*&quot;/.test(tw));

// Repeats and follow-ups
const rz = '[[diskette: 10 | shake | loop | if: zoom-started | on: these words | then: Ugh, something nicer? | One >> Two]]';
check('alternatives, repeats and a follow-up round-trip', E.toFriendly(E.fromFriendly(rz)) === rz && E.findReactions(E.fromFriendly(rz))[0].then === 'Ugh, something nicer?' && E.findReactions(E.fromFriendly(rz))[0].cycle === 'loop');
check('a line for an app keeps its repeats and follow-up', E.lookLine({ keys: ['clock'], text: 'a &gt;&gt; b', cycle: 'random', then: 'Bye' }) === '<p data-look="clock" data-cycle="random" data-then="Bye">a &gt;&gt; b</p>');

// Pinning comments
const doc = 'the cat sat. the cat ran. the dog sat.';
const a2 = E.makeAnchor(doc, doc.indexOf('the cat ran'), doc.indexOf('the cat ran') + 7);
check('makeAnchor keeps words and surroundings', a2.quote === 'the cat' && a2.prefix === 'the cat sat. ' && a2.suffix.startsWith(' ran'));
const at = E.locateQuote(doc, a2);
check('locateQuote picks the right one of two matches', at && at.from === doc.indexOf('the cat ran'));
check('locateQuote survives edits elsewhere', E.locateQuote('NEW. ' + doc, a2).from === ('NEW. ' + doc).indexOf('the cat ran'));
check('locateQuote gives null when the words are gone', E.locateQuote('nothing here', a2) === null);
check('old comments (quote only) still locate', E.locateQuote(doc, { quote: 'dog' }).from === doc.indexOf('dog'));

// Comment threads
let data = { comments: [] };
data = E.applyCommentOp(data, { type: 'add', comment: { id: 'r', page: 'P', text: 'root', quote: 'x' } });
data = E.applyCommentOp(data, { type: 'add', comment: { id: 'c', page: 'P', text: 'reply', parent: 'r' } });
data = E.applyCommentOp(data, { type: 'reanchor', id: 'r', anchor: { quote: 'y', prefix: 'a', suffix: 'b' } });
check('re-pin moves the anchor', data.comments[0].quote === 'y' && data.comments[0].prefix === 'a');
data = E.applyCommentOp(data, { type: 'resolve', id: 'r', resolved: true, by: 'Sofe' });
check('resolve records who', data.comments[0].resolved && data.comments[0].resolvedBy === 'Sofe');
data = E.applyCommentOp(data, { type: 'delete', id: 'r' });
check('deleting a comment deletes its replies', data.comments.length === 0);

// Page names
const existing = ['Tom Barry', 'Skunkpets'];
check('good name', E.pageNameProblem('Bin City', existing) === '');
check('clash ignores case', E.pageNameProblem('tom barry', existing) !== '');
check('no brackets or quotes', E.pageNameProblem('A [b]', existing) !== '' && E.pageNameProblem('A "b"', existing) !== '');
check('no -> or leading :', E.pageNameProblem('a->b', existing) !== '' && E.pageNameProblem(':x', existing) !== '');
check('no edge spaces', E.pageNameProblem(' x', existing) !== '');

// Diff and history
const d = E.lineDiff('a\nb\nc', 'a\nB\nc\nd');
check('lineDiff', d.map((r) => r.type + r.text).join('|') === ' a|-b|+B| c|+d', d.map((r) => r.type + r.text).join('|'));
check('lineDiff of a new page is all additions', E.lineDiff('', 'x\ny').every((r) => r.type === '+'));
check('pagesInMessage', JSON.stringify(E.pagesInMessage('Edit Winkipedia: A, Bin City (new), photo x.jpg\n\nbody')) === '["A","Bin City"]');
check('pagesInMessage ignores other commits', E.pagesInMessage('Comment on A (Leo)').length === 0);

// New pages go through build.js
const repo = path.resolve(__dirname, '..', '..', '..');
const tool = path.join(repo, 'tools', 'skunkpets-redux');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ske-'));
fs.cpSync(tool, path.join(tmp, 'tool'), { recursive: true, filter: (p) => !p.includes('node_modules') });
let twee = fs.readFileSync(path.join(tool, 'skunkpets-redux.twee'), 'utf8');
const names = E.TEMPLATES.map((t) => 'Editor Test ' + t.id);
E.TEMPLATES.forEach((t, i) => { twee = E.insertPassage(twee, names[i], t.tags, E.fromFriendly(t.body(names[i]))); });
check('inserted pages are found again', names.every((n) => E.hasPassage(twee, n)));
check('inserting then replacing works', E.replacePassage(twee, names[0], 'changed').before.includes('<h1>' + names[0] + '</h1>'));
fs.writeFileSync(path.join(tmp, 'tool', 'skunkpets-redux.twee'), twee);
fs.copyFileSync(path.join(repo, 'src', 'building', 'skunkpets', 'index.html'), path.join(tmp, 'index.html'));
let built = '';
try {
  execFileSync('node', [path.join(tmp, 'tool', 'build.js'), path.join(tmp, 'index.html')], { stdio: 'pipe' });
  built = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
} catch (e) { console.log(String(e.stderr || e)); }
check('build.js accepts a new page from every template', names.every((n) => built.includes(`name="${n}"`)));
const indexPassage = (built.match(/<tw-passagedata[^>]*name="WinkiIndex"[^>]*>([\s\S]*?)<\/tw-passagedata>/) || [])[1] || '';
check('new Winkipedia articles are searchable', indexPassage.includes('Editor Test article') && !indexPassage.includes('Editor Test fanwiki'));
fs.rmSync(tmp, { recursive: true, force: true });

console.log(failures ? `\n${failures} failed` : '\nall unit checks passed');
process.exit(failures ? 1 : 0);
