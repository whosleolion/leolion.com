// Convoy core: pure data logic shared by the page, the local store and the test server.
// The whole game is one JSON tree; every action is a multi-path update of it:
//   meta, settings, holders/<id>, items/<id>, inv/<holder>/<item>, trades/<id>,
//   map/{pos,bodies/<id>}, templates/<kind>/<field>, log/<id>

export const uid = () => Date.now().toString(36).padStart(9, '0') + Math.random().toString(36).slice(2, 8);
export const inc = n => ({ '.sv': { increment: n } });
export const segs = path => String(path).split('/').filter(Boolean);

// Two names are the same item when their keys match: case, spaces, punctuation
// and a plural "s" are ignored ("Fuel Cells" = "fuel cell").
export const norm = s => {
  let k = String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (k.length > 3 && k.endsWith('s')) k = k.slice(0, -1);
  return k;
};

export function getPath(o, path) {
  for (const k of segs(path)) { if (o == null || typeof o !== 'object') return undefined; o = o[k]; }
  return o;
}
function del(o, p, i) {
  if (o == null || typeof o !== 'object') return;
  if (i === p.length - 1) { delete o[p[i]]; return; }
  const c = o[p[i]];
  del(c, p, i + 1);
  if (c && typeof c === 'object' && !Object.keys(c).length) delete o[p[i]];
}
export function setPath(root, path, val) {
  const p = segs(path);
  if (!p.length) return val == null ? {} : val;
  if (root == null || typeof root !== 'object') root = {};
  if (val == null) { del(root, p, 0); return root; }
  let o = root;
  for (let i = 0; i < p.length - 1; i++) {
    if (o[p[i]] == null || typeof o[p[i]] !== 'object') o[p[i]] = {};
    o = o[p[i]];
  }
  o[p[p.length - 1]] = val;
  return root;
}

// Applies a multi-path update all-or-nothing, with the same two rules the Firebase
// rules file enforces: stock never goes below zero, and a trade settles only once.
export function applyUpdates(state, updates) {
  let root = structuredClone(state || {});
  const resolved = {};
  for (const [path, v] of Object.entries(updates)) {
    let val = v;
    if (v && typeof v === 'object' && v['.sv']) {
      const sv = v['.sv'];
      if (sv === 'timestamp') val = Date.now();
      else if (sv.increment != null) { const cur = getPath(root, path); val = (typeof cur === 'number' ? cur : 0) + sv.increment; }
    }
    const p = segs(path);
    if (p[0] === 'inv' && p.length === 3 && val != null && !(typeof val === 'number' && val >= 0)) return { ok: false, error: 'short' };
    if (p[0] === 'trades' && p.length === 3 && p[2] === 'status') {
      const cur = getPath(state, path);
      if (cur != null && cur !== 'open') return { ok: false, error: 'stale' };
    }
    root = setPath(root, path, val);
    resolved[path] = val;
  }
  return { ok: true, state: root, resolved };
}

/* ---------- names ---------- */
export const hname = (s, id) => s.holders?.[id]?.name || '(gone)';
export const iname = (s, id) => s.items?.[id]?.name || id;
export const describe = (s, bag) => Object.entries(bag || {}).map(([i, n]) => `${n} ${iname(s, i)}`).join(', ') || 'nothing';
export const stock = (s, h, i) => s.inv?.[h]?.[i] || 0;
export const covers = (s, h, bag) => Object.entries(bag || {}).every(([i, n]) => stock(s, h, i) >= n);

