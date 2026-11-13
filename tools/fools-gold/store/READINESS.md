# App Store readiness

Status as of Pyrite 1.1. Legend: DONE built and checked here; NEEDS YOU an account, Mac or decision that I cannot do from this environment.

## Product quality
| Item | Status |
|---|---|
| Runs fully offline, no network requests (fonts self-hosted) | DONE, tested in the smoke test |
| Calibrated prices with golden-price tests (110 phrases, 4 worlds) | DONE |
| Unknown items get a guess, a quick price and a "remember it" path | DONE |
| Magic, rarity, hours, currency scaling and list priority | DONE |
| Accessibility basics: focus return, inert background, 44 px targets, pinch-zoom allowed | DONE (VoiceOver pass on a device still NEEDED) |
| Layout checked at 320, 360, 390 px, largest text, no sideways scroll | DONE |
| Safe areas, standalone display, theme colour, icons | DONE |
| Persona audits (homebrew, table, modern, first-timer) | DONE, findings fixed |

## Store requirements
| Item | Status |
|---|---|
| Privacy policy page | DONE (`privacy.html`) |
| Support page | DONE (`support.html`), contact email CONFIRM |
| App Privacy answers: Data Not Collected | DONE (in LISTING.md) |
| SRD 5.1 attribution (CC BY 4.0) in the app | DONE (Settings, About) |
| No Wizards of the Coast trademarks in the name, subtitle or keywords | DONE |
| Sensitive items gated: crime and underworld list off by default | DONE |
| Icon 1024 x 1024, opaque, full bleed | DONE (`store/icon.mjs`) |
| Screenshots 6.9 inch and 6.7 inch iPhone | DONE (`store/screenshots.mjs`), review before upload |
| Listing copy, keywords, age rating answers, review notes | DONE (draft, `LISTING.md`) |
| Capacitor project config | DONE (`ios/`), not built |

## Needs you
1. **Apple Developer Program** membership (99 USD a year) and an App Store Connect record.
2. **A Mac with Xcode** to build the native shell (follow `ios/README.md`). I cannot compile iOS here.
3. **Decisions**: the app name (check "Fool's Gold" is free in the App Store), bundle ID, price (free or paid), support email, whether iPad is wanted (iPhone only is simplest).
4. **A real-device pass**: VoiceOver, Dynamic Type, offline first launch, background and return. TestFlight to a few DMs before submitting.
5. **Optional polish before 1.0**: haptics through a Capacitor plugin, native share sheet for the receipt, mirroring saves to native storage.

## Review risks and how they are handled
- **Minimum functionality (4.2)**: a web wrapper can be rejected when it is only a website. This app is a self-contained offline tool with bundled data, so it does real work; adding haptics and the native share sheet would make that clearer.
- **Objectionable or illegal content (1.1)**: a price list that includes forged papers, bribes and hired killers could be questioned. Those items are tagged `underworld`, off by default, and described as for fiction in the review notes.
- **Trademark and IP (5.2)**: only SRD 5.1 content is used, with the required attribution; the name avoids third-party marks.
- **Data and privacy (5.1)**: nothing is collected. Keep it that way: any future analytics or crash reporting changes the privacy answers.
