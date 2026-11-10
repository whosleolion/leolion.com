// Fool's Gold UI. All logic lives in the engine/parser modules; this file wires the page.
import { compileWorld } from './world.js';
import { parse, queryToText, chipsFor, emptyQuery } from './parser.js';
import { estimate, findConflicts } from './engine.js';
import { analyze } from './unstated.js';
import { formatMoney, formatRange, formatFull, parseMoney } from './money.js';
import {
  ECONOMY_TAGS, MODIFIERS, GROUPS, RARITIES, TIER_NAMES, FAMILIES, SAMPLE_QUERIES, WORLD_PRESETS, SRD_ATTRIBUTION, slug,
} from './data.js';
import { applicable } from './engine.js';
import { load, save, normalizeWorld, newItemId } from './store.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const fx = n => String(+(+n).toFixed(2));

let S = load();
let world = null, ctx = null;
const st = { mode: 'type', text: '', parsed: null, query: emptyQuery(), est: null, an: null, flow: { cat: null, search: '' }, histTimer: null, dirty: false };

function useWorld(id) {
  world = S.worlds.find(w => w.id === id) || S.worlds[0];
  S.activeId = world.id;
  ctx = compileWorld(world);
  $('#worldName').textContent = world.name;
}
const cur = () => world.currency;
const money = bu => formatMoney(bu, cur());
let saveWarned = false;
const persist = () => { const ok = save(S); if (!ok && !saveWarned) { saveWarned = true; toast('This browser is not saving your worlds. Use Copy world under World to back them up.'); } return ok; };

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
  renderChips(); renderUnderstanding(); renderSamples(); renderResult(); renderUnstated(); renderHistory(); renderFlow();
}

// ---------- chips and hints ----------
function renderChips() {
  const chips = st.query.subject || st.query.mods.length || st.query.qty || st.query.span || st.query.rarity || st.query.tier ? chipsFor(st.query, ctx) : [];
  $('#chips').innerHTML = chips.map(c =>
    `<span class="chip r-${c.role}${c.assumed ? ' assumed' : ''}" title="${esc(c.assumed ? 'Assumed, you did not say' : c.role)}"><span class="role">${esc(c.role === 'mod' ? c.group : c.role)}</span>${esc(c.label)}${c.assumed ? '<span class="role">assumed</span>' : ''}<button class="x" data-act="chip-x" data-key="${esc(c.key)}" aria-label="Remove ${esc(c.label)}">×</button></span>`
  ).join('');
}
function renderUnderstanding() {
  const p = st.parsed, out = [];
  if (p) {
    for (const [i, s] of p.suggestions.entries()) out.push(`<div class="hint">Did you mean <button class="pill" data-act="fix" data-i="${i}">${esc(s.to)}</button> instead of <span class="ign">${esc(s.from)}</span>?</div>`);
    const sugFrom = new Set(p.suggestions.flatMap(s => s.from.split(/\s+/).map(x => x.toLowerCase())));
    const rest = p.unrecognized.filter(u => !sugFrom.has(u.toLowerCase()));
    if (rest.length) out.push(`<div class="hint">Ignored: ${rest.map(u => `<span class="ign">${esc(u)}</span>`).join(', ')}. I don't know ${rest.length > 1 ? 'those words' : 'that word'}. You can add ${rest.length > 1 ? 'them' : 'it'} under World, Custom words.</div>`);
    for (const n of p.notes) out.push(`<div class="hint">${esc(n)}</div>`);
  }
  $('#understanding').innerHTML = out.length ? `<div class="hints">${out.join('')}</div>` : '';
}
function renderSamples() {
  const el = $('#samples');
  if (st.text) { el.innerHTML = ''; return; }
  el.innerHTML = `<span class="lab">Try one</span>` + SAMPLE_QUERIES.map((s, i) => `<button class="sample" data-act="sample" data-i="${i}">${esc(s)}</button>`).join('');
}

