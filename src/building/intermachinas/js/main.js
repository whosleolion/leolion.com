// INTERMACHINAS — mechanical white-box build.
// Boot, loop, mission flow, pause/menus, debug + tuning panel.
import * as THREE from './vendor/three.module.min.js';
import { World, buildLevel } from './world.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { spawnEnemies, Director, Projectiles } from './enemy.js';
import { CameraRig } from './camera.js';
import { Hud } from './hud.js';
import { T, META, DEFAULTS, saveTuning, resetTuning } from './tuning.js';
import { initAudio, sfx } from './audio.js';
import { Fx } from './fx.js';
import { Rig } from './rig.js';

const G = (window.G = { enemies: [], synced: false, paused: true, started: false });

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdde2e8);
scene.fog = new THREE.Fog(0xdde2e8, 45, 150);
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 400);
G.scene = scene; G.camera = camera; G.renderer = renderer;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8f96a3, 1.6));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- world
const world = new World(scene);
world.loadMaterials('assets/textures/');
buildLevel(world);
G.world = world;

G.input = new Input(canvas);
G.cam = new CameraRig(camera, G);
G.hud = new Hud(G);
G.director = new Director();
G.projectiles = new Projectiles(G);
G.player = new Player(G);
G.checkpoint = { ...world.spawn };

// ---------------------------------------------------------------- fx
let hitstopT = 0, slowT = 0, slowScale = 1;
G.fx = {
  hitstop(t) { hitstopT = Math.max(hitstopT, t); },
  slowmo(scale, t) { slowScale = scale; slowT = t; },
  shake(a) { G.cam.shake(a); },
  vfx: new Fx(scene),
};
// noise: guards in range come to look. `visible` draws the ring so you can read how loud you are (Mark of the Ninja)
G.noise = (x, y, z, r, visible) => {
  for (const e of G.enemies) e.hear(x, y, z, r);
  if (visible) G.fx.vfx.ring(x, y, z, r, 0xffffff, Math.min(0.9, 0.35 + r * 0.04));
};

// Splinter Cell: Conviction's last-known-position ghost: where the hunters
// think you are, frozen in the pose they last saw you in.
const ghost = new Rig({ ghost: 0xffffff, hood: true });
ghost.root.visible = false;
scene.add(ghost.root);
let unseenT = 0;
function updateGhost(dt) {
  const P = G.player;
  const hunting = G.enemies.filter((e) => e.alive && (e.state === 'combat' || (e.state === 'search' && e.awareness >= 0.5)));
  const seen = G.enemies.some((e) => e.alive && e.state === 'combat' && e.vis > 0);
  if (!hunting.length || P.state === 'dead') { ghost.root.visible = false; unseenT = 0; return; }
  if (seen) {
    unseenT = 0;
    ghost.root.visible = false;
    ghost.root.position.set(P.pos.x, P.pos.y, P.pos.z);
    ghost.root.rotation.y = P.yaw;
    ghost.applyNow(P.rig.cur);
  } else if ((unseenT += dt) > 0.35 && ghost.root.position.lengthSq() > 0) {
    ghost.root.visible = true;
    ghost.ghostMat.opacity = 0.22 + 0.08 * Math.sin(performance.now() / 180);
  }
}

// ---------------------------------------------------------------- mission
const M = {};
function startMission(full) {
  for (const e of G.enemies) e.dispose();
  G.projectiles.clear();
  G.director = new Director();
  G.hud.reset();
  if (full) { G.synced = false; G.checkpoint = { ...world.spawn }; for (const h of world.hints) h.shown = false; }
  G.enemies = spawnEnemies(G);
  G.player.reset(G.checkpoint);
  G.cam.reset(G.checkpoint.yaw);
  ghost.root.visible = false; ghost.root.position.set(0, 0, 0);
  Object.assign(M, { targetDead: false, complete: false, failed: false, calmT: 0, time: 0, everDetected: false });
  G.hud.objective(G.synced ? 'Assassinate the target in the courtyard (north)' : 'Assassinate the target in the courtyard (north)  ·  optional: synchronize the viewpoint');
}

