// Appraising a thing the app has no entry for, from tags a DM can read at a glance: what kind of thing it is,
// how big, what it is made of, how much craft went in, how rare, how wanted. No AI: a plain product of multipliers,
// started from the words of the phrase, then adjusted by tapping. All numbers are original estimates, 1 bu = 1 cp (fantasy scale).
import { stem } from './world.js?v=e58f1bd6';

export const KINDS = [
  { id: 'thing', label: 'Everyday thing', base: 60, unit: 'each', words: 'thing item object box basket pot pan bowl cup jar bottle bucket candle brush mirror comb toy doll book' },
  { id: 'clothes', label: 'Clothes', base: 80, unit: 'each', words: 'shirt trouser pants dress gown hat cap shoe boot glove scarf cloak cape tunic coat belt sock robe vest apron uniform costume' },
  { id: 'tool', label: 'Tool or gear', base: 150, unit: 'each', words: 'tool kit rope lantern pick hammer saw drill lockpick compass map lens shovel tent bag pack harness tackle' },
  { id: 'weapon', label: 'Weapon', base: 400, unit: 'each', words: 'weapon sword blade knife dagger axe bow crossbow spear lance club mace staff gun pistol rifle musket cannon whip shield' },
  { id: 'jewelry', label: 'Jewelry or luxury', base: 600, unit: 'each', words: 'ring necklace bracelet crown tiara diadem circlet brooch pendant earring locket gem gemstone jewel ruby emerald sapphire diamond pearl perfume silk velvet' },
  { id: 'animal', label: 'Animal', base: 250, unit: 'each', words: 'animal beast pet dog cat bird hawk falcon horse pony mule cow sheep goat pig hen rooster duck rabbit snake lizard dragon wolf ferret' },
  { id: 'plant', label: 'Plant or food', base: 8, unit: 'each', words: 'plant seed flower herb tree fruit apple bread cheese meat stew soup pie cake jerky pastry grain root berry berries vegetable' },
  { id: 'medicine', label: 'Medicine or potion', base: 300, unit: 'each', words: 'medicine cream salve ointment tonic remedy antidote poison elixir potion bandage ointment balm lotion' },
  { id: 'magic', label: 'Magic item', base: 4000, unit: 'each', words: 'magic magical enchanted wand charm talisman amulet orb relic idol rune scroll arcane' },
  { id: 'explosive', label: 'Explosive', base: 500, unit: 'each', words: 'bomb explosive grenade dynamite powder firework charge mine' },
  { id: 'vehicle', label: 'Vehicle', base: 6000, unit: 'each', words: 'cart wagon boat skiff barge ship carriage sled raft sleigh' },
  { id: 'labor', label: 'Hired help', base: 100, unit: 'day', words: 'hireling worker servant assassin hitman guard guide scout tailor stylist cook smith mason sailor clerk courier scribe tutor healer hunter thief spy' },
  { id: 'fee', label: 'Fee or toll', base: 20, unit: 'each', words: 'fee toll tax tithe fine permit licence license bribe levy duty' },
];
const KIND_BY = new Map(KINDS.map(k => [k.id, k]));

