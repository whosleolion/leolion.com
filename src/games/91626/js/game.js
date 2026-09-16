/* =========================================================
   91626 — game engine scaffold
   No game yet — this just proves the loop, input, and resize
   handling all work. Replace the DEMO block and fill in
   update()/render() once there's an idea.
   ========================================================= */

(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const titleCard = document.getElementById('titleCard');
  const debugOverlay = document.getElementById('debugOverlay');

  const COLORS = {
    black: '#080808',
    white: '#f0ede6',
    muted: '#a09e96',
    accent: '#ff3c00',
    accent2: '#ffd600'
  };

  /* ---- canvas sizing (handles DPR + resize/orientation) ---- */
  const size = { w: 0, h: 0, dpr: 1 };

  function resize() {
    size.dpr = Math.min(window.devicePixelRatio || 1, 2);
    size.w = window.innerWidth;
    size.h = window.innerHeight;
    canvas.width = Math.round(size.w * size.dpr);
    canvas.height = Math.round(size.h * size.dpr);
    canvas.style.width = size.w + 'px';
    canvas.style.height = size.h + 'px';
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  }
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('orientationchange', resize);
  resize();

  /* ---- input ---- */
  const input = {
    keys: new Set(),
    pointer: { x: 0, y: 0, down: false }
  };

  window.addEventListener('keydown', e => {
    input.keys.add(e.key.toLowerCase());
    if (e.key.toLowerCase() === 'd') debugOverlay.classList.toggle('visible');
  });
  window.addEventListener('keyup', e => input.keys.delete(e.key.toLowerCase()));

  function pointerPos(e) {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }
  canvas.addEventListener('pointerdown', e => {
    input.pointer.down = true;
    Object.assign(input.pointer, pointerPos(e));
  });
  window.addEventListener('pointermove', e => Object.assign(input.pointer, pointerPos(e)));
  window.addEventListener('pointerup', () => (input.pointer.down = false));

  /* ---- game state ---- */
  const state = {
    t: 0,       // total elapsed seconds
    running: true
  };

  document.addEventListener('visibilitychange', () => {
    state.running = document.visibilityState === 'visible';
    lastTime = performance.now();
  });

  /* ---- DEMO ONLY: a few particles drifting toward the pointer,
     so the page reads as "alive" instead of a blank canvas.
     Delete this block (and its calls below) once real gameplay exists. */
  const demoParticles = Array.from({ length: 24 }, () => ({
    x: Math.random() * size.w,
    y: Math.random() * size.h,
    r: 1.5 + Math.random() * 2.5,
    vx: 0, vy: 0
  }));
  function demoUpdate(dt) {
    const target = input.pointer.down
      ? input.pointer
      : { x: size.w / 2, y: size.h / 2 };
    demoParticles.forEach(p => {
      const dx = target.x - p.x, dy = target.y - p.y;
      p.vx += dx * 0.02 * dt; p.vy += dy * 0.02 * dt;
      p.vx *= 0.96; p.vy *= 0.96;
      p.x += p.vx; p.y += p.vy;
    });
  }
  function demoRender() {
    demoParticles.forEach((p, i) => {
      ctx.beginPath();
      ctx.fillStyle = i % 3 === 0 ? COLORS.accent : COLORS.muted;
      ctx.globalAlpha = 0.5;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  /* ---- update/render — put real game logic here ---- */
  function update(dt) {
    demoUpdate(dt); // remove once there's real gameplay
  }

  function render() {
    ctx.fillStyle = COLORS.black;
    ctx.fillRect(0, 0, size.w, size.h);
    demoRender(); // remove once there's real gameplay
  }

  /* ---- main loop (delta-time based, clamped so tab-switches don't jump) ---- */
  let lastTime = performance.now();
  let fps = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!state.running) { lastTime = now; return; }

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    state.t += dt;
    fps = fps ? fps * 0.9 + (1 / dt) * 0.1 : 1 / dt;

    update(dt);
    render();

    if (debugOverlay.classList.contains('visible')) {
      debugOverlay.textContent =
        `fps ${fps.toFixed(0)}\n` +
        `t   ${state.t.toFixed(1)}s\n` +
        `size ${size.w}x${size.h} @${size.dpr}x`;
    }
  }
  requestAnimationFrame(frame);

  // eslint-disable-next-line no-unused-vars
  void titleCard; // kept as a DOM handle for whatever comes next (hide on start, etc.)
})();
