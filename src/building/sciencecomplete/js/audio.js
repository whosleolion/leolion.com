// Science Complete — synthesized audio (Web Audio only, no files, no deps).
// Exports: unlock, setMuted, isMuted, sfx, voice, music, setMusicVolume, setSfxVolume

const MUSIC_GAIN = 0.08, SFX_GAIN = 0.25, VOICE_GAIN = 0.12, XFADE = 0.8;

let ctx = null, master, musicBus, sfxBus, voiceBus, noiseBuf;
let muted = false, musicVol = 1, sfxVol = 1;
let want = null;        // requested track (remembered before unlock)
let cur = null;         // track actually playing
let players = [];       // active music players (current + fading out)
let timer = null, pausedByHide = false, visHooked = false;

// ---------- helpers ----------
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hzCache = {};
function hz(n) {
  if (typeof n === 'number') return n;
  if (n in hzCache) return hzCache[n];
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  const f = m ? 440 * Math.pow(2, (SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12 - 69) / 12) : 0;
  return (hzCache[n] = f);
}
const live = () => !!ctx && ctx.state === 'running';
const now = () => ctx.currentTime;
const rnd = (a, b) => a + Math.random() * (b - a);

function cleanup(...nodes) {
  return () => { for (const n of nodes) { try { n.disconnect(); } catch (e) {} } };
}

// Oscillator voice. o: {type,f,f2,gt,t,d,v,a,r,s,lp,hp,q,det,bus}
function tone(o) {
  const t = o.t ?? now(), d = o.d ?? 0.1, a = Math.min(o.a ?? 0.005, d * 0.5), r = Math.min(o.r ?? 0.03, d - a);
  const v = o.v ?? 0.5;
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type || 'square';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + (o.gt ?? d));
  if (o.det) osc.detune.setValueAtTime(o.det, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + a);
  g.gain.linearRampToValueAtTime(v * (o.s ?? 0.5), t + Math.max(a + 0.001, d - r));
  g.gain.linearRampToValueAtTime(0, t + d);
  let head = osc, filt = null;
  if (o.lp || o.hp) {
    filt = ctx.createBiquadFilter();
    filt.type = o.lp ? 'lowpass' : 'highpass';
    filt.frequency.value = o.lp || o.hp;
    filt.Q.value = o.q ?? 0.7;
    osc.connect(filt); head = filt;
  }
  head.connect(g); g.connect(o.bus || sfxBus);
  osc.onended = cleanup(osc, g, filt || osc);
  osc.start(t); osc.stop(t + d + 0.02);
}

// Filtered noise burst. o: {t,d,v,ft,f,f2,q,a,bus}
function noise(o) {
  const t = o.t ?? now(), d = o.d ?? 0.1, a = Math.min(o.a ?? 0.003, d * 0.5), v = o.v ?? 0.5;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf;
  f.type = o.ft || 'bandpass';
  f.frequency.setValueAtTime(o.f ?? 1000, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + d);
  f.Q.value = o.q ?? 1;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  g.gain.linearRampToValueAtTime(0, t + d + 0.01);
  src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
  src.onended = cleanup(src, f, g);
  src.start(t, Math.random() * 0.5); src.stop(t + d + 0.02);
}

// ---------- setup ----------
function build() {
  master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_GAIN * musicVol; musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_GAIN * sfxVol; sfxBus.connect(master);
  voiceBus = ctx.createGain(); voiceBus.gain.value = VOICE_GAIN * sfxVol; voiceBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const ch = noiseBuf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
}

function startTimer() { if (!timer) timer = setInterval(tick, 25); }
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

function hookVisibility() {
  if (visHooked || typeof document === 'undefined') return;
  visHooked = true;
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) {
      stopTimer();
      if (ctx.state === 'running') { pausedByHide = true; ctx.suspend().catch(() => {}); }
    } else {
      if (pausedByHide) { pausedByHide = false; ctx.resume().catch(() => {}); }
      startTimer();
    }
  });
}

