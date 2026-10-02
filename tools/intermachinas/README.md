# INTERMACHINAS — mechanical white-box build

Live: leolion.com/building/intermachinas (noindexed, unlinked). Source: `src/building/intermachinas/`.
Three.js r170 (vendored, `js/vendor/three.module.min.js`), plain ES modules, no build step.

## What's in v0.2 (feel pass)

| System | Where | Notes |
|---|---|---|
| Level + collision | `js/world.js` | Everything solid is an axis-aligned box. Circle-vs-rect pushes, "highest top under me" for ground, slab raycasts for LOS / climbing / camera. `buildLevel()` lays out the district: tutorial plaza (south) → rooftop blocks on a 14 m grid either side of the boulevard → 28 m viewpoint tower → market street → walled courtyard with the target (north). |
| Mannequin + poses | `js/rig.js` | Box-limbed rig, procedural poses per state (run cycle, climb, wall-run, vault, mantle, attacks, block, hurt, dead, sync). The game only talks to it through `pose` objects, so a skinned glTF can replace it later without touching gameplay. |
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

## Testing
`playtest.mjs` drives the real page with key/mouse events and steps the sim deterministically through `G.advance(seconds)` (headless Chromium renders at ~4 fps, so wall-clock timing would be meaningless). It checks walking, vault, climb + top-out, the tower climb, sync, leap of faith, fall damage, wall-run, eject, assassination, hiding, detection, combat kills, counter, knock-off-the-wall, mission complete, death/retry, coyote time, jump buffer, landing roll, parkour down + fast climb, corner wrap, chain kill, whistle, combo, posture break + execution, the last-known-position ghost, and a 20 s soak for runtime errors. Enemy dice are seeded so runs repeat.

```
(cd src && python3 -m http.server 8765) &
cd <dir with playwright installed> && node /path/to/tools/intermachinas/playtest.mjs http://localhost:8765/building/intermachinas/ [shotsDir]
```
`window.G` is exposed for poking at things from the console (`G.player`, `G.enemies`, `G.world`).

## Assets
In use now (all free to redistribute):
- Kenney **Prototype Textures** (CC0) — the grid/checker surfaces. `assets/textures/` (license file alongside).
- three.js (MIT).
- Everything else is procedural (box mannequins, synth SFX).

Candidates for the next pass, roughly in the order they'd help:
1. **Animation** — Quaternius *Universal Animation Library* (CC0, 120+ animations on one humanoid rig: locomotion, combat, emotes; glTF). Good base set; check what climbing/vault coverage it has. Mixamo (free with an Adobe account) has the parkour set (climb, hang, shimmy, vault, wall-run-ish, stealth kills), fine to ship baked into a game but the raw FBX can't be redistributed — keep the source files out of this public repo. Plan: retarget both onto one skeleton, swap `Rig` for a skinned-mesh rig driven by the same state names.
2. **Characters** — Quaternius character packs (CC0) or a Mixamo character; the hooded assassin silhouette can stay a white-box until there's a real look.
3. **Environment** — Kenney *City Kit (Commercial)* / *Modular Buildings* (CC0) or Quaternius *Medieval Village* (CC0) as drop-in facades over the existing collision boxes (keep collision as boxes; visuals can be anything).
4. **Audio** — Kenney audio packs (CC0: impacts, footsteps, UI) to replace the synth placeholders.

Note for Neocities: `.glb` uploads may need the supporter plan; if they're refused, the deploy workflow will say so — `.gltf` + `.bin`/textures or hosting models on a CDN are the fallbacks.

## Known rough edges (deliberately left for now)
- Guards steer with feelers, not a navmesh: they can get hung up on building corners while chasing (they give up and search).
- No corner wrap while climbing (go up and over, or drop).
- Camera ignores enemies (can sit behind one in a crowd).
- Touch controls are functional but not tuned.
