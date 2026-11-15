import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, GameUpdate, RoomState, ServerToClientEvents, Snapshot } from '@shared/protocol';
import type { TouchState, BridgeClient, BridgeState } from './bridge';
import type { Intent } from '@shared/game/engine';
import type { BotDifficulty, PlayerId, Slot } from '@shared/types';

export interface RoomClientState extends BridgeState { connected: boolean; you: PlayerId | null; room: RoomState | null; error: string | null }
type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const SESSION_KEY = 'pixel-party:room-session';

/** Cliente da sala de jogo. Guarda a vaga na aba para retomar após queda de conexão. */
export class RoomClient implements BridgeClient {
  private socket: AppSocket;
  private listeners = new Set<() => void>();
  private errorTimer: ReturnType<typeof setTimeout> | null = null;
  state: RoomClientState = { connected: false, you: null, room: null, error: null, intro: null, countdown: null, result: null, aimMode: false, lobby: null, game: null, toast: null };

  // lidos pela cena Phaser a cada quadro (não passam pelo React)
  latest: Snapshot | null = null;
  touch: TouchState = { dx: 0, dy: 0, action: false, fire: false, run: false, duck: false, aimAngle: null, shotAngle: null, shotUntil: 0 };
  touchPresses: Array<'L' | 'U' | 'D' | 'R'> = [];
  onSnapshotEvents: Array<(s: Snapshot) => void> = [];
  private pending: GameUpdate[] = [];
  private seq = 0;
  private toastKey = 0;
  private lastSent = '';
  private lastSentAt = 0;

  constructor(url?: string) {
    const target = url ?? process.env.NEXT_PUBLIC_SERVER_URL ?? `${window.location.protocol}//${window.location.hostname}:3001`;
    this.socket = io(target, { transports: ['websocket', 'polling'], reconnectionDelay: 500 });
    const s = this.socket;
    s.on('connect', () => {
      this.set({ connected: true });
      const saved = this.loadSession();
      if (saved) this.rejoin(saved.code, saved.you);
    });
    s.on('disconnect', () => this.set({ connected: false }));
    s.on('connect_error', () => this.set({ connected: false }));
    s.on('room:state', (room) => this.set({ room }));
    s.on('room:error', (m) => this.flashError(m));
    s.on('game:error', (m) => this.flashError(m));
    s.on('game:update', (u) => this.onGame(u));
    s.on('mg:intro', (intro) => { this.latest = null; this.set({ intro, result: null, countdown: null, aimMode: false, lobby: { phase: 'intro', matchNo: this.state.game?.game.mgSeq ?? 0 } }); });
    s.on('mg:countdown', (n) => this.set({ countdown: n, lobby: { phase: n === 0 ? 'active' : 'countdown', matchNo: this.state.lobby?.matchNo ?? 0 } }));
    s.on('mg:snapshot', (snap) => { this.latest = snap; this.onSnapshotEvents.forEach((f) => f(snap)); });
    s.on('mg:result', (result) => this.set({ result, countdown: null, lobby: { phase: 'result', matchNo: this.state.lobby?.matchNo ?? 0 } }));
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getState = () => this.state;
  private set(patch: Partial<RoomClientState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((l) => l()); }
  flashError(msg: string) {
    this.set({ error: msg });
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => this.set({ error: null }), 4500);
  }
  clearError() { this.set({ error: null }); }

