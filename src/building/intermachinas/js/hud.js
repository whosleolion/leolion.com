// HUD: health + momentum, anonymity status, objective, context prompt,
// freeflow combo counter, enemy markers (projected into screen space),
// detection arrows around the screen centre (Hitman / AC Unity style: which
// way someone is noticing you from, filling as they do), speed lines,
// toasts, banners, debug readout.
import * as THREE from './vendor/three.module.min.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(G) {
    this.G = G;
    this.el = {
      hp: $('hp-fill'), flow: $('flow-fill'), status: $('status'), prompt: $('prompt'), objective: $('objective'),
      toast: $('toast'), banner: $('banner'), bannerSub: $('banner-sub'), markers: $('markers'), arrows: $('arrows'),
      debug: $('debug'), vignette: $('vignette'), hint: $('hint'), combo: $('combo'), speed: $('speedlines'),
    };
    this.markers = new Map();
    this.arrows = new Map();
    this.v = new THREE.Vector3();
    this.toastT = 0; this.hintT = 0; this.bannerT = 0;
  }

  reset() {
    for (const m of this.markers.values()) m.remove();
    for (const m of this.arrows.values()) m.remove();
    this.markers.clear(); this.arrows.clear();
    this.banner('', '', 0);
  }

  toast(text) {
    const t = this.el.toast;
    t.textContent = text; t.classList.remove('on'); void t.offsetWidth; t.classList.add('on'); this.toastT = 2.2;
  }
  hint(text) { this.el.hint.textContent = text; this.el.hint.classList.add('on'); this.hintT = 7; }
  banner(text, sub = '', t = 3) {
    this.el.banner.textContent = text; this.el.bannerSub.textContent = sub;
    this.el.banner.parentElement.classList.toggle('on', !!text);
    this.bannerT = t;
  }
  damage() {
    const v = this.el.vignette;
    v.classList.remove('hit'); void v.offsetWidth; v.classList.add('hit');
  }
  objective(text) { this.el.objective.textContent = text; }

  update(dt) {
    const G = this.G, P = G.player, el = this.el;
    el.hp.style.width = Math.max(0, P.hp) + '%';
    el.hp.classList.toggle('low', P.hp < 30);
    el.flow.style.width = Math.round(P.flow * 100) + '%';

    // anonymity status
    let st = 'ANONYMOUS', cls = '';
    const live = G.enemies.filter((e) => e.alive);
    if (live.some((e) => e.state === 'combat' && e.vis > 0)) { st = 'EXPOSED'; cls = 'red'; }
    else if (live.some((e) => e.state === 'combat')) { st = 'HUNTED'; cls = 'red'; }
    else if (live.some((e) => e.state === 'search' || e.state === 'investigate')) { st = 'SEARCHING'; cls = 'yellow'; }
    else if (live.some((e) => e.state === 'suspicious')) { st = 'NOTICED'; cls = 'yellow'; }
    if (P.hidden && cls !== 'red') { st = 'HIDDEN'; cls = 'green'; }
    if (P.state === 'dead') st = '';
    if (el.status.textContent !== st) el.status.textContent = st;
    el.status.className = cls;

    const dev = G.input.lastDevice;
    const key = dev === 'pad' ? 'RB' : 'F';
    const pr = P.prompt ? `[${key}] ${P.prompt}` : '';
    if (el.prompt.textContent !== pr) el.prompt.textContent = pr;
    el.prompt.className = P.prompt === 'COUNTER' ? 'counter' : P.prompt === 'EXECUTE' || P.prompt === 'CHAIN KILL' ? 'gold' : '';

    // combo
    const c = P.combo;
    const ct = c >= 2 ? `×${c}${P.freeflow ? ' FREEFLOW' : ''}` : '';
    if (el.combo.textContent !== ct) {
      el.combo.textContent = ct;
      el.combo.classList.remove('pop'); void el.combo.offsetWidth; if (ct) el.combo.classList.add('pop');
    }
    el.combo.classList.toggle('flow', P.freeflow);

    el.speed.style.opacity = (Math.max(0, (G.cam.speedK || 0) - 0.35) * 0.9).toFixed(2);

    if (this.toastT > 0 && (this.toastT -= dt) <= 0) el.toast.classList.remove('on');
    if (this.hintT > 0 && (this.hintT -= dt) <= 0) el.hint.classList.remove('on');
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) el.banner.parentElement.classList.remove('on');

    this.updateMarkers();
    this.updateArrows();
  }

  enemyState(e) {
    if (e.broken) return 'broken';
    if (e.attack && e.attack.phase === 'windup') return 'windup';
    if (e.state === 'combat') return 'combat';
    if (e.state === 'patrol' && e.awareness < 0.05) return 'calm';
    return 'alert';
  }

  updateMarkers() {
    const G = this.G, cam = G.camera, P = G.player;
    const w = innerWidth, h = innerHeight;
    for (const e of G.enemies) {
      let m = this.markers.get(e);
      const isTarget = e === G.target;
      const show = e.alive && (e.awareness > 0.02 || e.state !== 'patrol' || G.synced || isTarget);
      const dist = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
      if (!show || (dist > 60 && !isTarget)) { if (m) m.style.display = 'none'; continue; }
      if (!m) {
        m = document.createElement('div');
        m.className = 'marker' + (isTarget ? ' target' : '');
        m.innerHTML = '<i></i><b></b>';
        this.el.markers.appendChild(m);
        this.markers.set(e, m);
      }
      this.v.set(e.pos.x, e.pos.y + 2.25, e.pos.z).project(cam);
      if (this.v.z > 1) { m.style.display = 'none'; continue; }
      m.style.display = '';
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
      m.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      const st = this.enemyState(e);
      if (m.dataset.s !== st) m.dataset.s = st;
      m.firstChild.style.height = Math.round(Math.min(1, e.awareness) * 100) + '%';
      const label = st === 'windup' ? '⚡' : st === 'broken' ? '✕' : e.state === 'combat' ? '!' : st === 'alert' ? '?' : '';
      if (m.lastChild.textContent !== label) m.lastChild.textContent = label;
    }
  }

  // arrows on a ring around the screen centre, pointing at whoever is noticing you
  updateArrows() {
    const G = this.G, P = G.player;
    const cy = G.cam.yaw, fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
    const rad = Math.min(innerWidth, innerHeight) * 0.24;
    for (const e of G.enemies) {
      let a = this.arrows.get(e);
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      const st = e.alive ? this.enemyState(e) : 'calm';
      const relevant = e.alive && d < 30 && (st === 'windup' || (e.state !== 'combat' && e.awareness > 0.04 && e.vis > 0) || (e.state === 'combat' && e.vis > 0 && d > 6));
      if (!relevant) { if (a) a.style.display = 'none'; continue; }
      if (!a) { a = document.createElement('div'); a.className = 'arrow'; a.innerHTML = '<i></i>'; this.el.arrows.appendChild(a); this.arrows.set(e, a); }
      const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz); // 0 = straight ahead
      a.style.display = '';
      a.style.transform = `translate(${(Math.sin(ang) * rad).toFixed(1)}px, ${(-Math.cos(ang) * rad).toFixed(1)}px) rotate(${ang.toFixed(3)}rad)`;
      a.dataset.s = st;
      a.firstChild.style.height = Math.round(Math.min(1, e.awareness) * 100) + '%';
    }
  }

  debug(text) { if (this._dbg !== text) { this._dbg = text; this.el.debug.textContent = text; } }
}
