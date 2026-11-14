// Ground plane, real sidewalk polygons, markings, street trees (city census), hydrants, lamps, signs, parked cars.
import { THREE, rng, pip, bbox, Batch } from './util.js';
import { asphalt, concrete, streetSign, glow, foliage } from './textures.js';

export function buildStreet(data, scene, env, city) {
  const R = rng(932), night = [];
  const [bx0, bz0] = data.bounds[0], [bx1, bz1] = data.bounds[1];

  // ---- asphalt ----
  const at = asphalt();
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ fog: false }));
  haze.rotation.x = -Math.PI / 2; haze.position.y = -.06; scene.add(haze);
  {
    const RI = 400, RO = 600, N = 72, p = [0, 0, 0], c = [1, 1, 1, 1], u = [0, 0], ix = [];
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, co = Math.cos(a), si = Math.sin(a);
      p.push(co * RI, 0, si * RI, co * RO, 0, si * RO); c.push(1, 1, 1, 1, 1, 1, 1, 0); u.push(co * RI / 10, si * RI / 10, co * RO / 10, si * RO / 10);
      const k = 1 + i * 2, n = 1 + ((i + 1) % N) * 2; ix.push(0, n, k, k, n, k + 1, n, n + 1, k + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 4));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setIndex(ix); g.computeVertexNormals();
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: at, roughness: .95, vertexColors: true, transparent: true }));
    ground.receiveShadow = true; ground.renderOrder = -5; scene.add(ground);
  }
  night.push(() => haze.material.color.copy(scene.fog.color));

  // ---- sidewalks (planimetric polygons, holes = block interiors) ----
  const walks = data.sidewalks.map(rs => ({ rs, bb: bbox(rs[0]) }));
  const onWalk = (x, z) => { for (const s of walks) if (x >= s.bb[0] && x <= s.bb[2] && z >= s.bb[1] && z <= s.bb[3] && pip(x, z, s.rs[0])) return true; return false; };
  const SWY = .15, sp = [], su = [], si = [], ip = [], iu = [], ii = [], curb = new Batch();
  const V2 = r => r.map(p => new THREE.Vector2(p[0], p[1]));
  const fill = (pts, tris, y, P, U, I, ortho) => {
    const base = P.length / 3;
    for (const p of pts) { P.push(p[0], y, p[1]); if (ortho) U.push((p[0] - bx0) / (bx1 - bx0), 1 - (p[1] - bz0) / (bz1 - bz0)); else U.push(p[0] / 3, p[1] / 3); }
    for (const [a, b, c] of tris) {
      const A = pts[a], Bp = pts[b], C = pts[c], up = (Bp[1] - A[1]) * (C[0] - A[0]) - (Bp[0] - A[0]) * (C[1] - A[1]) > 0;
      I.push(base + a, base + (up ? b : c), base + (up ? c : b));
    }
  };
  for (const { rs } of walks) {
    fill(rs.flat(), THREE.ShapeUtils.triangulateShape(V2(rs[0]), rs.slice(1).map(V2)), SWY, sp, su, si);
    for (const h of rs.slice(1)) fill(h, THREE.ShapeUtils.triangulateShape(V2(h), []), SWY - .02, ip, iu, ii, true);
    const r0 = rs[0];
    for (let k = 0; k < r0.length; k++) {
      const a = r0[k], b = r0[(k + 1) % r0.length];
      curb.quad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], SWY, b[1]], [a[0], SWY, a[1]], null, [.62, .62, .6]);
      curb.quad([b[0], 0, b[1]], [a[0], 0, a[1]], [a[0], SWY, a[1]], [b[0], SWY, b[1]], null, [.62, .62, .6]);
    }
  }
  const geo = (P, U, I) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals(); return g; };
  const sw = new THREE.Mesh(geo(sp, su, si), new THREE.MeshStandardMaterial({ map: concrete(), roughness: .95 })); sw.receiveShadow = true; scene.add(sw);
  const yard = new THREE.Mesh(geo(ip, iu, ii), new THREE.MeshStandardMaterial({ map: env.ortho, roughness: 1, color: 0xbfbfbf })); yard.receiveShadow = true; scene.add(yard);
  scene.add(curb.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }), { cast: false }));

  // ---- intersections ----
  const streets = data.streets.filter(s => s.n !== 'Alley'), nodes = new Map();
  for (const s of streets) for (const end of [0, 1]) {
    const p = s.p[end ? s.p.length - 1 : 0], q = s.p[end ? s.p.length - 2 : 1], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const k = Math.round(p[0]) + ',' + Math.round(p[1]); let nd = nodes.get(k); if (!nd) nodes.set(k, nd = { x: p[0], z: p[1], legs: [] });
    nd.legs.push({ s, dx: (q[0] - p[0]) / l, dz: (q[1] - p[1]) / l });
  }
  const crossings = [...nodes.values()].filter(n => n.legs.length >= 3);
  const nearNode = (x, z, d) => crossings.some(n => Math.abs(n.x - x) < d && Math.abs(n.z - z) < d && Math.hypot(n.x - x, n.z - z) < d);

  // ---- paint ----
  const paint = new Batch();
  const flat = (cx, cz, along, across, dx, dz, col, y = .015) => {
    const ax = dx * along / 2, az = dz * along / 2, bx = -dz * across / 2, bz = dx * across / 2;
    paint.quad([cx - ax - bx, y, cz - az - bz], [cx - ax + bx, y, cz - az + bz], [cx + ax + bx, y, cz + az + bz], [cx + ax - bx, y, cz + az - bz], null, col);
    paint.quad([cx - ax + bx, y, cz - az + bz], [cx - ax - bx, y, cz - az - bz], [cx + ax - bx, y, cz + az - bz], [cx + ax + bx, y, cz + az + bz], null, col);
  };
  const WHITE = [.86, .86, .84], YEL = [.9, .68, .1];
  for (const n of crossings) {
    if (Math.hypot(n.x, n.z) > 380) continue;
    for (const leg of n.legs) {
      let off = 0;
      for (const o of n.legs) if (o !== leg && Math.abs(o.dx * leg.dx + o.dz * leg.dz) < .8) off = Math.max(off, o.s.w / 2 / Math.max(.55, Math.abs(o.dx * leg.dz - o.dz * leg.dx)));
      if (!off) continue;
      const cx = n.x + leg.dx * (off + 2.4), cz = n.z + leg.dz * (off + 2.4), w = leg.s.w, nb = Math.floor((w - .6) / 1.15);
      for (let i = 0; i < nb; i++) { const o = (i - (nb - 1) / 2) * 1.15; flat(cx - leg.dz * o, cz + leg.dx * o, 3, .5, leg.dx, leg.dz, WHITE); }
      flat(cx + leg.dx * 2.6, cz + leg.dz * 2.6, .4, w - .8, leg.dx, leg.dz, WHITE);
    }
  }
  for (const s of streets) if (s.d === 'TW' && s.w > 11) for (let k = 0; k < s.p.length - 1; k++) {      // double yellow
    const a = s.p[k], b = s.p[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
    if (Math.hypot(a[0], a[1]) > 520 || l < 20) continue;
    for (const o of [-.14, .14]) flat((a[0] + b[0]) / 2 - dz * o, (a[1] + b[1]) / 2 + dx * o, l - 16, .11, dx, dz, YEL);
  }

  // ---- street trees (NYC Parks forestry points) + yard trees ----
  const trees = data.trees.filter(t => Math.hypot(t.x, t.z) < 380).map(t => ({ ...t }));
  for (const { rs } of walks) for (const h of rs.slice(1)) {
    const b = bbox(h), n = Math.round((b[2] - b[0]) * (b[3] - b[1]) / 900);
    for (let i = 0; i < n; i++) {
      const x = b[0] + R() * (b[2] - b[0]), z = b[1] + R() * (b[3] - b[1]);
      if (Math.hypot(x, z) < 330 && pip(x, z, h) && !city.buildingAt(x, z) && !city.buildingAt(x + 2, z) && !city.buildingAt(x - 2, z) && !city.buildingAt(x, z + 2) && !city.buildingAt(x, z - 2)) trees.push({ x, z, d: 6 + R() * 14, s: 'yard', yard: true });
    }
  }
  const PAL = { 'honeylocust': [1.25, 1.2, .5], 'pin oak': [.95, .8, .5], 'London planetree': [.95, 1.0, .55], 'Callery pear': [1.15, .7, .5], 'littleleaf linden': [1.2, 1.15, .5],
    'ginkgo': [1.5, 1.3, .4], 'red maple': [1.4, .6, .4], 'Japanese zelkova': [1.25, .85, .45], 'yard': [.8, .95, .6] };
  const trunkG = new THREE.CylinderGeometry(.5, .85, 1, 7); trunkG.translate(0, .5, 0);
  const leafG = new THREE.SphereGeometry(1, 8, 5);
  { const p = leafG.attributes.position, n = (x, y, z) => Math.sin(x * 4.1 + y * 2.3) * Math.cos(z * 3.7 - y * 1.9) * .5 + Math.sin(x * 9 + z * 7 + y * 8) * .25;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 1 + n(x, y, z) * .32; p.setXYZ(i, x * f, y * f * (y < 0 ? .7 : .95), z * f); }
    leafG.computeVertexNormals(); }
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x5a4a3e, roughness: 1 }), trees.length);
  const leaves = new THREE.InstancedMesh(leafG, new THREE.MeshStandardMaterial({ map: foliage(), roughness: 1 }), trees.length * 4);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), T = new THREE.Vector3(), col = new THREE.Color();
  trees.forEach((t, i) => {
    const d = Math.min(30, Math.max(2, t.d)), h = 3.6 + d * .4, cr = 1.2 + d * .115, tr = .06 + d * .012;
    M.compose(T.set(t.x, t.yard ? 0 : SWY, t.z), Q.identity(), S.set(tr, h * .62, tr)); trunks.setMatrixAt(i, M);
    const base = PAL[t.s] || [.85 + R() * .3, .95 + R() * .15, .55];
    for (let k = 0; k < 4; k++) {
      const a = k * 2.09 + R(), o = k ? cr * .62 : 0, s = cr * (k ? .6 + R() * .22 : .95);
      Q.setFromEuler(new THREE.Euler(R(), R() * 6, R()));
      M.compose(T.set(t.x + Math.cos(a) * o, (t.yard ? 0 : SWY) + h * (.7 + (k ? R() * .2 - .06 : .14)), t.z + Math.sin(a) * o), Q, S.set(s, s * .86, s));
      leaves.setMatrixAt(i * 4 + k, M);
      const v = .8 + R() * .3; leaves.setColorAt(i * 4 + k, col.setRGB(base[0] * v, base[1] * v, base[2] * v));
    }
    if (!t.yard) { paint.quad([t.x - .7, SWY + .012, t.z - .7], [t.x - .7, SWY + .012, t.z + .7], [t.x + .7, SWY + .012, t.z + .7], [t.x + .7, SWY + .012, t.z - .7], null, [.2, .16, .12]);
      if (Math.hypot(t.x, t.z) < 240) { const r = tr * .8 + .1; city.segGrid.add(t.x - r, t.z, t.x, t.z + r); city.segGrid.add(t.x, t.z + r, t.x + r, t.z); city.segGrid.add(t.x + r, t.z, t.x, t.z - r); city.segGrid.add(t.x, t.z - r, t.x - r, t.z); } }
  });
  for (const m of [trunks, leaves]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }

  // ---- furniture ----
  const furn = new Batch();
  for (const [x, z] of data.hydrants) { furn.box(x, SWY + .3, z, .24, .6, .24, 0, [.12, .12, .13]); furn.box(x, SWY + .65, z, .3, .12, .3, .78, [.7, .71, .72]); furn.box(x, SWY + .42, z, .44, .12, .12, 0, [.7, .71, .72]); }
  const lampPts = [], pools = [];
  for (const s of streets) {
    const bway = s.n === 'Broadway'; let acc = 10 + R() * 20, side = 1;
    for (let k = 0; k < s.p.length - 1; k++) {
      const a = s.p[k], b = s.p[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l, rot = Math.atan2(-dz, dx);
      for (; acc < l; acc += bway ? 30 : 36) {
        const x = a[0] + dx * acc, z = a[1] + dz * acc; if (Math.hypot(x, z) > 360) continue;
        if (bway) { for (const e of [-3.4, 3.4]) { lampPts.push(x - dz * e, 5.5, z + dx * e); } pools.push([x, z, 13]); continue; }   // fixtures under the el
        side = -side; const o = side * (s.w / 2 + .75), px = x - dz * o, pz = z + dx * o, hx = x - dz * (o - side * 2.4), hz = z + dx * (o - side * 2.4);
        if (city.buildingAt(px, pz) || nearNode(px, pz, 5)) continue;
        furn.box(px, 4.4, pz, .16, 8.5, .16, rot, [.36, .38, .38]);
        furn.box((px + hx) / 2, 8.6, (pz + hz) / 2, .1, .1, 2.5, rot, [.36, .38, .38]);
        furn.box(hx, 8.5, hz, .34, .14, .75, rot, [.5, .52, .52]);
        lampPts.push(hx, 8.38, hz); pools.push([hx, hz, 11]);
      }
      acc -= l;
    }
  }
  // corner street-name signs
  const signB = new Map();
  for (const n of crossings) {
    if (Math.hypot(n.x, n.z) > 300) continue;
    const legs = [...n.legs].sort((p, q) => Math.atan2(p.dz, p.dx) - Math.atan2(q.dz, q.dx));
    for (let i = 0, done = 0; i < legs.length && done < 2; i++) {
      const A = legs[i], Bl = legs[(i + 1) % legs.length], sin = Math.abs(A.dx * Bl.dz - A.dz * Bl.dx);
      if (sin < .55 || A.s.n === Bl.s.n) continue; done++;
      const px = n.x + A.dx * (Bl.s.w / 2 + .9) / sin + Bl.dx * (A.s.w / 2 + .9) / sin, pz = n.z + A.dz * (Bl.s.w / 2 + .9) / sin + Bl.dz * (A.s.w / 2 + .9) / sin;
      if (city.buildingAt(px, pz)) continue;
      furn.box(px, 1.75, pz, .07, 3.5, .07, 0, [.45, .46, .46]);
      [A, Bl].forEach((leg, j) => {
        let b = signB.get(leg.s.n); if (!b) signB.set(leg.s.n, b = new Batch());
        const y = 3.05 + j * .27, hx = leg.dx * .62, hz = leg.dz * .62;
        b.quad([px - hx, y, pz - hz], [px + hx, y, pz + hz], [px + hx, y + .24, pz + hz], [px - hx, y + .24, pz - hz]);
        b.quad([px + hx, y, pz + hz], [px - hx, y, pz - hz], [px - hx, y + .24, pz - hz], [px + hx, y + .24, pz + hz]);
      });
      city.segGrid.add(px - .1, pz, px + .1, pz);
    }
  }
  for (const [name, b] of signB) scene.add(b.mesh(new THREE.MeshStandardMaterial({ map: streetSign(name), roughness: .5, emissive: 0xffffff, emissiveMap: streetSign(name), emissiveIntensity: .12 }), { cast: false }));
  scene.add(furn.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, metalness: .2 })));

  // lamp glow (night): bright points + additive pools on the pavement
  const gt = glow();
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(lampPts, 3));
  const pm = new THREE.PointsMaterial({ map: gt, size: 3.2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, sizeAttenuation: true });
  const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; scene.add(pts);
  const poolM = new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const poolG = new THREE.CircleGeometry(1, 20); poolG.rotateX(-Math.PI / 2);
  const poolI = new THREE.InstancedMesh(poolG, poolM, pools.length);
  pools.forEach(([x, z, r], i) => { M.compose(T.set(x, SWY + .05, z), Q.identity(), S.set(r, 1, r)); poolI.setMatrixAt(i, M); });
  poolI.frustumCulled = false; poolI.renderOrder = 2; scene.add(poolI);
  night.push(f => { pm.opacity = f; poolM.opacity = f * .85; pts.visible = poolI.visible = f > .01; });

  // ---- parked cars along the real pavement edge ----
  const cars = [], COLS = [[.72, .73, .75], [.1, .1, .11], [.88, .88, .87], [.3, .32, .35], [.45, .06, .07], [.1, .17, .34], [.52, .53, .55], [.62, .6, .52], [.8, .8, .8], [.16, .2, .18], [.4, .42, .46], [.05, .05, .06]];
  for (const line of data.curbs) {
    let next = 2.5 + R() * 3, acc = 0;
    for (let k = 0; k < line.length - 1; k++) {
      const a = line[k], b = line[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < .05) continue;
      const dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
      for (; next < acc + l; next += 5.5 + R() * 1.3) {
        const d = next - acc, cx = a[0] + dx * d, cz = a[1] + dz * d;
        if (R() > .78 || Math.hypot(cx, cz) > 330) continue;
        const w1 = onWalk(cx - dz * 1.3, cz + dx * 1.3), w2 = onWalk(cx + dz * 1.3, cz - dx * 1.3); if (w1 === w2) continue;
        const sgn = w1 ? -1 : 1, x = cx - dz * sgn * 1.2, z = cz + dx * sgn * 1.2;
        if (nearNode(x, z, 15) || onWalk(x, z) || city.buildingAt(x, z)) continue;
        if (data.hydrants.some(h => Math.abs(h[0] - x) < 4 && Math.abs(h[1] - z) < 4)) continue;       // nobody parks on the pump
        if (cars.some(c => Math.abs(c.x - x) < 4.6 && Math.abs(c.z - z) < 4.6 && Math.hypot(c.x - x, c.z - z) < 4.6)) continue;
        cars.push({ x, z, rot: Math.atan2(-dz, dx) + (sgn > 0 ? Math.PI : 0), type: R(), col: COLS[R() * COLS.length | 0] });
      }
      acc += l;
    }
  }
  const cg = carGeometry();
  const carM = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .4, metalness: .25 }), cars.length);
  cars.forEach((c, i) => {
    const sy = c.type < .4 ? 1.2 : c.type > .92 ? 1.42 : 1, sx = c.type > .92 ? 1.12 : c.type < .4 ? 1.04 : 1;
    Q.setFromAxisAngle(T.set(0, 1, 0), c.rot); M.compose(T.set(c.x, 0, c.z), Q, S.set(sx, sy, 1)); carM.setMatrixAt(i, M); carM.setColorAt(i, col.setRGB(...c.col));
    if (Math.hypot(c.x, c.z) < 220) { const co = Math.cos(c.rot) * 2.1, sn = -Math.sin(c.rot) * 2.1, wx = -sn / 2.1 * .85, wz = co / 2.1 * .85;
      const p = [[c.x - co - wx, c.z - sn - wz], [c.x + co - wx, c.z + sn - wz], [c.x + co + wx, c.z + sn + wz], [c.x - co + wx, c.z - sn + wz]];
      for (let q = 0; q < 4; q++) city.segGrid.add(p[q][0], p[q][1], p[(q + 1) % 4][0], p[(q + 1) % 4][1]); }
  });
  carM.castShadow = true; carM.receiveShadow = true; carM.frustumCulled = false; scene.add(carM);

  scene.add(paint.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { cast: false }));
  return { night, onWalk, streets, crossings, carGeo: cg, counts: { trees: trees.length, cars: cars.length, lamps: pools.length } };
}

