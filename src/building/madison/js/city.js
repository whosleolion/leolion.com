// Buildings: real footprints + roof heights, facades styled from lot records (class, year, use).
import { THREE, rng, hashStr, pip, bbox, Batch, SegGrid } from './util.js';
import { STYLES, styleTextures, litWindows, signAtlas, SIGN_COUNT, GROUND, awning } from './textures.js';

const OVERRIDE = { '932 Madison Street': 'm932', '936 Madison Street': 'm936', '940 Madison Street': 'm940', '1434 Broadway': 'red', '1446 Broadway': 'orange' };

function pickStyle(b, r) {
  if (OVERRIDE[b.a]) return OVERRIDE[b.a];
  if (b.g) return 'cinder';
  const c = (b.c || '')[0], y = b.y || 1920;
  const w = (...o) => { let t = r() * o.reduce((s, e) => s + e[1], 0); for (const e of o) { if ((t -= e[1]) <= 0) return e[0]; } return o[0][0]; };
  if (y >= 1998) return w(['modernA', 4], ['modernB', 3], ['modernC', 2]);
  if (c === 'A' || c === 'B') return w(['brownstone', 30], ['darkred', 14], ['brown', 14], ['limestone', 10], ['sidingA', 12], ['sidingB', 10], ['sidingC', 10]);
  if (c === 'C' || c === 'D' || c === 'S' || c === 'R') return w(['red', 30], ['orange', 24], ['darkred', 12], ['brown', 12], ['tan', 20]);
  if ('KOEFG'.includes(c)) return w(['stucco', 4], ['tan', 3], ['cinder', 3]);
  return w(['tan', 4], ['red', 3], ['stucco', 3]);
}

