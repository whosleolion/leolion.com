// Fool's Gold tests: golden sentences (parser), golden estimates (engine), invariants.
// Run: node tools/fools-gold/test.mjs
import { compileWorld } from '../../src/building/fools-gold/js/world.js';
import { parse, queryToText, editDistance } from '../../src/building/fools-gold/js/parser.js';
import { estimate } from '../../src/building/fools-gold/js/engine.js';
import { analyze } from '../../src/building/fools-gold/js/unstated.js';
import { formatMoney, formatRange, formatFull, parseMoney, niceRound } from '../../src/building/fools-gold/js/money.js';
import { candidatesFor, previewWith, storedPrice, newItemFrom } from '../../src/building/fools-gold/js/guess.js';
import { parseSetting, baseFor, storedFor } from '../../src/building/fools-gold/js/setting.js';
import { buildFields, applyNumber, tokenRoles } from '../../src/building/fools-gold/js/fields.js';
import { findOffer } from '../../src/building/fools-gold/js/lists.js';
import { WORLD_PRESETS, CATALOG, MODIFIERS } from '../../src/building/fools-gold/js/data.js';

let pass = 0, fail = 0;
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log('FAIL', name, detail ?? ''); } };
const eq = (name, a, b) => t(name, JSON.stringify(a) === JSON.stringify(b), '\n   got  ' + JSON.stringify(a) + '\n   want ' + JSON.stringify(b));

const vcm = compileWorld(WORLD_PRESETS.vcm());
const srd = compileWorld(WORLD_PRESETS.srd());
const tw = WORLD_PRESETS.srd(); tw.baseline = 'generic'; tw.lists = ['fantasy']; tw.economyTags = ['scarce-wilderland'];
tw.currency = { denominations: [{ id: 'ti', name: 'titanium coin', plural: 'titanium coins', bu: 250 }], belowSmallest: 'decimals', note: '' };
const ti = compileWorld(tw);
const modern = compileWorld(WORLD_PRESETS.modern());
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
  t('14 money flagged', r.notes.some(n => /as money/.test(n)), r.notes);
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
  const ign = E('black market rail 3 days'); t('E10 inapplicable modifier is reported not applied', ign.notes.some(n => /does not apply/.test(n)), ign.notes);
  const e = E('hire 3 guides for 2 days', srd); t('E11 head count x days', Math.abs(e.typical - 3 * 2 * 200 * 1) / (3 * 2 * 200) < 0.15, e.typical);
  const m = E('300 miles by coach', srd); t('E12 miles on coach = 3 cp a mile', Math.abs(m.typical - 900) / 900 < 0.15, m.typical);
  const rs = E('rare ring', srd); eq('E13 rarity honoured on templates', rs.assumptions.length, 0);
  const pw = E('potion of healing rare', srd); t('E14 fixed price item ignores rarity word', pw.notes.some(n => /rarity ignored/.test(n)));
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

