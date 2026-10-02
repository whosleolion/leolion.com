// Third-person orbit camera: shoulder offset, wall collision, shake, FOV
// kick when freerunning, auto-follow on gamepad/touch, and the
// synchronization sweep.
import { T } from './tuning.js';

export class CameraRig {
  constructor(camera, G) {
    this.camera = camera; this.G = G;
    this.yaw = Math.PI; this.pitch = 0.28;
    this.dist = T.camDist;
    this.pivot = null;
    this.shakeAmt = 0;
    this.syncT = -1;
    this.idleLook = 0;
  }

  reset(yaw) { this.yaw = yaw + Math.PI; this.pitch = 0.28; this.pivot = null; this.syncT = -1; }
  shake(a) { this.shakeAmt = Math.min(1, Math.max(this.shakeAmt, a)); }
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
    const tx = P.pos.x, ty = P.pos.y + h, tz = P.pos.z;
    if (!this.pivot) this.pivot = { x: tx, y: ty, z: tz };
    const kxz = 1 - Math.exp(-22 * dt), ky = 1 - Math.exp(-(P.state === 'climb' ? 14 : 9) * dt);
    this.pivot.x += (tx - this.pivot.x) * kxz;
    this.pivot.z += (tz - this.pivot.z) * kxz;
    this.pivot.y += (ty - this.pivot.y) * ky;

    let want = T.camDist;
    if (P.lockTarget) want *= 1.2;
    if (P.sprinting) want *= 1.08;
    if (P.state === 'climb') want *= 1.15;
    let pitch = this.pitch;
    if (this.syncT >= 0) {
      this.syncT += dt;
      this.yaw += dt * 1.85;
      want = 8.5; pitch = 0.3;
      if (this.syncT > 3.4) this.syncT = -1;
    }
    this.dist += (want - this.dist) * (1 - Math.exp(-4 * dt));

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
    P.rig.root.visible = d > 0.85; // camera jammed against a wall: don't fill the screen with hood

    const fov = 68 + (P.sprinting && P.state !== 'climb' ? 8 : 0) + (P.state === 'wallrun' ? 6 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * (1 - Math.exp(-5 * dt)); cam.updateProjectionMatrix(); }
  }
}
