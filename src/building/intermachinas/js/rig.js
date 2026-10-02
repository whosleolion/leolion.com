// Rig: a skinned character with procedural poses.
// The body is built in models.js (one smooth-skinned body + kit, merged per material into
// SkinnedMeshes on one skeleton); the game only talks to Rig through `pose` objects +
// `apply()`, `flash()`, `blade`, `club`, `root`/`body`, so swapping the look never touches gameplay.
//
// Conventions (character faces local +z):
//   thigh/upper-arm x < 0 swings the limb forward; knee x > 0 bends back;
//   elbow x < 0 bends the forearm forward/up; spine/head x > 0 leans forward.
//   left limbs are on +x; arm z > 0 raises the LEFT arm sideways, z < 0 the right.
//   hips/spine y > 0 turns the left side back (right shoulder forward).
import * as THREE from './vendor/three.module.min.js';
import { BONES, getLook, withRim, bladeGeometry, batonGeometry } from './models.js';

const JOINTS = ['hips', 'spine', 'head', 'uaL', 'faL', 'uaR', 'faR', 'thL', 'shL', 'thR', 'shR'];
const SCALARS = ['y', 'bodyX', 'bodyZ', 'spin', 'blade', 'weapon'];
const TAU = Math.PI * 2;

export function neutral() {
  return {
    y: 0, bodyX: 0, bodyZ: 0, spin: 0, blade: 0, weapon: 0,
    hips: [0, 0, 0], spine: [0.04, 0, 0], head: [0, 0, 0],
    uaL: [0.05, 0, 0.08], faL: [-0.15, 0, 0], uaR: [0.05, 0, -0.08], faR: [-0.15, 0, 0],
    thL: [0, 0, 0], shL: [0.05, 0, 0], thR: [0, 0, 0], shR: [0.05, 0, 0],
  };
}

export function pose(over) {
  const p = neutral();
  for (const k in over) p[k] = Array.isArray(over[k]) ? [...over[k]] : over[k];
  return p;
}

let steelMat, batonMats;
const sharedSteel = () => (steelMat ||= new THREE.MeshStandardMaterial({ color: 0xd5dde4, metalness: 0.85, roughness: 0.22 }));
const sharedBaton = () => (batonMats ||= {
  rubber: new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.8 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x6d7276, metalness: 0.7, roughness: 0.35 }),
});

// secondary-motion chains: hang toward world-down (undo parent pitch), stream back with speed
const CHAINS = {
  sash: { bones: ['sash1', 'sash2', 'sash3'], parents: ['hips'], rest: 0.1, k: 0.16, max: 1.25, min: -0.25, lag: [9, 7, 5], flut: 0.14 },
  cape: { bones: ['cape1', 'cape2'], parents: ['hips', 'spine'], rest: 0.06, k: 0.14, max: 1.2, min: 0.0, lag: [6, 4], flut: 0.05 },
  tail: { bones: ['tail1', 'tail2'], parents: ['hips', 'spine'], rest: 0.12, k: 0.08, max: 0.85, min: 0.08, lag: [8, 6], flut: 0.1 },
  skirt: { bones: ['skirt1', 'skirt2'], parents: ['hips'], rest: 0.04, k: 0.09, max: 1.0, min: -0.05, lag: [12, 9], flut: 0.05, legs: true },
};

export class Rig {
  // opts: look ('player' | 'guard' | 'bodyguard' | 'sentry' | 'target'), club, scale, ghost (colour)
  constructor(opts = {}) {
    const { look = 'player', club = false, scale = 1 } = opts;
    const L = getLook(look);
    this.look = look;
    this.lag = L.look.lag || null;

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.scale.setScalar(scale);
    const j = {}, bones = [];
    for (const [name, parent, x, y, z] of BONES) {
      const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z);
      (parent ? j[parent] : this.body).add(b);
      j[name] = b; bones.push(b);
    }
    this.root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    this.skeleton = skeleton;

    // flashable materials are per-rig clones (textures/programs stay shared)
    const mats = {};
    this.flashMats = [];
    this.meshes = [];
    for (const key in L.geos) {
      let m = L.mats[key];
      if (L.look.flash?.includes(key) || key === L.look.lens) {
        m = m.clone();
        if (key !== L.look.lens) { withRim(m, L.rim); this.flashMats.push(m); }
      }
      mats[key] = m;
      const sm = new THREE.SkinnedMesh(L.geos[key], m);
      sm.castShadow = true;
      this.body.add(sm);
      sm.bind(skeleton);
      this.meshes.push(sm);
    }
    this.lensMat = L.look.lens ? mats[L.look.lens] : null;
    this.lensBase = this.lensMat ? [this.lensMat.emissive.getHex(), this.lensMat.emissiveIntensity] : null;
    this.lift = L.look.lift ?? 0.13;
    this.tris = L.tris;

    // hidden blade (left forearm, under the wrist)
    this.blade = new THREE.Group();
    this.blade.position.set(-0.048, -0.27, 0);
    j.faL.add(this.blade);
    const bl = new THREE.Mesh(bladeGeometry(), sharedSteel()); bl.castShadow = true;
    this.blade.add(bl);
    this.blade.scale.y = 0.01;
    // baton (right hand)
    if (club) {
      this.club = new THREE.Group();
      this.club.position.set(0, -0.34, 0);
      this.club.rotation.x = 0.3; // carried slightly tip-down
      j.faR.add(this.club);
      const parts = batonGeometry(), bm = sharedBaton();
      for (const k of ['rubber', 'metal']) for (const g of parts[k]) { const m = new THREE.Mesh(g, bm[k]); m.castShadow = true; this.club.add(m); }
    }

    if (opts.ghost) {
      // last-known-position silhouette: one flat see-through material, no shadows. A depth-only
      // copy drawn after the opaque world lets the see-through pass show only the front surface,
      // so the layers (hood over cowl over torso) don't stack up into an x-ray.
      const g = new THREE.MeshBasicMaterial({ color: opts.ghost, transparent: true, opacity: 0.28, depthWrite: false });
      const depth = new THREE.MeshBasicMaterial({ colorWrite: false });
      this.root.traverse((o) => { if (o.isMesh) { o.material = g; o.castShadow = false; } });
      for (const sm of this.meshes) {
        const d = new THREE.SkinnedMesh(sm.geometry, depth);
        d.renderOrder = 10; this.body.add(d); d.bind(skeleton);
      }
      this.ghostMat = g;
    }

    this.chains = [];
    for (const c of L.look.chains || []) {
      const C = CHAINS[c];
      this.chains.push({ ...C, bones: C.bones.map((n) => j[n]), ang: C.bones.map(() => 0), side: C.bones.map(() => 0) });
    }
    this.lastPos = new THREE.Vector3(); this.hasLast = false; this.t = 0;