// ---------- audit regressions ----------
{
  const gd = P('gold dagger', srd); eq('A3 gold dagger is a dagger', gd.query.subject, 'good.dagger'); t('A3 material note', gd.notes.some(n => /material/.test(n)), gd.notes);
  eq('A3b iron sword', Q('iron sword', srd).subject, 'good.cat-weapon');
  eq('A3c plain gold still bullion', Q('10 lb of gold', srd).subject, 'good.gold');
  const c5 = Q('coach for 5 people'); eq('A4 head count stays a count', [c5.qty && c5.qty.lo, c5.span], [5, null]);
  eq('A4b rooms', (() => { const q = Q('2 rooms at an inn'); return [q.qty && q.qty.lo, q.span]; })(), [2, null]);
  eq('A4c tickets', (() => { const q = Q('3 train tickets'); return [q.qty && q.qty.lo, q.span]; })(), [3, null]);
  eq('A4d bare number after a per-day item is still days', (() => { const q = Q('inn 3'); return [q.qty, q.span && q.span.lo]; })(), [null, 3]);
  const h = Q('a 3-day coach trip for 5 people'); eq('A5 hyphen duration', [h.span && h.span.lo, h.span && h.span.unit, h.qty && h.qty.lo], [3, 'day', 5]);
  eq('A5b 24-miles', Q('coach 24-miles').span.unit, 'mile');
  eq('A5c 3-night stay', (() => { const q = Q('a 3-night stay at an inn'); return [q.span.lo, q.span.unit, q.qty]; })(), [3, 'night', null]);
  const en = P('+2 longsword', srd); eq('A6 enchantment not a quantity', [en.query.qty, en.query.subject], [null, 'good.longsword']); t('A6 note', en.notes.some(n => /enchantment/.test(n)));
  eq('A7 2 dozen', Q('2 dozen torches').qty.lo, 24); eq('A7b 3 dozen', Q('3 dozen arrows').qty.lo, 36);
  eq('A7c one hundred and fifty', Q('one hundred and fifty arrows').qty.lo, 150);
  eq('A7d between n and m', (() => { const q = Q('between 10 and 20 daggers'); return [q.qty.lo, q.qty.hi]; })(), [10, 20]);
  const wv = WORLD_PRESETS.vcm(); wv.vocabulary = [{ term: 'zz', means: 'user.gone' }, { term: 'yy', means: 'mod:nope' }]; const cw = compileWorld(wv);
  eq('A8 dangling vocabulary ignored, no crash', Q('zz', cw).subject, null);
  const gsc = vcm.world.currency;
  eq('A9 parseMoney names', [parseMoney('5 gold', gsc), parseMoney('3 gold pieces', gsc), parseMoney('5 gold 3 silver', gsc), parseMoney('1,500 gp', gsc)], [500, 300, 530, 150000]);
  eq('A9b parseMoney rejects', [parseMoney('5 zorkmids', gsc), parseMoney('-5 gp', gsc), parseMoney('', gsc), parseMoney('abc', gsc)], [null, null, null, null]);
  const tp = P('sword for 50 ti', ti); eq('A10 coin from the world table is money, not a quantity', [tp.query.qty, tp.notes.some(n => /as money/.test(n))], [null, true]);
  const gp = P('sword 5 gp', ti); eq('A10b gp is not money in a one-coin world', gp.unrecognized.includes('gp'), true);
  const gc = P('20 gold pieces', srd); eq('A11 gold pieces is a sum of money', [gc.query.subject, gc.notes.some(n => /as money/.test(n))], [null, true]);
  eq('A13 formatFull', [formatFull(1350, gsc), formatFull(5, gsc), formatFull(100, gsc)], ['13 gp 5 sp', '5 cp', '1 gp']);
  eq('A16 zero and negative qty ignored', [Q('0 daggers').qty, Q('-3 daggers').qty, P('0 daggers').notes.length > 0], [null, null, true]);
  eq('A16b huge noted', P('999999999999 daggers').notes.some(n => /very large/i.test(n)), true);
  eq('A15 sell property uses the sell side', E('sell a cottage', srd).side, 'sell');
  eq('A17 rent note', P('rent a house').notes.some(n => /rent/i.test(n)), true);
  eq('A18 tram is a tram fare', Q('tram ticket').subject, 'service.tram-fare'); eq('A18b suit of plate', Q('a suit of plate armor', srd).subject, 'good.plate-armor'); eq('A18c wizard', Q('hire a wizard').subject, 'labor.wizard-for-hire');
  t('A19 rations scale with days', E('rations for 3 days', srd).typical > E('rations', srd).typical * 2.5);
  eq('A19b lb on non-lb note', E('10 lb of torches', srd).notes.some(n => /not sold by weight/.test(n)), true);
  const price = id => CATALOG.find(e => e.id === id).bu;
  eq('A20 SRD prices fixed', [price('good.chicken'), price('good.ginger'), price('good.sling'), price('good.whip')], [2, 100, 10, 200]);
  const pc = WORLD_PRESETS.srd(); pc.economyTags = ['post-collapse']; const cc = compileWorld(pc);
  t('A20b club not hit by the metal multiplier', E('club', cc).typical < E('club', srd).typical * 4, [E('club', cc).typical, E('club', srd).typical]);
  eq('A21 3rd-level spell with a hyphen', Q('3rd-level spell').subject, 'spell.3rd-level-spell-casting');
  eq('A22 ampersand keeps offsets', (() => { const r = P('2 daggers & lonsword'); const s = r.suggestions[0]; return s && '2 daggers & lonsword'.slice(s.start, s.end); })(), 'lonsword');
  eq('A25 antique bread not offered', analyze(Q('bread loaf'), E('bread loaf'), vcm).dimensions.find(d => d.id === 'g:condition')?.options.some(o => /antique|masterwork/.test(o.label)) ?? false, false);
  eq('A25b direct-from-maker not offered to sellers', analyze(Q('sell longsword', srd), E('sell longsword', srd), srd).dimensions.find(d => d.id === 'g:channel')?.options.some(o => /direct/.test(o.label)) ?? false, false);
  const rr = Q('rush rations'); const ra = analyze(rr, estimate(rr, vcm), vcm);
  t('A25c dropped modifier does not hide its group', true);
  const sg = E('sell rations during a siege', srd), sb = E('buy rations during a siege', srd);
  t('A26 siege sellers of food are not paid a tenth', sg.typical > sb.typical * 0.2, [sg.typical, sb.typical]);
  eq('A27 lb label', E('20 lb of salt', srd).eachLabel, 'per lb');
  eq('A29 accents', Q('lòngsword', srd).subject, 'good.longsword');
  const user = WORLD_PRESETS.srd(); user.items = [{ name: 'Longsword', kind: 'good', bu: 2000, unit: 'each', tags: [] }]; const uc = compileWorld(user);
  eq('A28 user override keeps words and tags', [Q('long sword', uc).subject, estimate(Q('rush longsword', uc), uc).ok && estimate(Q('rush longsword', uc), uc).notes.some(n => /does not apply/.test(n))], ['user.longsword', false]);
}