  private saveSession(code: string, you: PlayerId) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, you })); } catch { /* ok */ } }
  private loadSession(): { code: string; you: PlayerId } | null { try { const v = sessionStorage.getItem(SESSION_KEY); return v ? JSON.parse(v) : null; } catch { return null; } }
  private clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ok */ } }

  create(name: string) {
    if (!this.state.connected) return this.flashError('Sem conexão com o servidor. Ele está rodando? (npm run dev)');
    this.socket.emit('room:create', { name }, (r) => {
      if (!r.ok) return this.flashError(r.error);
      this.saveSession(r.room.code, r.you);
      this.set({ you: r.you, room: r.room, error: null });
    });
  }
  join(code: string, name: string) {
    if (!this.state.connected) return this.flashError('Sem conexão com o servidor. Ele está rodando? (npm run dev)');
    this.socket.emit('room:join', { code: code.trim().toUpperCase(), name }, (r) => {
      if (!r.ok) return this.flashError(r.error);
      this.saveSession(r.room.code, r.you);
      this.set({ you: r.you, room: r.room, error: null });
    });
  }
  private rejoin(code: string, you: PlayerId) {
    this.socket.emit('room:rejoin', { code, you }, (r) => {
      if (!r.ok) { this.clearSession(); this.set({ you: null, room: null }); return; }
      this.set({ you: r.you, room: r.room });
    });
  }
  private onGame(u: GameUpdate) {
    if (u.seq <= this.seq && u.seq !== 0) { /* reenvio após reconexão: aceita, a cena se reconcilia */ }
    this.seq = u.seq;
    this.pending.push(u);
    const patch: Partial<RoomClientState> = { game: u };
    if (u.game.phase !== 'minigame') { patch.intro = null; patch.result = null; patch.countdown = null; patch.lobby = { phase: 'lobby', matchNo: u.game.mgSeq }; this.latest = null; }
    else if (!this.state.lobby || this.state.lobby.phase === 'lobby') patch.lobby = { phase: 'lobby', matchNo: u.game.mgSeq };
    const toast = this.toastFor(u);
    if (toast) patch.toast = { key: ++this.toastKey, ...toast };
    this.set(patch);
  }
  private toastFor(u: GameUpdate): { text: string; tone: 'good' | 'bad' | 'info' } | null {
    let out: { text: string; tone: 'good' | 'bad' | 'info' } | null = null;
    const name = (id: string) => u.game.players.find((p) => p.id === id)?.name ?? '';
    for (const e of u.events) {
      if (e.t === 'roundStart') out = { text: e.final ? 'GRANDE FINAL! Última rodada' : `Rodada ${e.round} de ${u.game.totalRounds}`, tone: 'info' };
      else if (e.t === 'tile') out = { text: `${name(e.pid)}: ${e.msg}`, tone: e.msg.startsWith('-') || /Armadilha|azar|Faltam/.test(e.msg) ? 'bad' : 'good' };
      else if (e.t === 'starBuy') out = { text: `${name(e.pid)} comprou a estrela!`, tone: 'good' };
      else if (e.t === 'note') out = { text: e.msg, tone: e.tone ?? 'info' };
      else if (e.t === 'minigame') out = { text: e.context === 'tile' ? 'Minigame extra!' : 'Hora do minigame!', tone: 'info' };
      else if (e.t === 'turn' && !out) out = { text: `Vez de ${name(e.pid)}`, tone: 'info' };
    }
    return out;
  }
  drainGame(): GameUpdate[] { return this.pending.splice(0); }
  roll() { this.socket.emit('game:roll'); }
  choose(tile: string) { this.socket.emit('game:choose', tile); }
  buy(yes: boolean) { this.socket.emit('game:buy', yes); }
  act(intent: Intent) { this.socket.emit('game:act', intent); }
  toggleAim() { this.set({ aimMode: !this.state.aimMode }); }
  sendInput(input: unknown) {
    const key = JSON.stringify(input);
    const now = performance.now();
    if (key === this.lastSent && now - this.lastSentAt < 100) return;
    this.lastSent = key; this.lastSentAt = now;
    this.socket.emit('mg:input', { seq: this.mgSeq++, input });
  }
  private mgSeq = 0;

  setCharacter(id: string) { this.socket.emit('room:setCharacter', id); }
  setReady(ready: boolean) { this.socket.emit('room:setReady', ready); }
  setBot(slot: Slot, difficulty: BotDifficulty) { this.socket.emit('room:setBot', { slot, difficulty }); }
  start() { this.socket.emit('room:start'); }
  backToLobby() { this.socket.emit('room:backToLobby'); }
  leave() { this.socket.emit('room:leave'); this.clearSession(); this.latest = null; this.pending = []; this.set({ you: null, room: null, game: null, intro: null, result: null, countdown: null, lobby: null, toast: null }); }
  dispose() { this.socket.removeAllListeners(); this.socket.disconnect(); this.listeners.clear(); }
}
