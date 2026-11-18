// Convoy UI. Views are plain HTML strings morphed into the page on every change,
// so the box you are typing in is never replaced while others' changes stream in.
import {
  uid, inc, norm, getPath, hname, iname, describe, stock, covers, matches, parseLine, tokens, toBag,
  opAdd, opGive, opOffer, opAccept, opClose, opAdvance, opGenerate, genBody, bodiesIn, mapCfg, TYPES, newGame,
} from './core.js';
import { openStore } from './store.js';

const GAME = (new URLSearchParams(location.search).get('g') || 'main').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'main';
const store = openStore(GAME);
const S = () => store.state || {};
const app = document.getElementById('app');
const ME_KEY = `convoy.me.${GAME}`;
let me = null;
try { me = JSON.parse(localStorage.getItem(ME_KEY)); } catch {}
const ui = { tab: 'hold', f: {}, focus: null, sel: null, toast: null };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sortBy = (arr, f) => arr.sort((a, b) => { const x = f(a), y = f(b); return x < y ? -1 : x > y ? 1 : 0; });
const holders = kind => sortBy(Object.entries(S().holders || {}).filter(([, h]) => !kind || h.kind === kind).map(([id, h]) => ({ id, ...h })), h => `${String(h.order ?? 99).padStart(3, '0')}${h.name}`);
const isGM = () => me?.role === 'gm';
const who = () => (isGM() ? 'GM' : hname(S(), me?.char || me?.table));
const KIND = { ship: 'table', char: 'character', stash: 'stash' };

// Which inventories this device may act for.
function myHolders() {
  const s = S();
  if (isGM()) return holders().map(h => h.id);
  const out = [];
  if (me?.char && s.holders?.[me.char]) out.push(me.char);
  if (me?.table && s.holders?.[me.table] && (!out.length || s.settings?.playersUseShip !== false)) out.push(me.table);
  return out;
}
const mySheets = () => (isGM() ? holders().filter(h => h.kind !== 'stash').map(h => h.id) : [me?.table, me?.char].filter(id => id && S().holders?.[id]));

/* ---------- drawing ---------- */
let queued = false;
function draw() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; render(); }); }
function render() {
  if (me && me.role === 'player' && S().holders && !S().holders[me.table]) me = null;
  const t = document.createElement('template');
  t.innerHTML = view();
  morph(app, t.content);
  document.title = S().meta?.name ? `${S().meta.name} · Convoy` : 'Convoy';
}
const key = n => (n.nodeType === 1 ? n.getAttribute('data-k') : null);
function morph(from, to) {
  let a = from.firstChild, b = to.firstChild;
  while (b) {
    const nextB = b.nextSibling, kb = key(b);
    if (a && kb != null && key(a) !== kb) {
      let m = a.nextSibling;
      while (m && key(m) !== kb) m = m.nextSibling;
      if (m) { from.insertBefore(m, a); a = m; }
    }
    if (a && a.nodeType === b.nodeType && a.nodeName === b.nodeName && key(a) === kb) { sync(a, b); a = a.nextSibling; }
    else from.insertBefore(b, a);
    b = nextB;
  }
  while (a) { const n = a.nextSibling; from.removeChild(a); a = n; }
}
function sync(a, b) {
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  const active = a === document.activeElement;
  if (a.nodeName === 'INPUT') {
    if (a.type === 'checkbox') a.checked = b.hasAttribute('checked');
    else if (!active) { const v = b.getAttribute('value') ?? ''; if (a.value !== v) a.value = v; }
    return;
  }
  if (a.nodeName === 'TEXTAREA') { if (!active && a.value !== b.textContent) a.value = b.textContent; return; }
  morph(a, b);
  if (a.nodeName === 'SELECT' && !active) a.value = b.getAttribute('data-val') ?? '';
}

function toast(msg, good) {
  ui.toast = { msg, good }; draw();
  clearTimeout(toast.t); toast.t = setTimeout(() => { ui.toast = null; draw(); }, 2600);
}
const WHY = { short: 'Not enough in that inventory.', stale: 'That trade was already settled.', refused: 'Refused: someone got there first.', offline: 'No connection. Not saved.' };
async function run(updates) {
  const r = await store.update(updates);
  if (!r.ok) toast(WHY[r.error] || 'That did not go through.');
  return r.ok;
}
const set = (path, val) => run({ [path]: val });

