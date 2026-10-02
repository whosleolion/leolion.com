// Enemies: perception (vision cone + line of sight + stance), an awareness
// meter, and a small state machine:
//   patrol -> suspicious -> investigate -> search -> (back to) patrol
//                     \-> combat (melee w/ attack tokens, or ranged) -> search
// Corpses get discovered; noises pull guards over; shouting alerts neighbours.
import * as THREE from './vendor/three.module.min.js';
import { T } from './tuning.js';
import { Rig, Poses } from './rig.js';
import { sfx } from './audio.js';

const R = 0.38, TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const turn = (a, b, rate) => { const d = angDiff(a, b); return a + Math.sign(d) * Math.min(Math.abs(d), rate); };

const TYPES = {
  guard:     { hp: 60, speed: 1.6, block: 0.35, windup: 0.55, rig: { body: 0x9b2d2d, limb: 0x777777, accent: 0x2b2b2b, hood: false, helmet: true, club: true } },
  bodyguard: { hp: 80, speed: 1.4, block: 0.5, windup: 0.5, rig: { body: 0x5a1a1a, limb: 0x555555, accent: 0x111111, hood: false, helmet: true, club: true, scale: 1.08 } },
  sentry:    { hp: 40, speed: 1.4, block: 0.1, windup: 0.6, ranged: true, view: 1.35, rig: { body: 0xb5651d, limb: 0x777777, accent: 0x2b2b2b, hood: false, helmet: true } },
  target:    { hp: 120, speed: 1.3, block: 0.5, windup: 0.7, rig: { body: 0xd4a017, limb: 0x8a6d1a, accent: 0x6b1d1d, hood: false, cape: true, club: true } },
};

export class Director {
  constructor() { this.attackers = new Set(); this.last = 0; this.t = 0; }
  update(dt) { this.t += dt; for (const e of this.attackers) if (!e.alive || !e.attack) this.attackers.delete(e); }
  grant(e) {
    if (this.attackers.size >= T.maxAttackers || this.t - this.last < 0.35) return false;
    this.attackers.add(e); this.last = this.t; return true;
  }
  release(e) { this.attackers.delete(e); }
}

export class Enemy {
  constructor(G, def) {
    this.G = G;
    this.def = def;
    this.type = def.type || 'guard';
    this.cfg = TYPES[this.type];
    this.rig = new Rig(this.cfg.rig);
    G.scene.add(this.rig.root);
    const W = G.world;
    const [x, z] = def.route ? def.route[0] : def.at;
    const y = W.groundAt(x, z, 0.1, def.maxY ?? 100).y;
    this.pos = { x, y, z };
    this.home = { x, y, z };
    this.vel = { x: 0, z: 0 };
    this.yaw = def.yaw ?? 0;
    this.homeYaw = this.yaw;
    this.hp = this.cfg.hp;
    this.alive = true;
    this.state = 'patrol';
    this.awareness = 0;
    this.lastKnown = null;
    this.lostT = 0; this.searchT = 0; this.waitT = 0; this.routeI = 0;
    this.stunT = 0; this.blockT = 0; this.freezeT = 0;
    this.attack = null; this.attackCD = 1 + Math.random();
    this.phase = Math.random() * 10; this.t = Math.random() * 10;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.avoidSide = this.strafe;
    this.stuck = { t: 0, x, z, detour: 0 };
    this.found = false; // as a corpse
    this.vis = 0;
    this.rig.applyNow(Poses.idle(0));
    this.syncRig();
  }

