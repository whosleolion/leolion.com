// Third-person orbit camera: shoulder offset, wall collision, shake, punch-in
// on big hits, speed-scaled FOV, look-ahead while running, roll while
// wall-running, Arkham-style framing that pulls back to fit the fight,
// auto-follow on gamepad/touch, and the synchronization sweep.
import { T } from './tuning.js';

export class CameraRig {
  constructor(camera, G) {
    this.camera = camera; this.G = G;
    this.yaw = Math.PI; this.pitch = 0.28;
    this.dist = T.camDist;
    this.pivot = null;
    this.shakeAmt = 0; this.punchAmt = 0; this.roll = 0;
    this.ahead = { x: 0, z: 0 };
    this.syncT = -1;
    this.idleLook = 0;
  }

  reset(yaw) { this.yaw = yaw + Math.PI; this.pitch = 0.28; this.pivot = null; this.syncT = -1; this.ahead = { x: 0, z: 0 }; }
  shake(a) { this.shakeAmt = Math.min(1, Math.max(this.shakeAmt, a)); }
  punch(a) { this.punchAmt = Math.min(1, Math.max(this.punchAmt, a)); }
  startSync() { this.syncT = 0; }

  update(dt) {
    const G = this.G, P = G.player, inp = G.input, cam = this.camera;
    const look = inp.look;
    const s = T.mouseSens;
    if (this.syncT < 0) {
      this.yaw -= look.x * s;
      this.pitch = Math.max(-0.65, Math.min(1.25, this.pitch + look.y * s));
    }
    if (Math.abs(look.x) + Math.abs(look.y) > 0.0005) this.idleLook = 0; else this.idleLook += dt;

    // gamepad / touch: drift behind the runner when the player isn't steering the camera
    if (inp.lastDevice !== 'kbm' && this.idleLook > 0.8 && P.speedXZ > 2 && P.state === 'ground' && !P.lockTarget) {
      let d = (P.yaw + Math.PI - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 1.2);
    }

    const h = P.state === 'dead' ? 0.5 : P.crouch || P.hidden ? 1.15 : 1.55;
    // look a little ahead of where you're running
    const sp = P.speedXZ, la = P.state === 'climb' ? 0 : Math.min(1, sp / 9) * 0.9;
    const ka = 1 - Math.exp(-3 * dt);
    this.ahead.x += ((sp > 0.5 ? P.vel.x / sp : 0) * la - this.ahead.x) * ka;
    this.ahead.z += ((sp > 0.5 ? P.vel.z / sp : 0) * la - this.ahead.z) * ka;
    let tx = P.pos.x + this.ahead.x, ty = P.pos.y + h, tz = P.pos.z + this.ahead.z;
    // fight framing: lean the pivot toward the target, pull back with the crowd
    let want = T.camDist;
    if (P.lockTarget) {
      const e = P.lockTarget;
      tx += (e.pos.x - P.pos.x) * 0.3; tz += (e.pos.z - P.pos.z) * 0.3;
      const crowd = G.enemies.filter((x) => x.alive && x.state === 'combat' && Math.hypot(x.pos.x - P.pos.x, x.pos.z - P.pos.z) < 10).length;
      want *= 1.15 + Math.min(3, crowd) * 0.08;
    }
    if (!this.pivot) this.pivot = { x: tx, y: ty, z: tz };
    const kxz = 1 - Math.exp(-(P.lockTarget ? 8 : 22) * dt), ky = 1 - Math.exp(-(P.state === 'climb' ? 14 : 9) * dt);
    this.pivot.x += (tx - this.pivot.x) * kxz;
    this.pivot.z += (tz - this.pivot.z) * kxz;
    this.pivot.y += (ty - this.pivot.y) * ky;

    if (P.sprinting) want *= 1.08 + 0.06 * P.flow;
    if (P.state === 'climb') want *= 1.15;
    let pitch = this.pitch;
    if (this.syncT >= 0) {
      this.syncT += dt;
      this.yaw += dt * 1.85;
      want = 8.5; pitch = 0.3;
      if (this.syncT > 3.4) this.syncT = -1;
    }
    want *= 1 - 0.18 * this.punchAmt;
    this.punchAmt = Math.max(0, this.punchAmt - dt * 3);
    this.dist += (want - this.dist) * (1 - Math.exp(-(this.punchAmt > 0 ? 14 : 4) * dt));

    const cp = Math.cos(pitch);
    const dx = Math.sin(this.yaw) * cp, dy = Math.sin(pitch), dz = Math.cos(this.yaw) * cp;
    // shoulder offset (right of the view), pulled in if it would clip a wall
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let sh = 0.45;
    const sideHit = G.world.raycast(this.pivot.x, this.pivot.y, this.pivot.z, rx, 0, rz, sh + 0.2);
    if (sideHit) sh = Math.max(0, sideHit.t - 0.2);
    const ox = this.pivot.x + rx * sh, oy = this.pivot.y, oz = this.pivot.z + rz * sh;
    const hit = G.world.raycast(ox, oy, oz, dx, dy, dz, this.dist + 0.3);
    const d = hit ? Math.max(0.4, hit.t - 0.3) : this.dist;

    let sx = 0, sy = 0;
    if (this.shakeAmt > 0) {
      const a = this.shakeAmt * this.shakeAmt * 0.35;
      sx = (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    }
    cam.position.set(ox + dx * d + sx * rx, oy + dy * d + sy, oz + dz * d + sx * rz);
    cam.lookAt(ox, oy + 0.1, oz);
    // roll with the wall while wall-running
    let rollT = 0;
    if (P.state === 'wallrun') {
      const w = P.wr; // tilt the top of the view toward the wall
      rollT = (w.nx * rx + w.nz * rz) * 0.12;
    }
    this.roll += (rollT - this.roll) * (1 - Math.exp(-6 * dt));
    if (Math.abs(this.roll) > 0.001) cam.rotateZ(this.roll);
    P.rig.root.visible = d > 0.85; // camera jammed against a wall: don't fill the screen with hood

    const speedK = Math.max(0, Math.min(1, (sp - 5) / 6));
    const fov = 66 + 12 * speedK * (P.state === 'climb' ? 0 : 1) + (P.state === 'wallrun' ? 5 : 0) - 6 * this.punchAmt;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * (1 - Math.exp(-5 * dt)); cam.updateProjectionMatrix(); }
    this.speedK = P.state === 'climb' ? 0 : speedK;
  }
}
