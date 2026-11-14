# 932 Madison St (3D block explorer)

`src/building/madison/` (leolion.com/building/madison, noindexed, unlinked): a fullscreen, touch-first walkable model of the
blocks around 932 Madison St, Brooklyn, at Madison & Broadway under the elevated J/Z tracks. three.js r170 (vendored), plain ES
modules, no build step.

## What is real, what is reconstructed

| Real (from public records) | Reconstructed |
| --- | --- |
| Footprints, roof heights (NYC Building Footprints) | Facade textures: procedural, chosen by PLUTO class + year, tuned against street photos |
| Floors, year built, use, address (PLUTO) shown in the look-at label | Shop names, individual windows/doors |
| Sidewalk polygons, pavement edges, street centrelines + names + widths | El steelwork (follows Broadway's centreline; proportions from photos) |
| Street trees with species + trunk diameter, hydrants | Parked cars, lamp posts, yard trees, traffic, trains' timetable |
| Roofs and back yards textured from NYS orthoimagery | |

Street-level imagery: Google Street View needs a paid key and its terms don't allow baking it into a model, so the
"compare" spots use openly licensed KartaView photos (CC BY-SA 4.0, autumn 2018) taken at those exact positions.

## Files

- `tools/madison/build_data.py [cache_dir]` fetches everything and writes `data/block.json` (local metres: x east, z south,
  origin at no. 932). Also caches the orthophoto; `data/ortho.jpg` is that image resized to 2048².
- `tools/madison/fetch_photos.py` picks 12 spread-out KartaView photos and writes `photos/` + `data/photos.json`.
- `js/city.js` buildings (walls by style, cornices, stoops, fire escapes, sign bands, ortho roofs, collision grid).
- `js/textures.js` all canvas textures (facade tiles are 2 bays wide; walls set UVs in whole bays/floors).
- `js/street.js` ground, sidewalks, paint, trees, hydrants, lamps, street-name signs, parked cars.
- `js/el.js` elevated structure, trains, Broadway traffic. `js/sky.js` sky dome + the three times of day.
- `js/audio.js` synthesised sound (hum, train rumble + rail joints, footsteps). `js/main.js` boot, controls, HUD, loop.

## Checking it

`NODE_PATH=$(npm root -g) node tools/madison/playtest.mjs [shotsDir]` boots it headless on a phone viewport and drives the
touch controls. URL helpers: `?walk=1` skips the title, `&pos=x,z,yawDeg,pitchDeg`, `&tod=golden|day|night`.

## Ideas not done yet

More hand-matched facades (932, 936 and 940 Madison are done from Leo's photos: styles `m932`/`m936`/`m940` and the `GROUND` painters in `textures.js`, bays + awning in `city.js`), traffic signals, pedestrians, interiors,
terrain (the area is within ~2 m of flat, so it is modelled flat).