export function unlock() {
  try {
    if (!ctx) {
      if (typeof window === 'undefined') return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      build();
      hookVisibility();
    }
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (ctx.state !== 'running' && !hidden) ctx.resume().catch(() => {});
    if (!hidden) startTimer();
    if (want !== cur) applyMusic();
  } catch (e) { /* audio is optional */ }
}

function rampTo(param, v, tc = 0.05) {
  const t = now(); param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.setTargetAtTime(v, t, tc);
}

export function setMuted(m) {
  muted = !!m;
  if (ctx) try { rampTo(master.gain, muted ? 0 : 1); } catch (e) {}
}
export function isMuted() { return muted; }

export function setMusicVolume(v) {
  musicVol = Math.max(0, Math.min(1, +v || 0));
  if (ctx) try { rampTo(musicBus.gain, MUSIC_GAIN * musicVol); } catch (e) {}
}
export function setSfxVolume(v) {
  sfxVol = Math.max(0, Math.min(1, +v || 0));
  if (ctx) try { rampTo(sfxBus.gain, SFX_GAIN * sfxVol); rampTo(voiceBus.gain, VOICE_GAIN * sfxVol); } catch (e) {}
}

// ---------- sfx ----------
const SEQ = (notes, gap, o) => (t) => notes.forEach((n, i) => n && tone({ ...o, f: hz(n), t: t + i * gap }));