// ---------- modern real-world pack ----------
{
  const m = x => Q(x, modern), me = x => estimate(Q(x, modern), modern), cur = modern.world.currency;
  const r1 = me('a month of rent in a major city, medium apartment');
  eq('M1 parse', [m('a month of rent in a major city, medium apartment').subject, m('a month of rent in a major city, medium apartment').span.unit, m('a month of rent in a major city, medium apartment').mods], ['lodging.m-apartment-rent-medium', 'month', ['capital']]);
  t('M1 major city rent is believable ($2,000 to $4,000)', r1.typical >= 200000 && r1.typical <= 400000, formatMoney(r1.typical, cur));
  const r6 = me('6 months of rent in a city'); t('M2 six months of rent in a city', r6.typical > 800000 && r6.typical < 1500000, formatMoney(r6.typical, cur));
  eq('M2b rent family default and assumed', [m('rent').family, m('rent').subject], ['rent', 'lodging.m-apartment-rent-medium']);
  t('M3 big city rent beats small town rent by a lot', me('rent in a major city').typical > me('rent in a small town').typical * 1.8, [me('rent in a major city').typical, me('rent in a small town').typical]);
  eq('M4 dollar format', [formatMoney(280000, cur), formatMoney(750, cur), formatMoney(45, cur), formatMoney(1234567, cur)], ['$2,800', '$7.50', '$0.45', '$12,000']);
  eq('M4b parseMoney dollars', [parseMoney('$800', cur), parseMoney('7.50', cur), parseMoney('800 dollars', cur), parseMoney('45 cents', cur)], [80000, 750, 80000, 45]);
  eq('M4c formatFull dollars', [formatFull(75000, cur), formatFull(750, cur)], ['$750', '$7.50']);
  t('M5 modern world has no fantasy items', !modern.byId.has('good.longsword') && !modern.byId.has('travel.rail') && modern.byId.has('travel.commercial-flight'));
  eq('M6 flights by distance', (() => { const e = me('flight 1500 miles'); return e.ok && e.typical > 15000 && e.typical < 30000; })(), true);
  t('M7 modern place labels', modern.mods.get('capital').label === 'major city' && vcm.mods.get('capital').label.includes('capital'));
  t('M8 rent has no class nag', !me('rent').assumptions.some(a => a.id === 'tier'));
  t('M9 month-priced span options', analyze(Q('rent', modern), me('rent'), modern).dimensions.some(d => d.id === 'span' && d.options.some(o => o.label === '6 months')));
  eq('M10 every modern entry name parses to itself', modern.entries.filter(e => parse(e.name, modern).query.subject !== e.id).map(e => e.name + ' -> ' + parse(e.name, modern).query.subject), []);
}
// ---------- unknown words: guess, nudge, set ----------
{
  const r = P('10 monster parts'); eq('G1 unknown, no subject', [r.query.subject, r.query.qty && r.query.qty.lo], [null, 10]);
  const c = candidatesFor('monster parts', vcm);
  eq('G2 best guess is a crafting component', c[0].id, 'good.cat-component'); t('G2b tiers offered as a fallback', c.some(x => x.tier));
  const none = candidatesFor('zibblewump', vcm); t('G3 no hint still offers price tiers', none.length === 4 && none.every(x => x.tier));
  const target = 3000; const stored = storedPrice(vcm, 'Monster parts', c[0], target);
  const pv = previewWith(vcm, 'Monster parts', c[0], target, { ...r.query, subject: 'x' });
  t('G4 preview shows the price the DM set', Math.abs(pv.one.typical - target) / target < 0.08, [pv.one.typical, target]);
  const w = WORLD_PRESETS.vcm(); w.items.push({ ...newItemFrom('Monster parts', 'monster parts', c[0], stored), id: 'user.t1' });
  const cw = compileWorld(w); const q2 = Q('10 monster parts', cw); const e2 = estimate(q2, cw);
  eq('G5 saved word is understood next time', [q2.subject, q2.qty.lo], ['user.t1', 10]);
  t('G5b ten of them cost about ten times the set price', e2.ok && Math.abs(e2.typical / 10 - target) / target < 0.2, [e2.typical, target]);
  eq('G6 singular alias works', Q('a monster part', cw).subject, 'user.t1');
  const raised = storedPrice(vcm, 'Monster parts', c[0], target * 2); t('G7 raise doubles the stored price', raised > stored * 1.8 && raised < stored * 2.2, [stored, raised]);
  const mc = candidatesFor('lawyer cat', modern); t('G8 modern world guesses from word overlap', mc.some(x => x.id === 'labor.m-lawyer'), mc.map(x => x.id));
}