  get forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }

  // ------------------------------------------------------------ perception
  seePlayer() {
    const P = this.G.player, W = this.G.world;
    if (P.state === 'dead') return 0;
    const ey = this.pos.y + 1.65;
    const py = P.pos.y + (P.crouch ? 0.9 : 1.3);
    const dx = P.pos.x - this.pos.x, dy = py - ey, dz = P.pos.z - this.pos.z;
    const d = Math.hypot(dx, dy, dz);
    const range = T.viewDist * (this.cfg.view || 1) * (this.state === 'combat' ? 1.5 : 1);
    if (d > range) return 0;
    if (P.hidden && d > 1.5) return 0;
    const f = this.forward;
    const cos = (dx * f.x + dz * f.z) / Math.max(Math.hypot(dx, dz), 1e-3);
    const inCone = cos > Math.cos((T.viewFov / 2) * Math.PI / 180);
    const close = d < (P.crouch ? 1.6 : 3);
    if (!inCone && !close && this.state !== 'combat') return 0;
    if (!W.lineClear(this.pos.x, ey, this.pos.z, P.pos.x, py, P.pos.z) &&
        !W.lineClear(this.pos.x, ey, this.pos.z, P.pos.x, P.pos.y + 0.4, P.pos.z)) return 0;
    let v = Math.max(0.12, 1 - d / range);
    if (!inCone) v *= 0.6;
    if (P.crouch && P.speedXZ < 3) v *= 0.45;
    if (P.sprinting) v *= 1.5;
    if (P.state === 'climb' || P.state === 'wallrun') v *= 1.4;
    if ((P.action && P.action.type === 'attack') || P.state === 'scripted') v *= 3;
    return v;
  }

  hear(x, y, z, radius) {
    if (!this.alive || this.state === 'combat' || this.freezeT > 0) return;
    const d = Math.hypot(x - this.pos.x, (y - this.pos.y) * 0.5, z - this.pos.z);
    if (d > radius) return;
    this.awareness = Math.max(this.awareness, 0.35);
    this.goInvestigate({ x, y, z });
  }

  goInvestigate(p) {
    if (this.state === 'investigate' && this.lastKnown && Math.hypot(p.x - this.lastKnown.x, p.z - this.lastKnown.z) < 2) return;
    if (this.state === 'patrol') sfx.suspicious();
    this.state = 'investigate';
    this.lastKnown = { ...p };
  }

  enterCombat(shout = true) {
    if (!this.alive) return;
    const was = this.state;
    this.state = 'combat'; this.awareness = 1; this.lostT = 0;
    const P = this.G.player;
    this.lastKnown = { ...P.pos };
    if (was !== 'combat' && shout) {
      sfx.alert();
      this.G.onDetected(this);
      for (const e of this.G.enemies) {
        if (e === this || !e.alive || e.state === 'combat') continue;
        if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < 16 && Math.abs(e.pos.y - this.pos.y) < 8) e.enterCombat(false);
      }
    }
  }

  freeze(t) { this.freezeT = t; if (this.attack) this.cancelAttack(); }

  // ------------------------------------------------------------- update
  update(dt) {
    this.t += dt;
    if (!this.alive) { this.rig.apply(Poses.dead(), dt, 7); this.syncRig(); return; }
    if (this.freezeT > 0) { this.freezeT -= dt; this.rig.apply(Poses.hurt(), dt, 10); this.syncRig(); return; }
    const P = this.G.player;

    this.vis = this.seePlayer();
    if (this.vis > 0) { this.lastSeen = { ...P.pos }; }

    if (this.stunT > 0) {
      this.stunT -= dt;
      const k = Math.exp(-6 * dt); this.vel.x *= k; this.vel.z *= k;
      this.integrate(dt, false);
      this.rig.apply(Poses.hurt(), dt, 18); this.syncRig();
      return;
    }
    if (this.blockT > 0) this.blockT -= dt;

    if (this.state !== 'combat') this.updateUnaware(dt);
    else this.updateCombat(dt);

    this.animate(dt);
  }

  updateUnaware(dt) {
    const P = this.G.player;
    if (this.vis > 0) {
      const mult = this.state === 'search' ? 1.6 : this.state === 'investigate' ? 1.3 : 1;
      this.awareness += dt * T.detectRate * this.vis * 1.9 * mult;
      if (this.awareness >= 1) { this.enterCombat(); return; }
      if (this.awareness > 0.25) {
        if (this.state === 'patrol') sfx.suspicious();
        this.state = 'suspicious'; this.lastKnown = { ...P.pos }; this.suspT = 1.5;
      }
    } else {
      const floor = this.state === 'search' ? 0.3 : 0;
      this.awareness = Math.max(floor, this.awareness - dt * 0.18);
    }
    this.checkCorpses();

    switch (this.state) {
      case 'patrol': this.patrol(dt); break;
      case 'suspicious': {
        this.halt(dt);
        if (this.lastKnown) this.yaw = turn(this.yaw, Math.atan2(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z), 5 * dt);
        if (this.vis === 0) { this.suspT -= dt; if (this.suspT <= 0) this.goInvestigate(this.lastKnown); }
        break;
      }
      case 'investigate': {
        const lk = this.lastKnown;
        const arrived = !lk || this.moveToward(lk.x, lk.z, 2.8, dt, 1.2);
        if (arrived || this.stuck.giveUp) { this.state = 'search'; this.searchT = 6; this.stuck.giveUp = false; this.searchCenter = { ...this.pos }; }
        break;
      }
      case 'search': {
        this.searchT -= dt;
        if (!this.searchGoal || this.moveToward(this.searchGoal.x, this.searchGoal.z, 2.0, dt, 0.8)) {
          const c = this.searchCenter || this.pos, a = Math.random() * TAU, r = 2 + Math.random() * 4;
          this.searchGoal = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
          if (this.waitT <= 0) this.waitT = 0.8 + Math.random();
        }
        if (this.searchT <= 0) { this.state = 'patrol'; this.searchGoal = null; this.awareness = 0; this.returning = true; }
        break;
      }
    }
  }

  checkCorpses() {
    if (this.t % 0.25 > 0.05) return; // a few times per second is plenty
    const W = this.G.world, f = this.forward;
    for (const c of this.G.enemies) {
      if (c.alive || c.found) continue;
      const dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 14 || (dx * f.x + dz * f.z) / Math.max(d, 1e-3) < 0.3) continue;
      if (!W.lineClear(this.pos.x, this.pos.y + 1.6, this.pos.z, c.pos.x, c.pos.y + 0.3, c.pos.z)) continue;
      c.found = true;
      this.awareness = Math.max(this.awareness, 0.6);
      this.goInvestigate(c.pos);
      this.G.hud.toast('A BODY WAS FOUND');
      sfx.suspicious();
      return;
    }
  }

  patrol(dt) {
    const route = this.def.route;
    if (this.def.follow) {
      const L = this.def.follow;
      if (L.alive) {
        const [ox, oz] = this.def.offset;
        const c = Math.cos(L.yaw), s = Math.sin(L.yaw);
        const gx = L.pos.x + ox * c + oz * s, gz = L.pos.z - ox * s + oz * c;
        if (this.moveToward(gx, gz, Math.hypot(L.vel.x, L.vel.z) + (Math.hypot(gx - this.pos.x, gz - this.pos.z) > 1 ? 1.2 : 0), dt, 0.4)) {
          this.yaw = turn(this.yaw, L.yaw, 3 * dt);
        }
        return;
      }
      this.def.follow = null; this.def.route = [[this.pos.x, this.pos.z]];
      return;
    }
    if (this.waitT > 0) { this.waitT -= dt; this.halt(dt); return; }
    if (!route || route.length === 1) {
      const [hx, hz] = route ? route[0] : [this.home.x, this.home.z];
      if (this.moveToward(hx, hz, this.cfg.speed, dt, 0.4)) {
        this.yaw = turn(this.yaw, this.homeYaw + Math.sin(this.t * 0.5) * 0.8, 2 * dt);
        this.looking = true;
      }
      return;
    }
    const [tx, tz] = route[this.routeI];
    if (this.moveToward(tx, tz, this.cfg.speed, dt, 0.5)) {
      this.routeI = (this.routeI + 1) % route.length;
      if (this.def.wait !== false) this.waitT = 1.2 + Math.random() * 1.6;
    }
  }

  updateCombat(dt) {
    const G = this.G, P = G.player;
    if (this.vis > 0) { this.lostT = 0; this.lastKnown = { ...P.pos }; }
    else {
      this.lostT += dt;
      if (this.lostT > 4.5 || P.state === 'dead') {
        this.cancelAttack();
        this.state = 'search'; this.searchT = 8; this.awareness = 0.6;
        this.searchCenter = this.lastKnown ? { ...this.lastKnown } : { ...this.pos };
        this.searchGoal = this.searchCenter;
        return;
      }
    }
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const dy = P.pos.y - this.pos.y;
    const reachable = Math.abs(dy) < 1.3 && P.state !== 'climb' && P.state !== 'wallrun';

    if (this.attack) { this.updateAttack(dt, d); return; }
    this.attackCD -= dt;

    const toward = Math.atan2(dx, dz);
    if (this.cfg.ranged || !reachable) {
      // hold ground (or stand below the player) and throw
      if (!this.cfg.ranged && this.lastKnown && d > 3) this.moveToward(this.lastKnown.x, this.lastKnown.z, T.guardChase * 0.8, dt, 2.5);
      else this.halt(dt);
      this.yaw = turn(this.yaw, toward, 8 * dt);
      if (this.vis > 0 && this.attackCD <= 0 && d < 26) this.startAttack('THROW');
      return;
    }
    if (this.type === 'target' && d > 2.4) {
      // the target runs from you
      const ax = this.pos.x - dx / d * 5, az = this.pos.z - dz / d * 5;
      this.moveToward(ax, az, 4.4, dt, 0.1);
      return;
    }
    if (this.vis === 0 && this.lastKnown) { this.moveToward(this.lastKnown.x, this.lastKnown.z, T.guardChase, dt, 1); return; }

    const ring = G.director.attackers.size < T.maxAttackers && this.attackCD <= 0 ? 1.7 : 3.2;
    let mx = 0, mz = 0;
    if (d > ring + 0.4) { mx = dx / d; mz = dz / d; }
    else if (d < ring - 0.6) { mx = -dx / d; mz = -dz / d; }
    // circle around
    const sx = -dz / d * this.strafe, sz = dx / d * this.strafe;
    mx += sx * 0.45; mz += sz * 0.45;
    const sp = d > 6 ? T.guardChase : 2.2;
    const ml = Math.hypot(mx, mz);
    if (ml > 0.05) this.steerMove(mx / ml, mz / ml, sp * Math.min(1, ml), dt);
    else this.halt(dt);
    this.yaw = turn(this.yaw, toward, 9 * dt);
    if (Math.random() < dt * 0.25) this.strafe *= -1;

    if (this.attackCD <= 0 && d < 2.7 && G.director.grant(this)) this.startAttack('CLUB');
  }

  startAttack(kind) {
    const melee = kind === 'CLUB';
    this.attack = { kind, melee, phase: 'windup', t: 0, windup: melee ? this.cfg.windup : 0.6 };
    this.rig.flash(0xaa0000, true);
  }
  cancelAttack() {
    if (!this.attack) return;
    this.attack = null; this.rig.flash(0, false);
    this.G.director.release(this);
    this.attackCD = T.enemyAttackGap * (0.6 + Math.random() * 0.8);
  }

  updateAttack(dt, d) {
    const a = this.attack, G = this.G, P = G.player;
    a.t += dt;
    const k = Math.exp(-8 * dt); this.vel.x *= k; this.vel.z *= k;
    if (a.phase === 'windup') {
      this.yaw = turn(this.yaw, Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z), 6 * dt);
      this.rig.flash(Math.sin(a.t * 40) > 0 ? 0xcc0000 : 0x550000, true);
      if (a.t >= a.windup) {
        a.phase = 'strike'; a.t = 0; this.rig.flash(0, false);
        if (a.melee) {
          const f = this.forward;
          this.vel.x = f.x * 4; this.vel.z = f.z * 4;
          const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dd = Math.hypot(dx, dz);
          if (dd < 2.5 && (dx * f.x + dz * f.z) / Math.max(dd, 1e-3) > 0.25 && Math.abs(P.pos.y - this.pos.y) < 1.5) P.hurt(T.enemyDamage, this.pos);
        } else {
          this.throwAt(P);
        }
      }
    } else if (a.phase === 'strike') {
      if (a.t >= 0.15) { a.phase = 'recover'; a.t = 0; }
    } else if (a.t >= 0.45) {
      this.attack = null; G.director.release(this);
      this.attackCD = (a.melee ? T.enemyAttackGap : 2.4) * (0.7 + Math.random() * 0.8);
    }
    this.integrate(dt, false);
  }

  throwAt(P) {
    const G = this.G;
    const o = { x: this.pos.x, y: this.pos.y + 1.7, z: this.pos.z };
    const tx = P.pos.x + P.vel.x * 0.25, ty = P.pos.y + 1.1, tz = P.pos.z + P.vel.z * 0.25;
    const dx = tx - o.x, dy = ty - o.y, dz = tz - o.z, dist = Math.hypot(dx, dz);
    const speed = 20, t = Math.max(0.2, dist / speed), g = 9;
    G.projectiles.spawn(o, { x: dx / t, y: dy / t + 0.5 * g * t, z: dz / t }, g);
    sfx.throwing();
  }

  takeHit(dmg, o) {
    if (!this.alive) return 'none';
    const P = this.G.player;
    const wasAware = this.state === 'combat';
    if (!wasAware) this.enterCombat();
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    const f = this.forward;
    const facing = (dx * f.x + dz * f.z) / d > 0.4;
    if (wasAware && !o.breaks && !this.attack && facing && (this.blockT > 0 || Math.random() < this.cfg.block)) {
      this.blockT = 0.4;
      return 'block';
    }
    this.cancelAttack();
    this.hp -= dmg;
    this.vel.x = o.dx * o.knock; this.vel.z = o.dz * o.knock;
    if (this.hp <= 0) { this.die('combat'); return 'kill'; }
    this.stunT = o.finisher || o.breaks ? 0.75 : 0.38;
    this.blockT = 0;
    return 'hit';
  }

  die(how) {
    if (!this.alive) return;
    this.alive = false; this.state = 'dead'; this.found = false;
    this.cancelAttack();
    this.rig.flash(0, false);
  }

  // -------------------------------------------------------------- movement
  halt(dt) { const k = Math.exp(-10 * dt); this.vel.x *= k; this.vel.z *= k; this.integrate(dt, true); }

  moveToward(tx, tz, speed, dt, arrive = 0.4) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d < arrive) { this.halt(dt); return true; }
    if (this.waitT > 0 && this.state === 'search') { this.waitT -= dt; this.halt(dt); return false; }
    this.steerMove(dx / d, dz / d, Math.min(speed, d * 3), dt);
    return false;
  }

  steerMove(dx, dz, speed, dt) {
    let dir = this.steer(dx, dz);
    if (this.stuck.detour > 0) {
      this.stuck.detour -= dt;
      dir = this.steer(-dz * this.avoidSide + dx * 0.3, dx * this.avoidSide + dz * 0.3);
    }
    const k = 1 - Math.exp(-10 * dt);
    this.vel.x += (dir.x * speed - this.vel.x) * k;
    this.vel.z += (dir.z * speed - this.vel.z) * k;
    if (this.state !== 'combat' || !this.G.player) this.yaw = turn(this.yaw, Math.atan2(dir.x, dir.z), 7 * dt);
    this.integrate(dt, true);
    // stuck detection
    const s = this.stuck;
    s.t += dt;
    if (s.t > 1.2) {
      const moved = Math.hypot(this.pos.x - s.x, this.pos.z - s.z);
      if (moved < 0.35 * speed && speed > 0.5) {
        this.avoidSide *= -1; s.detour = 1.1; s.fails = (s.fails || 0) + 1;
        if (s.fails > 4) { s.giveUp = true; s.fails = 0; }
      } else s.fails = 0;
      s.t = 0; s.x = this.pos.x; s.z = this.pos.z;
    }
  }

  steer(dx, dz) {
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const W = this.G.world, p = this.pos;
    const angles = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.0, -2.0];
    for (const a0 of angles) {
      const a = a0 * this.avoidSide;
      const c = Math.cos(a), s = Math.sin(a);
      const rx = dx * c + dz * s, rz = -dx * s + dz * c;
      if (W.raycast(p.x, p.y + 0.7, p.z, rx, 0, rz, 1.3)) continue;
      const g = W.groundAt(p.x + rx * 1.0, p.z + rz * 1.0, 0.2, p.y + 0.5);
      if (g.y < p.y - 1.2) continue;
      return { x: rx, z: rz };
    }
    return { x: 0, z: 0 };
  }

  integrate(dt, sep) {
    const W = this.G.world, p = this.pos;
    const ox = p.x, oz = p.z;
    p.x += this.vel.x * dt; p.z += this.vel.z * dt;
    if (sep) {
      for (const e of this.G.enemies) {
        if (e === this || !e.alive) continue;
        const dx = p.x - e.pos.x, dz = p.z - e.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.9 && d > 1e-4 && Math.abs(e.pos.y - p.y) < 1.5) { p.x += dx / d * (0.9 - d) * 0.5; p.z += dz / d * (0.9 - d) * 0.5; }
      }
      const P = this.G.player;
      const dx = p.x - P.pos.x, dz = p.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.75 && d > 1e-4 && Math.abs(P.pos.y - p.y) < 1.5) { p.x += dx / d * (0.75 - d); p.z += dz / d * (0.75 - d); }
    }
    W.collideXZ(p, R, p.y, p.y + 1.8, 0.5);
    const g = W.groundAt(p.x, p.z, R * 0.6, p.y + 0.5);
    if (g.y < p.y - 1.2) { p.x = ox; p.z = oz; this.vel.x = this.vel.z = 0; }
    else p.y = g.y;
    this.speedNow = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 1e-4);
  }

  // ------------------------------------------------------------- animation
  animate(dt) {
    let target, rate = 12;
    const sp = this.speedNow || 0;
    this.phase += sp * dt * Math.PI / (0.85 + 0.09 * sp);
    if (this.attack) {
      const a = this.attack;
      const u = a.phase === 'windup' ? 0.35 * a.t / a.windup : a.phase === 'strike' ? 0.35 + 0.2 * a.t / 0.15 : 0.55 + 0.45 * a.t / 0.45;
      target = Poses.attack(a.kind, u); rate = 24;
    } else if (this.blockT > 0) { target = Poses.block(); rate = 24; }
    else if (sp > 0.3) target = Poses.run(this.phase, Math.max(0, Math.min(1, (sp - 1.6) / 5)));
    else if (this.state === 'combat') target = Poses.stance();
    else if (this.state === 'search' || this.looking) target = Poses.look(this.t);
    else target = Poses.idle(this.t);
    this.looking = false;
    this.rig.apply(target, dt, rate);
    this.syncRig();
  }

  syncRig() {
    this.rig.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.rig.root.rotation.y = this.yaw;
  }

  dispose() { this.G.scene.remove(this.rig.root); }
}

