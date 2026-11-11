import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, LabConfig, LabLobby, LabPhase, ServerToClientEvents } from '../shared/protocol';
import type { BotDifficulty, ParticipantInfo, PlayerId, Slot } from '../shared/types';
import { SLOT_COUNT, CHARACTER_IDS } from '../shared/types';
import { makeBotProfile } from '../shared/bots';
import { MINIGAME_LIST, getMinigame } from '../shared/minigames';
import { computeRewards, TICK_MS } from '../shared/sim';
import { metaOf } from '../shared/minigame';
import type { MinigameBrain, MinigameDefinition } from '../shared/minigame';

export type IO = Server<ClientToServerEvents, ServerToClientEvents>;
export type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

const INTRO_MS = 4500;
const EMPTY_ROOM_TTL_MS = 60_000;

function botParticipant(slot: Slot, difficulty: BotDifficulty): ParticipantInfo {
  const b = makeBotProfile(slot, difficulty);
  return { id: b.id, slot, name: b.name, characterId: b.characterId, isBot: true, connected: true, difficulty, personality: b.personality };
}

/**
 * Sala de laboratório: o SERVIDOR é a autoridade. O cliente só envia inputs.
 * Slots vazios são sempre bots. Humano que cai durante a partida é substituído
 * por um bot temporariamente (e pode voltar com lab:rejoin).
 */
export class LabRoom {
  readonly code: string;
  hostId: PlayerId;
  config: LabConfig;
  phase: LabPhase = 'lobby';
  matchNo = 0;
  participants: ParticipantInfo[];
  private sockets = new Map<PlayerId, Sock>();
  private inputs = new Map<PlayerId, unknown>();
  private lastSeq = new Map<PlayerId, number>();
  private brains = new Map<PlayerId, MinigameBrain<any, any>>();
  private def: MinigameDefinition<any, any> | null = null;
  private state: unknown = null;
  private tick = 0;
  private timers: NodeJS.Timeout[] = [];
  private loop: NodeJS.Timeout | null = null;
  private rewardsApplied = new Set<string>();
  private emptyTimer: NodeJS.Timeout | null = null;
  onEmpty: () => void = () => {};

  constructor(private io: IO, code: string, host: Sock, name: string, cfg: Partial<LabConfig>) {
    this.code = code;
    this.config = {
      minigameId: cfg.minigameId && getMinigame(cfg.minigameId) ? cfg.minigameId : MINIGAME_LIST[0]!.id,
      difficulty: cfg.difficulty ?? 'medium',
      seed: Number.isFinite(cfg.seed) ? (cfg.seed as number) | 0 : Math.floor(Math.random() * 1e9),
    };
    const hostId = `p-${Math.random().toString(36).slice(2, 8)}`;
    this.hostId = hostId;
    this.participants = [0, 1, 2, 3].map((i) => botParticipant(i as Slot, this.config.difficulty));
    this.participants[0] = { id: hostId, slot: 0, name: name || 'Jogador 1', characterId: CHARACTER_IDS[0], isBot: false, connected: true };
    this.attach(hostId, host);
  }

  private room() { return `lab:${this.code}`; }

  lobby(): LabLobby {
    return {
      code: this.code, phase: this.phase, hostId: this.hostId, config: this.config,
      participants: this.participants, minigames: MINIGAME_LIST.map(metaOf), matchNo: this.matchNo,
    };
  }
  broadcastLobby() { this.io.to(this.room()).emit('lab:lobby', this.lobby()); }

  private attach(id: PlayerId, sock: Sock) {
    this.sockets.set(id, sock);
    sock.data.roomCode = this.code;
    sock.data.playerId = id;
    void sock.join(this.room());
    if (this.emptyTimer) { clearTimeout(this.emptyTimer); this.emptyTimer = null; }
  }

  humans() { return this.participants.filter((p) => !p.isBot); }

  join(sock: Sock, name: string): { ok: true; id: PlayerId } | { ok: false; error: string } {
    if (this.phase !== 'lobby' && this.phase !== 'result') return { ok: false, error: 'A partida já começou. Aguarde o fim do minigame.' };
    const slot = this.participants.find((p) => p.isBot);
    if (!slot) return { ok: false, error: 'Sala cheia (4 jogadores).' };
    const id = `p-${Math.random().toString(36).slice(2, 8)}`;
    this.participants[slot.slot] = {
      id, slot: slot.slot, name: name || `Jogador ${slot.slot + 1}`, characterId: CHARACTER_IDS[slot.slot] ?? 'explorer', isBot: false, connected: true,
    };
    this.attach(id, sock);
    this.broadcastLobby();
    return { ok: true, id };
  }

  rejoin(sock: Sock, id: PlayerId): { ok: true } | { ok: false; error: string } {
    const p = this.participants.find((x) => x.id === id && !x.isBot);
    if (!p) return { ok: false, error: 'Vaga não encontrada nesta sala.' };
    p.connected = true;
    this.attach(id, sock);
    this.broadcastLobby();
    return { ok: true };
  }