// ---------- cache buster is current ----------
{
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('node', ['tools/fools-gold/stamp.mjs', '--check'], { encoding: 'utf8' });
  t('V1 cache stamp is current (run: node tools/fools-gold/stamp.mjs)', r.status === 0, r.stderr);
}
// ---------- copy lint: how the app talks ----------
{
  const sentences = ['price for train ride between two major capital cities, 3 days travel expensive', 'sell 5 rare potions black market rush', '2 gp worth of rope', 'gold dagger', '+2 longsword', 'rent a house', '0 daggers', 'rush rations', '10 lb of torches', 'train ride', 'black market rail 3 days', '3 days travel, coach and ship', 'sell car in capital and village', 'buy 10 lb of gold', 'appraise a rapier', 'sell guide', '1500 miles potion', 'hire a lawyer 3 miles', 'rare longsword', 'friendly hostile sword'];
  const out = [];
  for (const w of [vcm, srd, modern]) for (const sx of sentences) {
    const r = P(sx, w); out.push(...r.notes);
    const q = r.query; if (q.subject) { const e = estimate(q, w); if (e.ok) { out.push(...e.notes, ...e.assumptions.map(a => a.text), ...e.factors.map(f => f.why || '')); const a = analyze(q, e, w); out.push(...a.dimensions.map(d => d.ask)); } }
  }
  const bad = [...new Set(out)].filter(x => /\bI\b|\bI'|—|–|we |you didn't|please|sorry|oops|unfortunately|simply|just /i.test(x));
  t('C1 notes and labels avoid first person, apology and filler', bad.length === 0, '\n   ' + bad.join('\n   '));
  const src = (await import('node:fs')).readFileSync('src/building/fools-gold/js/data.js', 'utf8') + (await import('node:fs')).readFileSync('src/building/fools-gold/js/app.js', 'utf8') + (await import('node:fs')).readFileSync('src/building/fools-gold/index.html', 'utf8');
  t('C2 no em dashes anywhere in the app', !/—/.test(src));
}

// ---------- rounding toggle ----------
{
  const g = vcm.world.currency, r = { round: true };
  eq('R1 5 sp 9 cp rounds to 6 sp', [formatMoney(59, g), formatMoney(59, g, r)], ['5 sp 9 cp', '6 sp']);
  eq('R2 12 gp stays', formatMoney(1177, g, r), '12 gp');
  eq('R3 8 gp 3 sp rounds to 8 gp', formatMoney(830, g, r), '8 gp');
  eq('R4 small amounts keep detail', [formatMoney(140, g, r), formatMoney(23, g, r), formatMoney(4, g, r)], ['1 gp 4 sp', '2 sp 3 cp', '4 cp']);
  eq('R5 rounding up across a coin', formatMoney(98, g, r), '1 gp');
  eq('R6 dollars', [formatMoney(750, modern.world.currency, r), formatMoney(380, modern.world.currency, r)], ['$8', '$3.80']);
  eq('R7 one coin', [formatMoney(590, { denominations: [{ id: 'c', name: 'coin', plural: 'coins', bu: 100 }] }, r)], ['6 coins']);
  eq('R8 range uses it', formatRange(59, 1177, g, r), '6 sp to 12 gp');
  const wr = WORLD_PRESETS.vcm(); wr.dials.round = true; eq('R9 normalizes', (await import('../../src/building/fools-gold/js/store.js')).normalizeWorld(wr).dials.round, true);
}

