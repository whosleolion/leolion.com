// Appraising a thing the app has no entry for, from tags a DM can read at a glance: what kind of thing it is,
// how big, what it is made of, how much craft went in, how rare, how wanted. No AI: a plain product of multipliers,
// started from the words of the phrase, then adjusted by tapping. All numbers are original estimates, 1 bu = 1 cp (fantasy scale).
import { stem } from './world.js?v=2e0310b0';

export const KINDS = [
  { id: 'thing', label: 'Everyday thing', base: 60, unit: 'each', words: 'thing item object box basket pot pan bowl cup jar bottle bucket candle brush mirror comb toy doll book' },
  { id: 'clothes', label: 'Clothes', base: 80, unit: 'each', words: 'shirt trouser pants dress gown hat cap shoe boot glove scarf cloak cape tunic coat belt sock robe vest apron uniform costume' },
  { id: 'tool', label: 'Tool or gear', base: 150, unit: 'each', words: 'tool kit rope lantern pick hammer saw drill lockpick compass map lens shovel tent bag pack harness tackle' },
  { id: 'weapon', label: 'Weapon', base: 400, unit: 'each', words: 'weapon sword blade knife dagger axe bow crossbow spear lance club mace staff gun pistol rifle musket cannon whip shield' },
  { id: 'jewelry', label: 'Jewelry or luxury', base: 600, unit: 'each', words: 'ring necklace bracelet crown tiara diadem circlet brooch pendant earring locket gem gemstone jewel ruby emerald sapphire diamond pearl perfume silk velvet' },
  { id: 'animal', label: 'Animal', base: 250, unit: 'each', words: 'animal beast pet dog cat bird hawk falcon horse pony mule cow sheep goat pig hen rooster duck rabbit snake lizard dragon wolf ferret weasel stoat otter mink mouse rat squirrel fox deer boar bear lion tiger elk moose frog toad bat owl eagle crow spider crab fish shark whale monkey ape badger beaver hare raccoon skunk lizard turtle' },
  { id: 'plant', label: 'Plant or food', base: 8, unit: 'each', words: 'plant seed flower herb tree fruit apple bread cheese meat stew soup pie cake jerky pastry grain root berry berries vegetable' },
  { id: 'medicine', label: 'Medicine or potion', base: 300, unit: 'each', words: 'medicine cream salve ointment tonic remedy antidote poison elixir potion bandage ointment balm lotion' },
  { id: 'magic', label: 'Magic item', base: 4000, unit: 'each', words: 'wand charm talisman amulet orb relic idol rune scroll' },
  { id: 'explosive', label: 'Explosive', base: 500, unit: 'each', words: 'bomb explosive grenade dynamite powder firework charge mine' },
  { id: 'vehicle', label: 'Vehicle', base: 6000, unit: 'each', words: 'cart wagon boat skiff barge ship carriage sled raft sleigh' },
  { id: 'labor', label: 'Hired help', base: 100, unit: 'day', words: 'hireling worker servant assassin hitman guard guide scout tailor stylist cook smith mason sailor clerk courier scribe tutor healer hunter thief spy' },
  { id: 'fee', label: 'Fee or toll', base: 20, unit: 'each', words: 'fee toll tax tithe fine permit licence license bribe levy duty' },
];
const KIND_BY = new Map(KINDS.map(k => [k.id, k]));

