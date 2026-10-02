// Player: freerun / climb / wall-run / vault, stealth (crouch + hiding),
// freeflow melee, counters, posture executions and assassination chains.
//
// Locomotion states: ground | air | climb | wallrun | scripted | sync | dead
// Ground "actions" layer on top: attack | dodge | roll | slide | hurt | land | recoil | whistle
//
// Feel notes (v0.2), and where they come from:
//  - coyote time + jump buffer (platformer staples): jumps pressed a hair late
//    off an edge, or a hair early before landing / grabbing, still come out.
//  - momentum steering while freerunning (Mirror's Edge): velocity rotates
//    toward the stick instead of braking through zero; a `flow` meter builds
//    from clean parkour (vaults, wall-kicks, rolls) and raises top speed.
//  - landing rolls (Mirror's Edge): tap C just before a big landing, or land
//    while freerunning, to roll out with your speed and less damage.
//  - parkour down / fast climb (AC Unity): crouch-walk off a roof edge to drop
//    onto the wall and hang; hold Shift on a wall to climb fast; climb wraps
//    around corners.
//  - freeflow combat (Arkham): landed hits build a combo; at x4 you're in
//    FREEFLOW (faster swings, long-range snap to targets, more damage).
//    Getting hit resets it. Counters from range; perfect counters add more.
//  - posture (Sekiro): blocked hits fill a guard's posture; when it breaks,
//    F executes. Kills by F open a short window to CHAIN to the next guard.
import { T } from './tuning.js';
import { Rig, Poses } from './rig.js';
import { sfx } from './audio.js';

const R = 0.35, H = 1.8, HC = 1.2, CHEST = 1.3;
const TAU = Math.PI * 2;
const COYOTE = 0.14, JUMP_BUFFER = 0.16, ROLL_WINDOW = 0.4, CHAIN_WINDOW = 1.1;

const ATTACKS = {
  L1:     { dur: 0.40, hit: 0.15, dmg: 20, range: 2.2, knock: 1.5, posture: 0.18, next: { light: 'L2', heavy: 'H' } },
  L2:     { dur: 0.40, hit: 0.15, dmg: 20, range: 2.2, knock: 1.5, posture: 0.18, next: { light: 'L3', heavy: 'LAUNCH' } },
  L3:     { dur: 0.60, hit: 0.25, dmg: 32, range: 2.4, knock: 7, posture: 0.3, finisher: true, next: { light: 'L1', heavy: 'H' } },
  H:      { dur: 0.72, hit: 0.34, dmg: 42, range: 2.3, knock: 5, posture: 0.55, breaks: true, next: { light: 'L1', heavy: 'H' } },
  LAUNCH: { dur: 0.75, hit: 0.34, dmg: 30, range: 2.9, knock: 8, posture: 0.4, breaks: true, aoe: true, finisher: true, next: { light: 'L1' } },
};

