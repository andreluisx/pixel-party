import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, LabConfig, LabLobby, ResultPayload, ServerToClientEvents, Snapshot } from '@shared/protocol';
import type { MinigameMeta } from '@shared/minigame';
import type { ParticipantInfo, PlayerId } from '@shared/types';

export interface LabState {
  connected: boolean;
  you: PlayerId | null;
  lobby: LabLobby | null;
  intro: { meta: MinigameMeta; participants: ParticipantInfo[]; durationMs: number } | null;
  countdown: number | null; // 3,2,1,0
  result: ResultPayload | null;
  error: string | null;
  snapsPerSec: number;
}

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const SESSION_KEY = 'pixel-party:lab-session';

/** Cliente de rede. O servidor decide tudo; aqui só enviamos inputs e exibimos snapshots. */
export class LabClient {
  private socket: AppSocket;
  private listeners = new Set<() => void>();
  private snapCount = 0;
  private snapTimer: ReturnType<typeof setInterval> | null = null;
  state: LabState = { connected: false, you: null, lobby: null, intro: null, countdown: null, result: null, error: null, snapsPerSec: 0 };

  // Lidos pela cena Phaser a cada frame (não passam pelo React).
  latest: Snapshot | null = null;
  touch = { dx: 0, dy: 0 };
  private seq = 0;
  private lastSent = '';
  private lastSentAt = 0;
  onSnapshotEvents: Array<(s: Snapshot) => void> = [];

  constructor(url?: string) {
    const target = url ?? process.env.NEXT_PUBLIC_SERVER_URL ?? `${window.location.protocol}//${window.location.hostname}:3001`;
    this.socket = io(target, { transports: ['websocket', 'polling'], reconnectionDelay: 500 });
    const s = this.socket;
    s.on('connect', () => {
      this.set({ connected: true, error: null });
      const saved = this.loadSession();
      if (saved && !this.state.lobby) this.rejoin(saved.code, saved.you);
      else if (saved && this.state.lobby) this.rejoin(saved.code, saved.you); // reconexão: recupera a vaga
    });
    s.on('disconnect', () => this.set({ connected: false }));
    s.on('connect_error', () => this.set({ connected: false, error: 'Sem conexão com o servidor. Ele está rodando? (npm run dev)' }));
    s.on('lab:lobby', (lobby) => {
      const patch: Partial<LabState> = { lobby };
      if (lobby.phase === 'lobby') { patch.intro = null; patch.countdown = null; patch.result = null; this.latest = null; }
      this.set(patch);
    });
    s.on('mg:intro', (intro) => { this.latest = null; this.set({ intro, result: null, countdown: null }); });
    s.on('mg:countdown', (n) => this.set({ countdown: n }));
    s.on('mg:snapshot', (snap) => { this.latest = snap; this.snapCount++; this.onSnapshotEvents.forEach((f) => f(snap)); });
    s.on('mg:result', (result) => this.set({ result, countdown: null }));
    s.on('lab:error', (error) => this.set({ error }));
    this.snapTimer = setInterval(() => { this.set({ snapsPerSec: this.snapCount }); this.snapCount = 0; }, 1000);
  }

  // ---- store (useSyncExternalStore) ----
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getState = () => this.state;
  private set(patch: Partial<LabState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((l) => l()); }

  private saveSession(code: string, you: PlayerId) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, you })); } catch { /* ok */ } }
  private loadSession(): { code: string; you: PlayerId } | null { try { const v = sessionStorage.getItem(SESSION_KEY); return v ? JSON.parse(v) : null; } catch { return null; } }
  private clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ok */ } }

  // ---- ações ----
  create(name: string, cfg: Partial<LabConfig>) {
    this.socket.emit('lab:create', { ...cfg, name }, (r) => {
      if (!r.ok) return this.set({ error: r.error });
      this.saveSession(r.lobby.code, r.you);
      this.set({ you: r.you, lobby: r.lobby, error: null });
    });
  }
  join(code: string, name: string) {
    this.socket.emit('lab:join', { code: code.trim().toUpperCase(), name }, (r) => {
      if (!r.ok) return this.set({ error: r.error });
      this.saveSession(r.lobby.code, r.you);
      this.set({ you: r.you, lobby: r.lobby, error: null });
    });
  }
  private rejoin(code: string, you: PlayerId) {
    this.socket.emit('lab:rejoin', { code, you }, (r) => {
      if (!r.ok) { this.clearSession(); this.set({ you: null, lobby: null }); return; }
      this.set({ you: r.you, lobby: r.lobby, error: null });
    });
  }
  leave() { this.clearSession(); this.socket.disconnect(); this.set({ you: null, lobby: null, intro: null, countdown: null, result: null }); this.latest = null; this.socket.connect(); }
  setConfig(cfg: Partial<LabConfig>) { this.socket.emit('lab:setConfig', cfg); }
  start() { this.socket.emit('lab:start'); }
  restart() { this.socket.emit('lab:restart'); }
  simulate(cfg: Partial<LabConfig>) {
    return new Promise<Parameters<Parameters<ClientToServerEvents['lab:simulate']>[1]>[0]>((res) => this.socket.emit('lab:simulate', cfg, res));
  }
  dismissError() { this.set({ error: null }); }

  /** Chamado pela cena a cada frame; só envia quando muda (ou a cada 100 ms como batimento). */
  sendInput(dx: number, dy: number) {
    const key = `${dx},${dy}`;
    const now = performance.now();
    if (key === this.lastSent && now - this.lastSentAt < 100) return;
    this.lastSent = key; this.lastSentAt = now;
    this.socket.emit('mg:input', { seq: this.seq++, input: { dx, dy } });
  }

  dispose() { if (this.snapTimer) clearInterval(this.snapTimer); this.socket.removeAllListeners(); this.socket.disconnect(); this.listeners.clear(); }
}
