// Synthesised sound effects: every sound is built from oscillators and
// filtered noise in WebAudio, so the game ships no audio files and makes no
// network request. The context is created on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer(seconds) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration, type = 'lowpass', freq = 1200, gain = 0.5, decay = 0.09, when = 0 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + decay);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  function tone({ freq = 440, to = null, duration = 0.08, type = 'sine', gain = 0.2, when = 0 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  return {
    unlock() { ensure(); },
    toggleMute() { muted = !muted; return muted; },
    shot(kind) {
      // A crack (high noise) over a low thump; bigger guns thump lower and longer.
      const table = {
        pistol: { freq: 2600, gain: 0.32, decay: 0.07, thump: 190 },
        rifle: { freq: 2100, gain: 0.42, decay: 0.09, thump: 150 },
        smg: { freq: 2800, gain: 0.3, decay: 0.06, thump: 210 },
        sniper: { freq: 1500, gain: 0.55, decay: 0.16, thump: 95 },
        shotgun: { freq: 1200, gain: 0.6, decay: 0.14, thump: 110 },
      };
      const s = table[kind] || table.rifle;
      burst({ duration: 0.12, freq: s.freq, gain: s.gain, decay: s.decay });
      tone({ freq: s.thump, to: 55, duration: 0.1, type: 'triangle', gain: 0.35 });
    },
    distantShot() { burst({ duration: 0.1, freq: 900, gain: 0.14, decay: 0.12 }); },
    dryFire() { tone({ freq: 1400, duration: 0.03, type: 'square', gain: 0.08 }); },
    reload() {
      tone({ freq: 700, duration: 0.03, type: 'square', gain: 0.1, when: 0 });
      tone({ freq: 500, duration: 0.03, type: 'square', gain: 0.1, when: 0.22 });
      tone({ freq: 900, duration: 0.04, type: 'square', gain: 0.12, when: 0.55 });
    },
    hit() { tone({ freq: 1250, duration: 0.05, type: 'sine', gain: 0.22 }); },
    kill() {
      tone({ freq: 660, duration: 0.07, gain: 0.2 });
      tone({ freq: 990, duration: 0.1, gain: 0.2, when: 0.07 });
    },
    hurt() {
      tone({ freq: 220, to: 110, duration: 0.16, type: 'sawtooth', gain: 0.16 });
      burst({ duration: 0.08, freq: 500, gain: 0.16, decay: 0.1 });
    },
    plantBeep() { tone({ freq: 1050, duration: 0.09, gain: 0.2 }); },
    defuseBeep() { tone({ freq: 880, duration: 0.09, gain: 0.18 }); },
    explosion() {
      burst({ duration: 0.7, type: 'lowpass', freq: 420, gain: 0.8, decay: 0.65 });
      tone({ freq: 90, to: 32, duration: 0.55, type: 'sine', gain: 0.6 });
    },
    bounce() { tone({ freq: 320, to: 180, duration: 0.05, type: 'triangle', gain: 0.1 }); },
    roundWin() {
      [523, 659, 784].forEach((f, i) => tone({ freq: f, duration: 0.16, gain: 0.18, when: i * 0.11 }));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => tone({ freq: f, duration: 0.18, gain: 0.16, when: i * 0.12 }));
    },
    buy() { tone({ freq: 740, duration: 0.05, gain: 0.16 }); tone({ freq: 1108, duration: 0.07, gain: 0.14, when: 0.05 }); },
    denied() { tone({ freq: 180, duration: 0.12, type: 'square', gain: 0.12 }); },
    step() { burst({ duration: 0.04, freq: 300, gain: 0.05, decay: 0.05 }); },
  };
}
