// Rig: a jointed white-box mannequin with procedural poses.
// No skinned assets yet — every state gets a readable pose from a few joint
// angles, blended toward each frame. Swap for a skinned glTF later; the game
// only talks to Rig through `pose` objects + `apply()`.
//
// Conventions (character faces local +z):
//   thigh/upper-arm x < 0 swings the limb forward; knee x > 0 bends back;
//   elbow x < 0 bends the forearm forward/up; spine/head x > 0 leans forward.
//   left limbs are on +x; arm z > 0 raises the LEFT arm sideways, z < 0 the right.
import * as THREE from './vendor/three.module.min.js';

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

function mesh(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export class Rig {
  constructor(opts = {}) {
    const {
      body = 0xe9e9e9, limb = 0xdddddd, accent = 0xc0392b, skin = 0xf4f4f4,
      hood = true, helmet = false, club = false, cape = false, scale = 1,
    } = opts;
    const mBody = new THREE.MeshStandardMaterial({ color: body, roughness: 0.75 });
    const mLimb = new THREE.MeshStandardMaterial({ color: limb, roughness: 0.75 });
    const mAcc = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6 });
    const mSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
    const mDark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const mSteel = new THREE.MeshStandardMaterial({ color: 0xcfd8e0, metalness: 0.8, roughness: 0.25 });
    this.mats = { mBody, mAcc };

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.scale.setScalar(scale);
    const j = {};
    const g = (name, parent, x, y, z) => { const n = new THREE.Group(); n.position.set(x, y, z); parent.add(n); j[name] = n; return n; };

    g('hips', this.body, 0, 0.95, 0);
    mesh(B(0.34, 0.18, 0.22), mLimb, 0, 0, 0, j.hips);
    mesh(B(0.36, 0.07, 0.24), mAcc, 0, 0.08, 0, j.hips); // sash / belt
    g('spine', j.hips, 0, 0.08, 0);
    mesh(B(0.42, 0.5, 0.25), mBody, 0, 0.28, 0, j.spine);
    if (cape) mesh(B(0.44, 0.75, 0.04), mAcc, 0, 0.18, -0.15, j.spine);
    g('head', j.spine, 0, 0.58, 0);
    mesh(B(0.22, 0.26, 0.24), mSkin, 0, 0.13, 0, j.head);
    mesh(B(0.17, 0.07, 0.02), mDark, 0, 0.14, 0.125, j.head); // eye band: shows facing
    if (hood) {
      mesh(B(0.28, 0.3, 0.27), mBody, 0, 0.15, -0.025, j.head);
      const peak = mesh(new THREE.ConeGeometry(0.1, 0.18, 4), mBody, 0, 0.3, 0.07, j.head);
      peak.rotation.x = 0.7;
      mesh(B(0.2, 0.12, 0.02), mDark, 0, 0.12, 0.115, j.head);
    }
    if (helmet) mesh(B(0.27, 0.12, 0.29), mDark, 0, 0.27, 0, j.head);

    for (const s of [1, -1]) {
      const L = s > 0 ? 'L' : 'R';
      g('ua' + L, j.spine, 0.27 * s, 0.5, 0);
      mesh(B(0.12, 0.31, 0.12), mBody, 0, -0.15, 0, j['ua' + L]);
      g('fa' + L, j['ua' + L], 0, -0.3, 0);
      mesh(B(0.1, 0.28, 0.1), mLimb, 0, -0.14, 0, j['fa' + L]);
      mesh(B(0.1, 0.1, 0.11), mSkin, 0, -0.32, 0, j['fa' + L]);
      g('th' + L, j.hips, 0.11 * s, -0.04, 0);
      mesh(B(0.16, 0.45, 0.16), mLimb, 0, -0.225, 0, j['th' + L]);
      g('sh' + L, j['th' + L], 0, -0.45, 0);
      mesh(B(0.13, 0.42, 0.13), mLimb, 0, -0.21, 0, j['sh' + L]);
      mesh(B(0.13, 0.08, 0.25), mDark, 0, -0.44, 0.05, j['sh' + L]);
    }
    // hidden blade (left forearm)
    this.blade = new THREE.Group();
    this.blade.position.set(0, -0.3, 0);
    j.faL.add(this.blade);
    mesh(B(0.025, 0.3, 0.05), mSteel, 0, -0.15, 0, this.blade);
    this.blade.scale.y = 0.01;
    // club (right hand)
    if (club) {
      this.club = new THREE.Group();
      this.club.position.set(0, -0.32, 0);
      j.faR.add(this.club);
      mesh(B(0.07, 0.07, 0.8), mDark, 0, 0, 0.3, this.club);
    }

    this.j = j;
    this.cur = neutral();
    this.applyNow(this.cur);
  }

  // Blend current pose toward `target` (rate ~ 1/seconds) and write joints.
  apply(target, dt, rate = 14) {
    const k = 1 - Math.exp(-rate * dt);
    const c = this.cur;
    for (const key of ['y', 'bodyX', 'bodyZ', 'spin', 'blade', 'weapon']) c[key] += ((target[key] ?? 0) - c[key]) * k;
    for (const name of JOINTS) {
      const a = c[name], b = target[name];
      a[0] += (b[0] - a[0]) * k; a[1] += (b[1] - a[1]) * k; a[2] += (b[2] - a[2]) * k;
    }
    this.write();
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
    this.body.position.y = Math.abs(Math.sin(c.bodyX)) * 0.13; // lying down: keep the boxes above the floor
    this.blade.scale.y = Math.max(0.01, c.blade);
  }

  flash(color, on) {
    this.mats.mBody.emissive.setHex(on ? color : 0x000000);
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

  sync(t) {
    return pose({
      y: -0.4, spine: [0.3, 0, 0], head: [-0.2 + Math.sin(t) * 0.1, 0, 0],
      thL: [-1.2, 0, 0.3], shL: [1.9, 0, 0], thR: [-0.4, 0, -0.2], shR: [2.0, 0, 0],
      uaL: [-0.3, 0, 1.3], faL: [-0.2, 0, 0], uaR: [-0.3, 0, -1.3], faR: [-0.2, 0, 0],
    });
  },
};
