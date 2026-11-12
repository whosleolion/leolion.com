// Guessing for words the app does not know. No AI: a hand-made word-to-category list plus word overlap
// with the catalog. It only ever proposes. The DM picks, nudges the price and confirms.
import { stem } from './world.js?v=63f3d017';
import { estimate, timeUnit } from './engine.js?v=63f3d017';
import { niceRound } from './money.js?v=63f3d017';

// Word families. Each lists catalog ids to try, in order. Ids missing from the current world are skipped.
const FAMILIES = [
  ['harvested materials and crafting components', ['good.cat-component'], 'monster beast creature part hide pelt fur claw fang tooth horn scale bone ichor venom gland organ trophy carcass essence ectoplasm herb root mushroom fungus flower feather wing eye heart blood ash dust powder crystal shard sap resin tusk talon hoof antler'],
  ['a weapon', ['good.cat-weapon', 'good.cat-m-weapon', 'good.m-handgun'], 'weapon blade sabre saber cutlass dirk stiletto cudgel bludgeon gun musket cannon pike scythe flail bayonet'],
  ['armor', ['good.cat-armor', 'good.m-bulletproof-vest'], 'helmet helm gauntlet greave bracer cuirass pauldron gorget hauberk vest'],
  ['clothing', ['good.cat-clothing', 'good.cat-m-clothes'], 'hat cap boot glove scarf cloak cape tunic coat dress gown uniform shirt trouser sock belt'],
  ['jewelry or a luxury', ['good.cat-jewelry', 'good.cat-gem'], 'necklace bracelet crown tiara brooch pendant earring locket gem gemstone jewel ruby emerald sapphire diamond pearl'],
  ['a magic trinket', ['good.cat-wondrous'], 'charm talisman amulet orb relic trinket idol fetish totem rune wand-like enchanted magical'],
  ['food', ['good.cat-food', 'service.m-restaurant-meal'], 'stew soup pie cake bread fruit apple cheese meat jerky pastry biscuit feast'],
  ['an animal', ['good.cat-animal'], 'dragon wolf cat bird hawk falcon horse hound pet beast mount snake lizard'],
  ['a vehicle', ['good.cat-vehicle', 'good.cat-m-vehicle'], 'cart wagon boat skiff barge motorbike truck van bike'],
  ['a tool or piece of gear', ['good.cat-tool', 'good.cat-m-tool'], 'tool kit rope lantern pick hammer saw drill lockpick compass map lens'],
  ['a gadget', ['good.cat-m-gadget'], 'gadget device gizmo machine contraption camera radio'],
  ['a medicine', ['good.cat-medicine'], 'remedy salve tonic antidote poison elixir ointment bandage'],
  ['hired help', ['labor.skilled-hireling', 'labor.m-skilled-tradesperson'], 'chef baker miner sailor priest gardener tutor teacher scholar guide scout cook clerk mason smith tailor'],
  ['a place or building', ['property.cottage', 'property.m-house', 'property.shop'], 'tower lighthouse hut barn mill manor inn lodge shack warehouse'],
];
const HINT = new Map();
for (const [why, ids, words] of FAMILIES) for (const w of words.split(/\s+/)) HINT.set(stem(w), { why, ids });

const GENERIC = new Set(['of', 'the', 'a', 'an', 'and', 'for', 'item', 'thing', 'stuff', 'some', 'good', 'goods']);
const TIERS = { standard: [50, 500, 5000, 50000], modern: [500, 5000, 50000, 500000] };
const TIER_LABELS = [['Small item', 'pocket change'], ['Useful item', 'a real but easy purchase'], ['Valuable item', 'something to save up for'], ['Treasure', 'a major find or investment']];

function unitPrice(entry, ctx, extra = {}) {
  const e = estimate({ action: 'buy', subject: entry.id, family: null, qty: null, span: null, rarity: null, tier: null, mods: [], assumed: [], ...extra }, ctx);
  return e.ok ? e.typical : null;
}

export function candidateFromEntry(entry, ctx, why) {
  const p = unitPrice(entry, ctx);
  return p > 0 ? { id: entry.id, label: entry.name, why, unit: entry.unit, bu: p, entry, score: 0 } : null;
}