const SFX = {
  select: (t) => tone({ t, f: 880, d: 0.04, v: 0.25, s: 0.3 }),
  confirm: (t) => { tone({ t, f: 660, d: 0.05, v: 0.3 }); tone({ t: t + 0.055, f: 990, d: 0.08, v: 0.3 }); },
  cancel: (t) => { tone({ t, f: 440, d: 0.05, v: 0.3 }); tone({ t: t + 0.055, f: 294, d: 0.08, v: 0.3 }); },
  bump: (t) => { tone({ t, type: 'triangle', f: 120, f2: 55, d: 0.09, v: 0.6 }); noise({ t, ft: 'lowpass', f: 500, d: 0.05, v: 0.3 }); },
  step: (t) => noise({ t, f: 1800, q: 2, d: 0.025, v: 0.12 }),
  item: (t) => {
    SEQ(['C5', 'E5', 'G5', 'C6'], 0.07, { type: 'square', d: 0.09, v: 0.22, s: 0.6 })(t);
    tone({ t: t + 0.28, f: hz('E6'), d: 0.32, v: 0.22, s: 0.4 });
    tone({ t: t + 0.28, type: 'triangle', f: hz('G5'), d: 0.34, v: 0.3, s: 0.5 });
  },
  door: (t) => { noise({ t, ft: 'lowpass', f: 250, f2: 1600, d: 0.3, v: 0.45, a: 0.05 }); tone({ t, type: 'triangle', f: 160, f2: 80, d: 0.25, v: 0.35 }); },
  zap: (t) => { tone({ t, type: 'sawtooth', f: 1800, f2: 110, d: 0.45, v: 0.28, lp: 3000 }); noise({ t, f: 3000, f2: 300, q: 3, d: 0.45, v: 0.25 }); },
  hit: (t) => { tone({ t, f: 220, f2: 70, d: 0.1, v: 0.4 }); noise({ t, ft: 'highpass', f: 1500, d: 0.07, v: 0.35 }); },
  slash: (t) => noise({ t, f: 700, f2: 5000, q: 2.5, d: 0.18, v: 0.6, a: 0.04 }),
  hurt: (t) => { tone({ t, f: 160, f2: 45, d: 0.25, v: 0.45, lp: 900 }); noise({ t, ft: 'lowpass', f: 900, f2: 200, d: 0.2, v: 0.4 }); },
  shutter: (t) => { noise({ t, ft: 'highpass', f: 3000, d: 0.02, v: 0.5 }); noise({ t: t + 0.07, ft: 'highpass', f: 2200, d: 0.03, v: 0.45 }); },
  boot: SEQ(['C5', 'G5', 'C6'], 0.05, { d: 0.06, v: 0.22, s: 0.7 }),
  powerOff: (t) => { tone({ t, type: 'sine', f: 1400, f2: 40, d: 0.55, v: 0.35, s: 0.8 }); noise({ t: t + 0.5, ft: 'highpass', f: 2000, d: 0.02, v: 0.4 }); },
  powerOn: (t) => { tone({ t, type: 'sine', f: 60, f2: 3200, d: 0.8, v: 0.18, a: 0.1, s: 0.9 }); tone({ t, type: 'triangle', f: 30, f2: 1600, d: 0.8, v: 0.12, a: 0.1 }); },
  error: (t) => { tone({ t, f: 110, d: 0.11, v: 0.4, s: 0.9, lp: 1200 }); tone({ t: t + 0.15, f: 104, d: 0.14, v: 0.4, s: 0.9, lp: 1200 }); },
  click: (t) => {
    noise({ t, ft: 'highpass', f: 4000, d: 0.012, v: 0.6 }); tone({ t, f: 1500, f2: 900, d: 0.02, v: 0.25 });
    noise({ t: t + 0.035, ft: 'bandpass', f: 1800, q: 3, d: 0.015, v: 0.4 });
  },
  save: (t) => { tone({ t, f: 1320, d: 0.035, v: 0.2 }); tone({ t: t + 0.05, f: 1760, d: 0.05, v: 0.2 }); },
  scan: (t) => { tone({ t, type: 'triangle', f: 300, f2: 2400, d: 0.7, v: 0.3, a: 0.05, s: 0.8 }); tone({ t, type: 'sine', f: 310, f2: 2480, d: 0.7, v: 0.2, a: 0.05, s: 0.8 }); },
  memory: (t) => {
    noise({ t, f: 300, f2: 3500, q: 1.5, d: 1.5, v: 0.25, a: 0.5 });
    const pent = ['C6', 'D6', 'E6', 'G6', 'A6', 'C7'];
    for (let i = 0; i < 12; i++) tone({ t: t + i * 0.1, type: 'sine', f: hz(pent[(i * 7 + 2) % 6]) * rnd(0.995, 1.005), d: 0.4, v: 0.12 * (1 - i / 14), a: 0.02, s: 0.4 });
  },
  victory: (t) => {
    SEQ(['G4', 'C5', 'E5', 'G5'], 0.1, { d: 0.1, v: 0.22, s: 0.7 })(t);
    SEQ(['E5', 'G5'], 0.14, { d: 0.14, v: 0.22, s: 0.7 })(t + 0.45);
    tone({ t: t + 0.75, f: hz('C6'), d: 0.7, v: 0.22, s: 0.5 });
    tone({ t: t + 0.75, type: 'triangle', f: hz('E5'), d: 0.72, v: 0.25, s: 0.5 });
    SEQ(['C3', 'G3', 'C4'], 0.25, { type: 'triangle', d: 0.3, v: 0.4 })(t + 0.05);
  },
  type: (t) => { noise({ t, ft: 'highpass', f: 3500, d: 0.012, v: 0.25 }); tone({ t, f: rnd(1100, 1300), d: 0.012, v: 0.06 }); },
};

export function sfx(name) {
  if (!live()) return;
  const fn = SFX[name];
  if (fn) try { fn(now() + 0.005); } catch (e) {}
}

// ---------- voices ----------
const VOICES = {
  narrator: { type: 'square', f: 330, d: 0.03, v: 0.18, lp: 2000 },
  console: { type: 'square', f: 1180, d: 0.022, v: 0.14, f2m: 1 },
  chris: { type: 'sine', f: 760, d: 0.038, v: 0.4, f2m: 1.25 },
  proton: { type: 'square', f: 560, d: 0.03, v: 0.16 },
  hatch: { type: 'triangle', f: 170, d: 0.04, v: 0.45 },
  diane: { type: 'triangle', f: 500, d: 0.035, v: 0.35 },
  slime: { type: 'sawtooth', f: 120, d: 0.04, v: 0.3, f2m: 0.6, lp: 500 },
  ad: { type: 'sawtooth', f: 620, d: 0.03, v: 0.22, lp: 3500 },
};
export function voice(speaker) {
  if (!live()) return;
  const p = VOICES[speaker] || VOICES.narrator;
  try {
    const f = p.f * rnd(0.93, 1.07);
    tone({ type: p.type, f, f2: p.f2m ? f * p.f2m : 0, d: p.d, v: p.v, a: 0.004, r: 0.012, s: 0.7, lp: p.lp, bus: voiceBus });
  } catch (e) {}
}

