import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomState, ServerToClientEvents } from '@shared/protocol';
import type { BotDifficulty, PlayerId, Slot } from '@shared/types';

export interface RoomClientState { connected: boolean; you: PlayerId | null; room: RoomState | null; error: string | null }
type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const SESSION_KEY = 'pixel-party:room-session';

/** Cliente da sala de jogo. Guarda a vaga na aba para retomar após queda de conexão. */
export class RoomClient {
  private socket: AppSocket;
  private listeners = new Set<() => void>();
  private errorTimer: ReturnType<typeof setTimeout> | null = null;
  state: RoomClientState = { connected: false, you: null, room: null, error: null };

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
  setCharacter(id: string) { this.socket.emit('room:setCharacter', id); }
  setReady(ready: boolean) { this.socket.emit('room:setReady', ready); }
  setBot(slot: Slot, difficulty: BotDifficulty) { this.socket.emit('room:setBot', { slot, difficulty }); }
  start() { this.socket.emit('room:start'); }
  backToLobby() { this.socket.emit('room:backToLobby'); }
  leave() { this.socket.emit('room:leave'); this.clearSession(); this.set({ you: null, room: null }); }
  dispose() { this.socket.removeAllListeners(); this.socket.disconnect(); this.listeners.clear(); }
}