export function candidatesFor(phrase, ctx) {
  const words = phrase.toLowerCase().split(/\s+/).map(w => stem(w.replace(/[^a-z']/g, ''))).filter(w => w && !GENERIC.has(w));
  const out = [], seen = new Set();
  const add = (entry, why, score) => { if (!entry || seen.has(entry.id)) return; const p = unitPrice(entry, ctx); if (!(p > 0)) return; seen.add(entry.id); out.push({ id: entry.id, label: entry.name, why, unit: entry.unit, bu: p, entry, score }); };
  for (const w of words) {
    const h = HINT.get(w);
    if (h) h.ids.forEach((id, i) => add(ctx.byId.get(id), 'Matches "' + w + '": ' + h.why, 10 - i));
  }
  // word overlap with names, aliases and tags
  const scored = [];
  for (const e of ctx.entries) {
    if (seen.has(e.id)) continue;
    let sc = 0;
    const bag = new Set([...(e.name.toLowerCase().split(/\s+/)), ...(e.aliases || []).flatMap(a => a.toLowerCase().split(/\s+/))].map(stem));
    for (const w of words) { if (bag.has(w)) sc += 2; if ((e.tags || []).includes(w)) sc += 1; }
    if (sc > 0) scored.push([sc, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  for (const [sc, e] of scored.slice(0, 3)) add(e, 'Shares words with ' + e.name.toLowerCase(), sc);
  out.sort((a, b) => b.score - a.score);
  const real = out.slice(0, 4);
  const tiers = (ctx.entries.some(e => e.src === 'modern') && !ctx.entries.some(e => e.src === 'srd' || e.src === 'core') ? TIERS.modern : TIERS.standard).map((bu, i) => ({ id: 'tier:' + i, label: TIER_LABELS[i][0], why: TIER_LABELS[i][1], unit: 'each', bu, tier: true }));
  return [...real, ...tiers.slice(0, real.length ? 2 : 4)];
}

// Price of one unit if the new thing were set to `target`, including this world's adjustments.
function tempEntry(name, cand, bu) {
  const base = cand.entry;
  return { id: 'tmp.guess', name, kind: base ? base.kind : cand.kind || 'good', unit: base ? (!base.curve ? base.unit : 'each') : cand.unit || 'each', bu, src: 'user', spread: 0.15, tags: base ? [...base.tags] : cand.tags || ['custom'], aliases: [], group: undefined };
}
export function previewWith(ctx, name, cand, bu, q) {
  const t = tempEntry(name, cand, bu);
  ctx.byId.set(t.id, t);
  try {
    const one = estimate({ action: 'buy', subject: t.id, family: null, qty: null, span: null, rarity: null, tier: null, mods: [], assumed: [] }, ctx);
    const full = estimate({ ...q, subject: t.id, family: null, rarity: null }, ctx);
    return { one, full };
  } finally { ctx.byId.delete(t.id); }
}
// The stored price that makes the in-world price come out at `target` after economy tags.
export function storedPrice(ctx, name, cand, target) {
  const t = tempEntry(name, cand, target);
  ctx.byId.set(t.id, t);
  try {
    const e = estimate({ action: 'buy', subject: t.id, family: null, qty: null, span: null, rarity: null, tier: null, mods: [], assumed: [] }, ctx);
    if (!e.ok) return target;
    return Math.max(0.01, target * (target / e.typical));
  } finally { ctx.byId.delete(t.id); }
}
export function newItemFrom(name, phrase, cand, bu) {
  const base = cand.entry;
  const aliases = [...new Set([phrase.toLowerCase(), phrase.toLowerCase().split(' ').map((w, i, a) => (i === a.length - 1 ? stem(w) : w)).join(' ')])].filter(a => a && a !== name.toLowerCase());
  const unitOk = u => ['each', 'day', 'lb', 'week', 'month', 'year'].includes(u);
  return { name, kind: base ? base.kind : cand.kind || 'good', unit: base ? (!base.curve && unitOk(base.unit) ? base.unit : 'each') : unitOk(cand.unit) ? cand.unit : 'each', bu: +bu.toPrecision(5), tags: base ? [...new Set([...(base.tags || []), 'custom'])] : cand.tags || ['custom'], aliases, spread: 0.2 };
}
// real things of the same kind, nearest in price to the guess: "is it more like a rat, or a cat?"
export function comparablesFor(kindTest, target, ctx, skip) {
  const pool = ctx.entries.filter(e => !skip.has(e.id) && kindTest(e) && !e.curve);
  const priced = [];
  for (const e of pool) { const c = candidateFromEntry(e, ctx, 'About the same price and kind'); if (c) priced.push(c); }
  const dist = c => Math.abs(Math.log(Math.max(c.bu, 1) / Math.max(target, 1)));
  priced.sort((a, b) => dist(a) - dist(b));
  const real = priced.filter(c => !c.entry.isCategory), any = priced.find(c => c.entry.isCategory);
  // the nearest below, the nearest above and the closest overall, shown from cheap to dear, so you can say "smaller than that" or "bigger"
  const below = real.filter(c => c.bu <= target).slice(0, 2), above = real.filter(c => c.bu > target).slice(0, 1), pick = [...below, ...above];
  for (const c of real) { if (pick.length >= 3) break; if (!pick.includes(c)) pick.push(c); }
  pick.sort((a, b) => a.bu - b.bu);
  return any ? [...pick, any] : pick;
}
export { niceRound };
