// Fool's Gold UI. All logic lives in the engine/parser modules; this file wires the page.
import { compileWorld } from './world.js';
import { parse, queryToText, chipsFor, emptyQuery } from './parser.js';
import { estimate, findConflicts, timeUnit } from './engine.js';
import { analyze } from './unstated.js';
import { formatMoney, formatRange, formatFull, parseMoney, niceRound } from './money.js';
import {
  ECONOMY_TAGS, MODIFIERS, GROUPS, RARITIES, TIER_NAMES, FAMILIES, SAMPLE_QUERIES, WORLD_PRESETS, SRD_ATTRIBUTION, slug,
} from './data.js';
import { applicable } from './engine.js';
import { load, save, normalizeWorld, newItemId } from './store.js';
import { candidatesFor, candidateFromEntry, previewWith, storedPrice, newItemFrom } from './guess.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const fx = n => String(+(+n).toFixed(2));

let S = load();
let world = null, ctx = null;
const st = { ui: { hist: false }, sheet: { open: false, tab: 'break' }, editRow: null, dpage: null, flowOpen: {}, guess: null, mode: 'type', text: '', parsed: null, query: emptyQuery(), est: null, an: null, flow: { cat: null, search: '' }, histTimer: null, dirty: false };

function useWorld(id) {
  world = S.worlds.find(w => w.id === id) || S.worlds[0];
  normalizeWorld(world);
  S.activeId = world.id;
  ctx = compileWorld(world);
  $('#worldName').textContent = world.name;
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
  run(opts);
}
function fromQuery(q) {
  st.query = q;
  st.text = queryToText(q, ctx);
  $('#q').value = st.text;
  st.parsed = { query: q, unrecognized: [], suggestions: [], notes: [], parts: [] };
  run();
}
function run(opts = {}) {
  const q = st.query;
  st.est = q.subject ? estimate(q, ctx) : null;
  st.an = st.est && st.est.ok ? analyze(q, st.est, ctx) : null;
  S.last = st.text; persist();
  renderAll();
  if (st.est && st.est.ok && st.text && !opts.noHistory) scheduleHistory();
}
function renderAll() {
  $('#clearBtn').hidden = !st.text;
  renderUnderstanding(); renderSamples(); renderResult(); renderSheet(); renderHistory(); renderFlow();
}

// ---------- hints, chips, result ----------
function chipsHtml() {
  const chips = st.query.subject || st.query.mods.length || st.query.qty || st.query.span || st.query.rarity || st.query.tier ? chipsFor(st.query, ctx) : [];
  return chips.map(c =>
    `<span class="chip r-${c.role}${c.assumed ? ' assumed' : ''}" title="${esc(c.assumed ? 'Assumed' : c.role)}"><span class="role">${esc(c.role === 'mod' ? c.group : c.role)}</span>${esc(c.label)}${c.assumed ? '<span class="role">assumed</span>' : ''}<button class="x" data-act="chip-x" data-key="${esc(c.key)}" aria-label="Remove ${esc(c.label)}">×</button></span>`
  ).join('');
}
// Only things the DM must act on stay visible: typo suggestions and ignored words.
function renderUnderstanding() {
  const p = st.parsed, out = [];
  if (p) {
    for (const [i, s] of p.suggestions.entries()) out.push(`<div class="hint">Did you mean <button class="pill" data-act="fix" data-i="${i}">${esc(s.to)}</button> instead of <span class="ign">${esc(s.from)}</span>?</div>`);
    const sugFrom = new Set(p.suggestions.flatMap(s => s.from.split(/\s+/).map(x => x.toLowerCase())));
    const rest = p.unrecognized.filter(u => !sugFrom.has(u.toLowerCase()));
    if (rest.length && (st.query.subject || !unknownPhrase())) out.push(`<div class="hint"><span>Ignored:</span> ${rest.map(u => `<span class="ign">${esc(u)}</span>`).join(' ')}</div>`);
  }
  $('#understanding').innerHTML = out.length ? `<div class="hints">${out.join('')}</div>` : '';
}
function renderSamples() {
  const el = $('#samples');
  if (st.text) { el.innerHTML = ''; return; }
  el.innerHTML = sampleList().map((s, i) => `<button class="sample" data-act="sample" data-i="${i}">${esc(s)}</button>`).join('');
}
const sampleList = () => [...(world.samples && world.samples.length ? world.samples : SAMPLE_QUERIES)].sort((a, b) => a.length - b.length);

const ACTION_WORD = { buy: 'buying', sell: 'selling', value: 'appraising' };
const hasEdits = q => !!(q.overrides && ((q.overrides.f && Object.keys(q.overrides.f).length) || q.overrides.base));
function factsList(e) {
  const facts = [];
  if (e.sense) facts.push(esc(e.sense));
  if (e.assumptions.length) facts.push(`Assumed: ${esc(e.assumptions.map(a => a.text).join(', '))}.`);
  for (const n of [...e.notes, ...(st.parsed ? st.parsed.notes : [])]) facts.push(esc(n));
  return facts;
}
function renderResult() {
  const el = $('#result'), q = st.query, e = st.est;
  if (!st.text) { el.innerHTML = `<div class="empty">Describe what you want priced. Quantity, length, buying or selling, place, speed and quality all sharpen the estimate.</div>`; return; }
  if (!q.subject) {
    const g = guessCard();
    el.innerHTML = g || `<div class="empty">No item found. ${st.parsed && st.parsed.suggestions.length ? 'Check the suggestion above, or name' : 'Name'} an item, service or trip, or switch to <b>Tap it</b> to browse.</div>`; return;
  }
  if (!e.ok && e.error === 'conflict') {
    el.innerHTML = e.conflicts.map(c => `<div class="conflict"><p><b>${esc(GROUPS[c.group].ask)}:</b> pick one.</p><div class="row">${c.ids.map((id, i) => `<button class="pill" data-act="resolve" data-id="${esc(id)}">${esc(c.labels[i])}</button>`).join('')}</div></div>`).join('');
    return;
  }
  const ent = e.entry;
  const qtyTxt = q.qty && !timeUnit(ent) ? (q.qty.lo === q.qty.hi ? q.qty.lo : q.qty.lo + ' to ' + q.qty.hi) + (q.qty.unit === 'lb' ? ' lb of ' : ' × ') : '';
  const spanTxt = q.span && timeUnit(ent) ? ', ' + (q.span.lo === q.span.hi ? q.span.lo : q.span.lo + ' to ' + q.span.hi) + ' ' + q.span.unit + (q.span.hi === 1 ? '' : 's') : '';
  const what = qtyTxt + ent.name + (q.rarity && ent.curve ? ', ' + q.rarity : '') + spanTxt;
  const meta = [range(e.lo, e.hi), e.each ? money(e.each) + ' ' + (e.eachLabel || 'each') : '', ACTION_WORD[q.action] + (q.assumed.includes('action') ? ' (assumed)' : ''), hasEdits(q) ? 'edited' : ''].filter(Boolean);
  const nOpts = st.an ? st.an.dimensions.length : 0;
  const nFacts = factsList(e).length;
  el.innerHTML = `<article class="res">
    <div class="what">${esc(what)}</div>
    <button class="pricebtn" data-act="copy" aria-label="Copy price"><span class="big">${esc(money(e.typical))}</span></button>
    <div class="meta">${meta.map(esc).join(' <i>·</i> ')}</div>
    <div class="acts">
      <button class="tgl" data-act="sheet" data-tab="break">Details${nFacts ? ` <b class="dot">${nFacts}</b>` : ''}</button>
      ${nOpts ? `<button class="tgl" data-act="sheet" data-tab="opts">Not specified <b class="dot">${nOpts}</b></button>` : ''}
      <button class="tgl${world.dials.round ? ' on' : ''}" data-act="round" aria-pressed="${!!world.dials.round}" title="Round to whole coins">Round</button>
    </div>
  </article>`;
}