// ---------- result ----------
const ACTION_WORD = { buy: 'Buying', sell: 'Selling', value: 'Appraising' };
function renderResult() {
  const el = $('#result'), q = st.query, e = st.est;
  if (!st.text) { el.innerHTML = `<div class="empty"><b>Ask for a price.</b> Describe what you want in plain words, or switch to <b>Tap it</b> and build the question with buttons. You get a price, a range and the reason for every factor.</div>`; return; }
  if (!q.subject) {
    el.innerHTML = `<div class="empty"><b>I couldn't find the thing to price.</b> ${st.parsed && st.parsed.suggestions.length ? 'Check the suggestion above, or ' : ''}try naming an item, service or trip (a sword, an inn, a train ride) or use <b>Tap it</b> to browse.</div>`; return;
  }
  if (!e.ok && e.error === 'conflict') {
    el.innerHTML = e.conflicts.map(c => `<div class="conflict"><p><b>${esc(c.labels.join(' and '))}</b> can't both be true. ${esc(GROUPS[c.group].ask)}</p><div class="row">${c.ids.map((id, i) => `<button class="pill" data-act="resolve" data-id="${esc(id)}">${esc(c.labels[i])}</button>`).join('')}</div></div>`).join('');
    return;
  }
  const ent = e.entry, p = money(e.typical);
  const pos = e.hi > e.lo ? Math.min(100, Math.max(0, (Math.log(e.typical) - Math.log(e.lo)) / (Math.log(e.hi) - Math.log(e.lo)) * 100)) : 50;
  const qtyTxt = q.qty && ent.unit !== 'day' ? (q.qty.lo === q.qty.hi ? q.qty.lo : q.qty.lo + ' to ' + q.qty.hi) + (q.qty.unit === 'lb' ? ' lb of ' : ' × ') : '';
  const spanTxt = q.span && ent.unit === 'day' ? ', ' + (q.span.lo === q.span.hi ? q.span.lo : q.span.lo + ' to ' + q.span.hi) + ' ' + q.span.unit + (q.span.hi === 1 ? '' : 's') : '';
  const what = qtyTxt + ent.name + (q.rarity && ent.curve ? ', ' + q.rarity : '') + spanTxt;
  const facts = [];
  if (e.each) facts.push(`About <b>${esc(money(e.each))}</b> ${esc(e.eachLabel || 'each')}.`);
  if (e.sense) facts.push(esc(e.sense));
  for (const a of e.assumptions) facts.push(`<span>Assumed: ${esc(a.text)}</span>`);
  for (const n of e.notes) facts.push(esc(n));
  const rows = e.factors.map(f => {
    let eff;
    if (f.kind === 'base') eff = esc(formatRange(f.lo, f.hi, cur()));
    else if (f.kind === 'qty') eff = esc(f.label.replace('×', '×'));
    else {
      const a = f.effLo ?? f.lo, b = f.effHi ?? f.hi;
      eff = '× ' + (Math.abs(a - b) < 0.005 ? fx(a) : fx(a) + ' to ' + fx(b));
      const dir = (a * b) ** 0.5;
      eff = `<span class="${dir > 1.005 ? 'up' : dir < 0.995 ? 'down' : ''}">${eff}</span>`;
      if (f.weight !== undefined && f.weight < 0.99) eff += `<br><span class="mini">counts ${Math.round(f.weight * 100)}%</span>`;
    }
    const label = f.kind === 'qty' || f.kind === 'base' ? f.label.replace(/^× /, '') : f.label;
    const rm = f.kind === 'mod' ? `<button class="rm" data-act="rm-mod" data-id="${esc(f.id)}" aria-label="Remove ${esc(f.label)}">remove</button>` : f.kind === 'tier' ? `<button class="rm" data-act="rm-tier" aria-label="Remove class">remove</button>` : '';
    const lead = f.kind === 'base' ? '' : f.kind === 'qty' ? '' : '';
    return `<tr><td><span class="lbl">${esc(label)}</span><span class="why-t">${esc(f.why || '')}</span></td><td class="num">${f.kind === 'qty' ? esc(f.label) : eff}</td><td class="num">${esc(money(Math.sqrt(f.runLo * f.runHi)))}</td><td>${rm}</td></tr>`;
  }).join('');
  el.innerHTML = `<article class="card">
    <div class="card-head"><div class="what">${esc(what)}</div><div class="sub">${ACTION_WORD[q.action]}${q.assumed.includes('action') ? ' (assumed)' : ''}</div></div>
    <div class="price"><span class="big">${esc(p)}</span><span class="about">estimate</span></div>
    <div class="rangebar" role="img" aria-label="Range ${esc(formatRange(e.lo, e.hi, cur()))}"><div class="track"><div class="band"></div><div class="mark" style="left:${pos.toFixed(1)}%"></div></div><div class="ends"><span>${esc(money(e.lo))}</span><span>${esc(money(e.hi))}</span></div></div>
    <div class="facts">${facts.map(f => `<div>${f}</div>`).join('')}</div>
    <details class="why"><summary>How I got this</summary><div class="tablewrap"><table class="fx"><thead><tr><th>Step</th><th>Effect</th><th>Running</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></details>
    <div class="card-actions"><button class="btn primary" data-act="copy">Copy for notes</button><button class="btn" data-act="mode" data-mode="tap">Adjust with buttons</button></div>
  </article>`;
}
function summaryLine(e) {
  const ent = e.entry, q = st.query;
  const bits = [ent.name.toLowerCase()];
  if (q.span && ent.unit === 'day') bits.push((q.span.lo === q.span.hi ? q.span.lo : q.span.lo + ' to ' + q.span.hi) + ' ' + q.span.unit + (q.span.hi === 1 ? '' : 's'));
  if (q.qty) bits.unshift(String(q.qty.lo === q.qty.hi ? q.qty.lo : q.qty.lo + ' to ' + q.qty.hi));
  if (q.tier) bits.push(q.tier);
  if (q.rarity) bits.push(q.rarity);
  for (const id of q.mods) bits.push(ctx.mods.get(id)?.label || id);
  const unk = [...e.assumptions.map(a => a.text)];
  return `${ACTION_WORD[q.action]}: ${bits.join(', ')}: about ${money(e.typical)} (${formatRange(e.lo, e.hi, cur())}).` + (unk.length ? ' ' + unk.join(' ') : '');
}