const KILL_TOAST = { air: 'AIR ASSASSINATION', assassinate: 'ASSASSINATION', chain: 'CHAIN KILL', execute: 'EXECUTION' };
G.onKill = (e, how) => {
  const fightOver = !G.enemies.some((x) => x.alive && x !== e && x.state === 'combat');
  if (e === G.target && !M.targetDead) {
    M.targetDead = true;
    G.hud.banner('TARGET ELIMINATED', how === 'combat' ? 'messy.' : 'clean.', 3);
    G.hud.objective('Escape — lose any pursuers');
    G.fx.slowmo(0.3, 0.9);
  } else if (fightOver && M.inCombat && (how === 'combat' || how === 'counter' || how === 'execute')) {
    // Arkham's last-hit beat: the final blow of a fight lands in slow motion
    G.fx.slowmo(0.2, 0.8); G.cam.punch(1);
    G.hud.toast('FIGHT OVER');
  } else if (KILL_TOAST[how]) {
    G.hud.toast(KILL_TOAST[how]);
  }
};
G.onDetected = () => {
  if (!M.inCombat) { G.player.stats.detected++; M.everDetected = true; }
  M.inCombat = true;
};
G.onSync = () => {
  G.synced = true;
  G.checkpoint = { x: world.viewpoint.x, y: 0.25, z: world.viewpoint.z + 2.5, yaw: 0 };
  G.hud.banner('VIEWPOINT SYNCHRONIZED', 'all guards revealed · checkpoint set', 3.5);
  G.hud.objective('Assassinate the target in the courtyard (north)');
};
G.onPlayerDeath = () => {
  M.failed = true;
  G.hud.banner('DESYNCHRONIZED', G.input.touch ? 'tap to retry' : 'press R to retry', 999);
};

function updateMission(dt) {
  if (M.complete || M.failed) return;
  M.time += dt;
  const hot = G.enemies.some((e) => e.alive && (e.state === 'combat' || e.state === 'search' || e.state === 'investigate'));
  if (!G.enemies.some((e) => e.alive && e.state === 'combat')) M.inCombat = false;
  if (M.targetDead) {
    M.calmT = hot ? 0 : M.calmT + dt;
    if (M.calmT > 2) {
      M.complete = true;
      const s = G.player.stats;
      const mm = Math.floor(M.time / 60), ss = String(Math.floor(M.time % 60)).padStart(2, '0');
      G.hud.banner('MISSION COMPLETE', `${mm}:${ss}  ·  ${s.kills} down (${s.assassinations} assassinations)  ·  best combo ×${s.bestCombo}  ·  detected ${s.detected}×${s.detected === 0 ? '  ·  GHOST' : ''}  ·  R to replay`, 999);
      sfx.complete();
    }
  }
  // tutorial hints
  const p = G.player.pos;
  for (const h of world.hints) {
    if (!h.shown && p.x > h.x0 && p.x < h.x1 && p.z > h.z0 && p.z < h.z1) { h.shown = true; G.hud.hint(h.text); }
  }
}

// ---------------------------------------------------------------- menus
const overlay = document.getElementById('overlay');
const playBtn = document.getElementById('play');
function setPaused(p) {
  G.paused = p;
  overlay.classList.toggle('on', p);
  playBtn.textContent = G.started ? 'RESUME' : 'PLAY';
}
playBtn.addEventListener('click', () => {
  initAudio();
  if (!G.started) { G.started = true; }
  setPaused(false);
  G.input.lock();
});
document.getElementById('restart').addEventListener('click', () => { startMission(true); playBtn.click(); });
G.input.onLock = (locked) => { if (!locked && G.started && !G.input.touch && !tuningOpen()) setPaused(true); };
canvas.addEventListener('click', () => {
  if (G.paused) return;
  if (!G.input.locked && !G.input.touch) G.input.lock();
  if (M.failed) startMission(false);
});
document.getElementById('pause-btn').addEventListener('click', () => setPaused(true));
G.input.onKey = (code) => {
  if (code === 'KeyR' && G.started && (M.failed || M.complete)) startMission(M.complete);
  if (code === 'Backquote') toggleTuning();
  if (code === 'KeyP' && G.started) setPaused(!G.paused);
};
addEventListener('touchend', () => { if (M.failed && !G.paused) startMission(false); });

