// Fool's Gold tests: golden sentences (parser), golden estimates (engine), invariants.
// Run: node tools/fools-gold/test.mjs
import { compileWorld } from '../../src/building/fools-gold/js/world.js';
import { parse, queryToText, editDistance } from '../../src/building/fools-gold/js/parser.js';
import { estimate } from '../../src/building/fools-gold/js/engine.js';
import { analyze } from '../../src/building/fools-gold/js/unstated.js';
import { formatMoney, formatRange, parseMoney, niceRound } from '../../src/building/fools-gold/js/money.js';
import { WORLD_PRESETS, CATALOG, MODIFIERS } from '../../src/building/fools-gold/js/data.js';

let pass = 0, fail = 0;
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log('FAIL', name, detail ?? ''); } };
const eq = (name, a, b) => t(name, JSON.stringify(a) === JSON.stringify(b), '\n   got  ' + JSON.stringify(a) + '\n   want ' + JSON.stringify(b));

const vcm = compileWorld(WORLD_PRESETS.vcm());
const srd = compileWorld(WORLD_PRESETS.srd());
const ti = compileWorld(WORLD_PRESETS.titanium());
const P = (s, c = vcm) => parse(s, c);
const Q = (s, c = vcm) => P(s, c).query;
const E = (s, c = vcm) => estimate(Q(s, c), c);

