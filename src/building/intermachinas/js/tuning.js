// Live-tunable numbers. Press ` (backquote) or the ⚙ button for sliders.
// Values persist per browser (localStorage); "reset" restores these defaults.
export const DEFAULTS = {
  // movement
  jog: 5.2, sprint: 9.4, crouchSpeed: 2.3, accel: 34, airControl: 3,
  gravity: 27, jump: 9.4, climbSpeed: 2.8, climbLeap: 7.5,
  wallrunTime: 0.9, wallrunGravity: 0.3, fallSafe: 9,
  // combat
  playerDamage: 1, enemyDamage: 12, enemyAttackGap: 1.4, maxAttackers: 1,
  // stealth / ai
  detectRate: 1, viewDist: 17, viewFov: 110, guardChase: 5.4,
  // camera
  camDist: 4.4, mouseSens: 1,
};

export const META = [
  ['Movement'],
  ['jog', 2, 9, 0.1], ['sprint', 5, 16, 0.1], ['crouchSpeed', 1, 5, 0.1], ['accel', 5, 80, 1],
  ['airControl', 0, 10, 0.1], ['gravity', 10, 50, 0.5], ['jump', 4, 16, 0.1],
  ['climbSpeed', 1, 6, 0.1], ['climbLeap', 3, 14, 0.1], ['wallrunTime', 0.2, 2, 0.05],
  ['wallrunGravity', 0, 1, 0.05], ['fallSafe', 3, 30, 0.5],
  ['Combat'],
  ['playerDamage', 0.25, 4, 0.05], ['enemyDamage', 0, 40, 1], ['enemyAttackGap', 0.3, 4, 0.1], ['maxAttackers', 1, 4, 1],
  ['Stealth / AI'],
  ['detectRate', 0, 4, 0.05], ['viewDist', 5, 40, 0.5], ['viewFov', 40, 200, 5], ['guardChase', 1, 10, 0.1],
  ['Camera'],
  ['camDist', 2, 9, 0.1], ['mouseSens', 0.2, 3, 0.05],
];

const KEY = 'intermachinas.tuning.v1';
export const T = { ...DEFAULTS };
try { Object.assign(T, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}

export function saveTuning() { try { localStorage.setItem(KEY, JSON.stringify(T)); } catch {} }
export function resetTuning() { Object.assign(T, DEFAULTS); try { localStorage.removeItem(KEY); } catch {} }
