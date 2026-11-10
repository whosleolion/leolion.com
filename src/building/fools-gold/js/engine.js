// Price engine: Query -> Estimate. Pure functions. Deterministic.
import {
  RARITY_CURVES, TIER_FACTORS, TIER_WHY, BULK, GROUPS, INTERACTIONS, STACK_WEIGHTS,
} from './data.js?v=230c05ca';
import { niceRound } from './money.js?v=230c05ca';

const DAYS = { day: 1, night: 1, week: 7, month: 30, year: 365 };
// Entries priced per time unit: how many days one unit is, and the word to show.
export function timeUnit(entry) {
  const days = { day: 1, week: 7, month: 30, year: 365 }[entry.unit];
  if (!days) return null;
  return { days, word: entry.unit === 'day' && entry.kind === 'lodging' ? 'night' : entry.unit, unit: entry.unit };
}
const MILES = { mile: 1, league: 3 };
export const DEFAULT_DIALS = { priceLevel: 1, volatility: 0.5, stacking: 'dampened', sellFraction: 0.5 };
const mid = (lo, hi) => Math.sqrt(lo * hi);
const KIND_WORD = { good: 'goods', service: 'services', labor: 'hired labor', travel: 'travel', lodging: 'lodging', spell: 'spellcasting', property: 'property' };

