// Fool's Gold UI. All logic lives in the engine/parser modules; this file wires the page.
import { compileWorld } from './world.js?v=a38fab67';
import { parse, queryToText, chipsFor, emptyQuery } from './parser.js?v=a38fab67';
import { estimate, findConflicts, timeUnit } from './engine.js?v=a38fab67';
import { buildFields, applyNumber, tokenRoles } from './fields.js?v=a38fab67';
import { findOffer } from './lists.js?v=a38fab67';
import { suggestPrompts } from './suggest.js?v=a38fab67';
import { readFact } from './facts.js?v=a38fab67';
import { emptyCart, addToCart, cartTotals, lineResult, readSentence, withShop, stripShop, unitsInCart, cartText } from './cart.js?v=a38fab67';
import { formatMoney, formatRange, formatFull, parseMoney, niceRound } from './money.js?v=a38fab67';
import {
  ECONOMY_TAGS, MODIFIERS, GROUPS, RARITIES, TIER_NAMES, FAMILIES, SAMPLE_QUERIES, WORLD_PRESETS, CURRENCY_PRESETS, currencyPresetOf, SRD_ATTRIBUTION, slug,
} from './data.js?v=a38fab67';
import { applicable } from './engine.js?v=a38fab67';
import { load, save, normalizeWorld, newItemId } from './store.js?v=a38fab67';
import { parseSetting, baseFor, storedFor } from './setting.js?v=a38fab67';
import { candidatesFor, candidateFromEntry, previewWith, storedPrice, newItemFrom } from './guess.js?v=a38fab67';
import { complete } from './complete.js?v=a38fab67';
import { inferTags, tagCandidate, rowsFor, optionsOf, rowLabel, KINDS } from './appraise.js?v=a38fab67';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const fx = n => String(+(+n).toFixed(2));

let S = load();
let world = null, ctx = null;
const st = { setting: null, settingDismissed: '', sheet: { open: false, mode: 'break' }, dpage: null, wmodal: false, cartEdit: null, cartOffer: null, cartOfferDismissed: '', cartRead: null, cartText: '', cartWhy: false, cartShopOpen: false, haggleOpen: false, hgMemo: null, cartHaggleOpen: false, curOpen: false, curArm: '', fact: { text: '', res: null, err: '' }, wtab: 'Item lists', wrename: false, wnew: false, guess: null, slot: null, numOpen: false, more: false, offer: null, offerDismissed: '', text: '', parsed: null, query: emptyQuery(), est: null, fields: null, flow: { cat: null, search: '' }, histTimer: null };

function useWorld(id) {
  world = S.worlds.find(w => w.id === id) || S.worlds[0];
  normalizeWorld(world);
  S.activeId = world.id;
  ctx = compileWorld(world);
}
const cur = () => world.currency;
const money = bu => formatMoney(bu, cur(), { round: !!world.dials.round });
const range = (lo, hi) => formatRange(lo, hi, cur(), { round: !!world.dials.round });
let saveWarned = false;
const persist = () => { const ok = save(S); if (!ok && !saveWarned) { saveWarned = true; toast('This browser is not saving your worlds. Back them up with Copy world under World.'); } return ok; };

// ---------- core flow ----------
function fromText(text, opts = {}) {
  st.text = text;
  st.parsed = parse(text, ctx);
  st.query = st.parsed.query;
  if (text !== st.settingDismissed) st.settingDismissed = '';
  if (text !== st.offerDismissed) st.offerDismissed = '';
  st.setting = st.settingDismissed ? null : parseSetting(text, ctx);
  run(opts);
}
function fromQuery(q) {
  st.setting = null;
  st.query = q;
  st.text = queryToText(q, ctx);
  $('#q').value = st.text;
  st.parsed = { query: q, unrecognized: [], suggestions: [], notes: [], parts: parse(st.text, ctx).parts };
  run();
}
function run(opts = {}) {
  const q = st.query;
  st.est = q.subject ? estimate(q, ctx) : null;
  if (q.subject) st.guess = null; // a priced thing ends any unknown-word card
  st.offer = !q.subject && st.text && !st.setting && st.offerDismissed !== st.text ? findOffer(st.text, world, ctx) : null;
  st.cartOffer = null;
  if (st.text && st.text.length > 6 && st.text !== st.cartOfferDismissed && !st.setting && !st.cartEdit) { const r = readSentence(st.text, ctx); if (r.items.length >= 2) st.cartOffer = r; }
  st.fields = st.est && st.est.ok ? buildFields(q, st.est, ctx) : null;
  if (st.slot && !(st.fields && st.fields.slots.some(x => x.id === st.slot))) { st.slot = null; st.numOpen = false; }
  S.last = st.text; persist();
  renderAll();
  if (st.est && st.est.ok && st.text && !opts.noHistory && !st.setting) scheduleHistory();
}
// Coin letters (gp, sp, cp) are shown as letter glyphs when the world picks them.
function glyphify(root) {
  if (!root || !world) return;
  const map = new Map((world.currency.denominations || []).filter(d => d.glyph).map(d => [String(d.id).toLowerCase(), d.glyph]));
  if (!map.size) return;
  const ids = [...map.keys()].map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp('(\\d)(\\s?)(' + ids + ')(?![A-Za-z])', 'gi');
  const lead = new RegExp('^(\\s?)(' + ids + ')(?![A-Za-z])', 'i');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const span = (L, id) => { const el = document.createElement('span'); el.className = 'cg'; el.textContent = L; el.setAttribute('title', id); return el; };
  for (const n of nodes) {
    const el = n.parentElement;
    if (!el || el.closest('textarea, input, select, option, script, style, .cg, .glyphs')) continue;
    let text = n.nodeValue, frag = null, pos = 0;
    const out = () => (frag || (frag = document.createDocumentFragment()));
    if (el.matches('.num small') ) { const lm = lead.exec(text); if (lm) { out().append(lm[1]); out().append(span(map.get(lm[2].toLowerCase()), lm[2])); pos = lm[0].length; } }
    re.lastIndex = pos;
    let m;
    while ((m = re.exec(text))) {
      out().append(text.slice(pos, m.index) + m[1] + m[2]);
      out().append(span(map.get(m[3].toLowerCase()), m[3]));
      pos = m.index + m[0].length;
    }
    if (frag) { frag.append(text.slice(pos)); n.replaceWith(frag); }
  }
}
function renderAll() {
  $('#clearBtn').hidden = !st.text;
  renderUnderstanding(); renderResult(); renderTray(); renderInput(); renderSheet(); renderHistory(); renderCartPill();
}

// ---------- the sentence, colored by what each word did ----------
function renderInput() {
  const text = st.text, mirror = $('#mirror');
  const roles = st.setting ? [] : tokenRoles(st.parsed && st.parsed.parts, ctx);
  let out = '', at = 0;
  for (const t of roles) {
    if (t.start < at) continue;
    out += esc(text.slice(at, t.start)) + `<span class="tok ${t.role === 'bad' ? 'bad' : 'r-' + t.role}">${esc(text.slice(t.start, t.end))}</span>`;
    at = t.end;
  }
  out += esc(text.slice(at));
  mirror.innerHTML = out + '​';
  const q = $('#q');
  q.style.height = 'auto';
  const h = Math.min(q.scrollHeight, 96);
  q.parentElement.style.height = Math.max(h, 22) + 'px';
  q.style.height = '100%';
}

// ---------- hints: only what needs an answer ----------
function renderUnderstanding() {
  if (st.cartOffer) { $('#understanding').innerHTML = ''; return; }
  const p = st.parsed, out = [];
  if (p && !st.setting) {
    for (const [i, s] of p.suggestions.entries()) out.push(`<div class="hint">Did you mean <button class="pill" data-act="fix" data-i="${i}">${esc(s.to)}</button> instead of <span class="ign">${esc(s.from)}</span>?</div>`);
    const sugFrom = new Set(p.suggestions.flatMap(s => s.from.split(/\s+/).map(x => x.toLowerCase())));
    const rest = p.unrecognized.filter(u => !sugFrom.has(u.toLowerCase()));
    if (rest.length && (st.query.subject || !unknownPhrase())) out.push(`<div class="hint"><span>Ignored:</span> ${rest.map(u => `<span class="ign">${esc(u)}</span>`).join(' ')}</div>`);
  }
  $('#understanding').innerHTML = out.length ? `<div class="hints">${out.join('')}</div>` : '';
}
const sampleList = () => suggestPrompts(world, ctx);
function factsList(e) {
  const facts = [];
  if (e.sense) facts.push(esc(e.sense));
  if (e.assumptions.length) facts.push(`Assumed: ${esc(e.assumptions.map(a => a.text).join(', '))}.`);
  for (const n of [...e.notes, ...(st.parsed ? st.parsed.notes : [])]) facts.push(esc(n));
  return facts;
}
const np = str => { const m = /^(\S+)\s*(.*)$/.exec(str); return m ? { n: m[1], u: m[2] } : { n: str, u: '' }; };
const ACTION_WORD = { buy: 'buying', sell: 'selling', value: 'appraising' };

function slotRow(s) {
  const open = st.slot === s.id;
  let v;
  if (s.filled) v = `<span class="dot r-${s.role}"></span>${esc(s.value)}`;
  else if (s.assumed) v = `${esc(s.assumed)} <i>${s.id === 'item' ? 'assumed' : 'auto'}</i>`;
  else v = 'not set';
  const hint = !s.filled && s.options.length ? `<span class="hint">${esc(money(s.swing[0]))} to ${esc(money(s.swing[1]))}</span>` : (s.id === 'item' ? '' : '');
  return `<button class="slot r-${s.role}${s.filled ? '' : (s.assumed ? ' assumed unset' : ' unset')}${open ? ' open' : ''}" data-act="slot" data-id="${esc(s.id)}"><span class="k">${esc(s.label)}</span><span class="v">${v}</span>${hint}<span class="chev">${open ? '&#9662;' : '&#8250;'}</span></button>`;
}
function renderResult() {
  renderResultCore();
  let pre = '';
  if (st.cartEdit) pre += editBarHtml();
  if (st.cartOffer) pre += offerHtml();
  if (st.cartOffer) { $('#result').innerHTML = pre; return; }
  if (pre) $('#result').insertAdjacentHTML('afterbegin', pre);
}
function renderResultCore() {
  const el = $('#result'), q = st.query, e = st.est;
  if (st.setting) { el.innerHTML = settingCard(); return; }
  if (!st.text) { st.glintKey = ''; el.innerHTML = `<p class="empty">Describe what to price: how many, buying or selling, where, how fast.</p>`; return; }
  if (!q.subject && st.offer) {
    const o = st.offer;
    el.innerHTML = `<section class="guess offer"><div class="gh"><b>${esc(o.item)}</b> is in the <b>${esc(o.label)}</b> list, which is off for this world.</div><button class="cta" data-act="offer-on">Turn on ${esc(o.label)}</button><button class="cta2" data-act="offer-no">Not now</button></section>`;
    return;
  }
  if (!q.subject) {
    const g = guessCard();
    el.innerHTML = g || (st.cartOffer ? '' : `<p class="empty">No item found. ${st.parsed && st.parsed.suggestions.length ? 'Check the suggestion above, or name' : 'Name'} an item, service or trip, or pick from the list.</p><button class="cta2" data-act="browse">Browse the list</button>`); return;
  }
  if (!e.ok && e.error === 'conflict') {
    el.innerHTML = e.conflicts.map(c => `<div class="conflict"><p><b>${esc(GROUPS[c.group].ask)}:</b> pick one.</p><div class="row">${c.ids.map((id, i) => `<button class="pill" data-act="resolve" data-id="${esc(id)}">${esc(c.labels[i])}</button>`).join('')}</div></div>`).join('');
    return;
  }
  const ent = e.entry, pr = np(money(e.typical));
  const pre = e.pre || { typical: e.typical, lo: e.lo, hi: e.hi };
  const posOf = p => (pre.hi > pre.lo ? Math.min(100, Math.max(0, (Math.log(p) - Math.log(pre.lo)) / (Math.log(pre.hi) - Math.log(pre.lo)) * 100)) : 50);
  const pos = posOf(e.typical), hg = e.haggle;
  const qtyTxt = q.qty && !timeUnit(ent) ? (q.qty.lo === q.qty.hi ? q.qty.lo : q.qty.lo + ' to ' + q.qty.hi) + (q.qty.unit === 'lb' ? ' lb of ' : ' × ') : '';
  const spanTxt = q.span && timeUnit(ent) ? ', ' + (q.span.lo === q.span.hi ? q.span.lo : q.span.lo + ' to ' + q.span.hi) + ' ' + q.span.unit + (q.span.hi === 1 ? '' : 's') : '';
  const what = qtyTxt + ent.name + (q.rarity && ent.curve ? ', ' + q.rarity : '') + spanTxt;
  const meta = [e.each ? money(e.each) + ' ' + (e.eachLabel || 'each') : ''].filter(Boolean);
  const f = st.fields || { shown: [], more: [] };
  const rows = [...f.shown, ...(st.more ? f.more : [])].map(slotRow).join('');
  const moreRow = f.more.length ? `<button class="slot more" data-act="more"><span>${st.more ? 'Fewer fields' : 'More fields'}</span><span class="hint">${f.more.length}</span></button>` : '';
  const glintNow = st.glintKey !== ent.id; st.glintKey = ent.id;
  el.innerHTML = `<section class="price${hg ? ' hg ' + (hg.good ? 'good' : 'bad') : ''}">
    <div class="what">${esc(what)}</div>
    <div class="prow"><button class="pricebtn" data-act="copy" aria-label="Copy price"><span class="num">${esc(pr.n)}${pr.u ? `<small>${esc(pr.u)}</small>` : ''}</span></button><div class="pside">${haggleBtn(q)}${addCartBtn(q)}</div></div>
    <div class="span dragbar" role="slider" tabindex="0" aria-label="Haggle along the range" aria-valuemin="${esc(String(Math.round(pre.lo)))}" aria-valuemax="${esc(String(Math.round(pre.hi)))}" aria-valuenow="${esc(String(Math.round(e.typical)))}" aria-valuetext="${esc(money(e.typical))}" data-lo="${pre.lo}" data-hi="${pre.hi}" data-typ="${pre.typical}"><div class="rule"></div><div class="band"></div>${hg ? `<div class="notch" style="left:${posOf(pre.typical).toFixed(1)}%"></div>` : ''}<div class="tick" style="left:${pos.toFixed(1)}%"></div></div>
    <div class="ends"><span>${esc(money(pre.lo))}</span><span>${esc(money(pre.hi))}</span></div>
    ${hg ? `<div class="hgnote">${hg.fixed ? 'Agreed at ' + esc(money(hg.price)) : 'Haggled ' + Math.abs(hg.pct) + '% ' + (hg.pct < 0 ? 'off' : 'on top')}. Was ${esc(money(pre.typical))}.</div>` : ''}
    ${st.haggleOpen ? haggleHtml(e) : ''}
    ${meta.length ? `<div class="meta">${meta.map(esc).join(' <i>·</i> ')}</div>` : ''}
  </section>
  <div class="sep"><span>Fields from your sentence</span></div>
  <div class="fields">${rows}${moreRow}</div>`;
  if (glintNow) flash();
}