// ---------- unstated ----------
function renderUnstated() {
  const el = $('#unstated'), an = st.an;
  if (!an || !an.dimensions.length) { el.innerHTML = ''; return; }
  const dims = an.dimensions;
  const leadDims = dims.filter(d => d.id !== 'span');
  const top = [...(leadDims.length ? leadDims : dims)].sort((a, b) => b.ratio - a.ratio)[0];
  const lo = top.options[0], hi = top.options[top.options.length - 1];
  const lead = `You didn't say. The biggest swing is <b>${esc(top.ask.replace(/\?$/, '').toLowerCase())}</b>: ${esc(lo.label)} about ${esc(money(lo.typical))}, ${esc(hi.label)} about ${esc(money(hi.typical))}. Tap one to apply it.`;
  el.innerHTML = `<section class="un"><h2>What you didn't say</h2><p class="lead">${lead}</p>` + dims.map((d, di) => `
    <div class="dim"><div class="dq"><span>${esc(d.ask)}</span><small>${esc(money(d.options[0].typical))} to ${esc(money(d.options[d.options.length - 1].typical))}</small></div>
    <div class="opts">${d.options.map((o, oi) => {
      const pct = Math.round(o.delta * 100);
      const dtxt = Math.abs(pct) < 1 ? 'same' : (pct > 0 ? '+' : '') + pct + '%';
      return `<button class="opt${o.sel ? ' sel' : ''}" data-act="opt" data-d="${di}" data-o="${oi}"><span class="ol">${esc(o.label)}${o.sel ? ' (assumed)' : ''}</span><span class="op">${esc(money(o.typical))}</span><span class="od ${pct > 0 ? 'up' : pct < 0 ? 'down' : ''}">${dtxt}</span></button>`;
    }).join('')}</div></div>`).join('') + `</section>`;
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
  el.innerHTML = `<h3>Recent and starred</h3>` + sorted.map(x => {
    const i = S.history.indexOf(x);
    return `<div class="hrow"><button class="h" data-act="hist" data-i="${i}"><span>${esc(x.text)}</span><span class="hp">${esc(x.price)}</span></button><button class="star${x.pin ? ' on' : ''}" data-act="star" data-i="${i}" aria-label="${x.pin ? 'Unstar' : 'Star'}" aria-pressed="${!!x.pin}">${x.pin ? '★' : '☆'}</button></div>`;
  }).join('');
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
  ['lodging', 'Lodging and meals', e => e.kind === 'lodging' || has(e, 'meal')],
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
  const act = (id, label) => `<button class="bigbtn${q.action === id && !q.assumed.includes('action') ? ' sel' : ''}" data-act="f-action" data-v="${id}">${label}</button>`;
  let h = `<div class="step"><h4>What are you doing?</h4><div class="row">${act('buy', 'Buy or hire')}${act('sell', 'Sell')}${act('value', 'Appraise')}</div></div>`;
  const cats = [...FLOW_CATS.map(c => [c[0], c[1]]), ['mine', 'My items']].filter(([id]) => ctx.entries.some(e => catOf(e) === id));
  const sel = st.flow.cat || (ent ? catOf(ent) : null);
  h += `<div class="step"><h4>What?</h4><div class="row">${cats.map(([id, l]) => `<button class="bigbtn${sel === id ? ' sel' : ''}" data-act="f-cat" data-v="${id}">${esc(l)}</button>`).join('')}</div>`;
  if (sel) {
    const items = ctx.entries.filter(e => catOf(e) === sel).filter(e => !st.flow.search || (e.name + ' ' + (e.aliases || []).join(' ')).toLowerCase().includes(st.flow.search.toLowerCase()));
    const unitBU = e => e.perMile ? e.perMile * e.mpd : (e.bu ?? 0);
    items.sort((a, b) => (b.isCategory ? 1 : 0) - (a.isCategory ? 1 : 0) || unitBU(a) - unitBU(b) || a.name.localeCompare(b.name));
    h += `<div style="margin-top:8px"><input class="field" id="flowSearch" type="search" placeholder="Search this list" value="${esc(st.flow.search)}" style="width:100%;margin-bottom:6px"><div class="itemlist">${items.map(e => {
      const per = e.curve ? 'by rarity' : money(e.perMile ? e.perMile * e.mpd : e.bu) + (e.unit === 'day' ? ' / day' : e.unit === 'lb' ? ' / lb' : '');
      return `<button class="${q.subject === e.id ? 'sel' : ''}" data-act="f-item" data-v="${esc(e.id)}"><span>${esc(e.name)}${e.isCategory ? ' <span class="mini">(any)</span>' : ''}</span><span class="ip">${esc(per)}</span></button>`;
    }).join('') || '<div class="mini" style="padding:10px">Nothing matches.</div>'}</div></div>`;
  }
  h += `</div>`;
  if (ent) {
    const pill = (act, v, label, on) => `<button class="bigbtn${on ? ' sel' : ''}" data-act="${act}" data-v="${esc(v)}">${esc(label)}</button>`;
    if (ent.unit === 'day') {
      const word = ent.kind === 'lodging' ? 'night' : 'day';
      const opts = [[1, 'day', '1 ' + word], [3, 'day', '3 ' + word + 's'], [1, 'week', '1 week'], [2, 'week', '2 weeks'], [1, 'month', '1 month']];
      h += `<div class="step"><h4>How long?</h4><div class="row">${opts.map(([n, u, l]) => pill('f-span', n + '|' + u, l, q.span && q.span.lo === n && q.span.hi === n && (q.span.unit === u || (n === 1 && u === 'day' && q.span.unit === 'night')))).join('')}
        <input class="field" id="flowSpan" type="number" min="1" step="1" placeholder="days" style="width:90px" aria-label="Custom number of days"> ${ent.mpd ? `<input class="field" id="flowMiles" type="number" min="1" step="1" placeholder="or miles" style="width:100px" aria-label="Distance in miles">` : ''}</div></div>`;
      h += `<div class="step"><h4>${ent.kind === 'labor' ? 'How many workers?' : 'How many people?'}</h4><div class="row">${[1, 2, 3, 5, 10].map(n => pill('f-qty', n, String(n), (q.qty ? q.qty.lo === n && q.qty.hi === n : n === 1))).join('')}<input class="field" id="flowQty" type="number" min="1" step="1" placeholder="other" style="width:90px" aria-label="Custom count"></div></div>`;
    } else {
      h += `<div class="step"><h4>${ent.unit === 'lb' ? 'How many pounds?' : 'How many?'}</h4><div class="row">${[1, 2, 5, 10, 20, 50, 100].map(n => pill('f-qty', n, String(n), q.qty ? q.qty.lo === n && q.qty.hi === n : n === 1)).join('')}<input class="field" id="flowQty" type="number" min="1" step="1" placeholder="other" style="width:90px" aria-label="Custom amount"></div></div>`;
    }
    if (ent.curve) h += `<div class="step"><h4>Rarity</h4><div class="row">${RARITIES.map(r => pill('f-rarity', r, r, q.rarity === r)).join('')}</div></div>`;
    if (['travel', 'lodging', 'service', 'labor', 'spell'].includes(ent.kind)) h += `<div class="step"><h4>Class</h4><div class="row">${TIER_NAMES.map(t => pill('f-tier', t, t, q.tier === t)).join('')}</div></div>`;
    const groups = Object.keys(GROUPS).map(g => [g, MODIFIERS.filter(m => m.group === g && applicable(m, ent, q.action === 'sell' && (ent.kind === 'good' || ent.kind === 'property') ? 'sell' : 'buy'))]).filter(([, l]) => l.length);
    h += `<div class="step"><h4>Circumstances (optional)</h4>` + groups.map(([g, list]) => `<div class="grp"><div class="gl">${esc(GROUPS[g].label)}</div><div class="row">${list.map(m => `<button class="bigbtn${q.mods.includes(m.id) ? ' sel' : ''}" data-act="f-mod" data-v="${esc(m.id)}">${esc(m.label)}</button>`).join('')}</div></div>`).join('') + `</div>`;
  }
  h += `<div class="row"><button class="btn" data-act="clear">Start over</button></div>`;
  const keep = document.activeElement && document.activeElement.id;
  el.innerHTML = h;
  if (keep === 'flowSearch') { const i = $('#flowSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
function flowEdit(fn) { const q = clone(st.query); fn(q); fromQuery(q); }

// ---------- world drawer ----------
function openDrawer(scrollTo) {
  $('#drawer').hidden = false; renderDrawer();
  if (scrollTo) { const t = document.getElementById(scrollTo); if (t) t.scrollIntoView(); }
  document.body.style.overflow = 'hidden';
}
function closeDrawer() { $('#drawer').hidden = true; document.body.style.overflow = ''; }
function vocabOptions(sel) {
  const groupsK = {};
  for (const e of ctx.entries) (groupsK[e.kind] ||= []).push(e);
  let h = `<option value="">Means...</option>`;
  for (const [k, list] of Object.entries(groupsK)) h += `<optgroup label="${esc(k)}">${list.map(e => `<option value="${esc(e.id)}"${sel === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>`;
  h += `<optgroup label="circumstance">${MODIFIERS.filter(m => m.aliases.length).map(m => `<option value="mod:${m.id}"${sel === 'mod:' + m.id ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}</optgroup>`;
  return h;
}
function renderDrawer() {
  const w = world, panel = $('#drawerPanel'), top = panel.scrollTop;
  const dens = w.currency.denominations;
  const curPrev = [1, 12, 130, 1500, 25000, 800000].map(n => money(n)).join(', ');
  const json = JSON.stringify(w, null, 1);
  panel.innerHTML = `
  <div class="dp-head"><h2>World</h2><button class="btn primary" data-act="close-world">Done</button></div>

  <div class="sect"><h3>Your worlds</h3>
    ${S.worlds.map(x => `<button class="world-row${x.id === w.id ? ' sel' : ''}" data-act="w-select" data-id="${esc(x.id)}"><span><span class="wn">${esc(x.name)}</span><span class="wb">${esc(x.blurb || (x.economyTags || []).join(', ') || 'Custom world')}</span></span></button>`).join('')}
    <div class="row"><select id="newPreset" class="field" aria-label="Preset to copy"><option value="vcm">Vista City Mondays</option><option value="srd">Standard fantasy (SRD)</option><option value="titanium">Titanium Frontier</option></select><button class="btn" data-act="w-new">New world from preset</button><button class="btn" data-act="w-dup">Duplicate this one</button>${S.worlds.length > 1 ? `<button class="btn danger" data-act="w-del">Delete this one</button>` : ''}</div>
    <label class="lab">Name<input class="field" data-bind="name" value="${esc(w.name)}"></label>
  </div>

  <div class="sect"><h3>Item list</h3>
    <p>Fool's Gold ships the 5e SRD equipment prices as a starting point. Turn that off if your world has nothing to do with it. You still keep the generic categories, travel, hired help, spellcasting, property and magic pricing.</p>
    <label class="tagrow"><input type="radio" name="baseline" data-bind="baseline" value="srd"${w.baseline === 'srd' ? ' checked' : ''}><span><b>Use the 5e SRD item list</b>Named items like longsword and chain mail.</span></label>
    <label class="tagrow"><input type="radio" name="baseline" data-bind="baseline" value="generic"${w.baseline === 'generic' ? ' checked' : ''}><span><b>Generic only</b>No SRD names. Categories like weapon, armor, potion, plus your own items.</span></label>
  </div>

  <div class="sect"><h3>Money</h3>
    <p>Everything is stored in one universal number, the <b>base unit</b>. By default 1 base unit is a copper piece. Each coin below is worth some number of base units. A one-coin world just has one row.</p>
    <div class="row"><button class="btn" data-act="w-cur" data-v="gsc">Gold, silver, copper</button><button class="btn" data-act="w-cur" data-v="one">One coin</button></div>
    ${dens.map((d, i) => `<div class="denrow"><label class="lab">Short<input class="field" data-bind="den.${i}.id" value="${esc(d.id)}"></label><label class="lab">Name<input class="field" data-bind="den.${i}.name" value="${esc(d.name)}"></label><label class="lab">Worth (base units)<input class="field" type="number" min="0.01" step="any" data-bind="den.${i}.bu" value="${esc(d.bu)}"></label>${dens.length > 1 ? `<button class="xbtn" data-act="w-del-den" data-i="${i}" aria-label="Remove coin">×</button>` : '<span></span>'}</div>`).join('')}
    <div class="row"><button class="btn" data-act="w-add-den">Add a coin</button></div>
    <label class="lab">Amounts smaller than the smallest coin<select class="field" data-bind="belowSmallest"><option value="decimals"${w.currency.belowSmallest === 'decimals' ? ' selected' : ''}>Show decimals (0.4 coins)</option><option value="round"${w.currency.belowSmallest === 'round' ? ' selected' : ''}>Round up to one coin</option></select></label>
    <label class="lab">Your own note on what a base unit feels like<input class="field" data-bind="note" value="${esc(w.currency.note || '')}" placeholder="for example: 1 base unit is roughly a dollar"></label>
    <label class="lab">What does a day of unskilled labor pay? (used for sense checks)<input class="field" data-bind="wage" value="${esc(formatFull(w.anchors.wage, w.currency))}"></label>
    <p id="curPrev">Preview: 1, 12, 130, 1,500, 25,000, 800,000 base units show as ${esc(curPrev)}.</p>
  </div>

  <div class="sect"><h3>Economy</h3>
    <p>Tags shift whole categories of price. Pick the ones that describe the world as a whole.</p>
    ${ECONOMY_TAGS.map(t => `<label class="tagrow"><input type="checkbox" data-bind="econ.${t.id}"${w.economyTags.includes(t.id) ? ' checked' : ''}><span><b>${esc(t.label)}</b>${esc(t.describe)}</span></label>`).join('')}
  </div>

  <div class="sect"><h3>Dials</h3>
    <div class="grid2">
      <label class="lab">Price level (1 = standard)<input class="field" type="number" min="0.1" max="10" step="0.05" data-bind="dial.priceLevel" value="${esc(w.dials.priceLevel)}"></label>
      <label class="lab">Range width (0 = exact, 1 = wide)<input class="field" type="number" min="0" max="1" step="0.1" data-bind="dial.volatility" value="${esc(w.dials.volatility)}"></label>
      <label class="lab">Shops pay this share when you sell<input class="field" type="number" min="0.1" max="1" step="0.05" data-bind="dial.sellFraction" value="${esc(w.dials.sellFraction)}"></label>
      <label class="lab">Stacking circumstances<select class="field" data-bind="dial.stacking"><option value="dampened"${w.dials.stacking === 'dampened' ? ' selected' : ''}>Dampened (recommended)</option><option value="strict"${w.dials.stacking === 'strict' ? ' selected' : ''}>Strict multiplication</option></select></label>
      <label class="lab">When you just say "travel"<select class="field" data-bind="defaults.travel">${ctx.entries.filter(e => e.group === 'travel').map(e => `<option value="${esc(e.id)}"${w.defaults.travel === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
    </div>
  </div>

  <div class="sect"><h3>Custom words</h3>
    <p>Teach it your world's slang. "sparkjuice" can mean a potion of healing, "the Spire" can mean the capital.</p>
    ${w.vocabulary.map((v, i) => `<div class="vrow"><input class="field" data-bind="voc.${i}.term" value="${esc(v.term)}" placeholder="word or phrase" aria-label="Word"><select class="field" data-bind="voc.${i}.means" aria-label="Means">${vocabOptions(v.means)}</select><button class="xbtn" data-act="w-del-voc" data-i="${i}" aria-label="Remove word">×</button></div>`).join('')}
    <div class="row"><button class="btn" data-act="w-add-voc">Add a word</button></div>
  </div>

  <div class="sect"><h3>My items</h3>
    <p>Add anything the catalog lacks, or override a name to replace its price. Price can be typed with coins, like "3 gp 5 sp".</p>
    ${w.items.map((it, i) => `<div class="irow"><label class="lab">Name<input class="field" data-bind="item.${i}.name" value="${esc(it.name)}"></label><label class="lab">Kind<select class="field" data-bind="item.${i}.kind">${['good', 'service', 'labor', 'lodging', 'travel', 'spell', 'property'].map(k => `<option${it.kind === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label><label class="lab">Price<input class="field" data-bind="item.${i}.price" value="${esc(formatFull(it.bu, w.currency))}"></label><label class="lab">Per<select class="field" data-bind="item.${i}.unit">${['each', 'day', 'lb'].map(k => `<option${it.unit === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label><button class="xbtn" data-act="w-del-item" data-i="${i}" aria-label="Remove item">×</button></div><label class="lab">Tags (space separated, like: weapon metal)<input class="field" data-bind="item.${i}.tags" value="${esc((it.tags || []).join(' '))}"></label>`).join('')}
    <div class="row"><button class="btn" data-act="w-add-item">Add an item</button></div>
  </div>

  <div class="sect"><h3>Back up and share</h3>
    <p>Copy this world to keep it or send it to someone. Paste a world below to load it.</p>
    <textarea class="mono" id="exportBox" readonly aria-label="World data">${esc(json)}</textarea>
    <div class="row"><button class="btn" data-act="w-copy">Copy world</button><button class="btn" data-act="w-save-file">Save as file</button></div>
    <textarea class="mono" id="importBox" placeholder="Paste a world here" aria-label="Paste a world"></textarea>
    <div class="row"><button class="btn" data-act="w-import">Load pasted world</button><button class="btn danger" id="resetBtn" data-act="w-reset">Reset everything</button></div>
  </div>

  <div class="sect" id="about"><h3>About</h3>
    <p>Fool's Gold gives estimates, never appraisals. Every price is a range with the reasons shown. It runs on rules and word lists in your browser. Nothing is sent anywhere.</p>
    <p>${esc(SRD_ATTRIBUTION)}</p>
  </div>`;
  panel.scrollTop = top;
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
    ta.remove(); toast(ok ? okMsg : 'Copy blocked here. Select the text and copy it.');
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
    if (prev) prev.textContent = 'Preview: 1, 12, 130, 1,500, 25,000, 800,000 base units show as ' + [1, 12, 130, 1500, 25000, 800000].map(n => money(n)).join(', ') + '.';
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
    case 'mode': st.mode = d.mode; $('#tabType').setAttribute('aria-selected', st.mode === 'type'); $('#tabTap').setAttribute('aria-selected', st.mode === 'tap'); renderFlow(); if (st.mode === 'type') $('#q').focus(); break;
    case 'clear': $('#q').value = ''; st.flow = { cat: null, search: '' }; fromText('', { noHistory: true }); break;
    case 'sample': { const t = SAMPLE_QUERIES[+d.i]; $('#q').value = t; fromText(t); break; }
    case 'fix': { const s = st.parsed.suggestions[+d.i]; const t = st.text.slice(0, s.start) + s.to + st.text.slice(s.end); $('#q').value = t; fromText(t); break; }
    case 'chip-x': flowEdit(x => {
      const k = d.key;
      if (k === 'action') { x.assumed = [...new Set([...x.assumed, 'action'])]; x.action = 'buy'; }
      else if (k === 'qty') x.qty = null; else if (k === 'span') x.span = null; else if (k === 'rarity') x.rarity = null; else if (k === 'tier') x.tier = null;
      else if (k === 'subject') { x.subject = null; x.family = null; x.assumed = x.assumed.filter(z => z !== 'mode'); }
      else if (k.startsWith('mod:')) x.mods = x.mods.filter(m => m !== k.slice(4));
    }); break;
    case 'opt': { const o = st.an.dimensions[+d.d].options[+d.o]; flowEdit(x => o.apply(x)); break; }
    case 'resolve': flowEdit(x => { const g = ctx.mods.get(d.id).group; x.mods = x.mods.filter(m => ctx.mods.get(m)?.group !== g || m === d.id); }); break;
    case 'rm-mod': flowEdit(x => { x.mods = x.mods.filter(m => m !== d.id); }); break;
    case 'rm-tier': flowEdit(x => { x.tier = null; }); break;
    case 'copy': copyText(summaryLine(st.est), 'Copied'); break;
    case 'hist': { const h = S.history[+d.i]; $('#q').value = h.text; fromText(h.text, { noHistory: true }); window.scrollTo({ top: 0, behavior: 'smooth' }); break; }
    case 'star': { const h = S.history[+d.i]; h.pin = !h.pin; persist(); renderHistory(); break; }
    // flow
    case 'f-action': flowEdit(x => { x.action = d.v; x.assumed = x.assumed.filter(z => z !== 'action'); }); break;
    case 'f-cat': st.flow.cat = d.v; st.flow.search = ''; renderFlow(); break;
    case 'f-item': flowEdit(x => { x.subject = d.v; x.family = null; x.assumed = x.assumed.filter(z => z !== 'mode'); x.rarity = null; x.span = null; x.qty = null; const en = ctx.byId.get(d.v); if (!['travel', 'lodging', 'service', 'labor', 'spell'].includes(en.kind)) x.tier = null; x.mods = x.mods.filter(m => { const mm = ctx.mods.get(m); return mm && applicable(mm, en); }); }); break;
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
    case 'w-cur': world.currency.denominations = d.v === 'one'
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
    case 'w-save-file': { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(world, null, 1)], { type: 'application/json' })); a.download = slug(world.name) + '.foolsgold.json'; document.body.appendChild(a); a.click(); a.remove(); toast('Saving. If nothing happened, use Copy world.'); } catch (e2) { toast('Saving is blocked here. Use Copy world.'); } break; }
    case 'w-import': {
      try {
        const w = normalizeWorld(JSON.parse($('#importBox').value));
        if (!w || typeof w !== 'object') throw new Error('bad');
        w.id = uniqueWorldId(w.id); compileWorld(w); // throws before anything is stored
        S.worlds.push(w); useWorld(w.id); afterWorldSwitch(); toast('World loaded');
      } catch (e2) { toast('That is not a Fool\'s Gold world.'); }
      break;
    }
    case 'w-reset': {
      if (b.dataset.armed) { try { localStorage.removeItem('foolsgold.v1'); } catch (e2) { /* ignore */ } S = { ...load(), history: [] }; S.worlds = [WORLD_PRESETS.vcm(), WORLD_PRESETS.srd(), WORLD_PRESETS.titanium()]; S.activeId = 'vcm'; useWorld('vcm'); persist(); afterWorldSwitch(); toast('Reset'); }
      else { b.dataset.armed = '1'; b.textContent = 'Click again to erase all worlds'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Reset everything'; } }, 3500); }
      break;
    }
  }
});
function closeDrawerKeep() { renderDrawer(); if (st.text) fromText(st.text, { noHistory: true }); else renderAll(); }
function afterWorldSwitch() { renderDrawer(); st.query = emptyQuery(); if (st.text) fromText(st.text, { noHistory: true }); else renderAll(); }

$('#q').addEventListener('input', e => fromText(e.target.value));
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); recordHistory(); e.target.blur(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#drawer').hidden) closeDrawer(); });
$('#drawer').addEventListener('click', e => { if (e.target.id === 'drawer') closeDrawer(); });

// drawer and flow inputs
document.addEventListener('input', e => {
  if (e.target.id === 'flowSearch') { st.flow.search = e.target.value; renderFlow(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'flowQty') { const n = Math.max(1, Math.round(+t.value || 1)); flowEdit(x => { x.qty = n === 1 ? null : { lo: n, hi: n, unit: ctx.byId.get(x.subject)?.unit === 'lb' ? 'lb' : undefined }; }); return; }
  if (t.id === 'flowSpan') { const n = Math.max(1, +t.value || 1); flowEdit(x => { x.span = { lo: n, hi: n, unit: 'day' }; }); return; }
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
  else if (p[0] === 'dial') w.dials[p[1]] = t.tagName === 'SELECT' ? t.value : +t.value;
  else if (bind === 'defaults.travel') w.defaults.travel = t.value;
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
const first = S.last ?? SAMPLE_QUERIES[0];
$('#q').value = first;
fromText(first, { noHistory: true });