// ---------- bottom sheet: breakdown, unspecified options, what was understood ----------
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
    const canKeep = !ent.curve && !ent.perMile;
    h += `<label class="lab">Price ${esc(f.label.replace(/^.*\(/, '(').replace(/^\((.*)\)$/, '$1'))}<input class="field" data-ed="base" inputmode="decimal" value="${esc(formatFull(f.mid, cur()))}"></label>`;
    if (f.edited) h += `<div class="row"><button class="btn" data-act="ed-reset" data-key="${esc(key)}">Reset</button>${canKeep ? `<button class="btn primary" data-act="ed-keep" data-key="${esc(key)}">Keep for this world</button>` : ''}</div>`;
    h += `<p class="mini">${f.edited ? (canKeep ? 'Applies to this question until you keep it.' : 'Applies to this question. This item is priced by rarity or distance, so it cannot be kept as one price.') : 'Type a new price to see the estimate change.'}</p>`;
  } else if (f.key) {
    h += `<div class="grid2"><label class="lab">Low ×<input class="field" data-ed="lo" type="number" inputmode="decimal" step="0.05" min="0.05" max="100" value="${esc(fx(f.lo))}"></label><label class="lab">High ×<input class="field" data-ed="hi" type="number" inputmode="decimal" step="0.05" min="0.05" max="100" value="${esc(fx(f.hi))}"></label></div>`;
    if (f.edited) h += `<div class="row"><button class="btn" data-act="ed-reset" data-key="${esc(key)}">Reset</button>${!f.saved ? `<button class="btn primary" data-act="ed-keep" data-key="${esc(key)}">Keep for this world</button>` : ''}</div>`;
    h += `<p class="mini">${f.saved ? 'Saved for this world. Manage it under World, Adjustments.' : f.edited ? 'Applies to this question until you keep it.' : 'Change the range to see the estimate change.'}</p>`;
  }
  return h + `</div>`;
}
function seenHtml(e) {
  const facts = factsList(e);
  return `<div class="chips">${chipsHtml()}</div>` + (facts.length ? `<div class="facts">${facts.map(f => `<div>${f}</div>`).join('')}</div>` : '') +
    `<div class="row" style="margin-top:12px"><button class="btn" data-act="mode" data-mode="tap">Adjust with buttons</button></div>`;
}
function renderSheet() {
  const sh = $('#sheet'), s = st.sheet, e = st.est;
  const ok = e && e.ok && st.query.subject;
  if (!s.open || !ok) { sh.hidden = true; return; }
  const nOpts = st.an ? st.an.dimensions.length : 0;
  if (s.tab === 'opts' && !nOpts) s.tab = 'break';
  const tabs = [['break', 'Breakdown'], ['opts', 'Not specified'], ['seen', 'Understood']].filter(([id]) => id !== 'opts' || nOpts);
  $('#sheetTabs').innerHTML = tabs.map(([id, l]) => `<button role="tab" data-act="sheet-tab" data-tab="${id}" aria-selected="${s.tab === id}">${esc(l)}</button>`).join('');
  const body = $('#sheetBody'), top = body.scrollTop;
  body.innerHTML = s.tab === 'break' ? breakdownHtml(e) : s.tab === 'opts' ? `<div class="optsbody">${unstatedHtml()}</div>` : seenHtml(e);
  sh.hidden = false;
  body.scrollTop = top;
}

// ---------- hints, chips ----------
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
  let h = `<section class="guess"><div class="gh"><b>${esc(phrase)}</b> is not in the price list. Pick the closest match.</div>
    <div class="cscroll">${all.map((c, i) => `<button class="cchip${g.sel === i ? ' sel' : ''}" data-act="g-pick" data-i="${i}"><span class="cl">${esc(c.label)}</span><span class="cp">${esc(money(c.bu))}${c.unit && c.unit !== 'each' ? ' / ' + esc(c.unit) : ''}</span></button>`).join('')}</div>
    <input class="field gsearch" id="gSearch" type="search" placeholder="Search all items" value="${esc(g.q)}" aria-label="Search all items">`;
  if (g.sel != null && all[g.sel]) {
    const c = all[g.sel], pv = previewWith(ctx, name, c, g.bu, { ...st.query, subject: 'tmp.guess' });
    const one = pv.one.ok ? pv.one.typical : g.bu;
    h += `<div class="gwhy">${esc(c.why || '')}</div>
      <div class="stepper"><button class="step-btn" data-act="g-lower" aria-label="Lower the price">−</button><div class="gval"><span class="gp">${esc(money(one))}</span><span class="mini">${c.unit && c.unit !== 'each' ? 'per ' + esc(c.unit) : 'each'}</span></div><button class="step-btn" data-act="g-raise" aria-label="Raise the price">+</button></div>`;
    if (qtxt && pv.full.ok) h += `<div class="gtotal">For ${esc(String(qtxt))}: about <b>${esc(money(pv.full.typical))}</b> (${esc(range(pv.full.lo, pv.full.hi))})</div>`;
    h += g.exact ? `<input class="field" id="gPrice" placeholder="Type a price, like 25 gp" aria-label="Type a price" inputmode="decimal">` : `<button class="linkbtn" data-act="g-exact">Type an exact price</button>`;
    h += `<div class="row gact"><button class="btn primary" data-act="g-set">Save and price it</button>${c.entry && !c.tier ? `<button class="btn" data-act="g-alias">Same as this</button>` : ''}</div>`;
  }
  return h + `</section>`;
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

