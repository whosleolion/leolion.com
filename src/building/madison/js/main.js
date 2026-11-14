// 932 Madison St — boot, first-person controls (touch + desktop), HUD, main loop.
import { THREE, clamp, smooth, SegGrid } from './util.js';
import { setAniso } from './textures.js';
import { buildCity } from './city.js';
import { buildStreet } from './street.js';
import { buildEl } from './el.js';
import { buildSky, TOD_ORDER } from './sky.js';
import { makeAudio } from './audio.js';

const $ = id => document.getElementById(id), qs = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer: coarse)').matches;
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let pixelRatio = Math.min(devicePixelRatio || 1, mobile ? 1.75 : 2);
setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, .12, 4000); camera.rotation.order = 'YXZ';
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(pixelRatio); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 82 : 68; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 200)); resize();

const tick = () => new Promise(r => requestAnimationFrame(r));
const go = $('go');
const stage = async t => { go.textContent = t; await tick(); await tick(); };

// ---------------------------------------------------------------- load + build
const [data, photos, ortho] = await Promise.all([
  fetch('data/block.json').then(r => r.json()),
  fetch('data/photos.json').then(r => r.json()).catch(() => []),
  new THREE.TextureLoader().loadAsync('data/ortho.jpg'),
]);
ortho.colorSpace = THREE.SRGBColorSpace; ortho.anisotropy = 4;
const streetGrid = new SegGrid(24);
for (const s of data.streets) if (s.n !== 'Alley') for (let k = 0; k < s.p.length - 1; k++) streetGrid.add(s.p[k][0], s.p[k][1], s.p[k + 1][0], s.p[k + 1][1], s);
const env = { streetGrid, ortho };
await stage('Raising 1,053 buildings…');
const city = buildCity(data, scene, env);
await stage('Paving streets, planting trees…');
const street = buildStreet(data, scene, env, city);
await stage('Riveting the el…');
const el = buildEl(data, scene, env, city, street);
const sky = buildSky(scene, renderer, mobile);
const audio = makeAudio();
if (TOD_ORDER.includes(qs.get('tod'))) sky.set(qs.get('tod'), true);

// street-photo markers
const markers = [];
{
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#f2c230'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill(); g.fillStyle = '#0c0c0d';
  g.fillRect(34, 46, 60, 42); g.fillRect(50, 38, 22, 10); g.fillStyle = '#f2c230'; g.beginPath(); g.arc(64, 67, 13, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, fog: false, depthTest: true, transparent: true });
  for (const p of photos) { const s = new THREE.Sprite(m); s.position.set(p.x, 2.6, p.z); s.scale.setScalar(.8); s.visible = false; scene.add(s); markers.push(s); }
}