// low-poly car: body takes the instance colour, glass + tyres stay dark
export function carGeometry() {
  const b = new Batch(), W = [1, 1, 1], G = [.2, .25, .31], K = [.035, .035, .04], T = [.5, .5, .5];
  b.box(0, .56, 0, 4.4, .5, 1.78, 0, W);                                   // lower body
  b.box(0, .27, 0, 4.2, .12, 1.7, 0, K);                                   // sills / underside
  // glasshouse: trapezoid, body-coloured roof
  const y0 = .81, y1 = 1.38, xb0 = -1.5, xb1 = 1.0, xt0 = -1.05, xt1 = .35, zb = .86, zt = .7;
  const P = (x, y, z) => [x, y, z];
  for (const s of [1, -1]) {
    const q = [P(xb0, y0, s * zb), P(xb1, y0, s * zb), P(xt1, y1, s * zt), P(xt0, y1, s * zt)];
    s > 0 ? b.quad(q[0], q[1], q[2], q[3], null, G) : b.quad(q[1], q[0], q[3], q[2], null, G);
  }
  b.quad(P(xb1, y0, zb), P(xb1, y0, -zb), P(xt1, y1, -zt), P(xt1, y1, zt), null, G);       // windscreen
  b.quad(P(xb0, y0, -zb), P(xb0, y0, zb), P(xt0, y1, zt), P(xt0, y1, -zt), null, G);       // rear glass
  b.box((xt0 + xt1) / 2, y1 + .02, 0, xt1 - xt0 + .16, .07, zt * 2 + .06, 0, W);          // roof
  for (const s of [1, -1]) {                                               // pillars
    b.boxB([-.3, (y0 + y1) / 2, s * (zb + zt) / 2 + s * .01], [.05, 0, 0], [0, (y1 - y0) / 2, -s * (zb - zt) / 2], [0, 0, .02], W);
    b.boxB([(xb1 + xt1) / 2, (y0 + y1) / 2, s * (zb + zt) / 2 + s * .01], [.04, 0, 0], [(xt1 - xb1) / 2, (y1 - y0) / 2, -s * (zb - zt) / 2], [0, 0, .02], W);
    b.boxB([(xb0 + xt0) / 2, (y0 + y1) / 2, s * (zb + zt) / 2 + s * .01], [.05, 0, 0], [(xt0 - xb0) / 2, (y1 - y0) / 2, -s * (zb - zt) / 2], [0, 0, .02], W);
  }
  b.box(2.21, .6, 0, .04, .14, 1.5, 0, [1.7, 1.7, 1.5]); b.box(-2.21, .64, 0, .04, .12, 1.5, 0, [.8, .08, .08]);
  b.box(2.2, .38, 0, .1, .16, 1.74, 0, T); b.box(-2.2, .38, 0, .1, .16, 1.74, 0, T);       // bumpers
  for (const x of [-1.4, 1.4]) for (const z of [-.8, .8]) { b.box(x, .31, z, .56, .56, .22, 0, K); b.boxB([x, .31, z], [.2, .2, 0], [-.2, .2, 0], [0, 0, .11], K); b.box(x, .31, z + Math.sign(z) * .02, .26, .26, .22, 0, T); }
  return b.mesh(new THREE.MeshBasicMaterial()).geometry;
}
