// The typed sentence as editable fields. Pure logic: given a Query, the Estimate and the world, list the fields
// (item, deal, amount, rarity, class, and the circumstance groups that apply), say which are set, and price
// every option so an empty field can show how far it would move the answer.
import { GROUPS, RARITIES, TIER_NAMES, FAMILIES } from './data.js?v=92d0321e';
import { estimate, applicable, timeUnit } from './engine.js?v=92d0321e';

const clone = q => JSON.parse(JSON.stringify(q));
const ORDER = {
  good: ['place', 'channel', 'condition', 'supply', 'relationship', 'urgency', 'order', 'events', 'provenance'],
  service: ['place', 'urgency', 'relationship', 'channel', 'events'],
  labor: ['place', 'urgency', 'relationship', 'channel', 'events'],
  spell: ['place', 'urgency', 'channel', 'relationship', 'events'],
  lodging: ['place', 'relationship', 'events'],
  travel: ['route', 'urgency', 'events'],
  property: ['place', 'condition', 'channel', 'events'],
};
// token colors in the sentence follow the field's role
export const ROLE = { item: 'item', deal: 'act', length: 'len', people: 'len', qty: 'len', rarity: 'class', tier: 'class', place: 'where', route: 'where', urgency: 'speed', condition: 'class', order: 'class', channel: 'who', relationship: 'who', supply: 'who', events: 'who', provenance: 'who' };
export const GROUP_ROLE = group => ROLE[group] || 'who';
const MAX_EMPTY_SHOWN = 3;
const QTY_STEPS = [1, 2, 5, 10, 20, 50, 100];
const PEOPLE_STEPS = [1, 2, 3, 5, 10];
const SPANS = { day: [1, 3, 7, 30], week: [1, 2, 4, 12], month: [1, 3, 6, 12], year: [1, 2, 4] };