// ---------- golden sentences ----------
{
  const q = Q('price for train ride between two major capital cities, 3 days travel expensive');
  eq('1 subject', q.subject, 'travel.rail'); eq('1 span', [q.span.lo, q.span.unit], [3, 'day']);
  eq('1 tier', q.tier, 'expensive'); eq('1 mods', q.mods, ['route-trunk']); eq('1 action assumed', q.assumed.includes('action'), true);
  eq('1 nothing unrecognized', P('price for train ride between two major capital cities, 3 days travel expensive').unrecognized, []);
  eq('1 qty untouched by the word two', q.qty, null);
}
{
  const a = Q('3 days travel expensive'), b = Q('expensive travel 3 days');
  eq('2 order independent', [a.span, a.tier, a.subject, a.family], [b.span, b.tier, b.subject, b.family]);
  eq('2 family default mode', [a.subject, a.family, a.assumed.includes('mode')], ['travel.rail', 'travel', true]);
  eq('2 srd world picks coach', Q('3 days travel', srd).subject, 'travel.coach');
}
{
  const a = Q('sell 5 rare potions'), b = Q('sell, potions, 5, rare');
  eq('3 sell potions', [a.action, a.subject, a.qty.lo, a.rarity], ['sell', 'good.cat-potion', 5, 'rare']);
  eq('4 comma style equals', a, b);
  const c = Q('sell 5 rare potions black market rush'); eq('5 mods', c.mods, ['black-market', 'rush']);
  eq('6 alias bm', Q('5 rare potions bm').mods, ['black-market']);
  const d = Q('#blackmarket sell x5 potion rare'); eq('7 explicit syntax', [d.mods, d.qty.lo, d.action], [['black-market'], 5, 'sell']);
  eq('7b 5x', Q('sell 5x potion').qty.lo, 5);
}
{
  const q = Q('how much for a night at an inn in the capital');
  eq('8 lodging', [q.subject, q.span.unit, q.span.lo, q.mods], ['lodging.inn-room', 'night', 1, ['capital']]);
  const h = Q('hire a skilled blacksmith for a week'); eq('9 hire', [h.action, h.subject, h.span.unit, h.span.lo], ['buy', 'labor.blacksmith', 'week', 1]);
  eq('9 nothing unrecognized', P('hire a skilled blacksmith for a week').unrecognized, []);
  const l = Q('longsword'); eq('10 bare item', [l.subject, l.action, l.assumed.includes('action')], ['good.longsword', 'buy', true]);
}
// ---------- numbers ----------
eq('11 a dozen', Q('a dozen arrows').qty.lo, 12);
eq('11b two dozen', Q('two dozen arrows').qty.lo, 24);
eq('11c half a dozen', Q('half a dozen eggs arrows').qty.lo, 6);
eq('11d twenty five', Q('twenty five arrows').qty.lo, 25);
eq('11e two hundred', Q('two hundred arrows').qty.lo, 200);
eq('11f 1,000', Q('1,000 arrows').qty.lo, 1000);
eq('12 range', (() => { const q = Q('3 to 5 days travel'); return [q.span.lo, q.span.hi]; })(), [3, 5]);
eq('12b dash range', (() => { const q = Q('3-5 days coach'); return [q.span.lo, q.span.hi, q.subject]; })(), [3, 5, 'travel.coach']);
eq('13 word number', Q('five rare potions').qty.lo, 5);
{
  const r = P('2 gp worth of rope');
  t('14 money flagged', r.notes.some(n => /sum of money/.test(n)), r.notes);
}
eq('14b lb', (() => { const q = Q('10 lb of iron'); return [q.subject, q.qty.lo, q.qty.unit]; })(), ['good.iron', 10, 'lb']);
eq('14c miles', (() => { const q = Q('300 miles by rail'); return [q.span.lo, q.span.unit, q.subject]; })(), [300, 'mile', 'travel.rail']);
eq('14d people', Q('2 passengers by coach for 3 days').qty.lo, 2);
// ---------- exclusion ----------
{
  const e = E('sell sword in capital and village');
  eq('15 place conflict', [e.ok, e.error, e.conflicts[0].group], [false, 'conflict', 'place']);
  const r = estimate({ ...Q('longsword'), mods: ['rush', 'leisurely'] }, vcm);
  eq('16 urgency conflict', r.error, 'conflict');
}
// ---------- fuzzy ----------
{
  const r = P('sell 5 potins rare');
  eq('17 potins flagged', r.unrecognized, ['potins']);
  eq('17 suggestion offered, not applied', [r.suggestions[0]?.to, r.query.subject], ['Potion', null]);
  const b = P('blak market');
  eq('18 did you mean black market', b.suggestions[0]?.to, 'black market');
  eq('18b not applied', b.query.mods, []);
  eq('edit distance transposition', editDistance('ab', 'ba'), 1);
}
// ---------- world vocabulary ----------
{
  const w = WORLD_PRESETS.vcm(); w.vocabulary = [{ term: 'sparkjuice', means: 'good.potion-of-healing' }, { term: 'the spire', means: 'mod:capital' }];
  const c = compileWorld(w);
  eq('19 vocab item', Q('buy 3 sparkjuice', c).subject, 'good.potion-of-healing');
  eq('19b vocab modifier', Q('sell longsword at the spire', c).mods, ['capital']);
}
// ---------- currency ----------
eq('20 one coin', formatMoney(1177, ti.world.currency), '4.8 titanium coins');
eq('20b one coin singular', formatMoney(250, ti.world.currency), '1 titanium coin');
eq('21 gsc', [formatMoney(1177, vcm.world.currency), formatMoney(830, vcm.world.currency), formatMoney(5, vcm.world.currency), formatMoney(1234567, vcm.world.currency)], ['12 gp', '8 gp 3 sp', '5 cp', '12,000 gp']);
eq('21b range', formatRange(825, 1680, vcm.world.currency), '8 gp 3 sp to 17 gp');
eq('21c parseMoney', parseMoney('5 gp 3 sp', vcm.world.currency), 530);
eq('21d niceRound', niceRound(11.77), 12);
t('22 no engine code names gp', !/'gp'|"gp"/.test(await (await import('node:fs')).promises.readFile('src/building/fools-gold/js/engine.js', 'utf8')));

