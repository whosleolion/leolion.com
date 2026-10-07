// Input: keyboard + mouse (pointer lock), gamepad, and touch, folded into
// one set of actions so the game never cares which device is in use.
//   held(a) / pressed(a)   a in: jump sprint crouch light heavy action dodge whistle
//   move {x: right, y: forward}  -1..1
//   look {x, y}                  radians this frame
const KEYMAP = {
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyC: 'crouch', ControlLeft: 'crouch',
  KeyJ: 'light', KeyK: 'heavy', KeyF: 'action', KeyE: 'action',
  KeyQ: 'dodge', AltLeft: 'dodge', KeyV: 'whistle', KeyG: 'whistle',
};
const PAD = { 0: 'jump', 1: 'crouch', 2: 'light', 3: 'heavy', 5: 'action', 4: 'dodge', 7: 'sprint', 6: 'sprint', 12: 'whistle' };

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.down = {};      // action -> held (any device)
    this.edge = {};      // action -> pressed this frame
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.sens = 0.0023;
    this.invertY = false;
    this.locked = false;
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.lastDevice = this.touch ? 'touch' : 'kbm';
    this._mouseBtn = {};
    this._touchAct = {};
    this._stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this._lookTouch = { id: null, x: 0, y: 0 };
    this._pending = { x: 0, y: 0 };
    this._prevHeld = {};
    this.onKey = null; // hook for UI keys (Escape, R, `)

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.altKey) e.preventDefault();
      this.keys.add(e.code);
      this.lastDevice = 'kbm';
      if (this.onKey && !e.repeat) this.onKey(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this._mouseBtn = {}; });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (this.touch) return;
      this._mouseBtn[e.button] = true;
      this.lastDevice = 'kbm';
    });
    addEventListener('mouseup', (e) => { this._mouseBtn[e.button] = false; });
    addEventListener('mousemove', (e) => {
      if (this.locked) { this._pending.x += e.movementX; this._pending.y += e.movementY; }
      else if (this._mouseBtn[0] && this.dragLook) { this._pending.x += e.movementX; this._pending.y += e.movementY; }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLock) this.onLock(this.locked);
    });

    if (this.touch) this._buildTouch();
  }

  lock() {
    if (this.touch) return;
    try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => this.canvas.requestPointerLock()); }
    catch { this.canvas.requestPointerLock(); }
  }

  poll() {
    const held = {};
    for (const [code, a] of Object.entries(KEYMAP)) if (this.keys.has(code)) held[a] = true;
    if (this._mouseBtn[0] && (this.locked || !this.dragLook)) held.light = true;
    if (this._mouseBtn[2]) held.heavy = true;
    for (const a in this._touchAct) if (this._touchAct[a]) held[a] = true;

    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    let lx = this._pending.x * this.sens, ly = this._pending.y * this.sens;
    this._pending.x = this._pending.y = 0;

    // touch stick
    if (this._stick.id !== null) {
      mx += this._stick.x; my += this._stick.y;
      if (Math.hypot(this._stick.x, this._stick.y) > 0.92) held.sprint = true;
    }

    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
      const ax = dz(gp.axes[0] || 0), ay = dz(gp.axes[1] || 0);
      const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
      if (ax || ay || rx || ry) this.lastDevice = 'pad';
      mx += ax; my -= ay;
      lx += rx * 0.05; ly += ry * 0.04;
      gp.buttons.forEach((b, i) => { if (b.pressed && PAD[i]) { held[PAD[i]] = true; this.lastDevice = 'pad'; } });
    }

    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.move.x = mx; this.move.y = my;
    this.look.x = lx; this.look.y = this.invertY ? -ly : ly;

    this.edge = {};
    for (const a in held) if (!this._prevHeld[a]) this.edge[a] = true;
    this.down = held;
    this._prevHeld = held;
  }

  held(a) { return !!this.down[a]; }
  pressed(a) { return !!this.edge[a]; }

  // ---------- touch ----------
  _buildTouch() {
    const ui = document.createElement('div');
    ui.id = 'touch';
    ui.innerHTML = `
      <div class="stick"><div class="knob"></div></div>
      <div class="btns">
        <button data-a="action">F</button>
        <button data-a="heavy">HVY</button>
        <button data-a="light">ATK</button>
        <button data-a="dodge">DGE</button>
        <button data-a="crouch">C</button>
        <button data-a="jump">JMP</button>
        <button data-a="whistle">WHS</button>
        <button data-a="sprint">RUN</button>
      </div>`;
    document.body.appendChild(ui);
    const stick = ui.querySelector('.stick'), knob = ui.querySelector('.knob');
    const S = this._stick, L = this._lookTouch;
    ui.querySelectorAll('button').forEach((b) => {
      const a = b.dataset.a;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this._touchAct[a] = true; b.classList.add('on'); }, { passive: false });
      const up = (e) => { e.preventDefault(); this._touchAct[a] = false; b.classList.remove('on'); };
      b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
    });
    addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.target.closest && t.target.closest('button, a, .panel, #overlay')) continue;
        if (t.clientX < innerWidth * 0.45 && S.id === null) {
          S.id = t.identifier; S.ox = t.clientX; S.oy = t.clientY; S.x = S.y = 0;
          stick.style.left = (t.clientX - 60) + 'px'; stick.style.top = (t.clientY - 60) + 'px';
          stick.classList.add('on');
        } else if (L.id === null) {
          L.id = t.identifier; L.x = t.clientX; L.y = t.clientY;
        }
      }
    }, { passive: true });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === S.id) {
          let dx = (t.clientX - S.ox) / 55, dy = (t.clientY - S.oy) / 55;
          const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
          S.x = dx; S.y = -dy;
          knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
        } else if (t.identifier === L.id) {
          this._pending.x += (t.clientX - L.x) * 2.2; this._pending.y += (t.clientY - L.y) * 2.2;
          L.x = t.clientX; L.y = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === S.id) { S.id = null; S.x = S.y = 0; knob.style.transform = ''; stick.classList.remove('on'); }
        if (t.identifier === L.id) L.id = null;
      }
    };
    addEventListener('touchend', end); addEventListener('touchcancel', end);
  }
}
