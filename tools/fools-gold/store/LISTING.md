# App Store listing (draft, Pyrite 1.1)

Everything here is ready to paste into App Store Connect. Items marked CONFIRM need a decision from Leo.

## Identity
- **Name** (30 max): `Fool's Gold Price Estimator`  (CONFIRM: "Fool's Gold" is a common phrase; check the App Store for name clashes before reserving it. Fallback: `Fool's Gold for Game Masters`.)
- **Subtitle** (30 max): `Believable prices, instantly`
- **Bundle ID**: `nyc.firebird.foolsgold`  (CONFIRM)
- **Primary category**: Utilities. **Secondary**: Productivity.
- **Copyright**: `2026 Firebird Games`
- **Price**: CONFIRM (free recommended for 1.0; there is nothing to monetise without accounts or ads).
- **Support URL**: https://leolion.com/building/fools-gold/support.html
- **Privacy policy URL**: https://leolion.com/building/fools-gold/privacy.html
- **Marketing URL**: https://leolion.com/building/fools-gold/  (optional)

## Promotional text (170 max)
Type what the party wants to buy and get a price that feels right: a range, a reason, and a cart for the whole shopping trip. Works offline. Nothing leaves your device.

## Description
Fool's Gold is a price calculator for game masters. Type what a player wants, in plain words, and get a believable price in coins.

"5 healing potions in a village, rare" "a night at an inn, no questions asked" "hire a skilled blacksmith for a week"

WHAT YOU GET
- A price and a range, with a plain explanation of why. Pick inside the range for the story.
- A cart for the whole shopping trip. Type a list, change quantities with one tap, haggle the total up or down, and copy the receipt.
- Four calibrated worlds: Standard Fantasy in gold, Industrial Fantasy, Modern day in US dollars, and Science fiction in credits. Start a custom world from any of them.
- Over 1,000 items: weapons, armor, adventuring gear and the standard packs, potions and magic items, animals, hired help, travel, lodging, property, spellcasting, and everyday modern goods.
- Magic that counts: enchanted, blessed and cursed items are priced by rarity.
- A guess for anything it doesn't know, built from tags you can adjust, with real items to compare against.
- Teach it your table's economy: type "a healing potion costs 40 gp" or "black market takes 30%".

BUILT FOR THE TABLE
- Say it instead of typing: tap the microphone and dictate a price check or a whole shopping list.
- Works fully offline. No account, no ads, no tracking, and no data leaves your device.
- Large text, night and day themes, and a phone-first layout you can run with one hand.

Prices are estimates meant to feel right at a game table. Equipment prices follow the published SRD 5.1. Everything else is original to Fool's Gold.

## Keywords (100 max, no trademarks)
`game master,dm,rpg,tabletop,price,shop,loot,economy,merchant,haggle,fantasy,sci-fi,calculator,gm,voice`

## What's New (1.0)
First release.

## Age rating (answers for the questionnaire)
- Cartoon or fantasy violence: **Infrequent/Mild** (weapons appear as priced items; no depictions).
- Realistic violence, sexual content, profanity, horror, gambling, contests: **None**.
- Alcohol, tobacco or drug references: **Infrequent/Mild** (beer, wine and cigarettes appear as priced goods).
- Medical/treatment information: **None**.
- Unrestricted web access, user-generated content sharing: **No**.
- Expected rating: **12+**. (If "weapons as items" is counted more strictly, 12+ still holds.)

## App Privacy ("nutrition label")
- **Data Not Collected.** No tracking, no analytics, no third-party SDKs, no network requests of its own at runtime. Dictation (optional) uses Apple's speech recognition on the device's behalf; the app never receives audio. If App Store Connect asks about audio data, answer that it is not collected by the app.
- Export compliance: uses no encryption beyond what the OS provides. Set `ITSAppUsesNonExemptEncryption` to `false`.

## App Review notes
- No login or account is required. Everything works offline from first launch.
- Try: type `5 healing potions`, tap the + button for a guided flow, tap Add then the cart pill to see the cart and haggle.
- The content is a price catalogue for tabletop role-playing games. The optional "Crime and underworld" list (forged papers, bribes, hired killers) is **off by default** and sits in Settings, World, Item lists.
- Equipment prices use the SRD 5.1 under CC BY 4.0; attribution is in Settings, About. The app is not affiliated with Wizards of the Coast.
- The microphone and speech recognition permissions are requested only when the user taps the dictation button, and every feature works without them.
- No data is collected; there are no third-party services.

## Screenshots
Generated from the real app by `tools/fools-gold/store/screenshots.mjs` (iPhone 6.9 inch and 6.7 inch, six scenes: ask, price, browse, cart, magic, guess). Submit iPhone only for 1.0 (iPad screenshots are not required if the app is marked iPhone only). The 1024 x 1024 icon comes from `tools/fools-gold/store/icon.mjs`.