// ---------------------------------------------------------------- player
const EYE = 1.68, LIMIT = 238;
const P = { x: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, bob: 0, stride: 0 };
{ // start on the far sidewalk of Madison St, facing no. 932
  let best = null;
  for (const s of data.streets) if (s.n === 'Madison St') for (let k = 0; k < s.p.length - 1; k++) {
    const a = s.p[k], b = s.p[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(-(a[0] * dx + a[1] * dz) / (dx * dx + dz * dz), 0, 1);
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(x, z);
    if (!best || d < best.d) best = { x, z, d, w: s.w };
  }
  const k = (best.d + best.w / 2 + 1.7) / best.d; P.x = best.x * k; P.z = best.z * k;
  P.yaw = Math.atan2(-P.x, P.z); P.pitch = .14;
}
if (qs.get('pos')) { const v = qs.get('pos').split(',').map(Number); P.x = v[0]; P.z = v[1]; P.yaw = (v[2] || 0) * Math.PI / 180; P.pitch = (v[3] || 0) * Math.PI / 180; }

// ---------------------------------------------------------------- input
const keys = new Set(), stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, lookPtr = { id: null, x: 0, y: 0 };
let mode = 'orbit', orbitA = .9, orbitH = 105, tween = null, started = false;
addEventListener('keydown', e => {
  keys.add(e.code);
  if (!started) return;
  if (e.code === 'KeyT') cycleTime(); else if (e.code === 'KeyO') toggleView(); else if (e.code === 'KeyM') $('bSound').click(); else if (e.code === 'KeyF') $('bFull').click();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const turn = (dx, dy, k) => {
  if (mode === 'orbit') { orbitA += dx * k * .8; orbitH = clamp(orbitH + dy * k * 60, 35, 230); return; }
  P.yaw += dx * k; P.pitch = clamp(P.pitch - dy * k, -1.35, 1.45);
};
canvas.addEventListener('pointerdown', e => {
  if (!started) return;
  if (e.pointerType === 'mouse') { if (mode === 'walk' && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); lookPtr.id = e.pointerId; lookPtr.x = e.clientX; lookPtr.y = e.clientY; return; }
  canvas.setPointerCapture?.(e.pointerId);
  if (mode === 'walk' && stick.id === null && e.clientX < innerWidth * .45) {
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
    const s = $('stick'); s.style.display = 'block'; s.style.left = e.clientX + 'px'; s.style.top = e.clientY + 'px'; s.firstElementChild.style.transform = '';
    $('hint').classList.remove('on');
  } else if (lookPtr.id === null) { lookPtr.id = e.pointerId; lookPtr.x = e.clientX; lookPtr.y = e.clientY; }
});
addEventListener('pointermove', e => {
  if (document.pointerLockElement === canvas) { turn(e.movementX, e.movementY, .0022); return; }
  if (e.pointerId === stick.id) {
    let dx = (e.clientX - stick.ox) / 52, dy = (e.clientY - stick.oy) / 52; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    stick.x = dx; stick.y = dy; $('stick').firstElementChild.style.transform = `translate(${dx * 34}px,${dy * 34}px)`;
  } else if (e.pointerId === lookPtr.id && (e.pointerType !== 'mouse' || e.buttons)) {
    turn(e.clientX - lookPtr.x, e.clientY - lookPtr.y, e.pointerType === 'mouse' ? .004 : .0052); lookPtr.x = e.clientX; lookPtr.y = e.clientY;
  }
});
const release = e => {
  if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; $('stick').style.display = 'none'; }
  if (e.pointerId === lookPtr.id) lookPtr.id = null;
};
addEventListener('pointerup', release); addEventListener('pointercancel', release);
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());

// ---------------------------------------------------------------- HUD
const toastEl = $('toast'); let toastT = 0;
const toast = (t, d = 2.2) => { toastEl.textContent = t; toastEl.classList.add('on'); toastT = d; };
const TOD_LABEL = { golden: 'Golden hour', night: 'Night', day: 'Midday' };
function cycleTime() { const n = TOD_ORDER[(TOD_ORDER.indexOf(sky.name) + 1) % TOD_ORDER.length]; sky.set(n); toast(TOD_LABEL[n]); }
function orbitPose(out) {
  const r = 150 + orbitH * .55; out.pos.set(12 + Math.cos(orbitA) * r, orbitH, 4 + Math.sin(orbitA) * r);
  M4.lookAt(out.pos, V.set(12, 6, 4), UP); out.quat.setFromRotationMatrix(M4); return out;
}
function walkPose(out) { out.pos.set(P.x, EYE, P.z); E.set(P.pitch, -P.yaw, 0, 'YXZ'); out.quat.setFromEuler(E); return out; }
const M4 = new THREE.Matrix4(), V = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), E = new THREE.Euler();
const poseA = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, poseB = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
function toggleView(to) {
  if (tween) return;
  const target = to || (mode === 'walk' ? 'orbit' : 'walk');
  if (target === mode) return;
  if (document.pointerLockElement) document.exitPointerLock();
  poseA.pos.copy(camera.position); poseA.quat.copy(camera.quaternion);
  if (target === 'orbit') orbitA = Math.atan2(P.z - 4, P.x - 12) || .9;
  tween = { t: 0, dur: 2.6, to: target }; mode = 'tween';
  document.body.classList.toggle('walk', target === 'walk');
  $('bView').classList.toggle('off', target === 'orbit');
}
$('bTime').onclick = cycleTime;
$('bView').onclick = () => toggleView();
$('bSound').onclick = e => e.currentTarget.classList.toggle('off', audio.toggle());
$('bFull').onclick = () => { const d = document, el = d.documentElement; if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d); else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' })?.catch?.(() => {}); };
if (!document.documentElement.requestFullscreen && !document.documentElement.webkitRequestFullscreen) $('bFull').style.display = 'none';
const sheet = (id, on) => { $(id).classList.toggle('on', on); if (on && document.pointerLockElement) document.exitPointerLock(); };
$('bInfo').onclick = () => sheet('about', true);
for (const s of document.querySelectorAll('.sheet')) { s.querySelector('.close').onclick = () => sheet(s.id, false); s.addEventListener('pointerdown', e => { if (e.target === s) sheet(s.id, false); }); }
let nearPhoto = null;
$('photoBtn').onclick = () => {
  if (!nearPhoto) return;
  $('photo').querySelector('img').src = 'photos/' + nearPhoto.f;
  $('photo').querySelector('p').innerHTML = `Taken here on ${new Date(nearPhoto.date + 'T12:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}. <a href="${nearPhoto.src}" target="_blank" rel="noopener" style="color:inherit">KartaView</a> contributor, CC BY-SA 4.0.`;
  sheet('photo', true);
};
$('how').textContent = mobile ? 'Left thumb walks, right thumb looks. Best in landscape, with sound.' : 'WASD or arrows to walk, mouse to look, Shift to jog. T changes the light, O flies up.';
go.disabled = false; go.textContent = 'Walk the block';
go.onclick = () => {
  if (started) return; started = true;
  audio.start(); $('start').classList.add('gone'); toggleView('walk');
  if (mobile) setTimeout(() => $('hint').classList.add('on'), 2600), setTimeout(() => $('hint').classList.remove('on'), 9000);
};

