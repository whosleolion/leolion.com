# Convoy

Live backend for a multi-table sci-fi LARP: `src/building/convoy/` (leolion.com/building/convoy, noindexed, unlinked).
No build step, no SDK. Bare-bones look on purpose; the mechanics come first.

## What is in it
- **Hold**: inventories for every table, named character and stash. GMs create stock by typing (`5 fuel cells` + Enter);
  everyone can give or offer a trade (`3 fuel, 1 medkit`). Item names are matched to existing types (case, spacing,
  plural, prefix), so the same thing always stacks; only GMs can create a new type.
- **Star map**: sectors in a line. `Advance time` moves the convoy one sector: the oldest sector falls astern and is lost,
  a new one comes into scanner range and is generated if nobody charted it by hand. GMs can prepare uncharted sectors
  ahead (players cannot see them) and hide single bodies.
- **Sheets**: one sheet per table and per character, built from a shared field list (Setup), with the hold shown underneath.
- **Setup** (GM): tables, stashes, item types, sheet fields, map numbers and mode, GM pin, backup / restore.

One convoy per `?g=<name>` (default `main`).

## Going live with Firebase
1. Firebase console: create a project, then Build > Realtime Database > Create database.
2. Rules tab: paste `tools/convoy/firebase-rules.json`, publish.
3. Copy the database URL into `src/building/convoy/config.js` (`FIREBASE_DB_URL`), push.

Until then the page runs in local mode (this browser only). The rules are open to anyone with the address
(a LARP night, not a bank); they only guarantee that stock cannot go below zero and that a trade settles once.

## Code
- `js/core.js`: the data model and every action as a multi-path update; item matching; map generator.
- `js/store.js`: local store and Firebase store (REST + streaming), same interface.
- `js/app.js`: the screens. HTML strings morphed into the page so typing is never interrupted.
- `tools/convoy/mock-rtdb.mjs`: stand-in database for tests; `node tools/convoy/mock-rtdb.mjs` then open the printed URL
  in several windows to try multi-device play.
- `tools/convoy/playtest.mjs`: headless GM + two players check. `NODE_PATH=$(npm root -g) node tools/convoy/playtest.mjs`.
  Run it after any change.