const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const turn = (a, b, rate) => { const d = angDiff(a, b); return a + Math.sign(d) * Math.min(Math.abs(d), rate); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Player {
  constructor(G) {
    this.G = G;
    this.rig = new Rig({ look: 'player' });
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
    this.noiseT = 0; this.combatCalm = 99;
    this.prompt = ''; this.context = null; this.lockTarget = null;
    this.jumpBuf = 0; this.airT = 0; this.jumped = false; this.jumpCut = true; this.rollBuf = 0;
    this.flow = 0; this.bank = 0; this.prevYaw = this.yaw; this.accelLean = 0; this.prevSpeed = 0;
    this.combo = 0; this.comboT = 0; this.chainT = 0; this.whistleCD = 0; this.dustT = 0;
    this.stats = { kills: 0, assassinations: 0, detected: 0, bestCombo: 0 };
    this.rig.applyNow(Poses.idle(0));
    this.sync();
  }

  get height() { return this.crouch ? HC : H; }
  get speedXZ() { return Math.hypot(this.vel.x, this.vel.z); }
  get forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  get iframes() { return this.action && ((this.action.type === 'dodge' && this.action.t < 0.28) || this.action.type === 'roll'); }
  get climbing() { return this.state === 'climb'; }
  get freeflow() { return this.combo >= 4; }

  consumeJump() { if (this.jumpBuf > 0) { this.jumpBuf = 0; return true; } return false; }
  addFlow(a) { this.flow = Math.min(1, this.flow + a); }

  // ---------------------------------------------------------------- update
  update(dt) {
    const G = this.G, inp = G.input;
    this.t += dt;
    this.grabCD -= dt; this.wallrunCD -= dt; this.noiseT -= dt; this.whistleCD -= dt;
    this.jumpBuf -= dt; this.rollBuf -= dt; this.chainT -= dt; this.dustT -= dt;
    if (inp.pressed('jump')) this.jumpBuf = JUMP_BUFFER;
    if (this.combo > 0 && (this.comboT += dt) > 2.2) this.combo = 0;

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

    // momentum decays when you stop flowing
    if (this.state === 'ground' && this.speedXZ < 4) this.flow = Math.max(0, this.flow - dt * 0.9);
    else if (this.sprinting && this.state === 'ground') this.flow = Math.min(1, this.flow + dt * 0.06);

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
    const rank = { counter: 0, execute: 1, chain: 2, air: 3, assassinate: 4 };
    const take = (c) => { if (!best || rank[c.kind] < rank[best.kind] || (rank[c.kind] === rank[best.kind] && c.d < best.d)) best = c; };
    const counterRange = this.freeflow ? 7 : 3.6;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, dy = p.y - e.pos.y;
      const d = Math.hypot(dx, dz);
      const level = Math.abs(dy) < 1.5;
      // dash moves are scripted (no collision), so long ones need a clear line
      const clear = () => d < 2.5 || G.world.lineClear(p.x, p.y + 1, p.z, e.pos.x, e.pos.y + 1, e.pos.z);
      if (this.state === 'ground' && level) {
        // counter: a guard winding up on me
        if (e.attack && e.attack.phase === 'windup' && e.attack.melee && d < counterRange && clear()) { take({ kind: 'counter', e, d, label: 'COUNTER' }); continue; }
        // execute: posture broken
        if (e.broken && d < 3.6 && clear()) { take({ kind: 'execute', e, d, label: 'EXECUTE' }); continue; }
        // chain: right after an F-kill, the next one is a dash away
        if (this.chainT > 0 && d < 9 && (e.state !== 'combat' || e.broken) && !(e.attack && e.attack.phase === 'strike') && clear()) { take({ kind: 'chain', e, d, label: 'CHAIN KILL' }); continue; }
      }
      // air / ledge assassination
      if ((this.state === 'air' || this.state === 'climb') && dy > 0.8 && dy < 9) {
        const lx = dx - this.vel.x * 0.15, lz = dz - this.vel.z * 0.15, ld = Math.hypot(lx, lz);
        if ((ld < (this.state === 'climb' ? 3.2 : 3.0) && e.state !== 'combat') || ld < 1.8) take({ kind: 'air', e, d, label: 'AIR ASSASSINATE' });
        continue;
      }
      // ground assassination: target unaware of me
      if (this.state === 'ground' && e.state !== 'combat' && Math.abs(dy) < 1.2 && d < 2.8) {
        const facing = (dx * f.x + dz * f.z) / Math.max(d, 1e-3);
        if (facing > -0.2 || d < 1.4) take({ kind: 'assassinate', e, d, label: 'ASSASSINATE' });
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
    const ux = dx / d, uz = dz / d;
    const at = (gap) => ({ x: e.pos.x - ux * gap, y: e.pos.y, z: e.pos.z - uz * gap });
    this.yaw = Math.atan2(dx, dz);
    this.action = null;
    const fxKill = (color) => { G.fx.vfx.sparks(e.pos.x, e.pos.y + 1.2, e.pos.z, 16, color); };

    if (c.kind === 'counter') {
      const perfect = e.attack.windup - e.attack.t < 0.22;
      e.freeze(0.9);
      const dash = Math.max(0, d - 1.0);
      this.script = {
        t: 0, dur: 0.42 + dash / 22, from: { ...p }, to: at(1.0), arc: 0,
        anim: (u) => Poses.attack('COUNTER', u), hitAt: 0.6,
        hit: () => { this.kill(e, 'counter'); sfx.blade(); G.fx.shake(0.4); fxKill(perfect ? 0x9fd8ff : 0xffffff); },
        after: 'ground',
      };
      this.state = 'scripted';
      this.bumpCombo(perfect ? 2 : 1);
      if (perfect) { sfx.perfect(); G.hud.toast('PERFECT COUNTER'); }
      G.fx.slowmo(perfect ? 0.15 : 0.3, 0.45);
      G.noise(p.x, p.y, p.z, 14, false);
      return;
    }
    if (c.kind === 'execute') {
      e.freeze(1.2);
      this.script = {
        t: 0, dur: 0.55 + Math.max(0, d - 1) / 20, from: { ...p }, to: at(0.9), arc: 0.15,
        anim: (u) => Poses.attack('EXECUTE', u), hitAt: 0.62,
        hit: () => { this.kill(e, 'execute'); sfx.heavy(); sfx.blade(); G.fx.shake(0.55); G.fx.hitstop(0.08); fxKill(0xffd166); },
        after: 'ground',
      };
      this.state = 'scripted'; this.bumpCombo(1);
      G.fx.slowmo(0.35, 0.4);
      return;
    }
    if (c.kind === 'chain') {
      e.freeze(1.2);
      this.script = {
        t: 0, dur: Math.max(0.3, d / 20) + 0.2, from: { ...p }, to: at(0.75), arc: 0,
        anim: (u) => Poses.attack('ASSASSIN', Math.min(1, u * 1.2)), hitAt: 0.8,
        hit: () => { this.kill(e, 'chain'); sfx.blade(); G.fx.shake(0.2); fxKill(0xffffff); },
        after: 'ground',
      };
      this.state = 'scripted';
      G.fx.slowmo(0.4, 0.35);
      G.noise(p.x, p.y, p.z, 4, false);
      return;
    }
    if (c.kind === 'assassinate') {
      e.freeze(0.8);
      this.script = {
        t: 0, dur: 0.6, from: { ...p }, to: at(0.75), arc: 0,
        anim: (u) => Poses.attack('ASSASSIN', u), hitAt: 0.38,
        hit: () => { this.kill(e, 'assassinate'); sfx.blade(); G.fx.shake(0.15); fxKill(0xffffff); },
        after: 'ground',
      };
      this.state = 'scripted';
      G.noise(p.x, p.y, p.z, 3.5, false);
      return;
    }
    if (c.kind === 'air') {
      e.freeze(1.2);
      const drop = Math.max(0, p.y - e.pos.y);
      this.script = {
        t: 0, dur: 0.32 + drop * 0.035, from: { ...p }, to: at(0.5), arc: 0.6,
        anim: (u) => Poses.attack('AIR', u), hitAt: 0.9,
        hit: () => { this.kill(e, 'air'); sfx.blade(); sfx.land(1); G.fx.shake(0.5); fxKill(0xffffff); G.fx.vfx.dust(e.pos.x, e.pos.y, e.pos.z, 16, 4); },
        after: 'ground', land: true,
      };
      this.state = 'scripted';
      G.noise(p.x, p.y, p.z, 6, false);
    }
  }

  kill(e, how) {
    e.die(how, this.pos);
    this.stats.kills++;
    if (how === 'assassinate' || how === 'air' || how === 'chain') this.stats.assassinations++;
    this.chainT = CHAIN_WINDOW;
    this.G.onKill(e, how);
  }

  bumpCombo(n = 1) {
    const was = this.freeflow;
    this.combo += n; this.comboT = 0;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
    if (!was && this.freeflow) { sfx.freeflow(); this.G.hud.toast('FREEFLOW'); }
  }

  // ---------------------------------------------------------------- ground
  updateGround(dt) {
    const G = this.G, W = G.world, inp = G.input, p = this.pos, v = this.vel;
    const a = this.action;
    if (a) a.t += dt * (a.type === 'attack' && this.freeflow ? 1.3 : 1);
    this.airT = 0; this.jumped = false;

    // crouch / slide
    if (inp.pressed('crouch') && !a) {
      if (this.sprinting && this.speedXZ > 7) {
        this.action = { type: 'slide', t: 0, dur: 0.7 }; this.crouch = true; sfx.slide();
      } else this.crouch = !this.crouch;
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
    const act = this.action;
    if (act) {
      busy = true;
      if (act.type === 'attack') this.updateAttack(dt);
      else if (act.type === 'dodge') {
        const u = act.t / act.dur, s = 13 * (1 - u * u);
        v.x = act.dx * s; v.z = act.dz * s;
        if (act.t >= act.dur) this.action = null;
      } else if (act.type === 'slide') {
        const k = Math.exp(-1.3 * dt); v.x *= k; v.z *= k;
        if (this.dustT <= 0) { G.fx.vfx.dust(p.x, p.y, p.z, 2, 1.2); this.dustT = 0.05; }
        if (act.t >= act.dur) { this.action = null; this.crouch = false; }
        else if (act.t > 0.15 && this.consumeJump()) { this.action = null; this.crouch = false; this.addFlow(0.1); busy = false; if (this.jumpFromGround(true)) return; }
      } else if (act.type === 'roll') {
        // keep (most of) the speed through the roll
        const u = act.t / act.dur;
        v.x = act.dx * act.speed * (1 - 0.25 * u); v.z = act.dz * act.speed * (1 - 0.25 * u);
        if (act.t >= act.dur) this.action = null;
        else if (act.t > 0.28 && this.consumeJump()) { this.action = null; busy = false; if (this.jumpFromGround(true)) return; }
      } else {
        // hurt / land / recoil / hayland / whistle: brief loss of control
        const k = Math.exp(-10 * dt); v.x *= k; v.z *= k;
        if (act.t >= act.dur) this.action = null;
      }
    }

    if (!busy) {
      let speed = 0;
      if (this.wishLen > 0.05) {
        speed = this.crouch ? T.crouchSpeed : this.sprinting ? T.sprint * (1 + 0.15 * this.flow) : T.jog * (this.wishLen < 0.6 ? 0.5 : 1);
        if (this.lockTarget && !this.sprinting) speed = Math.min(speed, T.jog * 0.75);
      }
      const cur = this.speedXZ;
      const into = cur > 0.1 ? (v.x * this.wish.x + v.z * this.wish.z) / cur : 1;
      if (this.sprinting && cur > 3 && into > -0.3) {
        // momentum steering: rotate the velocity, don't brake through zero
        const ang = turn(Math.atan2(v.x, v.z), Math.atan2(this.wish.x, this.wish.z), (11 - 4 * Math.min(1, cur / 10)) * dt);
        const up = cur < T.jog ? T.accel : T.accel * 0.35; // freerun builds up over ~half a second
        const mag = cur + clamp(speed - cur, -T.accel * dt, up * dt);
        v.x = Math.sin(ang) * mag; v.z = Math.cos(ang) * mag;
      } else {
        const tx = this.wish.x * speed, tz = this.wish.z * speed;
        let dx = tx - v.x, dz = tz - v.z;
        const dl = Math.hypot(dx, dz), maxd = T.accel * dt * (into < -0.3 && cur > 6 ? 0.6 : 1); // skid on hard reversals
        if (dl > maxd) { dx *= maxd / dl; dz *= maxd / dl; }
        v.x += dx; v.z += dz;
        if (into < -0.3 && cur > 6 && this.dustT <= 0) { G.fx.vfx.dust(p.x, p.y, p.z, 3, 2); this.dustT = 0.06; }
      }
      // facing
      if (this.lockTarget) this.yaw = turn(this.yaw, Math.atan2(this.lockTarget.pos.x - p.x, this.lockTarget.pos.z - p.z), 12 * dt);
      else if (this.speedXZ > 0.3) this.yaw = turn(this.yaw, Math.atan2(v.x, v.z), 14 * dt);

      if (this.consumeJump()) { if (this.jumpFromGround()) return; }
      if (inp.pressed('dodge')) this.startDodge();
      else if (inp.pressed('light')) this.startAttack('L1');
      else if (inp.pressed('heavy')) this.startAttack('H');
      else if (inp.pressed('whistle') && this.whistleCD <= 0) {
        this.whistleCD = 1.5; this.action = { type: 'whistle', t: 0, dur: 0.5 };
        sfx.whistle(); G.noise(p.x, p.y, p.z, 11, true);
      }
    }
    v.y = 0;

    // move + collide
    const px = p.x, pz = p.z, py = p.y;
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
      const rolling = act && (act.type === 'dodge' || act.type === 'roll' || act.type === 'slide');
      if (!this.sprinting && drop > 1.6 && !rolling) {
        // low profile: don't walk off roofs. Crouched? drop down onto the wall and hang (parkour down)
        if (this.crouch && this.wishLen > 0.3 && this.tryHangDown(px, pz, py)) return;
        p.x = px; p.z = pz; v.x = v.z = 0;
      } else {
        this.state = 'air'; this.peakY = p.y; this.airT = 0;
        if (act && act.type !== 'roll' && act.type !== 'slide') this.action = null;
        if (this.sprinting && drop > 1.2) { this.doJump(T.jump * 0.85, false); } // auto freerun leap
      }
    }

    // footsteps / noise / dust
    const sp = this.speedXZ;
    if (sp > 0.3) {
      const prev = this.phase;
      this.phase += sp * dt * Math.PI / (0.85 + 0.09 * sp);
      if (Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI) && !this.crouch && sp > 2.5) {
        sfx.step();
        if (sp > 8) G.fx.vfx.dust(p.x, p.y, p.z, 1, 1);
      }
      if (this.sprinting && this.noiseT <= 0) { G.noise(p.x, p.y, p.z, 7, true); this.noiseT = 0.45; }
    }
  }

  doJump(vy, fromPress) {
    const v = this.vel;
    v.y = vy;
    this.state = 'air'; this.peakY = this.pos.y; this.crouch = false;
    this.jumped = true; this.jumpCut = !fromPress; this.airT = 0;
    sfx.jump();
  }

  jumpFromGround(fromFlow = false) {
    const W = this.G.world, p = this.pos, v = this.vel, f = this.forward;
    // jump at a wall in front: start climbing with a leap
    const dir = this.wishLen > 0.2 ? this.wish : f;
    const hit = W.raycast(p.x, p.y + CHEST, p.z, dir.x, 0, dir.z, R + 0.8);
    if (hit && hit.box.climbable && Math.abs(hit.ny) < 0.1 && hit.box.max.y - p.y > 1.4) {
      this.enterClimb(hit, this.sprinting ? 'run' : 'jump');
      return true;
    }
    this.action = null;
    if (this.sprinting || fromFlow) {
      // freerun leap: carry the speed, a touch more distance
      const sp = Math.max(this.speedXZ, T.sprint * 0.9);
      const hx = this.speedXZ > 0.5 ? v.x / this.speedXZ : dir.x, hz = this.speedXZ > 0.5 ? v.z / this.speedXZ : dir.z;
      v.x = hx * sp * 1.08; v.z = hz * sp * 1.08;
    }
    this.doJump(T.jump, true);
    this.G.fx.vfx.dust(p.x, p.y, p.z, 4, 1.5);
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
        this.G.fx.vfx.dust(p.x + dx * t0, top, p.z + dz * t0, 5, 1.5);
        this.addFlow(0.2); sfx.vault();
        // carry speed out of the vault (a small boost when freerunning)
        if (this.sprinting) { this.vel.x = dx * sp * 1.05; this.vel.z = dz * sp * 1.05; }
        this.startScript({ x: lx, y: g.y, z: lz }, Math.max(0.3, dist / (sp * 1.1)), 0, (u) => Poses.vault(u),
          { keepVel: true, peakAbs: top + 0.45 });
        return true;
      }
    }
    // mantle up onto it
    const mx = p.x + dx * (t0 + R + 0.2), mz = p.z + dz * (t0 + R + 0.2);
    if (W.blocked(mx, mz, R * 0.9, top + 0.05, top + 1.75)) return false;
    this.addFlow(0.08);
    this.startScript({ x: mx, y: top, z: mz }, 0.26, 0.25, (u) => Poses.mantle(u), { keepVel: true });
    return true;
  }

  // AC Unity "parkour down": crouch-walk off an edge to drop onto the wall and hang
  tryHangDown(px, pz, edgeY) {
    const W = this.G.world, d = this.wish;
    const ox = px + d.x * (R + 0.75), oz = pz + d.z * (R + 0.75);
    const hit = W.raycast(ox, edgeY - 0.6, oz, -d.x, 0, -d.z, 1.5);
    if (!hit || !hit.box.climbable || Math.abs(hit.ny) > 0.1 || hit.nx * d.x + hit.nz * d.z < 0.7) return false;
    const y = edgeY - 1.75;
    if (W.groundAt(hit.x + hit.nx * 0.5, hit.z + hit.nz * 0.5, 0.2, y + 0.5).y > y - 0.2) return false; // ground's right there: just walk
    const to = { x: hit.x + hit.nx * (R + 0.05), y, z: hit.z + hit.nz * (R + 0.05) };
    this.startScript(to, 0.32, 0.15, (u) => Poses.mantle(1 - u), { after: 'climb', climbHit: hit });
    this.yaw = Math.atan2(-hit.nx, -hit.nz);
    this.crouch = false;
    sfx.vault();
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
      if (s.after === 'climb') {
        const h = s.climbHit;
        this.state = 'climb';
        this.cl = { nx: h.nx, nz: h.nz, leapT: 0, leapVy: 0, leapVl: 0 };
        this.vel.x = this.vel.y = this.vel.z = 0;
        return;
      }
      this.state = s.after;
      if (s.keepVel) { this.vel.x = s.vel.x; this.vel.z = s.vel.z; } else { this.vel.x = this.vel.z = 0; }
      this.vel.y = 0;
      this.peakY = p.y;
      if (s.land) this.action = { type: 'land', t: 0, dur: 0.3 };
      // landed on nothing?
      const g = this.G.world.groundAt(p.x, p.z, R * 0.6, p.y + 0.1);
      if (g.y < p.y - 0.3) { this.state = 'air'; this.airT = 0; this.jumped = false; }
    }
  }

  // ------------------------------------------------------------------- air
  updateAir(dt) {
    const G = this.G, W = G.world, inp = G.input, p = this.pos, v = this.vel;
    this.airT += dt;
    if (inp.pressed('crouch')) this.rollBuf = ROLL_WINDOW;
    // coyote time: a jump pressed just after running off an edge still counts
    if (!this.jumped && this.airT < COYOTE && this.jumpBuf > 0) {
      this.jumpBuf = 0;
      if (this.sprinting) { const sp = Math.max(this.speedXZ, T.sprint * 0.9) * 1.08, h = this.speedXZ || 1; v.x = v.x / h * sp; v.z = v.z / h * sp; }
      this.doJump(T.jump, true);
    }
    // variable height: let go of jump early for a shorter hop
    if (!this.jumpCut && v.y > 0 && !inp.held('jump')) { v.y *= 0.55; this.jumpCut = true; }

    v.y = Math.max(-45, v.y - T.gravity * (v.y < 0 ? 1.12 : 1) * dt); // slightly heavier on the way down
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
    if ((this.sprinting || this.speedXZ > 7.5) && this.wallrunCD <= 0 && this.speedXZ > 6 && v.y > -5) {
      const hs = this.speedXZ, vx = v.x / hs, vz = v.z / hs;
      for (const side of [1, -1]) {
        // side>0 = wall on the left
        const sx = vz * side, sz = -vx * side;
        const hit = W.raycast(p.x, p.y + CHEST, p.z, sx, 0, sz, R + 0.8);
        if (!hit || !hit.box.climbable || Math.abs(hit.ny) > 0.1 || hit.box === this.lastWallBox) continue;
        const dot = vx * hit.nx + vz * hit.nz;
        if (Math.abs(dot) > 0.7) continue;
        let tx = vx - hit.nx * dot, tz = vz - hit.nz * dot; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
        this.state = 'wallrun';
        this.wr = { nx: hit.nx, nz: hit.nz, tx, tz, side, time: 0, box: hit.box, speed: Math.max(hs, T.sprint * 0.95) * (1 + 0.1 * this.flow) };
        v.y = Math.max(v.y, 3.8);
        sfx.vault();
        return;
      }
    }
  }

  land() {
    const G = this.G, W = G.world, p = this.pos, v = this.vel;
    const drop = this.peakY - p.y;
    this.state = 'ground'; v.y = 0; this.lastWallBox = null; this.jumped = false;
    const hay = W.volumeAt(p.x, p.y + 0.2, p.z, 'hay');
    if (hay) {
      v.x = v.z = 0; this.crouch = true;
      this.action = { type: 'hayland', t: 0, dur: 0.5 };
      sfx.land(0.4); G.fx.vfx.burst(p.x, p.y + 1.1, p.z, 18, { color: 0xf3e3a0, speed: 3, up: 3, life: 0.8, size: 0.1, g: 6 });
      if (drop > 12) G.hud.toast('LEAP OF FAITH');
      return;
    }
    const sp = this.speedXZ;
    G.fx.vfx.dust(p.x, p.y, p.z, Math.min(18, 3 + Math.round(drop * 1.5)), 1.5 + drop * 0.25);
    const wantsRoll = this.rollBuf > 0 || (this.sprinting && drop < T.fallSafe + 4);
    if (drop > 3.2 && wantsRoll) {
      // landing roll: keep moving, soak the fall
      const safe = T.fallSafe * 1.8;
      const hx = sp > 0.5 ? v.x / sp : this.forward.x, hz = sp > 0.5 ? v.z / sp : this.forward.z;
      this.action = { type: 'roll', t: 0, dur: 0.48, dx: hx, dz: hz, speed: Math.max(sp, 6) };
      this.yaw = Math.atan2(hx, hz);
      this.rollBuf = 0; this.addFlow(0.2);
      sfx.roll(); G.fx.shake(0.15);
      G.noise(p.x, p.y, p.z, 5, true);
      if (drop > safe) this.hurt((drop - safe) * 11, null, 'fall');
      return;
    }
    if (drop > T.fallSafe) {
      const dmg = (drop - T.fallSafe) * 11;
      this.action = { type: 'land', t: 0, dur: 0.6 };
      sfx.land(1.4); G.fx.shake(0.6);
      G.noise(p.x, p.y, p.z, 12, true);
      this.flow = 0;
      this.hurt(dmg, null, 'fall');
    } else if (drop > 3) {
      if (!this.sprinting) this.action = { type: 'land', t: 0, dur: 0.16 };
      sfx.land(0.8); G.fx.shake(0.12);
      G.noise(p.x, p.y, p.z, 6, true);
    } else sfx.land(0.3);
  }

  // Try to latch onto a wall (or catch a ledge) in direction dir.
  tryGrab(dir) {
    const W = this.G.world, p = this.pos;
    const chest = W.raycast(p.x, p.y + CHEST, p.z, dir.x, 0, dir.z, R + 0.5);
    if (chest && chest.box.climbable && Math.abs(chest.ny) < 0.1) { this.enterClimb(chest, null); return true; }
    if (!chest) {
      // ledge catch: a top somewhere below chest height — mantle straight up
      for (const y of [0.85, 0.35]) {
        const low = W.raycast(p.x, p.y + y, p.z, dir.x, 0, dir.z, R + 0.55);
        if (!low || Math.abs(low.ny) > 0.1) continue;
        const tx = p.x + dir.x * (low.t + R + 0.15), tz = p.z + dir.z * (low.t + R + 0.15);
        const g = W.groundAt(tx, tz, R * 0.5, p.y + CHEST);
        if (g.y > p.y && !W.blocked(tx, tz, R * 0.9, g.y + 0.05, g.y + 1.75)) {
          this.vel.x *= 0.7; this.vel.z *= 0.7;
          this.addFlow(0.1);
          this.G.fx.vfx.dust(tx, g.y, tz, 4, 1);
          this.startScript({ x: tx, y: g.y, z: tz }, 0.28, 0.2, (u) => Poses.mantle(u), { keepVel: true });
          return true;
        }
        break;
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
    // a jump pressed just before the grab turns straight into a climb leap
    else if (this.consumeJump()) { this.cl.leapT = 0.32; this.cl.leapVy = T.climbLeap; }
    sfx.grab();
  }

  updateClimb(dt) {
    const G = this.G, W = G.world, inp = G.input, p = this.pos, c = this.cl;
    let tx = c.nz, tz = -c.nx; // my right while facing the wall
    // map stick-x through the camera so "right" is right on screen
    const cy = G.cam.yaw, crx = Math.cos(cy), crz = -Math.sin(cy);
    const sgn = crx * tx + crz * tz >= -0.2 ? 1 : -1;
    const up = inp.move.y, lat = inp.move.x * sgn;
    const fast = inp.held('sprint') ? 1.7 : 1; // AC Unity: hold parkour-up to climb fast

    if (this.consumeJump()) {
      if (up < -0.5) { // eject backwards off the wall
        this.state = 'air'; this.grabCD = 0.35; this.peakY = p.y; this.airT = 0; this.jumped = true; this.jumpCut = true;
        this.vel.x = c.nx * 6.5; this.vel.z = c.nz * 6.5; this.vel.y = 7;
        this.yaw = Math.atan2(c.nx, c.nz); sfx.jump(); this.addFlow(0.15);
        return;
      }
      if (c.leapT <= 0) {
        c.leapT = 0.32;
        const sideways = Math.abs(lat) > 0.5 && up < 0.3;
        c.leapVy = sideways ? T.climbLeap * 0.35 : T.climbLeap;
        c.leapVl = Math.abs(lat) > 0.3 ? Math.sign(lat) * 6.5 : 0;
        sfx.jump();
      }
    }
    if (inp.pressed('crouch')) { // let go
      this.state = 'air'; this.grabCD = 0.45; this.peakY = p.y; this.airT = 1; this.jumped = true;
      this.vel.x = c.nx * 1.5; this.vel.z = c.nz * 1.5; this.vel.y = 0;
      return;
    }

    let vy = up * T.climbSpeed * fast, vl = lat * T.climbSpeed * 0.85 * fast;
    if (c.leapT > 0) {
      const k = c.leapT / 0.32;
      vy += c.leapVy * k; vl += c.leapVl * k;
      c.leapT -= dt;
    }
    const prevPhase = this.phase;
    this.phase += (Math.abs(vy) + Math.abs(vl)) * dt * 2.2;
    if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.phase / Math.PI)) sfx.step();

    // lateral, with corner wraps
    if (Math.abs(vl) > 0.01) {
      const s = Math.sign(vl), dtx = tx * s, dtz = tz * s;
      const nx = p.x + tx * vl * dt, nz = p.z + tz * vl * dt;
      const inner = W.raycast(p.x, p.y + CHEST, p.z, dtx, 0, dtz, R + 0.25);
      if (inner && Math.abs(inner.ny) < 0.1 && inner.box.climbable && inner.nx * dtx + inner.nz * dtz < -0.7) {
        // inside corner: turn onto the wall we just walked into
        c.nx = inner.nx; c.nz = inner.nz; this.yaw = Math.atan2(-c.nx, -c.nz);
      } else {
        const wall = W.raycast(nx, p.y + CHEST, nz, -c.nx, 0, -c.nz, R + 0.6) || W.raycast(nx, p.y + 0.5, nz, -c.nx, 0, -c.nz, R + 0.6);
        // (tested a little off the wall so ledges/bands we're hugging don't count as an inside corner)
        if (wall && !W.blocked(nx + c.nx * 0.45, nz + c.nz * 0.45, R * 0.7, p.y + 0.2, p.y + 1.6)) { p.x = nx; p.z = nz; }
        else if (!wall) {
          // outside corner: look back from just past the edge for the next face
          const qx = p.x + dtx * 0.9 - c.nx * (R + 0.5), qz = p.z + dtz * 0.9 - c.nz * (R + 0.5);
          const face = W.raycast(qx + dtx * 0.6, p.y + CHEST, qz + dtz * 0.6, -dtx, 0, -dtz, 1.6);
          if (face && face.box.climbable && Math.abs(face.ny) < 0.1 && face.nx * dtx + face.nz * dtz > 0.7) {
            c.nx = face.nx; c.nz = face.nz;
            p.x = face.x + c.nx * (R + 0.05); p.z = face.z + c.nz * (R + 0.05);
            this.yaw = Math.atan2(-c.nx, -c.nz);
            sfx.grab();
          } else c.leapVl = 0;
        } else c.leapVl = 0;
      }
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
            const sprint = inp.held('sprint') && up > 0.3;
            this.startScript({ x: fx, y: g.y, z: fz }, sprint ? 0.26 : 0.38, 0.35, (u) => Poses.mantle(u));
            if (sprint) { this.script.keepVel = true; this.script.vel = { x: -c.nx * T.sprint * 0.8, z: -c.nz * T.sprint * 0.8 }; this.addFlow(0.1); }
            this.yaw = Math.atan2(-c.nx, -c.nz);
            G.fx.vfx.dust(fx, g.y, fz, 4, 1);
            return;
          }
          c.leapT = 0;
        }
      }
    }
    // stay glued to whatever surface is in front
    const hit = W.raycast(p.x, p.y + CHEST, p.z, -c.nx, 0, -c.nz, R + 0.8) || W.raycast(p.x, p.y + 0.5, p.z, -c.nx, 0, -c.nz, R + 0.8);
    if (!hit) { this.state = 'air'; this.grabCD = 0.3; this.peakY = p.y; this.airT = 1; this.jumped = true; return; }
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
    const prevPhase = this.phase;
    this.phase += w.speed * dt * Math.PI / 1.7;
    if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.phase / Math.PI)) { sfx.step(); G.fx.vfx.dust(p.x - w.nx * R, p.y + 0.3, p.z - w.nz * R, 2, 1); }
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    this.peakY = Math.max(this.peakY, p.y);

    const leave = (jump) => {
      this.state = 'air'; this.wallrunCD = 0.25; this.lastWallBox = w.box; this.airT = 1; this.jumped = true;
      if (jump) {
        v.x = w.tx * w.speed * 0.85 + w.nx * 5.5; v.z = w.tz * w.speed * 0.85 + w.nz * 5.5;
        this.doJump(T.jump * 0.95, true);
        this.addFlow(0.25);
      }
    };
    if (w.time > 0.08 && this.consumeJump()) return leave(true);
    const ahead = W.raycast(p.x, p.y + CHEST, p.z, w.tx, 0, w.tz, R + 0.3);
    if (ahead) {
      if (ahead.box.climbable && Math.abs(ahead.ny) < 0.1) { this.enterClimb(ahead, null); return; }
      return leave(false);
    }
    const g = W.groundAt(p.x, p.z, R * 0.6, p.y + 0.05);
    if (v.y <= 0 && g.y >= p.y) { p.y = g.y; this.land(); return; }
    const hit = W.raycast(p.x, p.y + CHEST, p.z, -w.nx, 0, -w.nz, R + 1.0);
    if (!hit || w.time > T.wallrunTime || !(inp.held('sprint') || inp.move.y > 0.5)) return leave(false);
    const err = hit.t - (R + 0.1);
    p.x -= w.nx * err; p.z -= w.nz * err;
  }

  // ------------------------------------------------------------------ sync
  updateSync(dt) {
    this.syncT += dt;
    if (this.syncT > 3.4) { this.state = 'ground'; this.G.onSync(); }
  }

  // ---------------------------------------------------------------- combat
  pickTarget(range) {
    const p = this.pos;
    const dir = this.wishLen > 0.2 ? this.wish : this.forward;
    let best = null, bs = Infinity;
    for (const e of this.G.enemies) {
      if (!e.alive || Math.abs(e.pos.y - p.y) > 1.5) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > range) continue;
      const along = (dx * dir.x + dz * dir.z) / Math.max(d, 1e-3);
      if (d > 3 && along < 0.5) continue; // long snaps only go where you're pointing
      const s = d - 3.0 * along;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  startAttack(kind) {
    // freeflow: snap across the room to whoever you're pointing at
    const tgt = this.pickTarget(this.freeflow ? 9 : 6);
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
    this.G.fx.vfx.dust(this.pos.x, this.pos.y, this.pos.z, 4, 2);
  }

  updateAttack(dt) {
    const G = this.G, inp = G.input, a = this.action, A = ATTACKS[a.kind], p = this.pos, v = this.vel;
    // lunge toward target until contact
    const tg = a.target;
    if (tg && tg.alive && a.t < A.hit) {
      const dx = tg.pos.x - p.x, dz = tg.pos.z - p.z, d = Math.hypot(dx, dz);
      this.yaw = turn(this.yaw, Math.atan2(dx, dz), 24 * dt);
      const cap = this.freeflow ? 26 : 12;
      const s = d > 1.4 ? Math.min(cap, (d - 1.2) / Math.max(0.05, A.hit - a.t)) : 0;
      v.x = dx / d * s; v.z = dz / d * s;
    } else {
      const k = Math.exp(-14 * dt); v.x *= k; v.z *= k;
    }
    if (!a.hitDone && a.t >= A.hit) { a.hitDone = true; this.resolveHits(A, a.kind); }
    if (a.t > A.hit * 0.5) {
      if (inp.pressed('light') && A.next.light) a.queued = A.next.light;
      if (inp.pressed('heavy') && A.next.heavy) a.queued = A.next.heavy;
    }
    if (a.hitDone && inp.pressed('dodge')) { this.startDodge(); return; }
    if (a.queued && a.t >= A.hit + 0.08) { this.startAttack(a.queued); return; }
    if (a.t >= A.dur) this.action = null;
  }

  resolveHits(A, kind) {
    const G = this.G, p = this.pos, f = this.forward;
    let hits = 0, blocked = 0, broke = 0;
    const mult = T.playerDamage * (1 + 0.08 * Math.min(this.combo, 10));
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > A.range + 0.3 || Math.abs(e.pos.y - p.y) > 1.4) continue;
      if (!A.aoe && (dx * f.x + dz * f.z) / Math.max(d, 1e-3) < 0.4) continue;
      const r = e.takeHit(A.dmg * mult, { breaks: A.breaks, knock: A.knock, dx: dx / (d || 1), dz: dz / (d || 1), finisher: A.finisher, posture: A.posture });
      if (r === 'block') { blocked++; G.fx.vfx.sparks(e.pos.x - dx / d * 0.4, e.pos.y + 1.3, e.pos.z - dz / d * 0.4, 8, 0xffe08a); }
      else if (r === 'break') { broke++; G.fx.vfx.sparks(e.pos.x, e.pos.y + 1.3, e.pos.z, 18, 0xffd166); }
      else if (r === 'hit' || r === 'kill') {
        hits++;
        G.fx.vfx.sparks(e.pos.x - dx / d * 0.3, e.pos.y + 1.2, e.pos.z - dz / d * 0.3, r === 'kill' ? 18 : 9, r === 'kill' ? 0xff6b5b : 0xffffff);
        if (r === 'kill') { this.stats.kills++; G.onKill(e, 'combat'); }
      }
    }
    // the swing itself
    const tilt = kind === 'L1' ? 0.5 : kind === 'L2' ? -0.5 : kind === 'H' ? 1.2 : 0;
    const scale = A.aoe ? 1.9 : 1.15;
    G.fx.vfx.slash(p.x + (A.aoe ? 0 : f.x * 0.2), p.y + 1.15, p.z + (A.aoe ? 0 : f.z * 0.2), this.yaw, tilt, this.freeflow ? 0xffd166 : 0xffffff, scale);
    if (hits || broke) {
      this.bumpCombo(hits + broke);
      const big = A.finisher || A.breaks || broke;
      G.fx.hitstop((big ? 0.09 : 0.05) + Math.min(this.combo, 8) * 0.004);
      G.fx.shake(big ? 0.35 : 0.15);
      G.cam.punch(big ? 0.5 : 0.2);
      (big ? sfx.heavy : sfx.hit)();
      if (broke) { sfx.guardBreak(); G.hud.toast('GUARD BROKEN · F'); G.fx.slowmo(0.4, 0.25); }
    }
    if (blocked && !hits && !broke) {
      sfx.block(); G.fx.shake(0.1); G.fx.hitstop(0.04);
      this.action = { type: 'recoil', t: 0, dur: 0.28 };
      this.vel.x = -f.x * 3; this.vel.z = -f.z * 3;
    }
    G.noise(p.x, p.y, p.z, 16, false);
  }

  hurt(dmg, from, kind = 'melee') {
    const G = this.G;
    if (this.state === 'dead' || this.state === 'scripted' || this.state === 'sync') return false;
    if (kind !== 'fall' && this.iframes) return false;
    this.hp -= dmg;
    G.hud.damage();
    sfx.hurt(); G.fx.shake(0.35);
    if (kind !== 'fall') {
      if (this.combo >= 4) G.hud.toast('FREEFLOW BROKEN');
      this.combo = 0; this.flow *= 0.5;
    }
    if (from) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
      this.vel.x = dx / d * 4; this.vel.z = dz / d * 4;
    }
    if (this.state === 'climb' || this.state === 'wallrun') {
      this.state = 'air'; this.grabCD = 0.8; this.peakY = this.pos.y; this.airT = 1; this.jumped = true;
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
    // bank into turns + lean into acceleration
    const yawRate = dt > 0 ? angDiff(this.prevYaw, this.yaw) / dt : 0;
    this.prevYaw = this.yaw;
    const sp = this.speedXZ;
    const accel = dt > 0 ? (sp - this.prevSpeed) / dt : 0;
    this.prevSpeed = sp;
    this.bank += (clamp(-yawRate * 0.045 * Math.min(1, sp / 8), -0.38, 0.38) - this.bank) * Math.min(1, dt * 10);
    this.accelLean += (clamp(accel * 0.012, -0.25, 0.3) - this.accelLean) * Math.min(1, dt * 8);

    switch (this.state) {
      case 'ground':
        if (a && a.type === 'attack') { target = Poses.attack(a.kind, a.t / ATTACKS[a.kind].dur); rate = 26; }
        else if (a && a.type === 'dodge') { target = Poses.run(this.phase += dt * 18, 1, 0.8); target.spine[0] += 0.3; rate = 24; }
        else if (a && a.type === 'slide') { target = Poses.slide(); rate = 18; }
        else if (a && a.type === 'roll') { target = Poses.roll(Math.min(1, a.t / a.dur)); rate = 30; }
        else if (a && (a.type === 'hurt' || a.type === 'recoil')) { target = Poses.hurt(); rate = 22; }
        else if (a && a.type === 'land') { target = Poses.land(1 - a.t / a.dur); rate = 30; }
        else if (a && a.type === 'hayland') { target = Poses.hide(); }
        else if (a && a.type === 'whistle') { target = Poses.whistle(this.t); rate = 18; }
        else {
          if (this.hidden && sp < 0.5) target = Poses.hide();
          else if (sp < 0.3) target = this.lockTarget ? Poses.stance() : this.crouch ? Poses.run(0, 0, 1) : Poses.idle(this.t);
          else {
            target = Poses.run(this.phase, Math.max(0, Math.min(1, (sp - 2) / 7)), this.crouch ? 1 : 0);
            target.bodyZ += this.bank;
            target.spine[0] += this.accelLean + 0.08 * this.flow;
          }
        }
        break;
      case 'air': target = Poses.air(this.vel.y); target.bodyZ += this.bank * 0.5; rate = 10; break;
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