// ---------- music ----------
// Tokens: note name ('C4','F#3','Bb2'), '.' rest. Drum channel tokens: k s h.
// Channel: {w: wave|'drum', v, l: note length in steps, lp, g: pitch glide ratio, p: pattern}
const R = (n) => ' .'.repeat(n) + ' ';
const x = (s, n) => (s + ' ').repeat(n);
const TRACKS = {
  title: { bpm: 66, div: 2, ch: [
    { w: 'triangle', v: 0.45, l: 1.6, p: 'A3 E4 A4 C5 E5 C5 A4 E4 F3 C4 F4 A4 C5 A4 F4 C4 D3 A3 D4 F4 A4 F4 D4 A3 E3 B3 E4 G#4 B4 G#4 E4 B3' },
    { w: 'sine', v: 0.55, l: 8, p: 'A2' + R(7) + 'F2' + R(7) + 'D2' + R(7) + 'E2' + R(7) },
    { w: 'square', v: 0.07, l: 6, lp: 1200, p: R(4) + 'E5' + R(11) + 'C5' + R(11) + 'B4' + R(3) },
  ] },
  lab: { bpm: 60, div: 2, drone: { f: 55, w: 'sawtooth', lp: 130, v: 0.5 }, ch: [
    { w: 'triangle', v: 0.35, l: 3, p: 'C4 . G4' + R(3) + 'Eb4' + R(4) + 'Bb3' + R(3) + 'G3 . . . . . D4 . F4' + R(4) + 'Eb4' + R(3) },
    { w: 'sine', v: 0.3, l: 14, p: 'C3' + R(15) + 'Ab2' + R(15) },
  ] },
  hub: { bpm: 84, div: 2, drone: { f: 55, w: 'sawtooth', lp: 110, v: 0.3 }, ch: [
    { w: 'triangle', v: 0.35, l: 1.5, p: 'D4 A4 F4 A4 E4 A4 C5 A4 D4 A4 F4 A4 G4 E4 C4 E4 Bb3 F4 D4 F4 A3 E4 C#4 E4 D4 A4 F4 A4 E4 A4 D5 A4' },
    { w: 'sine', v: 0.45, l: 7, p: 'D3' + R(7) + 'C3' + R(7) + 'Bb2' + R(3) + 'A2' + R(3) + 'D3' + R(7) },
    { w: 'drum', v: 0.3, p: 'h . . . h . . .' },
  ] },
  micro: { bpm: 112, div: 4, ch: [
    { w: 'square', v: 0.16, l: 0.6, lp: 2500, p: 'C5 . E5 G5 . C6 . G5 A5 . G5 E5 . D5 . . D5 . F5 A5 . D6 . A5 G5 . E5 C5 . D5 . . E5 . G5 C6 . E6 . C6 A5 . G5 E5 . G5 . . D5 . F5 E5 . D5 . B4 C5' + R(7) },
    { w: 'sine', v: 0.2, l: 0.7, g: 1.8, p: R(6) + 'G5' + R(9) + 'C6' + R(5) + 'E6' + R(11) + 'A5' + R(15) + 'D6' + R(13) },
    { w: 'triangle', v: 0.45, l: 0.8, p: x('C3 . . . G2 . . .', 2) + x('D3 . . . A2 . . .', 2) + x('A2 . . . E3 . . .', 2) + 'F2 . . . G2 . . . C3 . . . . . . .' },
    { w: 'drum', v: 0.25, p: '. . h . . . h h' },
  ] },
  servers: { bpm: 100, div: 4, fan: { lp: 700, v: 0.5 }, ch: [
    { w: 'sawtooth', v: 0.35, l: 1.4, lp: 380, p: x('E2 . E2 . E2 . E3 . E2 . E2 . G2 . E2 .', 3) + 'F2 . F2 . F2 . F3 . F2 . F2 . D2 . D#2 .' },
    { w: 'triangle', v: 0.16, l: 10, p: R(8) + 'B4' + R(15) + 'C5' + R(15) + 'B4' + R(7) + 'F#4' + R(15) },
    { w: 'drum', v: 0.35, p: 'k . . . h . . . k . k . h . . .' },
  ] },
  net: { bpm: 132, div: 4, ch: [
    { w: 'square', v: 0.15, l: 0.8, lp: 4000, p: 'E5 . G5 . C6 . G5 . A5 . G5 E5 . D5 C5 . F5 . A5 . C6 . A5 . G5 . F5 . E5 . D5 . E5 . G5 . A5 . C6 . D6 . C6 A5 . G5 . A5 G5 . E5 . D5 . C5 . D5 E5 G5 . C6' + R(3) + 'C6 . . A5 . . G5 . E5 . G5 . A5 . . . F5 . . A5 . . C6 . D6 . C6 . A5 . . . E5 . . G5 . . C6 . E6 . D6 . C6 . A5 . G5 . . D5 . . G5 . B5 . D6 . B5 . G5 .' },
    { w: 'triangle', v: 0.5, l: 0.8, p: x('C3 . C4 .', 4) + x('F2 . F3 .', 4) + x('A2 . A3 .', 4) + x('G2 . G3 .', 4) },
    { w: 'square', v: 0.05, l: 0.5, lp: 3000, p: x('C5 E5 G5 E5', 4) + x('C5 F5 A5 F5', 4) + x('C5 E5 A5 E5', 4) + x('B4 D5 G5 D5', 4) },
    { w: 'drum', v: 0.35, p: 'k . h . s . h . k . h k s . h h' },
  ] },
  memory: { bpm: 76, div: 2, ch: [
    { w: 'sine', v: 0.35, l: 2.5, p: 'A5 C6 F6 E6 D6 C6 A5 G5 Bb5 D6 G6 F6 E6 D6 C6 . A5 C6 F6 E6 D6 C6 A5 F5 G5 Bb5 E6 D6 C6' + R(3) },
    { w: 'sine', v: 0.1, l: 2.5, p: '. A5 C6 F6 E6 D6 C6 A5 G5 Bb5 D6 G6 F6 E6 D6 C6 . A5 C6 F6 E6 D6 C6 A5 F5 G5 Bb5 E6 D6 C6 . .' },
    { w: 'triangle', v: 0.25, l: 7, p: 'F3' + R(7) + 'G3' + R(7) + 'D3' + R(7) + 'C3' + R(7) },
  ] },
  battle: { bpm: 150, div: 4, ch: [
    { w: 'square', v: 0.22, l: 0.8, lp: 1400, p: x('A2 A2 A3 A2', 4) + x('F2 F2 F3 F2', 4) + x('G2 G2 G3 G2', 4) + x('E2 E2 E3 E2', 2) + x('E2 E3 G#2 B2', 2) },
    { w: 'square', v: 0.12, l: 1.8, lp: 3200, p: 'A4 . . C5 . . E5 . D5 . C5 . B4 . C5 . A4 . . F4 . . A4 . C5 . D5 . C5 . A4 . B4 . . D5 . . G5 . F5 . E5 . D5 . B4 . G#4 . . B4 . . E5 . G#5 . E5 . D5 . B4 . E5 . . D5 . . C5 . B4 . A4 . C5 . E5 . F5 . . E5 . . D5 . C5 . A4 . F4 . A4 . G5 . . F5 . . E5 . D5 . B4 . G4 . B4 . E5 . . D5 . . B4 . G#4 . E4 . G#4 . B4 .' },
    { w: 'drum', v: 0.4, p: 'k . h . s . h k k . h . s . h h' },
  ] },
  ending: { bpm: 80, div: 2, drone: { f: 65.41, w: 'triangle', lp: 400, v: 0.25 }, ch: [
    { w: 'triangle', v: 0.35, l: 2, p: 'C4 E4 G4 C5 D5 E5 G5 E5 F3 A3 C4 F4 A4 C5 F5 C5 A3 C4 E4 A4 B4 C5 E5 C5 G3 B3 D4 G4 B4 D5 G5 A5' },
    { w: 'sine', v: 0.45, l: 8, p: 'C3' + R(7) + 'F2' + R(7) + 'A2' + R(7) + 'G2' + R(7) },
    { w: 'square', v: 0.06, l: 7, lp: 1500, p: 'E5' + R(7) + 'F5' + R(7) + 'A5' + R(7) + 'B5' + R(7) },
  ] },
};
for (const k in TRACKS) for (const c of TRACKS[k].ch) c.n = c.p.trim().split(/\s+/);

