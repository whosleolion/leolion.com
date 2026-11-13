# Fool's Gold calibration

How prices are made to feel right, what has been done so far, and how content changes ship from here on.

Current content: **Pyrite 1.0** (2026-11-13), "the calibration baseline". Run `node tools/fools-gold/content-report.mjs` for live counts.

## The scale model

- One **base unit (bu)** is about one copper piece, which is about one US dollar. Coin worlds count in bu; dollar worlds count cents.
- The SRD, Fantasy and Sci-fi lists are written in bu. The Modern list is written in **cents** (so a $4.50 coffee is 450).
- `world.js` reconciles the two at compile time:
  - dollar world (`symbol '$'`, `decimal 100`): SRD, Fantasy and Sci-fi entries are multiplied by 100 (bu, per-mile rate, rarity-curve scale);
  - every other world: Modern entries are divided by 100.
- Typed prices (base overrides, custom items, agreed cart prices) are stored in the world's own units. When the currency switches between coin and dollar, they are rescaled by the same factor so buying power is kept (40 gp becomes $40).
- A **home list** wins words that exist in more than one list: Modern in a dollar world, Sci-fi when the baseline is sci-fi, otherwise the first list. Other lists remain available.
- The list's price is the **middle of the range**: the base range is symmetric on a log scale (`lo = price / (1 + spread)`, `hi = price * (1 + spread)`), so a listed 1 gp rope prints as 1 gp.

## Where numbers come from

| List | Count | Source |
|---|---|---|
| SRD | about 190 + 40 gear | SRD 5.1 equipment prices (weapons, armor, adventuring gear, the seven packs). Verified against the SRD tables. |
| Fantasy | about 185 | Original. Services, lodging, hired help, travel, magic categories (rarity curves), property. Tuned so a gold piece buys about what a dollar does. |
| Sci-fi | about 180 | Original, in credits, 1 credit about 1 US dollar. |
| Modern | about 420 | Original estimates for a mid-size US city around 2025, in cents. About 420 entries are tagged `derived`, which means an estimate, not a source. |

Entries tagged `derived` should be treated as estimates and are the first place to look when a price feels off.

## Rules that move prices

- **Spread and the middle.** Each entry has a spread (default 0.1, user items 0.15, derived items 0.2 to 0.25). The result shows the range; the typical price is the geometric middle.
- **Tiers** for services, lodging, travel, hired help and spells: budget, standard, expensive, luxury. `very`, `extremely`, `super` push a tier or a rarity one step further out.
- **Rarity curves** for magic categories: `consumable` and `permanent` curves give a mid price per rarity with a band.
- **Magic on an ordinary item** (`enchanted`, `magical`, `blessed`, `+1` to `+3`): item price plus a premium of 0.6 times the permanent curve for the item's rarity (default common). `+1` is uncommon, `+2` rare, `+3` very rare. A curse implies magic and multiplies the whole price by 0.3 to 0.7 (it sells low).
- **Time**: day, week, month, year, and hour (a working day is 8 hours, a night is 24).
- **Circumstances** (place, channel, urgency, condition, provenance, events): buy and sell ranges per modifier; facts typed as "X takes N%" or "pays N%" set the sell side only.
- **World dials**: price level, volatility, stacking, sell fraction, rounding.

## The unknown-item guess