export const ROWS = {
  size: { label: 'Size', opts: [['tiny', 'Tiny', 0.25], ['small', 'Small', 0.45], ['medium', 'Medium', 1], ['large', 'Large', 2.5], ['huge', 'Huge', 8]], words: { tiny: 'tiny miniature pocket little', small: 'small short light', large: 'large big great long heavy', huge: 'huge giant massive enormous' } },
  made: { label: 'Made of', opts: [['plain', 'Plain', 1], ['cloth', 'Cloth, wood', 1], ['leather', 'Leather, iron', 1.6], ['steel', 'Steel', 3], ['silver', 'Silver', 9], ['gold', 'Gold', 40], ['gems', 'Gems', 90]], words: { cloth: 'cloth wool linen cotton wooden wood paper straw', leather: 'leather iron bronze copper hide brass', steel: 'steel', silver: 'silver', gold: 'gold golden', gems: 'jeweled jewelled crystal gem diamond ruby emerald' } },
  craft: { label: 'Craft', opts: [['crude', 'Crude', 0.6], ['some', 'Ordinary', 1], ['skilled', 'Skilled', 2], ['master', 'Master', 5]], words: { crude: 'crude rough homemade cheap', skilled: 'skilled fine quality handmade', master: 'masterwork masterful exquisite master' } },
  aura: { label: 'Magic', opts: [['none', 'Mundane', 1], ['magic', 'Enchanted', 1], ['blessed', 'Blessed', 1], ['cursed', 'Cursed', 1]], words: { magic: 'enchanted magic magical arcane runed imbued spelled charmed warded mystic mystical glowing humming', blessed: 'blessed holy consecrated', cursed: 'cursed haunted hexed jinxed' } },
  rarity: { label: 'Rarity', opts: [['common', 'Common', 1], ['uncommon', 'Uncommon', 3], ['rare', 'Rare', 12], ['very rare', 'Very rare', 60], ['legendary', 'Legendary', 400]], words: { uncommon: 'uncommon unusual', rare: 'rare scarce exotic', 'very rare': 'unique', legendary: 'legendary mythic' } },
  demand: { label: 'Wanted by', opts: [['few', 'Few', 0.6], ['usual', 'The usual', 1], ['many', 'Many', 1.7], ['craved', 'Everyone', 3.5]], words: { few: 'obscure', many: 'popular useful', craved: 'essential vital' } },
};
// which rows matter for which kind
const SHOW = {
  labor: ['craft', 'demand'], fee: ['demand'], animal: ['size', 'craft', 'aura', 'rarity', 'demand'], plant: ['size', 'aura', 'rarity', 'demand'],
  magic: ['size', 'rarity', 'demand'], medicine: ['size', 'craft', 'aura', 'rarity', 'demand'],
};
export const rowsFor = kind => SHOW[kind] || ['size', 'made', 'craft', 'aura', 'rarity', 'demand'];
const IGNORED = { labor: ['size', 'made', 'rarity', 'aura'], fee: ['size', 'made', 'craft', 'rarity', 'aura'], animal: ['made'], plant: ['made', 'craft'], magic: ['made', 'craft', 'aura'], medicine: ['made'] };
const optOf = (row, v) => ROWS[row].opts.find(o => o[0] === v) || ROWS[row].opts.find(o => o[2] === 1);

const addWords = (set, id, str) => str.split(/\s+/).forEach(w => w && set.set(stem(w), id));
const KIND_WORDS = new Map(); for (const k of KINDS) addWords(KIND_WORDS, k.id, k.words);
const ROW_WORDS = {}; for (const [r, def] of Object.entries(ROWS)) { ROW_WORDS[r] = new Map(); for (const [v, ws] of Object.entries(def.words)) addWords(ROW_WORDS[r], v, ws); }

