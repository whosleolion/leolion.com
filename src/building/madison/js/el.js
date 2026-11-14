// The elevated Jamaica Line over Broadway (steel bents on the real street centreline), J trains, Broadway traffic.
import { THREE, rng, Batch, clamp } from './util.js';
import { steel, ties, trainSide, trainEnd } from './textures.js';

const LAT = 4.4, COL_H = 5.6, BENT = 15.24, DECK_Y = 7.32, TRACK = 1.9, CAR_L = 18.4;

export function buildEl(data, scene, env, city, street) {
  const pts = data.el, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = s => {                              // point + tangent at arclength s (extrapolates past the ends)
    let i = 1; while (i < pts.length - 1 && cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i], l = cum[i] - cum[i - 1], f = (s - cum[i - 1]) / l, tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
    return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, tx, tz, rot: Math.atan2(-tz, tx) };
  };
  let s0 = 0, best = 1e9;
  for (let s = 0; s < total; s += 2) { const p = at(s), d = Math.hypot(p.x, p.z); if (d < best) { best = d; s0 = s; } }
  const sA = Math.max(0, s0 - 520), sB = Math.min(total, s0 + 520);

  const st = new Batch(), deck = new Batch(), G = [1, 1, 1], D = [.72, .72, .72], RUST = [.5, .36, .3], BASE = [1.5, 1.5, 1.45];
  const UV = .33;
  let prev = null;
  for (let s = sA; s <= sB + .1; s += BENT) {
    const p = at(s), lx = -p.tz, lz = p.tx, rotL = Math.atan2(-lz, lx), W = (l, y, o = 0) => [p.x + lx * l + p.tx * o, y, p.z + lz * l + p.tz * o];
    for (const e of [-1, 1]) {
      const cx = p.x + lx * LAT * e, cz = p.z + lz * LAT * e;
      st.box(cx, COL_H / 2, cz, .5, COL_H, .56, p.rot, G, UV);
      st.box(cx, .45, cz, .95, .9, .95, p.rot, BASE, UV);
      if (Math.hypot(cx, cz) < 260) for (const [a, b, c, d] of [[-.5, -.5, .5, -.5], [.5, -.5, .5, .5], [.5, .5, -.5, .5], [-.5, .5, -.5, -.5]]) city.segGrid.add(cx + a, cz + b, cx + c, cz + d);
      // arched knee brace (two riveted plates)
      const li = (LAT - .25) * e, r = 1.75, N = 7;
      for (const o of [-.2, .2]) for (let i = 0; i < N; i++) {
        const f0 = i / N * Math.PI / 2, f1 = (i + 1) / N * Math.PI / 2;
        const A = W(li - e * r + e * r * Math.cos(f0), COL_H - r + r * Math.sin(f0), o), B2 = W(li - e * r + e * r * Math.cos(f1), COL_H - r + r * Math.sin(f1), o);
        st.tri(W(li, COL_H, o), A, B2, D);
      }
    }
    st.box(p.x, COL_H + .65, p.z, LAT * 2 + .7, 1.3, .5, rotL, G, UV);                    // cross girder
    st.box(p.x, COL_H - .03, p.z, LAT * 2 + .7, .07, .7, rotL, D, UV);
    if (prev) {
      const mx = (p.x + prev.x) / 2, mz = (p.z + prev.z) / 2, len = Math.hypot(p.x - prev.x, p.z - prev.z), rot = Math.atan2(-(p.z - prev.z), p.x - prev.x);
      for (const l of [-TRACK - .72, -TRACK + .72, TRACK - .72, TRACK + .72]) {            // stringers under each rail
        st.box(mx + lx * l, 6.55, mz + lz * l, len, 1.3, .1, rot, D, UV);
        st.box(mx + lx * l, 5.93, mz + lz * l, len, .06, .36, rot, D, UV);
        st.box(mx + lx * l, DECK_Y + .1, mz + lz * l, len, .14, .08, rot, RUST);
      }
      for (const l of [-LAT - .25, LAT + .25]) {                                           // fascia girders + handrail
        st.box(mx + lx * l, 6.6, mz + lz * l, len, 1.5, .12, rot, G, UV);
        st.box(mx + lx * l, DECK_Y + 1.05, mz + lz * l, len, .06, .06, rot, D);
        for (let q = 0; q < 6; q++) st.box(prev.x + (p.x - prev.x) * (q + .5) / 6 + lx * l, DECK_Y + .5, prev.z + (p.z - prev.z) * (q + .5) / 6 + lz * l, .06, 1.1, .06, rot, D);
      }
      for (let q = 1; q < 3; q++) st.box(prev.x + (p.x - prev.x) * q / 3, 6.5, prev.z + (p.z - prev.z) * q / 3, LAT * 2 + .5, .7, .08, rotL, D, UV);   // cross frames
      const a = [prev.x + prev.lx * (LAT + .4), DECK_Y, prev.z + prev.lz * (LAT + .4)], b = [prev.x - prev.lx * (LAT + .4), DECK_Y, prev.z - prev.lz * (LAT + .4)];
      const c = [p.x - lx * (LAT + .4), DECK_Y, p.z - lz * (LAT + .4)], d = [p.x + lx * (LAT + .4), DECK_Y, p.z + lz * (LAT + .4)];
      deck.quad(a, b, c, d, [0, 0, 1, len / .56]);
    }
    prev = { ...p, lx, lz };
  }
  const sm = new THREE.MeshStandardMaterial({ map: steel(), vertexColors: true, roughness: .7, metalness: .25, side: THREE.DoubleSide });
  scene.add(st.mesh(sm));
  const tt = ties(), dm = new THREE.MeshStandardMaterial({ map: tt, alphaTest: .5, side: THREE.DoubleSide, roughness: 1 });
  const dmesh = deck.mesh(dm);
  dmesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tt, alphaTest: .5 });
  scene.add(dmesh);

  // ---- trains ----
  const [sideT, sideE] = trainSide(), [endT, endE] = trainEnd();
  const sideM = new THREE.MeshStandardMaterial({ map: sideT, emissiveMap: sideE, emissive: 0xffffff, emissiveIntensity: .5, roughness: .35, metalness: .7 });
  const endM = new THREE.MeshStandardMaterial({ map: endT, emissiveMap: endE, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: .5 });
  const roofM = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: .6, metalness: .5 });
  const carG = new THREE.BoxGeometry(CAR_L - .5, 3.35, 2.95), bogie = new THREE.BoxGeometry(2.6, .7, 2.2), bogM = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: .8 });
  const span = sB - sA + 360, SPEED = 13.5, CYCLE = Math.max(96, span / SPEED + 14);
  const trains = [1, -1].map((dir, i) => {
    const cars = [];
    for (let c = 0; c < 4; c++) {
      const m = new THREE.Mesh(carG, [endM, endM, roofM, roofM, sideM, sideM]); m.castShadow = true;
      for (const o of [-6, 6]) { const b = new THREE.Mesh(bogie, bogM); b.position.set(o, -1.95, 0); m.add(b); }
      scene.add(m); cars.push(m);
    }
    return { dir, cars, offset: i * CYCLE / 2 + 20, s: 0, active: false };
  });
  const placeTrain = (tr, time) => {
    const ph = (time + tr.offset) % CYCLE, d = ph * SPEED; tr.active = d < span;
    const head = tr.dir > 0 ? sA - 180 + d : sB + 180 - d; tr.s = head;
    tr.cars.forEach((m, c) => {
      m.visible = tr.active; if (!tr.active) return;
      const p = at(head - tr.dir * (c * CAR_L + CAR_L / 2)), l = TRACK * tr.dir;
      m.position.set(p.x - p.tz * l, DECK_Y + .16 + 2.25, p.z + p.tx * l); m.rotation.y = p.rot + (tr.dir < 0 ? Math.PI : 0);
    });
  };

  // ---- Broadway traffic ----
  const R = rng(51), movers = [], laneLen = sB - sA - 120;
  const cols = [0xc9cdd1, 0x18191b, 0xf2f2f0, 0x8a1c1c, 0x23406b, 0x6a6d70, 0xe9c531];
  for (let i = 0; i < 9; i++) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, color: cols[i % cols.length], roughness: .4, metalness: .25 });
    const m = new THREE.Mesh(street.carGeo, mat); m.castShadow = true; scene.add(m);
    const lights = new THREE.Mesh(new THREE.BoxGeometry(.08, .16, 1.5), new THREE.MeshBasicMaterial({ color: 0xfff1c9, fog: false })); lights.position.set(2.18, .55, 0); m.add(lights);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(.08, .12, 1.5), new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false })); tail.position.set(-2.18, .6, 0); m.add(tail);
    movers.push({ m, dir: i % 2 ? 1 : -1, off: (i >> 1) / 5 * laneLen + R() * 30, v: i % 2 ? 9.4 : 8.6 });
  }

  const state = { trainDist: 1e9, trainX: 0, trainZ: 0, trainS: 0 };
  function update(time, px, pz, nightF) {
    state.trainDist = 1e9;
    for (const tr of trains) {
      placeTrain(tr, time); if (!tr.active) continue;
      for (const m of tr.cars) { const d = Math.hypot(m.position.x - px, m.position.z - pz, 6); if (d < state.trainDist) { state.trainDist = d; state.trainX = m.position.x; state.trainZ = m.position.z; state.trainS = tr.s; } }
    }
    sideM.emissiveIntensity = .35 + nightF * 1.3; endM.emissiveIntensity = 1 + nightF * 1.5;
    for (const c of movers) {
      const d = (c.off + time * c.v) % laneLen, s = c.dir > 0 ? sA + 60 + d : sB - 60 - d, p = at(s), l = 1.75 * c.dir;
      c.m.position.set(p.x - p.tz * l, 0, p.z + p.tx * l); c.m.rotation.y = p.rot + (c.dir < 0 ? Math.PI : 0);
    }
    return state;
  }
  // is (x,z) under the structure? (for sound + mood)
  const under = (x, z) => { let d = 1e9; for (let s = Math.max(sA, s0 - 300); s < Math.min(sB, s0 + 300); s += 6) { const p = at(s); d = Math.min(d, Math.hypot(p.x - x, p.z - z)); } return clamp(1 - (d - 4) / 8, 0, 1); };
  return { update, under, at, s0 };
}
