# YEP demo — asset pipeline

The game lives at `src/building/yepdemo/` (served at leolion.com/building/yepdemo).
Plain HTML + canvas, no build step.

All art is original 1-bit 16x16 pixel art, hand-drawn as ASCII in
`make_assets.py`: 30 world tiles (grass, path, water x2, planks, brick, roof,
windows, door, interior walls, trees, fences, signs, chests, graves, furniture…)
and 23 sprites (player 4-way walk cycle, elder, kid, cat, ghost, items, UI).
Edit the ASCII, then regenerate:

    pip install pillow
    python3 tools/yepdemo/make_assets.py --preview /tmp   # also writes contact sheets

The font atlas (`assets/font.png`) is Press Start 2P (SIL OFL 1.1, license in
`assets/FONT-LICENSE-OFL.txt`) rasterized to 1-bit. To rebuild it, pass
`--font path/to/press-start-2p.woff` (e.g. from the `@fontsource/press-start-2p` npm package).

Maps, dialogue, NPCs and chests are all at the top of `src/building/yepdemo/game.js`.
