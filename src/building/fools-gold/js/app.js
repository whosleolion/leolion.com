// Fool's Gold UI. All logic lives in the engine/parser modules; this file wires the page.
import { compileWorld } from './world.js?v=90a3a8e3';
import { parse, queryToText, chipsFor, emptyQuery } from './parser.js?v=90a3a8e3';
import { estimate, findConflicts, timeUnit } from './engine.js?v=90a3a8e3';
import { buildFields, applyNumber, tokenRoles } from './fields.js?v=90a3a8e3';
import { findOffer } from './lists.js?v=90a3a8e3';
import { suggestPrompts } from './suggest.js?v=90a3a8e3';
import { readFact } from './facts.js?v=90a3a8e3';
import { formatMoney, formatRange, formatFull, parseMoney, niceRound } from './money.js?v=90a3a8e3';
import {
  ECONOMY_TAGS, MODIFIERS, GROUPS, RARITIES, TIER_NAMES, FAMILIES, SAMPLE_QUERIES, WORLD_PRESETS, CURRENCY_PRESETS, currencyPresetOf, SRD_ATTRIBUTION, slug,
} from './data.js?v=90a3a8e3';
import { applicable } from './engine.js?v=90a3a8e3';
import { load, save, normalizeWorld, newItemId } from './store.js?v=90a3a8e3';
import { parseSetting, baseFor, storedFor } from './setting.js?v=90a3a8e3';
import { candidatesFor, candidateFromEntry, previewWith, storedPrice, newItemFrom } from './guess.js?v=90a3a8e3';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const fx = n => String(+(+n).toFixed(2));