    this.j = j;
    this.cur = neutral();
    this.applyNow(this.cur);
  }

  // Blend current pose toward `target` (rate ~ 1/seconds) and write joints. Looks with a `lag`
  // profile blend each joint at its own speed (hips lead, spine and head follow, hands snap).
  apply(target, dt, rate = 14) {
    const k = 1 - Math.exp(-rate * dt);
    const c = this.cur;
    // full-turn moves (spin launcher, rolls) end a whole turn away from rest: wrap, don't unwind
    if (c.spin - (target.spin ?? 0) > Math.PI) c.spin -= TAU; else if ((target.spin ?? 0) - c.spin > Math.PI) c.spin += TAU;
    if (c.hips[0] - target.hips[0] > Math.PI) c.hips[0] -= TAU; else if (target.hips[0] - c.hips[0] > Math.PI) c.hips[0] += TAU;
    for (const key of SCALARS) c[key] += ((target[key] ?? 0) - c[key]) * k;
    for (const name of JOINTS) {
      const a = c[name], b = target[name];
      const kk = this.lag ? 1 - Math.exp(-rate * this.lag[name] * dt) : k;
      a[0] += (b[0] - a[0]) * kk; a[1] += (b[1] - a[1]) * kk; a[2] += (b[2] - a[2]) * kk;
    }
    this.write();
    this.swing(dt);
  }

  swing(dt) {
    if (!this.chains.length || dt <= 0) return;
    this.t += dt;
    const p = this.root.position;
    let fwd = 0, side = 0, vy = 0;
    if (this.hasLast) {
      const dx = (p.x - this.lastPos.x) / dt, dz = (p.z - this.lastPos.z) / dt, yaw = this.root.rotation.y;
      vy = (p.y - this.lastPos.y) / dt;
      fwd = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      side = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      if (Math.hypot(dx, dz) > 30) fwd = side = vy = 0; // teleport / respawn
    }
    this.lastPos.copy(p); this.hasLast = true;
    const c = this.cur, sp = Math.min(12, Math.hypot(fwd, side));
    for (const ch of this.chains) {
      let pitch = c.bodyX;
      for (const n of ch.parents) pitch += c[n][0];
      // a back panel gets pushed out by whichever thigh swings back
      const legPush = ch.legs ? Math.max(0, c.thL[0], c.thR[0]) * 0.9 : 0;
      for (let i = 0; i < ch.bones.length; i++) {
        const stream = Math.max(0, fwd) * ch.k + Math.max(0, -vy) * 0.08 * (i + 1) - Math.max(0, vy) * 0.03;
        const flutter = Math.sin(this.t * (9 + i * 3) + i * 1.7) * ch.flut * Math.min(1, sp / 3) * (i + 1);
        let tgt = (i === 0 ? Math.max(ch.rest - pitch, legPush) : 0.05) + stream * (i === 0 ? 1 : 0.35) + flutter;
        if (i === 0) tgt = Math.max(ch.min, Math.min(ch.max, tgt));
        const kk = 1 - Math.exp(-ch.lag[i] * dt);
        ch.ang[i] += (tgt - ch.ang[i]) * kk;
        ch.side[i] += ((i === 0 ? -side * 0.06 : 0) - ch.side[i]) * kk;
        ch.bones[i].rotation.set(ch.ang[i], 0, ch.side[i]);
      }
    }
  }

  applyNow(p) {
    for (const key of SCALARS) this.cur[key] = p[key] ?? 0;
    for (const name of JOINTS) this.cur[name] = [...p[name]];
    this.write();
  }

  write() {
    const c = this.cur, j = this.j;
    for (const name of JOINTS) j[name].rotation.set(c[name][0], c[name][1], c[name][2]);
    j.hips.position.y = 0.95 + c.y;
    this.body.rotation.x = c.bodyX;
    this.body.rotation.z = c.bodyZ;
    this.body.rotation.y = c.spin;
    this.body.position.y = Math.abs(Math.sin(c.bodyX)) * this.lift; // lying down: keep the kit above the floor
    this.blade.scale.y = Math.max(0.01, c.blade);
    this.blade.visible = c.blade > 0.02;
    // lying down: the baton settles along the forearm instead of standing up off the floor
    if (this.club) this.club.rotation.x = 0.3 + Math.min(1, Math.max(0, (Math.abs(c.bodyX) - 0.7) * 2)) * 1.25;
  }

  // whole-body emissive flash (red attack telegraph, gold posture break); the lenses flare with it
  flash(color, on) {
    for (const m of this.flashMats) m.emissive.setHex(on ? color : 0x000000);
    if (this.lensMat) {
      this.lensMat.emissive.setHex(on ? color : this.lensBase[0]);
      this.lensMat.emissiveIntensity = on ? 4 : this.lensBase[1];
    }
  }
}

// ---------------------------------------------------------------------------
// Pose helpers
// ---------------------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const pos = (v) => Math.max(0, v);

// blend two poses
export function mixPose(a, b, t) {
  const p = neutral();
  for (const k of SCALARS) p[k] = lerp(a[k] ?? 0, b[k] ?? 0, t);
  for (const n of JOINTS) p[n] = [lerp(a[n][0], b[n][0], t), lerp(a[n][1], b[n][1], t), lerp(a[n][2], b[n][2], t)];
  return p;
}
// keyframed move: frames = [[u, pose], ...] ascending; eased between keys
function keys(u, frames) {
  if (u <= frames[0][0]) return mixPose(frames[0][1], frames[0][1], 0);
  for (let i = 1; i < frames.length; i++) {
    if (u <= frames[i][0]) {
      const [u0, a] = frames[i - 1], [u1, b] = frames[i];
      return mixPose(a, b, smooth((u - u0) / (u1 - u0)));
    }
  }
  return mixPose(frames[frames.length - 1][1], frames[frames.length - 1][1], 0);
}
// override joints of a base pose (copies arrays)
function over(base, o) {
  const p = mixPose(base, base, 0);
  for (const k in o) p[k] = Array.isArray(o[k]) ? [...o[k]] : o[k];
  return p;
}

// ---------------------------------------------------------------------------
// Pose generators. Each returns a fresh pose object for this frame.
// The player's set is catlike: low, coiled, springy, with strong anticipation and
// follow-through. Guards get their own heavier, stiffer set (march / guardStance / CLUB / THROW).
// ---------------------------------------------------------------------------
const STANCE = () => pose({
  y: -0.15, hips: [0.05, -0.32, 0], spine: [0.24, 0.28, 0], head: [-0.24, 0.05, 0],
  thL: [-0.62, 0, 0.14], shL: [0.78, 0, 0], thR: [0.32, 0, -0.16], shR: [0.95, 0, 0],
  uaL: [-1.15, 0, 0.18], faL: [-1.35, 0, 0], uaR: [-0.55, 0, -0.25], faR: [-2.15, 0, 0],
});
const GUARD_STANCE = () => pose({
  y: -0.06, hips: [0, -0.12, 0], spine: [0.08, 0.12, 0], head: [-0.05, 0, 0],
  thL: [-0.3, 0, 0.1], shL: [0.35, 0, 0], thR: [0.22, 0, -0.1], shR: [0.3, 0, 0],
  uaL: [-0.7, 0, 0.22], faL: [-1.2, 0, 0], uaR: [-0.95, 0, -0.22], faR: [-1.45, 0, 0],
});