export function buildFields(q, est, ctx) {
  if (!est || !est.ok) return { slots: [], shown: [], more: [] };
  const entry = est.entry, kind = entry.kind, base = est.typical;
  const side = est.side;
  const slots = [];
  const run = patch => { const q2 = clone(q); patch(q2); const e = estimate(q2, ctx); return e.ok ? e : null; };
  const opt = (key, label, patch, sel) => {
    const e = run(patch);
    return e ? { key: String(key), label, typical: e.typical, lo: e.lo, hi: e.hi, delta: e.typical / base - 1, apply: patch, sel: !!sel } : null;
  };
  const finish = (s) => {
    s.options = s.options.filter(Boolean);
    const prices = [base, ...s.options.map(o => o.typical)];
    s.swing = [Math.min(...prices), Math.max(...prices)];
    s.ratio = s.swing[1] / Math.max(1e-9, s.swing[0]);
    slots.push(s);
    return s;
  };
  const noAction = x => { x.assumed = x.assumed.filter(a => a !== 'action'); };

  // item
  finish({ id: 'item', label: 'Item', role: 'item', kind: 'item', filled: true, value: entry.name, assumed: q.assumed.includes('mode') ? 'travel mode' : null, always: true, options: [] });

  // deal: buying, selling or appraising
  if (kind === 'good' || kind === 'property') {
    const act = q.assumed.includes('action');
    finish({ id: 'deal', label: 'Deal', role: 'deal', kind: 'choice', filled: !act, value: { buy: 'buying', sell: 'selling', value: 'appraising' }[q.action], assumed: act ? 'usual' : null, always: act,
      options: [['buy', 'buying'], ['sell', 'selling'], ['value', 'appraising']].map(([a, l]) => opt(a, l, x => { x.action = a; noAction(x); }, !act && q.action === a)) });
  }

  // amount: length and people for time-priced things, a quantity for the rest
  const tu = timeUnit(entry);
  if (tu) {
    const sp = q.span, word = tu.word;
    finish({ id: 'length', label: 'Length', role: 'len', kind: 'number', filled: !!sp, value: sp ? (sp.lo === sp.hi ? sp.lo : sp.lo + ' to ' + sp.hi) + ' ' + sp.unit + (sp.hi === 1 ? '' : 's') : null, assumed: sp ? null : '1 ' + word, always: true,
      units: [['day', 'days'], ['week', 'weeks'], ['month', 'months'], ['year', 'years'], ...(entry.mpd ? [['mile', 'miles']] : [])],
      options: SPANS[tu.unit].map(n => opt(n, n + ' ' + word + (n === 1 ? '' : 's'), x => { x.span = { lo: n, hi: n, unit: tu.unit }; }, sp && sp.lo === n && sp.hi === n && (sp.unit === tu.unit || (tu.unit === 'day' && sp.unit === 'night')))) });
    finish({ id: 'people', label: kind === 'labor' ? 'Workers' : 'People', role: 'len', kind: 'number', filled: !!q.qty, value: q.qty ? String(q.qty.lo === q.qty.hi ? q.qty.lo : q.qty.lo + ' to ' + q.qty.hi) : null, assumed: q.qty ? null : '1',
      options: PEOPLE_STEPS.map(n => opt(n, String(n), x => { x.qty = n === 1 ? null : { lo: n, hi: n }; }, q.qty ? q.qty.lo === n && q.qty.hi === n : n === 1)) });
  } else {
    const lb = entry.unit === 'lb';
    finish({ id: 'qty', label: lb ? 'Pounds' : 'Quantity', role: 'len', kind: 'number', filled: !!q.qty, value: q.qty ? String(q.qty.lo === q.qty.hi ? q.qty.lo : q.qty.lo + ' to ' + q.qty.hi) : null, assumed: q.qty ? null : '1', always: true,
      options: QTY_STEPS.map(n => opt(n, String(n), x => { x.qty = n === 1 ? null : { lo: n, hi: n, unit: lb ? 'lb' : undefined }; }, q.qty ? q.qty.lo === n && q.qty.hi === n : n === 1)) });
  }

  // rarity and class
  if (entry.curve) {
    finish({ id: 'rarity', label: 'Rarity', role: 'class', kind: 'choice', filled: !!q.rarity, value: q.rarity, assumed: q.rarity ? null : 'common', always: true,
      options: RARITIES.map(r => opt(r, r, x => { x.rarity = r; }, q.rarity === r || (!q.rarity && r === 'common'))) });
  }
  if (!entry.noTier && ['travel', 'lodging', 'service', 'labor', 'spell'].includes(kind)) {
    finish({ id: 'tier', label: 'Class', role: 'class', kind: 'choice', filled: !!q.tier, value: q.tier, assumed: q.tier ? null : 'standard',
      options: TIER_NAMES.map(t => opt(t, t, x => { x.tier = t; }, q.tier === t || (!q.tier && t === 'standard'))) });
  }

  // circumstances, by group
  for (const g of ORDER[kind] || []) {
    const mods = ctx.modList.filter(m => m.group === g && applicable(m, entry, side) && !(g === 'route' && m.id === 'border'));
    if (!mods.length) continue;
    if (g === 'events' && kind === 'travel') { /* border sits in events for travel */ }
    const have = q.mods.filter(id => ctx.mods.get(id)?.group === g);
    const exclusive = GROUPS[g].exclusive;
    finish({ id: 'g:' + g, label: GROUPS[g].ask, role: GROUP_ROLE(g), kind: 'choice', group: g, filled: have.length > 0, value: have.map(id => ctx.mods.get(id).label).join(', '), assumed: null, low: g === 'events' || g === 'provenance',
      options: mods.map(m => {
        const on = q.mods.includes(m.id);
        return opt(m.id, m.label, x => {
          if (on) x.mods = x.mods.filter(z => z !== m.id);
          else { if (exclusive) x.mods = x.mods.filter(z => ctx.mods.get(z)?.group !== g); x.mods.push(m.id); }
        }, on);
      }) });
  }

  // what to show: set fields and always-visible fields first, then the few empty ones that move the price most
  const emptyCand = slots.filter(s => !s.filled && !s.always && s.options.length > 1 && s.ratio >= 1.2 && !(s.low)).sort((a, b) => b.ratio - a.ratio).slice(0, MAX_EMPTY_SHOWN).map(s => s.id);
  const shown = slots.filter(s => s.filled || s.always || emptyCand.includes(s.id));
  const more = slots.filter(s => !shown.includes(s) && s.options.length > 0);
  return { slots, shown, more };
}

// A custom number from the field editor (length, people, quantity).
export function applyNumber(q, slotId, n, unit, entry) {
  if (!(n > 0) || !isFinite(n)) return q;
  const x = clone(q);
  if (slotId === 'length') x.span = { lo: n, hi: n, unit: unit || (timeUnit(entry) || {}).unit || 'day' };
  else x.qty = n === 1 ? null : { lo: n, hi: n, unit: entry && entry.unit === 'lb' && slotId === 'qty' ? 'lb' : undefined };
  return x;
}

// Colors for each word of the typed sentence, from the parser's parts.
export function tokenRoles(parts, ctx) {
  const out = [];
  for (const p of parts || []) {
    if (p.k === 'c') {
      let role = 'item';
      if (p.type === 'action') role = 'act';
      else if (p.type === 'rarity' || p.type === 'tier') role = 'class';
      else if (p.type === 'unit' || p.type === 'count' || p.type === 'money') role = 'len';
      else if (p.type === 'mod') { const m = ctx.mods.get(p.id); role = m ? GROUP_ROLE(m.group) : 'who'; }
      out.push({ start: p.start, end: p.end, role });
    } else if (p.k === 'n') out.push({ start: p.start, end: p.end, role: 'len' });
    else if (p.k === 'u') out.push({ start: p.start, end: p.end, role: 'bad' });
  }
  return out.filter(t => t.start != null).sort((a, b) => a.start - b.start);
}
export { FAMILIES };
