// Cheap visual feedback: particle bursts (dust, sparks), expanding noise
// rings on the ground (so you can *see* how loud you are), and attack slash
// arcs. Everything comes from small fixed pools; nothing is allocated per hit.
import * as THREE from './vendor/three.module.min.js';

const PARTS = 160, RINGS = 12, SLASHES = 6;

export class Fx {
  constructor(scene) {
    this.scene = scene;
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.parts = [];
    for (let i = 0; i < PARTS; i++) {
      const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.parts.push({ m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, size: 0.1, spin: 0 });
    }
    this.pi = 0;
    const ring = new THREE.RingGeometry(0.92, 1, 48); ring.rotateX(-Math.PI / 2);
    this.rings = [];
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.renderOrder = 2; scene.add(m);
      this.rings.push({ m, life: 0, max: 1, r: 1 });
    }
    this.ri = 0;
    // a flat crescent, rotated into place per swing
    const arc = new THREE.RingGeometry(1.0, 1.55, 24, 1, -0.9, 1.8); arc.rotateX(-Math.PI / 2);
    this.slashes = [];
    for (let i = 0; i < SLASHES; i++) {
      const m = new THREE.Mesh(arc, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      m.visible = false; m.renderOrder = 3; scene.add(m);
      this.slashes.push({ m, life: 0, max: 0.18 });
    }
    this.si = 0;
  }

  burst(x, y, z, n, { color = 0xffffff, speed = 3, up = 2, life = 0.5, size = 0.08, g = 9, spread = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      const p = this.parts[this.pi = (this.pi + 1) % PARTS];
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      p.m.position.set(x + (Math.random() - 0.5) * 0.3 * spread, y, z + (Math.random() - 0.5) * 0.3 * spread);
      p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = up * (0.5 + Math.random());
      p.life = p.max = life * (0.6 + Math.random() * 0.6);
      p.size = size * (0.6 + Math.random() * 0.8); p.g = g; p.spin = (Math.random() - 0.5) * 20;
      p.m.material.color.setHex(color); p.m.visible = true;
    }
  }
  dust(x, y, z, n = 10, speed = 2.5) { this.burst(x, y + 0.05, z, n, { color: 0xc9c4b8, speed, up: 0.8, life: 0.55, size: 0.14, g: 1.5 }); }
  sparks(x, y, z, n = 10, color = 0xffffff) { this.burst(x, y, z, n, { color, speed: 6, up: 3, life: 0.28, size: 0.05, g: 14 }); }

  ring(x, y, z, r, color = 0xffffff, life = 0.6) {
    const q = this.rings[this.ri = (this.ri + 1) % RINGS];
    q.m.position.set(x, y + 0.06, z); q.r = r; q.life = q.max = life;
    q.m.material.color.setHex(color); q.m.visible = true;
  }

  slash(x, y, z, yaw, tilt = 0, color = 0xffffff, scale = 1) {
    const s = this.slashes[this.si = (this.si + 1) % SLASHES];
    s.m.position.set(x, y, z);
    s.m.rotation.set(tilt, yaw - Math.PI / 2, 0, 'YXZ');
    s.m.scale.setScalar(scale);
    s.m.material.color.setHex(color);
    s.life = s.max; s.m.visible = true;
  }

  update(dt) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      p.vy -= p.g * dt;
      const k = Math.exp(-2.5 * dt); p.vx *= k; p.vz *= k;
      p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.02, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
      p.m.rotation.x += p.spin * dt; p.m.rotation.y += p.spin * dt;
      const u = p.life / p.max;
      p.m.scale.setScalar(p.size * (0.5 + u));
      p.m.material.opacity = Math.min(1, u * 1.6);
    }
    for (const q of this.rings) {
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) { q.m.visible = false; continue; }
      const u = 1 - q.life / q.max;
      q.m.scale.setScalar(Math.max(0.01, q.r * (0.15 + 0.85 * Math.sqrt(u))));
      q.m.material.opacity = 0.55 * (1 - u);
    }
    for (const s of this.slashes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.m.visible = false; continue; }
      s.m.material.opacity = 0.9 * (s.life / s.max);
    }
  }
}