// first guess at the tags from the words typed. `found` says which tags came from the words (the rest are defaults).
export function inferTags(phrase) {
  const words = String(phrase || '').toLowerCase().split(/[^a-z']+/).filter(Boolean).map(stem);
  const tags = { kind: 'thing', size: 'medium', made: 'plain', craft: 'some', aura: 'none', rarity: 'common', demand: 'usual' }, found = new Set();
  for (const w of words) { const k = KIND_WORDS.get(w); if (k) { tags.kind = k; found.add('kind'); } }
  for (const r of Object.keys(ROWS)) for (const w of words) { const v = ROW_WORDS[r].get(w); if (v) { tags[r] = v; found.add(r); } }
  // a plain kind-leaning default: weapons are usually steel, jewelry gold-ish, clothes cloth
  if (!found.has('made')) { if (tags.kind === 'weapon') tags.made = 'steel'; else if (tags.kind === 'jewelry') tags.made = 'silver'; else if (tags.kind === 'clothes') tags.made = 'cloth'; else if (tags.kind === 'tool') tags.made = 'leather'; }
  if (!found.has('size') && tags.kind === 'jewelry') tags.size = 'small';
  if (!found.has('craft') && (tags.kind === 'jewelry' || tags.kind === 'magic')) tags.craft = 'skilled';
  if (tags.kind === 'magic' && !found.has('rarity')) tags.rarity = 'uncommon';
  return { tags, found: [...found] };
}

// one unit, in base units
// magic on an ordinary thing adds a premium set by rarity (copper-sized units, like the rest); a curse sells the whole thing low
const PREMIUM = { common: 12000, uncommon: 60000, rare: 300000, 'very rare': 1500000, legendary: 7500000 };
export const auraOn = tags => tags.aura && tags.aura !== 'none' && !(IGNORED[tags.kind] || []).includes('aura');
export function appraise(tags) {
  const k = KIND_BY.get(tags.kind) || KINDS[0], skip = IGNORED[k.id] || [], on = auraOn(tags);
  let bu = k.base;
  for (const r of Object.keys(ROWS)) { if (skip.includes(r) || r === 'aura' || (r === 'rarity' && on)) continue; bu *= optOf(r, tags[r])[2]; }
  if (on) { bu += PREMIUM[tags.rarity] * (tags.aura === 'blessed' ? 0.8 : 1); if (tags.aura === 'cursed') bu *= 0.45; }
  return { bu: Math.max(1, bu), unit: k.unit, kind: k };
}

// a spread worth showing: each unsure row (not set by the words) widens the range
export function why(tags, found) {
  const k = KIND_BY.get(tags.kind) || KINDS[0];
  const parts = [k.label.toLowerCase()];
  for (const r of rowsFor(k.id)) { const o = optOf(r, tags[r]); if (r === 'aura' && o[0] === 'none') continue; if (r === 'size' && o[0] === 'medium') continue; if (r === 'made' && o[0] === 'plain') continue; if (r === 'rarity' && o[0] === 'common') continue; if (r === 'craft' && o[0] === 'some') continue; if (r === 'demand' && o[0] === 'usual') continue; parts.push(o[1].toLowerCase()); }
  return parts.join(', ');
}

// base units are cp-like. A dollar world counts cents: with the coin lists on, 1 cp is about $1 (x100); with the modern list alone,
// everyday things should land near real prices (x30)
export function guessScale(ctx) {
  const cur = (ctx.world && ctx.world.currency) || {};
  if (cur.symbol !== '$' || cur.decimal !== 100) return 1;
  return ctx.entries.some(e => e.src === 'srd' || e.src === 'core') ? 100 : 30;
}
export const tagCandidate = (tags, found, phrase, scale = 1) => {
  const a = appraise(tags); a.bu *= scale;
  return { id: 'tags', label: 'Your tags', why: why(tags, found), unit: a.unit, bu: a.bu, entry: null, kind: a.kind.id === 'labor' ? 'labor' : a.kind.id === 'fee' ? 'service' : 'good', tags: ['custom', a.kind.id, ...(tags.rarity !== 'common' ? [tags.rarity] : []), ...(auraOn(tags) ? [tags.aura === 'cursed' ? 'cursed' : 'magic'] : [])], score: 100, tagged: true };
};
export const optionsOf = row => ROWS[row].opts.map(o => ({ id: o[0], label: o[1] }));
export const rowLabel = row => ROWS[row].label;

// what tapping each option would do to the price, against the one now chosen: "-55%", "+60%", "x12"
export function optionEffects(tags, row) {
  const cur = appraise(tags).bu, now0 = optOf(row, tags[row])[0];
  return ROWS[row].opts.map(o => {
    const r = appraise({ ...tags, [row]: o[0] }).bu / cur, now = o[0] === now0;
    const d = now ? '' : r >= 2 ? '\u00d7' + (r >= 10 ? Math.round(r) : +r.toFixed(1)) : (r >= 1.005 ? '+' : r <= 0.995 ? '\u2212' : '') + (Math.abs(r - 1) < 0.005 ? 'same' : Math.min(99, Math.round(Math.abs(r - 1) * 100)) + '%');
    return { id: o[0], label: o[1], delta: d, now };
  });
}
export const defaultsOf = tags => {
  const base = { size: 'medium', made: 'plain', craft: 'some', aura: 'none', rarity: 'common', demand: 'usual' };
  if (tags.kind === 'weapon') base.made = 'steel'; else if (tags.kind === 'jewelry') { base.made = 'silver'; base.size = 'small'; base.craft = 'skilled'; } else if (tags.kind === 'clothes') base.made = 'cloth'; else if (tags.kind === 'tool') base.made = 'leather';
  else if (tags.kind === 'magic') { base.craft = 'skilled'; base.rarity = 'uncommon'; }
  return base;
};

// which catalog entries count as this kind of thing, so a guess can be set beside real ones
const KIND_TEST = {
  animal: e => has(e, 'animal'), clothes: e => has(e, 'clothing'), weapon: e => has(e, 'weapon') && !has(e, 'magic'), tool: e => has(e, 'tool') || has(e, 'gadget'), jewelry: e => has(e, 'jewelry') || has(e, 'gem'),
  plant: e => has(e, 'plant') || has(e, 'food'), medicine: e => has(e, 'medicine'), magic: e => has(e, 'magic') && e.kind === 'good', explosive: e => e.library === 'explosives', vehicle: e => has(e, 'vehicle'),
  labor: e => e.kind === 'labor', fee: e => e.library === 'fees' || has(e, 'fee'), thing: e => e.kind === 'good' && !has(e, 'weapon') && !has(e, 'magic'),
};
const has = (e, t) => (e.tags || []).includes(t);
export const sameKind = (kind, e) => (KIND_TEST[kind] || KIND_TEST.thing)(e);
