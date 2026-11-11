// Áudio 100% procedural (WebAudio), sem arquivos protegidos. Volumes independentes de música e efeitos.
type Wave = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  sfxVolume = 0.6;
  musicVolume = 0.5; // reservado: música entra nas próximas entregas
  muted = false;

  private ac(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: Wave = 'square', gain = 0.12, delay = 0, slideTo?: number) {
    if (this.muted) return;
    const ctx = this.ac();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const v = gain * this.sfxVolume;
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  click() { this.tone(520, 0.06, 'square', 0.1); }
  coin() { this.tone(988, 0.07, 'square', 0.1); this.tone(1319, 0.14, 'square', 0.1, 0.07); }
  bigCoin() { this.tone(784, 0.07, 'square', 0.11); this.tone(1047, 0.07, 'square', 0.11, 0.07); this.tone(1568, 0.2, 'square', 0.11, 0.14); }
  beep() { this.tone(440, 0.16, 'square', 0.12); }
  go() { this.tone(880, 0.32, 'square', 0.14); this.tone(1320, 0.32, 'triangle', 0.1); }
  tick() { this.tone(300, 0.04, 'square', 0.06); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, i * 0.12)); }
  error() { this.tone(180, 0.18, 'sawtooth', 0.1, 0, 90); }
}

export const sfx = new Sfx();
