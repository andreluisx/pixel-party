import type { BotDifficulty, ParticipantInfo, PlayerId, Slot } from '../shared/types';
import type { RoomPhase, RoomState } from '../shared/protocol';
import type { IO, Sock } from './labRoom';
import { canStart, emptyLobby, freeBotSlot, pickCharacter, releaseSlot, seatHuman, setBotDifficulty } from '../shared/lobby';

const GRACE_MS = 30_000; // tempo para o humano voltar antes de a vaga virar bot (no lobby)
const EMPTY_TTL_MS = 120_000;
export const BOARD = { id: 'reino-do-castelo', name: 'Reino do Castelo' };

/** Sala de jogo (lobby de 4 vagas). O servidor é a autoridade: o cliente só pede ações. */
export class GameRoom {
  hostId: PlayerId = '';
  phase: RoomPhase = 'lobby';
  participants: ParticipantInfo[] = emptyLobby();
  private sockets = new Map<PlayerId, Sock>();
  private grace = new Map<PlayerId, NodeJS.Timeout>();
  private emptyTimer: NodeJS.Timeout | null = null;
  onEmpty: () => void = () => {};

  constructor(private io: IO, readonly code: string) {}

  private channel() { return `room:${this.code}`; }

  state(): RoomState {
    const can = this.phase === 'lobby' ? canStart(this.participants) : { ok: true as const };
    return { code: this.code, phase: this.phase, hostId: this.hostId, participants: this.participants, board: BOARD, startBlockedReason: can.ok ? null : can.reason };
  }
  broadcast() { this.io.to(this.channel()).emit('room:state', this.state()); }

  private bind(id: PlayerId, sock: Sock) {
    this.sockets.set(id, sock);
    sock.data.gameCode = this.code;
    sock.data.gameId = id;
    void sock.join(this.channel());
    const g = this.grace.get(id);
    if (g) { clearTimeout(g); this.grace.delete(id); }
    if (this.emptyTimer) { clearTimeout(this.emptyTimer); this.emptyTimer = null; }
  }

  join(sock: Sock, name: string): { ok: true; id: PlayerId } | { ok: false; error: string } {
    if (this.phase !== 'lobby') return { ok: false, error: 'A partida já começou. Peça para o host voltar ao lobby.' };
    const slot = freeBotSlot(this.participants);
    if (!slot) return { ok: false, error: 'Sala cheia (4 jogadores).' };
    const id = `p-${Math.random().toString(36).slice(2, 9)}`;
    this.participants = seatHuman(this.participants, slot.slot, id, name || `Jogador ${slot.slot + 1}`);
    if (!this.participants.some((x) => x.id === this.hostId && !x.isBot)) this.hostId = id;
    this.bind(id, sock);
    this.broadcast();
    return { ok: true, id };
  }

  rejoin(sock: Sock, id: PlayerId): { ok: true } | { ok: false; error: string } {
    const p = this.participants.find((x) => x.id === id && !x.isBot);
    if (!p) return { ok: false, error: 'Sua vaga não está mais nesta sala.' };
    this.participants = this.participants.map((x) => (x.id === id ? { ...x, connected: true } : x));
    this.bind(id, sock);
    this.broadcast();
    return { ok: true };
  }

  /** Queda de conexão: segura a vaga por GRACE_MS no lobby. Na partida iniciada, a vaga só marca "desconectado". */
  disconnect(sock: Sock) {
    const id = sock.data.gameId as PlayerId | undefined;
    if (!id || this.sockets.get(id) !== sock) return;
    this.sockets.delete(id);
    this.participants = this.participants.map((x) => (x.id === id ? { ...x, connected: false, ready: false } : x));
    if (this.hostId === id) this.migrateHost();
    if (this.phase === 'lobby') {
      this.grace.set(id, setTimeout(() => this.release(id), GRACE_MS));
    }
    this.afterChange();
  }

  /** Saída voluntária: libera a vaga na hora. */
  leave(sock: Sock) {
    const id = sock.data.gameId as PlayerId | undefined;
    if (!id) return;
    void sock.leave(this.channel());
    sock.data.gameCode = undefined;
    sock.data.gameId = undefined;
    this.sockets.delete(id);
    this.release(id);
  }

  private release(id: PlayerId) {
    const g = this.grace.get(id);
    if (g) { clearTimeout(g); this.grace.delete(id); }
    const p = this.participants.find((x) => x.id === id);
    if (!p) return;
    this.participants = releaseSlot(this.participants, p.slot, 'medium');
    if (this.hostId === id) this.migrateHost();
    this.afterChange();
  }

  private migrateHost() {
    const next = this.participants.find((x) => !x.isBot && x.connected);
    if (next) this.hostId = next.id;
  }

  private afterChange() {
    if (!this.participants.some((x) => !x.isBot)) {
      this.emptyTimer = setTimeout(() => this.onEmpty(), EMPTY_TTL_MS);
      if (this.participants.every((x) => x.isBot)) { this.onEmpty(); return; }
    }
    this.broadcast();
  }

  setCharacter(id: PlayerId, characterId: unknown) {
    if (this.phase !== 'lobby') return;
    const next = pickCharacter(this.participants, id, characterId);
    if (!next) { this.sockets.get(id)?.emit('room:error', 'Esse personagem já está com outro jogador.'); return; }
    this.participants = next;
    this.broadcast();
  }

  setReady(id: PlayerId, ready: unknown) {
    if (this.phase !== 'lobby' || typeof ready !== 'boolean') return;
    this.participants = this.participants.map((p) => (p.id === id && !p.isBot ? { ...p, ready } : p));
    this.broadcast();
  }

  setBot(by: PlayerId, slot: Slot, difficulty: BotDifficulty) {
    if (by !== this.hostId || this.phase !== 'lobby') return;
    const next = setBotDifficulty(this.participants, slot, difficulty);
    if (next) { this.participants = next; this.broadcast(); }
  }

  start(by: PlayerId) {
    if (by !== this.hostId || this.phase !== 'lobby') return;
    const can = canStart(this.participants);
    if (!can.ok) { this.sockets.get(by)?.emit('room:error', can.reason); return; }
    this.phase = 'started';
    this.broadcast();
  }

  backToLobby(by: PlayerId) {
    if (by !== this.hostId || this.phase !== 'started') return;
    this.phase = 'lobby';
    this.participants = this.participants.map((p) => (p.isBot ? p : { ...p, ready: false }));
    this.broadcast();
  }

  dispose() {
    this.grace.forEach(clearTimeout);
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
  }
}