// ---------- unspecified factors ----------
function unstatedHtml() {
  const an = st.an;
  if (!an || !an.dimensions.length) return '';
  const dims = an.dimensions;
  const leadDims = dims.filter(d => d.id !== 'span');
  const top = [...(leadDims.length ? leadDims : dims)].sort((x, y) => y.ratio - x.ratio)[0];
  const lo = top.options[0], hi = top.options[top.options.length - 1];
  return `<p class="lead">Priced as an average case. <b>${esc(top.ask)}</b> moves it most: ${esc(lo.label)} about ${esc(money(lo.typical))}, ${esc(hi.label)} about ${esc(money(hi.typical))}.</p>` + dims.map((d, di) => `
    <div class="dim"><div class="dq"><span>${esc(d.ask)}</span></div>
    <div class="opts">${d.options.map((o, oi) => {
      const pct = Math.round(o.delta * 100);
      const dtxt = Math.abs(pct) < 1 ? 'same' : (pct > 0 ? '+' : '') + pct + '%';
      return `<button class="opt${o.sel ? ' sel' : ''}" data-act="opt" data-d="${di}" data-o="${oi}"><span class="ol">${esc(o.label)}${o.sel ? ' · assumed' : ''}</span><span class="op">${esc(money(o.typical))}</span><span class="od ${pct > 0 ? 'up' : pct < 0 ? 'down' : ''}">${dtxt}</span></button>`;
    }).join('')}</div></div>`).join('');
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
  S.history = [...S.history.filter(h => h.pin), ...S.history.filter(h => !h.pin).slice(0, 25)].sort((x, y) => y.ts - x.ts);
  persist(); renderHistory();
}
function scheduleHistory() { clearTimeout(st.histTimer); st.histTimer = setTimeout(recordHistory, 1800); }
function renderHistory() {
  const h = S.history.filter(x => x.world === world.id);
  const el = $('#history');
  if (!h.length) { el.innerHTML = ''; return; }
  const sorted = [...h.filter(x => x.pin), ...h.filter(x => !x.pin)];
  el.innerHTML = `<button class="linkbtn" data-act="tgl" data-k="hist" aria-expanded="${st.ui.hist}">Recent (${h.length})</button>` + (st.ui.hist ? sorted.map(x => {
    const i = S.history.indexOf(x);
    return `<div class="hrow"><button class="h" data-act="hist" data-i="${i}"><span>${esc(x.text)}</span><span class="hp">${esc(x.price)}</span></button><button class="star${x.pin ? ' on' : ''}" data-act="star" data-i="${i}" aria-label="${x.pin ? 'Unstar' : 'Star'}" aria-pressed="${!!x.pin}">${x.pin ? '★' : '☆'}</button></div>`;
  }).join('') : '');
}

// ---------- quick flow ----------
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

