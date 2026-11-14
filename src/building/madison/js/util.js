// Shared helpers: seeded random, polygon tests, a geometry batcher, a 2D segment grid.
import * as THREE from './vendor/three.module.min.js';
export { THREE };

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);

// point in ring ([[x,z],...])
export function pip(x, z, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
export function bbox(r) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
  return [x0, z0, x1, z1];
}

// Accumulates quads/boxes into one BufferGeometry (one draw call per material).
export class Batch {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.count = 0; }
  // a,b,c,d counter-clockwise seen from the front; uv = [u0,v0,u1,v1] with a=(u0,v0), c=(u1,v1)
  quad(a, b, c, d, uv, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const k = this.count; uv = uv || [0, 0, 1, 1]; col = col || WHITE;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    for (let q = 0; q < 4; q++) { this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); }
    this.u.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3); this.count += 4;
  }
  tri(a, b, c, col) {
    const k = this.count; col = col || WHITE;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const q of [a, b, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx / l, ny / l, nz / l); this.c.push(col[0], col[1], col[2]); this.u.push(q[0] * .3, q[1] * .3); }
    this.i.push(k, k + 1, k + 2); this.count += 3;
  }
  // box from centre + three half-extent vectors (right-handed X,Y,Z)
  boxB(c, X, Y, Z, col, uvs) {
    const f = (N, T1, T2, s1, s2) => {
      const P = (a, b) => [c[0] + N[0] + a * T1[0] + b * T2[0], c[1] + N[1] + a * T1[1] + b * T2[1], c[2] + N[2] + a * T1[2] + b * T2[2]];
      this.quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), uvs ? [0, 0, s1 * uvs, s2 * uvs] : null, col);
    };
    const neg = v => [-v[0], -v[1], -v[2]], len = v => 2 * Math.hypot(v[0], v[1], v[2]);
    f(X, Y, Z, len(Y), len(Z)); f(neg(X), Z, Y, len(Z), len(Y));
    f(Y, Z, X, len(Z), len(X)); f(neg(Y), X, Z, len(X), len(Z));
    f(Z, X, Y, len(X), len(Y)); f(neg(Z), Y, X, len(Y), len(X));
  }
  // axis box: size sx (along heading), sy, sz; rotY in radians
  box(cx, cy, cz, sx, sy, sz, rotY = 0, col, uvs) {
    const co = Math.cos(rotY), si = Math.sin(rotY);
    this.boxB([cx, cy, cz], [co * sx / 2, 0, -si * sx / 2], [0, sy / 2, 0], [si * sz / 2, 0, co * sz / 2], col, uvs);
  }
  mesh(material, opts = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    const m = new THREE.Mesh(g, material);
    m.castShadow = opts.cast !== false; m.receiveShadow = opts.receive !== false;
    m.matrixAutoUpdate = false;
    return m;
  }
}
const WHITE = [1, 1, 1];

// Uniform grid of 2D wall segments for collision and look-at queries.
export class SegGrid {
  constructor(cell = 12) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return i * 4096 + j; }
  add(ax, az, bx, bz, ref) {
    const s = { ax, az, bx, bz, ref }, c = this.cell;
    const i0 = Math.floor(Math.min(ax, bx) / c), i1 = Math.floor(Math.max(ax, bx) / c);
    const j0 = Math.floor(Math.min(az, bz) / c), j1 = Math.floor(Math.max(az, bz) / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j); let l = this.map.get(k); if (!l) this.map.set(k, l = []); l.push(s);
    }
  }
  near(x, z, r, out = []) {
    const c = this.cell; out.length = 0;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const l = this.map.get(this.key(i, j)); if (l) for (const s of l) if (!out.includes(s)) out.push(s);
      }
    return out;
  }
  // push a circle out of walls; returns corrected [x,z]
  // y = feet height: walls whose top is at or below it don't block (so you can stand on roofs)
  resolve(x, z, r, y = 0) {
    for (let it = 0; it < 3; it++) {
      for (const s of this.near(x, z, r + .1, TMP)) {
        if (y >= (s.ref ? s.ref.h : 5.6) - .35) continue;
        const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / l2, 0, 1);
        const px = s.ax + dx * t, pz = s.az + dz * t, ex = x - px, ez = z - pz, d = Math.hypot(ex, ez);
        if (d < r && d > 1e-5) { x = px + ex / d * r; z = pz + ez / d * r; }
      }
    }
    return [x, z];
  }
  // nearest hit along a 2D ray; accept(s, t) may veto a segment
  ray(ox, oz, dx, dz, max, accept) {
    let best = null, bt = max;
    const seen = new Set();
    for (let d = 0; d <= max; d += this.cell * .7) {
      for (const s of this.near(ox + dx * d, oz + dz * d, this.cell * .5, TMP)) {
        if (seen.has(s)) continue; seen.add(s);
        const ex = s.bx - s.ax, ez = s.bz - s.az, den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-6) continue;
        const t = ((s.ax - ox) * ez - (s.az - oz) * ex) / den, u = ((s.ax - ox) * dz - (s.az - oz) * dx) / den;
        if (t > 0 && t < bt && u >= 0 && u <= 1 && (!accept || accept(s, t))) { bt = t; best = s; }
      }
      if (best && bt < d) break;
    }
    return best ? { s: best, t: bt } : null;
  }
}
const TMP = [];