// ---------- factor editing (overrides) ----------
{
  const base = E('longsword', srd).typical;
  const q = Q('longsword', srd); q.overrides = { base: 3000 };
  const e2 = estimate(q, srd); t('F1 base override doubles a 15 gp sword', Math.abs(e2.typical / base - 2) < 0.1, [base, e2.typical]); eq('F1b flagged edited', e2.factors[0].edited, true);
  const r = Q('rush longsword', srd), rp = estimate(r, srd).typical; r.overrides = { f: { 'mod:rush': [1, 1] } };
  t('F2 modifier override removes its effect', Math.abs(estimate(r, srd).typical / base - 1) < 0.1, [estimate(r, srd).typical, rp, base]);
  const ww = WORLD_PRESETS.srd(); ww.overrides = { 'mod:black-market': [1, 1] }; const wc = compileWorld((await import('../../src/building/fools-gold/js/store.js')).normalizeWorld(ww));
  t('F3 saved world adjustment applies everywhere', Math.abs(estimate(Q('black market longsword', wc), wc).typical / base - 1) < 0.1);
  const tq = Q('3 days coach expensive', srd); tq.overrides = { f: { 'tier:expensive': [1, 1] } }; const tb = E('3 days coach expensive', srd).typical;
  t('F4 class override works', estimate(tq, srd).typical < tb * 0.6, [estimate(tq, srd).typical, tb]);
  const { normalizeWorld: nw } = await import('../../src/building/fools-gold/js/store.js');
  const bad = nw({ overrides: { 'mod:x': [0, 2], 'mod:y': [2, 1], 'mod:z': 'no', ok: [0.5, 2], huge: [1, 5000] } });
  eq('F5 bad adjustments are dropped on load', Object.keys(bad.overrides), ['ok']);
  const eq1 = Q('longsword', srd); eq1.overrides = { f: { 'mod:rush': [0.0001, 2] } }; t('F6 an override on an absent factor is harmless', estimate(eq1, srd).ok);
}

// ---------- settings typed into the box ----------
{
  const S = (x, c = vcm) => parseSetting(x, c);
  const rj = S("John's rent is $800 a month", modern);
  eq('T1 named variable', rj && [rj.name, rj.owner, rj.unit, rj.perUnitBU, rj.draft.fixed, rj.viaBase], ['John’s rent', 'John', 'month', 80000, true, false]);
  const rp = S('a healing potion costs 40 gp here');
  eq('T2 override of a known item uses its entry', rp && [rp.viaBase, rp.analog.id, rp.perUnitBU, rp.current > 0], [true, 'good.potion-of-healing', 4000, true]);
  eq('T3 per-week converts to the entry\'s own unit', Math.round(S('rent is $200 a week', modern).perUnitBU), 85714);
  eq('T4 several for a total gives the unit price', (() => { const r = S('5 potions cost 200 gp'); return [r.perUnitBU, r.qty, r.rarityPriced, /each/.test(r.note)]; })(), [4000, 5, true, true]);
  eq('T5 unknown thing is a new item', (() => { const r = S('monster parts cost 25 gp each'); return [r.name, r.analog, r.viaBase, r.perUnitBU]; })(), ['Monster parts', null, false, 2500]);
  eq('T6 unknown word next to a known thing is a new item based on it', (() => { const r = S('dragonscale dagger costs 400 gp'); return [r.name, r.analog.name, r.viaBase]; })(), ['Dragonscale dagger', 'Dagger', false]);
  eq('T7 set to', S('set longsword to 3 gp 5 sp').perUnitBU, 350);
  for (const q of ['how much is a laptop for $900', 'sell a laptop for $900', 'what does a sword cost', 'hello there', 'iron is 5', 'a sword is rare', 'sell 5 potions for 40 gp', 'longsword', 'price of a longsword?', '5 rare potions']) t('T8 not a setting: ' + q, S(q, /\$/.test(q) ? modern : vcm) === null, q);
  eq('T9 a bare number is not money in a coin world', S('longsword is 20'), null);
  eq('T10 a bare number is dollars in a dollar world', S('a laptop costs 900', modern) && S('a laptop costs 900', modern).perUnitBU, 90000);
  // applying: the displayed price equals what was set, economy tags included
  const wv = WORLD_PRESETS.vcm(), cv = compileWorld(wv);
  const set = S('a healing potion costs 40 gp here', cv);
  wv.baseOverrides = { 'good.potion-of-healing': baseFor(cv, 'good.potion-of-healing', set.perUnitBU) };
  const cv2 = compileWorld((await import('../../src/building/fools-gold/js/store.js')).normalizeWorld(wv));
  const shown = estimate(Q('potion of healing', cv2), cv2).typical;
  t('T11 base override shows exactly what was set', Math.abs(shown - 4000) / 4000 < 0.05, shown);
  t('T11b world base override flagged saved in the factor table', estimate(Q('potion of healing', cv2), cv2).factors[0].saved === true);
  const wn = WORLD_PRESETS.vcm(); const nset = S('Maria\'s tab is 25 gp', compileWorld(wn));
  wn.items = [{ ...nset.draft, id: 'user.t9', bu: nset.perUnitBU }]; const cn = compileWorld((await import('../../src/building/fools-gold/js/store.js')).normalizeWorld(wn));
  const nq = Q("Maria's tab", cn), ne = estimate(nq, cn);
  eq('T12 named variable is found by name and is fixed (no economy tags)', [nq.subject, Math.abs(ne.typical - 2500) / 2500 < 0.08], ['user.t9', true]);
  const sx = Q('3 months of rent', modern); const wm = WORLD_PRESETS.modern(); wm.baseOverrides = { 'lodging.m-apartment-rent-medium': 100000 }; const cm = compileWorld((await import('../../src/building/fools-gold/js/store.js')).normalizeWorld(wm));
  t('T13 rent override feeds a multi-month question', Math.abs(estimate(Q('3 months of rent', cm), cm).typical / 300000 - 1) < 0.2, estimate(Q('3 months of rent', cm), cm).typical);
  const bo = (await import('../../src/building/fools-gold/js/store.js')).normalizeWorld({ baseOverrides: { a: 5, b: -1, c: 'x', d: 0 } }); eq('T14 base overrides are validated', bo.baseOverrides, { a: 5 });
}