export function buildCity(data, scene, env) {
  const B = data.buildings, cell = 24, bg = new Map(), key = (i, j) => i * 4096 + j;
  B.forEach((b, i) => {
    b.i = i; b.bb = bbox(b.p);
    b.cx = (b.bb[0] + b.bb[2]) / 2; b.cz = (b.bb[1] + b.bb[3]) / 2; b.dist = Math.hypot(b.cx, b.cz);
    for (let u = Math.floor(b.bb[0] / cell); u <= Math.floor(b.bb[2] / cell); u++)
      for (let v = Math.floor(b.bb[1] / cell); v <= Math.floor(b.bb[3] / cell); v++) {
        const k = key(u, v); let l = bg.get(k); if (!l) bg.set(k, l = []); l.push(b);
      }
  });
  const buildingAt = (x, z, ex) => {
    const l = bg.get(key(Math.floor(x / cell), Math.floor(z / cell))); if (!l) return null;
    for (const b of l) if (b !== ex && x >= b.bb[0] && x <= b.bb[2] && z >= b.bb[1] && z <= b.bb[3] && pip(x, z, b.p)) return b;
    return null;
  };
  // a wall faces the street if a ray along its normal reaches a street centreline before any building
  const facesStreet = (x, z, nx, nz, b) => {
    const hit = env.streetGrid.ray(x, z, nx, nz, 30); if (!hit) return null;
    for (let d = 1; d < hit.t; d += 2) if (buildingAt(x + nx * d, z + nz * d, b)) return null;
    return hit.s.ref;
  };

  const batches = new Map(), bat = k => { let v = batches.get(k); if (!v) batches.set(k, v = new Batch()); return v; };
  const trim = new Batch(), iron = new Batch(), signs = new Batch(), segGrid = new SegGrid(12), specials = [], awn = new Batch();
  const roofP = [], roofU = [], roofI = [];
  const [bx0, bz0] = data.bounds[0], [bx1, bz1] = data.bounds[1];
  const IRON = [.07, .07, .08];

  for (const b of B) {
    const r = rng(hashStr(b.bbl || 'b' + b.i)), style = b.style = pickStyle(b, r), st = STYLES[style];
    const rv = rng(b.i * 2654435761 + 17), t = .86 + rv() * .2, col = [t * (1 + (rv() - .5) * .07), t, t * (1 + (rv() - .5) * .07)];
    const h = b.h, com = b.com && !b.g, near = b.dist < 235;
    let F = b.f > 0 ? Math.round(b.f) : Math.max(1, Math.round(h / 3.2)), gh = Math.min(h, com ? 3.9 : 3.3);
    if (F > 1 && ((h - gh) / (F - 1) < 2.4 || (h - gh) / (F - 1) > 4.3)) F = Math.max(1, Math.round((h - gh) / 3.05)) + 1;
    if (F <= 1 || h < 5.2 || b.g) { F = 1; gh = h; }
    const upH = F > 1 ? (h - gh) / (F - 1) : 0;
    b.floors = F;
    const P = b.p, n = P.length;
    let escapes = 0;
    for (let k = 0; k < n; k++) {
      const a = P[k], c = P[(k + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
      if (L < .25) continue;
      segGrid.add(a[0], a[1], c[0], c[1], b);
      const nx = dz / L, nz = -dx / L, mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      const nb = buildingAt(mx + nx * .45, mz + nz * .45, b);
      let y0 = 0;
      if (nb) { if (nb.h >= h - .4) continue; y0 = nb.h; }
      const wall = (kind, ya, yb, u0, u1, v0, v1) => bat(style + ':' + kind).quad([c[0], ya, c[1]], [a[0], ya, a[1]], [a[0], yb, a[1]], [c[0], yb, c[1]], [u0, v0, u1, v1], col);
      const bays = Math.max(1, Math.round(L / 2.3)), off = (b.i + k) % 2;
      if (nb || b.g || L < 1.6) { wall('blank', y0, h, 0, L / 2.6, y0 / 2.6, h / 2.6); continue; }
      const fs = facesStreet(mx, mz, nx, nz, b), sp = L >= 3 && GROUND[b.a];
      if (!fs) {                    // rear / yard wall: plain windows
        if (F > 1) wall('up', 0, h, off, off + bays, 0, F); else wall('blank', 0, h, 0, L / 2.6, 0, h / 2.6);
        continue;
      }
      const rot = Math.atan2(-dz, dx), tx = dx / L, tz = dz / L;
      if (F === 1) { wall(com ? 'shop' : 'gr', 0, h, off, off + bays, 0, 1); }
      else {
        const goff = com ? off : (bays % 2 ? 1 : 0);
        if (sp) { const sb = new Batch(); sb.quad([c[0], 0, c[1]], [a[0], 0, a[1]], [a[0], gh, a[1]], [c[0], gh, c[1]]); specials.push([sb, sp(L, fs.n)]); }
        else wall(com ? 'shop' : 'gr', 0, gh, goff, goff + bays, 0, 1);
        wall('up', gh, h, off, off + bays, 0, F - 1);
        if (style === 'm932' && L > 9) {                                   // the two angled bays, their cornice, the moped shop's awning
          const pt = (f, d) => [c[0] - tx * L * f + nx * d, c[1] - tz * L * f + nz * d], D = .75, run = .95 / L, bw = 3.7 / L;
          for (const f0 of [.015, 1 - .015 - bw]) {
            const o = [pt(f0, 0), pt(f0 + run, D), pt(f0 + bw - run, D), pt(f0 + bw, 0)];
            for (let q = 0; q < 3; q++) {
              const A = o[q], B2 = o[q + 1], fl = Math.hypot(B2[0] - A[0], B2[1] - A[1]), fr = Math.atan2(-(A[1] - B2[1]), A[0] - B2[0]), fmx = (A[0] + B2[0]) / 2, fmz = (A[1] + B2[1]) / 2, fnx = -(B2[1] - A[1]) / fl * -1, fnz = (B2[0] - A[0]) / fl * -1;
              bat('m932:up').quad([A[0], gh, A[1]], [B2[0], gh, B2[1]], [B2[0], h, B2[1]], [A[0], h, A[1]], [q, 0, q + 1, F - 1], col);
              trim.box(fmx, h - .2, fmz, fl + .35, .5, .5, fr, st.cornice); trim.box(fmx, h - .62, fmz, fl + .2, .34, .3, fr, st.cornice.map(v => v * 1.3));
            }
            for (const y of [gh, h]) { trim.tri([o[0][0], y, o[0][1]], [o[1][0], y, o[1][1]], [o[2][0], y, o[2][1]], st.cornice); trim.tri([o[0][0], y, o[0][1]], [o[2][0], y, o[2][1]], [o[3][0], y, o[3][1]], st.cornice);
              trim.tri([o[2][0], y, o[2][1]], [o[1][0], y, o[1][1]], [o[0][0], y, o[0][1]], st.cornice); trim.tri([o[3][0], y, o[3][1]], [o[2][0], y, o[2][1]], [o[0][0], y, o[0][1]], st.cornice); }
          }
          for (let q = .25; q < L; q += .5) { const e = pt(q / L, .34); trim.box(e[0], h - .78, e[1], .14, .34, .22, rot, st.cornice.map(v => v * .75)); }
          const l0 = pt(.012, 0), r0 = pt(.47, 0), l1 = pt(.012, 1.0), r1 = pt(.47, 1.0), yh = gh - .28, yl = gh - 1.3;
          awn.quad([l1[0], yl, l1[1]], [r1[0], yl, r1[1]], [r0[0], yh, r0[1]], [l0[0], yh, l0[1]], [0, .24, 1, 1]);
          awn.quad([l1[0], yl - .24, l1[1]], [r1[0], yl - .24, r1[1]], [r1[0], yl, r1[1]], [l1[0], yl, l1[1]], [0, 0, 1, .22]);
          awn.quad([l0[0], yl - .24, l0[1]], [l1[0], yl - .24, l1[1]], [l1[0], yl, l1[1]], [l0[0], yh, l0[1]], [0, 0, .02, .1]); awn.quad([r1[0], yl - .24, r1[1]], [r0[0], yl - .24, r0[1]], [r0[0], yh, r0[1]], [r1[0], yl, r1[1]], [0, 0, .02, .1]);
        }
        if (st.kind !== 'modern') {
          trim.box(mx + nx * .2, h - .22, mz + nz * .2, L + .3, .5, .46, rot, st.cornice);
          trim.box(mx + nx * .1, h - .62, mz + nz * .1, L + .1, .3, .2, rot, st.cornice.map(v => v * 1.25));
          trim.box(mx + nx * .05, gh, mz + nz * .05, L, .2, .14, rot, st.cornice.map(v => v * 1.6));
        } else trim.box(mx + nx * .04, h - .12, mz + nz * .04, L + .1, .24, .16, rot, [.16, .16, .17]);
        if (near && !com && st.kind !== 'modern' && b.y < 1965) {         // stoop at each door bay
          for (let j = 0; j < bays; j++) if ((goff + j) % 2 === 0) {
            const f = (j + .5) / bays, sx = c[0] - tx * L * f, sz = c[1] - tz * L * f, sc = st.kind === 'stone' ? [.36, .25, .2] : [.55, .53, .5];
            for (let s = 0; s < 3; s++) trim.box(sx + nx * (.17 + s * .3), .15 + (3 - s) * .09, sz + nz * (.17 + s * .3), 1.5, (3 - s) * .18, .32, rot, sc);
            for (const e of [-.82, .82]) trim.box(sx + nx * .5 + tx * e, .6, sz + nz * .5 + tz * e, .12, .9, 1.0, rot, sc.map(v => v * .8));
          }
        }
        // fire escape on walk-up apartment fronts
        if (near && b.dist < 200 && 'CSD'.includes((b.c || ' ')[0]) && b.y < 1955 && F >= 3 && L >= 5.5 && escapes < 2) {
          escapes++;
          const f = style === 'm932' ? .5 : .5 + ((b.i % 3) - 1) * .12, ex = c[0] - tx * L * f, ez = c[1] - tz * L * f, W = 3.1, D = .95;
          for (let fl = 1; fl < F; fl++) {
            const y = gh + (fl - 1) * upH + .12, px = ex + nx * (D / 2 + .05), pz = ez + nz * (D / 2 + .05);
            iron.box(px, y, pz, W, .06, D, rot, IRON);
            iron.box(ex + nx * (D + .03), y + .95, ez + nz * (D + .03), W, .05, .05, rot, IRON);
            iron.box(ex + nx * (D + .03), y + .5, ez + nz * (D + .03), W, .03, .03, rot, IRON);
            for (const e of [-1, 1]) iron.box(px + tx * e * W / 2, y + .95, pz + tz * e * W / 2, .05, .05, D, rot, IRON);
            for (let q = 0; q <= 6; q++) iron.box(ex + nx * (D + .03) + tx * (q / 6 - .5) * W, y + .48, ez + nz * (D + .03) + tz * (q / 6 - .5) * W, .03, .95, .03, rot, IRON);
            if (fl < F - 1) {                                              // stair up to the next landing
              const dir = fl % 2 ? 1 : -1, run = 1.9, cxs = px + nx * .12, czs = pz + nz * .12;
              iron.boxB([cxs, y + upH / 2, czs], [tx * dir * run / 2, upH / 2, tz * dir * run / 2], [0, .03, 0], [nx * .3, 0, nz * .3], IRON);
              iron.boxB([cxs + nx * .3, y + upH / 2 + .8, czs + nz * .3], [tx * dir * run / 2, upH / 2, tz * dir * run / 2], [0, .02, 0], [nx * .02, 0, nz * .02], IRON);
            }
          }
          iron.box(ex + nx * (D * .6) + tx * 1.2, gh - .9, ez + nz * (D * .6) + tz * 1.2, .4, 2.1, .04, rot, IRON);   // drop ladder
        }
      }
      if (com && !sp && b.dist < 300 && L >= 3.5) {                               // shop sign bands
        const ns = Math.max(1, Math.round(L / 6.5)), sw = L / ns;
        for (let s = 0; s < ns; s++) {
          const id = (hashStr((b.bbl || '') + k + s) >>> 3) % SIGN_COUNT, f0 = s / ns, f1 = (s + 1) / ns, y = Math.min(gh, h) - .82;
          const px = t2 => [c[0] - tx * (L * (f0 + (f1 - f0) * t2)) + nx * .2, c[1] - tz * (L * (f0 + (f1 - f0) * t2)) + nz * .2];
          const A = px(.04), Bp = px(.96), u = (id % 2) * .5, v = 1 - ((id >> 1) + 1) / 8;
          signs.quad([A[0], y, A[1]], [Bp[0], y, Bp[1]], [Bp[0], y + .78, Bp[1]], [A[0], y + .78, A[1]], [u + .004, v + .004, u + .496, v + .121]);
          trim.box((A[0] + Bp[0]) / 2 - nx * .1, y + .39, (A[1] + Bp[1]) / 2 - nz * .1, sw * .94, .86, .2, rot, [.1, .1, .11]);
        }
      }
    }
    // roof, textured straight from the orthophoto
    const tris = THREE.ShapeUtils.triangulateShape(P.map(p => new THREE.Vector2(p[0], p[1])), []);
    const base = roofP.length / 3;
    for (const p of P) { roofP.push(p[0], h, p[1]); roofU.push((p[0] - bx0) / (bx1 - bx0), 1 - (p[1] - bz0) / (bz1 - bz0)); }
    for (const tr of tris) {
      const [i0, i1, i2] = tr, a = P[i0], bb = P[i1], cc = P[i2];
      const up = (bb[1] - a[1]) * (cc[0] - a[0]) - (bb[0] - a[0]) * (cc[1] - a[1]) > 0;
      roofI.push(base + i0, base + (up ? i1 : i2), base + (up ? i2 : i1));
    }
    if (near && F >= 3 && pip(b.cx, b.cz, P)) {                            // stair bulkhead + chimney
      trim.box(b.cx, h + 1.2, b.cz, 2.6, 2.4, 3.2, rv() * 3, [.3, .29, .28]);
      trim.box(b.cx + (rv() - .5) * 3, h + .7, b.cz + (rv() - .5) * 3, .7, 1.4, .7, 0, [.33, .2, .16]);
    }
  }

  const nightMats = [], lit = { false: litWindows(false), true: litWindows(true) };
  for (const [k, batch] of batches) {
    const [style, kind] = k.split(':'), T = styleTextures(style);
    const m = new THREE.MeshStandardMaterial({ map: T[kind], vertexColors: true, roughness: .93, metalness: 0 });
    if (kind === 'up') { m.emissiveMap = lit[T.wide]; m.emissive = new THREE.Color(1, 1, 1); m.emissiveIntensity = 0; nightMats.push(m); }
    if (kind === 'shop') { m.emissiveMap = T.shopLit; m.emissive = new THREE.Color(1, .82, .6); m.emissiveIntensity = 0; m.userData.nightScale = .38; nightMats.push(m); }
    scene.add(batch.mesh(m));
  }
  for (const [sb, map] of specials) { const m = new THREE.MeshStandardMaterial({ map, roughness: .85, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0 }); m.userData.nightScale = .3; nightMats.push(m); scene.add(sb.mesh(m)); }
  if (awn.count) scene.add(awn.mesh(new THREE.MeshStandardMaterial({ map: awning('MOPEDS!'), roughness: .7, side: THREE.DoubleSide })));
  scene.add(trim.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 })));
  scene.add(iron.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }), { receive: false }));
  const signMat = new THREE.MeshStandardMaterial({ map: signAtlas(), roughness: .6, emissive: 0xffffff, emissiveIntensity: 0 });
  signMat.emissiveMap = signMat.map; nightMats.push(signMat); signMat.userData.nightScale = .55;
  scene.add(signs.mesh(signMat, { cast: false }));

  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(roofP, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(roofU, 2));
  rg.setIndex(roofI); rg.computeVertexNormals();
  const roof = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: env.ortho, roughness: 1, color: 0xd8d8d8 }));
  roof.castShadow = true; roof.receiveShadow = true; roof.matrixAutoUpdate = false; scene.add(roof);

  return { segGrid, buildingAt, nightMats };
}
