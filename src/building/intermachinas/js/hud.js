// HUD: health, anonymity status, objective, context prompt, enemy awareness
// markers (projected into screen space), toasts, banners, debug readout.
import * as THREE from './vendor/three.module.min.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(G) {
    this.G = G;
    this.el = {
      hp: $('hp-fill'), status: $('status'), prompt: $('prompt'), objective: $('objective'),
      toast: $('toast'), banner: $('banner'), bannerSub: $('banner-sub'), markers: $('markers'),
      debug: $('debug'), vignette: $('vignette'), hint: $('hint'),
    };
    this.markers = new Map();
    this.v = new THREE.Vector3();
    this.toastT = 0; this.hintT = 0; this.bannerT = 0;
  }

  reset() {
    for (const m of this.markers.values()) m.remove();
    this.markers.clear();
    this.banner('', '', 0);
  }

  toast(text) { this.el.toast.textContent = text; this.el.toast.classList.add('on'); this.toastT = 2.4; }
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

    // anonymity status
    let st = 'ANONYMOUS', cls = '';
    const live = G.enemies.filter((e) => e.alive);
    if (live.some((e) => e.state === 'combat' && e.vis > 0)) { st = 'EXPOSED'; cls = 'red'; }
    else if (live.some((e) => e.state === 'combat')) { st = 'COMBAT'; cls = 'red'; }
    else if (live.some((e) => e.state === 'search' || e.state === 'investigate')) { st = 'SEARCHING'; cls = 'yellow'; }
    else if (live.some((e) => e.state === 'suspicious')) { st = 'NOTICED'; cls = 'yellow'; }
    if (P.hidden && cls !== 'red') { st = 'HIDDEN'; cls = 'green'; }
    if (P.state === 'dead') st = '';
    el.status.textContent = st; el.status.className = cls;

    const dev = G.input.lastDevice;
    const key = dev === 'pad' ? 'RB' : dev === 'touch' ? 'F' : 'F';
    el.prompt.textContent = P.prompt ? `[${key}] ${P.prompt}` : '';
    el.prompt.classList.toggle('counter', P.prompt === 'COUNTER');

    if (this.toastT > 0 && (this.toastT -= dt) <= 0) el.toast.classList.remove('on');
    if (this.hintT > 0 && (this.hintT -= dt) <= 0) el.hint.classList.remove('on');
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) el.banner.parentElement.classList.remove('on');

    this.updateMarkers();
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
      const st = e.state === 'combat' ? 'combat' : e.state === 'patrol' && e.awareness < 0.05 ? 'calm' : 'alert';
      if (m.dataset.s !== st) { m.dataset.s = st; }
      m.firstChild.style.height = Math.round(Math.min(1, e.awareness) * 100) + '%';
      m.lastChild.textContent = e.state === 'combat' ? '!' : st === 'alert' ? '?' : '';
    }
  }

  debug(text) { if (this._dbg !== text) { this._dbg = text; this.el.debug.textContent = text; } }
}