const USE = { A: 'one-family house', B: 'two-family house', C: 'walk-up apartments', D: 'elevator apartments', S: 'apartments over a store', K: 'store', R: 'condominium', M: 'house of worship',
  W: 'school', O: 'offices', E: 'warehouse', F: 'factory', G: 'garage', V: 'vacant lot', I: 'health facility', P: 'assembly hall', N: 'residence / shelter', H: 'hotel', Q: 'recreation', U: 'utility', Z: 'misc.' };
const lookEl = $('look'); let lookT = 0, hudT = 0, lastStreet = '';
function updateHud(dt) {
  if ((hudT -= dt) > 0) return; hudT = .14;
  // nearest street + compass
  let best = null, bd = 26;
  for (const s of streetGrid.near(P.x, P.z, 26)) {
    const dx = s.bx - s.ax, dz = s.bz - s.az, t = clamp(((P.x - s.ax) * dx + (P.z - s.az) * dz) / (dx * dx + dz * dz), 0, 1), d = Math.hypot(P.x - s.ax - dx * t, P.z - s.az - dz * t);
    if (d < bd) { bd = d; best = s.ref; }
  }
  if (best && best.n !== lastStreet) { lastStreet = best.n; $('street').textContent = best.n; }
  const deg = ((P.yaw * 180 / Math.PI) % 360 + 360) % 360;
  $('compass').textContent = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
  $('sub').textContent = el.under(P.x, P.z) > .5 ? 'under the J · Z tracks' : 'Brooklyn 11221';
  // what am I looking at?
  const fx = Math.sin(P.yaw), fz = -Math.cos(P.yaw), tp = Math.tan(P.pitch);
  const hit = city.segGrid.ray(P.x, P.z, fx, fz, 70, (s, t) => s.ref && s.ref.h !== undefined && EYE + tp * t >= 0 && EYE + tp * t <= s.ref.h);
  if (hit) {
    const b = hit.s.ref, bits = [];
    if (b.y > 1700) bits.push('built ' + b.y); if (b.floors) bits.push(b.floors + (b.floors === 1 ? ' floor' : ' floors')); if (USE[(b.c || '')[0]]) bits.push(USE[b.c[0]]);
    lookEl.firstElementChild.textContent = b.g ? 'Garage' : (b.a || 'Building'); lookEl.lastElementChild.textContent = bits.join(' · '); lookEl.classList.add('on'); lookT = .5;
  } else if ((lookT -= .14) < 0) lookEl.classList.remove('on');
  // photo spots
  nearPhoto = null; let pd = 7.5;
  photos.forEach((p, i) => { const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < pd) { pd = d; nearPhoto = p; } });
  $('photoBtn').classList.toggle('on', !!nearPhoto && mode === 'walk');
}

