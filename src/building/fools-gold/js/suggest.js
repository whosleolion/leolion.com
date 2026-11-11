// Suggested prompts for the empty screen: a ladder from one plain item up to several stacked circumstances,
// drawn from each item list that is switched on. Every suggestion is checked against the world before it is shown.
import { parse } from './parser.js?v=7656d9e0';
import { estimate } from './engine.js?v=7656d9e0';

// level 1 a plain item, 2 a quantity, 3 a service for a time, 4 one circumstance,
// 5 two circumstances, 6 three stacked, 7 an event or a long trip
const LADDER = {
  srd: {
    1: ['buy a longsword', 'buy chain mail', 'buy a shortbow'],
    2: ['sell 5 longswords', 'buy 20 arrows', 'buy 10 torches'],
    3: ['hire a mercenary for a week'],
    4: ['sell 20 rations at a trading outpost', 'buy a longsword in the capital'],
    5: ['appraise a masterwork rapier', 'sell a longsword at a pawnshop'],
    6: ['buy 3 longswords black market rush'],
  },
  fantasy: {
    1: ['a night at an inn', 'buy a healing potion'],
    2: ['sell 5 healing potions', 'buy 2 healing potions'],
    3: ['hire a skilled blacksmith for a week', 'hire a guide for 3 days'],
    4: ['a night at an inn in the capital', 'sell 5 rare potions'],
    5: ['sell 5 rare potions black market', 'sell 5 rare potions at an auction'],
    6: ['sell 5 rare potions black market rush'],
    7: ['wand during a siege', 'price for train ride between two major capital cities, 3 days travel expensive'],
  },
  scifi: {
    1: ['buy a pulse pistol', 'buy a medkit'],
    2: ['buy 4 oxygen canisters', 'buy 3 medkits'],
    3: ['hire a hacker for 2 days', 'hire a ship pilot for a week'],
    4: ['a week of interstellar passage', 'sell 3 rare earth ore at a trading outpost'],
    5: ['hire a ship pilot for a week rush', 'buy a cyberdeck black market'],
    6: ['buy 2 cybernetic eyes black market rush'],
    7: ['a month of station apartment rent in the capital'],
  },
  modern: {
    1: ['buy a laptop', 'buy a smartphone'],
    2: ['buy 3 pizzas', 'buy 2 laptops'],
    3: ['hire a lawyer for 2 days', 'hire an electrician for a day'],
    4: ['taxi ride in the capital', 'a month of rent in a major city, medium apartment'],
    5: ['dinner for 2 at a fancy restaurant', 'sell a used car at an auction'],
    6: ['sell 2 used laptops black market rush'],
    7: ['flight 1500 miles', '6 months of rent in a city'],
  },
};
const ORDER = ['srd', 'fantasy', 'scifi', 'modern'];

function works(text, ctx) {
  try {
    const q = parse(text, ctx).query;
    if (!q.subject && !q.family) return false;
    const r = estimate(q, ctx);
    return !!(r && r.ok && r.typical > 0);
  } catch (e) { return false; }
}

let memo = { ctx: null, out: [] };
export function suggestPrompts(world, ctx, max = 12) {
  if (memo.ctx === ctx) return memo.out;
  const lists = ORDER.filter(l => (world.lists || []).includes(l));
  const ladders = lists.map(l => {
    const out = [];
    for (let lvl = 1; lvl <= 7; lvl++) {
      const hit = (LADDER[l][lvl] || []).find(t => works(t, ctx));
      if (hit) out.push({ lvl, text: hit, list: l });
    }
    return out;
  });
  // give each switched-on list an even share, always starting with its simplest and reaching for its most complex
  const share = Math.max(2, Math.floor(max / Math.max(1, ladders.length)));
  const picked = [];
  for (const lad of ladders) {
    if (lad.length <= share) { picked.push(...lad); continue; }
    for (let i = 0; i < share; i++) picked.push(lad[Math.round(i * (lad.length - 1) / (share - 1))]);
  }
  const seen = new Set();
  const out = picked
    .sort((a, b) => a.lvl - b.lvl || ORDER.indexOf(a.list) - ORDER.indexOf(b.list))
    .filter(x => (seen.has(x.text) ? false : (seen.add(x.text), true)))
    .slice(0, max + 2)
    .map(x => x.text);
  memo = { ctx, out: out.length ? out : ['buy a longsword'] };
  return memo.out;
}
