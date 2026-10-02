// Character looks for INTERMACHINAS: "Avatar: The Last Airbender meets Cold War cyberpunk".
//
// Each character is one continuous, smooth-skinned body (lofted cross-sections weighted across
// the Rig's joints, so shoulders/elbows/hips/knees bend instead of interpenetrating) dressed in
// kit: cloth/enamel shells, wraps, straps, boxes and a decimated CC0 Soviet gas mask for the
// guards. Everything is merged per material into a few SkinnedMeshes on one skeleton, so the
// procedural poses in rig.js drive it directly; same-type guards share all geometry.
// Secondary-motion chains (sash tails, hood tail, back skirt, cape) are extra bones the Rig
// swings from velocity.
//
// Assets: see ../assets/CREDITS.md. Geometry here is procedural apart from GASMASK.
import * as THREE from './vendor/three.module.min.js';
import { GASMASK } from '../assets/characters/gasmask.js';

const TAU = Math.PI * 2;
const ASSET = new URL('../assets/characters/', import.meta.url).href;

// ------------------------------------------------------------------ skeleton
// [name, parent, rest offset]. The first 11 are the Rig's posed joints (positions unchanged
// from the white-box mannequin, so collision/proportions stay put).
export const BONES = [
  ['hips', null, 0, 0.95, 0], ['spine', 'hips', 0, 0.08, 0], ['head', 'spine', 0, 0.58, 0],
  ['uaL', 'spine', 0.27, 0.5, 0], ['faL', 'uaL', 0, -0.3, 0], ['uaR', 'spine', -0.27, 0.5, 0], ['faR', 'uaR', 0, -0.3, 0],
  ['thL', 'hips', 0.11, -0.04, 0], ['shL', 'thL', 0, -0.45, 0], ['thR', 'hips', -0.11, -0.04, 0], ['shR', 'thR', 0, -0.45, 0],
  // secondary motion (not posed)
  ['sash1', 'hips', 0.09, 0.02, -0.15], ['sash2', 'sash1', 0, -0.16, 0], ['sash3', 'sash2', 0, -0.16, 0],
  ['cape1', 'spine', 0, 0.52, -0.16], ['cape2', 'cape1', 0, -0.4, 0],
  ['tail1', 'spine', 0, 0.77, -0.15], ['tail2', 'tail1', 0, -0.24, 0],
  ['skirt1', 'hips', 0, 0.01, -0.16], ['skirt2', 'skirt1', 0, -0.17, 0],
];
const BI = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
const REST = {};
for (const [n, p, x, y, z] of BONES) { const o = p ? REST[p] : [0, 0, 0]; REST[n] = [o[0] + x, o[1] + y, o[2] + z]; }

// ------------------------------------------------------------------ textures (shared, loaded once)
const texCache = {};
function tex(name, srgb) {
  if (texCache[name]) return texCache[name];
  const t = new THREE.TextureLoader().load(ASSET + name);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return (texCache[name] = t);
}
const SURF = {
  cloth: () => ({ map: tex('cloth_d.jpg', true), normalMap: tex('cloth_n.jpg'), roughness: 0.95, normalScale: new THREE.Vector2(0.8, 0.8) }),
  leather: () => ({ map: tex('leather_d.jpg', true), normalMap: tex('leather_n.jpg'), roughness: 0.62, normalScale: new THREE.Vector2(0.7, 0.7) }),
  enamel: () => ({ map: tex('enamel_d.jpg', true), normalMap: tex('enamel_n.jpg'), roughness: 0.42, metalness: 0.15, normalScale: new THREE.Vector2(0.6, 0.6) }),
  rubber: () => ({ map: tex('gasmask_d.jpg', true), normalMap: tex('gasmask_n.jpg'), roughness: 0.7 }),
  metal: () => ({ roughness: 0.45, metalness: 0.65 }),
  skin: () => ({ roughness: 0.75 }),
  lens: () => ({ roughness: 0.15, metalness: 0.3 }),
};

