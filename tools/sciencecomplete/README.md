# Science Complete — rough build

Lives at `src/building/sciencecomplete/` (leolion.com/building/sciencecomplete).
Same no-build canvas engine as `/building/yepdemo`, extended with an inventory,
choice menus, a code-entry pad, a turn-based battle, save/continue, and an ending.

- **All text** is in the `WORDS` block at the top of `game.js`. Lines taken
  verbatim from Leo's original notes are marked `(notes)`; the rest is draft.
- **Key items**: `ITEMS` block. **Rooms**: `MAPS` (ASCII, legend above it).
- **What things do**: `EXAMINE`, `THINGS`, `NPCS` and the `*Script` functions.
- **Art**: `make_assets.py` here (reuses helpers from `tools/yepdemo`). Run
  `python3 tools/sciencecomplete/make_assets.py --preview /tmp` to rebuild.

Exit code is 3141 (the dry notes say "first 4 digits of pi").
