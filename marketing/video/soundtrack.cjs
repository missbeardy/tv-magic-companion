// Synthesised soundtrack for the 30s ad: tense silence + phone buzz for the hook,
// then a warm plucked-guitar bed (Karplus-Strong) with UI sound effects on each beat.
// Cue times match the timeline in fieldbourne-30s.html.
const SR = 44100;

function buildSoundtrack(duration) {
  const n = Math.ceil(duration * SR);
  const L = new Float32Array(n);
  const add = (t0, samples, gain = 1) => {
    const s0 = Math.floor(t0 * SR);
    for (let i = 0; i < samples.length && s0 + i < n; i++) L[s0 + i] += samples[i] * gain;
  };
  const tone = (freq, dur, { attack = 0.004, decay = 6, type = 'sine' } = {}) => {
    const out = new Float32Array(Math.floor(dur * SR));
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      const ph = 2 * Math.PI * freq * t;
      let v = type === 'sine' ? Math.sin(ph) : Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.2 * Math.sin(3 * ph);
      out[i] = v * Math.min(1, t / attack) * Math.exp(-decay * t);
    }
    return out;
  };
  const pluck = (freq, dur = 1.6, bright = 0.5) => {
    const N = Math.round(SR / freq);
    const buf = new Float32Array(N).map(() => Math.random() * 2 - 1);
    // soften the excitation for a nylon-ish tone
    for (let k = 0; k < 2; k++) for (let i = 1; i < N; i++) buf[i] = buf[i] * bright + buf[i - 1] * (1 - bright);
    const out = new Float32Array(Math.floor(dur * SR));
    for (let i = 0, j = 0; i < out.length; i++, j = (j + 1) % N) {
      out[i] = buf[j];
      buf[j] = 0.4985 * (buf[j] + buf[(j + 1) % N]);
    }
    return out;
  };
  const noiseSweep = (dur, up = true) => {
    const out = new Float32Array(Math.floor(dur * SR));
    let lp = 0;
    for (let i = 0; i < out.length; i++) {
      const x = i / out.length;
      const a = 0.02 + 0.25 * (up ? x : 1 - x);
      lp += a * ((Math.random() * 2 - 1) - lp);
      out[i] = lp * Math.sin(Math.PI * x);
    }
    return out;
  };
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ── Hook: vibration buzz (0.15–1.7s), then a sad two-note "missed" ──
  for (const [a, b] of [[0.15, 0.55], [0.75, 1.15], [1.35, 1.7]]) {
    const len = b - a;
    const s = new Float32Array(Math.floor(len * SR));
    for (let i = 0; i < s.length; i++) {
      const t = i / SR;
      s[i] = (Math.sin(2 * Math.PI * 165 * t) + 0.5 * Math.sin(2 * Math.PI * 330 * t)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 30 * t)) * Math.min(1, t / 0.02, (len - t) / 0.02);
    }
    add(a, s, 0.25);
  }
  add(1.78, tone(midi(69), 0.5, { decay: 7, type: 'rich' }), 0.22);
  add(1.98, tone(midi(64), 0.8, { decay: 5, type: 'rich' }), 0.22);
  for (const t of [3.3, 3.7]) add(t, tone(midi(57), 0.2, { decay: 20 }), 0.12);

  // ── Music bed from 4.6s: C – G – Am – F arpeggios, ~100bpm ──
  const beat = 60 / 100 / 2; // eighth notes
  const chords = [[48, 55, 60, 64, 67], [43, 50, 55, 59, 62], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60]];
  const pattern = [0, 2, 3, 4, 3, 2, 3, 1];
  let t = 4.6, bar = 0;
  while (t < 26.4) {
    const ch = chords[bar % 4];
    pattern.forEach((idx, k) => {
      const at = t + k * beat;
      if (at < 26.4) add(at, pluck(midi(ch[idx]), 1.4, 0.45), k === 0 ? 0.24 : 0.15);
    });
    add(t, tone(midi(ch[0] - 12), 1.2, { decay: 2.5 }), 0.18); // soft bass on the one
    t += beat * 8; bar++;
  }

  // ── Scene whooshes ──
  for (const at of [4.45, 9.25, 14.25, 18.85, 22.85]) add(at, noiseSweep(0.35), 0.35);

  // ── UI cues ──
  const ping = (at, notes, g = 0.2, gap = 0.08) => notes.forEach((m, i) => add(at + i * gap, tone(midi(m), 0.6, { decay: 8 }), g));
  const click = (at) => add(at, tone(2200, 0.03, { decay: 200 }), 0.25);
  ping(5.0, [84, 91]);                 // auto text sent
  ping(7.4, [88, 91], 0.18);           // customer reply
  ping(9.5, [84, 88, 91], 0.2, 0.06);  // push notification
  [10.2, 10.55, 10.9, 11.25, 11.6].forEach((a) => click(a));
  click(15.3); click(16.6); click(24.25);
  ping(17.4, [72, 76, 79, 84], 0.2, 0.09); // accepted
  add(19.55, tone(80, 0.4, { decay: 10 }), 0.5); // calendar drop thud
  ping(20.5, [86], 0.15); ping(21.2, [88], 0.15);
  add(24.78, tone(70, 0.35, { decay: 12 }), 0.6); // stamp
  ping(24.8, [96, 100], 0.14, 0.07);   // ka-ching

  // ── End card: warm chord swell ──
  for (const m of [48, 55, 60, 64, 67, 72]) {
    const len = duration - 26.6;
    const s = new Float32Array(Math.floor(len * SR));
    for (let i = 0; i < s.length; i++) {
      const tt = i / SR;
      s[i] = Math.sin(2 * Math.PI * midi(m) * tt) * Math.min(1, tt / 0.6) * Math.min(1, (len - tt) / 1.2);
    }
    add(26.6, s, 0.07);
  }
  [60, 64, 67, 72].forEach((m, i) => add(26.8 + i * 0.12, pluck(midi(m), 2.5, 0.5), 0.22));

  // normalise + 16-bit stereo WAV
  let peak = 0; for (const v of L) peak = Math.max(peak, Math.abs(v));
  const g = 0.89 / (peak || 1);
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767);
    data.writeInt16LE(v, i * 4); data.writeInt16LE(v, i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

module.exports = { buildSoundtrack };
