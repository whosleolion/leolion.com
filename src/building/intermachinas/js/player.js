// Player: freerun / climb / wall-run / vault, stealth (crouch + hiding),
// melee combos, counters and assassinations.
//
// Locomotion states: ground | air | climb | wallrun | scripted | sync | dead
// Ground "actions" layer on top: attack | dodge | hurt | land | slide | recoil
import { T } from './tuning.js';
import { Rig, Poses } from './rig.js';
import { sfx } from './audio.js';

const R = 0.35, H = 1.8, HC = 1.2, CHEST = 1.3;
const TAU = Math.PI * 2;

const ATTACKS = {
  L1:     { dur: 0.40, hit: 0.15, dmg: 20, range: 2.2, knock: 1.5, next: { light: 'L2', heavy: 'H' } },
  L2:     { dur: 0.40, hit: 0.15, dmg: 20, range: 2.2, knock: 1.5, next: { light: 'L3', heavy: 'LAUNCH' } },
  L3:     { dur: 0.60, hit: 0.25, dmg: 32, range: 2.4, knock: 7, finisher: true, next: { light: 'L1', heavy: 'H' } },
  H:      { dur: 0.72, hit: 0.34, dmg: 42, range: 2.3, knock: 5, breaks: true, next: { light: 'L1', heavy: 'H' } },
  LAUNCH: { dur: 0.75, hit: 0.34, dmg: 30, range: 2.9, knock: 8, breaks: true, aoe: true, finisher: true, next: { light: 'L1' } },
};

const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const turn = (a, b, rate) => { const d = angDiff(a, b); return a + Math.sign(d) * Math.min(Math.abs(d), rate); };

export class Player {
  constructor(G) {
    this.G = G;
    this.rig = new Rig({ accent: 0xc0392b });
    G.scene.add(this.rig.root);
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.reset(G.world.spawn);
  }

  reset(sp) {
    Object.assign(this.pos, { x: sp.x, y: sp.y, z: sp.z });
    Object.assign(this.vel, { x: 0, y: 0, z: 0 });
    this.yaw = sp.yaw || 0;
    this.state = 'ground';
    this.action = null;
    this.hp = 100;
    this.crouch = false;
    this.hidden = false;
    this.phase = 0; this.t = 0;
    this.grabCD = 0; this.wallrunCD = 0; this.lastWallBox = null;
    this.peakY = sp.y;
    this.noiseT = 0; this.combatCalm = 99; this.stepSide = 0;
    this.prompt = ''; this.context = null; this.lockTarget = null;
    this.stats = { kills: 0, assassinations: 0, detected: 0 };
    this.rig.applyNow(Poses.idle(0));
    this.sync();
  }

  get height() { return this.crouch ? HC : H; }
  get speedXZ() { return Math.hypot(this.vel.x, this.vel.z); }
  get forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  get iframes() { return this.action && this.action.type === 'dodge' && this.action.t < 0.28; }
  get climbing() { return this.state === 'climb'; }

  // ---------------------------------------------------------------- update
  update(dt) {
    const G = this.G, inp = G.input;
    this.t += dt;
    this.grabCD -= dt; this.wallrunCD -= dt; this.noiseT -= dt;

    // camera-relative wish direction
    const cy = G.cam.yaw;
    const fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
    let wx = rx * inp.move.x + fx * inp.move.y, wz = rz * inp.move.x + fz * inp.move.y;
    const wl = Math.hypot(wx, wz);
    this.wishLen = Math.min(1, wl);
    if (wl > 1e-3) { wx /= wl; wz /= wl; }
    this.wish = { x: wx, z: wz };
    this.sprinting = inp.held('sprint') && this.wishLen > 0.2;

    if (this.state === 'dead') { this.animate(dt); return; }

    this.updateContext();
    if (inp.pressed('action') && this.context) this.doContext(this.context);

    switch (this.state) {
      case 'ground': this.updateGround(dt); break;
      case 'air': this.updateAir(dt); break;
      case 'climb': this.updateClimb(dt); break;
      case 'wallrun': this.updateWallrun(dt); break;
      case 'scripted': this.updateScripted(dt); break;
      case 'sync': this.updateSync(dt); break;
    }

    // hiding + health regen
    const W = G.world;
    const vol = W.volumeAt(this.pos.x, this.pos.y + 0.3, this.pos.z);
    this.hidden = this.state === 'ground' && !!vol && ((vol.kind === 'hide' && this.crouch) || vol.kind === 'hay') && !(this.action && this.action.type === 'attack');
    this.inHide = vol;
    const engaged = G.enemies.some((e) => e.alive && e.state === 'combat');
    this.combatCalm = engaged ? 0 : this.combatCalm + dt;
    if (this.combatCalm > 4 && this.hp < 100 && this.state !== 'dead') this.hp = Math.min(100, this.hp + 10 * dt);

    this.animate(dt);
  }

