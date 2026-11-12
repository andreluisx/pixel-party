// Áudio 100% procedural (WebAudio), sem arquivos protegidos. Volumes independentes de música e efeitos.
type Wave = OscillatorType;

const N = { A2: 110, F2: 87.31, G2: 98, C3: 130.81, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 784 };
// 4 compassos (C, Am, F, G), 8 colcheias cada
const MENU_LEAD = [
  N.E5, N.G5, N.E5, N.C5, N.D5, N.E5, N.D5, N.C5,
  N.A4, N.C5, N.E5, N.C5, N.A4, N.C5, N.E5, N.D5,
  N.A4, N.C5, N.D5, N.C5, N.A4, N.G4, N.A4, N.C5,
  N.D5, N.G5, N.E5, N.D5, N.G4, N.D5, N.E5, 0,
];
const MENU_BASS = [N.C3, N.A2, N.F2, N.G2];

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

  // ---------- música (sequenciador chiptune original, em loop) ----------
  private musicGain: GainNode | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicNext = 0;
  private musicStep = 0;

  applyVolumes() {
    if (this.musicGain) this.musicGain.gain.value = this.muted ? 0 : this.musicVolume * 0.28;
  }

  startMusic() {
    if (this.musicTimer) return;
    const ctx = this.ac();
    if (!ctx) return;
    this.musicGain = ctx.createGain();
    this.musicGain.connect(ctx.destination);
    this.applyVolumes();
    this.musicStep = 0;
    this.musicNext = ctx.currentTime + 0.12;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 80);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private note(freq: number, dur: number, type: Wave, gain: number, when: number) {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || freq <= 0) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g).connect(this.musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx) return;
    const STEP = 60 / 108 / 2; // colcheia a 108 bpm
    while (this.musicNext < ctx.currentTime + 0.4) {
      const i = this.musicStep % 32;
      const lead = MENU_LEAD[i] ?? 0;
      this.note(lead, STEP * 0.9, 'square', 0.5, this.musicNext);
      if (i % 4 === 0) this.note(MENU_BASS[Math.floor(i / 8)] ?? 0, STEP * 3.6, 'triangle', 0.9, this.musicNext);
      if (i % 2 === 1) this.note(MENU_LEAD[(i + 16) % 32]! / 2, STEP * 0.5, 'square', 0.12, this.musicNext); // contracanto leve
      this.musicNext += STEP;
      this.musicStep++;
    }
  }

  click() { this.tone(520, 0.06, 'square', 0.1); }
  coin() { this.tone(988, 0.07, 'square', 0.1); this.tone(1319, 0.14, 'square', 0.1, 0.07); }
  bigCoin() { this.tone(784, 0.07, 'square', 0.11); this.tone(1047, 0.07, 'square', 0.11, 0.07); this.tone(1568, 0.2, 'square', 0.11, 0.14); }
  beep() { this.tone(440, 0.16, 'square', 0.12); }
  go() { this.tone(880, 0.32, 'square', 0.14); this.tone(1320, 0.32, 'triangle', 0.1); }
  tick() { this.tone(300, 0.04, 'square', 0.06); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, i * 0.12)); }
<<<<<<< HEAD
  jump() { this.tone(330, 0.12, 'square', 0.09, 0, 700); }
  hit() { this.tone(160, 0.2, 'sawtooth', 0.12, 0, 70); }
  fall() { this.tone(520, 0.45, 'triangle', 0.12, 0, 90); }
  spring() { this.tone(300, 0.25, 'square', 0.1, 0, 1100); }
  hitNote(streak: number) { this.tone(600 + Math.min(streak, 6) * 70, 0.1, 'square', 0.1); }
  miss() { this.tone(220, 0.12, 'triangle', 0.07); }
=======
>>>>>>> 89dd3df16bc6020c7711e0f3b84fc20dd55f6ec5
  select() { this.tone(660, 0.05, 'square', 0.09); this.tone(880, 0.09, 'square', 0.09, 0.05); }
  ready() { this.tone(523, 0.07, 'square', 0.1); this.tone(784, 0.07, 'square', 0.1, 0.07); this.tone(1047, 0.16, 'square', 0.1, 0.14); }
  error() { this.tone(180, 0.18, 'sawtooth', 0.1, 0, 90); }
}

export const sfx = new Sfx();
