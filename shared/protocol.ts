import type { BotDifficulty, ParticipantInfo, PlayerId, Slot } from './types';
import type { MinigameMeta, MinigameResult } from './minigame';

export type LabPhase = 'lobby' | 'intro' | 'countdown' | 'active' | 'result';

export interface LabConfig {
  minigameId: string;
  difficulty: BotDifficulty;
  seed: number;
}

export interface LabLobby {
  code: string;
  phase: LabPhase;
  hostId: PlayerId;
  config: LabConfig;
  participants: ParticipantInfo[];
  minigames: MinigameMeta[];
  matchNo: number;
}

export interface Snapshot { tick: number; timeLeftMs: number; scores: Record<PlayerId, number>; state: unknown }

export interface ResultPayload {
  rewardEventId: string; // id único: a recompensa só pode ser aplicada uma vez
  result: MinigameResult;
  rewards: Record<PlayerId, number>;
}

export type RoomPhase = 'lobby' | 'started';

export interface RoomState {
  code: string;
  phase: RoomPhase;
  hostId: PlayerId;
  participants: ParticipantInfo[];
  board: { id: string; name: string };
  startBlockedReason: string | null; // null = pode iniciar
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface ClientToServerEvents {
  'lab:create': (cfg: Partial<LabConfig> & { name?: string }, ack: (r: Ack<{ you: PlayerId; lobby: LabLobby }>) => void) => void;
  'lab:join': (p: { code: string; name?: string }, ack: (r: Ack<{ you: PlayerId; lobby: LabLobby }>) => void) => void;
  'lab:rejoin': (p: { code: string; you: PlayerId }, ack: (r: Ack<{ you: PlayerId; lobby: LabLobby }>) => void) => void;
  'lab:setConfig': (cfg: Partial<LabConfig>) => void;
  'lab:start': () => void;
  'lab:restart': () => void;
  'lab:simulate': (cfg: Partial<LabConfig>, ack: (r: Ack<{ result: MinigameResult; rewards: Record<PlayerId, number>; ticks: number; players: ParticipantInfo[] }>) => void) => void;
  'mg:input': (p: { seq: number; input: unknown }) => void;

  // ---- sala de jogo (lobby de 4 vagas com bots) ----
  'room:create': (p: { name?: string }, ack: (r: Ack<{ you: PlayerId; room: RoomState }>) => void) => void;
  'room:join': (p: { code: string; name?: string }, ack: (r: Ack<{ you: PlayerId; room: RoomState }>) => void) => void;
  'room:rejoin': (p: { code: string; you: PlayerId }, ack: (r: Ack<{ you: PlayerId; room: RoomState }>) => void) => void;
  'room:setCharacter': (characterId: string) => void;
  'room:setReady': (ready: boolean) => void;
  'room:setBot': (p: { slot: Slot; difficulty: BotDifficulty }) => void;
  'room:start': () => void;
  'room:backToLobby': () => void;
  'room:leave': () => void;
}

export interface ServerToClientEvents {
  'lab:lobby': (l: LabLobby) => void;
  'mg:intro': (p: { meta: MinigameMeta; participants: ParticipantInfo[]; durationMs: number }) => void;
  'mg:countdown': (n: number) => void; // 3,2,1,0(=GO)
  'mg:snapshot': (s: Snapshot) => void;
  'mg:result': (r: ResultPayload) => void;
  'lab:error': (msg: string) => void;
  'room:state': (s: RoomState) => void;
  'room:error': (msg: string) => void;
}

// Dados anexados ao socket pelo servidor.
declare module 'socket.io' {
  interface SocketData { roomCode?: string; playerId?: string; gameCode?: string; gameId?: string }
}
