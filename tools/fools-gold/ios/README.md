# iOS shell (Capacitor)

The web app in `src/building/fools-gold/` is the product. This folder wraps it for the App Store. It cannot be built on Linux; follow these steps on a Mac with Xcode 15 or later and an Apple Developer account.

1. `cd tools/fools-gold/ios && npm install`
2. `npx cap add ios` (the Haptics and Share plugins install with it), then `npx cap sync ios` (copies the web app into the native project; run again after every content patch).
3. `npx cap open ios`, then in Xcode:
   - Set the **Bundle Identifier** (default `nyc.firebird.foolsgold`), the **Team**, and the **Display Name** (`Fool's Gold`).
   - Under **Deployment Info**: iPhone only (Targeted Device Family 1), minimum iOS 15, portrait.
   - **Status Bar Style**: Light Content; **Requires full screen** off is fine.
   - Replace the app icon with `tools/fools-gold/store/icon-1024.png` (run `node tools/fools-gold/store/icon.mjs`).
   - Add `ITSAppUsesNonExemptEncryption = NO` to Info.plist.
   - Set the launch screen background to `#0C0D0F`.
4. Run on a real iPhone. Check: first launch offline (airplane mode), rotate, largest Dynamic Type, Night and Day, background and return, force quit and reopen (carts and worlds persist).
5. Archive, upload to App Store Connect, add the listing from `tools/fools-gold/store/LISTING.md`, the screenshots from `tools/fools-gold/store/screenshots.mjs`, and submit to TestFlight first.

Native notes
- `scrollEnabled: false` stops the web view rubber-banding the page; the app scrolls its own panels.
- The service worker is harmless in the native shell (the files are bundled). The update check compares the bundled `version.json` with itself.
- Data lives in the web view's local storage. iOS can evict web storage under extreme storage pressure; the app's "Back up and share" copies a world out as text. A later version can mirror saves to native storage with `@capacitor/preferences`.