function drum(tok, t, v, bus) {
  if (tok === 'k') tone({ t, type: 'sine', f: 150, f2: 45, gt: 0.1, d: 0.16, v: v * 1.6, s: 0.4, bus });
  else if (tok === 's') noise({ t, f: 1800, q: 0.8, d: 0.11, v: v * 0.8, bus });
  else if (tok === 'h') noise({ t, ft: 'highpass', f: 7000, d: 0.03, v: v * 0.5, bus });
}

function makePlayer(name) {
  const tr = TRACKS[name], t = now() + 0.05;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(1, t + XFADE);
  gain.connect(musicBus);
  const p = { name, tr, gain, step: 0, next: t, dt: 60 / tr.bpm / tr.div, end: 0, srcs: [], extra: [] };
  if (tr.drone) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = tr.drone.w; o.frequency.value = tr.drone.f;
    f.type = 'lowpass'; f.frequency.value = tr.drone.lp; g.gain.value = tr.drone.v;
    o.connect(f); f.connect(g); g.connect(gain); o.start(t);
    p.srcs.push(o); p.extra.push(f, g);
  }
  if (tr.fan) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = 'lowpass'; f.frequency.value = tr.fan.lp; g.gain.value = tr.fan.v;
    s.connect(f); f.connect(g); g.connect(gain); s.start(t);
    p.srcs.push(s); p.extra.push(f, g);
  }
  return p;
}