// ---------- docked tray: the options for the open field, or quick modifiers ----------
function slotById(id) { const f = st.fields; return f ? f.slots.find(x => x.id === id) : null; }
function renderTray() {
  const t = $('#tray'), e = st.est;
  if (st.setting || st.cartOffer) { t.innerHTML = ''; return; }
  const plus = `<button class="plus" data-act="start" aria-label="Buy or sell, with buttons" title="Buy or sell, with buttons"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`;
  const unsure = !(e && e.ok && st.query.subject);
  if (st.text && (unsure || st.guess)) {
    const rows = complete(st.text, ctx, { cats: FLOW_CATS, catOf });
    st.ac = rows;
    t.innerHTML = rows.length ? `<div class="trayrow">${plus}<div class="quick" role="listbox" aria-label="Suggestions">${rows.map((r, i) => `<button class="q ac" role="option" data-act="ac" data-i="${i}">${r.path.map((x, k) => k === r.path.length - 1 ? `<b>${esc(x)}</b>` : `<i>${esc(x)}</i>`).join('')}</button>`).join('')}</div></div>` : '';
    return;
  }
  if (st.guess) { t.innerHTML = ''; return; }
  if (!st.text) { t.innerHTML = `<div class="trayrow">${plus}<div class="quick">${sampleList().map((x, i) => `<button class="q sample" data-act="sample" data-i="${i}">${esc(x)}</button>`).join('')}</div></div>`; return; }
  if (!(e && e.ok && st.query.subject)) { t.innerHTML = ''; return; }
  const slot = st.slot ? slotById(st.slot) : null;
  if (slot && slot.id !== 'item') {
    let h = `<div class="opts">${slot.options.map(o => {
      const pct = Math.round(o.delta * 100), d = Math.abs(pct) < 1 ? 'same' : (pct > 0 ? '+' : '') + pct + '%';
      return `<button class="o${o.sel ? ' sel' : ''}" data-act="slot-opt" data-key="${esc(o.key)}"><b>${esc(o.label)}</b><span>${esc(money(o.typical))}</span><em class="${pct > 0 ? 'up' : pct < 0 ? 'down' : ''}">${o.sel ? 'selected' : d}</em></button>`;
    }).join('')}${slot.kind === 'number' ? `<button class="o custom" data-act="num-open"><b>Other</b></button>` : ''}</div>`;
    if (slot.kind === 'number' && st.numOpen) {
      h = `<div class="numedit"><input id="numIn" type="number" inputmode="decimal" min="1" step="1" placeholder="Number" aria-label="Number">${slot.units ? `<select id="numUnit" aria-label="Unit">${slot.units.map(([u, l]) => `<option value="${u}">${l}</option>`).join('')}</select>` : ''}<button class="q on" data-act="num-set">Set</button><button class="q" data-act="num-open" data-off="1">Back</button></div>`;
    }
    t.innerHTML = h; return;
  }
  const ent = e.entry, side = e.side, q = st.query;
  const ok = id => { const m = ctx.mods.get(id); return !!(m && applicable(m, ent, side)); };
  const chips = [];
  if (ent.kind === 'good' || ent.kind === 'property') chips.push(`<button class="q" data-act="quick" data-k="deal">${q.action === 'sell' ? 'Buy' : 'Sell'}</button>`);
  chips.push(`<button class="q${q.mods.includes('rush') ? ' on' : ''}${ok('rush') ? '' : ' off'}" data-act="quick" data-k="rush">Rush</button>`);
  chips.push(`<button class="q${q.mods.includes('black-market') ? ' on' : ''}${ok('black-market') ? '' : ' off'}" data-act="quick" data-k="black-market">Black market</button>`);
  chips.push(`<button class="q${world.dials.round ? ' on' : ''}" data-act="round" aria-pressed="${!!world.dials.round}">Round</button>`);
  chips.push(`<button class="q" data-act="sheet" data-mode="break">Why this price?</button>`);
  t.innerHTML = `<div class="quick">${chips.join('')}</div>`;
}


// ---------- haggle: a negotiated change to one price, twin to the cart ----------
const HAG_I = '<i class="hgi" aria-hidden="true">%</i>';
const favour = (pct, action) => (action === 'sell' ? pct > 0 : pct < 0);
const pctText = p => (p < 0 ? '−' : '+') + Math.abs(p) + '%';
const haggleLabel = h => (h.fixed ? 'Agreed ' + money(h.price) : 'Haggled ' + pctText(h.pct));
function haggleBtn(q) {
  if (q.action === 'value') return '';
  const h = st.est && st.est.ok ? st.est.haggle : null;
  if (h) return `<span class="hgwrap ${h.good ? 'good' : 'bad'}"><button class="haggle on" data-act="haggle-open" aria-expanded="${st.haggleOpen}">${HAG_I}<span>${esc(haggleLabel(h))}</span></button><button class="hgx" data-act="haggle-off" aria-label="Turn haggle off">&times;</button></span>`;
  return `<button class="haggle" data-act="haggle-open" aria-expanded="${st.haggleOpen}">${HAG_I}<span>Haggle</span></button>`;
}
function hgPanel(o) {
  return `<div class="hgpanel"><div class="hghead"><b>${o.title}</b><button class="linkbtn" data-act="${o.done}">Done</button></div>
    <p class="hghint">${o.hint}</p>
    <div class="hgseg" role="group" aria-label="Quick haggles">${o.vals.map(v => `<button class="${o.cur === v ? 'on' : ''}" data-act="${o.set}" data-v="${v}">${pctText(v)}</button>`).join('')}</div>
    <div class="hgin"><input class="field" id="${o.id}" inputmode="decimal" placeholder="${o.ph}" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="${o.label}"><button class="btn primary" data-act="${o.inAct}">Set</button></div>
    ${o.links ? `<div class="hglinks">${o.links}</div>` : ''}</div>`;
}
const hgLink = (act, text) => `<button class="linkbtn" data-act="${act}">${text}</button>`;
function haggleHtml(e) {
  const h = e.haggle, memo = !h && st.hgMemo;
  const memoText = memo ? (memo.price ? 'Agreed ' + money(memo.price) : pctText(memo.pct)) : '';
  const links = [h && h.fixed ? '' : hgLink('haggle-agree', 'Agree this price'), h ? hgLink('haggle-off', 'Turn off') : memo ? hgLink('haggle-restore', 'Back to ' + esc(memoText)) : ''].filter(Boolean).join('');
  return hgPanel({ title: 'Haggle', done: 'haggle-close', hint: 'Drag the marker, pick one, or type a price you agreed.', vals: [-5, -10, -15, -25], cur: h && !h.fixed ? h.pct : null, set: 'haggle-set', id: 'hgIn', ph: 'Agreed price, like 40 gp', label: 'Type the price you agreed, or a percent', inAct: 'haggle-in', links });
}
// h is { pct } (moves with the other fields), { price } (agreed, stays put) or null
function setHaggle(h) {
  if (h && h.price > 0) h = { price: Math.round(h.price * 1000) / 1000 };
  else if (h && h.pct != null) { const pct = Math.max(-90, Math.min(300, Math.round(h.pct * 10) / 10)); h = Math.abs(pct) < 0.5 ? null : { pct }; }
  else h = null;
  if (st.query.haggle) st.hgMemo = clone(st.query.haggle);
  flowEdit(x => { x.haggle = h; });
}
function parseHaggle(v) {
  v = String(v || '').trim().toLowerCase().replace(/−/g, '-'); let m;
  if ((m = /^-?\s*(\d+(?:\.\d+)?)\s*%\s*(?:off|discount|less|cheaper)?$/.exec(v))) return { pct: -Math.min(90, +m[1]) };
  if ((m = /^(\d+(?:\.\d+)?)\s*(?:off|discount)$/.exec(v))) return { pct: -Math.min(90, +m[1]) };
  if ((m = /^\+\s*(\d+(?:\.\d+)?)\s*%\s*(?:extra|more|on top|markup|higher)?$/.exec(v))) return { pct: Math.min(300, +m[1]) };
  if ((m = /^(\d+(?:\.\d+)?)\s*%\s*(?:extra|more|on top|markup|higher)$/.exec(v))) return { pct: Math.min(300, +m[1]) };
  const bu = parseMoney(v, cur());
  return bu > 0 ? { price: bu } : null;
}
// dragging the marker along the range is a haggle: the range is the un-haggled one, so the far ends are the best and worst price it can plausibly be
let drag = null;
function dragMove(e) {
  const d = drag, pos = Math.min(1, Math.max(0, (e.clientX - d.rect.left) / d.rect.width));
  let p = Math.exp(Math.log(d.lo) + pos * (Math.log(d.hi) - Math.log(d.lo)));
  if (Math.abs(p / d.typ - 1) < 0.03) p = d.typ;
  d.pct = Math.round((p / d.typ - 1) * 100);
  const tick = d.bar.querySelector('.tick'); if (tick) tick.style.left = (pos * 100).toFixed(1) + '%';
  const sec = d.bar.closest('.price, .ctot');
  const shown = d.typ * (1 + d.pct / 100), amt = shown;
  const num = sec && sec.querySelector('.pricebtn .num, .cbig b');
  if (num) { const pr = np(money(amt)); num.innerHTML = d.cart ? esc(money(amt)) : `${esc(pr.n)}${pr.u ? `<small>${esc(pr.u)}</small>` : ''}`; }
  const good = d.cart ? d.pct < 0 : favour(d.pct, st.query.action);
  if (sec) { sec.classList.toggle('hg', !!d.pct); sec.classList.toggle('good', !!d.pct && good); sec.classList.toggle('bad', !!d.pct && !good); }
}
document.addEventListener('pointerdown', ev => {
  const bar = ev.target.closest && ev.target.closest('.span.dragbar');
  if (!bar || ev.button > 0) return;
  const cart = bar.dataset.scope === 'cart';
  if (!cart && !(st.est && st.est.ok)) return;
  drag = { bar, cart, rect: bar.getBoundingClientRect(), lo: +bar.dataset.lo, hi: +bar.dataset.hi, typ: +bar.dataset.typ, get: +bar.dataset.get || 0, pct: 0, id: ev.pointerId };
  try { bar.setPointerCapture(ev.pointerId); } catch (e2) { /* ignore */ }
  bar.classList.add('dragging'); dragMove(ev); ev.preventDefault();
});
document.addEventListener('pointermove', ev => { if (drag && ev.pointerId === drag.id) dragMove(ev); });
function setCartHaggle(pct) {
  pct = Math.max(-90, Math.min(300, Math.round(pct * 10) / 10));
  cartOf().haggle = Math.abs(pct) < 0.5 ? null : { pct };
  afterCart();
}
const dragEnd = ev => {
  if (!drag || ev.pointerId !== drag.id) return;
  const d = drag; drag = null; d.bar.classList.remove('dragging');
  if (d.cart) { const cur0 = cartOf().haggle ? cartOf().haggle.pct : 0; if (d.pct !== cur0) setCartHaggle(d.pct); }
  else { const cur0 = st.est && st.est.haggle && !st.est.haggle.fixed ? st.est.haggle.pct : 0; if (d.pct !== cur0 || (st.est && st.est.haggle && st.est.haggle.fixed)) setHaggle({ pct: d.pct }); }
};
document.addEventListener('pointerup', dragEnd);
document.addEventListener('pointercancel', dragEnd);
document.addEventListener('keydown', ev => {
  const bar = ev.target.closest && ev.target.closest('.span.dragbar');
  if (!bar || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
  ev.preventDefault();
  const step = ev.key === 'ArrowRight' ? 1 : -1;
  if (bar.dataset.scope === 'cart') { setCartHaggle((cartOf().haggle ? cartOf().haggle.pct : 0) + step); const nb = document.querySelector('.span.dragbar[data-scope=cart]'); if (nb) nb.focus(); return; }
  if (!st.est || !st.est.ok) return;
  setHaggle({ pct: (st.est.haggle ? st.est.haggle.pct : 0) + step });
  const nb = document.querySelector('.price .span.dragbar'); if (nb) nb.focus();
});

// swiping a cart line left reveals Remove (the edit bar has one too, and Delete works on a focused line)
let swipe = null;
const closeSwipes = except => document.querySelectorAll('.cwrap.open').forEach(w => { if (w !== except) { w.classList.remove('open'); w.querySelector('.cline').style.transform = ''; } });
document.addEventListener('pointerdown', ev => {
  const line = ev.target.closest && ev.target.closest('.cline');
  if (!line || ev.target.closest('button')) { if (!ev.target.closest || !ev.target.closest('.cwrap')) closeSwipes(null); return; }
  const wrap = line.parentElement; closeSwipes(wrap);
  const w = wrap.querySelector('.cdel') ? wrap.querySelector('.cdel').offsetWidth : 88;
  swipe = { line, wrap, w, x: ev.clientX, y: ev.clientY, base: wrap.classList.contains('open') ? -w : 0, dx: 0, on: false, id: ev.pointerId };
});
document.addEventListener('pointermove', ev => {
  const s = swipe; if (!s || ev.pointerId !== s.id) return;
  const dx = ev.clientX - s.x, dy = ev.clientY - s.y;
  if (!s.on) { if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) { s.on = true; try { s.line.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } s.line.classList.add('swiping'); } else if (Math.abs(dy) > 12) { swipe = null; return; } else return; }
  s.dx = Math.max(-s.w, Math.min(0, s.base + dx));
  s.line.style.transform = `translateX(${s.dx}px)`;
});
const swipeEnd = ev => {
  const s = swipe; if (!s || ev.pointerId !== s.id) return;
  swipe = null; s.line.classList.remove('swiping');
  if (!s.on) return;
  const open = s.dx < -s.w / 2;
  s.wrap.classList.toggle('open', open); s.line.style.transform = open ? `translateX(-${s.w}px)` : '';
  s.line.dataset.swiped = '1'; setTimeout(() => { delete s.line.dataset.swiped; }, 350);
};
document.addEventListener('pointerup', swipeEnd);
document.addEventListener('pointercancel', swipeEnd);
document.addEventListener('keydown', ev => {
  const line = ev.target.closest && ev.target.closest('.cline');
  if (line && (ev.key === 'Delete' || ev.key === 'Backspace') && line.dataset.id) { ev.preventDefault(); const b = line.parentElement.querySelector('.cdel'); if (b) b.click(); }
});