  leave(sock: Sock) {
    const id = sock.data.playerId as PlayerId | undefined;
    if (!id) return;
    if (this.sockets.get(id) === sock) this.sockets.delete(id);
    const p = this.participants.find((x) => x.id === id);
    if (!p) return;
    if (this.phase === 'lobby') {
      // no lobby a vaga volta a ser bot
      this.participants[p.slot] = botParticipant(p.slot, this.config.difficulty);
      if (this.hostId === id) this.migrateHost();
    } else {
      // durante a partida: bot assume sem perder a vaga
      p.connected = false;
      if (this.hostId === id) this.migrateHost();
    }
    if (!this.participants.some((x) => !x.isBot && x.connected)) {
      this.emptyTimer = setTimeout(() => this.dispose(), EMPTY_ROOM_TTL_MS);
    }
    this.broadcastLobby();
  }

  private migrateHost() {
    const next = this.participants.find((x) => !x.isBot && x.connected);
    if (next) this.hostId = next.id;
  }

  setConfig(by: PlayerId, cfg: Partial<LabConfig>) {
    if (by !== this.hostId || (this.phase !== 'lobby' && this.phase !== 'result')) return;
    if (cfg.minigameId && getMinigame(cfg.minigameId)) this.config.minigameId = cfg.minigameId;
    if (cfg.difficulty && ['easy', 'medium', 'hard'].includes(cfg.difficulty)) {
      this.config.difficulty = cfg.difficulty;
      this.participants = this.participants.map((p) => (p.isBot ? botParticipant(p.slot, cfg.difficulty as BotDifficulty) : p));
    }
    if (Number.isFinite(cfg.seed)) this.config.seed = (cfg.seed as number) | 0;
    this.broadcastLobby();
  }

  start(by: PlayerId) {
    if (by !== this.hostId) return;
    if (this.phase !== 'lobby' && this.phase !== 'result') return;
    const def = getMinigame(this.config.minigameId);
    if (!def) return;
    this.clearTimers();
    this.def = def;
    this.matchNo++;
    this.phase = 'intro';
    this.inputs.clear();
    this.lastSeq.clear();
    this.state = def.createInitialState(this.config.seed + this.matchNo, this.participants);
    this.brains.clear();
    for (const p of this.participants) this.brains.set(p.id, def.createBot(p.id, p.difficulty ?? this.config.difficulty, this.config.seed + p.slot * 101 + this.matchNo));
    this.broadcastLobby();
    this.io.to(this.room()).emit('mg:intro', { meta: metaOf(def), participants: this.participants, durationMs: def.durationMs });
    this.emitSnapshot();
    this.timers.push(setTimeout(() => this.runCountdown(3), INTRO_MS));
  }

  private runCountdown(n: number) {
    this.phase = 'countdown';
    this.io.to(this.room()).emit('mg:countdown', n);
    if (n === 0) {
      this.phase = 'active';
      this.broadcastLobby();
      this.startLoop();
      return;
    }
    this.timers.push(setTimeout(() => this.runCountdown(n - 1), 1000));
  }

  private startLoop() {
    let last = Date.now();
    let acc = 0;
    this.loop = setInterval(() => {
      const now = Date.now();
      acc += Math.min(250, now - last);
      last = now;
      while (acc >= TICK_MS && this.phase === 'active') {
        acc -= TICK_MS;
        this.stepOnce();
      }
    }, 1000 / 60);
  }

  private stepOnce() {
    const def = this.def!;
    const inputs: Record<PlayerId, unknown> = {};
    for (const p of this.participants) {
      const botDriven = p.isBot || !p.connected;
      inputs[p.id] = botDriven ? this.brains.get(p.id)!.decide(this.state as never, TICK_MS) : (this.inputs.get(p.id) ?? def.neutralInput());
    }
    def.step(this.state, inputs, TICK_MS);
    this.tick++;
    this.emitSnapshot();
    if (def.isFinished(this.state)) this.finish();
  }

  private emitSnapshot() {
    const def = this.def!;
    this.io.to(this.room()).emit('mg:snapshot', { tick: this.tick, timeLeftMs: def.timeLeftMs(this.state), scores: def.liveScores(this.state), state: this.state });
  }

  private finish() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    const def = this.def!;
    const result = def.computeResult(this.state);
    const rewardEventId = `${this.code}:${this.matchNo}`;
    // idempotência: a recompensa só é calculada/enviada uma vez por partida
    if (this.rewardsApplied.has(rewardEventId)) return;
    this.rewardsApplied.add(rewardEventId);
    this.phase = 'result';
    this.tick = 0;
    this.io.to(this.room()).emit('mg:result', { rewardEventId, result, rewards: computeRewards(result, this.participants) });
    this.broadcastLobby();
  }

  handleInput(id: PlayerId, seq: number, raw: unknown) {
    if (this.phase !== 'active' || !this.def) return;
    if (seq <= (this.lastSeq.get(id) ?? -1)) return;
    const clean = this.def.sanitizeInput(raw);
    if (clean === null) return;
    this.lastSeq.set(id, seq);
    this.inputs.set(id, clean);
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  dispose() {
    this.clearTimers();
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    this.onEmpty();
  }
}
