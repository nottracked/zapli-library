// The game's sounds, made as they play with Web Audio: no sound files. A tile rings like struck glazed clay, iron
// clangs, the paddle thumps softly, and tiles broken one after another climb a five-note scale, so a long run sounds
// like a tune. Sound starts only after the player's first tap (browsers and phones allow nothing earlier), and a
// phone without Web Audio stays silent.

const SCALE = [0, 2, 4, 7, 9]; // a major pentatonic scale, in semitones
const BASE = 523.25; // C5

export function createSound() {
  let ctx = null;
  let out = null;
  let noise = null;
  let enabled = true;
  let voices = 0;
  const last = new Map();

  function supported() {
    return typeof window !== "undefined" && Boolean(window.AudioContext || window.webkitAudioContext);
  }

  /** Creates or wakes the audio; call it from a tap (click, pointerup, touchend or a key). */
  function unlock() {
    if (!enabled || !supported()) return;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC({ latencyHint: "interactive" });
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 10;
        comp.ratio.value = 6;
        comp.attack.value = 0.003;
        comp.release.value = 0.15;
        out = ctx.createGain();
        out.gain.value = 0.5;
        out.connect(comp);
        comp.connect(ctx.destination);
        const len = Math.floor(ctx.sampleRate * 0.5);
        noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noise.getChannelData(0);
        let seed = 12345;
        for (let i = 0; i < len; i++) {
          seed = (seed * 1103515245 + 12345) >>> 0;
          data[i] = (seed / 4294967296) * 2 - 1;
        }
      }
      // A phone may suspend audio (or iOS "interrupt" it, after a call): wake it on every tap.
      if (ctx.state !== "running") ctx.resume().catch(() => {});
    } catch (e) {
      ctx = null;
    }
  }

  function suspend() {
    if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
  }

  function resume() {
    if (ctx && enabled && ctx.state !== "running") ctx.resume().catch(() => {});
  }

  function setEnabled(on) {
    enabled = Boolean(on);
    if (!enabled) suspend();
    else resume();
  }

  function ready(name, gap) {
    if (!enabled || !ctx || ctx.state !== "running" || voices > 28) return false;
    const now = ctx.currentTime;
    if (gap && now - (last.get(name) || -1) < gap) return false;
    last.set(name, now);
    return true;
  }

  /** One voice: an oscillator with an envelope, from f0 gliding to f1. */
  function tone(type, f0, f1, dur, vol, when = 0, dest = out) {
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
    voices++;
    o.onended = () => {
      voices--;
      g.disconnect();
    };
  }

  /** A burst of filtered noise. */
  function hiss(type, f0, f1, q, dur, vol, when = 0) {
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
    voices++;
    src.onended = () => {
      voices--;
      g.disconnect();
    };
  }

  const note = (step) => {
    const octave = Math.floor(step / SCALE.length);
    const semis = SCALE[step % SCALE.length] + 12 * octave;
    return BASE * Math.pow(2, semis / 12);
  };

  const sounds = {
    /** A tile breaks: a clay "tink" with an inharmonic overtone; the pitch climbs with the run of breaks. */
    break({ combo }) {
      const f = note(Math.min(14, Math.max(0, (combo || 1) - 1)));
      tone("sine", f, f * 0.995, 0.22, 0.32);
      tone("sine", f * 2.76, f * 2.7, 0.09, 0.09);
      hiss("highpass", 5200, 5200, 0.7, 0.025, 0.12);
    },
    /** A tough tile takes a hit and holds. */
    tough() {
      tone("triangle", 330, 300, 0.12, 0.26);
      tone("sine", 990, 940, 0.05, 0.08);
      hiss("bandpass", 2400, 1800, 1.2, 0.04, 0.12);
    },
    /** Iron rings. */
    iron() {
      tone("square", 180, 176, 0.22, 0.05);
      tone("triangle", 431, 428, 0.26, 0.09);
      tone("sine", 702, 700, 0.3, 0.07);
      hiss("bandpass", 3200, 3000, 6, 0.05, 0.06);
    },
    /** The paddle: a soft thump, a little higher toward its edges. */
    paddle({ off }) {
      const f = 196 * (1 + Math.abs(off || 0) * 0.25);
      tone("sine", f * 1.4, f, 0.11, 0.38);
      tone("triangle", f * 2, f * 1.6, 0.05, 0.08);
    },
    catch() {
      tone("sine", 160, 120, 0.14, 0.34);
      hiss("lowpass", 900, 300, 0.7, 0.08, 0.1);
    },
    wall() {
      tone("sine", 880, 860, 0.03, 0.05);
    },
    guard() {
      tone("sine", 620, 900, 0.12, 0.16);
    },
    launch() {
      hiss("bandpass", 500, 1900, 1.4, 0.16, 0.16);
      tone("sine", 330, 520, 0.12, 0.12);
    },
    spark() {
      tone("square", 1500, 700, 0.045, 0.025);
    },
    bead() {
      tone("sine", 1318, 1318, 0.06, 0.05);
    },
    /** A power-up caught: three quick rising notes. */
    power() {
      [0, 4, 7].forEach((st, i) => tone("triangle", BASE * Math.pow(2, st / 12), null, 0.12, 0.2, i * 0.055));
      tone("sine", BASE * 2, null, 0.3, 0.06, 0.16);
    },
    powerEnd() {
      tone("sine", 660, 440, 0.18, 0.08);
    },
    /** An ember bursts: a thump and a rush of air. */
    burst() {
      tone("sine", 110, 42, 0.32, 0.5);
      hiss("lowpass", 1400, 180, 0.8, 0.36, 0.3);
    },
    /** A ball falls past the paddle. */
    lost() {
      tone("triangle", 440, 110, 0.55, 0.26);
      tone("sine", 220, 70, 0.6, 0.2);
    },
    fall() {
      tone("triangle", 330, 180, 0.2, 0.12);
    },
    over() {
      [0, -3, -7].forEach((st, i) => tone("triangle", 392 * Math.pow(2, st / 12), null, 0.3, 0.2, i * 0.18));
    },
    /** The level is clear: a rising arpeggio and a shimmer. */
    clear() {
      [0, 4, 7, 12, 16].forEach((st, i) => tone("triangle", BASE * Math.pow(2, st / 12), null, 0.32, 0.22, i * 0.08));
      [0, 7].forEach((st, i) => tone("sine", BASE * 2 * Math.pow(2, st / 12), null, 0.7, 0.06, 0.42 + i * 0.05));
    },
    /** A star appears on the results. */
    star({ n }) {
      const f = BASE * Math.pow(2, ((n || 0) * 4) / 12);
      tone("sine", f, null, 0.28, 0.24);
      tone("sine", f * 2.76, null, 0.1, 0.06);
    },
  };

  const GAPS = { break: 0.02, tough: 0.03, iron: 0.05, wall: 0.06, spark: 0.08, bead: 0.1, paddle: 0.03 };

  /** Plays a sound by name (an event of the game, or "star"). */
  function play(name, data) {
    const fn = sounds[name];
    if (!fn || !ready(name, GAPS[name])) return;
    try {
      fn(data || {});
    } catch (e) {
      // A sound that cannot play is skipped; the game goes on.
    }
  }

  return { unlock, suspend, resume, setEnabled, play, supported };
}
