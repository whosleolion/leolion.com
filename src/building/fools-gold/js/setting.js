// Settings typed into the question box: "John's rent is $800 a month", "a healing potion costs 40 gp here".
// Recognized by plain patterns, never applied silently: the UI asks for confirmation first.
import { parse } from './parser.js?v=82a76fa1';
import { parseMoney, formatFull } from './money.js?v=82a76fa1';
import { estimate, timeUnit } from './engine.js?v=82a76fa1';
import { ACTION_TERMS } from './data.js?v=82a76fa1';

const QUESTION = /^(how|what|which|when|where|why|who|can|could|should|would|will|do|does|did)\b/i;
const VERB = /\s*(?:=|\bnow costs?\b|\bcosts?\b|\bsells? for\b|\bgoes for\b|\bpriced at\b|\bshould be\b|\bis now\b|\bare now\b|\bis\b|\bare\b|\bruns\b|\bto\b(?=\s*[$\d]))\s*/i;
const DAYS = { day: 1, night: 1, week: 7, month: 30, year: 365 };
const ACTION_WORDS = new Set(Object.values(ACTION_TERMS).flat());

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const clean = s => s.replace(/[.!]+$/g, '').replace(/\s+/g, ' ').trim();

export function parseSetting(text, ctx) {
  let t = clean(String(text || ''));
  if (!t || t.length > 160 || /\?/.test(t) || QUESTION.test(t)) return null;
  const lead = /^(set|make|change|update)\s+/i.exec(t);
  const imperative = !!lead;
  if (lead) t = t.slice(lead[0].length);
  const m = VERB.exec(t);
  if (!m || m.index === 0) return null;
  if (/^to$/i.test(m[0].trim()) && !imperative) return null;
  let left = t.slice(0, m.index).trim(), right = t.slice(m.index + m[0].length).trim();
  if (!left || !right) return null;

  // amount and the unit it is per
  right = right.replace(/\b(here|now|in this world|these days|usually|typically|nowadays|in my world|in my game)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  let per = null, each = false;
  const pm = /\s*(?:\/|\bper\s+|\ba\s+|\ban\s+|\bevery\s+)(day|night|week|month|year|lb|pound|piece|each)s?\b.*$/i.exec(right);
  if (pm) { per = pm[1].toLowerCase(); right = right.slice(0, pm.index).trim(); }
  if (/\b(each|apiece)$/i.test(right)) { each = true; right = right.replace(/\s*\b(each|apiece)$/i, ''); }
  if (per === 'each' || per === 'piece') { each = true; per = null; }
  if (per === 'pound') per = 'lb';
  if (per === 'night') per = 'day';
  const cur = ctx.world.currency;
  if (!/\d/.test(right)) return null;
  if (!cur.symbol && !/[a-z]/i.test(right)) return null; // a bare number could be anything
  const amount = parseMoney(right, cur);
  if (!(amount > 0)) return null;

  // the thing being priced
  left = left.replace(/^(the|a|an|my|our|current|price of|cost of|the price of|the cost of)\s+/gi, '').replace(/^(the|a|an|my|our)\s+/gi, '').trim();
  if (!left) return null;
  let owner = null, thing = left;
  const po = /^(.+?)[’']s\s+(.+)$/.exec(left);
  if (po && !/^(it|that|this|there|what|who|he|she)$/i.test(po[1])) { owner = po[1].trim(); thing = po[2].trim(); }
  const lr = parse(owner ? thing : left, ctx);
  if (lr.parts.some(p => p.k === 'c' && p.type === 'action' && ACTION_WORDS.has(p.p.display))) return null;
  const q = lr.query;
  const analog = q.subject ? ctx.byId.get(q.subject) : null;
  const novel = !!(owner || (analog && lr.unrecognized.length));

  // name
  let name;
  if (owner) name = cap(owner) + '’s ' + thing;
  else if (analog && !novel) name = analog.name;
  else name = cap(left.replace(/^\d+\s+/, ''));
  if (name.length > 60) return null;

  // unit and per-unit price
  let unit = 'each', perUnit = amount, note = '';
  const aTu = analog ? timeUnit(analog) : null;
  const statedTime = per && DAYS[per] ? per : null;
  if (aTu) {
    unit = analog.unit;
    if (statedTime) perUnit = amount * DAYS[unit === 'day' ? 'day' : unit] / DAYS[statedTime];
  } else if (statedTime) unit = statedTime === 'day' ? 'day' : statedTime;
  else if (per === 'lb') unit = 'lb';
  else if (analog && analog.unit === 'lb') unit = 'lb';
  const qty = q.qty && !q.qty.unit && q.qty.lo === q.qty.hi && q.qty.lo > 1 && !each && (unit === 'each' || unit === 'lb') ? q.qty.lo : 1;
  if (qty > 1) { perUnit = amount / qty; note = qty + ' for ' + formatFull(amount, cur) + ' is ' + formatFull(perUnit, cur) + ' each.'; }

  const rarityPriced = !!(analog && analog.curve);
  const viaBase = !!(analog && !novel && !rarityPriced);
  const kind = analog ? analog.kind : (unit === 'each' || unit === 'lb' ? 'good' : 'service');
  const tags = [...new Set([...(analog ? analog.tags : []), 'custom'])];
  const draft = {
    name, kind, unit, tags, aliases: [], spread: 0.03,
    noTier: !!(analog && analog.noTier),
    placeScale: !owner && analog && !rarityPriced && !novel ? analog.placeScale || 0 : 0,
    fixed: !!owner,
  };
  // what it costs today, for the confirmation line
  let current = null;
  if (viaBase) {
    const e = estimate({ action: 'buy', subject: analog.id, family: null, qty: null, span: null, rarity: null, tier: null, mods: [], assumed: [] }, ctx);
    if (e.ok) current = e.typical;
  }
  return { text: t, name, owner, thing, analog: analog ? { id: analog.id, name: analog.name } : null, viaBase, rarityPriced, unit, per: statedTime || (per === 'lb' ? 'lb' : null), perUnitBU: perUnit, amountBU: amount, qty, note, current, draft, kind };
}

// The base price (before economy tags) that makes the in-world price equal `target`.
export function baseFor(ctx, entryId, target) {
  const e = estimate({ action: 'buy', subject: entryId, family: null, qty: null, span: null, rarity: null, tier: null, mods: [], assumed: [], overrides: { base: target } }, ctx);
  if (!e.ok || !(e.typical > 0)) return target;
  return target * (target / e.typical);
}
export function storedFor(ctx, draft, target) {
  if (draft.fixed) return target;
  const tmp = { id: 'tmp.setting', src: 'user', basis: 'Added by you.', bu: target, ...draft };
  ctx.byId.set(tmp.id, tmp);
  try {
    const e = estimate({ action: 'buy', subject: tmp.id, family: null, qty: null, span: null, rarity: null, tier: null, mods: [], assumed: [] }, ctx);
    if (!e.ok || !(e.typical > 0)) return target;
    return target * (target / e.typical);
  } finally { ctx.byId.delete(tmp.id); }
}