// stencilled unit numbers (canvas, no file)
const stencilCache = {};
function stencil(text) {
  if (stencilCache[text]) return stencilCache[text];
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.font = 'bold 50px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  g.globalCompositeOperation = 'destination-out'; // stencil bridges + wear
  g.fillRect(0, 30, 256, 3);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // own PRNG: don't disturb seeded game dice
  for (let i = 0; i < 60; i++) { g.globalAlpha = rnd() * 0.8; g.fillRect(rnd() * 256, rnd() * 64, 2 + rnd() * 6, 1 + rnd() * 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (stencilCache[text] = t);
}

// ------------------------------------------------------------------ geometry helpers
// Loft: stacked elliptical rings. ring = { y, rx, rz?, x?, z?, open?, dy? } (open = half-angle of a
// gap centred on the front, for hoods; dy(angle) bends a hem). Angle 0 = front (+z), increasing toward +x.
function loft(rings, o = {}) {
  const segs = o.segs ?? 12, ts = o.ts ?? 0.3;
  const t0 = o.t0 ?? 0, t1 = o.t1 ?? TAU;
  const closed = !rings.some((r) => r.open) && Math.abs(t1 - t0 - TAU) < 1e-6;
  const pos = [], uv = [], idx = [];
  let rm = 0; for (const r of rings) rm += (r.rx + (r.rz ?? r.rx)) / 2; rm /= rings.length;
  const uMax = Math.max(1, Math.round(((t1 - t0) * rm) / ts * 2) / 2);
  let v = 0;
  rings.forEach((r, i) => {
    if (i) { const p = rings[i - 1]; v += Math.hypot(r.y - p.y, r.rx - p.rx, (r.z ?? 0) - (p.z ?? 0)) / ts; }
    const a0 = r.open ? r.open : t0, a1 = r.open ? TAU - r.open : t1;
    for (let j = 0; j <= segs; j++) {
      const a = a0 + ((a1 - a0) * j) / segs;
      pos.push((r.x ?? 0) + Math.sin(a) * r.rx, r.y + (r.dy ? r.dy(a) : 0), (r.z ?? 0) + Math.cos(a) * (r.rz ?? r.rx));
      uv.push((j / segs) * uMax, v);
    }
  });
  const W = segs + 1;
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const cap = (ri) => {
    const r = rings[ri], ci = pos.length / 3;
    pos.push(r.x ?? 0, r.y, r.z ?? 0); uv.push(0.5, 0.5);
    for (let j = 0; j < segs; j++) idx.push(ci, ri * W + j, ri * W + j + 1);
  };
  if (o.capBot) cap(0);
  if (o.capTop) cap(rings.length - 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (closed) { // weld the seam normals
    const n = g.attributes.normal;
    for (let i = 0; i < rings.length; i++) {
      const a = i * W, b = a + segs, s = new THREE.Vector3(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
      n.setXYZ(a, s.x, s.y, s.z); n.setXYZ(b, s.x, s.y, s.z);
    }
  }
  return g;
}
const R = (y, rx, rz = rx, z = 0, x = 0, open) => ({ y, rx, rz, z, x, open });

// tapered, round-ended limb hanging from y=0 to y=-len
function limb(len, r0, r1, o = {}) {
  const zs = o.zs ?? 1, b = o.bulge ?? 0, zb = o.zb ?? 0, top = o.top ?? r0 * 0.7, bot = o.bot ?? r1 * 0.6;
  const rs = [
    [-len - bot, r1 * 0.3, 0], [-len - bot * 0.6, r1 * 0.8, 0], [-len, r1, 0],
    [-len * 0.6, (r0 + r1) * 0.5 * (1 + b), zb], [-len * 0.25, r0 * (1 + b * 0.6), zb * 0.6], [0, r0, 0],
    [top * 0.6, r0 * 0.8, 0], [top, r0 * 0.3, 0],
  ];
  return loft(rs.map(([y, r, z]) => R(y, r, r * zs, z)), { segs: o.segs ?? 8, capTop: true, capBot: true, ts: o.ts });
}
// a short band (wrap, belt, bracer) around a limb
const band = (y0, y1, r0, r1 = r0, zs = 1, segs = 10, bulge = 0.08) =>
  loft([R(y0, r0, r0 * zs), R((y0 + y1) / 2, ((r0 + r1) / 2) * (1 + bulge), ((r0 + r1) / 2) * (1 + bulge) * zs), R(y1, r1, r1 * zs)], { segs });
// cloth wrapping (forearms, shins): a ribbed sleeve whose ridges wander, flush with the limb
function wrapped(y0, y1, r0, r1, n, zs = 1) {
  const rs = [];
  for (let i = 0; i <= n * 2; i++) {
    const t = i / (n * 2), r = (r0 + (r1 - r0) * t) * (i % 2 ? 1.07 : 1.0);
    rs.push(R(y0 + (y1 - y0) * t + (i % 4 === 1 ? 0.008 : i % 4 === 3 ? -0.008 : 0), r, r * zs, 0, (i % 4 === 1 ? 0.004 : 0)));
  }
  return loft(rs, { segs: 10, ts: 0.15 });
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, s = 10) => new THREE.CylinderGeometry(r0, r1, h, s, 1);
// ribbed hose / cable along a curve
function hose(points, r, ribs = 10, segs = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const n = ribs * 2;
  const g = new THREE.TubeGeometry(curve, n, r, segs, false);
  const p = g.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    curve.getPointAt(i / n, c);
    const k = i % 2 ? 1.25 : 0.85;
    for (let j = 0; j <= segs; j++) {
      const vi = i * (segs + 1) + j;
      p.setXYZ(vi, c.x + (p.getX(vi) - c.x) * k, c.y + (p.getY(vi) - c.y) * k, c.z + (p.getZ(vi) - c.z) * k);
    }
  }
  g.computeVertexNormals();
  return g;
}
function fromBaked(part) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(part.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(part.nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(part.uv, 2));
  g.setIndex(new THREE.BufferAttribute(part.idx, 1));
  return g;
}
let maskGeo, filterGeo;
const gasmask = () => (maskGeo ||= fromBaked(GASMASK.mask));
const gasfilter = () => (filterGeo ||= fromBaked(GASMASK.filter).translate(0, 0.79, -0.147)); // top-centre at origin

// ------------------------------------------------------------------ kit: collects parts per material
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export const sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
class Kit {
  constructor() { this.parts = {}; }
  // Rigid/blended part in joint-local space (joint at origin, rest orientation).
  // blend = [otherBone, w(x, y, z)]: share each vertex with a second bone by weight w (local coords).
  add(bone, geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = 1, blend = null) {
    const g = geo.clone();
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    const rest = REST[bone];
    _m.compose(_v.set(rest[0] + p[0], rest[1] + p[1], rest[2] + p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2], r[3] || 'XYZ')),
      typeof s === 'number' ? _s.setScalar(s) : _s.set(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    if (_m.determinant() < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } }
    const n = g.attributes.position.count, P = g.attributes.position;
    const bones = new Array(n);
    for (let i = 0; i < n; i++) {
      const w = blend ? Math.max(0, Math.min(1, blend[1](P.getX(i) - rest[0], P.getY(i) - rest[1], P.getZ(i) - rest[2]))) : 0;
      bones[i] = w > 0.001 ? [[BI[bone], 1 - w], [BI[blend[0]], w]] : BI[bone];
    }
    this.push(mat, g, bones);
    return this;
  }
  // Smooth-skinned part, geometry already in body space; wfn(x, y, z) -> { boneName: weight, ... }
  skin(geo, mat, wfn) {
    const g = geo.index ? geo : (geo.setIndex([...Array(geo.attributes.position.count).keys()]), geo);
    const P = g.attributes.position, n = P.count, bones = new Array(n);
    for (let i = 0; i < n; i++) {
      const w = wfn(P.getX(i), P.getY(i), P.getZ(i));
      const list = Object.entries(w).filter(([, v]) => v > 0.002).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const tot = list.reduce((t, [, v]) => t + v, 0) || 1;
      bones[i] = list.length === 1 ? BI[list[0][0]] : list.map(([b, v]) => [BI[b], v / tot]);
    }
    this.push(mat, g, bones);
    return this;
  }
  sym(fn) { fn(1, 'L'); fn(-1, 'R'); return this; }
  push(mat, g, bones) { (this.parts[mat] ||= []).push({ g, bones }); }
  // a cloth strip hanging down a bone chain from the first bone's rest point (body space),
  // rows bound to the bone whose segment they start, so the strip stays continuous when it bends
  strip(chain, mat, { len, w0, w1 = w0, segLen, rows = 9, curve = 0, x = 0, z = 0, tilt = 0, twist = 0 }) {
    const o = REST[chain[0]], pos = [], uv = [], idx = [], bones = [];
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1), d = t * len, w = w0 + (w1 - w0) * t;
      const f = d / segLen, k = Math.min(chain.length - 1, Math.floor(f + 1e-4)), fr = f - k;
      // soft hand-over between consecutive chain bones
      const b = k < chain.length - 1 && fr > 0.7 ? [[BI[chain[k]], 1 - (fr - 0.7) / 0.6], [BI[chain[k + 1]], (fr - 0.7) / 0.6]] : BI[chain[k]];
      for (const sx of [-1, 0, 1]) {
        const xx = sx * w / 2, ta = twist * t;
        pos.push(o[0] + x + xx * Math.cos(ta) + tilt * d, o[1] - d, o[2] + z - xx * Math.sin(ta) - curve * (1 - (2 * xx / w0) ** 2) * 0.5);
        uv.push((sx + 1) / 2 * w0 / 0.3, d / 0.3);
        bones.push(b);
      }
      if (i) { const a = (i - 1) * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    this.push(mat, g, bones);
    return this;
  }
  build() {
    const out = {}; let tris = 0;
    for (const [mat, list] of Object.entries(this.parts)) {
      let nv = 0, ni = 0;
      for (const { g } of list) { nv += g.attributes.position.count; ni += g.index.count; }
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2);
      const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4), I = new Uint32Array(ni);
      let vo = 0, io = 0;
      for (const { g, bones } of list) {
        const n = g.attributes.position.count;
        if (!g.attributes.normal) g.computeVertexNormals();
        P.set(g.attributes.position.array, vo * 3);
        N.set(g.attributes.normal.array, vo * 3);
        if (g.attributes.uv) U.set(g.attributes.uv.array, vo * 2);
        for (let i = 0; i < n; i++) {
          const b = bones[i], o = (vo + i) * 4;
          if (typeof b === 'number') { SI[o] = b; SW[o] = 1; } else b.forEach(([bi, w], j) => { SI[o + j] = bi; SW[o + j] = w; });
        }
        const ix = g.index.array;
        for (let i = 0; i < ix.length; i++) I[io + i] = ix[i] + vo;
        vo += n; io += ix.length;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      g.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
      g.setIndex(new THREE.BufferAttribute(nv > 65535 ? I : new Uint16Array(I), 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.8);
      out[mat] = g; tris += ni / 3;
    }
    return { geos: out, tris };
  }
}

// ------------------------------------------------------------------ the body
// One continuous skinned body (torso + neck, legs, arms) lofted from cross-sections in body
// space and smooth-weighted across hips / waist / shoulders / elbows / knees / neck, so joints
// bend instead of interpenetrating. S = shape (rings), M = material per region.
// ring tuple: [y, rx, rz, z, x]  (x/z offsets from the limb's axis; x is mirrored per side)
const ringsAt = (list, cx = 0, s = 1) => list.map(([y, rx, rz, z = 0, x = 0]) => R(y, rx, rz, z, cx + x * s));
function pieces(k, rings, splits, wfn, o) {
  // splits: [[fromRing, toRing, mat], ...] sharing boundary rings, so material changes don't open seams
  splits.forEach(([a, b, mat], i) => k.skin(loft(rings.slice(a, b + 1), { ...o, capBot: o.capBot && i === 0, capTop: o.capTop && i === splits.length - 1 }), mat, wfn));
}
function buildBody(k, S, M) {
  // torso: hips -> spine across the waist, spine -> head up the neck, shoulders share with the arms,
  // the bottom of the pelvis shares with the thighs
  pieces(k, ringsAt(S.torso), M.torso, (x, y) => {
    const ax = Math.abs(x), side = x > 0 ? 'L' : 'R';
    const head = sm(1.6, 1.69, y), hips = 1 - sm(0.99, 1.16, y);
    const ua = sm(0.12, 0.22, ax) * sm(1.36, 1.5, y) * 0.5;
    const th = sm(0.03, 0.12, ax) * (1 - sm(0.8, 0.93, y)) * 0.55;
    return { hips: hips - th * hips, ['th' + side]: th * hips, spine: Math.max(0, 1 - hips - head - ua), head, ['ua' + side]: ua };
  }, { segs: S.segs || 16, capBot: true });
  k.sym((s, L) => {
    // legs: hips -> thigh at the hip, thigh -> shin across the knee
    pieces(k, ringsAt(S.leg, 0.11 * s, s), M.leg, (x, y) => {
      const shin = 1 - sm(0.4, 0.52, y), up = 1 - shin, hips = up * sm(0.86, 1.0, y) * 0.9;
      return { hips, ['th' + L]: up - hips, ['sh' + L]: shin };
    }, { segs: 12, capBot: true });
    // arms: spine -> upper arm at the shoulder, upper arm -> forearm across the elbow
    pieces(k, ringsAt(S.arm, 0.27 * s, s), M.arm, (x, y) => {
      const fa = 1 - sm(1.18, 1.29, y), up = 1 - fa, spine = up * sm(1.5, 1.61, y) * 0.6;
      return { spine, ['ua' + L]: up - spine, ['fa' + L]: fa };
    }, { segs: 12, capTop: true, capBot: true });
  });
}

// ------------------------------------------------------------------ shared kit parts
function boot(k, side, mat, { h = 0.3, toe = 0.13, rx = 0.058, cuff = 0, wide = 1 } = {}) {
  // foot + shaft in shin space; sole at y = -0.46 (the floor at rest)
  const b = 'sh' + side;
  k.add(b, loft([R(-0.46, rx * 0.95 * wide, toe, 0.045), R(-0.43, rx * 1.05 * wide, toe * 1.02, 0.045), R(-0.39, rx * wide, toe * 0.78, 0.035), R(-0.34, rx * 0.9, rx * 1.1, 0.0), R(-0.31, rx * 0.85, rx * 0.95, -0.004)], { segs: 12, capBot: true }), mat);
  if (h > 0.12) k.add(b, loft([R(-0.36, rx * 1.12, rx * 1.2), R(-0.42 + h * 0.5, rx * 1.18, rx * 1.26, -0.008), R(-0.46 + h, rx * 1.25 + cuff, rx * 1.32 + cuff, -0.01)], { segs: 10 }), mat);
}
function fist(k, side, mat, s = 1) {
  // a readable, slightly oversized gloved hand: palm block + thumb
  const b = 'fa' + side, sg = side === 'L' ? 1 : -1;
  // modelled about the wrist (fa-local y -0.27) so the scale grows the hand, not the gap to it
  k.add(b, loft([R(-0.135, 0.022, 0.016), R(-0.12, 0.042, 0.03), R(-0.075, 0.047, 0.034, 0.004), R(-0.03, 0.04, 0.032), R(0.005, 0.034, 0.03)], { segs: 8, capBot: true }), mat, [0, -0.27, 0], [0, 0, 0], s);
  k.add(b, limb(0.05, 0.014, 0.012, { segs: 6 }), mat, [-0.03 * sg * s, -0.27 - 0.04 * s, 0.022 * s], [0.5, 0, 0.5 * sg]);
}

// ------------------------------------------------------------------ the player: lithe, catlike
const PLAYER_SHAPE = {
  torso: [
    [0.8, 0.045, 0.045], [0.84, 0.1, 0.085, -0.005], [0.9, 0.148, 0.102, -0.01], [0.97, 0.158, 0.108, -0.01], [1.04, 0.146, 0.1, -0.002],
    [1.11, 0.13, 0.094, 0.006], [1.19, 0.142, 0.1, 0.012], [1.28, 0.166, 0.112, 0.016], [1.37, 0.185, 0.116, 0.014], [1.44, 0.205, 0.108, 0.004],
    [1.5, 0.19, 0.094, -0.006], [1.545, 0.13, 0.078, -0.01], [1.58, 0.064, 0.058, -0.006], [1.63, 0.05, 0.052, 0.002], [1.69, 0.046, 0.048, 0.006],
  ],
  leg: [
    [1.02, 0.07, 0.075, 0, -0.012], [0.95, 0.088, 0.098, 0.006, 0], [0.85, 0.084, 0.093, 0.012, 0], [0.73, 0.072, 0.081, 0.01, -0.004], [0.61, 0.06, 0.068, 0.006, -0.008],
    [0.51, 0.052, 0.058, 0.006, -0.01], [0.455, 0.05, 0.057, 0.01, -0.01], [0.4, 0.049, 0.058, -0.006, -0.01], [0.33, 0.053, 0.066, -0.016, -0.008],
    [0.24, 0.044, 0.052, -0.01, -0.006], [0.15, 0.035, 0.041, -0.004, -0.004], [0.075, 0.031, 0.036, 0, -0.004],
  ],
  arm: [
    [1.56, 0.016, 0.016, 0, -0.06], [1.55, 0.04, 0.044, 0, -0.045], [1.53, 0.056, 0.06, 0, -0.022], [1.49, 0.06, 0.064, 0, -0.004], [1.44, 0.05, 0.055],
    [1.37, 0.046, 0.05, 0.004], [1.29, 0.04, 0.043], [1.235, 0.036, 0.04, -0.004], [1.18, 0.044, 0.048, -0.006], [1.1, 0.038, 0.042, -0.003],
    [1.0, 0.03, 0.033], [0.955, 0.028, 0.031],
  ],
  segs: 16,
};
function buildPlayer(k) {
  buildBody(k, PLAYER_SHAPE, {
    torso: [[0, 4, 'trousers'], [4, 14, 'tunic']],
    leg: [[0, 11, 'trousers']],
    arm: [[0, 7, 'tunic'], [7, 11, 'wrap']],
  });
  k.sym((s, L) => {
    // shin + forearm wraps (ribbed overlays that ride a single bone, so they never seam)
    k.add('sh' + L, wrapped(-0.37, -0.07, 0.042, 0.066, 6, 1.24), 'wrap', [0, 0, -0.012]);
    k.add('fa' + L, wrapped(-0.275, -0.06, 0.035, 0.05, 5, 1.08), 'wrap');
    boot(k, L, 'leather', { h: 0.13, rx: 0.044, toe: 0.15, wide: 1.05 });
    fist(k, L, 'leather', 1.12);
  });
  // split tunic skirt: four panels that hang from the hips. front follows both thighs,
  // sides follow their thigh, back rides the skirt chain (swings with speed)
  const skirt = [R(0.99, 0.172, 0.122, -0.006), R(0.9, 0.205, 0.142, -0.004), R(0.78, 0.222, 0.158, -0.002), R(0.64, 0.236, 0.172)];
  const dd = (y) => 1 - sm(0.64, 0.97, y); // 0 at the waist, 1 at the hem
  k.skin(loft(skirt, { segs: 6, t0: -0.62, t1: 0.62 }), 'tunic', (x, y) => { const d = dd(y); return { hips: 1 - 0.75 * d, thL: 0.375 * d, thR: 0.375 * d }; });
  k.sym((s, L) => k.skin(loft(skirt, { segs: 6, t0: s > 0 ? 0.72 : -2.5, t1: s > 0 ? 2.5 : -0.72 }), 'tunic', (x, y) => { const d = dd(y); return { hips: 1 - 0.7 * d, ['th' + L]: 0.7 * d }; }));
  k.skin(loft(skirt, { segs: 6, t0: Math.PI - 0.6, t1: Math.PI + 0.6 }), 'tunic', (x, y) => { const d = dd(y); return { hips: 1 - d, skirt1: d * (1 - sm(0.3, 0.9, d)), skirt2: d * sm(0.3, 0.9, d) }; });
  // belt + red sash (the accent) + knot + trailing tails
  k.add('hips', band(0.0, 0.08, 0.168, 0.162, 0.7, 16, 0.05), 'sash');
  k.add('hips', band(0.075, 0.1, 0.162, 0.158, 0.7, 16, 0.03), 'leather');
  k.add('hips', box(0.05, 0.035, 0.02), 'metal', [0, 0.087, 0.112]);
  k.add('hips', loft([R(-0.03, 0.02), R(0.0, 0.04, 0.035), R(0.05, 0.045, 0.035), R(0.08, 0.02)], { segs: 8, capTop: true, capBot: true }), 'sash', [0.1, 0.03, -0.11]);
  k.strip(['sash1', 'sash2', 'sash3'], 'sash', { len: 0.56, w0: 0.085, w1: 0.065, segLen: 0.16, rows: 11, twist: 1.0 });
  k.strip(['sash1', 'sash2', 'sash3'], 'sash', { len: 0.44, w0: 0.075, w1: 0.055, segLen: 0.16, rows: 9, x: -0.045, z: 0.012, tilt: -0.08, twist: -0.8 });
  k.add('hips', box(0.09, 0.1, 0.05), 'leather', [-0.165, -0.06, -0.05], [0, 0.55, 0]); // satchel
  k.add('hips', box(0.095, 0.035, 0.055), 'leather', [-0.165, -0.02, -0.05], [0, 0.55, 0]);

  // torso: crossover lapel + bandolier (spine-rigid, they sit over the chest)
  k.add('spine', loft([R(-0.026, 0.186, 0.124), R(0.0, 0.19, 0.128), R(0.026, 0.186, 0.124)], { segs: 10, t0: -1.25, t1: 0.9 }), 'wrap', [0, 0.3, 0.012], [0, 0, -0.6]);
  k.add('spine', loft([R(-0.016, 0.192, 0.128), R(0.016, 0.192, 0.128)], { segs: 18 }), 'leather', [0, 0.27, 0.008], [0, 0, 0.64]);
  k.add('spine', box(0.07, 0.06, 0.035), 'leather', [-0.1, 0.2, 0.115], [0.15, 0.35, 0.64]);
  k.add('spine', box(0.028, 0.028, 0.012), 'metal', [0.11, 0.4, 0.1], [0.2, 0.5, 0.64]);

  // hood + cowl as one skinned garment: the cowl drapes over the shoulders (spine, sharing with
  // the arms at its sides), the hood rides the head. Hem dips in a V at the front, points at the back.
  const hem = (a) => -0.075 * Math.max(0, -Math.cos(a)) ** 1.5 - 0.06 * Math.max(0, Math.cos(a)) ** 6;
  const cowl = [
    { ...R(1.39, 0.262, 0.172, -0.012), dy: hem }, R(1.46, 0.258, 0.168, -0.014), R(1.52, 0.215, 0.152, -0.016), R(1.575, 0.13, 0.122, -0.02),
    R(1.64, 0.122, 0.128, -0.012, 0, 0.5), R(1.7, 0.135, 0.15, 0.008, 0, 0.6), R(1.78, 0.137, 0.155, 0.022, 0, 0.58), R(1.85, 0.12, 0.144, 0.026, 0, 0.36),
    R(1.9, 0.085, 0.112, 0.028), R(1.935, 0.035, 0.068, 0.045), R(1.95, 0.004, 0.01, 0.08),
  ];
  const hoodW = (x, y) => {
    const head = sm(1.58, 1.69, y), ua = sm(0.13, 0.24, Math.abs(x)) * (1 - sm(1.49, 1.57, y)) * 0.45;
    return { head, spine: Math.max(0, 1 - head - ua), [x > 0 ? 'uaL' : 'uaR']: ua };
  };
  k.skin(loft(cowl, { segs: 18 }), 'hood', hoodW);
  k.skin(loft(cowl.slice(4, 9).map((r) => ({ ...r, rx: r.rx - 0.008, rz: r.rz - 0.009 })), { segs: 16 }), 'mask', () => ({ head: 1 })); // lining
  k.strip(['tail1', 'tail2'], 'hood', { len: 0.5, w0: 0.1, w1: 0.035, segLen: 0.24, rows: 8, z: -0.01, curve: 0.03 }); // hood tail

  // head: small, wrapped; smoked goggle band + respirator
  const hs = 0.92, hp = [0, 0.012, 0.004];
  const H = (geo, mat, p = [0, 0, 0], r, s = 1) => k.add('head', geo, mat, [hp[0] + p[0] * hs, hp[1] + p[1] * hs, hp[2] + p[2] * hs], r, typeof s === 'number' ? s * hs : s.map((v) => v * hs));
  H(loft([R(0.0, 0.05, 0.05, 0.01), R(0.04, 0.083, 0.088, 0.01), R(0.1, 0.096, 0.106, 0.01), R(0.16, 0.096, 0.106, 0.008)], { segs: 12, capBot: true }), 'skin');
  H(loft([R(0.145, 0.099, 0.109, 0.008), R(0.18, 0.1, 0.109, 0.006), R(0.23, 0.082, 0.092), R(0.27, 0.044, 0.05), R(0.285, 0.005)], { segs: 12 }), 'mask');
  H(loft([R(0.0, 0.07, 0.085, 0.022), R(0.05, 0.095, 0.112, 0.016), R(0.105, 0.1, 0.112, 0.012)], { segs: 12, t0: -1.85, t1: 1.85 }), 'mask');
  H(cyl(0.028, 0.032, 0.04, 10), 'metal', [0.0, 0.055, 0.125], [Math.PI / 2, 0, 0]);
  H(cyl(0.033, 0.033, 0.035, 12), 'rubber', [0.075, 0.035, 0.085], [Math.PI / 2, 0.95, 0, 'YXZ']);
  H(loft([R(0.118, 0.1, 0.112, 0.012), R(0.135, 0.103, 0.116, 0.012), R(0.152, 0.101, 0.113, 0.012)], { segs: 12, t0: -1.45, t1: 1.45 }), 'visor');

  // light armour: leather pauldron right (shared with the spine), vambrace + blade housing left
  k.add('uaR', new THREE.SphereGeometry(0.088, 12, 6, 0, TAU, 0, 1.25), 'leather', [-0.014, -0.025, 0], [0, 0, 0.42], [1, 0.7, 1.08], ['spine', () => 0.35]);
  k.add('uaR', loft([R(-0.12, 0.074, 0.078), R(-0.05, 0.086, 0.09), R(-0.01, 0.08, 0.084)], { segs: 12, t0: -2.2, t1: 0.6 }), 'leather', [-0.008, 0, 0], [0, 0, 0], 1, ['spine', () => 0.2]);
  k.add('faL', band(-0.06, -0.22, 0.058, 0.052, 0.95, 12, 0.05), 'leather');
  k.add('faL', box(0.024, 0.18, 0.036), 'metal', [-0.048, -0.165, 0.0]);
}

// ------------------------------------------------------------------ guards: heavy, square, top-heavy
const TROOPER_SHAPE = {
  torso: [
    [0.8, 0.05, 0.05], [0.84, 0.115, 0.095, -0.004], [0.9, 0.168, 0.112, -0.008], [0.97, 0.178, 0.12, -0.008], [1.04, 0.172, 0.117],
    [1.11, 0.166, 0.115, 0.004], [1.2, 0.18, 0.122, 0.01], [1.3, 0.205, 0.13, 0.014], [1.39, 0.222, 0.135, 0.01], [1.46, 0.235, 0.125, 0.002],
    [1.51, 0.21, 0.106, -0.006], [1.55, 0.135, 0.088, -0.01], [1.585, 0.072, 0.068, -0.006], [1.64, 0.062, 0.062], [1.7, 0.056, 0.056, 0.004],
  ],
  leg: [
    [1.02, 0.078, 0.082, 0, -0.01], [0.95, 0.1, 0.108, 0.006, 0], [0.85, 0.097, 0.104, 0.01, 0], [0.73, 0.085, 0.092, 0.008, -0.002], [0.61, 0.072, 0.08, 0.006, -0.004],
    [0.51, 0.064, 0.07, 0.006, -0.006], [0.455, 0.062, 0.068, 0.01, -0.006], [0.4, 0.062, 0.07, -0.004, -0.006], [0.34, 0.066, 0.077, -0.012, -0.004],
    [0.25, 0.056, 0.064, -0.008, -0.002], [0.15, 0.046, 0.052, -0.004], [0.075, 0.042, 0.047],
  ],
  arm: [
    [1.575, 0.018, 0.018, 0, -0.06], [1.565, 0.048, 0.054, 0, -0.045], [1.54, 0.068, 0.072, 0, -0.022], [1.5, 0.075, 0.078, 0, -0.004], [1.45, 0.066, 0.07],
    [1.37, 0.06, 0.064, 0.004], [1.29, 0.054, 0.056], [1.235, 0.051, 0.053, -0.004], [1.18, 0.056, 0.06, -0.006], [1.1, 0.051, 0.054, -0.003],
    [1.0, 0.042, 0.045], [0.955, 0.04, 0.043],
  ],
  segs: 16,
};
function buildTrooper(k, v) {
  const heavy = v === 'bodyguard', light = v === 'sentry', vip = v === 'target';
  buildBody(k, TROOPER_SHAPE, { torso: [[0, 14, 'cloth']], leg: [[0, 11, 'cloth']], arm: [[0, 11, 'cloth']] });
  k.sym((s, L) => {
    boot(k, L, 'leather', { h: 0.31, rx: 0.064, toe: 0.145, cuff: 0.008, wide: 1.05 });
    k.add('sh' + L, new THREE.SphereGeometry(0.078, 10, 6, -1.4, 2.8, 0.4, 1.6), 'enamel', [0, -0.025, 0.012], [-0.15, 0, 0], [1, 1.25, 1], ['th' + L, (x, y) => sm(-0.02, 0.06, y) * 0.5]);
    fist(k, L, 'leather', 1.22);
    // bracers
    k.add('fa' + L, band(-0.08, -0.26, 0.068, 0.058, 1, 12, 0.04), light ? 'leather' : 'enamel');
    // tassets: enamel lames over the thigh fronts (ATLA soldier skirts), half riding the hips
    if (!light) {
      const w = heavy ? 1.35 : 1.1;
      k.add('th' + L, loft([R(0.08, 0.128, 0.138), R(-0.06, 0.134, 0.146), R(-0.2, 0.14, 0.153)], { segs: 8, t0: -w + 0.25 * s, t1: w + 0.25 * s }), 'enamel', [0, 0, 0], [0, 0, 0], 1, ['hips', (x, y) => 0.3 + (y + 0.2) * 1.5]);
      if (heavy || vip) k.add('th' + L, loft([R(-0.18, 0.138, 0.15), R(-0.3, 0.143, 0.158)], { segs: 8, t0: -w + 0.25 * s, t1: w + 0.25 * s }), vip ? 'accent' : 'enamel');
    }
  });
  // belt, buckle, pouches
  k.add('hips', band(0.03, 0.1, 0.19, 0.184, 0.68, 16, 0.03), 'leather');
  k.add('hips', box(0.07, 0.06, 0.02), 'metal', [0, 0.065, 0.13]);
  k.sym((s) => k.add('hips', box(0.075, 0.08, 0.05), 'leather', [0.13 * s, 0.03, 0.095], [0, 0.55 * s, 0]));
  k.add('hips', box(0.12, 0.08, 0.05), 'leather', [0, 0.04, -0.14]);
  if (heavy) { // oxblood tabards front and back
    k.skin(loft([R(0.62, 0.21, 0.155), R(0.82, 0.19, 0.145), R(1.01, 0.18, 0.13)], { segs: 6, t0: -0.45, t1: 0.45 }), 'accent', (x, y) => { const d = 1 - sm(0.62, 0.98, y); return { hips: 1 - 0.6 * d, thL: 0.3 * d, thR: 0.3 * d }; });
    k.skin(loft([R(0.58, 0.22, 0.165), R(0.8, 0.2, 0.155), R(1.01, 0.18, 0.135)], { segs: 6, t0: Math.PI - 0.5, t1: Math.PI + 0.5 }), 'accent', (x, y) => { const d = 1 - sm(0.58, 0.98, y); return { hips: 1 - d, skirt1: d * (1 - sm(0.3, 0.9, d)), skirt2: d * sm(0.3, 0.9, d) }; });
  }
  // torso: quilted waist + enamel cuirass + gorget
  const tw = heavy ? 1.06 : 1;
  for (let i = 0; i < 3; i++) k.add('spine', band(0.0 + i * 0.045, 0.035 + i * 0.045, 0.176 + i * 0.002, 0.178 + i * 0.002, 0.7, 16, 0.06), 'cloth');
  if (!light) {
    const cu = (t0, t1, mat, d = 0) => k.add('spine', loft([R(0.15, 0.188 + d, 0.135 + d, 0.006), R(0.26, 0.215 * tw + d, 0.15 + d, 0.012), R(0.37, 0.237 * tw + d, 0.158 + d, 0.014), R(0.45, 0.232 * tw + d, 0.148 + d, 0.006), R(0.5, 0.2 + d, 0.124 + d)], { segs: 14, t0, t1 }), mat, [0, 0, 0], [0, 0, 0], 1, ['hips', (x, y) => (1 - sm(0.15, 0.24, y)) * 0.4]);
    cu(-1.75, 1.75, 'enamel');
    cu(Math.PI - 1.35, Math.PI + 1.35, 'enamel', 0.004);
    k.add('spine', box(0.02, 0.3, 0.02), vip ? 'accent' : 'enamel', [0, 0.32, 0.17], [-0.06, 0, 0]); // sternum ridge
    // trim stripe round the cuirass rim (lighter on the dark bodyguard, so it reads at night)
    k.add('spine', loft([R(0.49, 0.205 * tw, 0.128), R(0.505, 0.198, 0.124)], { segs: 14, t0: -1.75, t1: 1.75 }), 'trim');
  } else {
    // sentry: padded vest + bandolier of throwing canisters
    k.add('spine', loft([R(0.1, 0.19, 0.135), R(0.26, 0.214, 0.15), R(0.4, 0.228, 0.15), R(0.48, 0.21, 0.135)], { segs: 14, t0: 0.35, t1: TAU - 0.35 }), 'accent');
    for (let i = 0; i < 4; i++) {
      const t = i / 3, x = 0.13 - t * 0.24, y = 0.42 - t * 0.3;
      k.add('spine', cyl(0.026, 0.026, 0.075, 8), 'enamel', [x, y, 0.163], [0, 0, 0.62]);
      k.add('spine', cyl(0.012, 0.012, 0.02, 6), 'metal', [x - 0.04, y + 0.03, 0.163], [0, 0, 0.62]);
    }
    k.add('spine', box(0.04, 0.5, 0.014), 'leather', [0.0, 0.28, 0.155], [0.05, 0, 0.62]);
    k.add('spine', box(0.04, 0.5, 0.014), 'leather', [0.0, 0.28, -0.155], [-0.05, 0, -0.62]);
  }
  k.add('spine', loft([R(0.47, 0.2, 0.135), R(0.52, 0.152, 0.112), R(0.56, 0.1, 0.092), R(0.6, 0.088, 0.088)], { segs: 14 }), light ? 'cloth' : 'enamel'); // gorget

  if (v === 'guard') {
    // field radio pack: bulky analog tech, CRT readout, whip antenna, ribbed cable to the helmet
    k.add('spine', box(0.26, 0.3, 0.1), 'metal', [0, 0.28, -0.205]);
    k.add('spine', box(0.27, 0.035, 0.11), 'leather', [0, 0.36, -0.205]);
    k.add('spine', box(0.27, 0.035, 0.11), 'leather', [0, 0.2, -0.205]);
    k.add('spine', box(0.09, 0.05, 0.005), 'lens', [0.06, 0.28, -0.257]);
    k.add('spine', cyl(0.018, 0.018, 0.03, 8), 'enamel', [-0.07, 0.27, -0.26], [Math.PI / 2, 0, 0]);
    k.add('spine', cyl(0.004, 0.006, 0.6, 4), 'metal', [-0.09, 0.7, -0.225], [-0.12, 0, 0.06]);
    k.add('spine', hose([[0.1, 0.43, -0.205], [0.11, 0.53, -0.165], [0.09, 0.62, -0.125]], 0.014, 7, 5), 'rubber');
  }
  // shoulders: big layered pauldrons (top-heavy read), shared with the spine so they don't fly off
  k.sym((s, L) => {
    const big = heavy ? 1.32 : vip ? 1.25 : light ? 0.85 : 1.08;
    if (!light) {
      k.add('ua' + L, new THREE.SphereGeometry(0.1 * big, 12, 6, 0, TAU, 0, 1.2), 'enamel', [0.02 * s, -0.03, 0], [0, 0, -0.42 * s], [1, 0.7, 1.05], ['spine', () => 0.4]);
      for (let i = 0; i < 2; i++) k.add('ua' + L, loft([R(-0.09 - i * 0.05, (0.118 + i * 0.012) * big, (0.115 + i * 0.012) * big), R(-0.05 - i * 0.05, (0.1 + i * 0.01) * big, (0.1 + i * 0.01) * big)], { segs: 12, t0: s > 0 ? -0.9 : -TAU / 2 - 0.9, t1: s > 0 ? TAU / 2 + 0.9 : 0.9 }), i ? 'trim' : 'enamel', [0.024 * s, 0, 0], [0, 0, -0.18 * s], 1, ['spine', () => 0.25 - i * 0.1]);
      if (heavy) k.add('ua' + L, box(0.016, 0.04, 0.17), 'trim', [0.075 * s, 0.03, 0], [0, 0, -0.5 * s]); // ridge
    } else {
      k.add('ua' + L, new THREE.SphereGeometry(0.084, 10, 5, 0, TAU, 0, 1.1), 'cloth', [0.008 * s, 0.0, 0], [0, 0, -0.3 * s], 1, ['spine', () => 0.35]);
    }
  });

  // head: enamel helmet over the gas mask (Poly Haven, CC0), glowing lenses, front filter
  const ms = 1.0, my = 0.15;
  k.add('head', gasmask(), 'rubber', [0.004, my, 0.0], [0, 0, 0], ms);
  k.sym((s) => k.add('head', new THREE.CircleGeometry(0.031, 12), 'lens', [0.0495 * s + 0.004, my + 0.016, 0.105], [0, 0.42 * s, 0]));
  k.add('head', gasfilter(), 'rubber', [0.004, my - 0.19, 0.15], [-0.45, 0, 0], [0.42, 0.42, 0.62]);
  const crest = heavy || vip;
  const hr = vip ? 1.08 : light ? 1.0 : 1.04;
  const hk = (geo, mat, q = [0, 0, 0], r, sc) => k.add('head', geo, mat, [q[0], q[1] + 0.03, q[2]], r, sc);
  hk(loft([R(0.05, 0.13 * hr, 0.142 * hr, -0.008, 0, 1.3), R(0.13, 0.135 * hr, 0.148 * hr, -0.006, 0, 1.0), R(0.185, 0.13 * hr, 0.145 * hr, -0.005), R(0.25, 0.103 * hr, 0.116 * hr, -0.008), R(0.285, 0.058 * hr, 0.068 * hr, -0.01), R(0.3, 0.01, 0.012, -0.01)], { segs: 18 }), 'enamel');
  if (!light) {
    hk(loft([R(0.16, 0.137 * hr, 0.16 * hr, -0.006), R(0.178, 0.14 * hr, 0.165 * hr, -0.006), R(0.2, 0.133 * hr, 0.152 * hr, -0.006)], { segs: 10, t0: -1.2, t1: 1.2 }), 'trim');
    hk(loft([R(-0.03, 0.175 * hr, 0.18 * hr, -0.03), R(0.03, 0.15 * hr, 0.155 * hr, -0.018), R(0.08, 0.133 * hr, 0.145 * hr, -0.01)], { segs: 12, t0: Math.PI - 1.9, t1: Math.PI + 1.9 }), 'enamel');
    k.sym((s) => hk(cyl(0.04, 0.04, 0.03, 12), 'metal', [0.138 * hr * s, 0.12, -0.01], [0, 0, Math.PI / 2]));
  } else {
    k.sym((s) => hk(cyl(0.024, 0.026, 0.07, 10), 'metal', [0.035 * s, 0.24, 0.115], [-0.9, 0, 0]));
    hk(box(0.1, 0.025, 0.04), 'metal', [0, 0.215, 0.11], [-0.6, 0, 0]);
    k.add('spine', band(0.52, 0.62, 0.13, 0.105, 1, 12, 0.15), 'accent');
  }
  if (crest) hk(loft([R(0.0, 0.012, 0.11), R(0.06, 0.008, 0.1, 0.0), R(0.1, 0.002, 0.07, -0.02)], { segs: 10, capTop: true }), 'trim', [0, 0.25, -0.005]);
  if (vip) {
    hk(new THREE.ConeGeometry(0.03, 0.09, 5), 'enamel', [0, 0.36, 0.02], [0.25, 0, 0]);
    hk(cyl(0.032, 0.036, 0.03, 10), 'metal', [0, 0.31, 0.02]);
  }
  hk(new THREE.PlaneGeometry(0.13, 0.034), 'decal', [0.131 * hr, 0.175, -0.005], [0, Math.PI / 2, 0]);
  hk(new THREE.PlaneGeometry(0.13, 0.034), 'decal', [-0.131 * hr, 0.175, -0.005], [0, -Math.PI / 2, 0]);
  if (vip) {
    k.strip(['cape1', 'cape2'], 'accent', { len: 0.98, w0: 0.44, w1: 0.58, segLen: 0.4, rows: 10, curve: 0.08 });
    k.sym((s) => k.add('spine', cyl(0.03, 0.03, 0.02, 10), 'enamel', [0.17 * s, 0.5, -0.125], [Math.PI / 2, 0, 0]));
  }
}

// ------------------------------------------------------------------ looks
// Material colours: muted, weathered, one accent each. Per-type identity kept from v0.2:
// red-ish guard, dark bodyguard, orange sentry, gold target. `rim` is a view-angle edge light
// that keeps silhouettes readable against dark roofs; `lag` is per-joint pose follow-through
// (player: hips lead, spine/head trail, hands snap; troopers: stiff and even).
const CAT_LAG = { hips: 1.1, spine: 0.8, head: 0.6, uaL: 1.0, uaR: 1.0, faL: 1.25, faR: 1.25, thL: 1.15, thR: 1.15, shL: 1.25, shR: 1.25 };
export const LOOKS = {
  player: {
    build: buildPlayer, lift: 0.14, rim: 0x2c3846, lag: CAT_LAG,
    mats: {
      tunic: ['cloth', 0x4f5966], trousers: ['cloth', 0x33363b], wrap: ['cloth', 0xa8997a], hood: ['cloth', 0x5a6470],
      sash: ['cloth', 0x9c2a22], leather: ['leather', 0x6a4a35], skin: ['skin', 0x8f6a55], mask: ['leather', 0x2b2a29],
      metal: ['metal', 0x55585c], rubber: ['rubber', 0xffffff], visor: ['lens', 0x0d0d0e, 0x7a1a14, 0.5],
    },
    flash: ['tunic', 'hood'], chains: ['sash', 'tail', 'skirt'],
  },
  guard: {
    build: (k) => buildTrooper(k, 'guard'), lift: 0.22, stencil: 'K-17', rim: 0x30302c,
    mats: {
      enamel: ['enamel', 0x8e3a2e], trim: ['enamel', 0x6f2c24], cloth: ['cloth', 0x55574b], leather: ['leather', 0x3b302a],
      metal: ['metal', 0x3e4245], rubber: ['rubber', 0xffffff], lens: ['lens', 0x0c1a10, 0x5dff8a, 1.6], decal: ['decal', 0xd8d2c0],
    },
    flash: ['enamel', 'trim', 'cloth'], lens: 'lens',
  },
  bodyguard: {
    build: (k) => buildTrooper(k, 'bodyguard'), lift: 0.16, stencil: 'Ж-03', rim: 0x5a3a34,
    mats: {
      enamel: ['enamel', 0x3d3739], trim: ['enamel', 0x9a3a2c], accent: ['cloth', 0x6e2420], cloth: ['cloth', 0x40292a], leather: ['leather', 0x231c19],
      metal: ['metal', 0x2e3134], rubber: ['rubber', 0xb0a8a8], lens: ['lens', 0x1a0d05, 0xffa040, 1.7], decal: ['decal', 0xc8a058],
    },
    flash: ['enamel', 'trim', 'accent', 'cloth'], lens: 'lens', chains: ['skirt'],
  },
  sentry: {
    build: (k) => buildTrooper(k, 'sentry'), lift: 0.15, stencil: 'C-41', rim: 0x30302c,
    mats: {
      enamel: ['enamel', 0xb6652c], accent: ['cloth', 0x8a5a33], cloth: ['cloth', 0x857b5e], leather: ['leather', 0x4a3a2c],
      metal: ['metal', 0x45494c], rubber: ['rubber', 0xffffff], lens: ['lens', 0x0c1a10, 0x5dff8a, 1.6], decal: ['decal', 0x2a2622],
    },
    flash: ['enamel', 'accent', 'cloth'], lens: 'lens',
  },
  target: {
    build: (k) => buildTrooper(k, 'target'), lift: 0.15, stencil: '01', rim: 0x3a3428,
    mats: {
      enamel: ['enamel', 0xc29a35], trim: ['enamel', 0x8a6a22], accent: ['cloth', 0x6a2320], cloth: ['cloth', 0xd6ccb4], leather: ['leather', 0x3e2a20],
      metal: ['metal', 0x8a7448], rubber: ['rubber', 0xffffff], lens: ['lens', 0x1a1408, 0xffe08a, 1.4], decal: ['decal', 0x5a1a16],
    },
    flash: ['enamel', 'trim', 'accent', 'cloth'], lens: 'lens', chains: ['cape'],
  },
};

// view-angle rim light, injected into the standard material (one shared program per variant)
export function withRim(m, rim) {
  if (!rim) return m;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = rim;
    sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight += uRim * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5);\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'rim';
  return m;
}

const built = {};
export function getLook(name) {
  const L = LOOKS[name] || LOOKS.player;
  if (!built[name]) {
    const k = new Kit(); L.build(k);
    const { geos, tris } = k.build();
    const rim = L.rim ? { value: new THREE.Color(L.rim) } : null;
    const mats = {};
    for (const [key, [surf, color, emissive, ei]] of Object.entries(L.mats)) {
      if (!geos[key]) continue;
      if (surf === 'decal') {
        mats[key] = new THREE.MeshStandardMaterial({ color, map: stencil(L.stencil || ''), alphaTest: 0.5, roughness: 0.6, side: THREE.DoubleSide });
        continue;
      }
      const m = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, ...SURF[surf]() });
      if (emissive) { m.emissive.setHex(emissive); m.emissiveIntensity = ei; }
      mats[key] = surf === 'lens' ? m : withRim(m, rim);
    }
    built[name] = { geos, mats, tris, look: L, rim };
  }
  return built[name];
}