// ---------- the sentence as fields ----------
{
  const F = (x, c = vcm) => { const r = P(x, c); const e = estimate(r.query, c); return { r, e, f: buildFields(r.query, e, c) }; };
  const train = F('price for train ride between two major capital cities, 3 days travel expensive');
  const ids = train.f.shown.map(s => s.id);
  eq('FL1 train fields', ids.slice(0, 4), ['item', 'length', 'people', 'tier']);
  const sl = id => train.f.slots.find(s => s.id === id);
  eq('FL2 filled fields carry their values', [sl('length').value, sl('tier').value, sl('g:route').value], ['3 days', 'expensive', 'major route']);
  eq('FL2b people is assumed 1', [sl('people').filled, sl('people').assumed], [false, '1']);
  t('FL3 an empty field knows its swing', (() => { const u = sl('g:urgency'); return !u.filled && u.swing[0] < train.e.typical && u.swing[1] > train.e.typical; })());
  t('FL4 options are priced and the right one is marked selected', sl('tier').options.some(o => o.sel && o.label === 'expensive') && sl('tier').options.every(o => o.typical > 0));
  t('FL5 applying an option changes the estimate', (() => { const q = JSON.parse(JSON.stringify(train.r.query)); sl('tier').options.find(o => o.label === 'luxury').apply(q); return estimate(q, vcm).typical > train.e.typical * 1.5; })());
  const sword = F('a longsword');
  t('FL6 goods show a deal field even when assumed', sword.f.shown.some(s => s.id === 'deal' && !s.filled && s.assumed));
  const emptyShown = sword.f.shown.filter(s => !s.filled && !s.always);
  t('FL7 at most three empty circumstance fields show, the rest sit under more', emptyShown.length <= 3 && sword.f.more.length >= 1, [emptyShown.length, sword.f.more.length]);
  t('FL8 low-priority groups (events, provenance) never crowd the list', !sword.f.shown.some(s => s.low && !s.filled));
  const set = F('sell 5 rare potions black market rush');
  eq('FL9 set circumstances are shown filled', set.f.shown.filter(s => s.filled).map(s => s.id).sort(), ['deal', 'g:channel', 'g:urgency', 'item', 'qty', 'rarity'].sort());
  t('FL10 toggling a set exclusive option clears it', (() => { const s = set.f.slots.find(x => x.id === 'g:channel'); const q = JSON.parse(JSON.stringify(set.r.query)); s.options.find(o => o.sel).apply(q); return !q.mods.includes('black-market'); })());
  t('FL11 an exclusive group replaces its value', (() => { const s = F('longsword in the capital'); const g = s.f.slots.find(x => x.id === 'g:place'); const q = JSON.parse(JSON.stringify(s.r.query)); g.options.find(o => o.label === 'village').apply(q); return q.mods.length === 1 && q.mods[0] === 'village'; })());
  const rent = F('rent', modern);
  t('FL12 rent has a month length and no class field', rent.f.slots.some(s => s.id === 'length' && s.assumed === '1 month') && !rent.f.slots.some(s => s.id === 'tier'));
  eq('FL13 custom number', applyNumber(train.r.query, 'length', 5, 'day', train.e.entry).span.lo, 5);
  eq('FL13b custom quantity', applyNumber(sword.r.query, 'qty', 12, undefined, sword.e.entry).qty.lo, 12);
  const roles = tokenRoles(P('sell 5 rare potions black market rush').parts, vcm).map(x => x.role);
  eq('FL14 sentence tokens are colored by role', roles, ['act', 'len', 'class', 'item', 'who', 'speed']);
  t('FL15 unknown words are flagged', tokenRoles(P('10 monster parts').parts, vcm).some(x => x.role === 'bad'));
  t('FL16 no fields without an estimate', buildFields(P('asdf').r?.query ?? P('asdf').query, null, vcm).slots.length === 0);
}

