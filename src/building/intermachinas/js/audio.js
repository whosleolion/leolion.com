// Placeholder SFX, synthesised with WebAudio so there are no files to fetch.
let ctx = null, master = null, noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(freq, dur, type = 'sine', vol = 0.3, slide = 0) {
  if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, freq, q = 1, vol = 0.3, type = 'bandpass') {
  if (!ctx) return;
  const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  env(g, t, 0.004, vol, dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.02);
}

export const sfx = {
  step: () => noise(0.05, 900, 2, 0.04),
  jump: () => noise(0.12, 500, 1, 0.08),
  land: (k = 1) => { noise(0.15, 200, 1, 0.15 * k); tone(70, 0.12, 'sine', 0.2 * k, 0.6); },
  whoosh: () => noise(0.16, 1400, 0.8, 0.12),
  hit: () => { noise(0.12, 300, 1.2, 0.35); tone(110, 0.15, 'square', 0.12, 0.4); },
  heavy: () => { noise(0.22, 180, 1, 0.45); tone(60, 0.25, 'sine', 0.4, 0.5); },
  block: () => { tone(1800, 0.18, 'triangle', 0.15, 0.9); tone(2700, 0.12, 'sine', 0.08); },
  blade: () => { tone(2400, 0.25, 'sawtooth', 0.06, 1.6); noise(0.2, 3000, 4, 0.12); },
  hurt: () => { tone(220, 0.2, 'square', 0.12, 0.5); noise(0.1, 600, 1, 0.2); },
  alert: () => { tone(500, 0.12, 'square', 0.1, 1.5); setTimeout(() => tone(800, 0.2, 'square', 0.1, 1.2), 110); },
  suspicious: () => tone(420, 0.18, 'triangle', 0.08, 1.3),
  sync: () => [392, 494, 587, 784].forEach((f, i) => setTimeout(() => tone(f, 1.2, 'sine', 0.12), i * 120)),
  throwing: () => noise(0.1, 1200, 2, 0.1),
  complete: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.8, 'triangle', 0.12), i * 150)),
  death: () => tone(300, 1.2, 'sawtooth', 0.12, 0.2),
};