// ---------- honesty ----------
{
  const c = E('price of a castle'); eq('23 castle priced', c.ok, true);
  const n = P('asdf qwer'); eq('24 nothing recognized', [n.query.subject, n.unrecognized], [null, ['asdf', 'qwer']]);
  eq('24b estimate refuses', estimate(n.query, vcm).error, 'no-subject');
  const w = E('longsword black market'); t('25 black market raises price', w.typical > E('longsword').typical);
}
// ---------- engine golden estimates ----------
{
  const r = E('price for train ride between two major capital cities, 3 days travel expensive');
  t('E1 rail example near 12 gp (VCM, industrial discount)', r.typical >= 800 && r.typical <= 1300, r.typical);
  t('E1 range brackets typical', r.lo < r.typical && r.typical < r.hi && r.lo >= 400 && r.hi <= 2000, [r.lo, r.typical, r.hi]);
  const r2 = E('price for train ride between two major capital cities, 3 days travel expensive', srd);
  t('E1b srd world has no economy tag, higher than VCM', r2.typical > r.typical, [r2.typical, r.typical]);
  const roles = r.factors.map(f => f.kind); eq('E1c factor order', roles.slice(0, 3), ['base', 'qty', 'tier']);
}
{
  const a = E('longsword'), b = E('longsword', srd);
  t('E2 srd base within 25% of 15 gp', b.typical > 1100 && b.typical < 1900, b.typical);
  t('E2b industrial world cheaper', a.typical < b.typical, [a.typical, b.typical]);
  const s = E('sell longsword', srd); t('E3 sell about half', s.typical < b.typical * 0.65 && s.typical > b.typical * 0.35, [s.typical, b.typical]);
  const t2 = E('sell 10 lb of gold', srd), t3 = E('buy 10 lb of gold', srd); t('E3b trade goods sell near full', t2.typical > t3.typical * 0.75, [t2.typical, t3.typical]);
}
{
  const strictW = WORLD_PRESETS.srd(); strictW.dials.stacking = 'strict'; const sc = compileWorld(strictW);
  const base = 'sell 5 rare potions black market rush shortage';
  const d = estimate(Q(base, srd), srd), s = estimate(Q(base, sc), sc);
  t('E4 dampened keeps stacks tamer than strict', Math.abs(Math.log(d.typical / E('sell 5 rare potions', srd).typical)) < Math.abs(Math.log(s.typical / E('sell 5 rare potions', sc).typical)), [d.typical, s.typical]);
  const rar = ['common', 'uncommon', 'rare', 'very rare', 'legendary'].map(r => estimate(Q('potion ' + r, srd), srd).typical);
  t('E5 rarity monotonic', rar.every((x, i) => i === 0 || x > rar[i - 1]), rar);
  const sells = estimate(Q('sell potion rare', srd), srd).typical, buys = estimate(Q('buy potion rare', srd), srd).typical;
  t('E6 buy dearer than sell', buys > sells);
  const cap = E('longsword in the capital', srd).typical, vil = E('longsword in a village', srd).typical;
  t('E7 capital dearer than village when buying', cap > vil);
  const capS = E('sell longsword in the capital', srd).typical, vilS = E('sell longsword in a village', srd).typical;
  t('E7b selling in the capital pays more than a village', capS > vilS);
  t('E8 bulk discount', E('100 arrows', srd).typical < E('arrows', srd).typical * 100 * 0.95);
  const vol0 = WORLD_PRESETS.srd(); vol0.dials.volatility = 0; const vc = compileWorld(vol0); const v = estimate(Q('longsword', vc), vc);
  t('E9 zero volatility collapses range', v.lo === v.typical && v.hi === v.typical, [v.lo, v.typical, v.hi]);
}
{
  const ign = E('black market rail 3 days'); t('E10 inapplicable modifier is reported not applied', ign.notes.some(n => /doesn't apply/.test(n)), ign.notes);
  const e = E('hire 3 guides for 2 days', srd); t('E11 head count x days', Math.abs(e.typical - 3 * 2 * 200 * 1) / (3 * 2 * 200) < 0.15, e.typical);
  const m = E('300 miles by coach', srd); t('E12 miles on coach = 3 cp a mile', Math.abs(m.typical - 900) / 900 < 0.15, m.typical);
  const rs = E('rare ring', srd); eq('E13 rarity honoured on templates', rs.assumptions.length, 0);
  const pw = E('potion of healing rare', srd); t('E14 fixed price item ignores rarity word', pw.notes.some(n => /ignored the rarity/.test(n)));
}
// ---------- baseline toggle ----------
{
  t('B1 generic baseline hides SRD item names', !ti.byId.has('good.longsword'));
  t('B2 generic keeps travel', ti.byId.has('travel.coach') && ti.byId.has('travel.rail'));
  eq('B3 generic: sword still priced via template', Q('sword', ti).subject, 'good.cat-weapon');
  t('B4 srd baseline has longsword', srd.byId.has('good.longsword'));
}
// ---------- unstated factors ----------
{
  const q = Q('sell 5 rare potions'); const e = estimate(q, vcm); const a = analyze(q, e, vcm);
  const ids = a.dimensions.map(d => d.id);
  t('U1 place is offered when not stated', ids.includes('g:place'), ids);
  t('U2 stated rarity not re-asked', !ids.includes('rarity'));
  const q2 = Q('sell 5 rare potions in the capital'); const a2 = analyze(q2, estimate(q2, vcm), vcm);
  t('U3 stated place not re-asked', !a2.dimensions.some(d => d.id === 'g:place'));
  const q3 = Q('potion'); const a3 = analyze(q3, estimate(q3, vcm), vcm);
  t('U4 rarity asked when missing', a3.dimensions.some(d => d.id === 'rarity') && a3.assumptions.some(x => x.id === 'rarity'));
  t('U5 side asked when action unstated for goods', a3.dimensions.some(d => d.id === 'side'));
  const q4 = Q('3 days travel'); const a4 = analyze(q4, estimate(q4, vcm), vcm);
  t('U6 travel mode asked when assumed', a4.dimensions.some(d => d.id === 'mode'));
  const q5 = Q('train ride'); const a5 = analyze(q5, estimate(q5, vcm), vcm);
  t('U7 length asked when missing', a5.dimensions.some(d => d.id === 'span'));
  const q6 = Q('train ride 3 days'); const a6 = analyze(q6, estimate(q6, vcm), vcm);
  t('U8 length not asked when given', !a6.dimensions.some(d => d.id === 'span'));
  t('U9 every option has a price', a.dimensions.every(d => d.options.every(o => o.typical > 0)));
  // applying an option round-trips
  const opt = a.dimensions.find(d => d.id === 'g:place').options[0]; const q7 = JSON.parse(JSON.stringify(q)); opt.apply(q7);
  t('U10 option patches query', estimate(q7, vcm).ok && q7.mods.length === 1);
}
// ---------- round trip text <-> query ----------
{
  const samples = [
    'sell 5 rare potions black market rush', 'buy a longsword', 'hire 3 guides for 2 days', 'price for train ride between two major capital cities, 3 days travel expensive',
    'appraise a masterwork rapier', 'sell 20 rations at a trading outpost', 'inn in a village for a week', '300 miles by coach luxury', 'wand siege', 'rare scroll auction', '3 to 5 days airship',
    'friendly shopkeeper buy 2 chain mail', 'sell used shield pawnshop', 'cantrip casting', '3rd level spell casting rush',
  ];
  for (const s of samples) {
    const q1 = Q(s); const text = queryToText(q1, vcm); const q2 = Q(text);
    const strip = q => ({ ...q, assumed: [...q.assumed].sort(), span: q.span && { lo: q.span.lo, hi: q.span.hi, unit: q.span.unit }, mods: [...q.mods].sort() });
    eq('RT ' + s, strip(q2), strip(q1));
  }
}
// ---------- data hygiene ----------
{
  const ids = new Set(); let dup = 0; for (const e of CATALOG) { if (ids.has(e.id)) dup++; ids.add(e.id); } eq('D1 unique ids', dup, 0);
  t('D2 all modifier ranges sane', MODIFIERS.every(m => m.buy[0] > 0 && m.buy[0] <= m.buy[1] && (!m.sell || (m.sell[0] > 0 && m.sell[0] <= m.sell[1]))));
  t('D3 every modifier has a why', MODIFIERS.every(m => m.why && m.why.length > 10));
  const dupTerms = new Map(); for (const p of vcm.phrases) { const k = p.key; if (!dupTerms.has(k)) dupTerms.set(k, new Set()); dupTerms.get(k).add(p.type + ':' + p.id); }
  const clash = [...dupTerms].filter(([, v]) => v.size > 1).map(([k, v]) => k + ' => ' + [...v].join(' | '));
  t('D4 no ambiguous lexicon terms', clash.length === 0, '\n   ' + clash.join('\n   '));
  t('D5 SRD sanity: longsword 15gp, plate 1500gp', CATALOG.find(e => e.id === 'good.longsword').bu === 1500 && CATALOG.find(e => e.id === 'good.plate-armor').bu === 150000);
  // every entry resolves from its own name
  const miss = vcm.entries.filter(e => { const r = parse(e.name, vcm); return r.query.subject !== e.id; }).map(e => e.name + ' -> ' + parse(e.name, vcm).query.subject);
  t('D6 every entry name parses to itself', miss.length === 0, '\n   ' + miss.join('\n   '));
  const missA = []; for (const e of vcm.entries) for (const a of e.aliases || []) { const r = parse(a, vcm); if (r.query.subject !== e.id && !(r.query.family && e.group)) missA.push(a + ' (' + e.name + ') -> ' + r.query.subject); }
  t('D7 every alias parses to its entry', missA.length === 0, '\n   ' + missA.join('\n   '));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