export const ROWS = {
  size: { label: 'Size', opts: [['tiny', 'Tiny', 0.25], ['small', 'Small', 0.45], ['medium', 'Medium', 1], ['large', 'Large', 2.5], ['huge', 'Huge', 8]], words: { tiny: 'tiny miniature pocket little', small: 'small short light', large: 'large big great long heavy', huge: 'huge giant massive enormous' } },
  made: { label: 'Made of', opts: [['plain', 'Plain', 1], ['cloth', 'Cloth or wood', 1], ['leather', 'Leather or iron', 1.6], ['steel', 'Steel', 3], ['silver', 'Silver', 9], ['gold', 'Gold', 40], ['gems', 'Gems', 90]], words: { cloth: 'cloth wool linen cotton wooden wood paper straw', leather: 'leather iron bronze copper hide brass', steel: 'steel', silver: 'silver', gold: 'gold golden', gems: 'jeweled jewelled crystal gem diamond ruby emerald' } },
  craft: { label: 'Craft', opts: [['crude', 'Crude', 0.6], ['some', 'Ordinary', 1], ['skilled', 'Skilled', 2], ['master', 'Master-made', 5]], words: { crude: 'crude rough homemade cheap', skilled: 'skilled fine quality handmade', master: 'masterwork masterful exquisite master' } },
  rarity: { label: 'Rarity', opts: [['common', 'Common', 1], ['uncommon', 'Uncommon', 3], ['rare', 'Rare', 12], ['very rare', 'Very rare', 60], ['legendary', 'Legendary', 400]], words: { uncommon: 'uncommon unusual', rare: 'rare scarce exotic', 'very rare': 'unique', legendary: 'legendary mythic' } },
  demand: { label: 'Wanted by', opts: [['few', 'Few', 0.6], ['usual', 'The usual', 1], ['many', 'Many', 1.7], ['craved', 'Everyone', 3.5]], words: { few: 'obscure', many: 'popular useful', craved: 'essential vital' } },
};
// which rows matter for which kind
const SHOW = {
  labor: ['craft', 'demand'], fee: ['demand'], animal: ['size', 'craft', 'rarity', 'demand'], plant: ['size', 'rarity', 'demand'],
  magic: ['size', 'rarity', 'demand'], medicine: ['size', 'craft', 'rarity', 'demand'],
};
export const rowsFor = kind => SHOW[kind] || ['size', 'made', 'craft', 'rarity', 'demand'];
const IGNORED = { labor: ['size', 'made', 'rarity'], fee: ['size', 'made', 'craft', 'rarity'], animal: ['made'], plant: ['made', 'craft'], magic: ['made', 'craft'], medicine: ['made'] };
const optOf = (row, v) => ROWS[row].opts.find(o => o[0] === v) || ROWS[row].opts.find(o => o[2] === 1);

const addWords = (set, id, str) => str.split(/\s+/).forEach(w => w && set.set(stem(w), id));
const KIND_WORDS = new Map(); for (const k of KINDS) addWords(KIND_WORDS, k.id, k.words);
const ROW_WORDS = {}; for (const [r, def] of Object.entries(ROWS)) { ROW_WORDS[r] = new Map(); for (const [v, ws] of Object.entries(def.words)) addWords(ROW_WORDS[r], v, ws); }

// first guess at the tags from the words typed. `found` says which tags came from the words (the rest are defaults).
export function inferTags(phrase) {
  const words = String(phrase || '').toLowerCase().split(/[^a-z']+/).filter(Boolean).map(stem);
  const tags = { kind: 'thing', size: 'medium', made: 'plain', craft: 'some', rarity: 'common', demand: 'usual' }, found = new Set();
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
export function appraise(tags) {
  const k = KIND_BY.get(tags.kind) || KINDS[0], skip = IGNORED[k.id] || [];
  let bu = k.base;
  for (const r of Object.keys(ROWS)) if (!skip.includes(r)) bu *= optOf(r, tags[r])[2];
  return { bu: Math.max(1, bu), unit: k.unit, kind: k };
}

// a spread worth showing: each unsure row (not set by the words) widens the range
export function why(tags, found) {
  const k = KIND_BY.get(tags.kind) || KINDS[0];
  const parts = [k.label.toLowerCase()];
  for (const r of rowsFor(k.id)) { const o = optOf(r, tags[r]); if (r === 'size' && o[0] === 'medium') continue; if (r === 'made' && o[0] === 'plain') continue; if (r === 'rarity' && o[0] === 'common') continue; if (r === 'craft' && o[0] === 'some') continue; if (r === 'demand' && o[0] === 'usual') continue; parts.push(o[1].toLowerCase()); }
  return parts.join(', ');
}

export const tagCandidate = (tags, found, phrase) => {
  const a = appraise(tags);
  return { id: 'tags', label: 'Your tags', why: why(tags, found), unit: a.unit, bu: a.bu, entry: null, kind: a.kind.id === 'labor' ? 'labor' : a.kind.id === 'fee' ? 'service' : 'good', tags: ['custom', a.kind.id, ...(tags.rarity !== 'common' ? [tags.rarity] : [])], score: 100, tagged: true };
};
export const optionsOf = row => ROWS[row].opts.map(o => ({ id: o[0], label: o[1] }));
export const rowLabel = row => ROWS[row].label;