const tu0 = e => timeUnit(e);
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
  // edits: this question's overrides (q.overrides) win over the world's saved adjustments (world.overrides)
  const ov = q.overrides || {}, wov = w.overrides || {};
  const wbase = (w.baseOverrides && w.baseOverrides[entry.id]) || 0;
  const fo = key => (ov.f && ov.f[key]) || wov[key] || null;
  const foSaved = key => !(ov.f && ov.f[key]) && !!wov[key];
  const kind = entry.kind;
  const side = q.action === 'sell' && (kind === 'good' || kind === 'property') ? 'sell' : 'buy';
  if (q.action === 'sell' && !(kind === 'good' || kind === 'property')) notes.push('Selling a service: this is what you could charge.');

  let lo, hi;
  const push = (f) => {
    lo *= f.lo; hi *= f.hi;
    factors.push({ ...f, runLo: lo, runHi: hi });
  };

  // ---- base ----
  let baseLo, baseHi, baseLabel, unitWord = '', baseMid = 0;
  if (entry.curve) {
    const r = q.rarity || 'common';
    if (!q.rarity) assumptions.push({ id: 'rarity', text: 'common rarity' });
    const c = RARITY_CURVES[entry.curve];
    const m = ov.base > 0 ? ov.base : c.mid[r] * (entry.scale || 1); // rarity-priced entries cannot take a world base price
    baseMid = m;
    baseLo = m * c.band[0]; baseHi = m * c.band[1];
    baseLabel = entry.name + ', ' + r;
  } else {
    const per = ov.base > 0 ? ov.base : wbase > 0 ? wbase : entry.perMile && entry.mpd ? entry.perMile * entry.mpd : entry.bu;
    baseMid = per;
    const sp = entry.spread ?? (entry.src === 'user' ? 0.15 : 0.1);
    baseLo = per * (1 - sp); baseHi = per * (1 + sp);
    baseLabel = entry.name;
    if (q.rarity) notes.push(entry.name + ' has a fixed price; rarity ignored.');
  }
  lo = baseLo; hi = baseHi;
  if (!(baseLo > 0) || !isFinite(baseHi)) return { ok: false, error: 'bad-price' };
  const perUnit = tu0(entry) ? 'per ' + tu0(entry).word :  entry.unit === 'lb' ? 'per lb' : entry.unit === 'each' && !entry.isCategory ? 'each' : 'each';
  factors.push({ kind: 'base', label: baseLabel + ' (' + perUnit + ')', lo: baseLo, hi: baseHi, runLo: lo, runHi: hi, abs: true, key: 'base', mid: baseMid, edited: ov.base > 0 || (wbase > 0 && !entry.curve), saved: !(ov.base > 0) && wbase > 0 && !entry.curve, why: entry.basis || (entry.src === 'srd' ? 'SRD price.' : entry.src === 'user' ? 'Your price.' : 'Fool\'s Gold price.') });

  // ---- quantity / length ----
  const qty = q.qty ? { lo: q.qty.lo, hi: q.qty.hi ?? q.qty.lo } : { lo: 1, hi: 1 };
  let unitsText = null;
  const tu = timeUnit(entry);
  if (tu) {
    let dLo = 1, dHi = 1, word = tu.word;
    if (!q.span) {
      assumptions.push({ id: 'span', text: '1 ' + word });
    } else {
      const s = q.span;
      if (DAYS[s.unit]) { dLo = s.lo * DAYS[s.unit] / tu.days; dHi = s.hi * DAYS[s.unit] / tu.days; }
      else if (MILES[s.unit]) {
        if (entry.mpd) {
          dLo = s.lo * MILES[s.unit] / entry.mpd / tu.days; dHi = s.hi * MILES[s.unit] / entry.mpd / tu.days;
          notes.push(Math.round(s.lo * MILES[s.unit]).toLocaleString('en-US') + (s.lo !== s.hi ? ' to ' + Math.round(s.hi * MILES[s.unit]).toLocaleString('en-US') : '') + ' miles is about ' + (+(dLo * tu.days).toFixed(2)) + (dLo !== dHi ? ' to ' + (+(dHi * tu.days).toFixed(2)) : '') + ' days at ' + entry.mpd.toLocaleString('en-US') + ' miles a day.');
        } else { notes.push('Distance ignored: ' + entry.name.toLowerCase() + ' is not priced by distance.'); assumptions.push({ id: 'span', text: '1 ' + word }); }
      }
    }
    if (dLo !== 1 || dHi !== 1) push({ kind: 'qty', label: '× ' + (dLo === dHi ? +dLo.toFixed(2) : +dLo.toFixed(2) + ' to ' + +dHi.toFixed(2)) + ' ' + word + (dHi === 1 ? '' : 's'), lo: dLo, hi: dHi, why: '' });
    if (qty.lo !== 1 || qty.hi !== 1) push({ kind: 'qty', label: '× ' + (qty.lo === qty.hi ? qty.lo : qty.lo + ' to ' + qty.hi) + (kind === 'labor' ? ' workers' : ' people'), lo: qty.lo, hi: qty.hi, why: '' });
  } else {
    if (q.span && entry.perDay && DAYS[q.span.unit]) {
      const dl = q.span.lo * DAYS[q.span.unit], dh = q.span.hi * DAYS[q.span.unit];
      push({ kind: 'qty', label: '× ' + (dl === dh ? dl : dl + ' to ' + dh) + ' days', lo: dl, hi: dh, why: '' });
    } else if (q.span) notes.push('Length ignored: ' + entry.name.toLowerCase() + ' is not priced by time.');
    if (q.qty && q.qty.unit === 'lb' && entry.unit !== 'lb') notes.push(entry.name + ' is not sold by weight, so "' + q.qty.lo + ' lb" is counted as ' + q.qty.lo + '.');
    if (qty.lo !== 1 || qty.hi !== 1) push({ kind: 'qty', label: '× ' + (qty.lo === qty.hi ? qty.lo : qty.lo + ' to ' + qty.hi) + (entry.unit === 'lb' ? ' lb' : ''), lo: qty.lo, hi: qty.hi, why: '' });
  }

  // ---- selling fraction ----
  if (side === 'sell') {
    const f = entry.sellFraction ?? dials.sellFraction;
    const o = fo('side');
    push({ kind: 'side', key: 'side', edited: !!o, saved: foSaved('side'), label: 'Selling, not buying', lo: o ? o[0] : f * 0.9, hi: o ? o[1] : f * 1.1, why: f >= 1 ? 'Trade goods sell at about full value.' : 'Shops pay about ' + Math.round(f * 100) + '% of the price they sell at.' });
  } else if (q.action === 'value') {
    notes.push('Fair market value, not what a shop would pay.');
  }

  // ---- tier ----
  if (q.tier && q.tier !== 'standard') {
    const cls = tierClass(entry);
    const o = fo('tier:' + q.tier);
    const f = o || TIER_FACTORS[cls][q.tier];
    push({ kind: 'tier', key: 'tier:' + q.tier, edited: !!o, saved: foSaved('tier:' + q.tier), label: q.tier + ' class', lo: f[0], hi: f[1], why: TIER_WHY[cls][q.tier] });
  } else if (!q.tier && ['travel', 'lodging', 'service', 'labor', 'spell'].includes(kind)) {
    if (!entry.noTier) assumptions.push({ id: 'tier', text: 'standard class' });
  }

  // ---- world economy ----
  for (const tid of entry.fixed ? [] : (w.economyTags || [])) {
    const tag = ctx.econ.get(tid);
    if (!tag) continue;
    const hits = tag.categories.filter(r => ruleMatches(r, entry)).map(r => r.f);
    if (!hits.length) continue;
    hits.sort((a, b) => Math.abs(Math.log(mid(b[0], b[1]))) - Math.abs(Math.log(mid(a[0], a[1]))));
    const wts = [1, 0.6, 0.4];
    let fl = 1, fh = 1;
    hits.forEach((f, i) => { const wt = wts[i] ?? 0.3; fl *= Math.pow(f[0], wt); fh *= Math.pow(f[1], wt); });
    const o = fo('econ:' + tid);
    if (o) { fl = o[0]; fh = o[1]; }
    push({ kind: 'world', key: 'econ:' + tid, edited: !!o, saved: foSaved('econ:' + tid), label: tag.label, lo: fl, hi: fh, why: tag.describe });
  }
  if (dials.priceLevel !== 1 && !entry.fixed) push({ kind: 'world', label: 'World price level', lo: dials.priceLevel, hi: dials.priceLevel, why: 'Your world-wide price setting.' });

  // ---- bulk ----
  if (kind === 'good' && (entry.unit === 'each' || entry.unit === 'lb') && (qty.lo >= 10 || qty.hi >= 10)) {
    let a = bulkFactor(qty.lo)[0], b = bulkFactor(qty.hi)[1];
    const o = fo('bulk'); if (o) { a = o[0]; b = o[1]; }
    if (a !== 1 || b !== 1) push({ kind: 'bulk', key: 'bulk', edited: !!o, saved: foSaved('bulk'), label: 'Large quantity', lo: a, hi: b, why: side === 'sell' ? 'Dumping a lot at once pushes the price down.' : 'Buying in volume earns a discount.' });
  }

  // ---- modifiers ----
  const list = [];
  for (const m of selected) {
    if (!applicable(m, entry, side)) { notes.push('"' + m.label + '" does not apply to ' + (m.goodTags && kind === 'good' ? 'this item' : (KIND_WORD[kind] || kind)) + '. Left out.'); continue; }
    const r = (side === 'sell' && m.sell) ? m.sell : m.buy;
    let a = r[0], b = r[1];
    if (m.group === 'place' && entry.placeScale) { a = Math.pow(a, entry.placeScale); b = Math.pow(b, entry.placeScale); }
    for (const tb of m.tagBoost || []) {
      const hit = ((tb.tags && (entry.tags || []).some(t => tb.tags.includes(t))) || (tb.kinds && tb.kinds.includes(kind))) && (!tb.sides || tb.sides.includes(side));
      if (hit) { a *= tb.f[0]; b *= tb.f[1]; }
    }
    const o = fo('mod:' + m.id); if (o) { a = o[0]; b = o[1]; }
    list.push({ m, lo: a, hi: b, edited: !!o, saved: foSaved('mod:' + m.id), size: Math.abs(Math.log(mid(a, b))) });
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
    push({ kind: 'mod', key: 'mod:' + x.m.id, edited: x.edited, saved: x.saved, id: x.m.id, group: x.m.group, label: x.m.label, lo: x.lo, hi: x.hi, effLo, effHi, weight: wt, why: x.m.why, _eff: true });
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
  if (!timeUnit(entry) && qMid > 1 && !entry.perDay) { out.each = niceRound(typ0 / qMid); out.eachLabel = entry.unit === 'lb' ? 'per lb' : 'each'; }
  const wage = w.anchors?.wage;
  if (wage > 0) {
    const days = typ0 / wage;
    if (days >= 0.5) out.sense = 'About ' + (days < 10 ? +days.toFixed(1) : Math.round(days)) + ' day' + (days < 1.05 ? '' : 's') + ' of unskilled wages.';
  }
  return out;
}