/* ---------- typing items ---------- */
// "3 fuel, 2 ore" -> [{qty, text, id, name, status}] ; status: ok | new | ambiguous | bad
// pool (optional) = item ids to prefer (what the giver actually holds).
export function matches(text, items, pool) {
  const k = norm(text);
  const all = Object.entries(items || {}).map(([id, it]) => ({ id, name: it.name }));
  if (!k) return (pool ? all.filter(x => pool.includes(x.id)) : all).sort((a, b) => a.name.localeCompare(b.name));
  const rank = x => (x.id === k ? 0 : x.id.startsWith(k) ? 1 : x.name.toLowerCase().split(/\s+/).some(w => norm(w).startsWith(k)) ? 2 : x.id.includes(k) ? 3 : 9)
    + (pool && !pool.includes(x.id) ? 0.5 : 0);
  return all.map(x => ({ ...x, r: rank(x) })).filter(x => x.r < 9).sort((a, b) => a.r - b.r || a.name.localeCompare(b.name));
}
export function resolve(text, items, pool) {
  const force = /!\s*$/.test(text);
  const clean = text.replace(/!\s*$/, '').trim();
  const k = norm(clean);
  if (!k) return { status: 'bad' };
  if (items?.[k]) return { status: 'ok', id: k, name: items[k].name };
  if (force) return { status: 'new', id: k, name: clean[0].toUpperCase() + clean.slice(1) };
  let m = matches(clean, items, pool);
  if (pool) { const inPool = m.filter(x => pool.includes(x.id)); if (inPool.length) m = inPool; }
  const best = m.filter(x => Math.floor(x.r) === Math.floor(m[0].r));
  if (best.length === 1) return { status: 'ok', id: best[0].id, name: best[0].name };
  if (m.length) return { status: 'ambiguous', options: m };
  return { status: 'new', id: k, name: clean[0].toUpperCase() + clean.slice(1) };
}
export const tokens = line => String(line || '').split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
export function parseLine(line, items, pool) {
  return tokens(line).map(t => {
    const m = t.match(/^([+-]?\d+)?\s*(?:x\s+)?(.*)$/i);
    const qty = m[1] ? parseInt(m[1], 10) : 1;
    return { qty, text: m[2], ...resolve(m[2], items, pool) };
  });
}
export const toBag = lines => { const b = {}; for (const l of lines) b[l.id] = (b[l.id] || 0) + l.qty; return b; };

/* ---------- actions (each returns a multi-path update) ---------- */
const deltas = () => {
  const d = {};
  return {
    add(h, i, n) { const k = `inv/${h}/${i}`; d[k] = (d[k] || 0) + n; },
    out() { const u = {}; for (const k in d) if (d[k]) u[k] = inc(d[k]); return u; },
  };
};
const logTo = (u, msg) => { u[`log/${uid()}`] = { at: Date.now(), msg }; return u; };

// GM only: bring stock into existence (creates the item type if it is new).
export function opAdd(s, holder, lines, who) {
  const u = {}, d = deltas();
  for (const l of lines) {
    if (l.status === 'new') u[`items/${l.id}`] = { name: l.name, at: Date.now() };
    d.add(holder, l.id, l.qty);
  }
  const names = lines.map(l => `${l.qty > 0 ? '+' : ''}${l.qty} ${l.name}`).join(', ');
  return logTo({ ...u, ...d.out() }, `${who} set ${names} on ${hname(s, holder)}`);
}
export function opGive(s, from, to, bag, who) {
  const d = deltas();
  for (const [i, n] of Object.entries(bag)) { d.add(from, i, -n); d.add(to, i, n); }
  return logTo(d.out(), `${hname(s, from)} gave ${describe(s, bag)} to ${hname(s, to)} (${who})`);
}
export function opOffer(s, from, to, give, want, note, who) {
  const id = uid();
  return logTo({ [`trades/${id}`]: { from, to, give, want, note: note || '', by: who, at: Date.now(), status: 'open' } },
    `${hname(s, from)} offered ${hname(s, to)}: ${describe(s, give)} for ${describe(s, want)}`);
}
export function opAccept(s, id, who) {
  const t = s.trades[id], d = deltas();
  for (const [i, n] of Object.entries(t.give || {})) { d.add(t.from, i, -n); d.add(t.to, i, n); }
  for (const [i, n] of Object.entries(t.want || {})) { d.add(t.to, i, -n); d.add(t.from, i, n); }
  return logTo({ ...d.out(), [`trades/${id}/status`]: 'accepted', [`trades/${id}/closedBy`]: who },
    `Trade done: ${hname(s, t.from)} gave ${describe(s, t.give)}, ${hname(s, t.to)} gave ${describe(s, t.want)}`);
}
export function opClose(s, id, status, who) {
  const t = s.trades[id];
  return logTo({ [`trades/${id}/status`]: status, [`trades/${id}/closedBy`]: who },
    `Trade ${status}: ${hname(s, t.from)} and ${hname(s, t.to)} (${who})`);
}

