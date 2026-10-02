# INTERMACHINAS asset credits

Everything shipped under `assets/` and every third-party library in `js/vendor/`.
Only CC0 / MIT material is used; licence texts sit next to the files.

## Characters (`assets/characters/`)

The bodies are procedural (three.js geometry in `js/models.js`); these are the downloaded pieces
they're kitbashed from, all from [Poly Haven](https://polyhaven.com), **CC0 1.0** (public domain,
no attribution required; credited anyway). Licence: `characters/CC0-1.0-legalcode.txt`.

| File(s) | Source | Author(s) | Licence | What we did to it |
|---|---|---|---|---|
| `gasmask.js`, `gasmask_d.jpg`, `gasmask_n.jpg` | [Old Gas Mask](https://polyhaven.com/a/old_gas_mask) | Michał Wiśniewski | CC0 | Cut the hood + snout and the ribbed filter out of the model, dropped the hose, decimated 10.4k → 1.5k tris (meshoptimizer), baked to a JS module; 1k maps downsized to 512 px. Becomes every guard's face, with our own lenses, helmet and a front-mounted filter. (`tools/intermachinas/bake-gasmask.mjs`) |
| `cloth_d.jpg`, `cloth_n.jpg` | [Hessian 380](https://polyhaven.com/a/hessian_380) | colormass (photography), Rico Cilliers (processing) | CC0 | Albedo → re-centred grey detail map (tinted per material), normal map kept; 512 px. |
| `leather_d.jpg`, `leather_n.jpg` | [Brown Leather](https://polyhaven.com/a/brown_leather) | Rob Tuytel | CC0 | Same treatment. |
| `enamel_d.jpg`, `enamel_n.jpg` | [Green Metal Rust](https://polyhaven.com/a/green_metal_rust) | Rob Tuytel | CC0 | Same treatment: the chips/drips become worn enamel on helmets and armour. |

Texture processing: `tools/intermachinas/fetch-polyhaven-textures.mjs` + `prep-character-textures.py`.
Stencilled unit numbers on the helmets are drawn at runtime on a canvas (no file).

## Level (`assets/textures/`)

| File(s) | Source | Licence |
|---|---|---|
| `*.png` grid/checker surfaces | Kenney [Prototype Textures](https://kenney.nl/assets/prototype-textures) | CC0 (`textures/KENNEY-LICENSE.txt`) |

## Code

| File | Source | Licence |
|---|---|---|
| `js/vendor/three.module.min.js` | [three.js](https://threejs.org) r170 | MIT (`js/vendor/three-LICENSE.txt`) |