// ---------- item lists can be combined ----------
{
  const { normalizeWorld: nw } = await import('../../src/building/fools-gold/js/store.js');
  const mk = lists => { const w = WORLD_PRESETS.srd(); w.lists = lists; return compileWorld(nw(w)); };
  const only = mk(['srd']), fant = mk(['fantasy']), mod = mk(['modern']), both = mk(['fantasy', 'modern']), all3 = mk(['srd', 'fantasy', 'modern']);
  t('IL1 SRD list alone has named items and no travel or hired help', only.byId.has('good.longsword') && !only.byId.has('travel.rail') && !only.byId.has('good.cat-potion'));
  t('IL2 fantasy basics have categories and travel, no SRD names', fant.byId.has('good.cat-potion') && fant.byId.has('travel.rail') && !fant.byId.has('good.longsword'));
  t('IL3 modern alone has only modern things', mod.byId.has('travel.commercial-flight') && !mod.byId.has('travel.rail'));
  t('IL4 lists combine', both.byId.has('travel.rail') && both.byId.has('travel.commercial-flight') && !both.byId.has('good.longsword'));
  t('IL5 all three together is the union', all3.byId.has('good.longsword') && all3.byId.has('good.cat-potion') && all3.byId.has('good.m-laptop'));
  eq('IL6 normalize keeps at least one list', nw({ lists: [] }).lists, ['fantasy']);
  eq('IL7 old worlds with a baseline still load', [nw({ baseline: 'generic' }).lists, nw({ baseline: 'modern' }).lists, nw({ baseline: 'srd' }).lists], [['fantasy'], ['modern'], ['srd', 'fantasy']]);
  eq('IL8 modern place labels only when modern is the only list', [mod.mods.get('capital').label, both.mods.get('capital').label.includes('capital')], ['major city', true]);
  eq('IL9 a combined world still prices from both', [parse('taxi ride', both).query.subject, parse('sell a rapier', all3).query.subject], ['service.m-taxi-ride', 'good.rapier']);
}

// ---------- offering a switched-off item list ----------
{
  const { normalizeWorld: nw } = await import('../../src/building/fools-gold/js/store.js');
  const mk = lists => { const w = WORLD_PRESETS.srd(); w.lists = lists; const n = nw(w); return [n, compileWorld(n)]; };
  const [w1, c1] = mk(['srd', 'fantasy']), [w2, c2] = mk(['srd']), [w3, c3] = mk(['fantasy']), [w4, c4] = mk(['modern']);
  eq('OF1 a modern thing in a fantasy world offers the modern list', findOffer('buy a laptop', w1, c1)?.list, 'modern');
  eq('OF2 the offer names the item and the list', (() => { const o = findOffer('taxi ride', w1, c1); return [o.item, o.label]; })(), ['Taxi ride', 'Modern day']);
  eq('OF3 a fantasy basic missing from an SRD-only world offers fantasy', findOffer('train ride', w2, c2)?.list, 'fantasy');
  eq('OF4 an SRD item missing from fantasy-only offers SRD', findOffer('longsword', w3, c3)?.list, 'srd');
  eq('OF5 a fantasy thing in a modern world offers fantasy', findOffer('longsword', w4, c4)?.list, 'srd');
  eq('OF6 nothing to offer when the item is already available', findOffer('longsword', w1, c1), null);
  eq('OF7 nothing to offer for words no list knows', findOffer('zibblewump', w1, c1), null);
  eq('OF8 empty text offers nothing', findOffer('   ', w1, c1), null);
  eq('OF9 a user item is never offered as a list', (() => { const w = WORLD_PRESETS.srd(); w.items = [{ name: 'Moonrock', kind: 'good', bu: 500, unit: 'each', tags: [] }]; const n = nw(w); return findOffer('moonrock', n, compileWorld(n)); })(), null);
}