/* ---------- star map ---------- */
export const MAP_DEFAULTS = { mode: 'linear', ahead: 3, behind: 2, genMin: 1, genMax: 3, autoGen: true };
export const mapCfg = s => ({ ...MAP_DEFAULTS, ...(s.settings?.map || {}) });
export const TYPES = ['Planet', 'Moon', 'Gas giant', 'Asteroid belt', 'Station', 'Derelict', 'Nebula', 'Anomaly'];
const WEIGHTS = [6, 3, 2, 4, 2, 2, 1, 1];
const SYL = ['ka', 've', 'ro', 'th', 'an', 'is', 'ul', 'or', 'en', 'za', 'mi', 'dra', 'qu', 'el', 'tor', 'sa', 'ny', 'ix', 'ba', 'lo', 'he', 'ri', 'os', 'ta'];
const TRAITS = ['Ice-locked', 'Storm-wracked', 'Tidally locked', 'Dense jungle', 'Ruins on the surface', 'Radio silent', 'Strong magnetic field',
  'Old mining scars', 'Unstable orbit', 'Breathable air', 'Toxic haze', 'Faint distress signal', 'Rich in volatiles', 'Shattered crust',
  'Abandoned beacons', 'Slow rotation', 'Glittering debris', 'Warm oceans', 'Deep canyons', 'Dust rings', 'Heavy gravity', 'Thin atmosphere',
  'Signs of recent visitors', 'Salvage field', 'Strange lights'];
const POPS = ['None', 'None', 'None', 'Automated', 'Outpost', 'Outpost', 'Colony', 'Settled', 'Unknown'];
const pick = (a, r) => a[Math.floor(r() * a.length)];
export function genName(r = Math.random) {
  let n = ''; const c = 2 + Math.floor(r() * 2);
  for (let i = 0; i < c; i++) n += pick(SYL, r);
  n = n[0].toUpperCase() + n.slice(1);
  return r() < 0.45 ? `${n} ${pick(['II', 'III', 'IV', 'V', 'VI', 'Prime', 'Minor'], r)}` : n;
}
export function genBody(sector, r = Math.random) {
  let w = r() * WEIGHTS.reduce((a, b) => a + b, 0), ti = 0;
  while ((w -= WEIGHTS[ti]) > 0) ti++;
  const type = TYPES[ti];
  const inhabitable = ['Planet', 'Moon', 'Station'].includes(type);
  return {
    name: genName(r), type, sector, x: +(0.14 + r() * 0.72).toFixed(2), y: +(0.08 + r() * 0.74).toFixed(2),
    haz: Math.floor(r() * 6), rich: Math.floor(r() * 6), pop: inhabitable ? pick(POPS, r) : 'None', trait: pick(TRAITS, r), note: '', gm: '', hidden: false,
  };
}
export const bodiesIn = (s, sector) => Object.entries(s.map?.bodies || {}).filter(([, b]) => b.sector === sector);
export function opGenerate(s, sector, count, r = Math.random) {
  const u = {};
  for (let i = 0; i < count; i++) u[`map/bodies/${uid()}`] = genBody(sector, r);
  return u;
}
// Time advances: the convoy moves `step` sectors on. Space newly inside scanner range
// is filled in if nobody charted it by hand. What falls behind the window is lost.
export function opAdvance(s, step, who, r = Math.random) {
  const m = mapCfg(s), pos = (s.map?.pos || 0) + step;
  let u = { 'map/pos': pos };
  if (step > 0 && m.autoGen) {
    for (let sec = pos + 1; sec <= pos + m.ahead; sec++) {
      if (!bodiesIn(s, sec).length) u = { ...u, ...opGenerate(s, sec, m.genMin + Math.floor(r() * (m.genMax - m.genMin + 1)), r) };
    }
  }
  return logTo(u, `${who} ${step > 0 ? 'advanced' : 'rewound'} the convoy to sector ${pos}`);
}

/* ---------- a fresh convoy ---------- */
export function newGame(name, tables) {
  const holders = {};
  for (let i = 1; i <= tables; i++) holders[`t${i}`] = { name: `Table ${i}`, kind: 'ship', order: i };
  const f = (label, type, order, max) => (max ? { label, type, order, max } : { label, type, order });
  let s = {
    meta: { name: name || 'Convoy', at: Date.now() },
    settings: { pin: '', playersUseShip: true, playersSeeAll: false, map: { ...MAP_DEFAULTS } },
    holders,
    templates: {
      ship: { hull: f('Hull', 'track', 1, 10), shields: f('Shields', 'track', 2, 5), morale: f('Morale', 'track', 3, 5), crew: f('Crew', 'num', 4), captain: f('Captain', 'text', 5), notes: f('Notes', 'long', 6) },
      char: { role: f('Role', 'text', 1), health: f('Health', 'track', 2, 5), stress: f('Stress', 'track', 3, 5), skills: f('Skills', 'long', 4), notes: f('Notes', 'long', 5) },
    },
    map: { pos: 0 },
  };
  for (let sec = 0; sec <= MAP_DEFAULTS.ahead; sec++) s = applyUpdates(s, opGenerate(s, sec, 1 + Math.floor(Math.random() * 3))).state;
  return s;
}
