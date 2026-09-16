/* =========================================================
   91626 — Farm Rhythm (prototype)
   Most basic playable version: one lane, one beat per note,
   tap/space in time with the beat. All audio is generated with
   Web Audio oscillators — zero external assets, zero cost.
   ========================================================= */

(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const titleCard = document.getElementById('titleCard');
  const hud = document.getElementById('hud');
  const hudScore = document.getElementById('hudScore');
  const hudCombo = document.getElementById('hudCombo');
  const debugOverlay = document.getElementById('debugOverlay');

  const COLORS = {
    black: '#080808',
    white: '#f0ede6',
    muted: '#a09e96',
    accent: '#ff3c00',
    accent2: '#ffd600'
  };

  const BPM = 100;
  const BEAT_MS = 60000 / BPM;   // ms between chores
  const TRAVEL_MS = 1800;        // ms a note takes to fall from spawn to the hit line
  const PERFECT_MS = 80;
  const GOOD_MS = 160;
  const MISS_MS = 260;           // beyond this, a tap has nothing to hit
  const CHORES = ['\u{1F95A}', '\u{1F33E}', '\u{1F95B}']; // egg, wheat, milk

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

  const laneX = () => size.w / 2;
  const laneTopY = () => size.h * 0.18;
  const hitLineY = () => size.h * 0.72;

  /* ---- procedural audio (no files) ---- */
  let actx = null;
  function tone(freq, dur, type, peak) {
    if (!actx) return;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, actx.currentTime);
    gain.gain.linearRampToValueAtTime(peak, actx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    osc.connect(gain).connect(actx.destination);
    osc.start();
    osc.stop(actx.currentTime + dur);
  }
  const playTick = () => tone(440, 0.08, 'square', 0.08);
  const playHit = quality => {
    if (quality === 'perfect') tone(880, 0.12, 'sine', 0.18);
    else if (quality === 'good') tone(660, 0.12, 'sine', 0.14);
    else tone(180, 0.15, 'sawtooth', 0.12);
  };

  /* ---- game state ---- */
  let running = false;
  let startTime = 0;
  let nextBeatIndex = 0;
  const notes = []; // { spawnTime, hitTime, judged, glyph }
  let score = 0;
  let combo = 0;
  let feedbackTimer = 0;
  let feedbackText = '';

  function updateHud() {
    hudScore.textContent = 'SCORE ' + score;
    hudCombo.textContent = combo > 1 ? combo + 'x COMBO' : '';
  }

  function start() {
    if (running) return;
    running = true;
    titleCard.classList.add('hidden');
    hud.classList.add('visible');
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    startTime = performance.now();
    nextBeatIndex = 0;
    notes.length = 0;
    score = 0; combo = 0;
    updateHud();
  }

  function showFeedback(text) {
    feedbackText = text;
    feedbackTimer = 0.5;
  }

  function judge(now) {
    let best = null, bestDiff = Infinity;
    for (const n of notes) {
      if (n.judged) continue;
      const diff = Math.abs(now - n.hitTime);
      if (diff < bestDiff) { bestDiff = diff; best = n; }
    }
    if (!best || bestDiff > MISS_MS) return; // nothing in range — ignore the tap

    best.judged = true;
    let quality, points;
    if (bestDiff <= PERFECT_MS) { quality = 'perfect'; points = 100; }
    else if (bestDiff <= GOOD_MS) { quality = 'good'; points = 50; }
    else { quality = 'miss'; points = 0; }

    if (quality === 'miss') combo = 0;
    else { combo++; score += points; }

    showFeedback(quality.toUpperCase());
    playHit(quality);
    updateHud();
  }

  function onInput() {
    if (!running) { start(); return; }
    judge(performance.now());
  }
  canvas.addEventListener('pointerdown', onInput);
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); onInput(); }
    if (e.key.toLowerCase() === 'd') debugOverlay.classList.toggle('visible');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') running = false;
  });

  /* ---- update / render ---- */
  function update(now) {
    if (!running) return;
    const elapsed = now - startTime;

    while (elapsed >= nextBeatIndex * BEAT_MS) {
      const spawnTime = startTime + nextBeatIndex * BEAT_MS;
      notes.push({
        spawnTime,
        hitTime: spawnTime + TRAVEL_MS,
        judged: false,
        glyph: CHORES[nextBeatIndex % CHORES.length]
      });
      nextBeatIndex++;
      playTick();
    }

    for (const n of notes) {
      if (!n.judged && now - n.hitTime > MISS_MS) {
        n.judged = true;
        combo = 0;
        updateHud();
      }
    }

    while (notes.length && notes[0].judged && now - notes[0].hitTime > 500) {
      notes.shift();
    }
  }

  function render(now) {
    ctx.fillStyle = COLORS.black;
    ctx.fillRect(0, 0, size.w, size.h);

    const x = laneX();
    const top = laneTopY();
    const hitY = hitLineY();

    ctx.strokeStyle = 'rgba(240,237,230,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, size.h * 0.9);
    ctx.stroke();

    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 70, hitY);
    ctx.lineTo(x + 70, hitY);
    ctx.stroke();

    ctx.font = '36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of notes) {
      const progress = (now - n.spawnTime) / TRAVEL_MS;
      if (progress < -0.05 || progress > 1.15) continue;
      const y = top + progress * (hitY - top);
      ctx.globalAlpha = n.judged ? 0.25 : 1;
      ctx.fillText(n.glyph, x, y);
    }
    ctx.globalAlpha = 1;

    if (feedbackTimer > 0) {
      ctx.fillStyle = COLORS.accent2;
      ctx.font = 'bold 24px sans-serif';
      ctx.globalAlpha = Math.min(1, feedbackTimer * 2);
      ctx.fillText(feedbackText, x, hitY - 60);
      ctx.globalAlpha = 1;
    }
  }

  /* ---- main loop ---- */
  let lastTime = performance.now();
  let fps = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    fps = fps ? fps * 0.9 + (1 / dt) * 0.1 : 1 / dt;

    if (feedbackTimer > 0) feedbackTimer -= dt;

    update(now);
    render(now);

    if (debugOverlay.classList.contains('visible')) {
      debugOverlay.textContent =
        `fps ${fps.toFixed(0)}\n` +
        `notes ${notes.length}\n` +
        `score ${score}  combo ${combo}\n` +
        `size ${size.w}x${size.h} @${size.dpr}x`;
    }
  }
  requestAnimationFrame(frame);
})();
