// Regenerates tools/fools-gold/golden.json: the price a calibrated world gives for each phrase.
// Run it after a content patch, read the diff, and keep only the changes the patch meant to make.
import { writeFileSync } from 'node:fs';
import { presetWorld, normalizeWorld } from '../../src/building/fools-gold/js/store.js';
import { compileWorld } from '../../src/building/fools-gold/js/world.js';
import { parse } from '../../src/building/fools-gold/js/parser.js';
import { estimate } from '../../src/building/fools-gold/js/engine.js';
import { formatMoney } from '../../src/building/fools-gold/js/money.js';
export const PHRASES = {
  srd: ['dagger', 'longsword', 'greatsword', 'longbow', 'arrows', 'shield', 'chain mail', 'plate armor', 'leather armor', 'backpack', 'bedroll', 'rations', 'rope', 'torch', 'lantern', 'flask of oil', 'ball bearings', "explorer's pack", 'healing potion', 'potion of greater healing', 'scroll of fireball', 'bag of holding', 'enchanted dagger', 'rare enchanted dagger', 'ring of protection', 'night at an inn', 'a meal', 'ale', 'riding horse', 'warhorse', 'cart', 'rowboat', 'sailing ship', 'hire a skilled blacksmith for a day', 'hire a guide for a day', 'hire a mercenary for a week', 'cast raise dead', 'a cottage', 'a tower', 'a sheep', 'a cow', 'chicken', 'a dozen eggs', 'loaf of bread', 'haircut', 'assassin', "thieves' tools"],
  modern: ['coffee', 'burger', 'pizza', 'a beer', 'groceries for a week', 'taxi ride', 'bus ticket', 'subway ride', 'motel room', 'hotel room', 'apartment rent', 'plane ticket to europe', 'smartphone', 'laptop', 'jeans', 'sneakers', 'winter coat', 'haircut', 'doctor visit', 'lawyer for 2 hours', 'used car', 'new car', 'bicycle', 'pistol', 'kitchen knife', 'a dog', 'a cat', 'movie ticket', 'wedding', 'burner phone', 'lockpick set', 'locksmith'],
  scifi: ['pulse pistol', 'pulse rifle', 'vibro blade', 'medkit', 'oxygen canister', 'space suit', 'cyberdeck', 'cybernetic eye', 'laptop', 'interstellar passage for a week', 'docking fee', 'hire a ship pilot for a week', 'hire a hacker for 2 days', 'station apartment rent', 'meal', 'drink', 'scanner', 'drone', 'hotel room'],
  vcm: ['longsword', 'revolver', 'healing potion', 'night at an inn', 'hire a skilled blacksmith for a week', 'airship passage', 'steamer passage', 'meal', 'newspaper', 'wand', 'a cottage'],
};
export function table() {
  const out = [];
  for (const [id, list] of Object.entries(PHRASES)) {
    const w = presetWorld(id); normalizeWorld(w); const c = compileWorld(w);
    for (const s of list) { const q = parse(s, c).query; const e = q.subject ? estimate(q, c) : null; out.push({ world: id, input: s, price: e && e.ok ? formatMoney(e.typical, w.currency) : 'unknown', item: q.subject ? c.byId.get(q.subject).name : null }); }
  }
  return out;
}
if (process.argv[1] && process.argv[1].endsWith('golden-update.mjs')) { const t = table(); writeFileSync(new URL('./golden.json', import.meta.url), JSON.stringify(t, null, 1) + '\n'); console.log('wrote', t.length, 'rows;', t.filter(r => r.price === 'unknown').length, 'unknown'); }
