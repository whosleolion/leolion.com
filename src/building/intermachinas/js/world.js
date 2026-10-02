// World: the white-box level and all collision queries.
// Everything solid is an axis-aligned box, so collision is cheap and exact:
// circle-vs-rect pushes in XZ, "highest top under me" for ground, slab raycasts
// for line of sight / climbing / camera. Boxes are plain objects:
//   { min:{x,y,z}, max:{x,y,z}, kind:'solid'|'hide'|'hay'|'perch', climbable, mesh }
import * as THREE from './vendor/three.module.min.js';

const TILE = 2; // metres per texture repeat

// BoxGeometry with UVs scaled to world size so grid textures stay square.
function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / TILE, uv.getY(k) * dims[f][1] / TILE);
    }
  }
  return g;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.boxes = [];   // solids
    this.volumes = []; // hide / hay / perch (non-solid)
    this.hints = [];   // { x0,z0,x1,z1, text, shown }
    this.mats = {};
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  loadMaterials(base) {
    const loader = new THREE.TextureLoader();
    const tex = (f) => {
      const t = loader.load(base + f);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    };
    const m = (f, extra = {}) => new THREE.MeshStandardMaterial({ map: tex(f), roughness: 0.9, ...extra });
    this.mats = {
      ground: m('ground.png'),
      wall: m('wall.png'),
      wallDark: m('wall-dark.png'),
      roof: m('roof.png'),
      tower: m('tower.png'),
      ledge: m('ledge.png'),
      hide: m('hide.png', { transparent: true, opacity: 0.85 }),
      hay: m('hide.png', { color: 0xfff0a0 }),
      bounds: m('bounds.png', { transparent: true, opacity: 0.08, depthWrite: false }),
    };
  }

  // x,z = centre; y = bottom
  box(x, y, z, w, h, d, opts = {}) {
    const { mat = 'wall', climbable = true, kind = 'solid', shadow = true, name = '' } = opts;
    const b = {
      min: { x: x - w / 2, y, z: z - d / 2 },
      max: { x: x + w / 2, y: y + h, z: z + d / 2 },
      kind, climbable, name,
    };
    if (mat) {
      const mesh = new THREE.Mesh(boxGeo(w, h, d), this.mats[mat]);
      mesh.position.set(x, y + h / 2, z);
      mesh.castShadow = shadow && kind === 'solid';
      mesh.receiveShadow = true;
      this.group.add(mesh);
      b.mesh = mesh;
    }
    (kind === 'solid' ? this.boxes : this.volumes).push(b);
    return b;
  }

  hint(x0, z0, x1, z1, text) { this.hints.push({ x0, z0, x1, z1, text, shown: false }); }

  // ---------- queries ----------

  // Highest solid top under a circle, not above maxY. Ground box guarantees a floor.
  groundAt(x, z, r, maxY) {
    let best = -100, bestBox = null;
    for (const b of this.boxes) {
      const top = b.max.y;
      if (top > maxY || top <= best) continue;
      const cx = x < b.min.x ? b.min.x : x > b.max.x ? b.max.x : x;
      const cz = z < b.min.z ? b.min.z : z > b.max.z ? b.max.z : z;
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) { best = top; bestBox = b; }
    }
    return { y: best, box: bestBox };
  }

  // Push a vertical cylinder out of solids it overlaps (ignoring boxes whose
  // top is within `step` of the feet — those are stepped onto, not walls).
  collideXZ(p, r, feetY, headY, step, contacts) {
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.boxes) {
        if (b.max.y <= feetY + step || b.min.y >= headY) continue;
        const cx = p.x < b.min.x ? b.min.x : p.x > b.max.x ? b.max.x : p.x;
        const cz = p.z < b.min.z ? b.min.z : p.z > b.max.z ? b.max.z : p.z;
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx, nz, push;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          nx = dx / d; nz = dz / d; push = r - d;
        } else {
          const pen = [p.x - b.min.x, b.max.x - p.x, p.z - b.min.z, b.max.z - p.z];
          let i = 0;
          for (let k = 1; k < 4; k++) if (pen[k] < pen[i]) i = k;
          nx = i === 0 ? -1 : i === 1 ? 1 : 0;
          nz = i === 2 ? -1 : i === 3 ? 1 : 0;
          push = pen[i] + r;
        }
        p.x += nx * push; p.z += nz * push;
        if (contacts) contacts.push({ nx, nz, box: b });
      }
    }
  }

  // Is a cylinder at (x,z) between y0..y1 overlapping any solid?
  blocked(x, z, r, y0, y1) {
    for (const b of this.boxes) {
      if (b.max.y <= y0 || b.min.y >= y1) continue;
      const cx = x < b.min.x ? b.min.x : x > b.max.x ? b.max.x : x;
      const cz = z < b.min.z ? b.min.z : z > b.max.z ? b.max.z : z;
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  // Slab raycast against solids. dir must be normalised. Origins inside a box ignore it.
  raycast(ox, oy, oz, dx, dy, dz, maxT, ignore) {
    let best = maxT, hit = null;
    const o = [ox, oy, oz], d = [dx, dy, dz];
    for (const b of this.boxes) {
      if (b === ignore) continue;
      const mn = [b.min.x, b.min.y, b.min.z], mx = [b.max.x, b.max.y, b.max.z];
      let tmin = 0, tmax = best, axis = -1, sign = 0, miss = false;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) {
          if (o[a] < mn[a] || o[a] > mx[a]) { miss = true; break; }
          continue;
        }
        const inv = 1 / d[a];
        let t1 = (mn[a] - o[a]) * inv, t2 = (mx[a] - o[a]) * inv, s = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { miss = true; break; }
      }
      if (miss || axis < 0) continue; // axis<0: origin inside box
      if (tmin < best) {
        best = tmin;
        hit = { t: tmin, nx: axis === 0 ? sign : 0, ny: axis === 1 ? sign : 0, nz: axis === 2 ? sign : 0, box: b,
          x: ox + dx * tmin, y: oy + dy * tmin, z: oz + dz * tmin };
      }
    }
    return hit;
  }

  lineClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    return !this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len);
  }

  volumeAt(x, y, z, kind) {
    for (const v of this.volumes) {
      if (kind && v.kind !== kind) continue;
      if (x >= v.min.x && x <= v.max.x && z >= v.min.z && z <= v.max.z && y >= v.min.y - 0.05 && y <= v.max.y) return v;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// The level. Hand-laid district on a 14 m grid:
//   south plaza (start + tutorial) -> rooftop blocks either side of a central
//   boulevard -> viewpoint tower in the boulevard -> market street ->
//   walled courtyard with the target.
// ---------------------------------------------------------------------------
export function buildLevel(world) {
  const W = world;
  // seeded rng so the city is the same every load
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  // ground + out-of-bounds walls
  W.box(0, -1, 0, 130, 1, 140, { mat: 'ground', climbable: false });
  const bw = (x, z, w, d) => W.box(x, 0, z, w, 40, d, { mat: 'bounds', climbable: false, shadow: false });
  bw(0, -70.5, 130, 1); bw(0, 70.5, 130, 1); bw(-65.5, 0, 1, 140); bw(65.5, 0, 1, 140);

  // --- rooftop blocks ---
  const cols = [-42, -28, -14, 14, 28, 42];
  const rows = [-36, -22, -8, 6];
  const fixedH = { '-14,-22': 9, '14,-22': 9, '-14,-8': 10, '14,-8': 11 };
  const roofs = [];
  for (const z of rows) for (const x of cols) {
    const w = 10 + Math.round(rnd()), d = 10 + Math.round(rnd() * 1);
    const h = fixedH[`${x},${z}`] ?? (5 + Math.round(rnd() * 8));
    W.box(x, 0, z, w, h, d, { mat: rnd() < 0.5 ? 'wall' : 'wallDark' });
    roofs.push({ x, z, w, d, h });
  }
  // back rows beside the courtyard
  for (const z of [34, 48]) for (const x of [-42, -28, 28, 42]) {
    const h = 6 + Math.round(rnd() * 6);
    W.box(x, 0, z, 10, h, 10, { mat: rnd() < 0.5 ? 'wall' : 'wallDark' });
    roofs.push({ x, z, w: 10, d: 10, h });
  }

  // rooftop clutter: vaultable crates, chimneys, a few rooftop hide gardens
  for (const r of roofs) {
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const cx = r.x + (rnd() - 0.5) * (r.w - 3), cz = r.z + (rnd() - 0.5) * (r.d - 3);
      const tall = rnd() < 0.3;
      W.box(cx, r.h, cz, tall ? 1 : 1.6, tall ? 2.6 : 1, tall ? 1 : 1.6, { mat: 'roof' });
    }
    if (rnd() < 0.25) {
      const gx = r.x + (rnd() < 0.5 ? -1 : 1) * (r.w / 2 - 1.6);
      W.box(gx, r.h, r.z, 2.4, 1.3, 2.4, { mat: 'hide', kind: 'hide' });
    }
    // orange ledge bands on some faces (pure affordance — everything is climbable)
    if (rnd() < 0.4 && r.h > 6) {
      for (let y = 2.5; y < r.h - 1; y += 3) {
        W.box(r.x, y, r.z - r.d / 2 - 0.2, r.w * 0.7, 0.25, 0.4, { mat: 'ledge' });
      }
    }
  }

  // planks across the boulevard (x -9..9)
  W.box(0, 9 - 0.3, -22, 18.6, 0.3, 0.6, { mat: 'ledge' });
  W.box(0, 10 - 0.3, -6, 18.6, 0.3, 0.6, { mat: 'ledge' });

  // --- south plaza: start + tutorial ---
  W.box(0, 0, -52, 8, 1.0, 0.8, { mat: 'wall' });            // vault wall
  W.box(-6, 0, -56, 0.8, 1.1, 5, { mat: 'wall' });           // vault wall
  W.box(7, 0, -57, 4, 4, 4, { mat: 'wallDark' });            // first climb
  W.box(7, 4, -57, 1.2, 1, 1.2, { mat: 'roof' });
  W.box(13, 0, -58, 4, 7, 4, { mat: 'wall' });               // second climb, jump across
  W.box(-12, 0, -60, 6, 3, 3, { mat: 'wallDark' });
  W.box(-4, 0, -46, 2.2, 1.1, 2.2, { mat: 'hide', kind: 'hide' }); // tutorial bush
  W.hint(-20, -66, 20, -50, 'WASD move · mouse look · hold SHIFT to freerun · SPACE jump');
  W.hint(-8, -54, 8, -50, 'Freerun into low walls to vault them');
  W.hint(3, -62, 10, -53, 'Run into any wall to climb · W/S/A/D on the wall · SPACE leaps · S+SPACE ejects · C drops');
  W.hint(-7, -48, -1, -44, 'C to crouch · crouch in green cover to hide from guards');

  // --- viewpoint tower (boulevard, z=-15) ---
  const TX = 0, TZ = -15, TH = 28;
  W.box(TX, 0, TZ, 6, TH, 6, { mat: 'tower', name: 'tower' });
  for (let y = 3; y < TH - 1; y += 3) {
    // ledge rings
    W.box(TX, y, TZ - 3.2, 6.8, 0.3, 0.4, { mat: 'ledge' });
    W.box(TX, y, TZ + 3.2, 6.8, 0.3, 0.4, { mat: 'ledge' });
  }
  W.box(TX, TH, TZ, 2, 2.2, 2, { mat: 'tower' });               // cap
  W.box(TX + 4, TH - 0.35, TZ, 2.2, 0.35, 0.5, { mat: 'ledge', name: 'perch' }); // perch beam
  W.box(TX + 4.6, TH, TZ, 1.2, 1.5, 1.2, { mat: null, kind: 'perch' });
  W.box(TX + 4.6, 0, TZ, 3, 1.3, 3, { mat: 'hay', kind: 'hay' }); // leap of faith
  W.box(TX + 4.6, 0, TZ, 3.2, 0.25, 3.2, { mat: 'roof' });       // cart bed
  W.hint(-6, -24, 6, -10, 'Climb the viewpoint · at the perch press F to synchronize · then leap into the hay');
  world.viewpoint = { x: TX + 4.6, y: TH, z: TZ };

  // boulevard bushes
  for (const z of [-40, -30, -2, 2, 14]) {
    W.box(-7.5, 0, z, 2, 1.2, 2.6, { mat: 'hide', kind: 'hide' });
    W.box(7.5, 0, z + 3, 2, 1.2, 2.6, { mat: 'hide', kind: 'hide' });
  }
  // hay below a few roof edges
  W.box(-21, 0, -1, 2.6, 1.3, 2.6, { mat: 'hay', kind: 'hay' });
  W.box(21, 0, -29, 2.6, 1.3, 2.6, { mat: 'hay', kind: 'hay' });
  W.box(-21, 0, 20, 2.6, 1.3, 2.6, { mat: 'hay', kind: 'hay' });

  // market stalls along the market street (z ~ 18)
  for (const x of [-40, -30, -18, 18, 30, 40]) {
    W.box(x, 0, 17, 3, 1.1, 1.6, { mat: 'wallDark' });
    W.box(x, 2.4, 17, 3.4, 0.2, 2.4, { mat: 'ledge' });
    W.box(x - 1.5, 0, 16, 0.2, 2.4, 0.2, { mat: 'roof' });
    W.box(x + 1.5, 0, 16, 0.2, 2.4, 0.2, { mat: 'roof' });
  }
  W.hint(-12, 10, 12, 24, 'The target is inside the courtyard · approach unseen · F to assassinate');

  // --- courtyard (x -20..20, z 27..53) ---
  const CH = 6, T = 1.4;
  W.box(-12, 0, 27, 16, CH, T, { mat: 'wallDark' });  // south wall, left of gate
  W.box(12, 0, 27, 16, CH, T, { mat: 'wallDark' });   // south wall, right of gate
  W.box(0, CH - 1.2, 27, 8, 1.2, T, { mat: 'wallDark' }); // lintel over gate
  W.box(0, 0, 53, 41.4, CH, T, { mat: 'wallDark' });
  W.box(-20, 0, 40, T, CH, 27.4, { mat: 'wallDark' });
  W.box(20, 0, 40, T, CH, 27.4, { mat: 'wallDark' });
  // inside
  W.box(0, 0, 40, 5, 1.2, 5, { mat: 'roof' });               // fountain base
  W.box(0, 1.2, 40, 1.2, 2, 1.2, { mat: 'tower' });
  W.box(0, 0, 50, 14, 2.5, 4, { mat: 'wall' });              // north dais
  for (const [x, z] of [[-10, 34], [10, 34], [-10, 46], [10, 46]]) W.box(x, 0, z, 1.2, 4.5, 1.2, { mat: 'wall' }); // pillars
  for (const [x, z] of [[-17.5, 32], [-17.5, 44], [17.5, 38], [17.5, 48], [-6, 29.5], [6, 29.5]])
    W.box(x, 0, z, 2.2, 1.2, 2.4, { mat: 'hide', kind: 'hide' });
  W.box(-8, 0, 50, 3, 1.4, 1.5, { mat: 'wallDark' });         // crates by the dais
  W.box(14, 0, 31, 2, 2, 2, { mat: 'wallDark' });

  world.spawn = { x: 0, y: 0, z: -62, yaw: 0 };
  world.courtyard = { x0: -20, x1: 20, z0: 27, z1: 53 };
}