// ---------------------------------------------------------------- loop
let last = performance.now(), time = 0, slow = 0, edgeT = 0;
function updatePlayer(dt) {
  let mx = stick.x, mz = -stick.y;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
  if (keys.has('KeyD')) mx += 1; if (keys.has('KeyA')) mx -= 1;
  if (keys.has('ArrowLeft')) P.yaw -= dt * 1.9; if (keys.has('ArrowRight')) P.yaw += dt * 1.9;
  const l = Math.hypot(mx, mz), run = keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(stick.x, stick.y) > .93;
  if (l > 1) { mx /= l; mz /= l; }
  const sp = run ? 6.2 : 2.7, sn = Math.sin(P.yaw), cs = Math.cos(P.yaw);
  const tx = (sn * mz + cs * mx) * sp, tz = (-cs * mz + sn * mx) * sp, k = 1 - Math.exp(-dt * 10);
  P.vx += (tx - P.vx) * k; P.vz += (tz - P.vz) * k;
  let nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
  [nx, nz] = city.segGrid.resolve(nx, nz, .38);
  const r = Math.hypot(nx, nz);
  if (r > LIMIT) { nx *= LIMIT / r; nz *= LIMIT / r; if (edgeT <= 0) { toast('The model ends here'); edgeT = 4; } }
  edgeT -= dt;
  const v = Math.hypot(nx - P.x, nz - P.z) / Math.max(dt, 1e-4);
  P.x = nx; P.z = nz;
  P.stride += v * dt; if (P.stride > (run ? 1.9 : 1.45) / 2) { P.stride = 0; audio.step(run); }
  P.bob += v * dt * (run ? 3.4 : 4.3);
  return v;
}
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now; const dt = Math.min(.05, raw); time += dt;
  if (toastT > 0 && (toastT -= dt) <= 0) toastEl.classList.remove('on');
  let range = 95;
  if (mode === 'walk') {
    const v = updatePlayer(dt), onWalk = street.onWalk(P.x, P.z) ? .15 : 0;
    camera.position.set(P.x, EYE + onWalk + Math.sin(P.bob) * .028 * Math.min(1, v / 2), P.z);
    camera.rotation.set(P.pitch, -P.yaw, 0);
    updateHud(dt);
  } else if (mode === 'orbit') {
    if (lookPtr.id === null) orbitA += dt * .045;
    orbitPose(poseB); camera.position.copy(poseB.pos); camera.quaternion.copy(poseB.quat); range = 300;
  } else if (tween) {
    tween.t = Math.min(1, tween.t + dt / tween.dur); const f = smooth(tween.t);
    (tween.to === 'walk' ? walkPose : orbitPose)(poseB);
    camera.position.lerpVectors(poseA.pos, poseB.pos, f); camera.quaternion.slerpQuaternions(poseA.quat, poseB.quat, f);
    range = camera.position.y > 30 ? 300 : 95;
    if (tween.t >= 1) { mode = tween.to; tween = null; }
  }
  const walkish = camera.position.y < 30;
  for (const m of markers) { m.visible = walkish; m.position.y = 2.6 + Math.sin(time * 1.6 + m.position.x) * .12; }
  const focus = walkish ? camera.position : V.set(12, 0, 4);
  const nightF = sky.update(dt, time, focus, range);
  for (const m of city.nightMats) m.emissiveIntensity = nightF * (m.userData.nightScale || 1.15);
  for (const f of street.night) f(nightF);
  const st = el.update(time, camera.position.x, camera.position.z, nightF);
  audio.update(st, Math.cos(P.yaw), Math.sin(P.yaw), camera.position.x, camera.position.z, walkish ? el.under(camera.position.x, camera.position.z) : 0);
  renderer.render(scene, camera);
  // keep it smooth on slower phones: shed resolution first, then shadow detail
  if (raw > .034) slow += raw; else slow = Math.max(0, slow - raw * .5);
  if (slow > 2.5 && time > 6) {
    slow = 0;
    if (pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - .25); resize(); }
    else if (sky.sun.shadow.mapSize.x > 1024) { sky.sun.shadow.mapSize.set(1024, 1024); sky.sun.shadow.map?.dispose(); sky.sun.shadow.map = null; }
  }
}
document.addEventListener('visibilitychange', () => { audio.pause(document.hidden); last = performance.now(); });
window.__madison = { P, sky, el, city, street, renderer, scene, camera, get mode() { return mode; }, set time(v) { time = v; }, get time() { return time; }, toggleView, start: () => go.click() };
if (qs.has('walk')) { started = true; $('start').classList.add('gone'); mode = 'walk'; document.body.classList.add('walk'); }
else { $('bView').classList.add('off'); }
requestAnimationFrame(frame);
