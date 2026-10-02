// Rig: a jointed action-figure character with procedural poses.
// The body is built in models.js (rigid kitbashed parts per joint, merged per material into
// SkinnedMeshes that share one skeleton); the game only talks to Rig through `pose` objects
// + `apply()`, `flash()`, `blade`, `club`, `root`/`body`, so swapping the look never touches gameplay.
//
// Conventions (character faces local +z):
//   thigh/upper-arm x < 0 swings the limb forward; knee x > 0 bends back;
//   elbow x < 0 bends the forearm forward/up; spine/head x > 0 leans forward.
//   left limbs are on +x; arm z > 0 raises the LEFT arm sideways, z < 0 the right.
import * as THREE from './vendor/three.module.min.js';
import { BONES, getLook, bladeGeometry, batonGeometry } from './models.js';

const JOINTS = ['hips', 'spine', 'head', 'uaL', 'faL', 'uaR', 'faR', 'thL', 'shL', 'thR', 'shR'];

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
  for (const k in over) p[k] = over[k];
  return p;
}

let steelMat, batonMats;
const sharedSteel = () => (steelMat ||= new THREE.MeshStandardMaterial({ color: 0xd5dde4, metalness: 0.85, roughness: 0.22 }));
const sharedBaton = () => (batonMats ||= {
  rubber: new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.8 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x6d7276, metalness: 0.7, roughness: 0.35 }),
});

export class Rig {
  // opts: look ('player' | 'guard' | 'bodyguard' | 'sentry' | 'target'), club, scale, ghost (colour)
  constructor(opts = {}) {
    const { look = 'player', club = false, scale = 1 } = opts;
    const L = getLook(look);
    this.look = look;

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
    for (const key in L.geos) {
      let m = L.mats[key];
      if (L.look.flash?.includes(key) || key === L.look.lens) { m = m.clone(); if (key !== L.look.lens) this.flashMats.push(m); }
      mats[key] = m;
      const sm = new THREE.SkinnedMesh(L.geos[key], m);
      sm.castShadow = true;
      this.body.add(sm);
      sm.bind(skeleton);
    }
    this.lensMat = L.look.lens ? mats[L.look.lens] : null;
    this.lensBase = this.lensMat ? [this.lensMat.emissive.getHex(), this.lensMat.emissiveIntensity] : null;
    this.lift = L.look.lift ?? 0.13;
    this.tris = L.tris;

    // hidden blade (left forearm, under the wrist)
    this.blade = new THREE.Group();
    this.blade.position.set(-0.05, -0.27, 0);
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
      // last-known-position silhouette: one flat see-through material, no shadows
      const g = new THREE.MeshBasicMaterial({ color: opts.ghost, transparent: true, opacity: 0.28, depthWrite: false });
      this.root.traverse((o) => { if (o.isMesh) { o.material = g; o.castShadow = false; } });
      this.ghostMat = g;
    }

    // secondary motion: sash tails / cape swing from the rig's own velocity
    this.chains = [];
    for (const c of L.look.chains || []) {
      if (c === 'sash') this.chains.push({ bones: [j.sash1, j.sash2, j.sash3], parents: ['hips'], rest: 0.1, k: 0.2, max: 1.5, min: -0.25, lag: [9, 7, 5], flut: 0.14, ang: [0, 0, 0], side: [0, 0, 0] });
      if (c === 'cape') this.chains.push({ bones: [j.cape1, j.cape2], parents: ['hips', 'spine'], rest: 0.06, k: 0.14, max: 1.2, min: 0.0, lag: [6, 4], flut: 0.05, ang: [0, 0], side: [0, 0] });
    }
    this.lastPos = new THREE.Vector3(); this.hasLast = false; this.t = 0;

