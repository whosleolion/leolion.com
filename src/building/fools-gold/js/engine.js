// Price engine: Query -> Estimate. Pure functions. Deterministic.
import {
  RARITY_CURVES, TIER_FACTORS, TIER_WHY, BULK, GROUPS, INTERACTIONS, STACK_WEIGHTS,
} from './data.js';
import { niceRound } from './money.js';

const DAYS = { day: 1, night: 1, week: 7, month: 30 };
const MILES = { mile: 1, league: 3 };
export const DEFAULT_DIALS = { priceLevel: 1, volatility: 0.5, stacking: 'dampened', sellFraction: 0.5 };
const mid = (lo, hi) => Math.sqrt(lo * hi);
const KIND_WORD = { good: 'goods', service: 'services', labor: 'hired labor', travel: 'travel', lodging: 'lodging', spell: 'spellcasting', property: 'property' };

export function tierClass(entry) {
  if (entry.kind === 'travel') return 'travel';
  if (entry.kind === 'lodging' || (entry.tags || []).includes('meal')) return 'lodging';
  if (['service', 'labor', 'spell'].includes(entry.kind)) return 'service';
  return 'good';
}

export function findConflicts(mods) {
  const byGroup = {};
  for (const m of mods) (byGroup[m.group] ||= []).push(m);
  const out = [];
  for (const [g, list] of Object.entries(byGroup)) {
    if (GROUPS[g]?.exclusive && list.length > 1) out.push({ group: g, ids: list.map(m => m.id), labels: list.map(m => m.label) });
  }
  return out;
}

function ruleMatches(rule, entry) {
  const tagOk = !rule.tags || rule.tags.some(t => (entry.tags || []).includes(t));
  const kindOk = !rule.kinds || rule.kinds.includes(entry.kind);
  return tagOk && kindOk;
}
function bulkFactor(n) {
  for (const [min, f] of BULK) if (n >= min) return f;
  return [1, 1];
}

export function applicable(m, entry, side) {
  if (!m.kinds.includes(entry.kind)) return false;
  if (side && m.sides && !m.sides.includes(side)) return false;
  if (m.goodTags && entry.kind === 'good' && !(entry.tags || []).some(t => m.goodTags.includes(t))) return false;
  return true;
}

