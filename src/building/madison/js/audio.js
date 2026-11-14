// Synthesised soundscape (no audio files): city hum, the J train overhead, footsteps.
export function makeAudio() {
  let ctx = null, master, trainG, clackG, pan, ambG, white, muted = false, lastJoint = 0;
  const noiseBuf = (brown) => {
    const b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = b.getChannelData(0); let l = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { l = (l + .02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; }
    return b;
  };
  const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
  const filt = (type, f, q = .7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
  const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  function start() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = gain(muted ? 0 : .9); master.connect(ctx.destination);
    const brown = noiseBuf(true); white = noiseBuf(false);
    ambG = gain(.11); loop(brown).connect(filt('lowpass', 420)).connect(ambG).connect(master);
    const air = gain(.012); loop(white).connect(filt('bandpass', 2400, .4)).connect(air).connect(master);
    pan = ctx.createStereoPanner ? ctx.createStereoPanner() : gain(1); pan.connect(master);
    trainG = gain(0); trainG.connect(pan);
    loop(brown).connect(filt('bandpass', 95, .6)).connect(gain(2.6)).connect(trainG);
    loop(white).connect(filt('bandpass', 1500, .8)).connect(gain(.16)).connect(trainG);
    loop(white).connect(filt('highpass', 5200)).connect(gain(.05)).connect(trainG);       // wheel squeal / hiss
    clackG = gain(0); loop(white).connect(filt('lowpass', 700)).connect(clackG).connect(pan);
  }
  function update(st, rightX, rightZ, px, pz, under) {
    if (!ctx) return;
    const t = ctx.currentTime, d = st.trainDist, vol = d > 400 ? 0 : Math.min(1.25, 1.9 / (1 + (d / 26) ** 2)) * (1 + under * .35);
    trainG.gain.setTargetAtTime(vol, t, .25);
    ambG.gain.setTargetAtTime(.1 + under * .05, t, .5);
    if (pan.pan) { const dx = st.trainX - px, dz = st.trainZ - pz, l = Math.hypot(dx, dz) || 1; pan.pan.setTargetAtTime(Math.max(-.85, Math.min(.85, (dx * rightX + dz * rightZ) / l)), t, .2); }
    const joint = Math.floor(st.trainS / 11.9);
    if (joint !== lastJoint && vol > .03) { lastJoint = joint; for (const o of [0, .085]) { clackG.gain.setValueAtTime(vol * .9, t + o); clackG.gain.exponentialRampToValueAtTime(.001, t + o + .07); } }
  }
  function step(run) {
    if (!ctx || muted) return;
    const t = ctx.currentTime, s = ctx.createBufferSource(), g = gain(0); s.buffer = white;
    s.connect(filt('bandpass', 260 + Math.random() * 240, 1.2)).connect(g).connect(master);
    g.gain.setValueAtTime(run ? .2 : .13, t); g.gain.exponentialRampToValueAtTime(.001, t + .09);
    s.start(t, Math.random() * 2, .12);
  }
  return { start, update, step, toggle() { muted = !muted; if (ctx) master.gain.setTargetAtTime(muted ? 0 : .9, ctx.currentTime, .05); return muted; }, pause(p) { if (ctx) p ? ctx.suspend() : ctx.resume(); } };
}