const ATTACKS = {
  // right straight: twist the right shoulder back, drive through, overshoot, settle
  L1: () => {
    const s = STANCE();
    return [[0, s],
      [0.24, over(s, { y: -0.18, hips: [0.05, -0.5, 0], spine: [0.16, -0.42, 0], uaR: [0.35, 0, -0.35], faR: [-2.3, 0, 0], uaL: [-1.25, 0, 0.25], faL: [-1.5, 0, 0] })],
      [0.42, over(s, { y: -0.2, hips: [0.05, 0.12, 0], spine: [0.3, 0.72, 0], head: [-0.25, -0.5, 0], uaR: [-1.62, 0, 0.05], faR: [-0.08, 0, 0], uaL: [-0.45, 0, 0.3], faL: [-1.9, 0, 0], thL: [-0.8, 0, 0.12], shL: [0.9, 0, 0], thR: [0.52, 0, -0.12], shR: [0.65, 0, 0] })],
      [0.52, over(s, { y: -0.22, hips: [0.05, 0.18, 0], spine: [0.36, 0.86, 0], head: [-0.25, -0.6, 0], uaR: [-1.7, 0, 0.12], faR: [-0.02, 0, 0], uaL: [-0.4, 0, 0.3], faL: [-1.95, 0, 0], thL: [-0.85, 0, 0.12], shL: [0.95, 0, 0], thR: [0.55, 0, -0.12], shR: [0.6, 0, 0] })],
      [1, s]];
  },
  // left backhand sweep with the blade arm
  L2: () => {
    const s = STANCE();
    return [[0, s],
      [0.24, over(s, { y: -0.17, hips: [0.05, -0.1, 0], spine: [0.15, 0.62, 0], uaL: [-0.55, 0, 1.35], faL: [-1.9, 0, 0], uaR: [-1.1, 0, -0.2], faR: [-1.6, 0, 0] })],
      [0.42, over(s, { y: -0.2, hips: [0.05, -0.55, 0], spine: [0.3, -0.62, 0], head: [-0.25, 0.55, 0], uaL: [-1.48, 0, -0.45], faL: [-0.25, 0, 0], uaR: [-0.4, 0, -0.5], faR: [-1.8, 0, 0], thR: [-0.6, 0, -0.12], shR: [0.85, 0, 0], thL: [0.25, 0, 0.12], shL: [0.75, 0, 0] })],
      [0.52, over(s, { y: -0.22, hips: [0.05, -0.62, 0], spine: [0.34, -0.78, 0], head: [-0.25, 0.6, 0], uaL: [-1.5, 0, -0.62], faL: [-0.15, 0, 0], uaR: [-0.35, 0, -0.55], faR: [-1.8, 0, 0], thR: [-0.62, 0, -0.12], shR: [0.85, 0, 0], thL: [0.28, 0, 0.12], shL: [0.75, 0, 0] })],
      [1, s]];
  },
  // knock-back front kick: chamber, snap, recoil, step down
  L3: () => {
    const s = STANCE();
    return [[0, s],
      [0.28, over(s, { y: -0.05, hips: [-0.1, -0.1, 0], spine: [-0.1, 0.12, 0], thR: [-1.65, 0, -0.05], shR: [2.1, 0, 0], thL: [0.05, 0, 0.05], shL: [0.3, 0, 0], uaL: [-0.8, 0, 0.5], faL: [-1.5, 0, 0], uaR: [0.2, 0, -0.5], faR: [-1.3, 0, 0] })],
      [0.42, over(s, { y: -0.04, hips: [-0.25, -0.05, 0], spine: [-0.42, 0.1, 0], head: [0.15, 0, 0], thR: [-1.75, 0, -0.05], shR: [0.02, 0, 0], thL: [0.12, 0, 0.05], shL: [0.18, 0, 0], uaL: [-0.4, 0, 1.25], faL: [-0.4, 0, 0], uaR: [0.4, 0, -1.1], faR: [-0.4, 0, 0] })],
      [0.52, over(s, { y: -0.04, hips: [-0.3, -0.05, 0], spine: [-0.5, 0.1, 0], head: [0.2, 0, 0], thR: [-1.92, 0, -0.05], shR: [0.0, 0, 0], thL: [0.14, 0, 0.05], shL: [0.18, 0, 0], uaL: [-0.35, 0, 1.3], faL: [-0.35, 0, 0], uaR: [0.45, 0, -1.15], faR: [-0.35, 0, 0] })],
      [0.72, over(s, { y: -0.08, spine: [-0.05, 0.15, 0], thR: [-1.3, 0, -0.05], shR: [1.7, 0, 0], thL: [0.0, 0, 0.08], shL: [0.4, 0, 0] })],
      [1, s]];
  },
  // heavy: rise up on the toes, both fists overhead, slam down into a deep crouch
  H: () => {
    const s = STANCE();
    return [[0, s],
      [0.3, over(s, { y: -0.02, hips: [-0.1, -0.1, 0], spine: [-0.45, 0.05, 0], head: [0.25, 0, 0], uaL: [-2.95, 0, -0.15], faL: [-1.0, 0, 0], uaR: [-2.95, 0, 0.15], faR: [-1.0, 0, 0], thL: [-0.4, 0, 0.1], shL: [0.5, 0, 0], thR: [0.2, 0, -0.1], shR: [0.4, 0, 0] })],
      [0.45, over(s, { y: -0.34, hips: [0.15, -0.1, 0], spine: [0.85, 0.05, 0], head: [-0.55, 0, 0], uaL: [-0.85, 0, 0.0], faL: [-0.15, 0, 0], uaR: [-0.85, 0, 0], faR: [-0.15, 0, 0], thL: [-1.05, 0, 0.15], shL: [1.35, 0, 0], thR: [0.35, 0, -0.15], shR: [1.3, 0, 0] })],
      [0.56, over(s, { y: -0.38, hips: [0.18, -0.1, 0], spine: [0.95, 0.05, 0], head: [-0.6, 0, 0], uaL: [-0.72, 0, 0.0], faL: [-0.1, 0, 0], uaR: [-0.72, 0, 0], faR: [-0.1, 0, 0], thL: [-1.12, 0, 0.15], shL: [1.45, 0, 0], thR: [0.38, 0, -0.15], shR: [1.38, 0, 0] })],
      [0.72, over(s, { y: -0.3, spine: [0.7, 0.1, 0], head: [-0.45, 0, 0], uaL: [-0.8, 0, 0.1], faL: [-0.5, 0, 0], uaR: [-0.8, 0, -0.1], faR: [-0.5, 0, 0], thL: [-0.95, 0, 0.15], shL: [1.2, 0, 0], thR: [0.3, 0, -0.15], shR: [1.2, 0, 0] })],
      [1, s]];
  },
  // spin launcher: coil low, whip round with arms flung and the right leg sweeping
  LAUNCH: () => {
    const s = STANCE();
    const out = over(s, { y: -0.1, hips: [0, 0, 0], spine: [0.15, 0, 0], head: [-0.1, 0, 0], uaL: [-0.25, 0, 1.45], faL: [-0.1, 0, 0], uaR: [-0.25, 0, -1.45], faR: [-0.1, 0, 0], thR: [-1.15, 0, -0.75], shR: [0.15, 0, 0], thL: [-0.2, 0, 0.1], shL: [0.5, 0, 0] });
    return [[0, s],
      [0.25, over(s, { y: -0.34, spine: [0.45, -0.55, 0], hips: [0.1, -0.4, 0], uaL: [-0.6, 0, -0.2], faL: [-1.8, 0, 0], uaR: [-0.5, 0, 0.3], faR: [-1.9, 0, 0], thL: [-1.0, 0, 0.15], shL: [1.4, 0, 0], thR: [-0.2, 0, -0.15], shR: [1.5, 0, 0] })],
      [0.42, out], [0.66, over(out, { y: -0.14, uaL: [-0.3, 0, 1.3], uaR: [-0.3, 0, -1.3], thR: [-0.9, 0, -0.5], shR: [0.4, 0, 0] })],
      [1, s]];
  },
  // grab with the right hand, thrust the hidden blade with the left
  ASSASSIN: () => {
    const s = STANCE();
    return [[0, over(s, { blade: 0.2 })],
      [0.3, over(s, { blade: 0.8, y: -0.16, hips: [0.05, 0.2, 0], spine: [0.3, 0.48, 0], uaL: [0.35, 0, 0.35], faL: [-2.1, 0, 0], uaR: [-1.45, 0, -0.1], faR: [-0.5, 0, 0], thL: [-0.7, 0, 0.12], shL: [0.9, 0, 0], thR: [0.35, 0, -0.12], shR: [0.8, 0, 0] })],
      [0.5, over(s, { blade: 1, y: -0.2, hips: [0.1, -0.3, 0], spine: [0.45, -0.5, 0], head: [-0.2, 0.3, 0], uaL: [-1.75, 0, -0.1], faL: [-0.03, 0, 0], uaR: [-1.0, 0, -0.4], faR: [-1.6, 0, 0], thL: [-0.95, 0, 0.12], shL: [1.1, 0, 0], thR: [0.45, 0, -0.12], shR: [0.85, 0, 0] })],
      [0.6, over(s, { blade: 1, y: -0.22, hips: [0.1, -0.36, 0], spine: [0.5, -0.62, 0], head: [-0.2, 0.35, 0], uaL: [-1.85, 0, -0.12], faL: [-0.02, 0, 0], uaR: [-0.95, 0, -0.45], faR: [-1.65, 0, 0], thL: [-1.0, 0, 0.12], shL: [1.15, 0, 0], thR: [0.48, 0, -0.12], shR: [0.85, 0, 0] })],
      [0.85, over(s, { blade: 1, y: -0.2, spine: [0.4, -0.45, 0], uaL: [-1.6, 0, -0.05], faL: [-0.3, 0, 0], uaR: [-0.8, 0, -0.4], faR: [-1.6, 0, 0], thL: [-0.9, 0, 0.12], shL: [1.05, 0, 0] })],
      [1, over(s, { blade: 0.4 })]];
  },
  // air assassination: blade cocked overhead in the dive, drive down onto the target, kneel
  AIR: () => {
    const s = STANCE();
    const dive = over(s, { blade: 1, y: 0, hips: [0, 0, 0], spine: [-0.2, 0.1, 0], head: [0.35, 0, 0], uaL: [-2.85, 0, 0.3], faL: [-0.7, 0, 0], uaR: [-2.4, 0, -0.5], faR: [-0.6, 0, 0], thL: [-1.3, 0, 0.1], shL: [1.9, 0, 0], thR: [-0.8, 0, -0.1], shR: [1.6, 0, 0] });
    return [[0, dive], [0.6, over(dive, { spine: [0.15, 0.1, 0], uaL: [-2.95, 0, 0.2], faL: [-1.3, 0, 0] })],
      [0.9, over(s, { blade: 1, y: -0.42, hips: [0.1, 0, 0], spine: [0.95, -0.1, 0], head: [-0.45, 0, 0], uaL: [-1.0, 0, 0.05], faL: [-0.05, 0, 0], uaR: [-0.6, 0, -0.75], faR: [-0.4, 0, 0], thL: [-1.6, 0, 0.2], shL: [2.2, 0, 0], thR: [-0.75, 0, -0.25], shR: [2.3, 0, 0] })],
      [1, over(s, { blade: 1, y: -0.44, hips: [0.1, 0, 0], spine: [1.0, -0.1, 0], head: [-0.5, 0, 0], uaL: [-0.95, 0, 0.05], faL: [-0.05, 0, 0], uaR: [-0.55, 0, -0.8], faR: [-0.4, 0, 0], thL: [-1.62, 0, 0.2], shL: [2.25, 0, 0], thR: [-0.75, 0, -0.25], shR: [2.35, 0, 0] })]];
  },
  // counter: parry with the right forearm, sweep the strike aside, stab under it
  COUNTER: () => {
    const s = STANCE();
    return [[0, s],
      [0.25, over(s, { blade: 0.6, spine: [0.15, -0.5, 0], uaR: [-1.6, 0, 0.45], faR: [-1.45, 0, 0], uaL: [0.1, 0, 0.4], faL: [-2.0, 0, 0] })],
      [0.42, over(s, { blade: 1, spine: [0.2, 0.25, 0], uaR: [-1.1, 0, -1.25], faR: [-0.6, 0, 0], uaL: [0.2, 0, 0.35], faL: [-2.1, 0, 0] })],
      [0.6, over(s, { blade: 1, y: -0.22, hips: [0.1, -0.35, 0], spine: [0.42, -0.58, 0], head: [-0.2, 0.3, 0], uaL: [-1.72, 0, -0.1], faL: [-0.05, 0, 0], uaR: [-0.8, 0, -1.0], faR: [-0.6, 0, 0], thL: [-0.95, 0, 0.12], shL: [1.05, 0, 0], thR: [0.5, 0, -0.12], shR: [0.85, 0, 0] })],
      [0.7, over(s, { blade: 1, y: -0.24, hips: [0.1, -0.4, 0], spine: [0.48, -0.7, 0], head: [-0.2, 0.35, 0], uaL: [-1.82, 0, -0.12], faL: [-0.02, 0, 0], uaR: [-0.75, 0, -1.05], faR: [-0.6, 0, 0], thL: [-1.0, 0, 0.12], shL: [1.1, 0, 0], thR: [0.52, 0, -0.12], shR: [0.85, 0, 0] })],
      [1, over(s, { blade: 0.5 })]];
  },
  // execution: drop, spring up with the blade overhead, drive it down
  EXECUTE: () => {
    const s = STANCE();
    return [[0, s],
      [0.2, over(s, { blade: 1, y: -0.32, spine: [0.55, 0.1, 0], uaL: [-0.4, 0, 0.3], faL: [-1.6, 0, 0], uaR: [-0.3, 0, -0.3], faR: [-1.6, 0, 0], thL: [-1.1, 0, 0.12], shL: [1.5, 0, 0], thR: [0.0, 0, -0.12], shR: [1.6, 0, 0] })],
      [0.45, over(s, { blade: 1, y: 0.04, hips: [-0.1, 0.1, 0], spine: [-0.35, 0.2, 0], head: [0.2, 0, 0], uaL: [-3.0, 0, 0.2], faL: [-0.4, 0, 0], uaR: [-2.2, 0, -0.6], faR: [-0.3, 0, 0], thL: [-0.5, 0, 0.1], shL: [0.4, 0, 0], thR: [0.3, 0, -0.1], shR: [0.4, 0, 0] })],
      [0.62, over(s, { blade: 1, y: -0.36, hips: [0.15, -0.1, 0], spine: [0.9, -0.15, 0], head: [-0.5, 0, 0], uaL: [-0.9, 0, 0.0], faL: [-0.05, 0, 0], uaR: [-0.4, 0, -0.9], faR: [-0.5, 0, 0], thL: [-1.2, 0, 0.15], shL: [1.5, 0, 0], thR: [0.4, 0, -0.15], shR: [1.4, 0, 0] })],
      [0.72, over(s, { blade: 1, y: -0.4, hips: [0.18, -0.1, 0], spine: [1.0, -0.2, 0], head: [-0.55, 0, 0], uaL: [-0.8, 0, 0.0], faL: [-0.02, 0, 0], uaR: [-0.35, 0, -0.95], faR: [-0.5, 0, 0], thL: [-1.25, 0, 0.15], shL: [1.6, 0, 0], thR: [0.42, 0, -0.15], shR: [1.45, 0, 0] })],
      [1, over(s, { blade: 0.5 })]];
  },
  // guards: a big mechanical overhead chop. windup 0..0.35 (held as long as the telegraph), strike, follow-through
  CLUB: () => {
    const s = GUARD_STANCE();
    return [[0, s],
      [0.35, over(s, { y: 0.0, hips: [0, 0.2, 0], spine: [-0.25, -0.45, 0], head: [0.05, 0.4, 0], uaR: [-2.95, 0, -0.35], faR: [-1.35, 0, 0], uaL: [-0.95, 0, 0.35], faL: [-1.2, 0, 0], thL: [-0.35, 0, 0.1], shL: [0.3, 0, 0] })],
      [0.5, over(s, { y: -0.16, hips: [0.05, -0.2, 0], spine: [0.5, 0.5, 0], head: [-0.3, -0.4, 0], uaR: [-0.55, 0, 0.12], faR: [-0.15, 0, 0], uaL: [-0.2, 0, 0.3], faL: [-0.9, 0, 0], thL: [-0.65, 0, 0.1], shL: [0.75, 0, 0], thR: [0.35, 0, -0.1], shR: [0.4, 0, 0] })],
      [0.62, over(s, { y: -0.18, hips: [0.05, -0.25, 0], spine: [0.58, 0.58, 0], head: [-0.3, -0.45, 0], uaR: [-0.25, 0, 0.2], faR: [-0.1, 0, 0], uaL: [-0.1, 0, 0.3], faL: [-0.8, 0, 0], thL: [-0.68, 0, 0.1], shL: [0.8, 0, 0], thR: [0.38, 0, -0.1], shR: [0.4, 0, 0] })],
      [1, s]];
  },
  THROW: () => {
    const s = GUARD_STANCE();
    return [[0, s],
      [0.35, over(s, { spine: [-0.25, -0.6, 0], head: [0.05, 0.55, 0], uaR: [-2.5, 0, -0.75], faR: [-1.5, 0, 0], uaL: [-1.5, 0, 0.3], faL: [-0.2, 0, 0], thL: [-0.4, 0, 0.1], shL: [0.35, 0, 0], thR: [0.3, 0, -0.1], shR: [0.4, 0, 0] })],
      [0.5, over(s, { y: -0.08, spine: [0.35, 0.5, 0], head: [-0.2, -0.45, 0], uaR: [-1.35, 0, 0.05], faR: [0, 0, 0], uaL: [0.2, 0, 0.3], faL: [-0.6, 0, 0], thL: [-0.6, 0, 0.1], shL: [0.6, 0, 0] })],
      [0.65, over(s, { y: -0.1, spine: [0.45, 0.6, 0], head: [-0.25, -0.5, 0], uaR: [-0.6, 0, 0.15], faR: [-0.1, 0, 0], uaL: [0.3, 0, 0.3], faL: [-0.6, 0, 0], thL: [-0.62, 0, 0.1], shL: [0.62, 0, 0] })],
      [1, s]];
  },
};
const attackCache = {};