  // ------------------------------------------------------------ context (F)
  updateContext() {
    const G = this.G;
    let best = null;
    const p = this.pos, f = this.forward;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, dy = p.y - e.pos.y;
      const d = Math.hypot(dx, dz);
      // counter: enemy winding up on me
      if (this.state === 'ground' && e.attack && e.attack.phase === 'windup' && e.attack.melee && d < 3.4 && Math.abs(dy) < 1.5) {
        const c = { kind: 'counter', e, d, label: 'COUNTER' };
        if (!best || best.kind !== 'counter' || d < best.d) best = c;
        continue;
      }
      if (best && best.kind === 'counter') continue;
      // air / ledge assassination
      if ((this.state === 'air' || this.state === 'climb') && dy > 0.8 && dy < 9) {
        const lx = dx - this.vel.x * 0.15, lz = dz - this.vel.z * 0.15;
        if (Math.hypot(lx, lz) < (this.state === 'climb' ? 3.2 : 2.8) && e.state !== 'combat' || Math.hypot(lx, lz) < 1.6) {
          if (!best || d < best.d) best = { kind: 'air', e, d, label: 'AIR ASSASSINATE' };
        }
        continue;
      }
      // ground assassination: target unaware of me
      if (this.state === 'ground' && e.state !== 'combat' && Math.abs(dy) < 1.2 && d < 2.6) {
        const facing = (dx * f.x + dz * f.z) / Math.max(d, 1e-3);
        if (facing > -0.2 || d < 1.4) if (!best || d < best.d) best = { kind: 'assassinate', e, d, label: 'ASSASSINATE' };
      }
    }
    if (!best && this.state === 'ground' && !G.synced && G.world.volumeAt(p.x, p.y + 0.3, p.z, 'perch')) {
      best = { kind: 'sync', label: 'SYNCHRONIZE' };
    }
    this.context = best;
    this.prompt = best ? best.label : '';
  }

  doContext(c) {
    const G = this.G, p = this.pos;
    if (c.kind === 'sync') {
      this.state = 'sync'; this.syncT = 0; this.vel.x = this.vel.z = this.vel.y = 0;
      G.cam.startSync(); sfx.sync();
      return;
    }
    const e = c.e;
    const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
    if (c.kind === 'counter') {
      this.yaw = Math.atan2(dx, dz);
      e.freeze(0.6);
      this.script = {
        t: 0, dur: 0.55, from: { ...p }, to: { x: e.pos.x - dx / d * 1.0, y: p.y, z: e.pos.z - dz / d * 1.0 }, arc: 0,
        anim: (u) => Poses.attack('COUNTER', u), hitAt: 0.3, hit: () => { this.kill(e, 'counter'); sfx.blade(); G.fx.shake(0.4); },
        after: 'ground',
      };
      this.state = 'scripted'; this.action = null;
      G.fx.slowmo(0.25, 0.45);
      G.noise(p.x, p.y, p.z, 14);
      return;
    }
    if (c.kind === 'assassinate') {
      this.yaw = Math.atan2(dx, dz);
      e.freeze(0.8);
      this.script = {
        t: 0, dur: 0.6, from: { ...p }, to: { x: e.pos.x - dx / d * 0.75, y: e.pos.y, z: e.pos.z - dz / d * 0.75 }, arc: 0,
        anim: (u) => Poses.attack('ASSASSIN', u), hitAt: 0.38, hit: () => { this.kill(e, 'assassinate'); sfx.blade(); G.fx.shake(0.15); },
        after: 'ground',
      };
      this.state = 'scripted'; this.action = null;
      G.noise(p.x, p.y, p.z, 3.5);
      return;
    }
    if (c.kind === 'air') {
      this.yaw = Math.atan2(dx, dz);
      e.freeze(1.2);
      const drop = Math.max(0, p.y - e.pos.y);
      this.script = {
        t: 0, dur: 0.32 + drop * 0.035, from: { ...p }, to: { x: e.pos.x - dx / d * 0.5, y: e.pos.y, z: e.pos.z - dz / d * 0.5 }, arc: 0.6,
        anim: (u) => Poses.attack('AIR', u), hitAt: 0.9, hit: () => { this.kill(e, 'air'); sfx.blade(); sfx.land(1); G.fx.shake(0.5); },
        after: 'ground', land: true,
      };
      this.state = 'scripted'; this.action = null;
      G.noise(p.x, p.y, p.z, 6);
    }
  }

  kill(e, how) {
    e.die(how, this.pos);
    this.stats.kills++;
    if (how !== 'counter') this.stats.assassinations++;
    this.G.onKill(e, how);
  }

  // ---------------------------------------------------------------- ground
  updateGround(dt) {
    const G = this.G, W = G.world, inp = G.input, p = this.pos, v = this.vel;
    const a = this.action;
    if (a) { a.t += dt; }

    // crouch / slide
    if (inp.pressed('crouch') && !a) {
      if (this.sprinting && this.speedXZ > 7) { this.action = { type: 'slide', t: 0, dur: 0.65 }; this.crouch = true; }
      else this.crouch = !this.crouch;
    }
    if (this.sprinting && this.crouch && !(a && a.type === 'slide')) this.crouch = false;

    // lock on to a fighting enemy nearby
    this.lockTarget = null;
    if (!this.sprinting) {
      let bd = 7;
      for (const e of G.enemies) {
        if (!e.alive || e.state !== 'combat') continue;
        const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
        if (d < bd && Math.abs(e.pos.y - p.y) < 1.5) { bd = d; this.lockTarget = e; }
      }
    }

    let busy = false;
    if (a) {
      if (a.type === 'attack') { this.updateAttack(dt); busy = true; }
      else if (a.type === 'dodge') {
        const u = a.t / a.dur, s = 13 * (1 - u * u);
        v.x = a.dx * s; v.z = a.dz * s; busy = true;
        if (a.t >= a.dur) this.action = null;
      } else if (a.type === 'slide') {
        const k = Math.exp(-1.6 * dt); v.x *= k; v.z *= k; busy = true;
        if (a.t >= a.dur || inp.pressed('jump')) { this.action = null; this.crouch = false; }
      } else {
        // hurt / land / recoil / hayland: brief loss of control
        const k = Math.exp(-10 * dt); v.x *= k; v.z *= k; busy = true;
        if (a.t >= a.dur) this.action = null;
      }
    }

    if (!busy) {
      let speed = 0;
      if (this.wishLen > 0.05) {
        speed = this.crouch ? T.crouchSpeed : this.sprinting ? T.sprint : T.jog * (this.wishLen < 0.6 ? 0.5 : 1);
        if (this.lockTarget && !this.sprinting) speed = Math.min(speed, T.jog * 0.75);
      }
      const tx = this.wish.x * speed, tz = this.wish.z * speed;
      let dx = tx - v.x, dz = tz - v.z;
      const dl = Math.hypot(dx, dz), maxd = T.accel * dt;
      if (dl > maxd) { dx *= maxd / dl; dz *= maxd / dl; }
      v.x += dx; v.z += dz;
      // facing
      if (this.lockTarget) this.yaw = turn(this.yaw, Math.atan2(this.lockTarget.pos.x - p.x, this.lockTarget.pos.z - p.z), 12 * dt);
      else if (this.speedXZ > 0.3) this.yaw = turn(this.yaw, Math.atan2(v.x, v.z), 13 * dt);

      if (inp.pressed('jump')) { if (this.jumpFromGround()) return; }
      if (inp.pressed('dodge')) this.startDodge();
      else if (inp.pressed('light')) this.startAttack('L1');
      else if (inp.pressed('heavy')) this.startAttack('H');
    }
    v.y = 0;

    // move + collide
    const px = p.x, pz = p.z;
    p.x += v.x * dt; p.z += v.z * dt;
    const contacts = [];
    W.collideXZ(p, R, p.y, p.y + this.height, 0.45, contacts);

    // walking into something: vault / climb
    if (!busy && this.wishLen > 0.3 && contacts.length) {
      for (const c of contacts) {
        if (this.wish.x * -c.nx + this.wish.z * -c.nz < 0.55) continue;
        const rel = c.box.max.y - p.y;
        if (rel <= 1.4 && !this.crouch && this.speedXZ > 2) { if (this.tryVault(c.box)) return; }
        else if (rel > 1.4 && c.box.climbable && (this.sprinting || inp.held('jump'))) {
          const hit = W.raycast(p.x, p.y + CHEST, p.z, -c.nx, 0, -c.nz, R + 0.4);
          if (hit && hit.box.climbable && Math.abs(hit.ny) < 0.1) { this.enterClimb(hit, this.sprinting ? 'run' : 'jump'); return; }
        }
      }
    }

    // ground follow / edges
    const g = W.groundAt(p.x, p.z, R * 0.6, p.y + 0.45);
    if (g.y >= p.y - 0.3) {
      p.y = g.y;
    } else {
      const drop = p.y - g.y;
      if (!this.sprinting && drop > 1.6 && !(a && a.type === 'dodge')) {
        // low-profile edge safety: don't walk off roofs unless freerunning
        p.x = px; p.z = pz; v.x = v.z = 0;
      } else {
        this.state = 'air'; this.peakY = p.y; this.action = null;
        if (this.sprinting && drop > 1.2) { v.y = T.jump * 0.85; sfx.jump(); } // auto freerun leap
      }
    }

    // footsteps / noise
    const sp = this.speedXZ;
    if (sp > 0.3) {
      const prev = this.phase;
      this.phase += sp * dt * Math.PI / (0.85 + 0.09 * sp);
      if (Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI) && !this.crouch && sp > 2.5) sfx.step();
      if (this.sprinting && this.noiseT <= 0) { G.noise(p.x, p.y, p.z, 7); this.noiseT = 0.4; }
    }
  }

  jumpFromGround() {
    const W = this.G.world, p = this.pos, v = this.vel, f = this.forward;
    // jump at a wall in front: start climbing with a leap
    const dir = this.wishLen > 0.2 ? this.wish : f;
    const hit = W.raycast(p.x, p.y + CHEST, p.z, dir.x, 0, dir.z, R + 0.7);
    if (hit && hit.box.climbable && Math.abs(hit.ny) < 0.1 && hit.box.max.y - p.y > 1.4) {
      this.enterClimb(hit, this.sprinting ? 'run' : 'jump');
      return true;
    }
    v.y = T.jump;
    if (this.sprinting) { v.x *= 1.08; v.z *= 1.08; }
    this.state = 'air'; this.peakY = p.y; this.crouch = false; this.action = null;
    sfx.jump();
    return true;
  }

  tryVault(box) {
    const W = this.G.world, p = this.pos;
    const sp = Math.max(this.speedXZ, 4);
    const dx = this.wish.x, dz = this.wish.z;
    // slab through the box in XZ
    let t0 = -Infinity, t1 = Infinity;
    for (const [o, d, mn, mx] of [[p.x, dx, box.min.x, box.max.x], [p.z, dz, box.min.z, box.max.z]]) {
      if (Math.abs(d) < 1e-6) { if (o < mn - R || o > mx + R) return false; continue; }
      let a = (mn - o) / d, b = (mx - o) / d; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t1 < 0) return false;
    t0 = Math.max(t0, 0);
    const top = box.max.y;
    const depth = t1 - t0;
    if (depth < 1.9) {
      const lx = p.x + dx * (t1 + R + 0.3), lz = p.z + dz * (t1 + R + 0.3);
      const g = W.groundAt(lx, lz, R * 0.6, top + 0.3);
      if (g.y <= top + 0.05 && !W.blocked(lx, lz, R, g.y + 0.1, g.y + 1.7) && !W.blocked(p.x + dx * t0, p.z + dz * t0, R * 0.5, top + 0.05, top + 1.2)) {
        const dist = t1 + R + 0.3;
        this.startScript({ x: lx, y: g.y, z: lz }, Math.max(0.32, dist / sp), top + 0.35 - Math.max(p.y, g.y), (u) => Poses.vault(u),
          { keepVel: true, peakAbs: top + 0.45 });
        return true;
      }
    }
    // mantle up onto it
    const mx = p.x + dx * (t0 + R + 0.2), mz = p.z + dz * (t0 + R + 0.2);
    if (W.blocked(mx, mz, R * 0.9, top + 0.05, top + 1.75)) return false;
    this.startScript({ x: mx, y: top, z: mz }, 0.28, 0.25, (u) => Poses.mantle(u), { keepVel: true });
    return true;
  }

  startScript(to, dur, arc, anim, opts = {}) {
    const p = this.pos;
    this.script = { t: 0, dur, from: { ...p }, to, arc, anim, after: 'ground', ...opts,
      vel: { x: this.vel.x, z: this.vel.z } };
    this.yaw = Math.atan2(to.x - p.x, to.z - p.z) || this.yaw;
    this.state = 'scripted'; this.action = null;
  }

  updateScripted(dt) {
    const s = this.script, p = this.pos;
    s.t += dt;
    const u = Math.min(1, s.t / s.dur);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    p.x = s.from.x + (s.to.x - s.from.x) * e;
    p.z = s.from.z + (s.to.z - s.from.z) * e;
    if (s.peakAbs !== undefined) {
      // parabola through from -> peak -> to
      const a = s.from.y, b = s.to.y, c = s.peakAbs;
      p.y = u < 0.5 ? a + (c - a) * Math.sin(u * Math.PI) : b + (c - b) * Math.sin(u * Math.PI);
    } else {
      p.y = s.from.y + (s.to.y - s.from.y) * Math.min(1, e * 1.3) + s.arc * 4 * u * (1 - u);
    }
    if (s.hit && u >= s.hitAt && !s.hitDone) { s.hitDone = true; s.hit(); }
    if (u >= 1) {
      p.x = s.to.x; p.y = s.to.y; p.z = s.to.z;
      this.state = s.after;
      if (s.keepVel) { this.vel.x = s.vel.x; this.vel.z = s.vel.z; } else { this.vel.x = this.vel.z = 0; }
      this.vel.y = 0;
      this.peakY = p.y;
      if (s.land) this.action = { type: 'land', t: 0, dur: 0.35 };
      // landed on nothing?
      const g = this.G.world.groundAt(p.x, p.z, R * 0.6, p.y + 0.1);
      if (g.y < p.y - 0.3) this.state = 'air';
    }
  }

  // ------------------------------------------------------------------- air
  updateAir(dt) {
    const G = this.G, W = G.world, inp = G.input, p = this.pos, v = this.vel;
    v.y = Math.max(-45, v.y - T.gravity * dt);
    if (this.wishLen > 0.1) {
      const ref = Math.max(this.speedXZ, T.jog);
      const k = Math.min(1, T.airControl * dt);
      v.x += (this.wish.x * ref - v.x) * k;
      v.z += (this.wish.z * ref - v.z) * k;
    }
    if (this.speedXZ > 0.5) this.yaw = turn(this.yaw, Math.atan2(v.x, v.z), 6 * dt);

    const prevY = p.y;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    this.peakY = Math.max(this.peakY, p.y);
    // landing (before wall pushes, so a fast fall never ends up "inside" the floor)
    const g = W.groundAt(p.x, p.z, R * 0.6, prevY + 0.05);
    if (v.y <= 0 && p.y <= g.y) { p.y = g.y; W.collideXZ(p, R, p.y, p.y + H, 0.45); this.land(); return; }
    const contacts = [];
    W.collideXZ(p, R, p.y + 0.05, p.y + H, 0.0, contacts);
    if (v.y > 0 && W.blocked(p.x, p.z, R * 0.8, p.y + H - 0.15, p.y + H)) v.y = 0;

    // grab walls / ledges
    if (this.grabCD <= 0) {
      const hs = this.speedXZ;
      const dir = hs > 1 ? { x: v.x / hs, z: v.z / hs } : this.wishLen > 0.3 ? this.wish : null;
      if (dir && this.tryGrab(dir)) return;
      for (const c of contacts) if (this.tryGrab({ x: -c.nx, z: -c.nz })) return;
    }

    // wall-run
    if (this.sprinting && this.wallrunCD <= 0 && this.speedXZ > 6 && v.y > -5) {
      const hs = this.speedXZ, vx = v.x / hs, vz = v.z / hs;
      for (const side of [1, -1]) {
        // side>0 = wall on the left
        const sx = vz * side, sz = -vx * side;
        const hit = W.raycast(p.x, p.y + CHEST, p.z, sx, 0, sz, R + 0.75);
        if (!hit || !hit.box.climbable || Math.abs(hit.ny) > 0.1 || hit.box === this.lastWallBox) continue;
        const dot = vx * hit.nx + vz * hit.nz;
        if (Math.abs(dot) > 0.7) continue;
        let tx = vx - hit.nx * dot, tz = vz - hit.nz * dot; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
        this.state = 'wallrun';
        this.wr = { nx: hit.nx, nz: hit.nz, tx, tz, side, time: 0, box: hit.box, speed: Math.max(hs, T.sprint * 0.95) };
        v.y = Math.max(v.y, 3.5);
        return;
      }
    }
  }

  land() {
    const G = this.G, W = G.world, p = this.pos, v = this.vel;
    const drop = this.peakY - p.y;
    this.state = 'ground'; v.y = 0; this.lastWallBox = null;
    const hay = W.volumeAt(p.x, p.y + 0.2, p.z, 'hay');
    if (hay) {
      v.x = v.z = 0; this.crouch = true;
      this.action = { type: 'hayland', t: 0, dur: 0.5 };
      sfx.land(0.4);
      if (drop > 12) G.hud.toast('LEAP OF FAITH');
      return;
    }
    if (drop > T.fallSafe) {
      const dmg = (drop - T.fallSafe) * 11;
      this.action = { type: 'land', t: 0, dur: 0.6 };
      sfx.land(1.4); G.fx.shake(0.6);
      G.noise(p.x, p.y, p.z, 12);
      this.hurt(dmg, null, 'fall');
    } else if (drop > 3) {
      if (!this.sprinting) this.action = { type: 'land', t: 0, dur: 0.18 };
      sfx.land(0.8); G.fx.shake(0.12);
      G.noise(p.x, p.y, p.z, 6);
    } else sfx.land(0.3);
  }

  // Try to latch onto a wall (or catch a ledge) in direction dir.
  tryGrab(dir) {
    const W = this.G.world, p = this.pos;
    const chest = W.raycast(p.x, p.y + CHEST, p.z, dir.x, 0, dir.z, R + 0.35);
    if (chest && chest.box.climbable && Math.abs(chest.ny) < 0.1) { this.enterClimb(chest, null); return true; }
    if (!chest) {
      // ledge catch: something just below chest height — mantle straight up
      const low = W.raycast(p.x, p.y + 0.35, p.z, dir.x, 0, dir.z, R + 0.35);
      if (low && Math.abs(low.ny) < 0.1) {
        const top = low.box.max.y;
        const tx = p.x + dir.x * (low.t + R + 0.15), tz = p.z + dir.z * (low.t + R + 0.15);
        const g = W.groundAt(tx, tz, R * 0.5, top + 0.05);
        if (g.y > p.y && !W.blocked(tx, tz, R * 0.9, g.y + 0.05, g.y + 1.75)) {
          this.vel.x *= 0.5; this.vel.z *= 0.5;
          this.startScript({ x: tx, y: g.y, z: tz }, 0.3, 0.2, (u) => Poses.mantle(u), { keepVel: true });
          return true;
        }
      }
    }
    return false;
  }

  // ----------------------------------------------------------------- climb
  enterClimb(hit, leap) {
    const p = this.pos;
    this.state = 'climb';
    this.cl = { nx: hit.nx, nz: hit.nz, leapT: 0, leapVy: 0, leapVl: 0 };
    p.x = hit.x + hit.nx * (R + 0.05); p.z = hit.z + hit.nz * (R + 0.05);
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = Math.atan2(-hit.nx, -hit.nz);
    this.crouch = false; this.action = null;
    if (leap) { this.cl.leapT = 0.34; this.cl.leapVy = T.climbLeap * (leap === 'run' ? 1.25 : 1); }
    sfx.land(0.25);
  }

  updateClimb(dt) {
    const G = this.G, W = G.world, inp = G.input, p = this.pos, c = this.cl;
    const tx = c.nz, tz = -c.nx; // my right while facing the wall
    // map stick-x through the camera so "right" is right on screen
    const cy = G.cam.yaw, crx = Math.cos(cy), crz = -Math.sin(cy);
    const sgn = crx * tx + crz * tz >= -0.2 ? 1 : -1;
    const up = inp.move.y, lat = inp.move.x * sgn;

    if (inp.pressed('jump')) {
      if (up < -0.5) { // eject backwards off the wall
        this.state = 'air'; this.grabCD = 0.35; this.peakY = p.y;
        this.vel.x = c.nx * 6.5; this.vel.z = c.nz * 6.5; this.vel.y = 7;
        this.yaw = Math.atan2(c.nx, c.nz); sfx.jump();
        return;
      }
      if (c.leapT <= 0) {
        c.leapT = 0.32;
        const sideways = Math.abs(lat) > 0.5 && up < 0.3;
        c.leapVy = sideways ? T.climbLeap * 0.35 : T.climbLeap;
        c.leapVl = Math.abs(lat) > 0.3 ? Math.sign(lat) * 6 : 0;
        sfx.jump();
      }
    }
    if (inp.pressed('crouch')) { // let go
      this.state = 'air'; this.grabCD = 0.45; this.peakY = p.y;
      this.vel.x = c.nx * 1.5; this.vel.z = c.nz * 1.5; this.vel.y = 0;
      return;
    }

    let vy = up * T.climbSpeed, vl = lat * T.climbSpeed * 0.85;
    if (c.leapT > 0) {
      const k = c.leapT / 0.32;
      vy += c.leapVy * k; vl += c.leapVl * k;
      c.leapT -= dt;
    }
    this.phase += (Math.abs(vy) + Math.abs(vl)) * dt * 2.2;

    // lateral
    if (Math.abs(vl) > 0.01) {
      const nx = p.x + tx * vl * dt, nz = p.z + tz * vl * dt;
      const wall = W.raycast(nx, p.y + CHEST, nz, -c.nx, 0, -c.nz, R + 0.6) || W.raycast(nx, p.y + 0.5, nz, -c.nx, 0, -c.nz, R + 0.6);
      // (tested a little off the wall so ledges/bands we're hugging don't count as an inside corner)
      if (wall && !W.blocked(nx + c.nx * 0.45, nz + c.nz * 0.45, R * 0.7, p.y + 0.2, p.y + 1.6)) { p.x = nx; p.z = nz; }
      else { c.leapVl = 0; }
    }
    // vertical
    if (Math.abs(vy) > 0.01) {
      const ny = p.y + vy * dt;
      // overhang check, offset from the wall: thin ledges get climbed past, real overhangs stop you
      if (vy > 0 && W.blocked(p.x + c.nx * 0.5, p.z + c.nz * 0.5, R * 0.6, ny + H - 0.1, ny + H)) { c.leapT = 0; }
      else if (vy < 0 && W.groundAt(p.x, p.z, R * 0.6, p.y + 0.05).y >= ny) {
        p.y = W.groundAt(p.x, p.z, R * 0.6, p.y + 0.05).y;
        this.state = 'ground'; this.yaw = Math.atan2(c.nx, c.nz) + Math.PI; return;
      } else {
        const chest = W.raycast(p.x, ny + CHEST, p.z, -c.nx, 0, -c.nz, R + 0.6);
        if (chest) p.y = ny;
        else if (vy > 0) {
          // topping out: is there a surface to stand on in front?
          const fx = p.x - c.nx * (R + 0.5), fz = p.z - c.nz * (R + 0.5);
          const g = W.groundAt(fx, fz, R * 0.5, ny + 1.6);
          if (g.y > ny - 0.3 && !W.blocked(fx, fz, R * 0.9, g.y + 0.05, g.y + 1.75)) {
            this.startScript({ x: fx, y: g.y, z: fz }, 0.38, 0.35, (u) => Poses.mantle(u));
            this.yaw = Math.atan2(-c.nx, -c.nz);
            return;
          }
          c.leapT = 0;
        }
      }
    }
    // stay glued to whatever surface is in front
    const hit = W.raycast(p.x, p.y + CHEST, p.z, -c.nx, 0, -c.nz, R + 0.8) || W.raycast(p.x, p.y + 0.5, p.z, -c.nx, 0, -c.nz, R + 0.8);
    if (!hit) { this.state = 'air'; this.grabCD = 0.3; this.peakY = p.y; return; }
    if (Math.abs(hit.ny) < 0.1 && (hit.nx !== c.nx || hit.nz !== c.nz) && hit.box.climbable) {
      c.nx = hit.nx; c.nz = hit.nz; this.yaw = Math.atan2(-c.nx, -c.nz);
    }
    const err = hit.t - (R + 0.05);
    const k = Math.min(1, 14 * dt);
    p.x -= c.nx * err * k; p.z -= c.nz * err * k;
  }

  // --------------------------------------------------------------- wallrun
  updateWallrun(dt) {
    const G = this.G, W = G.world, inp = G.input, p = this.pos, v = this.vel, w = this.wr;
    w.time += dt;
    v.y -= T.gravity * T.wallrunGravity * dt;
    v.x = w.tx * w.speed; v.z = w.tz * w.speed;
    this.yaw = Math.atan2(w.tx, w.tz);
    this.phase += w.speed * dt * Math.PI / 1.7;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    this.peakY = Math.max(this.peakY, p.y);

    const leave = (jump) => {
      this.state = 'air'; this.wallrunCD = 0.25; this.lastWallBox = w.box;
      if (jump) {
        v.x = w.tx * w.speed * 0.85 + w.nx * 5.5; v.z = w.tz * w.speed * 0.85 + w.nz * 5.5; v.y = T.jump * 0.95; sfx.jump();
      }
    };
    if (inp.pressed('jump')) return leave(true);
    const ahead = W.raycast(p.x, p.y + CHEST, p.z, w.tx, 0, w.tz, R + 0.3);
    if (ahead) {
      if (ahead.box.climbable && Math.abs(ahead.ny) < 0.1) { this.enterClimb(ahead, null); return; }
      return leave(false);
    }
    const g = W.groundAt(p.x, p.z, R * 0.6, p.y + 0.05);
    if (v.y <= 0 && g.y >= p.y) { p.y = g.y; this.land(); return; }
    const hit = W.raycast(p.x, p.y + CHEST, p.z, -w.nx, 0, -w.nz, R + 1.0);
    if (!hit || w.time > T.wallrunTime || !inp.held('sprint')) return leave(false);
    const err = hit.t - (R + 0.1);
    p.x -= w.nx * err; p.z -= w.nz * err;
  }

  // ------------------------------------------------------------------ sync
  updateSync(dt) {
    this.syncT += dt;
    if (this.syncT > 3.4) { this.state = 'ground'; this.G.onSync(); }
  }

  // ---------------------------------------------------------------- combat
  pickTarget(range = 5) {
    const p = this.pos;
    const dir = this.wishLen > 0.2 ? this.wish : this.forward;
    let best = null, bs = Infinity;
    for (const e of this.G.enemies) {
      if (!e.alive || Math.abs(e.pos.y - p.y) > 1.5) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > range) continue;
      const s = d - 2.2 * (dx * dir.x + dz * dir.z) / Math.max(d, 1e-3);
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  startAttack(kind) {
    const tgt = this.pickTarget();
    if (tgt) this.yaw = Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z);
    this.action = { type: 'attack', kind, t: 0, hitDone: false, queued: null, target: tgt };
    this.crouch = false;
    sfx.whoosh();
  }

  startDodge() {
    let dx = this.wish.x, dz = this.wish.z;
    if (this.wishLen < 0.2) { dx = -this.forward.x; dz = -this.forward.z; }
    this.action = { type: 'dodge', t: 0, dur: 0.38, dx, dz };
    sfx.whoosh();
  }

  updateAttack(dt) {
    const G = this.G, inp = G.input, a = this.action, A = ATTACKS[a.kind], p = this.pos, v = this.vel;
    // lunge toward target until contact
    const tg = a.target;
    if (tg && tg.alive && a.t < A.hit) {
      const dx = tg.pos.x - p.x, dz = tg.pos.z - p.z, d = Math.hypot(dx, dz);
      this.yaw = turn(this.yaw, Math.atan2(dx, dz), 20 * dt);
      const s = d > 1.4 ? Math.min(9, (d - 1.2) / Math.max(0.05, A.hit - a.t)) : 0;
      v.x = dx / d * s; v.z = dz / d * s;
    } else {
      const k = Math.exp(-14 * dt); v.x *= k; v.z *= k;
    }
    if (!a.hitDone && a.t >= A.hit) { a.hitDone = true; this.resolveHits(A); }
    if (a.t > A.hit * 0.5) {
      if (inp.pressed('light') && A.next.light) a.queued = A.next.light;
      if (inp.pressed('heavy') && A.next.heavy) a.queued = A.next.heavy;
    }
    if (a.hitDone && inp.pressed('dodge')) { this.startDodge(); return; }
    if (a.queued && a.t >= A.hit + 0.09) { this.startAttack(a.queued); return; }
    if (a.t >= A.dur) this.action = null;
  }

  resolveHits(A) {
    const G = this.G, p = this.pos, f = this.forward;
    let hits = 0, blocked = 0;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > A.range + 0.3 || Math.abs(e.pos.y - p.y) > 1.4) continue;
      if (!A.aoe && (dx * f.x + dz * f.z) / Math.max(d, 1e-3) < 0.4) continue;
      const r = e.takeHit(A.dmg * T.playerDamage, { breaks: A.breaks, knock: A.knock, dx: dx / (d || 1), dz: dz / (d || 1), finisher: A.finisher });
      if (r === 'block') blocked++;
      else { hits++; if (r === 'kill') { this.stats.kills++; G.onKill(e, 'combat'); } }
    }
    if (hits) {
      G.fx.hitstop(A.finisher || A.breaks ? 0.1 : 0.055);
      G.fx.shake(A.finisher || A.breaks ? 0.35 : 0.15);
      (A.breaks || A.finisher ? sfx.heavy : sfx.hit)();
    }
    if (blocked && !hits) {
      sfx.block(); G.fx.shake(0.1); G.fx.hitstop(0.04);
      this.action = { type: 'recoil', t: 0, dur: 0.3 };
      this.vel.x = -f.x * 3; this.vel.z = -f.z * 3;
    }
    G.noise(p.x, p.y, p.z, 16);
  }

  hurt(dmg, from, kind = 'melee') {
    const G = this.G;
    if (this.state === 'dead' || this.state === 'scripted' || this.state === 'sync') return false;
    if (kind !== 'fall' && this.iframes) return false;
    this.hp -= dmg;
    G.hud.damage();
    sfx.hurt(); G.fx.shake(0.35);
    if (from) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
      this.vel.x = dx / d * 4; this.vel.z = dz / d * 4;
    }
    if (this.state === 'climb' || this.state === 'wallrun') {
      this.state = 'air'; this.grabCD = 0.8; this.peakY = this.pos.y;
      this.vel.x += this.cl ? this.cl.nx * 2 : 0; this.vel.z += this.cl ? this.cl.nz * 2 : 0;
    } else if (this.state === 'ground' && kind !== 'fall') {
      this.action = { type: 'hurt', t: 0, dur: 0.38 };
    }
    if (this.hp <= 0) {
      this.hp = 0; this.state = 'dead'; this.action = null;
      sfx.death(); G.onPlayerDeath();
    }
    return true;
  }

  // ------------------------------------------------------------- animation
  animate(dt) {
    const a = this.action;
    let target, rate = 14;
    switch (this.state) {
      case 'ground':
        if (a && a.type === 'attack') { target = Poses.attack(a.kind, a.t / ATTACKS[a.kind].dur); rate = 26; }
        else if (a && a.type === 'dodge') { target = Poses.run(this.phase += dt * 18, 1, 0.8); target.spine[0] += 0.3; rate = 24; }
        else if (a && a.type === 'slide') { target = Poses.slide(); rate = 18; }
        else if (a && (a.type === 'hurt' || a.type === 'recoil')) { target = Poses.hurt(); rate = 22; }
        else if (a && a.type === 'land') { target = Poses.land(1 - a.t / a.dur); rate = 30; }
        else if (a && a.type === 'hayland') { target = Poses.hide(); }
        else {
          const sp = this.speedXZ;
          if (this.hidden && sp < 0.5) target = Poses.hide();
          else if (sp < 0.3) target = this.lockTarget ? Poses.stance() : this.crouch ? Poses.run(0, 0, 1) : Poses.idle(this.t);
          else target = Poses.run(this.phase, Math.max(0, Math.min(1, (sp - 2) / 7)), this.crouch ? 1 : 0);
        }
        break;
      case 'air': target = Poses.air(this.vel.y); rate = 10; break;
      case 'climb': target = Poses.climb(this.phase, false); rate = 16; break;
      case 'wallrun': target = Poses.wallrun(this.phase, this.wr.side); break;
      case 'scripted': target = this.script.anim(Math.min(1, this.script.t / this.script.dur)); rate = 22; break;
      case 'sync': target = Poses.sync(this.t); rate = 6; break;
      case 'dead': target = Poses.dead(); rate = 8; break;
    }
    this.rig.apply(target, dt, rate);
    this.sync();
  }

  sync() {
    this.rig.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.rig.root.rotation.y = this.yaw;
  }
}
