// The content patch: which version of the price lists and words this build ships, and what each patch changed.
// A patch is content only (items, prices, words, calibration rules), numbered and named so a world, a bug report or a
// conversation can say exactly which prices it means. The patch lexicon:
//   Stock  = items added or removed        Tune  = prices or scales recalibrated
//   Words  = aliases, vocabulary, parser   Rules = engine and modifier behaviour that moves prices
//   World  = presets and currency          Fix   = a wrong price or a wrong match, corrected
// Add a new entry at the TOP of PATCHES for every content change, and bump CONTENT to match. See tools/fools-gold/CALIBRATION.md.
export const PATCH_KINDS = { Stock: 'Items added or removed', Tune: 'Prices or scales recalibrated', Words: 'Aliases, vocabulary and parser words', Rules: 'Engine rules that move prices', World: 'Presets and currency', Fix: 'A wrong price or match corrected' };

export const PATCHES = [
  {
    id: 'pyrite-1.2', name: 'Pyrite', patch: '1.2', date: '2026-11-15', title: 'Rentals, crews and a way to follow patches',
    lines: [
      ['Stock', 'Things people rent, not buy: "rent a car for a week" is the $70 a day rental, not a $38,000 car. Moving truck, boat, event hall and tuxedo rentals.'],
      ['Stock', 'Sci-fi: shuttle charters, ship rentals, smugglers, bounty hunters and ship crews for hire; "repairs", "docking" and "medic" are understood.'],
      ['World', 'A custom world now shows where it began, which patches have landed since it was last checked, your own prices that sit on top of list items, and prices for items that left the list. One button matches its lists and money to the calibrated world again, keeping your items, words and facts.'],
    ],
  },
  {
    id: 'pyrite-1.1', name: 'Pyrite', patch: '1.1', date: '2026-11-14', title: 'Game-likely gear, spells and strongholds',
    lines: [
      ['Stock', 'Potions of greater, superior and supreme healing; the iconic magic items players ask for (bag of holding, cloak of protection, boots of elvenkind, ring of protection and others); strongholds (tower, fort, estate, temple, abbey, palace) at DMG-scale prices.'],
      ['Words', 'About 90 spell names now point at their casting level, so "cast raise dead" is a 5th level casting and "scroll of fireball" is an uncommon scroll (cantrip and 1st common, 2nd and 3rd uncommon, 4th and 5th rare, 6th to 8th very rare, 9th legendary).'],
      ['Stock', 'Sci-fi: pulse rifle, datapad (laptop), handheld scanner, recon drone; hacker, space suit, meal, drink and hotel room now answer to the words players use.'],
      ['Stock', 'Eggs by the piece, so "a dozen eggs" is 12; a city bus fare ($2.75) alongside the intercity bus.'],
      ['Fix', '"flask of oil" was priced as a tankard (2 cp); it is the oil flask (1 sp). "burger" is the $6 hamburger, not a $13 fast food meal.'],
      ['World', 'Crime and underworld items (forged papers, bribes, hired killers, suppressors, heist crew) sit behind a setting in Item lists, off by default.'],
      ['World', 'Golden prices: about 110 recorded phrases across the four calibrated worlds are now tests, so any price change shows up as a diff.'],
    ],
  },
  {
    id: 'pyrite-1.0', name: 'Pyrite', patch: '1.0', date: '2026-11-13', title: 'The calibration baseline',
    lines: [
      ['Stock', 'Four item lists: SRD equipment, Fantasy (setting, services, hired help, magic categories), Sci-fi, and Modern day. About 980 entries.'],
      ['Stock', 'Modern grew from about 190 to about 420 real-world items: knives, weapons, animals, plants, clothing, household, electronics, foods, services, vehicles, and heist words.'],
      ['Stock', 'Adventuring gear and the seven standard packs (SRD prices), including ball bearings.'],
      ['Tune', 'One scale: 1 base unit is about one copper, which is about one dollar. Dollar worlds count cents, so the coin lists are multiplied by 100 there and the modern list (written in cents) is divided by 100 in every other world.'],
      ['Tune', 'Unknown-item guesses are scaled to the world (x100 with the coin lists in a dollar world, x30 with the modern list alone).'],
      ['Tune', 'Typed prices rescale when the currency switches between coin and dollar, so 40 gp becomes $40.'],
      ['Rules', 'Hours are a time unit: a working day is 8 hours, a night is 24.'],
      ['Rules', 'Magic tags carry weight: enchanted, magical, blessed and +N add an enchantment premium to an ordinary item, set by rarity (0.6 of the permanent-magic curve). A curse implies magic and sells low.'],
      ['Rules', 'Intensifiers push a class or rarity one step: very, extremely, super.'],
      ['Rules', 'Facts about takes/pays apply to the sell side only. Parser words (buy, sell, gp, day, rush...) cannot be redefined.'],
      ['Words', 'Unknown items get a tag guess: kind, size, material, craft, magic, rarity, demand, with real items shown for comparison.'],
      ['World', 'Calibrated worlds are the front door: Standard Fantasy, Industrial Fantasy, Modern day and Science fiction. Their lists and money are fixed. A custom world starts as a copy of one, is marked custom, and remembers where it began.'],
      ['World', 'The world\'s own list wins shared words (modern in a dollar world); other lists remain available.'],
      ['Fix', 'Listed prices read exactly: a 1 gp rope is 1 gp, not 99 cp. The range is now symmetric on a log scale around the listed price.'],
      ['Fix', 'Quantities: zero and negative ignored, absurd amounts capped at a million, "a million" and "a dozen" understood; eggs and roses priced per piece so "a dozen" multiplies correctly.'],
    ],
  },
];

export const CONTENT = PATCHES[0];
export const contentLabel = (c = CONTENT) => c.name + ' ' + c.patch;

// counts per list, for the About page and for patch notes
export function contentCounts(catalog) {
  const out = { srd: 0, fantasy: 0, scifi: 0, modern: 0, total: catalog.length };
  for (const e of catalog) {
    const k = e.src === 'scifi' ? 'scifi' : e.src === 'modern' ? 'modern' : e.src === 'srd' && !e.generic ? 'srd' : 'fantasy';
    out[k]++;
  }
  return out;
}

// the patches a world has not seen: everything newer than the content id it was last settled against
export function patchesSince(id) {
  const i = PATCHES.findIndex(p => p.id === id);
  return i < 0 ? [] : PATCHES.slice(0, i);
}
