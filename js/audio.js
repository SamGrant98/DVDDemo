// js/audio.js
//
// Web Audio synthesis — no audio files required. All sounds are generated on
// demand. Persisted via localStorage. AudioContext is created lazily on the
// first user gesture so browser autoplay policies are happy.
//
// Three one-shot effects + one looping drone:
//   playThunk     — case clack on DVD click / flip
//   playScrollTick — wheel ratchet on tower scroll movement
//   playExplosion — descending whoosh when entering focus mode
//   startAmbient  — slow detuned drone (separate toggle, continuous)

const LS_KEY = "dvdshelf_audio_enabled";
const LS_AMBIENT_KEY = "dvdshelf_ambient_enabled";

let ctx = null;
let enabled = false;
let ambientEnabled = false;
let ambientState = null;
let lastTickAt = 0;

function ensureCtx() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  }
  // Always try to unlock — needed both when the context is freshly created
  // (Chrome starts new contexts suspended) AND when sound is enabled from
  // persisted localStorage without going through the toggle click.
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function readPersisted() {
  try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
}
function writePersisted() {
  try { localStorage.setItem(LS_KEY, enabled ? "1" : "0"); } catch {}
}

function readAmbientPersisted() {
  try { return localStorage.getItem(LS_AMBIENT_KEY) === "1"; } catch { return false; }
}
function writeAmbientPersisted() {
  try { localStorage.setItem(LS_AMBIENT_KEY, ambientEnabled ? "1" : "0"); } catch {}
}

export function initAudio() {
  enabled = readPersisted();
  ambientEnabled = readAmbientPersisted();
}

export function isAudioEnabled() {
  return enabled;
}
export function isAmbientEnabled() {
  return ambientEnabled;
}

export function setAudioEnabled(v) {
  enabled = !!v;
  writePersisted();
  if (enabled) {
    ensureCtx();
    syncAmbient();
  } else {
    stopAmbient();
  }
}
export function setAmbientEnabled(v) {
  ambientEnabled = !!v;
  writeAmbientPersisted();
  syncAmbient();
}
function syncAmbient() {
  if (enabled && ambientEnabled) startAmbient();
  else stopAmbient();
}

export function playThunk({ pitch = 1, gain = 1 } = {}) {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c) return;

  const now = c.currentTime;
  const dur = 0.12;

  // Lowpassed noise burst — the "clack"
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length;
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3);
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;

  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 700 * pitch;
  lp.Q.value = 1.2;

  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.18 * gain, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.6);

  noise.connect(lp).connect(noiseGain).connect(c.destination);

  // Low sine for body — gives the thunk physical weight
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140 * pitch, now);
  osc.frequency.exponentialRampToValueAtTime(60 * pitch, now + dur);

  const oscGain = c.createGain();
  oscGain.gain.setValueAtTime(0.25 * gain, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  osc.connect(oscGain).connect(c.destination);

  noise.start(now);
  noise.stop(now + dur);
  osc.start(now);
  osc.stop(now + dur);
}

// Quick wheel-ratchet tick on tower scroll movement. Rate-limited so it
// doesn't spam during fast scrolls.
export function playScrollTick() {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c) return;

  const now = performance.now();
  if (now - lastTickAt < 60) return;
  lastTickAt = now;

  const t = c.currentTime;
  const dur = 0.03;

  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;

  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3800 + Math.random() * 1400; // small pitch variation per tick
  bp.Q.value = 7;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.045, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  noise.connect(bp).connect(gain).connect(c.destination);
  noise.start(t);
  noise.stop(t + dur);
}

// Whoosh when DVDs explode outward on entering focus mode. Layered: long
// filtered noise burst with downward filter sweep + low sine for body.
export function playExplosion() {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c) return;

  const t = c.currentTime;
  const dur = 0.5;

  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const x = i / data.length;
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, 1.4);
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;

  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.8;
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(220, t + dur);

  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.22, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  noise.connect(lp).connect(noiseGain).connect(c.destination);

  // Sub for weight — descending sine.
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(190, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + dur);

  const oscGain = c.createGain();
  oscGain.gain.setValueAtTime(0.18, t);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(oscGain).connect(c.destination);

  noise.start(t);
  noise.stop(t + dur);
  osc.start(t);
  osc.stop(t + dur);
}

// Continuous ambient drone. Two slightly-detuned saws + a soft 5th-up sine,
// all through a lowpass whose cutoff is modulated by a slow LFO so it
// breathes. Very quiet (gain ~0.035). Fades in/out so toggling doesn't pop.
function startAmbient() {
  if (ambientState) return;
  const c = ensureCtx();
  if (!c) return;

  const baseFreq = 65; // ~C2
  const t = c.currentTime;

  const out = c.createGain();
  out.gain.value = 0;
  out.connect(c.destination);

  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 280;
  lp.Q.value = 1;
  lp.connect(out);

  // Slow LFO breathes the filter cutoff
  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.08;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 80;
  lfo.connect(lfoGain).connect(lp.frequency);

  const osc1 = c.createOscillator();
  osc1.type = "sawtooth";
  osc1.frequency.value = baseFreq;
  const osc2 = c.createOscillator();
  osc2.type = "sawtooth";
  osc2.frequency.value = baseFreq * 1.006; // tiny detune for chorus
  const osc3 = c.createOscillator();
  osc3.type = "sine";
  osc3.frequency.value = baseFreq * 1.5; // soft 5th up

  osc1.connect(lp);
  osc2.connect(lp);
  osc3.connect(lp);

  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(0.035, t + 1.4);

  osc1.start();
  osc2.start();
  osc3.start();
  lfo.start();

  ambientState = { osc1, osc2, osc3, lfo, out };
}

function stopAmbient() {
  if (!ambientState) return;
  const c = ensureCtx();
  if (!c) {
    ambientState = null;
    return;
  }
  const { osc1, osc2, osc3, lfo, out } = ambientState;
  const t = c.currentTime;
  out.gain.cancelScheduledValues(t);
  out.gain.linearRampToValueAtTime(0, t + 0.5);
  setTimeout(() => {
    try { osc1.stop(); } catch {}
    try { osc2.stop(); } catch {}
    try { osc3.stop(); } catch {}
    try { lfo.stop(); } catch {}
  }, 600);
  ambientState = null;
}