/* ---------- small pieces ---------- */
const opt = (v, label, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
const sel = (attrs, cur, options) => `<select ${attrs} data-val="${esc(cur ?? '')}">${options.map(([v, l]) => opt(v, l, cur)).join('')}</select>`;
const holderOpts = ids => ids.map(id => { const h = S().holders[id]; return [id, h.kind === 'char' ? `${h.name} (${hname(S(), h.table)})` : h.name]; });

// Live read-back of a typed line, plus tap-to-complete suggestions for the word being typed.
function preview(field, mode, pool) {
  const s = S(), text = ui.f[field] || '';
  const lines = parseLine(text, s.items, pool);
  let html = lines.map(l => {
    if (l.status === 'ok') {
      const lack = mode === 'give' && pool && stock(s, ui.f.from, l.id) < l.qty;
      return `<span class="chip ${lack ? 'bad' : 'ok'}">${l.qty} ${esc(l.name)}${lack ? ' (not enough)' : ''}</span>`;
    }
    if (l.status === 'new') return mode === 'add' ? `<span class="chip new">${l.qty} ${esc(l.name)} · new type</span>` : `<span class="chip bad">${esc(l.text)}? no such item</span>`;
    if (l.status === 'ambiguous') return `<span class="chip bad">${esc(l.text)}? which one</span>`;
    return '';
  }).join('');
  if (ui.focus === field) {
    const toks = tokens(text), endsClean = !text.trim() || /[,;]\s*$/.test(text);
    const last = endsClean ? '' : toks[toks.length - 1] || '';
    const name = last.replace(/^[+-]?\d+\s*(x\s+)?/i, '');
    const done = !endsClean && lines.length && lines[lines.length - 1].status === 'ok' && norm(lines[lines.length - 1].name) === norm(name);
    if (!done) {
      const m = matches(name, s.items, mode === 'give' ? pool : null).slice(0, 8);
      html += m.map(x => `<button class="chip" data-act="chip" data-field="${esc(field)}" data-name="${esc(x.name)}">${esc(x.name)}</button>`).join('');
      if (mode === 'add' && name && !/!$/.test(name) && m.length && lines[lines.length - 1]?.status !== 'new') html += `<button class="chip new" data-act="chip" data-field="${esc(field)}" data-name="${esc(name)}!">new: “${esc(name)}”</button>`;
    }
  }
  return html ? `<div class="chips">${html}</div>` : '';
}
const linesOk = (lines, allowNew) => lines.length && lines.every(l => (l.status === 'ok' || (allowNew && l.status === 'new')) && l.qty !== 0);

/* ---------- views ---------- */
function view() {
  const s = S();
  let body;
  if (!s.holders) body = !store.loaded ? '<main><p class="dim">Connecting…</p></main>' : vCreate();
  else if (!me) body = vJoin();
  else {
    const tabs = [['hold', 'Hold'], ['map', 'Star map'], ['sheets', 'Sheets'], ['log', 'Log']].concat(isGM() ? [['setup', 'Setup']] : []);
    if (!tabs.some(t => t[0] === ui.tab)) ui.tab = 'hold';
    const nOffers = Object.values(s.trades || {}).filter(t => t.status === 'open' && myHolders().includes(t.to)).length;
    body = `<header data-k="hd"><b>${esc(s.meta?.name || 'Convoy')}</b>
      <nav>${tabs.map(([id, l]) => `<button data-act="tab" data-tab="${id}" class="${ui.tab === id ? 'on' : ''}">${l}${id === 'hold' && nOffers ? ` (${nOffers})` : ''}</button>`).join('')}</nav>
      <span class="who"><span class="dot ${store.status}" title="${store.kind} · ${store.status}"></span><span>${esc(isGM() ? 'GM' : who())}</span><button data-act="leave">switch</button></span></header>
      <main data-k="${ui.tab}">${store.kind === 'local' ? '<div class="banner">Local mode: this browser only. Add the Firebase URL in config.js to share across devices.</div>' : ''}${{ hold: vHold, map: vMap, sheets: vSheets, log: vLog, setup: vSetup }[ui.tab]()}</main>`;
  }
  return body + (ui.toast ? `<div class="toast ${ui.toast.good ? 'good' : ''}" data-k="toast">${esc(ui.toast.msg)}</div>` : '');
}

function vCreate() {
  return `<main><h2>New convoy “${esc(GAME)}”</h2><div class="card"><div class="row">
    <input class="grow" data-bind="new.name" value="${esc(ui.f['new.name'] ?? '')}" placeholder="Convoy name" data-enter="create">
    <label>Tables <input type="number" min="1" max="12" data-bind="new.tables" value="${esc(ui.f['new.tables'] ?? 4)}" style="width:70px"></label>
    <button class="go" data-act="create">Start</button></div>
    <p class="dim">${store.kind === 'local' ? 'Local mode: this browser only.' : 'Shared live through Firebase.'}</p></div></main>`;
}

function vJoin() {
  const s = S();
  return `<main><h2>${esc(s.meta?.name || 'Convoy')} · who is at this screen?</h2>
    <div class="card"><h3>Players</h3>
      <div class="row"><input class="grow" data-bind="join.char" value="${esc(ui.f['join.char'] ?? '')}" placeholder="Character name (optional: leave empty for a shared table screen)"></div>
      <div class="chips" style="margin-top:10px">${holders('ship').map(h => `<button data-act="joinCrew" data-h="${h.id}">${esc(h.name)}</button>`).join('')}</div>
    </div>
    <div class="card" style="margin-top:10px"><h3>Game master</h3><div class="row">
      ${s.settings?.pin ? `<input data-bind="join.pin" value="${esc(ui.f['join.pin'] ?? '')}" placeholder="GM pin" data-enter="joinGM" inputmode="numeric">` : ''}
      <button class="go" data-act="joinGM">I am a GM</button></div></div></main>`;
}

function vHold() {
  const s = S(), gm = isGM(), mine = myHolders();
  const open = sortBy(Object.entries(s.trades || {}).filter(([, t]) => t.status === 'open' && s.holders[t.from] && s.holders[t.to] && (gm || mine.includes(t.from) || mine.includes(t.to))), ([, t]) => t.at);
  const trades = open.map(([id, t]) => {
    const canA = gm || mine.includes(t.to), canC = gm || mine.includes(t.from);
    const able = covers(s, t.from, t.give) && covers(s, t.to, t.want);
    return `<div class="card trade ${mine.includes(t.to) && !gm ? 'in' : ''}" data-k="tr-${id}"><div class="t"><b>${esc(hname(s, t.from))}</b> → <b>${esc(hname(s, t.to))}</b><br>
      gives ${esc(describe(s, t.give))} · wants ${esc(describe(s, t.want))}${t.note ? `<br><small>“${esc(t.note)}”</small>` : ''}${able ? '' : '<br><small style="color:var(--bad)">someone cannot cover this right now</small>'}</div>
      ${canA ? `<button class="go" data-act="accept" data-id="${id}" ${able ? '' : 'disabled'}>${gm && !mine.includes(t.to) ? 'Force accept' : 'Accept'}</button><button class="no" data-act="close" data-id="${id}" data-st="declined">Decline</button>` : ''}
      ${canC && !canA ? `<button class="no" data-act="close" data-id="${id}" data-st="cancelled">Cancel</button>` : ''}</div>`;
  }).join('');

  if (!mine.includes(ui.f.from)) ui.f.from = mine[0];
  const from = ui.f.from, others = holders().map(h => h.id).filter(id => id !== from);
  if (!others.includes(ui.f.to)) ui.f.to = '';
  const pool = Object.keys(s.inv?.[from] || {}).filter(i => stock(s, from, i) > 0);
  const give = parseLine(ui.f.give, s.items, pool), want = parseLine(ui.f.want, s.items);
  const giveOk = !give.length || (linesOk(give) && give.every(l => l.qty > 0) && covers(s, from, toBag(give)));
  const wantOk = !want.length || (linesOk(want) && want.every(l => l.qty > 0));
  const ready = ui.f.to && giveOk && wantOk && (give.length || want.length);
  const compose = `<div class="card"><div class="compose">
      <div><label>From</label>${sel('data-bind="from"', from, holderOpts(mine))}</div>
      <div><label>To</label>${sel('data-bind="to"', ui.f.to, [['', 'choose…'], ...holderOpts(others)])}</div>
      <div><label>Give</label><input data-bind="give" data-enter="send" value="${esc(ui.f.give ?? '')}" placeholder="3 fuel, 1 medkit" autocomplete="off">${preview('give', 'give', pool)}</div>
      <div><label>Want back</label><input data-bind="want" data-enter="send" value="${esc(ui.f.want ?? '')}" placeholder="empty = a gift" autocomplete="off">${preview('want', 'want')}</div>
      <div><label>Note</label><input data-bind="note" data-enter="send" value="${esc(ui.f.note ?? '')}" placeholder="optional"></div>
      <div class="row" style="align-items:end"><button class="go" data-act="give" ${ready && give.length && !want.length ? '' : 'disabled'}>Give now</button><button data-act="offer" ${ready ? '' : 'disabled'}>Offer trade</button></div>
    </div></div>`;

  const shown = gm || s.settings?.playersSeeAll ? holders().map(h => h.id) : mine;
  const order = [];
  for (const h of holders('ship')) { order.push(h.id); for (const c of holders('char')) if (c.table === h.id) order.push(c.id); }
  for (const h of holders('stash')) order.push(h.id);
  const cards = order.filter(id => shown.includes(id)).map(id => {
    const h = s.holders[id], can = mine.includes(id);
    const rows = sortBy(Object.keys(s.inv?.[id] || {}).filter(i => stock(s, id, i) > 0), i => iname(s, i).toLowerCase()).map(i => `<tr data-k="${i}">
      <td class="n" ${can ? `data-act="pick" data-h="${id}" data-i="${i}" title="add to Give"` : ''}>${esc(iname(s, i))}</td><td class="q">${stock(s, id, i)}</td>
      ${gm ? `<td class="b"><button data-act="adj" data-h="${id}" data-i="${i}" data-n="-1">−</button> <button data-act="adj" data-h="${id}" data-i="${i}" data-n="1">+</button></td>` : ''}</tr>`).join('');
    return `<section class="card ${h.kind} ${can && !gm ? 'mine' : ''}" data-k="h-${id}"><h3>${esc(h.name)} <small>${h.kind === 'char' ? esc(hname(s, h.table)) : KIND[h.kind]}</small></h3>
      ${rows ? `<table class="inv"><tbody>${rows}</tbody></table>` : '<p class="empty">empty</p>'}
      ${gm ? `<input style="width:100%" data-bind="add.${id}" data-enter="add" data-h="${id}" value="${esc(ui.f[`add.${id}`] ?? '')}" placeholder="+ 5 fuel cells" autocomplete="off">${preview(`add.${id}`, 'add')}` : ''}</section>`;
  }).join('');

  return `${trades ? `<h2>Offers on the table</h2><div class="grid" style="grid-template-columns:1fr">${trades}</div>` : ''}
    <h2>Give or trade</h2>${compose}
    <h2>${gm ? 'All inventories' : 'Inventory'}</h2><div class="grid">${cards}</div>
    ${gm ? '<p class="dim">Type in a box and press Enter to create stock (“-2 ore” removes). Names match existing types automatically; end a name with ! to force a new type.</p>' : ''}`;
}

function vMap() {
  const s = S(), m = mapCfg(s), gm = isGM(), pos = s.map?.pos || 0, all = Object.entries(s.map?.bodies || {});
  const open = m.mode === 'open';
  const lo = open ? Math.max(Math.min(pos, ...all.map(([, b]) => b.sector)), pos - 12) : pos - m.behind;
  const hi = pos + m.ahead + (gm ? 2 : 0);
  const lost = all.filter(([, b]) => b.sector < lo).length;
  let cols = '';
  for (let sec = lo; sec <= hi; sec++) {
    const cls = sec < pos ? 'astern' : sec === pos ? 'here' : sec <= pos + m.ahead ? 'ahead' : 'unch';
    const fade = sec < pos && !open ? Math.max(0.15, 1 - (pos - sec) / (m.behind + 1)) : 1;
    const bodies = all.filter(([, b]) => b.sector === sec && (gm || !b.hidden)).map(([id, b]) =>
      `<button class="body t-${esc(String(b.type).replace(/\s/g, ''))} ${ui.sel === id ? 'sel' : ''} ${b.hidden ? 'hid' : ''}" data-k="${id}" data-act="sel" data-id="${id}" style="left:${b.x * 100}%;top:${b.y * 100}%;opacity:${fade}"><i></i>${esc(b.name)}</button>`).join('');
    const label = sec === pos ? 'CONVOY' : sec < pos ? `${pos - sec} astern` : sec <= pos + m.ahead ? `${sec - pos} ahead` : 'uncharted';
    cols += `<div class="sec ${cls}" data-k="s${sec}"><div class="sky">${bodies}</div><div class="foot"><span>${label} · ${sec}</span>
      ${gm ? `<span><button data-act="newBody" data-sec="${sec}" title="add a blank body here">+</button> <button data-act="genBody" data-sec="${sec}" title="generate a body here">gen</button></span>` : ''}</div></div>`;
  }
  const b = s.map?.bodies?.[ui.sel];
  const visible = b && (gm || (!b.hidden && b.sector >= lo && b.sector <= hi));
  const pips = n => '●'.repeat(n || 0) + '○'.repeat(5 - (n || 0));
  const p = `map/bodies/${ui.sel}`;
  const inp = (label, f, extra = '', wide = '') => `<div class="field ${wide}"><label>${label}</label><input data-change="set" data-path="${p}/${f}" value="${esc(b[f] ?? '')}" ${extra}></div>`;
  const detail = !visible ? '<p class="dim">Tap anything on the map.</p>' : gm ? `<div class="card detail" data-k="d-${ui.sel}"><div class="fields">
      ${inp('Name', 'name', 'id="bodyName"')}
      <div class="field"><label>Type</label>${sel(`data-change="set" data-path="${p}/type"`, b.type, TYPES.map(t => [t, t]))}</div>
      ${inp('Sector', 'sector', 'type="number" data-t="num"')}${inp('Hazard 0-5', 'haz', 'type="number" min="0" max="5" data-t="num"')}${inp('Yield 0-5', 'rich', 'type="number" min="0" max="5" data-t="num"')}
      ${inp('Population', 'pop')}${inp('Trait', 'trait', '', 'wide')}
      <div class="field wide"><label>Notes players can read</label><textarea data-change="set" data-path="${p}/note">${esc(b.note ?? '')}</textarea></div>
      <div class="field wide"><label>GM only</label><textarea data-change="set" data-path="${p}/gm">${esc(b.gm ?? '')}</textarea></div></div>
      <div class="row" style="margin-top:8px"><label><input type="checkbox" data-change="set" data-t="bool" data-path="${p}/hidden" ${b.hidden ? 'checked' : ''}> hidden from players</label>
      <button data-act="reroll" data-id="${ui.sel}">Reroll</button><button class="no" data-act="delBody" data-id="${ui.sel}">Delete</button></div></div>`
    : `<div class="card detail" data-k="d-${ui.sel}"><h3>${esc(b.name)} <small>${esc(b.type)} · sector ${b.sector}</small></h3>
      <div>Hazard <span class="pips">${pips(b.haz)}</span> &nbsp; Yield <span class="pips">${pips(b.rich)}</span> &nbsp; Population: ${esc(b.pop || 'None')}</div>
      ${b.trait ? `<div>${esc(b.trait)}</div>` : ''}${b.note ? `<p>${esc(b.note)}</p>` : ''}</div>`;
  return `<div class="mapbar">${gm ? '<button data-act="advance" data-n="-1">◀ Back</button>' : ''}<span class="pos">Sector <b>${pos}</b></span>
      ${gm ? '<button class="go" data-act="advance" data-n="1">Advance time ▶</button>' : ''}
      <span class="dim">${open ? 'open map' : `travelling → · ${lost} lost astern`}</span></div>
    <div class="map">${cols}</div>${detail}`;
}

function fieldsOf(kind) { return sortBy(Object.entries(S().templates?.[kind] || {}).map(([id, f]) => ({ id, ...f })), f => f.order ?? 0); }
function vSheets() {
  const s = S();
  const cards = mySheets().map(id => {
    const h = s.holders[id], kind = h.kind === 'char' ? 'char' : 'ship', p = `holders/${id}/sheet`;
    const rows = fieldsOf(kind).map(f => {
      const v = h.sheet?.[f.id];
      const step = n => `<button data-act="step" data-h="${id}" data-f="${f.id}" data-kind="${kind}" data-n="${n}">${n < 0 ? '−' : '+'}</button>`;
      let ctl;
      if (f.type === 'track') { const max = f.max || 5, n = Math.max(0, Math.min(max, Number(v) || 0)); ctl = `${step(-1)}<span class="pips">${'■'.repeat(n)}${'□'.repeat(max - n)}</span><b>${n}</b><small>/${max}</small>${step(1)}`; }
      else if (f.type === 'num') ctl = `${step(-1)}<input type="number" data-change="set" data-t="num" data-path="${p}/${f.id}" value="${esc(v ?? 0)}">${step(1)}`;
      else if (f.type === 'long') ctl = `<textarea data-change="set" data-path="${p}/${f.id}">${esc(v ?? '')}</textarea>`;
      else ctl = `<input type="text" data-change="set" data-path="${p}/${f.id}" value="${esc(v ?? '')}">`;
      return `<div class="f" data-k="${f.id}"><label>${esc(f.label)}</label>${ctl}</div>`;
    }).join('');
    const hold = Object.keys(s.inv?.[id] || {}).filter(i => stock(s, id, i) > 0).map(i => `${stock(s, id, i)} ${iname(s, i)}`).join(' · ');
    return `<section class="card sheet ${h.kind}" data-k="sh-${id}"><h3>${esc(h.name)} <small>${h.kind === 'char' ? esc(hname(s, h.table)) : KIND[h.kind]}</small></h3>${rows}
      <div class="f"><label>Hold</label><span class="${hold ? '' : 'empty'}">${esc(hold || 'empty')}</span></div></section>`;
  }).join('');
  return `<h2>Sheets</h2><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${cards}</div>
    ${isGM() ? '<p class="dim">Fields are the same for every table. Change them in Setup.</p>' : ''}`;
}

function vLog() {
  const rows = sortBy(Object.entries(S().log || {}), ([id]) => id).slice(-150).reverse().map(([id, l]) =>
    `<div data-k="${id}"><small>${new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small> ${esc(l.msg)}</div>`).join('');
  return `<h2>Log</h2><div class="log">${rows || '<p class="empty">Nothing yet.</p>'}</div>`;
}

function vSetup() {
  const s = S(), m = mapCfg(s);
  const txt = (path, v, extra = '') => `<input data-change="set" data-path="${path}" value="${esc(v ?? '')}" ${extra}>`;
  const num = (label, path, v) => `<label>${label} <input type="number" data-change="set" data-t="num" data-path="${path}" value="${esc(v)}"></label>`;
  const chk = (label, path, v) => `<label><input type="checkbox" data-change="set" data-t="bool" data-path="${path}" ${v ? 'checked' : ''}> ${label}</label>`;
  const hl = kind => holders(kind).map(h => `<div class="line" data-k="${h.id}">${txt(`holders/${h.id}/name`, h.name)}${kind === 'char' ? `<small>${esc(hname(s, h.table))}</small>` : ''}<button class="no" data-act="delHolder" data-h="${h.id}">remove</button></div>`).join('');
  const tpl = kind => fieldsOf(kind).map(f => `<div class="line" data-k="${f.id}">${txt(`templates/${kind}/${f.id}/label`, f.label)}
      ${sel(`data-change="set" data-path="templates/${kind}/${f.id}/type"`, f.type, [['track', 'track (pips)'], ['num', 'number'], ['text', 'short text'], ['long', 'long text']])}
      ${f.type === 'track' ? num('max', `templates/${kind}/${f.id}/max`, f.max || 5) : ''}
      <button data-act="moveField" data-kind="${kind}" data-f="${f.id}" data-n="-1">↑</button><button data-act="moveField" data-kind="${kind}" data-f="${f.id}" data-n="1">↓</button>
      <button class="no" data-act="delField" data-kind="${kind}" data-f="${f.id}">remove</button></div>`).join('') + `<button data-act="addField" data-kind="${kind}">+ field</button>`;
  const items = sortBy(Object.entries(s.items || {}), ([, i]) => i.name.toLowerCase()).map(([id, it]) => {
    const total = Object.values(s.inv || {}).reduce((a, inv) => a + (inv[id] || 0), 0);
    return `<div class="line" data-k="${id}">${txt(`items/${id}/name`, it.name)}<small>${total} in play</small><button class="no" data-act="delItem" data-i="${id}">remove</button></div>`;
  }).join('');
  return `<div class="setup"><h2>Convoy</h2><div class="card">
      <div class="line"><label>Name ${txt('meta/name', s.meta?.name)}</label><label>GM pin ${txt('settings/pin', s.settings?.pin, 'placeholder="none" inputmode="numeric"')}</label></div>
      <div class="line">${chk('players at a table can spend from their table’s hold', 'settings/playersUseShip', s.settings?.playersUseShip !== false)}</div>
      <div class="line">${chk('players can see every inventory', 'settings/playersSeeAll', s.settings?.playersSeeAll)}</div>
      <p class="dim">${store.kind === 'local' ? 'Local mode (this browser only).' : 'Live through Firebase.'} The pin keeps players out of GM view; it is not real security.</p></div>
    <h2>Tables</h2><div class="card">${hl('ship')}<button data-act="addHolder" data-kind="ship">+ table</button></div>
    <h2>Stashes <small>(extra inventories: convoy stores, a market, a wreck)</small></h2><div class="card">${hl('stash')}<button data-act="addHolder" data-kind="stash">+ stash</button></div>
    <h2>Characters</h2><div class="card">${hl('char') || '<p class="empty">Players add themselves when they join with a name.</p>'}</div>
    <h2>Item types</h2><div class="card">${items || '<p class="empty">Created the first time a GM adds stock in Hold.</p>'}</div>
    <h2>Table sheet fields</h2><div class="card">${tpl('ship')}</div>
    <h2>Character sheet fields</h2><div class="card">${tpl('char')}</div>
    <h2>Star map</h2><div class="card"><div class="line">
      <label>Mode ${sel('data-change="set" data-path="settings/map/mode"', m.mode, [['linear', 'linear decay (convoy travels on)'], ['open', 'open (nothing is lost)']])}</label>
      ${num('sectors visible ahead', 'settings/map/ahead', m.ahead)}${num('sectors kept astern', 'settings/map/behind', m.behind)}</div>
      <div class="line">${chk('fill uncharted space automatically on advance', 'settings/map/autoGen', m.autoGen)}${num('bodies per sector: min', 'settings/map/genMin', m.genMin)}${num('max', 'settings/map/genMax', m.genMax)}</div></div>
    <h2>Data</h2><div class="card"><div class="line"><button data-act="export">Download backup</button><label>Restore backup <input type="file" accept=".json" data-change="import"></label>
      <button class="no" data-act="clearLog">Clear log</button><button class="no" data-act="reset">Erase this convoy</button></div></div></div>`;
}

/* ---------- actions ---------- */
const refill = (field, value) => {
  ui.f[field] = value; ui.focus = field; render();
  const el = app.querySelector(`[data-bind="${CSS.escape(field)}"]`);
  if (el) { el.value = value; el.focus(); el.setSelectionRange(value.length, value.length); }
};
const saveMe = () => { localStorage.setItem(ME_KEY, JSON.stringify(me)); draw(); };

const A = {
  tab: d => { ui.tab = d.tab; draw(); },
  leave: () => { me = null; localStorage.removeItem(ME_KEY); draw(); },
  create: async () => { await store.replace(newGame((ui.f['new.name'] || '').trim(), Math.max(1, Math.min(12, parseInt(ui.f['new.tables'] ?? 4, 10) || 4)))); me = { role: 'gm' }; saveMe(); },
  joinGM: () => { const pin = S().settings?.pin; if (pin && String(ui.f['join.pin'] || '') !== String(pin)) return toast('Wrong pin.'); me = { role: 'gm' }; saveMe(); },
  joinCrew: async d => {
    const name = (ui.f['join.char'] || '').trim();
    let char = null;
    if (name) {
      char = holders('char').find(c => c.table === d.h && norm(c.name) === norm(name))?.id;
      if (!char) { char = `c${uid()}`; await set(`holders/${char}`, { name, kind: 'char', table: d.h }); }
    }
    me = { role: 'player', table: d.h, char }; ui.f.from = null; saveMe();
  },

  chip: d => {
    const text = ui.f[d.field] || '', clean = !text.trim() || /[,;]\s*$/.test(text);
    const toks = tokens(text), last = clean ? '' : toks.pop() || '';
    const qty = (last.match(/^[+-]?\d+/) || ['1'])[0];
    refill(d.field, [...toks, `${qty} ${d.name}`].join(', ') + (d.name.endsWith('!') ? '' : ', '));
  },
  pick: d => { const cur = ui.f.from === d.h ? (ui.f.give || '').trim().replace(/,$/, '') : ''; ui.f.from = d.h; refill('give', `${cur ? cur + ', ' : ''}1 ${iname(S(), d.i)}`); },
  add: async (d, el) => {
    const s = S(), lines = parseLine(ui.f[`add.${d.h}`], s.items);
    if (!linesOk(lines, true)) return toast('Check the highlighted names first.');
    if (await run(opAdd(s, d.h, lines, who()))) { ui.f[`add.${d.h}`] = ''; el.value = ''; draw(); }
  },
  adj: d => run({ [`inv/${d.h}/${d.i}`]: inc(Number(d.n)) }),
  send: () => { if (parseLine(ui.f.want, S().items).length) A.offer(); else A.give(); },
  give: async () => { const t = draft(); if (t && !Object.keys(t.want).length && Object.keys(t.give).length && await run(opGive(S(), t.from, t.to, t.give, who()))) { clearDraft(); toast(`Given to ${hname(S(), t.to)}.`, true); } },
  offer: async () => { const t = draft(); if (t && await run(opOffer(S(), t.from, t.to, t.give, t.want, ui.f.note, who()))) { clearDraft(); toast(`Offer sent to ${hname(S(), t.to)}.`, true); } },
  accept: d => run(opAccept(S(), d.id, who())),
  close: d => run(opClose(S(), d.id, d.st, who())),

  sel: d => { ui.sel = ui.sel === d.id ? null : d.id; draw(); },
  advance: d => run(opAdvance(S(), Number(d.n), who())),
  genBody: async d => { const u = opGenerate(S(), Number(d.sec), 1); ui.sel = Object.keys(u)[0].split('/').pop(); await run(u); },
  newBody: async d => {
    const id = uid(); ui.sel = id;
    await set(`map/bodies/${id}`, { ...genBody(Number(d.sec)), name: 'New body', type: 'Planet', haz: 0, rich: 0, pop: 'None', trait: '' });
    render(); const el = document.getElementById('bodyName'); if (el) { el.focus(); el.select(); }
  },
  reroll: d => { const b = S().map.bodies[d.id]; return set(`map/bodies/${d.id}`, { ...genBody(b.sector), x: b.x, y: b.y, hidden: !!b.hidden }); },
  delBody: d => { ui.sel = null; return set(`map/bodies/${d.id}`, null); },

  step: d => {
    const f = S().templates?.[d.kind]?.[d.f], cur = Number(S().holders[d.h].sheet?.[d.f]) || 0, n = Number(d.n);
    if (f?.type === 'track' && (cur + n < 0 || cur + n > (f.max || 5))) return;
    return set(`holders/${d.h}/sheet/${d.f}`, cur + n);
  },
  set: (d, el) => {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (d.t === 'num') v = Number(v) || 0;
    if (d.path.endsWith('/name') && !String(v).trim()) return draw();
    return set(d.path, v);
  },

  addHolder: d => { const n = holders(d.kind).length + 1; return set(`holders/${d.kind[0]}${uid()}`, { name: d.kind === 'ship' ? `Table ${n}` : `Stash ${n}`, kind: d.kind, order: 50 + n }); },
  delHolder: d => {
    const s = S();
    if (!confirm(`Remove ${hname(s, d.h)} and everything it holds?`)) return;
    const u = {};
    for (const id of [d.h, ...holders('char').filter(c => c.table === d.h).map(c => c.id)]) { u[`holders/${id}`] = null; u[`inv/${id}`] = null; }
    return run(u);
  },
  delItem: d => {
    const s = S();
    if (!confirm(`Remove ${iname(s, d.i)} from the game, including all stock of it?`)) return;
    const u = { [`items/${d.i}`]: null };
    for (const h of Object.keys(s.inv || {})) if (s.inv[h][d.i] != null) u[`inv/${h}/${d.i}`] = null;
    return run(u);
  },
  addField: d => set(`templates/${d.kind}/f${uid()}`, { label: 'New field', type: 'num', order: Math.max(0, ...fieldsOf(d.kind).map(f => f.order || 0)) + 1 }),
  delField: d => set(`templates/${d.kind}/${d.f}`, null),
  moveField: d => {
    const list = fieldsOf(d.kind), i = list.findIndex(f => f.id === d.f), j = i + Number(d.n);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const u = {}; list.forEach((f, k) => { u[`templates/${d.kind}/${f.id}/order`] = k + 1; });
    return run(u);
  },
  export: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S(), null, 1)], { type: 'application/json' }));
    a.download = `convoy-${GAME}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`; a.click();
  },
  import: async (d, el) => {
    try { const tree = JSON.parse(await el.files[0].text()); if (!tree.holders) throw 0; if (confirm('Replace the whole convoy with this backup?')) await store.replace(tree); }
    catch { toast('That file is not a convoy backup.'); }
    el.value = '';
  },
  clearLog: () => set('log', null),
  reset: async () => { if (confirm('Erase this convoy for everyone? Download a backup first if unsure.')) { await store.replace(null); A.leave(); } },
};

