# INTERMACHINAS — mechanical white-box build

Live: leolion.com/building/intermachinas (noindexed, unlinked). Source: `src/building/intermachinas/`.
Three.js r170 (vendored, `js/vendor/three.module.min.js`), plain ES modules, no build step.

## What's in v0.2 (feel pass)

| System | Where | Notes |
|---|---|---|
| Level + collision | `js/world.js` | Everything solid is an axis-aligned box. Circle-vs-rect pushes, "highest top under me" for ground, slab raycasts for LOS / climbing / camera. `buildLevel()` lays out the district: tutorial plaza (south) → rooftop blocks on a 14 m grid either side of the boulevard → 28 m viewpoint tower → market street → walled courtyard with the target (north). |
| Rig + poses | `js/rig.js` | Jointed rig, procedural poses per state (run cycle, climb, wall-run, vault, mantle, attacks, block, hurt, dead, sync), sash/cape secondary motion from velocity. The game only talks to it through `pose` objects + `apply / flash / blade / club / root`. |
| Character looks | `js/models.js` | See **Characters** below. |
| Player | `js/player.js` | States `ground / air / climb / wallrun / scripted / sync / dead`, plus a ground action layer (`attack / dodge / slide / hurt / land / recoil`). |
| Enemies | `js/enemy.js` | Vision cone + LOS + stance → awareness meter; `patrol → suspicious → investigate → search`, or `combat`. Attack tokens via `Director` (one attacker at a time by default), telegraphed wind-ups, blocking, ranged sentries, body discovery, shouting alerts neighbours, noise. |
| Camera | `js/camera.js` | Orbit + shoulder offset, wall collision, FOV kick, shake, sync sweep, auto-follow on pad/touch. |
| HUD / input / audio / tuning | `hud.js`, `input.js`, `audio.js`, `tuning.js` | Keyboard+mouse (pointer lock), gamepad, touch. Synth SFX (no files). ` opens the live tuning panel (persists per browser). |

### Where the v0.2 feel changes come from
| Change | Reference |
|---|---|
| Coyote time (0.14 s) + jump buffer (0.16 s); variable jump height; heavier fall | platformer staples (Celeste-style forgiveness windows) |
| Momentum steering while freerunning (velocity rotates, doesn't brake), sprint ramps up, `flow` meter (gold bar under health) from clean parkour raises top speed + FOV | Mirror's Edge |
| Landing roll (C just before landing, or automatic while freerunning) carries speed, soaks falls | Mirror's Edge |
| Parkour down (crouch-walk off an edge to hang), fast-climb (hold Shift on a wall), corner wraps (inside + outside), faster sprint top-outs | AC Unity |
| Bigger ledge-catch reach, buffered jump into a grab = instant climb leap, vault speed carry | general "assist" practice |
| Freeflow combo (×4 = FREEFLOW: faster swings, long-range snap to the guard you point at, damage ramps), hit resets it; long-range counters; last blow of a fight in slow-mo | Batman: Arkham |
| Posture: blocked hits fill it, break → reeling guard → F EXECUTE | Sekiro |
| Chain kills: F again within ~1 s of an F-kill dashes to the next guard | AC double / chain assassinations, Splinter Cell: Conviction |
| Last-known-position ghost while hunters can't see you | Splinter Cell: Conviction |
| Detection arrows around the screen centre, filling with awareness; ⚡ on guards winding up, gold ✕ on broken guards | Hitman / AC Unity / Arkham counter icons |
| Visible noise rings (sprinting, landings, whistle) | Mark of the Ninja |
| Whistle (V) to lure a guard | AC / Ghost of Tsushima |
| Body bank into turns, lean into acceleration, camera look-ahead, speed lines, wall-run camera roll, punch-in on big hits, fight framing that pulls back with the crowd, slash arcs, dust, sparks | general game-feel juice |

### Mechanics checklist
- **Freerun**: hold Shift. Runs off edges with an auto-leap; walking (not freerunning) stops at roof edges.
- **Vault / mantle**: freerun or jog into anything ≤ 1.4 m. Thin = vault over, deep = mantle on top.
- **Climb**: run into any wall (or jump at it). W/A/S/D on the wall, Space = climb leap (directional), S+Space = back-eject, C = let go. Tops out automatically. Mid-air ledge catches.
- **Wall-run**: freerun-jump alongside a wall; Space to kick off; chains to another wall.
- **Slide**: C while freerunning.
- **Leap of faith**: fall into hay = no damage and hidden. Otherwise falls over `fallSafe` metres hurt.
- **Stealth**: crouch (C) is quieter and harder to see; crouched in green cover or anywhere in hay = hidden. Sprinting and landings make noise; fighting is loud.
- **Assassinations** (F): from behind / unaware, air assassination (falling or hanging above a guard), counter-kill (F while a guard flashes red winding up).
- **Combat**: LMB light ×3 combo (3rd is a knock-back kick), RMB heavy breaks blocks, L-L-R = spin launcher (AoE), Q dodge with i-frames (cancels recovery). Soft lock-on and lunge to the target. Hitstop + shake.
- **Viewpoint**: climb the purple tower, F at the perch → camera sweep, reveals all guards, sets the retry checkpoint.
- **Mission**: kill the gold target in the courtyard, then lose any pursuers → MISSION COMPLETE with time / kills / times detected ("GHOST" if 0).

## Characters (look pass 1: "Avatar: The Last Airbender meets Cold War cyberpunk")
Screenshots: `tools/intermachinas/look/`. Credits + licences: `src/building/intermachinas/assets/CREDITS.md`.

- **How they're built** (`js/models.js`): action figures. Each part is modelled in its joint's space (lofted
  elliptical shells for torsos/hoods/helmets/armour, tapered limbs, ribbed wraps and hoses, kit boxes) and
  bound 100% to that joint, then everything is merged **per material into one SkinnedMesh** that shares the
  Rig's skeleton. So the procedural poses drive it exactly like the old boxes, a character is ~8–12 draw
  calls, and same-type guards share all geometry. Cloth that should sit between two joints (the player's
  split tunic skirt, pauldrons, tassets) is weighted across both (`blend` in `Kit.add`); sash tails and the
  target's cape are extra bones that `Rig.swing()` streams back with speed, hangs toward world-down and flutters.
- **Kitbashed assets** (all CC0, Poly Haven): the *Old Gas Mask* model (cut, decimated, baked into
  `assets/characters/gasmask.js` by `bake-gasmask.mjs`) is every guard's face and front filter; *Hessian 380*,
  *Brown Leather* and *Green Metal Rust* become 512 px tintable detail + normal maps for cloth, leather and worn
  enamel (`fetch-polyhaven-textures.mjs` → `prep-character-textures.py`). Stencil numbers are canvas-drawn.
- **Looks** (`LOOKS` in `models.js`; `Rig({ look })`): `player` (slate hood + mantle, red goggle band,
  respirator, wrapped forearms/shins, leather pauldron, vambrace + blade housing on the left forearm, red sash with
  two trailing tails), `guard` (oxblood enamel helmet + cuirass + pauldrons + tassets over olive drab, gas mask with
  CRT-green lenses, radio pack with whip antenna and green readout), `bodyguard` (black lacquer, bigger lames and
  ridges, crested helmet, oxblood tabards, amber lenses, ×1.08), `sentry` (safety-orange helmet with flip-up
  binocular goggles, padded vest, grenade bandolier, scarf, no plates), `target` (tarnished gold + off-white, topknot
  crown, oxblood cape). The ghost is the player look in one translucent material.
- **Flashes**: `flash()` sets emissive on the cloth/enamel materials (per-rig clones) and flares the lenses, so the red
  telegraph and gold posture-break read on every look.
- **Budget**: player ≈ 4.1k tris / 11 materials; guards ≈ 4.7–5.1k tris / 8 materials (+ baton 2, blade 1, hidden
  when sheathed). Whole cast (21 characters) ≈ 69k tris, ~115 draw calls before shadows. New assets ≈ 0.45 MB.
- **Iterating**: `lookdev.html` (serve the repo root; params in its header) renders any looks/poses side by side;
  `lookshots.mjs` stages the in-game shots (crowd, climb, telegraph, posture break, dead guard, ghost).

## Testing
`playtest.mjs` drives the real page with key/mouse events and steps the sim deterministically through `G.advance(seconds)` (headless Chromium renders at ~4 fps, so wall-clock timing would be meaningless). It checks walking, vault, climb + top-out, the tower climb, sync, leap of faith, fall damage, wall-run, eject, assassination, hiding, detection, combat kills, counter, knock-off-the-wall, mission complete, death/retry, coyote time, jump buffer, landing roll, parkour down + fast climb, corner wrap, chain kill, whistle, combo, posture break + execution, the last-known-position ghost, and a 20 s soak for runtime errors. Enemy dice are seeded so runs repeat.

```
(cd src && python3 -m http.server 8765) &
cd <dir with playwright installed> && node /path/to/tools/intermachinas/playtest.mjs http://localhost:8765/building/intermachinas/ [shotsDir]
```
`window.G` is exposed for poking at things from the console (`G.player`, `G.enemies`, `G.world`).

## Assets
In use now (all free to redistribute; full list in `src/building/intermachinas/assets/CREDITS.md`):
- Kenney **Prototype Textures** (CC0) — the grid/checker surfaces. `assets/textures/` (license file alongside).
- Poly Haven **Old Gas Mask**, **Hessian 380**, **Brown Leather**, **Green Metal Rust** (CC0) — character kitbash. `assets/characters/`.
- three.js (MIT).
- Everything else is procedural (character bodies, synth SFX).

Candidates for the next pass, roughly in the order they'd help:
1. **Animation** — Quaternius *Universal Animation Library* (CC0, 120+ animations on one humanoid rig: locomotion, combat, emotes; glTF). Good base set; check what climbing/vault coverage it has. Mixamo (free with an Adobe account) has the parkour set (climb, hang, shimmy, vault, wall-run-ish, stealth kills), fine to ship baked into a game but the raw FBX can't be redistributed — keep the source files out of this public repo. Plan: retarget both onto one skeleton, swap `Rig` for a skinned-mesh rig driven by the same state names.
2. **Characters** — first look pass done (see Characters). Next: a skinned, sculpted body under the kit (Quaternius CC0 base mesh) so elbows/knees/shoulders deform instead of interpenetrating.
3. **Environment** — Kenney *City Kit (Commercial)* / *Modular Buildings* (CC0) or Quaternius *Medieval Village* (CC0) as drop-in facades over the existing collision boxes (keep collision as boxes; visuals can be anything).
4. **Audio** — Kenney audio packs (CC0: impacts, footsteps, UI) to replace the synth placeholders.

Note for Neocities: `.glb` uploads may need the supporter plan; if they're refused, the deploy workflow will say so — `.gltf` + `.bin`/textures or hosting models on a CDN are the fallbacks.

## Known rough edges (deliberately left for now)
- Guards steer with feelers, not a navmesh: they can get hung up on building corners while chasing (they give up and search).
- No corner wrap while climbing (go up and over, or drop).
- Camera ignores enemies (can sit behind one in a crowd).
- Touch controls are functional but not tuned.