    this.j = j;
    this.cur = neutral();
    this.applyNow(this.cur);
  }

  // Blend current pose toward `target` (rate ~ 1/seconds) and write joints.
  apply(target, dt, rate = 14) {
    const k = 1 - Math.exp(-rate * dt);
    const c = this.cur;
    // full-turn moves (spin launcher, rolls) end a whole turn away from rest: wrap, don't unwind
    const TAU = Math.PI * 2;
    if (c.spin - (target.spin ?? 0) > Math.PI) c.spin -= TAU; else if ((target.spin ?? 0) - c.spin > Math.PI) c.spin += TAU;
    if (c.hips[0] - target.hips[0] > Math.PI) c.hips[0] -= TAU; else if (target.hips[0] - c.hips[0] > Math.PI) c.hips[0] += TAU;
    for (const key of ['y', 'bodyX', 'bodyZ', 'spin', 'blade', 'weapon']) c[key] += ((target[key] ?? 0) - c[key]) * k;
    for (const name of JOINTS) {
      const a = c[name], b = target[name];
      a[0] += (b[0] - a[0]) * k; a[1] += (b[1] - a[1]) * k; a[2] += (b[2] - a[2]) * k;
    }
    this.write();
    this.swing(dt);
  }

  // Sash/cape chains: hang toward world-down (undo the parents' pitch), stream back with speed, flutter.
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
      for (let i = 0; i < ch.bones.length; i++) {
        const stream = Math.max(0, fwd) * ch.k + Math.max(0, -vy) * 0.08 * (i + 1);
        const flutter = Math.sin(this.t * (9 + i * 3) + i * 1.7) * ch.flut * Math.min(1, sp / 3) * (i + 1);
        let tgt = (i === 0 ? ch.rest - pitch : 0.05) + stream * (i === 0 ? 1 : 0.35) + flutter;
        if (i === 0) tgt = Math.max(ch.min, Math.min(ch.max, tgt));
        const kk = 1 - Math.exp(-ch.lag[i] * dt);
        ch.ang[i] += (tgt - ch.ang[i]) * kk;
        ch.side[i] += ((i === 0 ? -side * 0.06 : 0) - ch.side[i]) * kk;
        ch.bones[i].rotation.set(ch.ang[i], 0, ch.side[i]);
      }
    }
  }

  applyNow(p) {
    for (const key of ['y', 'bodyX', 'bodyZ', 'spin', 'blade', 'weapon']) this.cur[key] = p[key] ?? 0;
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
// Pose generators. Each returns a fresh pose object for this frame.
// ---------------------------------------------------------------------------
export const Poses = {
  idle(t) {
    const b = Math.sin(t * 2) * 0.02;
    return pose({ spine: [0.04 + b, 0, 0], uaL: [0.05, 0, 0.1 + b], uaR: [0.05, 0, -0.1 - b] });
  },

  // phase: stride phase (radians); a: 0 walk .. 1 sprint
  run(phase, a, crouch = 0) {
    const s = Math.sin(phase), c = Math.cos(phase);
    const legAmp = 0.35 + 0.6 * a, armAmp = 0.25 + 0.75 * a;
    const kneeL = 0.1 + (0.35 + 1.2 * a) * Math.max(0, c);
    const kneeR = 0.1 + (0.35 + 1.2 * a) * Math.max(0, -c);
    const p = pose({
      y: -0.03 * a - 0.05 * a * Math.abs(s),
      spine: [0.06 + 0.3 * a, s * 0.18 * a, 0],
      head: [-0.15 * a, -s * 0.12 * a, 0],
      thL: [-s * legAmp, 0, 0], shL: [kneeL, 0, 0],
      thR: [s * legAmp, 0, 0], shR: [kneeR, 0, 0],
      uaL: [s * armAmp, 0, 0.12], faL: [-0.3 - 0.9 * a, 0, 0],
      uaR: [-s * armAmp, 0, -0.12], faR: [-0.3 - 0.9 * a, 0, 0],
    });
    if (crouch > 0) {
      const k = crouch;
      p.y += -0.36 * k;
      p.spine[0] += 0.4 * k;
      p.head[0] -= 0.3 * k;
      p.thL[0] = p.thL[0] * (1 - 0.4 * k) - 0.95 * k; p.shL[0] = p.shL[0] * (1 - 0.5 * k) + 1.35 * k;
      p.thR[0] = p.thR[0] * (1 - 0.4 * k) - 0.95 * k; p.shR[0] = p.shR[0] * (1 - 0.5 * k) + 1.35 * k;
      p.uaL[0] -= 0.4 * k; p.uaR[0] -= 0.4 * k;
    }
    return p;
  },

  air(vy) {
    const up = Math.max(-1, Math.min(1, vy / 8));
    return pose({
      spine: [0.15 - up * 0.1, 0, 0], head: [-0.1, 0, 0],
      thL: [-0.9 + up * 0.2, 0, 0], shL: [1.2 + up * 0.3, 0, 0],
      thR: [-0.1 - up * 0.3, 0, 0], shR: [0.4 + up * 0.4, 0, 0],
      uaL: [-0.6 - up * 0.6, 0, 0.7], faL: [-0.5, 0, 0],
      uaR: [-0.2 - up * 0.6, 0, -0.9], faR: [-0.4, 0, 0],
    });
  },

  climb(phase, hanging) {
    const s = Math.sin(phase);
    return pose({
      spine: [0.12, 0, 0], head: [-0.4, 0, 0],
      uaL: [-2.7 + s * 0.35, 0, 0.2], faL: [-0.3 - Math.max(0, s) * 0.8, 0, 0],
      uaR: [-2.7 - s * 0.35, 0, -0.2], faR: [-0.3 - Math.max(0, -s) * 0.8, 0, 0],
      thL: [hanging ? -0.2 : -0.6 - s * 0.45, 0, 0.1], shL: [hanging ? 0.3 : 1.1 + s * 0.3, 0, 0],
      thR: [hanging ? 0.1 : -0.6 + s * 0.45, 0, -0.1], shR: [hanging ? 0.2 : 1.1 - s * 0.3, 0, 0],
    });
  },

  wallrun(phase, side) {
    const p = Poses.run(phase, 1);
    p.bodyZ = 0.35 * side;
    // inner arm reaches toward the wall
    if (side > 0) { p.uaL = [-0.8, 0, 1.2]; } else { p.uaR = [-0.8, 0, -1.2]; }
    return p;
  },

  vault(t) {
    return pose({
      y: -0.1, spine: [0.5, 0, 0.2],
      uaL: [-0.9, 0, 0.3], faL: [-0.1, 0, 0], uaR: [-0.5, 0, -0.9], faR: [-0.3, 0, 0],
      thL: [-1.3, 0, 0.4], shL: [1.5, 0, 0], thR: [-1.1, 0, 0.5], shR: [1.6, 0, 0],
      bodyZ: -0.3 + t * 0.2,
    });
  },

  mantle(t) {
    const u = Math.min(1, t * 1.6);
    return pose({
      y: -0.2 * (1 - u), spine: [0.6 - 0.4 * u, 0, 0],
      uaL: [-2.4 + 2.2 * u, 0, 0.3], faL: [-0.6 + 0.4 * u, 0, 0],
      uaR: [-2.4 + 2.2 * u, 0, -0.3], faR: [-0.6 + 0.4 * u, 0, 0],
      thL: [-1.4 * (1 - u) - 0.4, 0, 0], shL: [1.6 * (1 - u) + 0.2, 0, 0],
      thR: [-0.4 * (1 - u), 0, 0], shR: [0.6, 0, 0],
    });
  },

  slide() {
    return pose({
      y: -0.55, bodyX: -0.35, spine: [0.2, 0, 0], head: [0.3, 0, 0],
      thL: [-1.3, 0, 0], shL: [0.15, 0, 0], thR: [-0.7, 0, 0], shR: [1.6, 0, 0],
      uaL: [0.4, 0, 0.6], uaR: [0.6, 0, -0.9],
    });
  },

  land(k) {
    return pose({
      y: -0.35 * k, spine: [0.55 * k, 0, 0],
      thL: [-1.0 * k, 0, 0.1], shL: [1.5 * k, 0, 0], thR: [-0.9 * k, 0, -0.1], shR: [1.4 * k, 0, 0],
      uaL: [-0.4 * k, 0, 0.5], uaR: [-0.4 * k, 0, -0.5],
    });
  },

  hide() {
    return pose({
      y: -0.42, spine: [0.5, 0, 0], head: [-0.3, 0, 0],
      thL: [-1.1, 0, 0.1], shL: [1.6, 0, 0], thR: [-1.0, 0, -0.1], shR: [1.6, 0, 0],
      uaL: [-0.7, 0, 0.2], faL: [-1.2, 0, 0], uaR: [-0.7, 0, -0.2], faR: [-1.2, 0, 0],
    });
  },

  stance() { // combat ready
    return pose({
      y: -0.08, spine: [0.15, 0.25, 0],
      thL: [-0.35, 0, 0.08], shL: [0.4, 0, 0], thR: [0.25, 0, -0.08], shR: [0.35, 0, 0],
      uaL: [-0.7, 0, 0.2], faL: [-1.6, 0, 0], uaR: [-0.4, 0, -0.2], faR: [-1.9, 0, 0],
    });
  },

  // attack keyframes: windup -> strike, u = 0..1 through the move
  attack(kind, u) {
    const W = Math.min(1, u / 0.35), S = u < 0.35 ? 0 : Math.min(1, (u - 0.35) / 0.2);
    const mix = (a, b) => a.map((v, i) => v + (b[i] - v) * S);
    const base = Poses.stance();
    switch (kind) {
      case 'L1': return { ...base, spine: mix([0.15, 0.5 * W, 0], [0.25, -0.45, 0]),
        uaR: mix([-0.3, 0, -0.3], [-1.55, 0, -0.1]), faR: mix([-2.0, 0, 0], [-0.1, 0, 0]),
        thL: [-0.5, 0, 0.08], shL: [0.4, 0, 0] };
      case 'L2': return { ...base, spine: mix([0.15, -0.5 * W, 0], [0.25, 0.55, 0]),
        uaL: mix([-0.6, 0, 1.0], [-1.45, 0, -0.25]), faL: mix([-1.8, 0, 0], [-0.4, 0, 0]),
        thR: [-0.45, 0, -0.08], thL: [0.2, 0, 0.08] };
      case 'L3': return { ...base, spine: mix([0.1, 0, 0], [-0.35, 0, 0]),
        thR: mix([-0.7, 0, 0], [-1.6, 0, 0]), shR: mix([1.7, 0, 0], [0.05, 0, 0]),
        thL: [0.1, 0, 0], shL: [0.25, 0, 0], uaL: [-0.3, 0, 1.1], uaR: [0.2, 0, -1.1] };
      case 'H': return { ...base, y: -0.15 * S, spine: mix([-0.35, 0, 0], [0.65, 0, 0]),
        uaL: mix([-2.9, 0, 0.2], [-0.8, 0, 0.1]), faL: mix([-0.6, 0, 0], [-0.2, 0, 0]),
        uaR: mix([-2.9, 0, -0.2], [-0.8, 0, -0.1]), faR: mix([-0.6, 0, 0], [-0.2, 0, 0]),
        thL: [-0.7, 0, 0], shL: [0.9, 0, 0], thR: [0.4, 0, 0], shR: [0.6, 0, 0] };
      case 'LAUNCH': return { ...base, spin: S * Math.PI * 2,
        uaL: [-0.1, 0, 1.5], uaR: [-0.1, 0, -1.5], faL: [0, 0, 0], faR: [0, 0, 0],
        thR: mix([-0.3, 0, 0], [-1.2, 0, -0.6]), shR: [0.1, 0, 0] };
      case 'ASSASSIN': return { ...base, blade: W, spine: mix([0.2, -0.4, 0], [0.45, 0.3, 0]),
        uaL: mix([-0.4, 0, 0.6], [-1.7, 0, -0.1]), faL: mix([-1.8, 0, 0], [-0.05, 0, 0]),
        uaR: [-1.2, 0, -0.6], faR: [-1.2, 0, 0], thL: [-0.8, 0, 0], shL: [0.9, 0, 0], thR: [0.5, 0, 0], shR: [0.7, 0, 0] };
      case 'AIR': return { ...base, blade: 1, y: -0.2 * S,
        uaL: mix([-2.8, 0, 0.3], [-1.2, 0, 0]), faL: [-0.1, 0, 0], uaR: mix([-2.8, 0, -0.3], [-1.0, 0, -0.5]),
        spine: mix([-0.2, 0, 0], [0.7, 0, 0]), thL: [-1.2, 0, 0], shL: [1.4, 0, 0], thR: [-0.4, 0, 0], shR: [1.2, 0, 0] };
      case 'COUNTER': return { ...base, blade: 1, spine: mix([0.1, 0.6, 0], [0.4, -0.5, 0]),
        uaL: mix([-1.4, 0, 0.6], [-1.6, 0, -0.3]), faL: mix([-1.5, 0, 0], [0, 0, 0]),
        uaR: mix([-1.6, 0, -0.5], [-0.6, 0, -0.8]), faR: [-1.0, 0, 0] };
      case 'EXECUTE': return { ...base, blade: 1, y: -0.1 * S, spine: mix([-0.1, 0.5, 0], [0.55, -0.2, 0]),
        uaL: mix([-2.6, 0, 0.4], [-1.0, 0, -0.2]), faL: mix([-1.0, 0, 0], [-0.1, 0, 0]),
        uaR: mix([-1.8, 0, -0.5], [-0.5, 0, -0.9]), faR: [-0.8, 0, 0], thL: [-0.9, 0, 0], shL: [1.0, 0, 0], thR: [0.5, 0, 0], shR: [0.8, 0, 0] };
      // enemy moves
      case 'CLUB': return { ...base, spine: mix([-0.2, 0.4, 0], [0.45, -0.3, 0]),
        uaR: mix([-2.9, 0, -0.4], [-0.6, 0, 0.1]), faR: mix([-1.2, 0, 0], [-0.2, 0, 0]) };
      case 'THROW': return { ...base, spine: mix([-0.2, 0.6, 0], [0.3, -0.4, 0]),
        uaR: mix([-2.6, 0, -0.6], [-1.3, 0, 0]), faR: mix([-1.4, 0, 0], [0, 0, 0]) };
    }
    return base;
  },

  block() {
    return pose({
      y: -0.06, spine: [0.1, 0, 0],
      uaL: [-1.5, 0, -0.4], faL: [-1.4, 0, 0], uaR: [-1.5, 0, 0.4], faR: [-1.4, 0, 0],
      thL: [-0.3, 0, 0], shL: [0.4, 0, 0], thR: [0.3, 0, 0], shR: [0.3, 0, 0],
    });
  },

  hurt() {
    return pose({
      spine: [-0.45, 0.2, 0], head: [-0.35, 0, 0],
      uaL: [-0.6, 0, 0.9], uaR: [-0.4, 0, -1.0], thL: [0.3, 0, 0], shL: [0.3, 0, 0], thR: [-0.4, 0, 0], shR: [0.6, 0, 0],
    });
  },

  dead() {
    return pose({ bodyX: -1.5, y: -0.83, spine: [-0.1, 0, 0], head: [0.2, 0.6, 0],
      uaL: [0.3, 0, 1.4], uaR: [0.1, 0, -1.2], thL: [0.1, 0, 0.15], thR: [-0.2, 0, -0.1], shR: [0.4, 0, 0] });
  },

  look(t) { // guard scanning around
    return pose({ spine: [0.04, Math.sin(t * 1.3) * 0.5, 0], head: [-0.05, Math.sin(t * 1.3) * 0.4, 0],
      uaL: [0.2, 0, 0.15], faL: [-0.4, 0, 0], uaR: [0.2, 0, -0.15], faR: [-0.4, 0, 0] });
  },

  // forward roll: the whole body tumbles around the hips
  roll(u) {
    const p = pose({
      y: -0.5 + 0.15 * Math.sin(u * Math.PI), spine: [0.9, 0, 0], head: [0.6, 0, 0],
      thL: [-1.9, 0, 0.1], shL: [2.2, 0, 0], thR: [-1.9, 0, -0.1], shR: [2.2, 0, 0],
      uaL: [-1.2, 0, 0.3], faL: [-1.6, 0, 0], uaR: [-1.2, 0, -0.3], faR: [-1.6, 0, 0],
    });
    p.hips = [u * Math.PI * 2, 0, 0];
    return p;
  },

  whistle(t) {
    return pose({ spine: [0.02, 0, 0], head: [-0.15, 0.2, 0],
      uaR: [-0.4, 0, -0.5], faR: [-2.4, 0, 0], uaL: [0.05, 0, 0.12] });
  },

  // posture-broken guard: staggered, guard down
  broken(t) {
    const w = Math.sin(t * 7) * 0.08;
    return pose({ y: -0.12, spine: [0.45 + w, 0.2, 0], head: [0.4, 0, 0],
      uaL: [0.3, 0, 0.5], faL: [-0.2, 0, 0], uaR: [0.4, 0, -0.6], faR: [-0.2, 0, 0],
      thL: [-0.4, 0, 0.1], shL: [0.6, 0, 0], thR: [0.2, 0, -0.1], shR: [0.4, 0, 0] });
  },

  sync(t) {
    return pose({
      y: -0.4, spine: [0.3, 0, 0], head: [-0.2 + Math.sin(t) * 0.1, 0, 0],
      thL: [-1.2, 0, 0.3], shL: [1.9, 0, 0], thR: [-0.4, 0, -0.2], shR: [2.0, 0, 0],
      uaL: [-0.3, 0, 1.3], faL: [-0.2, 0, 0], uaR: [-0.3, 0, -1.3], faR: [-0.2, 0, 0],
    });
  },
};