function draft() {
  const s = S(), from = ui.f.from, to = ui.f.to;
  const pool = Object.keys(s.inv?.[from] || {}).filter(i => stock(s, from, i) > 0);
  const give = parseLine(ui.f.give, s.items, pool), want = parseLine(ui.f.want, s.items);
  const good = l => !l.length || (linesOk(l) && l.every(x => x.qty > 0));
  if (!to || !good(give) || !good(want) || (!give.length && !want.length)) { toast('Pick who it goes to and check the items.'); return null; }
  if (!covers(s, from, toBag(give))) { toast(WHY.short); return null; }
  return { from, to, give: toBag(give), want: toBag(want) };
}
function clearDraft() {
  for (const f of ['give', 'want', 'note']) { ui.f[f] = ''; const el = app.querySelector(`[data-bind="${f}"]`); if (el) el.value = ''; }
  draw();
}

/* ---------- wiring ---------- */
app.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled) A[el.dataset.act]?.(el.dataset, el);
});
app.addEventListener('input', e => { const b = e.target.dataset?.bind; if (b != null) { ui.f[b] = e.target.value; draw(); } });
app.addEventListener('change', e => { const c = e.target.dataset?.change; if (c) A[c]?.(e.target.dataset, e.target); });
app.addEventListener('keydown', e => {
  const d = e.target.dataset || {};
  if (e.key === 'Enter' && d.enter && !e.shiftKey) { e.preventDefault(); A[d.enter]?.(d, e.target); }
  else if (e.key === 'Enter' && d.change && e.target.nodeName === 'INPUT') e.target.blur();
  else if (e.key === 'Tab' && d.bind && !e.shiftKey) {
    const chip = e.target.parentElement.querySelector('button.chip');
    if (chip && e.target.value.trim() && !/[,;]\s*$/.test(e.target.value)) { e.preventDefault(); chip.click(); }
  }
});
app.addEventListener('focusin', e => { const b = e.target.dataset?.bind; if (b && ui.focus !== b) { ui.focus = b; draw(); } });

store.onChange(draw);
render();
window.CONVOY = { store, ui, get me() { return me; } };