export const Poses = {
  // breathing, weight drifting from leg to leg, knees soft
  idle(t) {
    const b = Math.sin(t * 1.8), w = Math.sin(t * 0.45), l = Math.sin(t * 0.31);
    return pose({
      y: -0.03 - 0.008 * b, hips: [0.02, 0.06 * w, 0.045 * w], spine: [0.07 + 0.015 * b, -0.05 * w, -0.04 * w], head: [-0.05, 0.12 * l, 0.02 * w],
      thL: [-0.05 - 0.05 * w, 0, 0.035 - 0.045 * w], shL: [0.1 + 0.14 * pos(w), 0, 0], thR: [0.03 + 0.05 * w, 0, -0.035 - 0.045 * w], shR: [0.1 + 0.14 * pos(-w), 0, 0],
      uaL: [0.12 + 0.02 * b, 0, 0.1], faL: [-0.38, 0, 0], uaR: [0.08 + 0.02 * b, 0, -0.1], faR: [-0.32, 0, 0],
    });
  },

  // phase: stride phase (radians); a: 0 walk .. 1 sprint; crouch: 0..1 stalk; flow: 0..1 momentum
  run(phase, a, crouch = 0, flow = 0) {
    const s = Math.sin(phase), c = Math.cos(phase), k = crouch;
    const A = (0.38 + 0.62 * a + 0.2 * flow * a) * (1 - 0.35 * k);
    // knee: tucks hard in the swing (thigh moving forward), soft flex in mid-stance
    const knee = (cc) => 0.12 + 0.12 * a + (0.3 + 1.5 * a + 0.55 * k) * pos(cc) ** 1.2 + 0.28 * a * pos(-cc) + 1.2 * k;
    const tw = 0.16 * (0.3 + a) * (1 - 0.6 * k); // pelvis twist; shoulders counter-rotate
    const lean = 0.06 + 0.32 * a + 0.16 * flow * a + 0.45 * k;
    const armA = (0.3 + 0.85 * a) * (1 - 0.7 * k);
    const p = pose({
      y: -0.02 - 0.05 * a - 0.12 * flow * a - (0.02 + 0.05 * a) * (0.5 + 0.5 * Math.cos(2 * phase)) - 0.36 * k,
      hips: [0.04 * a, -s * tw, c * 0.05 * (0.3 + a)],
      spine: [lean, s * tw * 1.7, -c * 0.03],
      thL: [-s * A - 0.12 * a - 0.85 * k, 0, 0.02], shL: [knee(c), 0, 0],
      thR: [s * A - 0.12 * a - 0.85 * k, 0, -0.02], shR: [knee(-c), 0, 0],
      uaL: [s * armA - 0.45 * k, 0, 0.12 - 0.04 * a + 0.12 * k], faL: [-0.45 - 1.0 * a - 0.3 * a * pos(-s) - 0.6 * k, 0, 0],
      uaR: [-s * armA - 0.45 * k, 0, -0.12 + 0.04 * a - 0.12 * k], faR: [-0.45 - 1.0 * a - 0.3 * a * pos(s) - 0.6 * k, 0, 0],
    });
    // head stays level and looks where it's going
    p.head = [-(lean * 0.75) - 0.05 * a - 0.2 * k, -(p.spine[1] + p.hips[1]) * 0.85, 0];
    return p;
  },

  // air: push-off stretch early, tuck at the apex, legs reaching for the ground on the way down
  air(vy, t = 1) {
    const u = clamp(vy / 7, -1, 1);
    const tuck = pose({ y: 0.06, spine: [0.32, 0, 0], head: [-0.12, 0, 0], thL: [-1.35, 0, 0.08], shL: [1.9, 0, 0], thR: [-1.15, 0, -0.08], shR: [1.75, 0, 0], uaL: [-0.9, 0, 0.35], faL: [-1.2, 0, 0], uaR: [-0.8, 0, -0.35], faR: [-1.2, 0, 0] });
    const rise = pose({ spine: [0.12, 0, 0], head: [-0.2, 0, 0], thL: [-1.0, 0, 0.05], shL: [1.35, 0, 0], thR: [0.35, 0, -0.05], shR: [0.6, 0, 0], uaL: [-1.4, 0, 0.3], faL: [-0.5, 0, 0], uaR: [-1.2, 0, -0.35], faR: [-0.5, 0, 0] });
    const fall = pose({ spine: [0.1, 0, 0], head: [0.2, 0, 0], thL: [-0.55, 0, 0.12], shL: [0.55, 0, 0], thR: [-0.25, 0, -0.12], shR: [0.38, 0, 0], uaL: [-0.55, 0, 1.15], faL: [-0.4, 0, 0], uaR: [-0.45, 0, -1.15], faR: [-0.4, 0, 0] });
    let p = u >= 0 ? mixPose(tuck, rise, smooth(u)) : mixPose(tuck, fall, smooth(-u * 1.3));
    if (t < 0.16 && vy > 0) { // push-off: the trailing leg is still extending
      const push = pose({ y: -0.04, spine: [0.22, 0, 0], head: [-0.25, 0, 0], thL: [-0.9, 0, 0], shL: [1.2, 0, 0], thR: [0.55, 0, 0], shR: [0.15, 0, 0], uaL: [-1.6, 0, 0.2], faL: [-0.3, 0, 0], uaR: [-1.5, 0, -0.25], faR: [-0.3, 0, 0] });
      p = mixPose(p, push, 1 - t / 0.16);
    }
    return p;
  },

  // landing: k 1 at impact -> 0. big = a hard drop: three-point cat landing, hand to the ground
  land(k, big = false) {
    const e = Math.pow(clamp(k, 0, 1), 0.6);
    if (big) {
      return pose({
        y: -0.68 * e, hips: [0.15 * e, 0, 0], spine: [0.95 * e, -0.15 * e, 0], head: [-0.75 * e, 0.1 * e, 0],
        thL: [-1.6 * e, 0, 0.2 * e], shL: [2.15 * e, 0, 0], thR: [-0.75 * e, 0, -0.28 * e], shR: [2.3 * e, 0, 0],
        uaR: [-1.0 * e, 0, -0.12 * e], faR: [-0.05, 0, 0], uaL: [0.35 * e, 0, 0.95 * e], faL: [-0.4, 0, 0],
      });
    }
    return pose({
      y: -0.3 * e, spine: [0.45 * e, 0, 0], head: [-0.3 * e, 0, 0],
      thL: [-1.0 * e, 0, 0.12], shL: [1.4 * e, 0, 0], thR: [-0.9 * e, 0, -0.12], shR: [1.35 * e, 0, 0],
      uaL: [-0.45 * e, 0, 0.5 * e], faL: [-0.5, 0, 0], uaR: [-0.45 * e, 0, -0.5 * e], faR: [-0.5, 0, 0],
    });
  },

  // climbing: reach-and-pull, the body swaying toward the reaching hand, the opposite leg driving.
  // o.leap (1 at launch -> 0) stretches out into the leap; o.still hangs and breathes.
  climb(phase, o = {}) {
    if (typeof o !== 'object') o = { hang: !!o };
    const s = Math.sin(phase), r = (s + 1) / 2;
    let p = pose({
      y: 0.02 * Math.abs(s), bodyZ: -0.1 * s, hips: [0, -0.1 * s, 0], spine: [0.12, 0.12 * s, 0], head: [-0.45, 0.15 * s, 0],
      uaL: [lerp(-1.95, -2.95, r), 0, 0.06 + 0.1 * (1 - r)], faL: [lerp(-1.5, -0.15, r), 0, 0],
      uaR: [lerp(-2.95, -1.95, r), 0, -0.06 - 0.1 * r], faR: [lerp(-0.15, -1.5, r), 0, 0],
      thL: [lerp(-1.3, -0.45, r), 0, 0.12], shL: [lerp(1.85, 0.7, r), 0, 0],
      thR: [lerp(-0.45, -1.3, r), 0, -0.12], shR: [lerp(0.7, 1.85, r), 0, 0],
    });
    if (o.still || o.hang) {
      const b = Math.sin((o.t || 0) * 1.6);
      const still = pose({
        y: -0.02 + 0.01 * b, spine: [0.1 + 0.02 * b, 0, 0], head: [-0.35, 0.2 * Math.sin((o.t || 0) * 0.4), 0],
        uaL: [-2.7, 0, 0.1], faL: [-0.55, 0, 0], uaR: [-2.7, 0, -0.1], faR: [-0.55, 0, 0],
        thL: o.hang ? [-0.2, 0, 0.06] : [-0.85, 0, 0.14], shL: o.hang ? [0.35, 0, 0] : [1.3, 0, 0],
        thR: o.hang ? [-0.05, 0, -0.06] : [-0.6, 0, -0.14], shR: o.hang ? [0.3, 0, 0] : [1.1, 0, 0],
      });
      p = mixPose(p, still, o.still === true || o.hang ? 1 : o.still);
    }
    if (o.leap > 0) {
      const ext = pose({ y: 0.05, spine: [-0.05, 0, 0], head: [-0.6, 0, 0], uaL: [-3.0, 0, 0.15], faL: [-0.1, 0, 0], uaR: [-3.0, 0, -0.15], faR: [-0.1, 0, 0], thL: [-0.15, 0, 0.06], shL: [0.2, 0, 0], thR: [0.1, 0, -0.06], shR: [0.4, 0, 0] });
      p = mixPose(p, ext, Math.pow(o.leap, 0.7));
    }
    return p;
  },

  // wall-run: legs running on the wall, body leaning off it, inner hand skimming the wall,
  // outer arm flung out for balance, head held level
  wallrun(phase, side) {
    const p = Poses.run(phase, 1);
    p.bodyZ = 0.5 * side;
    p.head[2] = -0.3 * side;
    if (side > 0) { p.uaL = [-0.55, 0, 1.4]; p.faL = [-0.5, 0, 0]; p.uaR = [-0.35, 0, -1.25]; p.faR = [-0.3, 0, 0]; }
    else { p.uaR = [-0.55, 0, -1.4]; p.faR = [-0.5, 0, 0]; p.uaL = [-0.35, 0, 1.25]; p.faL = [-0.3, 0, 0]; }
    return p;
  },

  // one-hand speed vault: plant the left hand, swing both legs through on the right, land running
  vault(u) {
    return keys(u, [
      [0, pose({ y: -0.05, spine: [0.38, 0, 0], uaL: [-1.3, 0, 0.15], faL: [-0.2, 0, 0], uaR: [0.3, 0, -0.2], faR: [-0.8, 0, 0], thL: [-0.65, 0, 0], shL: [0.9, 0, 0], thR: [0.35, 0, 0], shR: [0.7, 0, 0] })],
      [0.3, pose({ y: -0.06, bodyZ: -0.45, hips: [0, 0.3, 0], spine: [0.45, 0.2, 0], head: [-0.3, 0, 0.3], uaL: [-0.9, 0, 0.35], faL: [0, 0, 0], uaR: [-0.6, 0, -1.25], faR: [-0.3, 0, 0], thL: [-1.5, 0, -0.55], shL: [1.5, 0, 0], thR: [-1.3, 0, -0.65], shR: [1.75, 0, 0] })],
      [0.62, pose({ y: -0.04, bodyZ: -0.22, hips: [0, 0.15, 0], spine: [0.3, 0.1, 0], head: [-0.2, 0, 0.15], uaL: [-0.15, 0, 0.6], faL: [-0.2, 0, 0], uaR: [-0.9, 0, -0.75], faR: [-0.4, 0, 0], thL: [-1.1, 0, -0.2], shL: [0.6, 0, 0], thR: [-0.55, 0, -0.3], shR: [1.25, 0, 0] })],
      [1, pose({ y: -0.06, spine: [0.32, 0, 0], head: [-0.2, 0, 0], uaL: [0.4, 0, 0.12], faL: [-1.0, 0, 0], uaR: [-0.5, 0, -0.12], faR: [-1.1, 0, 0], thL: [-0.5, 0, 0], shL: [0.7, 0, 0], thR: [0.3, 0, 0], shR: [0.95, 0, 0] })],
    ]);
  },

  // mantle: hang, press up over the edge, swing a knee over, rise into a crouch
  mantle(u) {
    return keys(u, [
      [0, pose({ y: -0.2, spine: [0.15, 0, 0], head: [-0.4, 0, 0], uaL: [-2.75, 0, 0.25], faL: [-0.35, 0, 0], uaR: [-2.75, 0, -0.25], faR: [-0.35, 0, 0], thL: [-0.25, 0, 0.05], shL: [0.4, 0, 0], thR: [-0.05, 0, -0.05], shR: [0.3, 0, 0] })],
      [0.35, pose({ y: -0.06, spine: [0.75, 0, 0], head: [-0.6, 0, 0], uaL: [-0.55, 0, 0.35], faL: [-1.5, 0, 0], uaR: [-0.55, 0, -0.35], faR: [-1.5, 0, 0], thL: [-0.35, 0, 0.05], shL: [0.6, 0, 0], thR: [-0.2, 0, -0.05], shR: [0.5, 0, 0] })],
      [0.6, pose({ y: -0.1, bodyZ: 0.1, spine: [0.62, 0, 0], head: [-0.5, 0, 0], uaL: [-0.3, 0, 0.4], faL: [-0.2, 0, 0], uaR: [-0.3, 0, -0.4], faR: [-0.2, 0, 0], thL: [0.2, 0, 0.1], shL: [0.45, 0, 0], thR: [-1.8, 0, -0.2], shR: [2.0, 0, 0] })],
      [0.85, pose({ y: -0.26, spine: [0.5, 0, 0], head: [-0.35, 0, 0], uaL: [-0.6, 0, 0.3], faL: [-0.7, 0, 0], uaR: [-0.6, 0, -0.3], faR: [-0.7, 0, 0], thL: [-0.8, 0, 0.1], shL: [1.3, 0, 0], thR: [-1.1, 0, -0.1], shR: [1.6, 0, 0] })],
      [1, pose({ y: -0.06, spine: [0.25, 0, 0], head: [-0.15, 0, 0], uaL: [0.1, 0, 0.15], faL: [-0.6, 0, 0], uaR: [0.1, 0, -0.15], faR: [-0.6, 0, 0], thL: [-0.3, 0, 0.04], shL: [0.45, 0, 0], thR: [-0.15, 0, -0.04], shR: [0.4, 0, 0] })],
    ]);
  },

  // power slide: lean back, lead leg out, trailing leg tucked, a hand skimming the ground
  slide() {
    return pose({
      y: -0.56, bodyX: -0.3, hips: [0, 0.2, 0], spine: [0.22, -0.15, 0], head: [0.25, 0.1, 0],
      thL: [-1.35, 0, 0.05], shL: [0.12, 0, 0], thR: [-0.45, 0, -0.35], shR: [2.0, 0, 0],
      uaL: [-0.9, 0, 0.45], faL: [-0.6, 0, 0], uaR: [0.45, 0, -0.65], faR: [-0.1, 0, 0],
    });
  },

  // dodge: a cat spring. compress, launch long and low, gather. dir = [forward, side] (local, unit)
  dodge(u, dir = [0, 1]) {
    const [f, sd] = dir, back = f < -0.3;
    const lean = back ? -0.25 : 1;
    const p = keys(u, [
      [0, pose({ y: -0.32, spine: [0.55 * lean, 0, 0], head: [-0.35, 0, 0], thL: [-1.1, 0, 0.12], shL: [1.7, 0, 0], thR: [-0.9, 0, -0.12], shR: [1.75, 0, 0], uaL: [-0.4, 0, 0.3], faL: [-1.6, 0, 0], uaR: [-0.4, 0, -0.3], faR: [-1.6, 0, 0] })],
      [0.35, pose({ y: -0.1, spine: [0.22 * lean, 0, 0], head: [-0.2, 0, 0], thL: back ? [0.3, 0, 0.1] : [-0.75, 0, 0.1], shL: [0.3, 0, 0], thR: back ? [-0.5, 0, -0.1] : [0.55, 0, -0.1], shR: [0.35, 0, 0], uaL: [-1.2, 0, 0.65], faL: [-0.35, 0, 0], uaR: [-1.0, 0, -0.75], faR: [-0.35, 0, 0] })],
      [0.72, pose({ y: -0.28, spine: [0.45 * lean, 0, 0], head: [-0.3, 0, 0], thL: [-1.0, 0, 0.14], shL: [1.4, 0, 0], thR: [-0.5, 0, -0.14], shR: [1.6, 0, 0], uaL: [-0.7, 0, 0.6], faL: [-0.8, 0, 0], uaR: [-0.5, 0, -0.6], faR: [-0.8, 0, 0] })],
      [1, STANCE()],
    ]);
    p.bodyZ += -0.35 * sd * Math.sin(Math.min(1, u * 1.4) * Math.PI);
    return p;
  },

  // combat ready: low, asymmetric, blade arm leading
  stance(t = 0) {
    const p = STANCE();
    const b = Math.sin(t * 2.2);
    p.y += 0.012 * b; p.spine[0] += 0.015 * b;
    return p;
  },

  // guards: heavy, square, upright march; baton carried at the ready
  march(phase, a) {
    const s = Math.sin(phase), c = Math.cos(phase);
    const A = 0.3 + 0.42 * a;
    return pose({
      y: -0.01 - 0.03 * a - 0.015 * (0.5 + 0.5 * Math.cos(2 * phase)),
      hips: [0, -s * 0.05, 0], spine: [0.03 + 0.14 * a, s * 0.04, 0], head: [-0.02 - 0.1 * a, 0, 0],
      thL: [-s * A, 0, 0.03], shL: [0.08 + (0.25 + 0.85 * a) * pos(c), 0, 0],
      thR: [s * A, 0, -0.03], shR: [0.08 + (0.25 + 0.85 * a) * pos(-c), 0, 0],
      uaL: [s * (0.18 + 0.4 * a), 0, 0.12], faL: [-0.25 - 0.6 * a, 0, 0],
      uaR: [-0.35 - s * 0.12 * a, 0, -0.14], faR: [-0.95 - 0.3 * a, 0, 0],
    });
  },
  guardIdle(t = 0) {
    const b = Math.sin(t * 1.5);
    return pose({ y: -0.01, spine: [0.03 + 0.01 * b, 0, 0], head: [-0.03, 0.1 * Math.sin(t * 0.27), 0],
      thL: [-0.02, 0, 0.06], shL: [0.04, 0, 0], thR: [0.02, 0, -0.06], shR: [0.04, 0, 0],
      uaL: [0.05, 0, 0.13], faL: [-0.25, 0, 0], uaR: [-0.32, 0, -0.14], faR: [-0.95, 0, 0] });
  },
  guardStance(t = 0) {
    const p = GUARD_STANCE();
    p.spine[0] += 0.01 * Math.sin(t * 1.6);
    return p;
  },

  // attack keyframes: anticipation -> strike -> overshoot -> settle, u = 0..1 through the move
  attack(kind, u) {
    const f = ATTACKS[kind];
    if (!f) return STANCE();
    const frames = (attackCache[kind] ||= f());
    const p = keys(u, frames);
    if (kind === 'LAUNCH') p.spin = smooth((u - 0.25) / 0.45) * TAU;
    return p;
  },

  block() {
    return pose({
      y: -0.12, hips: [0.05, -0.25, 0], spine: [0.2, 0.18, 0], head: [-0.2, 0, 0],
      uaL: [-1.45, 0, -0.35], faL: [-1.55, 0, 0], uaR: [-1.35, 0, 0.3], faR: [-1.7, 0, 0],
      thL: [-0.5, 0, 0.12], shL: [0.7, 0, 0], thR: [0.3, 0, -0.12], shR: [0.8, 0, 0],
    });
  },

  hurt() {
    return pose({
      y: -0.06, spine: [-0.42, 0.25, 0.08], head: [-0.38, 0.2, 0],
      uaL: [-0.7, 0, 0.9], faL: [-0.6, 0, 0], uaR: [-0.4, 0, -1.0], faR: [-0.5, 0, 0],
      thL: [0.3, 0, 0.05], shL: [0.35, 0, 0], thR: [-0.45, 0, -0.05], shR: [0.7, 0, 0],
    });
  },

  dead() {
    return pose({ bodyX: -1.5, y: -0.83, spine: [-0.1, 0, 0], head: [0.2, 0.6, 0],
      uaL: [0.3, 0, 1.4], uaR: [0.1, 0, -1.2], thL: [0.1, 0, 0.15], thR: [-0.2, 0, -0.1], shR: [0.4, 0, 0] });
  },

  look(t) { // guard scanning around
    return pose({ y: -0.01, spine: [0.04, Math.sin(t * 1.3) * 0.45, 0], head: [-0.05, Math.sin(t * 1.3) * 0.4, 0],
      uaL: [0.15, 0, 0.14], faL: [-0.35, 0, 0], uaR: [-0.35, 0, -0.14], faR: [-0.95, 0, 0],
      thL: [-0.04, 0, 0.03], thR: [0.04, 0, -0.03] });
  },

  // forward roll: dive, tuck tight and tumble around the hips, unfold into a crouch
  roll(u) {
    const p = keys(u, [
      [0, pose({ y: -0.45, spine: [0.6, 0, 0], head: [0.3, 0, 0], uaL: [-1.3, 0, 0.3], faL: [-0.3, 0, 0], uaR: [-1.3, 0, -0.3], faR: [-0.3, 0, 0], thL: [-0.7, 0, 0.1], shL: [1.0, 0, 0], thR: [-0.4, 0, -0.1], shR: [1.2, 0, 0] })],
      [0.22, pose({ y: -0.4, spine: [0.95, 0, 0], head: [0.75, 0, 0], uaL: [-0.9, 0, -0.25], faL: [-2.1, 0, 0], uaR: [-0.9, 0, 0.25], faR: [-2.1, 0, 0], thL: [-2.2, 0, 0.08], shL: [2.45, 0, 0], thR: [-2.2, 0, -0.08], shR: [2.45, 0, 0] })],
      [0.75, pose({ y: -0.4, spine: [0.95, 0, 0], head: [0.75, 0, 0], uaL: [-0.9, 0, -0.25], faL: [-2.1, 0, 0], uaR: [-0.9, 0, 0.25], faR: [-2.1, 0, 0], thL: [-2.2, 0, 0.08], shL: [2.45, 0, 0], thR: [-2.2, 0, -0.08], shR: [2.45, 0, 0] })],
      [1, pose({ y: -0.32, spine: [0.5, 0, 0], head: [-0.3, 0, 0], uaL: [-0.5, 0, 0.55], faL: [-0.8, 0, 0], uaR: [-0.5, 0, -0.55], faR: [-0.8, 0, 0], thL: [-1.0, 0, 0.12], shL: [1.5, 0, 0], thR: [-0.6, 0, -0.12], shR: [1.7, 0, 0] })],
    ]);
    p.hips = [smooth((u - 0.08) / 0.84) * TAU, 0, 0];
    p.y += 0.04 * Math.sin(Math.PI * u);
    return p;
  },

  // crouched in cover: coiled low, one hand on the ground, peering
  hide() {
    return pose({
      y: -0.48, hips: [0.1, 0.1, 0], spine: [0.55, -0.1, 0], head: [-0.45, 0.15, 0],
      thL: [-1.25, 0, 0.18], shL: [2.0, 0, 0], thR: [-0.55, 0, -0.2], shR: [2.15, 0, 0],
      uaL: [-0.9, 0, 0.15], faL: [-0.25, 0, 0], uaR: [-0.5, 0, -0.25], faR: [-1.4, 0, 0],
    });
  },

  whistle(t) {
    return pose({ y: -0.04, spine: [0.04, 0.1, 0], head: [-0.18, 0.25, 0],
      uaR: [-0.45, 0, -0.5], faR: [-2.4, 0, 0], uaL: [0.08, 0, 0.12], faL: [-0.35, 0, 0], thL: [-0.08, 0, 0.04], thR: [0.05, 0, -0.04] });
  },

  // posture-broken guard: staggered, guard down
  broken(t) {
    const w = Math.sin(t * 7) * 0.08;
    return pose({ y: -0.12, spine: [0.45 + w, 0.2, 0], head: [0.4, 0, 0],
      uaL: [0.3, 0, 0.5], faL: [-0.2, 0, 0], uaR: [0.4, 0, -0.6], faR: [-0.2, 0, 0],
      thL: [-0.4, 0, 0.1], shL: [0.6, 0, 0], thR: [0.2, 0, -0.1], shR: [0.4, 0, 0] });
  },

  // perched at a viewpoint: gargoyle crouch, one knee up, scanning
  sync(t) {
    return pose({
      y: -0.46, hips: [0.1, 0, 0], spine: [0.42, 0, 0], head: [-0.3 + Math.sin(t) * 0.1, Math.sin(t * 0.5) * 0.3, 0],
      thL: [-1.4, 0, 0.3], shL: [2.15, 0, 0], thR: [-0.5, 0, -0.25], shR: [2.2, 0, 0],
      uaL: [-0.9, 0, 0.35], faL: [-0.5, 0, 0], uaR: [-0.6, 0, -0.35], faR: [-0.3, 0, 0],
    });
  },
};