// tuning panel
const panel = document.getElementById('tuning');
function tuningOpen() { return panel.classList.contains('on'); }
function toggleTuning() {
  panel.classList.toggle('on');
  if (tuningOpen()) document.exitPointerLock?.();
  else if (G.started && !G.paused) G.input.lock();
}
document.getElementById('tune-btn').addEventListener('click', toggleTuning);
(function buildTuning() {
  const body = panel.querySelector('.rows');
  for (const row of META) {
    if (row.length === 1) { const h = document.createElement('h4'); h.textContent = row[0]; body.appendChild(h); continue; }
    const [k, min, max, step] = row;
    const lab = document.createElement('label');
    lab.innerHTML = `<span>${k}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
    const inp = lab.querySelector('input'), out = lab.querySelector('output');
    const sync = () => { inp.value = T[k]; out.textContent = (+T[k]).toFixed(step < 1 ? 2 : 0); lab.classList.toggle('changed', T[k] !== DEFAULTS[k]); };
    inp.addEventListener('input', () => { T[k] = +inp.value; saveTuning(); sync(); });
    lab.sync = sync; sync();
    body.appendChild(lab);
  }
  panel.querySelector('.reset').addEventListener('click', () => { resetTuning(); body.querySelectorAll('label').forEach((l) => l.sync()); });
  panel.querySelector('.close').addEventListener('click', toggleTuning);
})();

// ---------------------------------------------------------------- loop
let last = performance.now(), fpsT = 0, frames = 0, fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let real = Math.min(0.05, (now - last) / 1000);
  last = now;
  frames++; fpsT += real; if (fpsT > 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }

  if (G.manual) { renderer.render(scene, camera); return; }
  G.input.poll();
  if (!G.paused) {
    let dt = real;
    if (hitstopT > 0) { hitstopT -= real; dt = 0; }
    if (slowT > 0) { slowT -= real; dt *= slowScale; }
    if (dt > 0) {
      const steps = dt > 1 / 45 ? 2 : 1;
      for (let i = 0; i < steps; i++) step(dt / steps);
    }
    G.cam.update(real);
    G.hud.update(real);
  } else if (!G.started) {
    // attract mode: slow orbit
    G.cam.yaw += real * 0.08; G.cam.update(real);
  }
  const P = G.player.pos;
  sun.position.set(P.x + 25, P.y + 45, P.z + 15);
  sun.target.position.set(P.x, P.y, P.z);
  renderer.render(scene, camera);

  if (debugOn()) {
    const pl = G.player;
    G.hud.debug(`${fps} fps  ·  state ${pl.state}${pl.action ? '/' + pl.action.type : ''}  ·  speed ${pl.speedXZ.toFixed(1)}  vy ${pl.vel.y.toFixed(1)}\n` +
      `pos ${P.x.toFixed(1)}, ${P.y.toFixed(1)}, ${P.z.toFixed(1)}  ·  hp ${pl.hp.toFixed(0)}  ·  hidden ${pl.hidden}  ·  ${G.input.lastDevice}\n` +
      `enemies: ${G.enemies.filter((e) => e.alive).length} alive  ·  attackers ${G.director.attackers.size}  ·  flow ${pl.flow.toFixed(2)}  ·  combo ${pl.combo}`);
  } else G.hud.debug('');
}
function debugOn() { return tuningOpen(); }

function step(dt) {
  G.player.update(dt);
  G.director.update(dt);
  for (const e of G.enemies) e.update(dt);
  G.projectiles.update(dt);
  G.fx.vfx.update(dt);
  updateGhost(dt);
  updateMission(dt);
}

// test hook: run the sim at a fixed step without rendering (see tools/intermachinas/playtest.mjs)
G.advance = (sec, dt = 1 / 60) => {
  G.manual = true;
  for (let t = 0; t < sec - 1e-9; t += dt) { G.input.poll(); step(dt); G.cam.update(dt); }
  G.hud.update(dt);
};

startMission(true);
G.cam.yaw = Math.PI * 0.85; G.cam.pitch = 0.35;
setPaused(true);
requestAnimationFrame(frame);
document.body.classList.add('ready');
