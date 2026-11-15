import type { IO, Sock } from './labRoom';
import type { MinigameBrain, MinigameDefinition, MinigameResult } from '../shared/minigame';
import { metaOf } from '../shared/minigame';
import { computeRewards, simulateMatch, TICK_MS } from '../shared/sim';
import type { ParticipantInfo, PlayerId } from '../shared/types';

export const INTRO_MS = 4500;

export interface SessionDeps {
  io: IO;
  channel: string;
  def: MinigameDefinition<any, any>;
  seed: number;
  /** lista viva: o humano que cai passa a ser conduzido por bot sem perder a vaga */
  participants: () => ParticipantInfo[];
  socketOf: (id: PlayerId) => Sock | undefined;
  rewardEventId: string;
  onDone: (result: MinigameResult, rewards: Record<PlayerId, number>) => void;
  /** multiplicador de tempo (testes e2e rápidos) */
  timeScale?: number;
}

/**
 * Executa UM minigame com o servidor como autoridade. Reaproveita os mesmos eventos mg:* do laboratório,
 * emitidos para o canal da sala. Chama onDone uma única vez.
 */
export class MinigameSession {
  phase: 'intro' | 'countdown' | 'active' | 'done' = 'intro';
  private state: unknown;
  private brains = new Map<PlayerId, MinigameBrain<any, any>>();
  private inputs = new Map<PlayerId, unknown>();
  private lastSeq = new Map<PlayerId, number>();
  private timers: NodeJS.Timeout[] = [];
  private loop: NodeJS.Timeout | null = null;
  private tick = 0;
  private finished = false;

  constructor(private d: SessionDeps) {}

  private get def() { return this.d.def; }
  private emitAll<K extends 'mg:intro' | 'mg:countdown' | 'mg:result'>(ev: K, payload: Parameters<import('../shared/protocol').ServerToClientEvents[K]>[0]) {
    (this.d.io.to(this.d.channel) as any).emit(ev, payload);
  }

  start() {
    const parts = this.d.participants();
    this.state = this.def.createInitialState(this.d.seed, parts);
    for (const p of parts) this.brains.set(p.id, this.def.createBot(p.id, p.difficulty ?? 'medium', this.d.seed + p.slot * 101));
    if ((this.d.timeScale ?? 1) < 0.1) {
      // modo rápido: simula tudo de uma vez (só para testes ponta a ponta)
      const out = simulateMatch(this.def, parts, this.d.seed, 'medium');
      this.timers.push(setTimeout(() => this.complete(out.result), 20));
      return;
    }
    this.emitAll('mg:intro', { meta: metaOf(this.def), participants: parts, durationMs: this.def.durationMs });
    this.emitSnapshot();
    this.timers.push(setTimeout(() => this.countdown(3), INTRO_MS));
  }

  /** Reenvia o necessário para quem voltou à sala no meio do minigame. */
  resync(sock: Sock) {
    if (this.phase === 'done') return;
    sock.emit('mg:intro', { meta: metaOf(this.def), participants: this.d.participants(), durationMs: this.def.durationMs });
    if (this.phase !== 'intro') sock.emit('mg:countdown', this.phase === 'active' ? 0 : 1);
    this.emitSnapshot();
  }

  private countdown(n: number) {
    this.phase = 'countdown';
    this.emitAll('mg:countdown', n);
    if (n === 0) { this.phase = 'active'; this.startLoop(); return; }
    this.timers.push(setTimeout(() => this.countdown(n - 1), 1000));
  }

  private startLoop() {
    let last = Date.now(); let acc = 0;
    this.loop = setInterval(() => {
      const now = Date.now();
      acc += Math.min(250, now - last); last = now;
      while (acc >= TICK_MS && this.phase === 'active') { acc -= TICK_MS; this.stepOnce(); }
    }, 1000 / 60);
  }

  private stepOnce() {
    const inputs: Record<PlayerId, unknown> = {};
    for (const p of this.d.participants()) {
      const botDriven = p.isBot || !p.connected;
      inputs[p.id] = botDriven ? this.brains.get(p.id)!.decide(this.state as never, TICK_MS) : (this.inputs.get(p.id) ?? this.def.neutralInput());
    }
    this.def.step(this.state, inputs, TICK_MS);
    this.tick++;
    this.emitSnapshot();
    if (this.def.isFinished(this.state)) this.complete(this.def.computeResult(this.state));
  }

  private emitSnapshot() {
    const def = this.def;
    const base = { tick: this.tick, timeLeftMs: def.timeLeftMs(this.state), scores: def.liveScores(this.state), hudText: def.hudText?.(this.state as never), locked: def.inputLocked?.(this.state as never) };
    if (def.viewFor) {
      for (const p of this.d.participants()) this.d.socketOf(p.id)?.emit('mg:snapshot', { ...base, state: def.viewFor(this.state as never, p.id) });
      return;
    }
    (this.d.io.to(this.d.channel) as any).emit('mg:snapshot', { ...base, state: def.publicState ? def.publicState(this.state as never) : this.state });
  }

  private complete(result: MinigameResult) {
    if (this.finished) return;
    this.finished = true;
    this.phase = 'done';
    this.stop();
    const rewards = computeRewards(result, this.d.participants());
    this.emitAll('mg:result', { rewardEventId: this.d.rewardEventId, result, rewards });
    this.d.onDone(result, rewards);
  }

  handleInput(id: PlayerId, seq: number, raw: unknown) {
    if (this.phase !== 'active') return;
    if (seq <= (this.lastSeq.get(id) ?? -1)) return;
    const clean = this.def.sanitizeInput(raw);
    if (clean === null) return;
    this.lastSeq.set(id, seq);
    this.inputs.set(id, clean);
  }

  private stop() {
    this.timers.forEach(clearTimeout); this.timers = [];
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }
  dispose() { this.finished = true; this.stop(); }
}