function fadeOut(p) {
  const t = now();
  p.end = t + XFADE;
  try {
    p.gain.gain.cancelScheduledValues(t);
    p.gain.gain.setValueAtTime(p.gain.gain.value, t);
    p.gain.gain.linearRampToValueAtTime(0, p.end);
    for (const s of p.srcs) s.stop(p.end + 0.05);
  } catch (e) {}
}

function killPlayer(p) {
  for (const n of [...p.srcs, ...p.extra, p.gain]) { try { n.disconnect(); } catch (e) {} }
  p.srcs = p.extra = [];
}

function playStep(p, i, t) {
  for (const c of p.tr.ch) {
    const tok = c.n[i % c.n.length];
    if (tok === '.') continue;
    if (c.w === 'drum') { drum(tok, t, c.v, p.gain); continue; }
    const f = hz(tok);
    if (!f) continue;
    const d = p.dt * (c.l ?? 1);
    tone({ t, type: c.w, f, f2: c.g ? f * c.g : 0, gt: 0.08, d, v: c.v, a: Math.min(0.02, d * 0.2), r: Math.min(0.08, d * 0.4), s: 0.55, lp: c.lp, bus: p.gain });
  }
}

function tick() {
  if (!ctx || ctx.state !== 'running') return;
  try {
    const t0 = now(), ahead = t0 + 0.12;
    for (const p of players) {
      if (p.next < t0 - 0.2) p.next = t0 + 0.02; // fell behind (e.g. after throttling)
      while (p.next < ahead && !(p.end && p.next >= p.end)) {
        playStep(p, p.step, p.next);
        p.step++; p.next += p.dt;
      }
    }
    players = players.filter((p) => {
      if (p.end && t0 > p.end + 3) { killPlayer(p); return false; }
      return true;
    });
  } catch (e) {}
}

function applyMusic() {
  if (!ctx) return;
  try {
    for (const p of players) if (!p.end) fadeOut(p);
    cur = want;
    if (want) players.push(makePlayer(want));
  } catch (e) {}
}

export function music(track) {
  const t = track == null ? null : track;
  if (t !== null && !TRACKS[t]) return; // unknown track: ignore
  if (t === want) return;
  want = t;
  if (ctx) applyMusic();
}