// ---------- the cart ----------
const CART_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/></svg>';
const cartOf = () => (S.carts[world.id] ||= emptyCart());
function whatText(q, ent) {
  const qtyTxt = q.qty && !timeUnit(ent) ? (q.qty.lo === q.qty.hi ? q.qty.lo : q.qty.lo + ' to ' + q.qty.hi) + (q.qty.unit === 'lb' ? ' lb of ' : ' × ') : '';
  const spanTxt = q.span && timeUnit(ent) ? ', ' + (q.span.lo === q.span.hi ? q.span.lo : q.span.lo + ' to ' + q.span.hi) + ' ' + q.span.unit + (q.span.hi === 1 ? '' : 's') : '';
  return qtyTxt + ent.name + (q.rarity && ent.curve ? ', ' + q.rarity : '') + spanTxt;
}
function addCartBtn(q) {
  if (st.cartEdit || q.action === 'value') return '';
  const n = unitsInCart(cartOf(), stripShop(q, cartOf().mods));
  return `<button class="addcart${n ? ' in' : ''}" data-act="cart-add" aria-label="Add to cart">${CART_SVG}<span>${n ? 'In cart · ' + n : 'Add'}</span></button>`;
}
function editBarHtml() {
  const line = cartOf().lines.find(l => l.id === st.cartEdit.id), ent = line && ctx.byId.get(line.q.subject);
  return `<div class="editbar"><div class="et">Editing <b>${esc(ent ? ent.name : 'a line')}</b> in the cart</div><div class="eb"><button class="rm" data-act="cart-remove-edit">Remove</button><button data-act="cart-cancel">Cancel</button><button class="go" data-act="cart-update">Update</button></div></div>`;
}
function offerHtml() {
  const r = st.cartOffer, shop = r.shop.map(id => ctx.mods.get(id)?.label).filter(Boolean);
  return `<section class="guess cartoffer"><div class="gh">That reads as <b>${r.items.length} items</b>${shop.length ? ' (' + esc(shop.join(', ')) + ')' : ''}. Price them together in a cart?</div><ul class="slines">${r.items.map(q => { const e = ctx.byId.get(q.subject); return `<li>${q.action === 'sell' ? 'Sell ' : ''}${esc(e ? whatText(q, e) : '')}</li>`; }).join('')}${r.bad.map(b => `<li class="ferr">&ldquo;${esc(b)}&rdquo; is not in your lists, so it is left out.</li>`).join('')}</ul><button class="cta" data-act="cart-offer-add">Add ${r.items.length} to cart</button><button class="cta2" data-act="cart-offer-no">Not now</button></section>`;
}
const amtOf = t => (t.spend || t.get);
function renderCartPill() {
  const el = $('#cartPill'); if (!el) return;
  const c = cartOf(), n = c.lines.length;
  el.hidden = !n; if (!n) return;
  el.innerHTML = `<span>Cart</span><b>${n}</b><span class="amt">${esc(money(amtOf(cartTotals(c, ctx))))}</span>`;
}
const SHOP_SHORT = { capital: 'Capital', city: 'City', town: 'Town', village: 'Village', outpost: 'Outpost', remote: 'Wilderness', wholesale: 'Wholesale' };
function shopLabel(c) {
  const place = c.mods.map(id => ctx.mods.get(id)).find(m => m && m.group === 'place');
  return (place ? SHOP_SHORT[place.id] || place.label : 'Anywhere') + (c.mods.includes('wholesale') ? ', wholesale' : '');
}
// the shop is two choices that move the whole cart; each option shows what it would do to the total
function shopOptions(c, t) {
  const cur = amtOf(t), amtWith = mods => amtOf(cartTotals({ ...clone(c), mods, haggle: c.haggle }, ctx));
  const hint = a => { if (!c.lines.length || !cur) return ''; const p = Math.round((a / cur - 1) * 100); return Math.abs(p) < 1 ? 'same' : (p > 0 ? '+' : '') + p + '%'; };
  const card = (act, key, label, mods, sel) => { const a = c.lines.length ? amtWith(mods) : 0, p = c.lines.length && cur ? Math.round((a / cur - 1) * 100) : 0; return `<button class="o${sel ? ' sel' : ''}" data-act="${act}" ${key}><b>${esc(label)}</b>${c.lines.length ? `<span>${esc(money(a))}</span>` : ''}<em class="${p > 0 ? 'up' : p < 0 ? 'down' : ''}">${sel ? 'selected' : hint(a)}</em></button>`; };
  const places = ctx.modList.filter(m => m.group === 'place'), isPlace = id => ctx.mods.get(id)?.group === 'place';
  const rest = c.mods.filter(id => !isPlace(id)), curPlace = c.mods.find(isPlace) || '';
  const where = [['', 'Anywhere'], ...places.map(m => [m.id, SHOP_SHORT[m.id] || m.label])].map(([id, label]) => card('cart-where', `data-id="${esc(id)}"`, label, id ? [...rest, id] : rest, curPlace === id)).join('');
  const whole = c.mods.includes('wholesale'), nonW = c.mods.filter(id => id !== 'wholesale');
  const prices = [[0, 'Retail'], [1, 'Wholesale']].map(([w, label]) => card('cart-chan', `data-v="${w}"`, label, w ? [...nonW, 'wholesale'] : nonW, !!w === whole)).join('');
  return `<div class="shopopts"><div class="lab">Where</div><div class="opts wrap">${where}</div><div class="lab">Prices</div><div class="opts wrap">${prices}</div></div>`;
}
function cartHaggleHtml() {
  const h = cartOf().haggle;
  return hgPanel({ title: 'Haggle what you buy', done: 'cart-haggle', hint: 'Changes every line you buy. Agreed prices and sales are left alone.', vals: [-5, -10, -15, -20], cur: h ? h.pct : null, set: 'cart-hg-set', id: 'cartHg', ph: 'Percent off, like 10%', label: 'Haggle everything you buy by a percent', inAct: 'cart-hg-in', links: h ? hgLink('cart-hg-off', 'Turn off') : '' });
}
const MINUS = '\u2212';
function cartHtml() {
  const c = cartOf(), t = cartTotals(c, ctx), ref = t.pre || t, hg = c.haggle;
  const sellOnly = !t.spend && t.get > 0;
  // in a mixed cart every line carries a sign from your wallet's point of view: buying takes money out, selling brings it in
  const sign = r => (r.sell ? '+ ' : t.mixed ? MINUS + ' ' : '');
  const rows = c.lines.map(line => {
    const r = lineResult(line, c, ctx);
    if (!r.ok) return `<div class="cwrap"><button class="cdel" data-act="cart-del" data-id="${line.id}" aria-label="Remove">Remove</button><div class="cline miss" tabindex="0" data-id="${line.id}"><div class="l1"><span class="lbl">${esc(line.q.subject || 'An item')}</span><span class="ltot">&mdash;</span></div><div class="l2"><span class="csub">Not in your lists</span></div></div></div>`;
    const bits = [];
    if (r.sell) bits.push('<span class="ctag is-sell">sell</span>');
    for (const id of r.q.mods) { const m = ctx.mods.get(id); if (m && !c.mods.includes(id)) bits.push(esc((m.aliases[0] || m.label))); }
    const hl = r.e.haggle;
    if (r.fixed && hl) bits.push(`<span class="ctag ${hl.good ? 'is-good' : 'is-bad'}">agreed</span>`);
    else if (r.hgLine) bits.push(`<span class="ctag ${favour(r.hgLine, r.q.action) ? 'is-good' : 'is-bad'}">haggled ${pctText(r.hgLine)}</span>`);
    const own = !!(r.fixed || r.hgLine);   // a cart-wide haggle shows on the total, not on every line
    const hgc = hl && own ? (hl.good ? ' hg-good' : ' hg-bad') : '';
    const was = hl && own && !r.hgCart ? `<span class="crg">was ${esc(money(r.was))}</span>` : '';
    return `<div class="cwrap"><button class="cdel" data-act="cart-del" data-id="${line.id}" aria-label="Remove">Remove</button><div class="cline" role="button" tabindex="0" data-act="cart-edit" data-id="${line.id}"><div class="l1"><span class="lbl">${esc(whatText(r.q, r.e.entry))}</span><span class="ltot${hgc}">${sign(r)}${esc(money(r.t))}</span></div>${bits.length || was ? `<div class="l2"><span class="csub">${bits.join(' ')}</span>${was}</div>` : ''}</div></div>`;
  }).join('');

  // the summary: what you pay, the haggle against it, and (if you sell too) what comes back
  const head = sellOnly ? 'You receive' : 'You pay', amt = sellOnly ? t.get : t.spend;
  const canHaggle = ref.spend > 0;
  const bandLo = Math.max(ref.spendBand[0], ref.spend * 0.05), bandHi = Math.max(ref.spendBand[1], bandLo * 1.01);
  const posOf = p => Math.min(100, Math.max(0, (Math.log(Math.max(p, 1e-9)) - Math.log(bandLo)) / (Math.log(bandHi) - Math.log(bandLo)) * 100));
  const hgPill = !canHaggle ? '' : hg
    ? `<span class="hgwrap ${hg.pct < 0 ? 'good' : 'bad'}"><button class="haggle on" data-act="cart-haggle" aria-expanded="${st.cartHaggleOpen}">${HAG_I}<span>Haggled ${pctText(hg.pct)}</span></button><button class="hgx" data-act="cart-hg-off" aria-label="Turn haggle off">&times;</button></span>`
    : `<button class="haggle" data-act="cart-haggle" aria-expanded="${st.cartHaggleOpen}">${HAG_I}<span>Haggle</span></button>`;
  const bar = !canHaggle ? '' : `<div class="cbarrow"><span>${esc(money(bandLo))}</span><div class="span dragbar" data-scope="cart" role="slider" tabindex="0" aria-label="Haggle what you pay along its range" aria-valuenow="${Math.round(t.spend)}" data-lo="${bandLo}" data-hi="${bandHi}" data-typ="${ref.spend}"><div class="rule"></div><div class="band"></div>${hg ? `<div class="notch" style="left:${posOf(ref.spend).toFixed(1)}%"></div>` : ''}<div class="tick" style="left:${posOf(t.spend).toFixed(1)}%"></div></div><span>${esc(money(bandHi))}</span></div>`;
  const note = hg ? `<div class="hgnote">Haggled ${Math.abs(hg.pct)}% ${hg.pct < 0 ? 'off' : 'on top of'} what you buy. Was ${esc(money(ref.spend))}.</div>` : '';
  const tally = t.mixed ? `<div class="ctally"><span>Selling +${esc(money(t.get))}</span><span>Net ${t.net < 0 ? MINUS : '+'}${esc(money(Math.abs(t.net)))}</span></div>` : '';
  const labelBtn = `<button class="clabel" data-act="cart-why" aria-expanded="${st.cartWhy}">${head}<i aria-hidden="true">${st.cartWhy ? '&#9662;' : '&rsaquo;'}</i></button>`;

  // the math: a tally you can read down, with the range explained once
  const side = (n, text) => `<div class="sum"><span>${text}</span><b>${n}</b></div>`;
  const why = st.cartWhy ? `<div class="cwhy"><div><span>Shop</span><b>${esc(shopLabel(c))}</b></div>${hg ? `<div><span>Haggle</span><b>${esc(pctText(hg.pct))} on what you buy</b></div>` : ''}${c.lines.map(line => { const r = lineResult(line, c, ctx); if (!r.ok) return ''; const steps = r.fixed ? 'agreed price' : r.e.factors.filter(f => f.kind !== 'base' && f.kind !== 'qty').map(f => `${f.label} ×${fx(((f.effLo ?? f.lo) * (f.effHi ?? f.hi)) ** 0.5)}`).join(', ') || 'no circumstances'; return `<div><span>${r.sell ? '+' : MINUS} ${esc(whatText(r.q, r.e.entry))}<em>${esc(steps)}</em></span><b>${r.sell ? '+' : MINUS}${esc(money(r.t))}</b></div>`; }).join('')}${t.spend ? side(MINUS + esc(money(t.spend)), 'Buying') : ''}${t.get ? side('+' + esc(money(t.get)), 'Selling') : ''}${side((t.net < 0 ? MINUS : '+') + esc(money(Math.abs(t.net))), t.net < 0 ? 'You pay' : 'You receive').replace('class="sum"', 'class="sum last"')}<p class="mini">What you buy usually lands between ${esc(money(ref.spendBand[0]))} and ${esc(money(ref.spendBand[1]))}. Each line can vary on its own, so that is narrower than adding every low and every high (${esc(money((t.spend ? t.spendExt : t.getExt)[0]))} to ${esc(money((t.spend ? t.spendExt : t.getExt)[1]))}).</p></div>` : '';

  const read = st.cartRead ? `<div class="cread"><p>That reads as ${st.cartRead.items.length} items${st.cartRead.shop.length ? ' (' + esc(st.cartRead.shop.map(id => ctx.mods.get(id)?.label).filter(Boolean).join(', ')) + ')' : ''}.</p><ul>${st.cartRead.items.map(q => `<li>${q.action === 'sell' ? 'Sell ' : ''}${esc(whatText(q, ctx.byId.get(q.subject)))}</li>`).join('')}${st.cartRead.bad.map(b => `<li class="ferr">&ldquo;${esc(b)}&rdquo; is not in your lists.</li>`).join('')}</ul><div class="row"><button class="go" data-act="cart-read-add">Add ${st.cartRead.items.length} to cart</button><button data-act="cart-read-no">Cancel</button></div></div>` : '';
  const body = c.lines.length ? rows : `<p class="empty">Nothing in the cart yet. Tap Add beside a price, or type a few items below.</p>`;
  const shopRow = `<div class="cfield"><button class="crow" data-act="cart-shop-toggle" aria-expanded="${st.cartShopOpen}"><span class="k">Shop</span><span class="v">${esc(shopLabel(c))}</span><span class="chev">${st.cartShopOpen ? '&#9662;' : '&rsaquo;'}</span></button>${st.cartShopOpen ? shopOptions(c, t) : ''}</div>`;
  return `${shopRow}${st.cartHaggleOpen ? cartHaggleHtml() : ''}<div class="clines">${body}</div>${c.lines.length ? '<button class="linkbtn cempty" data-act="cart-clear">Empty the cart</button>' : ''}${why}
    <div class="cfoot"><div class="csum ctot${hg ? ' hg ' + (hg.pct < 0 ? 'good' : 'bad') : ''}"><div class="t1">${labelBtn}${hgPill}</div><div class="cmain"><div class="cbig"><b>${esc(money(amt))}</b></div>${tally}</div>${bar}${note}${t.missing ? `<p class="ferr">${t.missing} line${t.missing === 1 ? ' is' : 's are'} not in your lists and left out.</p>` : ''}</div>
    <div class="cdock">${read}<div class="cin"><input class="field" id="cartIn" value="${esc(st.cartText)}" placeholder="Add more: 3 rope, 2 torches" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Add several items in one sentence"><button class="btn primary" data-act="cart-read">Add</button></div></div></div>`;
}
function clearInput() { $('#q').value = ''; fromText(''); }
function openCart() { st.sheet = { open: true, mode: 'cart' }; renderSheet(); }
function afterCart(opts = {}) {
  persist(); renderCartPill(); renderResult(); if (st.sheet.open && st.sheet.mode === 'cart') renderSheet();
  if (opts.focus) { const i = $('#cartIn'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
function mergeShop(c, shop) {
  for (const id of shop) {
    const m = ctx.mods.get(id); if (!m) continue;
    c.mods = c.mods.filter(x => ctx.mods.get(x)?.group !== m.group || m.group === undefined);
    if (!c.mods.includes(id)) c.mods.push(id);
  }
}
function addItems(items, shop) {
  const c = cartOf(); mergeShop(c, shop);
  for (const q of items) addToCart(c, stripShop(q, c.mods));
}
function flyCoin(from, first) {
  const pill = $('#cartPill'); if (!pill || pill.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const to = pill.getBoundingClientRect(), f = document.createElement('div');
  f.className = 'fly'; f.textContent = '+'; f.style.left = (from.left + from.width / 2 - 13) + 'px'; f.style.top = (from.top + from.height / 2 - 13) + 'px';
  document.body.appendChild(f);
  if (first) pill.style.opacity = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transform = `translate(${to.left + to.width / 2 - from.left - from.width / 2}px,${to.top + to.height / 2 - from.top - from.height / 2}px) scale(.8)`; f.style.opacity = '.4'; }));
  setTimeout(() => { f.remove(); pill.style.opacity = ''; pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }, 560);
}
function cartRead() {
  const r = readSentence(st.cartText, ctx);
  if (!r.items.length) { toast(r.bad.length ? `"${r.bad[0]}" is not in your lists.` : 'Type what to add, like "3 rope, 2 torches".'); return; }
  if (r.items.length === 1 && !r.bad.length) { addItems(r.items, r.shop); st.cartText = ''; st.cartRead = null; afterCart({ focus: true }); toast('Added to the cart'); return; }
  st.cartRead = r; renderSheet();
}

// ---------- bottom sheet: the breakdown, or the item picker ----------
function stepFacts(f) {
  // one plain description of what a step does to the price
  if (f.kind === 'base') return { fx: esc(range(f.lo, f.hi)), dir: '', say: f.kind === 'base' && st.est.entry.curve ? 'The rarity sets the starting price.' : 'The starting price from the list, with its usual spread.' };
  if (f.kind === 'qty') return { fx: esc(f.label.replace(/^[^×]*/, '').trim() || f.label), dir: '', say: 'Multiplied by how many, or how long.' };
  const a = f.effLo ?? f.lo, b = f.effHi ?? f.hi, mid = (a * b) ** 0.5, pct = Math.round(Math.abs(mid - 1) * 100);
  const dir = mid > 1.005 ? 'up' : mid < 0.995 ? 'down' : '';
  const fxs = '× ' + (Math.abs(a - b) < 0.005 ? fx(a) : fx(a) + ' to ' + fx(b));
  const lead = dir === 'up' ? `about ${pct}% more` : dir === 'down' ? `about ${pct}% less` : 'no real change';
  let say = f.why || '';
  if (f.weight !== undefined && f.weight < 0.99) say += (say ? ' ' : '') + `Stacked circumstances count less each time, so this one counts ${Math.round(f.weight * 100)}%.`;
  if (f.saved) say += (say ? ' ' : '') + 'This is your change for this world.';
  return { fx: `${lead} (${fxs})`, dir, say };
}
function receiptLines(e) {
  return e.factors.map(f => {
    const label = f.kind === 'qty' ? 'Quantity' : f.kind === 'base' ? f.label.replace(/^× /, '') : f.label;
    return { f, label, total: money(Math.sqrt(f.runLo * f.runHi)), ...stepFacts(f) };
  });
}
function receiptStory(e) {
  const L = receiptLines(e), up = L.filter(x => x.dir === 'up').map(x => x.label.toLowerCase()), down = L.filter(x => x.dir === 'down').map(x => x.label.toLowerCase());
  const base = L[0], qty = L.find(x => x.f.kind === 'qty');
  const list = a => a.length < 3 ? a.join(' and ') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  let t = `It starts at ${base.total}${qty ? ', multiplied by ' + qty.f.label.replace(/^× /, '') : ''}. `;
  if (up.length) t += `${capital(list(up))} ${up.length === 1 ? 'pushes' : 'push'} it up. `;
  if (down.length) t += `${capital(list(down))} ${down.length === 1 ? 'brings' : 'bring'} it down. `;
  return t + `That lands on about ${money(e.typical)}, anywhere from ${money(e.lo)} to ${money(e.hi)}.`;
}
function receiptText(e) {
  const rows = receiptLines(e).map(x => `${x.label}: ${x.fx.replace(/<[^>]+>/g, '').replace(/&times;/g, '×')} → ${x.total}`);
  return [summaryLine(e), ...rows, `Typical ${money(e.typical)} (${money(e.lo)} to ${money(e.hi)})`].join('\n');
}
function breakdownHtml(e) {
  const pos = e.hi > e.lo ? Math.min(100, Math.max(0, (Math.log(e.typical) - Math.log(e.lo)) / (Math.log(e.hi) - Math.log(e.lo)) * 100)) : 50;
  const bar = `<div class="rangebar" role="img" aria-label="Range ${esc(range(e.lo, e.hi))}"><div class="track"><div class="band"></div><div class="mark" style="left:${pos.toFixed(1)}%"></div></div><div class="ends"><span>${esc(money(e.lo))}</span><span>${esc(money(e.hi))}</span></div></div>`;
  const rows = receiptLines(e).map(x => `<div class="lrow ${x.f.kind || 'mult'}"><div class="l1"><span class="lbl">${esc(x.label)}</span><span class="ltot">${esc(x.total)}</span></div><div class="l2"><span class="lfx ${x.dir}">${x.fx}</span></div>${x.say ? `<p class="lwhy">${esc(x.say)}</p>` : ''}</div>`).join('');
  return `<p class="story">${esc(receiptStory(e))}</p>` + bar + `<div class="fx ledger">${rows}<div class="lsum"><span>Typical price</span><b>${esc(money(e.typical))}</b></div></div>`;
}
function pickerHtml(pickAct = 'pick-item', big = false) {
  const cats = [...FLOW_CATS.map(c => [c[0], c[1]]), ['mine', 'My items']].filter(([id]) => ctx.entries.some(e => catOf(e) === id));
  const sel = st.flow.cat;
  const unitBU = e => e.perMile ? e.perMile * e.mpd : (e.bu ?? 0);
  const search = st.flow.search.trim().toLowerCase();
  const items = ctx.entries.filter(e => search ? (e.name + ' ' + (e.aliases || []).join(' ')).toLowerCase().includes(search) : (sel ? catOf(e) === sel : false));
  items.sort((a, b) => (b.isCategory ? 1 : 0) - (a.isCategory ? 1 : 0) || unitBU(a) - unitBU(b) || a.name.localeCompare(b.name));
  const cur0 = st.query.subject;
  return `<input class="field" id="flowSearch" type="search" placeholder="Search all items" value="${esc(st.flow.search)}" aria-label="Search all items" style="width:100%">
    ${big ? (sel || search ? (sel && !search ? `<button class="linkbtn" data-act="f-cat" data-v="" style="min-height:2.5rem;padding:0;color:var(--accent);font-weight:600;justify-self:start;text-align:left">&larr; All kinds &middot; ${esc((cats.find(c => c[0] === sel) || [])[1] || '')}</button>` : '') : `<div class="catgrid">${cats.map(([id, l]) => `<button class="catbtn" data-act="f-cat" data-v="${id}">${esc(l)}</button>`).join('')}</div>`) : `<div class="quick" style="margin:0">${cats.map(([id, l]) => `<button class="q${sel === id && !search ? ' on' : ''}" data-act="f-cat" data-v="${id}">${esc(l)}</button>`).join('')}</div>`}
    ${items.length ? `<div class="fields">${items.slice(0, 80).map(e => {
      const per = e.curve ? 'by rarity' : money(unitBU(e)) + (timeUnit(e) ? ' / ' + timeUnit(e).word : e.unit === 'lb' ? ' / lb' : '');
      return `<button class="slot${cur0 === e.id ? ' open' : ''}" data-act="${pickAct}" data-v="${esc(e.id)}"><span class="v">${esc(e.name)}${e.isCategory ? ' <i>any</i>' : ''}</span><span class="hint">${esc(per)}</span></button>`;
    }).join('')}</div>` : `<p class="mini" style="color:var(--muted)">${sel || search ? 'Nothing matches.' : 'Pick a kind above or search.'}</p>`}`;
}
function startPick(id) {
  const act = st.start && st.start.action; st.sheet.open = false; st.start = null;
  flowEdit(x => { delete x.overrides; x.subject = id; x.family = null; x.assumed = x.assumed.filter(z => z !== 'mode' && (!act || z !== 'action')); if (act) x.action = act; x.rarity = null; x.span = null; x.qty = null; const en = ctx.byId.get(id); if (!['travel', 'lodging', 'service', 'labor', 'spell'].includes(en.kind)) x.tier = null; x.mods = x.mods.filter(m => { const mm = ctx.mods.get(m); return mm && applicable(mm, en); }); });
  renderSheet();
}
const START_ACTIONS = [['buy', 'Buy', 'Something I would pay for'], ['sell', 'Sell', 'Something I would be paid for'], ['value', 'Appraise', 'What something is worth']];
function startHtml() {
  const a = st.start && st.start.action;
  if (!a) return `<p class="mini" style="color:var(--muted);margin:0 0 .75rem">What are you doing?</p><div class="startgrid">${START_ACTIONS.map(([id, l, s]) => `<button class="startbtn" data-act="start-action" data-v="${id}"><b>${l}</b><span>${s}</span></button>`).join('')}</div>`;
  const label = START_ACTIONS.find(x => x[0] === a)[1];
  return `<div class="startcrumb"><button class="linkbtn" data-act="start-back">&larr; ${esc(label)}</button><span>Pick a kind, then the item</span></div>` + pickerHtml('start-pick', true);
}
function renderSheet() {
  const sh = $('#sheet'), s = st.sheet, e = st.est;
  if (!s.open) { sh.hidden = true; return; }
  const body = $('#sheetBody'), top = body.scrollTop;
  sh.classList.toggle('cart', s.mode === 'cart');
  const acts = $('#sheetActs'); if (acts) acts.innerHTML = s.mode === 'cart' ? `<button class="sheet-x" data-act="cart-copy" aria-label="Copy the cart as text"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg></button>` : '';
  if (s.mode === 'cart') {
    $('#sheetTitle').textContent = 'Cart';
    body.innerHTML = cartHtml();
  } else if (s.mode === 'start') {
    $('#sheetTitle').textContent = 'Start with buttons';
    body.innerHTML = startHtml();
  } else if (s.mode === 'item') {
    $('#sheetTitle').textContent = 'Choose item';
    body.innerHTML = pickerHtml();
  } else {
    if (!(e && e.ok && st.query.subject && !st.setting)) { sh.hidden = true; return; }
    $('#sheetTitle').textContent = 'Why this price?';
    const facts = factsList(e);
    body.innerHTML = breakdownHtml(e) + (facts.length ? `<div class="facts">${facts.map(f => `<p>${f}</p>`).join('')}</div>` : '') + `<div class="rfoot"><button class="btn primary" data-act="copy-receipt">Copy receipt</button><p class="mini">To change how a step works in your world, say it in Changes, like &ldquo;black market takes 30%&rdquo;.</p><button class="btn" data-act="open-changes">Open Changes</button></div>`;
  }
  sh.hidden = false;
  body.scrollTop = top;
}

// ---------- unknown words: pick the closest thing, set the price, save ----------
function unknownPhrase() {
  const p = st.parsed;
  if (!p || !p.parts) return '';
  let best = [], run = [];
  for (const part of p.parts) {
    if (part.k === 'u' && (!run.length || part.tokIdx === run[run.length - 1].tokIdx + 1)) run.push(part);
    else { if (part.k === 'u') run = [part]; else run = []; }
    if (run.length > best.length) best = [...run];
  }
  return best.map(x => x.raw.toLowerCase()).join(' ');
}
function ensureGuess(phrase) {
  if (!st.guess || st.guess.phrase !== phrase) {
    const cands = candidatesFor(phrase, ctx).filter(c => !String(c.id).startsWith('tier:'));
    const { tags, found } = inferTags(phrase);
    st.guess = { phrase, cands, tags, found, sel: 0, bu: tagCandidate(tags, found, phrase).bu, q: '', exact: false };
  }
  return st.guess;
}
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
function guessCard() {
  const phrase = unknownPhrase();
  if (!phrase) { st.guess = null; return ''; }
  // still typing a word that starts a real item: let the suggestions lead, not the guess
  if (complete(st.text, ctx, { cats: FLOW_CATS, catOf }).some(r => r.type === 'item' && [r.label, ...(r.entry.aliases || [])].some(n => n.toLowerCase().split(/\s+/).some(w => w.startsWith(phrase.split(' ').pop()))))) { st.guess = null; return ''; }
  const g = ensureGuess(phrase), name = capital(phrase);
  const all = guessAll(), c = all[g.sel];
  const qtxt = st.query.qty ? (st.query.qty.lo === st.query.qty.hi ? st.query.qty.lo : st.query.qty.lo + ' to ' + st.query.qty.hi) : null;
  const tagged = c && c.tagged;
  let h = `<section class="guess"><div class="gh"><b>${esc(phrase)}</b> is not in the price list yet. ${tagged ? 'This is a guess from its tags: ' + esc(c.why) + '.' : 'Using <b>' + esc(c.label.toLowerCase()) + '</b> as the guide.'}</div>`;
  if (c) {
    const pv = previewWith(ctx, name, c, g.bu, { ...st.query, subject: 'tmp.guess' });
    const one = pv.one.ok ? pv.one.typical : g.bu, pr = np(money(one));
    h += `<div class="stepper"><button class="sb" data-act="g-lower" aria-label="Lower the price">&minus;</button><div class="gval"><div class="num">${esc(pr.n)}<small>${esc(pr.u)}</small></div><div class="gtot">${c.unit && c.unit !== 'each' ? 'per ' + esc(c.unit) : 'each'}</div></div><button class="sb" data-act="g-raise" aria-label="Raise the price">+</button></div>`;
    if (qtxt && pv.full.ok) h += `<div class="gtot">For ${esc(String(qtxt))}: about <b>${esc(money(pv.full.typical))}</b> (${esc(range(pv.full.lo, pv.full.hi))})</div>`;
  }
  const row = (r, label, opts, cur) => `<div class="grow"><div class="glab">${esc(label)}</div><div class="gopts" role="group" aria-label="${esc(label)}">${opts.map(o => `<button class="${cur === o.id ? 'on' : ''}" data-act="g-tag" data-r="${r}" data-v="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div></div>`;
  h += `<div class="sep"><span>What kind of thing is it?</span></div><div class="gtags">${row('kind', 'Kind', KINDS.map(k => ({ id: k.id, label: k.label })), g.tags.kind)}${rowsFor(g.tags.kind).map(r => row(r, rowLabel(r), optionsOf(r), g.tags[r])).join('')}</div>`;
  const near = all.slice(1);
  if (near.length) h += `<div class="sep"><span>Or compare with a real item</span></div><div class="fields">${near.map((x, k) => { const i = k + 1; return `<button class="slot${g.sel === i ? ' open' : ''}" data-act="g-pick" data-i="${i}"><span class="v">${g.sel === i ? '<span class="dot r-item"></span>' : ''}${esc(x.label)}</span><span class="hint">${esc(money(x.bu))}${x.unit && x.unit !== 'each' ? ' / ' + esc(x.unit) : ''}</span></button>`; }).join('')}</div>`;
  h += `<input class="field gsearch" id="gSearch" type="search" placeholder="Search all items" value="${esc(g.q)}" aria-label="Search all items">`;
  if (c) {
    h += g.exact ? `<input class="field gsearch" id="gPrice" placeholder="Type a price, like 25 gp" aria-label="Type a price" inputmode="decimal">` : `<button class="linkbtn" style="margin-top:8px" data-act="g-exact">Type an exact price</button>`;
    h += `<button class="cta" data-act="g-set">Save and price it</button>${c.entry && !c.tier ? `<button class="cta2" data-act="g-alias">Same as ${esc(c.label.toLowerCase())}</button>` : ''}`;
  }
  return h + `</section>`;
}

// ---------- settings typed into the box ----------
function settingCard(s = st.setting, acts = null, head = 'Set this value?') {
  const c = cur();
  const unitTxt = s.unit === 'each' ? 'each' : 'per ' + (s.unit === 'day' && s.draft.kind === 'lodging' ? 'night' : s.unit);
  const lines = [];
  if (s.viaBase && s.current) lines.push(`Replaces the price of ${esc(s.analog.name.toLowerCase())}, now ${esc(money(s.current))} ${unitTxt}.`);
  if (!s.viaBase && s.analog && !s.rarityPriced) lines.push(`New item, based on ${esc(s.analog.name.toLowerCase())}.${s.owner ? ' Fixed at this price.' : ''}`);
  if (s.rarityPriced) lines.push(`${esc(s.analog.name)} is priced by rarity. This sets one fixed price, and rarity will no longer change it.`);
  if (!s.analog) lines.push('New item. Nothing similar was found, so it is priced as entered.');
  if (s.note) lines.push(esc(s.note));
  return `<section class="setting"><div class="sh">${esc(head)}</div>
    <div class="sline"><b>${esc(s.name)}</b><span class="arrow">→</span><b class="sval">${esc(formatFull(s.perUnitBU, c))}</b> <span class="mini">${unitTxt}</span></div>
    <ul class="slines">${lines.map(l => `<li>${l}</li>`).join('')}</ul>
    <div class="row gact">${acts || '<button class="btn primary" data-act="s-set">Set it</button><button class="btn" data-act="s-cancel">Cancel</button>'}</div></section>`;
}
function applySetting(s = st.setting, keep = false) {
  if (!s) return;
  let text;
  if (s.viaBase) {
    world.baseOverrides[s.analog.id] = baseFor(ctx, s.analog.id, s.perUnitBU);
    text = s.analog.name.toLowerCase();
  } else {
    const stored = storedFor(ctx, s.draft, s.perUnitBU);
    world.items = world.items.filter(x => x.name.toLowerCase() !== s.name.toLowerCase());
    world.items.push({ id: newItemId(), ...s.draft, bu: +stored.toPrecision(6) });
    text = s.name.toLowerCase();
  }
  const label = s.name;
  if (!keep) { st.setting = null; st.settingDismissed = ''; $('#q').value = text; st.text = text; }
  worldChanged();
  toast('Set. ' + label + ' is now ' + formatFull(s.perUnitBU, cur()) + (s.unit === 'each' ? ' each' : ' per ' + s.unit) + '.');
}

function flash() {
  const n = $('#result .pricebtn .num');
  if (!n) return;
  n.classList.remove('glint'); void n.offsetWidth; n.classList.add('glint');
}
function summaryLine(e) {
  const ent = e.entry, q = st.query;
  const bits = [ent.name.toLowerCase()];
  if (q.span && timeUnit(ent)) bits.push((q.span.lo === q.span.hi ? q.span.lo : q.span.lo + ' to ' + q.span.hi) + ' ' + q.span.unit + (q.span.hi === 1 ? '' : 's'));
  if (q.qty) bits.unshift(String(q.qty.lo === q.qty.hi ? q.qty.lo : q.qty.lo + ' to ' + q.qty.hi));
  if (q.tier) bits.push(q.tier);
  if (q.rarity) bits.push(q.rarity);
  for (const id of q.mods) bits.push(ctx.mods.get(id)?.label || id);
  const unk = [...e.assumptions.map(a => a.text)];
  return `${ACTION_WORD[q.action]}: ${bits.join(', ')}: about ${money(e.typical)} (${range(e.lo, e.hi)}).` + (unk.length ? ' ' + unk.join(' ') : '');
}

// ---------- history ----------
function recordHistory() {
  clearTimeout(st.histTimer);
  if (!st.est || !st.est.ok || !st.text) return;
  const item = { text: st.text, price: money(st.est.typical), ts: Date.now(), world: world.id, pin: false };
  const old = S.history.find(h => h.text === item.text && h.world === item.world);
  item.pin = !!(old && old.pin);
  S.history = S.history.filter(h => h !== old);
  S.history.unshift(item);
  S.history = S.history.slice(0, 30);
  persist(); renderHistory();
}
function scheduleHistory() { clearTimeout(st.histTimer); st.histTimer = setTimeout(recordHistory, 1800); }
function renderHistory() {
  const h = S.history.filter(x => x.world === world.id);
  const el = $('#history');
  if (st.text || !h.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="hhead"><h3>Recent</h3><button class="linkbtn" data-act="hist-clear">Clear</button></div><div class="list">` + h.slice(0, 8).map(x => {
    const i = S.history.indexOf(x);
    return `<div class="hrow"><button class="h" data-act="hist" data-i="${i}"><span>${esc(x.text)}</span><span class="hp">${esc(x.price)}</span></button><button class="del" data-act="hist-del" data-i="${i}" aria-label="Remove">&times;</button></div>`;
  }).join('') + `</div>`;
}

// ---------- item kinds (for the picker) ----------
const FLOW_CATS = [
  ['explosives', 'Explosives', e => e.library === 'explosives'],
  ['fees', 'Fees and tolls', e => e.library === 'fees'],
  ['crowns', 'Crowns and jewelry', e => e.library === 'headwear' || has(e, 'jewelry')],
  ['clothes', 'Clothes', e => e.kind === 'good' && has(e, 'clothing')],
  ['animals', 'Animals', e => has(e, 'animal') || has(e, 'livestock')],
  ['plants', 'Plants and seeds', e => has(e, 'plant') && e.kind === 'good'],
  ['weapons', 'Weapons', e => e.kind === 'good' && has(e, 'weapon') && !has(e, 'magic')],
  ['armor', 'Armor', e => e.kind === 'good' && has(e, 'armor') && !has(e, 'magic')],
  ['potions', 'Potions and scrolls', e => has(e, 'potion') || has(e, 'scroll')],
  ['magic', 'Magic items', e => has(e, 'magic') && e.kind === 'good'],
  ['mounts', 'Mounts, animals, vehicles', e => has(e, 'mount') || has(e, 'animal') || has(e, 'livestock') || has(e, 'vehicle')],
  ['food', 'Food and drink', e => e.kind === 'good' && (has(e, 'food') || has(e, 'drink'))],
  ['trade', 'Trade goods', e => has(e, 'trade') || has(e, 'raw')],
  ['travel', 'Travel', e => e.kind === 'travel'],
  ['rent', 'Rent and housing', e => has(e, 'rent')],
  ['lodging', 'Lodging and meals', e => e.kind === 'lodging' || has(e, 'meal')],
  ['health', 'Health', e => e.kind === 'service' && has(e, 'medicine')],
  ['labor', 'Hired help', e => e.kind === 'labor'],
  ['spell', 'Spellcasting', e => e.kind === 'spell'],
  ['services', 'Other services', e => e.kind === 'service'],
  ['property', 'Property', e => e.kind === 'property'],
  ['gear', 'Gear, tools, clothes', e => e.kind === 'good'],
];
const has = (e, t) => (e.tags || []).includes(t);
function catOf(e) { if (e.src === 'user') return 'mine'; return (FLOW_CATS.find(c => c[2](e)) || [])[0] || 'gear'; }

function flowEdit(fn) { const q = clone(st.query); fn(q); fromQuery(q); }

// ---------- world drawer ----------
function openDrawer(scrollTo) {
  st.dpage = scrollTo === 'about' ? 'About' : null;
  $('#drawer').hidden = false; renderDrawer();
  document.body.style.overflow = 'hidden';
}
function closeDrawer() { $('#drawer').hidden = true; document.body.style.overflow = ''; }
// Custom words: type a name or pick from the list. Entries match by name or alias, circumstances by label.
function meansList() { return [...ctx.entries.map(e => e.name), ...ctx.modList.filter(m => m.aliases.length).map(m => m.label)]; }
function meansLabel(id) {
  if (!id) return '';
  if (id.startsWith('mod:')) return ctx.mods.get(id.slice(4))?.label || '';
  return ctx.byId.get(id)?.name || '';
}
const chg = (html, attrs) => `<div class="chg"><span class="ct">${html}</span><button class="xbtn" ${attrs} aria-label="Remove">&times;</button></div>`;
function factPreview() {
  const r = st.fact.res; if (!r) return '';
  const acts = '<button class="btn primary" data-act="fact-save">Save</button><button class="btn" data-act="fact-cancel">Cancel</button>';
  if (r.kind === 'price') return settingCard(r.setting, acts, 'Save this price?');
  if (r.kind === 'mod') return `<section class="setting"><div class="sh">Change this circumstance?</div><div class="sline"><b>${esc(r.line)}</b></div><ul class="slines"><li>${esc(r.note)}</li><li>It replaces the built in range for ${esc(r.label.toLowerCase())} in this world.</li></ul><div class="row gact">${acts}</div></section>`;
  const line = r.kind === 'word' ? `<b>${esc(r.term)}</b><span class="arrow">&rarr;</span><b class="sval">${esc(r.label)}</b>` : `<b>${esc(r.line)}</b>`;
  const note = r.kind === 'word' ? 'Whenever you write that word, it counts as this.' : r.note;
  return `<section class="setting"><div class="sh">${r.kind === 'word' ? 'Teach this word?' : 'Change this dial?'}</div><div class="sline">${line}</div><ul class="slines"><li>${esc(note)}</li></ul><div class="row gact">${acts}</div></section>`;
}
function factGo() {
  const text = (st.fact.text || '').trim();
  st.fact.res = null; st.fact.err = '';
  if (!text) { st.fact.err = 'Type a sentence first.'; renderDrawer(); return; }
  const r = readFact(text, ctx);
  if (!r) st.fact.err = 'I could not read that. Try a price like "a healing potion costs 40 gp", or a word like "a shiv is a dagger".';
  else if (r.kind === 'unknown') st.fact.err = `I do not know "${r.meansText}". Say what ${r.term} means with an item that is in your lists, such as "${r.term} is a dagger".`;
  else st.fact.res = r;
  renderDrawer();
}
function factSave() {
  const r = st.fact.res; if (!r) return;
  if (r.kind === 'price') applySetting(r.setting, true);
  else if (r.kind === 'word') {
    world.vocabulary = world.vocabulary.filter(v => v.term.toLowerCase() !== r.term);
    world.vocabulary.push({ term: r.term, means: r.means });
    worldChanged(); toast('Saved. ' + r.term + ' now means ' + r.label + '.');
  } else if (r.kind === 'mod') { world.overrides[r.key] = [r.lo, r.hi]; worldChanged(); toast('Saved. ' + r.line + '.');
  } else if (r.kind === 'dial') { world.dials[r.key] = r.value; worldChanged(); toast('Saved. ' + r.line + '.'); }
  st.fact = { text: '', res: null, err: '' };
  renderDrawer();
}
function resolveMeans(text) {
  const t = text.trim().toLowerCase();
  if (!t) return '';
  const hit = ctx.entries.find(e => e.name.toLowerCase() === t) || ctx.entries.find(e => (e.aliases || []).some(a => a.toLowerCase() === t));
  if (hit) return hit.id;
  const m = ctx.modList.find(x => x.label.toLowerCase() === t || x.aliases.some(a => a.toLowerCase() === t));
  return m ? 'mod:' + m.id : null;
}

const PAGES = {
  World: { title: 'World settings', subs: ['Item lists', 'Money', 'Economy', 'Dials', 'My changes'], jump: [['Item lists', 'Lists'], ['Money', 'Money'], ['Economy', 'Economy'], ['Dials', 'Dials'], ['My changes', 'Changes']] },
};
function worldPicker() {
  const sq = `<button class="wsq" data-act="w-modal" aria-haspopup="dialog"><span class="wl">World</span><span class="wv">${esc(world.name)}</span><span class="wc">&#9662;</span></button>`;
  if (!st.wmodal) return `<div class="wpick">${sq}</div>`;
  const rows = S.worlds.map(x => x.id === world.id && st.wrename ? `<div class="world-row sel edit"><input class="renin" id="renameIn" value="${esc(x.name)}" aria-label="World name" maxlength="40" autocapitalize="words" enterkeyhint="done"><button class="btn primary" data-act="w-rename">Save</button></div>` : `<button class="world-row${x.id === world.id ? ' sel' : ''}" data-act="w-select" data-id="${esc(x.id)}" aria-pressed="${x.id === world.id}"><span><span class="wn">${esc(x.name)}</span>${x.id === world.id ? '<span class="wb">In use</span>' : ''}</span></button>`).join('');
  const presets = Object.entries(WORLD_PRESETS).map(([id, mk]) => { const p = mk(); return `<button class="world-row preset" data-act="w-new-preset" data-v="${esc(id)}"><span><span class="wn">${esc(p.name)}</span><span class="wb">${esc(p.blurb || '')}</span></span><span class="plus">+</span></button>`; }).join('');
  return `<div class="wpick">${sq}</div><div class="wmodal" role="dialog" aria-label="Worlds"><div class="wback" data-act="w-modal-close"></div><div class="wcard">
    <div class="wch"><h3>Worlds</h3><button class="btn" data-act="w-modal-close">Close</button></div>
    <div class="wlist">${rows}</div>
    ${st.wrename ? '' : `<div class="row"><button class="btn" data-act="w-rename">Rename</button><button class="btn" data-act="w-dup">Duplicate</button>${S.worlds.length > 1 ? `<button class="btn danger" data-act="w-del">Delete</button>` : ''}</div>`}
    ${st.wnew ? `<div class="lab">Start from a preset</div><div class="wlist">${presets}</div>` : `<button class="btn wide" data-act="w-newtoggle">+ New world</button>`}
  </div></div>`;
}
function renderDrawer() {
  const panel = $('#drawerPanel'), top = panel.scrollTop;
  const doc = new DOMParser().parseFromString('<div>' + buildSettingsHtml() + '</div>', 'text/html');
  const secs = [...doc.querySelectorAll('details.sect')].map(d => ({ id: d.dataset.sec, sv: d.querySelector('.sv')?.textContent || '', title: d.querySelector('summary h3')?.textContent || d.dataset.sec, body: d.querySelector('.sbody').innerHTML }));
  const byId = id => secs.find(x => x.id === id);
  const page = st.dpage && (PAGES[st.dpage] || byId(st.dpage));
  const nav = (title, back) => `<div class="nav">${back ? '<button class="back" data-act="dpage" data-p="">&lsaquo; Settings</button>' : ''}<h2>${esc(title)}</h2><button class="btn primary" data-act="close-world">Done</button></div>`;
  if (page && PAGES[st.dpage]) {
    const P = PAGES[st.dpage];
    const tab = P.subs.includes(st.wtab) ? st.wtab : P.subs[0];
    panel.innerHTML = nav(P.title, true) + worldPicker() + `<div class="jump" role="tablist" aria-label="World settings">${P.jump.map(([id, l]) => `<button class="q${id === tab ? ' on' : ''}" role="tab" aria-selected="${id === tab}" data-act="wtab" data-id="${esc(id)}">${esc(l)}</button>`).join('')}</div>` +
      [byId(tab)].filter(Boolean).map(x => `<section class="wsec" id="ws-${esc(x.id.replace(/\W+/g, '-'))}" role="tabpanel"><h3 class="wh"><span>${esc(x.title)}</span><span class="sv">${esc(x.sv)}</span></h3><div class="sbody page">${x.body}</div></section>`).join('');
  } else if (page) {
    panel.innerHTML = nav(page.title, true) + `<div class="sbody page">${page.body}</div>`;
  } else {
    st.dpage = null;
    const row = (id, title, sv) => `<button class="nrow" data-act="dpage" data-p="${esc(id)}"><span class="nl">${esc(title)}</span><span class="sv">${esc(sv)}</span><span class="chev">&rsaquo;</span></button>`;
    panel.innerHTML = nav('Settings', false) +
      `<div class="group">${row('World', 'World settings', world.name)}</div>` +
      `<div class="navgroup">App</div><div class="group">${row('Appearance', 'Appearance', byId('Appearance').sv)}${row('About', 'About', '')}${row('Back up and share', 'Back up and share', '')}</div>`;
  }
  panel.querySelectorAll('.glyphs').forEach(g => { const on = g.querySelector('.gl.on:not(:first-child)'); if (on) g.scrollLeft = Math.max(0, on.getBoundingClientRect().left - g.getBoundingClientRect().left + g.scrollLeft - 70); });
  panel.onscroll = null;
  panel.scrollTop = st.dpageChanged ? 0 : top;
  st.dpageChanged = false;
}
function overrideLabel(k) {
  if (k.startsWith('mod:')) return ctx.mods.get(k.slice(4))?.label || k;
  if (k.startsWith('econ:')) return ECONOMY_TAGS.find(t => t.id === k.slice(5))?.label || k;
  if (k.startsWith('tier:')) return k.slice(5) + ' class';
  return { side: 'Selling, not buying', bulk: 'Large quantity' }[k] || k;
}
function buildSettingsHtml() {
  const w = world;
  const op = () => '';
  const dens = w.currency.denominations;
  const json = JSON.stringify(w, null, 1);
  const styleNow = S.skin || S.theme || 'dark';
  const themeLabel = (STYLES.find(x => x[0] === styleNow) || STYLES[0])[1] + (S.textSize ? ', ' + TEXT_SIZES.find(x => x[0] === S.textSize)[1].toLowerCase() + ' text' : '');
  const curSet = currencyPresetOf(w.currency);
  const html = `
  <details class="sect" data-sec="Appearance"${op('Appearance')}><summary><h3>Appearance</h3><span class="sv">${esc(themeLabel)}</span></summary><div class="sbody">
    <div class="lab">Text size</div>
    <div class="theme skins">${TEXT_SIZES.map(([v, l]) => `<label><span>${l}</span><input type="radio" name="textsize" data-bind="textsize" value="${v}"${(S.textSize || 'auto') === v ? ' checked' : ''}></label>`).join('')}</div>
    <div class="sample-type" aria-hidden="true"><div class="st-a">5 &times; Potion, rare</div><div class="st-b">680 gp</div><div class="st-c">260 gp to 1,700 gp</div></div>
    <div class="lab">Style</div>
    <div class="theme skins">${STYLES.map(([v, l]) => `<label><span>${l}</span><input type="radio" name="style" data-bind="style" value="${v}"${styleNow === v ? ' checked' : ''}></label>`).join('')}</div>
  </div></details>

  <div class="dp-head"><h2>World</h2><button class="btn primary" data-act="close-world">Done</button></div>

  <details class="sect" data-sec="Item lists"${op('Item lists')}><summary><h3>Item lists</h3><span class="sv">${esc([['srd', '5e SRD'], ['fantasy', 'Fantasy'], ['scifi', 'Sci-fi'], ['modern', 'Modern']].filter(([k]) => w.lists.includes(k)).map(x => x[1]).join(' + '))}</span></summary><div class="sbody">
    <p>Turn on every list this world draws prices from. Your own items and settings always override them.</p>
    <div class="listbox">
      <label class="listrow"><span class="lt"><b>5e SRD items</b><span class="mini">Named items like longsword and chain mail.</span></span><input type="checkbox" data-bind="list.srd"${w.lists.includes('srd') ? ' checked' : ''}></label>
      <label class="listrow"><span class="lt"><b>Fantasy basics</b><span class="mini">Travel, hired help, spells, property, magic and generic kinds like weapon and potion.</span></span><input type="checkbox" data-bind="list.fantasy"${w.lists.includes('fantasy') ? ' checked' : ''}></label>
      <label class="listrow"><span class="lt"><b>Science fiction</b><span class="mini">Blasters, cyberware, ships, station rent and hired crew, priced in credits.</span></span><input type="checkbox" data-bind="list.scifi"${w.lists.includes('scifi') ? ' checked' : ''}></label>
      <label class="listrow"><span class="lt"><b>Modern day</b><span class="mini">Rent, groceries, flights, doctors and cars at current US prices. Pair it with US dollars under Money.</span></span><input type="checkbox" data-bind="list.modern"${w.lists.includes('modern') ? ' checked' : ''}></label>
    </div>
  </div></div></details>

  <details class="sect" data-sec="Money"${op('Money')}><summary><h3>Money</h3><span class="sv">${esc(w.currency.symbol ? 'US dollars' : dens.map(d => d.id).join(' / '))}</span></summary><div class="sbody">
    ${dens.map((d, i) => `<div class="coin"><div class="denrow"><label class="lab">Short<input class="field" data-bind="den.${i}.id" value="${esc(d.id)}"></label><label class="lab">Name<input class="field" data-bind="den.${i}.name" value="${esc(d.name)}"></label>${dens.length > 1 ? `<button class="xbtn" data-act="w-del-den" data-i="${i}" aria-label="Remove coin">&times;</button>` : '<span></span>'}</div>
      <label class="lab">Worth in base units<input class="field" type="number" min="0.01" step="any" inputmode="decimal" data-bind="den.${i}.bu" value="${esc(d.bu)}"></label>
      <div class="lab">Symbol<div class="glyphs" role="group" aria-label="Symbol for ${esc(d.name)}"><button class="gl${d.glyph ? '' : ' on'}" data-act="glyph" data-i="${i}" data-v="" title="Plain letters">${esc(d.id.toUpperCase())}</button>${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(L => `<button class="gl${d.glyph === L ? ' on' : ''}" data-act="glyph" data-i="${i}" data-v="${L}" aria-label="Letter ${L}"><span class="cg">${L}</span></button>`).join('')}</div></div></div>`).join('')}
    <div class="row"><button class="btn" data-act="w-add-den">Add a coin</button></div>
    <p class="mini">Prices are stored as one number, the base unit. Each coin above is worth that many of it.</p>
    <label class="lab">Amounts smaller than the smallest coin<select class="field" data-bind="belowSmallest"><option value="round"${w.currency.belowSmallest !== 'decimals' ? ' selected' : ''}>Round to one coin</option><option value="decimals"${w.currency.belowSmallest === 'decimals' ? ' selected' : ''}>Show decimals (0.4 coins)</option><option value="round"${w.currency.belowSmallest === 'round' ? ' selected' : ''}>Round up to one coin</option></select></label>
    <label class="lab">Your note on what one base unit is worth<input class="field" data-bind="note" value="${esc(w.currency.note || '')}" placeholder="for example: roughly a dollar"></label>
    <label class="lab">Daily pay for unskilled work (used for sense checks)<input class="field" data-bind="wage" value="${esc(formatFull(w.anchors.wage, w.currency))}"></label>
    <div class="presetbox">
      <button class="presethead" data-act="cur-toggle" aria-expanded="${st.curOpen}"><span><b>Start over with a preset</b><span class="mini">Replaces the coins above. You will rarely need it.</span></span><span class="chev">${st.curOpen ? '&#9662;' : '&#9656;'}</span></button>
      ${st.curOpen ? `<div class="curpick" role="radiogroup" aria-label="Currency preset">${Object.entries(CURRENCY_PRESETS).map(([v, p]) => `<button class="curcard${curSet === v ? ' on' : ''}${st.curArm === v ? ' arm' : ''}" role="radio" aria-checked="${curSet === v}" data-act="w-cur" data-v="${v}"><b>${esc(p.title)}</b><span class="cs">${st.curArm === v ? 'Tap again to replace' : p.example}</span></button>`).join('')}</div>` : ''}
    </div>
  </div></div></details>

  <details class="sect" data-sec="Economy"${op('Economy')}><summary><h3>Economy</h3><span class="sv">${w.economyTags.length ? w.economyTags.length + ' on' : 'none'}</span></summary><div class="sbody">
    <p>Tags that raise or lower whole categories of price. Pick any that fit the world.</p>
    ${ECONOMY_TAGS.map(t => `<label class="tagrow"><input type="checkbox" data-bind="econ.${t.id}"${w.economyTags.includes(t.id) ? ' checked' : ''}><span><b>${esc(t.label)}</b>${esc(t.describe)}</span></label>`).join('')}
  </div></div></details>

  <details class="sect" data-sec="Dials"${op('Dials')}><summary><h3>Dials</h3><span class="sv">${w.dials.priceLevel === 1 ? 'standard' : '×' + fx(w.dials.priceLevel)}</span></summary><div class="sbody">
    <div class="dialgroup">Prices</div>
    <label class="dialrow"><span class="dt"><b>Price level</b><span class="mini">Scales every price. 1 is standard, 1.5 is a pricier world.</span></span><input class="field" type="number" min="0.1" max="10" step="0.05" data-bind="dial.priceLevel" value="${esc(w.dials.priceLevel)}" inputmode="decimal"></label>
    <label class="dialrow"><span class="dt"><b>Sellers get</b><span class="mini">The share of a price a shop pays when it buys from you.</span></span><select class="field" data-bind="dial.sellFraction">${[0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1].map(v => `<option value="${v}"${+w.dials.sellFraction === v ? ' selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}${[0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1].includes(+w.dials.sellFraction) ? '' : `<option value="${esc(w.dials.sellFraction)}" selected>${Math.round(w.dials.sellFraction * 100)}%</option>`}</select></label>
    <div class="dialgroup">Ranges</div>
    <label class="dialrow"><span class="dt"><b>Range width</b><span class="mini">How far low and high prices sit from the typical one.</span></span><select class="field" data-bind="dial.volatility">${[[0, 'Exact'], [0.3, 'Narrow'], [0.5, 'Normal'], [0.8, 'Wide'], [1, 'Very wide']].map(([v, l]) => `<option value="${v}"${+w.dials.volatility === v ? ' selected' : ''}>${l}</option>`).join('')}${[0, 0.3, 0.5, 0.8, 1].includes(+w.dials.volatility) ? '' : `<option value="${esc(w.dials.volatility)}" selected>Custom (${esc(w.dials.volatility)})</option>`}</select></label>
    <label class="dialrow"><span class="dt"><b>Stacking circumstances</b><span class="mini">Rush, black market and the like. Dampened keeps several at once from piling up.</span></span><select class="field" data-bind="dial.stacking"><option value="dampened"${w.dials.stacking === 'dampened' ? ' selected' : ''}>Dampened</option><option value="strict"${w.dials.stacking === 'strict' ? ' selected' : ''}>Strict multiplication</option></select></label>
    <div class="dialgroup">Display</div>
    <label class="dialrow check"><span class="dt"><b>Round to whole coins</b><span class="mini">Shows 5 sp 9 cp as 6 sp. Small amounts keep their detail.</span></span><input type="checkbox" data-bind="dial.round"${w.dials.round ? ' checked' : ''}></label>
    <div class="dialgroup">When you only say it</div>
    <label class="dialrow"><span class="dt"><b>"Travel"</b><span class="mini">Which trip it prices.</span></span><select class="field" data-bind="defaults.travel">${ctx.entries.filter(e => e.group === 'travel').map(e => `<option value="${esc(e.id)}"${w.defaults.travel === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
    ${ctx.entries.some(e => e.group === 'rent') ? `<label class="dialrow"><span class="dt"><b>"Rent"</b><span class="mini">Which rental it prices.</span></span><select class="field" data-bind="defaults.rent">${ctx.entries.filter(e => e.group === 'rent').map(e => `<option value="${esc(e.id)}"${w.defaults.rent === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>` : ''}
  </div></details>

  <details class="sect" data-sec="My changes"${op('My changes')}><summary><h3>My changes</h3><span class="sv">${w.items.length + w.vocabulary.length + Object.keys(w.overrides).length + Object.keys(w.baseOverrides).length || ''}</span></summary><div class="sbody">
    <div class="factbox"><div class="factrow"><input class="field" id="factIn" value="${esc(st.fact.text)}" placeholder="a healing potion costs 40 gp" aria-label="Tell it a fact" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done"><button class="btn primary" data-act="fact-go">Add</button></div>
      ${st.fact.err ? `<p class="ferr">${esc(st.fact.err)}</p>` : ''}${factPreview()}</div>
    ${w.items.map((it, i) => chg(`${esc(it.name)} <span class="mini">${esc(formatFull(it.bu, w.currency))} ${it.unit === 'each' ? 'each' : 'per ' + esc(it.unit)}</span>`, `data-act="w-del-item" data-i="${i}"`)).join('')}
    ${w.vocabulary.map((v, i) => chg(`${esc(v.term)} <span class="mini">means ${esc(meansLabel(v.means))}</span>`, `data-act="w-del-voc" data-i="${i}"`)).join('')}
    ${Object.entries(w.baseOverrides).map(([id, bu]) => chg(`${esc((ctx.byId.get(id) || {}).name || id)} <span class="mini">${esc(formatFull(bu, w.currency))}</span>`, `data-act="w-del-bo" data-key="${esc(id)}"`)).join('')}
    ${Object.entries(w.overrides).map(([k, v]) => chg(`${esc(overrideLabel(k))} <span class="mini">&times;${esc(fx(v[0]))} to ${esc(fx(v[1]))}</span>`, `data-act="w-del-ov" data-key="${esc(k)}"`)).join('')}
  </div></div></details>
  <details class="sect" data-sec="Back up and share"${op('Back up and share')}><summary><h3>Back up and share</h3><span class="sv"></span></summary><div class="sbody">
    <p>Copy this world to keep it or share it. Paste one below to load it.</p>
    <textarea class="mono" id="exportBox" readonly aria-label="World data">${esc(json)}</textarea>
    <div class="row"><button class="btn" data-act="w-copy">Copy world</button><button class="btn" data-act="w-save-file">Save as file</button></div>
    <textarea class="mono" id="importBox" placeholder="Paste a world here" aria-label="Paste a world"></textarea>
    <div class="row"><button class="btn" data-act="w-import">Load pasted world</button><button class="btn danger" id="resetBtn" data-act="w-reset">Reset everything</button></div>
  </div></div></details>

  <details class="sect" id="about" data-sec="About"${op('About')}><summary><h3>About</h3><span class="sv"></span></summary><div class="sbody">
    <div class="about"><div class="aname">Fool's Gold</div>
    <p>A language parsing calculator for game masters. It does not use AI, and it works offline.</p>
    <p>A game tool by Firebird Games.<br>&copy; 2026 Firebird Games.</p>
    <p class="fine">${esc(SRD_ATTRIBUTION)}</p>
    ${builtAs() ? `<p class="fine">Build ${esc(builtAs())}</p>` : ''}</div>
  </div></div></details>`;
  return html;
}

function guessAll() {
  const g = st.guess;
  if (!g) return [];
  const found = g.q ? ctx.entries.filter(e => (e.name + ' ' + (e.aliases || []).join(' ')).toLowerCase().includes(g.q.toLowerCase()) && !g.cands.some(c => c.id === e.id)).slice(0, 6).map(e => candidateFromEntry(e, ctx, 'Found by search')).filter(Boolean) : [];
  return [tagCandidate(g.tags, g.found, g.phrase), ...g.cands, ...found];
}
function toast(msg, undo) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  if (undo) { const b = document.createElement('button'); b.className = 'tundo'; b.textContent = 'Undo'; b.onclick = () => { undo(); t.hidden = true; }; t.append(' ', b); }
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, undo ? 4200 : 2200);
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
    ta.remove(); toast(ok ? okMsg : 'Copy is blocked here. Select the text and copy it.');
  }
}
// Structural edits re-render the drawer. Plain field edits only refresh what depends on them, so focus stays put.
function worldChanged(opts = {}) {
  normalizeWorld(world);
  ctx = compileWorld(world);
  if (st.query.subject && !ctx.byId.has(st.query.subject)) { st.query.subject = null; }
  persist();
  if (st.text) fromText(st.text, { noHistory: true }); else renderAll();
  if (opts.lite) {
    const t = opts.el, p = t && t.dataset.bind ? t.dataset.bind.split('.') : [];
    if (p[0] === 'dial') t.value = world.dials[p[1]];
    if (p[0] === 'den' && p[2] === 'bu') t.value = world.currency.denominations[+p[1]].bu;
  } else renderDrawer();
}
function uniqueWorldId(base) { let id = base, n = 2; while (S.worlds.some(w => w.id === id)) id = base + '-' + n++; return id; }

// ---------- events ----------
// no pinch or double-tap zoom: this is an app, not a page
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act, d = b.dataset;
  const q = st.query;
  switch (a) {
    case 'offer-on': if (st.offer) { const l = st.offer.list, label = st.offer.label; world.lists = ['srd', 'fantasy', 'modern', 'scifi'].filter(x => x === l || world.lists.includes(x)); st.offer = null; worldChanged(); toast('Turned on ' + label + '. Change it under Settings, Items and words.'); } break;
    case 'offer-no': st.offerDismissed = st.text; st.offer = null; renderResult(); renderTray(); break;
    case 'clear': $('#q').value = ''; st.slot = null; st.guess = null; fromText('', { noHistory: true }); break;
    case 'go': recordHistory(); $('#q').blur(); break;
    case 'sample': { const t = sampleList()[+d.i]; $('#q').value = t; fromText(t); break; }
    case 'fix': { const s = st.parsed.suggestions[+d.i]; const t = st.text.slice(0, s.start) + s.to + st.text.slice(s.end); $('#q').value = t; fromText(t); break; }
    case 'slot':
      if (d.id === 'item') { st.sheet = { open: true, mode: 'item' }; st.flow = { cat: null, search: '' }; st.slot = null; renderSheet(); }
      else { st.slot = st.slot === d.id ? null : d.id; st.numOpen = false; renderResult(); renderTray(); }
      break;
    case 'slot-opt': { const slot = st.slot && slotById(st.slot); const o = slot && slot.options.find(x => x.key === d.key); if (o) { st.slot = null; st.numOpen = false; flowEdit(x => o.apply(x)); } break; }
    case 'num-open': st.numOpen = !d.off; renderTray(); if (st.numOpen) { const i = $('#numIn'); if (i) i.focus(); } break;
    case 'num-set': { const slot = st.slot && slotById(st.slot); const n = parseFloat(($('#numIn') || {}).value); if (slot && n > 0) { const u = ($('#numUnit') || {}).value; st.slot = null; st.numOpen = false; fromQuery(applyNumber(st.query, slot.id, n, u, st.est.entry)); } break; }
    case 'more': st.more = !st.more; renderResult(); break;
    case 'quick': flowEdit(x => {
      if (d.k === 'deal') { x.action = x.action === 'sell' ? 'buy' : 'sell'; x.assumed = x.assumed.filter(z => z !== 'action'); }
      else { const m = ctx.mods.get(d.k); if (!m) return; if (x.mods.includes(d.k)) x.mods = x.mods.filter(z => z !== d.k); else { if (GROUPS[m.group].exclusive) x.mods = x.mods.filter(z => ctx.mods.get(z)?.group !== m.group); x.mods.push(d.k); } }
    }); break;
    case 'pick-item': st.sheet.open = false; flowEdit(x => { delete x.overrides; x.subject = d.v; x.family = null; x.assumed = x.assumed.filter(z => z !== 'mode'); x.rarity = null; x.span = null; x.qty = null; const en = ctx.byId.get(d.v); if (!['travel', 'lodging', 'service', 'labor', 'spell'].includes(en.kind)) x.tier = null; x.mods = x.mods.filter(m => { const mm = ctx.mods.get(m); return mm && applicable(mm, en); }); }); break;
    case 'f-cat': st.flow.cat = d.v; st.flow.search = ''; renderSheet(); break;
    case 'resolve': flowEdit(x => { const g = ctx.mods.get(d.id).group; x.mods = x.mods.filter(m => ctx.mods.get(m)?.group !== g || m === d.id); }); break;
    case 'copy': copyText(summaryLine(st.est), 'Copied'); flash(); break;
    case 'hist': { const h = S.history[+d.i]; $('#q').value = h.text; fromText(h.text, { noHistory: true }); window.scrollTo({ top: 0, behavior: 'smooth' }); break; }
    case 'hist-del': S.history.splice(+d.i, 1); persist(); renderHistory(); break;
    case 'hist-clear': S.history = S.history.filter(x => x.world !== world.id); persist(); renderHistory(); break;
    case 'haggle-open': st.haggleOpen = !st.haggleOpen; renderResult(); if (st.haggleOpen) { const i = $('#hgIn'); if (i && matchMedia('(pointer: fine)').matches) i.focus(); } break;
    case 'haggle-close': st.haggleOpen = false; renderResult(); break;
    case 'haggle-set': setHaggle({ pct: +d.v }); break;
    case 'haggle-off': if (st.query.haggle) setHaggle(null); break;
    case 'haggle-restore': if (st.hgMemo) setHaggle(clone(st.hgMemo)); break;
    case 'haggle-agree': if (st.est && st.est.ok) setHaggle({ price: st.est.typical }); break;
    case 'haggle-in': { const p = parseHaggle($('#hgIn') && $('#hgIn').value); if (!p) toast('Try "15% off", or the price you agreed, like 40 gp.'); else setHaggle(p); break; }
    case 'cart-haggle': st.cartHaggleOpen = !st.cartHaggleOpen; renderSheet(); break;
    case 'cart-hg-set': setCartHaggle(+d.v); break;
    case 'cart-hg-in': { const p = parseHaggle($('#cartHg') && $('#cartHg').value); if (!p || p.pct == null) toast('Try "10% off".'); else setCartHaggle(p.pct); break; }
    case 'cart-hg-off': cartOf().haggle = null; afterCart(); break;
    case 'cart-shop-toggle': st.cartShopOpen = !st.cartShopOpen; renderSheet(); break;
    case 'cart-where': { const c = cartOf(); c.mods = c.mods.filter(id => ctx.mods.get(id)?.group !== 'place'); if (d.id) c.mods.push(d.id); st.cartShopOpen = false; afterCart(); break; }
    case 'cart-chan': { const c = cartOf(); c.mods = c.mods.filter(id => id !== 'wholesale'); if (+d.v) c.mods.push('wholesale'); st.cartShopOpen = false; afterCart(); break; }
    case 'cart-open': openCart(); break;
    case 'cart-add': {
      const c = cartOf(), first = !c.lines.length, snap = clone(c), from = b.getBoundingClientRect();
      addToCart(c, stripShop(st.query, c.mods)); afterCart(); flyCoin(from, first);
      toast('Added to the cart', () => { S.carts[world.id] = snap; afterCart(); });
      break;
    }
    case 'cart-del': { const c = cartOf(), snap = clone(c); c.lines = c.lines.filter(x => x.id !== +d.id); afterCart(); toast('Removed', () => { S.carts[world.id] = snap; afterCart(); }); break; }
    case 'cart-edit': { if (b.dataset.swiped) break; if (b.parentElement && b.parentElement.classList.contains('open')) { closeSwipes(null); break; } const c = cartOf(), l = c.lines.find(x => x.id === +d.id); if (!l || !ctx.byId.has(l.q.subject)) break; st.cartEdit = { id: l.id }; st.haggleOpen = false; st.sheet.open = false; renderSheet(); fromQuery(withShop(l.q, c.mods, ctx)); window.scrollTo(0, 0); break; }
    case 'cart-update': {
      const c = cartOf(), l = c.lines.find(x => x.id === (st.cartEdit && st.cartEdit.id));
      if (l && st.query.subject) { const q = stripShop(st.query, c.mods); delete q.overrides; l.q = q; }
      st.cartEdit = null; st.haggleOpen = false; persist(); clearInput(); openCart(); toast('Line updated'); break;
    }
    case 'cart-remove-edit': {
      const c = cartOf(), snap = clone(c), id = st.cartEdit && st.cartEdit.id;
      c.lines = c.lines.filter(x => x.id !== id); st.cartEdit = null; st.haggleOpen = false; persist(); clearInput(); openCart(); toast('Removed', () => { S.carts[world.id] = snap; afterCart(); }); break;
    }
    case 'cart-cancel': st.cartEdit = null; st.haggleOpen = false; clearInput(); openCart(); break;
    case 'cart-read': cartRead(); break;
    case 'cart-read-add': if (st.cartRead) { addItems(st.cartRead.items, st.cartRead.shop); const n = st.cartRead.items.length; st.cartRead = null; st.cartText = ''; afterCart({ focus: true }); toast('Added ' + n + ' to the cart'); } break;
    case 'cart-read-no': st.cartRead = null; renderSheet(); break;
    case 'cart-offer-add': if (st.cartOffer) { const r = st.cartOffer; addItems(r.items, r.shop); st.cartOffer = null; st.cartOfferDismissed = ''; persist(); clearInput(); openCart(); toast('Added ' + r.items.length + ' to the cart'); } break;
    case 'cart-offer-no': st.cartOfferDismissed = st.text; st.cartOffer = null; renderResult(); break;
    case 'cart-why': st.cartWhy = !st.cartWhy; renderSheet(); break;
    case 'cart-copy': { const c = cartOf(); copyText(cartText(c, ctx, n => money(n), (r, line) => r ? whatText(r.q, r.e.entry) : (line.q.subject || 'An item')), 'Cart copied'); break; }
    case 'cart-clear': { const c = cartOf(); if (b.dataset.armed) { const snap = clone(c); S.carts[world.id] = emptyCart(); st.sheet.open = false; afterCart(); renderSheet(); toast('Cart emptied', () => { S.carts[world.id] = snap; afterCart(); }); } else { b.dataset.armed = '1'; b.textContent = 'Tap again to empty'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Empty the cart'; } }, 3500); } break; }
    case 'copy-receipt': if (st.est && st.est.ok) copyText(receiptText(st.est), 'Receipt copied'); break;
    case 'open-changes': st.sheet.open = false; renderSheet(); st.dpage = 'World'; st.wtab = 'My changes'; st.dpageChanged = true; $('#drawer').hidden = false; document.body.style.overflow = 'hidden'; renderDrawer(); setTimeout(() => { const i = $('#factIn'); if (i) i.focus(); }, 50); break;
    case 'sheet': st.sheet = { open: true, mode: d.mode || 'break' }; renderSheet(); break;
    case 'sheet-close': st.sheet.open = false; renderSheet(); break;
    case 'w-del-ov': delete world.overrides[d.key]; worldChanged(); break;
    case 'w-del-bo': delete world.baseOverrides[d.key]; worldChanged(); break;
    case 'dpage': st.dpage = d.p || null; st.dpageChanged = true; renderDrawer(); break;
    case 'round': world.dials.round = !world.dials.round; persist(); renderAll(); break;
    case 's-set': applySetting(); break;
    case 'fact-go': factGo(); break;
    case 'fact-save': factSave(); break;
    case 'fact-cancel': st.fact.res = null; renderDrawer(); break;
    case 's-cancel': st.settingDismissed = st.text; st.setting = null; fromText(st.text, { noHistory: true }); break;
    case 'g-pick': if (st.guess) { const all = guessAll(); const c = all[+d.i]; if (c) { st.guess.sel = +d.i; st.guess.bu = c.bu; st.guess.exact = false; renderResult(); } } break;
    case 'start': st.start = { action: null }; st.sheet = { open: true, mode: 'start' }; st.flow = { cat: null, search: '' }; st.slot = null; renderSheet(); break;
    case 'ac': { const r = (st.ac || [])[+d.i]; if (!r) break;
      if (r.type === 'item') { st.start = { action: r.verb }; st.sheet = { open: false, mode: 'start' }; startPick(r.id); }
      else { st.start = { action: r.verb }; st.sheet = { open: true, mode: 'start' }; st.flow = { cat: r.type === 'cat' ? r.cat : null, search: '' }; st.slot = null; renderSheet(); }
      break; }
    case 'start-action': st.start = { action: d.v }; renderSheet(); break;
    case 'start-back': st.start = { action: null }; renderSheet(); break;
    case 'start-pick': startPick(d.v); break;
    case 'browse': st.sheet = { open: true, mode: 'item' }; st.flow = { cat: null, search: '' }; st.slot = null; renderSheet(); break;
    case 'g-tag': if (st.guess && d.r) {
      st.guess.tags[d.r] = d.v; st.guess.sel = 0; st.guess.exact = false;
      st.guess.bu = guessAll()[0].bu; renderResult();
    } break;
    case 'g-exact': if (st.guess) { st.guess.exact = true; renderResult(); const i = $('#gPrice'); if (i) i.focus(); } break;
    case 'g-raise': case 'g-lower': if (st.guess && st.guess.sel != null) { const f = a === 'g-raise' ? 1.25 : 0.8; st.guess.bu = niceRound(st.guess.bu * f, 3); renderResult(); } break;
    case 'g-set': if (st.guess && st.guess.sel != null) {
      const c = guessAll()[st.guess.sel], name = capital(st.guess.phrase);
      const item = newItemFrom(name, st.guess.phrase, c, storedPrice(ctx, name, c, st.guess.bu));
      item.id = newItemId(); world.items.push(item); st.guess = null;
      worldChanged(); toast('Saved "' + name + '". Edit it under World, My items.');
    } break;
    case 'g-alias': if (st.guess && st.guess.sel != null) {
      const c = guessAll()[st.guess.sel], term = st.guess.phrase;
      if (c && c.entry) { world.vocabulary.push({ term, means: c.entry.id }); st.guess = null; worldChanged(); toast('"' + term + '" now means ' + c.entry.name.toLowerCase() + '. Edit it under World, Custom words.'); }
    } break;
    // drawer
    case 'open-world': openDrawer(d.scroll); break;
    case 'close-world': closeDrawer(); break;
    case 'w-select': st.wmodal = false; useWorld(d.id); persist(); closeDrawerKeep(); break;
    case 'w-modal': st.wmodal = true; st.wrename = false; st.wnew = false; renderDrawer(); break;
    case 'w-modal-close': st.wmodal = false; renderDrawer(); break;
    case 'w-rename': {
      if (st.wrename) { const i = $('#renameIn'); world.name = (i && i.value.trim()) || world.name; st.wrename = false; persist(); renderDrawer(); }
      else { st.wrename = true; renderDrawer(); const i = $('#renameIn'); if (i) { i.focus(); i.select(); } }
      break;
    }
    case 'w-newtoggle': st.wnew = true; renderDrawer(); break;
    case 'w-new-preset': { st.wmodal = false; const mk = WORLD_PRESETS[d.v]; if (!mk) break; const w = mk(); w.id = uniqueWorldId(w.id); const n = S.worlds.filter(x => x.name === w.name || x.name.startsWith(w.name + ' ')).length; if (n) w.name = w.name + ' ' + (n + 1); S.worlds.push(w); useWorld(w.id); persist(); afterWorldSwitch(); toast('Created ' + w.name + '. It is the world in use.'); break; }
    case 'wtab': st.wtab = d.id; st.dpageChanged = true; renderDrawer(); break;
    case 'jump': { const el = document.getElementById('ws-' + d.id.replace(/\W+/g, '-')); const panel = $('#drawerPanel'); if (el) panel.scrollTo({ top: el.offsetTop - 118, behavior: 'smooth' }); break; }
    case 'w-dup': { const w = clone(world); w.id = uniqueWorldId(w.id); w.name += ' copy'; S.worlds.push(w); useWorld(w.id); afterWorldSwitch(); break; }
    case 'w-del':
      if (S.worlds.length > 1) {
        if (b.dataset.armed) { const gone = world.id; S.worlds = S.worlds.filter(w => w.id !== gone); S.history = S.history.filter(h => h.world !== gone); delete S.carts[gone]; useWorld(S.worlds[0].id); persist(); afterWorldSwitch(); }
        else { b.dataset.armed = '1'; b.textContent = 'Click again to delete'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete this one'; } }, 3500); }
      } break;
    case 'cur-toggle': st.curOpen = !st.curOpen; st.curArm = ''; renderDrawer(); break;
    case 'w-cur': {
      const p = CURRENCY_PRESETS[d.v]; if (!p) break;
      if (st.curArm !== d.v) { st.curArm = d.v; renderDrawer(); break; }
      st.curArm = ''; st.curOpen = false;
      delete world.currency.symbol; delete world.currency.decimal;
      world.currency.denominations = p.denominations();
      if (p.symbol) { world.currency.symbol = p.symbol; world.currency.decimal = p.decimal; }
      world.currency.note = p.note; world.anchors.wage = p.wage;
      worldChanged(); toast('Currency is now ' + p.title.toLowerCase() + '.'); break;
    }
    case 'glyph': world.currency.denominations[+d.i].glyph = d.v; worldChanged(); break;
    case 'w-add-den': world.currency.denominations.push({ id: 'new', name: 'new coin', plural: 'new coins', bu: 1 }); worldChanged(); break;
    case 'w-del-den': world.currency.denominations.splice(+d.i, 1); worldChanged(); break;
    case 'w-add-voc': world.vocabulary.push({ term: '', means: '' }); renderDrawer(); break;
    case 'w-del-voc': world.vocabulary.splice(+d.i, 1); worldChanged(); break;
    case 'w-add-item': world.items.push({ id: newItemId(), name: 'New item', kind: 'good', bu: 100, unit: 'each', tags: [] }); worldChanged(); break;
    case 'w-del-item': world.items.splice(+d.i, 1); worldChanged(); break;
    case 'w-copy': copyText(JSON.stringify(world, null, 1), 'World copied'); break;
    case 'w-save-file': { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(world, null, 1)], { type: 'application/json' })); a.download = slug(world.name) + '.foolsgold.json'; document.body.appendChild(a); a.click(); a.remove(); toast('Saving. If nothing happens, use Copy world.'); } catch (e2) { toast('Saving is blocked here. Use Copy world instead.'); } break; }
    case 'w-import': {
      try {
        const w = normalizeWorld(JSON.parse($('#importBox').value));
        if (!w || typeof w !== 'object') throw new Error('bad');
        w.id = uniqueWorldId(w.id); compileWorld(w); // throws before anything is stored
        S.worlds.push(w); useWorld(w.id); afterWorldSwitch(); toast('World loaded');
      } catch (e2) { toast('Not a Fool\'s Gold world.'); }
      break;
    }
    case 'w-reset': {
      if (b.dataset.armed) { try { localStorage.removeItem('foolsgold.v1'); } catch (e2) { /* ignore */ } S = { ...load(), history: [] }; S.worlds = [WORLD_PRESETS.srd(), WORLD_PRESETS.vcm(), WORLD_PRESETS.modern()]; S.activeId = 'srd'; useWorld('srd'); persist(); afterWorldSwitch(); toast('Reset'); }
      else { b.dataset.armed = '1'; b.textContent = 'Click again to erase all worlds'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Reset everything'; } }, 3500); }
      break;
    }
  }
});
function closeDrawerKeep() { renderDrawer(); if (st.text) fromText(st.text, { noHistory: true }); else renderAll(); }
function afterWorldSwitch() { renderDrawer(); st.query = emptyQuery(); if (st.text) fromText(st.text, { noHistory: true }); else renderAll(); }

$('#q').addEventListener('input', e => fromText(e.target.value));
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); recordHistory(); e.target.blur(); } });
$('#q').addEventListener('focus', () => { st.slot = null; st.numOpen = false; renderTray(); renderResult(); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'hgIn') { e.preventDefault(); const p = parseHaggle(e.target.value); if (!p) toast('Try "15% off", or the price you agreed, like 40 gp.'); else setHaggle(p); return; } if (e.key === 'Enter' && e.target.id === 'cartHg') { e.preventDefault(); $('[data-act=cart-hg-in]').click(); return; } if (e.key === 'Enter' && e.target.id === 'cartIn') { e.preventDefault(); cartRead(); return; } if (e.key === 'Enter' && e.target.id === 'factIn') { e.preventDefault(); factGo(); return; } if (e.target.id === 'renameIn') { if (e.key === 'Enter') { e.preventDefault(); const i = $('#renameIn'); world.name = i.value.trim() || world.name; st.wrename = false; persist(); renderDrawer(); } else if (e.key === 'Escape') { st.wrename = false; renderDrawer(); } return; } if (e.key !== 'Escape') return; if (st.slot) { st.slot = null; renderTray(); renderResult(); return; } if (!$('#drawer').hidden) { if (st.dpage) { st.dpage = null; renderDrawer(); } else closeDrawer(); } else if (st.sheet.open) { st.sheet.open = false; renderSheet(); } });
$('#drawer').addEventListener('click', e => { if (e.target.id === 'drawer') closeDrawer(); });

// drawer and flow inputs
document.addEventListener('toggle', e => {
  const t = e.target;
}, true);
document.addEventListener('input', e => {
  if (e.target.id === 'cartIn') { st.cartText = e.target.value; if (st.cartRead) { st.cartRead = null; renderSheet(); const i = $('#cartIn'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } return; }
  if (e.target.id === 'factIn') { st.fact.text = e.target.value; if (st.fact.res || st.fact.err) { st.fact.res = null; st.fact.err = ''; } return; }
  if (e.target.id === 'flowSearch') { st.flow.search = e.target.value; renderSheet(); const i = $('#flowSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  if (e.target.id === 'gSearch' && st.guess) { st.guess.q = e.target.value; renderResult(); const i = $('#gSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'gPrice') { const v = parseMoney(t.value, cur()); if (v && st.guess) { st.guess.bu = v; renderResult(); } else toast('Could not read that price. Try "25 gp".'); return; }
  if (t.id === 'flowQty') { const n = Math.max(1, Math.round(+t.value || 1)); flowEdit(x => { x.qty = n === 1 ? null : { lo: n, hi: n, unit: ctx.byId.get(x.subject)?.unit === 'lb' ? 'lb' : undefined }; }); return; }
  if (t.id === 'flowSpan') { const n = Math.max(1, +t.value || 1); flowEdit(x => { const tu = timeUnit(ctx.byId.get(x.subject) || {}); x.span = { lo: n, hi: n, unit: tu ? tu.unit : 'day' }; }); return; }
  if (t.id === 'flowMiles') { const n = Math.max(1, +t.value || 1); flowEdit(x => { x.span = { lo: n, hi: n, unit: 'mile' }; }); return; }
  const bind = t.dataset && t.dataset.bind;
  if (!bind) return;
  const w = world, p = bind.split('.');
  if (bind === 'textsize') { S.textSize = t.value === 'auto' ? null : t.value; applyTextSize(); persist(); renderDrawer(); return; }
  if (bind === 'style') { const v = t.value; S.skin = SKIN_FONTS[v] ? v : null; S.theme = v === 'light' || v === 'dark' ? v : null; applyTheme(); applySkin(); persist(); renderDrawer(); return; }
  if (bind === 'theme') { S.theme = t.value === 'system' ? null : t.value; applyTheme(); persist(); renderDrawer(); return; }
  if (bind === 'name') w.name = t.value.trim() || 'My world';
  else if (p[0] === 'list') {
    const on = new Set(w.lists);
    t.checked ? on.add(p[1]) : on.delete(p[1]);
    if (!on.size) { on.add('fantasy'); toast('At least one item list stays on.'); }
    w.lists = ['srd', 'fantasy', 'modern', 'scifi'].filter(x => on.has(x));
    worldChanged(); return;
  }
  else if (p[0] === 'den') { const d = w.currency.denominations[+p[1]]; if (p[2] === 'bu') d.bu = Math.max(0.01, +t.value || 1); else { d[p[2]] = t.value.trim() || d[p[2]]; if (p[2] === 'name') d.plural = d.name.endsWith('s') ? d.name : d.name + 's'; } }
  else if (bind === 'belowSmallest') w.currency.belowSmallest = t.value;
  else if (bind === 'note') w.currency.note = t.value;
  else if (bind === 'wage') { const v = parseMoney(t.value, w.currency); if (v > 0) w.anchors.wage = v; }
  else if (p[0] === 'econ') { const set = new Set(w.economyTags); t.checked ? set.add(p[1]) : set.delete(p[1]); w.economyTags = [...set]; }
  else if (p[0] === 'dial') w.dials[p[1]] = t.type === 'checkbox' ? t.checked : t.tagName === 'SELECT' ? t.value : +t.value;
  else if (bind === 'defaults.travel') w.defaults.travel = t.value;
  else if (bind === 'defaults.rent') w.defaults.rent = t.value;
  else if (p[0] === 'voc') {
    if (p[2] === 'means') {
      const id = resolveMeans(t.value);
      if (id === null) { toast('No item called "' + t.value.trim() + '". Pick one from the list.'); renderDrawer(); return; }
      w.vocabulary[+p[1]].means = id; t.value = meansLabel(id);
    } else w.vocabulary[+p[1]][p[2]] = t.value.trim();
  }
  else if (p[0] === 'item') {
    const it = w.items[+p[1]];
    if (p[2] === 'price') { const v = parseMoney(t.value, w.currency); if (v > 0) it.bu = v; }
    else if (p[2] === 'tags') it.tags = t.value.toLowerCase().split(/[\s,]+/).filter(Boolean);
    else it[p[2]] = t.value.trim();
  }
  worldChanged({ lite: true, el: t });
});

// Glyphs are applied whenever any part of the screen is redrawn, so no render path can miss them.
{
  let queued = false;
  const roots = ['#result', '#tray', '#sheetBody', '#history', '#drawerPanel', '#cartPill'].map(id => $(id)).filter(Boolean);
  const run = () => { queued = false; for (const r of roots) glyphify(r); };
  const mo = new MutationObserver(() => { run(); });
  for (const r of roots) mo.observe(r, { childList: true, subtree: true });
}

// ---------- theme: match device, light or dark ----------
function applyTheme() {
  const t = S.theme;
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark'; // Night unless Day is chosen
}
applyTheme();
const TEXT_SIZES = [['auto', 'Match my phone', 0], ['s', 'Small', 0.9], ['m', 'Default', 1], ['l', 'Large', 1.15], ['xl', 'Larger', 1.3], ['xxl', 'Largest', 1.5]];
// iOS Dynamic Type: measure the system body size once and scale against the 17px default
function phoneScale() {
  try {
    if (!(window.CSS && CSS.supports('font', '-apple-system-body'))) return 1;
    const d = document.createElement('div');
    d.style.cssText = 'font:-apple-system-body;position:absolute;visibility:hidden;pointer-events:none';
    d.textContent = 'A'; document.body.appendChild(d);
    const px = parseFloat(getComputedStyle(d).fontSize); d.remove();
    return px > 0 ? Math.min(1.6, Math.max(0.85, px / 17)) : 1;
  } catch (e) { return 1; }
}
function textScale() { const t = TEXT_SIZES.find(x => x[0] === (S.textSize || 'auto')); return t && t[2] ? t[2] : phoneScale(); }
function applyTextSize() { const k = textScale(), h = document.documentElement; h.style.setProperty('--ts', String(+k.toFixed(3))); if (k >= 1.25) h.dataset.big = '1'; else delete h.dataset.big; }
const STYLES = [['dark', 'Night'], ['light', 'Day'], ['spellbook', 'Spellbook'], ['receipt', 'Receipt'], ['pyrite', 'Pyrite']];
const SKIN_FONTS = {
  spellbook: 'family=IM+Fell+English:ital@0;1&family=Cormorant+Garamond:wght@500;700',
  receipt: 'family=Courier+Prime:wght@400;700',
  pyrite: 'family=Chakra+Petch:wght@400;600;700&family=JetBrains+Mono:wght@400;600',
};
function applySkin() {
  const sk = window.__FG_SKIN || S.skin, k = sk && SKIN_FONTS[sk] ? sk : null;
  if (k) {
    document.documentElement.dataset.skin = k;
    if (!document.getElementById('skinFont')) { const l = document.createElement('link'); l.id = 'skinFont'; l.rel = 'stylesheet'; document.head.appendChild(l); }
    document.getElementById('skinFont').href = 'https://fonts.googleapis.com/css2?' + SKIN_FONTS[k] + '&display=swap';
  } else delete document.documentElement.dataset.skin;
}
applySkin();
applyTextSize();
addEventListener('resize', () => { if (!S.textSize) applyTextSize(); });

// ---------- self-update for saved copies (home screen apps keep old files) ----------
const builtAs = () => (document.querySelector('meta[name="fg-build"]') || {}).content || '';
let lastCheck = 0;
async function checkForUpdate() {
  const mine = builtAs();
  if (!mine || Date.now() - lastCheck < 20000) return;
  lastCheck = Date.now();
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const { v } = await r.json();
    if (!v || v === mine) return;
    const key = 'fg-reloaded-' + v;
    if (sessionStorage.getItem(key)) return; // one reload per version, never a loop
    sessionStorage.setItem(key, '1'); sessionStorage.setItem('fg-updated', '1');
    location.replace(location.pathname + '?v=' + v);
  } catch (e) { /* offline or blocked: keep running the copy we have */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (!S.textSize) applyTextSize(); checkForUpdate(); } });
// offline: keep every file so the app opens and prices with no network (the site only; the single-file preview has no build tag)
function launchSplash() {
  try {
    if (!builtAs() || matchMedia('(prefers-reduced-motion: reduce)').matches || sessionStorage.getItem('fgSplash')) return;
    sessionStorage.setItem('fgSplash', '1');
  } catch (e) { return; }
  const d = document.createElement('div');
  d.id = 'launch'; d.setAttribute('aria-hidden', 'true');
  d.innerHTML = '<div class="lmark">Fool&rsquo;s <span class="struck">G</span>old<i class="shim"></i></div>';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1600);
}
launchSplash();
if ('serviceWorker' in navigator && builtAs()) navigator.serviceWorker.register('sw.js').catch(() => {});
try { if (sessionStorage.getItem('fg-updated')) { sessionStorage.removeItem('fg-updated'); setTimeout(() => toast('Updated to the latest version.'), 400); } } catch (e) { /* ignore */ }
checkForUpdate();

// ---------- boot ----------
if (window.__FG_WORLD && WORLD_PRESETS[window.__FG_WORLD] && !S.worlds.some(w => w.id === window.__FG_WORLD)) S.worlds.push(WORLD_PRESETS[window.__FG_WORLD]());
if (window.__FG_WORLD) S.activeId = window.__FG_WORLD;
useWorld(S.activeId);
const first = S.last ?? sampleList()[0];
$('#q').value = first;
fromText(first, { noHistory: true });