// blade + baton (plain meshes on the forearm bones)
let bladeGeo, batonParts;
export function bladeGeometry() {
  if (bladeGeo) return bladeGeo;
  const s = new THREE.Shape();
  s.moveTo(-0.012, 0); s.lineTo(0.014, 0); s.lineTo(0.012, -0.24); s.lineTo(0.0, -0.3); s.lineTo(-0.01, -0.25); s.lineTo(-0.012, 0);
  bladeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.002, bevelSegments: 1 });
  bladeGeo.translate(0, 0, -0.003);
  bladeGeo.rotateY(Math.PI / 2);
  return bladeGeo;
}
export function batonGeometry() {
  if (batonParts) return batonParts;
  const shaft = cyl(0.022, 0.026, 0.62, 8); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, 0.33);
  const grip = hose([[0, 0, -0.08], [0, 0, 0.04]], 0.026, 5, 8);
  const ferrule = cyl(0.03, 0.03, 0.05, 8); ferrule.rotateX(Math.PI / 2); ferrule.translate(0, 0, 0.06);
  const tip = cyl(0.028, 0.02, 0.05, 8); tip.rotateX(Math.PI / 2); tip.translate(0, 0, 0.66);
  batonParts = { rubber: [mergePlain([shaft, grip])], metal: [mergePlain([ferrule, tip])] };
  return batonParts;
}
function mergePlain(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const arr = new Float32Array(parts.reduce((n, g) => n + g.attributes[name].array.length, 0));
    let o = 0; for (const g of parts) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