let S = load();
let world = null, ctx = null;
const st = { setting: null, settingDismissed: '', sheet: { open: false, mode: 'break' }, editRow: null, dpage: null, wmodal: false, curOpen: false, curArm: '', fact: { text: '', res: null, err: '' }, wtab: 'Item lists', wrename: false, wnew: false, guess: null, slot: null, numOpen: false, more: false, offer: null, offerDismissed: '', text: '', parsed: null, query: emptyQuery(), est: null, fields: null, flow: { cat: null, search: '' }, histTimer: null };

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
  renderUnderstanding(); renderResult(); renderTray(); renderInput(); renderSheet(); renderHistory();
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
const hasEdits = q => !!(q.overrides && ((q.overrides.f && Object.keys(q.overrides.f).length) || q.overrides.base));
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
    el.innerHTML = g || `<p class="empty">No item found. ${st.parsed && st.parsed.suggestions.length ? 'Check the suggestion above, or name' : 'Name'} an item, service or trip, or search the list with the item field once something is priced.</p>`; return;
  }
  if (!e.ok && e.error === 'conflict') {
    el.innerHTML = e.conflicts.map(c => `<div class="conflict"><p><b>${esc(GROUPS[c.group].ask)}:</b> pick one.</p><div class="row">${c.ids.map((id, i) => `<button class="pill" data-act="resolve" data-id="${esc(id)}">${esc(c.labels[i])}</button>`).join('')}</div></div>`).join('');
    return;
  }
  const ent = e.entry, pr = np(money(e.typical));
  const pos = e.hi > e.lo ? Math.min(100, Math.max(0, (Math.log(e.typical) - Math.log(e.lo)) / (Math.log(e.hi) - Math.log(e.lo)) * 100)) : 50;
  const qtyTxt = q.qty && !timeUnit(ent) ? (q.qty.lo === q.qty.hi ? q.qty.lo : q.qty.lo + ' to ' + q.qty.hi) + (q.qty.unit === 'lb' ? ' lb of ' : ' × ') : '';
  const spanTxt = q.span && timeUnit(ent) ? ', ' + (q.span.lo === q.span.hi ? q.span.lo : q.span.lo + ' to ' + q.span.hi) + ' ' + q.span.unit + (q.span.hi === 1 ? '' : 's') : '';
  const what = qtyTxt + ent.name + (q.rarity && ent.curve ? ', ' + q.rarity : '') + spanTxt;
  const meta = [e.each ? money(e.each) + ' ' + (e.eachLabel || 'each') : '', hasEdits(q) ? 'edited' : ''].filter(Boolean);
  const f = st.fields || { shown: [], more: [] };
  const rows = [...f.shown, ...(st.more ? f.more : [])].map(slotRow).join('');
  const moreRow = f.more.length ? `<button class="slot more" data-act="more"><span>${st.more ? 'Fewer fields' : 'More fields'}</span><span class="hint">${f.more.length}</span></button>` : '';
  const glintNow = st.glintKey !== ent.id; st.glintKey = ent.id;
  el.innerHTML = `<section class="price">
    <div class="what">${esc(what)}</div>
    <button class="pricebtn" data-act="copy" aria-label="Copy price"><span class="num">${esc(pr.n)}${pr.u ? `<small>${esc(pr.u)}</small>` : ''}</span></button>
    <div class="span" role="img" aria-label="Range ${esc(range(e.lo, e.hi))}"><div class="rule"></div><div class="band"></div><div class="tick" style="left:${pos.toFixed(1)}%"></div></div>
    <div class="ends"><span>${esc(money(e.lo))}</span><span>${esc(money(e.hi))}</span></div>
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
  if (st.setting || st.guess) { t.innerHTML = ''; return; }
  if (!st.text) { t.innerHTML = `<div class="quick">${sampleList().map((x, i) => `<button class="q sample" data-act="sample" data-i="${i}">${esc(x)}</button>`).join('')}</div>`; return; }
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
  chips.push(`<button class="q" data-act="sheet" data-mode="break">Details${factsList(e).length ? ` · ${factsList(e).length}` : ''}</button>`);
  t.innerHTML = `<div class="quick">${chips.join('')}</div>`;
}

// ---------- bottom sheet: the breakdown, or the item picker ----------
function breakdownHtml(e) {
  const q = st.query;
  const pos = e.hi > e.lo ? Math.min(100, Math.max(0, (Math.log(e.typical) - Math.log(e.lo)) / (Math.log(e.hi) - Math.log(e.lo)) * 100)) : 50;
  const bar = `<div class="rangebar" role="img" aria-label="Range ${esc(range(e.lo, e.hi))}"><div class="track"><div class="band"></div><div class="mark" style="left:${pos.toFixed(1)}%"></div></div><div class="ends"><span>${esc(money(e.lo))}</span><span>${esc(money(e.hi))}</span></div></div>`;
  const rows = e.factors.map((f, i) => {
    const key = f.key || 'row:' + i;
    let eff;
    if (f.kind === 'base') eff = esc(range(f.lo, f.hi));
    else if (f.kind === 'qty') eff = esc(f.label);
    else {
      const a = f.effLo ?? f.lo, b = f.effHi ?? f.hi;
      eff = '× ' + (Math.abs(a - b) < 0.005 ? fx(a) : fx(a) + ' to ' + fx(b));
      const dir = (a * b) ** 0.5;
      eff = `<span class="${dir > 1.005 ? 'up' : dir < 0.995 ? 'down' : ''}">${eff}</span>`;
    }
    const label = f.kind === 'qty' || f.kind === 'base' ? f.label.replace(/^× /, '') : f.label;
    const tappable = !!(f.key || f.why);
    const open = st.editRow === key;
    let h = `<tr${tappable ? ` class="rowwhy${open ? ' open' : ''}" data-act="edit-row" data-key="${esc(key)}" tabindex="0"` : ''}><td><span class="lbl">${esc(label)}${f.edited ? ` <span class="edited">${f.saved ? 'saved' : 'edited'}</span>` : ''}</span></td><td class="num">${eff}${f.weight !== undefined && f.weight < 0.99 ? `<br><span class="mini">counts ${Math.round(f.weight * 100)}%</span>` : ''}</td><td class="num">${esc(money(Math.sqrt(f.runLo * f.runHi)))}</td><td class="chev">${tappable ? (open ? '▴' : '▾') : ''}</td></tr>`;
    if (open) h += `<tr class="edrow"><td colspan="4">${editorHtml(f, key)}</td></tr>`;
    return h;
  }).join('');
  return bar + `<table class="fx"><thead><tr><th>Step</th><th>Factor</th><th>Total</th><th></th></tr></thead><tbody>${rows}</tbody></table>` +
    (hasEdits(q) ? `<div class="row" style="margin-top:10px"><button class="btn" data-act="ed-reset-all">Reset edits to this question</button></div>` : '');
}
function editorHtml(f, key) {
  const ent = st.est.entry;
  let h = `<div class="editor">`;
  if (f.why) h += `<p class="why-t">${esc(f.why)}</p>`;
  if (f.key === 'base') {
    const canKeep = !ent.curve;
    h += `<label class="lab">Price ${esc(f.label.replace(/^.*\(/, '(').replace(/^\((.*)\)$/, '$1'))}<input class="field" data-ed="base" inputmode="decimal" value="${esc(formatFull(f.mid, cur()))}"></label>`;
    if (f.edited) h += `<div class="row"><button class="btn" data-act="ed-reset" data-key="${esc(key)}">Reset</button>${canKeep ? `<button class="btn primary" data-act="ed-keep" data-key="${esc(key)}">Keep for this world</button>` : ''}</div>`;
    h += `<p class="mini">${f.edited ? (canKeep ? 'Applies to this question until you keep it.' : 'Applies to this question. This item is priced by rarity, so it cannot be kept as one price.') : 'Type a new price to see the estimate change.'}</p>`;
  } else if (f.key) {
    h += `<div class="grid2"><label class="lab">Low ×<input class="field" data-ed="lo" type="number" inputmode="decimal" step="0.05" min="0.05" max="100" value="${esc(fx(f.lo))}"></label><label class="lab">High ×<input class="field" data-ed="hi" type="number" inputmode="decimal" step="0.05" min="0.05" max="100" value="${esc(fx(f.hi))}"></label></div>`;
    if (f.edited) h += `<div class="row"><button class="btn" data-act="ed-reset" data-key="${esc(key)}">Reset</button>${!f.saved ? `<button class="btn primary" data-act="ed-keep" data-key="${esc(key)}">Keep for this world</button>` : ''}</div>`;
    h += `<p class="mini">${f.saved ? 'Saved for this world. Manage it under World, Adjustments.' : f.edited ? 'Applies to this question until you keep it.' : 'Change the range to see the estimate change.'}</p>`;
  }
  return h + `</div>`;
}
function pickerHtml() {
  const cats = [...FLOW_CATS.map(c => [c[0], c[1]]), ['mine', 'My items']].filter(([id]) => ctx.entries.some(e => catOf(e) === id));
  const sel = st.flow.cat;
  const unitBU = e => e.perMile ? e.perMile * e.mpd : (e.bu ?? 0);
  const search = st.flow.search.trim().toLowerCase();
  const items = ctx.entries.filter(e => search ? (e.name + ' ' + (e.aliases || []).join(' ')).toLowerCase().includes(search) : (sel ? catOf(e) === sel : false));
  items.sort((a, b) => (b.isCategory ? 1 : 0) - (a.isCategory ? 1 : 0) || unitBU(a) - unitBU(b) || a.name.localeCompare(b.name));
  const cur0 = st.query.subject;
  return `<input class="field" id="flowSearch" type="search" placeholder="Search all items" value="${esc(st.flow.search)}" aria-label="Search all items" style="width:100%">
    <div class="quick" style="margin:0">${cats.map(([id, l]) => `<button class="q${sel === id && !search ? ' on' : ''}" data-act="f-cat" data-v="${id}">${esc(l)}</button>`).join('')}</div>
    ${items.length ? `<div class="fields">${items.slice(0, 80).map(e => {
      const per = e.curve ? 'by rarity' : money(unitBU(e)) + (timeUnit(e) ? ' / ' + timeUnit(e).word : e.unit === 'lb' ? ' / lb' : '');
      return `<button class="slot${cur0 === e.id ? ' open' : ''}" data-act="pick-item" data-v="${esc(e.id)}"><span class="v">${esc(e.name)}${e.isCategory ? ' <i>any</i>' : ''}</span><span class="hint">${esc(per)}</span></button>`;
    }).join('')}</div>` : `<p class="mini" style="color:var(--muted)">${sel || search ? 'Nothing matches.' : 'Pick a kind above or search.'}</p>`}`;
}
function renderSheet() {
  const sh = $('#sheet'), s = st.sheet, e = st.est;
  if (!s.open) { sh.hidden = true; return; }
  const body = $('#sheetBody'), top = body.scrollTop;
  if (s.mode === 'item') {
    $('#sheetTitle').textContent = 'Choose item';
    body.innerHTML = pickerHtml();
  } else {
    if (!(e && e.ok && st.query.subject && !st.setting)) { sh.hidden = true; return; }
    $('#sheetTitle').textContent = 'Breakdown';
    const facts = factsList(e);
    body.innerHTML = breakdownHtml(e) + (facts.length ? `<div class="facts">${facts.map(f => `<p>${f}</p>`).join('')}</div>` : '');
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
    const cands = candidatesFor(phrase, ctx);
    st.guess = { phrase, cands, sel: cands.length ? 0 : null, bu: cands.length ? cands[0].bu : 0, q: '', exact: false };
  }
  return st.guess;
}
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
function guessCard() {
  const phrase = unknownPhrase();
  if (!phrase) { st.guess = null; return ''; }
  const g = ensureGuess(phrase), name = capital(phrase);
  const found = g.q ? ctx.entries.filter(e => (e.name + ' ' + (e.aliases || []).join(' ')).toLowerCase().includes(g.q.toLowerCase()) && !g.cands.some(c => c.id === e.id)).slice(0, 6).map(e => candidateFromEntry(e, ctx, 'Found by search')).filter(Boolean) : [];
  const all = [...g.cands, ...found];
  const qtxt = st.query.qty ? (st.query.qty.lo === st.query.qty.hi ? st.query.qty.lo : st.query.qty.lo + ' to ' + st.query.qty.hi) : null;
  let h = `<section class="guess"><div class="gh"><b>${esc(phrase)}</b> is not in the price list.${all[g.sel] ? ' Closest match: <b>' + esc(all[g.sel].label) + '</b>.' : ''}</div>`;
  if (g.sel != null && all[g.sel]) {
    const c = all[g.sel], pv = previewWith(ctx, name, c, g.bu, { ...st.query, subject: 'tmp.guess' });
    const one = pv.one.ok ? pv.one.typical : g.bu, pr = np(money(one));
    h += `<div class="stepper"><button class="sb" data-act="g-lower" aria-label="Lower the price">&minus;</button><div class="gval"><div class="num">${esc(pr.n)}<small>${esc(pr.u)}</small></div><div class="gtot">${c.unit && c.unit !== 'each' ? 'per ' + esc(c.unit) : 'each'}</div></div><button class="sb" data-act="g-raise" aria-label="Raise the price">+</button></div>`;
    if (qtxt && pv.full.ok) h += `<div class="gtot">For ${esc(String(qtxt))}: about <b>${esc(money(pv.full.typical))}</b> (${esc(range(pv.full.lo, pv.full.hi))})</div>`;
  }
  h += `<div class="sep"><span>Closest matches</span></div><div class="fields">${all.map((c, i) => `<button class="slot${g.sel === i ? ' open' : ''}" data-act="g-pick" data-i="${i}"><span class="v">${g.sel === i ? '<span class="dot r-item"></span>' : ''}${esc(c.label)}</span><span class="hint">${esc(money(c.bu))}${c.unit && c.unit !== 'each' ? ' / ' + esc(c.unit) : ''}</span></button>`).join('')}</div>
    <input class="field gsearch" id="gSearch" type="search" placeholder="Search all items" value="${esc(g.q)}" aria-label="Search all items">`;
  if (g.sel != null && all[g.sel]) {
    const c = all[g.sel];
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
  const themeLabel = (STYLES.find(x => x[0] === styleNow) || STYLES[0])[1];
  const curSet = currencyPresetOf(w.currency);
  const html = `
  <details class="sect" data-sec="Appearance"${op('Appearance')}><summary><h3>Appearance</h3><span class="sv">${esc(themeLabel)}</span></summary><div class="sbody">
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
  return [...g.cands, ...found];
}
function keepEdit(key) {
  const f = st.est && st.est.factors.find(x => x.key === key), ent = st.est && st.est.entry;
  if (!f) return;
  if (key === 'base') {
    if (ent.curve || !(st.query.overrides && st.query.overrides.base > 0)) return;
    world.baseOverrides[ent.id] = st.query.overrides.base;
  } else {
    world.overrides[key] = [f.lo, f.hi];
  }
  st.editRow = null;
  worldChanged({ lite: true });
  toast('Kept for this world. Manage it under World.');
}
function applyEdit(kind, value) {
  const key = st.editRow, f = st.est && st.est.factors.find(x => x.key === key);
  if (!f) return;
  if (kind === 'base') {
    const v = parseMoney(value, cur());
    if (!v) { toast('Could not read that price. Try "25 gp".'); return; }
    flowEdit(x => { x.overrides ||= {}; x.overrides.base = v; });
    return;
  }
  flowEdit(x => {
    x.overrides ||= {}; x.overrides.f ||= {};
    const cur0 = x.overrides.f[key] || [f.lo, f.hi];
    let lo = kind === 'lo' ? +value : cur0[0], hi = kind === 'hi' ? +value : cur0[1];
    if (!(lo > 0) || !isFinite(lo)) lo = cur0[0];
    if (!(hi > 0) || !isFinite(hi)) hi = cur0[1];
    lo = Math.min(100, Math.max(0.05, lo)); hi = Math.min(100, Math.max(0.05, hi));
    if (hi < lo) { if (kind === 'lo') hi = lo; else lo = hi; }
    x.overrides.f[key] = [lo, hi];
  });
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2200);
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
    case 'sheet': st.sheet = { open: true, mode: d.mode || 'break' }; st.editRow = null; renderSheet(); break;
    case 'sheet-close': st.sheet.open = false; st.editRow = null; renderSheet(); break;
    case 'edit-row': st.editRow = st.editRow === d.key ? null : d.key; renderSheet(); break;
    case 'ed-reset': flowEdit(x => { if (x.overrides) { if (d.key === 'base') delete x.overrides.base; else if (x.overrides.f) delete x.overrides.f[d.key]; } }); if (d.key === 'base' && st.est && world.baseOverrides[st.est.entry.id]) { delete world.baseOverrides[st.est.entry.id]; worldChanged({ lite: true }); } else if (world.overrides[d.key]) { delete world.overrides[d.key]; worldChanged({ lite: true }); } break;
    case 'ed-reset-all': flowEdit(x => { delete x.overrides; }); break;
    case 'ed-keep': keepEdit(d.key); break;
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
        if (b.dataset.armed) { const gone = world.id; S.worlds = S.worlds.filter(w => w.id !== gone); S.history = S.history.filter(h => h.world !== gone); useWorld(S.worlds[0].id); persist(); afterWorldSwitch(); }
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
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'factIn') { e.preventDefault(); factGo(); return; } if (e.target.id === 'renameIn') { if (e.key === 'Enter') { e.preventDefault(); const i = $('#renameIn'); world.name = i.value.trim() || world.name; st.wrename = false; persist(); renderDrawer(); } else if (e.key === 'Escape') { st.wrename = false; renderDrawer(); } return; } if (e.key !== 'Escape') return; if (st.slot) { st.slot = null; renderTray(); renderResult(); return; } if (!$('#drawer').hidden) { if (st.dpage) { st.dpage = null; renderDrawer(); } else closeDrawer(); } else if (st.sheet.open) { st.sheet.open = false; renderSheet(); } });
$('#drawer').addEventListener('click', e => { if (e.target.id === 'drawer') closeDrawer(); });