export function estimate(q, ctx) {
  const w = ctx.world;
  const dials = { ...DEFAULT_DIALS, ...(w.dials || {}) };
  const entry = ctx.byId.get(q.subject);
  if (!entry) return { ok: false, error: 'no-subject' };
  const selected = (q.mods || []).map(id => ctx.mods.get(id)).filter(Boolean);
  const conflicts = findConflicts(selected);
  if (conflicts.length) return { ok: false, error: 'conflict', conflicts };

  const notes = [], assumptions = [], factors = [];
  const kind = entry.kind;
  const side = q.action === 'sell' && (kind === 'good' || kind === 'property') ? 'sell' : 'buy';
  if (q.action === 'sell' && !(kind === 'good' || kind === 'property')) notes.push('Selling a service means charging for it, so this is what you could ask.');

  let lo, hi;
  const push = (f) => {
    lo *= f.lo; hi *= f.hi;
    factors.push({ ...f, runLo: lo, runHi: hi });
  };

  // ---- base ----
  let baseLo, baseHi, baseLabel, unitWord = '';
  if (entry.curve) {
    const r = q.rarity || 'common';
    if (!q.rarity) assumptions.push({ id: 'rarity', text: 'Rarity not stated, so I assumed common.' });
    const c = RARITY_CURVES[entry.curve];
    const m = c.mid[r] * (entry.scale || 1);
    baseLo = m * c.band[0]; baseHi = m * c.band[1];
    baseLabel = entry.name + ', ' + r;
  } else {
    const per = entry.perMile && entry.mpd ? entry.perMile * entry.mpd : entry.bu;
    const sp = entry.spread ?? (entry.src === 'user' ? 0.15 : 0.1);
    baseLo = per * (1 - sp); baseHi = per * (1 + sp);
    baseLabel = entry.name;
    if (q.rarity) notes.push(entry.name + ' has its own fixed price, so I ignored the rarity word.');
  }
  lo = baseLo; hi = baseHi;
  if (!(baseLo > 0) || !isFinite(baseHi)) return { ok: false, error: 'bad-price' };
  const perUnit = entry.unit === 'day' ? 'per day' : entry.unit === 'lb' ? 'per lb' : entry.unit === 'each' && !entry.isCategory ? 'each' : 'each';
  factors.push({ kind: 'base', label: baseLabel + ' (' + perUnit + ')', lo: baseLo, hi: baseHi, runLo: lo, runHi: hi, abs: true, why: entry.basis || (entry.src === 'srd' ? 'SRD price.' : entry.src === 'user' ? 'Your price.' : 'Fool\'s Gold price.') });

  // ---- quantity / length ----
  const qty = q.qty ? { lo: q.qty.lo, hi: q.qty.hi ?? q.qty.lo } : { lo: 1, hi: 1 };
  let unitsText = null;
  if (entry.unit === 'day') {
    let dLo = 1, dHi = 1, word = entry.kind === 'lodging' ? 'night' : 'day';
    if (!q.span) {
      assumptions.push({ id: 'span', text: 'Length not stated, so I priced 1 ' + word + '.' });
    } else {
      const s = q.span;
      if (DAYS[s.unit]) { dLo = s.lo * DAYS[s.unit]; dHi = s.hi * DAYS[s.unit]; }
      else if (MILES[s.unit]) {
        if (entry.mpd) {
          dLo = s.lo * MILES[s.unit] / entry.mpd; dHi = s.hi * MILES[s.unit] / entry.mpd;
          notes.push(Math.round(s.lo * MILES[s.unit]) + (s.lo !== s.hi ? ' to ' + Math.round(s.hi * MILES[s.unit]) : '') + ' miles at about ' + entry.mpd + ' miles a day is ' + (+dLo.toFixed(2)) + (dLo !== dHi ? ' to ' + (+dHi.toFixed(2)) : '') + ' days.');
        } else { notes.push('Distance doesn\'t apply to ' + entry.name.toLowerCase() + ', so I priced 1 ' + word + '.'); assumptions.push({ id: 'span', text: 'Length not stated, so I priced 1 ' + word + '.' }); }
      }
    }
    if (dLo !== 1 || dHi !== 1) push({ kind: 'qty', label: '× ' + (dLo === dHi ? +dLo.toFixed(2) : +dLo.toFixed(2) + ' to ' + +dHi.toFixed(2)) + ' ' + word + (dHi === 1 ? '' : 's'), lo: dLo, hi: dHi, why: 'Length of the booking.' });
    if (qty.lo !== 1 || qty.hi !== 1) push({ kind: 'qty', label: '× ' + (qty.lo === qty.hi ? qty.lo : qty.lo + ' to ' + qty.hi) + (kind === 'labor' ? ' workers' : ' people'), lo: qty.lo, hi: qty.hi, why: 'Number of people.' });
  } else {
    if (q.span && entry.perDay && DAYS[q.span.unit]) {
      const dl = q.span.lo * DAYS[q.span.unit], dh = q.span.hi * DAYS[q.span.unit];
      push({ kind: 'qty', label: '× ' + (dl === dh ? dl : dl + ' to ' + dh) + ' days', lo: dl, hi: dh, why: 'Priced per day.' });
    } else if (q.span && !q.span.implied) notes.push('A length of time doesn\'t apply to ' + entry.name.toLowerCase() + ', so I ignored it.');
    else if (q.span) notes.push('"' + q.span.unit + '" doesn\'t apply to ' + entry.name.toLowerCase() + ', so I ignored it.');
    if (q.qty && q.qty.unit === 'lb' && entry.unit !== 'lb') notes.push(entry.name + ' is not sold by weight here, so I read the number as a count.');
    if (qty.lo !== 1 || qty.hi !== 1) push({ kind: 'qty', label: '× ' + (qty.lo === qty.hi ? qty.lo : qty.lo + ' to ' + qty.hi) + (entry.unit === 'lb' ? ' lb' : ''), lo: qty.lo, hi: qty.hi, why: 'How many.' });
  }

  // ---- selling fraction ----
  if (side === 'sell') {
    const f = entry.sellFraction ?? dials.sellFraction;
    push({ kind: 'side', label: 'Selling, not buying', lo: f * 0.9, hi: f * 1.1, why: f >= 1 ? 'Trade goods sell at about full value.' : 'Shops pay about ' + Math.round(f * 100) + '% of the price they sell at.' });
  } else if (q.action === 'value') {
    notes.push('This is the fair market value, not what a shop would pay you.');
  }

  // ---- tier ----
  if (q.tier && q.tier !== 'standard') {
    const cls = tierClass(entry);
    const f = TIER_FACTORS[cls][q.tier];
    push({ kind: 'tier', label: q.tier + ' class', lo: f[0], hi: f[1], why: TIER_WHY[cls][q.tier] });
  } else if (!q.tier && ['travel', 'lodging', 'service', 'labor', 'spell'].includes(kind)) {
    assumptions.push({ id: 'tier', text: 'Class not stated, so I priced the standard level.' });
  }

  // ---- world economy ----
  for (const tid of w.economyTags || []) {
    const tag = ctx.econ.get(tid);
    if (!tag) continue;
    const hits = tag.categories.filter(r => ruleMatches(r, entry)).map(r => r.f);
    if (!hits.length) continue;
    hits.sort((a, b) => Math.abs(Math.log(mid(b[0], b[1]))) - Math.abs(Math.log(mid(a[0], a[1]))));
    const wts = [1, 0.6, 0.4];
    let fl = 1, fh = 1;
    hits.forEach((f, i) => { const wt = wts[i] ?? 0.3; fl *= Math.pow(f[0], wt); fh *= Math.pow(f[1], wt); });
    push({ kind: 'world', label: tag.label, lo: fl, hi: fh, why: tag.describe });
  }
  if (dials.priceLevel !== 1) push({ kind: 'world', label: 'World price level', lo: dials.priceLevel, hi: dials.priceLevel, why: 'Your world-wide price setting.' });

  // ---- bulk ----
  if (kind === 'good' && (entry.unit === 'each' || entry.unit === 'lb') && (qty.lo >= 10 || qty.hi >= 10)) {
    const a = bulkFactor(qty.lo)[0], b = bulkFactor(qty.hi)[1];
    if (a !== 1 || b !== 1) push({ kind: 'bulk', label: 'Large quantity', lo: a, hi: b, why: side === 'sell' ? 'Dumping a lot at once pushes the price down.' : 'Buying in volume earns a discount.' });
  }

  // ---- modifiers ----
  const list = [];
  for (const m of selected) {
    if (!applicable(m, entry, side)) { notes.push('"' + m.label + '" doesn\'t apply to ' + (KIND_WORD[kind] || kind) + (m.goodTags && kind === 'good' ? ' like this' : '') + ', so I left it out.'); continue; }
    const r = (side === 'sell' && m.sell) ? m.sell : m.buy;
    let a = r[0], b = r[1];
    for (const tb of m.tagBoost || []) {
      const hit = ((tb.tags && (entry.tags || []).some(t => tb.tags.includes(t))) || (tb.kinds && tb.kinds.includes(kind))) && (!tb.sides || tb.sides.includes(side));
      if (hit) { a *= tb.f[0]; b *= tb.f[1]; }
    }
    list.push({ m, lo: a, hi: b, size: Math.abs(Math.log(mid(a, b))) });
  }
  list.sort((x, y) => y.size - x.size);
  const strict = dials.stacking === 'strict';
  const ids = list.map(x => x.m.id);
  list.forEach((x, i) => {
    let wt = strict ? 1 : (STACK_WEIGHTS[i] ?? 0.15);
    if (!strict && i > 0) {
      for (const [a, b, s] of INTERACTIONS) {
        if ((x.m.id === a && ids.includes(b)) || (x.m.id === b && ids.includes(a))) wt *= s;
      }
    }
    const effLo = Math.pow(x.lo, wt), effHi = Math.pow(x.hi, wt);
    push({ kind: 'mod', id: x.m.id, group: x.m.group, label: x.m.label, lo: x.lo, hi: x.hi, effLo, effHi, weight: wt, why: x.m.why, _eff: true });
    // push() used raw lo/hi; correct with the dampened values
  });
  // The loop above multiplied raw factors; redo the modifier part with effective values.
  recompute();

  function recompute() {
    let L = baseLo, H = baseHi;
    for (const f of factors) {
      if (f.kind === 'base') { f.runLo = L; f.runHi = H; continue; }
      const a = f._eff ? f.effLo : f.lo, b = f._eff ? f.effHi : f.hi;
      L *= a; H *= b; f.runLo = L; f.runHi = H;
    }
    lo = L; hi = H;
  }

  // ---- volatility ----
  const typ0 = mid(lo, hi);
  const e = Math.min(2, Math.max(0, dials.volatility * 2));
  const lo2 = typ0 * Math.pow(lo / typ0, e), hi2 = typ0 * Math.pow(hi / typ0, e);
  const typical = niceRound(typ0), low = Math.min(niceRound(lo2), typical), high = Math.max(niceRound(hi2), typical);

  // per-unit and sense check
  const out = { ok: true, entry, side, typical, lo: low, hi: high, factors, notes, assumptions, qty };
  const qMid = mid(qty.lo, qty.hi);
  if (entry.unit !== 'day' && qMid > 1 && !entry.perDay) { out.each = niceRound(typ0 / qMid); out.eachLabel = entry.unit === 'lb' ? 'per lb' : 'each'; }
  const wage = w.anchors?.wage;
  if (wage > 0) {
    const days = typ0 / wage;
    if (days >= 0.5) out.sense = 'About ' + (days < 10 ? +days.toFixed(1) : Math.round(days)) + ' day' + (days < 1.05 ? '' : 's') + ' of unskilled wages.';
  }
  return out;
}