// ---------------------------------------------------------------- projectiles
export class Projectiles {
  constructor(G) {
    this.G = G; this.list = [];
    this.geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  }
  spawn(o, v, g) {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.set(o.x, o.y, o.z); m.castShadow = true;
    this.G.scene.add(m);
    this.list.push({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, g, t: 0, m });
  }
  update(dt) {
    const W = this.G.world, P = this.G.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt; p.vy -= p.g * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      let dead = p.t > 4 || !W.lineClear(p.x, p.y, p.z, nx, ny, nz);
      p.x = nx; p.y = ny; p.z = nz;
      const d = Math.hypot(p.x - P.pos.x, p.y - (P.pos.y + 1.0), p.z - P.pos.z);
      if (!dead && d < 0.7) { dead = true; P.hurt(Math.round(T.enemyDamage * 0.7), { x: p.x - p.vx, z: p.z - p.vz }, 'ranged'); }
      p.m.position.set(p.x, p.y, p.z); p.m.rotation.x += dt * 10;
      if (dead) { this.G.scene.remove(p.m); this.list.splice(i, 1); }
    }
  }
  clear() { for (const p of this.list) this.G.scene.remove(p.m); this.list = []; }
}

// ---------------------------------------------------------------- placement
export function spawnEnemies(G) {
  const E = (def) => new Enemy(G, def);
  const list = [];
  const add = (d) => { const e = E(d); list.push(e); return e; };
  const roof = (cx, cz, s = 3) => [[cx - s, cz - s], [cx + s, cz - s], [cx + s, cz + s], [cx - s, cz + s]];

  // tutorial plaza
  add({ route: [[-15, -41], [15, -41]] });
  // boulevard
  add({ route: [[-5, -45], [-5, -24]] });
  add({ route: [[5, -6], [5, -30]] });
  add({ route: [[-4.5, -9]], yaw: Math.PI });
  add({ route: [[4.5, -21]], yaw: 0 });
  // alleys
  add({ route: [[21, -36], [21, -9]] });
  add({ route: [[-21, -40], [-21, -2]] });
  // market street
  add({ route: [[-45, 19], [-10, 19]] });
  add({ route: [[10, 21.5], [45, 21.5]] });
  add({ route: [[-5.5, 24.5]], yaw: Math.PI });
  add({ route: [[5.5, 24.5]], yaw: Math.PI });
  // roof sentries
  add({ type: 'sentry', route: roof(14, -36) });
  add({ type: 'sentry', route: roof(-28, -22) });
  add({ type: 'sentry', route: roof(28, 6) });
  // courtyard wall-tops
  add({ type: 'sentry', route: [[-18, 53], [18, 53]] });
  add({ type: 'sentry', route: [[-18, 27], [-5, 27]] });
  // courtyard
  const target = add({ type: 'target', route: [[-14, 40], [-6, 44.5], [6, 44.5], [14, 40], [6, 31.5], [-6, 31.5]], maxY: 1 });
  add({ type: 'bodyguard', route: [[-15.4, 39]], follow: target, offset: [1.4, -1.3], maxY: 1 });
  add({ type: 'bodyguard', route: [[-15.4, 41]], follow: target, offset: [-1.4, -1.3], maxY: 1 });
  add({ route: [[16, 30], [16, 46.5], [-16, 46.5], [-16, 30]], maxY: 1 });
  G.target = target;
  return list;
}
