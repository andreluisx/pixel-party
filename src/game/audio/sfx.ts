// Áudio 100% procedural (WebAudio), sem arquivos protegidos. Volumes independentes de música e efeitos.
type Wave = OscillatorType;

// ---------- músicas originais (sequenciador chiptune) ----------
// Notação: "C5 . E5 - G5": nota = começa; "." = pausa; "-" = segura a nota anterior. 1 token = 1 colcheia.
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function hz(tok: string): number {
  const m = /^([A-G])(#|b)?(\d)$/.exec(tok);
  if (!m) return 0;
  const n = SEMI[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * Math.pow(2, (n - 69) / 12);
}
interface NoteEv { f: number; len: number }
function parse(s: string): Array<NoteEv | null> {
  const toks = s.replace(/\|/g, ' ').trim().split(/\s+/);
  const out: Array<NoteEv | null> = [];
  let last: NoteEv | null = null;
  for (const k of toks) {
    if (k === '-') { if (last) last.len++; out.push(null); continue; }
    if (k === '.') { last = null; out.push(null); continue; }
    last = { f: hz(k), len: 1 }; out.push(last);
  }
  return out;
}
export type TrackId = 'menu' | 'board' | 'minigame' | 'suspense' | 'triumph';
interface TrackDef { bpm: number; lead: string; bass: string; arp?: string; drums?: string; leadWave?: Wave; leadGain?: number }
const TRACKS: Record<TrackId, TrackDef> = {
  // Menu: alegre, C – Am – F – G
  menu: {
    bpm: 108,
    lead: 'E5 G5 E5 C5 D5 E5 D5 C5 | A4 C5 E5 C5 A4 C5 E5 D5 | A4 C5 D5 C5 A4 G4 A4 C5 | D5 G5 E5 D5 G4 D5 E5 .',
    bass: 'C3 - - - C3 - - - | A2 - - - A2 - - - | F2 - - - F2 - - - | G2 - - - G2 - - -',
    arp: '. G4 . G4 . G4 . G4 | . A4 . A4 . A4 . A4 | . A4 . A4 . A4 . A4 | . B4 . B4 . B4 . B4',
    drums: 'k . h . s . h . | k . h . s . h h',
  },
  // Tabuleiro: passeio tranquilo e aventureiro
  board: {
    bpm: 100,
    lead: 'E5 . G5 . A5 G5 E5 . | E5 . C5 . A4 . C5 E5 | F5 . A5 . C6 A5 F5 . | D5 . G5 . B5 G5 D5 . | G5 . E5 . C5 E5 G5 . | A5 . F5 . C5 F5 A5 . | G5 . E5 . D5 E5 G5 . | D5 . - . . . . .',
    bass: 'C3 . G2 . C3 . G2 . | A2 . E3 . A2 . E3 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . D3 . | C3 . G2 . C3 . G2 . | F2 . C3 . F2 . C3 . | C3 . G2 . C3 . E3 . | G2 . D3 . G2 . . .',
    arp: 'C5 . E5 . C5 . E5 . | A4 . C5 . A4 . C5 . | A4 . C5 . A4 . C5 . | B4 . D5 . B4 . D5 . | E5 . G5 . E5 . G5 . | F5 . A5 . F5 . A5 . | E5 . G5 . E5 . G5 . | D5 . G5 . D5 . . .',
    drums: 'k . . h s . . h',
    leadWave: 'triangle', leadGain: 0.9,
  },
  // Minigame: rápida e tensa, Am – F – C – G
  minigame: {
    bpm: 150,
    lead: 'A4 C5 E5 A5 G5 E5 C5 E5 | F4 A4 C5 F5 E5 C5 A4 C5 | G4 C5 E5 G5 E5 C5 G4 C5 | G4 B4 D5 G5 F5 D5 B4 D5',
    bass: 'A2 A2 A3 A2 A2 A2 A3 A2 | F2 F2 F3 F2 F2 F2 F3 F2 | C3 C3 C4 C3 C3 C3 C4 C3 | G2 G2 G3 G2 G2 G2 G3 G2',
    drums: 'x . h . s . h h | k . h k s . h .',
  },
  // Cerimônia, suspense: pulso grave e notas isoladas
  suspense: {
    bpm: 96,
    lead: '. . . . . . . . | . . E5 . . . . . | . . . . . . F5 . | . . . . E5 . . . | . . . . . . . . | . . B4 . . . . . | . . C5 - . . . . | . . . . B4 - - .',
    bass: 'E2 . E2 E2 . E2 E2 . | E2 . E2 E2 . E2 E2 . | F2 . F2 F2 . F2 F2 . | E2 . E2 E2 . E2 E2 E2',
    drums: 'k . . . . . k . | . . k . . . . .',
    leadWave: 'sawtooth', leadGain: 0.35,
  },
  // Cerimônia, triunfo: fanfarra brilhante em C maior
  triumph: {
    bpm: 132,
    lead: 'C5 E5 G5 C6 - G5 C6 - | B5 G5 E5 G5 B5 - - . | A5 F5 C5 F5 A5 C6 A5 F5 | G5 - D5 G5 B5 D6 - - | C6 - G5 E5 C5 E5 G5 C6 | D6 - B5 G5 D5 G5 B5 D6 | E6 - C6 G5 E5 G5 C6 E6 | C6 - - - G5 - C6 -',
    bass: 'C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . D3 . | C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | C3 . G3 . C3 . G3 . | C3 . G3 . C3 . C3 .',
    arp: 'E5 . G5 . E5 . G5 . | D5 . G5 . D5 . G5 . | C5 . F5 . C5 . F5 . | D5 . G5 . D5 . G5 . | E5 . G5 . E5 . G5 . | D5 . G5 . D5 . G5 . | G5 . C6 . G5 . C6 . | E5 . G5 . E5 . G5 .',
    drums: 'x . h . s . h h',
    leadGain: 0.8,
  },
};
const PARSED = {} as Record<TrackId, { lead: Array<NoteEv | null>; bass: Array<NoteEv | null>; arp: Array<NoteEv | null>; drums: string[] }>;
for (const id of Object.keys(TRACKS) as TrackId[]) {
  const d = TRACKS[id];
  PARSED[id] = { lead: parse(d.lead), bass: parse(d.bass), arp: d.arp ? parse(d.arp) : [], drums: d.drums ? d.drums.replace(/\|/g, ' ').trim().split(/\s+/) : [] };
}
export const TRACK_IDS = Object.keys(TRACKS) as TrackId[];
export const trackInfo = (id: TrackId) => ({ steps: PARSED[id].lead.length, bpm: TRACKS[id].bpm });

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

  // ---------- música ----------
  private musicGain: GainNode | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicNext = 0;
  private musicStep = 0;
  private track: TrackId = 'menu';
  private noiseBuf: AudioBuffer | null = null;

  applyVolumes() {
    if (this.musicGain) this.musicGain.gain.value = this.muted ? 0 : this.musicVolume * 0.28;
  }

  /** Troca a faixa (pode ser chamado antes de a música iniciar: vale quando iniciar). */
  setTrack(id: TrackId) {
    if (id === this.track) return;
    this.track = id;
    this.musicStep = 0;
    if (this.ctx) this.musicNext = this.ctx.currentTime + 0.1;
  }
  get currentTrack() { return this.track; }

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

  private noise(dur: number, gain: number, when: number, freq: number, kind: BiquadFilterType, dest: AudioNode) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = kind; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  private drum(kind: string, when: number) {
    if (!this.musicGain || !this.ctx) return;
    if (kind === 'k' || kind === 'x') {
      const ctx = this.ctx;
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.frequency.setValueAtTime(150, when); osc.frequency.exponentialRampToValueAtTime(40, when + 0.12);
      g.gain.setValueAtTime(1.0, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
      osc.connect(g).connect(this.musicGain); osc.start(when); osc.stop(when + 0.16);
    }
    if (kind === 's') this.noise(0.11, 0.5, when, 1800, 'bandpass', this.musicGain);
    if (kind === 'h' || kind === 'x') this.noise(0.04, 0.22, when, 7000, 'highpass', this.musicGain);
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx) return;
    const def = TRACKS[this.track];
    const P = PARSED[this.track];
    const STEP = 60 / def.bpm / 2; // colcheia
    while (this.musicNext < ctx.currentTime + 0.4) {
      const i = this.musicStep;
      const at = this.musicNext;
      const l = P.lead[i % P.lead.length];
      if (l) this.note(l.f, STEP * (l.len - 0.1), def.leadWave ?? 'square', (def.leadGain ?? 0.5), at);
      const b = P.bass[i % P.bass.length];
      if (b) this.note(b.f, STEP * Math.max(0.8, b.len - 0.2), 'triangle', 0.9, at);
      const a = P.arp.length ? P.arp[i % P.arp.length] : null;
      if (a) this.note(a.f, STEP * 0.6, 'square', 0.13, at);
      const d = P.drums.length ? P.drums[i % P.drums.length] : '.';
      if (d && d !== '.') this.drum(d, at);
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
  jump() { this.tone(330, 0.12, 'square', 0.09, 0, 700); }
  hit() { this.tone(160, 0.2, 'sawtooth', 0.12, 0, 70); }
  fall() { this.tone(520, 0.45, 'triangle', 0.12, 0, 90); }
  spring() { this.tone(300, 0.25, 'square', 0.1, 0, 1100); }
  hitNote(streak: number) { this.tone(600 + Math.min(streak, 6) * 70, 0.1, 'square', 0.1); }
  miss() { this.tone(220, 0.12, 'triangle', 0.07); }
  ledOn(i: number) { this.tone(392 + i * 130, 0.12, 'square', 0.1); }
  blackout() { this.tone(300, 0.55, 'sawtooth', 0.1, 0, 55); }
  announce(c: number) { const f = [330, 392, 494, 587, 698][c % 5]!; this.tone(f, 0.28, 'square', 0.12); this.tone(f * 1.5, 0.28, 'square', 0.09, 0.08); this.tone(f * 2, 0.4, 'triangle', 0.1, 0.16); }
  vanish() { this.tone(900, 0.35, 'triangle', 0.08, 0, 200); }
  reveal() { this.tone(110, 0.4, 'sawtooth', 0.14, 0, 60); this.tone(440, 0.3, 'square', 0.1, 0.05, 880); }
  laser() { this.tone(1200, 0.35, 'sawtooth', 0.09, 0, 180); }
  modeOn() { this.tone(500, 0.06, 'square', 0.1); this.tone(750, 0.09, 'square', 0.1, 0.06); }
  modeOff() { this.tone(750, 0.06, 'square', 0.1); this.tone(500, 0.09, 'square', 0.1, 0.06); }
  swap() { this.tone(420, 0.05, 'square', 0.08); this.tone(620, 0.07, 'square', 0.08, 0.05); }
  pick() { this.tone(700, 0.05, 'triangle', 0.09); }
  arrow() { this.tone(900, 0.09, 'triangle', 0.09, 0, 260); }
  powerup() { [523, 659, 880].forEach((f, i) => this.tone(f, 0.08, 'square', 0.09, i * 0.06)); }
  shieldUp() { this.tone(500, 0.18, 'triangle', 0.1, 0, 900); }
  select() { this.tone(660, 0.05, 'square', 0.09); this.tone(880, 0.09, 'square', 0.09, 0.05); }
  ready() { this.tone(523, 0.07, 'square', 0.1); this.tone(784, 0.07, 'square', 0.1, 0.07); this.tone(1047, 0.16, 'square', 0.1, 0.14); }
  // --- tabuleiro e cerimônia ---
  step() { this.tone(260, 0.05, 'square', 0.07, 0, 340); }
  diceRoll() { this.tone(200 + Math.random() * 300, 0.04, 'square', 0.06); }
  starGet() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.16, 'square', 0.1, i * 0.07)); this.tone(2093, 0.5, 'triangle', 0.08, 0.45); }
  shopOpen() { [660, 880, 660, 990].forEach((f, i) => this.tone(f, 0.08, 'square', 0.08, i * 0.07)); }
  buy() { this.tone(1200, 0.06, 'square', 0.09); this.tone(900, 0.06, 'square', 0.09, 0.06); this.tone(1500, 0.14, 'square', 0.09, 0.12); }
  duel() { this.tone(140, 0.12, 'sawtooth', 0.12, 0, 90); this.tone(220, 0.12, 'sawtooth', 0.12, 0.14, 110); this.tone(880, 0.3, 'square', 0.08, 0.28, 440); }
  teleport() { this.tone(300, 0.35, 'triangle', 0.1, 0, 1800); this.tone(1800, 0.3, 'triangle', 0.08, 0.35, 300); }
  stolen() { this.tone(900, 0.1, 'square', 0.1, 0, 300); this.tone(500, 0.2, 'sawtooth', 0.08, 0.1, 150); }
  /** rufar de tambor (suspense): n batidas com frequência crescente */
  drumRoll(durMs: number) {
    const ctx = this.ac();
    if (!ctx || this.muted) return;
    const n = Math.max(4, Math.floor(durMs / 70));
    const dest = ctx.createGain(); dest.gain.value = this.sfxVolume; dest.connect(ctx.destination);
    for (let i = 0; i < n; i++) this.noise(0.07, 0.18 + (i / n) * 0.35, ctx.currentTime + (i * durMs) / 1000 / n, 600 + i * 12, 'bandpass', dest);
  }
  /** golpe de revelação */
  revealHit() {
    const ctx = this.ac();
    if (ctx && !this.muted) { const d = ctx.createGain(); d.gain.value = this.sfxVolume; d.connect(ctx.destination); this.noise(0.35, 0.5, ctx.currentTime, 900, 'lowpass', d); }
    this.tone(110, 0.4, 'sawtooth', 0.15, 0, 50);
    this.tone(784, 0.5, 'square', 0.1, 0.05);
    this.tone(1047, 0.5, 'square', 0.08, 0.05);
  }
  fanfare() { [523, 523, 523, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 6 ? 0.7 : 0.14, 'square', 0.12, i * 0.13)); }
  tieSting() { this.tone(330, 0.15, 'square', 0.1); this.tone(311, 0.15, 'square', 0.1, 0.15); this.tone(294, 0.35, 'triangle', 0.1, 0.3); }
  error() { this.tone(180, 0.18, 'sawtooth', 0.1, 0, 90); }
}

export const sfx = new Sfx();