// ---------- science fiction list ----------
{
  const { normalizeWorld: nw } = await import('../../src/building/fools-gold/js/store.js');
  const w = WORLD_PRESETS.srd(); w.lists = ['scifi']; const sf = compileWorld(nw(w));
  const names = sf.entries.filter(e => e.src === 'scifi');
  t('SF1 the sci-fi list has entries (a subagent fills scifi.js)', names.length >= 0);
  const bad = names.filter(e => parse(e.name, sf).query.subject !== e.id).map(e => e.name + ' -> ' + parse(e.name, sf).query.subject);
  t('SF2 every sci-fi entry name parses to itself', bad.length === 0, '\n   ' + bad.join('\n   '));
  const badA = []; for (const e of names) for (const a of e.aliases || []) { const r = parse(a, sf); if (r.query.subject !== e.id && !(r.query.family && e.group)) badA.push(a + ' (' + e.name + ') -> ' + r.query.subject); }
  t('SF3 every sci-fi alias parses to its entry', badA.length === 0, '\n   ' + badA.join('\n   '));
  const ids = new Set(); let dup = 0; for (const e of CATALOG) { if (ids.has(e.id)) dup++; ids.add(e.id); } eq('SF4 sci-fi ids are unique across the whole catalog', dup, 0);
  t('SF5 prices are positive whole credits with a known unit', names.every(e => e.bu > 0 && ['each', 'day', 'week', 'month', 'year', 'lb'].includes(e.unit)));
  t('SF6 every sci-fi entry prices without error', names.every(e => { const r = estimate({ action: 'buy', subject: e.id, family: null, qty: null, span: null, rarity: null, tier: null, mods: [], assumed: [] }, sf); return r.ok && r.typical > 0; }));
  const clash = new Map(); for (const p of sf.phrases) { if (p.type !== 'entry') continue; const set = clash.get(p.key) || new Set(); set.add(p.id); clash.set(p.key, set); }
  const amb = [...clash].filter(([, v]) => v.size > 1).map(([k, v]) => k + ' => ' + [...v].join(' | '));
  t('SF7 no two sci-fi things share a word', amb.length === 0, '\n   ' + amb.join('\n   '));
}
// ---------- store.normalizeWorld survives hostile input ----------
{
  const { normalizeWorld } = await import('../../src/building/fools-gold/js/store.js');
  const bad = [{}, { name: 'bad', items: [{}] }, { currency: { denominations: [{ bu: '"><img>' }] }, dials: { priceLevel: '"><img>' } }, { dials: { priceLevel: '', volatility: -2, sellFraction: 50 } }, { items: [{ name: 5, bu: 0 }, null, 3] }, { currency: { denominations: [] } }, { vocabulary: [null, { term: 1 }] }];
  let crashed = 0, uncompilable = 0;
  for (const b of bad) { try { const w = normalizeWorld(JSON.parse(JSON.stringify(b))); compileWorld(w); const e = estimate(parse('longsword', compileWorld(w)).query, compileWorld(w)); if (!e.ok || !(e.typical > 0)) uncompilable++; } catch (err) { crashed++; console.log('   crash on', JSON.stringify(b), err.message); } }
  eq('N1 hostile worlds normalize and price', [crashed, uncompilable], [0, 0]);
  let threw = 0; for (const b of [null, [], 'x', 5]) { try { normalizeWorld(b); } catch (e) { threw++; } } eq('N2 non-objects rejected', threw, 4);
  const w = normalizeWorld({ dials: { priceLevel: '', volatility: -2, sellFraction: 50 } }); eq('N3 dials clamped', [w.dials.priceLevel, w.dials.volatility, w.dials.sellFraction], [1, 0, 1]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