`appraise.js` prices a thing the app has no entry for, from tags a DM can read: kind (13), size, material, craft, magic, rarity, demand. The product of multipliers starts from a kind base in copper units; magic adds a premium by rarity instead of multiplying. The result is scaled to the world (`guessScale`: x100 in a dollar world with coin lists, x30 with Modern alone). Real items of the same kind are shown for comparison (nearest below, nearest above, closest, and the kind's generic entry).

## How calibration is checked

- `tools/fools-gold/test.mjs`: golden sentences, alias and ambiguity checks (every entry name parses to itself, no ambiguous words inside a list), scaling checks, magic, hours, facts, cart, content patch metadata.
- Probe scripts (see the session scratchpad history): price a list of words in a world and print the typical price, tier and rarity.
- Persona audits: four DM personas (homebrew economy, table shopkeeper, modern and sci-fi campaign, chaotic first-timer and accessibility) driving the live build. The modern audit found about 60% of 100 checked everyday items within 40% of real prices, and most of the rest were parsing, scaling and list-priority problems, which Pyrite 1.0 addresses.

### Anchor prices (should not move without a patch note)

```

Standard Fantasy (gold, SRD + Fantasy)
  longsword                         15 gp
  dagger                            2 gp
  dagger enchanted                  120 gp
  rare enchanted dagger             3,000 gp
  healing potion                    50 gp
  night at an inn                   5 sp
  meal                              3 sp
  rations                           5 sp
  rope                              1 gp
  torch                             1 cp
  riding horse                      75 gp
  hire a skilled blacksmith for a week21 gp
  explorers pack                    10 gp
  ball bearings                     1 gp
  plate armor                       1,500 gp
  chain mail                        75 gp

Modern day (US dollars)
  coffee                            $4.50
  taxi ride                         $26.00
  motel room                        $95.00
  lawyer for 2 hours                $600
  laptop                            $1,200
  smartphone                        $850
  pistol                            $600
  used car                          $12,000
  apartment rent                    $1,700
  blanket                           $25.00
  a dozen eggs                      $4.60
  haircut                           $38.00
  plane ticket to europe            $1,000

Sci-fi (credits)
  pulse pistol                      900 credits
  medkit                            120 credits
  oxygen canister                   45 credits
  interstellar passage for a week   6,300 credits
  hire a hacker for 2 days          unknown
```

## Known gaps (the calibration to-do list)

- Modern: hourly entries for professional services (lawyer, babysitter, plumber) are day rates scaled by hours; per-hour entries would be truer. Rentals ("rent a car for a week") fall to purchase prices unless an entry exists.
- Modern: international and long-distance travel, fuel by the gallon, and consumables have few entries.
- Sci-fi: labor and crime services (hacker, fixer) exist only in Modern.
- Fantasy and SRD: wild animals and crafting components are sparse; pack contents are single items, not breakdowns.
- Words: fuzzy suggestions sometimes propose a wrong near-word ("fork" to "fort"). Unknown modern gear falls to the guess, which is only as good as its kind base prices.
- Typed facts do not yet carry the units they were typed in ("per night" is shown but not stored).
- Mixed worlds (several lists on) resolve shared words by the home list; the result card does not yet name the list it came from or offer the alternate.

## Content patches from here on

A **content patch** is a numbered, named change to the lists, words or calibration rules. The current line is named **Pyrite**; patches are `Pyrite 1.0`, `1.1`, and so on. A new name starts when the scale model changes.

The patch lexicon (kinds of change): **Stock** (items added or removed), **Tune** (prices or scales recalibrated), **Words** (aliases, vocabulary, parser), **Rules** (engine behaviour that moves prices), **World** (presets and currency), **Fix** (a wrong price or match corrected).

To ship a patch:

1. Add or change entries (broad and likely-to-come-up-in-play first, then deeper). Mark estimates `derived`.
2. Add a new object at the **top** of `PATCHES` in `js/content.js`, one `[kind, sentence]` line per change. Quote counts from `content-report.mjs`.
3. Run `node tools/fools-gold/stamp.mjs`, `node tools/fools-gold/test.mjs`, the smoke test and the clip audit.
4. If a patch changes a price a DM may already rely on, say so in a **Tune** line with the old and new numbers. Anchor prices above change only with a patch note.
5. The app shows the content name and the patch lines in Settings, About, and tells a returning user once ("Prices updated: Pyrite 1.1").

## Calibrated worlds first, custom second (built in Pyrite 1.0, plan for the rest)

Phase 1, shipped: the four calibrated worlds (Standard Fantasy, Industrial Fantasy, Modern day, Science fiction) are the front door in the world picker. Their **item lists and money are fixed** (a note and a disabled form explain why), while facts, dials, custom items and words still apply on top. A **custom world** is a copy that remembers its origin (`world.based`) and is marked `custom`. Saves from before this change migrate: a preset world that still matches its preset stays calibrated, anything the user changed becomes a custom world. Anchor prices for each calibrated world are tests (CW2 to CW6).

Phase 2, shipped in Pyrite 1.1 and 1.2: golden-price tables (about 115 phrases across the four worlds, `golden.json`, regenerated by `golden-update.mjs`), spell and scroll words, iconic items, strongholds, rentals, sci-fi crews and charters. A custom world now shows where it began and which patches have landed since, lists your own prices that sit on top of list items and prices for items that left the list, and can match its lists and money to the calibrated world again while keeping your items, words and facts.

Still open:
- Bulk "confirm the estimates": list the least certain (`derived`) entries a DM has priced and let them confirm or correct them in one pass.
- Rebase beyond lists and money: carry a custom world's own prices across a scale change automatically when a patch changes the scale model.
- Modern: per-hour entries for parking and taxis; more consumables and international travel.
- Fantasy and SRD: wild animals, crafting components, and pack contents as parts.