// drawer and flow inputs
document.addEventListener('toggle', e => {
  const t = e.target;
}, true);
document.addEventListener('input', e => {
  if (e.target.id === 'factIn') { st.fact.text = e.target.value; if (st.fact.res || st.fact.err) { st.fact.res = null; st.fact.err = ''; } return; }
  if (e.target.id === 'flowSearch') { st.flow.search = e.target.value; renderSheet(); const i = $('#flowSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  if (e.target.id === 'gSearch' && st.guess) { st.guess.q = e.target.value; renderResult(); const i = $('#gSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset && t.dataset.ed) { applyEdit(t.dataset.ed, t.value); return; }
  if (t.id === 'gPrice') { const v = parseMoney(t.value, cur()); if (v && st.guess) { st.guess.bu = v; renderResult(); } else toast('Could not read that price. Try "25 gp".'); return; }
  if (t.id === 'flowQty') { const n = Math.max(1, Math.round(+t.value || 1)); flowEdit(x => { x.qty = n === 1 ? null : { lo: n, hi: n, unit: ctx.byId.get(x.subject)?.unit === 'lb' ? 'lb' : undefined }; }); return; }
  if (t.id === 'flowSpan') { const n = Math.max(1, +t.value || 1); flowEdit(x => { const tu = timeUnit(ctx.byId.get(x.subject) || {}); x.span = { lo: n, hi: n, unit: tu ? tu.unit : 'day' }; }); return; }
  if (t.id === 'flowMiles') { const n = Math.max(1, +t.value || 1); flowEdit(x => { x.span = { lo: n, hi: n, unit: 'mile' }; }); return; }
  const bind = t.dataset && t.dataset.bind;
  if (!bind) return;
  const w = world, p = bind.split('.');
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
  const roots = ['#result', '#tray', '#sheetBody', '#history', '#drawerPanel'].map(id => $(id)).filter(Boolean);
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
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
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
