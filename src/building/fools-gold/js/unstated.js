// "What you didn't say": find the unstated factors that would move the price most.
import { MODIFIERS, GROUPS, RARITIES, TIER_NAMES, FAMILIES } from './data.js';
import { estimate, applicable } from './engine.js';

const ORDER = {
  good: ['place', 'channel', 'condition', 'supply', 'relationship', 'urgency'],
  service: ['place', 'urgency', 'relationship', 'channel'],
  labor: ['place', 'urgency', 'relationship', 'channel'],
  spell: ['place', 'urgency', 'channel', 'relationship'],
  lodging: ['place', 'relationship'],
  travel: ['route', 'urgency'],
  property: ['place', 'condition', 'channel'],
};
const clone = q => JSON.parse(JSON.stringify(q));

export function analyze(q, est, ctx) {
  if (!est.ok) return { assumptions: [], dimensions: [] };
  const entry = est.entry, kind = entry.kind;
  const base = est.typical;
  if (!(base > 0)) return { assumptions: est.assumptions, dimensions: [] };
  const dims = [];
  const run = (patch) => {
    const q2 = clone(q); patch(q2);
    const e2 = estimate(q2, ctx);
    return e2.ok ? e2 : null;
  };
  const mk = (id, ask, options, always) => {
    const opts = options.filter(o => o.est).map(o => ({ label: o.label, typical: o.est.typical, lo: o.est.lo, hi: o.est.hi, delta: o.est.typical / base - 1, apply: o.apply, sel: !!o.sel }));
    if (opts.length < 2 && !always) return;
    const prices = [base, ...opts.map(o => o.typical)];
    const ratio = Math.max(...prices) / Math.max(1e-9, Math.min(...prices));
    if (!always && ratio < 1.2) return;
    opts.sort((a, b) => a.typical - b.typical);
    dims.push({ id, ask, options: opts, ratio, always: !!always });
  };

  // assumptions that have a choice
  if (q.assumed.includes('action') && kind === 'good') {
    mk('side', 'Buying or selling?', [
      { label: 'buying', est: run(x => { x.action = 'buy'; x.assumed = x.assumed.filter(a => a !== 'action'); }), apply: x => { x.action = 'buy'; x.assumed = x.assumed.filter(a => a !== 'action'); } },
      { label: 'selling', est: run(x => { x.action = 'sell'; x.assumed = x.assumed.filter(a => a !== 'action'); }), apply: x => { x.action = 'sell'; x.assumed = x.assumed.filter(a => a !== 'action'); } },
    ], true);
  }
  if (q.assumed.includes('mode') && q.family) {
    const fam = FAMILIES.find(f => f.id === q.family);
    const sibs = ctx.entries.filter(e => e.group === fam.id);
    mk('mode', 'Which mode of travel?', sibs.map(s => {
      const f = x => { x.subject = s.id; x.family = null; x.assumed = x.assumed.filter(a => a !== 'mode'); };
      return { label: s.name.replace(/ passage$/, '').toLowerCase(), est: run(f), apply: f, sel: s.id === q.subject };
    }), true);
  }
  if (entry.curve && !q.rarity) {
    mk('rarity', 'How rare is it?', RARITIES.map(r => {
      const f = x => { x.rarity = r; };
      return { label: r, est: run(f), apply: f };
    }), true);
  }
  if (!q.tier && ['travel', 'lodging', 'service', 'labor', 'spell'].includes(kind)) {
    mk('tier', 'What class?', TIER_NAMES.map(t => {
      const f = x => { x.tier = t; };
      return { label: t, est: run(f), apply: f, sel: t === 'standard' };
    }), false);
  }
  if (entry.unit === 'day' && !q.span) {
    const word = kind === 'lodging' ? 'night' : 'day';
    const units = [[1, word], [3, word + 's'], [7, word + 's'], [30, word + 's']];
    mk('span', 'How long?', units.map(([n]) => {
      const f = x => { x.span = { lo: n, hi: n, unit: 'day' }; };
      return { label: n + ' ' + word + (n === 1 ? '' : 's'), est: run(f), apply: f, sel: n === 1 };
    }), true);
  }

  // modifier groups the user did not specify
  const have = new Set(est.factors.filter(f => f.kind === 'mod').map(f => f.group));
  const groups = (ORDER[kind] || []).filter(g => !have.has(g));
  for (const g of groups) {
    const mods = MODIFIERS.filter(m => m.group === g && applicable(m, entry, est.side) && !(g === 'route' && m.id === 'border'));
    if (mods.length < 2) continue;
    // Skip the group when the entry is a travel route group but travel has a route already
    mk('g:' + g, GROUPS[g].ask, mods.map(m => {
      const f = x => { x.mods.push(m.id); };
      return { label: m.label, est: run(f), apply: f };
    }), false);
  }
  const assumptions = est.assumptions;
  // keep the most material dimensions
  const always = dims.filter(d => d.always);
  const rest = dims.filter(d => !d.always).sort((a, b) => b.ratio - a.ratio).slice(0, 4);
  return { assumptions, dimensions: [...always, ...rest] };
}
