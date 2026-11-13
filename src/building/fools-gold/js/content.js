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