function renderFlow() {
  const el = $('#flow');
  el.hidden = st.mode !== 'tap';
  if (st.mode !== 'tap') return;
  const q = st.query, ent = q.subject ? ctx.byId.get(q.subject) : null;
  const open = id => (id in st.flowOpen ? st.flowOpen[id] : (id === 'item' && !ent));
  const step = (id, title, value, body) => `<details class="fstep" data-step="${id}"${open(id) ? ' open' : ''}><summary><span class="ft">${title}</span><span class="fv">${esc(value || '')}</span></summary><div class="fbody">${body}</div></details>`;
  const pill = (act, v, label, on) => `<button class="bigbtn${on ? ' sel' : ''}" data-act="${act}" data-v="${esc(v)}">${esc(label)}</button>`;
  const actName = q.assumed.includes('action') ? '' : { buy: 'Buy or hire', sell: 'Sell', value: 'Appraise' }[q.action];
  let h = step('action', 'Action', actName || 'Buy (assumed)', `<div class="row">${pill('f-action', 'buy', 'Buy or hire', q.action === 'buy' && !q.assumed.includes('action'))}${pill('f-action', 'sell', 'Sell', q.action === 'sell')}${pill('f-action', 'value', 'Appraise', q.action === 'value')}</div>`);
  const cats = [...FLOW_CATS.map(c => [c[0], c[1]]), ['mine', 'My items']].filter(([id]) => ctx.entries.some(e => catOf(e) === id));
  const sel = st.flow.cat || (ent ? catOf(ent) : null);
  let body = `<div class="row">${cats.map(([id, l]) => pill('f-cat', id, l, sel === id)).join('')}</div>`;
  if (sel) {
    const items = ctx.entries.filter(e => catOf(e) === sel).filter(e => !st.flow.search || (e.name + ' ' + (e.aliases || []).join(' ')).toLowerCase().includes(st.flow.search.toLowerCase()));
    const unitBU = e => e.perMile ? e.perMile * e.mpd : (e.bu ?? 0);
    items.sort((a, b) => (b.isCategory ? 1 : 0) - (a.isCategory ? 1 : 0) || unitBU(a) - unitBU(b) || a.name.localeCompare(b.name));
    body += `<div style="margin-top:8px"><input class="field" id="flowSearch" type="search" placeholder="Search this list" value="${esc(st.flow.search)}" style="width:100%;margin-bottom:6px"><div class="itemlist">${items.map(e => {
      const per = e.curve ? 'by rarity' : money(unitBU(e)) + (timeUnit(e) ? ' / ' + timeUnit(e).word : e.unit === 'lb' ? ' / lb' : '');
      return `<button class="${q.subject === e.id ? 'sel' : ''}" data-act="f-item" data-v="${esc(e.id)}"><span>${esc(e.name)}${e.isCategory ? ' <span class="mini">(any)</span>' : ''}</span><span class="ip">${esc(per)}</span></button>`;
    }).join('') || '<div class="mini" style="padding:10px">Nothing matches.</div>'}</div></div>`;
  }
  h += step('item', 'Item', ent ? ent.name : '', body);
  if (ent) {
    const tu = timeUnit(ent);
    const num = n => (n.lo === n.hi ? n.lo : n.lo + ' to ' + n.hi);
    if (tu) {
      const opts = { day: [[1, 'day', '1 ' + tu.word], [3, 'day', '3 ' + tu.word + 's'], [1, 'week', '1 week'], [2, 'week', '2 weeks'], [1, 'month', '1 month']], week: [[1, 'week', '1 week'], [2, 'week', '2 weeks'], [4, 'week', '4 weeks'], [3, 'month', '3 months']], month: [[1, 'month', '1 month'], [3, 'month', '3 months'], [6, 'month', '6 months'], [12, 'month', '12 months']], year: [[1, 'year', '1 year'], [2, 'year', '2 years'], [4, 'year', '4 years']] }[tu.unit];
      h += step('span', 'Length', q.span ? num(q.span) + ' ' + q.span.unit + (q.span.hi === 1 ? '' : 's') : '1 ' + tu.word, `<div class="row">${opts.map(([n, u, l]) => pill('f-span', n + '|' + u, l, q.span && q.span.lo === n && q.span.hi === n && (q.span.unit === u || (n === 1 && u === 'day' && q.span.unit === 'night')))).join('')}
        <input class="field" id="flowSpan" type="number" min="1" step="1" placeholder="${tu.word}s" style="width:90px" aria-label="Custom number of ${tu.word}s"> ${ent.mpd ? `<input class="field" id="flowMiles" type="number" min="1" step="1" placeholder="or miles" style="width:100px" aria-label="Distance in miles">` : ''}</div>`);
      h += step('qty', ent.kind === 'labor' ? 'Workers' : 'People', q.qty ? num(q.qty) : '1', `<div class="row">${[1, 2, 3, 5, 10].map(n => pill('f-qty', n, String(n), (q.qty ? q.qty.lo === n && q.qty.hi === n : n === 1))).join('')}<input class="field" id="flowQty" type="number" min="1" step="1" placeholder="other" style="width:90px" aria-label="Custom count"></div>`);
    } else {
      h += step('qty', ent.unit === 'lb' ? 'Pounds' : 'Quantity', q.qty ? num(q.qty) : '1', `<div class="row">${[1, 2, 5, 10, 20, 50, 100].map(n => pill('f-qty', n, String(n), q.qty ? q.qty.lo === n && q.qty.hi === n : n === 1)).join('')}<input class="field" id="flowQty" type="number" min="1" step="1" placeholder="other" style="width:90px" aria-label="Custom amount"></div>`);
    }
    if (ent.curve) h += step('rarity', 'Rarity', q.rarity || 'common (assumed)', `<div class="row">${RARITIES.map(r => pill('f-rarity', r, r, q.rarity === r)).join('')}</div>`);
    if (['travel', 'lodging', 'service', 'labor', 'spell'].includes(ent.kind) && !ent.noTier) h += step('tier', 'Class', q.tier || 'standard (assumed)', `<div class="row">${TIER_NAMES.map(t => pill('f-tier', t, t, q.tier === t)).join('')}</div>`);
    const side = q.action === 'sell' && (ent.kind === 'good' || ent.kind === 'property') ? 'sell' : 'buy';
    const groups = Object.keys(GROUPS).map(g => [g, ctx.modList.filter(m => m.group === g && applicable(m, ent, side))]).filter(([, l]) => l.length);
    const chosen = q.mods.map(id => ctx.mods.get(id)?.label).filter(Boolean).join(', ');
    h += step('circ', 'Circumstances', chosen || 'none', groups.map(([g, list]) => `<div class="grp"><div class="gl">${esc(GROUPS[g].label)}</div><div class="row">${list.map(m => pill('f-mod', m.id, m.label, q.mods.includes(m.id))).join('')}</div></div>`).join(''));
  }
  h += `<div class="row"><button class="btn" data-act="clear">Start over</button></div>`;
  const keep = document.activeElement && document.activeElement.id;
  el.innerHTML = h;
  if (keep === 'flowSearch') { const i = $('#flowSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
function flowEdit(fn) { const q = clone(st.query); fn(q); fromQuery(q); }

// ---------- world drawer ----------
function openDrawer(scrollTo) {
  st.dpage = scrollTo === 'about' ? 'About' : null;
  $('#drawer').hidden = false; renderDrawer();
  document.body.style.overflow = 'hidden';
}
function closeDrawer() { $('#drawer').hidden = true; document.body.style.overflow = ''; }
function vocabOptions(sel) {
  const groupsK = {};
  for (const e of ctx.entries) (groupsK[e.kind] ||= []).push(e);
  let h = `<option value="">Means...</option>`;
  for (const [k, list] of Object.entries(groupsK)) h += `<optgroup label="${esc(k)}">${list.map(e => `<option value="${esc(e.id)}"${sel === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>`;
  h += `<optgroup label="circumstance">${ctx.modList.filter(m => m.aliases.length).map(m => `<option value="mod:${m.id}"${sel === 'mod:' + m.id ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}</optgroup>`;
  return h;
}
function renderDrawer() {
  const panel = $('#drawerPanel'), top = panel.scrollTop;
  const doc = new DOMParser().parseFromString('<div>' + buildSettingsHtml() + '</div>', 'text/html');
  const secs = [...doc.querySelectorAll('details.sect')].map(d => ({ id: d.dataset.sec, sv: d.querySelector('.sv')?.textContent || '', title: d.querySelector('summary h3')?.textContent || d.dataset.sec, body: d.querySelector('.sbody').innerHTML }));
  const page = st.dpage && secs.find(x => x.id === st.dpage);
  if (page) {
    panel.innerHTML = `<div class="nav"><button class="back" data-act="dpage" data-p="">‹ World</button><h2>${esc(page.title)}</h2><button class="btn primary" data-act="close-world">Done</button></div><div class="sbody page">${page.body}</div>`;
  } else {
    st.dpage = null;
    panel.innerHTML = `<div class="nav"><h2>World</h2><button class="btn primary" data-act="close-world">Done</button></div><div class="group">${secs.map(x => `<button class="nrow" data-act="dpage" data-p="${esc(x.id)}"><span class="nl">${esc(x.title)}</span><span class="sv">${esc(x.sv)}</span><span class="chev">›</span></button>`).join('')}</div>`;
  }
  panel.scrollTop = page === undefined ? top : (st.dpageChanged ? 0 : top);
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
  const curPrev = [1, 12, 130, 1500, 25000, 800000].map(n => money(n)).join(', ');
  const json = JSON.stringify(w, null, 1);
  const html = `
  <div class="dp-head"><h2>World</h2><button class="btn primary" data-act="close-world">Done</button></div>

  <details class="sect" data-sec="Your worlds"${op('Your worlds')}><summary><h3>Your worlds</h3><span class="sv">${esc(w.name)}</span></summary><div class="sbody">
    ${S.worlds.map(x => `<button class="world-row${x.id === w.id ? ' sel' : ''}" data-act="w-select" data-id="${esc(x.id)}"><span><span class="wn">${esc(x.name)}</span><span class="wb">${esc(x.blurb || (x.economyTags || []).join(', ') || 'Custom world')}</span></span></button>`).join('')}
    <div class="row"><select id="newPreset" class="field" aria-label="Preset to copy"><option value="vcm">Vista City Mondays</option><option value="srd">Standard fantasy (SRD)</option><option value="modern">Modern day, real world</option></select><button class="btn" data-act="w-new">New world from preset</button><button class="btn" data-act="w-dup">Duplicate this one</button>${S.worlds.length > 1 ? `<button class="btn danger" data-act="w-del">Delete this one</button>` : ''}</div>
    <label class="lab">Name<input class="field" data-bind="name" value="${esc(w.name)}"></label>
  </div></div></details>

  <details class="sect" data-sec="Item list"${op('Item list')}><summary><h3>Item list</h3><span class="sv">${esc({ srd: 'Fantasy, 5e SRD', generic: 'Fantasy, generic', modern: 'Modern day' }[w.baseline])}</span></summary><div class="sbody">
    <p>Where prices start. Your own items and settings always override it.</p>
    <label class="tagrow"><input type="radio" name="baseline" data-bind="baseline" value="srd"${w.baseline === 'srd' ? ' checked' : ''}><span><b>Fantasy, 5e SRD items</b>Named items like longsword and chain mail, plus travel, hired help, spells, property and magic.</span></label>
    <label class="tagrow"><input type="radio" name="baseline" data-bind="baseline" value="generic"${w.baseline === 'generic' ? ' checked' : ''}><span><b>Fantasy, generic</b>Categories only, such as weapon, armor and potion. No SRD names.</span></label>
    <label class="tagrow"><input type="radio" name="baseline" data-bind="baseline" value="modern"${w.baseline === 'modern' ? ' checked' : ''}><span><b>Modern day, real world</b>Current US prices for rent, groceries, flights, doctors and cars. Pair it with US dollars under Money.</span></label>
  </div></div></details>

  <details class="sect" data-sec="Money"${op('Money')}><summary><h3>Money</h3><span class="sv">${esc(w.currency.symbol ? 'US dollars' : dens.map(d => d.id).join(' / '))}</span></summary><div class="sbody">
    <p>Prices are stored as one number, the <b>base unit</b> (1 is a copper piece by default). Set what each coin is worth in base units. A one-coin world has one row.</p>
    <div class="row"><button class="btn" data-act="w-cur" data-v="gsc">Gold, silver, copper</button><button class="btn" data-act="w-cur" data-v="one">One coin</button><button class="btn" data-act="w-cur" data-v="usd">US dollars</button></div>
    ${dens.map((d, i) => `<div class="denrow"><label class="lab">Short<input class="field" data-bind="den.${i}.id" value="${esc(d.id)}"></label><label class="lab">Name<input class="field" data-bind="den.${i}.name" value="${esc(d.name)}"></label><label class="lab">Worth (base units)<input class="field" type="number" min="0.01" step="any" data-bind="den.${i}.bu" value="${esc(d.bu)}"></label>${dens.length > 1 ? `<button class="xbtn" data-act="w-del-den" data-i="${i}" aria-label="Remove coin">×</button>` : '<span></span>'}</div>`).join('')}
    <div class="row"><button class="btn" data-act="w-add-den">Add a coin</button></div>
    <label class="lab">Amounts smaller than the smallest coin<select class="field" data-bind="belowSmallest"><option value="decimals"${w.currency.belowSmallest === 'decimals' ? ' selected' : ''}>Show decimals (0.4 coins)</option><option value="round"${w.currency.belowSmallest === 'round' ? ' selected' : ''}>Round up to one coin</option></select></label>
    <label class="lab">Your note on what one base unit is worth<input class="field" data-bind="note" value="${esc(w.currency.note || '')}" placeholder="for example: roughly a dollar"></label>
    <label class="lab">Daily pay for unskilled work (used for sense checks)<input class="field" data-bind="wage" value="${esc(formatFull(w.anchors.wage, w.currency))}"></label>
    <p id="curPrev">Shown as: ${esc(curPrev)} for 1, 12, 130, 1,500, 25,000 and 800,000 base units.</p>
  </div></div></details>

  <details class="sect" data-sec="Economy"${op('Economy')}><summary><h3>Economy</h3><span class="sv">${w.economyTags.length ? w.economyTags.length + ' on' : 'none'}</span></summary><div class="sbody">
    <p>Tags that raise or lower whole categories of price. Pick any that fit the world.</p>
    ${ECONOMY_TAGS.map(t => `<label class="tagrow"><input type="checkbox" data-bind="econ.${t.id}"${w.economyTags.includes(t.id) ? ' checked' : ''}><span><b>${esc(t.label)}</b>${esc(t.describe)}</span></label>`).join('')}
  </div></div></details>

  <details class="sect" data-sec="Dials"${op('Dials')}><summary><h3>Dials</h3><span class="sv">${w.dials.round ? 'rounded' : 'exact'}</span></summary><div class="sbody">
    <label class="tagrow"><input type="checkbox" data-bind="dial.round"${w.dials.round ? ' checked' : ''}><span><b>Round prices to whole coins</b>Shows 5 sp 9 cp as 6 sp, and $7.50 as $8. Small amounts keep their detail.</span></label>
    <div class="grid2">
      <label class="lab">Price level (1 is standard)<input class="field" type="number" min="0.1" max="10" step="0.05" data-bind="dial.priceLevel" value="${esc(w.dials.priceLevel)}"></label>
      <label class="lab">Range width (0 exact, 1 wide)<input class="field" type="number" min="0" max="1" step="0.1" data-bind="dial.volatility" value="${esc(w.dials.volatility)}"></label>
      <label class="lab">Share of price paid to sellers<input class="field" type="number" min="0.1" max="1" step="0.05" data-bind="dial.sellFraction" value="${esc(w.dials.sellFraction)}"></label>
      <label class="lab">Stacking circumstances<select class="field" data-bind="dial.stacking"><option value="dampened"${w.dials.stacking === 'dampened' ? ' selected' : ''}>Dampened (recommended)</option><option value="strict"${w.dials.stacking === 'strict' ? ' selected' : ''}>Strict multiplication</option></select></label>
      <label class="lab">When you just say "travel"<select class="field" data-bind="defaults.travel">${ctx.entries.filter(e => e.group === 'travel').map(e => `<option value="${esc(e.id)}"${w.defaults.travel === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
      ${ctx.entries.some(e => e.group === 'rent') ? `<label class="lab">When you just say "rent"<select class="field" data-bind="defaults.rent">${ctx.entries.filter(e => e.group === 'rent').map(e => `<option value="${esc(e.id)}"${w.defaults.rent === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>` : ''}
    </div>
  </div></div></details>

  <details class="sect" data-sec="Custom words"${op('Custom words')}><summary><h3>Custom words</h3><span class="sv">${w.vocabulary.length || 'none'}</span></summary><div class="sbody">
    <p>Teach it your world's words. "sparkjuice" can mean a healing potion, "the Spire" can mean the capital.</p>
    ${w.vocabulary.map((v, i) => `<div class="vrow"><input class="field" data-bind="voc.${i}.term" value="${esc(v.term)}" placeholder="word or phrase" aria-label="Word"><select class="field" data-bind="voc.${i}.means" aria-label="Means">${vocabOptions(v.means)}</select><button class="xbtn" data-act="w-del-voc" data-i="${i}" aria-label="Remove word">×</button></div>`).join('')}
    <div class="row"><button class="btn" data-act="w-add-voc">Add a word</button></div>
  </div></div></details>

  <details class="sect" data-sec="My items"${op('My items')}><summary><h3>My items</h3><span class="sv">${w.items.length || 'none'}</span></summary><div class="sbody">
    <p>Add items the list lacks, or reuse a name to replace its price. Prices accept coins, like "3 gp 5 sp".</p>
    ${w.items.map((it, i) => `<div class="irow"><label class="lab">Name<input class="field" data-bind="item.${i}.name" value="${esc(it.name)}"></label><label class="lab">Kind<select class="field" data-bind="item.${i}.kind">${['good', 'service', 'labor', 'lodging', 'travel', 'spell', 'property'].map(k => `<option${it.kind === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label><label class="lab">Price<input class="field" data-bind="item.${i}.price" value="${esc(formatFull(it.bu, w.currency))}"></label><label class="lab">Per<select class="field" data-bind="item.${i}.unit">${['each', 'day', 'lb'].map(k => `<option${it.unit === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label><button class="xbtn" data-act="w-del-item" data-i="${i}" aria-label="Remove item">×</button></div><label class="lab">Tags (space separated, like: weapon metal)<input class="field" data-bind="item.${i}.tags" value="${esc((it.tags || []).join(' '))}"></label>`).join('')}
    <div class="row"><button class="btn" data-act="w-add-item">Add an item</button></div>
  </div></div></details>

  <details class="sect" data-sec="Adjustments"${op('Adjustments')}><summary><h3>Adjustments</h3><span class="sv">${Object.keys(w.overrides).length || 'none'}</span></summary><div class="sbody">
    <p>Factor ranges you changed and kept. They apply to every estimate in this world.</p>
    ${Object.entries(w.overrides).map(([k, v]) => `<div class="vrow"><span>${esc(overrideLabel(k))}</span><span class="mini">× ${esc(fx(v[0]))} to ${esc(fx(v[1]))}</span><button class="xbtn" data-act="w-del-ov" data-key="${esc(k)}" aria-label="Remove adjustment">×</button></div>`).join('') || '<p class="mini">None yet. Tap a row under Breakdown, change it, and choose Keep for this world.</p>'}
  </div></div></details>

  <details class="sect" data-sec="Back up and share"${op('Back up and share')}><summary><h3>Back up and share</h3><span class="sv"></span></summary><div class="sbody">
    <p>Copy this world to keep it or share it. Paste one below to load it.</p>
    <textarea class="mono" id="exportBox" readonly aria-label="World data">${esc(json)}</textarea>
    <div class="row"><button class="btn" data-act="w-copy">Copy world</button><button class="btn" data-act="w-save-file">Save as file</button></div>
    <textarea class="mono" id="importBox" placeholder="Paste a world here" aria-label="Paste a world"></textarea>
    <div class="row"><button class="btn" data-act="w-import">Load pasted world</button><button class="btn danger" id="resetBtn" data-act="w-reset">Reset everything</button></div>
  </div></div></details>

  <details class="sect" id="about" data-sec="About"${op('About')}><summary><h3>About</h3><span class="sv"></span></summary><div class="sbody">
    <p>Estimates only. Every price is a range, with its reasons shown. Rules and word lists run in your browser, and nothing is sent anywhere.</p>
    <p>${esc(SRD_ATTRIBUTION)}</p>
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
    if (ent.curve || ent.perMile || !(st.query.overrides && st.query.overrides.base > 0)) return;
    const it = { id: newItemId(), name: ent.name, kind: ent.kind, unit: ent.unit, bu: st.query.overrides.base, tags: [...(ent.tags || [])], aliases: [...(ent.aliases || [])], spread: ent.spread ?? 0.1 };
    world.items = world.items.filter(x => x.name.toLowerCase() !== ent.name.toLowerCase());
    world.items.push(it);
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
  ctx = compileWorld(world); $('#worldName').textContent = world.name;
  if (st.query.subject && !ctx.byId.has(st.query.subject)) { st.query.subject = null; }
  persist();
  if (st.text) fromText(st.text, { noHistory: true }); else renderAll();
  if (opts.lite) {
    const t = opts.el, p = t && t.dataset.bind ? t.dataset.bind.split('.') : [];
    if (p[0] === 'dial') t.value = world.dials[p[1]];
    if (p[0] === 'den' && p[2] === 'bu') t.value = world.currency.denominations[+p[1]].bu;
    const prev = document.getElementById('curPrev');
    if (prev) prev.textContent = 'Shown as: ' + [1, 12, 130, 1500, 25000, 800000].map(n => money(n)).join(', ') + ' for 1, 12, 130, 1,500, 25,000 and 800,000 base units.';
  } else renderDrawer();
}
function uniqueWorldId(base) { let id = base, n = 2; while (S.worlds.some(w => w.id === id)) id = base + '-' + n++; return id; }

// ---------- events ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act, d = b.dataset;
  const q = st.query;
  switch (a) {
    case 'mode': st.sheet.open = false; renderSheet(); st.mode = d.mode; $('#tabType').setAttribute('aria-selected', st.mode === 'type'); $('#tabTap').setAttribute('aria-selected', st.mode === 'tap'); renderFlow(); if (st.mode === 'type') $('#q').focus(); break;
    case 'clear': $('#q').value = ''; st.flow = { cat: null, search: '' }; fromText('', { noHistory: true }); break;
    case 'sample': { const t = sampleList()[+d.i]; $('#q').value = t; fromText(t); break; }
    case 'fix': { const s = st.parsed.suggestions[+d.i]; const t = st.text.slice(0, s.start) + s.to + st.text.slice(s.end); $('#q').value = t; fromText(t); break; }
    case 'chip-x': flowEdit(x => {
      const k = d.key;
      if (k === 'action') { x.assumed = [...new Set([...x.assumed, 'action'])]; x.action = 'buy'; }
      else if (k === 'qty') x.qty = null; else if (k === 'span') x.span = null; else if (k === 'rarity') x.rarity = null; else if (k === 'tier') x.tier = null;
      else if (k === 'subject') { x.subject = null; x.family = null; x.overrides = undefined; x.assumed = x.assumed.filter(z => z !== 'mode'); }
      else if (k.startsWith('mod:')) x.mods = x.mods.filter(m => m !== k.slice(4));
    }); break;
    case 'opt': { const o = st.an.dimensions[+d.d].options[+d.o]; flowEdit(x => o.apply(x)); break; }
    case 'resolve': flowEdit(x => { const g = ctx.mods.get(d.id).group; x.mods = x.mods.filter(m => ctx.mods.get(m)?.group !== g || m === d.id); }); break;
    case 'rm-mod': flowEdit(x => { x.mods = x.mods.filter(m => m !== d.id); }); break;
    case 'rm-tier': flowEdit(x => { x.tier = null; }); break;
    case 'copy': copyText(summaryLine(st.est), 'Copied'); break;
    case 'hist': { const h = S.history[+d.i]; $('#q').value = h.text; fromText(h.text, { noHistory: true }); window.scrollTo({ top: 0, behavior: 'smooth' }); break; }
    case 'star': { const h = S.history[+d.i]; h.pin = !h.pin; persist(); renderHistory(); break; }
    case 'tgl': st.ui[d.k] = !st.ui[d.k]; renderHistory(); break;
    case 'sheet': st.sheet = { open: true, tab: d.tab }; st.editRow = null; renderSheet(); break;
    case 'sheet-tab': st.sheet.tab = d.tab; renderSheet(); break;
    case 'sheet-close': st.sheet.open = false; st.editRow = null; renderSheet(); break;
    case 'edit-row': st.editRow = st.editRow === d.key ? null : d.key; renderSheet(); break;
    case 'ed-reset': flowEdit(x => { if (x.overrides) { if (d.key === 'base') delete x.overrides.base; else if (x.overrides.f) delete x.overrides.f[d.key]; } }); if (world.overrides[d.key]) { delete world.overrides[d.key]; worldChanged({ lite: true }); } break;
    case 'ed-reset-all': flowEdit(x => { delete x.overrides; }); break;
    case 'ed-keep': keepEdit(d.key); break;
    case 'w-del-ov': delete world.overrides[d.key]; worldChanged(); break;
    case 'dpage': st.dpage = d.p || null; st.dpageChanged = true; renderDrawer(); break;
    case 'round': world.dials.round = !world.dials.round; persist(); renderAll(); break;
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
    // flow
    case 'f-action': flowEdit(x => { x.action = d.v; x.assumed = x.assumed.filter(z => z !== 'action'); }); break;
    case 'f-cat': st.flow.cat = d.v; st.flow.search = ''; renderFlow(); break;
    case 'f-item': st.flowOpen = { item: false }; flowEdit(x => { delete x.overrides; x.subject = d.v; x.family = null; x.assumed = x.assumed.filter(z => z !== 'mode'); x.rarity = null; x.span = null; x.qty = null; const en = ctx.byId.get(d.v); if (!['travel', 'lodging', 'service', 'labor', 'spell'].includes(en.kind)) x.tier = null; x.mods = x.mods.filter(m => { const mm = ctx.mods.get(m); return mm && applicable(mm, en); }); }); break;
    case 'f-qty': flowEdit(x => { const n = +d.v; x.qty = n === 1 ? null : { lo: n, hi: n, unit: ctx.byId.get(x.subject)?.unit === 'lb' ? 'lb' : undefined }; }); break;
    case 'f-span': flowEdit(x => { const [n, u] = d.v.split('|'); x.span = { lo: +n, hi: +n, unit: u }; }); break;
    case 'f-rarity': flowEdit(x => { x.rarity = x.rarity === d.v ? null : d.v; }); break;
    case 'f-tier': flowEdit(x => { x.tier = x.tier === d.v ? null : d.v; }); break;
    case 'f-mod': flowEdit(x => {
      const m = ctx.mods.get(d.v);
      if (x.mods.includes(d.v)) x.mods = x.mods.filter(z => z !== d.v);
      else { if (GROUPS[m.group].exclusive) x.mods = x.mods.filter(z => ctx.mods.get(z)?.group !== m.group); x.mods.push(d.v); }
    }); break;
    // drawer
    case 'open-world': openDrawer(d.scroll); break;
    case 'close-world': closeDrawer(); break;
    case 'w-select': useWorld(d.id); persist(); closeDrawerKeep(); break;
    case 'w-new': { const w = WORLD_PRESETS[$('#newPreset').value](); w.id = uniqueWorldId(w.id); w.name = w.name + ' (copy)'; S.worlds.push(w); useWorld(w.id); afterWorldSwitch(); break; }
    case 'w-dup': { const w = clone(world); w.id = uniqueWorldId(w.id); w.name += ' (copy)'; S.worlds.push(w); useWorld(w.id); afterWorldSwitch(); break; }
    case 'w-del':
      if (S.worlds.length > 1) {
        if (b.dataset.armed) { const gone = world.id; S.worlds = S.worlds.filter(w => w.id !== gone); S.history = S.history.filter(h => h.world !== gone); useWorld(S.worlds[0].id); persist(); afterWorldSwitch(); }
        else { b.dataset.armed = '1'; b.textContent = 'Click again to delete'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete this one'; } }, 3500); }
      } break;
    case 'w-cur':
      delete world.currency.symbol; delete world.currency.decimal;
      if (d.v === 'usd') { world.currency.denominations = [{ id: 'usd', name: 'dollar', plural: 'dollars', bu: 100 }, { id: 'c', name: 'cent', plural: 'cents', bu: 1 }]; world.currency.symbol = '$'; world.currency.decimal = 100; world.anchors.wage = 12000; }
      else world.currency.denominations = d.v === 'one'
        ? [{ id: 'coin', name: 'coin', plural: 'coins', bu: 100 }]
        : [{ id: 'gp', name: 'gold piece', plural: 'gold pieces', bu: 100 }, { id: 'sp', name: 'silver piece', plural: 'silver pieces', bu: 10 }, { id: 'cp', name: 'copper piece', plural: 'copper pieces', bu: 1 }];
      worldChanged(); break;
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
      if (b.dataset.armed) { try { localStorage.removeItem('foolsgold.v1'); } catch (e2) { /* ignore */ } S = { ...load(), history: [] }; S.worlds = [WORLD_PRESETS.vcm(), WORLD_PRESETS.srd(), WORLD_PRESETS.modern()]; S.activeId = 'vcm'; useWorld('vcm'); persist(); afterWorldSwitch(); toast('Reset'); }
      else { b.dataset.armed = '1'; b.textContent = 'Click again to erase all worlds'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Reset everything'; } }, 3500); }
      break;
    }
  }
});
function closeDrawerKeep() { renderDrawer(); if (st.text) fromText(st.text, { noHistory: true }); else renderAll(); }
function afterWorldSwitch() { renderDrawer(); st.query = emptyQuery(); if (st.text) fromText(st.text, { noHistory: true }); else renderAll(); }

$('#q').addEventListener('input', e => fromText(e.target.value));
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); recordHistory(); e.target.blur(); } });
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!$('#drawer').hidden) { if (st.dpage) { st.dpage = null; renderDrawer(); } else closeDrawer(); } else if (st.sheet.open) { st.sheet.open = false; renderSheet(); } });
$('#drawer').addEventListener('click', e => { if (e.target.id === 'drawer') closeDrawer(); });

// drawer and flow inputs
document.addEventListener('toggle', e => {
  const t = e.target;
  if (t.dataset && t.dataset.step) st.flowOpen[t.dataset.step] = t.open;
  if (t.dataset && t.dataset.sec) st.drawerOpen[t.dataset.sec] = t.open;
}, true);
document.addEventListener('input', e => {
  if (e.target.id === 'flowSearch') { st.flow.search = e.target.value; renderFlow(); }
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
  if (bind === 'name') w.name = t.value.trim() || 'My world';
  else if (bind === 'baseline') w.baseline = t.value;
  else if (p[0] === 'den') { const d = w.currency.denominations[+p[1]]; if (p[2] === 'bu') d.bu = Math.max(0.01, +t.value || 1); else { d[p[2]] = t.value.trim() || d[p[2]]; if (p[2] === 'name') d.plural = d.name.endsWith('s') ? d.name : d.name + 's'; } }
  else if (bind === 'belowSmallest') w.currency.belowSmallest = t.value;
  else if (bind === 'note') w.currency.note = t.value;
  else if (bind === 'wage') { const v = parseMoney(t.value, w.currency); if (v > 0) w.anchors.wage = v; }
  else if (p[0] === 'econ') { const set = new Set(w.economyTags); t.checked ? set.add(p[1]) : set.delete(p[1]); w.economyTags = [...set]; }
  else if (p[0] === 'dial') w.dials[p[1]] = t.type === 'checkbox' ? t.checked : t.tagName === 'SELECT' ? t.value : +t.value;
  else if (bind === 'defaults.travel') w.defaults.travel = t.value;
  else if (bind === 'defaults.rent') w.defaults.rent = t.value;
  else if (p[0] === 'voc') w.vocabulary[+p[1]][p[2]] = t.value.trim();
  else if (p[0] === 'item') {
    const it = w.items[+p[1]];
    if (p[2] === 'price') { const v = parseMoney(t.value, w.currency); if (v > 0) it.bu = v; }
    else if (p[2] === 'tags') it.tags = t.value.toLowerCase().split(/[\s,]+/).filter(Boolean);
    else it[p[2]] = t.value.trim();
  }
  worldChanged({ lite: true, el: t });
});

// ---------- boot ----------
useWorld(S.activeId);
const first = S.last ?? sampleList()[0];
$('#q').value = first;
fromText(first, { noHistory: true });
