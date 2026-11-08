// The sound of a page, synthesised with Web Audio so there is nothing to download. Paper is noise
// with its colour shaped by filters: a dragged leaf rustles as loud and as bright as the finger
// moves fast, a page turned by a tap swishes past, and each one lands with a soft flap. The boards
// of the cover are heavier: less rustle, more air, and a thud when they close.

export class PageSound {
  #ctx: AudioContext | null = null;
  #noise: AudioBuffer | null = null;
  #out: GainNode | null = null;
  #voice: {
    src: AudioBufferSourceNode;
    rustle: GainNode;
    air: GainNode;
    band: BiquadFilterNode;
    heavy: boolean;
  } | null = null;
  #last: { x: number; y: number; t: number } | null = null;
  muted = false;

  /** Starts audio. Browsers only allow it from a click, a tap or a key. */
  wake(): void {
    if (this.muted) return;
    if (!this.#ctx) {
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      const ctx = new Context();
      this.#ctx = ctx;
      this.#noise = paperNoise(ctx);
      this.#out = ctx.createGain();
      this.#out.gain.value = 0.7;
      this.#out.connect(ctx.destination);
    }
    if (this.#ctx.state === 'suspended') void this.#ctx.resume();
  }

  // While audio is still starting, sounds wait and play as soon as it has.
  #ready(): AudioContext | null {
    return this.muted || !this.#ctx || this.#ctx.state === 'closed' ? null : this.#ctx;
  }

  #source(ctx: AudioContext): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.#noise;
    src.loop = true;
    return src;
  }

  /** A leaf is lifted by hand: from now on it rustles as the pointer moves. */
  lift(heavy: boolean): void {
    const ctx = this.#ready();
    if (!ctx || !this.#out) return;
    this.#stopVoice(0.05);
    const src = this.#source(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = heavy ? 1100 : 2600;
    band.Q.value = 0.9;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = heavy ? 420 : 700;
    const rustle = ctx.createGain();
    const air = ctx.createGain();
    rustle.gain.value = 0;
    air.gain.value = 0;
    src.connect(band).connect(rustle).connect(this.#out);
    src.connect(low).connect(air).connect(this.#out);
    src.start(0, Math.random() * 1.5);
    this.#voice = { src, rustle, air, band, heavy };
    this.#last = null;
    // the small click of the corner coming free
    this.#burst(ctx, {
      type: 'highpass',
      freq: heavy ? 1400 : 3200,
      gain: heavy ? 0.12 : 0.1,
      decay: 0.03,
    });
  }

  /** The pointer moved while a leaf is held. */
  move(x: number, y: number, t: number): void {
    const v = this.#voice;
    const ctx = this.#ready();
    if (!v || !ctx) return;
    const last = this.#last;
    this.#last = { x, y, t };
    if (!last || t <= last.t) return;
    const speed = Math.hypot(x - last.x, y - last.y) / (t - last.t);
    const level = Math.min(1, speed / 1.4);
    const now = ctx.currentTime;
    const k = v.heavy ? 0.35 : 1;
    v.rustle.gain.setTargetAtTime(level * 0.42 * k, now, 0.035);
    v.air.gain.setTargetAtTime(level ** 1.5 * (v.heavy ? 0.5 : 0.28), now, 0.05);
    // fibres crackle at different pitches as the bend moves through them
    const base = v.heavy ? 900 : 1900;
    v.band.frequency.setTargetAtTime(
      base + level * base * 1.2 + Math.random() * base * 0.4,
      now,
      0.02,
    );
  }

  /** The leaf is let go, and flies the rest of the way on its own. */
  release(): void {
    const v = this.#voice;
    const ctx = this.#ready();
    if (!v || !ctx) return;
    const now = ctx.currentTime;
    v.rustle.gain.cancelScheduledValues(now);
    v.rustle.gain.setTargetAtTime(v.heavy ? 0.12 : 0.3, now, 0.02);
    v.rustle.gain.setTargetAtTime(0, now + 0.08, 0.07);
    v.air.gain.setTargetAtTime(v.heavy ? 0.35 : 0.2, now, 0.02);
    v.air.gain.setTargetAtTime(0, now + 0.08, 0.08);
    this.#stopVoice(0.5);
  }

  /** A page turned by a tap or a key: it swishes past without a hand on it. */
  swish(heavy: boolean): void {
    const ctx = this.#ready();
    if (!ctx || !this.#out) return;
    const now = ctx.currentTime;
    const src = this.#source(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.8;
    const f = heavy ? 900 : 1700;
    band.frequency.setValueAtTime(f, now);
    band.frequency.exponentialRampToValueAtTime(f * 2.2, now + 0.18);
    band.frequency.exponentialRampToValueAtTime(f * 1.1, now + 0.42);
    const gain = ctx.createGain();
    const peak = heavy ? 0.16 : 0.3;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.12);
    gain.gain.setTargetAtTime(0, now + 0.2, 0.08);
    src.connect(band).connect(gain).connect(this.#out);
    src.start(now, Math.random() * 1.5);
    src.stop(now + 0.8);
  }

  /** The leaf comes to rest: on the other side, or back where it was if it wasn't turned. */
  land(heavy: boolean, turned: boolean): void {
    const ctx = this.#ready();
    if (!ctx) return;
    this.#stopVoice(0.06);
    const soft = turned ? 1 : 0.5;
    if (heavy) {
      this.#burst(ctx, { type: 'lowpass', freq: 380, gain: 0.7 * soft, decay: 0.12 });
      this.#thud(ctx, 72, 0.35 * soft);
    } else {
      this.#burst(ctx, { type: 'lowpass', freq: 1300, gain: 0.32 * soft, decay: 0.07 });
      this.#burst(ctx, { type: 'bandpass', freq: 320, gain: 0.25 * soft, decay: 0.05 });
    }
  }

  #burst(
    ctx: AudioContext,
    o: { type: BiquadFilterType; freq: number; gain: number; decay: number },
  ): void {
    if (!this.#out) return;
    const now = ctx.currentTime;
    const src = this.#source(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.frequency.value = o.freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(o.gain, now + 0.004);
    gain.gain.setTargetAtTime(0, now + 0.004, o.decay / 3);
    src.connect(filter).connect(gain).connect(this.#out);
    src.start(now, Math.random() * 1.5);
    src.stop(now + o.decay * 3 + 0.05);
  }

  #thud(ctx: AudioContext, freq: number, level: number): void {
    if (!this.#out) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(freq * 1.4, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, now);
    gain.gain.setTargetAtTime(0, now, 0.05);
    osc.connect(gain).connect(this.#out);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  #stopVoice(after: number): void {
    const v = this.#voice;
    if (!v || !this.#ctx) return;
    this.#voice = null;
    const now = this.#ctx.currentTime;
    v.rustle.gain.setTargetAtTime(0, now, after / 4);
    v.air.gain.setTargetAtTime(0, now, after / 4);
    v.src.stop(now + after);
  }
}

/** Two seconds of paper: pinkish noise with the odd crackle of a fibre giving way. */
function paperNoise(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let crackle = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099;
    b1 = 0.963 * b1 + white * 0.2965;
    b2 = 0.57 * b2 + white * 1.0526;
    if (Math.random() < 0.0009) crackle = 0.6 + Math.random() * 0.8;
    crackle *= 0.93;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16 + white * crackle;
  }
  return buffer;
}
